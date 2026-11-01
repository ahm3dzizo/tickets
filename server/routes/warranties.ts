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
    callback(allowed ? null : new Error("صيغة الملف غير مدعومة؛ استخدم Excel أو CSV"), allowed);
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
    const projectId = String(req.body.projectId || "").trim();
    if (!projectId) {
      res.status(400).json({ error: "يجب اختيار المشروع قبل استيراد الضمانات" });
      return;
    }

    const role = await getRequesterRole(req.uid!);
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ...(role === "admin" ? {} : { users: { some: { uid: req.uid! } } }),
      },
      select: { id: true, name: true, abbreviation: true },
    });
    if (!project) {
      res.status(403).json({ error: "المشروع غير موجود أو غير مسموح لك باستيراد ضماناته" });
      return;
    }
    if (!project.abbreviation?.trim()) {
      res.status(422).json({ error: "اختصار المشروع غير مضبوط؛ لا يمكن مطابقة أرقام الوحدات بأمان" });
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
      range: headerRowIndex,
      defval: "",
      raw: true,
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

    const units = await prisma.unit.findMany({
      where: { projectId: project.id },
      select: { id: true, unitNumber: true },
    });

    const unitByKey = new Map<string, typeof units>();
    for (const unit of units) {
      const key = normalizeWarrantyUnitReference(unit.unitNumber, project.abbreviation);
      if (!key) continue;
      const matches = unitByKey.get(key) || [];
      matches.push(unit);
      unitByKey.set(key, matches);
    }

    const updates = new Map<string, { unitId: string; unitNumber: string; handoverDate?: string; warrantyExpiryDate?: string }>();
    const errors: string[] = [];
    const seenKeys = new Set<string>();
    let skippedBlankRows = 0;

    rows.forEach((row, index) => {
      const rowNumber = headerRowIndex + index + 2;
      const rawUnit = String(row[unitColumn] ?? "").trim();
      if (!rawUnit) {
        skippedBlankRows++;
        return;
      }

      const key = normalizeWarrantyUnitReference(rawUnit, project.abbreviation);
      if (!key) {
        errors.push("الصف " + rowNumber + ": رقم الوحدة \"" + rawUnit + "\" يحمل بادئة مختلفة أو تنسيقًا غير معروف");
        return;
      }
      if (seenKeys.has(key)) {
        errors.push("الصف " + rowNumber + ": رقم الوحدة \"" + rawUnit + "\" مكرر داخل الملف");
        return;
      }
      seenKeys.add(key);

      const matches = unitByKey.get(key) || [];
      if (matches.length === 0) {
        errors.push("الصف " + rowNumber + ": الوحدة \"" + rawUnit + "\" غير موجودة في مشروع " + project.name);
        return;
      }
      if (matches.length > 1) {
        errors.push("الصف " + rowNumber + ": رقم الوحدة \"" + rawUnit + "\" يطابق أكثر من وحدة بعد توحيد الرقم");
        return;
      }

      const handoverDate = handoverColumn ? parseWarrantyDate(row[handoverColumn]) : null;
      const explicitExpiryDate = expiryColumn ? parseWarrantyDate(row[expiryColumn]) : null;
      if (handoverColumn && row[handoverColumn] !== "" && !handoverDate) {
        errors.push("الصف " + rowNumber + ": تاريخ التسليم غير صالح");
        return;
      }
      if (expiryColumn && row[expiryColumn] !== "" && !explicitExpiryDate) {
        errors.push("الصف " + rowNumber + ": تاريخ انتهاء الضمان غير صالح");
        return;
      }
      if (!handoverDate && !explicitExpiryDate) {
        errors.push("الصف " + rowNumber + ": لا يوجد تاريخ صالح للتحديث");
        return;
      }

      const unit = matches[0];
      updates.set(unit.id, {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        ...(handoverDate ? { handoverDate: handoverDate } : {}),
        ...(explicitExpiryDate
          ? { warrantyExpiryDate: explicitExpiryDate }
          : handoverDate
            ? { warrantyExpiryDate: addOneWarrantyYear(handoverDate) }
            : {}),
      });
    });

    // Fail closed: never apply a partial workbook when any row is ambiguous or invalid.
    if (errors.length > 0) {
      res.status(422).json({
        success: false,
        updated: 0,
        totalRows: rows.length,
        skippedBlankRows,
        errors: errors.slice(0, 200),
        errorCount: errors.length,
        message: "لم يتم تحديث أي وحدة؛ صحح الأخطاء ثم أعد الاستيراد",
      });
      return;
    }

    if (updates.size === 0) {
      res.status(422).json({
        success: false,
        updated: 0,
        totalRows: rows.length,
        skippedBlankRows,
        errors: ["لم يتم العثور على أي وحدة صالحة للتحديث في الملف"],
        errorCount: 1,
      });
      return;
    }

    const operations = [...updates.values()].map(update => prisma.unit.update({
      where: { id: update.unitId },
      data: {
        ...(update.handoverDate ? { handoverDate: update.handoverDate } : {}),
        ...(update.warrantyExpiryDate ? { warrantyExpiryDate: update.warrantyExpiryDate } : {}),
      },
    }));
    await prisma.$transaction(operations);
    console.info("[Warranties Import] completed", {
      uid: req.uid,
      projectId: project.id,
      projectName: project.name,
      updated: operations.length,
      totalRows: rows.length,
      skippedBlankRows,
    });

    res.json({
      success: true,
      projectId: project.id,
      projectName: project.name,
      updated: operations.length,
      totalRows: rows.length,
      skippedBlankRows,
      errors: [],
    });
  } catch (err: any) {
    console.error("[Warranties Import]", err);
    res.status(500).json({ error: "حدث خطأ أثناء استيراد الضمانات؛ لم يتم تأكيد اكتمال العملية" });
  } finally {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.error("[Warranties Import] Failed to remove temporary file", cleanupError);
    }
  }
});

export default router;
