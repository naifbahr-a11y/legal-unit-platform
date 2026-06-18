import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { verifyPassword } from "./password";
import { checkLoginRateLimit, getClientIp, recordFailedLogin, resetLoginRateLimit } from "./rateLimit";

export async function authenticateLocalUser(
  req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  username: string,
  password: string,
) {
  const ip = getClientIp(req);
  const rate = checkLoginRateLimit(ip, username);
  if (!rate.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `محاولات كثيرة. حاول بعد ${rate.retryAfterSec} ثانية`,
    });
  }

  let user = await db.getUserByUsername(username);
  if (!user) {
    const database = await db.getDb();
    if (!database) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "تعذّر الاتصال بقاعدة البيانات. تأكد من تشغيل MySQL ثم أعد المحاولة",
      });
    }
    recordFailedLogin(ip, username);
    throw new TRPCError({ code: "UNAUTHORIZED", message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }

  if (Number(user.active) === 0) {
    recordFailedLogin(ip, username);
    throw new TRPCError({ code: "FORBIDDEN", message: "الحساب معطّل. تواصل مع المدير أو الإداري." });
  }

  const result = await verifyPassword(password, user.password);
  if (!result.valid) {
    recordFailedLogin(ip, username);
    throw new TRPCError({ code: "UNAUTHORIZED", message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }

  if (result.needsRehash) {
    await db.updateUserPassword(user.id, password, { bumpToken: false });
    user = (await db.getUserById(user.id)) ?? user;
  }

  resetLoginRateLimit(ip, username);
  return user;
}

export class LoginError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = "UNAUTHORIZED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function authenticateLocalUserRest(
  req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  username: string,
  password: string,
) {
  try {
    return await authenticateLocalUser(req, username, password);
  } catch (err) {
    if (err instanceof TRPCError) {
      const status = err.code === "TOO_MANY_REQUESTS" ? 429 : 401;
      throw new LoginError(err.message, status, err.code);
    }
    throw err;
  }
}
