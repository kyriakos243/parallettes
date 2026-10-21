import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
createRequire(import.meta.url)("fake-indexeddb/auto");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { trainingQualityCatalogue: catalogue } = load("app/vnext/production/trainingQuality.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId, createAssessmentDraft,
  createRestrictionReport, recommendPrerequisiteCheck } = load("app/vnext/assessment/index.ts");
const bundle = catalogue.bundle;
const at = "2026-10-21T09:00:00.000Z";
const earlier = "2026-10-17T09:00:00.000Z";
const capacityId = "overhead-support-active-elevation";
const protocol = bundle.benchmarkProtocols.find(item => item.id === capacityId);
assert.equal(protocol.metric.minimum, 8);
const athleteId = "synthetic-prerequisite-shortcut";
const store = createVNextShadowStore({ databaseName: `qa-prerequisite-shortcuts-${Date.now()}` });
const intent = { schemaVersion: 1, athleteId, updatedAt: earlier,
  goals: [{ graphId: "handstand-balance", priority: "primary" },
    { graphId: "vertical-push-hspu", priority: "secondary" }, { graphId: "parallette-pushing", priority: "secondary" }],
  equipment: ["floor", "wall", "parallettes"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
await store.putAthleteIntent(intent);
const result = (id, protocol, occurredAt = at) => ({ eventId: id,
  observationSessionId: guidedObservationOccasionId(athleteId, occurredAt), protocolId: protocol.id,
  occurredAt, recordedAt: occurredAt, outcome: "clean", qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true,
  measurement: protocol.metric.kind === "repetitions" ? { value: protocol.metric.minimum, unit: "repetitions" }
    : protocol.metric.kind === "duration-seconds" ? { value: protocol.metric.minimum, unit: "seconds" }
      : { value: protocol.metric.minimumSuccessful, unit: "attempts", attemptsTotal: protocol.metric.maximumAttempts } });
for (const id of ["handstand-balance-grounded-side-exit", "parallette-pushing-knee-push-up"]) {
  const native = bundle.benchmarkProtocols.find(item => item.id === id);
  await store.appendEvidenceEvent(createGuidedProtocolEvidence(athleteId, bundle, result(`prior-${id}`, native, earlier)));
}
const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => at });
let snapshot = await runtime.refresh({ athleteId, asOf: at });
const detail = snapshot.presentations.skillDetails.find(item => item.graphId === "vertical-push-hspu");
assert.equal(detail.assessmentAction.kind, "start-guided-test");
assert.deepEqual(detail.assessmentAction.protocolIds, [capacityId]);
assert.match(detail.assessmentAction.label, /Active overhead elevation.*8 reps/);
const action = snapshot.presentations.assessment.skillActions.find(item => item.graphId === detail.graphId);
assert.deepEqual(action.protocolIds, [capacityId]);
assert.equal(action.availability, "available");
assert(!snapshot.presentations.assessment.actions.some(item => item.protocolIds.includes(capacityId)), "No extra global checklist");
assert.equal(snapshot.progressionCheck.offer.protocolId, "handstand-balance-low-inversion-side-exit", "Today retains its main-goal check");
assert(snapshot.presentations.assessment.skillActions.some(item => item.graphId === "parallette-pushing"
  && item.protocolIds.includes("parallette-pushing-knee-push-up")), "Existing family confirmation remains");
console.log("PASS supporting HSPU opens its exact eight-rep prerequisite; Today and Pushing retain their own checks");

const before = canonicalJson(snapshot.sources);
await runtime.startProgressionCheck({ athleteId, protocolId: capacityId, asOf: at });
assert.equal(canonicalJson((await runtime.refresh({ athleteId, asOf: at })).sources), before);
assert.equal(await store.readAssessmentDraft(athleteId), null);
const draft = createAssessmentDraft({ id: "unrelated-paused-setup", athleteId, bundle, createdAt: earlier });
await store.saveAssessmentDraft(draft);
await runtime.startProgressionCheck({ athleteId, protocolId: capacityId, asOf: at });
assert.equal(canonicalJson(await store.readAssessmentDraft(athleteId)), canonicalJson(draft));
assert.equal(canonicalJson((await runtime.refresh({ athleteId, asOf: at })).intent), canonicalJson(intent));
console.log("PASS direct opening creates no observations or setup and preserves unrelated draft/goals");

const input = { athleteId, asOf: at, catalogueVersion: bundle.catalogueVersion,
  result: result("exact-capacity-check", protocol) };
const saved = await runtime.commitProgressionCheck(input);
await runtime.commitProgressionCheck(input);
snapshot = await runtime.refresh({ athleteId, asOf: at });
assert.equal(snapshot.sources.evidenceEvents.length, 3);
assert.equal(snapshot.sources.sessionRecords.length, 0);
assert.equal(canonicalJson(snapshot.intent), canonicalJson(intent));
assert.equal(canonicalJson(await store.readAssessmentDraft(athleteId)), canonicalJson(draft));
await assert.rejects(runtime.startProgressionCheck({ athleteId, protocolId: capacityId, asOf: at }), /another day|recovered|no longer/);
const building = snapshot.state.capacityFindings.find(item => item.capacity.capacityId === "overhead-support"
  && item.capacity.facetId === "active-elevation");
assert.equal(building.confirmationSatisfied, protocol.confirmation.qualifyingObservations <= 1
  && protocol.confirmation.minimumDistinctSessions <= 1, "Native qualifying-occasion rule is unchanged");
await assert.rejects(runtime.commitProgressionCheck({ ...input, result: { ...input.result, eventId: "invalid-retry", measurement: { value: 7, unit: "repetitions" } } }), /no longer available|target|measurement/);
console.log("PASS one exact immutable observation, retry deduplication, measured target and genuine-occasion requirements remain");

// New restrictions block both newly opened and already-open checks. Exact saved retries remain safe.
await store.appendEvidenceEvent(createRestrictionReport({ eventId: "overhead-restriction", athleteId,
  catalogueVersion: bundle.catalogueVersion, occurredAt: at, recordedAt: at,
  demandDomains: ["overhead-straight-arm-upper-limb"], severity: "block", bodyRegions: ["upper body"], notes: "Synthetic only" }));
snapshot = await runtime.refresh({ athleteId, asOf: at });
const restrictedAction = snapshot.presentations.assessment.skillActions.find(item => item.graphId === "vertical-push-hspu");
assert.equal(restrictedAction.availability, "blocked");
assert(restrictedAction.blockers.some(message => /restriction/.test(message)));
await assert.rejects(runtime.startProgressionCheck({ athleteId, protocolId: capacityId, asOf: at }), /restriction|no longer|another day|recovered/);
await assert.rejects(runtime.commitProgressionCheck({ ...input, result: { ...input.result, eventId: "new-unsafe-result" } }), /no longer available/);
assert.equal(canonicalJson((await runtime.commitProgressionCheck(input)).event), canonicalJson(saved.event));
await assert.rejects(runtime.startProgressionCheck({ athleteId, protocolId: "vertical-push-hspu-full-wall-hspu", asOf: at }), /no longer/);
console.log("PASS restrictions are rechecked at opening/save; unrelated harder checks remain unavailable");

// Exercise the shared dependency resolver with one genuine anyOf route. A met
// alternative must never manufacture a need to check all of its siblings.
const customBundle = structuredClone(bundle);
const target = detail.nextTarget.milestone;
const node = customBundle.graphs.find(graph => graph.id === target.graphId).nodes.find(item => item.id === target.nodeId);
const alternative = bundle.benchmarkProtocols.find(item => item.subject.kind === "capacity-facet" && item.id !== capacityId);
node.prerequisiteRule = { allOf: [], anyOf: [
  { kind: "capacity-facet", capacity: protocol.subject.capacity },
  { kind: "capacity-facet", capacity: alternative.subject.capacity },
] };
const state = structuredClone(snapshot.state);
state.activeRestrictions = [];
state.recentLoad.exposures = [];
const finding = state.capacityFindings.find(item => item.capacity.capacityId === alternative.subject.capacity.capacityId
  && item.capacity.facetId === alternative.subject.capacity.facetId);
Object.assign(finding, { finding: "demonstrated", confirmationSatisfied: true, confidence: "current" });
const context = { bundle: customBundle, state, intent, projectionPolicy: catalogue.projectionPolicy };
assert.equal(recommendPrerequisiteCheck(context, target), undefined);
console.log("PASS a satisfied anyOf branch does not become a checklist of all alternatives");

// A partially confirmed prerequisite from another family keeps a working
// confirmation action. Its offer reason is reconfirm-existing, but the native
// presentation calls confirmation-building a guided test, not reconfirmation.
const transitionAthlete = "synthetic-cross-family-confirmation";
await store.putAthleteIntent({ ...intent, athleteId: transitionAthlete,
  goals: [{ graphId: "transitions", priority: "primary" }] });
const support = bundle.benchmarkProtocols.find(item => item.id === "straight-arm-support-tall-support");
const tuck = bundle.benchmarkProtocols.find(item => item.id === "l-sit-v-sit-tuck-support");
for (const [index, occurredAt] of ["2026-10-10T09:00:00.000Z", "2026-10-14T09:00:00.000Z"].entries()) {
  await store.appendEvidenceEvent(createGuidedProtocolEvidence(transitionAthlete, bundle, {
    ...result(`cross-family-support-${index}`, support, occurredAt),
    observationSessionId: guidedObservationOccasionId(transitionAthlete, occurredAt),
  }));
}
await store.appendEvidenceEvent(createGuidedProtocolEvidence(transitionAthlete, bundle, {
  ...result("cross-family-first-tuck", tuck, earlier),
  observationSessionId: guidedObservationOccasionId(transitionAthlete, earlier),
}));
const transitionSnapshot = await runtime.refresh({ athleteId: transitionAthlete, asOf: at });
const transitionDetail = transitionSnapshot.presentations.skillDetails.find(item => item.graphId === "transitions");
const transitionAction = transitionSnapshot.presentations.assessment.skillActions.find(item => item.graphId === "transitions");
assert.deepEqual(transitionDetail.assessmentAction.protocolIds, [tuck.id]);
assert.equal(transitionAction.kind, "guided-test");
assert.equal(transitionDetail.assessmentAction.kind, "start-guided-test", "Detail binds the native confirmation-building action kind");
assert.equal(transitionAction.availability, "available");
assert.match(transitionAction.label, /Complete confirmation/);
const transitionCheck = await runtime.startProgressionCheck({ athleteId: transitionAthlete, protocolId: tuck.id, asOf: at });
assert.equal(transitionCheck.check.offer.protocolId, tuck.id);
assert.equal(transitionCheck.check.offer.reason, "reconfirm-existing");
await store.clearAthlete(transitionAthlete);
console.log("PASS a cross-family prerequisite with partial confirmation retains its exact usable guided action");

await store.clearAthlete(athleteId);
store.close();
console.log("Prerequisite shortcuts: 6 focused groups passed (synthetic data only).");
