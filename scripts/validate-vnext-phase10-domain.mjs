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
    return loadTypeScriptModule(relative(
      projectRoot,
      resolveTypeScriptModule(specifier, absolutePath),
    ));
  };
  new Function("exports", "module", "require", "__filename", "__dirname", compiled)(
    loaded.exports,
    loaded,
    localRequire,
    absolutePath,
    dirname(absolutePath),
  );
  return loaded.exports;
};

const contracts = loadTypeScriptModule("app/vnext/contracts.ts");
const definitions = loadTypeScriptModule("app/vnext/definitions/index.ts");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const prerequisites = loadTypeScriptModule("app/vnext/planning/prerequisites.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts");

const v1 = definitions.vNextDefinitionBundleV1;
const current = definitions.vNextDefinitionBundle;
const history = definitions.vNextDefinitionBundles;
const projectionPolicy = projection.vNextProjectionPolicy;
const generatorPolicy = planning.vNextGeneratorPolicy;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const AS_OF = "2026-08-24T12:00:00.000Z";
const dayMs = 86_400_000;
const allEquipment = [...new Set(current.exercises.flatMap((exercise) => exercise.equipment))]
  .sort()
  .map((id) => contracts.parseStableId("equipment", id));
const denseLowDemand = () => Object.fromEntries(
  contracts.DEMAND_DOMAINS.map((domain) => [domain, "low"]),
);
const canonical = (value) => JSON.stringify(value, (_key, nested) => {
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return nested;
  return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
});
const milestoneKey = (milestone) => `${milestone.graphId}:${milestone.nodeId}`;
const subjectKey = (subject) => subject.kind === "milestone"
  ? `milestone:${milestoneKey(subject.milestone)}`
  : `capacity:${subject.capacity.capacityId}:${subject.capacity.facetId}`;
const refKey = (ref) => ref.kind === "milestone"
  ? `milestone:${milestoneKey(ref.milestone)}`
  : ref.kind === "capacity-facet"
    ? `capacity:${ref.capacity.capacityId}:${ref.capacity.facetId}`
    : `benchmark:${ref.benchmarkProtocolId}`;
const before = (days, minutes = 0, anchor = AS_OF) => new Date(
  Date.parse(anchor) - days * dayMs + minutes * 60_000,
).toISOString();

let eventSerial = 0;
const measurementFor = (protocol, passing = true) => {
  if (protocol.metric.kind === "duration-seconds") {
    return { value: passing ? protocol.metric.minimum : Math.max(0, protocol.metric.minimum - 1), unit: "seconds" };
  }
  if (protocol.metric.kind === "repetitions") {
    return { value: passing ? protocol.metric.minimum : Math.max(0, protocol.metric.minimum - 1), unit: "repetitions" };
  }
  if (protocol.metric.kind === "successful-attempts") {
    const value = passing ? protocol.metric.minimumSuccessful : Math.max(0, protocol.metric.minimumSuccessful - 1);
    return { value, unit: "attempts", attemptsTotal: Math.max(value, protocol.metric.maximumAttempts) };
  }
  return undefined;
};

const intentFor = (athleteId, goals = [], options = {}) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId,
  updatedAt: options.updatedAt ?? before(30),
  goals,
  equipment: options.equipment ?? allEquipment,
  defaultSessionDemand: options.defaultSessionDemand ?? "standard",
  preferences: { specialistOptIn: options.specialistOptIn ?? false },
});

const eventFor = (protocol, athleteId, options = {}) => {
  eventSerial += 1;
  const occurredAt = options.occurredAt ?? before(options.daysBefore ?? 10, eventSerial % 47);
  const passing = options.passing ?? true;
  const measurement = measurementFor(protocol, passing);
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("event", `p10-domain-event-${eventSerial}`),
    athleteId,
    occurredAt,
    recordedAt: options.recordedAt ?? occurredAt,
    source: options.source ?? "guided-test",
    catalogueVersion: options.catalogueVersion ?? current.catalogueVersion,
    type: "performance_observed",
    subject: protocol.subject,
    outcome: options.outcome ?? (passing ? "clean" : "not-yet"),
    ...(options.includeProtocol === false ? {} : {
      benchmarkProtocolId: protocol.id,
      benchmarkProtocolVersion: protocol.definitionVersion,
    }),
    ...(options.source === "self-assessment" || options.includeSession === false ? {} : {
      observationSessionId: contracts.parseStableId(
        "observation-session",
        options.sessionId ?? `p10-domain-test-${eventSerial}`,
      ),
    }),
    ...(measurement ? { measurement } : {}),
    assistance: protocol.conditions.assistance,
    range: protocol.conditions.range,
  };
};

const qualifyingEvents = (protocol, athleteId, options = {}) => {
  const count = Math.max(
    protocol.confirmation.qualifyingObservations,
    protocol.confirmation.minimumDistinctSessions,
  );
  return Array.from({ length: count }, (_unused, index) => eventFor(protocol, athleteId, {
    ...options,
    daysBefore: (options.daysBefore ?? 10) + count - index - 1,
    ...(options.sameSession ? { sessionId: `${options.prefix ?? "p10"}-same-session` } : {}),
  }));
};

const subjectState = (state, subject) => subject.kind === "milestone"
  ? state.nodeStates.find((candidate) => milestoneKey(candidate.milestone) === milestoneKey(subject.milestone))
  : state.capacityFindings.find((candidate) =>
    candidate.capacity.capacityId === subject.capacity.capacityId
      && candidate.capacity.facetId === subject.capacity.facetId);

const subjectIsEstablished = (finding, subject) => subject.kind === "milestone"
  ? finding?.lifecycle === "established" && finding.confidence === "current"
  : finding?.finding === "demonstrated"
    && finding.confirmationSatisfied
    && finding.confidence === "current";

const project = ({ athleteId, intent, evidenceEvents = [], sessionPlans = [], sessionRecords = [],
  asOf = AS_OF, trainability = false, bundles = history, policy = projectionPolicy }) => {
  const result = projection.projectAthleteState({
    athleteId,
    asOf,
    policy,
    definitionBundles: bundles,
    evidenceEvents,
    sessionPlans,
    sessionRecords,
    intent,
    trainabilityRequests: trainability ? planning.planningTrainabilityRequests(current) : [],
  });
  assert(result.ok && result.state, `Projection failed for ${athleteId}: ${result.issues
    .map((issue) => `${issue.code} ${issue.message}`).join("; ")}`);
  if (!result.state) return undefined;
  const checked = validation.validateDerivedAthleteState(result.state);
  assert(checked.valid, `Projection emitted invalid state for ${athleteId}: ${checked.issues
    .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
  return result.state;
};

const protocolById = new Map(current.benchmarkProtocols.map((protocol) => [protocol.id, protocol]));
const protocolBySubject = new Map(current.benchmarkProtocols.map((protocol) => [subjectKey(protocol.subject), protocol]));
const nodeByKey = new Map(current.graphs.flatMap((graph) => graph.nodes.map((node) => [
  `${graph.id}:${node.id}`,
  { graph, node },
])));
const capacityFacetByKey = new Map(current.capacities.flatMap((capacity) => capacity.facets.map((facet) => [
  `${capacity.id}:${facet.id}`,
  { capacity, facet },
])));

const createEvidenceBuilder = (athleteId) => {
  const evidenceEvents = [];
  const confirmedProtocols = new Set();
  const confirmedMilestones = new Set();
  const confirmProtocol = (protocol) => {
    const key = `${protocol.id}@${protocol.definitionVersion}`;
    if (confirmedProtocols.has(key)) return;
    confirmedProtocols.add(key);
    evidenceEvents.push(...qualifyingEvents(protocol, athleteId, { prefix: `p10-build-${eventSerial + 1}` }));
  };
  const confirmRef = (ref, visiting = new Set()) => {
    if (ref.kind === "benchmark") {
      const protocol = protocolById.get(ref.benchmarkProtocolId);
      if (!protocol) throw new Error(`Unknown benchmark prerequisite ${ref.benchmarkProtocolId}`);
      confirmProtocol(protocol);
      return;
    }
    if (ref.kind === "capacity-facet") {
      const protocol = protocolBySubject.get(`capacity:${ref.capacity.capacityId}:${ref.capacity.facetId}`);
      if (!protocol) throw new Error(`Unknown capacity prerequisite ${refKey(ref)}`);
      confirmProtocol(protocol);
      return;
    }
    confirmMilestone(ref.milestone.graphId, ref.milestone.nodeId, visiting);
  };
  const confirmMilestone = (graphId, nodeId, visiting = new Set()) => {
    const key = `${graphId}:${nodeId}`;
    if (confirmedMilestones.has(key)) return;
    if (visiting.has(key)) throw new Error(`Cycle while constructing ${key}`);
    const entry = nodeByKey.get(key);
    if (!entry) throw new Error(`Unknown milestone ${key}`);
    const next = new Set(visiting).add(key);
    for (const ref of entry.node.prerequisiteRule?.allOf ?? []) confirmRef(ref, next);
    const alternatives = entry.node.prerequisiteRule?.anyOf ?? [];
    if (alternatives.length) confirmRef(alternatives[0], next);
    const protocol = protocolBySubject.get(`milestone:${key}`);
    if (!protocol) throw new Error(`Cannot confirm missing-content milestone ${key}`);
    confirmProtocol(protocol);
    confirmedMilestones.add(key);
  };
  const establishPrerequisites = (node) => {
    for (const ref of node.prerequisiteRule?.allOf ?? []) confirmRef(ref);
    const alternatives = node.prerequisiteRule?.anyOf ?? [];
    if (alternatives.length) confirmRef(alternatives[0]);
  };
  return { evidenceEvents, confirmProtocol, confirmRef, confirmMilestone, establishPrerequisites };
};

// Definition, graph, protocol and catalogue integrity.
const bundleValidation = validation.validateDefinitionBundle(current);
assert(bundleValidation.valid, `Current bundle is invalid: ${bundleValidation.issues
  .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
assert(history.length === 2 && history[0] === v1 && history[1] === current,
  "Definition history is not ordered catalogue v1 → catalogue v2");
assert(current.graphs.length === 7, `Expected seven graphs; found ${current.graphs.length}`);
assert(current.capacities.length === 7, `Expected seven capacities; found ${current.capacities.length}`);
assert(current.exercises.length === 225, `Expected 225 catalogue-v2 exercises; found ${current.exercises.length}`);
assert(current.benchmarkProtocols.length === 94,
  `Expected 94 catalogue-v2 protocols; found ${current.benchmarkProtocols.length}`);
assert(nodeByKey.size === 103, `Expected 103 graph nodes; found ${nodeByKey.size}`);
assert(capacityFacetByKey.size === 21, `Expected 21 capacity facets; found ${capacityFacetByKey.size}`);

const boundaryCounts = Object.fromEntries(["automatic", "stronger-gated", "specialist"].map((boundary) => [
  boundary,
  [...nodeByKey.values()].filter(({ node }) => node.programmingBoundary === boundary).length,
]));
assert(boundaryCounts.automatic === 74 && boundaryCounts["stronger-gated"] === 19
  && boundaryCounts.specialist === 10,
`Unexpected programming boundaries ${JSON.stringify(boundaryCounts)}`);
const availableNodes = [...nodeByKey.values()].filter(({ node }) => node.implementationStatus === "available");
const missingNodes = [...nodeByKey.values()].filter(({ node }) => node.implementationStatus === "missing-content");
assert(availableNodes.length === 73 && missingNodes.length === 30,
  `Expected 73 available/30 missing nodes; found ${availableNodes.length}/${missingNodes.length}`);
assert(missingNodes.filter(({ node }) => node.programmingBoundary === "automatic").length === 1,
  "The current catalogue must retain exactly one dependency-blocked automatic gap");
assert([...nodeByKey.values()].filter(({ node }) => node.programmingBoundary !== "automatic")
  .every(({ node }) => node.implementationStatus === "missing-content"),
"Stronger-gated or specialist content became production-reachable before its approved content gate");

for (const exercise of v1.exercises) {
  const retained = current.exercises.find((candidate) => candidate.id === exercise.id);
  assert(retained && canonical(retained) === canonical(exercise),
    `Catalogue v2 changed retained catalogue-v1 exercise ${exercise.id}`);
}
for (const protocol of v1.benchmarkProtocols) {
  const retained = current.benchmarkProtocols.find((candidate) => candidate.id === protocol.id);
  assert(retained && canonical(retained) === canonical(protocol),
    `Catalogue v2 changed retained catalogue-v1 protocol ${protocol.id}`);
}
for (const capacity of v1.capacities) {
  const retained = current.capacities.find((candidate) => candidate.id === capacity.id);
  assert(retained && canonical(retained) === canonical(capacity),
    `Catalogue v2 changed retained capacity ${capacity.id}`);
}

const allSubjectKeys = new Set();
for (const protocol of current.benchmarkProtocols) {
  const key = subjectKey(protocol.subject);
  assert(!allSubjectKeys.has(key), `Multiple protocols own the same subject ${key}`);
  allSubjectKeys.add(key);
  const exercise = current.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === protocol.prescriptionVariantId);
  assert(Boolean(exercise && variant), `Protocol ${protocol.id} has no exact exercise/prescription`);
  assert(exercise && canonical([...exercise.equipment].sort()) === canonical([...protocol.conditions.equipment].sort()),
    `Protocol ${protocol.id} apparatus differs from exercise ${protocol.exerciseId}`);
  assert(protocol.confirmation.allowedSources.length > 0
    && protocol.confirmation.allowedSources.every((source) => source === "guided-test" || source === "session-record"),
  `Protocol ${protocol.id} permits non-authoritative confirmation`);
}
for (const [key, { node }] of nodeByKey) {
  const expected = node.implementationStatus === "available" ? 1 : 0;
  assert(node.benchmarkProtocolIds.length === expected,
    `${key} has ${node.benchmarkProtocolIds.length} protocols; expected ${expected}`);
  assert(node.implementationStatus !== "available" || protocolBySubject.has(`milestone:${key}`),
    `Available node ${key} has no subject protocol`);
}
for (const key of capacityFacetByKey.keys()) {
  assert(protocolBySubject.has(`capacity:${key}`), `Capacity facet ${key} has no protocol`);
}

for (const exercise of current.exercises) {
  const variants = new Set(exercise.prescriptionVariants.map((variant) => variant.id));
  for (const variant of exercise.prescriptionVariants) {
    const domains = Object.keys(variant.demand);
    assert(domains.length === contracts.DEMAND_DOMAINS.length
      && contracts.DEMAND_DOMAINS.every((domain) => domains.includes(domain)),
    `${exercise.id}:${variant.id} has an incomplete demand profile`);
  }
  for (const link of exercise.graphLinks) {
    const entry = link.nodeId ? nodeByKey.get(`${link.graphId}:${link.nodeId}`) : undefined;
    assert(nodeByKey.has(`${link.graphId}:${link.nodeId}`) || (!link.nodeId
      && current.graphs.some((graph) => graph.id === link.graphId)),
    `${exercise.id} has an invalid graph link ${link.graphId}:${link.nodeId ?? "graph"}`);
    if (link.contribution === "milestone" || link.contribution === "transition") {
      assert(Boolean(entry), `${exercise.id} has a node-authority link without a node`);
    }
  }
  for (const relation of exercise.relations) {
    const target = current.exercises.find((candidate) => candidate.id === relation.targetExerciseId);
    assert(Boolean(target), `${exercise.id} relation points to missing ${relation.targetExerciseId}`);
    assert(!relation.fromPrescriptionVariantId || variants.has(relation.fromPrescriptionVariantId),
      `${exercise.id} relation has unknown source prescription ${relation.fromPrescriptionVariantId}`);
    assert(!relation.targetPrescriptionVariantId
      || target?.prescriptionVariants.some((variant) => variant.id === relation.targetPrescriptionVariantId),
    `${exercise.id} relation has unknown target prescription ${relation.targetPrescriptionVariantId}`);
  }
}

const milestonePrerequisites = (node) => [
  ...(node.prerequisiteRule?.allOf ?? []),
  ...(node.prerequisiteRule?.anyOf ?? []),
].filter((ref) => ref.kind === "milestone").map((ref) => milestoneKey(ref.milestone));
const visiting = new Set();
const visited = new Set();
const visit = (key, trail = []) => {
  if (visiting.has(key)) {
    failures.push(`Graph cycle ${[...trail, key].join(" → ")}`);
    return;
  }
  if (visited.has(key)) return;
  visiting.add(key);
  const entry = nodeByKey.get(key);
  if (!entry) failures.push(`Unknown graph prerequisite ${key}`);
  else milestonePrerequisites(entry.node).forEach((prerequisite) => visit(prerequisite, [...trail, key]));
  visiting.delete(key);
  visited.add(key);
};
for (const key of nodeByKey.keys()) visit(key);

const executableMemo = new Map();
const executable = (key) => {
  if (executableMemo.has(key)) return executableMemo.get(key);
  const node = nodeByKey.get(key)?.node;
  if (!node || node.implementationStatus !== "available") return false;
  const refExecutable = (ref) => ref.kind !== "milestone" || executable(milestoneKey(ref.milestone));
  const allOf = node.prerequisiteRule?.allOf ?? [];
  const anyOf = node.prerequisiteRule?.anyOf ?? [];
  const result = allOf.every(refExecutable) && (!anyOf.length || anyOf.some(refExecutable));
  executableMemo.set(key, result);
  return result;
};
assert(availableNodes.every(({ graph, node }) => executable(`${graph.id}:${node.id}`)),
  `Available nodes have no executable prerequisite path: ${availableNodes
    .filter(({ graph, node }) => !executable(`${graph.id}:${node.id}`))
    .map(({ graph, node }) => `${graph.id}:${node.id}`).join(", ")}`);

// Exercise the implemented flat allOf/anyOf semantics for every authored anyOf rule.
const syntheticState = (athleteId, satisfiedRefs = [], target) => {
  const satisfiedMilestones = new Set();
  const satisfiedCapacities = new Set();
  for (const ref of satisfiedRefs) {
    if (ref.kind === "milestone") satisfiedMilestones.add(milestoneKey(ref.milestone));
    if (ref.kind === "capacity-facet") {
      satisfiedCapacities.add(`${ref.capacity.capacityId}:${ref.capacity.facetId}`);
    }
    if (ref.kind === "benchmark") {
      const protocol = protocolById.get(ref.benchmarkProtocolId);
      if (protocol?.subject.kind === "milestone") {
        satisfiedMilestones.add(milestoneKey(protocol.subject.milestone));
      } else if (protocol) {
        satisfiedCapacities.add(`${protocol.subject.capacity.capacityId}:${protocol.subject.capacity.facetId}`);
      }
    }
  }
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    projectionVersion: projectionPolicy.version,
    asOf: AS_OF,
    observationCursors: {},
    nodeStates: current.graphs.flatMap((graph) => graph.nodes.map((node) => {
      const established = satisfiedMilestones.has(`${graph.id}:${node.id}`);
      return {
        milestone: { graphId: graph.id, nodeId: node.id },
        lifecycle: established ? "established" : "unknown",
        confidence: established ? "current" : "unknown",
        satisfiedForEligibilityBy: [],
        supportingObservationRefs: [],
        reasonCodes: [established ? projection.projectionReasonCodes.established : projection.projectionReasonCodes.unknown],
      };
    })),
    capacityFindings: current.capacities.flatMap((capacity) => capacity.facets.map((facet) => {
      const established = satisfiedCapacities.has(`${capacity.id}:${facet.id}`);
      return {
        capacity: { capacityId: capacity.id, facetId: facet.id },
        finding: established ? "demonstrated" : "unknown",
        confirmationSatisfied: established,
        confidence: established ? "current" : "unknown",
        supportingObservationRefs: [],
        reasonCodes: [established ? projection.projectionReasonCodes.demonstrated : projection.projectionReasonCodes.unknown],
      };
    })),
    activeRestrictions: [],
    reconfirmationRequirements: [],
    recentLoad: { from: before(projectionPolicy.recentLoadDays), to: AS_OF, demand: denseLowDemand(), exposures: [] },
    workingNodes: target ? [{ milestone: target, reasonCodes: [projection.projectionReasonCodes.eligibleFrontier] }] : [],
    maintenanceNeeds: [],
    eligibleTargets: target ? [{ milestone: target, reasonCodes: [projection.projectionReasonCodes.eligibleFrontier] }] : [],
    trainabilityEvaluations: [],
  };
};

let prerequisiteTruthCases = 0;
for (const [key, { node }] of nodeByKey) {
  const allOf = node.prerequisiteRule?.allOf ?? [];
  const anyOf = node.prerequisiteRule?.anyOf ?? [];
  if (!anyOf.length) continue;
  const athleteId = contracts.parseStableId("athlete", `p10-any-${prerequisiteTruthCases + 1}`);
  const intent = intentFor(athleteId);
  const inputFor = (refs) => ({
    createdAt: AS_OF,
    bundle: current,
    intent,
    state: syntheticState(athleteId, refs),
    projectionPolicy,
  });
  const allOnlyInput = inputFor(allOf);
  assert(allOf.every((ref) => prerequisites.prerequisiteIsSatisfied(ref, allOnlyInput)),
    `${key} allOf fixture failed to satisfy all required refs`);
  assert(!anyOf.some((ref) => prerequisites.prerequisiteIsSatisfied(ref, allOnlyInput)),
    `${key} allOf evidence unexpectedly satisfied an anyOf alternative`);
  const selected = prerequisites.selectedUnsatisfiedPrerequisites(allOnlyInput, node);
  assert(selected.length === 1 && anyOf.some((ref) => refKey(ref) === refKey(selected[0])),
    `${key} did not select exactly one deterministic anyOf route`);
  prerequisiteTruthCases += 1;
  for (const alternative of anyOf) {
    const input = inputFor([...allOf, alternative]);
    assert(prerequisites.selectedUnsatisfiedPrerequisites(input, node).length === 0,
      `${key} remained blocked after allOf plus ${refKey(alternative)}`);
    prerequisiteTruthCases += 1;
  }
  for (const omitted of allOf) {
    const input = inputFor([...allOf.filter((ref) => refKey(ref) !== refKey(omitted)), anyOf[0]]);
    const missing = prerequisites.selectedUnsatisfiedPrerequisites(input, node);
    assert(missing.some((ref) => refKey(ref) === refKey(omitted)),
      `${key} accepted anyOf while missing required allOf ${refKey(omitted)}`);
    prerequisiteTruthCases += 1;
  }
}

// Every benchmark protocol: exact evidence confirms, insufficient evidence does not,
// separated-session policies reject a single test occasion, and freshness expires exactly.
let protocolCases = 0;
let freshnessCases = 0;
for (const [index, protocol] of current.benchmarkProtocols.entries()) {
  const athleteId = contracts.parseStableId("athlete", `p10-protocol-${index + 1}`);
  const intent = intentFor(athleteId);
  const complete = qualifyingEvents(protocol, athleteId, { prefix: `p10-protocol-${index + 1}` });
  const completeState = project({ athleteId, intent, evidenceEvents: complete });
  const completeFinding = completeState && subjectState(completeState, protocol.subject);
  assert(completeState && subjectIsEstablished(completeFinding, protocol.subject),
    `Protocol ${protocol.id} did not establish its exact subject`);
  protocolCases += 1;

  const insufficient = complete.length > 1
    ? complete.slice(0, -1)
    : [eventFor(protocol, athleteId, { passing: false, outcome: "not-yet" })];
  const insufficientState = project({ athleteId, intent, evidenceEvents: insufficient });
  assert(insufficientState && !subjectIsEstablished(subjectState(insufficientState, protocol.subject), protocol.subject),
    `Protocol ${protocol.id} established from insufficient evidence`);
  protocolCases += 1;

  if (protocol.confirmation.minimumDistinctSessions > 1) {
    const sameSession = qualifyingEvents(protocol, athleteId, {
      prefix: `p10-same-${index + 1}`,
      sameSession: true,
    });
    const sameState = project({ athleteId, intent, evidenceEvents: sameSession });
    assert(sameState && !subjectIsEstablished(subjectState(sameState, protocol.subject), protocol.subject),
      `Protocol ${protocol.id} ignored its separated-session policy`);
    protocolCases += 1;
  }

  if (protocol.confirmation.freshnessDays !== undefined) {
    const oldEvents = qualifyingEvents(protocol, athleteId, {
      prefix: `p10-stale-${index + 1}`,
      daysBefore: protocol.confirmation.freshnessDays + 2,
    });
    const staleState = project({ athleteId, intent, evidenceEvents: oldEvents });
    const staleFinding = staleState && subjectState(staleState, protocol.subject);
    assert(staleFinding?.confidence === "stale",
      `Protocol ${protocol.id} did not become stale after ${protocol.confirmation.freshnessDays} days`);
    freshnessCases += 1;
  }
}

// Catalogue-v1 observations retain only the 64 explicitly compatible subjects.
let compatibilityCases = 0;
for (const [index, protocol] of v1.benchmarkProtocols.entries()) {
  const athleteId = contracts.parseStableId("athlete", `p10-v1-compat-${index + 1}`);
  const intent = intentFor(athleteId);
  const evidenceEvents = qualifyingEvents(protocol, athleteId, {
    catalogueVersion: v1.catalogueVersion,
    prefix: `p10-v1-${index + 1}`,
  });
  const state = project({ athleteId, intent, evidenceEvents });
  assert(state && subjectIsEstablished(subjectState(state, protocol.subject), protocol.subject),
    `Catalogue-v1 subject ${subjectKey(protocol.subject)} did not replay into v2`);
  compatibilityCases += 1;
}
const v1SubjectKeys = new Set(v1.benchmarkProtocols.map((protocol) => subjectKey(protocol.subject)));
const compatibilityKeys = new Set(projectionPolicy.subjectVersionCompatibilityRules.map((rule) => subjectKey(rule.subject)));
assert(canonical([...v1SubjectKeys].sort()) === canonical([...compatibilityKeys].sort()),
  "Projection compatibility is not exactly the catalogue-v1 subject set");
const newSubjectProtocols = current.benchmarkProtocols.filter((protocol) => !v1SubjectKeys.has(subjectKey(protocol.subject)));
const noBackCreditId = contracts.parseStableId("athlete", "p10-no-back-credit");
const noBackCreditIntent = intentFor(noBackCreditId);
const migratedHints = newSubjectProtocols.map((protocol, index) => eventFor(protocol, noBackCreditId, {
  source: "migration",
  catalogueVersion: v1.catalogueVersion,
  includeProtocol: false,
  includeSession: false,
  occurredAt: before(20, index),
}));
const noBackCreditState = project({
  athleteId: noBackCreditId,
  intent: noBackCreditIntent,
  evidenceEvents: migratedHints,
});
assert(noBackCreditState && newSubjectProtocols.every((protocol) => {
  const finding = subjectState(noBackCreditState, protocol.subject);
  return protocol.subject.kind === "milestone"
    ? finding?.lifecycle === "unknown"
    : finding?.finding === "unknown";
}), "Catalogue-v1 hints awarded catalogue-v2 subjects");
compatibilityCases += newSubjectProtocols.length;

// Representative lifecycle, contradiction, inactivity, restriction and clearance.
const lifecycleProtocol = current.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "milestone"
    && protocol.confirmation.minimumDistinctSessions >= 2
    && protocol.confirmation.freshnessDays !== undefined);
const nonExpiringProtocol = current.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "milestone" && protocol.confirmation.freshnessDays === undefined);
if (!lifecycleProtocol || !nonExpiringProtocol) {
  failures.push("Could not resolve lifecycle protocols");
} else {
  const athleteId = contracts.parseStableId("athlete", "p10-lifecycle-athlete");
  const intent = intentFor(athleteId);
  const weak = eventFor(lifecycleProtocol, athleteId, {
    source: "self-assessment",
    includeSession: false,
    daysBefore: 14,
  });
  const weakState = project({ athleteId, intent, evidenceEvents: [weak] });
  const weakFinding = weakState && subjectState(weakState, lifecycleProtocol.subject);
  assert(weakFinding?.lifecycle === "estimated" && weakFinding.confidence === "unknown",
    "Self-assessment bypassed provisional Estimated state");

  const successful = qualifyingEvents(lifecycleProtocol, athleteId, { prefix: "p10-lifecycle-success" });
  const oneState = project({ athleteId, intent, evidenceEvents: successful.slice(0, 1) });
  const oneFinding = oneState && subjectState(oneState, lifecycleProtocol.subject);
  assert(oneFinding?.lifecycle === "demonstrated" && oneFinding.confidence === "current",
    "One valid observation did not remain Demonstrated before full confirmation");
  const establishedState = project({ athleteId, intent, evidenceEvents: successful });
  const establishedFinding = establishedState && subjectState(establishedState, lifecycleProtocol.subject);
  assert(establishedFinding?.lifecycle === "established" && establishedFinding.confidence === "current",
    "Full confirmation did not reach Established/current");

  const failuresAfter = Array.from({ length: projectionPolicy.contradictionMinimumFailures }, (_unused, index) =>
    eventFor(lifecycleProtocol, athleteId, {
      passing: false,
      outcome: "not-yet",
      daysBefore: 3 - index,
    }));
  const contradictedState = project({
    athleteId,
    intent,
    evidenceEvents: [...successful, ...failuresAfter],
  });
  const contradictedFinding = contradictedState && subjectState(contradictedState, lifecycleProtocol.subject);
  assert(contradictedFinding?.lifecycle === "established" && contradictedFinding.confidence === "contradicted",
    "Repeated benchmark failures did not preserve capability while contradicting confidence");
  const reconfirm = qualifyingEvents(lifecycleProtocol, athleteId, {
    prefix: "p10-lifecycle-reconfirm",
    daysBefore: 1,
  }).map((event, index) => ({ ...event, occurredAt: before(1, index + 1), recordedAt: before(1, index + 1) }));
  const reconfirmedState = project({
    athleteId,
    intent,
    evidenceEvents: [...successful, ...failuresAfter, ...reconfirm],
  });
  assert(reconfirmedState
    && subjectState(reconfirmedState, lifecycleProtocol.subject)?.confidence === "current",
  "Full reconfirmation did not restore current confidence");

  const restriction = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("event", "p10-lifecycle-restriction"),
    athleteId,
    occurredAt: before(1),
    recordedAt: before(1),
    source: "athlete-report",
    catalogueVersion: current.catalogueVersion,
    type: "restriction_reported",
    severity: "block",
    demandDomains: ["hand-wrist-bearing"],
    bodyRegions: ["wrist"],
  };
  const restrictedState = project({ athleteId, intent, evidenceEvents: [...successful, restriction] });
  assert(restrictedState?.activeRestrictions.length === 1
    && subjectState(restrictedState, lifecycleProtocol.subject)?.lifecycle === "established",
  "Restriction erased historical capability or failed to become active");
  const clearance = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("event", "p10-lifecycle-clearance"),
    athleteId,
    occurredAt: before(0, -30),
    recordedAt: before(0, -30),
    source: "athlete-report",
    catalogueVersion: current.catalogueVersion,
    type: "restriction_cleared",
    restrictionEventId: restriction.id,
  };
  const clearedState = project({ athleteId, intent, evidenceEvents: [...successful, restriction, clearance] });
  assert(clearedState?.activeRestrictions.length === 0
    && clearedState?.reconfirmationRequirements.length === 1
    && subjectState(clearedState, lifecycleProtocol.subject)?.lifecycle === "established",
  "Clearance did not preserve capability and require demand-specific reconfirmation");

  const inactiveId = contracts.parseStableId("athlete", "p10-long-inactivity");
  const inactiveIntent = intentFor(inactiveId);
  const inactiveEvents = qualifyingEvents(nonExpiringProtocol, inactiveId, {
    prefix: "p10-inactive",
    daysBefore: 95,
  });
  const inactiveState = project({ athleteId: inactiveId, intent: inactiveIntent, evidenceEvents: inactiveEvents });
  const inactiveFinding = inactiveState && subjectState(inactiveState, nonExpiringProtocol.subject);
  assert(inactiveFinding?.lifecycle === "established" && inactiveFinding.confidence === "current",
    "Long inactivity erased or staled non-expiring capability");
  assert(inactiveState?.maintenanceNeeds.some((item) =>
    milestoneKey(item.milestone) === milestoneKey(nonExpiringProtocol.subject.milestone)),
  "Long inactivity did not derive maintenance for established non-expiring capability");

  const deterministicForward = project({ athleteId, intent, evidenceEvents: [...successful, restriction, clearance] });
  const deterministicReverse = project({ athleteId, intent, evidenceEvents: [...successful, restriction, clearance].reverse() });
  assert(deterministicForward && deterministicReverse
    && canonical(deterministicForward) === canonical(deterministicReverse),
  "Projection changed when immutable observations were replayed in another order");
}

// Every protocol-reuse edge and stronger-node implication must retain one source of truth.
let reuseCases = 0;
for (const [index, rule] of projectionPolicy.protocolReuseRules.entries()) {
  const source = protocolById.get(rule.sourceProtocolId);
  const target = protocolById.get(rule.targetProtocolId);
  if (!source || !target) {
    failures.push(`Protocol reuse rule ${index + 1} has an unavailable endpoint`);
    continue;
  }
  const athleteId = contracts.parseStableId("athlete", `p10-reuse-${index + 1}`);
  const intent = intentFor(athleteId);
  const evidenceEvents = qualifyingEvents(source, athleteId, { prefix: `p10-reuse-${index + 1}` });
  const result = projection.projectAthleteState({
    athleteId,
    asOf: AS_OF,
    policy: projectionPolicy,
    definitionBundles: history,
    evidenceEvents,
    sessionPlans: [],
    sessionRecords: [],
    intent,
    trainabilityRequests: [],
  });
  assert(result.ok && result.state && subjectIsEstablished(subjectState(result.state, source.subject), source.subject)
    && subjectIsEstablished(subjectState(result.state, target.subject), target.subject),
  `Protocol reuse ${source.id} → ${target.id} failed`);
  assert(result.normalizedObservationCount === evidenceEvents.length,
    `Protocol reuse ${source.id} → ${target.id} duplicated raw observation truth`);
  reuseCases += 1;
}

let implicationCases = 0;
for (const [index, rule] of projectionPolicy.mechanicalPredecessorRules.entries()) {
  const sourceProtocol = protocolBySubject.get(`milestone:${milestoneKey(rule.stronger)}`);
  if (!sourceProtocol) {
    failures.push(`Mechanical implication source ${milestoneKey(rule.stronger)} has no protocol`);
    continue;
  }
  const athleteId = contracts.parseStableId("athlete", `p10-implication-${index + 1}`);
  const intent = intentFor(athleteId);
  const evidenceEvents = qualifyingEvents(sourceProtocol, athleteId, { prefix: `p10-implication-${index + 1}` });
  const state = project({ athleteId, intent, evidenceEvents });
  const predecessor = state?.nodeStates.find((item) => milestoneKey(item.milestone) === milestoneKey(rule.predecessor));
  assert(predecessor?.lifecycle === "unknown"
    && predecessor.satisfiedForEligibilityBy.some((item) => milestoneKey(item.milestone) === milestoneKey(rule.stronger)),
  `Stronger evidence ${milestoneKey(rule.stronger)} falsely demonstrated or failed to satisfy ${milestoneKey(rule.predecessor)}`);
  implicationCases += 1;
}

// Equipment and each material demand restriction fail closed across the catalogue.
const allEstablishedState = (athleteId) => syntheticState(
  athleteId,
  [
    ...current.graphs.flatMap((graph) => graph.nodes.map((node) => ({
      kind: "milestone",
      milestone: { graphId: graph.id, nodeId: node.id },
    }))),
    ...current.capacities.flatMap((capacity) => capacity.facets.map((facet) => ({
      kind: "capacity-facet",
      capacity: { capacityId: capacity.id, facetId: facet.id },
    }))),
  ],
);
let equipmentCases = 0;
for (const [exerciseIndex, exercise] of current.exercises.entries()) {
  for (const required of exercise.equipment) {
    const athleteId = contracts.parseStableId("athlete", `p10-equip-${exerciseIndex + 1}-${equipmentCases + 1}`);
    const state = allEstablishedState(athleteId);
    const intent = intentFor(athleteId, [], { equipment: allEquipment.filter((item) => item !== required) });
    for (const variant of exercise.prescriptionVariants) {
      const result = projection.evaluateTrainability({
        request: {
          exerciseId: exercise.id,
          exerciseDefinitionVersion: exercise.definitionVersion,
          prescriptionVariantId: variant.id,
        },
        state,
        bundle: current,
        asOf: AS_OF,
        policy: projectionPolicy,
        intent,
      });
      assert(result.decision === "block"
        && result.reasonCodes.includes(projection.projectionReasonCodes.missingEquipment),
      `${exercise.id}:${variant.id} did not block without ${required}`);
      equipmentCases += 1;
    }
  }
}

let restrictionDemandCases = 0;
for (const [domainIndex, domain] of contracts.DEMAND_DOMAINS.entries()) {
  const candidate = current.exercises.flatMap((exercise) => exercise.prescriptionVariants.map((variant) => ({ exercise, variant })))
    .find(({ variant }) => variant.demand[domain] === "moderate" || variant.demand[domain] === "high");
  if (!candidate) {
    failures.push(`No material prescription exists for demand domain ${domain}`);
    continue;
  }
  const athleteId = contracts.parseStableId("athlete", `p10-demand-restriction-${domainIndex + 1}`);
  const base = allEstablishedState(athleteId);
  const state = {
    ...base,
    activeRestrictions: [{
      source: { kind: "evidence-event", eventId: contracts.parseStableId("event", `p10-demand-restriction-${domainIndex + 1}`) },
      decision: "block",
      demandDomains: [domain],
      bodyRegions: ["reported-area"],
      occurredAt: before(1),
      reasonCodes: [projection.projectionReasonCodes.activeRestriction],
    }],
  };
  const intent = intentFor(athleteId);
  const result = projection.evaluateTrainability({
    request: {
      exerciseId: candidate.exercise.id,
      exerciseDefinitionVersion: candidate.exercise.definitionVersion,
      prescriptionVariantId: candidate.variant.id,
    },
    state,
    bundle: current,
    asOf: AS_OF,
    policy: projectionPolicy,
    intent,
  });
  assert(result.decision === "block"
    && result.reasonCodes.includes(projection.projectionReasonCodes.activeRestriction),
  `${domain} restriction did not block ${candidate.exercise.id}:${candidate.variant.id}`);
  restrictionDemandCases += 1;
}

// Exhaust every production-reachable node through Technique/Standard/Challenge.
const prerequisiteClosure = (targetKey) => {
  const milestones = new Set();
  const add = (key) => {
    if (milestones.has(key)) return;
    milestones.add(key);
    const node = nodeByKey.get(key)?.node;
    for (const ref of node?.prerequisiteRule?.allOf ?? []) {
      if (ref.kind === "milestone") add(milestoneKey(ref.milestone));
    }
    for (const ref of node?.prerequisiteRule?.anyOf ?? []) {
      if (ref.kind === "milestone") add(milestoneKey(ref.milestone));
    }
  };
  const target = nodeByKey.get(targetKey)?.node;
  for (const ref of target?.prerequisiteRule?.allOf ?? []) {
    if (ref.kind === "milestone") add(milestoneKey(ref.milestone));
  }
  for (const ref of target?.prerequisiteRule?.anyOf ?? []) {
    if (ref.kind === "milestone") add(milestoneKey(ref.milestone));
  }
  return milestones;
};

const stateForTarget = (athleteId, target) => {
  const milestoneRefs = [...prerequisiteClosure(milestoneKey(target))].map((key) => {
    const [graphId, nodeId] = key.split(":");
    return { kind: "milestone", milestone: { graphId, nodeId } };
  });
  const capacityRefs = current.capacities.flatMap((capacity) => capacity.facets.map((facet) => ({
    kind: "capacity-facet",
    capacity: { capacityId: capacity.id, facetId: facet.id },
  })));
  return syntheticState(athleteId, [...milestoneRefs, ...capacityRefs], target);
};

const highUpperDomains = new Set(generatorPolicy.highUpperLimbDomains);
let generatorCases = 0;
let exactDurationCases = 0;
let shortDurationCases = 0;
for (const [index, { graph, node }] of availableNodes.entries()) {
  const target = { graphId: graph.id, nodeId: node.id };
  const athleteId = contracts.parseStableId("athlete", `p10-generator-${index + 1}`);
  const intent = intentFor(athleteId, [{ graphId: graph.id, targetNodeId: node.id, priority: "primary" }]);
  const state = stateForTarget(athleteId, target);
  const stateValidation = validation.validateDerivedAthleteState(state);
  assert(stateValidation.valid, `Synthetic generator state ${milestoneKey(target)} is invalid: ${stateValidation.issues
    .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
  const protocol = protocolBySubject.get(`milestone:${milestoneKey(target)}`);
  const generatedByDemand = new Map();
  for (const sessionDemand of ["technique", "standard", "challenge"]) {
    const generated = planning.generateVNextSession({
      createdAt: AS_OF,
      bundle: current,
      intent,
      state,
      projectionPolicy,
      sessionDemand,
      seed: `p10-${index + 1}-${sessionDemand}`,
    }, generatorPolicy);
    generatedByDemand.set(sessionDemand, generated);
    assert(generated.ok && generated.plan,
      `${milestoneKey(target)} ${sessionDemand} failed: ${generated.issues.map((issue) => issue.message).join("; ")}`);
    if (!generated.plan) continue;
    const sessionValidation = validation.validateSessionPlan(generated.plan);
    assert(sessionValidation.valid, `${milestoneKey(target)} ${sessionDemand} emitted an invalid Session Plan`);
    const planningIssues = planning.validateGeneratedSession({
      generated,
      bundle: current,
      intent,
      state,
      policy: generatorPolicy,
    });
    assert(planningIssues.length === 0,
      `${milestoneKey(target)} ${sessionDemand} failed planning validation: ${planningIssues
        .map((issue) => `${issue.code} ${issue.message}`).join("; ")}`);
    const exactTargetItems = generated.plan.items.filter((item) =>
      item.targetMilestone?.graphId === graph.id && item.targetMilestone?.nodeId === node.id);
    assert(exactTargetItems.length > 0,
      `${milestoneKey(target)} ${sessionDemand} omitted its exact target`);
    if (sessionDemand === "technique") {
      assert(exactTargetItems.some((item) => current.exercises.some((exercise) =>
        exercise.id === item.exerciseId && exercise.graphLinks.some((link) =>
          link.graphId === graph.id && link.nodeId === node.id))),
      `${milestoneKey(target)} Technique used content outside the target node`);
    } else {
      assert(exactTargetItems.some((item) => item.exerciseId === protocol?.exerciseId
        && item.prescriptionVariantId === protocol.prescriptionVariantId),
      `${milestoneKey(target)} ${sessionDemand} omitted its exact protocol prescription`);
    }
    const total = generated.plan.items.reduce((seconds, item) => seconds + item.plannedSeconds, 0);
    assert(total === generated.plan.intendedDurationSeconds,
      `${milestoneKey(target)} ${sessionDemand} item timing differs from plan duration`);
    if (total === generatorPolicy.exactDurationSeconds) exactDurationCases += 1;
    else {
      shortDurationCases += 1;
      assert(generated.durationException?.actualSeconds === total
        && generated.durationException.targetSeconds === generatorPolicy.exactDurationSeconds,
      `${milestoneKey(target)} ${sessionDemand} shorter plan lacks an exact duration exception`);
    }
    const highItems = generated.plan.items.filter((item) =>
      Object.entries(item.demand).some(([domain, level]) => highUpperDomains.has(domain) && level === "high"));
    assert(highItems.length <= 1,
      `${milestoneKey(target)} ${sessionDemand} combined ${highItems.length} high upper-limb items`);
    const equipment = new Set(intent.equipment);
    for (const item of generated.plan.items) {
      const exercise = current.exercises.find((candidate) => candidate.id === item.exerciseId);
      const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === item.prescriptionVariantId);
      assert(exercise && variant, `${milestoneKey(target)} emitted an unknown exercise/prescription`);
      assert(exercise?.equipment.every((required) => equipment.has(required)),
        `${milestoneKey(target)} selected unavailable equipment ${exercise?.id}`);
      assert(variant && canonical(item.demand) === canonical(variant.demand),
        `${milestoneKey(target)} rewrote authored demand for ${item.exerciseId}`);
    }
    generatorCases += 1;
  }
  const frontier = [...generatedByDemand.values()].map((generated) =>
    generated.emphasis?.primary.targetMilestone && milestoneKey(generated.emphasis.primary.targetMilestone));
  assert(new Set(frontier).size === 1 && frontier[0] === milestoneKey(target),
    `Technique/Standard/Challenge changed the frontier for ${milestoneKey(target)}`);
  const replay = planning.generateVNextSession({
    createdAt: AS_OF,
    bundle: current,
    intent,
    state,
    projectionPolicy,
    sessionDemand: "standard",
    seed: `p10-${index + 1}-standard`,
  }, generatorPolicy);
  assert(canonical(replay) === canonical(generatedByDemand.get("standard")),
    `${milestoneKey(target)} standard generation is not deterministic`);
  generatorCases += 1;
}

// Missing stronger/specialist destinations remain unreachable regardless of preference or demand.
let boundaryCases = 0;
for (const [index, { graph, node }] of missingNodes.entries()) {
  const target = { graphId: graph.id, nodeId: node.id };
  for (const specialistOptIn of [false, true]) {
    const athleteId = contracts.parseStableId("athlete", `p10-boundary-${index + 1}-${specialistOptIn ? "on" : "off"}`);
    const intent = intentFor(athleteId, [{ graphId: graph.id, targetNodeId: node.id, priority: "primary" }], {
      specialistOptIn,
    });
    const state = stateForTarget(athleteId, target);
    const generated = planning.generateVNextSession({
      createdAt: AS_OF,
      bundle: current,
      intent,
      state,
      projectionPolicy,
      sessionDemand: "challenge",
      seed: `p10-boundary-${index + 1}-${specialistOptIn ? "on" : "off"}`,
    }, generatorPolicy);
    assert(!generated.plan?.items.some((item) => item.targetMilestone
      && milestoneKey(item.targetMilestone) === milestoneKey(target)),
    `${milestoneKey(target)} became reachable with specialist opt-in=${specialistOptIn}`);
    assert(generated.coverageGaps.some((gap) => gap.kind === "missing-content"
      && gap.targetMilestone && milestoneKey(gap.targetMilestone) === milestoneKey(target)),
    `${milestoneKey(target)} did not report its missing-content release boundary`);
    boundaryCases += 1;
  }
}

if (failures.length) {
  console.error(`vNext Phase 10 domain validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("vNext Phase 10 domain validation passed");
  console.log(
    `Definitions: 7 graphs/103 nodes (73 reachable, 30 gated), 7 capacities/21 facets, `
      + `225 exercises, 94 protocols; boundaries ${JSON.stringify(boundaryCounts)}.`,
  );
  console.log(
    `Matrices: ${prerequisiteTruthCases} allOf/anyOf truth cases, ${protocolCases} protocol cases, `
      + `${freshnessCases} freshness cases, ${compatibilityCases} catalogue compatibility cases, `
      + `${reuseCases} reuse cases, ${implicationCases} implication cases.`,
  );
  console.log(
    `Safety/planning: ${equipmentCases} missing-equipment decisions, ${restrictionDemandCases} demand restrictions, `
      + `${generatorCases} deterministic node/demand plans (${exactDurationCases} exact, ${shortDurationCases} explicit short), `
      + `${boundaryCases} missing-content boundary cases.`,
  );
}
