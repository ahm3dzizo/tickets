import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, RefreshCw,
  Plus, Users, Ticket as TicketIcon, CalendarPlus
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appointmentsApi, projectsApi, usersApi, ticketsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { QuickAddSpecialtyDialog } from '@/components/tickets/QuickAddSpecialtyDialog';
import { DirectAppointmentDialog } from '@/components/tickets/DirectAppointmentDialog';
import { ClientTicketsModal } from '@/components/tickets/ClientTicketsModal';
import { Printer } from 'lucide-react';

function dateStr(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

export default function Appointments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { typeTranslations } = useTicketTypes();

  const [directApptDate, setDirectApptDate] = useState<string | null>(null);
  const [clientTicketsModal, setClientTicketsModal] = useState<{ villa: string, project: string, notes: string } | null>(null);

  const [refDate, setRefDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  
  // We always show 3 days: Prev, Active, Next
  const displayedDays = useMemo(() => {
    const prev = new Date(refDate); prev.setDate(prev.getDate() - 1);
    const next = new Date(refDate); next.setDate(next.getDate() + 1);
    return [prev, refDate, next];
  }, [refDate]);

  const from = dateStr(displayedDays[0]);
  const to = dateStr(displayedDays[2]);

  const [appointments, setAppointments] = useState<any[]>([]);
  const [openTicketsMap, setOpenTicketsMap] = useState<Record<string, number>>({});
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
      const data = await appointmentsApi.getCalendar({
        from,
        to,
        projectId: filterProject || undefined,
      });
      setAppointments(data);
    } catch {
      toast.error('فشل جلب المواعيد');
    } finally {
      setLoading(false);
    }
  };

  const loadOpenTicketsCount = async () => {
    if (!user) return;
    try {
      const params: any = {};
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length) params.projectIds = user.projectIds;
      
      const allTickets = await ticketsApi.getAll(params);
      const map: Record<string, number> = {};
      
      allTickets.forEach((t: any) => {
        if (t.status !== 'closed' && t.status !== 'out-of-scope') {
          const key = t.villaNumber + '_' + (t.projectId || '');
          map[key] = (map[key] || 0) + 1;
        }
      });
      setOpenTicketsMap(map);
    } catch {
      // Silently fail if count fails
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

    loadOpenTicketsCount();
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

  const prevDay = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    setRefDate(d);
  };

  const nextDay = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 1);
    setRefDate(d);
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setRefDate(d);
  };

  const handleOpenAddSpecialty = (group: any, e: React.MouseEvent) => {
    e.stopPropagation();
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
        <div className="flex items-center justify-center gap-2 bg-card border border-border rounded-2xl p-2 w-fit mx-auto shadow-sm relative z-30">
          <Button onClick={prevDay} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/5">
            <ChevronRight className="w-5 h-5" />
          </Button>
          <Button onClick={goToday} variant="ghost" className="h-9 px-4 rounded-xl font-bold hover:bg-white/5 text-slate-300">
            اليوم
          </Button>
          <Button onClick={nextDay} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/5">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* ── Carousel Hero UI ── */}
        <div className="relative w-full h-[65vh] min-h-[450px] max-h-[650px] flex justify-center items-center overflow-hidden py-4 -mt-2">
          {displayedDays.map((day, idx) => {
            const ds = dateStr(day);
            const groups = groupedByDay[ds] || [];
            const isToday = ds === dateStr(new Date());
            
            // Layout logical positions
            const isRight = idx === 0; // Previous Day
            const isCenter = idx === 1; // Current Day
            const isLeft = idx === 2; // Next Day

            // Carousel Slide Base Styling
            const cardClass = "absolute transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] flex flex-col bg-card rounded-[1.5rem] overflow-hidden shadow-2xl border w-full max-w-[85%] sm:max-w-[380px] h-[95%]";
            
            let posClass = "";
            let interactiveClass = "";

            if (isCenter) {
              posClass = cn(
                "z-20 scale-100 opacity-100 translate-y-0 translate-x-0 border-2",
                isToday ? "border-slate-600 bg-slate-900/60 backdrop-blur-2xl ring-2 ring-blue-500/20" : "border-slate-700/50 bg-card/90 backdrop-blur-md"
              );
            } else if (isRight) {
              posClass = "z-10 scale-[0.80] opacity-[0.5] translate-y-6 translate-x-[25%] sm:translate-x-[45%] md:translate-x-[65%] lg:translate-x-[80%] blur-[1px] border-border/50 shadow-none";
              interactiveClass = "hover:blur-none hover:opacity-100 hover:scale-[0.85] cursor-pointer";
            } else if (isLeft) {
              posClass = "z-10 scale-[0.80] opacity-[0.5] translate-y-6 -translate-x-[25%] sm:-translate-x-[45%] md:-translate-x-[65%] lg:-translate-x-[80%] blur-[1px] border-border/50 shadow-none";
              interactiveClass = "hover:blur-none hover:opacity-100 hover:scale-[0.85] cursor-pointer";
            }

            // Hide sides entirely on small phones to avoid overlap mess, or just show them peeked?
            // With translate-x-[18%] they peek a bit. It looks good.
            const mobileClass = isCenter ? "flex" : "hidden sm:flex";

            return (
              <div 
                key={ds} 
                className={cn(cardClass, posClass, mobileClass, interactiveClass)}
                onClick={() => {
                  if (isRight) prevDay();
                  if (isLeft) nextDay();
                }}
              >
                <div className={cn(
                  "p-5 lg:p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10 backdrop-blur-xl",
                  isToday ? "bg-blue-500/10 border-blue-500/20" : "bg-white/5 border-border"
                )}>
                  <div>
                    <h3 className={cn("font-black text-2xl lg:text-3xl", isToday ? "text-blue-400" : "text-white")}>
                      {day.toLocaleDateString('ar-EG', { weekday: 'long' })}
                    </h3>
                    <p className="text-sm text-slate-400 font-medium mt-1">
                      {day.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "px-4 py-1.5 text-base font-black border rounded-xl w-fit",
                      isToday ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-slate-500/10 text-slate-300 border-slate-500/20"
                    )}>
                      {groups.length} موعد
                    </Badge>
                    {isCenter && (
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setDirectApptDate(ds); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold h-9 px-4 shadow-lg flex items-center gap-1.5"
                      >
                        <CalendarPlus className="w-4 h-4" /> إضافة موعد
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Clients List */}
                <div className="overflow-y-auto flex-1 p-4 lg:p-5 space-y-4 no-scrollbar bg-gradient-to-b from-transparent to-background/50">
                  {loading && appointments.length === 0 && isCenter ? (
                    <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-slate-500" /></div>
                  ) : [...groups].sort((a,b) => {
                     const ta = (a.appointmentTime || '').split(' ')[1] || '00:00';
                     const tb = (b.appointmentTime || '').split(' ')[1] || '00:00';
                     return ta.localeCompare(tb);
                   }).map((group, idx) => {
                     const note = group.tickets.find((t:any) => t.appointmentNotes)?.appointmentNotes || '';

                    const time = (group.appointmentTime || '').split(' ')[1] || '---';
                    const clientKey = group.villaNumber + '_' + (group.projectId || '');
                    const totalOpen = openTicketsMap[clientKey] || 0;

                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "bg-card/80 border rounded-2xl p-5 flex flex-col gap-4 relative transition-all duration-300 shadow-sm",
                          isCenter ? "hover:border-slate-500 hover:shadow-lg hover:-translate-y-1" : "border-border/50"
                        )}
                        onClick={e => { if (isCenter) { e.stopPropagation(); setClientTicketsModal({ villa: group.villaNumber, project: group.projectId, notes: note }); } }}
                      >
                        
                        {/* Top Row: Villa & Time */}
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0 pr-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-white text-lg truncate">فيلا {group.villaNumber}</h4>
                            </div>
                            {group.clientName && group.clientName !== '---' && (
                              <p className="text-sm text-slate-400 font-medium truncate mt-1">{group.clientName}</p>
                            )}

                            {/* Open Tickets Counter Hero Badge */}
                            {totalOpen > 0 && (
                              <div className="mt-2 inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                                <TicketIcon className="w-3.5 h-3.5" />
                                <span>{totalOpen} تذاكر مفتوحة للعميل</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-2 min-w-[80px] shrink-0 shadow-inner">
                            <Clock className="w-4 h-4 text-emerald-400 mb-1" />
                            <span className="text-emerald-300 font-black tabular-nums text-base">{time}</span>
                          </div>
                        </div>

                        {/* Specialties Tags */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                          {Array.from(group.types).map(t => (
                            <span key={t as string} className="text-xs font-bold px-3 py-1.5 rounded-xl border bg-slate-800/80 text-slate-200 border-slate-700 shadow-sm">
                              {typeTranslations[t as string] || t as string}
                            </span>
                          ))}
                          <button 
                            onClick={(e) => handleOpenAddSpecialty(group, e)}
                            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-400 hover:bg-slate-800 transition-all flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            إضافة تخصص
                          </button>
                        </div>

                        {/* Tickets Links */}
                        <div className="flex flex-wrap gap-2 mt-1">
                            {group.tickets.map((t: any) => (
                              <Link key={t.id} to={`/tickets/${t.id}`} onClick={e => e.stopPropagation()} className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline bg-blue-500/5 px-2 py-0.5 rounded-md transition-colors">
                                #{t.ticketId || t.id.slice(0,6)}
                              </Link>
                            ))}
                        </div>
                      </div>
                    )
                  })}
                  {groups.length === 0 && !loading && isCenter && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 opacity-60">
                      <CalendarDays className="w-16 h-16 mb-4 opacity-50" />
                      <p className="text-lg font-bold">لا توجد مواعيد</p>
                      <p className="text-sm mt-2 opacity-80">جميع الفنيين متاحين في هذا اليوم</p>
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
      {/* Direct Appointment Dialog */}
      {directApptDate && (
        <DirectAppointmentDialog
          open={!!directApptDate}
          onOpenChange={(v) => !v && setDirectApptDate(null)}
          dateStr={directApptDate}
          onSuccess={() => {
            loadAppointments();
            loadOpenTicketsCount();
          }}
        />
      )}
    </Layout>
  );
}
