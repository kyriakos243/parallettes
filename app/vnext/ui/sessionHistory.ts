import type { DefinitionBundle, SessionPlan, SessionRecord, SessionItemOutcome } from "../contracts";
import { structureWorkoutItem, prescriptionTargetLabel } from "../workoutUx";

export type HistoryMovement = Readonly<{
  id: string;
  plannedName: string;
  plannedPrescription?: string;
  performedName?: string;
  performedTarget?: string;
  outcome: string;
  performed: boolean;
  performedNote?: string;
  activity: string;
  feedback: readonly string[];
  change?: string;
}>;

export type VNextRecentSession = Readonly<{
  id: string;
  title: string;
  completedAt: string;
  participationSeconds: number;
  status: SessionRecord["status"];
  source: "vnext" | "migrated";
  durationLabel?: string;
  durationNote?: string;
  plannedDuration?: string;
  movements?: readonly HistoryMovement[];
}>;

export const historyDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return minutes === 0 ? `${remainder}s` : remainder === 0 ? `${minutes} min` : `${minutes}m ${remainder}s`;
};

export const historyStatus = (status: SessionRecord["status"]): string =>
  ({ complete: "Completed", modified: "Modified workout", partial: "Partly completed", abandoned: "Ended early" })[status];

const reviewLabels = (outcome?: SessionItemOutcome): readonly string[] => {
  if (!outcome?.review) return [];
  const { review } = outcome;
  return [
    `Your feedback: ${({ clean: "clean", partial: "partly completed", "not-today": "not today" })[review.outcome]}`,
    ...(review.difficulty ? [`Effort: ${({ easy: "easy", right: "about right", hard: "hard" })[review.difficulty]}`] : []),
    ...(review.symptomOrInstability ? ["Discomfort or instability reported"] : []),
  ];
};

/** Read-only view of active records. Historical definitions and sparse imports retain their precision. */
export const buildSessionHistory = (
  sources: Readonly<{ sessionPlans: readonly SessionPlan[]; sessionRecords: readonly SessionRecord[] }>,
  history: readonly DefinitionBundle[],
): readonly VNextRecentSession[] => {
  const plans = new Map(sources.sessionPlans.map((plan) => [plan.id, plan]));
  const superseded = new Set(sources.sessionRecords.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []));
  return sources.sessionRecords.filter((record) => !superseded.has(record.id))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt) || right.id.localeCompare(left.id))
    .map((record) => {
      const plan = plans.get(record.planId);
      const bundle = history.find((candidate) => candidate.catalogueVersion === plan?.catalogueVersion);
      const legacy = record.legacySource ?? plan?.legacySource;
      const custom = plan?.rationale.some((reason) => reason.code === "planning-custom-short-session");
      const graphId = plan?.rationale.find((reason) => reason.relatedGraphId)?.relatedGraphId;
      const graph = bundle?.graphs.find((candidate) => candidate.id === graphId);
      const missingTiming = record.itemOutcomes.some((outcome) => outcome.participationBasis === "legacy-unknown");
      const participationSeconds = record.itemOutcomes.reduce((sum, outcome) => sum + outcome.participationSeconds, 0);
      const outcomes = new Map(record.itemOutcomes.map((outcome) => [outcome.planItemId, outcome]));
      const movements = plan?.items.map((item): HistoryMovement => {
        const outcome = outcomes.get(item.id);
        const exercise = bundle?.exercises.find((candidate) => candidate.id === item.exerciseId && candidate.definitionVersion === item.exerciseDefinitionVersion);
        const performed = bundle?.exercises.find((candidate) => candidate.id === outcome?.performedExerciseId && candidate.definitionVersion === outcome?.performedExerciseDefinitionVersion);
        const variant = performed?.prescriptionVariants.find((candidate) => candidate.id === outcome?.performedPrescriptionVariantId);
        let plannedPrescription: string | undefined;
        if (!legacy && bundle && exercise?.prescriptionVariants.some((candidate) => candidate.id === item.prescriptionVariantId)) {
          plannedPrescription = structureWorkoutItem(item, bundle).structureLabel;
        }
        const unknownTime = Boolean(legacy || outcome?.participationBasis === "legacy-unknown");
        return {
          id: item.id,
          plannedName: exercise?.name ?? "Exercise details unavailable",
          plannedPrescription,
          ...(!legacy && performed && variant && outcome?.status !== "skipped" ? {
            performedName: performed.name,
            performedTarget: prescriptionTargetLabel(variant.target),
          } : {}),
          performed: Boolean(outcome && (outcome.participationSeconds > 0 || (unknownTime && outcome.status !== "skipped"))),
          ...(!legacy && outcome && outcome.status !== "skipped" && (!performed || !variant) ? { performedNote: "Actual variation not recorded." } : {}),
          outcome: !outcome ? "No outcome recorded" : unknownTime && outcome.status !== "skipped" ? "Participation recorded" : ({ completed: "Completed", modified: "Changed / partly completed", skipped: "Skipped" })[outcome.status],
          activity: !outcome || unknownTime ? "Activity time not recorded" : `${historyDuration(outcome.participationSeconds)} recorded activity`,
          feedback: reviewLabels(outcome),
          change: outcome?.modificationReason
            ?.replaceAll("Timer recorded a shortened preparation or recovery dose.", "Warm-up or cool-down ended early.")
            .replaceAll("Timer recorded a shortened dose.", "This exercise ended early.")
            .replaceAll("Athlete selected an approved safe alternative.", "Used an alternative exercise.")
            .replaceAll("Only a brief partial attempt was recorded, so no progression rating was requested.", "Brief attempt recorded; no rating was needed."),
        };
      });
      return {
        id: record.id,
        title: custom ? "Custom session" : graph ? `${graph.label} session` : "Parallette25 session",
        completedAt: record.completedAt,
        participationSeconds,
        status: record.status,
        source: legacy ? "migrated" : "vnext",
        durationLabel: legacy ? legacy.sourceTotalSeconds === undefined ? "Duration not recorded" : `${historyDuration(legacy.sourceTotalSeconds)} recorded session duration` : `${historyDuration(participationSeconds)} recorded activity${missingTiming ? " · some timing unavailable" : ""}`,
        durationNote: legacy ? "Imported workout: exact exercise timing and original sets, reps and rest were not saved." : "Recorded activity excludes rest and pauses. Completed reps and sets were not counted separately.",
        ...(!legacy && plan ? { plannedDuration: `${historyDuration(plan.intendedDurationSeconds)} planned, including rest` } : {}),
        movements,
      };
    });
};
