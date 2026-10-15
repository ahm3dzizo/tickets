import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkHoursConfig } from './api';
import {
  addWorkingDays, dateWorkHours, isWorkingDate, nextWorkingDate, weekdayOf,
} from './workDays';

const base: WorkHoursConfig = {
  enabled: true,
  hasMorning: true,
  morning: { start: '08:00', end: '12:00' },
  hasBreak: true,
  break: { start: '12:00', end: '13:00' },
  hasAfternoon: true,
  afternoon: { start: '13:00', end: '16:00' },
};

test('legacy config treats Friday as closed by default', () => {
  assert.equal(weekdayOf('2026-10-16'), 5);
  assert.equal(isWorkingDate('2026-10-16', base), false);
  assert.equal(isWorkingDate('2026-10-17', base), true);
  assert.equal(nextWorkingDate('2026-10-15', base), '2026-10-17');
  assert.equal(addWorkingDays('2026-10-15', 1, base), '2026-10-17');
});

test('Friday can be enabled explicitly per project', () => {
  const fridayEnabled = { ...base, workingDays: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(isWorkingDate('2026-10-16', fridayEnabled), true);
  assert.equal(addWorkingDays('2026-10-15', 1, fridayEnabled), '2026-10-16');
});

test('custom weekly days skip every closed day', () => {
  const limited = { ...base, workingDays: [0, 2] }; // Sunday + Tuesday
  assert.equal(nextWorkingDate('2026-10-15', limited), '2026-10-18');
  assert.equal(addWorkingDays('2026-10-18', 1, limited), '2026-10-20');
});

test('per-day hours override without changing the project-wide defaults', () => {
  const friday = {
    ...base,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    dayOverrides: {
      '5': {
        hasMorning: true, morning: { start: '10:00', end: '12:00' },
        hasBreak: false, break: { start: '12:00', end: '13:00' },
        hasAfternoon: false, afternoon: { start: '13:00', end: '16:00' },
      },
    },
  };
  assert.equal(dateWorkHours('2026-10-16', friday).morning.start, '10:00');
  assert.equal(dateWorkHours('2026-10-17', friday).morning.start, '08:00');
});

test('invalid dates and zero available weekdays cannot produce a booking day', () => {
  assert.equal(weekdayOf('2026-02-30'), -1);
  assert.equal(isWorkingDate('2026-02-30', base), false);
  assert.equal(nextWorkingDate('2026-10-15', { ...base, workingDays: [] }), null);
  assert.equal(isWorkingDate('2026-10-16', { ...base, enabled: false }), true);
});
