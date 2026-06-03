import { useState, useEffect, useMemo, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { reportsApi, projectsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import {
  BarChart3, TrendingUp, CheckCircle2, Clock, Timer, Layers,
  ChevronDown, RefreshCw, AlertTriangle, Users, Star, Target, Zap, Activity,
  Download, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#14b8a6','#f97316','#8b5cf6','#06b6d4','#84cc16','#ef4444','#a855f7','#0ea5e9','#d97706','#10b981','#e11d48'];

function pct(a: number, b: number) { return !b ? 0 : Math.round((a / b) * 100); }

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl px-3 py-2 shadow-xl text-sm space-y-0.5" dir="rtl">
      {label && <p className="font-bold text-foreground mb-1 border-b border-border/50 pb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center justify-between gap-4">
          <span className="font-bold" style={{ color: p.color ?? p.fill }}>{p.value?.toLocaleString()}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, iconColor, accent }: any) {
  return (
    <div className={cn('bg-card border rounded-2xl p-4 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all', accent ?? 'border-border')}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', `bg-${iconColor}/10`)}>
        <Icon className={cn('w-4 h-4', `text-${iconColor}`)} />
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-foreground tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
        </div>
        <h2 className="font-bold text-foreground text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const TABLE_TH = "px-4 py-2.5 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide";
const TABLE_TD = "px-4 py-2.5";

export default function Reports() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');
  const [loading, setLoading]             = useState(true);
  const [data, setData]                   = useState<any>(null);
  const [exporting, setExporting]         = useState(false);
  const reportRef                         = useRef<HTMLDivElement>(null);

  useEffect(() => { projectsApi.getAll().then((p: any[]) => setProjects(p)).catch(() => {}); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try { setData(await reportsApi.getStats({ projectId: filterProject||undefined, from: filterFrom||undefined, to: filterTo||undefined })); }
    catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { fetchStats(); }, [filterProject, filterFrom, filterTo]);

  const exportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#0f1117' });
      const imgW = 210; // A4 width mm
      const imgH = (canvas.height * imgW) / canvas.width;
      const pdf = new jsPDF({ orientation: imgH > 297 ? 'p' : 'p', unit: 'mm', format: 'a4' });
      const pageH = 297;
      let y = 0;
      while (y < imgH) {
        const srcY = (y / imgH) * canvas.height;
        const srcH = Math.min((pageH / imgH) * canvas.height, canvas.height - srcY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width; pageCanvas.height = srcH;
        pageCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        const slice = pageCanvas.toDataURL('image/jpeg', 0.9);
        if (y > 0) pdf.addPage();
        pdf.addImage(slice, 'JPEG', 0, 0, imgW, (srcH * imgW) / canvas.width);
        y += pageH;
      }
      const date = new Date().toLocaleDateString('ar-EG').replace(/\//g, '-');
      pdf.save(`تقرير-الصيانة-${date}.pdf`);
    } catch { alert('فشل تصدير PDF'); }
    finally { setExporting(false); }
  };

  const t = data?.totals ?? {};
  const total = t.total ?? 0;
  const sla   = data?.sla ?? {};

  // ── chart data ──────────────────────────────────────────────────────────────
  const specialtyData  = useMemo(() => (data?.bySpecialty ?? []).map((s:any,i:number) => ({ ...s, fill: COLORS[i % COLORS.length] })), [data]);
  const mainTypeData   = useMemo(() => (data?.byMainType ?? []).slice(0,12).map((x:any) => ({ name:x.nameAr, مغلق:x.closed, مفتوح:x.open })), [data]);
  const subTypeData    = useMemo(() => (data?.bySubType  ?? []).slice(0,15).map((x:any,i:number) => ({ name:x.nameAr, عدد:x.count, fill:COLORS[i%COLORS.length] })), [data]);
  const monthlyData    = useMemo(() => (data?.byMonth    ?? []).map((m:any) => ({ month:m.month, إجمالي:m.total, مغلق:m.closed, مفتوح:m.open })), [data]);
  const projectData    = useMemo(() => (data?.byProject  ?? []).slice(0,10).map((x:any) => ({ name:x.abbr||x.name.slice(0,10), مغلق:x.closed, مفتوح:x.open })), [data]);
  const priorityData   = useMemo(() => (data?.byPriority ?? []).map((p:any) => ({ name:p.nameAr, value:p.count, fill:p.color })), [data]);
  const avgDaysData    = useMemo(() => (data?.byTypeAvgDays ?? []).slice(0,10).map((x:any) => ({ name:x.nameAr, 'متوسط الأيام':x.avgDays })), [data]);

  const Skeleton = ({ h = 'h-48' }: { h?: string }) =>
    <div className={cn(h, 'shimmer rounded-xl')} />;

  return (
    <Layout>
      <div className="space-y-5 pb-8" dir="rtl" ref={reportRef}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" /> التقارير والإحصاءات
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">تحليل شامل — جاهز للتقديم للإدارة</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting || loading} className="gap-2">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              تصدير PDF
            </Button>
            <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-2">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> تحديث
            </Button>
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[11px] font-semibold text-muted-foreground text-right">المشروع</label>
            <div className="relative">
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                className="w-full appearance-none bg-muted border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/40 pr-8" dir="rtl">
                <option value="">جميع المشاريع</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-muted-foreground text-right">من تاريخ</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-muted-foreground text-right">إلى تاريخ</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {(filterProject || filterFrom || filterTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterProject(''); setFilterFrom(''); setFilterTo(''); }}>مسح</Button>
          )}
        </div>

        {/* ── KPI Row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={Layers}       label="إجمالي التذاكر"      iconColor="primary"     value={loading ? '…' : total.toLocaleString()} />
          <KpiCard icon={Activity}     label="نشطة"                iconColor="orange-500"  value={loading ? '…' : ((t.open??0)+(t.inProgress??0)+(t.pending??0)).toLocaleString()} sub={`${pct((t.open??0)+(t.inProgress??0)+(t.pending??0), total)}% من الإجمالي`} />
          <KpiCard icon={CheckCircle2} label="معدل الإغلاق"        iconColor="emerald-500" value={loading ? '…' : `${pct(t.closed??0, total)}%`} sub={`${(t.closed??0).toLocaleString()} تذكرة مغلقة`} />
          <KpiCard icon={Timer}        label="متوسط أيام الإغلاق"  iconColor="violet-500"  value={loading ? '…' : (t.avgDays ?? 0)} sub="يوم من تاريخ الإصدار" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={AlertTriangle} label="متأخرة (+7 أيام)"   iconColor="red-500"    accent="border-red-500/30"   value={loading ? '…' : (t.overdueCount??0).toLocaleString()} sub="تحتاج متابعة عاجلة" />
          <KpiCard icon={Zap}           label="قيد التنفيذ"         iconColor="indigo-500" value={loading ? '…' : (t.inProgress??0).toLocaleString()} />
          <KpiCard icon={Clock}         label="معلقة"               iconColor="amber-500"  value={loading ? '…' : (t.pending??0).toLocaleString()} />
          <KpiCard icon={Target}        label="إغلاق خلال 3 أيام"  iconColor="teal-500"   value={loading ? '…' : `${pct((sla.within1??0)+(sla.within3??0), t.closed??1)}%`} sub={`${((sla.within1??0)+(sla.within3??0)).toLocaleString()} تذكرة`} />
        </div>

        {/* ── SLA ─────────────────────────────────────────────────────────── */}
        <Card title="معدل الاستجابة SLA" badge={`${(t.closed??0).toLocaleString()} مغلقة`}>
          {loading ? <Skeleton h="h-20" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label:'خلال يوم',     v:sla.within1??0, c:'bg-emerald-500' },
                { label:'خلال 3 أيام',  v:sla.within3??0, c:'bg-teal-500'   },
                { label:'خلال أسبوع',   v:sla.within7??0, c:'bg-blue-500'   },
                { label:'خلال 14 يوم',  v:sla.within14??0,c:'bg-amber-500'  },
                { label:'أكثر من 14',   v:sla.over14??0,  c:'bg-red-500'    },
              ].map((s, i) => {
                const p = pct(s.v, t.closed ?? 1);
                return (
                  <div key={i} className="bg-muted/40 rounded-xl p-3 text-center space-y-2">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', s.c)} style={{ width:`${p}%`, minWidth: s.v > 0 ? '6px' : '0' }} />
                    </div>
                    <p className="text-xl font-black tabular-nums">{s.v.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                    <p className="text-xs font-bold text-foreground">{p}%</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Specialty + Monthly ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Specialty pie */}
          <div className="lg:col-span-2">
            <Card title="التوزيع حسب التخصص">
              {loading ? <Skeleton /> : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={specialtyData} dataKey="count" nameKey="nameAr" cx="50%" cy="50%"
                        innerRadius={55} outerRadius={85} paddingAngle={4} startAngle={90} endAngle={-270}>
                        {specialtyData.map((e:any, i:number) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip content={<TooltipBox />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 border-t border-border pt-3">
                    {specialtyData.map((s:any, i:number) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.fill }} />
                        <span className="text-sm text-foreground flex-1 text-right">{s.nameAr}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{pct(s.count, total)}%</span>
                        <span className="text-sm font-bold tabular-nums w-14 text-right">{s.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Monthly trend */}
          <div className="lg:col-span-3">
            <Card title="الاتجاه الزمني حسب تاريخ الإصدار">
              {loading ? <Skeleton h="h-72" /> : monthlyData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, direction: 'rtl' }} />
                    <Line type="monotone" dataKey="إجمالي" stroke="#6366f1" strokeWidth={2.5} dot={{ r:3 }} activeDot={{ r:5 }} />
                    <Line type="monotone" dataKey="مغلق"   stroke="#22c55e" strokeWidth={2}   dot={{ r:3 }} />
                    <Line type="monotone" dataKey="مفتوح"  stroke="#f97316" strokeWidth={2}   dot={{ r:3 }} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>

        {/* ── Main Type + Priority ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <Card title="التوزيع حسب النوع الرئيسي">
              {loading ? <Skeleton h="h-64" /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={mainTypeData} margin={{ top:5, right:10, left:-20, bottom:50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize:9, fill:'hsl(var(--muted-foreground))' }} angle={-40} textAnchor="end" tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox />} />
                    <Legend wrapperStyle={{ fontSize:11, paddingTop:8, direction:'rtl' }} />
                    <Bar dataKey="مغلق"  stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                    <Bar dataKey="مفتوح" stackId="a" fill="#f97316" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card title="توزيع الأولويات">
            {loading ? <Skeleton h="h-64" /> : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={40} outerRadius={75} paddingAngle={3}>
                      {priorityData.map((e:any,i:number) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<TooltipBox />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 border-t border-border pt-3">
                  {priorityData.map((p:any,i:number) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.fill }} />
                      <span className="text-sm flex-1 text-right text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{pct(p.value, total)}%</span>
                      <span className="text-sm font-bold tabular-nums w-12 text-right">{p.value?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Projects + Avg Days by Type ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="التوزيع حسب المشروع">
            {loading ? <Skeleton h="h-56" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={projectData} margin={{ top:5, right:10, left:-20, bottom:45 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:9, fill:'hsl(var(--muted-foreground))' }} angle={-40} textAnchor="end" tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<TooltipBox />} />
                  <Legend wrapperStyle={{ fontSize:11, paddingTop:8, direction:'rtl' }} />
                  <Bar dataKey="مغلق"  stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                  <Bar dataKey="مفتوح" stackId="a" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="متوسط أيام الإغلاق حسب النوع">
            {loading ? <Skeleton h="h-56" /> : avgDaysData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={avgDaysData} layout="vertical" margin={{ top:5, right:55, left:5, bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize:9, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar dataKey="متوسط الأيام" radius={[0,6,6,0]} label={{ position:'right', fontSize:10, fill:'hsl(var(--muted-foreground))' }}>
                    {avgDaysData.map((_:any,i:number) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* ── Sub-type bar ─────────────────────────────────────────────────── */}
        {(data?.bySubType?.length ?? 0) > 0 && (
          <Card title="التوزيع حسب النوع الفرعي" badge={`${data?.bySubType?.length} نوع`}>
            <ResponsiveContainer width="100%" height={Math.max(280, (subTypeData.length) * 26 + 40)}>
              <BarChart data={subTypeData} layout="vertical" margin={{ top:5, right:55, left:5, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<TooltipBox />} />
                <Bar dataKey="عدد" radius={[0,6,6,0]} label={{ position:'right', fontSize:10, fill:'hsl(var(--muted-foreground))' }}>
                  {subTypeData.map((_:any,i:number) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* ── Supervisor Table ─────────────────────────────────────────────── */}
        {(data?.bySupervisor?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px]">{data?.bySupervisor?.length} مشرف</Badge>
              <h2 className="font-bold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> أداء المشرفين</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right" dir="rtl">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {['المشرف','التخصص','الإجمالي','مغلقة','مفتوحة','معدل الإغلاق','متوسط الإغلاق'].map(h => (
                      <th key={h} className={cn(TABLE_TH, 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.bySupervisor ?? []).map((s: any, i: number) => (
                    <tr key={s.uid} className={cn('border-b border-border/50 hover:bg-muted/30 transition-colors', i%2===1 && 'bg-muted/10')}>
                      <td className={cn(TABLE_TD, 'font-semibold')}>{s.name}</td>
                      <td className={cn(TABLE_TD, 'text-muted-foreground text-xs')}>{s.specialty || '—'}</td>
                      <td className={cn(TABLE_TD, 'font-bold tabular-nums')}>{s.total.toLocaleString()}</td>
                      <td className={cn(TABLE_TD, 'text-emerald-500 font-semibold tabular-nums')}>{s.closed.toLocaleString()}</td>
                      <td className={cn(TABLE_TD, 'text-orange-500 font-semibold tabular-nums')}>{s.open.toLocaleString()}</td>
                      <td className={TABLE_TD}>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width:`${pct(s.closed,s.total)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct(s.closed,s.total)}%</span>
                        </div>
                      </td>
                      <td className={TABLE_TD}>
                        {s.avgDays != null ? (
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', s.avgDays <= 3 ? 'bg-emerald-500/10 text-emerald-500' : s.avgDays <= 7 ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500')}>
                            {s.avgDays} يوم
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Top Clients ──────────────────────────────────────────────────── */}
        {(data?.topClients?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px]">أعلى 10</Badge>
              <h2 className="font-bold text-sm flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> العملاء الأكثر تذاكر</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right" dir="rtl">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {['العميل','الفيلا','الإجمالي','مغلقة','مفتوحة','معدل الإغلاق'].map(h => (
                      <th key={h} className={cn(TABLE_TH, 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.topClients ?? []).map((c: any, i: number) => (
                    <tr key={c.clientId} className={cn('border-b border-border/50 hover:bg-muted/30 transition-colors', i%2===1 && 'bg-muted/10')}>
                      <td className={cn(TABLE_TD, 'font-semibold')}>{c.clientName}</td>
                      <td className={cn(TABLE_TD, 'text-muted-foreground text-xs')}>{c.villaNumber || '—'}</td>
                      <td className={cn(TABLE_TD, 'font-bold tabular-nums')}>{c.count.toLocaleString()}</td>
                      <td className={cn(TABLE_TD, 'text-emerald-500 font-semibold tabular-nums')}>{c.closed.toLocaleString()}</td>
                      <td className={cn(TABLE_TD, 'text-orange-500 font-semibold tabular-nums')}>{c.open.toLocaleString()}</td>
                      <td className={TABLE_TD}>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width:`${pct(c.closed,c.count)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct(c.closed,c.count)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Status Breakdown ──────────────────────────────────────────────── */}
        {(data?.byStatus?.length ?? 0) > 0 && (
          <Card title="تفاصيل حالات التذاكر">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(data?.byStatus ?? []).map((s: any) => (
                <div key={s.key} className="rounded-xl border border-border/50 p-3 text-center space-y-1.5">
                  <p className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.count.toLocaleString()}</p>
                  <p className="text-xs font-semibold text-foreground">{s.nameAr}</p>
                  <p className="text-[10px] text-muted-foreground">{pct(s.count, total)}%</p>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ background: s.color, width:`${pct(s.count,total)}%`, minWidth: s.count > 0 ? '4px' : '0' }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Sub-type Detail Table ─────────────────────────────────────────── */}
        {(data?.bySubType?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px]">{data?.bySubType?.length} نوع</Badge>
              <h2 className="font-bold text-sm">تفاصيل الأنواع الفرعية</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right" dir="rtl">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {['النوع الفرعي','النوع الرئيسي','الإجمالي','مغلق','مفتوح','معدل الإغلاق'].map(h => (
                      <th key={h} className={cn(TABLE_TH, 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.bySubType ?? []).map((s: any, i: number) => (
                    <tr key={s.id} className={cn('border-b border-border/50 hover:bg-muted/30 transition-colors', i%2===1 && 'bg-muted/10')}>
                      <td className={cn(TABLE_TD, 'font-semibold')}>{s.nameAr}</td>
                      <td className={cn(TABLE_TD, 'text-muted-foreground text-xs')}>{s.parentName}</td>
                      <td className={cn(TABLE_TD, 'font-bold tabular-nums')}>{s.count.toLocaleString()}</td>
                      <td className={cn(TABLE_TD, 'text-emerald-500 font-semibold tabular-nums')}>{s.closed.toLocaleString()}</td>
                      <td className={cn(TABLE_TD, 'text-orange-500 font-semibold tabular-nums')}>{s.open.toLocaleString()}</td>
                      <td className={TABLE_TD}>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width:`${pct(s.closed,s.count)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct(s.closed,s.count)}%</span>
                        </div>
                      </td>
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
