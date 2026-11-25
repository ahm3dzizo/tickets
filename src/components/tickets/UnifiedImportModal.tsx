// src/components/tickets/UnifiedImportModal.tsx
import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { FileUp, Loader2 } from 'lucide-react';
import { Project, Client } from '@/types';
import { ticketsApi, projectsApi } from '@/lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface UnifiedImportModalProps {
  trigger: React.ReactElement;
  projects: Project[];
  clients: Client[];
  onImportSuccess?: () => void;
  currentUserId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const TICKET_ID_ALIASES = ['رقم التذكرة', 'ID', 'id', 'الرقم', '#', 'رقم الطلب', 'Case Number'];
const UNIT_ALIASES = ['رقم الفيلا', 'فيلا', 'villa', 'رقم الوحدة', 'الوحدة', 'Unit', 'Unit: Unit Name', 'Unit Name'];
const DATE_ALIASES = ['التاريخ', 'date', 'تاريخ الإنشاء', 'issuedAt', 'Opened Date', 'Date/Time Opened', 'Date / Time Opened', 'Date Time Opened'];

function cleanHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
}

function normalizeArabicHeader(value: string): string {
  return value.replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

function findColumn(columns: unknown[], aliases: string[]): number {
  const normalized = columns.map(cleanHeader);
  for (const alias of aliases) {
    const target = cleanHeader(alias);
    if (!target) continue;
    const index = normalized.findIndex(value => value === target);
    if (index >= 0) return index;
  }
  for (const alias of aliases) {
    const target = normalizeArabicHeader(cleanHeader(alias));
    if (!target) continue;
    const matches = normalized
      .map((value, index) => ({ value: normalizeArabicHeader(value), index }))
      .filter(item => item.value === target);
    if (matches.length === 1) return matches[0].index;
  }
  return -1;
}

function projectCodeFromUnit(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[٠-٩۰-۹]/g, digit =>
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.includes(digit)
      ? String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10)
      : digit
  ).trim().replace(/^(?:villa|unit|الوحدة|فيلا)\s*[-:/#]?\s*/i, '');
  const match = digits.match(/^([A-Za-z][A-Za-z0-9]*)[-_/\s]+(\d+)$/i);
  return match ? match[1].toUpperCase() : null;
}

async function splitWorkbookByProject(file: File, projects: Project[]): Promise<Array<{ project: Project; file: File; rows: number }>> {
  if (!projects.length) throw new Error('لا توجد مشاريع متاحة لحسابك.');
  const buffer = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error('ملف الإكسيل لا يحتوي على ورقة بيانات.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '', raw: false });
  let headerIndex = -1;
  let ticketColumn = -1;
  let unitColumn = -1;
  let dateColumn = -1;

  for (let index = 0; index < Math.min(rows.length, 1000); index++) {
    const ticket = findColumn(rows[index], TICKET_ID_ALIASES);
    const unit = findColumn(rows[index], UNIT_ALIASES);
    if (ticket >= 0 && unit >= 0) {
      headerIndex = index;
      ticketColumn = ticket;
      unitColumn = unit;
      dateColumn = findColumn(rows[index], DATE_ALIASES);
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error('لم أتمكن من تحديد عمود رقم التذكرة ورقم الفيلا في أول ورقة بالملف.');
  }

  const projectsByCode = new Map<string, Project[]>();
  for (const project of projects) {
    const code = String(project.abbreviation ?? '').trim().toUpperCase();
    if (!code) continue;
    projectsByCode.set(code, [...(projectsByCode.get(code) ?? []), project]);
  }

  const grouped = new Map<string, { project: Project; rows: unknown[][] }>();
  const errors: string[] = [];
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index];
    const ticketId = String(row[ticketColumn] ?? '').trim();
    if (!ticketId) continue;
    const rawUnit = row[unitColumn];
    const rawDate = dateColumn >= 0 ? row[dateColumn] : '';
    if (!String(rawUnit ?? '').trim() && !String(rawDate ?? '').trim()) continue;
    const code = projectCodeFromUnit(rawUnit);
    if (!code) {
      errors.push(`صف ${index + 1}: رقم الفيلا "${String(rawUnit ?? '').trim() || 'فارغ'}" لا يحتوي على بادئة مشروع واضحة.`);
      continue;
    }
    const matches = projectsByCode.get(code) ?? [];
    if (matches.length !== 1) {
      errors.push(`صف ${index + 1}: بادئة المشروع "${code}" ${matches.length ? 'مكررة وغير محددة' : 'غير موجودة أو غير مسموح لك بالاستيراد إليها'}.`);
      continue;
    }
    const project = matches[0];
    const group = grouped.get(project.id) ?? { project, rows: [] };
    group.rows.push(row);
    grouped.set(project.id, group);
  }

  if (errors.length) {
    throw new Error('تم إيقاف الاستيراد قبل أي تعديل بسبب أخطاء ربط المشاريع:\n' + errors.slice(0, 20).join('\n') +
      (errors.length > 20 ? `\n... وهناك ${errors.length - 20} أخطاء أخرى.` : ''));
  }
  if (!grouped.size) throw new Error('لم يتم العثور على صفوف تذاكر صالحة في الملف.');

  return [...grouped.values()].map(({ project, rows: projectRows }) => {
    const splitBook = XLSX.utils.book_new();
    const splitRows = [...rows.slice(0, headerIndex + 1), ...projectRows];
    const splitSheet = XLSX.utils.aoa_to_sheet(splitRows);
    XLSX.utils.book_append_sheet(splitBook, splitSheet, 'Tickets');
    const bytes = XLSX.write(splitBook, { bookType: 'xlsx', type: 'array' });
    return {
      project,
      file: new File([bytes], `${file.name.replace(/\.[^.]+$/, '')}-${project.abbreviation}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      rows: projectRows.length,
    };
  });
}

export function UnifiedImportModal({
  trigger,
  projects,
  onImportSuccess,
  open: controlledOpen,
  onOpenChange,
}: UnifiedImportModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (newOpen: boolean) => {
    if (isControlled && onOpenChange) onOpenChange(newOpen);
    else setInternalOpen(newOpen);
  };
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [skipDateFilter, setSkipDateFilter] = useState(false);
  const [resolutionIssues, setResolutionIssues] = useState<Array<{
    projectId: string; projectName: string; projectCode: string; ref: string; normalizedRef: string;
    kind: 'missing_unit' | 'missing_client' | 'duplicate_reference'; count: number;
    name: string; phone: string; blockNumber: string;
  }>>([]);
  const [pendingBatches, setPendingBatches] = useState<Array<{ project: Project; file: File; rows: number }>>([]);
  const [savingResolution, setSavingResolution] = useState(false);
  const closeMissing = true;

  const processFile = useCallback(async (file: File) => {
    if (!file || loading) return;
    setLoading(true);
    setProgress(0.03);
    let completedProjects = 0;
    const totals = {
      added: 0, updated: 0, closedMissing: 0, missingNotClosed: 0,
      skippedByDateFilter: 0, skippedInFile: 0, skippedInDB: 0,
      failed: 0, classified: 0, unclassified: 0,
    };
    const unresolvedUnits: { project: string; ref: string; count: number }[] = [];
    const unitsWithoutClient: { project: string; ref: string; count: number }[] = [];
    try {
      // Read-only preflight across every project. No ticket is created or closed
      // until missing units and client relationships have been resolved.
      const batches = await splitWorkbookByProject(file, projects);
      const issuesToResolve: typeof resolutionIssues = [];
      for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];
        const preflight = await ticketsApi.importExcel(
          batch.file, batch.project.id, false,
          value => setProgress((index + value * 0.25) / batches.length),
          skipDateFilter, true,
        );
        if (preflight.duplicateUnitReferences?.length) {
          throw new Error(`يوجد أكثر من سجل وحدة يطابق نفس الرقم بعد التطبيع في مشروع ${batch.project.name}: ${preflight.duplicateUnitReferences.join('، ')}. يلزم تصحيح تكرار أرقام الوحدات قبل الاستيراد.`);
        }
        for (const issue of preflight.issues ?? []) {
          issuesToResolve.push({
            projectId: batch.project.id,
            projectName: batch.project.name,
            projectCode: batch.project.abbreviation || '',
            ref: issue.ref,
            normalizedRef: issue.normalizedRef,
            kind: issue.kind,
            count: issue.count,
            name: '',
            phone: '',
            blockNumber: '',
          });
        }
      }
      if (issuesToResolve.length > 0) {
        setPendingBatches(batches);
        setResolutionIssues(issuesToResolve);
        return;
      }

      for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];
        const result = await ticketsApi.importExcel(
          batch.file,
          batch.project.id,
          closeMissing,
          value => setProgress((index + value) / batches.length),
          skipDateFilter,
        );
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
          totals[key] += Number(result[key] ?? 0);
        }
        for (const item of result.unresolvedUnits ?? []) {
          unresolvedUnits.push({ project: batch.project.abbreviation, ...item });
        }
        for (const item of result.unitsWithoutClient ?? []) {
          unitsWithoutClient.push({ project: batch.project.abbreviation, ...item });
        }
        completedProjects++;
      }
      if (unresolvedUnits.length > 0) {
        console.warn('[Import] وحدات غير موجودة في النظام:', unresolvedUnits);
      }
      if (unitsWithoutClient.length > 0) {
        console.warn('[Import] وحدات موجودة بدون عميل مرتبط:', unitsWithoutClient);
      }

      const parts = [`تم استيراد ${batches.reduce((sum, item) => sum + item.rows, 0)} صف عبر ${completedProjects} مشروع.`];
      if (totals.skippedByDateFilter > 0) parts.push(`⏳ تجاهل ${totals.skippedByDateFilter} تذكرة قديمة (مغلقة مسبقاً)`);
      if (totals.closedMissing > 0) parts.push(`🔒 إغلاق ${totals.closedMissing} تذكرة غير موجودة بملف مشروعها`);
      if (totals.missingNotClosed > 0) parts.push(`⚠ ${totals.missingNotClosed} تذكرة غير موجودة في الملف`);
      if (totals.added > 0) parts.push(`✅ إضافة ${totals.added} (مصنف: ${totals.classified}، غير مصنف: ${totals.unclassified})`);
      if (totals.updated > 0) parts.push(`🔄 تحديث ${totals.updated}`);
      if (totals.skippedInDB > 0) parts.push(`⏭ موجود بدون تغيير: ${totals.skippedInDB}`);
      if (totals.skippedInFile > 0) parts.push(`🔁 مكرر في الملف: ${totals.skippedInFile}`);
      if (totals.failed > 0) parts.push(`❌ فشل: ${totals.failed}`);
      if (unresolvedUnits.length > 0 || unitsWithoutClient.length > 0) {
        const examples = [...unresolvedUnits, ...unitsWithoutClient].slice(0, 5).map(u => `${u.ref} (${u.project})`).join('، ');
        parts.push(`🔗 غير مربوطة بعميل: ${unresolvedUnits.reduce((s, u) => s + u.count, 0) + unitsWithoutClient.reduce((s, u) => s + u.count, 0)} — مثال: ${examples} (التفاصيل في الكونسول)`);
      }
      toast.success(parts.join('\n'));
      setOpen(false);
      onImportSuccess?.();
    } catch (error: any) {
      const partial = completedProjects
        ? `\nتم بالفعل إنهاء استيراد ${completedProjects} مشروع قبل حدوث الخطأ.`
        : '';
      toast.error('فشل الاستيراد: ' + (error?.message || 'خطأ غير معروف') + partial);
      if (completedProjects) onImportSuccess?.();
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }, [loading, projects, skipDateFilter, onImportSuccess]);

  const updateResolutionIssue = (index: number, field: 'name' | 'phone' | 'blockNumber', value: string) => {
    setResolutionIssues(current => current.map((issue, issueIndex) =>
      issueIndex === index ? { ...issue, [field]: value } : issue
    ));
  };

  const saveMissingRelationships = async () => {
    const ambiguous = resolutionIssues.filter(issue => issue.kind === 'duplicate_reference');
    if (ambiguous.length) {
      toast.error('توجد أرقام وحدات متكررة أو ملتبسة داخل قاعدة البيانات. يجب تصحيحها أولاً حتى لا يتم ربط التذاكر بوحدة خاطئة.');
      return;
    }
    const invalid = resolutionIssues.filter(issue => !issue.name.trim() || !issue.phone.trim());
    if (invalid.length) {
      toast.error('أدخل اسم العميل ورقم جواله لكل وحدة قبل المتابعة.');
      return;
    }

    setSavingResolution(true);
    setLoading(true);
    try {
      const byProject = new Map<string, typeof resolutionIssues>();
      for (const issue of resolutionIssues) {
        const group = byProject.get(issue.projectId) ?? [];
        group.push(issue);
        byProject.set(issue.projectId, group);
      }

      for (const [projectId, issues] of byProject) {
        await projectsApi.importStructure(projectId, issues.map(issue => ({
          unitNumber: issue.normalizedRef,
          blockNumber: issue.blockNumber.trim(),
          name: issue.name.trim(),
          phone: issue.phone.trim(),
        })));
      }

      let added = 0;
      let updated = 0;
      let failed = 0;
      for (let index = 0; index < pendingBatches.length; index++) {
        const batch = pendingBatches[index];
        const result = await ticketsApi.importExcel(
          batch.file,
          batch.project.id,
          closeMissing,
          value => setProgress((index + value) / pendingBatches.length),
          skipDateFilter,
        );
        added += Number(result.added ?? 0);
        updated += Number(result.updated ?? 0);
        failed += Number(result.failed ?? 0);
        if (result.unresolvedUnits?.length || result.unitsWithoutClient?.length) {
          throw new Error(`ما زالت توجد وحدات أو عملاء غير مربوطين في مشروع ${batch.project.name}. راجع بيانات الوحدات والعملاء.`);
        }
      }

      toast.success(`تم حفظ ${resolutionIssues.length} ربط وحدة/عميل، ثم استيراد التذاكر بنجاح. إضافة: ${added}، تحديث: ${updated}، فشل: ${failed}`);
      setResolutionIssues([]);
      setPendingBatches([]);
      setOpen(false);
      onImportSuccess?.();
    } catch (error: any) {
      toast.error('تعذر استكمال الربط والاستيراد: ' + (error?.message || 'خطأ غير معروف'));
    } finally {
      setSavingResolution(false);
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">استيراد تذاكر صيانة</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {resolutionIssues.length > 0 ? (
            <div className="space-y-4 text-right" dir="rtl">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="font-bold text-amber-200">تم إيقاف الاستيراد مؤقتاً لحل بيانات الوحدات والعملاء</p>
                <p className="mt-1 text-xs text-slate-300">لم يتم إنشاء أو إغلاق أي تذكرة بعد. أكمل بيانات العميل لكل وحدة ثم تابع الاستيراد.</p>
              </div>
              <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {resolutionIssues.map((issue, index) => (
                  <div key={`${issue.projectId}-${issue.normalizedRef}-${index}`} className="rounded-xl border border-border bg-white/[0.03] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-white">{issue.projectCode} · {issue.ref}</div>
                      <span className="text-[11px] text-slate-400">{issue.count} تذكرة</span>
                    </div>
                    {issue.kind === 'duplicate_reference' ? (
                      <p className="text-xs text-red-300">رقم الوحدة يطابق أكثر من وحدة بعد توحيد الأرقام. صحح التكرار في بيانات المشروع أولاً.</p>
                    ) : (
                      <>
                        <p className="text-[11px] text-amber-300">{issue.kind === 'missing_unit' ? 'الوحدة غير مسجلة — سيتم إنشاؤها وربط العميل بها.' : 'الوحدة موجودة ولكن ليس لها عميل مرتبط.'}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="text-xs text-slate-400">اسم العميل
                            <input value={issue.name} onChange={event => updateResolutionIssue(index, 'name', event.target.value)} disabled={savingResolution} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-blue-500" placeholder="اسم العميل" />
                          </label>
                          <label className="text-xs text-slate-400">رقم الجوال
                            <input value={issue.phone} onChange={event => updateResolutionIssue(index, 'phone', event.target.value)} disabled={savingResolution} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-blue-500" placeholder="05xxxxxxxx" dir="ltr" />
                          </label>
                          {issue.kind === 'missing_unit' && (
                            <label className="text-xs text-slate-400 sm:col-span-2">رقم البلوك (اختياري)
                              <input value={issue.blockNumber} onChange={event => updateResolutionIssue(index, 'blockNumber', event.target.value)} disabled={savingResolution} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-blue-500" placeholder="رقم البلوك" />
                            </label>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => { setResolutionIssues([]); setPendingBatches([]); }} disabled={savingResolution} className="rounded-lg border border-border px-4 py-2 text-sm text-slate-300 disabled:opacity-50">إلغاء</button>
                <button type="button" onClick={saveMissingRelationships} disabled={savingResolution || resolutionIssues.some(issue => issue.kind === 'duplicate_reference')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {savingResolution ? 'جاري الحفظ والاستيراد...' : 'حفظ الربط ومتابعة الاستيراد'}
                </button>
              </div>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-end gap-2 px-1">
            <label htmlFor="skipDateFilter" className="text-xs text-slate-300 cursor-pointer select-none">
              استيراد جميع التذاكر (بما في ذلك التذاكر المغلقة القديمة)
            </label>
            <input
              id="skipDateFilter"
              type="checkbox"
              checked={skipDateFilter}
              disabled={loading}
              onChange={event => setSkipDateFilter(event.target.checked)}
              className="w-4 h-4 rounded border-border bg-white/5 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          <div>
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase">١. ارفع ملف Excel</Label>
            <div className="mb-3">
              <label
                className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all select-none
                  ${loading ? 'opacity-50 pointer-events-none' : ''}
                  ${isDragging ? 'border-blue-400 bg-blue-500/20 scale-[1.02]' : 'border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10'}`}
                onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }}
                onDrop={event => {
                  event.preventDefault();
                  setIsDragging(false);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped && !loading) processFile(dropped);
                }}
              >
                <div className={`flex items-center gap-2 transition-colors ${isDragging ? 'text-blue-300' : 'text-blue-400'}`}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className={`w-5 h-5 transition-transform ${isDragging ? 'scale-110' : ''}`} />}
                  <span className="text-sm font-bold">{isDragging ? 'أفلت الملف هنا' : 'اسحب وأفلت أو انقر للرفع'}</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">.xlsx · .xlsm · .xls · .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls,.csv"
                  className="hidden"
                  disabled={loading}
                  onChange={event => {
                    const selected = event.target.files?.[0];
                    if (selected) processFile(selected);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {loading && progress > 0 && (
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
              <p className="text-xs text-slate-400 text-right mt-1">جاري الاستيراد... {Math.round(progress * 100)}%</p>
            </div>
          )}

          <div className="bg-white/5 rounded-2xl p-4 text-xs text-right text-slate-400">
            <p className="text-slate-300 font-bold mb-2">يتم تلقائياً:</p>
            <p>• <span className="text-blue-400">تحديد المشروع</span> — من بادئة رقم الفيلا في كل صف.</p>
            <p>• <span className="text-blue-400">التصنيف الذكي</span> — تصنيف التذاكر التي لا تحتوي على نوع صيانة بواسطة الذكاء الاصطناعي لاحقاً.</p>
            <p>• <span className="text-blue-400">ربط العميل</span> — من خلال مطابقة رقم الفيلا بقاعدة بيانات العملاء داخل المشروع المحدد.</p>
          </div>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
