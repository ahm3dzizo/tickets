import { Router } from "express";
import { spawn } from "child_process";
import { readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";
import { __dirname } from "../config.js";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

// POST /api/generate-report
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const body = { ...req.body };
  // Legacy report previews/downloads cannot send a customer closing report.
  if (body.whatsappPhone) {res.status(409).json({error: 'USE_CLOSURE_ENDPOINT'}); return;}

  // If nhc is empty, try to resolve project abbreviation from the first ticket's project
  if (!body.nhc && body.ticket_num) {
    try {
      const firstTicketId = body.ticket_num.split("،")[0]?.trim() || body.ticket_num;
      const ticket = await prisma.ticket.findFirst({
        where: { ticketId: firstTicketId },
        select: {
          projectId: true,
          unit: {
            select: { handoverDate: true, warrantyExpiryDate: true }
          }
        },
      });
      if (ticket?.projectId) {
        const project = await prisma.project.findUnique({
          where: { id: ticket.projectId },
          select: { abbreviation: true },
        });
        if (project?.abbreviation) body.nhc = project.abbreviation;
      }

      if (ticket?.unit) {
        body.handover_date = ticket.unit.handoverDate || "";
        body.warranty_expiry_date = ticket.unit.warrantyExpiryDate || "";
      }
    } catch {
      // Silent fallback
    }
  }

  // Extract WhatsApp fields from body (not forwarded to Python)
  delete body.whatsappPhone;
  // Never trust a browser-generated closing caption. The server owns the
  // WhatsApp closing template and rebuilds it from report data below.
  delete body.whatsappMessage;

  const scriptPath = path.join(__dirname, "report_generator.py");
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const python = spawn(pythonBin, [scriptPath, "--stdin"], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });

  let output = "";
  let errorOutput = "";

  python.stdin.write(JSON.stringify(body));
  python.stdin.end();

  python.stdout.on("data", (data) => { output += data.toString(); });
  python.stderr.on("data", (data) => { errorOutput += data.toString(); });

  python.on("close", async (code) => {
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

      // Send the image back to the browser
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `attachment; filename="report.jpg"`);
      res.send(jpgData);

      try { unlinkSync(jpgPath); } catch { /* ignore */ }
    } catch {
      res.status(500).json({ error: "Failed to read report file" });
    }
  });
});

export default router;
