import { ENV } from "./_core/env";
import { getDb } from "./db";
import { users, cases } from "../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";

const TELEGRAM_API = `https://api.telegram.org/bot${ENV.telegramBotToken}`;

// ─── Core API helpers ───────────────────────────────────────────────────────

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  if (!ENV.telegramBotToken) {
    console.warn("[Telegram] Bot token not configured");
    return false;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) console.error("[Telegram] sendMessage failed:", data.description);
    return data.ok;
  } catch (err) {
    console.error("[Telegram] sendMessage error:", err);
    return false;
  }
}

export async function getBotInfo(): Promise<{ ok: boolean; username?: string }> {
  if (!ENV.telegramBotToken) return { ok: false };
  try {
    const res = await fetch(`${TELEGRAM_API}/getMe`);
    const data = await res.json() as { ok: boolean; result?: { username: string } };
    return { ok: data.ok, username: data.result?.username };
  } catch {
    return { ok: false };
  }
}

export async function setWebhook(webhookUrl: string): Promise<boolean> {
  if (!ENV.telegramBotToken) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json() as { ok: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

// ─── Link code helpers ───────────────────────────────────────────────────────

/** Generate a random 6-digit link code and save it to the user record */
export async function generateLinkCode(userId: number): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const db = await getDb();
  if (!db) return code;
  await db.update(users)
    .set({ telegramLinkCode: code })
    .where(eq(users.id, userId));
  return code;
}

/** When the bot receives /start <code>, link the chat to the user */
export async function linkTelegramAccount(linkCode: string, chatId: string): Promise<{ success: boolean; displayName?: string }> {
  const db = await getDb();
  if (!db) return { success: false };
  const [user] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.telegramLinkCode, linkCode))
    .limit(1);

  if (!user) return { success: false };

  await db.update(users)
    .set({ telegramChatId: chatId, telegramLinkCode: null })
    .where(eq(users.id, user.id));

  return { success: true, displayName: user.displayName };
}

// ─── Notification helpers ────────────────────────────────────────────────────

/** Send a Telegram alert to a specific user by their userId */
export async function notifyUserByTelegram(userId: number, message: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [user] = await db
    .select({ telegramChatId: users.telegramChatId })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.telegramChatId)))
    .limit(1);

  if (!user?.telegramChatId) return false;
  return sendTelegramMessage(user.telegramChatId, message);
}

/** Send a Telegram alert to a specific user by their displayName */
export async function notifyUserByName(displayName: string, message: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [user] = await db
    .select({ telegramChatId: users.telegramChatId })
    .from(users)
    .where(and(eq(users.displayName, displayName), isNotNull(users.telegramChatId)))
    .limit(1);

  if (!user?.telegramChatId) return false;
  return sendTelegramMessage(user.telegramChatId, message);
}

/** Check for expiring/overdue cases and send Telegram notifications to assigned employees */
export async function checkAndNotifyExpiringCases(): Promise<{ notified: number }> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = sevenDaysLater.toISOString().split("T")[0];

  const db = await getDb();
  if (!db) return { notified: 0 };
  const allCases = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      subject: cases.subject,
      employee: cases.employee,
      expiry: cases.expiry,
      caseStatus: cases.caseStatus,
    })
    .from(cases)
    .where(isNotNull(cases.expiry));

  let notified = 0;

  for (const c of allCases) {
    if (!c.expiry || !c.employee) continue;
    if (c.caseStatus === "محسومة" || c.caseStatus === "مؤرشفة") continue;

    const expiryDate = c.expiry.substring(0, 10);
    let message: string | null = null;

    if (expiryDate < todayStr) {
      message = `⚠️ <b>تنبيه: قضية منتهية الصلاحية</b>\n\nالقضية رقم: <b>${c.caseNumber || c.id}</b>\nالموضوع: ${c.subject || "—"}\nتاريخ الانتهاء: ${c.expiry}\n\nيرجى اتخاذ الإجراء اللازم فوراً.`;
    } else if (expiryDate <= sevenDaysStr) {
      message = `🔔 <b>تذكير: قضية تقترب من الانتهاء</b>\n\nالقضية رقم: <b>${c.caseNumber || c.id}</b>\nالموضوع: ${c.subject || "—"}\nتاريخ الانتهاء: ${c.expiry}\n\nتبقى أقل من 7 أيام.`;
    }

    if (message) {
      const sent = await notifyUserByName(c.employee, message);
      if (sent) notified++;
    }
  }

  return { notified };
}
