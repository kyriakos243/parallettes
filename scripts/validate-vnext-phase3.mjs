import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const loadTypeScriptModule = (relativePath, dependencies = {}, replacements = []) => {
  let source = readFileSync(join(projectRoot, relativePath), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
const ids = loadTypeScriptModule("app/vnext/definitions/ids.ts", { "../contracts": contracts });
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
const projectionContracts = loadTypeScriptModule("app/vnext/projection/contracts.ts");
const policyModule = loadTypeScriptModule("app/vnext/projection/policy.ts", {
  "../contracts": contracts,
  "../definitions/benchmarks": benchmarks,
  "../definitions/ids": ids,
});
const normalize = loadTypeScriptModule("app/vnext/projection/normalize.ts", {
  "./policy": policyModule,
});
const projection = loadTypeScriptModule("app/vnext/projection/project.ts", {
  "../contracts": contracts,
  "./contracts": projectionContracts,
  "./normalize": normalize,
  "./policy": policyModule,
});

const bundle = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  catalogueVersion: ids.VNEXT_PHASE2_CATALOGUE_VERSION,
  exercises: catalogue.exerciseDefinitions,
  graphs: graphs.developmentGraphs,
  capacities: capacities.capacityDefinitions,
  benchmarkProtocols: benchmarks.benchmarkProtocols,
};
const policy = policyModule.vNextProjectionPolicyV1;
const athleteId = contracts.parseStableId("athlete", "phase3-athlete");
const allEquipment = [...new Set(bundle.exercises.flatMap((exercise) => exercise.equipment))].sort();
const baseIntent = (defaultSessionDemand = "standard") => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId,
  updatedAt: "2026-01-01T00:00:00.000Z",
  goals: [],
  equipment: allEquipment,
  defaultSessionDemand,
  preferences: { specialistOptIn: false },
});
const protocolById = new Map(bundle.benchmarkProtocols.map((item) => [item.id, item]));
const exerciseById = new Map(bundle.exercises.map((item) => [item.id, item]));
const protocol = (graph, node) => protocolById.get(ids.milestoneBenchmarkId(graph, node));
const measurementFor = (benchmark, passing = true) => {
  const metric = benchmark.metric;
  if (metric.kind === "duration-seconds") {
    return { value: passing ? metric.minimum : Math.max(0, metric.minimum - 1), unit: "seconds" };
  }
  if (metric.kind === "repetitions") {
    return { value: passing ? metric.minimum : Math.max(0, metric.minimum - 1), unit: "repetitions" };
  }
  if (metric.kind === "successful-attempts") {
    const value = passing ? metric.minimumSuccessful : Math.max(0, metric.minimumSuccessful - 1);
    return { value, unit: "attempts", attemptsTotal: Math.max(value, metric.maximumAttempts) };
  }
  return undefined;
};
let eventSequence = 0;
const observed = (benchmark, occurredAt, options = {}) => {
  eventSequence += 1;
  const outcome = options.outcome ?? "clean";
  const measurement = options.measurement ?? measurementFor(benchmark, outcome === "clean");
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("event", options.id ?? `phase3-event-${eventSequence}`),
    athleteId,
    occurredAt,
    recordedAt: occurredAt,
    source: "guided-test",
    catalogueVersion: bundle.catalogueVersion,
    type: "performance_observed",
    subject: benchmark.subject,
    outcome,
    benchmarkProtocolId: benchmark.id,
    benchmarkProtocolVersion: benchmark.definitionVersion,
    observationSessionId: contracts.parseStableId(
      "observation-session",
      options.session ?? `phase3-test-${eventSequence}`,
    ),
    ...(measurement ? { measurement } : {}),
  };
};
const project = ({
  asOf,
  evidenceEvents = [],
  sessionPlans = [],
  sessionRecords = [],
  intent = baseIntent(),
  trainabilityRequests = [],
}) => projection.projectAthleteState({
  athleteId,
  asOf,
  policy,
  definitionBundles: [bundle],
  evidenceEvents,
  sessionPlans,
  sessionRecords,
  intent,
  trainabilityRequests,
});
const stateNode = (state, graph, node) => state.nodeStates.find((item) =>
  item.milestone.graphId === graph && item.milestone.nodeId === node);
const stateCapacity = (state, capacity, facet) => state.capacityFindings.find((item) =>
  item.capacity.capacityId === capacity && item.capacity.facetId === facet);
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const assertOk = (result, label) => {
  assert(result.ok && result.state, `${label} projection failed: ${result.issues.map((item) => item.message).join("; ")}`);
  if (result.state) {
    const validationResult = validation.validateDerivedAthleteState(result.state);
    assert(validationResult.valid, `${label} emitted invalid derived state: ${validationResult.issues
      .map((item) => `${item.path} ${item.code}`).join("; ")}`);
  }
  return result.state;
};

// 1. Beginner: no global level and no invented ability; only graph-ready roots
// can appear as explainable frontier work.
const beginner = assertOk(project({ asOf: "2026-02-01T00:00:00.000Z" }), "beginner");
assert(beginner.nodeStates.every((item) => item.lifecycle === "unknown" && item.confidence === "unknown"),
  "Beginner projection invented node evidence");
assert(beginner.capacityFindings.every((item) => item.finding === "unknown" && item.confidence === "unknown"),
  "Beginner projection invented capacity evidence");
assert(!Object.hasOwn(beginner, "level"), "Derived state reintroduced a global athlete level");

// 2. Mixed skill: independent graph findings coexist without a global level.
const floorPush = protocol("parallette-pushing", "floor-push-up");
const shortParalletteBalance = protocol("handstand-balance", "controlled-short-parallette-balance");
const plancheLean = protocol("planche", "controlled-planche-lean");
assert(floorPush && shortParalletteBalance && plancheLean, "Golden protocols are missing");
const mixedEvents = [
  observed(floorPush, "2026-01-02T10:00:00.000Z"),
  observed(floorPush, "2026-01-05T10:00:00.000Z"),
  observed(shortParalletteBalance, "2026-01-08T10:00:00.000Z"),
  observed(plancheLean, "2026-01-10T10:00:00.000Z"),
];
const mixed = assertOk(project({ asOf: "2026-01-12T00:00:00.000Z", evidenceEvents: mixedEvents }), "mixed skill");
assert(stateNode(mixed, "parallette-pushing", "floor-push-up")?.lifecycle === "established",
  "Separated floor push-up proofs did not establish that family");
assert(stateNode(mixed, "handstand-balance", "controlled-short-parallette-balance")?.lifecycle === "established",
  "Single-session balance policy was not respected");
assert(stateNode(mixed, "planche", "controlled-planche-lean")?.lifecycle === "demonstrated",
  "One Planche observation should demonstrate but not establish");
assert(stateNode(mixed, "vertical-push-hspu", "floor-pike-push-up")?.lifecycle === "unknown",
  "Mixed-skill evidence leaked into an unrelated family");
const sameOccasionEvents = [
  observed(floorPush, "2026-01-02T10:00:00.000Z", { session: "phase3-one-test-occasion" }),
  observed(floorPush, "2026-01-02T10:05:00.000Z", { session: "phase3-one-test-occasion" }),
];
const sameOccasion = assertOk(project({
  asOf: "2026-01-03T00:00:00.000Z",
  evidenceEvents: sameOccasionEvents,
}), "same test occasion");
assert(stateNode(sameOccasion, "parallette-pushing", "floor-push-up")?.lifecycle === "demonstrated",
  "Two observations from one test occasion incorrectly satisfied a separated-session policy");

const cleanReviewSession = (benchmark, date, suffix) => {
  const exercise = exerciseById.get(benchmark.exerciseId);
  const variant = exercise.prescriptionVariants.find((item) => item.id === benchmark.prescriptionVariantId);
  const plan = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("session-plan", `phase3-review-plan-${suffix}`),
    athleteId,
    createdAt: date,
    catalogueVersion: bundle.catalogueVersion,
    generatorPolicyId: contracts.parseStableId("policy", "phase3-fixture-generator"),
    generatorPolicyVersion: contracts.parseDefinitionVersion(1),
    definitionReferences: [],
    intendedDurationSeconds: 300,
    items: [{
      id: contracts.parseStableId("plan-item", `phase3-review-item-${suffix}`),
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: variant.id,
      purpose: "primary-development",
      plannedSeconds: 300,
      targetMilestone: benchmark.subject.milestone,
      demand: variant.demand,
    }],
    rationale: [],
  };
  const completedAt = new Date(Date.parse(date) + 300_000).toISOString();
  const record = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("session-record", `phase3-review-record-${suffix}`),
    athleteId,
    planId: plan.id,
    startedAt: date,
    completedAt,
    recordedAt: completedAt,
    status: "complete",
    itemOutcomes: [{
      planItemId: plan.items[0].id,
      status: "completed",
      participationSeconds: 240,
      review: { outcome: "clean", difficulty: "right" },
    }],
  };
  return { plan, record };
};
const mediumProtocol = bundle.benchmarkProtocols.find((benchmark) => {
  if (benchmark.subject.kind !== "milestone") return false;
  const exercise = exerciseById.get(benchmark.exerciseId);
  const target = exercise?.prescriptionVariants.find((item) => item.id === benchmark.prescriptionVariantId)?.target;
  return (target?.kind === "duration-seconds" && benchmark.metric.kind === "duration-seconds"
    && target.minimum >= benchmark.metric.minimum)
    || (target?.kind === "repetitions" && benchmark.metric.kind === "repetitions"
      && target.minimum >= benchmark.metric.minimum);
});
assert(mediumProtocol, "No scalar prescription safely guarantees its benchmark minimum");
const mediumOne = cleanReviewSession(mediumProtocol, "2026-01-13T10:00:00.000Z", "one");
const mediumTwo = cleanReviewSession(mediumProtocol, "2026-01-16T10:00:00.000Z", "two");
const mediumDeveloping = assertOk(project({
  asOf: "2026-01-14T00:00:00.000Z",
  sessionPlans: [mediumOne.plan],
  sessionRecords: [mediumOne.record],
}), "one medium clean session");
assert(stateNode(
  mediumDeveloping,
  mediumProtocol.subject.milestone.graphId,
  mediumProtocol.subject.milestone.nodeId,
)?.lifecycle === "developing",
  "One ordinary clean prescribed session was treated as benchmark proof");
const mediumEstablished = assertOk(project({
  asOf: "2026-01-17T00:00:00.000Z",
  sessionPlans: [mediumOne.plan, mediumTwo.plan],
  sessionRecords: [mediumOne.record, mediumTwo.record],
}), "repeated medium clean sessions");
assert(stateNode(
  mediumEstablished,
  mediumProtocol.subject.milestone.graphId,
  mediumProtocol.subject.milestone.nodeId,
)?.lifecycle === "established",
  "Repeated exact prescribed-session evidence did not establish under the movement policy");
const underSpecifiedOne = cleanReviewSession(floorPush, "2026-01-18T10:00:00.000Z", "under-one");
const underSpecifiedTwo = cleanReviewSession(floorPush, "2026-01-21T10:00:00.000Z", "under-two");
const underSpecified = assertOk(project({
  asOf: "2026-01-22T00:00:00.000Z",
  sessionPlans: [underSpecifiedOne.plan, underSpecifiedTwo.plan],
  sessionRecords: [underSpecifiedOne.record, underSpecifiedTwo.record],
}), "under-specified medium sessions");
assert(stateNode(underSpecified, "parallette-pushing", "floor-push-up")?.lifecycle === "developing",
  "Ordinary reviews established a benchmark whose metric the prescription did not guarantee");

// 3. One hard training day changes load/trainability, not capability.
const highExercise = bundle.exercises.find((exercise) => exercise.graphLinks.every((link) => !link.nodeId)
  && exercise.prescriptionVariants.some((variant) => Object.values(variant.demand).includes("high")));
const highVariant = highExercise?.prescriptionVariants.find((variant) => Object.values(variant.demand).includes("high"));
assert(highExercise && highVariant, "No non-milestone high-demand fixture exercise exists");
const hardPlan = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("session-plan", "phase3-hard-plan"),
  athleteId,
  createdAt: "2026-01-20T10:00:00.000Z",
  catalogueVersion: bundle.catalogueVersion,
  generatorPolicyId: contracts.parseStableId("policy", "phase3-fixture-generator"),
  generatorPolicyVersion: contracts.parseDefinitionVersion(1),
  definitionReferences: [],
  intendedDurationSeconds: 300,
  items: [{
    id: contracts.parseStableId("plan-item", "phase3-hard-item"),
    exerciseId: highExercise.id,
    exerciseDefinitionVersion: highExercise.definitionVersion,
    prescriptionVariantId: highVariant.id,
    purpose: "primary-development",
    plannedSeconds: 300,
    demand: highVariant.demand,
  }],
  rationale: [],
};
const hardRecord = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("session-record", "phase3-hard-record"),
  athleteId,
  planId: hardPlan.id,
  startedAt: "2026-01-20T10:00:00.000Z",
  completedAt: "2026-01-20T10:05:00.000Z",
  recordedAt: "2026-01-20T10:05:00.000Z",
  status: "partial",
  itemOutcomes: [{
    planItemId: hardPlan.items[0].id,
    status: "completed",
    participationSeconds: 240,
    review: { outcome: "not-today", difficulty: "hard" },
  }],
};
const hardDay = assertOk(project({
  asOf: "2026-01-21T00:00:00.000Z",
  evidenceEvents: mixedEvents,
  sessionPlans: [hardPlan],
  sessionRecords: [hardRecord],
  trainabilityRequests: [{
    exerciseId: highExercise.id,
    exerciseDefinitionVersion: highExercise.definitionVersion,
    prescriptionVariantId: highVariant.id,
  }],
}), "one hard day");
assert(stateNode(hardDay, "parallette-pushing", "floor-push-up")?.lifecycle === "established",
  "A hard day erased historical capability");
assert(hardDay.recentLoad.exposures.length >= 1, "Participated hard work was not retained as load exposure");
assert(hardDay.trainabilityEvaluations[0]?.decision === "modify"
  && hardDay.trainabilityEvaluations[0].reasonCodes.includes(policyModule.projectionReasonCodes.recentHighLoad),
"Recent matching high load did not modify the requested prescription");
const moderateExercise = bundle.exercises.find((exercise) => exercise.graphLinks.every((link) => !link.nodeId)
  && exercise.prescriptionVariants.some((variant) => Object.values(variant.demand).includes("moderate")
    && !Object.values(variant.demand).includes("high")));
const moderateVariant = moderateExercise?.prescriptionVariants.find((variant) =>
  Object.values(variant.demand).includes("moderate") && !Object.values(variant.demand).includes("high"));
assert(moderateExercise && moderateVariant, "No non-milestone moderate-demand fixture exercise exists");
const moderatePlan = {
  ...hardPlan,
  id: contracts.parseStableId("session-plan", "phase3-moderate-hard-plan"),
  items: [{
    ...hardPlan.items[0],
    id: contracts.parseStableId("plan-item", "phase3-moderate-hard-item"),
    exerciseId: moderateExercise.id,
    exerciseDefinitionVersion: moderateExercise.definitionVersion,
    prescriptionVariantId: moderateVariant.id,
    demand: moderateVariant.demand,
  }],
};
const moderateRecord = {
  ...hardRecord,
  id: contracts.parseStableId("session-record", "phase3-moderate-hard-record"),
  planId: moderatePlan.id,
  itemOutcomes: [{
    ...hardRecord.itemOutcomes[0],
    planItemId: moderatePlan.items[0].id,
  }],
};
const moderateHardDay = assertOk(project({
  asOf: "2026-01-21T00:00:00.000Z",
  sessionPlans: [moderatePlan],
  sessionRecords: [moderateRecord],
  trainabilityRequests: [{
    exerciseId: moderateExercise.id,
    exerciseDefinitionVersion: moderateExercise.definitionVersion,
    prescriptionVariantId: moderateVariant.id,
  }],
}), "moderate difficult day");
assert(moderateHardDay.trainabilityEvaluations[0]?.decision === "modify"
  && moderateHardDay.trainabilityEvaluations[0].reasonCodes
    .includes(policyModule.projectionReasonCodes.recentDifficultPerformance),
"A difficult moderate-demand performance did not modify the next matching prescription");
const crossVersionFeedback = projection.evaluateTrainability({
  request: {
    exerciseId: moderateExercise.id,
    exerciseDefinitionVersion: moderateExercise.definitionVersion,
    prescriptionVariantId: moderateVariant.id,
  },
  state: {
    ...moderateHardDay,
    recentLoad: {
      ...moderateHardDay.recentLoad,
      exposures: moderateHardDay.recentLoad.exposures.map((exposure) => ({
        ...exposure,
        exerciseDefinitionVersion: exposure.exerciseDefinitionVersion + 1,
      })),
    },
  },
  bundle,
  asOf: "2026-01-21T00:00:00.000Z",
  policy,
  intent: baseIntent(),
});
assert(crossVersionFeedback.decision === "allow"
  && !crossVersionFeedback.reasonCodes.includes(policyModule.projectionReasonCodes.recentDifficultPerformance),
"Difficult-performance feedback leaked across prescription definition versions");
const duplicateRequest = project({
  asOf: "2026-01-21T00:00:00.000Z",
  trainabilityRequests: [
    {
      exerciseId: moderateExercise.id,
      exerciseDefinitionVersion: moderateExercise.definitionVersion,
      prescriptionVariantId: moderateVariant.id,
    },
    {
      exerciseId: moderateExercise.id,
      exerciseDefinitionVersion: moderateExercise.definitionVersion,
      prescriptionVariantId: moderateVariant.id,
    },
  ],
});
assert(!duplicateRequest.ok
  && duplicateRequest.issues.some((item) => item.code === policyModule.projectionReasonCodes.invalidInput),
"Duplicate trainability requests produced a schema-invalid duplicate evaluation");

// 4. One benchmark failure is noise; two distinct post-proof failures
// contradict confidence without demoting established capability.
const proofEvents = [
  observed(floorPush, "2026-02-01T10:00:00.000Z"),
  observed(floorPush, "2026-02-05T10:00:00.000Z"),
];
const firstFailure = observed(floorPush, "2026-02-08T10:00:00.000Z", { outcome: "not-yet" });
const secondFailure = observed(floorPush, "2026-02-10T10:00:00.000Z", { outcome: "partial" });
const onceFailed = assertOk(project({
  asOf: "2026-02-09T00:00:00.000Z",
  evidenceEvents: [...proofEvents, firstFailure],
}), "one benchmark failure");
assert(stateNode(onceFailed, "parallette-pushing", "floor-push-up")?.confidence === "current",
  "One failed benchmark contradicted confidence");
const onceFailedInference = stateNode(onceFailed, "parallette-pushing", "knee-push-up")
  ?.satisfiedForEligibilityBy.find((item) => item.milestone.nodeId === "floor-push-up");
assert(onceFailedInference !== undefined
  && !onceFailedInference.supportingObservationRefs.some((source) =>
    source.kind === "evidence-event" && source.eventId === firstFailure.id),
"Eligibility provenance included a failed observation rather than proof-only sources");
const repeatedlyFailed = assertOk(project({
  asOf: "2026-02-11T00:00:00.000Z",
  evidenceEvents: [...proofEvents, firstFailure, secondFailure],
}), "repeated benchmark failure");
const regressedNode = stateNode(repeatedlyFailed, "parallette-pushing", "floor-push-up");
assert(regressedNode?.lifecycle === "established" && regressedNode.confidence === "contradicted",
  "Repeated benchmark failure did not preserve capability while contradicting confidence");
assert(stateNode(repeatedlyFailed, "parallette-pushing", "knee-push-up")
  ?.satisfiedForEligibilityBy.length === 0,
"Contradicted stronger evidence remained active as predecessor eligibility");
assert(repeatedlyFailed.workingNodes.some((item) => item.milestone.nodeId === "floor-push-up"
  && item.reasonCodes.includes(policyModule.projectionReasonCodes.reconfirmationDue)),
"Contradicted capability was not selected for reconfirmation work");

// 5. Restriction and clearance alter trainability only. Clearance leaves a
// high-demand reconfirmation requirement until clean post-clearance evidence.
const leanProofs = [
  observed(plancheLean, "2026-03-01T10:00:00.000Z"),
  observed(plancheLean, "2026-03-05T10:00:00.000Z"),
];
const leanExercise = exerciseById.get(plancheLean.exerciseId);
const leanVariant = leanExercise.prescriptionVariants.find((item) => item.id === plancheLean.prescriptionVariantId)
  ?? leanExercise.prescriptionVariants[0];
const highLeanDomain = Object.entries(leanVariant.demand).find(([, level]) => level === "high")?.[0];
assert(highLeanDomain, "Planche lean fixture has no high demand domain");
const restriction = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase3-restriction"),
  athleteId,
  occurredAt: "2026-03-10T10:00:00.000Z",
  recordedAt: "2026-03-10T10:00:00.000Z",
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_reported",
  severity: "block",
  demandDomains: [highLeanDomain],
  bodyRegions: ["wrist"],
};
const clearance = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase3-clearance"),
  athleteId,
  occurredAt: "2026-03-12T10:00:00.000Z",
  recordedAt: "2026-03-12T10:00:00.000Z",
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_cleared",
  restrictionEventId: restriction.id,
};
const leanRequest = {
  exerciseId: leanExercise.id,
  exerciseDefinitionVersion: leanExercise.definitionVersion,
  prescriptionVariantId: leanVariant.id,
};
const restricted = assertOk(project({
  asOf: "2026-03-11T12:00:00.000Z",
  evidenceEvents: [...leanProofs, restriction],
  trainabilityRequests: [leanRequest],
}), "active restriction");
assert(stateNode(restricted, "planche", "controlled-planche-lean")?.lifecycle === "established",
  "Pain restriction deleted historical capability");
assert(restricted.trainabilityEvaluations[0]?.decision === "block", "Block restriction did not block matching work");
const cleared = assertOk(project({
  asOf: "2026-03-15T12:00:00.000Z",
  evidenceEvents: [...leanProofs, restriction, clearance],
  trainabilityRequests: [leanRequest],
}), "cleared restriction");
assert(cleared.activeRestrictions.length === 0, "Targeted clearance left its restriction active");
assert(cleared.trainabilityEvaluations[0]?.decision === "modify"
  && cleared.trainabilityEvaluations[0].reasonCodes.includes(policyModule.projectionReasonCodes.postClearance),
"Clearance incorrectly bypassed high-demand reconfirmation");
const afterClearanceProof = observed(plancheLean, "2026-03-16T10:00:00.000Z");
const secondAfterClearanceProof = observed(plancheLean, "2026-03-19T10:00:00.000Z");
const reconfirmed = assertOk(project({
  asOf: "2026-03-22T12:00:00.000Z",
  evidenceEvents: [...leanProofs, restriction, clearance, afterClearanceProof, secondAfterClearanceProof],
  trainabilityRequests: [leanRequest],
}), "post-clearance evidence");
assert(!reconfirmed.reconfirmationRequirements.length, "Clean post-clearance evidence did not resolve the requirement");

// 6. Inactivity affects only protocols with freshness. The exact deadline is
// current; one millisecond later it is stale, with capability preserved.
const lastLeanProofMs = Date.parse("2026-04-05T10:00:00.000Z");
const freshnessEvents = [
  observed(plancheLean, "2026-04-01T10:00:00.000Z"),
  observed(plancheLean, new Date(lastLeanProofMs).toISOString()),
];
const deadline = new Date(lastLeanProofMs + plancheLean.confirmation.freshnessDays * 86_400_000).toISOString();
const atDeadline = assertOk(project({ asOf: deadline, evidenceEvents: freshnessEvents }), "freshness boundary");
assert(stateNode(atDeadline, "planche", "controlled-planche-lean")?.confidence === "current",
  "Evidence became stale at, rather than after, its exact freshness deadline");
const afterDeadline = assertOk(project({
  asOf: new Date(Date.parse(deadline) + 1).toISOString(),
  evidenceEvents: freshnessEvents,
}), "stale evidence");
const staleLean = stateNode(afterDeadline, "planche", "controlled-planche-lean");
assert(staleLean?.lifecycle === "established" && staleLean.confidence === "stale",
  "Inactivity did not preserve capability while expiring confidence");
const standingEntry = protocol("handstand-balance", "standing-entry-line");
const wallEntry = protocol("handstand-balance", "controlled-wall-entry");
const oldStandingProof = observed(standingEntry, "2026-01-01T10:00:00.000Z");
const deeperProvisional = cleanReviewSession(wallEntry, "2026-04-10T10:00:00.000Z", "deeper-provisional");
const stalePredecessor = assertOk(project({
  asOf: "2026-04-11T00:00:00.000Z",
  evidenceEvents: [oldStandingProof],
  sessionPlans: [deeperProvisional.plan],
  sessionRecords: [deeperProvisional.record],
}), "stale predecessor with deeper provisional evidence");
assert(stalePredecessor.workingNodes.some((item) => item.milestone.nodeId === "standing-entry-line")
  && !stalePredecessor.workingNodes.some((item) => item.milestone.nodeId === "controlled-wall-entry"),
"A deeper provisional node eclipsed the stale prerequisite that must be reconfirmed first");

// 7. Deload/easier intent is prescription context; it does not mutate evidence.
const standardProjection = assertOk(project({
  asOf: "2026-05-01T00:00:00.000Z",
  evidenceEvents: proofEvents,
  intent: baseIntent("standard"),
}), "standard intent");
const deloadProjection = assertOk(project({
  asOf: "2026-05-01T00:00:00.000Z",
  evidenceEvents: proofEvents,
  intent: baseIntent("technique"),
}), "technique intent");
assert(JSON.stringify(standardProjection.nodeStates) === JSON.stringify(deloadProjection.nodeStates)
  && JSON.stringify(standardProjection.capacityFindings) === JSON.stringify(deloadProjection.capacityFindings),
"Technique/deload intent changed capability evidence");

// 8. Stronger evidence gives only audited mechanical predecessor eligibility;
// it does not manufacture predecessor or capacity demonstrations.
const oneStrongProof = observed(floorPush, "2026-06-01T10:00:00.000Z", { id: "phase3-strong-proof" });
const secondStrongProof = observed(floorPush, "2026-06-03T10:00:00.000Z", { id: "phase3-strong-proof-2" });
const stronger = assertOk(project({
  asOf: "2026-06-04T00:00:00.000Z",
  evidenceEvents: [oneStrongProof, secondStrongProof],
}), "stronger-node evidence");
const inferredKnee = stateNode(stronger, "parallette-pushing", "knee-push-up");
assert(inferredKnee?.lifecycle === "unknown"
  && inferredKnee.satisfiedForEligibilityBy.some((item) => item.milestone.nodeId === "floor-push-up"),
"Stronger proof did not create the exact eligibility-only predecessor implication");
assert(stronger.capacityFindings.every((item) => item.finding === "unknown"
  || item.capacity.facetId === "horizontal-range"),
"Stronger-node inference manufactured unrelated capacity evidence");
const fullLSit = protocol("l-sit-v-sit", "full-l-sit");
const advancedProfile = assertOk(project({
  asOf: "2026-06-04T00:00:00.000Z",
  evidenceEvents: [
    observed(fullLSit, "2026-05-28T10:00:00.000Z"),
    observed(fullLSit, "2026-06-02T10:00:00.000Z"),
  ],
}), "advanced current-catalogue profile");
assert(stateNode(advancedProfile, "l-sit-v-sit", "full-l-sit")?.lifecycle === "established"
  && stateNode(advancedProfile, "l-sit-v-sit", "one-leg-l-sit")?.lifecycle === "unknown"
  && stateNode(advancedProfile, "l-sit-v-sit", "one-leg-l-sit")?.satisfiedForEligibilityBy
    .some((item) => item.milestone.nodeId === "full-l-sit"),
"Advanced full-L evidence did not preserve the demonstrated-vs-inferred distinction");
const correction = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase3-strong-proof-correction"),
  athleteId,
  occurredAt: "2026-06-04T01:00:00.000Z",
  recordedAt: "2026-06-04T01:00:00.000Z",
  source: "correction",
  catalogueVersion: bundle.catalogueVersion,
  type: "evidence_corrected",
  supersedesEventId: oneStrongProof.id,
  reason: "Fixture correction",
};
const corrected = assertOk(project({
  asOf: "2026-06-05T00:00:00.000Z",
  evidenceEvents: [oneStrongProof, secondStrongProof, correction],
}), "corrected stronger evidence");
assert(stateNode(corrected, "parallette-pushing", "floor-push-up")?.lifecycle === "demonstrated"
  && stateNode(corrected, "parallette-pushing", "knee-push-up")?.satisfiedForEligibilityBy.length === 0,
"Correction failed to rebuild confirmation and inferred state from remaining truth");
assert(corrected.observationCursors.evidenceEvents === correction.id,
  "Correction metadata was lost from the raw-log replay cursor");

// 9. One source may support an explicitly compatible milestone and capacity,
// but remains one source and one load exposure. Same-exercise protocols do not
// reuse without an audited rule.
const singleReuse = assertOk(project({
  asOf: "2026-06-02T00:00:00.000Z",
  evidenceEvents: [oneStrongProof],
}), "single-source protocol reuse");
const reusedCapacity = stateCapacity(singleReuse, "horizontal-bent-arm-push", "horizontal-range");
assert(reusedCapacity?.finding === "demonstrated", "Audited push-up protocol reuse did not fan out the observation");
assert(reusedCapacity?.supportingObservationRefs.length === 1
  && stateNode(singleReuse, "parallette-pushing", "floor-push-up")?.supportingObservationRefs.length === 1,
"Protocol reuse duplicated source provenance");
assert(singleReuse.recentLoad.exposures.length === 1, "Protocol reuse double-counted recent load");
const pressureControl = protocol("handstand-balance", "parallette-pressure-control");
const pressureOnly = assertOk(project({
  asOf: "2026-06-10T00:00:00.000Z",
  evidenceEvents: [observed(pressureControl, "2026-06-09T10:00:00.000Z")],
}), "same-exercise non-reuse");
assert(stateCapacity(pressureOnly, "overhead-support", "stacked-support")?.finding === "unknown",
  "Same exercise ID incorrectly triggered unreviewed protocol reuse");

// 10. Replay order and exact duplicates are deterministic; conflicting stable
// IDs fail closed instead of choosing the last array element.
const ordered = project({ asOf: "2026-02-11T00:00:00.000Z", evidenceEvents: [...proofEvents, firstFailure, secondFailure] });
const shuffled = project({ asOf: "2026-02-11T00:00:00.000Z", evidenceEvents: [secondFailure, proofEvents[0], firstFailure, proofEvents[1], proofEvents[0]] });
assert(JSON.stringify(ordered) === JSON.stringify(shuffled), "Shuffled/exact-duplicate replay changed projected output");
const conflicting = { ...proofEvents[0], outcome: "not-yet" };
const conflictResult = project({
  asOf: "2026-02-11T00:00:00.000Z",
  evidenceEvents: [proofEvents[0], conflicting],
});
assert(!conflictResult.ok && conflictResult.issues.some((item) => item.code === policyModule.projectionReasonCodes.duplicateConflict),
  "Conflicting duplicate event IDs did not fail closed");
const backwardsCorrection = {
  ...correction,
  id: contracts.parseStableId("event", "phase3-backwards-correction"),
  occurredAt: "2026-05-31T10:00:00.000Z",
  recordedAt: "2026-05-31T10:00:00.000Z",
};
const backwardsCorrectionResult = project({
  asOf: "2026-06-05T00:00:00.000Z",
  evidenceEvents: [oneStrongProof, backwardsCorrection],
});
assert(!backwardsCorrectionResult.ok
  && backwardsCorrectionResult.issues.some((item) => item.code === policyModule.projectionReasonCodes.supersessionInvalid),
"A correction recorded before its target was accepted");

if (failures.length) {
  console.error(`vNext Phase 3 validation failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("vNext Phase 3 validation passed");
console.log(`Golden scenarios: 10; projection policy: ${policy.id}@${policy.version}`);
console.log(`Definition scope: ${bundle.graphs.length} graphs, ${bundle.benchmarkProtocols.length} protocols`);
