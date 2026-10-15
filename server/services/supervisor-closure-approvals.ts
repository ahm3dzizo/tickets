import prisma from '../db.js';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { createNotification } from '../notificationService.js';
import { closures, planClosure, uniqueClosureItems, type Closure } from './ticket-closure-plan.js';
import {
  approvalOutcome, matchesExpectedRoles, parseVotes, validateApprovalInitiator,
  type ApprovalDecision,
} from './closure-approval-policy.js';

// All customer reports are created through the durable worker outbox.
// A partial rejection report uses an immutable initiator-only snapshot, never
// the other supervisors' uncompleted work or the live ticket's global status.
type TX = Prisma.TransactionClient;
type Item = Closure['items'][number];

function validItems(value: unknown): value is Item[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 200 &&
    value.every(item => item && typeof item.description === 'string' &&
      item.description.trim() && typeof item.status === 'string');
}
function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 ||
      value.some(id => typeof id !== 'string' || !id.trim())) throw new Error('INVALID_TICKET_IDS');
  return [...new Set(value.map((id: string) => id.trim()))].sort();
}

async function actorFor(tx: TX, uid: string) {
  const actor = await tx.user.findUnique({ where: { uid }, include: { projects: { select: { id: true } } } });
  if (!actor || actor.disabled) throw new Error('FORBIDDEN');
  return actor;
}
function mayAccessProject(actor: Awaited<ReturnType<typeof actorFor>>, projectId: string) {
  return actor.role === 'admin' || actor.projects.some(project => project.id === projectId);
}
function pendingWhere(ids: string[]) {
  return { status: 'pending', ticketIds: { hasSome: ids } } as const;
}
function reportFrom(tx: TX, data: {
  ticketIds: string[]; senderUid: string; phone: string | null | undefined;
  approvalRequestId?: string; items?: Item[]; notes?: string; partial?: boolean;
}) {
  if (!data.phone) return Promise.resolve(null);
  return tx.ticketClosureReport.create({
    data: {
      ticketIds: data.ticketIds, senderUid: data.senderUid, phone: data.phone,
      caption: '', image: Buffer.alloc(0), state: 'generating',
      approvalRequestId: data.approvalRequestId,
      ...(data.partial ? { snapshot: { items: data.items || [], notes: data.notes || '',
        partial: true, senderUid: data.senderUid } } : {}),
    },
  });
}
async function audit(tx: TX, ticketId: string, field: string, changedBy: string, detail: unknown) {
  await tx.ticketAudit.create({
    data: { ticketId, field, changedBy, newValue: JSON.stringify(detail) },
  });
}
async function sendApprovalNotification(uid: string, title: string, body: string, ticketId: string, kind: string) {
  try { await createNotification(uid, kind, title, body, ticketId); }
  catch (error) { console.error('[ClosureApproval] notification failed', {uid, kind, error}); }
}

export async function requestSupervisorClosure(uid: string, input: {
  ticketIds: unknown; notes?: unknown; items?: unknown;
}) {
  const ticketIds = uniqueIds(input.ticketIds);
  if (!validItems(input.items)) throw new Error('INVALID_MAINTENANCE_ITEMS');
  const items = uniqueClosureItems(input.items);
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 4000) : '';

  const result = await prisma.$transaction(async tx => {
    const actor = await actorFor(tx, uid);
    if (actor.role !== 'supervisor') throw new Error('SUPERVISOR_REQUIRED');
    // Same lock order as the existing ticket close flow.
    for (const id of ticketIds) await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
    const rows = await tx.ticket.findMany({
      where: { id: { in: ticketIds } },
      include: { client: true, project: true, unit: true },
    });
    if (rows.length !== ticketIds.length) throw new Error('TICKET_NOT_FOUND');
    if (rows.some(ticket => !mayAccessProject(actor, ticket.projectId))) throw new Error('FORBIDDEN');
    validateApprovalInitiator(actor.role, uid, rows);
    const pending = await tx.ticketClosureApproval.findFirst({
      where: pendingWhere(ticketIds), select: { id: true },
    });
    if (pending) throw new Error('CLOSURE_APPROVAL_PENDING');

    // Each customer/unit gets their own decision chain and final report.
    const groups = new Map<string, typeof rows>();
    for (const ticket of rows) {
      const key = JSON.stringify([ticket.projectId, ticket.unitId, ticket.clientId]);
      groups.set(key, [...(groups.get(key) || []), ticket]);
    }

    const created: Array<{id: string; ticketIds: string[]; approverUids: string[]; status: string}> = [];
    const notifications: Array<{ uid: string; ticketId: string; numbers: string }> = [];
    for (const group of groups.values()) {
      const first = group[0];
      const approvers = [...new Set(group.flatMap(t => t.assignedSupervisorIds.filter(s => s !== uid)))];
      const expectedRoles: Record<string, string[]> = {};
      for (const ticket of group) {
        let active = ticket.assignedSupervisorIds;
        let history = closures(ticket.supervisorClosures);
        if (active.includes(uid)) {
          const plan = planClosure(active, history, actor, 'self', undefined, notes, items);
          active = plan.active;
          history = plan.history;
          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              assignedSupervisorIds: active,
              supervisorClosures: history as unknown as Prisma.InputJsonValue,
              status: plan.final ? 'closed' : 'in_progress',
              closedAt: plan.final ? new Date() : null,
              ...(plan.final ? { maintenanceItems: items as unknown as Prisma.InputJsonValue, closureNotes: notes } : {}),
            },
          });
          await audit(tx, ticket.id, 'المشرف أنهى أعماله وطلب الموافقة على الإغلاق', uid, {
            supervisorUid: uid, remaining: active, workItems: items, notes,
          });
        }
        expectedRoles[ticket.id] = [...active];
      }

      if (approvers.length === 0) {
        await reportFrom(tx, {
          ticketIds: group.map(t => t.id), senderUid: uid, phone: first.client?.phone,
        });
        for (const ticket of group) await audit(tx, ticket.id, 'تجهيز تقرير الإغلاق النهائي', uid, {
          scope: 'all', noOtherActiveSupervisors: true,
        });
        created.push({id: '', ticketIds: group.map(t => t.id), approverUids: [], status: 'approved'});
        continue;
      }

      const approval = await tx.ticketClosureApproval.create({
        data: {
          id: randomUUID(),
          ticketIds: group.map(t => t.id),
          projectId: first.projectId,
          unitId: first.unitId,
          clientId: first.clientId,
          requesterUid: uid, approverUids: approvers,
          expectedRoles: expectedRoles as Prisma.InputJsonValue,
          votes: {}, notes, items: items as unknown as Prisma.InputJsonValue,
        },
      });
      const numbers = group.map(t => '#' + t.ticketId).join('، ');
      for (const ticket of group) await audit(tx, ticket.id, 'إرسال طلب الموافقة على الإغلاق لجميع المشرفين', uid, {
        approvalId: approval.id, approvers, ticketIds: approval.ticketIds,
      });
      created.push({id: approval.id, ticketIds: approval.ticketIds, approverUids: approvers, status: 'pending'});
      for (const approverUid of approvers) notifications.push({
        uid: approverUid, ticketId: first.id, numbers,
      });
    }
    return {requests: created, notifications};
  }, {timeout: 90000, maxWait: 10000});

  for (const n of result.notifications) {
    void sendApprovalNotification(n.uid, 'موافقة مطلوبة لإغلاق تذاكر مشتركة',
      `مشرف أنهى أعماله ويطلب موافقتك على إغلاق ${n.numbers}. افتح التذكرة للموافقة أو الرفض.`,
      n.ticketId, 'closure_approval_requested');
  }
  return { requests: result.requests };
}

export async function voteSupervisorClosure(uid: string, id: string, input: {
  decision: ApprovalDecision; notes?: unknown;
}) {
  if (!['approve', 'reject'].includes(input.decision)) throw new Error('INVALID_DECISION');
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 4000) : '';

  const result = await prisma.$transaction(async tx => {
    const actor = await actorFor(tx, uid);
    if (actor.role !== 'supervisor') throw new Error('FORBIDDEN');
    // Lock tickets first; all close paths use this order, then approval record.
    const request = await tx.ticketClosureApproval.findUnique({where: {id}});
    if (!request || !request.approverUids.includes(uid) || !mayAccessProject(actor, request.projectId)) throw new Error('FORBIDDEN');
    for (const ticketId of [...request.ticketIds].sort()) {
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
    }
    await tx.$queryRaw`SELECT id FROM "TicketClosureApproval" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.ticketClosureApproval.findUniqueOrThrow({where: {id}});
    const votes = parseVotes(current.votes);
    if (current.status !== 'pending') return {changed: false, status: current.status, request: current};
    if (votes[uid]) {
      if (votes[uid].decision !== input.decision) throw new Error('DECISION_ALREADY_RECORDED');
      return {changed: false, status: current.status, request: current};
    }
    const rows = await tx.ticket.findMany({
      where: {id: {in: current.ticketIds}},
      include: {client: true},
    });
    const expected = current.expectedRoles as Record<string, string[]>;
    if (!matchesExpectedRoles(expected, rows)) throw new Error('APPROVAL_ROLES_CHANGED');

    const nextVotes = {...votes, [uid]: {
      decision: input.decision, at: new Date().toISOString(), notes,
    }};
    const status = approvalOutcome(current.approverUids, nextVotes);
    for (const ticket of rows) {
      await audit(tx, ticket.id,
        input.decision === 'approve' ? 'المشرف وافق على الإغلاق بالنيابة' : 'المشرف رفض الإغلاق بالنيابة',
        uid, {
          approvalId: id, requesterUid: current.requesterUid, approverUid: uid,
          decision: input.decision, notes,
        });
    }
    if (status === 'approved') {
      const contributions = Array.isArray(current.items) ? current.items as Item[] : [];
      for (const ticket of rows) {
        let active = ticket.assignedSupervisorIds;
        let history = closures(ticket.supervisorClosures);
        for (const approverUid of current.approverUids) {
          if (!active.includes(approverUid)) continue;
          const approverVote = nextVotes[approverUid];
          const plan = planClosure(active, history,
            { uid: approverUid, role: 'supervisor' }, 'self', undefined,
            approverVote.notes || 'وافق على إغلاق الأعمال بطلب من مشرف آخر',
            [{description: ticket.description || 'اعتماد انتهاء أعمال التذكرة', status: 'تم اعتماد الإغلاق'}]);
          active = plan.active;
          history = plan.history;
          await audit(tx, ticket.id, 'تم الإغلاق النهائي بموافقة المشرف وبالنيابة عنه',
            current.requesterUid, {
              approvalId: id, approverUid, confirmedByUid: approverUid,
              originalRequester: current.requesterUid,
            });
        }
        if (active.length > 0) throw new Error('APPROVAL_ROLES_CHANGED');
        const allItems = uniqueClosureItems([...history.flatMap(h => h.items), ...contributions]);
        await tx.ticket.update({
          where: {id: ticket.id},
          data: {
            assignedSupervisorIds: active,
            supervisorClosures: history as unknown as Prisma.InputJsonValue,
            status: 'closed', closedAt: new Date(),
            maintenanceItems: allItems as unknown as Prisma.InputJsonValue,
            closureNotes: [...new Set(history.map(h => h.notes).filter(Boolean))].join('\n'),
          },
        });
      }
      await reportFrom(tx, {
        ticketIds: current.ticketIds, senderUid: current.requesterUid,
        phone: rows[0]?.client?.phone, approvalRequestId: id,
      });
      for (const ticket of rows) await audit(tx, ticket.id, 'تم تجهيز تقرير الإغلاق النهائي بعد جميع الموافقات', current.requesterUid, {
        approvalId: id, approvedBy: current.approverUids, ticketIds: current.ticketIds,
      });
    } else if (status === 'rejected') {
      const partialItems = Array.isArray(current.items) ? current.items as Item[] : [];
      await reportFrom(tx, {
        ticketIds: current.ticketIds, senderUid: current.requesterUid,
        phone: rows[0]?.client?.phone, approvalRequestId: id,
        items: partialItems, notes: current.notes, partial: true,
      });
      for (const ticket of rows) await audit(tx, ticket.id, 'إعداد تقرير جزئي بعد رفض مشرف آخر', current.requesterUid, {
        approvalId: id, rejectedBy: uid, remainingSupervisors: ticket.assignedSupervisorIds,
        reportContainsOnly: current.requesterUid,
      });
    }
    const updated = await tx.ticketClosureApproval.update({
      where: {id}, data: {
        votes: nextVotes as Prisma.InputJsonValue, status,
        ...(status !== 'pending' ? {resolvedAt: new Date()} : {}),
      },
    });
    return {changed: true, status, request: updated};
  }, {timeout: 90000, maxWait: 10000});

  if (result.changed) {
    const r = result.request;
    const text = result.status === 'approved' ? 'كل المشرفين وافقوا؛ تم الإغلاق النهائي وجدولة التقرير.'
      : result.status === 'rejected' ? 'مشرف رفض الإغلاق؛ تم جدولة تقرير أعمالك فقط وبقيت الأدوار الأخرى مفتوحة.'
      : 'تم تسجيل رد المشرف، وفي انتظار بقية الموافقات.';
    void sendApprovalNotification(r.requesterUid, 'تحديث موافقات إغلاق التذاكر',
      text, r.ticketIds[0], 'closure_approval_response');
    if (result.status !== 'pending') {
      for (const approverUid of r.approverUids.filter(s => s !== uid)) {
        void sendApprovalNotification(approverUid, 'تم حسم طلب إغلاق التذاكر',
          text, r.ticketIds[0], 'closure_approval_resolved');
      }
    }
  }
  return { status: result.status, changed: result.changed };
}

export async function listSupervisorClosureApprovals(uid: string, ticketId?: string) {
  const actor = await prisma.user.findUnique({ where: {uid}, select: {
    uid: true, role: true, disabled: true, projects: {select: {id: true}},
  } });
  if (!actor || actor.disabled) throw new Error('FORBIDDEN');
  if (!['supervisor', 'engineer', 'admin'].includes(actor.role)) throw new Error('FORBIDDEN');
  const requests = await prisma.ticketClosureApproval.findMany({
    where: {
      ...(ticketId ? {ticketIds: {has: ticketId}} : {}),
      ...(actor.role === 'admin' ? {} : {
        projectId: {in: actor.projects.map(p => p.id)},
        OR: [{requesterUid: uid}, {approverUids: {has: uid}}],
      }),
    },
    orderBy: {createdAt: 'desc'}, take: ticketId ? 20 : 100,
    select: {
      id: true, ticketIds: true, projectId: true, unitId: true,
      requesterUid: true, approverUids: true, votes: true, status: true,
      notes: true, createdAt: true, resolvedAt: true,
    },
  });
  if (!requests.length) return [];
  const ticketIds = [...new Set(requests.flatMap(row => row.ticketIds))];
  const supervisorUids = [...new Set(requests.flatMap(row =>
    [row.requesterUid, ...row.approverUids]
  ))];
  const [tickets, users] = await Promise.all([
    prisma.ticket.findMany({where: {id: {in: ticketIds}}, select: {id: true, ticketId: true}}),
    prisma.user.findMany({where: {uid: {in: supervisorUids}}, select: {uid: true, displayName: true}}),
  ]);
  const ticketNames = Object.fromEntries(tickets.map(ticket => [ticket.id, ticket.ticketId]));
  const people = Object.fromEntries(users.map(user => [user.uid, user.displayName]));
  return requests.map(request => ({...request, ticketNames, people}));
}
