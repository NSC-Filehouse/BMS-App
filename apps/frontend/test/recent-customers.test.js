import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  clearRecentCustomers,
  getRecentCustomers,
  recordRecentCustomer,
} from '../src/utils/recentCustomers.js';

const values = new Map();
global.localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};

beforeEach(() => {
  values.clear();
  localStorage.setItem('bms.mandant', 'BMS.FRU');
});

test('records recent customers newest first and moves duplicates to the top', () => {
  recordRecentCustomer({ id: 'A', name: 'Kunde A' });
  recordRecentCustomer({ id: 'B', name: 'Kunde B' });
  recordRecentCustomer({ id: 'A', name: 'Kunde A aktualisiert' });

  assert.deepEqual(
    getRecentCustomers().map((customer) => [customer.id, customer.name]),
    [['A', 'Kunde A aktualisiert'], ['B', 'Kunde B']],
  );
});

test('keeps only the latest 25 customers', () => {
  for (let index = 1; index <= 26; index += 1) {
    recordRecentCustomer({ id: String(index), name: `Kunde ${index}` });
  }

  const recent = getRecentCustomers();
  assert.equal(recent.length, 25);
  assert.equal(recent[0].id, '26');
  assert.equal(recent.at(-1).id, '2');
});

test('separates histories by mandant and tolerates invalid storage', () => {
  recordRecentCustomer({ id: 'A', name: 'Kunde A' });
  localStorage.setItem('bms.mandant', 'BMS.PLA');
  assert.deepEqual(getRecentCustomers(), []);

  localStorage.setItem('bms.recentCustomers.BMS.PLA', '{invalid');
  assert.deepEqual(getRecentCustomers(), []);

  clearRecentCustomers();
  assert.deepEqual(getRecentCustomers(), []);
});

test('preserves legacy recents once and separates later supplier activity', () => {
  recordRecentCustomer({ id: 'C', name: 'Kunde' });
  assert.deepEqual(getRecentCustomers('suppliers').map((customer) => customer.id), ['C']);

  recordRecentCustomer({ id: 'S', name: 'Lieferant' }, 'suppliers');
  recordRecentCustomer({ id: 'C2', name: 'Neuer Kunde' });

  assert.deepEqual(getRecentCustomers('customers').map((customer) => customer.id), ['C2', 'C']);
  assert.deepEqual(getRecentCustomers('suppliers').map((customer) => customer.id), ['S', 'C']);

  clearRecentCustomers('suppliers');
  assert.deepEqual(getRecentCustomers('suppliers'), []);
});
