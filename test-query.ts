import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.project.findFirst({ where: { name: { contains: 'النرجس' } } });
  if (!p) { console.log('Project not found'); return; }
  
  const stats = await prisma.ticket.groupBy({
    by: ['type'],
    where: { projectId: p.id },
    _count: true
  });
  console.log('Stats:', stats);
  
  const sample = await prisma.ticket.findMany({
    where: { projectId: p.id, type: 'mechanics' },
    take: 5,
    select: { description: true, type: true }
  });
  console.log('Sample mechanics:', JSON.stringify(sample, null, 2));
}

main().finally(() => prisma.\());
