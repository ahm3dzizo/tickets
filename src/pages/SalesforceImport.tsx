import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, BookMarked, CheckCircle2, XCircle, SkipForward, Info, RefreshCw, ArrowRightLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Bookmarklet builder ────────────────────────────────────────────────────────
function buildBookmarklet(appOrigin: string, token: string): string {
  const fn = `async function(O,T){
  var el=null;
  var upd=function(msg,bg){
    if(el){el.innerHTML=msg;if(bg)el.style.background=bg;}
    else alert(msg.replace(/<[^>]+>/g,''));
  };
  try{
    el=document.createElement('div');
    el.setAttribute('style','all:initial;position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;background:#1e293b;color:#e2e8f0;padding:16px 22px;border-radius:14px;font-family:Arial,sans-serif;font-size:12px;line-height:1.8;box-shadow:0 8px 32px rgba(0,0,0,.55);direction:rtl;min-width:260px;max-width:400px;word-break:break-all');
    el.innerHTML='<b>\\u0645\\u0632\\u0627\\u0645\\u0646\\u0629 \\u0631\\u062a\\u0627\\u0644</b><br>\\u062c\\u0627\\u0631\\u064a \\u0627\\u0644\\u0628\\u062d\\u062b \\u0639\\u0646 \\u0627\\u0644\\u062c\\u062f\\u0648\\u0644...';
    (document.body||document.documentElement).appendChild(el);
  }catch(e){el=null;}

  try{
    /* ── find report document (may be inside an iframe) ── */
    var searchDoc=document;
    var reportIframe=null;
    try{
      var frames=document.querySelectorAll('iframe');
      for(var fi=0;fi<frames.length;fi++){
        var fsrc=frames[fi].src||'';
        if(fsrc.indexOf('lightningReport')>=0||fsrc.indexOf('reportId')>=0||fsrc.indexOf('force.com')>=0){
          var fd=frames[fi].contentDocument||(frames[fi].contentWindow&&frames[fi].contentWindow.document);
          if(fd&&fd.querySelectorAll('table').length){searchDoc=fd;reportIframe=frames[fi];break;}
        }
      }
    }catch(e){}

    /* ── read "Total Records: N" ── */
    var totalExpected=0;
    try{
      var pageText=(searchDoc.body||document.body).innerText||'';
      var patterns=[
        /Total\\s+Records\\s*[:\\n\\r]\\s*(\\d+)/i,
        /Total\\s+Records[^\\d]{0,5}(\\d{2,})/i,
        /(\\d{2,})\\s*\\n?\\s*Total\\s+Records/i,
        /Showing\\s+\\d+\\s*[-\\u2013]\\s*\\d+\\s+of\\s+(\\d+)/i
      ];
      for(var pi=0;pi<patterns.length;pi++){
        var tm=pageText.match(patterns[pi]);
        if(tm){var n=parseInt(tm[1],10);if(n>1){totalExpected=n;break;}}
      }
    }catch(e){}
    console.log('[retal] totalExpected=',totalExpected);

    /* ── pick the biggest table ── */
    function getBiggestTable(doc){
      var tables=Array.from(doc.querySelectorAll('table'));
      var best=null,maxR=0;
      tables.forEach(function(t){var c=t.querySelectorAll('tr').length;if(c>maxR){maxR=c;best=t;}});
      return{table:best,rows:maxR};
    }
    var res=getBiggestTable(searchDoc);
    var dataTable=res.table;
    if(!dataTable||res.rows<2){
      upd('\\u274c \\u0644\\u0645 \\u064a\\u064f\\u0639\\u062b\\u0631 \\u0639\\u0644\\u0649 \\u062c\\u062f\\u0648\\u0644','#7f1d1d');
      setTimeout(function(){if(el)el.remove();},9000);return;
    }

    /* ── helpers: get win + find scrollers from element ── */
    var sfWin=searchDoc!==document?(searchDoc.defaultView||searchDoc.parentWindow):window;

    function findScrollers(fromEl){
      var list=[];
      try{
        var c=fromEl.parentElement;
        while(c&&c!==searchDoc.body){
          try{
            var ov=(sfWin&&sfWin.getComputedStyle?sfWin:window).getComputedStyle(c).overflowY||'';
            if(ov==='auto'||ov==='scroll')list.push(c);
          }catch(e){}
          c=c.parentElement;
        }
      }catch(e){}
      return list;
    }
    var scrollers=findScrollers(dataTable);
    console.log('[retal] scrollers:',scrollers.length);

    /* ── extract column header text ── */
    function headerText(c){
      var titled=c.querySelector('span[title]:not([aria-hidden="true"]),a[title]:not([aria-hidden="true"])');
      if(titled){var t=(titled.getAttribute('title')||'').trim();if(t&&t.length<80)return t;}
      var dir='';c.childNodes.forEach(function(nd){if(nd.nodeType===3)dir+=nd.textContent;});
      dir=dir.trim();if(dir)return dir;
      var kids=Array.from(c.children);
      for(var ki=0;ki<kids.length;ki++){
        var k=kids[ki];
        if(k.tagName==='BUTTON'||k.getAttribute('aria-hidden')==='true')continue;
        var kt=(k.textContent||'').replace(/[\\u25b2\\u25bc\\u2191\\u2193]/g,'').replace(/\\s+/g,' ').trim();
        if(kt&&kt.length<80)return kt;
      }
      return(c.textContent||'').replace(/[\\u25b2\\u25bc\\u2191\\u2193]/g,'').replace(/\\s+/g,' ').trim().slice(0,60);
    }

    /* ── read headers BEFORE scrolling ── */
    var headers=[];
    var hcells=dataTable.querySelectorAll('thead th,thead td');
    if(!hcells.length)hcells=dataTable.querySelectorAll('tr:first-child th,tr:first-child td');
    hcells.forEach(function(c){headers.push(headerText(c).toLowerCase().replace(/\\s+/g,' '));});
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
    var iCase=col('case number','case no','case#','\\u0631\\u0642\\u0645 \\u0627\\u0644\\u062d\\u0627\\u0644\\u0629');
    var iUnit=col('unit number','unit no','unit','villa','property','\\u0648\\u062d\\u062f\\u0629','\\u0641\\u064a\\u0644\\u0627');
    var iAcc=col('account name','account','client name','\\u0627\\u0633\\u0645 \\u0627\\u0644\\u0639\\u0645\\u064a\\u0644');
    var iDate=col('date/time opened','opened date','open date','opened','created','date','\\u062a\\u0627\\u0631\\u064a\\u062e');
    var iDesc=col('description','subject','\\u0648\\u0635\\u0641');
    var iStatus=col('status','\\u062d\\u0627\\u0644\\u0629');
    var iPhone=col('person account: mobile','person account mobile','mobile phone','mobile','phone','\\u062c\\u0648\\u0627\\u0644','\\u0647\\u0627\\u062a\\u0641');
    console.log('[retal] cols: case='+iCase+' unit='+iUnit+' acc='+iAcc+' date='+iDate+' phone='+iPhone);

    /* ── pattern fallback from first visible rows if headers gave -1 ── */
    if(iCase<0||iUnit<0){
      var sample=dataTable.querySelectorAll('tbody tr');
      for(var ri=0;ri<sample.length;ri++){
        var cells0=sample[ri].querySelectorAll('td');
        for(var ci0=0;ci0<cells0.length;ci0++){
          var tv=(cells0[ci0].textContent||'').trim().replace(/\\s+/g,' ');
          if(iCase<0&&casePat.test(tv.replace(/\\s/g,'')))iCase=ci0;
          if(iUnit<0&&unitPat.test(tv))iUnit=ci0;
        }
        if(iCase>=0&&iUnit>=0)break;
      }
    }
    if(iCase<0){
      upd('\\u274c \\u0639\\u0645\\u0648\\u062f \\u0631\\u0642\\u0645 \\u0627\\u0644\\u062d\\u0627\\u0644\\u0629 \\u063a\\u064a\\u0631 \\u0645\\u0648\\u062c\\u0648\\u062f<br>'+headers.slice(0,6).join(' | '),'#7f1d1d');
      setTimeout(function(){if(el)el.remove();},12000);return;
    }

    /* ─────────────────────────────────────────────────────────────────────────
       BATCH COLLECT
       SF Lightning virtual-scroll: only ~13 rows in DOM at a time.
       Scrolling shifts WHICH rows are rendered. We collect & deduplicate by
       case# after each scroll step.

       Scroll strategies (rotate every step):
         0 — scrollIntoView(last row, block:start) + scrollTop += BIG
         1 — scrollIntoView(last row, block:center)
         2 — BOUNCE: scroll up 300px then down 600px (re-triggers IntersectionObserver)
         3 — keyboard PageDown on scroll container + scrollTop max
    ───────────────────────────────────────────────────────────────────────── */
    var allRowMap={};

    function collectVisible(){
      /* re-find live table (SF may swap table nodes during virtual-scroll) */
      var fr=getBiggestTable(searchDoc);
      if(fr.table&&fr.rows>1)dataTable=fr.table;

      dataTable.querySelectorAll('tbody tr').forEach(function(tr){
        var cells=tr.querySelectorAll('td');if(!cells.length)return;
        var texts=Array.from(cells).map(function(c){
          return(c.textContent||c.innerText||'').trim().replace(/\\s+/g,' ');
        });
        var key=(iCase>=0&&iCase<texts.length)?texts[iCase].replace(/\\s/g,''):'';
        if(key&&key!=='-'&&key!=='\\u2014')allRowMap[key]=texts;
      });
    }

    collectVisible();

    var noNewCount=0;
    var stepNum=0;
    var MAX_NO_NEW=16;

    function doScroll(strategy){
      /* re-find scrollers in case SF changed DOM structure */
      var fresh=findScrollers(dataTable);
      if(fresh.length>0)scrollers=fresh;

      var trs=dataTable.querySelectorAll('tbody tr');
      var lastRow=trs.length?trs[trs.length-1]:null;
      var sc=scrollers.length?scrollers[scrollers.length-1]:null; /* deepest scroller */
      var sc0=scrollers.length?scrollers[0]:null;                 /* outermost scroller */

      if(strategy===2){
        /* BOUNCE: scroll up then down — re-triggers IntersectionObserver */
        if(sc){var orig=sc.scrollTop;sc.scrollTop=Math.max(0,orig-300);}
        if(sc0&&sc0!==sc){var orig0=sc0.scrollTop;sc0.scrollTop=Math.max(0,orig0-300);}
        try{if(sfWin)sfWin.scrollBy(0,-300);}catch(e){}
        setTimeout(function(){
          if(sc)sc.scrollTop+=(sc.scrollHeight||9999);
          if(sc0&&sc0!==sc)sc0.scrollTop+=(sc0.scrollHeight||9999);
          try{if(sfWin)sfWin.scrollBy(0,600);}catch(e){}
          if(lastRow)lastRow.scrollIntoView({behavior:'instant',block:'start'});
        },250);

      }else if(strategy===3){
        /* KEYBOARD: dispatch PageDown on the focused scroll container */
        try{
          var target=sc||searchDoc.body;
          target.focus();
          ['keydown','keypress','keyup'].forEach(function(etype){
            target.dispatchEvent(new KeyboardEvent(etype,{key:'PageDown',keyCode:34,which:34,bubbles:true,cancelable:true}));
          });
        }catch(e){}
        if(sc)sc.scrollTop=sc.scrollHeight;
        if(sc0&&sc0!==sc)sc0.scrollTop=sc0.scrollHeight;
        if(lastRow)lastRow.scrollIntoView({behavior:'instant',block:'end'});

      }else if(strategy===1){
        /* CENTER: put last row in center of viewport */
        if(lastRow)lastRow.scrollIntoView({behavior:'instant',block:'center'});
        if(sc)sc.scrollTop+=600;
        if(sc0&&sc0!==sc)sc0.scrollTop+=600;

      }else{
        /* DEFAULT: push last row to top + big scrollTop bump */
        if(lastRow)lastRow.scrollIntoView({behavior:'instant',block:'start'});
        if(sc)sc.scrollTop+=800;
        if(sc0&&sc0!==sc)sc0.scrollTop+=800;
        try{if(sfWin)sfWin.scrollBy(0,800);}catch(e){}
      }
    }

    function batchStep(){
      var prevCount=Object.keys(allRowMap).length;
      var strategy=stepNum%4;
      stepNum++;

      doScroll(strategy);

      var delay=(strategy===2)?1400:1100;
      setTimeout(function(){
        collectVisible();
        var newCount=Object.keys(allRowMap).length;
        if(newCount===prevCount)noNewCount++;else noNewCount=0;

        upd('<b>\\u0645\\u0632\\u0627\\u0645\\u0646\\u0629 \\u0631\\u062a\\u0627\\u0644</b><br>\\u062c\\u0627\\u0631\\u064a \\u0627\\u0644\\u062a\\u062d\\u0645\\u064a\\u0644... '+newCount+(totalExpected?' / '+totalExpected:'')+' \\u0635\\u0641<br><small>strategy='+strategy+' noNew='+noNewCount+'</small>');
        console.log('[retal] collected='+newCount+' strategy='+strategy+' noNew='+noNewCount);

        var done=(totalExpected>0&&newCount>=totalExpected)||noNewCount>=MAX_NO_NEW;
        if(done){
          for(var si2=0;si2<scrollers.length;si2++){try{scrollers[si2].scrollTop=0;}catch(e){}}
          try{if(sfWin)sfWin.scrollTo(0,0);}catch(e){}
          buildAndSend();
        }else{
          setTimeout(batchStep,200);
        }
      },delay);
    }

    function buildAndSend(){
      var allRowTexts=Object.values(allRowMap);
      console.log('[retal] total collected:',allRowTexts.length);

      var rows=[];
      allRowTexts.forEach(function(texts){
        function get(i){return(i>=0&&i<texts.length)?texts[i]:'';}
        var cn=get(iCase);if(!cn||cn==='-'||cn==='\\u2014'||cn==='')return;
        var unitVal=get(iUnit);
        if(!unitPat.test(unitVal)){
          for(var ci3=0;ci3<texts.length;ci3++){if(unitPat.test(texts[ci3])){unitVal=texts[ci3];break;}}
        }
        rows.push({caseNumber:cn,unit:unitVal,accountName:get(iAcc),openedDate:get(iDate),description:get(iDesc),status:get(iStatus),phone:get(iPhone)});
      });
      console.log('[retal] extracted rows:',rows.length,rows[0]);

      if(!rows.length){
        upd('\\u26a0\\ufe0f \\u0644\\u0627 \\u062a\\u0648\\u062c\\u062f \\u0635\\u0641\\u0648\\u0641 \\u0628\\u064a\\u0627\\u0646\\u0627\\u062a<br>case='+iCase+' unit='+iUnit,'#78350f');
        setTimeout(function(){if(el)el.remove();},12000);return;
      }

      var encoded;
      try{encoded=btoa(unescape(encodeURIComponent(JSON.stringify(rows))));}
      catch(e2){encoded=btoa(JSON.stringify(rows).replace(/[^\\x00-\\x7F]/g,'?'));}

      upd('\\u2705 \\u062a\\u0645 \\u0642\\u0631\\u0627\\u0621\\u0629 <b>'+rows.length+'</b> \\u0633\\u062c\\u0644<br>\\u062c\\u0627\\u0631\\u064a \\u0641\\u062a\\u062d \\u0627\\u0644\\u062a\\u0637\\u0628\\u064a\\u0642...');
      window.open(O+'/salesforce-import#sf'+encoded,'_blank');
      setTimeout(function(){if(el)el.remove();},4000);
    }

    setTimeout(batchStep,300);

  }catch(e){
    console.error('[retal]',e);
    upd('\\u274c \\u062e\\u0637\\u0623: '+e.message,'#7f1d1d');
    setTimeout(function(){if(el)el.remove();},9000);
  }
}`;

  return `javascript:void (${fn})('${appOrigin}','${token}')`;
}

type ImportResult = { added: number; updated: number; skipped: number; errors: string[]; total: number };

export default function SalesforceImport() {
  const [bookmarkletCode, setBookmarkletCode] = useState('');
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const generateHref = () => {
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';
    setBookmarkletCode(buildBookmarklet(window.location.origin, token));
  };

  useEffect(() => { generateHref(); }, []);

  useEffect(() => {
    if (linkRef.current && bookmarkletCode) {
      linkRef.current.setAttribute('href', bookmarkletCode);
    }
  }, [bookmarkletCode]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#sf')) return;
    window.history.replaceState(null, '', window.location.pathname);
    let rows: any[];
    try {
      rows = JSON.parse(decodeURIComponent(escape(atob(hash.slice(3)))));
    } catch { return; }
    if (!Array.isArray(rows) || rows.length === 0) return;
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';
    setImporting(true);
    fetch('/api/salesforce/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ rows }),
    })
      .then(r => r.json())
      .then((res: ImportResult) => { setImportResult(res); setImporting(false); })
      .catch(() => setImporting(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8" dir="rtl">

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <CloudLightning className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">مزامنة Salesforce</h1>
            <p className="text-sm text-muted-foreground mt-0.5">استيراد ومزامنة التذاكر مباشرة من تقارير Salesforce</p>
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
              'اضغط "مزامنة رتال" — يسكرول الجدول تلقائياً لتحميل كل الصفوف ثم يفتح التطبيق',
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
