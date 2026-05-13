import { Router, Response } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import {
  AuthRequest, requireAuth, requireAdmin,
  asTrimmedString, sanitizeSpecialties, normalizePhoneNumber,
  toPublicUser, toPublicUsers, assertUserIdentityUnique, signAppToken, getRequesterRole
} from "../auth.js";
import { USER_ROLES } from "../config.js";

const router = Router();

// GET /api/users
router.get("/", requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({ 
    include: { projects: true, specialtiesRef: true },
    orderBy: { createdAt: "asc" } 
  });
  const mapped = users.map(u => ({
    ...u,
    projectIds: u.projects.map(p => p.id),
    specialties: u.specialtiesRef.map(s => s.key),
    projects: undefined, specialtiesRef: undefined
  }));
  res.json(toPublicUsers(mapped));
});

// GET /api/users/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ 
    where: { uid: req.uid! },
    include: { projects: true, specialtiesRef: true }
  });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const mapped = {
    ...user,
    projectIds: user.projects.map(p => p.id),
    specialties: user.specialtiesRef.map(s => s.key),
    projects: undefined, specialtiesRef: undefined
  };
  res.json(toPublicUser(mapped));
});

// GET /api/users/:uid
router.get("/:uid", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ 
    where: { uid: req.params.uid },
    include: { projects: true, specialtiesRef: true }
  });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const mapped = {
    ...user,
    projectIds: user.projects.map(p => p.id),
    specialties: user.specialtiesRef.map(s => s.key),
    projects: undefined, specialtiesRef: undefined
  };
  res.json(toPublicUser(mapped));
});

// POST /api/users — Create a new user (admin only)
router.post("/", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const uidInput = asTrimmedString(data.uid);
    const role = asTrimmedString(data.role) || "engineer";
    if (!USER_ROLES.has(role)) throw new Error("الدور المحدد غير صالح");

    const employeeId = asTrimmedString(data.employeeId);
    const phoneNumber = asTrimmedString(data.phoneNumber);
    if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber.replace(/\s+/g, ""))) {
      throw new Error("صيغة رقم الهاتف غير صالحة");
    }

    let specialties = sanitizeSpecialties(data.specialties);
    let projectIds = Array.isArray(data.projectIds)
      ? data.projectIds.filter((id: unknown) => typeof id === "string" && id.trim().length > 0)
      : [];

    if (role === "admin") {
      specialties = [];
      projectIds = [];
    }

    const specialty = specialties[0] || null;
    const displayName = asTrimmedString(data.displayName) || "";
    const photoURL = asTrimmedString(data.photoURL);

    let user;
    if (!uidInput) {
      const uid = `pending_${randomUUID()}`;
      const email = `${uid}@pending.local`;
      user = await prisma.user.create({
        data: {
          uid, email,
          displayName: displayName || "مستخدم جديد",
          role, employeeId, phoneNumber, specialty,
          specialtiesRef: { connect: specialties.map(key => ({ key })) },
          projects: { connect: projectIds.map(id => ({ id })) },
          photoURL, profileCompleted: false,
          notifPrefs: data.notifPrefs ?? undefined,
        },
        include: { projects: true, specialtiesRef: true }
      });
    } else {
      if (!employeeId && !phoneNumber) {
        throw new Error("يجب إدخال رقم الموظف أو رقم الهاتف");
      }
      await assertUserIdentityUnique(employeeId, phoneNumber);

      const existingPending = await prisma.user.findFirst({
        where: {
          uid: { startsWith: "pending_" },
          OR: [
            ...(employeeId ? [{ employeeId }] : []),
            ...(phoneNumber ? [{ phoneNumber }] : []),
          ],
        },
      });

      if (existingPending) {
        user = await prisma.user.update({
          where: { uid: existingPending.uid },
          data: { 
            displayName, role, employeeId, phoneNumber, specialty,
            specialtiesRef: { set: specialties.map(key => ({ key })) },
            projects: { set: projectIds.map(id => ({ id })) },
            photoURL, profileCompleted: data.profileCompleted ?? false, notifPrefs: data.notifPrefs ?? undefined 
          },
          include: { projects: true, specialtiesRef: true }
        });
      } else {
        const uid = `pending_${randomUUID()}`;
        const email = `${uid}@pending.local`;
        user = await prisma.user.create({
          data: {
            uid, email, displayName, role, employeeId, phoneNumber, specialty,
            specialtiesRef: { connect: specialties.map(key => ({ key })) },
            projects: { connect: projectIds.map(id => ({ id })) },
            photoURL, profileCompleted: data.profileCompleted ?? false,
            notifPrefs: data.notifPrefs ?? undefined,
          },
          include: { projects: true, specialtiesRef: true }
        });
      }
    }
    const mapped = {
      ...user,
      projectIds: user.projects.map((p: any) => p.id),
      specialties: user.specialtiesRef.map((s: any) => s.key),
      projects: undefined, specialtiesRef: undefined
    };
    res.status(201).json(toPublicUser(mapped));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/users/:uid — Update a user
router.put("/:uid", requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const { uid } = req.params;

    const existing = await prisma.user.findUnique({ 
      where: { uid },
      include: { projects: true, specialtiesRef: true }
    });
    if (!existing) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    // Only admin can update any user; regular users can only update themselves
    const requesterRole = await getRequesterRole(req.uid!);
    if (req.uid !== uid && requesterRole !== "admin") {
      res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا المستخدم" });
      return;
    }

    const displayName = asTrimmedString(data.displayName) ?? existing.displayName;
    const role = asTrimmedString(data.role) ?? existing.role;
    const employeeId = asTrimmedString(data.employeeId) ?? existing.employeeId;
    const phoneNumber = normalizePhoneNumber(asTrimmedString(data.phoneNumber)) ?? existing.phoneNumber;
    const specialties = sanitizeSpecialties(data.specialties).length > 0
      ? sanitizeSpecialties(data.specialties)
      : existing.specialtiesRef.map(s => s.key);
    const projectIds = Array.isArray(data.projectIds)
      ? data.projectIds.filter((id: unknown) => typeof id === "string" && id.trim().length > 0)
      : existing.projects.map(p => p.id);
    const photoURL = data.photoURL !== undefined ? asTrimmedString(data.photoURL) : existing.photoURL;
    const disabled = data.disabled !== undefined ? Boolean(data.disabled) : existing.disabled;

    // If changing identity fields, check uniqueness
    if (
      (employeeId && employeeId !== existing.employeeId) ||
      (phoneNumber && phoneNumber !== existing.phoneNumber)
    ) {
      await assertUserIdentityUnique(
        employeeId !== existing.employeeId ? employeeId : null,
        phoneNumber !== existing.phoneNumber ? phoneNumber : null,
        uid,
      );
    }

    const specialty = specialties[0] || null;

    const updated = await prisma.user.update({
      where: { uid },
      data: {
        displayName,
        role,
        employeeId,
        phoneNumber,
        specialty,
        specialtiesRef: data.specialties !== undefined ? { set: specialties.map(key => ({ key })) } : undefined,
        projects: data.projectIds !== undefined ? { set: projectIds.map(id => ({ id })) } : undefined,
        photoURL,
        disabled,
        notifPrefs: data.notifPrefs ?? existing.notifPrefs ?? undefined,
      },
      include: { projects: true, specialtiesRef: true }
    });

    const mapped = {
      ...updated,
      projectIds: updated.projects.map((p: any) => p.id),
      specialties: updated.specialtiesRef.map((s: any) => s.key),
      projects: undefined, specialtiesRef: undefined
    };
    res.json(toPublicUser(mapped));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/users/complete-profile
router.post("/complete-profile", requireAuth, async (req: AuthRequest, res) => {
  const displayName = asTrimmedString(req.body?.displayName);
  const email = asTrimmedString(req.body?.email)?.toLowerCase();
  const newPassword = asTrimmedString(req.body?.password);

  if (!displayName || !email || !newPassword) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const currentUser = await prisma.user.findUnique({ 
    where: { uid: req.uid! },
    include: { projects: true, specialtiesRef: true }
  });
  if (!currentUser || !currentUser.uid.startsWith("pending_")) {
    res.status(403).json({ error: "لا يمكنك إكمال بيانات حساب غير معلق" });
    return;
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail && existingEmail.uid !== req.uid) {
    res.status(400).json({ error: "البريد الإلكتروني مستخدم بالفعل" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const newUid = `user_${randomUUID()}`;

  try {
    const updatedUser = await prisma.$transaction(async (tx: any) => {
      await tx.user.delete({ where: { uid: req.uid! } });
      return await tx.user.create({
        data: {
          uid: newUid, email, passwordHash, displayName,
          role: currentUser.role, employeeId: currentUser.employeeId,
          phoneNumber: currentUser.phoneNumber, specialty: currentUser.specialty,
          specialtiesRef: { connect: currentUser.specialtiesRef.map((s:any) => ({ id: s.id })) },
          projects: { connect: currentUser.projects.map((p:any) => ({ id: p.id })) },
          photoURL: currentUser.photoURL, profileCompleted: true,
          notifPrefs: currentUser.notifPrefs ?? undefined,
        },
        include: { projects: true, specialtiesRef: true }
      });
    });
    const mapped = {
      ...updatedUser,
      projectIds: updatedUser.projects.map((p:any) => p.id),
      specialties: updatedUser.specialtiesRef.map((s:any) => s.key),
      projects: undefined, specialtiesRef: undefined
    };
    const token = signAppToken({ uid: updatedUser.uid, email: updatedUser.email, type: "app" as const });
    res.json({ token, user: toPublicUser(mapped) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/users/claim-pending
router.post("/claim-pending", requireAuth, async (req: AuthRequest, res) => {
  const displayName = asTrimmedString(req.body?.displayName);
  const employeeId = asTrimmedString(req.body?.employeeId);
  const phoneNumberRaw = asTrimmedString(req.body?.phoneNumber);
  const phoneNumber = phoneNumberRaw ? phoneNumberRaw.replace(/\s+/g, "") : null;

  if (!displayName) {
    res.status(400).json({ error: "يجب إدخال الاسم الكامل" });
    return;
  }
  if (!employeeId && !phoneNumber) {
    res.status(400).json({ error: "يرجى إدخال رقم الموظف أو رقم الهاتف" });
    return;
  }
  if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber)) {
    res.status(400).json({ error: "صيغة رقم الهاتف غير صالحة" });
    return;
  }

  const existing = await prisma.user.findUnique({ 
    where: { uid: req.uid! },
    include: { projects: true, specialtiesRef: true }
  });
  if (existing) { 
    const mapped = {
      ...existing,
      projectIds: existing.projects.map(p => p.id),
      specialties: existing.specialtiesRef.map(s => s.key),
      projects: undefined, specialtiesRef: undefined
    };
    res.json(toPublicUser(mapped)); 
    return; 
  }

  const pending = await prisma.user.findFirst({
    where: {
      uid: { startsWith: "pending_" },
      OR: [
        ...(employeeId ? [{ employeeId }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    include: { projects: true, specialtiesRef: true }
  });

  if (!pending) {
    res.status(403).json({ error: "لم نتمكن من العثور على حساب معلق مطابق" });
    return;
  }

  const email = req.tokenEmail || `${req.uid}@pending.local`;
  try {
    const [claimed] = await prisma.$transaction([
      prisma.user.create({
        data: {
          uid: req.uid!, email, displayName, role: pending.role,
          employeeId: pending.employeeId, phoneNumber: pending.phoneNumber,
          specialty: pending.specialty, 
          specialtiesRef: { connect: pending.specialtiesRef.map((s:any) => ({ id: s.id })) },
          projects: { connect: pending.projects.map((p:any) => ({ id: p.id })) },
          photoURL: pending.photoURL,
          profileCompleted: true, notifPrefs: pending.notifPrefs ?? undefined,
        },
        include: { projects: true, specialtiesRef: true }
      }),
      prisma.user.delete({ where: { uid: pending.uid } }),
    ]);
    const mapped = {
      ...claimed,
      projectIds: claimed.projects.map((p:any) => p.id),
      specialties: claimed.specialtiesRef.map((s:any) => s.key),
      projects: undefined, specialtiesRef: undefined
    };
    res.status(201).json(toPublicUser(mapped));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
