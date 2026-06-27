import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const words = ["شبك", "باب", "السطح", "غير", "مركب", "بشكل", "صحيح", "يوجد", "حشرات", "في", "المنزل", "وجود", "فراغات", "كبيره", "اسفل", "جدارن", "الفلة", "منطقة", "الزراعة"];
  
  const keywords = await prisma.ticketTypeKeyword.findMany({
    where: { keyword: { in: words } },
    include: { ticketType: true }
  });

  for (const k of keywords) {
    if (k.ticketType) {
      console.log(`Keyword: "${k.keyword}" -> Type: ${k.ticketType.nameAr} (Weight: ${k.weight})`);
    }
  }
}
main().finally(() => prisma.$disconnect());
