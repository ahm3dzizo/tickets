import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const keywords = await prisma.ticketTypeKeyword.findMany({
    include: { ticketType: true },
    orderBy: { usageCount: 'desc' },
    take: 50
  });

  for (const k of keywords) {
    if (k.ticketType) {
      console.log(`Keyword: "${k.keyword}" -> Type: ${k.ticketType.nameAr} (Weight: ${k.weight})`);
    }
  }
}
main().finally(() => prisma.$disconnect());
