/**
 * Repair stuck legal-review followups after case lastActions were approved externally.
 */
import { Client } from "ssh2";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const HOST = "34.142.233.15";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(String(code)))));
    });
  });
}

function upload(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      fs.createReadStream(local).pipe(sftp.createWriteStream(remote)).on("close", resolve).on("error", reject);
    });
  });
}

const files = [
  "server/_core/legalReviewFollowupService.ts",
  "server/_core/pendingService.ts",
  "server/db.ts",
  "server/routers.ts",
];

execSync("pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --external:./vite --external:../../vite.config.ts", {
  cwd: root, stdio: "inherit", shell: true,
});

const conn = new Client();
conn.on("ready", async () => {
  for (const f of files) {
    await upload(conn, path.join(root, f), `/tmp/${path.basename(f)}`);
    await run(conn, `sudo docker cp /tmp/${path.basename(f)} legal_unit_app:/app/${f}`);
  }
  await upload(conn, path.join(root, "dist/index.js"), "/tmp/index.js");
  await run(conn, "sudo docker cp /tmp/index.js legal_unit_app:/app/dist/index.js");
  await run(conn, `sudo docker compose -f /opt/legal-unit-platform/docker-compose.yml exec -T app node -e "
import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
const c = await mysql.createConnection(url);
const [rows] = await c.execute(
  \\\`SELECT lr.id, lr.relatedCaseId, lr.createdBy, lr.assignedToId, c.lastActions
   FROM legal_reviews lr
   JOIN cases c ON c.id = lr.relatedCaseId
   WHERE lr.followupStatus IN ('awaiting_submission','rejected','pending_approval')
     AND lr.status IN ('in_review','completed')
     AND c.lastActions IS NOT NULL AND TRIM(c.lastActions) != ''\\\`
);
let n = 0;
for (const r of rows) {
  await c.execute('UPDATE legal_reviews SET followupStatus=?, followupRejectNote=NULL WHERE id=?', ['approved', r.id]);
  n++;
}
console.log('Repaired', n, 'followups');
await c.end();
"`);
  await run(conn, "sudo docker restart legal_unit_app");
  console.log("Done");
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: "ubuntu", password: PASSWORD, readyTimeout: 20000 });
