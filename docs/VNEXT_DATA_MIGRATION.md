# Parallette25 vNext Data, Persistence and Migration

[Back to the project map](../MASTER_PLAN.md)

**Status:** APPROVED FOUNDATION — PHASE 11 COMPLETE; HISTORICAL ARCHIVE EXCEPTION ACCEPTED

**Implementation authority:** MASTER_PLAN.md owns the current owner-approved task and implementation state.

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

### 5.2 Batch A candidate compatibility — 2026-10-17

The owner accepted Batch A’s animations and authorised release on 2026-10-17. Production selects catalogue v3/projection v3 with immutable definition history v1→v2→v3; the historical RC.3/default exports deliberately remain v1→v2. Both historical bundles and their fingerprints remain immutable. Compatibility explicitly admits v1→v3 only for v1-backed subjects and v2→v3 only for the 94 v2-backed protocol subjects, retaining the historical v1→v2 rules. The five newly backed subjects receive no backdated findings, protocol reuse or predecessor implications.

Focused replay checks cover every historical protocol under both old catalogues, new-protocol confirmation, wrong catalogue/conditions/prescription, reduced practice, freshness and preserved achievement. The candidate changes no observation shape, storage schema, reset/rollback or sync authority. The release binds the runtime’s selected bundle/history and projection policy, catalogue fingerprint, separate media acceptance and exact artifact together. Recovered workouts keep their native catalogue for playback, swaps and Session Record construction; pending assessment/guided results retain their original catalogue. New workflows and export metadata use v3 and all three histories. No old immutable fact is rewritten. Older clients cannot interpret v3 facts: they must update, and publishing a v2-only reader after v3 observations exist is not a valid code rollback. Retain v3 readers for a frontend repair or use the existing controlled v1 authority rollback procedure while preserving all additive data. Never restore a pre-release database over new observations as a normal rollback.

### 5.3 Batch B candidate compatibility — 2026-10-17

The separately authorised, isolated candidate uses catalogue/projection v4 and complete immutable history `[1,2,3,4]`. It preserves accepted Batch A/v3, both earlier bundles and all existing fingerprints. Explicit compatibility adds v1→v4 and v2→v4 only for their already-backed subjects, and v3→v4 only for the 99 already-backed v3 protocol subjects. No Batch B outcome receives historical achievement, new protocol reuse or predecessor implication. Only five graph availability/protocol mappings change; original prerequisites and boundaries stay frozen.

Focused candidate-coordinator checks cover native bundle lookup, v4 practice/save/retry, practice-to-guided confirmation and immutable export/import. Historical protocol replay covers all three prior catalogues. This is candidate validation, not production activation or a completed release-upgrade audit. Production continues to select v3; no UI/runtime authority, observation shape, schema, sync, reset, import or rollback contract changes. An approved future v4 release must bind coherent bundle/history/policy, exact owned-media acceptance and artifact gates, retain v1–v4 native workflow readers, and update export metadata before activation. A bare v3 reader cannot interpret later v4 facts; preserve v4 compatibility for repair or follow the separately controlled retained-v1 authority rollback. Never overwrite new observations with a pre-release database.

### 5.4 Batch C candidate compatibility — 2026-10-17

The isolated catalogue/projection-v5 overlay retains immutable definition history `[1,2,3,4,5]`, including the exact owner-accepted Batch B candidate. Historical rules remain; explicit v1/v2/v3→v5 compatibility admits only each source catalogue’s already-backed subjects, while v4→v5 covers only the 104 unchanged v4 protocol subjects. The six new subjects receive no historical backcredit, protocol reuse or predecessor implication. Only six graph availability/protocol mappings change; capacities, prerequisites and boundaries remain frozen.

Focused candidate checks replay every protocol under native catalogues v1–v4, reject wrong catalogue/conditions/reduced prescriptions, preserve established-but-stale achievements, and exercise v5 practice/save/retry, later exact guided confirmation and immutable export/import. Production remains Batch A/v3; candidate injection is test-only. No observation format, storage schema, account, sync, reset, migration, rollback or live data changes. Future combined activation must bind all approved bundle/history/policy/media and exact artifact gates together, retain native v1–v5 readers and export metadata, and preserve later facts during frontend repair. Older v3/v4-only readers are not a valid repair after v5 facts exist; controlled retained-v1 authority rollback remains separate. Never restore a pre-release database over new observations.

### 5.5 Batch D candidate compatibility — 2026-10-17

The isolated catalogue/projection-v6 overlay retains immutable history `[1,2,3,4,5,6]`, including accepted B/v4 and C/v5. Historical rules remain unchanged. Explicit v1/v2/v3/v4→v6 compatibility admits only each source catalogue’s already-backed subjects; v5→v6 covers only the 110 unchanged v5 protocol subjects. The four new transitions receive no historical backcredit, protocol reuse or predecessor implication. Only their availability/protocol mappings change; endpoint achievements cannot award a continuous transition.

Focused checks replay every protocol under native v1–v5 and exercise v6 practice/save/retry, later exact guided confirmation and immutable export/import. Production remains Batch A/v3; candidate injection is test-only. No schema, observation format, account, sync, reset, migration, rollback or live data changes. Future combined activation must bind the approved bundle/history/policy/media and exact artifact together, retain native v1–v6 workflow readers and export metadata, and preserve all later facts during frontend repair. Older readers that omit later catalogues cannot repair a deployment after later facts exist; retained-v1 authority rollback remains separately controlled. Never overwrite new observations with a pre-release database.

### 5.6 Batch E candidate compatibility — 2026-10-17

The isolated catalogue/projection-v7 overlay retains immutable history `[1,2,3,4,5,6,7]`, including accepted B/C/D. All historical rules remain unchanged. Explicit v1–v5→v7 compatibility admits only each source catalogue’s already-backed subjects; v6→v7 covers the 114 unchanged v6 protocol subjects. The five new specialist subjects receive no historical backcredit, protocol reuse or predecessor implication. Single/lower-V, light-hand/assisted and single-press evidence cannot award their new counterparts. Only availability/protocol mappings change; prerequisites, specialist boundaries and capacity semantics stay frozen.

Focused checks replay every prior protocol under its native catalogue and exercise v7 practice/save/retry, later exact guided confirmation and immutable export/import. Production remains A/v3; candidate injection is test-only. No schema, observation format, account, sync, reset, migration, rollback or live data changes. Future combined activation must bind coherent approved bundle/history/policy/media/artifact, retain native v1–v7 workflow readers and export metadata, and preserve later observations during repair. Readers omitting later catalogues cannot safely repair after later facts exist; retained-v1 authority rollback remains separately controlled. Never overwrite new facts with a pre-release database.

### 5.7 Batch F candidate compatibility — 2026-10-17

The isolated catalogue/projection-v8 overlay retains immutable history `[1,2,3,4,5,6,7,8]`, including accepted B–E. Historical rules remain unchanged. Explicit v1–v6→v8 compatibility admits only each source catalogue’s already-backed subjects; v7→v8 covers the 119 unchanged v7 protocol subjects. No new dynamic/transition subject receives historical backcredit, protocol reuse or predecessor implication. A held endpoint, eccentric-only result, 90-degree cycle or opposite direction never silently awards another outcome. Only five availability/protocol mappings change; topology, prerequisite and capacity definitions stay frozen.

Focused checks replay all prior protocols under their native catalogues, reject wrong catalogue/conditions/reduced prescriptions, retain stale achievements and exercise v8 practice/save/retry, later exact guided confirmation and immutable export/import. Production remains A/v3; candidate injection is test-only. No schema, observation format, account, sync, reset, migration, rollback or live-data changes. Future combined activation must bind all approved bundle/history/policy/media, the pinned candidate sizing CSS and exact artifact together, retaining native v1–v8 workflow readers and export metadata. Preserve later facts during frontend repair: readers omitting later catalogues cannot safely repair after later facts exist. Retained-v1 authority rollback remains separate; never overwrite new facts with a pre-release database.

### 5.8 Combined progression release — 2026-10-17

After accepting all B–F animations, the owner authorised their combined checks and deployment after they pass. Production now selects the coherent v8 bundle/policy and complete immutable history v1–v8 through a separate accepted release adapter. Frozen RC/v2 and historical candidate/acceptance ledgers remain unchanged. Native pending assessments/guided retries, recovered plans/swaps/prepared completions and exact save retry retain their original catalogue; new work uses v8. Export metadata enumerates the selected native history and v8 policy. No schema, account, observation format, migration or authority switch is needed.

Combined safeguards replay native v1–v8 workflows and mixed export/import, invalidate old caches, bind all 30 accepted guides/player sources and the exact F sizing stylesheet, and preserve specialist opt-in/exact-goal gates. After any v8 facts, a bare A/v3 frontend is not a safe repair: retain all v1–v8 readers or use the separately controlled retained-v1 authority rollback, preserving observations. Never restore a pre-release database over newer facts. Fresh full/accounts encrypted exports, isolated restore and all 14 invariants pass; temporary CLI access is logged out. Final artifact/deployment evidence belongs in release runbook Section 15.

### 5.9 Mixed workout execution compatibility — 2026-10-17

The owner-approved mixed structure uses new generator-policy identities with unchanged catalogue/projection v8 and unchanged Session Plan/Record wire fields. Policy-specific execution derives from native ordered items, purposes, definitions and safe selections. The current client and current Worker validators accept the new plans and completion pairs without a Worker/schema deployment. Original plan IDs/bytes, readers and timing remain immutable; only newly generated adapted plans receive new semantic IDs. History/export/import/sync retain the generator identity in each plan, and the projection-policy metadata retains its existing meaning. Exact retry still saves one authoritative record.

Local mixed timer drafts are version 3 and retain group locks, exact cursor/countdown and measured per-item facts; old v1/v2 drafts use their original runner. Recovered completion selects the native policy reader. A repair after mixed workouts exist must retain both old and mixed-policy execution readers plus all v1–v8 definition readers; the prior combined-release frontend alone is not a valid active-workout downgrade. No historical observation rewrite, new migration, schema/API deployment, reset or data deletion is included.

### 5.10 Timer reliability compatibility — 2026-10-18

The foreground clock changes no immutable plans, records, evidence or sync fields. Local v2 native-order and v3 mixed drafts gain only an optional validated pause reason; existing drafts and the v1 conversion remain readable and reopen paused. Timer deliveries update the measured checkpoint synchronously before persistence; page-hide saves it without crediting hidden time. The production native-order player retains the original v1/v2 parsing and ordering contract while the SHA-pinned historical runner stays untouched. Repair must retain both native and mixed execution and v1–v8 definitions. No production SQL mutation, migration, reset or rollback retirement is included.

### 5.11 Setup and goal local compatibility — 2026-10-18

Assessment drafts add optional validated local-only `revisitAnswers` and `goalSelectionVersion: 2`. Revisit answers are UI prefills, disjoint from active answers, and never influence routing, projection or committed evidence until explicitly confirmed. New drafts and explicitly reconfirmed goal answers use the modern main/up-to-two-supporting interpretation; unmarked old drafts retain their original mapping for byte-compatible retry of partially saved observations. Committed drafts clear revisit hints. Native assessment definitions and old readers remain available; there is no storage database-version bump or observation/API/schema change.

Explicit Progress goal changes reconcile a paused draft's intent seed and answered goal selection before saving Athlete Intent. Earlier safety/context answers remain; downstream answers that depended on the previous goals are discarded. Unanswered/targeted drafts retain their existing route/targets and receive the updated seed. Seed data includes existing target IDs, interests and valid emphasis. Draft-first persistence prevents a newly saved intent from coexisting with an obsolete goal answer. If the subsequent intent write fails, the local draft retains the user's explicit requested choice, the UI reports failure, and retry is supported. Focused fault-injection tests cover both write boundaries and exact native partial-commit recovery. This introduces no migration, production data rewrite or reset.

### 5.12 Short-workout preference compatibility — 2026-10-19

The optional localStorage key `parallette25-${storageNamespace}-short-workout-v1:${athleteId}` stores version 1, a supported 5/10/15/20-minute duration and a stable focus token. Graph IDs and sorted capacity IDs identify choices independently of translated labels or option order. Invalid/unavailable values fall back to current defaults, and inaccessible/full storage never blocks preview creation. The keyed builder separates athletes and release namespaces; existing account sign-out/deletion clearing includes this prefix. These convenience choices are not synced, included as observation evidence, or used to restore a workout. Equipment and effort continue to come from current profile defaults unless edited in the open form. Section scroll/disclosure memory exists only in React state. No IndexedDB version, immutable observation, migration, backup format, schema or API change is introduced.

### 5.13 Experienced placement compatibility — 2026-10-19

Production wraps the frozen combined v8 catalogue with assessment placement policy 2 and projection policy 9. Definition bundle/history v1–v8, media, native plans, records, observation payloads, schema and Worker remain unchanged. Local assessment draft schema 1 accepts policy 1 and 2; new typed skill-selection answers belong only to policy 2. Existing policy-1 drafts keep their exact routing and weak evidence bytes. Back prefills remain local hints, with canonical answer comparison avoiding property-order loss; changed answers still invalidate dependent choices.

Projection v9 may use current exact measured readiness plus the measured whitelisted ordinary variation for its own working-practice selection. It changes neither achieved predecessors nor successor eligibility. Guided normalization resolves exercise/prescription identity through the event’s exact native protocol, allowing existing recovery/load rules to recognise the tested exercise. Earlier projection policies retain their old normalization behavior. New guided observations use one athlete/UTC-day occasion identity; already persisted occasions and events are never rewritten. Exact saved retries may succeed even after the offer disappears, but only when the reconstructed immutable event matches byte-canonically; divergent retries fail closed.

The saved-check summary is a read-only view of active guided observations from the current assessment day, filtered through the projected load sources so corrected/reset facts do not reappear. It records no invented activity time and creates no duplicate Session Record. Old v8 plans, records and weak/guided observations round-trip unchanged through export/import under policy 9. A frontend repair must preserve policy-2 draft reading, exact native histories and the measured/load semantics; do not downgrade over new work or restore old SQL over newer observations. No account reset, SQL migration, API deployment or data deletion is included.

The iPhone review exposed an older pending guided envelope with blank attempt fields serialized as `0 / 0`; validation correctly rejected it, but exact-only recovery trapped the user. Recovery now identifies only malformed attempt measurements and offers explicit review of the original entry. Opening review changes no stored input. Saving corrected numbers or an explicit unattempted/not-yet result retains event, protocol, occasion and check timestamps and uses the normal append/gating path. Saved observations still require canonical equality; valid pending results remain exact-only. No count is inferred or rounded, and an unattempted result carries no invented measurement. The pending envelope schema and immutable contracts remain unchanged.

### 5.14 Product-review restriction compatibility — 2026-10-19, local completion

Production selects additive projection policy 10 over the same frozen definition history v1–v8 and placement policy 2. Native policy 9 and older readers remain available. Exact-version/prescription registries add current restriction exposure and required equipment checks without rewriting demand, media, plans, historical load or observations. No schema, Worker or SQL migration is required.

Submitted positive setup answers append standalone `restriction_reported` evidence identified deterministically by the native draft and exact answer. Save the draft first, then append; refresh recovers any submitted report before projection, and failure rejects planning. Back/edit/restart first preserves the old accepted report. Native complete/partial commits retain original bytes; new completion reuses the submitted event rather than duplicating it. Local draft monotonic time remains a projection cutoff floor even when Back removes the answer. An unfinished None answer never clears evidence.

Early-finish restriction reports use the coordinator's validated append API and preserve exact event identity/time across failure/reload. Optional `pendingRestriction` in the existing local workout-recovery envelope holds the prepared report before append; successful append/refresh removes only that pending field. Existing execution facts and the eventual immutable Session Record are unchanged. Optional saved Custom request/equipment context supports conservative fresh Start/Resume checks; older envelopes still read. Command serialization and a final source fingerprint check prevent approval from known superseded state. Old selections/options remain readable for recovery but never grant current safety authority.

Focused injected-failure, duplicate-retry, wrong-athlete, historical native round-trip and pending-form tests pass. This batch changes no real user data and is not deployed; general review/sign-out durability is outside its scope.

### 5.15 Product-review unfinished-work protection — local implementation

Workout recovery keeps a version-1 review draft inside the existing athlete-scoped envelope: the original plan ID, current review position and explicitly selected answers. Reload restores matching known items only; malformed/foreign hints never manufacture answers or alter measured facts. A presentation refresh for the same session retains current inputs. New sessions cannot inherit feedback even when their movements match.

Each timer checkpoint now catches storage failure, stops measured timing immediately and retains the newest facts in memory. Closing, advancing, swapping and resuming are blocked until an explicit successful retry; retry never restarts timing. A rejected completion retains its final completed item and exact in-memory candidate. Review checkpoint failure similarly keeps the newest answers and blocks final save/account navigation with a visible retry. The screen must remain open while a device cannot save; no claim is made that unsaved memory survives forced OS termination. Prepared Session Records retain the existing immutable single-record/exact-retry path.

Sign-out inspects saved previews, active timers, pending reviews/prepared saves, guided results and unfinished setup before clearing anything. The user can return to training or explicitly discard the exact inspected local drafts. Any draft change requires a fresh choice; inaccessible storage fails closed. Unsynced observation events are never discarded through this option. The pending snapshot is checked again after sync; local account access locks before waiting for remote logout. Cleanup remains athlete/environment-scoped and includes the original shared native/mixed timer key.

Final integrated QA adds exact-snapshot recovery guards: an older open view cannot knowingly replace or remove a newer timer, review, prepared save or guided correction. Both current players pause when another view changes their checkpoint; queued starts, saved-result retries and discard confirmations recheck their retained envelope. Discard checks both timer and plan envelope before removing either. Sign-out also compares the raw local envelopes synchronously before locking access; the IndexedDB deletion transaction independently requires an empty outbox and the exact inspected setup draft. A late change aborts deletion instead of silently losing it. These safeguards add no schema or historical-data conversion.

Progression-check recovery adds a discriminated version-2 `kind: progression` envelope in the existing guided key, retaining native catalogue version and exact result identity/occasion/measurement. Existing version-1 assessment recovery still uses its original draft/catalogue. Checks do not rewrite setup. A pending-result screen offers an explicit two-step local discard when retry cannot proceed; exact-envelope comparison protects a newer correction, removal failure retains the screen, and already appended observations are never deleted. New mixed generator version 2 changes only freshly generated plans and admits native version-1 execution/readers; definitions v1–v8, prior plans, records, IDs and sync payloads remain unchanged. No IndexedDB/Worker schema or real-user data change is required.

Focused tests cover actual review handlers/reader and write-failure retry, both production runner lifecycles, exact pending sign-out consent plus outbox protection, and native guided recovery/routing. An isolated browser journey restored a two-movement review at movement two with its earlier status, effort and note intact; saving produced one History entry and an actual shorter three-set push-up plan. Today also opened a relevant 30-second support check, kept timer completion separate from explicit confirmation, and returned to specific next-occasion guidance without creating another workout. Final integrated automated, compatibility and browser QA passes as scoped in release runbook §27. Physical iOS suspension/storage behavior, Home Screen offline reopening and real cross-device acceptance remain unverified; desktop fixtures do not establish those results.

### 5.16 Long-term correction compatibility — released 2026-10-20

Projection policy 11 adds rebuildable `maintenanceExposures` (latest completed exact milestone exposure) and `retainedDoseAdjustments` (exact prescription, source references and start time). These are derived from surviving native observations at the projection cutoff; neither is new capability authority. Projection-version cache identity forces replay. Mixed generator 3 has its own immutable plan identity while the same execution reader retains versions 1, 2 and 3. Native definitions v1–v8, old observations, schema versions, database names, account identities and recovery namespaces are retained.

The only new observation field is optional `RestrictionReportedEvent.symptomSource`, an existing `ObservationSourceRef` identifying the exact symptomatic performance event or Session Record item. It is an explicit clarification of scope, not a replacement/correction of that source. Validators enforce same athlete, actual symptom, exact source/item identity and chronology. Native payloads without the field remain valid and byte-identical. Voiding/correcting the original symptom does not silently clear the independent explicit restriction. Source reset removes dependent reports and clearances transitively; native dependencies protect required source facts through migration rollback. Import/merge are atomic and reject dangling references. Worker publication orders records and dependency-sorted events before their linked dependants, including one-item delta pages.

Comfort saves append an ordinary report followed by an ordinary clearance. A failed second append leaves a conservative active restriction; prepared in-memory IDs support exact retry, and reopening exposes the already-saved report's comfort action. No successful save depends on rewriting the original workout. Draft form choices before submission are transient and may be re-entered after reload; they are not represented as saved observations.

**Publication boundary:** this correction changes the Worker reader/validator without a database schema migration. The owner accepted the isolated iPhone/iPad checks and explicitly authorised production release on 2026-10-20; the compatible Worker was published before the client, with all saved database rows unchanged. Evidence and completion state belong in release runbook §31. Finish or save pending work and update every owner device/tab before creating new linked reports or generator-3 workflows, using the existing-installation reopen procedure in §31. There is no visible build badge. Keep stores, IDs and recovery namespaces.

Backward compatibility means the new app reads existing facts; it does not mean old strict apps can read the new field. Testing the actual prior validator/store confirms that an old client rejects a linked-report sync page before writes, cursor advance or outbox acknowledgement. Its local data remains intact, but its old interface may continue using stale local state with a generic sync error. No capability negotiation exists; do not claim old clients are globally disabled. Do not strip fields, alter hashes or skip incompatible deltas to hide this limit. Once new facts exist, rollback must retain their readers and disable changed behavior through policy selection if necessary; an old bundle is not a safe rollback.

Local acceptance covers source validation, immutable retry, backup/import, offline reopening, concurrent scope, one-item Worker paging, reset non-resurrection and migration-rollback dependencies. These checks use synthetic in-memory IndexedDB and a local SQLite D1 adapter, not live user data or an authenticated production sync.

### 5.17 Safe app updates and submitted context — local completion, 2026-10-20

The four owner-approved improvements retain all namespaces, schema versions, raw observations and native readers. Generator 4 changes new-plan selection/identity only; generator 1–4 execution readers and definitions 1–8 remain. Submitted setup context is saved draft-first, applied independently to intent and retried on refresh; original answer timestamps prevent an old draft from overwriting newer intent. Assessment completion no longer re-dates the old whole intent. Standalone native commit behavior is retained.

The app registers/checks for updates without blocking training. A downloaded update is explicit, and activation requires a safe screen, no pending commands/workout/check, no open goal editor and a sole same-scope window. Saved outbox entries remain untouched and need not have synced first. A leftover native timer is harmless only when the exact plan already has a saved Session Record and no pending envelope remains. Worker activation never forces other pages to reload; older hashed assets are retained until the new shell is alone. Installed workers serve their complete cached shell, reject a mixed-version download and clean only their own cache lane. Build identity includes worker source and a matching HTML badge.

Sync reader capability **2** is a transport compatibility field, independent of observation schemas/hashes. The local Worker rejects missing/older capabilities before accessing training storage; the client rejects a future minimum before applying a page or acknowledging uploads and says to update. Existing live Worker requests remain supported because the extra client field is additive. A future release must publish the compatible Worker before the client. Already-distributed clients have no new update UI and may show a generic sync failure until the first manual reopen/upgrade; no retroactive or offline global-disable claim is made.

The full local checks and real-browser update/offline rehearsal passed with synthetic data. No API/schema deployment or production account/data access occurred. Evidence, initial upgrade guidance and the minimal iPhone/iPad acceptance flow are in [the four-improvement QA report](VNEXT_FOUR_IMPROVEMENTS_QA.md).

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

The 2026-08-29 production checkpoint completed the rehearsed order: a recoverable D1 export/bookmark, additive migrations, exact schema/API health, paired sync and production-authority enablement, retained-v1 rollback proof, exact frozen Pages publication and bounded live smoke. Conversion remained first-access and idempotent rather than a bulk rewrite. Immediate aggregate reconciliation covered four migrated profiles plus one fresh native profile, preserved the pre-existing legacy authority projection exactly from the cutover boundary, and reported all integrity invariants at zero. A legitimate v1.2 metadata-clock save occurred before the Pages authority switch; release evidence therefore preserves both the earlier recovery hash and the matching cutover-to-reconciliation authority hashes. The observation window ended on 2026-08-30. On 2026-10-15 the historical comparisons and successful restore audit were recovered, and fresh release, authenticated-session and integrity checks passed. The original temporary SQL exports have no verified durable copy, which remains an explicitly recorded historical retention exception. The owner-approved current full/account export is retained in FileVault-protected storage and passes an isolated restore, all 14 reconciliation invariants and an exact legacy-authority boundary-hash comparison. Temporary CLI access was logged out. This protects current recovery without recreating the missing August export. The owner explicitly accepted that historical retention exception and authorised Phase 11 closure on 2026-10-15. Future release backup-retention requirements remain unchanged. See the release runbook Section 12 for exact evidence and limits. No legacy deletion or rollback retirement is authorised.

## 9. Compatibility Guarantees

- Existing accounts, history, equipment and useful preferences are preserved wherever safely interpretable.
- Old records remain readable even when exercises are deprecated.
- No legacy claim becomes more precise or authoritative than its stored source permits.
- Reset history stays reset.
- vNext is production authority after the explicitly approved Phase 11 cutover; v1.2 remains a coherent retained rollback/historical compatibility path, never a mixed concurrent authority path.
- Live conversion is per-athlete and idempotent on first access. It does not bulk-rewrite the legacy profile blob.
- Legacy cleanup, rollback retirement or destructive D1 restoration remains outside Phase 11 and requires separate explicit approval.
