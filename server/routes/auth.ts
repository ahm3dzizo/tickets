import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { AuthRequest, requireAuth, asTrimmedString, normalizePhoneNumber, toPublicUser, signAppToken } from "../auth.js";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
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
    user = await prisma.user.findFirst({ where: { phoneNumber } });
  }

  if (!user) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const isPending = user.uid.startsWith("pending_");

  if (isPending && !user.passwordHash) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { uid: user.uid },
      data: { passwordHash },
    });
    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.json({ token, user: toPublicUser(user), requiresProfileCompletion: true, isFirstLogin: true });
    return;
  }

  if (user.passwordHash) {
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (passwordOk) {
      const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
      res.json({ token, user: toPublicUser(user), requiresProfileCompletion: isPending, isFirstLogin: false });
      return;
    }
  }

  res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
});

export default router;
