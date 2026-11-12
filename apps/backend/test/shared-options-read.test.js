const test = require('node:test');
const assert = require('node:assert/strict');
let calls = [];
let positions;
require.cache[require.resolve('../src/db/access')] = { exports: {
  runSQLQueryAccess:async()=>{throw new Error('Unexpected ERP query');},
  runSQLQuerySqlServer: async (database, sql, params) => {
    calls.push({ sql, params });
    assert.equal((sql.match(/\?/g) || []).length, params.length);
    if (sql.includes('AS sourceMandantId')) return [
      { id: 1, sourceMandantId: 3, supplierName: 'Total Petrochemicals & Refining SA/NV' },
      { id: 2, sourceMandantId: 19, supplierName: 'TotalEnergies' },
    ];
    return positions;
  },
} };
const { loadOffers } = require('../src/options/read');
test.beforeEach(() => { calls = [];positions=[{ id: 10, optionId: 1 }, { id: 20, optionId: 2 }]; });
test('shared pool returns different sources with canonical suppliers and applies status/date filters to both reads', async () => {
  const offers = await loadOffers(null, { optionId: 1 });
  assert.deepEqual(offers.map(offer => offer.sourceMandantId), [3, 19]);
  assert.ok(offers.every(offer => offer.supplierKey === 'totalenergies'));
  for (const { sql } of calls) {
    assert.doesNotMatch(sql, /WHERE o\.op_MandantID IN/);
    assert.match(sql, /o\.op_GeloeschtAm IS NULL/);
    assert.match(sql, /o\.op_GueltigAb<=\?/);
    assert.match(sql, /o\.op_id=\?/);
    assert.match(sql, /o\.op_Geschaeftsstatus=N'open'/);
  }
  assert.match(calls[1].sql, /COALESCE\(p\.opp_GueltigBis,o\.op_GueltigBis\)>=\?/);
});
test('an explicit source scope still binds IDs; empty scopes never become global', async () => {
  await loadOffers([3, 19], { includeExpired: true });
  assert.deepEqual(calls[0].params.slice(0, 2), [3, 19]);
  assert.match(calls[0].sql, /WHERE o\.op_MandantID IN \(\?,\?\)/);
  assert.match(calls[1].sql, /COALESCE\(p\.opp_GueltigBis,o\.op_GueltigBis\)>=\?/);
  assert.match(calls[1].sql, /o\.op_IstDemo=0/);
  calls = [];
  assert.deepEqual(await loadOffers([]), []);
  assert.deepEqual(await loadOffers(), []);
  assert.equal(calls.length, 0);
});

test('list and detail availability follow recognized truck packaging and subtract already allocated kg',async()=>{
  for(const [packaging,weight,count,expected]of [['Sackware',24750,1,23750],['Octabins',24750,2,48500],['Siloware',25000,1,24000]]){
    positions=[{id:10,optionId:1,quantityKind:'truckloads',truckMin:count,truckMax:count,positionPackaging:packaging,
      normalizationJson:JSON.stringify({packaging,maxTruckLoadKg:weight}),orderedKg:1000}];
    const position=(await loadOffers(null,{optionId:1}))[0].positions[0];
    assert.equal(position.remainingKg,expected);assert.equal(position.truckLoadKg,weight);
  }
  positions=[{id:10,optionId:1,quantityKind:'truckloads',truckMax:1,positionPackaging:'Sackware / Big Bags / Octabins'}];
  assert.equal((await loadOffers(null))[0].positions[0].remainingKg,null);
  positions=[{id:10,optionId:1,quantityKind:'truckloads',truckMax:1}];
  assert.equal((await loadOffers(null))[0].positions[0].remainingKg,25000);
  positions=[{id:10,optionId:1,quantityKind:'truckloads',truckMax:1,positionPackaging:'Octa',packagingTypeId:81}];
  assert.equal((await loadOffers(null))[0].positions[0].remainingKg,24750);
});
