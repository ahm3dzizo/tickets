import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { AuthRequest, requireAuth, asTrimmedString, normalizePhoneNumber, toPublicUser, signAppToken } from "../auth.js";

import { sendWAText, getWAStatus } from "../baileys.js";

const router = Router();

function authIdentifierKey(req: any): string {
  const raw = asTrimmedString(req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber);
  if (!raw) return "missing-identifier";
  if (raw.includes("@")) return `email:${raw.toLowerCase()}`;
  return `phone:${normalizePhoneNumber(raw) || raw.replace(/\s+/g, "")}`;
}

// Keep login/reset protection scoped to the account identifier instead of the
// caller IP. The shared login screen always tries regular auth before technician
// auth, so an IP-only limiter can accidentally lock every employee behind the
// same office/mobile NAT after a handful of technician logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyGenerator: authIdentifierKey,
  skipSuccessfulRequests: true,
  message: { error: "تم تجاوز عدد محاولات الدخول لهذا الحساب، يرجى المحاولة بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: authIdentifierKey,
  message: { error: "تم تجاوز عدد طلبات استعادة كلمة المرور، يرجى المحاولة بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: authIdentifierKey,
  message: { error: "تم تجاوز عدد محاولات إدخال كود الاستعادة، يرجى المحاولة بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

function phoneLookupVariants(value: unknown): string[] {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return [];

  const variants = new Set<string>([
    normalized,
    `+${normalized}`,
    `00${normalized}`,
  ]);

  // Saudi legacy rows may still be stored as 05xxxxxxxx or 5xxxxxxxx while new
  // writes use 9665xxxxxxxx. Accept every canonical legacy form during rollout.
  if (/^9665\d{8}$/.test(normalized)) {
    const bare = normalized.slice(3); // 5xxxxxxxx
    variants.add(bare);
    variants.add(`0${bare}`); // 05xxxxxxxx
  }

  return [...variants];
}

async function findUsersByPhone(value: unknown, profileCompletedOnly = false) {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return [];

  const variants = phoneLookupVariants(value);
  const direct = await prisma.user.findMany({
    where: {
      phoneNumber: { in: variants },
      ...(profileCompletedOnly ? { profileCompleted: true } : {}),
    },
  });
  if (direct.length > 0) return direct;

  // Last-resort compatibility for older rows containing spaces, dashes or
  // parentheses. This runs only when the indexed direct lookup found nothing.
  const legacy = await prisma.user.findMany({
    where: {
      phoneNumber: { not: null },
      ...(profileCompletedOnly ? { profileCompleted: true } : {}),
    },
  });
  return legacy.filter(user => normalizePhoneNumber(user.phoneNumber) === normalized);
}

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
  let user = null;
  let phoneCandidates = 0;

  if (isEmail) {
    const email = identifier.toLowerCase();
    user = await prisma.user.findUnique({ where: { email } });
  } else {
    const phoneNumber = normalizePhoneNumber(identifier);
    if (!phoneNumber) {
      res.status(400).json({ error: "صيغة رقم الهاتف غير صالحة" });
      return;
    }

    const allByPhone = await findUsersByPhone(identifier);
    phoneCandidates = allByPhone.length;

    // Existing users: verify password first. This also tolerates legacy duplicate
    // phone rows until they are reconciled.
    for (const u of allByPhone) {
      if (u.passwordHash && await bcrypt.compare(password, u.passwordHash)) {
        user = u;
        break;
      }
    }

    // First-login behavior stays unchanged: if an account has no permanent
    // password yet, let profile completion continue.
    if (!user) {
      user = allByPhone.find(u => !u.passwordHash) ?? null;
    }
  }

  console.log('🔐 [Login] Lookup:', {
    kind: isEmail ? 'email' : 'phone',
    found: Boolean(user),
    phoneCandidates: isEmail ? undefined : phoneCandidates,
    hasPassword: Boolean(user?.passwordHash),
    profileCompleted: user?.profileCompleted,
    disabled: user?.disabled,
  });

  if (!user) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  if (user.disabled) {
    res.status(403).json({ error: "هذا الحساب معطل. تواصل مع مسؤول النظام." });
    return;
  }

  // First login for a new employee.
  // Do NOT save the temporary login password here. The user must choose their
  // permanent password inside ProfileCompletionModal during profile completion.
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

  // Email lookups have not compared the password yet. Phone lookups normally
  // arrive here only after a successful compare, but compare again for a single,
  // explicit final gate shared by both paths.
  if (await bcrypt.compare(password, user.passwordHash)) {
    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.json({ token, user: toPublicUser(user), requiresProfileCompletion: !user.profileCompleted, isFirstLogin: false });
    return;
  }

  console.warn('🔐 [Login] Password mismatch:', { kind: isEmail ? 'email' : 'phone', identifier });
  res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
});

// POST /api/auth/forgot-password
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
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

  const users = await findUsersByPhone(identifier, true);
  const user = users[0] ?? null;

  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" });
    return;
  }

  if (user.disabled) {
    res.status(403).json({ error: "هذا الحساب معطل. تواصل مع مسؤول النظام." });
    return;
  }

  // Generate 6 digit code
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

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
router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
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

  const users = await findUsersByPhone(identifier, true);
  const user = users.find(candidate => candidate.resetCode === code) ?? users[0] ?? null;

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  if (user.disabled) {
    res.status(403).json({ error: "هذا الحساب معطل. تواصل مع مسؤول النظام." });
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
