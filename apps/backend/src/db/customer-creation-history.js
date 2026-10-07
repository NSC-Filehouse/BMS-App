const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { createHttpError } = require('../utils');

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

async function loadCreationHistory(companyId) {
  try {
    return await runSQLQuerySqlServer(DATABASE, `SELECT TOP (50) [OperationId],[UserShortCode],[TargetMandant],[StammMandant],
      [CustomerNumber],[CustomerName],[Status],[ErrorCode],[ErpOperationId],[CreatedAt],[UpdatedAt]
      FROM [BMSApp].[CustomerCreation] WHERE [TargetCompanyId]=? ORDER BY [CreatedAt] DESC`, [companyId]);
  } catch (error) { requireHistorySchema(error); }
}
async function loadCreationOperation(operationId, userId, companyId) {
  const rows = await runSQLQuerySqlServer(DATABASE, `SELECT [o].[OperationId],[o].[Status],[o].[HttpStatus],
      (SELECT TOP (1) [DataJson] FROM [BMSApp].[CustomerCreationSnapshot] WHERE [OperationId]=[o].[OperationId] AND [Kind]=N'response' ORDER BY [Id] DESC) AS [ResponseJson]
    FROM [BMSApp].[CustomerCreation] [o] WHERE [o].[OperationId]=? AND [o].[UserId]=? AND [o].[TargetCompanyId]=?`, [operationId, userId, companyId]);
  const row = rows[0];
  return row ? { operationId: row.OperationId, state: row.Status, status: row.HttpStatus, response: row.ResponseJson ? JSON.parse(row.ResponseJson) : null } : null;
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
module.exports = { reserveCreation, finishCreation, loadCreationHistory, loadCreationOperation, isAppCreatedPrivateCustomer };
