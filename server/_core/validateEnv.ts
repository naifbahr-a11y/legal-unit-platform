import { ENV } from "./env";

const WEAK_SECRETS = new Set([
  "",
  "change_this_to_a_random_32_char_secret",
  "change_this_secret_in_production_32chars",
]);

export function validateEnvOnStartup() {
  const errors: string[] = [];

  if (!ENV.databaseUrl) {
    errors.push("DATABASE_URL is required");
  }

  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32 || WEAK_SECRETS.has(ENV.cookieSecret)) {
    if (ENV.isProduction) {
      errors.push("JWT_SECRET must be a unique random string of at least 32 characters");
    } else {
      console.warn("[Security] JWT_SECRET is missing or weak — use a strong secret in production");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }
}
