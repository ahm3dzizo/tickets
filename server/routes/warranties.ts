import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, getRequesterRole, requireAuth } from "../auth.js";
import multer from "multer";
import fs from "fs";
import * as XLSX from "xlsx";
import {
  addOneWarrantyYear,
  normalizeWarrantyColumn,
  normalizeWarrantyUnitReference,
  parseWarrantyDate,
} from "../services/warranty-import.js";

const router = Router();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    callback(null, allowed);
  },
});

const UNIT_ALIASES = ["رقم الفيلا", "فيلا", "villa", "رقم الوحدة", "الوحدة", "unit"];
const HANDOVER_ALIASES = ["تاريخ التسليم", "تاريخ بداية الضمان", "handover date", "تاريخ التسليم للعميل"];
const EXPIRY_ALIASES = ["تاريخ الانتهاء", "انتهاء الضمان", "تاريخ انتهاء الضمان", "warranty expiry", "warranty end date"];

function findColumn(columns: string[], aliases: string[]): string | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeWarrantyColumn));
  return columns.find(column => normalizedAliases.has(normalizeWarrantyColumn(column)));
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.uid },
      include: { projects: { select: { id: true } } },
    });
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const projectIds = user.projects.map(project => project.id);
    const where: any = { warrantyExpiryDate: { not: null } };
    if (user.role !== "admin") where.projectId = { in: projectIds };

    const units = await prisma.unit.findMany({
      where,
      select: {
        id: true,
        unitNumber: true,
        handoverDate: true,
        warrantyExpiryDate: true,
        projectId: true,
        project: { select: { name: true } },
        clients: { include: { client: { select: { name: true, phone: true } } } },
      },
      orderBy: { warrantyExpiryDate: "asc" },
    });

    res.json(units.map(unit => ({
      id: unit.id,
      unitNumber: unit.unitNumber,
      handoverDate: unit.handoverDate,
      warrantyExpiryDate: unit.warrantyExpiryDate,
      projectId: unit.projectId,
      projectName: unit.project?.name || "غير معروف",
      clientName: unit.clients[0]?.client?.name || "غير معروف",
      clientPhone: unit.clients[0]?.client?.phone || "",
    })));
  } catch (err: any) {
    console.error("[Warranties GET]", err);
    res.status(500).json({ error: "تعذر تحميل بيانات الضمانات" });
  }
});

router.post("/import", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  const filePath = req.file?.path;
  if (!req.file || !filePath) {
    res.status(400).json({ error: "لم يتم رفع ملف" });
    return;
  }

  try {
    const role = await getRequesterRole(req.uid!);
    const requestedProjectId = String(req.body.projectId || "").trim();
    const projects = await prisma.project.findMany({
      where: {
        ...(requestedProjectId ? { id: requestedProjectId } : {}),
        ...(role === "admin" ? {} : { users: { some: { uid: req.uid! } } }),
      },
      select: { id: true, name: true, abbreviation: true },
    });
    if (requestedProjectId && projects.length === 0) {
      res.status(403).json({ error: "المشروع المحدد غير موجود أو غير مسموح لك باستيراد ضماناته" });
      return;
    }
    if (projects.length === 0) {
      res.status(403).json({ error: "لا توجد مشاريع متاحة لحسابك لاستيراد الضمانات" });
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      res.status(400).json({ error: "ملف Excel لا يحتوي على أوراق عمل" });
      return;
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

    let headerRowIndex = -1;
    for (let index = 0; index < Math.min(rawRows.length, 100); index++) {
      const values = (rawRows[index] || []).map(value => String(value ?? ""));
      const hasUnit = values.some(value => UNIT_ALIASES.some(alias => normalizeWarrantyColumn(value) === normalizeWarrantyColumn(alias)));
      const hasDate = values.some(value =>
        [...HANDOVER_ALIASES, ...EXPIRY_ALIASES].some(alias => normalizeWarrantyColumn(value) === normalizeWarrantyColumn(alias))
      );
      if (hasUnit && hasDate) {
        headerRowIndex = index;
        break;
      }
    }
    if (headerRowIndex < 0) {
      res.status(422).json({ error: "لم يتم العثور على صف العناوين أو أعمدة رقم الوحدة وتاريخ التسليم/الانتهاء" });
      return;
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerRowIndex, defval: "", raw: true,
    });
    if (!rows.length) {
      res.status(400).json({ error: "الملف لا يحتوي على صفوف بيانات" });
      return;
    }

    const columns = Object.keys(rows[0] || {});
    const unitColumn = findColumn(columns, UNIT_ALIASES);
    const handoverColumn = findColumn(columns, HANDOVER_ALIASES);
    const expiryColumn = findColumn(columns, EXPIRY_ALIASES);
    if (!unitColumn || (!handoverColumn && !expiryColumn)) {
      res.status(422).json({ error: "الأعمدة المطلوبة غير مكتملة: رقم الوحدة وتاريخ التسليم أو تاريخ الانتهاء" });
      return;
    }

    const usableProjects = projects
      .filter(project => Boolean(project.abbreviation?.trim()))
      .sort((a, b) => b.abbreviation.trim().length - a.abbreviation.trim().length);
    const duplicateAbbreviations = new Set<string>();
    const abbreviationOwners = new Map<string, string[]>();
    for (const project of usableProjects) {
      const key = project.abbreviation.trim().toLocaleUpperCase("en-US");
      abbreviationOwners.set(key, [...(abbreviationOwners.get(key) || []), project.id]);
    }
    for (const [key, ids] of abbreviationOwners) if (ids.length > 1) duplicateAbbreviations.add(key);

    const unitsByProject = new Map<string, { id: string; unitNumber: string }[]>();
    const errors: string[] = [];
    const updates = new Map<string, { unitId: string; projectId: string; projectName: string; unitNumber: string; handoverDate?: string; warrantyExpiryDate?: string }>();
    const seenKeys = new Set<string>();
    const importedProjectIds = new Set<string>();
    let skippedBlankRows = 0;

    rows.forEach((row, index) => {
      const rowNumber = headerRowIndex + index + 2;
      const rawUnit = String(row[unitColumn] ?? "").trim();
      if (!rawUnit) { skippedBlankRows++; return; }

      const prefixMatch = rawUnit.match(/^(?:villa|unit|الوحدة|فيلا)?\s*([A-Za-z][A-Za-z0-9]*)\s*[-_/\s]+\s*(?:\d+)$/i);
      if (!prefixMatch) {
        errors.push("الصف " + rowNumber + ": رقم الوحدة \"" + rawUnit + "\" لا يحتوي على رمز مشروع واضح. الصيغة المطلوبة: رمز المشروع-رقم الوحدة (مثال: ES2-2627)");
        return;
      }
      const prefix = prefixMatch[1].toLocaleUpperCase("en-US");
      const matchingProjects = usableProjects.filter(project =>
        project.abbreviation.trim().toLocaleUpperCase("en-US") === prefix
      );
      if (matchingProjects.length === 0) {
        const configured = usableProjects.map(project => project.abbreviation).join("، ") || "لا توجد اختصارات مضبوطة";
        errors.push("الصف " + rowNumber + ": رمز المشروع \"" + prefix + "\" في الوحدة \"" + rawUnit + "\" غير مطابق لأي اختصار مشروع متاح. الاختصارات المتاحة: " + configured);
        return;
      }
      if (matchingProjects.length > 1 || duplicateAbbreviations.has(prefix)) {
        errors.push("الصف " + rowNumber + ": رمز المشروع \"" + prefix + "\" مستخدم في أكثر من مشروع؛ يجب تصحيح اختصارات المشاريع قبل الاستيراد");
        return;
      }

      const project = matchingProjects[0];
      if (!unitsByProject.has(project.id)) {
        // Loaded lazily below after the project prefix has been validated.
        unitsByProject.set(project.id, []);
      }
      const key = project.id + ":" + normalizeWarrantyUnitReference(rawUnit, project.abbreviation);
      if (seenKeys.has(key)) {
        errors.push("الصف " + rowNumber + ": رقم الوحدة \"" + rawUnit + "\" مكرر داخل الملف");
        return;
      }
      seenKeys.add(key);
      importedProjectIds.add(project.id);

      const handoverDate = handoverColumn ? parseWarrantyDate(row[handoverColumn]) : null;
      const explicitExpiryDate = expiryColumn ? parseWarrantyDate(row[expiryColumn]) : null;
      if (handoverColumn && row[handoverColumn] !== "" && !handoverDate) {
        errors.push("الصف " + rowNumber + ": تاريخ التسليم غير صالح"); return;
      }
      if (expiryColumn && row[expiryColumn] !== "" && !explicitExpiryDate) {
        errors.push("الصف " + rowNumber + ": تاريخ انتهاء الضمان غير صالح"); return;
      }
      if (!handoverDate && !explicitExpiryDate) {
        errors.push("الصف " + rowNumber + ": لا يوجد تاريخ صالح للتحديث"); return;
      }
      const normalized = normalizeWarrantyUnitReference(rawUnit, project.abbreviation);
      if (!normalized) {
        errors.push("الصف " + rowNumber + ": تعذر قراءة رقم الوحدة \"" + rawUnit + "\" بعد مطابقة رمز المشروع"); return;
      }
      updates.set(key, {
        unitId: "", projectId: project.id, projectName: project.name, unitNumber: rawUnit,
        ...(handoverDate ? { handoverDate } : {}),
        ...(explicitExpiryDate ? { warrantyExpiryDate: explicitExpiryDate } :
          handoverDate ? { warrantyExpiryDate: addOneWarrantyYear(handoverDate) } : {}),
      });
    });

    // Resolve all unit references only after every row's project code has been classified.
    if (errors.length === 0) {
      for (const projectId of importedProjectIds) {
        const project = projects.find(item => item.id === projectId)!;
        const units = await prisma.unit.findMany({ where: { projectId }, select: { id: true, unitNumber: true } });
        const unitByKey = new Map<string, { id: string; unitNumber: string }[]>();
        for (const unit of units) {
          const key = normalizeWarrantyUnitReference(unit.unitNumber, project.abbreviation);
          if (!key) continue;
          unitByKey.set(key, [...(unitByKey.get(key) || []), unit]);
        }
        for (const [updateKey, update] of updates) {
          if (update.projectId !== projectId) continue;
          const normalized = normalizeWarrantyUnitReference(update.unitNumber, project.abbreviation)!;
          const matches = unitByKey.get(normalized) || [];
          if (matches.length === 0) errors.push("الوحدة \"" + update.unitNumber + "\" غير موجودة في مشروع " + project.name);
          else if (matches.length > 1) errors.push("رقم الوحدة \"" + update.unitNumber + "\" يطابق أكثر من وحدة في مشروع " + project.name);
          else update.unitId = matches[0].id;
        }
      }
    }

    // Fail closed: no partial workbook writes if any row has an invalid or unknown project code.
    if (errors.length > 0) {
      res.status(422).json({
        success: false, updated: 0, totalRows: rows.length, skippedBlankRows,
        errors: errors.slice(0, 200), errorCount: errors.length,
        message: "تم إلغاء الاستيراد بالكامل؛ لم يتم تحديث أي وحدة. راجع رموز المشاريع وأرقام الوحدات والأخطاء الموضحة ثم أعد المحاولة",
      });
      return;
    }
    if (updates.size === 0) {
      res.status(422).json({
        success: false, updated: 0, totalRows: rows.length, skippedBlankRows,
        errors: ["لم يتم العثور على أي وحدة صالحة للتحديث في الملف"], errorCount: 1,
        message: "لم يتم استيراد أي بيانات",
      });
      return;
    }

    await prisma.$transaction([...updates.values()].map(update => prisma.unit.update({
      where: { id: update.unitId },
      data: {
        ...(update.handoverDate ? { handoverDate: update.handoverDate } : {}),
        ...(update.warrantyExpiryDate ? { warrantyExpiryDate: update.warrantyExpiryDate } : {}),
      },
    })));
    const importedProjects = projects.filter(project => importedProjectIds.has(project.id));
    console.info("[Warranties Import] completed", {
      uid: req.uid, projectIds: [...importedProjectIds],
      projectNames: importedProjects.map(project => project.name),
      updated: updates.size, totalRows: rows.length, skippedBlankRows,
    });
    res.json({
      success: true, updated: updates.size, totalRows: rows.length, skippedBlankRows,
      projectNames: importedProjects.map(project => project.name), errors: [],
      message: "تم استيراد الضمانات بنجاح",
    });
  } catch (err: any) {
    console.error("[Warranties Import]", err);
    res.status(500).json({ error: "حدث خطأ أثناء استيراد الضمانات؛ لم يتم تأكيد اكتمال العملية" });
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }
    catch (cleanupError) { console.error("[Warranties Import] Failed to remove temporary file", cleanupError); }
  }
});

export default router;
