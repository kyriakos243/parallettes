import {
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type BenchmarkProtocol,
  type CapacityFacetRef,
  type DefinitionReference,
  type DemandLevel,
  type DemandProfile,
  type DevelopmentNode,
  type ExerciseDefinition,
  type GraphId,
  type MilestoneRef,
  type PrescriptionVariant,
  type PrerequisiteRef,
  type ReasonCode,
  type SessionPlanItem,
  type SessionPurpose,
} from "../contracts";
import { evaluateTrainability, projectionReasonCodes } from "../projection";
import { validateSessionPlan } from "../validation";
import type {
  CoverageGap,
  EmphasisFocus,
  GenerateSessionInput,
  GeneratedSession,
  GeneratorPolicy,
  ItemExplanation,
  PlannedTrainability,
  PlanningIssue,
  SessionBlockKind,
} from "./contracts";
import { planEmphasis } from "./emphasis";
import {
  prerequisiteIsSatisfied,
  prerequisiteKey,
  resolvePrerequisiteActions,
  selectedUnsatisfiedPrerequisites,
} from "./prerequisites";
import {
  demandReasonCode,
  planningReasonCodes,
  vNextGeneratorPolicy,
} from "./policy";
import {
  highDemandDomains,
  isCanonicalIsoTimestamp,
  materialDemandDomains,
  mergeDemandProfiles,
  milestoneKey,
  seededOrder,
  stableHash,
  uniqueReasons,
} from "./utils";
import { validateGeneratedSession } from "./validation";

type TrainabilityEvaluation = ReturnType<typeof evaluateTrainability>;

type Candidate = Readonly<{
  exercise: ExerciseDefinition;
  variant: PrescriptionVariant;
  evaluation: TrainabilityEvaluation;
  graphId: GraphId;
  purpose: SessionPurpose;
  block: SessionBlockKind;
  reasonCodes: readonly ReasonCode[];
  whySkill: string;
  whyExercise: string;
  targetMilestone?: MilestoneRef;
  benchmarkProtocol?: BenchmarkProtocol;
  capacity?: CapacityFacetRef;
}>;

type SelectedBlock = Readonly<{
  candidate: Candidate;
  plannedSeconds: number;
}>;

const activeRestrictionReason = projectionReasonCodes.activeRestriction;

const exerciseVariant = (
  exercise: ExerciseDefinition,
  id: string | undefined,
): PrescriptionVariant | undefined =>
  (id ? exercise.prescriptionVariants.find((candidate) => candidate.id === id) : undefined)
  ?? exercise.prescriptionVariants[0];

const exactProtocolFor = (
  input: GenerateSessionInput,
  milestone: MilestoneRef,
): BenchmarkProtocol | undefined => {
  const graph = input.bundle.graphs.find((candidate) => candidate.id === milestone.graphId);
  const node = graph?.nodes.find((candidate) => candidate.id === milestone.nodeId);
  return node?.benchmarkProtocolIds
    .map((id) => input.bundle.benchmarkProtocols.find((protocol) => protocol.id === id
      && protocol.subject.kind === "milestone"
      && milestoneKey(protocol.subject.milestone) === milestoneKey(milestone)))
    .find((protocol): protocol is BenchmarkProtocol => protocol !== undefined);
};

const nodeFor = (input: GenerateSessionInput, milestone: MilestoneRef): DevelopmentNode | undefined =>
  input.bundle.graphs.find((graph) => graph.id === milestone.graphId)
    ?.nodes.find((node) => node.id === milestone.nodeId);

const milestoneRefsForNode = (
  input: GenerateSessionInput,
  node: DevelopmentNode,
): readonly MilestoneRef[] => [
  ...(node.prerequisiteRule?.allOf ?? []),
  ...(node.prerequisiteRule?.anyOf ?? []),
].flatMap((ref) => {
  if (ref.kind === "milestone") return [ref.milestone];
  if (ref.kind !== "benchmark") return [];
  const protocol = input.bundle.benchmarkProtocols.find((candidate) =>
    candidate.id === ref.benchmarkProtocolId);
  return protocol?.subject.kind === "milestone" ? [protocol.subject.milestone] : [];
});

const milestoneDistance = (
  input: GenerateSessionInput,
  ancestor: MilestoneRef,
  descendant: MilestoneRef,
  visiting = new Set<string>(),
): number | undefined => {
  const ancestorKey = milestoneKey(ancestor);
  const descendantKey = milestoneKey(descendant);
  if (ancestorKey === descendantKey) return 0;
  if (visiting.has(descendantKey)) return undefined;
  visiting.add(descendantKey);
  const distances = nodeFor(input, descendant)
    ? milestoneRefsForNode(input, nodeFor(input, descendant)!)
      .map((parent) => milestoneDistance(input, ancestor, parent, visiting))
      .filter((distance): distance is number => distance !== undefined)
    : [];
  visiting.delete(descendantKey);
  return distances.length ? 1 + Math.min(...distances) : undefined;
};

const nodeAllowed = (
  input: GenerateSessionInput,
  milestone: MilestoneRef,
): boolean => {
  const node = nodeFor(input, milestone);
  if (!node || node.implementationStatus !== "available") return false;
  if (node.programmingBoundary !== "specialist") return true;
  return input.intent.preferences.specialistOptIn
    && input.intent.goals.some((goal) => goal.graphId === milestone.graphId
      && goal.targetNodeId === milestone.nodeId);
};

const evaluate = (
  input: GenerateSessionInput,
  exercise: ExerciseDefinition,
  variant: PrescriptionVariant,
): TrainabilityEvaluation => evaluateTrainability({
  request: {
    exerciseId: exercise.id,
    exerciseDefinitionVersion: exercise.definitionVersion,
    prescriptionVariantId: variant.id,
  },
  state: input.state,
  bundle: input.bundle,
  asOf: input.state.asOf,
  policy: input.projectionPolicy,
  intent: input.intent,
});

const variantCandidates = (
  input: GenerateSessionInput,
  exercise: ExerciseDefinition,
  preferredId: string | undefined,
  exactRequired: boolean,
): readonly PrescriptionVariant[] => {
  const preferred = exerciseVariant(exercise, preferredId);
  if (!preferred) return [];
  if (exactRequired || input.sessionDemand === "challenge") return [preferred];
  const regressions = exercise.prescriptionVariants
    .filter((candidate) => candidate.id !== preferred.id && candidate.id.endsWith("-regressed"))
    .sort((left, right) => left.id.localeCompare(right.id));
  return input.sessionDemand === "technique"
    ? [...regressions, preferred]
    : [preferred, ...regressions];
};

const candidateForExercise = (
  input: GenerateSessionInput,
  options: Readonly<{
    exercise: ExerciseDefinition;
    preferredVariantId?: string;
    graphId: GraphId;
    purpose: SessionPurpose;
    block: SessionBlockKind;
    reasonCodes: readonly ReasonCode[];
    whySkill: string;
    whyExercise: string;
    targetMilestone?: MilestoneRef;
    benchmarkProtocol?: BenchmarkProtocol;
    capacity?: CapacityFacetRef;
    exactVariantRequired?: boolean;
  }>,
): Candidate | undefined => {
  if (options.targetMilestone && !nodeAllowed(input, options.targetMilestone)) return undefined;
  const blockedWithAlternative: TrainabilityEvaluation[] = [];
  for (const variant of variantCandidates(
    input,
    options.exercise,
    options.preferredVariantId,
    options.exactVariantRequired ?? false,
  )) {
    const evaluation = evaluate(input, options.exercise, variant);
    if (evaluation.decision === "block") {
      if (evaluation.safeAlternative) blockedWithAlternative.push(evaluation);
      continue;
    }
    const high = highDemandDomains(variant.demand).length > 0;
    if (input.sessionDemand === "challenge" && evaluation.decision === "modify" && high) continue;
    if (evaluation.decision === "modify"
      && evaluation.reasonCodes.includes(projectionReasonCodes.recentHighLoad)
      && high) continue;
    if (
      evaluation.decision === "modify"
      && evaluation.reasonCodes.includes(projectionReasonCodes.postClearance)
      && high
    ) continue;
    if (
      evaluation.decision === "modify"
      && evaluation.reasonCodes.includes(activeRestrictionReason)
      && !variant.id.endsWith("-regressed")
      && options.block !== "recovery"
      && options.block !== "preparation"
    ) continue;
    return {
      exercise: options.exercise,
      variant,
      evaluation,
      graphId: options.graphId,
      purpose: options.purpose,
      block: options.block,
      reasonCodes: uniqueReasons([
        ...options.reasonCodes,
        ...(evaluation.decision === "modify" ? [planningReasonCodes.doseModified] : []),
      ]),
      whySkill: options.whySkill,
      whyExercise: options.whyExercise,
      ...(options.targetMilestone ? { targetMilestone: options.targetMilestone } : {}),
      ...(options.benchmarkProtocol ? { benchmarkProtocol: options.benchmarkProtocol } : {}),
      ...(options.capacity ? { capacity: options.capacity } : {}),
    };
  }
  for (const blocked of blockedWithAlternative) {
    const alternative = blocked.safeAlternative;
    const exercise = alternative && input.bundle.exercises.find((candidate) =>
      candidate.id === alternative.exerciseId
      && candidate.definitionVersion === alternative.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) =>
      candidate.id === alternative?.prescriptionVariantId);
    if (!exercise || !variant) continue;
    const evaluation = evaluate(input, exercise, variant);
    if (evaluation.decision === "block") continue;
    const high = highDemandDomains(variant.demand).length > 0;
    if (evaluation.reasonCodes.includes(projectionReasonCodes.recentHighLoad) && high) continue;
    if (evaluation.reasonCodes.includes(projectionReasonCodes.postClearance) && high) continue;
    return {
      exercise,
      variant,
      evaluation,
      graphId: options.graphId,
      purpose: options.purpose === "guided-test" ? "primary-development" : options.purpose,
      block: options.block,
      reasonCodes: uniqueReasons([
        ...options.reasonCodes,
        planningReasonCodes.safeSubstitution,
        ...(evaluation.decision === "modify" ? [planningReasonCodes.doseModified] : []),
      ]),
      whySkill: options.whySkill,
      whyExercise: `${exercise.name} is the explicit safe alternative to ${options.exercise.name}; it does not claim the blocked target or test.`,
    };
  }
  return undefined;
};

const exactFocusCandidate = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
  purpose: SessionPurpose,
  block: SessionBlockKind,
): Candidate | undefined => {
  if (!focus.targetMilestone || focus.kind === "prerequisite-development") return undefined;
  const protocol = exactProtocolFor(input, focus.targetMilestone);
  const exercise = protocol
    ? input.bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId)
    : undefined;
  if (!protocol || !exercise) return undefined;
  const reconfirm = focus.kind === "reconfirmation";
  return candidateForExercise(input, {
    exercise,
    preferredVariantId: protocol.prescriptionVariantId,
    graphId: focus.graphId,
    purpose: reconfirm ? "guided-test" : purpose,
    block,
    reasonCodes: [
      block === "technical" ? planningReasonCodes.selectedTechnical
        : purpose === "secondary-development" ? planningReasonCodes.selectedSecondary
          : purpose === "maintenance" ? planningReasonCodes.selectedMaintenance
            : planningReasonCodes.selectedPrimary,
      ...focus.reasonCodes,
    ],
    whySkill: focus.userMessage,
    whyExercise: reconfirm
      ? `${exercise.name} uses the approved test conditions for this exact outcome.`
      : `${exercise.name} is the exact current-content exercise for this eligible outcome.`,
    targetMilestone: focus.targetMilestone,
    ...(reconfirm ? { benchmarkProtocol: protocol } : {}),
    exactVariantRequired: reconfirm,
  });
};

/**
 * Follow an unmet cross-graph milestone requirement until it reaches an
 * available working/eligible prescription. Missing Phase 7 nodes are never
 * prescribed merely because they sit on the requested path.
 */
const prerequisiteMilestoneFrontiers = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
): readonly MilestoneRef[] => resolvePrerequisiteActions(
  input,
  focus.missingPrerequisites,
).milestones;

const prerequisiteMilestoneCandidates = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
  seed: string,
): readonly Candidate[] => prerequisiteMilestoneFrontiers(input, focus)
  .map((milestone) => {
    const protocol = exactProtocolFor(input, milestone);
    const exercise = protocol
      ? input.bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId)
      : undefined;
    const variant = exercise && exerciseVariant(exercise, protocol?.prescriptionVariantId);
    if (!protocol || !exercise || !variant) return undefined;
    const technical = exercise.roles.includes("technique-safety")
      || variant.demand["inversion-technical"] === "moderate"
      || variant.demand["inversion-technical"] === "high";
    const targetNode = nodeFor(input, milestone);
    return candidateForExercise(input, {
      exercise,
      preferredVariantId: protocol.prescriptionVariantId,
      graphId: milestone.graphId,
      purpose: "primary-development",
      block: technical ? "technical" : "primary",
      reasonCodes: [
        planningReasonCodes.prerequisiteDevelopment,
        technical ? planningReasonCodes.selectedTechnical : planningReasonCodes.selectedPrimary,
      ],
      whySkill: `${targetNode?.label ?? milestone.nodeId} is the current prerequisite frontier for ${focus.userMessage.toLowerCase()}`,
      whyExercise: `${exercise.name} is the exact current-content exercise for that prerequisite; it does not claim the unavailable destination skill.`,
      targetMilestone: milestone,
    });
  })
  .filter((candidate): candidate is Candidate => candidate !== undefined)
  .sort((left, right) => Number(left.block !== "technical") - Number(right.block !== "technical")
    || seededOrder(seed, `${left.graphId}:${left.exercise.id}`)
      .localeCompare(seededOrder(seed, `${right.graphId}:${right.exercise.id}`))
    || left.exercise.id.localeCompare(right.exercise.id));

const capacityRefsForFocus = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
): readonly CapacityFacetRef[] => {
  const ranked = new Map<string, Readonly<{ ref: CapacityFacetRef; rank: number }>>();
  const addCapacity = (ref: CapacityFacetRef, rank: number) => {
    const key = `${ref.capacityId}:${ref.facetId}`;
    const existing = ranked.get(key);
    if (!existing || rank < existing.rank) ranked.set(key, { ref, rank });
  };
  const addRef = (ref: PrerequisiteRef, rank: number) => {
    if (ref.kind === "capacity-facet") addCapacity(ref.capacity, rank);
    if (ref.kind === "benchmark") {
      const protocol = input.bundle.benchmarkProtocols.find((candidate) => candidate.id === ref.benchmarkProtocolId);
      if (protocol?.subject.kind === "capacity-facet") addCapacity(protocol.subject.capacity, rank);
    }
  };
  resolvePrerequisiteActions(input, focus.missingPrerequisites).capacities
    .forEach((capacity) => addCapacity(capacity, 0));
  if (focus.targetMilestone && focus.kind !== "prerequisite-development") {
    const node = nodeFor(input, focus.targetMilestone);
    (node?.prerequisiteRule?.allOf ?? []).forEach((ref) => addRef(ref, 1));
    const anyOf = node?.prerequisiteRule?.anyOf ?? [];
    const selectedAnyOf = [...anyOf]
      .filter((ref) => prerequisiteIsSatisfied(ref, input))
      .sort((left, right) => prerequisiteKey(left).localeCompare(prerequisiteKey(right)))[0]
      ?? (node ? selectedUnsatisfiedPrerequisites(input, node)
        .find((selected) => anyOf.some((candidate) => prerequisiteKey(candidate) === prerequisiteKey(selected)))
        : undefined);
    if (selectedAnyOf) addRef(selectedAnyOf, 1);

    // Prepare the nearest honest successor rather than filling the remaining
    // budget with an arbitrary capacity merely shared by the whole family.
    for (const graph of input.bundle.graphs.filter((candidate) =>
      candidate.id === focus.targetMilestone?.graphId)) {
      for (const descendant of graph.nodes) {
        const descendantMilestone = { graphId: graph.id, nodeId: descendant.id };
        const distance = milestoneDistance(input, focus.targetMilestone, descendantMilestone);
        if (distance === undefined || distance === 0) continue;
        const refs = selectedUnsatisfiedPrerequisites(input, descendant);
        refs.forEach((ref) => addRef(ref, 10 + distance));
      }
    }
  }
  // A prerequisite-development focus with no remaining canonical actions is
  // waiting on missing destination content. Do not turn unrelated capacities
  // that merely share the graph into filler for that unavailable skill.
  if (!ranked.size && focus.kind !== "prerequisite-development") {
    input.bundle.capacities
      .filter((capacity) => capacity.sharedGraphIds.includes(focus.graphId))
      .forEach((capacity) => capacity.facets.forEach((facet) => addCapacity({
        capacityId: capacity.id,
        facetId: facet.id,
      }, 100)));
  }
  const findingRank = (ref: CapacityFacetRef): number => {
    const finding = input.state.capacityFindings.find((candidate) =>
      candidate.capacity.capacityId === ref.capacityId && candidate.capacity.facetId === ref.facetId);
    return finding?.finding === "unknown" ? 0 : finding?.finding === "estimated" ? 1 : 2;
  };
  return [...ranked.values()]
    .sort((left, right) => left.rank - right.rank
      || findingRank(left.ref) - findingRank(right.ref)
      || `${left.ref.capacityId}:${left.ref.facetId}`
        .localeCompare(`${right.ref.capacityId}:${right.ref.facetId}`))
    .map((item) => item.ref);
};

const protocolsForCapacity = (
  input: GenerateSessionInput,
  capacity: CapacityFacetRef,
): readonly BenchmarkProtocol[] => {
  const definition = input.bundle.capacities.find((candidate) => candidate.id === capacity.capacityId);
  const facet = definition?.facets.find((candidate) => candidate.id === capacity.facetId);
  return (facet?.benchmarkProtocolIds ?? [])
    .map((id) => input.bundle.benchmarkProtocols.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is BenchmarkProtocol => candidate !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
};

const capacityCandidates = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
  seed: string,
): readonly Candidate[] => capacityRefsForFocus(input, focus)
  .flatMap((capacity, capacityRank) => protocolsForCapacity(input, capacity).map((protocol) => {
    const exercise = input.bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
    const candidate = exercise ? candidateForExercise(input, {
      exercise,
      preferredVariantId: protocol.prescriptionVariantId,
      graphId: focus.graphId,
      purpose: "primary-development",
      block: "supporting-capacity",
      reasonCodes: [planningReasonCodes.selectedCapacity, ...focus.reasonCodes],
      whySkill: focus.kind === "prerequisite-development"
        ? focus.userMessage
        : `Support ${focus.userMessage.toLowerCase()}`,
      whyExercise: `${exercise.name} develops the specific ${capacity.facetId.replaceAll("-", " ")} requirement without claiming the destination skill.`,
      capacity,
    }) : undefined;
    return candidate ? { candidate, capacityRank } : undefined;
  }))
  .filter((item): item is Readonly<{ candidate: Candidate; capacityRank: number }> => item !== undefined)
  .sort((left, right) => left.capacityRank - right.capacityRank
    || Number(left.candidate.evaluation.decision === "modify")
      - Number(right.candidate.evaluation.decision === "modify")
    || seededOrder(seed, `${left.candidate.capacity?.capacityId}:${left.candidate.capacity?.facetId}:${left.candidate.exercise.id}`)
      .localeCompare(seededOrder(seed, `${right.candidate.capacity?.capacityId}:${right.candidate.capacity?.facetId}:${right.candidate.exercise.id}`))
    || left.candidate.exercise.id.localeCompare(right.candidate.exercise.id))
  .map((item) => item.candidate);

const technicalCandidates = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
  seed: string,
): readonly Candidate[] => {
  const allowedMilestones = new Set([
    ...input.state.workingNodes,
    ...input.state.eligibleTargets,
    ...input.state.maintenanceNeeds,
    ...input.state.nodeStates
      .filter((state) => state.lifecycle === "established" && state.confidence === "current")
      .map((state) => ({ milestone: state.milestone, reasonCodes: state.reasonCodes })),
  ].filter((item) => item.milestone.graphId === focus.graphId)
    .map((item) => milestoneKey(item.milestone)));
  return input.bundle.benchmarkProtocols
    .filter((protocol) => protocol.subject.kind === "milestone"
      && protocol.subject.milestone.graphId === focus.graphId
      && allowedMilestones.has(milestoneKey(protocol.subject.milestone)))
    .map((protocol) => {
      if (protocol.subject.kind !== "milestone") return undefined;
      const exercise = input.bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
      const variant = exercise && exerciseVariant(exercise, protocol.prescriptionVariantId);
      const technical = exercise?.roles.includes("technique-safety")
        || (variant?.demand["inversion-technical"] !== undefined
          && variant.demand["inversion-technical"] !== "low");
      if (!exercise || !technical) return undefined;
      return candidateForExercise(input, {
        exercise,
        preferredVariantId: protocol.prescriptionVariantId,
        graphId: focus.graphId,
        purpose: "primary-development",
        block: "technical",
        reasonCodes: [planningReasonCodes.selectedTechnical],
        whySkill: `Practise ${protocol.label} while fresh.`,
        whyExercise: `${exercise.name} is a prerequisite-safe technical exposure for today's focus.`,
        targetMilestone: protocol.subject.milestone,
      });
    })
    .filter((candidate): candidate is Candidate => candidate !== undefined)
    .sort((left, right) => seededOrder(seed, `${left.exercise.id}:${left.targetMilestone?.nodeId}`)
      .localeCompare(seededOrder(seed, `${right.exercise.id}:${right.targetMilestone?.nodeId}`))
      || left.exercise.id.localeCompare(right.exercise.id));
};

const allowlistedCandidate = (
  input: GenerateSessionInput,
  exerciseId: string,
  focus: EmphasisFocus,
  block: "preparation" | "recovery",
): Candidate | undefined => {
  const exercise = input.bundle.exercises.find((candidate) => candidate.id === exerciseId);
  if (!exercise || !exercise.roles.includes("preparation-recovery")) return undefined;
  const variant = exerciseVariant(exercise, undefined);
  if (!variant || highDemandDomains(variant.demand).length) return undefined;
  return candidateForExercise(input, {
    exercise,
    graphId: focus.graphId,
    purpose: block,
    block,
    reasonCodes: [block === "preparation"
      ? planningReasonCodes.selectedPreparation
      : planningReasonCodes.selectedRecovery],
    whySkill: block === "preparation"
      ? `Prepare the demands used by ${focus.graphId.replaceAll("-", " ")}.`
      : `Reset after today's ${focus.graphId.replaceAll("-", " ")} work.`,
    whyExercise: block === "preparation"
      ? `${exercise.name} prepares a relevant range or load without pre-fatiguing the main work.`
      : `${exercise.name} provides a low-load finish instead of adding filler strength work.`,
  });
};

const allowlistedCandidates = (
  input: GenerateSessionInput,
  focus: EmphasisFocus,
  block: "preparation" | "recovery",
  policy: GeneratorPolicy,
  seed: string,
): readonly Candidate[] => {
  const ids = block === "preparation" ? policy.preparationExerciseIds : policy.recoveryExerciseIds;
  const policyOrder = new Map(ids.map((id, index) => [id, index]));
  const focusCapacityIds = new Set(capacityRefsForFocus(input, focus).map((ref) => ref.capacityId));
  return ids.map((id) => allowlistedCandidate(input, id, focus, block))
    .filter((candidate): candidate is Candidate => candidate !== undefined)
    .sort((left, right) => {
      const leftRelevant = left.exercise.capacityLinks.some((link) => focusCapacityIds.has(link.capacityId));
      const rightRelevant = right.exercise.capacityLinks.some((link) => focusCapacityIds.has(link.capacityId));
      return Number(rightRelevant) - Number(leftRelevant)
        || (policyOrder.get(left.exercise.id) ?? Number.MAX_SAFE_INTEGER)
          - (policyOrder.get(right.exercise.id) ?? Number.MAX_SAFE_INTEGER)
        || seededOrder(seed, left.exercise.id).localeCompare(seededOrder(seed, right.exercise.id))
        || left.exercise.id.localeCompare(right.exercise.id);
    });
};

const highStrengthDomains = (
  candidate: Candidate,
  policy: GeneratorPolicy,
): readonly string[] => highDemandDomains(candidate.variant.demand)
  .filter((domain) => policy.highUpperLimbDomains.includes(domain));

const compatibleWithSelected = (
  candidate: Candidate,
  selected: readonly Candidate[],
  policy: GeneratorPolicy,
): boolean => {
  const candidateHigh = highStrengthDomains(candidate, policy);
  if (!candidateHigh.length) return true;
  return selected.every((existing) => highStrengthDomains(existing, policy).length === 0);
};

const takeCandidate = (
  candidates: readonly Candidate[],
  selected: readonly Candidate[],
  policy: GeneratorPolicy,
): Candidate | undefined => candidates.find((candidate) =>
  !selected.some((item) => item.exercise.id === candidate.exercise.id)
    && compatibleWithSelected(candidate, selected, policy));

const buildDefinitionReferences = (
  selected: readonly Candidate[],
  input: GenerateSessionInput,
  policy: GeneratorPolicy,
): readonly DefinitionReference[] => {
  const refs: DefinitionReference[] = [{ kind: "policy", id: policy.id, version: policy.version }];
  for (const candidate of selected) {
    refs.push({ kind: "exercise", id: candidate.exercise.id, version: candidate.exercise.definitionVersion });
    refs.push({
      kind: "graph",
      id: candidate.graphId,
      version: input.bundle.graphs.find((graph) => graph.id === candidate.graphId)?.definitionVersion
        ?? input.bundle.catalogueVersion,
    });
    if (candidate.capacity) {
      refs.push({
        kind: "capacity",
        id: candidate.capacity.capacityId,
        version: input.bundle.capacities.find((capacity) => capacity.id === candidate.capacity?.capacityId)?.definitionVersion
          ?? input.bundle.catalogueVersion,
      });
    }
    if (candidate.benchmarkProtocol) {
      refs.push({
        kind: "benchmark",
        id: candidate.benchmarkProtocol.id,
        version: candidate.benchmarkProtocol.definitionVersion,
      });
    }
  }
  return refs
    .filter((ref, index, all) => all.findIndex((candidate) =>
      candidate.kind === ref.kind && candidate.id === ref.id) === index)
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
};

const intensityMessage = (
  input: GenerateSessionInput,
  candidate: Candidate,
): string => {
  if (input.sessionDemand === "technique") {
    return candidate.variant.id.endsWith("-regressed")
      ? "Technique mode uses the authored assisted variation and prioritises clean practice."
      : "Technique mode reduces today's development dose while keeping the same safe frontier.";
  }
  if (input.sessionDemand === "challenge") {
    return "Challenge mode gives more time to this already-eligible prescription; it does not unlock a harder skill.";
  }
  return candidate.evaluation.decision === "modify"
    ? "Today's standard dose is reduced because current trainability calls for modification."
    : "Standard mode uses the normal quality dose for this eligible prescription.";
};

const blockSeconds = (
  blocks: readonly Candidate[],
  input: GenerateSessionInput,
  policy: GeneratorPolicy,
): readonly SelectedBlock[] => {
  const configured = policy.blockSeconds[input.sessionDemand ?? input.intent.defaultSessionDemand];
  const hasTechnical = blocks.some((candidate) => candidate.block === "technical");
  const hasSecondary = blocks.some((candidate) => candidate.block === "secondary");
  const hasMaintenance = blocks.some((candidate) => candidate.block === "maintenance");
  if (hasTechnical && hasSecondary && hasMaintenance) {
    const combined = input.sessionDemand === "technique"
      ? { preparation: 180, technical: 360, primary: 360, supporting: 300, secondary: 180, maintenance: 60, recovery: 60 }
      : input.sessionDemand === "challenge"
        ? { preparation: 180, technical: 240, primary: 480, supporting: 300, secondary: 120, maintenance: 120, recovery: 60 }
        : { preparation: 180, technical: 300, primary: 420, supporting: 300, secondary: 120, maintenance: 120, recovery: 60 };
    return blocks.map((candidate) => ({
      candidate,
      plannedSeconds: combined[candidate.block as keyof typeof combined] ?? combined.secondary,
    }));
  }
  if (hasTechnical) {
    return blocks.map((candidate) => ({
      candidate,
      plannedSeconds: candidate.block === "preparation" ? configured.preparation
        : candidate.block === "technical" ? configured.technical
            : candidate.block === "primary" ? configured.primary
              : candidate.block === "supporting-capacity" ? configured.supporting
                : candidate.block === "supplemental" ? configured.supplemental
              : candidate.block === "recovery" ? configured.recovery
                : configured.supplemental,
    }));
  }
  if (hasSecondary && hasMaintenance) {
    const combined = input.sessionDemand === "technique"
      ? { preparation: 240, primary: 360, supporting: 360, secondary: 300, maintenance: 120, recovery: 120 }
      : input.sessionDemand === "challenge"
        ? { preparation: 180, primary: 480, supporting: 360, secondary: 300, maintenance: 120, recovery: 60 }
        : { preparation: 180, primary: 420, supporting: 420, secondary: 240, maintenance: 120, recovery: 120 };
    return blocks.map((candidate) => ({
      candidate,
      plannedSeconds: combined[candidate.block as keyof typeof combined] ?? combined.secondary,
    }));
  }
  if (hasSecondary || hasMaintenance) {
    const oneCompatibleExtra = input.sessionDemand === "technique"
      ? { preparation: 240, primary: 420, supporting: 480, extra: 240, recovery: 120 }
      : input.sessionDemand === "challenge"
        ? { preparation: 180, primary: 480, supporting: 480, extra: 240, recovery: 120 }
        : { preparation: 180, primary: 480, supporting: 480, extra: 240, recovery: 120 };
    return blocks.map((candidate) => ({
      candidate,
      plannedSeconds: candidate.block === "preparation" ? oneCompatibleExtra.preparation
        : candidate.block === "primary" ? oneCompatibleExtra.primary
          : candidate.block === "supporting-capacity" ? oneCompatibleExtra.supporting
            : candidate.block === "recovery" ? oneCompatibleExtra.recovery
              : oneCompatibleExtra.extra,
    }));
  }
  const noTechnical = input.sessionDemand === "technique"
    ? { preparation: 240, primary: 360, supporting: 480, supplemental: 300, recovery: 120 }
    : input.sessionDemand === "challenge"
      ? { preparation: 180, primary: 480, supporting: 480, supplemental: 300, recovery: 60 }
      : { preparation: 180, primary: 480, supporting: 480, supplemental: 240, recovery: 120 };
  return blocks.map((candidate) => ({
    candidate,
    plannedSeconds: candidate.block === "preparation" ? noTechnical.preparation
      : candidate.block === "primary" ? noTechnical.primary
        : candidate.block === "supporting-capacity" ? noTechnical.supporting
          : candidate.block === "recovery" ? noTechnical.recovery
            : noTechnical.supplemental,
  }));
};

const validateInput = (
  input: GenerateSessionInput,
  policy: GeneratorPolicy,
): readonly PlanningIssue[] => {
  const issues: PlanningIssue[] = [];
  const createdMs = Date.parse(input.createdAt);
  const stateMs = Date.parse(input.state.asOf);
  if (!isCanonicalIsoTimestamp(input.createdAt) || !isCanonicalIsoTimestamp(input.state.asOf)) {
    issues.push({ severity: "error", code: planningReasonCodes.invalidInput, message: "Planning timestamps must be canonical UTC timestamps." });
  }
  if (input.intent.athleteId !== input.state.athleteId) {
    issues.push({ severity: "error", code: planningReasonCodes.invalidInput, message: "Athlete Intent and Derived Athlete State belong to different athletes." });
  }
  if (input.state.projectionVersion !== input.projectionPolicy.version) {
    issues.push({ severity: "error", code: planningReasonCodes.invalidInput, message: "Derived state and projection policy versions do not match." });
  }
  if (createdMs < stateMs || createdMs - stateMs > policy.maximumProjectionAgeSeconds * 1_000) {
    issues.push({ severity: "error", code: planningReasonCodes.projectionTooOld, message: "Generate from a current Derived Athlete State projection." });
  }
  const expectedNodeKeys = new Set(input.bundle.graphs.flatMap((graph) =>
    graph.nodes.map((node) => milestoneKey({ graphId: graph.id, nodeId: node.id }))));
  const actualNodeKeys = new Set(input.state.nodeStates.map((state) => milestoneKey(state.milestone)));
  if (expectedNodeKeys.size !== actualNodeKeys.size
    || [...expectedNodeKeys].some((key) => !actualNodeKeys.has(key))) {
    issues.push({ severity: "error", code: planningReasonCodes.referenceInvalid, message: "Derived node state does not match the selected definition bundle." });
  }
  const expectedCapacityKeys = new Set(input.bundle.capacities.flatMap((capacity) =>
    capacity.facets.map((facet) => `${capacity.id}:${facet.id}`)));
  const actualCapacityKeys = new Set(input.state.capacityFindings.map((finding) =>
    `${finding.capacity.capacityId}:${finding.capacity.facetId}`));
  if (expectedCapacityKeys.size !== actualCapacityKeys.size
    || [...expectedCapacityKeys].some((key) => !actualCapacityKeys.has(key))) {
    issues.push({ severity: "error", code: planningReasonCodes.referenceInvalid, message: "Derived capacity state does not match the selected definition bundle." });
  }
  for (const goal of input.intent.goals) {
    const graph = input.bundle.graphs.find((candidate) => candidate.id === goal.graphId);
    if (!graph || (goal.targetNodeId && !graph.nodes.some((node) => node.id === goal.targetNodeId))) {
      issues.push({ severity: "error", code: planningReasonCodes.referenceInvalid, message: `Goal ${goal.graphId}:${goal.targetNodeId ?? "*"} is not in the definition bundle.` });
    }
  }
  return issues;
};

export const composeSession = (
  input: GenerateSessionInput,
  emphasis: NonNullable<GeneratedSession["emphasis"]>,
  policy: GeneratorPolicy = vNextGeneratorPolicy,
): GeneratedSession => {
  const demand = input.sessionDemand ?? input.intent.defaultSessionDemand;
  const normalizedInput = { ...input, sessionDemand: demand };
  const seed = input.seed ?? `${input.intent.athleteId}:${input.createdAt.slice(0, 10)}`;
  const issues: PlanningIssue[] = [];
  const coverageGaps: CoverageGap[] = [];
  // Keep explicitly requested unavailable destinations honest even when the
  // emphasis planner safely falls back to a compatible secondary family. A
  // goal can influence focus, but it cannot make missing/gated content
  // reachable or disappear from the explanation merely because another safe
  // family supplied today's primary work.
  for (const goal of normalizedInput.intent.goals) {
    if (!goal.targetNodeId) continue;
    const graph = normalizedInput.bundle.graphs.find((candidate) => candidate.id === goal.graphId);
    const node = graph?.nodes.find((candidate) => candidate.id === goal.targetNodeId);
    if (node?.implementationStatus !== "missing-content") continue;
    coverageGaps.push({
      graphId: goal.graphId,
      targetMilestone: { graphId: goal.graphId, nodeId: node.id },
      kind: "missing-content",
      reasonCodes: [planningReasonCodes.missingContent],
      message: "The requested destination is outside the current automatic catalogue; it was not prescribed.",
    });
  }
  const primaryGraph = normalizedInput.bundle.graphs.find((graph) => graph.id === emphasis.primary.graphId);
  const explicitGoalTarget = normalizedInput.intent.goals.find((goal) =>
    goal.graphId === emphasis.primary.graphId && goal.targetNodeId)?.targetNodeId;
  const explicitGoalNode = explicitGoalTarget
    ? primaryGraph?.nodes.find((node) => node.id === explicitGoalTarget)
    : undefined;
  const selectedNode = emphasis.primary.targetMilestone
    ? primaryGraph?.nodes.find((node) => node.id === emphasis.primary.targetMilestone?.nodeId)
    : undefined;
  const selectedIndex = selectedNode ? primaryGraph?.nodes.indexOf(selectedNode) ?? -1 : -1;
  const nextBranchGap = selectedNode && selectedIndex >= 0
    ? primaryGraph?.nodes.slice(selectedIndex + 1).find((node) =>
      node.branchId === selectedNode.branchId && node.implementationStatus === "missing-content")
    : undefined;
  const primaryContentGap = explicitGoalNode?.implementationStatus === "missing-content"
    ? explicitGoalNode
    : nextBranchGap;
  if (primaryContentGap && !coverageGaps.some((gap) => gap.targetMilestone
    && milestoneKey(gap.targetMilestone) === milestoneKey({
      graphId: emphasis.primary.graphId,
      nodeId: primaryContentGap.id,
    }))) {
    coverageGaps.push({
      graphId: emphasis.primary.graphId,
      targetMilestone: { graphId: emphasis.primary.graphId, nodeId: primaryContentGap.id },
      kind: "missing-content",
      reasonCodes: [planningReasonCodes.missingContent],
      message: "The next requested graph outcome still needs approved Phase 7 content; it was not prescribed.",
    });
  }
  if (emphasis.primary.kind === "prerequisite-development"
    && emphasis.primary.targetMilestone
    && nodeFor(normalizedInput, emphasis.primary.targetMilestone)?.implementationStatus === "missing-content") {
    if (!coverageGaps.some((gap) => gap.targetMilestone
      && emphasis.primary.targetMilestone
      && milestoneKey(gap.targetMilestone) === milestoneKey(emphasis.primary.targetMilestone))) coverageGaps.push({
      graphId: emphasis.primary.graphId,
      targetMilestone: emphasis.primary.targetMilestone,
      kind: "missing-content",
      reasonCodes: [planningReasonCodes.missingContent],
      message: "The requested destination has no approved current-content prescription; the plan can only train verified prerequisites.",
    });
  }

  const primaryExact = exactFocusCandidate(
    normalizedInput,
    emphasis.primary,
    "primary-development",
    "primary",
  );
  const primaryTechnicalPool = technicalCandidates(normalizedInput, emphasis.primary, `${seed}:technical`);
  const milestonePrerequisitePool = prerequisiteMilestoneCandidates(
    normalizedInput,
    emphasis.primary,
    `${seed}:milestone-prerequisite`,
  );
  const milestonePrerequisiteTechnical = milestonePrerequisitePool.find((candidate) =>
    candidate.block === "technical");
  const targetIsTechnical = primaryExact !== undefined
    && (primaryExact.exercise.roles.includes("technique-safety")
      || primaryExact.variant.demand["inversion-technical"] === "moderate"
      || primaryExact.variant.demand["inversion-technical"] === "high");
  const technical = targetIsTechnical
    ? { ...primaryExact, block: "technical" as const, reasonCodes: uniqueReasons([
      ...primaryExact.reasonCodes,
      planningReasonCodes.selectedTechnical,
    ]) }
    : milestonePrerequisiteTechnical ?? primaryTechnicalPool[0];
  const primaryCapacity = capacityCandidates(normalizedInput, emphasis.primary, `${seed}:primary-capacity`);
  const secondaryExact = emphasis.secondary
    ? exactFocusCandidate(normalizedInput, emphasis.secondary, "secondary-development", "secondary")
    : undefined;
  const maintenanceExact = emphasis.maintenance[0]
    ? exactFocusCandidate(normalizedInput, emphasis.maintenance[0], "maintenance", "maintenance")
    : undefined;
  const preparationPool = allowlistedCandidates(
    normalizedInput,
    emphasis.primary,
    "preparation",
    policy,
    `${seed}:preparation`,
  );
  const recoveryPool = allowlistedCandidates(
    normalizedInput,
    emphasis.primary,
    "recovery",
    policy,
    `${seed}:recovery`,
  );

  const selected: Candidate[] = [];
  const preparation = takeCandidate(preparationPool, selected, policy);
  if (preparation) selected.push(preparation);
  const selectedTechnical = technical && takeCandidate([technical], selected, policy);
  if (selectedTechnical) selected.push(selectedTechnical);
  const prerequisiteDevelopmentPool = milestonePrerequisitePool.filter((candidate) =>
    candidate !== milestonePrerequisiteTechnical);
  const main = !targetIsTechnical && primaryExact
    ? takeCandidate([primaryExact], selected, policy)
    : takeCandidate([...prerequisiteDevelopmentPool, ...primaryCapacity], selected, policy);
  if (main) selected.push({ ...main, block: "primary" });
  const support = takeCandidate([...prerequisiteDevelopmentPool, ...primaryCapacity], selected, policy);
  if (support) selected.push(support);
  const secondary = secondaryExact && takeCandidate([secondaryExact], selected, policy);
  if (secondary) selected.push(secondary);
  const maintenance = maintenanceExact && takeCandidate([maintenanceExact], selected, policy);
  if (maintenance) selected.push(maintenance);
  if (!secondary && !maintenance) {
    const supplemental = takeCandidate(primaryCapacity, selected, policy);
    if (supplemental) selected.push({ ...supplemental, block: "supplemental" });
  }
  const recovery = takeCandidate(recoveryPool, selected, policy);
  if (recovery) selected.push(recovery);

  const ordered = selected.sort((left, right) => {
    const order: Readonly<Record<SessionBlockKind, number>> = {
      preparation: 0,
      technical: 1,
      primary: 2,
      "supporting-capacity": 3,
      supplemental: 4,
      secondary: 5,
      maintenance: 6,
      recovery: 7,
    };
    return order[left.block] - order[right.block]
      || left.exercise.id.localeCompare(right.exercise.id);
  });
  const selectedBlocks = blockSeconds(ordered, normalizedInput, policy);
  const actualSeconds = selectedBlocks.reduce((total, item) => total + item.plannedSeconds, 0);
  const durationException = actualSeconds === policy.exactDurationSeconds
    ? undefined
    : {
      targetSeconds: policy.exactDurationSeconds,
      actualSeconds,
      reasonCode: planningReasonCodes.shorterSafetyException,
      message: "The plan is shorter because no additional safe, goal-relevant block was available.",
    };
  if (!ordered.length || !ordered.some((candidate) =>
    candidate.block === "primary" || candidate.block === "technical" || candidate.block === "supporting-capacity")) {
    issues.push({
      severity: "error",
      code: planningReasonCodes.noSafeRelevantCandidate,
      message: "No safe development, reconfirmation or prerequisite block is available for this session.",
    });
  }
  if (durationException) {
    issues.push({
      severity: "warning",
      code: planningReasonCodes.shorterSafetyException,
      message: durationException.message,
    });
  }
  if (!primaryExact && emphasis.primary.kind !== "prerequisite-development") {
    coverageGaps.push({
      graphId: emphasis.primary.graphId,
      ...(emphasis.primary.targetMilestone ? { targetMilestone: emphasis.primary.targetMilestone } : {}),
      kind: "missing-safe-prescription",
      reasonCodes: [planningReasonCodes.noSafeRelevantCandidate],
      message: "The current target had no trainable exact prescription and was not replaced by an unscoped drill.",
    });
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      generatorPolicyId: policy.id,
      generatorPolicyVersion: policy.version,
      projectionVersion: input.state.projectionVersion,
      sessionDemand: demand,
      emphasis,
      itemExplanations: [],
      trainabilityUsed: [],
      coverageGaps,
      ...(durationException ? { durationException } : {}),
      issues,
    };
  }

  const definitionReferences = buildDefinitionReferences(ordered, normalizedInput, policy);
  const identity = stableHash(JSON.stringify({
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    athleteId: input.intent.athleteId,
    createdAt: input.createdAt,
    catalogueVersion: input.bundle.catalogueVersion,
    generatorPolicyId: policy.id,
    generatorPolicyVersion: policy.version,
    sessionDemand: demand,
    emphasis,
    definitionReferences,
    intendedDurationSeconds: actualSeconds,
    blocks: selectedBlocks.map(({ candidate, plannedSeconds }) => ({
      exerciseId: candidate.exercise.id,
      exerciseDefinitionVersion: candidate.exercise.definitionVersion,
      prescriptionVariantId: candidate.variant.id,
      purpose: candidate.purpose,
      block: candidate.block,
      plannedSeconds,
      targetMilestone: candidate.targetMilestone,
      benchmarkProtocolId: candidate.benchmarkProtocol?.id,
      benchmarkProtocolVersion: candidate.benchmarkProtocol?.definitionVersion,
      demand: candidate.variant.demand,
      graphId: candidate.graphId,
      reasonCodes: candidate.reasonCodes,
      whySkill: candidate.whySkill,
      whyExercise: candidate.whyExercise,
      whyIntensity: intensityMessage(normalizedInput, candidate),
    })),
    durationException,
  }));
  const planId = parseStableId("session-plan", `vnext-plan-${identity}`);
  const items: SessionPlanItem[] = selectedBlocks.map(({ candidate, plannedSeconds }, index) => ({
    id: parseStableId("plan-item", `vnext-item-${identity}-${index + 1}`),
    exerciseId: candidate.exercise.id,
    exerciseDefinitionVersion: candidate.exercise.definitionVersion,
    prescriptionVariantId: candidate.variant.id,
    ...(candidate.benchmarkProtocol ? {
      benchmarkProtocolId: candidate.benchmarkProtocol.id,
      benchmarkProtocolVersion: candidate.benchmarkProtocol.definitionVersion,
    } : {}),
    purpose: candidate.purpose,
    plannedSeconds,
    ...(candidate.targetMilestone ? { targetMilestone: candidate.targetMilestone } : {}),
    demand: candidate.variant.demand,
  }));
  const itemExplanations: ItemExplanation[] = selectedBlocks.map(({ candidate }, index) => ({
    planItemId: items[index].id,
    block: candidate.block,
    reasonCodes: candidate.reasonCodes,
    whySkill: candidate.whySkill,
    whyExercise: candidate.whyExercise,
    whyIntensity: intensityMessage(normalizedInput, candidate),
  }));
  const rationale = [
    {
      code: emphasis.reasonCodes[0] ?? planningReasonCodes.goalPrimary,
      message: emphasis.primary.userMessage,
      relatedGraphId: emphasis.primary.graphId,
    },
    {
      code: demandReasonCode(demand),
      message: demand === "challenge"
        ? "Challenge changes today's dose around already-eligible work; it does not unlock a harder skill."
        : demand === "technique"
          ? "Technique prioritises assistance, control and quality around the same safe frontier."
          : "Standard uses the normal quality dose for today's safe frontier.",
      relatedGraphId: emphasis.primary.graphId,
    },
    ...itemExplanations.map((explanation) => ({
      code: explanation.reasonCodes[0] ?? planningReasonCodes.selectedPrimary,
      message: `${explanation.whyExercise} ${explanation.whyIntensity}`,
      relatedGraphId: ordered.find((candidate) =>
        candidate.exercise.id === items.find((item) => item.id === explanation.planItemId)?.exerciseId)?.graphId,
    })),
    {
      code: durationException ? planningReasonCodes.shorterSafetyException : planningReasonCodes.exactDuration,
      message: durationException?.message ?? "The selected safe, goal-relevant blocks total exactly 25 minutes.",
      relatedGraphId: emphasis.primary.graphId,
    },
  ];
  const plan = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: planId,
    athleteId: input.intent.athleteId,
    createdAt: input.createdAt,
    catalogueVersion: input.bundle.catalogueVersion,
    generatorPolicyId: policy.id,
    generatorPolicyVersion: policy.version,
    definitionReferences,
    intendedDurationSeconds: actualSeconds,
    items,
    rationale,
  } as const;
  const planValidation = validateSessionPlan(plan);
  if (!planValidation.valid) {
    return {
      ok: false,
      generatorPolicyId: policy.id,
      generatorPolicyVersion: policy.version,
      projectionVersion: input.state.projectionVersion,
      sessionDemand: demand,
      emphasis,
      itemExplanations,
      trainabilityUsed: [],
      coverageGaps,
      ...(durationException ? { durationException } : {}),
      issues: [{
        severity: "error",
        code: planningReasonCodes.referenceInvalid,
        message: `Generated Session Plan failed domain validation: ${planValidation.issues
          .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`,
      }],
    };
  }
  const trainabilityUsed: PlannedTrainability[] = ordered.map((candidate) => ({
    exerciseId: candidate.exercise.id,
    exerciseDefinitionVersion: candidate.exercise.definitionVersion,
    prescriptionVariantId: candidate.variant.id,
    decision: candidate.evaluation.decision,
    reasonCodes: candidate.evaluation.reasonCodes,
  }));
  const generated = {
    ok: true,
    generatorPolicyId: policy.id,
    generatorPolicyVersion: policy.version,
    projectionVersion: input.state.projectionVersion,
    sessionDemand: demand,
    emphasis,
    plan,
    itemExplanations,
    trainabilityUsed,
    coverageGaps,
    ...(durationException ? { durationException } : {}),
    issues,
  } as const satisfies GeneratedSession;
  const planningValidation = validateGeneratedSession({
    generated,
    bundle: input.bundle,
    intent: input.intent,
    state: input.state,
    policy,
  });
  if (planningValidation.length) {
    return {
      ...generated,
      ok: false,
      issues: [...generated.issues, ...planningValidation],
    };
  }
  return generated;
};

export const generateVNextSession = (
  input: GenerateSessionInput,
  policy: GeneratorPolicy = vNextGeneratorPolicy,
): GeneratedSession => {
  const demand = input.sessionDemand ?? input.intent.defaultSessionDemand;
  const normalizedInput = { ...input, sessionDemand: demand };
  const inputIssues = validateInput(normalizedInput, policy);
  if (inputIssues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      generatorPolicyId: policy.id,
      generatorPolicyVersion: policy.version,
      projectionVersion: input.state.projectionVersion,
      sessionDemand: demand,
      itemExplanations: [],
      trainabilityUsed: [],
      coverageGaps: [],
      issues: inputIssues,
    };
  }
  const emphasisResult = planEmphasis(normalizedInput, policy);
  if (!emphasisResult.emphasis) {
    return {
      ok: false,
      generatorPolicyId: policy.id,
      generatorPolicyVersion: policy.version,
      projectionVersion: input.state.projectionVersion,
      sessionDemand: demand,
      itemExplanations: [],
      trainabilityUsed: [],
      coverageGaps: [],
      issues: [...inputIssues, ...emphasisResult.issues],
    };
  }
  const composed = composeSession(normalizedInput, emphasisResult.emphasis, policy);
  return {
    ...composed,
    issues: [...inputIssues, ...emphasisResult.issues, ...composed.issues]
      .filter((issue, index, all) => all.findIndex((candidate) =>
        candidate.severity === issue.severity
        && candidate.code === issue.code
        && candidate.message === issue.message) === index),
  };
};

/** Candidate requests for integrations that prefer one request-scoped Phase 3 projection. */
export const planningTrainabilityRequests = (bundle: GenerateSessionInput["bundle"]) =>
  bundle.exercises
    .filter((exercise) => exercise.lifecycle === "active")
    .flatMap((exercise) => exercise.prescriptionVariants.map((variant) => ({
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: variant.id,
    })))
    .sort((left, right) => left.exerciseId.localeCompare(right.exerciseId)
      || left.prescriptionVariantId.localeCompare(right.prescriptionVariantId));

export const generatedDemandProfile = (generated: GeneratedSession): DemandProfile =>
  mergeDemandProfiles(generated.plan?.items.map((item) => item.demand) ?? []);
