# Parallette25 vNext Implementation Roadmap

**STATUS: ARCHITECTURE APPROVED — PHASES 1–11 COMPLETE; HISTORICAL ARCHIVE EXCEPTION ACCEPTED**

- Implementation authorised: **NO FURTHER IMPLEMENTATION — timer/background reliability delivered and iPhone accepted; await a new owner-approved task**
- Required implementation baseline: Parallette25 v1.2.0 release commit `61b0876`, or a verified successor containing it
- Authoritative project map and current state: [`../MASTER_PLAN.md`](../MASTER_PLAN.md)

## Purpose and use

This document is the canonical detailed delivery contract for vNext Phases 1–11. `MASTER_PLAN.md` remains authoritative for the product architecture, approved decisions, unresolved material questions, current phase, current authorisation and next action. Read this roadmap only when planning, executing or reviewing an implementation phase; after reading `MASTER_PLAN.md`, load only the overview and phase sections relevant to the authorised task unless a cross-phase dependency requires more.

The architecture is the approved foundation. Phases 1–11 were explicitly authorised and completed. The owner accepted the recorded historical archive exception and closed Phase 11 on 2026-10-15. This roadmap never grants implementation authority by itself.

## Mandatory baseline and phase controls

- Phase 1 must start from `61b0876` or a verified successor containing it. Do not implement vNext against the divergent `2d7ee8e` checkout.
- Verify the implementation baseline against the deployed build before release/cutover work.
- Implement only the phase or task the owner explicitly approves, then perform its proportionate safeguards, update project state, and stop for owner review.
- Keep v1.2 authoritative through compatibility adapters and feature isolation until the separately approved Phase 11 cutover.
- Preserve unrelated behaviour and user data. Prefer additive, reversible changes until migration and rollback gates are approved.

## Implementation philosophy

> **Step-by-step development for control and architectural visibility, but consolidated testing for efficiency.**

- Build the domain/evidence/planning spine with pure deterministic engines before UI polish or large content expansion.
- Keep v1.2 authoritative through compatibility/feature isolation; compare shadow projections and plans until the approved Phase 11 cutover.
- Use proportionate early checks, but fix any critical safety, data-loss, migration or foundation failure immediately; run the comprehensive integrated suite in Phase 10.
- After each phase, update Current Project State/material deviations in `MASTER_PLAN.md` and stop for owner review.

## Phase 1 — Domain contracts and validators

**Completion:** Implemented and owner-approved 2026-08-18 from exact release baseline `61b0876` in the isolated `codex/vnext-phase-1` worktree. Targeted fixture/domain validation and TypeScript checking passed; live v1.2 behaviour and data paths remain untouched.

**Purpose:** Establish the minimum versioned vocabulary and compatibility boundary without changing product behaviour.

**Main changes:** Define schemas/types for Exercise Definition, Development Graph, Capacity, Benchmark Protocol, Athlete Evidence Event, Athlete Intent, immutable Session Plan, immutable Session Record and Derived Athlete State; assign sole ownership of planned/actual facts; define stable ID/version policies; define simple `allOf`/limited `anyOf` prerequisite grammar; create representative fixtures and validators; add a v1.2 compatibility adapter boundary.

**Systems/files conceptually affected:** new domain/schema modules and validator scripts; targeted type imports from `app/program.ts`, `app/session.ts` and profile contracts only where additive.

**Dependencies:** Owner approval; new implementation branch based on `61b0876` or a verified successor; the approved `MASTER_PLAN.md` and `AGENTS.md` carried into that branch.

**Deliberately untouched:** Live generator decisions, UI, assessment flow, exercise content/media, persistence/sync and user profiles.

**Lightweight sanity checks:** schema fixture validation; duplicate/stable ID checks; version parsing; prerequisite grammar checks; type check/build if imports change.

**User-facing behaviour:** None.

**Migration/backward compatibility:** Define legacy adapters/contracts only; do not migrate or write user data.

**Owner review before Phase 2:** Are the concepts minimal, non-duplicative, readable and sufficient for cross-family prerequisites without a general rule engine?

## Phase 2 — Skill graphs, capacities and catalogue-role mapping

**Completion:** Implemented and owner-approved 2026-08-18 in the same isolated vNext worktree. The versioned bundle contains seven graphs, 103 referentially checked nodes (43 backed by current content and 60 honest Phase 7 gaps), seven capacities, 64 complete benchmark protocols and mappings for all 195 stable v1.2 exercise IDs. The registry groups the 60 missing nodes into 41 boundary-homogeneous content bridges; programming boundary and Phase 7 content priority remain separate, proposed future exercise/variant/protocol IDs remain registry-only and no Phase 7 content was added. Protocol conditions make equipment, assistance and range explicit; confirmation/freshness varies by movement type; version-bound source and complete semantic fingerprints guard replay semantics. Targeted domain/graph/catalogue validation and TypeScript checking passed. Live workouts, generator, evidence, UI, persistence and media remain untouched.

**Purpose:** Turn the proposed skill/capacity model into audited, versioned definitions and prove catalogue coverage/gaps.

**Main changes:** Define the five outcome families, general Pushing track and Transitions graph; define the seven capacity domains; map current exercises to roles/skills/capacities; finalise benchmark protocols and confirmation/freshness policies for every existing milestone used by projection, assessment or shadow planning; leave placeholders only for genuinely missing advanced nodes assigned to Phase 7; classify automatic/strong-gated/specialist nodes; audit prescription-demand tags and substitutions; produce the concrete missing-bridge list.

**Systems/files conceptually affected:** graph/capacity/benchmark definition modules; additive exercise metadata or mapping tables; catalogue/graph validation scripts; no exercise behaviour yet.

**Dependencies:** Phase 1 contracts.

**Deliberately untouched:** Live workouts/generator, evidence calculation, UI, persistence and new exercise/media implementation.

**Lightweight sanity checks:** reference resolution; DAG cycle/unreachable-node checks; prerequisite integrity; every existing milestone consumed before Phase 7 has a complete versioned protocol and policy; every retained capacity changes at least two families; every generated-current exercise keeps a valid role/substitute.

**User-facing behaviour:** None.

**Migration/backward compatibility:** Preserve stable exercise IDs; define alias/deprecation policy but do not migrate.

**Owner review before Phase 3:** Coaching coherence, missing bridges, capacity granularity, graph branches, and automatic versus specialist boundary.

## Phase 3 — Evidence and derived-athlete-state engine

**Completion:** Implemented 2026-08-18 and owner-approved before Phase 4 in the isolated vNext worktree. Pure normalisation and projection modules replay versioned events and Session Records at an explicit cutoff; derive lifecycle, confidence, restrictions, reconfirmation, raw recent demand, family working/maintenance/eligible nodes and request-scoped trainability; and use explicit protocol-reuse and mechanically necessary predecessor policies without duplicating raw truth or load. Golden scenarios cover beginner, mixed and advanced profiles, evidence strength, difficult days, contradiction, pain/clearance, staleness, deload, deterministic replay, corrections, source reuse and fail-closed conflicts. Focused Phase 3 validation, domain validation and TypeScript checking passed. Production persistence, profiles, assessment, UI, generator output and live workout evidence writes remained untouched.

**Purpose:** Implement deterministic capability, confidence, restriction, recent-load and next-target projections without live capture.

**Main changes:** Pure observation reducers/projectors; evidence-strength and confirmation policies; capability/confidence lifecycle; trainability `allow/modify/block` decisions; inactivity/reconfirmation; recent demand exposure; family working-node and maintenance derivation; reason codes.

**Systems/files conceptually affected:** new evidence/projection/readiness policy modules and focused scenario fixtures/tests.

**Dependencies:** Stable Phase 1 contracts and Phase 2 definitions.

**Deliberately untouched:** Current profile storage, UI, assessment, generator output and production workout evidence writes.

**Lightweight sanity checks:** golden scenarios for beginner, experienced mixed-skill athlete, one hard day, repeated benchmark failure, pain restriction/clearance, inactivity, deload and stronger-node evidence; determinism/replay check.

**User-facing behaviour:** None.

**Migration/backward compatibility:** Test in-memory legacy conversion fixtures only; no profile writes.

**Owner review before Phase 4:** Are outcomes conservative, explainable and consistent with the capability/readiness distinction?

## Phase 4 — Observation persistence, sync and legacy converter in shadow mode

**Completion:** Implemented 2026-08-20 and subsequently owner-approved in the isolated vNext worktree. A separate shadow IndexedDB durably stores immutable Evidence Events, Session Plans and Session Records plus Athlete Intent, the highest reset tombstone, dependency-ordered outbox/cursor state, exact-identity rebuildable projection caches, exact legacy snapshots and migration receipts. An additive normalised D1 schema and authenticated numeric-cursor delta endpoint are disabled unless `VNEXT_SHADOW_MODE` is explicitly enabled; upload/query/body and outbound-delta bounds match the configured service limits. Canonical payload hashes collapse exact retries and reject divergent immutable IDs. Reset is an irreversible lower bound that also purges orphaned dependent chains; rollback terminally excludes converter-only truth through logical quarantine while preserving native/shared/dependency facts and behind-cursor reactivation. Export/import carries exact immutable provenance. The converter emits explicitly sparse legacy Session Plan/Record pairs, weak claims and provisional mapped observations without fabricating item timing, prescriptions or benchmark proof. Focused offline/replay, duplicate/conflict, multi-device and concurrency, migration/reset, export/import, recovery/quarantine rollback, account security, near-limit snapshot, query-budget, dependency-order and 500-session checks passed. No live migration, legacy deletion, visible UI or production feature-authority change occurred.

**Purpose:** Make evidence durable/offline/syncable and prove that v1.2 data can migrate without loss before any cutover.

**Main changes:** IndexedDB evidence-event/Session Record stores; normalised D1 observation/projection storage and delta-sync endpoints; event/record-ID and cursor conflict model; profile intent storage; idempotent legacy converter with `progressResetAt` lower-bound handling; pre-migration snapshot/rollback; shadow-write or synthetic migration tools; export/import update.

**Systems/files conceptually affected:** `app/profileStore.ts`, profile API worker/D1 migrations, new persistence/sync modules, profile validators and backup format.

**Dependencies:** Phase 3 observation semantics/projections must be stable.

**Deliberately untouched:** v1.2 recommendations, visible UI, live assessment authority and generator cutover. Legacy reads remain active.

**Lightweight sanity checks:** offline append/replay; duplicate delta sync; conflict union; idempotent repeated migration; reset/deletion tombstones; export/import round-trip; legacy snapshot recovery; profile-size/load checks.

**User-facing behaviour:** None when kept in shadow mode.

**Migration/backward compatibility:** This phase implements but does not execute destructive cutover. No legacy field is deleted.

**Owner review before Phase 5:** Evidence survives offline/sync/conflict/migration scenarios and legacy profiles reconcile exactly where expected.

## Phase 5 — Adaptive placement, guided tests and evidence capture

**Completion:** Implemented 2026-08-24 and subsequently owner-approved in the isolated vNext worktree. A versioned, resumable assessment flow asks safety/context and goals first, uses three common anchors and experience-aware goal ladders, stops/backs down on uncertainty or symptoms, and produces only provisional self-assessment evidence. Reviews offer at most four exact guided protocols after recomputing equipment, restriction, inversion and prerequisite eligibility; below-protocol or blocked results cannot be recorded clean. Existing users receive safety plus targeted reconfirmation rather than full onboarding. Local drafts remain non-authoritative and unsynced; explicit commit writes idempotent Athlete Intent/evidence, and minimal post-workout capture uses only the immutable Session Record. Beginner, experienced, uncertain, mixed-skill, inversion/restriction, back/resume/edit, persistence, no-bypass and reasonable-length scenarios pass. The live v1.2 UI, assessment, generator and feature authority remain untouched.

**Purpose:** Replace overlapping capability claims with one short placement/testing path and richer but minimal workout evidence.

**Main changes:** safety/context/goals-first adaptive flow; common and goal-specific anchors; provisional evidence events; guided placement/test sessions; restriction reporting; focused post-workout review; targeted reconfirmation for existing users.

**Systems/files conceptually affected:** assessment engine/UI, workout review, evidence-event creation, benchmark presentation/media hooks and profile intent.

**Dependencies:** Phases 3–4 projections and persistence; Phase 2 protocols.

**Deliberately untouched:** The v1.2 generator remains authoritative outside an isolated vNext feature cohort; Progress & Goals replacement remains Phase 8. No mixed mode may capture vNext-only observations while showing recommendations that cannot consume them.

**Lightweight sanity checks:** beginner/experienced/uncertain/inversion-restricted assessment routes; resume/back/edit; no self-report awards achievement or bypasses a gate; event persistence; reasonable completion length.

**User-facing behaviour:** Only isolated vNext cohorts see these changes; each cohort uses one coherent authority/read/write path until Phase 11. v1.2-visible flows retain legacy-compatible writes, vNext flows consume vNext projections, and any dual write is nonduplicative and idempotent.

**Migration/backward compatibility:** The isolated vNext projection treats existing assessment/readiness as provisional; the v1.2 cohort retains legacy authority until cutover. No existing user is forced through full onboarding.

**Owner review before Phase 6:** Is placement short, clear, honest and sensible for beginners, experienced athletes and mixed-skill profiles?

## Phase 6 — Goal-directed emphasis and workout generator

**Completion:** Implemented 2026-08-24 and owner-approved in the isolated vNext worktree. The versioned pure planner consumes Athlete Intent, the exact definition bundle, current Derived Athlete State, projection policy, session demand and a deterministic seed. It selects a primary, optional compatible secondary and compatible due maintenance; retains app-owned emphasis separately from user intent; recursively resolves unmet cross-graph milestone and nested capacity prerequisites; processes every `allOf` while choosing one deterministic actionable `anyOf` route; and selects only exact node-scoped milestone prescriptions, exact capacity protocols or independently re-evaluated safe alternatives. Broad node-less high-demand graph contributors and all missing Phase 7 content fail closed; when every prerequisite for an unavailable destination is already satisfied, the planner returns the content gap and no Session Plan rather than adding shared-family filler. Technique/Standard/Challenge changes variants and block dose without changing eligibility. The composer targets exact 25 minutes, permits only an explicit safe shorter exception, keeps technical work before fatigue and enforces one major high upper-limb prescription plus explicit Planche/HSPU/Press conflicts. Semantic plan content determines immutable IDs, and every item has internal reasons and a current request-scoped trainability decision. Focused deterministic, timing, frontier, prerequisite, `anyOf`, target/exercise, equipment, substitution, recent-load, restriction, maintenance, mixed/advanced and specialist-defense scenarios pass. The live v1.2 generator and feature authority remain untouched.

**Purpose:** Generate coherent beginner-to-advanced 25-minute sessions from intent, evidence and load compatibility.

**Main changes:** rolling primary/secondary/maintenance allocator; Technique/Standard/Challenge demand; graph target selection; prerequisite/trainability/equipment filters; flexible approximately-25-minute budgeting with an exact-25 target and explicit safety exception; seven-domain prescription compatibility; recent exposure; reason codes; 30-minute Lab purposes; shadow comparison with v1.2.

**Systems/files affected in this phase:** additive `app/vnext/planning/*`, the vNext export surface and focused generator validator; one narrow vNext projection correction makes only moderate/high demand overlap with a restriction. Production `app/session.ts`, `app/custom.ts`, programme selection, UI and preview hooks were not changed.

**Dependencies:** Phases 2–5.

**Deliberately untouched:** Full advanced catalogue expansion, the production v1.2 generator and assessment, existing profiles/live persistence, final Progress & Goals/Today UI, production feature authority and cutover.

**Lightweight sanity checks:** exact-25 timing when eligible and explicit/valid shorter exceptions; no locked/specialist surprise work; no incompatible high-load pairing; technical work ordering; equipment/substitution integrity; representative beginner/intermediate/advanced/mixed/restricted plans; deterministic seed/reason outputs.

**User-facing behaviour:** None while shadowed; optional internal comparison preview only.

**Migration/backward compatibility:** Historical L1/L2/L3 information is not treated as athlete ability by the planner; the conservative legacy adapter may supply only a default session-demand preference. v1.2 plans remain executable and rollback-safe, and vNext planning reads only approved vNext structures.

**Owner review before Phase 7:** Do plans feel purposeful, varied enough, safe, explainable and recognisably Parallette25 rather than random hard exercise lists?

## Phase 7 — Missing progression bridges and advanced content

**Purpose:** Fill only the graph/content gaps proven necessary by Phase 2 and real planner coverage.

**Completion:** Implemented 2026-08-24 in the isolated vNext worktree. Additive catalogue v2 preserves the complete catalogue-v1 bundle for replay and legacy conversion, then adds 30 one-node/one-exercise definitions and 30 movement-specific protocols covering 20 planner-proven automatic bridge groups across Planche, L/V-sit, Handstand, HSPU, Press, Pushing and Transitions. Current coverage is 225 exercises, 94 protocols and 73 content-backed nodes; the remaining 30 nodes are one dependency-blocked automatic Planche preparation, 19 stronger-gated outcomes and ten specialist destinations. All new movements have explicit role, node/capacity link, prerequisite context, equipment, dense demand, safety, regression/progression relation, standard/technique prescriptions and media ownership. Twenty-eight newly owned motion briefs cover the 30 definitions; two exact Press/transition pairs share physical guides but keep separate graph and benchmark authority. Existing catalogue-v1 definitions remain byte-identical, the Phase 2 frog/crane, kick-up, compression, pushing and transition classifications remain unchanged, and no historical ID was deleted or repurposed. Explicit catalogue 1→2 subject compatibility preserves unchanged evidence without back-awarding new nodes; catalogue-v2 semantics are frozen by fingerprint. Focused reference, graph, boundary, protocol, regression, demand/restriction, equipment, media, historical replay, legacy-converter and generator-consumption checks plus TypeScript validation pass. Renderable owned assets are specified but not produced, and the live v1.2 catalogue, media path, generator and feature authority remain untouched. Awaiting the owner review below.

**Main changes:** Add or refine milestone exercises, regressions, benchmark protocols, prescriptions, instructions and owned media for planche, V-sit, HSPU, press, advanced handstand and transitions; complete specialist gating metadata; deprecate/reclassify dead ends without deleting history.

**Systems/files conceptually affected:** exercise catalogue/definitions, motion/media assets, benchmark protocols, graph mappings and content validators.

**Dependencies:** Working Phase 6 planner prevents catalogue-led overbuilding; Phase 2 gap audit.

**Deliberately untouched:** Persistence semantics and unrelated existing content; specialist breadth beyond the approved Phase 2 boundary.

**Lightweight sanity checks:** stable IDs; media/reference availability; regression termination; protocol completeness; graph reachability; load/equipment metadata; focused technical/safety review.

**User-facing behaviour:** New exercises may appear only under an isolated feature flag/shadow planner until the controlled production release in Phase 11.

**Migration/backward compatibility:** Additive stable definitions; deprecated IDs remain history-readable.

**Owner review before Phase 8:** Technical quality, coaching progression, media clarity, warnings and normal-versus-specialist placement.

## Phase 8 — Progress & Goals and Today UX

**Purpose:** Present the sophisticated system as a small, understandable user model.

**Completion:** Implemented 2026-08-24 in the isolated vNext worktree. A pure presentation layer turns the approved definitions, Derived Athlete State, Athlete Intent, assessment offers, active restrictions and generated Session Plan into user-safe view models. It presents all seven families with demonstrated or source-honest provisional state, current confidence/availability, next target, prerequisite meaning, recommended focus and focused detail; one-primary/up-to-two-secondary goals and optional emphasis modify intent only. Today presents primary, compatible secondary and maintenance purposes, simple selection reasons, the 25-minute plan and Technique/Standard/Challenge as workload choices without changing eligibility. Assessment, guided-test and reconfirmation actions retain exact graph/protocol identity and provide no manual skill claim. Restriction copy keeps achievement history separate from current modification/blocking. Completion asks only meaningful plan items and maps answers to partial item outcomes for the single coherent Session Record path; it creates no record or evidence itself. A namespaced, keyboard/mobile-aware React surface emits callbacks only and remains unmounted from v1.2 until Phase 9 can provide one coherent vNext authority/read/write branch. Migrated display wording uses a read-only immutable-observation provenance index rather than changing projection authority. Focused new, migrated, mixed, advanced and restricted scenarios; goal/no-unlock, explanation, exact-action, completion-authority, hidden-score, keyboard, focus-target, mobile and feature-isolation checks plus TypeScript validation pass. `app/page.tsx`, `app/globals.css`, `src/main.tsx`, legacy UI/player, production persistence and account/security remain untouched. Awaiting the owner review below.

**Main changes:** Replace Skills & readiness with Progress & Goals; family detail/next target/requirements/tests; goal/emphasis controls; Home “why this today”; demand control; contextual restrictions/reconfirmation; generator explanation; streamlined workout completion.

**Systems/files conceptually affected:** `app/page.tsx`, UI components/styles, projection selectors, assessment entry points and accessibility copy.

**Dependencies:** Stable projections, assessment, generator and content from Phases 3–7.

**Deliberately untouched:** Account/security model and underlying evidence semantics except bugs discovered by integration.

**Lightweight sanity checks:** keyboard/screen-size/accessibility basics; empty/new/migrated/mixed/restricted states; no exposed internal scores; no manual capability toggle; correct explanation/reason mapping.

**User-facing behaviour:** Implemented in the isolated vNext surface but not mounted for production users. Phase 9 must integrate it behind the coherent vNext feature boundary.

**Migration/backward compatibility:** Migrated achievements/provisional placements display distinctly; old history/profile tools remain accessible.

**Owner review before Phase 9:** Does the product feel simpler, make current/next progress obvious and preserve trust during restrictions or migration?

## Phase 9 — Integrated release candidate and migration rehearsal

**Completion:** Implemented in the isolated vNext worktree and frozen for Phase 10 review. Mutually exclusive build-time artifacts now prevent mixed authority: ordinary `/parallettes/` contains only v1.2; the separate RC contains only vNext and stays inert without its exact ID, `/parallettes/vnext-rc/` base and request. Access-controlled isolated staging is required; a nested same-origin RC additionally requires the updated parent-v1 worker exclusion to be active first. The coordinator owns assessment, projection, planning, presentation, reload-safe workout/guided execution, persistence, sync and the next recommendation. Its exact completion retry boundary and one-linear-record-chain rule prevent duplicate session truth; cache failure remains non-authoritative; concurrent restriction clearances reconcile without erasing reports or session-derived symptoms. Representative fresh, mixed, advanced, restricted and copied-profile rehearsals cover snapshots, idempotent conversion, offline append/replay, multi-device union, export/import, reset precedence, rollback and stale-cache isolation. The fixed schema/API/app/service-worker order is non-destructive. The RC PWA uses channel `vnext-rc1`, separate from ordinary `v1`; the integrated source is frozen by fingerprint `fa7984d06d785106251eb7b5cf888c4165ea62fabdc092cb0cc7f4534570c34d`. Focused Phase 9 validation, TypeScript and both mutually exclusive build/distribution checks pass. Production eligibility remains **blocked**: all 28 owned-motion briefs covering 30 movements are unresolved, with no fallback. No live migration, ordinary-user exposure, deployment or production authority switch occurred.

**Purpose:** Integrate the complete vNext path in staging/isolated cohorts and prove migration and rollback without changing the production authority.

**Main changes:** Integrate vNext projections, assessment, generator, content and UI behind the mandatory isolation boundary; migrate copies/synthetic representative profiles; reconcile shadow versus release-candidate state; rehearse sync/API/schema/service-worker deployment order and rollback; freeze a release candidate.

**Systems/files conceptually affected:** application integration, persistence/sync, service-worker/cache versioning, deployment configuration and focused end-to-end flows.

**Dependencies:** Phases 1–8 approved; coherent feature isolation/compatibility adapters from Phase 5 onward.

**Deliberately untouched:** Live production profiles, production feature authority, legacy deletion and broad cleanup. Keep rollback/read compatibility.

**Lightweight sanity checks:** fresh, migrated-copy, offline, multi-device, partial-migration and rollback smoke flows; session timing-contract compliance; no data loss; no stale cache mixing.

**User-facing behaviour:** None for ordinary production users; staging or explicitly isolated test cohorts see the integrated vNext release candidate.

**Migration/backward compatibility:** Rehearse the idempotent migration on copies after snapshotting; validate `progressResetAt`, reconciliation and rollback; resolve discrepancies before proceeding. Do not migrate live profiles.

**Owner review before Phase 10:** Real representative profiles, beginner/mixed/advanced recommendations, cross-device sync and rollback confidence.

## Phase 10 — Comprehensive validation, correction and release approval

**Completion:** Implemented 2026-08-28 in the isolated vNext worktree and frozen after owner-requested motion correction as `parallette25-vnext-rc.3` at source fingerprint `1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47`. Comprehensive definition validation covers all seven graphs/103 nodes, seven capacities/21 facets, 225 catalogue-v2 exercises, 94 protocols, `allOf`/`anyOf`, freshness, source reuse, stronger-node implications, reachability and retained catalogue-v1 replay. Twelve complete assessment → projection → recommendation → workout → Session Record → projection → next-recommendation journeys cover new, uncertain, mixed, advanced, stronger-gated, stale, inactive, restricted/cleared, difficult/symptom-feedback, equipment-limited, specialist and migrated states. Technique/Standard/Challenge, goal changes, exact prerequisites, load compatibility, timing and no specialist/manual-unlock bypass pass.

The data suite passes durable IndexedDB truth/rebuildable caches, immutable linear Session Record authority, export/import, copied migration and retry, snapshot recovery, rollback/quarantine, offline append/replay, authenticated D1 delta isolation, two-device union, divergent same-ID rejection, reset/stale-device non-resurrection and a 300-session load case. Persisted account observations now remain locked until a matching unexpired bearer is accepted; online rejection or identity mismatch locks them, an unexpired token preserves intended offline-first access, and same-tab, cross-tab, visibility and expiry changes unmount the account path. URL-selected and legacy account-ID fallbacks are prohibited.

Twenty-eight owned, renderable motion guides cover all 30 Phase 7 movements and pass exact pose, apparatus, wall/contact, assistance, depth, duration, direction, landing, playback, reference and plan-consumption checks. The owner rejected RC.2 after live motion exposed defects that its start/middle/end sheets had hidden. RC.3 corrects L/V torso and face direction, symmetric straddle geometry, shared assistance marks, protocol-length holds, HSPU/Press depth and assistance, one-way negative timing, and mechanically coherent feet-clear transitions/landings. The owner subsequently approved the exact RC.3 guides in the final-product animation player; technical review v2 and owner review are fingerprint-bound, and any later asset drift fails closed. The 84 frozen frames remain secondary inspection evidence.

Focused desktop and 390×844 phone review confirmed plain Today reasons, independent Progress & Goals, provisional-versus-demonstrated wording, prerequisite explanations, resumable workouts, labelled controls, no horizontal overflow and no sub-44-pixel interactive target. Static accessibility/PWA checks cover landmarks, fieldsets/labels, keyboard focus, contrast, reduced motion, safe areas, manifest/service-worker/cache separation and inert invalid-RC startup. Ordinary v1 and RC.3 build graphs remain mutually exclusive: the ordinary artifact contains no vNext media/runtime content; RC media remains lazy. The RC application chunk is approximately 621 kB minified/146.3 kB gzip and triggers the build tool's 500 kB advisory; this is a recorded optimisation opportunity, not a correctness, safety or data-integrity blocker.

Corrections made in Phase 10: preserve an explicit missing-content goal gap when a safe prerequisite family is promoted; remove vNext media leakage from the ordinary v1 artifact; distinguish missing prerequisites from active restrictions; label an exact saved workout as Resume; harden pre-mount and mounted account-session invalidation; and complete the RC.3 motion corrections recorded canonically in Skill Architecture. No approved architecture or product scope changed. No live migration, schema application, deployment, ordinary-user exposure or production authority switch occurred. **Final recommendation: READY FOR PHASE 11 after the owner approved the exact corrected live animations.** Phase 11 preserves RC.3 as provenance and uses a distinct production release contract; it does not rewrite the historical rehearsal manifest.

**Purpose:** Perform the expensive integrated validation only after the complete release candidate exists, then establish whether it is safe to release.

**Main changes:** Full graph/prerequisite/protocol audit; projection/progression/regression/restriction/inactivity scenarios; adaptive assessment; generator/load/timing coverage; exercise/media availability; persistence/sync/migration/reset/import/export; UI/accessibility/PWA/offline flows; beginner/intermediate/advanced/mixed/equipment/goal-change/maintenance edge cases; correct failures; final copy/performance/cleanup; release plan.

**Systems/files conceptually affected:** Entire vNext stack, validators, fixtures, build/deployment and documentation.

**Dependencies:** Integrated Phase 9 release candidate and migrated staging/test profiles.

**Deliberately untouched:** No legacy path/data deletion until the rollback window passes and the owner explicitly approves removal.

**Lightweight sanity checks:** Release-candidate build/type check and critical fresh/migrated/offline smoke flows before starting the expensive suite.

**Comprehensive validation:** All validators; full scenario matrix; migration reconciliation; offline/multi-device, assessment, generator, accessibility and PWA tests; production bundle/service-worker checks; focused manual visual QA.

**User-facing behaviour:** Corrections and polish remain behind the isolation boundary; no new architecture unless a genuine defect requires owner review.

**Migration/backward compatibility:** Validate dry-run migration, reset cutoffs, rollback and legacy reads; schedule later legacy cleanup as a separately approved maintenance task.

**Owner review before Phase 11:** Review release evidence, known limitations, specialist scope and migration/rollback confidence. Production migration/cutover requires explicit owner approval; Phase 10 completion alone does not authorise it.

## Phase 11 — Controlled production migration and release

**Status: COMPLETE on 2026-10-15, with the owner-accepted historical archive exception.** Release and authenticated checks passed. The phone correction is live as build `f995bec866dc6645b3c0` through controlled workflow `38766382477`; full checks, exact artifact grant, all 22 served files and API/schema/authority health passed. Current reconciliation has 6 profiles, 4 migration snapshots/receipts, 15 plans, 32 events and 13 records; all 14 invariants are zero. Live Custom cancellation, work/rest, pause/reload/resume, performed-only review, one synced save, next recommendation and post-deployment History passed. Original migration audit comparisons and restore-test success were recovered. **Accepted historical retention exception:** original temporary SQL exports are missing; a current seven-day bookmark does not replace a durable export or the original recovery point. A current encrypted full/account export now passes isolated restore and all 14 reconciliation invariants; its legacy-authority projection also matches the original boundary hash exactly. Temporary CLI access was logged out. The owner explicitly accepted the missing historical archive and authorised Phase 11 closure on 2026-10-15; future release retention requirements remain unchanged. Evidence and limits are canonical in [release runbook Section 12](VNEXT_PRODUCTION_RELEASE_RUNBOOK.md#12-iphone-correction-and-closeout-verification--2026-10-15). No next phase, cleanup or rollback retirement is authorised.

**Pre-close workout-UX correction checkpoint (2026-08-30):** Comparing the live vNext experience with the relevant v1.2 workout flow classified missing visual preview, exercise modification, automatic execution, Custom Session and recent-session visibility as regressions/missing integration. The apparent 6–8-minute continuous exercises were a presentation defect: Phase 6 intentionally budgets multi-set blocks with rest inside them. The isolated correction build now expands every block into exact work/rest sets, shows every owned motion guide and prescription before start, runs work → rest → set/exercise automatically, and retains pause/skip/change/end controls. Easier/Similar/Harder options come only from authored relations/variants and are rechecked against trainability, prerequisites, restrictions, equipment, specialist gates, recent/whole-session load and exact media; an unavailable direction explains why rather than substituting unrelated work. Completion asks only after a meaningful performed threshold for development/maintenance/tests, while timer-owned preparation/recovery and skipped/unreached work create no rating prompt. A zero-question early stop remains saveable as one abandoned Session Record. Custom Session offers 5/10/15/20 minutes, general, core/body-line, compression-only or any skill family, current equipment and daily demand; it uses a full vNext plan/trainability pass and never the legacy generator. Five minutes retains one development movement, 10/15 retain up to two and 20 retains up to three distinct trainable movements so longer Custom choices do not stretch one drill unnaturally; the complete Today workout remains 25 minutes.

The owner then found a genuine lifecycle defect: building Custom marked an unstarted preview as active recovery, so cancelling it left Today locked. Preview and active recovery are now explicit states. Cancelling an unstarted Custom plan restores normal Today immediately; timing first creates the recovery lock, after which Resume, End and review completed work, and Discard are explicit. The same parity pass restores the branded shell, compact session timeline, timer sound, overall progress, next-motion rest preview, phone-sticky controls and a Session-Record-backed History view with migrated entries labelled. A follow-up pre-release QA pass corrected Custom duration labels/backgrounds, removed inactive start/demand controls during completion review, labelled recovered Custom context honestly, changed repeated provisional current/next states to an explicit “Confirm …” action, replaced graph-authoring language with athlete-facing goal copy and raised phone exercise-change/swap targets to 44px. Focused deterministic checks, 12 complete evidence-loop journeys, Phase 6/8/9 regressions, 114 UI/accessibility/PWA assertions, type checking and isolated build/distribution validation pass. Manual desktop and 390×844 review covered all four Custom durations, Custom → cancel → normal Today, animated preview, safe/no-option swaps, started recovery actions, hands-off work/rest presentation, early stop/review, Progress & Goals, History and mobile reachability without horizontal overflow. The owner accepted the broadened correction in motion on 2026-10-15; its exact-artifact deployment and served-file/API verification are complete.

**Purpose:** Release the validated vNext candidate with a bounded, observable and reversible production cutover.

**Main changes:** Verify the approved implementation baseline against the deployed build; take recoverable profile/data snapshots; deploy compatible schema/API/app/service-worker changes in the rehearsed order; run the idempotent live migration; reconcile results; switch the production feature authority; retain rollback controls and record release evidence.

**Systems/files conceptually affected:** Production deployment configuration, application release bundle, persistence/sync schemas, migration runner, service-worker/cache versioning and operational runbook.

**Dependencies:** Phase 10 complete; explicit owner approval for Phase 11; verified deployed baseline; successful staging migration/rollback rehearsal; release and rollback owners identified.

**Deliberately untouched:** Legacy data/path deletion, unapproved analytics, new architecture, new skill scope and broad cleanup.

**Lightweight sanity checks:** Immediate fresh/migrated/offline/multi-device/session smoke flows; migration counts and reset cutoffs reconcile; no stale cache mixing; rollback triggers and responsible owner are active.

**User-facing behaviour:** The validated vNext experience becomes active; any staged rollout or rollback follows the approved release plan.

**Migration/backward compatibility:** Migrate live data only after snapshotting; preserve idempotency, old reads and the tested rollback path throughout the agreed observation window.

**Owner review before post-release cleanup:** Review release health and migration reconciliation. Retiring rollback or deleting legacy data is a separate, explicitly approved maintenance action.


## Post-release task — iPhone usability and remaining progression plan

**Status (2026-10-17):** The combined A–F progression update is delivered. The owner accepted all animations and authorised deployment after checks. Controlled workflow 39065166577 published exact source `f008107` as build `f636d83a464a940fe927`; all 23 live files, health and bounded test-account recovery/save/export pass. All 30 agreed additions are content-backed under the unchanged safety/specialist gates; immutable native v1–v8 history is retained. The owner now reports all three full-update iPhone checks pass: portrait/landscape visibility, pause/reopen/resume and completion with one History entry. Release evidence is canonical in runbook Section 15. Phase 11 remains closed. The subsequent mixed-workout/Custom-preview task is also delivered via controlled workflow 39068343601, build `2e2103dcc57af6ac454b`; full checks and live verification pass. On 2026-10-18 the owner reports all three latest-update iPhone checks pass and approves merging PR #26. The operational structure is canonical in Training Engine Section 6.6; release evidence is in runbook Section 16.

### iPhone review scope and evidence

Owner device: iPhone 17, reported latest iOS; the exact installed iOS version and Safari/Home Screen preference have not been provided. Review uses the released application source at `0961503` and main successor `937629a`, with the same shared workout component and CSS in an isolated device-only preview. Production index/service-worker hashes still match the released phone correction and public API health passes the exact release/schema/D1/paired-authority validator. The existing signed-in release-test profile has an unfinished recovered workout; it was preserved.

Portrait frames: nominal 402×874, reduced-height 402×720 and 402×650, plus 375×667. The nominal frame is a test assumption based on a three-times scale of Apple’s [2622×1206 display specification](https://www.apple.com/iphone-17/specs/); it is not a claim about Safari’s actual visible viewport, display zoom or safe areas. Landscape was reviewed at 874×402. This browser review does not emulate iOS WebKit, physical safe areas, screen locking, audio policy, accessibility text enlargement or offline installation.

| Check | Desktop-preview result / remaining device evidence |
|---|---|
| Portrait workout stage | Pass: animation above complete coaching, timer and controls; no horizontal overflow. At 402×874 the guide is 378×522 and stage ends at y=866. At 402×650 the guide is 378×298 and stage ends at y=642. |
| Custom preview cancellation | Pass: cancelling an unstarted five-minute Custom preview restores Today and its start action. |
| Work/rest execution | Pass: normal work advances to rest and back to work automatically, reaching the next planned rest before Knee Push-Up set 3 of 4 without manual interval changes. Direct taps preserve scroll position at the top; pause/resume remain available. |
| Exact paused recovery | Pass: paused Knee Push-Up recovered 00:40 remaining / 00:48 elapsed; paused rest recovered 00:53 remaining / 01:55 elapsed. These are synthetic local test timings, not training achievements. |
| Header and scroll position | A direct tap preserves scroll position at the top. Locator automation can scroll a control into view and hide the header; do not classify that automation-only movement as a product defect. Physical touch and automatic transitions still need confirmation. |
| Completion entry / local save | Original finding (corrected in the approved post-release build): Finish early returned to the long Today preview; the feedback heading is at document y=3929 and Save workout at viewport y=4462, rather than bringing the form into view. Once reached, selecting Stopped saves one local Partial Session Record, rebuilds the recommendation and preserves exactly one History entry after reload. The correction places completion before the preview and focuses/scrolls its heading into view, including recovered reviews. See release runbook Section 13 for validation and deployment. |
| Landscape | Original finding (corrected in the approved post-release build): width exceeded the desktop breakpoint, creating a side-by-side stage; the controls end at y=881 in a 402px-high viewport. The correction keeps the guide on the left and readable coaching/timer/controls on the right. At 874×402 the complete stage ends at y=394, and at 874×320 at y=312. The owner has accepted the correction and full update on iPhone 17. |
| Optional placement draft | Reproduced: unfinished placement reopens after reloading the completed local test session. Save & close returns to the app without inventing health answers. Clarify the defer/resume experience if it disrupts normal use. |
| Progress & Goals / History | Pass at 402×874: all seven family summaries remain reachable, no horizontal overflow or undersized visible buttons; the single local Partial record remains after reload. |
| Screen lock / background | Pending on the physical phone. The current timer increments delivered one-second callbacks and has no wake-lock or explicit background-resume policy. Do not promise accurate background continuation until measured; a correction may require a deliberate timer-policy decision. |
| Sound / larger text / installed app | Pending on the physical phone. The visual timer remains authoritative and enlarged copy must remain reachable even if scrolling is necessary. |

Evidence is retained outside Git under `Documents/Codex/parallette25-release-evidence/2026-10-17-iphone-usability`, including viewport measurements, portrait/landscape screenshots, current public release checks and the machine-derived remaining-node inventory. No production account payloads or credentials are needed for this task.

### Physical iPhone checklist

Use a separate test athlete for synthetic saved sessions. If that is unavailable, use a private Safari tab with “Start fresh on this device” for the visual/timer checks; keep that tab open during the test. Private browsing is not evidence of normal installed-app or offline persistence. Do not sign out of an existing training account or replace its history just to run this review. No Cloudflare/GitHub login is needed.

1. Open the live app in Safari, keep the phone upright and use ordinary text size. Build a five-minute Custom Session (General / balanced). Before starting, cancel once and confirm Today is available again; then rebuild it.
2. Start the timer without performing exercises. Check that the whole animation, how-to/cues/safety text, countdown and Pause control are visible together, with no sideways scrolling. Check with Safari’s bars visible and after they shrink. Note whether the notch/home indicator obscures anything.
3. Let a complete work interval advance into rest and then into work. Listen for cues at a comfortable audible volume; toggle sound off/on. Note animation clarity, unexpected scroll jumps, missed/duplicate cues and any small or difficult touch targets.
4. Pause, note the exercise/set/countdown, choose Save & close, reload the page and Resume. The paused countdown and exercise/set should be unchanged and should remain paused until Resume is tapped.
5. For background behavior, note the running countdown, switch away for about 15 seconds, return and compare. Separately repeat with a 15-second screen lock. Report what the clock actually did and whether it was understandable; do not assume the app promises background continuation.
6. Rotate to landscape and back. The corrected landscape layout should show the guide, instructions and timer together; confirm that on the phone and check whether portrait restores a readable position. Increase Safari text size to about 150%; content and controls must remain reachable, even when scrolling is necessary. Return text size to normal afterwards.
7. Only in a separate non-private test athlete or account: after the app reports offline ready, test airplane-mode reload/resume and then reconnect. End early and note whether the completion form appears immediately or requires searching/scrolling; select Stopped/Modified honestly, save once and verify exactly one History entry. Do not claim clean exercise performance for this UI test. Report device-only persistence separately from account sync.
8. If already using the Home Screen app, repeat the portrait visibility, sound and pause/reopen checks there. A separate result is needed because browser bars, installation storage and audio/background behavior differ. Do not change account/security settings to perform this check.

**Owner result:** the full update looks good on iPhone 17 and all three requested release checks pass: portrait/landscape visibility, pause/reopen/resume and completion/one History entry. This closes the combined-release acceptance checkpoint. Exact iOS version, Safari/Home Screen mode, background/lock timing, audio, enlarged text and offline behavior remain unreported; do not infer those extra passes. For any later failure, record the exercise, work/rest state and what was hidden or unexpected.

### Proposed content delivery order

At planning time, catalogue v2 had **30 missing nodes in 21 bridge groups: 1 automatic, 19 stronger-gated and 10 specialist**. Accepted production Batch A/v3 has 25 gaps; accepted, undeployed B/v4 reduces them to 20 and C/v5 to 14. Accepted, undeployed D/v6 reduces them to ten specialist gaps in seven groups. Accepted, undeployed E/v7 reduces them to five specialist gaps in four groups. Accepted F/v8 fills those final five nodes; combined release gates are in progress. The inventory below was derived from `remainingProgressionBridges` and `currentDevelopmentGraphs`, not from the older catalogue-v1 gap list. It accounts for every remaining node exactly once and orders every currently missing prerequisite before its dependent node. Batch order is a development sequence, not a new athlete prerequisite or training prescription.

| Proposed batch | Nodes | Purpose / dependency |
|---|---:|---|
| A — Advanced foundations | 5 | Stable balance plus independent Planche, V-sit and forward-loaded pushing outcomes. |
| B — Full Planche and presses | 5 | Assisted → full Planche after A; three independent press branches. |
| C — Freestanding control / HSPU | 6 | Balance transfer and eccentric → partial → full → deficit HSPU after A’s balance anchor. |
| D — Advanced transitions | 4 | Exact composite skills after A/B endpoints; retain independent transition evidence. |
| E — Optional specialist holds/balance/repetition | 5 | V hold, one-arm branch and repeated presses after their respective A/B/C prerequisites. |
| F — Optional specialist dynamic work | 5 | Planche eccentric/concentric, 90-degree pressing and high-load connections after their respective A/B/C prerequisites. |
| **Total** | **30** | **20 automatic/stronger-gated nodes, then 10 separately opted-in specialist nodes.** |

#### Delivered batch A — Advanced foundations (5 nodes; live and iPhone accepted)

Approved by the owner on 2026-10-17 after physical acceptance of the completion/landscape corrections. Author the high-dependency balance anchor first, then the independent Planche, V-sit and forward-loaded pushing outcomes. Each currently has content-backed prerequisites. “Content-backed” does not mean an athlete has demonstrated them.

| Stable node ID | Existing milestone | Existing boundary |
|---|---|---|
| `stable-longer-parallette-balance` | Stable longer parallette balance | stronger-gated |
| `one-leg-planche` | One-leg planche | stronger-gated |
| `stable-straddle-planche` | Stable straddle planche | stronger-gated |
| `stable-v-sit` | Stable V-sit | stronger-gated |
| `advanced-forward-loaded-push-up` | Advanced forward-loaded push-up | stronger-gated |

#### Accepted batch B — Full Planche and unassisted presses (5 nodes; included in the combined v8 release)

The owner authorised this batch on 2026-10-17 after accepting Batch A on their iPhone. Its additive v4 definitions and exact-player review passed the candidate checks; the owner accepted all five animations on 2026-10-17. The separate motion-acceptance ledger binds the exact reviewed package. Deployment is held until all batches are finished. Stable straddle Planche from A precedes assisted full Planche, which precedes full Planche. The three press branches use their existing assisted/negative prerequisites independently; bent-arm press never becomes a prerequisite for straight-arm press.

| Stable node ID | Existing milestone | Existing boundary |
|---|---|---|
| `assisted-full-planche` | Assisted full planche | automatic |
| `full-planche` | Full planche | stronger-gated |
| `full-bent-arm-tuck-press` | Full bent-arm tuck press | stronger-gated |
| `full-straddle-press` | Full straight-arm straddle press | stronger-gated |
| `full-pike-press` | Full straight-arm pike press | stronger-gated |

#### Accepted batch C — Freestanding control and HSPU (6 nodes; included in the combined v8 release)

The owner authorised Batch C and accepted all six animations on 2026-10-17. A separate acceptance ledger binds the exact v5 candidate, guides and historical prepared manifest; production activation is provided only by the separately approved combined v8 gate. The combined deployment proceeded after all batches were accepted. A’s stable longer balance unlocks the content dependency for transfer and freestanding HSPU. Deliver transfer before one-hand-light balance, and eccentric → partial → full → deficit pressing. Retain the existing standard/deeper exit and wall-strength prerequisites; eccentric evidence never proves concentric strength.

| Stable node ID | Existing milestone | Existing boundary |
|---|---|---|
| `freestanding-weight-transfer` | Freestanding weight transfer | stronger-gated |
| `freestanding-parallette-one-hand-light-balance` | Freestanding parallette one-hand-light balance | stronger-gated |
| `freestanding-hspu-eccentric` | Freestanding HSPU eccentric | stronger-gated |
| `partial-freestanding-hspu` | Partial freestanding HSPU | stronger-gated |
| `full-freestanding-hspu` | Full freestanding HSPU | stronger-gated |
| `deficit-freestanding-hspu` | Deficit freestanding HSPU | stronger-gated |

#### Accepted batch D — Advanced transitions (4 nodes; included in the combined v8 release)

The owner authorised Batch D on 2026-10-17 after accepting C, retaining the combined-release hold. The owner accepted its four animations on 2026-10-17; a separate ledger binds the exact v6 candidate, guides and historical prepared manifest. Production activation is provided only by the separately approved combined v8 gate. Use the exact A/B endpoints plus each transition’s existing independent benchmark and safety prerequisites. The negative remains a one-way controlled lower. Endpoint achievements alone never demonstrate a transition.

| Stable node ID | Existing milestone | Existing boundary |
|---|---|---|
| `straddle-l-press-handstand` | Straddle L-sit to press handstand | stronger-gated |
| `full-l-pike-press-to-handstand` | Full L-sit through pike press to handstand | stronger-gated |
| `handstand-to-l-sit-negative` | Handstand to L-sit negative | stronger-gated |
| `straddle-planche-to-handstand-press` | Straddle planche to handstand press | stronger-gated |

#### Accepted batch E — Optional specialist holds, balance and repeated presses (5 nodes; included in the combined v8 release)

The owner explicitly authorised E on 2026-10-17 after accepting D, retaining the deployment hold. The owner accepted all five E animations on 2026-10-17; a separate ledger binds the exact v7 candidate, guides and unchanged prepared manifest. Production activation is provided only by the separately approved combined v8 gate. Athlete specialist opt-in and the exact selected goal remain required. Extended V follows A’s stable V; assisted one-arm follows C’s one-hand-light balance and precedes unassisted one-arm; repeated presses follow their respective B press outcome. Assess each pathway independently rather than requiring unrelated specialist skills.

| Stable node ID | Existing milestone | Existing boundary |
|---|---|---|
| `extended-v-sit-hold` | Extended V-sit hold | specialist |
| `assisted-one-arm-parallette-balance` | Assisted one-arm parallette balance | specialist |
| `one-arm-handstand` | One-arm handstand | specialist |
| `repeated-straddle-presses` | Repeated straight-arm straddle presses | specialist |
| `repeated-pike-presses` | Repeated straight-arm pike presses | specialist |

#### Accepted batch F — Optional specialist dynamic pushing and connections (5 nodes; combined release authorised)

The owner explicitly authorised F on 2026-10-17 after accepting E, retaining the deployment hold. The owner accepted its five exact-player animations and authorised combined release checks and deployment after they pass. The literal F acceptance ledger preserves the unchanged prepared manifest. Athlete opt-in and the exact specialist target remain mandatory. Planche eccentric requires full Planche plus advanced forward-loaded pushing and existing capacity evidence; concentric full Planche push-up additionally requires the eccentric. The 90-degree HSPU requires deficit freestanding HSPU and forward-loaded pushing; its handstand-to-Planche connection additionally requires full Planche and stable balance. Preserve the separate Planche-to-handstand path.

| Stable node ID | Existing milestone | Existing boundary |
|---|---|---|
| `full-planche-push-up-eccentric` | Full-planche push-up eccentric | specialist |
| `full-planche-push-up` | Full Planche push-up | specialist |
| `ninety-degree-hspu` | 90-degree HSPU | specialist |
| `full-planche-to-handstand-transition` | Full planche to handstand transition | specialist |
| `ninety-degree-handstand-to-planche-transition` | 90-degree handstand-to-planche transition | specialist |

### Delivery and approval gates for each proposed batch

1. **Prove the content need and scope.** Use the existing planner and representative prerequisite-complete profiles to confirm which missing destination is reached. Preserve the existing graph edges, capacities, restrictions, freshness, demand compatibility and specialist opt-in. Resolve any genuine conflict before implementation; do not add content merely to increase catalogue volume.
2. **Review the exact content package.** Each node needs an exercise or precisely scoped variant, complete versioned benchmark conditions, apparatus/assistance/range/quality/safety criteria, movement-specific confirmation/freshness, conservative prescriptions and authored regressions. Do not invent numeric thresholds in this planning step. Obtain appropriate coaching/research review when authoring those claims. Existing registry-proposed content IDs are proposals, not proof that one new exercise is sufficient for a multi-node group.
3. **Preserve historical interpretation.** Catalogue v1/v2 and their semantic fingerprints remain immutable. Plan an additive versioned content overlay and explicit compatibility rules; retain stable IDs for unchanged subjects. Old sessions must replay with their original definitions, and no new advanced outcome receives backdated achievement.
4. **Produce and approve owned motion.** Specify exact camera, apparatus, assistance, full entry/hold or rep/exit, visible body landmarks and playback behavior. A negative/exit must not reverse into a falsely demonstrated ascent. Reuse a guide only when physical execution truly matches; keep benchmark authority separate. Review every changed guide in motion in the final phone player, then bind approval to its fingerprint.
5. **Verify the affected paths.** Run focused references/DAG/protocol and generator-frontier checks, positive/negative eligibility cases, symptom/equipment/freshness and Challenge/no-bypass cases, counterpart progression boundaries, historical replay, owned-media integrity and affected phone/UI checks. Run type checking and a production build when source changes. Use broader checks only when the affected scope warrants them.
6. **Review each batch; release together after completion.** Present every batch in isolation and obtain explicit owner animation acceptance. Per the owner’s 2026-10-17 instruction, hold deployment until all remaining progression batches are finished; do not publish Batch B individually. This changes release timing, not approval for later batches. Final deployment still needs an exact approved artifact, fresh release health and retained rollback. Complete a fresh encrypted export and restore check if data/migration/release contracts require it; the Phase 11 historical archive exception does not waive future retention. Stop at the batch checkpoint before starting another unapproved batch.

**Current checkpoint:** The approved mixed workout/Custom-preview update is live and verified. All previous A–F content/media acceptance remains intact. Full checks include 394 combined cases, 50 mixed-plan cases and seven actual-player lifecycle cases; exact work/rest, protected primary/technical work, durable group locks and one-record partial saving pass. Fresh encrypted backup/restore has all 14 invariants zero. All 23 served files match the checked build; live account preview, swap/reload, paused recovery, phone layouts, one synced 14-second Partial record and unchanged earlier history pass. See runbook Section 16 for identity/evidence. The owner accepted all three latest-update iPhone checks on 2026-10-18 and approved PR #26 integration. No next implementation task, cleanup or rollback retirement is authorised.


## Post-release task — timer and background reliability

The owner authorised this task and deployment after passing checks on 2026-10-18. Operational behavior belongs in Training Engine §6.7, draft compatibility in Data & Migration §5.10 and release evidence in runbook §17. Implemented shared foreground elapsed-time sampling, explicit auto-pause on hide/pagehide/suspension, synchronous measured checkpoints, explicit Resume and best-effort screen wake lock for both mixed and native-order production workouts. The frozen historical player/media pins remain intact. No training, authority or database schema change.

Full checks/type checking pass, with 31 actual runner/hook/controller scenarios covering drift, suspension, hide-before-render, boundary/queued-callback races, v1/v2/v3 recovery, native/mixed order, wake-lock rejection/release/late grants and one completion. The local browser preserves rest at 00:46 elapsed / 00:14 remaining across leave/back/reload, resumes explicitly, and saves one preparation-only Partial record. Portrait 402×874 and landscape 874×402 fit without overflow. On 2026-10-18 the owner reports all four iPhone checks pass: app switching, screen lock during work/rest, visible screen-awake behavior and Save & close/reopen/resume/completion with exactly one History entry. No unrelated task is authorised.

**Release checkpoint:** Workflow 39070805835 deployed exact source `013f4946a7daae39d21f3c0e808fd8ef3c74b7ce`; all 23 live files, API health and test-account interruption/reload/resume/save/export checks pass. PR #27 records the delivered change. The owner accepted all four iPhone checks and explicitly approved merging PR #27 on 2026-10-18. No unrelated task is authorised.


## Post-release task — goal skill roadmap

**Status (2026-10-18):** Delivered and live verified by controlled workflow 39112930139 from exact source `c633175aade2f0a70db3bc01d583be8751bb5d3b`, based on verified PR #27 main. [PR #28](https://github.com/kyriakos243/parallettes/pull/28) awaits owner iPhone acceptance and explicit merge approval. Phase 11 remains closed.

**Scope:** Progress shows primary/secondary goal trees, current/next markers, all existing milestone branches and exact prerequisite/confirmation details, including supporting capacities and navigable cross-family paths. Contract is canonical in Training Engine §6.8. The app retains current evidence, safety, specialist and workout authority; there are no new skill definitions, scores or schema changes.

**Checks:** Full 103-node/edge/requirement selector validation, higher-evidence and alternative-route regressions, existing Phase 8 and Phase 10 UI safeguards, TypeScript, production build/distribution, and local phone-size interaction checks pass. Owner visual acceptance and deployment authority are recorded. Full CI checks, fresh encrypted backup/restore, exact served-file equality, live prerequisite/target/navigation checks, responsive layout and unchanged observation exports pass. Runbook §18 owns the release evidence. Physical iPhone acceptance is the remaining checkpoint; no next task is authorised.
