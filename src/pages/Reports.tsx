import { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { reportsApi, projectsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, RadialBarChart, RadialBar,
} from 'recharts';
import {
  BarChart3, TrendingUp, CheckCircle2, Clock, Timer, Layers,
  ChevronDown, RefreshCw, AlertTriangle, Users, Star, Target,
  Zap, TrendingDown, Award, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const COLORS = [
  '#6366f1','#22c55e','#f59e0b','#ec4899','#14b8a6',
  '#f97316','#8b5cf6','#06b6d4','#84cc16','#ef4444',
  '#a855f7','#0ea5e9','#d97706','#10b981','#e11d48',
];

function pct(a: number, b: number) { return !b ? 0 : Math.round((a / b) * 100); }

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-right shadow-xl text-sm space-y-0.5">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: <span className="font-bold">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, accent }: any) {
  return (
    <div className={cn('bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-lg', accent || `border-border`)}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', `bg-${color}/10`)}>
        <Icon className={cn('w-5 h-5', `text-${color}`)} />
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-black text-foreground tabular-nums tracking-tighter leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-foreground text-base">{title}</h2>
        {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => { projectsApi.getAll().then((p: any[]) => setProjects(p)).catch(() => {}); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getStats({ projectId: filterProject || undefined, from: filterFrom || undefined, to: filterTo || undefined });
      setData(res);
    } catch (e) { console.error('[Reports]', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, [filterProject, filterFrom, filterTo]);

  const { total = 0, open: openCount = 0, closed: closedCount = 0, avgDays = 0, overdueCount = 0, inProgress = 0, pending = 0 } = data?.totals ?? {};
  const activeCount = openCount + inProgress + pending;

  // Chart data
  const specialtyPieData = useMemo(() => (data?.bySpecialty ?? []).map((s: any, i: number) => ({ ...s, fill: COLORS[i % COLORS.length] })), [data]);
  const mainTypeBarData  = useMemo(() => (data?.byMainType  ?? []).slice(0, 10).map((t: any) => ({ name: t.nameAr, مغلق: t.closed, مفتوح: t.open })), [data]);
  const subTypeBarData   = useMemo(() => (data?.bySubType   ?? []).slice(0, 15).map((s: any, i: number) => ({ name: s.nameAr, عدد: s.count, مغلق: s.closed, fill: COLORS[i % COLORS.length] })), [data]);
  const monthlyData      = useMemo(() => (data?.byMonth     ?? []).map((m: any) => ({ month: m.month, إجمالي: m.total, مغلق: m.closed, مفتوح: m.open })), [data]);
  const projectBarData   = useMemo(() => (data?.byProject   ?? []).slice(0, 10).map((p: any) => ({ name: p.abbr || p.name.slice(0, 10), مغلق: p.closed, مفتوح: p.open })), [data]);
  const priorityData     = useMemo(() => (data?.byPriority  ?? []).map((p: any) => ({ name: p.nameAr, value: p.count, fill: p.color })), [data]);
  const avgDaysData      = useMemo(() => (data?.byTypeAvgDays ?? []).slice(0, 10).map((t: any) => ({ name: t.nameAr, أيام: t.avgDays })), [data]);

  const sla = data?.sla ?? {};
  const slaTotal = closedCount || 1;

  return (
    <Layout>
      <div className="space-y-6" dir="rtl">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-primary" />
              التقارير والإحصاءات
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">تحليل شامل — جاهز للتقديم للإدارة</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-2 self-end sm:self-auto">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            تحديث
          </Button>
        </div>

        {/* ── Filters ── */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 text-right min-w-[180px]">
            <label className="text-[11px] font-semibold text-muted-foreground">المشروع</label>
            <div className="relative">
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                className="w-full appearance-none bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 pr-8" style={{ direction: 'rtl' }}>
                <option value="">جميع المشاريع</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1 text-right">
            <label className="text-[11px] font-semibold text-muted-foreground">من تاريخ</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="flex flex-col gap-1 text-right">
            <label className="text-[11px] font-semibold text-muted-foreground">إلى تاريخ</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {(filterProject || filterFrom || filterTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterProject(''); setFilterFrom(''); setFilterTo(''); }} className="text-muted-foreground self-end">
              مسح الفلاتر
            </Button>
          )}
        </div>

        {/* ── KPI Row 1 ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={Layers}       label="إجمالي التذاكر"     value={loading ? '…' : total.toLocaleString()}        color="primary"    />
          <KpiCard icon={Activity}     label="نشطة (مفتوحة+جارية)" value={loading ? '…' : activeCount.toLocaleString()}  color="orange-500" sub={`${pct(activeCount, total)}% من الإجمالي`} />
          <KpiCard icon={CheckCircle2} label="مغلقة"               value={loading ? '…' : closedCount.toLocaleString()}  color="emerald-500" sub={`${pct(closedCount, total)}% معدل الإغلاق`} />
          <KpiCard icon={Timer}        label="متوسط أيام الإغلاق"  value={loading ? '…' : avgDays}                       color="violet-500"  sub="يوم لكل تذكرة" />
        </div>

        {/* ── KPI Row 2 ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={AlertTriangle} label="متأخرة (+7 أيام)"  value={loading ? '…' : overdueCount.toLocaleString()} color="red-500"    accent="border-red-500/30"     sub="تحتاج متابعة عاجلة" />
          <KpiCard icon={Zap}           label="قيد التنفيذ"        value={loading ? '…' : inProgress.toLocaleString()}   color="indigo-500" sub={`${pct(inProgress, total)}% من الإجمالي`} />
          <KpiCard icon={Clock}         label="معلقة / انتظار"     value={loading ? '…' : pending.toLocaleString()}      color="amber-500"  sub="تذاكر معلقة" />
          <KpiCard icon={Target}        label="إغلاق خلال 3 أيام"  value={loading ? '…' : `${pct(sla.within1 + sla.within3, closedCount)}%`} color="teal-500" sub={`${(sla.within1 + sla.within3).toLocaleString()} تذكرة`} />
        </div>

        {/* ── Row: Specialty + Monthly Trend ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SectionCard title="التوزيع حسب التخصص">
            {loading ? <div className="h-56 shimmer rounded-xl" /> : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={specialtyPieData} dataKey="count" nameKey="nameAr" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}
                      label={({ name, percent }) => (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ''} labelLine={false}>
                      {specialtyPieData.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v?.toLocaleString(), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {specialtyPieData.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-bold text-foreground">{s.count.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">({pct(s.count, total)}%)</span></span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">{s.nameAr}</span>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.fill }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          <div className="lg:col-span-2">
            <SectionCard title="الاتجاه الشهري (آخر 12 شهر)">
              {loading ? <div className="h-64 shimmer rounded-xl" /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="إجمالي" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="مغلق"   stroke="#22c55e" strokeWidth={2}   dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="مفتوح"  stroke="#f97316" strokeWidth={2}   dot={{ r: 3 }} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── SLA Breakdown ── */}
        <SectionCard title="معدل الاستجابة (SLA) — التذاكر المغلقة" badge={`${closedCount.toLocaleString()} تذكرة مغلقة`}>
          {loading ? <div className="h-24 shimmer rounded-xl" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'خلال يوم', value: sla.within1, color: 'bg-emerald-500' },
                { label: 'خلال 3 أيام', value: sla.within3, color: 'bg-teal-500' },
                { label: 'خلال أسبوع', value: sla.within7, color: 'bg-blue-500' },
                { label: 'خلال 14 يوم', value: sla.within14, color: 'bg-amber-500' },
                { label: 'أكثر من 14', value: sla.over14, color: 'bg-red-500' },
              ].map((s, i) => (
                <div key={i} className="bg-muted/40 rounded-xl p-3 text-center space-y-1">
                  <div className={cn('h-1.5 rounded-full mx-auto mb-2', s.color)} style={{ width: `${pct(s.value, slaTotal)}%`, minWidth: '8px' }} />
                  <p className="text-xl font-black text-foreground tabular-nums">{s.value?.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className="text-[10px] font-bold text-foreground">{pct(s.value, slaTotal)}%</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Main Type + Priority ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SectionCard title="التوزيع حسب النوع الرئيسي">
              {loading ? <div className="h-64 shimmer rounded-xl" /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={mainTypeBarData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} angle={-35} textAnchor="end" tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="مغلق"  stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="مفتوح" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          <SectionCard title="توزيع الأولويات">
            {loading ? <div className="h-64 shimmer rounded-xl" /> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} labelLine={false}>
                      {priorityData.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v?.toLocaleString(), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {priorityData.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-bold tabular-nums">{p.value?.toLocaleString()} <span className="text-muted-foreground font-normal">({pct(p.value, total)}%)</span></span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{p.name}</span>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </div>

        {/* ── Projects + Avg Resolution by Type ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="التوزيع حسب المشروع">
            {loading ? <div className="h-64 shimmer rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={projectBarData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} angle={-35} textAnchor="end" tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="مغلق"  stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="مفتوح" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="متوسط أيام الإغلاق حسب النوع">
            {loading ? <div className="h-64 shimmer rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={avgDaysData} layout="vertical" margin={{ top: 5, right: 50, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="أيام" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}>
                    {avgDaysData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* ── Sub-Type Bar ── */}
        <SectionCard title="أعلى 15 نوع فرعي" badge={`${(data?.bySubType?.length ?? 0)} نوع فرعي`}>
          {loading ? <div className="h-80 shimmer rounded-xl" /> : (data?.bySubType?.length ?? 0) === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات تصنيف فرعي بعد</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, (data?.bySubType?.length ?? 0) * 26 + 40)}>
              <BarChart data={subTypeBarData} layout="vertical" margin={{ top: 5, right: 60, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="عدد" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}>
                  {subTypeBarData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* ── Supervisor Performance ── */}
        {(data?.bySupervisor?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">{data?.bySupervisor?.length} مشرف</Badge>
              <h2 className="font-bold text-foreground text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                أداء المشرفين
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">متوسط أيام الإغلاق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">معدل الإغلاق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">مفتوحة</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">مغلقة</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">الإجمالي</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">التخصص</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">المشرف</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.bySupervisor ?? []).map((s: any, i: number) => (
                    <tr key={s.uid} className={cn('border-b border-border/50 hover:bg-muted/40 transition-colors', i % 2 === 0 ? '' : 'bg-muted/20')}>
                      <td className="px-4 py-3 text-center">
                        {s.avgDays != null ? (
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', s.avgDays <= 3 ? 'bg-emerald-500/10 text-emerald-500' : s.avgDays <= 7 ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500')}>
                            {s.avgDays} يوم
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct(s.closed, s.total)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct(s.closed, s.total)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-orange-500 font-semibold">{s.open.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-500 font-semibold">{s.closed.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums font-bold text-foreground">{s.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{s.specialty || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{s.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Top Clients ── */}
        {(data?.topClients?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">أعلى 10</Badge>
              <h2 className="font-bold text-foreground text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                العملاء الأكثر تذاكر
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">معدل الإغلاق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">مفتوحة</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">مغلقة</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">الإجمالي</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">رقم الفيلا</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">العميل</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topClients ?? []).map((c: any, i: number) => (
                    <tr key={c.clientId} className={cn('border-b border-border/50 hover:bg-muted/40 transition-colors', i % 2 === 0 ? '' : 'bg-muted/20')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct(c.closed, c.count)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct(c.closed, c.count)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-orange-500 font-semibold">{c.open.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-500 font-semibold">{c.closed.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums font-bold text-foreground">{c.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{c.villaNumber || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{c.clientName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Status Breakdown ── */}
        {(data?.byStatus?.length ?? 0) > 0 && (
          <SectionCard title="تفاصيل حالات التذاكر">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(data?.byStatus ?? []).map((s: any) => (
                <div key={s.key} className="bg-muted/30 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-3 h-8 rounded-full shrink-0" style={{ background: s.color }} />
                  <div className="text-right flex-1">
                    <p className="text-xl font-black tabular-nums" style={{ color: s.color }}>{s.count.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{s.nameAr}</p>
                    <p className="text-[10px] text-muted-foreground">{pct(s.count, total)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Sub-type Detail Table ── */}
        {(data?.bySubType?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">{data?.bySubType?.length} نوع فرعي</Badge>
              <h2 className="font-bold text-foreground text-base">تفاصيل الأنواع الفرعية</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">معدل الإغلاق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">مفتوح</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">مغلق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">الإجمالي</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">النوع الرئيسي</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase">النوع الفرعي</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.bySubType ?? []).map((s: any, i: number) => (
                    <tr key={s.id} className={cn('border-b border-border/50 hover:bg-muted/40 transition-colors', i % 2 === 0 ? '' : 'bg-muted/20')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct(s.closed, s.count)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct(s.closed, s.count)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-orange-500 font-semibold">{s.open.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-500 font-semibold">{s.closed.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums font-bold text-foreground">{s.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{s.parentName}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{s.nameAr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
