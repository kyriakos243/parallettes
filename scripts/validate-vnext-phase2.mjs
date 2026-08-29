import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const loadTypeScriptModule = (relativePath, dependencies = {}, replacements = []) => {
  let source = readFileSync(join(projectRoot, relativePath), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unexpected runtime import ${specifier} in ${relativePath}`);
  };
  new Function("exports", "module", "require", compiled)(loaded.exports, loaded, localRequire);
  return loaded.exports;
};

const contracts = loadTypeScriptModule("app/vnext/contracts.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts", {
  "./contracts": contracts,
});
const program = loadTypeScriptModule("app/program.ts", {}, [
  ["import.meta.env.BASE_URL", '"/parallettes/"'],
]);
const ids = loadTypeScriptModule("app/vnext/definitions/ids.ts", {
  "../contracts": contracts,
});
const graphs = loadTypeScriptModule("app/vnext/definitions/graphs.ts", {
  "../contracts": contracts,
  "./ids": ids,
});
const capacities = loadTypeScriptModule("app/vnext/definitions/capacities.ts", {
  "../contracts": contracts,
  "./ids": ids,
});
const benchmarks = loadTypeScriptModule("app/vnext/definitions/benchmarks.ts", {
  "../../program": program,
  "../contracts": contracts,
  "./ids": ids,
});
const catalogue = loadTypeScriptModule("app/vnext/definitions/catalogue.ts", {
  "../../program": program,
  "../contracts": contracts,
  "./benchmarks": benchmarks,
  "./ids": ids,
});
const missing = loadTypeScriptModule("app/vnext/definitions/missingBridges.ts", {
  "./ids": ids,
});

const bundle = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  catalogueVersion: ids.VNEXT_PHASE2_CATALOGUE_VERSION,
  exercises: catalogue.exerciseDefinitions,
  graphs: graphs.developmentGraphs,
  capacities: capacities.capacityDefinitions,
  benchmarkProtocols: benchmarks.benchmarkProtocols,
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
};

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const bundleResult = validation.validateDefinitionBundle(bundle);
if (!bundleResult.valid) {
  failures.push(...bundleResult.issues.map((issue) =>
    `Definition bundle ${issue.path} [${issue.code}] ${issue.message}`));
}

const legacyIds = new Set(program.exerciseList.map((exercise) => exercise.id));
const vNextIds = new Set(bundle.exercises.map((exercise) => exercise.id));
const legacyCatalogueFingerprint = createHash("sha256")
  .update(JSON.stringify(program.exerciseList))
  .digest("hex");
assert(
  legacyCatalogueFingerprint === ids.VNEXT_SOURCE_CATALOGUE_FINGERPRINTS[ids.VNEXT_PHASE2_CATALOGUE_VERSION],
  "The v1.2 source catalogue changed; create and review a new vNext catalogue version instead of rewriting the current fingerprint",
);
const phase2SemanticPayload = {
  definitionBundle: bundle,
  selectionOnlyCapacityFacets: capacities.selectionOnlyCapacityFacets,
  catalogueIdentityPolicy: catalogue.catalogueIdentityPolicy,
  missingProgressionBridges: missing.missingProgressionBridges,
};
const phase2SemanticFingerprint = createHash("sha256")
  .update(JSON.stringify(canonicalize(phase2SemanticPayload)))
  .digest("hex");
assert(
  phase2SemanticFingerprint === ids.VNEXT_PHASE2_SEMANTIC_FINGERPRINTS[ids.VNEXT_PHASE2_CATALOGUE_VERSION],
  `Phase 2 definition semantics changed without a new catalogue version; computed ${phase2SemanticFingerprint}`,
);
assert(program.exerciseList.length === 195, `Expected 195 baseline exercises; found ${program.exerciseList.length}`);
assert(vNextIds.size === legacyIds.size, `Expected ${legacyIds.size} vNext exercise IDs; found ${vNextIds.size}`);
assert([...legacyIds].every((id) => vNextIds.has(id)), "vNext catalogue dropped a v1.2 exercise ID");
assert([...vNextIds].every((id) => legacyIds.has(id)), "Phase 2 added exercise content reserved for Phase 7");
assert(program.skillProgressionPaths.length === 15, `Expected 15 legacy compatibility paths; found ${program.skillProgressionPaths.length}`);

assert(bundle.graphs.length === 7, `Expected seven development graphs; found ${bundle.graphs.length}`);
assert(bundle.capacities.length === 7, `Expected seven retained capacities; found ${bundle.capacities.length}`);
assert(new Set(bundle.graphs.map((graph) => graph.id)).size === 7, "Development graph IDs must be unique");
assert(new Set(bundle.capacities.map((capacity) => capacity.id)).size === 7, "Capacity IDs must be unique");

const graphById = new Map(bundle.graphs.map((graph) => [graph.id, graph]));
const nodeByKey = new Map();
for (const graph of bundle.graphs) {
  assert(graph.branches.length > 0, `Graph ${graph.id} has no explicit branches`);
  const branchIds = new Set(graph.branches.map((branch) => branch.id));
  for (const node of graph.nodes) {
    const key = `${graph.id}:${node.id}`;
    assert(!nodeByKey.has(key), `Duplicate graph/node key ${key}`);
    assert(branchIds.has(node.branchId), `Node ${key} references unknown branch ${node.branchId}`);
    nodeByKey.set(key, { graph, node });
  }
}

const milestoneRefs = (node) => [
  ...(node.prerequisiteRule?.allOf ?? []),
  ...(node.prerequisiteRule?.anyOf ?? []),
].filter((ref) => ref.kind === "milestone")
  .map((ref) => `${ref.milestone.graphId}:${ref.milestone.nodeId}`);

// Complete graph DAG: all authored destinations must be reachable from at
// least one root, even when their exercise content is intentionally missing.
const visiting = new Set();
const visited = new Set();
const visit = (key, trail = []) => {
  if (visiting.has(key)) {
    failures.push(`Development graph cycle: ${[...trail, key].join(" -> ")}`);
    return;
  }
  if (visited.has(key)) return;
  visiting.add(key);
  const entry = nodeByKey.get(key);
  if (!entry) failures.push(`Unknown DAG node ${key}`);
  else milestoneRefs(entry.node).forEach((prerequisite) => visit(prerequisite, [...trail, key]));
  visiting.delete(key);
  visited.add(key);
};
for (const key of nodeByKey.keys()) visit(key);

const successors = new Map([...nodeByKey.keys()].map((key) => [key, []]));
const rootKeys = [];
for (const [key, { node }] of nodeByKey) {
  const prerequisites = milestoneRefs(node);
  if (prerequisites.length === 0) rootKeys.push(key);
  prerequisites.forEach((prerequisite) => successors.get(prerequisite)?.push(key));
}
const reachable = new Set(rootKeys);
const queue = [...rootKeys];
while (queue.length > 0) {
  const key = queue.shift();
  for (const successor of successors.get(key) ?? []) {
    if (reachable.has(successor)) continue;
    reachable.add(successor);
    queue.push(successor);
  }
}
assert(reachable.size === nodeByKey.size,
  `Unreachable graph nodes: ${[...nodeByKey.keys()].filter((key) => !reachable.has(key)).join(", ")}`);

const protocolById = new Map(bundle.benchmarkProtocols.map((protocol) => [protocol.id, protocol]));
for (const [key, { node }] of nodeByKey) {
  if (node.implementationStatus === "available") {
    assert(node.benchmarkProtocolIds.length === 1, `Available node ${key} must have exactly one protocol`);
  } else {
    assert(node.benchmarkProtocolIds.length === 0, `Missing node ${key} must not claim a protocol`);
  }
  for (const id of node.benchmarkProtocolIds) assert(protocolById.has(id), `Node ${key} has unknown protocol ${id}`);
}
for (const capacity of bundle.capacities) {
  assert(capacity.sharedGraphIds.length >= 2, `Capacity ${capacity.id} does not affect at least two graphs`);
  const prerequisiteGraphs = new Set();
  for (const graph of bundle.graphs) {
    for (const node of graph.nodes) {
      const refs = [...(node.prerequisiteRule?.allOf ?? []), ...(node.prerequisiteRule?.anyOf ?? [])];
      if (refs.some((ref) => ref.kind === "capacity-facet" && ref.capacity.capacityId === capacity.id)) {
        prerequisiteGraphs.add(graph.id);
      }
    }
  }
  assert(prerequisiteGraphs.size >= 2,
    `Capacity ${capacity.id} is declared shared but changes prerequisites in fewer than two graphs`);
  for (const facet of capacity.facets) {
    assert(facet.benchmarkProtocolIds.length === 1,
      `Capacity facet ${capacity.id}:${facet.id} must have exactly one protocol`);
    const usedAsPrerequisite = bundle.graphs.some((graph) => graph.nodes.some((node) => [
      ...(node.prerequisiteRule?.allOf ?? []),
      ...(node.prerequisiteRule?.anyOf ?? []),
    ].some((ref) => ref.kind === "capacity-facet"
      && ref.capacity.capacityId === capacity.id
      && ref.capacity.facetId === facet.id)));
    const selectionPolicy = capacities.selectionOnlyCapacityFacets.find((entry) =>
      entry.capacityId === capacity.id && entry.facetId === facet.id);
    assert(usedAsPrerequisite || Boolean(selectionPolicy?.reason),
      `Capacity facet ${capacity.id}:${facet.id} changes neither eligibility nor documented selection`);
  }
}
for (const protocol of bundle.benchmarkProtocols) {
  assert(protocol.qualityCriteria.length > 0, `Protocol ${protocol.id} has no quality criteria`);
  assert(protocol.safetyCriteria.length > 0, `Protocol ${protocol.id} has no safety criteria`);
  assert(protocol.conditions.equipment.length > 0, `Protocol ${protocol.id} has no exact equipment condition`);
  assert(Boolean(protocol.conditions.assistance.trim()), `Protocol ${protocol.id} has no assistance condition`);
  assert(Boolean(protocol.conditions.range.trim()), `Protocol ${protocol.id} has no range condition`);
  assert(protocol.confirmation.allowedSources.every((source) => source === "guided-test" || source === "session-record"),
    `Protocol ${protocol.id} permits provisional evidence as confirmation`);
  const exercise = catalogue.exerciseDefinitionById.get(protocol.exerciseId);
  assert(protocol.conditions.equipment.length === exercise?.equipment.length
    && protocol.conditions.equipment.every((equipmentId) => exercise.equipment.includes(equipmentId)),
    `Protocol ${protocol.id} equipment does not exactly match exercise ${protocol.exerciseId}`);
  if (protocol.subject.kind === "capacity-facet") {
    assert(exercise?.capacityLinks.some((link) =>
      link.capacityId === protocol.subject.capacity.capacityId
      && link.facetIds.includes(protocol.subject.capacity.facetId)),
    `Capacity benchmark exercise ${protocol.exerciseId} lacks its ${protocol.subject.capacity.capacityId}:${protocol.subject.capacity.facetId} link`);
  }
}
const milestoneProtocols = bundle.benchmarkProtocols.filter((protocol) => protocol.subject.kind === "milestone");
const confirmationSignatures = new Set(milestoneProtocols.map((protocol) => [
  protocol.confirmation.qualifyingObservations,
  protocol.confirmation.minimumDistinctSessions,
  protocol.confirmation.freshnessDays ?? "none",
].join("/")));
assert(confirmationSignatures.size >= 3, "Milestone confirmation policies are still monolithic");
assert(milestoneProtocols.some((protocol) => protocol.confirmation.qualifyingObservations === 1
  && protocol.confirmation.minimumDistinctSessions === 1), "No milestone can confirm within one guided-test session");
assert(milestoneProtocols.some((protocol) => protocol.confirmation.minimumDistinctSessions >= 2),
  "No milestone requires separated-session confirmation");
assert(milestoneProtocols.some((protocol) => protocol.confirmation.freshnessDays === undefined),
  "Every milestone has a freshness expiry even where technical exposure does not warrant one");
assert(milestoneProtocols.some((protocol) => protocol.confirmation.freshnessDays !== undefined),
  "No safety- or exposure-sensitive milestone has a freshness policy");
for (const node of ["grounded-side-exit", "low-inversion-side-exit", "wall-height-side-exit", "controlled-short-floor-balance", "controlled-short-parallette-balance"]) {
  const protocol = protocolById.get(ids.milestoneBenchmarkId(ids.graphIds.handstandBalance, node));
  assert(protocol?.confirmation.qualifyingObservations === 1
    && protocol.confirmation.minimumDistinctSessions === 1,
  `${node} should confirm from its multi-attempt guided test rather than a universal two-session rule`);
}

const missingCoverage = new Map();
assert(new Set(missing.missingProgressionBridges.map((gap) => gap.id)).size === missing.missingProgressionBridges.length,
  "Gap registry contains duplicate IDs");
for (const gap of missing.missingProgressionBridges) {
  assert(contracts.isStableId(gap.id), `Gap ID is unstable: ${gap.id}`);
  assert(gap.deliveryPhase === "phase-7", `Gap ${gap.id} is assigned outside Phase 7`);
  assert(["planner-core-candidate", "optional-extension", "specialist-optional"].includes(gap.priority),
    `Gap ${gap.id} has unknown content priority ${gap.priority}`);
  assert(gap.boundary === "specialist" ? gap.priority === "specialist-optional" : gap.priority !== "specialist-optional",
    `Gap ${gap.id} has specialist priority inconsistent with ${gap.boundary} programming`);
  assert(gap.priority !== "planner-core-candidate" || gap.boundary === "automatic",
    `Gap ${gap.id} claims core-planner candidacy outside ordinary automatic programming`);
  assert(gap.nodeIds.length > 0, `Gap ${gap.id} covers no nodes`);
  for (const id of gap.nodeIds) {
    const key = `${gap.graphId}:${id}`;
    const entry = nodeByKey.get(key);
    assert(entry?.node.implementationStatus === "missing-content", `Gap ${gap.id} does not point to a missing node: ${key}`);
    assert(entry?.node.programmingBoundary === gap.boundary,
      `Gap ${gap.id} misclassifies ${key} as ${gap.boundary}`);
    missingCoverage.set(key, (missingCoverage.get(key) ?? 0) + 1);
  }
  for (const proposedId of gap.proposedContentIds) {
    assert(contracts.isStableId(proposedId), `Gap ${gap.id} proposes unstable ID ${proposedId}`);
    assert(!vNextIds.has(proposedId), `Gap ${gap.id} incorrectly added proposed Phase 7 content ${proposedId}`);
  }
}
const automaticGapPriorities = new Set(missing.missingProgressionBridges
  .filter((gap) => gap.boundary === "automatic")
  .map((gap) => gap.priority));
assert(automaticGapPriorities.has("planner-core-candidate") && automaticGapPriorities.has("optional-extension"),
  "Automatic programming boundary is still being treated as a monolithic content priority");
const missingNodeKeys = [...nodeByKey]
  .filter(([, entry]) => entry.node.implementationStatus === "missing-content")
  .map(([key]) => key);
assert(missingNodeKeys.every((key) => missingCoverage.get(key) === 1),
  `Missing nodes require exactly one gap entry: ${missingNodeKeys.filter((key) => missingCoverage.get(key) !== 1).join(", ")}`);
assert([...missingCoverage].every(([key, count]) => nodeByKey.has(key) && count === 1),
  "Gap registry contains a duplicate or unknown node");

// Report the intentionally non-executable current content separately from
// graph validity. Content may exist before all eligibility prerequisites do.
const executableMemo = new Map();
const executableNow = (key) => {
  if (executableMemo.has(key)) return executableMemo.get(key);
  const entry = nodeByKey.get(key);
  if (!entry || entry.node.implementationStatus !== "available") {
    executableMemo.set(key, false);
    return false;
  }
  const allOf = entry.node.prerequisiteRule?.allOf ?? [];
  const anyOf = entry.node.prerequisiteRule?.anyOf ?? [];
  const refAvailable = (ref) => ref.kind !== "milestone"
    || executableNow(`${ref.milestone.graphId}:${ref.milestone.nodeId}`);
  const result = allOf.every(refAvailable) && (anyOf.length === 0 || anyOf.some(refAvailable));
  executableMemo.set(key, result);
  return result;
};
const blockedAvailable = [...nodeByKey]
  .filter(([key, entry]) => entry.node.implementationStatus === "available" && !executableNow(key))
  .map(([key]) => key);
assert(blockedAvailable.length === 0,
  `Unexpected available-but-ineligible nodes: ${blockedAvailable.join(", ")}`);

const demandDomains = new Set(contracts.DEMAND_DOMAINS);
for (const exercise of bundle.exercises) {
  assert(exercise.lifecycle === "active", `Phase 2 unexpectedly deprecated ${exercise.id}`);
  assert(exercise.roles.length > 0, `Exercise ${exercise.id} has no catalogue role`);
  assert(!exercise.roles.includes("capacity-accessory") || exercise.capacityLinks.length > 0,
    `Exercise ${exercise.id} claims a capacity role without a retained-capacity link`);
  assert(exercise.prescriptionVariants.length > 0, `Exercise ${exercise.id} has no prescription`);
  for (const variant of exercise.prescriptionVariants) {
    const domains = new Set(Object.keys(variant.demand));
    assert(domains.size === demandDomains.size && [...demandDomains].every((domain) => domains.has(domain)),
      `Exercise ${exercise.id} lacks a complete seven-domain demand audit`);
  }
  const standardVariant = exercise.prescriptionVariants.find((variant) => variant.id === `${exercise.id}-standard`);
  assert(Boolean(standardVariant), `Exercise ${exercise.id} has no standard prescription variant`);
  assert(standardVariant?.assistance === undefined,
    `Exercise ${exercise.id} leaks regression guidance into its standard benchmark variant`);
  const legacy = program.exerciseList.find((candidate) => candidate.id === exercise.id);
  if (legacy?.regression?.trim()) {
    assert(exercise.prescriptionVariants.some((variant) => variant.id !== standardVariant?.id
      && variant.assistance === legacy.regression), `Exercise ${exercise.id} lost its distinct regression guidance`);
  }
  const graphLinkKeys = exercise.graphLinks.map((link) =>
    `${link.graphId}:${link.nodeId ?? ""}:${link.contribution}`);
  assert(new Set(graphLinkKeys).size === graphLinkKeys.length, `Exercise ${exercise.id} has duplicate graph links`);
}

const scanExerciseIds = (value, found = new Set()) => {
  if (typeof value === "string") {
    if (legacyIds.has(value)) found.add(value);
    return found;
  }
  if (Array.isArray(value)) value.forEach((item) => scanExerciseIds(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => scanExerciseIds(item, found));
  return found;
};
const generatedCurrentIds = scanExerciseIds({
  universalWarmup: program.universalWarmup,
  warmupsByVariant: program.warmupsByVariant,
  workouts: program.workouts,
  workoutVariants: program.workoutVariants,
});
assert(generatedCurrentIds.size > 0, "No current generated exercise references were discovered");
for (const id of generatedCurrentIds) {
  const definition = catalogue.exerciseDefinitionById.get(id);
  assert(Boolean(definition?.roles.length || definition?.relations.length), `Generated current exercise ${id} has no valid role or substitute`);
}

for (const id of ["frog-stand-hold", "floor-frog-stand-setup", "floor-frog-stand", "floor-crane-one-knee-float"]) {
  const definition = catalogue.exerciseDefinitionById.get(id);
  assert(definition?.graphLinks.every((link) => link.graphId !== ids.graphIds.planche), `${id} remains incorrectly classified as Planche`);
  assert(definition?.roles.includes("technique-safety"), `${id} is missing its balance-confidence/technique role`);
  assert(definition?.capacityLinks.every((link) => link.capacityId !== ids.capacityIds.straightArmSupport),
    `${id} remains incorrectly classified as straight-arm Planche capacity work`);
  assert(definition?.capacityLinks.every((link) => link.capacityId !== ids.capacityIds.overheadSupport),
    `${id} remains incorrectly classified as overhead stacked-support work`);
  assert(definition?.prescriptionVariants.every((variant) => variant.demand["forward-straight-arm-upper-limb"] === "low"),
    `${id} retains false straight-arm Planche demand`);
}
const straddleLean = catalogue.exerciseDefinitionById.get("straddle-planche-lean");
assert(straddleLean?.graphLinks.every((link) => link.contribution !== "milestone"), "Straddle Planche Lean was promoted to a straddle-planche outcome");
for (const id of ["easy-rope-bounce", "recovery-bounce"]) {
  const definition = catalogue.exerciseDefinitionById.get(id);
  assert(definition?.roles.includes("conditioning") && definition.roles.includes("preparation-recovery"),
    `${id} is not classified as conditioning preparation`);
  assert(definition?.capacityLinks.every((link) => link.capacityId !== ids.capacityIds.straightArmSupport),
    `${id} retains false scapular-capacity metadata`);
}
const freeKickup = catalogue.exerciseDefinitionById.get("freestanding-parallette-kickup");
assert(freeKickup?.graphLinks.some((link) => link.nodeId === "repeatable-parallette-entry"), "Freestanding parallette kick-up is missing its entry milestone");
assert(freeKickup?.graphLinks.every((link) => !String(link.nodeId ?? "").includes("balance")), "Freestanding kick-up incorrectly proves sustained balance");
assert(catalogue.exerciseDefinitionById.get("floor-freestanding-kick-up")?.graphLinks
  .some((link) => link.nodeId === "controlled-floor-entry"), "Floor kick-up is missing its apparatus-specific entry milestone");
const integratedChain = catalogue.exerciseDefinitionById.get("entry-balance-side-exit-chain");
assert(integratedChain?.graphLinks.some((link) => link.nodeId === "controlled-short-parallette-balance"),
  "Entry–balance–exit chain is missing its distinct short-balance protocol");
assert(integratedChain?.capacityLinks.every((link) => link.capacityId !== ids.capacityIds.straightArmSupport),
  "Entry–balance–exit chain inherited false tall-support capacity from its transition role");
assert(graphById.get(ids.graphIds.pressToHandstand).nodes.every((node) => node.implementationStatus === "missing-content"),
  "Press to Handstand incorrectly claims existing outcome content");
assert(bundle.graphs.flatMap((graph) => graph.nodes)
  .filter((node) => node.programmingBoundary === "specialist")
  .every((node) => node.implementationStatus === "missing-content"),
  "Phase 2 added specialist exercise content");

for (const id of ["floor-chest-wall-handstand-hold", "floor-freestanding-balance-attempt", "wall-handstand-side-exit"]) {
  const demand = catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand;
  assert(demand?.["hand-wrist-bearing"] === "high"
    && demand["overhead-straight-arm-upper-limb"] === "high"
    && demand["inversion-technical"] === "high", `${id} is missing full-inversion demand`);
}
for (const id of ["box-pike", "box-pike-shoulder-shift", "floor-side-exit-practice"]) {
  const demand = catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand;
  assert(demand?.["inversion-technical"] === "moderate", `${id} is not classified as low/supported inversion`);
}
for (const id of ["pike-shift", "bear-to-pike-shoulder-load", "standing-kickup-line-rehearsal"]) {
  const demand = catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand;
  assert(demand?.["inversion-technical"] === "low", `${id} is incorrectly classified as inversion exposure`);
}
for (const id of ["pike-elevation", "pike-scapular-shrugs", "pike-alternating-toe-float", "down-dog-scapular-shrugs"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand["hand-wrist-bearing"] === "moderate",
    `${id} is missing its audited hand-supported wrist demand`);
}
for (const id of ["pike-elevation", "chest-wall-line", "wall-elevation", "chest-wall-micro-shoulder-tap", "down-dog-scapular-shrugs"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand["forward-straight-arm-upper-limb"] === "low",
    `${id} incorrectly turns overhead/scapular work into forward Planche-like demand`);
}
for (const id of ["palm-lift-wrist-conditioning", "forearm-turn-finger-spread", "planche-lean-toe-lightener", "parallette-forward-lean-hold", "shoulder-sweep"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand["overhead-straight-arm-upper-limb"] === "low",
    `${id} incorrectly turns wrist, mobility or forward Planche work into overhead load`);
}
for (const id of ["frog-stand-hold", "floor-frog-stand-setup", "floor-frog-stand", "floor-crane-one-knee-float"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand["inversion-technical"] === "low",
    `${id} incorrectly counts bent-arm balance-confidence work as inversion exposure`);
}
for (const id of ["no-rope-penguin-taps", "dynamic-half-kneeling-hip-flexor-reach", "shoulder-wall-lat-stretch"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand["compression-trunk"] === "low",
    `${id} inherits false trunk/compression demand from a pelvic-control tag`);
}
for (const id of ["dead-bug", "straight-leg-raise", "seated-pike-hold-lift-off"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.prescriptionVariants[0].demand["hand-wrist-bearing"] === "low",
    `${id} inherited false wrist demand from equipment metadata`);
}
const latStretch = catalogue.exerciseDefinitionById.get("shoulder-wall-lat-stretch");
assert(latStretch?.roles.includes("preparation-recovery")
  && latStretch.graphLinks.length === 0
  && latStretch.capacityLinks.every((link) => link.facetIds.every((facetId) => facetId !== ids.capacityFacetIds.stackedSupport))
  && latStretch.prescriptionVariants[0].demand["inversion-technical"] === "low",
"Shoulder Wall Lat Stretch is incorrectly treated as loaded handstand work");

const hasCapacityFacet = (exerciseId, capacityId, facetId) =>
  catalogue.exerciseDefinitionById.get(exerciseId)?.capacityLinks.some((link) =>
    link.capacityId === capacityId && link.facetIds.includes(facetId));
for (const definition of bundle.exercises.filter((exercise) =>
  hasCapacityFacet(exercise.id, ids.capacityIds.straightArmSupport, ids.capacityFacetIds.tallSupport))) {
  assert(definition.prescriptionVariants[0].demand["hand-wrist-bearing"] !== "low",
    `${definition.id} builds tall support but understates hand/wrist demand`);
}
for (const id of ["box-pike", "floor-pike-push-up", "pike-alternating-toe-float", "tuck-support", "supported-knee-raise", "foot-assisted-tuck-planche", "cossack-weight-shift"]) {
  assert(!hasCapacityFacet(id, ids.capacityIds.pikeCompression, ids.capacityFacetIds.activeDoubleLegLift),
    `${id} is incorrectly classified as active double-leg pike compression`);
}
for (const id of ["box-pike", "floor-pike-push-up", "pike-alternating-toe-float", "tuck-support", "foot-assisted-tuck-planche"]) {
  assert(!hasCapacityFacet(id, ids.capacityIds.pikeCompression, ids.capacityFacetIds.usablePikeAccess),
    `${id} is incorrectly classified as usable pike access`);
}
for (const id of ["grounded-side-exit-rehearsal", "standing-kickup-line-rehearsal", "floor-side-exit-practice"]) {
  assert(!hasCapacityFacet(id, ids.capacityIds.overheadSupport, ids.capacityFacetIds.stackedSupport),
    `${id} is incorrectly classified as stacked overhead support`);
}
for (const id of ["wrist-palms", "fingertip-wrist-pulses", "pike-shift", "plank-tap", "side-plank"]) {
  assert(!hasCapacityFacet(id, ids.capacityIds.straightArmSupport, ids.capacityFacetIds.tallSupport),
    `${id} is incorrectly classified as a tall-support capacity builder`);
}
for (const id of ["no-rope-penguin-taps", "shoulder-wall-lat-stretch", "dynamic-half-kneeling-hip-flexor-reach", "cat-cow-flow", "seated-straddle-fold-gentle"]) {
  assert(!hasCapacityFacet(id, ids.capacityIds.bodyLineControl, ids.capacityFacetIds.hollowControl),
    `${id} is incorrectly classified as a hollow-control capacity builder`);
}
for (const id of ["thread-needle", "crossbody-shoulder-stretch", "chest-opener", "kneeling-thoracic-rotation"]) {
  assert(!hasCapacityFacet(id, ids.capacityIds.overheadSupport, ids.capacityFacetIds.shoulderFlexionAccess),
    `${id} is incorrectly classified as task-usable shoulder-flexion access`);
}

assert(catalogue.exerciseDefinitionById.get("eccentric-pike-pushup")?.prescriptionVariants[0].target.kind === "repetitions",
  "Eccentric Pike Push-Up target was misread as duration");
assert(catalogue.exerciseDefinitionById.get("floor-chest-wall-handstand-hold")?.prescriptionVariants[0].target.kind === "duration-seconds",
  "Floor Chest-to-Wall Handstand target was misread as repetitions");

for (const id of ["wall-kickup", "heel-pullaway", "partial-wall-walk"]) {
  assert(catalogue.exerciseDefinitionById.get(id)?.equipment.includes("wall"), `${id} is missing corrected wall equipment metadata`);
}
const controlledWallEntryProtocol = protocolById.get(ids.milestoneBenchmarkId(ids.graphIds.handstandBalance, "controlled-wall-entry"));
assert(controlledWallEntryProtocol?.conditions.equipment.includes("wall"),
  "Controlled wall-entry benchmark omits its required wall apparatus");
const standingEntryProtocol = protocolById.get(ids.milestoneBenchmarkId(ids.graphIds.handstandBalance, "standing-entry-line"));
assert(standingEntryProtocol?.conditions.equipment.length === 1
  && standingEntryProtocol.conditions.equipment[0] === "floor"
  && catalogue.exerciseDefinitionById.get("standing-kickup-line-rehearsal")?.equipment.length === 1
  && catalogue.exerciseDefinitionById.get("standing-kickup-line-rehearsal")?.equipment[0] === "floor",
"Grounded standing-entry rehearsal should not require parallettes");
for (const facetId of [
  ids.capacityFacetIds.horizontalRange,
  ids.capacityFacetIds.paralletteRangeControl,
  ids.capacityFacetIds.horizontalRepeatableStrength,
  ids.capacityFacetIds.pikeRange,
  ids.capacityFacetIds.deepPikeControl,
  ids.capacityFacetIds.verticalRepeatableStrength,
]) {
  const protocol = bundle.benchmarkProtocols.find((candidate) =>
    candidate.subject.kind === "capacity-facet" && candidate.subject.capacity.facetId === facetId);
  assert(protocol && !/^Complete the authored/u.test(protocol.conditions.range),
    `Push-capacity facet ${facetId} lacks an explicit observable range landmark`);
}
assert(catalogue.exerciseDefinitionById.get("high-plank-bird-dog")?.relations
  .some((relation) => relation.targetExerciseId === "bird-dog"), "High-Plank Bird Dog retained a false linear regression");
assert(catalogue.exerciseDefinitionById.get("bridge-walkout")?.relations
  .some((relation) => relation.targetExerciseId === "glute-bridge-march"), "Bridge Walkout retained a false linear regression");

assert(catalogue.catalogueIdentityPolicy.aliases.length === 0, "Phase 2 introduced unapproved aliases");
assert(catalogue.catalogueIdentityPolicy.tombstones.length === 0, "Phase 2 introduced unapproved tombstones");
assert(catalogue.catalogueIdentityPolicy.stableIdsRetained.length === 195, "Identity policy does not retain all 195 IDs");

const walkSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return entry.name === "vnext" ? [] : walkSourceFiles(path);
  return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
});
for (const path of walkSourceFiles(join(projectRoot, "app"))) {
  const source = readFileSync(path, "utf8");
  assert(
    !/(?:from\s+["']|import\s*\(\s*["'])[^"']*vnext\/definitions(?:\/|["'])/gu.test(source),
    `Live application file imports vNext definitions: ${path}`,
  );
}

if (failures.length > 0) {
  console.error(`vNext Phase 2 checks failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const availableNodes = [...nodeByKey.values()].filter(({ node }) => node.implementationStatus === "available").length;
const missingNodes = nodeByKey.size - availableNodes;
const boundaryCounts = Object.fromEntries(["automatic", "stronger-gated", "specialist"].map((boundary) => [
  boundary,
  [...nodeByKey.values()].filter(({ node }) => node.programmingBoundary === boundary).length,
]));
console.log(
  `vNext Phase 2 checks passed: ${bundle.graphs.length} graphs, ${nodeByKey.size} nodes `
  + `(${availableNodes} available, ${missingNodes} Phase 7 gaps), ${bundle.capacities.length} capacities, `
  + `${bundle.benchmarkProtocols.length} protocols, ${bundle.exercises.length} mapped exercises.`,
);
console.log(`Programming boundaries: ${JSON.stringify(boundaryCounts)}; available but prerequisite-blocked: ${blockedAvailable.join(", ")}.`);
