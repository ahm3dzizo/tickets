import React, { useMemo, useState } from 'react';
import {
  Download,
  Printer,
  FileText,
  Filter,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Ticket, Project, TicketType } from '@/types';
import { cn } from '@/lib/utils';
import { typeTranslations, statusTranslations } from '@/components/tickets/TicketTable';

type Props = {
  tickets: Ticket[];
  projects: Project[];
  userRole?: string;
};

type ReportPoint = {
  label: string;
  value: number;
};

type TimelinePoint = {
  date: string;
  total: number;
};

const priorityTranslations: Record<string, string> = {
  '3': '3 - منخفض',
  '4': '4 - عادي',
  '6': '6 - متوسط',
  '7': '7 - مرتفع',
  '9': '9 - عاجل جداً',
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];
const GENERAL_MAINTENANCE_COLORS = ['#f59e0b', '#3b82f6', '#10b981'];

function exportRowsToCsv(fileName: string, rows: Record<string, any>[]) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? '').replace(/"/g, '""');
          return `"${value}"`;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printElementById(elementId: string, title = 'Report') {
  const content = document.getElementById(elementId);
  if (!content) return;

  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) return;

  printWindow.document.write(`
    <html dir="rtl" lang="ar">
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #111;
          }
          h1, h2, h3 {
            margin-bottom: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
          }
          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: right;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function normalizeSpecialty(value?: string): 'MECHANICS' | 'ELECTRICITY' | 'GENERAL' | null {
  if (!value) return null;
  const v = value.toLowerCase();

  if (v === 'MECHANICS' || v === 'plumbing' || v === 'tank_insulation') return 'MECHANICS';
  if (v === 'ELECTRICITY') return 'ELECTRICITY';
  if (v === 'GENERAL' || v === 'doors' || v === 'paints' || v === 'cracks' || v === 'ceramics') return 'GENERAL';

  return null;
}

function parseFlexibleDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const onlyDate = raw.split('T')[0].split(' ')[0];

  const slashMatch = onlyDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const dashMatch = onlyDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, dd, mm, yyyy] = dashMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const isoLooseMatch = onlyDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoLooseMatch) {
    const [, yyyy, mm, dd] = isoLooseMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function getTicketIssuedDate(ticket: Ticket): Date | null {
  return (
    parseFlexibleDate((ticket as any).issuedAt) ||
    parseFlexibleDate((ticket as any).issued_at) ||
    parseFlexibleDate((ticket as any).createdAt) ||
    parseFlexibleDate((ticket as any).created_at)
  );
}

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
  });
}

export function ReportsSection({ tickets, projects }: Props) {
  const [customSearch, setCustomSearch] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [customType, setCustomType] = useState('');
  const [customPriority, setCustomPriority] = useState('');
  const [customProject, setCustomProject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timelineProjectId, setTimelineProjectId] = useState('');

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const s = customSearch.trim().toLowerCase();

      const matchSearch =
        !s ||
        t.unitNumber?.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s) ||
        t.clientName?.toLowerCase().includes(s) ||
        t.ticketId?.toLowerCase().includes(s) ||
        t.refNumber?.toLowerCase().includes(s);

      const matchStatus = !customStatus || t.status === customStatus;

      const matchType =
        !customType ||
        t.type === customType ||
        (t.detectedTypes as string[] | undefined)?.includes(customType as TicketType);

      const matchPriority = !customPriority || String(t.priority ?? '') === customPriority;
      const matchProject = !customProject || t.projectId === customProject;

      const ticketDate = getTicketIssuedDate(t);

      const matchDateFrom =
        !dateFrom || !ticketDate || ticketDate >= new Date(dateFrom);

      const matchDateTo =
        !dateTo || !ticketDate || ticketDate <= new Date(`${dateTo}T23:59:59`);

      return (
        matchSearch &&
        matchStatus &&
        matchType &&
        matchPriority &&
        matchProject &&
        matchDateFrom &&
        matchDateTo
      );
    });
  }, [tickets, customSearch, customStatus, customType, customPriority, customProject, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const closedStatuses = ['closed', 'completed', 'resolved'];
    const openCount = filteredTickets.filter((t) => t.status === 'open').length;
    const closedCount = filteredTickets.filter((t) => closedStatuses.includes(String(t.status))).length;
    const highPriorityCount = filteredTickets.filter((t) => Number(t.priority) >= 7).length;

    return {
      total: filteredTickets.length,
      open: openCount,
      closed: closedCount,
      highPriority: highPriorityCount,
    };
  }, [filteredTickets]);

  const statusData = useMemo<ReportPoint[]>(() => {
    const map = new Map<string, number>();
    filteredTickets.forEach((t) => {
      const key = t.status || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [filteredTickets]);

  const typeData = useMemo<ReportPoint[]>(() => {
    const map = new Map<string, number>();
    filteredTickets.forEach((t) => {
      const key = t.type || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [filteredTickets]);

  const priorityData = useMemo<ReportPoint[]>(() => {
    const map = new Map<string, number>();
    filteredTickets.forEach((t) => {
      const key = String(t.priority ?? 'غير محدد');
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([label, value]) => ({ label, value }));
  }, [filteredTickets]);

  const projectData = useMemo<ReportPoint[]>(() => {
    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
    const map = new Map<string, number>();

    filteredTickets.forEach((t) => {
      const key = projectMap[t.projectId] || 'غير مرتبط بمشروع';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [filteredTickets, projects]);

  const timelineData = useMemo<ReportPoint[]>(() => {
    const map = new Map<string, number>();

    filteredTickets.forEach((t) => {
      const date = getTicketIssuedDate(t);
      if (!date) return;

      const monthKey = getMonthKey(date);
      map.set(monthKey, (map.get(monthKey) || 0) + 1);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, value]) => ({
        label: getMonthLabel(monthKey),
        value,
      }));
  }, [filteredTickets]);

  const maintenanceGENERALData = useMemo<ReportPoint[]>(() => {
    const counts = {
      MECHANICS: 0,
      ELECTRICITY: 0,
      GENERAL: 0,
    };

    filteredTickets.forEach((ticket) => {
      const detected = Array.isArray((ticket as any).detectedTypes)
        ? ((ticket as any).detectedTypes as string[])
        : [];

      if (detected.length > 0) {
        const added = new Set<string>();

        detected.forEach((item) => {
          const normalized = normalizeSpecialty(item);
          if (normalized && !added.has(normalized)) {
            counts[normalized] += 1;
            added.add(normalized);
          }
        });

        return;
      }

      const fallback = normalizeSpecialty((ticket as any).type);
      if (fallback) counts[fallback] += 1;
    });

    return [
      { label: 'ميكانيكا', value: counts.MECHANICS },
      { label: 'كهرباء', value: counts.ELECTRICITY },
      { label: 'عام', value: counts.GENERAL },
    ];
  }, [filteredTickets]);

  const projectCumulativeTimeline = useMemo<TimelinePoint[]>(() => {
    const targetTickets = timelineProjectId
      ? filteredTickets.filter((t) => t.projectId === timelineProjectId)
      : filteredTickets;

    const monthMap = new Map<string, number>();

    targetTickets.forEach((ticket) => {
      const date = getTicketIssuedDate(ticket);
      if (!date) return;

      const monthKey = getMonthKey(date);
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
    });

    const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    let runningTotal = 0;

    return sortedMonths.map(([monthKey, count]) => {
      runningTotal += count;
      return {
        date: getMonthLabel(monthKey),
        total: runningTotal,
      };
    });
  }, [filteredTickets, timelineProjectId]);

  const selectedProjectName = useMemo(() => {
    return projects.find((p) => p.id === timelineProjectId)?.name;
  }, [projects, timelineProjectId]);

  const detailedRows = useMemo(() => {
    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

    return filteredTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketId || t.refNumber || t.id,
      clientName: t.clientName || '-',
      unitNumber: t.unitNumber || '-',
      project: projectMap[t.projectId] || '-',
      type: t.type || '-',
      status: t.status || '-',
      priority: t.priority ?? '-',
      issuedAt: (t as any).issuedAt || (t as any).issued_at || '-',
      createdAt: (t as any).createdAt || (t as any).created_at || '-',
      description: t.description || '-',
    }));
  }, [filteredTickets, projects]);

  const clearCustomFilters = () => {
    setCustomSearch('');
    setCustomStatus('');
    setCustomType('');
    setCustomPriority('');
    setCustomProject('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-6 pt-8 border-t border-border">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-right">
          <h2 className="text-2xl font-black text-white">التقارير والتحليلات</h2>
          <p className="text-slate-500 text-sm mt-1">
            تقارير مجمعة، مفصلة، وتقارير حسب الطلب مع تصدير وطباعة
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-xl border-border bg-card text-slate-200"
            onClick={() => exportRowsToCsv('detailed-report.csv', detailedRows)}
          >
            <Download className="w-4 h-4 ml-2" />
            تصدير CSV
          </Button>

          <Button
            variant="outline"
            className="rounded-xl border-border bg-card text-slate-200"
            onClick={() => printElementById('reports-print-area', 'تقارير الصيانة')}
          >
            <Printer className="w-4 h-4 ml-2" />
            طباعة التقرير
          </Button>
        </div>
      </div>

      <div id="reports-print-area" className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card border-border rounded-2xl">
            <CardContent className="p-4 text-right">
              <div className="text-slate-500 text-xs mb-2">إجمالي التذاكر</div>
              <div className="text-3xl font-black text-white">{summary.total}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-2xl">
            <CardContent className="p-4 text-right">
              <div className="text-slate-500 text-xs mb-2">التذاكر المفتوحة</div>
              <div className="text-3xl font-black text-red-400">{summary.open}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-2xl">
            <CardContent className="p-4 text-right">
              <div className="text-slate-500 text-xs mb-2">التذاكر المغلقة</div>
              <div className="text-3xl font-black text-emerald-400">{summary.closed}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-2xl">
            <CardContent className="p-4 text-right">
              <div className="text-slate-500 text-xs mb-2">العالية الأولوية</div>
              <div className="text-3xl font-black text-amber-400">{summary.highPriority}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border rounded-3xl">
          <CardContent className="p-5 space-y-4">
            <div className="text-right">
              <h3 className="text-white font-bold text-lg">فلتر الجدول الزمني للمشروع</h3>
              <p className="text-slate-500 text-sm mt-1">
                اختر مشروعًا لعرض النمو التراكمي الشهري للتذاكر حسب تاريخ الإصدار
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" className="rounded-xl border-border bg-background text-slate-200">
                      <ChevronDown className="w-4 h-4 ml-2" />
                      {timelineProjectId
                        ? projects.find((p) => p.id === timelineProjectId)?.name ?? 'المشروع'
                        : 'كل المشاريع'}
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem onClick={() => setTimelineProjectId('')}>
                    كل المشاريع
                  </DropdownMenuItem>
                  {projects.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setTimelineProjectId(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg text-right mb-4">التذاكر حسب الحالة</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" stroke="#94a3b8" interval={0} tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg text-right mb-4">التذاكر حسب التخصص</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeData}
                      dataKey="value"
                      nameKey="label"
                      outerRadius={110}
                      innerRadius={55}
                      paddingAngle={4}
                    >
                      {typeData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg text-right mb-4">أنواع الصيانة العامة</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={maintenanceGENERALData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" stroke="#94a3b8" interval={0} tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {maintenanceGENERALData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={GENERAL_MAINTENANCE_COLORS[index % GENERAL_MAINTENANCE_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg text-right mb-4">التذاكر حسب المشروع</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" stroke="#94a3b8" interval={0} tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg text-right mb-4">الاتجاه الزمني العام للتذاكر</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData.map((i) => ({ month: i.label, total: i.value }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      interval={0}
                      tick={{ fontSize: 11 }}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg text-right mb-1">
                الجدول الزمني التراكمي للمشروع
              </h3>
              <p className="text-slate-500 text-xs text-right mb-4">
                {selectedProjectName
                  ? `المشروع المحدد: ${selectedProjectName}`
                  : 'كل المشاريع'}
              </p>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projectCumulativeTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      interval={0}
                      tick={{ fontSize: 11 }}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border rounded-3xl">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg text-right flex items-center gap-2">
                <Filter className="w-4 h-4" />
                تقارير حسب الطلب
              </h3>
              <Button
                variant="ghost"
                className="text-slate-400 hover:text-red-400"
                onClick={clearCustomFilters}
              >
                مسح الفلاتر
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Input
                placeholder="بحث..."
                value={customSearch}
                onChange={(e) => setCustomSearch(e.target.value)}
                className="bg-background border-border text-white text-right"
              />

              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-background border-border text-white text-right"
              />

              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-background border-border text-white text-right"
              />

              <div className="text-right text-slate-400 text-sm flex items-center justify-end">
                عدد النتائج: <span className="text-white font-bold mr-2">{filteredTickets.length}</span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" className={cn('rounded-xl border-border bg-background text-slate-200')}>
                      {customStatus ? statusTranslations[customStatus] : 'الحالة'}
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem onClick={() => setCustomStatus('')}>كل الحالات</DropdownMenuItem>
                  {Object.entries(statusTranslations).map(([k, v]) => (
                    <DropdownMenuItem key={k} onClick={() => setCustomStatus(k)}>
                      {v}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" className={cn('rounded-xl border-border bg-background text-slate-200')}>
                      {customType ? typeTranslations[customType as TicketType] : 'التخصص'}
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem onClick={() => setCustomType('')}>كل التخصصات</DropdownMenuItem>
                  {Object.entries(typeTranslations).map(([k, v]) => (
                    <DropdownMenuItem key={k} onClick={() => setCustomType(k)}>
                      {v}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" className={cn('rounded-xl border-border bg-background text-slate-200')}>
                      {customPriority ? priorityTranslations[customPriority] ?? customPriority : 'الأولوية'}
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem onClick={() => setCustomPriority('')}>كل الأولويات</DropdownMenuItem>
                  {(['9', '7', '6', '4', '3'] as const).map((p) => (
                    <DropdownMenuItem key={p} onClick={() => setCustomPriority(p)}>
                      {priorityTranslations[p]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" className={cn('rounded-xl border-border bg-background text-slate-200')}>
                      {customProject ? projects.find((p) => p.id === customProject)?.name ?? 'المشروع' : 'المشروع'}
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem onClick={() => setCustomProject('')}>كل المشاريع</DropdownMenuItem>
                  {projects.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setCustomProject(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border rounded-3xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <FileText className="w-4 h-4" />
                التقرير المفصل
              </h3>

              <Button
                variant="outline"
                className="rounded-xl border-border bg-background text-slate-200"
                onClick={() => exportRowsToCsv('custom-detailed-report.csv', detailedRows)}
              >
                <Download className="w-4 h-4 ml-2" />
                تصدير التقرير المفصل
              </Button>
            </div>

            <div className="overflow-auto max-h-[500px] rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-border text-slate-400">
                    <th className="p-3 text-right">رقم التذكرة</th>
                    <th className="p-3 text-right">العميل</th>
                    <th className="p-3 text-right">الفيلا</th>
                    <th className="p-3 text-right">المشروع</th>
                    <th className="p-3 text-right">التخصص</th>
                    <th className="p-3 text-right">الحالة</th>
                    <th className="p-3 text-right">الأولوية</th>
                    <th className="p-3 text-right">تاريخ الإصدار</th>
                  </tr>
                </thead>
                <tbody>
                  {detailedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        لا توجد بيانات مطابقة
                      </td>
                    </tr>
                  ) : (
                    detailedRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/60 text-slate-200 hover:bg-white/[0.02]">
                        <td className="p-3">{row.ticketNumber}</td>
                        <td className="p-3">{row.clientName}</td>
                        <td className="p-3">{row.unitNumber}</td>
                        <td className="p-3">{row.project}</td>
                        <td className="p-3">{row.type}</td>
                        <td className="p-3">{row.status}</td>
                        <td className="p-3">{row.priority}</td>
                        <td className="p-3">{row.issuedAt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg mb-4 text-right flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                ملخص حسب الأولوية
              </h3>
              <div className="space-y-3">
                {priorityData.length === 0 ? (
                  <div className="text-slate-500 text-sm text-center py-6">لا توجد بيانات</div>
                ) : (
                  priorityData.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-2xl bg-background border border-border px-4 py-3">
                      <span className="text-white font-bold">{item.value}</span>
                      <span className="text-slate-300">{priorityTranslations[item.label] ?? item.label}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-3xl">
            <CardContent className="p-5">
              <h3 className="text-white font-bold text-lg mb-4 text-right">استخدام التقرير</h3>
              <div className="space-y-3 text-sm text-slate-300 leading-7 text-right">
                <p>يعتمد الاتجاه الزمني الآن على تاريخ الإصدار issuedAt وليس تاريخ إدخال التذكرة للنظام.</p>
                <p>يتم تجميع البيانات شهريًا من أقدم تذكرة حتى أحدث تذكرة.</p>
                <p>الجدول الزمني التراكمي للمشروع يعرض النمو التراكمي الشهري للمشروع المحدد أو كل المشاريع.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}