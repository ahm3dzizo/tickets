import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function test() {
  // 1. Check keywords count
  const keywordCount = await prisma.ticketTypeKeyword.count();
  console.log("Keywords in DB:", keywordCount);

  // 2. Check types count
  const typeCount = await prisma.ticketType.count();
  console.log("TicketTypes in DB:", typeCount);

  // 3. Check specialties
  const specialties = await prisma.specialty.findMany();
  console.log("Specialties:", specialties.map((s: any) => s.key));

  // 4. Test classification logic
  const keywords = await prisma.ticketTypeKeyword.findMany({
    where: { typeId: { not: null }, ticketType: { isActive: true } },
    include: { ticketType: { select: { key: true } } },
  });

  const kwList = keywords
    .filter((r: any) => r.ticketType?.key)
    .map((r: any) => ({
      keyword: r.keyword,
      typeKey: r.ticketType.key,
      weight: r.weight,
    }));

  console.log("Keywords loaded:", kwList.length);

  // Test description
  const desc = "تسريب مياه من الحمام والمواسير مكسورة";
  const text = desc.toLowerCase();
  const scores: Record<string, number> = {};

  for (const kw of kwList) {
    if (text.includes(kw.keyword)) {
      scores[kw.typeKey] = (scores[kw.typeKey] || 0) + kw.weight;
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  console.log("Scores:", sorted);
  console.log("Primary type:", sorted[0]?.[0] || "none");

  await prisma.$disconnect();
}

test().catch(console.error);
