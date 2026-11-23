-- CompeteX schema. Postgres 16 + TimescaleDB (optional — degrades gracefully).
-- Idempotent: safe to re-run.

-- gen_random_uuid() is core since PG13; pgcrypto kept for older installs.
-- Both extensions are optional — PGlite and vanilla Postgres degrade gracefully.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto extension unavailable — relying on built-in gen_random_uuid()';
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'timescaledb extension unavailable — continuing with plain tables';
END $$;

-- ---------- identity ----------

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text UNIQUE,
  handle        text UNIQUE,
  display_name  text,
  disciplines   text[] NOT NULL DEFAULT '{}',
  avatar_variant text NOT NULL DEFAULT 'inkline',
  theme         text NOT NULL DEFAULT 'inkline-dark',
  tier          text NOT NULL DEFAULT 'free',
  is_bot        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_body (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  height_cm  numeric(5,1),
  weight_kg  numeric(5,1),
  dob        date,
  sex        text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avatars (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant    text NOT NULL,
  svg        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avatars_user_idx ON avatars(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phone_otps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_otps_phone_idx ON phone_otps(phone, created_at DESC);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

-- ---------- training ----------

CREATE TABLE IF NOT EXISTS workouts (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  started_at   timestamptz NOT NULL,
  duration_min integer NOT NULL,
  intensity    integer NOT NULL,
  source       text NOT NULL DEFAULT 'manual',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, started_at)
);
CREATE INDEX IF NOT EXISTS workouts_user_time_idx ON workouts(user_id, started_at DESC);

-- Hypertable when TimescaleDB is present; plain table otherwise.
DO $$
BEGIN
  PERFORM create_hypertable('workouts', 'started_at', if_not_exists => TRUE, migrate_data => TRUE);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'create_hypertable skipped — workouts stays a plain table';
END $$;

CREATE TABLE IF NOT EXISTS stat_snapshots (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       date NOT NULL,
  power     integer NOT NULL,
  speed     integer NOT NULL,
  endurance integer NOT NULL,
  technique integer NOT NULL,
  reaction  integer NOT NULL,
  willpower integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS streaks (
  user_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current  integer NOT NULL DEFAULT 0,
  longest  integer NOT NULL DEFAULT 0,
  last_day date
);

CREATE TABLE IF NOT EXISTS quests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  description text NOT NULL,
  cadence     text NOT NULL DEFAULT 'daily',
  reward_xp   integer NOT NULL DEFAULT 0
);

-- ---------- battle ----------

CREATE TABLE IF NOT EXISTS matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,
  a_user_id    uuid NOT NULL REFERENCES users(id),
  b_user_id    uuid NOT NULL REFERENCES users(id),
  seed         bigint NOT NULL,
  -- Fighter configs (stats + disciplines) frozen at find-time so the server
  -- replay uses exactly what the client simulated, even if stats moved since.
  config       jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'pending', -- pending | resolved | rejected
  winner       text,                            -- a | b | draw
  rounds       jsonb,
  box_score    jsonb,
  replay_hash  bigint,
  elo_delta_a  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS matches_a_idx ON matches(a_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS matches_b_idx ON matches(b_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_ratings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating  integer NOT NULL DEFAULT 1000,
  wins    integer NOT NULL DEFAULT 0,
  losses  integer NOT NULL DEFAULT 0,
  draws   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_ratings_rating_idx ON user_ratings(rating DESC);

-- ---------- social ----------

CREATE TABLE IF NOT EXISTS friendships (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'text',
  body       text NOT NULL,
  ref_id     uuid,
  reactions  jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_time_idx ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS tribes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  motto      text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tribe_members (
  tribe_id  uuid NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tribe_id, user_id)
);
