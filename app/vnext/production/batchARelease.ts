/** Additive production content release. Historical RC.3 and catalogue v2 stay frozen. */
import type { SessionPlan } from "../contracts";
import { batchADefinitionBundle, batchADefinitionHistory, batchAProjectionPolicy, batchASpecs } from "../progression/batchA";
import { batchAReviewManifest } from "../progression/batchAReviewManifest";
import type { VNextRuntimeCatalogue } from "../releaseCandidate/runtime";
import {
  evaluateVNextPlanMediaRelease,
  type VNextPlanMediaEvaluation,
  type VNextPlanMediaItemDecision,
} from "../releaseCandidate/mediaRelease";

/** Literal approval of the exact five guides accepted by the owner on 2026-10-17. */
export const batchAReleaseAcceptance = {
  id: "parallette25-batch-a.1",
  approvedOn: "2026-10-17",
  ownerMotionAcceptance: "approved",
  ownerDeploymentAuthorization: "approved-after-checks",
  reviewId: "parallette25-batch-a-review.1",
  candidateFingerprint: "01b28dab5f7d6c682f93b89994123b4f2798f8f44c33ebc38f1e1c4b78256e99",
  motionFingerprints: {
    "parallette-balance-stable-variant": "99ff570272638c62b6db7373ad6a1ca2b8bd428f48392f9a356cfe195f4a5ec7",
    "one-leg-planche-hold": "4fb5774ce71121fc37e25add977abeab088ed91f702a94069b45a22b8d8c3d42",
    "straddle-planche-hold": "63709a8b347df9845532b2ae08ddef21a840aaa7c2e338d1116ba8e2ab65cf2e",
    "v-sit-hold": "b9ee40fea0d9fabb521e47e86cbafd2872c0531e457c6660df7936090cacafe6",
    "deep-forward-loaded-parallette-push-up": "bef897397cbf6ed5f71e0928d67b4b041a9da83a67b42e7a773f24ff1229eee2",
  },
} as const;

type Acceptance = Readonly<{
  id: string; approvedOn: string; ownerMotionAcceptance: string; ownerDeploymentAuthorization: string;
  reviewId: string; candidateFingerprint: string; motionFingerprints: Readonly<Record<string, string>>;
}>;
export const validateBatchAReleaseAcceptance = (acceptance: Acceptance = batchAReleaseAcceptance): readonly string[] => {
  const issues: string[] = [];
  if (acceptance.id !== "parallette25-batch-a.1" || acceptance.approvedOn !== "2026-10-17"
    || acceptance.ownerMotionAcceptance !== "approved"
    || acceptance.ownerDeploymentAuthorization !== "approved-after-checks"
    || acceptance.reviewId !== batchAReviewManifest.id
    || acceptance.candidateFingerprint !== batchAReviewManifest.candidateFingerprint) issues.push("batch-acceptance-mismatch");
  if (Object.keys(acceptance.motionFingerprints).length !== batchASpecs.length) issues.push("batch-motion-count-mismatch");
  for (const spec of batchASpecs) {
    if (acceptance.motionFingerprints[spec.exercise] !== batchAReviewManifest.motionFingerprints[spec.exercise]) {
      issues.push(`batch-motion-fingerprint-mismatch:${spec.exercise}`);
    }
  }
  return issues;
};

export const batchAProductionCatalogue: VNextRuntimeCatalogue = {
  bundle: batchADefinitionBundle,
  history: batchADefinitionHistory,
  projectionPolicy: batchAProjectionPolicy,
};

/** Applies the old gate to old guides, plus the separately accepted Batch A ledger. */
export const evaluateBatchAPlanMediaRelease = (
  plan: Pick<SessionPlan, "id" | "items">,
  acceptance: Acceptance = batchAReleaseAcceptance,
): VNextPlanMediaEvaluation => {
  const previous = evaluateVNextPlanMediaRelease(plan);
  const accepted = validateBatchAReleaseAcceptance(acceptance).length === 0;
  const items = previous.items.map((item): VNextPlanMediaItemDecision => {
    const spec = batchASpecs.find((candidate) => candidate.exercise === item.exerciseId);
    if (!spec) return item;
    return {
      ...item, requirementId: `batch-a-media-${spec.exercise}`, reference: spec.exercise,
      status: accepted && item.status !== "blocked" ? "ready" : "blocked",
      reasons: [...item.reasons, ...(accepted ? [] : ["owner-review-pending" as const])],
    };
  });
  const blockedItems = items.filter((item) => item.status === "blocked");
  const releaseAllowed = previous.manifestIssues.length === 0 && blockedItems.length === 0;
  return { ...previous, items, blockedItems, releaseAllowed, status: releaseAllowed ? "ready" : "blocked" };
};
