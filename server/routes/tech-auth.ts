import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { APP_JWT_SECRET } from '../config.js';
import { requireAuth, assertPhoneNumberUnique, normalizePhoneNumber } from '../auth.js';
import { sendWAText, getWAStatus } from '../baileys.js';
import { BOT_USER_ID } from '../whatsappBot.js';

const router = Router();

const TECH_LOGIN_LIMITER = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// These states mean the technician has not recorded a disposition for the
// current visit yet. waiting/contractor are valid visit outcomes: they keep the
// ticket open operationally, but do not prevent the technician from closing the visit.
const UNRESOLVED_VISIT_TICKET_STATUSES = [
  'open',
  'pending',
  'in_progress',
  'note',
] as const;

export interface TechAuthRequest extends Request {
  technicianId?: string;
}

type TechGuardProfile = {
  id: string;
  isActive: boolean;
  profileCompleted: boolean;
  projectId: string | null;
  supervisorId: string | null;
};

function requestPath(req: Request): string {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  return path.startsWith('/api') ? path.slice(4) || '/' : path;
}

function publicTechProfile(tech: any) {
  if (!tech) return tech;
  const {
    passwordHash: _passwordHash,
    idNumber: _idNumber,
    idPhotoUrl: _idPhotoUrl,
    documentUrls: _documentUrls,
    supervisor,
    ...safe
  } = tech;

  return {
    ...safe,
    supervisor: supervisor
      ? { id: supervisor.uid, name: supervisor.displayName }
      : undefined,
  };
}

function appointmentAccessibleToTech(appointment: any, tech: TechGuardProfile): boolean {
  if (!appointment || !tech.projectId || appointment.projectId !== tech.projectId) return false;

  const technicianIds = Array.isArray(appointment.technicianIds) ? appointment.technicianIds : [];
  const hasSpecificTechnician = Boolean(appointment.technicianId) || technicianIds.length > 0;
  const directlyAssigned = appointment.technicianId === tech.id || technicianIds.includes(tech.id);
  const supervisorPool =
    !hasSpecificTechnician &&
    Boolean(tech.supervisorId) &&
    Array.isArray(appointment.supervisorIds) &&
    appointment.supervisorIds.includes(tech.supervisorId);
  const ownsExistingSession = appointment.workSession?.technicianId === tech.id;

  return directlyAssigned || supervisorPool || ownsExistingSession;
}

async function hasActiveShift(technicianId: string): Promise<boolean> {
  const shift = await prisma.shiftLog.findFirst({
    where: { technicianId, status: 'ACTIVE' },
    select: { id: true },
    orderBy: { clockInAt: 'desc' },
  });
  return Boolean(shift);
}

async function requireActiveShiftForAction(
  technicianId: string,
  res: Response,
): Promise<boolean> {
  if (await hasActiveShift(technicianId)) return true;
  res.status(409).json({
    code: 'ACTIVE_SHIFT_REQUIRED',
    error: 'يجب تسجيل الحضور وإنهاء الاستراحة قبل تنفيذ هذا الإجراء.',
  });
  return false;
}

async function getGuardAppointment(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      projectId: true,
      status: true,
      technicianId: true,
      technicianIds: true,
      supervisorIds: true,
      workSession: {
        select: {
          id: true,
          technicianId: true,
          status: true,
        },
      },
      tickets: {
        select: { id: true, status: true },
      },
    },
  });
}

async function enforceTechRouteGuards(
  req: TechAuthRequest,
  res: Response,
  tech: TechGuardProfile,
): Promise<boolean> {
  const path = requestPath(req);
  const method = req.method.toUpperCase();

  const operationalPath =
    path.startsWith('/shift/') ||
    path.startsWith('/tech/appointments') ||
    path.startsWith('/tech/tickets') ||
    path === '/tech/me/active-session';

  if (operationalPath && !tech.profileCompleted) {
    res.status(403).json({
      code: 'PROFILE_INCOMPLETE',
      error: 'أكمل الملف الشخصي أولاً قبل استخدام تطبيق الفني.',
    });
    return false;
  }

  // Never convert unfinished field work to "completed" just because a shift ends.
  if (method === 'POST' && path === '/shift/clock-out') {
    const unfinished = await prisma.appointmentWorkSession.findFirst({
      where: {
        technicianId: tech.id,
        status: { in: ['in_progress', 'paused'] },
      },
      select: { appointmentId: true, status: true },
    });
    if (unfinished) {
      res.status(409).json({
        code: 'UNFINISHED_APPOINTMENT',
        error: 'لا يمكن تسجيل الانصراف قبل إنهاء أو تأجيل الموعد الجاري.',
        activeAppointmentId: unfinished.appointmentId,
        sessionStatus: unfinished.status,
      });
      return false;
    }
  }

  // Shift breaks and appointment work timers must not run at the same time.
  if (method === 'POST' && path === '/shift/break/start') {
    const running = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId: tech.id, status: 'in_progress' },
      select: { appointmentId: true },
    });
    if (running) {
      res.status(409).json({
        code: 'PAUSE_APPOINTMENT_FIRST',
        error: 'أوقف الموعد مؤقتاً قبل بدء الاستراحة.',
        activeAppointmentId: running.appointmentId,
      });
      return false;
    }
  }

  // Ticket detail is private to the technician who can actually access its appointment.
  const ticketDetailMatch = method === 'GET' ? path.match(/^\/tech\/tickets\/([^/]+)$/) : null;
  if (ticketDetailMatch) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketDetailMatch[1] },
      select: {
        projectId: true,
        appointment: {
          select: {
            id: true,
            projectId: true,
            technicianId: true,
            technicianIds: true,
            supervisorIds: true,
            workSession: { select: { technicianId: true, status: true } },
          },
        },
      },
    });

    if (!ticket || ticket.projectId !== tech.projectId || !appointmentAccessibleToTech(ticket.appointment, tech)) {
      res.status(403).json({ error: 'هذه التذكرة غير مخصصة لهذا الفني.' });
      return false;
    }
  }

  // Per-ticket mutations are only allowed while the technician owns the running
  // appointment and has an ACTIVE shift (not while on break).
  const ticketMutationMatch = method === 'PATCH'
    ? path.match(/^\/tech\/appointments\/([^/]+)\/tickets\/([^/]+)$/)
    : null;
  if (ticketMutationMatch) {
    const appointment = await getGuardAppointment(ticketMutationMatch[1]);
    if (
      !appointment ||
      !appointmentAccessibleToTech(appointment, tech) ||
      appointment.workSession?.technicianId !== tech.id ||
      appointment.workSession?.status !== 'in_progress'
    ) {
      res.status(403).json({ error: 'لا يمكنك تعديل تذاكر هذا الموعد.' });
      return false;
    }
    if (!(await requireActiveShiftForAction(tech.id, res))) return false;
  }

  const appointmentActionMatch = method === 'POST'
    ? path.match(/^\/tech\/appointments\/([^/]+)\/(claim|finish|cancel-claim|pause|resume|postpone)$/)
    : null;

  if (appointmentActionMatch) {
    const [, appointmentId, action] = appointmentActionMatch;
    const appointment = await getGuardAppointment(appointmentId);
    if (!appointment || !appointmentAccessibleToTech(appointment, tech)) {
      res.status(403).json({ error: 'هذا الموعد غير مخصص لهذا الفني.' });
      return false;
    }

    const ownsSession = appointment.workSession?.technicianId === tech.id;
    if (['finish', 'cancel-claim', 'pause', 'resume'].includes(action) && !ownsSession) {
      res.status(403).json({ error: 'جلسة هذا الموعد لا تخص هذا الفني.' });
      return false;
    }

    // Work-affecting actions require an ACTIVE shift. Claim/resume while ON_BREAK
    // is explicitly blocked now.
    if (['claim', 'finish', 'pause', 'resume', 'postpone'].includes(action)) {
      if (!(await requireActiveShiftForAction(tech.id, res))) return false;
    }

    // A visit may be finished only after every ticket has a deliberate outcome.
    // waiting/contractor count as deliberate hand-off outcomes for this visit.
    if (action === 'finish') {
      const unresolved = appointment.tickets.filter(ticket =>
        UNRESOLVED_VISIT_TICKET_STATUSES.includes(String(ticket.status).toLowerCase() as any)
      );
      if (unresolved.length > 0) {
        res.status(409).json({
          code: 'UNRESOLVED_TICKETS',
          error: `لا يمكن إنهاء الموعد قبل تحديد نتيجة كل التذاكر (${unresolved.length} متبقية).`,
          remainingTicketIds: unresolved.map(ticket => ticket.id),
        });
        return false;
      }
    }
  }

  return true;
}

export async function requireTechAuth(req: TechAuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, APP_JWT_SECRET) as any;
    if (payload.role !== 'technician' || !payload.technicianId) {
      res.status(403).json({ error: 'Forbidden: Technician only' });
      return;
    }

    const tech = await prisma.technician.findUnique({
      where: { id: payload.technicianId },
      select: {
        id: true,
        isActive: true,
        profileCompleted: true,
        projectId: true,
        supervisorId: true,
      },
    });

    // Disabled technicians lose access immediately; we do not wait for a 30-day
    // JWT to expire.
    if (!tech || !tech.isActive) {
      res.status(403).json({
        code: 'TECHNICIAN_DISABLED',
        error: 'حساب الفني غير نشط.',
      });
      return;
    }

    req.technicianId = tech.id;
    if (!(await enforceTechRouteGuards(req, res, tech))) return;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    console.error('[tech-auth] authorization error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

// 1. POST /api/tech/login
router.post('/login', TECH_LOGIN_LIMITER, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Missing username or password' });
      return;
    }

    const normalizedUsername = normalizePhoneNumber(username);
    const rawUsername = String(username).trim();
    const tech = normalizedUsername
      ? await prisma.technician.findFirst({
          where: {
            OR: [
              { username: normalizedUsername },
              { phoneNumber: normalizedUsername },
              ...(rawUsername !== normalizedUsername ? [{ username: rawUsername }, { phoneNumber: rawUsername }] : []),
            ],
          },
          include: {
            supervisor: { select: { uid: true, displayName: true } },
            project: { select: { id: true, name: true } },
          },
        })
      : null;

    if (!tech || !tech.isActive || !tech.passwordHash) {
      res.status(401).json({ error: 'Invalid credentials or inactive account' });
      return;
    }

    const valid = await bcrypt.compare(password, tech.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { technicianId: tech.id, role: 'technician' },
      APP_JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, technician: publicTechProfile(tech) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/tech/profile — never expose password hash / ID number / ID image.
router.get('/profile', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const tech = await prisma.technician.findUnique({
      where: { id: req.technicianId },
      include: {
        supervisor: { select: { uid: true, displayName: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!tech) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }
    res.json(publicTechProfile(tech));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/tech/profile/complete
// Completing first-login setup also replaces the temporary invite PIN.
router.post('/profile/complete', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const {
      name,
      idNumber,
      employeeId,
      experienceLevel,
      specialty,
      clothingSize,
      shoeSize,
      idPhotoUrl,
      language,
      newPassword,
    } = req.body;

    if (!name || !idNumber || !employeeId || !specialty || !clothingSize || !shoeSize || !idPhotoUrl || !language || !newPassword) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }
    if (!['ar', 'en', 'hi', 'ur'].includes(language)) {
      res.status(400).json({ error: 'Invalid language' });
      return;
    }
    if (!/^\d{6}$/.test(String(newPassword))) {
      res.status(400).json({ error: 'New PIN must be exactly 6 digits' });
      return;
    }
    if (String(name).trim().length < 2 || String(name).trim().length > 120) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    if (String(employeeId).trim().length > 80 || String(idNumber).trim().length > 80) {
      res.status(400).json({ error: 'Invalid profile identifier' });
      return;
    }
    if (
      typeof idPhotoUrl !== 'string' ||
      !/^data:image\/(png|jpe?g|webp);base64,/i.test(idPhotoUrl) ||
      idPhotoUrl.length > 6_500_000
    ) {
      res.status(400).json({ error: 'Invalid or oversized ID image' });
      return;
    }

    const current = await prisma.technician.findUnique({
      where: { id: req.technicianId },
      select: { specialty: true },
    });
    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    const updated = await prisma.technician.update({
      where: { id: req.technicianId },
      data: {
        name: String(name).trim(),
        idNumber: String(idNumber).trim(),
        employeeId: String(employeeId).trim(),
        // An administrator-assigned specialty cannot be overwritten by the technician.
        specialty: current?.specialty || String(specialty).trim(),
        clothingSize,
        shoeSize,
        idPhotoUrl,
        language,
        experienceLevel: experienceLevel || null,
        passwordHash,
        profileCompleted: true,
      },
      include: {
        supervisor: { select: { uid: true, displayName: true } },
        project: { select: { id: true, name: true } },
      },
    });
    res.json(publicTechProfile(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/tech/language
router.post('/language', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { language } = req.body;
    if (!['ar', 'en', 'hi', 'ur'].includes(language)) {
      res.status(400).json({ error: 'Invalid language' });
      return;
    }
    const updated = await prisma.technician.update({
      where: { id: req.technicianId },
      data: { language },
      include: {
        supervisor: { select: { uid: true, displayName: true } },
        project: { select: { id: true, name: true } },
      },
    });
    res.json(publicTechProfile(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/tech/me/active-session
// This route intentionally lives before attendanceRoutes and therefore replaces
// the old in_progress-only recovery endpoint. Paused work is recoverable too.
router.get('/me/active-session', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const session = await prisma.appointmentWorkSession.findFirst({
      where: {
        technicianId: req.technicianId!,
        status: { in: ['in_progress', 'paused'] },
      },
      orderBy: { claimedAt: 'desc' },
      include: {
        appointment: {
          include: {
            unit: { include: { block: true } },
            client: true,
            project: {
              select: {
                id: true,
                name: true,
                officeLat: true,
                officeLng: true,
                officeAddress: true,
                googleMapsUrl: true,
              },
            },
            tickets: {
              select: {
                id: true,
                ticketId: true,
                description: true,
                status: true,
                type: true,
                detectedTypes: true,
                priority: true,
                unit: { select: { unitNumber: true } },
                client: { select: { name: true, phone: true } },
              },
            },
          },
        },
      },
    });
    res.json(session || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/tech/tickets/:id
// Safe technician ticket detail. requireTechAuth already verifies appointment access.
router.get('/tickets/:id', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        unit: { select: { unitNumber: true } },
        project: { select: { id: true, name: true, googleMapsUrl: true } },
        client: { select: { name: true, phone: true } },
        appointment: {
          select: {
            id: true,
            notes: true,
            date: true,
            time: true,
            status: true,
            workSession: {
              select: {
                id: true,
                status: true,
                technicianId: true,
                claimedAt: true,
                finishedAt: true,
                pausedAt: true,
                pauseReason: true,
                totalPausedMins: true,
                totalDurationMins: true,
                totalElapsedMins: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticketTypeKeys = [...new Set([
      ticket.type,
      ...(ticket.detectedTypes || []),
    ].filter((value: unknown): value is string => typeof value === 'string' && !!value.trim()))];
    const ticketTypeRows = ticketTypeKeys.length > 0
      ? await prisma.ticketType.findMany({
          where: { key: { in: ticketTypeKeys } },
          select: { key: true, nameAr: true },
        })
      : [];

    res.json({
      ...ticket,
      unitNumber: ticket.unit?.unitNumber,
      projectName: ticket.project?.name,
      projectGoogleMapsUrl: ticket.project?.googleMapsUrl,
      clientName: ticket.client?.name,
      clientPhone: ticket.client?.phone,
      typeLabels: Object.fromEntries(ticketTypeRows.map(type => [type.key, type.nameAr])),
      appointmentNotes: ticket.appointment?.notes,
      appointmentSession: ticket.appointment?.workSession || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/tech/invite
router.post('/invite', requireAuth, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.uid! } });
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { name, projectId, supervisorId, specialty } = req.body;
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber || null);
    if (!name || !phoneNumber || !projectId || !supervisorId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Supervisors can only create technicians under themselves and inside one
    // of their own projects. Admins can assign any valid supervisor/project.
    if (user.role === 'supervisor') {
      const allowedProject = await prisma.project.findFirst({
        where: { id: projectId, users: { some: { uid: user.uid } } },
        select: { id: true },
      });
      if (supervisorId !== user.uid || !allowedProject) {
        res.status(403).json({ error: 'Cannot create technician outside your projects.' });
        return;
      }
    }

    await assertPhoneNumberUnique(phoneNumber);
    const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const tech = await prisma.technician.create({
      data: {
        name,
        username: phoneNumber,
        phoneNumber,
        passwordHash,
        profileCompleted: false,
        projectId,
        supervisorId,
        specialty: specialty || null,
        isActive: true,
      },
    });

    const requesterUid: string = req.uid!;
    const senderUid = getWAStatus(requesterUid) === 'CONNECTED' ? requesterUid : BOT_USER_ID;
    const origin = process.env.APP_ORIGIN || 'https://tickets.knot-sys.com';
    const inviteMsg = `Hello ${name} 👋,\nWelcome to Retal Maintenance Team!\n\nYour Technician Portal Login:\n🔗 ${origin}/tech/login\n👤 Username: ${phoneNumber}\n🔑 Temporary PIN: ${tempPassword}\n\nLogin once, complete your profile, and choose a new 6-digit PIN.`;
    const waResult = await sendWAText(senderUid, phoneNumber, inviteMsg)
      .catch(() => ({ sent: false, fallback: false }));

    res.json({ technicianId: tech.id, tempPassword, waSent: waResult.sent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
