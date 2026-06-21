/**
 * Create legal-unit-platform.zip ready for server upload (Docker deploy).
 * Usage: node scripts/package-deploy-zip.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const desktop = path.join(process.env.USERPROFILE || process.env.HOME || root, "Desktop");
const outZip = path.join(desktop, "legal-unit-platform.zip");
const stagingDir = path.join(root, ".deploy-zip-staging");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".deploy-zip-staging",
  "release",
  "staging-export",
  ".tools",
  "uploads",
  "coverage",
  ".manus-logs",
  "webdev",
  ".pnpm-store",
]);

const EXCLUDE_FILES = new Set([
  ".env",
  ".deploy-credentials.local.txt",
  ".deploy-bundle.tar.gz",
  ".frontend-patch.tar.gz",
  ".rebuild-bundle.tar.gz",
  "legal-unit-platform.zip",
]);

const EXCLUDE_PREFIXES = ["android/.gradle", "android/app/build", "android/build", ".manus/"];

function shouldSkip(rel) {
  const norm = rel.replace(/\\/g, "/");
  if (EXCLUDE_FILES.has(path.basename(norm))) return true;
  const parts = norm.split("/");
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true;
  }
  for (const prefix of EXCLUDE_PREFIXES) {
    if (norm === prefix || norm.startsWith(`${prefix}/`)) return true;
  }
  if (/\.(log|tgz|tar\.gz)$/i.test(norm)) return true;
  if (norm.endsWith(".deploy-zip-staging")) return true;
  return false;
}

function copyRecursive(src, dest, base = root) {
  const rel = path.relative(base, src).replace(/\\/g, "/");
  if (shouldSkip(rel)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name), base);
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

console.log("[zip] Preparing staging folder...");
rmDir(stagingDir);
const bundleRoot = path.join(stagingDir, "legal-unit-platform");
fs.mkdirSync(bundleRoot, { recursive: true });

for (const name of fs.readdirSync(root)) {
  if (name === ".deploy-zip-staging") continue;
  copyRecursive(path.join(root, name), path.join(bundleRoot, name));
}

const fileCount = execSync(`powershell -NoProfile -Command "(Get-ChildItem -Path '${bundleRoot}' -Recurse -File).Count"`, {
  encoding: "utf8",
}).trim();

console.log(`[zip] Staged ${fileCount} files`);

if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

console.log(`[zip] Creating ${outZip} ...`);
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${bundleRoot}' -DestinationPath '${outZip}' -CompressionLevel Optimal"`,
  { stdio: "inherit" },
);

const sizeMb = (fs.statSync(outZip).size / 1024 / 1024).toFixed(2);
rmDir(stagingDir);

console.log(`\n[zip] DONE: ${outZip} (${sizeMb} MB)`);
console.log("[zip] Upload to server, unzip, copy env.template to .env, then: docker compose up -d --build");
console.log("[zip] See DEPLOY-FROM-ZIP.md inside the archive for full instructions.");
