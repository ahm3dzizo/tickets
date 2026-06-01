import { Router } from "express";
import { spawn } from "child_process";
import { readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";
import { __dirname } from "../config.js";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";
import { sendWAImage, sendApprovalRequest } from "../baileys.js";

const router = Router();

// POST /api/generate-report
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const body = { ...req.body };

  // If nhc is empty, try to resolve project abbreviation from the first ticket's project
  if (!body.nhc && body.ticket_num) {
    try {
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
        const project = await prisma.project.findUnique({
          where: { id: ticket.projectId },
          select: { abbreviation: true },
        });
        if (project?.abbreviation) body.nhc = project.abbreviation;
      }
    } catch {
      // Silent fallback
    }
  }

  // Extract WhatsApp fields from body (not forwarded to Python)
  const whatsappPhone: string | undefined = body.whatsappPhone;
  const whatsappMessage: string | undefined = body.whatsappMessage;
  const senderUid = req.uid;
  delete body.whatsappPhone;
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

      // Send the image back to the browser
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `attachment; filename="report.jpg"`);
      res.send(jpgData);

      // Fire-and-forget: send report image + approval request via WhatsApp
      if (whatsappPhone && senderUid) {
        const uid = senderUid;
        const phone = whatsappPhone;
        const customerName: string = body.customer_name || '';
        const villa: string        = body.villa || '';
        const notes: string        = body.notes || '';
        const ticketNum: string    = (body.ticket_num || '').split('،')[0].trim();

        sendWAImage(uid, phone, jpgData, whatsappMessage || '📊 تقرير الصيانة — فريق ريتال')
          .then((r: any) => {
            console.log('[WA] report image sent:', r);
          })
          .catch((err: any) => console.error('[WA] report image error:', err));
      }

      try { unlinkSync(jpgPath); } catch { /* ignore */ }
    } catch {
      res.status(500).json({ error: "Failed to read report file" });
    }
  });
});

export default router;
