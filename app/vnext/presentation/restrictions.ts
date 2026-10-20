import type { AthleteEvidenceEvent, DefinitionBundle, DemandDomain, DerivedAthleteState, GraphId } from "../contracts";
import { observationPresentationSourceKey, type RestrictionPresentation } from "./contracts";
import { presentationFamilyLabel, presentationFamilyOrder } from "./progress";

const materialDomainsForFamily = (
  graphId: GraphId,
  bundle: DefinitionBundle,
): ReadonlySet<DemandDomain> => new Set(bundle.exercises
  .filter((exercise) => exercise.graphLinks.some((link) => link.graphId === graphId))
  .flatMap((exercise) => exercise.prescriptionVariants)
  .flatMap((variant) => Object.entries(variant.demand))
  .filter(([, level]) => level === "moderate" || level === "high")
  .map(([domain]) => domain as DemandDomain));

const graphHasAchievement = (
  state: DerivedAthleteState,
  graphId: GraphId,
): boolean => state.nodeStates.some((finding) => finding.milestone.graphId === graphId
  && (finding.lifecycle === "demonstrated" || finding.lifecycle === "established"));

export const buildRestrictionPresentation = (input: Readonly<{
  bundle: DefinitionBundle;
  state: DerivedAthleteState;
  evidenceEvents?: readonly AthleteEvidenceEvent[];
  includeRecoveryActions?: boolean;
}>): RestrictionPresentation => {
  const graphDomains = new Map(presentationFamilyOrder.map((graphId) => [
    graphId,
    materialDomainsForFamily(graphId, input.bundle),
  ]));
  const graphLabels = new Map(input.bundle.graphs.map((graph) => [graph.id, presentationFamilyLabel(graph)]));
  const explicitReport = (source: DerivedAthleteState["activeRestrictions"][number]["source"]) =>
    source.kind === "evidence-event" ? input.evidenceEvents?.find((event) =>
      event.id === source.eventId && event.type === "restriction_reported") : undefined;
  const items: RestrictionPresentation["items"][number][] = input.state.activeRestrictions.map((restriction) => {
    const affectedFamilyIds = presentationFamilyOrder.filter((graphId) => {
      const domains = graphDomains.get(graphId);
      return restriction.demandDomains.some((domain) => domains?.has(domain));
    });
    const affectedFamilyLabels = affectedFamilyIds.map((graphId) =>
      graphLabels.get(graphId) ?? "Affected training");
    const achievedLabels = affectedFamilyIds
      .filter((graphId) => graphHasAchievement(input.state, graphId))
      .map((graphId) => graphLabels.get(graphId) ?? "Previously demonstrated skill");
    const region = restriction.bodyRegions.includes("reported-symptom-or-instability") ? "recent discomfort"
      : restriction.bodyRegions.length
      ? restriction.bodyRegions.join(", ")
      : "recent feedback";
    return {
      sourceKey: observationPresentationSourceKey(restriction.source),
      ...(input.includeRecoveryActions ? { source: restriction.source,
        action: explicitReport(restriction.source) ? "comfort" as const : "clarify" as const } : {}),
      state: restriction.decision === "block" ? "restricted" as const : "modified" as const,
      title: restriction.decision === "block"
        ? `Training restricted for ${region}`
        : `Training adjusted for ${region}`,
      bodyRegions: restriction.bodyRegions,
      affectedFamilyIds,
      affectedFamilyLabels,
      demandDomains: restriction.demandDomains,
      achievementMessage: achievedLabels.length
        ? `${achievedLabels.join(", ")} achievements remain in your progress history.`
        : "Any previously demonstrated achievements remain in your progress history.",
      trainingMessage: restriction.decision === "block"
        ? "Work using the affected demand is paused. Unaffected safe training can continue."
        : "Affected exercises will use a safer variation, range or dose while this feedback is active.",
    };
  });
  if (input.includeRecoveryActions) {
    for (const requirement of input.state.reconfirmationRequirements) {
      const report = explicitReport(requirement.source);
      const affectedFamilyIds = presentationFamilyOrder.filter((graphId) =>
        requirement.demandDomains.some((domain) => graphDomains.get(graphId)?.has(domain)));
      items.push({
        sourceKey: observationPresentationSourceKey(requirement.source),
        source: requirement.source,
        action: report ? "recheck" : "clarify",
        state: "reconfirmation",
        title: "Build back up with a check",
        bodyRegions: report?.type === "restriction_reported" ? report.bodyRegions : [],
        affectedFamilyIds,
        affectedFamilyLabels: affectedFamilyIds.map((id) => graphLabels.get(id) ?? "Affected training"),
        demandDomains: requirement.demandDomains,
        achievementMessage: "Your achievements and original feedback remain in your history.",
        trainingMessage: report
          ? "Comfort is updated. Easier suitable practice can continue; affected demanding work needs fresh successful checks."
          : "Time alone does not confirm comfort. Update the affected movements, then use suitable practice and checks to build back up.",
      });
    }
  }
  return {
    hasActiveRestrictions: items.length > 0,
    summary: items.length
      ? "Your achievements have not been removed. Current training is adjusted separately."
      : "No current training restrictions are affecting this vNext view.",
    items,
  };
};
