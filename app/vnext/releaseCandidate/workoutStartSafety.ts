import type {
  AthleteIntent,
  DefinitionBundle,
  DerivedAthleteState,
  PlanItemId,
  SessionPlanItem,
} from "../contracts";
import type { GeneratedSession } from "../planning/contracts";
import { vNextGeneratorPolicy } from "../planning/policy";
import { highDemandDomains } from "../planning/utils";
import { evaluateTrainability, projectionReasonCodes, type ProjectionPolicy } from "../projection";
import type { SafeWorkoutSwap, WorkoutExerciseSelection } from "../workoutUx";
import { safePracticeWorkoutSwaps as safeWorkoutSwaps, hasPracticeDosePolicy, isWallLinePractice, WALL_LINE_PRACTICE_SECONDS } from "../practiceDose";

export type WorkoutStartSafetyIssue = Readonly<{
  planItemId?: PlanItemId;
  message: string;
}>;

type Input = Readonly<{
  generated: GeneratedSession;
  /** Resolve saved prescriptions through their original catalogue, never a newer replacement. */
  bundle: DefinitionBundle;
  state: DerivedAthleteState;
  intent: AthleteIntent;
  projectionPolicy: ProjectionPolicy;
  selections?: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>;
  /** An active runner supplies its remaining items; a new start checks all items. */
  planItemIds?: readonly PlanItemId[];
}>;

const identityKey = (identity: WorkoutExerciseSelection): string =>
  `${identity.exerciseId}@${identity.exerciseDefinitionVersion}:${identity.prescriptionVariantId}`;

/**
 * Authorise an exact saved workout against freshly rebuilt athlete state.
 * This never edits its plan, selections or measured facts. An unsafe preview
 * needs a new plan; an unsafe active workout can still be ended and reviewed.
 */
export const validateWorkoutStart = (input: Input): Readonly<{
  allowed: boolean;
  issues: readonly WorkoutStartSafetyIssue[];
  swapOptions: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
}> => {
  const issues: WorkoutStartSafetyIssue[] = [];
  const plan = input.generated.plan;
  const fail = (message: string, planItemId?: PlanItemId): void => { issues.push({ message, ...(planItemId ? { planItemId } : {}) }); };
  if (!plan || plan.catalogueVersion !== input.bundle.catalogueVersion
    || plan.athleteId !== input.state.athleteId || plan.athleteId !== input.intent.athleteId) {
    fail("This saved workout could not be checked safely. Return to Today for a new workout.");
    return { allowed: false, issues, swapOptions: {} };
  }
  const selections = input.selections ?? {};
  const ids = new Set(plan.items.map((item) => item.id));
  const checkedIds = new Set(input.planItemIds ?? ids);
  if ([...checkedIds].some((id) => !ids.has(id))) fail("The saved workout position could not be checked safely.");
  if (Object.keys(selections).some((id) => !ids.has(id as PlanItemId))) {
    fail("A saved exercise change does not belong to this workout.");
  }
  const resolve = (selection: WorkoutExerciseSelection) => {
    const exercise = input.bundle.exercises.find((candidate) => candidate.id === selection.exerciseId
      && candidate.definitionVersion === selection.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === selection.prescriptionVariantId);
    return exercise && variant ? { exercise, variant } : undefined;
  };
  const effectiveItems = plan.items.map((item): SessionPlanItem => {
    const selection = selections[item.id];
    const resolved = resolve(selection ?? item);
    return resolved ? { ...item, ...selection, demand: resolved.variant.demand } : item;
  });
  const effectivePlan = { ...plan, items: effectiveItems };
  const originalEvaluations = new Map((input.generated.trainabilityUsed ?? []).map((entry) => [identityKey(entry), entry]));
  const problemFor = (item: SessionPlanItem, selection: WorkoutExerciseSelection): string | undefined => {
    if (hasPracticeDosePolicy(plan) && isWallLinePractice({ ...item, exerciseId: selection.exerciseId })
      && item.plannedSeconds > WALL_LINE_PRACTICE_SECONDS) {
      return "This wall-line practice exceeds its current set limit. Return to Today for a new workout.";
    }
    const movement = resolve(selection);
    if (!movement) return "A saved movement is unavailable in its original workout version.";
    const { exercise, variant } = movement;
    const evaluation = evaluateTrainability({
      request: selection,
      state: input.state,
      bundle: input.bundle,
      asOf: input.state.asOf,
      policy: input.projectionPolicy,
      intent: input.intent,
    });
    if (evaluation.decision === "block") {
      if (evaluation.reasonCodes.includes(projectionReasonCodes.missingEquipment)) {
        return `${exercise.name} needs equipment that is no longer selected.`;
      }
      return `${exercise.name} is not available with your current readiness and restrictions.`;
    }
    if (evaluation.decision === "modify") {
      const high = highDemandDomains(variant.demand).length > 0;
      const newModification = identityKey(item) !== identityKey(selection)
        || originalEvaluations.get(identityKey(item))?.decision !== "modify"
        || evaluation.reasonCodes.some((reason) => !originalEvaluations.get(identityKey(item))?.reasonCodes.includes(reason));
      // Preserve the composer's conservative load/restriction rules even when
      // an older plan already happened to carry the same broad reason code.
      const unsafeDose = high && (evaluation.reasonCodes.includes(projectionReasonCodes.recentHighLoad)
        || evaluation.reasonCodes.includes(projectionReasonCodes.postClearance))
        || evaluation.reasonCodes.includes(projectionReasonCodes.activeRestriction)
          && !variant.id.endsWith("-regressed") && item.purpose !== "preparation" && item.purpose !== "recovery";
      if (newModification || unsafeDose) {
        return `${exercise.name} now needs a different dose or variation. Choose a fresh workout before continuing.`;
      }
    }
    if (item.targetMilestone && identityKey(item) === identityKey(selection)) {
      const target = item.targetMilestone;
      const sameTarget = (entry: { milestone: typeof target }) => entry.milestone.graphId === target.graphId
        && entry.milestone.nodeId === target.nodeId;
      const available = [...input.state.workingNodes, ...input.state.eligibleTargets, ...input.state.maintenanceNeeds]
        .some(sameTarget) || input.state.nodeStates.some((entry) => sameTarget(entry)
          && entry.lifecycle === "established" && entry.confidence === "current");
      if (!available) return `${exercise.name} is no longer a current training target. Choose a fresh workout.`;
    }
    return undefined;
  };
  const swapOptions: Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>> = {};
  for (const item of plan.items) {
    if (!checkedIds.has(item.id)) continue;
    const selected = selections[item.id] ?? item;
    const problem = problemFor(item, selected);
    if (problem) fail(problem, item.id);
    try {
      swapOptions[item.id] = safeWorkoutSwaps({ ...input, plan: effectivePlan, item })
        .filter((option) => !problemFor(item, option));
    } catch {
      fail("A saved movement could not be checked in its original workout version.", item.id);
      swapOptions[item.id] = [];
    }
    if (selections[item.id] && identityKey(selected) !== identityKey(item)
      && !swapOptions[item.id]?.some((option) => identityKey(option) === identityKey(selected))) {
      fail("A chosen exercise change is no longer a safe option for this workout.", item.id);
    }
  }
  if (effectiveItems.filter((item) => vNextGeneratorPolicy.highUpperLimbDomains
    .some((domain) => item.demand[domain] === "high")).length > 1) {
    fail("These exercise choices combine too much demanding upper-body work. Choose a fresh workout.");
  }
  return { allowed: issues.length === 0, issues, swapOptions };
};
