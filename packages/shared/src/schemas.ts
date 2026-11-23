/** Zod schemas for every request/response shape on the /v1 surface. */

import { z } from "zod";
import {
  AVATAR_VARIANTS,
  DISCIPLINES,
  MATCH_KIND,
  STAT_KEYS,
  SUBSCRIPTION_TIERS,
  THEMES,
  WORKOUT_KINDS,
} from "./enums.js";

// ---------- primitives ----------

export const StatVectorSchema = z.object(
  Object.fromEntries(STAT_KEYS.map((k) => [k, z.number().int().min(1).max(99)])) as Record<
    (typeof STAT_KEYS)[number],
    z.ZodNumber
  >,
);

export const HandleSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[a-z0-9_]+$/, "lowercase letters, digits and underscores only");

export const PhoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, "E.164 format, e.g. +15551234567");

// ---------- auth ----------

/** Sign-in is a single step: post your phone, get tokens back. */
export const PhoneStartRequest = z.object({ phone: PhoneSchema });

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  disciplines: z.array(z.enum(DISCIPLINES)),
  avatarVariant: z.enum(AVATAR_VARIANTS),
  theme: z.enum(THEMES),
  tier: z.enum(SUBSCRIPTION_TIERS),
  isBot: z.boolean(),
  createdAt: z.string(),
});

export const AuthTokensResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: PublicUserSchema,
});

export const RefreshRequest = z.object({ refreshToken: z.string().min(20) });

// ---------- me ----------

export const PatchMeRequest = z
  .object({
    handle: HandleSchema,
    displayName: z.string().min(1).max(40),
    disciplines: z.array(z.enum(DISCIPLINES)).min(1).max(3),
    avatarVariant: z.enum(AVATAR_VARIANTS),
    theme: z.enum(THEMES),
  })
  .partial();

export const PutBodyRequest = z.object({
  heightCm: z.number().min(90).max(250),
  weightKg: z.number().min(25).max(300),
  dob: z.string().date().optional(),
  sex: z.enum(["m", "f", "x"]).optional(),
});

// ---------- workouts ----------

export const CreateWorkoutRequest = z.object({
  kind: z.enum(WORKOUT_KINDS),
  startedAt: z.string().datetime(),
  durationMin: z.number().int().min(1).max(600),
  intensity: z.number().int().min(1).max(10),
  source: z.enum(["manual", "healthkit", "health_connect", "strava", "terra"]).default("manual"),
  notes: z.string().max(500).optional(),
});

export const WorkoutSchema = CreateWorkoutRequest.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const WorkoutCreatedResponse = z.object({
  workout: WorkoutSchema,
  stats: StatVectorSchema,
  streak: z.object({ current: z.number().int(), longest: z.number().int() }),
});

// ---------- stats ----------

export const StatsResponse = z.object({ stats: StatVectorSchema, asOf: z.string() });
export const StatsHistoryResponse = z.object({
  days: z.array(z.object({ day: z.string(), stats: StatVectorSchema })),
});

// ---------- battle ----------

export const FighterCardSchema = z.object({
  userId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  rating: z.number().int(),
  stats: StatVectorSchema,
  disciplines: z.array(z.enum(DISCIPLINES)).min(1),
  avatarVariant: z.enum(AVATAR_VARIANTS),
  isBot: z.boolean(),
});

export const BattleFindRequest = z.object({ kind: z.enum(MATCH_KIND) });

export const BattleFindResponse = z.object({
  matchId: z.string().uuid(),
  kind: z.enum(MATCH_KIND),
  seed: z.number().int(),
  rules: z.object({
    rounds: z.number().int(),
    ticksPerRound: z.number().int(),
    tickHz: z.number().int(),
    engineVersion: z.string(),
  }),
  you: FighterCardSchema,
  opponent: FighterCardSchema,
});

export const BattleSubmitRequest = z.object({
  matchId: z.string().uuid(),
  /** Per-tick input bitmasks for both corners, length rounds*ticksPerRound. */
  inputs: z.object({
    a: z.array(z.number().int().min(0).max(63)),
    b: z.array(z.number().int().min(0).max(63)),
  }),
  hash: z.number().int().nonnegative(),
});

export const RoundSummarySchema = z.object({
  winner: z.enum(["a", "b", "draw"]),
  aHp: z.number().int(),
  bHp: z.number().int(),
});

export const BoxScoreSchema = z.object({
  hits: z.object({ a: z.number().int(), b: z.number().int() }),
  blocked: z.object({ a: z.number().int(), b: z.number().int() }),
  dodged: z.object({ a: z.number().int(), b: z.number().int() }),
  specials: z.object({ a: z.number().int(), b: z.number().int() }),
  koRound: z.number().int().nullable(),
});

export const BattleSubmitResponse = z.object({
  accepted: z.literal(true),
  winner: z.enum(["a", "b", "draw"]),
  rounds: z.array(RoundSummarySchema),
  boxScore: BoxScoreSchema,
  eloDelta: z.number().int(),
  newRating: z.number().int(),
});

export const RecentMatchSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(MATCH_KIND),
  opponentHandle: z.string(),
  result: z.enum(["win", "loss", "draw", "pending"]),
  eloDelta: z.number().int().nullable(),
  playedAt: z.string(),
});

// ---------- feed ----------

export const CreatePostRequest = z.object({
  kind: z.enum(["text", "workout", "match"]).default("text"),
  body: z.string().min(1).max(1000),
  refId: z.string().uuid().optional(),
});

export const ReactRequest = z.object({ emoji: z.enum(["fire", "flex", "respect", "laugh"]) });
export const CommentRequest = z.object({ body: z.string().min(1).max(500) });

export const PostSchema = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  authorHandle: z.string().nullable(),
  kind: z.enum(["text", "workout", "match"]),
  body: z.string(),
  refId: z.string().uuid().nullable(),
  reactions: z.record(z.number().int()),
  commentCount: z.number().int(),
  createdAt: z.string(),
});

// ---------- ranks ----------

export const RankRowSchema = z.object({
  rank: z.number().int(),
  userId: z.string().uuid(),
  handle: z.string().nullable(),
  rating: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
});

// ---------- tribes ----------

export const CreateTribeRequest = z.object({
  name: z.string().min(3).max(30),
  motto: z.string().max(120).optional(),
});

export const TribeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  motto: z.string().nullable(),
  memberCount: z.number().int(),
  createdAt: z.string(),
});

// ---------- inferred types ----------

export type PublicUser = z.infer<typeof PublicUserSchema>;
export type FighterCard = z.infer<typeof FighterCardSchema>;
export type BattleFind = z.infer<typeof BattleFindResponse>;
export type BattleSubmit = z.infer<typeof BattleSubmitRequest>;
export type BattleResult = z.infer<typeof BattleSubmitResponse>;
export type Post = z.infer<typeof PostSchema>;
export type RankRow = z.infer<typeof RankRowSchema>;
export type Tribe = z.infer<typeof TribeSchema>;
