const { createHttpError } = require('../utils');
const { productAvailabilitySource } = require('../db/product-availability');
const { buildTempOrderPlanningQuery } = require('../db/temp-order-planning');
const { lockTempOrderAvailability } = require('../db/temp-order-availability');
const { dbIdentifier } = require('./storage');
const { parseMandantIdFromBeNumber } = require('../mandant-prefix');

// Runs on the central transaction: stock claims and the offer commit atomically.
async function synchronizeReservations(
  query,
  req,
  offerId,
  oldPositions,
  positions,
) {
  if (![...oldPositions, ...positions].some((p) => p.reserve)) return;
  await lockTempOrderAvailability(query, req.database.firmaId);
  const db = dbIdentifier(req.database.databaseName);
  const table = `${db}.[dbo].[tblBest_Pos_Reserviert]`;
  const source = productAvailabilitySource('v').replaceAll(
    '[dbo].',
    `${db}.[dbo].`,
  );
  const owner = req.userIdentity.shortCode;
  const seen = new Set();
  const conflict = () => {
    throw createHttpError(
      409,
      'Die Reservierung wurde außerhalb dieses Angebots geändert. Bitte den Reservierungsstand prüfen.',
      { code: 'OFFER_RESERVATION_CHANGED' },
    );
  };
  for (const old of oldPositions.filter((p) => p.reserve)) {
    const current = (
      await query(
        `SELECT sys.fn_varbintohexstr(zz_rowver) AS version,bePR_reserviertVon AS owner FROM ${table} WITH (UPDLOCK,HOLDLOCK) WHERE bePR_BEposID=? AND bePR_LagerID=?`,
        [old.beNumber, old.warehouseId],
      )
    ).rows[0];
    if (!current) {
      if (
        positions.some(
          (p) =>
            p.reserve && p.lineKey.toLowerCase() === old.lineKey.toLowerCase(),
        )
      )
        conflict();
      continue;
    }
    if (
      current.version !== old.reservationVersion ||
      String(current.owner).toLowerCase() !== owner.toLowerCase()
    )
      conflict();
    await query(
      `DELETE FROM ${table} WHERE bePR_BEposID=? AND bePR_LagerID=?`,
      [old.beNumber, old.warehouseId],
    );
  }
  for (const p of positions.filter((p) => p.reserve)) {
    const sourceMandant = parseMandantIdFromBeNumber(p.beNumber);
    if (
      sourceMandant !== null &&
      Number(sourceMandant) !== Number(req.database.firmaId)
    ) {
      throw createHttpError(403, 'Fremde VL-Mandanten sind nur lesbar.', {
        code: 'FOREIGN_VL_READ_ONLY',
      });
    }
    const key = `${p.beNumber}|${p.warehouseId}`;
    if (seen.has(key))
      throw createHttpError(
        400,
        'Eine Bestandsposition darf innerhalb des Angebots nur einmal reserviert werden. Bei Mengenstaffeln eine Reservierungsmenge wählen.',
        { code: 'DUPLICATE_OFFER_RESERVATION' },
      );
    seen.add(key);
    const existing = (
      await query(
        `SELECT bePR_BEposID FROM ${table} WITH (UPDLOCK,HOLDLOCK) WHERE bePR_BEposID=? AND bePR_LagerID=?`,
        [p.beNumber, p.warehouseId],
      )
    ).rows;
    if (existing.length)
      throw createHttpError(
        409,
        'Für diese Bestandsposition besteht bereits eine Reservierung.',
        { code: 'RESERVATION_ALREADY_EXISTS' },
      );
    const stock = (
      await query(
        `SELECT [Menge] AS amount,[beP_Artikelindex] AS articleIndex,[Einheit] AS unit FROM ${source} WHERE [Bestell-Pos]=? AND [bePL_LagerID]=?`,
        [p.beNumber, p.warehouseId],
      )
    ).rows[0];
    if (
      !stock ||
      stock.articleIndex !== p.articleIndex ||
      !/^kg$/i.test(String(stock.unit).trim())
    )
      throw createHttpError(
        400,
        'Bestandsposition passt nicht zum Artikel oder zur Einheit.',
        { code: 'INVALID_OFFER_RESERVATION_SOURCE' },
      );
    const plan = buildTempOrderPlanningQuery({
      companyId: req.database.firmaId,
      keys: [p],
    });
    const planned = (await query(plan.sql, plan.params)).rows.reduce(
      (sum, row) => sum + Number(row.amountInKg || 0),
      0,
    );
    const available = Math.max(Number(stock.amount) - planned, 0);
    if (p.reserveQuantity > available + 0.000001)
      throw createHttpError(
        409,
        `Reservierungsmenge überschreitet die verfügbare Menge (${available} kg).`,
        { code: 'RESERVATION_AMOUNT_EXCEEDS_AVAILABLE' },
      );
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Berlin',
    }).format(new Date());
    if (p.reserveUntil < today)
      throw createHttpError(
        400,
        'Reservierungsende liegt in der Vergangenheit.',
        { code: 'INVALID_RESERVATION_END_DATE' },
      );
    const note = `Reserviert für App-Angebot AN-${offerId}, Kunde ${req.offerCustomerId}, erstellt von ${owner}.`;
    const created = await query(
      `INSERT INTO ${table} (bePR_BEposID,bePR_LagerID,bePR_gewaehlt,bePR_gewaehltWER,bePR_reserviertVon,bePR_gueltigBis,bePR_Anzahl,bePR_Notiz,bePR_LastUpdate)
      OUTPUT INSERTED.zz_rowver AS version VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        p.beNumber,
        p.warehouseId,
        true,
        'APP',
        owner,
        `${p.reserveUntil}T23:59:59`,
        p.reserveQuantity,
        note,
        `${owner} ${new Date().toISOString()}`.slice(0, 50),
      ],
    );
    p.reservationVersion = `0x${created.rows[0].version.toString('hex')}`;
  }
}
module.exports = { synchronizeReservations };
