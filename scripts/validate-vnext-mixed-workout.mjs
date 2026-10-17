import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { validateShadowSessionPlan, validateShadowSessionPair } from "../profile-api/vnext-session-validation.js";

createRequire(import.meta.url)("fake-indexeddb/auto");
const { combinedProgressionCatalogue: catalogue } = load("app/vnext/production/combinedProgressionRelease.ts");
const { bundle, history, projectionPolicy } = catalogue;
const planning = load("app/vnext/planning/index.ts");
const mixed = load("app/vnext/planning/mixed.ts");
const execution = load("app/vnext/mixedWorkout.ts");
const workout = load("app/vnext/workoutUx.ts");
const projection = load("app/vnext/projection/index.ts");
const validation = load("app/vnext/validation.ts");
const persistence = load("app/vnext/persistence/index.ts");
const runtimeApi = load("app/vnext/releaseCandidate/runtime.ts");
const presentation = load("app/vnext/presentation/index.ts");
const asOf = "2026-10-17T12:00:00.000Z";
const later = "2026-10-17T12:25:00.000Z";
const athleteId = "mixed-workout-validation";
const intent = { schemaVersion: 1, athleteId, updatedAt: asOf,
  goals: [{ graphId: "parallette-pushing", priority: "primary" }],
  equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
const stateFor = (value) => {
  const projected = projection.projectAthleteState({ athleteId, asOf, policy: projectionPolicy, definitionBundles: history,
    evidenceEvents: [], sessionPlans: [], sessionRecords: [], intent: value, trainabilityRequests: planning.planningTrainabilityRequests(bundle) });
  assert(projected.ok && projected.state, "Fixture projection must succeed");
  return projected.state;
};
const inputFor = (value = intent, demand = "standard") => ({ createdAt: asOf, bundle, intent: value,
  state: stateFor(value), projectionPolicy, sessionDemand: demand, seed: `mixed-${demand}` });
const totals = (intervals) => ["work", "rest"].map((kind) => intervals.filter((interval) => interval.kind === kind)
  .reduce((sum, interval) => sum + interval.durationSeconds, 0));
let scenarios = 0;
const verify = (base, changed, input) => {
  scenarios++;
  assert(changed.ok && changed.plan, "Adapted plan must remain available");
  const plan = changed.plan;
  assert(validation.validateSessionPlan(plan).valid, "Native client must accept mixed plan");
  assert.equal(validateShadowSessionPlan(plan, plan.id, athleteId), null, "Current Worker must accept mixed plan without deployment");
  assert.equal(plan.intendedDurationSeconds, base.plan.intendedDurationSeconds);
  const timeline = execution.workoutExecutionTimeline(plan, bundle);
  assert.equal(timeline.reduce((sum, interval) => sum + interval.durationSeconds, 0), plan.intendedDurationSeconds);
  assert.equal(new Set(timeline.map((interval) => interval.id)).size, timeline.length, "Each native interval occurs exactly once");
  for (const item of plan.items) {
    const native = workout.structureWorkoutItem(item, bundle).intervals;
    assert.deepEqual(timeline.filter((interval) => interval.planItemId === item.id), native, "Rounds must preserve per-item work/rest order and dose");
    assert.equal(native.reduce((sum, interval) => sum + interval.durationSeconds, 0), item.plannedSeconds);
    const evaluated = projection.evaluateTrainability({ request: item, state: input.state, bundle,
      asOf, policy: projectionPolicy, intent: input.intent });
    assert.notEqual(evaluated.decision, "block", "No preparation/reset addition may bypass trainability");
  }
  for (const purpose of ["preparation", "recovery"]) {
    const intervalsFor = (source) => workout.structureWorkoutPlan(source.plan, bundle)
      .filter((item) => source.plan.items.find((entry) => entry.id === item.planItemId).purpose === purpose)
      .flatMap((item) => item.intervals);
    assert.deepEqual(totals(intervalsFor(changed)), totals(intervalsFor(base)), `${purpose} work and rest must both remain unchanged`);
  }
  const development = (source) => source.plan.items.filter((item) => !["preparation", "recovery"].includes(item.purpose))
    .map(({ id, ...item }) => item);
  assert.deepEqual(development(changed), development(base), "No skill/strength exercise, dose, gate or native definition may change");
  const oldJson = JSON.stringify(base.plan);
  assert.deepEqual(execution.workoutExecutionTimeline(base.plan, bundle), workout.structureWorkoutPlan(base.plan, bundle).flatMap((item) => item.intervals));
  assert.equal(JSON.stringify(base.plan), oldJson, "Historical plan may not be mutated");
  const groups = execution.workoutExecutionGroups(plan, bundle);
  for (const group of groups.filter((entry) => entry.mode === "rounds")) {
    const ids = new Set(group.items.map((item) => item.planItemId));
    const works = timeline.filter((interval) => interval.kind === "work" && ids.has(interval.planItemId));
    assert.equal(works[0].planItemId, group.items[0].planItemId);
    assert.equal(works[1].planItemId, group.items[1].planItemId, "Round must visit the next exercise before repeating the first");
    const firstIndex = timeline.findIndex((interval) => ids.has(interval.planItemId));
    assert(execution.workoutGroupHasStarted(group.items[1].planItemId, firstIndex, groups, timeline), "Whole active round group must lock swaps");
    assert(!execution.workoutGroupHasStarted(group.items[1].planItemId, firstIndex - 1, groups, timeline));
    for (const item of group.items) {
      const first = timeline.findIndex((interval) => interval.planItemId === item.planItemId);
      const last = timeline.findLastIndex((interval) => interval.planItemId === item.planItemId);
      const required = totals(item.intervals)[0];
      if (first < last) assert(!execution.hasFinishedWorkoutItem(item.planItemId, first, timeline, required), "Leaving a movement mid-round cannot complete it");
      assert(!execution.hasFinishedWorkoutItem(item.planItemId, last, timeline, Math.max(0, required - 1)), "Skipped/short work cannot complete an item");
      assert(execution.hasFinishedWorkoutItem(item.planItemId, last, timeline, required));
    }
  }
  const preview = presentation.buildTodayWorkoutPresentation({ bundle, generated: changed });
  assert.equal(preview.blocks.length, plan.items.length);
  assert(preview.blocks.every((item) => item.mediaReference && item.setStructureLabel));
  assert.equal(new Set(changed.itemExplanations.map((item) => item.planItemId)).size, plan.items.length);
  return { plan, timeline, groups };
};

for (const demand of ["technique", "standard", "challenge"]) {
  for (const equipment of [["floor"], ["floor", "parallettes"], intent.equipment]) {
    const input = inputFor({ ...intent, equipment }, demand);
    const before = planning.generateVNextSession(input);
    const after = mixed.generateMixedVNextSession(input);
    verify(before, after, input);
    assert.deepEqual(after, mixed.generateMixedVNextSession(input), "Equal input must produce exact deterministic plan identity");
    for (const minutes of [5, 10, 15, 20]) verify(planning.generateVNextCustomSession(input, minutes),
      mixed.generateMixedVNextCustomSession(input, minutes), input);
  }
}
const core = { label: "Core & body line", capacityIds: ["body-line-control"] };
const input = inputFor();
for (const minutes of [5, 10, 15, 20]) {
  const before = planning.generateVNextCustomSession(input, minutes, core);
  assert(before.ok, "Core fixture must be available");
  verify(before, mixed.generateMixedVNextCustomSession(input, minutes, core), input);
}
const sample = mixed.generateMixedVNextSession(input);
const { plan, timeline, groups } = verify(planning.generateVNextSession(input), sample, input);
const support = groups.find((group) => group.mode === "rounds" && group.items.every((item) =>
  plan.items.find((entry) => entry.id === item.planItemId).purpose !== "preparation"));
assert(support, "Beginner fixture must demonstrate compatible support rounds");
const protectedPrimary = plan.items.find((item) => item.purpose === "primary-development");
assert.equal(groups.find((group) => group.items.some((item) => item.planItemId === protectedPrimary.id)).mode, "straight");
const changedBundle = { ...bundle, exercises: bundle.exercises.map((item) => item.id !== support.items[1].exercise.id ? item : {
  ...item, prescriptionVariants: item.prescriptionVariants.map((variant) => ({ ...variant,
    demand: { ...variant.demand, "inversion-technical": "moderate" } })) }) };
assert(!execution.workoutExecutionGroups(plan, changedBundle).some((group) => group.mode === "rounds" && group.items.some((item) => item.planItemId === support.items[1].planItemId)),
  "Technical/inversion work cannot rotate as support");
// A technical inversion drill need not carry the technique-safety role.
const technicalId = "mixed-technical-inversion-fixture";
const technicalDefinition = { ...support.items[0].exercise, id: technicalId,
  roles: ["capacity-accessory"], prescriptionVariants: support.items[0].exercise.prescriptionVariants.map((variant) => ({
    ...variant, demand: { ...variant.demand, "inversion-technical": "moderate" } })) };
const technicalItem = { ...plan.items.find((item) => item.id === support.items[0].planItemId),
  id: "mixed-technical-item", exerciseId: technicalId };
const technicalPlan = { ...plan, items: [technicalItem, ...support.items.map((item) => plan.items.find((entry) => entry.id === item.planItemId))] };
assert(execution.workoutExecutionGroups(technicalPlan, { ...bundle, exercises: [...bundle.exercises, technicalDefinition] })
  .every((group) => group.mode === "straight"), "Technical inversion must not consume the following primary requirement's protection");
const swaps = Object.fromEntries(plan.items.map((item) => [item.id, workout.safeWorkoutSwaps({ plan, item, bundle,
  state: input.state, intent, projectionPolicy })]));
for (const item of plan.items) for (const option of swaps[item.id]) {
  const selection = { [item.id]: option };
  const selectedGroups = execution.workoutExecutionGroups(plan, bundle, selection);
  assert.deepEqual(selectedGroups.map((group) => group.items.map((entry) => entry.planItemId)), groups.map((group) => group.items.map((entry) => entry.planItemId)),
    "A swap cannot merge backward into a started group");
  const selectedTimeline = execution.workoutExecutionTimeline(plan, bundle, selection);
  const firstGroupInterval = timeline.findIndex((interval) => groups.find((group) => group.items.some((entry) => entry.planItemId === item.id))
    .items.some((entry) => entry.planItemId === interval.planItemId));
  assert.deepEqual(selectedTimeline.slice(0, firstGroupInterval), timeline.slice(0, firstGroupInterval), "Future-group swap cannot move the active cursor");
}
const early = presentation.buildWorkoutCompletionPresentation({ bundle, generated: sample,
  participationSecondsByPlanItem: Object.fromEntries(plan.items.map((item) => [item.id, item.purpose === "preparation" ? 2 : 0])), performedByPlanItem: {} });
assert.equal(early.prompts.length, 0, "Preparation-only early finish may not request skill achievement");

const store = persistence.createVNextShadowStore({ databaseName: `mixed-workout-${randomUUID()}` });
await store.putAthleteIntent(intent);
const upgradedCatalogue = { ...catalogue, generateSession: mixed.generateMixedVNextSession, generateCustomSession: mixed.generateMixedVNextCustomSession };
const runtime = runtimeApi.createVNextReleaseCandidateRuntime({ store, catalogue: upgradedCatalogue, clock: () => asOf });
const oldRuntime = runtimeApi.createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => asOf });
const old = (await oldRuntime.refresh({ athleteId, asOf })).generated;
const fresh = (await runtime.refresh({ athleteId, asOf })).generated;
assert(execution.isMixedWorkoutPlan(fresh.plan));
for (const generated of [old, fresh]) {
  const firstPrep = generated.plan.items.find((item) => item.purpose === "preparation");
  const prepared = runtime.prepareWorkoutCompletion({ generated, startedAt: asOf, completedAt: later, recordedAt: later, status: "partial",
    timerItemOutcomes: generated.plan.items.filter((item) => ["preparation", "recovery"].includes(item.purpose)).map((item) => ({
      planItemId: item.id, status: item.id === firstPrep.id ? "modified" : "skipped", participationSeconds: item.id === firstPrep.id ? 2 : 0,
      participationBasis: "measured", ...(item.id === firstPrep.id ? { modificationReason: "Isolated partial timer test." } : {}) })),
    reviewAnswers: generated.plan.items.filter((item) => !["preparation", "recovery"].includes(item.purpose))
      .map((item) => ({ planItemId: item.id, status: "skipped", participationSeconds: 0 })) });
  assert.equal(validateShadowSessionPair(prepared.plan, prepared.record, athleteId), null, "Current Worker must accept new/native completion pair");
  const first = await runtime.commitWorkoutCompletion({ athleteId, prepared, asOf: later });
  const retry = await runtime.commitWorkoutCompletion({ athleteId, prepared, asOf: later });
  assert.equal(first.append.record.status, "inserted");
  assert.equal(retry.append.record.status, "duplicate");
}
const sources = await store.readProjectionSources(athleteId);
assert.equal(sources.sessionRecords.length, 2);
const exported = await store.exportBundle(athleteId, { exportedAt: later, catalogueVersions: history.map((entry) => entry.catalogueVersion),
  projectionVersions: [8], definitionFingerprints: [await persistence.sha256(history)], policyVersions: [
    { id: projectionPolicy.id, version: 8 }] });
const restored = persistence.createVNextShadowStore({ databaseName: `mixed-restored-${randomUUID()}` });
await restored.importBundle(exported);
await restored.importBundle(exported);
const reread = await restored.readProjectionSources(athleteId);
assert.deepEqual(reread.sessionPlans, sources.sessionPlans);
assert.deepEqual(reread.sessionRecords, sources.sessionRecords);
assert.equal(reread.sessionRecords.length, 2);
await runtimeApi.createVNextReleaseCandidateRuntime({ store: restored, catalogue: upgradedCatalogue }).refresh({ athleteId, asOf: later });
console.log(`Mixed workout validation passed: ${scenarios} full/custom/equipment/demand plans; native/client/Worker compatibility, exact work/rest, round completion, protected primary, swap boundaries, partial review, one-record retries and mixed-policy export/import.`);
