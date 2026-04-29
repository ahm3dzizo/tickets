import express from "express";
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
import "dotenv/config";
const __filename_esm = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename_esm);
import * as PrismaClientPkg from "@prisma/client";
const prisma = new PrismaClientPkg.PrismaClient();
const FIREBASE_PROJECT_ID = "tickets-f4541";
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || "retal-local-dev-secret";
let _cachedKeys = {};
let _keyCacheTime = 0;
async function getGooglePublicKeys() {
  if (Date.now() - _keyCacheTime < 36e5 && Object.keys(_cachedKeys).length > 0) {
    return _cachedKeys;
  }
  const res = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  _cachedKeys = await res.json();
  _keyCacheTime = Date.now();
  return _cachedKeys;
}
async function verifyFirebaseToken(token) {
  const keys = await getGooglePublicKeys();
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error("Invalid token");
  const cert = keys[decoded.header.kid];
  if (!cert) throw new Error("Key not found");
  const payload = jwt.verify(token, cert, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID
  });
  return { sub: payload.sub, email: payload.email, name: payload.name };
}
function signAppToken(payload) {
  return jwt.sign(payload, APP_JWT_SECRET, { expiresIn: "30d" });
}
function verifyAppToken(token) {
  const payload = jwt.verify(token, APP_JWT_SECRET);
  if (payload?.type !== "app" || typeof payload.uid !== "string" || typeof payload.email !== "string") {
    throw new Error("Invalid app token");
  }
  return {
    uid: payload.uid,
    email: payload.email,
    type: "app"
  };
}
const USER_ROLES = /* @__PURE__ */ new Set(["admin", "engineer", "supervisor"]);
const USER_SPECIALTIES = /* @__PURE__ */ new Set(["mechanics", "electricity", "general"]);
function asTrimmedString(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}
function sanitizeSpecialties(input) {
  if (!Array.isArray(input)) return [];
  const uniq = /* @__PURE__ */ new Set();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (USER_SPECIALTIES.has(s)) uniq.add(s);
  }
  return Array.from(uniq);
}
function normalizePhoneNumber(value) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "");
  return normalized.length > 0 ? normalized : null;
}
function toPublicUser(user) {
  if (!user) return user;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
function toPublicUsers(users) {
  return users.map((user) => toPublicUser(user));
}
async function assertUserIdentityUnique(employeeId, phoneNumber, excludeUid) {
  const orWhere = [];
  if (employeeId) orWhere.push({ employeeId });
  if (phoneNumber) orWhere.push({ phoneNumber });
  if (orWhere.length === 0) return;
  const existing = await prisma.user.findFirst({
    where: {
      OR: orWhere,
      ...excludeUid ? { uid: { not: excludeUid } } : {}
    },
    select: { uid: true, employeeId: true, phoneNumber: true }
  });
  if (!existing) return;
  if (employeeId && existing.employeeId === employeeId) {
    throw new Error("\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644");
  }
  if (phoneNumber && existing.phoneNumber === phoneNumber) {
    throw new Error("\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644");
  }
  throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0647\u0648\u064A\u0629 \u0645\u0648\u062C\u0648\u062F\u0629 \u0645\u0633\u0628\u0642\u0627\u064B");
}
async function requireAuth(req, res, next) {
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
  } catch {
  }
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
async function getRequesterRole(uid) {
  const user = await prisma.user.findUnique({ where: { uid }, select: { role: true } });
  return user?.role ?? null;
}
async function requireAdmin(req, res, next) {
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
    cors: { origin: "*", methods: ["GET", "POST"] }
  });
  const PORT = 3001;
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/api/auth/login", async (req, res) => {
    const identifier = asTrimmedString(req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber);
    const password = asTrimmedString(req.body?.password);
    console.log("?? [Login] Attempt:", { identifier, passwordLength: password?.length });
    if (!identifier || !password) {
      res.status(400).json({ error: "?????? ?????????? ?? ??? ?????? ????? ?????? ???????" });
      return;
    }
    const isEmail = identifier.includes("@");
    let email = null;
    let phoneNumber = null;
    if (isEmail) {
      email = identifier.toLowerCase();
    } else {
      phoneNumber = normalizePhoneNumber(identifier);
      if (!phoneNumber) {
        res.status(400).json({ error: "???? ??? ?????? ??? ?????" });
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
      res.status(401).json({ error: "?????? ?????? ??? ?????" });
      return;
    }
    const isPending = user.uid.startsWith("pending_");
    if (isPending && !user.passwordHash) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { uid: user.uid },
        data: { passwordHash }
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
    res.status(401).json({ error: "?????? ?????? ??? ?????" });
  });
  app.post("/api/users/complete-profile", requireAuth, async (req, res) => {
    const displayName = asTrimmedString(req.body?.displayName);
    const email = asTrimmedString(req.body?.email)?.toLowerCase();
    const newPassword = asTrimmedString(req.body?.password);
    if (!displayName || !email || !newPassword) {
      res.status(400).json({ error: "\u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0644 \u0645\u0637\u0644\u0648\u0628\u0629" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { uid: req.uid } });
    if (!currentUser || !currentUser.uid.startsWith("pending_")) {
      res.status(403).json({ error: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0625\u0643\u0645\u0627\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0639\u0644\u0642" });
      return;
    }
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail && existingEmail.uid !== req.uid) {
      res.status(400).json({ error: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const newUid = `user_${randomUUID()}`;
    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { uid: req.uid } });
        return await tx.user.create({
          data: {
            uid: newUid,
            email,
            passwordHash,
            displayName,
            role: currentUser.role,
            employeeId: currentUser.employeeId,
            phoneNumber: currentUser.phoneNumber,
            specialty: currentUser.specialty,
            specialties: currentUser.specialties,
            projectIds: currentUser.projectIds,
            photoURL: currentUser.photoURL,
            profileCompleted: true,
            notifPrefs: currentUser.notifPrefs ?? void 0
          }
        });
      });
      const token = signAppToken({ uid: updatedUser.uid, email: updatedUser.email, type: "app" });
      res.json({ token, user: toPublicUser(updatedUser) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get("/api/users", requireAuth, async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    res.json(toPublicUsers(users));
  });
  app.get("/api/users/me", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { uid: req.uid } });
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(toPublicUser(user));
  });
  app.post("/api/users/claim-pending", requireAuth, async (req, res) => {
    const displayName = asTrimmedString(req.body?.displayName);
    const employeeId = asTrimmedString(req.body?.employeeId);
    const phoneNumberRaw = asTrimmedString(req.body?.phoneNumber);
    const phoneNumber = phoneNumberRaw ? phoneNumberRaw.replace(/\s+/g, "") : null;
    if (!displayName) {
      res.status(400).json({ error: "???? ????? ????? ??????" });
      return;
    }
    if (!employeeId && !phoneNumber) {
      res.status(400).json({ error: "??? ????? ????? ??????? ?? ??? ??????" });
      return;
    }
    if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber)) {
      res.status(400).json({ error: "???? ??? ?????? ??? ?????" });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { uid: req.uid } });
    if (existing) {
      res.json(toPublicUser(existing));
      return;
    }
    const pending = await prisma.user.findFirst({
      where: {
        uid: { startsWith: "pending_" },
        OR: [
          ...employeeId ? [{ employeeId }] : [],
          ...phoneNumber ? [{ phoneNumber }] : []
        ]
      }
    });
    if (!pending) {
      res.status(403).json({ error: "\u0644\u0645 \u0646\u062A\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062D\u0633\u0627\u0628 \u0645\u0639\u0644\u0642 \u0645\u0637\u0627\u0628\u0642" });
      return;
    }
    const email = req.tokenEmail || `${req.uid}@pending.local`;
    try {
      const [claimed] = await prisma.$transaction([
        prisma.user.create({
          data: {
            uid: req.uid,
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
            notifPrefs: pending.notifPrefs ?? void 0
          }
        }),
        prisma.user.delete({ where: { uid: pending.uid } })
      ]);
      res.status(201).json(toPublicUser(claimed));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get("/api/users/:uid", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { uid: req.params.uid } });
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(toPublicUser(user));
  });
  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const data = req.body;
      const uidInput = asTrimmedString(data.uid);
      const role = asTrimmedString(data.role) || "engineer";
      if (!USER_ROLES.has(role)) throw new Error("\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
      const employeeId = asTrimmedString(data.employeeId);
      const phoneNumber = asTrimmedString(data.phoneNumber);
      if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber.replace(/\s+/g, ""))) {
        throw new Error("\u0635\u064A\u063A\u0629 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629");
      }
      let specialties = sanitizeSpecialties(data.specialties);
      let projectIds = Array.isArray(data.projectIds) ? data.projectIds.filter((id) => typeof id === "string" && id.trim().length > 0) : [];
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
            uid,
            email,
            displayName: displayName || "\u0645\u0633\u062A\u062E\u062F\u0645 \u062C\u062F\u064A\u062F",
            role,
            employeeId,
            phoneNumber,
            specialty,
            specialties,
            projectIds,
            photoURL,
            profileCompleted: false,
            notifPrefs: data.notifPrefs ?? void 0
          }
        });
      } else {
        if (!employeeId && !phoneNumber) {
          throw new Error("\u064A\u062C\u0628 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0623\u0648 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641");
        }
        await assertUserIdentityUnique(employeeId, phoneNumber);
        const existingPending = await prisma.user.findFirst({
          where: {
            uid: { startsWith: "pending_" },
            OR: [
              ...employeeId ? [{ employeeId }] : [],
              ...phoneNumber ? [{ phoneNumber }] : []
            ]
          }
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
              notifPrefs: data.notifPrefs ?? void 0
            }
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
              notifPrefs: data.notifPrefs ?? void 0
            }
          });
        }
      }
      res.status(201).json(toPublicUser(user));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get("/api/projects", requireAuth, async (_req, res) => {
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
    res.json(projects);
  });
  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { clients: true }
    });
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
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
        supervisorIds: data.supervisorIds || []
      }
    });
    res.status(201).json(project);
  });
  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const data = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: data.name ?? void 0,
        location: data.location ?? void 0,
        abbreviation: data.abbreviation ?? void 0,
        engineerIds: data.engineerIds ?? void 0,
        supervisorIds: data.supervisorIds ?? void 0
      }
    });
    res.json(project);
  });
  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });
  app.get("/api/clients", requireAuth, async (_req, res) => {
    const clients = await prisma.client.findMany({ orderBy: { createdAt: "asc" } });
    res.json(clients);
  });
  app.get("/api/projects/:projectId/clients", requireAuth, async (req, res) => {
    const clients = await prisma.client.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { name: "asc" }
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
        warrantyExpiryDate: data.warrantyExpiryDate || null
      }
    });
    res.status(201).json(client);
  });
  app.put("/api/clients/:id", requireAuth, async (req, res) => {
    const data = req.body;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        name: data.name ?? void 0,
        phone: data.phone ?? void 0,
        villaNumber: data.villaNumber ?? void 0,
        blockNumber: data.blockNumber ?? void 0,
        handoverDate: data.handoverDate ?? void 0,
        warrantyExpiryDate: data.warrantyExpiryDate ?? void 0
      }
    });
    res.json(client);
  });
  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });
  app.get("/api/tickets", requireAuth, async (req, res) => {
    const { projectId, projectIds, supervisorId, status } = req.query;
    const where = {};
    if (projectId) where.projectId = projectId;
    if (projectIds) where.projectId = { in: projectIds.split(",") };
    if (supervisorId) where.assignedSupervisorIds = { has: supervisorId };
    if (status) where.status = status;
    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    res.json(tickets);
  });
  app.get("/api/tickets/:id", requireAuth, async (req, res) => {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(ticket);
  });
  app.post("/api/tickets", requireAuth, async (req, res) => {
    const data = req.body;
    try {
      const projectId = asTrimmedString(data.projectId);
      const clientId = asTrimmedString(data.clientId);
      if (!projectId || !clientId) {
        res.status(400).json({ error: "\u064A\u062C\u0628 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0648\u0627\u0644\u0639\u0645\u064A\u0644 \u0644\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062A\u0630\u0643\u0631\u0629" });
        return;
      }
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, projectId: true } });
      if (!client || client.projectId !== projectId) {
        res.status(400).json({ error: "\u0627\u0644\u0639\u0645\u064A\u0644 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0634\u0631\u0648\u0639" });
        return;
      }
      const assignedSupervisorIds = Array.isArray(data.assignedSupervisorIds) ? data.assignedSupervisorIds.filter((id) => typeof id === "string" && id.trim().length > 0 && !id.startsWith("pending_")) : [];
      let priority = 3;
      if (data.priority !== void 0) {
        const parsed = parseInt(data.priority, 10);
        priority = isNaN(parsed) ? 3 : parsed;
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
          priority,
          assigneeName: data.assigneeName || null,
          assignedSupervisorId: assignedSupervisorIds[0] && !assignedSupervisorIds[0].startsWith("pending_") ? assignedSupervisorIds[0] : null,
          assignedSupervisorIds,
          assignedSupervisors: data.assignedSupervisors ?? void 0,
          detectedTypes: data.detectedTypes || [],
          appointmentTime: data.appointmentTime || null,
          appointmentNotes: data.appointmentNotes || null,
          closureNotes: data.closureNotes || null,
          maintenanceItems: data.maintenanceItems ?? void 0,
          closedAt: data.closedAt ? new Date(data.closedAt) : null
        }
      });
      io.emit("ticket:created", ticket);
      res.status(201).json(ticket);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/tickets/bulk", requireAuth, async (req, res) => {
    const tickets = req.body.tickets;
    if (!Array.isArray(tickets)) {
      res.status(400).json({ error: "tickets must be array" });
      return;
    }
    try {
      const normalized = tickets.map((t, index) => {
        let assignedSupervisorIds = Array.isArray(t.assignedSupervisorIds) ? t.assignedSupervisorIds.filter((id) => id && !id.startsWith("pending_")) : [];
        let assignedSupervisorId = t.assignedSupervisorId && !t.assignedSupervisorId.startsWith("pending_") ? t.assignedSupervisorId : assignedSupervisorIds[0] || null;
        let priority = 3;
        if (t.priority !== void 0) {
          const parsed = parseInt(t.priority, 10);
          priority = isNaN(parsed) ? 3 : parsed;
        }
        return {
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
          priority,
          assigneeName: t.assigneeName || null,
          assignedSupervisorId,
          assignedSupervisorIds,
          detectedTypes: t.detectedTypes || [],
          appointmentTime: t.appointmentTime || null,
          appointmentNotes: t.appointmentNotes || null
        };
      });
      const missingSupervisors = normalized.filter((t) => !t.assignedSupervisorId && t.assignedSupervisorIds.length === 0);
      if (missingSupervisors.length > 0) {
        console.warn(`\u26A0\uFE0F ${missingSupervisors.length} \u062A\u0630\u0643\u0631\u0629 \u0628\u062F\u0648\u0646 \u0645\u0634\u0631\u0641 - \u0633\u064A\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u0644\u0627\u062D\u0642\u0627\u064B`);
      }
      const invalidClientRefs = [];
      const clientCache = /* @__PURE__ */ new Map();
      for (const t of normalized) {
        if (t.projectId && t.clientId) {
          const cacheKey = `${t.projectId}:${t.clientId}`;
          let valid = clientCache.get(cacheKey);
          if (valid === void 0) {
            const client = await prisma.client.findFirst({
              where: { id: t.clientId, projectId: t.projectId },
              select: { id: true }
            });
            valid = !!client;
            clientCache.set(cacheKey, valid);
          }
          if (!valid) invalidClientRefs.push(t);
        } else {
          invalidClientRefs.push(t);
        }
      }
      if (invalidClientRefs.length > 0) {
        const sample = invalidClientRefs.slice(0, 5).map((t) => t.ticketId || t.refNumber || `row-${t.index + 1}`).join(", ");
        res.status(400).json({
          error: `???? ${invalidClientRefs.length} ????? ????? ??? ???? ?? ?? ???? ??????? (?????: ${sample})`
        });
        return;
      }
      const created = await prisma.ticket.createMany({
        data: normalized.map((t) => ({
          ticketId: t.ticketId,
          refNumber: t.refNumber,
          projectAbbr: t.projectAbbr,
          projectId: t.projectId,
          clientId: t.clientId,
          clientName: t.clientName,
          villaNumber: t.villaNumber,
          issuedAt: t.issuedAt,
          description: t.description,
          type: t.type,
          status: t.status,
          priority: t.priority,
          assigneeName: t.assigneeName,
          assignedSupervisorId: t.assignedSupervisorId,
          assignedSupervisorIds: t.assignedSupervisorIds,
          detectedTypes: t.detectedTypes,
          appointmentTime: t.appointmentTime,
          appointmentNotes: t.appointmentNotes
        })),
        skipDuplicates: true
      });
      res.status(201).json({ count: created.count });
    } catch (err) {
      console.error("Bulk import error:", err);
      res.status(400).json({ error: err.message });
    }
  });
  app.put("/api/tickets/:id", requireAuth, async (req, res) => {
    const data = req.body;
    try {
      const ticket = await prisma.ticket.update({
        where: { id: req.params.id },
        data: {
          status: data.status ?? void 0,
          priority: data.priority !== void 0 ? String(data.priority) : void 0,
          assigneeName: data.assigneeName ?? void 0,
          assignedSupervisorId: data.assignedSupervisorId ?? void 0,
          assignedSupervisorIds: data.assignedSupervisorIds ?? void 0,
          assignedSupervisors: data.assignedSupervisors ?? void 0,
          appointmentTime: data.appointmentTime ?? void 0,
          appointmentNotes: data.appointmentNotes ?? void 0,
          closureNotes: data.closureNotes ?? void 0,
          maintenanceItems: data.maintenanceItems ?? void 0,
          closedAt: data.closedAt !== void 0 ? data.closedAt ? new Date(data.closedAt) : null : void 0,
          description: data.description ?? void 0,
          type: data.type ?? void 0
        }
      });
      res.json(ticket);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.patch("/api/tickets/bulk-status", requireAuth, async (req, res) => {
    const { ids, status } = req.body;
    await prisma.ticket.updateMany({ where: { id: { in: ids } }, data: { status } });
    res.json({ count: ids.length });
  });
  app.delete("/api/tickets/:id", requireAuth, async (req, res) => {
    await prisma.ticket.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  });
  app.delete("/api/tickets", requireAuth, async (_req, res) => {
    const result = await prisma.ticket.deleteMany();
    res.json({ count: result.count });
  });
  function prismaModelExists(modelName) {
    try {
      return prisma[modelName] !== void 0;
    } catch {
      return false;
    }
  }
  const hasTechnician = prismaModelExists("technician");
  if (hasTechnician) {
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
          shoeSize: data.shoeSize || null
        }
      });
      res.status(201).json(tech);
    });
    app.put("/api/technicians/:id", requireAuth, async (req, res) => {
      const data = req.body;
      const tech = await prisma.technician.update({
        where: { id: req.params.id },
        data: {
          employeeId: data.employeeId ?? void 0,
          phoneNumber: data.phoneNumber ?? void 0,
          specialty: data.specialty ?? void 0,
          experienceLevel: data.experienceLevel ?? void 0,
          supervisorId: data.supervisorId ?? void 0,
          projectId: data.projectId ?? void 0,
          name: data.name ?? void 0,
          idNumber: data.idNumber ?? void 0,
          idPhotoUrl: data.idPhotoUrl ?? void 0,
          documentUrls: data.documentUrls ?? void 0,
          clothingSize: data.clothingSize ?? void 0,
          shoeSize: data.shoeSize ?? void 0
        }
      });
      res.json(tech);
    });
    app.delete("/api/technicians/:id", requireAuth, async (req, res) => {
      await prisma.technician.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    });
  } else {
    console.warn("\u26A0\uFE0F Technician model not found in Prisma schema. Technician endpoints disabled.");
    app.get("/api/technicians", (_req, res) => res.json([]));
    app.post("/api/technicians", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
    app.put("/api/technicians/:id", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
    app.delete("/api/technicians/:id", (_req, res) => res.status(501).json({ error: "Technician model not available" }));
  }
  app.post("/api/generate-report", (req, res) => {
    const scriptPath = path.join(__dirname, "report_generator.py");
    const pythonBin = process.platform === "win32" ? "python" : "python3";
    const python = spawn(pythonBin, [scriptPath, "--stdin"], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }
    });
    let output = "";
    let errorOutput = "";
    python.stdin.write(JSON.stringify(req.body));
    python.stdin.end();
    python.stdout.on("data", (data) => {
      output += data.toString();
    });
    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
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
        try {
          unlinkSync(jpgPath);
        } catch {
        }
      } catch {
        res.status(500).json({ error: "Failed to read report file" });
      }
    });
  });
  let _kwCache = [];
  let _kwCacheTime = 0;
  const KW_CACHE_TTL = 5 * 60 * 1e3;
  async function loadKeywordsFromDB(force = false) {
    if (!force && _kwCache.length > 0 && Date.now() - _kwCacheTime < KW_CACHE_TTL) {
      return _kwCache;
    }
    const rows = await prisma.ticketTypeKeyword.findMany({
      where: { typeId: { not: null }, ticketType: { isActive: true } },
      include: { ticketType: { select: { key: true } } }
    });
    _kwCache = rows.filter((r) => r.ticketType?.key).map((r) => ({
      keyword: r.keyword,
      typeKey: r.ticketType.key,
      weight: r.weight
    }));
    _kwCacheTime = Date.now();
    return _kwCache;
  }
  async function buildTypeToSpecialtyMap() {
    const types = await prisma.ticketType.findMany({
      where: { isActive: true },
      include: { specialty: { select: { key: true } } }
    });
    const map = {};
    for (const t of types) {
      map[t.key] = t.specialty?.key || "general";
    }
    return map;
  }
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  const GEMINI_MODEL = "gemini-2.5-flash";
  const VALID_TYPES = [
    "plumbing",
    "electricity",
    "doors_windows",
    "cracks",
    "ceramics",
    "tank_insulation",
    "drainage",
    "ac_ventilation",
    "pumps",
    "waterproofing",
    "grading",
    "pest_control",
    "cleaning",
    "structural",
    "paints",
    "doors"
  ];
  let _refCache = { types: [], specialties: [], recentTickets: [], keywords: [] };
  let _refCacheTime = 0;
  const REF_CACHE_TTL = 10 * 60 * 1e3;
  async function buildContextPayload(force = false) {
    if (!force && _refCache.types.length > 0 && Date.now() - _refCacheTime < REF_CACHE_TTL) {
      return _refCache;
    }
    const [types, specialties, recentTickets, keywords] = await Promise.all([
      prisma.ticketType.findMany({
        where: { isActive: true },
        include: {
          specialty: { select: { key: true, nameAr: true } },
          subTypes: { where: { isActive: true }, select: { nameAr: true, description: true }, orderBy: { sortOrder: "asc" } },
          _count: { select: { keywords: true, tickets: true } }
        },
        orderBy: { sortOrder: "asc" }
      }),
      prisma.specialty.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" }
      }),
      prisma.ticket.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
        select: { description: true, type: true, status: true },
        where: { type: { not: "" } }
      }),
      prisma.ticketTypeKeyword.findMany({
        where: { typeId: { not: null } },
        select: { keyword: true, weight: true, ticketType: { select: { key: true, nameAr: true } } },
        orderBy: { weight: "desc" },
        take: 200
      })
    ]);
    _refCache = { types, specialties, recentTickets, keywords };
    _refCacheTime = Date.now();
    return _refCache;
  }
  async function buildRichPrompt(description, projectId) {
    const ctx = await buildContextPayload();
    const typesList = ctx.types.map(
      (t) => `  - "${t.key}" (${t.nameAr}) \u2190 \u062A\u062E\u0635\u0635: ${t.specialty?.nameAr || "\u0639\u0627\u0645"} | \u0643\u0644\u0645\u0627\u062A \u0645\u0641\u062A\u0627\u062D\u064A\u0629: ${t._count.keywords} | \u062A\u0630\u0627\u0643\u0631 \u0633\u0627\u0628\u0642\u0629: ${t._count.tickets}${t.subTypes.length ? ` | \u0623\u0646\u0648\u0627\u0639 \u0641\u0631\u0639\u064A\u0629: ${t.subTypes.map((s) => s.nameAr).join("\u060C ")}` : ""}`
    ).join("\n");
    const specialtiesList = ctx.specialties.map(
      (s) => `  - "${s.key}" \u2190 ${s.nameAr}`
    ).join("\n");
    const recentExamples = ctx.recentTickets.slice(0, 10).map(
      (t) => `  - \u0648\u0635\u0641: "${(t.description || "").slice(0, 120)}" \u2190 \u0627\u0644\u0646\u0648\u0639: "${t.type}" (\u0627\u0644\u062D\u0627\u0644\u0629: ${t.status})`
    ).join("\n\n");
    const topKeywords = ctx.keywords.slice(0, 40).map(
      (k) => `  - "${k.keyword}" \u2190 ${k.ticketType?.nameAr || k.ticketType?.key} (\u0648\u0632\u0646: ${k.weight})`
    ).join("\n");
    let projectInfo = "";
    if (projectId) {
      try {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: { clients: { take: 5, select: { villaNumber: true, name: true } } }
        });
        if (project) {
          projectInfo = `
\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0648\u0639:
  \u0627\u0644\u0627\u0633\u0645: ${project.name}
  \u0627\u0644\u0645\u0648\u0642\u0639: ${project.location}
  \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0633\u062C\u0644\u0648\u0646: ${project.clients.length}
`;
          const supsInProject = await prisma.user.count({
            where: { role: "supervisor", projectIds: { has: projectId } }
          });
          projectInfo += `  \u0627\u0644\u0645\u0634\u0631\u0641\u0648\u0646 \u0627\u0644\u0645\u062E\u0635\u0635\u0648\u0646: ${supsInProject}
`;
        }
      } catch {
      }
    }
    return `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u062A\u0635\u0646\u064A\u0641 \u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u0629 (\u0628\u0639\u062F \u0627\u0644\u0628\u064A\u0639). 
\u0623\u0645\u0627\u0645\u0643 \u0642\u0627\u0639\u062F\u0629 \u0645\u0639\u0631\u0641\u0629 \u0643\u0627\u0645\u0644\u0629 \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645 \u062A\u0634\u0645\u0644 \u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629\u060C \u0627\u0644\u062A\u062E\u0635\u0635\u0627\u062A\u060C \u0623\u0645\u062B\u0644\u0629 \u0645\u0646 \u0627\u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0633\u0627\u0628\u0642\u0629\u060C \u0648\u0627\u0644\u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0641\u062A\u0627\u062D\u064A\u0629.
\u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0644\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u062C\u062F\u064A\u062F \u0628\u062F\u0642\u0629.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F9E0} **\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645:**

**\u0627\u0644\u062A\u062E\u0635\u0635\u0627\u062A:**
${specialtiesList}

**\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 (\u0645\u0639 \u0643\u0644 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644):**
${typesList}

**\u0623\u0645\u062B\u0644\u0629 \u0645\u0646 \u0627\u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0627\u0644\u0645\u0635\u0646\u0641\u0629 (\u0644\u0644\u0627\u0633\u062A\u0631\u0634\u0627\u062F):**
${recentExamples || "  (\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0630\u0627\u0643\u0631 \u0633\u0627\u0628\u0642\u0629 \u0628\u0639\u062F)"}

**\u0642\u0627\u0645\u0648\u0633 \u0627\u0644\u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0641\u062A\u0627\u062D\u064A\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0629:**
${topKeywords || "  (\u0644\u0627 \u062A\u0648\u062C\u062F \u0643\u0644\u0645\u0627\u062A \u0645\u0641\u062A\u0627\u062D\u064A\u0629 \u0628\u0639\u062F)"}
${projectInfo}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

**\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u062C\u062F\u064A\u062F \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u062A\u0635\u0646\u064A\u0641\u0647:** "${description}"

**\u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0635\u0627\u0631\u0645\u0629:**
1. \u0627\u062E\u062A\u0631 TYPE \u0648\u0627\u062D\u062F \u0623\u0633\u0627\u0633\u064A \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0639\u0644\u0627\u0647 (primaryType)
2. \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0648\u0635\u0641 \u064A\u0646\u0627\u0633\u0628 \u0623\u0643\u062B\u0631 \u0645\u0646 \u0646\u0648\u0639\u060C \u0623\u062F\u0631\u062C\u0647\u0627 \u0641\u064A allTypes \u0645\u0631\u062A\u0628\u0629 \u062D\u0633\u0628 \u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629
3. \u0627\u0644\u062F\u0631\u062C\u0629 (confidence) \u0645\u0646 1 \u0625\u0644\u0649 10 \u2014 \u0643\u0644\u0645\u0627 \u0643\u0627\u0646 \u0627\u0644\u0648\u0635\u0641 \u0648\u0627\u0636\u062D\u064B\u0627 \u0648\u0627\u0644\u062A\u0637\u0627\u0628\u0642 \u0642\u0648\u064A\u064B\u0627\u060C \u0632\u0627\u062F\u062A \u0627\u0644\u062F\u0631\u062C\u0629
4. \u0627\u0634\u0631\u062D \u0633\u0628\u0628 \u0627\u062E\u062A\u064A\u0627\u0631\u0643 (reason) \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u2014 \u0645\u062B\u0644\u0627\u064B: "\u0627\u0644\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0641\u062A\u0627\u062D\u064A\u0629 X \u062A\u0637\u0627\u0628\u0642\u0629 \u0645\u0639 \u0627\u0644\u0646\u0648\u0639 Y"
5. \u0627\u0633\u062A\u062E\u062F\u0645 \u0623\u0645\u062B\u0644\u0629 \u0627\u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0644\u0644\u0627\u0633\u062A\u0631\u0634\u0627\u062F \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0645\u0634\u0627\u0628\u0647\u0629 \u0644\u0644\u0648\u0635\u0641 \u0627\u0644\u062C\u062F\u064A\u062F
6. \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0648\u0635\u0641 \u063A\u0627\u0645\u0636\u064B\u0627 \u062C\u062F\u064B\u0627\u060C \u0627\u062E\u062A\u0631 \u0627\u0644\u0646\u0648\u0639 \u0627\u0644\u0623\u0642\u0631\u0628 \u0628\u062F\u0631\u062C\u0629 \u062B\u0642\u0629 \u0645\u0646\u062E\u0641\u0636\u0629
7. \u0645\u0647\u0645 \u062C\u062F\u0627: \u0625\u0630\u0627 \u0643\u0627\u0646 \u0647\u0646\u0627\u0643 \u0646\u0648\u0639 \u062C\u062F\u064A\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0639\u0644\u0627\u0647 \u0648\u062A\u0639\u062A\u0642\u062F \u0623\u0646\u0647 \u0645\u0647\u0645 \u0648\u064A\u0633\u062A\u062D\u0642 \u0627\u0644\u0625\u0636\u0627\u0641\u0629\u060C \u0623\u0636\u0641 suggestedNewType (key \u0625\u0646\u062C\u0644\u064A\u0632\u064A) \u0648\u0627\u062E\u062A\u0631 specialtyKey \u0645\u0646\u0627\u0633\u0628
8. \u0645\u0647\u0645 \u062C\u062F\u0627: \u0625\u0630\u0627 \u0643\u0627\u0646 \u0647\u0646\u0627\u0643 \u0645\u0634\u0643\u0644\u0629 \u0645\u062D\u062F\u062F\u0629 \u062C\u062F\u0627\u064B \u062A\u0633\u062A\u062D\u0642 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0646\u0648\u0639\u0627\u064B \u0641\u0631\u0639\u064A\u0627\u064B \u062A\u062D\u062A \u0627\u0644\u0646\u0648\u0639 \u0627\u0644\u0623\u0633\u0627\u0633\u064A (primaryType) \u0648\u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u0641\u064A \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0641\u0631\u0639\u064A\u0629 \u0623\u0639\u0644\u0627\u0647\u060C \u0623\u0636\u0641 suggestedNewSubType (\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629)
9. \u0627\u0642\u062A\u0631\u0627\u062D \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0641\u0642\u0637 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0648\u0635\u0641 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0645\u0634\u0643\u0644\u0629 \u0648\u0627\u0636\u062D\u0629 \u0648\u0645\u062A\u0643\u0631\u0631\u0629 \u0648\u0645\u0647\u0645\u0629

**\u0623\u0631\u062C\u0650\u0639 ONLY JSON \u0628\u0627\u0644\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u062A\u0627\u0644\u064A (\u0645\u0645\u0646\u0648\u0639 markdown \u0623\u0648 \u0646\u0635\u0648\u0635 \u0625\u0636\u0627\u0641\u064A\u0629):**
{"primaryType":"...","allTypes":["..."],"confidence":8,"reason":"...","suggestedNewType":null,"suggestedNewSubType":null}`;
  }
  async function classifyWithGeminiEnhanced(description, projectId) {
    if (!GEMINI_API_KEY) return null;
    const prompt = await buildRichPrompt(description, projectId);
    try {
      const isNewKey = GEMINI_API_KEY.startsWith("AQ.");
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
      const headers = { "Content-Type": "application/json" };
      if (isNewKey) headers["x-goog-api-key"] = GEMINI_API_KEY;
      const res = await fetch(isNewKey ? apiUrl : `${apiUrl}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        })
      });
      if (!res.ok) {
        console.warn(`\u26A0\uFE0F Gemini API error: ${res.status} - ${await res.text().catch(() => "no body")}`);
        return null;
      }
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      let text = rawText;
      if (!text) {
        const fc = data?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
        if (fc?.args) text = JSON.stringify(fc.args);
      }
      if (!text) {
        console.warn("\u26A0\uFE0F Gemini returned empty response");
        return null;
      }
      return parseGeminiJsonResponse(text);
    } catch (err) {
      console.warn("\u26A0\uFE0F Gemini API call failed:", err);
      return null;
    }
  }
  function parseGeminiJsonResponse(text) {
    try {
      let cleanJson = text.trim();
      console.log("  \u{1F4CB} Raw Gemini response length:", text.length, "trimmed:", cleanJson.length);
      console.log("  \u{1F4CB} Raw ends with:", JSON.stringify(cleanJson.slice(-50)));
      if (cleanJson.includes("```")) {
        const lines = cleanJson.split("\n");
        const filteredLines = lines.filter((line) => !line.trim().startsWith("```"));
        cleanJson = filteredLines.join("\n").trim();
      }
      const firstBrace = cleanJson.indexOf("{");
      const lastBrace = cleanJson.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }
      console.log("  \u{1F4CB} Cleaned JSON:", cleanJson.slice(0, 300));
      let result;
      try {
        result = JSON.parse(cleanJson);
      } catch {
        cleanJson = cleanJson.replace(/['\u2018\u2019\u201A\u201B\u2032\u2035`\u00B4]/g, "").replace(/["\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
        cleanJson = cleanJson.replace(/""/g, '"');
        console.log("  \u{1F4CB} Fixed JSON:", cleanJson.slice(0, 300));
        let trimmed = cleanJson;
        let parseAttempt = null;
        while (trimmed.length > 20) {
          try {
            parseAttempt = JSON.parse(trimmed);
            break;
          } catch {
            trimmed = trimmed.slice(0, -1);
          }
        }
        if (parseAttempt) {
          result = parseAttempt;
        } else {
          console.warn("  \u26A0\uFE0F Could not parse JSON even after aggressive trimming");
          return null;
        }
      }
      if (!result.primaryType) return null;
      const validTypes = (result.allTypes || []).filter((t) => VALID_TYPES.includes(t));
      let finalTypes = validTypes.length > 0 ? validTypes : [result.primaryType];
      return {
        primaryType: result.primaryType,
        allTypes: finalTypes.slice(0, 3),
        confidence: result.confidence || 5,
        reason: result.reason || "",
        suggestedNewType: result.suggestedNewType || null,
        suggestedNewSubType: result.suggestedNewSubType || null
      };
    } catch (parseErr) {
      console.warn("\u26A0\uFE0F Gemini JSON Parsing Failed:", parseErr instanceof Error ? parseErr.message : String(parseErr), "| Raw:", text.slice(0, 200));
      return null;
    }
  }
  async function classifyTicket(description, projectId) {
    if (GEMINI_API_KEY) {
      const geminiResult = await classifyWithGeminiEnhanced(description, projectId);
      if (geminiResult && VALID_TYPES.includes(geminiResult.primaryType)) {
        console.log(`  \u2705 Gemini classified: ${geminiResult.primaryType} (confidence=${geminiResult.confidence})`);
        if (geminiResult.suggestedNewType) {
          learnNewTypeFromGemini(geminiResult.suggestedNewType, geminiResult.primaryType, description).catch(() => {
          });
        }
        if (geminiResult.suggestedNewSubType) {
          learnNewSubTypeFromGemini(geminiResult.primaryType, geminiResult.suggestedNewSubType, description).catch(() => {
          });
        }
        return {
          primaryType: geminiResult.primaryType,
          allTypes: geminiResult.allTypes,
          confidence: geminiResult.confidence,
          source: "gemini",
          reason: geminiResult.reason,
          suggestedNewType: geminiResult.suggestedNewType,
          suggestedNewSubType: geminiResult.suggestedNewSubType
        };
      }
      console.log("  \u26A0\uFE0F Gemini result invalid, falling back to keywords");
    }
    const keywords = await loadKeywordsFromDB();
    const kwResult = classifyFromKeywordsDB(description, keywords);
    return {
      primaryType: kwResult.primaryType,
      allTypes: kwResult.allTypes,
      confidence: kwResult.confidence,
      source: "keywords"
    };
  }
  async function learnNewTypeFromGemini(suggestedKey, parentTypeKey, description) {
    try {
      const existing = await prisma.ticketType.findUnique({ where: { key: suggestedKey } });
      if (existing) return;
      const parentType = await prisma.ticketType.findUnique({
        where: { key: parentTypeKey },
        include: { specialty: true }
      });
      const specialtyKey = parentType?.specialtyKey || "general";
      const specialties = await prisma.specialty.findMany({ where: { isActive: true } });
      const validSpecialtyKeys = new Set(specialties.map((s) => s.key));
      const finalSpecialty = validSpecialtyKeys.has(specialtyKey) ? specialtyKey : "general";
      const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
      const nextOrder = (maxOrder._max.sortOrder || 0) + 1;
      const nameAr = "\u0635\u064A\u0627\u0646\u0629 " + suggestedKey.replace(/_/g, " ");
      const newType = await prisma.ticketType.create({
        data: {
          key: suggestedKey,
          nameAr,
          nameEn: suggestedKey,
          description: `\u062A\u0645 \u0625\u0646\u0634\u0627\u0624\u0647 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0645\u0646 \u062A\u0635\u0646\u064A\u0641: ${description.slice(0, 200)}`,
          specialtyKey: finalSpecialty,
          sortOrder: nextOrder,
          isActive: true,
          color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
          icon: "\u{1F4CB}"
        }
      });
      const words = description.toLowerCase().replace(/[،,?.!;:""''\s]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
      for (const word of [...new Set(words)].slice(0, 5)) {
        await prisma.ticketTypeKeyword.upsert({
          where: { keyword_typeId: { keyword: word, typeId: newType.id } },
          update: { weight: { increment: 0.5 } },
          create: { keyword: word, typeId: newType.id, weight: 1, source: "gemini_suggested", isLearned: true, confidence: 0.7, usageCount: 1 }
        });
      }
      VALID_TYPES.push(suggestedKey);
      console.log(`  \u{1F195} Auto-created new type: "${suggestedKey}" (${nameAr})`);
      _refCacheTime = 0;
      _kwCache = [];
      _kwCacheTime = 0;
    } catch (err) {
      console.warn(`  \u26A0\uFE0F Failed to learn new type "${suggestedKey}":`, err);
    }
  }
  async function learnNewSubTypeFromGemini(parentTypeKey, subTypeNameAr, description) {
    try {
      const parentType = await prisma.ticketType.findUnique({ where: { key: parentTypeKey } });
      if (!parentType) return;
      const existing = await prisma.ticketSubType.findFirst({
        where: { parentTypeId: parentType.id, nameAr: subTypeNameAr, isActive: true }
      });
      if (existing) return;
      const maxOrder = await prisma.ticketSubType.aggregate({
        where: { parentTypeId: parentType.id },
        _max: { sortOrder: true }
      });
      const nextOrder = (maxOrder._max.sortOrder || 0) + 1;
      await prisma.ticketSubType.create({
        data: {
          parentTypeId: parentType.id,
          nameAr: subTypeNameAr,
          description: `\u062A\u0645 \u0625\u0646\u0634\u0627\u0624\u0647 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0645\u0646: ${description.slice(0, 200)}`,
          sortOrder: nextOrder,
          isActive: true
        }
      });
      console.log(`  \u{1F195} Auto-created sub-type: "${subTypeNameAr}" under ${parentType.nameAr}`);
      _refCacheTime = 0;
    } catch (err) {
      console.warn(`  \u26A0\uFE0F Failed to learn sub-type "${subTypeNameAr}":`, err);
    }
  }
  async function autoLearnFromClassification(description, typeKey, confidence) {
    if (confidence < 6 || !description || !typeKey) return;
    try {
      const type = await prisma.ticketType.findUnique({ where: { key: typeKey } });
      if (!type) return;
      const stopWords = /* @__PURE__ */ new Set([
        "\u0641\u064A",
        "\u0645\u0646",
        "\u0627\u0644\u0649",
        "\u0639\u0644\u0649",
        "\u0639\u0646",
        "\u0645\u0639",
        "\u0647\u0630\u0627",
        "\u0647\u0630\u0647",
        "\u0630\u0644\u0643",
        "\u062A\u0644\u0643",
        "\u0627\u0644\u062A\u064A",
        "\u0627\u0644\u0630\u064A",
        "\u0643\u0627\u0646",
        "\u0643\u0627\u0646\u062A",
        "\u064A\u0643\u0648\u0646",
        "\u0647\u0648",
        "\u0647\u064A",
        "\u0647\u0645",
        "\u0627\u0646\u0627",
        "\u0646\u062D\u0646",
        "\u0627\u0646\u062A",
        "\u0627\u0646\u062A\u0645",
        "\u064A\u0648\u062C\u062F",
        "\u0644\u0627",
        "\u0644\u0645",
        "\u0644\u0646",
        "\u0645\u0627",
        "\u0642\u062F",
        "\u0643\u0644",
        "\u0628\u0639\u0636",
        "\u063A\u064A\u0631",
        "\u0648\u0642\u062A",
        "\u064A\u0648\u0645",
        "\u0633\u0627\u0639\u0629",
        "\u0627\u0644\u0627\u0646",
        "\u0627\u0644\u064A\u0648\u0645",
        "\u062C\u062F\u0627",
        "\u0641\u0642\u0637",
        "\u062D\u062A\u0649",
        "\u0627\u064A\u0636\u0627",
        "\u0627\u0648",
        "\u0648",
        "\u062B\u0645",
        "\u0644\u0643\u0646",
        "\u0627\u0645\u0627",
        "\u0627\u0630\u0627",
        "\u0644\u0627\u0646",
        "\u0628\u0633\u0628\u0628",
        "\u062D\u064A\u062B",
        "\u0628\u064A\u0646",
        "\u062E\u0644\u0627\u0644",
        "\u062F\u0648\u0646",
        "\u0642\u0628\u0644",
        "\u0628\u0639\u062F",
        "\u062A\u062D\u062A",
        "\u0641\u0648\u0642",
        "\u0627\u0644",
        "\u0627\u0644\u0644\u064A",
        "\u0627\u0644\u0627",
        "\u0627\u0646",
        "\u0627\u0646",
        "\u0627\u0648",
        "\u0628",
        "\u062A",
        "\u062B",
        "\u062C",
        "\u062D"
      ]);
      const words = description.toLowerCase().replace(/[،,?.!;:""'']/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w) && isNaN(Number(w)));
      const uniqueWords = [...new Set(words)].slice(0, 5);
      for (const word of uniqueWords) {
        const existingOther = await prisma.ticketTypeKeyword.findFirst({
          where: { keyword: word, typeId: { not: type.id } }
        });
        if (existingOther) continue;
        await prisma.ticketTypeKeyword.upsert({
          where: { keyword_typeId: { keyword: word, typeId: type.id } },
          update: {
            usageCount: { increment: 1 },
            weight: { increment: 0.2 },
            isLearned: true,
            source: "auto_learned"
          },
          create: {
            keyword: word,
            typeId: type.id,
            weight: 1,
            isLearned: true,
            source: "auto_learned",
            confidence: confidence / 10,
            usageCount: 1
          }
        });
      }
      _kwCache = [];
      _kwCacheTime = 0;
      if (uniqueWords.length > 0) {
        console.log(`  \u{1F4DA} Auto-learned ${uniqueWords.length} keywords for "${type.nameAr}" from classification`);
      }
    } catch (err) {
      console.warn("  \u26A0\uFE0F Auto-learn failed:", err);
    }
  }
  const CONFLICTING_PAIRS = [
    ["electricity", "plumbing"],
    ["electricity", "drainage"],
    ["electricity", "pumps"],
    ["electricity", "ac_ventilation"],
    ["electricity", "waterproofing"],
    ["electricity", "grading"],
    ["electricity", "pest_control"],
    ["electricity", "structural"],
    ["electricity", "tank_insulation"],
    ["plumbing", "electricity"],
    ["doors_windows", "electricity"],
    ["cracks", "pest_control"],
    ["cleaning", "structural"]
  ];
  function classifyFromKeywordsDB(description, keywords) {
    const text = description.toLowerCase();
    const scores = {};
    for (const kw of keywords) {
      if (text.includes(kw.keyword)) {
        scores[kw.typeKey] = (scores[kw.typeKey] || 0) + kw.weight;
      }
    }
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return { primaryType: "plumbing", allTypes: ["plumbing"], confidence: 0 };
    }
    const maxScore = sorted[0][1];
    const threshold = Math.max(3, maxScore * 0.5);
    let candidates = sorted.filter(([, s]) => s >= threshold).map(([t]) => t);
    if (candidates.includes("electricity") && candidates.length > 1) {
      const elecScore = scores["electricity"] || 0;
      if (elecScore < maxScore * 0.7) {
        candidates = candidates.filter((t) => t !== "electricity");
      }
    }
    if (candidates.length > 3) {
      const secondScore = sorted[1]?.[1] || 0;
      if (maxScore > secondScore * 2.5) {
        candidates = [candidates[0]];
      } else if (maxScore > secondScore * 1.8) {
        candidates = candidates.slice(0, 2);
      }
    }
    const conflictSet = new Set(
      CONFLICTING_PAIRS.filter(
        ([a, b]) => candidates.includes(a) && candidates.includes(b)
      ).flat()
    );
    if (conflictSet.size > 0) {
      const keep = /* @__PURE__ */ new Map();
      for (const c of candidates) {
        keep.set(c, scores[c] || 0);
      }
      for (const [a, b] of CONFLICTING_PAIRS) {
        if (keep.has(a) && keep.has(b)) {
          const [loser] = (keep.get(a) || 0) >= (keep.get(b) || 0) ? [b] : [a];
          keep.delete(loser);
        }
      }
      candidates = [...keep.keys()];
    }
    if (candidates.length === 0) candidates = [sorted[0][0]];
    return { primaryType: candidates[0], allTypes: candidates, confidence: maxScore };
  }
  async function findSupervisorsDB(projectId, requiredSpecialties) {
    const allUsers = await prisma.user.findMany({
      where: { role: "supervisor" },
      select: { uid: true, displayName: true, specialties: true, specialty: true, projectIds: true }
    });
    const activeUsers = allUsers.filter((u) => !u.uid.startsWith("pending_"));
    let projectSups = activeUsers.filter(
      (u) => Array.isArray(u.projectIds) && u.projectIds.includes(projectId)
    );
    if (projectSups.length === 0) projectSups = activeUsers;
    const getSpecs = (u) => {
      if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
      if (u.specialty) return [u.specialty];
      return ["general"];
    };
    let matched = projectSups.filter(
      (s) => getSpecs(s).some((sp) => requiredSpecialties.includes(sp))
    );
    if (matched.length === 0) {
      matched = projectSups.filter((s) => getSpecs(s).includes("general"));
    }
    if (matched.length === 0) {
      matched = projectSups.slice(0, 3);
    }
    return matched.map((u) => ({
      id: u.uid,
      name: u.displayName,
      specialties: getSpecs(u)
    }));
  }
  app.post("/api/classify", requireAuth, async (req, res) => {
    try {
      const { description, projectId } = req.body;
      if (!description || !projectId) {
        res.status(400).json({ error: "description and projectId are required" });
        return;
      }
      const classification = await classifyTicket(description, projectId);
      const typeToSpecialty = await buildTypeToSpecialtyMap();
      const requiredSpecialties = [...new Set(classification.allTypes.map((t) => typeToSpecialty[t] || "general"))];
      const supervisors = await findSupervisorsDB(projectId, requiredSpecialties);
      if (classification.source === "gemini" && classification.confidence >= 6) {
        await autoLearnFromClassification(description, classification.primaryType, classification.confidence);
        _refCacheTime = 0;
      }
      res.json({
        primaryType: classification.primaryType,
        allTypes: classification.allTypes,
        requiredSpecialties,
        confidence: classification.confidence,
        source: classification.source,
        supervisors,
        reason: classification.reason || void 0,
        suggestedNewType: classification.suggestedNewType || void 0,
        suggestedNewSubType: classification.suggestedNewSubType || void 0
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/classify/bulk", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        res.status(400).json({ error: "items must be an array" });
        return;
      }
      const typeToSpecialty = await buildTypeToSpecialtyMap();
      const projectIds = [...new Set(items.map((i) => i.projectId))];
      const supervisorCache = {};
      for (const pid of projectIds) {
        supervisorCache[pid] = await prisma.user.findMany({
          where: { role: "supervisor", projectIds: { has: pid } },
          select: { uid: true, displayName: true, specialties: true, specialty: true }
        });
        if (supervisorCache[pid].length === 0) {
          supervisorCache[pid] = await prisma.user.findMany({
            where: { role: "supervisor" },
            select: { uid: true, displayName: true, specialties: true, specialty: true }
          });
        }
      }
      const getSpecs = (u) => {
        if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
        if (u.specialty) return [u.specialty];
        return ["general"];
      };
      const results = await Promise.all(items.map(async (item) => {
        const classification = await classifyTicket(item.description, item.projectId);
        if (classification.source === "gemini" && classification.confidence >= 6) {
          await autoLearnFromClassification(item.description, classification.primaryType, classification.confidence);
        }
        const requiredSpecialties = [...new Set(classification.allTypes.map((t) => typeToSpecialty[t] || "general"))];
        const projectSups = supervisorCache[item.projectId] || [];
        const matched = projectSups.filter(
          (s) => getSpecs(s).some((sp) => requiredSpecialties.includes(sp))
        );
        const fallback = matched.length > 0 ? matched : projectSups.filter((s) => getSpecs(s).includes("general"));
        const finalSups = fallback.length > 0 ? fallback : projectSups;
        return {
          primaryType: classification.primaryType,
          allTypes: classification.allTypes,
          requiredSpecialties,
          confidence: classification.confidence,
          source: classification.source,
          supervisors: finalSups.map((u) => ({
            id: u.uid,
            name: u.displayName,
            specialties: getSpecs(u)
          }))
        };
      }));
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/tickets/import", requireAuth, async (req, res) => {
    try {
      const { projectId, tickets: rawTickets } = req.body;
      if (!projectId || !Array.isArray(rawTickets) || rawTickets.length === 0) {
        res.status(400).json({ error: "projectId and tickets array are required" });
        return;
      }
      const projectClients = await prisma.client.findMany({
        where: { projectId },
        select: { id: true, villaNumber: true, name: true, phone: true }
      });
      const clientByVilla = Object.fromEntries(projectClients.map((c) => [c.villaNumber, c]));
      const projectSups = await prisma.user.findMany({
        where: { role: "supervisor", projectIds: { has: projectId } },
        select: { uid: true, displayName: true, specialties: true, specialty: true }
      });
      const allSups = projectSups.length > 0 ? projectSups : await prisma.user.findMany({
        where: { role: "supervisor" },
        select: { uid: true, displayName: true, specialties: true, specialty: true }
      });
      const keywords = await loadKeywordsFromDB();
      const typeToSpecialty = await buildTypeToSpecialtyMap();
      const getSpecs = (u) => {
        if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
        if (u.specialty) return [u.specialty];
        return ["general"];
      };
      const errors = [];
      const ticketsToCreate = [];
      for (let i = 0; i < rawTickets.length; i++) {
        const raw = rawTickets[i];
        const description = (raw.description || "").trim();
        const villaNumber = (raw.villaNumber || "").trim();
        const clientId = (raw.clientId || "").trim();
        let matchedClientId = clientId;
        if (!matchedClientId && villaNumber) {
          matchedClientId = clientByVilla[villaNumber]?.id || "";
        }
        if (!matchedClientId) {
          errors.push({ index: i, reason: "No client found for villa " + villaNumber });
          continue;
        }
        let classification;
        if (GEMINI_API_KEY) {
          const geminiResult = await classifyWithGeminiEnhanced(description, projectId);
          if (geminiResult && VALID_TYPES.includes(geminiResult.primaryType)) {
            classification = { primaryType: geminiResult.primaryType, allTypes: geminiResult.allTypes, confidence: geminiResult.confidence };
            await autoLearnFromClassification(description, geminiResult.primaryType, geminiResult.confidence);
          } else {
            classification = classifyFromKeywordsDB(description, keywords);
          }
        } else {
          classification = classifyFromKeywordsDB(description, keywords);
        }
        const type = raw.type || classification.primaryType;
        const requiredSpecialties = [...new Set(classification.allTypes.map((t) => typeToSpecialty[t] || "general"))];
        const matchedSups = allSups.filter((s) => getSpecs(s).some((sp) => requiredSpecialties.includes(sp)));
        const finalSups = matchedSups.length > 0 ? matchedSups : allSups.filter((s) => getSpecs(s).includes("general"));
        const supervisorList = finalSups.length > 0 ? finalSups : allSups;
        const supervisorIds = supervisorList.map((s) => s.uid);
        const primarySup = supervisorList[0];
        const priorityNum = raw.priority !== void 0 ? parseInt(String(raw.priority), 10) : 3;
        ticketsToCreate.push({
          ticketId: raw.ticketId || String(Date.now() + i).slice(-6),
          refNumber: raw.refNumber || "",
          projectAbbr: null,
          projectId,
          clientId: matchedClientId,
          clientName: clientByVilla[villaNumber]?.name || raw.clientName || "",
          villaNumber,
          issuedAt: raw.issuedAt || null,
          description,
          type,
          status: "open",
          priority: isNaN(priorityNum) ? 3 : priorityNum,
          assigneeName: primarySup?.displayName || null,
          assignedSupervisorId: primarySup?.uid || null,
          assignedSupervisorIds: supervisorIds,
          assignedSupervisors: supervisorList.map((s) => ({
            id: s.uid,
            name: s.displayName,
            specialty: getSpecs(s)[0]
          })),
          detectedTypes: classification.allTypes,
          appointmentTime: null,
          appointmentNotes: null
        });
      }
      if (ticketsToCreate.length === 0) {
        res.json({ imported: 0, skipped: rawTickets.length, errors });
        return;
      }
      const created = await prisma.ticket.createMany({ data: ticketsToCreate, skipDuplicates: true });
      res.json({ imported: created.count, skipped: rawTickets.length - created.count, errors });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/classify/learn", requireAuth, async (req, res) => {
    try {
      const { description, correctTypeKey } = req.body;
      if (!description || !correctTypeKey) {
        res.status(400).json({ error: "description and correctTypeKey are required" });
        return;
      }
      const correctType = await prisma.ticketType.findUnique({ where: { key: correctTypeKey } });
      if (!correctType) {
        res.status(400).json({ error: "Type '" + correctTypeKey + "' not found" });
        return;
      }
      const stopWords = /* @__PURE__ */ new Set([
        "??",
        "??",
        "???",
        "???",
        "??",
        "??",
        "???",
        "???",
        "???",
        "???",
        "??",
        "??",
        "??",
        "??",
        "??",
        "??",
        "??",
        "??",
        "???",
        "???",
        "???",
        "???",
        "????",
        "??",
        "?",
        "??",
        "???",
        "???",
        "???",
        "???",
        "????",
        "??",
        "????",
        "????",
        "??????",
        "??????",
        "????",
        "????",
        "????",
        "????",
        "?????",
        "???",
        "???",
        "???",
        "????",
        "????",
        "???",
        "???",
        "????",
        "???",
        "???",
        "???",
        "???",
        "???",
        "???"
      ]);
      const words = description.toLowerCase().split(/[\s,?.]+/).filter((w) => w.length > 2 && !stopWords.has(w));
      let updated = 0;
      for (const word of [...new Set(words)]) {
        const existing = await prisma.ticketTypeKeyword.findUnique({
          where: { keyword_typeId: { keyword: word, typeId: correctType.id } }
        });
        if (existing) {
          await prisma.ticketTypeKeyword.update({
            where: { id: existing.id },
            data: { usageCount: existing.usageCount + 1, isLearned: true }
          });
        } else {
          const otherKeyword = await prisma.ticketTypeKeyword.findFirst({
            where: { keyword: word, typeId: { not: correctType.id } }
          });
          if (otherKeyword) {
            await prisma.ticketTypeKeyword.update({
              where: { id: otherKeyword.id },
              data: { confidence: Math.max(0.1, otherKeyword.confidence - 0.2) }
            });
          }
          await prisma.ticketTypeKeyword.create({
            data: {
              keyword: word,
              typeId: correctType.id,
              weight: 1,
              isLearned: true,
              source: "learned",
              confidence: 0.8,
              usageCount: 1
            }
          });
          updated++;
        }
      }
      _kwCache = [];
      _kwCacheTime = 0;
      res.json({ learned: updated, message: "Learned " + updated + " new keywords for " + correctType.nameAr });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/classify/manual-keyword", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { keyword, typeKey, weight } = req.body;
      if (!keyword || !typeKey) {
        res.status(400).json({ error: "keyword and typeKey are required" });
        return;
      }
      const type = await prisma.ticketType.findUnique({ where: { key: typeKey } });
      if (!type) {
        res.status(400).json({ error: "Type '" + typeKey + "' not found" });
        return;
      }
      const existing = await prisma.ticketTypeKeyword.findUnique({
        where: { keyword_typeId: { keyword: keyword.trim().toLowerCase(), typeId: type.id } }
      });
      if (existing) {
        await prisma.ticketTypeKeyword.update({
          where: { id: existing.id },
          data: { weight: weight ?? existing.weight, source: "manual" }
        });
      } else {
        await prisma.ticketTypeKeyword.create({
          data: {
            keyword: keyword.trim().toLowerCase(),
            typeId: type.id,
            weight: weight ?? 1,
            source: "manual",
            isLearned: false,
            confidence: 1
          }
        });
      }
      _kwCache = [];
      _kwCacheTime = 0;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/classify/auto-learn", requireAuth, requireAdmin, async (_req, res) => {
    try {
      runAutoLearnCycle().catch(console.error);
      res.json({ success: true, message: "Auto-learn cycle started in background" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/classify/analytics", requireAuth, async (_req, res) => {
    try {
      const [totalTickets, withDetectedTypes, typeDistribution, keywordsCount, geminiCalls] = await Promise.all([
        prisma.ticket.count(),
        prisma.ticket.count({ where: { detectedTypes: { isEmpty: false } } }),
        prisma.ticket.groupBy({ by: ["type"], _count: true, orderBy: { _count: { type: "desc" } }, take: 20 }),
        prisma.ticketTypeKeyword.count({ where: { source: { equals: "auto_learned" } } }),
        prisma.ticketTypeKeyword.count({ where: { isLearned: true, source: { not: { equals: "seed" } } } })
      ]);
      res.json({
        totalTickets,
        classifiedTickets: withDetectedTypes,
        classificationRate: totalTickets > 0 ? Math.round(withDetectedTypes / totalTickets * 100) : 0,
        typeDistribution: typeDistribution.map((t) => ({ type: t.type, count: t._count })),
        learnedKeywords: { total: keywordsCount, auto: geminiCalls },
        geminiEnabled: !!GEMINI_API_KEY
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/classify/types", requireAuth, async (_req, res) => {
    try {
      const types = await prisma.ticketType.findMany({
        where: { isActive: true },
        include: {
          specialty: { select: { key: true, nameAr: true } },
          subTypes: {
            where: { isActive: true },
            include: { specialty: { select: { key: true, nameAr: true } } },
            orderBy: { sortOrder: "asc" }
          },
          _count: { select: { keywords: true } }
        },
        orderBy: { sortOrder: "asc" }
      });
      res.json(types);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/classify/generate-types", requireAuth, requireAdmin, async (_req, res) => {
    try {
      if (!GEMINI_API_KEY) {
        res.status(400).json({ error: "Gemini API key not configured" });
        return;
      }
      const specialties = await prisma.specialty.findMany({
        where: { isActive: true }
      });
      const specialtiesList = specialties.map(
        (s) => `  - "${s.key}": ${s.nameAr}`
      ).join("\n");
      const existingTypes = await prisma.ticketType.findMany({
        select: { key: true, nameAr: true }
      });
      const existingKeys = new Set(existingTypes.map((t) => t.key));
      const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u0641\u064A \u062A\u0635\u0646\u064A\u0641 \u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u0629 (\u0628\u0639\u062F \u0627\u0644\u0628\u064A\u0639).
\u0623\u0631\u064A\u062F\u0643 \u062A\u0642\u062A\u0631\u062D \u0623\u0646\u0648\u0627\u0639 \u062A\u0630\u0627\u0643\u0631 \u062C\u062F\u064A\u062F\u0629 \u0648\u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0645\u0634\u0631\u0648\u0639 \u0635\u064A\u0627\u0646\u0629 \u0639\u0642\u0627\u0631\u0627\u062A \u0633\u0643\u0646\u064A\u0629 \u0648\u062A\u062C\u0627\u0631\u064A\u0629.

\u0627\u0644\u062A\u062E\u0635\u0635\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u062D\u0629:
${specialtiesList}

\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0629 \u062D\u0627\u0644\u064A\u0627\u064B (\u0644\u0627 \u062A\u0643\u0631\u0631\u0647\u0627):
${existingTypes.map((t) => `  - "${t.key}": ${t.nameAr}`).join("\n") || "  (\u0644\u0627 \u064A\u0648\u062C\u062F)"}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0645\u0646\u0643:
1. \u0627\u0642\u062A\u0631\u062D 5-8 \u0623\u0646\u0648\u0627\u0639 \u062A\u0630\u0627\u0643\u0631 \u062C\u062F\u064A\u062F\u0629 \u0644\u0645 \u064A\u062A\u0645 \u0630\u0643\u0631\u0647\u0627 \u0623\u0639\u0644\u0627\u0647
2. \u0643\u0644 \u0646\u0648\u0639 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0644\u0647: key \u0628\u0627\u0644\u0627\u0646\u062C\u0644\u064A\u0632\u064A\u0629 (\u062D\u0631\u0648\u0641 \u0635\u063A\u064A\u0631\u0629 \u0648 underscores)\u060C nameAr \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629\u060C \u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631\u060C \u0648\u0627\u0644\u062A\u062E\u0635\u0635 \u0627\u0644\u0645\u0646\u0627\u0633\u0628
3. \u062E\u0644\u064A \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0645\u062A\u0646\u0648\u0639\u0629 \u0648\u062A\u063A\u0637\u064A \u0645\u062C\u0627\u0644\u0627\u062A \u0635\u064A\u0627\u0646\u0629 \u0645\u062E\u062A\u0644\u0641\u0629 (\u0645\u062B\u0644: \u0648\u0627\u062C\u0647\u0627\u062A\u060C \u0645\u0635\u0627\u0639\u062F\u060C \u063A\u0627\u0632\u060C \u0623\u0645\u0646 \u0648\u0633\u0644\u0627\u0645\u0629\u060C \u062D\u0645\u0627\u0645\u0627\u062A \u0633\u0628\u0627\u062D\u0629\u060C \u0644\u0627\u0646\u062F\u0633\u0643\u064A\u0628\u060C \u0645\u0643\u0627\u0641\u062D\u0629 \u062D\u0631\u064A\u0642\u060C \u0633\u062A\u064A\u0644\u060C \u0632\u062C\u0627\u062C\u060C \u0627\u0644\u0648\u0627\u062D \u0634\u0645\u0633\u064A\u0629\u060C ...)
4. \u0627\u062E\u062A\u0631 \u0627\u0644\u062A\u062E\u0635\u0635 (specialtyKey) \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0639\u0644\u0627\u0647
5. \u0627\u0642\u062A\u0631\u062D 2-3 \u0643\u0644\u0645\u0627\u062A \u0645\u0641\u062A\u0627\u062D\u064A\u0629 \u0644\u0643\u0644 \u0646\u0648\u0639 \u062C\u062F\u064A\u062F \u0639\u0634\u0627\u0646 \u0646\u0636\u064A\u0641\u0647\u0627 \u0645\u0639\u0627\u0647

\u0623\u0631\u062C\u0650\u0639 ONLY JSON array \u0628\u0627\u0644\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u062A\u0627\u0644\u064A (\u0645\u0645\u0646\u0648\u0639 markdown):
[
  {
    "key": "facades",
    "nameAr": "\u0648\u0627\u062C\u0647\u0627\u062A",
    "description": "\u0635\u064A\u0627\u0646\u0629 \u0648\u0625\u0635\u0644\u0627\u062D \u0648\u0627\u062C\u0647\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0646\u064A \u0648\u0627\u0644\u0643\u0633\u0648\u0629 \u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629",
    "specialtyKey": "general",
    "keywords": ["\u0648\u0627\u062C\u0647\u0629", "\u062D\u062C\u0631", "\u0627\u0644\u0648\u0645\u0646\u064A\u0648\u0645", "\u0643\u0644\u0627\u062F\u064A\u0646\u062C"]
  }
]`;
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
      const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      });
      if (!response.ok) {
        res.status(500).json({ error: `Gemini API error: ${response.status}` });
        return;
      }
      const data = await response.json();
      let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let suggestedTypes;
      try {
        let clean = rawText.trim();
        if (clean.includes("```")) {
          const lines = clean.split("\n").filter((l) => !l.trim().startsWith("```"));
          clean = lines.join("\n").trim();
        }
        const firstBracket = clean.indexOf("[");
        const lastBracket = clean.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          clean = clean.substring(firstBracket, lastBracket + 1);
        }
        suggestedTypes = JSON.parse(clean);
      } catch {
        res.status(500).json({ error: "Failed to parse Gemini response", raw: rawText.slice(0, 500) });
        return;
      }
      if (!Array.isArray(suggestedTypes) || suggestedTypes.length === 0) {
        res.json({ message: "No new types suggested", types: [] });
        return;
      }
      const addedTypes = [];
      const errors = [];
      const validSpecialtyKeys = new Set(specialties.map((s) => s.key));
      const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
      let nextOrder = (maxOrder._max.sortOrder || 0) + 1;
      for (const suggestion of suggestedTypes) {
        const key = (suggestion.key || "").trim().toLowerCase();
        const nameAr = (suggestion.nameAr || "").trim();
        const specialtyKey = (suggestion.specialtyKey || "").trim().toLowerCase();
        const keywords = Array.isArray(suggestion.keywords) ? suggestion.keywords.filter((k) => typeof k === "string" && k.trim().length > 0).map((k) => k.trim().toLowerCase()) : [];
        if (!key || !nameAr) {
          errors.push(`Invalid entry: missing key or nameAr (${JSON.stringify(suggestion)})`);
          continue;
        }
        if (existingKeys.has(key)) {
          errors.push(`Type "${key}" already exists`);
          continue;
        }
        if (!validSpecialtyKeys.has(specialtyKey)) {
          errors.push(`Type "${key}": specialty "${specialtyKey}" not found`);
          continue;
        }
        try {
          const newType = await prisma.ticketType.create({
            data: {
              key,
              nameAr,
              nameEn: key,
              description: (suggestion.description || "").trim().slice(0, 500),
              specialtyKey,
              sortOrder: nextOrder++,
              isActive: true,
              color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
              icon: "\u{1F4CB}"
            }
          });
          let addedKeywords = 0;
          for (const kw of keywords) {
            if (kw.length < 2) continue;
            try {
              await prisma.ticketTypeKeyword.create({
                data: {
                  keyword: kw,
                  typeId: newType.id,
                  weight: 1.5,
                  source: "gemini_generated",
                  isLearned: false,
                  confidence: 0.9,
                  usageCount: 0
                }
              });
              addedKeywords++;
            } catch {
            }
          }
          addedTypes.push({
            key: newType.key,
            nameAr: newType.nameAr,
            specialtyKey: newType.specialtyKey,
            keywordsAdded: addedKeywords
          });
          existingKeys.add(key);
        } catch (err) {
          errors.push(`Failed to create "${key}": ${err.message}`);
        }
      }
      _refCacheTime = 0;
      _kwCache = [];
      _kwCacheTime = 0;
      res.json({
        message: `Added ${addedTypes.length} new types`,
        types: addedTypes,
        errors: errors.length > 0 ? errors : void 0
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/classify/generate-subtypes", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { typeKey } = req.body;
      if (!typeKey) {
        res.status(400).json({ error: "typeKey is required" });
        return;
      }
      const parentType = await prisma.ticketType.findUnique({
        where: { key: typeKey },
        include: { specialty: true }
      });
      if (!parentType) {
        res.status(404).json({ error: `Type "${typeKey}" not found` });
        return;
      }
      const existingSubs = await prisma.ticketSubType.findMany({
        where: { parentTypeId: parentType.id, isActive: true },
        select: { nameAr: true }
      });
      const existingSubNames = new Set(existingSubs.map((s) => s.nameAr));
      const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u0641\u064A \u0627\u0644\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u0629.
\u0627\u0644\u0646\u0648\u0639 \u0627\u0644\u0631\u0626\u064A\u0633\u064A: "${parentType.nameAr}" (${parentType.key})
\u0627\u0644\u062A\u062E\u0635\u0635: ${parentType.specialty?.nameAr || "\u0639\u0627\u0645"}

\u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0641\u0631\u0639\u064A\u0629 \u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0629 \u062D\u0627\u0644\u064A\u0627\u064B (\u0644\u0627 \u062A\u0643\u0631\u0631\u0647\u0627):
${existingSubs.map((s) => `  - ${s.nameAr}`).join("\n") || "  (\u0644\u0627 \u064A\u0648\u062C\u062F)"}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628: \u0627\u0642\u062A\u0631\u062D 5-8 \u0623\u0646\u0648\u0627\u0639 \u0641\u0631\u0639\u064A\u0629 \u062C\u062F\u064A\u062F\u0629 \u0648\u0648\u0627\u0642\u0639\u064A\u0629 \u062A\u062D\u062A \u0647\u0630\u0627 \u0627\u0644\u0646\u0648\u0639.
\u0643\u0644 \u0646\u0648\u0639 \u0641\u0631\u0639\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0644\u0647 \u0627\u0633\u0645 (nameAr) \u0648\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631.
\u0631\u0643\u0632 \u0639\u0644\u0649 \u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0634\u0627\u0626\u0639\u0629.

\u0623\u0631\u062C\u0650\u0639 ONLY JSON array:
[
  { "nameAr": "\u062A\u0633\u0631\u064A\u0628\u0627\u062A \u0645\u064A\u0627\u0647 \u0645\u0646 \u0627\u0644\u0645\u0648\u0627\u0633\u064A\u0631", "description": "\u0625\u0635\u0644\u0627\u062D \u062A\u0633\u0631\u064A\u0628\u0627\u062A \u0627\u0644\u0645\u064A\u0627\u0647 \u0641\u064A \u0627\u0644\u0645\u0648\u0627\u0633\u064A\u0631 \u0627\u0644\u062F\u0627\u062E\u0644\u064A\u0629 \u0648\u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629" }
]`;
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
      const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      });
      if (!response.ok) {
        res.status(500).json({ error: `Gemini API error: ${response.status}` });
        return;
      }
      const data = await response.json();
      let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let suggestedSubs;
      try {
        let clean = rawText.trim();
        if (clean.includes("```")) {
          const lines = clean.split("\n").filter((l) => !l.trim().startsWith("```"));
          clean = lines.join("\n").trim();
        }
        const firstBracket = clean.indexOf("[");
        const lastBracket = clean.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          clean = clean.substring(firstBracket, lastBracket + 1);
        }
        suggestedSubs = JSON.parse(clean);
      } catch {
        res.status(500).json({ error: "Failed to parse Gemini response", raw: rawText.slice(0, 500) });
        return;
      }
      const maxOrder = await prisma.ticketSubType.aggregate({
        where: { parentTypeId: parentType.id },
        _max: { sortOrder: true }
      });
      let nextOrder = (maxOrder._max.sortOrder || 0) + 1;
      const added = [];
      for (const sub of suggestedSubs) {
        const nameAr = (sub.nameAr || "").trim();
        if (!nameAr || existingSubNames.has(nameAr)) continue;
        try {
          await prisma.ticketSubType.create({
            data: {
              parentTypeId: parentType.id,
              nameAr,
              description: (sub.description || "").trim().slice(0, 500),
              sortOrder: nextOrder++,
              isActive: true
            }
          });
          added.push({ nameAr });
          existingSubNames.add(nameAr);
        } catch {
        }
      }
      _refCacheTime = 0;
      res.json({
        message: `Added ${added.length} new sub-types for "${parentType.nameAr}"`,
        subTypes: added
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  async function runAutoLearnCycle() {
    try {
      console.log("\u{1F504} Auto-learn cycle started...");
      const ticketsToLearn = await prisma.ticket.findMany({
        where: {
          OR: [
            { detectedTypes: { equals: [] } },
            { type: { in: ["general", "plumbing"] }, detectedTypes: { isEmpty: false } }
          ]
        },
        take: 30,
        orderBy: { createdAt: "desc" },
        select: { id: true, description: true, type: true }
      });
      if (ticketsToLearn.length === 0) {
        console.log("  \u2705 No tickets to auto-learn");
        return;
      }
      let learned = 0;
      for (const ticket of ticketsToLearn) {
        if (!ticket.description || ticket.description.length < 5) continue;
        const classification = await classifyTicket(ticket.description);
        if (classification.source === "gemini" && classification.confidence >= 7) {
          await autoLearnFromClassification(ticket.description, classification.primaryType, classification.confidence);
          if (ticket.type === "general" || !ticket.type) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { type: classification.primaryType, detectedTypes: classification.allTypes }
            });
          }
          learned++;
        }
      }
      console.log(`  \u2705 Auto-learn cycle: ${learned}/${ticketsToLearn.length} tickets processed`);
      _refCacheTime = 0;
      _kwCache = [];
      _kwCacheTime = 0;
    } catch (err) {
      console.error("  \u274C Auto-learn cycle error:", err);
    }
  }
  setTimeout(() => runAutoLearnCycle(), 3e4);
  setInterval(() => runAutoLearnCycle(), 6 * 60 * 60 * 1e3);
  async function autoGenerateTypes() {
    if (!GEMINI_API_KEY) return;
    try {
      const count = await prisma.ticketType.count({ where: { isActive: true } });
      if (count >= 8) {
        console.log(`  \u2139\uFE0F Already have ${count} types, skipping auto-generate`);
        return;
      }
      console.log("  \u{1F916} Auto-generating ticket types from Gemini...");
      const specialties = await prisma.specialty.findMany({
        where: { isActive: true }
      });
      const specialtiesList = specialties.map((s) => `  - "${s.key}": ${s.nameAr}`).join("\n");
      const existingTypes = await prisma.ticketType.findMany({
        select: { key: true, nameAr: true }
      });
      const existingKeys = new Set(existingTypes.map((t) => t.key));
      const prompt = `\u0623\u0642\u062A\u0631\u062D 6-10 \u0623\u0646\u0648\u0627\u0639 \u062A\u0630\u0627\u0643\u0631 \u0635\u064A\u0627\u0646\u0629 \u0639\u0642\u0627\u0631\u064A\u0629 \u0634\u0627\u0645\u0644\u0629 (\u0628\u0639\u062F \u0627\u0644\u0628\u064A\u0639).
\u0627\u0644\u062A\u062E\u0635\u0635\u0627\u062A: ${specialtiesList}
\u0644\u0627 \u062A\u0643\u0631\u0631: ${existingTypes.map((t) => t.key).join(", ") || "\u0644\u0627 \u064A\u0648\u062C\u062F"}
\u0643\u0644 \u0646\u0648\u0639: key \u0625\u0646\u062C\u0644\u064A\u0632\u064A, nameAr \u0639\u0631\u0628\u064A, \u0648\u0635\u0641, specialtyKey \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629, keywords (2-3 \u0643\u0644\u0645\u0627\u062A).
\u0631\u062F: JSON array \u0641\u0642\u0637.`;
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
      const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      });
      if (!response.ok) return;
      const data = await response.json();
      let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let suggestions;
      try {
        let clean = rawText.trim();
        if (clean.includes("```")) clean = clean.split("\n").filter((l) => !l.trim().startsWith("```")).join("\n").trim();
        const fb = clean.indexOf("["), lb = clean.lastIndexOf("]");
        if (fb !== -1 && lb !== -1) clean = clean.substring(fb, lb + 1);
        suggestions = JSON.parse(clean);
      } catch {
        return;
      }
      if (!Array.isArray(suggestions) || suggestions.length === 0) return;
      const validSpecialtyKeys = new Set(specialties.map((s) => s.key));
      const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
      let nextOrder = (maxOrder._max.sortOrder || 0) + 1;
      let added = 0;
      for (const s of suggestions) {
        const key = (s.key || "").trim().toLowerCase();
        const nameAr = (s.nameAr || "").trim();
        const specialtyKey = (s.specialtyKey || "").trim().toLowerCase();
        const keywords = Array.isArray(s.keywords) ? s.keywords.filter((k) => typeof k === "string").map((k) => k.trim().toLowerCase()) : [];
        if (!key || !nameAr || existingKeys.has(key) || !validSpecialtyKeys.has(specialtyKey)) continue;
        try {
          const newType = await prisma.ticketType.create({
            data: {
              key,
              nameAr,
              nameEn: key,
              description: (s.description || "").trim().slice(0, 500),
              specialtyKey,
              sortOrder: nextOrder++,
              isActive: true,
              color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
              icon: "\u{1F4CB}"
            }
          });
          for (const kw of keywords) {
            if (kw.length < 2) continue;
            await prisma.ticketTypeKeyword.upsert({
              where: { keyword_typeId: { keyword: kw, typeId: newType.id } },
              update: {},
              create: { keyword: kw, typeId: newType.id, weight: 1.5, source: "auto_generated", isLearned: false, confidence: 0.9 }
            });
          }
          existingKeys.add(key);
          added++;
        } catch {
        }
      }
      if (added > 0) {
        console.log(`  \u2705 Auto-generated ${added} new ticket types`);
        _refCacheTime = 0;
        _kwCache = [];
        _kwCacheTime = 0;
      }
    } catch (err) {
      console.warn("  \u26A0\uFE0F Auto-generate types failed:", err);
    }
  }
  setTimeout(() => autoGenerateTypes(), 1e4);
  setInterval(() => autoGenerateTypes(), 24 * 60 * 60 * 1e3);
  io.on("connection", (socket) => {
    socket.on("ticket:assign", (data) => {
      io.emit("notification:assignment", data);
    });
  });
  if (true) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Error starting server:", err);
});
