import type {
  BenchmarkProtocolId,
  BenchmarkSubject,
  DefinitionBundle,
  DerivedAthleteState,
  MilestoneRef,
} from "./contracts";
import { capacityBenchmarkId, graphIds, nodeId } from "./definitions/ids";

export type PlacementEntryRule = Readonly<{
  milestone: MilestoneRef;
  readinessProtocolIds: readonly BenchmarkProtocolId[];
}>;

const tallSupport = capacityBenchmarkId("straight-arm-support", "tall-support");
const scapularControl = capacityBenchmarkId("straight-arm-support", "scapular-control");
const forwardLoading = capacityBenchmarkId("straight-arm-support", "protracted-forward-loading");
const hollowControl = capacityBenchmarkId("body-line-control", "hollow-control");
const horizontalRange = capacityBenchmarkId("horizontal-bent-arm-push", "horizontal-range");
const singleLegLift = capacityBenchmarkId("pike-compression", "active-single-leg-lift");
const doubleLegLift = capacityBenchmarkId("pike-compression", "active-double-leg-lift");
const pikeAccess = capacityBenchmarkId("pike-compression", "usable-pike-access");

const entry = (
  graphId: MilestoneRef["graphId"],
  milestoneId: string,
  readinessProtocolIds: readonly BenchmarkProtocolId[],
): PlacementEntryRule => ({
  milestone: { graphId, nodeId: nodeId(milestoneId) },
  readinessProtocolIds,
});

/**
 * Bounded entry checks for an already-claimed ordinary movement. A current
 * measured demonstration of these readiness subjects may admit that exact
 * check; the checked movement may then be selected for its own practice.
 *
 * This list does not establish any subject, satisfy graph prerequisites, infer
 * predecessor achievements or unlock harder successors. Inversion, transitions,
 * stronger-gated and specialist work retain their existing admission rules.
 * The Planche entries retain grounded assistance and their authored high demand.
 * Callers must still enforce restrictions, symptoms, equipment, inactivity,
 * claim/context eligibility and current load; these helpers are not clearance.
 */
export const placementEntryRules: readonly PlacementEntryRule[] = [
  entry(graphIds.parallettePushing, "floor-push-up", [hollowControl]),
  entry(graphIds.parallettePushing, "controlled-parallette-push-up", [hollowControl, horizontalRange]),
  entry(graphIds.parallettePushing, "tempo-push-up", [hollowControl, horizontalRange]),
  entry(graphIds.lSitVSit, "tuck-support", [tallSupport]),
  entry(graphIds.lSitVSit, "controlled-leg-extensions", [tallSupport]),
  entry(graphIds.lSitVSit, "one-leg-l-sit", [tallSupport, singleLegLift]),
  entry(graphIds.lSitVSit, "full-l-sit", [tallSupport, singleLegLift, pikeAccess, doubleLegLift]),
  entry(graphIds.planche, "controlled-planche-lean", [tallSupport, scapularControl, forwardLoading, hollowControl]),
  entry(graphIds.planche, "toe-light-planche-loading", [tallSupport, scapularControl, forwardLoading, hollowControl]),
  entry(graphIds.planche, "foot-assisted-tuck-planche", [tallSupport, scapularControl, forwardLoading, hollowControl]),
];

export const placementEntryRuleFor = (
  subject: BenchmarkSubject,
): PlacementEntryRule | undefined => subject.kind === "milestone"
  ? placementEntryRules.find((rule) => rule.milestone.graphId === subject.milestone.graphId
    && rule.milestone.nodeId === subject.milestone.nodeId)
  : undefined;

/**
 * Actual, current measured proof only. Estimates, practice without a qualifying
 * benchmark, stale/contradicted findings and predecessor eligibility implications
 * do not qualify. Repeated confirmation remains separately owned by projection;
 * omitting that requirement here is solely for bounded placement admission.
 */
export const placementSubjectDemonstrated = (
  subject: BenchmarkSubject,
  state: DerivedAthleteState | undefined,
): boolean => {
  if (!state) return false;
  if (subject.kind === "milestone") {
    const finding = state.nodeStates.find((candidate) =>
      candidate.milestone.graphId === subject.milestone.graphId
      && candidate.milestone.nodeId === subject.milestone.nodeId);
    return finding?.confidence === "current"
      && (finding.lifecycle === "demonstrated" || finding.lifecycle === "established");
  }
  const finding = state.capacityFindings.find((candidate) =>
    candidate.capacity.capacityId === subject.capacity.capacityId
    && candidate.capacity.facetId === subject.capacity.facetId);
  return finding?.finding === "demonstrated" && finding.confidence === "current";
};

/**
 * Checks the canonical rule against available ordinary content and current
 * measured capacity subjects. This is not the ordinary prerequisite predicate:
 * restrictions, inactivity and prescription trainability remain caller checks.
 */
export const placementReadinessSatisfied = (
  rule: PlacementEntryRule | undefined,
  bundle: DefinitionBundle,
  state: DerivedAthleteState | undefined,
): boolean => {
  if (!rule || !state) return false;
  const canonical = placementEntryRuleFor({ kind: "milestone", milestone: rule.milestone });
  if (!canonical) return false;
  const node = bundle.graphs.find((graph) => graph.id === canonical.milestone.graphId)
    ?.nodes.find((candidate) => candidate.id === canonical.milestone.nodeId);
  if (node?.implementationStatus !== "available" || node.programmingBoundary !== "automatic") return false;
  return canonical.readinessProtocolIds.every((protocolId) => {
    const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === protocolId);
    return protocol?.subject.kind === "capacity-facet"
      && placementSubjectDemonstrated(protocol.subject, state);
  });
};
