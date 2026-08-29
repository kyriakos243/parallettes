import type { AthleteEvidenceEvent, SessionRecord } from "../contracts";
import {
  observationPresentationSourceKey,
  type ObservationPresentationProvenance,
  type ObservationPresentationSourceKind,
} from "./contracts";

const presentationKindForEvent = (
  event: AthleteEvidenceEvent,
): ObservationPresentationSourceKind => event.source === "self-assessment"
  ? "assessment"
  : event.source === "guided-test"
    ? "guided-test"
    : event.source === "athlete-report"
      ? "athlete-report"
      : event.source === "migration"
        ? "migration"
        : event.source === "correction"
          ? "correction"
          : "unknown";

/**
 * Builds a read-only display index from the same immutable sources used by the
 * projector. The index changes wording only; findings still come exclusively
 * from Derived Athlete State.
 */
export const buildObservationPresentationProvenance = (input: Readonly<{
  evidenceEvents: readonly AthleteEvidenceEvent[];
  sessionRecords: readonly SessionRecord[];
}>): ObservationPresentationProvenance => {
  const result = new Map<string, ObservationPresentationSourceKind>();
  for (const event of input.evidenceEvents) {
    result.set(
      observationPresentationSourceKey({ kind: "evidence-event", eventId: event.id }),
      presentationKindForEvent(event),
    );
  }
  for (const record of input.sessionRecords) {
    const sourceKind: ObservationPresentationSourceKind = record.legacySource?.kind === "legacy-v1.2-sparse"
      ? "migration"
      : "session";
    for (const item of record.itemOutcomes) {
      result.set(observationPresentationSourceKey({
        kind: "session-item",
        sessionRecordId: record.id,
        planItemId: item.planItemId,
      }), sourceKind);
    }
  }
  return result;
};
