const { runSQLQuerySqlServer, withSqlTransaction } = require('./access');
const { createHttpError } = require('../utils');

const DATABASE = 'BMS';
function schemaError(error) {
  if (error?.number === 208 || error?.originalError?.info?.number === 208) {
    throw createHttpError(503, 'Die Datenbankmigration für Lieferadress-Vorgänge fehlt.', { code: 'DELIVERY_ADDRESS_SCHEMA_MISSING' });
  }
  throw error;
}

function createDeliveryAddressHistory({ transact = withSqlTransaction, runQuery = runSQLQuerySqlServer } = {}) {
  async function reserve(context) {
    const { operationId, customerId, database, identity, normalized, settings } = context;
    try {
      return await transact(DATABASE, async ({ query }) => {
        const lease = Math.max(120, Math.ceil(2 * (settings.timeoutMs || 30000) / 1000) + 60);
        const result = await query(`SELECT *, CASE WHEN [LockedAt] > DATEADD(SECOND, -?, SYSUTCDATETIME()) THEN 1 ELSE 0 END AS [IsLocked]
          FROM [BMSApp].[DeliveryAddressOperation] WITH (UPDLOCK, HOLDLOCK) WHERE [OperationId]=?`, [lease, operationId]);
        const row = result.rows[0];
        if (row) {
          if (row.UserId.toLowerCase() !== identity.userId.toLowerCase() || row.Mandant !== database.shortName
            || row.CustomerNumber !== customerId || row.RequestHash !== normalized.hash) {
            throw createHttpError(409, 'Dieser Vorgangsschlüssel gehört zu anderen Eingaben oder einem anderen Benutzer.', { code: 'DELIVERY_ADDRESS_KEY_REUSED', state: 'unknown' });
          }
          if (['created', 'failed'].includes(row.Status)) {
            return { replay: true, status: row.HttpStatus, data: JSON.parse(row.ResponseJson), state: row.Status,
              outcome: row.Status === 'created' ? { id: row.AddressId, erpOperationId: row.ErpOperationId } : null };
          }
          if (row.Status === 'sending' && row.IsLocked) {
            throw createHttpError(409, 'Die Lieferadressanlage läuft noch. Bitte denselben Vorgang später wiederholen.', { code: 'DELIVERY_ADDRESS_RUNNING', state: 'unknown' });
          }
        } else {
          await query(`INSERT INTO [BMSApp].[DeliveryAddressOperation]
            ([OperationId],[UserId],[Mandant],[CustomerNumber],[RequestHash],[InputJson],[RequestJson],[Status])
            VALUES (?,?,?,?,?,?,?,N'sending')`,
          [operationId, identity.userId, database.shortName, customerId, normalized.hash, JSON.stringify(normalized.input), JSON.stringify(normalized.payload)]);
        }
        await query(`UPDATE [BMSApp].[DeliveryAddressOperation] SET [Status]=N'sending',[LockedAt]=SYSUTCDATETIME(),
          [AttemptCount]=[AttemptCount]+1,[UpdatedAt]=SYSUTCDATETIME() WHERE [OperationId]=?`, [operationId]);
        return { replay: false, retry: Boolean(row), payload: row ? JSON.parse(row.RequestJson) : normalized.payload };
      });
    } catch (error) { schemaError(error); }
  }

  async function finish(operationId, response, state, outcome) {
    await runQuery(DATABASE, `UPDATE [BMSApp].[DeliveryAddressOperation]
      SET [Status]=?,[HttpStatus]=?,[ResponseJson]=?,[AddressId]=?,[ErpOperationId]=?,[LockedAt]=NULL,[UpdatedAt]=SYSUTCDATETIME()
      WHERE [OperationId]=?`, [state, response.status, JSON.stringify(response.data), outcome?.id ?? null, outcome?.erpOperationId || null, operationId]);
  }

  async function loadPending(userId, mandant, customerId) {
    try {
      const rows = await runQuery(DATABASE, `SELECT TOP (1) [OperationId],[InputJson]
        FROM [BMSApp].[DeliveryAddressOperation] WHERE [UserId]=? AND [Mandant]=? AND [CustomerNumber]=?
          AND [Status] IN (N'sending',N'unknown') ORDER BY [CreatedAt] DESC`, [userId, mandant, customerId]);
      return rows[0] ? { id: rows[0].OperationId, body: JSON.parse(rows[0].InputJson) } : null;
    } catch (error) { schemaError(error); }
  }

  async function load(operationId, userId, mandant, customerId) {
    try {
      const rows = await runQuery(DATABASE, `SELECT [Status],[HttpStatus],[ResponseJson],[AddressId],[ErpOperationId]
        FROM [BMSApp].[DeliveryAddressOperation] WHERE [OperationId]=? AND [UserId]=? AND [Mandant]=? AND [CustomerNumber]=?`,
      [operationId, userId, mandant, customerId]);
      const row = rows[0];
      return row ? { state: row.Status, status: row.HttpStatus, response: row.ResponseJson ? JSON.parse(row.ResponseJson) : null,
        outcome: row.Status === 'created' ? { id: row.AddressId, erpOperationId: row.ErpOperationId } : null } : null;
    } catch (error) { schemaError(error); }
  }

  return { reserve, finish, loadPending, load };
}

module.exports = { ...createDeliveryAddressHistory(), createDeliveryAddressHistory };
