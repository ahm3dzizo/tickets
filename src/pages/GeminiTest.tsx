import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { classifyOnServer } from '@/services/classificationApi';
import { Sparkles, Zap, RefreshCw, CheckCircle2, XCircle, FlaskConical } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  plumbing: 'سباكة', electricity: 'كهرباء', doors_windows: 'أبواب ونوافذ',
  cracks: 'تشققات', ceramics: 'سيراميك', tank_insulation: 'عزل خزان',
  drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية', pumps: 'مضخات',
  waterproofing: 'عزل مائي', grading: 'ميول وترويبة', pest_control: 'مكافحة حشرات',
  cleaning: 'تنظيف', structural: 'إنشائي', paints: 'دهانات',
};

const PRESETS = [
  { label: 'تسريب + تشققات', text: 'تسريب مياه من الحمام مع تشققات في الجدران' },
  { label: 'لمبة + فيشة',   text: 'لمبة الكهرباء في الممر لا تعمل وفيشة الحائط محروقة' },
  { label: 'باب كراج',      text: 'باب الكراج لا يغلق والمقبض مكسور' },
  { label: 'صرف مسدود',    text: 'صرف الحمام مسدود وريحة كريهة' },
  { label: 'عزل سطح',      text: 'عزل سطح المنزل يحتاج تجديد بسبب تسريب أمطار' },
  { label: 'تكييف',        text: 'المكيف ما يشتغل والوحدة الخارجية فيها صوت غريب' },
  { label: 'سيراميك',      text: 'بلاط المطبخ مكسور وفيه تطبيل' },
  { label: 'مضخة ماء',    text: 'مضخة الماء لا تعمل نهائياً' },
  { label: 'حشرات',       text: 'نمل أبيض في جدران غرفة النوم' },
  { label: 'دهانات',      text: 'دهان الحائط متقشر ويحتاج بوية جديدة' },
];

const BULK_PRESETS = [
  'تسريب مياه من الحمام',
  'لمبة الكهرباء لا تعمل',
  'باب الكراج لا يغلق',
  'تشققات في جدار غرفة المعيشة',
  'صرف الحمام مسدود',
  'مكيف غرفة النوم ما يبرد',
  'بلاط المطبخ مكسور',
  'مضخة الماء لا تعمل',
];

interface ClassifyResult {
  primaryType: string;
  allTypes: string[];
  confidence: number;
  source?: string;
  reason?: string;
}

interface BulkResultItem {
  desc: string;
  gemini: ClassifyResult | null;
  kw: ClassifyResult;
}

// ─── Local keyword fallback (client-side only) ────────────────────────────────
function classifyFromKeywords(description: string): ClassifyResult {
  const text = description.toLowerCase();
  const keywords = [
    { kw: 'تسريب', t: 'plumbing',      w: 5 }, { kw: 'مياه',   t: 'plumbing',      w: 4 },
    { kw: 'مواسير', t: 'plumbing',     w: 4 }, { kw: 'صرف',    t: 'drainage',      w: 5 },
    { kw: 'حمام',  t: 'plumbing',      w: 3 }, { kw: 'مطر',    t: 'waterproofing', w: 5 },
    { kw: 'تشققات', t: 'cracks',       w: 5 }, { kw: 'شروخ',   t: 'cracks',        w: 5 },
    { kw: 'لمبة',  t: 'electricity',   w: 5 }, { kw: 'كهرباء', t: 'electricity',   w: 5 },
    { kw: 'فيشة',  t: 'electricity',   w: 4 }, { kw: 'باب',    t: 'doors_windows', w: 4 },
    { kw: 'نافذة', t: 'doors_windows', w: 4 }, { kw: 'كراج',   t: 'doors_windows', w: 5 },
    { kw: 'بلاط',  t: 'ceramics',      w: 4 }, { kw: 'سيراميك', t: 'ceramics',     w: 4 },
    { kw: 'دهان',  t: 'paints',        w: 4 }, { kw: 'بوية',   t: 'paints',        w: 3 },
    { kw: 'خزان',  t: 'tank_insulation', w: 5 }, { kw: 'عزل',  t: 'waterproofing', w: 5 },
    { kw: 'مكيف',  t: 'ac_ventilation', w: 5 }, { kw: 'مسدود', t: 'drainage',      w: 4 },
    { kw: 'ريحة',  t: 'drainage',      w: 3 }, { kw: 'مضخة',   t: 'pumps',         w: 5 },
    { kw: 'حشرات', t: 'pest_control',  w: 5 }, { kw: 'نمل',    t: 'pest_control',  w: 4 },
  ];
  const scores: Record<string, number> = {};
  for (const k of keywords) {
    if (text.includes(k.kw)) scores[k.t] = (scores[k.t] || 0) + k.w;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { primaryType: 'plumbing', allTypes: ['plumbing'], confidence: 0 };
  const max = sorted[0][1];
  const threshold = Math.max(3, max * 0.5);
  let candidates = sorted.filter(([, s]) => s >= threshold).map(([t]) => t);
  if (candidates.length > 3) candidates = candidates.slice(0, 2);
  return { primaryType: candidates[0], allTypes: candidates, confidence: max };
}

// ─── parseServerResult: يحوّل رد السيرفر لـ ClassifyResult آمن ─────────────
function parseServerResult(raw: any): ClassifyResult {
  // primaryType: قد يكون في raw.primaryType أو raw.primary_type أو raw.type
  const primaryType =
    (typeof raw?.primaryType === 'string' && raw.primaryType.trim()) ||
    (typeof raw?.primary_type === 'string' && raw.primary_type.trim()) ||
    (typeof raw?.type === 'string' && raw.type.trim()) ||
    'plumbing';

  // allTypes: مصفوفة strings أو نعيد primaryType
  const allTypes: string[] =
    Array.isArray(raw?.allTypes) && raw.allTypes.every((t: any) => typeof t === 'string')
      ? raw.allTypes
      : Array.isArray(raw?.all_types)
      ? raw.all_types.filter((t: any) => typeof t === 'string')
      : [primaryType];

  // confidence: رقم 0-10
  const rawConf = raw?.confidence ?? raw?.score ?? 5;
  const confidence = typeof rawConf === 'number' ? Math.min(Math.max(rawConf, 0), 10) : 5;

  // source: 'gemini' | 'keywords' | undefined
  const source =
    typeof raw?.source === 'string' ? raw.source :
    typeof raw?.model  === 'string' ? raw.model  : undefined;

  const reason =
    typeof raw?.reason  === 'string' ? raw.reason  :
    typeof raw?.message === 'string' ? raw.message : undefined;

  return { primaryType, allTypes, confidence, source, reason };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ConfidenceBar({ val }: { val: number }) {
  const pct = Math.min(val * 10, 100);
  const color = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="w-full bg-slate-800 rounded-full h-2 mt-1">
      <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return (
    <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">
      <XCircle className="w-3 h-3 ml-1" /> فشل
    </Badge>
  );
  if (source === 'gemini') return (
    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
      <Sparkles className="w-3 h-3 ml-1" /> Gemini ✓
    </Badge>
  );
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
      <Zap className="w-3 h-3 ml-1" /> Keywords
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GeminiTest() {
  const [description, setDescription] = useState('تسريب مياه من الحمام مع تشققات في الجدران');
  const [singleResult, setSingleResult] = useState<{
    server: ClassifyResult | null;
    kw: ClassifyResult;
    loading: boolean;
    error: string | null;
  }>({ server: null, kw: classifyFromKeywords(description), loading: false, error: null });

  const [bulkText, setBulkText]     = useState(BULK_PRESETS.join('\n'));
  const [bulkResults, setBulkResults] = useState<BulkResultItem[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [log, setLog]               = useState<string[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // تحديث نتيجة الكلمات المفتاحية فور تغيير الوصف (useEffect مستخدم الآن)
  useEffect(() => {
    setSingleResult(prev => ({ ...prev, kw: classifyFromKeywords(description) }));
  }, [description]);

  const addLog = (msg: string) =>
    setLog(prev => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 30));

  // ─── Single classify ───────────────────────────────────────────────────────
  const handleClassify = async () => {
    if (!description.trim()) return;
    setSingleResult(prev => ({ ...prev, loading: true, error: null, server: null }));
    addLog(`🔍 "${description.slice(0, 50)}"`);

    try {
      const raw = await classifyOnServer({ description, projectId: 'test' });
      if (!mountedRef.current) return;

      const result = parseServerResult(raw);
      setSingleResult(prev => ({ ...prev, server: result, loading: false }));
      addLog(`✅ ${result.source === 'gemini' ? '🤖 Gemini' : '⚡ Keywords'}: ${
        TYPE_LABELS[result.primaryType] || result.primaryType
      } — ${result.allTypes.map(t => TYPE_LABELS[t] || t).join(', ')}`);

    } catch (e: any) {
      if (!mountedRef.current) return;
      setSingleResult(prev => ({ ...prev, loading: false, error: e.message }));
      addLog(`❌ ${e.message}`);
    }
  };

  // ─── Bulk classify (parallel) ──────────────────────────────────────────────
  const handleBulk = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setBulkLoading(true);
    setBulkResults([]);
    addLog(`📦 Bulk: ${lines.length} تذاكر`);

    const results = await Promise.all(
      lines.map(async (desc): Promise<BulkResultItem> => {
        try {
          const raw = await classifyOnServer({ description: desc, projectId: 'test' });
          return { desc, gemini: parseServerResult(raw), kw: classifyFromKeywords(desc) };
        } catch {
          return { desc, gemini: null, kw: classifyFromKeywords(desc) };
        }
      })
    );

    if (!mountedRef.current) return;
    setBulkResults(results);
    setBulkLoading(false);
    const ok = results.filter(r => r.gemini?.source === 'gemini').length;
    addLog(`✅ Bulk done: ${ok}/${results.length} عبر Gemini`);
  };

  const isGemini = singleResult.server?.source === 'gemini';

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-700">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">مختبر Gemini AI</h1>
            <p className="text-xs text-slate-500">
              اختبار التصنيف التلقائي — Gemini مقابل الكلمات المفتاحية
            </p>
          </div>
        </div>

        {/* Log */}
        <Card className="bg-card border-border rounded-2xl">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-600 font-bold">سجل التصنيف</span>
              <button onClick={() => setLog([])} className="text-[10px] text-slate-600 hover:text-white">
                مسح
              </button>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {log.length === 0
                ? <span className="text-[11px] text-slate-600">لا يوجد سجل بعد</span>
                : log.map((msg, i) => (
                    <div key={i} className="text-[11px] text-slate-400 font-mono">{msg}</div>
                  ))
              }
            </div>
          </CardContent>
        </Card>

        {/* Single Classify */}
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold text-slate-500 text-right">تصنيف فردي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setDescription(p.text)}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[10px] font-bold border transition-all whitespace-nowrap',
                    description === p.text
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-900/50 border border-border rounded-xl p-3 text-sm text-slate-200 text-right resize-none h-20"
              placeholder="أدخل وصف المشكلة..."
            />

            <Button
              onClick={handleClassify}
              disabled={singleResult.loading}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl h-10 gap-2"
            >
              {singleResult.loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ التصنيف...</>
                : <><Sparkles className="w-4 h-4" /> تصنيف</>
              }
            </Button>

            {/* Error */}
            {singleResult.error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
                ❌ {singleResult.error}
              </div>
            )}

            {/* Results Grid */}
            {!singleResult.loading && singleResult.server && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">

                {/* Server Result (Gemini or Keywords fallback) */}
                <div className={cn(
                  'rounded-xl border p-4',
                  isGemini
                    ? 'border-green-500/20 bg-green-500/5'
                    : 'border-amber-500/20 bg-amber-500/5'
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600">
                      {isGemini ? 'AI (Gemini)' : 'Server (Keywords)'}
                    </span>
                    <SourceBadge source={singleResult.server.source} />
                  </div>
                  <div className="space-y-2">
                    <Row label="النوع الرئيسي">
                      <span className="text-sm font-bold text-white">
                        {TYPE_LABELS[singleResult.server.primaryType] || singleResult.server.primaryType}
                      </span>
                    </Row>
                    <Row label="كل الأنواع">
                      <span className="text-xs text-slate-300">
                        {singleResult.server.allTypes.map(t => TYPE_LABELS[t] || t).join('، ')}
                      </span>
                    </Row>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">الثقة</span>
                        <span className={cn('font-bold',
                          singleResult.server.confidence > 6 ? 'text-green-400' : 'text-amber-400'
                        )}>
                          {singleResult.server.confidence}/10
                        </span>
                      </div>
                      <ConfidenceBar val={singleResult.server.confidence} />
                    </div>
                    {singleResult.server.reason && (
                      <p className="text-[11px] text-slate-500 pt-1">{singleResult.server.reason}</p>
                    )}
                  </div>
                </div>

                {/* Local Keywords Result */}
                <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600">كلمات مفتاحية (محلي)</span>
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20">
                      <Zap className="w-3 h-3 ml-1" /> Local
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Row label="النوع الرئيسي">
                      <span className="text-sm font-bold text-white">
                        {TYPE_LABELS[singleResult.kw.primaryType] || singleResult.kw.primaryType}
                      </span>
                    </Row>
                    <Row label="كل الأنواع">
                      <span className="text-xs text-slate-300">
                        {singleResult.kw.allTypes.map(t => TYPE_LABELS[t] || t).join('، ')}
                      </span>
                    </Row>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">الدرجة</span>
                        <span className="font-bold text-slate-400">{singleResult.kw.confidence}</span>
                      </div>
                      <ConfidenceBar val={Math.min(singleResult.kw.confidence / 2, 10)} />
                    </div>
                  </div>
                </div>

              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk */}
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold text-slate-500 text-right">تصنيف دفعة (Parallel)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              className="w-full bg-slate-900/50 border border-border rounded-xl p-3 text-sm text-slate-200 text-right resize-none h-28 font-mono text-[13px]"
              placeholder="سطر لكل تذكرة..."
            />
            <Button
              onClick={handleBulk}
              disabled={bulkLoading}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl h-10 gap-2"
            >
              {bulkLoading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ...</>
                : <><FlaskConical className="w-4 h-4" /> تصنيف دفعة</>
              }
            </Button>

            {bulkResults.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900/50">
                    <tr>
                      <th className="px-3 py-2 text-slate-500 font-bold">#</th>
                      <th className="px-3 py-2 text-slate-500 font-bold">الوصف</th>
                      <th className="px-3 py-2 text-slate-500 font-bold text-center">المصدر</th>
                      <th className="px-3 py-2 text-slate-500 font-bold text-center">نتيجة السيرفر</th>
                      <th className="px-3 py-2 text-slate-500 font-bold text-center">كلمات محلية</th>
                      <th className="px-3 py-2 text-slate-500 font-bold text-center">تطابق؟</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {bulkResults.map((r, i) => {
                      const match = r.gemini?.primaryType === r.kw.primaryType;
                      return (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 text-slate-300 max-w-[180px] truncate">{r.desc}</td>
                          <td className="px-3 py-2 text-center"><SourceBadge source={r.gemini?.source} /></td>
                          <td className="px-3 py-2 text-center font-bold text-green-400">
                            {r.gemini
                              ? (TYPE_LABELS[r.gemini.primaryType] || r.gemini.primaryType)
                              : <XCircle className="w-3.5 h-3.5 text-red-500 inline" />
                            }
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-400">
                            {TYPE_LABELS[r.kw.primaryType] || r.kw.primaryType}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.gemini
                              ? match
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" />
                                : <XCircle className="w-3.5 h-3.5 text-amber-500 inline" />
                              : '—'
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
}

// ─── tiny helper ──────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}