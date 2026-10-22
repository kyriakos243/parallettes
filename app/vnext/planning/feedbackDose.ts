import { parseDefinitionVersion, parseStableId, type ReasonCode } from "../contracts";
import { structureWorkoutItem } from "../workoutUx";
import type { GenerateSessionInput, GeneratedSession } from "./contracts";
import { generateMixedVNextSession, generateMixedVNextCustomSession } from "./mixed";
import type { VNextCustomContentFilter, VNextCustomSessionMinutes } from "./custom";
import { GOAL_TRUST_PLANNING_POLICY_ID, GOAL_TRUST_PLANNING_POLICY_VERSION, planningReasonCodes } from "./policy";
import { stableHash } from "./utils";
import { projectionReasonCodes } from "../projection/policy";
import { limitUsefulDose } from "./usefulDose";
import { capPracticeSession, PRACTICE_DOSE_LIMIT } from "./practiceDose";

type ReductionCause = "restriction" | "recheck" | "recent-load" | "feedback" | "safety";

/** Goal-trust plans name the actual cause of a smaller dose instead of always citing feedback. */
const reductionCause = (codes: readonly ReasonCode[]): ReductionCause => {
  const has = (code: ReasonCode) => codes.includes(code);
  if (has(projectionReasonCodes.activeRestriction) || has(projectionReasonCodes.postClearance)) return "restriction";
  if (has(projectionReasonCodes.staleEvidence) || has(projectionReasonCodes.stale)
    || has(projectionReasonCodes.contradictedEvidence) || has(projectionReasonCodes.contradicted)) return "recheck";
  if (has(projectionReasonCodes.repeatedDifficultPerformance) || has(projectionReasonCodes.recentDifficultPerformance)) return "feedback";
  if (has(projectionReasonCodes.recentHighLoad)) return "recent-load";
  return "safety";
};

const causePhrase: Readonly<Record<ReductionCause, string>> = {
  restriction: "a current restriction",
  recheck: "a skill that needs a re-check",
  "recent-load": "recent demanding work",
  feedback: "recent workout feedback",
  safety: "current safety checks",
};

const capitalise = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
const joinCauses = (causes: readonly ReductionCause[]): string => {
  const phrases = [...new Set(causes)].sort().map((cause) => causePhrase[cause]);
  return phrases.length <= 1 ? phrases[0] ?? causePhrase.safety
    : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
};

type DoseOptions = Readonly<{ goalTrust?: boolean }>;

/**
 * Mixed generator v2 changes newly generated plans only. A modified development
 * block removes whole sets and their following rest; per-set targets/rest keep
 * their native authored meaning. Removed load is never filled with other work.
 * Version 3 uses the same dose calculation with current retained-difficulty
 * guidance. Its separate immutable identity keeps native v2 replay unchanged.
 * Version 4 retains that dose and records the unfinished-first focus policy.
 */
const applyDose = (input: GenerateSessionInput, generated: GeneratedSession, policyVersion: 2 | 3 | 4 | 5 | 6,
  options: DoseOptions = {}): GeneratedSession => {
  if (!generated.ok || !generated.plan) return generated;
  const original = generated.plan;
  const version = parseDefinitionVersion(policyVersion);
  const explanations = new Map(generated.itemExplanations.map((item) => [item.planItemId, item]));
  const reducedCauses: ReductionCause[] = [];
  const entries = original.items.map((item) => {
    const explanation = explanations.get(item.id)!;
    const evaluation = generated.trainabilityUsed.find((entry) => entry.exerciseId === item.exerciseId
      && entry.exerciseDefinitionVersion === item.exerciseDefinitionVersion && entry.prescriptionVariantId === item.prescriptionVariantId);
    if (evaluation?.decision !== "modify") return { item, explanation };
    if (item.purpose === "preparation" || item.purpose === "recovery" || item.benchmarkProtocolId) {
      return { item, explanation: { ...explanation, whyIntensity: item.benchmarkProtocolId
        ? "This check retains its exact movement standard; stop if uncomfortable."
        : "This gentle preparation or recovery keeps its planned time. Current safety checks still apply." } };
    }
    const structured = structureWorkoutItem(item, input.bundle);
    const retainedDifficulty = policyVersion >= 3
      && evaluation.reasonCodes.includes(projectionReasonCodes.repeatedDifficultPerformance);
    const recoveryAdvice = retainedDifficulty
      ? " Recent workouts have repeatedly felt too hard or unfinished. Keep this smaller dose until two complete workouts feel Easy or Right, or an exact reassessment confirms readiness. If it is still too hard, choose Easier or a safe easier variation."
      : "";
    const sets = [...new Set(structured.intervals.filter((interval) => interval.kind === "work").map((interval) => interval.set))];
    if (sets.length < 2) return { item, explanation: { ...explanation,
      whyIntensity: `This is already one short set. Keep the current cautious target; stop or skip it if it still feels too hard.${recoveryAdvice}` } };
    const retainedCount = Math.max(1, Math.floor(sets.length * 0.75));
    const retained = new Set(sets.slice(0, retainedCount));
    const plannedSeconds = structured.intervals.filter((interval) => retained.has(interval.set))
      .reduce((total, interval) => total + interval.durationSeconds, 0);
    const cause = reductionCause(evaluation.reasonCodes);
    if (retainedCount < sets.length) reducedCauses.push(cause);
    const lead = options.goalTrust ? capitalise(causePhrase[cause]) : "Current feedback";
    return { item: { ...item, plannedSeconds }, explanation: { ...explanation,
      whyIntensity: `${lead} calls for less work: ${retainedCount} instead of ${sets.length} planned sets, with the same target and rest per set.${recoveryAdvice}` } };
  });
  const actualSeconds = entries.reduce((total, entry) => total + entry.item.plannedSeconds, 0);
  const reduced = actualSeconds < original.intendedDurationSeconds;
  const causes = joinCauses(reducedCauses);
  const plural = new Set(reducedCauses).size > 1;
  const durationException = reduced ? {
    targetSeconds: generated.durationException?.targetSeconds ?? original.intendedDurationSeconds,
    actualSeconds,
    reasonCode: planningReasonCodes.doseModified,
    message: options.goalTrust
      ? generated.durationException?.reasonCode === PRACTICE_DOSE_LIMIT
        ? `${generated.durationException.message} ${capitalise(causes)} ${plural ? "reduce" : "reduces"} the sets further; removed work is not replaced.`
        : `Today's workout is shorter because ${causes} ${plural ? "call" : "calls"} for fewer sets. The removed work is not replaced.`
      : policyVersion === 6 && generated.durationException?.reasonCode === PRACTICE_DOSE_LIMIT
      ? `${generated.durationException.message} Current feedback reduces the sets further; removed work is not replaced.`
      : policyVersion === 5 && generated.durationException?.reasonCode === PRACTICE_DOSE_LIMIT
      ? "Today's workout is shorter because wall-line practice has a set limit and current feedback calls for fewer sets. Planned rest is retained; removed work is not replaced."
      : "Today's workout is shorter because current feedback calls for fewer sets. The removed work is not replaced.",
  } : generated.durationException;
  const versionedReferences = original.definitionReferences.map((reference) => reference.kind === "policy" && reference.id === original.generatorPolicyId
    ? { ...reference, version } : reference);
  // Goal-trust plans keep generator-6 execution identity and add one planning
  // reference, so capability-4 readers replay them while IDs stay distinct.
  const definitionReferences = options.goalTrust
    ? [...versionedReferences.filter((reference) => !(reference.kind === "policy" && reference.id === GOAL_TRUST_PLANNING_POLICY_ID)),
      { kind: "policy" as const, id: GOAL_TRUST_PLANNING_POLICY_ID, version: GOAL_TRUST_PLANNING_POLICY_VERSION }]
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
    : versionedReferences;
  const rationale = original.rationale.map((reason) => {
    if (reduced && ([planningReasonCodes.exactDuration, planningReasonCodes.shorterSafetyException].includes(reason.code as typeof planningReasonCodes.exactDuration)
      || (policyVersion === 5 || policyVersion === 6) && reason.code === PRACTICE_DOSE_LIMIT)) {
      return { ...reason, code: planningReasonCodes.doseModified, message: durationException!.message };
    }
    let message = reason.message;
    for (const entry of entries) {
      const previous = explanations.get(entry.item.id)!;
      if (previous.whyIntensity !== entry.explanation.whyIntensity && message.includes(previous.whyExercise)) {
        message = message.replace(previous.whyIntensity, entry.explanation.whyIntensity);
      }
    }
    return { ...reason, message };
  });
  const identity = stableHash(JSON.stringify({ original, version, entries, definitionReferences, rationale, durationException }));
  const items = entries.map(({ item }, index) => ({ ...item, id: parseStableId("plan-item", `feedback-item-${identity}-${index + 1}`) }));
  return { ...generated, generatorPolicyVersion: version,
    plan: { ...original, id: parseStableId("session-plan", `feedback-plan-${identity}`), generatorPolicyVersion: version,
      intendedDurationSeconds: actualSeconds, items, definitionReferences, rationale },
    itemExplanations: entries.map(({ explanation }, index) => ({ ...explanation, planItemId: items[index]!.id })),
    ...(durationException ? { durationException } : {}),
    issues: reduced ? [...generated.issues.filter((issue) => issue.code !== planningReasonCodes.shorterSafetyException),
      { severity: "warning", code: planningReasonCodes.doseModified, message: durationException!.message }] : generated.issues };
};

export const applyFeedbackDose = (input: GenerateSessionInput, generated: GeneratedSession): GeneratedSession =>
  applyDose(input, generated, 2);

export const generateFeedbackVNextSession = (input: GenerateSessionInput): GeneratedSession =>
  applyFeedbackDose(input, generateMixedVNextSession(input));

export const generateFeedbackVNextCustomSession = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession =>
  applyFeedbackDose(input, generateMixedVNextCustomSession(input, minutes, contentFilter));

export const generateTrainingQualitySessionPlan = (input: GenerateSessionInput): GeneratedSession =>
  applyDose(input, generateMixedVNextSession(input), 3);

export const generateTrainingQualityCustomPlan = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession =>
  applyDose(input, generateMixedVNextCustomSession(input, minutes, contentFilter), 3);

/** New recommendations only; generator 3 remains available for native replay. */
export const generateProgressionSessionPlan = (input: GenerateSessionInput): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true };
  return applyDose(current, generateMixedVNextSession(current), 4);
};

export const generateProgressionCustomPlan = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true };
  return applyDose(current, generateMixedVNextCustomSession(current, minutes, contentFilter), 4);
};

/** Future plans only; versions 1–4 retain their exact native semantics. */
export const generatePracticeSessionPlan = (input: GenerateSessionInput): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true };
  return applyDose(current, capPracticeSession(generateMixedVNextSession(current)), 5);
};

export const generatePracticeCustomPlan = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true };
  return applyDose(current, capPracticeSession(generateMixedVNextCustomSession(current, minutes, contentFilter)), 5);
};

/** New generator only; all native generators 1–5 remain available unchanged. */
export const generateUsefulDoseSessionPlan = (input: GenerateSessionInput): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true };
  return applyDose(current, limitUsefulDose(current, generateMixedVNextSession(current)), 6);
};

export const generateUsefulDoseCustomPlan = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true };
  const today = generateMixedVNextSession(current);
  return applyDose(current, limitUsefulDose(current,
    generateMixedVNextCustomSession(current, minutes, contentFilter), today), 6);
};

/**
 * Goal-trust planning: generator-6 execution, dose caps and feedback order are
 * unchanged; emphasis keeps the declared goal leading, reviews conclude, a
 * blocked stale node falls back within its family and reduced doses name
 * their real cause. Native generators 1–6 remain available unchanged.
 */
export const generateGoalTrustSessionPlan = (input: GenerateSessionInput): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true, goalContinuity: true };
  return applyDose(current, limitUsefulDose(current, generateMixedVNextSession(current)), 6, { goalTrust: true });
};

export const generateGoalTrustCustomPlan = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession => {
  const current = { ...input, preferUnfinishedTargets: true, goalContinuity: true };
  const today = generateMixedVNextSession(current);
  return applyDose(current, limitUsefulDose(current,
    generateMixedVNextCustomSession(current, minutes, contentFilter), today), 6, { goalTrust: true });
};
