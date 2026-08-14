import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.unit.updateMany({
  where: { unitNumber: '800' },
  data: { handoverDate: '2026-05-01', warrantyExpiryDate: '2027-05-01' }
}).then(console.log).finally(() => prisma.$disconnect());
