/**
 * Database adapter. Real Postgres (node-pg) when DATABASE_URL is set;
 * embedded PGlite otherwise so local dev and CI need zero external services.
 * Both expose the same `query(text, params) → { rows }` surface.
 */

import { env } from "./env.js";

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run multi-statement SQL (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function createDb(): Promise<Db> {
  if (env.databaseUrl) {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: env.databaseUrl });
    return {
      async query(text, params) {
        const res = await pool.query(text, params as never[]);
        return { rows: res.rows };
      },
      async exec(sql) {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }

  const { mkdirSync } = await import("node:fs");
  mkdirSync(env.pgliteDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = new PGlite(env.pgliteDir);
  await lite.waitReady;
  return {
    async query(text, params) {
      const res = await lite.query(text, params as never[]);
      return { rows: res.rows as never[] };
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    close: () => lite.close(),
  };
}

// ---------- row-normalization helpers (pg and PGlite differ slightly) ----------

export function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

export function csvList(v: unknown): string[] {
  // Disciplines are read via array_to_string(...) so both drivers hand us csv.
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? "").trim();
  return s.length ? s.split(",") : [];
}

export function jsonb(v: unknown): Record<string, never> {
  if (v == null) return {};
  if (typeof v === "string") return JSON.parse(v);
  return v as Record<string, never>;
}
