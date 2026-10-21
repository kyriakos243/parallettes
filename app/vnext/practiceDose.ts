import type { DefinitionBundle, PlanItemId, SessionPlan, SessionPlanItem } from "./contracts";
import { safeWorkoutSwaps, structureWorkoutItem, type StructuredWorkoutItem, type WorkoutExerciseSelection } from "./workoutUx";

/** Generators 5–6 own these practice targets. Native definitions/checks stay intact. */
export const hasPracticeDosePolicy = (plan: Pick<SessionPlan, "generatorPolicyId" | "generatorPolicyVersion">): boolean =>
  (plan.generatorPolicyVersion === 5 || plan.generatorPolicyVersion === 6)
  && ["vnext-mixed-workout-generator", "vnext-mixed-capacity-workout-generator"].includes(plan.generatorPolicyId);

export const WALL_LINE_PRACTICE_SECONDS = 180;
export const isWallLinePractice = (item: Pick<SessionPlanItem, "exerciseId" | "purpose" | "benchmarkProtocolId">): boolean =>
  item.exerciseId === "wall-shoulder-flexion-line-drill" && item.purpose !== "guided-test" && !item.benchmarkProtocolId;

/** Generator 6 adds the routine Pike ceiling; benchmarks are always exact. */
export const hasUsefulDosePolicy = (plan: Pick<SessionPlan, "generatorPolicyId" | "generatorPolicyVersion">): boolean =>
  plan.generatorPolicyVersion === 6 && hasPracticeDosePolicy(plan);

export const routinePracticeLimitSeconds = (item: Pick<SessionPlanItem, "exerciseId" | "purpose" | "benchmarkProtocolId">): number | undefined => {
  if (item.purpose === "guided-test" || item.benchmarkProtocolId) return undefined;
  return item.exerciseId === "pike-elevation" || isWallLinePractice(item) ? 180 : undefined;
};

/** Aggregate across swaps too: two blocks cannot silently double the drill. */
export const usefulDoseExceeded = (plan: SessionPlan, item: SessionPlanItem, selection?: WorkoutExerciseSelection): boolean => {
  if (!hasUsefulDosePolicy(plan)) return false;
  const effective = selection ? { ...item, exerciseId: selection.exerciseId,
    exerciseDefinitionVersion: selection.exerciseDefinitionVersion, prescriptionVariantId: selection.prescriptionVariantId } : item;
  const limit = routinePracticeLimitSeconds(effective);
  // Native Today blocks never exceed eight minutes. This also rejects a
  // corrupted oversized Custom block without changing historical readers.
  const development = effective.purpose !== "preparation" && effective.purpose !== "recovery"
    && effective.purpose !== "guided-test" && !effective.benchmarkProtocolId;
  const maximum = limit ?? (development ? 480 : Infinity);
  const total = plan.items.filter((entry) => entry.id !== item.id && entry.exerciseId === effective.exerciseId
    && entry.purpose !== "guided-test" && !entry.benchmarkProtocolId).reduce((sum, entry) => sum + entry.plannedSeconds, effective.plannedSeconds);
  return total > maximum;
};

export const structurePracticeWorkoutItem = (
  plan: Pick<SessionPlan, "generatorPolicyId" | "generatorPolicyVersion">,
  item: SessionPlanItem,
  bundle: DefinitionBundle,
  selection?: WorkoutExerciseSelection,
): StructuredWorkoutItem => {
  const native = structureWorkoutItem(item, bundle, selection);
  if (!hasPracticeDosePolicy(plan) || item.purpose === "guided-test" || item.benchmarkProtocolId
    || !["grounded-side-exit-rehearsal", "floor-side-exit-practice", "wall-handstand-side-exit"].includes(native.exercise.id)) return native;
  const targetLabel = "1–2 controlled exits per side each set; stop when done";
  const variant = native.variant.id.endsWith("-standard")
    ? { ...native.variant, label: "1–2 controlled exits per side" } : native.variant;
  return { ...native, variant, targetLabel, structureLabel: native.structureLabel.replace(native.targetLabel, targetLabel) };
};

export const structurePracticeWorkoutPlan = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
  selections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>> = {},
): readonly StructuredWorkoutItem[] => plan.items.map((item) => structurePracticeWorkoutItem(plan, item, bundle, selections[item.id]));

/** Keep native safety authority; never offer the capped drill in a longer block. */
export const safePracticeWorkoutSwaps = (input: Parameters<typeof safeWorkoutSwaps>[0]): ReturnType<typeof safeWorkoutSwaps> =>
  safeWorkoutSwaps(input).filter((option) => !usefulDoseExceeded(input.plan, input.item, option)).filter((option) => !hasPracticeDosePolicy(input.plan)
    || !isWallLinePractice({ ...input.item, exerciseId: option.exerciseId })
    || input.item.plannedSeconds <= WALL_LINE_PRACTICE_SECONDS).map((option) => {
    const structured = structurePracticeWorkoutItem(input.plan, input.item, input.bundle, option);
    return { ...option, variantLabel: structured.variant.label, targetLabel: structured.targetLabel, structureLabel: structured.structureLabel };
  });
