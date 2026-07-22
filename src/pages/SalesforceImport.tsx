import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, BookMarked, FileSpreadsheet, CheckCircle2, XCircle, SkipForward, Info, ArrowRightLeft, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataImport, type FieldDef } from '@/components/ui/DataImport';

// ── Bookmarklet builder ────────────────────────────────────────────────────────
// Calls Salesforce's own Analytics REST API (same-origin, uses the browser's
// existing session cookie) instead of scraping the DOM. This returns ALL report
// rows in one JSON response — no virtual-scroll timing, no ARIA text noise, no
// manual export step.
function buildBookmarklet(appOrigin: string): string {
  const fn = `async function(O){
  var el=null;
  var upd=function(msg,bg){
    if(el){el.innerHTML=msg;if(bg)el.style.background=bg;}
    else alert(msg.replace(/<[^>]+>/g,''));
  };
  try{
    el=document.createElement('div');
    el.setAttribute('style','all:initial;position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;background:#1e293b;color:#e2e8f0;padding:16px 22px;border-radius:14px;font-family:Arial,sans-serif;font-size:12px;line-height:1.8;box-shadow:0 8px 32px rgba(0,0,0,.55);direction:rtl;min-width:260px;max-width:400px;word-break:break-all');
    el.innerHTML='<b>مزامنة رتال</b><br>جاري الاتصال بـ Salesforce...';
    (document.body||document.documentElement).appendChild(el);
  }catch(e){el=null;}

  try{
    /* ── find report ID (main window or any iframe) — SF report IDs start with 00O ── */
    function findReportId(href){
      var m=(href||'').match(/(00O[a-zA-Z0-9]{12,15})/);
      return m?m[1]:null;
    }
    var reportId=findReportId(location.href);
    if(!reportId){
      try{
        var frames=document.querySelectorAll('iframe');
        for(var fi=0;fi<frames.length;fi++){
          var fid=findReportId(frames[fi].src||'');
          if(fid){reportId=fid;break;}
        }
      }catch(e){}
    }
    if(!reportId){
      upd('❌ لم يتم العثور على تقرير<br>تأكد أنك مفتوح على صفحة تقرير Salesforce (Cases)','#7f1d1d');
      setTimeout(function(){if(el)el.remove();},9000);return;
    }
    console.log('[retal] reportId=',reportId);

    /* ── call Salesforce's Analytics REST API — same-origin, uses session cookie automatically ── */
    var apiUrl='/services/data/v59.0/analytics/reports/'+reportId+'?includeDetails=true';
    var resp=await fetch(apiUrl,{credentials:'include',headers:{'Accept':'application/json'}});
    if(!resp.ok){
      var errText='';
      try{errText=await resp.text();}catch(e2){}
      throw new Error('HTTP '+resp.status+' '+errText.slice(0,150));
    }
    var json=await resp.json();

    /* ── column headers from API metadata (clean labels — no ARIA noise at all) ── */
    var colInfo=(json.reportExtendedMetadata&&json.reportExtendedMetadata.detailColumnInfo)||{};
    var columnOrder=(json.reportMetadata&&json.reportMetadata.detailColumns)||Object.keys(colInfo);
    var headers=columnOrder.map(function(k){
      var info=colInfo[k];
      return String((info&&info.label)||k).toLowerCase();
    });
    console.log('[retal] headers:',headers);

    /* ── column matching ── */
    function col(){
      var keys=Array.prototype.slice.call(arguments);
      for(var j=0;j<keys.length;j++)for(var i=0;i<headers.length;i++)if(headers[i]===keys[j])return i;
      for(var j=0;j<keys.length;j++)for(var i=0;i<headers.length;i++)if(headers[i].indexOf(keys[j])===0)return i;
      for(var j=0;j<keys.length;j++)for(var i=0;i<headers.length;i++)if(headers[i].indexOf(keys[j])>=0)return i;
      return -1;
    }
    var unitPat=/^[A-Za-z]{2,6}-\\d+$/;
    var casePat=/^0*\\d{5,9}$/;
    var iCase=col('case number','case no','case#','رقم الحالة');
    var iUnit=col('unit number','unit no','unit','villa','property','وحدة','فيلا');
    var iAcc=col('account name','account','client name','اسم العميل');
    var iDate=col('date/time opened','opened date','open date','opened','created','date','تاريخ');
    var iDesc=col('description','subject','وصف');
    var iStatus=col('status','حالة');
    var iPhone=col('person account: mobile','person account mobile','mobile phone','mobile','phone','جوال','هاتف');
    console.log('[retal] cols: case='+iCase+' unit='+iUnit+' acc='+iAcc+' date='+iDate+' phone='+iPhone);

    if(iCase<0){
      upd('❌ عمود رقم الحالة غير موجود في التقرير<br>'+headers.slice(0,8).join(' | '),'#7f1d1d');
      setTimeout(function(){if(el)el.remove();},12000);return;
    }

    /* ── collect ALL detail rows across every group in factMap (handles grouped reports) ── */
    var allRowTexts=[];
    var factMap=json.factMap||{};
    Object.keys(factMap).forEach(function(key){
      var rowsArr=(factMap[key]&&factMap[key].rows)||[];
      rowsArr.forEach(function(r){
        var cells=r.dataCells||[];
        var texts=columnOrder.map(function(ck,i){
          var c=cells[i];
          if(!c)return '';
          var v=(c.label!=null)?c.label:c.value;
          return v==null?'':String(v).trim();
        });
        allRowTexts.push(texts);
      });
    });
    console.log('[retal] total rows from API:',allRowTexts.length);

    if(!allRowTexts.length){
      upd('⚠️ التقرير لا يحتوي على صفوف<br>تأكد أن التقرير يعرض التفاصيل (Show Details)','#78350f');
      setTimeout(function(){if(el)el.remove();},12000);return;
    }

    /* ── build structured rows — case# must be purely numeric (rejects unit/total rows) ── */
    var rows=[];
    allRowTexts.forEach(function(texts){
      function get(i){return(i>=0&&i<texts.length)?texts[i]:'';}
      var cn=get(iCase).replace(/\\s/g,'');
      if(!cn||!casePat.test(cn))return;
      var unitVal=get(iUnit);
      if(!unitPat.test(unitVal)){
        for(var ci=0;ci<texts.length;ci++){if(unitPat.test(texts[ci])){unitVal=texts[ci];break;}}
      }
      rows.push({caseNumber:cn,unit:unitVal,accountName:get(iAcc),openedDate:get(iDate),description:get(iDesc),status:get(iStatus),phone:get(iPhone)});
    });
    console.log('[retal] extracted rows:',rows.length,rows[0]);

    if(!rows.length){
      upd('⚠️ لا توجد صفوف صالحة بعد الفلترة<br>case='+iCase+' unit='+iUnit,'#78350f');
      setTimeout(function(){if(el)el.remove();},12000);return;
    }

    var encoded;
    try{encoded=btoa(unescape(encodeURIComponent(JSON.stringify(rows))));}
    catch(e3){encoded=btoa(JSON.stringify(rows).replace(/[^\\x00-\\x7F]/g,'?'));}

    upd('✅ تم قراءة <b>'+rows.length+'</b> سجل مباشرة من Salesforce<br>جاري فتح التطبيق...');
    window.open(O+'/salesforce-import#sf'+encoded,'_blank');
    setTimeout(function(){if(el)el.remove();},4000);

  }catch(e){
    console.error('[retal]',e);
    upd('❌ خطأ: '+e.message+'<br><small>تأكد من صلاحية "API Enabled"، أو استخدم رفع الملف كبديل بالأسفل</small>','#7f1d1d');
    setTimeout(function(){if(el)el.remove();},14000);
  }
}`;

  return `javascript:void (${fn})('${appOrigin}')`;
}

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
  const [bookmarkletCode, setBookmarkletCode] = useState('');
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const generateHref = () => {
    setBookmarkletCode(buildBookmarklet(window.location.origin));
  };

  useEffect(() => { generateHref(); }, []);

  useEffect(() => {
    if (linkRef.current && bookmarkletCode) {
      linkRef.current.setAttribute('href', bookmarkletCode);
    }
  }, [bookmarkletCode]);

  const sendRows = async (rows: SFRow[]) => {
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
        body: JSON.stringify({ rows }),
      });
      const data: ImportResult = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || 'فشل الاستيراد');
      setImportResult(data);
    } finally {
      setImporting(false);
    }
  };

  // ── receive data relayed from the bookmarklet via URL hash ──────────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#sf')) return;
    window.history.replaceState(null, '', window.location.pathname);
    let rows: SFRow[];
    try {
      rows = JSON.parse(decodeURIComponent(escape(atob(hash.slice(3)))));
    } catch { return; }
    if (!Array.isArray(rows) || rows.length === 0) return;
    sendRows(rows).catch(() => {});
  }, []);

  const handleFileImportRows = async (rows: Record<string, unknown>[]) => {
    const payload: SFRow[] = rows.map(r => ({
      caseNumber:  str(r.caseNumber),
      unit:        str(r.unit),
      accountName: str(r.accountName),
      openedDate:  normalizeDate(r.openedDate),
      description: str(r.description),
      status:      str(r.status),
      phone:       str(r.phone),
    }));
    await sendRows(payload);
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
            <p className="text-sm text-muted-foreground mt-0.5">استيراد ومزامنة التذاكر مباشرة من تقارير Salesforce بضغطة واحدة</p>
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
              'اسحب الزرار أدناه إلى شريط المفضلة في Chrome (مرة واحدة فقط)',
              'افتح أي تقرير Salesforce يحتوي على Cases',
              'اضغط "مزامنة رتال" — يقرأ كل الصفوف مباشرة من Salesforce ويفتح التطبيق تلقائياً',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-2 border-dashed border-blue-500/30 rounded-2xl p-8 text-center space-y-5 bg-blue-500/5">
          <p className="text-sm text-muted-foreground">اسحب الزرار لشريط المفضلة</p>
          {bookmarkletCode ? (
            <a
              ref={linkRef}
              href="#"
              onClick={e => e.preventDefault()}
              draggable
              title="اسحب لشريط المفضلة — لا تضغط هنا"
              className={cn(
                'inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm',
                'bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors',
                'border-2 border-blue-400 cursor-grab active:cursor-grabbing select-none',
              )}
            >
              <BookMarked className="w-4 h-4" />
              مزامنة رتال
            </a>
          ) : (
            <div className="w-36 h-12 bg-muted/50 rounded-xl animate-pulse mx-auto" />
          )}
          <p className="text-xs text-muted-foreground/60">
            لو انتهت الجلسة،{' '}
            <button onClick={generateHref} className="text-blue-400 underline underline-offset-2">جدّد الزرار</button>
            {' '}وأعد سحبه
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs text-muted-foreground">أو</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <div className="bg-muted/20 border border-border/50 rounded-2xl p-5 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            لو الزرار رفض يشتغل (مثلاً صلاحية API غير مفعّلة)، ارفع ملف Excel/CSV مُصدَّر يدوياً من التقرير (Export → Details Only)
          </p>
          <DataImport<Record<string, unknown>>
            title="استيراد تذاكر Salesforce"
            description="ارفع ملف Excel/CSV المُصدَّر من تقرير Cases في Salesforce (اختر Details Only عند التصدير)"
            fieldDefs={fieldDefs}
            onImport={handleFileImportRows}
            trigger={
              <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-muted hover:bg-muted/70 text-foreground transition-colors border border-border/60">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                رفع ملف كبديل
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

        <div className="pt-2 border-t border-border/30">
          <button onClick={generateHref} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            تجديد رمز الجلسة
          </button>
          <p className="text-xs text-muted-foreground/50 mt-1">بعد التجديد أعد سحب الزرار لشريط المفضلة ليُحدَّث</p>
        </div>

      </div>
    </Layout>
  );
}
