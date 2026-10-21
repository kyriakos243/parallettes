import type { DefinitionBundle, PlanItemId, SessionPlan, SessionPlanItem } from "./contracts";
import { safeWorkoutSwaps, structureWorkoutItem, type StructuredWorkoutItem, type WorkoutExerciseSelection } from "./workoutUx";

/** Generator 5 owns these practice targets. Native definitions/checks stay intact. */
export const hasPracticeDosePolicy = (plan: Pick<SessionPlan, "generatorPolicyId" | "generatorPolicyVersion">): boolean =>
  plan.generatorPolicyVersion === 5
  && ["vnext-mixed-workout-generator", "vnext-mixed-capacity-workout-generator"].includes(plan.generatorPolicyId);

export const WALL_LINE_PRACTICE_SECONDS = 180;
export const isWallLinePractice = (item: Pick<SessionPlanItem, "exerciseId" | "purpose" | "benchmarkProtocolId">): boolean =>
  item.exerciseId === "wall-shoulder-flexion-line-drill" && item.purpose !== "guided-test" && !item.benchmarkProtocolId;

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
  safeWorkoutSwaps(input).filter((option) => !hasPracticeDosePolicy(input.plan)
    || !isWallLinePractice({ ...input.item, exerciseId: option.exerciseId })
    || input.item.plannedSeconds <= WALL_LINE_PRACTICE_SECONDS).map((option) => {
    const structured = structurePracticeWorkoutItem(input.plan, input.item, input.bundle, option);
    return { ...option, variantLabel: structured.variant.label, targetLabel: structured.targetLabel, structureLabel: structured.structureLabel };
  });
