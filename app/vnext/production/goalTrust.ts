import { parseProjectionVersion } from "../contracts";
import { goalTrustPlacementEntryRules } from "../placementEntry";
import type { VNextRuntimeCatalogue } from "../releaseCandidate/runtime";
import { trainingQualityCatalogue } from "./trainingQuality";

/**
 * Projection 12 (review batch 1, owner-approved 2026-10-22). Definitions 1–8,
 * observations and projection 11 replay are unchanged; the derived cache
 * rebuilds once.
 *
 * - Measured entry also admits the brief floor and stable parallette tuck
 *   checks after the same four readiness facets as the grounded Planche entries.
 * - High-demand work counts as recovered after 40 hours instead of 48, so
 *   every-other-day training is not treated as consecutive-day training.
 *   Same-day and next-day sessions remain modified. Product rule, not a
 *   validated recovery threshold.
 * - A guided check delays only a repeat of the same exercise for 48 hours;
 *   workout exposures keep the shared high-domain rule (now 40 hours).
 * - Placement review shows the main goal's available checks first.
 */
export const goalTrustCatalogue: VNextRuntimeCatalogue = {
  ...trainingQualityCatalogue,
  projectionPolicy: {
    ...trainingQualityCatalogue.projectionPolicy,
    version: parseProjectionVersion(12),
    highLoadModificationHours: 40,
    measuredPlacementEntries: goalTrustPlacementEntryRules,
    guidedCheckRecoveryByExercise: true,
    mainGoalFirstPlacementReview: true,
  },
};
