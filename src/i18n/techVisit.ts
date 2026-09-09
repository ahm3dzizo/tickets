import type { TechLang } from './tech';

export type TechVisitTextKey =
  | 'claimed'
  | 'startTravel'
  | 'enRoute'
  | 'markArrived'
  | 'arrived'
  | 'startWork'
  | 'workInProgress'
  | 'continueWork'
  | 'allOutcomesReady'
  | 'remainingOutcomes'
  | 'phaseActionFailed';

const strings: Record<TechLang, Record<TechVisitTextKey, string>> = {
  ar: {
    claimed: 'تم استلام الموعد',
    startTravel: 'ابدأ التوجه',
    enRoute: 'في الطريق',
    markArrived: 'تسجيل الوصول',
    arrived: 'تم الوصول',
    startWork: 'بدء العمل',
    workInProgress: 'جاري العمل',
    continueWork: 'متابعة التذاكر',
    allOutcomesReady: 'تم تحديد نتيجة كل التذاكر',
    remainingOutcomes: 'حدّد نتيجة كل التذاكر قبل إنهاء الموعد',
    phaseActionFailed: 'تعذر تحديث مرحلة الموعد',
  },
  en: {
    claimed: 'Appointment claimed',
    startTravel: 'Start travel',
    enRoute: 'En route',
    markArrived: 'Mark arrived',
    arrived: 'Arrived',
    startWork: 'Start work',
    workInProgress: 'Work in progress',
    continueWork: 'Continue tickets',
    allOutcomesReady: 'All ticket outcomes recorded',
    remainingOutcomes: 'Record an outcome for every ticket before finishing',
    phaseActionFailed: 'Could not update the appointment stage',
  },
  hi: {
    claimed: 'अपॉइंटमेंट लिया गया',
    startTravel: 'रवाना हों',
    enRoute: 'रास्ते में',
    markArrived: 'पहुंच दर्ज करें',
    arrived: 'पहुंच गए',
    startWork: 'काम शुरू करें',
    workInProgress: 'काम जारी है',
    continueWork: 'टिकट जारी रखें',
    allOutcomesReady: 'सभी टिकट के परिणाम दर्ज हैं',
    remainingOutcomes: 'समाप्त करने से पहले हर टिकट का परिणाम दर्ज करें',
    phaseActionFailed: 'अपॉइंटमेंट चरण अपडेट नहीं हो सका',
  },
  ur: {
    claimed: 'اپائنٹمنٹ وصول ہو گئی',
    startTravel: 'روانہ ہوں',
    enRoute: 'راستے میں',
    markArrived: 'پہنچ درج کریں',
    arrived: 'پہنچ گئے',
    startWork: 'کام شروع کریں',
    workInProgress: 'کام جاری ہے',
    continueWork: 'ٹکٹس جاری رکھیں',
    allOutcomesReady: 'تمام ٹکٹس کے نتائج درج ہیں',
    remainingOutcomes: 'ختم کرنے سے پہلے ہر ٹکٹ کا نتیجہ درج کریں',
    phaseActionFailed: 'اپائنٹمنٹ کا مرحلہ اپ ڈیٹ نہیں ہو سکا',
  },
};

export function visitT(lang: TechLang, key: TechVisitTextKey) {
  return strings[lang]?.[key] || strings.en[key];
}
