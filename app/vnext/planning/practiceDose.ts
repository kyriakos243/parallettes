import { parseStableId } from "../contracts";
import { isWallLinePractice, WALL_LINE_PRACTICE_SECONDS } from "../practiceDose";
import type { GeneratedSession } from "./contracts";
import { planningReasonCodes } from "./policy";

export const PRACTICE_DOSE_LIMIT = parseStableId("reason", "planning-useful-dose-limit");

/** Reduce the routine drill before current feedback can reduce its sets again. */
export const capPracticeSession = (generated: GeneratedSession): GeneratedSession => {
  if (!generated.ok || !generated.plan) return generated;
  const original = generated.plan;
  const cappedIds = new Set(original.items.filter((item) => isWallLinePractice(item)
    && item.plannedSeconds > WALL_LINE_PRACTICE_SECONDS).map((item) => item.id));
  if (!cappedIds.size) return generated;
  const items = original.items.map((item) => cappedIds.has(item.id) ? { ...item, plannedSeconds: WALL_LINE_PRACTICE_SECONDS } : item);
  const actualSeconds = items.reduce((sum, item) => sum + item.plannedSeconds, 0);
  const message = "This workout is shorter because wall-line practice is limited to three controlled sets. Other useful work keeps its planned dose; no extra sets are added to fill time.";
  const durationException = { targetSeconds: generated.durationException?.targetSeconds ?? original.intendedDurationSeconds,
    actualSeconds, reasonCode: PRACTICE_DOSE_LIMIT, message };
  return { ...generated, plan: { ...original, items, intendedDurationSeconds: actualSeconds,
    rationale: [...original.rationale.filter((reason) => ![planningReasonCodes.exactDuration,
      planningReasonCodes.shorterSafetyException].includes(reason.code as typeof planningReasonCodes.exactDuration)),
    { code: PRACTICE_DOSE_LIMIT, message }] }, durationException,
    itemExplanations: generated.itemExplanations.map((explanation) => cappedIds.has(explanation.planItemId)
      ? { ...explanation, whyIntensity: "Up to three controlled sets of wall-line practice, keeping the planned rest. Stop before range is forced." } : explanation),
    issues: [...generated.issues, { severity: "warning", code: PRACTICE_DOSE_LIMIT, message }] };
};
