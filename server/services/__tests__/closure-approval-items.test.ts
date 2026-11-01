import test from 'node:test';
import assert from 'node:assert/strict';
import { itemsForTicket, itemsForReport } from '../closure-approval-items.js';

test('returns only the maintenance items belonging to the requested ticket', () => {
  const saved = {
    ticketA: [{description:'Fix A',status:'done'}],
    ticketB: [{description:'Fix B',status:'done'}],
  };
  assert.deepEqual(itemsForTicket(saved, 'ticketA'), [{description:'Fix A',status:'done'}]);
  assert.deepEqual(itemsForTicket(saved, 'ticketB'), [{description:'Fix B',status:'done'}]);
  assert.deepEqual(itemsForTicket(saved, 'missing'), []);
});

test('flattens per-ticket items only for a shared customer report', () => {
  const saved = {
    ticketA: [{description:'Fix A',status:'done'}],
    ticketB: [{description:'Fix B',status:'done'}],
  };
  assert.deepEqual(itemsForReport(saved), [
    {description:'Fix A',status:'done'},
    {description:'Fix B',status:'done'},
  ]);
});

test('keeps compatibility with legacy array-shaped approval rows', () => {
  const legacy = [{description:'Legacy work',status:'done'}];
  assert.deepEqual(itemsForTicket(legacy, 'ticketA'), legacy);
  assert.deepEqual(itemsForReport(legacy), legacy);
});
