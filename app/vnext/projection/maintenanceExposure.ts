import type { DefinitionBundle, DerivedAthleteState, SessionPlan, SessionRecord } from "../contracts";
import { meaningfulWorkoutParticipationSeconds } from "../workoutTiming";
import { milestoneKey, type NormalizedObservation } from "./contracts";

/** Scheduling evidence only. Never establishes a skill or renews an exit check. */
export const deriveMaintenanceExposures = (
  observations: readonly NormalizedObservation[],
  records: readonly SessionRecord[],
  plans: readonly SessionPlan[],
  bundles: readonly DefinitionBundle[],
): NonNullable<DerivedAthleteState["maintenanceExposures"]> => {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const latest = new Map<string, NonNullable<DerivedAthleteState["maintenanceExposures"]>[number]>();
  for (const observation of observations) {
    if (observation.source.kind !== "session-item" || observation.legacySparse
      || observation.symptomOrInstability || observation.participationSeconds <= 0
      || observation.reviewOutcome !== "clean") continue;
    const source = observation.source;
    const record = recordsById.get(source.sessionRecordId);
    if (!record || record.status === "abandoned") continue;
    const outcome = record.itemOutcomes.find((item) => item.planItemId === source.planItemId);
    const plan = plansById.get(record.planId);
    const item = plan?.items.find((item) => item.id === source.planItemId);
    if (!item?.targetMilestone || !outcome || outcome.status !== "completed"
      || item.purpose === "preparation" || item.purpose === "recovery"
      || item.exerciseId !== observation.exerciseId
      || item.exerciseDefinitionVersion !== observation.exerciseDefinitionVersion
      || item.prescriptionVariantId !== observation.prescriptionVariantId) continue;
    const exercise = bundles.find((bundle) => bundle.catalogueVersion === plan?.catalogueVersion)?.exercises
      .find((candidate) => candidate.id === item.exerciseId && candidate.definitionVersion === item.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === item.prescriptionVariantId);
    if (!exercise || !variant || outcome.participationBasis === "legacy-unknown"
      || observation.participationSeconds < meaningfulWorkoutParticipationSeconds(item, exercise, variant)) continue;
    const key = milestoneKey(item.targetMilestone);
    const previous = latest.get(key);
    if (!previous || previous.occurredAt < observation.occurredAt) {
      latest.set(key, { milestone: item.targetMilestone, occurredAt: observation.occurredAt, source });
    }
  }
  return [...latest.values()].sort((a, b) => milestoneKey(a.milestone).localeCompare(milestoneKey(b.milestone)));
};
