import { Router } from "express";
import { spawn } from "child_process";
import { readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";
import { __dirname } from "../config.js";
import prisma from "../db.js";

const router = Router();

// POST /api/generate-report
router.post("/", async (req, res) => {
  const body = { ...req.body };

  // If nhc is empty, try to resolve project abbreviation from the first ticket's project
  if (!body.nhc && body.ticket_num) {
    try {
      // ticket_num could be comma-separated, take first
      const firstTicketId = body.ticket_num.split("،")[0]?.trim() || body.ticket_num;
      const ticket = await prisma.ticket.findFirst({
        where: {
          OR: [
            { ticketId: firstTicketId },
            { refNumber: firstTicketId },
          ],
        },
        select: { projectAbbr: true, projectId: true },
      });
      if (ticket?.projectAbbr) {
        body.nhc = ticket.projectAbbr;
      } else if (ticket?.projectId) {
        // Fallback: get abbreviation from project table
        const project = await prisma.project.findUnique({
          where: { id: ticket.projectId },
          select: { abbreviation: true },
        });
        if (project?.abbreviation) {
          body.nhc = project.abbreviation;
        }
      }
    } catch (err) {
      // Silent fallback — leave nhc empty
    }
  }

  const scriptPath = path.join(__dirname, "report_generator.py");
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const python = spawn(pythonBin, [scriptPath, "--stdin"], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });

  let output = "";
  let errorOutput = "";

  python.stdin.write(JSON.stringify(body));
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
      try { unlinkSync(jpgPath); } catch {}
    } catch {
      res.status(500).json({ error: "Failed to read report file" });
    }
  });
});

export default router;
