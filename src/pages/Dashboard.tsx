import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, ArrowUpRight, Clock, CheckCircle2, Briefcase, HardHat,
  UserPlus, UserCheck, Calendar, ChevronLeft, AlertTriangle,
  TrendingUp, RefreshCw, Users, CalendarCheck,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { TicketForm } from '@/components/tickets/TicketForm';
import { TicketTable, statusTranslations, typeTranslations, BulkActionBar } from '@/components/tickets/TicketTable';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { AssignContractorDialog } from '@/components/tickets/AssignContractorDialog';
import { WhatsAppService } from '@/services/whatsappService';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ClientForm } from '@/components/clients/ClientForm';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { Button } from '@/components/ui/button';
import { ticketsApi, projectsApi, clientsApi, techniciansApi, dashboardApi } from '@/lib/api';
import { getCachedTickets, invalidateTicketCache } from '@/lib/ticketCache';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { Project, Ticket, Client } from '@/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ totalTickets: 0, openTickets: 0, activeProjects: 0, totalTechnicians: 0 });
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [contractorDialogOpen, setContractorDialogOpen] = useState(false);
  const [clients, setClients] = useState<Record<string, Client>>({});

  // ── Live KPI data ──
  const [kpi, setKpi] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedProject, setSelectedProject] = useState<string>('all');

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
      invalidateTicketCache();
      toast.success(`تم تحديث ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]);
      loadDashboard();
    } catch { toast.error('فشل تحديث الحالة'); }
  };

  const handleSendAppointment = () => {
    const selected = allTickets.filter(t => selectedTicketIds.includes(t.id));
    if (selected.length === 0) return;
    const byClient = new Map<string, Ticket[]>();
    selected.forEach(t => {
      const key = t.clientId || t.unitId || t.id;
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(t);
    });
    byClient.forEach(clientTickets => {
      const first = clientTickets[0];
      const phone = clients[first?.clientId]?.phone ??
        Object.values(clients).find(c => String(c.unitId) === String(first?.unitId))?.phone ?? '';
      const ids = clientTickets.map(t => t.ticketId || t.refNumber || t.id).join('، ');
      WhatsAppService.sendUpdate(phone,
        `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ids}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`
      );
    });
  };

  const selectedInView = allTickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedInView.map(t => t.clientId || t.unitId || t.id));

  useEffect(() => {
    if (!user) return;
    clientsApi.getAll().then((all: any[]) => {
      const map: Record<string, Client> = {};
      all.forEach((c: any) => { map[c.id] = c as Client; });
      setClients(map);
    }).catch(() => {});
  }, [user?.uid]);

  const loadDashboard = async () => {
    if (!user) return;
    try {
      const allProjects: Project[] = (await projectsApi.getAll()) as Project[];
      const filtered = user.role === 'admin' ? allProjects : allProjects.filter(p => user.projectIds?.includes(p.id));
      setUserProjects(filtered);
      setStats(prev => ({ ...prev, activeProjects: filtered.length }));

      const params: Parameters<typeof ticketsApi.getAll>[0] = {};
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length) params.projectIds = user.projectIds;

      const tickets: Ticket[] = (await getCachedTickets(
        () => ticketsApi.getAll(params) as Promise<any[]>,
        params as any,
        (fresh) => {
          setAllTickets(fresh as Ticket[]);
          setStats(prev => ({
            ...prev,
            totalTickets: fresh.length,
            openTickets: fresh.filter((t: any) => t.status === 'open').length,
          }));
        },
      )) as Ticket[];
      setAllTickets(tickets);
      setStats(prev => ({
        ...prev,
        totalTickets: tickets.length,
        openTickets: tickets.filter(t => t.status === 'open').length,
      }));

      const techs = await techniciansApi.getAll();
      setStats(prev => ({ ...prev, totalTechnicians: techs.length }));
    } catch (err) {
      console.error('[Dashboard] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadKpi = async () => {
    try {
      const data = await dashboardApi.getStats(selectedProject === 'all' ? undefined : selectedProject);
      setKpi(data);
      setLastRefresh(new Date());
    } catch {}
    finally { setKpiLoading(false); }
  };

  useEffect(() => { loadDashboard(); }, [user]);

  useEffect(() => {
    loadKpi();
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(loadKpi, 30_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [selectedProject]);

  /* ── Stat card definitions ────────────────────────────────────── */
  const statCards = [
    {
      label: 'تذاكر مفتوحة',
      value: stats.openTickets,
      icon: Clock,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
    {
      label: 'إجمالي التذاكر',
      value: stats.totalTickets,
      icon: CheckCircle2,
      color: 'text-primary',
      bg: 'bg-primary/10',
      border: 'border-primary/20',
    },
    {
      label: 'المشاريع النشطة',
      value: stats.activeProjects,
      icon: Briefcase,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      label: 'إجمالي الفنيين',
      value: stats.totalTechnicians,
      icon: HardHat,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
  ];

  /* ── Quick actions per role ───────────────────────────────────── */
  const QuickActions = () => {
    if (!user) return null;
    const btnBase = 'w-full justify-start gap-3 h-12 rounded-2xl border border-border bg-card hover:bg-muted text-foreground font-semibold transition-all';

    const actions: Record<string, React.ReactNode[]> = {
      admin: [
        <ProjectForm key="project" trigger={
          <Button className={btnBase}><Briefcase className="w-4.5 h-4.5 text-primary" />مشروع جديد</Button>
        } />,
        <Link key="team" to="/team" className="w-full">
          <Button className={btnBase}><UserPlus className="w-4.5 h-4.5 text-emerald-500" />إضافة مهندس</Button>
        </Link>,
      ],
      engineer: [
        <ClientForm key="client" trigger={
          <Button className={btnBase}><UserCheck className="w-4.5 h-4.5 text-primary" />عميل جديد</Button>
        } onSuccess={loadDashboard} />,
        <TicketForm key="ticket" trigger={
          <Button className={btnBase}><Plus className="w-4.5 h-4.5 text-orange-500" />تذكرة جديدة</Button>
        } onSuccess={loadDashboard} />,
      ],
      supervisor: [
        <TechnicianForm key="tech" trigger={
          <Button className={btnBase}><HardHat className="w-4.5 h-4.5 text-amber-500" />فني جديد</Button>
        } />,
        <Link key="appointments" to="/tickets" className="w-full">
          <Button className={btnBase}><Calendar className="w-4.5 h-4.5 text-purple-500" />جدولة موعد</Button>
        </Link>,
        <Link key="reassign" to="/tickets" className="w-full">
          <Button className={btnBase}><UserPlus className="w-4.5 h-4.5 text-amber-500" />إعادة تعيين مشرف</Button>
        </Link>,
      ],
    };

    return (
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground text-right">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 gap-2">
          {(actions[user.role as keyof typeof actions] || []).map((action, i) => (
            <React.Fragment key={i}>{action}</React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Page Header ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">لوحة القيادة</h1>
              <p className="text-muted-foreground mt-1 text-sm">نظرة عامة على أداء نظام الصيانة</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {userProjects.length > 0 && (
              <select
                className="bg-card border border-border text-foreground text-sm rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                <option value="all">كل المشاريع</option>
                {userProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <div className="hidden sm:flex items-center gap-3">
              {user?.role === 'admin' && <ProjectForm />}
              {(user?.role === 'admin' || user?.role === 'engineer') && (
                <TicketForm onSuccess={loadDashboard} />
              )}
            </div>
          </div>
        </div>

        {/* ── Live KPI Cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
          {[
            { label: 'متأخرة +7 أيام', value: kpi?.totals?.overdue ?? 0,       icon: AlertTriangle, color: 'text-red-500',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
            { label: 'مفتوحة الآن',    value: kpi?.totals?.open ?? 0,           icon: Clock,         color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
            { label: 'أُغلقت اليوم',   value: kpi?.totals?.closedToday ?? 0,   icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
            { label: 'مواعيد اليوم',   value: kpi?.todayAppts?.length ?? 0,    icon: CalendarCheck, color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
          ].map(k => (
            <div key={k.label} className={cn('bg-card border rounded-2xl p-4 flex flex-col gap-2', k.border)}>
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', k.bg)}>
                <k.icon className={cn('w-4 h-4', k.color)} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{k.label}</p>
                <p className={cn('text-2xl font-black tabular-nums', kpiLoading ? 'opacity-30' : '')}>{k.value.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Today's Appointments + Overdue + Trend + Warranties ──────────── */}
        {kpi && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" dir="rtl">

            {/* Overdue */}
            <div className="bg-card border border-red-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px] text-red-400">{kpi.totals.overdue}</Badge>
                <h3 className="font-bold text-sm flex items-center gap-1.5 text-red-400"><AlertTriangle className="w-3.5 h-3.5" /> تذاكر متأخرة</h3>
              </div>
              <div className="divide-y divide-border/50 max-h-52 overflow-y-auto">
                {kpi.overdueTickets.length === 0
                  ? <p className="text-center text-muted-foreground text-xs py-6">لا توجد تذاكر متأخرة 🎉</p>
                  : kpi.overdueTickets.map((t: any) => (
                    <Link to={`/tickets/${t.id}`} key={t.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-foreground">{t.clientName} — {t.unitNumber}</p>
                        <p className="text-[10px] text-muted-foreground">#{t.ticketId}</p>
                      </div>
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded" dir="ltr">+{t.daysOpen}ي</span>
                    </Link>
                  ))}
              </div>
            </div>

            {/* Expiring Warranties */}
            <div className="bg-card border border-amber-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px] text-amber-500">{kpi.expiringWarranties?.length || 0}</Badge>
                <h3 className="font-bold text-sm flex items-center gap-1.5 text-amber-500"><Clock className="w-3.5 h-3.5" /> انتهاء الضمان قريباً</h3>
              </div>
              <div className="divide-y divide-border/50 max-h-52 overflow-y-auto">
                {!kpi.expiringWarranties || kpi.expiringWarranties.length === 0
                  ? <p className="text-center text-muted-foreground text-xs py-6">لا يوجد ضمانات تقارب الانتهاء</p>
                  : kpi.expiringWarranties.map((u: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-foreground">{u.clientName} — {u.unitNumber}</p>
                        <p className="text-[10px] text-muted-foreground" dir="ltr">{u.clientPhone}</p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded" dir="ltr">{u.warrantyExpiryDate}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Upcoming appointments */}
            <div className="bg-card border border-blue-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px] text-blue-400">{kpi.todayAppts.length}</Badge>
                <h3 className="font-bold text-sm flex items-center gap-1.5 text-blue-400"><CalendarCheck className="w-3.5 h-3.5" /> المواعيد القادمة</h3>
              </div>
              <div className="divide-y divide-border/50 max-h-52 overflow-y-auto">
                {kpi.todayAppts.length === 0
                  ? <p className="text-center text-muted-foreground text-xs py-6">لا توجد مواعيد قادمة</p>
                  : kpi.todayAppts.map((t: any) => (
                    <Link to={`/tickets/${t.id}`} key={t.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-foreground">{t.clientName} — {t.unitNumber}</p>
                        <p className="text-[10px] text-muted-foreground">{t.type}</p>
                      </div>
                      <span className="text-[10px] text-blue-400 font-bold max-w-[85px] text-left truncate" title={t.appointmentTime || ''} dir="ltr">{t.appointmentTime || '---'}</span>
                    </Link>
                  ))}
              </div>
            </div>

            {/* 7-day trend */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <button onClick={loadKpi} className="text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <h3 className="font-bold text-sm flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-primary" /> آخر 7 أيام</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={kpi.trend7Days} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false}
                      tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: any, n: any) => [v, n]} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11, direction: 'rtl' }} />
                    <Bar dataKey="opened" name="مفتوحة" fill="#f97316" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="closed"  name="مغلقة"  fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[9px] text-muted-foreground text-center mt-1">
                  آخر تحديث: {lastRefresh.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Supervisor Summary ─────────────────────────────── */}
        {kpi?.bySupervisor?.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden" dir="rtl">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px]">{kpi.bySupervisor.length} مشرف</Badge>
              <h3 className="font-bold text-sm flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" /> التذاكر المفتوحة لكل مشرف</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0 divide-x divide-x-reverse divide-border">
              {kpi.bySupervisor.slice(0, 5).map((s: any) => (
                <div key={s.uid} className="p-3 text-center space-y-1">
                  <p className="text-xl font-black tabular-nums text-foreground">{s.total}</p>
                  <p className="text-[10px] font-semibold text-foreground truncate">{s.name}</p>
                  <div className="flex justify-center gap-2 text-[9px]">
                    <span className="text-orange-400">{s.open} م</span>
                    <span className="text-indigo-400">{s.inProgress} ت</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stat Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(stat => (
            <div
              key={stat.label}
              className={cn(
                'bg-card border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5',
                stat.border
              )}
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.bg)}>
                <stat.icon className={cn('w-5 h-5', stat.color)} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
                  {stat.label}
                </p>
                {loading
                  ? <div className="h-8 w-12 shimmer rounded-lg ml-auto" />
                  : <p className="text-3xl font-black text-foreground tabular-nums tracking-tighter leading-none">{stat.value}</p>
                }
              </div>
            </div>
          ))}
        </div>

        {/* ── Tickets Table ────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <Link to="/tickets">
              <Button variant="ghost" className="text-primary hover:text-primary/80 gap-1.5 font-bold text-sm h-8 px-3">
                عرض الكل <ArrowUpRight className="w-4 h-4" />
              </Button>
            </Link>
            <h2 className="text-base font-bold text-foreground">جميع التذاكر</h2>
          </div>
          <TicketTable
            tickets={allTickets}
            loading={loading}
            hideSupervisorColumn={user?.role === 'supervisor'}
            hideProjectColumn={user?.role !== 'admin' && userProjects.length <= 1}
            emptyMessage="لا توجد تذاكر"
            selectedIds={selectedTicketIds}
            onSelectionChange={setSelectedTicketIds}
            projects={Object.fromEntries(userProjects.map(p => [p.id, p]))}
            showInlineFilters
          />
        </div>

        {/* ── Projects Overview + Quick Actions ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                {user?.role === 'admin' && (
                  <Link to="/projects">
                    <Button variant="ghost" className="text-primary hover:text-primary/80 gap-1.5 font-bold text-sm h-8 px-3">
                      <ArrowUpRight className="w-4 h-4" /> عرض الكل
                    </Button>
                  </Link>
                )}
              </div>
              <h2 className="text-base font-bold text-foreground">نظرة على المشاريع</h2>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[0, 1].map(i => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                    <div className="h-5 shimmer rounded-lg w-3/4 ml-auto" />
                    <div className="h-4 shimmer rounded-lg w-1/2 ml-auto" />
                    <div className="h-px bg-border mt-4" />
                    <div className="h-4 shimmer rounded-lg w-2/3 ml-auto" />
                  </div>
                ))}
              </div>
            ) : userProjects.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Briefcase className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-foreground font-bold">لا توجد مشاريع مخصصة</h3>
                <p className="text-muted-foreground text-sm mt-1">سيتم ظهور المشاريع المخصصة لك هنا</p>
              </div>
            ) : userProjects.length === 1 && user?.role !== 'admin' ? (
              <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between gap-3">
                <Link to="/tickets">
                  <Button variant="ghost" className="text-primary gap-1.5 font-bold text-sm h-8 px-3">
                    <ArrowUpRight className="w-4 h-4" /> التذاكر
                  </Button>
                </Link>
                <div className="text-right flex-1 min-w-0">
                  <h3 className="font-bold text-foreground truncate">{userProjects[0].name}</h3>
                  <p className="text-muted-foreground text-xs">{userProjects[0].location}</p>
                </div>
                <Badge className="bg-primary/10 text-primary border-primary/20 font-bold shrink-0">مشروعي</Badge>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {userProjects.map(project => (
                  <div
                    key={project.id}
                    className="bg-card border border-border rounded-2xl p-5 group hover:border-primary/30 hover:shadow-md transition-all duration-300 cursor-pointer"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div className="text-right flex-1 min-w-0">
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors truncate">{project.name}</h3>
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">{project.abbreviation}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <Button
                        variant="ghost"
                        className="text-primary gap-1 p-0 h-auto font-bold text-xs hover:bg-transparent"
                        onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />التذاكر
                      </Button>
                      <p className="text-xs text-muted-foreground">{project.location}</p>
                    </div>
                  </div>
                ))}
                {user?.role === 'admin' && (
                  <ProjectForm trigger={
                    <button className="w-full bg-card border-2 border-dashed border-border rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-2 hover:border-primary/40 hover:bg-primary/2 transition-all cursor-pointer min-h-[130px]">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                        <Plus className="w-5 h-5" />
                      </div>
                      <span className="text-muted-foreground font-semibold text-sm">إضافة مشروع</span>
                    </button>
                  } />
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div>
            <QuickActions />
          </div>
        </div>

      </div>

      {/* Bulk Action Bar */}
      {selectedTicketIds.length > 0 && (
        <BulkActionBar
          count={selectedTicketIds.length}
          isMultiClient={uniqueClientIds.size > 1}
          onStatusChange={handleBulkStatusChange}
          onAppointment={handleSendAppointment}
          onContractor={() => setContractorDialogOpen(true)}
          onClose={() => setCloseDialogOpen(true)}
          onClear={() => setSelectedTicketIds([])}
        />
      )}

      <CloseTicketDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        selectedTickets={allTickets.filter(t => selectedTicketIds.includes(t.id))}
        clients={Object.values(clients)}
        projects={Object.fromEntries(userProjects.map(p => [p.id, p]))}
        onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); loadDashboard(); }}
      />

      <AssignContractorDialog
        open={contractorDialogOpen}
        onOpenChange={setContractorDialogOpen}
        tickets={allTickets.filter(t => selectedTicketIds.includes(t.id))}
        projectId={allTickets.find(t => selectedTicketIds.includes(t.id))?.projectId || ''}
        onSuccess={() => { setContractorDialogOpen(false); setSelectedTicketIds([]); loadDashboard(); }}
      />
    </Layout>
  );
}
