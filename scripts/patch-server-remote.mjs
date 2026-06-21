/**
 * Patch production server bundle on remote (fast fix without full docker rebuild).
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
      const r = fs.createReadStream(local);
      const w = sftp.createWriteStream(remote);
      r.pipe(w);
      w.on("close", resolve);
      w.on("error", reject);
    });
  });
}

console.log("[patch] Building server bundle...");
execSync("pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --external:./vite --external:../../vite.config.ts", {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

const bundle = path.join(root, "dist/index.js");
if (!fs.existsSync(bundle)) throw new Error("dist/index.js missing");

const conn = new Client();
conn.on("ready", async () => {
  await upload(conn, bundle, "/tmp/index.js");
  await run(conn, "sudo docker cp /tmp/index.js legal_unit_app:/app/dist/index.js");
  await run(conn, "sudo docker restart legal_unit_app");
  console.log("[patch] Waiting for health...");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      await run(conn, "curl -sf http://127.0.0.1:3000/api/health");
      await run(conn, "curl -sI http://127.0.0.1:3000/login | grep -i content-security || true");
      console.log("\n[patch] DONE");
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
