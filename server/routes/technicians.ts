import { Router } from "express";
import prisma, { prismaModelExists } from "../db.js";
import { requireAuth, assertPhoneNumberUnique, normalizePhoneNumber } from "../auth.js";

const router = Router();

const hasTechnician = prismaModelExists('technician');

if (hasTechnician) {
  // GET /api/technicians
  router.get("/", requireAuth, async (req, res) => {
    const includeDisabled = req.query.includeDisabled === 'true';
    const technicians = await prisma.technician.findMany({
      where: includeDisabled ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json(technicians);
  });

  // POST /api/technicians
  router.post("/", requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const phoneNumber = normalizePhoneNumber(data.phoneNumber || null);
      if (data.phoneNumber && !phoneNumber) throw new Error("صيغة رقم الهاتف غير صالحة");
      await assertPhoneNumberUnique(phoneNumber);
      const tech = await prisma.technician.create({
        data: {
          employeeId: data.employeeId || null,
          phoneNumber,
          specialty: data.specialty || null,
          experienceLevel: data.experienceLevel || null,
          supervisorId: data.supervisorId,
          projectId: data.projectId,
          name: data.name,
          idNumber: data.idNumber || null,
          idPhotoUrl: data.idPhotoUrl || null,
          documentUrls: data.documentUrls || [],
          clothingSize: data.clothingSize || null,
          shoeSize: data.shoeSize || null,
        },
      });
      res.status(201).json(tech);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // PUT /api/technicians/:id
  router.put("/:id", requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const phoneNumber = data.phoneNumber !== undefined
        ? normalizePhoneNumber(data.phoneNumber || null)
        : undefined;
      if (data.phoneNumber && !phoneNumber) throw new Error("صيغة رقم الهاتف غير صالحة");
      if (phoneNumber) {
        await assertPhoneNumberUnique(phoneNumber, { excludeTechnicianId: req.params.id });
      }
      const tech = await prisma.technician.update({
        where: { id: req.params.id },
        data: {
          employeeId: data.employeeId ?? undefined,
          phoneNumber,
          specialty: data.specialty ?? undefined,
          experienceLevel: data.experienceLevel ?? undefined,
          supervisorId: data.supervisorId ?? undefined,
          projectId: data.projectId ?? undefined,
          name: data.name ?? undefined,
          idNumber: data.idNumber ?? undefined,
          idPhotoUrl: data.idPhotoUrl ?? undefined,
          documentUrls: data.documentUrls ?? undefined,
          clothingSize: data.clothingSize ?? undefined,
          shoeSize: data.shoeSize ?? undefined,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
        },
      });
      res.json(tech);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/technicians/:id
  router.delete("/:id", requireAuth, async (req, res) => {
    await prisma.technician.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });
} else {
  console.warn("⚠️ Technician model not found in Prisma schema. Technician endpoints disabled.");
  router.get("/", (_req, res) => res.json([]));
  router.post("/", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
  router.put("/:id", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
  router.delete("/:id", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
}

export default router;
