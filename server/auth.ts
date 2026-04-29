import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "./db.js";
import { FIREBASE_PROJECT_ID, APP_JWT_SECRET, USER_ROLES, USER_SPECIALTIES } from "./config.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FirebaseTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

export interface AppTokenPayload {
  uid: string;
  email: string;
  type: "app";
}

export type AuthRequest = Request & { uid?: string; tokenEmail?: string; tokenName?: string };

// ── Google Public Keys Cache ────────────────────────────────────────────────

let _cachedKeys: Record<string, string> = {};
let _keyCacheTime = 0;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  if (Date.now() - _keyCacheTime < 3_600_000 && Object.keys(_cachedKeys).length > 0) {
    return _cachedKeys;
  }
  const res = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  _cachedKeys = (await res.json()) as Record<string, string>;
  _keyCacheTime = Date.now();
  return _cachedKeys;
}

// ── Token Verification ──────────────────────────────────────────────────────

export async function verifyFirebaseToken(token: string): Promise<FirebaseTokenPayload> {
  const keys = await getGooglePublicKeys();
  const decoded = jwt.decode(token, { complete: true }) as any;
  if (!decoded) throw new Error("Invalid token");
  const cert = keys[decoded.header.kid];
  if (!cert) throw new Error("Key not found");
  const payload = jwt.verify(token, cert, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  }) as any;
  return { sub: payload.sub, email: payload.email, name: payload.name };
}

export function signAppToken(payload: AppTokenPayload): string {
  return jwt.sign(payload, APP_JWT_SECRET, { expiresIn: "30d" });
}

export function verifyAppToken(token: string): AppTokenPayload {
  const payload = jwt.verify(token, APP_JWT_SECRET) as jwt.JwtPayload;
  if (payload?.type !== "app" || typeof payload.uid !== "string" || typeof payload.email !== "string") {
    throw new Error("Invalid app token");
  }
  return { uid: payload.uid, email: payload.email, type: "app" };
}

// ── Middleware ──────────────────────────────────────────────────────────────

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const appPayload = verifyAppToken(token);
    req.uid = appPayload.uid;
    req.tokenEmail = appPayload.email;
    next();
    return;
  } catch {}

  try {
    const payload = await verifyFirebaseToken(token);
    req.uid = payload.sub;
    req.tokenEmail = payload.email;
    req.tokenName = payload.name;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export async function getRequesterRole(uid: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { uid }, select: { role: true } });
  return user?.role ?? null;
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = await getRequesterRole(uid);
  if (role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

export function sanitizeSpecialties(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const uniq = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (USER_SPECIALTIES.has(s)) uniq.add(s);
  }
  return Array.from(uniq);
}

export function normalizePhoneNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function toPublicUser<T extends Record<string, unknown> | null>(user: T) {
  if (!user) return user;
  const { passwordHash: _passwordHash, ...safeUser } = user as Record<string, unknown> & { passwordHash?: string | null };
  return safeUser;
}

export function toPublicUsers<T extends Array<Record<string, unknown>>>(users: T) {
  return users.map((user) => toPublicUser(user));
}

export async function assertUserIdentityUnique(employeeId: string | null, phoneNumber: string | null, excludeUid?: string) {
  const orWhere: Array<Record<string, string>> = [];
  if (employeeId) orWhere.push({ employeeId });
  if (phoneNumber) orWhere.push({ phoneNumber });
  if (orWhere.length === 0) return;

  const existing = await prisma.user.findFirst({
    where: {
      OR: orWhere,
      ...(excludeUid ? { uid: { not: excludeUid } } : {}),
    },
    select: { uid: true, employeeId: true, phoneNumber: true },
  });

  if (!existing) return;
  if (employeeId && existing.employeeId === employeeId) {
    throw new Error("رقم الموظف مستخدم بالفعل");
  }
  if (phoneNumber && existing.phoneNumber === phoneNumber) {
    throw new Error("رقم الهاتف مستخدم بالفعل");
  }
  throw new Error("بيانات الهوية موجودة مسبقاً");
}
