/** Combined owner-approved progression release; historical catalogues and approvals stay immutable. */
import type { SessionPlan } from "../contracts";
import type { VNextRuntimeCatalogue } from "../releaseCandidate/runtime";
import type { VNextPlanMediaEvaluation, VNextPlanMediaItemDecision } from "../releaseCandidate/mediaRelease";
import { evaluateBatchAPlanMediaRelease, validateBatchAReleaseAcceptance } from "./batchARelease";
import { batchFDefinitionBundle, batchFDefinitionHistory, batchFProjectionPolicy } from "../progression/batchF";
import { batchBSpecs } from "../progression/batchB";
import { batchBMotionAcceptance } from "../progression/batchBMotionAcceptance";
import { batchBReviewManifest } from "../progression/batchBReviewManifest";
import { batchCSpecs } from "../progression/batchC";
import { batchCMotionAcceptance } from "../progression/batchCMotionAcceptance";
import { batchCReviewManifest } from "../progression/batchCReviewManifest";
import { batchDSpecs } from "../progression/batchD";
import { batchDMotionAcceptance } from "../progression/batchDMotionAcceptance";
import { batchDReviewManifest } from "../progression/batchDReviewManifest";
import { batchESpecs } from "../progression/batchE";
import { batchEMotionAcceptance } from "../progression/batchEMotionAcceptance";
import { batchEReviewManifest } from "../progression/batchEReviewManifest";
import { batchFSpecs } from "../progression/batchF";
import { batchFMotionAcceptance } from "../progression/batchFMotionAcceptance";
import { batchFReviewManifest } from "../progression/batchFReviewManifest";

export const combinedProgressionAcceptance = {
  id: "parallette25-combined-progression.1",
  approvedOn: "2026-10-17",
  ownerDeploymentAuthorization: "approved-after-checks",
  ownerStatement: "Go ahead with the combined release checks, then deploy once everything passes.",
  candidateFingerprint: "719f6e6df825b8ebea006478b2f2ae91628e7944cc1f7243bbb2cda6f34a19fc",
  batches: ["B", "C", "D", "E", "F"],
} as const;
export const combinedProgressionBatches = [
  { letter: "B", specs: batchBSpecs, acceptance: batchBMotionAcceptance, review: batchBReviewManifest },
  { letter: "C", specs: batchCSpecs, acceptance: batchCMotionAcceptance, review: batchCReviewManifest },
  { letter: "D", specs: batchDSpecs, acceptance: batchDMotionAcceptance, review: batchDReviewManifest },
  { letter: "E", specs: batchESpecs, acceptance: batchEMotionAcceptance, review: batchEReviewManifest },
  { letter: "F", specs: batchFSpecs, acceptance: batchFMotionAcceptance, review: batchFReviewManifest },
] as const;

type Acceptance = Readonly<{
  id: string; approvedOn: string; ownerDeploymentAuthorization: string;
  candidateFingerprint: string; batches: readonly string[];
}>;
export const validateCombinedProgressionAcceptance = (
  acceptance: Acceptance = combinedProgressionAcceptance,
  batches: readonly (typeof combinedProgressionBatches[number])[] = combinedProgressionBatches,
): readonly string[] => {
  const issues = [...validateBatchAReleaseAcceptance()];
  if (acceptance.id !== "parallette25-combined-progression.1" || acceptance.approvedOn !== "2026-10-17"
    || acceptance.ownerDeploymentAuthorization !== "approved-after-checks"
    || acceptance.candidateFingerprint !== batchFReviewManifest.candidateFingerprint
    || acceptance.batches.join(",") !== "B,C,D,E,F"
    || batches.map(batch => batch.letter).join(",") !== "B,C,D,E,F") issues.push("combined-release-acceptance-mismatch");
  for (const batch of batches) {
    const { acceptance: ledger, review, specs } = batch;
    if (ledger.ownerMotionAcceptance !== "accepted" || ledger.reviewId !== review.id
      || ledger.candidateFingerprint !== review.candidateFingerprint
      || Object.keys(ledger.motionFingerprints).length !== specs.length) issues.push(`batch-acceptance-mismatch:${batch.letter}`);
    const fingerprints: Readonly<Record<string, string>> = ledger.motionFingerprints;
    const reviewed: Readonly<Record<string, string>> = review.motionFingerprints;
    for (const spec of specs) if (fingerprints[spec.exercise] !== reviewed[spec.exercise]) issues.push(`batch-motion-fingerprint-mismatch:${spec.exercise}`);
  }
  return issues;
};
export const combinedProgressionCatalogue: VNextRuntimeCatalogue = {
  bundle: batchFDefinitionBundle,
  history: batchFDefinitionHistory,
  projectionPolicy: batchFProjectionPolicy,
};

export const evaluateCombinedProgressionPlanMedia = (
  plan: Pick<SessionPlan, "id" | "items">,
  acceptance: Acceptance = combinedProgressionAcceptance,
): VNextPlanMediaEvaluation => {
  const previous = evaluateBatchAPlanMediaRelease(plan);
  const accepted = validateCombinedProgressionAcceptance(acceptance).length === 0;
  const items = previous.items.map((item): VNextPlanMediaItemDecision => {
    const batch = combinedProgressionBatches.find(entry => entry.specs.some(spec => spec.exercise === item.exerciseId));
    if (!batch) return item;
    return { ...item, requirementId: `batch-${batch.letter.toLowerCase()}-media-${item.exerciseId}`, reference: item.exerciseId,
      status: accepted && item.status !== "blocked" ? "ready" : "blocked",
      reasons: [...item.reasons, ...(accepted ? [] : ["owner-review-pending" as const])],
    };
  });
  const blockedItems = items.filter(item => item.status === "blocked");
  const releaseAllowed = previous.manifestIssues.length === 0 && blockedItems.length === 0;
  return { ...previous, items, blockedItems, releaseAllowed, status: releaseAllowed ? "ready" : "blocked" };
};
