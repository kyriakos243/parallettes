import { routinePracticeLimitSeconds } from "../practiceDose";
import type { GenerateSessionInput, GeneratedSession } from "./contracts";
import { planningReasonCodes, vNextGeneratorPolicy } from "./policy";
import { PRACTICE_DOSE_LIMIT } from "./practiceDose";

const development = (purpose: string): boolean => purpose !== "preparation" && purpose !== "recovery";

/** Generator 6 only: cap useful work before feedback; never refill removed time. */
export const limitUsefulDose = (
  input: GenerateSessionInput,
  generated: GeneratedSession,
  nativeToday?: GeneratedSession,
): GeneratedSession => {
  if (!generated.ok || !generated.plan) return generated;
  const original = generated.plan;
  const remaining = new Map<string, number>();
  const changed = new Set<string>();
  const items = original.items.map((item) => {
    const routineLimit = routinePracticeLimitSeconds(item);
    let limit = routineLimit ?? Infinity;
    if (nativeToday && development(item.purpose) && !item.benchmarkProtocolId && item.purpose !== "guided-test") {
      const native = nativeToday.plan?.items.filter((candidate) => candidate.exerciseId === item.exerciseId
        && candidate.exerciseDefinitionVersion === item.exerciseDefinitionVersion
        && candidate.prescriptionVariantId === item.prescriptionVariantId && development(candidate.purpose));
      // Explicit capacity focuses may add an already-safe movement absent from
      // Today. Use the existing supporting-capacity budget, not the clock.
      const nativeBudget = native?.length ? native.reduce((sum, candidate) => sum + candidate.plannedSeconds, 0)
        : vNextGeneratorPolicy.blockSeconds[input.sessionDemand ?? input.intent.defaultSessionDemand].supporting;
      limit = Math.min(limit, nativeBudget);
    }
    if (!Number.isFinite(limit)) return item;
    const key = item.exerciseId;
    const available = Math.min(limit, remaining.get(key) ?? limit);
    const plannedSeconds = Math.min(item.plannedSeconds, available);
    remaining.set(key, available - plannedSeconds);
    if (plannedSeconds === item.plannedSeconds) return item;
    changed.add(item.id);
    return { ...item, plannedSeconds };
  });
  if (!changed.size) return generated;
  const retained = items.filter((item) => item.plannedSeconds > 0);
  const actualSeconds = retained.reduce((sum, item) => sum + item.plannedSeconds, 0);
  const cappedNames = [...new Set(original.items.filter((item) => changed.has(item.id)).map((item) =>
    item.exerciseId === "pike-elevation" ? "Pike Elevation" : "wall-line"))];
  const message = nativeToday
    ? "This workout is shorter because the selected movements have reached their useful practice dose. Your chosen duration is a maximum, including rest; extra sets are not added to fill time."
    : `This workout is shorter because ${cappedNames.join(" and ")} practice is limited to three controlled sets. Other useful work keeps its planned dose; extra sets are not added to fill time.`;
  const retainedIds = new Set(retained.map((item) => item.id));
  const durationException = { targetSeconds: generated.durationException?.targetSeconds ?? original.intendedDurationSeconds,
    actualSeconds, reasonCode: PRACTICE_DOSE_LIMIT, message };
  return { ...generated, plan: { ...original, items: retained, intendedDurationSeconds: actualSeconds,
    rationale: [...original.rationale.filter((reason) => ![planningReasonCodes.exactDuration,
      planningReasonCodes.shorterSafetyException, PRACTICE_DOSE_LIMIT].includes(reason.code as typeof PRACTICE_DOSE_LIMIT)),
    { code: PRACTICE_DOSE_LIMIT, message }] }, durationException,
    itemExplanations: generated.itemExplanations.filter((entry) => retainedIds.has(entry.planItemId)).map((entry) => changed.has(entry.planItemId)
      ? { ...entry, whyIntensity: retained.find((item) => item.id === entry.planItemId)?.exerciseId === "pike-elevation"
        ? "Up to three controlled sets of Pike Elevation, keeping the same target and planned rest. Stop when the target is done."
        : retained.find((item) => item.id === entry.planItemId)?.exerciseId === "wall-shoulder-flexion-line-drill"
          ? "Up to three controlled sets of wall-line practice, keeping the planned rest. Stop before range is forced."
          : "This movement keeps at most its normal useful dose, with the same target and planned rest. A longer requested session does not add more sets." }
      : entry),
    issues: [...generated.issues.filter((issue) => issue.code !== planningReasonCodes.shorterSafetyException),
      { severity: "warning", code: PRACTICE_DOSE_LIMIT, message }] };
};
