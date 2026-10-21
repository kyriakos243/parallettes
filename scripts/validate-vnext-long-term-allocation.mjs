import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

createRequire(import.meta.url)("fake-indexeddb/auto");
const { trainingQualityCatalogue } = load("app/vnext/production/trainingQuality.ts");
const { restrictionSafetyCatalogue } = load("app/vnext/production/restrictionSafety.ts");
const { generateFeedbackVNextSession, generateFeedbackVNextCustomSession,
  generateTrainingQualitySessionPlan, generateTrainingQualityCustomPlan } = load("app/vnext/planning/feedbackDose.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const { structureWorkoutPlan } = load("app/vnext/workoutUx.ts");
const { isMixedWorkoutPlan } = load("app/vnext/mixedWorkout.ts");
const { hasMeaningfulEmphasisTraining } = load("app/vnext/releaseCandidate/emphasisCompletion.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId, createRestrictionReport } = load("app/vnext/assessment/index.ts");
const { vNextReleaseCandidateManifest } = load("app/vnext/releaseCandidate/manifest.ts");
const { isStableId } = load("app/vnext/contracts.ts");
const { composeSession } = load("app/vnext/planning/composer.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const catalogue = { ...trainingQualityCatalogue, generateSession: generateTrainingQualitySessionPlan, generateCustomSession: generateTrainingQualityCustomPlan };
const bundle = catalogue.bundle;
const day = 86_400_000;
const start = Date.parse("2026-10-20T09:00:00.000Z");
const iso = (time) => new Date(time).toISOString();
const stores = [];

// Exercise the production continuity rules rather than inventing an audit-only
// session counter. These helpers own the otherwise external localStorage state.
const appPath = new URL("../app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", import.meta.url);
const source = ts.createSourceFile(appPath.pathname, readFileSync(appPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statement = (name) => {
  let result;
  const visit = (node) => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(source) === name)) result = node;
    if (!result) ts.forEachChild(node, visit);
  };
  visit(source);
  assert(result, `Production continuity helper ${name} exists`);
  return result.getText(source);
};
const memory = new Map();
const bindings = {
  localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
  storageKeyPrefix: (namespace, key) => `${namespace}:${key}:`,
  vNextReleaseCandidateManifest, isStableId, isMixedWorkoutPlan, hasMeaningfulEmphasisTraining,
};
const helpers = ts.transpileModule(`${statement("readPreviousEmphasis")}\n${statement("rememberCompletedEmphasis")}
  return { readPreviousEmphasis, rememberCompletedEmphasis };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { readPreviousEmphasis, rememberCompletedEmphasis } = new Function(...Object.keys(bindings), helpers)(...Object.values(bindings));

const measurement = (protocol) => protocol.metric.kind === "duration-seconds" ? { value: protocol.metric.minimum, unit: "seconds" }
  : protocol.metric.kind === "repetitions" ? { value: protocol.metric.minimum, unit: "repetitions" }
    : protocol.metric.kind === "successful-attempts" ? { value: protocol.metric.minimumSuccessful, unit: "attempts", attemptsTotal: protocol.metric.maximumAttempts }
      : undefined;
const fixture = async (name, goals, nodes = [], selectedCatalogue = catalogue) => {
  const athleteId = `allocation-${name}`;
  const store = createVNextShadowStore({ databaseName: athleteId });
  stores.push(store);
  const time = { value: iso(start) };
  const runtime = createVNextReleaseCandidateRuntime({ store, catalogue: selectedCatalogue, clock: () => time.value });
  const intent = { schemaVersion: 1, athleteId, updatedAt: iso(start - 100 * day), goals,
    equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
  await store.putAthleteIntent(intent);
  const confirmed = new Set();
  let sequence = 0;
  const events = [];
  const confirmProtocol = (protocol) => {
    assert(protocol);
    if (confirmed.has(protocol.id)) return;
    confirmed.add(protocol.id);
    const count = Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions);
    for (let index = 0; index < count; index++) {
      const occurredAt = iso(start - (35 + (count - index) * 3) * day + sequence * 1000);
      const result = { eventId: `${name}-proof-${++sequence}`, observationSessionId: guidedObservationOccasionId(athleteId, occurredAt),
        protocolId: protocol.id, occurredAt, recordedAt: occurredAt, outcome: "clean", qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true,
        ...(measurement(protocol) ? { measurement: measurement(protocol) } : {}) };
      events.push(createGuidedProtocolEvidence(athleteId, bundle, result));
    }
  };
  const confirmRef = (ref) => {
    if (ref.kind === "milestone") return confirmNode(ref.milestone.graphId, ref.milestone.nodeId);
    if (ref.kind === "benchmark") return confirmProtocol(bundle.benchmarkProtocols.find((item) => item.id === ref.benchmarkProtocolId));
    const facet = bundle.capacities.find((item) => item.id === ref.capacity.capacityId)?.facets.find((item) => item.id === ref.capacity.facetId);
    confirmProtocol(bundle.benchmarkProtocols.find((item) => item.id === facet?.benchmarkProtocolIds[0]));
  };
  const confirmNode = (graphId, nodeId) => {
    const node = bundle.graphs.find((item) => item.id === graphId)?.nodes.find((item) => item.id === nodeId);
    assert(node);
    for (const ref of node.prerequisiteRule?.allOf ?? []) confirmRef(ref);
    if (node.prerequisiteRule?.anyOf?.length) confirmRef(node.prerequisiteRule.anyOf[0]);
    confirmProtocol(bundle.benchmarkProtocols.find((item) => item.id === node.benchmarkProtocolIds[0]));
  };
  for (const [graphId, nodeId] of nodes) confirmNode(graphId, nodeId);
  for (const event of events) await store.appendEvidenceEvent(event);
  const refresh = (extra = {}) => runtime.refresh({ athleteId, asOf: time.value, seed: `${athleteId}:${time.value.slice(0, 10)}`,
    previousEmphasis: readPreviousEmphasis(athleteId, "allocation"), ...extra });
  const complete = async (snapshot, skipMaintenance = false) => {
    const { generated } = snapshot;
    const plan = generated.plan;
    assert(plan && generated.ok, JSON.stringify(generated.issues));
    const work = new Map(structureWorkoutPlan(plan, bundle).map((item) => [item.planItemId,
      item.intervals.filter((interval) => interval.kind === "work").reduce((sum, interval) => sum + interval.durationSeconds, 0)]));
    const timerItemOutcomes = plan.items.filter((item) => ["preparation", "recovery"].includes(item.purpose))
      .map((item) => ({ planItemId: item.id, status: "completed", participationSeconds: work.get(item.id), participationBasis: "measured" }));
    const reviewAnswers = plan.items.filter((item) => !["preparation", "recovery"].includes(item.purpose)).map((item) =>
      skipMaintenance && item.purpose === "maintenance" ? { planItemId: item.id, status: "skipped", participationSeconds: 0 } : {
        planItemId: item.id, status: "completed", participationSeconds: work.get(item.id), difficulty: "right", symptomOrInstability: false,
      });
    const startedAt = time.value;
    time.value = iso(Date.parse(startedAt) + plan.intendedDurationSeconds * 1000);
    const prepared = runtime.prepareWorkoutCompletion({ generated, timerItemOutcomes, reviewAnswers, startedAt,
      completedAt: time.value, recordedAt: time.value, status: "complete" });
    const saved = await runtime.commitWorkoutCompletion({ athleteId, prepared });
    rememberCompletedEmphasis(athleteId, generated, prepared, "allocation",
      selectedCatalogue.history.find((native) => native.catalogueVersion === prepared.plan.catalogueVersion));
    return saved;
  };
  return { athleteId, store, runtime, time, intent, refresh, complete };
};
const pushing = { graphId: "parallette-pushing", priority: "primary" };
const supportingLSit = { graphId: "l-sit-v-sit", priority: "secondary" };

try {
  const beginner = await fixture("beginner", [pushing, supportingLSit]);
  for (let session = 0; session < 18; session++) {
    beginner.time.value = iso(start + session * 3 * day);
    const snapshot = await beginner.refresh();
    assert.equal(snapshot.generated.plan.generatorPolicyVersion, 3, "Exercise the current production execution planner");
    assert.equal(snapshot.generated.emphasis.secondary?.graphId, "l-sit-v-sit");
    const items = snapshot.generated.plan.items;
    const secondary = items.find((item) => item.exerciseId === "support-hold" && item.purpose === "secondary-development");
    assert(secondary, `Session ${session + 1} develops the supporting goal's actual missing Tall support capacity`);
    assert(secondary.plannedSeconds >= 120 && secondary.plannedSeconds <= 240, "Supporting work retains its small dose");
    assert(items.find((item) => item.exerciseId === "knee-push-up").plannedSeconds > secondary.plannedSeconds, "Main goal keeps priority");
    assert(snapshot.generated.plan.intendedDurationSeconds <= 1500);
    assert.equal(snapshot.presentations.today.secondary?.familyLabel, "L-Sit / V-Sit");
    assert.equal(canonicalJson((await beginner.refresh()).generated), canonicalJson(snapshot.generated), "Same state/seed replays exactly");
    await beginner.complete(snapshot);
  }
  const before = await beginner.store.readProjectionSources(beginner.athleteId);
  beginner.time.value = iso(start + 54 * day);
  const changed = await beginner.runtime.updateGoals({ athleteId: beginner.athleteId, asOf: beginner.time.value,
    previousEmphasis: readPreviousEmphasis(beginner.athleteId, "allocation"),
    selection: { goals: [{ ...supportingLSit, priority: "primary" }, { ...pushing, priority: "secondary" }] } });
  assert(changed.generated.plan.items.some((item) => item.exerciseId === "support-hold" && item.purpose === "primary-development"));
  assert.equal(canonicalJson((await beginner.store.readProjectionSources(beginner.athleteId)).evidenceEvents), canonicalJson(before.evidenceEvents));
  assert(before.sessionRecords.every((record) => record.itemOutcomes.every((item) => !item.benchmarkObservation)), "Ordinary training invents no measured checks");

  const demand = await fixture("demand", [pushing, supportingLSit]);
  for (const sessionDemand of ["technique", "standard", "challenge"]) {
    const snapshot = await demand.refresh({ sessionDemand });
    const support = snapshot.generated.plan.items.find((item) => item.purpose === "secondary-development");
    assert(support && support.plannedSeconds >= 120 && support.plannedSeconds <= 240, `${sessionDemand}: small supporting dose`);
    assert.equal(support.exerciseId, "support-hold");
    assert(!support.targetMilestone && !support.benchmarkProtocolId, "Capacity practice claims no unearned milestone or measured test");
    assert(snapshot.generated.plan.intendedDurationSeconds <= 1500);
  }
  for (const graphId of ["handstand-balance", "press-to-handstand"]) {
    const technical = await fixture(`technical-${graphId}`, [pushing, { graphId, priority: "secondary" }]);
    const snapshot = await technical.refresh();
    const items = snapshot.generated.plan.items;
    const safety = items.findIndex((item) => item.exerciseId === "grounded-side-exit-rehearsal");
    assert(safety >= 0 && safety < items.findIndex((item) => item.exerciseId === "knee-push-up"),
      `${graphId}: supporting technical prerequisite/skill occurs before strength`);
    assert.equal(items[safety].purpose, "secondary-development");
    assert(items[safety].plannedSeconds <= 240);
    assert.equal(snapshot.generated.itemExplanations.find((item) => item.planItemId === items[safety].id).block, "technical");
  }
  const equipment = await fixture("equipment", [pushing, supportingLSit]);
  await equipment.store.putAthleteIntent({ ...equipment.intent, equipment: ["floor"], updatedAt: equipment.time.value });
  const floorOnly = await equipment.refresh();
  assert((floorOnly.generated.plan?.items ?? []).every((item) =>
    bundle.exercises.find((exercise) => exercise.id === item.exerciseId).equipment.every((required) => required === "floor")),
  "Supporting allocation never bypasses missing equipment");
  await equipment.store.appendEvidenceEvent(createRestrictionReport({ eventId: "allocation-wrist-block", athleteId: equipment.athleteId,
    occurredAt: equipment.time.value, recordedAt: equipment.time.value, catalogueVersion: bundle.catalogueVersion,
    severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["wrist"] }));
  const restricted = await equipment.refresh();
  assert(!(restricted.generated.plan?.items ?? []).some((item) => item.exerciseId === "support-hold"),
    "A supporting goal cannot restore wrist-bearing work through a restriction");

  const native = await fixture("native", [pushing, supportingLSit], [], { ...restrictionSafetyCatalogue,
    generateSession: generateFeedbackVNextSession, generateCustomSession: generateFeedbackVNextCustomSession });
  const nativePlan = await native.refresh();
  assert(!nativePlan.generated.plan.items.some((item) => item.exerciseId === "support-hold"), "Frozen policy10 keeps its original native behavior");

  const shared = await fixture("shared", [{ ...supportingLSit, priority: "primary" }, { graphId: "planche", priority: "secondary" }]);
  const sharedPlan = await shared.refresh();
  assert.equal(sharedPlan.generated.emphasis.secondary?.graphId, "planche");
  assert.equal(sharedPlan.generated.plan.items.filter((item) => item.exerciseId === "support-hold").length, 1, "Shared prerequisite is not duplicated");

  const sharedOnly = composeSession({ createdAt: shared.time.value, bundle, intent: shared.intent, state: sharedPlan.state,
    projectionPolicy: catalogue.projectionPolicy }, { ...sharedPlan.generated.emphasis, secondary: {
    graphId: "planche", kind: "prerequisite-development", missingPrerequisites: [{
      kind: "capacity-facet", capacity: { capacityId: "straight-arm-support", facetId: "tall-support" },
    }], reasonCodes: [], userMessage: "Build Planche prerequisites.",
  } });
  assert(sharedOnly.ok && sharedOnly.emphasis.secondary?.graphId === "planche");
  assert.equal(sharedOnly.plan.items.filter((item) => item.exerciseId === "support-hold").length, 1);
  assert(sharedOnly.itemExplanations.some((item) => item.whySkill.includes("This also supports")), "An already-selected exact requirement can support both goals");

  const emptySupporting = { ...sharedPlan.generated.emphasis, secondary: {
    graphId: "planche", kind: "prerequisite-development", missingPrerequisites: [], reasonCodes: [], userMessage: "Build Planche prerequisites.",
  } };
  const honest = composeSession({ createdAt: shared.time.value, bundle, intent: shared.intent, state: sharedPlan.state,
    projectionPolicy: catalogue.projectionPolicy }, emptySupporting);
  assert(honest.ok);
  assert.equal(honest.emphasis.secondary, undefined, "A supporting focus with no selected work is not advertised");
  assert(honest.emphasis.deferredGraphIds.includes("planche"));

  const maintenanceNodes = [["l-sit-v-sit", "tuck-support"], ["vertical-push-hspu", "shallow-pike-push-up"]];
  const maintenance = await fixture("maintenance", [pushing], maintenanceNodes);
  const counts = new Map();
  const initial = await maintenance.refresh();
  const originalConfidence = initial.state.nodeStates.filter((item) => maintenanceNodes.some(([graphId, nodeId]) =>
    item.milestone.graphId === graphId && item.milestone.nodeId === nodeId)).map((item) => [item.milestone, item.lifecycle, item.confidence]);
  for (let session = 0; session < 24; session++) {
    maintenance.time.value = iso(start + session * 3 * day);
    const snapshot = await maintenance.refresh();
    const item = snapshot.generated.plan.items.find((candidate) => candidate.purpose === "maintenance");
    assert(item, `Session ${session + 1} retains compatible maintenance`);
    counts.set(item.exerciseId, (counts.get(item.exerciseId) ?? 0) + 1);
    await maintenance.complete(snapshot);
  }
  assert.equal(counts.get("tuck-support"), 12, JSON.stringify([...counts]));
  assert.equal(counts.get("shallow-range-pike-pushup"), 12, JSON.stringify([...counts]));
  const final = await maintenance.refresh();
  assert.deepEqual(final.state.nodeStates.filter((item) => maintenanceNodes.some(([graphId, nodeId]) =>
    item.milestone.graphId === graphId && item.milestone.nodeId === nodeId)).map((item) => [item.milestone, item.lifecycle, item.confidence]), originalConfidence,
  "Allocating actual practice never manufactures benchmark freshness or achievement");

  const infrequent = await fixture("infrequent", [pushing], maintenanceNodes);
  const first = await infrequent.refresh();
  await infrequent.complete(first, true);
  infrequent.time.value = iso(start + 10 * day);
  const skipped = await infrequent.refresh();
  assert.equal(skipped.generated.emphasis.maintenance[0].targetMilestone.nodeId, first.generated.emphasis.maintenance[0].targetMilestone.nodeId,
    "Skipping the maintenance item does not count as exposure");
  await infrequent.complete(skipped);
  infrequent.time.value = iso(start + 20 * day);
  const next = await infrequent.refresh();
  assert.notEqual(next.generated.emphasis.maintenance[0].targetMilestone.nodeId, skipped.generated.emphasis.maintenance[0].targetMilestone.nodeId,
    "Maintenance recency survives beyond the seven-day recent-load window");
  const sources = await infrequent.store.readProjectionSources(infrequent.athleteId);
  const brief = projectAthleteState({
    athleteId: infrequent.athleteId, asOf: infrequent.time.value, policy: catalogue.projectionPolicy,
    definitionBundles: catalogue.history, ...sources,
    sessionRecords: sources.sessionRecords.map((record) => ({ ...record, itemOutcomes: record.itemOutcomes.map((item) =>
      ({ ...item, participationSeconds: item.participationSeconds > 0 ? 1 : 0 })) })),
  });
  assert(brief.ok, JSON.stringify(brief.issues));
  assert.equal(brief.state.maintenanceExposures.length, 0, "A completed label on a one-second attempt cannot postpone maintenance");
  console.log("Long-term allocation: supporting prerequisites, honest focus, goal changes, native behavior, 24-session fairness and distant/skipped maintenance passed.");
} finally {
  for (const store of stores) await store.close();
}
