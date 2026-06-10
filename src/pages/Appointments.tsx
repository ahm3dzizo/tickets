import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, RefreshCw,
  Plus, Users, Ticket as TicketIcon, CalendarPlus, Printer, Pencil, Search
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
import { EditAppointmentDialog } from '@/components/tickets/EditAppointmentDialog';

function dateStr(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

export default function Appointments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { typeTranslations } = useTicketTypes();
  const mergedTypes: Record<string, string> = {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات', general: 'عام',
    ...typeTranslations
  };

  const [directApptDate, setDirectApptDate] = useState<string | null>(null);
  const [clientTicketsModal, setClientTicketsModal] = useState<{ villa: string, project: string, notes: string } | null>(null);
  const [editApptGroup, setEditApptGroup] = useState<any>(null);

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
  const [searchQuery, setSearchQuery] = useState<string>('');

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
            clientPhone: appt.client?.phone || null,
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

      // Filter by Search
      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        groups = groups.filter(g => 
          (g.villaNumber && String(g.villaNumber).toLowerCase().includes(sq)) ||
          (g.clientName && String(g.clientName).toLowerCase().includes(sq)) ||
          (g.tickets.some((t: any) => t.ticketId && String(t.ticketId).toLowerCase().includes(sq)))
        );
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
  }, [appointments, displayedDays, filterSup, user, searchQuery]);

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
      <div className="print:hidden">
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

          {/* ── Carousel Hero UI ── */}
          <div className="relative w-full h-[84vh] min-h-[550px] max-h-[950px] flex justify-center items-center overflow-hidden py-2">
            {displayedDays.map((day, idx) => {
              const ds = dateStr(day);
              const groups = groupedByDay[ds] || [];
              const isToday = ds === dateStr(new Date());
              
              // Layout logical positions
              const isRight = idx === 0; // Previous Day
              const isCenter = idx === 1; // Current Day
              const isLeft = idx === 2; // Next Day

              // Carousel Slide Base Styling
              const cardClass = "absolute transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] flex flex-col rounded-[2rem] overflow-hidden shadow-2xl border w-full max-w-[90%] md:max-w-[750px] lg:max-w-[850px] h-[95%]";
              
              let posClass = "";
              let interactiveClass = "";

              if (isCenter) {
                posClass = cn(
                  "z-20 scale-100 opacity-100 translate-y-0 translate-x-0 border-2 bg-card",
                  isToday ? "border-blue-500/40 ring-4 ring-blue-500/10" : "border-slate-500/30"
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
                    "p-3 sm:p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10 backdrop-blur-xl",
                    isToday ? "bg-blue-500/10 border-blue-500/20" : "bg-white/5 border-border"
                  )}>
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className={cn("font-black text-xl lg:text-2xl", isToday ? "text-blue-600 dark:text-blue-400" : "text-foreground")}>
                          {day.toLocaleDateString('ar-EG', { weekday: 'long' })}
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">
                          {day.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                      
                      {isCenter && (
                        <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-0.5 shadow-sm">
                          <Button onClick={(e) => { e.stopPropagation(); prevDay(); }} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                          <Button onClick={(e) => { e.stopPropagation(); goToday(); }} variant="ghost" className="h-8 px-3 rounded-lg font-bold text-xs hover:bg-muted">
                            اليوم
                          </Button>
                          <Button onClick={(e) => { e.stopPropagation(); nextDay(); }} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted">
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn(
                        "px-3 py-1 text-sm font-black border rounded-xl w-fit",
                        isToday ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30" : "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20"
                      )}>
                        {groups.length} موعد
                      </Badge>
                      {isCenter && (
                        <div className="flex items-center gap-1.5">
                          <div className="relative ml-1 sm:ml-2">
                            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="بحث..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="bg-background border border-input rounded-xl pl-2 pr-8 h-8 text-xs text-foreground focus:outline-none focus:border-blue-500 transition-colors w-[100px] sm:w-[140px]"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setDirectApptDate(ds); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold h-8 px-3 shadow-lg flex items-center gap-1.5 text-xs"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" /> إضافة
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); window.print(); }}
                            className="bg-muted hover:bg-muted/80 text-foreground border border-input rounded-xl font-bold h-8 px-3 shadow-lg flex items-center gap-1.5 text-xs"
                          >
                            <Printer className="w-3.5 h-3.5" /> طباعة
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Clients List */}
                  <div className="overflow-y-auto flex-1 p-2 sm:p-3 no-scrollbar bg-gradient-to-b from-transparent to-background/50">
                    {loading && appointments.length === 0 && isCenter ? (
                      <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-slate-500" /></div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 h-max pb-2">
                        {[...groups].sort((a,b) => {
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
                                "bg-card/80 border rounded-2xl p-2.5 sm:p-3 flex flex-col gap-2 relative transition-all duration-300 shadow-sm cursor-pointer hover:bg-muted",
                                isCenter ? "hover:border-slate-500 hover:shadow-lg hover:-translate-y-1" : "border-border/50"
                              )}
                              onClick={e => { if (isCenter) { e.stopPropagation(); setClientTicketsModal({ villa: group.villaNumber, project: group.projectId, notes: note }); } }}
                            >
                              
                              {/* Top Row: Villa & Time */}
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0 pr-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-black text-foreground text-base truncate">فيلا {group.villaNumber} {totalOpen > 0 && <span className="text-amber-600 dark:text-amber-500 font-bold text-xs">({totalOpen})</span>}</h4>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {isCenter && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditApptGroup(group); }}
                                      className="flex items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl h-8 px-2 transition-colors mr-1"
                                      title="تعديل وتأجيل الموعد"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <div className="flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-2.5 py-1 min-w-[65px] shrink-0 shadow-inner">
                                    <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mb-0.5" />
                                    <span className="text-emerald-700 dark:text-emerald-300 font-black tabular-nums text-sm">{time}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Specialties Tags */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
                                {Array.from(group.types).map(t => (
                                  <span key={t as string} className="text-[11px] font-bold px-2 py-1 rounded-lg border bg-slate-800 text-slate-200 dark:bg-slate-800/80 dark:text-slate-200 border-slate-700 shadow-sm">
                                    {mergedTypes[t as string] || t as string}
                                  </span>
                                ))}
                                <button 
                                  onClick={(e) => handleOpenAddSpecialty(group, e)}
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg border border-dashed border-input text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  إضافة تخصص
                                </button>
                              </div>

                              {/* Notes */}
                              {note && (<div className="text-[11px] text-muted-foreground bg-muted/50 p-1.5 rounded-lg mt-0.5 border border-input flex gap-1.5"><span className="font-bold shrink-0 text-foreground/70">ملاحظة:</span><span className="line-clamp-2 leading-snug">{note}</span></div>)}
                            
                              {/* Supervisors (Screen Only) */}
                              {group.sups && group.sups.size > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
                                  <span className="text-[10px] font-bold text-muted-foreground">المشرفين:</span>
                                  {Array.from(group.sups).map(sId => {
                                    const sup = supervisors.find(s => s.uid === sId || s.id === sId);
                                    return (
                                      <span key={sId as string} className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                        {sup ? (sup.displayName || sup.name) : 'غير معروف'}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {groups.length === 0 && !loading && isCenter && (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-60">
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
      </div>

      {/* --- Print Layout --- */}
      <div className="hidden print:block print:w-full print:bg-white print:text-black print:p-0" dir="rtl">
        <h2 className="text-lg font-black text-center mb-2 border-b border-black pb-1">
          جدول المواعيد - {new Date(dateStr(refDate)).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {(() => {
             const ds = dateStr(refDate);
             const rawGroups = groupedByDay[ds] || [];
             const sorted = [...rawGroups].sort((a, b) => {
               const tA = (a.appointmentTime || '').split(' ')[1] || '00:00';
               const tB = (b.appointmentTime || '').split(' ')[1] || '00:00';
               return tA.localeCompare(tB);
             });
             return sorted.map((g, i) => {
               const tA = (g.appointmentTime || '').split(' ')[1] || '---';
               const note = g.tickets.find((t:any) => t.appointmentNotes)?.appointmentNotes || 'لا توجد ملاحظات إضافية';
               return (
                 <div key={i} className="border border-black rounded-lg p-1 flex flex-col gap-0.5 break-inside-avoid overflow-hidden">
                   <div className="flex justify-between items-center border-b border-black/30 pb-0.5">
                     <h3 className="font-bold text-sm leading-tight">فيلا {g.villaNumber} <span className="font-normal text-xs text-gray-700">({g.clientPhone || 'بدون رقم'})</span></h3>
                     <span className="font-black text-sm leading-tight tabular-nums">{tA}</span>
                   </div>
                   <div className="flex flex-wrap gap-0.5">
                     {Array.from(g.types).map(t => (
                        <span key={t as string} className="text-[9px] font-bold border border-gray-400 rounded px-1 py-[1px] leading-none">
                          {typeTranslations[t as string] || t as string}
                        </span>
                     ))}
                   </div>
                   <div className="text-[10px] text-gray-800 bg-gray-50 p-1 rounded border border-dashed border-gray-300 leading-tight line-clamp-1 mt-0.5">
                     <span className="font-bold">الملاحظات: </span> {note}
                   </div>
                 </div>
               )
             })
          })()}
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
      {clientTicketsModal && (
        <ClientTicketsModal
          open={!!clientTicketsModal}
          onOpenChange={(open) => !open && setClientTicketsModal(null)}
          villaNumber={clientTicketsModal.villa}
          projectId={clientTicketsModal.project}
          initialNotes={clientTicketsModal.notes}
          onSuccess={loadAppointments}
        />
      )}
      {editApptGroup && (
        <EditAppointmentDialog 
          open={!!editApptGroup} 
          onOpenChange={(op) => !op && setEditApptGroup(null)} 
          group={editApptGroup}
          supervisors={supervisors}
          onSuccess={loadAppointments}
        />
      )}
    </Layout>
  );
}
