import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

createRequire(import.meta.url)("fake-indexeddb/auto");
const assessment = load("app/vnext/assessment/index.ts");
const { canonicalJson, sha256, createVNextShadowStore } = load("app/vnext/persistence/index.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { combinedProgressionCatalogue: previous } = load("app/vnext/production/combinedProgressionRelease.ts");
const { experiencedPlacementCatalogue: current } = load("app/vnext/production/experiencedPlacement.ts");
const { placementEntryRuleFor, placementReadinessSatisfied, placementSubjectDemonstrated } = load("app/vnext/placementEntry.ts");
const bundle = current.bundle;
const athleteId = "placement-compatibility-athlete";
const equipment = ["floor", "parallettes", "wall"];
const at = (day = 0, second = 0) => new Date(Date.parse("2026-10-01T09:00:00.000Z") + day * 86400000 + second * 1000).toISOString();
const intent = { schemaVersion: 1, athleteId, updatedAt: at(), goals: [{ graphId: "l-sit-v-sit", priority: "primary" }], equipment,
  defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
const stores = [];
const store = (label) => {
  const result = createVNextShadowStore({ databaseName: `placement-compatibility-${label}-${crypto.randomUUID()}` });
  stores.push(result);
  return result;
};
const protocol = (id) => {
  const result = bundle.benchmarkProtocols.find((item) => item.id === id);
  assert.ok(result, `Fixture protocol ${id} must exist`);
  return result;
};
const node = (state, id) => state.nodeStates.find((item) => item.milestone.nodeId === id);
const worksOn = (state, id) => state.workingNodes.some((item) => item.milestone.nodeId === id);
const measuredWork = (state, id) => state.workingNodes.some((item) => item.milestone.nodeId === id
  && item.reasonCodes.includes("measured-placement-practice"));
const observation = (id, protocolId, day = 0, outcome = "clean") => {
  const definition = protocol(protocolId);
  const metric = definition.metric;
  return { schemaVersion: 1, id, athleteId, occurredAt: at(day), recordedAt: at(day), source: "guided-test",
    catalogueVersion: bundle.catalogueVersion, type: "performance_observed", subject: definition.subject, outcome,
    benchmarkProtocolId: definition.id, benchmarkProtocolVersion: definition.definitionVersion,
    observationSessionId: assessment.guidedObservationOccasionId(athleteId, at(day)),
    assistance: definition.conditions.assistance, range: definition.conditions.range,
    ...(metric.kind === "duration-seconds" ? { measurement: { value: metric.minimum, unit: "seconds" } }
      : metric.kind === "repetitions" ? { measurement: { value: metric.minimum, unit: "repetitions" } }
      : metric.kind === "successful-attempts" ? { measurement: { value: metric.minimumSuccessful, unit: "attempts", attemptsTotal: metric.minimumSuccessful } } : {}) };
};
const project = (events, asOf = at(4), catalogue = current, candidateBundle = catalogue.bundle) => {
  const result = projectAthleteState({ athleteId, asOf, policy: catalogue.projectionPolicy,
    definitionBundles: catalogue.history.map((item) => item.catalogueVersion === candidateBundle.catalogueVersion ? candidateBundle : item),
    evidenceEvents: events, sessionPlans: [], sessionRecords: [], intent });
  assert.ok(result.ok && result.state, result.issues.map((item) => item.message).join("; "));
  return result.state;
};

try {
  // The release changes selection policy, not any native definition or reader.
  assert.equal(current.projectionPolicy.version, 9);
  assert.equal(previous.projectionPolicy.version, 8);
  assert.equal(bundle.catalogueVersion, 8);
  assert.strictEqual(current.bundle, previous.bundle);
  assert.strictEqual(current.history, previous.history);
  assert.deepEqual(current.history.map((item) => item.catalogueVersion), [1, 2, 3, 4, 5, 6, 7, 8]);

  // Resume a persisted policy-1 draft after upgrading; its old anchors and weak
  // immutable payload remain exact rather than becoming policy-2 skill choices.
  const drafts = store("drafts");
  await drafts.putAthleteIntent(intent);
  let time = 1;
  let legacy = assessment.createAssessmentDraft({ id: "pending-policy-one", athleteId, createdAt: at(), bundle,
    mode: "new-placement", initialEquipment: equipment });
  const legacyRoute = [];
  while (assessment.nextAssessmentStep(legacy, bundle).kind !== "review") {
    const step = assessment.nextAssessmentStep(legacy, bundle);
    legacyRoute.push(step.id);
    const answer = step.kind === "safety" ? { kind: "safety", severity: "none" }
      : step.kind === "experience" ? { kind: "experience", experience: "new" }
      : step.kind === "inactivity" ? { kind: "inactivity", inactivity: "active" }
      : step.kind === "goals" ? { kind: "goals", graphIds: ["parallette-pushing"] }
      : step.kind === "equipment" ? { kind: "equipment", equipment }
      : { kind: "anchor", response: step.id === "anchor-push-floor" ? "partial" : "clean" };
    legacy = assessment.answerAssessmentStep(legacy, answer, at(0, time++), bundle);
    if (step.id === "anchor-common-tall-support") {
      const pendingBytes = canonicalJson(legacy);
      await drafts.saveAssessmentDraft(legacy);
      const resumed = await createVNextReleaseCandidateRuntime({ store: drafts, catalogue: current }).refresh({ athleteId, asOf: at(0, time) });
      assert.equal(canonicalJson(resumed.assessmentDraft), pendingBytes);
      assert.equal(resumed.assessmentDraft.policyVersion, 1);
      assert.equal(assessment.nextAssessmentStep(resumed.assessmentDraft, bundle).id, "anchor-common-pike-access");
      legacy = resumed.assessmentDraft;
    }
    assert.ok(legacyRoute.length < 15);
  }
  assert.deepEqual(legacyRoute, ["context-safety", "context-experience", "context-inactivity", "goal-selection", "equipment-selection",
    "anchor-common-tall-support", "anchor-common-pike-access", "anchor-common-knee-push", "anchor-push-floor"]);
  const weakEvents = await assessment.buildAssessmentEvidence(legacy, bundle);
  const expectedWeak = await Promise.all([
    ["anchor-common-tall-support", "straight-arm-support-tall-support", "clean", 6],
    ["anchor-common-pike-access", "pike-compression-usable-pike-access", "clean", 7],
    ["anchor-common-knee-push", "parallette-pushing-knee-push-up", "clean", 8],
    ["anchor-push-floor", "parallette-pushing-floor-push-up", "partial", 9],
  ].map(async ([stepId, protocolId, outcome, second]) => ({ schemaVersion: 1,
    id: `assessment-${await sha256({ draftId: legacy.id, key: stepId })}`, athleteId,
    occurredAt: at(0, second), recordedAt: at(0, 9), source: "self-assessment", catalogueVersion: 8,
    type: "performance_observed", subject: protocol(protocolId).subject, outcome,
    benchmarkProtocolId: protocolId, benchmarkProtocolVersion: protocol(protocolId).definitionVersion })));
  assert.equal(canonicalJson(weakEvents), canonicalJson(expectedWeak), "Policy-1 weak event bytes changed");
  assert.ok(!worksOn(project(weakEvents), "floor-push-up"), "Legacy weak claims must not acquire own-practice permission");

  // Back retains unanswered choices, but editing an earlier selection invalidates
  // downstream choices. Save/read exercises the actual local draft contract.
  let modern = assessment.createAssessmentDraft({ id: "pending-policy-two", athleteId, createdAt: at(1), bundle,
    mode: "new-placement", placementVersion: 2, initialEquipment: equipment });
  let second = 1;
  while (assessment.nextAssessmentStep(modern, bundle).kind !== "review") {
    const step = assessment.nextAssessmentStep(modern, bundle);
    const answer = step.kind === "safety" ? { kind: "safety", severity: "none" }
      : step.kind === "experience" ? { kind: "experience", experience: "experienced" }
      : step.kind === "inactivity" ? { kind: "inactivity", inactivity: "active" }
      : step.kind === "goals" ? { kind: "goals", graphIds: ["parallette-pushing", "l-sit-v-sit"] }
      : step.kind === "equipment" ? { kind: "equipment", equipment }
      : { kind: "skill-selection", graphId: step.graphId,
        protocolId: step.graphId === "parallette-pushing" ? "parallette-pushing-floor-push-up" : "l-sit-v-sit-full-l-sit", response: "clean" };
    modern = assessment.answerAssessmentStep(modern, answer, at(1, second++), bundle);
  }
  const originalModern = modern;
  modern = assessment.goBackAssessment(modern, at(1, second++), bundle);
  await drafts.saveAssessmentDraft(modern);
  modern = await drafts.readAssessmentDraft(athleteId);
  assert.equal(assessment.nextAssessmentStep(modern, bundle).id, "skill-l-sit-v-sit");
  assert.equal(modern.revisitAnswers[0].value.protocolId, "l-sit-v-sit-full-l-sit");
  modern = assessment.goBackAssessment(modern, at(1, second++), bundle);
  modern = assessment.answerAssessmentStep(modern, { kind: "skill-selection", graphId: "parallette-pushing",
    protocolId: "parallette-pushing-floor-push-up", response: "clean" }, at(1, second++), bundle);
  assert.equal(modern.revisitAnswers[0].value.protocolId, "l-sit-v-sit-full-l-sit", "Unchanged earlier answer should retain the next choice");
  modern = assessment.goBackAssessment(modern, at(1, second++), bundle);
  modern = assessment.answerAssessmentStep(modern, { kind: "skill-selection", graphId: "parallette-pushing",
    protocolId: "parallette-pushing-tempo-push-up", response: "clean" }, at(1, second++), bundle);
  await drafts.saveAssessmentDraft(modern);
  modern = await drafts.readAssessmentDraft(athleteId);
  assert.equal(modern.revisitAnswers.length, 0, "Changed choice must invalidate later saved choices");
  assert.equal(assessment.nextAssessmentStep(modern, bundle).id, "skill-l-sit-v-sit");
  assert.ok(!modern.answers.some((item) => item.stepId === "skill-l-sit-v-sit"));
  const edited = assessment.editAssessmentAnswer(originalModern, "goal-selection", { kind: "goals", graphIds: ["l-sit-v-sit"] }, at(1, second++), bundle);
  assert.equal(assessment.nextAssessmentStep(edited, bundle).kind, "equipment");
  assert.ok(!edited.answers.some((item) => item.value.kind === "skill-selection"));

  // Direct measured practice never changes achievements or eligible successors.
  const full = protocol("l-sit-v-sit-full-l-sit");
  const rule = placementEntryRuleFor(full.subject);
  const readiness = rule.readinessProtocolIds.map((id, index) => observation(`ready-${index}`, id));
  const fullEvents = [...readiness, observation("full-first", full.id), observation("full-later", full.id, 1)];
  const originalEventBytes = canonicalJson(fullEvents);
  const oldState = project(fullEvents, at(4), previous);
  const newState = project(fullEvents);
  assert.equal(node(newState, "full-l-sit").lifecycle, "established");
  assert.equal(node(newState, "one-leg-l-sit").lifecycle, "unknown");
  assert.ok(measuredWork(newState, "full-l-sit"), "Established own skill must not disappear while older steps remain unconfirmed");
  assert.ok(!worksOn(oldState, "full-l-sit"), "Fixture must exercise the new selection boundary");
  assert.deepEqual(newState.nodeStates, oldState.nodeStates);
  assert.deepEqual(newState.capacityFindings, oldState.capacityFindings);
  assert.deepEqual(newState.eligibleTargets, oldState.eligibleTargets);
  assert.equal(canonicalJson(fullEvents), originalEventBytes, "Projection must not mutate original evidence");
  assert.ok(newState.recentLoad.exposures.every((item) => item.exerciseId), "Current guided load must resolve exact exercise identity");
  assert.ok(oldState.recentLoad.exposures.every((item) => item.exerciseId === undefined), "Historical projection output must retain its original shape");
  assert.ok(!worksOn(project(fullEvents.filter((item) => item.id !== "ready-0")), "full-l-sit"), "Missing measured readiness must fail closed");
  assert.ok(!worksOn(project(fullEvents, at(130)), "full-l-sit"), "Expired capacity readiness must fail closed");
  const contradicted = project([...fullEvents,
    observation("support-failure-one", "straight-arm-support-tall-support", 2, "partial"),
    observation("support-failure-two", "straight-arm-support-tall-support", 3, "not-yet")]);
  assert.ok(!worksOn(contradicted, "full-l-sit"), "Contradicted readiness must fail closed");
  assert.equal(node(contradicted, "full-l-sit").lifecycle, "established", "Readiness loss must preserve skill history");
  const gapBundle = { ...bundle, graphs: bundle.graphs.map((graph) => graph.id !== "l-sit-v-sit" ? graph : {
    ...graph, nodes: graph.nodes.map((item) => item.id === "full-l-sit" ? { ...item, implementationStatus: "missing-content" } : item),
  }) };
  assert.equal(placementReadinessSatisfied(rule, gapBundle, newState), false);
  assert.ok(!worksOn(project(fullEvents, at(4), current, gapBundle), "full-l-sit"), "A content gap cannot become measured practice");
  const contradictedOwn = project([...fullEvents, observation("full-failure-one", full.id, 2, "partial"),
    observation("full-failure-two", full.id, 3, "not-yet")]);
  assert.equal(node(contradictedOwn, "full-l-sit").confidence, "contradicted");
  assert.equal(placementSubjectDemonstrated(full.subject, contradictedOwn), false);
  assert.ok(!measuredWork(contradictedOwn, "full-l-sit"), "Contradicted skill may require reconfirmation, never measured-practice admission");
  const lean = protocol("planche-controlled-planche-lean");
  const leanRule = placementEntryRuleFor(lean.subject);
  const staleOwn = project([observation("old-lean", lean.id), ...leanRule.readinessProtocolIds.map((id, index) =>
    observation(`fresh-lean-readiness-${index}`, id, 65))], at(69));
  assert.equal(node(staleOwn, "controlled-planche-lean").confidence, "stale");
  assert.equal(placementReadinessSatisfied(leanRule, bundle, staleOwn), true, "Fixture must isolate stale skill from fresh readiness");
  assert.equal(placementSubjectDemonstrated(lean.subject, staleOwn), false);
  assert.ok(!measuredWork(staleOwn, "controlled-planche-lean"), "Stale skill may require reconfirmation, never measured-practice admission");

  // Refreshing through v9 and export/import retain exact v8 plans, records and
  // guided/weak observations, including their original provenance.
  const history = store("history");
  await history.putAthleteIntent(intent);
  const oldRuntime = createVNextReleaseCandidateRuntime({ store: history, catalogue: previous });
  const historical = await oldRuntime.refresh({ athleteId, asOf: at(2) });
  assert.ok(historical.generated.ok && historical.generated.plan);
  const plan = historical.generated.plan;
  const record = assessment.createSessionRecordFromWorkoutReview(plan, bundle, { recordId: "historical-v8-record",
    startedAt: at(2, 1), completedAt: at(2, 2), recordedAt: at(2, 2), status: "partial",
    itemOutcomes: plan.items.map((item) => ({ planItemId: item.id, status: "skipped", participationSeconds: 0 })) });
  await history.appendSession(plan, record);
  for (const event of [...weakEvents, ...fullEvents]) await history.appendEvidenceEvent(event);
  const metadata = { exportedAt: at(5), catalogueVersions: current.history.map((item) => item.catalogueVersion),
    projectionVersions: [8, 9], definitionFingerprints: [await sha256(bundle)],
    policyVersions: [{ id: previous.projectionPolicy.id, version: 8 }, { id: current.projectionPolicy.id, version: 9 }] };
  const before = await history.exportBundle(athleteId, metadata);
  const nextRuntime = createVNextReleaseCandidateRuntime({ store: history, catalogue: current });
  await nextRuntime.refresh({ athleteId, asOf: at(4) });
  assert.equal(canonicalJson(await history.exportBundle(athleteId, metadata)), canonicalJson(before), "New policy refresh changed exported observations");
  const restored = store("restored");
  const imported = await restored.importBundle(JSON.parse(JSON.stringify(before)));
  assert.ok(imported.inserted > 0);
  const duplicateImport = await restored.importBundle(JSON.parse(JSON.stringify(before)));
  assert.equal(duplicateImport.inserted, 0);
  await createVNextReleaseCandidateRuntime({ store: restored, catalogue: current }).refresh({ athleteId, asOf: at(4) });
  assert.equal(canonicalJson(await restored.exportBundle(athleteId, metadata)), canonicalJson(before), "Restored old observation bytes or provenance changed");
  const beforeSemanticRepeat = assessment.goBackAssessment(
    assessment.goBackAssessment(originalModern, at(1, second++), bundle), at(1, second++), bundle);
  const semanticRepeat = assessment.answerAssessmentStep(beforeSemanticRepeat, { kind: "skill-selection", graphId: "parallette-pushing",
    response: "clean", protocolId: "parallette-pushing-floor-push-up" }, at(1, second++), bundle);
  assert.equal(semanticRepeat.revisitAnswers[0]?.value.protocolId, "l-sit-v-sit-full-l-sit", "Property order must not turn an unchanged answer into an edit");
  console.log("Placement compatibility passed: native v1 draft/evidence, persistent v2 Back/edit, frozen v8 definitions and observation round-trip, measured own-practice retention and fail-closed readiness.");
} finally {
  for (const opened of stores) opened.close();
}
