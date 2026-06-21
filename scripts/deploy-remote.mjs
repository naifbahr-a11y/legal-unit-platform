/**
 * Deploy legal-unit-platform to a remote Ubuntu server via SSH.
 * Usage: node scripts/deploy-remote.mjs
 * Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PASSWORD (or DEPLOY_KEY_PATH)
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
const REMOTE_DIR = process.env.DEPLOY_REMOTE_DIR || "/opt/legal-unit-platform";
const ARCHIVE = path.join(root, ".deploy-bundle.tar.gz");
const CREDS_PATH = path.join(root, ".deploy-credentials.local.txt");

function randomHex(bytes) {
  return execSync(`node -e "console.log(require('crypto').randomBytes(${bytes}).toString('hex'))"`, {
    encoding: "utf8",
  }).trim();
}

function randomBase64Url(bytes) {
  return execSync(`node -e "console.log(require('crypto').randomBytes(${bytes}).toString('base64url'))"`, {
    encoding: "utf8",
  }).trim();
}

function parseCredsFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(JWT_SECRET|MYSQL_ROOT_PASSWORD|MYSQL_PASSWORD)=(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function loadLocalCreds() {
  if (!fs.existsSync(CREDS_PATH)) return {};
  return parseCredsFile(fs.readFileSync(CREDS_PATH, "utf8"));
}

async function loadRemoteCreds(conn) {
  const { code, stdout } = await run(
    conn,
    `grep -E '^(JWT_SECRET|MYSQL_ROOT_PASSWORD|MYSQL_PASSWORD)=' ${REMOTE_DIR}/.env 2>/dev/null || true`,
    { ignoreError: true },
  );
  if (code !== 0 && !stdout) return {};
  return parseCredsFile(stdout);
}

let JWT_SECRET =
  process.env.DEPLOY_JWT_SECRET ||
  loadLocalCreds().JWT_SECRET ||
  randomHex(32);

let MYSQL_ROOT_PASSWORD =
  process.env.DEPLOY_MYSQL_ROOT_PASSWORD ||
  loadLocalCreds().MYSQL_ROOT_PASSWORD ||
  randomBase64Url(16);

let MYSQL_PASSWORD =
  process.env.DEPLOY_MYSQL_PASSWORD ||
  loadLocalCreds().MYSQL_PASSWORD ||
  randomBase64Url(16);

function run(conn, cmd, opts = {}) {
  const { sudo = false, ignoreError = false } = opts;
  const full = sudo ? `sudo -n bash -lc ${JSON.stringify(cmd)}` : cmd;
  return new Promise((resolve, reject) => {
    conn.exec(full, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream
        .on("close", (code) => {
          if (code !== 0 && !ignoreError) {
            reject(new Error(`Command failed (${code}): ${full}\n${stderr || stdout}`));
          } else {
            resolve({ code, stdout, stderr });
          }
        })
        .on("data", (d) => {
          stdout += d.toString();
          process.stdout.write(d);
        })
        .stderr.on("data", (d) => {
          stderr += d.toString();
          process.stderr.write(d);
        });
    });
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("error", reject)
      .connect({
        host: HOST,
        port: 22,
        username: USER,
        password: PASSWORD || undefined,
        readyTimeout: 30000,
      });
  });
}

function upload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const read = fs.createReadStream(localPath);
      const write = sftp.createWriteStream(remotePath);
      read.on("error", reject);
      write.on("error", reject);
      write.on("close", resolve);
      read.pipe(write);
    });
  });
}

function buildArchive() {
  if (fs.existsSync(ARCHIVE)) fs.unlinkSync(ARCHIVE);
  const excludes = [
    "node_modules",
    ".git",
    "release",
    "dist",
    ".manus-logs",
    "android/.gradle",
    "android/app/build",
    "android/build",
    ".deploy-bundle.tar.gz",
    ".env",
  ];
  const excludeArgs = excludes.flatMap((e) => ["--exclude", e]);
  execSync(
    ["tar", "-czf", ARCHIVE, ...excludeArgs, "-C", root, "."].join(" "),
    { stdio: "inherit", shell: true },
  );
  console.log(`[deploy] Archive: ${ARCHIVE} (${(fs.statSync(ARCHIVE).size / 1024 / 1024).toFixed(1)} MB)`);
}

function envFile() {
  const dbUser = "rafidain";
  const dbName = "legal_unit";
  const encodedPass = encodeURIComponent(MYSQL_PASSWORD);
  return `NODE_ENV=production
PORT=3000
APP_PORT=3000
JWT_SECRET=${JWT_SECRET}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_DATABASE=${dbName}
MYSQL_USER=${dbUser}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
DATABASE_URL=mysql://${dbUser}:${encodedPass}@db:3306/${dbName}
USE_LOCAL_STORAGE=true
VITE_APP_TITLE=منصة الوحدة القانونية - مصرف الرافدين
CORS_ORIGINS=http://${HOST}:3000,http://${HOST}
`;
}

async function main() {
  if (!PASSWORD) {
    console.error("DEPLOY_PASSWORD is required");
    process.exit(1);
  }

  console.log(`[deploy] Target: ${USER}@${HOST}:${REMOTE_DIR}`);
  buildArchive();

  const conn = await connect();
  console.log("[deploy] Connected.");

  try {
    const remoteCreds = await loadRemoteCreds(conn);
    if (!process.env.DEPLOY_JWT_SECRET && remoteCreds.JWT_SECRET) JWT_SECRET = remoteCreds.JWT_SECRET;
    if (!process.env.DEPLOY_MYSQL_ROOT_PASSWORD && remoteCreds.MYSQL_ROOT_PASSWORD) {
      MYSQL_ROOT_PASSWORD = remoteCreds.MYSQL_ROOT_PASSWORD;
    }
    if (!process.env.DEPLOY_MYSQL_PASSWORD && remoteCreds.MYSQL_PASSWORD) {
      MYSQL_PASSWORD = remoteCreds.MYSQL_PASSWORD;
    }

    const dockerCheck = await run(conn, "sudo docker --version && sudo docker compose version", { ignoreError: true });
    if (dockerCheck.code !== 0) {
      console.log("[deploy] Installing Docker...");
      await run(
        conn,
        "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker ubuntu",
        { sudo: true },
      );
    }

    await run(conn, `sudo mkdir -p ${REMOTE_DIR} && sudo chown -R ubuntu:ubuntu ${REMOTE_DIR}`, { sudo: true });
    await run(conn, `rm -rf ${REMOTE_DIR}/* ${REMOTE_DIR}/.[!.]* 2>/dev/null; true`);
    await upload(conn, ARCHIVE, `/tmp/legal-unit-deploy.tar.gz`);
    await run(conn, `tar -xzf /tmp/legal-unit-deploy.tar.gz -C ${REMOTE_DIR} && rm /tmp/legal-unit-deploy.tar.gz`);

    const remoteEnv = envFile();
    await run(
      conn,
      `cat > ${REMOTE_DIR}/.env << 'ENVEOF'\n${remoteEnv}ENVEOF`,
    );

    console.log("[deploy] Building and starting containers (may take several minutes)...");
    const compose = `cd ${REMOTE_DIR} && sudo docker compose`;
    const resetDb = process.env.DEPLOY_RESET_DB === "1";
    await run(conn, `${compose} down${resetDb ? " -v" : ""} 2>/dev/null; true`, { ignoreError: true });
    await run(conn, `${compose} up -d --build`);

    console.log("[deploy] Waiting for app health...");
    let healthy = false;
    for (let i = 0; i < 24; i++) {
      const check = await run(conn, "curl -sf http://127.0.0.1:3000/api/health", { ignoreError: true });
      if (check.code === 0) {
        healthy = true;
        break;
      }
      await run(conn, "sleep 5", { ignoreError: true });
    }
    if (!healthy) {
      await run(conn, `${compose} logs --tail=80 app`);
      throw new Error("App health check failed after 120s");
    }

    console.log("[deploy] Running setup (migrations + admin)...");
    await run(conn, `${compose} exec -T app node scripts/apply-pending-migrations.mjs`, { ignoreError: true });
    await run(conn, `${compose} exec -T app node scripts/seed-admin.mjs`, { ignoreError: true });

    const credsPath = CREDS_PATH;
    fs.writeFileSync(
      credsPath,
      `Server: http://${HOST}:3000\nSSH: ${USER}@${HOST}\nAdmin user: nayef (see setup-local.ts default password)\nJWT_SECRET=${JWT_SECRET}\nMYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}\nMYSQL_PASSWORD=${MYSQL_PASSWORD}\n`,
      "utf8",
    );

    console.log("\n[deploy] SUCCESS");
    console.log(`  URL: http://${HOST}:3000`);
    console.log(`  Credentials saved locally: ${credsPath}`);
    console.log("  Default admin: nayef / admin1987 (change after first login)");
  } finally {
    conn.end();
    if (fs.existsSync(ARCHIVE)) fs.unlinkSync(ARCHIVE);
  }
}

main().catch((err) => {
  console.error("[deploy] FAILED:", err.message);
  process.exit(1);
});
