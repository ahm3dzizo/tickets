import prisma from '../db.js';
import { sendWAImage } from '../baileys.js';
let running = false;
export async function deliverClosureReports() {
  if (running) return;
  running = true;
  try {
    const jobs = await prisma.ticketClosureReport.findMany({where: {state: 'pending'}, orderBy: {createdAt: 'asc'}, take: 10});
    for (const job of jobs) {
      const claim = await prisma.ticketClosureReport.updateMany({where: {id: job.id, state: 'pending'}, data: {state: 'sending'}});
      if (!claim.count) continue;
      try {
        const result = await sendWAImage(job.senderUid, job.phone, Buffer.from(job.image), job.caption);
        if (!result.sent && result.error === 'NOT_CONNECTED') {
          await prisma.ticketClosureReport.update({where: {id: job.id}, data: {state: 'pending'}});
          continue;
        }
        if (!result.sent) throw new Error(result.error || 'WHATSAPP_NOT_SENT');
        await prisma.ticketClosureReport.update({where: {id: job.id}, data: {state: 'sent', sentAt: new Date()}});
      } catch (e) {
        // Ambiguous delivery is never retried automatically: prevents duplicate customer reports.
        await prisma.ticketClosureReport.update({where: {id: job.id}, data: {state: 'failed', error: e instanceof Error ? e.message : String(e)}});
        console.error('[ClosureReport] delivery requires review', job.id);
      }
    }
  } finally {running = false;}
}
export function startClosureReportWorker() {
  const timer = setInterval(() => deliverClosureReports().catch(e => console.error('[ClosureReport]', e.message)), 15000);
  timer.unref();
}
