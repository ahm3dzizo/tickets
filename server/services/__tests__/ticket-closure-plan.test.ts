import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planClosure} from '../ticket-closure-plan.js';
const items = [{description: 'إصلاح تسريب', status: 'تم'}];
const a = {uid: 'a', role: 'supervisor'}, b = {uid: 'b', role: 'supervisor'};
test('first supervisor closes only their role; last supervisor finalizes with both contributions', () => {
 const first = planClosure(['a','b'], [], a, 'self', undefined, 'أعمال أحمد', items);
 assert.equal(first.final, false); assert.deepEqual(first.active, ['b']);
 const last = planClosure(first.active, first.history, b, 'self', undefined, 'أعمال محمد', items);
 assert.equal(last.final, true); assert.deepEqual(last.active, []);
 assert.deepEqual(last.history.map(h => h.notes), ['أعمال أحمد','أعمال محمد']);
});
test('completed supervisor repeating submission does not finalize someone else', () => {
 const first = planClosure(['a','b'], [], a, 'self', undefined, '', items);
 const repeated = planClosure(first.active, first.history, a, 'self', undefined, '', items);
 assert.equal(repeated.changed, false); assert.equal(repeated.final, false); assert.deepEqual(repeated.active, ['b']);
});
test('supervisor cannot force close or impersonate another supervisor', () => {
 for (const scope of ['all','supervisor']) assert.throws(() => planClosure(['a','b'], [], a, scope, 'b', 'reason', items), /FORBIDDEN/);
 assert.throws(() => planClosure(['a','b'], [], a, 'self', 'b', 'reason', items), /FORBIDDEN/);
});
for (const role of ['admin','engineer']) {
 test(`${role} can complete a specified supervisor`, () => {
  const result = planClosure(['a','b'], [], {uid:'manager',role}, 'supervisor','a','تم التحقق',items);
  assert.equal(result.final,false); assert.equal(result.history[0].completedByUid,'manager'); assert.deepEqual(result.active,['b']);
 });
 test(`${role} can close entire ticket with an audit reason`, () => {
  const result = planClosure(['a','b'], [], {uid:'manager',role}, 'all',undefined,'تم التحقق',items);
  assert.equal(result.final,true); assert.equal(result.history.length,2);
 });
 test(`${role} must provide a reason`, () => assert.throws(() => planClosure(['a'],[],{uid:'manager',role},'all',undefined,' ',items),/REASON_REQUIRED/));
}
test('newly assigned supervisor prevents final closure', () => {
 const first = planClosure(['a','b'],[],a,'self',undefined,'',items);
 const next = planClosure([...first.active,'c'],first.history,b,'self',undefined,'',items);
 assert.equal(next.final,false); assert.deepEqual(next.active,['c']);
});
test('removed supervisor no longer blocks final closure', () => {
 const first = planClosure(['a','b','c'],[],a,'self',undefined,'',items);
 const next = planClosure(first.active.filter(id=>id!=='c'),first.history,b,'self',undefined,'',items);
 assert.equal(next.final,true);
});
test('reassignment reactivates a supervisor and replaces their latest completion', () => {
 const first = planClosure(['a','b'],[],a,'self',undefined,'old',items);
 const next = planClosure(['a','b'],first.history,a,'self',undefined,'new',items);
 assert.equal(next.changed,true); assert.equal(next.history.length,1); assert.equal(next.history[0].notes,'new');
});
test('unassigned actors and unknown scopes are rejected', () => {
 assert.throws(() => planClosure(['b'],[],a,'self',undefined,'',items), /SUPERVISOR_NOT_ACTIVE/);
 assert.throws(() => planClosure(['a'],[],a,'unknown',undefined,'',items), /INVALID_SCOPE/);
 assert.throws(() => planClosure(['a'],[],{uid:'a',role:'technician'},'self',undefined,'',items), /FORBIDDEN/);
});

test('admin selected subset closes only those supervisors', () => {
 const result = planClosure(['a','b','c'], [], {uid:'manager',role:'admin'}, 'selected', ['a','b'], 'تم التحقق', items);
 assert.equal(result.final, false);
 assert.deepEqual(result.active, ['c']);
 assert.deepEqual(result.history.map(h => h.supervisorUid), ['a','b']);
});
test('engineer selecting every active supervisor finalizes the ticket', () => {
 const result = planClosure(['a','b'], [], {uid:'manager',role:'engineer'}, 'selected', ['a','b'], 'تم التحقق', items);
 assert.equal(result.final, true);
 assert.deepEqual(result.active, []);
});
test('supervisor cannot use selected scope to close other roles', () => {
 assert.throws(() => planClosure(['a','b'], [], a, 'selected', ['a','b'], 'reason', items), /FORBIDDEN/);
});
