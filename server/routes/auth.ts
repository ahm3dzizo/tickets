import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { AuthRequest, requireAuth, asTrimmedString, normalizePhoneNumber, toPublicUser, signAppToken } from "../auth.js";

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
    // Multiple users may share a phone (e.g. admin + pending employee)
    // Priority: 1) non-pending with matching password  2) pending (first login)
    const allByPhone = await prisma.user.findMany({ where: { phoneNumber } });

    // Try non-pending users first — check password match
    const nonPending = allByPhone.filter(u => !u.uid.startsWith("pending_"));
    for (const u of nonPending) {
      if (u.passwordHash && await bcrypt.compare(password, u.passwordHash)) {
        user = u;
        break;
      }
    }

    // If no non-pending matched, fall back to pending (new employee activation)
    if (!user) {
      user = allByPhone.find(u => u.uid.startsWith("pending_")) ?? null;
    }
  }

  if (!user) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const isPending = user.uid.startsWith("pending_");

  // First login for new employee — set their chosen password
  if (isPending && !user.passwordHash) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { uid: user.uid }, data: { passwordHash } });
    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.json({ token, user: toPublicUser(user), requiresProfileCompletion: true, isFirstLogin: true });
    return;
  }

  // Regular login — verify password
  if (user.passwordHash && await bcrypt.compare(password, user.passwordHash)) {
    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.json({ token, user: toPublicUser(user), requiresProfileCompletion: isPending, isFirstLogin: false });
    return;
  }

  res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
});

export default router;
