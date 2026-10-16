import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BulkStatusError, checkBulkStatusAccess, planBulkStatus,
  personalTicketStatus, supervisorStatuses,
} from '../bulk-ticket-status-policy.js';

const a = {uid:'a',role:'supervisor',disabled:false,projects:[{id:'p'}]};
const b = {...a,uid:'b'};
const manager = {...a,uid:'m',role:'engineer'};
const shared = {
  projectId:'p',status:'open' as const, assignedSupervisorIds:['a','b'],
  supervisorClosures:[], supervisorStatuses:{},
};

test('changing pending status is personal and preserves colleague status', () => {
  checkBulkStatusAccess(a,[shared],1);
  const updated = planBulkStatus(a, shared, 'pending');
  assert.equal(personalTicketStatus(updated, 'a'), 'pending');
  assert.equal(personalTicketStatus(updated, 'b'), 'open');
  assert.equal(updated.status, 'open');
  assert.deepEqual(updated.assignedSupervisorIds, ['a','b']);
});

test('single-owner internal status can change without report workflow', () => {
  const one = {...shared, assignedSupervisorIds:['a']};
  const updated = planBulkStatus(a, one, 'waiting');
  assert.equal(updated.status, 'waiting');
  assert.equal(personalTicketStatus(updated, 'a'), 'waiting');
});

for (const status of ['closed','completed','absent','out_of_scope'] as const) {
  test(`${status} closes one supervisor internally but leaves colleague unchanged`, () => {
    const updated = planBulkStatus(a, shared, status);
    assert.deepEqual(updated.assignedSupervisorIds, ['b']);
    assert.equal(updated.status, 'in_progress');
    assert.equal(updated.closedAt, null);
    assert.equal(personalTicketStatus(updated, 'a'), status);
    assert.equal(personalTicketStatus(updated, 'b'), 'open');
    assert.equal(updated.supervisorClosures[0]?.supervisorUid,'a');
    assert.equal(updated.supervisorClosures[0]?.completedByUid,'a');
    assert.deepEqual(updated.supervisorClosures[0]?.items,[]);
    assert.equal((updated as any).report, undefined);
    assert.equal((updated as any).outbox, undefined);
  });
}

test('both roles close independently; final is terminal only after last role', () => {
  const first = planBulkStatus(a, shared, 'completed');
  const second = planBulkStatus(b, {...shared,...first}, 'closed');
  assert.equal(second.status,'closed');
  assert.equal(second.assignedSupervisorIds.length, 0);
  assert.ok(second.closedAt instanceof Date);
  assert.equal(personalTicketStatus(second,'a'),'completed');
  assert.equal(personalTicketStatus(second,'b'),'closed');
});

test('other supervisor nonterminal update never reopens colleague role', () => {
  const first = planBulkStatus(a, shared, 'closed');
  const later = planBulkStatus(b, {...shared, ...first}, 'pending');
  assert.equal(personalTicketStatus(later,'a'),'closed');
  assert.equal(personalTicketStatus(later,'b'),'pending');
  assert.deepEqual(later.assignedSupervisorIds,['b']);
  assert.equal(later.supervisorClosures.length,1);
});

test('repeating a personal terminal status is idempotent', () => {
  const first = planBulkStatus(a,shared,'closed');
  const again = planBulkStatus(a,{...shared,...first},'closed');
  assert.deepEqual(again.assignedSupervisorIds,['b']);
  assert.equal(again.supervisorClosures.length,1);
});

test('supervisor can reopen their role while another role remains active', () => {
  const first = planBulkStatus(a,shared,'closed');
  const reopened = planBulkStatus(a,{...shared,...first},'open');
  assert.deepEqual(reopened.assignedSupervisorIds,['b','a']);
  assert.equal(reopened.supervisorClosures.length,0);
  assert.equal(personalTicketStatus(reopened,'b'),'open');
});

test('closed final ticket requires management to reopen, not a supervisor', () => {
  const closed = planBulkStatus(b,{...shared,...planBulkStatus(a,shared,'closed')},'closed');
  assert.throws(()=>planBulkStatus(a,{...shared,...closed},'pending'),
    (err:any)=>err.code==='MANAGEMENT_REOPEN_REQUIRED');
  const reopened = planBulkStatus(manager,{...shared,...closed},'pending','a');
  assert.deepEqual(reopened.assignedSupervisorIds,['a']);
  assert.equal(personalTicketStatus(reopened,'b'),'closed');
  assert.equal(reopened.status,'in_progress');
});

test('engineer must choose a supervisor for a shared ticket', () => {
  assert.throws(()=>planBulkStatus(manager,shared,'closed'),
    (err:any)=>err.code==='SUPERVISOR_TARGET_REQUIRED' && err.httpStatus===409);
  const onlyA = planBulkStatus(manager,shared,'closed','a');
  assert.equal(personalTicketStatus(onlyA,'a'),'closed');
  assert.equal(personalTicketStatus(onlyA,'b'),'open');
  assert.equal(onlyA.supervisorClosures[0].completedByUid,'m');
  assert.deepEqual(onlyA.assignedSupervisorIds,['b']);
  assert.throws(()=>planBulkStatus(manager,shared,'closed','unknown'),
    (err:any)=>err.code==='SUPERVISOR_NOT_ASSIGNED');
});

test('unassigned ticket managers can change global status internally', () => {
  const unassigned={...shared,assignedSupervisorIds:[]};
  assert.equal(planBulkStatus(manager,unassigned,'closed').status,'closed');
});

test('supervisor has no permission to change someone else ticket', () => {
  assert.throws(()=>checkBulkStatusAccess(a,[{...shared,assignedSupervisorIds:['b']}],1),
    (err:any)=>err.code==='SUPERVISOR_NOT_ASSIGNED');
});

test('supervisor and engineer cannot cross project boundaries', () => {
  for(const actor of [a,manager])assert.throws(
    ()=>checkBulkStatusAccess(actor,[{...shared,projectId:'other'}],1),
    (err:any)=>err.code==='TICKET_ACCESS_DENIED');
});
test('admin can access tickets across projects', () => {
  checkBulkStatusAccess({...manager,role:'admin'},[{...shared,projectId:'other'}],1);
});
test('disabled/missing users and missing ticket IDs are rejected', () => {
  assert.throws(()=>checkBulkStatusAccess({...a,disabled:true},[shared],1));
  assert.throws(()=>checkBulkStatusAccess(manager,[],1));
});
test('malformed stored personal statuses are safely ignored', () => {
  assert.deepEqual(supervisorStatuses(null),{});
  assert.deepEqual(supervisorStatuses({a:'pending',b:'invalid',c:3}),{a:'pending'});
});

test('explicit customer report closure overrides stale internal waiting status for that supervisor', () => {
  const waiting = planBulkStatus(a, shared, 'waiting');
  const afterRealClose = {
    ...shared,
    ...waiting,
    assignedSupervisorIds: ['b'],
    supervisorClosures: [{
      supervisorUid: 'a', completedAt: new Date().toISOString(),
      completedByUid: 'a', notes: 'تم التقرير', items: [],
    }],
  };
  assert.equal(personalTicketStatus(afterRealClose, 'a'), 'closed');
  assert.equal(personalTicketStatus(afterRealClose, 'b'), 'open');
});
