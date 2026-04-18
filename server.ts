import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import { spawn } from "child_process";
import { readFileSync, existsSync, unlinkSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Mock database
  let tickets = [
    { id: '1', title: 'AC Unit Leak', status: 'open', priority: 'urgent' },
    { id: '2', title: 'Broken Light', status: 'in-progress', priority: 'medium' },
  ];

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/tickets", (req, res) => {
    res.json(tickets);
  });

  app.post("/api/tickets", (req, res) => {
    const newTicket = { id: String(tickets.length + 1), ...req.body };
    tickets.push(newTicket);
    io.emit("ticket:created", newTicket);
    res.status(201).json(newTicket);
  });

  // Generate close-ticket report via Python (ReportLab + Arabic)
  app.post("/api/generate-report", (req, res) => {
    const scriptPath = path.join(__dirname, "report_generator.py");
    const python = spawn("python", [scriptPath, "--stdin"], {
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
      } catch (err) {
        res.status(500).json({ error: "Failed to read report file" });
      }
    });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);
    
    socket.on("ticket:assign", (data) => {
      // Broadcast to specific user or all
      io.emit("notification:assignment", data);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
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
