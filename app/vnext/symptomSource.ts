import type { AthleteEvidenceEvent, IsoTimestamp, SessionRecord } from "./contracts";

export const symptomSourceError = (
  event: AthleteEvidenceEvent,
  source: AthleteEvidenceEvent | SessionRecord | undefined,
  resetAt?: IsoTimestamp,
): string | undefined => {
  if (event.type !== "restriction_reported" || !event.symptomSource) return undefined;
  const ref = event.symptomSource;
  if (!source || source.athleteId !== event.athleteId) return "Symptom source must exist for the same athlete";
  let occurredAt: IsoTimestamp;
  if (ref.kind === "evidence-event") {
    if (!("type" in source) || source.id !== ref.eventId || source.type !== "performance_observed" || source.outcome !== "symptom") {
      return "Symptom source must identify a symptom performance event";
    }
    occurredAt = source.occurredAt;
  } else {
    if (!("itemOutcomes" in source) || source.id !== ref.sessionRecordId) return "Symptom source must identify its Session Record";
    const item = source.itemOutcomes.find((entry) => entry.planItemId === ref.planItemId);
    if (!item || (!item.review?.symptomOrInstability && item.benchmarkObservation?.outcome !== "symptom")) {
      return "Symptom source must identify the exact symptomatic Session Record item";
    }
    occurredAt = source.completedAt;
  }
  if (Date.parse(occurredAt) > Date.parse(event.occurredAt) || Date.parse(source.recordedAt) > Date.parse(event.recordedAt)) {
    return "Restriction clarification cannot predate its symptom source";
  }
  if (resetAt && Date.parse(occurredAt) <= Date.parse(resetAt)) return "Symptom source was removed by reset";
  return undefined;
};
