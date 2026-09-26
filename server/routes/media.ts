import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import {
  ALLOWED_EXTENSIONS,
  MEDIA_ROOT,
  MIME_TYPES,
  getRealMediaRoot,
  isInsideRoot,
  resolveMediaFile,
} from "../media-library.js";

const router = Router();

const MAX_LISTED_IMAGES = 5000;
const MAX_SCAN_DEPTH = 8;

type MediaItem = {
  name: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
  url: string;
};

async function scanDirectory(
  absoluteDir: string,
  relativeDir: string,
  realRoot: string,
  depth: number,
  items: MediaItem[],
) {
  if (depth > MAX_SCAN_DEPTH || items.length >= MAX_LISTED_IMAGES) return;

  const entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

  for (const entry of entries) {
    if (items.length >= MAX_LISTED_IMAGES) return;
    if (entry.name.startsWith(".")) continue;

    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = relativeDir
      ? `${relativeDir}/${entry.name}`
      : entry.name;

    let lst: fs.Stats;
    try {
      lst = await fs.promises.lstat(absolutePath);
    } catch {
      continue;
    }

    if (lst.isSymbolicLink()) continue;

    if (lst.isDirectory()) {
      await scanDirectory(
        absolutePath,
        relativePath,
        realRoot,
        depth + 1,
        items,
      );
      continue;
    }

    if (!lst.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) continue;

    let realPath: string;
    try {
      realPath = await fs.promises.realpath(absolutePath);
    } catch {
      continue;
    }

    if (!isInsideRoot(realRoot, realPath)) continue;

    items.push({
      name: entry.name,
      relativePath,
      extension: extension.slice(1),
      mimeType: MIME_TYPES[extension] || "application/octet-stream",
      size: lst.size,
      modifiedAt: lst.mtime.toISOString(),
      url: `/api/media/file?path=${encodeURIComponent(relativePath)}`,
    });
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const realRoot = await getRealMediaRoot();
    const items: MediaItem[] = [];

    await scanDirectory(MEDIA_ROOT, "", realRoot, 0, items);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      items,
      count: items.length,
      truncated: items.length >= MAX_LISTED_IMAGES,
    });
  } catch (error) {
    console.error("[media] Unable to list media assets:", error);
    res.status(503).json({
      error: "MEDIA_LIBRARY_UNAVAILABLE",
      message: "مكتبة الصور غير متاحة حالياً.",
    });
  }
});

router.get("/file", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveMediaFile(req.query.path);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");

    return res.sendFile(resolved.realTarget);
  } catch (error) {
    console.error("[media] Unable to serve media asset:", error);
    return res.status(500).json({ error: "MEDIA_READ_FAILED" });
  }
});

export default router;
