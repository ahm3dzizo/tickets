import { TechLang } from './tech';

type Labels = Record<TechLang, string>;

const TAXONOMY: Record<string, Labels> = {
  electricity: { ar: 'كهرباء', en: 'Electricity', hi: 'बिजली', ur: 'بجلی' },
  electrical: { ar: 'كهرباء', en: 'Electrical', hi: 'इलेक्ट्रिकल', ur: 'الیکٹریکل' },
  plumbing: { ar: 'سباكة', en: 'Plumbing', hi: 'प्लंबिंग', ur: 'پلمبنگ' },
  doors: { ar: 'أبواب', en: 'Doors', hi: 'दरवाज़े', ur: 'دروازے' },
  paints: { ar: 'دهانات', en: 'Painting', hi: 'पेंटिंग', ur: 'پینٹنگ' },
  cracks: { ar: 'تشققات', en: 'Cracks', hi: 'दरारें', ur: 'دراڑیں' },
  ceramics: { ar: 'سيراميك', en: 'Tiles', hi: 'टाइल्स', ur: 'ٹائلز' },
  tank_neck: { ar: 'رقبة خزان', en: 'Tank neck', hi: 'टैंक नेक', ur: 'ٹینک نیک' },
  tank_cover: { ar: 'غطاء خزان', en: 'Tank cover', hi: 'टैंक कवर', ur: 'ٹینک کور' },
  tank_broken: { ar: 'كسر خزان', en: 'Broken tank', hi: 'टूटा टैंक', ur: 'ٹوٹا ہوا ٹینک' },
  tank_insulation: { ar: 'عزل خزان', en: 'Tank insulation', hi: 'टैंक इन्सुलेशन', ur: 'ٹینک انسولیشن' },
  smells: { ar: 'روائح', en: 'Odors', hi: 'दुर्गंध', ur: 'بدبو' },
  interlocking: { ar: 'انترلوك', en: 'Interlock paving', hi: 'इंटरलॉक पेविंग', ur: 'انٹرلاک پیونگ' },
  gypsum: { ar: 'جبس', en: 'Gypsum', hi: 'जिप्सम', ur: 'جپسم' },
  drainage: { ar: 'صرف صحي', en: 'Drainage', hi: 'ड्रेनेज', ur: 'نکاسی آب' },
  ac_ventilation: { ar: 'تكييف وتهوية', en: 'AC & ventilation', hi: 'एसी और वेंटिलेशन', ur: 'اے سی اور وینٹیلیشن' },
  hvac: { ar: 'تكييف وتهوية', en: 'HVAC', hi: 'एचवीएसी', ur: 'ایچ وی اے سی' },
  pumps: { ar: 'مضخات', en: 'Pumps', hi: 'पंप', ur: 'پمپس' },
  doors_windows: { ar: 'أبواب ونوافذ', en: 'Doors & windows', hi: 'दरवाज़े और खिड़कियाँ', ur: 'دروازے اور کھڑکیاں' },
  waterproofing: { ar: 'عزل مائي', en: 'Waterproofing', hi: 'वॉटरप्रूफिंग', ur: 'واٹر پروفنگ' },
  grading: { ar: 'ميول وترويبة', en: 'Slopes & grouting', hi: 'ढलान और ग्राउटिंग', ur: 'ڈھلوان اور گراؤٹنگ' },
  pest_control: { ar: 'مكافحة حشرات', en: 'Pest control', hi: 'कीट नियंत्रण', ur: 'کیڑوں کا کنٹرول' },
  cleaning: { ar: 'تنظيف', en: 'Cleaning', hi: 'सफाई', ur: 'صفائی' },
  structural: { ar: 'إنشائي', en: 'Structural', hi: 'स्ट्रक्चरल', ur: 'اسٹرکچرل' },
  painting: { ar: 'دهانات', en: 'Painting', hi: 'पेंटिंग', ur: 'پینٹنگ' },
  tiles: { ar: 'سيراميك', en: 'Tiles', hi: 'टाइल्स', ur: 'ٹائلز' },
  lighting: { ar: 'إضاءة', en: 'Lighting', hi: 'लाइटिंग', ur: 'روشنی' },
  aluminum: { ar: 'ألمنيوم', en: 'Aluminum', hi: 'एल्युमिनियम', ur: 'ایلومینیم' },
  smart_home: { ar: 'نظام ذكي', en: 'Smart home', hi: 'स्मार्ट होम', ur: 'اسمارٹ ہوم' },
  swimming_pool: { ar: 'مسبح', en: 'Swimming pool', hi: 'स्विमिंग पूल', ur: 'سوئمنگ پول' },
  landscaping: { ar: 'زراعة وحدائق', en: 'Landscaping', hi: 'लैंडस्केपिंग', ur: 'لینڈ اسکیپنگ' },
  unclassified: { ar: 'غير مصنف', en: 'Unclassified', hi: 'अवर्गीकृत', ur: 'غیر درجہ بند' },
  carpentry: { ar: 'نجارة', en: 'Carpentry', hi: 'बढ़ईगीरी', ur: 'بڑھئی کا کام' },
  mechanics: { ar: 'ميكانيكا', en: 'Mechanical', hi: 'मैकेनिकल', ur: 'مکینیکل' },
  general: { ar: 'عام', en: 'General maintenance', hi: 'सामान्य रखरखाव', ur: 'عمومی دیکھ بھال' },
};

const ALIASES = new Map<string, string>();
for (const [key, labels] of Object.entries(TAXONOMY)) {
  ALIASES.set(key.toLowerCase(), key);
  for (const label of Object.values(labels)) ALIASES.set(label.trim().toLowerCase(), key);
}

export function translateTechTaxonomy(value: string | null | undefined, lang: TechLang): string {
  const clean = value?.trim();
  if (!clean) return '';
  const key = ALIASES.get(clean.toLowerCase());
  return key ? TAXONOMY[key][lang] : clean;
}

export function hasTechTaxonomy(value: string | null | undefined): boolean {
  const clean = value?.trim();
  return !!clean && ALIASES.has(clean.toLowerCase());
}
