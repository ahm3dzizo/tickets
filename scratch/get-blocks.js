const { PrismaClient } = require('/opt/retal-api/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const clients = await prisma.client.findMany({ select: { villaNumber: true, blockNumber: true } });
  const blocks = {};
  clients.forEach(c => {
    if (!c.blockNumber) return;
    if (!blocks[c.blockNumber]) blocks[c.blockNumber] = [];
    blocks[c.blockNumber].push(c.villaNumber);
  });
  console.log(JSON.stringify(blocks, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
