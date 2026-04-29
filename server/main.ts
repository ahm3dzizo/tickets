import express from "express";
import { createServer } from "http";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";

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
import { runAutoLearnCycle, autoGenerateTypes } from "./classifier/gemini.js";
import { requireAuth } from "./auth.js";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = setupSocket(httpServer);
  
  // Make io accessible to routes
  (global as any).__io = io;

  app.use(cors());
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

  // ── Background Jobs ────────────────────────────────────────────────────
  // Auto-learn after 30 seconds
  setTimeout(() => runAutoLearnCycle(), 30_000);
  setInterval(() => runAutoLearnCycle(), 6 * 60 * 60 * 1000);

  // Auto-generate types after 10 seconds
  setTimeout(() => autoGenerateTypes(), 10_000);
  setInterval(() => autoGenerateTypes(), 24 * 60 * 60 * 1000);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export { prisma };
export { io as getIO };

startServer().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});
