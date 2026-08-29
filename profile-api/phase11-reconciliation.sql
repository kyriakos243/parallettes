-- Phase 11 read-only production reconciliation.
-- Run with Wrangler D1 execute --remote after migration/smoke traffic, capture
-- the JSON output, and retain it with the release evidence. This statement
-- emits one row of named counts and no profile identifiers or payload JSON.
-- Every invariant_* value must be zero.

WITH RECURSIVE reachable(profile_id, record_id) AS (
  SELECT profile_id, record_id
  FROM vnext_shadow_session_records
  WHERE supersedes_record_id IS NULL
  UNION
  SELECT child.profile_id, child.record_id
  FROM vnext_shadow_session_records AS child
  JOIN reachable AS parent
    ON parent.profile_id = child.profile_id
    AND parent.record_id = child.supersedes_record_id
)
SELECT
  (SELECT COUNT(*) FROM accounts) AS accounts,
  (SELECT COUNT(*) FROM vnext_shadow_sync_heads) AS sync_heads,
  (SELECT COUNT(*) FROM vnext_shadow_changes) AS changes,
  (SELECT COUNT(*) FROM vnext_shadow_session_plans) AS session_plans,
  (SELECT COUNT(*) FROM vnext_shadow_evidence_events) AS evidence_events,
  (SELECT COUNT(*) FROM vnext_shadow_session_records) AS session_records,
  (SELECT COUNT(*) FROM vnext_shadow_athlete_intents) AS athlete_intents,
  (SELECT COUNT(*) FROM vnext_shadow_reset_tombstones) AS reset_tombstones,
  (SELECT COUNT(*) FROM vnext_shadow_legacy_snapshots) AS legacy_snapshots,
  (SELECT COUNT(*) FROM vnext_shadow_migration_runs WHERE status = 'active') AS migration_runs_active,
  (SELECT COUNT(*) FROM vnext_shadow_migration_runs WHERE status = 'rolled-back') AS migration_runs_rolled_back,
  (SELECT COUNT(*) FROM vnext_shadow_rolled_back_entities) AS rolled_back_entities,

  (
    (SELECT COUNT(*) FROM vnext_shadow_sync_heads WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_session_plans WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_evidence_events WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_session_records WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_athlete_intents WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_reset_tombstones WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_legacy_snapshots WHERE profile_id <> athlete_id)
    + (SELECT COUNT(*) FROM vnext_shadow_migration_runs WHERE profile_id <> athlete_id)
  ) AS invariant_athlete_identity_mismatch,
  (SELECT COUNT(*)
    FROM vnext_shadow_sync_heads AS head
    WHERE head.change_cursor < COALESCE((
      SELECT MAX(change.sequence) FROM vnext_shadow_changes AS change
      WHERE change.profile_id = head.profile_id
    ), 0)) AS invariant_change_cursor_behind,
  (SELECT COUNT(*)
    FROM vnext_shadow_evidence_events AS event
    JOIN vnext_shadow_sync_heads AS head ON head.profile_id = event.profile_id
    WHERE head.reset_at_ms IS NOT NULL AND event.occurred_at_ms <= head.reset_at_ms
  ) AS invariant_event_at_or_before_reset,
  (SELECT COUNT(*)
    FROM vnext_shadow_session_records AS record
    JOIN vnext_shadow_sync_heads AS head ON head.profile_id = record.profile_id
    WHERE head.reset_at_ms IS NOT NULL AND record.completed_at_ms <= head.reset_at_ms
  ) AS invariant_record_at_or_before_reset,
  (SELECT COUNT(*)
    FROM vnext_shadow_session_records AS record
    LEFT JOIN vnext_shadow_session_plans AS plan
      ON plan.profile_id = record.profile_id AND plan.plan_id = record.plan_id
    WHERE plan.plan_id IS NULL
  ) AS invariant_record_without_plan,
  (SELECT COUNT(*)
    FROM vnext_shadow_session_records AS record
    LEFT JOIN vnext_shadow_session_records AS target
      ON target.profile_id = record.profile_id AND target.record_id = record.supersedes_record_id
    WHERE record.supersedes_record_id IS NOT NULL
      AND (target.record_id IS NULL OR target.plan_id <> record.plan_id)
  ) AS invariant_correction_without_target,
  (SELECT COUNT(*)
    FROM vnext_shadow_session_records AS record
    LEFT JOIN reachable
      ON reachable.profile_id = record.profile_id AND reachable.record_id = record.record_id
    WHERE reachable.record_id IS NULL
  ) AS invariant_record_correction_unreachable,
  (SELECT COUNT(*) FROM (
    SELECT profile_id, supersedes_record_id
    FROM vnext_shadow_session_records
    WHERE supersedes_record_id IS NOT NULL
    GROUP BY profile_id, supersedes_record_id
    HAVING COUNT(*) > 1
  )) AS invariant_branched_record_correction,
  (SELECT COUNT(*) FROM (
    SELECT profile_id, plan_id
    FROM vnext_shadow_session_records
    WHERE supersedes_record_id IS NULL
    GROUP BY profile_id, plan_id
    HAVING COUNT(*) > 1
  )) AS invariant_multiple_root_session_records,
  (SELECT COUNT(*)
    FROM vnext_shadow_evidence_events AS event
    LEFT JOIN vnext_shadow_evidence_events AS target
      ON target.profile_id = event.profile_id AND target.event_id = event.target_event_id
    WHERE event.target_event_id IS NOT NULL AND target.event_id IS NULL
  ) AS invariant_event_target_missing,
  (SELECT COUNT(*)
    FROM vnext_shadow_sync_heads AS head
    LEFT JOIN vnext_shadow_reset_tombstones AS reset
      ON reset.profile_id = head.profile_id
      AND reset.tombstone_id = head.reset_tombstone_id
      AND reset.payload_hash = head.reset_tombstone_hash
    WHERE head.reset_at_ms IS NOT NULL AND reset.tombstone_id IS NULL
  ) AS invariant_reset_head_without_tombstone,
  (SELECT COUNT(*)
    FROM vnext_shadow_migration_runs AS run
    LEFT JOIN vnext_shadow_legacy_snapshots AS snapshot
      ON snapshot.profile_id = run.profile_id AND snapshot.snapshot_id = run.snapshot_id
    WHERE run.status = 'active' AND snapshot.snapshot_id IS NULL
  ) AS invariant_active_migration_without_snapshot,
  (SELECT COUNT(*)
    FROM vnext_shadow_rolled_back_entities AS ref
    LEFT JOIN vnext_shadow_migration_runs AS run
      ON run.profile_id = ref.profile_id AND run.run_id = ref.migration_run_id
    WHERE run.run_id IS NULL OR run.status <> 'rolled-back'
  ) AS invariant_rollback_ref_without_terminal_run,
  (SELECT COUNT(*)
    FROM vnext_shadow_changes AS change
    WHERE (change.entity_kind = 'session-plan' AND NOT EXISTS (
        SELECT 1 FROM vnext_shadow_session_plans AS plan
        WHERE plan.profile_id = change.profile_id AND plan.plan_id = change.entity_id
          AND plan.payload_hash = change.payload_hash
      )) OR (change.entity_kind = 'evidence-event' AND NOT EXISTS (
        SELECT 1 FROM vnext_shadow_evidence_events AS event
        WHERE event.profile_id = change.profile_id AND event.event_id = change.entity_id
          AND event.payload_hash = change.payload_hash
      )) OR (change.entity_kind = 'session-record' AND NOT EXISTS (
        SELECT 1 FROM vnext_shadow_session_records AS record
        WHERE record.profile_id = change.profile_id AND record.record_id = change.entity_id
          AND record.payload_hash = change.payload_hash
      )) OR (change.entity_kind = 'legacy-snapshot' AND NOT EXISTS (
        SELECT 1 FROM vnext_shadow_legacy_snapshots AS snapshot
        WHERE snapshot.profile_id = change.profile_id AND snapshot.snapshot_id = change.entity_id
          AND snapshot.payload_hash = change.payload_hash
      ))
  ) AS invariant_immutable_change_without_typed_row;
