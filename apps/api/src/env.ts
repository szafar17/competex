import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = (process.env.NODE_ENV ?? "development") !== "production";

/** Dev gets a throwaway default; production refuses to start without a real value. */
function secret(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isDev) return devDefault;
  throw new Error(`${name} must be set when NODE_ENV=production`);
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  jwtSecret: secret("JWT_SECRET", "dev-secret-change-me"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  databaseUrl: process.env.DATABASE_URL,
  /** PGlite fallback data dir (used when DATABASE_URL is unset). */
  pgliteDir: process.env.PGLITE_DIR ?? path.resolve(here, "../../../.data/pglite"),
  /** Browser origins allowed by CORS in production (comma-separated). Dev allows any origin. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  isDev,
} as const;
