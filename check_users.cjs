const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ include: { projects: true } });
  console.log(JSON.stringify(users.map(u => ({uid: u.uid, name: u.displayName, role: u.role, projectIds: u.projects.map(p => p.id)})), null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
