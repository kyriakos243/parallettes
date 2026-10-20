import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { validateShadowSessionPlan, validateShadowSessionPair } from "../profile-api/vnext-session-validation.js";
createRequire(import.meta.url)("fake-indexeddb/auto");

const { trainingQualityCatalogue: current } = load("app/vnext/production/trainingQuality.ts");
const { restrictionSafetyCatalogue: native } = load("app/vnext/production/restrictionSafety.ts");
const { generateTrainingQualitySessionPlan, generateTrainingQualityCustomPlan } = load("app/vnext/planning/feedbackDose.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { createVNextShadowStore, sha256 } = load("app/vnext/persistence/index.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { planningTrainabilityRequests } = load("app/vnext/planning/index.ts");
const { structureWorkoutPlan, structureWorkoutItem } = load("app/vnext/workoutUx.ts");
const { isMixedWorkoutPlan, workoutExecutionTimeline } = load("app/vnext/mixedWorkout.ts");
const { meaningfulWorkoutParticipationSeconds } = load("app/vnext/workoutTiming.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId } = load("app/vnext/assessment/index.ts");
const { validateDerivedAthleteState, validateSessionPlan } = load("app/vnext/validation.ts");
const bundle = current.bundle;
const catalogue = { ...current, generateSession: generateTrainingQualitySessionPlan,
  generateCustomSession: generateTrainingQualityCustomPlan };
const dayMs = 86_400_000;
const epoch = Date.parse("2026-01-05T09:00:00.000Z");
const at = (day) => new Date(epoch + day * dayMs).toISOString();
const stores = [];
let checks = 0;
const check = (label, body) => { body(); checks++; console.log(`PASS ${label}`); };
const fixture = async (name) => {
  const athleteId = `persistent-difficulty-${name}`;
  const store = createVNextShadowStore({ databaseName: athleteId }); stores.push(store);
  const time = { value: at(0) };
  const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => time.value });
  let { assessment } = await runtime.startAssessment({ athleteId, mode: "new-placement" });
  while (assessment.step.kind !== "review") {
    const kind = assessment.step.kind;
    const answer = kind === "safety" ? { kind, severity: "none" }
      : kind === "experience" ? { kind, experience: "new" }
        : kind === "inactivity" ? { kind, inactivity: "active" }
          : kind === "goals" ? { kind, graphIds: ["parallette-pushing"] }
            : kind === "equipment" ? { kind, equipment: ["floor", "parallettes", "wall"] }
              : { kind, graphId: "parallette-pushing", response: "not-sure" };
    assessment = await runtime.answerAssessment({ draft: assessment.draft, answer });
  }
  await runtime.commitAssessment({ athleteId, draft: assessment.draft });
  return { athleteId, store, time, runtime };
};
const refresh = async (f, day) => {
  f.time.value = at(day);
  return f.runtime.refresh({ athleteId: f.athleteId });
};
const complete = async (f, snapshot, difficulty, options = {}) => {
  const generated = snapshot.generated, plan = generated.plan;
  assert(plan);
  const work = new Map(structureWorkoutPlan(plan, bundle).map((item) => [item.planItemId,
    item.intervals.filter((interval) => interval.kind === "work").reduce((sum, interval) => sum + interval.durationSeconds, 0)]));
  const timerItemOutcomes = plan.items.filter((item) => ["preparation", "recovery"].includes(item.purpose))
    .map((item) => ({ planItemId: item.id, status: "completed",
      participationSeconds: work.get(item.id), participationBasis: "measured" }));
  const reviewAnswers = plan.items.filter((item) => !["preparation", "recovery"].includes(item.purpose))
    .map((item) => ({ planItemId: item.id, status: options.partial || options.brief ? "modified" : "completed",
      participationSeconds: options.brief ? 1 : options.partial ? Math.max(1, Math.floor(work.get(item.id) / 2)) : work.get(item.id),
      difficulty, symptomOrInstability: false }));
  const startedAt = f.time.value;
  f.time.value = new Date(Date.parse(startedAt) + plan.intendedDurationSeconds * 1000).toISOString();
  const prepared = f.runtime.prepareWorkoutCompletion({ generated, timerItemOutcomes, reviewAnswers,
    startedAt, completedAt: f.time.value, recordedAt: f.time.value,
    status: options.partial || options.brief ? "partial" : "complete" });
  return (await f.runtime.commitWorkoutCompletion({ athleteId: f.athleteId, prepared })).snapshot;
};
const kneeAdjustment = (state) => state.retainedDoseAdjustments?.find((item) => item.exerciseId === "knee-push-up");
const kneeSets = (generated) => structureWorkoutPlan(generated.plan, bundle)
  .find((item) => item.exercise.id === "knee-push-up")?.intervals.filter((interval) => interval.kind === "work").length;
const replay = (f, sources, day, policy = current.projectionPolicy) => {
  const result = projectAthleteState({ athleteId: f.athleteId, asOf: at(day), policy,
    definitionBundles: current.history, evidenceEvents: sources.evidenceEvents,
    sessionPlans: sources.sessionPlans, sessionRecords: sources.sessionRecords, intent: sources.intent,
    trainabilityRequests: planningTrainabilityRequests(bundle) });
  assert(result.ok && result.state, JSON.stringify(result.issues));
  const validation = validateDerivedAthleteState(result.state);
  assert(validation.valid, JSON.stringify(validation.issues));
  return result.state;
};
const generate = (sources, state) => generateTrainingQualitySessionPlan({ createdAt: state.asOf,
  bundle, state, intent: sources.intent, projectionPolicy: current.projectionPolicy, seed: "persistent-difficulty" });
try {
  const f = await fixture("spacing");
  let snapshot = await refresh(f, 1);
  assert.equal(kneeSets(snapshot.generated), 4);
  await complete(f, snapshot, "hard", { partial: true });
  snapshot = await refresh(f, 4);
  check("one difficult day does not retain a reduction after its acute window", () => {
    assert.equal(kneeAdjustment(snapshot.state), undefined);
    assert.equal(kneeSets(snapshot.generated), 4);
  });
  await complete(f, snapshot, "hard", { partial: true });
  snapshot = await refresh(f, 11);
  const triggeredSources = await f.store.readProjectionSources(f.athleteId);
  check("two difficult occasions retain fewer actual sets across a weekly gap", () => {
    assert.equal(kneeAdjustment(snapshot.state).difficultObservationRefs.length, 2);
    assert.equal(kneeSets(snapshot.generated), 3);
    assert(snapshot.generated.itemExplanations.some((item) => item.whyIntensity.includes("choose Easier")));
    assert(snapshot.generated.plan.intendedDurationSeconds < 1500);
  });
  check("retention survives 12 weeks and neither rewrites achievements nor the native policy", () => {
    const next = replay(f, triggeredSources, 85);
    const old = replay(f, triggeredSources, 85, native.projectionPolicy);
    assert(kneeAdjustment(next));
    assert.equal(old.retainedDoseAdjustments, undefined);
    assert.deepEqual(next.nodeStates, old.nodeStates);
    assert.deepEqual(next.capacityFindings, old.capacityFindings);
    assert.equal(kneeSets(generate(triggeredSources, next)), 3);
  });
  check("replay order and duplicate exact record retries cannot multiply occasions", () => {
    const expected = replay(f, triggeredSources, 11);
    const shuffled = replay(f, { ...triggeredSources, sessionRecords: [...triggeredSources.sessionRecords].reverse(),
      sessionPlans: [...triggeredSources.sessionPlans].reverse(), evidenceEvents: [...triggeredSources.evidenceEvents].reverse() }, 11);
    assert.deepEqual(shuffled.retainedDoseAdjustments, expected.retainedDoseAdjustments);
    const one = { ...triggeredSources, sessionRecords: [triggeredSources.sessionRecords[0], triggeredSources.sessionRecords[0]] };
    assert.equal(kneeAdjustment(replay(f, one, 11)), undefined);
    assert.equal(kneeAdjustment(replay(f, { ...triggeredSources, sessionRecords: [] }, 11)), undefined);
  });
  check("different variants and brief records cannot become two difficult occasions", () => {
    const altered = structuredClone(triggeredSources);
    const knee = altered.sessionRecords[1].itemOutcomes.find((item) => item.performedExerciseId === "knee-push-up");
    knee.performedPrescriptionVariantId = "knee-push-up-regressed";
    assert.equal(kneeAdjustment(replay(f, altered, 11)), undefined);
    const brief = structuredClone(triggeredSources);
    for (const record of brief.sessionRecords) {
      const item = record.itemOutcomes.find((candidate) => candidate.performedExerciseId === "knee-push-up");
      item.participationSeconds = 1;
    }
    assert.equal(kneeAdjustment(replay(f, brief, 11)), undefined);
  });
  check("completed safe swaps do not masquerade as repeated difficulty", () => {
    const sources = structuredClone(triggeredSources);
    for (const record of sources.sessionRecords) {
      const item = record.itemOutcomes.find((candidate) => candidate.performedExerciseId === "knee-push-up");
      item.performedPrescriptionVariantId = "knee-push-up-regressed";
      item.review = { outcome: "partial", difficulty: "right" };
    }
    assert.equal(replay(f, sources, 11).retainedDoseAdjustments
      .find((item) => item.prescriptionVariantId === "knee-push-up-regressed"), undefined);
    for (const record of sources.sessionRecords) {
      record.itemOutcomes.find((item) => item.performedExerciseId === "knee-push-up").review.difficulty = "hard";
    }
    assert(replay(f, sources, 11).retainedDoseAdjustments
      .find((item) => item.prescriptionVariantId === "knee-push-up-regressed"));
  });
  check("skipped and legacy-unknown observations cannot retain or recover a dose", () => {
    const skipped = structuredClone(triggeredSources);
    for (const record of skipped.sessionRecords) {
      const index = record.itemOutcomes.findIndex((item) => item.performedExerciseId === "knee-push-up");
      record.itemOutcomes[index] = { planItemId: record.itemOutcomes[index].planItemId,
        status: "skipped", participationSeconds: 0 };
    }
    assert.equal(kneeAdjustment(replay(f, skipped, 11)), undefined);
    const sparse = structuredClone(triggeredSources);
    for (const record of sparse.sessionRecords) {
      const provenance = { kind: "legacy-v1.2-sparse", sourceVersion: "1.2", sourceSessionId: record.id,
        timingPrecision: "session-total-only", prescriptionPrecision: "catalogue-default-reconstruction" };
      record.legacySource = provenance;
      sparse.sessionPlans.find((item) => item.id === record.planId).legacySource = provenance;
      for (const item of record.itemOutcomes) { item.participationBasis = "legacy-unknown"; item.participationSeconds = 0; }
    }
    assert.equal(kneeAdjustment(replay(f, sparse, 11)), undefined);
  });
  check("all supported Custom lengths use the retained response", () => {
    for (const minutes of [5, 10, 15, 20]) {
      const generated = generateTrainingQualityCustomPlan({ createdAt: snapshot.asOf, bundle,
        state: snapshot.state, intent: snapshot.intent, projectionPolicy: current.projectionPolicy }, minutes);
      assert(generated.ok && generated.plan);
      const knee = generated.plan.items.find((item) => item.exerciseId === "knee-push-up");
      if (knee) assert(generated.itemExplanations.find((item) => item.planItemId === knee.id).whyIntensity.includes("choose Easier"));
    }
  });
  check("generator 3 retains exact mixed execution and client/Worker compatibility", () => {
    const generatedPlans = [snapshot.generated, ...[5, 10, 15, 20].map((minutes) =>
      generateTrainingQualityCustomPlan({ createdAt: snapshot.asOf, bundle, state: snapshot.state,
        intent: snapshot.intent, projectionPolicy: current.projectionPolicy }, minutes))];
    for (const generated of generatedPlans) {
      assert(generated.ok && generated.plan);
      const plan = generated.plan;
      assert.equal(plan.generatorPolicyVersion, 3);
      assert(plan.definitionReferences.some((ref) => ref.kind === "policy"
        && ref.id === plan.generatorPolicyId && ref.version === 3));
      assert(isMixedWorkoutPlan(plan));
      assert.equal(workoutExecutionTimeline(plan, bundle)
        .reduce((sum, interval) => sum + interval.durationSeconds, 0), plan.intendedDurationSeconds);
      assert(validateSessionPlan(plan).valid);
      assert.equal(validateShadowSessionPlan(plan, plan.id, f.athleteId), null);
    }
    for (const record of triggeredSources.sessionRecords) {
      const plan = triggeredSources.sessionPlans.find((item) => item.id === record.planId);
      assert.equal(validateShadowSessionPair(plan, record, f.athleteId), null);
    }
    for (const version of [1, 2]) assert(isMixedWorkoutPlan({
      generatorPolicyId: snapshot.generated.plan.generatorPolicyId, generatorPolicyVersion: version,
    }));
  });
  const exported = await f.store.exportBundle(f.athleteId, { exportedAt: snapshot.asOf,
    catalogueVersions: current.history.map((entry) => entry.catalogueVersion),
    projectionVersions: [current.projectionPolicy.version], definitionFingerprints: [await sha256(current.history)],
    policyVersions: [{ id: current.projectionPolicy.id, version: current.projectionPolicy.version }] });
  const restored = createVNextShadowStore({ databaseName: `${f.athleteId}-restored` }); stores.push(restored);
  await restored.importBundle(exported);
  await restored.importBundle(exported);
  const restoredSources = await restored.readProjectionSources(f.athleteId);
  const restoredSnapshot = await createVNextReleaseCandidateRuntime({ store: restored, catalogue })
    .refresh({ athleteId: f.athleteId, asOf: snapshot.asOf });
  check("backup and repeated import retain exact generator 3 facts and derived dose", () => {
    assert.deepEqual(restoredSources.sessionPlans, triggeredSources.sessionPlans);
    assert.deepEqual(restoredSources.sessionRecords, triggeredSources.sessionRecords);
    assert.deepEqual(restoredSnapshot.state.retainedDoseAdjustments, snapshot.state.retainedDoseAdjustments);
    assert.equal(kneeSets(restoredSnapshot.generated), 3);
  });
  await complete(f, snapshot, "easy");
  snapshot = await refresh(f, 18);
  check("one completed Easy workout retains the dose and source provenance", () => {
    const response = kneeAdjustment(snapshot.state);
    assert.equal(response.manageableObservationRefs.length, 1);
    assert.equal(response.difficultObservationRefs.length, 2);
    assert.equal(kneeSets(snapshot.generated), 3);
  });
  await complete(f, snapshot, "easy", { brief: true });
  snapshot = await refresh(f, 25);
  check("a brief Easy attempt cannot count as the second recovery occasion", () => {
    assert.equal(kneeAdjustment(snapshot.state).manageableObservationRefs.length, 1);
    assert.equal(kneeSets(snapshot.generated), 3);
  });
  await complete(f, snapshot, "right");
  snapshot = await refresh(f, 32);
  check("two meaningful completed Easy/Right workouts release only the dose adjustment", () => {
    assert.equal(kneeAdjustment(snapshot.state), undefined);
    assert.equal(kneeSets(snapshot.generated), 4);
  });

  check("multiple matching items in one record remain one difficult occasion", () => {
    const sources = structuredClone(triggeredSources);
    sources.sessionRecords = [sources.sessionRecords[0]];
    const record = sources.sessionRecords[0], plan = sources.sessionPlans.find((item) => item.id === record.planId);
    const original = plan.items.find((item) => item.exerciseId === "knee-push-up");
    const copiedId = `${original.id}-repeat`;
    plan.items.push({ ...original, id: copiedId });
    plan.intendedDurationSeconds += original.plannedSeconds;
    record.itemOutcomes.push({ ...record.itemOutcomes.find((item) => item.planItemId === original.id), planItemId: copiedId });
    record.completedAt = new Date(Date.parse(record.completedAt) + original.plannedSeconds * 1000).toISOString();
    record.recordedAt = record.completedAt;
    assert.equal(kneeAdjustment(replay(f, sources, 11)), undefined);
  });

  const protocol = bundle.benchmarkProtocols.find((item) => item.id === "parallette-pushing-knee-push-up");
  const testResult = (day, suffix = "", outcome = "clean") => createGuidedProtocolEvidence(f.athleteId, bundle, {
    eventId: `reassessment-knee-${day < 0 ? `before-${-day}` : day}${suffix}`, observationSessionId: guidedObservationOccasionId(f.athleteId, at(day)),
    occurredAt: at(day), recordedAt: at(day), protocolId: protocol.id, outcome,
    measurement: { value: outcome === "clean" ? protocol.metric.minimum : 1, unit: "repetitions" },
    qualityCriteriaSatisfied: outcome === "clean", safetyCriteriaSatisfied: true,
  });
  check("an exact reassessment respects native observation and separate-occasion confirmation", () => {
    const one = { ...triggeredSources, evidenceEvents: [...triggeredSources.evidenceEvents, testResult(12)] };
    assert(kneeAdjustment(replay(f, one, 15)));
    const sameOccasion = { ...one, evidenceEvents: [...one.evidenceEvents, testResult(12, "-second")] };
    assert(kneeAdjustment(replay(f, sameOccasion, 15)));
    const confirmed = { ...one, evidenceEvents: [...one.evidenceEvents, testResult(15)] };
    assert.equal(kneeAdjustment(replay(f, confirmed, 16)), undefined);
    const oneFailure = { ...one, evidenceEvents: [...one.evidenceEvents, testResult(13, "", "partial"), testResult(15)] };
    assert.equal(kneeAdjustment(replay(f, oneFailure, 16)), undefined,
      "Use the existing protocol confirmation semantics, not a new universal no-failure rule");
  });
  check("old confirmations and symptoms cannot release a newly retained response", () => {
    const old = { ...triggeredSources, evidenceEvents: [...triggeredSources.evidenceEvents, testResult(-4), testResult(-1)] };
    assert(kneeAdjustment(replay(f, old, 11)));
    const symptom = structuredClone(triggeredSources);
    const recovery = structuredClone(triggeredSources.sessionRecords[0]);
    const plan = symptom.sessionPlans.find((item) => item.id === recovery.planId);
    const laterPlan = { ...structuredClone(plan), id: `${plan.id}-recovery`, createdAt: at(12) };
    recovery.id = `${recovery.id}-recovery`; recovery.planId = laterPlan.id;
    recovery.startedAt = at(12); recovery.completedAt = new Date(Date.parse(at(12)) + laterPlan.intendedDurationSeconds * 1000).toISOString();
    recovery.recordedAt = recovery.completedAt;
    for (const item of recovery.itemOutcomes) if (item.review) {
      item.status = "completed"; item.review = { outcome: "clean", difficulty: "easy", symptomOrInstability: true };
    }
    symptom.sessionPlans.push(laterPlan); symptom.sessionRecords.push(recovery);
    const state = replay(f, symptom, 13);
    assert(kneeAdjustment(state));
    assert.equal(kneeAdjustment(state).manageableObservationRefs.length, 0);
  });
  check("projection timing matches the frozen player's native first work intervals", () => {
    for (const exercise of bundle.exercises) for (const variant of exercise.prescriptionVariants) {
      for (const purpose of ["preparation", "primary-development", "guided-test", "recovery"]) for (const plannedSeconds of [1, 15, 60, 120, 480]) {
        const item = { id: "timing", exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion,
          prescriptionVariantId: variant.id, purpose, plannedSeconds, demand: variant.demand };
        const first = structureWorkoutItem(item, bundle).intervals.find((interval) => interval.kind === "work");
        assert.equal(meaningfulWorkoutParticipationSeconds(item, exercise, variant), Math.max(1, Math.ceil(first.durationSeconds / 2)));
      }
    }
  });
  console.log(`Persistent difficulty: ${checks} focused scenarios passed.`);
} finally {
  for (const store of stores) store.close();
}
