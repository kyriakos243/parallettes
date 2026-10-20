import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const { trainingQualityCatalogue: catalogue } = load("app/vnext/production/trainingQuality.ts");
const { generateProgressionSessionPlan, generateProgressionCustomPlan,
  generateTrainingQualitySessionPlan } = load("app/vnext/planning/feedbackDose.ts");
const { planEmphasis } = load("app/vnext/planning/emphasis.ts");
const { composeSession } = load("app/vnext/planning/composer.ts");
const { buildTodayWorkoutPresentation } = load("app/vnext/presentation/today.ts");
const { projectAthleteState, evaluateTrainability } = load("app/vnext/projection/index.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId, recommendProgressionCheck,
  createRestrictionReport } = load("app/vnext/assessment/index.ts");
const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const { validateSessionPlan } = load("app/vnext/validation.ts");
const { milestoneIsSatisfied } = load("app/vnext/planning/prerequisites.ts");
const { canonicalJson } = load("app/vnext/persistence/index.ts");
const bundle = catalogue.bundle;
const day = 86_400_000;
const now = Date.parse("2026-10-20T09:00:00.000Z");
const iso = (time) => new Date(time).toISOString();
const metric = (protocol) => protocol.metric.kind === "duration-seconds" ? { value: protocol.metric.minimum, unit: "seconds" }
  : protocol.metric.kind === "repetitions" ? { value: protocol.metric.minimum, unit: "repetitions" }
    : protocol.metric.kind === "successful-attempts" ? { value: protocol.metric.minimumSuccessful,
      unit: "attempts", attemptsTotal: protocol.metric.maximumAttempts } : undefined;

const fixture = (graphId, targetNodeId, explicit = true) => {
  const athleteId = `progression-${graphId}`;
  const events = [];
  const seen = new Set();
  const intent = { schemaVersion: 1, athleteId, updatedAt: iso(now - 30 * day),
    goals: [{ graphId, priority: "primary", ...(explicit ? { targetNodeId } : {}) }],
    equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard",
    preferences: { specialistOptIn: false } };
  const protocolFor = (graph, node) => bundle.benchmarkProtocols.find((protocol) =>
    protocol.subject.kind === "milestone" && protocol.subject.milestone.graphId === graph && protocol.subject.milestone.nodeId === node);
  const confirmProtocol = (protocol, lastAt = now - 3 * day) => {
    assert(protocol);
    if (seen.has(protocol.id)) return;
    seen.add(protocol.id);
    const count = Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions);
    for (let index = 0; index < count; index++) {
      const occurredAt = iso(lastAt - (count - index - 1) * day);
      events.push(createGuidedProtocolEvidence(athleteId, bundle, {
        eventId: `${athleteId}-${events.length + 1}`, observationSessionId: guidedObservationOccasionId(athleteId, occurredAt),
        protocolId: protocol.id, occurredAt, recordedAt: occurredAt, outcome: "clean",
        qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true,
        ...(metric(protocol) ? { measurement: metric(protocol) } : {}),
      }));
    }
  };
  const confirmRef = (ref) => {
    if (ref.kind === "milestone") return confirmNode(ref.milestone.graphId, ref.milestone.nodeId);
    if (ref.kind === "benchmark") return confirmProtocol(bundle.benchmarkProtocols.find((protocol) => protocol.id === ref.benchmarkProtocolId));
    const facet = bundle.capacities.find((capacity) => capacity.id === ref.capacity.capacityId)
      ?.facets.find((candidate) => candidate.id === ref.capacity.facetId);
    confirmProtocol(bundle.benchmarkProtocols.find((protocol) => protocol.id === facet?.benchmarkProtocolIds[0]));
  };
  const confirmPrerequisites = (graph, nodeId) => {
    const node = bundle.graphs.find((candidate) => candidate.id === graph)?.nodes.find((candidate) => candidate.id === nodeId);
    assert(node);
    (node.prerequisiteRule?.allOf ?? []).forEach(confirmRef);
    if (node.prerequisiteRule?.anyOf?.length) confirmRef(node.prerequisiteRule.anyOf[0]);
  };
  const confirmNode = (graph, nodeId) => {
    confirmPrerequisites(graph, nodeId);
    confirmProtocol(protocolFor(graph, nodeId));
  };
  confirmPrerequisites(graphId, targetNodeId);
  const input = (extra = {}) => {
    const asOf = extra.asOf ?? iso(now);
    const chosenIntent = extra.intent ?? intent;
    const projected = projectAthleteState({ athleteId, asOf, policy: catalogue.projectionPolicy,
      definitionBundles: catalogue.history, evidenceEvents: events, sessionPlans: [], sessionRecords: [], intent: chosenIntent });
    assert(projected.ok, JSON.stringify(projected.issues));
    return { createdAt: asOf, state: projected.state, bundle, intent: chosenIntent,
      projectionPolicy: catalogue.projectionPolicy, seed: "progression-recovery-fixture", ...extra };
  };
  return { input, events, intent, confirmNode, protocolFor, confirmProtocol };
};
const verifyPlan = (input, generated) => {
  assert(generated.ok && generated.plan, JSON.stringify(generated.issues));
  assert.equal(generated.plan.generatorPolicyVersion, 4);
  assert(validateSessionPlan(generated.plan, bundle).valid);
  const gate = validateWorkoutStart({ ...input, generated });
  assert(gate.allowed, JSON.stringify(gate.issues));
};

// All seven families preserve explicit paths and return a check for the actual
// unfinished goal. Only measured prerequisites exist; the target is not awarded.
for (const [graphId, target] of [
  ["planche", "toe-light-planche-loading"],
  ["l-sit-v-sit", "controlled-leg-extensions"],
  ["handstand-balance", "low-inversion-side-exit"],
  ["vertical-push-hspu", "floor-pike-push-up"],
  ["press-to-handstand", "assisted-bent-arm-tuck-press"],
  ["parallette-pushing", "tempo-push-up"],
  ["transitions", "tuck-to-one-leg-l-sit"],
]) {
  const f = fixture(graphId, target);
  const input = f.input();
  const before = canonicalJson({ events: f.events, state: input.state, intent: input.intent });
  const generated = generateProgressionSessionPlan(input);
  assert.equal(generated.emphasis.primary.targetMilestone.nodeId, target, `${graphId}: unfinished target must outrank a satisfied parent`);
  verifyPlan(input, generated);
  assert(!milestoneIsSatisfied({ graphId, nodeId: target }, input));
  const check = recommendProgressionCheck({ ...input, generated, hasPracticeHistory: true, evidenceEvents: f.events });
  assert.equal(check?.offer.subject.milestone?.nodeId, target, `${graphId}: useful next check`);
  assert.equal(check?.offer.availability, "available", `${graphId}: confirmed earlier safety permits exact check`);
  assert.equal(canonicalJson({ events: f.events, state: input.state, intent: input.intent }), before, "Planning never modifies evidence/intent/projection");
  assert.equal(canonicalJson(generateProgressionSessionPlan(input)), canonicalJson(generated), "Repeat generation is deterministic");
  for (const sessionDemand of ["technique", "challenge"]) {
    const result = generateProgressionSessionPlan({ ...input, sessionDemand });
    assert.equal(result.emphasis.primary.targetMilestone.nodeId, target, "Demand cannot change the eligible target");
    verifyPlan({ ...input, sessionDemand }, result);
  }
  for (const minutes of [5, 20]) {
    const custom = generateProgressionCustomPlan(input, minutes);
    verifyPlan(input, custom);
    assert.equal(custom.emphasis.primary.targetMilestone.nodeId, target);
    assert(custom.plan.intendedDurationSeconds <= minutes * 60);
  }
}

// The actual branching defect: established controlled pushing stays in the
// working-node list, but its trainable Tempo successor must win without a target.
const pushing = fixture("parallette-pushing", "tempo-push-up", false);
const ready = pushing.input();
const native = generateTrainingQualitySessionPlan(ready);
assert.equal(native.emphasis.primary.targetMilestone.nodeId, "controlled-parallette-push-up", "Native generator3 keeps its exact ordering");
assert.equal(native.plan.generatorPolicyVersion, 3);
const progressed = generateProgressionSessionPlan(ready);
assert.equal(progressed.emphasis.primary.targetMilestone.nodeId, "tempo-push-up");
const currentRef = { graphId: "parallette-pushing", nodeId: "controlled-parallette-push-up" };
assert(ready.state.workingNodes.some((item) => item.milestone.nodeId === currentRef.nodeId), "Fixture includes the masking established parent");
assert(milestoneIsSatisfied(currentRef, ready));

// If only the old parent is selected explicitly, it remains the goal; no harder
// child is silently substituted.
const fixedGoal = pushing.input({ intent: { ...pushing.intent, goals: [{ graphId: currentRef.graphId,
  targetNodeId: currentRef.nodeId, priority: "primary" }] } });
assert.equal(generateProgressionSessionPlan(fixedGoal).emphasis.primary.targetMilestone.nodeId, currentRef.nodeId);

// A stale parent retains reconfirmation precedence over a nominal child.
const stale = { ...ready, state: { ...ready.state, nodeStates: ready.state.nodeStates.map((item) =>
  item.milestone.nodeId === currentRef.nodeId ? { ...item, confidence: "stale" } : item) } };
assert.equal(planEmphasis({ ...stale, preferUnfinishedTargets: true }).emphasis.primary.kind, "reconfirmation");
assert.equal(planEmphasis({ ...stale, preferUnfinishedTargets: true }).emphasis.primary.targetMilestone.nodeId, currentRef.nodeId);

const advancedGoal = fixture("planche", "toe-light-planche-loading");
const advancedInput = advancedGoal.input({ intent: { ...advancedGoal.intent,
  goals: [{ graphId: "planche", targetNodeId: "full-planche", priority: "primary" }] } });
assert.equal(generateProgressionSessionPlan(advancedInput).emphasis.primary.targetMilestone.nodeId, "toe-light-planche-loading",
  "A stronger destination still follows the actual eligible frontier");
const specialistGoal = fixture("planche", "full-planche-push-up-eccentric");
const specialistInput = specialistGoal.input();
const ordinary = generateProgressionSessionPlan(specialistInput);
assert.notEqual(ordinary.emphasis.primary.targetMilestone?.nodeId, "full-planche-push-up-eccentric",
  "Even confirmed specialist prerequisites do not imply specialist opt-in");
assert(!(ordinary.plan?.items ?? []).some((item) => item.targetMilestone?.nodeId === "full-planche-push-up-eccentric"));

// Existing restrictions cannot be overridden by preferring unfinished work.
pushing.events.push(createRestrictionReport({ eventId: "progression-wrist-hold", athleteId: pushing.intent.athleteId,
  occurredAt: iso(now), recordedAt: iso(now), catalogueVersion: bundle.catalogueVersion,
  severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["wrist"] }));
const held = pushing.input();
const blocked = generateProgressionSessionPlan(held);
assert(!(blocked.plan?.items ?? []).some((item) => item.targetMilestone?.nodeId === "tempo-push-up"));
assert(!buildTodayWorkoutPresentation({ bundle, generated: blocked }).reason.includes("recovery day"),
  "Active restrictions are not explained away as ordinary recovery");

// Focused composition proves the recovery message's actual cause: a recently
// trained high-load target and no useful lighter block in this requested scope.
const recovering = fixture("parallette-pushing", "staggered-parallette-push-up");
const base = recovering.input();
const controlledProtocol = recovering.protocolFor("parallette-pushing", currentRef.nodeId);
const exercise = bundle.exercises.find((item) => item.id === controlledProtocol.exerciseId);
const variant = exercise.prescriptionVariants.find((item) => item.id === controlledProtocol.prescriptionVariantId);
const exposure = { ...base.state.recentLoad.exposures.find((item) => item.exerciseId === exercise.id), occurredAt: iso(now - 3600000) };
assert(exposure.source, "Fixture has a real evidence-derived exposure");
const recoveryInput = { ...base, preferUnfinishedTargets: true, state: { ...base.state,
  recentLoad: { ...base.state.recentLoad, exposures: [...base.state.recentLoad.exposures, exposure] } } };
assert(evaluateTrainability({ request: { exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion,
  prescriptionVariantId: variant.id }, ...recoveryInput, asOf: recoveryInput.createdAt, policy: catalogue.projectionPolicy })
  .reasonCodes.includes("recent-high-load"));
const recoveryFocus = { graphId: currentRef.graphId, targetMilestone: currentRef, kind: "development",
  missingPrerequisites: [], reasonCodes: [], userMessage: "Practise controlled pushing." };
const recovery = composeSession(recoveryInput, { primary: recoveryFocus, maintenance: [], deferredGraphIds: [],
  goalSignature: "recovery-check", retainedFromPrevious: false, reasonCodes: [] });
assert(!recovery.ok);
assert(buildTodayWorkoutPresentation({ bundle, generated: recovery }).reason.includes("recovery day"));
recovering.events.push(createRestrictionReport({ eventId: "progression-recovery-wrist-hold", athleteId: recovering.intent.athleteId,
  occurredAt: iso(now), recordedAt: iso(now), catalogueVersion: bundle.catalogueVersion,
  severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["wrist"] }));
const heldRecoveryBase = recovering.input();
const heldRecoveryInput = { ...heldRecoveryBase, preferUnfinishedTargets: true,
  state: { ...heldRecoveryBase.state, recentLoad: recoveryInput.state.recentLoad } };
const heldRecovery = composeSession(heldRecoveryInput, { primary: recoveryFocus, maintenance: [], deferredGraphIds: [],
  goalSignature: "held-recovery-check", retainedFromPrevious: false, reasonCodes: [] });
assert(!heldRecovery.ok);
assert(!buildTodayWorkoutPresentation({ bundle, generated: heldRecovery }).reason.includes("recovery day"),
  "A simultaneous restriction takes precedence over ordinary recovery advice");
const fallbackInput = { ...recoveryInput, intent: { ...recoveryInput.intent,
  goals: [{ graphId: currentRef.graphId, priority: "primary" }] } };
const fallback = generateProgressionSessionPlan(fallbackInput);
verifyPlan(fallbackInput, fallback);
assert.equal(fallback.emphasis.primary.targetMilestone.nodeId, "knee-push-up", "Prefer an actually safe established fallback to an unavailable harder step");
assert(!fallback.plan.items.some((item) => item.demand["horizontal-bent-arm-push"] === "high"),
  "A useful recovery fallback does not relax high-load exclusion");
const laterAt = iso(now + 48 * 3600000);
const later = { ...fallbackInput, createdAt: laterAt, state: { ...fallbackInput.state, asOf: laterAt } };
const next = generateProgressionSessionPlan(later);
assert.equal(next.emphasis.primary.targetMilestone.nodeId, "tempo-push-up", "Recovery fallback does not trap the athlete on the old parent");
assert.equal(recommendProgressionCheck({ ...later, generated: next, hasPracticeHistory: true }).offer.availability, "available");
assert.equal(canonicalJson(generateTrainingQualitySessionPlan(ready)), canonicalJson(native), "Native generator3 remains byte-identical after current generation");
console.log("Progression/recovery: seven families, guided checks, demand, Today/Custom, branches, explicit/stronger/specialist targets, stale/restricted safety, recovery fallback/reason and native generator3 passed.");
