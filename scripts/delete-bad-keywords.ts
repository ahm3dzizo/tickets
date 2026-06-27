import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const badKeywords = [
    "وجود", "تواجد", "يوجد", "تحتاج", "اعداد", "مستمر", "ابيض", 
    "في", "من", "على", "الى", "عن", "مع", "علشان", "بسبب", "غير", "شكل"
  ];

  let deletedCount = 0;
  for (const keyword of badKeywords) {
    const result = await prisma.ticketTypeKeyword.deleteMany({
      where: { keyword: { equals: keyword } }
    });
    deletedCount += result.count;
    if (result.count > 0) {
      console.log(`Deleted keyword: "${keyword}" (${result.count} times)`);
    }
  }

  console.log(`Finished deleting ${deletedCount} bad keywords.`);
}
main().finally(() => prisma.$disconnect());
