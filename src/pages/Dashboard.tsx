import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Briefcase,
  Users,
  HardHat,
  UserPlus,
  UserCheck,
  Calendar,
  ChevronLeft,
  X,
  ChevronDown,
  Edit,
  MessageCircle,
  CheckSquare
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { TicketForm } from '@/components/tickets/TicketForm';
import { TicketTable, statusTranslations, typeTranslations } from '@/components/tickets/TicketTable';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { WhatsAppService } from '@/services/whatsappService';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ClientForm } from '@/components/clients/ClientForm';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { collection, collectionGroup, onSnapshot, query, where, getCountFromServer, orderBy, limit, doc, getDoc, Query, DocumentData, writeBatch, updateDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { Project, Ticket, Client, TicketType } from '@/types';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    activeProjects: 0,
    totalTechnicians: 0
  });
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [dashSearch, setDashSearch] = useState('');
  const [dashFilterStatus, setDashFilterStatus] = useState('');
  const [dashFilterType, setDashFilterType] = useState('');
  const [dashFilterPriority, setDashFilterPriority] = useState('');
  const [dashFilterProject, setDashFilterProject] = useState('');

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      const db = getFirestoreDb();
      const batch = writeBatch(db);
      selectedTicketIds.forEach(id => batch.update(doc(db, 'tickets', id), { status: newStatus }));
      await batch.commit();
      toast.success(`تم تحديث ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]);
    } catch {
      toast.error('فشل تحديث الحالة');
    }
  };

  const handleSendAppointment = () => {
    const selected = recentTickets.filter(t => selectedTicketIds.includes(t.id));
    if (selected.length === 0) return;
    const byClient = new Map<string, typeof selected>();
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

  const selectedInView = recentTickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedInView.map(t => t.clientId || t.villaNumber || 'unknown'));
  const isMultiClient = uniqueClientIds.size > 1;

  const priorityTranslations: Record<string, string> = {
    '3': '3 - منخفض',
    '4': '4 - عادي',
    '6': '6 - متوسط',
    '7': '7 - مرتفع',
    '9': '9 - عاجل جداً',
  };

  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();
    const unsub = onSnapshot(collectionGroup(db, 'clients'), snap => {
      const map: Record<string, Client> = {};
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as Client; });
      setClients(map);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();

    // 1. Fetch Stats
    const fetchStats = async () => {
      const ticketsRef = collection(db, 'tickets');
      const projectsRef = collection(db, 'projects');
      const techsRef = collection(db, 'technicians');

      // Admin sees everything, others see their projects
      let ticketQuery: Query<DocumentData> | null = ticketsRef;
      let projectQuery: Query<DocumentData> | null = projectsRef;

      if (user.role !== 'admin') {
        if (user.role === 'supervisor') {
          // Supervisors only see tickets assigned to them specifically
          ticketQuery = query(ticketsRef, where('assignedSupervisorIds', 'array-contains', user.uid));
          projectQuery = (user.projectIds?.length ?? 0) > 0
            ? query(projectsRef, where('__name__', 'in', user.projectIds))
            : null;
        } else if (user.projectIds && user.projectIds.length > 0) {
          ticketQuery = query(ticketsRef, where('projectId', 'in', user.projectIds));
          projectQuery = query(projectsRef, where('__name__', 'in', user.projectIds));
        } else {
          ticketQuery = null;
          projectQuery = null;
        }
      }

      const totalTickets    = ticketQuery  ? await getCountFromServer(ticketQuery).then(s => s.data().count).catch(() => 0) : 0;
      const openTickets     = ticketQuery  ? await getCountFromServer(query(ticketQuery, where('status', '==', 'open'))).then(s => s.data().count).catch(() => 0) : 0;
      const activeProjects  = projectQuery ? await getCountFromServer(projectQuery).then(s => s.data().count).catch(() => 0) : 0;
      const totalTechnicians = await getCountFromServer(techsRef).then(s => s.data().count).catch(() => 0);

      setStats({ totalTickets, openTickets, activeProjects, totalTechnicians });
    };

    // 2. Fetch user's projects
    let projectsQuery: ReturnType<typeof query> | null = null;
    if (user.role === 'admin') {
      projectsQuery = query(collection(db, 'projects'));
    } else if (user.projectIds && user.projectIds.length > 0) {
      projectsQuery = query(collection(db, 'projects'), where('__name__', 'in', user.projectIds));
    }

    let unsubscribeProjects = () => {};
    if (projectsQuery) {
      unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Project));
        setUserProjects(projects);
        setLoading(false);
      }, (err) => {
        console.error('[Dashboard] projects snapshot error:', err.code);
        setLoading(false);
      });
    } else {
      setUserProjects([]);
      setLoading(false);
    }

    // 3. Fetch recent tickets
    let ticketsQuery: ReturnType<typeof query> | null = null;
    if (user.role === 'admin') {
      ticketsQuery = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(10));
    } else if (user.role === 'supervisor') {
      // Supervisors only see their assigned tickets
      ticketsQuery = query(collection(db, 'tickets'), where('assignedSupervisorIds', 'array-contains', user.uid), limit(50));
    } else if (user.projectIds && user.projectIds.length > 0) {
      ticketsQuery = query(collection(db, 'tickets'), where('projectId', 'in', user.projectIds), limit(50));
    }

    let unsubscribeTickets = () => {};
    if (ticketsQuery) {
      unsubscribeTickets = onSnapshot(ticketsQuery, (snapshot) => {
        const tickets = snapshot.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Ticket))
          .sort((a, b) => {
            const ta = (a.createdAt as any)?.toMillis?.() ?? new Date(a.createdAt as any).getTime() ?? 0;
            const tb = (b.createdAt as any)?.toMillis?.() ?? new Date(b.createdAt as any).getTime() ?? 0;
            return tb - ta;
          })
          .slice(0, 10);
        setRecentTickets(tickets);
      }, (err) => {
        console.error('[Dashboard] tickets snapshot error:', err.code);
        setRecentTickets([]);
      });
    } else {
      setRecentTickets([]);
    }

    fetchStats();
    
    return () => {
      unsubscribeProjects();
      unsubscribeTickets();
    };
  }, [user]);

  const filteredDashTickets = recentTickets.filter(t => {
    const s = dashSearch.toLowerCase();
    const matchSearch = !s ||
      t.villaNumber?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      t.clientName?.toLowerCase().includes(s) ||
      t.ticketId?.toLowerCase().includes(s) ||
      t.refNumber?.toLowerCase().includes(s);
    const matchStatus = !dashFilterStatus || t.status === dashFilterStatus;
    const matchType = !dashFilterType ||
      t.type === dashFilterType ||
      (t.detectedTypes as string[] | undefined)?.includes(dashFilterType as TicketType);
    const matchPriority = !dashFilterPriority || String(t.priority) === dashFilterPriority;
    const matchProject = !dashFilterProject || t.projectId === dashFilterProject;
    return matchSearch && matchStatus && matchType && matchPriority && matchProject;
  });
  const activeDashFilters = [dashFilterStatus, dashFilterType, dashFilterPriority, dashFilterProject].filter(Boolean).length;
  const clearDashFilters = () => {
    setDashSearch(''); setDashFilterStatus(''); setDashFilterType('');
    setDashFilterPriority(''); setDashFilterProject('');
  };

  const statCards = [
    { label: 'التذاكر المفتوحة', value: stats.openTickets, icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'إجمالي التذاكر', value: stats.totalTickets, icon: CheckCircle2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'المشاريع النشطة', value: stats.activeProjects, icon: Briefcase, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'إجمالي الفنيين', value: stats.totalTechnicians, icon: HardHat, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  const QuickActions = () => {
    if (!user) return null;

    const actions = {
      admin: [
        { label: 'مشروع جديد', icon: Briefcase, component: <ProjectForm trigger={<Button className="w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border">مشروع جديد <Briefcase className="w-5 h-5 text-blue-500" /></Button>} /> },
        { label: 'إضافة مهندس', icon: UserPlus, component: <Link to="/team" className="w-full"><Button className="w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border">إضافة مهندس <UserPlus className="w-5 h-5 text-emerald-500" /></Button></Link> },
      ],
      engineer: [
        { label: 'عميل جديد', icon: UserCheck, component: <ClientForm trigger={<Button className="w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border">عميل جديد <UserCheck className="w-5 h-5 text-blue-500" /></Button>} /> },
        { label: 'تذكرة جديدة', icon: Plus, component: <TicketForm trigger={<Button className="w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border">تذكرة جديدة <Plus className="w-5 h-5 text-orange-500" /></Button>} /> },
      ],
      supervisor: [
        { label: 'فني جديد', icon: HardHat, component: <TechnicianForm trigger={<Button className="w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border">فني جديد <HardHat className="w-5 h-5 text-amber-500" /></Button>} /> },
        { label: 'موعد جديد', icon: Calendar, component: <Link to="/tickets" className="w-full"><Button className="w-full justify-end gap-3 h-14 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl border border-border">جدولة موعد <Calendar className="w-5 h-5 text-purple-500" /></Button></Link> },
      ]
    };

    const userActions = actions[user.role as keyof typeof actions] || [];

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white text-right">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 gap-3">
          {userActions.map((action, i) => (
            <React.Fragment key={i}>
              {action.component}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
          <div className="text-right order-2 md:order-1">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">لوحة التحكم</h1>
            <p className="text-slate-500 mt-2 text-base md:text-lg">مرحباً بك، {user?.displayName}. إليك ملخص الصيانة اليوم.</p>
          </div>
          <div className="flex items-center gap-3 order-1 md:order-2 self-end md:self-auto">
            {user?.role === 'admin' && <ProjectForm />}
            {(user?.role === 'admin' || user?.role === 'engineer') && <TicketForm />}
          </div>
        </div>

        {/* Project View Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-white">نظرة عامة على المشاريع</h2>
            {user?.role === 'admin' && (
              <Link to="/projects">
                <Button variant="ghost" className="text-blue-400 hover:text-blue-300 gap-2 font-bold text-sm">
                  عرض الكل
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : userProjects.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-3xl p-12 text-center">
              <Briefcase className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <h3 className="text-white font-bold text-lg">لا توجد مشاريع مخصصة</h3>
              <p className="text-slate-500 text-sm mt-2">سيتم ظهور المشاريع المخصصة لك هنا.</p>
            </div>
          ) : userProjects.length === 1 && (user?.role === 'engineer' || user?.role === 'supervisor') ? (
            <div className="bg-card border border-border rounded-3xl p-5 flex items-center justify-between shadow-lg">
              <Link to="/tickets">
                <Button variant="ghost" className="text-blue-400 hover:text-blue-300 gap-2 font-bold text-sm">
                  عرض تذاكر المشروع <ArrowUpRight className="w-4 h-4" />
                </Button>
              </Link>
              <div className="text-right">
                <h3 className="text-lg font-bold text-white">{userProjects[0].name}</h3>
                <p className="text-slate-500 text-xs mt-0.5">{userProjects[0].location}</p>
              </div>
              <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 px-3 py-1 font-bold shrink-0">مشروعي المخصص</Badge>
            </div>
          ) : (
            /* Admin or Multiple Projects View - Show Project Cards */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userProjects.map((project) => (
                <Card 
                  key={project.id} 
                  className="bg-card border-border shadow-lg shadow-black/20 rounded-3xl overflow-hidden group hover:border-blue-500/30 transition-all cursor-pointer"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                        <Briefcase className="w-6 h-6" />
                      </div>
                      <div className="text-right">
                        <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{project.name}</h3>
                        <p className="text-slate-500 text-xs tracking-widest uppercase font-bold">{project.abbreviation}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border pt-4">
                       <Button variant="ghost" className="text-blue-400 group-hover:translate-x-[-4px] transition-transform p-0 h-auto font-bold text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}>
                        عرض التذاكر
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">الموقع</p>
                          <p className="text-xs text-slate-300 font-bold">{project.location}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {user?.role === 'admin' && (
                <ProjectForm trigger={
                  <button className="w-full bg-card border-border border-dashed border-2 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-4 hover:border-blue-500/50 hover:bg-white/[0.02] transition-all cursor-pointer min-h-[160px] outline-none">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-blue-500">
                      <Plus className="w-6 h-6" />
                    </div>
                    <span className="text-slate-400 font-bold text-sm">إضافة مشروع جديد</span>
                  </button>
                } />
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-4">

          {/* ── Searchable ticket list ──────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white">آخر التذاكر</h2>
                {(dashSearch || activeDashFilters > 0) && (
                  <button
                    onClick={clearDashFilters}
                    className="text-[11px] font-bold text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    مسح {activeDashFilters > 0 ? `(${activeDashFilters})` : ''}
                  </button>
                )}
              </div>
              <Link to="/tickets">
                <Button variant="ghost" className="text-blue-400 hover:text-blue-300 gap-2 font-bold text-sm">
                  عرض الكل <ArrowUpRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="بحث برقم التذكرة أو العميل..."
                  value={dashSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDashSearch(e.target.value)}
                  className="pr-10 bg-card border-border rounded-xl h-10 text-white text-right text-sm"
                />
              </div>

              {/* Status – all roles */}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" size="sm" className={cn(
                    'border-border bg-card text-slate-300 rounded-xl h-10 gap-1.5 px-3 text-sm',
                    dashFilterStatus && 'border-blue-500/50 bg-blue-500/10 text-blue-300',
                  )}>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    {dashFilterStatus ? statusTranslations[dashFilterStatus] : 'الحالة'}
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterStatus('')}>كل الحالات</DropdownMenuItem>
                  {Object.entries(statusTranslations).map(([k, v]) => (
                    <DropdownMenuItem key={k} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterStatus(k)}>{v}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Type – supervisor sees specialty-filtered list; others see all */}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" size="sm" className={cn(
                    'border-border bg-card text-slate-300 rounded-xl h-10 gap-1.5 px-3 text-sm',
                    dashFilterType && 'border-blue-500/50 bg-blue-500/10 text-blue-300',
                  )}>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    {dashFilterType ? typeTranslations[dashFilterType as TicketType] : 'التخصص'}
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterType('')}>كل التخصصات</DropdownMenuItem>
                  {(() => {
                    const typeToSpec: Record<string, string[]> = {
                      plumbing: ['mechanics'], electricity: ['electricity'],
                      tank_insulation: ['mechanics'], doors: ['general'],
                      paints: ['general'], cracks: ['general'], ceramics: ['general'],
                    };
                    const userSpecs: string[] = user?.specialties?.length
                      ? (user.specialties as string[])
                      : user?.specialty ? [user.specialty as string] : [];
                    const entries = Object.entries(typeTranslations);
                    const visible = (user?.role === 'supervisor' && userSpecs.length)
                      ? entries.filter(([k]) => typeToSpec[k]?.some(s => userSpecs.includes(s)))
                      : entries;
                    return visible.map(([k, v]) => (
                      <DropdownMenuItem key={k} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterType(k)}>{v}</DropdownMenuItem>
                    ));
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Priority – admin + supervisor */}
              {(user?.role === 'admin' || user?.role === 'supervisor') && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="outline" size="sm" className={cn(
                      'border-border bg-card text-slate-300 rounded-xl h-10 gap-1.5 px-3 text-sm',
                      dashFilterPriority && 'border-amber-500/50 bg-amber-500/10 text-amber-300',
                    )}>
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      {dashFilterPriority ? (priorityTranslations[dashFilterPriority] ?? dashFilterPriority) : 'الأولوية'}
                    </Button>
                  } />
                  <DropdownMenuContent className="bg-card border-border text-slate-200">
                    <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterPriority('')}>كل الأولويات</DropdownMenuItem>
                    {(['9', '7', '6', '4', '3'] as const).map(p => (
                      <DropdownMenuItem key={p} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterPriority(p)}>
                        {priorityTranslations[p] ?? p}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Project – admin with multiple projects */}
              {user?.role === 'admin' && userProjects.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="outline" size="sm" className={cn(
                      'border-border bg-card text-slate-300 rounded-xl h-10 gap-1.5 px-3 text-sm',
                      dashFilterProject && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
                    )}>
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      {dashFilterProject ? (userProjects.find(p => p.id === dashFilterProject)?.name ?? 'المشروع') : 'المشروع'}
                    </Button>
                  } />
                  <DropdownMenuContent className="bg-card border-border text-slate-200">
                    <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterProject('')}>كل المشاريع</DropdownMenuItem>
                    {userProjects.map(p => (
                      <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setDashFilterProject(p.id)}>{p.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-lg shadow-black/30">
              <TicketTable
                tickets={filteredDashTickets}
                hideSupervisorColumn={user?.role === 'supervisor'}
                hideProjectColumn={user?.role !== 'admin' || userProjects.length <= 1}
                emptyMessage={dashSearch || activeDashFilters > 0 ? 'لا توجد نتائج مطابقة للفلتر' : 'لا توجد تذاكر حديثة'}
                maxHeight="480px"
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                projects={Object.fromEntries(userProjects.map(p => [p.id, p]))}
              />
            </div>
          </div>

          {/* ── Quick actions ─────────────────────────────────────────── */}
          <div className="space-y-6">
            <QuickActions />
          </div>
        </div>

        {/* Global Statistics Section - below tickets */}
        <div className="space-y-4 pt-6 border-t border-border">
          <h2 className="text-xl font-black text-white text-right">إحصائيات الصيانة العامة</h2>
          <div className="grid grid-cols-2 gap-3">
            {statCards.map((stat) => (
              <Card key={stat.label} className="bg-card border-border shadow-lg shadow-black/20 rounded-2xl overflow-hidden group hover:border-blue-500/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-all group-hover:scale-110", stat.bg)}>
                      <stat.icon className={cn("w-4 h-4", stat.color)} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">{stat.label}</span>
                  </div>
                  <div className="text-3xl font-black text-white tracking-tighter">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
      {/* Floating bulk action bar */}
      {selectedTicketIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/95 backdrop-blur-md border border-blue-500/30 rounded-2xl shadow-2xl shadow-black/60 px-3 py-2.5 w-[calc(100vw-2rem)] max-w-2xl">
          <div className="flex flex-col text-right px-3 border-r border-white/10 shrink-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">المختارة</span>
            <span className="text-lg font-black text-blue-400">{selectedTicketIds.length}</span>
          </div>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="sm" className="border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold rounded-xl gap-1.5 h-9 px-3">
                  <Edit className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">تغيير الحالة</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-slate-200">
                {Object.entries(statusTranslations).map(([k, v]) => (
                  <DropdownMenuItem key={k} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => handleBulkStatusChange(k)}>
                    {v}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              className="border-green-500/30 bg-green-500/10 text-green-400 font-bold rounded-xl gap-1.5 h-9 px-3"
              onClick={handleSendAppointment}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تحديد موعد</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={isMultiClient}
              title={isMultiClient ? 'الإغلاق يتطلب تذاكر لنفس العميل' : undefined}
              className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-bold rounded-xl gap-1.5 h-9 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setCloseDialogOpen(true)}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">إغلاق التذكرة</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-slate-500 hover:text-white h-9 w-9"
            onClick={() => setSelectedTicketIds([])}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <CloseTicketDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        selectedTickets={recentTickets.filter(t => selectedTicketIds.includes(t.id))}
        clients={Object.values(clients)}
        projects={Object.fromEntries(userProjects.map(p => [p.id, p]))}
        onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); }}
      />
    </Layout>
  );
}
