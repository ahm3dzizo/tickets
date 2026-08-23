import { Router } from "express";
import prisma, { prismaModelExists } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

const hasTechnician = prismaModelExists('technician');

if (hasTechnician) {
  // GET /api/technicians
  router.get("/", requireAuth, async (_req, res) => {
    const technicians = await prisma.technician.findMany({ orderBy: { name: "asc" } });
    res.json(technicians);
  });

  // POST /api/technicians
  router.post("/", requireAuth, async (req, res) => {
    const data = req.body;
    const tech = await prisma.technician.create({
      data: {
        employeeId: data.employeeId || null,
        phoneNumber: data.phoneNumber || null,
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
  });

  // PUT /api/technicians/:id
  router.put("/:id", requireAuth, async (req, res) => {
    const data = req.body;
    const tech = await prisma.technician.update({
      where: { id: req.params.id },
      data: {
        employeeId: data.employeeId ?? undefined,
        phoneNumber: data.phoneNumber ?? undefined,
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
      },
    });
    res.json(tech);
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
