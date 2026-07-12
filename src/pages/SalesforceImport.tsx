import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, BookMarked, CheckCircle2, XCircle, SkipForward, Info, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Bookmarklet builder ────────────────────────────────────────────────────────
// Scrapes the report TABLE from the DOM — avoids all Salesforce auth issues.
// The report renders inside a same-origin iframe (lightningReportApp.app).
function buildBookmarklet(appOrigin: string, token: string): string {
  const fn = `async function(O,T){
  var el=null;
  var upd=function(html,bg){
    if(el){el.innerHTML=html;if(bg)el.style.background=bg;}
    else alert(html.replace(/<[^>]+>/g,''));
  };
  try{
    el=document.createElement('div');
    el.setAttribute('style','all:initial;position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;background:#1e293b;color:#e2e8f0;padding:16px 22px;border-radius:14px;font-family:Arial,sans-serif;font-size:13px;line-height:1.8;box-shadow:0 8px 32px rgba(0,0,0,.55);direction:rtl;min-width:260px;max-width:360px');
    el.innerHTML='\\u23F3 \\u0645\\u0632\\u0627\\u0645\\u0646\\u0629 \\u0631\\u062A\\u0627\\u0644 \\u2014 \\u062C\\u0627\\u0631\\u064A \\u0627\\u0644\\u0642\\u0631\\u0627\\u0621\\u0629...';
    (document.body||document.documentElement).appendChild(el);
  }catch(e){el=null;}

  try{
    /* find the report iframe (lightningReportApp) — data lives there */
    var searchDoc=document;
    try{
      var iframes=document.querySelectorAll('iframe');
      for(var ii=0;ii<iframes.length;ii++){
        var isrc=iframes[ii].src||'';
        if(isrc.indexOf('lightningReport')>=0||isrc.indexOf('reportId')>=0){
          var fd=iframes[ii].contentDocument||(iframes[ii].contentWindow&&iframes[ii].contentWindow.document);
          if(fd){searchDoc=fd;break;}
        }
      }
    }catch(e){}
    console.log('[retal] doc='+(searchDoc===document?'main':'iframe'));

    /* pick the biggest table */
    var allTables=Array.from(searchDoc.querySelectorAll('table'));
    if(!allTables.length)allTables=Array.from(document.querySelectorAll('table'));
    console.log('[retal] tables:',allTables.length);
    var dataTable=null,maxR=0;
    allTables.forEach(function(t){var n=t.querySelectorAll('tr').length;if(n>maxR){maxR=n;dataTable=t;}});

    if(!dataTable||maxR<2){
      upd('\\u274C \\u0644\\u0645 \\u064A\\u062A\\u0645 \\u0627\\u0644\\u0639\\u062B\\u0648\\u0631 \\u0639\\u0644\\u0649 \\u062C\\u062F\\u0648\\u0644 (tables:'+allTables.length+' rows:'+maxR+')','#7f1d1d');
      setTimeout(function(){if(el)el.remove();},8000);
      return;
    }
    console.log('[retal] rows in table:',maxR);

    /* extract column headers */
    var headers=[];
    var hcells=dataTable.querySelectorAll('thead th,thead td');
    if(!hcells.length)hcells=dataTable.querySelectorAll('tr:first-child th,tr:first-child td');
    hcells.forEach(function(c){headers.push((c.textContent||'').trim().toLowerCase());});
    console.log('[retal] headers:',headers);

    var col=function(){
      var keys=Array.prototype.slice.call(arguments);
      for(var i=0;i<headers.length;i++)
        for(var j=0;j<keys.length;j++)
          if(headers[i].indexOf(keys[j])>=0)return i;
      return -1;
    };
    var iCase  =col('case number','case no','number','raqm','\\u0631\\u0642\\u0645');
    var iUnit  =col('unit','\\u0648\\u062D\\u062F\\u0629','villa');
    var iAcc   =col('account','client','\\u0627\\u0633\\u0645');
    var iDate  =col('opened','open date','created','\\u062A\\u0627\\u0631\\u064A\\u062E');
    var iDesc  =col('description','subject','\\u0648\\u0635\\u0641');
    var iStatus=col('status','\\u062D\\u0627\\u0644\\u0629');
    console.log('[retal] case='+iCase+' unit='+iUnit+' acc='+iAcc+' status='+iStatus);

    /* extract rows */
    var rows=[];
    dataTable.querySelectorAll('tbody tr').forEach(function(tr){
      var cells=tr.querySelectorAll('td');
      if(!cells.length)return;
      var get=function(i){
        if(i<0||i>=cells.length)return'';
        return(cells[i].textContent||cells[i].innerText||'').trim().replace(/\\s+/g,' ');
      };
      var cn=get(iCase);
      if(!cn||cn==='-'||cn==='\\u2014'||cn==='')return;
      rows.push({caseNumber:cn,unit:get(iUnit),accountName:get(iAcc),openedDate:get(iDate),description:get(iDesc),status:get(iStatus)});
    });
    console.log('[retal] rows:',rows.length,rows[0]);

    if(!rows.length){
      upd('\\u26A0\\uFE0F \\u0627\\u0644\\u062C\\u062F\\u0648\\u0644 \\u0641\\u0627\\u0631\\u063A \\u2014 headers: '+headers.slice(0,5).join(' | '));
      setTimeout(function(){if(el)el.remove();},8000);
      return;
    }

    upd('\\u23F3 \\u062A\\u0645 \\u0642\\u0631\\u0627\\u0621\\u0629 <b>'+rows.length+'</b> \\u0633\\u062C\\u0644...<br>\\u062C\\u0627\\u0631\\u064A \\u0627\\u0644\\u0625\\u0631\\u0633\\u0627\\u0644 \\u0644\\u0644\\u0646\\u0638\\u0627\\u0645');

    /* POST to our server */
    var sr=await fetch(O+'/api/salesforce/import',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+T},
      body:JSON.stringify({rows:rows})
    });
    if(!sr.ok){var eb='';try{eb=await sr.text();}catch(e){}throw new Error('Server '+sr.status+': '+eb.slice(0,80));}
    var res=await sr.json();
    console.log('[retal] result:',res);

    var bg=res.added>0?'#14532d':(res.updated>0?'#1e3a5f':'#1e293b');
    var html='\\u2705 \\u0627\\u0643\\u062A\\u0645\\u0644\\u062A \\u0627\\u0644\\u0645\\u0632\\u0627\\u0645\\u0646\\u0629!<br>';
    html+='<span style="color:#86efac">\\u2795 \\u062C\\u062F\\u064A\\u062F\\u0629: <b>'+res.added+'</b></span><br>';
    html+='<span style="color:#93c5fd">\\uD83D\\uDD04 \\u0645\\u064F\\u062D\\u062F\\u064E\\u062B\\u064E\\u0629: <b>'+res.updated+'</b></span><br>';
    html+='<span style="color:#94a3b8">\\u23ED\\uFE0F \\u0645\\u0637\\u0627\\u0628\\u0642\\u0629: <b>'+res.skipped+'</b></span>';
    if(res.errors&&res.errors.length)html+='<br><span style="color:#fca5a5">\\u26A0\\uFE0F \\u0623\\u062E\\u0637\\u0627\\u0621: '+res.errors.length+'</span>';
    upd(html,bg);
    setTimeout(function(){if(el)el.remove();},12000);

  }catch(e){
    console.error('[retal]',e);
    upd('\\u274C \\u062E\\u0637\\u0623: '+e.message,'#7f1d1d');
    setTimeout(function(){if(el)el.remove();},8000);
  }
}`;

  return `javascript:void (${fn})('${appOrigin}','${token}')`;
}

// ── Page component ─────────────────────────────────────────────────────────────
export default function SalesforceImport() {
  const [bookmarkletCode, setBookmarkletCode] = useState('');
  const linkRef = useRef<HTMLAnchorElement>(null);

  const generateHref = () => {
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';
    setBookmarkletCode(buildBookmarklet(window.location.origin, token));
  };

  useEffect(() => { generateHref(); }, []);

  // Set href directly on DOM node — React blocks javascript: URLs in the href prop
  useEffect(() => {
    if (linkRef.current && bookmarkletCode) {
      linkRef.current.setAttribute('href', bookmarkletCode);
    }
  }, [bookmarkletCode]);

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
