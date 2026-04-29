import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Briefcase,
  HardHat,
  UserPlus,
  UserCheck,
  Calendar,
  ChevronLeft,
  X,
  ChevronDown,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { TicketForm } from '@/components/tickets/TicketForm';
import {
  TicketTable,
  statusTranslations,
  typeTranslations,
  BulkActionBar,
} from '@/components/tickets/TicketTable';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { WhatsAppService } from '@/services/whatsappService';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ClientForm } from '@/components/clients/ClientForm';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ticketsApi, projectsApi, clientsApi, techniciansApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { Project, Ticket, Client, TicketType } from '@/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ReportsSection } from '@/components/reports/ReportsSection';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    activeProjects: 0,
    totalTechnicians: 0,
  });
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [clients, setClients] = useState<Record<string, Client>>({});

  /* ── Bulk status change ──────────────────────────────────── */
  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
      toast.success(`تم تحديث ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]);
      loadDashboard();
    } catch {
      toast.error('فشل تحديث الحالة');
    }
  };

  /* ── WhatsApp appointment ─────────────────────────────────── */
  const handleSendAppointment = () => {
    const selected = allTickets.filter(t => selectedTicketIds.includes(t.id));
    if (selected.length === 0) return;
    const byClient = new Map<string, Ticket[]>();
    selected.forEach(t => {
      const key = t.clientId || t.villaNumber || 'unknown';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(t);
    });
    byClient.forEach((clientTickets) => {
      const first = clientTickets[0];
      const phone =
        clients[first?.clientId]?.phone ??
        Object.values(clients).find(c => c.villaNumber === first?.villaNumber)?.phone ?? '';
      const ids = clientTickets.map(t => t.ticketId || t.refNumber || t.id).join('، ');
      const msg = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ids}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
      WhatsAppService.sendUpdate(phone, msg);
    });
  };

  const selectedInView = allTickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedInView.map(t => t.clientId || t.villaNumber || 'unknown'));
  const isMultiClient = uniqueClientIds.size > 1;

  /* ── Load clients map ─────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    clientsApi.getAll().then((all: any[]) => {
      const map: Record<string, Client> = {};
      all.forEach((c: any) => { map[c.id] = c as Client; });
      setClients(map);
    }).catch(() => {});
  }, [user?.uid]);

  /* ── Main data load ───────────────────────────────────────── */
  const loadDashboard = async () => {
    if (!user) return;
    try {
      // Projects
      const allProjects: Project[] = (await projectsApi.getAll()) as Project[];
      const filtered =
        user.role === 'admin'
          ? allProjects
          : allProjects.filter(p => user.projectIds?.includes(p.id));
      setUserProjects(filtered);
      setStats(prev => ({ ...prev, activeProjects: filtered.length }));

      // Tickets — role-based filter, ALL (no slice)
      const params: Parameters<typeof ticketsApi.getAll>[0] = {};
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length)
        params.projectIds = user.projectIds;

      const tickets: Ticket[] = (await ticketsApi.getAll(params)) as Ticket[];
      setAllTickets(tickets);
      setStats(prev => ({
        ...prev,
        totalTickets: tickets.length,
        openTickets: tickets.filter(t => t.status === 'open').length,
      }));

      // Technicians
      const techs = await techniciansApi.getAll();
      setStats(prev => ({ ...prev, totalTechnicians: techs.length }));
    } catch (err) {
      console.error('[Dashboard] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  /* ── Stat cards data ──────────────────────────────────────── */
  const statCards = [
    {
      label: 'التذاكر المفتوحة',
      value: stats.openTickets,
      icon: Clock,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      label: 'إجمالي التذاكر',
      value: stats.totalTickets,
      icon: CheckCircle2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'المشاريع النشطة',
      value: stats.activeProjects,
      icon: Briefcase,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'إجمالي الفنيين',
      value: stats.totalTechnicians,
      icon: HardHat,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  /* ── Quick actions per role ───────────────────────────────── */
  const QuickActions = () => {
    if (!user) return null;

    const btnClass =
      'w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border';

    const actions: Record<string, React.ReactNode[]> = {
      admin: [
        <ProjectForm
          key="project"
          trigger={
            <Button className={btnClass}>
              <Briefcase className="w-5 h-5 text-blue-500" />
              مشروع جديد
            </Button>
          }
        />,
        <Link key="team" to="/team" className="w-full">
          <Button className={btnClass}>
            <UserPlus className="w-5 h-5 text-emerald-500" />
            إضافة مهندس
          </Button>
        </Link>,
      ],
      engineer: [
        <ClientForm
          key="client"
          trigger={
            <Button className={btnClass}>
              <UserCheck className="w-5 h-5 text-blue-500" />
              عميل جديد
            </Button>
          }
          onSuccess={loadDashboard}
        />,
        <TicketForm
          key="ticket"
          trigger={
            <Button className={btnClass}>
              <Plus className="w-5 h-5 text-orange-500" />
              تذكرة جديدة
            </Button>
          }
          onSuccess={loadDashboard}
        />,
      ],
      supervisor: [
        <TechnicianForm
          key="tech"
          trigger={
            <Button className={btnClass}>
              <HardHat className="w-5 h-5 text-amber-500" />
              فني جديد
            </Button>
          }
        />,
        <Link key="appointments" to="/tickets" className="w-full">
          <Button className={btnClass}>
            <Calendar className="w-5 h-5 text-purple-500" />
            جدولة موعد
          </Button>
        </Link>,
        <Link key="reassign" to="/tickets" className="w-full">
          <Button className={btnClass}>
            <UserPlus className="w-5 h-5 text-amber-500" />
            إعادة تعيين مشرف
          </Button>
        </Link>,
      ],
    };

    const userActions = actions[user.role as keyof typeof actions] || [];

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white text-right">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 gap-3">
          {userActions.map((action, i) => (
            <React.Fragment key={i}>{action}</React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  /* ────────────────────────── JSX ────────────────────────────── */
  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-700">

        {/* ── Page Header ──────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
          <div className="text-right order-2 md:order-1">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
              لوحة التحكم
            </h1>
            <p className="text-slate-500 mt-2 text-base md:text-lg">
              مرحباً بك، {user?.displayName}. إليك ملخص الصيانة اليوم.
            </p>
          </div>
          <div className="flex items-center gap-3 order-1 md:order-2 self-end md:self-auto">
            {user?.role === 'admin' && <ProjectForm />}
            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <TicketForm onSuccess={loadDashboard} />
            )}
          </div>
        </div>

        {/* ── Stat Cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statCards.map(stat => (
            <Card
              key={stat.label}
              className="bg-card border-border shadow-lg shadow-black/20 rounded-2xl overflow-hidden group hover:border-blue-500/30 transition-all"
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    'p-2 rounded-xl transition-all group-hover:scale-110',
                    stat.bg
                  )}
                >
                  <stat.icon className={cn('h-4 w-4', stat.color)} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1 text-right">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-black text-white tabular-nums tracking-tighter">
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tickets Table — FULL WIDTH, ALL TICKETS ──────────── */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/40">

          {/* Table header */}
          <div className="flex flex-col gap-3 px-5 py-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Link to="/tickets">
                <Button
                  variant="ghost"
                  className="text-blue-400 hover:text-blue-300 gap-2 font-bold text-sm"
                >
                  عرض الكل <ArrowUpRight className="w-4 h-4" />
                </Button>
              </Link>
              <h2 className="text-xl font-bold text-white">جميع التذاكر</h2>
            </div>
          </div>

          {/* Ticket table — full height */}
          <TicketTable
            tickets={allTickets}
            loading={loading}
            hideSupervisorColumn={user?.role === 'supervisor'}
            hideProjectColumn={user?.role !== 'admin' && userProjects.length <= 1}
            emptyMessage='لا توجد تذاكر'
            selectedIds={selectedTicketIds}
            onSelectionChange={setSelectedTicketIds}
            projects={Object.fromEntries(userProjects.map(p => [p.id, p]))}
            showInlineFilters
          />
        </div>

        {/* ── Grid: Projects Overview + Quick Actions ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Projects Overview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">نظرة عامة على المشاريع</h2>
              {user?.role === 'admin' && (
                <Link to="/projects">
                  <Button
                    variant="ghost"
                    className="text-blue-400 hover:text-blue-300 gap-2 font-bold text-sm"
                  >
                    <ArrowUpRight className="w-4 h-4" />عرض الكل
                  </Button>
                </Link>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            ) : userProjects.length === 0 ? (
              <div className="bg-card border border-border border-dashed rounded-3xl p-12 text-center">
                <Briefcase className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-white font-bold text-lg">لا توجد مشاريع مخصصة</h3>
                <p className="text-slate-500 text-sm mt-2">
                  سيتم ظهور المشاريع المخصصة لك هنا.
                </p>
              </div>
            ) : userProjects.length === 1 &&
              (user?.role === 'engineer' || user?.role === 'supervisor') ? (
              <div className="bg-card border border-border rounded-3xl p-5 flex items-center justify-between shadow-lg">
                <Link to="/tickets">
                  <Button
                    variant="ghost"
                    className="text-blue-400 hover:text-blue-300 gap-2 font-bold text-sm"
                  >
                    <ArrowUpRight className="w-4 h-4" />عرض تذاكر المشروع
                  </Button>
                </Link>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-white">{userProjects[0].name}</h3>
                  <p className="text-slate-500 text-xs mt-0.5">{userProjects[0].location}</p>
                </div>
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 px-3 py-1 font-bold shrink-0">
                  مشروعي المخصص
                </Badge>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userProjects.map(project => (
                  <Card
                    key={project.id}
                    className="bg-card border-border shadow-lg shadow-black/20 rounded-3xl overflow-hidden group hover:border-blue-500/30 transition-all cursor-pointer"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                          <Briefcase className="w-5 h-5" />
                        </div>
                        <div className="text-right">
                          <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                            {project.name}
                          </h3>
                          <p className="text-slate-500 text-xs tracking-widest uppercase font-bold">
                            {project.abbreviation}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                        <Button
                          variant="ghost"
                          className="text-blue-400 group-hover:-translate-x-1 transition-transform p-0 h-auto font-bold text-xs"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/projects/${project.id}`);
                          }}
                        >
                          <ChevronLeft className="w-4 h-4" />عرض التذاكر
                        </Button>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                            الموقع
                          </p>
                          <p className="text-xs text-slate-300 font-bold">{project.location}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {user?.role === 'admin' && (
                  <ProjectForm
                    trigger={
                      <button className="w-full bg-card border-border border-dashed border-2 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-3 hover:border-blue-500/50 hover:bg-white/[0.02] transition-all cursor-pointer min-h-[140px] outline-none">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                          <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-slate-400 font-bold text-sm">
                          إضافة مشروع جديد
                        </span>
                      </button>
                    }
                  />
                )}
              </div>
            )}
          </div>

          {/* Quick Actions sidebar */}
          <div className="space-y-6">
            <QuickActions />
          </div>
        </div>

        {/* ── Reports & Charts ─────────────────────────────────── */}
        <ReportsSection tickets={allTickets} projects={userProjects} userRole={user?.role} />

      </div>

      {/* ── Floating Bulk Action Bar ──────────────────────────── */}
      {selectedTicketIds.length > 0 && (
        <BulkActionBar
          count={selectedTicketIds.length}
          isMultiClient={isMultiClient}
          onStatusChange={handleBulkStatusChange}
          onAppointment={handleSendAppointment}
          onClose={() => setCloseDialogOpen(true)}
          onClear={() => setSelectedTicketIds([])}
        />
      )}

      {/* ── Close Ticket Dialog ───────────────────────────────── */}
      <CloseTicketDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        selectedTickets={allTickets.filter(t => selectedTicketIds.includes(t.id))}
        clients={Object.values(clients)}
        projects={Object.fromEntries(userProjects.map(p => [p.id, p]))}
        onSuccess={() => {
          setSelectedTicketIds([]);
          setCloseDialogOpen(false);
          loadDashboard();
        }}
      />
    </Layout>
  );
}
