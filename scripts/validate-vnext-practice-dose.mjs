import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { validateShadowSessionPair, validateShadowSessionPlan } from "../profile-api/vnext-session-validation.js";
createRequire(import.meta.url)("fake-indexeddb/auto");
const { trainingQualityCatalogue: current } = load("app/vnext/production/trainingQuality.ts");
const generators = load("app/vnext/planning/feedbackDose.ts");
const { generateMixedVNextSession } = load("app/vnext/planning/mixed.ts");
const { capPracticeSession } = load("app/vnext/planning/practiceDose.ts");
const dose = load("app/vnext/practiceDose.ts");
const native = load("app/vnext/workoutUx.ts");
const { workoutExecutionTimeline, isMixedWorkoutPlan } = load("app/vnext/mixedWorkout.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { buildTodayWorkoutPresentation: buildTodayWorkout } = load("app/vnext/presentation/today.ts");
const { buildSessionHistory } = load("app/vnext/ui/sessionHistory.ts");
const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const { validateGeneratedSession } = load("app/vnext/planning/validation.ts");
const { vNextGeneratorPolicy } = load("app/vnext/planning/policy.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { createVNextShadowStore, canonicalJson, sha256 } = load("app/vnext/persistence/index.ts");
const bundle = current.bundle, asOf = "2026-10-21T09:00:00.000Z";
const definitionsBefore = canonicalJson(current.history);
let cases = 0, shorter = 0;
const fixture = (graphId, demand = "standard") => {
  const intent = { schemaVersion: 1, athleteId: `practice-${graphId}-${demand}`, updatedAt: asOf,
    goals: [{ graphId, priority: "primary" }], equipment: ["floor", "wall", "parallettes"],
    defaultSessionDemand: demand, preferences: { specialistOptIn: false } };
  const result = projectAthleteState({ athleteId: intent.athleteId, asOf, intent, policy: current.projectionPolicy,
    definitionBundles: current.history, evidenceEvents: [], sessionRecords: [], sessionPlans: [] });
  assert(result.ok);
  return { createdAt: asOf, intent, state: result.state, bundle, projectionPolicy: current.projectionPolicy,
    sessionDemand: demand, seed: "practice-dose" };
};
const verify = (generated, input) => {
  assert(generated.ok && generated.plan);
  const plan = generated.plan;
  assert.equal(plan.generatorPolicyVersion, 5);
  assert(isMixedWorkoutPlan(plan));
  assert.equal(validateShadowSessionPlan(plan, plan.id, plan.athleteId), null);
  assert.deepEqual(validateGeneratedSession({ ...input, generated,
    policy: { ...vNextGeneratorPolicy, id: plan.generatorPolicyId, version: 5,
      exactDurationSeconds: generated.durationException?.targetSeconds ?? plan.intendedDurationSeconds } }), []);
  assert(validateWorkoutStart({ ...input, generated }).allowed);
  const structured = dose.structurePracticeWorkoutPlan(plan, bundle);
  const timeline = workoutExecutionTimeline(plan, bundle);
  assert.equal(timeline.reduce((sum, interval) => sum + interval.durationSeconds, 0), plan.intendedDurationSeconds);
  const today = buildTodayWorkout({ generated, bundle });
  for (const item of structured) {
    const planned = plan.items.find(entry => entry.id === item.planItemId);
    const original = native.structureWorkoutItem(planned, bundle);
    assert.deepEqual(item.intervals, original.intervals, "Practice targets must preserve work/rest timing");
    assert.equal(today.blocks.find(block => block.planItemId === item.planItemId).prescriptionLabel, item.targetLabel);
    if (dose.isWallLinePractice(planned)) {
      assert(item.intervals.filter(i => i.kind === "work").length <= 3);
      assert.match(today.blocks.find(block => block.planItemId === item.planItemId).intensity, /three controlled sets|Adjusted/);
    }
    if (["grounded-side-exit-rehearsal", "floor-side-exit-practice", "wall-handstand-side-exit"].includes(item.exercise.id)) {
      assert.match(item.targetLabel, /1–2 controlled exits per side/);
      if (item.variant.id.endsWith("-standard")) assert.equal(item.variant.label, "1–2 controlled exits per side");
    }
    for (const option of dose.safePracticeWorkoutSwaps({ ...input, plan, item: planned })) {
      assert.equal(option.targetLabel, dose.structurePracticeWorkoutItem(plan, planned, bundle, option).targetLabel);
      if (option.exerciseId === "wall-shoulder-flexion-line-drill") assert(planned.plannedSeconds <= 180);
    }
  }
  if (generated.durationException) {
    assert.equal(generated.durationException.actualSeconds, plan.intendedDurationSeconds);
    assert.equal(today.durationMessage, generated.durationException.message);
    assert(plan.intendedDurationSeconds < generated.durationException.targetSeconds);
    shorter++;
  }
  cases++;
};

for (const graph of bundle.graphs) for (const demand of ["technique", "standard", "challenge"]) {
  const input = fixture(graph.id, demand);
  const old = generators.generateProgressionSessionPlan(input), before = canonicalJson(old);
  const generated = generators.generatePracticeSessionPlan(input);
  verify(generated, input);
  assert.equal(canonicalJson(generators.generatePracticeSessionPlan(input)), canonicalJson(generated));
  assert.equal(canonicalJson(old), before, "Generation cannot alter a native saved plan");
  old.plan.items.forEach((item, index) => assert(generated.plan.items[index].plannedSeconds <= item.plannedSeconds,
    "Freed time cannot inflate another exercise's dose"));
  for (const minutes of [5, 10, 15, 20]) verify(generators.generatePracticeCustomPlan(input, minutes), input);
}
console.log(`PASS ${cases} deterministic Today/Custom cases: current safety, capped drill, explicit exit targets and exact timing`);

const input = fixture("handstand-balance", "challenge");
const capacityFilter = { label: "Overhead support", capacityIds: ["overhead-support-elevation"] };
// Select the actual authored capacity identity rather than a UI label.
capacityFilter.capacityIds = bundle.capacities.filter(capacity => capacity.id.includes("overhead")).map(capacity => capacity.id);
const custom = generators.generatePracticeCustomPlan(input, 20, capacityFilter);
verify(custom, input);
assert(custom.durationException, "A long capacity workout must expose the useful-dose exception");
assert.match(custom.durationException.message, /three controlled sets/);
assert(custom.plan.items.some(item => item.exerciseId === "wall-shoulder-flexion-line-drill" && item.plannedSeconds === 180));

const wall = bundle.exercises.find(e => e.id === "wall-shoulder-flexion-line-drill");
const wallVariant = wall.prescriptionVariants[0];
const wallItem = { id: "observed-wall-budget", exerciseId: wall.id, exerciseDefinitionVersion: wall.definitionVersion,
  prescriptionVariantId: wallVariant.id, purpose: "primary-development", plannedSeconds: 480, demand: wallVariant.demand };
const replay = { ...custom, plan: { ...custom.plan, intendedDurationSeconds: 480, items: [wallItem] },
  durationException: undefined, itemExplanations: [{ ...custom.itemExplanations[0], planItemId: wallItem.id }] };
const capped = capPracticeSession(replay);
assert.equal(capped.plan.items[0].plannedSeconds, 180);
assert.equal(native.structureWorkoutItem(wallItem, bundle).intervals.filter(i => i.kind === "work").length, 8);
const invalid = { ...custom, plan: { ...custom.plan, items: [wallItem] } };
assert.equal(validateWorkoutStart({ ...input, generated: invalid }).allowed, false);
const modifiedState = { ...input.state, retainedDoseAdjustments: [{ exerciseId: wall.id,
  exerciseDefinitionVersion: wall.definitionVersion, prescriptionVariantId: wallVariant.id }] };
const modified = generators.generatePracticeCustomPlan({ ...input, state: modifiedState }, 20, capacityFilter);
assert(modified.ok);
assert.equal(modified.plan.items.find(i => i.exerciseId === wall.id)?.plannedSeconds, 120,
  "Feedback must reduce the capped three sets to two, not reduce eight sets and then keep three");
console.log(`PASS capped eight-set replay, shorter capacity work and retained-feedback interaction (${shorter} shorter plans)`);

const exit = bundle.exercises.find(e => e.id === "floor-side-exit-practice");
const protocol = bundle.benchmarkProtocols.find(p => p.exerciseId === exit.id);
const checkItem = { ...wallItem, exerciseId: exit.id, exerciseDefinitionVersion: exit.definitionVersion,
  prescriptionVariantId: protocol.prescriptionVariantId, purpose: "guided-test", benchmarkProtocolId: protocol.id,
  benchmarkProtocolVersion: protocol.definitionVersion, plannedSeconds: 240 };
assert.deepEqual(dose.structurePracticeWorkoutItem(custom.plan, checkItem, bundle), native.structureWorkoutItem(checkItem, bundle));
assert.equal(protocol.metric.minimumSuccessful, 4); assert.equal(protocol.metric.maximumAttempts, 6);
for (const generate of [generateMixedVNextSession, generators.generateFeedbackVNextSession,
  generators.generateTrainingQualitySessionPlan, generators.generateProgressionSessionPlan]) {
  const historical = generate(input);
  assert(isMixedWorkoutPlan(historical.plan));
  assert.deepEqual(dose.structurePracticeWorkoutPlan(historical.plan, bundle), native.structureWorkoutPlan(historical.plan, bundle));
}
assert.equal(canonicalJson(current.history), definitionsBefore);
console.log("PASS native generators 1–4, definitions 1–8 and exact four-of-six benchmark remain unchanged");

const databaseName = `practice-dose-${crypto.randomUUID()}`;
const store = createVNextShadowStore({ databaseName });
const catalogue = { ...current, generateSession: generators.generatePracticeSessionPlan, generateCustomSession: generators.generatePracticeCustomPlan };
const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => asOf });
await store.putAthleteIntent(input.intent);
const snapshot = await runtime.refresh({ athleteId: input.intent.athleteId });
const generated = snapshot.generated, plan = generated.plan;
const interval = workoutExecutionTimeline(plan, bundle).find(i => i.kind === "work");
const completedAt = "2026-10-21T09:00:10.000Z";
const prepared = runtime.prepareWorkoutCompletion({ generated, startedAt: asOf, completedAt, recordedAt: completedAt,
  status: "partial", timerItemOutcomes: plan.items.filter(i => ["preparation", "recovery"].includes(i.purpose)).map(i => ({
    planItemId: i.id, status: i.id === interval.planItemId ? "modified" : "skipped",
    participationSeconds: i.id === interval.planItemId ? 10 : 0, participationBasis: "measured" })),
  reviewAnswers: plan.items.filter(i => !["preparation", "recovery"].includes(i.purpose)).map(i => ({
    planItemId: i.id, status: "skipped", participationSeconds: 0 })) });
await runtime.commitWorkoutCompletion({ athleteId: input.intent.athleteId, prepared });
await runtime.commitWorkoutCompletion({ athleteId: input.intent.athleteId, prepared });
const saved = await store.readProjectionSources(input.intent.athleteId);
assert.equal(saved.sessionRecords.length, 1);
assert.equal(validateShadowSessionPair(saved.sessionPlans[0], saved.sessionRecords[0], input.intent.athleteId), null);
assert.equal(saved.evidenceEvents.length, 0, "Timed practice cannot create benchmark evidence");
assert.equal(saved.sessionRecords[0].itemOutcomes.reduce((sum, i) => sum + i.participationSeconds, 0), 10);
const exportBundle = await store.exportBundle(input.intent.athleteId, { exportedAt: completedAt,
  catalogueVersions: current.history.map(b => b.catalogueVersion), projectionVersions: [current.projectionPolicy.version],
  definitionFingerprints: [await sha256(current.history)], policyVersions: [{ id: current.projectionPolicy.id, version: current.projectionPolicy.version }] });
store.close();
const reopened = createVNextShadowStore({ databaseName });
assert.equal(canonicalJson((await reopened.readProjectionSources(input.intent.athleteId)).sessionPlans), canonicalJson(saved.sessionPlans));
const restored = createVNextShadowStore({ databaseName: `${databaseName}-restore` });
await restored.importBundle(exportBundle); await restored.importBundle(exportBundle);
const restoredSources = await restored.readProjectionSources(input.intent.athleteId);
assert.equal(canonicalJson(restoredSources.sessionRecords), canonicalJson(saved.sessionRecords));
assert.equal(canonicalJson(restoredSources.sessionPlans), canonicalJson(saved.sessionPlans));
const history = buildSessionHistory(saved, current.history)[0];
assert(history.movements.some(i => i.plannedPrescription?.includes("1–2 controlled exits per side")));
reopened.close(); restored.close();
console.log("PASS early finish saved once, measured-only evidence, offline reopen, repeated backup import and native History targets");
