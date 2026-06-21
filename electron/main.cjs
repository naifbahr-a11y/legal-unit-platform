const { app, BrowserWindow, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULT_SERVER_URL = "http://localhost:3000";

function readServerUrl() {
  if (process.env.ELECTRON_SERVER_URL?.trim()) {
    return process.env.ELECTRON_SERVER_URL.trim();
  }

  const candidates = [
    path.join(path.dirname(process.execPath), "server-url.txt"),
    path.join(process.cwd(), "server-url.txt"),
    path.join(__dirname, "server-url.txt"),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const value = fs.readFileSync(filePath, "utf8").trim();
        if (value) return value;
      }
    } catch {
      /* try next */
    }
  }

  return DEFAULT_SERVER_URL;
}

function createWindow() {
  const serverUrl = readServerUrl();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "منصة الوحدة القانونية - مصرف الرافدين",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(serverUrl).catch(() => {
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html dir="rtl" lang="ar"><body style="font-family:Tahoma;padding:2rem">
        <h2>تعذّر الاتصال بالسيرفر</h2>
        <p>تحقق من عنوان السيرفر في ملف <code>server-url.txt</code> بجانب البرنامج.</p>
        <p>العنوان الحالي: <strong>${serverUrl}</strong></p>
      </body></html>
    `)}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
