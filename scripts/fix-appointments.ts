import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all tickets...');
  const allTickets = await prisma.ticket.findMany({
    select: {
      id: true,
      villaNumber: true,
      clientId: true,
      appointmentTime: true,
      appointmentNotes: true,
      status: true
    }
  });

  // Build a map of appointments by villa/client
  const activeAppointmentsByVilla = new Map<string, { time: string, notes: string | null }>();
  const activeAppointmentsByClient = new Map<string, { time: string, notes: string | null }>();

  // Helper to normalize villa number
  const normalizeVillaNumber = (v: any) => {
    if (!v) return "";
    let s = String(v).trim();
    if (s.startsWith("0") && s.length > 1) {
      s = s.replace(/^0+/, "");
    }
    return s;
  };

  for (const t of allTickets) {
    if (t.appointmentTime) {
      if (t.villaNumber) {
        activeAppointmentsByVilla.set(normalizeVillaNumber(t.villaNumber), { time: t.appointmentTime, notes: t.appointmentNotes });
      }
      if (t.clientId) {
        activeAppointmentsByClient.set(t.clientId, { time: t.appointmentTime, notes: t.appointmentNotes });
      }
    }
  }

  let updatedCount = 0;

  // Now find open tickets missing appointments
  for (const t of allTickets) {
    if (t.status !== "closed" && t.status !== "out-of-scope" && t.status !== "out_of_scope" && !t.appointmentTime) {
      const cleanVilla = t.villaNumber ? normalizeVillaNumber(t.villaNumber) : null;
      
      let inheritedAppt;
      if (cleanVilla) inheritedAppt = activeAppointmentsByVilla.get(cleanVilla);
      if (!inheritedAppt && t.clientId) inheritedAppt = activeAppointmentsByClient.get(t.clientId);

      if (inheritedAppt) {
        console.log(`Updating ticket ${t.id} (Villa: ${t.villaNumber}) with appointment ${inheritedAppt.time}`);
        await prisma.ticket.update({
          where: { id: t.id },
          data: {
            appointmentTime: inheritedAppt.time,
            appointmentNotes: inheritedAppt.notes
          }
        });
        updatedCount++;
      }
    }
  }

  console.log(`\nFinished! Successfully updated ${updatedCount} open tickets with their missing appointments.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
