const test = require('node:test');
const assert = require('node:assert/strict');
const { rankCandidates, method, bestSuggestion, supplierKey, mappingMatches, features } = require('../src/options/article-matching');
const article = (id, name, extra = {}) => ({ articleIndex: id, articleName: name, ...extra });

test('PP Random and Block never return HDPE; unknown material does not open the whole catalog', () => {
  const articles = [article('1', 'HDPE NT MFI 20-29,99 natur'), article('2', 'PP Random MFI 20-29,99 natur')];
  assert.deepEqual(rankCandidates({ articleName: 'BCX200NP', materialCategory: 'PP Random', mfi: 23.8 }, articles).map(a => a.articleIndex), ['2']);
  assert.deepEqual(rankCandidates({ articleName: 'unknown', mfi: 23.8 }, articles), []);
  assert.deepEqual(rankCandidates({ articleName: 'unknown' }, articles), []);
});
test('complete product number finds J1145T without inventing offer MFI', () => {
  const result = rankCandidates({ articleName: 'J1145T' }, [article('08898', 'PP J1145T natur TOPILENE', { mfi: 70, productNumber: 'J1145T' })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].identityMatch, true);
  assert.match(result[0].warnings.join(), /MFI im Angebot fehlt/);
  assert.equal(rankCandidates({ articleName: 'J1145T2' }, [article('1', 'PP J1145T natur')]).length, 0);
});
test('exact identity survives MFI disagreement as conflict and cannot become automatic suggestion', () => {
  const results = rankCandidates({ articleName: 'LDPE Lupolen 2221D', mfi: 0.3 }, [article('12470', 'LDPE 2221D natur Lupolen', { mfi: 0.25 })]);
  assert.match(results[0].conflicts.join(), /MFI/);
  assert.equal(bestSuggestion(results), null);
});
test('2.16 kg and temperature are compared; missing test conditions remain unknown', () => {
  assert.deepEqual(method('230°C/2,16 kg'), { temperature: 230, load: 2.16 });
  const results = rankCandidates({ articleName: 'HDPE NT', mfi: 2.5, mfiTestCondition: '190°C/2.16kg' }, [
    article('1', 'HDPE NT MFI 2-3,99 (bei 21,6kg) natur'),
    article('2', 'HDPE NT MFI 2-3,99 (bei 2,16kg) natur', { mfiMethod: '190° / 2,16 kg' }),
    article('3', 'HDPE NT MFI 2-3,99 (bei 2,16kg) natur', { mfiMethod: '230° / 2,16 kg' }),
  ]);
  assert.deepEqual(results.map(a => a.articleIndex), ['2']);
});
test('LDPE, LLDPE and mLLDPE stay distinct even with shared BMS LLDPE category', () => {
  const articles = [article('1', 'LDPE NT MFI 15-19,99 natur'), article('2', 'LLDPE NT MFI 15-19,99 natur'),
    article('3', 'mLLDPE NT MFI 15-19,99 natur', { polymerCategory: 'PE', polymerSubCategory: 'LLDPE' })];
  assert.deepEqual(rankCandidates({ articleName: 'mLLDPE OG', mfi: 17 }, articles).map(a => a.articleIndex), ['3']);
});
test('additives and density bounds narrow LDPE candidates; unconfirmed density is not normalized', () => {
  const articles = [article('1', 'LDPE NT MFI 0,9-1,49 Dichte(<918) mit natur'),
    article('2', 'LDPE NT MFI 0,9-1,49 Dichte(<918) ohne natur'),
    article('3', 'LDPE NT MFI 0,9-1,49 Dichte(>926) mit natur')];
  const p = { articleName: 'LDPE near to prime mfi 1 with additives', mfi: 1, density: 0.917, densityUnit: 'g/cm³' };
  assert.deepEqual(rankCandidates(p, articles).map(a => a.articleIndex), ['1']);
  assert.deepEqual(rankCandidates({ ...p, densityUnit: null }, articles).map(a => a.articleIndex), ['1', '3']);
  assert.equal(features({ ...p, densityUnit: null }).density, null);
});
test('structured material type takes precedence over an obsolete article group', () => {
  const result = rankCandidates({ articleName: 'LDPE', mfi: 0.4 }, [article('1', 'LDPE 2500TN00', {
    groupName: 'PP', polymerCategory: 'PE', polymerSubCategory: 'LDPE', mfi: 0.4,
  })]);
  assert.equal(result[0].polymer, 'LDPE');
});
test('forwarding sender is not the supplier identity', () => {
  assert.equal(supplierKey('Borealis', 'employee@frupack.de'), 'borealis');
  assert.equal(supplierKey('Total Petrochemicals & Refining SA/NV', 'employee@frupack.de'), 'totalenergies');
});
test('learned rules require matching known conditions and keep all alternatives', () => {
  const p = { supplierName: 'Borealis', supplierKey: 'frupack.de', articleName: 'BCX200NP', materialCategory: 'PP Random', mfi: 23.8, mfiTestCondition: '230°C/2.16kg' };
  const mapping = { supplierKey: 'borealis', productName: 'BCX200NP', polymer: 'PP_RANDOM', mfiFrom: 20, mfiTo: 25, method: '230°C/2.16kg' };
  assert.equal(mappingMatches(p, mapping), true);
  assert.equal(mappingMatches({ ...p, mfiTestCondition: null }, mapping), false);
  assert.equal(mappingMatches({ ...p, materialCategory: 'PP block' }, mapping), false);
  assert.equal(mappingMatches(p, { ...mapping, conditions: JSON.stringify({ additives: 'with' }) }), false);
});
test('overlapping MFI ranges preserve multiple candidates and inhibit arbitrary choice', () => {
  const results = rankCandidates({ articleName: 'PPCP near prime', mfi: 25 }, [article('1', 'PP Copo NT MFI 20-25 natur'), article('2', 'PP Copo NT MFI 25-30 natur')]);
  assert.equal(results.length, 2);
  assert.equal(bestSuggestion(results), null);
});

test('measured MFI in a supplier name may vary within a learned range without changing product identity', () => {
  const mapping = { supplierKey: 'longfield', productName: 'LDPE mfi 1.0 with additives near to prime',
    polymer: 'LDPE', quality: 'NT', mfiFrom: 0.9, mfiTo: 1.49, conditions: { additives: 'with' } };
  assert.equal(mappingMatches({ supplierName: 'Longfield', articleName: 'LDPE mfi 1.2 with additives near to prime', mfi: 1.2 }, mapping), true);
  assert.equal(mappingMatches({ supplierName: 'Longfield', articleName: 'LDPE mfi 1.2 no additives near to prime', mfi: 1.2 }, mapping), false);
});

test('numeric product numbers identify an article but MFI labels do not create product identities', () => {
  assert.equal(rankCandidates({ articleName: 'PP 7600' }, [article('1', 'PP Copo grade', { productNumber: '7600' })])[0].identityMatch, true);
  assert.equal(rankCandidates({ articleName: 'unknown MFI15-19' }, [article('1', 'LDPE MFI15-19')]).length, 0);
});
