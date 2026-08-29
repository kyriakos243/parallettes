#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PHASE11_RELEASE = Object.freeze({
  id: "parallette25-vnext.1",
  sourceCandidateId: "parallette25-vnext-rc.3",
  sourceFingerprint: "1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47",
  requiredBaselineCommit: "61b08766250100d502744b4c64a244e3d6f5fd6b",
  productionDatabaseId: "4dfe10d8-e66e-4115-ac7d-6be01eacd75e",
  productionPagesOrigin: "https://kyriakos243.github.io/parallettes/",
  productionProfileApiOrigin: "https://parallette25-profile-api.kyriakos243.workers.dev",
  requiredMigration: "0002_vnext_shadow_observations.sql",
  syncRoute: "/vnext/shadow/sync",
  productionArtifact: Object.freeze({
    status: "frozen",
    buildId: "33055d9391f5136450dc",
    cacheChannel: "vnext-production1",
    distSetSha256: "6ea84cd7835a8d605708e33fa9e673534d38c5fed230914162e1842b55dee6d4",
    indexSha256: "b71ee89b23b48902a5334957644a9d0efbac27f1a006821b2ba9dda3b9fc0991",
    serviceWorkerSha256: "ba25a9139c854e7bbe4708ddea9e39e24cd0df4bc027d800d54a5241ec473d9f",
    profileApiOrigin: "https://parallette25-profile-api.kyriakos243.workers.dev",
  }),
});

const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SENSITIVE_KEY = /(?:authorization|bearer|password|recovery(?:code|hash)|secret|(?:session|access|refresh)[-_]?token|api[-_]?key)/iu;
const REQUIRED_RECONCILIATION_METRICS = Object.freeze([
  "accounts",
  "syncHeads",
  "legacySnapshots",
  "migrationRunsActive",
  "migrationRunsRolledBack",
  "sessionPlans",
  "evidenceEvents",
  "sessionRecords",
]);
const REQUIRED_RECONCILIATION_INVARIANTS = Object.freeze([
  "athleteIdentityMismatch",
  "changeCursorBehind",
  "eventAtOrBeforeReset",
  "recordAtOrBeforeReset",
  "recordWithoutPlan",
  "correctionWithoutTarget",
  "recordCorrectionUnreachable",
  "branchedRecordCorrection",
  "multipleRootSessionRecords",
  "eventTargetMissing",
  "resetHeadWithoutTombstone",
  "activeMigrationWithoutSnapshot",
  "rollbackRefWithoutTerminalRun",
  "immutableChangeWithoutTypedRow",
]);

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const issue = (issues, code, message) => issues.push({ code, message });
const exactTime = (value) => ISO_UTC.test(value ?? "") ? Date.parse(value) : Number.NaN;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const MAX_PREFLIGHT_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_RECONCILIATION_AGE_MS = 2 * 60 * 60 * 1000;

const sensitivePaths = (value, path = "$", found = []) => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => sensitivePaths(child, `${path}[${index}]`, found));
  } else if (object(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SENSITIVE_KEY.test(key)) found.push(childPath);
      sensitivePaths(child, childPath, found);
    }
  }
  return found;
};

const validateIdentity = (value, issues, prefix = "release") => {
  if (!object(value)) {
    issue(issues, `${prefix}-missing`, `${prefix} must be an object.`);
    return;
  }
  if (value.id !== PHASE11_RELEASE.id) issue(issues, `${prefix}-id`, `Expected ${PHASE11_RELEASE.id}.`);
  if (value.sourceCandidateId !== PHASE11_RELEASE.sourceCandidateId) {
    issue(issues, `${prefix}-source-candidate`, `Expected provenance candidate ${PHASE11_RELEASE.sourceCandidateId}.`);
  }
  if (value.sourceFingerprint !== PHASE11_RELEASE.sourceFingerprint) {
    issue(issues, `${prefix}-source-fingerprint`, "The accepted RC.3 source fingerprint changed.");
  }
};

export const validateProfileApiHealth = (health, { requireSync = false } = {}) => {
  const issues = [];
  if (!object(health)) return { pass: false, issues: [{ code: "health-missing", message: "API health must be an object." }] };
  if (health.ok !== true || health.auth !== "password" || health.storage !== "d1") {
    issue(issues, "legacy-health", "The password/D1 profile API is not healthy.");
  }
  validateIdentity({
    id: health.release?.id,
    sourceCandidateId: health.release?.sourceCandidateId,
    sourceFingerprint: health.release?.sourceFingerprint,
  }, issues, "health-release");
  if (health.release?.identityReady !== true) issue(issues, "health-identity", "The deployed API identity is not release-ready.");
  if (health.release?.databaseId !== PHASE11_RELEASE.productionDatabaseId
    || health.release?.databaseIdentityReady !== true) {
    issue(issues, "health-database", "The deployed API is not bound to the exact production D1 database.");
  }
  if (!ISO_UTC.test(health.capturedAt ?? "")) issue(issues, "health-time", "API health must carry an exact capture timestamp.");
  if (health.schema?.legacyReady !== true) issue(issues, "health-legacy-schema", "The v1.2 account schema is not ready.");
  if (health.schema?.observationsReady !== true || health.schema?.immutabilityReady !== true) {
    issue(issues, "health-vnext-schema", "Migration 0002 tables or immutable-history triggers are incomplete.");
  }
  if (health.schema?.migrationHistoryReady !== true
    || health.schema?.fingerprintReady !== true
    || !SHA256.test(health.schema?.fingerprint ?? "")
    || health.schema?.fingerprint !== health.schema?.expectedFingerprint) {
    issue(issues, "health-schema-fingerprint", "The exact schema fingerprint or D1 migration-history row is not ready.");
  }
  if (health.schema?.requiredMigration !== PHASE11_RELEASE.requiredMigration) {
    issue(issues, "health-migration-id", `Expected ${PHASE11_RELEASE.requiredMigration}.`);
  }
  if (health.vnext?.syncRoute !== PHASE11_RELEASE.syncRoute) issue(issues, "health-sync-route", "The sync route identity changed.");
  if (requireSync && (health.vnext?.syncEnabled !== true
    || health.vnext?.productionAuthorityEnabled !== true
    || health.vnext?.ready !== true)) {
    issue(issues, "health-sync-disabled", "The final cutover gate requires authenticated vNext sync and production authority together.");
  }
  if (!requireSync && (health.vnext?.syncEnabled !== false
    || health.vnext?.productionAuthorityEnabled !== false)) {
    issue(issues, "health-sync-enabled-early", "The disabled-API preflight must run before vNext sync is enabled.");
  }
  return { pass: issues.length === 0, issues };
};

export const validatePhase11Preflight = (
  evidence,
  { requireSync = false, nowMs = Date.now() } = {},
) => {
  const issues = [];
  if (!object(evidence)) return { pass: false, stage: requireSync ? "cutover" : "disabled-api", issues: [{ code: "evidence-missing", message: "Evidence must be an object." }] };
  if (evidence.schemaVersion !== 1) issue(issues, "evidence-version", "Evidence schemaVersion must be 1.");
  const forbidden = sensitivePaths(evidence);
  if (forbidden.length) issue(issues, "secret-material", `Release evidence contains forbidden credential-like keys: ${forbidden.join(", ")}.`);
  validateIdentity(evidence.release, issues);
  if (evidence.release?.phase10OwnerApproved !== true) issue(issues, "phase10-approval", "Phase 10 owner approval is not recorded.");

  const attempt = evidence.releaseAttempt;
  if (!object(attempt) || !UUID.test(attempt.id ?? "")
    || !ISO_UTC.test(attempt.startedAt ?? "")
    || attempt.pagesOrigin !== PHASE11_RELEASE.productionPagesOrigin
    || attempt.profileApiOrigin !== PHASE11_RELEASE.productionProfileApiOrigin
    || attempt.databaseId !== PHASE11_RELEASE.productionDatabaseId) {
    issue(issues, "release-attempt", "Evidence must bind one fresh release-attempt ID to the exact Pages, Worker and D1 targets.");
  }
  const startedAt = exactTime(attempt?.startedAt);
  const verifiedAt = exactTime(evidence.verifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt < startedAt
    || verifiedAt > nowMs + 5 * 60 * 1000
    || nowMs - verifiedAt > MAX_PREFLIGHT_AGE_MS) {
    issue(issues, "evidence-freshness", "Preflight verification must be chronological and no more than two hours old.");
  }

  const baseline = evidence.release?.deployedBaseline;
  if (!object(baseline)
    || baseline.requiredCommit !== PHASE11_RELEASE.requiredBaselineCommit
    || baseline.containsRequiredCommit !== true
    || !nonEmpty(baseline.artifactRef)
    || !/^[a-f0-9]{40}$/u.test(baseline.artifactCommit ?? "")
    || !ISO_UTC.test(baseline.verifiedAt ?? "")) {
    issue(issues, "deployed-baseline", "The deployed artifact has not been tied to the required 61b0876 baseline with dated evidence.");
  }
  if (Number.isFinite(startedAt) && exactTime(baseline?.verifiedAt) < startedAt) {
    issue(issues, "deployed-baseline", "Baseline verification predates this release attempt.");
  }

  if (!nonEmpty(evidence.owners?.release) || !nonEmpty(evidence.owners?.rollback)
    || evidence.owners?.rollbackAcknowledged !== true) {
    issue(issues, "owners", "Named release and rollback owners, with rollback acknowledgement, are required.");
  }
  if (!ISO_UTC.test(evidence.observationWindow?.endsAt ?? "")
    || !nonEmpty(evidence.observationWindow?.decisionChannel)) {
    issue(issues, "observation-window", "A bounded observation-window end and rollback decision channel are required.");
  }
  const observationEnd = exactTime(evidence.observationWindow?.endsAt);
  if (Number.isFinite(verifiedAt)
    && (!Number.isFinite(observationEnd) || observationEnd <= verifiedAt
      || observationEnd - verifiedAt > 48 * 60 * 60 * 1000)) {
    issue(issues, "observation-window", "The observation window must be a future window of no more than 48 hours for this attempt.");
  }
  if (evidence.rehearsals?.stagingMigrationPassed !== true || evidence.rehearsals?.rollbackPassed !== true) {
    issue(issues, "rehearsals", "The staging migration and rollback rehearsals must both pass.");
  }

  const snapshot = evidence.snapshot;
  if (!object(snapshot)
    || !ISO_UTC.test(snapshot.capturedAt ?? "")
    || !nonEmpty(snapshot.timeTravelBookmark)
    || !SHA256.test(snapshot.fullExportSha256 ?? "")
    || !SHA256.test(snapshot.legacyAccountsExportSha256 ?? "")
    || snapshot.recoveryVerified !== true
    || !nonEmpty(snapshot.storageRef)) {
    issue(issues, "snapshot", "A dated, recoverable Time Travel bookmark and hashed full/accounts exports are required.");
  }
  if (ISO_UTC.test(snapshot?.capturedAt ?? "") && ISO_UTC.test(evidence.observationWindow?.endsAt ?? "")
    && Date.parse(evidence.observationWindow.endsAt) <= Date.parse(snapshot.capturedAt)) {
    issue(issues, "observation-window", "The observation window must end after the production snapshot.");
  }
  if (Number.isFinite(startedAt) && exactTime(snapshot?.capturedAt) < startedAt) {
    issue(issues, "snapshot", "The production snapshot predates this release attempt.");
  }

  const artifacts = evidence.artifacts;
  const frozen = PHASE11_RELEASE.productionArtifact;
  if (!object(artifacts)
    || !SHA256.test(artifacts.appSha256 ?? "")
    || !SHA256.test(artifacts.serviceWorkerSha256 ?? "")
    || !SHA256.test(artifacts.distSetSha256 ?? "")
    || !/^[a-f0-9]{20}$/u.test(artifacts.buildId ?? "")
    || artifacts.releaseId !== PHASE11_RELEASE.id
    || artifacts.pagesOrigin !== PHASE11_RELEASE.productionPagesOrigin
    || artifacts.profileApiOrigin !== PHASE11_RELEASE.productionProfileApiOrigin
    || artifacts.databaseId !== PHASE11_RELEASE.productionDatabaseId
    || frozen.status !== "frozen"
    || artifacts.appSha256 !== frozen.indexSha256
    || artifacts.serviceWorkerSha256 !== frozen.serviceWorkerSha256
    || artifacts.distSetSha256 !== frozen.distSetSha256
    || artifacts.buildId !== frozen.buildId
    || artifacts.cacheChannel !== frozen.cacheChannel
    || artifacts.profileApiOrigin !== frozen.profileApiOrigin
    || !ISO_UTC.test(artifacts.capturedAt ?? "")
    || !nonEmpty(artifacts.profileApiVersionId)
    || !nonEmpty(artifacts.cacheChannel)
    || artifacts.cacheChannel === "v1") {
    issue(issues, "artifacts", "Hashed app/service-worker artifacts, the Worker version, and a non-v1 cache channel are required.");
  }
  if (Number.isFinite(startedAt) && exactTime(artifacts?.capturedAt) < startedAt) {
    issue(issues, "artifacts", "Artifact capture predates this release attempt.");
  }
  const rollback = evidence.rollbackArtifact;
  if (!object(rollback)
    || rollback.lane !== "v1"
    || rollback.sourceCommit !== evidence.release?.deployedBaseline?.artifactCommit
    || !nonEmpty(rollback.pagesDeploymentId)
    || !/^[a-f0-9]{20}$/u.test(rollback.buildId ?? "")
    || !SHA256.test(rollback.serviceWorkerSha256 ?? "")
    || rollback.cacheChannel !== "v1"
    || !nonEmpty(rollback.mechanism)
    || !ISO_UTC.test(rollback.verifiedAt ?? "")) {
    issue(issues, "rollback-artifact", "Rollback must name and verify an exact restorable v1 artifact and mechanism.");
  }
  if (Number.isFinite(startedAt) && exactTime(rollback?.verifiedAt) < startedAt) {
    issue(issues, "rollback-artifact", "Rollback artifact verification predates this release attempt.");
  }
  if (evidence.authority?.before?.read !== "v1.2" || evidence.authority?.before?.write !== "v1.2"
    || evidence.authority?.after?.read !== "vnext-production" || evidence.authority?.after?.write !== "vnext-production") {
    issue(issues, "authority", "Cutover must move coherently from v1.2 read/write to vNext production read/write.");
  }

  const health = validateProfileApiHealth(evidence.apiHealth, { requireSync });
  issues.push(...health.issues);
  const healthCapturedAt = exactTime(evidence.apiHealth?.capturedAt);
  if (Number.isFinite(startedAt) && healthCapturedAt < startedAt) {
    issue(issues, "health-time", "API health predates this release attempt.");
  }
  if (Number.isFinite(verifiedAt) && healthCapturedAt > verifiedAt + 5 * 60 * 1000) {
    issue(issues, "health-time", "API health capture is not chronological with preflight verification.");
  }
  return { pass: issues.length === 0, stage: requireSync ? "cutover" : "disabled-api", issues };
};

export const validatePhase11Reconciliation = (
  evidence,
  { preflight, nowMs = Date.now() } = {},
) => {
  const issues = [];
  if (!object(evidence)) return { pass: false, issues: [{ code: "reconciliation-missing", message: "Reconciliation evidence must be an object." }] };
  if (evidence.schemaVersion !== 1) issue(issues, "reconciliation-version", "Reconciliation schemaVersion must be 1.");
  const forbidden = sensitivePaths(evidence);
  if (forbidden.length) issue(issues, "secret-material", `Reconciliation evidence contains forbidden credential-like keys: ${forbidden.join(", ")}.`);
  validateIdentity(evidence.release, issues);
  const capturedAt = exactTime(evidence.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt > nowMs + 5 * 60 * 1000
    || nowMs - capturedAt > MAX_RECONCILIATION_AGE_MS) {
    issue(issues, "reconciliation-time", "capturedAt must be exact and no more than two hours old.");
  }
  const binding = evidence.releaseBinding;
  if (!object(binding) || !UUID.test(binding.releaseAttemptId ?? "")
    || binding.pagesOrigin !== PHASE11_RELEASE.productionPagesOrigin
    || binding.profileApiOrigin !== PHASE11_RELEASE.productionProfileApiOrigin
    || binding.databaseId !== PHASE11_RELEASE.productionDatabaseId
    || !SHA256.test(binding.distSetSha256 ?? "")
    || !nonEmpty(binding.profileApiVersionId)) {
    issue(issues, "reconciliation-binding", "Reconciliation is not bound to the exact release attempt and deployed targets.");
  }
  if (preflight) {
    if (binding?.releaseAttemptId !== preflight.releaseAttempt?.id
      || binding?.distSetSha256 !== preflight.artifacts?.distSetSha256
      || binding?.profileApiVersionId !== preflight.artifacts?.profileApiVersionId
      || binding?.pagesOrigin !== preflight.releaseAttempt?.pagesOrigin
      || binding?.profileApiOrigin !== preflight.releaseAttempt?.profileApiOrigin
      || binding?.databaseId !== preflight.releaseAttempt?.databaseId
      || capturedAt < exactTime(preflight.verifiedAt)) {
      issue(issues, "reconciliation-binding", "Reconciliation does not follow the accepted preflight for this attempt.");
    }
  }
  if (!SHA256.test(evidence.preexistingLegacyAuthorityBeforeSha256 ?? "")
    || evidence.preexistingLegacyAuthorityBeforeSha256
      !== evidence.preexistingLegacyAuthorityAfterSha256) {
    issue(issues, "legacy-authority-changed", "Pre-existing legacy profile authority changed during additive migration.");
  }
  const legacyBoundary = evidence.legacyAuthorityBoundary;
  const cutoverAt = exactTime(legacyBoundary?.cutoverAt);
  const baselineCapturedAt = exactTime(legacyBoundary?.baselineCapturedAt);
  const latestPreexistingWriteAt = exactTime(legacyBoundary?.latestPreexistingWriteAt);
  if (!object(legacyBoundary)
    || !SHA256.test(legacyBoundary.initialRecoveryProjectionSha256 ?? "")
    || !Number.isFinite(cutoverAt)
    || !Number.isFinite(baselineCapturedAt)
    || !Number.isFinite(latestPreexistingWriteAt)
    || latestPreexistingWriteAt > cutoverAt
    || baselineCapturedAt < cutoverAt
    || baselineCapturedAt > capturedAt) {
    issue(issues, "legacy-authority-boundary",
      "Legacy authority evidence must prove the latest pre-existing write preceded cutover and the matching baseline was captured at or after that boundary.");
  }
  if (preflight && cutoverAt < exactTime(preflight.verifiedAt)) {
    issue(issues, "legacy-authority-boundary", "The authority cutover cannot predate the accepted cutover preflight.");
  }
  const expected = evidence.expectedMigratedProfiles;
  const beforeMetrics = evidence.beforeMetrics;
  const metrics = evidence.metrics;
  if (!Number.isSafeInteger(expected) || expected < 1 || !object(beforeMetrics) || !object(metrics)) {
    issue(issues, "migration-counts", "Expected and observed migration counts are missing.");
  } else {
    for (const key of REQUIRED_RECONCILIATION_METRICS) {
      const before = beforeMetrics[key];
      const value = metrics[key];
      if (!Number.isSafeInteger(before) || before < 0) issue(issues, "invalid-metric", `Before metric ${key} must be a non-negative integer.`);
      if (!Number.isSafeInteger(value) || value < 0) issue(issues, "invalid-metric", `Metric ${key} must be a non-negative integer.`);
    }
    if ((metrics.syncHeads ?? 0) - (beforeMetrics.syncHeads ?? 0) < expected
      || (metrics.legacySnapshots ?? 0) - (beforeMetrics.legacySnapshots ?? 0) < expected
      || ((metrics.migrationRunsActive ?? 0) + (metrics.migrationRunsRolledBack ?? 0))
        - ((beforeMetrics.migrationRunsActive ?? 0) + (beforeMetrics.migrationRunsRolledBack ?? 0)) < expected) {
      issue(issues, "migration-counts", "Migration receipts/snapshots/sync heads do not cover the expected cohort.");
    }
  }
  if (!object(evidence.violations)) {
    issue(issues, "data-invariant", "Every Phase 11 reconciliation invariant must be present.");
  } else {
    for (const key of REQUIRED_RECONCILIATION_INVARIANTS) {
      if (evidence.violations[key] !== 0) issue(issues, "data-invariant", `Invariant ${key} must report zero violations.`);
    }
  }
  const requiredSmokes = ["fresh", "migrated", "offlineReplay", "multiDevice", "sessionLoop", "resetStaleDevice", "staleCache", "rollbackReady"];
  for (const key of requiredSmokes) {
    if (evidence.smokeChecks?.[key] !== true) issue(issues, "smoke-check", `Smoke check ${key} did not pass.`);
  }
  const health = validateProfileApiHealth(evidence.apiHealth, { requireSync: true });
  issues.push(...health.issues);
  if (exactTime(evidence.apiHealth?.capturedAt) > capturedAt) {
    issue(issues, "reconciliation-time", "API health capture cannot follow the reconciliation capture.");
  }
  return { pass: issues.length === 0, issues };
};

export const buildPhase11RollbackPlan = (preflightEvidence) => {
  const owner = nonEmpty(preflightEvidence?.owners?.rollback) ? preflightEvidence.owners.rollback.trim() : "UNASSIGNED";
  return Object.freeze({
    releaseId: PHASE11_RELEASE.id,
    rollbackOwner: owner,
    executable: false,
    dataRestoreIncluded: false,
    steps: Object.freeze([
      "Stop granting new vNext application authority; keep read and write authority coherent.",
      "Let active workouts finish locally and preserve their outboxes; do not force a service-worker takeover mid-session.",
      "Restore the last verified v1.2 application/service-worker deployment and prove its v1 cache lane is active.",
      "After the vNext cohort is closed, disable vNext sync writes and verify ordinary auth/profile routes.",
      "Retain migration 0002, vNext observations, snapshots, reset tombstones, migration receipts and all legacy fields.",
      "Run the read-only reconciliation query and record the incident boundary before any resume decision.",
    ]),
    emergencyDataRestore: "D1 Time Travel/export restoration is destructive, is not part of ordinary rollback, and requires a new explicit owner decision after quantifying post-snapshot writes.",
  });
};

export const validateLocalPhase11Source = (root = process.cwd()) => {
  const issues = [];
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", PHASE11_RELEASE.requiredBaselineCommit, "HEAD"], { cwd: root, stdio: "ignore" });
  } catch {
    issue(issues, "baseline", "HEAD does not contain the required 61b0876 baseline.");
  }
  const requiredText = [
    ["app/vnext/releaseCandidate/entry.ts", PHASE11_RELEASE.sourceCandidateId],
    ["app/vnext/releaseCandidate/manifest.ts", PHASE11_RELEASE.sourceFingerprint],
    ["app/vnext/production/entry.ts", PHASE11_RELEASE.id],
    ["profile-api/release-health.js", PHASE11_RELEASE.id],
    ["profile-api/wrangler.toml", `database_id = "${PHASE11_RELEASE.productionDatabaseId}"`],
    [`profile-api/migrations/${PHASE11_RELEASE.requiredMigration}`, "vnext_shadow_sync_heads"],
  ];
  for (const [path, expected] of requiredText) {
    try {
      if (!readFileSync(resolve(root, path), "utf8").includes(expected)) issue(issues, "source-identity", `${path} does not contain ${expected}.`);
    } catch {
      issue(issues, "source-missing", `${path} is missing.`);
    }
  }
  return { pass: issues.length === 0, issues };
};

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const main = () => {
  const command = process.argv[2];
  if (command === "source") {
    const result = validateLocalPhase11Source(argument("--root") ?? process.cwd());
    print(result);
    if (!result.pass) process.exitCode = 1;
    return;
  }
  if (command === "preflight") {
    const path = argument("--evidence");
    if (!path) throw new Error("preflight requires --evidence <json>.");
    const result = validatePhase11Preflight(readJson(path), { requireSync: process.argv.includes("--require-sync") });
    print(result);
    if (!result.pass) process.exitCode = 1;
    return;
  }
  if (command === "reconcile") {
    const path = argument("--evidence");
    const preflightPath = argument("--preflight");
    if (!path || !preflightPath) throw new Error("reconcile requires --evidence <json> --preflight <json>.");
    const result = validatePhase11Reconciliation(readJson(path), { preflight: readJson(preflightPath) });
    print(result);
    if (!result.pass) process.exitCode = 1;
    return;
  }
  if (command === "rollback-plan") {
    const path = argument("--evidence");
    if (!path) throw new Error("rollback-plan requires --evidence <json>.");
    const evidence = readJson(path);
    const result = validatePhase11Preflight(evidence, { requireSync: true });
    print({ preflight: result, rollback: buildPhase11RollbackPlan(evidence) });
    if (!result.pass) process.exitCode = 1;
    return;
  }
  process.stderr.write("Usage: vnext-phase11-release-ops.mjs source [--root DIR] | preflight --evidence FILE [--require-sync] | reconcile --evidence FILE --preflight FILE | rollback-plan --evidence FILE\n");
  process.exitCode = 2;
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
