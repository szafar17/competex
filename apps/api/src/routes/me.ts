import type { FastifyInstance } from "fastify";
import { PatchMeRequest, PutBodyRequest } from "@cx/shared";
import { avatarSvgForSeed } from "@cx/avatar-engine";
import { iso } from "../db.js";
import { currentStats, getRating, getUser, toPublicUser, USER_COLS, type UserRow } from "../lib/users.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (req, reply) => {
    const userId = req.user.sub;
    const user = await getUser(app.db, userId);
    if (!user) return reply.notFound("user not found");

    const [stats, rating, streakQ, bodyQ, avatarQ] = await Promise.all([
      currentStats(app.db, userId),
      getRating(app.db, userId),
      app.db.query(`SELECT current, longest FROM streaks WHERE user_id = $1`, [userId]),
      app.db.query(`SELECT height_cm, weight_kg, dob, sex FROM user_body WHERE user_id = $1`, [userId]),
      app.db.query(`SELECT svg FROM avatars WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId]),
    ]);

    const body = bodyQ.rows[0];
    return {
      user: toPublicUser(user),
      stats,
      rating,
      streak: {
        current: Number(streakQ.rows[0]?.current ?? 0),
        longest: Number(streakQ.rows[0]?.longest ?? 0),
      },
      body: body
        ? { heightCm: Number(body.height_cm), weightKg: Number(body.weight_kg), dob: body.dob ? iso(body.dob).slice(0, 10) : null, sex: body.sex ?? null }
        : null,
      avatarSvg: (avatarQ.rows[0]?.svg as string | undefined) ?? null,
    };
  });

  app.patch("/", async (req, reply) => {
    const userId = req.user.sub;
    const patch = PatchMeRequest.parse(req.body);

    if (patch.handle) {
      const clash = await app.db.query(`SELECT id FROM users WHERE handle = $1 AND id <> $2`, [patch.handle, userId]);
      if (clash.rows[0]) return reply.conflict("handle is taken");
    }

    const { rows } = await app.db.query<UserRow>(
      `UPDATE users SET
         handle = COALESCE($2, handle),
         display_name = COALESCE($3, display_name),
         disciplines = COALESCE(string_to_array($4, ','), disciplines),
         avatar_variant = COALESCE($5, avatar_variant),
         theme = COALESCE($6, theme),
         updated_at = now()
       WHERE id = $1
       RETURNING ${USER_COLS}`,
      [
        userId,
        patch.handle ?? null,
        patch.displayName ?? null,
        patch.disciplines ? patch.disciplines.join(",") : null,
        patch.avatarVariant ?? null,
        patch.theme ?? null,
      ],
    );
    const user = rows[0];
    if (!user) return reply.notFound("user not found");

    // (Re)generate the avatar whenever identity or variant changes.
    if (patch.handle || patch.avatarVariant) {
      const svg = avatarSvgForSeed(user.handle ?? user.id, user.avatar_variant as never);
      await app.db.query(`INSERT INTO avatars (user_id, variant, svg) VALUES ($1, $2, $3)`, [userId, user.avatar_variant, svg]);
    }
    return { user: toPublicUser(user) };
  });

  app.put("/body", async (req) => {
    const userId = req.user.sub;
    const body = PutBodyRequest.parse(req.body);
    await app.db.query(
      `INSERT INTO user_body (user_id, height_cm, weight_kg, dob, sex)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg,
         dob = EXCLUDED.dob, sex = EXCLUDED.sex, updated_at = now()`,
      [userId, body.heightCm, body.weightKg, body.dob ?? null, body.sex ?? null],
    );
    return { ok: true, body };
  });
}
