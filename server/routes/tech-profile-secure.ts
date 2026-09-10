import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import prisma from '../db.js';
import { requireTechAuth, type TechAuthRequest } from './tech-auth.js';

const router = Router();

const PRIVATE_ID_ROOT = path.resolve(process.cwd(), 'private_uploads/technicians/id');
const MAX_ID_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const ALLOWED_LANGUAGES = new Set(['ar', 'en', 'hi', 'ur']);
const ALLOWED_CLOTHING_SIZES = new Set(['S', 'M', 'L', 'XL', 'XXL', 'XXXL']);

fs.mkdirSync(PRIVATE_ID_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PRIVATE_ID_ROOT),
  filename: (_req, file, cb) => {
    const ext = MIME_EXTENSION[file.mimetype];
    if (!ext) {
      cb(new Error('Unsupported ID image format'), '');
      return;
    }
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: MAX_ID_PHOTO_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(new Error('يسمح فقط بصور JPG أو PNG أو WEBP'));
      return;
    }
    cb(null, true);
  },
});

function removeFileQuietly(filePath?: string | null) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only.
  }
}

function validImageSignature(file: Express.Multer.File): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file.path, 'r');
    const head = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, head, 0, head.length, 0);
    if (bytesRead < 12) return false;

    if (file.mimetype === 'image/jpeg') {
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    }
    if (file.mimetype === 'image/png') {
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (file.mimetype === 'image/webp') {
      return head.subarray(0, 4).toString('ascii') === 'RIFF'
        && head.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function publicProfile(tech: any) {
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

function uploadSingleIdPhoto(req: TechAuthRequest, res: any, next: any) {
  upload.single('idPhoto')(req, res, (err: any) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        code: 'ID_PHOTO_TOO_LARGE',
        error: 'حجم صورة الهوية أكبر من الحد المسموح (5MB).',
      });
      return;
    }

    res.status(400).json({
      code: 'INVALID_ID_PHOTO',
      error: err?.message || 'صورة الهوية غير صالحة.',
    });
  });
}

// Secure replacement for the legacy JSON/base64 profile completion route.
// Mounted before tech-auth.ts so this endpoint is authoritative.
router.post(
  '/profile/complete',
  requireTechAuth,
  uploadSingleIdPhoto,
  async (req: TechAuthRequest, res) => {
    const uploadedPath = req.file?.path;
    try {
      const technicianId = req.technicianId!;
      const name = String(req.body?.name || '').trim();
      const idNumber = String(req.body?.idNumber || '').trim();
      const employeeId = String(req.body?.employeeId || '').trim();
      const experienceLevel = String(req.body?.experienceLevel || '').trim() || null;
      const clothingSize = String(req.body?.clothingSize || '').trim();
      const shoeSize = String(req.body?.shoeSize || '').trim();
      const language = String(req.body?.language || '').trim();
      const newPassword = String(req.body?.newPassword || '');

      if (!req.file) {
        res.status(400).json({ code: 'ID_PHOTO_REQUIRED', error: 'صورة الهوية مطلوبة.' });
        return;
      }
      if (!validImageSignature(req.file)) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({
          code: 'INVALID_ID_PHOTO_SIGNATURE',
          error: 'محتوى صورة الهوية لا يطابق نوع الملف.',
        });
        return;
      }
      if (name.length < 2 || name.length > 120) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({ error: 'الاسم غير صالح.' });
        return;
      }
      if (!idNumber || idNumber.length > 80 || !employeeId || employeeId.length > 80) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({ error: 'بيانات الهوية أو الرقم الوظيفي غير صالحة.' });
        return;
      }
      if (!ALLOWED_LANGUAGES.has(language)) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({ error: 'اللغة غير صالحة.' });
        return;
      }
      if (!ALLOWED_CLOTHING_SIZES.has(clothingSize)) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({ error: 'مقاس الملابس غير صالح.' });
        return;
      }
      const shoeNumber = Number(shoeSize);
      if (!Number.isInteger(shoeNumber) || shoeNumber < 35 || shoeNumber > 50) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({ error: 'مقاس الحذاء غير صالح.' });
        return;
      }
      if (!/^\d{6}$/.test(newPassword)) {
        removeFileQuietly(uploadedPath);
        res.status(400).json({ error: 'رمز PIN الجديد يجب أن يكون 6 أرقام.' });
        return;
      }

      const current = await prisma.technician.findUnique({
        where: { id: technicianId },
        select: {
          id: true,
          specialty: true,
          profileCompleted: true,
          isActive: true,
        },
      });

      if (!current || !current.isActive) {
        removeFileQuietly(uploadedPath);
        res.status(403).json({ code: 'TECHNICIAN_DISABLED', error: 'حساب الفني غير نشط.' });
        return;
      }
      if (current.profileCompleted) {
        removeFileQuietly(uploadedPath);
        res.status(409).json({
          code: 'PROFILE_ALREADY_COMPLETED',
          error: 'تم استكمال الملف الشخصي مسبقاً.',
        });
        return;
      }
      if (!current.specialty?.trim()) {
        removeFileQuietly(uploadedPath);
        res.status(409).json({
          code: 'SPECIALTY_ASSIGNMENT_REQUIRED',
          error: 'يجب على الإدارة تعيين تخصص الفني قبل استكمال التسجيل.',
        });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const privateIdPath = `private://technicians/id/${req.file.filename}`;

      const updated = await prisma.technician.update({
        where: { id: technicianId },
        data: {
          name,
          idNumber,
          employeeId,
          experienceLevel,
          clothingSize,
          shoeSize,
          language,
          idPhotoUrl: privateIdPath,
          passwordHash,
          profileCompleted: true,
        },
        include: {
          supervisor: { select: { uid: true, displayName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      res.json(publicProfile(updated));
    } catch (err: any) {
      removeFileQuietly(uploadedPath);
      console.error('[tech-profile] secure profile completion failed:', err);
      res.status(500).json({ error: 'تعذر استكمال الملف الشخصي.' });
    }
  },
);

export default router;
