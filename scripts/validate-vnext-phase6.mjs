import { readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const resolveTypeScriptModule = (specifier, parentPath) => {
  const base = resolve(dirname(parentPath), specifier);
  const candidates = extname(base) ? [base] : [`${base}.ts`, join(base, "index.ts")];
  const found = candidates.find((candidate) => {
    try { readFileSync(candidate); return true; } catch { return false; }
  });
  if (!found) throw new Error(`Cannot resolve ${specifier} from ${relative(projectRoot, parentPath)}`);
  return found;
};
const loadTypeScriptModule = (path) => {
  const absolutePath = resolve(projectRoot, path);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  let source = readFileSync(absolutePath, "utf8");
  if (absolutePath.endsWith("/app/program.ts")) {
    source = source.replaceAll("import.meta.env.BASE_URL", '"/parallettes/"');
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts");

const bundle = definitions.vNextDefinitionBundleV1;
const projectionPolicy = projection.vNextProjectionPolicyV1;
const generatorPolicy = planning.vNextGeneratorPolicy;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const asOf = "2026-06-15T09:00:00.000Z";
const createdAt = asOf;
const allEquipment = ["floor", "parallettes", "wall"].map((id) =>
  contracts.parseStableId("equipment", id));

const at = (daysBefore, minutes = 0) => new Date(
  Date.parse(asOf) - daysBefore * 86_400_000 + minutes * 60_000,
).toISOString();

const intentFor = (athleteId, goals, options = {}) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId,
  updatedAt: at(12),
  goals,
  equipment: options.equipment ?? allEquipment,
  defaultSessionDemand: options.defaultSessionDemand ?? "standard",
  preferences: { specialistOptIn: options.specialistOptIn ?? false },
});

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

const protocolForMilestone = (graphId, nodeId) => bundle.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "milestone"
    && protocol.subject.milestone.graphId === graphId
    && protocol.subject.milestone.nodeId === nodeId);

const createEvidenceBuilder = (athleteId, options = {}) => {
  const events = [];
  const confirmed = new Set();
  let sequence = 0;
  const proofDaysBefore = options.proofDaysBefore ?? 10;

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
      const occurredAt = at(proofDaysBefore, sequence * 7);
      const measurement = measurementFor(protocol);
      events.push({
        schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
        id: contracts.parseStableId("event", `phase6-proof-${athleteId}-${sequence}`),
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
          `phase6-proof-session-${athleteId}-${sequence}`,
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
    if (!protocol) throw new Error(`Cannot confirm missing-content fixture node ${key}`);
    confirmProtocol(protocol);
    confirmed.add(`milestone:${key}`);
  };

  const establishPrerequisites = (graphId, nodeId) => {
    const graph = bundle.graphs.find((candidate) => candidate.id === graphId);
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Missing fixture target ${graphId}:${nodeId}`);
    const visiting = new Set([`${graphId}:${nodeId}`]);
    for (const ref of node.prerequisiteRule?.allOf ?? []) confirmRef(ref, visiting);
    const anyOf = node.prerequisiteRule?.anyOf ?? [];
    if (anyOf.length) confirmRef(anyOf[0], visiting);
  };

  return { events, confirmCapacity, confirmMilestone, establishPrerequisites };
};

const projectForPlanning = ({ athleteId, intent, evidenceEvents = [], sessionPlans = [], sessionRecords = [] }) => {
  const result = projection.projectAthleteState({
    athleteId,
    asOf,
    policy: projectionPolicy,
    definitionBundles: [bundle],
    evidenceEvents,
    sessionPlans,
    sessionRecords,
    intent,
    trainabilityRequests: planning.planningTrainabilityRequests(bundle),
  });
  assert(result.ok && result.state, `Projection failed for ${athleteId}: ${result.issues
    .map((issue) => issue.message).join("; ")}`);
  if (!result.state) throw new Error(`No projected state for ${athleteId}`);
  const stateValidation = validation.validateDerivedAthleteState(result.state);
  assert(stateValidation.valid, `Projection emitted invalid state for ${athleteId}`);
  return result.state;
};

const generatedFor = (intent, state, options = {}) => planning.generateVNextSession({
  createdAt,
  bundle,
  intent,
  state,
  projectionPolicy,
  sessionDemand: options.sessionDemand ?? intent.defaultSessionDemand,
  seed: options.seed ?? "phase6-fixed-seed",
  ...(options.previousEmphasis ? { previousEmphasis: options.previousEmphasis } : {}),
});

const explanationMap = (generated) => new Map(generated.itemExplanations.map((item) => [item.planItemId, item]));
const targetKey = (target) => target ? `${target.graphId}:${target.nodeId}` : "none";
const highUpper = (item) => generatorPolicy.highUpperLimbDomains.filter((domain) => item.demand[domain] === "high");

const assertSuccessfulPlan = (generated, intent, state, label, exact = true) => {
  assert(generated.ok && generated.plan, `${label} did not produce a plan: ${generated.issues
    .map((issue) => `${issue.code} ${issue.message}`).join("; ")}`);
  if (!generated.plan) return;
  const domain = validation.validateSessionPlan(generated.plan);
  assert(domain.valid, `${label} Session Plan contract failed: ${domain.issues
    .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
  const planningIssues = planning.validateGeneratedSession({
    generated,
    bundle,
    intent,
    state,
    policy: generatorPolicy,
  });
  assert(planningIssues.length === 0, `${label} planning validation failed: ${planningIssues
    .map((issue) => `${issue.code} ${issue.message}`).join("; ")}`);
  const seconds = generated.plan.items.reduce((total, item) => total + item.plannedSeconds, 0);
  assert(seconds === generated.plan.intendedDurationSeconds, `${label} item timing does not equal intended timing`);
  if (exact) {
    assert(seconds === generatorPolicy.exactDurationSeconds, `${label} should total exactly 25 minutes; saw ${seconds}s`);
    assert(!generated.durationException, `${label} attached a safety exception to an exact plan`);
  } else if (seconds !== generatorPolicy.exactDurationSeconds) {
    assert(generated.durationException?.actualSeconds === seconds
      && generated.durationException?.targetSeconds === generatorPolicy.exactDurationSeconds,
    `${label} shorter plan lacks an exact safety exception`);
  }
  const equipment = new Set(intent.equipment);
  const explanations = explanationMap(generated);
  const allowedTargets = new Set([
    ...state.workingNodes,
    ...state.eligibleTargets,
    ...state.maintenanceNeeds,
    ...state.nodeStates.filter((item) => item.lifecycle === "established" && item.confidence === "current")
      .map((item) => ({ milestone: item.milestone })),
  ].map((item) => targetKey(item.milestone)));
  for (const item of generated.plan.items) {
    const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === item.prescriptionVariantId);
    assert(exercise && variant, `${label} item ${item.id} has an unknown exercise/variant`);
    if (!exercise || !variant) continue;
    assert(exercise.equipment.every((required) => equipment.has(required)),
      `${label} selected unavailable equipment for ${exercise.id}`);
    assert(JSON.stringify(item.demand) === JSON.stringify(variant.demand),
      `${label} rewrote authored demand for ${exercise.id}`);
    const explanation = explanations.get(item.id);
    assert(explanation?.whySkill && explanation?.whyExercise && explanation?.whyIntensity,
      `${label} item ${item.id} lacks complete explainability`);
    const projectedEvaluation = state.trainabilityEvaluations.find((evaluation) =>
      evaluation.exerciseId === item.exerciseId
        && evaluation.exerciseDefinitionVersion === item.exerciseDefinitionVersion
        && evaluation.prescriptionVariantId === item.prescriptionVariantId);
    assert(projectedEvaluation && projectedEvaluation.decision !== "block",
      `${label} selected a missing or blocked request-scoped trainability candidate ${item.exerciseId}`);
    if (explanation?.block === "secondary" || explanation?.block === "maintenance") {
      assert(item.plannedSeconds >= 120 && item.plannedSeconds <= 240,
        `${label} ${explanation.block} allocation must remain within 120-240s; saw ${item.plannedSeconds}s`);
    }
    if (item.targetMilestone) {
      const graph = bundle.graphs.find((candidate) => candidate.id === item.targetMilestone.graphId);
      const node = graph?.nodes.find((candidate) => candidate.id === item.targetMilestone.nodeId);
      assert(node?.implementationStatus === "available", `${label} selected missing-content target ${targetKey(item.targetMilestone)}`);
      assert(allowedTargets.has(targetKey(item.targetMilestone)), `${label} bypassed frontier ${targetKey(item.targetMilestone)}`);
      assert(node?.programmingBoundary !== "specialist" || intent.preferences.specialistOptIn,
        `${label} selected specialist work without opt-in`);
    }
  }
  const highItems = generated.plan.items.filter((item) => highUpper(item).length);
  assert(highItems.length <= 1, `${label} combined ${highItems.length} major high upper-limb prescriptions`);
  const firstFatiguing = generated.plan.items.findIndex((item) =>
    explanations.get(item.id)?.block !== "technical" && highUpper(item).length);
  if (firstFatiguing >= 0) {
    assert(!generated.plan.items.some((item, index) =>
      explanations.get(item.id)?.block === "technical" && index > firstFatiguing),
    `${label} placed technical work after fatiguing high-load work`);
  }
  assert(explanations.get(generated.plan.items[0]?.id)?.block === "preparation",
    `${label} does not start with preparation`);
  assert(explanations.get(generated.plan.items.at(-1)?.id)?.block === "recovery",
    `${label} does not end with recovery`);
};

const goal = (graphId, priority, targetNodeId) => ({
  graphId,
  priority,
  ...(targetNodeId ? { targetNodeId: contracts.parseStableId("node", targetNodeId) } : {}),
});

// 1. Beginner: the root frontier remains honest and produces a complete session.
const beginnerId = contracts.parseStableId("athlete", "phase6-beginner");
const beginnerIntent = intentFor(beginnerId, [goal(definitions.graphIds.parallettePushing, "primary")]);
const beginnerState = projectForPlanning({ athleteId: beginnerId, intent: beginnerIntent });
const beginner = generatedFor(beginnerIntent, beginnerState);
assertSuccessfulPlan(beginner, beginnerIntent, beginnerState, "Beginner");
assert(beginner.emphasis?.primary.graphId === definitions.graphIds.parallettePushing
  && beginner.emphasis?.primary.targetMilestone?.nodeId === "knee-push-up",
"Beginner was not kept at the honest knee-push-up frontier");
assert(!Object.hasOwn(beginner.plan ?? {}, "level"), "Generator reintroduced a global athlete level");

// Equal inputs and seed must be byte-identical.
const beginnerReplay = generatedFor(beginnerIntent, beginnerState);
assert(JSON.stringify(beginner) === JSON.stringify(beginnerReplay),
  "Equal generator inputs and seed did not produce deterministic output");

// A retained emphasis changes prescription rationale/authority even when the
// visible exercise list stays identical, so it must not collide on an
// immutable Session Plan ID.
const beginnerPreviousEmphasis = beginner.emphasis ? {
  generatorPolicyId: generatorPolicy.id,
  generatorPolicyVersion: generatorPolicy.version,
  primaryGraphId: beginner.emphasis.primary.graphId,
  ...(beginner.emphasis.secondary
    ? { secondaryGraphId: beginner.emphasis.secondary.graphId }
    : {}),
  goalSignature: beginner.emphasis.goalSignature,
  completedEligibleSessions: 0,
} : undefined;
const beginnerRetained = generatedFor(beginnerIntent, beginnerState, {
  previousEmphasis: beginnerPreviousEmphasis,
});
assertSuccessfulPlan(beginnerRetained, beginnerIntent, beginnerState, "Retained emphasis identity");
const visibleSelection = (generated) => (generated.plan?.items ?? []).map((item) => ({
  exerciseId: item.exerciseId,
  prescriptionVariantId: item.prescriptionVariantId,
  purpose: item.purpose,
  plannedSeconds: item.plannedSeconds,
  targetMilestone: item.targetMilestone,
}));
assert(JSON.stringify(visibleSelection(beginnerRetained)) === JSON.stringify(visibleSelection(beginner)),
  "Retained-emphasis identity fixture unexpectedly changed the visible exercise selection");
assert(beginnerRetained.emphasis?.retainedFromPrevious
  && JSON.stringify(beginnerRetained.plan?.rationale) !== JSON.stringify(beginner.plan?.rationale),
"Valid previous emphasis did not produce distinct retained-emphasis rationale");
assert(beginnerRetained.plan?.id !== beginner.plan?.id,
  "Different valid rationale reused the same immutable Session Plan ID");

// Demand changes today's prescription only, never the eligible node frontier.
const beginnerTechnique = generatedFor(beginnerIntent, beginnerState, { sessionDemand: "technique" });
const beginnerChallenge = generatedFor(beginnerIntent, beginnerState, { sessionDemand: "challenge" });
assertSuccessfulPlan(beginnerTechnique, beginnerIntent, beginnerState, "Beginner Technique");
assertSuccessfulPlan(beginnerChallenge, beginnerIntent, beginnerState, "Beginner Challenge");
assert(targetKey(beginnerTechnique.emphasis?.primary.targetMilestone)
  === targetKey(beginner.emphasis?.primary.targetMilestone)
  && targetKey(beginnerChallenge.emphasis?.primary.targetMilestone)
    === targetKey(beginner.emphasis?.primary.targetMilestone),
"Session demand changed the athlete's eligible skill frontier");
const workloadSignature = (generated) => (generated.plan?.items ?? []).map((item) => {
  const block = explanationMap(generated).get(item.id)?.block;
  return `${block}:${item.exerciseId}:${item.prescriptionVariantId}:${item.plannedSeconds}`;
}).join("|");
assert(workloadSignature(beginnerTechnique) !== workloadSignature(beginner),
  "Technique mode did not materially change today's beginner workload");
assert(workloadSignature(beginnerChallenge) !== workloadSignature(beginner),
  "Challenge mode did not materially change today's beginner workload");

// A fresh composite-skill goal keeps goal authority while recursively routing
// through its cross-graph milestone to the first exact capacity requirement.
// A lower-priority trainable foundation goal must not steal primary emphasis.
const transitionId = contracts.parseStableId("athlete", "phase6-transition-prerequisite");
const transitionIntent = intentFor(transitionId, [
  goal(definitions.graphIds.transitions, "primary", "support-to-tuck"),
  goal(definitions.graphIds.parallettePushing, "secondary", "knee-push-up"),
]);
const transitionState = projectForPlanning({ athleteId: transitionId, intent: transitionIntent });
const transition = generatedFor(transitionIntent, transitionState, {
  seed: "phase6-transition-prerequisite-seed",
});
assertSuccessfulPlan(
  transition,
  transitionIntent,
  transitionState,
  "Transition prerequisite routing",
  false,
);
assert(transition.emphasis?.primary.graphId === definitions.graphIds.transitions
  && transition.emphasis?.primary.kind === "prerequisite-development",
"Fresh support-to-tuck goal lost primary prerequisite-development emphasis");
const tallSupportProtocol = bundle.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "capacity-facet"
    && protocol.subject.capacity.capacityId === definitions.capacityIds.straightArmSupport
    && protocol.subject.capacity.facetId === definitions.capacityFacetIds.tallSupport);
assert(tallSupportProtocol?.exerciseId === "support-hold",
  "Canonical tall-support fixture no longer resolves to support-hold");
assert(transition.plan?.items.some((item) =>
  item.exerciseId === tallSupportProtocol?.exerciseId
    && item.prescriptionVariantId === tallSupportProtocol?.prescriptionVariantId),
"Support-to-tuck routing did not select the exact tall-support capacity prescription");
assert(transition.plan?.intendedDurationSeconds === 1_020
  && transition.durationException?.actualSeconds === 1_020
  && transition.durationException?.targetSeconds === generatorPolicy.exactDurationSeconds,
"Single honest Transition prerequisite did not produce the documented 1020s relevance exception");
assert(!transition.issues.some((issue) => issue.code === planning.planningReasonCodes.noSafeRelevantCandidate),
  "Trainable recursive transition prerequisite emitted a contradictory no-trainable warning");

// 2. Mixed intermediate: Planche development plus compatible L-sit work.
const mixedId = contracts.parseStableId("athlete", "phase6-mixed");
const mixedEvidence = createEvidenceBuilder(mixedId);
mixedEvidence.establishPrerequisites(definitions.graphIds.planche, "controlled-planche-lean");
mixedEvidence.confirmMilestone(definitions.graphIds.lSitVSit, "tuck-support");
const mixedIntent = intentFor(mixedId, [
  goal(definitions.graphIds.planche, "primary", "controlled-planche-lean"),
  goal(definitions.graphIds.lSitVSit, "secondary", "controlled-leg-extensions"),
]);
const mixedState = projectForPlanning({
  athleteId: mixedId,
  intent: mixedIntent,
  evidenceEvents: mixedEvidence.events,
});
const mixed = generatedFor(mixedIntent, mixedState, { seed: "phase6-mixed-seed" });
assertSuccessfulPlan(mixed, mixedIntent, mixedState, "Mixed intermediate");
assert(mixed.emphasis?.primary.targetMilestone?.nodeId === "controlled-planche-lean",
  "Mixed athlete did not receive the eligible Planche target");
assert(mixed.emphasis?.secondary?.graphId === definitions.graphIds.lSitVSit,
  "Mixed athlete lost the compatible L-sit secondary focus");
assert(mixed.plan?.items.some((item) => item.targetMilestone?.graphId === definitions.graphIds.lSitVSit),
  "Mixed athlete's compatible secondary focus received no session exposure");
const mixedTechnique = generatedFor(mixedIntent, mixedState, {
  sessionDemand: "technique",
  seed: "phase6-mixed-technique-seed",
});
assertSuccessfulPlan(mixedTechnique, mixedIntent, mixedState, "Solo secondary allocation");
assert(mixedTechnique.itemExplanations.some((item) => item.block === "secondary"),
  "Solo-secondary duration fixture did not allocate its secondary focus");

// Graph-policy incompatibility is independent of whether the two high loads
// happen to occupy different demand-domain keys.
const conflictId = contracts.parseStableId("athlete", "phase6-graph-load-conflict");
const conflictEvidence = createEvidenceBuilder(conflictId);
conflictEvidence.establishPrerequisites(definitions.graphIds.planche, "controlled-planche-lean");
conflictEvidence.establishPrerequisites(definitions.graphIds.verticalPushHspu, "floor-pike-push-up");
const conflictIntent = intentFor(conflictId, [
  goal(definitions.graphIds.planche, "primary", "controlled-planche-lean"),
  goal(definitions.graphIds.verticalPushHspu, "secondary", "floor-pike-push-up"),
]);
const conflictState = projectForPlanning({
  athleteId: conflictId,
  intent: conflictIntent,
  evidenceEvents: conflictEvidence.events,
});
const conflict = generatedFor(conflictIntent, conflictState, { seed: "phase6-graph-load-conflict-seed" });
assertSuccessfulPlan(conflict, conflictIntent, conflictState, "Planche/HSPU graph conflict");
assert(conflict.emphasis?.primary.graphId === definitions.graphIds.planche,
  "Planche/HSPU conflict fixture did not retain its primary Planche goal");
assert(conflict.emphasis?.secondary?.graphId !== definitions.graphIds.verticalPushHspu,
  "High Planche and high HSPU were incorrectly marked as compatible secondary focuses");
assert(conflict.emphasis?.deferredGraphIds.includes(definitions.graphIds.verticalPushHspu)
  && conflict.emphasis?.reasonCodes.includes(planning.planningReasonCodes.secondaryLoadConflict),
"Incompatible HSPU focus was not explicitly deferred for load conflict");

// 3. Technical work: supported Handstand practice must precede pushing fatigue.
const technicalId = contracts.parseStableId("athlete", "phase6-technical");
const technicalEvidence = createEvidenceBuilder(technicalId);
technicalEvidence.establishPrerequisites(definitions.graphIds.handstandBalance, "wall-inverted-l-alignment");
technicalEvidence.establishPrerequisites(definitions.graphIds.verticalPushHspu, "shallow-pike-push-up");
const technicalIntent = intentFor(technicalId, [
  goal(definitions.graphIds.handstandBalance, "primary", "wall-inverted-l-alignment"),
  goal(definitions.graphIds.verticalPushHspu, "secondary", "shallow-pike-push-up"),
]);
const technicalState = projectForPlanning({
  athleteId: technicalId,
  intent: technicalIntent,
  evidenceEvents: technicalEvidence.events,
});
const technical = generatedFor(technicalIntent, technicalState, { seed: "phase6-technical-seed" });
assertSuccessfulPlan(technical, technicalIntent, technicalState, "Technical ordering");
assert(technical.itemExplanations.some((item) => item.block === "technical"),
  "Handstand scenario did not include an explicit fresh technical block");

// 4. Advanced current-content ceiling: no Phase 7 content may be invented.
const advancedId = contracts.parseStableId("athlete", "phase6-advanced");
const advancedEvidence = createEvidenceBuilder(advancedId);
advancedEvidence.establishPrerequisites(definitions.graphIds.verticalPushHspu, "controlled-pike-eccentric");
advancedEvidence.establishPrerequisites(definitions.graphIds.lSitVSit, "full-l-sit");
advancedEvidence.establishPrerequisites(definitions.graphIds.planche, "brief-floor-tuck-planche");
const advancedIntent = intentFor(advancedId, [
  goal(definitions.graphIds.verticalPushHspu, "primary", "controlled-pike-eccentric"),
  goal(definitions.graphIds.lSitVSit, "secondary", "full-l-sit"),
  goal(definitions.graphIds.planche, "interest", "brief-floor-tuck-planche"),
]);
const advancedState = projectForPlanning({
  athleteId: advancedId,
  intent: advancedIntent,
  evidenceEvents: advancedEvidence.events,
});
const advanced = generatedFor(advancedIntent, advancedState, { sessionDemand: "challenge", seed: "phase6-advanced-seed" });
assertSuccessfulPlan(advanced, advancedIntent, advancedState, "Advanced");
assert(advanced.emphasis?.primary.targetMilestone?.nodeId === "controlled-pike-eccentric",
  "Advanced athlete did not receive the deepest eligible current HSPU target");
assert(!advanced.plan?.items.some((item) => item.targetMilestone?.graphId === definitions.graphIds.pressToHandstand),
  "Advanced scenario fabricated missing Press content");

// Press content is intentionally absent in Phase 6, but its cross-graph
// safety prerequisites are real. A Press goal must route through the first
// trainable Handstand-exit milestone, not collapse into generic capacities.
const pressId = contracts.parseStableId("athlete", "phase6-press-routing");
const pressIntent = intentFor(pressId, [
  goal(definitions.graphIds.pressToHandstand, "primary", "feet-assisted-tuck-press-load"),
]);
const pressState = projectForPlanning({ athleteId: pressId, intent: pressIntent });
const press = generatedFor(pressIntent, pressState, { seed: "phase6-press-routing-seed" });
assertSuccessfulPlan(press, pressIntent, pressState, "Press prerequisite routing");
assert(press.emphasis?.primary.graphId === definitions.graphIds.pressToHandstand
  && press.emphasis?.primary.kind === "prerequisite-development",
"Press gap did not remain an honest prerequisite-development focus");
assert(press.plan?.items.some((item) => item.targetMilestone?.graphId === definitions.graphIds.handstandBalance),
  "Press goal did not route its missing Handstand-exit milestone prerequisite");
assert(press.coverageGaps.some((gap) => gap.kind === "missing-content"
  && gap.graphId === definitions.graphIds.pressToHandstand),
"Press routing did not retain the Phase 7 content gap");

// With every Press allOf gate current, the flat anyOf is one alternative
// requirement, not permission to train both compression routes or to refill
// the session with capacity prerequisites that are already established.
const pressAnyOfId = contracts.parseStableId("athlete", "phase6-press-any-of");
const pressGraph = bundle.graphs.find((graph) => graph.id === definitions.graphIds.pressToHandstand);
const pressRoot = pressGraph?.nodes.find((node) => node.id === "feet-assisted-tuck-press-load");
if (!pressRoot?.prerequisiteRule?.anyOf?.length) {
  failures.push("Press anyOf fixture could not resolve the canonical root rule");
} else {
  const pressAnyOfEvidence = createEvidenceBuilder(pressAnyOfId);
  for (const ref of pressRoot.prerequisiteRule.allOf ?? []) {
    if (ref.kind === "capacity-facet") pressAnyOfEvidence.confirmCapacity(ref.capacity);
    else if (ref.kind === "milestone") {
      pressAnyOfEvidence.confirmMilestone(ref.milestone.graphId, ref.milestone.nodeId);
    } else {
      throw new Error(`Unexpected benchmark ref in Press root allOf: ${ref.benchmarkProtocolId}`);
    }
  }
  const pressAnyOfIntent = intentFor(pressAnyOfId, [
    goal(definitions.graphIds.pressToHandstand, "primary", "feet-assisted-tuck-press-load"),
  ]);
  const pressAnyOfState = projectForPlanning({
    athleteId: pressAnyOfId,
    intent: pressAnyOfIntent,
    evidenceEvents: pressAnyOfEvidence.events,
  });
  for (const ref of pressRoot.prerequisiteRule.allOf ?? []) {
    if (ref.kind === "capacity-facet") {
      const finding = pressAnyOfState.capacityFindings.find((item) =>
        item.capacity.capacityId === ref.capacity.capacityId
          && item.capacity.facetId === ref.capacity.facetId);
      assert(finding?.finding === "demonstrated"
        && finding.confirmationSatisfied
        && finding.confidence === "current",
      `Press anyOf fixture failed to establish allOf capacity ${ref.capacity.capacityId}:${ref.capacity.facetId}`);
    } else if (ref.kind === "milestone") {
      const node = pressAnyOfState.nodeStates.find((item) =>
        item.milestone.graphId === ref.milestone.graphId
          && item.milestone.nodeId === ref.milestone.nodeId);
      assert(node?.lifecycle === "established" && node.confidence === "current",
        `Press anyOf fixture failed to establish allOf milestone ${targetKey(ref.milestone)}`);
    }
  }
  for (const ref of pressRoot.prerequisiteRule.anyOf) {
    if (ref.kind !== "capacity-facet") continue;
    const finding = pressAnyOfState.capacityFindings.find((item) =>
      item.capacity.capacityId === ref.capacity.capacityId
        && item.capacity.facetId === ref.capacity.facetId);
    assert(!(finding?.finding === "demonstrated"
      && finding.confirmationSatisfied
      && finding.confidence === "current"),
    `Press anyOf fixture accidentally established ${ref.capacity.capacityId}:${ref.capacity.facetId}`);
  }
  const pressAnyOf = generatedFor(pressAnyOfIntent, pressAnyOfState, {
    seed: "phase6-press-any-of-seed",
  });
  assertSuccessfulPlan(
    pressAnyOf,
    pressAnyOfIntent,
    pressAnyOfState,
    "Press anyOf routing",
    false,
  );
  assert(pressAnyOf.emphasis?.primary.graphId === definitions.graphIds.pressToHandstand
    && pressAnyOf.emphasis?.primary.kind === "prerequisite-development",
  "Press anyOf gap did not remain prerequisite-development");
  const capacityProtocol = (ref) => {
    if (ref.kind !== "capacity-facet") return undefined;
    const capacity = bundle.capacities.find((item) => item.id === ref.capacity.capacityId);
    const facet = capacity?.facets.find((item) => item.id === ref.capacity.facetId);
    return facet?.benchmarkProtocolIds
      .map((id) => bundle.benchmarkProtocols.find((protocol) => protocol.id === id))
      .find(Boolean);
  };
  const anyOfRoutes = pressRoot.prerequisiteRule.anyOf
    .map((ref) => ({ ref, protocol: capacityProtocol(ref) }))
    .filter((route) => route.protocol);
  const selectedRouteItems = (pressAnyOf.plan?.items ?? []).filter((item) =>
    anyOfRoutes.some(({ protocol }) => protocol.exerciseId === item.exerciseId
      && protocol.prescriptionVariantId === item.prescriptionVariantId));
  assert(selectedRouteItems.length === 1,
    `Press anyOf plan must select exactly one compression route; saw ${selectedRouteItems.length}`);
  const selectedFocusRoutes = pressAnyOf.emphasis?.primary.missingPrerequisites.filter((ref) =>
    pressRoot.prerequisiteRule.anyOf.some((candidate) => JSON.stringify(candidate) === JSON.stringify(ref))) ?? [];
  assert(selectedFocusRoutes.length === 1,
    `Press anyOf focus must retain one canonical route; saw ${selectedFocusRoutes.length}`);
  const establishedCapacityProtocols = (pressRoot.prerequisiteRule.allOf ?? [])
    .map(capacityProtocol)
    .filter(Boolean);
  assert(!(pressAnyOf.plan?.items ?? []).some((item) =>
    establishedCapacityProtocols.some((protocol) => protocol.exerciseId === item.exerciseId
      && protocol.prescriptionVariantId === item.prescriptionVariantId)),
  "Press anyOf plan added an already-established allOf capacity prescription as filler");

  // Once one anyOf route is also current, every approved prerequisite is
  // satisfied but the Press destination still has no Phase 6 content. The
  // generator must stop rather than fill 25 minutes with unrelated capacities
  // that happen to be shared by the Press family.
  const selectedAnyOf = pressRoot.prerequisiteRule.anyOf[0];
  if (selectedAnyOf.kind === "capacity-facet") {
    pressAnyOfEvidence.confirmCapacity(selectedAnyOf.capacity);
  } else if (selectedAnyOf.kind === "milestone") {
    pressAnyOfEvidence.confirmMilestone(
      selectedAnyOf.milestone.graphId,
      selectedAnyOf.milestone.nodeId,
    );
  } else {
    throw new Error(`Unexpected benchmark ref in Press root anyOf: ${selectedAnyOf.benchmarkProtocolId}`);
  }
  const pressPreparedState = projectForPlanning({
    athleteId: pressAnyOfId,
    intent: pressAnyOfIntent,
    evidenceEvents: pressAnyOfEvidence.events,
  });
  const pressPrepared = generatedFor(pressAnyOfIntent, pressPreparedState, {
    seed: "phase6-press-fully-prepared-seed",
  });
  assert(!pressPrepared.ok && !pressPrepared.plan,
    "Fully prepared missing-content Press goal fabricated a generic capacity session");
  assert(pressPrepared.coverageGaps.some((gap) => gap.kind === "missing-content"
    && gap.graphId === definitions.graphIds.pressToHandstand),
  "Fully prepared Press outcome lost its honest Phase 7 content gap");
  assert(pressPrepared.issues.some((issue) => issue.code === planning.planningReasonCodes.noSafeRelevantCandidate),
    "Fully prepared missing-content Press goal did not report that no relevant prescription exists");
}

// 4b. A compatible established non-priority receives a small maintenance block.
const maintenanceId = contracts.parseStableId("athlete", "phase6-maintenance");
const maintenanceEvidence = createEvidenceBuilder(maintenanceId);
maintenanceEvidence.confirmMilestone(definitions.graphIds.parallettePushing, "knee-push-up");
maintenanceEvidence.events.forEach((event, index) => {
  const timestamp = at(22, index + 1);
  event.occurredAt = timestamp;
  event.recordedAt = timestamp;
});
maintenanceEvidence.establishPrerequisites(definitions.graphIds.lSitVSit, "controlled-leg-extensions");
const maintenanceIntent = intentFor(maintenanceId, [
  goal(definitions.graphIds.lSitVSit, "primary", "controlled-leg-extensions"),
]);
const maintenanceState = projectForPlanning({
  athleteId: maintenanceId,
  intent: maintenanceIntent,
  evidenceEvents: maintenanceEvidence.events,
});
const maintenance = generatedFor(maintenanceIntent, maintenanceState, { seed: "phase6-maintenance-seed" });
assertSuccessfulPlan(maintenance, maintenanceIntent, maintenanceState, "Maintenance allocation");
assert(maintenance.emphasis?.maintenance.some((item) =>
  item.graphId === definitions.graphIds.parallettePushing
    && item.targetMilestone?.nodeId === "knee-push-up"),
"Due compatible pushing maintenance was not retained in emphasis");
assert(maintenance.plan?.items.some((item) => item.purpose === "maintenance"
  && item.targetMilestone?.graphId === definitions.graphIds.parallettePushing),
"Due compatible maintenance received no low-dose Session Plan item");
const maintenanceTechnique = generatedFor(maintenanceIntent, maintenanceState, {
  sessionDemand: "technique",
  seed: "phase6-maintenance-technique-seed",
});
assertSuccessfulPlan(
  maintenanceTechnique,
  maintenanceIntent,
  maintenanceState,
  "Solo maintenance allocation",
);
assert(maintenanceTechnique.itemExplanations.some((item) => item.block === "maintenance"),
  "Solo-maintenance duration fixture did not allocate maintenance work");

// 5. Active inversion restriction reallocates the focus and never erases capability.
const restrictedId = contracts.parseStableId("athlete", "phase6-restricted");
const restrictedEvidence = createEvidenceBuilder(restrictedId);
restrictedEvidence.establishPrerequisites(definitions.graphIds.handstandBalance, "wall-inverted-l-alignment");
restrictedEvidence.confirmMilestone(definitions.graphIds.lSitVSit, "tuck-support");
restrictedEvidence.events.push({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase6-active-inversion-restriction"),
  athleteId: restrictedId,
  occurredAt: at(1),
  recordedAt: at(1),
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_reported",
  severity: "block",
  demandDomains: ["inversion-technical", "overhead-straight-arm-upper-limb"],
  bodyRegions: ["head-neck"],
});
const restrictedIntent = intentFor(restrictedId, [
  goal(definitions.graphIds.handstandBalance, "primary", "wall-inverted-l-alignment"),
  goal(definitions.graphIds.lSitVSit, "secondary", "controlled-leg-extensions"),
]);
const restrictedState = projectForPlanning({
  athleteId: restrictedId,
  intent: restrictedIntent,
  evidenceEvents: restrictedEvidence.events,
});
const restricted = generatedFor(restrictedIntent, restrictedState, { seed: "phase6-restricted-seed" });
assertSuccessfulPlan(restricted, restrictedIntent, restrictedState, "Restricted athlete");
assert(restricted.emphasis?.primary.graphId === definitions.graphIds.lSitVSit,
  "Restriction did not defer the blocked Handstand focus for a trainable goal");
assert(!restricted.plan?.items.some((item) => ["inversion-technical", "overhead-straight-arm-upper-limb"]
  .some((domain) => item.demand[domain] === "moderate" || item.demand[domain] === "high")),
"Restricted plan contains material inversion/overhead exposure");
assert(restrictedState.nodeStates.some((item) => item.lifecycle === "established"),
  "Restriction incorrectly erased historical capability");

// 6. Equipment-safe substitution: do not retain a blocked target prescription.
const equipmentId = contracts.parseStableId("athlete", "phase6-equipment");
const equipmentEvidence = createEvidenceBuilder(equipmentId);
equipmentEvidence.establishPrerequisites(definitions.graphIds.handstandBalance, "controlled-wall-entry");
const equipmentIntent = intentFor(equipmentId, [
  goal(definitions.graphIds.handstandBalance, "primary", "controlled-wall-entry"),
], {
  equipment: ["floor", "wall"].map((id) => contracts.parseStableId("equipment", id)),
});
const equipmentState = projectForPlanning({
  athleteId: equipmentId,
  intent: equipmentIntent,
  evidenceEvents: equipmentEvidence.events,
});
const equipmentPlan = generatedFor(equipmentIntent, equipmentState, { seed: "phase6-equipment-seed" });
assertSuccessfulPlan(equipmentPlan, equipmentIntent, equipmentState, "Equipment substitution", false);
assert(!equipmentPlan.plan?.items.some((item) => item.exerciseId === "wall-kickup"),
  "Equipment scenario retained the unavailable wall-kickup prescription");
const wallKickup = bundle.exercises.find((exercise) => exercise.id === "wall-kickup");
const wallKickupVariant = wallKickup?.prescriptionVariants.find((variant) => variant.id === "wall-kickup-standard");
const wallKickupEvaluation = wallKickup && wallKickupVariant
  ? projection.evaluateTrainability({
    request: {
      exerciseId: wallKickup.id,
      exerciseDefinitionVersion: wallKickup.definitionVersion,
      prescriptionVariantId: wallKickupVariant.id,
    },
    state: equipmentState,
    bundle,
    asOf,
    policy: projectionPolicy,
    intent: equipmentIntent,
  })
  : undefined;
assert(wallKickupEvaluation?.decision === "block" && wallKickupEvaluation.safeAlternative,
  "Equipment fixture did not expose the approved safe-alternative contract");
assert(!wallKickupEvaluation?.safeAlternative
  || equipmentPlan.plan?.items.some((item) => item.exerciseId === wallKickupEvaluation.safeAlternative.exerciseId
    && item.prescriptionVariantId === wallKickupEvaluation.safeAlternative.prescriptionVariantId),
"Generator ignored the exact safe alternative supplied by Phase 3 trainability");

// 7. Recent high Planche exposure must produce a compatible/lower-demand day.
const recentId = contracts.parseStableId("athlete", "phase6-recent-load");
const recentEvidence = createEvidenceBuilder(recentId);
recentEvidence.confirmMilestone(definitions.graphIds.planche, "controlled-planche-lean");
recentEvidence.confirmMilestone(definitions.graphIds.lSitVSit, "tuck-support");
const recentIntent = intentFor(recentId, [
  goal(definitions.graphIds.planche, "primary", "toe-light-planche-loading"),
  goal(definitions.graphIds.lSitVSit, "secondary", "controlled-leg-extensions"),
]);
const loadExercise = bundle.exercises.find((exercise) => exercise.id === "planche-lean-hold");
const loadVariant = loadExercise?.prescriptionVariants.find((variant) => variant.id === "planche-lean-hold-standard");
if (!loadExercise || !loadVariant) throw new Error("Missing Planche load fixture exercise");
const loadPlan = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("session-plan", "phase6-recent-load-plan"),
  athleteId: recentId,
  createdAt: at(1, -10),
  catalogueVersion: bundle.catalogueVersion,
  generatorPolicyId: contracts.parseStableId("policy", "phase6-load-fixture"),
  generatorPolicyVersion: contracts.parseDefinitionVersion(1),
  definitionReferences: [
    { kind: "exercise", id: loadExercise.id, version: loadExercise.definitionVersion },
    { kind: "policy", id: "phase6-load-fixture", version: contracts.parseDefinitionVersion(1) },
  ],
  intendedDurationSeconds: 300,
  items: [{
    id: contracts.parseStableId("plan-item", "phase6-recent-load-item"),
    exerciseId: loadExercise.id,
    exerciseDefinitionVersion: loadExercise.definitionVersion,
    prescriptionVariantId: loadVariant.id,
    purpose: "primary-development",
    plannedSeconds: 300,
    demand: loadVariant.demand,
  }],
  rationale: [],
};
const loadRecord = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("session-record", "phase6-recent-load-record"),
  athleteId: recentId,
  planId: loadPlan.id,
  startedAt: at(1, -10),
  completedAt: at(1, -5),
  recordedAt: at(1, -5),
  status: "complete",
  itemOutcomes: [{
    planItemId: loadPlan.items[0].id,
    status: "completed",
    participationSeconds: 240,
    review: { outcome: "clean", difficulty: "right" },
  }],
};
const recentState = projectForPlanning({
  athleteId: recentId,
  intent: recentIntent,
  evidenceEvents: recentEvidence.events,
  sessionPlans: [loadPlan],
  sessionRecords: [loadRecord],
});
const recent = generatedFor(recentIntent, recentState, { seed: "phase6-recent-seed" });
assertSuccessfulPlan(recent, recentIntent, recentState, "Recent-load athlete");
assert(!recent.plan?.items.some((item) => item.demand["forward-straight-arm-upper-limb"] === "high"),
  "Recent high Planche exposure produced another high forward-load prescription within 48 hours");

// 8. Specialist work remains both content- and opt-in-gated, including validation defense.
const specialistId = contracts.parseStableId("athlete", "phase6-specialist");
const specialistIntent = intentFor(specialistId, [
  goal(definitions.graphIds.planche, "primary", "full-planche-push-up-eccentric"),
]);
const specialistState = projectForPlanning({ athleteId: specialistId, intent: specialistIntent });
const specialist = generatedFor(specialistIntent, specialistState, { seed: "phase6-specialist-seed" });
if (specialist.plan) assertSuccessfulPlan(specialist, specialistIntent, specialistState, "Specialist opt-out", false);
assert(!specialist.plan?.items.some((item) => item.targetMilestone?.nodeId === "full-planche-push-up-eccentric"),
  "Specialist target appeared without explicit opt-in and content");
assert(specialist.coverageGaps.some((gap) => gap.kind === "missing-content"),
  "Missing specialist content was not reported as a coverage gap");
if (beginner.plan) {
  const developmentIndex = beginner.plan.items.findIndex((item) =>
    explanationMap(beginner).get(item.id)?.block === "primary");
  if (developmentIndex >= 0) {
    const tamperedItems = beginner.plan.items.map((item, index) => index === developmentIndex
      ? { ...item, targetMilestone: {
        graphId: definitions.graphIds.planche,
        nodeId: contracts.parseStableId("node", "full-planche-push-up-eccentric"),
      } }
      : item);
    const tampered = { ...beginner, plan: { ...beginner.plan, items: tamperedItems } };
    const tamperedIssues = planning.validateGeneratedSession({
      generated: tampered,
      bundle,
      intent: beginnerIntent,
      state: beginnerState,
      policy: generatorPolicy,
    });
    assert(tamperedIssues.some((issue) => issue.code === planning.planningReasonCodes.specialistBypass),
      "Planner validation did not reject an injected specialist item");
  }
}

// A real, trainable exercise cannot borrow an unrelated target milestone. The
// fixture keeps the Session Plan schema, demand, references and trainability
// internally valid so only semantic target/exercise validation can reject it.
if (beginner.plan) {
  const explanations = explanationMap(beginner);
  const targetIndex = beginner.plan.items.findIndex((item) => item.targetMilestone
    && explanations.get(item.id)?.block === "primary");
  const original = beginner.plan.items[targetIndex];
  const unrelated = bundle.exercises.find((exercise) => exercise.id === "supine-spinal-twist");
  const unrelatedVariant = unrelated?.prescriptionVariants[0];
  if (targetIndex < 0 || !original || !unrelated || !unrelatedVariant) {
    failures.push("Target/exercise mismatch fixture could not resolve its canonical items");
  } else {
    const unrelatedEvaluation = projection.evaluateTrainability({
      request: {
        exerciseId: unrelated.id,
        exerciseDefinitionVersion: unrelated.definitionVersion,
        prescriptionVariantId: unrelatedVariant.id,
      },
      state: beginnerState,
      bundle,
      asOf,
      policy: projectionPolicy,
      intent: beginnerIntent,
    });
    assert(unrelatedEvaluation.decision !== "block",
      "Target/exercise mismatch fixture selected a blocked unrelated exercise");
    const mismatchItems = beginner.plan.items.map((item, index) => index === targetIndex
      ? {
        ...item,
        exerciseId: unrelated.id,
        exerciseDefinitionVersion: unrelated.definitionVersion,
        prescriptionVariantId: unrelatedVariant.id,
        demand: unrelatedVariant.demand,
      }
      : item);
    const mismatchReferences = beginner.plan.definitionReferences.some((reference) =>
      reference.kind === "exercise" && reference.id === unrelated.id)
      ? beginner.plan.definitionReferences
      : [...beginner.plan.definitionReferences, {
        kind: "exercise",
        id: unrelated.id,
        version: unrelated.definitionVersion,
      }];
    const mismatchTrainability = beginner.trainabilityUsed.map((evaluation) =>
      evaluation.exerciseId === original.exerciseId
        && evaluation.exerciseDefinitionVersion === original.exerciseDefinitionVersion
        && evaluation.prescriptionVariantId === original.prescriptionVariantId
        ? {
          exerciseId: unrelated.id,
          exerciseDefinitionVersion: unrelated.definitionVersion,
          prescriptionVariantId: unrelatedVariant.id,
          decision: unrelatedEvaluation.decision,
          reasonCodes: unrelatedEvaluation.reasonCodes,
        }
        : evaluation);
    const mismatchGenerated = {
      ...beginner,
      plan: {
        ...beginner.plan,
        definitionReferences: mismatchReferences,
        items: mismatchItems,
      },
      trainabilityUsed: mismatchTrainability,
    };
    const mismatchDomain = validation.validateSessionPlan(mismatchGenerated.plan);
    assert(mismatchDomain.valid,
      `Target/exercise mismatch fixture broke the base Session Plan schema: ${mismatchDomain.issues
        .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
    const mismatchIssues = planning.validateGeneratedSession({
      generated: mismatchGenerated,
      bundle,
      intent: beginnerIntent,
      state: beginnerState,
      policy: generatorPolicy,
    });
    assert(mismatchIssues.some((issue) => issue.code === planning.planningReasonCodes.prerequisiteBypass
      && /exercise|target|milestone/iu.test(issue.message)),
    "Planner validation accepted an unrelated real exercise under a valid target milestone");
  }
}

if (process.env.VNEXT_PHASE6_PRINT_EXAMPLES === "1") {
  const summarize = (generated) => ({
    emphasis: {
      primary: generated.emphasis?.primary,
      secondary: generated.emphasis?.secondary,
      maintenance: generated.emphasis?.maintenance,
    },
    durationSeconds: generated.plan?.intendedDurationSeconds,
    items: generated.plan?.items.map((item) => ({
      exerciseId: item.exerciseId,
      purpose: item.purpose,
      seconds: item.plannedSeconds,
      target: item.targetMilestone,
      block: explanationMap(generated).get(item.id)?.block,
    })),
    coverageGaps: generated.coverageGaps,
  });
  console.log(JSON.stringify({
    beginner: summarize(beginner),
    mixed: summarize(mixed),
    advanced: summarize(advanced),
    restricted: summarize(restricted),
  }, null, 2));
}

if (failures.length) {
  console.error(`vNext Phase 6 validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("vNext Phase 6 validation passed");
  console.log("Golden scenarios: beginner/demand, mixed, technical, advanced, Press/Transition prerequisites, maintenance, restricted, equipment, recent-load and specialist");
  console.log("Safety invariants: deterministic semantic IDs, exact/short timing, target/frontier integrity, equipment, trainability, technical ordering and graph/high-load compatibility");
}
