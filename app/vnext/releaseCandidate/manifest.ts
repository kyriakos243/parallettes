import {
  VNEXT_ASSESSMENT_POLICY_ID,
  VNEXT_ASSESSMENT_POLICY_VERSION,
  VNEXT_ASSESSMENT_SCHEMA_VERSION,
} from "../assessment/contracts";
import {
  parseDefinitionVersion,
  parseProjectionVersion,
  parseStableId,
} from "../contracts";
import {
  VNEXT_CATALOGUE_VERSION,
  VNEXT_PHASE7_SEMANTIC_FINGERPRINTS,
} from "../definitions/ids";
import {
  VNEXT_PERSISTENCE_SCHEMA_VERSION,
} from "../persistence/contracts";
import { VNEXT_RELEASE_CANDIDATE_BASE, VNEXT_RELEASE_CANDIDATE_ID } from "./entry";
import {
  VNEXT_MEDIA_FALLBACK_POLICY,
  VNEXT_MEDIA_RELEASE_MANIFEST_VERSION,
  evaluateProductionReachableVNextMedia,
  phase7MediaRequiredExerciseIds,
  vNextMediaReleaseManifest,
  type VNextMediaReleaseManifest,
} from "./mediaRelease";

export const VNEXT_RELEASE_MANIFEST_VERSION = 1 as const;
export const VNEXT_RELEASE_CANDIDATE_VERSION = 3 as const;
/** Canonical validator fingerprint of the corrected, Phase 10-complete RC source surface. */
export const VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT =
  "1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47" as const;

/*
 * These three modules currently initialize the legacy exercise catalogue when
 * imported. Mirroring their frozen public identities here keeps this manifest
 * safe for Node validators without booting application code.
 */
export const VNEXT_RELEASE_PROJECTION_POLICY_ID = "vnext-evidence-projection" as const;
export const VNEXT_RELEASE_PROJECTION_VERSION = parseProjectionVersion(2);
export const VNEXT_RELEASE_GENERATOR_POLICY_ID =
  parseStableId("policy", "vnext-goal-directed-generator");
export const VNEXT_RELEASE_GENERATOR_POLICY_VERSION = parseDefinitionVersion(1);
export const VNEXT_RELEASE_SHADOW_DATABASE_NAME = "parallette25-vnext-shadow" as const;
export const VNEXT_RELEASE_SHADOW_DATABASE_VERSION = 2 as const;

export const VNEXT_RELEASE_BASELINE = Object.freeze({
  productVersion: "1.2.0",
  commit: "61b08766250100d502744b4c64a244e3d6f5fd6b",
  shortCommit: "61b0876",
  relationship: "exact-or-verified-successor-containing-baseline",
} as const);

/** `validate:dist` defaults ordinary production builds to `v1`. */
export const VNEXT_ORDINARY_PRODUCTION_CACHE_CHANNEL = "v1" as const;
/** Dedicated lane: the RC worker must never enumerate or delete v1 caches. */
export const VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL = "vnext-rc3" as const;
export const VNEXT_RELEASE_AUTHORITY_GATE_ID =
  `selectApplicationAuthority:${VNEXT_RELEASE_CANDIDATE_ID}` as const;

export type VNextReleaseAuthority = "v1.2" | "vnext-rc";
export type VNextReleaseAuthorityPair = Readonly<{
  read: VNextReleaseAuthority;
  write: VNextReleaseAuthority;
}>;

export type VNextRehearsalEnvironment = "staging" | "production";
export type VNextRehearsalMigrationMode = "none" | "copied-profile-shadow" | "live";

export type VNextStagingDeploymentStepId =
  | "verify-baseline-and-freeze-identity"
  | "snapshot-copied-and-synthetic-sources"
  | "apply-additive-shadow-schema"
  | "deploy-shadow-api-disabled"
  | "deploy-rc-assets-disabled"
  | "convert-copies-in-shadow"
  | "enable-staging-shadow-sync"
  | "switch-isolated-cohort-read-write-authority"
  | "reconcile-staging-observations-and-plans"
  | "freeze-phase-10-candidate";

export type VNextStagingDeploymentStep = Readonly<{
  order: number;
  id: VNextStagingDeploymentStepId;
  environment: VNextRehearsalEnvironment;
  action: string;
  migrationMode: VNextRehearsalMigrationMode;
  authorityBefore: VNextReleaseAuthorityPair;
  authorityAfter: VNextReleaseAuthorityPair;
  cacheChannel?: string;
  additiveSchemaOnly: boolean;
  deletesLegacyData: boolean;
}>;

const V12_AUTHORITY = Object.freeze({ read: "v1.2", write: "v1.2" } as const);
const VNEXT_AUTHORITY = Object.freeze({ read: "vnext-rc", write: "vnext-rc" } as const);

/** Exact staging order. Reordering is a manifest validation failure. */
export const VNEXT_STAGING_DEPLOYMENT_REHEARSAL = Object.freeze([
  {
    order: 1,
    id: "verify-baseline-and-freeze-identity",
    environment: "staging",
    action: "Verify the staged v1.2 artifact contains the required baseline, then bind every RC identifier in this manifest before any schema or data action.",
    migrationMode: "none",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 2,
    id: "snapshot-copied-and-synthetic-sources",
    environment: "staging",
    action: "Create recoverable snapshots of representative copied profiles and register synthetic profiles; do not read or write live production profiles.",
    migrationMode: "none",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 3,
    id: "apply-additive-shadow-schema",
    environment: "staging",
    action: "Apply only the additive 0002_vnext_shadow_observations.sql schema to staging and verify the existing v1.2 schema remains readable.",
    migrationMode: "none",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 4,
    id: "deploy-shadow-api-disabled",
    environment: "staging",
    action: "Deploy the backward-compatible shadow sync API with VNEXT_SHADOW_MODE disabled and verify ordinary account/auth/profile routes unchanged.",
    migrationMode: "none",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 5,
    id: "deploy-rc-assets-disabled",
    environment: "staging",
    action: "Deploy the RC app and worker under the dedicated RC cache channel only on an access-controlled isolated origin. If a same-origin nested RC path is unavoidable, first deploy the parent v1 worker exclusion and prove that updated worker is active before any RC URL is exposed. Keep cohort authority disabled; the experience query is build identity routing, never access control.",
    migrationMode: "none",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    cacheChannel: VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 6,
    id: "convert-copies-in-shadow",
    environment: "staging",
    action: "Run the idempotent converter only against copied/synthetic profiles, retaining verified pre-migration snapshots and reset tombstones.",
    migrationMode: "copied-profile-shadow",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 7,
    id: "enable-staging-shadow-sync",
    environment: "staging",
    action: "Enable the authenticated shadow delta route only in staging; replay duplicate, offline and multi-device copied-profile deltas while UI authority remains v1.2.",
    migrationMode: "copied-profile-shadow",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 8,
    id: "switch-isolated-cohort-read-write-authority",
    environment: "staging",
    action: "Atomically grant the access-controlled isolated RC cohort both vNext reads and vNext writes through the release-candidate build/request gate; never split those authorities and never treat the experience query as cohort access control.",
    migrationMode: "copied-profile-shadow",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: VNEXT_AUTHORITY,
    cacheChannel: VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 9,
    id: "reconcile-staging-observations-and-plans",
    environment: "staging",
    action: "Rebuild projections, reconcile converted observations and generated plans, and run the bounded fresh/migrated/offline/multi-device/partial-migration smoke flows.",
    migrationMode: "copied-profile-shadow",
    authorityBefore: VNEXT_AUTHORITY,
    authorityAfter: VNEXT_AUTHORITY,
    cacheChannel: VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
  {
    order: 10,
    id: "freeze-phase-10-candidate",
    environment: "staging",
    action: "Record reconciliation and rollback-rehearsal evidence, freeze the RC identity, and hand the same candidate to Phase 10 without granting production eligibility.",
    migrationMode: "copied-profile-shadow",
    authorityBefore: VNEXT_AUTHORITY,
    authorityAfter: VNEXT_AUTHORITY,
    cacheChannel: VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL,
    additiveSchemaOnly: true,
    deletesLegacyData: false,
  },
] as const satisfies readonly VNextStagingDeploymentStep[]);

export type VNextRollbackStepId =
  | "disable-new-rc-authority"
  | "drain-active-rc-sessions"
  | "disable-shadow-sync-writes"
  | "restore-v12-cache-entry"
  | "verify-v12-and-retain-additive-data";

export type VNextRollbackStep = Readonly<{
  order: number;
  id: VNextRollbackStepId;
  environment: VNextRehearsalEnvironment;
  action: string;
  authorityBefore: VNextReleaseAuthorityPair;
  authorityAfter: VNextReleaseAuthorityPair;
  preservesAdditiveSchema: boolean;
  preservesVNextObservationData: boolean;
  preservesLegacyData: boolean;
  deletesData: boolean;
}>;

/** Rollback disables vNext authority; it never equates rollback with deletion. */
export const VNEXT_STAGING_ROLLBACK_REHEARSAL = Object.freeze([
  {
    order: 1,
    id: "disable-new-rc-authority",
    environment: "staging",
    action: "Revoke staging hosting access and the RC cohort grant/configured identity. Ordinary entry remains coherently v1.2; any still reachable RC artifact must stay inert without the exact identity request rather than running legacy startup.",
    authorityBefore: VNEXT_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    preservesAdditiveSchema: true,
    preservesVNextObservationData: true,
    preservesLegacyData: true,
    deletesData: false,
  },
  {
    order: 2,
    id: "drain-active-rc-sessions",
    environment: "staging",
    action: "Allow already-open RC sessions to finish or retain their local outbox; do not force a service-worker takeover during an active workout.",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    preservesAdditiveSchema: true,
    preservesVNextObservationData: true,
    preservesLegacyData: true,
    deletesData: false,
  },
  {
    order: 3,
    id: "disable-shadow-sync-writes",
    environment: "staging",
    action: "Disable the staging shadow sync feature gate after the RC cohort is closed; preserve local outboxes and all append-only remote rows.",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    preservesAdditiveSchema: true,
    preservesVNextObservationData: true,
    preservesLegacyData: true,
    deletesData: false,
  },
  {
    order: 4,
    id: "restore-v12-cache-entry",
    environment: "staging",
    action: "Serve the compatible v1.2 entry path and its v1 cache lane; leave the namespaced RC cache to normal same-channel lifecycle cleanup.",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    preservesAdditiveSchema: true,
    preservesVNextObservationData: true,
    preservesLegacyData: true,
    deletesData: false,
  },
  {
    order: 5,
    id: "verify-v12-and-retain-additive-data",
    environment: "staging",
    action: "Verify v1.2 account, profile, history and offline reads, and retain the additive schema, vNext observations, snapshots, tombstones and legacy fields for diagnosis or resume.",
    authorityBefore: V12_AUTHORITY,
    authorityAfter: V12_AUTHORITY,
    preservesAdditiveSchema: true,
    preservesVNextObservationData: true,
    preservesLegacyData: true,
    deletesData: false,
  },
] as const satisfies readonly VNextRollbackStep[]);

const fingerprintForCurrentCatalogue = (): string => {
  const fingerprints = VNEXT_PHASE7_SEMANTIC_FINGERPRINTS as Readonly<Record<number, string>>;
  const fingerprint = fingerprints[VNEXT_CATALOGUE_VERSION];
  if (!fingerprint) throw new Error("Current vNext catalogue has no frozen semantic fingerprint");
  return fingerprint;
};

export type VNextReleaseMediaStatus = Readonly<{
  manifestVersion: typeof VNEXT_MEDIA_RELEASE_MANIFEST_VERSION;
  fallbackPolicy: typeof VNEXT_MEDIA_FALLBACK_POLICY;
  requirementCount: number;
  exerciseCount: number;
  unresolvedRequirementIds: readonly string[];
  unresolvedExerciseIds: typeof phase7MediaRequiredExerciseIds;
  releaseAllowed: boolean;
}>;

export const deriveVNextReleaseMediaStatus = (
  manifest: VNextMediaReleaseManifest = vNextMediaReleaseManifest,
): VNextReleaseMediaStatus => {
  const evaluation = evaluateProductionReachableVNextMedia(
    phase7MediaRequiredExerciseIds,
    manifest,
  );
  const unresolvedRequirementIds = [...new Set(
    evaluation.blocked.flatMap((decision) =>
      decision.requirementId === undefined ? [] : [decision.requirementId]),
  )].sort();
  return {
    manifestVersion: VNEXT_MEDIA_RELEASE_MANIFEST_VERSION,
    fallbackPolicy: VNEXT_MEDIA_FALLBACK_POLICY,
    requirementCount: manifest.entries.length,
    exerciseCount: phase7MediaRequiredExerciseIds.length,
    unresolvedRequirementIds,
    unresolvedExerciseIds: evaluation.blocked.map((decision) => decision.exerciseId),
    releaseAllowed: evaluation.releaseAllowed,
  };
};

export type VNextReleaseCandidateManifest = Readonly<{
  schemaVersion: typeof VNEXT_RELEASE_MANIFEST_VERSION;
  releaseCandidate: Readonly<{
    id: typeof VNEXT_RELEASE_CANDIDATE_ID;
    version: typeof VNEXT_RELEASE_CANDIDATE_VERSION;
    state: "frozen";
    integrationSourceFingerprint: typeof VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT;
    baseline: typeof VNEXT_RELEASE_BASELINE;
  }>;
  components: Readonly<{
    catalogue: Readonly<{ version: typeof VNEXT_CATALOGUE_VERSION; semanticFingerprint: string }>;
    projection: Readonly<{
      id: typeof VNEXT_RELEASE_PROJECTION_POLICY_ID;
      version: typeof VNEXT_RELEASE_PROJECTION_VERSION;
    }>;
    generator: Readonly<{
      id: typeof VNEXT_RELEASE_GENERATOR_POLICY_ID;
      version: typeof VNEXT_RELEASE_GENERATOR_POLICY_VERSION;
    }>;
    assessment: Readonly<{
      id: typeof VNEXT_ASSESSMENT_POLICY_ID;
      policyVersion: typeof VNEXT_ASSESSMENT_POLICY_VERSION;
      schemaVersion: typeof VNEXT_ASSESSMENT_SCHEMA_VERSION;
    }>;
    persistence: Readonly<{
      schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
      indexedDbName: typeof VNEXT_RELEASE_SHADOW_DATABASE_NAME;
      indexedDbVersion: typeof VNEXT_RELEASE_SHADOW_DATABASE_VERSION;
      remoteMigrationId: "0002_vnext_shadow_observations.sql";
      syncRoute: "/vnext/shadow/sync";
    }>;
    cache: Readonly<{
      ordinaryProductionChannel: string;
      releaseCandidateChannel: string;
    }>;
    authorityGate: Readonly<{
      id: typeof VNEXT_RELEASE_AUTHORITY_GATE_ID;
      releaseCandidateId: typeof VNEXT_RELEASE_CANDIDATE_ID;
      releaseCandidateBase: typeof VNEXT_RELEASE_CANDIDATE_BASE;
      defaultAuthority: "v1.2";
      cohortAuthority: "vnext-rc";
      activationFactors: readonly ["build-enabled", "configured-rc-id", "isolated-scope", "exact-request"];
      readWriteMode: "coherent-only";
    }>;
  }>;
  media: VNextReleaseMediaStatus;
  phase10Readiness: Readonly<{
    target: "phase-10-comprehensive-validation";
    status: "targeted" | "approved";
    comprehensiveValidation: "not-started" | "passed";
    ownerReleaseApproval: "pending" | "approved";
  }>;
  productionEligibility: Readonly<{
    status: "blocked" | "eligible";
    liveMigrationAuthorized: boolean;
    productionAuthoritySwitchAuthorized: boolean;
    phase11CutoverApproval: "not-granted" | "granted";
  }>;
  productionAuthorityDuringRehearsal: VNextReleaseAuthorityPair;
  stagingDeploymentRehearsal: readonly VNextStagingDeploymentStep[];
  rollbackRehearsal: readonly VNextRollbackStep[];
}>;

const currentMediaStatus = deriveVNextReleaseMediaStatus();

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};

/**
 * Corrected Phase 10 identity. `frozen` means validators exercise this exact
 * contract; it is not a declaration that production release is allowed.
 */
export const vNextReleaseCandidateManifest = deepFreeze({
  schemaVersion: VNEXT_RELEASE_MANIFEST_VERSION,
  releaseCandidate: {
    id: VNEXT_RELEASE_CANDIDATE_ID,
    version: VNEXT_RELEASE_CANDIDATE_VERSION,
    state: "frozen",
    integrationSourceFingerprint: VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT,
    baseline: VNEXT_RELEASE_BASELINE,
  },
  components: {
    catalogue: {
      version: VNEXT_CATALOGUE_VERSION,
      semanticFingerprint: fingerprintForCurrentCatalogue(),
    },
    projection: {
      id: VNEXT_RELEASE_PROJECTION_POLICY_ID,
      version: VNEXT_RELEASE_PROJECTION_VERSION,
    },
    generator: {
      id: VNEXT_RELEASE_GENERATOR_POLICY_ID,
      version: VNEXT_RELEASE_GENERATOR_POLICY_VERSION,
    },
    assessment: {
      id: VNEXT_ASSESSMENT_POLICY_ID,
      policyVersion: VNEXT_ASSESSMENT_POLICY_VERSION,
      schemaVersion: VNEXT_ASSESSMENT_SCHEMA_VERSION,
    },
    persistence: {
      schemaVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
      indexedDbName: VNEXT_RELEASE_SHADOW_DATABASE_NAME,
      indexedDbVersion: VNEXT_RELEASE_SHADOW_DATABASE_VERSION,
      remoteMigrationId: "0002_vnext_shadow_observations.sql",
      syncRoute: "/vnext/shadow/sync",
    },
    cache: {
      ordinaryProductionChannel: VNEXT_ORDINARY_PRODUCTION_CACHE_CHANNEL,
      releaseCandidateChannel: VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL,
    },
    authorityGate: {
      id: VNEXT_RELEASE_AUTHORITY_GATE_ID,
      releaseCandidateId: VNEXT_RELEASE_CANDIDATE_ID,
      releaseCandidateBase: VNEXT_RELEASE_CANDIDATE_BASE,
      defaultAuthority: "v1.2",
      cohortAuthority: "vnext-rc",
      activationFactors: ["build-enabled", "configured-rc-id", "isolated-scope", "exact-request"],
      readWriteMode: "coherent-only",
    },
  },
  media: currentMediaStatus,
  phase10Readiness: {
    target: "phase-10-comprehensive-validation",
    status: "approved",
    comprehensiveValidation: "passed",
    ownerReleaseApproval: "pending",
  },
  productionEligibility: {
    status: "blocked",
    liveMigrationAuthorized: false,
    productionAuthoritySwitchAuthorized: false,
    phase11CutoverApproval: "not-granted",
  },
  productionAuthorityDuringRehearsal: V12_AUTHORITY,
  stagingDeploymentRehearsal: VNEXT_STAGING_DEPLOYMENT_REHEARSAL,
  rollbackRehearsal: VNEXT_STAGING_ROLLBACK_REHEARSAL,
} as const satisfies VNextReleaseCandidateManifest);

export type VNextReleaseManifestIssueCode =
  | "manifest-version-invalid"
  | "release-identity-invalid"
  | "component-identity-invalid"
  | "staging-step-order-invalid"
  | "rollback-step-order-invalid"
  | "mixed-authority-cutover"
  | "authority-sequence-invalid"
  | "production-operation-prohibited"
  | "live-migration-prohibited"
  | "destructive-rehearsal-prohibited"
  | "rollback-retention-invalid"
  | "cache-channel-collision"
  | "media-status-mismatch"
  | "unresolved-production-media"
  | "phase10-state-invalid"
  | "production-eligibility-inconsistent";

export type VNextReleaseManifestIssue = Readonly<{
  severity: "error" | "production-blocker";
  code: VNextReleaseManifestIssueCode;
  message: string;
  stepId?: VNextStagingDeploymentStepId | VNextRollbackStepId;
}>;

export type VNextReleaseManifestValidation = Readonly<{
  manifestValid: boolean;
  phase10Targeted: boolean;
  productionEligible: boolean;
  issues: readonly VNextReleaseManifestIssue[];
}>;

const sameAuthority = (
  left: VNextReleaseAuthorityPair,
  right: VNextReleaseAuthorityPair,
): boolean => left.read === right.read && left.write === right.write;

const coherentAuthority = (value: VNextReleaseAuthorityPair): boolean => value.read === value.write;

const sameStringSequence = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** Pure, fail-closed Phase 9 manifest validation; it performs no deployment. */
export const validateVNextReleaseCandidateManifest = (
  manifest: VNextReleaseCandidateManifest,
  mediaManifest: VNextMediaReleaseManifest = vNextMediaReleaseManifest,
): VNextReleaseManifestValidation => {
  const issues: VNextReleaseManifestIssue[] = [];
  const add = (
    severity: VNextReleaseManifestIssue["severity"],
    code: VNextReleaseManifestIssueCode,
    message: string,
    stepId?: VNextReleaseManifestIssue["stepId"],
  ): void => {
    issues.push({ severity, code, message, ...(stepId === undefined ? {} : { stepId }) });
  };

  if (manifest.schemaVersion !== VNEXT_RELEASE_MANIFEST_VERSION) {
    add("error", "manifest-version-invalid", "The release manifest schema version is unsupported.");
  }
  if (manifest.releaseCandidate.id !== VNEXT_RELEASE_CANDIDATE_ID
    || manifest.releaseCandidate.version !== VNEXT_RELEASE_CANDIDATE_VERSION
    || manifest.releaseCandidate.state !== "frozen"
    || manifest.releaseCandidate.integrationSourceFingerprint !== VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT
    || !/^[a-f0-9]{64}$/u.test(manifest.releaseCandidate.integrationSourceFingerprint)
    || manifest.releaseCandidate.baseline.commit !== VNEXT_RELEASE_BASELINE.commit
    || manifest.releaseCandidate.baseline.productVersion !== VNEXT_RELEASE_BASELINE.productVersion) {
    add("error", "release-identity-invalid", "The frozen RC identity or required v1.2 baseline changed.");
  }

  const expectedFingerprint = fingerprintForCurrentCatalogue();
  const components = manifest.components;
  if (components.catalogue.version !== VNEXT_CATALOGUE_VERSION
    || components.catalogue.semanticFingerprint !== expectedFingerprint
    || components.projection.id !== VNEXT_RELEASE_PROJECTION_POLICY_ID
    || components.projection.version !== VNEXT_RELEASE_PROJECTION_VERSION
    || components.generator.id !== VNEXT_RELEASE_GENERATOR_POLICY_ID
    || components.generator.version !== VNEXT_RELEASE_GENERATOR_POLICY_VERSION
    || components.assessment.id !== VNEXT_ASSESSMENT_POLICY_ID
    || components.assessment.policyVersion !== VNEXT_ASSESSMENT_POLICY_VERSION
    || components.assessment.schemaVersion !== VNEXT_ASSESSMENT_SCHEMA_VERSION
    || components.persistence.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION
    || components.persistence.indexedDbName !== VNEXT_RELEASE_SHADOW_DATABASE_NAME
    || components.persistence.indexedDbVersion !== VNEXT_RELEASE_SHADOW_DATABASE_VERSION
    || components.persistence.remoteMigrationId !== "0002_vnext_shadow_observations.sql"
    || components.persistence.syncRoute !== "/vnext/shadow/sync"
    || components.authorityGate.id !== VNEXT_RELEASE_AUTHORITY_GATE_ID
    || components.authorityGate.releaseCandidateId !== VNEXT_RELEASE_CANDIDATE_ID
    || components.authorityGate.releaseCandidateBase !== VNEXT_RELEASE_CANDIDATE_BASE
    || components.authorityGate.defaultAuthority !== "v1.2"
    || components.authorityGate.cohortAuthority !== "vnext-rc"
    || !sameStringSequence(
      components.authorityGate.activationFactors,
      ["build-enabled", "configured-rc-id", "isolated-scope", "exact-request"],
    )
    || components.authorityGate.readWriteMode !== "coherent-only") {
    add("error", "component-identity-invalid", "One or more frozen vNext component or authority-gate identifiers changed.");
  }

  if (components.cache.ordinaryProductionChannel === components.cache.releaseCandidateChannel
    || components.cache.releaseCandidateChannel !== VNEXT_RELEASE_CANDIDATE_CACHE_CHANNEL
    || components.cache.ordinaryProductionChannel !== VNEXT_ORDINARY_PRODUCTION_CACHE_CHANNEL) {
    add("error", "cache-channel-collision", "The RC and ordinary-production PWA cache channels must be distinct and canonical.");
  }

  const expectedStagingIds = VNEXT_STAGING_DEPLOYMENT_REHEARSAL.map((step) => step.id);
  const actualStagingIds = manifest.stagingDeploymentRehearsal.map((step) => step.id);
  if (!sameStringSequence(actualStagingIds, expectedStagingIds)
    || manifest.stagingDeploymentRehearsal.some((step, index) => step.order !== index + 1)) {
    add("error", "staging-step-order-invalid", "The exact staging deployment rehearsal order changed.");
  }
  const expectedRollbackIds = VNEXT_STAGING_ROLLBACK_REHEARSAL.map((step) => step.id);
  const actualRollbackIds = manifest.rollbackRehearsal.map((step) => step.id);
  if (!sameStringSequence(actualRollbackIds, expectedRollbackIds)
    || manifest.rollbackRehearsal.some((step, index) => step.order !== index + 1)) {
    add("error", "rollback-step-order-invalid", "The exact staging rollback rehearsal order changed.");
  }

  let previousAuthority: VNextReleaseAuthorityPair = V12_AUTHORITY;
  for (const [index, step] of manifest.stagingDeploymentRehearsal.entries()) {
    const expected = VNEXT_STAGING_DEPLOYMENT_REHEARSAL[index];
    if (step.environment === "production") {
      add("error", "production-operation-prohibited", "Phase 9 rehearsal cannot target production.", step.id);
    }
    if (step.migrationMode === "live") {
      add("error", "live-migration-prohibited", "Phase 9 rehearsal cannot migrate a live profile.", step.id);
    }
    if (step.deletesLegacyData || !step.additiveSchemaOnly) {
      add("error", "destructive-rehearsal-prohibited", "Phase 9 staging steps must remain additive and retain legacy data.", step.id);
    }
    if (!coherentAuthority(step.authorityBefore) || !coherentAuthority(step.authorityAfter)) {
      add("error", "mixed-authority-cutover", "A rehearsal step splits v1.2/vNext read and write authority.", step.id);
    }
    if (!sameAuthority(step.authorityBefore, previousAuthority)) {
      add("error", "authority-sequence-invalid", "A staging step does not begin with the preceding coherent authority.", step.id);
    }
    if (expected && (!sameAuthority(step.authorityBefore, expected.authorityBefore)
      || !sameAuthority(step.authorityAfter, expected.authorityAfter))) {
      add("error", "authority-sequence-invalid", "The coherent staging authority switch moved outside its canonical step.", step.id);
    }
    if (expected && (step.migrationMode !== expected.migrationMode
      || step.additiveSchemaOnly !== expected.additiveSchemaOnly
      || step.deletesLegacyData !== expected.deletesLegacyData)) {
      add("error", "staging-step-order-invalid", "A staging operation moved outside its canonical deployment step.", step.id);
    }
    if (step.cacheChannel === components.cache.ordinaryProductionChannel) {
      add("error", "cache-channel-collision", "A staging RC step reuses the ordinary-production cache channel.", step.id);
    }
    previousAuthority = step.authorityAfter;
  }
  if (!sameAuthority(manifest.productionAuthorityDuringRehearsal, V12_AUTHORITY)
    || !coherentAuthority(manifest.productionAuthorityDuringRehearsal)) {
    add("error", "mixed-authority-cutover", "Ordinary production must remain coherently v1.2 throughout Phase 9.");
  }

  let rollbackAuthority: VNextReleaseAuthorityPair = VNEXT_AUTHORITY;
  for (const [index, step] of manifest.rollbackRehearsal.entries()) {
    const expected = VNEXT_STAGING_ROLLBACK_REHEARSAL[index];
    if (step.environment === "production") {
      add("error", "production-operation-prohibited", "Phase 9 rollback rehearsal cannot target production.", step.id);
    }
    if (!coherentAuthority(step.authorityBefore) || !coherentAuthority(step.authorityAfter)) {
      add("error", "mixed-authority-cutover", "A rollback step splits v1.2/vNext read and write authority.", step.id);
    }
    if (!sameAuthority(step.authorityBefore, rollbackAuthority)) {
      add("error", "authority-sequence-invalid", "A rollback step does not begin with the preceding coherent authority.", step.id);
    }
    if (expected && (!sameAuthority(step.authorityBefore, expected.authorityBefore)
      || !sameAuthority(step.authorityAfter, expected.authorityAfter))) {
      add("error", "authority-sequence-invalid", "The rollback authority switch moved outside its canonical step.", step.id);
    }
    if (!step.preservesAdditiveSchema || !step.preservesVNextObservationData
      || !step.preservesLegacyData || step.deletesData) {
      add("error", "rollback-retention-invalid", "Rollback must disable authority without deleting additive schema, vNext observations or legacy data.", step.id);
    }
    rollbackAuthority = step.authorityAfter;
  }
  if (!sameAuthority(rollbackAuthority, V12_AUTHORITY)) {
    add("error", "authority-sequence-invalid", "Rollback must end with coherent v1.2 read/write authority.");
  }

  const derivedMedia = deriveVNextReleaseMediaStatus(mediaManifest);
  if (manifest.media.manifestVersion !== derivedMedia.manifestVersion
    || manifest.media.fallbackPolicy !== derivedMedia.fallbackPolicy
    || manifest.media.requirementCount !== derivedMedia.requirementCount
    || manifest.media.exerciseCount !== derivedMedia.exerciseCount
    || manifest.media.releaseAllowed !== derivedMedia.releaseAllowed
    || !sameStringSequence(manifest.media.unresolvedRequirementIds, derivedMedia.unresolvedRequirementIds)
    || !sameStringSequence(manifest.media.unresolvedExerciseIds, derivedMedia.unresolvedExerciseIds)) {
    add("error", "media-status-mismatch", "The RC media snapshot does not match the canonical media release manifest.");
  }
  if (!derivedMedia.releaseAllowed) {
    add(
      "production-blocker",
      "unresolved-production-media",
      `${derivedMedia.unresolvedRequirementIds.length} owned-motion requirements covering ${derivedMedia.unresolvedExerciseIds.length} production-reachable exercises remain unresolved; fallback substitution is forbidden.`,
    );
  }

  const phase10Targeted = manifest.phase10Readiness.target === "phase-10-comprehensive-validation"
    && manifest.phase10Readiness.status === "targeted"
    && manifest.phase10Readiness.comprehensiveValidation === "not-started"
    && manifest.phase10Readiness.ownerReleaseApproval === "pending";
  if (!phase10Targeted && manifest.phase10Readiness.status !== "approved") {
    add("error", "phase10-state-invalid", "The frozen Phase 9 candidate must be honestly targeted for Phase 10 or carry completed approval.");
  }

  const productionAuthorityRequested = manifest.productionEligibility.liveMigrationAuthorized
    || manifest.productionEligibility.productionAuthoritySwitchAuthorized
    || manifest.productionEligibility.phase11CutoverApproval === "granted";
  if (productionAuthorityRequested) {
    add("error", "production-operation-prohibited", "This Phase 9 manifest cannot authorise live migration or production authority cutover.");
  }
  if (manifest.productionEligibility.status === "eligible"
    && (!derivedMedia.releaseAllowed
      || manifest.phase10Readiness.comprehensiveValidation !== "passed"
      || manifest.phase10Readiness.ownerReleaseApproval !== "approved"
      || manifest.productionEligibility.phase11CutoverApproval !== "granted")) {
    add("error", "production-eligibility-inconsistent", "Production eligibility was declared before media, Phase 10 and Phase 11 gates passed.");
  }

  const manifestValid = !issues.some((entry) => entry.severity === "error");
  const productionEligible = manifestValid
    && derivedMedia.releaseAllowed
    && manifest.productionEligibility.status === "eligible"
    && manifest.phase10Readiness.comprehensiveValidation === "passed"
    && manifest.phase10Readiness.ownerReleaseApproval === "approved"
    && manifest.productionEligibility.liveMigrationAuthorized
    && manifest.productionEligibility.productionAuthoritySwitchAuthorized
    && manifest.productionEligibility.phase11CutoverApproval === "granted";
  return {
    manifestValid,
    phase10Targeted: manifestValid && phase10Targeted,
    productionEligible,
    issues,
  };
};
