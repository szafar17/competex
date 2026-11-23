-- Idempotent demo seed. Includes the CPU bot row used by practice matchmaking.

INSERT INTO users (id, phone, handle, display_name, disciplines, avatar_variant, is_bot)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  NULL,
  'cpu_bot',
  'Sparring Bot',
  ARRAY['boxing','muay_thai'],
  'inkline',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_ratings (user_id, rating)
VALUES ('00000000-0000-4000-8000-000000000001', 1000)
ON CONFLICT (user_id) DO NOTHING;

-- The bot fights off a fixed, middle-of-the-road snapshot.
INSERT INTO stat_snapshots (user_id, day, power, speed, endurance, technique, reaction, willpower)
VALUES ('00000000-0000-4000-8000-000000000001', CURRENT_DATE, 45, 45, 50, 48, 42, 50)
ON CONFLICT (user_id, day) DO UPDATE SET
  power = EXCLUDED.power, speed = EXCLUDED.speed, endurance = EXCLUDED.endurance,
  technique = EXCLUDED.technique, reaction = EXCLUDED.reaction, willpower = EXCLUDED.willpower;

INSERT INTO quests (slug, title, description, cadence, reward_xp) VALUES
  ('daily-log', 'Log a session', 'Log any workout today to keep your streak alive.', 'daily', 50),
  ('daily-spar', 'Throw hands', 'Fight one match of any kind.', 'daily', 75),
  ('weekly-volume', 'Put in the volume', 'Log 150 total minutes this week.', 'weekly', 200)
ON CONFLICT (slug) DO NOTHING;
