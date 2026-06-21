/**
 * Upload latest source and rebuild app container (no full redeploy).
 */
import { Client } from "ssh2";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const HOST = process.env.DEPLOY_HOST || "34.142.233.15";
const USER = process.env.DEPLOY_USER || "ubuntu";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";
const REMOTE_DIR = "/opt/legal-unit-platform";
const ARCHIVE = path.join(root, ".rebuild-bundle.tar.gz");

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
  });
}

function upload(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const r = fs.createReadStream(local);
      const w = sftp.createWriteStream(remote);
      r.pipe(w);
      w.on("close", resolve);
      w.on("error", reject);
    });
  });
}

if (fs.existsSync(ARCHIVE)) fs.unlinkSync(ARCHIVE);
execSync(
  `tar -czf "${ARCHIVE}" --exclude node_modules --exclude .git --exclude dist --exclude release -C "${root}" server package.json pnpm-lock.yaml patches vite.config.ts Dockerfile docker-compose.yml scripts`,
  { stdio: "inherit", shell: true },
);

const conn = new Client();
conn.on("ready", async () => {
  try {
    await upload(conn, ARCHIVE, "/tmp/rebuild.tar.gz");
    await run(conn, `tar -xzf /tmp/rebuild.tar.gz -C ${REMOTE_DIR} && rm /tmp/rebuild.tar.gz`);
    const compose = `cd ${REMOTE_DIR} && sudo docker compose`;
    console.log("[rebuild] Building app image (no cache)...");
    await run(conn, `${compose} build --no-cache app`);
    await run(conn, `${compose} up -d app`);
    console.log("[rebuild] Waiting for health...");
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        await run(conn, "curl -sf http://127.0.0.1:3000/api/health");
        console.log("\n[rebuild] SUCCESS");
        await run(conn, `${compose} exec -T app node scripts/seed-admin.mjs`);
        conn.end();
        return;
      } catch {
        process.stdout.write(".");
      }
    }
    await run(conn, `${compose} logs --tail=40 app`);
    process.exit(1);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000 });
