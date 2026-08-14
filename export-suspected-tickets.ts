import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.ticket.findMany({
    where: {
      createdAt: {
        gte: new Date("2026-08-01T00:00:00.000Z"),
        lt: new Date("2026-09-01T00:00:00.000Z")
      }
    },
    select: {
      ticketId: true,
      issuedAt: true,
      createdAt: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const csv = [
    "ticketId,issuedAt,correctedIssuedAt,createdAt"
  ];

  for (const row of rows) {
    let corrected = "";

    if (row.issuedAt) {
      const match = row.issuedAt.match(/^2026-(\d{2})-(\d{2})$/);

      if (match) {
        const month = Number(match[1]);
        const day = Number(match[2]);

        // لو التاريخ خارج أغسطس، نفترض أنه نتيجة قلب اليوم والشهر
        if (month !== 8 && day === 8) {
          corrected = `2026-08-${String(month).padStart(2, "0")}`;
        }
      }
    }

    csv.push([
      row.ticketId,
      row.issuedAt ?? "",
      corrected,
      row.createdAt.toISOString()
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }

  fs.writeFileSync(
    "/tmp/suspected-tickets-august.csv",
    "\ufeff" + csv.join("\n"),
    "utf8"
  );

  console.log(`تم تصدير ${rows.length} تذكرة`);
  console.log("/tmp/suspected-tickets-august.csv");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
