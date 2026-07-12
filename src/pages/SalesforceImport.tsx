import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, BookMarked, CheckCircle2, XCircle, SkipForward, Info, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Bookmarklet builder ────────────────────────────────────────────────────────
// Runs inside the Salesforce page (same-origin) → no SF credentials needed.
// Parses the Analytics API response, sends rows to our server.
function buildBookmarklet(appOrigin: string, token: string): string {
  // Minified self-contained IIFE — no external deps
  const fn = `async function(O,T){
  var m=window.location.href.match(/Report\\/([A-Za-z0-9]+)\\//);
  if(!m){alert('❌ افتح صفحة تقرير Salesforce أولاً');return;}
  var rid=m[1];
  var el=document.createElement('div');
  el.style='position:fixed;top:20px;right:20px;z-index:99999;background:#1e293b;color:#e2e8f0;padding:16px 22px;border-radius:14px;font-family:Arial,sans-serif;font-size:13px;line-height:1.8;box-shadow:0 8px 32px rgba(0,0,0,.55);direction:rtl;min-width:250px;max-width:340px';
  el.innerHTML='⏳ جاري جلب البيانات من Salesforce...';
  document.body.appendChild(el);
  var upd=function(html,bg){el.innerHTML=html;if(bg)el.style.background=bg;};
  try{
    /* ── 1. Fetch report via SF Analytics API ── */
    var resp=await fetch('/services/data/v59.0/analytics/reports/'+rid+'?includeDetails=true',{headers:{Accept:'application/json'}});
    if(!resp.ok)throw new Error('Salesforce API: HTTP '+resp.status);
    var data=await resp.json();

    /* ── 2. Map column labels to indices ── */
    var cols=(data.reportMetadata||{}).detailColumns||[];
    var info=((data.reportExtendedMetadata||{}).detailColumnInfo)||{};
    var lbls=cols.map(function(c){return((info[c]||{}).label||c).toLowerCase();});
    var fi=function(){
      var keys=Array.prototype.slice.call(arguments);
      for(var a=0;a<keys.length;a++){
        var kw=keys[a];
        for(var j=0;j<lbls.length;j++){if(lbls[j].indexOf(kw)>=0)return j;}
      }
      return -1;
    };
    var iCase  =fi('case number','case no','number');
    var iUnit  =fi('unit','وحدة');
    var iAcc   =fi('account name','account','اسم الحساب','اسم');
    var iDate  =fi('opened date','open date','created date','تاريخ');
    var iDesc  =fi('description','وصف');
    var iStatus=fi('status','case status','حالة');

    /* ── 3. Collect rows from factMap ── */
    var rows=[];
    var fm=data.factMap||{};
    Object.keys(fm).forEach(function(k){
      var g=fm[k];
      if(!g||!g.rows)return;
      g.rows.forEach(function(r){
        var c=r.dataCells||[];
        var get=function(i){return(i>=0&&c[i])?(c[i].label||''):'';};
        var cn=get(iCase);
        if(!cn)return; // skip empty rows
        rows.push({
          caseNumber: cn,
          unit:        get(iUnit),
          accountName: get(iAcc),
          openedDate:  get(iDate),
          description: get(iDesc),
          status:      get(iStatus)
        });
      });
    });

    if(!rows.length){
      upd('⚠️ لم يتم العثور على بيانات في التقرير');
      setTimeout(function(){el.remove();},5000);
      return;
    }

    upd('⏳ تم جلب <b>'+rows.length+'</b> سجل...<br>جاري المزامنة مع النظام');

    /* ── 4. POST to our server ── */
    var sr=await fetch(O+'/api/salesforce/import',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+T},
      body:JSON.stringify({rows:rows})
    });
    if(!sr.ok)throw new Error('Server: HTTP '+sr.status);
    var res=await sr.json();

    var bg=res.added>0?'#14532d':(res.updated>0?'#1e3a5f':'#1e293b');
    var html='✅ اكتملت المزامنة!<br>';
    html+='<span style="color:#86efac">➕ جديدة: <b>'+res.added+'</b></span><br>';
    html+='<span style="color:#93c5fd">🔄 مُحدَّثة: <b>'+res.updated+'</b></span><br>';
    html+='<span style="color:#94a3b8">⏭️ مطابقة: <b>'+res.skipped+'</b></span>';
    if(res.errors&&res.errors.length){
      html+='<br><span style="color:#fca5a5">⚠️ أخطاء: '+res.errors.length+'</span>';
    }
    upd(html,bg);
    setTimeout(function(){el.remove();},10000);

  }catch(e){
    upd('❌ خطأ: '+e.message,'#7f1d1d');
    setTimeout(function(){el.remove();},7000);
  }
}`;

  return `javascript:(${fn})('${appOrigin}','${token}')`;
}

// ── Page component ─────────────────────────────────────────────────────────────
export default function SalesforceImport() {
  const [bookmarkletHref, setBookmarkletHref] = useState('');
  const linkRef = useRef<HTMLAnchorElement>(null);

  const generateHref = () => {
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';
    setBookmarkletHref(buildBookmarklet(window.location.origin, token));
  };

  useEffect(() => { generateHref(); }, []);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8" dir="rtl">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <CloudLightning className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">مزامنة Salesforce</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              استيراد ومزامنة التذاكر مباشرة من تقارير Salesforce
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-muted/30 border border-border/50 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            كيف يشتغل؟
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            {[
              'اسحب الزرار أدناه إلى شريط المفضلة في Chrome (مرة واحدة فقط)',
              'افتح أي تقرير Salesforce يحتوي على Cases',
              'اضغط "مزامنة رتال" — يظهر ملخص فوراً بدون أي تدخل',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Drag zone */}
        <div className="border-2 border-dashed border-blue-500/30 rounded-2xl p-8 text-center space-y-5 bg-blue-500/5">
          <p className="text-sm text-muted-foreground">اسحب الزرار لشريط المفضلة</p>

          {bookmarkletHref ? (
            <a
              ref={linkRef}
              href={bookmarkletHref}
              onClick={e => e.preventDefault()}
              draggable
              title="اسحب لشريط المفضلة"
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
            <button onClick={generateHref} className="text-blue-400 underline underline-offset-2">
              جدّد الزرار
            </button>
            {' '}وأعد سحبه
          </p>
        </div>

        {/* Behaviour cards */}
        <div className="grid gap-3">
          {[
            {
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
              title: 'تذاكر جديدة — تُضاف فوراً',
              desc: 'تتصنف تلقائياً بالكلمات المفتاحية، والـ AI يكمّل التصنيف في الخلفية',
              color: 'border-emerald-500/20',
            },
            {
              icon: <ArrowRightLeft className="w-4 h-4 text-blue-400" />,
              title: 'تذاكر موجودة — تُزامَن الحالة',
              desc: 'لو أُغلقت في Salesforce وعندنا مفتوحة → تُغلق تلقائياً',
              color: 'border-blue-500/20',
            },
            {
              icon: <SkipForward className="w-4 h-4 text-amber-400" />,
              title: 'تذاكر متطابقة — تُتخطى',
              desc: 'مفيش تعديل لو الحالة واحدة في الطرفين',
              color: 'border-amber-500/20',
            },
            {
              icon: <XCircle className="w-4 h-4 text-red-400" />,
              title: 'أرقام التذاكر — بدون أصفار يسار',
              desc: '"00197089" تُحفظ كـ "197089" — نفس منطق الاستيراد العادي',
              color: 'border-red-500/20',
            },
          ].map((item, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-3 p-4 bg-muted/20 border rounded-xl',
                item.color,
              )}
            >
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div>
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Regenerate */}
        <div className="pt-2 border-t border-border/30">
          <button
            onClick={generateHref}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تجديد رمز الجلسة
          </button>
          <p className="text-xs text-muted-foreground/50 mt-1">
            بعد التجديد أعد سحب الزرار لشريط المفضلة ليُحدَّث
          </p>
        </div>

      </div>
    </Layout>
  );
}
