# Parallette25 Agent Instructions

These instructions define **how agents work on Parallette25**. Product architecture, approved decisions and project state belong in `MASTER_PLAN.md`.

## 1. Progressive context and preflight

Before substantial architecture or implementation work:

1. Read `MASTER_PLAN.md` completely.
2. Determine the current authorised phase/task, architecture status and implementation authority from it.
3. Follow its routing table and read only the specialist document sections relevant to that task and necessary dependencies.
4. Inspect repository status, confirm the required implementation baseline/planning documents when implementation is authorised, then inspect only relevant source files.
5. Use historical chat only when the master plan, routed specialist context and repository are insufficient.

Do **not** load all vNext documents, reconstruct the entire repository or reconstruct old discussion by default. For a trivial/local fix, use the minimum necessary context unless architecture, safety, persistence, migration or phase scope could be affected; then read `MASTER_PLAN.md` and the routed specialist context before changing it.

Typical routing:

- Phase 1: `MASTER_PLAN.md`, the Phase 1 roadmap section and relevant domain/data sections.
- Skill graph, benchmark, exercise-content or advanced work: Skill Architecture; add Research Basis only if training rationale is being reconsidered.
- Assessment/generator/Progress & Goals work: Assessment & Training Engine.
- Persistence, sync, legacy conversion, rollback or release work: Data & Migration.
- Any phase execution/review: only that roadmap phase plus genuine dependency sections.

If the current checkout conflicts with the baseline recorded in `MASTER_PLAN.md`, do not implement against the wrong baseline. Explain the conflict and resolve it within the user’s authorised scope or stop for direction. Verify the baseline against the deployed build before release/cutover work.

Use canonical tracked application files unless `MASTER_PLAN.md` or the owner says otherwise. Plausible untracked/suffixed copies are user-owned and are neither architecture evidence nor edit targets until explicitly reconciled.

## 2. Context and credit efficiency

- Prefer targeted search and inspection over repository-wide analysis.
- Do not repeatedly re-litigate settled architecture.
- Use the compact `MASTER_PLAN.md`, routed specialist sections, focused repository evidence and concise phase notes as persistent memory.
- Do not read a complete specialist document when its relevant section and dependency context are sufficient.
- Keep routine implementation summaries short; produce a large report only when it materially improves a decision.
- Use temporary specialist agents selectively for independent high-value work such as biomechanics/programming, migration/data architecture, UX or final QA. Do not create an always-running specialist swarm or duplicate analysis without benefit.
- Prefer parallel work only when subtasks are independent and the expected quality/time gain justifies it.

## 3. Authorisation and scope

- Implement only the phase or task the user explicitly approves.
- Never infer approval from a proposed roadmap, prior phase completion or an instruction to “continue” that does not identify the authorised work clearly enough.
- Never automatically begin the next phase.
- If `MASTER_PLAN.md` says `Implementation authorised: NO`, do not modify application behaviour unless the current user instruction explicitly grants that authority.
- Preserve unrelated working behaviour and user changes.
- Do not silently broaden scope, redesign adjacent systems, deploy, push, commit, reset data or delete legacy paths unless expressly requested or included in the approved phase.
- Prefer additive adapters/feature flags and reversible migrations until the vNext cutover and rollback gates are approved.

## 4. Architecture conflicts and discoveries

If implementation reveals a genuine conflict with `MASTER_PLAN.md`:

1. Identify the exact conflict and repository evidence.
2. Explain the consequence for the current phase and later architecture.
3. Recommend the smallest coherent solution.
4. Continue only if the solution clearly fits the approved architecture and phase.
5. Stop for user input if it changes a material product decision, safety rule, data contract, migration promise, advanced-skill boundary or roadmap dependency.

Do not silently redesign the system. Record significant discoveries in `MASTER_PLAN.md` only when they affect future work or project state.

## 5. Development discipline

- Keep stable exercise, profile, event and session identifiers unless an approved migration provides aliases/tombstones.
- Treat safety/readiness gates conservatively. A demand choice or manual preference must never bypass prerequisites or active restrictions.
- Keep historical capability separate from current trainability in all implementation work.
- Do not introduce unvalidated numeric readiness/capacity/fatigue scores.
- Preserve offline-first behaviour, secure account handling, backup/import and rollback paths in any affected phase.
- Never reinterpret legacy evidence as more precise than the stored data supports.
- Add exercise/content volume only when the approved graph/generator work demonstrates a need.
- Keep internal sophistication out of the user interface; user-facing reasons should be plain and actionable.
- Retain the owned-media/licensing policy. Do not add scraped or unlicensed exercise media.

## 6. Testing philosophy

During early and middle phases, use the lightweight safeguards needed to avoid building on broken foundations:

- type checking and production builds when affected;
- schema/fixture validation;
- graph/reference/prerequisite integrity;
- deterministic reducer/generator scenarios;
- focused persistence/migration/offline checks;
- focused regressions for behaviour touched by the phase.

Do not run or create exhaustive whole-project QA after every phase. Comprehensive behavioural, integration, migration, edge-case, accessibility and production validation belongs in the designated later roadmap phase.

Critical failures—unsafe recommendations, data loss/corruption, broken migration/rollback, invalid graph foundations, authentication exposure or an unusable build—must never be intentionally postponed.

## 7. Research and training-content standards

- For material biomechanics, safety, strength programming, fatigue or motor-learning claims, prefer peer-reviewed research, recognised consensus/position statements and authoritative gymnastics sources.
- Distinguish direct evidence, accepted coaching practice and architectural inference.
- Do not claim that a niche parallette progression is scientifically proven when evidence only supports broader principles.
- Do not provide diagnosis, rehabilitation or return-to-sport clearance. The product’s default scope is defined in `MASTER_PLAN.md`.

## 8. MASTER_PLAN maintenance

Update `MASTER_PLAN.md` only after:

- an owner-approved architectural decision or important requirement change;
- completion of a meaningful implementation phase;
- a significant discovery affecting future architecture, safety, migration or scope;
- a roadmap, baseline or project-state change.

Do not update it for trivial code edits, routine checks or conversational notes. Keep it compact; replace superseded direction rather than appending a diary. Put detailed graph, engine, data/migration, roadmap or research changes in their one canonical specialist document and keep only the universal summary, routing and current state here. Do not duplicate detailed material across files.

After each approved phase, update at least:

- architecture/decision sections if an approved material change occurred;
- the completed/current phase fields;
- current approved milestone;
- next intended action;
- implementation authorisation state.

## 9. Phase checkpoint and handoff

At the end of each approved phase:

1. Perform the proportionate phase safeguards.
2. Concisely state what materially changed.
3. Note any material decision, deviation, known limitation or later-phase implication.
4. Update `MASTER_PLAN.md` project state.
5. Stop and wait for the user to approve, modify or reject the next phase.

Do not frame routine checks as a separate large QA exercise. Do not start the next phase in the same turn unless the user explicitly authorised multiple named phases in advance.
