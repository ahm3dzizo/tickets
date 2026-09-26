import fs from "fs";
import path from "path";

export const MEDIA_ROOT = path.resolve(
  process.env.MEDIA_ASSETS_ROOT || "/opt/retal-api/public/bibo",
);

export const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
]);

export const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export function isInsideRoot(root: string, target: string) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

export function safeRelativePath(input: unknown) {
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

export async function getRealMediaRoot() {
  const stat = await fs.promises.stat(MEDIA_ROOT);
  if (!stat.isDirectory()) throw new Error("MEDIA_ROOT_NOT_DIRECTORY");
  return fs.promises.realpath(MEDIA_ROOT);
}

export async function resolveMediaFile(input: unknown) {
  const safe = safeRelativePath(input);
  if (!safe) {
    return { ok: false as const, status: 400, error: "INVALID_MEDIA_PATH" };
  }

  try {
    const realRoot = await getRealMediaRoot();
    const lst = await fs.promises.lstat(safe.resolved);

    if (lst.isSymbolicLink() || !lst.isFile()) {
      return { ok: false as const, status: 404, error: "MEDIA_NOT_FOUND" };
    }

    const realTarget = await fs.promises.realpath(safe.resolved);
    if (!isInsideRoot(realRoot, realTarget)) {
      return { ok: false as const, status: 403, error: "MEDIA_PATH_FORBIDDEN" };
    }

    const extension = path.extname(realTarget).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return { ok: false as const, status: 415, error: "UNSUPPORTED_MEDIA_TYPE" };
    }

    return {
      ok: true as const,
      realTarget,
      extension,
      mimeType: MIME_TYPES[extension] || "application/octet-stream",
      size: lst.size,
      relativePath: safe.relativePath,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { ok: false as const, status: 404, error: "MEDIA_NOT_FOUND" };
    }

    throw error;
  }
}
