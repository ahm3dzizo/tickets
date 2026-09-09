import type { NextFunction, Response } from 'express';
import { requireTechAuth, type TechAuthRequest } from '../routes/tech-auth.js';

/**
 * Route-local auth wrapper for endpoints that are already authenticated by a
 * main.ts preflight. If no trusted preflight populated technicianId, fall back to
 * the complete technician auth/guard middleware so the router remains safe when
 * mounted independently.
 *
 * Do not use this for ticket-detail reads: those intentionally need the full
 * appointment-access guard on a cache miss.
 */
export function requireTechAuthOnce(
  req: TechAuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.technicianId) {
    next();
    return;
  }
  void requireTechAuth(req, res, next);
}
