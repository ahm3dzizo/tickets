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
function parseExcelAndDetectHeaders(buffer: Buffer, fieldAliases: Record<string, string[]>): { allData: any[], mapping: Record<string, string>, skippedByDateFilter: number } {
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

  let maxTime = 0;
  if (mapping["createdAt"]) {
    for (const row of allData) {
      const rawDate = row[mapping["createdAt"]];
      const dStr = normalizeDate(rawDate);
      if (dStr) {
        const t = new Date(dStr).getTime();
        if (t > maxTime) maxTime = t;
      }
    }
  }

  const cutoffTime = maxTime > 0 ? maxTime - 35 * 24 * 60 * 60 * 1000 : 0;
  let skippedByDateFilter = 0;

  const NEEDED_COLS = Object.values(mapping).filter(Boolean);
  const rows: any[] = [];

  for (const row of allData) {
    if (cutoffTime > 0) {
      const rawStatus = row[mapping["status"]];
      const status = normalizeStatus(rawStatus);
      if (status === "closed") {
        const rawDate = row[mapping["createdAt"]];
        const dStr = normalizeDate(rawDate);
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

  return { allData: rows, mapping, skippedByDateFilter };
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
  const str = String(raw).trim();
  
  // Try native parse first (handles M/D/YYYY like 6/18/2026)
  const nativeDate = new Date(str);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString().split("T")[0];
  }

  // Fallback for DD/MM/YYYY
  const parts = str.split("/");
  if (parts.length === 3) {
    let [day, month, year] = parts;
    if (year.length === 2) year = `20${year}`;
    const fallback = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00Z`);
    if (!isNaN(fallback.getTime())) {
      return fallback.toISOString().split("T")[0];
    }
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
  const closeMissingTickets = req.body.closeMissingTickets === 'true';

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

    // ── 2 & 3. Parse Excel + detect headers ──────────────────────────────────
    const buffer = fs.readFileSync(filePath);
    fs.unlinkSync(filePath); // حذف الملف المؤقت فوراً
    
    const fieldAliases: Record<string, string[]> = {
      ticketId:    ["رقم التذكرة", "ID", "id", "الرقم", "#", "رقم الطلب", "Case Number"],
      villaNumber: ["رقم الفيلا", "فيلا", "villa", "رقم الوحدة", "الوحدة", "Unit"],
      createdAt:   ["التاريخ", "date", "تاريخ الإنشاء", "issuedAt", "Opened Date"],
      description: ["وصف المشكلة", "الوصف", "وصف", "description", "المشكلة", "الملاحظات"],
      status:      ["حالة الإغلاق", "الحالة", "status", "حالة التذكرة", "حالة الاغلاق"],
      closedAt:    ["تاريخ الاغلاق", "تاريخ الإغلاق", "تاريخ الغلق", "closed date"],
      excelType:   ["تصنيف التذاكر", "التصنيف", "نوع التذاكر", "نوع المشكلة"],
    };

    const { allData, mapping, skippedByDateFilter } = parseExcelAndDetectHeaders(buffer, fieldAliases);

    if (allData.length === 0) {
      res.write(JSON.stringify({ error: "الملف فارغ أو لا يحتوي على بيانات" }) + "\n");
      return res.end();
    }

    // ── 4. Load reference data + keywords cache (مرة واحدة للكل) ─────────────
    const [existingRows, unitRows, ticketTypes, keywordsCache, typeToSpecialty, projectSups] = await Promise.all([
      prisma.ticket.findMany({
        where: { projectId },
        select: { id: true, ticketId: true, type: true, status: true, closedAt: true, appointmentTime: true, appointmentAwaitingReply: true, appointmentNotes: true, clientId: true, unitId: true, villaNumber: true, description: true },
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
        select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true },
      })
    ]);

    const allSups = projectSups.length > 0 ? projectSups : await prisma.user.findMany({
      where: { role: "supervisor" },
      select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true },
    });

    const getSpecs = (u: any): string[] => {
      if (Array.isArray(u.specialtiesRef) && u.specialtiesRef.length > 0) return u.specialtiesRef.map((s: any) => s.key);
      if (u.specialty) return [u.specialty];
      return ["general"];
    };

    const existingMap = new Map(existingRows.map((t) => [normalizeTicketId(String(t.ticketId).trim()), t]));
    const clientMap = new Map(unitRows.map((u) => {
      const primaryClient = u.clients.find(c => c.isPrimary)?.client || u.clients[0]?.client;
      return [normalizeVillaNumber(String(u.unitNumber)), { unitId: u.id, clientId: primaryClient?.id || null, name: primaryClient?.name || "" }];
    }));

    // ── Build appointments map to inherit for new tickets ──────────────────
    // القاعدة: الموعد ينتقل للتذاكر الجديدة فقط لو كان في المستقبل (غداً فصاعداً)
    // الموعد اليوم أو قبله يخص التذاكر القديمة ولا ينتقل
    // الملاحظات (appointmentNotes) لا تنتقل لأن رسالة الواتساب ما بُعتتش للتذكرة الجديدة
    const activeAppointmentsByVilla = new Map<string, string>();
    const activeAppointmentsByClient = new Map<string, string>();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // غداً = اليوم التالي بداية من منتصف الليل
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    for (const t of existingRows) {
      if (!t.appointmentTime) continue;
      if (t.status === "closed" || t.status === "out_of_scope") continue;

      const apptDate = new Date(t.appointmentTime);
      // فقط المواعيد المستقبلية (غداً فصاعداً) تنتقل للتذاكر الجديدة
      const isStrictlyFuture = isNaN(apptDate.getTime()) || apptDate >= tomorrowStart;
      if (!isStrictlyFuture) continue;

      if (t.villaNumber) {
        activeAppointmentsByVilla.set(normalizeVillaNumber(String(t.villaNumber)), t.appointmentTime);
      }
      if (t.clientId) {
        activeAppointmentsByClient.set(t.clientId, t.appointmentTime);
      }
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
      assignedSupervisorId?: string | null;
      assignedSupervisorIds?: string[];
      assignedSupervisors?: any[];
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
        const rawVillaForCheck = String(get("villaNumber") || "").trim();
        if (!rawDate && !rawVillaForCheck) { skippedInFile++; continue; }

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

        const unitData = clientMap.get(cleanVilla);
        const clientId = unitData?.clientId || null;
        const unitId = unitData?.unitId || null;
        const clientName = unitData?.name || "";

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
          // الملف يحتوي على عمود حالة → القيمة الموجودة فيه مرجعية (بما فيها إعادة فتح المغلقة)
          // إذا لم يكن فيه عمود حالة → لا تُرجع التذكرة لحالة مفتوحة إذا كانت في حالة متقدمة
          const fileHasStatusColumn = !!mapping["status"];
          let statusChanged = existing.status !== status;
          if (statusChanged && status === 'open') {
            // اسمح بإعادة الفتح فقط لو الملف فيه عمود حالة والتذكرة كانت مغلقة تحديداً
            if (!(fileHasStatusColumn && existing.status === 'closed')) {
              statusChanged = false;
            }
          }
          const typeNeedsUpdate =
            (!existing.type || existing.type === "unclassified") &&
            finalType !== "unclassified";
            
          const descriptionNeedsUpdate = description && existing.description !== description;

          if (statusChanged || typeNeedsUpdate || descriptionNeedsUpdate) {
            const upd: any = { id: existing.id };
            if (statusChanged) {
              upd.status = status;
              if (closedAt) upd.closedAt = closedAt;
            }
            if (descriptionNeedsUpdate) {
              upd.description = description;
            }
            if (typeNeedsUpdate) {
              upd.type = finalType;
              upd.typeId = finalTypeId;
              upd.detectedTypes = finalTypes;
              // Also update supervisors since we now classified it
              upd.assigneeName = primarySup?.displayName || null;
              upd.assignedSupervisorId = primarySup?.uid || null;
              upd.assignedSupervisorIds = supervisorIds;
              upd.assignedSupervisors = supervisorList.map((s: any) => ({ id: s.uid, name: s.displayName, specialty: getSpecs(s)[0] }));
            }
            toUpdate.push(upd);
          } else {
            skippedInDB++;
          }
          continue;
        }

        // ورث الموعد المستقبلي فقط (بدون الملاحظات — رسالة الواتساب ما بُعتتش للتذكرة الجديدة)
        const inheritedTime: string | null =
          (cleanVilla && activeAppointmentsByVilla.get(cleanVilla)) ||
          (clientId && activeAppointmentsByClient.get(clientId)) ||
          null;

        toCreate.push({
          ticketId,
          refNumber,
          projectAbbr,
          projectId,
          unitId,
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
          assigneeName: primarySup?.displayName || null,
          assignedSupervisorId: primarySup?.uid || null,
          assignedSupervisorIds: supervisorIds,
          assignedSupervisors: supervisorList.map((s: any) => ({ id: s.uid, name: s.displayName, specialty: getSpecs(s)[0] })),
          detectedTypes: finalTypes,
          appointmentTime: inheritedTime,
          appointmentNotes: null, // لا نورث الملاحظات — الرسالة لم تُرسل للتذكرة الجديدة
          closedAt: closedAt ? new Date(closedAt) : null,
        });
      } catch (err: any) {
        errors.push(String(err.message));
      }
    }

    sendProgress(0.4);

    // ── 5.5 Second-pass: inherit strictly-future appointments only ──────────
    // يعالج حالات عدم تطابق رقم الفيلا في المرور الأول
    // القاعدة: موعد اليوم أو قبله لا ينتقل — يخص التذاكر القديمة فقط
    // الملاحظات لا تنتقل — رسالة الواتساب لم تُرسل للتذكرة الجديدة
    {
      const villaApptMap2 = new Map<string, string>();
      const clientApptMap2 = new Map<string, string>();

      for (const t of existingRows) {
        if (!t.appointmentTime) continue;
        if (t.status === "closed" || t.status === "out_of_scope") continue;
        const apptDate = new Date(t.appointmentTime);
        // فقط المواعيد المستقبلية الصارمة (غداً فصاعداً)
        const isStrictlyFuture = isNaN(apptDate.getTime()) || apptDate >= tomorrowStart;
        if (!isStrictlyFuture) continue;

        const vKey = t.villaNumber ? normalizeVillaNumber(String(t.villaNumber)) : "";
        if (vKey) villaApptMap2.set(vKey, t.appointmentTime);
        if (t.clientId) clientApptMap2.set(t.clientId, t.appointmentTime);
      }

      for (const ticket of toCreate) {
        if (ticket.appointmentTime || ticket.status === "closed") continue;

        const vKey = ticket.villaNumber ? normalizeVillaNumber(String(ticket.villaNumber)) : "";
        const inheritedTime =
          (vKey && villaApptMap2.get(vKey)) ||
          (ticket.clientId && clientApptMap2.get(ticket.clientId)) ||
          null;

        if (inheritedTime) {
          ticket.appointmentTime = inheritedTime;
          ticket.appointmentNotes = null; // لا نورث الملاحظات
        }
      }
    }


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
                    assignedSupervisorId: u.assignedSupervisorId,
                    assignedSupervisorIds: u.assignedSupervisorIds,
                    assignedSupervisors: u.assignedSupervisors,
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
