import type { DefinitionBundle, SessionPlan, SessionRecord } from "../contracts";
import { meaningfulWorkoutParticipationSeconds } from "../workoutTiming";

/** Advisory emphasis continuity only; it never changes the saved workout facts. */
export const hasMeaningfulEmphasisTraining = (
  plan: SessionPlan,
  record: SessionRecord,
  bundle: DefinitionBundle,
): boolean => record.status !== "abandoned" && record.planId === plan.id
  && bundle.catalogueVersion === plan.catalogueVersion
  && plan.items.some((item) => {
    if (item.purpose === "preparation" || item.purpose === "recovery") return false;
    const outcome = record.itemOutcomes.find((candidate) => candidate.planItemId === item.id);
    // Sparse/legacy timing is not evidence of meaningful practice. New player
    // completions explicitly mark their measured work, including early finishes.
    if (!outcome || outcome.status === "skipped" || outcome.participationBasis !== "measured"
      || !Number.isFinite(outcome.participationSeconds)) return false;
    const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === item.prescriptionVariantId);
    if (!exercise || !variant) return false;
    return outcome.participationSeconds >= meaningfulWorkoutParticipationSeconds(item, exercise, variant);
  });
