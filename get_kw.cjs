const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.ticketTypeKeyword.findMany().then(k => {
  console.log(JSON.stringify(k.slice(0,10), null, 2));
  process.exit(0);
});
