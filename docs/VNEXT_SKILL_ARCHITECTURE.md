# Parallette25 vNext Skill Architecture

**Status:** APPROVED FOUNDATION — PHASE 11 COMPLETE; BATCH A LIVE/PHONE ACCEPTED; B–E ACCEPTED; BATCH F READY FOR OWNER REVIEW; DEPLOYMENT DEFERRED

**Implementation authorised:** Batch F’s five named specialist outcomes were approved on 2026-10-17 and are now prepared for owner motion review. No later batch or deployment is authorised. Hold deployment until all remaining batches are finished; graph topology, population and apparatus boundaries remain frozen.

This is the canonical detailed reference for vNext skill graphs, shared capacities, benchmark relationships, exercise roles, catalogue coverage and the advanced/specialist boundary. Read it for graph, benchmark, exercise-content, progression-content or advanced-scope work; most other tasks should use the compact [project map](../MASTER_PLAN.md) instead.

Evidence storage and projection semantics belong in [VNEXT_DATA_MIGRATION.md](VNEXT_DATA_MIGRATION.md). Training-science support and its limitations belong in [VNEXT_RESEARCH_BASIS.md](VNEXT_RESEARCH_BASIS.md). Phase scope and review gates belong in [VNEXT_IMPLEMENTATION_ROADMAP.md](VNEXT_IMPLEMENTATION_ROADMAP.md).

## Phase 2 catalogue-v1 implementation record

Phase 2 completed the additive, non-live definition layer on 2026-08-18. The machine-readable sources are canonical for exact IDs and edges: [graphs](../app/vnext/definitions/graphs.ts), [capacities](../app/vnext/definitions/capacities.ts), [benchmark protocols](../app/vnext/definitions/benchmarks.ts), [catalogue mapping](../app/vnext/definitions/catalogue.ts) and the [missing-bridge registry](../app/vnext/definitions/missingBridges.ts). The focused [Phase 2 validator](../scripts/validate-vnext-phase2.mjs) checks references, complete/executable reachability, DAG cycles, protocol policy, capacity use, the 195-ID catalogue boundary and absence of live imports.

- **Definition coverage:** seven graphs, 103 nodes, seven capacities with 21 facets, 64 protocols and all 195 v1.2 exercise IDs. Forty-three nodes have current content/protocols; 60 nodes are explicitly `missing-content` and have no fabricated benchmark.
- **Gap coverage:** 41 boundary-homogeneous Phase 7 content groups cover every missing node exactly once. In immutable catalogue v1, proposed exercise, prescription-variant or protocol IDs are registry-only and absent from the definition bundle.
- **Boundary coverage:** 74 nodes are automatic, 19 stronger-gated and ten specialist. These are full-graph classifications, not claims that all content exists. Every specialist node is missing-content; no existing exercise is silently specialist.
- **Compatibility:** all 195 IDs remain active; no alias, tombstone or deprecation was introduced. Legacy `easierId`, `harderId`, `progressionFamily` and prerequisite arrays remain compatibility hints, not canonical graph topology. Regression guidance is retained as a distinct regressed prescription, never as the standard benchmark condition. Version-bound source and complete Phase 2 semantic fingerprints make catalogue or definition drift require an explicit new definition-version review.
- **Behaviour:** no live workout, generator, evidence, persistence, profile, UI or media path imports these definitions.

## Phase 7 catalogue-v2 implementation record

Phase 7 completed the first planner-proven automatic content gate on 2026-08-24. The canonical current sources are the [content overlay](../app/vnext/definitions/phase7Content.ts), [owned-media requirements](../app/vnext/definitions/phase7Media.ts) and focused [Phase 7 validator](../scripts/validate-vnext-phase7.mjs). Catalogue v1 remains exported unchanged for historical replay and deterministic legacy conversion; catalogue v2 is additive and semantically frozen.

- **Current coverage:** seven unchanged graphs with 103 nodes, seven unchanged capacities with 21 facets, 225 exercises and 94 protocols. Seventy-three nodes now have exact content/protocols; 30 remain `missing-content`.
- **Delivered gate:** 30 one-node/one-exercise definitions and 30 protocols cover 20 proven automatic bridge groups. This fills 4 Planche, 4 L/V-sit, 3 Handstand, 8 HSPU, 6 Press, 1 Pushing and 4 Transition nodes.
- **Remaining boundary:** the only still-missing automatic node is assisted full Planche, which is unreachable until its stronger-gated stable-straddle prerequisite exists. All 19 stronger-gated and ten specialist nodes remain content-free; no boundary was weakened to make the catalogue look complete.
- **Role discipline:** every addition is an exact outcome/benchmark with an explicit supporting content role, prerequisite context, equipment, dense demand, safety, progression/regression relation and standard plus sub-benchmark Technique prescription. True regressions remain separate exercise relations; a Technique prescription cannot confirm the milestone.
- **Compatibility:** retained catalogue-v1 Exercise Definitions, capacities and protocols are byte-identical. Explicit subject compatibility promotes only unchanged v1 evidence into v2; no new Phase 7 subject receives historical credit. Legacy conversion remains pinned to catalogue v1.
- **Media:** 28 newly owned motion briefs cover all 30 movements. The assisted-straddle Press/transition pair and straddle-negative/handstand-lower pair each share physical motion only; their exercise IDs, node authority and protocols remain separate. One-way exits/negatives, both balance exit sides, exact wall-assistance geometry and standard-versus-deficit HSPU targets are mandatory. No live ping-pong animation is claimed to satisfy these briefs.
- **Historical classification:** no existing exercise was deleted, renamed or reclassified in Phase 7. The Phase 2 frog/crane, kick-up, general-pushing, compression and transition corrections remain canonical and history-compatible.

| Graph/track | New content-backed nodes | Current automatic ceiling supplied by Phase 7 |
|---|---:|---|
| **Planche** | 4 | Stable parallette tuck → advanced tuck → wall-assisted one-leg/straddle preparation. |
| **L-Sit/V-Sit** | 4 | Stable straddle L and high L → wall-assisted V → unassisted partial V preparation. |
| **Handstand Balance** | 3 | Repeatable floor/parallette balance → controlled parallette tuck shape change. |
| **Vertical Push/HSPU** | 8 | Elevated pike → staged standard exit → eccentric/assisted/partial/full wall HSPU → staged deficit exit and deficit wall HSPU. |
| **Press to Handstand** | 6 | Feet-assisted tuck loading, separate assisted bent-arm/straight-arm straddle/pike paths and controlled negatives. |
| **Parallette Pushing** | 1 | Exact deficit-range parallette push-up. |
| **Transitions** | 4 | Both L-sit↔tuck-Planche directions, wall-handstand straddle lower and assisted straddle Press-to-handstand/exit chain. |

### Phase 10 owned-motion implementation record

Phase 10 implements the 28 Phase 7 briefs as owned, code-native motion guides covering all 30 exact exercise mappings. Canonical implementation and release state live in [the guide definitions](../app/vnext/media/phase10OwnedMotion.ts), [RC-only renderer](../app/vnext/media/VNextMotionGuide.tsx), [release manifest](../app/vnext/releaseCandidate/mediaRelease.ts), [technical validator](../scripts/validate-vnext-phase10-media.mjs), [exact-player review export](../scripts/build-vnext-phase10-motion-review.mjs) and [secondary frame-review renderer](../scripts/render-vnext-phase10-media-review.mjs). Ordinary v1 does not import this registry.

RC.2 review relied too heavily on frozen start/middle/end evidence. Owner review in live motion then exposed faults that the stills concealed: several L/V figures faced against their travel, the side L/V basis reclined instead of pressing tall, the straddle L-sit read as a scissor, assistance could appear as a false tether or at unequal marks, some holds were shorter than their exact protocol, HSPU/Press depth or exit geometry was unclear, and the L-sit/Planche transition could cross under or hide its compressed midpoint. RC.2 media approval is superseded.

RC.3 corrects and re-fingerprints the entire set. L/V side guides now share an upright, left-facing basis; front-oblique straddle L-sit is symmetric with readable face direction; assisted V-sit and assisted straddle Planche use one equal-height marked contact; hold keyframes meet the benchmark duration shown; Planche assistance appears only at true contact; wall-HSPU assistance follows the wall-foot slide; elevated-pike, standard/deficit HSPU and deficit push-up depth landmarks are crossed correctly; deficit exits reach the lower floor; Press/straddle negatives detach from the wall and complete their four-second one-way descent; and both L-sit↔tuck-Planche directions retain one orientation, continuous feet clearance, distinct endpoints and mechanically coherent landings. Reduced-motion posters show each named destination rather than an arbitrary midpoint.

The canonical owner surface now renders the same `VNextMotionGuide` component, authored duration/keyframe timing and one-way-reset behaviour used by the workout player. Frozen start/middle/end frames and 84 SVG exports remain secondary close-inspection evidence, not an animation-approval substitute. Eccentrics, negatives, directional transitions and one-way exits never reverse/ping-pong. The two shared-motion pairs retain separate exercise/node/protocol authority.

All 28 RC.3 implementations have technical-review-v2 approval bound to their individual SHA-256 guide fingerprints. Owner approval of those exact live animations remains pending, so all 30 production-reachable mappings remain release-blocked with no generic substitute. Any geometry, timing, playback or presentation change changes its fingerprint and requires technical plus owner review again.

### Final graph/branch audit

| Graph | Final branches | Existing protocol-backed ceiling | Main registered bridge |
|---|---|---|---|
| **Planche** | foundation loading; tuck; one-leg; straddle; full; dynamic specialist | controlled lean → toe-light loading → foot-assisted tuck → brief floor tuck | stable parallette tuck, advanced tuck, assisted/unassisted one-leg/straddle/full, then an exact full-Planche push-up eccentric before the concentric outcome |
| **L-Sit/V-Sit** | foundation; long-leg L; straddle L; V-sit; V specialist | assisted/tuck → controlled extensions → one-leg/full L with separated-session confirmation; assisted straddle | unassisted straddle L, then high-L/assisted/partial/stable V |
| **Handstand Balance** | safety/inversion; floor/parallette-specific line/entry/balance; pressure; shapes; weight transfer; one-arm specialist | wall-height exits, floor line/entry/short balance, parallette entry/pressure/short balance, pull-away and wall micro-taps | repeatable floor/parallette balance, stronger-gated longer parallette balance, shapes, free weight transfer and one-arm scope |
| **Vertical Push/HSPU** | pike; wall HSPU; freestanding HSPU; 90-degree specialist | shallow/floor/parallette pike → controlled pike eccentric | elevated/deep pike, standard-depth wall bottom/exit and eccentric-to-full, a separate deficit-depth exit, freestanding progression and 90-degree specialist |
| **Press to Handstand** | assisted foundation; bent-arm tuck; straight-arm straddle; straight-arm pike; specialist | no honest press-specific existing exercise | the entire assisted/eccentric-to-full branch set; capacity drills remain seeds, not outcomes |
| **Parallette Pushing** | foundation; range/tempo; asymmetry; forward-loaded; specialist | knee/floor/parallette, tempo, staggered and pseudo-planche push-ups | explicit deficit, deeper forward-loaded endpoint and optional Planche push-up |
| **Transitions** | support/L-sit; handstand chain; L-sit/Planche; handstand lowering; Press/Handstand; Planche/Handstand; specialist | support→tuck→one-leg/full L and an authored entry–balance–exit chain | both L-sit↔tuck-Planche directions, exact wall-handstand lower, straddle-L/full-L Press routes, directional Planche/Handstand connections and two explicit specialist transitions |

The existing entry–balance–exit chain now supports two distinct current protocols: a short parallette-balance observation and the complete transition chain. Every current-content node has an executable current-content prerequisite path. Phase 3 must reuse one performed source observation deterministically when it supports both findings; it must not duplicate the Session Record or double-count the performance.

### Material catalogue corrections

- Frog/crane variants are Handstand balance-confidence/technique drills, never Planche milestones.
- `straddle-planche-lean` remains a grounded development drill, not evidence of a straddle Planche.
- `freestanding-parallette-kickup` proves repeatable entry only; it does not prove sustained balance. The current floor balance attempt has an explicitly floor-specific node/protocol.
- Floor line/entry/balance evidence and parallette line/entry/balance evidence are apparatus-specific; neither transfers silently to the other.
- The floor tuck attempt proves only a brief floor-specific tuck outcome, not a stable parallette tuck.
- Toe-light Planche loading and the grounded standing-entry line remain observable technique/eligibility checkpoints only; neither is presented as the destination skill it prepares.
- Press-related compression, support and line work remains shared-capacity/development seed material; no current exercise was relabelled as a Press outcome.
- Legacy fallbacks become explicit substitutions, verified biomechanical regressions are explicit relations, and textual lever/range/assistance reductions remain separate regressed prescription variants. Standard benchmark prescriptions contain no regression prose. Linear `easierId` neighbours are not copied blindly.
- Wall-named exercises receive corrected wall-equipment metadata in the isolated vNext definitions without changing the live catalogue.
- Capacity-contributor links use audited movement sets rather than name/focus shortcuts: wrist drills do not become tall support, mobility/conditioning does not become hollow control, and pike or overhead scapular work does not become forward Planche load. Hand-supported pike drills retain their real wrist demand.

---


## Batch A catalogue-v3 delivery — 2026-10-17

The owner authorised Batch A after accepting the deployed iPhone completion/landscape fixes. The isolated [candidate overlay](../app/vnext/progression/batchA.ts) and [owned motion](../app/vnext/progression/batchAMotion.ts) are canonical for exact definitions. The owner accepted all five animations and authorised deployment after final checks on 2026-10-17. Batch A is live as build `71bef225371de61db7a6`; release evidence is in runbook Section 14. Production selects the overlay through its explicit deployment configuration; historical RC.3 and default exports stay at v2. Both older bundles and fingerprints are unchanged.

The candidate contains 230 exercises, 99 protocols and 78 content-backed nodes. Twenty-five nodes remain missing in 16 groups: one automatic, 14 stronger-gated and ten specialist. All five new nodes retain their stronger-gated classification and exact existing prerequisites. Availability of stable straddle content does not implement the still-missing assisted/full Planche branch.

| Candidate node | Exact benchmark policy | Confirmation / freshness | Authored regression |
|---|---|---|---|
| `stable-longer-parallette-balance` | At least 3 of 5 settled, unassisted 20-second straight two-arm balances, each followed by a planned side exit; accepted attempts include both exit sides. | 3 distinct occasions / 30 days | Repeatable parallette balance |
| `one-leg-planche` | 4 attempts, 2 per side; at least one accepted unassisted 5-second horizontal extended-leg hold on each side, without knee support; controlled return/landing. | 3 distinct occasions / 60 days | Assisted one-leg Planche |
| `stable-straddle-planche` | Unassisted 8-second horizontal straddle, straight knees/locked elbows, protraction, symmetric comfortable width and controlled tuck/landing. | 3 distinct occasions / 60 days | Assisted straddle Planche |
| `stable-v-sit` | Unassisted 8-second straight-leg V at least 60° above horizontal, tall support, upright torso, no recoil and controlled lower. | 2 distinct occasions / 60 days | Partial V-sit |
| `advanced-forward-loaded-push-up` | 4 controlled reps, grounded toes on fixed marks, shoulders at least one athlete hand-length ahead of grip centres throughout, ≥3-second descent to elbow-height shoulders and full lockout. No added deficit is required. | 2 distinct occasions / 60 days | Pseudo-planche push-up |

Each new definition owns one exact standard protocol plus a sub-benchmark technique prescription. Practice targets specify one attempt per set for balance/one-leg work, rather than squeezing a whole multi-attempt test into one short interval. A shorter ordinary practice block need not contain the complete guided benchmark. Reduced-dose practice and ordinary balance-attempt reviews cannot manufacture exact benchmark success. Demand ratings remain conservative at the reduced dose; true regressions return to the authored earlier exercise. Capacity links support relevant planning without adding new prerequisite edges. Focused prerequisite-only straddle and forward-loaded pushing profiles retain the existing explicit 12–13-minute safety exception when no additional safe relevant block is available; the candidate does not force extra high-load volume to reach 25 minutes. The original registry’s proposed forward-loaded exercise ID is retained; “deep” does not introduce a below-elbow deficit requirement absent from the graph.

Projection policy v3 adds explicit v1→v3 and v2→v3 compatibility only for already-backed unchanged subjects, retaining v1→v2. New Batch A subjects receive no historical credit. Historical replay continues to use the original bundles; new graphs only change the five availability/protocol mappings and enclosing version. No new protocol-reuse or mechanical-predecessor implication is added.

Five owned guides use the existing renderer and exact workout player. They show complete entries, holds/reps, both sides where required and controlled exits. Their hold/rep timings match the demonstration; inter-attempt rest is explicitly abbreviated in the guide. All use forward-only playback with a reset, never a reversed exit. The exact moving guides are **owner accepted on 2026-10-17**, bound by the separate [Batch A acceptance ledger](../app/vnext/production/batchARelease.ts). Historical Phase 10 approvals grant the new media no authority. The original review manifest remains unchanged as the prepared review record; its pending state is resolved by the separate acceptance ledger. Use `pnpm review:vnext-batch-a` to build the standalone review and `pnpm validate:vnext-batch-a` for the focused safety, compatibility and media checks.

## Batch B catalogue-v4 candidate — 2026-10-17

The owner accepted Batch A on their iPhone and authorised Batch B. Exact definitions are canonical in [the additive overlay](../app/vnext/progression/batchB.ts); [owned motion](../app/vnext/progression/batchBMotion.ts) and [the review manifest](../app/vnext/progression/batchBReviewManifest.ts) bind the review package. The owner accepted all five animations on 2026-10-17; [the separate acceptance ledger](../app/vnext/progression/batchBMotionAcceptance.ts) binds their exact candidate, guide and prepared-review fingerprints, without granting production activation. Production remains accepted Batch A/v3; historical/default exports and the common renderer/player/CSS are unchanged. No commit, push or deployment is included in this candidate checkpoint.

The candidate has 235 exercises, 104 protocols, 83 backed nodes and 20 missing nodes in 11 groups (ten stronger-gated and ten specialist). All original prerequisites and boundaries remain: assisted full Planche is automatic only after Established/current stable straddle; full Planche follows assisted full; the three press branches depend independently on their original assisted/negative predecessors. Content availability does not demonstrate athlete readiness.

| New node | Operational benchmark | Confirmation / freshness | Authored regression |
|---|---|---|---|
| `assisted-full-planche` | Six seconds in a horizontal straight-arm, straight-knee together-leg full lever with both toes at fixed equal-height wall contacts and marked bar position. Wall assistance is unquantified. | 2 distinct occasions / 60 days | Stable straddle Planche |
| `full-planche` | Five seconds in the same full-length horizontal shape, feet clear with no assistance; controlled tuck entry/return. | 3 distinct occasions / 60 days | Wall-assisted full Planche |
| `full-bent-arm-tuck-press` | At least 2 of up to 4 separate grounded-start attempts through an unassisted bent-arm tuck to a locked-arm, straight two-arm handstand settled for 2 seconds. No head loading or knee support. | 3 distinct occasions / 60 days | Assisted bent-arm tuck press |
| `full-straddle-press` | At least 2 of up to 4 separate grounded-start straddle presses: locked elbows/knees, hips stack before legs close, unassisted straight handstand settled for 2 seconds. | 3 distinct occasions / 60 days | Assisted straight-arm straddle press |
| `full-pike-press` | At least 2 of up to 4 separate grounded-start pike presses: locked elbows/knees, legs together throughout ascent, unassisted straight handstand settled for 2 seconds. | 3 distinct occasions / 60 days | Assisted straight-arm pike press |

Numeric targets are authored coaching/product policy with the evidence limits in Research Basis. A press practice set contains **one ascent** and planned rest, not the full benchmark attempt series. Standard practice range and exact test conditions are separate; reduced Technique attempts/holds cannot confirm a milestone. Every press ends scoring at the settled top; the separately shown trained exit grants no transition, L-sit-start or repeated-press credit. No negative or assisted movement silently proves an unassisted ascent.

The five forward-only guides show grounded setup, complete entry/target, actual benchmark-duration hold or full ascent, and a grounded exit/reset. Fixed skeleton segments and dense angular/IK samples avoid stretching through Planche extension and split exits; wall markers fade only while the toes remain at the wall. The common accepted player and historical guides are unchanged. Use `pnpm review:vnext-batch-b` and `pnpm validate:vnext-batch-b`. Exact owner motion acceptance is **recorded** and production is **disabled**; later batches require their own approval (Batch C’s authorised checkpoint follows). The prepared review manifest remains unchanged as historical evidence; its pending state is resolved by the separate acceptance ledger. Per the owner’s instruction, deployment waits until all remaining progression batches are finished and final release checks pass. The candidate preserves the existing explicit 12–13-minute safety exception for narrowly qualified Planche profiles; it does not add filler to reach 25 minutes.

## Batch C catalogue-v5 candidate — 2026-10-17

The owner authorised these six milestones and retained the combined-release deployment hold. Exact content is canonical in [the additive overlay](../app/vnext/progression/batchC.ts), with [six owned guides](../app/vnext/progression/batchCMotion.ts) bound by [the pending review manifest](../app/vnext/progression/batchCReviewManifest.ts). Accepted Batch B definitions, media, review and acceptance fingerprints remain unchanged. Production remains Batch A/v3; common rendering/player code and historical default exports are unchanged.

The v5 candidate has 241 exercises, 110 protocols and 89 backed / 14 missing nodes in nine remaining bridge groups: four stronger-gated transition nodes and ten specialist nodes. Only these six availability/protocol mappings change. All original safety, wall-strength, standard/deeper-exit and balance dependencies remain mandatory; content availability is not athlete readiness.

| New node | Operational benchmark | Confirmation / freshness | Regression |
|---|---|---|---|
| `freestanding-weight-transfer` | At least 2 of up to 3 floor-reset left–centre–right–centre cycles, with 2 quiet seconds each side, locked elbows and both full grips retained. | 3 distinct occasions / 60 days | Wall-facing handstand weight shift |
| `freestanding-parallette-one-hand-light-balance` | At least 2 of up to 3 cycles, 3 seconds of biased support each side, opposite hand still touching. Pressure easing is athlete-reported, not measured unloading or one-arm credit. | 3 distinct occasions / 60 days | Freestanding weight transfer |
| `freestanding-hspu-eccentric` | At least 2 of up to 3 separate ≥4-second descents to the unloaded standard bar-top crown landmark; direct controlled feet-to-floor bottom exit with both grips and no ascent. | 3 distinct occasions / 45 days | Wall HSPU eccentric |
| `partial-freestanding-hspu` | At least 2 of up to 3 down-and-up attempts to a fixed crown marker halfway between settled top crown height and bar-top height, then a 2-second active lockout. | 3 distinct occasions / 60 days | Freestanding HSPU eccentric |
| `full-freestanding-hspu` | At least 2 of up to 3 standard bar-top-depth down-and-up attempts, no crown contact, then a 2-second active lockout. | 3 distinct occasions / 60 days | Partial freestanding HSPU |
| `deficit-freestanding-hspu` | At least 2 of up to 3 attempts to the exact reviewed below-bar crown target matching the current deeper-exit setup, then a 2-second active lockout. Standard depth/exit never substitutes. | 3 distinct occasions / 45 days | Full freestanding HSPU |

These numbers and range markers are authored product/coaching policy, not validated readiness or injury cutoffs. Practice is one cycle, negative or repetition per set with planned rest; the full test series is separate and reduced Technique practice cannot confirm. No eccentric/partial/standard result silently proves an unobserved concentric or deeper range. If a controlled freestanding bottom exit with both grips and unloaded head is uncertain, the protocol directs wall regression and coaching; wall exit evidence is not described as proof of that freestanding execution.

The front-oblique balance guides retain both separate grips through both side holds. HSPU guides distinguish partial, standard and deficit crown landmarks, use forward-only playback, and show grounded entry/exit. The eccentric exits directly from bent arms without rising into a press. Dense joint samples preserve skeleton lengths; explicit knee/ankle floor and actual 27-unit rendered-head clearance checks cover the corrected landing path. Independent content/motion review found no remaining material issue after correction. `pnpm validate:vnext-batch-c` covers native v1–v4 replay, eligibility/frontiers, new-protocol confirmation, candidate save/retry/export/import and media; `pnpm review:vnext-batch-c` builds the isolated exact-player review. Eighteen portrait/short-portrait/landscape layouts and a running-workout rotation pass. The owner accepted all six animations on 2026-10-17; [the separate acceptance ledger](../app/vnext/progression/batchCMotionAcceptance.ts) binds their exact candidate, guide and prepared-review fingerprints. The original pending manifest remains historical evidence. Production is **disabled**; deployment stays deferred.

## Batch D catalogue-v6 candidate — 2026-10-17

The owner authorised these four stronger-gated transitions after accepting C. Exact definitions are canonical in [the additive overlay](../app/vnext/progression/batchD.ts), with [four owned guides](../app/vnext/progression/batchDMotion.ts) bound by [the pending review manifest](../app/vnext/progression/batchDReviewManifest.ts). Accepted B/C definitions, motion and review fingerprints remain unchanged. The candidate has 245 exercises, 114 protocols and 93 backed / 10 missing nodes in seven remaining groups; all ten gaps are specialist. Only four availability/protocol mappings change; graph edges, capacities and apparatus/population boundaries remain frozen.

| New node | Operational benchmark | Confirmation / freshness | Regression |
|---|---|---|---|
| `straddle-l-press-handstand` | Feet-clear upright straddle-L held 2 seconds → continuous locked-arm, straight-leg press → straight handstand held 2 seconds. Keep straddle until hips stack. | 3 distinct occasions / 45 days | Grounded straddle press |
| `full-l-pike-press-to-handstand` | Full L-sit held 2 seconds → continuous locked-arm pike press with straight together legs → straight handstand held 2 seconds. | 3 distinct occasions / 45 days | Grounded pike press |
| `handstand-to-l-sit-negative` | Straight handstand held 2 seconds → one-way continuous lower lasting at least 4 seconds → true feet-clear full L-sit held 2 seconds. | 3 distinct occasions / 45 days | Wall handstand-to-straddle-stand lower |
| `straddle-planche-to-handstand-press` | Horizontal feet-clear straddle Planche held 2 seconds → continuous locked-arm press → straight handstand held 2 seconds. Close legs only after hip stack. | 3 distinct occasions / 45 days | Straddle Planche hold |

Each test accepts at least two of up to three separately floor-reset attempts. These authored operational thresholds are not validated readiness or injury cutoffs. Practice uses one complete attempt per set and planned rest; reduced Technique endpoint holds cannot confirm. Grips stay fixed, elbows/knees straight and feet clear throughout the scored chain; ground setup and landing are separate. No wall/head/knee/foot support, swing, kick, tuck or intervening grounded reset substitutes. Existing endpoint, balance, capacity and exact exit prerequisites remain mandatory. Endpoints alone, a grounded press or the opposite transition direction never prove a new connector.

Owned motion uses fixed three-dimensional skeleton lengths and a fixed projection into the unchanged shared renderer. Front-oblique straddle-L and elevated side Planche views expose both legs. Independent review corrected a thigh/forearm crossing during the straddle-L connector; frame/midpoint separation checks now cover that path. Floor, rendered-head clearance, endpoint holds, locked joints, fixed grips, straddle timing and the one-way negative are checked. `pnpm validate:vnext-batch-d` also covers native v1–v5 history, eligibility/frontiers, candidate practice/save/retry/export/import and later exact guided confirmation. Type checking, C regression, twelve phone layouts and running-workout rotation pass. `pnpm review:vnext-batch-d` builds the isolated exact-player review. The owner accepted all four animations on 2026-10-17; [the separate acceptance ledger](../app/vnext/progression/batchDMotionAcceptance.ts) binds their exact candidate, guide and unchanged prepared-review fingerprints. Production is **disabled**; deployment remains held until all batches finish and release gates pass.

## Batch E catalogue-v7 specialist candidate — 2026-10-17

The owner explicitly authorised Batch E after accepting D, retaining the combined-release hold. Exact definitions are canonical in [the additive overlay](../app/vnext/progression/batchE.ts), with [five owned guides](../app/vnext/progression/batchEMotion.ts) bound by [the pending review manifest](../app/vnext/progression/batchEReviewManifest.ts). The v7 candidate has 250 exercises, 119 protocols and 98 backed / 5 missing nodes in four remaining groups, all Batch F specialist work. Only five availability/protocol mappings change; accepted B/C/D, capacities and graph prerequisites remain unchanged. Every E node remains **specialist**, requiring athlete opt-in and the exact selected goal; broad goals and Challenge cannot introduce these exercises.

| New node | Operational benchmark | Confirmation / freshness | Regression |
|---|---|---|---|
| `extended-v-sit-hold` | Five continuous seconds with upright tall support, locked elbows and straight together legs at least 75° above horizontal; controlled L-sit entry/return. | 3 distinct occasions / 45 days | Stable V-sit |
| `assisted-one-arm-parallette-balance` | At least one 3s hold per supporting arm in at most two attempts per side, four total. Coach support at both sides of pelvis begins before free-hand release and persists through full regrip. | 3 distinct occasions / 30 days | One-hand-light balance |
| `one-arm-handstand` | Same paired-side 3s requirement, with coach present but zero assistance/contact during scoring; free hand fully clear. | 3 distinct occasions / 30 days | Coach-assisted one-arm balance |
| `repeated-straddle-presses` | One set of two complete grounded-start straight-arm straddle presses, each ending in a settled 2s straight handstand; controlled floor return and stationary 2–4s reset between ascents. | 3 distinct occasions / 45 days | Single grounded straddle press |
| `repeated-pike-presses` | The same two-press set through its independent together-leg pike branch; no straddle substitute. | 3 distinct occasions / 45 days | Single grounded pike press |

Counts, angles, durations and freshness are authored coaching/product policy, not validated readiness or injury cutoffs. High V is higher range than A’s 60° V, with no manna/press claim. One-arm practice is one side per set, alternating only after landing/rest; the paired test is separate. Coach contact is unquantified, never unassisted credit; any catch or missing side fails the full paired benchmark. Regrip with both hands before exiting. The coach selects a comfortable straddle width; the illustrated width is schematic, not an extra flexibility benchmark. Repeated presses bound the reset so isolated attempts separated by arbitrary rest cannot pass; one complete pair is one observation. Single-press Technique cannot confirm. Feet-clear L-sit/stalder, opposite press branches and other specialist combinations remain separate.

Owned guides use constant world skeletons and dense interpolation in the unchanged shared player. Two 3s side holds, coach-contact timing, full free-hand clearance/regrip, actual ≥75° V elevation, two 2s tops and the stationary 3s floor reset are checked. Readable contact/range annotations, fixed grip/straight-limb geometry, floor/head clearance and arm/leg separation pass. All fifteen portrait/short-portrait/landscape player layouts and running rotation pass after concise coaching copy; full protocol conditions remain in the details. Attempt windows allow entry, the prescribed effort and controlled exit; the high hold’s 40s attempt window is not a 40s hold. Focused native v1–v6 replay, gates, practice/save/retry/export/import and subsequent guided confirmation, D regression, type checking and production isolation pass. The production artifact still exactly matches A. Use `pnpm validate:vnext-batch-e` and `pnpm review:vnext-batch-e`. The owner accepted E’s five animations on 2026-10-17; [the separate acceptance ledger](../app/vnext/progression/batchEMotionAcceptance.ts) binds the exact candidate, guide and unchanged prepared-review fingerprints. Production is **disabled**; deployment remains deferred.

## Batch F catalogue-v8 specialist candidate — 2026-10-17

The owner explicitly authorised F after accepting E, retaining the deployment hold. Exact definitions are canonical in [the additive overlay](../app/vnext/progression/batchF.ts), with [five owned guides](../app/vnext/progression/batchFMotion.ts) bound by [the pending review manifest](../app/vnext/progression/batchFReviewManifest.ts). Candidate coverage is 255 exercises, 124 protocols and all 103 frozen nodes content-backed, with zero missing bridge groups. This completes the agreed inventory without expanding graph scope. Only five availability/protocol mappings change; accepted B–E, historical definitions, capacities, prerequisites and specialist boundaries remain frozen. All five require athlete opt-in and the exact selected goal; broad goals and Challenge cannot introduce them.

| New node | Exact operational path | Regression |
|---|---|---|
| `full-planche-push-up-eccentric` | Full Planche held 2s → full-length horizontal lower lasting at least 4s until shoulders reach elbow height → direct bent-arm fold/landing. No upward recovery. | Advanced forward-loaded push-up |
| `full-planche-push-up` | Full Planche held 2s → shoulders at elbow height → complete return to the same locked-arm full Planche held 2s. | Exact full-Planche eccentric |
| `ninety-degree-hspu` | Straight handstand held 2s → at least 4s lower to horizontal bent-arm approximately 90° bottom → complete press back to straight handstand held 2s. | Deficit freestanding HSPU |
| `full-planche-to-handstand-transition` | Full Planche held 2s → continuous full-length, legs-together straight-arm press → straight handstand held 2s. | Straddle Planche-to-handstand press |
| `ninety-degree-handstand-to-planche-transition` | Handstand held 2s → at least 4s lower through horizontal bent-arm 90° → **active elbow extension** into locked-arm full Planche held 2s. No return to handstand. | Exact 90-degree HSPU |

Each protocol accepts at least two of up to three separately floor-reset attempts and confirms on three distinct training/guided occasions, with 30-day freshness. Practice is one attempt per set plus planned rest; the full test series is separate. Reduced Technique range/time/holds cannot confirm. Fixed full grips, straight together legs and head/foot clearance persist through scoring; ground setup/exit is separate. An experienced coach is present for the planned exit, with no contact help during scoring. Any catch is failed/modified. Exact thresholds are authored coaching/product policy, not validated clearance, readiness or injury cutoffs.

**Directional-negative interpretation:** the frozen handstand-through-90° node describes a lowering-first direction. A bent-arm horizontal bottom cannot become locked-arm full Planche without active elbow extension. Its guide, label and protocol therefore explicitly show that lockout and the accompanying shoulder rise; the entire chain is never called purely eccentric. Its distinct protocol awards neither a full Planche push-up cycle nor a return-to-handstand repetition. The graph description/edges remain unchanged. Similarly, the straight-arm press keeps its own support/overhead/body-line links; it does not inherit bent-arm push or straddle-compression contribution merely from a prerequisite.

Owned motion preserves world bone lengths and fixed grips through all samples and interpolation. Both horizontal-only guides use a larger fixed skeleton to fill the player; dimensions never change within a guide. Independent review corrected the folded handstand entry and capacity links. Actual upper-arm/forearm versus thigh/shin separation is checked across entry, scored paths and exits; no upward eccentric recovery, wrong endpoint, forced assistance or missing active lockout remains. The review offers a deepest-position still from the same exact canonical pose data; moving guide/player always use the complete canonical sequence.

The preview also pins [candidateMotionFrame.css](../app/vnext/media/candidateMotionFrame.css): its grid sizing keeps the complete SVG inside the available phone frame. All fifteen portrait/short-portrait/landscape layouts, including SVG bounds, and running rotation pass. Full conditions remain in the review details; concise instructions remain in the player. This additive stylesheet is included only by the F preview today. **Combined activation must import this exact stylesheet in its media entry and bind it to the new artifact/review gate.** The accepted earlier review packages, shared renderer/player and production stylesheet remain unchanged.

`pnpm validate:vnext-batch-f` covers full references/graph, positive/negative eligibility/planning, no-opt-in/exact-goal gates, native v1–v7 protocol replay, candidate practice/save/retry/export/import, subsequent exact guided confirmation and physical media contracts. E regression, type checking, production isolation and an exact unchanged-A artifact check pass. `pnpm review:vnext-batch-f` builds the isolated exact-player review. Owner animation acceptance is **pending** and production is **disabled**. After review, combined-release preparation still needs its own approval; no deployment, scope expansion or cleanup is included.

## 1. Skill-definition model

Four versioned definition types carry the skill system:

| Definition | Responsibility |
|---|---|
| **Exercise Definition** | Stable ID; instructions/media; equipment; multi-role tags; supported skills/capacities; prescription variants; demand tags; benchmark links; regression/substitution relationships; safety notes. |
| **Development Graph** | One outcome family, foundation track or composite graph containing observable milestone nodes and directed prerequisite edges. Edges support simple `allOf` and limited `anyOf`, including cross-graph dependencies. |
| **Capacity Definition** | A small shared enabler with independently observable facets, benchmark references and links to multiple families. It is not a percentage score. |
| **Benchmark Protocol** | A versioned observation contract specifying movement/variation, metric, assistance/range, quality and safety criteria, and confirmation/freshness policy. |

Graph topology belongs only in Development Graph definitions. Do not duplicate progression links on Exercise Definitions. An exercise may support several graph nodes or capacities, but only an observable outcome or safety-critical milestone belongs in a visible graph.

## 2. Graph-wide rules

The system has five primary outcome families—Planche, L-Sit/V-Sit, Handstand Balance, Vertical Push/HSPU and Press to Handstand—plus a general Parallette Pushing foundation track and a cross-family Transitions graph. Pushing and Transitions are important, but they are not presented as equivalent single-destination skills.

- Graph nodes are observable outcomes or safety-critical milestones, not every drill.
- Foundation/intermediate/advanced labels help presentation; they are not comparable global athlete ranks.
- Edges express prerequisites, not a guarantee that every athlete must use the same drill sequence.
- Multiple branches may converge, and a transition may require milestones from several families.
- Higher demonstrated nodes may satisfy mechanically necessary predecessors for eligibility. Record those predecessors as **satisfied by higher evidence**, not as separately demonstrated achievements. Never fabricate unrelated safety or branch evidence.
- Generic support evidence never implies planche protraction or overhead-handstand readiness unless those facets were observed.
- Frog/crane work is useful balance and confidence practice, but it is not a mandatory straight-arm planche node.
- A user’s selected demand or goal never bypasses graph prerequisites, active restrictions, freshness rules or specialist opt-in.

## 3. Detailed graphs and tracks

### 3.1 Planche

**Entry prerequisites:** current upper-limb load availability; a straight-arm support/protraction benchmark; body-line control; progressive forward-load tolerance.

**Foundation:** active support → controlled planche-lean landmarks → toe-light/feet-assisted tuck loading.

**Intermediate:** tuck planche → stable tuck → advanced tuck → one-leg and assisted-straddle branches → straddle planche.

**Advanced:** stable straddle → full-planche-specific lever progressions → full planche.

**Specialist destinations:** an exact full-Planche push-up eccentric, the later concentric full Planche push-up and high-load dynamic planche transitions. The eccentric also requires the stronger-gated forward-loaded pushing landmark; generic floor-push strength is insufficient. Eccentric control never implies the concentric outcome.

Static straight-arm skill, dynamic planche-specific pressing and balance-confidence accessories are related but distinct branches. General support or pseudo-planche pressing alone does not demonstrate a planche milestone.

### 3.2 L-Sit / V-Sit

**Entry prerequisites:** current load availability and basic straight-arm support. Pike compression and hamstring/hip access progressively gate long-leg/full-L and V-sit nodes; they do not block foot-assisted support, tuck support or early knee-extension development.

**Foundation:** foot-assisted support/L-sit → tuck support → controlled knee/leg extensions.

**Intermediate:** one-leg and alternating work → full L-sit, whose protocol already requires separated-session confirmation. Straddle L-sit is a branch because individual mobility and anthropometry can make it different rather than universally harder; no duplicate “stable full L” node repeats the same fact.

**Advanced:** higher pike/straddle compression → high L-sit and V-sit preparations → assisted/partial V shapes → stable V-sit progression.

**Specialist destinations:** extended V-sit combinations, press connections and manna-specific development where appropriate.

### 3.3 Handstand Balance

Handstand is a multi-branch graph, not a single ladder:

- **Safety/inversion:** grounded bar-specific exit rehearsal → low-inversion supported exits → wall inverted-L/chest-to-wall tolerance → calm wall-height exits on both sides.
- **Line:** wall inverted-L alignment → chest-to-wall line → consistent stacked body shapes.
- **Entry:** standing line rehearsal → controlled wall entry → stop-short accuracy → repeatable freestanding entry.
- **Balance/pressure:** supported shifts → toe/heel pull-aways → parallette grip-pressure control → controlled short balances → repeatable freestanding balance → stable longer balance → the defined tuck shape change.
- **Weight transfer:** wall shifts → micro taps → controlled freestanding weight transfer → advanced two-arm asymmetry.

Freestanding work requires exit competence. Entry accuracy and balance duration are separate achievements. Handstand pressure control is a skill-specific subskill, not a generic capacity score.

**Specialist destination:** one-arm preparation and, only with explicit opt-in and stronger gates, one-arm handstand work.

### 3.4 Vertical Push / HSPU

**Entry prerequisites:** overhead range, active elevation, vertical-push capacity and safe inversion/exit for inverted variants.

**Foundation:** shallow pike push-up → full floor pike → deeper parallette pike → elevated pike strength.

**Intermediate:** deep/elevated pike → standard-depth wall bottom-position exit → full-range wall eccentric → assisted or partial-range concentric wall work → full wall HSPU. Deficit wall work has a second range-specific bottom-position/exit prerequisite because the standard bar-top landmark cannot prove a deeper bailout. Eccentric control never implies concentric capability.

**Advanced:** freestanding eccentric → partial freestanding HSPU → full freestanding HSPU → deficit freestanding development.

Wall strength can progress without freestanding balance. Freestanding HSPU requires the relevant balance and exit branch and must not unlock merely from strong pike pressing.

**Specialist destination:** 90-degree HSPU and similarly deep dynamic pressing. The 90-degree node requires both deficit freestanding HSPU control and the stronger-gated forward-loaded pushing landmark.

### 3.5 Press to Handstand

**Shared prerequisites:** straight-arm support; overhead access/control; pike or straddle compression; handstand line/safety appropriate to the variation; press-specific forward-loading technique.

**Foundation:** feet/elevated assisted press shapes, controlled compression-to-load drills and assisted eccentric patterns.

**Intermediate branches:**

- **Bent-arm/tuck press:** its own related branch.
- **Straight-arm straddle:** assisted straddle press → controlled negative → full straddle press.
- **Straight-arm pike:** higher compression demand → assisted pike press → full pike press.

Bent-arm press is not a required lower level of straight-arm press; the branches have different demands.

**Advanced destinations:** repeatable straight-arm straddle/pike press and press-to-handstand combinations.

**Specialist destinations:** repeated presses, advanced stalder-style entries and high-load planche/press combinations.

### 3.6 Parallette Pushing

This foundation track covers general horizontal pushing and remains distinct from planche-specific straight-arm strength and HSPU vertical strength.

**Foundation:** assisted/knee push-up → clean floor/parallette push-up → controlled increased range.

**Intermediate:** tempo/deficit pressing, staggered or asymmetrical control and pseudo-planche push-up development.

**Advanced:** deeper deficit and increasingly forward-loaded bent-arm pressing that meets explicit shoulder-control criteria.

**Specialist destinations:** planche push-ups and 90-degree-style transitions only after their cross-family prerequisites.

### 3.7 Transitions / Composite Skills

Transitions form a cross-family graph using `allOf` prerequisites:

- **Foundation:** support ↔ tuck; tuck ↔ single-leg/full L-sit; controlled entry → balance → safe exit.
- **Intermediate:** L-sit ↔ tuck planche; handstand → controlled lower; assisted press → handstand.
- **Advanced:** L-sit/straddle-L → press → handstand; handstand → controlled L-sit/press negative; planche/handstand connections where mechanically and safely appropriate.
- **Specialist:** high-load multi-skill sequences, full-planche transitions and 90-degree press combinations.

The generator must require each source and destination milestone plus the transition-specific benchmark. Possessing both endpoint skills does not demonstrate the transition.

## 4. Shared capacities

A capacity is retained only when it:

1. supports at least two skill families;
2. has an observable benchmark or useful qualitative finding; and
3. changes placement, eligibility or exercise selection.

| Capacity domain | Observable facets | Shared use |
|---|---|---|
| **Straight-arm support & protraction** | Independently benchmarked facets for tall/depressed support, scapular control and protracted forward loading. | Planche, L/V-sit, press foundations and support transitions. |
| **Overhead support & elevation** | Usable shoulder-flexion range under load, active elevation and stacked support. | Handstand, HSPU, press and advanced transitions. |
| **Horizontal bent-arm push** | Clean horizontal range, control and repeatable strength. | General pushing and exact dynamic Planche pressing. |
| **Vertical bent-arm push** | Clean pike/inverted pressing range, control and repeatable strength. | HSPU, bent-arm press and compound transitions. |
| **Pike compression/access** | Active pike lift/control together with the usable hamstring/hip range required by the task. | L/V-sit, pike press and transitions. |
| **Straddle compression/access** | Active straddle lift/control together with usable adductor/hip range. | Straddle L/V-sit and straddle press. |
| **Body-line/trunk control** | Hollow/arch integration, pelvic control and task-relevant anti-extension/rotation. | Every advanced family, especially handstand, planche and press. |

Upper-limb weight-bearing tolerance belongs primarily to current trainability plus versioned load benchmarks, not to a permanent capacity score. Inversion tolerance and safe exits are reusable safety benchmarks or milestones.

Straddle-planche shape may need hip-abduction access and body-line control, but it does not depend on the active hip-flexion compression used by straddle presses. Do not retain generic “proprioception,” “confidence” or “fatigue tolerance” as calculated capacities. Their effects appear through skill evidence, session feedback and current restrictions. Handstand bar-pressure control remains a Handstand graph node.

One benchmark may support several findings. For example, a straddle press target can require confirmed handstand safety/line, straight-arm support, straddle compression, overhead access and a press-specific assisted benchmark without inventing one combined press-readiness score.

Phase 2 retained exactly these seven domains and 21 facets; each capacity changes prerequisites in at least two graphs and every facet has a complete existing-content protocol. Every facet either changes explicit eligibility or has a documented selection use: `arch-control` deliberately selects posterior body-line accessories and dose but does not gate a universal skill outcome. Permanent load-tolerance, inversion-confidence, generic proprioception, confidence and fatigue-tolerance scores were rejected. Load availability stays in trainability/restrictions, safe exit stays in the Handstand graph, and fatigue effects stay in recent-load/session evidence.

Catalogue capacity links are deliberately narrower than display focus tags. They identify audited builders/selection inputs, not every movement that happens to share a word, equipment item or secondary focus. This prevents future restriction or capacity logic from treating wrist preparation as tall support, seated mobility as active compression, or overhead elevation as forward straight-arm loading.

## 5. Benchmark relationships

Every graph milestone consumed by placement, projection or planning needs a versioned protocol before it can carry authoritative meaning. The protocol owns:

- the exact exercise or variation;
- the observed metric;
- assistance, range and equipment conditions;
- quality and safety criteria;
- what result demonstrates versus merely estimates the node;
- confirmation requirements across attempts or separated sessions; and
- freshness/reconfirmation policy where safety or technical exposure warrants it.

Exact targets belong in protocols approved during graph/content work. A capacity drill is not automatically milestone evidence, and floor, parallettes or other-apparatus evidence is not assumed interchangeable when the protocol distinguishes it. Movement-type confirmation rules are canonical in [VNEXT_TRAINING_ENGINE.md](VNEXT_TRAINING_ENGINE.md); evidence authority and freshness storage are canonical in [VNEXT_DATA_MIGRATION.md](VNEXT_DATA_MIGRATION.md).

Catalogue v1 supplies 43 milestone protocols and 21 capacity-facet protocols. Catalogue v2 retains all 64 unchanged and adds 30 exact Phase 7 milestone protocols, for 94 total. Every protocol fixes one current exercise/prescription, apparatus, assistance, range, metric, quality and safety conditions plus accepted confirmation sources. Confirmation and freshness are movement-specific: multi-attempt safety exits, supported foundations, early entry drills and short balances may confirm in one guided-test session; repeatable strength, freestanding/repeatable entry and higher-load/balance outcomes require separated sessions; freshness appears only where safety or technical exposure warrants it. Only guided tests and Session Records may confirm. Missing-content nodes have no protocol. Because the Phase 1 contract deliberately gives a protocol one subject, Phase 3 defines deterministic reuse when one source observation informs more than one compatible finding; it never creates duplicate session truth or double-counts the same performance. Phase 7 needed no new reuse rule: the two shared-motion Press/transition pairs have deliberately distinct observable endpoints.

## 6. Exercise-role architecture

An Exercise Definition may carry several roles:

1. **Outcome milestone** — observable graph node.
2. **Benchmark/test** — standardised observation protocol.
3. **Development drill** — practises part of a future milestone.
4. **Capacity/accessory builder** — develops a shared enabler.
5. **Technique/safety drill** — line, entry, exit, pressure or controlled-fall practice.
6. **Preparation/recovery** — warm-up, active mobility, cooldown or reset.
7. **Conditioning** — general work not interpreted as skill evidence.

Regression and assistance are contextual relationships or prescription variants, never intrinsic exercise roles. Maintenance is a session purpose. Warm-up and cooldown are placement tags within preparation/recovery, not progression identities.

### 6.1 Structural treatment of the v1.2 catalogue

- **Retain:** stable, distinct warm-up/recovery movements; core/body-line work; base support; wall inversion/exit; clean push-up and pike-push pathways; useful compression drills; regressions; owned media.
- **Promote to graph nodes only when warranted:** only observable milestones from the graphs in Section 3.
- **Keep as capacity/accessory work:** most core, mobility, scapular and preparatory drills remain usable but leave the visible skill graph.
- **Correct misclassification:** frog/crane is not a planche progression; wrist/mobility paths are not standalone skills; linear predecessor links must not imply that every drill is a mandatory milestone.
- **Consolidate duplicated roles carefully:** retain a variation only when it offers a distinct equipment, load, regression, teaching or programming purpose.
- **Deprecate true dead ends after audit:** an exercise that neither tests an outcome, builds a retained capacity, provides a useful regression/accessory nor fits a session demand may leave new generation, but its historical ID remains readable.
- **Audit metadata:** roles, graph contribution, benchmark protocol, prerequisite references, assistance/range, low/moderate/high demand, substitution compatibility and definition version.

Catalogue size is not a target. Add content only when graph or generator coverage proves the need. Preserve stable exercise IDs and the owned-media/licensing policy; removed content must remain resolvable through aliases or tombstones.

## 7. Catalogue-v1 retained seeds and missing bridges

At the Phase 2 baseline, the v1.2 catalogue contained useful seeds but did not provide a coherent path through every proposed destination:

| Graph/track | Useful v1.2 seeds | Principal gap identified |
|---|---|---|
| **Planche** | Support/protraction, leans, toe-light/assisted tuck, floor tuck attempt, pseudo-planche press. | Benchmarked tuck → advanced tuck → one-leg/assisted straddle → stable straddle → full preparation/outcome; separate dynamic prerequisites. |
| **L/V-sit** | Assisted/tuck/one-leg/full attempts, assisted straddle, compression and tuck/L transitions. | Stable/extended/high L, higher compression and a real assisted-to-full V-sit branch. |
| **Handstand** | Wall line, entries/exits, pull-aways, pressure shifts, micro taps, kick-ups and entry–balance–exit chain. | Repeatable free-balance stages, longer stability, shapes and deeper weight transfer. |
| **HSPU** | Pike elevation/shrugs, shallow/floor/parallette pike and eccentric pike push. | Elevated/deep pike, wall eccentric/range, assisted concentric, full/deficit wall and freestanding eccentric/full. |
| **Press** | Compression, support/lean, handstand line and controlled lowering. | Assisted/eccentric press patterns, distinct straight-arm straddle/pike branches and full outcomes. |
| **Pushing** | Knee/floor/parallette push-ups, push-up plus, tempo/staggered and pseudo-planche work. | Deficit/range benchmarks, general-versus-planche transfer and advanced endpoints. |
| **Transitions** | Tuck/L transitions and entry–balance–exit chain. | L-sit ↔ planche, handstand lowering, L/straddle-L → press → handstand and advanced integrations. |

The Phase 2 definition audit must make the gap list concrete. Phase 7 fills only gaps that those definitions and the working planner show are necessary; it is not a licence for catalogue-led expansion.

The Phase 2 audit records 41 boundary-homogeneous content groups covering all 60 catalogue-v1 missing nodes exactly once. Phase 6 planner coverage selected 20 of those groups, and Phase 7 implemented their 30 automatic nodes without expanding the graph. The remaining registry now covers 21 groups/30 nodes: one automatic Planche preparation blocked behind a stronger-gated predecessor, every 19 stronger-gated node and every ten specialist nodes. The largest remaining gaps are therefore intentionally gated unassisted Planche/V-sit/Handstand/HSPU/Press outcomes, advanced transitions and specialist dynamic/one-arm/90-degree work—not holes in the normal automatic ceiling delivered for v2. The registry independently preserves programming boundary and content priority; catalogue v1 remains historical truth, while the current delivered/remaining split is canonical in [phase7Content.ts](../app/vnext/definitions/phase7Content.ts).

## 8. Advanced and specialist boundary

| Tier | Destinations and programming boundary |
|---|---|
| **Normal automatic programming** | Handstand line/entry/exit and two-arm balance development; controlled shapes/basic weight transfer; full/deficit wall HSPU and assisted/wall-started eccentric preparation; stable full L-sit and V-sit preparation; planche through advanced tuck plus assisted one-leg/straddle/full-specific work; assisted/eccentric straight-arm press development; controlled foundation/intermediate transitions. |
| **Stronger-gated automatic work** | Stable unassisted two-arm freestanding handstand and advanced weight transfer; unassisted freestanding HSPU eccentric/concentric attempts; unassisted straddle/full-planche attempts; unassisted V-sit and straight-arm press attempts; advanced inverted/planche transitions. These require explicit safety and capability benchmarks, fresh evidence and conservative load compatibility. |
| **Optional specialist pathways** | Full planche push-ups/dynamic planche, 90-degree HSPU, one-arm handstand preparation/one-arm work, repeated/advanced presses, manna-specific work and high-load multi-skill combinations. These are opt-in, may recommend qualified coaching and never appear as surprise workout content. |
| **Out of product scope** | Pulling skills/strength, ring skills, tumbling/ballistic acrobatics, comprehensive lower-body programming, clinical rehabilitation and injury diagnosis. |

The definition architecture may represent specialist nodes without requiring all specialist content in the first vNext release. The first content gate prioritises a coherent automatic ceiling over breadth.

Normal vNext assumes healthy adults using parallettes, floor and wall, with rope retained only as optional conditioning. Bands, boxes, pull-up bars or rings are explicit scope expansions, not silent prerequisites. Supporting minors, clinical rehabilitation or return-to-sport decisions would require a different screening, consent, load and safety design.

Phase 2 fixed this boundary in the versioned node definitions: automatic work may be planned only after ordinary prerequisites; stronger-gated nodes require the projector/planner’s fresh safety and capability checks; specialist nodes require explicit opt-in. Phase 7 implemented only the planner-proven automatic gate. Immutable catalogue v2 retains those gaps. Production catalogue v3 adds only Batch A's five approved stronger-gated nodes; assisted full Planche and all specialist content remain unavailable.
