-- Phase 11 read-only production reconciliation.
-- Run with Wrangler D1 execute --remote after migration/smoke traffic, capture
-- the JSON output, and retain it with the release evidence. This file contains
-- SELECT statements only and intentionally emits no profile identifiers or
-- payload JSON.

SELECT metric, value FROM (
  SELECT 'accounts' AS metric, COUNT(*) AS value FROM accounts
  UNION ALL SELECT 'sync_heads', COUNT(*) FROM vnext_shadow_sync_heads
  UNION ALL SELECT 'changes', COUNT(*) FROM vnext_shadow_changes
  UNION ALL SELECT 'session_plans', COUNT(*) FROM vnext_shadow_session_plans
  UNION ALL SELECT 'evidence_events', COUNT(*) FROM vnext_shadow_evidence_events
  UNION ALL SELECT 'session_records', COUNT(*) FROM vnext_shadow_session_records
  UNION ALL SELECT 'athlete_intents', COUNT(*) FROM vnext_shadow_athlete_intents
  UNION ALL SELECT 'reset_tombstones', COUNT(*) FROM vnext_shadow_reset_tombstones
  UNION ALL SELECT 'legacy_snapshots', COUNT(*) FROM vnext_shadow_legacy_snapshots
  UNION ALL SELECT 'migration_runs_active', COUNT(*) FROM vnext_shadow_migration_runs WHERE status = 'active'
  UNION ALL SELECT 'migration_runs_rolled_back', COUNT(*) FROM vnext_shadow_migration_runs WHERE status = 'rolled-back'
  UNION ALL SELECT 'rolled_back_entities', COUNT(*) FROM vnext_shadow_rolled_back_entities
) ORDER BY metric;

-- Every value in this result set must be zero. These are authority, identity,
-- reset, reference and cursor invariants rather than product analytics.
SELECT invariant, violations FROM (
  SELECT 'athlete_identity_mismatch' AS invariant, (
    SELECT COUNT(*) FROM (
      SELECT profile_id FROM vnext_shadow_sync_heads WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_session_plans WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_evidence_events WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_session_records WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_athlete_intents WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_reset_tombstones WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_legacy_snapshots WHERE profile_id <> athlete_id
      UNION ALL SELECT profile_id FROM vnext_shadow_migration_runs WHERE profile_id <> athlete_id
    )
  ) AS violations
  UNION ALL SELECT 'change_cursor_behind', COUNT(*)
    FROM vnext_shadow_sync_heads AS head
    WHERE head.change_cursor < COALESCE((
      SELECT MAX(change.sequence) FROM vnext_shadow_changes AS change
      WHERE change.profile_id = head.profile_id
    ), 0)
  UNION ALL SELECT 'event_at_or_before_reset', COUNT(*)
    FROM vnext_shadow_evidence_events AS event
    JOIN vnext_shadow_sync_heads AS head ON head.profile_id = event.profile_id
    WHERE head.reset_at_ms IS NOT NULL AND event.occurred_at_ms <= head.reset_at_ms
  UNION ALL SELECT 'record_at_or_before_reset', COUNT(*)
    FROM vnext_shadow_session_records AS record
    JOIN vnext_shadow_sync_heads AS head ON head.profile_id = record.profile_id
    WHERE head.reset_at_ms IS NOT NULL AND record.completed_at_ms <= head.reset_at_ms
  UNION ALL SELECT 'record_without_plan', COUNT(*)
    FROM vnext_shadow_session_records AS record
    LEFT JOIN vnext_shadow_session_plans AS plan
      ON plan.profile_id = record.profile_id AND plan.plan_id = record.plan_id
    WHERE plan.plan_id IS NULL
  UNION ALL SELECT 'correction_without_target', COUNT(*)
    FROM vnext_shadow_session_records AS record
    LEFT JOIN vnext_shadow_session_records AS target
      ON target.profile_id = record.profile_id AND target.record_id = record.supersedes_record_id
    WHERE record.supersedes_record_id IS NOT NULL
      AND (target.record_id IS NULL OR target.plan_id <> record.plan_id)
  UNION ALL SELECT 'record_correction_unreachable', COUNT(*)
    FROM vnext_shadow_session_records AS record
    LEFT JOIN (
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
      SELECT profile_id, record_id FROM reachable
    ) AS reachable
      ON reachable.profile_id = record.profile_id AND reachable.record_id = record.record_id
    WHERE reachable.record_id IS NULL
  UNION ALL SELECT 'branched_record_correction', COUNT(*)
    FROM (
      SELECT profile_id, supersedes_record_id
      FROM vnext_shadow_session_records
      WHERE supersedes_record_id IS NOT NULL
      GROUP BY profile_id, supersedes_record_id
      HAVING COUNT(*) > 1
    )
  UNION ALL SELECT 'multiple_root_session_records', COUNT(*)
    FROM (
      SELECT profile_id, plan_id
      FROM vnext_shadow_session_records
      WHERE supersedes_record_id IS NULL
      GROUP BY profile_id, plan_id
      HAVING COUNT(*) > 1
    )
  UNION ALL SELECT 'event_target_missing', COUNT(*)
    FROM vnext_shadow_evidence_events AS event
    LEFT JOIN vnext_shadow_evidence_events AS target
      ON target.profile_id = event.profile_id AND target.event_id = event.target_event_id
    WHERE event.target_event_id IS NOT NULL AND target.event_id IS NULL
  UNION ALL SELECT 'reset_head_without_tombstone', COUNT(*)
    FROM vnext_shadow_sync_heads AS head
    LEFT JOIN vnext_shadow_reset_tombstones AS reset
      ON reset.profile_id = head.profile_id
      AND reset.tombstone_id = head.reset_tombstone_id
      AND reset.payload_hash = head.reset_tombstone_hash
    WHERE head.reset_at_ms IS NOT NULL AND reset.tombstone_id IS NULL
  UNION ALL SELECT 'active_migration_without_snapshot', COUNT(*)
    FROM vnext_shadow_migration_runs AS run
    LEFT JOIN vnext_shadow_legacy_snapshots AS snapshot
      ON snapshot.profile_id = run.profile_id AND snapshot.snapshot_id = run.snapshot_id
    WHERE run.status = 'active' AND snapshot.snapshot_id IS NULL
  UNION ALL SELECT 'rollback_ref_without_terminal_run', COUNT(*)
    FROM vnext_shadow_rolled_back_entities AS ref
    LEFT JOIN vnext_shadow_migration_runs AS run
      ON run.profile_id = ref.profile_id AND run.run_id = ref.migration_run_id
    WHERE run.run_id IS NULL OR run.status <> 'rolled-back'
  UNION ALL SELECT 'immutable_change_without_typed_row', COUNT(*)
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
) ORDER BY invariant;

SELECT status, COUNT(*) AS runs
FROM vnext_shadow_migration_runs
GROUP BY status
ORDER BY status;
