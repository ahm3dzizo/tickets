import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { CloudLightning, BookMarked, CheckCircle2, XCircle, SkipForward, Info, RefreshCw, ArrowRightLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Bookmarklet builder ────────────────────────────────────────────────────────
function buildBookmarklet(appOrigin: string, token: string): string {
  const fn = `async function(O,T){
  var el=null;
  var upd=function(html,bg){
    if(el){el.innerHTML=html;if(bg)el.style.background=bg;}
    else alert(html.replace(/<[^>]+>/g,''));
  };
  try{
    el=document.createElement('div');
    el.setAttribute('style','all:initial;position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;background:#1e293b;color:#e2e8f0;padding:16px 22px;border-radius:14px;font-family:Arial,sans-serif;font-size:12px;line-height:1.8;box-shadow:0 8px 32px rgba(0,0,0,.55);direction:rtl;min-width:260px;max-width:400px;word-break:break-all');
    el.innerHTML='<b>مزامنة رتال</b><br>جاري البحث عن الجدول...';
    (document.body||document.documentElement).appendChild(el);
  }catch(e){el=null;}

  try{
    /* ── find report document (may be inside an iframe) ── */
    var searchDoc=document;
    try{
      var frames=document.querySelectorAll('iframe');
      for(var fi=0;fi<frames.length;fi++){
        var fsrc=frames[fi].src||'';
        if(fsrc.indexOf('lightningReport')>=0||fsrc.indexOf('reportId')>=0||fsrc.indexOf('force.com')>=0){
          var fd=frames[fi].contentDocument||(frames[fi].contentWindow&&frames[fi].contentWindow.document);
          if(fd&&fd.querySelectorAll('table').length){searchDoc=fd;break;}
        }
      }
    }catch(e){}

    /* ── read "Total Records: N" from page ── */
    var totalExpected=0;
    try{
      var pageText=(searchDoc.body||document.body).innerText||'';
      var tm=pageText.match(/Total Records[\\s\\S]{0,10}(\\d+)/i)||pageText.match(/(\\d+)\\s*records?/i);
      if(tm)totalExpected=parseInt(tm[1],10);
    }catch(e){}
    console.log('[retal] totalExpected=',totalExpected);

    /* ── pick the biggest table ── */
    function getBiggestTable(doc){
      var tables=Array.from(doc.querySelectorAll('table'));
      var best=null,maxR=0;
      tables.forEach(function(t){var n=t.querySelectorAll('tr').length;if(n>maxR){maxR=n;best=t;}});
      return{table:best,rows:maxR};
    }
    var res=getBiggestTable(searchDoc);
    var dataTable=res.table,maxR=res.rows;
    if(!dataTable||maxR<2){upd('❌ لم يُعثر على جدول','#7f1d1d');setTimeout(function(){if(el)el.remove();},9000);return;}

    /* ── find scrollable container for the table ── */
    function findScroller(node){
      var cur=node.parentElement;
      while(cur&&cur!==document.body){
        var ov=window.getComputedStyle(cur).overflowY||'';
        if(ov==='auto'||ov==='scroll')return cur;
        cur=cur.parentElement;
      }
      return null;
    }
    /* try both docs */
    var scroller=findScroller(dataTable);
    if(!scroller&&searchDoc!==document){
      try{
        var win2=searchDoc.defaultView||searchDoc.parentWindow;
        if(win2&&win2.getComputedStyle){
          var cur2=dataTable.parentElement;
          while(cur2&&cur2!==searchDoc.body){
            var ov2=win2.getComputedStyle(cur2).overflowY||'';
            if(ov2==='auto'||ov2==='scroll'){scroller=cur2;break;}
            cur2=cur2.parentElement;
          }
        }
      }catch(e){}
    }
    console.log('[retal] scroller=',scroller?scroller.tagName+'.'+scroller.className.slice(0,30):'none');

    /* ── auto-scroll to load all virtual rows ── */
    function scrollAndWait(done){
      if(!scroller||!totalExpected){done();return;}
      var attempts=0,prevCount=0,staleRuns=0;
      function step(){
        scroller.scrollTop=scroller.scrollHeight;
        setTimeout(function(){
          var cur=dataTable.querySelectorAll('tbody tr').length;
          attempts++;
          upd('<b>مزامنة رتال</b><br>جاري التحميل... '+cur+' / '+totalExpected+' صف<br><small>الرجاء الانتظار</small>');
          if(cur>=totalExpected||attempts>=60||(cur===prevCount&&++staleRuns>=5)){
            scroller.scrollTop=0;
            setTimeout(done,300);
          } else {
            if(cur>prevCount)staleRuns=0;
            prevCount=cur;
            setTimeout(step,400);
          }
        },400);
      }
      step();
    }

    scrollAndWait(function(){

      /* ── re-find biggest table after scroll (rows may have changed) ── */
      var res2=getBiggestTable(searchDoc);
      if(res2.rows>maxR){dataTable=res2.table;maxR=res2.rows;}

      /* ── extract column header text ── */
      function headerText(c){
        var titled=c.querySelector('span[title]:not([aria-hidden="true"]),a[title]:not([aria-hidden="true"])');
        if(titled){var t=(titled.getAttribute('title')||'').trim();if(t&&t.length<80)return t;}
        var dir='';c.childNodes.forEach(function(n){if(n.nodeType===3)dir+=n.textContent;});dir=dir.trim();if(dir)return dir;
        var kids=Array.from(c.children);
        for(var ki=0;ki<kids.length;ki++){
          var k=kids[ki];if(k.tagName==='BUTTON')continue;if(k.getAttribute('aria-hidden')==='true')continue;
          var kt=(k.textContent||'').replace(/[\\u25b2\\u25bc\\u2191\\u2193]/g,'').replace(/\\s+/g,' ').trim();
          if(kt&&kt.length<80)return kt;
        }
        return(c.textContent||'').replace(/[\\u25b2\\u25bc\\u2191\\u2193]/g,'').replace(/\\s+/g,' ').trim().slice(0,60);
      }
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

      /* ── collect all tbody row texts ── */
      var allRowTexts=[];
      dataTable.querySelectorAll('tbody tr').forEach(function(tr){
        var cells=tr.querySelectorAll('td');if(!cells.length)return;
        var texts=Array.from(cells).map(function(c){return(c.textContent||c.innerText||'').trim().replace(/\\s+/g,' ');});
        allRowTexts.push(texts);
      });
      console.log('[retal] tbody rows after scroll:',allRowTexts.length);

      /* ── pattern-based fallback if headers gave -1 ── */
      if(iCase<0||iUnit<0){
        for(var ri=0;ri<allRowTexts.length;ri++){
          var rr=allRowTexts[ri];
          for(var ci2=0;ci2<rr.length;ci2++){
            if(iCase<0&&casePat.test(rr[ci2].replace(/\\s/g,'')))iCase=ci2;
            if(iUnit<0&&unitPat.test(rr[ci2]))iUnit=ci2;
          }
          if(iCase>=0&&iUnit>=0)break;
        }
      }
      if(iCase<0){upd('❌ عمود رقم الحالة غير موجود<br>'+headers.slice(0,5).join(' | '),'#7f1d1d');setTimeout(function(){if(el)el.remove();},12000);return;}

      /* ── build rows ── */
      var rows=[];
      allRowTexts.forEach(function(texts){
        function get(i){return(i>=0&&i<texts.length)?texts[i]:'';}
        var cn=get(iCase);if(!cn||cn==='-'||cn==='\\u2014'||cn==='')return;
        var unitVal=get(iUnit);
        if(!unitPat.test(unitVal)){for(var ci3=0;ci3<texts.length;ci3++){if(unitPat.test(texts[ci3])){unitVal=texts[ci3];break;}}}
        rows.push({caseNumber:cn,unit:unitVal,accountName:get(iAcc),openedDate:get(iDate),description:get(iDesc),status:get(iStatus),phone:get(iPhone)});
      });
      console.log('[retal] extracted rows:',rows.length,rows[0]);

      if(!rows.length){upd('⚠️ لا توجد صفوف بيانات<br>case='+iCase+' unit='+iUnit+' scanned='+allRowTexts.length,'#78350f');setTimeout(function(){if(el)el.remove();},12000);return;}

      /* ── relay via URL hash ── */
      var encoded;
      try{encoded=btoa(unescape(encodeURIComponent(JSON.stringify(rows))));}
      catch(e){encoded=btoa(JSON.stringify(rows).replace(/[^\\x00-\\x7F]/g,'?'));}
      upd('✅ تم قراءة <b>'+rows.length+'</b> سجل<br>جاري فتح التطبيق...');
      window.open(O+'/salesforce-import#sf'+encoded,'_blank');
      setTimeout(function(){if(el)el.remove();},4000);

    }); /* end scrollAndWait */

  }catch(e){
    console.error('[retal]',e);
    upd('❌ خطأ: '+e.message,'#7f1d1d');
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
