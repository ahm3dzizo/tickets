import React, { useRef, useState } from 'react';
import { FileUp, Loader2, Check, FileSpreadsheet, ChevronLeft, FileText, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parsePdfTickets, type PdfParseProgress } from '@/services/pdfParser';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface FieldDef {
  key: string;
  label: string;
  aliases: string[];
}

interface DataImportProps<T> {
  onImport: (data: T[]) => Promise<void>;
  fieldDefs: FieldDef[];
  templateSample?: Record<string, string>;
  title: string;
  description: string;
  trigger?: React.ReactNode;
}

type Step = 'upload' | 'mapping' | 'confirm';

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function autoMatch(columns: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const na = normalize(alias);
    const found = columns.find(c => {
      const nc = normalize(c);
      return nc === na || nc.includes(na) || na.includes(nc);
    });
    if (found) return found;
  }
  return '';
}

export function DataImport<T>({ onImport, fieldDefs, templateSample, title, description, trigger }: DataImportProps<T>) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isPdf, setIsPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFileName(null);
    setRawData([]);
    setColumns([]);
    setMapping({});
    setIsPdf(false);
    setPdfProgress(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    // ── PDF path ──────────────────────────────────────────────────────────
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setIsPdf(true);
      setLoading(true);
      setPdfProgress(null);
      const onProgress: PdfParseProgress = (done, total) => setPdfProgress({ done, total });
      parsePdfTickets(file, onProgress)
        .then(rows => {
          if (rows.length === 0) { toast.error('لم يتم العثور على تذاكر في الـ PDF'); setLoading(false); return; }
          // Map parsed rows into the standard field keys
          const mapped = rows.map(r => ({
            ticketId:     r.ticketId,
            refNumber:    r.refNumber,
            clientName:   r.clientName,
            issuedAt:     r.date,
            daysOpen:     r.daysOpen,
            description:  r.description,
            priority:     r.priority,
            assigneeName: r.assigneeName,
            projectName:  '',
          }));
          setRawData(mapped);
          // Build synthetic columns from keys (for confirm preview)
          setColumns(Object.keys(mapped[0]));
          setStep('confirm');
        })
        .catch(err => {
          console.error(err);
          toast.error('فشل في قراءة ملف PDF.');
        })
        .finally(() => setLoading(false));
      return;
    }

    // ── Excel / CSV path ──────────────────────────────────────────────────
    setIsPdf(false);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (data.length === 0) { toast.error('الملف فارغ أو لا يحتوي على بيانات'); return; }
        const cols = Object.keys(data[0] as object);
        const autoMapping: Record<string, string> = {};
        for (const fd of fieldDefs) {
          autoMapping[fd.key] = autoMatch(cols, fd.aliases);
        }
        setRawData(data);
        setColumns(cols);
        setMapping(autoMapping);
        setStep('mapping');
      } catch {
        toast.error('فشل في قراءة الملف. تأكد من أنه ملف Excel أو CSV صالح.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const getMappedData = (): any[] => {
    // PDF data is already mapped — return as-is
    if (isPdf) return rawData;
    return rawData.map(row => {
      const out: Record<string, any> = {};
      for (const fd of fieldDefs) {
        const col = mapping[fd.key];
        out[fd.key] = col ? row[col] : '';
      }
      return out;
    });
  };

  const handleImport = async () => {
    setLoading(true);
    setImportError(null);
    try {
      const mapped = getMappedData();
      await onImport(mapped as T[]);
      toast.success(`تم استيراد ${mapped.length} سجل بنجاح`);
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء استيراد البيانات';
      setImportError(msg);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const sample = fieldDefs.reduce((acc, f) => {
      acc[f.label] = templateSample?.[f.label] ?? templateSample?.[f.key] ?? '';
      return acc;
    }, {} as Record<string, string>);
    const ws = XLSX.utils.json_to_sheet([sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${title}_template.xlsx`);
  };

  const stepLabels: Record<Step, string> = { upload: 'رفع الملف', mapping: 'ربط الأعمدة', confirm: 'تأكيد' };
  const stepOrder: Step[] = ['upload', 'mapping', 'confirm'];
  const mappedFields = isPdf
    ? fieldDefs  // for PDF: all fields are already mapped, show all
    : fieldDefs.filter(fd => mapping[fd.key]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger
        render={React.isValidElement(trigger) ? trigger : (
          <Button variant="outline" className="gap-2 border-dashed border-blue-500/30 hover:border-blue-500/50 bg-blue-500/5 text-blue-400 rounded-xl h-11">
            <FileUp className="w-4 h-4" />
            استيراد بيانات
          </Button>
        )}
      />
      <DialogContent className="bg-card border-border text-slate-200 w-[95vw] sm:max-w-[650px] rounded-3xl shadow-2xl shadow-black/40 p-4 sm:p-6 flex flex-col max-h-[90dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">{title}</DialogTitle>
          <DialogDescription className="text-slate-500 text-right">{description}</DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 py-1">
          {stepOrder.map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn('flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-all',
                step === s ? 'bg-blue-500/20 text-blue-400' : 'text-slate-600')}>
                <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  step === s ? 'bg-blue-500 text-white' :
                  stepOrder.indexOf(step) > i ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-500')}>
                  {stepOrder.indexOf(step) > i ? '✓' : i + 1}
                </span>
                {stepLabels[s]}
              </div>
              {i < 2 && <ChevronLeft className="w-3 h-3 text-slate-700 shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-2 min-h-0">

          {/* ── Import Error Panel ── */}
          {importError && (
            <div className="flex flex-col items-center justify-center gap-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-rose-500/15 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
              </div>
              <div className="space-y-2 max-w-sm">
                <p className="text-base font-black text-rose-300">تعذّر الاستيراد</p>
                <p className="text-sm text-slate-300 leading-relaxed">{importError}</p>
              </div>
              <Button
                variant="outline"
                className="border-rose-500/30 bg-rose-500/10 text-rose-300 hover:text-white rounded-xl h-10 px-6 font-bold"
                onClick={() => { setImportError(null); setStep('upload'); reset(); }}
              >
                رجوع واختر الملف الصحيح
              </Button>
            </div>
          )}

          {/* ── Step 1: Upload ── */}
          {!importError && step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-blue-500/50 transition-all cursor-pointer bg-white/5"
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv,.pdf" onChange={handleFileChange} />
                {loading ? (
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 text-blue-400 mx-auto mb-3 animate-spin" />
                      {pdfProgress && pdfProgress.total > 0 && pdfProgress.done < pdfProgress.total ? (
                        <p className="text-slate-400 text-sm">
                          جاري تحويل الصفحة {pdfProgress.done + 1} من {pdfProgress.total} إلى صورة…
                        </p>
                      ) : pdfProgress && pdfProgress.done >= pdfProgress.total ? (
                        <p className="text-slate-400 text-sm">جاري إرسال الملف لـ Gemini…</p>
                    ) : (
                      <p className="text-slate-400">جاري قراءة الملف…</p>
                    )}
                  </div>
                ) : (
                  <>
                    <FileUp className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">اضغط هنا لاختيار ملف Excel أو PDF</p>
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mt-1">xlsx · xls · csv · <span className="text-red-400">pdf</span></p>
                  </>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="text-blue-400 text-xs gap-2" onClick={downloadTemplate}>
                  تحميل نموذج الملف <FileSpreadsheet className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {!importError && step === 'mapping' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>الملف: <span className="text-blue-400 font-bold">{fileName}</span></span>
                <span className="text-emerald-400 font-bold">{rawData.length} سجل</span>
              </div>
              <p className="text-xs text-slate-500 text-right">اختر أي عمود في ملفك يقابل كل حقل (التطبيق اقترح التطابق تلقائياً):</p>
              <div className="max-h-64 overflow-y-auto space-y-2 pl-1">
                {fieldDefs.map(fd => (
                  <div key={fd.key} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-300 w-28 text-right shrink-0">{fd.label}</span>
                    <div className="w-3 h-px bg-slate-700 shrink-0" />
                    <select
                      className="flex-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-300 text-right"
                      value={mapping[fd.key] ?? ''}
                      onChange={e => setMapping(prev => ({ ...prev, [fd.key]: e.target.value }))}
                    >
                      <option value="" className="bg-slate-900">-- تجاهل --</option>
                      {columns.map(c => (
                        <option key={c} value={c} className="bg-slate-900">{c}</option>
                      ))}
                    </select>
                    {mapping[fd.key] && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </div>
                ))}
              </div>
              {/* First-row preview */}
              {rawData.length > 0 && mappedFields.length > 0 && (
                <div className="p-3 bg-black/20 rounded-xl border border-border text-xs text-right space-y-1">
                  <p className="font-bold text-slate-500 mb-1">معاينة أول سجل:</p>
                  {mappedFields.map(fd => (
                    <div key={fd.key} className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">{fd.label}:</span>
                      <span className="text-slate-200 truncate">{String(rawData[0][mapping[fd.key]] ?? '')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {!importError && step === 'confirm' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-center py-2">
                {isPdf
                  ? <FileText className="w-5 h-5 text-red-400" />
                  : <Check className="w-5 h-5 text-emerald-400" />}
                <span className={`font-bold text-sm ${isPdf ? 'text-red-300' : 'text-emerald-400'}`}>
                  {isPdf ? 'تم تحليل PDF — ' : ''}
                  جاهز لاستيراد {rawData.length} سجل
                </span>
              </div>
              <div className="max-h-52 overflow-auto rounded-xl border border-border bg-black/20">
                <table className="w-full text-[10px] text-right" style={{ minWidth: 0 }}>
                  <thead className="bg-white/5 sticky top-0">
                    <tr>
                      {mappedFields.map(fd => (
                        <th key={fd.key} className="p-1.5 border-b border-border text-slate-500 whitespace-nowrap text-[9px] sm:text-[10px]">{fd.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getMappedData().slice(0, 6).map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-white/5">
                        {mappedFields.map(fd => (
                          <td key={fd.key} className="p-1.5 text-slate-300 max-w-[80px] sm:max-w-[150px] truncate text-[9px] sm:text-[10px]">{String(row[fd.key] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rawData.length > 6 && (
                  <div className="p-2 text-center text-[10px] text-slate-600">... و {rawData.length - 6} سجلات أخرى</div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 shrink-0 flex-col sm:flex-row" hidden={!!importError}>
          {step === 'upload' && (
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-500 hover:text-white rounded-xl h-11">إلغاء</Button>
          )}
          {step === 'mapping' && (
            <>
              <Button onClick={() => setStep('confirm')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl h-11 font-bold flex-1">
                التالي ←
              </Button>
              <Button variant="ghost" onClick={() => setStep('upload')} className="text-slate-500 hover:text-white rounded-xl h-11">رجوع</Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button onClick={handleImport} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-11 font-bold shadow-lg shadow-blue-500/20 flex-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد الاستيراد'}
              </Button>
              {!isPdf && (
                <Button variant="ghost" onClick={() => setStep('mapping')} className="text-slate-500 hover:text-white rounded-xl h-11">رجوع</Button>
              )}
              {isPdf && (
                <Button variant="ghost" onClick={() => setStep('upload')} className="text-slate-500 hover:text-white rounded-xl h-11">رجوع</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
