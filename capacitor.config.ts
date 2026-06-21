import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "iq.rafidain.legalunit",
  appName: "الوحدة القانونية",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
        androidScheme: serverUrl.startsWith("https://") ? "https" : "http",
      }
    : undefined,
  android: {
    allowMixedContent: true,
  },
};

export default config;
