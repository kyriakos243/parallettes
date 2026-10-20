import type { DefinitionBundle, PlanItemId, SessionPlan } from "./contracts";
import { structureWorkoutPlan, type StructuredWorkoutItem, type WorkoutSetInterval, type WorkoutExerciseSelection } from "./workoutUx";

// The policy is also the persisted execution contract. Historical policies
// always retain their original, exercise-by-exercise timeline.
export const MIXED_WORKOUT_POLICY_ID = "vnext-mixed-workout-generator";
export const MIXED_CAPACITY_POLICY_ID = "vnext-mixed-capacity-workout-generator";
export const isMixedWorkoutPlan = (plan: Pick<SessionPlan, "generatorPolicyId" | "generatorPolicyVersion">): boolean =>
  (plan.generatorPolicyVersion === 1 || plan.generatorPolicyVersion === 2 || plan.generatorPolicyVersion === 3)
  && [MIXED_WORKOUT_POLICY_ID, MIXED_CAPACITY_POLICY_ID].includes(plan.generatorPolicyId);

export type WorkoutExecutionGroup = Readonly<{
  mode: "straight" | "rounds" | "flow";
  items: readonly StructuredWorkoutItem[];
}>;

const upperDomains = ["hand-wrist-bearing", "forward-straight-arm-upper-limb", "overhead-straight-arm-upper-limb", "horizontal-bent-arm-push", "vertical-bent-arm-push"] as const;
const accessory = (item: StructuredWorkoutItem): boolean => item.exercise.roles.includes("capacity-accessory")
  && !item.exercise.roles.includes("technique-safety")
  && !item.exercise.roles.includes("outcome-milestone")
  && item.variant.demand["inversion-technical"] === "low"
  && upperDomains.every((domain) => item.variant.demand[domain] !== "high");

const compatible = (left: StructuredWorkoutItem, right: StructuredWorkoutItem): boolean =>
  accessory(left) && accessory(right)
  && upperDomains.every((domain) => left.variant.demand[domain] === "low" || right.variant.demand[domain] === "low");

/** Derive only from immutable native plan fields, definitions and safe selections. */
export const workoutExecutionGroups = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
  selections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>> = {},
): readonly WorkoutExecutionGroup[] => {
  const items = structureWorkoutPlan(plan, bundle, selections);
  if (!isMixedWorkoutPlan(plan)) return items.map((item) => ({ mode: "straight", items: [item] }));
  const planned = structureWorkoutPlan(plan, bundle);
  const groups: WorkoutExecutionGroup[] = [];
  // Protect the first non-technical development item even when it is an
  // accessory used as today's primary strength requirement.
  const primary = plan.items.findIndex((item, index) => item.purpose !== "preparation"
    && item.purpose !== "recovery"
    && !planned[index]!.exercise.roles.includes("technique-safety")
    && planned[index]!.variant.demand["inversion-technical"] === "low");
  for (let index = 0; index < items.length;) {
    const item = plan.items[index]!;
    const structured = items[index]!;
    if (item.purpose === "preparation" || item.purpose === "recovery") {
      const chunk: StructuredWorkoutItem[] = [structured];
      while (plan.items[index + chunk.length]?.purpose === item.purpose) chunk.push(items[index + chunk.length]!);
      const lowLoad = chunk.every((entry) => Object.values(entry.variant.demand).every((demand) => demand !== "high"));
      if (chunk.length > 1 && lowLoad) groups.push({ mode: item.purpose === "recovery" ? "flow" : "rounds", items: chunk });
      else groups.push(...chunk.map((entry): WorkoutExecutionGroup => ({ mode: "straight", items: [entry] })));
      index += chunk.length;
      continue;
    }
    const next = items[index + 1];
    const nextItem = plan.items[index + 1];
    const eligiblePurpose = (purpose: string) => purpose === "primary-development" || purpose === "secondary-development";
    const primaryProtected = index === primary && plan.generatorPolicyId !== MIXED_CAPACITY_POLICY_ID;
    if (!primaryProtected && next && nextItem && eligiblePurpose(item.purpose) && eligiblePurpose(nextItem.purpose)
      && !item.benchmarkProtocolId && !nextItem.benchmarkProtocolId && compatible(planned[index]!, planned[index + 1]!)) {
      // Group boundaries are frozen by the native plan. A changed future
      // movement can disable rotation, never merge into an already-started group.
      groups.push({ mode: compatible(structured, next) ? "rounds" : "straight", items: [structured, next] });
      index += 2;
    } else {
      groups.push({ mode: "straight", items: [structured] });
      index += 1;
    }
  }
  return groups;
};

const cycles = (item: StructuredWorkoutItem): readonly (readonly WorkoutSetInterval[])[] => {
  const sets = [...new Set(item.intervals.map((interval) => interval.set))];
  return sets.map((set) => item.intervals.filter((interval) => interval.set === set));
};

export const workoutExecutionTimeline = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
  selections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>> = {},
): readonly WorkoutSetInterval[] => workoutExecutionGroups(plan, bundle, selections).flatMap((group) => {
  if (group.mode !== "rounds") return group.items.flatMap((item) => item.intervals);
  const sets = group.items.map(cycles);
  return Array.from({ length: Math.max(...sets.map((item) => item.length)) }, (_, round) =>
    sets.flatMap((item) => item[round] ?? [])).flat();
});

export const workoutGroupHasStarted = (
  planItemId: PlanItemId,
  intervalIndex: number,
  groups: readonly WorkoutExecutionGroup[],
  timeline: readonly WorkoutSetInterval[],
): boolean => {
  const group = groups.find((entry) => entry.items.some((item) => item.planItemId === planItemId));
  const ids = new Set(group?.items.map((item) => item.planItemId));
  return timeline.some((interval, index) => index <= intervalIndex && ids.has(interval.planItemId));
};

export const hasFinishedWorkoutItem = (
  planItemId: PlanItemId,
  intervalIndex: number,
  timeline: readonly WorkoutSetInterval[],
  participationSeconds: number,
): boolean => !timeline.slice(intervalIndex + 1).some((interval) => interval.planItemId === planItemId)
  && participationSeconds >= timeline.filter((interval) => interval.planItemId === planItemId && interval.kind === "work")
    .reduce((sum, interval) => sum + interval.durationSeconds, 0);
