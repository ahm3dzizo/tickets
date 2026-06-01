const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.ticket.count({ where: { assignedSupervisorId: null } }).then(c => {
  console.log('Unlinked tickets:', c);
  process.exit(0);
});
