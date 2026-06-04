import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, RefreshCw,
  AlertTriangle, MapPin, User, Filter,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appointmentsApi, projectsApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// ── مساعدات ───────────────────────────────────────────────────────────────────
function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay(); // 0=Sunday
  // نبدأ من الأحد
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' });
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
}

// ألوان المشرفين
const SUP_COLORS = [
  'bg-blue-500/20 border-blue-500/40 text-blue-300',
  'bg-purple-500/20 border-purple-500/40 text-purple-300',
  'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  'bg-amber-500/20 border-amber-500/40 text-amber-300',
  'bg-rose-500/20 border-rose-500/40 text-rose-300',
  'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
];

const typeTranslations: Record<string, string> = {
  electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب',
  paints: 'دهانات', painting: 'دهانات', cracks: 'تشققات',
  ceramics: 'سيراميك', tiles: 'سيراميك', drainage: 'صرف',
  ac_ventilation: 'تكييف', pumps: 'مضخات', waterproofing: 'عزل',
  general: 'عام',
};

export default function Appointments() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [refDate, setRefDate] = useState(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [filterSup, setFilterSup] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  const weekDays = useMemo(() => getWeekDays(refDate), [refDate]);
  const from = dateStr(weekDays[0]);
  const to = dateStr(weekDays[6]);

  // ── جلب المواعيد ──
  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await appointmentsApi.getCalendar({
        from,
        to,
        supervisorId: (user?.role === 'supervisor' && !filterSup) ? user.uid : filterSup || undefined,
        projectId: filterProject || undefined,
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
    projectsApi.getAll().then((p: any[]) => setProjects(p)).catch(() => {});
    if (user.role === 'admin') {
      usersApi.getAll().then((u: any[]) => setSupervisors(u.filter((x: any) => x.role === 'supervisor'))).catch(() => {});
    }
  }, [user]);

  useEffect(() => { loadAppointments(); }, [from, to, filterSup, filterProject, user]);

  // ── تجميع المواعيد حسب اليوم ──
  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const day of weekDays) {
      map[dateStr(day)] = [];
    }
    for (const appt of appointments) {
      const d = (appt.appointmentTime || '').split(' ')[0];
      if (map[d]) map[d].push(appt);
    }
    return map;
  }, [appointments, weekDays]);

  // ── خريطة ألوان المشرفين ──
  const supColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;
    for (const appt of appointments) {
      const ids: string[] = appt.assignedSupervisorIds || [];
      for (const id of ids) {
        if (!map[id]) {
          map[id] = SUP_COLORS[idx % SUP_COLORS.length];
          idx++;
        }
      }
    }
    return map;
  }, [appointments]);

  const todayStr = dateStr(new Date());

  const prevWeek = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 7);
    setRefDate(d);
  };

  const nextWeek = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 7);
    setRefDate(d);
  };

  const goToday = () => setRefDate(new Date());

  return (
    <Layout>
      <div className="space-y-4" dir="rtl">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              📅 تقويم المواعيد
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {formatMonth(weekDays[0])} — {appointments.length} موعد
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* فلتر المشرف (admin فقط) */}
            {user?.role === 'admin' && supervisors.length > 0 && (
              <select
                value={filterSup}
                onChange={e => setFilterSup(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 h-9 text-sm text-foreground"
              >
                <option value="">كل المشرفين</option>
                {supervisors.map((s: any) => (
                  <option key={s.uid} value={s.uid}>{s.displayName}</option>
                ))}
              </select>
            )}

            {/* فلتر المشروع */}
            {projects.length > 1 && (
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 h-9 text-sm text-foreground"
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
              className="h-9 w-9 border-border bg-card"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* ── Week Navigation ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Button onClick={nextWeek} variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <button
                onClick={goToday}
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
              >
                اليوم
              </button>
              <span className="text-sm font-bold text-foreground">
                {weekDays[0].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                {' — '}
                {weekDays[6].toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <Button onClick={prevWeek} variant="ghost" size="icon" className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* ── Grid الأسبوعي ── */}
          <div className="grid grid-cols-7 divide-x divide-x-reverse divide-border">
            {weekDays.map(day => {
              const ds = dateStr(day);
              const dayAppts = byDay[ds] || [];
              const isToday = ds === todayStr;

              return (
                <div key={ds} className={cn('min-h-[200px] p-1.5', isToday && 'bg-primary/5')}>
                  {/* رأس اليوم */}
                  <div className={cn(
                    'text-center py-1.5 mb-1.5 rounded-xl',
                    isToday ? 'bg-primary text-primary-foreground' : ''
                  )}>
                    <p className={cn('text-[10px] font-bold', isToday ? 'text-primary-foreground' : 'text-muted-foreground')}>
                      {day.toLocaleDateString('ar-EG', { weekday: 'short' })}
                    </p>
                    <p className={cn('text-sm font-black', isToday ? 'text-primary-foreground' : 'text-foreground')}>
                      {day.getDate()}
                    </p>
                    {dayAppts.length > 0 && (
                      <span className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        isToday ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
                      )}>
                        {dayAppts.length}
                      </span>
                    )}
                  </div>

                  {/* المواعيد */}
                  <div className="space-y-1">
                    {dayAppts.map((appt: any) => {
                      const supIds: string[] = appt.assignedSupervisorIds || [];
                      const firstSupColor = supIds.length > 0 ? (supColorMap[supIds[0]] || SUP_COLORS[0]) : SUP_COLORS[0];
                      const time = (appt.appointmentTime || '').split(' ')[1];
                      const isShared = supIds.length > 1;

                      return (
                        <Link
                          key={appt.id}
                          to={`/tickets/${appt.id}`}
                          className={cn(
                            'block text-[10px] border rounded-lg px-1.5 py-1 leading-tight hover:opacity-80 transition-opacity cursor-pointer',
                            firstSupColor
                          )}
                        >
                          <div className="flex items-center gap-0.5 mb-0.5">
                            {time && <Clock className="w-2.5 h-2.5 shrink-0 opacity-70" />}
                            <span className="font-bold truncate">{time || appt.clientName}</span>
                            {isShared && (
                              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-current opacity-60" title="مشترك" />
                            )}
                          </div>
                          <p className="opacity-70 truncate">{time ? appt.clientName : ''}</p>
                          <p className="opacity-60 truncate">فيلا {appt.villaNumber}</p>
                          {appt.type && (
                            <p className="opacity-50 truncate">{typeTranslations[appt.type] || appt.type}</p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── قسم اليوم التفصيلي ── */}
        {byDay[todayStr]?.length > 0 && (
          <div className="bg-card border border-blue-500/20 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] text-blue-400">
                {byDay[todayStr].length} موعد
              </Badge>
              <h3 className="font-bold text-sm flex items-center gap-1.5 text-blue-400">
                <CalendarDays className="w-3.5 h-3.5" />
                مواعيد اليوم — تفصيلي
              </h3>
            </div>
            <div className="divide-y divide-border">
              {byDay[todayStr].map((appt: any) => {
                const supIds: string[] = appt.assignedSupervisorIds || [];
                const sups = Array.isArray(appt.assignedSupervisors) ? appt.assignedSupervisors : [];
                const time = (appt.appointmentTime || '').split(' ')[1];

                return (
                  <Link
                    key={appt.id}
                    to={`/tickets/${appt.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors"
                  >
                    {/* الوقت */}
                    <div className="text-center shrink-0 w-14">
                      <p className="text-lg font-black text-blue-400 tabular-nums">{time || '--:--'}</p>
                    </div>

                    {/* التفاصيل */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {appt.clientName} — فيلا {appt.villaNumber}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">#{appt.ticketId}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {typeTranslations[appt.type] || appt.type}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-1.5 py-0',
                            appt.status === 'pending' ? 'text-amber-400 border-amber-500/30' :
                            appt.status === 'in_progress' ? 'text-blue-400 border-blue-500/30' :
                            'text-slate-400 border-border'
                          )}
                        >
                          {appt.status}
                        </Badge>
                      </div>
                      {sups.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <User className="w-2.5 h-2.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            {sups.map((s: any) => s.name).join('، ')}
                          </span>
                          {sups.length > 1 && (
                            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1 rounded">مشترك</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ملاحظات */}
                    {appt.appointmentNotes && (
                      <div className="shrink-0 max-w-[120px]">
                        <p className="text-[10px] text-muted-foreground truncate">{appt.appointmentNotes}</p>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Legend ── */}
        {Object.keys(supColorMap).length > 0 && (
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">المشرفون</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(supColorMap).slice(0, 6).map(([supId, color]) => {
                const supName = appointments
                  .flatMap((a: any) => a.assignedSupervisors || [])
                  .find((s: any) => s?.id === supId)?.name || supId.slice(-4);
                return (
                  <div key={supId} className={cn('px-2 py-0.5 rounded-full border text-[10px] font-bold', color)}>
                    {supName}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && appointments.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-2xl py-16 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <h3 className="font-bold text-foreground">لا توجد مواعيد هذا الأسبوع</h3>
            <p className="text-muted-foreground text-sm mt-1">قم بتحديد مواعيد من صفحة التذاكر</p>
            <Button
              className="mt-4 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl"
              onClick={() => navigate('/tickets')}
            >
              الذهاب للتذاكر
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
