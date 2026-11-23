#!/usr/bin/env node
/**
 * Apply infra/db migrations through node-pg (no psql required).
 * Falls back to embedded PGlite when DATABASE_URL is unset.
 *
 *   node scripts/db-apply.mjs           # apply migrations
 *   node scripts/db-apply.mjs --reset   # drop everything, then apply
 */

import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlDir = path.join(root, "infra", "db");
const reset = process.argv.includes("--reset");

const files = readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();

async function main() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    if (reset) {
      console.log("[db] resetting schema public");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }
    for (const f of files) {
      console.log(`[db] applying ${f}`);
      await client.query(readFileSync(path.join(sqlDir, f), "utf8"));
    }
    await client.end();
  } else {
    const dir = process.env.PGLITE_DIR ?? path.join(root, ".data", "pglite");
    if (reset) {
      console.log(`[db] resetting PGlite dir ${path.relative(root, dir)}`);
      rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(dir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite(dir);
    await lite.waitReady;
    for (const f of files) {
      console.log(`[db] applying ${f}`);
      await lite.exec(readFileSync(path.join(sqlDir, f), "utf8"));
    }
    await lite.close();
  }
  console.log("[db] done");
}

main().catch((err) => {
  console.error("[db] failed:", err.message);
  process.exit(1);
});
