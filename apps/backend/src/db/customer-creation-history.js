const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { createHttpError } = require('../utils');
const { isCustomerRollbackPreviewExecutable } = require('../customer-creation-policy');

// Deliberately fixed to the authorized central database and app-owned schema.
const DATABASE = 'BMS';
function requireHistorySchema(error) {
  if (error?.number === 208 || error?.originalError?.info?.number === 208) {
    throw createHttpError(503, 'Die Datenbankmigration für die Kundenanlage-Historie fehlt.', { code: 'CUSTOMER_CREATION_SCHEMA_MISSING' });
  }
  throw error;
}
async function reserveCreation({ operationId, identity, database, normalized, settings }) {
  try {
    return await withSqlTransaction(DATABASE, async ({ query }) => {
      const leaseSeconds = Math.max(120, Math.ceil(settings.timeoutMs / 1000) + 60);
      const result = await query(`
        SELECT *, CASE WHEN [LockedAt] > DATEADD(SECOND, -?, SYSUTCDATETIME()) THEN 1 ELSE 0 END AS [IsLocked]
        FROM [BMSApp].[CustomerCreation] WITH (UPDLOCK, HOLDLOCK) WHERE [OperationId] = ?
      `, [leaseSeconds, operationId]);
      let row = result.rows[0];
      if (row) {
        if (row.UserId.toLowerCase() !== identity.userId.toLowerCase()
          || Number(row.TargetCompanyId) !== Number(database.firmaId) || row.RequestHash !== normalized.hash) {
          throw createHttpError(409, 'Dieser Vorgangsschlüssel gehört zu anderen Daten oder einem anderen Benutzer.', { code: 'CUSTOMER_CREATION_KEY_REUSED' });
        }
        if (['created', 'partial', 'failed'].includes(row.Status)) {
          const snapshot = await query(`SELECT TOP (1) [DataJson] FROM [BMSApp].[CustomerCreationSnapshot]
            WHERE [OperationId] = ? AND [Kind] = N'response' ORDER BY [Id] DESC`, [operationId]);
          return { replay: true, status: row.HttpStatus, data: JSON.parse(snapshot.rows[0].DataJson), state: row.Status };
        }
        if (row.Status === 'sending' && row.IsLocked) {
          throw createHttpError(409, 'Die Kundenanlage läuft noch. Bitte diesen Vorgang unverändert wiederholen.', { code: 'CUSTOMER_CREATION_RUNNING', operationId });
        }
      } else {
        await query(`INSERT INTO [BMSApp].[CustomerCreation]
          ([OperationId],[UserId],[UserShortCode],[TargetCompanyId],[TargetMandant],[StammMandant],[RequestHash],[PrivatePerson],[CountryIso],[Status])
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, N'pending')`,
        [operationId, identity.userId, identity.shortCode, database.firmaId, database.shortName, settings.stammMandant, normalized.hash, normalized.privatePerson, normalized.countryIso]);
        await query(`INSERT INTO [BMSApp].[CustomerCreationSnapshot] ([OperationId],[Kind],[DataJson]) VALUES (?,N'request',?)`,
          [operationId, JSON.stringify(normalized.payload)]);
      }
      await query(`UPDATE [BMSApp].[CustomerCreation] SET [Status]=N'sending', [LockedAt]=SYSUTCDATETIME(),
        [AttemptCount]=[AttemptCount]+1, [UpdatedAt]=SYSUTCDATETIME() WHERE [OperationId]=?`, [operationId]);
      return { replay: false };
    });
  } catch (error) { requireHistorySchema(error); }
}

async function finishCreation(operationId, response, state) {
  return withSqlTransaction(DATABASE, async ({ query }) => {
    const created = state === 'created' || state === 'partial';
    await query(`INSERT INTO [BMSApp].[CustomerCreationSnapshot] ([OperationId],[Kind],[DataJson]) VALUES (?,N'response',?)`,
      [operationId, JSON.stringify(response.data)]);
    await query(`UPDATE [BMSApp].[CustomerCreation] SET [Status]=?,[HttpStatus]=?,[ErrorCode]=?,[ErpOperationId]=?,
      [CustomerNumber]=?,[CustomerName]=?,[LockedAt]=NULL,[UpdatedAt]=SYSUTCDATETIME() WHERE [OperationId]=?`,
    [state, response.status, response.data?.code || null, response.data?.vorgangId || null,
      created ? response.data.kundennummer : null, created ? response.data.uebernommen?.name1 : null, operationId]);
    if (created) {
      const entries = [{ mandant: response.data.mandant, status: 'angelegt' }, ...(response.data.kopien || [])];
      for (const entry of entries) {
        await query(`INSERT INTO [BMSApp].[CustomerCreationMandant] ([OperationId],[Mandant],[Status],[CustomerNumber],[ResultJson])
          VALUES (?,?,?,?,?)`, [operationId, entry.mandant, entry.status, response.data.kundennummer, JSON.stringify(entry)]);
      }
    }
  });
}

async function loadCreationOperation(operationId, userId, companyId) {
  const rows = await runSQLQuerySqlServer(DATABASE, `SELECT [o].[OperationId],[o].[Status],[o].[HttpStatus],
      (SELECT TOP (1) [DataJson] FROM [BMSApp].[CustomerCreationSnapshot] WHERE [OperationId]=[o].[OperationId] AND [Kind]=N'response' ORDER BY [Id] DESC) AS [ResponseJson]
    FROM [BMSApp].[CustomerCreation] [o] WHERE [o].[OperationId]=? AND [o].[UserId]=? AND [o].[TargetCompanyId]=?`, [operationId, userId, companyId]);
  const row = rows[0];
  return row ? { operationId: row.OperationId, state: row.Status, status: row.HttpStatus, response: row.ResponseJson ? JSON.parse(row.ResponseJson) : null } : null;
}

async function loadDeveloperCreatedCustomers(mandant) {
  try {
    return await runSQLQuerySqlServer(DATABASE, `
      SELECT [o].[OperationId] AS [operationId], [o].[ErpOperationId] AS [erpOperationId],
        [o].[UserShortCode] AS [createdBy], [o].[CustomerNumber] AS [customerNumber],
        [o].[CustomerName] AS [customerName], [o].[CreatedAt] AS [createdAt],
        [o].[Status] AS [creationStatus], [r].[RollbackId] AS [rollbackId],
        [r].[Status] AS [rollbackStatus], [r].[Reason] AS [rollbackReason],
        [r].[PreviewJson] AS [rollbackPreviewJson]
      FROM [BMSApp].[CustomerCreation] [o]
      INNER JOIN [BMSApp].[CustomerCreationMandant] [m] ON [m].[OperationId]=[o].[OperationId]
      OUTER APPLY (
        SELECT TOP (1) [x].[RollbackId], [x].[Status], [x].[Reason], [x].[PreviewJson], [x].[ResponseJson]
        FROM [BMSApp].[CustomerCreationRollback] [x]
        WHERE [x].[OperationId]=[o].[OperationId]
        ORDER BY [x].[CreatedAt] DESC,[x].[RollbackId] DESC
      ) [r]
      WHERE [m].[Mandant]=? AND [m].[Status]=N'angelegt'
        AND [o].[Status] IN (N'created',N'partial') AND [o].[ErpOperationId] IS NOT NULL
        AND [o].[CustomerNumber] IS NOT NULL AND UPPER(LTRIM(RTRIM([o].[UserShortCode]))) IN (N'MFR',N'NSC')
        AND COALESCE([r].[Status], N'') <> N'completed'
      ORDER BY [o].[CreatedAt] DESC, [o].[OperationId] DESC`, [mandant]);
  } catch (error) { requireHistorySchema(error); }
}

async function loadLatestResumableRollback(operationId) {
  try {
    const rows = await runSQLQuerySqlServer(DATABASE, `
      SELECT TOP (1) [RollbackId] AS [rollbackId], [OperationId] AS [operationId],
        [Mandant] AS [mandant], [Status] AS [status], [Reason] AS [reason],
        [PreviewJson] AS [previewJson]
      FROM [BMSApp].[CustomerCreationRollback]
      WHERE [OperationId]=? AND [Status] IN (N'partial',N'unknown',N'sending')
      ORDER BY [CreatedAt] DESC,[RollbackId] DESC`, [operationId]);
    const row = rows[0];
    return row ? { ...row, preview: row.previewJson ? JSON.parse(row.previewJson) : null } : null;
  } catch (error) { requireHistorySchema(error); }
}

async function loadRollbackTarget(operationId, mandant) {
  try {
    const rows = await runSQLQuerySqlServer(DATABASE, `
      SELECT TOP (1) [o].[OperationId] AS [operationId], [o].[ErpOperationId] AS [erpOperationId],
        [o].[UserShortCode] AS [createdBy], [o].[CustomerNumber] AS [customerNumber],
        [o].[CustomerName] AS [customerName], [o].[CreatedAt] AS [createdAt], [m].[Mandant] AS [mandant]
      FROM [BMSApp].[CustomerCreation] [o]
      INNER JOIN [BMSApp].[CustomerCreationMandant] [m] ON [m].[OperationId]=[o].[OperationId]
      WHERE [o].[OperationId]=? AND [m].[Mandant]=? AND [m].[Status]=N'angelegt'
        AND [o].[Status] IN (N'created',N'partial') AND [o].[ErpOperationId] IS NOT NULL
        AND UPPER(LTRIM(RTRIM([o].[UserShortCode]))) IN (N'MFR',N'NSC')`, [operationId, mandant]);
    return rows[0] || null;
  } catch (error) { requireHistorySchema(error); }
}

async function saveRollbackPreview({ rollbackId, operationId, mandant, identity, preview }) {
  try {
    await runSQLQuerySqlServer(DATABASE, `
      INSERT INTO [BMSApp].[CustomerCreationRollback]
        ([RollbackId],[OperationId],[Mandant],[StartedByUserId],[StartedByShortCode],
         [LastActorUserId],[LastActorShortCode],[Status],[PreviewJson])
      VALUES (?,?,?,?,?,?,?,N'preview',?)`, [
      rollbackId, operationId, mandant, identity.userId, identity.shortCode,
      identity.userId, identity.shortCode, JSON.stringify(preview),
    ]);
  } catch (error) { requireHistorySchema(error); }
}

async function reserveRollback({ rollbackId, operationId, identity, reason, leaseSeconds = 180 }) {
  try {
    return await withSqlTransaction(DATABASE, async ({ query }) => {
      // Serialize all rollback attempts for one ERP creation, including copies
      // in other mandants. The ERP operation may remove all of them at once.
      await query(`SELECT [OperationId] FROM [BMSApp].[CustomerCreation] WITH (UPDLOCK,HOLDLOCK) WHERE [OperationId]=?`, [operationId]);
      const completed = await query(`SELECT TOP (1) [RollbackId],[HttpStatus],[ResponseJson]
        FROM [BMSApp].[CustomerCreationRollback] WITH (UPDLOCK,HOLDLOCK)
        WHERE [OperationId]=? AND [Status]=N'completed' ORDER BY [CreatedAt] DESC,[RollbackId] DESC`, [operationId]);
      if (completed.rows[0] && String(completed.rows[0].RollbackId).toLowerCase() !== String(rollbackId).toLowerCase()) {
        return {
          replay: true,
          status: completed.rows[0].HttpStatus,
          data: completed.rows[0].ResponseJson ? JSON.parse(completed.rows[0].ResponseJson) : null,
          state: 'completed',
        };
      }
      const active = await query(`SELECT TOP (1) [RollbackId],[Status] FROM [BMSApp].[CustomerCreationRollback] WITH (UPDLOCK,HOLDLOCK)
        WHERE [OperationId]=? AND [Status] IN (N'partial',N'unknown',N'sending') AND [RollbackId]<>?
        ORDER BY [CreatedAt] DESC,[RollbackId] DESC`, [operationId, rollbackId]);
      if (active.rows[0]) {
        throw createHttpError(409, 'Für diesen Anlagevorgang läuft bereits ein Rückbau. Bitte denselben Rückbauvorgang fortsetzen.', {
          code: 'CUSTOMER_ROLLBACK_EXISTING_IN_PROGRESS', rollbackId: active.rows[0].RollbackId, state: active.rows[0].Status,
        });
      }
      const result = await query(`
        SELECT *, CASE WHEN [LockedAt] > DATEADD(SECOND,-?,SYSUTCDATETIME()) THEN 1 ELSE 0 END AS [IsLocked]
        FROM [BMSApp].[CustomerCreationRollback] WITH (UPDLOCK,HOLDLOCK) WHERE [RollbackId]=?`, [leaseSeconds, rollbackId]);
      const row = result.rows[0];
      if (!row || String(row.OperationId).toLowerCase() !== String(operationId).toLowerCase()) {
        throw createHttpError(404, 'Rückbauvorschau nicht gefunden. Bitte erst eine neue Vorschau laden.', { code: 'CUSTOMER_ROLLBACK_PREVIEW_NOT_FOUND' });
      }
      if (row.Status === 'completed') {
        const stored = row.ResponseJson ? JSON.parse(row.ResponseJson) : null;
        return { replay: true, status: row.HttpStatus, data: stored, state: row.Status };
      }
      if (!['preview', 'partial', 'unknown', 'sending'].includes(row.Status)) {
        throw createHttpError(409, 'Dieser Rückbau ist abgeschlossen oder gesperrt. Bitte eine neue Vorschau laden.', { code: 'CUSTOMER_ROLLBACK_NOT_RESUMABLE', state: row.Status });
      }
      if (row.Status === 'sending' && row.IsLocked) {
        throw createHttpError(409, 'Der Rückbau läuft noch. Bitte denselben Vorgang später erneut fortsetzen.', { code: 'CUSTOMER_ROLLBACK_RUNNING' });
      }
      const preview = JSON.parse(row.PreviewJson || '{}');
      if (!['partial', 'unknown', 'sending'].includes(row.Status) && !isCustomerRollbackPreviewExecutable(preview)) {
        throw createHttpError(409, 'Die ERP-Vorschau gibt den Rückbau nicht frei.', { code: 'CUSTOMER_ROLLBACK_PREVIEW_BLOCKED' });
      }
      const requestedReason = String(reason || '').trim();
      if (requestedReason.length < 10 || requestedReason.length > 500) {
        throw createHttpError(422, 'Die Begründung muss 10 bis 500 Zeichen enthalten.', { code: 'CUSTOMER_ROLLBACK_REASON_INVALID' });
      }
      if (row.Reason && row.Reason !== requestedReason) {
        throw createHttpError(409, 'Zum Fortsetzen muss dieselbe Begründung wie beim ersten Rückbauversuch verwendet werden.', { code: 'CUSTOMER_ROLLBACK_REASON_CHANGED' });
      }
      await query(`UPDATE [BMSApp].[CustomerCreationRollback] SET [Reason]=COALESCE([Reason],?),
        [LastActorUserId]=?,[LastActorShortCode]=?,[Status]=N'sending',[LockedAt]=SYSUTCDATETIME(),
        [AttemptCount]=[AttemptCount]+1,[UpdatedAt]=SYSUTCDATETIME() WHERE [RollbackId]=?`,
      [requestedReason, identity.userId, identity.shortCode, rollbackId]);
      return { replay: false, data: preview };
    });
  } catch (error) { requireHistorySchema(error); }
}

async function finishRollback(rollbackId, response, state) {
  await runSQLQuerySqlServer(DATABASE, `UPDATE [BMSApp].[CustomerCreationRollback]
    SET [Status]=?,[HttpStatus]=?,[ErrorCode]=?,[ResponseJson]=?,[LockedAt]=NULL,[UpdatedAt]=SYSUTCDATETIME()
    WHERE [RollbackId]=?`, [state, response.status || null, response.data?.code || null,
    JSON.stringify(response.data ?? null), rollbackId]);
}

async function isAppCreatedPrivateCustomer(database, customerId, name, countryIso) {
  try {
    const rows = await runSQLQuerySqlServer(DATABASE, `SELECT TOP (1) [o].[CustomerName]
      FROM [BMSApp].[CustomerCreation] [o] JOIN [BMSApp].[CustomerCreationMandant] [m] ON [m].[OperationId]=[o].[OperationId]
      WHERE [m].[Mandant]=? AND [m].[CustomerNumber]=? AND [m].[Status]=N'angelegt'
        AND [o].[PrivatePerson]=1 AND [o].[Status] IN (N'created',N'partial') AND [o].[CountryIso]=?
      ORDER BY [o].[CreatedAt] DESC`, [database.shortName, customerId, countryIso]);
    return rows.some((row) => String(row.CustomerName || '').trim().toUpperCase() === String(name || '').trim().toUpperCase());
  } catch (error) {
    // Before this optional migration, the established VAT requirement remains strict.
    if (error?.number === 208 || error?.originalError?.info?.number === 208) return false;
    throw error;
  }
}
module.exports = {
  reserveCreation,
  finishCreation,
  loadCreationOperation,
  loadDeveloperCreatedCustomers,
  loadLatestResumableRollback,
  loadRollbackTarget,
  saveRollbackPreview,
  reserveRollback,
  finishRollback,
  isAppCreatedPrivateCustomer,
};
