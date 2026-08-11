PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  profile_id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  recovery_hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_updated_at_idx ON accounts(updated_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_profile_id_idx ON sessions(profile_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_limits (
  id TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  window_started TEXT NOT NULL
);
