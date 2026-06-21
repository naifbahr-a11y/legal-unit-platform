/**
 * Create or update default admin user (production-safe, no tsx required).
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || "nayef";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin1987";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "نايف - المدير";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const conn = await mysql.createConnection(url);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const [rows] = await conn.execute("SELECT id FROM users WHERE username = ? LIMIT 1", [ADMIN_USERNAME]);
  if (rows.length === 0) {
    await conn.execute(
      `INSERT INTO users (openId, username, password, displayName, name, role, loginMethod, active)
       VALUES (?, ?, ?, ?, ?, 'admin', 'local', 1)`,
      [`local_${ADMIN_USERNAME}`, ADMIN_USERNAME, hash, ADMIN_NAME, ADMIN_NAME],
    );
    console.log(`[seed] Created admin: ${ADMIN_USERNAME}`);
  } else {
    await conn.execute(
      "UPDATE users SET password = ?, displayName = ?, role = 'admin' WHERE id = ?",
      [hash, ADMIN_NAME, rows[0].id],
    );
    console.log(`[seed] Updated admin: ${ADMIN_USERNAME}`);
  }

  await conn.end();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
