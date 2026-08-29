import { readFileSync } from "node:fs";
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
  const runModule = new Function("exports", "module", "require", compiled);
  runModule(loaded.exports, loaded, localRequire);
  return loaded.exports;
};

const contracts = loadTypeScriptModule("app/vnext/contracts.ts");
const legacy = loadTypeScriptModule("app/vnext/legacyV12.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts", {
  "./contracts": contracts,
});
const fixtures = loadTypeScriptModule("app/vnext/fixtures.ts", {
  "./contracts": contracts,
  "./legacyV12": legacy,
});
const program = loadTypeScriptModule("app/program.ts", {}, [
  ["import.meta.env.BASE_URL", '"/parallettes/"'],
]);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const issueCodes = (result) => new Set(result.issues.map((issue) => issue.code));
const assertValid = (label, result) => {
  if (result.valid) return;
  failures.push(`${label} should be valid: ${result.issues.map((issue) => `${issue.path} ${issue.code}`).join(", ")}`);
};
const assertInvalid = (label, result, expectedCode) => {
  if (result.valid) {
    failures.push(`${label} should be invalid`);
    return;
  }
  if (expectedCode && !issueCodes(result).has(expectedCode)) {
    failures.push(`${label} should report ${expectedCode}; got ${[...issueCodes(result)].join(", ")}`);
  }
};

// Every Phase 1 entity has a representative fixture accepted by its validator.
assertValid(
  "representative definition bundle",
  validation.validateDefinitionBundle(fixtures.representativeDefinitionBundle),
);
for (const exercise of fixtures.representativeDefinitionBundle.exercises) {
  assertValid(`exercise ${exercise.id}`, validation.validateExerciseDefinition(exercise));
}
for (const graph of fixtures.representativeDefinitionBundle.graphs) {
  assertValid(`graph ${graph.id}`, validation.validateDevelopmentGraph(graph));
}
for (const capacity of fixtures.representativeDefinitionBundle.capacities) {
  assertValid(`capacity ${capacity.id}`, validation.validateCapacityDefinition(capacity));
}
for (const protocol of fixtures.representativeDefinitionBundle.benchmarkProtocols) {
  assertValid(`benchmark ${protocol.id}`, validation.validateBenchmarkProtocol(protocol));
}
for (const event of fixtures.representativeEvidenceEvents) {
  assertValid(`event ${event.id}`, validation.validateAthleteEvidenceEvent(event));
}
assertValid("athlete intent", validation.validateAthleteIntent(fixtures.representativeAthleteIntent));
assertValid("session plan", validation.validateSessionPlan(fixtures.representativeSessionPlan));
assertValid("session record", validation.validateSessionRecord(fixtures.representativeSessionRecord));
assertValid(
  "derived athlete state",
  validation.validateDerivedAthleteState(fixtures.representativeDerivedAthleteState),
);
assertValid(
  "legacy v1.2 snapshot",
  validation.validateLegacyV12CompatibilitySnapshot(fixtures.representativeLegacyV12Snapshot),
);

// Stable IDs are immutable opaque keys. The policy accepts the complete v1.2
// exercise catalogue unchanged and rejects display-like or malformed values.
assert(program.exerciseList.length === 195, `Expected the 195-exercise v1.2 baseline; found ${program.exerciseList.length}`);
const unstableLegacyIds = program.exerciseList
  .map((exercise) => exercise.id)
  .filter((id) => !contracts.isStableId(id));
assert(unstableLegacyIds.length === 0, `v1.2 IDs fail the stable-ID policy: ${unstableLegacyIds.join(", ")}`);
assert(new Set(program.exerciseList.map((exercise) => exercise.id)).size === program.exerciseList.length,
  "v1.2 exercise IDs must remain unique");
for (const malformed of ["", "Support Hold", "support/hold", "-support", "support--hold", "support-"]) {
  assert(!contracts.isStableId(malformed), `Malformed stable ID was accepted: ${JSON.stringify(malformed)}`);
}
assert(contracts.isStableId("support-hold"), "A canonical lower-kebab ID should be accepted");
assert(contracts.isStableId("a".repeat(contracts.MAX_STABLE_ID_LENGTH)),
  "A stable ID at the shared 180-character limit should be accepted");
assert(!contracts.isStableId("a".repeat(contracts.MAX_STABLE_ID_LENGTH + 1)),
  "A stable ID above the shared 180-character limit should be rejected");

for (const version of [1, 2, Number.MAX_SAFE_INTEGER]) {
  try {
    contracts.parseDefinitionVersion(version);
  } catch (error) {
    failures.push(`Valid definition version ${version} was rejected: ${error.message}`);
  }
}
for (const version of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
  let rejected = false;
  try {
    contracts.parseDefinitionVersion(version);
  } catch {
    rejected = true;
  }
  assert(rejected, `Invalid definition version ${version} was accepted`);
}

// The prerequisite language is exactly one flat allOf plus an optional flat,
// bounded anyOf. It is not a recursive rules engine.
const lSitRule = fixtures.representativeDefinitionBundle.graphs[1].nodes[1].prerequisiteRule;
assertValid("flat allOf/anyOf prerequisite", validation.validatePrerequisiteRule(lSitRule));
assertInvalid(
  "single-option anyOf",
  validation.validatePrerequisiteRule({ anyOf: [lSitRule.anyOf[0]] }),
  "prerequisite.any-of-size",
);
assertInvalid(
  "oversized anyOf",
  validation.validatePrerequisiteRule({
    anyOf: [lSitRule.anyOf[0], lSitRule.anyOf[1], lSitRule.allOf[0], {
      kind: "benchmark",
      benchmarkProtocolId: "another-benchmark",
    }, {
      kind: "benchmark",
      benchmarkProtocolId: "fifth-benchmark",
    }],
  }),
  "prerequisite.any-of-size",
);
assertInvalid(
  "nested prerequisite",
  validation.validatePrerequisiteRule({
    allOf: [{ allOf: [lSitRule.allOf[0]] }],
  }),
  "prerequisite.kind",
);
assertInvalid(
  "unknown prerequisite operator",
  validation.validatePrerequisiteRule({ allOf: [lSitRule.allOf[0]], not: lSitRule.anyOf[0] }),
  "prerequisite.nested-logic",
);
assertInvalid(
  "duplicate prerequisite",
  validation.validatePrerequisiteRule({ allOf: [lSitRule.allOf[0], lSitRule.allOf[0]] }),
  "prerequisite.duplicate",
);

// Bundle validation owns duplicate and reference integrity checks.
const duplicateBundle = structuredClone(fixtures.representativeDefinitionBundle);
duplicateBundle.exercises.push(structuredClone(duplicateBundle.exercises[0]));
assertInvalid(
  "duplicate definition ID",
  validation.validateDefinitionBundle(duplicateBundle),
  "id.duplicate",
);

const malformedVersionBundle = structuredClone(fixtures.representativeDefinitionBundle);
malformedVersionBundle.graphs[0].definitionVersion = 0;
assertInvalid(
  "malformed definition version",
  validation.validateDefinitionBundle(malformedVersionBundle),
  "number.positive-integer",
);

const malformedShapeBundle = structuredClone(fixtures.representativeDefinitionBundle);
malformedShapeBundle.graphs[0].nodes = "not-an-array";
try {
  assertInvalid(
    "malformed bundle shape",
    validation.validateDefinitionBundle(malformedShapeBundle),
    "type.array",
  );
} catch (error) {
  failures.push(`Malformed bundle validation must return issues, not throw: ${error.message}`);
}

const unresolvedBundle = structuredClone(fixtures.representativeDefinitionBundle);
unresolvedBundle.benchmarkProtocols[0].exerciseId = "missing-exercise";
assertInvalid(
  "unresolved definition reference",
  validation.validateDefinitionBundle(unresolvedBundle),
  "reference.exercise",
);

const selfRelationBundle = structuredClone(fixtures.representativeDefinitionBundle);
selfRelationBundle.exercises[1].relations[0].targetExerciseId = selfRelationBundle.exercises[1].id;
assertInvalid(
  "self-targeting exercise relation",
  validation.validateDefinitionBundle(selfRelationBundle),
  "reference.self",
);

const contradictoryBenchmarkBundle = structuredClone(fixtures.representativeDefinitionBundle);
contradictoryBenchmarkBundle.exercises[0].benchmarkProtocolIds = [
  contradictoryBenchmarkBundle.benchmarkProtocols[1].id,
];
assertInvalid(
  "contradictory reverse benchmark link",
  validation.validateDefinitionBundle(contradictoryBenchmarkBundle),
  "reference.benchmark-exercise",
);

const provisionalConfirmation = structuredClone(fixtures.representativeDefinitionBundle.benchmarkProtocols[0]);
provisionalConfirmation.confirmation.allowedSources = ["self-assessment"];
assertInvalid(
  "provisional evidence as confirmation",
  validation.validateBenchmarkProtocol(provisionalConfirmation),
  "enum.value",
);

const impossibleConfirmation = structuredClone(fixtures.representativeDefinitionBundle.benchmarkProtocols[0]);
impossibleConfirmation.confirmation.minimumDistinctSessions = 3;
impossibleConfirmation.confirmation.qualifyingObservations = 2;
assertInvalid(
  "impossible confirmation counts",
  validation.validateBenchmarkProtocol(impossibleConfirmation),
  "benchmark.confirmation-count",
);

// Planned facts and actual facts have one owner each.
const mismatchedPlan = structuredClone(fixtures.representativeSessionPlan);
mismatchedPlan.intendedDurationSeconds += 1;
assertInvalid("plan duration mismatch", validation.validateSessionPlan(mismatchedPlan), "session-plan.duration");

const unreferencedPlan = structuredClone(fixtures.representativeSessionPlan);
unreferencedPlan.definitionReferences = [];
assertInvalid("plan without definition provenance", validation.validateSessionPlan(unreferencedPlan), "reference.policy");

const ambiguousGuidedTestPlan = structuredClone(fixtures.representativeSessionPlan);
ambiguousGuidedTestPlan.items[1].purpose = "guided-test";
assertInvalid(
  "guided test without protocol",
  validation.validateSessionPlan(ambiguousGuidedTestPlan),
  "session-plan.guided-test-protocol",
);

const planWithActuals = {
  ...structuredClone(fixtures.representativeSessionPlan),
  completedAt: "2026-08-18T08:25:00.000Z",
};
assertInvalid("plan containing actuals", validation.validateSessionPlan(planWithActuals), "authority.session-plan");

const recordWithPlanFacts = {
  ...structuredClone(fixtures.representativeSessionRecord),
  intendedDurationSeconds: 600,
};
assertInvalid("record duplicating plan facts", validation.validateSessionRecord(recordWithPlanFacts), "authority.session-record");

const skippedBenchmarkRecord = structuredClone(fixtures.representativeSessionRecord);
skippedBenchmarkRecord.itemOutcomes[0].status = "skipped";
skippedBenchmarkRecord.itemOutcomes[0].participationSeconds = 0;
assertInvalid(
  "skipped item with benchmark evidence",
  validation.validateSessionRecord(skippedBenchmarkRecord),
  "session-record.benchmark-participation",
);

const intentWithRecommendation = {
  ...structuredClone(fixtures.representativeAthleteIntent),
  recommendedEmphasis: { primaryGraphId: fixtures.fixtureIds.graphs.support },
};
assertInvalid("intent containing planner recommendation", validation.validateAthleteIntent(intentWithRecommendation), "authority.intent");

const selfCorrectingEvent = structuredClone(fixtures.representativeEvidenceEvents[4]);
selfCorrectingEvent.supersedesEventId = selfCorrectingEvent.id;
assertInvalid("self-superseding evidence correction", validation.validateAthleteEvidenceEvent(selfCorrectingEvent), "reference.self");

const sessionRecordedEvent = {
  ...structuredClone(fixtures.representativeEvidenceEvents[0]),
  type: "session_recorded",
};
assertInvalid("duplicate session event authority", validation.validateAthleteEvidenceEvent(sessionRecordedEvent), "evidence.type");

const migratedAssessmentWithoutProvenance = structuredClone(fixtures.representativeEvidenceEvents[5]);
delete migratedAssessmentWithoutProvenance.legacySourceReference;
assertInvalid(
  "migrated assessment without provenance",
  validation.validateAthleteEvidenceEvent(migratedAssessmentWithoutProvenance),
  "type.non-empty-string",
);

// The Phase 1 adapter is a read-only compatibility view, not migration.
const legacyBeforeCapture = JSON.stringify(fixtures.representativeLegacyV12Profile);
const capturedAgain = legacy.captureLegacyV12CompatibilitySnapshot(fixtures.representativeLegacyV12Profile);
assert(JSON.stringify(fixtures.representativeLegacyV12Profile) === legacyBeforeCapture,
  "Capturing a legacy profile must not mutate it");
assert(capturedAgain.progressResetAt === fixtures.representativeLegacyV12Profile.progressResetAt,
  "The progressResetAt lower bound must be preserved exactly");
assert(capturedAgain.readinessClaims.G6 === true,
  "Legacy readiness must remain an explicitly named claim");
assert(!("events" in capturedAgain) && !("sessionRecords" in capturedAgain) && !("derivedAthleteState" in capturedAgain),
  "The Phase 1 adapter must not emit migrated vNext state");
assert(legacy.legacyV12CompatibilityAdapter.mode === "read-only",
  "The legacy compatibility adapter must remain read-only in Phase 1");

const mutableLegacy = structuredClone(fixtures.representativeLegacyV12Profile);
const detachedSnapshot = legacy.captureLegacyV12CompatibilitySnapshot(mutableLegacy);
mutableLegacy.readiness.G6 = false;
mutableLegacy.history[0].completedExerciseIds.push("full-lsit-attempt");
assert(detachedSnapshot.readinessClaims.G6 === true,
  "A captured legacy snapshot must not alias readiness state");
assert(!detachedSnapshot.history[0].completedExerciseIds.includes("full-lsit-attempt"),
  "A captured legacy snapshot must not alias history state");

const customSessionLegacy = structuredClone(fixtures.representativeLegacyV12Profile);
customSessionLegacy.history[0].day = 0;
assertValid(
  "legacy custom-session day",
  validation.validateLegacyV12CompatibilitySnapshot(
    legacy.captureLegacyV12CompatibilitySnapshot(customSessionLegacy),
  ),
);

assertInvalid(
  "invalid calendar timestamp",
  validation.validateAthleteIntent({
    ...structuredClone(fixtures.representativeAthleteIntent),
    updatedAt: "2026-02-31T08:05:00.000Z",
  }),
  "timestamp.iso-utc",
);

if (failures.length) {
  console.error(`vNext domain validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `vNext Phase 1 domain checks passed: ${program.exerciseList.length} legacy IDs, `
  + `${fixtures.representativeDefinitionBundle.exercises.length} representative exercises, `
  + `${fixtures.representativeEvidenceEvents.length} representative evidence events.`,
);
