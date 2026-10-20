# Parallette25 vNext Assessment and Training Engine

[Back to the project map](../MASTER_PLAN.md)

**Status:** APPROVED FOUNDATION — PHASE 11 COMPLETE; ENGINE/UX ARCHITECTURE FROZEN

**Implementation authority:** MASTER_PLAN.md owns the current owner-approved task and implementation state.

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

### 1.4 Experienced starting-point placement — 2026-10-19

The owner approved a shorter visual questionnaire, relevant confirmation checks and first-workout selection. New production assessments use placement policy 2: current comfort/restrictions, experience, training recency, main/supporting goals, equipment and relevant inversion context, then one familiar variation per goal. Every selection shows its existing owned animation, exact target, assistance/range and instructions. “Not sure” and starting from basics remain valid; answers alone are weak estimates. Existing policy-1 drafts retain their original route. Progress offers an explicit “Review my current starting point” entry for existing users.

The review orders the selected goals’ required checks before their targets, displays at most four relevant offers, and refreshes after every saved result. A bounded measured-entry rule applies only to ten existing ordinary variations: floor/controlled-parallette/tempo pushing; tuck/controlled-extension/one-leg/full L-sit; grounded lean/toe-light/foot-assisted tuck Planche. Current measured readiness and an exact measured demonstration allow practice of that variation without fabricating predecessor achievements or making harder targets eligible. This is a product/programming policy using the existing authored benchmark thresholds, not a new validated scientific placement scale. Ordinary repeated confirmation remains separate; advanced/inverted/specialist checks retain their full prerequisite, exit, familiarity and opt-in gates. Restrictions, equipment, symptoms, recency, inactivity and current load remain authoritative.

The existing recovery rule excludes recently tested high-demand exercises for 48 hours. Checks therefore count as the first session’s demanding work: the saved review lists actual results and retained starting practice, offers **Finish for today**, and labels any subsequent same-day workout **Optional practice after checks**. The first recovered workout can use the checked ordinary variation; it need not restart an established user at the beginning of the ladder. No extra same-day hard dose or synthetic workout record is introduced. A guided exercise is offered at most once per UTC day; saved observations on that day share one confirmation occasion. Further confirmations must be genuine later practice/checks. Back/reload retains uncommitted choices, changing an earlier choice invalidates dependent answers, and workflow transitions return focus/scroll to the visible heading. Animations, sets/reps and rest stay visible.

### 1.5 Shorter setup and guided checks — 2026-10-19

The approved usability correction keeps placement policy 2 and all §1.4 rules. One compact context form reuses saved goals/equipment and explicitly asks current comfort, experience, recency and relevant inversion familiarity. Continue validates and saves the native answer sequence in one atomic draft write; Back uses the same native revisit/invalidation behavior. Incomplete on-screen edits are not saved until Continue. Each animated familiar-skill choice has direct clean/not-sure actions. Supporting-goal selection can be deferred without removing goals or creating skill evidence.

Review presents one useful next check; optional alternatives and deeper detail are expandable. Guided checks keep the exact target, animation, conditions, quality and safety visible. A quick result explicitly attests the exact displayed reps/seconds and all displayed criteria; different results take actual numbers and an outcome, while attempt-based checks always require both counts. No default measurement, automatic pass or timer-owned performance evidence is created. The optional continuous-hold helper gives three preparation seconds, stops on background/interruption, never accumulates interrupted holds and never saves a result. Exact valid pending retries stay bound to the original prepared observation. Malformed attempt counts left by an older form can be reviewed explicitly: the user corrects original counts or selects No attempt made, without repeating a physical check. Saving preserves the original check identity/time and does not bypass eligibility, quality/safety or immutable-event validation.

A clean saved readiness check can open the next instructions directly, with a visible saved/rest cue. Back returns to the saved-result review, which prioritises Finish for today and retained starting practice. No forced next timer or extra same-day workout is started. Native policy-1 drafts retain the older route; definitions, media, projection policy 9, raw events and storage schemas do not change.

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

### 6.0 App-wide simplicity standard — owner approved 2026-10-19

The owner reports that the deployed placement flow works but takes too long to fill in and is not straightforward. The owner explicitly approved applying the resulting simplicity principles to **every feature and function**, including setup, checks, Today, Custom, the player, completion, Progress, History and account/sync tools. This is a standing design requirement for future scoped changes; existing behavior is not assumed to meet it merely because technical checks pass.

- **Keep the user moving:** ask only for information that changes the next useful action. Reuse saved goals, equipment, preferences and valid evidence; keep them easy to edit. Current symptoms/restrictions, training recency and other time-sensitive safety context still require appropriate explicit confirmation.
- **Make the next action obvious:** one clear primary action per step, short everyday wording and a concise result. Avoid repeated review/Save/Continue screens and sending the user back to choose the next obvious step.
- **Prefer recognition to form-filling:** use animated choices, direct actions and simple controls where they reduce effort. Capture timer-owned facts automatically when reliable. Never invent performance, pre-confirm safety/quality or treat a self-declared skill as measured evidence to save taps.
- **Reveal detail when it helps:** show relevant follow-ups only; keep optional notes, effort entry and deeper explanations expandable. Required safety conditions, stop guidance and information needed for an informed choice must remain accessible at the decision point.
- **Keep training essentials visible:** preserve owned animations, the target, practical instructions, sets/reps, rest and current timer. Optional explanations should not push these essentials out of reach. Check phone portrait/landscape, readable text, reachable controls and a sensible scroll/focus position.
- **Preserve the user's effort:** retain answers, choices and appropriate navigation context; make Back, resume and retries predictable. Save once, distinguish local save from sync honestly, and make errors actionable without requiring the user to repeat completed work.
- **Finish clearly:** state what was saved, what it means and the next useful action. Supporting-goal checks and other nonessential work may be deferred while all prerequisites for the chosen work remain enforced. Demanding checks retain their training-load meaning.

Review each affected journey for avoidable taps, typing, scrolling, repeated information and unclear next steps, alongside correctness and safety. For the proposed shorter setup, under a minute answering ordinary questions is a design target to validate, not a promise about physical check time or a reason to skip necessary checks. Start with the questionnaire/check friction already reported; changes to other features require their own approved scope. The precise measured-entry, evidence, recovery and advanced-skill rules in §1.4 remain authoritative.

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

### 6.4 Phase 11 pre-close workout UX contract

The complete Session Plan is visible before start: sequence, exact owned motion guide, exercise, prescription, set structure, block time and planned rest. Phase 6's 6–8-minute primary/supporting values remain block budgets, not continuous work prescriptions; a deterministic execution view expands each budget into roughly three-to-four quality sets with the remaining budget as recovery (short technical drills retain denser practice cycles). Every expanded sequence totals exactly `plannedSeconds`.

Normal execution is timer-driven from work to rest to the next set or exercise. Pause, previous/skip interval, finish early and an upcoming-movement change remain available. Safe changes expose authored Easier, Similar and Harder options only after exact trainability, prerequisites, restriction, equipment, specialist, recent-load, whole-session high-load and owned-media checks. The selected performed identity is retained with the immutable Session Record; a change never rewrites the generated plan or creates duplicate session truth.

Completion requests feedback only for development, maintenance or guided-test work with at least half of its first work interval actually measured. Unreached/skipped work and timer-owned preparation/recovery receive no rating prompt. Brief partial work remains an exact modified timer outcome without a progression rating; a fully abandoned session shows a zero-question summary and can still save one authoritative Session Record.

Custom Session is a secondary 5/10/15/20-minute route with general, core/body-line, compression-only and seven skill-family focuses plus equipment and daily demand. The complete Today workout remains 25 minutes. Custom first runs the approved planner. Skill/general sessions retain the highest-priority safe development work; capacity focuses retain only already-trainable linked capacity movements (with preparation/reset), fail closed when none exists, and never invoke the legacy generator. Five minutes uses one development movement, 10/15 use up to two and 20 uses up to three distinct movements, preventing a longer choice from becoming one unnaturally stretched drill. The user's one-off choice does not persist a new goal or bypass capability, prerequisites, restrictions, specialist opt-in or load compatibility.

An unstarted Today or Custom plan is a **preview**, not an interrupted workout and not evidence. Cancelling an unstarted Custom preview removes only that advisory plan and immediately restores the normal Today recommendation. The recovery lock begins only when the athlete starts the timer; after that, the exact timer draft offers Resume, End and review completed work, or explicit discard. This prevents Custom cancellation from trapping Today while preserving genuine offline recovery.

The owner-requested Custom preview correction reuses the full animated plan surface before entering the timer player: every block shows its owned guide, prescription, sets/rest and available safe swaps. Pre-start swaps are retained with the advisory preview across reload and passed to its native player; only an offered native-catalogue alternative can be selected. Preview cancellation creates no Session Record. Historical plans retain exercise-by-exercise execution; the separately approved new-plan structure is defined in Section 6.6.

The parity surface also keeps practical non-authority features from v1.2: a branded athlete shell, an at-a-glance session timeline, timer sound cues, total-session progress, the next exact motion shown during rest, phone-sticky workout controls and Recent Sessions. History is projected from immutable Session Records and matched Session Plans; migrated v1.2 entries remain labelled and retain their sparse-evidence limitations. None of these affordances changes planning, evidence or Session Record authority.

### 6.5 Approved post-release interaction corrections — 2026-10-17

Workout completion is presented before the plan preview, with programmatic heading focus and scrolling when review first opens or is recovered. Answering a prompt preserves input focus; performed-only questions, symptom validation, immutable save/retry and recommendation rebuilding keep their existing authority.

Short landscape viewports use the compact player layout with the guide beside readable coaching and timer/controls. Portrait retains coaching below the guide. Safe-area spacing, minimum touch targets, full safety text and enlarged-text scrolling remain. Exact release evidence is in the production runbook Section 13. No training-content, timer-policy or persistence contract changed.

### 6.6 Owner-approved mixed workout structure — 2026-10-17

New production plans use `vnext-mixed-workout-generator@1`; capacity-focused Custom plans use `vnext-mixed-capacity-workout-generator@1`. The frozen generator and native catalogue/projection v8 stay intact. The adapter preserves every selected development/technical prescription and budget. Preparation distributes existing complete work/rest cycles between the original movement and another independently trainable, owned, low-load allowlisted movement; 180 seconds becomes 120 + 60, 120 becomes 60 + 60, and a single 60-second cycle stays intact. This preserves both work and recovery totals. Reset budgets of at least 60 seconds can flow through two low-load movements without adding time.

Execution derives from immutable ordered items, purpose, native definitions and validated selections; it never relies on advisory explanations or positional rationale. Technique/safety, inversion, outcome milestones, guided tests, high upper-limb demand and the first non-technical primary requirement retain focused sets. Later contiguous capacity accessories may alternate complete work/rest cycles when loaded upper-limb domains do not overlap. Capacity-only Custom work can rotate from its first compatible accessory. Shared moderate trunk demand is allowed; loaded wrist/shoulder overlap, high demand or technical work prevents rotation. Ineligible pairs remain focused. A shorter Custom plan may have too few compatible movements to rotate.

Group boundaries are fixed from the native plan. A safe future swap can disable rotation within its group but cannot merge backward or move the current cursor. Once any group starts, its members cannot be swapped, including after rewind/reload; untouched future groups remain changeable. The new player uses a version-3 local draft with durable group locks. Every original interval appears once, set/rest order and per-item budgets are exact, and completion requires the final occurrence plus sufficient measured work. Skip/previous/early finish cannot manufacture participation or complete an unreached later round. Completion still uses performed-only review and one immutable Session Record. The unchanged emphasis planner retains its existing continuity sample.

The old runner, timing helper and plan objects remain intact. Saved workouts route by their native generator policy, including recovered completion. No Session Plan/Record field, schema, Worker, catalogue, protocol, readiness gate or background timer policy changes. Deployment status and exact artifact evidence belong in the release runbook.

## 7. Feature-Isolation Rule

Until the explicitly approved Phase 11 cutover, every cohort must use one coherent authority/read/write path:

- v1.2-visible flows retain legacy-compatible writes and recommendations;
- isolated vNext flows capture observations and consume vNext projections;
- any dual-write adapter has one authority per fact, is nonduplicative and idempotent;
- never capture vNext-only evidence while showing a recommendation path that cannot consume it.


### 6.7 Foreground timer and interruption policy — 2026-10-18

The owner authorised timer/background reliability and deployment after checks. During visible running work, elapsed monotonic time drives whole-second countdown and participation, retaining fractional time between timer samples. Each interval caps credited time at its own boundary; a delayed callback cannot consume the next interval. A callback gap of five seconds or more, or a two-second discrepancy between monotonic and wall clocks, pauses conservatively without crediting that uncertain gap. Wall time is a suspension cross-check, not evidence of work performed.

Leaving the page, locking the screen or a page-hide event pauses immediately and synchronously saves the latest measured local draft. Return and reload remain paused until explicit Resume. A short status explains an automatic pause. The app requests screen wake lock only while visible and running; denial, low-power release or lack of support never blocks timing or recovery. Late lock grants are released after pause/unmount. This is foreground training with explicit interruption recovery, not a promise of background execution or audio.

The shared reliability layer serves mixed plans and native exercise-by-exercise production recovery. The exact historical runner remains frozen for its accepted media/source evidence. Definitions, prescription/rest budgets, plan identities, mixed group locks, measured-only feedback and one-record completion remain unchanged. Pause reason is optional advisory draft UI state only; no Session Plan/Record field or Worker/schema change is introduced. On 2026-10-18 the owner accepted all four iPhone checks: app switching, work/rest screen lock, visible screen-awake behavior and Save & close/reopen/resume/completion with exactly one History entry. Separate Safari/Home Screen parity, audio, enlarged text and offline behavior are not inferred from that acceptance.


### 6.8 Goal skill roadmap — delivered, 2026-10-18

The owner requested a tree in Progress showing current position and the skills/supporting progress toward primary and secondary goals. The read-only presentation uses the exact active definition bundle and existing athlete projection. It shows one primary and up to two secondary goal maps from Athlete Intent, independently of today's generated emphasis, plus exploration of all seven families.

All 103 current milestones remain inspectable. Connections are derived from actual prerequisite rules; required links and alternative routes stay distinct. Each family has several branches and destinations, not an invented universal mastery level or completion percentage. Current-work and next-focus markers can coexist across branches. Confirmed, Demonstrated, Developing, estimated and unknown states remain distinct; current higher evidence can cover a prerequisite without awarding the earlier skill. Historical achievements survive restrictions and stale confidence. Covered predecessors are omitted from presentation Current/Next candidates, including fallback; projection, eligibility and generated work are unchanged.

Tapping a milestone opens its definition, exact required/all-alternative supporting skills, existing benchmark target, apparatus/assistance/range, confirmation, quality and safety. Cross-family requirements link to the relevant map and Back restores the initiating milestone. Capacity requirements expose their existing facet benchmark targets without adding scores. Optional specialist branches are collapsed by default and separately labelled; exploration never changes specialist opt-in, evidence, goal choices or workout availability. Viewing and confirming a goal do not award a skill.

Phone layout uses wrapping node cards and visible connections with textual requirement equivalents, native buttons/select/disclosures, 44px controls and keyboard focus. Tests cover all current nodes/edges, goal-vs-emphasis identity, lifecycle/coverage/recheck, restrictions, capacity confirmation, alternative routes, historical gaps and input immutability. Type checking, existing Phase 8/UI checks and production build/distribution validation pass. Local browser checks cover goal persistence, prerequisite navigation/back, expandable capacity targets, specialist exploration and small portrait/landscape widths. On 2026-10-18 the owner accepted the local roadmap and explicitly authorised final checks and deployment once they pass. Controlled workflow 39112930139 delivered the exact roadmap and live checks pass; runbook §18 owns release/data-preservation evidence. On 2026-10-18 the owner reports all three requested checks pass on iPhone 17 and approves PR #28 integration, completing this acceptance checkpoint.

### 6.9 Setup and goal usability — 2026-10-18

The owner approved explicit setup resume/Back, consistent goal priority, goal editing above the roadmap and simpler wording. A new local profile still starts setup; an existing unfinished setup stays on Today after reopening until Resume setup is selected. Finish later retains confirmed answers, with copy explaining that Continue saves the current answer. Back restores the previous confirmed value for editing. Confirming it unchanged preserves compatible later choices; changing it discards later cached answers. Start over requires an explicit confirmation and affects only the unfinished setup. Updating comfort/restrictions from a paused setup explicitly starts the existing targeted reconfirmation path, retaining its safety-clearing semantics.

New/reconfirmed goal answers use one Main goal and up to two Supporting goals, matching Progress. Both surfaces offer the same seven existing families. Transitions uses only the existing common anchors and does not imply transition capability or add an inversion/transition assessment. Existing targets, separate interests and a valid temporary training focus are retained. Old unmarked drafts keep their original primary/secondary/interest interpretation on retry until the user edits their goals; their review names the saved interest explicitly.

Progress puts the saved goal summary and Edit goals before the roadmap. Cancel discards form edits; a successful save stays on Progress and confirms that future workouts use the priorities. Closing through Save or Cancel brings the saved goal summary back into view. Save failures remain visible and keep the editor open. Optional training focus remains separate from saved main/supporting priority. Editing goals also reconciles any paused setup so an older goal answer cannot overwrite the newer saved choice. Local compatibility and failure ordering belong in Data & Migration §5.11.

No progression, readiness, safety, generator, timing, observation schema or approved motion asset changes are included. Setup/goal styling is isolated from the fingerprinted workout player styles. Focused tests cover Back/reload/rerouting, new and legacy priority mapping, explicit interest promotion, paused-draft reconciliation, partial-write recovery and exact old assessment commit retry. The release and physical-device acceptance record belongs in runbook §19.


### 6.10 Today and Custom-session simplification — 2026-10-18

The owner approved a compact Today/Custom presentation and plain-language cleanup, with deployment after checks. Today keeps the exact planned focus and duration, places Start/Resume before the phase summary, and reduces the repeated introduction and saved-setup messaging. One compact saved-setup notice retains Resume and confirmed Start over; it is also available when Today cannot offer a workout. Existing recovery, review, failure/retry and restriction controls remain visible and retain their behavior.

The timeline groups only adjacent displayed items into Warm-up, Skill practice, Main work, Support, Practice and Cool-down summaries, preserving order and summed time. Every exercise retains its exact owned animation, prescription, sets/reps, rest, safe substitutions and alternating-set label in the open preview. Only explanatory rationale moves into native “Why this workout?” and “Why this exercise?” disclosures. No training or timing policy is changed.

Custom keeps the existing 5/10/15/20-minute choices and defaults, with time and focus first. Equipment and effort remain editable in a disclosure whose closed summary shows the active choices. Zero equipment still disables preview and explains how to proceed. Opening the builder focuses its heading and brings the form into view. Preview creation, cancellation, swaps and reload recovery preserve their existing non-evidence semantics. User-facing preparation, recovery, backup/sync and History wording removes internal implementation terminology without changing operations. Detailed History and bottom navigation remain outside this task.

The account/data-tools banner adds the device’s top safe-area inset to its normal spacing so Home Screen status chrome cannot cover those controls.

Styles are isolated in `todaySimplicity.css`; the fingerprinted player, media and Phase 8/9 styles remain unchanged. Release checks and physical-device acceptance belong in release runbook §20.


### 6.11 Workout summary, History and save/sync clarity — 2026-10-18

The owner approved this presentation update and controlled deployment after checks. Successful completion and exact prepared retry show a focused “Workout saved” summary of the saved record, movements reached, recorded activity and the refreshed next-workout focus. Done returns to Today; View in History opens that record. The summary is ephemeral UI state and makes no achievement claim. It appears only after persistence succeeds; a retained review/prepared retry remains distinct from a saved History entry.

History lists correction-chain leaves newest first, twelve at a time with Load older workouts. Expandable entries resolve the plan’s native catalogue and exact exercise/prescription versions through all retained readers. Original sets/reps/rest are explicitly Planned; recorded performed identities, activity, outcomes and feedback are separate. Native recorded activity excludes rest/pauses and does not imply counted completed sets or reps. Sparse imported workouts retain their original session-total duration when known and label per-exercise timing/prescription as unavailable; converter uncertainty is not presented as a reported modification. The reader does not change observations, plans, projection or training eligibility.

Account identity no longer claims sync success. Device-local save, syncing, offline/waiting, confirmed sync and actionable sync error have separate messages. Confirmation is transient and requires successful delta exchange plus stable refreshed source identity and an empty upload queue; changed sources invalidate it. Existing automatic reconnect/focus/visibility/periodic retries remain. Save, prepared-retry and migration-opening copy uses plain language. No schema, Worker/API, account-security, timing or media change is included.

### 6.12 Phone navigation and remembered choices — 2026-10-19

Today, Progress and History use a fixed, safe-area-aware bottom navigation on phone portrait and landscape. Desktop keeps the top navigation. Each section is mounted on its first visit and retained while browsing, preserving its scroll position, open explanations, roadmap family/milestone/trail, goal draft, loaded History page count and expanded records. Returning to Today retains saved-summary details without refocusing the summary. Hidden Today guides are unmounted; all visible Today/Custom guides, sets/reps and rest remain present. The full-screen workout player has no browsing navigation.

Section memory lasts within the current browsing mount; reload and leaving for a full-screen workflow do not create a persistent navigation checkpoint. Existing workout recovery remains authoritative. Short-workout duration and focus are remembered separately on this device for the current athlete and environment, including explicit changes made before closing the builder. Current profile equipment and effort defaults remain visible and editable. Every preview uses current availability, restrictions and eligibility to build a fresh plan; convenience preferences never restore an obsolete plan or supply training evidence. Data & Migration §5.12 defines the local-only storage boundary.

### 6.13 Product-review Batch 1: restriction handling — 2026-10-19, local completion

A positive restriction explicitly submitted in setup is immediately authoritative even when placement remains unfinished. Continue later, reload, Back, changed context and restart cannot remove an accepted report. An unfinished no-symptoms answer is not clearance. A failed restriction append prevents unrestricted planning and remains exactly retryable from the saved draft.

Current projection policy 10 adds exact-version/variant hand-bearing exposure for 27 audited movements (54 standard/regressed variants), including scapular push-ups, quadruped drills and hand-supported compression. Low ordinal load no longer implies no wrist contact. Existing demand ratings, fatigue budgets, definitions and media remain frozen; genuinely hands-off movements remain available. Today, Custom, swaps and guided checks share the restriction rule. Custom explains when no safe session is available instead of silently retaining its form.

Every production Start/Resume checks saved native prescriptions and actual selections against current restrictions, readiness, equipment, targets and load before timing begins. Unstarted previews check every item; active resumes check remaining work, including any rewound item. A changed safety source pauses the player; stale approval, hidden/unmounted players and double taps cannot start it. Unsafe previews require a fresh workout; unsafe active sessions retain their measured facts and can be ended/reviewed. Custom retains its explicit equipment choice while the profile is unchanged; later profile equipment changes can only narrow it.

Every completion review, including zero rated movements, offers **Report pain or a new restriction**. The user chooses movements to avoid and an affected area. Saving reports a current restriction separately from performance; it does not fabricate a completed movement, quality rating or activity time. Existing review answers remain mounted while this form opens. Prepared restriction retries keep their original identity/time and block training until saved. General unfinished-review durability and storage-failure recovery are defined in Data & Migration §5.15.

Focused acceptance: `pnpm validate:vnext-restriction-safety`, existing placement, mixed-workout, navigation, Phase 8/9 and native catalogue/media compatibility checks; type checking and a local production-style build. Isolated browser journeys cover submitted setup → Continue later → restricted Today/Custom; saved Custom reload/Start/Resume; warm-up-only early finish → report restriction → save accurate partial workout; and a second local window submitting a newer restriction → old preview refuses Start at zero elapsed time. Custom unavailable-focus → visible explanation → safe changed-focus retry also passed. Custom error layout has no horizontal overflow at 320/393/852/768 CSS-pixel widths; the phone report form and actions meet 44-pixel touch targets. No production account/data was used.

After an explicitly approved deployment, owner acceptance on iPhone Home Screen: (1) submit a wrist-bearing restriction, Continue later and reopen; Today/Custom/swaps must exclude hand-supported loading; (2) stop during warm-up, report a restriction and save; History must show only performed activity once; (3) reopen a saved safe preview and resume an interrupted session without extra time; (4) verify a saved plan affected by a newly received restriction refuses Start/Resume while preserving completed work; (5) rotate phone/iPad and use the keyboard—the form, error and actions must remain readable/reachable. Also verify that finishing the existing no-symptoms restriction review clears an explicit report while Continue later alone does not; readiness checks still apply afterward. Physical iOS lifecycle, keyboard, audio and cross-device sync were not tested by desktop simulation. The remaining product-review batches are now approved for local implementation followed by one final QA pass; deployment remains unapproved.

### 6.14 Product-review Batch 3: actionable confirmation and feedback dose — local implementation

After recorded practice, Today exposes one relevant measured check from the current plan's goal and prerequisite chain, with its exact target, purpose and appropriate timing. Missing dependencies precede the intended outcome, including the safe exit ladder before an inverted capacity test. A check waiting for recovery stays a specific later action instead of inviting a succession of other tests. An insufficient result explains what to practise and repeat; a qualifying result awaiting separate-occasion confirmation says so. Current equipment, active restrictions (including modify-only restrictions), exact prerequisites, specialist boundaries, known inversion context and recent difficult/high-load work are checked independently before opening a test. The check counts toward subsequent training load.

Progression checks use the existing native guided metric, assistance, range, quality, safety and confirmation rules. They neither infer repetitions/holds/attempts from timer activity nor replace setup, award declaration-based skills or create a duplicate Session Record. Their separate local recovery retains the exact native result; an existing saved event retries idempotently even after the recommendation advances. First append revalidates current safety, matching the existing guided-test behavior: a restriction received from another device after performance but before the first successful append can retain the pending result while preventing that append. The pending-result runner offers a two-step **Discard unsaved result** choice with the consequence stated explicitly; Keep result retains exact retry. Confirmed discard removes only local pending recovery, allowing the user to leave the locked workflow and update restriction feedback. Already saved observations are never deleted, and failed removal keeps the pending result visible and retryable. This does not weaken current safety or authorise training through a restriction.

New Today/Custom plans select mixed generator version 2; historical generator version 1 and all frozen definitions remain unchanged. A development block marked for modification removes whole sets and their associated rest (four to three, three to two, two to one), retaining the authored per-set target and rest. The removed workload is not replaced; the shorter duration is explicit. This is a conservative programming rule, not a validated fatigue score. A block already at one short set explains that minimum dose without falsely claiming a reduction. Exact guided standards and gentle preparation/recovery are not silently rewritten. Plan identity, duration, reasons and execution timeline describe the actual new prescription.

Focused acceptance in `scripts/validate-vnext-progress-feedback.mjs` covers ten ordinary workouts each for beginner Pushing, L-sit and Handstand without fabricated benchmark evidence, a relevant exact check and native confirmation/next action, insufficient-result guidance, active-restriction masking, exact retries and unchanged setup. Hard feedback changes the next Knee Push-Up prescription from four to three sets with the same 6–12 repetitions and 80-second rest; Today and 5/10/15/20-minute Custom timelines match their saved plans, while native version-1 generation remains byte-identical. Final integrated QA and iPhone Home Screen acceptance remain required before release.

### 6.15 Product-review Batch 4: coherent movement guidance and optional sound — local implementation

During rest, both current production players show the next movement's exact animation, name, variant, target and set/rest structure together; the countdown remains explicitly labelled Rest. Final recovery shows no further work target. The frozen historical player, native prescriptions, interval timing and measured participation remain unchanged.

Current projection policy 10 also requires a wall for both exact version-1 Supine 90/90 Breathing Reset variants: their shared owned guide visibly supports the feet on a wall. This additive equipment rule filters Today, Custom, swaps and current Start/Resume checks without rewriting frozen definitions, media or historical plans. The text-only feet-on-floor regression does not imply a separate floor-only guide.

The optional continuous-hold helper has an explicit sound toggle, initially off. With sound enabled, one beep marks the hold start after preparation and two mark completion. Stop, mute, leaving/hiding the page, saving a result and unmount cancel pending sound; a late audio resume cannot replay a missed cue. Unsupported sound leaves the onscreen helper usable. Screen readers receive phase changes without an announcement every second. Interrupted time cannot accumulate into a continuous hold, and neither the timer nor sound confirms technique, safety or a result; the athlete must still report the exact native observation.

Focused checks use the actual player/form handlers in `scripts/validate-vnext-mixed-runner.mjs` and `scripts/validate-vnext-quick-guided-ui.mjs`, including distinct neighboring targets, final rest, optional cues, cancellation and late audio resume. `scripts/validate-vnext-restriction-exposure.mjs` checks both equipment variants, wall-free Today/Custom plans and swaps, and unchanged native definitions/policy. Physical iOS sound, silent-mode behavior, VoiceOver and Home Screen interruption remain part of final QA; desktop simulations do not establish those results. Verify audible start/end while looking away, mute, and app-switch/screen-lock interruption without replay or accumulated time before release acceptance.

Final integrated QA also aligns current setup checks with progression checks: exact physical restriction exposure, equipment and recent hard/high-load recovery are checked independently of graph prerequisites, including work on the previous calendar day. Committed setup reviews and first appends use current profile equipment; an old setup draft cannot restore equipment removed since then. Unfinished setup still previews its explicit equipment selection. The current policy is passed through offer and first-append validation; native readers without that current-policy argument and already-saved exact retries retain their earlier meaning. `scripts/validate-vnext-check-safety.mjs` covers every native protocol, both restriction severities, recovery and equipment gates, plus all-family modified Today/Custom plan/start/timeline coherence.

An explicit **No attempt made** choice now finishes locally after its no-result explanation, without saving a performance event, failed result, training load or progression change. It also safely resolves an invalid unsaved attempt-count entry. Existing saved `not-yet` observations keep their native meaning; the form does not reinterpret or delete them. Attempted partial results and pain reports continue to use their exact existing evidence paths.

### 6.16 Long-term training corrections — 2026-10-20, local candidate

The owner approved five corrections and both checkpoints together. Current projection policy **11** and mixed generator **3** apply to new recommendations; native policy 10/generator 2 and earlier readers remain available. Frozen exercise definitions, benchmark targets and measured history are unchanged.

1. **Current exit safety:** historical strength never exempts a movement or guided check from its current safety prerequisites. Follow the existing graph through Handstand exit/tolerance and standard/deficit HSPU bottom-exit requirements. A current higher *safety exit* may satisfy a lower exit only through the existing explicit implication whitelist; strength or balance achievement cannot. Rechecking the exit itself does not require first re-earning the old strength achievement. Setup, progression checks, Today, Custom and saved Start/Resume use the same gate.
2. **Useful supporting work:** a selected supporting goal may receive its missing milestone/capacity prerequisite inside the bounded secondary allocation. Shared work is not duplicated; technical work remains before strength; restrictions, equipment, load compatibility and primary priority still govern. If no useful supporting work survives composition, remove the claimed supporting focus and explain its deferral.
3. **Scoped symptom recovery:** a symptom initially affects the actual exercise's material demand plus audited physical-contact domains. Unknown exposure stays conservative. Today/Progress show both active holds and later reconfirmation; elapsed time no longer makes the latter disappear from the interface. A short explicit movement-scope update links back to the original symptom. Reporting comfort can clear that explicit hold, while demanding work still needs fresh native qualifying checks. No diagnosis, medical clearance or automatic skill award follows from comfort feedback.
4. **Maintenance by practice:** among due maintenance candidates, select the least recently completed exact milestone practice. The derived latest-exposure index spans the history, independently of the short recent-load window. Skipped, symptomatic, substituted-away, legacy-sparse and uncompleted items do not count; exposure never refreshes benchmark confidence.
5. **Persistent difficulty:** two distinct consecutive meaningful difficult practice occasions for the exact exercise/version/variant retain the existing conservative dose reduction across calendar gaps. Two completed Easy/Right practice occasions, or a fresh exact reassessment satisfying its existing confirmation contract, release the retained adjustment. Brief/skipped/unknown work and symptoms do not prove recovery. Approved swaps do not falsely imply failure of the original prescription. One isolated difficult day retains the existing acute response. This is a transparent programming heuristic, not a validated fatigue score or evidence that a particular 2/2 threshold is scientifically optimal. Aggregate review cannot distinguish first-set inability from excessive total volume, so continued difficulty offers Easier/a safe alternative without inventing that distinction.

Checkpoint evidence and limits are in [the correction report](VNEXT_LONG_TERM_TRAINING_CORRECTIONS.md). Data extension and safe publication order are canonical in Data & Migration §5.16.

### 6.17 Progression, recovery and paused setup — released 2026-10-20

The owner approved four further improvements together; the update/data boundary is in Data & Migration §5.17. New mixed generator **4** ranks currently usable unfinished milestones ahead of satisfied parents, retaining stale/contradicted reconfirmation priority, explicit target ancestry and specialist opt-in. If the next step is unavailable, useful established practice can remain the focus. Ranking and composition use the same existing trainability/variant rules; no prerequisite, confirmation or 48-hour high-load threshold is relaxed. Native generator 3 exports remain unchanged and projection stays at 11.

If composition cannot produce useful lighter development while recent high-load exposure limits candidates, Today explains recovery rather than suggesting unnecessary setup changes. An active restriction or post-clearance requirement takes precedence over ordinary recovery advice. No countdown promises clearance.

Explicitly submitted setup goals/equipment become Athlete Intent before skill confirmation; Continue later and Today/Custom therefore use the selected context. The saved draft supports retry after an interrupted second write. Original answer times govern field-specific application; Back, later skill answers and assessment completion cannot re-date old context over a newer Progress/synced intent. Unsubmitted form edits remain transient. Placement evidence and restriction clearance retain their existing separate paths. Detailed verification and remaining physical acceptance: [four-improvement QA report](VNEXT_FOUR_IMPROVEMENTS_QA.md).
