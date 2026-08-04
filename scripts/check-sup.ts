import prisma from "../server/db.js";

async function run() {
  const supervisor = await prisma.user.findFirst({
    where: { displayName: { contains: 'ABDELFATAH' } }
  });
  if (!supervisor) { console.log('Supervisor not found'); return; }
  console.log('Supervisor:', supervisor.displayName, supervisor.uid, supervisor.specialties);

  const tickets = await prisma.ticket.findMany({
    where: { assignedSupervisorIds: { has: supervisor.uid }, status: { not: 'closed' } },
    select: { id: true, description: true, detectedTypes: true, assignedSupervisorIds: true, project: { select: { name: true } } }
  });
  console.log('Tickets assigned to him (Open):', tickets.length);
  for (const t of tickets) {
    console.log('- Ticket:', t.id, '| Project:', t.project?.name);
    console.log('  Types:', t.detectedTypes);
    console.log('  Assigned Sups:', t.assignedSupervisorIds);
    console.log('  Desc:', t.description?.slice(0, 100).replace(/\n/g, ' '));
  }
}

run();
