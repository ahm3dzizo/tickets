const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.ticketTypeKeyword.count().then(c => {
  console.log('Keywords count:', c);
  process.exit(0);
});
