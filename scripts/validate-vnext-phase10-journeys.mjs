import { createRequire } from "node:module";

createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const resolveTypeScriptModule = (specifier, parentPath) => {
  const base = resolve(dirname(parentPath), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  const found = candidates.find((candidate) => {
    try { readFileSync(candidate); return true; } catch { return false; }
  });
  if (!found) throw new Error(`Cannot resolve ${specifier} from ${relative(projectRoot, parentPath)}`);
  return found;
};

const loadTypeScriptModule = (path) => {
  const absolutePath = resolve(projectRoot, path);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  if (process.env.P25_VALIDATION_PROGRESS === "1") console.error(`load: ${relative(projectRoot, absolutePath)}`);
  let source = readFileSync(absolutePath, "utf8");
  if (absolutePath.endsWith("/app/program.ts")) {
    source = source.replaceAll("import.meta.env.BASE_URL", '"/parallettes/"');
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const loaded = { exports: {} };
  moduleCache.set(absolutePath, loaded);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) throw new Error(`Unexpected runtime import ${specifier}`);
    return loadTypeScriptModule(relative(projectRoot, resolveTypeScriptModule(specifier, absolutePath)));
  };
  new Function("exports", "module", "require", "__filename", "__dirname", compiled)(
    loaded.exports, loaded, localRequire, absolutePath, dirname(absolutePath),
  );
  return loaded.exports;
};

const contracts = loadTypeScriptModule("app/vnext/contracts.ts");
const definitions = loadTypeScriptModule("app/vnext/definitions/index.ts");
const persistence = loadTypeScriptModule("app/vnext/persistence/index.ts");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const runtimeModule = loadTypeScriptModule("app/vnext/releaseCandidate/runtime.ts");

const bundle = definitions.vNextDefinitionBundle;
const failures = [];
const journeyResults = [];
const stores = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const canonical = persistence.canonicalJson;
const allEquipment = ["floor", "parallettes", "wall"].map((id) =>
  contracts.parseStableId("equipment", id));
const floorOnly = [contracts.parseStableId("equipment", "floor")];
const at = (day, minute = 0) => new Date(Date.UTC(2026, 8, day, 9, minute, 0, 0)).toISOString();
const athlete = (label) => contracts.parseStableId("athlete", `phase10-journey-${label}`);
const makeStore = (label) => {
  const store = persistence.createVNextShadowStore({
    databaseName: `parallette25-vnext-phase10-journey-${label}-${crypto.randomUUID()}`,
  });
  stores.push(store);
  return store;
};

const goal = (graphId, priority = "primary", targetNodeId) => ({
  graphId,
  priority,
  ...(targetNodeId ? { targetNodeId: contracts.parseStableId("node", targetNodeId) } : {}),
});

const answerFor = (step, scenario) => {
  switch (step.kind) {
    case "safety": return scenario.safety ?? { kind: "safety", severity: "none" };
    case "experience": return { kind: "experience", experience: scenario.experience ?? "new" };
    case "inactivity": return { kind: "inactivity", inactivity: scenario.inactivity ?? "active" };
    case "goals": return { kind: "goals", graphIds: scenario.goals };
    case "equipment": return { kind: "equipment", equipment: scenario.equipment ?? allEquipment };
    case "inversion": return { kind: "inversion", familiarity: scenario.inversion ?? "none" };
    case "anchor": {
      const response = typeof scenario.anchor === "function"
        ? scenario.anchor(step.anchor)
        : scenario.anchor ?? "not-yet";
      return {
        kind: "anchor",
        response,
        ...(response === "symptom" ? { bodyRegions: ["left wrist"] } : {}),
      };
    }
    default: throw new Error(`Unexpected assessment step ${step.kind}`);
  }
};

const createRuntime = (label, store = makeStore(label)) => {
  let serial = 0;
  return {
    store,
    runtime: runtimeModule.createVNextReleaseCandidateRuntime({
      store,
      clock: () => at(1, serial += 1),
      idFactory: ({ kind }) => `${kind}-phase10-${label}-${serial}`,
    }),
  };
};

const measurementFor = (protocol) => {
  if (protocol.metric.kind === "duration-seconds") {
    return { value: protocol.metric.minimum, unit: "seconds" };
  }
  if (protocol.metric.kind === "repetitions") {
    return { value: protocol.metric.minimum, unit: "repetitions" };
  }
  if (protocol.metric.kind === "successful-attempts") {
    return {
      value: protocol.metric.minimumSuccessful,
      unit: "attempts",
      attemptsTotal: Math.max(protocol.metric.minimumSuccessful, protocol.metric.maximumAttempts),
    };
  }
  return undefined;
};

const createEvidenceBuilder = (athleteId, proofBase, label) => {
  const events = [];
  const confirmed = new Set();
  let sequence = 0;
  const protocolForMilestone = (graphId, nodeId) => bundle.benchmarkProtocols.find((protocol) =>
    protocol.subject.kind === "milestone"
      && protocol.subject.milestone.graphId === graphId
      && protocol.subject.milestone.nodeId === nodeId);
  const confirmProtocol = (protocol) => {
    const key = `${protocol.id}@${protocol.definitionVersion}`;
    if (confirmed.has(key)) return;
    confirmed.add(key);
    const count = Math.max(
      protocol.confirmation.qualifyingObservations,
      protocol.confirmation.minimumDistinctSessions,
    );
    for (let index = 0; index < count; index += 1) {
      sequence += 1;
      const occurredAt = new Date(Date.parse(proofBase) + sequence * 60_000).toISOString();
      const measurement = measurementFor(protocol);
      events.push({
        schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
        id: contracts.parseStableId("event", `phase10-${label}-proof-${sequence}`),
        athleteId,
        occurredAt,
        recordedAt: occurredAt,
        source: "guided-test",
        catalogueVersion: bundle.catalogueVersion,
        type: "performance_observed",
        subject: protocol.subject,
        outcome: "clean",
        benchmarkProtocolId: protocol.id,
        benchmarkProtocolVersion: protocol.definitionVersion,
        observationSessionId: contracts.parseStableId(
          "observation-session",
          `phase10-${label}-occasion-${sequence}`,
        ),
        ...(measurement ? { measurement } : {}),
        assistance: protocol.conditions.assistance,
        range: protocol.conditions.range,
      });
    }
  };
  const confirmCapacity = (capacity) => {
    const definition = bundle.capacities.find((candidate) => candidate.id === capacity.capacityId);
    const facet = definition?.facets.find((candidate) => candidate.id === capacity.facetId);
    const protocol = facet?.benchmarkProtocolIds
      .map((id) => bundle.benchmarkProtocols.find((candidate) => candidate.id === id))
      .find(Boolean);
    if (!protocol) throw new Error(`Missing capacity protocol ${capacity.capacityId}:${capacity.facetId}`);
    confirmProtocol(protocol);
  };
  const confirmRef = (ref, visiting) => {
    if (ref.kind === "capacity-facet") return confirmCapacity(ref.capacity);
    if (ref.kind === "benchmark") {
      const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === ref.benchmarkProtocolId);
      if (!protocol) throw new Error(`Missing benchmark ${ref.benchmarkProtocolId}`);
      return confirmProtocol(protocol);
    }
    return confirmMilestone(ref.milestone.graphId, ref.milestone.nodeId, visiting);
  };
  const confirmMilestone = (graphId, nodeId, visiting = new Set()) => {
    const key = `${graphId}:${nodeId}`;
    if (confirmed.has(`milestone:${key}`)) return;
    if (visiting.has(key)) throw new Error(`Fixture prerequisite cycle at ${key}`);
    const graph = bundle.graphs.find((candidate) => candidate.id === graphId);
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Missing fixture node ${key}`);
    visiting.add(key);
    for (const ref of node.prerequisiteRule?.allOf ?? []) confirmRef(ref, visiting);
    const anyOf = node.prerequisiteRule?.anyOf ?? [];
    if (anyOf.length) confirmRef(anyOf[0], visiting);
    visiting.delete(key);
    const protocol = protocolForMilestone(graphId, nodeId);
    if (!protocol) throw new Error(`Missing protocol for fixture node ${key}`);
    confirmProtocol(protocol);
    confirmed.add(`milestone:${key}`);
  };
  return { events, confirmMilestone };
};

const seededJourney = async (label, options) => {
  const { store, runtime } = createRuntime(label);
  const athleteId = athlete(label);
  await store.putAthleteIntent({
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: options.intentAt,
    goals: options.goals,
    equipment: options.equipment ?? allEquipment,
    defaultSessionDemand: options.sessionDemand ?? "standard",
    preferences: { specialistOptIn: options.specialistOptIn ?? false },
  });
  const evidence = createEvidenceBuilder(athleteId, options.proofBase, label);
  for (const milestone of options.confirmedMilestones) {
    evidence.confirmMilestone(milestone.graphId, milestone.nodeId);
  }
  for (const event of evidence.events) await store.appendEvidenceEvent(event);
  const snapshot = await runtime.refresh({
    athleteId,
    asOf: options.asOf,
    sessionDemand: options.sessionDemand ?? "standard",
    seed: `phase10-${label}`,
  });
  assertPlainPresentations(snapshot, label);
  if (snapshot.generated.ok && snapshot.generated.plan) {
    assertPlan(snapshot, label, options.equipment ?? allEquipment);
  }
  return { label, store, runtime, athleteId, snapshot, day: options.day };
};

const assertPlainPresentations = (snapshot, label) => {
  const { presentations } = snapshot;
  assert(presentations.progress.title === "Progress & Goals"
    && presentations.progress.families.length === 7,
  `${label}: Progress & Goals did not show all seven independent families`);
  assert(presentations.progress.canManuallyClaimSkills === false
    && presentations.progress.exposesInternalScores === false
    && presentations.goals.canUnlockSkills === false
    && presentations.assessment.canManuallyClaimSkills === false
    && presentations.today.exposesRawAlgorithmDecisions === false,
  `${label}: a user-facing authority flag exposed manual unlocks, scores or raw decisions`);
  const presentationJson = JSON.stringify(presentations);
  assert(!/"(?:athleteLevel|globalLevel|readinessScore|capabilityScore|reasonCodes|allOf|anyOf|projectionVersion)"/u
    .test(presentationJson),
  `${label}: a presentation leaked global-level, score, graph or projector machinery`);
  assert(!/\bL[123]\b/u.test(presentationJson), `${label}: a legacy global L1/L2/L3 level leaked into vNext copy`);
  assert(presentations.today.authorityNotice.length > 20
    && presentations.progress.authorityNotice.length > 20,
  `${label}: user-facing authority explanations are missing`);
  assert(presentations.completion.prompts.every((prompt) =>
    prompt.asksPainOrInstability
      && prompt.statusOptions.length === 3
      && prompt.statusPrompt.length > 8),
  `${label}: workout completion asks incomplete or non-actionable questions`);
  assert(presentations.completion.prompts.every((prompt) => {
    const planItem = snapshot.generated.plan?.items.find((item) => item.id === prompt.planItemId);
    return planItem && planItem.purpose !== "preparation" && planItem.purpose !== "recovery";
  }), `${label}: preparation/recovery filler appeared in the meaningful workout review`);
};

const assertPlan = (snapshot, label, expectedEquipment) => {
  assert(snapshot.generated.ok && snapshot.generated.plan, `${label}: no coherent vNext plan was generated`);
  const plan = snapshot.generated.plan;
  if (!plan) return;
  assert(plan.athleteId === snapshot.athleteId, `${label}: plan belongs to another athlete`);
  assert(plan.items.reduce((sum, item) => sum + item.plannedSeconds, 0)
    === plan.intendedDurationSeconds, `${label}: plan timing does not reconcile`);
  const selectedEquipment = new Set(expectedEquipment);
  for (const item of plan.items) {
    const exercise = bundle.exercises.find((candidate) =>
      candidate.id === item.exerciseId
        && candidate.definitionVersion === item.exerciseDefinitionVersion);
    assert(Boolean(exercise), `${label}: plan references missing exercise ${item.exerciseId}`);
    assert(exercise?.equipment.every((required) => selectedEquipment.has(required)),
      `${label}: plan requires unavailable equipment for ${item.exerciseId}`);
    const node = item.targetMilestone && bundle.graphs
      .find((graph) => graph.id === item.targetMilestone.graphId)
      ?.nodes.find((candidate) => candidate.id === item.targetMilestone.nodeId);
    assert(node?.programmingBoundary !== "specialist" || snapshot.intent.preferences.specialistOptIn,
      `${label}: specialist content bypassed opt-in`);
  }
  assert(snapshot.presentations.today.status === "ready"
    && snapshot.presentations.today.blocks.length === plan.items.length,
  `${label}: Today did not explain the exact generated plan`);
};

const completeAssessmentJourney = async (label, scenario, day) => {
  const { store, runtime } = createRuntime(label);
  const athleteId = athlete(label);
  if (process.env.P25_VALIDATION_PROGRESS === "1") console.error(`${label}: startAssessment`);
  const started = await runtime.startAssessment({
    athleteId,
    asOf: at(day, 0),
    createdAt: at(day, 0),
    initialEquipment: scenario.equipment ?? allEquipment,
    seed: `phase10-${label}`,
  });
  if (process.env.P25_VALIDATION_PROGRESS === "1") console.error(`${label}: assessment started (${started.assessment.step.kind})`);
  let assessment = started.assessment;
  for (let index = 0; assessment.step.kind !== "review" && index < 50; index += 1) {
    if (process.env.P25_VALIDATION_PROGRESS === "1") console.error(`${label}: answer ${index + 1} (${assessment.step.kind})`);
    assessment = await runtime.answerAssessment({
      draft: assessment.draft,
      answer: answerFor(assessment.step, scenario),
      answeredAt: at(day, index + 1),
    });
  }
  if (assessment.step.kind !== "review") throw new Error(`${label}: assessment did not terminate`);
  const reviewBeforeCommit = assessment.review;
  if (process.env.P25_VALIDATION_PROGRESS === "1") console.error(`${label}: commitAssessment`);
  const committed = await runtime.commitAssessment({
    athleteId,
    draft: assessment.draft,
    asOf: at(day, 60),
    seed: `phase10-${label}`,
  });
  if (process.env.P25_VALIDATION_PROGRESS === "1") console.error(`${label}: assessment committed`);
  assertPlainPresentations(committed.snapshot, label);
  assertPlan(committed.snapshot, label, scenario.equipment ?? allEquipment);
  return { label, store, runtime, athleteId, assessment, reviewBeforeCommit, committed, day };
};

const completeWorkout = async (journey, options = {}) => {
  const generated = journey.committed?.snapshot.generated ?? journey.snapshot.generated;
  const plan = generated.plan;
  if (!plan) throw new Error(`${journey.label}: no plan to complete`);
  const symptom = options.symptom === true;
  const difficult = options.difficult === true;
  const timerItemOutcomes = plan.items
    .filter((item) => item.purpose === "preparation" || item.purpose === "recovery")
    .map((item) => ({
      planItemId: item.id,
      status: "completed",
      participationSeconds: item.plannedSeconds,
      participationBasis: "measured",
    }));
  const reviewAnswers = plan.items
    .filter((item) => item.purpose !== "preparation" && item.purpose !== "recovery")
    .map((item, index) => ({
      planItemId: item.id,
      status: symptom && index === 0 ? "modified" : "completed",
      participationSeconds: symptom && index === 0
        ? Math.max(1, Math.floor(item.plannedSeconds / 2))
        : item.plannedSeconds,
      ...(item.purpose !== "guided-test"
        ? { difficulty: difficult ? "hard" : "right" }
        : {}),
      symptomOrInstability: symptom && index === 0,
      ...(symptom && index === 0 ? { modificationReason: "Stopped after left wrist symptoms." } : {}),
    }));
  const prepared = journey.runtime.prepareWorkoutCompletion({
    generated,
    timerItemOutcomes,
    reviewAnswers,
    startedAt: at(journey.day, 61),
    completedAt: at(journey.day, 86),
    recordedAt: at(journey.day, 87),
    status: symptom ? "modified" : "complete",
  });
  const beforeCount = (journey.committed?.snapshot ?? journey.snapshot).sources.sessionRecords.length;
  const completed = await journey.runtime.commitWorkoutCompletion({
    athleteId: journey.athleteId,
    prepared,
    asOf: at(journey.day, 90),
    seed: `phase10-${journey.label}-next`,
  });
  assert(completed.snapshot.sources.sessionRecords.length === beforeCount + 1,
    `${journey.label}: completion did not add exactly one Session Record`);
  assert(completed.snapshot.sources.evidenceEvents.length
    === (journey.committed?.snapshot ?? journey.snapshot).sources.evidenceEvents.length,
  `${journey.label}: workout facts were duplicated as Evidence Events`);
  assert(completed.prepared.record.planId === completed.prepared.plan.id
    && completed.prepared.record.id === completed.prepared.plan.id,
  `${journey.label}: initial Session Record is not bound one-to-one to its exact plan`);
  if (symptom && (!completed.snapshot.generated.ok || !completed.snapshot.generated.plan)) {
    assert(completed.snapshot.presentations.today.status === "unavailable"
      && completed.snapshot.presentations.today.reason.length > 20,
    `${journey.label}: safely unavailable next work was not explained`);
  } else {
    assert(completed.snapshot.generated.ok && completed.snapshot.generated.plan,
      `${journey.label}: updated evidence did not produce the next recommendation`);
    assert(completed.snapshot.generated.plan?.id !== plan.id,
      `${journey.label}: next recommendation reused the completed immutable plan identity`);
  }
  assertPlainPresentations(completed.snapshot, `${journey.label} after workout`);
  if (symptom) {
    assert(completed.prepared.restrictionFollowUp
      && completed.snapshot.state.activeRestrictions.length > 0,
    `${journey.label}: symptom feedback did not create an active training restriction`);
  }
  if (difficult) {
    assert(completed.snapshot.state.recentLoad.exposures.length > 0,
      `${journey.label}: difficult completion lost recent training demand`);
  }
  journeyResults.push({
    label: journey.label,
    prompts: journey.committed?.review.promptCount ?? 0,
    sessionRecords: completed.snapshot.sources.sessionRecords.length,
    nextStatus: completed.snapshot.presentations.today.status,
  });
  return completed;
};

// New beginner: full placement -> projection -> plan -> Session Record -> next plan.
const beginner = await completeAssessmentJourney("new-beginner", {
  goals: [definitions.graphIds.parallettePushing],
  experience: "new",
  anchor: "not-yet",
  inversion: "none",
}, 1);
assert(beginner.committed.review.promptCount >= 7 && beginner.committed.review.promptCount <= 12,
  "New beginner: assessment escaped the intended short placement length");
if (process.env.P25_VALIDATION_PROGRESS === "1") console.error("phase10 journeys: beginner assessment complete");
await completeWorkout(beginner);
if (process.env.P25_VALIDATION_PROGRESS === "1") console.error("phase10 journeys: beginner loop complete");

// Uncertain beginner: uncertainty remains provisional and yields targeted confirmation.
const uncertain = await completeAssessmentJourney("uncertain-beginner", {
  goals: [definitions.graphIds.lSitVSit],
  experience: "new",
  anchor: "not-sure",
}, 2);
assert(uncertain.committed.review.provisional.some((finding) => finding.response === "not-sure")
  && uncertain.committed.review.guidedTests.some((offer) => offer.reason === "resolve-uncertainty"),
"Uncertain beginner: uncertainty did not remain provisional with a targeted confirmation route");
if (process.env.P25_VALIDATION_PROGRESS === "1") console.error("phase10 journeys: uncertain assessment complete");
await completeWorkout(uncertain);
if (process.env.P25_VALIDATION_PROGRESS === "1") console.error("phase10 journeys: uncertain loop complete");

// Mixed and advanced self-reports must stay family-specific and provisional.
const mixed = await completeAssessmentJourney("mixed-athlete", {
  goals: [
    definitions.graphIds.planche,
    definitions.graphIds.lSitVSit,
    definitions.graphIds.verticalPushHspu,
  ],
  experience: "some",
  inversion: "supported",
  anchor: (anchor) => anchor.goalGraphId === definitions.graphIds.planche
    ? "clean"
    : anchor.goalGraphId === definitions.graphIds.lSitVSit ? "partial" : "not-yet",
}, 3);
if (process.env.P25_VALIDATION_PROGRESS === "1") console.error("phase10 journeys: mixed assessment complete");
const mixedFamilies = new Set(mixed.committed.review.provisional.flatMap((finding) =>
  finding.subject.kind === "milestone" ? [finding.subject.milestone.graphId] : []));
assert([definitions.graphIds.planche, definitions.graphIds.lSitVSit, definitions.graphIds.verticalPushHspu]
  .every((id) => mixedFamilies.has(id)),
"Mixed athlete: placement collapsed independent skill families");
const mixedAfterWorkout = await completeWorkout(mixed);

const advanced = await completeAssessmentJourney("advanced-athlete", {
  goals: [
    definitions.graphIds.planche,
    definitions.graphIds.handstandBalance,
    definitions.graphIds.verticalPushHspu,
  ],
  experience: "experienced",
  inactivity: "active",
  inversion: "freestanding",
  anchor: "clean",
}, 4);
assert(advanced.committed.snapshot.state.nodeStates.every((finding) =>
  finding.lifecycle !== "established"),
"Advanced athlete: self-report directly established an achievement");
assert(advanced.committed.snapshot.presentations.progress.families
  .filter((family) => family.demonstratedState.kind === "provisional")
  .every((family) => family.demonstratedState.sourceLabel === "Placement estimate"),
"Advanced athlete: self-assessment provenance was not visibly provisional");
await completeWorkout(advanced);

// Confirmed advanced athlete: current guided evidence reaches the automatic
// catalogue-v2 ceiling and still follows the same public RC completion loop.
const confirmedAdvanced = await seededJourney("confirmed-advanced", {
  day: 12,
  intentAt: at(11, 0),
  proofBase: at(11, 1),
  asOf: at(12, 0),
  sessionDemand: "challenge",
  goals: [
    goal(definitions.graphIds.planche, "primary", "assisted-straddle-planche"),
    goal(definitions.graphIds.lSitVSit, "secondary", "partial-v-sit"),
    goal(definitions.graphIds.verticalPushHspu, "interest", "deficit-wall-hspu"),
  ],
  confirmedMilestones: [
    { graphId: definitions.graphIds.planche, nodeId: "assisted-straddle-planche" },
    { graphId: definitions.graphIds.lSitVSit, nodeId: "partial-v-sit" },
    { graphId: definitions.graphIds.verticalPushHspu, nodeId: "deficit-wall-hspu" },
  ],
});
for (const milestone of [
  { graphId: definitions.graphIds.planche, nodeId: "assisted-straddle-planche" },
  { graphId: definitions.graphIds.lSitVSit, nodeId: "partial-v-sit" },
  { graphId: definitions.graphIds.verticalPushHspu, nodeId: "deficit-wall-hspu" },
]) {
  const finding = confirmedAdvanced.snapshot.state.nodeStates.find((item) =>
    item.milestone.graphId === milestone.graphId && item.milestone.nodeId === milestone.nodeId);
  assert(finding?.lifecycle === "established" && finding.confidence === "current",
    `Confirmed advanced: ${milestone.nodeId} was not retained as current established evidence`);
}
await completeWorkout(confirmedAdvanced);

// Stronger-gated athlete: establish the complete automatic predecessor, then
// verify that the unavailable stronger destination remains an honest gap.
const strongerGated = await seededJourney("stronger-gated", {
  day: 14,
  intentAt: at(13, 0),
  proofBase: at(13, 1),
  asOf: at(14, 0),
  sessionDemand: "challenge",
  goals: [
    goal(definitions.graphIds.planche, "primary", "one-leg-planche"),
    goal(definitions.graphIds.parallettePushing, "secondary"),
  ],
  confirmedMilestones: [
    { graphId: definitions.graphIds.planche, nodeId: "assisted-one-leg-planche" },
  ],
});
assert(strongerGated.snapshot.generated.coverageGaps.some((gap) =>
  gap.graphId === definitions.graphIds.planche
    && gap.targetMilestone?.nodeId === "one-leg-planche"),
`Stronger-gated athlete: unavailable one-leg Planche was not disclosed as a content gap (${JSON.stringify(strongerGated.snapshot.generated.coverageGaps)}; emphasis=${JSON.stringify(strongerGated.snapshot.generated.emphasis?.primary)})`);
assert(!strongerGated.snapshot.generated.plan?.items.some((item) =>
  item.targetMilestone?.graphId === definitions.graphIds.planche
    && item.targetMilestone.nodeId === "one-leg-planche"),
"Stronger-gated athlete: missing stronger-gated content became production-reachable");
if (strongerGated.snapshot.generated.plan) await completeWorkout(strongerGated);

// Stale established evidence remains achievement history but routes to a
// focused check and avoids high-risk loading until reconfirmed.
const stale = await seededJourney("stale-evidence", {
  day: 16,
  intentAt: at(15, 0),
  proofBase: "2025-01-01T09:00:00.000Z",
  asOf: at(16, 0),
  goals: [goal(definitions.graphIds.handstandBalance, "primary", "repeatable-parallette-balance")],
  confirmedMilestones: [
    { graphId: definitions.graphIds.handstandBalance, nodeId: "repeatable-parallette-balance" },
  ],
});
const staleBalance = stale.snapshot.state.nodeStates.find((item) =>
  item.milestone.graphId === definitions.graphIds.handstandBalance
    && item.milestone.nodeId === "repeatable-parallette-balance");
assert(staleBalance?.lifecycle === "established" && staleBalance.confidence === "stale",
  "Stale evidence: achievement history or stale confidence was not retained");
assert(stale.snapshot.presentations.assessment.actions.some((action) =>
  action.kind === "reconfirmation"),
"Stale evidence: no targeted reconfirmation entry was presented");
const staleHighInversion = stale.snapshot.generated.plan?.items.filter((item) =>
  item.demand["inversion-technical"] === "high") ?? [];
assert(staleHighInversion.every((item) => item.purpose === "guided-test")
  && (staleHighInversion.length === 0 || stale.snapshot.presentations.assessment.actions.some((action) =>
    action.kind === "reconfirmation" && action.availability === "available")),
`Stale evidence: high-risk work escaped the explicit guided-reconfirmation boundary (${JSON.stringify(staleHighInversion.map((item) => ({ id: item.exerciseId, purpose: item.purpose, target: item.targetMilestone })))})`);
if (stale.snapshot.generated.plan) await completeWorkout(stale);

// Goal changes alter intent/emphasis, never already-derived capability.
const nodesBeforeGoalChange = canonical(mixedAfterWorkout.snapshot.state.nodeStates);
const eventsBeforeGoalChange = mixedAfterWorkout.snapshot.sources.evidenceEvents.length;
const changedGoals = await mixed.runtime.updateGoals({
  athleteId: mixed.athleteId,
  asOf: at(3, 95),
  updatedAt: at(3, 94),
  seed: "phase10-mixed-goal-change",
  selection: {
    goals: [
      goal(definitions.graphIds.pressToHandstand, "primary"),
      goal(definitions.graphIds.parallettePushing, "secondary"),
    ],
  },
});
assert(changedGoals.intent.goals[0]?.graphId === definitions.graphIds.pressToHandstand
  && changedGoals.sources.evidenceEvents.length === eventsBeforeGoalChange
  && canonical(changedGoals.state.nodeStates) === nodesBeforeGoalChange,
"Goal change: changing goals altered evidence or manually unlocked capability");

// Daily demand changes dose only; it cannot change the demonstrated frontier.
const demandFrontier = canonical(changedGoals.state.eligibleTargets);
for (const demand of ["technique", "standard", "challenge"]) {
  const selected = await mixed.runtime.selectDailyDemand({
    athleteId: mixed.athleteId,
    asOf: at(3, 96),
    sessionDemand: demand,
    seed: `phase10-demand-${demand}`,
  });
  assert(canonical(selected.state.eligibleTargets) === demandFrontier,
    `${demand}: daily demand changed the eligible progression frontier`);
  assert(!selected.generated.plan?.items.some((item) => {
    const node = item.targetMilestone && bundle.graphs.find((graph) =>
      graph.id === item.targetMilestone.graphId)?.nodes.find((candidate) =>
      candidate.id === item.targetMilestone.nodeId);
    return node?.programmingBoundary === "specialist";
  }), `${demand}: non-opted athlete received specialist content`);
}

// Equipment-limited journey remains complete and selects only available apparatus.
const equipmentLimited = await completeAssessmentJourney("equipment-limited", {
  goals: [definitions.graphIds.parallettePushing],
  equipment: floorOnly,
  experience: "new",
  anchor: "not-yet",
}, 5);
await completeWorkout(equipmentLimited);

// Restriction and clearance preserve history separately from current availability.
const restricted = await completeAssessmentJourney("active-restriction", {
  goals: [definitions.graphIds.handstandBalance, definitions.graphIds.lSitVSit],
  experience: "some",
  inversion: "none",
  anchor: "clean",
  safety: {
    kind: "safety",
    severity: "block",
    demandDomains: ["inversion-technical", "overhead-straight-arm-upper-limb"],
    bodyRegions: ["left wrist"],
  },
}, 6);
assert(restricted.committed.snapshot.presentations.restrictions.hasActiveRestrictions
  && restricted.committed.snapshot.presentations.restrictions.items.every((item) =>
    /remain in your progress history/u.test(item.achievementMessage)),
"Active restriction: UI wording implied that achievement history was erased");
const targeted = await restricted.runtime.startAssessment({
  athleteId: restricted.athleteId,
  asOf: at(7, 0),
  createdAt: at(7, 0),
  mode: "targeted-reconfirmation",
  draftId: "assessment-draft-phase10-clearance",
});
const safetyCleared = await restricted.runtime.answerAssessment({
  draft: targeted.assessment.draft,
  answer: { kind: "safety", severity: "none" },
  answeredAt: at(7, 1),
});
assert(safetyCleared.step.kind === "review",
  "Restriction clearance: existing athlete was forced through full onboarding");
const cleared = await restricted.runtime.commitAssessment({
  athleteId: restricted.athleteId,
  draft: safetyCleared.draft,
  asOf: at(7, 2),
  seed: "phase10-clearance",
});
assert(cleared.clearedRestrictions === 1
  && cleared.snapshot.state.activeRestrictions.length === 0
  && cleared.snapshot.state.reconfirmationRequirements.length > 0,
"Restriction clearance: report was not cleared into targeted reconfirmation");

// Difficult and symptom-affected workouts modify current work without inventing a second fact.
const difficult = await completeAssessmentJourney("difficult-feedback", {
  goals: [definitions.graphIds.parallettePushing],
  experience: "some",
  anchor: "partial",
}, 8);
await completeWorkout(difficult, { difficult: true });
const symptomJourney = await completeAssessmentJourney("symptom-feedback", {
  goals: [definitions.graphIds.parallettePushing],
  experience: "some",
  anchor: "partial",
}, 9);
const symptomCompleted = await completeWorkout(symptomJourney, { symptom: true });
assert(symptomCompleted.snapshot.presentations.restrictions.summary.includes("achievements have not been removed"),
  "Symptom feedback: restriction trust copy did not preserve achievement history");

// Long inactivity is captured as context, remains non-achievement evidence and keeps high-risk work conservative.
const inactive = await completeAssessmentJourney("long-inactivity", {
  goals: [definitions.graphIds.handstandBalance],
  experience: "experienced",
  inactivity: "over-six-months",
  inversion: "freestanding",
  anchor: "clean",
}, 10);
assert(inactive.committed.snapshot.state.nodeStates.every((finding) =>
  finding.lifecycle !== "established"),
"Long inactivity: placement self-report established high-risk capability");
assert(!inactive.committed.snapshot.generated.plan?.items.some((item) =>
  item.demand["inversion-technical"] === "high"),
"Long inactivity: first recommendation used high inversion demand without reconfirmation");
await completeWorkout(inactive);

// Migrated v1.2 journey: deterministic retry, honest provenance, then the same workout loop.
const migratedStore = makeStore("migrated");
const migratedRuntime = runtimeModule.createVNextReleaseCandidateRuntime({ store: migratedStore });
const copiedProfile = {
  profileId: "phase10-journey-migrated",
  username: "phase10-copy",
  schemaVersion: 1,
  revision: 5,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-08-20T08:00:00.000Z",
  progressResetAt: "2026-08-01T08:00:00.000Z",
  nextProgramDay: 2,
  history: [{
    id: "phase10-legacy-session",
    completedAt: "2026-08-15T08:25:00.000Z",
    day: 1,
    status: "complete",
    seconds: 1500,
    completedExerciseIds: ["support-hold", "tuck-support"],
  }],
  readiness: { G1: true, G6: true },
  readinessUpdatedAt: { G1: "2026-08-02T08:00:00.000Z", G6: "2026-08-02T08:00:00.000Z" },
  progression: { "support-hold": { cleanSessions: 2, lastFeedback: "right" } },
  equipment: ["floor", "parallettes"],
  preferences: { startingAssessment: { suggestedLevel: "L3" } },
};
const conversion = await migratedRuntime.prepareCopiedLegacyConversion({
  copiedProfile,
  capturedAt: "2026-08-20T09:00:00.000Z",
});
const migratedFirst = await migratedRuntime.applyCopiedLegacyConversion({
  athleteId: conversion.snapshot.athleteId,
  conversion,
  asOf: "2026-08-20T09:00:00.000Z",
  seed: "phase10-migrated",
});
const migratedRetry = await migratedRuntime.applyCopiedLegacyConversion({
  athleteId: conversion.snapshot.athleteId,
  conversion,
  asOf: "2026-08-20T09:00:00.000Z",
  seed: "phase10-migrated",
});
assert(migratedFirst.applyStatus === "inserted" && migratedRetry.applyStatus === "duplicate",
  "Migrated athlete: exact migration retry was not idempotent");
assert([...migratedRetry.snapshot.presentations.provenance.values()].includes("migration")
  && migratedRetry.snapshot.presentations.progress.families.every((family) =>
    family.demonstratedState.kind !== "provisional"
      || family.demonstratedState.sourceLabel === "Imported starting point"),
"Migrated athlete: imported provisional evidence was presented as demonstrated or assessment-derived");
assert(migratedRetry.snapshot.presentations.assessment.actions[0]?.mode === "targeted-reconfirmation",
  `Migrated athlete: existing user was routed through full onboarding (action=${migratedRetry.snapshot.presentations.assessment.actions[0]?.mode}, nodes=${migratedRetry.snapshot.state.nodeStates.filter((item) => item.lifecycle !== "unknown").length}, capacities=${migratedRetry.snapshot.state.capacityFindings.filter((item) => item.finding !== "unknown").length})`);
assertPlainPresentations(migratedRetry.snapshot, "migrated athlete");
assertPlan(migratedRetry.snapshot, "migrated athlete", conversion.intent.equipment);
await completeWorkout({
  label: "migrated-athlete",
  runtime: migratedRuntime,
  store: migratedStore,
  athleteId: conversion.snapshot.athleteId,
  snapshot: migratedRetry.snapshot,
  day: 20,
});

// Specialist opt-in is intent only. With the present catalogue's specialist destinations
// intentionally missing, neither opted nor non-opted athletes may receive surprise content.
for (const specialistOptIn of [false, true]) {
  const label = specialistOptIn ? "specialist-opted" : "specialist-not-opted";
  const store = makeStore(label);
  const athleteId = athlete(label);
  await store.putAthleteIntent({
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: at(21, 0),
    goals: [goal(definitions.graphIds.planche, "primary")],
    equipment: allEquipment,
    defaultSessionDemand: "challenge",
    preferences: { specialistOptIn },
  });
  const runtime = runtimeModule.createVNextReleaseCandidateRuntime({ store });
  const snapshot = await runtime.refresh({
    athleteId,
    asOf: at(21, 1),
    sessionDemand: "challenge",
    seed: `phase10-${label}`,
  });
  assert(!snapshot.generated.plan?.items.some((item) => {
    const node = item.targetMilestone && bundle.graphs.find((graph) =>
      graph.id === item.targetMilestone.graphId)?.nodes.find((candidate) =>
      candidate.id === item.targetMilestone.nodeId);
    return node?.programmingBoundary === "specialist";
  }), `${label}: missing specialist destination became production-reachable`);
  assertPlainPresentations(snapshot, label);
}

// Offline completion, later sync and concurrent two-device union exercise the complete
// observation set rather than isolated entities.
const offlineSource = makeStore("offline-source");
const offlineBundle = await migratedStore.exportBundle(conversion.snapshot.athleteId, {
  exportedAt: "2026-08-20T10:00:00.000Z",
  catalogueVersions: [bundle.catalogueVersion],
  projectionVersions: [projection.vNextProjectionPolicy.version],
  definitionFingerprints: ["phase10-journey-export"],
  policyVersions: [
    { id: projection.vNextProjectionPolicy.id, version: projection.vNextProjectionPolicy.version },
    { id: planning.vNextGeneratorPolicy.id, version: planning.vNextGeneratorPolicy.version },
  ],
});
await offlineSource.importBundle(JSON.parse(JSON.stringify(offlineBundle)));
assert((await offlineSource.readSyncUpload(conversion.snapshot.athleteId, 100)).length > 0,
  "Offline journey: local observations were not queued for later sync");

const createMemoryTransport = () => {
  let sequence = 0;
  const rows = new Map();
  return async (request) => {
    const acknowledged = [];
    const conflicts = [];
    for (const item of request.upload) {
      const key = `${item.kind}:${item.id}`;
      const existing = rows.get(key);
      if (existing) {
        if (existing.item.hash === item.hash) {
          acknowledged.push({ kind: item.kind, id: item.id, status: "duplicate" });
        } else if (item.kind === "reset-tombstone") {
          const incomingAt = Date.parse(item.payload.resetAt);
          const existingAt = Date.parse(existing.item.payload.resetAt);
          if (incomingAt > existingAt
            || (incomingAt === existingAt && item.hash.localeCompare(existing.item.hash) > 0)) {
            sequence += 1;
            rows.set(key, { sequence, item: structuredClone(item) });
            acknowledged.push({ kind: item.kind, id: item.id, status: "inserted" });
          } else {
            acknowledged.push({ kind: item.kind, id: item.id, status: "ignored-older" });
          }
        } else {
          conflicts.push({ kind: item.kind, id: item.id, reason: "immutable-id-conflict" });
        }
      } else {
        sequence += 1;
        rows.set(key, { sequence, item: structuredClone(item) });
        acknowledged.push({ kind: item.kind, id: item.id, status: "inserted" });
      }
    }
    const available = [...rows.values()]
      .filter((row) => row.sequence > request.cursor)
      .sort((left, right) => left.sequence - right.sequence);
    const page = available.slice(0, request.limit);
    const reset = [...rows.values()]
      .filter((row) => row.item.kind === "reset-tombstone")
      .sort((left, right) => Date.parse(right.item.payload.resetAt) - Date.parse(left.item.payload.resetAt))[0];
    return {
      schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
      cursor: page.at(-1)?.sequence ?? request.cursor,
      hasMore: available.length > page.length,
      ...(reset ? { resetTombstone: structuredClone(reset.item.payload) } : {}),
      changes: page.map((row) => structuredClone(row.item)),
      acknowledged,
      conflicts,
    };
  };
};
const transport = createMemoryTransport();
await persistence.syncObservationDeltas(offlineSource, conversion.snapshot.athleteId, transport, { pageSize: 50 });
const deviceB = makeStore("device-b");
await persistence.syncObservationDeltas(deviceB, conversion.snapshot.athleteId, transport, { pageSize: 50 });
const restrictionEvent = (id, domain, occurredAt) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", id),
  athleteId: conversion.snapshot.athleteId,
  occurredAt,
  recordedAt: occurredAt,
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_reported",
  severity: "modify",
  demandDomains: [domain],
  bodyRegions: ["other"],
});
await offlineSource.appendEvidenceEvent(restrictionEvent(
  "phase10-device-a-feedback", "hand-wrist-bearing", "2026-08-22T09:00:00.000Z"));
await deviceB.appendEvidenceEvent(restrictionEvent(
  "phase10-device-b-feedback", "compression-trunk", "2026-08-22T09:05:00.000Z"));
await persistence.syncObservationDeltas(offlineSource, conversion.snapshot.athleteId, transport, { pageSize: 50 });
await persistence.syncObservationDeltas(deviceB, conversion.snapshot.athleteId, transport, { pageSize: 50 });
await persistence.syncObservationDeltas(offlineSource, conversion.snapshot.athleteId, transport, { pageSize: 50 });
const unionA = await offlineSource.readProjectionSources(conversion.snapshot.athleteId);
const unionB = await deviceB.readProjectionSources(conversion.snapshot.athleteId);
assert(unionA.sourceFingerprint === unionB.sourceFingerprint
  && unionA.evidenceEvents.some((event) => event.id === "phase10-device-a-feedback")
  && unionA.evidenceEvents.some((event) => event.id === "phase10-device-b-feedback"),
"Multi-device journey: disjoint observations did not converge by set union");

// Reset on one device followed by a stale-device reconnect must not resurrect old progress.
const reset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: "phase10-journey-reset",
  athleteId: conversion.snapshot.athleteId,
  resetAt: "2026-08-23T00:00:00.000Z",
  recordedAt: "2026-08-23T00:00:01.000Z",
  source: "athlete-reset",
};
await offlineSource.applyProgressReset(reset);
await persistence.syncObservationDeltas(offlineSource, conversion.snapshot.athleteId, transport, { pageSize: 50 });
await deviceB.appendEvidenceEvent(restrictionEvent(
  "phase10-stale-device-old-feedback", "vertical-bent-arm-push", "2026-08-22T10:00:00.000Z"));
await persistence.syncObservationDeltas(deviceB, conversion.snapshot.athleteId, transport, { pageSize: 50 });
const resetB = await deviceB.readProjectionSources(conversion.snapshot.athleteId);
assert(resetB.resetTombstone?.resetAt === reset.resetAt
  && !resetB.evidenceEvents.some((event) => event.id === "phase10-stale-device-old-feedback")
  && resetB.evidenceEvents.every((event) => Date.parse(event.occurredAt) > Date.parse(reset.resetAt)),
"Reset journey: stale-device reconnect resurrected pre-reset evidence");

// Rollback keeps exact recovery material while removing converter-only active truth.
await migratedStore.rollbackMigrationRun(
  conversion.snapshot.athleteId,
  conversion.run.id,
  "2026-08-24T00:00:00.000Z",
);
const rolledBack = await migratedStore.exportBundle(conversion.snapshot.athleteId, {
  exportedAt: "2026-08-24T01:00:00.000Z",
  catalogueVersions: [bundle.catalogueVersion],
  projectionVersions: [projection.vNextProjectionPolicy.version],
  definitionFingerprints: ["phase10-journey-rollback"],
  policyVersions: [{ id: projection.vNextProjectionPolicy.id, version: projection.vNextProjectionPolicy.version }],
});
assert(rolledBack.migrationRuns.some((run) => run.id === conversion.run.id && run.status === "rolled-back")
  && rolledBack.migrationSnapshots.some((snapshot) => snapshot.id === conversion.snapshot.id)
  && !rolledBack.evidenceEvents.some((event) => conversion.evidenceEvents.some((converted) => converted.id === event.id)),
"Rollback journey: converter truth or recovery material has the wrong post-rollback state");

// Static user-surface audit: controls remain commands, labels are explicit and the
// athlete never receives a manual capability switch or an engineering dashboard.
const uiSource = readFileSync(resolve(projectRoot, "app/vnext/ui/VNextExperience.tsx"), "utf8");
const appSource = readFileSync(resolve(projectRoot, "app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx"), "utf8");
assert(uiSource.includes("Today’s focus")
  && uiSource.includes("Progress &amp; Goals")
  && uiSource.includes("Every block has a reason")
  && uiSource.includes("Previously demonstrated in this family")
  && uiSource.includes("Goals saved. Safe progression still comes from current evidence."),
"User surface: required Today, progress, trust or safe-goal language is missing");
assert(!/(?:Set|Mark|Claim)\s+(?:skill|achievement)\s+(?:as\s+)?(?:complete|achieved|demonstrated)/iu.test(uiSource),
  "User surface: a manual skill/achievement control is visible");
assert(!/(?:readinessScore|capabilityScore|reasonCodes|projectionVersion|allOf|anyOf)/u.test(uiSource),
  "User surface: internal score/graph/projector machinery is rendered");
assert(uiSource.includes('aria-label="vNext training sections"')
  && uiSource.includes('role="status" aria-live="polite"')
  && uiSource.includes("<fieldset>")
  && uiSource.includes("<legend>"),
"User surface: basic navigation/status/form accessibility semantics regressed");
assert(appSource.includes("one immutable Session Record")
  && !/store\.(?:appendEvidenceEvent|appendSession|putAthleteIntent|applyProgressReset)\s*\(/u.test(appSource),
"RC surface: UI bypasses the coordinator or obscures single-record workout authority");

for (const store of stores) store.close();

if (failures.length) {
  console.error(`vNext Phase 10 journey validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`vNext Phase 10 journey validation passed (${journeyResults.length} complete assessment-to-next-workout loops):`);
  for (const result of journeyResults) {
    console.log(`- ${result.label}: ${result.prompts} placement prompts, ${result.sessionRecords} Session Record(s), next=${result.nextStatus}`);
  }
  console.log("- goal/demand changes, equipment, restriction/clearance, specialist boundaries, migration retry, offline sync, two-device union, reset reconnect and rollback remained coherent");
  console.log("- Today, Progress & Goals, provisional provenance, trust copy and completion questions expose no global level, internal scores or manual skill unlock");
}
