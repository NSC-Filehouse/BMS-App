// Explicit live integration check: ALL offer/reservation writes roll back.
// No workers, mail, pushes, ERP import, or permanent business records.
const path = require('node:path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const access = require('../src/db/access');
const config = require('../src/config');
const { normalize } = require('../src/offers/values');
const {
  headerFields,
  positionFields,
  H,
  P,
  insert,
  read,
} = require('../src/offers/storage');
const { synchronizeReservations } = require('../src/offers/reservations');
const { productAvailabilitySource } = require('../src/db/product-availability');
const {
  loadTempOrderPlanning,
  getTempOrderPlanningEntry,
} = require('../src/db/temp-order-planning');
const rollback = new Error('ROLLBACK_OFFER_SMOKE');
async function main() {
  if (process.env.OFFER_SQL_SMOKE !== '1')
    throw Error('Set OFFER_SQL_SMOKE=1 to run this rollback-only SQL check.');
  const originalQuery = access.runSQLQuerySqlServer;
  const originalTransaction = access.withSqlTransaction;
  const customer = (
    await access.runSQLQueryAccess(
      { databaseName: 'BMS.TES' },
      'SELECT TOP 1 kd_KdNR,kd_Name1 FROM dbo.tblKunden ORDER BY kd_KdNR',
    )
  )[0];
  const article = (
    await access.runSQLQueryAccess(
      { databaseName: 'BMS.TES' },
      'SELECT TOP 1 agA_Artikelindex AS articleIndex,agA_Artikelname AS article FROM dbo.tblArt_Artikel WHERE COALESCE(agA_Deaktiv,0)=0 AND agA_Artikelname IS NOT NULL ORDER BY agA_Artikelindex',
    )
  )[0];
  assert.ok(
    customer && article,
    'Test tenant has a customer and active article',
  );
  let checkedId;
  try {
    await originalTransaction(config.sql.database, async ({ query }) => {
      access.runSQLQuerySqlServer = async (db, sql, params) =>
        db === config.sql.database
          ? (await query(sql, params)).rows
          : originalQuery(db, sql, params);
      access.withSqlTransaction = async (_db, work) => work({ query });
      const app = express();
      app.use(express.json());
      app.use('/api', require('../src/routes/temp-offers.routes'));
      app.use((e, req, res, next) =>
        res.status(e.status || 500).json({ error: e.message }),
      );
      const server = app.listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const url = `http://127.0.0.1:${server.address().port}/api`;
      async function call(
        route,
        method = 'GET',
        body,
        account = 'n.schroeder',
      ) {
        const res = await fetch(url + route, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-mandant': 'Test',
            'x-ms-client-samaccountname': account,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        if (res.status >= 500) throw Error(JSON.stringify(json));
        return { status: res.status, json };
      }
      try {
        const groups = await call('/temp-offers/article-groups');
        assert.equal(groups.status, 200);
        assert.ok(groups.json.data.length > 0);
        const articles = await call('/temp-offers/articles?pageSize=2');
        assert.equal(articles.status, 200);
        assert.ok(articles.json.meta.total > 0);
        const defaults = await call(
          `/temp-offers/customer-defaults/${customer.kd_KdNR}`,
        );
        assert.equal(defaults.status, 200);
        const body = {
          customerId: customer.kd_KdNR,
          offerDate: '2026-11-10',
          clientRequestId: crypto.randomUUID(),
          title: 'Rollback SQL smoke',
          positions: [
            {
              ...article,
              quantity: 11000,
              unit: 'KG',
              price: 2650,
              priceBasis: 1000,
            },
            {
              ...article,
              quantity: 5500,
              unit: 'KG',
              price: 2990,
              priceBasis: 1000,
            },
          ],
        };
        const created = await call('/temp-offers', 'POST', body);
        assert.equal(created.status, 201, JSON.stringify(created.json));
        checkedId = created.json.data.id;
        assert.equal(created.json.data.positions.length, 2);
        assert.equal(created.json.data.netAmount, 45595);
        const replay = await call('/temp-offers', 'POST', body);
        assert.equal(replay.json.data.id, checkedId);
        const list = await call(
          '/temp-offers?period=today&scope=year&year=2026',
        );
        assert.equal(list.status, 200);
        assert.ok(list.json.data.some((o) => o.id === checkedId));
        assert.equal(
          (await call(`/temp-offers/${checkedId}`, 'GET', undefined, 'm.frank'))
            .status,
          404,
        );
        const edited = await call(`/temp-offers/${checkedId}`, 'PUT', {
          ...body,
          title: 'Rollback edited',
          version: created.json.data.version,
        });
        assert.equal(edited.status, 200, JSON.stringify(edited.json));
        assert.equal(edited.json.data.positions.length, 2);
        assert.equal(
          (
            await call(`/temp-offers/${checkedId}`, 'PUT', {
              ...body,
              version: created.json.data.version,
            })
          ).status,
          409,
        );
        const copy = await call('/temp-offers', 'POST', {
          ...body,
          copySourceId: checkedId,
          clientRequestId: crypto.randomUUID(),
        });
        assert.equal(copy.status, 201);
        assert.equal(
          (
            await call(`/temp-offers/${copy.json.data.id}`, 'DELETE', {
              version: copy.json.data.version,
            })
          ).status,
          200,
        );
        const released = await call(
          `/temp-offers/${checkedId}/release`,
          'POST',
          { version: edited.json.data.version },
        );
        assert.equal(released.status, 200);
        assert.equal(released.json.data.status, 1);
        console.log(
          'PASS: live catalog, groups, customer defaults, create, replay, edit, copy, delete, owner isolation, concurrency and release.',
        );
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }

      // Exercise a real stock reservation in Test, falling back to FRU. All writes
      // are still in this same uncommitted transaction and never send events.
      for (const [db, companyId] of [
        ['BMS.TES', 0],
        ['BMS.FRU', 3],
      ]) {
        const stocks = await access.runSQLQueryAccess(
          { databaseName: db },
          `SELECT TOP 30 [Bestell-Pos] AS beNumber,[bePL_LagerID] AS warehouseId,[beP_Artikelindex] AS articleIndex,[Artikel] AS article,[Menge] AS amount
        FROM ${productAvailabilitySource('v')} WHERE COALESCE(bePR_Anzahl,0)=0 AND UPPER(Einheit)='KG' ORDER BY [Menge] DESC`,
        );
        const plan = await loadTempOrderPlanning({ companyId, keys: stocks });
        const stock = stocks.find(
          (s) =>
            Number(s.amount) -
              getTempOrderPlanningEntry(plan, s.beNumber, s.warehouseId)
                .totalAmountKg >
            1,
        );
        if (!stock) continue;
        const { header, positions } = normalize({
          customerId: customer.kd_KdNR,
          offerDate: '2026-11-10',
          positions: [
            {
              ...stock,
              quantity: 1,
              unit: 'KG',
              price: 1,
              priceBasis: 1000,
              reserve: true,
              reserveQuantity: 1,
              reserveUntil: '2099-01-01',
            },
          ],
        });
        header.customerName = 'Rollback reservation';
        header.customerAddress = '';
        positions[0].masterArticle = stock.article;
        const result = await insert(query, H, headerFields, header, {
          tag_company_id: companyId,
          tag_created_by: 'NSC',
          tag_modified_by: 'NSC',
          tag_client_request_id: crypto.randomUUID(),
        });
        const id = result.rows[0].tag_id;
        const req = {
          database: { databaseName: db, firmaId: companyId },
          userIdentity: { shortCode: 'NSC' },
          offerCustomerId: customer.kd_KdNR,
        };
        await synchronizeReservations(query, req, id, [], positions);
        assert.match(positions[0].reservationVersion, /^0x/);
        await insert(query, P, positionFields, positions[0], {
          tagp_offer_id: id,
          tagp_reservation_version: Buffer.from(
            positions[0].reservationVersion.slice(2),
            'hex',
          ),
        });
        const saved = await read(query, id, companyId, 'NSC');
        await synchronizeReservations(query, req, id, saved.positions, []);
        console.log(
          `PASS: real ${db} stock reservation, stored ownership/version and safe release inside rollback transaction.`,
        );
        break;
      }
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  } finally {
    access.runSQLQuerySqlServer = originalQuery;
    access.withSqlTransaction = originalTransaction;
  }
  assert.equal(
    (
      await originalQuery(
        config.sql.database,
        `SELECT tag_id FROM ${H} WHERE tag_id=?`,
        [checkedId],
      )
    ).length,
    0,
  );
  console.log(
    'PASS: transaction rolled back; no smoke offers or reservations persisted (identity counters can advance).',
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
