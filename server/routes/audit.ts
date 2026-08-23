import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// GET /api/audit/ticket/:id — last 50 changes for a ticket
router.get("/ticket/:id", requireAuth, async (req, res) => {
  try {
    const audits = await prisma.ticketAudit.findMany({
      where: { ticketId: req.params.id },
      orderBy: { changedAt: "desc" },
      take: 50,
    });

    // enrich with user display names
    const uids = [...new Set(audits.map(a => a.changedBy))] as string[];
    const users = uids.length
      ? await prisma.user.findMany({ where: { uid: { in: uids } }, select: { uid: true, displayName: true } })
      : [];
    const nameMap = Object.fromEntries(users.map(u => [u.uid, u.displayName]));

    res.json(audits.map(a => ({ ...a, changedByName: nameMap[a.changedBy] ?? a.changedBy })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
