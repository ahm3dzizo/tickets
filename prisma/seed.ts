import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SPECIALTIES = [
  { key: "mechanics", nameAr: "ميكانيكا", sortOrder: 1 },
  { key: "electricity", nameAr: "كهرباء", sortOrder: 2 },
  { key: "general", nameAr: "عام", sortOrder: 3 },
];

const TICKET_TYPES: {
  key: string;
  nameAr: string;
  specialtyKey: string;
  sortOrder: number;
  subTypes: { nameAr: string; description?: string; specialtyKey?: string }[];
}[] = [
  {
    key: "plumbing",
    nameAr: "سباكة",
    specialtyKey: "mechanics",
    sortOrder: 1,
    subTypes: [
      { nameAr: "صرف صحي", specialtyKey: "mechanics" },
      { nameAr: "مضخات", specialtyKey: "mechanics" },
      { nameAr: "خزانات" },
      { nameAr: "تسريبات مياه" },
    ],
  },
  {
    key: "electricity",
    nameAr: "كهرباء",
    specialtyKey: "electricity",
    sortOrder: 2,
    subTypes: [
      { nameAr: "إضاءة" },
      { nameAr: "قواطع وفيوزات" },
      { nameAr: "تمديدات" },
      { nameAr: "كاميرات وإنتركوم" },
    ],
  },
  {
    key: "doors_windows",
    nameAr: "أبواب وشبابيك",
    specialtyKey: "general",
    sortOrder: 3,
    subTypes: [
      { nameAr: "أبواب ألمنيوم" },
      { nameAr: "أبواب خشب" },
      { nameAr: "شبابيك" },
      { nameAr: "أقفال" },
    ],
  },
  {
    key: "paints",
    nameAr: "دهانات",
    specialtyKey: "general",
    sortOrder: 4,
    subTypes: [
      { nameAr: "دهان داخلي" },
      { nameAr: "دهان خارجي" },
      { nameAr: "معجون وجبس" },
      { nameAr: "تقشير وتلون" },
    ],
  },
  {
    key: "ceramics",
    nameAr: "سيراميك وبلاط",
    specialtyKey: "general",
    sortOrder: 5,
    subTypes: [
      { nameAr: "تبليط أرضيات" },
      { nameAr: "تبليط جدران" },
      { nameAr: "تطبيق" },
      { nameAr: "رخام" },
    ],
  },
  {
    key: "cracks",
    nameAr: "تشققات إنشائية",
    specialtyKey: "general",
    sortOrder: 6,
    subTypes: [
      { nameAr: "تشققات جدران" },
      { nameAr: "تشققات أسقف" },
      { nameAr: "هبوط أرضيات" },
    ],
  },
  {
    key: "tank_insulation",
    nameAr: "عزل خزانات",
    specialtyKey: "general",
    sortOrder: 7,
    subTypes: [
      { nameAr: "عزل خزان أرضي" },
      { nameAr: "عزل خزان علوي" },
      { nameAr: "غطاء خزان" },
    ],
  },
  {
    key: "drainage",
    nameAr: "صرف صحي",
    specialtyKey: "mechanics",
    sortOrder: 8,
    subTypes: [
      { nameAr: "روائح كريهة" },
      { nameAr: "انسداد مجاري" },
      { nameAr: "تسرب من الصرف" },
    ],
  },
  {
    key: "waterproofing",
    nameAr: "عزل مائي",
    specialtyKey: "general",
    sortOrder: 9,
    subTypes: [
      { nameAr: "عزل أسطح" },
      { nameAr: "عزل جدران خارجية" },
      { nameAr: "رطوبة جدران" },
    ],
  },
  {
    key: "ac_ventilation",
    nameAr: "تكييف وتهوية",
    specialtyKey: "mechanics",
    sortOrder: 10,
    subTypes: [
      { nameAr: "تكييف" },
      { nameAr: "مراوح شفط" },
      { nameAr: "تهوية" },
    ],
  },
  {
    key: "pumps",
    nameAr: "مضخات",
    specialtyKey: "mechanics",
    sortOrder: 11,
    subTypes: [
      { nameAr: "مضخة مياه" },
      { nameAr: "عوامة" },
      { nameAr: "تعبئة خزان" },
    ],
  },
  {
    key: "grading",
    nameAr: "ميول وترويبة",
    specialtyKey: "general",
    sortOrder: 12,
    subTypes: [
      { nameAr: "ميول خاطئ" },
      { nameAr: "تجمع مياه" },
      { nameAr: "هبوط أرض" },
    ],
  },
  {
    key: "pest_control",
    nameAr: "مكافحة حشرات",
    specialtyKey: "general",
    sortOrder: 13,
    subTypes: [
      { nameAr: "نمل" },
      { nameAr: "صراصير" },
      { nameAr: "حشرات عام" },
    ],
  },
  {
    key: "cleaning",
    nameAr: "تنظيف",
    specialtyKey: "general",
    sortOrder: 14,
    subTypes: [
      { nameAr: "تنظيف خزانات" },
      { nameAr: "تنظيف مخلفات" },
      { nameAr: "تنظيف عام" },
    ],
  },
  {
    key: "structural",
    nameAr: "إنشائي",
    specialtyKey: "general",
    sortOrder: 15,
    subTypes: [
      { nameAr: "أساسات" },
      { nameAr: "أعمدة" },
      { nameAr: "جدران حاملة" },
    ],
  },
];

const TYPE_KEYWORDS_SEED: { key: string; words: string[]; weight: number }[] = [
  { key: "plumbing", words: ["مياه","موية","ماء","مويه","مياة"], weight: 4 },
  { key: "plumbing", words: ["تهريب","تسريب","تسرب","تسربات"], weight: 5 },
  { key: "plumbing", words: ["سباكة","سباك","صرف","تصريف","بالوعة","ماسورة","مواسير","أنابيب"], weight: 4 },
  { key: "plumbing", words: ["مغسلة","مغسله","دورة مياه","مرحاض","كرسي حمام","حوض","بانيو"], weight: 3 },
  { key: "plumbing", words: ["مضخة","طلوع مياه","ضغط ماء","ضغط المياه"], weight: 3 },
  { key: "plumbing", words: ["رطوبة","رطوبه","تبلل","مياه أمطار","امطار","هطول","مطر"], weight: 3 },
  { key: "plumbing", words: ["روائح","رائحة","رواءح","كريهه","رائحه"], weight: 2 },
  { key: "plumbing", words: ["صفاية","تصريف","فتحة تصريف","مجرور","جرجور"], weight: 3 },
  { key: "plumbing", words: ["خزان","الخزان","خزان أرضي","خزان علوي","خزان الموية"], weight: 4 },
  { key: "plumbing", words: ["عوامة","مستوى ماء","امتلاء الخزان","يطفو","تطفوا"], weight: 3 },
  { key: "drainage", words: ["روائح كريهة","ريحة","مجرى","صرف صحي","انسداد","جرجور","مياه راكدة","فتحة تفتيش","مجاري"], weight: 5 },
  { key: "drainage", words: ["رائحة كريهة","رائحة الحمام","مجرى الماء","سيفون مسدود","تصريف مياه","طفح الماء"], weight: 4 },
  { key: "drainage", words: ["حمامات ما تنطاق","ريحتها كريهة"], weight: 3 },
  { key: "ac_ventilation", words: ["مكيف","تكييف","تهريب مكيف","تهريب ماء من المكيف"], weight: 5 },
  { key: "ac_ventilation", words: ["شفاط","مروحة شفط","صوت عالي","مراوح","تهوية","شفاط مطبخ"], weight: 4 },
  { key: "ac_ventilation", words: ["صوت مزعج مروحة","لا يسحب هواء","مروحة الحمام","شفاط الحمام"], weight: 3 },
  { key: "ac_ventilation", words: ["فتحة تكييف","تبريد"], weight: 2 },
  { key: "pumps", words: ["مضخة","دينمو","عوامة","غطاس","طلمبة","تشغيل تلقائي","انقطاع الماء","ضخ الماء","تعبئة الخزان"], weight: 5 },
  { key: "pumps", words: ["المضخة لا تعمل","الدينمو عطلان","العوامة عطلة","مضخة الماء تشتغل لوحدها","انقطاع مستمر للماء"], weight: 4 },
  { key: "pumps", words: ["مضخة كهرباء","مضخة ماء"], weight: 3 },
  { key: "electricity", words: ["كهرباء","كهربا","كهربائي","كهربائيه"], weight: 4 },
  { key: "electricity", words: ["لمبة","لمبه","لمبات","إضاءة","اضاءة","انارة","أنارة","نور","إنارات"], weight: 3 },
  { key: "electricity", words: ["فيش","فيوز","ديفايدر","قاطع","لوحة كهرباء","تيار","ماس كهربائي","شورت"], weight: 3 },
  { key: "electricity", words: ["كاميرا","كاميرات","كامير","دش","سبوت","ثريا"], weight: 2 },
  { key: "electricity", words: ["دفاية","سخان","مضخة كهرباء"], weight: 2 },
  { key: "electricity", words: ["مفتاح","بريكر","أسلاك","كبل","تمديد أسلاك","التماس","عداد","لوحة رقم الفيلا","إنتركوم"], weight: 2 },
  { key: "electricity", words: ["الإضاءة طافية","الطبلون","مقص الكهرباء","أنارة الدرج","سبوت لايت"], weight: 2 },
  { key: "ceramics", words: ["سيراميك","بلاط","بالط","بلاطة","بلاطه","رخام"], weight: 5 },
  { key: "ceramics", words: ["تبليط","ارضية","أرضية"], weight: 3 },
  { key: "ceramics", words: ["طقطقة","مفكك","فراغ تحت البلاط"], weight: 3 },
  { key: "ceramics", words: ["ترويب","تسوية ميول","تسوية بلاط"], weight: 3 },
  { key: "ceramics", words: ["كسر بلاط","بلاطة مكسورة","تطبيق"], weight: 4 },
  { key: "ceramics", words: ["نمل من البلاط","فتحات في البلاط"], weight: 2 },
  { key: "paints", words: ["دهان","دهانات","صبغ","طلاء","طالء","صبغة"], weight: 5 },
  { key: "paints", words: ["بوية","بويه","لون","بيج","أبيض"], weight: 4 },
  { key: "paints", words: ["تقشير","انطلاء","تبقع","تلون","تقشر"], weight: 3 },
  { key: "paints", words: ["يعاد الدهان","إعادة دهان","تنظيف دهان"], weight: 3 },
  { key: "paints", words: ["جبس","فيلر","تسوية جدار","جبس السقف"], weight: 2 },
  { key: "paints", words: ["معجون","لياسة","تناسق الألوان","اختلاف لون"], weight: 2 },
  { key: "cracks", words: ["تشقق","تشققات","شقوق","شق"], weight: 5 },
  { key: "cracks", words: ["صدع","تصدع","تصدعات","متصدع"], weight: 5 },
  { key: "cracks", words: ["كسور","تكسر","شروخ","شرخ","كسر"], weight: 4 },
  { key: "cracks", words: ["هبوط","تربة","أساس","اساسيه","بنية أساسية","بنيه"], weight: 4 },
  { key: "cracks", words: ["ظاهره","ظاهرة","سطحية","سطحيه"], weight: 2 },
  { key: "cracks", words: ["خارجيه","خارجية","واجهة","حوش"], weight: 1 },
  { key: "cracks", words: ["شروخ في الجدران","زوايا متشققة","تصدع في الصبة"], weight: 3 },
  { key: "doors_windows", words: ["باب","أبواب","ابواب","بابين","الباب"], weight: 4 },
  { key: "doors_windows", words: ["ألمنيوم","الومنيوم","المنيوم","الالمنيوم"], weight: 3 },
  { key: "doors_windows", words: ["شباك","شبابيك","نافذة","نوافذ","دريشة"], weight: 4 },
  { key: "doors_windows", words: ["يغلق","ما يتقفل","يفتح","مفصلة","مفصلات","قفل","مزلاج","ذراع"], weight: 3 },
  { key: "doors_windows", words: ["سحب","باب سحب","باب الحوش"], weight: 3 },
  { key: "doors_windows", words: ["خدوش","كسر زجاج","زجاج","شبك","حرسات","شبكة"], weight: 2 },
  { key: "doors_windows", words: ["وزن الباب","وزنية","ميزان"], weight: 2 },
  { key: "doors_windows", words: ["جلدة","فراغ","هواء يدخل","النافذة تصدر صوت","مقبض مكسور","قفل تالف","باب الكراج"], weight: 3 },
  { key: "waterproofing", words: ["عزل","عزل مائي","ماني"], weight: 5 },
  { key: "waterproofing", words: ["رطوبة","رطوبه","تبلل","مياه أمطار","امطار","هطول","مطر"], weight: 4 },
  { key: "waterproofing", words: ["خزان مكشوف","غطاء الخزان","فتحة الخزان","رقبة الخزان"], weight: 4 },
  { key: "waterproofing", words: ["تسرب من السطح","عزل السطح","عزل الجدران","تهريب الأمطار","جدار رطب"], weight: 5 },
  { key: "waterproofing", words: ["غطاء الخزان مفقود","تسرب مطر","سطح"], weight: 3 },
  { key: "grading", words: ["ميول","تجمع مياه","هبوط","انترلوك","أرضية غير مستوية","منحدر","تصريف"], weight: 5 },
  { key: "grading", words: ["ترويبة","صفاية","منسوب","ميول خاطئ","تجمع الماء","هبوط الأرض"], weight: 4 },
  { key: "grading", words: ["ميول الحوش","ميول السطح","ترويبة البلاط"], weight: 3 },
  { key: "pest_control", words: ["نمل","حشرات","نمل أبيض","بق","صراصير","حشرة","ناموس","ذباب"], weight: 5 },
  { key: "pest_control", words: ["نمل في المطبخ","نمل في الحمامات","مبيد","رش"], weight: 4 },
  { key: "cleaning", words: ["تنظيف","مخلفات بناء","أوساخ","بقايا اسمنت","غبار","وسخ"], weight: 4 },
  { key: "cleaning", words: ["إزالة","تنظيف الخزان","تنظيف الحوش","تنظيف البوية","بقايا الدهان","مخلفات الصيانة"], weight: 3 },
  { key: "structural", words: ["انهيار","تحرك جدار","أساس","عمود متصدع","خطر","بناء","صبة خرسانية"], weight: 5 },
  { key: "structural", words: ["شروخ كبيرة","هبوط أساس","جدار يتحرك","تهدم","سور مائل"], weight: 5 },
  { key: "tank_insulation", words: ["خزان","خزانات","الخزان"], weight: 6 },
  { key: "tank_insulation", words: ["خزان أرضي","خزان علوي","خزان تبريد","خزان الموية"], weight: 5 },
  { key: "tank_insulation", words: ["عوامة","مستوى ماء","امتلاء الخزان","يطفو","تطفوا"], weight: 3 },
  { key: "tank_insulation", words: ["عزل خزان","عزل مائي","ماني"], weight: 4 },
  { key: "tank_insulation", words: ["رقبة الخزان","غطاء الخزان","فتحة الخزان"], weight: 4 },
  { key: "tank_insulation", words: ["خزان مكسور","خزان متصدع"], weight: 4 },
];

async function main() {
  console.log("Seeding classification data...");

  // 1. Specialties
  const spMap = new Map<string, string>();
  for (const sp of SPECIALTIES) {
    const r = await prisma.specialty.upsert({
      where: { key: sp.key },
      update: { nameAr: sp.nameAr, sortOrder: sp.sortOrder },
      create: sp,
    });
    spMap.set(sp.key, r.id);
    console.log(`  OK Specialty: ${sp.key}`);
  }

  // 2. TicketTypes + SubTypes
  const typeMap = new Map<string, string>();
  for (const t of TICKET_TYPES) {
    const spId = spMap.get(t.specialtyKey) || null;
    const tr = await prisma.ticketType.upsert({
      where: { key: t.key },
      update: { nameAr: t.nameAr, specialtyId: spId, sortOrder: t.sortOrder },
      create: { key: t.key, nameAr: t.nameAr, specialtyId: spId, sortOrder: t.sortOrder },
    });
    typeMap.set(t.key, tr.id);
    console.log(`  OK TicketType: ${t.key}`);

    for (const st of t.subTypes) {
      const stSpId = st.specialtyKey ? (spMap.get(st.specialtyKey) || spId) : spId;
      const exist = await prisma.ticketSubType.findFirst({
        where: { parentTypeId: tr.id, nameAr: st.nameAr },
      });
      if (!exist) {
        await prisma.ticketSubType.create({
          data: { nameAr: st.nameAr, description: st.description || null, parentTypeId: tr.id, specialtyId: stSpId },
        });
      }
    }
  }

  // 3. Keywords
  let kwCount = 0;
  for (const kw of TYPE_KEYWORDS_SEED) {
    const typeId = typeMap.get(kw.key);
    if (!typeId) continue;
    for (const word of kw.words) {
      const norm = word.trim().toLowerCase();
      if (!norm) continue;
      const exist = await prisma.ticketTypeKeyword.findUnique({
        where: { keyword_typeId: { keyword: norm, typeId } },
      });
      if (!exist) {
        await prisma.ticketTypeKeyword.create({
          data: { keyword: norm, typeId, weight: kw.weight, source: "seed", confidence: 1.0 },
        });
        kwCount++;
      } else if (exist.weight !== kw.weight) {
        await prisma.ticketTypeKeyword.update({ where: { id: exist.id }, data: { weight: kw.weight } });
      }
    }
  }
  console.log(`  OK Keywords: ${kwCount} new`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
