import type {
  BenchmarkSubject,
  CapacityFacetRef,
  DevelopmentNode,
  MilestoneRef,
  PrerequisiteRef,
} from "../contracts";
import { milestoneKey } from "../projection";
import type { GenerateSessionInput } from "./contracts";

export type PrerequisiteActions = Readonly<{
  milestones: readonly MilestoneRef[];
  capacities: readonly CapacityFacetRef[];
  unresolved: readonly PrerequisiteRef[];
}>;

export const milestoneIsSatisfied = (
  milestone: MilestoneRef,
  input: GenerateSessionInput,
): boolean => {
  const state = input.state.nodeStates.find((candidate) =>
    milestoneKey(candidate.milestone) === milestoneKey(milestone));
  if (!state) return false;
  if (state.lifecycle === "established" && state.confidence === "current") return true;
  return state.satisfiedForEligibilityBy.some((implication) => {
    const stronger = input.state.nodeStates.find((candidate) =>
      milestoneKey(candidate.milestone) === milestoneKey(implication.milestone));
    return stronger?.lifecycle === "established" && stronger.confidence === "current";
  });
};

const subjectIsSatisfied = (
  subject: BenchmarkSubject,
  input: GenerateSessionInput,
): boolean => {
  if (subject.kind === "milestone") return milestoneIsSatisfied(subject.milestone, input);
  const finding = input.state.capacityFindings.find((candidate) =>
    candidate.capacity.capacityId === subject.capacity.capacityId
      && candidate.capacity.facetId === subject.capacity.facetId);
  return finding?.finding === "demonstrated"
    && finding.confirmationSatisfied
    && finding.confidence === "current";
};

export const prerequisiteIsSatisfied = (
  ref: PrerequisiteRef,
  input: GenerateSessionInput,
): boolean => {
  if (ref.kind === "milestone") return milestoneIsSatisfied(ref.milestone, input);
  if (ref.kind === "capacity-facet") return subjectIsSatisfied({
    kind: "capacity-facet",
    capacity: ref.capacity,
  }, input);
  return input.bundle.benchmarkProtocols
    .filter((protocol) => protocol.id === ref.benchmarkProtocolId)
    .some((protocol) => subjectIsSatisfied(protocol.subject, input));
};

export const prerequisiteKey = (ref: PrerequisiteRef): string => ref.kind === "milestone"
  ? `milestone:${milestoneKey(ref.milestone)}`
  : ref.kind === "capacity-facet"
    ? `capacity:${ref.capacity.capacityId}:${ref.capacity.facetId}`
    : `benchmark:${ref.benchmarkProtocolId}`;

const nodeFor = (
  input: GenerateSessionInput,
  milestone: MilestoneRef,
): DevelopmentNode | undefined => input.bundle.graphs
  .find((graph) => graph.id === milestone.graphId)
  ?.nodes.find((node) => node.id === milestone.nodeId);

const protocolSubject = (
  input: GenerateSessionInput,
  ref: Extract<PrerequisiteRef, { kind: "benchmark" }>,
): BenchmarkSubject | undefined => input.bundle.benchmarkProtocols
  .find((protocol) => protocol.id === ref.benchmarkProtocolId)?.subject;

const mergeActions = (actions: readonly PrerequisiteActions[]): PrerequisiteActions => {
  const milestones = new Map<string, MilestoneRef>();
  const capacities = new Map<string, CapacityFacetRef>();
  const unresolved = new Map<string, PrerequisiteRef>();
  for (const action of actions) {
    action.milestones.forEach((item) => milestones.set(milestoneKey(item), item));
    action.capacities.forEach((item) => capacities.set(`${item.capacityId}:${item.facetId}`, item));
    action.unresolved.forEach((item) => unresolved.set(prerequisiteKey(item), item));
  }
  return {
    milestones: [...milestones.values()].sort((left, right) =>
      milestoneKey(left).localeCompare(milestoneKey(right))),
    capacities: [...capacities.values()].sort((left, right) =>
      `${left.capacityId}:${left.facetId}`.localeCompare(`${right.capacityId}:${right.facetId}`)),
    unresolved: [...unresolved.values()].sort((left, right) =>
      prerequisiteKey(left).localeCompare(prerequisiteKey(right))),
  };
};

const actionableMilestoneKeys = (input: GenerateSessionInput): ReadonlySet<string> => new Set([
  ...input.state.workingNodes,
  ...input.state.eligibleTargets,
].map((item) => milestoneKey(item.milestone)));

const specialistIsExplicit = (
  milestone: MilestoneRef,
  input: GenerateSessionInput,
): boolean => input.intent.preferences.specialistOptIn
  && input.intent.goals.some((goal) => goal.graphId === milestone.graphId
    && goal.targetNodeId === milestone.nodeId);

const actionProgressRank = (
  input: GenerateSessionInput,
  action: PrerequisiteActions,
): number => Math.max(0,
  ...action.milestones.map((milestone) => {
    const state = input.state.nodeStates.find((candidate) =>
      milestoneKey(candidate.milestone) === milestoneKey(milestone));
    return state?.lifecycle === "established" ? 4
      : state?.lifecycle === "demonstrated" ? 3
        : state?.lifecycle === "developing" ? 2
          : state?.lifecycle === "estimated" ? 1 : 0;
  }),
  ...action.capacities.map((capacity) => {
    const finding = input.state.capacityFindings.find((candidate) =>
      candidate.capacity.capacityId === capacity.capacityId
      && candidate.capacity.facetId === capacity.facetId);
    return finding?.finding === "demonstrated" ? 2
      : finding?.finding === "estimated" ? 1 : 0;
  }));

const selectedUnsatisfiedRefs = (
  input: GenerateSessionInput,
  node: DevelopmentNode,
  visiting: ReadonlySet<string>,
): readonly PrerequisiteRef[] => {
  const allOf = (node.prerequisiteRule?.allOf ?? [])
    .filter((ref) => !prerequisiteIsSatisfied(ref, input))
    .sort((left, right) => prerequisiteKey(left).localeCompare(prerequisiteKey(right)));
  const anyOf = node.prerequisiteRule?.anyOf ?? [];
  if (!anyOf.length || anyOf.some((ref) => prerequisiteIsSatisfied(ref, input))) return allOf;
  const selected = anyOf
    .map((ref) => ({ ref, action: resolveRef(input, ref, visiting) }))
    .sort((left, right) => {
      const leftActionable = left.action.milestones.length + left.action.capacities.length;
      const rightActionable = right.action.milestones.length + right.action.capacities.length;
      return actionProgressRank(input, right.action) - actionProgressRank(input, left.action)
        || Number(rightActionable > 0) - Number(leftActionable > 0)
        || left.action.unresolved.length - right.action.unresolved.length
        || prerequisiteKey(left.ref).localeCompare(prerequisiteKey(right.ref));
    })[0]?.ref;
  return selected ? [...allOf, selected] : allOf;
};

const resolveRule = (
  input: GenerateSessionInput,
  node: DevelopmentNode,
  visiting: ReadonlySet<string>,
): PrerequisiteActions => mergeActions(
  selectedUnsatisfiedRefs(input, node, visiting)
    .map((ref) => resolveRef(input, ref, visiting)),
);

const resolveSubject = (
  input: GenerateSessionInput,
  subject: BenchmarkSubject,
  visiting: ReadonlySet<string>,
): PrerequisiteActions => subject.kind === "milestone"
  ? resolveRef(input, { kind: "milestone", milestone: subject.milestone }, visiting)
  : resolveRef(input, { kind: "capacity-facet", capacity: subject.capacity }, visiting);

function resolveRef(
  input: GenerateSessionInput,
  ref: PrerequisiteRef,
  visiting: ReadonlySet<string>,
): PrerequisiteActions {
  if (prerequisiteIsSatisfied(ref, input)) return mergeActions([]);
  if (ref.kind === "capacity-facet") {
    return { milestones: [], capacities: [ref.capacity], unresolved: [] };
  }
  if (ref.kind === "benchmark") {
    const subject = protocolSubject(input, ref);
    return subject
      ? resolveSubject(input, subject, visiting)
      : { milestones: [], capacities: [], unresolved: [ref] };
  }

  const key = milestoneKey(ref.milestone);
  if (visiting.has(key)) return { milestones: [], capacities: [], unresolved: [ref] };
  const node = nodeFor(input, ref.milestone);
  if (!node) return { milestones: [], capacities: [], unresolved: [ref] };
  const allowedBoundary = node.programmingBoundary !== "specialist"
    || specialistIsExplicit(ref.milestone, input);
  if (node.implementationStatus === "available"
    && allowedBoundary
    && actionableMilestoneKeys(input).has(key)) {
    return { milestones: [ref.milestone], capacities: [], unresolved: [] };
  }
  const nested = resolveRule(input, node, new Set(visiting).add(key));
  if (nested.milestones.length || nested.capacities.length || nested.unresolved.length) return nested;
  return { milestones: [], capacities: [], unresolved: [ref] };
}

export const resolvePrerequisiteActions = (
  input: GenerateSessionInput,
  refs: readonly PrerequisiteRef[],
): PrerequisiteActions => mergeActions(
  refs.filter((ref) => !prerequisiteIsSatisfied(ref, input))
    .map((ref) => resolveRef(input, ref, new Set())),
);

/** Direct unmet requirements with a single deterministic route for `anyOf`. */
export const selectedUnsatisfiedPrerequisites = (
  input: GenerateSessionInput,
  node: DevelopmentNode,
): readonly PrerequisiteRef[] => selectedUnsatisfiedRefs(input, node, new Set());
