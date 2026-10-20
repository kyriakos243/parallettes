import type {
  ExerciseDefinition,
  PrescriptionTarget,
  PrescriptionVariant,
  SessionPlanItem,
} from "./contracts";

/**
 * Projection-only mirror of the frozen workoutUx interval contract. Keeping the
 * accepted player source intact also avoids a projector -> player -> projector
 * import cycle. The difficulty regression compares every native first interval.
 */
export const workoutIntervalTiming = (
  item: SessionPlanItem,
  target: PrescriptionTarget,
  exercise: ExerciseDefinition,
  variant: PrescriptionVariant,
): Readonly<{ work: number; rest: number; authoredRounds?: number }> => {
  if (target.kind === "interval") return {
    work: target.workSeconds,
    rest: target.restSeconds,
    authoredRounds: target.rounds,
  };
  if (item.purpose === "preparation") return { work: 45, rest: 15 };
  if (item.purpose === "recovery") return { work: item.plannedSeconds, rest: 0 };
  if (target.kind === "duration-seconds") {
    const work = Math.max(1, Math.min(30, target.maximum ?? target.minimum));
    return { work, rest: Math.max(30, 120 - work) };
  }
  if (item.purpose === "guided-test") return { work: 30, rest: 30 };
  if (target.kind === "attempts") {
    return Object.values(variant.demand).some((level) => level === "high")
      ? { work: 30, rest: 90 } : { work: 30, rest: 30 };
  }
  if (exercise.roles.includes("technique-safety")) return { work: 30, rest: 30 };
  return { work: 40, rest: 80 };
};

/** The same existing half-first-interval threshold used by workout review. */
export const meaningfulWorkoutParticipationSeconds = (
  item: SessionPlanItem,
  exercise: ExerciseDefinition,
  variant: PrescriptionVariant,
): number => Math.max(1, Math.ceil(
  Math.min(item.plannedSeconds, workoutIntervalTiming(item, variant.target, exercise, variant).work) / 2,
));
