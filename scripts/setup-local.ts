import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { hashPassword } from "../server/_core/password";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || "nayef";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin1987";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "نايف - المدير";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const connection = await mysql.createConnection(url);
  const db = drizzle(connection);

  console.log("[setup] Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[setup] Migrations complete");

  const existing = await db.select().from(users).where(eq(users.username, ADMIN_USERNAME)).limit(1);
  const hashed = await hashPassword(ADMIN_PASSWORD);

  if (existing.length === 0) {
    await db.insert(users).values({
      openId: `local_${ADMIN_USERNAME}`,
      username: ADMIN_USERNAME,
      password: hashed,
      displayName: ADMIN_NAME,
      name: ADMIN_NAME,
      role: "admin",
      loginMethod: "local",
    });
    console.log(`[setup] Created admin user: ${ADMIN_USERNAME}`);
  } else {
    await db.update(users).set({ password: hashed, displayName: ADMIN_NAME, role: "admin" }).where(eq(users.id, existing[0].id));
    console.log(`[setup] Updated admin user: ${ADMIN_USERNAME}`);
  }

  await connection.end();
  console.log("[setup] Done");
}

main().catch((err) => {
  console.error("[setup] Failed:", err);
  process.exit(1);
});
