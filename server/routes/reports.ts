import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import prisma from '../db.js';

const router = Router();

// Parse issuedAt string → Date, fallback to createdAt
function parseIssued(issuedAt: string | null | undefined, createdAt: Date): Date {
  if (!issuedAt) return createdAt;
  const d = new Date(issuedAt);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) return d;
  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = issuedAt.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(s => s.trim());
    if (c.length === 4) {
      const d2 = new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`);
      if (!isNaN(d2.getTime()) && d2.getFullYear() > 2000) return d2;
    }
  }
  return createdAt;
}

// GET /api/reports/stats?projectId=&from=&to=
router.get('/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId, from, to } = req.query as Record<string, string>;

    const where: any = {
      NOT: { description: { startsWith: 'موعد صيانة مجدول يدوياً للمشرف' } }
    };
    if (projectId) where.projectId = projectId;

    // Date filter applies to issuedAt (string) handled in JS, use createdAt only as fallback for DB filter
    // We fetch all and filter by issuedAt in JS for accurate results

    // ── 1. Fetch all tickets needed for calculations ──────────────────────────
    const allTickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true, type: true, typeId: true, subTypeId: true,
        status: true, priority: true, projectId: true,
        clientId: true, clientName: true, villaNumber: true,
        assignedSupervisorId: true,
        issuedAt: true, createdAt: true, closedAt: true,
      },
    });

    // Filter by date range using issuedAt
    const filtered = allTickets.filter(t => {
      const d = parseIssued(t.issuedAt, t.createdAt);
      if (from && d < new Date(from)) return false;
      if (to   && d > new Date(new Date(to).setHours(23,59,59,999))) return false;
      return true;
    });

    // ── 2. Totals ─────────────────────────────────────────────────────────────
    const total          = filtered.length;
    const openCount      = filtered.filter(t => t.status === 'open').length;
    const closedCount    = filtered.filter(t => t.status === 'closed').length;
    const inProgressCount= filtered.filter(t => t.status === 'in_progress').length;
    const pendingCount   = filtered.filter(t => t.status === 'pending').length;
    const waitingCount   = filtered.filter(t => t.status === 'waiting').length;
    const outOfScopeCount= filtered.filter(t => t.status === 'out_of_scope').length;

    // ── 3. Avg days to close (issuedAt → closedAt) ────────────────────────────
    const closedTickets = filtered.filter(t => t.status === 'closed' && t.closedAt);
    const daysArr = closedTickets.map(t => {
      const start = parseIssued(t.issuedAt, t.createdAt);
      const end   = t.closedAt!;
      return (end.getTime() - start.getTime()) / 86_400_000;
    }).filter(d => d >= 0 && d < 3650); // ignore negative or > 10 years

    const avgDays = daysArr.length
      ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length * 10) / 10
      : 0;

    // ── 4. Overdue (active > 7 days based on issuedAt) ───────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const overdueCount = filtered.filter(t =>
      ['open','in_progress','pending'].includes(t.status) &&
      parseIssued(t.issuedAt, t.createdAt) < sevenDaysAgo
    ).length;

    // ── 5. SLA Breakdown ──────────────────────────────────────────────────────
    const sla = { within1: 0, within3: 0, within7: 0, within14: 0, over14: 0 };
    for (const d of daysArr) {
      if      (d <= 1)  sla.within1++;
      else if (d <= 3)  sla.within3++;
      else if (d <= 7)  sla.within7++;
      else if (d <= 14) sla.within14++;
      else              sla.over14++;
    }

    // ── 6. By Status ──────────────────────────────────────────────────────────
    const byStatus = [
      { key: 'open',        nameAr: 'مفتوحة',       count: openCount,        color: '#f97316' },
      { key: 'in_progress', nameAr: 'قيد التنفيذ',   count: inProgressCount,  color: '#6366f1' },
      { key: 'pending',     nameAr: 'معلقة',         count: pendingCount,     color: '#f59e0b' },
      { key: 'waiting',     nameAr: 'في الانتظار',   count: waitingCount,     color: '#14b8a6' },
      { key: 'closed',      nameAr: 'مغلقة',         count: closedCount,      color: '#22c55e' },
      { key: 'out_of_scope',nameAr: 'خارج النطاق',   count: outOfScopeCount,  color: '#6b7280' },
    ].filter(s => s.count > 0);

    // ── 7. By Priority ────────────────────────────────────────────────────────
    const prioMap: Record<number, number> = {};
    for (const t of filtered) { prioMap[t.priority] = (prioMap[t.priority] || 0) + 1; }
    const priorityNames:  Record<number,string> = {1:'عاجل',2:'عالي',3:'متوسط عالي',4:'متوسط',5:'منخفض'};
    const priorityColors: Record<number,string> = {1:'#ef4444',2:'#f97316',3:'#f59e0b',4:'#6366f1',5:'#22c55e'};
    const byPriority = Object.entries(prioMap)
      .map(([k,v]) => ({ priority:+k, nameAr: priorityNames[+k] ?? `${k}`, count:v, color: priorityColors[+k] ?? '#6b7280' }))
      .sort((a,b) => a.priority - b.priority);

    // ── 8. By Type & Specialty ────────────────────────────────────────────────
    const allTypes = await prisma.ticketType.findMany({
      where: { isActive: true },
      select: { key:true, nameAr:true, id:true, specialty:{ select:{ key:true, nameAr:true } } },
    });
    const typeNameMap    = Object.fromEntries(allTypes.map(t => [t.key, t.nameAr]));
    const typeToSpecialty= Object.fromEntries(allTypes.map(t => [t.key, { key: t.specialty?.key ?? 'general', nameAr: t.specialty?.nameAr ?? 'عام' }]));

    const typeCountMap: Record<string,{open:number;closed:number}> = {};
    for (const t of filtered) {
      if (!typeCountMap[t.type]) typeCountMap[t.type] = { open:0, closed:0 };
      t.status === 'closed' ? typeCountMap[t.type].closed++ : typeCountMap[t.type].open++;
    }

    const byMainType = Object.entries(typeCountMap).map(([key,v]) => ({
      key, nameAr: typeNameMap[key] ?? key,
      count: v.open + v.closed, open: v.open, closed: v.closed,
    })).sort((a,b) => b.count - a.count);

    const specialtyAgg: Record<string,{nameAr:string;count:number}> = {};
    for (const [key,v] of Object.entries(typeCountMap)) {
      const sp = typeToSpecialty[key] ?? { key:'general', nameAr:'عام' };
      if (!specialtyAgg[sp.key]) specialtyAgg[sp.key] = { nameAr: sp.nameAr, count: 0 };
      specialtyAgg[sp.key].count += v.open + v.closed;
    }
    const bySpecialty = Object.entries(specialtyAgg)
      .map(([key,v]) => ({ key, ...v }))
      .sort((a,b) => b.count - a.count);

    // ── 9. By Sub-Type ────────────────────────────────────────────────────────
    const subTypeCountMap: Record<string,{open:number;closed:number}> = {};
    for (const t of filtered) {
      if (!t.subTypeId) continue;
      if (!subTypeCountMap[t.subTypeId]) subTypeCountMap[t.subTypeId] = { open:0, closed:0 };
      t.status === 'closed' ? subTypeCountMap[t.subTypeId].closed++ : subTypeCountMap[t.subTypeId].open++;
    }
    const subTypeIds = Object.keys(subTypeCountMap);
    const subTypeRecords = subTypeIds.length
      ? await prisma.ticketSubType.findMany({ where:{ id:{ in: subTypeIds } }, select:{ id:true, nameAr:true, parentType:{ select:{ key:true, nameAr:true } } } })
      : [];
    const subTypeMeta = Object.fromEntries(subTypeRecords.map(s => [s.id, s]));
    const bySubType = subTypeIds.filter(id => subTypeMeta[id]).map(id => {
      const v = subTypeCountMap[id];
      const m = subTypeMeta[id];
      return { id, nameAr: m.nameAr, parentKey: m.parentType.key, parentName: m.parentType.nameAr, count: v.open+v.closed, open: v.open, closed: v.closed };
    }).sort((a,b) => b.count - a.count);

    // ── 10. By Project ────────────────────────────────────────────────────────
    const projCountMap: Record<string,{open:number;closed:number}> = {};
    for (const t of filtered) {
      if (!projCountMap[t.projectId]) projCountMap[t.projectId] = { open:0, closed:0 };
      t.status === 'closed' ? projCountMap[t.projectId].closed++ : projCountMap[t.projectId].open++;
    }
    const projectIds = Object.keys(projCountMap);
    const projects = projectIds.length
      ? await prisma.project.findMany({ where:{ id:{ in:projectIds } }, select:{ id:true, name:true, abbreviation:true } })
      : [];
    const projectMeta = Object.fromEntries(projects.map(p => [p.id, p]));
    const byProject = projectIds.map(id => {
      const v = projCountMap[id];
      const p = projectMeta[id];
      return { id, name: p?.name ?? id, abbr: p?.abbreviation ?? '', count: v.open+v.closed, open: v.open, closed: v.closed };
    }).sort((a,b) => b.count - a.count);

    // ── 11. Monthly Trend (by issuedAt) ───────────────────────────────────────
    const monthMap: Record<string,{total:number;closed:number}> = {};
    for (const t of filtered) {
      const d = parseIssued(t.issuedAt, t.createdAt);
      const month = d.toISOString().slice(0,7);
      if (!monthMap[month]) monthMap[month] = { total:0, closed:0 };
      monthMap[month].total++;
      if (t.status === 'closed') monthMap[month].closed++;
    }
    const byMonth = Object.entries(monthMap)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([month,v]) => ({ month, total:v.total, closed:v.closed, open:v.total - v.closed }));

    // ── 12. Supervisor Performance ────────────────────────────────────────────
    const supMap: Record<string,{open:number;closed:number;days:number[];}> = {};
    for (const t of filtered) {
      if (!t.assignedSupervisorId) continue;
      if (!supMap[t.assignedSupervisorId]) supMap[t.assignedSupervisorId] = { open:0, closed:0, days:[] };
      if (t.status === 'closed') {
        supMap[t.assignedSupervisorId].closed++;
        if (t.closedAt) {
          const days = (t.closedAt.getTime() - parseIssued(t.issuedAt, t.createdAt).getTime()) / 86_400_000;
          if (days >= 0 && days < 3650) supMap[t.assignedSupervisorId].days.push(days);
        }
      } else {
        supMap[t.assignedSupervisorId].open++;
      }
    }
    const supIds = Object.keys(supMap);
    const supUsers = supIds.length
      ? await prisma.user.findMany({ where:{ uid:{ in:supIds } }, select:{ uid:true, displayName:true, specialty:true } })
      : [];
    const supMeta = Object.fromEntries(supUsers.map(u => [u.uid, u]));
    const bySupervisor = supIds.map(uid => {
      const v = supMap[uid];
      return {
        uid, name: supMeta[uid]?.displayName ?? uid, specialty: supMeta[uid]?.specialty ?? '',
        open: v.open, closed: v.closed, total: v.open + v.closed,
        avgDays: v.days.length ? Math.round(v.days.reduce((a,b)=>a+b,0)/v.days.length*10)/10 : null,
      };
    }).sort((a,b) => b.total - a.total).slice(0,15);

    // ── 13. Top Clients ───────────────────────────────────────────────────────
    const clientMap: Record<string,{name:string;villa:string;open:number;closed:number}> = {};
    for (const t of filtered) {
      if (!t.clientId) continue;
      if (!clientMap[t.clientId]) clientMap[t.clientId] = { name:t.clientName, villa:t.villaNumber, open:0, closed:0 };
      t.status === 'closed' ? clientMap[t.clientId].closed++ : clientMap[t.clientId].open++;
    }
    const topClients = Object.entries(clientMap)
      .map(([id,v]) => ({ clientId:id, clientName:v.name, villaNumber:v.villa, count:v.open+v.closed, open:v.open, closed:v.closed }))
      .sort((a,b) => b.count - a.count).slice(0,10);

    // ── 14. Avg Resolution Days by Type ──────────────────────────────────────
    const typeResMap: Record<string,number[]> = {};
    for (const t of filtered) {
      if (t.status !== 'closed' || !t.closedAt) continue;
      const days = (t.closedAt.getTime() - parseIssued(t.issuedAt, t.createdAt).getTime()) / 86_400_000;
      if (days < 0 || days > 3650) continue;
      if (!typeResMap[t.type]) typeResMap[t.type] = [];
      typeResMap[t.type].push(days);
    }
    const byTypeAvgDays = Object.entries(typeResMap)
      .filter(([,d]) => d.length > 0)
      .map(([key,d]) => ({ key, nameAr: typeNameMap[key]??key, avgDays: Math.round(d.reduce((a,b)=>a+b,0)/d.length*10)/10, count:d.length }))
      .sort((a,b) => b.avgDays - a.avgDays);

    res.json({
      totals: { total, open:openCount, closed:closedCount, avgDays, overdueCount, inProgress:inProgressCount, pending:pendingCount },
      sla, byStatus, byPriority,
      bySpecialty, byMainType, bySubType,
      byProject, byMonth,
      bySupervisor, topClients, byTypeAvgDays,
    });
  } catch (err: any) {
    console.error('[Reports] stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
