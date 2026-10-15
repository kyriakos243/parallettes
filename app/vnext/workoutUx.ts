import {
  type AthleteIntent,
  type DefinitionBundle,
  type DefinitionVersion,
  type DerivedAthleteState,
  type ExerciseDefinition,
  type ExerciseId,
  type PlanItemId,
  type PrescriptionTarget,
  type PrescriptionVariant,
  type PrescriptionVariantId,
  type SessionPlan,
  type SessionPlanItem,
} from "./contracts";
import { vNextGeneratorPolicy } from "./planning/policy";
import { highDemandDomains } from "./planning/utils";
import { evaluateTrainability, type ProjectionPolicy } from "./projection";

export type WorkoutSwapDirection = "easier" | "similar" | "harder";

export type WorkoutExerciseSelection = Readonly<{
  exerciseId: ExerciseId;
  exerciseDefinitionVersion: DefinitionVersion;
  prescriptionVariantId: PrescriptionVariantId;
}>;

export type WorkoutSetInterval = Readonly<{
  id: string;
  planItemId: PlanItemId;
  kind: "work" | "rest";
  durationSeconds: number;
  set: number;
  sets: number;
}>;

export type StructuredWorkoutItem = Readonly<{
  planItemId: PlanItemId;
  exercise: ExerciseDefinition;
  variant: PrescriptionVariant;
  targetLabel: string;
  structureLabel: string;
  plannedRestSeconds: number;
  intervals: readonly WorkoutSetInterval[];
}>;

export type SafeWorkoutSwap = WorkoutExerciseSelection & Readonly<{
  direction: WorkoutSwapDirection;
  exerciseName: string;
  variantLabel: string;
  reason: string;
  mediaReference: string;
  targetLabel: string;
  structureLabel: string;
  plannedRestSeconds: number;
}>;

const rangeLabel = (minimum: number, maximum: number | undefined): string =>
  maximum !== undefined && maximum !== minimum ? `${minimum}–${maximum}` : `${minimum}`;

export const prescriptionTargetLabel = (target: PrescriptionTarget): string => {
  if (target.kind === "duration-seconds") return `${rangeLabel(target.minimum, target.maximum)} sec hold each set`;
  if (target.kind === "repetitions") return `${rangeLabel(target.minimum, target.maximum)} reps each set`;
  if (target.kind === "attempts") return `${rangeLabel(target.minimum, target.maximum)} controlled attempts each set`;
  if (target.kind === "interval") {
    return `${target.rounds} rounds of ${target.workSeconds}s work / ${target.restSeconds}s rest`;
  }
  return target.description;
};

const intervalTiming = (
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
    return highDemandDomains(variant.demand).length > 0 ? { work: 30, rest: 90 } : { work: 30, rest: 30 };
  }
  if (exercise.roles.includes("technique-safety")) return { work: 30, rest: 30 };
  return { work: 40, rest: 80 };
};

const resolveWorkoutMovement = (
  bundle: DefinitionBundle,
  item: SessionPlanItem,
  selection?: WorkoutExerciseSelection,
): Readonly<{ exercise: ExerciseDefinition; variant: PrescriptionVariant }> => {
  const identity = selection ?? {
    exerciseId: item.exerciseId,
    exerciseDefinitionVersion: item.exerciseDefinitionVersion,
    prescriptionVariantId: item.prescriptionVariantId,
  };
  const exercise = bundle.exercises.find((candidate) => candidate.id === identity.exerciseId
    && candidate.definitionVersion === identity.exerciseDefinitionVersion);
  const variant = exercise?.prescriptionVariants.find((candidate) =>
    candidate.id === identity.prescriptionVariantId);
  if (!exercise || !variant) throw new TypeError(`Workout movement cannot resolve ${identity.exerciseId}`);
  return { exercise, variant };
};

/**
 * Turns a planner block budget into the actual set/rest sequence shown by the
 * athlete timer. The Session Plan remains authoritative; this is a lossless
 * execution/presentation view whose intervals total exactly plannedSeconds.
 */
export const structureWorkoutItem = (
  item: SessionPlanItem,
  bundle: DefinitionBundle,
  selection?: WorkoutExerciseSelection,
): StructuredWorkoutItem => {
  const { exercise, variant } = resolveWorkoutMovement(bundle, item, selection);
  const timing = intervalTiming(item, variant.target, exercise, variant);
  const cycle = Math.max(1, timing.work + timing.rest);
  const fullCycles = Math.floor(item.plannedSeconds / cycle);
  const remainder = item.plannedSeconds - fullCycles * cycle;
  const setCount = fullCycles + (remainder > 0 ? 1 : 0);
  const intervals: WorkoutSetInterval[] = [];
  let restSeconds = 0;
  for (let index = 0; index < setCount; index += 1) {
    const available = index < fullCycles ? cycle : remainder;
    const work = Math.min(timing.work, available);
    const rest = Math.max(0, available - work);
    if (work > 0) intervals.push({
      id: `${item.id}:set-${index + 1}:work`,
      planItemId: item.id,
      kind: "work",
      durationSeconds: work,
      set: index + 1,
      sets: setCount,
    });
    if (rest > 0) {
      intervals.push({
        id: `${item.id}:set-${index + 1}:rest`,
        planItemId: item.id,
        kind: "rest",
        durationSeconds: rest,
        set: index + 1,
        sets: setCount,
      });
      restSeconds += rest;
    }
  }
  const targetLabel = prescriptionTargetLabel(variant.target);
  const structureLabel = restSeconds > 0
    ? `${setCount} set${setCount === 1 ? "" : "s"} • ${targetLabel} • ${timing.rest}s planned rest`
    : `${setCount} set${setCount === 1 ? "" : "s"} • ${targetLabel}`;
  return {
    planItemId: item.id,
    exercise,
    variant,
    targetLabel,
    structureLabel,
    plannedRestSeconds: restSeconds,
    intervals,
  };
};

export const structureWorkoutPlan = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
  selections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>> = {},
): readonly StructuredWorkoutItem[] => plan.items.map((item) =>
  structureWorkoutItem(item, bundle, selections[item.id]));

const identityKey = (selection: WorkoutExerciseSelection): string =>
  `${selection.exerciseId}@${selection.exerciseDefinitionVersion}:${selection.prescriptionVariantId}`;

const selectionFor = (
  exercise: ExerciseDefinition,
  variant: PrescriptionVariant,
): WorkoutExerciseSelection => ({
  exerciseId: exercise.id,
  exerciseDefinitionVersion: exercise.definitionVersion,
  prescriptionVariantId: variant.id,
});

const isRegressionVariant = (variant: PrescriptionVariant): boolean =>
  variant.id.endsWith("-regressed") || /^Regressed|^Technique — reduced dose/iu.test(variant.label);

const directionReason = (direction: WorkoutSwapDirection): string => direction === "easier"
  ? "Uses an authored regression or reduced-dose variation for the same block purpose."
  : direction === "harder"
    ? "Uses the authored adjacent progression only because it is already trainable today."
    : "Uses an authored equivalent substitution for the same block purpose.";

/**
 * Only authored regression/assistance/substitution relationships are exposed.
 * Every option is re-evaluated against current equipment, restrictions,
 * prerequisites, specialist gates, recent load and whole-session high load.
 */
export const safeWorkoutSwaps = (input: Readonly<{
  plan: SessionPlan;
  item: SessionPlanItem;
  bundle: DefinitionBundle;
  state: DerivedAthleteState;
  intent: AthleteIntent;
  projectionPolicy: ProjectionPolicy;
}>): readonly SafeWorkoutSwap[] => {
  if (input.item.purpose === "guided-test" || input.item.benchmarkProtocolId) return [];
  const current = resolveWorkoutMovement(input.bundle, input.item);
  const candidates = new Map<string, Readonly<{ selection: WorkoutExerciseSelection; direction: WorkoutSwapDirection }>>();
  const add = (exercise: ExerciseDefinition | undefined, variant: PrescriptionVariant | undefined, direction: WorkoutSwapDirection) => {
    if (!exercise || !variant) return;
    const selection = selectionFor(exercise, variant);
    if (identityKey(selection) === identityKey(selectionFor(current.exercise, current.variant))) return;
    const key = identityKey(selection);
    const existing = candidates.get(key);
    if (!existing || (existing.direction === "similar" && direction !== "similar")) {
      candidates.set(key, { selection, direction });
    }
  };
  for (const variant of current.exercise.prescriptionVariants) {
    if (variant.id === current.variant.id) continue;
    add(current.exercise, variant, isRegressionVariant(variant) ? "easier" : "harder");
  }
  for (const relation of current.exercise.relations) {
    if (relation.fromPrescriptionVariantId && relation.fromPrescriptionVariantId !== current.variant.id) continue;
    const exercise = input.bundle.exercises.find((candidate) => candidate.id === relation.targetExerciseId);
    const variant = relation.targetPrescriptionVariantId
      ? exercise?.prescriptionVariants.find((candidate) => candidate.id === relation.targetPrescriptionVariantId)
      : exercise?.prescriptionVariants[0];
    add(exercise, variant, relation.kind === "substitution" ? "similar" : "easier");
  }
  for (const exercise of input.bundle.exercises) {
    for (const relation of exercise.relations) {
      if (relation.targetExerciseId !== current.exercise.id) continue;
      if (relation.targetPrescriptionVariantId && relation.targetPrescriptionVariantId !== current.variant.id) continue;
      const variant = relation.fromPrescriptionVariantId
        ? exercise.prescriptionVariants.find((candidate) => candidate.id === relation.fromPrescriptionVariantId)
        : exercise.prescriptionVariants[0];
      add(exercise, variant, relation.kind === "substitution" ? "similar" : "harder");
    }
  }

  const otherHighLoad = input.plan.items.some((item) => {
    if (item.id === input.item.id) return false;
    const movement = resolveWorkoutMovement(input.bundle, item);
    const high = highDemandDomains(movement.variant.demand);
    return vNextGeneratorPolicy.highUpperLimbDomains.some((domain) => high.includes(domain));
  });
  return [...candidates.values()].flatMap(({ selection, direction }) => {
    const exercise = input.bundle.exercises.find((candidate) => candidate.id === selection.exerciseId
      && candidate.definitionVersion === selection.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) =>
      candidate.id === selection.prescriptionVariantId);
    const media = exercise?.media[0];
    if (!exercise || !variant || media?.kind !== "motion" || !media.reference) return [];
    const evaluation = evaluateTrainability({
      request: selection,
      state: input.state,
      bundle: input.bundle,
      asOf: input.state.asOf,
      policy: input.projectionPolicy,
      intent: input.intent,
    });
    if (evaluation.decision === "block") return [];
    if (otherHighLoad && highDemandDomains(variant.demand).length > 0) return [];
    const structured = structureWorkoutItem(input.item, input.bundle, selection);
    return [{
      ...selection,
      direction,
      exerciseName: exercise.name,
      variantLabel: variant.label,
      reason: evaluation.decision === "modify"
        ? `${directionReason(direction)} Its dose remains modified for today's current state.`
        : directionReason(direction),
      mediaReference: media.reference,
      targetLabel: structured.targetLabel,
      structureLabel: structured.structureLabel,
      plannedRestSeconds: structured.plannedRestSeconds,
    }];
  }).sort((left, right) => {
    const order: Readonly<Record<WorkoutSwapDirection, number>> = { easier: 0, similar: 1, harder: 2 };
    return order[left.direction] - order[right.direction]
      || left.exerciseName.localeCompare(right.exerciseName)
      || left.prescriptionVariantId.localeCompare(right.prescriptionVariantId);
  });
};

export const workoutSwapUnavailableReason = (
  item: SessionPlanItem,
  options: readonly SafeWorkoutSwap[],
): string | undefined => options.length > 0 ? undefined
  : item.purpose === "guided-test" || item.benchmarkProtocolId
    ? "This guided confirmation must use its exact approved movement and test conditions."
    : "No authored alternative satisfies this block's purpose and today's prerequisites, restrictions, equipment and load limits.";
