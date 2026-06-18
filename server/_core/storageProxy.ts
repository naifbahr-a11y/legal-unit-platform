import type { Express, Response } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import type { User } from "../../drizzle/schema";
import { guessContentType, localStorageRead } from "../localStorage";
import {
  assertStorageKeyAccess,
  isPublicBrandingKey,
  isValidStorageKey,
} from "./storageAccess";

function useLocalStorage() {
  return ENV.useLocalStorage || !ENV.forgeApiUrl || !ENV.forgeApiKey;
}

async function serveStorageFile(key: string, res: Response) {
  if (useLocalStorage()) {
    const file = await localStorageRead(key);
    if (!file) {
      res.status(404).send("File not found");
      return;
    }
    res.set("Cache-Control", "private, max-age=300");
    res.type(guessContentType(key));
    res.send(file);
    return;
  }

  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    res.status(500).send("Storage proxy not configured");
    return;
  }

  try {
    const forgeUrl = new URL(
      "v1/storage/presign/get",
      ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
    );
    forgeUrl.searchParams.set("path", key);

    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    });

    if (!forgeResp.ok) {
      const body = await forgeResp.text().catch(() => "");
      console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
      res.status(502).send("Storage backend error");
      return;
    }

    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) {
      res.status(502).send("Empty signed URL from backend");
      return;
    }

    res.set("Cache-Control", "private, max-age=300");
    res.redirect(307, url);
  } catch (err) {
    console.error("[StorageProxy] failed:", err);
    res.status(502).send("Storage proxy error");
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!isValidStorageKey(key)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    const isPublicLogo = await isPublicBrandingKey(key);
    if (isPublicLogo) {
      res.set("Cache-Control", "public, max-age=3600");
      await serveStorageFile(key, res);
      return;
    }

    let user: User | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).send("يجب تسجيل الدخول");
      return;
    }

    if (!user) {
      res.status(401).send("يجب تسجيل الدخول");
      return;
    }

    if (Number(user.mustChangePassword) === 1) {
      res.status(403).send("يجب تغيير كلمة المرور أولاً");
      return;
    }

    try {
      await assertStorageKeyAccess(user, key);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "BAD_REQUEST") {
        res.status(400).send("مفتاح تخزين غير صالح");
        return;
      }
      res.status(403).send("غير مصرح بالوصول إلى هذا الملف");
      return;
    }

    await serveStorageFile(key, res);
  });
}
