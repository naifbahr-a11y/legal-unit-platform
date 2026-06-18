import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./_core/env";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCAL_UPLOADS_DIR = path.resolve(
  ENV.localStorageDir || path.join(PROJECT_ROOT, "uploads"),
);

export async function ensureLocalUploadsDir() {
  await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\\/g, "/");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function resolveLocalPath(key: string): string {
  const normalized = normalizeKey(key);
  const resolved = path.resolve(LOCAL_UPLOADS_DIR, normalized);
  if (!resolved.startsWith(LOCAL_UPLOADS_DIR)) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

export async function localStoragePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  await ensureLocalUploadsDir();
  const key = appendHashSuffix(normalizeKey(relKey));
  const filePath = resolveLocalPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await fs.writeFile(filePath, buffer);
  return { key, url: `/manus-storage/${key}` };
}

export async function localStorageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function localStorageRead(relKey: string): Promise<Buffer | null> {
  try {
    const filePath = resolveLocalPath(relKey);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
  };
  return map[ext] || "application/octet-stream";
}
