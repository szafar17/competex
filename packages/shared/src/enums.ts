/** Core enumerations for CompeteX. Single source of truth for both clients and server. */

export const DISCIPLINES = [
  "muay_thai",
  "boxing",
  "karate",
  "kung_fu",
  "wrestling",
  "bjj",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  muay_thai: "Muay Thai",
  boxing: "Boxing",
  karate: "Karate",
  kung_fu: "Kung Fu",
  wrestling: "Wrestling",
  bjj: "BJJ",
};

export const STAT_KEYS = [
  "power",
  "speed",
  "endurance",
  "technique",
  "reaction",
  "willpower",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** A six-stat vector, each value an integer 1–99. */
export type StatVector = Record<StatKey, number>;

export const TABS = ["me", "train", "battle", "feed", "ranks"] as const;
export type Tab = (typeof TABS)[number];

export const MATCH_KIND = ["practice", "quick", "ranked"] as const;
export type MatchKind = (typeof MATCH_KIND)[number];

/** Practice never moves ELO; quick and ranked do. */
export const RATED_KINDS: readonly MatchKind[] = ["quick", "ranked"];

export const THEMES = ["inkline-light", "inkline-dark"] as const;
export type Theme = (typeof THEMES)[number];

export const AVATAR_VARIANTS = ["inkline", "soft", "editorial", "brush"] as const;
export type AvatarVariant = (typeof AVATAR_VARIANTS)[number];

export const FEATURE_STATUS = ["live", "in_build", "specd", "backlog", "idea"] as const;
export type FeatureStatus = (typeof FEATURE_STATUS)[number];

export const SUBSCRIPTION_TIERS = ["free", "plus", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const WORKOUT_KINDS = [
  "run",
  "strength",
  "hiit",
  "sparring",
  "drills",
  "mobility",
  "swim",
  "cycle",
] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

/**
 * Canonical match shape. Client simulation and server replay must both read
 * these numbers from here — if they ever disagree the rolling hash check fails.
 */
export const MATCH_RULES = {
  rounds: 3,
  ticksPerRound: 600,
  tickHz: 60,
  engineVersion: "0.4",
} as const;

export const ELO_K = 24;
export const ELO_START = 1000;
export const MATCHMAKING_BAND = 250;
