import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [count] = await conn.query("SELECT COUNT(*) AS c FROM __drizzle_migrations");
console.log("migrations_recorded", count[0].c);

const checks = [
  ["correspondence_auto_numbering", "SHOW TABLES LIKE 'correspondence_auto_numbering'"],
  ["correspondence_entities", "SHOW TABLES LIKE 'correspondence_entities'"],
  ["correspondence_outbox_numbering", "SHOW TABLES LIKE 'correspondence_outbox_numbering'"],
  ["appointments.reminderSent", "SHOW COLUMNS FROM appointments LIKE 'reminderSent'"],
  ["general_files.fileCategory", "SHOW COLUMNS FROM general_files LIKE 'fileCategory'"],
];

for (const [name, sql] of checks) {
  const [r] = await conn.query(sql);
  console.log(name, r.length > 0 ? "ok" : "MISSING");
}

const [uploadedByCol] = await conn.query("SHOW COLUMNS FROM case_attachments WHERE Field = 'uploadedBy'");
console.log(
  "case_attachments.uploadedBy_nullable",
  uploadedByCol[0]?.Null === "YES" ? "ok" : `NO (Null=${uploadedByCol[0]?.Null})`,
);

const [fks] = await conn.query(
  "SELECT CONSTRAINT_NAME, TABLE_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME LIKE 'fk_%' ORDER BY TABLE_NAME",
);
console.log("foreign_keys", fks.map((r) => `${r.CONSTRAINT_NAME}@${r.TABLE_NAME}`).join(", "));

await conn.end();
