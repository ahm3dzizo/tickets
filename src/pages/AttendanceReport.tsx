import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Clock, Calendar, Users, Timer, TrendingUp, AlertTriangle,
  RefreshCw, Download, ChevronDown, ChevronUp, MapPin, User, Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { projectsApi, techniciansApi } from '@/lib/api';

type ShiftRow = {
  id: string;
  technicianId: string;
  projectId: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: string;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  regularMinutes: number;
  isFlagged: boolean;
  flagReason: string | null;
  clockInDistanceM: number | null;
  technician: { id: string; name: string; employeeId?: string | null; specialty?: string | null };
  project: { id: string; name: string; abbreviation?: string };
  breaks: any[];
  workSessions: {
    id: string;
    status: string;
    claimedAt: string;
    finishedAt: string | null;
    totalDurationMins: number | null;
    appointment: {
      id: string;
      date: string;
      time: string | null;
      notes?: string | null;
      unit?: { unitNumber: string; block?: { blockNumber: string } | null } | null;
      client?: { name: string; phone?: string } | null;
      tickets: { id: string; ticketId: string; description: string; status: string; type: string }[];
    };
  }[];
};

type ReportResponse = {
  shifts: ShiftRow[];
  summary: {
    totalShifts: number;
    totalWorkHours: number;
    totalBreakHours: number;
    totalOvertimeHours: number;
    totalAppointmentsWorked: number;
    totalTicketsWorked: number;
    flaggedShiftsCount: number;
  };
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}
function fmtDur(mins: number | null | undefined) {
  if (mins == null || mins < 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchReport(params: URLSearchParams): Promise<ReportResponse> {
  const res = await fetch(`/api/attendance/report?${params.toString()}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', `bg-${color}/10`)}>
        <Icon className={cn('w-4 h-4', `text-${color}`)} />
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-foreground tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

function ShiftRowCard({ shift }: { shift: ShiftRow }) {
  const [open, setOpen] = useState(false);
  const active = !shift.clockOutAt;
  const durationMins = shift.totalWorkMinutes || (
    shift.clockOutAt
      ? Math.round((new Date(shift.clockOutAt).getTime() - new Date(shift.clockInAt).getTime()) / 60000)
      : Math.round((Date.now() - new Date(shift.clockInAt).getTime()) / 60000)
  );

  const appointmentsWorked = shift.workSessions?.length || 0;
  const ticketsWorked = shift.workSessions?.reduce((n, ws) => n + (ws.appointment?.tickets?.length || 0), 0) || 0;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors text-right"
      >
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          active ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
        )}>
          <User className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{shift.technician?.name || 'فني'}</span>
            {shift.technician?.employeeId && (
              <span className="text-[10px] text-muted-foreground">#{shift.technician.employeeId}</span>
            )}
            {shift.isFlagged && (
              <Badge variant="destructive" className="text-[9px] gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> مُعلَّم
              </Badge>
            )}
            {active && <Badge className="text-[9px] bg-emerald-500">نشط</Badge>}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Home className="w-3 h-3" />{shift.project?.name || '—'}</span>
            <span>•</span>
            <span>حضور: {fmtTime(shift.clockInAt)}</span>
            <span>•</span>
            <span>{active ? 'ما زال نشطاً' : `انصراف: ${fmtTime(shift.clockOutAt)}`}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">مواعيد</div>
            <div className="text-sm font-black tabular-nums">{appointmentsWorked}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">تذاكر</div>
            <div className="text-sm font-black tabular-nums">{ticketsWorked}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">مدة العمل</div>
            <div className="text-sm font-black tabular-nums text-primary">{fmtDur(durationMins)}</div>
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-accent/10 p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">وقت العمل</div>
              <div className="font-bold tabular-nums">{fmtDur(shift.totalWorkMinutes)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">وقت الاستراحة</div>
              <div className="font-bold tabular-nums">{fmtDur(shift.totalBreakMinutes)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">إضافي</div>
              <div className="font-bold tabular-nums text-amber-500">{fmtDur(shift.overtimeMinutes)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">التخصص</div>
              <div className="font-bold">{shift.technician?.specialty || '—'}</div>
            </div>
          </div>

          {shift.flagReason && (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
              <strong>سبب التعليم:</strong> {shift.flagReason}
              {shift.clockInDistanceM != null && ` (${Math.round(shift.clockInDistanceM)}م من المكتب)`}
            </div>
          )}

          {(shift.workSessions?.length || 0) > 0 && (
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-2">المواعيد التي عمل عليها ({shift.workSessions.length})</div>
              <div className="space-y-2">
                {shift.workSessions.map(ws => (
                  <div key={ws.id} className="p-3 bg-background rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Home className="w-3.5 h-3.5 text-primary shrink-0" />
                        <Link
                          to={`/appointments?id=${ws.appointment.id}`}
                          className="font-bold text-sm hover:underline truncate"
                        >
                          فيلا {ws.appointment.unit?.unitNumber || '—'}
                        </Link>
                        {ws.status === 'in_progress' && (
                          <Badge className="text-[9px] bg-blue-500 shrink-0">جارٍ</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] tabular-nums shrink-0">
                        <span className="text-muted-foreground">{fmtTime(ws.claimedAt)} → {fmtTime(ws.finishedAt)}</span>
                        <span className="font-black text-primary">{fmtDur(ws.totalDurationMins)}</span>
                      </div>
                    </div>
                    {ws.appointment.tickets?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
                        {ws.appointment.tickets.map(tk => (
                          <Link
                            key={tk.id}
                            to={`/tickets/${tk.id}`}
                            className="text-[10px] px-2 py-0.5 rounded-lg border border-border bg-accent/30 hover:bg-accent hover:underline"
                          >
                            #{tk.ticketId} • {tk.status}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(shift.breaks?.length || 0) > 0 && (
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-2">الاستراحات ({shift.breaks.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {shift.breaks.map((b: any) => (
                  <div key={b.id} className="text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500">
                    {fmtTime(b.startedAt)} → {b.endedAt ? fmtTime(b.endedAt) : '...'} ({fmtDur(b.durationMins)})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AttendanceReport() {
  const [from, setFrom] = useState<string>(daysAgoStr(6));
  const [to, setTo] = useState<string>(todayStr());
  const [projectId, setProjectId] = useState<string>('all');
  const [technicianId, setTechnicianId] = useState<string>('all');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [techs, setTechs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      projectsApi.getAll().catch(() => []),
      techniciansApi.getAll().catch(() => []),
    ]).then(([p, t]) => {
      setProjects(p || []);
      setTechs(t || []);
    });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (projectId !== 'all') params.set('projectId', projectId);
      if (technicianId !== 'all') params.set('technicianId', technicianId);
      const r = await fetchReport(params);
      setData(r);
    } catch (e: any) {
      toast.error('فشل جلب التقرير: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const shifts = data?.shifts || [];
  const summary = data?.summary;

  return (
    <Layout title="تقرير الحضور والانصراف">
      <div className="max-w-[1400px] mx-auto space-y-6 py-6 lg:py-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-black">تقرير الحضور والمواعيد</h1>
              <p className="text-sm text-muted-foreground">أوقات الدخول والخروج + مدة كل موعد ميداني</p>
            </div>
          </div>
          <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-2 rounded-xl">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            تحديث
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">من</label>
              <input
                type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">إلى</label>
              <input
                type="date" value={to} onChange={e => setTo(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">المشروع</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المشاريع</SelectItem>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">الفني</label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفنيين</SelectItem>
                  {techs.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={load} disabled={loading} className="h-9 rounded-xl">تطبيق</Button>
          </div>
        </div>

        {/* KPIs */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <KpiCard icon={Users} label="ورديات" value={summary.totalShifts} color="indigo-500" />
            <KpiCard icon={Timer} label="ساعات العمل" value={summary.totalWorkHours + 'س'} color="emerald-500" />
            <KpiCard icon={Clock} label="ساعات الاستراحة" value={summary.totalBreakHours + 'س'} color="amber-500" />
            <KpiCard icon={TrendingUp} label="ساعات إضافية" value={summary.totalOvertimeHours + 'س'} color="rose-500" />
            <KpiCard icon={Calendar} label="مواعيد" value={summary.totalAppointmentsWorked} color="blue-500" />
            <KpiCard icon={AlertTriangle} label="ورديات مُعلَّمة" value={summary.flaggedShiftsCount} color="rose-500" />
          </div>
        )}

        {/* Shift List */}
        <div className="space-y-2.5">
          {loading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
          {!loading && shifts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-2xl">
              لا توجد ورديات في هذه الفترة
            </div>
          )}
          {shifts.map(s => <ShiftRowCard key={s.id} shift={s} />)}
        </div>
      </div>
    </Layout>
  );
}
