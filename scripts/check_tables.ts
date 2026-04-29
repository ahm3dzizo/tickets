import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const tables: any[] = await p.$queryRawUnsafe(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
);
console.log('Tables:', tables.map((t: any) => t.table_name));
await p.$disconnect();
