import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";
import multer from "multer";
import fs from "fs";
import * as XLSX from "xlsx";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.uid },
      include: { projects: { select: { id: true } } }
    });
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const projectIds = user.projects.map(p => p.id);
    const where: any = {
      warrantyExpiryDate: { not: null }
    };

    if (user.role !== "admin") {
      if (projectIds.length > 0) {
        where.projectId = { in: projectIds };
      } else {
        where.projectId = { in: [] };
      }
    }

    const units = await prisma.unit.findMany({
      where,
      select: {
        id: true,
        unitNumber: true,
        handoverDate: true,
        warrantyExpiryDate: true,
        projectId: true,
        project: { select: { name: true } },
        clients: {
          include: { client: { select: { name: true, phone: true } } }
        }
      },
      orderBy: { warrantyExpiryDate: "asc" }
    });

    const warranties = units.map(u => ({
      id: u.id,
      unitNumber: u.unitNumber,
      handoverDate: u.handoverDate,
      warrantyExpiryDate: u.warrantyExpiryDate,
      projectId: u.projectId,
      projectName: u.project?.name || "غير معروف",
      clientName: u.clients?.[0]?.client?.name || "غير معروف",
      clientPhone: u.clients?.[0]?.client?.phone || ""
    }));

    res.json(warranties);
  } catch (err: any) {
    console.error("[Warranties GET]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/import", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "لم يتم رفع ملف" });
  const filePath = req.file.path;
  const projectId = req.body.projectId; // optional filter

  try {
    const buffer = fs.readFileSync(filePath);
    fs.unlinkSync(filePath);

    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    // Detect header row
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 100); i++) {
      const text = rawRows[i].join(" ").toLowerCase();
      if (text.includes("فيلا") || text.includes("وحدة") || text.includes("unit") || text.includes("تسليم") || text.includes("ضمان")) {
        headerRowIndex = i;
        break;
      }
    }

    const allData: any[] = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });
    if (allData.length === 0) return res.status(400).json({ error: "الملف فارغ" });

    const cols = Object.keys(allData[0] || {});
    const unitAlias = ["رقم الفيلا", "فيلا", "villa", "رقم الوحدة", "الوحدة", "Unit"];
    const dateAlias = ["تاريخ التسليم", "تاريخ بداية الضمان", "handover date", "تاريخ التسليم للعميل"];

    const matchCol = (aliases: string[]) => cols.find(c => aliases.some(a => c.toLowerCase().includes(a.toLowerCase())));
    const unitCol = matchCol(unitAlias);
    const dateCol = matchCol(dateAlias);

    if (!unitCol || !dateCol) {
      return res.status(400).json({ error: "لم يتم العثور على أعمدة: رقم الفيلا و تاريخ التسليم" });
    }

    let updated = 0;
    const errors: string[] = [];

    // Helper to normalize excel date
    const normalizeDate = (raw: any): Date | null => {
      if (!raw) return null;
      if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
      if (typeof raw === "number" && raw > 1000 && raw < 100000) {
        return new Date((raw - 25569) * 86400 * 1000);
      }
      const str = String(raw).trim();
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      // Handle DD/MM/YYYY
      const parts = str.split("/");
      if (parts.length === 3) {
        let [day, month, year] = parts;
        if (year.length === 2) year = `20${year}`;
        const fallback = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00Z`);
        if (!isNaN(fallback.getTime())) return fallback;
      }
      return null;
    };

    for (const row of allData) {
      const rawUnit = String(row[unitCol] || "").trim();
      if (!rawUnit) continue;
      // Normalize unit number
      const unitNumber = rawUnit.replace(/[^0-9]/g, "").replace(/^0+/, "") || rawUnit;

      const dateVal = row[dateCol];
      const handoverDateObj = normalizeDate(dateVal);
      
      if (!handoverDateObj) {
        errors.push(`رقم الفيلا ${unitNumber}: تاريخ غير صالح`);
        continue;
      }

      const handoverDateStr = handoverDateObj.toISOString().split('T')[0];
      const warrantyEndDateObj = new Date(handoverDateObj);
      warrantyEndDateObj.setFullYear(warrantyEndDateObj.getFullYear() + 1);
      const warrantyEndDateStr = warrantyEndDateObj.toISOString().split('T')[0];

      const where: any = { unitNumber };
      if (projectId) where.projectId = projectId;

      const result = await prisma.unit.updateMany({
        where,
        data: {
          handoverDate: handoverDateStr,
          warrantyExpiryDate: warrantyEndDateStr
        }
      });

      if (result.count > 0) {
        updated += result.count;
      } else {
        errors.push(`رقم الفيلا ${unitNumber}: الوحدة غير موجودة`);
      }
    }

    res.json({ success: true, updated, errors: errors.slice(0, 100) });
  } catch (err: any) {
    console.error("[Warranties Import]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
