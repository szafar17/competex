import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  databaseUrl: process.env.DATABASE_URL,
  /** PGlite fallback data dir (used when DATABASE_URL is unset). */
  pgliteDir: process.env.PGLITE_DIR ?? path.resolve(here, "../../../.data/pglite"),
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
} as const;
