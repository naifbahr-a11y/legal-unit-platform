/**
 * Export staging DB for migration to institution server.
 * Usage: DATABASE_URL=mysql://... node scripts/export-staging.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "staging-export");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  if (val instanceof Date) return mysql.escape(val.toISOString().slice(0, 19).replace("T", " "));
  if (Buffer.isBuffer(val)) return mysql.escape(val.toString("base64"));
  if (typeof val === "object") return mysql.escape(JSON.stringify(val));
  return mysql.escape(val);
}

const stamp = new Date().toISOString().slice(0, 10);
fs.mkdirSync(outDir, { recursive: true });
const sqlFile = path.join(outDir, `legal_unit_${stamp}.sql`);

console.log("[export] Connecting...");
const conn = await mysql.createConnection(url);
const [tables] = await conn.query("SHOW TABLES");
const tableKey = Object.keys(tables[0] || {})[0] || `Tables_in_${url.split("/").pop()?.split("?")[0] || "legal_unit"}`;

let sql = `-- legal-unit staging export ${stamp}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

for (const row of tables) {
  const name = row[tableKey];
  console.log(`[export] Table: ${name}`);
  const [createRows] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
  sql += `DROP TABLE IF EXISTS \`${name}\`;\n${createRows[0]["Create Table"]};\n\n`;
  const [rows] = await conn.query(`SELECT * FROM \`${name}\``);
  if (rows.length) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${name}\``);
    const colNames = cols.map((c) => `\`${c.Field}\``).join(", ");
    for (const r of rows) {
      const vals = cols.map((c) => esc(r[c.Field])).join(", ");
      sql += `INSERT INTO \`${name}\` (${colNames}) VALUES (${vals});\n`;
    }
    sql += "\n";
  }
}
sql += "SET FOREIGN_KEY_CHECKS=1;\n";

fs.writeFileSync(sqlFile, sql, "utf8");
await conn.end();

const guide = `# نقل من التجريبي إلى سيرفر المؤسسة — ${stamp}

## 1) قاعدة البيانات
الملف: legal_unit_${stamp}.sql

على سيرفر المؤسسة:
  docker compose exec -T db mysql -u root -p legal_unit < legal_unit_${stamp}.sql

## 2) المرفقات (uploads)
من Railway: Service → Volume المربوط على /app/uploads
انسخ المحتوى إلى volume التطبيق على سيرفر المؤسسة.

## 3) إعدادات الإنتاج (جديدة — لا تنسخ JWT من التجريبي)
- JWT_SECRET جديد
- MYSQL_PASSWORD جديدة
- DATABASE_URL لسيرفر المؤسسة

## 4) APK للإنتاج
$env:CAP_SERVER_URL="https://legal.your-institution.iq"
pnpm build:mobile && pnpm cap:sync && pnpm android:apk
`;

fs.writeFileSync(path.join(outDir, "MIGRATE.txt"), guide, "utf8");
console.log(`\n[export] DONE\n  SQL: ${sqlFile}\n  Guide: ${path.join(outDir, "MIGRATE.txt")}`);
