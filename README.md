# CompeteX

Train in real life. Fight with your stats.

CompeteX turns your actual training (runs, lifts, sparring rounds) into a six-stat
fighter (Power · Speed · Endurance · Technique · Reaction · Willpower) and puts that
fighter into deterministic 2D battles against other people's stats. Practice against
the CPU bot, or climb the ELO ladder in quick/ranked matches. The client simulates the
fight at 60Hz; the server replays it from your recorded inputs and rejects anything
whose rolling hash doesn't match byte-for-byte.

## Layout

| Path | What |
|---|---|
| `apps/mobile` | Expo SDK 54 + expo-router client (five tabs: me · train · battle · feed · ranks) |
| `apps/api` | Fastify gateway: eight `/v1` route groups (auth, me, workouts, stats, battle, feed, ranks, tribes) plus `/v1/health`, Swagger at `/docs` |
| `packages/battle-engine` | Deterministic fighter resolver v0.4, same code on client and server |
| `packages/avatar-engine` | Landmarks/seed → 2D Inkline rig (4 tonal variants), SVG out |
| `packages/shared` | Zod schemas, enums, stat engine, discipline mixer, seeded RNG + rolling hash |
| `infra/db` | Postgres 16 (+optional TimescaleDB) schema and idempotent seed |
| `scripts` | `db-apply.mjs` (migrations via node-pg, no psql) · `smoke.mjs` (full-surface e2e) |

## Quick start (zero external services)

Requires Node ≥ 20 and pnpm. With no `DATABASE_URL` set, the API and scripts run on an
embedded PGlite database persisted under `.data/pglite`. No Docker needed.

```sh
pnpm install
pnpm build          # tsc project references across all packages
pnpm db:reset       # apply schema + seed (creates the CPU bot)
pnpm dev            # API on http://localhost:4000, swagger at /docs
```

In a second terminal:

```sh
cd apps/mobile
npx expo start      # scan the QR with Expo Go; API URL auto-derives from the dev host
```

Sign in with any E.164 phone number. Phone sign-in is a dev-only shortcut: there is no OTP
or any other verification yet, so the number alone is the account. Do not deploy this
auth flow as is.

With `NODE_ENV=production` the API refuses to start without `JWT_SECRET`, and CORS only
allows the web origins listed in `CORS_ORIGINS` (the mobile app doesn't need CORS).

## Real Postgres (optional)

```sh
docker compose up -d                # timescale/timescaledb pg16
export DATABASE_URL=postgres://competex:competex@localhost:5432/competex
pnpm db:reset && pnpm dev
```

The migration enables the TimescaleDB hypertable when the extension exists and degrades
gracefully to a plain table when it doesn't (PGlite, vanilla Postgres).

## Verification

```sh
pnpm test    # 17 vitest cases: battle-engine determinism/tamper/tick budget (6), shared
             # RNG, stats, ELO and move mixing (8), avatar engine (3). The API and mobile
             # packages have no unit tests yet.
pnpm smoke   # 25 checks: boots the API on a fresh DB and walks the /v1 surface end to end,
             # including a real engine replay with hash validation, a tampered replay
             # rejection, and an ELO (K=24) movement check
```

## How a fight works

1. `POST /v1/battle/find`: the server picks an opponent in a ±250 ELO band (CPU bot for
   practice/empty ladders), freezes both fighters' stat vectors + disciplines into the
   match row, and returns a shared seed.
2. The client steps `@cx/battle-engine` at 60Hz in a rAF loop (you fight, a seeded
   deterministic bot drives the opponent), recording every input frame for both corners.
3. `POST /v1/battle/submit` with the inputs and the final rolling hash. The server
   replays the same engine with the same seed and `MATCH_RULES` (3 × 600 ticks) and
   rejects on hash mismatch (422).
4. On accept: round winners, box score, and ELO delta (K=24, rated kinds only).

Engine determinism rules (see the header of `packages/battle-engine/src/engine.ts`): no `Math.random`
(mulberry32 from the match seed), no `Date.now` (the tick counter is the clock), no
floats persisted across ticks (stamina is integer tenths).

## Environment

See `.env.example`. Defaults are dev-friendly: PGlite storage, a dev JWT secret,
15-minute access tokens with rotating refresh tokens.

## License

MIT. See [LICENSE](LICENSE).
