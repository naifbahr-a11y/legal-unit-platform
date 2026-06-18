/**
 * Applies Drizzle SQL migrations missing from __drizzle_migrations (by hash).
 * Idempotent: skips statements whose objects already exist.
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsFolder = path.join(root, "drizzle");

const IGNORABLE_ERRNO = new Set([
  1050, // table exists
  1060, // duplicate column
  1061, // duplicate key name
  1062, // duplicate entry
  121, // duplicate key on write (existing FK)
  1826, // duplicate FK name
]);

function readMigrationFiles() {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
  );
  return journal.entries.map((entry) => {
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const query = fs.readFileSync(filePath, "utf8");
    return {
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash("sha256").update(query).digest("hex"),
      statements: query
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  });
}

function isIgnorable(err) {
  if (IGNORABLE_ERRNO.has(err.errno)) return true;
  const msg = String(err.message || "");
  if (/Duplicate column/i.test(msg)) return true;
  if (/already exists/i.test(msg)) return true;
  if (/Duplicate key name/i.test(msg)) return true;
  if (/Duplicate foreign key/i.test(msg)) return true;
  if (/Duplicate entry/i.test(msg)) return true;
  if (/Duplicate key on write/i.test(msg)) return true;
  if (/errno: 121/i.test(msg)) return true;
  // 0017: column already renamed
  if (/Unknown column.*nextLegalOutNumber/i.test(msg)) return true;
  return false;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const conn = await mysql.createConnection(url);
  const migrations = readMigrationFiles();

  const [applied] = await conn.query("SELECT hash FROM __drizzle_migrations");
  const appliedHashes = new Set(applied.map((r) => r.hash));

  const pending = migrations.filter((m) => !appliedHashes.has(m.hash));
  console.log(`Total migrations: ${migrations.length}`);
  console.log(`Already applied: ${appliedHashes.size}`);
  console.log(`Pending: ${pending.length}`);

  if (pending.length === 0) {
    console.log("Nothing to apply.");
    await conn.end();
    return;
  }

  for (const migration of pending) {
    console.log(`\n=== Applying ${migration.tag} ===`);
    await conn.beginTransaction();
    try {
      for (const stmt of migration.statements) {
        try {
          await conn.query(stmt);
          console.log(`  OK: ${stmt.slice(0, 80).replace(/\s+/g, " ")}...`);
        } catch (err) {
          if (isIgnorable(err)) {
            console.log(`  SKIP (${err.errno}): ${err.message}`);
          } else {
            throw err;
          }
        }
      }
      await conn.query(
        "INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES (?, ?)",
        [migration.hash, migration.when],
      );
      await conn.commit();
      console.log(`  RECORDED hash=${migration.hash.slice(0, 12)}...`);
    } catch (err) {
      await conn.rollback();
      console.error(`FAILED on ${migration.tag}:`, err.message);
      await conn.end();
      process.exit(1);
    }
  }

  const [final] = await conn.query("SELECT COUNT(*) AS c FROM __drizzle_migrations");
  console.log(`\nDone. __drizzle_migrations count: ${final[0].c}`);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
