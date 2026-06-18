import type { Express } from "express";
import { ENV } from "./env";
import { requireAuth } from "./expressAuth";
import { guessContentType, localStorageRead } from "../localStorage";

function useLocalStorage() {
  return ENV.useLocalStorage || !ENV.forgeApiUrl || !ENV.forgeApiKey;
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", requireAuth, async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (key.includes("..") || key.startsWith("/")) {
      res.status(400).send("Invalid storage key");
      return;
    }

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
  });
}
