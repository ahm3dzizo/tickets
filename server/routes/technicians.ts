import { Router } from "express";
import prisma, { prismaModelExists } from "../db.js";
import { requireAuth, AuthRequest, assertPhoneNumberUnique, normalizePhoneNumber } from "../auth.js";

const router = Router();
const hasTechnician = prismaModelExists('technician');

const SAFE_TECH_SELECT = {
  id: true,
  employeeId: true,
  phoneNumber: true,
  name: true,
  specialty: true,
  experienceLevel: true,
  supervisorId: true,
  projectId: true,
  idNumber: true,
  clothingSize: true,
  shoeSize: true,
  username: true,
  language: true,
  profileCompleted: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RequesterAccess = {
  uid: string;
  role: string;
  projectIds: string[];
};

async function getRequesterAccess(uid: string): Promise<RequesterAccess | null> {
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      uid: true,
      role: true,
      disabled: true,
      projects: { select: { id: true } },
    },
  });
  if (!user || user.disabled) return null;
  return {
    uid: user.uid,
    role: user.role,
    projectIds: user.projects.map(project => project.id),
  };
}

function canManageTechnicians(access: RequesterAccess): boolean {
  return access.role === 'admin' || access.role === 'supervisor';
}

function projectAllowed(access: RequesterAccess, projectId: string | null | undefined): boolean {
  return access.role === 'admin' || (!!projectId && access.projectIds.includes(projectId));
}

if (hasTechnician) {
  // GET /api/technicians
  // Never expose password hashes, ID images or documents to list screens. Non-admin
  // users only see technicians in projects they are actually assigned to.
  router.get("/", requireAuth, async (req: AuthRequest, res) => {
    try {
      const access = await getRequesterAccess(req.uid!);
      if (!access) {
        res.status(403).json({ error: "غير مصرح بعرض الفنيين" });
        return;
      }

      const includeDisabled = req.query.includeDisabled === 'true';
      const where: any = {};
      if (!includeDisabled) where.isActive = true;
      if (access.role !== 'admin') {
        where.projectId = { in: access.projectIds.length ? access.projectIds : ['__none__'] };
      }

      const technicians = await prisma.technician.findMany({
        where,
        select: SAFE_TECH_SELECT,
        orderBy: { name: "asc" },
      });
      res.json(technicians);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/technicians
  // Kept for internal/admin compatibility. New technician accounts should normally
  // be created through /api/tech/invite so credentials are generated safely.
  router.post("/", requireAuth, async (req: AuthRequest, res) => {
    try {
      const access = await getRequesterAccess(req.uid!);
      if (!access || !canManageTechnicians(access)) {
        res.status(403).json({ error: "غير مصرح بإضافة فني" });
        return;
      }

      const data = req.body;
      if (!projectAllowed(access, data.projectId)) {
        res.status(403).json({ error: "لا تملك صلاحية إضافة فني لهذا المشروع" });
        return;
      }
      if (access.role === 'supervisor' && data.supervisorId !== access.uid) {
        res.status(403).json({ error: "يمكن للمشرف إضافة فنيين تحت إشرافه فقط" });
        return;
      }

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
        select: SAFE_TECH_SELECT,
      });
      res.status(201).json(tech);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // PUT /api/technicians/:id
  router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const access = await getRequesterAccess(req.uid!);
      if (!access || !canManageTechnicians(access)) {
        res.status(403).json({ error: "غير مصرح بتعديل الفنيين" });
        return;
      }

      const current = await prisma.technician.findUnique({
        where: { id: req.params.id },
        select: { id: true, projectId: true, supervisorId: true },
      });
      if (!current) {
        res.status(404).json({ error: "الفني غير موجود" });
        return;
      }
      if (!projectAllowed(access, current.projectId)) {
        res.status(403).json({ error: "لا تملك صلاحية تعديل هذا الفني" });
        return;
      }

      const data = req.body;
      const nextProjectId = data.projectId ?? current.projectId;
      const nextSupervisorId = data.supervisorId ?? current.supervisorId;
      if (!projectAllowed(access, nextProjectId)) {
        res.status(403).json({ error: "لا تملك صلاحية نقل الفني لهذا المشروع" });
        return;
      }
      if (access.role === 'supervisor' && nextSupervisorId !== access.uid) {
        res.status(403).json({ error: "يمكن للمشرف إدارة الفنيين تحت إشرافه فقط" });
        return;
      }
      if (access.role === 'supervisor' && current.supervisorId && current.supervisorId !== access.uid) {
        res.status(403).json({ error: "هذا الفني يتبع مشرفاً آخر" });
        return;
      }

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
        select: SAFE_TECH_SELECT,
      });
      res.json(tech);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/technicians/:id
  router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const access = await getRequesterAccess(req.uid!);
      if (!access || !canManageTechnicians(access)) {
        res.status(403).json({ error: "غير مصرح بحذف الفنيين" });
        return;
      }
      const current = await prisma.technician.findUnique({
        where: { id: req.params.id },
        select: { projectId: true, supervisorId: true },
      });
      if (!current) {
        res.status(404).json({ error: "الفني غير موجود" });
        return;
      }
      if (!projectAllowed(access, current.projectId)) {
        res.status(403).json({ error: "لا تملك صلاحية حذف هذا الفني" });
        return;
      }
      if (access.role === 'supervisor' && current.supervisorId !== access.uid) {
        res.status(403).json({ error: "هذا الفني يتبع مشرفاً آخر" });
        return;
      }

      const activeSession = await prisma.appointmentWorkSession.findFirst({
        where: {
          technicianId: req.params.id,
          status: { in: ['in_progress', 'paused'] },
        },
        select: { appointmentId: true },
      });
      if (activeSession) {
        res.status(409).json({
          code: 'TECHNICIAN_HAS_ACTIVE_SESSION',
          error: 'لا يمكن حذف الفني أثناء وجود موعد عمل نشط. عطّل الحساب أو أنهِ الجلسة أولاً.',
          activeAppointmentId: activeSession.appointmentId,
        });
        return;
      }

      await prisma.technician.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
} else {
  console.warn("⚠️ Technician model not found in Prisma schema. Technician endpoints disabled.");
  router.get("/", (_req, res) => res.json([]));
  router.post("/", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
  router.put("/:id", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
  router.delete("/:id", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
}

export default router;
