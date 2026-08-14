import prisma from './server/db.js';
async function run() {
  const kws = await prisma.ticketTypeKeyword.findMany({
    where: { ticketType: { key: 'cracks' } },
    select: { keyword: true }
  });
  console.log('Cracks keywords:', kws);
}
run();
