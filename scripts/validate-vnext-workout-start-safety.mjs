import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const definitions = load("app/vnext/definitions/index.ts");
const projection = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const { batchFDefinitionHistory, batchFProjectionPolicy } = load("app/vnext/progression/batchF.ts");
const { safeWorkoutSwaps } = load("app/vnext/workoutUx.ts");
const athleteId = "workout-start-safety-test";
const asOf = "2026-10-20T08:00:00.000Z";
const intent = { schemaVersion: 1, athleteId, updatedAt: asOf,
  goals: [{ graphId: definitions.graphIds.parallettePushing, priority: "primary" }],
  equipment: ["floor", "parallettes", "wall", "rope"], defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false } };
let checks = 0;
const check = (label, body) => { body(); checks++; console.log(`PASS ${label}`); };
const project = (bundle, history, policy) => {
  const result = projection.projectAthleteState({ athleteId, asOf, policy, definitionBundles: history,
    evidenceEvents: [], sessionPlans: [], sessionRecords: [], intent,
    trainabilityRequests: planning.planningTrainabilityRequests(bundle) });
  assert(result.ok && result.state);
  return result.state;
};
const bundle = definitions.vNextDefinitionBundle;
const policy = projection.vNextProjectionPolicy;
const state = project(bundle, definitions.vNextDefinitionBundles, policy);
const generate = (definitionBundle = bundle, currentState = state, projectionPolicy = policy) =>
  planning.generateVNextSession({ createdAt: asOf, bundle: definitionBundle, state: currentState, intent,
    projectionPolicy, seed: "workout-start-safety" });
const generated = generate();
assert(generated.ok && generated.plan);
const input = { generated, bundle, state, intent, projectionPolicy: policy };
const pristine = JSON.stringify(input);

check("a fresh real Today plan and every short Custom duration remain usable", () => {
  assert.equal(validateWorkoutStart(input).allowed, true);
  for (const minutes of [5, 10, 15, 20]) {
    const custom = planning.generateVNextCustomSession({ createdAt: asOf, bundle, state, intent,
      projectionPolicy: policy, seed: `custom-${minutes}` }, minutes);
    assert(custom.ok && custom.plan);
    assert.equal(validateWorkoutStart({ ...input, generated: custom }).allowed, true);
  }
});
check("fresh alternatives are rechecked and fabricated cached options are rejected", () => {
  const safe = validateWorkoutStart(input);
  const [id, options] = Object.entries(safe.swapOptions).find(([, entries]) => entries.length);
  assert.equal(validateWorkoutStart({ ...input, selections: { [id]: options[0] } }).allowed, true);
  assert.equal(validateWorkoutStart({ ...input, selections: { [id]: {
    exerciseId: "not-a-movement", exerciseDefinitionVersion: 1, prescriptionVariantId: "fake" } } }).allowed, false);
  assert.equal(validateWorkoutStart({ ...input, selections: { "not-in-plan": options[0] } }).allowed, false);
});
check("missing current equipment blocks saved plans without changing their immutable bytes", () => {
  const result = validateWorkoutStart({ ...input, intent: { ...intent, equipment: [] } });
  assert.equal(result.allowed, false);
  assert(result.issues.some((issue) => /equipment/u.test(issue.message)));
});

// Use the real evaluator and authored prescriptions with an explicit established
// fixture to isolate a changing safety condition from placement prerequisites.
const allCurrent = { ...state, nodeStates: bundle.graphs.flatMap((graph) => graph.nodes.map((node) => ({
  milestone: { graphId: graph.id, nodeId: node.id }, lifecycle: "established", confidence: "current",
  satisfiedForEligibilityBy: [], supportingObservationRefs: [], reasonCodes: [],
}))) };
const single = (exerciseId, variantIndex = 0) => {
  const exercise = bundle.exercises.find((candidate) => candidate.id === exerciseId);
  assert(exercise);
  const variant = exercise.prescriptionVariants[variantIndex];
  const link = exercise.graphLinks.find((entry) => entry.nodeId);
  const item = { id: `item-${exerciseId}`, exerciseId, exerciseDefinitionVersion: exercise.definitionVersion,
    prescriptionVariantId: variant.id, purpose: "primary-development", plannedSeconds: 240,
    demand: variant.demand, ...(link ? { targetMilestone: { graphId: link.graphId, nodeId: link.nodeId } } : {}) };
  const evaluation = projection.evaluateTrainability({ request: item, state: allCurrent, bundle, asOf, policy, intent });
  assert.equal(evaluation.decision, "allow");
  const result = { ...generated, plan: { ...generated.plan, items: [item], intendedDurationSeconds: 240 },
    trainabilityUsed: [evaluation] };
  return { ...input, state: allCurrent, generated: result };
};
const demanding = single("planche-lean-hold");
const demandItem = demanding.generated.plan.items[0];
const restricted = { ...allCurrent, activeRestrictions: [{ source: { kind: "evidence-event", eventId: "new-restriction" },
  decision: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["wrist"], occurredAt: asOf,
  reasonCodes: ["active-restriction"] }] };
check("a newly synced block or modification stops the previous prescription", () => {
  assert.equal(validateWorkoutStart({ ...demanding, state: restricted }).allowed, false);
  const modify = { ...restricted, activeRestrictions: restricted.activeRestrictions.map((entry) => ({ ...entry, decision: "modify" })) };
  assert.equal(validateWorkoutStart({ ...demanding, state: modify }).allowed, false);
});
check("new high load and newly stale confidence require a fresh dose", () => {
  const loaded = { ...allCurrent, recentLoad: { ...allCurrent.recentLoad, exposures: [{
    source: { kind: "evidence-event", eventId: "other-device-session" }, occurredAt: asOf,
    participationSeconds: 60, demand: demandItem.demand,
  }] } };
  assert.equal(validateWorkoutStart({ ...demanding, state: loaded }).allowed, false);
  const stale = { ...allCurrent, nodeStates: allCurrent.nodeStates.map((entry) => ({ ...entry, confidence: "stale" })) };
  assert.equal(validateWorkoutStart({ ...demanding, state: stale }).allowed, false);
});
check("a current safe swap cannot hide a newly unavailable chosen movement", () => {
  const options = safeWorkoutSwaps({ ...demanding, plan: demanding.generated.plan, item: demandItem });
  const option = options.find((candidate) => candidate.exerciseId !== demandItem.exerciseId);
  assert(option);
  const selected = { ...demanding, selections: { [demandItem.id]: option } };
  assert.equal(validateWorkoutStart(selected).allowed, true);
  assert.equal(validateWorkoutStart({ ...selected, state: restricted }).allowed, false);
});
check("remaining-work checks preserve performed facts and cannot authorize a rewind past a block", () => {
  const safeItem = generated.plan.items.find((item) => item.purpose === "recovery");
  assert(safeItem);
  const combined = { ...demanding.generated, plan: { ...demanding.generated.plan, items: [demandItem, safeItem] } };
  const active = { ...demanding, generated: combined, state: restricted };
  const before = JSON.stringify(active);
  assert.equal(validateWorkoutStart({ ...active, planItemIds: [safeItem.id] }).allowed, true);
  assert.equal(validateWorkoutStart({ ...active, planItemIds: [demandItem.id, safeItem.id] }).allowed, false);
  assert.equal(JSON.stringify(active), before);
});
check("two independently available high-load changes still fail whole-session compatibility", () => {
  const other = single("parallette-pike-pushup");
  const combined = { ...demanding.generated, plan: { ...demanding.generated.plan,
    items: [...demanding.generated.plan.items, ...other.generated.plan.items] },
    trainabilityUsed: [...demanding.generated.trainabilityUsed, ...other.generated.trainabilityUsed] };
  assert.equal(validateWorkoutStart({ ...demanding, generated: combined }).allowed, false);
});
check("native catalogues 1–8 remain resolvable under refreshed current state", () => {
  const currentBundle = batchFDefinitionHistory.at(-1);
  const currentState = project(currentBundle, batchFDefinitionHistory, batchFProjectionPolicy);
  for (const native of batchFDefinitionHistory) {
    const nativeState = project(native, batchFDefinitionHistory.filter((entry) => entry.catalogueVersion <= native.catalogueVersion), batchFProjectionPolicy);
    const nativePlan = generate(native, nativeState, batchFProjectionPolicy);
    assert(nativePlan.ok && nativePlan.plan);
    const result = validateWorkoutStart({ generated: nativePlan, bundle: native, state: currentState, intent,
      projectionPolicy: batchFProjectionPolicy });
    assert.equal(result.allowed, true, `Catalogue ${native.catalogueVersion}: ${JSON.stringify(result.issues)}`);
  }
});
check("fresh experienced and advanced plans across all seven families keep their permitted high-load work", () => {
  const currentBundle = batchFDefinitionHistory.at(-1);
  const blankState = project(currentBundle, batchFDefinitionHistory, batchFProjectionPolicy);
  const advancedState = { ...blankState,
    nodeStates: currentBundle.graphs.flatMap((graph) => graph.nodes.map((node) => ({
      milestone: { graphId: graph.id, nodeId: node.id }, lifecycle: "established", confidence: "current",
      satisfiedForEligibilityBy: [], supportingObservationRefs: [], reasonCodes: [],
    }))),
    capacityFindings: blankState.capacityFindings.map((finding) => ({ ...finding,
      finding: "demonstrated", confirmationSatisfied: true, confidence: "current" })),
  };
  let generatedCount = 0;
  for (const graph of currentBundle.graphs) for (const sessionDemand of ["technique", "standard", "challenge"]) {
    const goalIntent = { ...intent, goals: [{ graphId: graph.id, priority: "primary" }] };
    const workout = planning.generateVNextSession({ createdAt: asOf, bundle: currentBundle, state: advancedState,
      intent: goalIntent, projectionPolicy: batchFProjectionPolicy, sessionDemand, seed: `advanced-${graph.id}-${sessionDemand}` });
    assert(workout.ok && workout.plan, `Advanced fixture ${graph.id}/${sessionDemand} must generate a workout`);
    const result = validateWorkoutStart({ generated: workout, bundle: currentBundle, state: advancedState,
      intent: goalIntent, projectionPolicy: batchFProjectionPolicy });
    assert.equal(result.allowed, true, `${graph.id}/${sessionDemand}: ${JSON.stringify(result.issues)}`);
    generatedCount++;
  }
  assert.equal(generatedCount, 21);
});
assert.equal(JSON.stringify(input), pristine, "Safety checking must not mutate the plan, intent or projection");
console.log(`Workout start safety: ${checks} focused scenarios passed.`);
