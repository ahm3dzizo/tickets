import prisma from "../server/db.js";

async function main() {
  // Helper: add sub-type if not already exists
  async function addSub(typeKey: string, nameAr: string, sortOrder: number) {
    const type = await prisma.ticketType.findUnique({ where: { key: typeKey } });
    if (!type) { console.log("  ⚠️  type not found: " + typeKey); return; }
    const existing = await prisma.ticketSubType.findFirst({
      where: { parentTypeId: type.id, nameAr }
    });
    if (existing) { console.log("  ✓ already exists: " + nameAr); return; }
    await prisma.ticketSubType.create({
      data: { nameAr, parentTypeId: type.id, sortOrder, isActive: true }
    });
    console.log("  + added: " + nameAr + " → " + typeKey);
  }

  // ── دهانات ──────────────────────────────────────────────────
  console.log("\n🎨 دهانات:");
  await addSub("paints", "بروفايل", 10);

  // ── سيراميك وبلاط ────────────────────────────────────────────
  console.log("\n🔷 سيراميك وبلاط:");
  await addSub("ceramics", "ميول سيراميك", 10);
  await addSub("ceramics", "ترويبة سيراميك", 11);

  // ── عزل مائي ────────────────────────────────────────────────
  console.log("\n💧 عزل مائي:");
  await addSub("waterproofing", "عزل حوض زراعة", 10);

  // ── أبواب وشبابيك ───────────────────────────────────────────
  console.log("\n🚪 أبواب وشبابيك:");
  await addSub("doors_windows", "باب سحب ألومنيوم", 10);
  await addSub("doors_windows", "باب سطح ألومنيوم", 11);
  await addSub("doors_windows", "باب الفيلا الرئيسي", 12);
  await addSub("doors_windows", "باب خارجي ألومنيوم", 13);
  await addSub("doors_windows", "باب جانبي ألومنيوم", 14);

  // ── كهرباء ──────────────────────────────────────────────────
  console.log("\n⚡ كهرباء:");
  await addSub("electricity", "أفياش وقواطع", 10);
  await addSub("electricity", "كابلات وتمديدات", 11);

  // ── ميول وترويبة (grading) ──────────────────────────────────
  console.log("\n⬇️  ميول وترويبة:");
  await addSub("grading", "ميول أرضيات", 10);
  await addSub("grading", "ترويبة بلاط", 11);

  // ── انترلوك (fix both type entries) ─────────────────────────
  console.log("\n🟫 انترلوك:");
  const interlocks = await prisma.ticketType.findMany({ where: { key: { in: ["type_1782144360722","type_1782149312459"] } } });
  for (const t of interlocks) {
    const existing = await prisma.ticketSubType.findFirst({ where: { parentTypeId: t.id, nameAr: "انترلوك أرضيات" }});
    if (!existing) {
      await prisma.ticketSubType.create({ data: { nameAr: "انترلوك أرضيات", parentTypeId: t.id, sortOrder: 1, isActive: true } });
      await prisma.ticketSubType.create({ data: { nameAr: "ممشيات", parentTypeId: t.id, sortOrder: 2, isActive: true } });
      await prisma.ticketSubType.create({ data: { nameAr: "مناطق خارجية", parentTypeId: t.id, sortOrder: 3, isActive: true } });
      console.log("  + added subs for: " + t.nameAr + " (" + t.key + ")");
    } else {
      console.log("  ✓ already exists subs for: " + t.nameAr);
    }
  }

  // ── جبس ──────────────────────────────────────────────────────
  console.log("\n🏗️  جبس:");
  const gypsum = await prisma.ticketType.findFirst({ where: { key: "type_1782364849564" }});
  if (gypsum) {
    const existing = await prisma.ticketSubType.findFirst({ where: { parentTypeId: gypsum.id }});
    if (!existing) {
      await prisma.ticketSubType.create({ data: { nameAr: "جبس أسقف", parentTypeId: gypsum.id, sortOrder: 1, isActive: true } });
      await prisma.ticketSubType.create({ data: { nameAr: "جبس جدران", parentTypeId: gypsum.id, sortOrder: 2, isActive: true } });
      await prisma.ticketSubType.create({ data: { nameAr: "كورنيش جبس", parentTypeId: gypsum.id, sortOrder: 3, isActive: true } });
      console.log("  + added subs for جبس");
    } else {
      console.log("  ✓ جبس already has subs");
    }
  }

  console.log("\n✅ Done");
}

main().catch(console.error).finally(() => process.exit(0));
