import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatAppointmentTime12Ar,formatPreferredAppointmentTimeAr} from './appointment-time-display.ts';

for (const [input,expected] of [
  ['00:00','12 صباحًا'],
  ['08:00','8 صباحًا'],
  ['11:15','11:15 صباحًا'],
  ['12:00','12 ظهرًا'],
  ['12:30','12:30 ظهرًا'],
  ['15:00','3 مساءً'],
  ['15:05','3:05 مساءً'],
  ['23:59','11:59 مساءً'],
] as const) {
  test(`appointment time display: ${input} => ${expected}`,()=>{
    assert.equal(formatAppointmentTime12Ar(input),expected);
  });
}
test('WhatsApp preferred time keeps the hour label once',()=>{
  assert.equal(formatPreferredAppointmentTimeAr('الساعة 15:00'),'الساعة 3 مساءً');
  assert.equal(formatPreferredAppointmentTimeAr('15:30'),'3:30 مساءً');
  assert.equal(formatPreferredAppointmentTimeAr('الساعة 12:00'),'الساعة 12 ظهرًا');
});
test('preformatted work periods and invalid times are not changed',()=>{
  const preset='بعد الظهر (1 م - 6 م)';
  assert.equal(formatPreferredAppointmentTimeAr(preset),preset);
  assert.equal(formatPreferredAppointmentTimeAr('الساعة 3 مساءً'),'الساعة 3 مساءً');
  assert.equal(formatPreferredAppointmentTimeAr('الساعة 25:90'),'الساعة 25:90');
  assert.equal(formatAppointmentTime12Ar('not a time'),'not a time');
});
