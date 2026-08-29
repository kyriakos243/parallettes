# Parallette25 vNext Master Plan

**STATUS: PHASE 11 PRODUCTION RELEASE LIVE — OBSERVATION WINDOW ACTIVE**

- Architecture direction: approved foundation
- Last substantial update: 2026-08-29
- Inspected v1.2 implementation baseline: release commit `61b0876`; live GitHub Pages deployment verified as successor `4507da4` with the same application tree and `61b0876` ancestry
- Current implementation phase: **Phase 11 — Controlled production migration and release**
- Implementation authorised: **YES — PHASE 11 ONLY**

> **MASTER_PLAN.md is the authoritative persistent project context. Read it before substantial architectural or implementation work. Update it only when an approved architectural decision, significant product requirement, completed implementation phase, important project discovery, roadmap change or project-state change occurs. Do not turn it into a conversation transcript or routine implementation log.**

This compact file is the project map: it contains universal context, current decisions, routing and state. Detailed material has one canonical specialist home and should be loaded only when relevant.

## 1. Progressive-Disclosure Routing

After this file, read only the references needed for the authorised task:

| Detailed document | Canonical contents | Load when |
|---|---|---|
| [Skill Architecture](docs/VNEXT_SKILL_ARCHITECTURE.md) | Full graphs/tracks, capacities, benchmark relationships, exercise roles, catalogue gaps and advanced/specialist boundaries. | Graph, benchmark, exercise-content, progression-content or advanced-skill work; principally Phases 2 and 7. |
| [Assessment & Training Engine](docs/VNEXT_TRAINING_ENGINE.md) | Adaptive placement, capability/confidence/trainability, progression policies, emphasis, generator/load/timing and related UX. | Assessment, projector-policy, generator, Progress & Goals, Today or review work; principally Phases 3, 5, 6 and 8. |
| [Data & Migration](docs/VNEXT_DATA_MIGRATION.md) | Detailed authority model, persistence, sync, replay, legacy conversion, reset cutoff, migration, rollback and compatibility. | Domain/evidence/persistence/sync/migration/release work; principally Phases 1, 3, 4 and 9–11. |
| [Implementation Roadmap](docs/VNEXT_IMPLEMENTATION_ROADMAP.md) | Complete Phase 1–11 scope, dependencies, affected/untouched systems, checks, compatibility and owner gates. | Planning, executing or reviewing a phase. Load the current phase and necessary dependencies, not all phases by default. |
| [Research Basis](docs/VNEXT_RESEARCH_BASIS.md) | Sources, biomechanics/programming rationale, evidence limits and safety boundary. | Training-science reconsideration, benchmark rationale, safety/content disputes or research updates—not routine implementation. |

`AGENTS.md` defines how agents select context and work. Historical chat is secondary.

## 2. Product Vision and Scope

Parallette25 is a mobile-first, time-efficient parallette training system. v1.2 is strongest from beginner through strong intermediate, with early advanced work in support, compression, inversion, balance and pushing.

vNext should become a long-term evidence-led system that places new or experienced athletes sensibly, develops several skills independently, generates goal-directed sessions and progresses from basic support toward genuinely advanced strength, compression, balance, pressing and transitions.

The honest identity is:

> **A specialised parallette pushing, support, compression, inversion, balance and pressing programme—not a complete all-domain calisthenics programme.**

Parallettes do not provide complete pulling or lower-body development. The default audience is healthy adults training independently. Clinical rehabilitation, diagnosis, paediatric gymnastics and coached elite acrobatics are outside normal scope.

## 3. Current v1.2 Baseline

The repository's designated v1.2 implementation baseline is package version `1.2.0` at release commit `61b0876` (`codex/final-product-audit`). Internal code/docs also use “V2/V2.1.” Live deployment was not independently inspected, so verify it against this baseline before release/cutover work.

| Area | Inspected v1.2 behaviour |
|---|---|
| Programme | Five permanent themes/days and 15 authored variants: five days × L1 Foundation, L2 Progress and L3 Challenge. Levels affect the whole session and cumulative exercise eligibility. |
| Catalogue | 195 movements: 40 retained plus 155 additions, with owned motion/static demonstrations, stable IDs, regressions, safety/equipment and coarse load metadata. |
| Timing | Exact 25 minutes: 3 warm-up + 4 preparation + 5 handstand + 12 core + 1 cooldown. L2/L3 may add a 5-minute Lab for 30 minutes. Custom sessions accept broader durations. |
| Assessment/readiness | Optional resumable 14-track assessment creates provisional placements and one suggested L1/L2/L3 across all days. Eight Boolean readiness gates exist; seven are manually visible and G0 pain-free loading is effectively assumed in UI. |
| Progression | Fifteen visible linear paths use easier/harder links. Two clean target sessions can advance a recommendation; “hard” feedback may regress it. |
| Evidence/data | Completed/modified/partial sessions, performed exercises and lightweight reviews are saved. Persistence is local-first IndexedDB/localStorage with optional Cloudflare Worker/D1 password sync, JSON backup/import, merge logic and reset tombstones. |
| UI | Mobile-first Home/Today, day tabs, comfort level, Lab/custom session, Skills & readiness, adaptive assessment, history and account/sync tools. |
| Effective ceiling | Full L-sit attempts/transitions, floor tuck-planche attempt, freestanding kick-up and entry–balance–exit chain, pseudo-planche push-up, eccentric pike push-up and straddle compression—but no mature full Planche, V-sit, HSPU or Press trees. |

### Critical repository warning

The original user workspace remains on `codex/improve-exercise-motion` at `2d7ee8e`. It is a divergent sibling of `61b0876` (merge base `796b69e`) and does **not** contain the full v1.2 assessment/progression/reliability implementation; local `main` does not contain `61b0876` either. Phases 1–10 were therefore implemented in the isolated `codex/vnext-phase-1` worktree, whose starting commit is exactly `61b0876`; the original workspace and its unrelated files were left untouched.

**Phase 1 had to start—and all later vNext work must continue—from `61b0876` or a verified successor containing it, with the approved planning documents carried into that branch. Never implement vNext against `2d7ee8e`.** Use canonical tracked application files; plausible untracked/suffixed copies remain user-owned until explicitly reconciled.

## 4. Core Design Principles

- **Evidence over declaration:** assessment estimates placement; training and guided-test evidence becomes authoritative.
- **Achievement is not availability:** preserve demonstrated history while current restrictions, confidence, inactivity and load govern today's trainability.
- **Mixed profile, no global level:** skills progress independently; Technique/Easier, Standard and Challenge describe today's demand only.
- **Graph outcomes, tag drills:** model observable milestones and cross-family prerequisites, not every exercise.
- **Observable shared capacities:** retain only benchmarkable enablers that change decisions; no pseudo-precise scores.
- **Purposeful sessions:** one primary hard purpose, only compatible secondary/maintenance work, and technical inversion while fresh.
- **Conservative ambiguity:** unknown, stale or contradicted evidence causes a safer variation or targeted test.
- **Explainable and simple:** internal sophistication must produce plain user-facing reasons and few choices.
- **Offline-first and migration-safe:** raw observations are durable; projections are rebuildable; legacy evidence is never inflated.
- **Bounded advanced scope:** coherent normal progression first; stronger-gated and specialist work is explicit, opt-in and never surprise content.

Research supports these broad constraints, not one scientifically proven parallette ladder. See the [Research Basis](docs/VNEXT_RESEARCH_BASIS.md).

## 5. Concise vNext Architecture

> **Versioned training definitions + append-only athlete observations + athlete intent → rebuildable athlete state → goal-directed planning → immutable session plan/record → further observations**

Three authority classes remain distinct:

1. **Definitions** say what exercises, graphs, capacities, benchmarks and policies mean.
2. **Observations**—evidence events and immutable Session Records—say what happened or was reported.
3. **Athlete Intent** says what the athlete wants, owns and prefers.

Capability, confidence, restrictions, recent load, working nodes and app-recommended emphasis are derived projections, not manually edited truth.

### Core entities

| Entity | Concise responsibility |
|---|---|
| Exercise Definition | Stable content, roles, equipment, prescription/demand tags, benchmark links and substitutions. |
| Development Graph | Observable milestones and simple cross-graph `allOf`/limited `anyOf` prerequisites. |
| Capacity Definition | Small shared benchmarkable enabler; never a percentage score. |
| Benchmark Protocol | Versioned observation target, assistance/range, quality/safety and confirmation/freshness policy. |
| Athlete Evidence Event | Immutable non-session placement/test/restriction/legacy/correction observation. |
| Athlete Intent | Goals, user emphasis override, equipment, preferences and default session demand—not app recommendation. |
| Session Plan | Immutable versioned prescription and rationale. |
| Session Record | Sole immutable authority for actual session facts; no duplicate session event. |
| Derived Athlete State | Rebuildable capability/confidence, trainability, load, working nodes, maintenance needs and eligible targets. |

Detailed ownership, correction and persistence contracts live in [Data & Migration](docs/VNEXT_DATA_MIGRATION.md).

## 6. Skill and Capacity Summary

Five primary outcome families are **Planche, L-Sit/V-Sit, Handstand Balance, Vertical Push/HSPU and Press to Handstand**. A general **Parallette Pushing** foundation track and cross-family **Transitions** graph support them.

| Graph/track | Direction |
|---|---|
| Planche | Support/protraction and leans → assisted/tuck → advanced tuck → one-leg/straddle → full; dynamic work remains a distinct branch. |
| L-Sit/V-Sit | Assisted/tuck → one-leg/full L → stable/high L and compression → V-sit; long-leg nodes, not beginner support, require compression/access. |
| Handstand | Separate safety/exit, line, entry, pressure/balance and weight-transfer branches; exit competence precedes high inversion/freestanding work. |
| HSPU | Pike depth/strength → wall eccentric → assisted/partial concentric → full/deficit wall → freestanding; eccentric never implies concentric. |
| Press | Assisted/eccentric patterns with separate bent-arm, straight-arm straddle and pike branches; depends across support, compression and handstand. |
| Pushing | General horizontal push/deficit/asymmetry distinct from Planche straight-arm and HSPU vertical strength. |
| Transitions | Cross-graph outcomes require both endpoints plus a transition-specific benchmark. |

Seven shared capacity domains are retained: straight-arm support/protraction facets, overhead support/elevation, horizontal bent-arm push, vertical bent-arm push, pike compression/access, straddle compression/access and body-line/trunk control. Current upper-limb loading and safe inversion/exit are trainability/benchmark concerns, not permanent capacity scores.

The full graph, catalogue and benchmark design is canonical in [Skill Architecture](docs/VNEXT_SKILL_ARCHITECTURE.md).

## 7. Assessment, Evidence, Readiness and Progression

- Placement is brief, optional, resumable and goal-directed: safety/context → goals → small common anchors → adaptive branches → provisional review → optional guided placement.
- `Progress & Goals` replaces manual readiness as long-term capability authority. “I already have this” initiates validation rather than toggling a skill.
- Keep **demonstrated capability**, **current performance confidence** and per-prescription **current trainability** separate.
- Milestones progress through Unknown, Estimated, Developing, Demonstrated and Established; current/stale/contradicted confidence is separate.
- Confirmation varies by movement type: static, dynamic, balance, transition, mobility and safety. There is no universal one-success or two-session unlock.
- Failure, pain, inactivity or deload may lower today's work without deleting achievement. Higher-node evidence marks only necessary predecessors satisfied-for-eligibility, never falsely demonstrated.
- The Phase 3 projector deterministically separates lifecycle from confidence and per-prescription trainability, retains raw dated load exposures, and emits reason-coded working, maintenance and eligible-target states.
- Legacy readiness claims remain placement hints and satisfy no vNext prerequisite until validated.

Detailed flow and progression policy: [Assessment & Training Engine](docs/VNEXT_TRAINING_ENGINE.md). Detailed evidence authority and migration semantics: [Data & Migration](docs/VNEXT_DATA_MIGRATION.md).

## 8. Generator and Long-Term Programming

The **emphasis planner** recommends a rolling primary, optional compatible secondary and maintenance allocation from goals and evidence. Review after a meaningful sample—roughly 8–12 eligible sessions, a milestone, plateau, restriction or goal change—not a rigid calendar block.

The **session composer** selects working nodes, filters prerequisites/trainability/equipment/freshness/specialist opt-in, applies recent-load compatibility, sequences technical work while fresh and records reason/version data.

Phase 6 implements these as a pure shadow planner. It selects only exact node-scoped milestone prescriptions or explicit capacity protocols, recursively routes genuine cross-graph prerequisites, adopts only independently trainable safe alternatives, and reports missing content instead of substituting broad graph-tagged drills. App-owned emphasis continuity remains separate from Athlete Intent.

Each prescription has low/moderate/high ordinal demand across hand/wrist bearing, forward straight-arm upper-limb, overhead straight-arm upper-limb, horizontal push, vertical push, inversion/technical and compression/trunk domains. One primary high upper-limb demand is normal; incompatible high Planche and HSPU/Press work is not combined merely because both are unlocked.

Approximately 25 minutes remains the product contract, with exact 25 targeted when safe relevant content exists. Block ranges trade within one hard budget and include rest; a shorter explicit safety exception is allowed only when no relevant safe substitute/reset exists. Never add filler. The optional 30-minute Lab is for guided testing, compatible extra skill dose or opted-in specialist practice.

Full planning, timing, feature-isolation and UI rules: [Assessment & Training Engine](docs/VNEXT_TRAINING_ENGINE.md).

## 9. Advanced Scope and Existing-System Impact

- **Normal automatic:** coherent two-arm Handstand, full/deficit wall HSPU, stable L-sit/V preparation, Planche through advanced tuck with assisted higher work, assisted/eccentric Press and foundation/intermediate transitions.
- **Stronger-gated automatic:** stable freestanding Handstand/weight transfer; unassisted freestanding HSPU eccentric/concentric attempts; unassisted straddle/full Planche, V-sit, Press and advanced transitions.
- **Optional specialist:** dynamic/full Planche push-ups, 90-degree HSPU, one-arm Handstand, repeated advanced Press, manna and high-load combinations.
- **Out of scope:** pulling/rings, tumbling, comprehensive lower body, rehabilitation and diagnosis.

Preserve the 25/30-minute identity, mobile/offline/PWA experience, accounts/security/sync foundations, stable IDs/history, owned media, equipment filtering, substitutions and backup/import. Evolve exercise metadata, assessment, generator, session evidence and Lab purpose. Redesign the authority/projection model, skill depth and Progress & Goals UI. Deprecate global ability levels, readiness Booleans as authority, universal two-clean-session progression and duplicated linear graph links only after safe migration; history remains readable.

Deferred, not committed: broader equipment, complementary pulling/lower-body tracking, coach/video or computer-vision assessment, social comparison, full specialist breadth, rehabilitation support and overall scores.

## 10. Approved Decisions and Material Questions

Already approved by the owner's brief:

- This file owns persistent product/architecture state; `AGENTS.md` owns working practice; specialist documents own routed detail.
- No vNext implementation starts without explicit phase approval. Execute, check, report and review phases one at a time; never auto-start the next.
- Preserve the approximately 25-minute identity, existing data where safely interpretable, a simple user experience and honest specialised scope.
- Use progressive disclosure and consolidated expensive QA near the end.

The architecture is the approved foundation. Each implementation phase still requires separate explicit owner approval.

Phase 1 fixed the minimum contract defaults: schema, definition and projection versions are positive integers; persisted IDs are opaque lowercase-safe keys compatible with existing UUIDs, while new authored definitions use lower-kebab IDs; prerequisites allow one flat `allOf` plus one flat two-to-four-option `anyOf`; Session Records alone own session outcomes and their benchmark observations; evidence events use canonical underscore discriminators and cover non-session observations only.

Phase 2 fixed the seven final graphs and their branches, seven shared capacities, automatic/stronger-gated/specialist classification, complete protocols for 43 existing milestones and 21 capacity facets, all 195 v1.2 catalogue role/demand/substitution mappings, and a 41-group Phase 7 registry covering 60 genuinely missing nodes. The 103-node graph has 43 current-content nodes and 60 honest `missing-content` nodes; missing nodes carry no fake exercise or protocol. Protocols own exact apparatus, assistance and range conditions with movement-specific confirmation/freshness; floor and parallette evidence remain distinct; standard- and deficit-depth wall-HSPU exits are separate; and source plus complete semantic fingerprints prevent silent definition drift. Legacy regression guidance is preserved in separate regressed prescriptions rather than benchmark conditions. Gap content priority is independent of programming permission, so Phase 6 must prove a `planner-core-candidate` before Phase 7 implements it.

Phase 3 fixed projection policy v1: raw event or Session-Record-item sources replay deterministically at an explicit cutoff; exact versioned protocols govern evidence strength, confirmation, freshness and contradiction; only Established/current findings unlock prerequisites; and capability history survives restrictions, difficult days, inactivity and deload. Protocol reuse and stronger-node predecessor implications are explicit directional whitelists: one source may support several compatible findings, but it remains one observation and one load exposure. Guided tests now carry a test-occasion identity, successful-attempt evidence records total attempts, Session Records carry an as-known `recordedAt`, and derived capacity/restriction/load provenance is source-addressable. Cross-version evidence is rejected unless an explicit compatibility rule exists.

Phase 4 fixed the shadow persistence boundary: a separate vNext IndexedDB and additive, disabled-by-default authenticated D1 delta route store immutable plans, Session Records and Evidence Events by stable ID/canonical hash; mutable intent and the highest reset tombstone converge separately; Derived Athlete State remains a disposable, exact-time/version cache. Exact retries collapse, divergent immutable IDs fail closed, and `progressResetAt` is a strict lower bound before every replay/import/sync union: reset physically purges cutoff facts and dependent correction, clearance or replacement chains. The deterministic v1.2 converter retains exact recovery snapshots and explicitly sparse plan/record provenance, so unknown per-item timing or prescription precision cannot become benchmark proof. JSON backup preserves each immutable entity's native/original-run provenance. Rollback terminally revokes the run and excludes converter-only truth while retaining its raw immutable payloads as non-projecting quarantine; an active co-owner manifest or native dependency can therefore reuse the same fact without duplication or behind-cursor loss. Legacy v1.2 fields and feature authority remain untouched.

Phase 5 fixed the isolated placement/evidence-capture boundary: safety/context and one-to-three goals route through three common anchors and short goal ladders; experience starts near a plausible point, clean answers move upward, uncertain answers trigger targeted confirmation, and symptoms stop affected work. Self-assessment commits only weak versioned observations, while a guided result requires a currently safe offer plus the exact protocol metric, conditions, quality and safety. Existing users receive targeted reconfirmation rather than onboarding. Resumable drafts are local non-authoritative UI state; meaningful workout review persists only through the Session Record. Nothing is mounted into the live v1.2 assessment, recommendations or generator.

Phase 6 fixed the isolated planning boundary: a deterministic versioned planner consumes only Athlete Intent, the exact definition bundle and current Derived Athlete State; selects a primary, compatible secondary and due maintenance; follows unmet milestone and nested capacity prerequisites across graphs while choosing one honest `anyOf` route; and composes an exact 25-minute Session Plan when enough safe relevant content exists. Technique/Standard/Challenge changes today's variants and dose, never the skill frontier. Every targeted item must be explicitly node-scoped, every item carries a current Phase 3 trainability decision, and high-load graph conflicts, recent exposure, equipment, restrictions and specialist opt-in fail closed. Complete semantic plan content determines immutable IDs; missing Phase 7 content is reported rather than invented. Nothing is mounted into the live v1.2 generator or feature authority.

One narrow prerequisite correction was required: catalogue demand profiles intentionally contain `low` values for all seven domains, so Phase 3 restriction overlap now treats only moderate/high exposure as material. This aligns with the Phase 5 safety rule and prevents an inversion-only restriction from blocking unrelated recovery work; capability and restriction authority did not change.

Phase 7 fixed additive catalogue v2 while preserving catalogue v1 for exact replay and legacy conversion. Thirty node-scoped Exercise Definitions and 30 protocols fill 20 planner-proven automatic bridge groups across all seven graphs, taking the current bundle to 225 exercises, 94 protocols and 73 content-backed nodes; 30 nodes remain honest gaps—one dependency-blocked automatic node, 19 stronger-gated outcomes and ten specialist destinations. The delivery completes the automatic advanced-tuck/assisted-Planche, L/V preparation, repeatable balance, wall-HSPU, assisted/eccentric Press, deficit-pushing and intermediate-transition ceiling without weakening stronger or specialist gates. Twenty-eight new owned-motion briefs cover the 30 movements, including exact assistance geometry, one-way exits/negatives and visible HSPU depth targets; renderable assets remain a later integration requirement. Catalogue-v1 evidence promotes only through explicit unchanged-subject compatibility, and catalogue-v2 semantics are frozen by fingerprint. Nothing is imported by the live v1.2 catalogue, generator, UI or feature authority.

Phase 8 fixed the athlete-facing presentation boundary. Pure selectors now translate the approved projection, intent, assessment, restrictions and generated Session Plan into seven-family Progress & Goals summaries/details, simple current/next/prerequisite/focus wording, source-honest provisional placements, goal/emphasis controls, Today focus/reasons/demand, targeted check/reconfirmation actions and meaningful workout-review prompts. The isolated React surface emits commands only: goals cannot alter evidence, Challenge cannot alter the eligible frontier, restriction copy preserves achievement history, exact guided-test actions retain protocol identity, and completion feedback remains a partial item-outcome mapping for one later Session Record. No raw scores, reason codes, graph mechanics or manual capability controls are exposed.

Phase 8 also established two integration requirements without changing architecture. Migrated versus assessment-derived provisional wording uses a read-only provenance index built from the same immutable observations because the rebuildable projection intentionally does not persist UI source labels. The new surface could not be mounted through the old root because it executes legacy hooks before internal routes; Phase 9 therefore had to select one authority before importing either application branch.

Phase 9 fixes the first integrated release candidate, `parallette25-vnext-rc.1`, against source fingerprint `fa7984d06d785106251eb7b5cf888c4165ea62fabdc092cb0cc7f4534570c34d`. Build-time branching produces mutually exclusive application graphs: an ordinary artifact contains only the v1.2 root, while the RC artifact contains only vNext and stays inert unless its exact ID, `/parallettes/vnext-rc/` base and request agree. The request query identifies the artifact; it is not access control, so staging requires an access-controlled isolated origin or a proven-active parent-v1 service-worker exclusion before any nested same-origin RC is exposed.

The RC coordinator owns bootstrap, exact cache-or-replay projection, adaptive assessment and guided tests, catalogue-v2 planning, presentations, workout execution and the next recommendation. Exact active plans, measured timer facts, guided observations and prepared completions survive reload for idempotent retry; one initial Session Record is bound one-to-one to its plan, and later corrections form one linear chain. Cache write failure cannot invalidate freshly rebuilt truth. Targeted no-symptom assessment appends history-preserving clearances only for earlier explicit reports; concurrent device clearances coexist and fold deterministically, while session-derived symptoms remain restricted. Copied migration, interrupted/resumed paging, offline replay, multi-device union, export/import, reset non-resurrection, snapshot recovery and non-destructive rollback reconcile in focused local/in-memory rehearsal. No live database migration, profile conversion, deployment or production authority switch occurred.

Phase 10 corrects and freezes `parallette25-vnext-rc.3` as the comprehensive-validation candidate at source fingerprint `1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47`. The domain, seven-graph, protocol/catalogue, assessment/projection/planning, complete athlete-journey, persistence/sync/migration/reset/rollback, account-boundary, owned-media, accessibility/mobile/PWA and mutually exclusive build checks pass. Corrections stayed within the approved architecture: explicit goals report missing-content gaps even when a safe prerequisite family is promoted; ordinary v1 does not bundle vNext media; prerequisite blocks do not appear as athlete restrictions; recoverable workouts say Resume; and account-scoped observations fail closed around session identity and expiry.

The owner rejected the RC.2 still-frame media review because motion revealed incorrect L/V geometry and face direction. RC.3 re-audits all 28 code-native guides/30 movements in their exact final-product player, with frozen frames retained only as secondary technical evidence. The corrected fingerprints are technically approved against exact pose, apparatus, assistance, depth, duration, direction, landing and one-way-playback contracts. Production remains fail-closed because explicit owner acceptance of the live RC.3 animations is pending; no silent fallback exists. Phase 10 therefore recommends **NOT READY FOR PHASE 11** until that gate is accepted. No architecture redesign, live migration, deployment or production authority switch occurred.

The Phase 10 owner checkpoint should review the corrected release evidence and exact owned-motion guides. Later gates must also confirm:

1. production and technical approval of the 28 owned-motion assets before any live content release;
2. equipment expansion beyond parallettes, floor, wall and optional rope;
3. any population expansion beyond healthy adults.

## 11. Implementation Philosophy and Phase Summary

- Build the deterministic domain/evidence/planning spine before UI polish or large content expansion.
- Keep v1.2 authoritative behind coherent feature isolation until an explicitly approved Phase 11 cutover.
- Use proportionate early checks; fix safety, data-loss, migration or foundation failures immediately; run comprehensive integrated QA in Phase 10.
- After each authorised phase, update project state/material deviations and stop for owner review.

| Phase | Outcome | Primary detailed context |
|---|---|---|
| 1 | Domain contracts and validators; no behaviour/data writes. | Roadmap + Data/Migration |
| 2 | Skill graphs, capacities, benchmark policies and catalogue mapping. | Roadmap + Skill Architecture |
| 3 | Deterministic evidence/derived-state engine. | Roadmap + Data/Migration + Training Engine |
| 4 | Observation persistence, sync and legacy converter in shadow mode. | Roadmap + Data/Migration |
| 5 | Isolated adaptive placement, guided tests and evidence capture. | Roadmap + Training Engine + Data/Migration |
| 6 | Goal-directed emphasis and workout generator in shadow. | Roadmap + Training Engine + Skill Architecture |
| 7 | Proven missing progression bridges and advanced content. | Roadmap + Skill Architecture; Research only if rationale changes |
| 8 | Progress & Goals and Today UX behind isolation. | Roadmap + Training Engine |
| 9 | Integrated release candidate and migration rehearsal; no live migration. | Roadmap + Data/Migration |
| 10 | Comprehensive validation, correction and release approval. | Roadmap + all documents only as test scope requires |
| 11 | Separately approved controlled production migration/release. | Roadmap + Data/Migration |

The complete delivery contract and every review gate live only in [Implementation Roadmap](docs/VNEXT_IMPLEMENTATION_ROADMAP.md).

## 12. Current Project State

- **Current production version:** **`parallette25-vnext.1`**, build `33055d9391f5136450dc`, distribution fingerprint `6ea84cd7835a8d605708e33fa9e673534d38c5fed230914162e1842b55dee6d4`, cache lane `vnext-production1`. The retained v1.2 rollback artifact remains verified at successor `4507da4`, which contains `61b0876` and the same v1.2 application tree.
- **Architecture status:** **APPROVED FOUNDATION**
- **Current implementation phase:** **Phase 11**, authorised by the owner after approving Phase 10 and the exact RC.3 live animations.
- **Completed phases:** **Phases 1–10** are complete and owner-approved. Phase 11 snapshot, additive schema, API authority, exact artifact publication, bounded live smoke and immediate reconciliation gates are complete; the agreed observation window remains open.
- **Current approved milestone:** Owner-approved `parallette25-vnext-rc.3` remains immutable provenance. `parallette25-vnext.1` is production authority at the exact frozen hashes. D1 migration `0002` is applied additively; per-athlete conversion is active; all legacy data, recovery snapshots and the verified v1.2 rollback lane are retained. Immediate production smoke passed fresh workout/session/next-recommendation, migrated-profile idempotence, offline replay, multi-device union, reset/stale-device suppression, cache isolation and rollback readiness. Read-only reconciliation recorded five activated profiles, four migration receipts/snapshots, 13 plans, 32 evidence events and 11 Session Records with every integrity invariant at zero.
- **Next intended action:** Keep production under bounded observation through `2026-08-30T08:40:19Z`, retain rollback controls and legacy compatibility, then run the final read-only reconciliation and close Phase 11 only if health, authority hashes and all invariants remain clean. Legacy cleanup or rollback retirement is not authorised.
- **Implementation authorised:** **YES — PHASE 11 ONLY**
- **Live application behaviour/data changed:** **Yes, within authorised Phase 11 scope.** Production now serves one coherent vNext read/write path; the compatible Worker has vNext sync and production authority enabled together; D1 carries additive normalised observation tables; and first-access profiles convert idempotently. No live profile was bulk-rewritten, no legacy field/path was deleted, and projection caches remain rebuildable.
- **Repository warning:** original-workspace `2d7ee8e` and local `main` are not valid vNext implementation bases without reconciliation; continue vNext work from `codex/vnext-phase-1` or a verified successor containing `61b0876`; see Section 3.
