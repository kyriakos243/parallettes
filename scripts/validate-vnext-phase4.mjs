import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import worker from "../profile-api/worker.js";

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
    const dependency = resolveTypeScriptModule(specifier, absolutePath);
    return loadTypeScriptModule(relative(projectRoot, dependency));
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
const persistence = loadTypeScriptModule("app/vnext/persistence/index.ts");
const legacyMigration = loadTypeScriptModule("app/vnext/persistence/legacyMigration.ts");

const bundle = definitions.vNextDefinitionBundleV1;
const policy = projection.vNextProjectionPolicyV1;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const assertRejects = async (action, pattern, message) => {
  try {
    await action();
    failures.push(message);
  } catch (error) {
    if (pattern && !pattern.test(String(error?.message ?? error))) {
      failures.push(`${message}; unexpected error: ${error?.message ?? error}`);
    }
  }
};
const canonical = persistence.canonicalJson;
const uniqueDatabaseName = (label) => `parallette25-vnext-phase4-${label}-${crypto.randomUUID()}`;
const makeStore = (label) => persistence.createVNextShadowStore({ databaseName: uniqueDatabaseName(label) });
const metadata = (exportedAt) => ({
  exportedAt,
  catalogueVersions: [bundle.catalogueVersion],
  projectionVersions: [policy.version],
  definitionFingerprints: [definitions.VNEXT_PHASE2_SEMANTIC_FINGERPRINTS[bundle.catalogueVersion]],
  policyVersions: [{ id: policy.id, version: policy.version }],
});

const protocolById = new Map(bundle.benchmarkProtocols.map((item) => [item.id, item]));
const floorPushProtocol = protocolById.get(definitions.milestoneBenchmarkId("parallette-pushing", "floor-push-up"));
if (!floorPushProtocol) throw new Error("Phase 4 fixture requires the floor push-up protocol");

let sequence = 0;
const guidedObservation = (athleteId, occurredAt, options = {}) => {
  sequence += 1;
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("event", options.id ?? `phase4-guided-${sequence}`),
    athleteId,
    occurredAt,
    recordedAt: options.recordedAt ?? occurredAt,
    source: "guided-test",
    catalogueVersion: bundle.catalogueVersion,
    type: "performance_observed",
    subject: floorPushProtocol.subject,
    outcome: options.outcome ?? "clean",
    benchmarkProtocolId: floorPushProtocol.id,
    benchmarkProtocolVersion: floorPushProtocol.definitionVersion,
    observationSessionId: contracts.parseStableId("observation-session", options.session ?? `phase4-test-${sequence}`),
    measurement: { value: options.repetitions ?? 8, unit: "repetitions" },
  };
};

const projectStored = async (store, athleteId, asOf) => {
  const sources = await store.readProjectionSources(athleteId);
  const result = projection.projectAthleteState({
    athleteId,
    asOf,
    policy,
    definitionBundles: [bundle],
    evidenceEvents: sources.evidenceEvents,
    sessionPlans: sources.sessionPlans,
    sessionRecords: sources.sessionRecords,
    intent: sources.intent,
    trainabilityRequests: [],
  });
  assert(result.ok && result.state, `Stored replay failed: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return { sources, state: result.state };
};

const legacyProfile = (athleteId, options = {}) => ({
  profileId: athleteId,
  username: options.username ?? "Phase Four Athlete",
  schemaVersion: 1,
  revision: options.revision ?? 7,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: options.updatedAt ?? "2026-02-05T12:00:00.000Z",
  ...(options.withReset === false ? {} : { progressResetAt: "2026-02-01T08:00:00.000Z" }),
  nextProgramDay: 2,
  history: options.history ?? [
    {
      id: "legacy-pre-reset", completedAt: "2026-01-20T10:00:00.000Z", day: 1,
      mode: "normal", status: "complete", seconds: 300,
      exerciseIds: ["floor-push-up"], completedExerciseIds: ["floor-push-up"],
      exerciseReviews: { "floor-push-up": { feedback: "easy", achieved: true } },
    },
    {
      id: "legacy-equal-reset", completedAt: "2026-02-01T08:00:00.000Z", day: 1,
      mode: "normal", status: "complete", seconds: 300,
      exerciseIds: ["floor-push-up"], completedExerciseIds: ["floor-push-up"],
      exerciseReviews: { "floor-push-up": { feedback: "easy", achieved: true } },
    },
    {
      id: "legacy-post-normal", completedAt: "2026-02-02T10:00:00.000Z", day: 1,
      mode: "normal", status: "complete", seconds: 300,
      exerciseIds: ["floor-push-up"], completedExerciseIds: ["floor-push-up"],
      exerciseReviews: { "floor-push-up": { feedback: "easy", achieved: true } },
    },
    {
      id: "legacy-post-practice", completedAt: "2026-02-03T10:00:00.000Z", day: 0,
      mode: "practice", status: "modified", seconds: 180,
      exerciseIds: ["floor-push-up"], completedExerciseIds: ["floor-push-up"],
      exerciseReviews: { "floor-push-up": { feedback: "easy", achieved: true } },
    },
  ],
  readiness: { G1_SUPPORT: true, G2_STALE: true, G3_FALSE: false },
  readinessUpdatedAt: {
    G1_SUPPORT: "2026-02-04T09:00:00.000Z",
    G2_STALE: "2026-01-20T09:00:00.000Z",
    G3_FALSE: "2026-02-04T09:00:00.000Z",
  },
  progression: { "floor-push-up": { cleanSessions: 2, lastFeedback: "easy" } },
  equipment: ["floor", "parallettes", "wall"],
  preferences: {
    appState: { levelsByDay: { 2: "L2" } },
    startingAssessment: {
      version: 1,
      status: "complete",
      answers: { "pushing:0": "clean", "hollow:0": "almost", "handstand-exit:0": "clean" },
      placements: {},
      appliedPlacements: {},
      updatedAt: "2026-02-04T10:00:00.000Z",
    },
  },
});

// 1. Deterministic, conservative v1.2 conversion in a separate shadow store.
const migrationAthleteId = contracts.parseStableId("athlete", "phase4-migration-athlete");
const migrationSource = legacyProfile(migrationAthleteId);
const capturedAt = "2026-02-06T00:00:00.000Z";
const conversion = await legacyMigration.convertLegacyV12Profile(migrationSource, capturedAt, bundle);
const laterCallerCapture = "2026-02-08T00:00:00.000Z";
const conversionAgain = await legacyMigration.convertLegacyV12Profile(
  structuredClone(migrationSource),
  laterCallerCapture,
  bundle,
);
assert(canonical(conversion) === canonical(conversionAgain),
  "Unchanged legacy source was not byte-deterministic across different caller capture times");
assert(conversion.snapshot.id === conversionAgain.snapshot.id
  && conversion.run.id === conversionAgain.run.id
  && conversion.run.snapshotId === conversion.snapshot.id,
"Unchanged legacy source produced redundant snapshot or run identities");
assert(conversion.snapshot.capturedAt === migrationSource.updatedAt
  && conversion.run.createdAt === migrationSource.updatedAt,
"Snapshot/run did not retain the deterministic source capture boundary");
const transportDecoratedConversion = await legacyMigration.convertLegacyV12Profile({
  ...structuredClone(migrationSource),
  accountSecured: true,
  pendingSync: true,
  lastSyncedAt: "2026-02-07T23:59:59.000Z",
  syncError: "device-local transport state",
}, laterCallerCapture, bundle);
assert(canonical(transportDecoratedConversion) === canonical(conversion)
  && !Object.hasOwn(transportDecoratedConversion.snapshot.sourceProfile, "accountSecured")
  && !Object.hasOwn(transportDecoratedConversion.snapshot.sourceProfile, "pendingSync")
  && !Object.hasOwn(transportDecoratedConversion.snapshot.sourceProfile, "lastSyncedAt")
  && !Object.hasOwn(transportDecoratedConversion.snapshot.sourceProfile, "syncError"),
"Device-local profile transport fields changed the canonical legacy migration identity");
const revisionTwoSource = {
  ...structuredClone(migrationSource),
  revision: migrationSource.revision + 1,
  updatedAt: "2026-02-07T12:00:00.000Z",
  history: [...structuredClone(migrationSource.history), {
    id: "legacy-revision-two-session",
    completedAt: "2026-02-07T10:00:00.000Z",
    day: 2,
    mode: "normal",
    status: "complete",
    seconds: 240,
    exerciseIds: ["floor-push-up"],
    completedExerciseIds: ["floor-push-up"],
    exerciseReviews: { "floor-push-up": { feedback: "right", achieved: true } },
  }],
};
const revisionTwoConversion = await legacyMigration.convertLegacyV12Profile(
  revisionTwoSource,
  "2026-02-08T00:00:00.000Z",
  bundle,
);
const immutableByLegacySession = (candidate) => new Map(candidate.sessionRecords.map((record) => [
  record.legacySource?.sourceSessionId,
  {
    plan: candidate.sessionPlans.find((plan) => plan.id === record.planId),
    record,
  },
]));
const revisionOneFacts = immutableByLegacySession(conversion);
const revisionTwoFacts = immutableByLegacySession(revisionTwoConversion);
assert([...revisionOneFacts].every(([sourceSessionId, fact]) =>
  canonical(fact) === canonical(revisionTwoFacts.get(sourceSessionId)))
  && revisionTwoConversion.run.id !== conversion.run.id
  && revisionTwoConversion.snapshot.id !== conversion.snapshot.id,
"A later source revision changed the immutable identity or payload of unchanged legacy sessions");

const claimRevisionAthleteId = contracts.parseStableId("athlete", "phase4-claim-revision-athlete");
const claimRevisionOneSource = legacyProfile(claimRevisionAthleteId, {
  withReset: false,
  revision: 20,
  updatedAt: "2026-02-10T00:00:00.000Z",
  history: [],
});
const claimRevisionTwoSource = {
  ...structuredClone(claimRevisionOneSource),
  revision: 21,
  updatedAt: "2026-02-11T00:00:00.000Z",
  readinessUpdatedAt: {
    ...structuredClone(claimRevisionOneSource.readinessUpdatedAt),
    G1_SUPPORT: "2026-02-10T12:00:00.000Z",
  },
  progression: { "floor-push-up": { cleanSessions: 1, lastFeedback: "hard" } },
  preferences: {
    ...structuredClone(claimRevisionOneSource.preferences),
    startingAssessment: {
      ...structuredClone(claimRevisionOneSource.preferences.startingAssessment),
      answers: {
        ...structuredClone(claimRevisionOneSource.preferences.startingAssessment.answers),
        "pushing:0": "almost",
      },
    },
  },
};
const [claimRevisionOne, claimRevisionTwo] = await Promise.all([
  legacyMigration.convertLegacyV12Profile(claimRevisionOneSource, "2026-02-12T00:00:00.000Z", bundle),
  legacyMigration.convertLegacyV12Profile(claimRevisionTwoSource, "2026-02-12T00:00:00.000Z", bundle),
]);
const legacyClaim = (candidate, predicate) => candidate.evidenceEvents.find(predicate);
const readinessClaim = (candidate, gate) => legacyClaim(candidate, (event) =>
  event.type === "legacy_claim_imported" && event.claim.kind === "readiness-gate"
    && event.claim.legacyGateId === gate);
const progressionClaim = (candidate) => legacyClaim(candidate, (event) =>
  event.type === "legacy_claim_imported" && event.claim.kind === "progression-hint"
    && event.claim.legacyExerciseId === "floor-push-up");
const pushingAssessment = (candidate) => legacyClaim(candidate, (event) =>
  (event.type === "performance_observed"
    && event.legacySourceReference === "preferences.startingAssessment.answers.pushing:0")
  || (event.type === "legacy_claim_imported" && event.claim.kind === "assessment-answer"
    && event.claim.legacyTrackId === "pushing"));
assert(readinessClaim(claimRevisionOne, "G2_STALE")?.id === readinessClaim(claimRevisionTwo, "G2_STALE")?.id
  && canonical(readinessClaim(claimRevisionOne, "G2_STALE"))
    === canonical(readinessClaim(claimRevisionTwo, "G2_STALE")),
"An unchanged readiness occurrence changed identity across profile revisions");
assert(readinessClaim(claimRevisionOne, "G1_SUPPORT")?.id !== readinessClaim(claimRevisionTwo, "G1_SUPPORT")?.id
  && progressionClaim(claimRevisionOne)?.id !== progressionClaim(claimRevisionTwo)?.id
  && pushingAssessment(claimRevisionOne)?.id !== pushingAssessment(claimRevisionTwo)?.id,
"A genuinely revised readiness, assessment or progression hint mutated an old immutable event ID");
assert(claimRevisionOne.sessionRecords.length === 0 && claimRevisionTwo.sessionRecords.length === 0,
"Repeated provisional legacy hints fabricated authoritative Session Records");
const combinedClaimProjection = projection.projectAthleteState({
  athleteId: claimRevisionAthleteId,
  asOf: "2026-02-12T12:00:00.000Z",
  policy,
  definitionBundles: [bundle],
  evidenceEvents: [...claimRevisionOne.evidenceEvents, ...claimRevisionTwo.evidenceEvents],
  sessionPlans: [],
  sessionRecords: [],
  intent: claimRevisionTwo.intent,
  trainabilityRequests: [],
});
assert(combinedClaimProjection.ok && combinedClaimProjection.state?.nodeStates.every((node) =>
  node.lifecycle !== "demonstrated" && node.lifecycle !== "established"),
"Repeated weak legacy hints established capability without authoritative session truth");

const untimestampedClaimSource = legacyProfile(claimRevisionAthleteId, {
  withReset: false,
  revision: 30,
  updatedAt: "2026-02-13T00:00:00.000Z",
  history: [],
});
untimestampedClaimSource.readiness = { G4_UNTIMESTAMPED: true };
untimestampedClaimSource.readinessUpdatedAt = {};
untimestampedClaimSource.progression = {
  "floor-push-up": { cleanSessions: 1, lastFeedback: "right" },
};
untimestampedClaimSource.preferences.startingAssessment = {
  version: 1,
  status: "complete",
  answers: { "pushing:0": "almost" },
  placements: {},
  appliedPlacements: {},
};
const untimestampedClaimRevision = {
  ...structuredClone(untimestampedClaimSource),
  revision: 31,
  updatedAt: "2026-02-14T00:00:00.000Z",
};
const [untimestampedClaimsOne, untimestampedClaimsTwo] = await Promise.all([
  legacyMigration.convertLegacyV12Profile(untimestampedClaimSource, "2026-02-15T00:00:00.000Z", bundle),
  legacyMigration.convertLegacyV12Profile(untimestampedClaimRevision, "2026-02-15T00:00:00.000Z", bundle),
]);
assert(canonical(untimestampedClaimsOne.evidenceEvents) === canonical(untimestampedClaimsTwo.evidenceEvents)
  && untimestampedClaimsOne.evidenceEvents.every((event) =>
    event.occurredAt === untimestampedClaimSource.createdAt && event.recordedAt === untimestampedClaimSource.createdAt),
"An unrelated profile save refreshed or changed untimestamped provisional legacy evidence");
await assertRejects(
  () => legacyMigration.convertLegacyV12Profile(
    structuredClone(migrationSource),
    "2026-02-05T11:59:59.999Z",
    bundle,
  ),
  /cannot be captured before/u,
  "Caller capture time earlier than the source boundary was accepted",
);
assert(conversion.sessionRecords.length === 2 && conversion.sessionPlans.length === 2,
  "Legacy conversion did not apply the strict reset lower bound");
assert(conversion.sessionRecords.every((record) => record.legacySource?.timingPrecision === "session-total-only"),
  "Sparse legacy timing precision was not retained");
assert(conversion.sessionRecords.flatMap((record) => record.itemOutcomes)
  .filter((outcome) => outcome.status !== "skipped")
  .every((outcome) => outcome.participationSeconds === 0 && outcome.participationBasis === "legacy-unknown"),
"Legacy conversion fabricated per-item participation time");
const practicePair = conversion.sessionPlans.find((plan) => plan.legacySource?.sourceSessionId === "legacy-post-practice");
assert(practicePair?.items.every((item) => !item.targetMilestone), "Practice history became capability evidence");
assert(!conversion.evidenceEvents.some((event) =>
  event.type === "legacy_claim_imported" && event.claim.kind === "progression-hint"),
"Untimestamped progression counters survived a reset tombstone");
assert(conversion.evidenceEvents.some((event) =>
  event.type === "legacy_claim_imported" && event.claim.kind === "readiness-gate"
    && event.claim.legacyGateId === "G1_SUPPORT"), "Post-reset readiness claim was not retained weakly");
assert(!conversion.evidenceEvents.some((event) =>
  event.type === "legacy_claim_imported" && event.claim.kind === "readiness-gate"
    && event.claim.legacyGateId === "G2_STALE"), "Pre-reset readiness claim was resurrected");
assert(conversion.evidenceEvents.filter((event) =>
  event.type === "legacy_claim_imported" && event.claim.kind === "assessment-answer").length >= 1,
"Unmappable assessment facts were not retained as generic weak claims");
assert(await legacyMigration.verifyLegacyMigrationSnapshot(conversion.snapshot), "Legacy recovery snapshot failed verification");
const recovered = await legacyMigration.recoverLegacyMigrationSnapshot(conversion.snapshot);
assert(canonical(recovered) === canonical(migrationSource), "Legacy snapshot recovery changed the source profile");
const corruptSnapshot = structuredClone(conversion.snapshot);
corruptSnapshot.sourceProfile.username = "Tampered";
assert(!await legacyMigration.verifyLegacyMigrationSnapshot(corruptSnapshot), "Corrupt legacy snapshot passed verification");

const migrationStore = makeStore("migration");
const firstMigration = await migrationStore.applyLegacyConversion(conversion);
const repeatedMigration = await migrationStore.applyLegacyConversion(conversionAgain);
assert(firstMigration.status === "inserted" && repeatedMigration.status === "duplicate",
  "Applying the same migration twice was not idempotent");

const multiRunStore = makeStore("migration-multi-owner");
await multiRunStore.applyLegacyConversion(conversion);
await multiRunStore.applyLegacyConversion(revisionTwoConversion);
const multiRunBeforeRollback = await multiRunStore.readProjectionSources(migrationAthleteId);
assert(multiRunBeforeRollback.sessionRecords.length === revisionTwoConversion.sessionRecords.length
  && new Set(multiRunBeforeRollback.sessionRecords.map((record) => record.id)).size
    === multiRunBeforeRollback.sessionRecords.length,
"Two source-revision runs duplicated or lost shared immutable session truth");
await multiRunStore.rollbackMigrationRun(
  migrationAthleteId,
  conversion.run.id,
  "2026-02-09T00:00:00.000Z",
);
const afterFirstRunRollback = await multiRunStore.readProjectionSources(migrationAthleteId);
assert(afterFirstRunRollback.sessionRecords.length === revisionTwoConversion.sessionRecords.length
  && conversion.sessionRecords.every((record) =>
    afterFirstRunRollback.sessionRecords.some((retained) => retained.id === record.id)),
"Rollback of one source-revision run deleted facts still claimed by another active run");
await multiRunStore.rollbackMigrationRun(
  migrationAthleteId,
  revisionTwoConversion.run.id,
  "2026-02-10T00:00:00.000Z",
);
const afterAllRunRollback = await multiRunStore.readProjectionSources(migrationAthleteId);
assert(afterAllRunRollback.evidenceEvents.length === 0
  && afterAllRunRollback.sessionPlans.length === 0
  && afterAllRunRollback.sessionRecords.length === 0,
"Final source-revision rollback retained converter-owned immutable truth without an active manifest");

// A device cursor can move past a shared fact before it learns the later run
// that also owns it. Offline rollback must quarantine, not destroy, that fact.
const cursorOwnerStore = makeStore("migration-cursor-owner");
await cursorOwnerStore.applyLegacyConversion(conversion);
const cursorOwnerInitialUpload = await cursorOwnerStore.readSyncUpload(migrationAthleteId, 1_000);
await cursorOwnerStore.acknowledgeSync(
  migrationAthleteId,
  cursorOwnerInitialUpload.map(({ kind, id, hash }) => ({ kind, id, hash })),
  100,
);
await cursorOwnerStore.rollbackMigrationRun(
  migrationAthleteId,
  conversion.run.id,
  "2026-02-09T00:00:00.000Z",
);
assert((await cursorOwnerStore.readProjectionSources(migrationAthleteId)).sessionRecords.length === 0,
  "An offline rollback did not immediately quarantine its unowned facts");
const cursorOwnerTerminalRun = {
  ...conversion.run,
  status: "rolled-back",
  rolledBackAt: "2026-02-09T00:00:00.000Z",
};
const cursorSyncItem = async (kind, payload, id = payload.id) => ({
  kind,
  id,
  hash: await persistence.sha256(payload),
  payload,
});
await cursorOwnerStore.applySyncDelta(migrationAthleteId, {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  cursor: 103,
  hasMore: false,
  changes: [
    await cursorSyncItem("legacy-snapshot", revisionTwoConversion.snapshot),
    await cursorSyncItem("migration-run", revisionTwoConversion.run),
    await cursorSyncItem("migration-run", cursorOwnerTerminalRun),
  ],
  acknowledged: [],
  conflicts: [],
});
await cursorOwnerStore.acknowledgeSync(migrationAthleteId, [], 103);
const cursorOwnerRestored = await cursorOwnerStore.readProjectionSources(migrationAthleteId);
assert(await cursorOwnerStore.getSyncCursor(migrationAthleteId) === 103
  && conversion.sessionRecords.every((record) =>
    cursorOwnerRestored.sessionRecords.some((candidate) => candidate.id === record.id)),
"A behind-cursor fact did not reactivate when a later active owner manifest arrived without the old payload");

// A newer remote record can depend on a converter plan whose payload sequence
// is behind this device's cursor, so rollback must retain the plan as a hidden reference.
const cursorPlanStore = makeStore("migration-cursor-plan");
await cursorPlanStore.applyLegacyConversion(conversion);
const cursorPlanInitialUpload = await cursorPlanStore.readSyncUpload(migrationAthleteId, 1_000);
await cursorPlanStore.acknowledgeSync(
  migrationAthleteId,
  cursorPlanInitialUpload.map(({ kind, id, hash }) => ({ kind, id, hash })),
  200,
);
await cursorPlanStore.rollbackMigrationRun(
  migrationAthleteId,
  conversion.run.id,
  "2026-02-09T00:00:00.000Z",
);
const retainedReferencePlan = conversion.sessionPlans[0];
const retainedReferenceRecord = conversion.sessionRecords.find((record) => record.planId === retainedReferencePlan.id);
if (!retainedReferenceRecord) throw new Error("Behind-cursor fixture requires its converter Session Record");
const newerNativeRecord = {
  ...retainedReferenceRecord,
  id: contracts.parseStableId("session-record", "phase4-behind-cursor-native-record"),
  recordedAt: "2026-02-10T00:00:00.000Z",
  supersedesRecordId: retainedReferenceRecord.id,
};
await cursorPlanStore.applySyncDelta(migrationAthleteId, {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  cursor: 201,
  hasMore: false,
  changes: [await cursorSyncItem("session-record", newerNativeRecord)],
  acknowledged: [],
  conflicts: [],
});
const cursorPlanSources = await cursorPlanStore.readProjectionSources(migrationAthleteId);
assert(cursorPlanSources.sessionRecords.some((record) => record.id === newerNativeRecord.id)
  && cursorPlanSources.sessionRecords.some((record) => record.id === newerNativeRecord.supersedesRecordId)
  && cursorPlanSources.sessionPlans.some((plan) => plan.id === retainedReferencePlan.id),
"A newer record could not attach to quarantined plan/supersession dependencies behind the cursor");
const cursorPlanExport = await cursorPlanStore.exportBundle(
  migrationAthleteId,
  metadata("2026-02-11T00:00:00.000Z"),
);
const cursorPlanImportStore = makeStore("migration-cursor-plan-import");
await cursorPlanImportStore.importBundle(JSON.parse(JSON.stringify(cursorPlanExport)));
const cursorPlanRoundTrip = await cursorPlanImportStore.readProjectionSources(migrationAthleteId);
assert(cursorPlanRoundTrip.sessionRecords.some((record) => record.id === newerNativeRecord.id)
  && cursorPlanRoundTrip.sessionRecords.some((record) => record.id === retainedReferenceRecord.id)
  && cursorPlanRoundTrip.sessionPlans.some((plan) => plan.id === retainedReferencePlan.id),
"Export/import lost a native replacement or its quarantined immutable dependencies");

// Explicit export provenance must preserve native-first truth even when a
// later migration manifest exact-deduplicates against the same stable fact.
const nativeProvenanceAthleteId = contracts.parseStableId("athlete", "phase4-native-provenance-athlete");
const nativeProvenanceEvent = guidedObservation(
  nativeProvenanceAthleteId,
  "2026-02-12T10:00:00.000Z",
  { id: "phase4-native-provenance-event", session: "phase4-native-provenance-session" },
);
const nativeProvenanceSource = legacyProfile(nativeProvenanceAthleteId, {
  withReset: false,
  revision: 8,
  updatedAt: "2026-02-12T12:00:00.000Z",
  history: [],
});
const nativeProvenanceBase = await legacyMigration.convertLegacyV12Profile(
  nativeProvenanceSource,
  "2026-02-13T00:00:00.000Z",
  bundle,
);
const nativeProvenanceConversion = {
  ...nativeProvenanceBase,
  evidenceEvents: [...nativeProvenanceBase.evidenceEvents, nativeProvenanceEvent],
  run: {
    ...nativeProvenanceBase.run,
    generatedEntities: [
      ...nativeProvenanceBase.run.generatedEntities,
      { kind: "evidence-event", id: nativeProvenanceEvent.id },
    ].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`, "en")),
  },
};
const nativeProvenanceStore = makeStore("native-provenance");
await nativeProvenanceStore.appendEvidenceEvent(nativeProvenanceEvent);
await nativeProvenanceStore.applyLegacyConversion(nativeProvenanceConversion);
const nativeProvenanceExport = await nativeProvenanceStore.exportBundle(
  nativeProvenanceAthleteId,
  metadata("2026-02-13T01:00:00.000Z"),
);
assert(nativeProvenanceExport.immutableEntityProvenance.some((entry) =>
  entry.kind === "evidence-event" && entry.id === nativeProvenanceEvent.id && entry.origin === "native"),
"Export reclassified native-first immutable truth as converter-owned");
const nativeProvenanceImportStore = makeStore("native-provenance-import");
await nativeProvenanceImportStore.importBundle(JSON.parse(JSON.stringify(nativeProvenanceExport)));
await nativeProvenanceImportStore.rollbackMigrationRun(
  nativeProvenanceAthleteId,
  nativeProvenanceConversion.run.id,
  "2026-02-14T00:00:00.000Z",
);
assert((await nativeProvenanceImportStore.readProjectionSources(nativeProvenanceAthleteId))
  .evidenceEvents.some((event) => event.id === nativeProvenanceEvent.id),
"Export/import changed native-first provenance so migration rollback hid the fact");
const migratedReplay = await projectStored(migrationStore, migrationAthleteId, "2026-02-06T12:00:00.000Z");
const migratedFloorPush = migratedReplay.state?.nodeStates.find((item) =>
  item.milestone.graphId === "parallette-pushing" && item.milestone.nodeId === "floor-push-up");
assert(migratedFloorPush?.lifecycle === "developing",
  "Sparse reviewed history was promoted beyond conservative Developing evidence");
assert(migratedReplay.state?.recentLoad.exposures.length === 2,
  "Normal and Practice history were not both retained as single load/history exposures");

// A native guided observation appends offline, replays once, and invalidates cache.
const offlineEvent = guidedObservation(migrationAthleteId, "2026-02-06T10:00:00.000Z", {
  id: "phase4-offline-guided", session: "phase4-offline-test",
});
assert((await migrationStore.appendEvidenceEvent(offlineEvent)).status === "inserted",
  "Offline Evidence Event was not appended");
assert((await migrationStore.appendEvidenceEvent(structuredClone(offlineEvent))).status === "duplicate",
  "Exact duplicate Evidence Event was not collapsed");
const offlineReplay = await projectStored(migrationStore, migrationAthleteId, "2026-02-06T12:00:00.000Z");
assert(offlineReplay.sources.evidenceEvents.filter((event) => event.id === offlineEvent.id).length === 1,
  "Offline replay contains duplicate observation truth");
await assertRejects(
  () => migrationStore.appendEvidenceEvent({ ...offlineEvent, outcome: "not-yet" }),
  /immutable-id-conflict/u,
  "Divergent payload with one Evidence Event ID was accepted",
);

const cacheEntry = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  athleteId: migrationAthleteId,
  asOf: offlineReplay.state.asOf,
  projectionVersion: policy.version,
  catalogueVersion: bundle.catalogueVersion,
  definitionFingerprint: definitions.VNEXT_PHASE2_SEMANTIC_FINGERPRINTS[bundle.catalogueVersion],
  policyId: policy.id,
  policyVersion: policy.version,
  sourceFingerprint: offlineReplay.sources.sourceFingerprint,
  trainabilityRequestFingerprint: "1".repeat(64),
  resetAt: offlineReplay.sources.resetTombstone?.resetAt,
  storedAt: "2026-02-06T12:00:00.000Z",
  state: offlineReplay.state,
};
const cacheLookup = {
  athleteId: cacheEntry.athleteId,
  asOf: cacheEntry.asOf,
  projectionVersion: cacheEntry.projectionVersion,
  catalogueVersion: cacheEntry.catalogueVersion,
  definitionFingerprint: cacheEntry.definitionFingerprint,
  policyId: cacheEntry.policyId,
  policyVersion: cacheEntry.policyVersion,
  sourceFingerprint: cacheEntry.sourceFingerprint,
  trainabilityRequestFingerprint: cacheEntry.trainabilityRequestFingerprint,
  resetAt: cacheEntry.resetAt,
};
await migrationStore.putDerivedCache(cacheEntry);
assert(await migrationStore.getDerivedCache(cacheLookup),
  "Matching Derived Athlete State cache was not reusable");
assert(await migrationStore.getDerivedCache({
  ...cacheLookup,
  asOf: "2026-05-06T12:00:00.000Z",
}) === null, "Time-sensitive Derived Athlete State cache crossed its exact projection cutoff");
assert(await migrationStore.getDerivedCache({
  ...cacheLookup,
  policyVersion: cacheLookup.policyVersion + 1,
}) === null, "Derived Athlete State cache crossed its policy identity");
assert(await migrationStore.getDerivedCache({
  ...cacheLookup,
  definitionFingerprint: "0".repeat(64),
}) === null, "Derived Athlete State cache crossed its definition identity");
assert(await migrationStore.getDerivedCache({
  ...cacheLookup,
  trainabilityRequestFingerprint: "2".repeat(64),
}) === null, "Derived Athlete State cache crossed its trainability-request identity");
await assertRejects(
  () => migrationStore.putDerivedCache({ ...cacheEntry, asOf: "2026-02-06T11:59:59.000Z" }),
  /projection identity/u,
  "Cache entry whose state used a different projection cutoff was accepted",
);
const cacheInvalidator = guidedObservation(migrationAthleteId, "2026-02-06T11:00:00.000Z", {
  id: "phase4-cache-invalidator", session: "phase4-cache-test",
});
await migrationStore.appendEvidenceEvent(cacheInvalidator);
assert(await migrationStore.getDerivedCache(cacheLookup) === null,
  "Raw observation append did not invalidate the rebuildable projection cache");

// 2. Reset-first JSON export/import is atomic and idempotent; caches and auth never leave the device.
const exportAt = "2026-02-06T13:00:00.000Z";
const exported = await migrationStore.exportBundle(migrationAthleteId, metadata(exportAt));
const exportedJson = JSON.stringify(exported);
assert(!exportedJson.includes("derived-cache") && !exportedJson.includes("authorization")
  && !exportedJson.includes("passwordHash") && !exportedJson.includes("tokenHash"),
"Observation export leaked cache or authentication material");
const importStore = makeStore("import");
const importedOnce = await importStore.importBundle(JSON.parse(exportedJson));
const importedTwice = await importStore.importBundle(JSON.parse(exportedJson));
assert(importedOnce.inserted > 0 && importedTwice.inserted === 0,
  "Observation export/import round trip was not idempotent");
const importedSources = await importStore.readProjectionSources(migrationAthleteId);
const exportedActiveIds = {
  events: exported.evidenceEvents.map((item) => item.id).sort(),
  plans: exported.sessionPlans.map((item) => item.id).sort(),
  records: exported.sessionRecords.map((item) => item.id).sort(),
};
assert(canonical({
  events: importedSources.evidenceEvents.map((item) => item.id).sort(),
  plans: importedSources.sessionPlans.map((item) => item.id).sort(),
  records: importedSources.sessionRecords.map((item) => item.id).sort(),
}) === canonical(exportedActiveIds), "Observation export/import changed active replay sources");

const malformedImportStore = makeStore("malformed-import");
const wrongBoundaryBundle = JSON.parse(exportedJson);
wrongBoundaryBundle.migrationSnapshots[0].capturedAt = "2026-02-05T12:00:01.000Z";
await assertRejects(
  () => malformedImportStore.importBundle(wrongBoundaryBundle),
  /snapshot failed deterministic identity/u,
  "Import accepted a self-hashed snapshot with a false deterministic capture boundary",
);
const wrongRunSnapshotBundle = JSON.parse(exportedJson);
wrongRunSnapshotBundle.migrationRuns[0].sourceFingerprint = "0".repeat(64);
wrongRunSnapshotBundle.migrationRuns[0].id = `legacy-v12-run-${await persistence.sha256({
  converterVersion: wrongRunSnapshotBundle.migrationRuns[0].converterVersion,
  sourceIdentity: `${migrationAthleteId}\u0000${wrongRunSnapshotBundle.migrationRuns[0].sourceFingerprint}`,
})}`;
wrongRunSnapshotBundle.intentMigrationRunId = wrongRunSnapshotBundle.migrationRuns[0].id;
await assertRejects(
  () => malformedImportStore.importBundle(wrongRunSnapshotBundle),
  /invalid-reference/u,
  "Import accepted a migration run whose source fingerprint did not match its snapshot",
);
const forgedRunIdBundle = JSON.parse(exportedJson);
forgedRunIdBundle.migrationRuns[0].id = "legacy-v12-run-forged-but-stable";
await assertRejects(
  () => malformedImportStore.importBundle(forgedRunIdBundle),
  /deterministic source identity/u,
  "Import accepted a migration run ID not derived from its canonical source identity",
);
const missingProvenanceBundle = JSON.parse(exportedJson);
missingProvenanceBundle.immutableEntityProvenance.pop();
await assertRejects(
  () => malformedImportStore.importBundle(missingProvenanceBundle),
  /Missing immutable provenance/u,
  "Import accepted incomplete immutable entity provenance coverage",
);
const malformedProvenanceBundle = JSON.parse(exportedJson);
const malformedLegacyProvenance = malformedProvenanceBundle.immutableEntityProvenance
  .find(({ origin }) => origin === "legacy-v1.2");
if (!malformedLegacyProvenance) throw new Error("Malformed provenance fixture requires a migrated immutable entity");
malformedLegacyProvenance.migrationRunId = "legacy-v12-run-unrelated";
await assertRejects(
  () => malformedImportStore.importBundle(malformedProvenanceBundle),
  /not claimed by its migration run/u,
  "Import accepted immutable provenance not claimed by its referenced migration run",
);
const nonCanonicalResetBundle = JSON.parse(exportedJson);
nonCanonicalResetBundle.resetTombstone.resetAt = "2026-02-01";
await assertRejects(
  () => malformedImportStore.importBundle(nonCanonicalResetBundle),
  /reset timestamp/u,
  "Import accepted a non-canonical reset cutoff",
);
const unknownSnapshotFieldBundle = JSON.parse(exportedJson);
unknownSnapshotFieldBundle.migrationSnapshots[0].token = "must-never-persist";
await assertRejects(
  () => malformedImportStore.importBundle(unknownSnapshotFieldBundle),
  /unsupported field token/u,
  "Import accepted an unknown credential-like field on a legacy snapshot",
);
const unknownRunFieldBundle = JSON.parse(exportedJson);
unknownRunFieldBundle.migrationRuns[0].password = "must-never-persist";
await assertRejects(
  () => malformedImportStore.importBundle(unknownRunFieldBundle),
  /unsupported field password/u,
  "Import accepted an unknown credential-like field on a migration run",
);
const unknownResetFieldBundle = JSON.parse(exportedJson);
unknownResetFieldBundle.resetTombstone.tokenHash = "must-never-persist";
await assertRejects(
  () => malformedImportStore.importBundle(unknownResetFieldBundle),
  /unsupported field tokenHash/u,
  "Import accepted an unknown credential-like field on a reset tombstone",
);
await assertRejects(
  () => malformedImportStore.applyProgressReset({
    schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
    id: "a".repeat(181),
    athleteId: migrationAthleteId,
    resetAt: "2026-02-07T00:00:00.000Z",
    recordedAt: "2026-02-07T00:00:01.000Z",
    source: "athlete-reset",
  }),
  /reset ID/u,
  "Local persistence accepted a stable ID above the shared 180-character limit",
);
await assertRejects(
  () => malformedImportStore.applyProgressReset({
    schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
    id: "phase4-backdated-reset",
    athleteId: migrationAthleteId,
    resetAt: "2026-02-07T00:00:01.000Z",
    recordedAt: "2026-02-07T00:00:00.000Z",
    source: "athlete-reset",
  }),
  /cannot predate/u,
  "Local persistence accepted a reset recorded before its cutoff",
);

const malformedSyncStore = makeStore("malformed-sync");
const credentialBearingSnapshot = structuredClone(conversion.snapshot);
credentialBearingSnapshot.sourceProfile.preferences = {
  ...credentialBearingSnapshot.sourceProfile.preferences,
  nestedSessionMetadata: { "Access Token": "must-never-persist" },
};
const credentialBearingSnapshotHash = await persistence.sha256(credentialBearingSnapshot);
await assertRejects(
  () => malformedSyncStore.applySyncDelta(migrationAthleteId, {
    schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
    cursor: 1,
    hasMore: false,
    changes: [{
      kind: "legacy-snapshot",
      id: credentialBearingSnapshot.id,
      hash: credentialBearingSnapshotHash,
      payload: credentialBearingSnapshot,
    }],
    acknowledged: [],
    conflicts: [],
  }),
  /forbidden credential or session metadata/u,
  "Sync accepted recursively nested credential-like snapshot metadata",
);
await malformedSyncStore.applySyncDelta(migrationAthleteId, {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  cursor: 1,
  hasMore: false,
  changes: [{
    kind: "legacy-snapshot",
    id: conversion.snapshot.id,
    hash: await persistence.sha256(conversion.snapshot),
    payload: conversion.snapshot,
  }],
  acknowledged: [],
  conflicts: [],
});
const mismatchedSyncRun = {
  ...structuredClone(conversion.run),
  sourceFingerprint: "0".repeat(64),
};
mismatchedSyncRun.id = `legacy-v12-run-${await persistence.sha256({
  converterVersion: mismatchedSyncRun.converterVersion,
  sourceIdentity: `${migrationAthleteId}\u0000${mismatchedSyncRun.sourceFingerprint}`,
})}`;
const mismatchedSyncRunHash = await persistence.sha256(mismatchedSyncRun);
await assertRejects(
  () => malformedSyncStore.applySyncDelta(migrationAthleteId, {
    schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
    cursor: 2,
    hasMore: false,
    changes: [{
      kind: "migration-run",
      id: mismatchedSyncRun.id,
      hash: mismatchedSyncRunHash,
      payload: mismatchedSyncRun,
    }],
    acknowledged: [],
    conflicts: [],
  }),
  /invalid-reference/u,
  "Sync accepted a migration run whose source fingerprint did not match its stored snapshot",
);
const forgedSyncRun = {
  ...structuredClone(conversion.run),
  id: "legacy-v12-run-forged-sync-stable",
};
const forgedSyncRunHash = await persistence.sha256(forgedSyncRun);
await assertRejects(
  () => malformedSyncStore.applySyncDelta(migrationAthleteId, {
    schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
    cursor: 3,
    hasMore: false,
    changes: [{
      kind: "migration-run",
      id: forgedSyncRun.id,
      hash: forgedSyncRunHash,
      payload: forgedSyncRun,
    }],
    acknowledged: [],
    conflicts: [],
  }),
  /deterministic source identity/u,
  "Sync accepted a migration run ID not derived from its canonical source identity",
);

// 3. Rollback removes only converter-owned projections, retains exact recovery and native facts.
await migrationStore.rollbackMigrationRun(migrationAthleteId, conversion.run.id, "2026-02-07T00:00:00.000Z");
const afterRollback = await migrationStore.readProjectionSources(migrationAthleteId);
assert(afterRollback.sessionRecords.length === 0 && afterRollback.sessionPlans.length === 0,
  "Legacy rollback retained converter-owned Session Records");
assert(afterRollback.evidenceEvents.map((event) => event.id).sort().join(",")
  === [cacheInvalidator.id, offlineEvent.id].sort().join(","),
"Legacy rollback deleted native observations or retained converter-owned evidence");
assert(afterRollback.resetTombstone?.resetAt === migrationSource.progressResetAt,
  "Legacy rollback removed the authoritative reset lower bound");
const rollbackExport = await migrationStore.exportBundle(migrationAthleteId, metadata("2026-02-07T01:00:00.000Z"));
assert(rollbackExport.migrationSnapshots.length === 1
  && rollbackExport.migrationRuns[0]?.status === "rolled-back",
"Legacy rollback did not retain its recovery snapshot and revocation receipt");
assert(canonical(await legacyMigration.recoverLegacyMigrationSnapshot(rollbackExport.migrationSnapshots[0]))
  === canonical(migrationSource), "Rollback recovery snapshot did not restore the exact legacy source");

const resetStore = makeStore("reset-import");
await resetStore.importBundle(JSON.parse(exportedJson));
const newerReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: "phase4-newer-reset",
  athleteId: migrationAthleteId,
  resetAt: "2026-02-06T11:00:00.000Z",
  recordedAt: "2026-02-06T11:00:01.000Z",
  source: "athlete-reset",
};
await resetStore.applyProgressReset(newerReset);
await resetStore.importBundle(JSON.parse(exportedJson));
const resetSources = await resetStore.readProjectionSources(migrationAthleteId);
assert(resetSources.resetTombstone?.resetAt === newerReset.resetAt,
  "An older imported reset replaced the newer local tombstone");
assert(resetSources.evidenceEvents.every((event) => Date.parse(event.occurredAt) > Date.parse(newerReset.resetAt))
  && resetSources.sessionRecords.every((record) => Date.parse(record.completedAt) > Date.parse(newerReset.resetAt)),
"Import resurrected observations at or before progressResetAt");

const localResetCascadeAthleteId = contracts.parseStableId("athlete", "phase4-local-reset-cascade-athlete");
const localResetCascadeStore = makeStore("local-reset-cascade");
const localResetCascadeTargetEvent = guidedObservation(
  localResetCascadeAthleteId,
  "2026-02-15T10:00:00.000Z",
  { id: "phase4-reset-cascade-target", session: "phase4-reset-cascade-target" },
);
const localResetCascadeCorrection = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase4-reset-cascade-correction"),
  athleteId: localResetCascadeAthleteId,
  occurredAt: "2026-02-17T10:00:00.000Z",
  recordedAt: "2026-02-17T10:00:00.000Z",
  catalogueVersion: bundle.catalogueVersion,
  source: "correction",
  type: "evidence_corrected",
  supersedesEventId: localResetCascadeTargetEvent.id,
  reason: "Reset dependency cascade regression.",
};
await localResetCascadeStore.appendEvidenceEvent(localResetCascadeTargetEvent);
await localResetCascadeStore.appendEvidenceEvent(localResetCascadeCorrection);
const localResetCascadePlan = {
  ...structuredClone(conversion.sessionPlans[0]),
  id: contracts.parseStableId("session-plan", "phase4-reset-cascade-plan"),
  athleteId: localResetCascadeAthleteId,
  createdAt: "2026-02-15T09:00:00.000Z",
};
const localResetCascadeTargetRecord = {
  ...structuredClone(conversion.sessionRecords[0]),
  id: contracts.parseStableId("session-record", "phase4-reset-cascade-target-record"),
  athleteId: localResetCascadeAthleteId,
  planId: localResetCascadePlan.id,
  startedAt: "2026-02-15T09:30:00.000Z",
  completedAt: "2026-02-15T10:00:00.000Z",
  recordedAt: "2026-02-15T10:00:00.000Z",
};
const localResetCascadeReplacement = {
  ...structuredClone(localResetCascadeTargetRecord),
  id: contracts.parseStableId("session-record", "phase4-reset-cascade-replacement"),
  startedAt: "2026-02-17T09:30:00.000Z",
  completedAt: "2026-02-17T10:00:00.000Z",
  recordedAt: "2026-02-17T10:00:00.000Z",
  supersedesRecordId: localResetCascadeTargetRecord.id,
};
await localResetCascadeStore.appendSession(localResetCascadePlan, localResetCascadeTargetRecord);
await localResetCascadeStore.appendSession(localResetCascadePlan, localResetCascadeReplacement);
await localResetCascadeStore.applyProgressReset({
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase4-reset-cascade"),
  athleteId: localResetCascadeAthleteId,
  resetAt: "2026-02-16T00:00:00.000Z",
  recordedAt: "2026-02-16T00:00:00.000Z",
  source: "athlete-reset",
});
const localResetCascadeSources = await localResetCascadeStore.readProjectionSources(localResetCascadeAthleteId);
const localResetCascadeOutbox = await localResetCascadeStore.readSyncUpload(localResetCascadeAthleteId, 100);
assert(localResetCascadeSources.evidenceEvents.length === 0
  && localResetCascadeSources.sessionRecords.length === 0
  && localResetCascadeSources.sessionPlans.length === 0
  && localResetCascadeOutbox.every(({ kind }) => kind === "reset-tombstone" || kind === "session-plan"),
"Reset retained a post-cutoff correction/replacement whose required target had been purged");
const { supersedesRecordId: _discardedResetTarget, ...localResetPostCutoffBase } = localResetCascadeReplacement;
const localResetPostCutoffRecord = {
  ...localResetPostCutoffBase,
  id: contracts.parseStableId("session-record", "phase4-reset-cascade-post-cutoff"),
  startedAt: "2026-02-18T09:30:00.000Z",
  completedAt: "2026-02-18T10:00:00.000Z",
  recordedAt: "2026-02-18T10:00:00.000Z",
};
await localResetCascadeStore.appendSession(localResetCascadePlan, localResetPostCutoffRecord);
const localResetReuseSources = await localResetCascadeStore.readProjectionSources(localResetCascadeAthleteId);
const localResetReuseOutbox = await localResetCascadeStore.readSyncUpload(localResetCascadeAthleteId, 100);
const localResetPlanPosition = localResetReuseOutbox.findIndex(({ kind, id }) =>
  kind === "session-plan" && id === localResetCascadePlan.id);
const localResetRecordPosition = localResetReuseOutbox.findIndex(({ kind, id }) =>
  kind === "session-record" && id === localResetPostCutoffRecord.id);
assert(localResetReuseSources.sessionRecords.length === 1
  && localResetReuseSources.sessionPlans.length === 1
  && localResetPlanPosition >= 0
  && localResetRecordPosition > localResetPlanPosition,
"Reset lost or misordered an unsynced plan later reused by a valid post-cutoff record");

// 4. A maximum retained v1.2 history converts and uploads in bounded pages.
const sizeAthleteId = contracts.parseStableId("athlete", "phase4-size-athlete");
const sizeHistory = Array.from({ length: 500 }, (_, index) => {
  const completedAt = new Date(Date.parse("2026-03-01T00:00:00.000Z") + index * 60_000).toISOString();
  return {
    id: `size-session-${index + 1}`,
    completedAt,
    day: (index % 5) + 1,
    mode: index % 10 === 0 ? "practice" : "normal",
    status: "complete",
    seconds: 300,
    exerciseIds: ["floor-push-up"],
    completedExerciseIds: ["floor-push-up"],
    exerciseReviews: { "floor-push-up": { feedback: "right", achieved: false } },
  };
});
const sizeProfile = legacyProfile(sizeAthleteId, {
  withReset: false,
  revision: 500,
  updatedAt: "2026-03-02T00:00:00.000Z",
  history: sizeHistory,
});
assert(new TextEncoder().encode(JSON.stringify(sizeProfile)).byteLength < 750_000,
  "500-session legacy fixture exceeds the current bounded profile request size");
const sizeConversion = await legacyMigration.convertLegacyV12Profile(
  sizeProfile,
  "2026-03-03T00:00:00.000Z",
  bundle,
);
assert(sizeConversion.sessionRecords.length === 500 && sizeConversion.sessionPlans.length === 500,
  "500-session legacy conversion lost usable history");
const sizeStore = makeStore("size");
await sizeStore.applyLegacyConversion(sizeConversion);
const requestSizes = [];
let syntheticCursor = 0;
const sizeSummary = await persistence.syncObservationDeltas(
  sizeStore,
  sizeAthleteId,
  async (request) => {
    requestSizes.push(new TextEncoder().encode(JSON.stringify(request)).byteLength);
    syntheticCursor += request.upload.length;
    return {
      schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
      cursor: syntheticCursor,
      hasMore: false,
      changes: [],
      acknowledged: request.upload.map(({ kind, id }) => ({ kind, id, status: "inserted" })),
      conflicts: [],
    };
  },
  { pageSize: 40, maximumRequestBytes: 600_000 },
);
assert(sizeSummary.uploaded >= 1_003 && sizeSummary.pages > 20,
  "Large profile did not exercise bounded multi-page observation upload");
assert(requestSizes.every((size) => size <= 600_000), "A sync page exceeded the client request-size bound");

// A valid profile close to the unchanged v1.2 request ceiling must still move
// its exact snapshot as one bounded shadow item rather than blocking the FIFO.
const nearLimitAthleteId = contracts.parseStableId("athlete", "phase4-near-limit-athlete");
const nearLimitProfile = legacyProfile(nearLimitAthleteId, {
  withReset: false,
  revision: 501,
  updatedAt: "2026-03-04T00:00:00.000Z",
  history: [],
});
nearLimitProfile.preferences = { exactLegacyPayload: "x".repeat(720_000) };
nearLimitProfile.pendingSync = true;
nearLimitProfile.lastSyncedAt = "2026-03-04T01:00:00.000Z";
const nearLimitSourceBytes = new TextEncoder().encode(JSON.stringify(nearLimitProfile)).byteLength;
assert(nearLimitSourceBytes > 700_000 && nearLimitSourceBytes < 750_000,
  "Near-limit fixture does not exercise the live v1.2 request boundary");
const nearLimitConversion = await legacyMigration.convertLegacyV12Profile(
  nearLimitProfile,
  "2026-03-05T00:00:00.000Z",
  bundle,
);
assert(!Object.hasOwn(nearLimitConversion.snapshot.sourceProfile, "pendingSync")
  && !Object.hasOwn(nearLimitConversion.snapshot.sourceProfile, "lastSyncedAt"),
"Near-limit recovery snapshot retained device-local transport metadata");
const nearLimitStore = makeStore("near-limit");
await nearLimitStore.applyLegacyConversion(nearLimitConversion);
const nearLimitRequestSizes = [];
let nearLimitCursor = 0;
const nearLimitSummary = await persistence.syncObservationDeltas(
  nearLimitStore,
  nearLimitAthleteId,
  async (request) => {
    nearLimitRequestSizes.push(new TextEncoder().encode(JSON.stringify(request)).byteLength);
    nearLimitCursor += request.upload.length;
    return {
      schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
      cursor: nearLimitCursor,
      hasMore: false,
      changes: [],
      acknowledged: request.upload.map(({ kind, id }) => ({ kind, id, status: "inserted" })),
      conflicts: [],
    };
  },
  { pageSize: 40 },
);
assert(nearLimitSummary.uploaded >= 3
  && nearLimitRequestSizes.some((size) => size > 600_000)
  && nearLimitRequestSizes.every((size) => size <= 1_400_000),
"A near-limit exact legacy snapshot head-of-line blocked the bounded shadow outbox");

// Pending reference targets must precede their corrections across the fixed
// eight-item upload boundary; otherwise one invalid batch blocks the target.
const dependencyAthleteId = contracts.parseStableId("athlete", "phase4-dependency-athlete");
const dependencyStore = makeStore("dependency-order");
const dependencyPlan = structuredClone(conversion.sessionPlans[0]);
dependencyPlan.id = contracts.parseStableId("session-plan", "phase4-dependency-plan");
dependencyPlan.athleteId = dependencyAthleteId;
dependencyPlan.createdAt = "2026-04-01T09:00:00.000Z";
dependencyPlan.legacySource = {
  ...dependencyPlan.legacySource,
  sourceSessionId: "phase4-dependency-source",
};
const dependencyRecord = (id, completedAt, supersedesRecordId) => ({
  ...structuredClone(conversion.sessionRecords[0]),
  id: contracts.parseStableId("session-record", id),
  athleteId: dependencyAthleteId,
  planId: dependencyPlan.id,
  startedAt: completedAt,
  completedAt,
  recordedAt: completedAt,
  legacySource: dependencyPlan.legacySource,
  ...(supersedesRecordId ? { supersedesRecordId } : {}),
});
const dependencyRecordTarget = dependencyRecord(
  "z-phase4-record-target",
  "2026-04-01T10:00:00.000Z",
);
await dependencyStore.appendSession(dependencyPlan, dependencyRecordTarget);
for (let index = 1; index <= 7; index += 1) {
  const completedAt = new Date(Date.parse("2026-04-01T10:01:00.000Z") + index * 1_000).toISOString();
  const fillerPlan = {
    ...structuredClone(dependencyPlan),
    id: contracts.parseStableId("session-plan", `phase4-dependency-plan-${index}`),
    legacySource: {
      ...dependencyPlan.legacySource,
      sourceSessionId: `phase4-dependency-source-${index}`,
    },
  };
  await dependencyStore.appendSession(
    fillerPlan,
    {
      ...dependencyRecord(`b-phase4-record-${index}`, completedAt),
      planId: fillerPlan.id,
      legacySource: fillerPlan.legacySource,
    },
  );
}
const dependencyRecordReplacement = dependencyRecord(
  "a-phase4-record-replacement",
  "2026-04-01T10:10:00.000Z",
  dependencyRecordTarget.id,
);
await dependencyStore.appendSession(dependencyPlan, dependencyRecordReplacement);

const dependencyEventBase = (id, occurredAt) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", id),
  athleteId: dependencyAthleteId,
  occurredAt,
  recordedAt: occurredAt,
  catalogueVersion: bundle.catalogueVersion,
});
const focusedImportBundle = (athleteId, evidenceEvents, sessionPlans = [], sessionRecords = []) => ({
  format: "parallette25-vnext-observations",
  formatVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  athleteId,
  ...metadata("2026-04-01T12:00:00.000Z"),
  evidenceEvents,
  sessionPlans,
  sessionRecords,
  immutableEntityProvenance: [
    ...evidenceEvents.map(({ id }) => ({ kind: "evidence-event", id, origin: "native" })),
    ...sessionPlans.map(({ id }) => ({ kind: "session-plan", id, origin: "native" })),
    ...sessionRecords.map(({ id }) => ({ kind: "session-record", id, origin: "native" })),
  ],
  migrationSnapshots: [],
  migrationRuns: [],
});

const orphanAthleteId = contracts.parseStableId("athlete", "phase4-orphan-athlete");
const orphanStore = makeStore("dependency-orphan");
const orphanCorrection = {
  ...dependencyEventBase("phase4-orphan-correction", "2026-04-01T09:30:00.000Z"),
  athleteId: orphanAthleteId,
  source: "correction",
  type: "evidence_corrected",
  supersedesEventId: contracts.parseStableId("event", "phase4-missing-event"),
  reason: "Missing-target poison-outbox regression.",
};
await assertRejects(
  () => orphanStore.appendEvidenceEvent(orphanCorrection),
  /invalid-reference/u,
  "Offline append accepted a correction whose target was absent",
);
const orphanPlan = {
  ...structuredClone(dependencyPlan),
  id: contracts.parseStableId("session-plan", "phase4-orphan-plan"),
  athleteId: orphanAthleteId,
};
const orphanReplacement = {
  ...structuredClone(dependencyRecordTarget),
  id: contracts.parseStableId("session-record", "phase4-orphan-replacement"),
  athleteId: orphanAthleteId,
  planId: orphanPlan.id,
  supersedesRecordId: contracts.parseStableId("session-record", "phase4-missing-record"),
};
await assertRejects(
  () => orphanStore.appendSession(orphanPlan, orphanReplacement),
  /invalid-reference/u,
  "Offline append accepted a replacement Session Record whose target was absent",
);
const orphanClearance = {
  ...dependencyEventBase("phase4-orphan-clearance", "2026-04-01T09:31:00.000Z"),
  athleteId: orphanAthleteId,
  source: "athlete-report",
  type: "restriction_cleared",
  restrictionEventId: contracts.parseStableId("event", "phase4-missing-restriction"),
};
await assertRejects(
  () => orphanStore.importBundle(focusedImportBundle(orphanAthleteId, [orphanClearance])),
  /invalid-reference/u,
  "Import accepted a restriction clearance whose target was absent",
);
const restrictionTarget = {
  ...dependencyEventBase("z-phase4-restriction-target", "2026-04-01T11:00:00.000Z"),
  source: "athlete-report",
  type: "restriction_reported",
  severity: "modify",
  demandDomains: ["hand-wrist-bearing"],
  bodyRegions: ["wrist"],
};
const restrictionClearance = {
  ...dependencyEventBase("a-phase4-restriction-clearance", "2026-04-01T11:01:00.000Z"),
  source: "athlete-report",
  type: "restriction_cleared",
  restrictionEventId: restrictionTarget.id,
};
const correctionTarget = guidedObservation(dependencyAthleteId, "2026-04-01T11:02:00.000Z", {
  id: "z-phase4-correction-target",
  session: "phase4-dependency-correction-target",
});
const evidenceCorrection = {
  ...dependencyEventBase("a-phase4-evidence-correction", "2026-04-01T11:03:00.000Z"),
  source: "correction",
  type: "evidence_corrected",
  supersedesEventId: correctionTarget.id,
  reason: "Corrected during the dependency-order regression.",
};
for (let index = 1; index <= 6; index += 1) {
  await dependencyStore.appendEvidenceEvent(guidedObservation(
    dependencyAthleteId,
    new Date(Date.parse("2026-04-01T11:04:00.000Z") + index * 1_000).toISOString(),
    { id: `b-phase4-evidence-${index}`, session: `phase4-dependency-evidence-${index}` },
  ));
}
await dependencyStore.appendEvidenceEvent(restrictionTarget);
await dependencyStore.appendEvidenceEvent(restrictionClearance);
await dependencyStore.appendEvidenceEvent(correctionTarget);
await dependencyStore.appendEvidenceEvent(evidenceCorrection);

const dependencyRemote = {
  plans: new Set(),
  records: new Set(),
  events: new Set(),
  cursor: 0,
  batches: [],
};
const dependencySummary = await persistence.syncObservationDeltas(
  dependencyStore,
  dependencyAthleteId,
  async (request) => {
    dependencyRemote.batches.push(request.upload.map(({ kind, id }) => `${kind}:${id}`));
    const incomingPlans = new Set(request.upload.filter(({ kind }) => kind === "session-plan").map(({ id }) => id));
    const incomingRecords = new Set(request.upload.filter(({ kind }) => kind === "session-record").map(({ id }) => id));
    const incomingEvents = new Set(request.upload.filter(({ kind }) => kind === "evidence-event").map(({ id }) => id));
    const conflicts = [];
    for (const item of request.upload) {
      if (item.kind === "session-record") {
        if (!dependencyRemote.plans.has(item.payload.planId) && !incomingPlans.has(item.payload.planId)) {
          conflicts.push({ kind: item.kind, id: item.id, reason: "invalid-reference" });
        }
        if (item.payload.supersedesRecordId
          && !dependencyRemote.records.has(item.payload.supersedesRecordId)
          && !incomingRecords.has(item.payload.supersedesRecordId)) {
          conflicts.push({ kind: item.kind, id: item.id, reason: "invalid-reference" });
        }
      }
      if (item.kind === "evidence-event") {
        const targetId = item.payload.type === "evidence_corrected"
          ? item.payload.supersedesEventId
          : item.payload.type === "restriction_cleared"
            ? item.payload.restrictionEventId
            : undefined;
        if (targetId && !dependencyRemote.events.has(targetId) && !incomingEvents.has(targetId)) {
          conflicts.push({ kind: item.kind, id: item.id, reason: "invalid-reference" });
        }
      }
    }
    if (!conflicts.length) {
      request.upload.forEach(({ kind, id }) => {
        if (kind === "session-plan") dependencyRemote.plans.add(id);
        if (kind === "session-record") dependencyRemote.records.add(id);
        if (kind === "evidence-event") dependencyRemote.events.add(id);
      });
      dependencyRemote.cursor += request.upload.length;
    }
    return {
      schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
      cursor: dependencyRemote.cursor,
      hasMore: false,
      changes: [],
      acknowledged: conflicts.length ? [] : request.upload.map(({ kind, id }) => ({ kind, id, status: "inserted" })),
      conflicts,
    };
  },
  { pageSize: 40 },
);
const dependencyOrder = dependencyRemote.batches.flat();
const positionOf = (kind, id) => dependencyOrder.indexOf(`${kind}:${id}`);
assert(dependencySummary.uploaded === 27
  && dependencyRemote.batches.every((batch) => batch.length <= 8)
  && positionOf("session-record", dependencyRecordTarget.id)
    < positionOf("session-record", dependencyRecordReplacement.id)
  && positionOf("evidence-event", restrictionTarget.id)
    < positionOf("evidence-event", restrictionClearance.id)
  && positionOf("evidence-event", correctionTarget.id)
    < positionOf("evidence-event", evidenceCorrection.id),
"Dependency-first outbox paging lost or blocked a correction, clearance, or replacement record");

const forkAthleteId = contracts.parseStableId("athlete", "phase4-dependency-fork-athlete");
const forkStore = makeStore("dependency-fork");
const forkTarget = guidedObservation(forkAthleteId, "2026-04-02T10:00:00.000Z", {
  id: "z-phase4-fork-target",
  session: "phase4-fork-target",
});
const forkCorrection = (id, occurredAt) => ({
  ...dependencyEventBase(id, occurredAt),
  athleteId: forkAthleteId,
  source: "correction",
  type: "evidence_corrected",
  supersedesEventId: forkTarget.id,
  reason: "Fork ordering regression.",
});
await forkStore.appendEvidenceEvent(forkTarget);
await forkStore.appendEvidenceEvent(forkCorrection("a-phase4-fork-correction", "2026-04-02T10:01:00.000Z"));
await forkStore.appendEvidenceEvent(forkCorrection("b-phase4-fork-correction", "2026-04-02T10:02:00.000Z"));
const forkOrder = (await forkStore.readSyncUpload(forkAthleteId, 8)).map(({ id }) => id);
assert(forkOrder.join(",") === [
  forkTarget.id,
  "a-phase4-fork-correction",
  "b-phase4-fork-correction",
].join(","), "A correction fork did not terminate in deterministic dependency-first order");

const cycleAthleteId = contracts.parseStableId("athlete", "phase4-dependency-cycle-athlete");
const cycleStore = makeStore("dependency-cycle");
const cycleEvent = (id, targetId, occurredAt) => ({
  ...dependencyEventBase(id, occurredAt),
  athleteId: cycleAthleteId,
  source: "correction",
  type: "evidence_corrected",
  supersedesEventId: contracts.parseStableId("event", targetId),
  reason: "Cycle detection regression.",
});
await cycleStore.importBundle(focusedImportBundle(cycleAthleteId, [
  cycleEvent(
    "a-phase4-cycle-event",
    "b-phase4-cycle-event",
    "2026-04-03T10:00:00.000Z",
  ),
  cycleEvent(
    "b-phase4-cycle-event",
    "a-phase4-cycle-event",
    "2026-04-03T10:01:00.000Z",
  ),
]));
await assertRejects(
  () => cycleStore.readSyncUpload(cycleAthleteId, 8),
  /vnext-outbox-dependency-cycle/u,
  "A cyclic correction outbox silently retried instead of failing explicitly",
);

const lifecycleStore = persistence.createVNextShadowStore();
const lifecycleEvent = guidedObservation(migrationAthleteId, "2026-04-01T10:00:00.000Z", {
  id: "phase4-lifecycle-event", session: "phase4-lifecycle-test",
});
await lifecycleStore.appendEvidenceEvent(lifecycleEvent);
lifecycleStore.close();
await persistence.clearVNextShadowAthleteData(migrationAthleteId);
const clearedLifecycleStore = persistence.createVNextShadowStore();
assert((await clearedLifecycleStore.readProjectionSources(migrationAthleteId)).evidenceEvents.length === 0,
  "Account lifecycle cleanup retained signed-out shadow observations");
clearedLifecycleStore.close();
await persistence.deleteVNextShadowDatabase();
const versionChangeStoreA = persistence.createVNextShadowStore();
const versionChangeStoreB = persistence.createVNextShadowStore();
await Promise.all([
  versionChangeStoreA.readProjectionSources(migrationAthleteId),
  versionChangeStoreB.readProjectionSources(migrationAthleteId),
]);
await persistence.deleteVNextShadowDatabase();
versionChangeStoreA.close();
versionChangeStoreB.close();

class TestStatement {
  constructor(owner, sql, values = []) { this.owner = owner; this.database = owner.database; this.sql = sql; this.values = values; }
  bind(...values) { return new TestStatement(this.owner, this.sql, values); }
  async first(column) {
    this.owner.queryCount += 1;
    const row = this.database.prepare(this.sql).get(...this.values) ?? null;
    return column && row ? row[column] : row;
  }
  async all() {
    this.owner.queryCount += 1;
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }
  async run() {
    this.owner.queryCount += 1;
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class TestD1 {
  database = new DatabaseSync(":memory:");
  concurrentBatchGate = null;
  queryCount = 0;
  constructor() {
    this.database.exec(readFileSync("profile-api/migrations/0001_password_accounts.sql", "utf8"));
    this.database.exec(readFileSync("profile-api/migrations/0002_vnext_shadow_observations.sql", "utf8"));
  }
  prepare(sql) { return new TestStatement(this, sql); }
  resetQueryCount() { this.queryCount = 0; }
  armConcurrentWriteBarrier(expected = 2) {
    let release;
    const promise = new Promise((resolveGate) => { release = resolveGate; });
    this.concurrentBatchGate = { arrived: 0, expected, promise, release };
  }
  async batch(statements) {
    const gate = this.concurrentBatchGate;
    if (gate && statements.some((statement) => statement.sql.includes("vnext_shadow_changes"))) {
      gate.arrived += 1;
      if (gate.arrived === gate.expected) {
        this.concurrentBatchGate = null;
        gate.release();
      }
      await gate.promise;
    }
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        this.queryCount += 1;
        const result = this.database.prepare(statement.sql).run(...statement.values);
        results.push({
          success: true,
          meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
        });
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryKv {
  data = new Map();
  async get(key, type) {
    const value = this.data.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.data.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cursor: "",
    };
  }
}

const origin = "https://kyriakos243.github.io";
const endpoint = "https://profiles.example";
const cloudEnv = {
  DB: new TestD1(),
  PROFILES: new MemoryKv(),
  ALLOWED_ORIGINS: `${origin},http://127.0.0.1:4173`,
  VNEXT_SHADOW_MODE: "true",
};
const cloudRequest = (path, init = {}) => new Request(`${endpoint}${path}`, {
  ...init,
  headers: { origin, ...(init.headers ?? {}) },
});
const cloudPost = (path, body, token) => cloudRequest(path, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
let registrationFixtureIp = 0;
const registerCloudAthlete = async (username, password) => {
  registrationFixtureIp += 1;
  const request = cloudPost("/auth/register", { username, password });
  request.headers.set("cf-connecting-ip", `192.0.2.${registrationFixtureIp}`);
  const response = await worker.fetch(request, cloudEnv);
  const body = await response.json();
  if (response.status !== 201 || !body.token || !body.profile?.profileId) {
    throw new Error(`Cloud fixture registration failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
};
const transportFor = (token) => persistence.createAuthenticatedShadowTransport(
  async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("authorization", `Bearer ${token}`);
    return worker.fetch(new Request(input, { ...init, headers }), cloudEnv);
  },
  `${endpoint}/vnext/shadow/sync`,
);

const shadowUploadItem = async (kind, payload, id = payload.id, migrationRunId) => ({
  kind,
  id,
  hash: await persistence.sha256(payload),
  payload,
  ...(migrationRunId ? { migrationRunId } : {}),
});

const postShadowUpload = (account, upload) => worker.fetch(cloudPost("/vnext/shadow/sync", {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  cursor: 0,
  upload,
  limit: 40,
}, account.token), cloudEnv);

const nativeSession = (athleteId, suffix, startedAt) => {
  const exercise = bundle.exercises.find((item) => item.id === floorPushProtocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((item) => item.id === floorPushProtocol.prescriptionVariantId);
  const graph = bundle.graphs.find((item) => item.id === floorPushProtocol.subject.milestone.graphId);
  if (!exercise || !variant || !graph || floorPushProtocol.subject.kind !== "milestone") {
    throw new Error("Native Session Record fixture definitions are unavailable");
  }
  const policyId = contracts.parseStableId("policy", "phase4-fixture-generator");
  const planItemId = contracts.parseStableId("plan-item", `phase4-plan-item-${suffix}`);
  const plan = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("session-plan", `phase4-plan-${suffix}`),
    athleteId,
    createdAt: startedAt,
    catalogueVersion: bundle.catalogueVersion,
    generatorPolicyId: policyId,
    generatorPolicyVersion: contracts.parseDefinitionVersion(1),
    definitionReferences: [
      { kind: "policy", id: policyId, version: contracts.parseDefinitionVersion(1) },
      { kind: "exercise", id: exercise.id, version: exercise.definitionVersion },
      { kind: "graph", id: graph.id, version: graph.definitionVersion },
    ],
    intendedDurationSeconds: 300,
    items: [{
      id: planItemId,
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: variant.id,
      purpose: "primary-development",
      plannedSeconds: 300,
      targetMilestone: floorPushProtocol.subject.milestone,
      demand: variant.demand,
    }],
    rationale: [],
  };
  const completedAt = new Date(Date.parse(startedAt) + 300_000).toISOString();
  const record = {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("session-record", `phase4-record-${suffix}`),
    athleteId,
    planId: plan.id,
    startedAt,
    completedAt,
    recordedAt: completedAt,
    status: "complete",
    itemOutcomes: [{
      planItemId,
      status: "completed",
      participationSeconds: 240,
      review: { outcome: "partial", difficulty: "right" },
    }],
  };
  return { plan, record };
};

// The Worker independently validates complete plans/records and their pairing,
// including records uploaded after their immutable plan is already in D1.
const validationAccount = await registerCloudAthlete("Phase Four Pair Validation", "phase four validation password");
const validationAthleteId = contracts.parseStableId("athlete", validationAccount.profile.profileId);
const validationSession = nativeSession(validationAthleteId, "server-validation", "2026-03-20T10:00:00.000Z");
const acceptedPlan = await postShadowUpload(validationAccount, [
  await shadowUploadItem("session-plan", validationSession.plan),
]);
assert(acceptedPlan.status === 200, "Worker rejected a valid standalone immutable Session Plan");
const acceptedRecord = await postShadowUpload(validationAccount, [
  await shadowUploadItem("session-record", validationSession.record),
]);
assert(acceptedRecord.status === 200, "Worker rejected a valid Session Record referencing a stored plan");

const validationRecordCount = Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
  FROM vnext_shadow_session_records WHERE profile_id = ?`).get(validationAthleteId).count);
const malformedRecord = {
  ...validationSession.record,
  id: contracts.parseStableId("session-record", "phase4-record-server-invalid-item"),
  recordedAt: "2026-03-20T10:06:00.000Z",
  itemOutcomes: [{
    ...validationSession.record.itemOutcomes[0],
    planItemId: contracts.parseStableId("plan-item", "phase4-plan-item-does-not-exist"),
  }],
};
const rejectedRecord = await postShadowUpload(validationAccount, [
  await shadowUploadItem("session-record", malformedRecord),
]);
const rejectedRecordBody = await rejectedRecord.json();
assert(rejectedRecord.status === 400 && rejectedRecordBody.code === "vnext-invalid-session-pair",
  "Worker accepted a Session Record whose item does not exist in its stored plan");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
  FROM vnext_shadow_session_records WHERE profile_id = ?`).get(validationAthleteId).count) === validationRecordCount,
"Malformed Session Record changed remote observation truth");

const malformedPlan = {
  ...validationSession.plan,
  id: contracts.parseStableId("session-plan", "phase4-plan-server-invalid-duration"),
  intendedDurationSeconds: validationSession.plan.intendedDurationSeconds + 1,
};
const rejectedPlan = await postShadowUpload(validationAccount, [
  await shadowUploadItem("session-plan", malformedPlan),
]);
const rejectedPlanBody = await rejectedPlan.json();
assert(rejectedPlan.status === 400 && rejectedPlanBody.code === "vnext-invalid-plan",
  "Worker accepted a Session Plan whose item durations contradict its immutable prescription");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
  FROM vnext_shadow_session_plans WHERE profile_id = ? AND plan_id = ?`)
  .get(validationAthleteId, malformedPlan.id).count) === 0,
"Malformed Session Plan was persisted remotely");

// 5. Authenticated normalised D1 sync: offline union, duplicate collapse, hard conflict and reset propagation.
const cloudAccount = await registerCloudAthlete("Phase Four Cloud", "phase four cloud password");
const cloudAthleteId = contracts.parseStableId("athlete", cloudAccount.profile.profileId);
const unauthorized = await worker.fetch(cloudPost("/vnext/shadow/sync", {
  schemaVersion: 1, cursor: 0, upload: [], limit: 40,
}), cloudEnv);
assert(unauthorized.status === 401, "Shadow sync bypassed existing bearer authorization");
cloudEnv.VNEXT_SHADOW_MODE = "false";
const disabled = await worker.fetch(cloudPost("/vnext/shadow/sync", {
  schemaVersion: 1, cursor: 0, upload: [], limit: 40,
}, cloudAccount.token), cloudEnv);
assert(disabled.status === 404, "Shadow sync was not disabled by default feature authority");
cloudEnv.VNEXT_SHADOW_MODE = "true";

// The upload bound is independent from the delta page bound and leaves a
// measured margin below the Workers Free 50-query budget.
const queryBudgetAccount = await registerCloudAthlete("Phase Four Query Budget", "phase four query budget password");
const queryBudgetAthleteId = contracts.parseStableId("athlete", queryBudgetAccount.profile.profileId);
const queryBudgetUpload = await Promise.all(Array.from({ length: 8 }, (_, index) => shadowUploadItem(
  "evidence-event",
  guidedObservation(queryBudgetAthleteId, `2026-04-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`, {
    id: `phase4-query-budget-${index + 1}`,
    session: `phase4-query-budget-session-${index + 1}`,
  }),
)));
cloudEnv.DB.resetQueryCount();
const queryBudgetResponse = await postShadowUpload(queryBudgetAccount, queryBudgetUpload);
const queryBudgetCount = cloudEnv.DB.queryCount;
assert(queryBudgetResponse.status === 200 && queryBudgetCount <= 50,
  `A maximum upload page used ${queryBudgetCount} D1 queries, exceeding the Free-plan budget`);

const aheadCursorAccount = await registerCloudAthlete("Phase Four Ahead Cursor", "phase four ahead cursor password");
const aheadCursorResponse = await worker.fetch(cloudPost("/vnext/shadow/sync", {
  schemaVersion: 1,
  cursor: 1,
  upload: [],
  limit: 200,
}, aheadCursorAccount.token), cloudEnv);
const aheadCursorBody = await aheadCursorResponse.json();
assert(aheadCursorResponse.status === 409 && aheadCursorBody.code === "vnext-cursor-ahead",
  "A cursor ahead of the authoritative server head was not rejected explicitly");

// The dedicated shadow reader accepts a near-v1.2-limit exact snapshot and
// the byte-bounded delta can return that single immutable recovery object.
const largeSnapshotAccount = await registerCloudAthlete("Phase Four Large Snapshot", "phase four large snapshot password");
const largeSnapshotAthleteId = contracts.parseStableId("athlete", largeSnapshotAccount.profile.profileId);
const largeSnapshotProfile = legacyProfile(largeSnapshotAthleteId, {
  withReset: false,
  revision: 720,
  updatedAt: "2026-04-10T00:00:00.000Z",
  history: [],
});
largeSnapshotProfile.preferences = { exactLegacyPayload: "x".repeat(720_000) };
const largeSnapshotConversion = await legacyMigration.convertLegacyV12Profile(
  largeSnapshotProfile,
  "2026-04-11T00:00:00.000Z",
  bundle,
);
const largeSnapshotResponse = await postShadowUpload(largeSnapshotAccount, [
  await shadowUploadItem("legacy-snapshot", largeSnapshotConversion.snapshot),
]);
const largeSnapshotBytes = new TextEncoder().encode(await largeSnapshotResponse.clone().text()).byteLength;
const largeSnapshotBody = await largeSnapshotResponse.json();
assert(largeSnapshotResponse.status === 200
  && largeSnapshotBytes <= 1_250_000
  && largeSnapshotBody.changes.some(({ kind, id }) => kind === "legacy-snapshot" && id === largeSnapshotConversion.snapshot.id),
"A near-limit valid recovery snapshot was rejected or could not be returned within the delta byte bound");

// Two individually valid large observations must paginate by encoded response
// bytes rather than produce an unbounded JSON response.
const bytePageAccount = await registerCloudAthlete("Phase Four Byte Page", "phase four byte page password");
const bytePageAthleteId = contracts.parseStableId("athlete", bytePageAccount.profile.profileId);
const bytePageEvents = [1, 2].map((index) => ({
  ...guidedObservation(bytePageAthleteId, `2026-04-1${index}T08:00:00.000Z`, {
    id: `phase4-byte-page-${index}`,
    session: `phase4-byte-page-session-${index}`,
  }),
  notes: "b".repeat(650_000),
}));
const bytePageResponse = await postShadowUpload(bytePageAccount, await Promise.all(
  bytePageEvents.map((event) => shadowUploadItem("evidence-event", event)),
));
const bytePageBytes = new TextEncoder().encode(await bytePageResponse.clone().text()).byteLength;
const bytePageBody = await bytePageResponse.json();
assert(bytePageResponse.status === 200 && bytePageBody.hasMore === true
  && bytePageBody.changes.length === 1 && bytePageBytes <= 1_250_000,
"Large outbound observations were not split at the response byte boundary");
const bytePageNext = await worker.fetch(cloudPost("/vnext/shadow/sync", {
  schemaVersion: 1,
  cursor: bytePageBody.cursor,
  upload: [],
  limit: 200,
}, bytePageAccount.token), cloudEnv);
const bytePageNextBody = await bytePageNext.json();
assert(bytePageNext.status === 200 && bytePageNextBody.hasMore === false
  && bytePageNextBody.changes.length === 1,
"The observation deferred by the response byte bound was not available on the next cursor page");
const oversizedDeltaEvent = {
  ...guidedObservation(bytePageAthleteId, "2026-04-13T08:00:00.000Z", {
    id: "phase4-byte-page-oversized",
    session: "phase4-byte-page-oversized-session",
  }),
  notes: "o".repeat(1_160_000),
};
const oversizedDeltaResponse = await postShadowUpload(bytePageAccount, [
  await shadowUploadItem("evidence-event", oversizedDeltaEvent),
]);
const oversizedDeltaBody = await oversizedDeltaResponse.json();
assert(oversizedDeltaResponse.status === 413 && oversizedDeltaBody.code === "vnext-item-too-large"
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
    WHERE profile_id = ? AND event_id = ?`).get(bytePageAthleteId, oversizedDeltaEvent.id).count) === 0,
"An individually undeliverable observation entered D1 and could block later delta pages");

const deviceA = makeStore("cloud-a");
const deviceB = makeStore("cloud-b");
const eventA = guidedObservation(cloudAthleteId, "2026-04-01T10:00:00.000Z", {
  id: "phase4-cloud-event-a", session: "phase4-cloud-test-a",
});
const eventB = guidedObservation(cloudAthleteId, "2026-04-02T10:00:00.000Z", {
  id: "phase4-cloud-event-b", session: "phase4-cloud-test-b",
});
const native = nativeSession(cloudAthleteId, "cloud", "2026-04-03T10:00:00.000Z");
await deviceA.appendEvidenceEvent(eventA);
await deviceA.appendSession(native.plan, native.record);
await deviceB.appendEvidenceEvent(eventB);
const cloudTransport = transportFor(cloudAccount.token);
await persistence.syncObservationDeltas(deviceA, cloudAthleteId, cloudTransport, { pageSize: 40 });
await persistence.syncObservationDeltas(deviceB, cloudAthleteId, cloudTransport, { pageSize: 40 });
await persistence.syncObservationDeltas(deviceA, cloudAthleteId, cloudTransport, { pageSize: 40 });
const unionA = await deviceA.readProjectionSources(cloudAthleteId);
const unionB = await deviceB.readProjectionSources(cloudAthleteId);
assert(unionA.evidenceEvents.length === 2 && unionB.evidenceEvents.length === 2
  && unionA.sessionRecords.length === 1 && unionB.sessionRecords.length === 1,
"Disjoint multi-device observations did not converge by set union");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
  WHERE profile_id = ?`).get(cloudAthleteId).count) === 2
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_session_records
    WHERE profile_id = ?`).get(cloudAthleteId).count) === 1,
"Cloud storage did not normalise Evidence Events and Session Records");

const duplicateDevice = makeStore("cloud-duplicate");
await duplicateDevice.appendEvidenceEvent(structuredClone(eventA));
const duplicateSummary = await persistence.syncObservationDeltas(
  duplicateDevice, cloudAthleteId, cloudTransport, { pageSize: 40 },
);
assert(duplicateSummary.duplicatesAcknowledged >= 1,
  "Exact duplicate cloud upload was not acknowledged idempotently");
const conflictDevice = makeStore("cloud-conflict");
await conflictDevice.appendEvidenceEvent({ ...eventA, outcome: "not-yet" });
await assertRejects(
  () => persistence.syncObservationDeltas(conflictDevice, cloudAthleteId, cloudTransport, { pageSize: 40 }),
  /shadow-sync-conflict:.*immutable-id-conflict/u,
  "Divergent cloud observation ID did not produce a hard conflict",
);

const cloudReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: "phase4-cloud-reset-audit",
  athleteId: cloudAthleteId,
  resetAt: "2026-05-01T00:00:00.000Z",
  recordedAt: "2026-05-01T00:00:01.000Z",
  source: "athlete-reset",
};
await deviceA.applyProgressReset(cloudReset);
await persistence.syncObservationDeltas(deviceA, cloudAthleteId, cloudTransport, { pageSize: 40 });
const staleUpload = guidedObservation(cloudAthleteId, "2026-04-30T10:00:00.000Z", {
  id: "phase4-stale-device-event", session: "phase4-stale-device-test",
});
await deviceB.appendEvidenceEvent(staleUpload);
await persistence.syncObservationDeltas(deviceB, cloudAthleteId, cloudTransport, { pageSize: 40 });
const staleAfterSync = await deviceB.readProjectionSources(cloudAthleteId);
assert(staleAfterSync.resetTombstone?.resetAt === cloudReset.resetAt
  && staleAfterSync.evidenceEvents.length === 0 && staleAfterSync.sessionRecords.length === 0,
"A stale device resurrected facts at or before the remote reset tombstone");

// Live v1.2 reset authority is reconciled even when the upload carries a
// different reset head, and the committed winner is reflected in its ack.
const liveResetAccount = await registerCloudAthlete("Phase Four Live Reset", "phase four live reset password");
const liveResetAthleteId = contracts.parseStableId("athlete", liveResetAccount.profile.profileId);
const beforeLiveReset = guidedObservation(liveResetAthleteId, "2026-06-15T10:00:00.000Z", {
  id: "phase4-live-reset-suppressed", session: "phase4-live-reset-test",
});
const beforeLiveResetResponse = await postShadowUpload(liveResetAccount, [
  await shadowUploadItem("evidence-event", beforeLiveReset),
]);
assert(beforeLiveResetResponse.status === 200, "Live-reset fixture evidence was not accepted before the cutoff advanced");
const liveProfileResetAt = "2026-07-01T00:00:00.000Z";
const profileResetUpdate = await worker.fetch(cloudRequest("/profiles/me", {
  method: "PUT",
  headers: {
    authorization: `Bearer ${liveResetAccount.token}`,
    "content-type": "application/json",
    "if-match": String(liveResetAccount.profile.revision),
  },
  body: JSON.stringify({ ...liveResetAccount.profile, progressResetAt: liveProfileResetAt }),
}), cloudEnv);
assert(profileResetUpdate.status === 200, "Live profile progressResetAt fixture update failed");
const staleClientReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: "phase4-live-reset-stale-audit",
  athleteId: liveResetAthleteId,
  resetAt: "2026-06-01T00:00:00.000Z",
  recordedAt: "2026-06-01T00:00:01.000Z",
  source: "sync",
};
const reconciledResetResponse = await postShadowUpload(liveResetAccount, [
  await shadowUploadItem("reset-tombstone", staleClientReset, liveResetAthleteId),
]);
const reconciledResetBody = await reconciledResetResponse.json();
assert(reconciledResetResponse.status === 200
  && reconciledResetBody.resetTombstone?.resetAt === liveProfileResetAt
  && reconciledResetBody.acknowledged[0]?.status === "ignored-older",
"An uploaded reset masked the newer live profile progressResetAt cutoff");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
  WHERE profile_id = ?`).get(liveResetAthleteId).count) === 0,
"Live profile progressResetAt did not purge older shadow evidence");

// An unrelated immutable conflict must not suppress a newly discovered live
// profile reset, and the client applies that lower bound before throwing.
const conflictResetAccount = await registerCloudAthlete("Phase Four Conflict Reset", "phase four conflict reset password");
const conflictResetAthleteId = contracts.parseStableId("athlete", conflictResetAccount.profile.profileId);
const conflictResetServerEvent = guidedObservation(conflictResetAthleteId, "2026-07-02T10:00:00.000Z", {
  id: "phase4-conflict-reset-shared",
  session: "phase4-conflict-reset-shared-session",
});
assert((await postShadowUpload(conflictResetAccount, [
  await shadowUploadItem("evidence-event", conflictResetServerEvent),
])).status === 200, "Conflict/reset fixture server observation was not accepted");
const conflictResetAt = "2026-07-01T00:00:00.000Z";
const conflictResetProfile = { ...conflictResetAccount.profile, progressResetAt: conflictResetAt };
cloudEnv.DB.database.prepare("UPDATE accounts SET profile_json = ? WHERE profile_id = ?")
  .run(JSON.stringify(conflictResetProfile), conflictResetAthleteId);
const conflictResetDevice = makeStore("cloud-conflict-reset");
const conflictResetStale = guidedObservation(conflictResetAthleteId, "2026-06-30T10:00:00.000Z", {
  id: "phase4-conflict-reset-stale",
  session: "phase4-conflict-reset-stale-session",
});
await conflictResetDevice.appendEvidenceEvent({ ...conflictResetServerEvent, outcome: "not-yet" });
await conflictResetDevice.appendEvidenceEvent(conflictResetStale);
await assertRejects(
  () => persistence.syncObservationDeltas(
    conflictResetDevice,
    conflictResetAthleteId,
    transportFor(conflictResetAccount.token),
    { pageSize: 40 },
  ),
  /shadow-sync-conflict:.*immutable-id-conflict/u,
  "Conflict/reset request did not surface its unrelated immutable conflict",
);
const conflictResetSources = await conflictResetDevice.readProjectionSources(conflictResetAthleteId);
const conflictResetHead = cloudEnv.DB.database.prepare(`SELECT reset_at FROM vnext_shadow_sync_heads
  WHERE profile_id = ?`).get(conflictResetAthleteId);
assert(conflictResetHead?.reset_at === conflictResetAt
  && conflictResetSources.resetTombstone?.resetAt === conflictResetAt
  && !conflictResetSources.evidenceEvents.some(({ id }) => id === conflictResetStale.id),
"A live reset was lost on the server or client because another upload conflicted");

// Force two requests past preflight before either D1 write. Database-level
// claims and conditional heads must still converge, then re-read accurately.
const raceAccount = await registerCloudAthlete("Phase Four D1 Race", "phase four d1 race password");
const raceAthleteId = contracts.parseStableId("athlete", raceAccount.profile.profileId);
const raceEvent = guidedObservation(raceAthleteId, "2026-08-01T10:00:00.000Z", {
  id: "phase4-race-event", session: "phase4-race-session",
});
const divergentRaceEvent = { ...raceEvent, outcome: "not-yet" };
cloudEnv.DB.armConcurrentWriteBarrier();
const immutableRaceResponses = await Promise.all([
  postShadowUpload(raceAccount, [await shadowUploadItem("evidence-event", raceEvent)]),
  postShadowUpload(raceAccount, [await shadowUploadItem("evidence-event", divergentRaceEvent)]),
]);
const immutableRaceBodies = await Promise.all(immutableRaceResponses.map((response) => response.json()));
assert(immutableRaceBodies.filter((body) => body.conflicts?.[0]?.reason === "immutable-id-conflict").length === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_changes
    WHERE profile_id = ? AND entity_kind = 'evidence-event' AND entity_id = ?`)
    .get(raceAthleteId, raceEvent.id).count) === 1,
"Concurrent divergent immutable uploads created more than one remote truth");

const intentBase = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId: raceAthleteId,
  updatedAt: "2026-08-02T00:00:00.000Z",
  goals: [],
  equipment: [contracts.parseStableId("equipment", "floor")],
  defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false },
};
const intentDivergent = { ...intentBase, defaultSessionDemand: "challenge" };
cloudEnv.DB.armConcurrentWriteBarrier();
const intentRaceResponses = await Promise.all([
  postShadowUpload(raceAccount, [await shadowUploadItem("athlete-intent", intentBase, raceAthleteId)]),
  postShadowUpload(raceAccount, [await shadowUploadItem("athlete-intent", intentDivergent, raceAthleteId)]),
]);
const intentRaceBodies = await Promise.all(intentRaceResponses.map((response) => response.json()));
const intentRaceChangeCount = Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_changes
    WHERE profile_id = ? AND entity_kind = 'athlete-intent'`)
  .get(raceAthleteId).count);
const intentRaceConflictCount = intentRaceBodies
  .filter((body) => body.conflicts?.[0]?.reason === "intent-timestamp-conflict").length;
assert(intentRaceConflictCount === 1 && intentRaceChangeCount === 1,
  `Concurrent equal-time intents leaked a divergent losing change (${intentRaceConflictCount} conflicts, ${intentRaceChangeCount} changes)`);

const olderRaceReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: "phase4-race-reset-older",
  athleteId: raceAthleteId,
  resetAt: "2026-08-03T00:00:00.000Z",
  recordedAt: "2026-08-03T00:00:01.000Z",
  source: "sync",
};
const newerRaceReset = {
  ...olderRaceReset,
  id: "phase4-race-reset-newer",
  resetAt: "2026-08-04T00:00:00.000Z",
  recordedAt: "2026-08-04T00:00:01.000Z",
};
cloudEnv.DB.armConcurrentWriteBarrier();
const resetRaceResponses = await Promise.all([
  postShadowUpload(raceAccount, [await shadowUploadItem("reset-tombstone", newerRaceReset, raceAthleteId)]),
  postShadowUpload(raceAccount, [await shadowUploadItem("reset-tombstone", olderRaceReset, raceAthleteId)]),
]);
const resetRaceBodies = await Promise.all(resetRaceResponses.map((response) => response.json()));
const committedRaceReset = cloudEnv.DB.database.prepare(`SELECT reset_at FROM vnext_shadow_sync_heads
  WHERE profile_id = ?`).get(raceAthleteId);
assert(committedRaceReset?.reset_at === newerRaceReset.resetAt
  && resetRaceBodies[1]?.acknowledged[0]?.status === "ignored-older",
"A later concurrent stale reset regressed the authoritative D1 cutoff");

// 6. Cloud migration snapshot/receipt and rollback remain convergent across devices.
const migrationCloudAccount = await registerCloudAthlete("Phase Four Migration", "phase four migration password");
const migrationCloudAthleteId = contracts.parseStableId("athlete", migrationCloudAccount.profile.profileId);
const migrationCloudSource = legacyProfile(migrationCloudAthleteId, {
  withReset: false,
  revision: 2,
  updatedAt: "2026-06-02T00:00:00.000Z",
  history: [{
    id: "cloud-legacy-session",
    completedAt: "2026-06-01T10:00:00.000Z",
    day: 1,
    mode: "normal",
    status: "complete",
    seconds: 300,
    exerciseIds: ["floor-push-up"],
    completedExerciseIds: ["floor-push-up"],
    exerciseReviews: { "floor-push-up": { feedback: "easy", achieved: true } },
  }],
});
const migrationCloudConversion = await legacyMigration.convertLegacyV12Profile(
  migrationCloudSource,
  "2026-06-03T00:00:00.000Z",
  bundle,
);
const migrationCloudConversionLater = await legacyMigration.convertLegacyV12Profile(
  structuredClone(migrationCloudSource),
  "2026-06-05T00:00:00.000Z",
  bundle,
);
assert(canonical(migrationCloudConversionLater) === canonical(migrationCloudConversion),
  "A later caller capture changed the unchanged cloud migration receipt");
const migrationDeviceA = makeStore("cloud-migration-a");
const migrationDeviceB = makeStore("cloud-migration-b");
await migrationDeviceA.applyLegacyConversion(migrationCloudConversion);
const migrationTransport = transportFor(migrationCloudAccount.token);
await persistence.syncObservationDeltas(migrationDeviceA, migrationCloudAthleteId, migrationTransport, { pageSize: 40 });
await persistence.syncObservationDeltas(migrationDeviceB, migrationCloudAthleteId, migrationTransport, { pageSize: 40 });
assert((await migrationDeviceB.readProjectionSources(migrationCloudAthleteId)).sessionRecords.length === 1,
  "Remote migration facts did not replay on a second device");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_legacy_snapshots
  WHERE profile_id = ?`).get(migrationCloudAthleteId).count) === 1,
"Recoverable legacy snapshot was not persisted remotely");

const repeatedMigrationDevice = makeStore("cloud-migration-duplicate");
await repeatedMigrationDevice.applyLegacyConversion(migrationCloudConversionLater);
const repeatedCloudMigration = await persistence.syncObservationDeltas(
  repeatedMigrationDevice,
  migrationCloudAthleteId,
  migrationTransport,
  { pageSize: 40 },
);
assert(repeatedCloudMigration.duplicatesAcknowledged >= 4,
  "Repeated remote migration did not collapse its stable snapshot/run/entities");

await migrationDeviceA.rollbackMigrationRun(
  migrationCloudAthleteId,
  migrationCloudConversion.run.id,
  "2026-06-04T00:00:00.000Z",
);
await persistence.syncObservationDeltas(migrationDeviceA, migrationCloudAthleteId, migrationTransport, { pageSize: 40 });
await persistence.syncObservationDeltas(migrationDeviceB, migrationCloudAthleteId, migrationTransport, { pageSize: 40 });
const remoteRollbackSources = await migrationDeviceB.readProjectionSources(migrationCloudAthleteId);
assert(remoteRollbackSources.sessionRecords.length === 0 && remoteRollbackSources.evidenceEvents.length === 0
  && remoteRollbackSources.intent === undefined,
"Remote migration rollback left converter-owned projection truth active");
const remoteRollbackBundle = await migrationDeviceB.exportBundle(
  migrationCloudAthleteId,
  metadata("2026-06-05T00:00:00.000Z"),
);
assert(remoteRollbackBundle.migrationSnapshots.length === 1
  && remoteRollbackBundle.migrationRuns[0]?.status === "rolled-back",
"Remote rollback did not retain snapshot and terminal revocation metadata");

// A terminal run receipt may already be committed when cleanup is interrupted.
// Replaying the duplicate receipt must resume every idempotent cleanup step.
const restoredGeneratedIntent = cloudEnv.DB.database.prepare(`INSERT INTO vnext_shadow_athlete_intents
  (profile_id, athlete_id, change_sequence, updated_at, updated_at_ms, migration_run_id, payload_hash, payload_json)
  SELECT profile_id, ?, sequence, fact_time, fact_time_ms, migration_run_id, payload_hash, payload_json
  FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'athlete-intent' AND migration_run_id = ?
  ORDER BY sequence DESC LIMIT 1`)
  .run(migrationCloudAthleteId, migrationCloudAthleteId, migrationCloudConversion.run.id);
const removedRollbackRef = migrationCloudConversion.run.generatedEntities[0];
if (removedRollbackRef) {
  cloudEnv.DB.database.prepare(`DELETE FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_kind = ? AND entity_id = ?`)
    .run(migrationCloudAthleteId, removedRollbackRef.kind, removedRollbackRef.id);
}
const duplicateRollbackPayload = {
  ...migrationCloudConversion.run,
  status: "rolled-back",
  rolledBackAt: "2026-06-04T00:00:00.000Z",
};
const duplicateRollbackResponse = await postShadowUpload(migrationCloudAccount, [
  await shadowUploadItem("migration-run", duplicateRollbackPayload),
]);
const duplicateRollbackBody = await duplicateRollbackResponse.json();
assert(Number(restoredGeneratedIntent.changes) === 1
  && duplicateRollbackResponse.status === 200
  && duplicateRollbackBody.acknowledged[0]?.status === "duplicate"
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_athlete_intents
    WHERE profile_id = ?`).get(migrationCloudAthleteId).count) === 0
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ?`).get(migrationCloudAthleteId).count) === migrationCloudConversion.run.generatedEntities.length,
"A duplicate rolled-back receipt did not resume converter cleanup idempotently");

// Rollback manifests are set-based: 1,000 refs stay within one request's D1
// query budget and a repeated terminal receipt remains idempotent.
const bulkRollbackAccount = await registerCloudAthlete("Phase Four Bulk Rollback", "phase four bulk rollback password");
const bulkRollbackAthleteId = contracts.parseStableId("athlete", bulkRollbackAccount.profile.profileId);
const bulkRollbackSource = legacyProfile(bulkRollbackAthleteId, {
  withReset: false,
  revision: 1,
  updatedAt: "2026-06-20T00:00:00.000Z",
  history: [],
});
const bulkRollbackConversion = await legacyMigration.convertLegacyV12Profile(
  bulkRollbackSource,
  "2026-06-21T00:00:00.000Z",
  bundle,
);
const bulkGeneratedEntities = Array.from({ length: 1_000 }, (_, index) => ({
  kind: "evidence-event",
  id: `bulk-rollback-event-${index + 1}`,
}));
const bulkActiveRun = { ...bulkRollbackConversion.run, generatedEntities: bulkGeneratedEntities };
const nonCanonicalBulkSource = { ...bulkRollbackConversion.snapshot.sourceProfile, pendingSync: true };
const nonCanonicalBulkFingerprint = await persistence.sha256(nonCanonicalBulkSource);
const nonCanonicalBulkSnapshot = {
  ...bulkRollbackConversion.snapshot,
  id: `legacy-v12-snapshot-${await persistence.sha256({
    converterVersion: 1,
    sourceIdentity: `${bulkRollbackAthleteId}\u0000${nonCanonicalBulkFingerprint}`,
  })}`,
  sourceFingerprint: nonCanonicalBulkFingerprint,
  sourceProfile: nonCanonicalBulkSource,
};
const nonCanonicalBulkResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("legacy-snapshot", nonCanonicalBulkSnapshot),
]);
const nonCanonicalBulkBody = await nonCanonicalBulkResponse.json();
assert(nonCanonicalBulkResponse.status === 400 && nonCanonicalBulkBody.code === "vnext-invalid-snapshot"
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
    FROM vnext_shadow_legacy_snapshots WHERE profile_id = ?`).get(bulkRollbackAthleteId).count) === 0,
"Worker persisted a non-canonical legacy snapshot that local replay would reject");
const secretBulkSource = {
  ...bulkRollbackConversion.snapshot.sourceProfile,
  preferences: {
    ...bulkRollbackConversion.snapshot.sourceProfile.preferences,
    nested: { Access_Token: "must-not-persist", "private-key": "must-not-persist-either" },
  },
};
const secretBulkFingerprint = await persistence.sha256(secretBulkSource);
const secretBulkSnapshot = {
  ...bulkRollbackConversion.snapshot,
  id: `legacy-v12-snapshot-${await persistence.sha256({
    converterVersion: 1,
    sourceIdentity: `${bulkRollbackAthleteId}\u0000${secretBulkFingerprint}`,
  })}`,
  sourceFingerprint: secretBulkFingerprint,
  sourceProfile: secretBulkSource,
};
const secretBulkResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("legacy-snapshot", secretBulkSnapshot),
]);
const secretBulkBody = await secretBulkResponse.json();
assert(secretBulkResponse.status === 400 && secretBulkBody.code === "vnext-snapshot-secret"
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
    FROM vnext_shadow_legacy_snapshots WHERE profile_id = ?`).get(bulkRollbackAthleteId).count) === 0,
"Worker persisted a nested mixed-case credential key inside snapshot preferences");
const unknownSnapshotFieldResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("legacy-snapshot", {
    ...bulkRollbackConversion.snapshot,
    token: "must-not-persist",
  }),
]);
const unknownSnapshotFieldBody = await unknownSnapshotFieldResponse.json();
assert(unknownSnapshotFieldResponse.status === 400 && unknownSnapshotFieldBody.code === "vnext-invalid-snapshot",
  "Worker accepted unknown metadata on a legacy snapshot wrapper");
assert((await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("legacy-snapshot", bulkRollbackConversion.snapshot),
])).status === 200, "Bulk rollback snapshot was not accepted");
const duplicateManifestRun = {
  ...bulkActiveRun,
  id: "migration-run:bulk-duplicate-manifest",
  generatedEntities: [bulkGeneratedEntities[0], bulkGeneratedEntities[0]],
};
const duplicateManifestResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", duplicateManifestRun),
]);
const duplicateManifestBody = await duplicateManifestResponse.json();
assert(duplicateManifestResponse.status === 400 && duplicateManifestBody.code === "vnext-invalid-migration-run",
  "Worker accepted duplicate refs in a migration ownership manifest");
const unknownRunFieldResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", { ...bulkActiveRun, authorization: "must-not-persist" }),
]);
const unknownRunFieldBody = await unknownRunFieldResponse.json();
assert(unknownRunFieldResponse.status === 400 && unknownRunFieldBody.code === "vnext-invalid-migration-run",
  "Worker accepted unknown metadata on a migration-run wrapper");
const mismatchedSnapshotRun = {
  ...bulkActiveRun,
  sourceFingerprint: "a".repeat(64),
  id: `legacy-v12-run-${await persistence.sha256({
    converterVersion: 1,
    sourceIdentity: `${bulkRollbackAthleteId}\u0000${"a".repeat(64)}`,
  })}`,
};
const mismatchedSnapshotResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", mismatchedSnapshotRun),
]);
const mismatchedSnapshotBody = await mismatchedSnapshotResponse.json();
assert(mismatchedSnapshotResponse.status === 200
  && mismatchedSnapshotBody.conflicts?.[0]?.reason === "invalid-reference"
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
    FROM vnext_shadow_migration_runs WHERE profile_id = ?`).get(bulkRollbackAthleteId).count) === 0,
"A migration receipt whose snapshot metadata differed was persisted");
const mismatchedCaptureRun = {
  ...bulkActiveRun,
  createdAt: "2026-06-21T00:00:01.000Z",
};
const mismatchedCaptureResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", mismatchedCaptureRun),
]);
const mismatchedCaptureBody = await mismatchedCaptureResponse.json();
assert(mismatchedCaptureResponse.status === 200
  && mismatchedCaptureBody.conflicts?.[0]?.reason === "invalid-reference"
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
    FROM vnext_shadow_migration_runs WHERE profile_id = ?`).get(bulkRollbackAthleteId).count) === 0,
"A migration receipt whose creation boundary differed from its snapshot was persisted");
const nonCanonicalReset = {
  schemaVersion: 1,
  id: "phase4-noncanonical-reset",
  athleteId: bulkRollbackAthleteId,
  resetAt: "2026-06-21T00:00:00Z",
  recordedAt: "2026-06-21T00:00:00Z",
  source: "sync",
};
const nonCanonicalResetResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("reset-tombstone", nonCanonicalReset, bulkRollbackAthleteId),
]);
const nonCanonicalResetBody = await nonCanonicalResetResponse.json();
assert(nonCanonicalResetResponse.status === 400 && nonCanonicalResetBody.code === "vnext-invalid-timestamp",
  "Worker accepted a timestamp form that local shadow replay would reject");
const unknownResetField = {
  schemaVersion: 1,
  id: "phase4-unknown-reset-field",
  athleteId: bulkRollbackAthleteId,
  resetAt: "2026-06-21T00:00:00.000Z",
  recordedAt: "2026-06-21T00:00:00.000Z",
  source: "sync",
  password: "must-not-persist",
};
const unknownResetFieldResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("reset-tombstone", unknownResetField, bulkRollbackAthleteId),
]);
const unknownResetFieldBody = await unknownResetFieldResponse.json();
assert(unknownResetFieldResponse.status === 400 && unknownResetFieldBody.code === "vnext-invalid-reset",
  "Worker accepted unknown metadata on a reset-tombstone wrapper");
assert((await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", bulkActiveRun),
])).status === 200, "Bulk rollback active receipt was not accepted");
const bulkTerminalRun = {
  ...bulkActiveRun,
  status: "rolled-back",
  rolledBackAt: "2026-06-22T00:00:00.000Z",
};
cloudEnv.DB.resetQueryCount();
const bulkRollbackResponse = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", bulkTerminalRun),
]);
const bulkRollbackQueryCount = cloudEnv.DB.queryCount;
assert(bulkRollbackResponse.status === 200 && bulkRollbackQueryCount <= 50
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
    FROM vnext_shadow_rolled_back_entities WHERE profile_id = ?`).get(bulkRollbackAthleteId).count) === 1_000,
`A 1,000-ref rollback was incomplete or used ${bulkRollbackQueryCount} D1 queries`);
const repeatedBulkRollback = await postShadowUpload(bulkRollbackAccount, [
  await shadowUploadItem("migration-run", bulkTerminalRun),
]);
assert(repeatedBulkRollback.status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count
    FROM vnext_shadow_rolled_back_entities WHERE profile_id = ?`).get(bulkRollbackAthleteId).count) === 1_000,
"Repeating a 1,000-ref terminal receipt changed its rollback tombstone set");

// Stable converted IDs may be claimed by more than one source revision. The
// origin migration_run_id is audit metadata; active manifests are ownership.
const sharedOwnerAccount = await registerCloudAthlete("Phase Four Shared Owner", "phase four shared owner password");
const sharedOwnerAthleteId = contracts.parseStableId("athlete", sharedOwnerAccount.profile.profileId);
const sharedOwnerEvent = guidedObservation(sharedOwnerAthleteId, "2026-06-25T10:00:00.000Z", {
  id: "phase4-shared-owner-event",
  session: "phase4-shared-owner-session",
});
const sharedOwnerRef = [{ kind: "evidence-event", id: sharedOwnerEvent.id }];
const makeOwnershipPair = async (suffix, revision, capturedAt) => {
  const sourceProfile = legacyProfile(sharedOwnerAthleteId, {
    withReset: false,
    revision,
    updatedAt: capturedAt,
    history: [],
  });
  const sourceFingerprint = await persistence.sha256(sourceProfile);
  const sourceIdentity = `${sharedOwnerAthleteId}\u0000${sourceFingerprint}`;
  const snapshotId = `legacy-v12-snapshot-${await persistence.sha256({
    converterVersion: 1,
    sourceIdentity,
  })}`;
  const runId = `legacy-v12-run-${await persistence.sha256({
    converterVersion: 1,
    sourceIdentity,
  })}`;
  const snapshot = {
    schemaVersion: 1,
    id: snapshotId,
    athleteId: sharedOwnerAthleteId,
    converterVersion: 1,
    sourceVersion: "1.2",
    sourceFingerprint,
    capturedAt,
    sourceProfile,
  };
  const run = {
    schemaVersion: 1,
    id: runId,
    athleteId: sharedOwnerAthleteId,
    converterVersion: 1,
    sourceVersion: "1.2",
    sourceFingerprint,
    snapshotId: snapshot.id,
    createdAt: capturedAt,
    status: "active",
    generatedEntities: sharedOwnerRef,
    warnings: [],
  };
  return { snapshot, run };
};
const sharedOwnerOne = await makeOwnershipPair("one", 1, "2026-06-26T00:00:00.000Z");
const sharedOwnerTwo = await makeOwnershipPair("two", 2, "2026-06-27T00:00:00.000Z");
assert((await postShadowUpload(sharedOwnerAccount, [
  await shadowUploadItem("legacy-snapshot", sharedOwnerOne.snapshot),
  await shadowUploadItem("migration-run", sharedOwnerOne.run),
  await shadowUploadItem("evidence-event", sharedOwnerEvent, sharedOwnerEvent.id, sharedOwnerOne.run.id),
])).status === 200, "First shared-owner migration was not accepted");
assert((await postShadowUpload(sharedOwnerAccount, [
  await shadowUploadItem("legacy-snapshot", sharedOwnerTwo.snapshot),
  await shadowUploadItem("migration-run", sharedOwnerTwo.run),
  await shadowUploadItem("evidence-event", sharedOwnerEvent, sharedOwnerEvent.id, sharedOwnerTwo.run.id),
])).status === 200, "Second shared-owner migration was not accepted");
const sharedOwnerIntent = {
  schemaVersion: 1,
  athleteId: sharedOwnerAthleteId,
  updatedAt: "2026-06-27T00:00:01.000Z",
  goals: [],
  equipment: [contracts.parseStableId("equipment", "floor")],
  defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false },
};
assert((await postShadowUpload(sharedOwnerAccount, [
  await shadowUploadItem("athlete-intent", sharedOwnerIntent, sharedOwnerAthleteId, sharedOwnerTwo.run.id),
])).status === 200, "Newer migration intent provenance was not accepted");
const sharedOwnerOneRollback = {
  ...sharedOwnerOne.run,
  status: "rolled-back",
  rolledBackAt: "2026-06-28T00:00:00.000Z",
};
assert((await postShadowUpload(sharedOwnerAccount, [
  await shadowUploadItem("migration-run", sharedOwnerOneRollback),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
    WHERE profile_id = ? AND event_id = ?`).get(sharedOwnerAthleteId, sharedOwnerEvent.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id = ?`).get(sharedOwnerAthleteId, sharedOwnerEvent.id).count) === 0
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_athlete_intents
    WHERE profile_id = ? AND migration_run_id = ?`).get(sharedOwnerAthleteId, sharedOwnerTwo.run.id).count) === 1,
"Rolling back one manifest removed an entity still owned by another active migration");
const sharedOwnerTwoRollback = {
  ...sharedOwnerTwo.run,
  status: "rolled-back",
  rolledBackAt: "2026-06-29T00:00:00.000Z",
};
assert((await postShadowUpload(sharedOwnerAccount, [
  await shadowUploadItem("migration-run", sharedOwnerTwoRollback),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
    WHERE profile_id = ? AND event_id = ?`).get(sharedOwnerAthleteId, sharedOwnerEvent.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id = ?`).get(sharedOwnerAthleteId, sharedOwnerEvent.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_athlete_intents
    WHERE profile_id = ?`).get(sharedOwnerAthleteId).count) === 0,
"The last active migration owner did not revoke its generated entity and current intent");

// A converter manifest may exact-dedupe against native truth. Rollback revokes
// only converter-origin rows and must not tombstone or delete that native fact.
const nativeFirstAccount = await registerCloudAthlete("Phase Four Native First", "phase four native first password");
const nativeFirstAthleteId = contracts.parseStableId("athlete", nativeFirstAccount.profile.profileId);
const nativeFirstEvent = guidedObservation(nativeFirstAthleteId, "2026-06-30T10:00:00.000Z", {
  id: "phase4-native-first-event",
  session: "phase4-native-first-session",
});
assert((await postShadowUpload(nativeFirstAccount, [
  await shadowUploadItem("evidence-event", nativeFirstEvent),
])).status === 200, "Native-first observation was not accepted");
const nativeFirstSource = legacyProfile(nativeFirstAthleteId, {
  withReset: false,
  revision: 1,
  updatedAt: "2026-07-01T00:00:00.000Z",
  history: [],
});
const nativeFirstConversion = await legacyMigration.convertLegacyV12Profile(
  nativeFirstSource,
  "2026-07-01T00:00:00.000Z",
  bundle,
);
const nativeFirstRun = {
  ...nativeFirstConversion.run,
  generatedEntities: [{ kind: "evidence-event", id: nativeFirstEvent.id }],
};
assert((await postShadowUpload(nativeFirstAccount, [
  await shadowUploadItem("legacy-snapshot", nativeFirstConversion.snapshot),
  await shadowUploadItem("migration-run", nativeFirstRun),
  await shadowUploadItem("evidence-event", nativeFirstEvent, nativeFirstEvent.id, nativeFirstRun.id),
])).status === 200, "Converter did not exact-dedupe against native-first truth");
const nativeFirstRollback = {
  ...nativeFirstRun,
  status: "rolled-back",
  rolledBackAt: "2026-07-02T00:00:00.000Z",
};
assert((await postShadowUpload(nativeFirstAccount, [
  await shadowUploadItem("migration-run", nativeFirstRollback),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
    WHERE profile_id = ? AND event_id = ? AND migration_run_id IS NULL`)
    .get(nativeFirstAthleteId, nativeFirstEvent.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id = ?`).get(nativeFirstAthleteId, nativeFirstEvent.id).count) === 0,
"Converter rollback deleted or tombstoned exact-deduped native observation truth");

// A converter plan remains a required immutable reference when a native
// correction record still points to it after converter-owned records revoke.
const retainedPlanAccount = await registerCloudAthlete("Phase Four Retained Plan", "phase four retained plan password");
const retainedPlanAthleteId = contracts.parseStableId("athlete", retainedPlanAccount.profile.profileId);
const retainedPlanSource = legacyProfile(retainedPlanAthleteId, {
  withReset: false,
  revision: 1,
  updatedAt: "2026-07-03T00:00:00.000Z",
  history: [],
});
const retainedPlanConversion = await legacyMigration.convertLegacyV12Profile(
  retainedPlanSource,
  "2026-07-03T00:00:00.000Z",
  bundle,
);
const retainedSession = nativeSession(retainedPlanAthleteId, "retained-plan", "2026-07-04T10:00:00.000Z");
const retainedPlanRun = {
  ...retainedPlanConversion.run,
  generatedEntities: [
    { kind: "session-plan", id: retainedSession.plan.id },
    { kind: "session-record", id: retainedSession.record.id },
  ],
};
assert((await postShadowUpload(retainedPlanAccount, [
  await shadowUploadItem("legacy-snapshot", retainedPlanConversion.snapshot),
  await shadowUploadItem("migration-run", retainedPlanRun),
  await shadowUploadItem("session-plan", retainedSession.plan, retainedSession.plan.id, retainedPlanRun.id),
  await shadowUploadItem("session-record", retainedSession.record, retainedSession.record.id, retainedPlanRun.id),
])).status === 200, "Converter plan/record retention fixture was not accepted");
const retainedNativeRecord = {
  ...retainedSession.record,
  id: contracts.parseStableId("session-record", "phase4-retained-native-record"),
  recordedAt: "2026-07-04T10:06:00.000Z",
  supersedesRecordId: retainedSession.record.id,
};
assert((await postShadowUpload(retainedPlanAccount, [
  await shadowUploadItem("session-record", retainedNativeRecord),
])).status === 200, "Native correction referencing a converter plan was not accepted");
const retainedPlanRollback = {
  ...retainedPlanRun,
  status: "rolled-back",
  rolledBackAt: "2026-07-05T00:00:00.000Z",
};
const retainedPlanRollbackResponse = await postShadowUpload(retainedPlanAccount, [
  await shadowUploadItem("migration-run", retainedPlanRollback),
]);
assert(retainedPlanRollbackResponse.status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_session_plans
    WHERE profile_id = ? AND plan_id = ?`).get(retainedPlanAthleteId, retainedSession.plan.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_session_records
    WHERE profile_id = ? AND record_id = ?`).get(retainedPlanAthleteId, retainedSession.record.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_session_records
    WHERE profile_id = ? AND record_id = ?`).get(retainedPlanAthleteId, retainedNativeRecord.id).count) === 1
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_kind = 'session-record' AND entity_id = ?`)
    .get(retainedPlanAthleteId, retainedSession.record.id).count) === 0,
"Rollback failed or removed a converter plan still required by a native Session Record");

// Rollback is logical quarantine: a later source revision may claim the same
// stable fact by manifest alone, even when its device deduped the payload.
const ownershipRaceAccount = await registerCloudAthlete("Phase Four Ownership Race", "phase four ownership race password");
const ownershipRaceAthleteId = contracts.parseStableId("athlete", ownershipRaceAccount.profile.profileId);
const ownershipRaceEvent = guidedObservation(ownershipRaceAthleteId, "2026-07-10T10:00:00.000Z", {
  id: "phase4-ownership-race-event",
  session: "phase4-ownership-race-session",
});
const ownershipRaceSourceOne = legacyProfile(ownershipRaceAthleteId, {
  withReset: false, revision: 1, updatedAt: "2026-07-08T00:00:00.000Z", history: [],
});
const ownershipRaceSourceTwo = legacyProfile(ownershipRaceAthleteId, {
  withReset: false, revision: 2, updatedAt: "2026-07-09T00:00:00.000Z", history: [],
});
const [ownershipRaceConversionOne, ownershipRaceConversionTwo] = await Promise.all([
  legacyMigration.convertLegacyV12Profile(ownershipRaceSourceOne, "2026-07-08T00:00:00.000Z", bundle),
  legacyMigration.convertLegacyV12Profile(ownershipRaceSourceTwo, "2026-07-09T00:00:00.000Z", bundle),
]);
const ownershipRaceRunOne = {
  ...ownershipRaceConversionOne.run,
  generatedEntities: [{ kind: "evidence-event", id: ownershipRaceEvent.id }],
};
const ownershipRaceRunTwo = {
  ...ownershipRaceConversionTwo.run,
  generatedEntities: [{ kind: "evidence-event", id: ownershipRaceEvent.id }],
};
assert((await postShadowUpload(ownershipRaceAccount, [
  await shadowUploadItem("legacy-snapshot", ownershipRaceConversionOne.snapshot),
  await shadowUploadItem("migration-run", ownershipRaceRunOne),
  await shadowUploadItem("evidence-event", ownershipRaceEvent, ownershipRaceEvent.id, ownershipRaceRunOne.id),
])).status === 200, "Ownership-race first conversion was not accepted");
assert((await postShadowUpload(ownershipRaceAccount, [
  await shadowUploadItem("migration-run", {
    ...ownershipRaceRunOne,
    status: "rolled-back",
    rolledBackAt: "2026-07-11T00:00:00.000Z",
  }),
])).status === 200, "Ownership-race first rollback failed");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
  WHERE profile_id = ? AND event_id = ?`).get(ownershipRaceAthleteId, ownershipRaceEvent.id).count) === 1,
"Rollback physically deleted a fact needed by a possible later co-owner");
assert((await postShadowUpload(ownershipRaceAccount, [
  await shadowUploadItem("legacy-snapshot", ownershipRaceConversionTwo.snapshot),
  await shadowUploadItem("migration-run", ownershipRaceRunTwo),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id = ?`).get(ownershipRaceAthleteId, ownershipRaceEvent.id).count) === 0,
"A later active manifest could not reactivate its quarantined stable fact without payload replay");

// Evidence correction/clearance dependencies receive the same rollback
// closure as Session Record supersession dependencies.
const correctionAccount = await registerCloudAthlete("Phase Four Correction Dependency", "phase four correction dependency password");
const correctionAthleteId = contracts.parseStableId("athlete", correctionAccount.profile.profileId);
const rollbackCorrectionTarget = guidedObservation(correctionAthleteId, "2026-07-15T10:00:00.000Z", {
  id: "phase4-correction-target",
  session: "phase4-correction-target-session",
});
const correctionSource = legacyProfile(correctionAthleteId, {
  withReset: false, revision: 1, updatedAt: "2026-07-14T00:00:00.000Z", history: [],
});
const correctionConversion = await legacyMigration.convertLegacyV12Profile(
  correctionSource, "2026-07-14T00:00:00.000Z", bundle,
);
const correctionRun = {
  ...correctionConversion.run,
  generatedEntities: [{ kind: "evidence-event", id: rollbackCorrectionTarget.id }],
};
assert((await postShadowUpload(correctionAccount, [
  await shadowUploadItem("legacy-snapshot", correctionConversion.snapshot),
  await shadowUploadItem("migration-run", correctionRun),
  await shadowUploadItem("evidence-event", rollbackCorrectionTarget, rollbackCorrectionTarget.id, correctionRun.id),
])).status === 200, "Correction dependency target was not accepted");
const nativeCorrection = {
  schemaVersion: 1,
  id: contracts.parseStableId("event", "phase4-native-correction"),
  athleteId: correctionAthleteId,
  occurredAt: "2026-07-16T10:00:00.000Z",
  recordedAt: "2026-07-16T10:00:00.000Z",
  source: "correction",
  catalogueVersion: bundle.catalogueVersion,
  type: "evidence_corrected",
  supersedesEventId: rollbackCorrectionTarget.id,
  reason: "Native correction retains its immutable target",
};
assert((await postShadowUpload(correctionAccount, [
  await shadowUploadItem("evidence-event", nativeCorrection),
])).status === 200, "Native correction dependency was not accepted");
assert((await postShadowUpload(correctionAccount, [
  await shadowUploadItem("migration-run", {
    ...correctionRun,
    status: "rolled-back",
    rolledBackAt: "2026-07-17T00:00:00.000Z",
  }),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
    WHERE profile_id = ? AND event_id IN (?, ?)`).get(correctionAthleteId, rollbackCorrectionTarget.id, nativeCorrection.id).count) === 2
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id = ?`).get(correctionAthleteId, rollbackCorrectionTarget.id).count) === 0,
"Rollback orphaned a remaining native evidence correction from its target");

// Reset cascades through later correction/supersession chains so no fresh
// client receives a dependent whose pre-reset target was removed.
const resetCascadeAccount = await registerCloudAthlete("Phase Four Reset Cascade", "phase four reset cascade password");
const resetCascadeAthleteId = contracts.parseStableId("athlete", resetCascadeAccount.profile.profileId);
const resetCascadeTarget = guidedObservation(resetCascadeAthleteId, "2026-08-01T10:00:00.000Z", {
  id: "phase4-reset-cascade-target", session: "phase4-reset-cascade-target-session",
});
const resetCascadeCorrection = {
  ...nativeCorrection,
  id: contracts.parseStableId("event", "phase4-reset-cascade-correction"),
  athleteId: resetCascadeAthleteId,
  occurredAt: "2026-08-03T10:00:00.000Z",
  recordedAt: "2026-08-03T10:00:00.000Z",
  supersedesEventId: resetCascadeTarget.id,
};
const resetCascadeSession = nativeSession(resetCascadeAthleteId, "reset-cascade", "2026-08-01T12:00:00.000Z");
const resetCascadeReplacement = {
  ...resetCascadeSession.record,
  id: contracts.parseStableId("session-record", "phase4-reset-cascade-replacement"),
  startedAt: "2026-08-03T12:00:00.000Z",
  completedAt: "2026-08-03T12:05:00.000Z",
  recordedAt: "2026-08-03T12:05:00.000Z",
  supersedesRecordId: resetCascadeSession.record.id,
};
assert((await postShadowUpload(resetCascadeAccount, [
  await shadowUploadItem("evidence-event", resetCascadeTarget),
  await shadowUploadItem("evidence-event", resetCascadeCorrection),
  await shadowUploadItem("session-plan", resetCascadeSession.plan),
  await shadowUploadItem("session-record", resetCascadeSession.record),
  await shadowUploadItem("session-record", resetCascadeReplacement),
])).status === 200, "Reset dependency-cascade fixture was not accepted");
const resetCascadeTombstone = {
  schemaVersion: 1,
  id: "phase4-reset-cascade",
  athleteId: resetCascadeAthleteId,
  resetAt: "2026-08-02T00:00:00.000Z",
  recordedAt: "2026-08-02T00:00:00.000Z",
  source: "athlete-reset",
};
assert((await postShadowUpload(resetCascadeAccount, [
  await shadowUploadItem("reset-tombstone", resetCascadeTombstone, resetCascadeAthleteId),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_evidence_events
    WHERE profile_id = ?`).get(resetCascadeAthleteId).count) === 0
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_session_records
    WHERE profile_id = ?`).get(resetCascadeAthleteId).count) === 0,
"Reset left a correction or replacement orphaned from its pre-reset target");

// Offline native dependents may arrive only after rollback. Their accepted
// dependency closure clears old revocations for targets and required plans.
const lateDependencyAccount = await registerCloudAthlete("Phase Four Late Dependency", "phase four late dependency password");
const lateDependencyAthleteId = contracts.parseStableId("athlete", lateDependencyAccount.profile.profileId);
const lateDependencyTarget = guidedObservation(lateDependencyAthleteId, "2026-08-10T10:00:00.000Z", {
  id: "phase4-late-dependency-target", session: "phase4-late-dependency-target-session",
});
const lateDependencySession = nativeSession(lateDependencyAthleteId, "late-dependency", "2026-08-10T12:00:00.000Z");
const lateDependencySource = legacyProfile(lateDependencyAthleteId, {
  withReset: false, revision: 1, updatedAt: "2026-08-09T00:00:00.000Z", history: [],
});
const lateDependencyConversion = await legacyMigration.convertLegacyV12Profile(
  lateDependencySource, "2026-08-09T00:00:00.000Z", bundle,
);
const lateDependencyRun = {
  ...lateDependencyConversion.run,
  generatedEntities: [
    { kind: "evidence-event", id: lateDependencyTarget.id },
    { kind: "session-plan", id: lateDependencySession.plan.id },
    { kind: "session-record", id: lateDependencySession.record.id },
  ],
};
assert((await postShadowUpload(lateDependencyAccount, [
  await shadowUploadItem("legacy-snapshot", lateDependencyConversion.snapshot),
  await shadowUploadItem("migration-run", lateDependencyRun),
  await shadowUploadItem("evidence-event", lateDependencyTarget, lateDependencyTarget.id, lateDependencyRun.id),
  await shadowUploadItem("session-plan", lateDependencySession.plan, lateDependencySession.plan.id, lateDependencyRun.id),
  await shadowUploadItem("session-record", lateDependencySession.record, lateDependencySession.record.id, lateDependencyRun.id),
])).status === 200, "Late-dependency converter fixture was not accepted");
assert((await postShadowUpload(lateDependencyAccount, [
  await shadowUploadItem("migration-run", {
    ...lateDependencyRun,
    status: "rolled-back",
    rolledBackAt: "2026-08-11T00:00:00.000Z",
  }),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id IN (?, ?, ?)`)
    .get(lateDependencyAthleteId, lateDependencyTarget.id,
      lateDependencySession.plan.id, lateDependencySession.record.id).count) === 3,
"Late-dependency rollback did not establish the expected quarantine revocations");
const lateNativeCorrection = {
  ...nativeCorrection,
  id: contracts.parseStableId("event", "phase4-late-native-correction"),
  athleteId: lateDependencyAthleteId,
  occurredAt: "2026-08-12T10:00:00.000Z",
  recordedAt: "2026-08-12T10:00:00.000Z",
  supersedesEventId: lateDependencyTarget.id,
};
const lateNativeReplacement = {
  ...lateDependencySession.record,
  id: contracts.parseStableId("session-record", "phase4-late-native-replacement"),
  startedAt: "2026-08-12T12:00:00.000Z",
  completedAt: "2026-08-12T12:05:00.000Z",
  recordedAt: "2026-08-12T12:05:00.000Z",
  supersedesRecordId: lateDependencySession.record.id,
};
assert((await postShadowUpload(lateDependencyAccount, [
  await shadowUploadItem("evidence-event", lateNativeCorrection),
  await shadowUploadItem("session-record", lateNativeReplacement),
])).status === 200
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND entity_id IN (?, ?, ?)`)
    .get(lateDependencyAthleteId, lateDependencyTarget.id,
      lateDependencySession.plan.id, lateDependencySession.record.id).count) === 0,
"Late native dependents did not clear target and plan quarantine revocations");

// Account deletion uses the existing authenticated path; D1 cascades every shadow row.
const deletedMigrationAccount = await worker.fetch(cloudRequest("/profiles/me", {
  method: "DELETE",
  headers: {
    authorization: `Bearer ${migrationCloudAccount.token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    confirmation: migrationCloudAccount.profile.username,
    password: "phase four migration password",
  }),
}), cloudEnv);
assert(deletedMigrationAccount.status === 200, "Authenticated account deletion failed after shadow migration");
assert(Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_changes
  WHERE profile_id = ?`).get(migrationCloudAthleteId).count) === 0
  && Number(cloudEnv.DB.database.prepare(`SELECT COUNT(*) AS count FROM vnext_shadow_legacy_snapshots
    WHERE profile_id = ?`).get(migrationCloudAthleteId).count) === 0,
"Account deletion did not cascade through shadow observations and snapshots");

for (const store of [
  migrationStore, multiRunStore, cursorOwnerStore, cursorPlanStore, cursorPlanImportStore,
  nativeProvenanceStore, nativeProvenanceImportStore,
  importStore, malformedImportStore, malformedSyncStore,
  resetStore, localResetCascadeStore, sizeStore, deviceA, deviceB, duplicateDevice,
  conflictDevice, migrationDeviceA, migrationDeviceB, repeatedMigrationDevice, nearLimitStore,
  dependencyStore, orphanStore, forkStore, cycleStore,
]) store.close();

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `vNext Phase 4: offline replay, immutable-ID dedupe/conflicts, ${conversion.sessionRecords.length} reset-safe converted sessions, `
  + `snapshot rollback/recovery, export/import, ${sizeConversion.sessionRecords.length}-session load, authenticated D1 delta union, `
  + "stale-device tombstones and remote migration rollback passed.",
);
