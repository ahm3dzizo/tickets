import { TicketType } from '@/types';
import type { Specialty } from '@/types';

export interface ClassificationResult {
  primaryType: TicketType;
  allTypes: TicketType[];
  requiredSpecialties: Specialty[];
  confidence: number; // 0 = unknown, higher = more certain
}

// ─────────────────────────────────────────────────────────────
// Keyword scoring table  (weight = importance of the keyword)
// ─────────────────────────────────────────────────────────────
const TYPE_KEYWORDS: Record<TicketType, { words: string[]; weight: number }[]> = {
  electricity: [
    { words: ['كهرباء', 'كهربا', 'كهربائي', 'كهربائيه'], weight: 4 },
    { words: ['لمبة', 'لمبه', 'لمبات', 'إضاءة', 'اضاءة', 'انارة', 'أنارة', 'نور', 'إنارات'], weight: 3 },
    { words: ['فيش', 'فيوز', 'ديفايدر', 'قاطع', 'لوحة كهرباء', 'تيار', 'ماس كهربائي', 'شورت'], weight: 3 },
    { words: ['كاميرا', 'كاميرات', 'كامير', 'دش', 'سبوت', 'ثريا', 'شفاط'], weight: 2 },
    { words: ['دفاية', 'سخان', 'مكيف', 'تكييف', 'مضخة كهرباء'], weight: 2 },
    { words: ['مفتاح', 'بريكر', 'أسلاك', 'كبل', 'تمديد أسلاك'], weight: 2 },
  ],
  plumbing: [
    { words: ['مياه', 'موية', 'ماء', 'مويه', 'مياة'], weight: 4 },
    { words: ['تهريب', 'ترسيب', 'تسريب', 'ترسب', 'يرسب', 'تسرب', 'يتسرب', 'تسربات', 'تعريب'], weight: 5 },
    { words: ['سباكة', 'سباك', 'صرف', 'تصريف', 'بالوعة', 'ماسورة', 'مواسير', 'أنابيب'], weight: 4 },
    { words: ['مغسلة', 'مغسله', 'دورة مياه', 'مرحاض', 'كرسي حمام', 'حوض', 'بانيو', 'مرحاض'], weight: 3 },
    { words: ['مضخة', 'طلوع مياه', 'ضغط ماء', 'دفع موية', 'دفع المويه', 'ضغط المياه'], weight: 3 },
    { words: ['رطوبة', 'رطوبه', 'تبلل', 'مياه أمطار', 'امطار', 'هطول', 'مطر'], weight: 3 },
    { words: ['روائح', 'رائحة', 'رواءح', 'كريهه', 'رائحه'], weight: 2 },
    { words: ['صفاية', 'تصريف', 'فتحة تصريف', 'مجرور'], weight: 3 },
  ],
  tank_insulation: [
    { words: ['خزان', 'خزانات', 'الخزان'], weight: 6 },
    { words: ['خزان أرضي', 'خزان علوي', 'خزان تبريد', 'خزان الموية'], weight: 5 },
    { words: ['عوامة', 'مستوى ماء', 'امتلاء الخزان', 'يطفو', 'تطفوا'], weight: 3 },
    { words: ['عزل خزان', 'عزل مائي', 'ماني'], weight: 4 },
    { words: ['رقبة الخزان', 'غطاء الخزان', 'فتحة الخزان'], weight: 4 },
  ],
  doors: [
    { words: ['باب', 'أبواب', 'ابواب', 'بابين', 'الباب'], weight: 4 },
    { words: ['ألمنيوم', 'الومنيوم', 'المنيوم', 'الومنيوم', 'الالمنيوم'], weight: 3 },
    { words: ['شباك', 'شبابيك', 'نافذة', 'نوافذ', 'دريشة'], weight: 4 },
    { words: ['يغلق', 'ما يتقفل', 'يفتح', 'مفصلة', 'مفصلات', 'قفل', 'مزلاج', 'ذراع'], weight: 3 },
    { words: ['سحب', 'باب سحب', 'باب الحوش'], weight: 3 },
    { words: ['خدوش', 'كسر زجاج', 'زجاج', 'شبك', 'حرسات', 'شبكة'], weight: 2 },
    { words: ['وزن الباب', 'وزنية', 'ميزان'], weight: 2 },
  ],
  cracks: [
    { words: ['تشقق', 'تشققات', 'شقوق', 'شق'], weight: 5 },
    { words: ['صدع', 'تصدع', 'تصدعات', 'متصدع'], weight: 5 },
    { words: ['كسور', 'تكسر', 'شروخ', 'شرخ', 'كسر'], weight: 4 },
    { words: ['هبوط', 'تربة', 'أساس', 'اساسيه', 'بنية أساسية', 'بنيه'], weight: 4 },
    { words: ['ظاهره', 'ظاهرة', 'سطحية', 'سطحيه'], weight: 2 },
    { words: ['خارجيه', 'خارجية', 'واجهة', 'حوش'], weight: 1 },
  ],
  paints: [
    { words: ['دهان', 'دهانات', 'صبغ', 'طلاء', 'طالء', 'صبغة'], weight: 5 },
    { words: ['بوية', 'بويه', 'لون', 'بيج', 'أبيض'], weight: 4 },
    { words: ['تقشير', 'انطلاء', 'تبقع', 'تلون'], weight: 3 },
    { words: ['يعاد الدهان', 'إعادة دهان', 'تنظيف دهان'], weight: 3 },
    { words: ['جبس', 'فيلر', 'تسوية جدار'], weight: 2 },
  ],
  ceramics: [
    { words: ['سيراميك', 'بلاط', 'بالط', 'بلاطة', 'بلاطه', 'رخام'], weight: 5 },
    { words: ['تبليط', 'ارضية', 'أرضية'], weight: 3 },
    { words: ['طقطقة', 'مفكك', 'فراغ تحت البلاط'], weight: 3 },
    { words: ['ترويب', 'تسوية ميول', 'ميول', 'تسوية بلاط'], weight: 3 },
    { words: ['كسر بلاط', 'بلاطة مكسورة'], weight: 4 },
  ],
};

// Map each TicketType to the supervisor specialty responsible for it
export const TYPE_TO_SPECIALTY: Record<TicketType, Specialty> = {
  electricity:       'electricity',
  plumbing:          'mechanics',
  tank_insulation:   'general',   // عزل خزان → مشرف عام
  doors:             'general',
  cracks:            'general',
  paints:            'general',
  ceramics:          'general',
};

// ─────────────────────────────────────────────────────────────
// Rule-based classifier  (always available, no API key needed)
// ─────────────────────────────────────────────────────────────
export function classifyTicket(description: string): ClassificationResult {
  const text = description.toLowerCase();
  const scores: Partial<Record<TicketType, number>> = {};

  for (const [rawType, groups] of Object.entries(TYPE_KEYWORDS)) {
    const type = rawType as TicketType;
    let score = 0;
    for (const { words, weight } of groups) {
      for (const word of words) {
        if (text.includes(word)) score += weight;
      }
    }
    if (score > 0) scores[type] = score;
  }

  const sorted = (Object.entries(scores) as [TicketType, number][]).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return { primaryType: 'plumbing', allTypes: ['plumbing'], requiredSpecialties: ['general'], confidence: 0 };
  }

  const maxScore = sorted[0][1];
  // Include all types with score >= 40% of the top score (multi-label)
  const allTypes = sorted.filter(([, s]) => s >= maxScore * 0.4).map(([t]) => t);
  const requiredSpecialties = [...new Set(allTypes.map(t => TYPE_TO_SPECIALTY[t]))] as Specialty[];

  return { primaryType: allTypes[0], allTypes, requiredSpecialties, confidence: maxScore };
}


