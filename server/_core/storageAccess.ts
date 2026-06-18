import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import * as authz from "./authorization";
import * as attachmentAccess from "./attachmentAccess";
import { hasPendingUpload, assertAndConsumePendingUpload } from "./uploadStaging";

export function isValidStorageKey(key: string): boolean {
  return !!key && !key.includes("..") && !key.startsWith("/");
}

export function extractStorageKeyFromUrl(url: string): string | null {
  const trimmed = url.trim();
  const marker = "/manus-storage/";
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  const key = trimmed.slice(idx + marker.length).split("?")[0];
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

export function assertFileUrlMatchesKey(fileUrl: string, fileKey: string) {
  const fromUrl = extractStorageKeyFromUrl(fileUrl);
  const key = fileKey.trim();
  if (!fromUrl || fromUrl !== key) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "رابط الملف لا يطابق مفتاح التخزين",
    });
  }
}

export async function isPublicBrandingKey(key: string): Promise<boolean> {
  const logoKey = await db.getAppLogoStorageKey();
  return !!logoKey && logoKey === key;
}

type StorageUser = Pick<User, "id" | "role" | "displayName" | "username"> & {
  permissions?: unknown;
};

/** يتحقق أن المستخدم يحق له تحميل الملف — أو أنه رفع مؤقت لم يُربط بعد */
export async function assertStorageKeyAccess(user: StorageUser, key: string) {
  if (!isValidStorageKey(key)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "مفتاح تخزين غير صالح" });
  }

  if (hasPendingUpload(user.id, key)) return;

  const attachment = await db.getAttachmentByFileKey(key);
  if (attachment) {
    await attachmentAccess.assertAttachmentRecordAccess(
      user,
      attachment.tableName,
      attachment.caseId,
    );
    return;
  }

  const correspondence = await db.getCorrespondenceByAttachmentKey(key);
  if (correspondence) {
    authz.assertSectionAccess(user, "correspondence");
    authz.assertCorrespondenceAccess(user, correspondence);
    return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "غير مصرح بالوصول إلى هذا الملف",
  });
}

/** ربط مرفق/مراسلة/شعار بمفتاح رُفع حديثاً */
export function bindUploadedFile(
  userId: number,
  fileKey: string | undefined | null,
  fileUrl: string | undefined | null,
  existingKey?: string | null,
) {
  const key = fileKey?.trim();
  if (!key) return;
  if (existingKey && existingKey.trim() === key) return;
  if (fileUrl) assertFileUrlMatchesKey(fileUrl, key);
  assertAndConsumePendingUpload(userId, key);
}
