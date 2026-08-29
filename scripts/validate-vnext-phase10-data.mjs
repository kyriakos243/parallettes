import { createRequire } from "node:module";

createRequire(import.meta.url)("fake-indexeddb/auto");
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

console.log("Phase 10 data: loading contracts");
const contracts = loadTypeScriptModule("app/vnext/contracts.ts");
console.log("Phase 10 data: loading definitions");
const definitions = loadTypeScriptModule("app/vnext/definitions/index.ts");
console.log("Phase 10 data: loading persistence");
const persistence = loadTypeScriptModule("app/vnext/persistence/index.ts");
console.log("Phase 10 data: loading migration");
const legacyMigration = loadTypeScriptModule("app/vnext/persistence/legacyMigration.ts");
console.log("Phase 10 data: loading projection");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");

const bundle = definitions.vNextDefinitionBundle;
const policy = projection.vNextProjectionPolicy;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const assertRejects = async (action, pattern, message) => {
  try {
    await action();
    failures.push(message);
  } catch (error) {
    const detail = String(error?.message ?? error);
    if (pattern && !pattern.test(detail)) failures.push(`${message}; unexpected error: ${detail}`);
  }
};
const readText = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const canonical = persistence.canonicalJson;
const timestamp = (minute, day = 20) => new Date(Date.UTC(2026, 7, day, 9, minute, 0, 0)).toISOString();
const uniqueDatabaseName = (label) => `parallette25-vnext-phase10-data-${label}-${crypto.randomUUID()}`;
const makeStore = (label, databaseName = uniqueDatabaseName(label)) => ({
  databaseName,
  store: persistence.createVNextShadowStore({ databaseName }),
});
const athleteId = contracts.parseStableId("athlete", "phase10-data-athlete");
const metadata = (exportedAt) => ({
  exportedAt,
  catalogueVersions: definitions.vNextDefinitionBundles.map(({ catalogueVersion }) => catalogueVersion),
  projectionVersions: [policy.version],
  definitionFingerprints: [definitions.VNEXT_PHASE7_SEMANTIC_FINGERPRINTS[bundle.catalogueVersion]],
  policyVersions: [{ id: policy.id, version: policy.version }],
});

const copiedProfile = (overrides = {}) => ({
  profileId: athleteId,
  username: "phase10-data-copy",
  schemaVersion: 1,
  revision: 7,
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-08-18T08:00:00.000Z",
  progressResetAt: "2026-08-01T08:00:00.000Z",
  nextProgramDay: 3,
  history: [{
    id: "phase10-data-legacy-session",
    completedAt: "2026-08-10T08:25:00.000Z",
    day: 2,
    status: "complete",
    seconds: 1_500,
    completedExerciseIds: ["support-hold", "tuck-support"],
  }],
  readiness: { G1: true, G6: true },
  readinessUpdatedAt: {
    G1: "2026-08-02T08:00:00.000Z",
    G6: "2026-08-02T08:00:00.000Z",
  },
  progression: { "support-hold": { cleanSessions: 2, lastFeedback: "right" } },
  equipment: ["parallettes", "floor"],
  preferences: { startingAssessment: { suggestedLevel: "L2" }, soundEnabled: true },
  ...overrides,
});

const floorPushProtocol = bundle.benchmarkProtocols.find((protocol) =>
  protocol.id === definitions.milestoneBenchmarkId("parallette-pushing", "floor-push-up"));
if (!floorPushProtocol) throw new Error("Phase 10 data fixture requires the floor push-up protocol");
let observationSequence = 0;
const observedPush = (targetAthleteId, occurredAt, overrides = {}) => {
  observationSequence += 1;
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("event", overrides.id ?? `phase10-data-observation-${observationSequence}`),
    athleteId: targetAthleteId,
    occurredAt,
    recordedAt: overrides.recordedAt ?? occurredAt,
    source: "guided-test",
    catalogueVersion: bundle.catalogueVersion,
    type: "performance_observed",
    subject: floorPushProtocol.subject,
    outcome: overrides.outcome ?? "clean",
    benchmarkProtocolId: floorPushProtocol.id,
    benchmarkProtocolVersion: floorPushProtocol.definitionVersion,
    observationSessionId: contracts.parseStableId(
      "observation-session",
      overrides.observationSessionId ?? `phase10-data-test-${observationSequence}`,
    ),
    measurement: { value: overrides.repetitions ?? 8, unit: "repetitions" },
  };
};

// 1. A copied legacy source converts atomically and repeatably. Closing and
// reopening the same named IndexedDB must preserve immutable truth, intent,
// migration receipts and the exact reset lower bound.
const sourceProfile = copiedProfile();
console.log("Phase 10 data: starting legacy conversion");
const conversion = await legacyMigration.convertLegacyV12Profile(
  sourceProfile,
  "2026-08-18T09:00:00.000Z",
  bundle,
);
const durable = makeStore("durability");
console.log("Phase 10 data: applying legacy conversion");
const firstMigration = await durable.store.applyLegacyConversion(conversion);
const retryMigration = await durable.store.applyLegacyConversion(conversion);
const beforeReload = await durable.store.readProjectionSources(athleteId);
assert(firstMigration.status === "inserted" && retryMigration.status === "duplicate",
  "An exact migration retry was not idempotent");
assert(beforeReload.resetTombstone?.resetAt === sourceProfile.progressResetAt
  && beforeReload.sessionRecords.length === conversion.sessionRecords.length
  && beforeReload.evidenceEvents.length === conversion.evidenceEvents.length,
"Converted legacy observations or progressResetAt were not reconciled exactly");
durable.store.close();
console.log("Phase 10 data: reopening durable store");
const reopened = persistence.createVNextShadowStore({ databaseName: durable.databaseName });
const afterReload = await reopened.readProjectionSources(athleteId);
assert(afterReload.sourceFingerprint === beforeReload.sourceFingerprint
  && canonical(afterReload.intent) === canonical(beforeReload.intent)
  && canonical(afterReload.sessionRecords) === canonical(beforeReload.sessionRecords),
"IndexedDB reopen changed durable observation truth or Athlete Intent");

// Projection caches are an optimization only: an exact cache survives reload,
// while any authoritative append invalidates it and leaves truth replayable.
const asOf = "2026-08-20T09:00:00.000Z";
console.log("Phase 10 data: rebuilding projection cache");
const projected = projection.projectAthleteState({
  athleteId,
  asOf,
  policy,
  definitionBundles: definitions.vNextDefinitionBundles,
  evidenceEvents: afterReload.evidenceEvents,
  sessionPlans: afterReload.sessionPlans,
  sessionRecords: afterReload.sessionRecords,
  intent: afterReload.intent,
  trainabilityRequests: [],
});
assert(projected.ok && projected.state, "Durable sources did not rebuild a valid Derived Athlete State");
if (!projected.state) throw new Error("Phase 10 cache fixture could not project state");
const cacheLookup = {
  athleteId,
  asOf,
  projectionVersion: policy.version,
  catalogueVersion: bundle.catalogueVersion,
  definitionFingerprint: await persistence.sha256(definitions.vNextDefinitionBundles),
  policyId: policy.id,
  policyVersion: policy.version,
  sourceFingerprint: afterReload.sourceFingerprint,
  trainabilityRequestFingerprint: await persistence.sha256([]),
  ...(afterReload.resetTombstone ? { resetAt: afterReload.resetTombstone.resetAt } : {}),
};
await reopened.putDerivedCache({
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  ...cacheLookup,
  storedAt: asOf,
  state: projected.state,
});
assert((await reopened.getDerivedCache(cacheLookup))?.sourceFingerprint === afterReload.sourceFingerprint,
  "An exact rebuildable projection cache could not be read");
const cacheInvalidator = observedPush(athleteId, "2026-08-20T10:00:00.000Z", {
  id: "phase10-data-cache-invalidator",
});
await reopened.appendEvidenceEvent(cacheInvalidator);
assert(await reopened.getDerivedCache(cacheLookup) === null,
  "Authoritative observation append did not invalidate the rebuildable cache");
const afterCacheInvalidation = await reopened.readProjectionSources(athleteId);
assert(afterCacheInvalidation.evidenceEvents.some(({ id }) => id === cacheInvalidator.id),
  "Cache invalidation discarded the authoritative observation");
console.log("Phase 10 data: durable storage/cache passed");

// 2. Session Records are the only actual-session authority. A plan accepts a
// single immutable root and a linear correction chain, never a second root,
// missing target or fork. Duplicate retries retain one copy.
const recordAuthority = makeStore("record-authority");
const plan = structuredClone(conversion.sessionPlans[0]);
const record = structuredClone(conversion.sessionRecords[0]);
const firstAppend = await recordAuthority.store.appendSession(plan, record);
const duplicateAppend = await recordAuthority.store.appendSession(plan, record);
assert(firstAppend.plan.status === "inserted" && firstAppend.record.status === "inserted"
  && duplicateAppend.plan.status === "duplicate" && duplicateAppend.record.status === "duplicate",
"A retained Session Plan/Record retry was not exactly idempotent");
const secondRoot = {
  ...structuredClone(record),
  id: contracts.parseStableId("session-record", "phase10-data-second-root"),
  startedAt: timestamp(10),
  completedAt: timestamp(35),
  recordedAt: timestamp(36),
};
await assertRejects(
  () => recordAuthority.store.appendSession(plan, secondRoot),
  /invalid-reference/u,
  "A second unsuperseded Session Record root was accepted for one plan",
);
const missingTarget = {
  ...structuredClone(secondRoot),
  id: contracts.parseStableId("session-record", "phase10-data-missing-target"),
  supersedesRecordId: contracts.parseStableId("session-record", "phase10-data-absent-record"),
};
await assertRejects(
  () => recordAuthority.store.appendSession(plan, missingTarget),
  /invalid-reference/u,
  "A Session Record correction with an absent target was accepted",
);
const replacement = {
  ...structuredClone(secondRoot),
  id: contracts.parseStableId("session-record", "phase10-data-replacement"),
  supersedesRecordId: record.id,
};
const replacementAppend = await recordAuthority.store.appendSession(plan, replacement);
assert(replacementAppend.record.status === "inserted", "A valid linear Session Record correction was rejected");
const correctionFork = {
  ...structuredClone(replacement),
  id: contracts.parseStableId("session-record", "phase10-data-correction-fork"),
  startedAt: timestamp(40),
  completedAt: timestamp(65),
  recordedAt: timestamp(66),
};
await assertRejects(
  () => recordAuthority.store.appendSession(plan, correctionFork),
  /invalid-reference/u,
  "Two corrections were accepted from the same Session Record parent",
);
const recordSources = await recordAuthority.store.readProjectionSources(athleteId);
assert(recordSources.sessionPlans.length === 1 && recordSources.sessionRecords.length === 2,
  "Rejected Session Record writes changed the one-plan linear authority chain");
console.log("Phase 10 data: Session Record authority passed");

// 3. JSON export/import round-trips exact immutable provenance, remains
// idempotent, carries no credentials and cannot resurrect facts at/before a
// newer local reset.
const exported = await reopened.exportBundle(athleteId, metadata("2026-08-20T11:00:00.000Z"));
const exportedJson = JSON.stringify(exported);
assert(!/(?:password|authorization|bearer|accessToken|refreshToken|sessionToken)/iu.test(exportedJson),
  "Observation export included credential-shaped data");
const imported = makeStore("import");
const importFirst = await imported.store.importBundle(JSON.parse(exportedJson));
const importRetry = await imported.store.importBundle(JSON.parse(exportedJson));
const importedSources = await imported.store.readProjectionSources(athleteId);
assert(importFirst.inserted > 0 && importRetry.inserted === 0 && importRetry.duplicates > 0,
  "Observation JSON import was not idempotent");
assert(importedSources.sourceFingerprint === afterCacheInvalidation.sourceFingerprint,
  "Export/import changed the canonical observation source fingerprint");
const newerReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: contracts.parseStableId("reset", "phase10-data-newer-reset"),
  athleteId,
  resetAt: "2026-08-20T10:30:00.000Z",
  recordedAt: "2026-08-20T12:00:00.000Z",
  source: "athlete-reset",
};
await imported.store.applyProgressReset(newerReset);
await imported.store.importBundle(JSON.parse(exportedJson));
const resetImportSources = await imported.store.readProjectionSources(athleteId);
assert(resetImportSources.resetTombstone?.resetAt === newerReset.resetAt
  && resetImportSources.evidenceEvents.every((event) => event.occurredAt > newerReset.resetAt)
  && resetImportSources.sessionRecords.every((item) => item.completedAt > newerReset.resetAt),
"Import replaced a newer reset or resurrected suppressed history");
console.log("Phase 10 data: export/import/reset passed");

// 4. Rollback revokes only converter-owned claims. Native post-migration truth
// remains, and the exact pre-migration snapshot and rollback receipt stay
// recoverable for an authority rollback.
const rollback = makeStore("rollback");
await rollback.store.applyLegacyConversion(conversion);
const nativeAfterMigration = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase10-data-native-after-migration"),
  athleteId,
  occurredAt: "2026-08-21T09:00:00.000Z",
  recordedAt: "2026-08-21T09:00:00.000Z",
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_reported",
  severity: "modify",
  demandDomains: ["hand-wrist-bearing"],
  bodyRegions: ["wrist"],
};
await rollback.store.appendEvidenceEvent(nativeAfterMigration);
await rollback.store.rollbackMigrationRun(athleteId, conversion.run.id, "2026-08-22T00:00:00.000Z");
const rolledBackSources = await rollback.store.readProjectionSources(athleteId);
const rollbackExport = await rollback.store.exportBundle(athleteId, metadata("2026-08-22T01:00:00.000Z"));
assert(rolledBackSources.evidenceEvents.length === 1
  && rolledBackSources.evidenceEvents[0]?.id === nativeAfterMigration.id
  && rolledBackSources.sessionRecords.length === 0,
"Rollback deleted native truth or retained converter-owned session/evidence truth");
assert(rollbackExport.migrationSnapshots.length === 1
  && rollbackExport.migrationRuns.some((run) => run.id === conversion.run.id && run.status === "rolled-back")
  && canonical(await legacyMigration.recoverLegacyMigrationSnapshot(rollbackExport.migrationSnapshots[0]))
    === canonical(sourceProfile),
"Rollback did not retain an exact recoverable legacy snapshot and receipt");
console.log("Phase 10 data: migration rollback/recovery passed");

// 5. The remote model is an immutable-ID set union with monotonic cursors.
// Interrupted paging resumes safely, exact duplicates are acknowledged once,
// divergent same-ID payloads conflict without clearing the outbox, and two
// devices converge after disjoint offline writes.
const createMemoryShadow = () => {
  let sequence = 0;
  const rows = new Map();
  const compareReset = (left, right) => left.resetAt < right.resetAt ? -1 : left.resetAt > right.resetAt ? 1 : 0;
  const latestReset = () => [...rows.values()]
    .filter(({ item }) => item.kind === "reset-tombstone")
    .sort((left, right) => right.sequence - left.sequence)[0]?.item.payload;
  const suppressed = (item, reset) => {
    if (!reset) return false;
    if (item.kind === "evidence-event") return item.payload.occurredAt <= reset.resetAt;
    if (item.kind === "session-record") return item.payload.completedAt <= reset.resetAt;
    return false;
  };
  const transport = async (request) => {
    const conflicts = [];
    for (const item of request.upload) {
      const existing = rows.get(`${item.kind}:${item.id}`);
      if (existing && existing.item.hash !== item.hash
        && !new Set(["athlete-intent", "reset-tombstone", "migration-run"]).has(item.kind)) {
        conflicts.push({
          kind: item.kind,
          id: item.id,
          reason: "immutable-id-conflict",
          localHash: item.hash,
          incomingHash: existing.item.hash,
        });
      }
    }
    if (conflicts.length) {
      return {
        schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
        cursor: request.cursor,
        hasMore: false,
        ...(latestReset() ? { resetTombstone: structuredClone(latestReset()) } : {}),
        changes: [],
        acknowledged: [],
        conflicts,
      };
    }

    const acknowledged = [];
    for (const item of request.upload) {
      const key = `${item.kind}:${item.id}`;
      const existing = rows.get(key);
      if (item.kind === "reset-tombstone") {
        if (existing && compareReset(item.payload, existing.item.payload) < 0) {
          acknowledged.push({ kind: item.kind, id: item.id, status: "ignored-older" });
          continue;
        }
        if (existing?.item.hash === item.hash) {
          acknowledged.push({ kind: item.kind, id: item.id, status: "duplicate" });
          continue;
        }
        sequence += 1;
        rows.set(key, { sequence, item: structuredClone(item) });
        const cutoff = item.payload.resetAt;
        for (const [rowKey, row] of rows) {
          if (rowKey !== key && suppressed(row.item, item.payload)) rows.delete(rowKey);
        }
        acknowledged.push({ kind: item.kind, id: item.id, status: "inserted" });
        continue;
      }
      if (suppressed(item, latestReset())) {
        acknowledged.push({ kind: item.kind, id: item.id, status: "ignored-reset" });
        continue;
      }
      if (existing?.item.hash === item.hash) {
        acknowledged.push({ kind: item.kind, id: item.id, status: "duplicate" });
        continue;
      }
      sequence += 1;
      rows.set(key, { sequence, item: structuredClone(item) });
      acknowledged.push({ kind: item.kind, id: item.id, status: "inserted" });
    }
    const available = [...rows.values()]
      .filter((row) => row.sequence > request.cursor)
      .sort((left, right) => left.sequence - right.sequence);
    const page = available.slice(0, request.limit);
    const cursor = page.at(-1)?.sequence ?? request.cursor;
    const reset = latestReset();
    return {
      schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
      cursor,
      hasMore: available.length > page.length,
      ...(reset ? { resetTombstone: structuredClone(reset) } : {}),
      changes: page.map(({ item }) => structuredClone(item)),
      acknowledged,
      conflicts: [],
    };
  };
  return { rows, transport, latestReset };
};

const remote = createMemoryShadow();
const deviceA = makeStore("device-a");
await deviceA.store.importBundle(JSON.parse(exportedJson));
const pendingBefore = await deviceA.store.readSyncUpload(athleteId, 200);
let interruptedError;
try {
  await persistence.syncObservationDeltas(deviceA.store, athleteId, remote.transport, {
    pageSize: 2,
    maximumPages: 1,
  });
} catch (error) {
  interruptedError = error;
}
const pendingAfter = await deviceA.store.readSyncUpload(athleteId, 200);
assert(interruptedError?.message === "shadow-sync-page-limit"
  && pendingAfter.length > 0 && pendingAfter.length < pendingBefore.length,
"Interrupted sync did not retain a resumable, acknowledged cursor/outbox boundary");
const resumed = await persistence.syncObservationDeltas(deviceA.store, athleteId, remote.transport, { pageSize: 3 });
assert(resumed.pages > 0 && (await deviceA.store.readSyncUpload(athleteId, 1)).length === 0,
  "Reconnect did not drain the durable offline outbox");
const deviceB = makeStore("device-b");
await persistence.syncObservationDeltas(deviceB.store, athleteId, remote.transport, { pageSize: 3 });
assert((await deviceB.store.readProjectionSources(athleteId)).sourceFingerprint
  === (await deviceA.store.readProjectionSources(athleteId)).sourceFingerprint,
"A second device did not replay the same canonical sources from cursored deltas");

const deviceAEvent = observedPush(athleteId, "2026-08-23T09:00:00.000Z", {
  id: "phase10-data-device-a",
  observationSessionId: "phase10-data-device-a",
});
const deviceBEvent = observedPush(athleteId, "2026-08-23T09:05:00.000Z", {
  id: "phase10-data-device-b",
  observationSessionId: "phase10-data-device-b",
});
await deviceA.store.appendEvidenceEvent(deviceAEvent);
await deviceB.store.appendEvidenceEvent(deviceBEvent);
await persistence.syncObservationDeltas(deviceA.store, athleteId, remote.transport, { pageSize: 4 });
await persistence.syncObservationDeltas(deviceB.store, athleteId, remote.transport, { pageSize: 4 });
await persistence.syncObservationDeltas(deviceA.store, athleteId, remote.transport, { pageSize: 4 });
const unionA = await deviceA.store.readProjectionSources(athleteId);
const unionB = await deviceB.store.readProjectionSources(athleteId);
assert(unionA.sourceFingerprint === unionB.sourceFingerprint
  && [deviceAEvent.id, deviceBEvent.id].every((id) => unionA.evidenceEvents.some((event) => event.id === id)),
"Disjoint multi-device observations did not converge by stable-ID union");

const conflictDevice = makeStore("conflict-device");
const conflictingEvent = { ...structuredClone(deviceAEvent), outcome: "partial" };
await conflictDevice.store.appendEvidenceEvent(conflictingEvent);
await assertRejects(
  () => persistence.syncObservationDeltas(conflictDevice.store, athleteId, remote.transport, { pageSize: 4 }),
  /shadow-sync-conflict:evidence-event/u,
  "A divergent same-ID remote observation did not stop with an explicit conflict",
);
assert((await conflictDevice.store.readSyncUpload(athleteId, 10)).some(({ id }) => id === conflictingEvent.id),
  "A conflicting observation was incorrectly removed from the local outbox");

// A stale device may reconnect after another device resets progress. The
// tombstone wins before replay and facts at/before the cutoff cannot return.
const staleDevice = makeStore("stale-device");
await persistence.syncObservationDeltas(staleDevice.store, athleteId, remote.transport, { pageSize: 8 });
const staleObservation = observedPush(athleteId, "2026-08-23T10:00:00.000Z", {
  id: "phase10-data-stale-device",
  observationSessionId: "phase10-data-stale-device",
});
await staleDevice.store.appendEvidenceEvent(staleObservation);
const distributedReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: contracts.parseStableId("reset", "phase10-data-distributed-reset"),
  athleteId,
  resetAt: "2026-08-24T00:00:00.000Z",
  recordedAt: "2026-08-24T00:00:01.000Z",
  source: "athlete-reset",
};
await deviceA.store.applyProgressReset(distributedReset);
await persistence.syncObservationDeltas(deviceA.store, athleteId, remote.transport, { pageSize: 8 });
const staleSummary = await persistence.syncObservationDeltas(staleDevice.store, athleteId, remote.transport, { pageSize: 8 });
const staleSources = await staleDevice.store.readProjectionSources(athleteId);
assert(staleSummary.cursor >= resumed.cursor
  && staleSources.resetTombstone?.resetAt === distributedReset.resetAt
  && !staleSources.evidenceEvents.some(({ id }) => id === staleObservation.id)
  && [...remote.rows.values()].every(({ item }) => item.id !== staleObservation.id),
"A stale-device reconnect resurrected progress suppressed by progressResetAt");
const postResetObservation = observedPush(athleteId, "2026-08-24T09:00:00.000Z", {
  id: "phase10-data-post-reset",
  observationSessionId: "phase10-data-post-reset",
});
await staleDevice.store.appendEvidenceEvent(postResetObservation);
await persistence.syncObservationDeltas(staleDevice.store, athleteId, remote.transport, { pageSize: 8 });
await persistence.syncObservationDeltas(deviceA.store, athleteId, remote.transport, { pageSize: 8 });
assert((await deviceA.store.readProjectionSources(athleteId)).evidenceEvents.some(({ id }) => id === postResetObservation.id),
  "A valid post-reset observation did not reconcile across devices");
console.log("Phase 10 data: offline/multi-device/reset passed");

// 6. A realistically large copied profile remains within the legacy API
// envelope, converts in one transaction and replays at full cardinality.
const loadHistory = Array.from({ length: 300 }, (_, index) => ({
  id: `phase10-load-session-${index + 1}`,
  completedAt: new Date(Date.parse("2026-08-10T08:00:00.000Z") + index * 60_000).toISOString(),
  day: (index % 5) + 1,
  status: index % 9 === 0 ? "modified" : "complete",
  seconds: 1_350 + (index % 10) * 15,
  completedExerciseIds: index % 2 === 0 ? ["support-hold"] : ["tuck-support"],
}));
const loadAthleteId = contracts.parseStableId("athlete", "phase10-data-load-athlete");
const loadProfile = copiedProfile({
  profileId: loadAthleteId,
  username: "phase10-load-copy",
  revision: 301,
  updatedAt: "2026-08-15T00:00:00.000Z",
  progressResetAt: undefined,
  history: loadHistory,
});
const legacyBytes = new TextEncoder().encode(JSON.stringify(loadProfile)).byteLength;
const loadStarted = performance.now();
const loadConversion = await legacyMigration.convertLegacyV12Profile(
  loadProfile,
  "2026-08-15T00:00:01.000Z",
  bundle,
);
const loadStore = makeStore("load");
await loadStore.store.applyLegacyConversion(loadConversion);
const loadSources = await loadStore.store.readProjectionSources(loadAthleteId);
const loadElapsed = performance.now() - loadStarted;
assert(legacyBytes < 750_000
  && loadConversion.sessionRecords.length === loadHistory.length
  && loadSources.sessionRecords.length === loadHistory.length
  && loadSources.sessionPlans.length === loadHistory.length
  && loadElapsed < 30_000,
`Large-profile conversion/replay sanity failed (${legacyBytes} bytes, ${loadSources.sessionRecords.length} records, ${Math.round(loadElapsed)}ms)`);
console.log("Phase 10 data: large-profile load passed");

// 7. The additive D1 route is authenticated, account-bound, origin-bound and
// inert unless the isolated shadow flag is explicitly enabled.
class TestStatement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.database = owner.database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new TestStatement(this.owner, this.sql, values); }
  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values) ?? null;
    return column && row ? row[column] : row;
  }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class TestD1 {
  database = new DatabaseSync(":memory:");
  constructor() {
    this.database.exec(readText("profile-api/migrations/0001_password_accounts.sql"));
    this.database.exec(readText("profile-api/migrations/0002_vnext_shadow_observations.sql"));
  }
  prepare(sql) { return new TestStatement(this, sql); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
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

const allowedOrigin = "https://kyriakos243.github.io";
const endpoint = "https://profiles.phase10.example";
const cloudEnv = {
  DB: new TestD1(),
  PROFILES: new MemoryKv(),
  ALLOWED_ORIGINS: allowedOrigin,
  VNEXT_SHADOW_MODE: "true",
  VNEXT_PRODUCTION_AUTHORITY_MODE: "true",
};
const cloudRequest = (path, init = {}, origin = allowedOrigin) => new Request(`${endpoint}${path}`, {
  ...init,
  headers: { origin, ...(init.headers ?? {}) },
});
const emptySync = { schemaVersion: 1, cursor: 0, upload: [], limit: 20 };
const unauthenticated = await worker.fetch(cloudRequest("/vnext/shadow/sync", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(emptySync),
}), cloudEnv);
assert(unauthenticated.status === 401, "Shadow sync was reachable without authentication");
const registrationRequest = cloudRequest("/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.110" },
  body: JSON.stringify({ username: "Phase Ten Data Account", password: "phase ten data validation password" }),
});
const registrationResponse = await worker.fetch(registrationRequest, cloudEnv);
const registration = await registrationResponse.json();
assert(registrationResponse.status === 201 && registration.token && registration.profile?.profileId,
  "Authenticated shadow-route fixture registration failed");
const authenticatedHeaders = {
  authorization: `Bearer ${registration.token}`,
  "content-type": "application/json",
};
const enabledResponse = await worker.fetch(cloudRequest("/vnext/shadow/sync", {
  method: "POST",
  headers: authenticatedHeaders,
  body: JSON.stringify(emptySync),
}), cloudEnv);
assert(enabledResponse.status === 200, "Enabled isolated shadow route rejected an authenticated empty delta");
const staleLegacyWrite = await worker.fetch(cloudRequest("/profiles/me", {
  method: "PUT",
  headers: { ...authenticatedHeaders, "if-match": String(registration.profile.revision) },
  body: JSON.stringify({ ...registration.profile, nextProgramDay: 4 }),
}), cloudEnv);
const staleLegacyBody = await staleLegacyWrite.json();
assert(staleLegacyWrite.status === 409
  && staleLegacyBody.code === "VNEXT_AUTHORITY_ACTIVE"
  && staleLegacyBody.authority === "vnext-production"
  && staleLegacyBody.profile?.revision === registration.profile.revision,
"A stale v1.2 client could mutate legacy cloud authority after this athlete activated vNext");
const retainedLegacyRead = await worker.fetch(cloudRequest("/profiles/me", {
  method: "GET",
  headers: authenticatedHeaders,
}), cloudEnv);
assert(retainedLegacyRead.status === 200,
  "The authority gate blocked retained legacy provenance reads needed for migration/account compatibility");
const disabledResponse = await worker.fetch(cloudRequest("/vnext/shadow/sync", {
  method: "POST",
  headers: authenticatedHeaders,
  body: JSON.stringify(emptySync),
}), { ...cloudEnv, VNEXT_SHADOW_MODE: undefined });
assert(disabledResponse.status === 404, "Production-like Worker exposed shadow sync without its explicit flag");
const foreignOrigin = await worker.fetch(cloudRequest("/health", { method: "GET" }, "https://attacker.example"), cloudEnv);
assert(foreignOrigin.status === 403, "Profile Worker accepted a disallowed request origin");
const foreignAthleteId = contracts.parseStableId("athlete", "phase10-foreign-athlete");
const foreignReset = {
  schemaVersion: 1,
  id: contracts.parseStableId("reset", "phase10-foreign-reset"),
  athleteId: foreignAthleteId,
  resetAt: "2026-08-20T00:00:00.000Z",
  recordedAt: "2026-08-20T00:00:00.000Z",
  source: "sync",
};
const foreignResponse = await worker.fetch(cloudRequest("/vnext/shadow/sync", {
  method: "POST",
  headers: authenticatedHeaders,
  body: JSON.stringify({
    ...emptySync,
    upload: [{
      kind: "reset-tombstone",
      id: foreignAthleteId,
      hash: await persistence.sha256(foreignReset),
      payload: foreignReset,
    }],
  }),
}), cloudEnv);
const foreignBody = await foreignResponse.json();
assert(foreignResponse.status === 403 && foreignBody.code === "vnext-athlete-ownership",
  "Authenticated shadow sync accepted an observation owned by another athlete");
console.log("Phase 10 data: authenticated D1 isolation passed");

// 8. Static release configuration preserves mutually exclusive app/API/cache
// lanes, safe service-worker activation and additive/immutable database truth.
const workerSource = readText("profile-api/worker.js");
const shadowSource = readText("profile-api/vnext-shadow.js");
const syncSource = readText("app/vnext/persistence/sync.ts");
const indexedDbSource = readText("app/vnext/persistence/indexedDb.ts");
const profileStoreSource = readText("app/profileStore.ts");
const migrationSql = readText("profile-api/migrations/0002_vnext_shadow_observations.sql");
const serviceWorker = readText("public/sw.js");
const distValidator = readText("scripts/validate-dist.mjs");
const packageSource = readText("package.json");
const viteSource = readText("vite.config.ts");
const deploymentWorkflow = readText(".github/workflows/deploy-pages.yml");
const productionWorkerConfig = readText("profile-api/wrangler.toml");
const rcWorkerConfig = readText("profile-api/wrangler.vnext-rc.toml.example");

assert(workerSource.indexOf("const account = await authorize(request, env)")
    < workerSource.indexOf('url.pathname === "/vnext/shadow/sync"')
  && workerSource.includes('env.VNEXT_SHADOW_MODE === "true"')
  && workerSource.includes("readVNextShadowJson")
  && workerSource.includes("MAX_VNEXT_SHADOW_BYTES"),
"Worker route lost authentication ordering, explicit shadow gating or its dedicated body ceiling");
assert(shadowSource.includes("FORBIDDEN_SNAPSHOT_KEYS")
  && shadowSource.includes("vnext-athlete-ownership")
  && shadowSource.includes("vnext-session-authority")
  && shadowSource.includes("MAX_UPLOAD_ITEMS = 8")
  && shadowSource.includes("MAX_DELTA_RESPONSE_BYTES")
  && shadowSource.includes("progressResetAt")
  && shadowSource.includes("ignored-reset"),
"Remote shadow contract lost credential filtering, ownership/session authority, bounded paging or reset suppression");
assert(syncSource.includes("createAuthenticatedShadowTransport")
  && !/(?:localStorage|sessionStorage|document\.cookie)/u.test(syncSource)
  && syncSource.includes("shadow-sync-conflict")
  && syncSource.includes("shadow-sync-stalled-cursor")
  && syncSource.includes("shadow-sync-page-limit"),
"Client delta sync now owns credentials or lost explicit conflict/cursor failure modes");
assert(profileStoreSource.includes("const endpoint = `${REMOTE_API}/vnext/shadow/sync`")
  && profileStoreSource.includes("vNext shadow sync refused an unexpected endpoint")
  && profileStoreSource.includes("It never reads or writes the v1.2 profile")
  && !/syncVNextShadowObservations[\s\S]{0,1800}(?:saveProfile|resetProfileTraining)\s*\(/u.test(profileStoreSource),
"Narrow account adapter can leave the fixed shadow endpoint or invoke legacy training-profile writes");
assert(indexedDbSource.includes("Session Records form one immutable correction chain per Session Plan")
  && indexedDbSource.includes("assertLinearSessionRecordSet")
  && indexedDbSource.includes("Derived cache does not match current observation sources")
  && indexedDbSource.includes("#purgeAtReset")
  && indexedDbSource.includes("migrationRunId"),
"Local persistence lost one-record authority, rebuildable-cache identity, reset purge or migration provenance");
assert(migrationSql.includes("vnext_shadow_changes_immutable_identity_idx")
  && migrationSql.includes("vnext_shadow_plans_immutable")
  && migrationSql.includes("vnext_shadow_events_immutable")
  && migrationSql.includes("vnext_shadow_records_immutable")
  && migrationSql.includes("ON DELETE CASCADE")
  && migrationSql.includes("vnext_shadow_projection_caches")
  && !/FOREIGN KEY[^\n]+vnext_shadow_projection_caches/u.test(migrationSql),
"D1 schema lost immutable IDs/triggers, account cascade or cache/truth separation");
assert(serviceWorker.includes('const CACHE_CHANNEL = "__PWA_CACHE_CHANNEL__";')
  && serviceWorker.includes("parallette-25-${CACHE_CHANNEL}-")
  && serviceWorker.includes("manifest.channel !== CACHE_CHANNEL")
  && serviceWorker.includes("key.startsWith(CACHE_PREFIX)")
  && serviceWorker.includes('const VNEXT_RC_PATH = "/parallettes/vnext-rc/";')
  && serviceWorker.includes('CACHE_CHANNEL === "v1" && requestUrl.pathname.startsWith(VNEXT_RC_PATH)')
  && !serviceWorker.includes("self.skipWaiting("),
"Service worker lost lane-isolated caches, parent-RC exclusion or safe waiting activation");
assert(distValidator.includes('P25_PWA_VARIANT ?? "v1"')
  && distValidator.includes('P25_PWA_CACHE_CHANNEL ?? "v1"')
  && distValidator.includes('P25_PWA_BASE ?? "/parallettes/"')
  && distValidator.includes("crossed cache channel or deployment base")
  && distValidator.indexOf("writeFileSync(assetManifestPath") < distValidator.indexOf("writeFileSync(builtWorkerPath"),
"Distribution validation lost exact lane identity or manifest-before-worker ordering");
assert(packageSource.includes('"build": "VITE_VNEXT_PRODUCTION_ENABLED=false VITE_VNEXT_RC_ENABLED=false vite build"')
  && packageSource.includes('"build:vnext-rc": "P25_BUILD_BASE=/parallettes/vnext-rc/')
  && packageSource.includes('"build:vnext-production": "node scripts/validate-vnext-production-env.mjs && P25_BUILD_BASE=/parallettes/ VITE_VNEXT_PRODUCTION_ENABLED=true')
  && viteSource.includes('base: process.env.P25_BUILD_BASE ?? "/parallettes/"')
  && !deploymentWorkflow.includes("build:vnext-rc")
  && !deploymentWorkflow.includes("VITE_VNEXT_RC_ENABLED")
  && deploymentWorkflow.includes("pnpm build:vnext-production")
  && deploymentWorkflow.includes("pnpm validate:dist:vnext-production"),
"Build/deployment configuration can mix the RC and ordinary production lanes");
assert(productionWorkerConfig.includes('VNEXT_SHADOW_MODE = "true"')
  && productionWorkerConfig.includes('VNEXT_PRODUCTION_AUTHORITY_MODE = "true"')
  && productionWorkerConfig.includes('database_id = "4dfe10d8-e66e-4115-ac7d-6be01eacd75e"')
  && !productionWorkerConfig.includes("replace-with-isolated-vnext-rc")
  && rcWorkerConfig.includes('VNEXT_SHADOW_MODE = "true"')
  && !rcWorkerConfig.includes("VNEXT_PRODUCTION_AUTHORITY_MODE")
  && rcWorkerConfig.includes("replace-with-isolated-vnext-rc-origin.example")
  && rcWorkerConfig.includes("replace-with-isolated-vnext-rc-kv-namespace-id")
  && rcWorkerConfig.includes("replace-with-isolated-vnext-rc-d1-database-id"),
"RC API bindings are not isolated placeholders or the accepted Phase 11 production authority pair is incoherent");

for (const { store } of [
  recordAuthority,
  imported,
  rollback,
  deviceA,
  deviceB,
  conflictDevice,
  staleDevice,
  loadStore,
]) store.close();
reopened.close();

if (failures.length) {
  console.error(`vNext Phase 10 data validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    "vNext Phase 10 data validation passed: durable IndexedDB/rebuildable caches, idempotent migration, linear Session Record authority, export/import/rollback, offline cursor replay, multi-device union, stale-reset suppression, 300-session load, authenticated D1 isolation, and PWA/deployment lanes are coherent.",
  );
}
