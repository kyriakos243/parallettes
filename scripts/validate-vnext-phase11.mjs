import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
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
  const source = readFileSync(absolutePath, "utf8");
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

const production = loadTypeScriptModule("app/vnext/production/release.ts");
const candidate = loadTypeScriptModule("app/vnext/releaseCandidate/manifest.ts");
const media = loadTypeScriptModule("app/vnext/releaseCandidate/mediaRelease.ts");

const failures = [];
let assertions = 0;
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const hasIssue = (evaluation, code, severity) => evaluation.issues.some((issue) =>
  issue.code === code && (severity === undefined || issue.severity === severity));

const contract = production.vNextPhase11ProductionReleaseContract;
const evaluation = production.evaluateVNextPhase11ProductionRelease(contract);

// The Phase 10 candidate is historical evidence, not the mutable Phase 11 tree.
assert(production.VNEXT_PHASE10_ACCEPTED_RC_ID === "parallette25-vnext-rc.3",
  "Phase 11 does not preserve the accepted RC.3 identity");
assert(production.VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT
  === "1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47",
"Phase 11 changed the historical accepted RC.3 source fingerprint");
assert(candidate.VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT
  === production.VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT,
"The frozen Phase 10 manifest and Phase 11 acceptance record disagree");
assert(candidate.vNextReleaseCandidateManifest.phase10Readiness.ownerReleaseApproval === "pending",
  "The historical RC manifest was rewritten instead of recording later owner approval separately");
assert(contract.phase11ReleaseArtifact.status === "frozen"
  && contract.phase11ReleaseArtifact.sourceFingerprint
    === "6ea84cd7835a8d605708e33fa9e673534d38c5fed230914162e1842b55dee6d4"
  && contract.phase11ReleaseArtifact.sourceFingerprint
    !== production.VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT,
"Phase 11 is not bound to its distinct corrected production artifact");

// Owner approval is exact and covers every reviewed motion without silently
// following later asset changes.
assert(contract.approvals.phase10ReleaseReview.status === "approved"
  && contract.approvals.phase11Scope.status === "approved",
"Owner Phase 10 acceptance or explicit Phase 11 authority is missing");
assert(contract.approvals.media.length === 28,
  `Expected 28 exact owner media approvals; found ${contract.approvals.media.length}`);
assert(media.phase7MediaRequiredExerciseIds.length === 30,
  `Expected 30 production-reachable Phase 7 movements; found ${media.phase7MediaRequiredExerciseIds.length}`);
assert(new Set(contract.approvals.media.map((approval) => approval.requirementId)).size === 28,
  "Owner media approval ledger contains a duplicate requirement");
assert(evaluation.contractValid && evaluation.ownerApproved && evaluation.mediaApproved,
  "The canonical Phase 11 owner/media acceptance contract is invalid");

// Starting Phase 11 is not permission to operate on production before the
// target-specific preflight is evidenced and a new release artifact is frozen.
assert(contract.productionGrant.status === "withheld",
  "The initial Phase 11 contract does not withhold its production grant");
assert(!evaluation.productionAuthorized,
  "The initial Phase 11 contract prematurely authorises production");
assert(evaluation.pendingGateIds.length === 7,
  `Expected seven remaining target-environment preflight blockers; found ${evaluation.pendingGateIds.length}`);
assert(evaluation.pendingGateIds.every((id) => hasIssue(evaluation, "production-preflight-incomplete", "production-blocker")),
  "A pending production preflight does not emit an explicit blocker");
assert(!hasIssue(evaluation, "release-artifact-unbound", "production-blocker"),
  "The exact frozen Phase 11 artifact is not recognized as bound");
assert(Object.isFrozen(contract) && Object.isFrozen(contract.approvals.media)
  && Object.isFrozen(contract.preflight) && Object.isFrozen(contract.productionGrant),
"The canonical Phase 11 release contract is mutable");

// A caller cannot flip only the visible grant booleans.
const premature = structuredClone(contract);
premature.productionGrant.status = "granted";
premature.productionGrant.releaseArtifactFingerprint = "2".repeat(64);
premature.productionGrant.authorizations.deployCompatibleRelease = true;
premature.productionGrant.authorizations.runIdempotentLiveMigration = true;
premature.productionGrant.authorizations.switchProductionAuthority = true;
const prematureEvaluation = production.evaluateVNextPhase11ProductionRelease(premature);
assert(!prematureEvaluation.productionAuthorized
  && hasIssue(prematureEvaluation, "grant-inconsistent", "error"),
"Production can be granted without passing every target-environment preflight");

// Even a complete preflight cannot reuse the accepted RC fingerprint as the
// fingerprint of source changed during Phase 11.
const reusedHistoricalFingerprint = structuredClone(contract);
for (const gate of reusedHistoricalFingerprint.preflight) {
  gate.status = "passed";
  gate.evidence = `phase11-test:${gate.id}`;
}
reusedHistoricalFingerprint.phase11ReleaseArtifact.status = "frozen";
reusedHistoricalFingerprint.phase11ReleaseArtifact.sourceFingerprint =
  production.VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT;
reusedHistoricalFingerprint.productionGrant.status = "granted";
reusedHistoricalFingerprint.productionGrant.releaseArtifactFingerprint =
  production.VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT;
reusedHistoricalFingerprint.productionGrant.authorizations.deployCompatibleRelease = true;
reusedHistoricalFingerprint.productionGrant.authorizations.runIdempotentLiveMigration = true;
reusedHistoricalFingerprint.productionGrant.authorizations.switchProductionAuthority = true;
const reusedEvaluation = production.evaluateVNextPhase11ProductionRelease(reusedHistoricalFingerprint);
assert(!reusedEvaluation.productionAuthorized
  && hasIssue(reusedEvaluation, "release-artifact-unbound", "production-blocker"),
"Phase 11 can mislabel the historical RC.3 fingerprint as its new release artifact");

// The gate is reachable only as one coherent, exact grant after every required
// proof is bound. This is a synthetic contract check, not a live grant.
const complete = structuredClone(contract);
for (const gate of complete.preflight) {
  gate.status = "passed";
  gate.evidence = `phase11-validator:${gate.id}`;
}
complete.phase11ReleaseArtifact.status = "frozen";
complete.phase11ReleaseArtifact.sourceFingerprint = "2".repeat(64);
complete.productionGrant.status = "granted";
complete.productionGrant.releaseArtifactFingerprint = "2".repeat(64);
complete.productionGrant.authorizations.deployCompatibleRelease = true;
complete.productionGrant.authorizations.runIdempotentLiveMigration = true;
complete.productionGrant.authorizations.switchProductionAuthority = true;
const completeEvaluation = production.evaluateVNextPhase11ProductionRelease(complete);
assert(completeEvaluation.contractValid && completeEvaluation.productionAuthorized
  && completeEvaluation.pendingGateIds.length === 0,
"A fully evidenced, exact and coherent Phase 11 grant cannot become reachable");

// Approval and rollback integrity fail closed under representative tampering.
const changedMedia = structuredClone(contract);
changedMedia.approvals.media[0].assetFingerprint = "0".repeat(64);
const changedMediaEvaluation = production.evaluateVNextPhase11ProductionRelease(changedMedia);
assert(!changedMediaEvaluation.contractValid && !changedMediaEvaluation.mediaApproved
  && hasIssue(changedMediaEvaluation, "media-approval-fingerprint-mismatch", "error"),
"A changed motion fingerprint retained owner approval");

const splitAuthority = structuredClone(contract);
splitAuthority.authority.after.write = "v1.2";
const splitAuthorityEvaluation = production.evaluateVNextPhase11ProductionRelease(splitAuthority);
assert(!splitAuthorityEvaluation.contractValid
  && hasIssue(splitAuthorityEvaluation, "mixed-authority-cutover", "error"),
"A split v1.2/vNext read-write authority path is accepted");

const destructive = structuredClone(contract);
destructive.productionGrant.authorizations.deleteLegacyDataOrPaths = true;
const destructiveEvaluation = production.evaluateVNextPhase11ProductionRelease(destructive);
assert(!destructiveEvaluation.contractValid
  && hasIssue(destructiveEvaluation, "destructive-cleanup-prohibited", "error"),
"Phase 11 can authorise legacy data or compatibility-path deletion");

const releaseSource = readFileSync(resolve(projectRoot, "app/vnext/production/release.ts"), "utf8");
assert(!/from\s+["'][^"']*(?:src\/main|VNextReleaseCandidateApp|profileStore|workflows?|deploy)[^"']*["']/u.test(
  releaseSource,
), "The production contract imports application entry, UI, profiles, workflows or deployment code");

if (failures.length > 0) {
  console.error(`vNext Phase 11 production release contract validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`vNext Phase 11 production release contract validation passed (${assertions} assertions).`);
  console.log("- accepted RC.3 identity and 28 owner-approved motion fingerprints are preserved as historical evidence");
  console.log("- the distinct corrected release artifact is frozen while seven live-target preflights remain fail-closed");
  console.log("- coherent grant, media tamper, split authority, destructive cleanup and historical-fingerprint reuse checks passed");
}
