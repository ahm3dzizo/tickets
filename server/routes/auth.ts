import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { AuthRequest, requireAuth, asTrimmedString, normalizePhoneNumber, toPublicUser, signAppToken } from "../auth.js";

import { sendWAText, getWAStatus } from "../baileys.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: { error: "تم تجاوز عدد المحاولات المسموح بها، يرجى المحاولة بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const identifier = asTrimmedString(req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber);
  const password = asTrimmedString(req.body?.password);

  console.log('🔐 [Login] Attempt:', { identifier, passwordLength: password?.length });

  if (!identifier || !password) {
    res.status(400).json({ error: "يرجى إدخال البريد الإلكتروني أو رقم الهاتف وكلمة المرور" });
    return;
  }

  const isEmail = identifier.includes('@');
  
  let email: string | null = null;
  let phoneNumber: string | null = null;
  
  if (isEmail) {
    email = identifier.toLowerCase();
  } else {
    phoneNumber = normalizePhoneNumber(identifier);
    if (!phoneNumber) {
      res.status(400).json({ error: "صيغة رقم الهاتف غير صالحة" });
      return;
    }
  }

  let user = null;
  if (email) {
    user = await prisma.user.findUnique({ where: { email } });
  } else if (phoneNumber) {
    // During the rollout, tolerate legacy duplicate rows long enough for an
    // existing account to sign in. New writes are rejected and the database
    // unique constraint prevents new duplicates.
    const allByPhone = await prisma.user.findMany({
      where: { phoneNumber }
    });

    // Existing users: verify password first.
    for (const u of allByPhone) {
      if (u.passwordHash && await bcrypt.compare(password, u.passwordHash)) {
        user = u;
        break;
      }
    }

    // First login behavior stays unchanged:
    // if the account has no password yet, the entered password
    // becomes its initial password.
    if (!user) {
      user = allByPhone.find(u => !u.passwordHash) ?? null;
    }
  }

  if (!user) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const needsProfileCompletion = !user.profileCompleted;

  // First login for a new employee.
  //
  // IMPORTANT:
  // Do NOT save the temporary login password here.
  // The user must choose their permanent password inside
  // ProfileCompletionModal during profile completion.
  if (!user.passwordHash) {
    const token = signAppToken({
      uid: user.uid,
      email: user.email,
      type: "app",
    });

    res.json({
      token,
      user: toPublicUser(user),
      requiresProfileCompletion: true,
      isFirstLogin: true,
    });

    return;
  }

  // Regular login — verify password
  if (user.passwordHash && await bcrypt.compare(password, user.passwordHash)) {
    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.json({ token, user: toPublicUser(user), requiresProfileCompletion: !user.profileCompleted, isFirstLogin: false });
    return;
  }

  res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
});

// POST /api/auth/forgot-password
router.post("/forgot-password", loginLimiter, async (req, res) => {
  const identifier = asTrimmedString(req.body?.identifier);
  if (!identifier) {
    res.status(400).json({ error: "يرجى إدخال رقم الهاتف المسجل" });
    return;
  }

  const phoneNumber = normalizePhoneNumber(identifier);
  if (!phoneNumber) {
    res.status(400).json({ error: "صيغة رقم الهاتف غير صالحة" });
    return;
  }

  // Find user by phone (not pending)
  const user = await prisma.user.findFirst({
    where: { 
      phoneNumber,
      profileCompleted: true
    }
  });

  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" });
    return;
  }

  // Generate 6 digit code
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.user.update({
    where: { uid: user.uid },
    data: { resetCode, resetCodeExpiresAt }
  });

  // Find an admin with connected WA session
  const admins = await prisma.user.findMany({ where: { role: "admin" } });
  let adminUidToSendFrom: string | null = null;
  
  for (const admin of admins) {
    if (getWAStatus(admin.uid) === "CONNECTED") {
      adminUidToSendFrom = admin.uid;
      break;
    }
  }

  if (!adminUidToSendFrom) {
    res.status(503).json({ error: "خدمة إرسال الرسائل غير متوفرة حالياً (لا توجد جلسة واتساب نشطة)" });
    return;
  }

  const message = `السلام عليكم ${user.displayName}،\n\nكود استعادة كلمة المرور الخاص بك هو: *${resetCode}*\n\nهذا الكود صالح لمدة 15 دقيقة.`;

  const result = await sendWAText(adminUidToSendFrom, phoneNumber, message);
  
  if (result.sent) {
    res.json({ success: true, message: "تم إرسال كود الاستعادة إلى رقم الواتساب الخاص بك" });
  } else {
    res.status(500).json({ error: "فشل إرسال كود الاستعادة عبر الواتساب" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const identifier = asTrimmedString(req.body?.identifier);
  const code = asTrimmedString(req.body?.code);
  const newPassword = asTrimmedString(req.body?.newPassword);

  if (!identifier || !code || !newPassword) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const phoneNumber = normalizePhoneNumber(identifier);
  if (!phoneNumber) {
    res.status(400).json({ error: "صيغة رقم الهاتف غير صالحة" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { 
      phoneNumber,
      profileCompleted: true
    }
  });

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  if (!user.resetCode || user.resetCode !== code) {
    res.status(400).json({ error: "الكود المدخل غير صحيح" });
    return;
  }

  if (!user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
    res.status(400).json({ error: "انتهت صلاحية الكود. يرجى طلب كود جديد." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { uid: user.uid },
    data: { 
      passwordHash,
      resetCode: null,
      resetCodeExpiresAt: null
    }
  });

  res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
});

export default router;
