// src/services/learningService.ts
/**
 * Learning Service
 * ─────────────────
 * مسؤول عن:
 * 1. تحليل وصف التذكرة وتحديد نوعها تلقائياً (MECHANICS / ELECTRICITY / GENERAL)
 * 2. التعلم من قرارات المشرفين — لما مشرف يعدل النوع يتعلم النظام
 * 3. مزامنة الكلمات المتعلمة مع الـ DB عبر learnedKeywordsApi
 */

import { learnedKeywordsApi, type LearnedKeyword } from '../lib/api';

// ── الكلمات الأساسية المدمجة (seed) ──────────────────────────────────────────
const SEED_KEYWORDS: Record<'MECHANICS' | 'ELECTRICITY' | 'GENERAL', string[]> = {
  MECHANICS: [
    'سباكة', 'تسريب', 'تسرب', 'مياه', 'ماء', 'صرف', 'بلوعة', 'حوض', 'مرحاض',
    'دش', 'شاور', 'خزان', 'بويلر', 'سخان', 'ضغط مياه', 'أنابيب', 'مواسير',
    'صنبور', 'خلاط', 'عداد مياه', 'كسر بلاط', 'رخام', 'سيراميك', 'جبس',
    'دهان', 'طلاء', 'شقوق', 'تشققات', 'باب', 'شباك', 'نافذة', 'قفل',
    'مفصلة', 'درج', 'سلم', 'أرضية', 'سقف', 'جدار', 'حائط', 'عزل', 'رطوبة',
    'تكثف', 'تسريب سطح', 'ميزانية', 'ميزان', 'مضخة', 'محبس',
  ],
  ELECTRICITY: [
    'كهرباء', 'كهربائي', 'تيار', 'فولت', 'أمبير', 'دارة', 'دائرة',
    'قاطع', 'فيوز', 'لوحة كهرباء', 'لوحة توزيع', 'أسلاك', 'كابلات',
    'إضاءة', 'لمبة', 'مصباح', 'ليد', 'سبوت', 'نيون', 'ثريا',
    'مروحة', 'مكيف', 'تكييف', 'مسبح كهربائي', 'مقبس', 'بريز', 'فيشة',
    'سخان كهربائي', 'ترموستات', 'جرس', 'إنتركم', 'كاميرا', 'انذار',
    'بطارية', 'ups', 'جنريتور', 'موتور', 'مضخة كهربائية', 'ريموت',
    'شاشة', 'تلفزيون', 'راوتر', 'انترنت', 'صواعق',
  ],
  GENERAL: [
    'نظافة', 'تنظيف', 'غسيل', 'دهان عام', 'صيانة عامة', 'متابعة',
    'استفسار', 'شكوى', 'ملاحظة', 'طلب', 'أخرى', 'عام', 'تفتيش',
    'معاينة', 'زيارة', 'اتصال', 'تواصل',
  ],
};

// ── Cache محلي للكلمات المتعلمة ───────────────────────────────────────────────
let _cache: LearnedKeyword[] = [];
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

// ── تحميل الكلمات من الـ DB ───────────────────────────────────────────────────
async function loadKeywords(force = false): Promise<LearnedKeyword[]> {
  if (!force && _cache.length > 0 && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache;
  }
  try {
    _cache = await learnedKeywordsApi.getAll();
    _cacheTime = Date.now();
  } catch {
    // إذا فشل التحميل، استخدم الـ cache القديم أو فاضي
  }
  return _cache;
}

// ── بناء Map من الكلمات ───────────────────────────────────────────────────────
function buildKeywordMap(learned: LearnedKeyword[]): Map<string, { type: string; score: number }> {
  const map = new Map<string, { type: string; score: number }>();

  // أضف الـ seed أولاً بـ score = 1
  for (const [type, words] of Object.entries(SEED_KEYWORDS)) {
    for (const word of words) {
      map.set(normalize(word), { type, score: 1 });
    }
  }

  // الكلمات المتعلمة تأخذ أولوية أعلى (score = confidence * usageCount)
  for (const kw of learned) {
    const score = kw.confidence * Math.log1p(kw.usageCount);
    const existing = map.get(normalize(kw.keyword));
    if (!existing || score > existing.score) {
      map.set(normalize(kw.keyword), { type: kw.type, score });
    }
  }

  return map;
}

// ── تطبيع النص ───────────────────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

// ── تقطيع النص إلى tokens ────────────────────────────────────────────────────
function tokenize(text: string): string[] {
  const normalized = normalize(text);
  // كلمات مفردة
  const words = normalized.split(/\s+/).filter(w => w.length > 1);
  // bigrams (زوج من الكلمات المتجاورة)
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return [...bigrams, ...words];
}

// ── الوظيفة الرئيسية: تحديد نوع التذكرة ─────────────────────────────────────
export async function detectTicketType(description: string): Promise<{
  type: 'MECHANICS' | 'ELECTRICITY' | 'GENERAL';
  confidence: number;
  matchedKeywords: string[];
}> {
  const learned = await loadKeywords();
  const keywordMap = buildKeywordMap(learned);
  const tokens = tokenize(description);

  const scores: Record<string, number> = { MECHANICS: 0, ELECTRICITY: 0, GENERAL: 0 };
  const matched: string[] = [];

  for (const token of tokens) {
    const entry = keywordMap.get(token);
    if (entry) {
      scores[entry.type] = (scores[entry.type] || 0) + entry.score;
      matched.push(token);
    }
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return { type: 'GENERAL', confidence: 0.3, matchedKeywords: [] };
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [bestType, bestScore] = sorted[0];
  const confidence = Math.min(bestScore / total, 1);

  return {
    type: bestType as 'MECHANICS' | 'ELECTRICITY' | 'GENERAL',
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: [...new Set(matched)],
  };
}

// ── التعلم من قرار المشرف ────────────────────────────────────────────────────
/**
 * يُستدعى لما مشرف يغير نوع التذكرة يدوياً
 * — يستخرج الكلمات المميزة من الوصف ويعلّم النظام النوع الصح
 */
export async function learnFromCorrection(
  description: string,
  correctType: 'MECHANICS' | 'ELECTRICITY' | 'GENERAL',
  options?: { minWordLength?: number; maxKeywords?: number }
): Promise<void> {
  const minLen = options?.minWordLength ?? 2;
  const maxKw  = options?.maxKeywords ?? 10;

  const tokens = tokenize(description)
    .filter(t => !t.includes(' '))        // كلمات مفردة بس (مش bigrams)
    .filter(t => t.length >= minLen)
    .filter(t => !STOP_WORDS.has(t));

  // خد أكتر maxKw كلمة (الأولى هي الأهم في الغالب)
  const toLearn = [...new Set(tokens)].slice(0, maxKw);
  if (toLearn.length === 0) return;

  try {
    await learnedKeywordsApi.bulkLearn(
      toLearn.map(keyword => ({ keyword, type: correctType }))
    );
    // إجبار إعادة التحميل من الـ DB
    await loadKeywords(true);
  } catch (err) {
    console.error('[learningService] learnFromCorrection error:', err);
  }
}

// ── تعليم كلمة واحدة يدوياً ──────────────────────────────────────────────────
export async function learnKeyword(
  keyword: string,
  type: 'MECHANICS' | 'ELECTRICITY' | 'GENERAL'
): Promise<void> {
  try {
    await learnedKeywordsApi.learn(keyword, type);
    await loadKeywords(true);
  } catch (err) {
    console.error('[learningService] learnKeyword error:', err);
  }
}

// ── إعادة تحليل مجموعة تذاكر ────────────────────────────────────────────────
/**
 * بيُستخدم في صفحة الاستيراد لتحليل الوصف قبل الحفظ
 */
export async function batchDetect(descriptions: string[]): Promise<Array<{
  type: 'MECHANICS' | 'ELECTRICITY' | 'GENERAL';
  confidence: number;
  matchedKeywords: string[];
}>> {
  const learned = await loadKeywords();
  const keywordMap = buildKeywordMap(learned);

  return descriptions.map(desc => {
    const tokens = tokenize(desc);
    const scores: Record<string, number> = { MECHANICS: 0, ELECTRICITY: 0, GENERAL: 0 };
    const matched: string[] = [];

    for (const token of tokens) {
      const entry = keywordMap.get(token);
      if (entry) {
        scores[entry.type] = (scores[entry.type] || 0) + entry.score;
        matched.push(token);
      }
    }

    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    if (total === 0) return { type: 'GENERAL' as const, confidence: 0.3, matchedKeywords: [] };

    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const [bestType, bestScore] = sorted[0];
    return {
      type: bestType as 'MECHANICS' | 'ELECTRICITY' | 'GENERAL',
      confidence: Math.round((bestScore / total) * 100) / 100,
      matchedKeywords: [...new Set(matched)],
    };
  });
}

// ── مسح الـ cache يدوياً ─────────────────────────────────────────────────────
export function invalidateCache(): void {
  _cache = [];
  _cacheTime = 0;
}

// ── Seed الـ DB بالكلمات الأساسية (شغّلها مرة واحدة) ────────────────────────
export async function seedKeywordsIfEmpty(): Promise<void> {
  try {
    const existing = await learnedKeywordsApi.getAll();
    if (existing.length > 0) return; // موجودة بالفعل

    const items: { keyword: string; type: string }[] = [];
    for (const [type, words] of Object.entries(SEED_KEYWORDS)) {
      for (const word of words) {
        items.push({ keyword: word, type });
      }
    }
    await learnedKeywordsApi.bulkLearn(items);
    console.log(`[learningService] Seeded ${items.length} keywords`);
  } catch (err) {
    console.error('[learningService] seedKeywordsIfEmpty error:', err);
  }
}

// ── Stop words (كلمات تُتجاهل في التعلم) ────────────────────────────────────
const STOP_WORDS = new Set([
  'في', 'من', 'إلى', 'على', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
  'التي', 'الذي', 'اللذان', 'اللتان', 'كان', 'كانت', 'يكون', 'تكون',
  'هو', 'هي', 'هم', 'هن', 'انا', 'نحن', 'انت', 'انتم', 'وجود',
  'يوجد', 'لا', 'لم', 'لن', 'ما', 'قد', 'كل', 'بعض', 'غير',
  'وقت', 'يوم', 'ساعة', 'الان', 'اليوم', 'امس', 'غدا', 'جدا',
  'فقط', 'حتى', 'ايضا', 'وايضا', 'او', 'و', 'ثم', 'لكن', 'اما',
]);