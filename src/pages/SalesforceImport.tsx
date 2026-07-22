import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, FileSpreadsheet, CheckCircle2, XCircle, SkipForward, Info, ArrowRightLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataImport, type FieldDef } from '@/components/ui/DataImport';

type ImportResult = { added: number; updated: number; skipped: number; errors: string[]; total: number };

interface SFRow {
  caseNumber: string;
  unit: string;
  accountName: string;
  openedDate: string;
  description: string;
  status: string;
  phone: string;
}

const fieldDefs: FieldDef[] = [
  { key: 'caseNumber',  label: 'رقم الحالة',  aliases: ['Case Number', 'Case No', 'Case #', 'رقم الحالة', 'رقم الطلب'], required: true },
  { key: 'unit',        label: 'الوحدة',       aliases: ['Unit', 'Unit Number', 'Villa', 'Property', 'الوحدة', 'فيلا'], required: true },
  { key: 'accountName', label: 'اسم العميل',   aliases: ['Account Name', 'Account', 'Client Name', 'اسم العميل'] },
  { key: 'openedDate',  label: 'تاريخ الفتح',  aliases: ['Date/Time Opened', 'Opened Date', 'Open Date', 'Date Opened', 'Created Date', 'تاريخ الفتح'] },
  { key: 'description', label: 'الوصف',        aliases: ['Description', 'Subject', 'الوصف'] },
  { key: 'status',      label: 'الحالة',       aliases: ['Status', 'الحالة'] },
  { key: 'phone',       label: 'الجوال',       aliases: ['Person Account: Mobile', 'Person Account Mobile', 'Mobile Phone', 'Mobile', 'Phone', 'الجوال'] },
];

// Excel serial dates (e.g. 46225) come through as raw numbers when xlsx parses a
// date-typed cell without `cellDates:true`. CSV exports never hit this — values
// are already text — but .xlsx exports can, so convert defensively either way.
function excelSerialToISO(serial: number): string {
  const d = new Date((serial - 25569) * 86400 * 1000);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function normalizeDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) return isNaN(raw.getTime()) ? '' : raw.toISOString();
  if (typeof raw === 'number' && raw > 1000 && raw < 100000) return excelSerialToISO(raw);
  return String(raw).trim();
}
function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export default function SalesforceImport() {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleImportRows = async (rows: Record<string, unknown>[]) => {
    const payload: SFRow[] = rows.map(r => ({
      caseNumber:  str(r.caseNumber),
      unit:        str(r.unit),
      accountName: str(r.accountName),
      openedDate:  normalizeDate(r.openedDate),
      description: str(r.description),
      status:      str(r.status),
      phone:       str(r.phone),
    }));

    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';

    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/salesforce/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: payload }),
      });
      const data: ImportResult = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || 'فشل الاستيراد');
      setImportResult(data);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8" dir="rtl">

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <CloudLightning className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">مزامنة Salesforce</h1>
            <p className="text-sm text-muted-foreground mt-0.5">استيراد ومزامنة التذاكر من ملف Excel/CSV مُصدَّر من تقرير Salesforce</p>
          </div>
        </div>

        {importing && (
          <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            جاري استيراد التذاكر من Salesforce...
          </div>
        )}
        {importResult && !importing && (
          <div className={cn(
            'rounded-2xl p-5 border text-sm space-y-2',
            importResult.added > 0 ? 'bg-emerald-500/10 border-emerald-500/30' :
            importResult.updated > 0 ? 'bg-blue-500/10 border-blue-500/30' :
            'bg-muted/30 border-border/50',
          )}>
            <p className="font-bold text-foreground mb-3">✅ اكتملت المزامنة</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-500/10 rounded-xl p-3">
                <p className="text-2xl font-bold text-emerald-400">{importResult.added}</p>
                <p className="text-xs text-muted-foreground mt-1">جديدة</p>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-400">{importResult.updated}</p>
                <p className="text-xs text-muted-foreground mt-1">مُحدَّثة</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">مطابقة</p>
              </div>
            </div>
            {importResult.errors?.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-bold text-red-400">⚠️ أخطاء ({importResult.errors.length}):</p>
                <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-300 font-mono break-all">{err}</p>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setImportResult(null)} className="text-xs text-muted-foreground/60 hover:text-muted-foreground mt-2">إخفاء</button>
          </div>
        )}

        <div className="bg-muted/30 border border-border/50 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            كيف يشتغل؟
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            {[
              'افتح تقرير Salesforce الذي يحتوي على Cases',
              'من القائمة بجانب "Edit" اضغط "Export" — اختر "Details Only" وصيغة Excel أو CSV',
              'ارفع الملف الناتج هنا — تُقرأ الأعمدة تلقائياً وتُزامَن التذاكر فوراً',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-2 border-dashed border-blue-500/30 rounded-2xl p-8 text-center space-y-4 bg-blue-500/5">
          <p className="text-sm text-muted-foreground">ارفع ملف Excel أو CSV المُصدَّر من Salesforce</p>
          <DataImport<Record<string, unknown>>
            title="استيراد تذاكر Salesforce"
            description="ارفع ملف Excel/CSV المُصدَّر من تقرير Cases في Salesforce (اختر Details Only عند التصدير)"
            fieldDefs={fieldDefs}
            onImport={handleImportRows}
            trigger={
              <button
                className={cn(
                  'inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm',
                  'bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors',
                  'border-2 border-blue-400',
                )}
              >
                <FileSpreadsheet className="w-4 h-4" />
                رفع ملف Salesforce
              </button>
            }
          />
        </div>

        <div className="grid gap-3">
          {[
            { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, title: 'تذاكر جديدة — تُضاف فوراً', desc: 'تتصنف تلقائياً بالكلمات المفتاحية', color: 'border-emerald-500/20' },
            { icon: <ArrowRightLeft className="w-4 h-4 text-blue-400" />, title: 'تذاكر موجودة — تُزامَن الحالة', desc: 'لو أُغلقت في Salesforce وعندنا مفتوحة → تُغلق تلقائياً', color: 'border-blue-500/20' },
            { icon: <SkipForward className="w-4 h-4 text-amber-400" />, title: 'تذاكر متطابقة — تُتخطى', desc: 'مفيش تعديل لو الحالة واحدة في الطرفين', color: 'border-amber-500/20' },
            { icon: <XCircle className="w-4 h-4 text-red-400" />, title: 'أرقام التذاكر — بدون أصفار يسار', desc: '"00197089" تُحفظ كـ "197089"', color: 'border-red-500/20' },
          ].map((item, i) => (
            <div key={i} className={cn('flex items-start gap-3 p-4 bg-muted/20 border rounded-xl', item.color)}>
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div>
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </Layout>
  );
}
