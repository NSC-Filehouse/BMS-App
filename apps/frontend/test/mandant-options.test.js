import assert from 'node:assert/strict';
import test from 'node:test';

import { getSelectableMandants } from '../src/utils/mandantOptions.js';

const testMandant = { id: 0, name: 'Test' };
const normalMandant = { id: 2, name: 'MLPlastics' };

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
