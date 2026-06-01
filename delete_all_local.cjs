const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.ticket.deleteMany({}).then(r => {
  console.log(`Deleted ${r.count} tickets locally.`);
  process.exit(0);
});
