/**
 * Build Android APK (debug) with bundled server URL.
 * Usage: node scripts/build-apk.mjs
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tools = path.join(root, ".tools");
const jdkDir = path.join(tools, "jdk-17");
const sdkDir = path.join(tools, "android-sdk");
const serverUrl = process.env.CAP_SERVER_URL || "http://34.142.233.15";
const apiUrl = process.env.VITE_API_URL || serverUrl;

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true, ...opts });
}

function findJava() {
  const candidates = [
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", "java.exe"),
    path.join(jdkDir, "bin", "java.exe"),
    "C:\\Program Files\\Microsoft\\jdk-17.0.19.10-hotspot\\bin\\java.exe",
    "C:\\Program Files\\Microsoft\\jdk-17\\bin\\java.exe",
    "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.dirname(path.dirname(c));
  }
  return null;
}

function downloadFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  console.log(`[apk] Downloading ${url}`);
  run(`curl.exe -L --retry 3 --fail -o "${dest}" "${url}"`);
  const size = fs.statSync(dest).size;
  if (size < 1_000_000) {
    throw new Error(`Download too small (${size} bytes): ${dest}`);
  }
}

function ensureJdk() {
  if (findJava()) return;
  console.log("[apk] Downloading portable JDK 17...");
  fs.mkdirSync(tools, { recursive: true });
  const zip = path.join(tools, "jdk.zip");
  downloadFile(
    "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip",
    zip,
  );
  run(`powershell -NoProfile -Command "Expand-Archive -Path '${zip.replace(/\\/g, "/")}' -DestinationPath '${tools.replace(/\\/g, "/")}' -Force"`);
  fs.unlinkSync(zip);
  const extracted = fs.readdirSync(tools).find((d) => d.startsWith("jdk-17"));
  if (!extracted) throw new Error("JDK extract failed");
  if (fs.existsSync(jdkDir)) fs.rmSync(jdkDir, { recursive: true, force: true });
  fs.renameSync(path.join(tools, extracted), jdkDir);
}

function ensureAndroidSdk() {
  const sdkmanager = path.join(sdkDir, "cmdline-tools", "latest", "bin", "sdkmanager.bat");
  if (fs.existsSync(sdkmanager)) return;

  console.log("[apk] Downloading Android SDK command-line tools...");
  fs.mkdirSync(tools, { recursive: true });
  const zip = path.join(tools, "cmdline-tools.zip");
  downloadFile(
    "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip",
    zip,
  );
  fs.mkdirSync(path.join(sdkDir, "cmdline-tools"), { recursive: true });
  run(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zip.replace(/\\/g, "/")}' -DestinationPath '${path.join(sdkDir, "cmdline-tools").replace(/\\/g, "/")}' -Force"`,
  );
  fs.unlinkSync(zip);
  const inner = fs.readdirSync(path.join(sdkDir, "cmdline-tools")).find((d) => fs.existsSync(path.join(sdkDir, "cmdline-tools", d, "bin", "sdkmanager.bat")));
  if (inner && inner !== "latest") {
    fs.renameSync(path.join(sdkDir, "cmdline-tools", inner), path.join(sdkDir, "cmdline-tools", "latest"));
  }

  const env = buildEnv();
  console.log("[apk] Installing SDK packages (first run may take several minutes)...");
  run(`cmd /c "echo y | \\"${sdkmanager}\" --sdk_root=\"${sdkDir}\" platform-tools \"platforms;android-35\" \"build-tools;35.0.0\""`, { env });
}

function buildEnv() {
  const javaHome = findJava() || jdkDir;
  return {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
    CAP_SERVER_URL: serverUrl,
    VITE_API_URL: apiUrl,
    PATH: `${path.join(javaHome, "bin")};${path.join(sdkDir, "platform-tools")};${process.env.PATH || ""}`,
  };
}

function main() {
  console.log(`[apk] Server URL: ${serverUrl}`);
  ensureJdk();
  ensureAndroidSdk();

  const env = buildEnv();
  run("pnpm build:mobile", { env });
  run("pnpm cap:sync", { env });

  const gradlew = path.join(root, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
  console.log("[apk] Running Gradle assembleDebug...");
  const r = spawnSync(gradlew, ["assembleDebug"], {
    cwd: path.join(root, "android"),
    env,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);

  const apk = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  const releaseApk = path.join(root, "release", "legal-unit-app-debug.apk");
  fs.mkdirSync(path.dirname(releaseApk), { recursive: true });
  fs.copyFileSync(apk, releaseApk);
  console.log(`\n[apk] SUCCESS\n  ${releaseApk}`);
}

main();
