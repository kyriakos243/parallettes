import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

createRequire(import.meta.url)("fake-indexeddb/auto");
const { trainingQualityCatalogue } = load("app/vnext/production/trainingQuality.ts");
const { generateProgressionSessionPlan, generateProgressionCustomPlan } = load("app/vnext/planning/feedbackDose.ts");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { createRestrictionReport } = load("app/vnext/assessment/index.ts");
const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const catalogue = { ...trainingQualityCatalogue, generateSession: generateProgressionSessionPlan,
  generateCustomSession: generateProgressionCustomPlan };
const stores = [];
let tick = 0;
const now = () => new Date(Date.parse("2026-10-20T12:00:00.000Z") + tick++ * 1000).toISOString();
const context = (goals = ["planche", "l-sit-v-sit"], equipment = ["floor"]) => [
  { kind: "safety", severity: "none" },
  { kind: "experience", experience: "new" },
  { kind: "inactivity", inactivity: "active" },
  { kind: "goals", graphIds: goals },
  { kind: "equipment", equipment },
];
const fixture = async (selectedCatalogue = catalogue) => {
  const athleteId = `paused-context-${crypto.randomUUID()}`;
  const base = createVNextShadowStore({ databaseName: athleteId });
  stores.push(base);
  const faults = { draft: false, intent: false, concurrentIntent: undefined };
  const store = new Proxy(base, { get(target, key) {
    if (key === "saveAssessmentDraft") return async draft => {
      if (faults.draft) throw new Error("Injected context draft failure");
      return target.saveAssessmentDraft(draft);
    };
    if (key === "putAthleteIntent") return async intent => {
      if (faults.intent) throw new Error("Injected context intent failure");
      if (faults.concurrentIntent) {
        const newer = faults.concurrentIntent; faults.concurrentIntent = undefined;
        await target.putAthleteIntent(newer);
      }
      return target.putAthleteIntent(intent);
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const runtime = createVNextReleaseCandidateRuntime({ store, catalogue: selectedCatalogue, clock: now });
  const started = await runtime.startAssessment({ athleteId, mode: "new-placement" });
  return { athleteId, base, store, faults, runtime, started };
};
const assertNoPerformance = snapshot => {
  assert.ok(snapshot.sources.evidenceEvents.every(event => event.type === "restriction_reported"));
  assert.equal(snapshot.sources.sessionRecords.length, 0);
  assert.ok(snapshot.state.nodeStates.every(node => !["demonstrated", "established"].includes(node.lifecycle)));
};

try {
  const f = await fixture();
  const untouched = canonicalJson(f.started.snapshot.intent);
  // On-screen choices have no authority until the actual Continue command.
  assert.equal(canonicalJson((await f.runtime.refresh({ athleteId: f.athleteId })).intent), untouched);
  let setup = await f.runtime.updateAssessmentContext({ draft: f.started.assessment.draft,
    answers: context(["planche", "l-sit-v-sit"], ["floor", "parallettes"]) });
  const submittedAt = setup.draft.answers.find(answer => answer.value.kind === "goals").answeredAt;
  let snapshot = await f.runtime.refresh({ athleteId: f.athleteId }); // Continue later, before Start checks.
  assert.deepEqual(snapshot.intent.goals, [
    { graphId: "planche", priority: "primary" }, { graphId: "l-sit-v-sit", priority: "secondary" },
  ]);
  assert.deepEqual(snapshot.intent.equipment, ["floor", "parallettes"]);
  assert.equal(snapshot.intent.updatedAt, submittedAt);
  assert.equal(snapshot.assessmentDraft.status, "in-progress");
  assert.equal(snapshot.generated.emphasis.primary.graphId, "planche", "Today honors the chosen main goal");
  assert.equal(snapshot.generated.plan.generatorPolicyVersion, 4, "The integrated fixture uses the current generator");
  assertNoPerformance(snapshot);
  for (const minutes of [5, 10, 15, 20]) {
    const generated = generateProgressionCustomPlan({ createdAt: snapshot.asOf, bundle: catalogue.bundle,
      state: snapshot.state, intent: snapshot.intent, projectionPolicy: catalogue.projectionPolicy }, minutes);
    assert.ok(generated.ok && generated.plan, `${minutes}-minute Custom uses the submitted context`);
    assert.equal(generated.plan.generatorPolicyVersion, 4);
    assert.equal(generated.emphasis.primary.graphId, "planche");
    assert.equal(validateWorkoutStart({ generated, bundle: catalogue.bundle, state: snapshot.state,
      intent: snapshot.intent, projectionPolicy: catalogue.projectionPolicy }).allowed, true);
  }
  const reopened = createVNextShadowStore({ databaseName: f.athleteId }); stores.push(reopened);
  const reloaded = createVNextReleaseCandidateRuntime({ store: reopened, catalogue, clock: now });
  assert.equal(canonicalJson((await reloaded.refresh({ athleteId: f.athleteId })).intent), canonicalJson(snapshot.intent));
  while (setup.draft.answers.length) setup = await f.runtime.backAssessment({ draft: setup.draft });
  assert.equal(canonicalJson((await reloaded.refresh({ athleteId: f.athleteId })).intent), canonicalJson(snapshot.intent),
    "Back never removes or re-dates already submitted context");
  setup = await f.runtime.updateAssessmentContext({ draft: setup.draft, answers: context() });
  const floorOnly = await reloaded.refresh({ athleteId: f.athleteId });
  assert.deepEqual(floorOnly.intent.equipment, ["floor"], "An explicit equipment reduction is immediately active");
  for (const minutes of [5, 10, 15, 20]) {
    const generated = generateProgressionCustomPlan({ createdAt: floorOnly.asOf, bundle: catalogue.bundle,
      state: floorOnly.state, intent: floorOnly.intent, projectionPolicy: catalogue.projectionPolicy }, minutes);
    if (generated.plan) assert.equal(validateWorkoutStart({ generated, bundle: catalogue.bundle, state: floorOnly.state,
      intent: floorOnly.intent, projectionPolicy: catalogue.projectionPolicy }).allowed, true,
    "A floor-only request may be unavailable, but cannot silently reuse unavailable equipment");
  }

  const interrupted = await fixture();
  interrupted.faults.draft = true;
  await assert.rejects(() => interrupted.runtime.updateAssessmentContext({
    draft: interrupted.started.assessment.draft, answers: context(),
  }), /Injected context draft/);
  assert.deepEqual((await interrupted.base.readProjectionSources(interrupted.athleteId)).intent.goals, []);
  interrupted.faults.draft = false;
  interrupted.faults.intent = true;
  await assert.rejects(() => interrupted.runtime.updateAssessmentContext({
    draft: interrupted.started.assessment.draft, answers: context(),
  }), /Injected context intent/);
  const retained = await interrupted.base.readAssessmentDraft(interrupted.athleteId);
  assert.equal(retained.answers.length, 5, "A second-write failure retains the exact submitted choices");
  await assert.rejects(() => interrupted.runtime.refresh({ athleteId: interrupted.athleteId }), /Injected context intent/,
    "Continue later cannot silently use old defaults after a failed save");
  interrupted.faults.intent = false;
  const recovered = createVNextReleaseCandidateRuntime({ store: interrupted.store, catalogue, clock: now });
  const restored = await recovered.refresh({ athleteId: interrupted.athleteId });
  assert.deepEqual(restored.intent.goals, snapshot.intent.goals);
  const retry = await interrupted.runtime.updateAssessmentContext({
    draft: interrupted.started.assessment.draft, answers: context(),
  });
  assert.equal(canonicalJson(retry.draft), canonicalJson(retained), "Visible-form retry retains original submission identity");
  assert.equal((await recovered.refresh({ athleteId: interrupted.athleteId })).intent.updatedAt,
    retained.answers.find(answer => answer.value.kind === "goals").answeredAt);
  assertNoPerformance(restored);

  // A stale open setup cannot replace choices that were saved in Progress.
  const edited = await fixture();
  let old = await edited.runtime.updateAssessmentContext({ draft: edited.started.assessment.draft,
    answers: context(["planche"], ["floor", "parallettes"]) });
  old = await edited.runtime.answerAssessment({ draft: old.draft,
    answer: { kind: "skill-selection", graphId: "planche", response: "not-sure" } });
  const changed = await edited.runtime.updateGoals({ athleteId: edited.athleteId,
    selection: { goals: [{ graphId: "parallette-pushing", priority: "primary" }] } });
  const savedGoals = canonicalJson(changed.intent);
  await assert.rejects(() => edited.runtime.commitAssessment({ athleteId: edited.athleteId, draft: old.draft }),
    /assessment-draft-revision-conflict/);
  assert.equal(canonicalJson((await edited.runtime.refresh({ athleteId: edited.athleteId })).intent), savedGoals);

  // A later remote intent remains current even when an old local setup receives
  // fresh placement answers. The answers never re-date goals/equipment.
  const remote = await fixture();
  let remoteSetup = await remote.runtime.updateAssessmentContext({ draft: remote.started.assessment.draft, answers: context(["planche"]) });
  const current = (await remote.base.readProjectionSources(remote.athleteId)).intent;
  const newer = { ...current, updatedAt: now(), goals: [{ graphId: "l-sit-v-sit", priority: "primary" }],
    equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "technique",
    preferences: { specialistOptIn: false, preferredDurationMinutes: 20 } };
  await remote.base.putAthleteIntent(newer);
  remoteSetup = await remote.runtime.answerAssessment({ draft: remoteSetup.draft,
    answer: { kind: "skill-selection", graphId: "planche", response: "not-sure" } });
  await remote.runtime.commitAssessment({ athleteId: remote.athleteId, draft: remoteSetup.draft });
  assert.equal(canonicalJson((await remote.runtime.refresh({ athleteId: remote.athleteId })).intent), canonicalJson(newer));

  // Intent storage resolves a concurrently arriving newer edit without overwriting it.
  const racing = await fixture();
  const at = now();
  const raced = { ...racing.started.snapshot.intent, updatedAt: now(),
    goals: [{ graphId: "parallette-pushing", priority: "primary" }] };
  racing.faults.concurrentIntent = raced;
  await racing.runtime.updateAssessmentContext({ draft: racing.started.assessment.draft, answers: context(), updatedAt: at });
  assert.equal(canonicalJson((await racing.runtime.refresh({ athleteId: racing.athleteId })).intent), canonicalJson(raced));
  const conflicting = await fixture();
  const conflictAt = now();
  const competing = { ...conflicting.started.snapshot.intent, updatedAt: conflictAt,
    goals: [{ graphId: "parallette-pushing", priority: "primary" }] };
  conflicting.faults.concurrentIntent = competing;
  await assert.rejects(() => conflicting.runtime.updateAssessmentContext({
    draft: conflicting.started.assessment.draft, answers: context(), updatedAt: conflictAt,
  }), /intent-timestamp-conflict/);
  const conflictRecovery = await conflicting.runtime.refresh({ athleteId: conflicting.athleteId });
  assert.equal(canonicalJson(conflictRecovery.intent), canonicalJson(competing),
    "A concurrent same-time conflict keeps saved intent intact and can recover on refresh");
  assertNoPerformance(conflictRecovery);

  // Native policy-1 drafts still submit one question at a time with their original routing.
  const { placementVersion: _placementVersion, ...nativeCatalogue } = catalogue;
  const native = await fixture(nativeCatalogue);
  let nativeSetup = native.started.assessment;
  for (const answer of context(["parallette-pushing"], ["floor", "parallettes"])) {
    nativeSetup = await native.runtime.answerAssessment({ draft: nativeSetup.draft, answer });
  }
  const nativeSnapshot = await native.runtime.refresh({ athleteId: native.athleteId });
  assert.equal(nativeSetup.draft.policyVersion, 1);
  assert.equal(nativeSetup.step.kind, "anchor");
  assert.deepEqual(nativeSnapshot.intent.goals, [{ graphId: "parallette-pushing", priority: "primary" }]);
  assertNoPerformance(nativeSnapshot);
  const nativeNewer = { ...nativeSnapshot.intent, updatedAt: now(),
    goals: [{ graphId: "l-sit-v-sit", priority: "primary" }], defaultSessionDemand: "technique",
    preferences: { specialistOptIn: false, preferredDurationMinutes: 15 } };
  await native.base.putAthleteIntent(nativeNewer);
  nativeSetup = await native.runtime.backAssessment({ draft: nativeSetup.draft });
  nativeSetup = await native.runtime.answerAssessment({ draft: nativeSetup.draft,
    answer: { kind: "equipment", equipment: ["floor"] } });
  const onlyEquipment = await native.runtime.refresh({ athleteId: native.athleteId });
  assert.deepEqual(onlyEquipment.intent.goals, nativeNewer.goals, "Later equipment alone cannot reapply the older goal answer");
  assert.deepEqual(onlyEquipment.intent.equipment, ["floor"]);
  assert.equal(onlyEquipment.intent.defaultSessionDemand, nativeNewer.defaultSessionDemand);
  assert.deepEqual(onlyEquipment.intent.preferences, nativeNewer.preferences);

  const safety = await fixture();
  const reportAt = now();
  const report = createRestrictionReport({ eventId: "paused-context-wrist-report", athleteId: safety.athleteId,
    occurredAt: reportAt, recordedAt: reportAt, catalogueVersion: catalogue.bundle.catalogueVersion,
    severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["left wrist"] });
  await safety.runtime.commitRestrictionReport({ athleteId: safety.athleteId, event: report });
  await safety.runtime.updateAssessmentContext({ draft: safety.started.assessment.draft,
    answers: context(["planche"], ["floor", "parallettes"]) });
  const restricted = await safety.runtime.refresh({ athleteId: safety.athleteId });
  assert.deepEqual(restricted.intent.goals, [{ graphId: "planche", priority: "primary" }]);
  assert.equal(restricted.state.activeRestrictions.length, 1, "Submitted No symptoms never clears a saved restriction");
  assert.equal(restricted.sources.evidenceEvents.length, 1);
  assert.equal(canonicalJson(restricted.sources.evidenceEvents[0]), canonicalJson(report));
  assertNoPerformance(restricted);
  console.log("Paused setup context passed: Today/Custom before checks, reload/Back, durable exact retries, newer Progress/synced intent, concurrent edits, native policy-1 routing, no capability awards and retained restrictions.");
} finally {
  for (const store of stores) store.close();
}
