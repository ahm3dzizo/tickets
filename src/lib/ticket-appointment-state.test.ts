import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasScheduledTicketBadge,ticketStatusAfterAppointmentRangeSent} from './ticket-appointment-state.ts';

test('scheduled appointment is not switched back to waiting by a WhatsApp proposal',()=>{
  assert.equal(ticketStatusAfterAppointmentRangeSent('pending',true),null);
  assert.equal(ticketStatusAfterAppointmentRangeSent('waiting',true),'pending');
  assert.equal(ticketStatusAfterAppointmentRangeSent('open',true),null);
});
test('a proposal with no appointment waits for customer response',()=>{
  assert.equal(ticketStatusAfterAppointmentRangeSent('open',false),'waiting');
  assert.equal(ticketStatusAfterAppointmentRangeSent('pending',false),'waiting');
  assert.equal(ticketStatusAfterAppointmentRangeSent('waiting',false),null);
});
test('WhatsApp cannot overwrite internal supervisor or terminal ticket statuses',()=>{
  for(const state of ['in_progress','contractor','note','closed','completed','absent','out_of_scope']) {
    assert.equal(ticketStatusAfterAppointmentRangeSent(state,false),null);
    assert.equal(ticketStatusAfterAppointmentRangeSent(state,true),null);
  }
});
test('legacy waiting with a real scheduled appointment displays scheduled instead',()=>{
  assert.equal(hasScheduledTicketBadge({
    status:'waiting',appointmentTime:'2026-10-20 16:00',
    appointment:{status:'scheduled'},
  }),true);
  assert.equal(hasScheduledTicketBadge({status:'pending',appointmentTime:'2026-10-20 16:00'}),true);
});
test('do not claim cancelled/nonexistent appointments or closed tickets are scheduled',()=>{
  assert.equal(hasScheduledTicketBadge({status:'waiting',appointmentTime:null}),false);
  assert.equal(hasScheduledTicketBadge({status:'waiting',appointmentTime:'2026-10-20 16:00',appointment:{status:'cancelled'}}),false);
  assert.equal(hasScheduledTicketBadge({status:'closed',appointmentTime:'2026-10-20 16:00',appointment:{status:'scheduled'}}),false);
  assert.equal(hasScheduledTicketBadge({status:'contractor',appointmentTime:'2026-10-20 16:00'}),false);
});
