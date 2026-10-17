import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planBulkStatus, personalTicketStatus} from '../bulk-ticket-status-policy.js';
import {planWorkAssignment, workDetailForSupervisor} from '../supervisor-work-details.js';

const actor = {uid:'a',role:'supervisor',disabled:false,projects:[{id:'p'}]};
const manager = {...actor,uid:'m',role:'engineer'};
const shared = {projectId:'p',status:'open' as const,assignedSupervisorIds:['a','b'],
  supervisorClosures:[],supervisorStatuses:{},supervisorWorkDetails:{}};
const contractor = {contractorId:'c1',contractorName:'مقاول 1',contractorNote:null,assigneeName:'مقاول 1'};
const note = {contractorId:null,contractorName:null,contractorNote:'ملاحظة للمشرف',assigneeName:'ملاحظة'};
test('contractor status belongs to one supervisor without changing a shared ticket global status',()=>{
  const role = planBulkStatus(actor,shared,'contractor');
  const assignment = planWorkAssignment(shared.supervisorWorkDetails,actor.uid,true,contractor);
  assert.equal(role.status,'open');
  assert.deepEqual(role.assignedSupervisorIds,['a','b']);
  assert.equal(personalTicketStatus({...shared,...role},'a'),'contractor');
  assert.equal(personalTicketStatus({...shared,...role},'b'),'open');
  assert.deepEqual(workDetailForSupervisor({supervisorWorkDetails:assignment.details},'a'),contractor);
  assert.deepEqual(workDetailForSupervisor({supervisorWorkDetails:assignment.details},'b'),{});
  assert.deepEqual(assignment.legacy,{});
});
test('note for second supervisor does not overwrite first supervisor contractor',()=>{
  const first=planWorkAssignment({},'a',true,contractor);
  const second=planWorkAssignment(first.details,'b',true,note);
  assert.deepEqual(second.details.a,contractor);
  assert.deepEqual(second.details.b,note);
  assert.deepEqual(first.details,{a:contractor}); // no mutation of previous snapshot
  assert.deepEqual(second.legacy,{});
});
test('engineer must select supervisor for shared contractor/note statuses',()=>{
  for (const status of ['contractor','note'] as const) {
    assert.throws(()=>planBulkStatus(manager,shared,status),
      (err:any)=>err?.code==='SUPERVISOR_TARGET_REQUIRED');
    const selected=planBulkStatus(manager,shared,status,'b');
    assert.equal(personalTicketStatus({...shared,...selected},'a'),'open');
    assert.equal(personalTicketStatus({...shared,...selected},'b'),status);
  }
});
test('solo contractor assignment updates ticket-wide legacy data for existing UI',()=>{
  const planned=planWorkAssignment({},'a',false,contractor);
  assert.deepEqual(planned.legacy,{
    contractorId:'c1', contractorNote:null, assigneeName:'مقاول 1',
  });
});
test('changing role from contractor to normal clears its details without touching others',()=>{
  const first=planWorkAssignment({},'a',true,contractor);
  const both=planWorkAssignment(first.details,'b',true,note);
  const changed=planWorkAssignment(both.details,'a',true,null);
  assert.equal(changed.details.a,undefined);
  assert.deepEqual(changed.details.b,note);
});
