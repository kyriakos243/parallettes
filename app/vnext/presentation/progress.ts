import type {
  BenchmarkSubject,
  BenchmarkProtocol,
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
  type RoadmapBenchmark,
  type RoadmapNode,
  type SkillRoadmapPresentation,
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

export const presentationFamilyDescription = (graph: DevelopmentGraph): string =>
  graph.id === graphIds.planche
    ? "Build straight-arm leaning strength toward stable tuck and advanced planche holds."
    : graph.id === graphIds.lSitVSit
      ? "Build support and compression for longer L-sits and higher V-sit shapes."
      : graph.id === graphIds.handstandBalance
        ? "Develop safe entries, a strong line, balance control and confident exits."
        : graph.id === graphIds.verticalPushHspu
          ? "Build overhead pressing from pike work toward controlled handstand push-ups."
          : graph.id === graphIds.pressToHandstand
            ? "Develop the compression, support and control needed to press into handstand."
            : graph.id === graphIds.parallettePushing
              ? "Build strong, controlled parallette push-ups through a useful range."
              : "Connect established positions smoothly and under control.";

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
    state: "confirmation-building",
    label: "Confirmation in progress",
    message: "A clean result is saved. Complete the remaining confirmation checks before progressing.",
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
      ? finding.lifecycle === "demonstrated"
        ? "Demonstrated; confirmation is still in progress."
        : "Demonstrated with current supporting evidence."
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
  const stillNeedsWork = (milestone: MilestoneRef): boolean => {
    const finding = stateFor(input.state, milestone);
    return !finding || !strongerEvidenceSatisfies(finding, input.state);
  };
  const eligible = input.state.eligibleTargets
    .filter((candidate) => candidate.milestone.graphId === graph.id && stillNeedsWork(candidate.milestone))
    .map((candidate) => candidate.milestone);
  const working = input.state.workingNodes
    .filter((candidate) => candidate.milestone.graphId === graph.id && stillNeedsWork(candidate.milestone))
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
      && !(finding && strongerEvidenceSatisfies(finding, input.state))
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
  if (confidence.state === "confirmation-building") return {
    state: "confirmation",
    label: "Confirmation in progress",
    message: confidence.message,
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
  if (availability.state === "confirmation") return {
    kind: "confirm",
    label: "Complete confirmation",
    message: availability.message,
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
  let confidence = confidencePresentation(selected);
  if (confidence.state === "confirmation-building" && selected) {
    const protocols = nodeFor(input.bundle, selected.milestone)?.benchmarkProtocolIds
      .flatMap((id) => input.bundle.benchmarkProtocols.find((protocol) => protocol.id === id) ?? []) ?? [];
    const standards = protocols.map((protocol) => {
      const { qualifyingObservations: results, minimumDistinctSessions: occasions } = protocol.confirmation;
      return `${protocol.label}: ${results} qualifying ${results === 1 ? "result" : "results"} across at least ${occasions} ${occasions === 1 ? "training occasion" : "separate training occasions"}.`;
    });
    confidence = { ...confidence, message: `A clean result is saved. Complete the required confirmation before harder work.${standards.length ? ` ${standards.join(" ")}` : ""}` };
  }
  const projectedNextTarget = nextTargetFor(graph, input);
  const nextTarget = projectedNextTarget
    && demonstratedState.kind === "provisional"
    && demonstratedState.milestone
    && milestoneKey(demonstratedState.milestone) === milestoneKey(projectedNextTarget.milestone)
    ? {
      ...projectedNextTarget,
      label: `Confirm ${projectedNextTarget.label}`,
      message: "This placement estimate is useful for training, but the approved guided evidence is still needed before it counts as demonstrated.",
    }
    : projectedNextTarget;
  const targetNode = nextTarget ? nodeFor(input.bundle, nextTarget.milestone) : undefined;
  const prerequisites = prerequisitesFor(targetNode, input.bundle, input.state);
  const availability = availabilityFor(graph, demonstratedState, confidence, nextTarget, input);
  return {
    graphId: graph.id,
    label: presentationFamilyLabel(graph),
    description: presentationFamilyDescription(graph),
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

const roadmapBenchmark = (protocol: BenchmarkProtocol): RoadmapBenchmark => {
  const metric = protocol.metric;
  const target = metric.kind === "duration-seconds" ? `Hold for at least ${metric.minimum} seconds`
    : metric.kind === "repetitions" ? `Complete at least ${metric.minimum} clean repetitions`
      : metric.kind === "successful-attempts"
        ? `${metric.minimumSuccessful} successful attempts within ${metric.maximumAttempts} attempts`
        : metric.description;
  const { qualifyingObservations, minimumDistinctSessions } = protocol.confirmation;
  return {
    label: protocol.label,
    target,
    conditions: `Equipment: ${protocol.conditions.equipment.join(", ")}. ${protocol.conditions.assistance} ${protocol.conditions.range}`,
    confirmation: `${qualifyingObservations} qualifying ${qualifyingObservations === 1 ? "result" : "results"} across at least ${minimumDistinctSessions} ${minimumDistinctSessions === 1 ? "session" : "separate sessions"}, recorded through supported training or a guided check.`,
    quality: protocol.qualityCriteria,
    safety: protocol.safetyCriteria,
  };
};

/** A read-only map of the actual definition graph, never a second progression policy. */
const skillRoadmap = (
  graph: DevelopmentGraph,
  summary: SkillFamilySummaryPresentation,
  input: ProgressPresentationInput,
): SkillRoadmapPresentation => {
  const nodes: RoadmapNode[] = graph.nodes.map((node) => {
    const milestone = { graphId: graph.id, nodeId: node.id };
    const finding = stateFor(input.state, milestone);
    const covered = Boolean(finding && strongerEvidenceSatisfies(finding, input.state));
    const evidence: RoadmapNode["evidence"] = finding?.lifecycle === "established" ? "confirmed"
      : finding?.lifecycle === "demonstrated" ? "demonstrated"
        : covered ? "covered"
          : finding?.lifecycle === "developing" ? "developing"
            : finding?.lifecycle === "estimated" ? "estimated" : "unknown";
    const labels: Record<RoadmapNode["evidence"], string> = {
      confirmed: "Confirmed", demonstrated: "Demonstrated", developing: "Developing",
      estimated: "Starting estimate", covered: "Covered by a higher skill", unknown: "Not demonstrated yet",
    };
    const messages: Record<RoadmapNode["evidence"], string> = {
      confirmed: "You have met this milestone’s confirmation requirements. Your achievement stays in your history.",
      demonstrated: "You have demonstrated this skill. More qualifying evidence is needed before it unlocks further progression.",
      developing: "You have begun working on this skill. Practice alone does not yet confirm the milestone.",
      estimated: `${sourceKindFor(finding?.supportingObservationRefs ?? [], input.provenance)}. A qualifying result is still needed to demonstrate this skill.`,
      covered: "Current evidence of a higher skill satisfies this requirement. This earlier skill is not counted as a separate achievement.",
      unknown: "There is no recorded demonstration of this milestone yet.",
    };
    const requirements = prerequisitesFor(node, input.bundle, input.state).map((item) => {
      const subject = subjectForRef(item.ref, input.bundle);
      const linkedGraph = subject?.kind === "milestone"
        ? input.bundle.graphs.find((candidate) => candidate.id === subject.milestone.graphId) : undefined;
      const prerequisiteFinding = subject?.kind === "milestone" ? stateFor(input.state, subject.milestone) : undefined;
      const inferred = prerequisiteFinding && strongerEvidenceSatisfies(prerequisiteFinding, input.state)
        && !(prerequisiteFinding.lifecycle === "established" && prerequisiteFinding.confidence === "current");
      const capacityProtocols = subject?.kind === "capacity-facet"
        ? input.bundle.capacities.find((capacity) => capacity.id === subject.capacity.capacityId)
          ?.facets.find((facet) => facet.id === subject.capacity.facetId)?.benchmarkProtocolIds ?? [] : [];
      return {
        ...item,
        ...(inferred ? { message: "Satisfied by current evidence of a higher skill; your recorded achievements are preserved." } : {}),
        ...(subject?.kind === "milestone" ? { milestone: subject.milestone } : {}),
        ...(linkedGraph ? { familyLabel: presentationFamilyLabel(linkedGraph) } : {}),
        ...(capacityProtocols.length ? { benchmarks: capacityProtocols.flatMap((id) => {
          const protocol = input.bundle.benchmarkProtocols.find((candidate) => candidate.id === id);
          return protocol ? [roadmapBenchmark(protocol)] : [];
        }) } : {}),
      };
    });
    const evaluation = targetTrainability({ milestone, label: node.label, state: "developing", message: "" }, input);
    const specialist = node.programmingBoundary === "specialist";
    return {
      id: node.id, label: node.label, description: node.description,
      branch: graph.branches.find((branch) => branch.id === node.branchId)?.label ?? graph.label,
      tier: node.progressionTier === "foundation" ? "Foundation"
        : node.progressionTier === "intermediate" ? "Building skill"
          : node.progressionTier === "advanced" ? "Advanced" : "Optional specialist",
      specialist, branchGoal: false, evidence, evidenceLabel: labels[evidence],
      evidenceMessage: covered && (evidence === "confirmed" || evidence === "demonstrated")
        ? "Your demonstration stays in your history. Current evidence of a higher skill already satisfies this requirement for progression."
        : messages[evidence],
      recheck: Boolean(!covered && finding && (evidence === "confirmed" || evidence === "demonstrated") && finding.confidence !== "current"),
      current: !covered && input.state.workingNodes.some((working) => milestoneKey(working.milestone) === milestoneKey(milestone)),
      next: summary.nextTarget?.milestone.nodeId === node.id,
      requirements,
      benchmarks: node.benchmarkProtocolIds.flatMap((id) => {
        const protocol = input.bundle.benchmarkProtocols.find((candidate) => candidate.id === id);
        return protocol ? [roadmapBenchmark(protocol)] : [];
      }),
      trainingNote: node.implementationStatus !== "available" ? "Training content for this destination is not available yet."
        : specialist && !input.intent.preferences.specialistOptIn
          ? "Optional specialist destination. Requires a separate opt-in and all supporting skills; viewing it does not add it to your workouts."
          : evaluation === "block" ? "This movement is not available for training now. Today’s plan uses your current requirements and restrictions."
            : evaluation === "modify" ? "Today’s training needs an adjusted variation, range or dose."
              : "Today’s plan checks current skills, equipment and restrictions before offering this movement.",
    };
  });
  const edges: SkillRoadmapPresentation["edges"][number][] = nodes.flatMap((node) => node.requirements.flatMap((requirement) =>
    requirement.milestone?.graphId === graph.id
      ? [{ from: requirement.milestone.nodeId, to: node.id, requirement: requirement.requirement }] : []));
  const depth = new Map<RoadmapNode["id"], number>();
  const visiting = new Set<RoadmapNode["id"]>();
  const nodeDepth = (id: RoadmapNode["id"]): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new TypeError("Skill roadmap requires an acyclic definition graph");
    visiting.add(id);
    const parents = edges.filter((edge) => edge.to === id);
    const value = parents.length ? Math.max(...parents.map((edge) => nodeDepth(edge.from))) + 1 : 0;
    depth.set(id, value);
    visiting.delete(id);
    return value;
  };
  nodes.forEach((node) => nodeDepth(node.id));
  const levels = Array.from({ length: Math.max(0, ...depth.values()) + 1 }, (_, index) =>
    nodes.filter((node) => depth.get(node.id) === index).map((node) => node.id));
  const priority = input.intent.goals.find((goal) => goal.graphId === graph.id)?.priority;
  return {
    graphId: graph.id, label: presentationFamilyLabel(graph),
    ...(priority === "primary" || priority === "secondary" ? { priority } : {}),
    nodes: nodes.map((node) => ({ ...node, branchGoal: node.tier === "Advanced" && !node.specialist && !edges.some((edge) =>
      edge.from === node.id && !nodes.find((candidate) => candidate.id === edge.to)?.specialist) })),
    edges, levels,
    currentSummary: summary.demonstratedState.kind === "none" ? "Your starting point is still to be confirmed."
      : `${summary.demonstratedState.kind === "provisional" ? "Starting estimate" : "Demonstrated"}: ${summary.demonstratedState.label}`,
    nextSummary: summary.nextTarget?.label ?? "Maintain your confirmed skills",
    availability: summary.availability,
  };
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
    roadmaps: families.map((family) => skillRoadmap(graphFor(input.bundle, family.graphId), family, input)),
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
  const needsConfirmation = summary.confidence.state === "confirmation-building";
  const currentProtocolIds = summary.demonstratedState.milestone
    ? nodeFor(input.bundle, summary.demonstratedState.milestone)?.benchmarkProtocolIds ?? []
    : [];
  const protocolIds = needsReconfirmation || needsConfirmation ? currentProtocolIds : nextTargetProtocolIds;
  const targetCanBeChecked = needsConfirmation || summary.nextTarget?.state === "achievable"
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
          ? needsConfirmation ? "Complete confirmation" : "Check this next step"
          : "Review the required starting points",
      graphId,
      protocolIds: needsReconfirmation || targetCanBeChecked ? protocolIds : [],
    },
  };
};

export const presentationFamilyOrder = familyOrder;
