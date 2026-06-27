/**
 * POST /api/import-excel
 * Server-side Excel import — zero client memory pressure.
 * Accepts: multipart/form-data { file: .xlsx/.xlsm, projectId: string }
 * Returns: { added, updated, skipped, failed, errors[] }
 */

import { Router } from "express";
import { requireAuth, AuthRequest } from "../auth.js";
import multer from "multer";
import fs from "fs";
import * as XLSX from "xlsx";
import prisma from "../db.js";
import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import { loadKeywordsFromDB, classifyFromKeywordsDB } from "../classifier/keywords.js";

// Helper to run XLSX parsing in a separate thread so it doesn't block the Node event loop
function parseExcelAndDetectHeadersAsync(buffer: Buffer, fieldAliases: Record<string, string[]>): Promise<{ allData: any[], mapping: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const workerCode = `
import { parentPort, workerData } from 'worker_threads';
import * as XLSX from 'xlsx';

const { buffer, fieldAliases } = workerData;

function autoMatch(cols, aliases) {
  for (const c of cols) {
    const cLower = String(c).toLowerCase().trim();
    if (aliases.some(a => cLower === a.toLowerCase())) return String(c);
  }
  return "";
}

try {
  const wb = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false, sheetStubs: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  
  let headerRowIndex = 0;
  let maxMatches = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const cols = rawRows[i].map(c => String(c) || "");
    let matches = 0;
    for (const aliases of Object.values(fieldAliases)) {
      if (autoMatch(cols, aliases)) matches++;
    }
    if (matches > maxMatches) { 
      maxMatches = matches; 
      headerRowIndex = i; 
    }
    if (maxMatches >= 3) break;
    if (i >= 1000) break;
  }

  const allData = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });
  
  const cols = Object.keys(allData[0] || {});
  const mapping = {};
  for (const [key, aliases] of Object.entries(fieldAliases)) {
    mapping[key] = autoMatch(cols, aliases);
  }

  parentPort.postMessage({ allData, mapping });
} catch (err) {
  throw err;
}
    `;
    const tempFile = path.join(os.tmpdir(), `worker-${Date.now()}.mjs`);
    fs.writeFileSync(tempFile, workerCode);
    
    const worker = new Worker(tempFile, { workerData: { buffer, fieldAliases } });
    worker.on("message", (msg) => {
      resolve(msg);
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    });
    worker.on("error", (err) => {
      reject(err);
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    });
    worker.on("exit", code => {
      if (code !== 0) reject(new Error("Worker stopped with exit code " + code));
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    });
  });
}

const router = Router();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
});

// ── helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function autoMatch(columns: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const na = normalize(alias);
    const found = columns.find((c) => {
      const nc = normalize(c);
      return nc === na || nc.includes(na) || na.includes(nc);
    });
    if (found) return found;
  }
  return "";
}

function normalizeVillaNumber(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return cleaned || raw.trim();
}

function normalizeStatus(rawStatus: unknown): string {
  if (rawStatus === null || rawStatus === undefined) return "open";
  const s = String(rawStatus).toLowerCase().trim();
  if (!s || s === "none" || s === "null" || s === "مفتوح" || s === "open" || s === "نشط") return "open";
  if (
    s === "مغلق" || s === "مغلوق" || s === "اغلاق" || s === "إغلاق" ||
    s === "closed" || s === "close" || s === "done" || s === "تم" ||
    s === "منتهي" || s === "منتهى" || s === "مكتمل" || s === "مكتملة" ||
    s === "مكتمله" || s === "completed" || s === "out_of_scope" ||
    s.startsWith("مغلق")
  ) return "closed";
  return "open";
}

function excelSerialToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000);
}

function normalizeDate(raw: unknown): string {
  if (!raw) return new Date().toISOString().split("T")[0];
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().split("T")[0];
  if (typeof raw === "number" && raw > 1000 && raw < 100000) {
    const d = excelSerialToDate(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  const str = String(raw);
  const parts = str.split("/");
  if (parts.length === 3) {
    let [day, month, year] = parts;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return str.split("T")[0] || new Date().toISOString().split("T")[0];
}

function normalizeClosedAt(raw: unknown, issuedAt: string): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString();
  if (typeof raw === "number" && raw > 40000) {
    const d = excelSerialToDate(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const str = String(raw);
  if (str) {
    const d = new Date(normalizeDate(str));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return issuedAt ? new Date(issuedAt).toISOString() : new Date().toISOString();
}

function resolveExcelTypes(rawExcelType: string, typeMap: Map<string, string>): string[] {
  if (!rawExcelType || rawExcelType === "nan" || rawExcelType === "undefined") return [];
  const parts = rawExcelType.split(/[،,\/]/g).map((p) => p.trim()).filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    for (const [key, nameAr] of typeMap) {
      if (nameAr === part || nameAr.includes(part) || part.includes(nameAr)) {
        if (!resolved.includes(key)) resolved.push(key);
        break;
      }
    }
  }
  return resolved;
}

// ── main route ───────────────────────────────────────────────────────────────

router.post("/", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "لم يتم رفع ملف" });

  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendProgress = (p: number) => {
    res.write(JSON.stringify({ progress: p }) + "\n");
  };

  sendProgress(0.05);

  const projectId = req.body.projectId as string;
  if (!projectId) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "projectId مطلوب" });
  }

  const filePath = req.file.path;

  try {
    // ── 1. Load project info ─────────────────────────────────────────────────
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, abbreviation: true },
    });
    if (!project) {
      fs.unlinkSync(filePath);
      res.write(JSON.stringify({ error: "المشروع غير موجود" }) + "\n");
      return res.end();
    }
    const projectAbbr = (project.abbreviation || "").toUpperCase();

    // ── 2 & 3. Parse Excel Asynchronously in a Worker Thread ──────────────────
    const buffer = fs.readFileSync(filePath);
    fs.unlinkSync(filePath); // حذف الملف المؤقت فوراً
    
    const fieldAliases: Record<string, string[]> = {
      ticketId:    ["رقم التذكرة", "ID", "id", "الرقم", "#", "رقم الطلب", "Case Number"],
      villaNumber: ["رقم الفيلا", "فيلا", "villa", "رقم الوحدة", "الوحدة", "Unit"],
      createdAt:   ["التاريخ", "date", "تاريخ الإنشاء", "issuedAt", "Opened Date"],
      description: ["الوصف", "وصف", "description", "المشكلة", "الملاحظات"],
      status:      ["حالة الإغلاق", "الحالة", "status", "حالة التذكرة", "حالة الاغلاق"],
      closedAt:    ["تاريخ الاغلاق", "تاريخ الإغلاق", "تاريخ الغلق", "closed date"],
      excelType:   ["تصنيف التذاكر", "التصنيف", "نوع التذاكر", "نوع المشكلة"],
    };

    const { allData, mapping } = await parseExcelAndDetectHeadersAsync(buffer, fieldAliases);

    if (allData.length === 0) {
      res.write(JSON.stringify({ error: "الملف فارغ أو لا يحتوي على بيانات" }) + "\n");
      return res.end();
    }

    // ── 4. Load reference data + keywords cache (مرة واحدة للكل) ─────────────
    const [existingRows, clientRows, ticketTypes, keywordsCache] = await Promise.all([
      prisma.ticket.findMany({
        where: { projectId },
        select: { id: true, ticketId: true, type: true, status: true, closedAt: true },
      }),
      prisma.client.findMany({
        where: { projectId },
        select: { id: true, villaNumber: true, name: true },
      }),
      prisma.ticketType.findMany({ select: { id: true, key: true, nameAr: true } }),
      loadKeywordsFromDB(),
    ]);

    const existingMap = new Map(existingRows.map((t) => [String(t.ticketId).trim(), t]));
    const clientMap = new Map(clientRows.map((c) => [normalizeVillaNumber(String(c.villaNumber)), c]));

    // ── 4.5 Filter old data if DB already has tickets (Save Memory & Time) ───
    let cutoffTime = 0;
    if (existingRows.length > 0) {
      let maxTime = 0;
      for (const row of allData) {
        const rawDate = row[mapping["createdAt"]];
        if (!rawDate) continue;
        const dStr = normalizeDate(rawDate);
        if (dStr) {
          const t = new Date(dStr).getTime();
          if (t > maxTime) maxTime = t;
        }
      }
      if (maxTime > 0) {
        cutoffTime = maxTime - (35 * 24 * 60 * 60 * 1000); // 35 days ago from latest excel ticket
      }
    }

    // Extract only needed fields — free the rest from memory
    const NEEDED_COLS = new Set(Object.values(mapping).filter(Boolean));
    const rows = [];
    let skippedByDateFilter = 0;

    for (let index = 0; index < allData.length; index++) {
      if (index % 5000 === 0) await new Promise(r => setImmediate(r)); // Yield event loop to prevent freezing
      const row = allData[index];
      if (cutoffTime > 0) {
        const rawStatus = row[mapping["status"]];
        const status = normalizeStatus(rawStatus);
        
        if (status === "closed") {
          const tId = String(row[mapping["ticketId"]] || "").trim();
          const existing = existingMap.get(tId);
          
          let shouldSkip = false;
          const rawDate = row[mapping["createdAt"]];
          const dStr = normalizeDate(rawDate);
          const t = dStr ? new Date(dStr).getTime() : 0;
          
          if (t > 0 && t < cutoffTime) {
            if (!existing) {
              shouldSkip = true; // Old, closed, not in DB -> ignore
            } else if (existing.status === "closed") {
              shouldSkip = true; // Old, closed, already closed in DB -> ignore
            }
          }
          
          if (shouldSkip) {
            skippedByDateFilter++;
            continue;
          }
        }
      }
      
      const r: any = {};
      for (const col of NEEDED_COLS) r[col] = row[col];
      rows.push(r);
    }
    // Free the full data array
    allData.length = 0;
    const typeIdMap = new Map(ticketTypes.map((t) => [t.key, t.id]));
    const typeNameMap = new Map(ticketTypes.map((t) => [t.key, t.nameAr]));

    sendProgress(0.2);

    // ── 5. Process rows ───────────────────────────────────────────────────────
    const toCreate: any[] = [];
    const toUpdate: { id: string; status: string; closedAt: string | null; type?: string; typeId?: string; detectedTypes?: string[] }[] = [];
    let skippedInFile = 0;  // مكرر داخل الملف
    let skippedInDB  = 0;   // موجود في DB ولم يتغير
    const errors: string[] = [];
    const seenInFile = new Set<string>(); // للكشف عن مكررات الملف نفسه

    const KEYWORD_MIN_SCORE = 2; // score 2 = مطابقتان = ثقة كافية

    for (let index = 0; index < rows.length; index++) {
      if (index % 5000 === 0) await new Promise(r => setImmediate(r)); // Yield event loop
      const row = rows[index];
      try {
        const get = (key: string) => {
          const col = mapping[key];
          return col ? row[col] : undefined;
        };

        const ticketId = String(get("ticketId") || "").trim();
        if (!ticketId) { skippedInFile++; continue; }

        // كشف مكررات الملف نفسه
        if (seenInFile.has(ticketId)) { skippedInFile++; continue; }
        seenInFile.add(ticketId);

        const description = String(get("description") || "").trim();
        
        // تجاهل صفوف المواعيد التي يتم تصديرها من النظام (كأنها تذاكر جديدة)
        if ((description.startsWith("الموعد") || description.startsWith("موعد")) && description.length < 100) {
          skippedInFile++; 
          continue;
        }

        const rawVilla = String(get("villaNumber") || "").trim();
        const cleanVilla = normalizeVillaNumber(rawVilla);
        const refNumber = cleanVilla ? `${projectAbbr}-${cleanVilla}` : "";

        const rawStatus = get("status");
        const status = normalizeStatus(rawStatus);
        const issuedAt = normalizeDate(get("createdAt"));
        const closedAt = status === "closed"
          ? (normalizeClosedAt(get("closedAt"), issuedAt) ?? new Date(issuedAt).toISOString())
          : normalizeClosedAt(get("closedAt"), issuedAt);

        const rawExcelType = String(get("excelType") || "").trim();
        const excelTypes = resolveExcelTypes(rawExcelType, typeNameMap);

        // ── تصنيف: Excel أولاً، ثم Keyword classifier ──────────────────────
        let finalTypes = excelTypes;
        let finalType  = excelTypes[0] || "";
        let finalSubTypeId: string | null = null;

        if (!finalType && description.length >= 4) {
          // لا يوجد تصنيف في الملف → نستخدم keyword classifier مباشرة
          const kwResult = classifyFromKeywordsDB(description, keywordsCache);
          if (kwResult.primaryType !== "unclassified" && kwResult.confidence >= KEYWORD_MIN_SCORE) {
            finalType      = kwResult.primaryType;
            finalTypes     = kwResult.allTypes;
            finalSubTypeId = kwResult.subTypeId || null;
          }
        }

        if (!finalType) finalType = "unclassified";
        const finalTypeId = typeIdMap.get(finalType) || null;

        const client = clientMap.get(cleanVilla);
        const clientId = client?.id || null;
        const clientName = client?.name || "";

        // Duplicate check (DB)
        const existing = existingMap.get(ticketId);
        if (existing) {
          const statusChanged = existing.status !== status;
          const typeNeedsUpdate =
            (!existing.type || existing.type === "unclassified") &&
            finalType !== "unclassified";

          if (statusChanged || typeNeedsUpdate) {
            const upd: any = { id: existing.id, status, closedAt };
            if (typeNeedsUpdate) {
              upd.type = finalType;
              upd.typeId = finalTypeId;
              upd.detectedTypes = finalTypes;
            }
            toUpdate.push(upd);
          } else {
            skippedInDB++;
          }
          continue;
        }

        toCreate.push({
          ticketId,
          refNumber,
          projectAbbr,
          projectId,
          clientId,
          clientName,
          villaNumber: cleanVilla || rawVilla,
          issuedAt,
          description,
          type: finalType,
          typeId: finalTypeId,
          subTypeId: finalSubTypeId,
          status,
          priority: 3,
          assigneeName: null,
          assignedSupervisorId: null,
          assignedSupervisorIds: [],
          detectedTypes: finalTypes,
          closedAt: closedAt ? new Date(closedAt) : null,
        });
      } catch (err: any) {
        errors.push(String(err.message));
      }
    }

    sendProgress(0.4);

    // ── 6. Bulk create in batches ──────────────────────────────────────────────
    const BATCH = 200;
    let added = 0;
    let failed = 0;

    for (let i = 0; i < toCreate.length; i += BATCH) {
      const batch = toCreate.slice(i, i + BATCH);
      try {
        const result = await prisma.ticket.createMany({ data: batch, skipDuplicates: true });
        added += result.count;
      } catch (err: any) {
        failed += batch.length;
        errors.push(`batch ${i}-${i + BATCH}: ${err.message}`);
      }
    }

    // ── 7. Bulk update status/type ─────────────────────────────────────────────
    let updated = 0;
    if (toUpdate.length > 0) {
      const BATCH_UPD = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH_UPD) {
        const batch = toUpdate.slice(i, i + BATCH_UPD);
        const updatePromises = batch.map((u) =>
          prisma.ticket.update({
            where: { id: u.id },
            data: {
              status: u.status as any,
              closedAt: u.closedAt ? new Date(u.closedAt) : null,
              ...(u.type && u.type !== "unclassified"
                ? { type: u.type, typeId: u.typeId || null, detectedTypes: u.detectedTypes ?? [u.type] }
                : {}),
            },
          }).catch((err) => {
            console.error(`[ImportUpdateError] ticket ${u.id}:`, err);
            return null;
          })
        );
        const results = await Promise.all(updatePromises);
        updated += results.filter(Boolean).length;
        sendProgress(0.7 + (i / toUpdate.length) * 0.25);
      }
    }

    // ── 7.5 Close missing tickets if requested ─────────────────────────────────
    let closedMissingCount = 0;
    if (req.body.closeMissingTickets === "true") {
      // Collect all valid ticketIds found in the file
      const fileTicketIds = new Set(
        rows.map(r => {
          const tId = r[mapping["ticketId"]];
          return tId ? String(tId).trim() : "";
        }).filter(Boolean)
      );

      // Find all existing open tickets that are NOT in the file
      const missingToUpdate = existingRows.filter(t => t.status !== "closed" && !fileTicketIds.has(String(t.ticketId).trim()));
      
      if (missingToUpdate.length > 0) {
        const missingIds = missingToUpdate.map(t => t.id);
        const BATCH_MIS = 200;
        for (let i = 0; i < missingIds.length; i += BATCH_MIS) {
          const batch = missingIds.slice(i, i + BATCH_MIS);
          await prisma.ticket.updateMany({
            where: { id: { in: batch } },
            data: { status: "closed", closedAt: new Date() }
          });
          closedMissingCount += batch.length;
        }
      }
    }

    sendProgress(0.98);

    // ── 8. Log ─────────────────────────────────────────────────────────────────
    const classifiedCount = toCreate.filter(t => t.type !== 'unclassified').length;
    const unclassifiedCount = toCreate.filter(t => t.type === 'unclassified').length;
    console.log(
      `[ImportExcel] ${project.name} | ` +
      `ملف: ${rows.length} صف | تجاوز لقدامتها: ${skippedByDateFilter} | جديد: ${added} (مصنف: ${classifiedCount}, غير مصنف: ${unclassifiedCount}) | ` +
      `تحديث: ${updated} | إغلاق مفقود: ${closedMissingCount} | مكرر في الملف: ${skippedInFile} | موجود بدون تغيير: ${skippedInDB} | فشل: ${failed}`
    );

    // Save to import history
    try {
      const existing = await prisma.systemSetting.findUnique({ where: { key: "importHistory" } });
      const history: any[] = (existing?.value as any[]) || [];
      history.unshift({
        timestamp: new Date().toISOString(),
        project: project.name,
        fileRows: rows.length,
        skippedByDateFilter,
        added, updated, closedMissing: closedMissingCount, skippedInFile, skippedInDB, failed,
        mode: "server-side",
      });
      await prisma.systemSetting.upsert({
        where: { key: "importHistory" },
        create: { key: "importHistory", value: history.slice(0, 50) },
        update: { value: history.slice(0, 50) },
      });
    } catch { /* non-critical */ }

    res.write(JSON.stringify({
      done: true,
      result: {
        ok: true,
        added,
        updated,
        closedMissing: closedMissingCount,
        skippedByDateFilter,
        skippedInFile,
        skippedInDB,
        failed,
        classified: classifiedCount,
        unclassified: unclassifiedCount,
        errors: errors.slice(0, 10),
      }
    }) + "\n");
    res.end();
  } catch (err: any) {
    // Clean up temp file on error
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error("[ImportExcel] error:", err);
    res.write(JSON.stringify({ error: err.message || "فشل الاستيراد" }) + "\n");
    res.end();
  }
});

export default router;
