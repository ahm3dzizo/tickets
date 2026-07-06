import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Ticket, TicketType } from '@/types';
import { statusTranslations } from './TicketTable';
import { format, differenceInDays } from 'date-fns';
import { parseIssuedAt } from './TicketTable';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Download, FileSpreadsheet, FileText, CheckSquare, Square } from 'lucide-react';

// ─── Column definitions ──────────────────────────────────────────────────────
interface ColumnDef {
  key: string;
  label: string;
  group: 'ticket' | 'client' | 'dates' | 'classification';
  groupLabel: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'ticketId',        label: 'رقم التذكرة',      group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'refNumber',       label: 'المرجع',            group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'description',     label: 'وصف المشكلة',       group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'villaNumber',     label: 'رقم الفيلا',        group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'status',          label: 'الحالة',            group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'priority',        label: 'الأولوية',          group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'daysOpen',        label: 'عدد الأيام',        group: 'ticket',         groupLabel: 'معلومات التذكرة' },
  { key: 'clientName',      label: 'اسم العميل',        group: 'client',         groupLabel: 'العميل' },
  { key: 'clientPhone',     label: 'رقم الهاتف',        group: 'client',         groupLabel: 'العميل' },
  { key: 'blockNumber',     label: 'البلوك',            group: 'client',         groupLabel: 'العميل' },
  { key: 'issuedAt',        label: 'تاريخ الإنشاء',     group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'closedAt',        label: 'تاريخ الإغلاق',     group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'appointmentTime', label: 'موعد الصيانة',      group: 'dates',          groupLabel: 'التواريخ' },
  { key: 'type',            label: 'التخصص',            group: 'classification', groupLabel: 'التصنيف' },
  { key: 'detectedTypes',   label: 'جميع التخصصات',    group: 'classification', groupLabel: 'التصنيف' },
  { key: 'supervisors',     label: 'المشرفون',          group: 'classification', groupLabel: 'التصنيف' },
  { key: 'projectName',     label: 'المشروع',           group: 'classification', groupLabel: 'التصنيف' },
  { key: 'projectAbbr',     label: 'اختصار المشروع',    group: 'classification', groupLabel: 'التصنيف' },
];

const GROUPS = Array.from(new Map(ALL_COLUMNS.map(c => [c.group, c.groupLabel])).entries());

interface ExportTicketsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
  projects?: Record<string, { name: string; abbreviation?: string }>;
  clients?: Record<string, { name: string; phone?: string; blockNumber?: string }>;
}

export function ExportTicketsModal({
  open,
  onOpenChange,
  tickets,
  projects,
  clients,
}: ExportTicketsModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(['ticketId', 'refNumber', 'description', 'villaNumber', 'status', 'clientName', 'issuedAt', 'type'])
  );
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [exporting, setExporting] = useState(false);

  const toggleColumn = (key: string) => {
    const next = new Set(selectedColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedColumns(next);
  };

  const toggleGroup = (group: string) => {
    const groupKeys = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
    const allSelected = groupKeys.every(k => selectedColumns.has(k));
    const next = new Set(selectedColumns);
    for (const k of groupKeys) {
      if (allSelected) next.delete(k);
      else next.add(k);
    }
    setSelectedColumns(next);
  };

  // ── Helper: extract value from a ticket for a column ─────────────────────
  const getCellValue = (ticket: Ticket, colKey: string): string => {
    switch (colKey) {
      case 'ticketId':
        return ticket.ticketId || '---';
      case 'refNumber':
        return ticket.refNumber || '---';
      case 'description':
        return ticket.description || '';
      case 'villaNumber':
        return ticket.villaNumber || '';
      case 'status':
        return statusTranslations[ticket.status] || ticket.status || '---';
      case 'priority': {
        const p = typeof ticket.priority === 'number' ? ticket.priority : 3;
        const labels: Record<number, string> = { 9: 'عاجلة جداً', 7: 'عالية', 6: 'متوسطة', 4: 'عادية', 3: 'منخفضة' };
        return labels[p] || String(p);
      }
      case 'daysOpen': {
        const createdAt = (ticket.createdAt as any)?.toDate
          ? (ticket.createdAt as any).toDate()
          : new Date(ticket.createdAt as any);
        const openDate = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
        const closeDate = ticket.closedAt ? new Date(ticket.closedAt) : null;
        const isClosed = ticket.status === 'closed' || ticket.status === 'out-of-scope';
        const endDate = (isClosed && closeDate) ? closeDate : new Date();
        return String(differenceInDays(endDate, openDate));
      }
      case 'clientName':
        return ticket.clientName || '';
      case 'clientPhone': {
        if (clients && ticket.clientId && clients[ticket.clientId]?.phone)
          return clients[ticket.clientId].phone!;
        return '';
      }
      case 'blockNumber': {
        if (clients && ticket.clientId && clients[ticket.clientId]?.blockNumber)
          return clients[ticket.clientId].blockNumber!;
        return '';
      }
      case 'issuedAt': {
        if (!ticket.issuedAt) return format(new Date(ticket.createdAt as any), 'd/M/yyyy');
        const d = parseIssuedAt(ticket.issuedAt);
        return d ? format(d, 'd/M/yyyy') : ticket.issuedAt;
      }
      case 'closedAt':
        return ticket.closedAt ? format(new Date(ticket.closedAt), 'd/M/yyyy') : '';
      case 'appointmentTime':
        return ticket.appointmentTime || '';
      case 'type': {
        const typeTranslations: Record<string, string> = {
          electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب',
          paints: 'دهانات', cracks: 'تشققات', ceramics: 'سيراميك',
          tank_insulation: 'عزل خزان', drainage: 'صرف صحي',
          ac_ventilation: 'تكييف وتهوية', pumps: 'مضخات',
          doors_windows: 'أبواب ونوافذ', waterproofing: 'عزل مائي',
          grading: 'ميول وترويبة', pest_control: 'مكافحة حشرات',
          cleaning: 'تنظيف', structural: 'إنشائي',
          painting: 'دهانات', tiles: 'سيراميك',
        };
        return typeTranslations[ticket.type] || ticket.type || '---';
      }
      case 'detectedTypes': {
        const types: string[] = (ticket as any).detectedTypes || [];
        const typeTranslations: Record<string, string> = {
          electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب',
          paints: 'دهانات', cracks: 'تشققات', ceramics: 'سيراميك',
          tank_insulation: 'عزل خزان', drainage: 'صرف صحي',
          ac_ventilation: 'تكييف وتهوية', pumps: 'مضخات',
          doors_windows: 'أبواب ونوافذ', waterproofing: 'عزل مائي',
          grading: 'ميول وترويبة', pest_control: 'مكافحة حشرات',
          cleaning: 'تنظيف', structural: 'إنشائي',
          painting: 'دهانات', tiles: 'سيراميك',
        };
        return types.map(t => typeTranslations[t] || t).join('، ') || '---';
      }
      case 'supervisors': {
        const rawSups = (ticket as any).assignedSupervisors;
        if (Array.isArray(rawSups)) {
          return rawSups.map((s: any) => s?.name).filter(Boolean).join('، ');
        }
        return ticket.assigneeName || '---';
      }
      case 'projectName':
        return (projects && ticket.projectId && projects[ticket.projectId]?.name) || '---';
      case 'projectAbbr':
        return (projects && ticket.projectId && projects[ticket.projectId]?.abbreviation) || ticket.projectAbbr || '---';
      default:
        return '';
    }
  };

  // ── Generate XLSX ─────────────────────────────────────────────────────────
  const generateXLSX = (headers: string[], rows: string[][]): Blob => {
    const escapeHtml = (s: string) =>
      String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const renderHeaderRow = headers
      .map((h, i) => {
        const align = i === 0 ? 'text-align:right;padding-right:12px' : 'text-align:center';
        return `<th style="background:#1e3a5f;color:white;padding:8px 10px;font-size:12px;font-weight:bold;border:1px solid #1e3a5f;${align};white-space:nowrap">${escapeHtml(h)}</th>`;
      })
      .join('');

    const bodyRows = rows
      .map((row, ri) => {
        const cells = row
          .map((cell, ci) => {
            const align = ci === 0 ? 'text-align:right;padding-right:12px' : 'text-align:center';
            return `<td style="padding:6px 8px;font-size:11px;border:1px solid #d1d5db;${align};vertical-align:middle">${escapeHtml(cell)}</td>`;
          })
          .join('');
        const bg = ri % 2 === 1 ? ' style="background:#f1f5f9"' : '';
        return `<tr${bg}>${cells}</tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>تذاكر</x:Name>
        <x:WorksheetOptions>
          <x:DisplayRightToLeft/>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  table { border-collapse: collapse; width: 100%; font-family: 'Segoe UI', Tahoma, sans-serif; }
</style>
</head>
<body style="direction:rtl;text-align:right;margin:10px">
<table>
  <thead><tr>${renderHeaderRow}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
</body></html>`;

    return new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (selectedColumns.size === 0) {
      toast.error('اختر عموداً واحداً على الأقل للتصدير');
      return;
    }
    if (tickets.length === 0) {
      toast.error('لا توجد تذاكر للتصدير');
      return;
    }

    setExporting(true);
    try {
      const columns = ALL_COLUMNS.filter(c => selectedColumns.has(c.key));
      const headers = columns.map(c => c.label);
      const rows = tickets.map(t => columns.map(c => getCellValue(t, c.key)));

      const now = format(new Date(), 'yyyy-MM-dd_HHmm');
      const ticketCount = tickets.length;

      if (exportFormat === 'xlsx') {
        const blob = generateXLSX(headers, rows);
        downloadBlob(blob, `تذاكر_${ticketCount}_${now}.xls`);
        toast.success(`تم تصدير ${ticketCount} تذكرة إلى Excel`);
      } else {
        // ── PDF ────────────────────────────────────────────────────────────
        const escapeHtml = (s: string) =>
          String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const headerCells = headers
          .map(h => `<th>${escapeHtml(h)}</th>`)
          .join('');

        const bodyRowsHtml = rows
          .map((row, ri) => {
            const cells = row
              .map(c => `<td>${escapeHtml(c)}</td>`)
              .join('');
            return `<tr class="${ri % 2 === 1 ? 'even' : ''}">${cells}</tr>`;
          })
          .join('');

        const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Cairo', sans-serif;
    font-size: 13px;
    line-height: 1.6;
    direction: rtl;
    background: #f1f5f9;
    color: #1e293b;
    padding: 36px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    background: white;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.10);
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #0f2544 0%, #1e40af 100%);
    padding: 32px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    color: white;
  }

  .header-eyebrow {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    opacity: 0.55;
    margin-bottom: 6px;
  }

  .header-title {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -0.5px;
    line-height: 1.1;
  }

  .header-meta {
    font-size: 12px;
    font-weight: 400;
    opacity: 0.6;
    margin-top: 6px;
  }

  .header-stats {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
  }

  .stat-pill {
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 14px;
    padding: 14px 22px;
    text-align: center;
  }

  .stat-pill .num {
    display: block;
    font-size: 30px;
    font-weight: 900;
    line-height: 1;
  }

  .stat-pill .lbl {
    display: block;
    font-size: 11px;
    font-weight: 500;
    opacity: 0.65;
    margin-top: 5px;
  }

  /* ── Table ── */
  .table-wrap {
    padding: 28px 28px 0;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  thead tr { background: #1e3a5f; }

  th {
    color: white;
    font-family: 'Cairo', sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 13px 16px;
    text-align: center;
    white-space: nowrap;
    border-left: 1px solid rgba(255,255,255,0.08);
  }

  th:first-child { border-left: none; }

  td {
    padding: 11px 16px;
    text-align: right;
    color: #334155;
    font-family: 'Cairo', sans-serif;
    font-size: 12px;
    font-weight: 500;
    border-bottom: 1px solid #f1f5f9;
    border-left: 1px solid #f1f5f9;
    vertical-align: middle;
  }

  td:first-child { border-left: none; }

  tr.even td { background: #f8fafc; }

  tbody tr:last-child td { border-bottom: none; }

  /* ── Footer ── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 28px 28px;
    margin-top: 8px;
  }

  .footer-text {
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.5px;
  }

  .footer-divider {
    flex: 1;
    height: 1px;
    background: linear-gradient(to left, transparent, #e2e8f0, transparent);
    margin: 0 20px;
  }

  .footer-date {
    font-size: 10px;
    font-weight: 700;
    color: #cbd5e1;
  }
</style>
</head>
<body>
  <div class="page">

    <div class="header">
      <div>
        <div class="header-eyebrow">نظام إدارة الصيانة</div>
        <h1 class="header-title">تقرير التذاكر</h1>
        <p class="header-meta">
          تاريخ الإصدار: ${format(new Date(), 'd/M/yyyy')}
          &nbsp;—&nbsp;
          ${format(new Date(), 'h:mm a')}
        </p>
      </div>
      <div class="header-stats">
        <div class="stat-pill">
          <span class="num">${ticketCount}</span>
          <span class="lbl">تذكرة</span>
        </div>
        <div class="stat-pill">
          <span class="num">${selectedColumns.size}</span>
          <span class="lbl">عمود</span>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRowsHtml}</tbody>
      </table>
    </div>

    <div class="footer">
      <span class="footer-text">نظام إدارة تذاكر الصيانة</span>
      <div class="footer-divider"></div>
      <span class="footer-date">${format(new Date(), 'd/M/yyyy')}</span>
    </div>

  </div>
</body>
</html>`;

        const html2canvasModule = await import('html2canvas');
        const html2canvasFn = html2canvasModule.default;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.style.position = 'fixed';
        tempDiv.style.top = '-99999px';
        tempDiv.style.left = '-99999px';
        tempDiv.style.width = '1400px';
        document.body.appendChild(tempDiv);

        // انتظر تحميل خط Cairo
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 600));

        const finalCanvas = await html2canvasFn(tempDiv, {
          scale: 2,
          useCORS: true,
          logging: false,
          width: 1400,
          height: tempDiv.scrollHeight,
          allowTaint: true,
        });

        document.body.removeChild(tempDiv);

        const imgData = finalCanvas.toDataURL('image/jpeg', 0.97);
        const imgWidth = 297; // A4 landscape mm
        const imgHeight = (finalCanvas.height * imgWidth) / finalCanvas.width;

        const { default: jsPDF } = await import('jspdf');
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageH = doc.internal.pageSize.getHeight();
        let heightLeft = imgHeight;
        let position = 0;

        doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageH;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          doc.addPage();
          doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageH;
        }

        const pdfBlob = doc.output('blob');
        downloadBlob(pdfBlob, `تذاكر_${ticketCount}_${now}.pdf`);
        toast.success(`تم تصدير ${ticketCount} تذكرة إلى PDF`);
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('فشل التصدير');
    } finally {
      setExporting(false);
      onOpenChange(false);
    }
  };

  const isAllGroupSelected = (group: string) => {
    const keys = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
    return keys.every(k => selectedColumns.has(k));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            تصدير التذاكر ({tickets.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Format selector */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setExportFormat('xlsx')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition-all',
                exportFormat === 'xlsx'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-white/5 text-slate-400 hover:border-slate-500'
              )}
            >
              <FileSpreadsheet className="w-5 h-5" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => setExportFormat('pdf')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition-all',
                exportFormat === 'pdf'
                  ? 'border-red-500/50 bg-red-500/10 text-red-400'
                  : 'border-border bg-white/5 text-slate-400 hover:border-slate-500'
              )}
            >
              <FileText className="w-5 h-5" />
              PDF (طباعة)
            </button>
          </div>

          {/* Column selector */}
          <div>
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest mb-3">
              اختر الأعمدة للتصدير
            </Label>
            <div className="space-y-3">
              {GROUPS.map(([group, groupLabel]) => {
                const groupCols = ALL_COLUMNS.filter(c => c.group === group);
                return (
                  <div key={group} className="bg-white/[0.03] rounded-xl p-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white mb-2 transition-colors w-full text-right"
                    >
                      {isAllGroupSelected(group)
                        ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                        : <Square className="w-3.5 h-3.5" />}
                      {groupLabel}
                    </button>
                    <div className="flex flex-wrap gap-1.5 pr-5">
                      {groupCols.map(col => (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => toggleColumn(col.key)}
                          className={cn(
                            'px-2 py-1 rounded-lg text-[10px] font-bold border transition-all',
                            selectedColumns.has(col.key)
                              ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                              : 'bg-white/5 border-border/50 text-slate-500 hover:border-slate-400'
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
            <div className="flex justify-between mt-2">
              <button
                type="button"
                onClick={() => setSelectedColumns(new Set(ALL_COLUMNS.map(c => c.key)))}
                className="text-[10px] text-blue-400 hover:text-blue-300 underline"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedColumns(new Set())}
                className="text-[10px] text-slate-500 hover:text-slate-400 underline"
              >
                إزالة الكل
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white/5 rounded-xl p-3 text-xs text-slate-400 text-right">
            <span className="text-slate-300 font-bold">عدد الأعمدة المختارة: </span>
            {selectedColumns.size} من {ALL_COLUMNS.length}
          </div>
        </div>

        <DialogFooter className="gap-3 pt-4 border-t border-white/5">
          <Button
            onClick={handleExport}
            disabled={exporting || selectedColumns.size === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 flex-1 gap-2"
          >
            {exporting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? 'جارٍ التصدير...' : `تصدير ${tickets.length} تذكرة`}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-500 hover:text-white rounded-xl h-12"
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}