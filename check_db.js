import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.unit.findMany({ take: 5 }).then(console.log).finally(() => prisma.$disconnect());
