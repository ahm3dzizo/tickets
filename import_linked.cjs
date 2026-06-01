const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

async function run() {
  const prisma = new PrismaClient();
  const payload = JSON.parse(fs.readFileSync('/opt/retal-api/payload.json', 'utf8'));

  let project = await prisma.project.findFirst({ where: { name: { contains: 'NTF' } } });
  if (!project) project = await prisma.project.findFirst();

  const existingTickets = await prisma.ticket.findMany({
    where: { projectId: project.id },
    select: { ticketId: true }
  });
  const existingIds = new Set(existingTickets.map(t => String(t.ticketId)));
  
  const missing = payload.filter(t => !existingIds.has(String(t.ticketId)));
  console.log(`Found ${missing.length} missing tickets to import.`);

  if (missing.length === 0) return process.exit(0);

  const allSups = await prisma.user.findMany({
    where: { role: 'supervisor' },
    select: { uid: true, displayName: true, specialty: true, specialtiesRef: true }
  });

  const getSpecs = (u) => {
    let specs = [];
    if (u.specialtiesRef && u.specialtiesRef.length > 0) specs = u.specialtiesRef.map(s => s.key);
    else if (u.specialty) specs = [u.specialty];
    return specs.length > 0 ? specs : ["general"];
  };

  for (const t of missing) {
    t.projectId = project.id;
    const generalSups = allSups.filter(s => getSpecs(s).includes('general'));
    const sup = generalSups[0] || allSups[0];
    if (sup) {
      t.assignedSupervisorId = sup.uid;
      t.assignedSupervisorIds = [sup.uid];
      t.assignedSupervisors = [{ id: sup.uid, name: sup.displayName, specialty: getSpecs(sup)[0] }];
      t.assigneeName = sup.displayName;
    } else {
      t.assignedSupervisorId = null;
      t.assigneeName = null;
    }
  }

  let success = 0;
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    try {
      const res = await prisma.ticket.createMany({ data: batch, skipDuplicates: true });
      success += res.count;
    } catch (e) {
      console.error(e.message);
    }
  }

  console.log(`Successfully imported ${success} linked tickets!`);
  process.exit(0);
}
run();
