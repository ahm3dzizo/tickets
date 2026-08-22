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
import { normalizeArabic, classifyFromKeywordsDB, loadKeywordsFromDB } from "../classifier/keywords.js";
import { buildTypeToSpecialtyMap } from "../classifier/db-helpers.js";

// بيحلل ملف الإكسل ويكتشف صف العناوين، ويفلتر التذاكر المغلقة القديمة جداً.
// (كان ده شغال في worker thread منفصل عبر ملف مؤقت، لكن نصوص القالب المتداخلة
// جوه الكود كانت بتتفسر غلط، وملف الـ worker المؤقت في /tmp مكانش قادر يلاقي
// حزمة xlsx أصلاً — فالاستيراد كان بيفشل. التحليل نفسه سريع جداً حتى لآلاف
// الصفوف، فمفيش داعي لتعقيد الـ worker thread من الأساس.)
function parseExcelAndDetectHeaders(
  buffer: Buffer, 
  fieldAliases: Record<string, string[]>, 
  skipDateFilter: boolean = false
): { allData: any[], mapping: Record<string, string>, skippedByDateFilter: number, detectedFormat: "DD/MM/YYYY" | "MM/DD/YYYY" } {
  const wb = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false, sheetStubs: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let headerRowIndex = 0;
  let maxMatches = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const cols = rawRows[i].map((c) => String(c) || "");
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

  const allData: any[] = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });

  const cols = Object.keys(allData[0] || {});
  const mapping: Record<string, string> = {};
  for (const [key, aliases] of Object.entries(fieldAliases)) {
    mapping[key] = autoMatch(cols, aliases);
  }

  // ============================================================
  // Detect Excel Date Format using the LAST VALID DATE in the
  // SAME EXCEL FILE and the CURRENT MONTH in Saudi Arabia.
  //
  // Example in August:
  //
  //   18/08/2026
  //    ^  ^
  //    |  +-- current month => DD/MM/YYYY
  //
  //   08/18/2026
  //    ^
  //    +----- current month => MM/DD/YYYY
  //
  // We intentionally do NOT use the database date here.
  // We also do NOT use "max first part / max second part",
  // because that can silently reverse ambiguous dates.
  // ============================================================

  let detectedFormat: "DD/MM/YYYY" | "MM/DD/YYYY" = "DD/MM/YYYY";

  if (mapping["createdAt"]) {
    // Current month according to Saudi Arabia timezone.
    const saudiNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })
    );
    const currentMonth = saudiNow.getMonth() + 1;

    let lastDateParts: { first: number; second: number } | null = null;

    // Search from the END of the Excel file.
    // The last valid ticket date is our reference.
    for (let i = allData.length - 1; i >= 0; i--) {
      const rawDate = allData[i][mapping["createdAt"]];

      if (typeof rawDate !== "string") continue;

      const str = rawDate.trim();
      if (!str || !str.includes("/")) continue;

      const parts = str.split("/");

      if (parts.length < 2) continue;

      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);

      if (
        Number.isInteger(first) &&
        Number.isInteger(second) &&
        first >= 1 &&
        first <= 31 &&
        second >= 1 &&
        second <= 31
      ) {
        lastDateParts = { first, second };
        break;
      }
    }

    if (lastDateParts) {
      const { first, second } = lastDateParts;

      if (first === currentMonth && second !== currentMonth) {
        // Example: 08/18/2026 in August
        detectedFormat = "MM/DD/YYYY";
      } else if (second === currentMonth && first !== currentMonth) {
        // Example: 18/08/2026 in August
        detectedFormat = "DD/MM/YYYY";
      } else {
        // Ambiguous or unrelated month:
        // keep Saudi Arabia default.
        detectedFormat = "DD/MM/YYYY";
      }

      console.log(
        `[IMPORT DATE FORMAT] Last Excel date: ${first}/${second} | ` +
        `Current Saudi month: ${currentMonth} | ` +
        `Detected: ${detectedFormat}`
      );
    } else {
      console.warn(
        "[IMPORT DATE FORMAT] No valid slash-formatted date found in Excel; " +
        "using default DD/MM/YYYY"
      );
    }
  }

  let maxTime = 0;
  if (!skipDateFilter && mapping["createdAt"]) {
    for (const row of allData) {
      const rawDate = row[mapping["createdAt"]];
      const dStr = normalizeDate(rawDate, detectedFormat);
      if (dStr) {
        const t = new Date(dStr).getTime();
        if (t > maxTime) maxTime = t;
      }
    }
  }

  const cutoffTime = (!skipDateFilter && maxTime > 0) ? maxTime - 35 * 24 * 60 * 60 * 1000 : 0;
  let skippedByDateFilter = 0;

  const NEEDED_COLS = Object.values(mapping).filter(Boolean);
  const rows: any[] = [];

  for (const row of allData) {
    if (cutoffTime > 0) {
      const rawStatus = row[mapping["status"]];
      const status = normalizeStatus(rawStatus);
      if (status === "closed") {
        const rawDate = row[mapping["createdAt"]];
        const dStr = normalizeDate(rawDate, detectedFormat);
        const t = dStr ? new Date(dStr).getTime() : 0;
        if (t > 0 && t < cutoffTime) {
          skippedByDateFilter++;
          continue;
        }
      }
    }
    const r: any = {};
    for (const col of NEEDED_COLS) r[col] = row[col];
    rows.push(r);
  }

  return { allData: rows, mapping, skippedByDateFilter, detectedFormat };
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

// إزالة الأصفار البادئة من رقم التذكرة (مثال: "0019350" → "19350")
function normalizeTicketId(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10));
  return trimmed;
}

function autoMatch(columns: string[], aliases: string[]): string {
  // IMPORTANT:
  // Never use broad includes() matching here.
  // It can map one Excel column to another unrelated column.
  //
  // Matching priority:
  // 1) Exact normalized alias
  // 2) Very conservative match after removing punctuation
  //
  // We intentionally DO NOT use:
  //   nc.includes(na) || na.includes(nc)
  // because it caused wrong column mappings in some project files.

  const clean = (value: unknown): string =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, "");

  const normalizedColumns = columns
    .filter(Boolean)
    .map((column) => ({
      original: column,
      normalized: clean(column),
    }));

  // 1) Exact match
  for (const alias of aliases) {
    const na = clean(alias);
    if (!na) continue;

    const exact = normalizedColumns.find((c) => c.normalized === na);
    if (exact) return exact.original;
  }

  // 2) Conservative fallback:
  // only allow alias/column to differ by common wording such as
  // "تاريخ الإنشاء" vs "تاريخ الانشاء".
  const arabicNormalize = (value: string): string =>
    value
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه");

  for (const alias of aliases) {
    const na = arabicNormalize(clean(alias));
    if (!na) continue;

    const matches = normalizedColumns.filter(
      (c) => arabicNormalize(c.normalized) === na
    );

    if (matches.length === 1) return matches[0].original;
  }

  return "";
}

function normalizeUnitNumber(raw: string): string {
  if (!raw) return "";

  const value = String(raw).trim();
  if (!value) return "";

  // IMPORTANT:
  // Do NOT remove every non-digit character.
  // Example: "ES2-1863" must become "1863", NOT "21863".
  //
  // If the value has a project/prefix followed by "-" and digits,
  // use only the trailing unit number.
  const prefixed = value.match(/^[A-Za-z]+\d+[-_/ ]+(\d+)$/);
  if (prefixed) {
    return String(parseInt(prefixed[1], 10));
  }

  // Also support values such as:
  // "Villa 1863", "Unit 1863", "الوحدة 1863"
  const labeled = value.match(/^(?:villa|unit|الوحدة|فيلا)\s*[-:/#]?\s*(\d+)$/i);
  if (labeled) {
    return String(parseInt(labeled[1], 10));
  }

  // Pure numeric values: only remove leading zeros.
  // "001863" -> "1863"
  // "21863"  -> "21863" (DO NOT change it)
  if (/^\d+$/.test(value)) {
    return String(parseInt(value, 10));
  }

  // If there is a trailing numeric part after a separator,
  // use that number rather than concatenating prefix digits.
  const trailing = value.match(/[-_/ ]+(\d+)$/);
  if (trailing) {
    return String(parseInt(trailing[1], 10));
  }

  // Unknown format: keep it unchanged instead of corrupting the number.
  return value;
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

function normalizeDate(
  raw: unknown,
  formatHint: "DD/MM/YYYY" | "MM/DD/YYYY" = "DD/MM/YYYY"
): string {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return new Date().toISOString().split("T")[0];
  }

  // Native Excel date object
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().split("T")[0];
  }

  // Excel serial number
  if (typeof raw === "number" && raw > 1000 && raw < 100000) {
    const d = excelSerialToDate(raw);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  }

  const str = String(raw).trim();

  // ------------------------------------------------------------
  // Handle dates such as:
  // 8/16/2026, 1:22 PM
  // 18/08/2026, 1:22 PM
  // 8/16/2026
  // 18/08/2026
  // ------------------------------------------------------------

  const match = str.match(
    /^(\\d{1,2})[\\/](\\d{1,2})[\\/](\\d{2,4})(?:\\s*,?\\s+.*)?$/
  );

  if (match) {
    let [, first, second, year] = match;

    if (year.length === 2) {
      year = `20${year}`;
    }

    let day: string;
    let month: string;

    if (formatHint === "MM/DD/YYYY") {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }

    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (
      Number.isInteger(y) &&
      Number.isInteger(m) &&
      Number.isInteger(d) &&
      y >= 2000 &&
      m >= 1 &&
      m <= 12 &&
      d >= 1 &&
      d <= 31
    ) {
      const result = new Date(
        Date.UTC(y, m - 1, d, 12, 0, 0)
      );

      // Prevent JS from silently converting invalid dates
      if (
        result.getUTCFullYear() === y &&
        result.getUTCMonth() === m - 1 &&
        result.getUTCDate() === d
      ) {
        return result.toISOString().split("T")[0];
      }
    }
  }

  // ISO / native formats
  const nativeDate = new Date(str);

  if (!isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString().split("T")[0];
  }

  return str.split("T")[0] || new Date().toISOString().split("T")[0];
}

function normalizeClosedAt(raw: unknown, issuedAt: string, formatHint: "DD/MM/YYYY" | "MM/DD/YYYY" = "DD/MM/YYYY"): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString();
  if (typeof raw === "number" && raw > 40000) {
    const d = excelSerialToDate(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const str = String(raw);
  if (str) {
    const d = new Date(normalizeDate(str, formatHint));
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
  const closeMissingTickets = true; // دايمًا نغلق المفقودة تلقائياً

  const filePath = req.file.path;

  try {
    // ── 1. Load project info ─────────────────────────────────────────────────
    const [project, existingTicketsCount] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, abbreviation: true },
      }),
      prisma.ticket.count({ where: { projectId } }),
    ]);
    if (!project) {
      fs.unlinkSync(filePath);
      res.write(JSON.stringify({ error: "المشروع غير موجود" }) + "\n");
      return res.end();
    }
    const projectAbbr = (project.abbreviation || "").toUpperCase();
    const isFirstImport = existingTicketsCount === 0;
    const shouldSkipDateFilter = isFirstImport || req.body.skipDateFilter === "true" || req.body.skipDateFilter === true;

    // ── 2 & 3. Parse Excel + detect headers ──────────────────────────────────
    const buffer = fs.readFileSync(filePath);
    fs.unlinkSync(filePath); // حذف الملف المؤقت فوراً
    
    const fieldAliases: Record<string, string[]> = {
      ticketId:    ["رقم التذكرة", "ID", "id", "الرقم", "#", "رقم الطلب", "Case Number"],
      villaNumber: ["رقم الفيلا", "فيلا", "villa", "رقم الوحدة", "الوحدة", "Unit"],
      createdAt:   [
        "التاريخ",
        "date",
        "تاريخ الإنشاء",
        "issuedAt",
        "Opened Date",
        "Date/Time Opened",
        "Date / Time Opened",
        "Date Time Opened"
      ],
      description: ["وصف المشكلة", "الوصف", "وصف", "description", "المشكلة", "الملاحظات"],
      status:      ["حالة الإغلاق", "الحالة", "status", "حالة التذكرة", "حالة الاغلاق"],
      closedAt:    ["تاريخ الاغلاق", "تاريخ الإغلاق", "تاريخ الغلق", "closed date"],
      excelType:   ["تصنيف التذاكر", "التصنيف", "نوع التذاكر", "نوع المشكلة"],
    };

    const { allData, mapping, skippedByDateFilter, detectedFormat } = parseExcelAndDetectHeaders(buffer, fieldAliases, shouldSkipDateFilter);

    if (allData.length === 0) {
      res.write(JSON.stringify({ error: "الملف فارغ أو لا يحتوي على بيانات" }) + "\n");
      return res.end();
    }

    // ── 4. Load reference data + keywords cache (مرة واحدة للكل) ─────────────
    const [existingRows, unitRows, ticketTypes, keywordsCache, typeToSpecialty, projectSups] = await Promise.all([
      prisma.ticket.findMany({
        where: { projectId },
        select: { id: true, ticketId: true, type: true, status: true, closedAt: true, clientId: true, unitId: true, description: true },
      }),
      prisma.unit.findMany({
        where: { projectId },
        include: { clients: { include: { client: true } } },
      }),
      prisma.ticketType.findMany({ select: { id: true, key: true, nameAr: true } }),
      loadKeywordsFromDB(),
      buildTypeToSpecialtyMap(),
      prisma.user.findMany({
        where: { role: "supervisor", projects: { some: { id: projectId } } },
        select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } } },
      })
    ]);

    const allSups = projectSups.length > 0 ? projectSups : await prisma.user.findMany({
      where: { role: "supervisor" },
      select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } } },
    });

    const getSpecs = (u: any): string[] => {
      if (Array.isArray(u.specialtiesRef) && u.specialtiesRef.length > 0) return u.specialtiesRef.map((s: any) => s.key);
      return ["general"];
    };

    const existingMap = new Map(existingRows.map((t) => [normalizeTicketId(String(t.ticketId).trim()), t]));
    const clientMap = new Map(unitRows.map((u) => {
      const primaryClient = u.clients.find(c => c.isPrimary)?.client || u.clients[0]?.client;
      return [normalizeUnitNumber(String(u.unitNumber)), { unitId: u.id, clientId: primaryClient?.id || null, name: primaryClient?.name || "" }];
    }));

    // ── Build waiting-status map to inherit for new tickets ───────────────
    const waitingByUnit = new Map<string, boolean>();
    const waitingByClient = new Map<string, boolean>();

    for (const t of existingRows) {
      if (t.status !== "waiting") continue;
      if (t.unitId) waitingByUnit.set(t.unitId, true);
      if (t.clientId) waitingByClient.set(t.clientId, true);
    }

    const rows = allData;
    const typeIdMap = new Map(ticketTypes.map((t) => [t.key, t.id]));
    const typeNameMap = new Map(ticketTypes.map((t) => [t.key, t.nameAr]));

    sendProgress(0.2);

    // ── 5. Process rows ───────────────────────────────────────────────────────
    const toCreate: any[] = [];
    const toUpdate: {
      id: string;
      status: string;
      closedAt: string | null;
      description?: string;
      type?: string;
      typeId?: string;
      detectedTypes?: string[];
      assigneeName?: string | null;
      assignedSupervisorIds?: string[];
    }[] = [];
    let skippedInFile = 0;  // مكرر داخل الملف
    let skippedInDB  = 0;   // موجود في DB ولم يتغير
    const errors: string[] = [];
    const seenInFile = new Set<string>(); // للكشف عن مكررات الملف نفسه

    const KEYWORD_MIN_SCORE = 1; // score 1 matches old unified import

    for (let index = 0; index < rows.length; index++) {
      if (index % 25 === 0) await new Promise(r => setImmediate(r)); // Yield event loop often enough that the whole app doesn't freeze during large imports
      const row = rows[index];
      try {
        const get = (key: string) => {
          const col = mapping[key];
          return col ? row[col] : undefined;
        };

        const rawTicketIdStr = String(get("ticketId") || "").trim();
        const ticketId = normalizeTicketId(rawTicketIdStr);
        if (!ticketId) { skippedInFile++; continue; }

        // تجاهل صفوف الـ Subtotal/Total في تقارير Salesforce:
        // هذه الصفوف تحتوي على رقم تذكرة (مثل 86) لكن بدون تاريخ ووحدة سكنية
        const rawDate = get("createdAt");
        const rawUnitForCheck = String(get("unitNumber") || "").trim();
        if (!rawDate && !rawUnitForCheck) { skippedInFile++; continue; }

        // كشف مكررات الملف نفسه
        if (seenInFile.has(ticketId)) { skippedInFile++; continue; }
        seenInFile.add(ticketId);

        const description = String(get("description") || "").trim();
        
        // تجاهل صفوف المواعيد التي يتم تصديرها من النظام (كأنها تذاكر جديدة)
        if ((description.startsWith("الموعد") || description.startsWith("موعد")) && description.length < 100) {
          skippedInFile++; 
          continue;
        }

        const rawUnit = String(get("unitNumber") || "").trim();
        const cleanUnit = normalizeUnitNumber(rawUnit);

        const rawStatus = get("status");
        const status = normalizeStatus(rawStatus);
        const issuedAt = normalizeDate(get("createdAt"), detectedFormat);
        const closedAt = status === "closed"
          ? (normalizeClosedAt(get("closedAt"), issuedAt, detectedFormat) ?? new Date(issuedAt).toISOString())
          : normalizeClosedAt(get("closedAt"), issuedAt, detectedFormat);

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

        const unitData = clientMap.get(cleanUnit);
        const clientId = unitData?.clientId || null;
        const unitId = unitData?.unitId || null;

        // ── Assign Supervisors based on Final Types ──────────────────────────
        const requiredSpecialties = [...new Set(finalTypes.map((t: string) => typeToSpecialty[t] || "general"))];
        const matchedSups = allSups.filter((s: any) => getSpecs(s).some((sp: string) => requiredSpecialties.includes(sp)));
        const finalSups = matchedSups.length > 0 ? matchedSups : allSups.filter((s: any) => getSpecs(s).includes("general"));
        const supervisorList = finalSups.length > 0 ? finalSups : allSups;
        const supervisorIds = supervisorList.map((s: any) => s.uid);
        const primarySup = supervisorList[0];

        // Duplicate check (DB)
        const existing = existingMap.get(ticketId);
        if (existing) {
          // التحديث: الوصف والتصنيف فقط — الحالة لا تتغير أبداً عند الاستيراد
          const typeNeedsUpdate =
            (!existing.type || existing.type === "unclassified") &&
            finalType !== "unclassified";

          const descriptionNeedsUpdate = description && existing.description !== description;

          if (typeNeedsUpdate || descriptionNeedsUpdate) {
            const upd: any = { id: existing.id };
            if (descriptionNeedsUpdate) {
              upd.description = description;
            }
            if (typeNeedsUpdate) {
              upd.type = finalType;
              upd.typeId = finalTypeId;
              upd.detectedTypes = finalTypes;
              upd.assigneeName = primarySup?.displayName || null;
              upd.assignedSupervisorIds = supervisorIds;
            }
            toUpdate.push(upd);
          } else {
            skippedInDB++;
          }
          continue;
        }

        // Inherit waiting status for new tickets matching same unit/client
        const inheritWaiting =
          (unitId && waitingByUnit.get(unitId)) ||
          (clientId && waitingByClient.get(clientId)) ||
          false;

        toCreate.push({
          ticketId,
          projectId,
          unitId,
          clientId,
          issuedAt,
          description,
          type: finalType,
          typeId: finalTypeId,
          subTypeId: finalSubTypeId,
          status: inheritWaiting ? "waiting" : status,
          priority: 3,
          assigneeName: primarySup?.displayName || null,
          assignedSupervisorIds: supervisorIds,
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
              ...(u.status ? { status: u.status as any, closedAt: u.closedAt ? new Date(u.closedAt) : null } : {}),
              ...(u.description ? { description: u.description } : {}),
              ...(u.type && u.type !== "unclassified"
                ? {
                    type: u.type,
                    typeId: u.typeId || null,
                    detectedTypes: u.detectedTypes ?? [u.type],
                    assigneeName: u.assigneeName,
                    assignedSupervisorIds: u.assignedSupervisorIds,
                  }
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

    // ── 7.5 Close open tickets not present in the file (only if explicitly requested) ──
    let closedMissingCount = 0;
    let missingCount = 0;
    {
      const fileTicketIds = new Set(
        rows.map(r => {
          const tId = r[mapping["ticketId"]];
          return tId ? normalizeTicketId(String(tId).trim()) : "";
        }).filter(Boolean)
      );

      const missingToUpdate = existingRows.filter(t => t.status !== "closed" && !fileTicketIds.has(normalizeTicketId(String(t.ticketId).trim())));
      missingCount = missingToUpdate.length;

      if (closeMissingTickets && missingToUpdate.length > 0) {
        const missingIds = missingToUpdate.map(t => t.id);
        const BATCH_MIS = 200;
        for (let i = 0; i < missingIds.length; i += BATCH_MIS) {
          const batch = missingIds.slice(i, i + BATCH_MIS);
          await prisma.ticket.updateMany({
            where: { id: { in: batch } },
            data: { status: "closed", closedAt: new Date() }
          });
          const auditData = batch.map(id => {
            const oldStatus = missingToUpdate.find(t => t.id === id)?.status || "open";
            return {
              ticketId: id,
              field: "status",
              oldValue: oldStatus,
              newValue: "closed",
              changedBy: "النظام (إغلاق تلقائي بسبب عدم وجود التذكرة في ملف الإكسيل المرفوع)",
            };
          });
          if (auditData.length > 0) {
            await prisma.ticketAudit.createMany({ data: auditData });
          }
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
        missingNotClosed: missingCount - closedMissingCount,
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
