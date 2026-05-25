import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cors from "cors";
import path from "path";
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
import whatsappRoutes from "./routes/whatsapp.js";
import settingsRoutes from "./routes/settings.js";
import { initAllSessions } from "./baileys.js";
import { requireAuth } from "./auth.js";

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
  app.use("/api/classify", classifyRoutes);
  app.use("/api/generate-report", reportRoutes);
  app.use("/api/admin/ticket-types", ticketTypesAdminRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/settings", settingsRoutes);

  // ── Legacy client routes under projects (for backward compat) ──────────
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

  // ── Static / Vite ──────────────────────────────────────────────────────
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

  // ── Generic Error Handler ──────────────────────────────────────────────
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "حدث خطأ داخلي في الخادم" : err.message });
  });

  // ── Background Jobs ────────────────────────────────────────────────────
  // Removed Gemini auto-learn jobs

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
