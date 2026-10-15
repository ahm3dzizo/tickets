import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWorkHours, isWithinBreak, availableTimes, firstAvailableTimeInPeriod } from './appointmentTimeAvailability.ts';
import type { WorkHoursConfig } from './api';

const base: WorkHoursConfig = { enabled: true, hasMorning: true, morning: { start: '08:00', end: '12:00' }, hasBreak: true, break: { start: '12:00', end: '13:00' }, hasAfternoon: true, afternoon: { start: '13:00', end: '18:00' } };

test('2pm allowed between 1pm and 6pm with noon break', () => {
  assert.equal(isWithinWorkHours(14*60, base), true);
  assert.equal(isWithinBreak(14*60, base), false);
  assert.ok(availableTimes(base).includes('14:00'));
});

test('overlapping break rejects 2pm and proposes 3pm', () => {
  const hours = { ...base, break: { start: '13:00', end: '15:00' } };
  assert.equal(isWithinBreak(14*60, hours), true);
  assert.equal(isWithinWorkHours(14*60, hours), false);
  assert.ok(!availableTimes(hours).includes('14:00'));
  assert.equal(firstAvailableTimeInPeriod(hours.afternoon, hours), '15:00');
});
