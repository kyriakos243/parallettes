import type { AthleteEvidenceEvent, DefinitionBundle, DerivedAthleteState } from "../contracts";
import type { AssessmentDraft, AssessmentReview } from "./contracts";
import { placementEntryRuleFor, placementReadinessSatisfied, placementSubjectDemonstrated } from "../placementEntry";

/** Read-only view of active guided facts. No workout record or invented activity time. */
export const placementCheckSummary = (draft: AssessmentDraft, bundle: DefinitionBundle, state: DerivedAthleteState,
  events: readonly AthleteEvidenceEvent[]): Pick<AssessmentReview, "checkedToday" | "nextPracticeLabels"> => {
  if (draft.policyVersion !== 2) return {};
  const active = new Set(state.recentLoad.exposures.filter((load) => load.occurredAt.slice(0, 10) === state.asOf.slice(0, 10)
    && load.occurredAt >= draft.createdAt).flatMap((load) => load.source.kind === "evidence-event" ? [load.source.eventId] : []));
  const checkedToday = events.flatMap((event) => {
    if (event.type !== "performance_observed" || event.source !== "guided-test" || !active.has(event.id)) return [];
    const protocol = bundle.benchmarkProtocols.find((item) => item.id === event.benchmarkProtocolId && item.definitionVersion === event.benchmarkProtocolVersion);
    if (!protocol) return [];
    const value = event.measurement;
    return [{ label: protocol.label, result: event.outcome === "clean" ? "Target met" : event.outcome === "symptom" ? "Stopped with discomfort" : "Target not confirmed",
      target: value ? value.unit === "seconds" ? `${value.value} seconds` : value.unit === "repetitions" ? `${value.value} reps`
        : `${value.value} successful attempts${value.attemptsTotal === undefined ? "" : ` out of ${value.attemptsTotal}`}`
        : event.outcome === "clean" ? "Range and quality recorded" : "No qualifying target recorded" }];
  });
  const nextPracticeLabels = draft.answers.flatMap((answer) => {
    if (answer.value.kind !== "skill-selection" || !answer.value.protocolId) return [];
    const protocolId = answer.value.protocolId;
    const protocol = bundle.benchmarkProtocols.find((item) => item.id === protocolId);
    if (!protocol || !placementSubjectDemonstrated(protocol.subject, state)
      || !placementReadinessSatisfied(placementEntryRuleFor(protocol.subject), bundle, state)) return [];
    return [protocol.label];
  });
  return { checkedToday, nextPracticeLabels };
};
