import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, existsSync, unlinkSync } from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import 'dotenv/config';

// Support both ESM (import.meta.url) and CJS bundled builds (__filename)
const __filename_esm = typeof __filename !== 'undefined'
  ? __filename
  : fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename_esm);

// ── Prisma ────────────────────────────────────────────────────────────────────
import * as PrismaClientPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const _pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new (PrismaClientPkg as any).PrismaClient({ adapter: _pgAdapter });

// ── Firebase token verification (JWKS, no service account needed) ─────────────
const FIREBASE_PROJECT_ID = "tickets-f4541";
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || "retal-local-dev-secret";
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

interface FirebaseTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

interface AppTokenPayload {
  uid: string;
  email: string;
  type: "app";
}

async function verifyFirebaseToken(token: string): Promise<FirebaseTokenPayload> {
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

function signAppToken(payload: AppTokenPayload): string {
  return jwt.sign(payload, APP_JWT_SECRET, { expiresIn: "30d" });
}

function verifyAppToken(token: string): AppTokenPayload {
  const payload = jwt.verify(token, APP_JWT_SECRET) as jwt.JwtPayload;
  if (payload?.type !== "app" || typeof payload.uid !== "string" || typeof payload.email !== "string") {
    throw new Error("Invalid app token");
  }
  return {
    uid: payload.uid,
    email: payload.email,
    type: "app",
  };
}

// ── Auth middleware ───────────────────────────────────────────────────────────
type AuthRequest = Request & { uid?: string; tokenEmail?: string; tokenName?: string };

const USER_ROLES = new Set(["admin", "engineer", "supervisor"]);
const USER_SPECIALTIES = new Set(["mechanics", "electricity", "general"]);

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function sanitizeSpecialties(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const uniq = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (USER_SPECIALTIES.has(s)) uniq.add(s);
  }
  return Array.from(uniq);
}

function normalizePhoneNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "");
  return normalized.length > 0 ? normalized : null;
}

function toPublicUser<T extends Record<string, unknown> | null>(user: T) {
  if (!user) return user;
  const { passwordHash: _passwordHash, ...safeUser } = user as Record<string, unknown> & { passwordHash?: string | null };
  return safeUser;
}

function toPublicUsers<T extends Array<Record<string, unknown>>>(users: T) {
  return users.map((user) => toPublicUser(user));
}

async function assertUserIdentityUnique(employeeId: string | null, phoneNumber: string | null, excludeUid?: string) {
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
    throw new Error("الرقم الوظيفي مسجل بالفعل");
  }
  if (phoneNumber && existing.phoneNumber === phoneNumber) {
    throw new Error("رقم الهاتف مسجل بالفعل");
  }
  throw new Error("بيانات الهوية مسجلة بالفعل");
}

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
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

async function getRequesterRole(uid: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { uid }, select: { role: true } });
  return user?.role ?? null;
}

async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
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

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });
  const PORT = 3001;

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  app.post("/api/auth/login", async (req, res) => {
    const identifier = asTrimmedString(req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber);
    const password = asTrimmedString(req.body?.password);

    if (!identifier || !password) {
      res.status(400).json({ error: "البريد الإلكتروني أو رقم الموبايل وكلمة المرور مطلوبان" });
      return;
    }

    const email = identifier.includes("@") ? identifier.toLowerCase() : null;
    const phoneNumber = email ? null : normalizePhoneNumber(identifier);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
    });

    if (!user?.passwordHash) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }

    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.json({ token, user: toPublicUser(user) });
  });

  app.post("/api/auth/register", async (req, res) => {
    const email = asTrimmedString(req.body?.email)?.toLowerCase();
    const password = asTrimmedString(req.body?.password);
    const displayName = asTrimmedString(req.body?.displayName);

    if (!email || !password || !displayName) {
      res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        uid: `local_${randomUUID()}`,
        email,
        passwordHash,
        displayName,
        role: "engineer",
        specialties: [],
        projectIds: [],
        profileCompleted: true,
      },
    });

    const token = signAppToken({ uid: user.uid, email: user.email, type: "app" });
    res.status(201).json({ token, user: toPublicUser(user) });
  });

  app.post("/api/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
    const currentPassword = asTrimmedString(req.body?.currentPassword);
    const newPassword = asTrimmedString(req.body?.newPassword);

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { uid: req.uid! } });
    if (!user?.passwordHash) {
      res.status(400).json({ error: "هذا الحساب لا يدعم تغيير كلمة المرور محليًا" });
      return;
    }

    const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordOk) {
      res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { uid: req.uid! }, data: { passwordHash } });
    res.json({ success: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/users", requireAuth, async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    res.json(toPublicUsers(users));
  });

  app.get("/api/users/me", requireAuth, async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({ where: { uid: req.uid! } });
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json(toPublicUser(user));
  });

  app.post("/api/users/claim-pending", requireAuth, async (req: AuthRequest, res) => {
    const displayName = asTrimmedString(req.body?.displayName);
    const employeeId = asTrimmedString(req.body?.employeeId);
    const phoneNumberRaw = asTrimmedString(req.body?.phoneNumber);
    const phoneNumber = phoneNumberRaw ? phoneNumberRaw.replace(/\s+/g, "") : null;

    if (!displayName) {
      res.status(400).json({ error: "يرجى إدخال الاسم الكامل" });
      return;
    }
    if (!employeeId && !phoneNumber) {
      res.status(400).json({ error: "يجب إدخال الرقم الوظيفي أو رقم الهاتف" });
      return;
    }
    if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber)) {
      res.status(400).json({ error: "صيغة رقم الهاتف غير صحيحة" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { uid: req.uid! } });
    if (existing) {
      res.json(toPublicUser(existing));
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
    });

    if (!pending) {
      res.status(403).json({ error: "لا يوجد طلب إضافة من مدير النظام بهذه البيانات" });
      return;
    }

    const email = req.tokenEmail || `${req.uid}@pending.local`;
    try {
      const [claimed] = await prisma.$transaction([
        prisma.user.create({
          data: {
            uid: req.uid!,
            email,
            displayName,
            role: pending.role,
            employeeId: pending.employeeId,
            phoneNumber: pending.phoneNumber,
            specialty: pending.specialty,
            specialties: pending.specialties,
            projectIds: pending.projectIds,
            photoURL: pending.photoURL,
            profileCompleted: true,
            notifPrefs: pending.notifPrefs ?? undefined,
          },
        }),
        prisma.user.delete({ where: { uid: pending.uid } }),
      ]);
      res.status(201).json(toPublicUser(claimed));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/users/:uid", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { uid: req.params.uid } });
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json(toPublicUser(user));
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    const data = req.body;
    try {
      const uidInput = asTrimmedString(data.uid);
      const role = asTrimmedString(data.role) || "engineer";
      if (!USER_ROLES.has(role)) throw new Error("الدور الوظيفي غير صالح");

      const employeeId = asTrimmedString(data.employeeId);
      const phoneNumber = asTrimmedString(data.phoneNumber);
      if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber.replace(/\s+/g, ""))) {
        throw new Error("صيغة رقم الهاتف غير صحيحة");
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
      if (uidInput) {
        await assertUserIdentityUnique(employeeId, phoneNumber, uidInput);
        const fallbackEmail = `${uidInput}@pending.local`;
        const email = asTrimmedString(data.email) || fallbackEmail;
        user = await prisma.user.upsert({
          where: { uid: uidInput },
          create: {
            uid: uidInput,
            email,
            displayName,
            role,
            employeeId,
            phoneNumber,
            specialty,
            specialties,
            projectIds,
            photoURL,
            profileCompleted: data.profileCompleted ?? false,
            notifPrefs: data.notifPrefs ?? undefined,
          },
          update: {
            email,
            displayName,
            role,
            employeeId,
            phoneNumber,
            specialty,
            specialties,
            projectIds,
            photoURL,
            profileCompleted: data.profileCompleted ?? undefined,
            notifPrefs: data.notifPrefs ?? undefined,
          },
        });
      } else {
        if (!employeeId && !phoneNumber) {
          throw new Error("يجب إدخال الرقم الوظيفي أو رقم الهاتف");
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
              displayName,
              role,
              employeeId,
              phoneNumber,
              specialty,
              specialties,
              projectIds,
              photoURL,
              profileCompleted: data.profileCompleted ?? false,
              notifPrefs: data.notifPrefs ?? undefined,
            },
          });
        } else {
          const uid = `pending_${randomUUID()}`;
          const email = `${uid}@pending.local`;
          user = await prisma.user.create({
            data: {
              uid,
              email,
              displayName,
              role,
              employeeId,
              phoneNumber,
              specialty,
              specialties,
              projectIds,
              photoURL,
              profileCompleted: data.profileCompleted ?? false,
              notifPrefs: data.notifPrefs ?? undefined,
            },
          });
        }
      }

      res.status(201).json(toPublicUser(user));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/users/:uid", requireAuth, async (req: AuthRequest, res) => {
    const data = req.body;
    try {
      const requesterRole = await getRequesterRole(req.uid!);
      const isSelf = req.uid === req.params.uid;
      const isAdmin = requesterRole === "admin";
      if (!isAdmin && !isSelf) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const current = await prisma.user.findUnique({ where: { uid: req.params.uid } });
      if (!current) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const role = isAdmin ? (asTrimmedString(data.role) || current.role) : current.role;
      if (!USER_ROLES.has(role)) throw new Error("الدور الوظيفي غير صالح");

      const employeeId = isAdmin && data.employeeId !== undefined
        ? asTrimmedString(data.employeeId)
        : current.employeeId;
      const phoneNumber = data.phoneNumber !== undefined
        ? asTrimmedString(data.phoneNumber)
        : current.phoneNumber;
      if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber.replace(/\s+/g, ""))) {
        throw new Error("صيغة رقم الهاتف غير صحيحة");
      }

      await assertUserIdentityUnique(employeeId, phoneNumber, req.params.uid);

      let specialties = isAdmin && data.specialties !== undefined
        ? sanitizeSpecialties(data.specialties)
        : current.specialties;
      let projectIds = isAdmin && data.projectIds !== undefined
        ? (Array.isArray(data.projectIds)
          ? data.projectIds.filter((id: unknown) => typeof id === "string" && id.trim().length > 0)
          : [])
        : current.projectIds;

      if (role === "admin") {
        specialties = [];
        projectIds = [];
      }

      const user = await prisma.user.update({
        where: { uid: req.params.uid },
        data: {
          displayName: data.displayName !== undefined ? (asTrimmedString(data.displayName) || current.displayName) : undefined,
          role,
          employeeId,
          phoneNumber,
          specialty: specialties[0] || null,
          specialties,
          projectIds,
          photoURL: data.photoURL !== undefined ? asTrimmedString(data.photoURL) : undefined,
          profileCompleted: data.profileCompleted ?? undefined,
          disabled: isAdmin ? (data.disabled ?? undefined) : undefined,
          notifPrefs: data.notifPrefs ?? undefined,
        },
      });
      res.json(toPublicUser(user));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/users/:uid", requireAuth, requireAdmin, async (req, res) => {
    await prisma.user.delete({ where: { uid: req.params.uid } });
    res.json({ success: true });
  });

  // Find user by employeeId or phoneNumber (for ProfileCompletion linking)
  app.get("/api/users/find/by-employee", requireAuth, async (req, res) => {
    const { employeeId, phoneNumber } = req.query as Record<string, string>;
    const user = await prisma.user.findFirst({
      where: {
        uid: { startsWith: "pending_" },
        ...(employeeId ? { employeeId } : { phoneNumber }),
      },
    });
    res.json(toPublicUser(user) || null);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/projects", requireAuth, async (_req, res) => {
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
    res.json(projects);
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { clients: true },
    });
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    res.json(project);
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const data = req.body;
    const project = await prisma.project.create({
      data: {
        name: data.name,
        location: data.location,
        abbreviation: data.abbreviation,
        engineerIds: data.engineerIds || [],
        supervisorIds: data.supervisorIds || [],
      },
    });
    res.status(201).json(project);
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const data = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: data.name ?? undefined,
        location: data.location ?? undefined,
        abbreviation: data.abbreviation ?? undefined,
        engineerIds: data.engineerIds ?? undefined,
        supervisorIds: data.supervisorIds ?? undefined,
      },
    });
    res.json(project);
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CLIENTS
  // ══════════════════════════════════════════════════════════════════════════

  // All clients (cross-project)
  app.get("/api/clients", requireAuth, async (_req, res) => {
    const clients = await prisma.client.findMany({ orderBy: { createdAt: "asc" } });
    res.json(clients);
  });

  // Clients by project
  app.get("/api/projects/:projectId/clients", requireAuth, async (req, res) => {
    const clients = await prisma.client.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { name: "asc" },
    });
    res.json(clients);
  });

  app.post("/api/projects/:projectId/clients", requireAuth, async (req, res) => {
    const data = req.body;
    const client = await prisma.client.create({
      data: {
        projectId: req.params.projectId,
        name: data.name,
        phone: data.phone,
        villaNumber: data.villaNumber,
        blockNumber: data.blockNumber || null,
        handoverDate: data.handoverDate || null,
        warrantyExpiryDate: data.warrantyExpiryDate || null,
      },
    });
    res.status(201).json(client);
  });

  app.put("/api/clients/:id", requireAuth, async (req, res) => {
    const data = req.body;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        name: data.name ?? undefined,
        phone: data.phone ?? undefined,
        villaNumber: data.villaNumber ?? undefined,
        blockNumber: data.blockNumber ?? undefined,
        handoverDate: data.handoverDate ?? undefined,
        warrantyExpiryDate: data.warrantyExpiryDate ?? undefined,
      },
    });
    res.json(client);
  });

  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TICKETS
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/tickets", requireAuth, async (req: AuthRequest, res) => {
    const { projectId, projectIds, supervisorId, status } = req.query as Record<string, string>;
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (projectIds) where.projectId = { in: projectIds.split(",") };
    if (supervisorId) where.assignedSupervisorIds = { has: supervisorId };
    if (status) where.status = status;
    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(tickets);
  });

  app.get("/api/tickets/:id", requireAuth, async (req, res) => {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) { res.status(404).json({ error: "Not found" }); return; }
    res.json(ticket);
  });

  app.post("/api/tickets", requireAuth, async (req, res) => {
    const data = req.body;
    try {
      const projectId = asTrimmedString(data.projectId);
      const clientId = asTrimmedString(data.clientId);
      if (!projectId || !clientId) {
        res.status(400).json({ error: "يجب تحديد المشروع والعميل قبل إنشاء التذكرة" });
        return;
      }

      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, projectId: true } });
      if (!client || client.projectId !== projectId) {
        res.status(400).json({ error: "العميل المحدد غير موجود أو لا يتبع هذا المشروع" });
        return;
      }

      const assignedSupervisorIds = Array.isArray(data.assignedSupervisorIds)
        ? data.assignedSupervisorIds.filter((id: unknown) => typeof id === "string" && id.trim().length > 0)
        : [];
      if (assignedSupervisorIds.length === 0) {
        res.status(400).json({ error: "لا يمكن إنشاء التذكرة بدون مشرفين مطابقين" });
        return;
      }

      const supervisors = await prisma.user.findMany({
        where: {
          uid: { in: assignedSupervisorIds },
          role: "supervisor",
          disabled: false,
        },
        select: { uid: true },
      });
      const validSupervisorIds = supervisors.map((s: { uid: string }) => s.uid);
      if (validSupervisorIds.length === 0) {
        res.status(400).json({ error: "لا يمكن إنشاء التذكرة بدون مشرفين صالحين" });
        return;
      }

      const ticket = await prisma.ticket.create({
        data: {
          ticketId: data.ticketId || String(Date.now()).slice(-6),
          refNumber: data.refNumber,
          projectAbbr: data.projectAbbr || null,
          projectId,
          clientId,
          clientName: data.clientName,
          villaNumber: data.villaNumber,
          issuedAt: data.issuedAt || null,
          description: data.description,
          type: data.type,
          status: data.status || "open",
          priority: String(data.priority || "medium"),
          assigneeName: data.assigneeName || null,
          assignedSupervisorId: validSupervisorIds[0] || null,
          assignedSupervisorIds: validSupervisorIds,
          assignedSupervisors: data.assignedSupervisors ?? undefined,
          detectedTypes: data.detectedTypes || [],
          appointmentTime: data.appointmentTime || null,
          appointmentNotes: data.appointmentNotes || null,
          closureNotes: data.closureNotes || null,
          maintenanceItems: data.maintenanceItems ?? undefined,
          closedAt: data.closedAt ? new Date(data.closedAt) : null,
        },
      });
      io.emit("ticket:created", ticket);
      res.status(201).json(ticket);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Bulk import tickets
  app.post("/api/tickets/bulk", requireAuth, async (req, res) => {
    const tickets: any[] = req.body.tickets;
    if (!Array.isArray(tickets)) { res.status(400).json({ error: "tickets must be array" }); return; }
    try {
      const normalized = tickets.map((t, index) => ({
        index,
        ticketId: t.ticketId || String(Date.now() + Math.random()).slice(-6),
        refNumber: t.refNumber,
        projectAbbr: t.projectAbbr || null,
        projectId: asTrimmedString(t.projectId) || "",
        clientId: asTrimmedString(t.clientId) || "",
        clientName: t.clientName,
        villaNumber: t.villaNumber,
        issuedAt: t.issuedAt || null,
        description: t.description,
        type: t.type || "general",
        status: t.status || "open",
        priority: String(t.priority || "medium"),
        assigneeName: t.assigneeName || null,
        assignedSupervisorId: t.assignedSupervisorId || null,
        assignedSupervisorIds: t.assignedSupervisorIds || [],
        detectedTypes: t.detectedTypes || [],
        appointmentTime: t.appointmentTime || null,
        appointmentNotes: t.appointmentNotes || null,
      }));

      const missingSupervisors = normalized.filter(t => !Array.isArray(t.assignedSupervisorIds) || t.assignedSupervisorIds.length === 0);
      if (missingSupervisors.length > 0) {
        res.status(400).json({
          error: `يوجد ${missingSupervisors.length} تذكرة بدون مشرفين مطابقين. أضف مشرفين للمشروع ثم أعد المحاولة.`,
        });
        return;
      }

      const missingIdentity = normalized.filter(t => !t.projectId || !t.clientId);
      if (missingIdentity.length > 0) {
        res.status(400).json({
          error: `يوجد ${missingIdentity.length} تذكرة بدون مشروع/عميل صالح. الرجاء ربط كل تذكرة بعميل موجود قبل الاستيراد.`,
        });
        return;
      }

      const clientIds = Array.from(new Set(normalized.map(t => t.clientId)));
      const clientRows = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, projectId: true },
      });
      const clientProjectById = new Map(clientRows.map((c: { id: string; projectId: string }) => [c.id, c.projectId]));

      const invalidClientRefs = normalized.filter(t => {
        const clientProject = clientProjectById.get(t.clientId);
        return !clientProject || clientProject !== t.projectId;
      });

      if (invalidClientRefs.length > 0) {
        const sample = invalidClientRefs
          .slice(0, 5)
          .map(t => t.ticketId || t.refNumber || `row-${t.index + 1}`)
          .join(", ");
        res.status(400).json({
          error: `يوجد ${invalidClientRefs.length} تذكرة بعميل غير صالح أو لا يتبع المشروع (أمثلة: ${sample})`,
        });
        return;
      }

      const supervisorIds = Array.from(
        new Set(normalized.flatMap(t => Array.isArray(t.assignedSupervisorIds) ? t.assignedSupervisorIds : []))
      );
      const supervisorRows = await prisma.user.findMany({
        where: {
          uid: { in: supervisorIds },
          role: "supervisor",
          disabled: false,
        },
        select: { uid: true },
      });
      const validSupervisorSet = new Set(supervisorRows.map((s: { uid: string }) => s.uid));

      const invalidSupervisorRefs = normalized.filter(t => {
        const validForTicket = t.assignedSupervisorIds.filter((id: string) => validSupervisorSet.has(id));
        return validForTicket.length === 0;
      });
      if (invalidSupervisorRefs.length > 0) {
        const sample = invalidSupervisorRefs
          .slice(0, 5)
          .map(t => t.ticketId || t.refNumber || `row-${t.index + 1}`)
          .join(", ");
        res.status(400).json({
          error: `يوجد ${invalidSupervisorRefs.length} تذكرة بدون مشرفين صالحين (أمثلة: ${sample})`,
        });
        return;
      }

      const created = await prisma.ticket.createMany({ data: normalized.map(t => ({
        ticketId: t.ticketId || String(Date.now() + Math.random()).slice(-6),
        refNumber: t.refNumber,
        projectAbbr: t.projectAbbr || null,
        projectId: t.projectId,
        clientId: t.clientId,
        clientName: t.clientName,
        villaNumber: t.villaNumber,
        issuedAt: t.issuedAt || null,
        description: t.description,
        type: t.type || "general",
        status: t.status || "open",
        priority: String(t.priority || "medium"),
        assigneeName: t.assigneeName || null,
        assignedSupervisorId: t.assignedSupervisorIds[0] || t.assignedSupervisorId || null,
        assignedSupervisorIds: t.assignedSupervisorIds || [],
        detectedTypes: t.detectedTypes || [],
        appointmentTime: t.appointmentTime || null,
        appointmentNotes: t.appointmentNotes || null,
      })), skipDuplicates: true });
      res.status(201).json({ count: created.count });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/tickets/:id", requireAuth, async (req, res) => {
    const data = req.body;
    try {
      const ticket = await prisma.ticket.update({
        where: { id: req.params.id },
        data: {
          status: data.status ?? undefined,
          priority: data.priority !== undefined ? String(data.priority) : undefined,
          assigneeName: data.assigneeName ?? undefined,
          assignedSupervisorId: data.assignedSupervisorId ?? undefined,
          assignedSupervisorIds: data.assignedSupervisorIds ?? undefined,
          assignedSupervisors: data.assignedSupervisors ?? undefined,
          appointmentTime: data.appointmentTime ?? undefined,
          appointmentNotes: data.appointmentNotes ?? undefined,
          closureNotes: data.closureNotes ?? undefined,
          maintenanceItems: data.maintenanceItems ?? undefined,
          closedAt: data.closedAt !== undefined ? (data.closedAt ? new Date(data.closedAt) : null) : undefined,
          description: data.description ?? undefined,
          type: data.type ?? undefined,
        },
      });
      res.json(ticket);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Bulk status update
  app.patch("/api/tickets/bulk-status", requireAuth, async (req, res) => {
    const { ids, status } = req.body as { ids: string[]; status: string };
    await prisma.ticket.updateMany({ where: { id: { in: ids } }, data: { status } });
    res.json({ count: ids.length });
  });

  app.delete("/api/tickets/:id", requireAuth, async (req, res) => {
    await prisma.ticket.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });

  // Delete all tickets
  app.delete("/api/tickets", requireAuth, async (_req, res) => {
    const result = await prisma.ticket.deleteMany();
    res.json({ count: result.count });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TECHNICIANS
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/technicians", requireAuth, async (_req, res) => {
    const technicians = await prisma.technician.findMany({ orderBy: { name: "asc" } });
    res.json(technicians);
  });

  app.post("/api/technicians", requireAuth, async (req, res) => {
    const data = req.body;
    const tech = await prisma.technician.create({
      data: {
        employeeId: data.employeeId || null,
        phoneNumber: data.phoneNumber || null,
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
    });
    res.status(201).json(tech);
  });

  app.put("/api/technicians/:id", requireAuth, async (req, res) => {
    const data = req.body;
    const tech = await prisma.technician.update({
      where: { id: req.params.id },
      data: {
        employeeId: data.employeeId ?? undefined,
        phoneNumber: data.phoneNumber ?? undefined,
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
      },
    });
    res.json(tech);
  });

  app.delete("/api/technicians/:id", requireAuth, async (req, res) => {
    await prisma.technician.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REPORT GENERATION (kept as-is)
  // ══════════════════════════════════════════════════════════════════════════

  app.post("/api/generate-report", (req, res) => {
    const scriptPath = path.join(__dirname, "report_generator.py");
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const python = spawn(pythonBin, [scriptPath, "--stdin"], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });

    let output = "";
    let errorOutput = "";

    python.stdin.write(JSON.stringify(req.body));
    python.stdin.end();

    python.stdout.on("data", (data) => { output += data.toString(); });
    python.stderr.on("data", (data) => { errorOutput += data.toString(); });

    python.on("close", (code) => {
      if (code !== 0) {
        console.error("Python report error:", errorOutput);
        return res.status(500).json({ error: "Report generation failed", details: errorOutput });
      }
      const jpgPath = output.trim().split(/\r?\n/).pop() ?? "";
      if (!jpgPath || !existsSync(jpgPath)) {
        console.error("JPG not found at:", jpgPath, "stdout:", output);
        return res.status(500).json({ error: "Report file not found" });
      }
      try {
        const jpgData = readFileSync(jpgPath);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", `attachment; filename="report.jpg"`);
        res.send(jpgData);
        try { unlinkSync(jpgPath); } catch { /* ignore cleanup errors */ }
      } catch {
        res.status(500).json({ error: "Failed to read report file" });
      }
    });
  });

  // ── Socket.io ─────────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    socket.on("ticket:assign", (data) => {
      io.emit("notification:assignment", data);
    });
  });

  // ── Static / Vite ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});

