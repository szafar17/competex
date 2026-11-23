import type { FastifyInstance } from "fastify";
import { CreateWorkoutRequest } from "@cx/shared";
import { iso } from "../db.js";
import { recomputeStats, upsertSnapshot } from "../lib/users.js";

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function workoutRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (req) => {
    const userId = req.user.sub;
    const { rows } = await app.db.query(
      `SELECT id, kind, started_at, duration_min, intensity, source, notes
         FROM workouts WHERE user_id = $1 ORDER BY started_at DESC LIMIT 100`,
      [userId],
    );
    return {
      workouts: rows.map((r) => ({
        id: r.id,
        userId,
        kind: r.kind,
        startedAt: iso(r.started_at),
        durationMin: Number(r.duration_min),
        intensity: Number(r.intensity),
        source: r.source,
        notes: r.notes ?? undefined,
      })),
    };
  });

  app.post("/", async (req, reply) => {
    const userId = req.user.sub;
    const w = CreateWorkoutRequest.parse(req.body);
    const startedAt = new Date(w.startedAt);
    if (startedAt.getTime() > Date.now() + 60_000) return reply.badRequest("workout cannot start in the future");

    const inserted = await app.db.query<{ id: string }>(
      `INSERT INTO workouts (user_id, kind, started_at, duration_min, intensity, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, w.kind, startedAt.toISOString(), w.durationMin, w.intensity, w.source, w.notes ?? null],
    );

    // Advance the streak: consecutive training days grow it, a missed day resets it.
    const today = dayOf(new Date());
    const yesterday = dayOf(new Date(Date.now() - 86_400_000));
    const streakQ = await app.db.query(
      `INSERT INTO streaks (user_id, current, longest, last_day) VALUES ($1, 1, 1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         current = CASE
           WHEN streaks.last_day = $2::date THEN streaks.current
           WHEN streaks.last_day = $3::date THEN streaks.current + 1
           ELSE 1
         END,
         longest = GREATEST(streaks.longest, CASE
           WHEN streaks.last_day = $2::date THEN streaks.current
           WHEN streaks.last_day = $3::date THEN streaks.current + 1
           ELSE 1
         END),
         last_day = $2::date
       RETURNING current, longest`,
      [userId, today, yesterday],
    );

    // Recompute the six-stat vector over the 28-day window and snapshot today.
    const stats = await recomputeStats(app.db, userId);
    await upsertSnapshot(app.db, userId, stats, today);

    return {
      workout: { id: inserted.rows[0]!.id, userId, ...w, startedAt: startedAt.toISOString() },
      stats,
      streak: {
        current: Number(streakQ.rows[0]?.current ?? 1),
        longest: Number(streakQ.rows[0]?.longest ?? 1),
      },
    };
  });
}
