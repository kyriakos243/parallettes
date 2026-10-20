import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const { restrictionSafetyCatalogue: catalogue, restrictionExposureAudit } = load("app/vnext/production/restrictionSafety.ts");
const { experiencedPlacementCatalogue: previous } = load("app/vnext/production/experiencedPlacement.ts");
const { projectAthleteState, evaluateTrainability, restrictionExposureDomains } = load("app/vnext/projection/index.ts");
const { planningTrainabilityRequests } = load("app/vnext/planning/index.ts");
const { generateMixedVNextSession, generateMixedVNextCustomSession } = load("app/vnext/planning/mixed.ts");
const { safeWorkoutSwaps } = load("app/vnext/workoutUx.ts");
const assessment = load("app/vnext/assessment/index.ts");
const { bundle, history, projectionPolicy } = catalogue;
const originalDefinitions = JSON.stringify(history);
const originalPolicy = JSON.stringify(previous.projectionPolicy);
const asOf = "2026-10-20T12:00:00.000Z";
const athleteId = "restriction-exposure-audit";
const intentFor = (graphId = "parallette-pushing") => ({ schemaVersion: 1, athleteId, updatedAt: asOf,
  goals: [{ graphId, priority: "primary" }], equipment: ["floor", "parallettes", "wall"],
  defaultSessionDemand: "standard", preferences: { specialistOptIn: false } });
const report = { schemaVersion: 1, id: "wrist-report", athleteId, occurredAt: asOf, recordedAt: asOf,
  source: "athlete-report", catalogueVersion: bundle.catalogueVersion, type: "restriction_reported",
  severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["left wrist"] };
const stateFor = (intent, policy = projectionPolicy, events = [report]) => {
  const result = projectAthleteState({ athleteId, asOf, policy, definitionBundles: history,
    evidenceEvents: events, sessionPlans: [], sessionRecords: [], intent,
    trainabilityRequests: planningTrainabilityRequests(bundle) });
  assert(result.ok && result.state, JSON.stringify(result.issues));
  return result.state;
};
const requestFor = (exercise, variant) => ({ exerciseId: exercise.id,
  exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id });
const exerciseFor = (id) => { const value = bundle.exercises.find((item) => item.id === id); assert(value, id); return value; };
const intent = intentFor();
const restricted = stateFor(intent);
const unrestricted = stateFor(intent, projectionPolicy, []);
const oldRestricted = stateFor(intent, previous.projectionPolicy);
const oldUnrestricted = stateFor(intent, previous.projectionPolicy, []);
const evaluate = (exercise, variant, state = restricted, policy = projectionPolicy) =>
  evaluateTrainability({ request: requestFor(exercise, variant), state, bundle, asOf, policy, intent });

assert.equal(projectionPolicy.version, 10);
assert.equal(previous.projectionPolicy.version, 9);
assert.equal(catalogue.bundle, previous.bundle, "No new catalogue or silent change to historical definitions");
assert.equal(catalogue.history, previous.history);
assert.deepEqual(unrestricted.nodeStates, oldUnrestricted.nodeStates, "Achievement projection is unchanged");
assert.deepEqual(unrestricted.capacityFindings, oldUnrestricted.capacityFindings);

// Original bug, including the knee regression: low wrist load is still actual bearing.
const scap = exerciseFor("scap-pushup");
assert.equal(scap.prescriptionVariants[0].demand["hand-wrist-bearing"], "low");
assert.equal(evaluate(scap, scap.prescriptionVariants[0], oldRestricted, previous.projectionPolicy).decision, "allow");
for (const variant of scap.prescriptionVariants) assert.equal(evaluate(scap, variant).decision, "block");

let auditedVariants = 0;
const auditedIds = new Set(restrictionExposureAudit.flatMap((group) => group.exerciseIds));
assert.equal(auditedIds.size, restrictionExposureAudit.reduce((sum, group) => sum + group.exerciseIds.length, 0));
for (const id of auditedIds) {
  const exercise = exerciseFor(id);
  for (const variant of exercise.prescriptionVariants) {
    auditedVariants++;
    const result = evaluate(exercise, variant);
    assert.equal(result.decision, "block", `${id}/${variant.id} retains hand support`);
    assert(result.reasonCodes.includes("active-restriction"), `${id} must be blocked by the restriction itself`);
    assert.deepEqual(evaluate(exercise, variant, unrestricted), evaluate(exercise, variant, oldUnrestricted, previous.projectionPolicy),
      `${id}: no changed progression or training classification without a restriction`);
  }
}

// The whole available catalogue is checked: existing moderate/high bearing is still blocked.
for (const exercise of bundle.exercises) for (const variant of exercise.prescriptionVariants) {
  if (["moderate", "high"].includes(variant.demand["hand-wrist-bearing"])) {
    assert(evaluate(exercise, variant).reasonCodes.includes("active-restriction"));
  }
}
// Nearby movement names must not cause blanket blocking of hands-off recovery or core.
for (const id of ["shoulder-sweep", "dead-bug", "hollow-tuck", "standing-kickup-line-rehearsal", "floor-tuck-v-sit-balance", "supine-hamstring-stretch", "wrist-circles", "forearms-parallette-prayer-rock"]) {
  const exercise = exerciseFor(id);
  for (const variant of exercise.prescriptionVariants) assert(!evaluate(exercise, variant).reasonCodes.includes("active-restriction"), `${id} is not hand-bearing`);
}
const scapRequest = requestFor(scap, scap.prescriptionVariants[0]);
assert(!restrictionExposureDomains({ ...scapRequest, exerciseDefinitionVersion: 99 }, scap.prescriptionVariants[0].demand, projectionPolicy).has("hand-wrist-bearing"), "Overrides cannot silently cross definition versions");
assert(!restrictionExposureDomains({ ...scapRequest, prescriptionVariantId: "future-hands-off" }, scap.prescriptionVariants[0].demand, projectionPolicy).has("hand-wrist-bearing"), "New variants require a fresh audit");
const modifiedState = stateFor(intent, projectionPolicy, [{ ...report, severity: "modify" }]);
assert.equal(evaluate(scap, scap.prescriptionVariants[0], modifiedState).decision, "modify", "Respect the recorded restriction severity");

let plans = 0;
let unavailable = 0;
let swaps = 0;
const assertSafePlan = (generated, input) => {
  if (!generated.ok || !generated.plan) { unavailable++; return; }
  plans++;
  for (const item of generated.plan.items) {
    const exercise = exerciseFor(item.exerciseId);
    const variant = exercise.prescriptionVariants.find((value) => value.id === item.prescriptionVariantId);
    assert(!auditedIds.has(exercise.id), `Restricted bearing leaked into plan: ${exercise.id}`);
    assert.equal(variant.demand["hand-wrist-bearing"], "low");
    for (const alternative of safeWorkoutSwaps({ plan: generated.plan, item, bundle, state: input.state,
      intent: input.intent, projectionPolicy })) {
      swaps++;
      const alternativeExercise = exerciseFor(alternative.exerciseId);
      const alternativeVariant = alternativeExercise.prescriptionVariants.find((value) => value.id === alternative.prescriptionVariantId);
      assert(!auditedIds.has(alternative.exerciseId), `Restricted bearing leaked into swap: ${alternative.exerciseId}`);
      assert.equal(alternativeVariant.demand["hand-wrist-bearing"], "low");
    }
  }
};
for (const graph of bundle.graphs) for (const demand of ["technique", "standard", "challenge"]) {
  const userIntent = intentFor(graph.id);
  const input = { createdAt: asOf, bundle, intent: userIntent, state: stateFor(userIntent), projectionPolicy,
    sessionDemand: demand, seed: `restricted-${graph.id}-${demand}` };
  assertSafePlan(generateMixedVNextSession(input), input);
  for (const minutes of [5, 10, 15, 20]) assertSafePlan(generateMixedVNextCustomSession(input, minutes), input);
  for (const capacityIds of [["body-line-control"], ["pike-compression", "straddle-compression"]]) {
    assertSafePlan(generateMixedVNextCustomSession(input, 10, { label: "Focused safe work", capacityIds }), input);
  }
}
assert(plans > 0, "Unrelated safe work must remain available");

// The guided-offer surface uses the same current projected safety finding.
const lowExit = bundle.benchmarkProtocols.find((protocol) => protocol.exerciseId === "grounded-side-exit-rehearsal");
assert(lowExit, "Grounded exit fixture exists");
let draft = assessment.createAssessmentDraft({ id: "restriction-check", athleteId, createdAt: asOf,
  bundle, mode: "targeted-reconfirmation", existingIntent: intent,
  existingState: restricted, placementVersion: 2 });
draft = { ...draft, targetedProtocolIds: [lowExit.id] };
for (let steps = 0; assessment.nextAssessmentStep(draft, bundle).kind !== "review"; steps++) {
  assert(steps < 12, "Guided fixture must reach review");
  const step = assessment.nextAssessmentStep(draft, bundle);
  const kind = step.kind;
  const answer = kind === "safety" ? { kind, severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["left wrist"] }
    : kind === "experience" ? { kind, experience: "experienced" }
      : kind === "inactivity" ? { kind, inactivity: "active" }
        : kind === "inversion" ? { kind, familiarity: "freestanding" }
          : kind === "anchor" ? { kind, response: "not-sure" }
            : kind === "goals" ? { kind, graphIds: ["handstand-balance"] }
              : kind === "equipment" ? { kind, equipment: intent.equipment }
                : { kind, graphId: step.graphId, response: "not-sure" };
  draft = assessment.answerAssessmentStep(draft, answer, asOf, bundle);
}
const offer = assessment.buildAssessmentReview(draft, bundle, restricted).guidedTests.find((value) => value.protocolId === lowExit.id);
assert(offer && offer.availability === "blocked" && offer.blockers.includes("active-restriction"), "Guided checks cannot bypass corrected wrist exposure");

// The exact existing breathing guide supports both feet on a wall. Its frozen
// floor-only native equipment metadata stays intact, but current use needs wall.
const breathing = exerciseFor("supine-90-90-breathing-reset");
assert(!breathing.equipment.includes("wall"), "The regression fixture retains native catalogue metadata");
const noWallIntent = { ...intent, equipment: ["floor", "parallettes"] };
const noWallState = stateFor(noWallIntent, projectionPolicy, []);
for (const variant of breathing.prescriptionVariants) {
  const input = { request: requestFor(breathing, variant), state: noWallState, bundle, asOf, intent: noWallIntent };
  assert.equal(evaluateTrainability({ ...input, policy: previous.projectionPolicy }).decision, "allow", "Native policy remains compatible");
  assert(evaluateTrainability({ ...input, policy: projectionPolicy }).reasonCodes.includes("missing-equipment"));
  assert.equal(evaluateTrainability({ ...input, intent, policy: projectionPolicy }).decision, "allow");
  assert.equal(evaluateTrainability({ ...input, policy: { ...projectionPolicy,
    additionalEquipmentRules: projectionPolicy.additionalEquipmentRules.map(rule => ({ ...rule, exerciseDefinitionVersion: 99 })) } }).decision,
  "allow", "Equipment correction cannot silently cross definition versions");
  assert.equal(evaluateTrainability({ ...input, policy: { ...projectionPolicy,
    additionalEquipmentRules: projectionPolicy.additionalEquipmentRules.map(rule => ({ ...rule, prescriptionVariantIds: ["future-variant"] })) } }).decision,
  "allow", "Equipment correction only applies to explicitly audited variants");
}
let noWallPlans = 0;
for (const graph of bundle.graphs) for (const demand of ["technique", "standard", "challenge"]) {
  const intent = { ...intentFor(graph.id), equipment: noWallIntent.equipment };
  const input = { createdAt: asOf, bundle, intent, state: stateFor(intent, projectionPolicy, []), projectionPolicy,
    sessionDemand: demand, seed: `no-wall-${graph.id}-${demand}` };
  for (const generated of [generateMixedVNextSession(input), ...[5, 10, 15, 20].map(minutes => generateMixedVNextCustomSession(input, minutes))]) {
    if (!generated.ok || !generated.plan) continue;
    noWallPlans++;
    for (const item of generated.plan.items) {
      assert.notEqual(item.exerciseId, breathing.id, "No wall guide without the wall selected");
      for (const option of safeWorkoutSwaps({ plan: generated.plan, item, bundle, state: input.state, intent, projectionPolicy })) {
        assert.notEqual(option.exerciseId, breathing.id, "Swaps must enforce the same current equipment correction");
      }
    }
  }
}
assert(noWallPlans > 0, "Safe wall-free workouts must remain available");

assert.equal(JSON.stringify(history), originalDefinitions, "No authored/historical definition mutation");
assert.equal(JSON.stringify(previous.projectionPolicy), originalPolicy, "Native policy9 stays unchanged");
console.log(`Restriction exposure: ${auditedIds.size} movements / ${auditedVariants} native variants, ${plans} safe Today/Custom plans, ${unavailable} honest unavailable results and ${swaps} safe swaps pass; ${noWallPlans} wall-free plans, guided checks and native compatibility pass.`);
