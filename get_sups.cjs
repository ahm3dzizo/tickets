const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ where: { role: 'supervisor' } }).then(u => {
  console.log(JSON.stringify(u, null, 2));
  process.exit(0);
});
