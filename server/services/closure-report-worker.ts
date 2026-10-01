import prisma from '../db.js';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { __dirname } from '../config.js';
import { buildClosingMsg, sendWAImage } from '../baileys.js';
import { uniqueClosureItems, type Closure } from './ticket-closure-plan.js';

let running = false;

async function renderReport(body: object): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'python' : 'python3',
      [path.join(__dirname, 'report_generator.py'), '--stdin'],
      { env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } },
    );

    let output = '';
    let errors = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('REPORT_TIMEOUT'));
    }, 60000);

    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { errors += data.toString(); });
    child.on('close', async code => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error('[ClosureReport] generation failed', errors);
        reject(new Error('REPORT_GENERATION_FAILED'));
        return;
      }

      const filename = output.trim().split(/\r?\n/).pop() || '';
      try {
        const bytes = await readFile(filename);
        await unlink(filename);
        resolve(bytes);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(body));
  });
}

async function generatePendingClosureReports() {
  const jobs = await prisma.ticketClosureReport.findMany({
    where: { state: 'generating' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const job of jobs) {
    const claim = await prisma.ticketClosureReport.updateMany({
      where: { id: job.id, state: 'generating' },
      data: { state: 'rendering', error: null },
    });
    if (!claim.count) continue;

    try {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: job.ticketIds } },
        include: {
          client: true,
          unit: { include: { block: true } },
          project: true,
        },
      });

      if (!rows.length || rows.length !== job.ticketIds.length) {
        throw new Error('REPORT_TICKET_NOT_FOUND');
      }

      const order = new Map(job.ticketIds.map((id, index) => [id, index]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

      const first = rows[0];
      const reportItems = uniqueClosureItems(
        rows.flatMap(ticket =>
          Array.isArray(ticket.maintenanceItems)
            ? ticket.maintenanceItems as Closure['items']
            : [],
        ),
      );
      const reportNotes = [...new Set(
        rows
          .map(ticket => ticket.closureNotes?.trim())
          .filter((note): note is string => Boolean(note)),
      )].join('\n');

      const body = {
        ticket_num: rows.map(ticket => ticket.ticketId).join('، '),
        villa: first.unit?.unitNumber || '',
        customer_name: first.client?.name || '',
        phone: job.phone,
        maint_items: reportItems.map(item => [item.description, item.status]),
        notes: reportNotes,
        block: first.unit?.block?.blockNumber || '',
        project: first.project.name,
        nhc: first.project.abbreviation,
        ticket_date: first.issuedAt || '',
        priority: String(first.priority),
        handover_date: first.unit?.handoverDate || '',
        warranty_expiry_date: first.unit?.warrantyExpiryDate || '',
      };

      const image = await renderReport(body);
      const caption = await buildClosingMsg({
        ticketId: body.ticket_num,
        clientName: body.customer_name,
        description: reportItems.map(item => item.description).join('، '),
        unitNumber: body.villa,
        closureNotes: reportNotes,
      });

      await prisma.ticketClosureReport.update({
        where: { id: job.id },
        data: {
          image,
          caption,
          state: 'pending',
          error: null,
        },
      });
    } catch (error) {
      await prisma.ticketClosureReport.update({
        where: { id: job.id },
        data: {
          state: 'generation_failed',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      console.error('[ClosureReport] generation requires review', job.id, error);
    }
  }
}

async function sendPendingClosureReports() {
  const jobs = await prisma.ticketClosureReport.findMany({
    where: { state: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const job of jobs) {
    const claim = await prisma.ticketClosureReport.updateMany({
      where: { id: job.id, state: 'pending' },
      data: { state: 'sending' },
    });
    if (!claim.count) continue;

    try {
      const result = await sendWAImage(
        job.senderUid,
        job.phone,
        Buffer.from(job.image),
        job.caption,
      );

      if (!result.sent && result.error === 'NOT_CONNECTED') {
        await prisma.ticketClosureReport.update({
          where: { id: job.id },
          data: { state: 'pending' },
        });
        continue;
      }

      if (!result.sent) throw new Error(result.error || 'WHATSAPP_NOT_SENT');

      await prisma.ticketClosureReport.update({
        where: { id: job.id },
        data: {
          state: 'sent',
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      // Ambiguous delivery is never retried automatically: prevents duplicate customer reports.
      await prisma.ticketClosureReport.update({
        where: { id: job.id },
        data: {
          state: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      console.error('[ClosureReport] delivery requires review', job.id);
    }
  }
}

export async function deliverClosureReports() {
  if (running) return;
  running = true;
  try {
    await generatePendingClosureReports();
    await sendPendingClosureReports();
  } finally {
    running = false;
  }
}

export function startClosureReportWorker() {
  // Rendering has no external side effect. Recover interrupted rendering jobs
  // after a process restart so no closure report is lost.
  void prisma.ticketClosureReport.updateMany({
    where: { state: 'rendering' },
    data: { state: 'generating' },
  }).catch(error => console.error('[ClosureReport] recovery failed', error));

  const timer = setInterval(
    () => deliverClosureReports().catch(error => console.error('[ClosureReport]', error)),
    15000,
  );
  timer.unref();
}
