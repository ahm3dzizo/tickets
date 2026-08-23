/**
 * Daily ML Training Worker
 * ─────────────────────────
 * Every day at 03:00:
 * 1. Exports all classified tickets from DB → ml/db_tickets.csv
 * 2. Runs python3 ml/train.py
 * 3. Calls POST /reload on the ML service so it picks up the new model
 */

import { exec }       from "child_process";
import { promisify }  from "util";
import fs             from "fs/promises";
import path           from "path";
import { fileURLToPath } from "url";
import prisma         from "../db.js";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ML_DIR    = path.resolve(__dirname, "../../ml");
const DB_CSV    = path.join(ML_DIR, "db_tickets.csv");
const ML_URL    = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:5050";

let _timer: ReturnType<typeof setTimeout> | null = null;

export function startTrainWorker(): void {
  scheduleNext();
  console.log("[TrainWorker] Scheduled — daily at 03:00");
}

export function stopTrainWorker(): void {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

// ── Scheduling ───────────────────────────────────────────────────────────────

function msUntil3am(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNext(): void {
  const delay = msUntil3am();
  _timer = setTimeout(async () => {
    await runTrain().catch(err => console.error("[TrainWorker] Error:", err.message));
    scheduleNext();
  }, delay);
}

// ── Core ─────────────────────────────────────────────────────────────────────

async function exportTicketsToCSV(): Promise<number> {
  const tickets = await prisma.ticket.findMany({
    where: {
      type:        { not: "unclassified" },
      description: { not: "" },
    },
    select: { description: true, type: true },
  });

  const rows = ["text,label"];
  for (const t of tickets) {
    if (!t.description || t.description.length < 5 || !t.type) continue;
    const safe = t.description.replace(/"/g, "'").replace(/\r?\n/g, " ").trim();
    rows.push(`"${safe}",${t.type}`);
  }

  await fs.writeFile(DB_CSV, rows.join("\n"), "utf-8");
  return rows.length - 1; // exclude header
}

async function runTrain(): Promise<void> {
  console.log("[TrainWorker] Starting daily training...");

  const count = await exportTicketsToCSV();
  console.log(`[TrainWorker] Exported ${count} tickets → db_tickets.csv`);

  const { stdout, stderr } = await execAsync(`python3 ${path.join(ML_DIR, "train.py")}`, {
    cwd:     ML_DIR,
    timeout: 5 * 60_000,
    env:     { ...process.env, PYTHONPATH: ML_DIR },
  });

  if (stdout) console.log(`[TrainWorker] train.py: ${stdout.slice(-300)}`);
  if (stderr && !stderr.includes("UserWarning")) {
    console.warn(`[TrainWorker] train.py stderr: ${stderr.slice(-200)}`);
  }

  // Reload ML service with new model
  try {
    const res = await fetch(`${ML_URL}/reload`, { method: "POST", signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const json: any = await res.json();
      console.log(`[TrainWorker] ML reloaded — ${json.classes} classes`);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.warn(`[TrainWorker] /reload failed (${err.message}) — restarting via PM2`);
    await execAsync("pm2 restart retal-ml").catch(() => {});
  }

  console.log("[TrainWorker] Daily training complete ✓");
}
