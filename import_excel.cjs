const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

import('xlsx').then(async xlsx => {
  const x = xlsx.default || xlsx;
  const wb = x.readFile('NTF1 Ticket (1).xlsm');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = x.utils.sheet_to_json(ws);
  
  // Find project
  let project = await prisma.project.findFirst({ where: { name: { contains: 'NTF' } } });
  if (!project) project = await prisma.project.findFirst();

  const payload = data.map(row => {
    const ticketId = String(row['__EMPTY'] || row['ID'] || '').trim();
    if (!ticketId || ticketId === 'undefined') return null;

    let issuedAtStr = null;
    if (row['????? ?????']) {
        const raw = row['????? ?????'];
        if (typeof raw === 'number') {
            issuedAtStr = new Date(Math.round((raw - 25569) * 864e5)).toISOString().split('T')[0];
        } else {
            try { issuedAtStr = new Date(raw).toISOString().split('T')[0]; } catch(e) { issuedAtStr = null; }
        }
    }

    return {
      ticketId: ticketId,
      refNumber: String(row['5/31/26 12:17'] || row['??????'] || '').trim(),
      projectAbbr: project.name,
      projectId: project.id,
      clientName: String(row['__EMPTY_1'] || row['??? ??????'] || ''),
      villaNumber: String(row['__EMPTY_2'] || row['??? ??????'] || ''),
      description: String(row['__EMPTY_3'] || row['?????'] || ''),
      priority: Number(row['__EMPTY_4']) || 3,
      assigneeName: String(row['__EMPTY_5'] || ''),
      type: 'plumbing',
      status: 'open',
      issuedAt: issuedAtStr || new Date().toISOString().split('T')[0]
    };
  }).filter(t => t !== null && t.ticketId.match(/^\d+$/)); 

  console.log(`Prepared ${payload.length} tickets to import.`);

  let success = 0;
  let skipped = 0;

  const batchSize = 50;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    try {
      const res = await prisma.ticket.createMany({
        data: batch,
        skipDuplicates: true
      });
      success += res.count;
      skipped += (batch.length - res.count);
    } catch (e) {
      console.error(`Error in batch ${i}:`, e.message);
    }
  }

  console.log(`Success: ${success}, Skipped (Duplicates): ${skipped}`);
  
  const total = await prisma.ticket.count();
  console.log(`Total tickets in LOCAL DB now: ${total}`);
  process.exit(0);
});
