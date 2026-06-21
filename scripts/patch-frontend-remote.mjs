/**
 * Upload rebuilt frontend to running container (fast patch).
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
const ARCHIVE = path.join(root, ".frontend-patch.tar.gz");

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
      const r = fs.createReadStream(local);
      const w = sftp.createWriteStream(remote);
      r.pipe(w);
      w.on("close", resolve);
      w.on("error", reject);
    });
  });
}

console.log("[frontend] Building...");
execSync("pnpm build", { cwd: root, stdio: "inherit", shell: true });

const publicDir = path.join(root, "dist/public");
if (!fs.existsSync(publicDir)) throw new Error("dist/public missing");

if (fs.existsSync(ARCHIVE)) fs.unlinkSync(ARCHIVE);
execSync(`tar -czf "${ARCHIVE}" -C "${path.join(root, "dist")}" public`, { stdio: "inherit", shell: true });

const conn = new Client();
conn.on("ready", async () => {
  await upload(conn, ARCHIVE, "/tmp/frontend-patch.tar.gz");
  await run(conn, "rm -rf /tmp/public && tar -xzf /tmp/frontend-patch.tar.gz -C /tmp && rm /tmp/frontend-patch.tar.gz");
  await run(conn, "sudo docker cp /tmp/public/. legal_unit_app:/app/dist/public/");
  await run(conn, "sudo docker restart legal_unit_app");
  console.log("[frontend] Waiting...");
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      await run(conn, "curl -sf http://127.0.0.1:3000/api/health");
      console.log("\n[frontend] DONE");
      conn.end();
      return;
    } catch {
      process.stdout.write(".");
    }
  }
  conn.end();
  process.exit(1);
});
conn.connect({ host: HOST, port: 22, username: "ubuntu", password: PASSWORD, readyTimeout: 20000 });
