import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextFunction, Response, Router } from "express";
import multer from "multer";
import { AuthRequest, requireAuth } from "../auth.js";
import { getAuthorizedTicket } from "../middleware/ticket-access.js";

const router = Router();

const MAX_FILES = 6;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ATTACHMENTS_ROOT = path.resolve(
  process.env.TICKET_ATTACHMENTS_DIR || path.join(process.cwd(), "data", "ticket-attachments"),
);

const MIME_EXTENSIONS = new Map<string, Set<string>>([
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
  ["image/gif", new Set([".gif"])],
  ["video/mp4", new Set([".mp4"])],
  ["video/webm", new Set([".webm"])],
  ["video/quicktime", new Set([".mov"])],
  ["video/ogg", new Set([".ogg", ".ogv"])],
]);

fs.mkdirSync(ATTACHMENTS_ROOT, { recursive: true, mode: 0o750 });

type AttachmentRequest = AuthRequest & {
  attachmentScope?: string;
};

function attachmentScope(ticketId: string): string {
  return crypto.createHash("sha256").update(ticketId).digest("hex").slice(0, 32);
}

function safeUnlink(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function hasExpectedSignature(file: Express.Multer.File): boolean {
  const fd = fs.openSync(file.path, "r");
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    const data = header.subarray(0, bytesRead);

    switch (file.mimetype) {
      case "image/jpeg":
        return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
      case "image/png":
        return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      case "image/gif": {
        const signature = data.subarray(0, 6).toString("ascii");
        return signature === "GIF87a" || signature === "GIF89a";
      }
      case "image/webp":
        return data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
      case "video/webm":
        return data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
      case "video/ogg":
        return data.length >= 4 && data.subarray(0, 4).toString("ascii") === "OggS";
      case "video/mp4":
      case "video/quicktime":
        return data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp";
      default:
        return false;
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function requireTicketAccess(req: AttachmentRequest, res: Response, next: NextFunction) {
  try {
    if (!req.uid) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const ticket = await getAuthorizedTicket(req.uid, req.params.ticketId);
    if (!ticket) {
      res.status(404).json({ error: "TICKET_NOT_FOUND" });
      return;
    }

    req.attachmentScope = attachmentScope(ticket.id);
    next();
  } catch (error) {
    next(error);
  }
}

const storage = multer.diskStorage({
  destination: (req: AttachmentRequest, _file, cb) => {
    if (!req.attachmentScope) {
      cb(new Error("ATTACHMENT_SCOPE_MISSING"), "");
      return;
    }
    const directory = path.join(ATTACHMENTS_ROOT, req.attachmentScope);
    fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    cb(null, directory);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = MIME_EXTENSIONS.get(file.mimetype);
    if (!allowedExtensions?.has(ext)) {
      cb(new Error("UNSUPPORTED_ATTACHMENT_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function uploadFiles(req: AttachmentRequest, res: Response, next: NextFunction) {
  upload.array("files", MAX_FILES)(req, res, error => {
    if (!error) {
      next();
      return;
    }

    const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    uploadedFiles.forEach(file => safeUnlink(file.path));

    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({ error: error.code });
      return;
    }

    res.status(400).json({ error: error instanceof Error ? error.message : "ATTACHMENT_UPLOAD_FAILED" });
  });
}

router.post(
  "/:ticketId",
  requireAuth,
  requireTicketAccess,
  uploadFiles,
  (req: AttachmentRequest, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) {
      res.status(400).json({ error: "NO_ATTACHMENTS" });
      return;
    }

    const invalidFile = files.find(file => !hasExpectedSignature(file));
    if (invalidFile) {
      files.forEach(file => safeUnlink(file.path));
      res.status(400).json({ error: "INVALID_ATTACHMENT_CONTENT" });
      return;
    }

    const items = files.map(file => ({
      name: path.basename(file.originalname),
      size: file.size,
      mimeType: file.mimetype,
      url: `/api/ticket-attachments/${encodeURIComponent(req.params.ticketId)}/${encodeURIComponent(file.filename)}`,
    }));

    res.status(201).json({ files: items });
  },
);

router.get(
  "/:ticketId/:filename",
  requireAuth,
  requireTicketAccess,
  (req: AttachmentRequest, res: Response) => {
    const filename = req.params.filename;
    if (path.basename(filename) !== filename || !/^[0-9a-f-]{36}\.(?:jpe?g|png|webp|gif|mp4|webm|mov|ogg|ogv)$/i.test(filename)) {
      res.status(400).json({ error: "INVALID_ATTACHMENT_NAME" });
      return;
    }

    const filePath = path.join(ATTACHMENTS_ROOT, req.attachmentScope!, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" });
      return;
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
  },
);

export default router;
