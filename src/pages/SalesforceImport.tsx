import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, BookMarked, CheckCircle2, XCircle, SkipForward, Info, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Build the bookmarklet code ─────────────────────────────────────────────────
// This runs in the Salesforce page context (same origin), so the Salesforce API
// call is authenticated automatically via the existing browser session.
function buildBookmarklet(appOrigin: string, token: string): string {
  const fn = `async function(appOrigin,token){
  var SF_API='/services/data/v59.0/analytics/reports/';
  var m=window.location.href.match(/Report\\/([A-Z0-9a-z]+)\\//);
  if(!m){alert('❌ افتح صفحة تقرير Salesforce أولاً');return;}
  var reportId=m[1];
  var div=document.createElement('div');
  div.style='position:fixed;top:20px;right:20px;z-index:99999;background:#1e293b;color:#e2e8f0;padding:18px 24px;border-radius:14px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;box-shadow:0 8px 30px rgba(0,0,0,.5);direction:rtl;min-width:240px';
  div.innerHTML='⏳ جاري جلب البيانات من Salesforce...';
  document.body.appendChild(div);
  try{
    var r=await fetch(SF_API+reportId+'?includeDetails=true',{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('Salesforce API: '+r.status);
    var d=await r.json();
    var cols=(d.reportMetadata||{}).detailColumns||[];
    var colInfo=((d.reportExtendedMetadata||{}).detailColumnInfo)||{};
    var labels=cols.map(function(c){return((colInfo[c]||{}).label||c).toLowerCase()});
    var fi=function(){for(var i=0;i<arguments.length;i++){var idx=labels.findIndex(function(l){return l.indexOf(arguments[i])>=0});if(idx>=0)return idx;}return-1};
    var iCase=fi('case number','case no','number');
    var iUnit=fi('unit','وحدة');
    var iAcc=fi('account name','account','اسم الحساب','اسم');
    var iDate=fi('opened date','open date','تاريخ');
    var iDesc=fi('description','وصف');
    var rows=[];
    var fm=d.factMap||{};
    Object.keys(fm).forEach(function(k){
      var g=fm[k];if(!g.rows)return;
      g.rows.forEach(function(row){
        var c=row.dataCells||[];
        var get=function(i){return i>=0&&c[i]?(c[i].label||''):'';};
        rows.push({caseNumber:get(iCase),unit:get(iUnit),accountName:get(iAcc),openedDate:get(iDate),description:get(iDesc)});
      });
    });
    if(!rows.length){div.innerHTML='⚠️ لم يتم العثور على بيانات في التقرير';setTimeout(function(){div.remove()},4000);return;}
    div.innerHTML='⏳ تم جلب '+rows.length+' سجل... جاري الإرسال للنظام';
    var resp=await fetch(appOrigin+'/api/salesforce/import',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({rows:rows})
    });
    if(!resp.ok)throw new Error('Server error: '+resp.status);
    var res=await resp.json();
    div.style.background=res.added>0?'#14532d':'#1e293b';
    div.innerHTML='✅ اكتمل الاستيراد!<br>➕ تذاكر جديدة: <b>'+res.added+'</b><br>⏭️ مكررة: <b>'+res.skipped+'</b>'+(res.errors&&res.errors.length?'<br>⚠️ أخطاء: '+res.errors.length:'');
    setTimeout(function(){div.remove()},8000);
  }catch(e){
    div.style.background='#7f1d1d';
    div.innerHTML='❌ خطأ: '+e.message;
    setTimeout(function(){div.remove()},6000);
  }
}`;

  return `javascript:(${fn})('${appOrigin}','${token}')`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function SalesforceImport() {
  const [bookmarkletHref, setBookmarkletHref] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';
    setBookmarkletHref(buildBookmarklet(window.location.origin, token));
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleRegenerate = () => {
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';
    setBookmarkletHref(buildBookmarklet(window.location.origin, token));
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8" dir="rtl">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <CloudLightning className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">استيراد من Salesforce</h1>
            <p className="text-sm text-muted-foreground mt-0.5">اجلب التذاكر مباشرة من تقرير Salesforce بنقرة واحدة</p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-muted/30 border border-border/50 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            كيف يشتغل؟
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">١.</span>
              <span>اسحب الزرار أدناه إلى شريط المفضلة في Chrome <span className="text-muted-foreground/60">(مرة واحدة فقط)</span></span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">٢.</span>
              <span>افتح أي تقرير Salesforce يحتوي على Cases</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">٣.</span>
              <span>اضغط <b className="text-foreground">استيراد رتال</b> في المفضلة — التذاكر تظهر فوراً</span>
            </div>
          </div>
        </div>

        {/* Bookmarklet drag zone */}
        <div className="border-2 border-dashed border-blue-500/30 rounded-2xl p-6 text-center space-y-4 bg-blue-500/5">
          <p className="text-sm text-muted-foreground">اسحب الزرار ده لشريط المفضلة</p>

          {bookmarkletHref ? (
            <a
              ref={linkRef}
              href={bookmarkletHref}
              onClick={e => e.preventDefault()} // prevent accidental run here
              className={cn(
                'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm cursor-grab active:cursor-grabbing select-none',
                'bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors',
                'border-2 border-blue-500 drag:opacity-80',
              )}
              draggable
              title="اسحب هذا الزرار لشريط المفضلة"
            >
              <BookMarked className="w-4 h-4" />
              استيراد رتال
            </a>
          ) : (
            <div className="w-32 h-10 bg-muted/50 rounded-xl animate-pulse mx-auto" />
          )}

          <p className="text-xs text-muted-foreground/60">
            * لو التوكن انتهى، اضغط <button onClick={handleRegenerate} className="text-blue-400 underline underline-offset-2">تجديد</button> وأعد سحب الزرار
          </p>
        </div>

        {/* Steps detail */}
        <div className="grid gap-3">
          {[
            {
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
              title: 'تذاكر جديدة',
              desc: 'يتم إنشاؤها تلقائياً مع ربطها بالعميل والمشروع الصحيح',
            },
            {
              icon: <SkipForward className="w-4 h-4 text-amber-400" />,
              title: 'تذاكر مكررة',
              desc: 'يتم تخطيها بناءً على رقم الـ Case — لا تكرار',
            },
            {
              icon: <XCircle className="w-4 h-4 text-red-400" />,
              title: 'وحدات غير معروفة',
              desc: 'لو المشروع أو الفيلا مش موجودة في النظام، يظهر تنبيه',
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-4 bg-muted/20 border border-border/40 rounded-xl">
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div>
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Regenerate token button */}
        <div className="pt-2 border-t border-border/30">
          <button
            onClick={handleRegenerate}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تجديد رمز الجلسة في الـ Bookmarklet
          </button>
          <p className="text-xs text-muted-foreground/50 mt-1.5">
            بعد التجديد، أعد سحب الزرار لشريط المفضلة ليُحدَّث
          </p>
        </div>

      </div>
    </Layout>
  );
}
