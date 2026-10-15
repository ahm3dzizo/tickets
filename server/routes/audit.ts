import { Router } from "express";
import prisma from "../db.js";
import { requireAuth, type AuthRequest } from "../auth.js";
import { closures } from '../services/ticket-closure-plan.js';

const router = Router();

// GET /api/audit/ticket/:id — last 50 changes for a ticket
router.get("/ticket/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user, ticket] = await Promise.all([
      prisma.user.findUnique({
        where:{uid:req.uid!},
        include:{projects:{select:{id:true}}},
      }),
      prisma.ticket.findUnique({
        where:{id:req.params.id},
        select:{projectId:true,assignedSupervisorIds:true,supervisorClosures:true},
      }),
    ]);
    const projectAccess = !!user && !!ticket && !user.disabled &&
      (user.role === 'admin' || user.projects.some(project => project.id === ticket.projectId));
    const supervisorAccess = !!user && !!ticket && (user.role !== 'supervisor' ||
      ticket.assignedSupervisorIds.includes(user.uid) ||
      closures(ticket.supervisorClosures).some(h => h.supervisorUid === user.uid));
    if (!projectAccess || !supervisorAccess) {
      res.status(404).json({error:'TICKET_NOT_FOUND'});
      return;
    }
    const audits = await prisma.ticketAudit.findMany({
      where: { ticketId: req.params.id },
      orderBy: { changedAt: "desc" },
      take: 50,
    });

    // User-readable, attributed actions: preserve the raw JSON audit payload
    // while providing descriptions that include both requesting and approving
    // supervisors' names. Historical audit records remain unchanged.
    const fields = new Set([
      'المشرف أنهى أعماله وطلب الموافقة على الإغلاق',
      'إرسال طلب الموافقة على الإغلاق لجميع المشرفين',
      'المشرف وافق على الإغلاق بالنيابة',
      'المشرف رفض الإغلاق بالنيابة',
      'تم الإغلاق النهائي بموافقة المشرف وبالنيابة عنه',
      'تم تجهيز تقرير الإغلاق النهائي بعد جميع الموافقات',
      'إعداد تقرير جزئي بعد رفض مشرف آخر',
      'إلغاء طلب الإغلاق بالنيابة مع إرسال تقرير جزئي',
      'تم إرسال تقرير أعمال المشرف الجزئي للعميل',
      'تم إرسال التقرير النهائي للعميل',
    ]);
    const parse = (value: string | null): Record<string, any> => {
      try {const data = JSON.parse(value || ''); return data && typeof data === 'object' ? data : {};}
      catch {return {};}
    };
    const details = audits.map(a => fields.has(a.field) ? parse(a.newValue) : null);
    const uids = [...new Set([
      ...audits.map(a => a.changedBy),
      ...details.flatMap(d => d ? [
        d.supervisorUid, d.requesterUid, d.approverUid, d.senderUid,
        d.initiator, d.originalRequester, d.confirmedByUid, d.rejectedBy,
        ...(Array.isArray(d.approvers) ? d.approvers : []),
        ...(Array.isArray(d.approvedBy) ? d.approvedBy : []),
      ] : []),
    ].filter((uid): uid is string => typeof uid === 'string' && !!uid))];
    const users = uids.length
      ? await prisma.user.findMany({ where: { uid: { in: uids } }, select: { uid: true, displayName: true } })
      : [];
    const nameMap: Record<string,string> = Object.fromEntries(users.map(u => [u.uid, u.displayName]));
    const name = (uid: unknown) => typeof uid === 'string' ? nameMap[uid] || uid : 'غير معروف';
    const formatDetails = (field: string, d: Record<string, any>, by: string): string => {
      switch (field) {
        case 'المشرف أنهى أعماله وطلب الموافقة على الإغلاق':
          return `${name(d.supervisorUid)} أنهى أعماله. المشرفون المتبقون: ${(d.remaining || []).map(name).join('، ') || 'لا أحد'}`;
        case 'إرسال طلب الموافقة على الإغلاق لجميع المشرفين':
          return `${by} طلب موافقة ${(d.approvers || []).map(name).join('، ')} على الإغلاق المشترك.`;
        case 'المشرف وافق على الإغلاق بالنيابة':
          return `${by} وافق على أن يُغلق ${name(d.requesterUid)} التذكرة بالنيابة عنه.`;
        case 'المشرف رفض الإغلاق بالنيابة':
          return `${by} رفض طلب ${name(d.requesterUid)}. السبب: ${d.notes || 'غير محدد'}`;
        case 'تم الإغلاق النهائي بموافقة المشرف وبالنيابة عنه':
          return `${by} أغلق دور ${name(d.approverUid)} بالنيابة عنه وبموافقته المسجلة.`;
        case 'تم تجهيز تقرير الإغلاق النهائي بعد جميع الموافقات':
          return `${by} جهّز التقرير النهائي بعد موافقة ${(d.approvedBy || []).map(name).join('، ')}.`;
        case 'إعداد تقرير جزئي بعد رفض مشرف آخر':
          return `${by} جهّز تقرير أعماله فقط بعد رفض ${name(d.rejectedBy)}. بقية الأدوار تظل مفتوحة.`;
        case 'إلغاء طلب الإغلاق بالنيابة مع إرسال تقرير جزئي':
          return `${by} ألغى طلب الإغلاق. السبب: ${d.reason || ''}`;
        case 'تم إرسال تقرير أعمال المشرف الجزئي للعميل':
          return `${by} أرسل تقرير أعماله الجزئي للعميل، دون أعمال المشرفين الآخرين.`;
        case 'تم إرسال التقرير النهائي للعميل':
          return `${by} أرسل تقرير الإغلاق النهائي للعميل بعد استكمال الأدوار.`;
        default: return '';
      }
    };
    res.json(audits.map((a, i) => ({
      ...a, changedByName: nameMap[a.changedBy] ?? a.changedBy,
      ...(details[i] ? {detailsText: formatDetails(a.field, details[i], name(a.changedBy))} : {}),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
