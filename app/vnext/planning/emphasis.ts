import {
  type AthleteGoal,
  type BenchmarkProtocol,
  type DefinitionBundle,
  type DevelopmentGraph,
  type DevelopmentNode,
  type DemandProfile,
  type GraphId,
  type MilestoneRef,
  type PrerequisiteRef,
  type ReasonCode,
} from "../contracts";
import { evaluateTrainability, milestoneKey as projectionMilestoneKey, projectionReasonCodes } from "../projection";
import type {
  EmphasisFocus,
  EmphasisPlan,
  GenerateSessionInput,
  GeneratorPolicy,
  PlanningIssue,
} from "./contracts";
import { planningReasonCodes, vNextGeneratorPolicy } from "./policy";
import {
  milestoneIsSatisfied,
  resolvePrerequisiteActions,
  selectedUnsatisfiedPrerequisites,
} from "./prerequisites";
import {
  demandsOverlapAtHigh,
  mergeDemandProfiles,
  seededOrder,
  uniqueReasons,
} from "./utils";
import { usableDevelopmentVariant } from "./usableVariant";

type FocusResolution = Readonly<{
  focus: EmphasisFocus;
  demand: DemandProfile;
  trainable: boolean;
  recentlyExposed: boolean;
  /** Goal-trust planning only: the family has stale or contradicted findings. */
  hasStaleCandidate?: boolean;
  /** Goal-trust planning only: unusable today solely because of recent high load. */
  blockedByRecentLoad?: boolean;
}>;

type EmphasisResult = Readonly<{
  emphasis?: EmphasisPlan;
  issues: readonly PlanningIssue[];
}>;

const milestonePrerequisites = (node: DevelopmentNode): readonly MilestoneRef[] => [
  ...(node.prerequisiteRule?.allOf ?? []),
  ...(node.prerequisiteRule?.anyOf ?? []),
].flatMap((ref) => ref.kind === "milestone" ? [ref.milestone] : []);

const graphNodeMap = (bundle: DefinitionBundle): ReadonlyMap<string, DevelopmentNode> =>
  new Map(bundle.graphs.flatMap((graph) => graph.nodes.map((node) => [
    projectionMilestoneKey({ graphId: graph.id, nodeId: node.id }), node,
  ] as const)));

const isAncestorOf = (
  candidate: MilestoneRef,
  target: MilestoneRef,
  nodes: ReadonlyMap<string, DevelopmentNode>,
  visiting = new Set<string>(),
): boolean => {
  const candidateKey = projectionMilestoneKey(candidate);
  const targetKey = projectionMilestoneKey(target);
  if (candidateKey === targetKey) return true;
  if (visiting.has(targetKey)) return false;
  visiting.add(targetKey);
  const node = nodes.get(targetKey);
  const result = node?.prerequisiteRule !== undefined
    && milestonePrerequisites(node).some((parent) => isAncestorOf(candidate, parent, nodes, visiting));
  visiting.delete(targetKey);
  return result;
};

const goalSignature = (input: GenerateSessionInput): string => {
  const goals = input.intent.goals
    .map((goal) => `${goal.priority}:${goal.graphId}:${goal.targetNodeId ?? "*"}`)
    .sort()
    .join("|");
  const override = input.intent.emphasisOverride
    ? `${input.intent.emphasisOverride.primaryGraphId}:${input.intent.emphasisOverride.secondaryGraphId ?? ""}`
    : "none";
  return `${override}|${goals}`;
};

const exactProtocolFor = (
  bundle: DefinitionBundle,
  milestone: MilestoneRef,
): BenchmarkProtocol | undefined => {
  const graph = bundle.graphs.find((candidate) => candidate.id === milestone.graphId);
  const node = graph?.nodes.find((candidate) => candidate.id === milestone.nodeId);
  return node?.benchmarkProtocolIds
    .map((id) => bundle.benchmarkProtocols.find((protocol) => protocol.id === id
      && protocol.subject.kind === "milestone"
      && projectionMilestoneKey(protocol.subject.milestone) === projectionMilestoneKey(milestone)))
    .find((protocol): protocol is BenchmarkProtocol => protocol !== undefined);
};

const protocolDemand = (
  protocol: BenchmarkProtocol,
  input: GenerateSessionInput,
  development = false,
): Readonly<{ demand: DemandProfile; trainable: boolean; blockedByRecentLoad?: boolean }> | undefined => {
  const exercise = input.bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === protocol.prescriptionVariantId)
    ?? exercise?.prescriptionVariants[0];
  if (!exercise || !variant) return undefined;
  const evaluate = (variantId: string) => evaluateTrainability({
    request: {
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: variantId as typeof variant.id,
    },
    state: input.state,
    bundle: input.bundle,
    asOf: input.state.asOf,
    policy: input.projectionPolicy,
    intent: input.intent,
  });
  const evaluation = evaluate(variant.id);
  if (!input.goalContinuity || !development) return { demand: variant.demand, trainable: evaluation.decision !== "block" };
  // Goal-trust planning applies the composer's own usability gate (recent high
  // load, post-clearance, restriction regressions), so a family is never chosen
  // for work the composer must refuse and replace with an unscoped drill.
  const demand = input.sessionDemand ?? input.intent.defaultSessionDemand;
  const variants = exercise.prescriptionVariants.filter((candidate) => candidate.id === variant.id
    || (demand !== "challenge" && candidate.id.endsWith("-regressed")));
  const evaluations = variants.map((candidate) => ({ candidate,
    evaluation: candidate.id === variant.id ? evaluation : evaluate(candidate.id) }));
  const trainable = evaluations.some((entry) => usableDevelopmentVariant(entry.candidate, entry.evaluation, demand));
  // Distinguish "rest after recent demanding work" from restrictions or prerequisites.
  const withoutRecentLoad = (entry: (typeof evaluations)[number]) => ({ ...entry.evaluation,
    reasonCodes: entry.evaluation.reasonCodes.filter((code) => code !== projectionReasonCodes.recentHighLoad) });
  return {
    demand: variant.demand,
    trainable,
    blockedByRecentLoad: !trainable && evaluations.some((entry) =>
      entry.evaluation.reasonCodes.includes(projectionReasonCodes.recentHighLoad)
      && usableDevelopmentVariant(entry.candidate, withoutRecentLoad(entry), demand)),
  };
};

const capacityProtocolFor = (
  ref: PrerequisiteRef,
  input: GenerateSessionInput,
): BenchmarkProtocol | undefined => {
  if (ref.kind === "benchmark") {
    return input.bundle.benchmarkProtocols.find((candidate) => candidate.id === ref.benchmarkProtocolId);
  }
  if (ref.kind !== "capacity-facet") return undefined;
  const capacity = input.bundle.capacities.find((candidate) => candidate.id === ref.capacity.capacityId);
  const facet = capacity?.facets.find((candidate) => candidate.id === ref.capacity.facetId);
  return facet?.benchmarkProtocolIds
    .map((id) => input.bundle.benchmarkProtocols.find((candidate) => candidate.id === id))
    .find((candidate): candidate is BenchmarkProtocol => candidate !== undefined);
};

const nativeRecentHighOverlap = (demand: DemandProfile, input: GenerateSessionInput, policy: GeneratorPolicy): boolean =>
  demandsOverlapAtHigh(demand, input.state.recentLoad.demand, policy.highUpperLimbDomains);

/**
 * Goal-trust planning defers a declared goal only after consecutive-day
 * training. 36 hours separates daily sessions (about 12–36 h apart) from
 * every-other-day sessions (about 36–60 h) regardless of time of day. This is
 * a product scheduling rule, not a recovery threshold: the existing 48-hour
 * high-load rule still reduces a matching prescription's dose. The seven-day
 * merged profile remains for native replay only.
 */
const GOAL_TRUST_DEFERRAL_HOURS = 36;
const recentHighOverlap = (demand: DemandProfile, input: GenerateSessionInput, policy: GeneratorPolicy): boolean => {
  if (!input.goalContinuity) return nativeRecentHighOverlap(demand, input, policy);
  const asOf = Date.parse(input.state.asOf);
  const windowMs = GOAL_TRUST_DEFERRAL_HOURS * 3_600_000;
  return input.state.recentLoad.exposures.some((exposure) => {
    const occurred = Date.parse(exposure.occurredAt);
    return occurred > asOf - windowMs && occurred <= asOf
      && demandsOverlapAtHigh(demand, exposure.demand, policy.highUpperLimbDomains);
  });
};

const focusUserMessage = (
  graph: DevelopmentGraph,
  node: DevelopmentNode | undefined,
  kind: EmphasisFocus["kind"],
): string => {
  if (kind === "reconfirmation") return `Reconfirm ${node?.label ?? graph.label} before pushing it harder.`;
  if (kind === "prerequisite-development") return `Build the prerequisites that unlock ${node?.label ?? graph.label}.`;
  if (kind === "maintenance") return `Keep ${node?.label ?? graph.label} available with a small quality dose.`;
  return `Develop ${node?.label ?? graph.label} with the next safe step.`;
};

const resolveGraphFocus = (
  graph: DevelopmentGraph,
  goal: AthleteGoal | undefined,
  input: GenerateSessionInput,
  policy: GeneratorPolicy,
): FocusResolution => {
  const nodeMap = graphNodeMap(input.bundle);
  const explicitTarget = goal?.targetNodeId
    ? { graphId: graph.id, nodeId: goal.targetNodeId }
    : undefined;
  const pathEligible = (milestone: MilestoneRef): boolean =>
    !explicitTarget || isAncestorOf(milestone, explicitTarget, nodeMap);
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index] as const));
  const developmentRank = (milestone: MilestoneRef): number => {
    if (!input.preferUnfinishedTargets) return 0;
    const protocol = exactProtocolFor(input.bundle, milestone);
    const exercise = input.bundle.exercises.find((item) => item.id === protocol?.exerciseId);
    const finding = input.state.nodeStates.find((item) =>
      projectionMilestoneKey(item.milestone) === projectionMilestoneKey(milestone));
    const reconfirming = finding?.confidence === "stale" || finding?.confidence === "contradicted";
    const demand = input.sessionDemand ?? input.intent.defaultSessionDemand;
    const variants = exercise?.prescriptionVariants.filter((variant) =>
      variant.id === protocol?.prescriptionVariantId
      || (!reconfirming && demand !== "challenge" && variant.id.endsWith("-regressed"))) ?? [];
    const usable = exercise && variants.some((variant) => usableDevelopmentVariant(variant,
      evaluateTrainability({
        request: { exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion,
          prescriptionVariantId: variant.id },
        state: input.state, bundle: input.bundle, asOf: input.state.asOf,
        policy: input.projectionPolicy, intent: input.intent,
      }), demand));
    // Prefer the next usable milestone. Keep a useful established fallback when
    // the next step is unavailable; never reinterpret practice as achievement.
    return (usable ? 0 : 2) + Number(milestoneIsSatisfied(milestone, input));
  };
  const developmentRanks = new Map<string, number>();
  const rank = (milestone: MilestoneRef): number => {
    const key = projectionMilestoneKey(milestone);
    if (!developmentRanks.has(key)) developmentRanks.set(key, developmentRank(milestone));
    return developmentRanks.get(key)!;
  };
  const candidates = [
    ...input.state.workingNodes.map((item) => ({ item, sourceRank: 0 })),
    ...input.state.eligibleTargets.map((item) => ({ item, sourceRank: 1 })),
    ...input.state.nodeStates
      // Goal-trust planning also considers every stale/contradicted established
      // node, so the earliest reconfirmable step is reachable when a deeper
      // stale step is blocked by its own out-of-date safety prerequisite.
      .filter((state) => state.lifecycle === "established" && (state.confidence === "current"
        || (input.goalContinuity && (state.confidence === "stale" || state.confidence === "contradicted"))))
      .map((state) => ({
        item: { milestone: state.milestone, reasonCodes: state.reasonCodes },
        sourceRank: 2,
      })),
  ].filter(({ item }) => item.milestone.graphId === graph.id && pathEligible(item.milestone))
    .filter(({ item }) => {
      const node = graph.nodes.find((candidate) => candidate.id === item.milestone.nodeId);
      if (!node || node.implementationStatus !== "available") return false;
      if (node.programmingBoundary !== "specialist") return true;
      return input.intent.preferences.specialistOptIn && goal?.targetNodeId === node.id;
    })
    .filter(({ item }) => {
      const state = input.state.nodeStates.find((candidate) =>
        projectionMilestoneKey(candidate.milestone) === projectionMilestoneKey(item.milestone));
      return !(state?.satisfiedForEligibilityBy.length && state.lifecycle === "unknown");
    })
    .sort((left, right) => {
      const leftState = input.state.nodeStates.find((candidate) =>
        projectionMilestoneKey(candidate.milestone) === projectionMilestoneKey(left.item.milestone));
      const rightState = input.state.nodeStates.find((candidate) =>
        projectionMilestoneKey(candidate.milestone) === projectionMilestoneKey(right.item.milestone));
      const leftReconfirm = leftState?.confidence === "stale" || leftState?.confidence === "contradicted" ? 0 : 1;
      const rightReconfirm = rightState?.confidence === "stale" || rightState?.confidence === "contradicted" ? 0 : 1;
      const leftIndex = nodeIndex.get(left.item.milestone.nodeId) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = nodeIndex.get(right.item.milestone.nodeId) ?? Number.MAX_SAFE_INTEGER;
      return leftReconfirm - rightReconfirm
        || rank(left.item.milestone) - rank(right.item.milestone)
        || left.sourceRank - right.sourceRank
        || (left.sourceRank === 2 && right.sourceRank === 2
          ? rightIndex - leftIndex
          : leftIndex - rightIndex)
        || seededOrder(input.seed ?? input.createdAt, projectionMilestoneKey(left.item.milestone))
          .localeCompare(seededOrder(input.seed ?? input.createdAt, projectionMilestoneKey(right.item.milestone)))
        || projectionMilestoneKey(left.item.milestone).localeCompare(projectionMilestoneKey(right.item.milestone));
    });

  const resolveCandidate = (entry: (typeof candidates)[number]): FocusResolution | undefined => {
    const selected = entry.item.milestone;
    const selectedNode = graph.nodes.find((candidate) => candidate.id === selected.nodeId);
    if (!selectedNode) return undefined;
    const selectedState = input.state.nodeStates.find((candidate) =>
      projectionMilestoneKey(candidate.milestone) === projectionMilestoneKey(selected));
    const kind: EmphasisFocus["kind"] = selectedState?.confidence === "stale"
      || selectedState?.confidence === "contradicted"
      ? "reconfirmation"
      : "development";
    const protocol = exactProtocolFor(input.bundle, selected);
    const resolved = protocol ? protocolDemand(protocol, input, true) : undefined;
    const demand = resolved?.demand ?? {};
    return {
      focus: {
        graphId: graph.id,
        targetMilestone: selected,
        kind,
        missingPrerequisites: [],
        reasonCodes: uniqueReasons([
          kind === "reconfirmation" ? planningReasonCodes.reconfirmation : planningReasonCodes.eligibleTarget,
          ...(entry.sourceRank === 2 ? [planningReasonCodes.workingTarget] : []),
        ]),
        userMessage: focusUserMessage(graph, selectedNode, kind),
      },
      demand,
      trainable: resolved?.trainable ?? false,
      recentlyExposed: recentHighOverlap(demand, input, policy),
      ...(input.goalContinuity ? { blockedByRecentLoad: resolved?.blockedByRecentLoad ?? false } : {}),
    };
  };
  const hasStaleCandidate = input.goalContinuity
    ? candidates.some(({ item }) => {
      const state = input.state.nodeStates.find((candidate) =>
        projectionMilestoneKey(candidate.milestone) === projectionMilestoneKey(item.milestone));
      return state?.confidence === "stale" || state?.confidence === "contradicted";
    })
    : undefined;
  let candidateRestingAfterLoad = false;
  if (input.goalContinuity) {
    // A blocked stale node must not hide the whole family: try the next
    // candidate in the same priority order, ending at the earliest node.
    for (const entry of candidates) {
      const resolution = resolveCandidate(entry);
      if (resolution?.trainable) return { ...resolution, hasStaleCandidate };
      if (resolution?.blockedByRecentLoad) candidateRestingAfterLoad = true;
    }
  } else if (candidates[0]) {
    const resolution = resolveCandidate(candidates[0]);
    if (resolution) return resolution;
  }

  const desiredNode = explicitTarget
    ? graph.nodes.find((candidate) => candidate.id === explicitTarget.nodeId)
    : graph.nodes.find((candidate) => !milestoneIsSatisfied({ graphId: graph.id, nodeId: candidate.id }, input));
  const missing = desiredNode ? selectedUnsatisfiedPrerequisites(input, desiredNode) : [];
  const actions = resolvePrerequisiteActions(input, missing);
  const capacityProtocols = actions.capacities
    .map((capacity) => capacityProtocolFor({ kind: "capacity-facet", capacity }, input))
    .filter((protocol): protocol is BenchmarkProtocol => protocol !== undefined);
  const milestoneProtocols = actions.milestones
    .map((milestone) => exactProtocolFor(input.bundle, milestone))
    .filter((protocol): protocol is BenchmarkProtocol => protocol !== undefined);
  const resolved = [...milestoneProtocols, ...capacityProtocols]
    .map((protocol) => protocolDemand(protocol, input, true))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  const demand = mergeDemandProfiles(resolved.map((item) => item.demand));
  const reasons: ReasonCode[] = [planningReasonCodes.prerequisiteDevelopment];
  if (desiredNode?.implementationStatus === "missing-content") reasons.push(planningReasonCodes.missingContent);
  if (desiredNode?.programmingBoundary === "specialist"
    && (!input.intent.preferences.specialistOptIn || goal?.targetNodeId !== desiredNode.id)) {
    reasons.push(planningReasonCodes.specialistExplicitTargetRequired);
  }
  return {
    focus: {
      graphId: graph.id,
      ...(desiredNode ? { targetMilestone: { graphId: graph.id, nodeId: desiredNode.id } } : {}),
      kind: "prerequisite-development",
      missingPrerequisites: missing,
      reasonCodes: uniqueReasons(reasons),
      userMessage: focusUserMessage(graph, desiredNode, "prerequisite-development"),
    },
    demand,
    trainable: resolved.some((item) => item.trainable),
    recentlyExposed: recentHighOverlap(demand, input, policy),
    ...(input.goalContinuity ? {
      hasStaleCandidate,
      blockedByRecentLoad: !resolved.some((item) => item.trainable)
        && (candidateRestingAfterLoad || resolved.some((item) => item.blockedByRecentLoad)),
    } : {}),
  };
};

const goalsForGraph = (input: GenerateSessionInput): ReadonlyMap<GraphId, AthleteGoal> => {
  const priorityRank: Readonly<Record<AthleteGoal["priority"], number>> = {
    primary: 0,
    secondary: 1,
    interest: 2,
  };
  const map = new Map<GraphId, AthleteGoal>();
  for (const goal of [...input.intent.goals].sort((left, right) =>
    priorityRank[left.priority] - priorityRank[right.priority]
      || left.graphId.localeCompare(right.graphId)
      || (left.targetNodeId ?? "").localeCompare(right.targetNodeId ?? ""))) {
    if (!map.has(goal.graphId)) map.set(goal.graphId, goal);
  }
  return map;
};

const graphPairIncompatible = (
  left: GraphId,
  right: GraphId,
  policy: GeneratorPolicy,
): boolean => policy.incompatibleGraphPairs.some(([first, second]) =>
  (first === left && second === right) || (first === right && second === left));

const focusCompatible = (
  left: FocusResolution,
  right: FocusResolution,
  policy: GeneratorPolicy,
): boolean => {
  const leftHasHighUpperLimb = policy.highUpperLimbDomains.some((domain) =>
    left.demand[domain] === "high");
  const rightHasHighUpperLimb = policy.highUpperLimbDomains.some((domain) =>
    right.demand[domain] === "high");
  if (graphPairIncompatible(left.focus.graphId, right.focus.graphId, policy)
    && leftHasHighUpperLimb && rightHasHighUpperLimb) return false;
  return !demandsOverlapAtHigh(left.demand, right.demand, policy.highUpperLimbDomains);
};

const graphGoalPriority = (
  graphId: GraphId,
  input: GenerateSessionInput,
  goals: ReadonlyMap<GraphId, AthleteGoal>,
): number => {
  if (input.intent.emphasisOverride?.primaryGraphId === graphId) return 0;
  const goal = goals.get(graphId);
  if (goal?.priority === "primary") return 1;
  if (input.intent.emphasisOverride?.secondaryGraphId === graphId) return 2;
  if (goal?.priority === "secondary") return 3;
  if (goal?.priority === "interest") return 4;
  return 5;
};

export const planEmphasis = (
  input: GenerateSessionInput,
  policy: GeneratorPolicy = vNextGeneratorPolicy,
): EmphasisResult => {
  const issues: PlanningIssue[] = [];
  const signature = goalSignature(input);
  const goals = goalsForGraph(input);
  const requestedGraphIds = new Set<GraphId>([
    ...input.intent.goals.map((goal) => goal.graphId),
    ...(input.intent.emphasisOverride ? [
      input.intent.emphasisOverride.primaryGraphId,
      ...(input.intent.emphasisOverride.secondaryGraphId
        ? [input.intent.emphasisOverride.secondaryGraphId]
        : []),
    ] : []),
  ]);
  if (!requestedGraphIds.size) {
    const fallback = input.bundle.graphs.find((graph) => graph.kind === "foundation-track")
      ?? input.bundle.graphs[0];
    if (fallback) requestedGraphIds.add(fallback.id);
  }
  const resolutions = [...requestedGraphIds]
    .map((graphId) => {
      const graph = input.bundle.graphs.find((candidate) => candidate.id === graphId);
      return graph ? resolveGraphFocus(graph, goals.get(graphId), input, policy) : undefined;
    })
    .filter((item): item is FocusResolution => item !== undefined);

  if (!resolutions.length) {
    issues.push({
      severity: "error",
      code: planningReasonCodes.invalidInput,
      message: "Athlete Intent does not reference a graph in the selected definition bundle.",
    });
    return { issues };
  }

  const previous = input.previousEmphasis;
  const samePrevious = previous !== undefined
    && previous.generatorPolicyId === policy.id
    && previous.generatorPolicyVersion === policy.version
    && previous.goalSignature === signature;
  const retainPreviousBase = samePrevious
    && previous.completedEligibleSessions < policy.emphasisReviewMinimumSessions;
  const priorityOf = (resolution: FocusResolution): number =>
    graphGoalPriority(resolution.focus.graphId, input, goals);
  const seededTieBreak = (left: FocusResolution, right: FocusResolution): number =>
    seededOrder(input.seed ?? input.createdAt, left.focus.graphId)
      .localeCompare(seededOrder(input.seed ?? input.createdAt, right.focus.graphId))
    || left.focus.graphId.localeCompare(right.focus.graphId);

  let sorted: FocusResolution[];
  let primary: FocusResolution | undefined;
  let previousResolution: FocusResolution | undefined;
  let reviewDue = false;
  let declaredDeferred = false;
  if (input.goalContinuity) {
    // Declared priority leads; recent exposure only breaks ties between equals.
    sorted = [...resolutions].sort((left, right) =>
      Number(right.trainable) - Number(left.trainable)
      || priorityOf(left) - priorityOf(right)
      || Number(left.recentlyExposed) - Number(right.recentlyExposed)
      || seededTieBreak(left, right));
    reviewDue = samePrevious && previous.completedEligibleSessions >= policy.emphasisReviewMinimumSessions;
    const top = sorted[0];
    const alternative = top?.trainable && top.recentlyExposed
      ? sorted.find((candidate) => candidate !== top && candidate.trainable && !candidate.recentlyExposed)
      : undefined;
    // Defer a goal trained within the 36-hour deferral window at most once in a row:
    // if the last counted sample already led with another family, lead with it now.
    const previousAlreadyDeferred = samePrevious && top !== undefined && previous.primaryGraphId !== top.focus.graphId;
    declaredDeferred = alternative !== undefined && !previousAlreadyDeferred;
    const chosen = declaredDeferred ? alternative : top;
    const retainable = retainPreviousBase
      ? resolutions.find((item) => item.focus.graphId === previous.primaryGraphId && item.trainable && !item.recentlyExposed)
      : undefined;
    // Stability between equally prioritised families during the sample only.
    previousResolution = retainable && chosen && !declaredDeferred
      && (retainable === chosen || priorityOf(retainable) === priorityOf(chosen))
      ? retainable
      : undefined;
    primary = previousResolution ?? chosen;
  } else {
    const previousCandidate = retainPreviousBase
      ? resolutions.find((item) => item.focus.graphId === previous.primaryGraphId && item.trainable)
      : undefined;
    previousResolution = previousCandidate?.recentlyExposed
      && resolutions.some((item) => item !== previousCandidate && item.trainable && !item.recentlyExposed)
      ? undefined
      : previousCandidate;

    sorted = [...resolutions].sort((left, right) => {
      const leftPriority = priorityOf(left);
      const rightPriority = priorityOf(right);
      return Number(right.trainable) - Number(left.trainable)
        || Number(rightPriority === 0) - Number(leftPriority === 0)
        || Number(left.recentlyExposed) - Number(right.recentlyExposed)
        || leftPriority - rightPriority
        || seededTieBreak(left, right);
    });
    primary = previousResolution ?? sorted[0];
  }
  if (!primary) {
    issues.push({
      severity: "error",
      code: planningReasonCodes.invalidInput,
      message: "Athlete Intent does not reference a graph in the selected definition bundle.",
    });
    return { issues };
  }
  if (!primary?.trainable) {
    issues.push({
      severity: "warning",
      code: planningReasonCodes.noSafeRelevantCandidate,
      message: "No requested family currently has a trainable milestone or prerequisite prescription.",
    });
  }
  const secondary = sorted.find((candidate) =>
    candidate !== primary
      && candidate.trainable
      && focusCompatible(primary, candidate, policy));
  const deferred = sorted
    .filter((candidate) => candidate !== primary && candidate !== secondary)
    .map((candidate) => candidate.focus.graphId)
    .sort();

  const lastMaintenanceExposure = (focus: EmphasisFocus): number => {
    if (!input.projectionPolicy.longTermAllocation || !focus.targetMilestone) return 0;
    const key = projectionMilestoneKey(focus.targetMilestone);
    const exposure = input.state.maintenanceExposures?.find((item) => projectionMilestoneKey(item.milestone) === key);
    // Unmaintained skills come first. These dated completed exposures allocate
    // practice only; they never refresh benchmark confidence or unlock work.
    return exposure ? Date.parse(exposure.occurredAt) : Number.NEGATIVE_INFINITY;
  };
  const maintenance = input.state.maintenanceNeeds
    .filter((item) => item.milestone.graphId !== primary.focus.graphId
      && item.milestone.graphId !== secondary?.focus.graphId)
    .map((item): FocusResolution | undefined => {
      const graph = input.bundle.graphs.find((candidate) => candidate.id === item.milestone.graphId);
      const node = graph?.nodes.find((candidate) => candidate.id === item.milestone.nodeId);
      const protocol = exactProtocolFor(input.bundle, item.milestone);
      const resolved = protocol ? protocolDemand(protocol, input, true) : undefined;
      if (!graph || !node || !resolved?.trainable || node.implementationStatus !== "available") return undefined;
      return {
        focus: {
          graphId: graph.id,
          targetMilestone: item.milestone,
          kind: "maintenance",
          missingPrerequisites: [],
          reasonCodes: [planningReasonCodes.maintenance],
          userMessage: focusUserMessage(graph, node, "maintenance"),
        },
        demand: resolved.demand,
        trainable: true,
        recentlyExposed: recentHighOverlap(resolved.demand, input, policy),
      };
    })
    .filter((item): item is FocusResolution => item !== undefined)
    .filter((item) => focusCompatible(primary, item, policy)
      && (!secondary || focusCompatible(secondary, item, policy)))
    .sort((left, right) => Number(left.recentlyExposed) - Number(right.recentlyExposed)
      || (lastMaintenanceExposure(left.focus) < lastMaintenanceExposure(right.focus) ? -1
        : lastMaintenanceExposure(left.focus) > lastMaintenanceExposure(right.focus) ? 1 : 0)
      || left.focus.graphId.localeCompare(right.focus.graphId))
    .slice(0, 1)
    .map((item) => item.focus);

  let mainGoalNotice: EmphasisPlan["mainGoalNotice"];
  const reasons: ReasonCode[] = [
    previousResolution
      ? planningReasonCodes.previousEmphasisRetained
      : input.intent.emphasisOverride?.primaryGraphId === primary.focus.graphId
        ? planningReasonCodes.userOverride
        : planningReasonCodes.goalPrimary,
  ];
  if (input.goalContinuity
    ? reviewDue
    : previous && previous.completedEligibleSessions >= policy.emphasisReviewMinimumSessions) {
    reasons.push(planningReasonCodes.emphasisReviewDue);
  }
  if (secondary) reasons.push(planningReasonCodes.compatibleSecondary);
  if (input.goalContinuity ? declaredDeferred : resolutions.some((candidate) => candidate !== primary
    && candidate.trainable
    && candidate.recentlyExposed
    && graphGoalPriority(candidate.focus.graphId, input, goals)
      < graphGoalPriority(primary.focus.graphId, input, goals))) {
    reasons.push(planningReasonCodes.deferredRecentLoad);
  }
  if (input.goalContinuity) {
    const declaredGraphId = input.intent.emphasisOverride?.primaryGraphId
      ?? input.intent.goals.find((goal) => goal.priority === "primary")?.graphId;
    const declared = declaredGraphId
      ? resolutions.find((candidate) => candidate.focus.graphId === declaredGraphId)
      : undefined;
    if (declared && declared !== primary && !declared.trainable && declared.blockedByRecentLoad) {
      // Resting the main goal after recent demanding work is a normal deferral.
      reasons.push(planningReasonCodes.deferredRecentLoad);
    } else if (declared && declared !== primary && !declared.trainable) {
      mainGoalNotice = { graphId: declared.focus.graphId, kind: declared.hasStaleCandidate ? "recheck" : "unavailable" };
      reasons.push(declared.hasStaleCandidate
        ? planningReasonCodes.mainGoalRecheckNeeded
        : planningReasonCodes.mainGoalUnavailable);
    }
  }
  if (resolutions.some((candidate) => !candidate.trainable)) {
    reasons.push(planningReasonCodes.deferredRestriction);
  }
  if (resolutions.some((candidate) => candidate !== primary
    && candidate !== secondary
    && candidate.trainable
    && !focusCompatible(primary, candidate, policy))) {
    reasons.push(planningReasonCodes.secondaryLoadConflict);
  }
  return {
    emphasis: {
      primary: primary.focus,
      ...(secondary ? { secondary: secondary.focus } : {}),
      maintenance,
      deferredGraphIds: deferred,
      goalSignature: signature,
      retainedFromPrevious: previousResolution !== undefined,
      reasonCodes: uniqueReasons(reasons),
      ...(input.goalContinuity ? {
        reviewDecision: !reviewDue ? "none" as const
          : previous?.primaryGraphId === primary.focus.graphId ? "confirmed" as const : "changed" as const,
        ...(mainGoalNotice ? { mainGoalNotice } : {}),
      } : {}),
    },
    issues,
  };
};
