import {
  computeStats,
  defaultStats,
  STAT_KEYS,
  type Discipline,
  type PublicUser,
  type StatVector,
  type WorkoutKind,
} from "@cx/shared";
import { csvList, iso, type Db } from "../db.js";

export interface UserRow {
  id: string;
  phone: string | null;
  handle: string | null;
  display_name: string | null;
  disciplines: unknown;
  avatar_variant: string;
  theme: string;
  tier: string;
  is_bot: boolean;
  created_at: unknown;
}

export const USER_COLS =
  "id, phone, handle, display_name, array_to_string(disciplines, ',') AS disciplines, avatar_variant, theme, tier, is_bot, created_at";

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    disciplines: csvList(row.disciplines) as Discipline[],
    avatarVariant: row.avatar_variant as PublicUser["avatarVariant"],
    theme: row.theme as PublicUser["theme"],
    tier: row.tier as PublicUser["tier"],
    isBot: Boolean(row.is_bot),
    createdAt: iso(row.created_at),
  };
}

export async function getUser(db: Db, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Latest snapshot, else recompute from workouts, else the rookie default. */
export async function currentStats(db: Db, userId: string, now = new Date()): Promise<StatVector> {
  const snap = await db.query(
    `SELECT power, speed, endurance, technique, reaction, willpower
       FROM stat_snapshots WHERE user_id = $1 ORDER BY day DESC LIMIT 1`,
    [userId],
  );
  if (snap.rows[0]) {
    const out = {} as StatVector;
    for (const k of STAT_KEYS) out[k] = Number(snap.rows[0][k]);
    return out;
  }
  return recomputeStats(db, userId, now);
}

export async function recomputeStats(db: Db, userId: string, now = new Date()): Promise<StatVector> {
  const { rows } = await db.query(
    `SELECT kind, started_at, duration_min, intensity
       FROM workouts
      WHERE user_id = $1 AND started_at > $2
      ORDER BY started_at ASC`,
    [userId, new Date(now.getTime() - 28 * 86_400_000).toISOString()],
  );
  if (rows.length === 0) return defaultStats();
  return computeStats(
    rows.map((r) => ({
      kind: r.kind as WorkoutKind,
      startedAt: new Date(String(r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at)),
      durationMin: Number(r.duration_min),
      intensity: Number(r.intensity),
    })),
    now,
  );
}

export async function upsertSnapshot(db: Db, userId: string, stats: StatVector, day: string): Promise<void> {
  await db.query(
    `INSERT INTO stat_snapshots (user_id, day, power, speed, endurance, technique, reaction, willpower)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, day) DO UPDATE SET
       power = EXCLUDED.power, speed = EXCLUDED.speed, endurance = EXCLUDED.endurance,
       technique = EXCLUDED.technique, reaction = EXCLUDED.reaction, willpower = EXCLUDED.willpower`,
    [userId, day, stats.power, stats.speed, stats.endurance, stats.technique, stats.reaction, stats.willpower],
  );
}

export async function getRating(db: Db, userId: string): Promise<{ rating: number; wins: number; losses: number; draws: number }> {
  const { rows } = await db.query(
    `INSERT INTO user_ratings (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING rating, wins, losses, draws`,
    [userId],
  );
  const r = rows[0]!;
  return { rating: Number(r.rating), wins: Number(r.wins), losses: Number(r.losses), draws: Number(r.draws) };
}
