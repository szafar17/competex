#!/usr/bin/env node
/**
 * End-to-end smoke: boots the API against a fresh database and walks the
 * entire /v1 surface — auth (single-step phone sign-in), profile, workouts + streaks,
 * stats, a real engine-simulated battle with hash-validated replay (plus a
 * tamper rejection), ELO movement on a rated match, feed, ranks, tribes.
 *
 *   pnpm smoke
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBattle, createBot } from "@cx/battle-engine";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4123;
const BASE = `http://127.0.0.1:${PORT}`;
const PHONE = "+15550001111";

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let accessToken = "";
async function api(method, url, body, { auth = true, raw = false } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (raw) return { status: res.status, json };
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Simulate a fight exactly like the mobile client: step the engine at "60Hz",
 *  bots drive both corners, record every input frame. */
function simulateClientFight(find) {
  const config = {
    seed: find.seed,
    a: { stats: find.you.stats, disciplines: find.you.disciplines },
    b: { stats: find.opponent.stats, disciplines: find.opponent.disciplines },
    rules: find.rules,
  };
  const battle = createBattle(config);
  const botA = createBot(find.seed, "a");
  const botB = createBot(find.seed, "b");
  const inputs = { a: [0], b: [0] };
  let res = battle.step(0, 0);
  while (!res.done) {
    const ia = botA(res.a, res.b, res.tick);
    const ib = botB(res.b, res.a, res.tick);
    inputs.a.push(ia);
    inputs.b.push(ib);
    res = battle.step(ia, ib);
  }
  return { inputs, result: battle.result() };
}

console.log("[smoke] resetting database…");
const resetRes = spawnSync("node", [path.join(root, "scripts/db-apply.mjs"), "--reset"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (resetRes.status !== 0) {
  console.error("[smoke] db reset failed");
  process.exit(1);
}

console.log("[smoke] booting API…");
let childOut = "";
const child = spawn("node", [path.join(root, "apps/api/dist/index.js")], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
});
child.stdout.on("data", (d) => (childOut += d.toString()));
child.stderr.on("data", (d) => (childOut += d.toString()));

async function waitFor(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

try {
  await waitFor(() => fetch(`${BASE}/v1/health`).then((r) => (r.ok ? r.json() : null)), "API health");
  console.log("\n[smoke] health + docs");
  check("GET /v1/health", true);
  const docs = await fetch(`${BASE}/docs`, { redirect: "follow" });
  check("GET /docs (swagger ui)", docs.ok);
  const noAuth = await fetch(`${BASE}/v1/me`);
  check("protected route rejects anonymous", noAuth.status === 401);

  console.log("\n[smoke] auth: single-step phone sign-in");
  const tokens = await api("POST", "/v1/auth/phone/start", { phone: PHONE }, { auth: false });
  accessToken = tokens.accessToken;
  check("sign-in issues access+refresh tokens", Boolean(tokens.accessToken && tokens.refreshToken));
  const again = await api("POST", "/v1/auth/phone/start", { phone: PHONE }, { auth: false });
  check("same phone signs into the same account", again.user.id === tokens.user.id);

  const rotated = await api("POST", "/v1/auth/refresh", { refreshToken: tokens.refreshToken }, { auth: false });
  check("refresh rotates tokens", Boolean(rotated.refreshToken) && rotated.refreshToken !== tokens.refreshToken);
  const reuse = await api("POST", "/v1/auth/refresh", { refreshToken: tokens.refreshToken }, { auth: false, raw: true });
  check("reusing a rotated refresh token fails", reuse.status === 401);
  accessToken = rotated.accessToken;

  console.log("\n[smoke] profile");
  const me1 = await api("PATCH", "/v1/me", {
    handle: "smoke_fighter",
    displayName: "Smoke Fighter",
    disciplines: ["boxing", "muay_thai"],
    avatarVariant: "inkline",
  });
  check("PATCH /v1/me sets handle + disciplines", me1.user.handle === "smoke_fighter" && me1.user.disciplines.length === 2);
  await api("PUT", "/v1/me/body", { heightCm: 180, weightKg: 78 });
  const me2 = await api("GET", "/v1/me");
  check("GET /v1/me returns body + avatar svg", me2.body?.heightCm === 180 && String(me2.avatarSvg).startsWith("<svg"));

  console.log("\n[smoke] workouts + stats");
  const w1 = await api("POST", "/v1/workouts", {
    kind: "sparring",
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    durationMin: 45,
    intensity: 8,
  });
  check("POST /v1/workouts advances streak", w1.streak.current >= 1);
  const baselineReaction = w1.stats.reaction;
  await api("POST", "/v1/workouts", {
    kind: "strength",
    startedAt: new Date(Date.now() - 1_800_000).toISOString(),
    durationMin: 60,
    intensity: 7,
  });
  const stats = await api("GET", "/v1/stats");
  check("stats moved off the rookie default", stats.stats.power > 20 && baselineReaction > 20);
  const history = await api("GET", "/v1/stats/history");
  check("stat history has today's snapshot", history.days.length >= 1);
  const workouts = await api("GET", "/v1/workouts");
  check("GET /v1/workouts lists both sessions", workouts.workouts.length === 2);

  console.log("\n[smoke] battle: practice match vs CPU bot (hash-validated replay)");
  const find1 = await api("POST", "/v1/battle/find", { kind: "practice" });
  check("find returns bot opponent + seed + rules", find1.opponent.isBot && find1.seed > 0 && find1.rules.ticksPerRound === 600);
  const fight1 = simulateClientFight(find1);
  check("client sim finishes with a rolling hash", fight1.result.hash > 0);
  const submit1 = await api("POST", "/v1/battle/submit", {
    matchId: find1.matchId,
    inputs: fight1.inputs,
    hash: fight1.result.hash,
  });
  check("server replay accepts matching hash", submit1.accepted === true);
  check("practice match moves no ELO", submit1.eloDelta === 0);
  check("box score + rounds present", Array.isArray(submit1.rounds) && submit1.boxScore.hits.a >= 0);

  console.log("\n[smoke] battle: tampered replay is rejected");
  const find2 = await api("POST", "/v1/battle/find", { kind: "practice" });
  const fight2 = simulateClientFight(find2);
  const tampered = await api(
    "POST",
    "/v1/battle/submit",
    { matchId: find2.matchId, inputs: fight2.inputs, hash: (fight2.result.hash ^ 0xdead) >>> 0 },
    { raw: true },
  );
  check("hash mismatch → 422 rejected", tampered.status === 422);

  console.log("\n[smoke] battle: rated quick match moves ELO");
  const ratingBefore = (await api("GET", "/v1/ranks/me")).row.rating;
  const find3 = await api("POST", "/v1/battle/find", { kind: "quick" });
  const fight3 = simulateClientFight(find3);
  const submit3 = await api("POST", "/v1/battle/submit", {
    matchId: find3.matchId,
    inputs: fight3.inputs,
    hash: fight3.result.hash,
  });
  const ratingAfter = (await api("GET", "/v1/ranks/me")).row.rating;
  check(
    "ELO applied (K=24) and consistent",
    ratingAfter === ratingBefore + submit3.eloDelta && (submit3.winner === "draw" || submit3.eloDelta !== 0),
    `before=${ratingBefore} after=${ratingAfter} delta=${submit3.eloDelta} winner=${submit3.winner}`,
  );
  const recent = await api("GET", "/v1/battle/recent");
  check("GET /v1/battle/recent lists matches", recent.matches.length >= 3);

  console.log("\n[smoke] feed");
  const post = await api("POST", "/v1/feed", { kind: "text", body: "Just smoked the smoke test 💨" });
  await api("POST", `/v1/feed/${post.id}/react`, { emoji: "fire" });
  await api("POST", `/v1/feed/${post.id}/comment`, { body: "respect" });
  await api("POST", `/v1/feed/follow/${find1.opponent.userId}`);
  const feed = await api("GET", "/v1/feed");
  const mine = feed.posts.find((p) => p.id === post.id);
  check("feed shows post with reaction + comment", mine?.reactions?.fire === 1 && mine?.commentCount === 1);

  console.log("\n[smoke] ranks");
  const global = await api("GET", "/v1/ranks/global");
  check("global ladder includes me, excludes bots", global.rows.some((r) => r.handle === "smoke_fighter") && !global.rows.some((r) => r.handle === "cpu_bot"));
  const friends = await api("GET", "/v1/ranks/friends");
  check("friends ladder responds", Array.isArray(friends.rows) && friends.rows.length >= 1);

  console.log("\n[smoke] tribes");
  const tribe = await api("POST", "/v1/tribes", { name: "Smoke Clan", motto: "No flake, all flame" });
  await api("POST", `/v1/tribes/${tribe.id}/join`);
  const tribes = await api("GET", "/v1/tribes");
  check("tribe created + listed with members", tribes.tribes.some((t) => t.id === tribe.id && t.memberCount >= 1));
} catch (err) {
  failed++;
  console.error(`\n[smoke] FATAL: ${err.message}`);
  console.error(childOut.split("\n").slice(-30).join("\n"));
} finally {
  child.kill("SIGTERM");
}

console.log(`\n[smoke] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
