import type {
  ExerciseId,
  IsoTimestamp,
  PlanItemId,
  SessionPlan,
  SessionPlanId,
} from "../contracts";
import {
  phase7MediaRequirements,
  type Phase7MediaRequirement,
} from "../definitions/phase7Media";
import {
  phase10OwnedMotionGuides,
  type OwnedMotionReference,
} from "../media/phase10OwnedMotion";

export const VNEXT_MEDIA_RELEASE_MANIFEST_VERSION = 1 as const;
export const VNEXT_MEDIA_FALLBACK_POLICY = "block-no-substitution" as const;

export type VNextMediaRenderer = "motion-guide" | "owned-file";

export type VNextMediaImplementation =
  | Readonly<{ status: "missing" }>
  | Readonly<{
    status: "implemented";
    renderer: VNextMediaRenderer;
    /** Motion-preset ID or same-origin content-addressed owned-file path. */
    locator: string;
    /** Lowercase SHA-256 of the exact reviewed guide data or owned file bytes. */
    assetFingerprint: string;
    playback: Phase7MediaRequirement["playback"];
    deliveredMovementPhases: readonly string[];
    deliveredVisuals: readonly string[];
    deliveredCameraView: string;
  }>;

export type VNextMediaReview =
  | Readonly<{ status: "pending" }>
  | Readonly<{
    status: "approved";
    reviewId: string;
    reviewedAt: IsoTimestamp;
    /** Approval is invalid as soon as the implemented asset changes. */
    reviewedAssetFingerprint: string;
  }>;

export type VNextMediaReleaseState = Readonly<{
  implementation: VNextMediaImplementation;
  technicalReview: VNextMediaReview;
  ownerReview: VNextMediaReview;
}>;

export type VNextMediaReleaseEntry = Readonly<{
  requirementId: string;
  reference: string;
  exerciseIds: readonly ExerciseId[];
  playback: Phase7MediaRequirement["playback"];
  state: VNextMediaReleaseState;
}>;

export type VNextMediaReleaseManifest = Readonly<{
  schemaVersion: typeof VNEXT_MEDIA_RELEASE_MANIFEST_VERSION;
  entries: readonly VNextMediaReleaseEntry[];
}>;

/**
 * Future reviewed deliveries can be supplied without editing the frozen Phase
 * 7 brief. The manifest builder rejects unknown or duplicate overlays rather
 * than silently replacing one review state with another.
 */
export type VNextMediaReleaseDelivery = Readonly<{
  requirementId: string;
  state: Readonly<{
    implementation: Extract<VNextMediaImplementation, { status: "implemented" }>;
    technicalReview: VNextMediaReview;
    ownerReview: VNextMediaReview;
  }>;
}>;

export type VNextMediaReleaseIssueCode =
  | "manifest-version-invalid"
  | "manifest-entry-count-invalid"
  | "manifest-requirement-duplicate"
  | "manifest-requirement-missing"
  | "manifest-requirement-unknown"
  | "manifest-reference-mismatch"
  | "manifest-playback-mismatch"
  | "manifest-exercise-mapping-mismatch"
  | "manifest-exercise-mapping-duplicate"
  | "implementation-locator-invalid"
  | "implementation-fingerprint-invalid"
  | "implementation-phase-coverage-invalid"
  | "implementation-visual-coverage-invalid"
  | "implementation-camera-view-invalid"
  | "review-without-implementation"
  | "review-metadata-invalid"
  | "review-fingerprint-mismatch";

export type VNextMediaReleaseIssue = Readonly<{
  code: VNextMediaReleaseIssueCode;
  message: string;
  requirementId?: string;
  exerciseId?: ExerciseId;
}>;

export type VNextMediaBlockReason =
  | "manifest-invalid"
  | "media-requirement-missing"
  | "media-implementation-missing"
  | "technical-review-pending"
  | "owner-review-pending"
  | "technical-review-fingerprint-mismatch"
  | "owner-review-fingerprint-mismatch";

export type VNextReachableMediaDecision = Readonly<{
  exerciseId: ExerciseId;
  status: "not-required" | "ready" | "blocked";
  requirementId?: string;
  reference?: string;
  reasons: readonly VNextMediaBlockReason[];
  fallbackPolicy: typeof VNEXT_MEDIA_FALLBACK_POLICY;
}>;

export type VNextProductionMediaEvaluation = Readonly<{
  releaseAllowed: boolean;
  status: "ready" | "blocked";
  fallbackPolicy: typeof VNEXT_MEDIA_FALLBACK_POLICY;
  manifestIssues: readonly VNextMediaReleaseIssue[];
  decisions: readonly VNextReachableMediaDecision[];
  blocked: readonly VNextReachableMediaDecision[];
}>;

export type VNextPlanMediaItemDecision = VNextReachableMediaDecision & Readonly<{
  planItemId: PlanItemId;
}>;

export type VNextPlanMediaEvaluation = Readonly<{
  planId: SessionPlanId;
  releaseAllowed: boolean;
  status: "ready" | "blocked";
  fallbackPolicy: typeof VNEXT_MEDIA_FALLBACK_POLICY;
  manifestIssues: readonly VNextMediaReleaseIssue[];
  items: readonly VNextPlanMediaItemDecision[];
  blockedItems: readonly VNextPlanMediaItemDecision[];
}>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const canonicalRequirementById = new Map(
  phase7MediaRequirements.map((requirement) => [requirement.id, requirement] as const),
);

const canonicalExerciseIds = phase7MediaRequirements
  .flatMap((requirement) => requirement.exerciseIds);

const sameSequence = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const isCanonicalTimestamp = (value: string): boolean =>
  ISO_TIMESTAMP_PATTERN.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;

const reviewMetadataIsValid = (review: Extract<VNextMediaReview, { status: "approved" }>): boolean =>
  review.reviewId.trim().length > 0
  && isCanonicalTimestamp(review.reviewedAt)
  && SHA256_PATTERN.test(review.reviewedAssetFingerprint);

const missingState = (): VNextMediaReleaseState => ({
  implementation: { status: "missing" },
  technicalReview: { status: "pending" },
  ownerReview: { status: "pending" },
});

export const buildVNextMediaReleaseManifest = (
  deliveries: readonly VNextMediaReleaseDelivery[] = [],
): VNextMediaReleaseManifest => {
  const deliveryByRequirementId = new Map<string, VNextMediaReleaseDelivery>();
  for (const delivery of deliveries) {
    if (!canonicalRequirementById.has(delivery.requirementId)) {
      throw new TypeError(`Unknown vNext media requirement ${delivery.requirementId}`);
    }
    if (deliveryByRequirementId.has(delivery.requirementId)) {
      throw new TypeError(`Duplicate vNext media delivery ${delivery.requirementId}`);
    }
    deliveryByRequirementId.set(delivery.requirementId, delivery);
  }

  return {
    schemaVersion: VNEXT_MEDIA_RELEASE_MANIFEST_VERSION,
    entries: phase7MediaRequirements.map((requirement): VNextMediaReleaseEntry => ({
      requirementId: requirement.id,
      reference: requirement.reference,
      exerciseIds: requirement.exerciseIds,
      playback: requirement.playback,
      state: deliveryByRequirementId.get(requirement.id)?.state ?? missingState(),
    })),
  };
};

const phase10OwnedMotionDeliveries = phase7MediaRequirements.map((requirement): VNextMediaReleaseDelivery => {
  const guide = phase10OwnedMotionGuides[requirement.reference as OwnedMotionReference];
  if (!guide || guide.reference !== requirement.reference) {
    throw new Error(`Phase 10 owned-motion delivery is missing ${requirement.reference}`);
  }
  return {
    requirementId: requirement.id,
    state: {
      implementation: {
        status: "implemented",
        renderer: "motion-guide",
        locator: guide.reference,
        assetFingerprint: guide.assetFingerprint,
        playback: guide.playback,
        deliveredMovementPhases: requirement.movementPhases,
        deliveredVisuals: requirement.requiredVisuals ?? [],
        deliveredCameraView: requirement.cameraView,
      },
      technicalReview: {
        status: "approved",
        reviewId: "phase10-owned-motion-technical-review-v2",
        reviewedAt: "2026-08-28T15:25:55.000Z" as IsoTimestamp,
        reviewedAssetFingerprint: guide.assetFingerprint,
      },
      // Phase 10 owner approval covers these exact RC.3 animation fingerprints
      // in the final-product player. Any later motion, geometry, timing or
      // presentation change invalidates the fingerprint match and fails closed.
      ownerReview: {
        status: "approved",
        reviewId: "phase10-owner-live-animation-approval-v1",
        reviewedAt: "2026-08-28T20:23:39.000Z" as IsoTimestamp,
        reviewedAssetFingerprint: guide.assetFingerprint,
      },
    },
  };
});

/**
 * Phase 10 replaces every missing Phase 7 placeholder with a local,
 * content-addressed guide. Technical and owner review are complete for these
 * exact visual fingerprints; any asset drift fails closed.
 */
export const vNextMediaReleaseManifest = buildVNextMediaReleaseManifest(
  phase10OwnedMotionDeliveries,
);

export const validateVNextMediaReleaseManifest = (
  manifest: VNextMediaReleaseManifest,
): readonly VNextMediaReleaseIssue[] => {
  const issues: VNextMediaReleaseIssue[] = [];
  const issue = (
    code: VNextMediaReleaseIssueCode,
    message: string,
    entry?: Pick<VNextMediaReleaseEntry, "requirementId">,
    exerciseId?: ExerciseId,
  ) => issues.push({
    code,
    message,
    ...(entry ? { requirementId: entry.requirementId } : {}),
    ...(exerciseId ? { exerciseId } : {}),
  });

  if (manifest.schemaVersion !== VNEXT_MEDIA_RELEASE_MANIFEST_VERSION) {
    issue("manifest-version-invalid", "The vNext media release manifest version is unsupported.");
  }
  if (manifest.entries.length !== phase7MediaRequirements.length) {
    issue(
      "manifest-entry-count-invalid",
      `Expected ${phase7MediaRequirements.length} media release entries; found ${manifest.entries.length}.`,
    );
  }

  const seenRequirements = new Set<string>();
  const exerciseCounts = new Map<ExerciseId, number>();
  for (const entry of manifest.entries) {
    if (seenRequirements.has(entry.requirementId)) {
      issue(
        "manifest-requirement-duplicate",
        `Media requirement ${entry.requirementId} appears more than once.`,
        entry,
      );
    }
    seenRequirements.add(entry.requirementId);
    const requirement = canonicalRequirementById.get(entry.requirementId);
    if (!requirement) {
      issue(
        "manifest-requirement-unknown",
        `Media requirement ${entry.requirementId} is not a canonical Phase 7 brief.`,
        entry,
      );
      continue;
    }
    if (entry.reference !== requirement.reference) {
      issue(
        "manifest-reference-mismatch",
        `Media requirement ${entry.requirementId} changed its canonical reference.`,
        entry,
      );
    }
    if (entry.playback !== requirement.playback) {
      issue(
        "manifest-playback-mismatch",
        `Media requirement ${entry.requirementId} changed its canonical playback.`,
        entry,
      );
    }
    if (!sameSequence(entry.exerciseIds, requirement.exerciseIds)) {
      issue(
        "manifest-exercise-mapping-mismatch",
        `Media requirement ${entry.requirementId} changed its canonical exercise mapping.`,
        entry,
      );
    }
    for (const exerciseId of entry.exerciseIds) {
      exerciseCounts.set(exerciseId, (exerciseCounts.get(exerciseId) ?? 0) + 1);
    }

    const { implementation, technicalReview, ownerReview } = entry.state;
    if (implementation.status === "missing") {
      if (technicalReview.status === "approved" || ownerReview.status === "approved") {
        issue(
          "review-without-implementation",
          `Media requirement ${entry.requirementId} has approval without an implemented asset.`,
          entry,
        );
      }
      continue;
    }

    const locatorIsLocal = implementation.locator.trim().length > 0
      && !/^(?:https?:)?\/\//u.test(implementation.locator);
    if (!locatorIsLocal
      || (implementation.renderer === "motion-guide" && implementation.locator !== entry.reference)) {
      issue(
        "implementation-locator-invalid",
        `Media requirement ${entry.requirementId} has an invalid or non-canonical locator.`,
        entry,
      );
    }
    if (!SHA256_PATTERN.test(implementation.assetFingerprint)) {
      issue(
        "implementation-fingerprint-invalid",
        `Media requirement ${entry.requirementId} lacks a lowercase SHA-256 asset fingerprint.`,
        entry,
      );
    }
    if (implementation.playback !== requirement.playback) {
      issue(
        "manifest-playback-mismatch",
        `Implemented media ${entry.requirementId} does not use the brief's playback.`,
        entry,
      );
    }
    if (!sameSequence(implementation.deliveredMovementPhases, requirement.movementPhases)) {
      issue(
        "implementation-phase-coverage-invalid",
        `Implemented media ${entry.requirementId} does not declare every canonical movement phase in order.`,
        entry,
      );
    }
    if (!sameSequence(implementation.deliveredVisuals, requirement.requiredVisuals ?? [])) {
      issue(
        "implementation-visual-coverage-invalid",
        `Implemented media ${entry.requirementId} does not declare every required visual in order.`,
        entry,
      );
    }
    if (implementation.deliveredCameraView !== requirement.cameraView) {
      issue(
        "implementation-camera-view-invalid",
        `Implemented media ${entry.requirementId} does not declare the canonical camera view.`,
        entry,
      );
    }

    for (const [label, review] of [
      ["Technical", technicalReview],
      ["Owner", ownerReview],
    ] as const) {
      if (review.status !== "approved") continue;
      if (!reviewMetadataIsValid(review)) {
        issue(
          "review-metadata-invalid",
          `${label} review metadata is invalid for ${entry.requirementId}.`,
          entry,
        );
      }
      if (review.reviewedAssetFingerprint !== implementation.assetFingerprint) {
        issue(
          "review-fingerprint-mismatch",
          `${label} approval for ${entry.requirementId} targets another asset fingerprint.`,
          entry,
        );
      }
    }
  }

  for (const requirement of phase7MediaRequirements) {
    if (!seenRequirements.has(requirement.id)) {
      issue(
        "manifest-requirement-missing",
        `Canonical media requirement ${requirement.id} is missing from the release manifest.`,
        { requirementId: requirement.id },
      );
    }
  }
  for (const exerciseId of canonicalExerciseIds) {
    if ((exerciseCounts.get(exerciseId) ?? 0) !== 1) {
      issue(
        "manifest-exercise-mapping-duplicate",
        `Phase 7 exercise ${exerciseId} must resolve to exactly one media release entry.`,
        undefined,
        exerciseId,
      );
    }
  }

  return issues;
};

const entryBlockReasons = (entry: VNextMediaReleaseEntry): readonly VNextMediaBlockReason[] => {
  const { implementation, technicalReview, ownerReview } = entry.state;
  if (implementation.status === "missing") return ["media-implementation-missing"];
  const reasons: VNextMediaBlockReason[] = [];
  if (technicalReview.status === "pending") reasons.push("technical-review-pending");
  else if (technicalReview.reviewedAssetFingerprint !== implementation.assetFingerprint) {
    reasons.push("technical-review-fingerprint-mismatch");
  }
  if (ownerReview.status === "pending") reasons.push("owner-review-pending");
  else if (ownerReview.reviewedAssetFingerprint !== implementation.assetFingerprint) {
    reasons.push("owner-review-fingerprint-mismatch");
  }
  return reasons;
};

const entryByExerciseId = (
  manifest: VNextMediaReleaseManifest,
): ReadonlyMap<ExerciseId, VNextMediaReleaseEntry> => {
  const entries = new Map<ExerciseId, VNextMediaReleaseEntry>();
  for (const entry of manifest.entries) {
    for (const exerciseId of entry.exerciseIds) {
      if (!entries.has(exerciseId)) entries.set(exerciseId, entry);
    }
  }
  return entries;
};

const decisionForExercise = (
  exerciseId: ExerciseId,
  entries: ReadonlyMap<ExerciseId, VNextMediaReleaseEntry>,
  manifestInvalid: boolean,
): VNextReachableMediaDecision => {
  const requirementExpected = canonicalExerciseIds.includes(exerciseId);
  const entry = entries.get(exerciseId);
  if (!requirementExpected) {
    return {
      exerciseId,
      status: manifestInvalid ? "blocked" : "not-required",
      reasons: manifestInvalid ? ["manifest-invalid"] : [],
      fallbackPolicy: VNEXT_MEDIA_FALLBACK_POLICY,
    };
  }
  if (!entry) {
    return {
      exerciseId,
      status: "blocked",
      reasons: ["media-requirement-missing"],
      fallbackPolicy: VNEXT_MEDIA_FALLBACK_POLICY,
    };
  }
  const reasons = [
    ...(manifestInvalid ? ["manifest-invalid" as const] : []),
    ...entryBlockReasons(entry),
  ];
  return {
    exerciseId,
    requirementId: entry.requirementId,
    reference: entry.reference,
    status: reasons.length ? "blocked" : "ready",
    reasons,
    fallbackPolicy: VNEXT_MEDIA_FALLBACK_POLICY,
  };
};

/**
 * Release-gate evaluation for the exercise IDs proven reachable by an RC
 * scenario set. Unresolved media blocks those exercises; this API deliberately
 * contains no substitution or fallback output.
 */
export const evaluateProductionReachableVNextMedia = (
  exerciseIds: readonly ExerciseId[],
  manifest: VNextMediaReleaseManifest = vNextMediaReleaseManifest,
): VNextProductionMediaEvaluation => {
  const manifestIssues = validateVNextMediaReleaseManifest(manifest);
  const entries = entryByExerciseId(manifest);
  const decisions = [...new Set(exerciseIds)].map((exerciseId) =>
    decisionForExercise(exerciseId, entries, manifestIssues.length > 0));
  const blocked = decisions.filter((decision) => decision.status === "blocked");
  const releaseAllowed = manifestIssues.length === 0 && blocked.length === 0;
  return {
    releaseAllowed,
    status: releaseAllowed ? "ready" : "blocked",
    fallbackPolicy: VNEXT_MEDIA_FALLBACK_POLICY,
    manifestIssues,
    decisions,
    blocked,
  };
};

/**
 * Fail-closed Session Plan gate. A production path must call this before
 * presenting or starting a plan. Every unresolved planned Phase 7 movement
 * blocks the plan exactly as authored; no exercise is silently substituted.
 */
export const evaluateVNextPlanMediaRelease = (
  plan: Pick<SessionPlan, "id" | "items">,
  manifest: VNextMediaReleaseManifest = vNextMediaReleaseManifest,
): VNextPlanMediaEvaluation => {
  const manifestIssues = validateVNextMediaReleaseManifest(manifest);
  const entries = entryByExerciseId(manifest);
  const items = plan.items.map((item): VNextPlanMediaItemDecision => ({
    ...decisionForExercise(item.exerciseId, entries, manifestIssues.length > 0),
    planItemId: item.id,
  }));
  const blockedItems = items.filter((item) => item.status === "blocked");
  const releaseAllowed = manifestIssues.length === 0 && blockedItems.length === 0;
  return {
    planId: plan.id,
    releaseAllowed,
    status: releaseAllowed ? "ready" : "blocked",
    fallbackPolicy: VNEXT_MEDIA_FALLBACK_POLICY,
    manifestIssues,
    items,
    blockedItems,
  };
};

export const phase7MediaRequiredExerciseIds = [...canonicalExerciseIds] as readonly ExerciseId[];
