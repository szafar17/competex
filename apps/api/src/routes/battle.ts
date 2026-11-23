import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  BattleFindRequest,
  BattleSubmitRequest,
  ELO_K,
  eloDelta,
  MATCH_RULES,
  MATCHMAKING_BAND,
  RATED_KINDS,
  type Discipline,
  type FighterCard,
  type StatVector,
} from "@cx/shared";
import { runMatch, type Corner } from "@cx/battle-engine";
import { csvList, iso, jsonb } from "../db.js";
import { currentStats, getRating, getUser, toPublicUser, USER_COLS, type UserRow } from "../lib/users.js";

const BOT_ID = "00000000-0000-4000-8000-000000000001";

function disciplinesOf(row: UserRow): Discipline[] {
  const list = csvList(row.disciplines) as Discipline[];
  return list.length > 0 ? list : ["boxing"];
}

async function fighterCard(app: FastifyInstance, row: UserRow): Promise<FighterCard> {
  const pub = toPublicUser(row);
  const [stats, rating] = await Promise.all([currentStats(app.db, row.id), getRating(app.db, row.id)]);
  return {
    userId: row.id,
    handle: pub.handle ?? "fighter",
    displayName: pub.displayName ?? pub.handle ?? "Fighter",
    rating: rating.rating,
    stats,
    disciplines: disciplinesOf(row),
    avatarVariant: pub.avatarVariant,
    isBot: pub.isBot,
  };
}

export async function battleRoutes(app: FastifyInstance): Promise<void> {
  app.post("/find", async (req, reply) => {
    const userId = req.user.sub;
    const { kind } = BattleFindRequest.parse(req.body);
    const me = await getUser(app.db, userId);
    if (!me) return reply.notFound("user not found");

    let opponent: UserRow | null = null;
    if (kind !== "practice") {
      // ±MATCHMAKING_BAND ELO band, closest first. Empty ladders fall back to the bot.
      const myRating = (await getRating(app.db, userId)).rating;
      const { rows } = await app.db.query<UserRow>(
        `SELECT u.id, u.phone, u.handle, u.display_name,
                array_to_string(u.disciplines, ',') AS disciplines,
                u.avatar_variant, u.theme, u.tier, u.is_bot, u.created_at
           FROM user_ratings r JOIN users u ON u.id = r.user_id
          WHERE u.id <> $1 AND NOT u.is_bot AND u.handle IS NOT NULL
            AND r.rating BETWEEN $2 AND $3
          ORDER BY ABS(r.rating - $4) ASC, u.created_at DESC
          LIMIT 1`,
        [userId, myRating - MATCHMAKING_BAND, myRating + MATCHMAKING_BAND, myRating],
      );
      opponent = rows[0] ?? null;
    }
    if (!opponent) opponent = await getUser(app.db, BOT_ID);
    if (!opponent) return reply.internalServerError("matchmaking pool empty — is the seed applied?");

    const [you, opp] = await Promise.all([fighterCard(app, me), fighterCard(app, opponent)]);
    const seed = randomInt(1, 2_147_483_647);
    const config = {
      a: { stats: you.stats, disciplines: you.disciplines },
      b: { stats: opp.stats, disciplines: opp.disciplines },
    };
    const { rows } = await app.db.query<{ id: string }>(
      `INSERT INTO matches (kind, a_user_id, b_user_id, seed, config)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [kind, userId, opponent.id, seed, JSON.stringify(config)],
    );

    return {
      matchId: rows[0]!.id,
      kind,
      seed,
      rules: MATCH_RULES,
      you,
      opponent: opp,
    };
  });

  app.post("/submit", async (req, reply) => {
    const userId = req.user.sub;
    const payload = BattleSubmitRequest.parse(req.body);

    const matchQ = await app.db.query(
      `SELECT id, kind, a_user_id, b_user_id, seed, config, status FROM matches WHERE id = $1`,
      [payload.matchId],
    );
    const match = matchQ.rows[0];
    if (!match) return reply.notFound("match not found");
    if (match.a_user_id !== userId) return reply.forbidden("not your match");
    if (match.status !== "pending") return reply.conflict(`match already ${match.status}`);

    const cfg = jsonb(match.config) as unknown as {
      a: { stats: StatVector; disciplines: Discipline[] };
      b: { stats: StatVector; disciplines: Discipline[] };
    };

    // Replay the fight server-side with the frozen config and the same seed.
    const replay = runMatch({ seed: Number(match.seed), a: cfg.a, b: cfg.b, rules: MATCH_RULES }, payload.inputs);

    if (replay.hash !== payload.hash) {
      await app.db.query(`UPDATE matches SET status = 'rejected', resolved_at = now() WHERE id = $1`, [match.id]);
      return reply.unprocessableEntity("replay hash mismatch — result rejected");
    }

    // ELO for rated kinds (K=24). Practice never moves ratings.
    const kind = String(match.kind) as (typeof RATED_KINDS)[number] | "practice";
    let myDelta = 0;
    let newRating = (await getRating(app.db, userId)).rating;
    if (RATED_KINDS.includes(kind as never)) {
      const oppId = String(match.b_user_id);
      const [mine, theirs] = await Promise.all([getRating(app.db, userId), getRating(app.db, oppId)]);
      const score: 0 | 0.5 | 1 = replay.winner === "a" ? 1 : replay.winner === "b" ? 0 : 0.5;
      myDelta = eloDelta(mine.rating, theirs.rating, score, ELO_K);
      const theirDelta = eloDelta(theirs.rating, mine.rating, (1 - score) as 0 | 0.5 | 1, ELO_K);
      newRating = mine.rating + myDelta;
      const col = (w: Corner | "draw", c: Corner) => (w === "draw" ? "draws" : w === c ? "wins" : "losses");
      await app.db.query(
        `UPDATE user_ratings SET rating = $2, ${col(replay.winner, "a")} = ${col(replay.winner, "a")} + 1, updated_at = now() WHERE user_id = $1`,
        [userId, newRating],
      );
      await app.db.query(
        `UPDATE user_ratings SET rating = $2, ${col(replay.winner, "b")} = ${col(replay.winner, "b")} + 1, updated_at = now() WHERE user_id = $1`,
        [oppId, theirs.rating + theirDelta],
      );
    }

    const rounds = replay.rounds.map((r) => ({ winner: r.winner, aHp: r.aHp, bHp: r.bHp }));
    await app.db.query(
      `UPDATE matches SET status = 'resolved', winner = $2, rounds = $3::jsonb, box_score = $4::jsonb,
              replay_hash = $5, elo_delta_a = $6, resolved_at = now()
        WHERE id = $1`,
      [match.id, replay.winner, JSON.stringify(rounds), JSON.stringify(replay.boxScore), replay.hash, myDelta],
    );

    return {
      accepted: true as const,
      winner: replay.winner,
      rounds,
      boxScore: replay.boxScore,
      eloDelta: myDelta,
      newRating,
    };
  });

  app.get("/recent", async (req) => {
    const userId = req.user.sub;
    const { rows } = await app.db.query(
      `SELECT m.id, m.kind, m.status, m.winner, m.elo_delta_a, m.created_at,
              m.a_user_id, ua.handle AS a_handle, ub.handle AS b_handle
         FROM matches m
         JOIN users ua ON ua.id = m.a_user_id
         JOIN users ub ON ub.id = m.b_user_id
        WHERE m.a_user_id = $1 OR m.b_user_id = $1
        ORDER BY m.created_at DESC LIMIT 20`,
      [userId],
    );
    return {
      matches: rows.map((m) => {
        const iAmA = m.a_user_id === userId;
        const myCorner = iAmA ? "a" : "b";
        const result =
          m.status !== "resolved" ? "pending" : m.winner === "draw" ? "draw" : m.winner === myCorner ? "win" : "loss";
        return {
          id: m.id,
          kind: m.kind,
          opponentHandle: String(iAmA ? m.b_handle : m.a_handle) || "fighter",
          result,
          eloDelta: m.elo_delta_a == null ? null : (iAmA ? 1 : -1) * Number(m.elo_delta_a),
          playedAt: iso(m.created_at),
        };
      }),
    };
  });
}
