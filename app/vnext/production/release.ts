import {
  validateVNextMediaReleaseManifest,
  vNextMediaReleaseManifest,
  type VNextMediaReleaseManifest,
} from "../releaseCandidate/mediaRelease";
import {
  VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT,
  vNextReleaseCandidateManifest,
} from "../releaseCandidate/manifest";

export const VNEXT_PHASE11_PRODUCTION_RELEASE_CONTRACT_VERSION = 1 as const;

/**
 * Historical identity accepted by the owner at the Phase 10 checkpoint.
 *
 * This is intentionally not a fingerprint of the later Phase 11 source tree.
 * Production must bind a separately frozen Phase 11 artifact before any live
 * operation can be granted.
 */
export const VNEXT_PHASE10_ACCEPTED_RC_ID = "parallette25-vnext-rc.3" as const;
export const VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT =
  "1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47" as const;
export const VNEXT_PHASE10_OWNER_APPROVAL_DATE = "2026-08-28" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * Exact animation fingerprints reviewed in the RC.3 final-product player.
 * Keep these literal: deriving them from current motion source would make an
 * old owner approval silently follow a later asset edit.
 */
export const VNEXT_PHASE10_OWNER_APPROVED_MEDIA_FINGERPRINTS = Object.freeze({
  "parallette-tuck-planche-hold": "f744d5991305ffce2f450438011e8a163431c8b4d2864cd8e065cfe80f2e121e",
  "advanced-tuck-planche-hold": "c8cfc172c99682df505ee133b9ff2a76e59b77e9d2ce14063d373dfd9b00f84b",
  "assisted-one-leg-planche-hold": "edeb7b19425029875b0124f6db43216874891b930ac73dd6e7c2b761b5ba82aa",
  "assisted-straddle-planche-hold": "c70653201ae21f67ea18d45fb03a47429af15532d6ace2885f92133fda394d5d",
  "straddle-l-sit-hold": "668ca347eea4636b262174386c7da7ab37a7582944666b57c50c0eae80457982",
  "high-l-sit-hold": "5151f000cadc58330c132d5844cf83645240113b85e9a2ac21ebd95d630571af",
  "assisted-v-sit-hold": "bb8c9fb113232874ad337b8391e71465e43fbb1b6a0ed1c941e2713b8cca15c7",
  "partial-v-sit-hold": "7b1e87191f1bc67401a03e5cbef89f3e99bca9383ab0a55019f61237bc31b8b6",
  "floor-balance-repeatable-variant": "b404912f45b8274e1b8970f91c7ffa9e21e63484045d3f893a99d4da1754c90c",
  "parallette-balance-repeatable-variant": "a1c4577dc35920a7c6c9570fd506c06eea9e68579c8aa10435bf017fd03af2fd",
  "freestanding-parallette-tuck-shape-change": "f0b6c985cfe2e14e28dc036381d527c0a08ae2861a8a3de6a1cdd195cbf2ced4",
  "elevated-parallette-pike-push-up": "64565d50ddc27be3e80c01bf7779900cbe07c562f0eed1a2728944efa8399d5e",
  "wall-hspu-bottom-position-exit": "db99810e25fa3e513966e26e72023392b4364f9378c5c5da06c7e3600e732b17",
  "wall-hspu-eccentric": "ab7df195dfa3f4c0d4b2cd6a9292a73205bd4e8f6675c2bcc065f7c5227158a3",
  "assisted-wall-hspu-concentric": "72acf22551f640d68de61b373e7e3ed0937c5b27d8b06e99067dcac009123b3c",
  "partial-wall-hspu": "9d1179a2e3b40c93dc14391cdfacd5f1d4ab9179af74c81ca4fa8fdca07d146f",
  "parallette-wall-hspu": "7f19f0e655c029e4b13d2702ee4e9c77bc18e27c2e47cd3ae551923aff76111f",
  "deficit-wall-hspu-bottom-position-exit": "4b06e81c617b1ba15a17aa51042e73ab776cd9fc40b9b1fdd0d321d3230d290e",
  "deficit-wall-hspu": "d9ee40fec9f20ed55916db4d332423124bffbf05bf5353bb7d4513fd654cfa77",
  "feet-assisted-tuck-press-load": "d7505f01909eb660a3f1d2ddb569136e109d865e0d6ea4eb25ef08e9766ad1d8",
  "assisted-bent-arm-tuck-press": "84131e4eb17c567c043df17ebf36f64f1f2e0dd72ee420c57ebf7274412ae40c",
  "assisted-straddle-press-wall-handstand": "75bbf95a7adc41fe71d93ebd123a411364e5fa99d07b555e423af47141badb23",
  "wall-handstand-straddle-lower": "172d73114541407e0c0f1da864fe38e4f8206f2116e7e5acb8a5dabc89b11fb3",
  "assisted-pike-press-to-handstand": "a948d7e76d0f622a3d176ecf39e405aa2a1f2597c4b7c470018b88e22b5f4cf7",
  "pike-press-negative": "2c1398e4ee0f6116933925f5c3c39c5cd2306673f7e70e15f8491baf9b89b555",
  "deficit-parallette-push-up": "3661bcc92b8a1197f8c943b5e082bfe27cfd9f6202723313bd2390079c5db258",
  "l-sit-to-tuck-planche-transition": "2b384e0b704abac13d980a6fec9fb323f72f8b64588145e50b96db96d2236c30",
  "tuck-planche-to-l-sit-transition": "76772754d702dbc1075f0165a1da03c1497581142bb3e2ba01b42f0af7bdb4bf",
} as const);

export type VNextPhase11PreflightGateId =
  | "deployed-v12-baseline-verified"
  | "phase11-release-artifact-frozen"
  | "recoverable-production-snapshots-verified"
  | "compatible-schema-api-app-worker-order-ready"
  | "live-migration-idempotency-and-reconciliation-ready"
  | "release-and-rollback-owners-identified"
  | "rollback-controls-active"
  | "observation-window-and-stop-thresholds-approved";

export type VNextPhase11PreflightGate = Readonly<{
  id: VNextPhase11PreflightGateId;
  status: "pending" | "passed";
  evidence?: string;
}>;

export type VNextPhase11Authority = "v1.2" | "vnext-production";
export type VNextPhase11AuthorityPair = Readonly<{
  read: VNextPhase11Authority;
  write: VNextPhase11Authority;
}>;

export type VNextPhase11ProductionReleaseContract = Readonly<{
  schemaVersion: typeof VNEXT_PHASE11_PRODUCTION_RELEASE_CONTRACT_VERSION;
  acceptedPhase10Candidate: Readonly<{
    id: typeof VNEXT_PHASE10_ACCEPTED_RC_ID;
    sourceFingerprint: typeof VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT;
    status: "owner-approved-historical-candidate";
  }>;
  approvals: Readonly<{
    phase10ReleaseReview: Readonly<{
      status: "approved";
      approvedOn: typeof VNEXT_PHASE10_OWNER_APPROVAL_DATE;
      evidence: "owner-approved-phase-10-after-live-animation-review";
    }>;
    phase11Scope: Readonly<{
      status: "approved";
      approvedOn: typeof VNEXT_PHASE10_OWNER_APPROVAL_DATE;
      evidence: "owner-explicitly-authorised-phase-11";
    }>;
    media: readonly Readonly<{
      requirementId: string;
      reference: string;
      assetFingerprint: string;
      status: "approved";
      reviewId: "phase11-owner-live-animation-acceptance";
      approvedOn: typeof VNEXT_PHASE10_OWNER_APPROVAL_DATE;
    }>[];
  }>;
  /** Phase 11 changes require a new frozen artifact fingerprint. */
  phase11ReleaseArtifact: Readonly<{
    status: "not-frozen" | "frozen";
    sourceFingerprint: string | null;
  }>;
  preflight: readonly VNextPhase11PreflightGate[];
  productionGrant: Readonly<{
    status: "withheld" | "granted";
    releaseArtifactFingerprint: string | null;
    authorizations: Readonly<{
      deployCompatibleRelease: boolean;
      runIdempotentLiveMigration: boolean;
      switchProductionAuthority: boolean;
      deleteLegacyDataOrPaths: boolean;
    }>;
  }>;
  authority: Readonly<{
    before: VNextPhase11AuthorityPair;
    after: VNextPhase11AuthorityPair;
    rollback: VNextPhase11AuthorityPair;
    coherentReadWriteOnly: true;
  }>;
}>;

const V12_AUTHORITY = Object.freeze({ read: "v1.2", write: "v1.2" } as const);
const VNEXT_PRODUCTION_AUTHORITY = Object.freeze({
  read: "vnext-production",
  write: "vnext-production",
} as const);

const REQUIRED_PREFLIGHT_GATES = Object.freeze([
  "deployed-v12-baseline-verified",
  "phase11-release-artifact-frozen",
  "recoverable-production-snapshots-verified",
  "compatible-schema-api-app-worker-order-ready",
  "live-migration-idempotency-and-reconciliation-ready",
  "release-and-rollback-owners-identified",
  "rollback-controls-active",
  "observation-window-and-stop-thresholds-approved",
] as const satisfies readonly VNextPhase11PreflightGateId[]);

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};

const ownerMediaApprovals = Object.entries(VNEXT_PHASE10_OWNER_APPROVED_MEDIA_FINGERPRINTS)
  .map(([reference, assetFingerprint]) => ({
    requirementId: `phase7-media-${reference}`,
    reference,
    assetFingerprint,
    status: "approved" as const,
    reviewId: "phase11-owner-live-animation-acceptance" as const,
    approvedOn: VNEXT_PHASE10_OWNER_APPROVAL_DATE,
  }));

/**
 * Owner approval starts Phase 11 but does not itself grant a live operation.
 * Every production preflight remains pending until evidence from the actual
 * target environment is bound to a newly frozen Phase 11 artifact.
 */
export const vNextPhase11ProductionReleaseContract = deepFreeze({
  schemaVersion: VNEXT_PHASE11_PRODUCTION_RELEASE_CONTRACT_VERSION,
  acceptedPhase10Candidate: {
    id: VNEXT_PHASE10_ACCEPTED_RC_ID,
    sourceFingerprint: VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT,
    status: "owner-approved-historical-candidate",
  },
  approvals: {
    phase10ReleaseReview: {
      status: "approved",
      approvedOn: VNEXT_PHASE10_OWNER_APPROVAL_DATE,
      evidence: "owner-approved-phase-10-after-live-animation-review",
    },
    phase11Scope: {
      status: "approved",
      approvedOn: VNEXT_PHASE10_OWNER_APPROVAL_DATE,
      evidence: "owner-explicitly-authorised-phase-11",
    },
    media: ownerMediaApprovals,
  },
  phase11ReleaseArtifact: {
    status: "frozen",
    sourceFingerprint: "6ea84cd7835a8d605708e33fa9e673534d38c5fed230914162e1842b55dee6d4",
  },
  preflight: REQUIRED_PREFLIGHT_GATES.map((id) => id === "phase11-release-artifact-frozen"
    ? {
        id,
        status: "passed" as const,
        evidence: "dist-set:6ea84cd7835a8d605708e33fa9e673534d38c5fed230914162e1842b55dee6d4",
      }
    : { id, status: "pending" as const }),
  productionGrant: {
    status: "withheld",
    releaseArtifactFingerprint: null,
    authorizations: {
      deployCompatibleRelease: false,
      runIdempotentLiveMigration: false,
      switchProductionAuthority: false,
      deleteLegacyDataOrPaths: false,
    },
  },
  authority: {
    before: V12_AUTHORITY,
    after: VNEXT_PRODUCTION_AUTHORITY,
    rollback: V12_AUTHORITY,
    coherentReadWriteOnly: true,
  },
} as const satisfies VNextPhase11ProductionReleaseContract);

export type VNextPhase11ReleaseIssueCode =
  | "contract-version-invalid"
  | "accepted-candidate-invalid"
  | "phase10-approval-invalid"
  | "phase11-scope-approval-invalid"
  | "media-manifest-invalid"
  | "media-approval-invalid"
  | "media-approval-fingerprint-mismatch"
  | "preflight-gate-invalid"
  | "production-preflight-incomplete"
  | "release-artifact-unbound"
  | "grant-inconsistent"
  | "mixed-authority-cutover"
  | "rollback-authority-invalid"
  | "destructive-cleanup-prohibited";

export type VNextPhase11ReleaseIssue = Readonly<{
  severity: "error" | "production-blocker";
  code: VNextPhase11ReleaseIssueCode;
  message: string;
  subject?: string;
}>;

export type VNextPhase11ReleaseEvaluation = Readonly<{
  contractValid: boolean;
  ownerApproved: boolean;
  mediaApproved: boolean;
  productionAuthorized: boolean;
  pendingGateIds: readonly VNextPhase11PreflightGateId[];
  issues: readonly VNextPhase11ReleaseIssue[];
}>;

const sameAuthority = (
  left: VNextPhase11AuthorityPair,
  right: VNextPhase11AuthorityPair,
): boolean => left.read === right.read && left.write === right.write;

const coherentAuthority = (value: VNextPhase11AuthorityPair): boolean =>
  value.read === value.write;

/** Fail-closed evaluation; callers cannot turn one operation on in isolation. */
export const evaluateVNextPhase11ProductionRelease = (
  contract: VNextPhase11ProductionReleaseContract,
  mediaManifest: VNextMediaReleaseManifest = vNextMediaReleaseManifest,
): VNextPhase11ReleaseEvaluation => {
  const issues: VNextPhase11ReleaseIssue[] = [];
  const add = (
    severity: VNextPhase11ReleaseIssue["severity"],
    code: VNextPhase11ReleaseIssueCode,
    message: string,
    subject?: string,
  ) => issues.push({ severity, code, message, ...(subject ? { subject } : {}) });

  if (contract.schemaVersion !== VNEXT_PHASE11_PRODUCTION_RELEASE_CONTRACT_VERSION) {
    add("error", "contract-version-invalid", "The Phase 11 production release contract version is unsupported.");
  }

  const acceptedCandidateValid =
    contract.acceptedPhase10Candidate.id === VNEXT_PHASE10_ACCEPTED_RC_ID
    && contract.acceptedPhase10Candidate.sourceFingerprint
      === VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT
    && contract.acceptedPhase10Candidate.sourceFingerprint
      === VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT
    && contract.acceptedPhase10Candidate.sourceFingerprint
      === vNextReleaseCandidateManifest.releaseCandidate.integrationSourceFingerprint
    && contract.acceptedPhase10Candidate.status === "owner-approved-historical-candidate";
  if (!acceptedCandidateValid) {
    add("error", "accepted-candidate-invalid", "Phase 11 is not bound to the exact owner-approved RC.3 source fingerprint.");
  }

  const ownerApproved =
    contract.approvals.phase10ReleaseReview.status === "approved"
    && contract.approvals.phase10ReleaseReview.approvedOn === VNEXT_PHASE10_OWNER_APPROVAL_DATE
    && contract.approvals.phase10ReleaseReview.evidence
      === "owner-approved-phase-10-after-live-animation-review";
  if (!ownerApproved) {
    add("error", "phase10-approval-invalid", "The owner Phase 10 release decision is absent or targets another review.");
  }
  const phase11ScopeApproved =
    contract.approvals.phase11Scope.status === "approved"
    && contract.approvals.phase11Scope.approvedOn === VNEXT_PHASE10_OWNER_APPROVAL_DATE
    && contract.approvals.phase11Scope.evidence === "owner-explicitly-authorised-phase-11";
  if (!phase11ScopeApproved) {
    add("error", "phase11-scope-approval-invalid", "Explicit owner authority to start Phase 11 is absent.");
  }

  const mediaManifestIssues = validateVNextMediaReleaseManifest(mediaManifest);
  if (mediaManifestIssues.length > 0) {
    add("error", "media-manifest-invalid", `The canonical media manifest has ${mediaManifestIssues.length} integrity issue(s).`);
  }
  const approvalByRequirement = new Map<string, typeof contract.approvals.media[number]>();
  for (const approval of contract.approvals.media) {
    if (approvalByRequirement.has(approval.requirementId)
      || approval.status !== "approved"
      || approval.reviewId !== "phase11-owner-live-animation-acceptance"
      || approval.approvedOn !== VNEXT_PHASE10_OWNER_APPROVAL_DATE
      || !SHA256_PATTERN.test(approval.assetFingerprint)) {
      add("error", "media-approval-invalid", "An owner media approval is duplicate or malformed.", approval.requirementId);
    }
    approvalByRequirement.set(approval.requirementId, approval);
  }
  for (const entry of mediaManifest.entries) {
    const approval = approvalByRequirement.get(entry.requirementId);
    const implementation = entry.state.implementation;
    const technicalReview = entry.state.technicalReview;
    if (!approval || approval.reference !== entry.reference || implementation.status !== "implemented"
      || technicalReview.status !== "approved") {
      add("error", "media-approval-invalid", "A canonical owned-motion requirement lacks exact implementation, technical review or owner approval.", entry.requirementId);
      continue;
    }
    if (approval.assetFingerprint !== implementation.assetFingerprint
      || approval.assetFingerprint !== technicalReview.reviewedAssetFingerprint) {
      add("error", "media-approval-fingerprint-mismatch", "Owner approval does not match the exact technically reviewed motion fingerprint.", entry.requirementId);
    }
    approvalByRequirement.delete(entry.requirementId);
  }
  for (const unknownRequirement of approvalByRequirement.keys()) {
    add("error", "media-approval-invalid", "Owner approval targets a non-canonical media requirement.", unknownRequirement);
  }
  const mediaApproved = !issues.some((issue) =>
    issue.code === "media-manifest-invalid"
    || issue.code === "media-approval-invalid"
    || issue.code === "media-approval-fingerprint-mismatch");

  const gatesById = new Map<VNextPhase11PreflightGateId, VNextPhase11PreflightGate>();
  for (const gate of contract.preflight) {
    if (!REQUIRED_PREFLIGHT_GATES.includes(gate.id) || gatesById.has(gate.id)) {
      add("error", "preflight-gate-invalid", "A Phase 11 preflight gate is unknown or duplicated.", gate.id);
      continue;
    }
    if (gate.status === "passed" && !gate.evidence?.trim()) {
      add("error", "preflight-gate-invalid", "A passed Phase 11 preflight gate has no bound evidence.", gate.id);
    }
    gatesById.set(gate.id, gate);
  }
  for (const id of REQUIRED_PREFLIGHT_GATES) {
    if (!gatesById.has(id)) {
      add("error", "preflight-gate-invalid", "A required Phase 11 preflight gate is missing.", id);
    }
  }
  const pendingGateIds = REQUIRED_PREFLIGHT_GATES.filter((id) =>
    gatesById.get(id)?.status !== "passed");
  for (const id of pendingGateIds) {
    add("production-blocker", "production-preflight-incomplete", "Production remains blocked until this target-environment preflight passes.", id);
  }

  const releaseFingerprint = contract.phase11ReleaseArtifact.sourceFingerprint;
  const releaseArtifactBound = contract.phase11ReleaseArtifact.status === "frozen"
    && releaseFingerprint !== null
    && SHA256_PATTERN.test(releaseFingerprint)
    && releaseFingerprint !== VNEXT_PHASE10_ACCEPTED_RC_SOURCE_FINGERPRINT;
  if (!releaseArtifactBound) {
    add("production-blocker", "release-artifact-unbound", "A distinct, frozen Phase 11 release artifact fingerprint is required.");
  }

  if (!coherentAuthority(contract.authority.before)
    || !coherentAuthority(contract.authority.after)
    || !coherentAuthority(contract.authority.rollback)
    || !sameAuthority(contract.authority.before, V12_AUTHORITY)
    || !sameAuthority(contract.authority.after, VNEXT_PRODUCTION_AUTHORITY)) {
    add("error", "mixed-authority-cutover", "Phase 11 requires atomic coherent read/write authority from v1.2 to vNext production.");
  }
  if (!sameAuthority(contract.authority.rollback, V12_AUTHORITY)) {
    add("error", "rollback-authority-invalid", "Phase 11 rollback must restore coherent v1.2 read/write authority.");
  }

  const authorizations = contract.productionGrant.authorizations;
  if (authorizations.deleteLegacyDataOrPaths) {
    add("error", "destructive-cleanup-prohibited", "Phase 11 does not authorise legacy data or compatibility-path deletion.");
  }
  const allLiveOperationsGranted = authorizations.deployCompatibleRelease
    && authorizations.runIdempotentLiveMigration
    && authorizations.switchProductionAuthority;
  if (contract.productionGrant.status === "withheld") {
    if (contract.productionGrant.releaseArtifactFingerprint !== null
      || allLiveOperationsGranted
      || authorizations.deployCompatibleRelease
      || authorizations.runIdempotentLiveMigration
      || authorizations.switchProductionAuthority) {
      add("error", "grant-inconsistent", "A withheld production grant cannot authorise or bind a live operation.");
    }
  } else if (!releaseArtifactBound
    || contract.productionGrant.releaseArtifactFingerprint !== releaseFingerprint
    || pendingGateIds.length > 0
    || !acceptedCandidateValid
    || !ownerApproved
    || !phase11ScopeApproved
    || !mediaApproved
    || !allLiveOperationsGranted) {
    add("error", "grant-inconsistent", "The production grant was declared before every exact approval, artifact and preflight condition passed.");
  }

  const contractValid = !issues.some((issue) => issue.severity === "error");
  const productionAuthorized = contractValid
    && !issues.some((issue) => issue.severity === "production-blocker")
    && contract.productionGrant.status === "granted"
    && allLiveOperationsGranted
    && !authorizations.deleteLegacyDataOrPaths;
  return {
    contractValid,
    ownerApproved: ownerApproved && phase11ScopeApproved,
    mediaApproved,
    productionAuthorized,
    pendingGateIds,
    issues,
  };
};
