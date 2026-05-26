import { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { reportsApi, projectsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import {
  BarChart3, TrendingUp, CheckCircle2, Clock, Timer, Layers,
  ChevronDown, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ── palette ────────────────────────────────────────────────────────────────────
const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6',
  '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#ef4444',
  '#a855f7', '#0ea5e9', '#d97706', '#10b981', '#e11d48',
];

const STATUS_COLORS = { open: '#f97316', closed: '#22c55e' };

// ── helpers ────────────────────────────────────────────────────────────────────
function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={cn(
      'bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md',
      `border-${color}/20`,
    )}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', `bg-${color}/10`)}>
        <Icon className={cn('w-5 h-5', `text-${color}`)} />
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
          {label}
        </p>
        <p className="text-3xl font-black text-foreground tabular-nums tracking-tighter leading-none">
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// Custom tooltip shared
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-right shadow-xl text-sm space-y-0.5">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: <span className="font-bold">{p.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');
  const [loading, setLoading]             = useState(true);
  const [data, setData]                   = useState<Awaited<ReturnType<typeof reportsApi.getStats>> | null>(null);

  // Load projects for filter dropdown
  useEffect(() => {
    projectsApi.getAll().then((p: any[]) => setProjects(p)).catch(() => {});
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getStats({
        projectId: filterProject || undefined,
        from:      filterFrom   || undefined,
        to:        filterTo     || undefined,
      });
      setData(res);
    } catch (e) {
      console.error('[Reports]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [filterProject, filterFrom, filterTo]);

  // ── derived data for charts ───────────────────────────────────────────────
  const specialtyPieData = useMemo(
    () => (data?.bySpecialty ?? []).map((s, i) => ({ ...s, fill: COLORS[i % COLORS.length] })),
    [data],
  );

  const mainTypeBarData = useMemo(
    () => (data?.byMainType ?? []).slice(0, 10).map(t => ({
      name:   t.nameAr,
      مغلق:   t.closed,
      مفتوح:  t.open,
    })),
    [data],
  );

  const subTypeBarData = useMemo(
    () => (data?.bySubType ?? []).slice(0, 15).map(s => ({
      name:  s.nameAr,
      count: s.count,
      closed: s.closed,
      fill:   COLORS[Math.floor(Math.random() * COLORS.length)],
    })),
    [data],
  );

  const monthlyData = useMemo(
    () => (data?.byMonth ?? []).map(m => ({
      month:  m.month,
      إجمالي: m.total,
      مغلق:   m.closed,
      مفتوح:  m.open,
    })),
    [data],
  );

  const projectBarData = useMemo(
    () => (data?.byProject ?? []).slice(0, 10).map(p => ({
      name:   p.abbr || p.name.slice(0, 10),
      مغلق:   p.closed,
      مفتوح:  p.open,
    })),
    [data],
  );

  const { total = 0, open: openCount = 0, closed: closedCount = 0, avgDays = 0 } = data?.totals ?? {};
  const topType = data?.byMainType?.[0];
  const topSubType = data?.bySubType?.[0];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-6" dir="rtl">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-primary" />
              التقارير والإحصاءات
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">تحليل شامل للتذاكر والأنواع الفرعية</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
            className="gap-2 self-end sm:self-auto"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            تحديث
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          {/* Project */}
          <div className="flex flex-col gap-1 text-right min-w-[180px]">
            <label className="text-[11px] font-semibold text-muted-foreground">المشروع</label>
            <div className="relative">
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="w-full appearance-none bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 pr-8"
                style={{ direction: 'rtl' }}
              >
                <option value="">جميع المشاريع</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1 text-right">
            <label className="text-[11px] font-semibold text-muted-foreground">من تاريخ</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1 text-right">
            <label className="text-[11px] font-semibold text-muted-foreground">إلى تاريخ</label>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {(filterProject || filterFrom || filterTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterProject(''); setFilterFrom(''); setFilterTo(''); }}
              className="text-muted-foreground hover:text-foreground self-end"
            >
              مسح الفلاتر
            </Button>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={Layers}      label="إجمالي التذاكر"   value={loading ? '…' : total.toLocaleString()}    color="primary"   />
          <KpiCard icon={Clock}       label="مفتوحة"            value={loading ? '…' : openCount.toLocaleString()}  color="orange-500" sub={`${pct(openCount, total)}% من الإجمالي`} />
          <KpiCard icon={CheckCircle2} label="مغلقة"            value={loading ? '…' : closedCount.toLocaleString()} color="emerald-500" sub={`${pct(closedCount, total)}% معدل الإغلاق`} />
          <KpiCard icon={Timer}       label="متوسط أيام الإغلاق" value={loading ? '…' : avgDays}                  color="violet-500" sub="يوم لكل تذكرة" />
        </div>

        {/* Row 1: Specialty Donut + Monthly Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Specialty donut */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-foreground text-base">التوزيع حسب التخصص</h2>
            {loading ? (
              <div className="h-56 shimmer rounded-xl" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={specialtyPieData}
                      dataKey="count"
                      nameKey="nameAr"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      label={({ name, percent }) =>
                        (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ''
                      }
                      labelLine={false}
                    >
                      {specialtyPieData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v?.toLocaleString(), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {specialtyPieData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-bold text-foreground">{s.count.toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{s.nameAr}</span>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.fill }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Monthly trend */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-foreground text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              الاتجاه الشهري (آخر 12 شهر)
            </h2>
            {loading ? (
              <div className="h-64 shimmer rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="إجمالي" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="مغلق"   stroke="#22c55e" strokeWidth={2}   dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="مفتوح"  stroke="#f97316" strokeWidth={2}   dot={{ r: 3 }} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Row 2: Main Type stacked bar + Projects bar */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Main type */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-foreground text-base">التوزيع حسب النوع الرئيسي</h2>
            {loading ? (
              <div className="h-64 shimmer rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={mainTypeBarData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    angle={-35}
                    textAnchor="end"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="مغلق"  stackId="a" fill={STATUS_COLORS.closed} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="مفتوح" stackId="a" fill={STATUS_COLORS.open}   radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Projects bar */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-foreground text-base">التوزيع حسب المشروع</h2>
            {loading ? (
              <div className="h-64 shimmer rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={projectBarData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    angle={-35}
                    textAnchor="end"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="مغلق"  stackId="a" fill={STATUS_COLORS.closed} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="مفتوح" stackId="a" fill={STATUS_COLORS.open}   radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Row 3: Sub-type horizontal bar (top 15) */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-foreground text-base">
            أعلى 15 نوع فرعي
            {topSubType && (
              <span className="text-sm text-muted-foreground font-normal mr-2">
                (الأكثر: <span className="text-foreground font-semibold">{topSubType.nameAr}</span> — {topSubType.count.toLocaleString()} تذكرة)
              </span>
            )}
          </h2>
          {loading ? (
            <div className="h-80 shimmer rounded-xl" />
          ) : data?.bySubType?.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              لا توجد بيانات تصنيف فرعي بعد — سيتم تعبئتها تلقائياً مع تصنيف الذكاء الاصطناعي
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, (data?.bySubType?.length ?? 0) * 24 + 40)}>
              <BarChart
                data={subTypeBarData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}>
                  {subTypeBarData.map((e, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sub-type detail table */}
        {(data?.bySubType?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">{data?.bySubType?.length} نوع فرعي</Badge>
              <h2 className="font-bold text-foreground text-base">تفاصيل الأنواع الفرعية</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">معدل الإغلاق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">مفتوح</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">مغلق</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">الإجمالي</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">النوع الرئيسي</th>
                    <th className="px-4 py-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">النوع الفرعي</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.bySubType ?? []).map((s, i) => (
                    <tr key={s.id} className={cn('border-b border-border/50 hover:bg-muted/40 transition-colors', i % 2 === 0 ? '' : 'bg-muted/20')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${pct(s.closed, s.count)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {pct(s.closed, s.count)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-orange-500 font-semibold">{s.open.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-500 font-semibold">{s.closed.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums font-bold text-foreground">{s.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.parentName}</td>
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
