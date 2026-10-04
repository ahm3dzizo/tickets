import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkBulkStatusAccess, planBulkStatus} from '../bulk-ticket-status-policy.js';
const supervisor = {uid:'a',role:'supervisor',disabled:false,projects:[{id:'p'}]};
const manager = {...supervisor,uid:'m',role:'engineer'};
const ticket = {projectId:'p',status:'open' as const,assignedSupervisorIds:['a','b'],supervisorClosures:[]};
test('assigned supervisor can change active status',()=>{checkBulkStatusAccess(supervisor,[ticket],1); assert.equal(planBulkStatus(supervisor,ticket,'pending').status,'pending');});
test('supervisor cannot change another supervisor ticket',()=>assert.throws(()=>checkBulkStatusAccess(supervisor,[{...ticket,assignedSupervisorIds:['b']}],1),/المسندة/));
test('supervisor and engineer cannot cross project boundaries',()=>{for(const actor of [supervisor,manager]) assert.throws(()=>checkBulkStatusAccess(actor,[{...ticket,projectId:'other'}],1),/مشاريعك/);});
test('admin can update across projects',()=>checkBulkStatusAccess({...manager,role:'admin'},[{...ticket,projectId:'other'}],1));
test('missing tickets fail atomically',()=>assert.throws(()=>checkBulkStatusAccess(manager,[],1)));
test('disabled actors rejected',()=>assert.throws(()=>checkBulkStatusAccess({...manager,disabled:true},[ticket],1)));
for (const status of ['closed','completed','absent','out_of_scope'] as const) test(`${status} changes only the supervisor role until all finish`,()=>{
 const first = planBulkStatus(supervisor,ticket,status);
 assert.equal(first.status,'in_progress'); assert.deepEqual(first.assignedSupervisorIds,['b']); assert.equal(first.closedAt,undefined);
 const last = planBulkStatus({...supervisor,uid:'b'},{...ticket,...first},status);
 assert.equal(last.status,status); assert.deepEqual(last.assignedSupervisorIds,[]); assert.ok(last.closedAt);
});
test('management can directly finalize entire ticket without notes',()=>assert.equal(planBulkStatus(manager,ticket,'closed').status,'closed'));
test('a completed role does not block active colleague status updates',()=>{
 const first=planBulkStatus(supervisor,ticket,'closed');const row={...ticket,...first};checkBulkStatusAccess({...supervisor,uid:'b'},[row],1);
 assert.equal(planBulkStatus({...supervisor,uid:'b'},row,'waiting').status,'waiting');
});
test('repeating personal close leaves the remaining role untouched',()=>{
 const first=planBulkStatus(supervisor,ticket,'closed'); const next=planBulkStatus(supervisor,{...ticket,...first},'closed');assert.deepEqual(next.assignedSupervisorIds,['b']);assert.equal(next.status,'in_progress');
});
test('supervisor reopens their own role only',()=>{
 const first=planBulkStatus(supervisor,ticket,'closed');const reopened=planBulkStatus(supervisor,{...ticket,...first},'open');assert.deepEqual(reopened.assignedSupervisorIds,['b','a']);assert.equal(reopened.supervisorClosures.length,0);
});
test('management reopening final ticket restores completed responsibilities',()=>{
 const done=planBulkStatus(manager,ticket,'closed');const reopened=planBulkStatus(manager,{...ticket,...done},'open');assert.deepEqual(reopened.assignedSupervisorIds,['a','b']);assert.equal(reopened.supervisorClosures.length,0);assert.equal(reopened.closedAt,null);
});
