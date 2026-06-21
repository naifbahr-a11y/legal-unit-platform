import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { requireAuth } from "./expressAuth";
import { validateEnvOnStartup } from "./validateEnv";
import { ENV } from "./env";
import { registerPendingUpload } from "./uploadStaging";
import { getAllowedUploadMimes, validateUploadBuffer } from "./uploadValidation";
import { checkApiRateLimit, getClientIp, recordApiRequest } from "./rateLimit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Allowed origins for CORS (mobile app origins)
function buildCorsOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const railwayFromDomain = railwayDomain
    ? [`https://${railwayDomain}`, `http://${railwayDomain}`]
    : [];
  const railwayStatic = process.env.RAILWAY_STATIC_URL?.trim().replace(/\/$/, "");
  return [
    "capacitor://localhost",
    "https://localhost",
    "http://localhost",
    "ionic://localhost",
    ...fromEnv,
    ...railwayFromDomain,
    ...(railwayStatic ? [railwayStatic] : []),
  ];
}

const CORS_ALLOWED_ORIGINS = buildCorsOrigins();

const ALLOWED_UPLOAD_MIME = getAllowedUploadMimes();

function setCorsHeaders(req: any, res: any) {
  const origin = req.headers.origin || "";
  if (CORS_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (!ENV.isProduction) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-File-Name");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function startServer() {
  validateEnvOnStartup();

  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);
  app.use(
    helmet({
      // Default helmet CSP adds upgrade-insecure-requests, which breaks HTTP-only deploys
      // (browser upgrades asset URLs to HTTPS and they fail without TLS).
      contentSecurityPolicy: ENV.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              baseUri: ["'self'"],
              fontSrc: ["'self'", "https:", "data:"],
              formAction: ["'self'"],
              frameAncestors: ["'self'"],
              imgSrc: ["'self'", "data:", "blob:"],
              objectSrc: ["'none'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              scriptSrcAttr: ["'none'"],
              styleSrc: ["'self'", "https:", "'unsafe-inline'"],
              connectSrc: ["'self'", "https:"],
              upgradeInsecureRequests: null,
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, status: "healthy" });
  });

  // CORS + rate limiting for all /api/* routes
  app.use("/api", (req: any, res: any, next: any) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    const ip = getClientIp(req);
    const rate = checkApiRateLimit(ip);
    if (!rate.allowed) {
      return res.status(429).json({
        success: false,
        error: `طلبات كثيرة. حاول بعد ${rate.retryAfterSec} ثانية`,
        code: "TOO_MANY_REQUESTS",
      });
    }
    recordApiRequest(ip);
    next();
  });

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  registerStorageProxy(app);

  // File upload endpoint (authenticated)
  app.post("/api/upload", requireAuth, express.raw({ type: "*/*", limit: "16mb" }), async (req, res) => {
    try {
      const authReq = req as import("./expressAuth").AuthenticatedRequest;
      const { storagePut } = await import("../storage");
      const fileName = req.headers["x-file-name"] ? decodeURIComponent(req.headers["x-file-name"] as string) : `file_${Date.now()}`;
      const contentType = (req.headers["content-type"] as string) || "application/octet-stream";
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
      const validation = validateUploadBuffer(body, contentType);
      if (!validation.ok) {
        return res.status(400).json({ success: false, error: validation.error });
      }
      const safeName = fileName.replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g, "_");
      const ext = safeName.split(".").pop() || "bin";
      const key = `attachments/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { url, key: storedKey } = await storagePut(key, body, validation.mime);
      if (authReq.user?.id) {
        registerPendingUpload(authReq.user.id, storedKey);
      }
      res.json({ success: true, url, key: storedKey, fileName: safeName });
    } catch (err: any) {
      console.error("[Upload] Error:", err);
      res.status(500).json({ success: false, error: "فشل رفع الملف" });
    }
  });

  // Excel/Word import endpoint (authenticated)
  app.post("/api/import-file", requireAuth, express.raw({ type: "*/*", limit: "16mb" }), async (req, res) => {
    try {
      const fileName = req.headers["x-file-name"] ? decodeURIComponent(req.headers["x-file-name"] as string) : "file";
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
      if (!body.length) {
        return res.status(400).json({ success: false, error: "ملف فارغ" });
      }
      const allowedExt = new Set(["xlsx", "xls", "docx", "doc"]);
      if (!allowedExt.has(ext)) {
        return res.status(400).json({ success: false, error: "نوع الملف غير مدعوم" });
      }
      if (ext === "xlsx" || ext === "xls") {
        const zipSig = body[0] === 0x50 && body[1] === 0x4b;
        const oleSig = body[0] === 0xd0 && body[1] === 0xcf;
        if (!zipSig && !oleSig) {
          return res.status(400).json({ success: false, error: "ملف Excel غير صالح" });
        }
      }
      if (ext === "docx") {
        const zipSig = body[0] === 0x50 && body[1] === 0x4b;
        if (!zipSig) {
          return res.status(400).json({ success: false, error: "ملف Word غير صالح" });
        }
      }
      let records: any[] = [];
      let headers: string[] = [];

      if (ext === "xlsx" || ext === "xls") {
        const XLSX = await import("xlsx");
        const readOpts: any = { type: "buffer" };
        if (ext === "xls") readOpts.codepage = 1256;
        const workbook = XLSX.read(body, readOpts);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (jsonData.length > 0) {
          headers = (jsonData[0] || []).map((h: any) => String(h || "").trim());
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.every((c: any) => !c)) continue;
            const record: any = {};
            headers.forEach((h, idx) => {
              if (h) record[h] = row[idx] != null ? String(row[idx]) : "";
            });
            records.push(record);
          }
        }
      } else if (ext === "docx" || ext === "doc") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: body });
        const lines = result.value.split("\n").filter((l: string) => l.trim());
        if (lines.length > 0) {
          const separator = lines[0].includes("\t") ? "\t" : lines[0].includes("|") ? "|" : null;
          if (separator) {
            headers = lines[0].split(separator).map((h: string) => h.trim()).filter(Boolean);
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(separator).map((c: string) => c.trim());
              const record: any = {};
              headers.forEach((h, idx) => { record[h] = cols[idx] || ""; });
              records.push(record);
            }
          } else {
            headers = ["\u0627\u0644\u0645\u062d\u062a\u0648\u0649"];
            records = lines.map((line: string) => ({ "\u0627\u0644\u0645\u062d\u062a\u0648\u0649": line }));
          }
        }
      } else {
        return res.status(400).json({ success: false, error: "\u0635\u064a\u063a\u0629 \u063a\u064a\u0631 \u0645\u062f\u0639\u0648\u0645\u0629. \u0627\u0633\u062a\u062e\u062f\u0645 Excel (.xlsx) \u0623\u0648 Word (.docx)" });
      }
      res.json({ success: true, headers, records, count: records.length });
    } catch (err: any) {
      console.error("[Import] Error:", err);
      res.status(500).json({ success: false, error: "فشل استيراد الملف" });
    }
  });

  // Telegram Bot Webhook
  app.post("/api/telegram/webhook", async (req: any, res: any) => {
    try {
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (ENV.isProduction && !webhookSecret) {
        console.error("[Telegram] TELEGRAM_WEBHOOK_SECRET required in production");
        return res.status(503).json({ ok: false });
      }
      if (webhookSecret) {
        const token = req.headers["x-telegram-bot-api-secret-token"];
        if (token !== webhookSecret) {
          return res.status(403).json({ ok: false });
        }
      }
      const update = req.body;
      if (!update?.message) return res.json({ ok: true });
      const msg = update.message;
      const chatId = String(msg.chat?.id);
      const text = (msg.text || "").trim();

      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        const linkCode = parts[1]?.trim();
        if (linkCode) {
          const { linkTelegramAccount } = await import("../telegram");
          const result = await linkTelegramAccount(linkCode, chatId);
          const { sendTelegramMessage } = await import("../telegram");
          if (result.success) {
            await sendTelegramMessage(chatId, `✅ <b>تم ربط حسابك بنجاح!</b>\n\nمرحباً ${result.displayName}\nستصلك الآن إشعارات تلغرام من نظام الوحدة القانونية.`);
          } else {
            await sendTelegramMessage(chatId, `❌ الكود غير صحيح أو منتهي الصلاحية.\n\nيرجى الحصول على كود جديد من البرنامج.`);
          }
        } else {
          const { sendTelegramMessage } = await import("../telegram");
          await sendTelegramMessage(chatId, `مرحباً! لربط حسابك:\n1. افتح البرنامج\n2. اضغط زر "ربط تلغرام"\n3. أرسل الكود الظاهر لك إلى هذا البوت`);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[Telegram Webhook] Error:", err);
      res.json({ ok: true }); // Always return 200 to Telegram
    }
  });

  // REST API for Mobile App
  const { default: restApiRouter } = await import("../restApi");
  app.use("/api", restApiRouter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    const runFollowup = () => {
      import("./legalReviewFollowupScheduler")
        .then((m) => m.scheduleLegalReviewFollowupReminders())
        .catch((err) => console.error("[LegalReviewFollowup]", err));
    };
    setTimeout(runFollowup, 60_000);
    setInterval(runFollowup, 60 * 60 * 1000);
    const runAppointmentReminders = () => {
      import("./appointmentReminderScheduler")
        .then((m) => m.scheduleAppointmentReminders())
        .catch((err) => console.error("[AppointmentReminders]", err));
    };
    setTimeout(runAppointmentReminders, 90_000);
    setInterval(runAppointmentReminders, 15 * 60 * 1000);
    const runCorrespondenceDeadlines = () => {
      import("./correspondenceDeadlineScheduler")
        .then((m) => m.scheduleCorrespondenceDeadlineReminders())
        .catch((err) => console.error("[CorrespondenceDeadlines]", err));
    };
    setTimeout(runCorrespondenceDeadlines, 120_000);
    setInterval(runCorrespondenceDeadlines, 60 * 60 * 1000);
  });
}

startServer().catch(console.error);
