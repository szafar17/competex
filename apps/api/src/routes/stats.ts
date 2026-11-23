import type { FastifyInstance } from "fastify";
import { STAT_KEYS, type StatVector } from "@cx/shared";
import { currentStats } from "../lib/users.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (req) => {
    const stats = await currentStats(app.db, req.user.sub);
    return { stats, asOf: new Date().toISOString() };
  });

  app.get("/history", async (req) => {
    const { rows } = await app.db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, power, speed, endurance, technique, reaction, willpower
         FROM stat_snapshots
        WHERE user_id = $1 AND day > CURRENT_DATE - 90
        ORDER BY day ASC`,
      [req.user.sub],
    );
    return {
      days: rows.map((r) => {
        const stats = {} as StatVector;
        for (const k of STAT_KEYS) stats[k] = Number(r[k]);
        return { day: String(r.day), stats };
      }),
    };
  });
}
