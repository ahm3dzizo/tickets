import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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
import { sendWAText, getWAStatus } from "../baileys.js";

const router = Router();

// ============================================================
// USER PROFILE PHOTO UPLOAD
// ============================================================

const userUploadsDir = path.resolve(
  process.cwd(),
  "uploads/users"
);

fs.mkdirSync(userUploadsDir, { recursive: true });

const userPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, userUploadsDir);
  },

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const allowed = [".jpg", ".jpeg", ".png", ".webp"];

    if (!allowed.includes(ext)) {
      return cb(new Error("صيغة الصورة غير مدعومة"), '');
    }

    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const userPhotoUpload = multer({
  storage: userPhotoStorage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error("يسمح فقط بصور JPG أو PNG أو WEBP")
      );
    }

    cb(null, true);
  },
});



const ROLE_LABELS: Record<string, string> = {
  admin:      'مدير النظام',
  engineer:   'مهندس مشروع',
  supervisor: 'مشرف',
};

async function sendWelcomeMessage(senderUid: string, newUser: { displayName: string; phoneNumber: string | null; role: string }): Promise<void> {
  if (!newUser.phoneNumber) return;

  // Try requester's session first, then any connected admin
  let fromUid: string | null = null;
  if (getWAStatus(senderUid) === 'CONNECTED') {
    fromUid = senderUid;
  } else {
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { uid: true } });
    for (const a of admins) {
      if (getWAStatus(a.uid) === 'CONNECTED') { fromUid = a.uid; break; }
    }
  }

  if (!fromUid) {
    console.log('[Welcome] No connected WA session — skipping welcome message for', newUser.phoneNumber);
    return;
  }

  const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const roleLabel = ROLE_LABELS[newUser.role] ?? newUser.role;

  const message =
    `السلام عليكم *${newUser.displayName}* 👋\n\n` +
    `تم إضافتك في *نظام Tickets* كـ *${roleLabel}*.\n\n` +
    `لإكمال تسجيلك، اتبع الخطوات:\n\n` +
    `1️⃣ افتح التطبيق:\n${appUrl}\n\n` +
    `2️⃣ اضغط *"تسجيل الدخول"*\n\n` +
    `3️⃣ أدخل رقم جوالك: *${newUser.phoneNumber}*\n\n` +
    `4️⃣ أنشئ كلمة مرور من اختيارك\n\n` +
    `5️⃣ أكمل بيانات حسابك\n\n` +
    `في حالة أي استفسار تواصل معنا 🙌`;

  const result = await sendWAText(fromUid, newUser.phoneNumber, message);
  if (result.sent) {
    console.log(`[Welcome] ✅ Sent to ${newUser.phoneNumber}`);
  } else {
    console.warn(`[Welcome] ⚠️  Failed to send to ${newUser.phoneNumber}:`, result.error);
  }
}

// GET /api/users
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const currentUser = await prisma.user.findUnique({
    where: { uid: req.uid! },
    select: { projects: { select: { id: true } } }
  });
  const projectIds = currentUser?.projects.map(p => p.id) || [];
  
  const where = role === "admin"
    ? {}
    : { role: { not: 'admin' as const }, projects: { some: { id: { in: projectIds } } } };

  const users = await prisma.user.findMany({ 
    where,
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
router.get("/:uid", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ 
    where: { uid: req.params.uid },
    include: { projects: true, specialtiesRef: true }
  });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  // Security check: isolate users from other projects
  const role = await getRequesterRole(req.uid!);
  if (role !== "admin" && user.role !== "admin" && req.uid !== req.params.uid) {
    const currentUser = await prisma.user.findUnique({
      where: { uid: req.uid! },
      select: { projects: { select: { id: true } } }
    });
    const myProjectIds = currentUser?.projects.map(p => p.id) || [];
    const targetProjectIds = user.projects.map(p => p.id);
    const sharesProject = targetProjectIds.some(id => myProjectIds.includes(id));
    if (!sharesProject) {
      res.status(403).json({ error: "Forbidden: No shared projects" });
      return;
    }
  }

  const mapped = {
    ...user,
    projectIds: user.projects.map(p => p.id),
    specialties: user.specialtiesRef.map(s => s.key),
    projects: undefined, specialtiesRef: undefined
  };
  res.json(toPublicUser(mapped));
});

// POST /api/users — Create a new user (admin or engineer)
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const requesterRole = await getRequesterRole(req.uid!);
    if (requesterRole !== 'admin' && requesterRole !== 'engineer') {
      res.status(403).json({ error: 'ليس لديك صلاحية إضافة مستخدمين' });
      return;
    }

    const data = req.body;
    const uidInput = asTrimmedString(data.uid);
    const role = asTrimmedString(data.role) || "engineer";
    if (!USER_ROLES.has(role)) throw new Error("الدور المحدد غير صالح");

    // Engineers can only create supervisors within their own projects
    if (requesterRole === 'engineer') {
      if (role !== 'supervisor') {
        res.status(403).json({ error: 'المهندس يمكنه إضافة المشرفين فقط' });
        return;
      }
      const engineerRecord = await prisma.user.findUnique({
        where: { uid: req.uid! },
        select: { projects: { select: { id: true } } },
      });
      const myProjectIds = new Set(engineerRecord?.projects.map(p => p.id) ?? []);
      const requested = Array.isArray(data.projectIds) ? (data.projectIds as string[]) : [];
      const valid = requested.filter(id => myProjectIds.has(id));
      data.projectIds = valid.length > 0 ? valid : [...myProjectIds];
    }

    const employeeId = asTrimmedString(data.employeeId);
    const rawPhoneNumber = asTrimmedString(data.phoneNumber);
    const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
    if (rawPhoneNumber && !phoneNumber) {
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

    const displayName = asTrimmedString(data.displayName) || "";
    const photoURL = asTrimmedString(data.photoURL);

    let user;
    if (!uidInput) {
      // منع إضافة موظف بنفس رقم الهاتف أو رقم الموظف
      if (employeeId || phoneNumber) {
        await assertUserIdentityUnique(employeeId, phoneNumber);
      }
      const uid = randomUUID();
      const email = `${uid}@local.invalid`;
      user = await prisma.user.create({
        data: {
          uid, email,
          displayName: displayName || "مستخدم جديد",
          role, employeeId, phoneNumber,
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

    const uid = uidInput;
    const email = `${uid}@local.invalid`;

    user = await prisma.user.create({
      data: {
        uid,
        email,
        displayName,
        role,
        employeeId,
        phoneNumber,
        specialtiesRef: {
          connect: specialties.map(key => ({ key }))
        },
        projects: {
          connect: projectIds.map(id => ({ id }))
        },
        photoURL,
        profileCompleted: data.profileCompleted ?? false,
        notifPrefs: data.notifPrefs ?? undefined,
      },
      include: {
        projects: true,
        specialtiesRef: true
      }
    });
  }

  const mapped = {
      ...user,
      projectIds: user.projects.map((p: any) => p.id),
      specialties: user.specialtiesRef.map((s: any) => s.key),
      projects: undefined, specialtiesRef: undefined
    };
    res.status(201).json(toPublicUser(mapped));

    // Fire-and-forget welcome message — doesn't block the response
    sendWelcomeMessage(req.uid!, {
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      role: user.role,
    }).catch(e => console.warn('[Welcome] Error:', e.message));

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

    // Only admin can update any user; engineers can update supervisors in their projects
    const requesterRole = await getRequesterRole(req.uid!);
    if (req.uid !== uid && requesterRole !== "admin") {
      if (requesterRole === 'engineer') {
        if (existing.role !== 'supervisor') {
          res.status(403).json({ error: "المهندس يمكنه تعديل المشرفين فقط" });
          return;
        }
        const engineerRecord = await prisma.user.findUnique({
          where: { uid: req.uid! },
          select: { projects: { select: { id: true } } },
        });
        const myProjectIds = new Set(engineerRecord?.projects.map(p => p.id) ?? []);
        const supervisorInMyProject = existing.projects.some(p => myProjectIds.has(p.id));
        if (!supervisorInMyProject) {
          res.status(403).json({ error: "هذا المشرف ليس في مشاريعك" });
          return;
        }
      } else {
        res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا المستخدم" });
        return;
      }
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
    const onLeave = data.onLeave !== undefined ? Boolean(data.onLeave) : existing.onLeave;
    const substituteUid = data.substituteUid !== undefined ? (data.substituteUid === "" ? null : asTrimmedString(data.substituteUid)) : existing.substituteUid;
    const idNumber = data.idNumber !== undefined ? (asTrimmedString(data.idNumber) ?? null) : (existing as any).idNumber ?? null;
    const clothingSize = data.clothingSize !== undefined ? (asTrimmedString(data.clothingSize) ?? null) : (existing as any).clothingSize ?? null;
    const shoeSize = data.shoeSize !== undefined ? (asTrimmedString(data.shoeSize) ?? null) : (existing as any).shoeSize ?? null;

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

    const updated = await prisma.user.update({
      where: { uid },
      data: {
        displayName,
        role,
        employeeId,
        phoneNumber,
        specialtiesRef: data.specialties !== undefined ? { set: specialties.map(key => ({ key })) } : undefined,
        projects: data.projectIds !== undefined ? { set: projectIds.map(id => ({ id })) } : undefined,
        photoURL,
        disabled,
        onLeave,
        substituteUid,
        notifPrefs: data.notifPrefs ?? existing.notifPrefs ?? undefined,
        idNumber,
        clothingSize,
        shoeSize,
      } as any,
      include: { projects: true, specialtiesRef: true }
    });

    // ✨ نقل التذاكر المفتوحة تلقائياً للمشرف البديل عند الخروج في إجازة
    if (!existing.onLeave && onLeave && substituteUid) {
      const substitute = await prisma.user.findUnique({
        where: { uid: substituteUid },
        include: { specialtiesRef: true }
      });
      if (substitute) {
        const activeTickets = await prisma.ticket.findMany({
          where: {
            assignedSupervisorIds: { has: uid },
            status: { in: ['open', 'in_progress', 'pending', 'waiting'] }
          },
          select: { id: true, assignedSupervisorIds: true },
        });

        if (activeTickets.length > 0) {
          await Promise.all(activeTickets.map(t => {
            const newIds = t.assignedSupervisorIds.includes(substitute.uid)
              ? t.assignedSupervisorIds
              : [substitute.uid, ...t.assignedSupervisorIds.filter((id: string) => id !== uid)];
            return prisma.ticket.update({
              where: { id: t.id },
              data: {
                assignedSupervisorIds: newIds,
                assigneeName: substitute.displayName,
              },
            });
          }));
        }
      }
    }

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
// Accepts multipart/form-data and optional profile photo.
router.post(
  "/complete-profile",
  requireAuth,
  userPhotoUpload.single("photo"),
  async (req: AuthRequest, res) => {
    const uploadedPhotoPath = req.file?.path || null;
    let keepUploadedPhoto = false;

    try {
      const displayName =
        asTrimmedString(req.body?.displayName);

      const phoneNumber =
        normalizePhoneNumber(
          asTrimmedString(req.body?.phoneNumber)
        );

      const employeeId =
        asTrimmedString(req.body?.employeeId);

      const idNumber =
        asTrimmedString(req.body?.idNumber);

      const clothingSize =
        asTrimmedString(req.body?.clothingSize);

      const shoeSize =
        asTrimmedString(req.body?.shoeSize);

      const email =
        asTrimmedString(req.body?.email)?.toLowerCase() || null;

      // ----------------------------------------------------
      // REQUIRED FIELDS
      // ----------------------------------------------------

      if (!displayName) {
        res.status(400).json({
          error: "الاسم الكامل مطلوب",
        });
        return;
      }

      if (!phoneNumber) {
        res.status(400).json({
          error: "رقم الهاتف مطلوب",
        });
        return;
      }

      if (!employeeId) {
        res.status(400).json({
          error: "الرقم الوظيفي مطلوب",
        });
        return;
      }

      if (!idNumber) {
        res.status(400).json({
          error: "رقم الهوية مطلوب",
        });
        return;
      }

      if (!clothingSize) {
        res.status(400).json({
          error: "مقاس التيشيرت مطلوب",
        });
        return;
      }

      if (!shoeSize) {
        res.status(400).json({
          error: "مقاس الجزمة مطلوب",
        });
        return;
      }

      // ----------------------------------------------------
      // CURRENT USER
      // ----------------------------------------------------

      const currentUser =
        await prisma.user.findUnique({
          where: { uid: req.uid! },
          include: {
            projects: true,
            specialtiesRef: true,
          },
        });

      if (!currentUser) {
        res.status(404).json({
          error: "المستخدم غير موجود",
        });
        return;
      }

      if (currentUser.profileCompleted) {
        res.status(403).json({
          error: "بيانات الحساب مكتملة بالفعل",
        });
        return;
      }

      // ----------------------------------------------------
      // IDENTITY UNIQUENESS
      // ----------------------------------------------------

      await assertUserIdentityUnique(
        employeeId,
        phoneNumber,
        req.uid!
      );

      // ----------------------------------------------------
      // OPTIONAL EMAIL
      // ----------------------------------------------------

      let finalEmail = currentUser.email;

      if (email) {
        const existingEmail =
          await prisma.user.findUnique({
            where: { email },
          });

        if (
          existingEmail &&
          existingEmail.uid !== req.uid
        ) {
          res.status(400).json({
            error: "البريد الإلكتروني مستخدم بالفعل",
          });
          return;
        }

        finalEmail = email;
      }

      // ----------------------------------------------------
      // PROFILE PHOTO
      // ----------------------------------------------------

      const photoURL =
        req.file
          ? `/uploads/users/${req.file.filename}`
          : currentUser.photoURL;

      // ----------------------------------------------------
      // UPDATE
      // ----------------------------------------------------

      const updatedUser =
        await prisma.user.update({
          where: { uid: req.uid! },

          data: {
            displayName,
            phoneNumber,
            employeeId,
            idNumber,
            clothingSize,
            shoeSize,
            email: finalEmail,
            profileCompleted: true,
            photoURL,
          },

          include: {
            projects: true,
            specialtiesRef: true,
          },
        });

      // The uploaded file is now owned by the user record.
      keepUploadedPhoto = true;

      const mapped = {
        ...updatedUser,

        projectIds:
          updatedUser.projects.map(
            (p: any) => p.id
          ),

        specialties:
          updatedUser.specialtiesRef.map(
            (s: any) => s.key
          ),

        projects: undefined,
        specialtiesRef: undefined,
      };

      const token = signAppToken({
        uid: updatedUser.uid,
        email: updatedUser.email,
        type: "app" as const,
      });

      res.json({
        token,
        user: toPublicUser(mapped),
      });

    } catch (err: any) {
      console.error(
        "[Complete Profile]",
        err
      );

      res.status(400).json({
        error:
          err.message ||
          "فشل إكمال الملف الشخصي",
      });

    } finally {
      // If the request failed before the DB update succeeded,
      // remove the newly uploaded file so orphan files are not left behind.
      if (!keepUploadedPhoto && uploadedPhotoPath) {
        try {
          await fs.promises.unlink(uploadedPhotoPath);
          console.log(
            "[Complete Profile] Removed orphan uploaded photo:",
            uploadedPhotoPath
          );
        } catch {
          // File may already be gone; ignore cleanup failure.
        }
      }
    }
  }
);


// ============================================================
// USER PROFILE PHOTO
// ============================================================

router.post(
  "/:uid/photo",
  requireAuth,
  userPhotoUpload.single("photo"),
  async (req: AuthRequest, res) => {
    try {
      const { uid } = req.params;

      if (req.uid !== uid) {
        const requesterRole =
          await getRequesterRole(req.uid!);

        if (requesterRole !== "admin") {
          res.status(403).json({
            error:
              "ليس لديك صلاحية تعديل صورة هذا المستخدم",
          });
          return;
        }
      }

      if (!req.file) {
        res.status(400).json({
          error: "لم يتم اختيار صورة",
        });
        return;
      }

      const user =
        await prisma.user.findUnique({
          where: { uid },
        });

      if (!user) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}

        res.status(404).json({
          error: "المستخدم غير موجود",
        });
        return;
      }

      // Delete previous locally stored photo
      if (
        user.photoURL &&
        user.photoURL.startsWith("/uploads/users/")
      ) {
        const oldFilename =
          path.basename(user.photoURL);

        const oldPath =
          path.join(
            userUploadsDir,
            oldFilename
          );

        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch {}
        }
      }

      const photoURL =
        `/uploads/users/${req.file.filename}`;

      const updated =
        await prisma.user.update({
          where: { uid },

          data: {
            photoURL,
          },

          include: {
            projects: true,
            specialtiesRef: true,
          },
        });

      const mapped = {
        ...updated,

        projectIds:
          updated.projects.map(
            (p: any) => p.id
          ),

        specialties:
          updated.specialtiesRef.map(
            (s: any) => s.key
          ),

        projects: undefined,
        specialtiesRef: undefined,
      };

      res.json({
        photoURL,
        user: toPublicUser(mapped),
      });

    } catch (err: any) {
      if (
        req.file?.path &&
        fs.existsSync(req.file.path)
      ) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }

      res.status(400).json({
        error:
          err.message ||
          "فشل رفع الصورة",
      });
    }
  }
);


router.delete("/:uid", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { uid } = req.params;
    
    // Prevent admin from deleting themselves
    if (uid === req.uid) {
      res.status(400).json({ error: "لا يمكنك حذف حسابك الخاص" });
      return;
    }
    
    const existing = await prisma.user.findUnique({ where: { uid } });
    if (!existing) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    
    await prisma.user.delete({ where: { uid } });
    res.json({ ok: true, message: "تم حذف المستخدم بنجاح" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
