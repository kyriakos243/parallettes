# Parallette25 vNext Data, Persistence and Migration

[Back to the project map](../MASTER_PLAN.md)

**Status:** APPROVED FOUNDATION — PHASE 11 CONTROLLED RELEASE AUTHORISED

**Implementation authorised:** YES — PHASE 11 ONLY

This is the canonical detailed source for vNext data ownership, persistence, sync, legacy conversion, rollback and compatibility. Read it for domain contracts, evidence persistence, profile/sync work, migration rehearsal, release cutover or any change that could reinterpret or lose athlete history. Skill topology belongs in [Skill Architecture](VNEXT_SKILL_ARCHITECTURE.md); phase execution belongs in the [Implementation Roadmap](VNEXT_IMPLEMENTATION_ROADMAP.md).

## 1. Current v1.2 Persistence Baseline

The repository's designated v1.2 implementation baseline is release commit `61b0876`; its correspondence to the live deployed build must be verified before release/cutover work.

v1.2 is offline-first: IndexedDB profiles with localStorage mirrors, recent history/profile state, optional password-protected Cloudflare Worker/D1 sync, JSON backup/import, conflict merging and reset tombstones. It stores session outcomes, performed exercises, lightweight reviews, readiness Booleans, capped clean-session progression summaries, assessment placements and programme preferences. The existing single-profile JSON/conflict-max approach is useful legacy input but is not a durable evidence ledger.

## 2. Source-of-Truth Architecture

```text
versioned definitions + append-only observations + mutable athlete intent
                              ↓
                 rebuildable athlete state
                              ↓
               emphasis planner + session composer
                              ↓
             immutable plan → immutable record
                              ↓
                    further observations
```

There are three authority classes:

1. **Versioned definitions** define exercises, graphs, capacities, benchmarks and planning policies.
2. **Append-only observations**—evidence events and immutable Session Records—record what happened or was reported.
3. **Athlete intent** records goals, user-selected emphasis overrides, equipment, preferences and default session demand.

Derived capability, confidence, current trainability, recent load, working nodes and app-recommended emphasis are rebuildable projections. They are never separately user-maintained truth.

Use append-only history only where order/provenance matters: assessment/test observations, immutable workout records, restriction reports/clearances, imported legacy claims and corrections. Keep account identity, equipment, goals and preferences as ordinary versioned profile state. Do not event-source timer ticks, UI toggles or every preference edit.

### 2.1 Phase 1 implemented boundary

Phase 1 is implemented additively in [`app/vnext`](../app/vnext): [`contracts.ts`](../app/vnext/contracts.ts) is the public vocabulary, [`validation.ts`](../app/vnext/validation.ts) is the strict dependency-free runtime boundary, [`fixtures.ts`](../app/vnext/fixtures.ts) supplies representative contract examples, and [`legacyV12.ts`](../app/vnext/legacyV12.ts) captures a detached read-only compatibility snapshot. None is imported by the live v1.2 application.

The implemented defaults are deliberately small: schema/definition/projection versions are positive integers; persisted IDs are opaque and compatible with existing lowercase UUID/profile IDs while new authored definitions use lower-kebab IDs; prerequisites contain only a flat `allOf` and an optional flat two-to-four-option `anyOf`; benchmark reverse links are consistency-checked; and confirmation sources are limited to guided tests or authoritative Session Records. Evidence events use the canonical underscore discriminators below and cannot represent completed-session facts. A Session Record may hold a versioned benchmark observation directly, so projections never need a duplicate session event. Phase 1 defines no storage, migration, replay or projection behaviour.

Identity/version policy: an ID is immutable, never reused for a different concept and changed only when conceptual identity changes—not for copy edits. Existing v1.2 exercise/profile identifiers remain valid; aliases and tombstones are deferred to the migration phase. `schemaVersion` changes only when the persisted shape changes. An owning definition's positive-integer `definitionVersion` increments when its meaning changes; child nodes, facets and prescription variants inherit that owner version. Catalogue, benchmark and generator-policy versions are recorded at the observation/plan boundary so later interpretation never silently uses newer semantics. Runtime event, plan and record IDs remain opaque unique keys rather than requiring one UUID format.

## 3. Detailed Data Entities and Ownership

| Entity | Conceptual contents and authority | Main consumers | Visibility |
|---|---|---|---|
| **Exercise Definition** | Stable ID, instructions/media, equipment, roles, supported graphs/capacities, prescription variants, demand tags, benchmark links, substitutions/regressions and safety notes. | Assessment, planning, workout execution, evidence interpretation. | Name/instructions visible; most metadata internal. |
| **Development Graph** | Versioned observable nodes and `allOf`/limited `anyOf` prerequisite edges for one family, foundation track or composite graph. Owns topology. | Placement, next-target selection, Progress & Goals, specialist gates. | Simplified family milestones visible. |
| **Capacity Definition** | Small shared enabler with independently observable facets and benchmark references; never a percentage score. | Prerequisites, supporting-work selection and explanations. | Plain-language requirement may be visible. |
| **Benchmark Protocol** | Versioned movement/variation, metric, assistance/range, quality/safety criteria and confirmation/freshness policy. | Assessment, guided tests, progression and reconfirmation. | Test instructions/result visible. |
| **Athlete Evidence Event** | Immutable unique ID, timestamp, source, type, observation data and protocol/catalogue version. It owns non-session observations only. | Projections, audit, sync and migration. | Summaries may be visible; machinery internal. |
| **Athlete Intent** | Goals, user emphasis overrides, equipment, preferences and default demand. It never stores the app's current recommendation as athlete-owned truth. | Assessment branching, emphasis planner and composer. | Editable and user-facing. |
| **Session Plan** | Immutable prescription snapshot with rationale, intended items and definition/protocol/generator versions. | Player, history and later interpretation. | Planned workout visible. |
| **Session Record** | Sole authority for actual completed/modified/partial session facts, performed items with definition provenance, participation, review and any versioned in-session benchmark observation; references its plan. | History, load projection and deterministic performance interpretation. | Outcome visible. |
| **Derived Athlete State** | Rebuildable per-node capability/confidence, capacity findings, restrictions, recent tagged load, working nodes, maintenance needs, eligible targets, projection version and observation cursors. | Assessment continuation, readiness, Progress & Goals and planning. | Simplified states visible; no raw scores. |

Do not create separate persistent entities for a global athlete level, manually maintained readiness gates, a universal fatigue score, an assessment capability store, maintenance/regression exercise classes or graph edges duplicated on exercises.

### 3.1 Single ownership and corrections

- A Session Record owns completed-session facts. Do not emit a `session_recorded` event containing the same plan, items or outcome.
- Projections interpret Session Records and their benchmark observations directly. Standalone evidence events do not mirror or reference authoritative session facts.
- Session correction appends a replacement Session Record with `supersedesId`; evidence correction appends a superseding evidence event. Never rewrite history silently.
- App-recommended/current emphasis is derived planner state; only goals and user overrides live in Athlete Intent.

## 4. Evidence Event Contract

Use a small event union alongside Session Records:

- `performance_observed`: placement, guided test or other standalone result with target, quality, assistance, range, RPE or attempts where useful. Do not emit it for facts already owned by a Session Record.
- `restriction_reported`: affected demand/body area, severity category, source and time.
- `restriction_cleared`: athlete-reported resolution or expiry; high-risk work may still require reconfirmation.
- `legacy_claim_imported`: versioned placement hint from old manual readiness. It cannot satisfy a vNext prerequisite. Structured old assessment answers instead become provisional `performance_observed` events with original source/version.
- `evidence_corrected`: supersedes an erroneous evidence event.

Do not log every timer second. Retain a compact execution/session summary with enough participation and quality detail for deterministic interpretation.

### 4.1 Evidence strength

| Observation | Interpretation |
|---|---|
| Clean guided benchmark under a versioned protocol | Strong; may confirm the relevant milestone under its policy. |
| Clean prescribed target with meaningful participation and quality feedback | Medium; normally requires repetition across separated sessions for establishment. |
| Adaptive self-assessment | Weak/provisional placement only; no achievement or safety bypass. |
| Migrated manual readiness claim | Placement hint only; satisfies no node, capacity or safety prerequisite until validated. |
| Completion without target/quality detail | Load/session evidence only. |
| Skip or early end | No capability conclusion. |
| Ordinary failed balance/skill attempt | Expected practice evidence; does not erase capability. |
| Repeated valid benchmark failures | May contradict current performance confidence and lower working prescription. |
| Symptom, instability or uncontrolled exit | Immediate trainability input regardless of historical capability. |

## 5. Derived State and Replay

Maintain three distinct views:

1. **Demonstrated capability:** historical milestone state; pain, deload or inactivity does not erase it.
2. **Current performance confidence:** current, stale or contradicted; determines direct prescription versus reconfirmation.
3. **Current trainability:** per proposed prescription, `allow`, `modify` or `block`, with reason and safe alternative.

Milestone lifecycle is `Unknown → Estimated → Developing → Demonstrated → Established`, with confidence attached separately. Higher-node evidence may mark only mechanically necessary predecessors **satisfied for eligibility**, never falsely demonstrated.

Projection requirements:

- identical versioned definitions and ordered observations produce identical state;
- projectors are replayable, side-effect free and versioned;
- caches store projection version and observation cursor(s);
- policy changes rebuild projections rather than mutate raw history;
- no protocol/catalogue evidence is silently reinterpreted without its recorded version.

### 5.1 Phase 3 implemented replay boundary

Phase 3 implements this contract as a pure additive module under [`app/vnext/projection`](../app/vnext/projection). A normalised source is either one Evidence Event or one Session Record item. Exact duplicate IDs collapse once; divergent duplicates, invalid correction/supersession chains and unavailable definition versions fail closed. Replay uses the explicit projection cutoff plus `recordedAt`/occurrence time, resolves corrections and Session Record replacements before reduction, and produces stable source-addressable cursors. Session Records now carry `recordedAt`; standalone guided benchmarks carry a test-occasion ID so separated-session confirmation cannot be manufactured from several events in one sitting; successful-attempt observations carry both successes and total attempts.

One source may be evaluated against more than one finding only through a versioned directional protocol-reuse rule. Confirmation deduplicates by source and test/session context, provenance points back to that single source, and recent load counts it once. Stronger-node evidence may satisfy only an explicit mechanically necessary milestone predecessor while current; it never manufactures a predecessor lifecycle, capacity, safety result or `anyOf` choice. Cross-catalogue evidence is not merged into current findings without an explicit version-compatibility rule. Phase 3 adds no storage, sync, conversion or production writes; those remain Phase 4 work.

## 6. Target Persistence and Sync

### 6.1 Static versioned definitions

- Exercise definitions and stable aliases/deprecations.
- Development graphs/prerequisite grammar and capacity definitions.
- Benchmark protocols with confirmation/freshness policies.
- Prescription-demand/compatibility rules and generator/policy version.

### 6.2 Athlete storage

- Compact account/profile and mutable Athlete Intent.
- Append-only Evidence Event and immutable Session Record stores in IndexedDB and normalised D1 storage.
- Immutable Session Plans referenced by Session Records.
- Rebuildable Derived Athlete State cache.
- Recoverable legacy snapshot during the migration/rollback window.

Cloud sync exchanges observation deltas by stable event/record ID and cursor, unions unique observations and rebuilds projections. It must not max-merge progression counters or make last-write-wins profile blobs the evidence authority.

Operational requirements:

- offline use remains first-class and remote sync optional;
- migration, import and sync are idempotent;
- stable exercise IDs remain history-resolvable through aliases/tombstones;
- JSON export/import includes observations, intent, definition/migration metadata and reset state;
- reset/deletion is explicit and uses tombstone/purge semantics;
- authentication, password, recovery and device-session security remain intact.

### 6.3 Phase 4 implemented shadow boundary

Phase 4 implements this target without changing production authority:

- `parallette25-vnext-shadow` is a separate IndexedDB, not an upgrade of the live `parallette25-v2` database. It stores immutable Evidence Events, Session Plans and Session Records; mutable Athlete Intent; the effective reset head; an outbox and numeric cloud cursor; rebuildable projection cache entries; exact legacy snapshots; and migration-run receipts.
- Every immutable append is validated and canonically SHA-256 hashed. A missing stable ID inserts once, the same ID/hash is an idempotent no-op, and the same ID with a different hash is a hard conflict. Session Plan and Session Record append atomically; no Evidence Event duplicates actual session facts. Corrections, clearances and replacements are dependency-ordered before upload and cannot be stored without their targets.
- Athlete Intent resolves only by its own `updatedAt`; an equal-time divergent payload is an explicit conflict. The highest reset cutoff wins, with canonical-hash tie-breaking for equal cutoffs. Cache lookup requires the exact source, `asOf`, projection, catalogue, definition and policy identity and is invalidated on any truth/intent/reset change.
- JSON export includes active observations, immutable plan references, one-to-one native/original-run provenance, intent, reset state, definition/policy metadata, snapshots and migration receipts. It excludes caches, outbox/cursor transport state and all account credentials. Import validates the complete bundle first, applies the newest reset before union, and is idempotent.
- D1 migration `0002_vnext_shadow_observations.sql` is additive and normalised. Authenticated `POST /vnext/shadow/sync` exchanges byte-, item- and Free-D1-query-bounded stable-ID/hash deltas and numeric cursors, preserves migration provenance and applies the same conflict/reset/rollback rules. Ahead-of-server cursors fail closed. It is unavailable unless `VNEXT_SHADOW_MODE=true`; Phase 4 neither applies that migration nor enables/deploys the route live.
- Reset is an irreversible lower bound: facts at or before the cutoff and every later correction, clearance or replacement made orphaned by that purge are removed to a fixed point, locally and remotely. Rollback is different: immutable converter payloads remain in non-projecting logical quarantine so a later active co-owner or native dependency can reactivate/reuse them without duplicate truth or cursor rewind.
- Existing bearer authorization, bounded request reading, password/recovery/session handling and account-deletion cascades are reused. Local sign-out, deletion and factory reset additionally clear isolated shadow data so a shared browser does not retain it.

### 6.4 Phase 5 assessment write boundary

The shadow IndexedDB advances additively to version 2 with one `assessment-drafts` store keyed by athlete. A draft is resumable local UI workflow state only: it is not an observation, is not projected, is not synced or exported, and is cleared with the athlete/device security lifecycle. Revision/time checks reject stale or divergent draft overwrites. Editing is allowed only before commit; after commit, corrections must use the existing append-only evidence mechanisms rather than mutating emitted truth.

Explicit assessment completion writes Athlete Intent only when goals/equipment were selected and appends deterministic, retry-safe weak self-assessment events for answered protocol anchors. A restriction answer becomes one restriction event; an anchor symptom remains one symptom performance observation and is not duplicated as a second fact. Guided tests append exact versioned standalone observations with a real test-occasion ID only after the current assessment/derived-state gate allows the protocol. Minimal workout capture builds and appends the plan/record pair; it never emits a duplicate session Evidence Event. Production v1.2 profile, assessment and recommendation writes remain unchanged.

## 7. v1.2 Conversion Map

| v1.2 data | vNext treatment |
|---|---|
| Account/auth, username, equipment and preferences | Migrate directly; preserve password/recovery/session security. |
| Session history and next programme day | Convert usable history once to explicitly `legacy-v1.2-sparse` immutable Session Plan/Record pairs; retain next-day position until planner cutover. Never also create duplicate session events. |
| Detailed reviewed exercise outcomes | Preserve once in the sparse Session Record. Known participation may carry zero item seconds with `legacy-unknown`; reconstructed default prescriptions and missing item timing can produce at most Developing evidence, never benchmark confirmation or Established capability. Practice history retains load/history context but carries no progression target/review evidence. |
| Capped `cleanSessions` without detailed backing | Import as provisional legacy evidence only; never fabricate reps, seconds, session count beyond stored data or dates. |
| Structured adaptive-assessment placements/answers | Convert each source answer at most once: to provisional `performance_observed` only when one unambiguous vNext subject exists, otherwise to one weak generic legacy assessment claim. Preserve original source/version and never fan one answer into duplicate subjects. |
| Readiness `true` | Convert to versioned `legacy_claim_imported` hint. Because old gates bundle heterogeneous standards, it satisfies no vNext node/capacity/safety prerequisite. |
| Readiness `false` or missing | Unknown, not incapable. |
| L1/L2/L3 choice or assessment suggestion | Foundation → Technique/Easier, Progress → Standard, Challenge → Challenge as demand preference only; infer no family capability. |
| Swaps/timing/custom preferences | Preserve where compatible; reset only unmappable fields safely and explain the reset. |
| Old/removed exercise IDs | Preserve in history via aliases/deprecations; exclude only from new generation. |
| `progressResetAt` / reset tombstone | Carry forward as the migration lower bound and deletion tombstone. Never resurrect or merge pre-reset history/counters. |

Do not force existing users through full onboarding. Request only targeted confirmation for selected, advanced or safety-critical goals. Migrated achievements, estimates and hints must display distinctly.

Phase 4 converter snapshot/run IDs derive from converter version plus athlete and the canonical fingerprint of a whitelisted v1.2 authority surface; device-local sync/account fields cannot change migration identity or enter recovery material. The caller supplies a capture time as a preflight assertion that must not predate the source, but the persisted `capturedAt`/run boundary is the source-owned `sourceProfile.updatedAt`; it is not presented as the wall-clock execution time. Unchanged source therefore converts byte-identically across devices even when callers inspect it at different later times. Converted sessions and timestamped claims use their source-owned times; genuinely untimestamped readiness, assessment or progression hints use the conservative stable `sourceProfile.createdAt` fallback and are omitted after any reset rather than being made artificially fresh by a later profile save. `progressResetAt` is applied strictly (`occurredAt`/`completedAt` must be later): pre-reset/equal sessions and claims are omitted; untimestamped aggregate progression cannot survive a reset. Unknown exercises, malformed assessment facts and other unrepresentable detail remain recoverable in the exact snapshot rather than being guessed into vNext truth.

## 8. Migration and Release Safety

Migration must be:

- idempotent, resumable and safe to rerun;
- preceded by a recoverable snapshot;
- rehearsed on copied/synthetic profiles;
- shadow-projected and reconciled before live cutover;
- compatible with old reads and rollback throughout the agreed observation window;
- isolated by coherent feature/read-write cohorts so vNext-only observations are never shown through a recommendation path that cannot consume them.

The sequence is fixed:

1. Define and validate contracts without writing profiles.
2. Build replayable projectors and test in-memory legacy fixtures.
3. Add observation persistence, sync and converter in shadow mode; delete no legacy field.
4. Run isolated vNext capture/planning through a coherent authority path.
5. Rehearse migration, deployment order and rollback in Phase 9.
6. Complete comprehensive validation and owner release review in Phase 10.
7. Only after explicit Phase 11 approval: verify the live baseline, snapshot, deploy compatible schema/API/app changes, run live migration, reconcile and switch production authority.
8. Retire rollback or delete legacy data only as a separately approved maintenance task.

### 8.1 Phase 4 recovery and rollback status

The converter captures and verifies an exact detached legacy profile before writing shadow entities. A migration run lists every generated immutable ID; export/import carries exact native/original-run provenance, while active run manifests provide multi-owner identity for byte-identical facts shared by more than one source revision. Rolling back creates a terminal run revocation and removes converter-only facts from active projection/export, but retains their raw immutable payloads in logical quarantine. Native facts, native correction/replacement dependencies and facts claimed by another active run remain active; a later co-owner can reactivate a quarantined fact without replaying or double-counting it. Converter-owned mutable intent is removed only when its exact run rolls back. The original snapshot and reset lower bound remain. Synced revocations and generated-entity tombstones reject stale uploads, while dependency closure prevents cursor-order data loss. Snapshot recovery validates canonical source hash, whitelisted shape, deterministic identity and run relationship before returning the legacy profile.

These mechanisms are implemented and tested only in local/in-memory shadow scenarios. No production database migration, live profile conversion, destructive deletion, deployment or authority switch has occurred.

### 8.2 Phase 9 rehearsal result

Phase 9 exercised the complete shadow-data path without changing production authority. Local truth remains the isolated vNext IndexedDB: immutable Evidence Events, Session Plans and Session Records; mutable Athlete Intent; the effective reset tombstone; sync outbox/cursor; recoverable legacy snapshots and migration-run receipts. Assessment drafts and active-workout/guided retry envelopes remain local workflow state. Derived Athlete State is still a rebuildable cache rather than truth. Remote truth is the corresponding normalised, additive D1 observation model behind authenticated `POST /vnext/shadow/sync`; it does not store projection caches or replace the v1.2 profile blob. Cache identity includes the exact trainability-request fingerprint, and a cache write failure cannot turn a successfully rebuilt authoritative source snapshot into a failed observation append.

The app exposes one narrow authenticated adapter, `syncVNextShadowObservations(store, profileId, options)`. It uses the existing bearer/session boundary and the fixed shadow endpoint internally, clears invalid local authentication consistently on `401`, never returns or persists a token, and never calls the legacy `saveProfile` path. Paged delta exchange is resumable from the durable cursor; offline appends remain in the outbox until acknowledged. Stable ID plus canonical hash makes retries idempotent, rejects divergent immutable payloads and converges disjoint multi-device observations by set union without double-counting. Local Session Record append additionally enforces one initial record per plan and one linear supersession chain. Multiple genuine clearances of one explicit restriction can coexist after device union; projection validates every link and folds the earliest valid clearance deterministically while preserving all raw events.

Copied-profile conversion was rehearsed as a deterministic prepare/apply operation. The same whitelisted v1.2 source produces the same snapshot, run and converted entity identities; repeating it is a duplicate no-op. Sparse converted Session Records retain explicit legacy provenance, and the presentation provenance adapter classifies them as migration-sourced rather than ordinary session confirmation. Import wording therefore remains an imported/provisional starting point when a converted fact supports one, never an inflated achievement. Reconciliation rebuilt projections and plans from the converted canonical sources.

JSON export/import round-tripped observations, immutable references, intent, reset state, definition/policy metadata, migration provenance, snapshots and run receipts; repeated import remained idempotent. The newest `progressResetAt`/reset tombstone is an irreversible lower bound applied before union, so an older import or stale device cannot restore facts at or before it. Migration rollback revokes converter ownership from active projection while retaining native observations, the reset boundary, quarantined immutable payloads, the exact pre-migration snapshot and the terminal run receipt. Snapshot recovery verifies the canonical source fingerprint and reconstructs the copied legacy source exactly.

Release isolation uses a separate non-production Worker configuration with placeholder-only Worker, D1 and KV identities plus an access-controlled isolated origin. A nested same-origin RC is not eligible as Phase 11 promotion evidence. Production uses its own IndexedDB and identity/recovery namespace so preview state cannot become production truth. The fixed order is: verify baseline/freeze identity; snapshot copies; apply additive schema; deploy the disabled shadow API; deploy isolated RC assets disabled; convert copied/synthetic profiles; enable staging shadow sync; atomically switch the isolated cohort's vNext read/write authority; reconcile observations/plans; freeze the Phase 10 candidate. Rollback revokes access/authority, leaves invalid RC startup inert, drains active sessions, disables shadow writes and verifies v1.2 while retaining additive schema, vNext observations, snapshots, tombstones and legacy data.

All Phase 9 evidence came from local IndexedDB, deterministic/in-memory transports, copied or synthetic profiles and staging configuration/manifest contracts. No live D1 migration, live profile conversion, external deployment, production cache or service-worker takeover, production authority switch, or cutover was executed.

### 8.3 Phase 10 comprehensive data validation

Phase 10 revalidated the complete observation lifecycle rather than isolated stores. Local authority remains the separate IndexedDB ledger of immutable Evidence Events, Session Plans and sole-authority Session Records, mutable Athlete Intent, reset tombstone, outbox/cursor, migration receipts/snapshots and rebuildable exact-version projection caches. The authenticated D1 path remains a normalised shadow delta store; it never becomes a last-write-wins profile or cache authority. Stable ID plus canonical hash collapses exact retries and rejects divergent immutable payloads, while Session Records retain one initial record per plan and one linear correction chain.

Comprehensive fixtures pass offline append/replay, interrupted cursored sync, duplicate replay, disjoint two-device union, concurrent clearances, conflicting immutable IDs, export/import round-trip, copied v1.2 conversion and repeated migration, snapshot recovery, converter rollback/quarantine, 300-session local load and reset followed by stale-device reconnect. The newest `progressResetAt` remains an irreversible lower bound before every replay/import/sync union, so pre-reset facts and dependent chains cannot resurrect.

The vNext account adapter is identity/session only: it never hydrates, merges or writes the v1.2 profile blob. Account observations do not mount until the matching bearer is unexpired and accepted; rejection, identity mismatch, sign-out or token removal locks and unmounts them. Same-tab signals, cross-tab storage changes, visibility revalidation and expiry checks close already-mounted access, while a valid unexpired bearer preserves the intended offline-first path during transient network failure. URL-selected athlete IDs and legacy account-ID fallbacks cannot open an account store.

All checks used local IndexedDB, deterministic transports, synthetic/copied profiles and unapplied staging configurations. No live D1/schema operation, profile conversion, deployment, cache takeover, production migration or authority switch occurred.

### 8.4 Phase 11 operational release boundary

Phase 11 promotes accepted candidate `parallette25-vnext-rc.3` and source fingerprint `1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47` to production identity `parallette25-vnext.1`; the RC identity remains immutable provenance rather than being renamed. The profile API health response binds release identity to the exact production D1 UUID, full schema fingerprint and applied migration-history row. `VNEXT_SHADOW_MODE` and `VNEXT_PRODUCTION_AUTHORITY_MODE` remain independently fail-closed; final readiness requires both so sync and stale-v1 write exclusion activate together at cutover.

Live conversion is intentionally per-athlete on first vNext access, not a server-side bulk rewrite. The client reads one exact v1.2 authority surface, creates its deterministic recoverable snapshot/run/entities, applies them idempotently to the isolated local ledger, then reconciles the authenticated observation delta. A repeat open or second device converges through the same stable IDs and migration receipt. Operational migration counts therefore reconcile against the activated cohort during the observation window, not every legacy account.

The canonical [production release runbook](VNEXT_PRODUCTION_RELEASE_RUNBOOK.md) fixes the snapshot/schema/API/app/service-worker/authority order, immediate smoke flows, rollback triggers and observation-window closeout. `profile-api/phase11-reconciliation.sql` is a read-only aggregate/invariant query that exposes no profile IDs or payloads; `scripts/vnext-phase11-release-ops.mjs` validates source identity, operator evidence, exact health, migration counts, zero data-integrity violations and non-destructive rollback readiness. These tools never deploy, migrate, restore, delete or embed credentials. Normal rollback disables vNext authority/code while retaining additive schema, observations, snapshots, reset tombstones, migration receipts and all legacy data; D1 Time Travel/export restoration remains a separate destructive incident decision requiring new explicit owner approval.

## 9. Compatibility Guarantees

- Existing accounts, history, equipment and useful preferences are preserved wherever safely interpretable.
- Old records remain readable even when exercises are deprecated.
- No legacy claim becomes more precise or authoritative than its stored source permits.
- Reset history stays reset.
- v1.2 remains authoritative outside isolated vNext cohorts until Phase 11 cutover.
- No live migration or production authority switch occurs before explicit Phase 11 owner approval.
