import type { DefinitionBundle } from "../contracts";
import type { AssessmentAnswerValue, AssessmentDraft, AssessmentStep } from "./contracts";
import { answerAssessmentStep, goBackAssessment, nextAssessmentStep, selectedAssessmentGoals } from "./flow";

const contextKinds = new Set(["safety", "experience", "inactivity", "goals", "equipment", "inversion"]);

export const isQuickSetupContext = (draft: AssessmentDraft, step: AssessmentStep): boolean =>
  draft.policyVersion === 2 && draft.mode === "new-placement" && contextKinds.has(step.kind);

/** Validate all native answers before the runtime saves context and positive safety reports. */
export const reviseQuickSetupContext = (draft: AssessmentDraft, answers: readonly AssessmentAnswerValue[],
  updatedAt: string, bundle: DefinitionBundle): AssessmentDraft => {
  if (draft.policyVersion !== 2 || draft.mode !== "new-placement" || draft.status !== "in-progress") {
    throw new TypeError("Quick context requires an unfinished modern setup");
  }
  if (!answers.length || answers.some((answer) => !contextKinds.has(answer.kind))) {
    throw new TypeError("Quick context accepts only the complete context answers");
  }
  let next = draft;
  // Native Back/reanswer semantics preserve unchanged downstream hints, and
  // invalidate them as soon as an earlier choice changes.
  while (next.answers.length) next = goBackAssessment(next, updatedAt, bundle);
  for (const answer of answers) next = answerAssessmentStep(next, answer, updatedAt, bundle);
  if (contextKinds.has(nextAssessmentStep(next, bundle).kind)) throw new TypeError("Complete the required context first");
  return next;
};

/** Defer optional supporting choices without claiming a skill or changing goals. */
export const deferSupportingPlacement = (draft: AssessmentDraft, updatedAt: string, bundle: DefinitionBundle): AssessmentDraft => {
  if (draft.policyVersion !== 2 || draft.mode !== "new-placement" || draft.status !== "in-progress") {
    throw new TypeError("Supporting choices require an unfinished modern setup");
  }
  const main = selectedAssessmentGoals(draft)[0];
  let next = draft;
  let step = nextAssessmentStep(next, bundle);
  if (step.kind !== "skill-selection" || step.graphId === main) throw new TypeError("Choose your main starting point first");
  while (step.kind === "skill-selection" && step.graphId !== main) {
    next = answerAssessmentStep(next, { kind: "skill-selection", graphId: step.graphId, response: "not-sure" }, updatedAt, bundle);
    step = nextAssessmentStep(next, bundle);
  }
  return next;
};
