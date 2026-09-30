import prisma from '../db.js';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { __dirname } from '../config.js';
import { buildClosingMsg } from '../baileys.js';

import { closures, planClosure, type Closure } from './ticket-closure-plan.js';
export { closures } from './ticket-closure-plan.js';

async function renderReport(body: object): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'report_generator.py'), '--stdin'], {env: {...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1'}});
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('REPORT_TIMEOUT')); }, 60000);
    child.on('error', e => {clearTimeout(timer); reject(e);});
    child.stdin.on('error', e => {clearTimeout(timer); reject(e);});
    child.stdout.on('data', d => output += d.toString());
    child.stderr.on('data', d => errors += d.toString());
    child.on('close', async code => {
      clearTimeout(timer);
      if (code !== 0) {console.error('[ClosureReport] generation failed', errors); reject(new Error('REPORT_GENERATION_FAILED')); return;}
      const filename = output.trim().split(/\r?\n/).pop() || '';
      try { const bytes = await readFile(filename); await unlink(filename); resolve(bytes); } catch(e) {reject(e);}
    });
    child.stdin.end(JSON.stringify(body));
  });
}

export async function closeTickets(uid: string, input: any) {
  const ids = [...new Set(input.ticketIds)] as string[];
  if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id)) throw new Error('INVALID_TICKET_IDS');
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const items = input.items;
  if (!Array.isArray(items) || !items.length || items.length > 200 || items.some(i => !i || typeof i.description !== 'string' || !i.description.trim() || typeof i.status !== 'string')) throw new Error('INVALID_MAINTENANCE_ITEMS');
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({where: {uid}, include: {projects: {select: {id: true}}}});
    if (!actor || actor.disabled) throw new Error('FORBIDDEN');
    // Lock in a consistent order. Re-read after the lock to serialize simultaneous closures/reassignments.
    for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
    const rows = await tx.ticket.findMany({where: {id: {in: ids}}, include: {client: true, unit: {include: {block: true}}, project: true}});
    if (rows.length !== ids.length) throw new Error('TICKET_NOT_FOUND');
    if (rows.some(t => actor.role !== 'admin' && !actor.projects.some(p => p.id === t.projectId))) throw new Error('FORBIDDEN');
    if (rows.some(t => t.unitId !== rows[0].unitId || t.clientId !== rows[0].clientId || t.projectId !== rows[0].projectId)) throw new Error('SAME_CUSTOMER_UNIT_REQUIRED');
    const finalRows: typeof rows = [];
    const results: {id: string; final: boolean; changed: boolean}[] = [];
    for (const ticket of rows) {
      if (ticket.status === 'closed' || ticket.status === 'completed') {
        if (actor.role === 'supervisor' && !closures(ticket.supervisorClosures).some(h => h.supervisorUid === uid) && !ticket.assignedSupervisorIds.includes(uid)) throw new Error('FORBIDDEN');
        results.push({id: ticket.id, final: true, changed: false}); continue;
      }
      const plan = planClosure(ticket.assignedSupervisorIds, closures(ticket.supervisorClosures), actor, input.scope || 'self', input.supervisorUid, notes, items);
      results.push({id: ticket.id, final: plan.final, changed: plan.changed});
      if (!plan.changed) continue;
      const allItems = plan.history.flatMap(h => h.items);
      if (!ticket.assignedSupervisorIds.length) allItems.push(...items);
      const allNotes = [...plan.history.map(h => h.notes), ...(input.scope === 'all' ? [notes] : [])].filter(Boolean).join('\n');
      const updated = await tx.ticket.update({where: {id: ticket.id}, data: {
        assignedSupervisorIds: plan.active, supervisorClosures: plan.history,
        status: plan.final ? 'closed' : 'in_progress', closedAt: plan.final ? new Date() : null,
        ...(plan.final ? {maintenanceItems: allItems.length ? allItems : items, closureNotes: allNotes || notes} : {}),
      }, include: {client: true, unit: {include: {block: true}}, project: true}});
      await tx.ticketAudit.create({data: {ticketId: ticket.id, field: plan.final ? 'إغلاق كامل للتذكرة' : 'إنهاء دور مشرف', oldValue: JSON.stringify(ticket.assignedSupervisorIds), newValue: JSON.stringify({remaining: plan.active, scope: input.scope || 'self', supervisorUid: input.supervisorUid || uid, notes}), changedBy: uid}});
      if (plan.final) finalRows.push(updated);
    }
    if (!finalRows.length) return {results, image: null};
    const first = finalRows[0];
    const reportItems = finalRows.flatMap(t => Array.isArray(t.maintenanceItems) ? t.maintenanceItems as Closure['items'] : []);
    const reportNotes = finalRows.map(t => t.closureNotes).filter(Boolean).join('\n');
    const body = {ticket_num: finalRows.map(t => t.ticketId).join('، '), villa: first.unit?.unitNumber || '', customer_name: first.client?.name || '', phone: first.client?.phone || '', maint_items: reportItems.map(i => [i.description, i.status]), notes: reportNotes, block: first.unit?.block?.blockNumber || '', project: first.project.name, nhc: first.project.abbreviation, ticket_date: first.issuedAt || '', priority: String(first.priority), handover_date: first.unit?.handoverDate || '', warranty_expiry_date: first.unit?.warrantyExpiryDate || ''};
    const image = await renderReport(body);
    const caption = await buildClosingMsg({ticketId: body.ticket_num, clientName: body.customer_name, description: reportItems.map(i => i.description).join('، '), unitNumber: body.villa, closureNotes: reportNotes});
    if (body.phone) await tx.ticketClosureReport.create({data: {ticketIds: finalRows.map(t => t.id), senderUid: uid, phone: body.phone, caption, image}});
    return {results, image};
  }, {timeout: 90000, maxWait: 10000});
}
