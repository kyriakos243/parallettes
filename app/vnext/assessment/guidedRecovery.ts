import type { GuidedTestResultInput } from "./contracts";

type ResultFields = Pick<GuidedTestResultInput, "outcome" | "measurement" | "perceivedExertion" | "qualityCriteriaSatisfied" | "safetyCriteriaSatisfied" | "notes">;

/** Older forms could turn blank attempt fields into an invalid 0 / 0 entry. */
export const hasInvalidGuidedAttemptCount = (result: GuidedTestResultInput): boolean => {
  const measurement = result.measurement;
  return measurement?.unit === "attempts" && (!Number.isSafeInteger(measurement.value)
    || measurement.value < 0 || !Number.isSafeInteger(measurement.attemptsTotal)
    || measurement.attemptsTotal! < 1 || measurement.attemptsTotal! < measurement.value);
};

/** Explicitly correct only invalid pending input; retain the original check identity/time. */
export const correctInvalidGuidedAttemptResult = (original: GuidedTestResultInput, fields: ResultFields): GuidedTestResultInput => {
  if (!hasInvalidGuidedAttemptCount(original)) throw new TypeError("A valid pending result must be retried unchanged");
  const corrected: GuidedTestResultInput = {
    eventId: original.eventId,
    observationSessionId: original.observationSessionId,
    occurredAt: original.occurredAt,
    recordedAt: original.recordedAt,
    protocolId: original.protocolId,
    outcome: fields.outcome,
    qualityCriteriaSatisfied: fields.qualityCriteriaSatisfied,
    safetyCriteriaSatisfied: fields.safetyCriteriaSatisfied,
    ...(fields.measurement ? { measurement: fields.measurement } : {}),
    ...(fields.perceivedExertion !== undefined ? { perceivedExertion: fields.perceivedExertion } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
  };
  if (hasInvalidGuidedAttemptCount(corrected)) throw new TypeError("Enter a whole total attempt count of at least 1, or choose No attempt made");
  return corrected;
};
