import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const MEDIA_ROOT = path.resolve(
  process.env.MEDIA_ASSETS_ROOT || "/home/fcc/assets/bibo",
);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
]);

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

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

function isInsideRoot(root: string, target: string) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function safeRelativePath(input: unknown) {
  if (typeof input !== "string" || !input || input.includes("\0")) return null;
  if (path.isAbsolute(input)) return null;

  const normalized = input.replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\0"),
    )
  ) {
    return null;
  }

  const extension = path.extname(normalized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) return null;

  const resolved = path.resolve(MEDIA_ROOT, ...segments);
  if (!isInsideRoot(MEDIA_ROOT, resolved)) return null;

  return {
    relativePath: segments.join("/"),
    resolved,
    extension,
  };
}

async function getRealRoot() {
  const stat = await fs.promises.stat(MEDIA_ROOT);
  if (!stat.isDirectory()) throw new Error("MEDIA_ROOT_NOT_DIRECTORY");
  return fs.promises.realpath(MEDIA_ROOT);
}

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

    // Never follow symlinks from the media tree.
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
    const realRoot = await getRealRoot();
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
  const safe = safeRelativePath(req.query.path);
  if (!safe) {
    return res.status(400).json({ error: "INVALID_MEDIA_PATH" });
  }

  try {
    const realRoot = await getRealRoot();

    const lst = await fs.promises.lstat(safe.resolved);
    if (lst.isSymbolicLink() || !lst.isFile()) {
      return res.status(404).json({ error: "MEDIA_NOT_FOUND" });
    }

    const realTarget = await fs.promises.realpath(safe.resolved);
    if (!isInsideRoot(realRoot, realTarget)) {
      return res.status(403).json({ error: "MEDIA_PATH_FORBIDDEN" });
    }

    const realExtension = path.extname(realTarget).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(realExtension)) {
      return res.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" });
    }

    res.setHeader(
      "Content-Type",
      MIME_TYPES[realExtension] || "application/octet-stream",
    );
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");

    return res.sendFile(realTarget);
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return res.status(404).json({ error: "MEDIA_NOT_FOUND" });
    }

    console.error("[media] Unable to serve media asset:", error);
    return res.status(500).json({ error: "MEDIA_READ_FAILED" });
  }
});

export default router;
