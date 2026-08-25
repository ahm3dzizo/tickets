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

export function normalizePhoneNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
  let normalized = raw.replace(/\D/g, "");
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  // Store Saudi mobile numbers in international form so 05xxxxxxxx,
  // 5xxxxxxxx and +9665xxxxxxxx cannot create separate accounts.
  if (/^05\d{8}$/.test(normalized)) normalized = `966${normalized.slice(1)}`;
  else if (/^5\d{8}$/.test(normalized)) normalized = `966${normalized}`;
  return normalized.length >= 7 && normalized.length <= 15 ? normalized : null;
}

export async function assertPhoneNumberUnique(
  phoneNumber: string | null,
  options: { excludeUserUid?: string; excludeTechnicianId?: string } = {},
) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return;

  // Compare normalized values so legacy formatting (+, spaces, 00 prefix)
  // cannot bypass the uniqueness rule before all old rows are migrated.
  const [users, technicians] = await Promise.all([
    prisma.user.findMany({
      where: {
        phoneNumber: { not: null },
        ...(options.excludeUserUid ? { uid: { not: options.excludeUserUid } } : {}),
      },
      select: { uid: true, phoneNumber: true },
    }),
    prisma.technician.findMany({
      where: {
        phoneNumber: { not: null },
        ...(options.excludeTechnicianId ? { id: { not: options.excludeTechnicianId } } : {}),
      },
      select: { id: true, phoneNumber: true },
    }),
  ]);

  const duplicateUser = users.some((user) => normalizePhoneNumber(user.phoneNumber) === normalized);
  const duplicateTechnician = technicians.some((tech) => normalizePhoneNumber(tech.phoneNumber) === normalized);
  if (duplicateUser || duplicateTechnician) {
    throw new Error("رقم الهاتف مستخدم بالفعل لحساب آخر");
  }
}

export function toPublicUser<T extends Record<string, unknown> | null>(user: T) {
  if (!user) return user;

  const record = user as Record<string, unknown> & {
    passwordHash?: string | null;
  };

  const {
    passwordHash,
    ...safeUser
  } = record;

  return {
    ...safeUser,
    hasPassword: Boolean(passwordHash),
  };
}

export function toPublicUsers<T extends Array<Record<string, unknown>>>(users: T) {
  return users.map((user) => toPublicUser(user));
}

export async function assertUserIdentityUnique(employeeId: string | null, phoneNumber: string | null, excludeUid?: string) {
  if (employeeId) {
    const existingEmployee = await prisma.user.findFirst({
      where: {
        employeeId,
        ...(excludeUid ? { uid: { not: excludeUid } } : {}),
      },
      select: { uid: true },
    });
    if (existingEmployee) throw new Error("رقم الموظف مستخدم بالفعل");
  }
  await assertPhoneNumberUnique(phoneNumber, { excludeUserUid: excludeUid });
}
