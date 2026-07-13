import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Download, Maximize2, X, Printer, Filter,
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
        <h2 className="font-bold text-foreground text-sm">{title}</h2>
        <div className="flex items-center gap-2">
          {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const TABLE_TH = "px-4 py-2.5 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide";
const TABLE_TD = "px-4 py-2.5";

// ── Full-screen chart modal ───────────────────────────────────────────────────
function ChartModal({ title, allData, dataKey, colorKey, onClose }: {
  title: string;
  allData: any[];
  dataKey: string;
  colorKey?: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(allData.map(d => d.name)));
  const printRef = useRef<HTMLDivElement>(null);

  const filtered = allData.filter(d => selected.has(d.name));

  const toggleItem = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${title}</title>
      <style>
        body { font-family: 'Tajawal', sans-serif; direction: rtl; background: #0f1117; color: #fff; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 12px; border: 1px solid #333; text-align: right; font-size: 13px; }
        th { background: #1a1f2e; }
        h2 { margin-bottom: 8px; }
        @media print { @page { margin: 10mm; } }
      </style>
    </head><body>
      <h2>${title}</h2>
      <table>
        <thead><tr><th>النوع</th><th>${dataKey}</th></tr></thead>
        <tbody>${filtered.map(d => `<tr><td>${d.name}</td><td>${d[dataKey]}</td></tr>`).join('')}</tbody>
      </table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handlePrint} title="طباعة">
            <Printer className="w-4 h-4" />
          </Button>
          <Badge variant="secondary" className="text-xs">{filtered.length} نوع</Badge>
        </div>
        <h2 className="font-bold text-lg">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chart area */}
        <div className="flex-1 p-6 overflow-auto" ref={printRef}>
          <ResponsiveContainer width="100%" height={Math.max(400, filtered.length * 36 + 60)}>
            <BarChart data={filtered} margin={{ top: 10, right: 20, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                angle={-40} textAnchor="end" tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <Tooltip content={<TooltipBox />} />
              <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}
                label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}>
                {filtered.map((d: any, i: number) => (
                  <Cell key={i} fill={colorKey ? d[colorKey] : COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Filter sidebar */}
        <div className="w-56 border-r border-border p-4 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setSelected(new Set(allData.map(d => d.name)))}
              className="text-[10px] text-primary hover:underline">تحديد الكل</button>
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              <Filter className="w-3 h-3" /> تصفية
            </p>
          </div>
          <div className="space-y-1.5">
            {allData.map((d, i) => (
              <label key={d.name} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={selected.has(d.name)}
                  onChange={() => toggleItem(d.name)}
                  className="rounded" />
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: colorKey ? d[colorKey] : COLORS[i % COLORS.length] }} />
                <span className="text-xs text-foreground group-hover:text-primary truncate">{d.name}</span>
                <span className="text-[10px] text-muted-foreground mr-auto shrink-0">{d[dataKey]}</span>
              </label>
            ))}
          </div>
          <button onClick={() => setSelected(new Set())}
            className="text-[10px] text-red-400 hover:underline mt-3 block">مسح الكل</button>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');
  const [loading, setLoading]             = useState(true);
  const [data, setData]                   = useState<any>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [expandedChart, setExpandedChart] = useState<'avgDays' | 'subType' | null>(null);

  useEffect(() => { projectsApi.getAll().then((p: any[]) => setProjects(p)).catch(() => {}); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try { setData(await reportsApi.getStats({ projectId: filterProject||undefined, from: filterFrom||undefined, to: filterTo||undefined })); }
    catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { fetchStats(); }, [filterProject, filterFrom, filterTo]);

  const exportPDF = async () => {
    if (!data) return;
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const date = new Date().toLocaleDateString('ar-SA');
      const t = data.totals ?? {};

      // ── Header ──
      pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
      pdf.text('Maintenance Report', 105, 18, { align: 'center' });
      pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
      pdf.text(date, 105, 26, { align: 'center' });
      pdf.setDrawColor(100, 102, 241); pdf.setLineWidth(0.5);
      pdf.line(15, 30, 195, 30);

      // ── KPIs ──
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
      pdf.text('Summary', 15, 38);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      const kpis = [
        ['Total Tickets', String(t.total ?? 0)],
        ['Open', String(t.open ?? 0)],
        ['Closed', String(t.closed ?? 0)],
        ['Avg Days to Close', String(t.avgDays ?? 0) + ' days'],
        ['Overdue (+7 days)', String(t.overdueCount ?? 0)],
      ];
      kpis.forEach(([k, v], i) => {
        pdf.text(k + ': ' + v, 15 + (i % 3) * 62, 46 + Math.floor(i / 3) * 7);
      });

      // ── By Type ──
      let y = 70;
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.text('By Ticket Type', 15, y); y += 7;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
      pdf.setFillColor(240, 240, 255);
      pdf.rect(15, y, 180, 6, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.text('Type', 17, y + 4); pdf.text('Total', 90, y + 4); pdf.text('Closed', 120, y + 4); pdf.text('Open', 150, y + 4);
      y += 8; pdf.setFont('helvetica', 'normal');
      (data.byMainType ?? []).slice(0, 12).forEach((row: any, i: number) => {
        if (i % 2 === 0) { pdf.setFillColor(248, 248, 252); pdf.rect(15, y - 1, 180, 6, 'F'); }
        pdf.text(row.nameAr ?? row.key, 17, y + 3);
        pdf.text(String(row.count), 90, y + 3);
        pdf.text(String(row.closed), 120, y + 3);
        pdf.text(String(row.open), 150, y + 3);
        y += 7;
      });

      // ── By Sub-type ──
      y += 5;
      if (y > 240) { pdf.addPage(); y = 20; }
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.text('By Sub-Type', 15, y); y += 7;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
      pdf.setFillColor(240, 240, 255);
      pdf.rect(15, y, 180, 6, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.text('Sub-Type', 17, y + 4); pdf.text('Type', 90, y + 4); pdf.text('Total', 130, y + 4); pdf.text('Close%', 160, y + 4);
      y += 8; pdf.setFont('helvetica', 'normal');
      (data.bySubType ?? []).slice(0, 15).forEach((row: any, i: number) => {
        if (y > 270) { pdf.addPage(); y = 20; }
        if (i % 2 === 0) { pdf.setFillColor(248, 248, 252); pdf.rect(15, y - 1, 180, 6, 'F'); }
        pdf.text(row.nameAr ?? '', 17, y + 3);
        pdf.text(row.parentName ?? '', 90, y + 3);
        pdf.text(String(row.count), 130, y + 3);
        pdf.text(pct(row.closed, row.count) + '%', 160, y + 3);
        y += 7;
      });

      // ── Supervisor ──
      if ((data.bySupervisor ?? []).length > 0) {
        y += 5;
        if (y > 240) { pdf.addPage(); y = 20; }
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
        pdf.text('Supervisor Performance', 15, y); y += 7;
        pdf.setFontSize(9);
        pdf.setFillColor(240, 240, 255); pdf.rect(15, y, 180, 6, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.text('Supervisor', 17, y + 4); pdf.text('Total', 85, y + 4); pdf.text('Closed', 110, y + 4); pdf.text('Close%', 140, y + 4); pdf.text('Avg Days', 165, y + 4);
        y += 8; pdf.setFont('helvetica', 'normal');
        (data.bySupervisor ?? []).slice(0, 10).forEach((s: any, i: number) => {
          if (y > 270) { pdf.addPage(); y = 20; }
          if (i % 2 === 0) { pdf.setFillColor(248, 248, 252); pdf.rect(15, y - 1, 180, 6, 'F'); }
          pdf.text(s.name ?? '', 17, y + 3);
          pdf.text(String(s.total), 85, y + 3);
          pdf.text(String(s.closed), 110, y + 3);
          pdf.text(pct(s.closed, s.total) + '%', 140, y + 3);
          pdf.text(s.avgDays != null ? s.avgDays + 'd' : '-', 165, y + 3);
          y += 7;
        });
      }

      pdf.save(`maintenance-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e: any) {
      alert('PDF Error: ' + (e?.message ?? e));
    }
  };

  const t = data?.totals ?? {};
  const total = t.total ?? 0;
  const sla   = data?.sla ?? {};

  // ── chart data ──────────────────────────────────────────────────────────────
  const specialtyData  = useMemo(() => (data?.bySpecialty ?? []).map((s:any,i:number) => ({ ...s, fill: COLORS[i % COLORS.length] })), [data]);
  const mainTypeData   = useMemo(() => (data?.byMainType ?? []).map((x:any) => ({ name:x.nameAr, مغلق:x.closed, مفتوح:x.open })), [data]);
  const subTypeData    = useMemo(() => (data?.bySubType  ?? []).map((x:any,i:number) => ({ name:x.nameAr, عدد:x.count, fill:COLORS[i%COLORS.length] })), [data]);
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
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={loading || !data} className="gap-2">
              <Download className="w-3.5 h-3.5" />
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
                className="w-full appearance-none bg-muted border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/40 pl-8" dir="rtl">
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

        {/* ── Main Type — full width ───────────────────────────────────────── */}
        <Card title="التوزيع حسب النوع الرئيسي">
          {loading ? <Skeleton h="h-80" /> : (
            <ResponsiveContainer width="100%" height={Math.max(380, mainTypeData.length * 34 + 60)}>
              <BarChart data={mainTypeData} layout="vertical" margin={{ top:5, right:60, left:0, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={140}
                  tick={{ fontSize:11, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip content={<TooltipBox />} />
                <Legend wrapperStyle={{ fontSize:11, paddingTop:8, direction:'rtl' }} />
                <Bar dataKey="مغلق"  stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                <Bar dataKey="مفتوح" stackId="a" fill="#f97316" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

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

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <button onClick={() => setExpandedChart('avgDays')}
                className="text-muted-foreground hover:text-foreground transition-colors" title="تكبير">
                <Maximize2 className="w-4 h-4" />
              </button>
              <h2 className="font-bold text-sm">متوسط أيام الإغلاق حسب النوع</h2>
            </div>
            <div className="p-5">
            {loading ? <Skeleton h="h-56" /> : avgDaysData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={avgDaysData} margin={{ top:10, right:10, left:-10, bottom:60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:9, fill:'hsl(var(--muted-foreground))' }}
                    angle={-40} textAnchor="end" tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar dataKey="متوسط الأيام" radius={[4,4,0,0]}
                    label={{ position:'top', fontSize:9, fill:'hsl(var(--muted-foreground))' }}>
                    {avgDaysData.map((_:any,i:number) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            </div>
          </div>
        </div>

        {/* ── Sub-type bar ─────────────────────────────────────────────────── */}
        {(data?.bySubType?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h2 className="font-bold text-sm">التوزيع حسب النوع الفرعي</h2>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{data?.bySubType?.length} نوع</Badge>
                <button onClick={() => setExpandedChart('subType')}
                  className="text-muted-foreground hover:text-foreground transition-colors" title="تكبير">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={Math.max(400, subTypeData.length * 26 + 40)}>
                <BarChart data={subTypeData} layout="vertical" margin={{ top:5, right:50, left:0, bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={130}
                    tick={{ fontSize:10, fill:'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar dataKey="عدد" radius={[0,4,4,0]}
                    label={{ position:'right', fontSize:9, fill:'hsl(var(--muted-foreground))' }}>
                    {subTypeData.map((_:any,i:number) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Supervisor Table ─────────────────────────────────────────────── */}
        {(data?.bySupervisor?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> أداء المشرفين</h2>
              <Badge variant="secondary" className="text-[10px]">{data?.bySupervisor?.length} مشرف</Badge>
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
              <h2 className="font-bold text-sm flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> العملاء الأكثر تذاكر</h2>
              <Badge variant="secondary" className="text-[10px]">أعلى 10</Badge>
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

      {/* ── Full-screen chart modals ─────────────────────────────────────── */}
      {expandedChart === 'avgDays' && (
        <ChartModal
          title="متوسط أيام الإغلاق حسب النوع"
          allData={avgDaysData}
          dataKey="متوسط الأيام"
          onClose={() => setExpandedChart(null)}
        />
      )}
      {expandedChart === 'subType' && (
        <ChartModal
          title="التوزيع حسب النوع الفرعي"
          allData={subTypeData}
          dataKey="عدد"
          onClose={() => setExpandedChart(null)}
        />
      )}
    </Layout>
  );
}
