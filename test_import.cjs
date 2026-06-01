const fs = require('fs');
async function run() {
  const payload = JSON.parse(fs.readFileSync('/opt/retal-api/payload.json', 'utf8')).slice(0, 50);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ uid: admin.uid, role: admin.role }, process.env.JWT_SECRET || 'super-secret', { expiresIn: '1d' });

  try {
    const res = await fetch('http://localhost:3000/api/tickets/bulk', {
      method: 'POST',
      body: JSON.stringify({ tickets: payload }),
      headers: { 'Cookie': `token=${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch(e) { console.error(e.message); }
}
run();
