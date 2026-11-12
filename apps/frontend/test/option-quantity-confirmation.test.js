import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedTotalKg} from '../src/utils/optionQuantityConfirmation.js';

test('choosing kg versus tonnes changes the confirmed total by the correct factor',()=>{
  assert.equal(confirmedTotalKg('24','kg'),24);
  assert.equal(confirmedTotalKg('24','t'),24000);
  assert.equal(confirmedTotalKg('24.75','t'),24750);
  assert.equal(confirmedTotalKg('1.234567','t'),1234.567);
});
test('confirmation needs a positive amount, an explicit unit and at most gram precision',()=>{
  for(const [amount,unit]of [['','kg'],['24',''],['24','truckload'],['bad','t'],['0','kg'],['-1','t'],['0.0000001','t'],['Infinity','kg']])
    assert.equal(confirmedTotalKg(amount,unit),null);
  assert.equal(confirmedTotalKg('0.001','kg'),0.001);
  assert.equal(confirmedTotalKg('0.000001','t'),0.001);
});
