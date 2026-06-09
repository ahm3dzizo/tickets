import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, RefreshCw,
  Plus, Users
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appointmentsApi, projectsApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { QuickAddSpecialtyDialog } from '@/components/tickets/QuickAddSpecialtyDialog';

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function Appointments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { typeTranslations } = useTicketTypes();

  const [refDate, setRefDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  
  const [daysToShow, setDaysToShow] = useState(window.innerWidth < 768 ? 1 : window.innerWidth < 1024 ? 2 : 3);

  useEffect(() => {
    const handleResize = () => setDaysToShow(window.innerWidth < 768 ? 1 : window.innerWidth < 1024 ? 2 : 3);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const displayedDays = useMemo(() => {
    return Array.from({ length: daysToShow }, (_, i) => {
      const d = new Date(refDate);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [refDate, daysToShow]);

  const from = dateStr(displayedDays[0]);
  const to = dateStr(displayedDays[displayedDays.length - 1]);

  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [filterSup, setFilterSup] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');

  // Add Specialty Dialog State
  const [addSpecOpen, setAddSpecOpen] = useState(false);
  const [addSpecData, setAddSpecData] = useState<any>(null);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      // Fetch without supervisorId to get ALL specialties for the client
      // We will filter locally based on supervisor later
      const data = await appointmentsApi.getCalendar({
        from,
        to,
        projectId: filterProject || undefined,
        // If user is supervisor, maybe we still fetch all and filter locally so they can see other specialties too.
        // Wait, if the backend restricts supervisors to only their own tickets, we might not get other tickets.
        // But let's fetch what we can.
      });
      setAppointments(data);
    } catch {
      toast.error('فشل جلب المواعيد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    projectsApi.getAll().then((p: any[]) => {
      const filtered = user.role === 'admin' ? p : p.filter(proj => user.projectIds?.includes(proj.id));
      setProjects(filtered);
    }).catch(() => {});
    
    if (user.role === 'admin') {
      usersApi.getAll().then((u: any[]) => setSupervisors(u.filter((x: any) => x.role === 'supervisor'))).catch(() => {});
    }
  }, [user]);

  useEffect(() => { loadAppointments(); }, [from, to, filterProject, user]);

  // Group by day -> then by client
  const groupedByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const day of displayedDays) {
      map[dateStr(day)] = [];
    }

    const allByDate: Record<string, any[]> = {};
    for (const appt of appointments) {
      const d = (appt.appointmentTime || '').split(' ')[0];
      if (!allByDate[d]) allByDate[d] = [];
      allByDate[d].push(appt);
    }

    for (const d of Object.keys(map)) {
      const dayAppts = allByDate[d] || [];
      const clientMap: Record<string, any> = {};

      for (const appt of dayAppts) {
        const key = appt.villaNumber + '_' + (appt.projectId || '');
        if (!clientMap[key]) {
          clientMap[key] = {
            clientId: appt.clientId,
            clientName: appt.clientName,
            villaNumber: appt.villaNumber,
            projectId: appt.projectId,
            appointmentTime: appt.appointmentTime,
            types: new Set<string>(),
            sups: new Set<string>(),
            tickets: [],
          };
        }
        if (appt.type) clientMap[key].types.add(appt.type);
        if (appt.detectedTypes) appt.detectedTypes.forEach((t: string) => clientMap[key].types.add(t));
        if (appt.assignedSupervisorIds) appt.assignedSupervisorIds.forEach((s: string) => clientMap[key].sups.add(s));
        clientMap[key].tickets.push(appt);
      }

      let groups = Object.values(clientMap);
      
      // Filter by Supervisor
      if (filterSup) {
        groups = groups.filter(g => g.sups.has(filterSup));
      } else if (user?.role === 'supervisor') {
        groups = groups.filter(g => g.sups.has(user.uid));
      }

      // Sort groups by time
      groups.sort((a, b) => {
        const timeA = (a.appointmentTime || '').split(' ')[1] || '99:99';
        const timeB = (b.appointmentTime || '').split(' ')[1] || '99:99';
        return timeA.localeCompare(timeB);
      });

      map[d] = groups;
    }
    return map;
  }, [appointments, displayedDays, filterSup, user]);

  const prevDays = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() - daysToShow);
    setRefDate(d);
  };

  const nextDays = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() + daysToShow);
    setRefDate(d);
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setRefDate(d);
  };

  const handleOpenAddSpecialty = (group: any) => {
    setAddSpecData(group);
    setAddSpecOpen(true);
  };

  return (
    <Layout>
      <div className="space-y-6 page-in" dir="rtl">

        {/* ── Header ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <CalendarDays className="w-7 h-7 text-blue-500" />
              جدول المواعيد
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              متابعة مواعيد الزيارات للعملاء وتخصصات الصيانة المطلوبة
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user?.role === 'admin' && supervisors.length > 0 && (
              <div className="relative">
                <Users className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <select
                  value={filterSup}
                  onChange={e => setFilterSup(e.target.value)}
                  className="bg-card border border-border rounded-xl pl-3 pr-9 h-10 text-sm text-foreground font-bold appearance-none hover:border-slate-500 transition-colors"
                >
                  <option value="">كل المشرفين</option>
                  {supervisors.map((s: any) => (
                    <option key={s.uid} value={s.uid}>{s.displayName}</option>
                  ))}
                </select>
              </div>
            )}

            {projects.length > 0 && (
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 h-10 text-sm text-foreground font-bold hover:border-slate-500 transition-colors"
              >
                <option value="">كل المشاريع</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.abbreviation || p.name}</option>
                ))}
              </select>
            )}

            <Button
              onClick={loadAppointments}
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl border-border bg-card hover:bg-white/5"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* ── Navigation ── */}
        <div className="flex items-center justify-center gap-2 bg-card border border-border rounded-2xl p-2 w-fit mx-auto shadow-sm">
          <Button onClick={prevDays} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/5">
            <ChevronRight className="w-5 h-5" />
          </Button>
          <Button onClick={goToday} variant="ghost" className="h-9 px-4 rounded-xl font-bold hover:bg-white/5 text-slate-300">
            اليوم
          </Button>
          <Button onClick={nextDays} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/5">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* ── Days Grid ── */}
        <div className={cn(
          "grid gap-4 items-start",
          daysToShow === 1 ? "grid-cols-1" : daysToShow === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        )}>
          {displayedDays.map(day => {
             const ds = dateStr(day);
             const groups = groupedByDay[ds] || [];
             const isToday = ds === dateStr(new Date());

             return (
               <div key={ds} className={cn(
                 "bg-card border rounded-3xl overflow-hidden flex flex-col max-h-[75vh] shadow-xl shadow-black/20 transition-colors",
                 isToday ? "border-blue-500/40 bg-blue-500/5 ring-1 ring-blue-500/20" : "border-border"
               )}>
                 {/* Day Header */}
                 <div className={cn(
                   "p-5 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-md",
                   isToday ? "bg-blue-500/10 border-blue-500/20" : "bg-white/5 border-border"
                 )}>
                   <div>
                     <h3 className={cn("font-black text-xl", isToday ? "text-blue-400" : "text-white")}>
                       {day.toLocaleDateString('ar-EG', { weekday: 'long' })}
                     </h3>
                     <p className="text-xs text-slate-400 font-medium mt-0.5">
                       {day.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                     </p>
                   </div>
                   <Badge variant="outline" className={cn(
                     "px-3 py-1 text-sm font-black border",
                     isToday ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-slate-500/10 text-slate-300 border-slate-500/20"
                   )}>
                     {groups.length} موعد
                   </Badge>
                 </div>
                 
                 {/* Clients List */}
                 <div className="overflow-y-auto flex-1 p-3 space-y-3 no-scrollbar">
                   {loading && appointments.length === 0 ? (
                     <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-slate-500" /></div>
                   ) : groups.map((group, idx) => {
                     const time = (group.appointmentTime || '').split(' ')[1] || '---';
                     return (
                       <div key={idx} className="bg-background border border-border rounded-2xl p-4 flex flex-col gap-3 relative hover:border-slate-600 transition-colors group">
                          
                          {/* Top Row: Villa & Time */}
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0 pr-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-white text-base truncate">فيلا {group.villaNumber}</h4>
                              </div>
                              {group.clientName && group.clientName !== '---' && (
                                <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{group.clientName}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 min-w-[70px] shrink-0">
                              <Clock className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                              <span className="text-emerald-300 font-black tabular-nums text-sm">{time}</span>
                            </div>
                          </div>

                          {/* Specialties Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {Array.from(group.types).map(t => (
                              <span key={t as string} className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-slate-500/10 text-slate-300 border-slate-500/20">
                                {typeTranslations[t as string] || t as string}
                              </span>
                            ))}
                            <button 
                              onClick={() => handleOpenAddSpecialty(group)}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center gap-1 bg-transparent hover:bg-white/5"
                            >
                              <Plus className="w-3 h-3" />
                              تخصص
                            </button>
                          </div>

                          {/* Tickets Links */}
                          <div className="flex flex-wrap gap-1 mt-1">
                             {group.tickets.map((t: any) => (
                               <Link key={t.id} to={`/tickets/${t.id}`} className="text-[10px] text-blue-400 hover:underline">
                                 #{t.ticketId || t.id.slice(0,6)}
                               </Link>
                             ))}
                          </div>
                       </div>
                     )
                   })}
                   {groups.length === 0 && !loading && (
                     <div className="flex flex-col items-center justify-center py-12 text-slate-500 opacity-60">
                       <CalendarDays className="w-10 h-10 mb-3" />
                       <p className="text-sm font-bold">لا توجد مواعيد</p>
                     </div>
                   )}
                 </div>
               </div>
             )
          })}
        </div>
      </div>

      {/* Add Specialty Dialog */}
      {addSpecOpen && addSpecData && (
        <QuickAddSpecialtyDialog
          open={addSpecOpen}
          onOpenChange={setAddSpecOpen}
          villaNumber={addSpecData.villaNumber}
          ticketId={addSpecData.tickets[0]?.id}
          existingDetectedTypes={addSpecData.tickets[0]?.detectedTypes}
          existingSupervisorIds={addSpecData.tickets[0]?.assignedSupervisorIds}
          existingSupervisors={addSpecData.tickets[0]?.assignedSupervisors}
          supervisors={supervisors}
          onSuccess={loadAppointments}
        />
      )}
    </Layout>
  );
}
