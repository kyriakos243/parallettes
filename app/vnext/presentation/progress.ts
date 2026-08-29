import type {
  BenchmarkSubject,
  CapacityFacetRef,
  DefinitionBundle,
  DerivedAthleteState,
  DevelopmentGraph,
  DevelopmentNode,
  GraphId,
  MilestoneRef,
  NodeLifecycle,
  ObservationSourceRef,
  PerformanceConfidence,
  PrerequisiteRef,
  TrainabilityDecision,
} from "../contracts";
import { graphIds } from "../definitions";
import type { EmphasisFocus } from "../planning";
import {
  observationPresentationSourceKey,
  type AvailabilityPresentation,
  type ConfidencePresentation,
  type DemonstratedStatePresentation,
  type ObservationPresentationProvenance,
  type PrerequisitePresentation,
  type ProgressAndGoalsPresentation,
  type ProgressPresentationInput,
  type RecommendedFocusPresentation,
  type SkillDetailPresentation,
  type SkillFamilySummaryPresentation,
  type TargetPresentation,
} from "./contracts";

const familyOrder = [
  graphIds.planche,
  graphIds.lSitVSit,
  graphIds.handstandBalance,
  graphIds.verticalPushHspu,
  graphIds.pressToHandstand,
  graphIds.parallettePushing,
  graphIds.transitions,
] as const;

export const presentationFamilyLabel = (graph: DevelopmentGraph): string =>
  graph.id === graphIds.handstandBalance ? "Handstand"
    : graph.id === graphIds.verticalPushHspu ? "HSPU"
      : graph.id === graphIds.pressToHandstand ? "Press"
        : graph.id === graphIds.parallettePushing ? "Pushing"
          : graph.label;

const lifecycleRank: Readonly<Record<NodeLifecycle, number>> = {
  unknown: 0,
  estimated: 1,
  developing: 2,
  demonstrated: 3,
  established: 4,
};

const tierRank = {
  foundation: 0,
  intermediate: 1,
  advanced: 2,
  specialist: 3,
} as const;

const milestoneKey = (milestone: MilestoneRef): string =>
  `${milestone.graphId}:${milestone.nodeId}`;

const sourceKindFor = (
  refs: readonly ObservationSourceRef[],
  provenance?: ObservationPresentationProvenance,
): DemonstratedStatePresentation["sourceLabel"] => {
  const kinds = new Set(refs.map((source) =>
    provenance?.get(observationPresentationSourceKey(source)) ?? "unknown"));
  if (kinds.has("migration")) return "Imported starting point";
  if (kinds.has("assessment")) return "Placement estimate";
  return "Provisional starting point";
};

const graphFor = (bundle: DefinitionBundle, graphId: GraphId): DevelopmentGraph => {
  const graph = bundle.graphs.find((candidate) => candidate.id === graphId);
  if (!graph) throw new TypeError(`Progress & Goals requires graph ${graphId}`);
  return graph;
};

const nodeFor = (
  bundle: DefinitionBundle,
  milestone: MilestoneRef,
): DevelopmentNode | undefined => bundle.graphs
  .find((graph) => graph.id === milestone.graphId)
  ?.nodes.find((node) => node.id === milestone.nodeId);

type NodeState = DerivedAthleteState["nodeStates"][number];

const stateFor = (
  state: DerivedAthleteState,
  milestone: MilestoneRef,
): NodeState | undefined => state.nodeStates.find((candidate) =>
  milestoneKey(candidate.milestone) === milestoneKey(milestone));

const confidencePresentation = (
  finding?: Pick<NodeState, "lifecycle" | "confidence">,
): ConfidencePresentation => {
  if (!finding || finding.lifecycle === "unknown") return {
    state: "not-established",
    label: "Not demonstrated yet",
    message: "Training will begin from the first safe, relevant step.",
  };
  if (finding.lifecycle === "estimated" || finding.lifecycle === "developing") return {
    state: "not-established",
    label: "Provisional",
    message: "This is a useful starting point, not a confirmed achievement.",
  };
  if (finding.lifecycle === "demonstrated" && finding.confidence === "current") return {
    state: "check-needed",
    label: "Demonstrated — confirmation building",
    message: "This has been demonstrated, but its approved confirmation policy must be completed before it unlocks progression.",
  };
  if (finding.confidence === "current") return {
    state: "current",
    label: "Current",
    message: "Recent evidence supports this demonstrated skill.",
  };
  if (finding.confidence === "contradicted") return {
    state: "conflicting-evidence",
    label: "Reconfirmation recommended",
    message: "The achievement remains in your history, but recent attempts suggest a fresh check.",
  };
  return {
    state: "check-needed",
    label: "Check recommended",
    message: "The achievement remains in your history; a short reconfirmation will update current availability.",
  };
};

const selectedCurrentState = (
  graph: DevelopmentGraph,
  state: DerivedAthleteState,
): NodeState | undefined => {
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return state.nodeStates
    .filter((candidate) => candidate.milestone.graphId === graph.id
      && candidate.lifecycle !== "unknown")
    .sort((left, right) => {
      const leftNode = nodes.get(left.milestone.nodeId);
      const rightNode = nodes.get(right.milestone.nodeId);
      const leftAchieved = left.lifecycle === "demonstrated" || left.lifecycle === "established" ? 1 : 0;
      const rightAchieved = right.lifecycle === "demonstrated" || right.lifecycle === "established" ? 1 : 0;
      return rightAchieved - leftAchieved
        || (rightNode ? tierRank[rightNode.progressionTier] : -1)
          - (leftNode ? tierRank[leftNode.progressionTier] : -1)
        || (nodeOrder.get(right.milestone.nodeId) ?? -1)
          - (nodeOrder.get(left.milestone.nodeId) ?? -1)
        || lifecycleRank[right.lifecycle] - lifecycleRank[left.lifecycle]
        || milestoneKey(left.milestone).localeCompare(milestoneKey(right.milestone));
    })[0];
};

const demonstratedStatePresentation = (
  graph: DevelopmentGraph,
  state: DerivedAthleteState,
  provenance?: ObservationPresentationProvenance,
): DemonstratedStatePresentation => {
  const finding = selectedCurrentState(graph, state);
  const node = finding && graph.nodes.find((candidate) => candidate.id === finding.milestone.nodeId);
  if (!finding || !node) return {
    kind: "none",
    label: "No confirmed starting point yet",
    supportingText: "Choose this goal or complete a short placement check to find the right first step.",
    historyRetained: false,
  };
  if (finding.lifecycle === "estimated" || finding.lifecycle === "developing") {
    const sourceLabel = sourceKindFor(finding.supportingObservationRefs, provenance);
    return {
      kind: "provisional",
      label: node.label,
      supportingText: `${sourceLabel}. Training or a guided test can confirm it.`,
      milestone: finding.milestone,
      historyRetained: false,
      sourceLabel,
    };
  }
  return {
    kind: "demonstrated",
    label: node.label,
    supportingText: finding.confidence === "current"
      ? "Demonstrated with current supporting evidence."
      : "Previously demonstrated. A current check may be recommended before loading it again.",
    milestone: finding.milestone,
    historyRetained: true,
  };
};

const strongerEvidenceSatisfies = (
  finding: NodeState,
  state: DerivedAthleteState,
): boolean => finding.satisfiedForEligibilityBy.some((implication) => {
  const stronger = stateFor(state, implication.milestone);
  return stronger?.lifecycle === "established" && stronger.confidence === "current";
});

const subjectState = (
  subject: BenchmarkSubject,
  state: DerivedAthleteState,
): PrerequisitePresentation["state"] => {
  if (subject.kind === "milestone") {
    const finding = stateFor(state, subject.milestone);
    if (finding?.lifecycle === "established" && finding.confidence === "current") return "met";
    if (finding && strongerEvidenceSatisfies(finding, state)) return "met";
    if (finding && finding.lifecycle !== "unknown") return "check-needed";
    return "not-yet";
  }
  const finding = state.capacityFindings.find((candidate) =>
    candidate.capacity.capacityId === subject.capacity.capacityId
      && candidate.capacity.facetId === subject.capacity.facetId);
  if (finding?.finding === "demonstrated"
    && finding.confirmationSatisfied
    && finding.confidence === "current") return "met";
  return finding && finding.finding !== "unknown" ? "check-needed" : "not-yet";
};

const subjectForRef = (
  ref: PrerequisiteRef,
  bundle: DefinitionBundle,
): BenchmarkSubject | undefined => ref.kind === "milestone"
  ? { kind: "milestone", milestone: ref.milestone }
  : ref.kind === "capacity-facet"
    ? { kind: "capacity-facet", capacity: ref.capacity }
    : bundle.benchmarkProtocols.find((protocol) => protocol.id === ref.benchmarkProtocolId)?.subject;

const prerequisiteKey = (ref: PrerequisiteRef): string => ref.kind === "milestone"
  ? `milestone:${milestoneKey(ref.milestone)}`
  : ref.kind === "capacity-facet"
    ? `capacity:${ref.capacity.capacityId}:${ref.capacity.facetId}`
    : `benchmark:${ref.benchmarkProtocolId}`;

const capacityLabel = (
  bundle: DefinitionBundle,
  capacity: CapacityFacetRef,
): string => {
  const definition = bundle.capacities.find((candidate) => candidate.id === capacity.capacityId);
  const facet = definition?.facets.find((candidate) => candidate.id === capacity.facetId);
  return facet?.label ?? definition?.label ?? "Supporting capacity";
};

const prerequisiteLabel = (ref: PrerequisiteRef, bundle: DefinitionBundle): string => {
  if (ref.kind === "milestone") return nodeFor(bundle, ref.milestone)?.label ?? "Earlier movement step";
  if (ref.kind === "capacity-facet") return capacityLabel(bundle, ref.capacity);
  return bundle.benchmarkProtocols.find((protocol) => protocol.id === ref.benchmarkProtocolId)?.label
    ?? "Guided confirmation";
};

const prerequisitePresentation = (
  ref: PrerequisiteRef,
  requirement: PrerequisitePresentation["requirement"],
  bundle: DefinitionBundle,
  state: DerivedAthleteState,
): PrerequisitePresentation => {
  const subject = subjectForRef(ref, bundle);
  const status = subject ? subjectState(subject, state) : "not-yet";
  return {
    key: prerequisiteKey(ref),
    ref,
    label: prerequisiteLabel(ref, bundle),
    requirement,
    state: status,
    message: status === "met"
      ? "Ready for this next step."
      : status === "check-needed"
        ? "A short confirmation is needed before progression."
        : "Build or demonstrate this before progression.",
  };
};

const prerequisitesFor = (
  node: DevelopmentNode | undefined,
  bundle: DefinitionBundle,
  state: DerivedAthleteState,
): readonly PrerequisitePresentation[] => node ? [
  ...(node.prerequisiteRule?.allOf ?? []).map((ref) =>
    prerequisitePresentation(ref, "required", bundle, state)),
  ...(node.prerequisiteRule?.anyOf ?? []).map((ref) =>
    prerequisitePresentation(ref, "one-of", bundle, state)),
] : [];

const emphasisForGraph = (
  input: ProgressPresentationInput,
  graphId: GraphId,
): Readonly<{ focus: EmphasisFocus; role: "primary" | "secondary" | "maintenance" }> | undefined => {
  const emphasis = input.generatedSession?.emphasis;
  if (!emphasis) return undefined;
  if (emphasis.primary.graphId === graphId) return { focus: emphasis.primary, role: "primary" };
  if (emphasis.secondary?.graphId === graphId) return { focus: emphasis.secondary, role: "secondary" };
  const maintenance = emphasis.maintenance.find((item) => item.graphId === graphId);
  return maintenance ? { focus: maintenance, role: "maintenance" } : undefined;
};

const nextTargetFor = (
  graph: DevelopmentGraph,
  input: ProgressPresentationInput,
): TargetPresentation | undefined => {
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const emphasis = emphasisForGraph(input, graph.id)?.focus;
  const eligible = input.state.eligibleTargets
    .filter((candidate) => candidate.milestone.graphId === graph.id)
    .map((candidate) => candidate.milestone);
  const working = input.state.workingNodes
    .filter((candidate) => candidate.milestone.graphId === graph.id)
    .map((candidate) => candidate.milestone);
  const actionable = [...eligible, ...working];
  const preferred = emphasis?.targetMilestone
    && actionable.some((candidate) => milestoneKey(candidate) === milestoneKey(emphasis.targetMilestone!))
    ? emphasis.targetMilestone
    : [...actionable].sort((left, right) =>
      (nodeOrder.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER)
        - (nodeOrder.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER)
      || milestoneKey(left).localeCompare(milestoneKey(right)))[0];
  const fallback = graph.nodes.find((node) => {
    const finding = stateFor(input.state, { graphId: graph.id, nodeId: node.id });
    return node.implementationStatus === "available"
      && node.programmingBoundary === "automatic"
      && !(finding?.lifecycle === "established" && finding.confidence === "current");
  });
  const milestone = preferred ?? (fallback ? { graphId: graph.id, nodeId: fallback.id } : undefined);
  if (!milestone) return undefined;
  const node = graph.nodes.find((candidate) => candidate.id === milestone.nodeId);
  if (!node) return undefined;
  const finding = stateFor(input.state, milestone);
  const reconfirm = finding
    && (finding.lifecycle === "demonstrated" || finding.lifecycle === "established")
    && finding.confidence !== "current";
  const isEligible = eligible.some((candidate) => milestoneKey(candidate) === milestoneKey(milestone));
  const isWorking = working.some((candidate) => milestoneKey(candidate) === milestoneKey(milestone));
  const targetState: TargetPresentation["state"] = reconfirm
    ? "reconfirmation"
    : isEligible
      ? "achievable"
      : isWorking
        ? "developing"
        : "needs-prerequisites";
  return {
    milestone,
    label: node.label,
    state: targetState,
    message: targetState === "achievable"
      ? "This is an available next step when today’s trainability checks allow it."
      : targetState === "developing"
        ? "This is the current development step."
        : targetState === "reconfirmation"
          ? "Reconfirm this movement before loading it as current work."
          : "Complete the listed requirements before this progression becomes available.",
  };
};

const familyDemandDomains = (
  graphId: GraphId,
  bundle: DefinitionBundle,
): ReadonlySet<string> => new Set(bundle.exercises
  .filter((exercise) => exercise.graphLinks.some((link) => link.graphId === graphId))
  .flatMap((exercise) => exercise.prescriptionVariants)
  .flatMap((variant) => Object.entries(variant.demand))
  .filter(([, level]) => level === "moderate" || level === "high")
  .map(([domain]) => domain));

const targetTrainability = (
  target: TargetPresentation | undefined,
  input: ProgressPresentationInput,
): TrainabilityDecision | undefined => {
  if (!target) return undefined;
  const exercises = input.bundle.exercises.filter((exercise) => exercise.graphLinks.some((link) =>
    link.graphId === target.milestone.graphId && link.nodeId === target.milestone.nodeId));
  const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
  const evaluations = input.state.trainabilityEvaluations
    .filter((item) => exerciseIds.has(item.exerciseId));
  const standard = evaluations.filter((item) => item.prescriptionVariantId.endsWith("-standard"));
  if (standard.some((item) => item.decision === "allow")) return "allow";
  if (standard.some((item) => item.decision === "modify")) return "modify";
  if (evaluations.some((item) => item.decision === "allow" || item.decision === "modify")) return "modify";
  return evaluations.length ? "block" : undefined;
};

const restrictionDecision = (
  graphId: GraphId,
  input: ProgressPresentationInput,
): TrainabilityDecision | undefined => {
  const domains = familyDemandDomains(graphId, input.bundle);
  const decisions = input.state.activeRestrictions
    .filter((restriction) => restriction.demandDomains.some((domain) => domains.has(domain)))
    .map((restriction) => restriction.decision);
  return decisions.includes("block") ? "block"
    : decisions.includes("modify") ? "modify" : undefined;
};

const availabilityFor = (
  graph: DevelopmentGraph,
  current: DemonstratedStatePresentation,
  confidence: ConfidencePresentation,
  target: TargetPresentation | undefined,
  input: ProgressPresentationInput,
): AvailabilityPresentation => {
  // Availability is a family-level athlete-facing concept. A candidate exercise
  // can be blocked simply because its prerequisites are not established yet;
  // presenting that ordinary progression gate as a current restriction is both
  // inaccurate and needlessly alarming. Only an active restriction can make the
  // family "Currently restricted". Other target blocks remain explained by the
  // target/prerequisite presentation and the planner's safe fallback.
  const restriction = restrictionDecision(graph.id, input);
  if (restriction === "block") return {
    state: "restricted",
    label: "Currently restricted",
    message: current.kind === "demonstrated"
      ? "Your achievement is maintained. Current training is paused for the affected demand."
      : "Current training is paused for the affected demand while the restriction is active.",
  };
  const targetDecision = targetTrainability(target, input);
  if (restriction === "modify" || targetDecision === "modify") return {
    state: "modified",
    label: "Available with changes",
    message: current.kind === "demonstrated"
      ? "Your achievement is maintained. Today’s range, assistance or dose will be adjusted."
      : "Today’s range, assistance or dose will be adjusted.",
  };
  if (confidence.state === "check-needed" || confidence.state === "conflicting-evidence") return {
    state: "reconfirmation",
    label: "Reconfirmation due",
    message: "Your history is preserved; a short current check should come before harder work.",
  };
  return {
    state: "available",
    label: "Available",
    message: target?.state === "needs-prerequisites"
      ? "Safe prerequisite work is available now."
      : "Current evidence and restrictions allow appropriate work in this family.",
  };
};

const recommendedFocusFor = (
  graph: DevelopmentGraph,
  target: TargetPresentation | undefined,
  availability: AvailabilityPresentation,
  input: ProgressPresentationInput,
): RecommendedFocusPresentation => {
  if (availability.state === "restricted") return {
    kind: "restricted",
    label: "Respect the current restriction",
    message: "Keep the achievement in history and use only unaffected training until reconfirmation is appropriate.",
  };
  if (availability.state === "reconfirmation") return {
    kind: "reconfirm",
    label: "Reconfirm before progressing",
    message: target ? `Use a short guided check for ${target.label}.` : "Use a short guided check before harder work.",
  };
  const emphasis = emphasisForGraph(input, graph.id);
  if (emphasis) return {
    kind: emphasis.role,
    label: emphasis.role === "primary"
      ? "Primary focus"
      : emphasis.role === "secondary"
        ? "Compatible secondary focus"
      : "Maintenance",
    message: emphasis.focus.userMessage,
  };
  if (input.state.recommendedEmphasis?.primaryGraphId === graph.id) return {
    kind: "primary",
    label: "Recommended primary focus",
    message: target
      ? `${target.label} is the current useful frontier for this goal.`
      : `${presentationFamilyLabel(graph)} is the current recommended family.`,
  };
  if (input.state.recommendedEmphasis?.secondaryGraphId === graph.id) return {
    kind: "secondary",
    label: "Recommended secondary focus",
    message: target
      ? `${target.label} can support the current primary focus without replacing it.`
      : `${presentationFamilyLabel(graph)} can support the current primary focus.`,
  };
  if (target) return {
    kind: "build",
    label: target.state === "achievable" ? "Recommended next step" : "Build the prerequisites",
    message: target.state === "achievable"
      ? `Develop ${target.label} when it fits today’s session.`
      : `Continue the safe steps that lead to ${target.label}.`,
  };
  return {
    kind: "build",
    label: "Maintain the family",
    message: `Keep ${presentationFamilyLabel(graph)} available with occasional quality practice.`,
  };
};

const familySummary = (
  graph: DevelopmentGraph,
  input: ProgressPresentationInput,
): SkillFamilySummaryPresentation => {
  const demonstratedState = demonstratedStatePresentation(graph, input.state, input.provenance);
  const selected = demonstratedState.milestone
    ? stateFor(input.state, demonstratedState.milestone)
    : undefined;
  const confidence = confidencePresentation(selected);
  const nextTarget = nextTargetFor(graph, input);
  const targetNode = nextTarget ? nodeFor(input.bundle, nextTarget.milestone) : undefined;
  const prerequisites = prerequisitesFor(targetNode, input.bundle, input.state);
  const availability = availabilityFor(graph, demonstratedState, confidence, nextTarget, input);
  return {
    graphId: graph.id,
    label: presentationFamilyLabel(graph),
    description: graph.description,
    demonstratedState,
    confidence,
    availability,
    ...(nextTarget ? { nextTarget } : {}),
    prerequisites,
    recommendedFocus: recommendedFocusFor(graph, nextTarget, availability, input),
    action: { kind: "open-skill-detail", label: `View ${presentationFamilyLabel(graph)}`, graphId: graph.id },
  };
};

const assertProgressInput = (input: ProgressPresentationInput): void => {
  if (input.state.athleteId !== input.intent.athleteId) {
    throw new TypeError("Progress & Goals state and Athlete Intent belong to different athletes");
  }
};

export const buildProgressAndGoals = (
  input: ProgressPresentationInput,
): ProgressAndGoalsPresentation => {
  assertProgressInput(input);
  const families = familyOrder.map((graphId) => familySummary(graphFor(input.bundle, graphId), input));
  return {
    title: "Progress & Goals",
    intro: "See what you have demonstrated, what you are developing and the safest useful step ahead.",
    families,
    authorityNotice: "Choose the goals that matter to you. Current evidence, prerequisites and restrictions decide which progression is safe today.",
    canManuallyClaimSkills: false,
    exposesInternalScores: false,
  };
};

const demonstratedMilestonesFor = (
  graph: DevelopmentGraph,
  state: DerivedAthleteState,
): SkillDetailPresentation["demonstratedMilestones"] => state.nodeStates
  .filter((finding) => finding.milestone.graphId === graph.id
    && (finding.lifecycle === "demonstrated" || finding.lifecycle === "established"))
  .flatMap((finding) => {
    const node = graph.nodes.find((candidate) => candidate.id === finding.milestone.nodeId);
    return node ? [{
      milestone: finding.milestone,
      label: node.label,
      confidence: confidencePresentation(finding),
    }] : [];
  });

export const buildSkillDetail = (
  input: ProgressPresentationInput,
  graphId: GraphId,
): SkillDetailPresentation => {
  assertProgressInput(input);
  const graph = graphFor(input.bundle, graphId);
  const summary = familySummary(graph, input);
  const unmet = summary.prerequisites.filter((item) => item.state !== "met");
  const unmetRequired = unmet.filter((item) => item.requirement === "required");
  const oneOf = summary.prerequisites.filter((item) => item.requirement === "one-of");
  const oneOfUnmet = oneOf.length > 0 && !oneOf.some((item) => item.state === "met");
  const whyParts = [
    ...(unmetRequired.length ? [unmetRequired.length === 1
      ? `${unmetRequired[0].label} is not currently confirmed.`
      : `${unmetRequired.map((item) => item.label).join(", ")} are not all currently confirmed.`] : []),
    ...(oneOfUnmet ? [`One of ${oneOf.map((item) => item.label).join(" or ")} must be current.`] : []),
  ];
  const nextTargetProtocolIds = summary.nextTarget
    ? nodeFor(input.bundle, summary.nextTarget.milestone)?.benchmarkProtocolIds ?? []
    : [];
  const needsReconfirmation = summary.availability.state === "reconfirmation";
  const currentProtocolIds = summary.demonstratedState.milestone
    ? nodeFor(input.bundle, summary.demonstratedState.milestone)?.benchmarkProtocolIds ?? []
    : [];
  const protocolIds = needsReconfirmation ? currentProtocolIds : nextTargetProtocolIds;
  const targetCanBeChecked = summary.nextTarget?.state === "achievable"
    || summary.nextTarget?.state === "developing"
    || summary.nextTarget?.state === "reconfirmation";
  return {
    ...summary,
    title: presentationFamilyLabel(graph),
    currentLabel: summary.demonstratedState.label,
    nextLabel: summary.nextTarget?.label ?? "Maintain your current work",
    requiresLabel: "Requires",
    ...(whyParts.length ? { whyNotYet: whyParts.join(" ") } : {}),
    demonstratedMilestones: demonstratedMilestonesFor(graph, input.state),
    assessmentAction: {
      kind: needsReconfirmation
        ? "start-reconfirmation"
        : targetCanBeChecked && protocolIds.length
          ? "start-guided-test"
          : "reassess",
      label: needsReconfirmation
        ? "Reconfirm current ability"
        : targetCanBeChecked && protocolIds.length
          ? "Check this next step"
          : "Review the required starting points",
      graphId,
      protocolIds: needsReconfirmation || targetCanBeChecked ? protocolIds : [],
    },
  };
};

export const presentationFamilyOrder = familyOrder;
