import prisma from './server/db.js';
async function run() {
  const p = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log(p);
}
run();
