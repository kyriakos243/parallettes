# Parallette25 vNext Assessment and Training Engine

[Back to the project map](../MASTER_PLAN.md)

**Status:** APPROVED FOUNDATION — PHASE 11 RELEASE ONLY; ENGINE/UX ARCHITECTURE FROZEN

**Implementation authorised:** NO ENGINE OR UX REDESIGN — PHASE 11 RELEASE ONLY

This is the canonical detailed source for adaptive placement, capability/readiness interpretation, progression policy, long-term emphasis, workout composition and the user surfaces that expose them. Read it for assessment, projection-policy, generator, Progress & Goals, Today or workout-review work. Data ownership/migration lives in [Data & Migration](VNEXT_DATA_MIGRATION.md); graph content lives in [Skill Architecture](VNEXT_SKILL_ARCHITECTURE.md).

## 0. Relevant v1.2 Engine Context

v1.2 has five permanent themes: Foundation & Abs; Compression & Tuck Strength; Light Line & Control; Abs & Overhead Strength; Integration & Balance. Fifteen authored variants combine five days with L1/L2/L3 whole-session choices. The normal order is Warm-up → Prepare → Handstand → optional Lab → Core → Cooldown, with an exact 25-minute base and 30 minutes when Lab is present.

Custom generation uses focus, equipment, difficulty, selected blocks, duration, readiness, recent use, feedback and simple progression evidence. Its UI supports short presets and longer custom minutes. Eligibility filters equipment/level/readiness and ranking penalises recent or “too hard” work, but existing `fatigueCost`/`loadTags` do not enforce a real multi-domain session budget. The assessment, seven visible readiness attestations, 15 linear progression paths and global suggested level overlap in deciding what an athlete can do; vNext resolves that overlap below.

## 1. Assessment and Placement

Assessment estimates a starting point; actual training and guided-test evidence becomes the long-term authority.

### 1.1 Adaptive flow

1. **Safety/context:** current symptoms/restrictions, relevant medical restriction, long inactivity, inversion familiarity and available equipment. A symptom-causing test stops the affected branch and records a restriction; the app does not diagnose.
2. **Goals early:** Handstand, Planche, L/V-sit, HSPU, Press or General Parallette Strength. Skip irrelevant advanced testing.
3. **Small common screen:** visual/animated anchors for basic load/support, compression, pressing and—only when appropriate—inversion plus safe exit.
4. **Goal branches:** begin near the estimated level, move up only after a clean result, and stop after partial/not-yet/symptom responses.
5. **Review:** show provisional family starting points, restrictions and suggested priorities; award no achievement.
6. **Optional guided placement session:** gather stronger timed/repetition/attempt evidence when self-assessment is uncertain or an advanced/high-risk claim needs confirmation.

Answer set:

- Cleanly at the shown target.
- Partial / inconsistent.
- Not yet / not sure.
- Caused symptoms / should not test now.

Target length is roughly 3–6 minutes for a beginner and 6–10 minutes for an experienced multi-goal athlete. The flow is optional, resumable, editable and never an exhaustive family audit. Existing users receive targeted reconfirmation, not forced full onboarding.

### 1.2 Progress & Goals replaces manual readiness authority

- Show achieved, current and next milestones by family.
- Explain supporting requirements and why a target is unavailable.
- Distinguish athlete goals/user overrides from app-recommended emphasis.
- Offer “Test this” when evidence is missing or stale.
- Preserve achievement history during temporary restrictions.
- “I already have this skill” starts a short validation route and yields provisional evidence; it never toggles capability directly.

### 1.3 Phase 5 implemented placement boundary

Phase 5 implements a versioned, unmounted vNext assessment flow and presentation model. New placement asks current restrictions, experience/inactivity, one-to-three goals, equipment and inversion familiarity where relevant; it then uses three common anchors (support, pike access and foundation push) plus short goal ladders. A beginner starts at the first anchor. An experienced athlete starts near the middle; a clean answer moves up, a partial/not-yet/not-sure answer brackets or stops the branch, and a symptom stops affected demands. Representative routes are 9 prompts/about 5 minutes for the beginner scenario and 16 prompts/about 9 minutes for an experienced three-goal scenario. Up to four optional guided tests are shown per review.

Existing users with estimated, developing, stale or contradicted findings enter targeted reconfirmation: current safety is checked, then only relevant versioned protocols are offered. Established-but-stale outcomes can be reconfirmed directly without replaying onboarding, while current restrictions, equipment and inversion context still block unsafe tests. Press placement honestly uses existing support, compression and handstand prerequisite anchors because Phase 2 contains no available Press milestone protocol; it never fabricates a Press achievement.

Assessment answers commit as weak `self-assessment` observations with exact protocol/subject provenance, so they can estimate but cannot establish capability or satisfy a safety gate. Guided evidence is created only from the currently recomputed assessment offer and must meet the exact metric, assistance/range, quality and safety contract. The workout review model asks only about meaningful development/maintenance/test items; preparation and recovery are not surveyed, and actual workout facts remain solely in one Session Record. The flow is not imported or mounted by the live v1.2 UI.

## 2. Capability, Confidence and Trainability

Keep three views separate:

1. **Demonstrated capability:** historical milestone achievement.
2. **Current performance confidence:** current, stale or contradicted.
3. **Current trainability:** `allow`, `modify` or `block` for a proposed prescription, with reason and safe alternative.

Trainability uses active restrictions, prerequisites, benchmark freshness for high-risk work, equipment and recent/session load. Choosing Challenge cannot bypass it. See `VNEXT_DATA_MIGRATION.md` for event authority and projection storage.

The canonical milestone lifecycle and projection/replay contract live in [VNEXT_DATA_MIGRATION.md](VNEXT_DATA_MIGRATION.md). This engine consumes that projection; it does not maintain a second capability store. The UI may collapse internal states to **Developing**, **Achieved** and **Recheck recommended**.

### 2.1 Confirmation policies

- **Static strength:** clean position and duration; normally repeated on separated sessions or confirmed in a guided test.
- **Dynamic strength:** clean range, repetitions and control; normally repeated on separated sessions.
- **Balance:** controlled successes/consistency plus required exit competence; one lucky save is insufficient.
- **Transition:** controlled complete sequence, not possession of endpoint skills alone.
- **Mobility/access:** protocol-specific active or passive range as relevant.
- **Safety/readiness:** explicit demonstrated protocol; never inferred from unrelated strength.

Exact targets belong to versioned benchmark protocols. There is no universal “perform once → unlock” or universal two-session rule.

### 2.2 Regression and interruption

| Situation | Capability | Current prescription |
|---|---|---|
| One difficult/failed day | Preserved | Modify dose or use the prior working variation. |
| Repeated valid benchmark failures | History preserved; confidence contradicted | Reconfirm and temporarily work lower. |
| Pain/symptom/instability | Preserved | Immediately block or modify affected demands. |
| Long inactivity | Preserved; high-risk evidence may be stale | Reacclimate or run a targeted validation. |
| Deload/easier day | Unchanged | Reduce volume, leverage, demand or assistance only. |
| New stronger demonstration | Confirm observed node; mechanically necessary predecessors become satisfied-for-eligibility, never falsely demonstrated | Advance only the relevant family. |

### 2.3 Phase 3 implemented policy

The implemented projector keeps lifecycle, confidence and trainability independent. Weak self/migrated claims are Estimated; ordinary meaningful practice is Developing; an adjudicated versioned benchmark is Demonstrated; only the protocol's movement-specific observation/session policy becomes Established. Repeated ordinary clean reviews may establish only when the exact performed prescription itself guarantees the protocol's scalar minimum; otherwise explicit benchmark evidence is required. Eligibility requires Established/current milestone or capacity evidence. A currently confirmed stronger node can satisfy only audited mechanically unavoidable milestone predecessors for eligibility, with proof-only provenance; it cannot infer safety gates, capacities, `anyOf` alternatives or predecessor achievement.

One valid benchmark failure leaves confidence current; repeated separated failures contradict confidence without erasing lifecycle, and full movement-specific reconfirmation restores it. Freshness expires only when that protocol defines a window, strictly after its deadline. Active restrictions block/modify matching demands; clearance preserves capability and requires confirmed post-clearance evidence before overlapping high-demand work fully resumes. A symptom blocks affected demand temporarily and then leaves high-demand reconfirmation. Recent physical exposure is retained as dated ordinal demand, while one hard/not-today review modifies the next matching prescription for a bounded 48 hours; neither acts as a fatigue score or demotes capability. Family outputs identify reason-coded working/reconfirmation nodes, maintenance needs and honest eligible targets; missing content and non-opted specialist nodes are excluded.

## 3. Planning Architecture

### 3.1 Two horizons

1. **Emphasis planner:** from athlete goals, recommend a primary, optional compatible secondary and low-dose maintenance allocation. Hold it for a meaningful sample; review after roughly 8–12 eligible sessions, a milestone, plateau, restriction or goal change—not a rigid calendar block.
2. **Session composer:** build today's plan from that allocation, working nodes, trainability, equipment, chosen demand and recent load.

Primary work receives the most frequent high-quality exposures; secondary work receives fewer compatible exposures; established non-priorities receive maintenance. Restrictions may temporarily substitute work but never erase goals. Advanced athletes should not develop maximal Planche, HSPU, Press and Handstand intensity simultaneously.

### 3.2 Session-generation pipeline

1. Resolve goals/user override and today's demand.
2. Select one primary family and only compatible secondary/maintenance exposure.
3. Resolve current working nodes from graph plus observations.
4. Filter by prerequisites, trainability, equipment, evidence freshness and specialist opt-in.
5. Allocate the approximately 25-minute budget, targeting exact 25 when safe relevant content exists.
6. Select milestone practice, capacity work and accessories with explicit purposes.
7. Apply recent-load and compatibility rules.
8. Sequence technical balance/entry while fresh, then primary strength, support work and reset.
9. Validate timing, references, regressions, demand caps and intentional repeats.
10. Store reason codes and definition/policy versions in the Session Plan.

### 3.3 Session demand replaces overall L1/L2/L3 ability

- **Technique / Easier:** more assistance, lower leverage/volume, generous rest and quality practice.
- **Standard:** normal recommended development dose.
- **Challenge:** harder safe dose around the same eligible nodes; never bypasses prerequisites or restrictions.

L1/L2/L3 survive only as migration inputs/preferences. Do not show or drive plans with a global athlete level; show independent family progress or “mixed skill profile.”

### 3.4 Phase 6 implemented planning boundary

Phase 6 implements generator policy `vnext-goal-directed-generator@1` as a pure, unmounted vNext engine. Its complete deterministic input is the planning time, exact versioned definition bundle, Athlete Intent, current Derived Athlete State, Phase 3 policy, today's session demand, seed and optional app-owned previous-emphasis record. Recommendation continuity is deliberately not stored in Athlete Intent. The planner rejects a stale/mismatched projection or incomplete definition-state identity before composing.

The emphasis planner resolves user override and goal priority, then prefers reconfirmation, an honest working/eligible frontier, or recursively actionable prerequisites. The recursive resolver follows cross-graph milestones and benchmark subjects, returns the actual nested capacity requirements, processes every `allOf`, and chooses one deterministic actionable `anyOf` route rather than scheduling every alternative. A Press goal with no current Press content therefore trains its first safe Handstand-exit/capacity frontiers while retaining an explicit content gap; it never receives a fabricated Press item. Recent matching high load can defer a goal, explicit Planche/HSPU/Press high-load pairs cannot become secondary focuses, and only a compatible due milestone becomes maintenance. Previous primary emphasis can persist for fewer than eight eligible sessions unless a restriction or recent high exposure makes another requested family safer; review is event/session based, not calendar periodisation.

The composer selects only an exact milestone-protocol exercise, an exercise explicitly linked to that node, an exact capacity protocol or a safe alternative independently re-evaluated by Phase 3. Safe alternatives lose the blocked target/test claim. Broad graph links without a node never authorise high-demand skill work. Supporting capacity order is semantic: direct nested requirement, current-target requirement, nearest successor requirement, then a documented shared-family fallback; the deterministic seed breaks only genuine ties. Shared-family fallback is disabled when a missing-content destination has no unmet canonical prerequisite, so a fully prepared athlete receives an honest no-plan/content-gap result instead of filler. Technical/safety work precedes fatiguing strength. One major high upper-limb prescription is permitted, and missing Phase 7 nodes generate coverage reasons rather than content.

Technique, Standard and Challenge retain the same evidence-defined frontier. Technique prefers an authored assisted/regressed variant and quality time; Standard uses the normal dose; Challenge adds dose only to already-eligible work. The authored conservative demand tag is never silently lowered. The composer trades preparation, technical, primary, support, optional secondary, maintenance and reset inside 1,500 seconds. Secondary/maintenance remains 120–240 seconds; when insufficient relevant content exists, the result is explicitly shorter rather than padded. Every item carries request-scoped trainability and internal skill/exercise/intensity reasons, while the immutable Session Plan stores plain rationale plus exact definition/policy references. Its ID is derived from the complete semantic plan material so two divergent immutable plans cannot collide merely because their visible exercise list matches.

The base API never appends a 30-minute Lab automatically. A later isolated surface may request the already approved Lab purposes—guided testing, a compatible extra skill dose or explicitly opted-in specialist practice—but must run the same eligibility, load and boundary checks.

The focused implementation also corrected one Phase 3 predicate exposed by composition: dense demand profiles include `low` for negligible exposure, so only moderate/high demand overlaps an active restriction. This matches Phase 5 test gating and permits genuinely unrelated low-load preparation/recovery without weakening any material restriction. The planner is exported only from `app/vnext`; the production v1.2 generator, assessment, profiles, persistence and feature authority do not import or consume it.

## 4. Prescription Demand and Compatibility

Assign low/moderate/high ordinal demand per **prescription**, because assistance, range, duration and volume matter. Do not use pseudo-precise fatigue points.

Seven domains:

1. hand/wrist bearing;
2. forward straight-arm upper-limb load;
3. overhead straight-arm upper-limb load;
4. horizontal bent-arm push;
5. vertical bent-arm push;
6. inversion/technical exposure;
7. compression/trunk.

Rules:

- one primary high upper-limb strength demand per normal session;
- high-skill inversion before fatiguing pushing;
- do not pair high Planche and high HSPU/Press simply because both are unlocked;
- maintenance is low dose;
- active symptoms block affected demand tags;
- wrist/hand, elbow and shoulder restrictions can independently block prescriptions;
- recent high exposure selects a compatible family, lower demand or recovery work;
- audit v1.2 `fatigueCost`/`loadTags`; do not trust or reuse them automatically.

## 5. Duration Contract

The product contract is approximately 25 minutes, with exact 25 as the target whenever safe, goal-relevant content exists. Example exact allocation:

- 3 minutes targeted preparation/readiness;
- 5 minutes technical practice;
- 7 minutes primary development;
- 7 minutes supporting strength/capacity;
- 2 minutes maintenance;
- 1 minute reset/cooldown.

Working ranges—technical 4–6, primary 6–8, support 6–8, secondary/maintenance 2–4 and reset 1–2 minutes—trade against one hard budget; they are not independently additive. Blocks may merge/disappear and rest belongs inside the relevant block.

A shorter explicit safety/restriction exception is allowed only when no safe, relevant substitution or recovery/reset work exists. Never add filler to hit the clock. Planche gets fewer high-quality attempts and more rest; Handstand gets more fresh technical time; HSPU gets more strength time.

The optional 30-minute Lab may provide guided testing, an additional compatible skill dose or explicitly opted-in specialist practice; it is never a random harder add-on.

## 6. User Surfaces

| Surface | Responsibility | Must stay hidden/simple |
|---|---|---|
| **Home / Today** | One workout, duration, primary purpose, “why today,” demand control, contextual restriction prompt and safe customisation. | Graph mechanics. |
| **Progress & Goals** | Family achieved/current/next/maintenance, goals/user override/app recommendation, plain-language blockers and test/reconfirm. | Global level or capacity-score wall. |
| **Skill detail** | Small outcome graph, history, current estimate, target, benchmark and related support; specialist destinations opt-in. | Every exercise. |
| **Assessment** | Visual adaptive flow with back/resume/edit and optional guided placement. | Exhaustive testing. |
| **Workout completion** | Ask only about meaningfully performed development/tests: clean / partial / not today, difficulty and symptom/instability where relevant. | Warm-up/recovery survey. |
| **Contextual readiness** | Surface restrictions and test needs at the decision point. | Separate capability checklist. |

### 6.1 Phase 8 implemented presentation boundary

Phase 8 implements a pure athlete-facing presentation layer plus an isolated namespaced React surface. The selectors accept only approved vNext definitions, Derived Athlete State, Athlete Intent, generated-session output, current assessment offers and active restrictions; the surface renders those models and emits commands without reading or writing authority itself.

`Progress & Goals` always shows Planche, L-Sit/V-Sit, Handstand, HSPU, Press, Pushing and Transitions as independent families. Each summary/detail identifies the current demonstrated or provisional starting point, confidence/current availability where useful, one relevant next target, plain `allOf`/`anyOf` prerequisites, recommended focus and a targeted test or reconfirmation route. Only Demonstrated/Established findings appear as achievements; stronger-node `satisfiedForEligibilityBy` implications can satisfy a prerequisite but never create a displayed achievement. Estimated/Developing findings remain provisional. When immutable source observations are supplied, a read-only provenance index distinguishes an imported starting point from a placement estimate; absent provenance falls back to neutral provisional wording and never guesses from IDs.

Availability is presented separately from achievement. Exact target prescription trainability takes precedence, a valid safer variation appears as “available with changes,” and only moderate/high family demand overlap makes a restriction material. Restriction copy explicitly preserves previously demonstrated history while explaining what is adjusted or paused today. Stale or contradicted evidence routes to reconfirmation rather than removing the outcome.

Goal controls permit one primary and up to two secondary families plus an optional temporary emphasis. Their update helper changes Athlete Intent only and validates current graph IDs, uniqueness, exact primary count and emphasis membership; it cannot write evidence or alter trainability. Assessment entries provide initial/targeted reassessment, exact guided-test offers and reconfirmation. A skill-detail action must match kind, family and an offered protocol before it can open; there is no “I have this” control.

Today translates the planner into a simple primary focus and reason, compatible secondary/maintenance purposes, duration, plan blocks and human-readable exercise/intensity explanations. Technique, Standard and Challenge remain daily workload choices around the same safe frontier. Internal scores, raw reason codes, graph IDs and algorithm trace are intentionally absent.

Workout completion prompts only meaningful development, maintenance or guided-test items. The presentation captures completed/modified/skipped, optional difficulty and symptom/instability feedback; its mapper returns only validated per-item outcome inputs. It does not construct or persist a Session Record, create evidence or duplicate timer-owned preparation/recovery facts. The coherent vNext completion path must later combine those inputs with timer facts and create exactly one immutable Session Record.

### 6.2 Phase 9 integrated release-candidate runtime

Phase 9 mounts the Phase 8 surface through mutually exclusive build-time application graphs. The ordinary artifact imports only v1.2. The separate RC artifact imports only vNext and stays inert unless the exact RC identity, `/parallettes/vnext-rc/` base and request agree; it never falls through to legacy hooks. Its request query is artifact routing, not cohort access control. Staging therefore uses an access-controlled isolated origin, or proves the updated parent-v1 worker exclusion active before exposing a nested same-origin RC, plus the separate `vnext-rc1` cache lane.

The isolated coordinator bootstraps Athlete Intent, reads the shadow observation store, reuses only an exact Derived Athlete State cache match, otherwise projects from complete definition history with the current policy and all planner trainability requests, then runs the catalogue-v2 planner and builds the complete Today, Progress & Goals, skill-detail, assessment, restriction, completion and provenance presentation set. Cache persistence is optional acceleration: if its write fails while sources remain unchanged, the freshly rebuilt state remains valid. Goal changes persist only as Athlete Intent. Easier / Technique, Standard and Challenge are daily plan inputs and never change demonstrated ability or bypass the safe frontier.

The same branch owns adaptive assessment creation, device-local draft resume/back, provisional commit and state-validated guided tests. A guided test displays and retains its exact protocol target, conditions, quality/safety criteria, observation identity and result until commit succeeds. Workout start durably binds the exact generated plan; measured timer facts survive reload and remain bound through review. Short, changed or symptom-affected work cannot be recorded as clean, and symptoms require an affected area. Completion prepares one immutable retry-safe plan/Session Record pair, persists that retry boundary before append, and rebuilds the next recommendation. The initial record ID is one-to-one with its plan, only one unsuperseded record is permitted, and any correction must extend its sole linear chain. Rapid submission or retry therefore cannot create duplicate session truth.

Targeted no-symptom reassessment may append a clearance only for an explicit restriction report that existed when the safety answer was made. It never deletes the report or clears session/performance symptom provenance. Concurrent valid device clearances remain distinct immutable observations and deterministically use the earliest valid clearance for the one-way state transition, so later redundancy cannot discard valid post-clearance reconfirmation evidence.

Workout start is blocked when any production-reachable movement lacks its owned, technically reviewed media; the RC does not silently substitute another guide. The integrated branch does not call the legacy generator, legacy assessment or last-write-wins profile blob as training authority, and ordinary v1.2 users remain on the unchanged v1.2 authority path. Phase 9 required no architecture redesign; the concurrent-clearance fold is a conflict-resolution clarification required by the existing append-only/multi-device contracts. Phase 10 results are recorded below.

### 6.3 Phase 10 comprehensive engine and UX validation

Twelve complete runtime journeys follow Assessment → projection → recommendation → workout → one Session Record → new projection → next recommendation. They cover a completely new beginner, uncertain beginner, mixed athlete, advanced and confirmed-advanced athletes, stronger-gated state, stale evidence, long inactivity, equipment limitation, difficult feedback, symptom feedback and migrated v1.2 evidence. Separate assertions cover goal/demand changes, restriction clearance, specialist opt-in/non-opt-in, migration retry, offline replay, concurrent devices, reset plus stale reconnect and rollback.

Technique, Standard and Challenge preserve the same evidence-defined frontier; Challenge changes only an already-available dose. Prerequisites, exact `allOf`/`anyOf` semantics, equipment, restrictions, recent exposure, stronger/specialist boundaries and one-major-high-demand compatibility remain fail-closed. A Phase 10 correction makes an explicitly selected missing-content destination remain visible as a coverage gap even when the planner safely promotes a trainable prerequisite family. No graph, evidence, readiness or planner architecture changed.

Manual desktop and 390×844 phone review confirmed that Today explains its focus in plain language, Progress & Goals shows seven independent current/next paths without scores or a global level, provisional placement differs from achievement, restrictions preserve achievement history, goals cannot unlock skills, and a retained workout is explicitly resumable. The phone layout has no horizontal overflow or sub-44-pixel interactive target. Static accessibility checks cover landmarks, labels/fieldsets, keyboard focus, contrast, reduced motion and safe-area/responsive contracts. Detailed persistence and owned-media results remain canonical in their specialist documents.

## 7. Feature-Isolation Rule

Until the explicitly approved Phase 11 cutover, every cohort must use one coherent authority/read/write path:

- v1.2-visible flows retain legacy-compatible writes and recommendations;
- isolated vNext flows capture observations and consume vNext projections;
- any dual-write adapter has one authority per fact, is nonduplicative and idempotent;
- never capture vNext-only evidence while showing a recommendation path that cannot consume it.
