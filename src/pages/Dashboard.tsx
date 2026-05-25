import React, { useState, useEffect } from 'react';
import {
  Plus, ArrowUpRight, Clock, CheckCircle2, Briefcase, HardHat,
  UserPlus, UserCheck, Calendar, ChevronLeft, TrendingUp,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { TicketForm } from '@/components/tickets/TicketForm';
import { TicketTable, statusTranslations, typeTranslations, BulkActionBar } from '@/components/tickets/TicketTable';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { WhatsAppService } from '@/services/whatsappService';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ClientForm } from '@/components/clients/ClientForm';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { Button } from '@/components/ui/button';
import { ticketsApi, projectsApi, clientsApi, techniciansApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { Project, Ticket, Client } from '@/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ReportsSection } from '@/components/reports/ReportsSection';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ totalTickets: 0, openTickets: 0, activeProjects: 0, totalTechnicians: 0 });
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [clients, setClients] = useState<Record<string, Client>>({});

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
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
      const key = t.clientId || t.villaNumber || 'unknown';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(t);
    });
    byClient.forEach(clientTickets => {
      const first = clientTickets[0];
      const phone = clients[first?.clientId]?.phone ??
        Object.values(clients).find(c => c.villaNumber === first?.villaNumber)?.phone ?? '';
      const ids = clientTickets.map(t => t.ticketId || t.refNumber || t.id).join('، ');
      WhatsAppService.sendUpdate(phone,
        `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ids}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`
      );
    });
  };

  const selectedInView = allTickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedInView.map(t => t.clientId || t.villaNumber || 'unknown'));

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

      const tickets: Ticket[] = (await ticketsApi.getAll(params)) as Ticket[];
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

  useEffect(() => { loadDashboard(); }, [user]);

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
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight">
              لوحة التحكم
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              مرحباً، <span className="text-foreground font-semibold">{user?.displayName}</span>. إليك ملخص اليوم
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {user?.role === 'admin' && <ProjectForm />}
            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <TicketForm onSuccess={loadDashboard} />
            )}
          </div>
        </div>

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

        {/* ── Reports ─────────────────────────────────────────── */}
        <ReportsSection tickets={allTickets} projects={userProjects} userRole={user?.role} />
      </div>

      {/* Bulk Action Bar */}
      {selectedTicketIds.length > 0 && (
        <BulkActionBar
          count={selectedTicketIds.length}
          isMultiClient={uniqueClientIds.size > 1}
          onStatusChange={handleBulkStatusChange}
          onAppointment={handleSendAppointment}
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
    </Layout>
  );
}
