/**
 * migrate-appointments.js
 * Moves existing appointmentTime data from Ticket rows into the Appointment table.
 * Safe to run multiple times — only touches tickets where appointmentId IS NULL.
 */

import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const prisma = new PrismaClient();

async function run() {
  console.log('\n▶  Appointment Migration — جاري نقل بيانات المواعيد...\n');

  // Find tickets with appointmentTime but no appointmentId yet
  const tickets = await prisma.ticket.findMany({
    where: {
      appointmentTime: { not: null },
      appointmentId: null,
    },
    select: {
      id: true,
      projectId: true,
      villaNumber: true,
      clientId: true,
      clientName: true,
      appointmentTime: true,
      appointmentNotes: true,
      assignedSupervisorIds: true,
      assignedSupervisors: true,
      type: true,
      detectedTypes: true,
      client: { select: { phone: true } },
    },
  });

  if (tickets.length === 0) {
    console.log('✔  لا يوجد بيانات للنقل — كل المواعيد محدثة بالفعل\n');
    return;
  }

  console.log(`▶  وُجد ${tickets.length} تذكرة بمواعيد تحتاج نقل...\n`);

  // Group by (projectId, villaNumber, date) → one Appointment per group
  const groups = new Map();
  for (const t of tickets) {
    const date = (t.appointmentTime || '').split(' ')[0];
    if (!date) continue;
    const key = `${t.projectId}|${t.villaNumber}|${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  console.log(`▶  ${groups.size} مجموعة مواعيد فريدة (فيلا + تاريخ)\n`);

  let created = 0;
  let errors = 0;

  for (const [, group] of groups) {
    const first = group[0];
    const [date, time] = (first.appointmentTime || '').split(' ');

    const types = new Set();
    for (const t of group) {
      if (t.type) types.add(t.type);
      if (t.detectedTypes) t.detectedTypes.forEach(dt => types.add(dt));
    }

    try {
      const appointment = await prisma.appointment.create({
        data: {
          projectId: first.projectId,
          villaNumber: first.villaNumber,
          clientId: first.clientId || null,
          clientName: first.clientName,
          clientPhone: first.client?.phone || null,
          date,
          time: time || null,
          notes: first.appointmentNotes || null,
          supervisorIds: first.assignedSupervisorIds || [],
          supervisors: first.assignedSupervisors || [],
          types: Array.from(types),
        },
      });

      // Link all tickets in this group to the new appointment
      await prisma.ticket.updateMany({
        where: { id: { in: group.map(t => t.id) } },
        data: { appointmentId: appointment.id },
      });

      console.log(`  ✓  فيلا ${first.villaNumber.padEnd(6)} — ${date}  (${group.length} تذكرة) — ملاحظة: ${first.appointmentNotes ? first.appointmentNotes.slice(0, 40) : '—'}`);
      created++;
    } catch (err) {
      console.error(`  ✘  فيلا ${first.villaNumber} — ${date}: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  if (errors > 0) {
    console.log(`⚠   اكتملت مع ${errors} أخطاء — ${created} موعد تم نقله`);
  } else {
    console.log(`✔  تم نقل ${created} موعد بنجاح 🎉\n`);
  }
}

run()
  .catch(err => {
    console.error('\n✘  فشل الـ Migration:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
