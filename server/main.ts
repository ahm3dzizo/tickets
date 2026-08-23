import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import ticketTypesAdminRoutes from "./routes/ticket-types-admin.ts";
import { PORT, __dirname } from "./config.js";
import prisma from "./db.js";
import { setupSocket } from "./socket.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import projectRoutes from "./routes/projects.js";
import clientRoutes from "./routes/clients.js";
import ticketRoutes from "./routes/tickets.js";
import technicianRoutes from "./routes/technicians.js";
import classifyRoutes from "./routes/classify.js";
import reportRoutes from "./routes/report.js";
import reportsStatsRoutes from "./routes/reports.js";
import auditRoutes from "./routes/audit.js";
import dashboardRoutes from "./routes/dashboard.js";
import whatsappRoutes from "./routes/whatsapp.js";
import whatsappBotRoutes from "./routes/whatsapp-bot.js";
import settingsRoutes from "./routes/settings.js";
import appointmentRoutes from "./routes/appointments.js";
import ocrRoutes from "./routes/ocr.js";
import importExcelRoutes from "./routes/import-excel.js";
import contractorRoutes from "./routes/contractors.js";
import warrantiesRoutes from "./routes/warranties.js";
import techAuthRoutes from "./routes/tech-auth.js";
import attendanceRoutes from "./routes/attendance.js";
import translationRoutes from "./routes/translation.js";
import pushRoutes from "./routes/push.js";
import notificationRoutes from "./routes/notifications.js";
import { initAllSessions } from "./baileys.js";
import { requireAuth } from "./auth.js";
import { startCronJobs } from "./cronJobs.js";
import { startGeminiWorker } from "./classifier/gemini-worker.js";
import { startReclassifyWorker, stopReclassifyWorker } from "./classifier/reclassify-worker.js";
import { startTrainWorker, stopTrainWorker } from "./classifier/train-worker.js";
import { seedSubTypes } from "./classifier/seed-subtypes.js";

let globalIo: any = null;

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  globalIo = setupSocket(httpServer);
  
  // Make io accessible to routes
  (global as any).__io = globalIo;

  // ── Security Middlewares ───────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  }));

  const corsOptions = {
    origin: process.env.NODE_ENV === "production" 
      ? (process.env.FRONTEND_URL || false) 
      : "*",
  };
  app.use(cors(corsOptions));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per `window`
    message: { error: "تم تجاوز الحد المسموح به من الطلبات، يرجى المحاولة لاحقاً." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", globalLimiter);
  app.use(express.json({ limit: "10mb" }));

  // ── Health ─────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // ── API Routes ─────────────────────────────────────────────────────────
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/clients", clientRoutes);
  app.use("/api/tickets", ticketRoutes);
  app.use("/api/technicians", technicianRoutes);
  app.use("/api/tech", techAuthRoutes);
  app.use("/api", attendanceRoutes);
  app.use("/api", translationRoutes);
  app.use("/api/classify", classifyRoutes);
  app.use("/api/generate-report", reportRoutes);
  app.use("/api/reports", reportsStatsRoutes);
  app.use("/api/audit",     auditRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/admin/ticket-types", ticketTypesAdminRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/whatsapp-bot", whatsappBotRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/ocr", ocrRoutes);
  app.use("/api/import-excel", importExcelRoutes);
  app.use("/api/contractors", contractorRoutes);
  app.use("/api/warranties", warrantiesRoutes);
  app.use("/api/push", pushRoutes);
  app.use("/api/notifications", notificationRoutes);

  // ── Legacy client routes under projects (for backward compat) ──────────
  app.get("/api/projects/:projectId/clients", requireAuth, async (req, res) => {
    try {
      const clients = await prisma.client.findMany({
        where: { units: { some: { unit: { projectId: req.params.projectId } } } },
        orderBy: { name: "asc" },
        include: { units: { include: { unit: { include: { block: true } } } } }
      });
      // Flatten back to old structure if needed for legacy apps
      const mapped = clients.map(c => {
        const primaryUnit = c.units[0]?.unit;
        return {
          id: c.id,
          projectId: primaryUnit?.projectId || req.params.projectId,
          name: c.name,
          phone: c.phone,
          unitNumber: primaryUnit?.unitNumber || '',
          blockNumber: primaryUnit?.block?.blockNumber || '',
          handoverDate: primaryUnit?.handoverDate || null,
          warrantyExpiryDate: primaryUnit?.warrantyExpiryDate || null,
          createdAt: c.createdAt
        };
      });
      res.json(mapped);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/projects/:projectId/clients", requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const projectId = req.params.projectId;
      
      const phone = data.phone?.trim() || `unknown-${Date.now()}`;
      
      const unit = await prisma.unit.upsert({
        where: { projectId_unitNumber: { projectId, unitNumber: data.unitNumber || '0' } },
        create: { projectId, unitNumber: data.unitNumber || '0', handoverDate: data.handoverDate, warrantyExpiryDate: data.warrantyExpiryDate },
        update: { handoverDate: data.handoverDate, warrantyExpiryDate: data.warrantyExpiryDate }
      });

      const client = await prisma.client.upsert({
        where: { phone },
        create: { name: data.name, phone },
        update: { name: data.name }
      });

      await prisma.clientUnit.upsert({
        where: { clientId_unitId: { clientId: client.id, unitId: unit.id } },
        create: { clientId: client.id, unitId: unit.id, isPrimary: true },
        update: {}
      });

      res.status(201).json({ ...client, projectId, unitNumber: unit.unitNumber });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Static / Vite ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
// User uploaded files
const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "users"), { recursive: true });

app.use("/uploads", express.static(uploadsDir));

app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ── Generic Error Handler ──────────────────────────────────────────────
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "حدث خطأ داخلي في الخادم" : err.message });
  });

  // ── Background Jobs ────────────────────────────────────────────────────
  startGeminiWorker();        // classifies open unclassified tickets via Gemini (4/min)
  startReclassifyWorker();    // reclassifies tickets when keywords are learned (every 30s)
  startTrainWorker();         // retrains ML model daily at 03:00

  // Ensure critical sub-types exist (e.g. روائح كريهة under drainage)
  seedSubTypes().catch((e) => console.error('⚠️  Sub-type seed failed:', e.message));

  startCronJobs();             // push notification scheduled jobs

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    initAllSessions();
  });
}

export { prisma };
export { globalIo as getIO };

startServer().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});

import { closeAllSessions } from './baileys.js';
import { stopGeminiWorker } from './classifier/gemini-worker.js';

async function shutdown() {
  console.log('Shutting down gracefully...');
  stopGeminiWorker();
  stopReclassifyWorker();
  stopTrainWorker();
  await closeAllSessions();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
