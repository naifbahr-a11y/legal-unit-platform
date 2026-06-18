import type { Request, Response, NextFunction } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type AuthenticatedRequest = Request & {
  user?: User;
};

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "يجب تسجيل الدخول", code: "UNAUTHORIZED" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "خطأ في المصادقة", code: "UNAUTHORIZED" });
  }
}
