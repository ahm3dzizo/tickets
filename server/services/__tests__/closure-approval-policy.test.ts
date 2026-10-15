import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalOutcome, matchesExpectedRoles, parseVotes, validateApprovalInitiator,
} from '../closure-approval-policy.js';

test('one of several supervisor approvals never sends full closure prematurely', () => {
  const votes = {b: {decision: 'approve' as const, at: '', notes: ''}};
  assert.equal(approvalOutcome(['b','c'], votes), 'pending');
  assert.equal(approvalOutcome(['b','c'], {...votes, c:{decision:'approve',at:'',notes:''}}), 'approved');
});

test('any rejection cancels full closure even after a prior approval', () => {
  assert.equal(approvalOutcome(['b','c','d'], {
    b:{decision:'approve',at:'',notes:''},
    c:{decision:'reject',at:'',notes:'أعمالي لم تنته'},
  }), 'rejected');
});

test('a request can include different supervisors across several tickets', () => {
  assert.equal(matchesExpectedRoles({
    one: ['b'], two:['b','c'], three:['c'],
  }, [
    {id:'one',assignedSupervisorIds:['b']},
    {id:'two',assignedSupervisorIds:['c','b']},
    {id:'three',assignedSupervisorIds:['c']},
  ]), true);
});

test('assignment changes invalidate a pending approval atomically', () => {
  assert.equal(matchesExpectedRoles({one:['b','c']},
    [{id:'one',assignedSupervisorIds:['b','d']}]), false);
});

test('initiator must have active or already completed responsibility for every ticket', () => {
  assert.doesNotThrow(() => validateApprovalInitiator('supervisor','a', [
    {status:'in_progress',assignedSupervisorIds:['a','b'],supervisorClosures:[]},
    {status:'in_progress',assignedSupervisorIds:['b'],supervisorClosures:[{supervisorUid:'a'}]},
  ]));
  assert.throws(() => validateApprovalInitiator('supervisor','a',[
    {status:'open',assignedSupervisorIds:['b'],supervisorClosures:[]},
  ]), /SUPERVISOR_NOT_ASSIGNED/);
  assert.throws(() => validateApprovalInitiator('supervisor','a',[
    {status:'closed',assignedSupervisorIds:['a'],supervisorClosures:[]},
  ]), /TICKET_ALREADY_CLOSED/);
});

test('malformed vote data never counts as approval', () => {
  assert.deepEqual(parseVotes(null), {});
  assert.deepEqual(parseVotes([]), {});
  assert.equal(approvalOutcome(['b'], parseVotes({})), 'pending');
});
