import prisma from '../server/db.js';
import { classifyBatchWithGemini } from '../server/classifier/gemini.js';
import { buildTypeToSpecialtyMap } from '../server/classifier/db-helpers.js';

async function run() {
  const p = await prisma.project.findFirst({ where: { name: { contains: 'النرجس' } } });
  if (!p) return console.log('Project not found');

  const tickets = await prisma.ticket.findMany({
    where: { projectId: p.id }
  });
  console.log('Found ' + tickets.length + ' tickets in Narjis.');

  const typeToSpecialty = await buildTypeToSpecialtyMap();
  
  // 1. Fetch supervisors ONLY FOR THIS PROJECT
  const allSups = await prisma.user.findMany({
    where: { 
      role: 'supervisor',
      projects: { some: { id: p.id } } // FIXED RELATION NAME
    },
    select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true } // Removed name:true
  });
  console.log('Found ' + allSups.length + ' supervisors in Narjis.');

  const getSpecs = (u: any) => {
    if (Array.isArray(u.specialtiesRef) && u.specialtiesRef.length > 0) return u.specialtiesRef.map((s:any)=>s.key);
    if (u.specialty) return [u.specialty];
    return ['general'];
  };

  const batchSize = 10;
  let updated = 0;
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize);
    console.log('Processing batch ' + (i/batchSize + 1) + '/' + Math.ceil(tickets.length/batchSize));
    
    try {
      const descriptions = batch.map(t => ({ id: t.id, description: t.description || 'طلب صيانة' }));
      const results = await classifyBatchWithGemini(descriptions);
      
      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        const ticket = batch[j];
        
        // 2. Fix the date
        let newIssueDate = ticket.issueDate;
        if (ticket.issueDate && ticket.createdAt >= new Date('2026-08-04T00:00:00Z')) {
           const d = new Date(ticket.issueDate);
           if (d.getFullYear() === 2026) {
             const oldM = d.getMonth();
             const oldD = d.getDate();
             newIssueDate = new Date(d.getFullYear(), oldD - 1, oldM + 1);
           }
        }
        
        let updateData: any = { issueDate: newIssueDate };

        if (res.primaryType !== 'unclassified') {
          // Find matching supervisor IN THE FILTERED PROJECT SUPERVISORS
          const requiredSpecialties = [...new Set(res.allTypes.map(t => typeToSpecialty[t] || 'general'))];
          const matchedSups = allSups.filter(s => getSpecs(s).some((sp:string) => requiredSpecialties.includes(sp)));
          const finalSups = matchedSups.length > 0 ? matchedSups : allSups.filter(s => getSpecs(s).includes('general'));
          const primarySup = finalSups.length > 0 ? finalSups[0] : allSups[0];
          
          updateData = {
            ...updateData,
            type: res.primaryType,
            typeId: res.typeId,
            subType: res.subType,
            subTypeId: res.subTypeId,
            assigneeName: primarySup?.displayName || null, // FIXED: use displayName directly
            assignedSupervisorId: primarySup?.uid || null,
            assignedSupervisors: finalSups.map(s => ({ uid: s.uid, displayName: s.displayName })),
            assignedSupervisorIds: finalSups.map(s => s.uid)
          };
        } else {
           const generalSups = allSups.filter(s => getSpecs(s).includes('general'));
           const primarySup = generalSups.length > 0 ? generalSups[0] : allSups[0];
           updateData = {
            ...updateData,
            assigneeName: primarySup?.displayName || null,
            assignedSupervisorId: primarySup?.uid || null,
            assignedSupervisors: primarySup ? [{ uid: primarySup.uid, displayName: primarySup.displayName }] : [],
            assignedSupervisorIds: primarySup ? [primarySup.uid] : []
          };
        }
        
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: updateData
        });
        updated++;
      }
    } catch (e) {
      console.log('Error in batch:', e);
    }
  }
  
  console.log('Finished. Updated ' + updated + ' tickets.');
}

run().catch(console.error).finally(() => process.exit(0));
