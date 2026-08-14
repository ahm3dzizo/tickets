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

  const output = [
    "ticketId,issuedAt,currentMonth,currentDay,expectedDate,status,createdAt"
  ];

  let suspected = 0;

  for (const row of rows) {
    const issued = (row.issuedAt || "").trim();

    let currentMonth = "";
    let currentDay = "";
    let expectedDate = "";
    let status = "NORMAL";

    const match = issued.match(/^2026-(\d{2})-(\d{2})$/);

    if (match) {
      const month = Number(match[1]);
      const day = Number(match[2]);

      currentMonth = String(month);
      currentDay = String(day);

      /*
       * التذاكر التي تم استيرادها في أغسطس.
       *
       * إذا كان الشهر الحالي ليس أغسطس، ولكن اليوم = 08،
       * فهذا شكل قوي من حالات قلب DD/MM إلى MM/DD.
       *
       * مثال:
       * 08/11/2026 -> 2026-11-08
       * الصحيح       2026-08-11
       */
      if (month !== 8 && day === 8) {
        expectedDate =
          `2026-08-${String(month).padStart(2, "0")}`;

        status = "SUSPECTED";
        suspected++;
      }
    } else if (issued) {
      status = "CHECK_FORMAT";
    }

    output.push([
      row.ticketId,
      issued,
      currentMonth,
      currentDay,
      expectedDate,
      status,
      row.createdAt.toISOString()
    ].map(v =>
      `"${String(v).replace(/"/g, '""')}"`
    ).join(","));
  }

  const file = "/tmp/tickets-import-analysis.csv";

  fs.writeFileSync(
    file,
    "\ufeff" + output.join("\n"),
    "utf8"
  );

  console.log("");
  console.log("================================");
  console.log(`إجمالي التذاكر: ${rows.length}`);
  console.log(`المشتبه بها: ${suspected}`);
  console.log(`الملف: ${file}`);
  console.log("================================");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
