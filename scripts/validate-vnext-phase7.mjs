import { createHash } from "node:crypto";
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
const program = loadTypeScriptModule("app/program.ts");
const definitions = loadTypeScriptModule("app/vnext/definitions/index.ts");
const catalogue = loadTypeScriptModule("app/vnext/definitions/catalogue.ts");
const capacities = loadTypeScriptModule("app/vnext/definitions/capacities.ts");
const missing = loadTypeScriptModule("app/vnext/definitions/missingBridges.ts");
const media = loadTypeScriptModule("app/vnext/definitions/phase7Media.ts");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts");
const legacyMigration = loadTypeScriptModule("app/vnext/persistence/legacyMigration.ts");

const v1 = definitions.vNextDefinitionBundleV1;
const current = definitions.vNextDefinitionBundle;
const definitionHistory = definitions.vNextDefinitionBundles;
const projectionPolicyV1 = projection.vNextProjectionPolicyV1;
const projectionPolicy = projection.vNextProjectionPolicy;
const generatorPolicy = planning.vNextGeneratorPolicy;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

if (![v1?.exercises, v1?.graphs, v1?.capacities, v1?.benchmarkProtocols,
  current?.exercises, current?.graphs, current?.capacities, current?.benchmarkProtocols]
  .every(Array.isArray)) {
  console.error("vNext Phase 7 checks failed: definition history/current exports are incomplete");
  process.exit(1);
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const setEqual = (left, right) => left.size === right.size
  && [...left].every((item) => right.has(item));
const sorted = (values) => [...values].sort((left, right) => String(left).localeCompare(String(right)));
const milestoneKey = (graphId, nodeId) => `${graphId}:${nodeId}`;
const subjectKey = (subject) => subject.kind === "milestone"
  ? `milestone:${subject.milestone.graphId}:${subject.milestone.nodeId}`
  : `capacity:${subject.capacity.capacityId}:${subject.capacity.facetId}`;
const denseLowDemand = () => Object.fromEntries(
  contracts.DEMAND_DOMAINS.map((domain) => [domain, "low"]),
);
const demandRank = { low: 0, moderate: 1, high: 2 };
const allowedPhase7Equipment = new Set(["floor", "parallettes", "wall"]);

const EXPECTED_DELIVERIES = [
  ["planche", "stable-tuck-planche", "parallette-tuck-planche-hold"],
  ["planche", "advanced-tuck-planche", "advanced-tuck-planche-hold"],
  ["planche", "assisted-one-leg-planche", "assisted-one-leg-planche-hold"],
  ["planche", "assisted-straddle-planche", "assisted-straddle-planche-hold"],
  ["l-sit-v-sit", "stable-straddle-l-sit", "straddle-l-sit-hold"],
  ["l-sit-v-sit", "high-l-sit", "high-l-sit-hold"],
  ["l-sit-v-sit", "assisted-v-sit", "assisted-v-sit-hold"],
  ["l-sit-v-sit", "partial-v-sit", "partial-v-sit-hold"],
  ["handstand-balance", "repeatable-floor-balance", "floor-balance-repeatable-variant"],
  ["handstand-balance", "repeatable-parallette-balance", "parallette-balance-repeatable-variant"],
  ["handstand-balance", "freestanding-parallette-tuck-shape-change", "freestanding-parallette-tuck-shape-change"],
  ["vertical-push-hspu", "elevated-deep-pike-push-up", "elevated-parallette-pike-push-up"],
  ["vertical-push-hspu", "wall-hspu-bottom-position-exit", "wall-hspu-bottom-position-exit"],
  ["vertical-push-hspu", "wall-hspu-eccentric", "wall-hspu-eccentric"],
  ["vertical-push-hspu", "assisted-wall-hspu-concentric", "assisted-wall-hspu-concentric"],
  ["vertical-push-hspu", "partial-wall-hspu", "partial-wall-hspu"],
  ["vertical-push-hspu", "full-wall-hspu", "parallette-wall-hspu"],
  ["vertical-push-hspu", "deficit-wall-hspu-bottom-position-exit", "deficit-wall-hspu-bottom-position-exit"],
  ["vertical-push-hspu", "deficit-wall-hspu", "deficit-wall-hspu"],
  ["press-to-handstand", "feet-assisted-tuck-press-load", "feet-assisted-tuck-press-load"],
  ["press-to-handstand", "assisted-bent-arm-tuck-press", "assisted-bent-arm-tuck-press"],
  ["press-to-handstand", "assisted-straddle-press", "assisted-straddle-press-to-handstand"],
  ["press-to-handstand", "straddle-press-negative", "straddle-press-negative"],
  ["press-to-handstand", "assisted-pike-press", "assisted-pike-press-to-handstand"],
  ["press-to-handstand", "pike-press-negative", "pike-press-negative"],
  ["parallette-pushing", "deep-deficit-parallette-push-up", "deficit-parallette-push-up"],
  ["transitions", "l-sit-to-tuck-planche", "l-sit-to-tuck-planche-transition"],
  ["transitions", "tuck-planche-to-l-sit", "tuck-planche-to-l-sit-transition"],
  ["transitions", "wall-handstand-to-straddle-stand-lower", "wall-handstand-to-straddle-stand-lower"],
  ["transitions", "feet-assisted-straddle-press-to-wall-handstand", "feet-assisted-straddle-press-to-wall-handstand"],
];
const expectedDeliveryByNode = new Map(EXPECTED_DELIVERIES.map(([graphId, nodeId, exerciseId]) => [
  milestoneKey(graphId, nodeId), exerciseId,
]));
const expectedNewIds = new Set(EXPECTED_DELIVERIES.map(([, , exerciseId]) => exerciseId));
const canonicalDeliveryRecords = definitions.phase7DeliveryRecords;
const canonicalDeliveryByNode = new Map(canonicalDeliveryRecords.map((record) => [
  milestoneKey(record.graphId, record.nodeId), record,
]));

// 1. Versioned definition history and complete runtime references.
assert(v1?.catalogueVersion === definitions.VNEXT_PHASE2_CATALOGUE_VERSION,
  "Definition history lost catalogue v1");
assert(current?.catalogueVersion === definitions.VNEXT_CATALOGUE_VERSION
  && current.catalogueVersion === 2, "Current definition bundle is not catalogue v2");
assert(projectionPolicyV1?.version === projection.VNEXT_PHASE3_PROJECTION_VERSION
  && projectionPolicy?.version === projection.VNEXT_PROJECTION_VERSION
  && projectionPolicy.version === 2,
"Projection policy history must remain ordered conceptually as v1 then current v2");

const phase2SourceFingerprint = createHash("sha256")
  .update(JSON.stringify(program.exerciseList))
  .digest("hex");
assert(phase2SourceFingerprint
  === definitions.VNEXT_SOURCE_CATALOGUE_FINGERPRINTS[definitions.VNEXT_PHASE2_CATALOGUE_VERSION],
"The immutable v1.2 source catalogue changed underneath catalogue v1");
const phase2SemanticPayload = {
  definitionBundle: v1,
  selectionOnlyCapacityFacets: capacities.selectionOnlyCapacityFacets,
  catalogueIdentityPolicy: catalogue.catalogueIdentityPolicy,
  missingProgressionBridges: missing.missingProgressionBridges,
};
const phase2SemanticFingerprint = createHash("sha256")
  .update(JSON.stringify(canonicalize(phase2SemanticPayload)))
  .digest("hex");
assert(phase2SemanticFingerprint
  === definitions.VNEXT_PHASE2_SEMANTIC_FINGERPRINTS[definitions.VNEXT_PHASE2_CATALOGUE_VERSION],
`Catalogue-v1 history changed; computed Phase 2 semantic SHA-256 ${phase2SemanticFingerprint}`);
assert(definitionHistory?.length === 2
  && definitionHistory[0] === v1
  && definitionHistory[1] === current,
"Definition history must be ordered v1 then v2");
const bundleValidation = validation.validateDefinitionBundle(current);
assert(bundleValidation.valid, `Current v2 bundle is invalid: ${bundleValidation.issues
  .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`).join("; ")}`);
assert(v1.exercises.length === 195 && current.exercises.length === 225,
  `Expected 195→225 exercises; found ${v1.exercises.length}→${current.exercises.length}`);
assert(v1.benchmarkProtocols.length === 64 && current.benchmarkProtocols.length === 94,
  `Expected 64→94 protocols; found ${v1.benchmarkProtocols.length}→${current.benchmarkProtocols.length}`);
assert(current.graphs.length === 7 && current.capacities.length === 7,
  "Current bundle changed the seven-graph/seven-capacity architecture");

const v1ExerciseById = new Map(v1.exercises.map((exercise) => [exercise.id, exercise]));
const currentExerciseById = new Map(current.exercises.map((exercise) => [exercise.id, exercise]));
const newExerciseIds = new Set(current.exercises
  .filter((exercise) => !v1ExerciseById.has(exercise.id))
  .map((exercise) => exercise.id));
assert(setEqual(newExerciseIds, expectedNewIds), `Unexpected Phase 7 exercise IDs: missing=${sorted(
  [...expectedNewIds].filter((id) => !newExerciseIds.has(id)),
).join(",")} extra=${sorted([...newExerciseIds].filter((id) => !expectedNewIds.has(id))).join(",")}`);

// Existing v1.2-backed exercise definitions and catalogue roles are immutable.
for (const exercise of v1.exercises) {
  const currentExercise = currentExerciseById.get(exercise.id);
  assert(Boolean(currentExercise), `Current catalogue dropped historical exercise ${exercise.id}`);
  assert(canonicalJson(currentExercise) === canonicalJson(exercise),
    `Phase 7 modified historical exercise metadata or classification for ${exercise.id}`);
}
assert(current.capacities.every((capacity) => v1.capacities.some((candidate) =>
  candidate.id === capacity.id && canonicalJson(candidate) === canonicalJson(capacity))),
"Phase 7 changed a retained capacity definition");
for (const protocol of v1.benchmarkProtocols) {
  assert(current.benchmarkProtocols.some((candidate) => candidate.id === protocol.id
    && canonicalJson(candidate) === canonicalJson(protocol)),
  `Phase 7 changed historical benchmark protocol ${protocol.id}`);
}

// 2. Exact node ↔ exercise ↔ protocol delivery authority.
const currentGraphById = new Map(current.graphs.map((graph) => [graph.id, graph]));
const v1GraphById = new Map(v1.graphs.map((graph) => [graph.id, graph]));
const currentProtocolById = new Map(current.benchmarkProtocols.map((protocol) => [protocol.id, protocol]));
const deliveredRegistry = [];
for (const [graphId, nodeId, expectedExerciseId] of EXPECTED_DELIVERIES) {
  const graph = currentGraphById.get(graphId);
  const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
  const oldNode = v1GraphById.get(graphId)?.nodes.find((candidate) => candidate.id === nodeId);
  assert(oldNode?.implementationStatus === "missing-content",
    `Delivered node ${graphId}:${nodeId} was not a catalogue-v1 gap`);
  assert(node?.implementationStatus === "available" && node.programmingBoundary === "automatic",
    `Delivered node ${graphId}:${nodeId} is not an available automatic node`);
  assert(node?.benchmarkProtocolIds.length === 1,
    `Delivered node ${graphId}:${nodeId} must own exactly one protocol`);
  const protocol = node?.benchmarkProtocolIds.length === 1
    ? currentProtocolById.get(node.benchmarkProtocolIds[0]) : undefined;
  assert(protocol?.subject.kind === "milestone"
    && protocol.subject.milestone.graphId === graphId
    && protocol.subject.milestone.nodeId === nodeId,
  `Protocol subject does not match delivered node ${graphId}:${nodeId}`);
  assert(protocol?.exerciseId === expectedExerciseId,
    `Delivered node ${graphId}:${nodeId} expected ${expectedExerciseId}; found ${protocol?.exerciseId ?? "none"}`);
  assert(protocol?.id === `${graphId}-${nodeId}`,
    `Delivered node ${graphId}:${nodeId} does not retain its canonical milestone protocol ID`);
  const exercise = currentExerciseById.get(expectedExerciseId);
  const scopedLinks = exercise?.graphLinks.filter((link) => link.nodeId !== undefined) ?? [];
  assert(scopedLinks.length === 1
    && scopedLinks[0].graphId === graphId
    && scopedLinks[0].nodeId === nodeId
    && scopedLinks[0].contribution === "milestone",
  `Exercise ${expectedExerciseId} must have one exact milestone-scoped graph link`);
  assert(exercise?.benchmarkProtocolIds.length === 1
    && exercise.benchmarkProtocolIds[0] === protocol?.id,
  `Exercise ${expectedExerciseId} does not reciprocally own its exact protocol`);
  if (protocol) deliveredRegistry.push({ graphId, nodeId, exerciseId: expectedExerciseId, protocolId: protocol.id });
}
assert(deliveredRegistry.length === 30, `Expected 30 exact deliveries; found ${deliveredRegistry.length}`);
assert(canonicalDeliveryRecords.length === 30 && canonicalDeliveryByNode.size === 30,
  "Canonical Phase 7 delivery registry is not one-to-one with the 30 delivered nodes");
for (const [graphId, nodeId, exerciseId] of EXPECTED_DELIVERIES) {
  const record = canonicalDeliveryByNode.get(milestoneKey(graphId, nodeId));
  const exercise = currentExerciseById.get(exerciseId);
  const expectedRoles = record?.contentRole === "progression-node"
    ? new Set(["outcome-milestone", "benchmark-test", "development-drill"])
    : new Set(["outcome-milestone", "benchmark-test", "technique-safety"]);
  assert(record?.exerciseId === exerciseId
    && record.benchmarkProtocolId === `${graphId}-${nodeId}`,
  `Canonical delivery registry disagrees with ${graphId}:${nodeId}:${exerciseId}`);
  assert(record?.contentRole === "progression-node"
    || record?.contentRole === "benchmark-preparation"
    || record?.contentRole === "technique-drill",
  `Delivery ${graphId}:${nodeId} has an unknown authored content role`);
  assert(setEqual(new Set(exercise?.roles ?? []), expectedRoles),
    `Exercise ${exerciseId} roles do not match its locked ${record?.contentRole ?? "missing"} classification`);
  const regressions = exercise?.relations.filter((relation) => relation.kind === "regression") ?? [];
  assert(regressions.length === 1 && regressions[0].targetExerciseId === record?.regressionExerciseId,
    `Exercise ${exerciseId} does not retain its one reviewed regression target`);
}

const availableNodes = current.graphs.flatMap((graph) => graph.nodes
  .filter((node) => node.implementationStatus === "available")
  .map((node) => milestoneKey(graph.id, node.id)));
const missingNodes = current.graphs.flatMap((graph) => graph.nodes
  .filter((node) => node.implementationStatus === "missing-content")
  .map((node) => milestoneKey(graph.id, node.id)));
assert(availableNodes.length === 73 && missingNodes.length === 30,
  `Expected 73 available/30 missing nodes; found ${availableNodes.length}/${missingNodes.length}`);
const remainingAutomatic = current.graphs.flatMap((graph) => graph.nodes
  .filter((node) => node.implementationStatus === "missing-content"
    && node.programmingBoundary === "automatic")
  .map((node) => milestoneKey(graph.id, node.id)));
assert(remainingAutomatic.length === 1 && remainingAutomatic[0] === "planche:assisted-full-planche",
  `Unexpected remaining automatic gaps: ${remainingAutomatic.join(",")}`);
for (const graph of current.graphs) {
  const oldGraph = v1GraphById.get(graph.id);
  assert(Boolean(oldGraph), `Current catalogue introduced an unapproved graph ${graph.id}`);
  assert(graph.definitionVersion === 2, `Current graph ${graph.id} is not definition version 2`);
  assert(canonicalJson(graph.branches) === canonicalJson(oldGraph?.branches),
    `Phase 7 changed graph branches for ${graph.id}`);
  for (const node of graph.nodes) {
    const oldNode = oldGraph?.nodes.find((candidate) => candidate.id === node.id);
    if (!oldNode) {
      failures.push(`Phase 7 introduced an unapproved graph node ${graph.id}:${node.id}`);
      continue;
    }
    const unchangedNode = ({ implementationStatus, benchmarkProtocolIds, ...rest }) => rest;
    assert(canonicalJson(unchangedNode(node)) === canonicalJson(unchangedNode(oldNode)),
      `Phase 7 changed approved graph semantics for ${graph.id}:${node.id}`);
    if (node.programmingBoundary === "stronger-gated" || node.programmingBoundary === "specialist") {
      assert(node.implementationStatus === oldNode.implementationStatus
        && node.implementationStatus === "missing-content"
        && node.benchmarkProtocolIds.length === 0,
      `Phase 7 changed ${node.programmingBoundary} boundary ${graph.id}:${node.id}`);
    }
  }
}

// 3. Complete DAG, executable availability and one canonical remaining-gap owner.
const nodeByKey = new Map(current.graphs.flatMap((graph) => graph.nodes.map((node) => [
  milestoneKey(graph.id, node.id), { graph, node },
])));
const milestoneRefs = (node) => [
  ...(node.prerequisiteRule?.allOf ?? []),
  ...(node.prerequisiteRule?.anyOf ?? []),
].flatMap((ref) => {
  if (ref.kind === "milestone") return [ref.milestone];
  if (ref.kind !== "benchmark") return [];
  const protocol = currentProtocolById.get(ref.benchmarkProtocolId);
  return protocol?.subject.kind === "milestone" ? [protocol.subject.milestone] : [];
});
const visiting = new Set();
const visited = new Set();
const visit = (key, trail = []) => {
  if (visiting.has(key)) {
    failures.push(`Development graph cycle: ${[...trail, key].join(" -> ")}`);
    return;
  }
  if (visited.has(key)) return;
  const entry = nodeByKey.get(key);
  if (!entry) {
    failures.push(`Unknown graph prerequisite ${key}`);
    return;
  }
  visiting.add(key);
  milestoneRefs(entry.node).forEach((ref) => visit(milestoneKey(ref.graphId, ref.nodeId), [...trail, key]));
  visiting.delete(key);
  visited.add(key);
};
for (const key of nodeByKey.keys()) visit(key);
assert(visited.size === nodeByKey.size, `Only ${visited.size}/${nodeByKey.size} graph nodes passed the DAG walk`);

const graphChildren = new Map([...nodeByKey.keys()].map((key) => [key, []]));
for (const [key, { node }] of nodeByKey) {
  for (const ref of milestoneRefs(node)) {
    graphChildren.get(milestoneKey(ref.graphId, ref.nodeId))?.push(key);
  }
}
const graphRoots = [...nodeByKey]
  .filter(([, { node }]) => milestoneRefs(node).length === 0)
  .map(([key]) => key);
const structurallyReachable = new Set();
const followChildren = (key) => {
  if (structurallyReachable.has(key)) return;
  structurallyReachable.add(key);
  graphChildren.get(key)?.forEach(followChildren);
};
graphRoots.forEach(followChildren);
assert(graphRoots.length > 0 && structurallyReachable.size === nodeByKey.size,
  `Graph roots reach only ${structurallyReachable.size}/${nodeByKey.size} nodes: ${sorted(
    [...nodeByKey.keys()].filter((key) => !structurallyReachable.has(key)),
  ).join(",")}`);
for (const record of canonicalDeliveryRecords) {
  const entry = nodeByKey.get(milestoneKey(record.graphId, record.nodeId));
  const expectedAfter = milestoneRefs(entry?.node ?? {}).map((ref) =>
    milestoneKey(ref.graphId, ref.nodeId));
  assert(setEqual(new Set(record.comesAfterMilestoneKeys), new Set(expectedAfter)),
    `Delivery ${record.graphId}:${record.nodeId} has stale comes-after metadata`);
  assert(setEqual(
    new Set(record.comesBeforeMilestoneKeys),
    new Set(graphChildren.get(milestoneKey(record.graphId, record.nodeId)) ?? []),
  ), `Delivery ${record.graphId}:${record.nodeId} has stale comes-before metadata`);
}

const executableMemo = new Map();
const executableVisiting = new Set();
const refExecutable = (ref) => {
  if (ref.kind === "capacity-facet") return true;
  if (ref.kind === "milestone") return executable(milestoneKey(ref.milestone.graphId, ref.milestone.nodeId));
  const protocol = currentProtocolById.get(ref.benchmarkProtocolId);
  if (!protocol) return false;
  return protocol.subject.kind === "capacity-facet" || executable(milestoneKey(
    protocol.subject.milestone.graphId,
    protocol.subject.milestone.nodeId,
  ));
};
const executable = (key) => {
  if (executableMemo.has(key)) return executableMemo.get(key);
  if (executableVisiting.has(key)) return false;
  const node = nodeByKey.get(key)?.node;
  if (!node || node.implementationStatus !== "available") {
    executableMemo.set(key, false);
    return false;
  }
  executableVisiting.add(key);
  const allOf = node.prerequisiteRule?.allOf ?? [];
  const anyOf = node.prerequisiteRule?.anyOf ?? [];
  const result = allOf.every(refExecutable) && (anyOf.length === 0 || anyOf.some(refExecutable));
  executableVisiting.delete(key);
  executableMemo.set(key, result);
  return result;
};
const blockedAvailable = availableNodes.filter((key) => !executable(key));
assert(blockedAvailable.length === 0,
  `Available nodes have no executable prerequisite route: ${blockedAvailable.join(",")}`);

const missingCoverage = new Map();
const remainingBridgeRegistry = [];
for (const bridge of missing.missingProgressionBridges) {
  const unresolvedNodeIds = bridge.nodeIds.filter((nodeId) =>
    nodeByKey.get(milestoneKey(bridge.graphId, nodeId))?.node.implementationStatus === "missing-content");
  for (const nodeId of unresolvedNodeIds) {
    const key = milestoneKey(bridge.graphId, nodeId);
    missingCoverage.set(key, (missingCoverage.get(key) ?? 0) + 1);
  }
  if (unresolvedNodeIds.length) remainingBridgeRegistry.push({
    id: bridge.id,
    graphId: bridge.graphId,
    nodeIds: unresolvedNodeIds,
    boundary: bridge.boundary,
    priority: bridge.priority,
    reason: bridge.reason,
    proposedContentIds: bridge.proposedContentIds,
    deliveryPhase: bridge.deliveryPhase,
  });
}
assert(missingNodes.every((key) => missingCoverage.get(key) === 1),
  `Missing nodes without exactly one gap owner: ${missingNodes.filter((key) => missingCoverage.get(key) !== 1).join(",")}`);
assert([...missingCoverage].every(([key, count]) => nodeByKey.has(key) && count === 1),
  "Remaining gap registry contains duplicate or unknown nodes");
assert(canonicalJson(definitions.remainingProgressionBridges) === canonicalJson(remainingBridgeRegistry),
  "Canonical remaining bridge registry does not exactly describe all unresolved nodes");
assert(definitions.phase7CatalogueIdentityPolicy?.sourceVersion === "vnext-catalogue-2"
  && setEqual(
    new Set(definitions.phase7CatalogueIdentityPolicy.stableIdsRetained),
    new Set(v1.exercises.map((exercise) => exercise.id)),
  )
  && setEqual(
    new Set(definitions.phase7CatalogueIdentityPolicy.addedStableIds),
    expectedNewIds,
  )
  && definitions.phase7CatalogueIdentityPolicy.aliases.length === 0
  && definitions.phase7CatalogueIdentityPolicy.tombstones.length === 0,
"Phase 7 catalogue identity policy does not preserve v1 IDs and exactly add the 30 reviewed IDs");

// 4. Authored metadata, regression safety, equipment and protocol conditions.
const demandDomains = new Set(contracts.DEMAND_DOMAINS);
const relationEdges = new Map();
for (const exerciseId of expectedNewIds) {
  const exercise = currentExerciseById.get(exerciseId);
  assert(exercise?.definitionVersion === definitions.VNEXT_BASE_DEFINITION_VERSION,
    `New exercise ${exerciseId} must start at definition version 1`);
  assert(exercise?.lifecycle === "active", `New exercise ${exerciseId} is not active`);
  assert(exercise?.roles.includes("outcome-milestone") && exercise.roles.includes("benchmark-test"),
    `New exercise ${exerciseId} lacks milestone/test role classification`);
  assert(Boolean(exercise?.instructions.how.trim()) && Boolean(exercise?.instructions.cues.length)
    && Boolean(exercise?.instructions.avoid?.length),
  `New exercise ${exerciseId} lacks execution cues or mistakes`);
  assert(Boolean(exercise?.safetyNotes.length), `New exercise ${exerciseId} has no safety notes`);
  assert(Boolean(exercise?.equipment.length), `New exercise ${exerciseId} has no equipment metadata`);
  assert(exercise?.equipment.every((id) => contracts.isStableId(id)),
    `New exercise ${exerciseId} has unstable equipment IDs`);
  assert(exercise?.equipment.every((id) => allowedPhase7Equipment.has(id)),
    `New exercise ${exerciseId} requires out-of-scope equipment: ${exercise?.equipment.join(",")}`);
  assert(Boolean(exercise?.media.length), `New exercise ${exerciseId} has no media reference`);
  assert(exercise?.prescriptionVariants.some((variant) => variant.id === `${exerciseId}-standard`),
    `New exercise ${exerciseId} lacks its stable standard prescription`);
  for (const variant of exercise?.prescriptionVariants ?? []) {
    const domains = new Set(Object.keys(variant.demand));
    assert(setEqual(domains, demandDomains),
      `Exercise ${exerciseId}:${variant.id} lacks a dense seven-domain demand audit`);
    assert(Object.values(variant.demand).some((level) => demandRank[level] >= demandRank.moderate),
      `Exercise ${exerciseId}:${variant.id} has no material authored demand`);
    const graphId = exercise.graphLinks[0]?.graphId;
    const level = (domain) => demandRank[variant.demand[domain] ?? "low"];
    const familyDemandValid = graphId === "planche"
      ? level("forward-straight-arm-upper-limb") >= demandRank.moderate
      : graphId === "l-sit-v-sit"
        ? level("compression-trunk") >= demandRank.moderate
        : graphId === "handstand-balance"
          ? level("inversion-technical") >= demandRank.moderate
            && level("overhead-straight-arm-upper-limb") >= demandRank.moderate
          : graphId === "vertical-push-hspu"
            ? level("vertical-bent-arm-push") >= demandRank.moderate
              && level("inversion-technical") >= demandRank.moderate
            : graphId === "press-to-handstand"
              ? level("compression-trunk") >= demandRank.moderate
                && level("overhead-straight-arm-upper-limb") >= demandRank.moderate
              : graphId === "parallette-pushing"
                ? level("horizontal-bent-arm-push") >= demandRank.moderate
                : graphId === "transitions"
                  ? level("compression-trunk") >= demandRank.moderate
                    && Math.max(
                      level("forward-straight-arm-upper-limb"),
                      level("overhead-straight-arm-upper-limb"),
                    ) >= demandRank.moderate
                  : false;
    assert(familyDemandValid,
      `Exercise ${exerciseId}:${variant.id} does not express the critical ${graphId ?? "unknown"} demand`);
  }
  assert(exercise?.relations.some((relation) => relation.kind === "regression"),
    `New exercise ${exerciseId} has no explicit reviewed regression`);
  relationEdges.set(exerciseId, []);
  for (const relation of exercise?.relations ?? []) {
    const target = currentExerciseById.get(relation.targetExerciseId);
    assert(Boolean(target), `Exercise ${exerciseId} relates to missing ${relation.targetExerciseId}`);
    assert(relation.targetExerciseId !== exerciseId, `Exercise ${exerciseId} has a self relation`);
    if (relation.fromPrescriptionVariantId) {
      assert(exercise.prescriptionVariants.some((variant) => variant.id === relation.fromPrescriptionVariantId),
        `Exercise ${exerciseId} relation has an unknown source prescription`);
    }
    if (relation.targetPrescriptionVariantId) {
      assert(target?.prescriptionVariants.some((variant) => variant.id === relation.targetPrescriptionVariantId),
        `Exercise ${exerciseId} relation has an unknown target prescription`);
    }
    if (relation.kind === "regression") relationEdges.get(exerciseId).push(relation.targetExerciseId);
  }
  const protocolId = exercise?.benchmarkProtocolIds[0];
  const protocol = protocolId ? currentProtocolById.get(protocolId) : undefined;
  assert(protocol?.definitionVersion === definitions.VNEXT_BASE_DEFINITION_VERSION,
    `New protocol ${protocolId ?? "unknown"} must start at definition version 1`);
  assert(protocol?.prescriptionVariantId !== undefined
    && exercise?.prescriptionVariants.some((variant) => variant.id === protocol.prescriptionVariantId),
  `New protocol ${protocolId ?? "unknown"} has no exact prescription`);
  assert(setEqual(new Set(protocol?.conditions.equipment ?? []), new Set(exercise?.equipment ?? [])),
    `Protocol ${protocolId ?? "unknown"} equipment differs from exercise ${exerciseId}`);
  assert(Boolean(protocol?.conditions.assistance.trim()) && Boolean(protocol?.conditions.range.trim())
    && Boolean(protocol?.qualityCriteria.length) && Boolean(protocol?.safetyCriteria.length),
  `Protocol ${protocolId ?? "unknown"} lacks exact conditions, quality or safety criteria`);
  assert((protocol?.confirmation.qualifyingObservations ?? 0) >= 1
    && (protocol?.confirmation.minimumDistinctSessions ?? 0) >= 1
    && (protocol?.confirmation.minimumDistinctSessions ?? Infinity)
      <= (protocol?.confirmation.qualifyingObservations ?? 0)
    && Boolean(protocol?.confirmation.allowedSources.length)
    && protocol?.confirmation.allowedSources.every((source) =>
      source === "guided-test" || source === "session-record"),
  `Protocol ${protocolId ?? "unknown"} has an impossible or unsafe confirmation policy`);
  const delivery = canonicalDeliveryByNode.get(milestoneKey(
    protocol?.subject.kind === "milestone" ? protocol.subject.milestone.graphId : "unknown",
    protocol?.subject.kind === "milestone" ? protocol.subject.milestone.nodeId : "unknown",
  ));
  if (delivery?.contentRole === "benchmark-preparation") {
    assert(protocol?.confirmation.qualifyingObservations === 1
      && protocol.confirmation.minimumDistinctSessions === 1
      && protocol.confirmation.freshnessDays === 30,
    `Safety benchmark ${protocolId ?? "unknown"} must use its reviewed 1-session/30-day policy`);
  } else {
    assert((protocol?.confirmation.qualifyingObservations ?? 0) >= 2
      && (protocol?.confirmation.minimumDistinctSessions ?? 0) >= 2,
    `Outcome/drill ${protocolId ?? "unknown"} must be confirmed across separated sessions`);
  }
  if (protocol?.metric.kind === "duration-seconds" || protocol?.metric.kind === "repetitions") {
    assert(protocol.metric.minimum > 0
      && (protocol.metric.maximum === undefined || protocol.metric.maximum >= protocol.metric.minimum),
    `Protocol ${protocolId ?? "unknown"} has an invalid numeric metric`);
  }
  if (protocol?.metric.kind === "successful-attempts") {
    assert(protocol.metric.minimumSuccessful > 0
      && protocol.metric.maximumAttempts >= protocol.metric.minimumSuccessful,
    `Protocol ${protocolId ?? "unknown"} has an invalid attempts metric`);
  }
}
const relationVisiting = new Set();
const relationVisited = new Set();
const visitRelation = (id, trail = []) => {
  if (relationVisiting.has(id)) {
    failures.push(`Exercise regression cycle: ${[...trail, id].join(" -> ")}`);
    return;
  }
  if (relationVisited.has(id) || !relationEdges.has(id)) return;
  relationVisiting.add(id);
  for (const target of relationEdges.get(id)) visitRelation(target, [...trail, id]);
  relationVisiting.delete(id);
  relationVisited.add(id);
};
for (const id of relationEdges.keys()) visitRelation(id);

// 5. Every Phase 7 media reference resolves to one complete owned-media brief.
const mediaExerciseIds = media.phase7MediaRequirements.flatMap((requirement) => requirement.exerciseIds);
assert(media.phase7MediaRequirements.length === 28,
  `Expected 28 Phase 7 media requirements; found ${media.phase7MediaRequirements.length}`);
assert(mediaExerciseIds.length === 30 && new Set(mediaExerciseIds).size === 30
  && setEqual(new Set(mediaExerciseIds), expectedNewIds),
"Media requirements do not cover each new exercise exactly once");
const existingMediaRefs = new Set(v1.exercises.flatMap((exercise) => exercise.media
  .filter((item) => item.kind === "motion").map((item) => item.reference)));
for (const requirement of media.phase7MediaRequirements) {
  assert(contracts.isStableId(requirement.id), `Media requirement has unstable ID ${requirement.id}`);
  assert(Boolean(requirement.reference.trim())
    && Boolean(requirement.movementPhases.length)
    && Boolean(requirement.cameraView.trim())
    && Boolean(requirement.technicalPoints.length)
    && Boolean(requirement.commonMistakes.length)
    && Boolean(requirement.regressionRelationship.trim())
    && Boolean(requirement.progressionRelationship.trim()),
  `Media requirement ${requirement.id} is incomplete`);
  if (requirement.status === "existing-owned") {
    assert(existingMediaRefs.has(requirement.reference),
      `Existing-owned media ${requirement.reference} does not resolve to v1 owned motion`);
  } else {
    assert(requirement.status === "new-owned-required",
      `Media requirement ${requirement.id} has unknown status ${requirement.status}`);
  }
  for (const exerciseId of requirement.exerciseIds) {
    const exercise = currentExerciseById.get(exerciseId);
    assert(exercise?.media.length === 1
      && exercise.media[0].kind === "motion"
      && exercise.media[0].reference === requirement.reference,
    `Exercise ${exerciseId} does not resolve its canonical media requirement`);
  }
}
assert(media.phase7MediaRequirements.filter((item) => item.status === "existing-owned").length === 0,
  "Phase 7 media must not reuse the mismatched v1 balance motions");
const newOwnedMedia = media.phase7MediaRequirements.filter((item) => item.status === "new-owned-required");
assert(newOwnedMedia.length === 28 && new Set(newOwnedMedia.map((item) => item.reference)).size === 28,
  "Expected exactly 28 unique new owned-animation briefs");

// 6. The v2 generator safely consumes representative unlocked content.
const representativeTargets = [
  ["planche", "stable-tuck-planche"],
  ["l-sit-v-sit", "partial-v-sit"],
  ["handstand-balance", "freestanding-parallette-tuck-shape-change"],
  ["vertical-push-hspu", "full-wall-hspu"],
  ["press-to-handstand", "feet-assisted-tuck-press-load"],
  ["parallette-pushing", "deep-deficit-parallette-push-up"],
  ["transitions", "l-sit-to-tuck-planche"],
];
const reason = projection.projectionReasonCodes;
const asOf = "2026-08-24T09:00:00.000Z";
const allEquipment = sorted(new Set(current.exercises.flatMap((exercise) => exercise.equipment)))
  .map((id) => contracts.parseStableId("equipment", id));
const prerequisiteClosure = (targetKey) => {
  const result = new Set();
  const add = (key) => {
    if (result.has(key)) return;
    result.add(key);
    const node = nodeByKey.get(key)?.node;
    for (const ref of node?.prerequisiteRule?.allOf ?? []) {
      if (ref.kind === "milestone") add(milestoneKey(ref.milestone.graphId, ref.milestone.nodeId));
    }
    for (const ref of node?.prerequisiteRule?.anyOf ?? []) {
      if (ref.kind === "milestone") add(milestoneKey(ref.milestone.graphId, ref.milestone.nodeId));
    }
  };
  const target = nodeByKey.get(targetKey)?.node;
  for (const ref of target?.prerequisiteRule?.allOf ?? []) {
    if (ref.kind === "milestone") add(milestoneKey(ref.milestone.graphId, ref.milestone.nodeId));
  }
  for (const ref of target?.prerequisiteRule?.anyOf ?? []) {
    if (ref.kind === "milestone") add(milestoneKey(ref.milestone.graphId, ref.milestone.nodeId));
  }
  return result;
};
const syntheticState = (athleteId, graphId, nodeId) => {
  const targetKey = milestoneKey(graphId, nodeId);
  const established = prerequisiteClosure(targetKey);
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    projectionVersion: projectionPolicy.version,
    asOf,
    observationCursors: {},
    nodeStates: current.graphs.flatMap((graph) => graph.nodes.map((node) => {
      const key = milestoneKey(graph.id, node.id);
      const isEstablished = established.has(key);
      return {
        milestone: { graphId: graph.id, nodeId: node.id },
        lifecycle: isEstablished ? "established" : "unknown",
        confidence: isEstablished ? "current" : "unknown",
        satisfiedForEligibilityBy: [],
        supportingObservationRefs: [],
        reasonCodes: [isEstablished ? reason.established : reason.unknown],
      };
    })),
    capacityFindings: current.capacities.flatMap((capacity) => capacity.facets.map((facet) => ({
      capacity: { capacityId: capacity.id, facetId: facet.id },
      finding: "demonstrated",
      confirmationSatisfied: true,
      confidence: "current",
      supportingObservationRefs: [],
      reasonCodes: [reason.demonstrated],
    }))),
    activeRestrictions: [],
    reconfirmationRequirements: [],
    recentLoad: {
      from: "2026-08-17T09:00:00.000Z",
      to: asOf,
      demand: denseLowDemand(),
      exposures: [],
    },
    workingNodes: [],
    maintenanceNeeds: [],
    eligibleTargets: [{
      milestone: { graphId, nodeId },
      reasonCodes: [reason.eligibleFrontier],
    }],
    trainabilityEvaluations: [],
  };
};
for (const [graphId, nodeId] of representativeTargets) {
  const athleteId = contracts.parseStableId("athlete", `phase7-generator-${graphId}`);
  const state = syntheticState(athleteId, graphId, nodeId);
  const stateResult = validation.validateDerivedAthleteState(state);
  assert(stateResult.valid, `Synthetic ${graphId}:${nodeId} state is invalid: ${stateResult.issues
    .map((issue) => `${issue.path} ${issue.code}`).join(";")}`);
  const expectedExerciseId = expectedDeliveryByNode.get(milestoneKey(graphId, nodeId));
  const targetExercise = currentExerciseById.get(expectedExerciseId);
  const intent = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: asOf,
    goals: [{
      graphId: contracts.parseStableId("graph", graphId),
      targetNodeId: contracts.parseStableId("node", nodeId),
      priority: "primary",
    }],
    equipment: targetExercise?.equipment ?? [],
    defaultSessionDemand: "standard",
    preferences: { specialistOptIn: false },
  };
  const generated = planning.generateVNextSession({
    createdAt: asOf,
    bundle: current,
    intent,
    state,
    projectionPolicy,
    sessionDemand: "standard",
    seed: `phase7-generator-${graphId}-${nodeId}`,
  }, generatorPolicy);
  assert(generated.ok && generated.plan,
    `Generator could not consume ${graphId}:${nodeId}: ${generated.issues.map((issue) => issue.message).join("; ")}`);
  assert(generated.plan?.items.some((item) => item.exerciseId === expectedExerciseId
    && item.targetMilestone?.graphId === graphId
    && item.targetMilestone?.nodeId === nodeId),
  `Generated ${graphId}:${nodeId} plan omitted exact Phase 7 exercise ${expectedExerciseId}`);
}

const straightArmPressForwardLoadExerciseIds = [
  "assisted-straddle-press-to-handstand",
  "straddle-press-negative",
  "assisted-pike-press-to-handstand",
  "pike-press-negative",
  "wall-handstand-to-straddle-stand-lower",
  "feet-assisted-straddle-press-to-wall-handstand",
];
for (const exerciseId of straightArmPressForwardLoadExerciseIds) {
  const exercise = currentExerciseById.get(exerciseId);
  const delivery = canonicalDeliveryRecords.find((record) => record.exerciseId === exerciseId);
  assert(Boolean(exercise) && Boolean(delivery),
    `Forward-load restriction fixture cannot resolve ${exerciseId}`);
  assert(exercise?.prescriptionVariants.every((variant) =>
    variant.demand["forward-straight-arm-upper-limb"] === "moderate"
      || variant.demand["forward-straight-arm-upper-limb"] === "high"),
  `Straight-arm Press movement ${exerciseId} understates forward upper-limb demand`);
  if (!exercise || !delivery) continue;

  const athleteId = contracts.parseStableId("athlete", `phase7-forward-restriction-${exerciseId}`);
  const state = {
    ...syntheticState(athleteId, delivery.graphId, delivery.nodeId),
    activeRestrictions: [{
      source: {
        kind: "evidence-event",
        eventId: contracts.parseStableId("event", `phase7-forward-restriction-${exerciseId}`),
      },
      decision: "block",
      demandDomains: ["forward-straight-arm-upper-limb"],
      bodyRegions: ["upper-limb"],
      occurredAt: "2026-08-24T08:00:00.000Z",
      reasonCodes: [reason.activeRestriction],
    }],
  };
  const stateResult = validation.validateDerivedAthleteState(state);
  assert(stateResult.valid, `Forward-load restriction state for ${exerciseId} is invalid: ${stateResult.issues
    .map((issue) => `${issue.path} ${issue.code}`).join(";")}`);
  const standardVariant = exercise.prescriptionVariants.find((variant) =>
    variant.id === `${exerciseId}-standard`);
  const intent = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: asOf,
    goals: [{
      graphId: delivery.graphId,
      targetNodeId: delivery.nodeId,
      priority: "primary",
    }],
    equipment: exercise.equipment,
    defaultSessionDemand: "standard",
    preferences: { specialistOptIn: false },
  };
  const evaluation = standardVariant ? projection.evaluateTrainability({
    request: {
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: standardVariant.id,
    },
    state,
    bundle: current,
    asOf,
    policy: projectionPolicy,
    intent,
  }) : undefined;
  assert(evaluation?.decision === "block"
    && evaluation.reasonCodes.includes(reason.activeRestriction),
  `Forward-load block restriction was bypassed by ${exerciseId}`);
  const generated = planning.generateVNextSession({
    createdAt: asOf,
    bundle: current,
    intent,
    state,
    projectionPolicy,
    sessionDemand: "standard",
    seed: `phase7-forward-restriction-${exerciseId}`,
  }, generatorPolicy);
  assert(!generated.plan?.items.some((item) => item.exerciseId === exerciseId),
    `Generator prescribed forward-loaded ${exerciseId} through an active block restriction`);
}

const measurementForMetric = (metric) => metric.kind === "duration-seconds"
  ? { value: metric.minimum, unit: "seconds" }
  : metric.kind === "repetitions"
    ? { value: metric.minimum, unit: "repetitions" }
    : metric.kind === "successful-attempts"
      ? { value: metric.minimumSuccessful, unit: "attempts", attemptsTotal: metric.maximumAttempts }
      : undefined;
const qualifyingEvents = (protocol, athleteId, catalogueVersion, prefix, firstDay) => {
  const count = Math.max(
    protocol.confirmation.qualifyingObservations,
    protocol.confirmation.minimumDistinctSessions,
  );
  return Array.from({ length: count }, (_, index) => {
    const occurredAt = `2026-08-${String(firstDay + index).padStart(2, "0")}T09:00:00.000Z`;
    const measurement = measurementForMetric(protocol.metric);
    return {
      schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
      id: contracts.parseStableId("event", `${prefix}-${index + 1}`),
      athleteId,
      occurredAt,
      recordedAt: occurredAt,
      source: "guided-test",
      catalogueVersion,
      type: "performance_observed",
      subject: protocol.subject,
      outcome: "clean",
      benchmarkProtocolId: protocol.id,
      benchmarkProtocolVersion: protocol.definitionVersion,
      observationSessionId: contracts.parseStableId(
        "observation-session",
        `${prefix}-session-${index + 1}`,
      ),
      ...(measurement ? { measurement } : {}),
      assistance: protocol.conditions.assistance,
      range: protocol.conditions.range,
    };
  });
};

// 7. Catalogue-v1 findings replay into v2 without awarding new subjects.
const replayProtocol = v1.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "milestone" && protocol.confirmation.minimumDistinctSessions >= 1);
if (!replayProtocol || replayProtocol.subject.kind !== "milestone") {
  failures.push("Could not locate a v1 milestone protocol for replay");
} else {
  const athleteId = contracts.parseStableId("athlete", "phase7-v1-replay");
  const events = qualifyingEvents(replayProtocol, athleteId, v1.catalogueVersion, "phase7-v1-replay", 10);
  const intent = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: asOf,
    goals: [],
    equipment: allEquipment,
    defaultSessionDemand: "standard",
    preferences: { specialistOptIn: false },
  };
  const project = (bundles, policy) => projection.projectAthleteState({
    athleteId,
    asOf,
    policy,
    definitionBundles: bundles,
    evidenceEvents: events,
    sessionPlans: [],
    sessionRecords: [],
    intent,
    trainabilityRequests: [],
  });
  const oldProjection = project([v1], projectionPolicyV1);
  const replayedProjection = project(definitionHistory, projectionPolicy);
  assert(oldProjection.ok && replayedProjection.ok,
    `v1→v2 replay failed: ${[...oldProjection.issues, ...replayedProjection.issues]
      .map((issue) => issue.message).join("; ")}`);
  const key = milestoneKey(
    replayProtocol.subject.milestone.graphId,
    replayProtocol.subject.milestone.nodeId,
  );
  const stateFor = (result) => result.state?.nodeStates.find((state) =>
    milestoneKey(state.milestone.graphId, state.milestone.nodeId) === key);
  const oldState = stateFor(oldProjection);
  const replayedState = stateFor(replayedProjection);
  assert(oldState?.lifecycle === replayedState?.lifecycle
    && oldState?.confidence === replayedState?.confidence
    && canonicalJson(oldState?.supportingObservationRefs)
      === canonicalJson(replayedState?.supportingObservationRefs)
    && replayedState?.lifecycle === "established",
  `v1 finding ${key} did not retain established/current state in v2`);
  assert(EXPECTED_DELIVERIES.every(([graphId, nodeId]) => {
    const state = replayedProjection.state?.nodeStates.find((candidate) =>
      candidate.milestone.graphId === graphId && candidate.milestone.nodeId === nodeId);
    return state?.lifecycle === "unknown";
  }), "Catalogue-v1 evidence directly awarded a newly delivered Phase 7 subject");

  const baseSubjectKeys = new Set(v1.benchmarkProtocols.map((protocol) => subjectKey(protocol.subject)));
  const compatibilityKeys = new Set(projectionPolicy.subjectVersionCompatibilityRules.map((rule) => {
    assert(rule.fromCatalogueVersion === v1.catalogueVersion
      && rule.toCatalogueVersion === current.catalogueVersion,
    `Compatibility rule ${subjectKey(rule.subject)} has the wrong catalogue direction`);
    return subjectKey(rule.subject);
  }));
  assert(setEqual(baseSubjectKeys, compatibilityKeys),
    "Current projection policy does not map exactly the unchanged v1 subjects");
  assert(projectionPolicy.subjectVersionCompatibilityRules.length === baseSubjectKeys.size,
    "Current projection policy duplicates catalogue-v1 subject compatibility rules");
  const newSubjectKeys = new Set(current.benchmarkProtocols
    .filter((protocol) => !v1.benchmarkProtocols.some((candidate) => candidate.id === protocol.id))
    .map((protocol) => subjectKey(protocol.subject)));
  assert([...newSubjectKeys].every((key) => !compatibilityKeys.has(key)),
    "Phase 7 subjects received synthetic catalogue-v1 compatibility");
}

// One genuine v1 evidence projection must expose, and safely compose, a new v2 frontier.
const frontierSourceProtocol = v1.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "milestone"
  && protocol.subject.milestone.graphId === "planche"
  && protocol.subject.milestone.nodeId === "brief-floor-tuck-planche");
if (!frontierSourceProtocol) {
  failures.push("Could not locate the v1 brief-floor-tuck protocol for the real v2 frontier scenario");
} else {
  const athleteId = contracts.parseStableId("athlete", "phase7-real-frontier");
  const targetExercise = currentExerciseById.get("parallette-tuck-planche-hold");
  const intent = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: asOf,
    goals: [{ graphId: "planche", targetNodeId: "stable-tuck-planche", priority: "primary" }],
    equipment: targetExercise?.equipment ?? [],
    defaultSessionDemand: "standard",
    preferences: { specialistOptIn: false },
  };
  const projected = projection.projectAthleteState({
    athleteId,
    asOf,
    policy: projectionPolicy,
    definitionBundles: definitionHistory,
    evidenceEvents: qualifyingEvents(
      frontierSourceProtocol,
      athleteId,
      v1.catalogueVersion,
      "phase7-real-frontier",
      20,
    ),
    sessionPlans: [],
    sessionRecords: [],
    intent,
    trainabilityRequests: [],
  });
  assert(projected.ok && projected.state,
    `Real v1→v2 frontier projection failed: ${projected.issues.map((issue) => issue.message).join("; ")}`);
  assert(projected.state?.eligibleTargets.some((target) =>
    target.milestone.graphId === "planche" && target.milestone.nodeId === "stable-tuck-planche"),
  "Confirmed v1 brief tuck evidence did not derive the new stable-tuck v2 frontier");
  if (projected.state) {
    const generated = planning.generateVNextSession({
      createdAt: asOf,
      bundle: current,
      intent,
      state: projected.state,
      projectionPolicy,
      sessionDemand: "standard",
      seed: "phase7-real-frontier",
    }, generatorPolicy);
    assert(generated.ok && generated.plan?.items.some((item) =>
      item.exerciseId === "parallette-tuck-planche-hold"
      && item.targetMilestone?.graphId === "planche"
      && item.targetMilestone?.nodeId === "stable-tuck-planche"),
    `Real projected v2 frontier was not safely consumed: ${generated.issues
      .map((issue) => issue.message).join("; ")}`);
  }
}

// 8. Legacy conversion remains byte-stable and permanently emits catalogue-v1 facts.
const legacyProfile = {
  profileId: "phase7-legacy-byte-stability",
  username: "Phase Seven Legacy Athlete",
  schemaVersion: 1,
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  nextProgramDay: 1,
  history: [{
    id: "phase7-legacy-session",
    completedAt: "2026-01-20T09:00:00.000Z",
    day: 1,
    mode: "normal",
    status: "complete",
    seconds: 300,
    exerciseIds: ["floor-push-up"],
    completedExerciseIds: ["floor-push-up"],
    exerciseReviews: { "floor-push-up": { feedback: "easy", achieved: true } },
  }],
  readiness: {},
  readinessUpdatedAt: {},
  progression: {},
  equipment: ["floor", "parallettes", "wall"],
  preferences: {},
};
const capturedAt = "2026-02-02T00:00:00.000Z";
const conversionDefault = await legacyMigration.convertLegacyV12Profile(legacyProfile, capturedAt);
const conversionExplicitV1 = await legacyMigration.convertLegacyV12Profile(legacyProfile, capturedAt, v1);
const legacyFixtureSha = createHash("sha256")
  .update(JSON.stringify(conversionExplicitV1))
  .digest("hex");
assert(legacyFixtureSha === "f12c97eb3da102b66c95f536ba629883ed971282e6d47aa8968bb3919cabd3ad",
  `Legacy catalogue-v1 conversion fixture changed; computed SHA-256 ${legacyFixtureSha}`);
assert(JSON.stringify(conversionDefault) === JSON.stringify(conversionExplicitV1),
  "Legacy converter default changed its immutable catalogue-v1 payload");
assert(conversionDefault.sessionPlans.length === 1 && conversionDefault.sessionRecords.length === 1,
  "Legacy converter stability fixture did not emit its one expected immutable plan/record pair");
assert(conversionDefault.evidenceEvents.every((event) => event.catalogueVersion === v1.catalogueVersion)
  && conversionDefault.sessionPlans.every((plan) => plan.catalogueVersion === v1.catalogueVersion),
"Legacy converter emitted current catalogue-v2 facts instead of stable v1 facts");

// 9. Catalogue v2 is immutable once its complete Phase 7 semantics are frozen.
const semanticPayload = {
  definitionBundle: current,
  selectionOnlyCapacityFacets: capacities.selectionOnlyCapacityFacets,
  catalogueIdentityPolicy: catalogue.catalogueIdentityPolicy,
  phase7Identity: definitions.phase7CatalogueIdentityPolicy,
  deliveredProgressionBridges: canonicalDeliveryRecords,
  remainingProgressionBridges: definitions.remainingProgressionBridges,
  mediaRequirements: media.phase7MediaRequirements,
};
const semanticFingerprint = createHash("sha256")
  .update(JSON.stringify(canonicalize(semanticPayload)))
  .digest("hex");
assert(definitions.VNEXT_PHASE7_SEMANTIC_FINGERPRINTS[current.catalogueVersion]
  === semanticFingerprint,
`Phase 7 semantic fingerprint drifted; computed ${semanticFingerprint}`);

if (failures.length > 0) {
  console.error(`vNext Phase 7 checks failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error(`Phase 7 semantic SHA-256: ${semanticFingerprint}`);
  process.exit(1);
}

console.log(
  `vNext Phase 7 validation passed: ${current.exercises.length} exercises, `
  + `${current.benchmarkProtocols.length} protocols, ${availableNodes.length} available/`
  + `${missingNodes.length} intentionally gated nodes.`,
);
console.log(
  `Content: ${expectedNewIds.size} exact node-scoped additions; media: `
  + `${media.phase7MediaRequirements.length} briefs `
  + `(${media.phase7MediaRequirements.filter((item) => item.status === "existing-owned").length} existing, `
  + `${media.phase7MediaRequirements.filter((item) => item.status === "new-owned-required").length} new required).`,
);
console.log(`Phase 7 semantic SHA-256: ${semanticFingerprint}`);
