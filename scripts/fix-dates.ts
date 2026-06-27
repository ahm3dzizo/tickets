import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tickets = await prisma.ticket.findMany({
    select: { id: true, issuedAt: true, ticketId: true, createdAt: true }
  });

  let count = 0;
  // Only target tickets created recently (e.g. today)
  const recent = new Date();
  recent.setDate(recent.getDate() - 3);

  for (const t of tickets) {
    if (t.issuedAt && t.createdAt > recent) {
      const parts = t.issuedAt.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        const p1 = parseInt(parts[1], 10);
        const p2 = parseInt(parts[2], 10);
        
        // If it was wrongly parsed as YYYY-MM-DD but originally was M/D/YYYY
        // Then what is currently the "month" (p1) was actually the day,
        // and what is currently the "day" (p2) was actually the month.
        // So we swap them!
        const newMonth = p2.toString().padStart(2, '0');
        const newDay = p1.toString().padStart(2, '0');
        const fixed = `${parts[0]}-${newMonth}-${newDay}`;
        
        // We do this if they are different and p2 (the true month) <= 12
        if (p1 !== p2 && p2 <= 12) {
          await prisma.ticket.update({
            where: { id: t.id },
            data: { issuedAt: fixed }
          });
          count++;
        }
      }
    }
  }
  console.log(`Done! Fixed issuedAt dates for ${count} tickets.`);
}
main().finally(() => prisma.$disconnect());
