import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { MEDIA_ROOT } from "../media-library.js";

const router = Router();
const ROOT = path.join(MEDIA_ROOT, "catalog");
fs.mkdirSync(ROOT, { recursive: true });

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, Boolean(MIME_EXT[file.mimetype]));
  },
});

function hasExpectedSignature(file: Express.Multer.File) {
  const data = file.buffer;
  if (file.mimetype === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (file.mimetype === "image/png") {
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  }
  if (file.mimetype === "image/webp") {
    return data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

router.post("/", limiter, upload.array("images", 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) {
    res.status(400).json({ error: "NO_IMAGES" });
    return;
  }

  const invalid = files.find((file) => !hasExpectedSignature(file));
  if (invalid) {
    res.status(400).json({ error: "INVALID_IMAGE_CONTENT" });
    return;
  }

  const batchId = crypto.randomUUID();
  const dir = path.join(ROOT, batchId);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o755 });

  const items = [];
  for (const file of files) {
    const ext = MIME_EXT[file.mimetype];
    const filename = crypto.randomUUID() + ext;
    const absolute = path.join(dir, filename);
    await fs.promises.writeFile(absolute, file.buffer, { mode: 0o644 });
    const relativePath = path.relative(MEDIA_ROOT, absolute).split(path.sep).join("/");
    items.push({
      relativePath,
      url: "/api/media/file?path=" + encodeURIComponent(relativePath),
    });
  }

  res.status(201).json({ items });
});

export default router;
