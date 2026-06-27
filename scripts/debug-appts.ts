import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const allTickets = await prisma.ticket.findMany({
    select: { id: true, villaNumber: true, appointmentTime: true, status: true, createdAt: true }
  });

  const withAppts = allTickets.filter(t => t.appointmentTime);
  const withoutAppts = allTickets.filter(t => !t.appointmentTime && t.status !== 'closed');
  
  console.log(`Total tickets: ${allTickets.length}`);
  console.log(`Tickets with appointments: ${withAppts.length}`);
  console.log(`Open tickets without appointments: ${withoutAppts.length}`);

  let matchFound = 0;
  for (const w of withoutAppts) {
    const villa = w.villaNumber ? String(w.villaNumber).replace(/^0+/, "").trim() : null;
    if (villa) {
      const match = withAppts.find(t => {
         const tVilla = t.villaNumber ? String(t.villaNumber).replace(/^0+/, "").trim() : null;
         return tVilla === villa;
      });
      if (match) {
        matchFound++;
        console.log(`Found a match! Ticket ${w.id} (Status: ${w.status}, Villa: ${villa}) could inherit ${match.appointmentTime} from ${match.id}`);
      }
    }
  }
  
  console.log(`Found ${matchFound} potential matches.`);
}
main().finally(() => prisma.$disconnect());
