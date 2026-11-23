import assert from 'node:assert/strict';
import test from 'node:test';

import { getSelectableMandants } from '../src/utils/mandantOptions.js';
import { MANDANT_EXCLUDE_IDS } from '../src/config.js';

const testMandant = { id: 0, name: 'Test', shortName: 'TES', isMain: false };
const normalMandant = { id: 2, name: 'MLPlastics', shortName: 'MLP', isMain: true };
const elbpolymerMandant = { id: 18, name: 'Elbpolymer', shortName: 'EPO', isMain: false };

test('hides Test from mandant selection for other users', () => {
  assert.deepEqual(
    getSelectableMandants([testMandant, normalMandant], { shortCode: 'AKI' }),
    [normalMandant],
  );
});

test('keeps Test visible for MFR and NSC', () => {
  for (const shortCode of ['MFR', 'NSC']) {
    assert.deepEqual(
      getSelectableMandants([testMandant, normalMandant], { shortCode }),
      [testMandant, normalMandant],
    );
  }
});

test('only a resolved executive gets every regular mandant including normally hidden ones', (t) => {
  const excluded = { id: 1, name: 'MLHolding', shortName: 'HOL', isMain: false };
  MANDANT_EXCLUDE_IDS.add(excluded.id);
  t.after(() => MANDANT_EXCLUDE_IDS.delete(excluded.id));
  const items = [testMandant, normalMandant, excluded, elbpolymerMandant];
  const executive = { shortCode: 'OBA', executiveAccess: true };
  assert.deepEqual(getSelectableMandants(items, { ...executive, identityResolved: true }), [normalMandant, excluded]);
  assert.deepEqual(getSelectableMandants(items, executive), [normalMandant]);
});
