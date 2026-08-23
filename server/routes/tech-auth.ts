import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { APP_JWT_SECRET } from '../config.js';
import { requireAuth } from '../auth.js';
import { sendWAText, getWAStatus } from '../baileys.js';
import { BOT_USER_ID } from '../whatsappBot.js';

const router = Router();

export interface TechAuthRequest extends Request {
  technicianId?: string;
}

export function requireTechAuth(req: TechAuthRequest, res: Response, next: NextFunction) {
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
    req.technicianId = payload.technicianId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// 1. POST /api/tech/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Missing username or password' });
      return;
    }
    const tech = await prisma.technician.findUnique({ where: { username } });
    if (!tech || !tech.isActive) {
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
    const { passwordHash: _ph, ...techProfile } = tech;
    res.json({ token, technician: techProfile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/tech/profile
router.get('/profile', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const tech = await prisma.technician.findUnique({ where: { id: req.technicianId } });
    if (!tech) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }
    res.json(tech);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/tech/profile/complete
router.post('/profile/complete', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { name, idNumber, employeeId, experienceLevel, specialty, clothingSize, shoeSize, idPhotoUrl, language } = req.body;
    if (!name || !idNumber || !employeeId || !specialty || !clothingSize || !shoeSize || !idPhotoUrl || !language) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }
    const updated = await prisma.technician.update({
      where: { id: req.technicianId },
      data: {
        name, idNumber, employeeId, specialty, clothingSize, shoeSize, idPhotoUrl, language,
        experienceLevel: experienceLevel || null,
        profileCompleted: true
      }
    });
    res.json(updated);
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
      data: { language }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. POST /api/tech/invite
router.post('/invite', requireAuth, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.uid! } });
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { name, phoneNumber, projectId, supervisorId } = req.body;
    if (!name || !phoneNumber || !projectId || !supervisorId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const existing = await prisma.technician.findUnique({ where: { username: phoneNumber } });
    if (existing) {
      res.status(400).json({ error: 'Technician with this phone number already exists' });
      return;
    }
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
        isActive: true,
      }
    });

    // Send WhatsApp invite automatically — from requester's connected session,
    // or fall back to the shared bot session if the requester is not connected.
    const requesterUid: string = req.uid!;
    const senderUid = getWAStatus(requesterUid) === 'CONNECTED' ? requesterUid : BOT_USER_ID;
    const origin = process.env.APP_ORIGIN || 'https://tickets.knot-sys.com';
    const inviteMsg = `Hello ${name} 👋,\nWelcome to Retal Maintenance Team!\n\nYour Technician Portal Login:\n🔗 ${origin}/tech/login\n👤 Username: ${phoneNumber}\n🔑 Temp PIN: ${tempPassword}\n\nPlease login and complete your profile setup.`;
    const waResult = await sendWAText(senderUid, phoneNumber, inviteMsg).catch(() => ({ sent: false, fallback: false }));

    res.json({ technicianId: tech.id, tempPassword, waSent: waResult.sent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
