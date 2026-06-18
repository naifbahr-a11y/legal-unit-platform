import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  userId: number;
  username: string;
  role: string;
  tokenVersion: number;
};

const SESSION_DAYS = 30;

class SDKServer {
  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(userId: number, username: string, role: string, tokenVersion = 0): Promise<string> {
    const secretKey = this.getSessionSecret();
    const expirationSeconds = Math.floor((Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000) / 1000);

    return new SignJWT({ userId, username, role, tokenVersion })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  getSessionMaxAgeMs() {
    return SESSION_DAYS * 24 * 60 * 60 * 1000;
  }

  async verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
    if (!cookieValue) return null;

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, { algorithms: ["HS256"] });
      const { userId, username, role, tokenVersion } = payload as Record<string, unknown>;

      if (!userId || !username) return null;

      return {
        userId: userId as number,
        username: username as string,
        role: (role as string) ?? "user",
        tokenVersion: typeof tokenVersion === "number" ? tokenVersion : 0,
      };
    } catch {
      return null;
    }
  }

  private async resolveUser(session: SessionPayload): Promise<User | null> {
    const user = await db.getUserById(session.userId);
    if (!user) return null;
    if (Number(user.active) === 0) return null;
    const currentVersion = Number(user.tokenVersion ?? 0);
    if (currentVersion !== session.tokenVersion) return null;
    return user;
  }

  async authenticateRequest(req: any): Promise<User | null> {
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const session = await this.verifySession(token);
      if (session) {
        return this.resolveUser(session);
      }
    }

    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;

    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;

    const session = await this.verifySession(token);
    if (!session) return null;

    return this.resolveUser(session);
  }
}

export const sdk = new SDKServer();
