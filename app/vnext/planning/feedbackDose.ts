import { parseDefinitionVersion, parseStableId } from "../contracts";
import { structureWorkoutItem } from "../workoutUx";
import type { GenerateSessionInput, GeneratedSession } from "./contracts";
import { generateMixedVNextSession, generateMixedVNextCustomSession } from "./mixed";
import type { VNextCustomContentFilter, VNextCustomSessionMinutes } from "./custom";
import { planningReasonCodes } from "./policy";
import { stableHash } from "./utils";

/**
 * Mixed generator v2 changes newly generated plans only. A modified development
 * block removes whole sets and their following rest; per-set targets/rest keep
 * their native authored meaning. Removed load is never filled with other work.
 */
export const applyFeedbackDose = (input: GenerateSessionInput, generated: GeneratedSession): GeneratedSession => {
  if (!generated.ok || !generated.plan) return generated;
  const original = generated.plan;
  const version = parseDefinitionVersion(2);
  const explanations = new Map(generated.itemExplanations.map((item) => [item.planItemId, item]));
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
    const sets = [...new Set(structured.intervals.filter((interval) => interval.kind === "work").map((interval) => interval.set))];
    if (sets.length < 2) return { item, explanation: { ...explanation,
      whyIntensity: "This is already one short set. Keep the current cautious target; stop or skip it if it still feels too hard." } };
    const retainedCount = Math.max(1, Math.floor(sets.length * 0.75));
    const retained = new Set(sets.slice(0, retainedCount));
    const plannedSeconds = structured.intervals.filter((interval) => retained.has(interval.set))
      .reduce((total, interval) => total + interval.durationSeconds, 0);
    return { item: { ...item, plannedSeconds }, explanation: { ...explanation,
      whyIntensity: `Current feedback calls for less work: ${retainedCount} instead of ${sets.length} planned sets, with the same target and rest per set.` } };
  });
  const actualSeconds = entries.reduce((total, entry) => total + entry.item.plannedSeconds, 0);
  const reduced = actualSeconds < original.intendedDurationSeconds;
  const durationException = reduced ? {
    targetSeconds: generated.durationException?.targetSeconds ?? original.intendedDurationSeconds,
    actualSeconds,
    reasonCode: planningReasonCodes.doseModified,
    message: "Today's workout is shorter because current feedback calls for fewer sets. The removed work is not replaced.",
  } : generated.durationException;
  const definitionReferences = original.definitionReferences.map((reference) => reference.kind === "policy" && reference.id === original.generatorPolicyId
    ? { ...reference, version } : reference);
  const rationale = original.rationale.map((reason) => {
    if (reduced && [planningReasonCodes.exactDuration, planningReasonCodes.shorterSafetyException].includes(reason.code as typeof planningReasonCodes.exactDuration)) {
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

export const generateFeedbackVNextSession = (input: GenerateSessionInput): GeneratedSession =>
  applyFeedbackDose(input, generateMixedVNextSession(input));

export const generateFeedbackVNextCustomSession = (input: GenerateSessionInput, minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter): GeneratedSession =>
  applyFeedbackDose(input, generateMixedVNextCustomSession(input, minutes, contentFilter));
