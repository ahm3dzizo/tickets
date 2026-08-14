import prisma from "../server/db.js";

async function main() {
  const types = await prisma.ticketType.findMany({
    where: { isActive: true },
    include: { subTypes: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" }
  });
  for (const t of types) {
    const subs = t.subTypes.map(s => s.nameAr).join(", ");
    console.log(t.key + " | " + t.nameAr + " | subtypes: " + (subs || "(none)"));
  }
}

main().catch(console.error).finally(() => process.exit(0));
