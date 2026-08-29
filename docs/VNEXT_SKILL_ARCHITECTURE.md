# Parallette25 vNext Skill Architecture

**Status:** APPROVED FOUNDATION — PHASE 11 RELEASE ONLY; SKILL ARCHITECTURE FROZEN

**Implementation authorised:** NO ARCHITECTURE OR CONTENT CHANGES — PHASE 11 RELEASE ONLY

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

Phase 2 fixed this boundary in the versioned node definitions: automatic work may be planned only after ordinary prerequisites; stronger-gated nodes require the projector/planner’s fresh safety and capability checks; specialist nodes require explicit opt-in. Phase 7 implemented only the planner-proven automatic gate. Stronger-gated and specialist content remains absent, and the one automatic assisted-full-Planche node stays honestly unavailable because its stable-straddle prerequisite is stronger-gated and still content-free.
