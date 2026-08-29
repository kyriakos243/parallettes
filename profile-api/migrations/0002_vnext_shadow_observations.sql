PRAGMA foreign_keys = ON;

-- Additive Phase 4 storage. v1.2 profile_json remains untouched and
-- authoritative outside explicitly enabled vNext shadow sync.
CREATE TABLE IF NOT EXISTS vnext_shadow_sync_heads (
  profile_id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  change_cursor INTEGER NOT NULL DEFAULT 0,
  reset_tombstone_id TEXT,
  reset_tombstone_hash TEXT,
  reset_at TEXT,
  reset_at_ms INTEGER,
  reset_payload_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  CHECK ((reset_tombstone_id IS NULL) = (reset_at_ms IS NULL)),
  CHECK ((reset_tombstone_hash IS NULL) = (reset_at_ms IS NULL)),
  CHECK ((reset_at IS NULL) = (reset_at_ms IS NULL)),
  CHECK ((reset_payload_json IS NULL) = (reset_at_ms IS NULL))
);

-- One server-assigned monotonic sequence spans every sync kind. Mutable kinds
-- append a new payload hash; immutable kinds are constrained by application
-- validation to one hash per stable ID.
CREATE TABLE IF NOT EXISTS vnext_shadow_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN (
    'evidence-event', 'session-plan', 'session-record', 'athlete-intent',
    'reset-tombstone', 'legacy-snapshot', 'migration-run'
  )),
  entity_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  migration_run_id TEXT,
  fact_time TEXT NOT NULL,
  fact_time_ms INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, entity_kind, entity_id, payload_hash),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS vnext_shadow_changes_delta_idx
  ON vnext_shadow_changes(profile_id, sequence);
CREATE INDEX IF NOT EXISTS vnext_shadow_changes_entity_idx
  ON vnext_shadow_changes(profile_id, entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS vnext_shadow_changes_fact_idx
  ON vnext_shadow_changes(profile_id, entity_kind, fact_time_ms);
CREATE INDEX IF NOT EXISTS vnext_shadow_changes_migration_idx
  ON vnext_shadow_changes(profile_id, migration_run_id, entity_kind);
-- Immutable sync identities may have only one canonical payload, even when
-- two Workers make their preflight decision concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS vnext_shadow_changes_immutable_identity_idx
  ON vnext_shadow_changes(profile_id, entity_kind, entity_id)
  WHERE entity_kind IN ('evidence-event', 'session-plan', 'session-record', 'legacy-snapshot');

CREATE TABLE IF NOT EXISTS vnext_shadow_session_plans (
  profile_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  athlete_id TEXT NOT NULL,
  migration_run_id TEXT,
  created_at TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  catalogue_version INTEGER NOT NULL,
  generator_policy_id TEXT NOT NULL,
  generator_policy_version INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (profile_id, plan_id),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vnext_shadow_evidence_events (
  profile_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  athlete_id TEXT NOT NULL,
  migration_run_id TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL,
  catalogue_version INTEGER NOT NULL,
  target_event_id TEXT,
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (profile_id, event_id),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS vnext_shadow_events_replay_idx
  ON vnext_shadow_evidence_events(profile_id, occurred_at_ms, recorded_at_ms, event_id);
CREATE INDEX IF NOT EXISTS vnext_shadow_events_target_idx
  ON vnext_shadow_evidence_events(profile_id, target_event_id);

CREATE TABLE IF NOT EXISTS vnext_shadow_session_records (
  profile_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  athlete_id TEXT NOT NULL,
  migration_run_id TEXT,
  plan_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  completed_at_ms INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'modified', 'partial', 'abandoned')),
  supersedes_record_id TEXT,
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (profile_id, record_id),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id, plan_id)
    REFERENCES vnext_shadow_session_plans(profile_id, plan_id) ON DELETE RESTRICT,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS vnext_shadow_records_replay_idx
  ON vnext_shadow_session_records(profile_id, completed_at_ms, recorded_at_ms, record_id);
CREATE INDEX IF NOT EXISTS vnext_shadow_records_plan_idx
  ON vnext_shadow_session_records(profile_id, plan_id);
CREATE INDEX IF NOT EXISTS vnext_shadow_records_supersedes_idx
  ON vnext_shadow_session_records(profile_id, supersedes_record_id);

CREATE TABLE IF NOT EXISTS vnext_shadow_athlete_intents (
  profile_id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  updated_at TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  migration_run_id TEXT,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vnext_shadow_reset_tombstones (
  profile_id TEXT NOT NULL,
  tombstone_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  athlete_id TEXT NOT NULL,
  reset_at TEXT NOT NULL,
  reset_at_ms INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (profile_id, tombstone_id),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vnext_shadow_legacy_snapshots (
  profile_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  athlete_id TEXT NOT NULL,
  converter_version INTEGER NOT NULL,
  source_version TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  captured_at_ms INTEGER NOT NULL,
  reset_at TEXT,
  reset_at_ms INTEGER,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (profile_id, snapshot_id),
  UNIQUE (profile_id, converter_version, source_fingerprint),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE,
  CHECK ((reset_at IS NULL) = (reset_at_ms IS NULL))
);

CREATE TABLE IF NOT EXISTS vnext_shadow_migration_runs (
  profile_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  change_sequence INTEGER NOT NULL UNIQUE,
  athlete_id TEXT NOT NULL,
  converter_version INTEGER NOT NULL,
  source_version TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'rolled-back')),
  created_at TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  rolled_back_at TEXT,
  rolled_back_at_ms INTEGER,
  generated_entities_json TEXT NOT NULL,
  stable_payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (profile_id, run_id),
  UNIQUE (profile_id, converter_version, source_fingerprint),
  FOREIGN KEY (profile_id, snapshot_id)
    REFERENCES vnext_shadow_legacy_snapshots(profile_id, snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (change_sequence) REFERENCES vnext_shadow_changes(sequence) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE,
  CHECK ((rolled_back_at IS NULL) = (rolled_back_at_ms IS NULL))
);

-- Terminal rollback entity tombstones prevent a stale device from uploading a
-- generated entity again, even if it omits migrationRunId on retry.
CREATE TABLE IF NOT EXISTS vnext_shadow_rolled_back_entities (
  profile_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('evidence-event', 'session-plan', 'session-record')),
  entity_id TEXT NOT NULL,
  migration_run_id TEXT NOT NULL,
  rolled_back_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, entity_kind, entity_id),
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE
);

-- Rebuildable and deliberately absent from the sync truth log.
CREATE TABLE IF NOT EXISTS vnext_shadow_projection_caches (
  profile_id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  projection_version INTEGER NOT NULL,
  catalogue_version INTEGER NOT NULL,
  definition_fingerprint TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  reset_at TEXT,
  as_of TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS vnext_shadow_plans_immutable
BEFORE UPDATE ON vnext_shadow_session_plans
BEGIN SELECT RAISE(ABORT, 'vNext Session Plans are immutable'); END;

CREATE TRIGGER IF NOT EXISTS vnext_shadow_events_immutable
BEFORE UPDATE ON vnext_shadow_evidence_events
BEGIN SELECT RAISE(ABORT, 'vNext Evidence Events are immutable'); END;

CREATE TRIGGER IF NOT EXISTS vnext_shadow_records_immutable
BEFORE UPDATE ON vnext_shadow_session_records
BEGIN SELECT RAISE(ABORT, 'vNext Session Records are immutable'); END;

CREATE TRIGGER IF NOT EXISTS vnext_shadow_snapshots_immutable
BEFORE UPDATE ON vnext_shadow_legacy_snapshots
BEGIN SELECT RAISE(ABORT, 'vNext legacy snapshots are immutable'); END;
