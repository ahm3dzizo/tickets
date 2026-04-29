import { Ticket, Project, TicketType } from '@/types';

export type ReportPoint = {
  label: string;
  value: number;
};

export type TimelinePoint = {
  date: string;
  total: number;
};

export type DashboardReportFilters = {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
};

function getTicketReferenceDate(ticket: Ticket): Date | null {
  const raw =
    (ticket as any).issuedAt ||
    (ticket as any).issued_at ||
    (ticket as any).createdAt ||
    (ticket as any).created_at ||
    null;

  if (!raw) return null;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  return d;
}

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);

  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
  });
}

export function filterTicketsForReports(
  tickets: Ticket[],
  filters: DashboardReportFilters
): Ticket[] {
  return tickets.filter((t) => {
    const s = (filters.search || '').trim().toLowerCase();

    const matchSearch =
      !s ||
      t.villaNumber?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      t.clientName?.toLowerCase().includes(s) ||
      t.ticketId?.toLowerCase().includes(s) ||
      t.refNumber?.toLowerCase().includes(s);

    const matchStatus = !filters.status || t.status === filters.status;

    const matchType =
      !filters.type ||
      t.type === filters.type ||
      (t.detectedTypes as string[] | undefined)?.includes(filters.type as TicketType);

    const matchPriority =
      !filters.priority || String(t.priority ?? '') === filters.priority;

    const matchProject =
      !filters.projectId || t.projectId === filters.projectId;

    const ticketDate = getTicketReferenceDate(t);

    const matchDateFrom =
      !filters.dateFrom ||
      !ticketDate ||
      ticketDate >= new Date(filters.dateFrom);

    const matchDateTo =
      !filters.dateTo ||
      !ticketDate ||
      ticketDate <= new Date(`${filters.dateTo}T23:59:59`);

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
}

export function groupByStatus(tickets: Ticket[]): ReportPoint[] {
  const map = new Map<string, number>();

  tickets.forEach((t) => {
    const key = t.status || 'unknown';
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries()).map(([label, value]) => ({
    label,
    value,
  }));
}

export function groupByType(tickets: Ticket[]): ReportPoint[] {
  const map = new Map<string, number>();

  tickets.forEach((t) => {
    const key = t.type || 'unknown';
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries()).map(([label, value]) => ({
    label,
    value,
  }));
}

export function groupByPriority(tickets: Ticket[]): ReportPoint[] {
  const map = new Map<string, number>();

  tickets.forEach((t) => {
    const key = String(t.priority ?? 'غير محدد');
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([label, value]) => ({
      label,
      value,
    }));
}

export function groupByProject(
  tickets: Ticket[],
  projects: Project[]
): ReportPoint[] {
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const map = new Map<string, number>();

  tickets.forEach((t) => {
    const key = projectMap[t.projectId] || 'غير مرتبط بمشروع';
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries()).map(([label, value]) => ({
    label,
    value,
  }));
}

export function groupByDate(tickets: Ticket[]): ReportPoint[] {
  const map = new Map<string, number>();

  tickets.forEach((t) => {
    const date = getTicketReferenceDate(t);
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
}

function normalizeSpecialty(
  value?: string
): 'MECHANICS' | 'ELECTRICITY' | 'GENERAL' | null {
  if (!value) return null;

  const v = value.toLowerCase();

  if (
    v === 'MECHANICS' ||
    v === 'plumbing' ||
    v === 'tank_insulation'
  ) {
    return 'MECHANICS';
  }

  if (v === 'ELECTRICITY') {
    return 'ELECTRICITY';
  }

  if (
    v === 'GENERAL' ||
    v === 'doors' ||
    v === 'paints' ||
    v === 'cracks' ||
    v === 'ceramics'
  ) {
    return 'GENERAL';
  }

  return null;
}

export function groupMaintenanceGENERALTypes(
  tickets: Ticket[]
): ReportPoint[] {
  const counts = {
    MECHANICS: 0,
    ELECTRICITY: 0,
    GENERAL: 0,
  };

  tickets.forEach((ticket) => {
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
    if (fallback) {
      counts[fallback] += 1;
    }
  });

  return [
    { label: 'ميكانيكا', value: counts.MECHANICS },
    { label: 'كهرباء', value: counts.ELECTRICITY },
    { label: 'عام', value: counts.GENERAL },
  ];
}

export function buildProjectCumulativeTimeline(
  tickets: Ticket[],
  projectId?: string
): TimelinePoint[] {
  const filtered = projectId
    ? tickets.filter((t) => t.projectId === projectId)
    : tickets;

  const monthMap = new Map<string, number>();

  filtered.forEach((ticket) => {
    const date = getTicketReferenceDate(ticket);
    if (!date) return;

    const monthKey = getMonthKey(date);
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
  });

  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  let runningTotal = 0;

  return sortedMonths.map(([monthKey, count]) => {
    runningTotal += count;
    return {
      date: getMonthLabel(monthKey),
      total: runningTotal,
    };
  });
}

export function buildDetailedReportRows(
  tickets: Ticket[],
  projects: Project[]
) {
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  return tickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketId || t.refNumber || t.id,
    clientName: t.clientName || '-',
    villaNumber: t.villaNumber || '-',
    project: projectMap[t.projectId] || '-',
    type: t.type || '-',
    status: t.status || '-',
    priority: t.priority ?? '-',
    issuedAt:
      (t as any).issuedAt ||
      (t as any).issued_at ||
      '-',
    createdAt:
      (t as any).createdAt ||
      (t as any).created_at ||
      '-',
    description: t.description || '-',
  }));
}

export function exportRowsToCsv(
  fileName: string,
  rows: Record<string, any>[]
) {
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

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printElementById(
  elementId: string,
  title = 'Report'
) {
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
          .report-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 20px;
          }
          .report-card {
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 12px;
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