import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// Arabic character range
const isArabic = (str: string) => /[؀-ۿ]/.test(str);

async function main() {
  // 1. Find smells / any English-named subtypes
  const all = await prisma.ticketSubType.findMany({
    include: { parentType: { select: { key: true, nameAr: true } } },
    orderBy: { nameAr: 'asc' },
  });

  const english = all.filter(s => !isArabic(s.nameAr));
  const arabic  = all.filter(s => isArabic(s.nameAr));

  console.log(`\n✅ Arabic subtypes (${arabic.length}):`);
  arabic.forEach(s => console.log(`  [${s.parentType.key}] ${s.nameAr}  (id: ${s.id})`));

  console.log(`\n⚠️  English / non-Arabic subtypes (${english.length}):`);
  english.forEach(s => console.log(`  [${s.parentType.key}] "${s.nameAr}"  (id: ${s.id})`));

  if (english.length === 0) {
    console.log('  — لا توجد أسماء إنجليزية');
  }

  // 2. Known fixes map  (nameAr → Arabic replacement)
  const fixes: Record<string, string> = {
    'smells':          'روائح كريهة',
    'smell':           'روائح كريهة',
    'drainage':        'صرف صحي',
    'plumbing':        'سباكة',
    'electricity':     'كهرباء',
    'cracks':          'شروخ',
    'ceramics':        'سيراميك',
    'painting':        'دهانات',
    'paints':          'دهانات',
    'doors':           'أبواب',
    'waterproofing':   'عزل مائي',
    'pest_control':    'مكافحة حشرات',
    'cleaning':        'تنظيف',
    'structural':      'إنشائي',
    'ac_ventilation':  'تكييف وتهوية',
    'aluminum':        'ألمنيوم',
    'general':         'عام',
  };

  const toFix = english.filter(s => fixes[s.nameAr.toLowerCase().trim()]);
  const unknown = english.filter(s => !fixes[s.nameAr.toLowerCase().trim()]);

  if (toFix.length > 0) {
    console.log(`\n🔧 سيتم تصحيح ${toFix.length} subtype:`);
    for (const s of toFix) {
      const newName = fixes[s.nameAr.toLowerCase().trim()];
      await prisma.ticketSubType.update({
        where: { id: s.id },
        data: { nameAr: newName },
      });
      console.log(`  ✅ "${s.nameAr}" → "${newName}"`);
    }
  }

  if (unknown.length > 0) {
    console.log(`\n❓ أسماء إنجليزية غير معروفة — يحتاج مراجعة يدوية:`);
    unknown.forEach(s => console.log(`  [${s.parentType.key}] "${s.nameAr}" (id: ${s.id})`));
  }

  console.log('\nتم.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
