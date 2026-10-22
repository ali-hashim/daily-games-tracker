-- Winstitute of Higher Thinking V1 initial schema.
-- This migration is greenfield: the superseded PIN/OCR schema was never deployed.
-- Timestamps are UTC ISO-8601 text; game_date is an America/Los_Angeles YYYY-MM-DD value.

PRAGMA foreign_keys = ON;

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_meta (key, value) VALUES
  ('schema_version', '1'),
  ('capture_schema', 'dgt.capture.v1'),
  ('minimum_shortcut_version', '1'),
  ('latest_shortcut_version', '1');

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim(display_name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX idx_players_active_name
  ON players(display_name COLLATE NOCASE)
  WHERE active = 1;

CREATE TABLE device_credentials (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  credential_hash TEXT NOT NULL UNIQUE,
  label TEXT CHECK (label IS NULL OR length(label) <= 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE registration_invites (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(created_by) BETWEEN 1 AND 320)
);

CREATE TABLE web_sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  session_hash TEXT NOT NULL UNIQUE,
  source_device_id TEXT REFERENCES device_credentials(id) ON DELETE SET NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE TABLE login_challenges (
  id TEXT PRIMARY KEY,
  challenge_hash TEXT NOT NULL UNIQUE,
  browser_flow_hash TEXT NOT NULL,
  approved_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  approved_device_id TEXT REFERENCES device_credentials(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  round_count INTEGER NOT NULL CHECK (round_count > 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json))
);

INSERT INTO games (id, key, display_name, active, round_count, config_json) VALUES
  (
    'krillion',
    'krillion',
    'Krillion',
    1,
    7,
    '{"icon":"🦐","parserVersion":"krillion.v1","allowedScores":[0,10,15,30,60,85,100],"scoreEmojis":{"0":"⬛","10":"🫧","15":"🤡","30":"🐟","60":"🦑","85":"🏮","100":"🌟"},"placementBadges":["🌟","🏮","🦑","🐟","🤡","🫧"]}'
  ),
  (
    'maptap',
    'maptap',
    'MapTap',
    1,
    5,
    '{"icon":"🌎","parserVersion":"maptap.v1","weights":[1,1,2,3,3],"placementBadges":["🎯","🔥","🏅","🏆","🎉","👏","🌞","😁","😂","🫢","🙈","😒"]}'
  );

CREATE TABLE game_days (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  game_date TEXT NOT NULL,
  external_puzzle_key TEXT NOT NULL,
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_id, game_date),
  UNIQUE (game_id, external_puzzle_key),
  CHECK (game_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (length(trim(external_puzzle_key)) > 0)
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  game_day_id TEXT NOT NULL REFERENCES game_days(id) ON DELETE RESTRICT,
  final_score INTEGER NOT NULL CHECK (final_score BETWEEN 0 AND 1000),
  result_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('safari_webpage', 'shared_text', 'admin')),
  submitted_via_device_id TEXT REFERENCES device_credentials(id) ON DELETE SET NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (player_id, game_day_id)
);

CREATE TABLE round_results (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 7),
  prompt TEXT,
  answer TEXT,
  raw_score INTEGER NOT NULL CHECK (raw_score BETWEEN 0 AND 100),
  original_emoji TEXT,
  UNIQUE (submission_id, round_number)
);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_identity TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(admin_identity) BETWEEN 1 AND 320),
  CHECK (length(action) BETWEEN 1 AND 100),
  CHECK (length(entity_type) BETWEEN 1 AND 100),
  CHECK (length(entity_id) BETWEEN 1 AND 100)
);

CREATE INDEX idx_device_credentials_player
  ON device_credentials(player_id, revoked_at);
CREATE INDEX idx_registration_invites_player_expiry
  ON registration_invites(player_id, expires_at, consumed_at);
CREATE INDEX idx_web_sessions_player_expiry
  ON web_sessions(player_id, idle_expires_at, revoked_at);
CREATE INDEX idx_login_challenges_expiry
  ON login_challenges(expires_at, consumed_at);
CREATE INDEX idx_game_days_date
  ON game_days(game_date DESC, game_id);
CREATE INDEX idx_submissions_game_day_score
  ON submissions(game_day_id, final_score DESC, player_id);
CREATE INDEX idx_submissions_player_game
  ON submissions(player_id, game_id, submitted_at DESC);
CREATE INDEX idx_round_results_submission
  ON round_results(submission_id, round_number);
CREATE INDEX idx_admin_audit_entity
  ON admin_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_admin_audit_date
  ON admin_audit_log(created_at DESC);
