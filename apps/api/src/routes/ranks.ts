import type { FastifyInstance } from "fastify";

const RANK_SELECT = `
  SELECT r.user_id, u.handle, r.rating, r.wins, r.losses
    FROM user_ratings r JOIN users u ON u.id = r.user_id
   WHERE NOT u.is_bot`;

function toRows(rows: Record<string, unknown>[], offset = 0) {
  return rows.map((r, i) => ({
    rank: offset + i + 1,
    userId: r.user_id,
    handle: (r.handle as string | null) ?? null,
    rating: Number(r.rating),
    wins: Number(r.wins),
    losses: Number(r.losses),
  }));
}

export async function ranksRoutes(app: FastifyInstance): Promise<void> {
  app.get("/global", async () => {
    const { rows } = await app.db.query(`${RANK_SELECT} ORDER BY r.rating DESC, r.wins DESC LIMIT 50`);
    return { rows: toRows(rows) };
  });

  app.get("/friends", async (req) => {
    const userId = req.user.sub;
    const { rows } = await app.db.query(
      `${RANK_SELECT} AND (r.user_id = $1 OR r.user_id IN (SELECT followee_id FROM friendships WHERE follower_id = $1))
       ORDER BY r.rating DESC LIMIT 50`,
      [userId],
    );
    return { rows: toRows(rows) };
  });

  app.get("/me", async (req) => {
    const userId = req.user.sub;
    const { rows } = await app.db.query(
      `SELECT r.user_id, u.handle, r.rating, r.wins, r.losses,
              (SELECT count(*) + 1 FROM user_ratings r2 JOIN users u2 ON u2.id = r2.user_id
                WHERE NOT u2.is_bot AND r2.rating > r.rating) AS rank
         FROM user_ratings r JOIN users u ON u.id = r.user_id
        WHERE r.user_id = $1`,
      [userId],
    );
    const me = rows[0];
    if (!me) return { row: null };
    return {
      row: {
        rank: Number(me.rank),
        userId: me.user_id,
        handle: (me.handle as string | null) ?? null,
        rating: Number(me.rating),
        wins: Number(me.wins),
        losses: Number(me.losses),
      },
    };
  });
}
