import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.unit.findMany({ where: { unitNumber: '800' } }).then(console.log).finally(() => prisma.$disconnect());
