const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ where: { role: 'supervisor' }, include: { projects: true } }).then(u => {
  console.log(JSON.stringify(u.map(x => ({ name: x.displayName, projects: x.projects.length })), null, 2));
  process.exit(0);
});
