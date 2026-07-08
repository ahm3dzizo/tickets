import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ticket } from '@/types';
import { statusTranslations } from './TicketTable';
import { format, differenceInDays } from 'date-fns';
import { parseIssuedAt } from './TicketTable';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Download,
  FileSpreadsheet,
  Printer,
  CheckSquare,
  Square,
  Layers,
  Users,
  CalendarDays,
  Tags,
} from 'lucide-react';

// ─── Column Definitions ───────────────────────────────────────────────────────
interface ColumnDef {
  key: string;
  label: string;
  group: 'ticket' | 'client' | 'dates' | 'classification';
  groupLabel: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'ticketId',        label: 'رقم التذكرة',    group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'refNumber',       label: 'المرجع',          group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'description',     label: 'وصف المشكلة',     group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'villaNumber',     label: 'رقم الفيلا',      group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'status',          label: 'الحالة',          group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'priority',        label: 'الأولوية',        group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'daysOpen',        label: 'عدد الأيام',      group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'clientName',      label: 'اسم العميل',      group: 'client',         groupLabel: 'العميل' },
  { key: 'clientPhone',     label: 'رقم الهاتف',      group: 'client',         groupLabel: 'العميل' },
  { key: 'blockNumber',     label: 'البلوك',          group: 'client',         groupLabel: 'العميل' },
  { key: 'issuedAt',        label: 'تاريخ الإنشاء',   group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'closedAt',        label: 'تاريخ الإغلاق',   group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'appointmentTime', label: 'موعد الصيانة',    group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'type',            label: 'التخصص',          group: 'classification', groupLabel: 'التصنيف' },
  { key: 'detectedTypes',   label: 'جميع التخصصات',  group: 'classification', groupLabel: 'التصنيف' },
  { key: 'supervisors',     label: 'المشرفون',        group: 'classification', groupLabel: 'التصنيف' },
  { key: 'projectName',     label: 'المشروع',         group: 'classification', groupLabel: 'التصنيف' },
  { key: 'projectAbbr',     label: 'اختصار المشروع',  group: 'classification', groupLabel: 'التصنيف' },
];

const GROUPS = Array.from(
  new Map(ALL_COLUMNS.map(c => [c.group, c.groupLabel])).entries()
);

const GROUP_ICONS: Record<string, React.ReactNode> = {
  ticket:         <Layers       className="w-3 h-3" />,
  client:         <Users        className="w-3 h-3" />,
  dates:          <CalendarDays className="w-3 h-3" />,
  classification: <Tags         className="w-3 h-3" />,
};

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS: Record<string, { label: string; keys: string[] }> = {
  minimal:  {
    label: 'مختصر',
    keys:  ['ticketId', 'refNumber', 'villaNumber', 'status', 'clientName', 'issuedAt'],
  },
  standard: {
    label: 'أساسي',
    keys:  ['ticketId', 'refNumber', 'description', 'villaNumber', 'status', 'clientName', 'issuedAt', 'type'],
  },
  extended: {
    label: 'موسع',
    keys:  ['ticketId', 'refNumber', 'description', 'villaNumber', 'status', 'priority', 'daysOpen',
            'clientName', 'clientPhone', 'issuedAt', 'closedAt', 'type', 'supervisors'],
  },
  full: {
    label: 'كامل',
    keys:  ALL_COLUMNS.map(c => c.key),
  },
};

// ─── Type Labels ──────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  electricity:    'كهرباء',
  plumbing:       'سباكة',
  doors:          'أبواب',
  paints:         'دهانات',
  cracks:         'تشققات',
  ceramics:       'سيراميك',
  tank_insulation:'عزل خزان',
  drainage:       'صرف صحي',
  ac_ventilation: 'تكييف وتهوية',
  pumps:          'مضخات',
  doors_windows:  'أبواب ونوافذ',
  waterproofing:  'عزل مائي',
  grading:        'ميول وترويبة',
  pest_control:   'مكافحة حشرات',
  cleaning:       'تنظيف',
  structural:     'إنشائي',
  painting:       'دهانات',
  tiles:          'سيراميك',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface ExportTicketsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
  projects?: Record<string, { name: string; abbreviation?: string }>;
  clients?: Record<string, { name: string; phone?: string; blockNumber?: string }>;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ExportTicketsModal({
  open,
  onOpenChange,
  tickets,
  projects,
  clients,
}: ExportTicketsModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(PRESETS.standard.keys)
  );
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [exporting, setExporting] = useState(false);

  // ── Toggles ─────────────────────────────────────────────────────────────────
  const toggleColumn = (key: string) => {
    const next = new Set(selectedColumns);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedColumns(next);
  };

  const toggleGroup = (group: string) => {
    const keys   = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
    const allSel = keys.every(k => selectedColumns.has(k));
    const next   = new Set(selectedColumns);
    for (const k of keys) allSel ? next.delete(k) : next.add(k);
    setSelectedColumns(next);
  };

  const isGroupAllSelected = (group: string) =>
    ALL_COLUMNS.filter(c => c.group === group).every(c => selectedColumns.has(c.key));

  const groupCount = (group: string) =>
    ALL_COLUMNS.filter(c => c.group === group && selectedColumns.has(c.key)).length;

  // ── Cell value ───────────────────────────────────────────────────────────────
  const getCellValue = (ticket: Ticket, colKey: string): string => {
    switch (colKey) {
      case 'ticketId':    return ticket.ticketId  || '---';
      case 'refNumber':   return ticket.refNumber || '---';
      case 'description': return ticket.description || '';
      case 'villaNumber': return ticket.villaNumber  || '';
      case 'status':      return statusTranslations[ticket.status] || ticket.status || '---';
      case 'priority': {
        const p = typeof ticket.priority === 'number' ? ticket.priority : 3;
        return ({ 9:'عاجلة جداً', 7:'عالية', 6:'متوسطة', 4:'عادية', 3:'منخفضة' } as Record<number, string>)[p] || String(p);
      }
      case 'daysOpen': {
        const createdAt = (ticket.createdAt as any)?.toDate?.() ?? new Date(ticket.createdAt as any);
        const openDate  = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
        const closeDate = ticket.closedAt ? new Date(ticket.closedAt) : null;
        const isClosed  = ticket.status === 'closed' || ticket.status === 'out-of-scope';
        return String(differenceInDays((isClosed && closeDate) ? closeDate : new Date(), openDate));
      }
      case 'clientName':  return ticket.clientName || '';
      case 'clientPhone': return clients?.[(ticket as any).clientId ?? '']?.phone      || '';
      case 'blockNumber': return clients?.[(ticket as any).clientId ?? '']?.blockNumber || '';
      case 'issuedAt': {
        if (!ticket.issuedAt) return format(new Date(ticket.createdAt as any), 'd/M/yyyy');
        const d = parseIssuedAt(ticket.issuedAt);
        return d ? format(d, 'd/M/yyyy') : ticket.issuedAt;
      }
      case 'closedAt':
        return ticket.closedAt ? format(new Date(ticket.closedAt), 'd/M/yyyy') : '';
      case 'appointmentTime':
        return ticket.appointmentTime || '';
      case 'type':
        return TYPE_LABELS[ticket.type] || ticket.type || '---';
      case 'detectedTypes': {
        const types: string[] = (ticket as any).detectedTypes || [];
        return types.map(t => TYPE_LABELS[t] || t).join('، ') || '---';
      }
      case 'supervisors': {
        const sups = (ticket as any).assignedSupervisors;
        if (Array.isArray(sups)) return sups.map((s: any) => s?.name).filter(Boolean).join('، ');
        return ticket.assigneeName || '---';
      }
      case 'projectName':
        return projects?.[(ticket as any).projectId ?? '']?.name || '---';
      case 'projectAbbr':
        return projects?.[(ticket as any).projectId ?? '']?.abbreviation
          || (ticket as any).projectAbbr || '---';
      default: return '';
    }
  };

  // ── XLSX via SheetJS (real .xlsx, RTL) ───────────────────────────────────────
  const exportXLSX = async (headers: string[], rows: string[][], fileName: string) => {
    // Dynamic import keeps the bundle lean
    const XLSX = await import('xlsx');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // RTL sheet direction + freeze first row
    ws['!views'] = [{
      rightToLeft: true,
      state:       'frozen',
      ySplit:      1,
      xSplit:      0,
      topLeftCell: 'A2',
    }];

    // Auto column widths (Arabic chars are ~2× wide visually)
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.min(
        Math.max(h.length * 2, ...rows.map(r => (r[i] || '').length), 12),
        55
      ),
    }));

    XLSX.utils.book_append_sheet(wb, ws, 'تذاكر');

    const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: fileName }).click();
    URL.revokeObjectURL(url);
  };

  // ── PDF via browser print (correct Arabic rendering, no canvas) ──────────────
  const exportPDF = (headers: string[], rows: string[][], ticketCount: number): boolean => {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const headerCells = headers.map(h => `<th>${esc(h)}</th>`).join('');
    const bodyRows    = rows
      .map((r, i) =>
        `<tr class="${i % 2 ? 'alt' : ''}">${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`
      )
      .join('');

    const dateStr = format(new Date(), 'd/M/yyyy');
    const timeStr = format(new Date(), 'h:mm a');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<title>تقرير التذاكر — ${dateStr}</title>
<style>
@media print {
  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4 landscape; margin: 8mm 10mm; }
  .no-print { display: none !important; }
  .page { box-shadow: none !important; border-radius: 0 !important; }
  body { background: white !important; padding: 0 !important; }
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
  direction: rtl;
  text-align: right;
  background: #f1f5f9;
  color: #1e293b;
  padding: 20px;
  font-size: 12px;
}

/* Print hint banner */
.no-print {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 11px 20px;
  background: linear-gradient(135deg, #0f2544, #1e40af);
  color: white;
  font-family: 'Cairo', sans-serif;
  font-size: 13px;
  font-weight: 700;
  border-radius: 10px;
  margin-bottom: 16px;
}

kbd {
  background: rgba(255,255,255,0.18);
  padding: 2px 8px;
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
  border: 1px solid rgba(255,255,255,0.25);
}

.page {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 6px 32px rgba(0,0,0,0.10);
}

/* Header */
.header {
  background: linear-gradient(135deg, #0f2544 0%, #1e40af 100%);
  padding: 24px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  gap: 20px;
}

.eyebrow {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  opacity: 0.50;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.header h1 {
  font-family: 'Cairo', sans-serif;
  font-size: 28px;
  font-weight: 900;
  line-height: 1.1;
}

.meta {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 5px;
  font-weight: 400;
}

.stats { display: flex; gap: 10px; flex-shrink: 0; }

.stat {
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 12px 18px;
  text-align: center;
}

.stat .num { display: block; font-size: 28px; font-weight: 900; line-height: 1; }
.stat .lbl { display: block; font-size: 10px; font-weight: 500; opacity: 0.60; margin-top: 4px; }

/* Table */
.table-wrap { padding: 20px 20px 0; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

thead { background: #1e3a5f; }

th {
  color: white;
  font-family: 'Cairo', sans-serif;
  font-size: 11px;
  font-weight: 700;
  padding: 10px 14px;
  text-align: center;
  white-space: nowrap;
  border-left: 1px solid rgba(255,255,255,0.10);
}
th:last-child { border-left: none; }

td {
  padding: 8px 14px;
  text-align: right;
  color: #334155;
  font-family: 'Cairo', sans-serif;
  font-size: 11px;
  font-weight: 500;
  border-bottom: 1px solid #f1f5f9;
  border-left: 1px solid #f1f5f9;
  vertical-align: top;
  word-break: break-word;
}
td:last-child { border-left: none; }

tr.alt td { background: #f8fafc; }
tbody tr:last-child td { border-bottom: none; }

/* Footer */
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px 18px;
  font-size: 10px;
  color: #94a3b8;
  font-weight: 600;
  margin-top: 4px;
}
.footer-line { flex: 1; height: 1px; background: #f1f5f9; margin: 0 16px; }
</style>
</head>
<body>

<div class="no-print">
  🖨️ &nbsp;اضغط <kbd>Ctrl + P</kbd> أو <kbd>⌘ P</kbd> &nbsp;ثم اختر «حفظ كـ PDF»
</div>

<div class="page">
  <div class="header">
    <div>
      <div class="eyebrow">نظام إدارة الصيانة</div>
      <h1>تقرير التذاكر</h1>
      <div class="meta">تاريخ الإصدار: ${dateStr} &nbsp;—&nbsp; ${timeStr}</div>
    </div>
    <div class="stats">
      <div class="stat">
        <span class="num">${ticketCount}</span>
        <span class="lbl">تذكرة</span>
      </div>
      <div class="stat">
        <span class="num">${headers.length}</span>
        <span class="lbl">عمود</span>
      </div>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>نظام إدارة تذاكر الصيانة</span>
    <div class="footer-line"></div>
    <span>${dateStr}</span>
  </div>
</div>

<script>
  /* Auto-trigger print after Cairo font loads */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function() {
      setTimeout(function() { window.print(); }, 600);
    });
  } else {
    setTimeout(function() { window.print(); }, 1400);
  }
</script>

</body>
</html>`;

    const win = window.open('', '_blank', 'width=1300,height=900');
    if (!win) {
      toast.error('يرجى السماح بالنوافذ المنبثقة في إعدادات المتصفح');
      return false;
    }
    win.document.write(html);
    win.document.close();
    return true;
  };

  // ── Export handler ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (selectedColumns.size === 0) { toast.error('اختر عموداً واحداً على الأقل'); return; }
    if (tickets.length === 0)       { toast.error('لا توجد تذاكر للتصدير');        return; }

    setExporting(true);
    try {
      const columns = ALL_COLUMNS.filter(c => selectedColumns.has(c.key));
      const headers = columns.map(c => c.label);
      const rows    = tickets.map(t => columns.map(c => getCellValue(t, c.key)));
      const now     = format(new Date(), 'yyyy-MM-dd_HHmm');
      const count   = tickets.length;

      if (exportFormat === 'xlsx') {
        await exportXLSX(headers, rows, `تذاكر_${count}_${now}.xlsx`);
        toast.success(`تم تصدير ${count} تذكرة إلى Excel ✓`);
        onOpenChange(false);
      } else {
        const ok = exportPDF(headers, rows, count);
        if (ok) {
          toast.success('فُتحت نافذة الطباعة — اختر «حفظ كـ PDF»');
          onOpenChange(false);
        }
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('فشل التصدير، يرجى المحاولة مجدداً');
    } finally {
      setExporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0c1220] border border-white/10 text-slate-200 sm:max-w-[620px] rounded-3xl max-h-[90vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400 shrink-0" />
            تصدير التذاكر
            <span className="text-sm font-normal text-slate-500">({tickets.length})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Format selector ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Excel */}
            <button
              type="button"
              onClick={() => setExportFormat('xlsx')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all text-left',
                exportFormat === 'xlsx'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/8 bg-white/[0.03] text-slate-500 hover:border-white/20 hover:text-slate-300'
              )}
            >
              <FileSpreadsheet className="w-6 h-6" />
              <div className="text-center">
                <div className="font-bold text-sm">Excel</div>
                <div className="text-[10px] opacity-60 mt-0.5">ملف .xlsx حقيقي مع RTL</div>
              </div>
            </button>

            {/* PDF */}
            <button
              type="button"
              onClick={() => setExportFormat('pdf')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all text-left',
                exportFormat === 'pdf'
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                  : 'border-white/8 bg-white/[0.03] text-slate-500 hover:border-white/20 hover:text-slate-300'
              )}
            >
              <Printer className="w-6 h-6" />
              <div className="text-center">
                <div className="font-bold text-sm">PDF / طباعة</div>
                <div className="text-[10px] opacity-60 mt-0.5">عبر نافذة الطباعة</div>
              </div>
            </button>
          </div>

          {/* ── Quick presets ────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 text-right">
              قوالب سريعة
            </p>
            <div className="flex gap-2">
              {Object.entries(PRESETS).map(([key, preset]) => {
                const active =
                  preset.keys.length === selectedColumns.size &&
                  preset.keys.every(k => selectedColumns.has(k));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedColumns(new Set(preset.keys))}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                      active
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-white/[0.03] border-white/8 text-slate-600 hover:border-white/20 hover:text-slate-300'
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Column groups ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-right">
                الأعمدة
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedColumns(new Set(ALL_COLUMNS.map(c => c.key)))}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColumns(new Set())}
                  className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                >
                  مسح الكل
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {GROUPS.map(([group, groupLabel]) => {
                const cols   = ALL_COLUMNS.filter(c => c.group === group);
                const count  = groupCount(group);
                const allSel = isGroupAllSelected(group);

                return (
                  <div key={group} className="bg-white/[0.025] border border-white/5 rounded-xl p-3">
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center justify-between mb-2.5 group"
                    >
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        {allSel
                          ? <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          : <Square     className="w-3.5 h-3.5 text-slate-700 shrink-0" />}
                        <span className="text-slate-500 group-hover:text-slate-400 transition-colors flex items-center gap-1.5">
                          {GROUP_ICONS[group]}
                          {groupLabel}
                        </span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors',
                        count > 0
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-white/5 text-slate-700'
                      )}>
                        {count}/{cols.length}
                      </span>
                    </button>

                    {/* Column chips */}
                    <div className="flex flex-wrap gap-1.5 pr-5">
                      {cols.map(col => (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => toggleColumn(col.key)}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                            selectedColumns.has(col.key)
                              ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                              : 'bg-white/[0.03] border-white/8 text-slate-600 hover:border-white/20 hover:text-slate-400'
                          )}
                        >
                          {col.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Summary bar ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
            <span className="text-xs text-slate-500">
              <span className="text-slate-200 font-bold">{selectedColumns.size}</span>
              {' '}عمود مختار من {ALL_COLUMNS.length}
            </span>
            <span className="text-xs text-slate-500">
              <span className="text-slate-200 font-bold">{tickets.length}</span>
              {' '}تذكرة للتصدير
            </span>
          </div>

        </div>

        {/* ── Footer buttons ────────────────────────────────────────────── */}
        <DialogFooter className="gap-3 pt-4 border-t border-white/5">
          <Button
            onClick={handleExport}
            disabled={exporting || selectedColumns.size === 0}
            className={cn(
              'flex-1 h-12 rounded-2xl font-bold text-white shadow-lg gap-2 transition-all',
              exportFormat === 'xlsx'
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40 disabled:bg-emerald-900'
                : 'bg-blue-600   hover:bg-blue-500   shadow-blue-900/40   disabled:bg-blue-900'
            )}
          >
            {exporting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : exportFormat === 'xlsx' ? (
              <FileSpreadsheet className="w-4 h-4" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            {exporting
              ? 'جارٍ التصدير...'
              : exportFormat === 'xlsx'
                ? `تصدير Excel — ${tickets.length} تذكرة`
                : `طباعة / PDF — ${tickets.length} تذكرة`
            }
          </Button>

          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-12 rounded-2xl text-slate-600 hover:text-white hover:bg-white/5"
          >
            إلغاء
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
