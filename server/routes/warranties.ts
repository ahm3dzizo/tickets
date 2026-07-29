import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

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

export default router;
