const fs = require('fs');
import('xlsx').then(async xlsx => {
  const x = xlsx.default || xlsx;
  const wb = x.readFile('NTF1 Ticket (1).xlsm');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = x.utils.sheet_to_json(ws);
  
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
      projectAbbr: 'NTF',
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

  fs.writeFileSync('payload.json', JSON.stringify(payload));
  console.log('Payload generated. ' + payload.length + ' tickets.');
  process.exit(0);
});
