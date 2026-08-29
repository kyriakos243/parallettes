import type { SessionItemOutcome, SessionPlanItem } from "../contracts";
import { workoutReviewPrompts } from "../assessment/evidence";
import type {
  WorkoutCompletionAnswer,
  WorkoutCompletionInput,
  WorkoutCompletionMapping,
  WorkoutCompletionPresentation,
} from "./contracts";

const purposeLabel = (purpose: SessionPlanItem["purpose"]): string => purpose === "primary-development"
  ? "Primary development"
  : purpose === "secondary-development"
    ? "Secondary development"
    : purpose === "guided-test"
      ? "Guided test"
      : purpose === "maintenance"
        ? "Maintenance"
        : purpose === "preparation"
          ? "Preparation"
          : "Reset";

const statusOptions = [
  { value: "completed", label: "Completed as planned" },
  { value: "modified", label: "Completed with a change" },
  { value: "skipped", label: "Did not complete" },
] as const;

const difficultyOptions = [
  { value: "easy", label: "Easier than expected" },
  { value: "right", label: "About right" },
  { value: "hard", label: "Harder than expected" },
] as const;

export const buildWorkoutCompletionPresentation = (
  input: WorkoutCompletionInput,
): WorkoutCompletionPresentation => {
  const plan = input.generated.plan;
  if (!plan) return {
    title: "How did today's workout go?",
    intro: "There is no completed vNext plan to review.",
    prompts: [],
    authorityNotice: "Only an immutable Session Record can become the authority for what happened in a workout.",
    createsSessionRecord: false,
  };
  const prompts = workoutReviewPrompts(plan).map((prompt) => {
    const item = plan.items.find((candidate) => candidate.id === prompt.planItemId)!;
    const exercise = input.bundle.exercises.find((candidate) => candidate.id === prompt.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    return {
      planItemId: prompt.planItemId,
      exerciseId: prompt.exerciseId,
      exerciseName: exercise?.name ?? "Planned movement",
      purposeLabel: purposeLabel(prompt.purpose),
      statusPrompt: `How did ${exercise?.name ?? "this movement"} go?`,
      statusOptions,
      asksModificationReason: true as const,
      modificationPrompt: "What did you change?",
      asksDifficulty: prompt.asksDifficulty,
      difficultyOptions: prompt.asksDifficulty ? difficultyOptions : [],
      asksPainOrInstability: true as const,
      painPrompt: "Did this cause pain, symptoms or unexpected instability?",
      painFollowUp: "If yes, the next step asks where you felt it so future training can be adjusted.",
    };
  });
  return {
    title: "How did today's workout go?",
    intro: "A quick review helps adjust future work without asking you to claim a skill.",
    prompts,
    authorityNotice: "These answers become item outcomes only when the coherent vNext path creates one immutable Session Record. They never create a second workout fact or directly award an achievement.",
    createsSessionRecord: false,
  };
};

const outcomeForAnswer = (
  item: SessionPlanItem,
  answer: WorkoutCompletionAnswer,
): SessionItemOutcome => {
  if (!Number.isFinite(answer.participationSeconds)
    || answer.participationSeconds < 0) {
    throw new TypeError(`Invalid participation for ${answer.planItemId}`);
  }
  if (answer.status === "skipped") {
    if (answer.participationSeconds !== 0
      || answer.difficulty !== undefined
      || answer.symptomOrInstability !== undefined
      || answer.performed !== undefined) {
      throw new TypeError("Skipped work cannot carry participation or a performance review");
    }
    return { planItemId: item.id, status: "skipped", participationSeconds: 0 };
  }
  if (answer.participationSeconds <= 0) {
    throw new TypeError("Completed or modified work requires positive participation");
  }
  if (answer.status === "completed" && answer.performed !== undefined
    && (answer.performed.exerciseId !== item.exerciseId
      || answer.performed.exerciseDefinitionVersion !== item.exerciseDefinitionVersion
      || answer.performed.prescriptionVariantId !== item.prescriptionVariantId)) {
    throw new TypeError("Completed-as-planned feedback cannot change exercise identity");
  }
  if (item.purpose === "guided-test" && answer.difficulty !== undefined) {
    throw new TypeError("Guided-test review uses its exact test result rather than a difficulty rating");
  }
  const performed = answer.performed ?? {
    exerciseId: item.exerciseId,
    exerciseDefinitionVersion: item.exerciseDefinitionVersion,
    prescriptionVariantId: item.prescriptionVariantId,
  };
  return {
    planItemId: item.id,
    status: answer.status,
    participationSeconds: answer.participationSeconds,
    participationBasis: "measured",
    performedExerciseId: performed.exerciseId,
    performedExerciseDefinitionVersion: performed.exerciseDefinitionVersion,
    performedPrescriptionVariantId: performed.prescriptionVariantId,
    ...(answer.status === "modified" ? {
      modificationReason: answer.modificationReason?.trim() || "Athlete completed a modified variation or dose.",
    } : {}),
    review: {
      outcome: answer.status === "completed" ? "clean" : "partial",
      ...(answer.difficulty ? { difficulty: answer.difficulty } : {}),
      ...(answer.symptomOrInstability ? { symptomOrInstability: true } : {}),
    },
  };
};

/**
 * Converts only the explicitly supplied completion answers into per-item facts.
 * It does not construct or persist a Session Record; the coherent completion
 * path must combine them with timer facts and create exactly one record.
 */
export const mapWorkoutCompletionAnswers = (input: Readonly<{
  generated: WorkoutCompletionInput["generated"];
  answers: readonly WorkoutCompletionAnswer[];
}>): WorkoutCompletionMapping => {
  const plan = input.generated.plan;
  if (!plan) throw new TypeError("Workout completion requires a generated vNext Session Plan");
  const byId = new Map(plan.items.map((item) => [item.id, item]));
  if (new Set(input.answers.map((answer) => answer.planItemId)).size !== input.answers.length) {
    throw new TypeError("Workout completion contains duplicate plan-item answers");
  }
  const itemOutcomes = input.answers.map((answer) => {
    const item = byId.get(answer.planItemId);
    if (!item) throw new TypeError(`Workout completion references unknown item ${answer.planItemId}`);
    if (item.purpose === "preparation" || item.purpose === "recovery") {
      throw new TypeError("Preparation and recovery facts come from the timer, not progression review prompts");
    }
    return outcomeForAnswer(item, answer);
  });
  return {
    itemOutcomes,
    restrictionFollowUp: input.answers.some((answer) => answer.symptomOrInstability === true),
    authorityNotice: "This is a partial item-outcome mapping, not a Session Record. Create one immutable Session Record only after combining it with timer-derived preparation and recovery facts.",
  };
};
