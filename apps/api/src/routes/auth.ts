import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PhoneStartRequest, RefreshRequest } from "@cx/shared";
import { env } from "../env.js";
import { getUser, toPublicUser, USER_COLS, type UserRow } from "../lib/users.js";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function issueTokens(app: FastifyInstance, user: UserRow) {
  const accessToken = app.jwt.sign({ sub: user.id });
  const refreshToken = randomBytes(32).toString("hex");
  await app.db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, sha256(refreshToken), new Date(Date.now() + env.refreshTokenTtlDays * 86_400_000).toISOString()],
  );
  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Single-step sign-in: a phone number is an account. No OTP round-trip.
  app.post("/phone/start", async (req) => {
    const { phone } = PhoneStartRequest.parse(req.body);
    const upsert = await app.db.query<UserRow>(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET updated_at = now()
       RETURNING ${USER_COLS}`,
      [phone],
    );
    const user = upsert.rows[0]!;
    await app.db.query(`INSERT INTO streaks (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    await app.db.query(`INSERT INTO user_ratings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    return issueTokens(app, user);
  });

  app.post("/refresh", async (req, reply) => {
    const { refreshToken } = RefreshRequest.parse(req.body);
    // Rotate: revoke the presented token and mint a fresh pair atomically.
    const { rows } = await app.db.query<{ user_id: string }>(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [sha256(refreshToken)],
    );
    if (!rows[0]) return reply.unauthorized("invalid refresh token");
    const user = await getUser(app.db, rows[0].user_id);
    if (!user) return reply.unauthorized("user gone");
    return issueTokens(app, user);
  });
}
