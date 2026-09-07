import { NextFunction, Response } from "express";
import prisma from "../db.js";
import { AuthRequest, getRequesterRole } from "../auth.js";

type TicketAccessRecord = {
  id: string;
  projectId: string | null;
};

export async function getAuthorizedTicket(
  uid: string,
  ticketId: string,
): Promise<TicketAccessRecord | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, projectId: true },
  });

  if (!ticket) return null;

  const role = await getRequesterRole(uid);
  if (role === "admin") return ticket;
  if (!ticket.projectId) return null;

  const membership = await prisma.project.findFirst({
    where: {
      id: ticket.projectId,
      users: { some: { uid } },
    },
    select: { id: true },
  });

  return membership ? ticket : null;
}

export async function requireTicketMutationAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.uid) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const ticket = await getAuthorizedTicket(req.uid, req.params.id);
    if (!ticket) {
      // Do not reveal whether a ticket exists outside the caller's project scope.
      res.status(404).json({ error: "TICKET_NOT_FOUND" });
      return;
    }

    if (req.body?.assignedSupervisorIds !== undefined) {
      if (!Array.isArray(req.body.assignedSupervisorIds)) {
        res.status(400).json({ error: "INVALID_SUPERVISOR_IDS" });
        return;
      }

      const rawIds: unknown[] = req.body.assignedSupervisorIds;
      const normalizedIds: string[] = [];
      for (const value of rawIds) {
        if (typeof value !== "string") {
          res.status(400).json({ error: "INVALID_SUPERVISOR_IDS" });
          return;
        }
        const normalized = value.trim();
        if (!normalized) {
          res.status(400).json({ error: "INVALID_SUPERVISOR_IDS" });
          return;
        }
        normalizedIds.push(normalized);
      }

      const ids: string[] = [...new Set<string>(normalizedIds)];
      if (ids.length !== rawIds.length) {
        res.status(400).json({ error: "INVALID_SUPERVISOR_IDS" });
        return;
      }

      if (ids.length > 0) {
        if (!ticket.projectId) {
          res.status(400).json({ error: "TICKET_PROJECT_REQUIRED" });
          return;
        }

        const validSupervisors = await prisma.user.findMany({
          where: {
            uid: { in: ids },
            role: "supervisor",
            disabled: false,
            projects: { some: { id: ticket.projectId } },
          },
          select: { uid: true },
        });

        if (validSupervisors.length !== ids.length) {
          res.status(400).json({ error: "SUPERVISOR_PROJECT_MISMATCH" });
          return;
        }
      }

      req.body.assignedSupervisorIds = ids;
    }

    next();
  } catch (error) {
    next(error);
  }
}
