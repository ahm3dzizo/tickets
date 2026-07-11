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
  { key: 'projectAbbr',     label: 'المقاول',         group: 'classification', groupLabel: 'التصنيف' },
  { key: 'refNumber',       label: 'رقم التذكرة',     group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'villaNumber',     label: 'رقم الفيلا',      group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'clientName',      label: 'اسم العميل',      group: 'client',         groupLabel: 'العميل' },
  { key: 'issuedAt',        label: 'تاريخ الإنشاء',   group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'description',     label: 'وصف المشكلة',     group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'clientPhone',     label: 'رقم الهاتف',      group: 'client',         groupLabel: 'العميل' },
  
  // Optional columns
  { key: 'ticketId',        label: 'المعرف الداخلي',  group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'status',          label: 'الحالة',          group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'priority',        label: 'الأولوية',        group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'daysOpen',        label: 'عدد الأيام',      group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'blockNumber',     label: 'البلوك',          group: 'client',         groupLabel: 'العميل' },
  { key: 'closedAt',        label: 'تاريخ الإغلاق',   group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'appointmentTime', label: 'موعد الصيانة',    group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'type',            label: 'التخصص',          group: 'classification', groupLabel: 'التصنيف' },
  { key: 'detectedTypes',   label: 'جميع التخصصات',  group: 'classification', groupLabel: 'التصنيف' },
  { key: 'supervisors',     label: 'المشرفون',        group: 'classification', groupLabel: 'التصنيف' },
  { key: 'projectName',     label: 'المشروع',         group: 'classification', groupLabel: 'التصنيف' },
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
    keys:  ['projectAbbr', 'refNumber', 'villaNumber', 'clientName', 'issuedAt'],
  },
  standard: {
    label: 'أساسي',
    keys:  ['projectAbbr', 'refNumber', 'villaNumber', 'clientName', 'issuedAt', 'description', 'clientPhone'],
  },
  extended: {
    label: 'موسع',
    keys:  ['projectAbbr', 'refNumber', 'villaNumber', 'clientName', 'issuedAt', 'description', 'clientPhone', 'status', 'priority', 'daysOpen', 'type', 'supervisors'],
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
      case 'description': return (ticket.description || '').replace(/(https?:\/\/[^\s]+)/g, '').trim();
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

  // ── XLSX via ExcelJS (real .xlsx, RTL, formatted) ──────────────────────────
  const exportXLSX = async (headers: string[], rows: string[][], fileName: string) => {
    // Use exceljs for formatting
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'نظام إدارة الصيانة';
    const sheet = workbook.addWorksheet('تذاكر', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
    });

    // Add Header Row
    const headerRow = sheet.addRow(headers);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Tailwind blue-800
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // Add Data Rows
    rows.forEach((rowData) => {
      const row = sheet.addRow(rowData);
      row.eachCell((cell) => {
        // Enforce Arial font and size 11 for all data cells. Use text format '@' to prevent Hindi numerals
        cell.font = { name: 'Arial', size: 11 };
        cell.numFmt = '@'; 
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFEEEEEE' } }, 
          left: { style: 'thin', color: { argb: 'FFEEEEEE' } }, 
          bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } }, 
          right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
        };
      });
    });

    // Auto Column Width
    sheet.columns.forEach((col, index) => {
      let maxLen = headers[index].length;
      rows.forEach(r => {
        const len = (r[index] || '').length;
        if (len > maxLen) maxLen = len;
      });
      // Cap at 45 characters width
      col.width = Math.min(Math.max(maxLen + 5, 15), 45);
    });

    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
  font-family: Arial, Tahoma, sans-serif;
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
  font-family: Arial, sans-serif;
  font-size: 13px;
  font-weight: bold;
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
  font-size: 11px;
  font-weight: bold;
  opacity: 0.70;
  margin-bottom: 6px;
}

.header h1 {
  font-family: Arial, sans-serif;
  font-size: 28px;
  font-weight: bold;
  line-height: 1.2;
}

.meta {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 5px;
  font-weight: bold;
}

.stats { display: flex; gap: 10px; flex-shrink: 0; }

.stat {
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 12px 18px;
  text-align: center;
}

.stat .num { display: block; font-size: 28px; font-weight: bold; line-height: 1; }
.stat .lbl { display: block; font-size: 11px; font-weight: bold; opacity: 0.80; margin-top: 4px; }

/* Table */
.table-wrap { padding: 20px 20px 0; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
  border: 1px solid #e2e8f0;
}

thead { background: #1e3a5f; }

th {
  color: white;
  font-family: Arial, sans-serif;
  font-size: 13px;
  font-weight: bold;
  padding: 12px 14px;
  text-align: center;
  border-left: 1px solid rgba(255,255,255,0.10);
  border-bottom: 2px solid #0f2544;
}
th:last-child { border-left: none; }

td {
  padding: 10px 14px;
  text-align: right;
  color: #334155;
  font-family: Arial, sans-serif;
  font-size: 12px;
  font-weight: bold;
  border-bottom: 1px solid #e2e8f0;
  border-left: 1px solid #e2e8f0;
  vertical-align: middle;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
td:last-child { border-left: none; }

tr:nth-child(even) td { background: #f8fafc; }
tr:nth-child(odd) td { background: #ffffff; }
tbody tr:last-child td { border-bottom: 2px solid #1e3a5f; }

/* Footer */
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px 18px;
  font-size: 12px;
  color: #64748b;
  font-weight: 700;
  margin-top: 10px;
}
.footer-line { flex: 1; height: 1px; background: #e2e8f0; margin: 0 16px; }
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
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Download className="w-5 h-5 text-primary shrink-0" />
            تصدير التذاكر
            <span className="text-sm font-normal text-muted-foreground">({tickets.length})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Format selector ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExportFormat('xlsx')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-3 transition-all text-center',
                exportFormat === 'xlsx'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
              )}
            >
              <FileSpreadsheet className="w-5 h-5" />
              <div>
                <div className="font-semibold text-sm">Excel</div>
                <div className="text-[10px] opacity-70 mt-0.5">ملف .xlsx مع RTL</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExportFormat('pdf')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-3 transition-all text-center',
                exportFormat === 'pdf'
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
              )}
            >
              <Printer className="w-5 h-5" />
              <div>
                <div className="font-semibold text-sm">PDF / طباعة</div>
                <div className="text-[10px] opacity-70 mt-0.5">عبر نافذة الطباعة</div>
              </div>
            </button>
          </div>

          {/* ── Quick presets ────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 text-right">قوالب سريعة</p>
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
                      'flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      active
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground text-right">الأعمدة</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedColumns(new Set(ALL_COLUMNS.map(c => c.key)))}
                  className="text-xs text-primary hover:opacity-80 transition-opacity"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColumns(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                  <div key={group} className="bg-muted/20 border border-border rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center justify-between mb-2 group"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {allSel
                          ? <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <Square     className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-foreground/80 group-hover:text-foreground transition-colors flex items-center gap-1.5">
                          {GROUP_ICONS[group]}
                          {groupLabel}
                        </span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors',
                        count > 0
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {count}/{cols.length}
                      </span>
                    </button>

                    <div className="flex flex-wrap gap-1.5 pr-5">
                      {cols.map(col => (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => toggleColumn(col.key)}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                            selectedColumns.has(col.key)
                              ? 'bg-primary/10 border-primary/40 text-primary'
                              : 'bg-background border-border text-muted-foreground hover:text-foreground'
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
          <div className="flex items-center justify-between bg-muted/20 border border-border rounded-lg px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">
              <span className="text-foreground font-semibold">{selectedColumns.size}</span>
              {' '}عمود مختار من {ALL_COLUMNS.length}
            </span>
            <span className="text-muted-foreground">
              <span className="text-foreground font-semibold">{tickets.length}</span>
              {' '}تذكرة للتصدير
            </span>
          </div>

        </div>

        {/* ── Footer buttons ────────────────────────────────────────────── */}
        <DialogFooter className="gap-2 pt-3 border-t border-border">
          <Button
            onClick={handleExport}
            disabled={exporting || selectedColumns.size === 0}
            className={cn(
              'flex-1 gap-2 font-semibold text-white',
              exportFormat === 'xlsx'
                ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800'
                : 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800'
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
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
