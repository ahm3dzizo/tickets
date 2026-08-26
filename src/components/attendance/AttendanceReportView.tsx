import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Download, Printer, RefreshCw, Calendar, 
  Briefcase, HardHat, Clock, AlertTriangle, 
  CheckCircle2, Coffee, Wrench, Edit3, Filter,
  FileSpreadsheet, ShieldAlert, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { projectsApi, techniciansApi, attendanceApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { arSA } from 'date-fns/locale';

interface AttendanceReportViewProps {
  initialProjectId?: string;
}

const specialtyLabels: Record<string, string> = { 
  mechanics: 'ميكانيكا / سباكة', 
  electricity: 'كهرباء', 
  HVAC: 'تكييف',
  carpentry: 'نجارة',
  general: 'عام' 
};

const gpsFlagLabels: Record<string, string> = {
  clock_in_far_from_office: 'تسجيل قديم خارج النطاق',
  gps_unrealistic_precision: 'دقة GPS غير واقعية',
  gps_impossible_speed: 'سرعة انتقال غير منطقية',
  gps_suspicious_altitude_accuracy: 'بيانات ارتفاع مشبوهة',
};

function gpsFlagText(reason?: string | null) {
  if (!reason) return 'قراءة موقع تحتاج مراجعة';
  return reason.split(',').map(code => gpsFlagLabels[code.trim()] || code.trim()).join('، ');
}

export function AttendanceReportView({ initialProjectId }: AttendanceReportViewProps) {
  const [shifts, setShifts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    totalShifts: 0,
    totalWorkHours: 0,
    totalBreakHours: 0,
    totalOvertimeHours: 0,
    totalTicketsWorked: 0,
    flaggedShiftsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [preset, setPreset] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('this_month');
  const [fromDate, setFromDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedProject, setSelectedProject] = useState<string>(initialProjectId || 'all');
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'flagged' | 'normal'>('all');

  // Metadata for filter options
  const [projects, setProjects] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  // Override modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideShift, setOverrideShift] = useState<any>(null);
  const [overrideClockIn, setOverrideClockIn] = useState('');
  const [overrideClockOut, setOverrideClockOut] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Load projects and technicians once
  useEffect(() => {
    Promise.all([projectsApi.getAll(), techniciansApi.getAll()])
      .then(([projs, techs]) => {
        setProjects(projs as any[]);
        setTechnicians((techs as any[]).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, []);

  // Handle Preset changes
  const applyPreset = (p: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom') => {
    setPreset(p);
    const now = new Date();
    if (p === 'today') {
      const d = format(now, 'yyyy-MM-dd');
      setFromDate(d);
      setToDate(d);
    } else if (p === 'yesterday') {
      const d = format(subDays(now, 1), 'yyyy-MM-dd');
      setFromDate(d);
      setToDate(d);
    } else if (p === 'this_week') {
      setFromDate(format(startOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'));
      setToDate(format(endOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'));
    } else if (p === 'this_month') {
      setFromDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setToDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    }
  };

  // Fetch Report Data
  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await attendanceApi.getReport({
        from: fromDate || undefined,
        to: toDate || undefined,
        projectId: selectedProject !== 'all' ? selectedProject : undefined,
        technicianId: selectedTech !== 'all' ? selectedTech : undefined,
      });
      setShifts(data.shifts || []);
      setSummary(data.summary || {});
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء تحميل التقرير');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [fromDate, toDate, selectedProject, selectedTech]);

  // Filtered shifts based on flag status
  const displayedShifts = useMemo(() => {
    return shifts.filter(s => {
      if (flagFilter === 'flagged') return s.isFlagged;
      if (flagFilter === 'normal') return !s.isFlagged;
      return true;
    });
  }, [shifts, flagFilter]);

  // Open Override Dialog
  const handleOpenOverride = (shift: any) => {
    setOverrideShift(shift);
    setOverrideClockIn(shift.clockInAt ? format(new Date(shift.clockInAt), "yyyy-MM-dd'T'HH:mm") : '');
    setOverrideClockOut(shift.clockOutAt ? format(new Date(shift.clockOutAt), "yyyy-MM-dd'T'HH:mm") : '');
    setOverrideReason('');
    setOverrideModalOpen(true);
  };

  // Submit Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideShift) return;
    setOverrideLoading(true);
    try {
      await attendanceApi.override({
        shiftLogId: overrideShift.id,
        clockInAt: overrideClockIn ? new Date(overrideClockIn).toISOString() : undefined,
        clockOutAt: overrideClockOut ? new Date(overrideClockOut).toISOString() : undefined,
        reason: overrideReason
      });

      toast.success('تم تعديل سجل البصمة بنجاح');
      setOverrideModalOpen(false);
      loadReport();
    } catch (err: any) {
      toast.error(err.message || 'فشل تعديل السجل');
    } finally {
      setOverrideLoading(false);
    }
  };

  // ─── Export to Excel via ExcelJS ──────────────────────────────────────────
  const handleExportExcel = async () => {
    if (displayedShifts.length === 0) {
      toast.warning('لا توجد سجلات لتصديرها');
      return;
    }
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام رتال لإدارة الصيانة';

      const worksheet = workbook.addWorksheet('سجل الحضور والانصراف', {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }]
      });

      // 1. Title Rows
      const titleRow = worksheet.addRow(['تقرير حضور وانصراف وساعات عمل الفنيين - شركة رتال للصيانة']);
      titleRow.height = 30;
      worksheet.mergeCells('A1:L1');
      const titleCell = worksheet.getCell('A1');
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Subtitle info
      const subRow = worksheet.addRow([`الفترة: من ${fromDate} إلى ${toDate} | تاريخ الاستخراج: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`]);
      subRow.height = 20;
      worksheet.mergeCells('A2:L2');
      const subCell = worksheet.getCell('A2');
      subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Blank spacing row
      worksheet.addRow([]);

      // 2. Table Headers
      const headers = [
        'التاريخ',
        'كود الفني',
        'اسم الفني',
        'التخصص',
        'المشروع',
        'وقت الحضور',
        'وقت الانصراف',
        'ساعات العمل',
        'الاستراحة (د)',
        'الإضافي (س)',
        'التذاكر الميدانية',
        'حالة البصمة والتحقق'
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue 600
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      // 3. Data Rows
      displayedShifts.forEach((s, idx) => {
        const d = s.clockInAt ? format(new Date(s.clockInAt), 'yyyy-MM-dd') : '-';
        const inTime = s.clockInAt ? format(new Date(s.clockInAt), 'hh:mm a') : '-';
        const outTime = s.clockOutAt ? format(new Date(s.clockOutAt), 'hh:mm a') : 'مستمر بالدوام';
        const workHours = (s.totalWorkMinutes ? (s.totalWorkMinutes / 60).toFixed(1) : '0.0') + ' س';
        const breakMins = s.totalBreakMinutes || 0;
        const overtimeHours = (s.overtimeMinutes ? (s.overtimeMinutes / 60).toFixed(1) : '0.0') + ' س';
        const ticketsCount = s.sessions?.length || 0;
        const geoStatus = s.isFlagged 
          ? `⚠️ تنبيه (${s.clockInDistanceM ? Math.round(s.clockInDistanceM) + 'م' : 'بعيد'})` 
          : `✅ معتمد (${s.clockInDistanceM ? Math.round(s.clockInDistanceM) + 'م' : 'مكتب'})`;

        const row = worksheet.addRow([
          d,
          s.technician?.employeeId || s.technicianId.slice(0, 6),
          s.technician?.name || '-',
          specialtyLabels[s.technician?.specialty] || s.technician?.specialty || 'عام',
          s.project?.name || '-',
          inTime,
          outTime,
          workHours,
          breakMins,
          overtimeHours,
          ticketsCount,
          geoStatus
        ]);

        row.height = 22;
        const isEven = idx % 2 === 0;
        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Arial', size: 10 };
          cell.numFmt = '@';
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' }
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };

          // Highlight flagged cells
          if (colNum === 12 && s.isFlagged) {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFDC2626' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          }
        });
      });

      // 4. Totals Row
      const totalRow = worksheet.addRow([
        'الإجمالي الكلي',
        `${displayedShifts.length} وردية`,
        '',
        '',
        '',
        '',
        '',
        `${summary.totalWorkHours || 0} س`,
        `${summary.totalBreakHours || 0} س`,
        `${summary.totalOvertimeHours || 0} س`,
        `${summary.totalTicketsWorked || 0} تذكرة`,
        `${summary.flaggedShiftsCount || 0} تنبيه`
      ]);
      totalRow.height = 26;
      totalRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F172A' } },
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        };
      });

      // Column widths
      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? headers[idx].length : 10;
        displayedShifts.forEach(s => {
          const val = String(s.technician?.name || '');
          if (val.length > maxLen) maxLen = val.length;
        });
        col.width = Math.min(Math.max(maxLen + 5, 14), 30);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const fileName = `تقرير_الحضور_والانصراف_${fromDate}_إلى_${toDate}.xlsx`;
      Object.assign(document.createElement('a'), { href: url, download: fileName }).click();
      toast.success('تم تصدير ملف Excel بنجاح!');
    } catch (err: any) {
      toast.error('فشل تصدير Excel: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // ─── Print / PDF ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">

      {/* ── Top Filter Bar ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
        
        {/* Presets & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border overflow-x-auto">
            {[
              { id: 'today', label: 'اليوم' },
              { id: 'yesterday', label: 'أمس' },
              { id: 'this_week', label: 'هذا الأسبوع' },
              { id: 'this_month', label: 'هذا الشهر' },
              { id: 'custom', label: 'مخصص' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id as any)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                  preset === p.id 
                    ? "bg-card text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 gap-2 font-bold shadow-lg shadow-emerald-600/20 text-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'جارٍ التصدير...' : 'تصدير Excel'}
            </Button>

            <Button
              variant="outline"
              onClick={handlePrint}
              className="rounded-xl border-border h-10 px-3.5 gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={loadReport}
              className="rounded-xl border-border h-10 w-10 text-muted-foreground hover:text-foreground shrink-0"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Extended Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border/50">
          
          {/* From Date */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">من تاريخ</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={e => {
                setFromDate(e.target.value);
                setPreset('custom');
              }}
              className="bg-muted/40 border-border rounded-xl h-9 text-xs"
            />
          </div>

          {/* To Date */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">إلى تاريخ</Label>
            <Input
              type="date"
              value={toDate}
              onChange={e => {
                setToDate(e.target.value);
                setPreset('custom');
              }}
              className="bg-muted/40 border-border rounded-xl h-9 text-xs"
            />
          </div>

          {/* Project Filter */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">المشروع</Label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="w-full bg-muted/40 border border-border text-foreground rounded-xl h-9 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">جميع المشاريع</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Technician Filter */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">الفني</Label>
            <select
              value={selectedTech}
              onChange={e => setSelectedTech(e.target.value)}
              className="w-full bg-muted/40 border border-border text-foreground rounded-xl h-9 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">جميع الفنيين</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.employeeId ? `#${t.employeeId}` : specialtyLabels[t.specialty] || t.specialty})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">إجمالي الورديات</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-foreground font-mono">{summary.totalShifts || 0}</div>
            <span className="text-[10px] text-muted-foreground">وردية مسجلة</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">ساعات العمل الفعلية</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-400 font-mono">{summary.totalWorkHours || 0} <span className="text-sm font-normal">ساعة</span></div>
            <span className="text-[10px] text-muted-foreground">صافي وقت الدوام</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">ساعات العمل الإضافي</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-400 font-mono">{summary.totalOvertimeHours || 0} <span className="text-sm font-normal">ساعة</span></div>
            <span className="text-[10px] text-muted-foreground">خارج أوقات الدوام الرسمي</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">التذاكر الميدانية</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-cyan-400 font-mono">{summary.totalTicketsWorked || 0}</div>
            <span className="text-[10px] text-muted-foreground">أعمال صيانة تم مباشرتها</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">تنبيهات الموقع (GPS)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-400 font-mono">{summary.flaggedShiftsCount || 0}</div>
            <span className="text-[10px] text-muted-foreground">بصمة خارج النطاق المسموح</span>
          </div>
        </div>
      </div>

      {/* ── Main Data Table ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        
        {/* Table Controls */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground text-sm">سجلات الحضور اليومية المفصلة</span>
            <Badge variant="secondary" className="text-xs font-mono">{displayedShifts.length} سجل</Badge>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFlagFilter(flagFilter === 'flagged' ? 'all' : 'flagged')}
              className={cn(
                "px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border",
                flagFilter === 'flagged'
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>تنبيهات المسافة فقط ({summary.flaggedShiftsCount || 0})</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto" ref={printRef}>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
              <p className="font-semibold text-sm">جارٍ تحميل بيانات الحضور والإنصراف...</p>
            </div>
          ) : displayedShifts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Clock className="w-7 h-7" />
              </div>
              <p className="font-semibold text-foreground">لا توجد سجلات حضور مطابقة للفلاتر المحددة</p>
              <p className="text-xs text-muted-foreground mt-1">جرّب تغيير الفترة الزمنية أو اختيار مشاريع أخرى</p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">التاريخ</th>
                  <th className="py-3.5 px-4">الفني</th>
                  <th className="py-3.5 px-4">المشروع</th>
                  <th className="py-3.5 px-4">بصمة الحضور (GPS)</th>
                  <th className="py-3.5 px-4">بصمة الانصراف</th>
                  <th className="py-3.5 px-4">ساعات العمل</th>
                  <th className="py-3.5 px-4">الاستراحة</th>
                  <th className="py-3.5 px-4">الإضافي</th>
                  <th className="py-3.5 px-4">التذاكر</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedShifts.map((shift) => {
                  const d = shift.clockInAt ? new Date(shift.clockInAt) : null;
                  const isOngoing = !shift.clockOutAt;
                  const workHrs = Math.floor((shift.totalWorkMinutes || 0) / 60);
                  const workMins = (shift.totalWorkMinutes || 0) % 60;
                  const otHrs = Math.floor((shift.overtimeMinutes || 0) / 60);
                  const otMins = (shift.overtimeMinutes || 0) % 60;

                  return (
                    <tr key={shift.id} className="hover:bg-muted/30 transition-colors">
                      
                      {/* Date */}
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground whitespace-nowrap">
                        {d ? format(d, 'yyyy-MM-dd') : '-'}
                        <div className="text-[10px] text-muted-foreground">
                          {d ? format(d, 'EEEE', { locale: arSA }) : ''}
                        </div>
                      </td>

                      {/* Technician */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-foreground">{shift.technician?.name || 'فني'}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-muted-foreground font-mono">
                            {shift.technician?.employeeId ? `#${shift.technician.employeeId}` : ''}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {specialtyLabels[shift.technician?.specialty] || shift.technician?.specialty || 'عام'}
                          </span>
                        </div>
                      </td>

                      {/* Project */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-foreground">{shift.project?.name || '-'}</span>
                      </td>

                      {/* Clock In */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold font-mono text-foreground">
                          {shift.clockInAt ? format(new Date(shift.clockInAt), 'hh:mm a') : '-'}
                        </div>
                        <div className="mt-0.5">
                          {shift.isFlagged ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span title={gpsFlagText(shift.flagReason)}>
                                {shift.clockInDistanceM != null
                                  ? `${Math.round(shift.clockInDistanceM)}م — ${gpsFlagText(shift.flagReason)}`
                                  : gpsFlagText(shift.flagReason)}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                              <span>{shift.clockInDistanceM ? `${Math.round(shift.clockInDistanceM)}م (بالمكتب)` : 'مكتب المشروع'}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Clock Out */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {shift.clockOutAt ? (
                          <div className="font-bold font-mono text-foreground">
                            {format(new Date(shift.clockOutAt), 'hh:mm a')}
                          </div>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
                            مستمر بالدوام
                          </span>
                        )}
                      </td>

                      {/* Work Duration */}
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                        {workHrs > 0 ? `${workHrs} س ` : ''}{workMins} د
                      </td>

                      {/* Breaks */}
                      <td className="py-3.5 px-4 font-mono text-muted-foreground whitespace-nowrap">
                        {shift.totalBreakMinutes ? `${shift.totalBreakMinutes} د` : '-'}
                      </td>

                      {/* Overtime */}
                      <td className="py-3.5 px-4 font-mono text-purple-400 whitespace-nowrap">
                        {shift.overtimeMinutes > 0 ? `${otHrs > 0 ? `${otHrs} س ` : ''}${otMins} د` : '-'}
                      </td>

                      {/* Tickets Count */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-foreground font-mono font-bold">
                          <Wrench className="w-3 h-3 text-cyan-400" />
                          <span>{shift.sessions?.length || 0}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          shift.status === 'COMPLETED' ? "bg-muted text-muted-foreground" :
                          shift.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        )}>
                          {shift.status === 'COMPLETED' ? 'مكتمل' :
                           shift.status === 'ACTIVE' ? 'نشط' : 'استراحة'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenOverride(shift)}
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 rounded-xl"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </Button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Supervisor Override Dialog ─────────────────────────────────── */}
      <Dialog open={overrideModalOpen} onOpenChange={setOverrideModalOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[420px] rounded-2xl shadow-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">
              تعديل سجل بصمة الفني يدوياً
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-right text-xs">
              يمكن للمشرف تعديل وقت الحضور والانصراف للفني {overrideShift?.technician?.name}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitOverride} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">وقت الحضور (Clock-In)</Label>
              <Input
                type="datetime-local"
                value={overrideClockIn}
                onChange={e => setOverrideClockIn(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">وقت الانصراف (Clock-Out)</Label>
              <Input
                type="datetime-local"
                value={overrideClockOut}
                onChange={e => setOverrideClockOut(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">سبب التعديل</Label>
              <Input
                type="text"
                placeholder="مثال: نسيان الهاتف / عطل في الشبكة"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-xs text-right"
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="submit"
                disabled={overrideLoading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-11 px-6 flex-1 text-xs"
              >
                {overrideLoading ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOverrideModalOpen(false)}
                className="rounded-xl h-11 text-slate-400 hover:text-white text-xs"
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
