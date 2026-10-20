import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
createRequire(import.meta.url)("fake-indexeddb/auto");
const { trainingQualityCatalogue } = load("app/vnext/production/trainingQuality.ts");
const { restrictionSafetyCatalogue: native } = load("app/vnext/production/restrictionSafety.ts");
const { generateTrainingQualitySessionPlan, generateTrainingQualityCustomPlan } = load("app/vnext/planning/feedbackDose.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const { structureWorkoutPlan } = load("app/vnext/workoutUx.ts");
const { createRestrictionReport, createRestrictionClearance } = load("app/vnext/assessment/index.ts");
const { projectAthleteState, evaluateTrainability } = load("app/vnext/projection/index.ts");
const { planningTrainabilityRequests } = load("app/vnext/planning/index.ts");
const { validateAthleteEvidenceEvent, validateDerivedAthleteState } = load("app/vnext/validation.ts");
const catalogue = { ...trainingQualityCatalogue, generateSession: generateTrainingQualitySessionPlan,
  generateCustomSession: generateTrainingQualityCustomPlan };
const bundle = catalogue.bundle;
const athleteId = "symptom-recovery-regression";
const at = (day) => new Date(Date.UTC(2026, 0, 1 + day, 10)).toISOString();
let clock = at(0), failClearance = false, checks = 0;
const base = createVNextShadowStore({ databaseName: athleteId });
const store = new Proxy(base, { get(target, key) {
  if (key === "appendEvidenceEvent") return async (event) => {
    if (failClearance && event.type === "restriction_cleared") throw new Error("Injected clearance write failure");
    return target.appendEvidenceEvent(event);
  };
  const value = Reflect.get(target, key);
  return typeof value === "function" ? value.bind(target) : value;
} });
const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => clock });
const check = (label, body) => { body(); checks++; console.log(`PASS ${label}`); };
const intent = { schemaVersion: 1, athleteId, updatedAt: clock, goals: [{ graphId: "parallette-pushing", priority: "primary" }],
  equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
const requestFor = (id) => {
  const exercise = bundle.exercises.find((item) => item.id === id);
  return { exerciseId: id, exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: exercise.prescriptionVariants[0].id };
};
const evaluate = (state, id) => evaluateTrainability({ request: requestFor(id), bundle, state, intent,
  asOf: state.asOf, policy: catalogue.projectionPolicy });
try {
  await store.putAthleteIntent(intent);
  let snapshot = await runtime.refresh({ athleteId });
  assert(snapshot.generated.plan);
  const plan = snapshot.generated.plan;
  const symptomItem = plan.items.find((item) => item.exerciseId === "knee-push-up");
  assert(symptomItem);
  const work = new Map(structureWorkoutPlan(plan, bundle).map((item) => [item.planItemId,
    item.intervals.filter((interval) => interval.kind === "work").reduce((sum, interval) => sum + interval.durationSeconds, 0)]));
  const prep = (item) => ["preparation", "recovery"].includes(item.purpose);
  const timerItemOutcomes = plan.items.filter(prep).map((item) => ({ planItemId: item.id, status: "completed",
    participationSeconds: work.get(item.id), participationBasis: "measured" }));
  const reviewAnswers = plan.items.filter((item) => !prep(item)).map((item) => ({
    planItemId: item.id, status: item.id === symptomItem.id ? "modified" : "completed",
    participationSeconds: work.get(item.id), difficulty: "right",
    ...(item.id === symptomItem.id ? { symptomOrInstability: true, modificationReason: "Reported symptom or instability area: left wrist." } : {}),
  }));
  clock = new Date(Date.parse(clock) + plan.intendedDurationSeconds * 1000).toISOString();
  const prepared = runtime.prepareWorkoutCompletion({ generated: snapshot.generated, timerItemOutcomes, reviewAnswers,
    startedAt: at(0), completedAt: clock, recordedAt: clock, status: "partial" });
  snapshot = (await runtime.commitWorkoutCompletion({ athleteId, prepared })).snapshot;
  const original = await store.readProjectionSources(athleteId);
  const originalRecordBytes = canonicalJson(original.sessionRecords);
  const source = { kind: "session-item", sessionRecordId: original.sessionRecords[0].id, planItemId: symptomItem.id };
  check("localized native symptom uses real exercise exposure, not all seven dense demand keys", () => {
    const restriction = snapshot.state.activeRestrictions.find((item) => item.source.kind === "session-item");
    assert(restriction);
    assert(restriction.demandDomains.includes("hand-wrist-bearing"));
    assert(restriction.demandDomains.includes("horizontal-bent-arm-push"));
    assert(!restriction.demandDomains.includes("inversion-technical"));
    assert(restriction.demandDomains.length < 7);
    assert.equal(evaluate(snapshot.state, "knee-push-up").decision, "block");
    assert(snapshot.presentations.restrictions.items.some((item) => item.action === "clarify"));
    assert(validateDerivedAthleteState(snapshot.state).valid);
  });
  const nativeReplay = projectAthleteState({ athleteId, asOf: clock, policy: native.projectionPolicy,
    definitionBundles: native.history, ...original, intent, trainabilityRequests: planningTrainabilityRequests(bundle) });
  check("old policy retains original replay and all historical facts", () => {
    assert(nativeReplay.ok);
    assert.equal(nativeReplay.state.activeRestrictions[0].demandDomains.length, 7);
    assert.deepEqual(snapshot.state.nodeStates, nativeReplay.state.nodeStates);
  });
  clock = at(9);
  snapshot = await runtime.refresh({ athleteId });
  check("expired initial hold remains visible with a concrete recovery action", () => {
    assert.equal(snapshot.state.activeRestrictions.length, 0);
    assert(snapshot.state.reconfirmationRequirements.length);
    assert(snapshot.presentations.restrictions.hasActiveRestrictions);
    assert(snapshot.presentations.restrictions.items.some((item) => item.state === "reconfirmation" && item.action === "clarify"));
    assert(!snapshot.presentations.restrictions.summary.includes("No current"));
  });
  const report = createRestrictionReport({ eventId: "scoped-wrist-report", athleteId, catalogueVersion: bundle.catalogueVersion,
    occurredAt: clock, recordedAt: clock, severity: "block", demandDomains: ["hand-wrist-bearing"],
    bodyRegions: ["left wrist"], symptomSource: source });
  check("new optional source is strict, while original event shapes still validate", () => {
    assert(validateAthleteEvidenceEvent(report).valid);
    assert(!validateAthleteEvidenceEvent({ ...report, symptomSource: { kind: "session-item", sessionRecordId: source.sessionRecordId } }).valid);
    const { symptomSource: omitted, ...oldShape } = report;
    assert(validateAthleteEvidenceEvent(oldShape).valid);
  });
  snapshot = (await runtime.commitRestrictionReport({ athleteId, event: report })).snapshot;
  check("explicit clarification narrows the inferred hold without rewriting the original symptom", () => {
    assert.equal(snapshot.state.activeRestrictions.length, 1);
    assert.deepEqual(snapshot.state.activeRestrictions[0].demandDomains, ["hand-wrist-bearing"]);
    assert.equal(snapshot.state.reconfirmationRequirements.length, 0);
    assert.equal(evaluate(snapshot.state, "knee-push-up").decision, "block");
    assert.equal(evaluate(snapshot.state, "dead-bug").reasonCodes.includes("active-restriction"), false);
    assert(snapshot.presentations.restrictions.items.every((item) => item.action === "comfort"));
    assert.equal(canonicalJson(snapshot.sources.sessionRecords), originalRecordBytes);
  });
  clock = at(10);
  const clearance = createRestrictionClearance({ eventId: "scoped-wrist-comfort", athleteId, catalogueVersion: bundle.catalogueVersion,
    occurredAt: clock, recordedAt: clock, restrictionEventId: report.id });
  failClearance = true;
  await assert.rejects(runtime.commitRestrictionReport({ athleteId, event: report, clearance }), /Injected/);
  snapshot = await runtime.refresh({ athleteId });
  check("a failed comfort write leaves the restriction in place", () => {
    assert.equal(snapshot.state.activeRestrictions.length, 1);
    assert.equal(snapshot.sources.evidenceEvents.filter((event) => event.id === report.id).length, 1);
  });
  failClearance = false;
  snapshot = (await runtime.commitRestrictionReport({ athleteId, event: report, clearance })).snapshot;
  await runtime.commitRestrictionReport({ athleteId, event: report, clearance });
  check("exact retry restores suitable work but retains demanding-work reconfirmation", () => {
    assert.equal(snapshot.state.activeRestrictions.length, 0);
    assert.equal(snapshot.state.reconfirmationRequirements.length, 1);
    assert.deepEqual(snapshot.state.reconfirmationRequirements[0].demandDomains, ["hand-wrist-bearing"]);
    assert(snapshot.presentations.restrictions.items.some((item) => item.action === "recheck"));
    assert.equal(snapshot.sources.evidenceEvents.length, 2);
    assert.equal(canonicalJson(snapshot.sources.sessionRecords), originalRecordBytes);
    assert.equal(evaluate(snapshot.state, "knee-push-up").reasonCodes.includes("active-restriction"), false);
  });
  const reloaded = createVNextReleaseCandidateRuntime({ store: base, catalogue, clock: () => clock });
  const reloadSnapshot = await reloaded.refresh({ athleteId });
  check("offline reopen preserves recovery and all original records byte for byte", () => {
    assert.deepEqual(reloadSnapshot.state.reconfirmationRequirements, snapshot.state.reconfirmationRequirements);
    assert.equal(canonicalJson(reloadSnapshot.sources.sessionRecords), originalRecordBytes);
    assert.equal(reloadSnapshot.sources.evidenceEvents.length, 2);
  });
  // A second device's still-active scope must survive one device's clearance.
  const concurrent = createRestrictionReport({ ...report, eventId: "other-device-clarification",
    occurredAt: at(9), recordedAt: at(9), demandDomains: ["horizontal-bent-arm-push"] });
  snapshot = (await runtime.commitRestrictionReport({ athleteId, event: concurrent })).snapshot;
  check("concurrent clarification remains conservative until separately cleared", () => {
    assert.equal(snapshot.state.activeRestrictions.length, 1);
    assert.deepEqual(snapshot.state.activeRestrictions[0].demandDomains, ["horizontal-bent-arm-push"]);
    assert.equal(snapshot.state.reconfirmationRequirements.length, 1);
    assert.equal(canonicalJson(snapshot.sources.sessionRecords), originalRecordBytes);
  });
  console.log(`Validated ${checks} scoped symptom/recovery scenarios with real runtime and isolated storage.`);
} finally { await base.close(); }
