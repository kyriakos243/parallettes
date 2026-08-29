import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  PHASE11_RELEASE,
  buildPhase11RollbackPlan,
  validateLocalPhase11Source,
  validatePhase11Preflight,
  validatePhase11Reconciliation,
  validateProfileApiHealth,
} from "./vnext-phase11-release-ops.mjs";
import { buildProfileApiReleaseHealth } from "../profile-api/release-health.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

class Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }
  bind(...bindings) { return new Statement(this.database, this.sql, bindings); }
  async all() { return { results: this.database.prepare(this.sql).all(...this.bindings) }; }
  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.bindings) ?? null;
    return column && row ? row[column] : row;
  }
}

class D1 {
  database = new DatabaseSync(":memory:");
  prepare(sql) { return new Statement(this.database, sql); }
}

const database = new D1();
assert(PHASE11_RELEASE.productionDatabaseId === "4dfe10d8-e66e-4115-ac7d-6be01eacd75e",
  "Phase 11 production database identity changed");
database.database.exec(readFileSync("profile-api/migrations/0001_password_accounts.sql", "utf8"));
const legacyHealth = await buildProfileApiReleaseHealth({ DB: database });
assert(legacyHealth.ok && legacyHealth.schema.legacyReady, "Legacy schema did not remain healthy");
assert(!legacyHealth.release.identityReady && !legacyHealth.schema.observationsReady && !legacyHealth.vnext.ready,
  "Legacy-only health overstated vNext readiness");

database.database.exec(readFileSync("profile-api/migrations/0002_vnext_shadow_observations.sql", "utf8"));
database.database.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO d1_migrations (name, applied_at) VALUES ('0002_vnext_shadow_observations.sql', '2026-08-28T16:00:00.000Z');");
const identity = {
  VNEXT_RELEASE_ID: PHASE11_RELEASE.id,
  VNEXT_RELEASE_SOURCE_CANDIDATE: PHASE11_RELEASE.sourceCandidateId,
  VNEXT_RELEASE_SOURCE_FINGERPRINT: PHASE11_RELEASE.sourceFingerprint,
  VNEXT_DATABASE_ID: PHASE11_RELEASE.productionDatabaseId,
};
const disabledHealth = await buildProfileApiReleaseHealth({ DB: database, ...identity });
assert(disabledHealth.release.identityReady && disabledHealth.schema.observationsReady
  && disabledHealth.release.databaseIdentityReady
  && disabledHealth.schema.immutabilityReady && disabledHealth.schema.migrationHistoryReady
  && disabledHealth.schema.fingerprintReady && !disabledHealth.vnext.syncEnabled && !disabledHealth.vnext.ready,
"Disabled API health did not keep identity, schema and sync as separate gates");
assert(validateProfileApiHealth(disabledHealth).pass, "Disabled API preflight should pass before sync enablement");

const enabledHealth = await buildProfileApiReleaseHealth({
  DB: database,
  ...identity,
  VNEXT_SHADOW_MODE: "true",
  VNEXT_PRODUCTION_AUTHORITY_MODE: "true",
});
assert(enabledHealth.vnext.ready && validateProfileApiHealth(enabledHealth, { requireSync: true }).pass,
  "Enabled API health did not reach exact vNext readiness");

const sha = "a".repeat(64);
const testNow = Date.now();
const at = (offsetMs) => new Date(testNow + offsetMs).toISOString();
const releaseAttemptId = "2a2e24f0-1b63-4e77-8fd0-2f39e702a811";
const preflight = {
  schemaVersion: 1,
  verifiedAt: at(0),
  releaseAttempt: {
    id: releaseAttemptId,
    startedAt: at(-30 * 60 * 1000),
    pagesOrigin: PHASE11_RELEASE.productionPagesOrigin,
    profileApiOrigin: PHASE11_RELEASE.productionProfileApiOrigin,
    databaseId: PHASE11_RELEASE.productionDatabaseId,
  },
  release: {
    id: PHASE11_RELEASE.id,
    sourceCandidateId: PHASE11_RELEASE.sourceCandidateId,
    sourceFingerprint: PHASE11_RELEASE.sourceFingerprint,
    phase10OwnerApproved: true,
    deployedBaseline: {
      requiredCommit: PHASE11_RELEASE.requiredBaselineCommit,
      containsRequiredCommit: true,
      artifactRef: "pages-deployment-verified",
      artifactCommit: "4507da4ee40616e97106698f18f49ad74d1600b3",
      verifiedAt: at(-25 * 60 * 1000),
    },
  },
  owners: { release: "release-owner", rollback: "rollback-owner", rollbackAcknowledged: true },
  observationWindow: { endsAt: at(24 * 60 * 60 * 1000), decisionChannel: "release-bridge" },
  rehearsals: { stagingMigrationPassed: true, rollbackPassed: true },
  snapshot: {
    capturedAt: at(-20 * 60 * 1000),
    timeTravelBookmark: "00000085-0000024c-safe-bookmark",
    fullExportSha256: sha,
    legacyAccountsExportSha256: sha,
    recoveryVerified: true,
    storageRef: "operator-controlled-release-evidence",
  },
  artifacts: {
    appSha256: PHASE11_RELEASE.productionArtifact.indexSha256,
    serviceWorkerSha256: PHASE11_RELEASE.productionArtifact.serviceWorkerSha256,
    distSetSha256: PHASE11_RELEASE.productionArtifact.distSetSha256,
    buildId: PHASE11_RELEASE.productionArtifact.buildId,
    releaseId: PHASE11_RELEASE.id,
    pagesOrigin: PHASE11_RELEASE.productionPagesOrigin,
    profileApiOrigin: PHASE11_RELEASE.productionProfileApiOrigin,
    databaseId: PHASE11_RELEASE.productionDatabaseId,
    capturedAt: at(-15 * 60 * 1000),
    profileApiVersionId: "worker-version-reference",
    cacheChannel: PHASE11_RELEASE.productionArtifact.cacheChannel,
  },
  rollbackArtifact: {
    lane: "v1",
    sourceCommit: "4507da4ee40616e97106698f18f49ad74d1600b3",
    pagesDeploymentId: "pages-deployment-verified",
    buildId: "b".repeat(20),
    serviceWorkerSha256: sha,
    cacheChannel: "v1",
    mechanism: "manual rollback-v1 workflow lane",
    verifiedAt: at(-10 * 60 * 1000),
  },
  authority: {
    before: { read: "v1.2", write: "v1.2" },
    after: { read: "vnext-production", write: "vnext-production" },
  },
  apiHealth: disabledHealth,
};
assert(validatePhase11Preflight(preflight, { nowMs: testNow }).pass, "Valid disabled-API preflight was rejected");
assert(validatePhase11Preflight({ ...preflight, apiHealth: enabledHealth }, { requireSync: true, nowMs: testNow }).pass,
  "Valid final cutover preflight was rejected");
assert(!validatePhase11Preflight({ ...preflight, accessToken: "must-not-appear" }).pass,
  "Credential-like evidence was not rejected");
assert(!validatePhase11Preflight({
  ...preflight,
  release: { ...preflight.release, sourceFingerprint: "b".repeat(64) },
}).pass, "Changed accepted source fingerprint was not rejected");
assert(!validatePhase11Preflight({
  ...preflight,
  verifiedAt: at(-3 * 60 * 60 * 1000),
}, { nowMs: testNow }).pass, "Stale preflight evidence was replayable after its freshness window");
assert(!validatePhase11Preflight({
  ...preflight,
  releaseAttempt: { ...preflight.releaseAttempt, databaseId: "wrong-database" },
}, { nowMs: testNow }).pass, "Preflight evidence for another D1 target was accepted");

const reconciliation = {
  schemaVersion: 1,
  release: {
    id: PHASE11_RELEASE.id,
    sourceCandidateId: PHASE11_RELEASE.sourceCandidateId,
    sourceFingerprint: PHASE11_RELEASE.sourceFingerprint,
  },
  capturedAt: at(1 * 60 * 1000),
  releaseBinding: {
    releaseAttemptId,
    pagesOrigin: PHASE11_RELEASE.productionPagesOrigin,
    profileApiOrigin: PHASE11_RELEASE.productionProfileApiOrigin,
    databaseId: PHASE11_RELEASE.productionDatabaseId,
    distSetSha256: PHASE11_RELEASE.productionArtifact.distSetSha256,
    profileApiVersionId: "worker-version-reference",
  },
  preexistingLegacyAuthorityBeforeSha256: sha,
  preexistingLegacyAuthorityAfterSha256: sha,
  legacyAuthorityBoundary: {
    initialRecoveryProjectionSha256: sha,
    latestPreexistingWriteAt: at(-30_000),
    cutoverAt: at(0),
    baselineCapturedAt: at(30_000),
  },
  expectedMigratedProfiles: 2,
  beforeMetrics: {
    accounts: 1,
    syncHeads: 0,
    legacySnapshots: 0,
    migrationRunsActive: 0,
    migrationRunsRolledBack: 0,
    sessionPlans: 0,
    evidenceEvents: 0,
    sessionRecords: 0,
  },
  metrics: {
    accounts: 3,
    syncHeads: 2,
    legacySnapshots: 2,
    migrationRunsActive: 2,
    migrationRunsRolledBack: 0,
    sessionPlans: 2,
    evidenceEvents: 2,
    sessionRecords: 2,
  },
  violations: {
    athleteIdentityMismatch: 0,
    changeCursorBehind: 0,
    eventAtOrBeforeReset: 0,
    recordAtOrBeforeReset: 0,
    recordWithoutPlan: 0,
    correctionWithoutTarget: 0,
    recordCorrectionUnreachable: 0,
    branchedRecordCorrection: 0,
    multipleRootSessionRecords: 0,
    eventTargetMissing: 0,
    resetHeadWithoutTombstone: 0,
    activeMigrationWithoutSnapshot: 0,
    rollbackRefWithoutTerminalRun: 0,
    immutableChangeWithoutTypedRow: 0,
  },
  smokeChecks: {
    fresh: true,
    migrated: true,
    offlineReplay: true,
    multiDevice: true,
    sessionLoop: true,
    resetStaleDevice: true,
    staleCache: true,
    rollbackReady: true,
  },
  apiHealth: enabledHealth,
};
assert(validatePhase11Reconciliation(reconciliation, { preflight, nowMs: testNow + 60_000 }).pass, "Valid reconciliation evidence was rejected");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  violations: { ...reconciliation.violations, recordWithoutPlan: 1 },
}).pass, "A data-integrity violation was accepted");
assert(!validatePhase11Reconciliation({ ...reconciliation, violations: {} }).pass,
  "An incomplete invariant report was accepted");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  expectedMigratedProfiles: 0,
}, { preflight, nowMs: testNow + 60_000 }).pass, "A zero-profile migration rehearsal was accepted");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  releaseBinding: { ...reconciliation.releaseBinding, releaseAttemptId: "688be966-ab02-46c0-aad9-d659a3467e0a" },
}, { preflight, nowMs: testNow + 60_000 }).pass, "Reconciliation from another release attempt was accepted");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  preexistingLegacyAuthorityAfterSha256: "b".repeat(64),
}, { preflight, nowMs: testNow + 60_000 }).pass, "Changed pre-existing legacy authority was accepted");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  legacyAuthorityBoundary: {
    ...reconciliation.legacyAuthorityBoundary,
    latestPreexistingWriteAt: at(30_000),
  },
}, { preflight, nowMs: testNow + 60_000 }).pass, "A post-cutover legacy authority write was accepted");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  legacyAuthorityBoundary: {
    ...reconciliation.legacyAuthorityBoundary,
    baselineCapturedAt: at(-30_000),
  },
}, { preflight, nowMs: testNow + 60_000 }).pass, "A pre-cutover authority baseline was accepted");
assert(!validatePhase11Reconciliation({
  ...reconciliation,
  legacyAuthorityBoundary: {
    ...reconciliation.legacyAuthorityBoundary,
    cutoverAt: at(-11 * 60 * 1000),
  },
}, { preflight, nowMs: testNow + 60_000 }).pass, "A cutover predating the release attempt was accepted");

const rollback = buildPhase11RollbackPlan({ owners: { rollback: "rollback-owner" } });
assert(rollback.executable === false && rollback.dataRestoreIncluded === false
  && rollback.steps.every((step) => !/delete|restore d1|time travel restore/iu.test(step)),
"Ordinary rollback plan became executable or destructive");

const reconciliationSql = readFileSync("profile-api/phase11-reconciliation.sql", "utf8");
const executableSql = reconciliationSql.replace(/^\s*--.*$/gmu, "");
assert(!/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|CREATE)\b/iu.test(executableSql),
  "Phase 11 reconciliation SQL is not read-only");
database.database.exec(reconciliationSql);

const source = validateLocalPhase11Source(process.cwd());
assert(source.pass, `Local Phase 11 source preflight failed: ${JSON.stringify(source.issues)}`);

console.log("Phase 11 release operations: source identity, API health/schema gates, fail-closed preflight, reconciliation, secret rejection and non-destructive rollback plan passed.");
