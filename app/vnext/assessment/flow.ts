import {
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type AthleteIntent,
  type BenchmarkProtocol,
  type BenchmarkProtocolId,
  type DefinitionBundle,
  type DemandDomain,
  type DerivedAthleteState,
  type EquipmentId,
  type GraphId,
} from "../contracts";
import { graphIds } from "../definitions/ids";
import {
  VNEXT_ASSESSMENT_POLICY_ID,
  VNEXT_ASSESSMENT_POLICY_VERSION,
  VNEXT_ASSESSMENT_SCHEMA_VERSION,
  assertAssessmentDraft,
  assessmentDraftId,
  isCanonicalIsoTimestamp,
  type AssessmentAnswerRecord,
  type AssessmentAnswerValue,
  type AssessmentDraft,
  type AssessmentExperience,
  type AssessmentPolicy,
  type AssessmentStep,
  type PlacementAnchor,
  type PlacementResponse,
} from "./contracts";
import { vNextAssessmentPolicy } from "./policy";

export type CreateAssessmentDraftInput = Readonly<{
  id: string;
  athleteId: AthleteIntent["athleteId"];
  createdAt: string;
  bundle: DefinitionBundle;
  existingIntent?: AthleteIntent;
  existingState?: DerivedAthleteState;
  mode?: AssessmentDraft["mode"];
  initialEquipment?: readonly EquipmentId[];
}>;

const safetyStep: AssessmentStep = {
  id: "context-safety",
  kind: "safety",
  title: "Current comfort and restrictions",
  prompt: "Is any movement or loading currently painful, symptomatic, medically restricted, or something you should not test today?",
};

const experienceStep: AssessmentStep = {
  id: "context-experience",
  kind: "experience",
  title: "Relevant experience",
  prompt: "How familiar are you with parallette support, compression, pushing or hand-balancing practice?",
};

const inactivityStep: AssessmentStep = {
  id: "context-inactivity",
  kind: "inactivity",
  title: "Recent training",
  prompt: "How recently have you trained these movement patterns consistently?",
};

const equipmentStep: AssessmentStep = {
  id: "equipment-selection",
  kind: "equipment",
  title: "Available setup",
  prompt: "Which equipment can you safely use for placement and later sessions?",
};

const inversionStep: AssessmentStep = {
  id: "context-inversion",
  kind: "inversion",
  title: "Inversion familiarity",
  prompt: "What is the highest inversion exposure that currently feels familiar and controlled?",
};

const reviewStep: AssessmentStep = {
  id: "assessment-review",
  kind: "review",
  title: "Your provisional starting points",
  prompt: "Review the estimates, restrictions and any short guided confirmation recommended next.",
};

const answerFor = <Kind extends AssessmentAnswerValue["kind"]>(
  draft: AssessmentDraft,
  kind: Kind,
): Extract<AssessmentAnswerValue, { kind: Kind }> | undefined =>
  draft.answers.find((answer) => answer.value.kind === kind)?.value as
    | Extract<AssessmentAnswerValue, { kind: Kind }>
    | undefined;

export const selectedAssessmentGoals = (draft: AssessmentDraft): readonly GraphId[] =>
  answerFor(draft, "goals")?.graphIds ?? draft.intentSeed.goals.map((goal) => goal.graphId);

export const selectedAssessmentEquipment = (draft: AssessmentDraft): readonly EquipmentId[] =>
  answerFor(draft, "equipment")?.equipment ?? draft.intentSeed.equipment;

export const assessmentResponseForAnchor = (
  draft: AssessmentDraft,
  anchorId: string,
): PlacementResponse | undefined => {
  const answer = draft.answers.find((item) => item.stepId === anchorId && item.value.kind === "anchor");
  return answer?.value.kind === "anchor" ? answer.value.response : undefined;
};

const protocolById = (bundle: DefinitionBundle, id: BenchmarkProtocolId): BenchmarkProtocol => {
  const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === id);
  if (!protocol) throw new TypeError(`Unknown assessment benchmark ${id}`);
  return protocol;
};

const protocolDemandDomains = (
  bundle: DefinitionBundle,
  protocolId: BenchmarkProtocolId,
): readonly DemandDomain[] => {
  const protocol = protocolById(bundle, protocolId);
  const exercise = bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === protocol.prescriptionVariantId)
    ?? exercise?.prescriptionVariants[0];
  return Object.entries(variant?.demand ?? {})
    .filter(([, level]) => level === "moderate" || level === "high")
    .map(([domain]) => domain as DemandDomain)
    .sort();
};

export const demandDomainsForAssessmentProtocol = protocolDemandDomains;

const equipmentAvailable = (
  draft: AssessmentDraft,
  protocol: BenchmarkProtocol,
): boolean => {
  const selected = new Set(selectedAssessmentEquipment(draft));
  return protocol.conditions.equipment.every((equipment) => selected.has(equipment));
};

const reportedRestrictionDomains = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
): ReadonlySet<DemandDomain> => {
  const domains = new Set<DemandDomain>();
  const safety = answerFor(draft, "safety");
  if (safety?.severity !== "none") for (const domain of safety?.demandDomains ?? []) domains.add(domain);
  for (const answer of draft.answers) {
    if (answer.value.kind !== "anchor" || answer.value.response !== "symptom") continue;
    const anchor = allAssessmentAnchors(vNextAssessmentPolicy).find((candidate) => candidate.id === answer.stepId);
    if (!anchor) continue;
    for (const domain of protocolDemandDomains(bundle, anchor.protocolId)) domains.add(domain);
  }
  return domains;
};

const anchorCanBeAsked = (
  draft: AssessmentDraft,
  anchor: PlacementAnchor,
  bundle: DefinitionBundle,
): boolean => {
  const protocol = protocolById(bundle, anchor.protocolId);
  if (!equipmentAvailable(draft, protocol)) return false;
  const restricted = reportedRestrictionDomains(draft, bundle);
  if (protocolDemandDomains(bundle, anchor.protocolId).some((domain) => restricted.has(domain))) return false;
  const familiarity = answerFor(draft, "inversion")?.familiarity;
  if (anchor.inversionExposure === "full" && familiarity === "none") return false;
  return true;
};

const allAssessmentAnchors = (policy: AssessmentPolicy): readonly PlacementAnchor[] => [
  ...policy.commonAnchors,
  ...[...policy.goalLadders.values()].flat(),
];

const anchorByProtocol = (
  draft: AssessmentDraft,
  protocolId: BenchmarkProtocolId,
  policy: AssessmentPolicy,
): AssessmentAnswerRecord | undefined => {
  const ids = new Set(allAssessmentAnchors(policy)
    .filter((anchor) => anchor.protocolId === protocolId)
    .map((anchor) => anchor.id));
  return [...draft.answers].reverse().find((answer) =>
    ids.has(answer.stepId) && answer.value.kind === "anchor");
};

const experienceStart = (
  draft: AssessmentDraft,
  graphId: GraphId,
  ladderLength: number,
): number => {
  const experience: AssessmentExperience = answerFor(draft, "experience")?.experience ?? "new";
  if (experience !== "experienced") return 0;
  if (graphId === graphIds.handstandBalance) {
    const familiarity = answerFor(draft, "inversion")?.familiarity;
    if (familiarity === "freestanding") return Math.min(2, ladderLength - 1);
  }
  return Math.min(1, ladderLength - 1);
};

const nextLadderAnchor = (
  draft: AssessmentDraft,
  graphId: GraphId,
  ladder: readonly PlacementAnchor[],
  bundle: DefinitionBundle,
  policy: AssessmentPolicy,
): PlacementAnchor | undefined => {
  const askable = ladder.filter((anchor) => anchorCanBeAsked(draft, anchor, bundle));
  if (!askable.length) return undefined;
  const answerAt = new Map<number, AssessmentAnswerRecord>();
  ladder.forEach((anchor, index) => {
    const answer = anchorByProtocol(draft, anchor.protocolId, policy);
    if (answer) answerAt.set(index, answer);
  });
  if (!answerAt.size) {
    const start = experienceStart(draft, graphId, ladder.length);
    return askable.find((anchor) => Number(anchor.ladderIndex) >= start) ?? askable.at(-1);
  }
  const latest = [...answerAt.entries()].sort((left, right) =>
    Date.parse(left[1].answeredAt) - Date.parse(right[1].answeredAt))[answerAt.size - 1];
  if (!latest) return undefined;
  const [index, record] = latest;
  const value = record.value;
  if (value.kind !== "anchor") return undefined;
  const response = value.response;
  if (response === "symptom") return undefined;
  if (response === "clean") {
    if ([...answerAt.entries()].some(([other, answer]) => other > index
      && answer.value.kind === "anchor" && answer.value.response !== "clean")) return undefined;
    return askable.find((anchor) => Number(anchor.ladderIndex) > index
      && !answerAt.has(Number(anchor.ladderIndex)));
  }
  return [...askable].reverse().find((anchor) => Number(anchor.ladderIndex) < index
    && !answerAt.has(Number(anchor.ladderIndex)));
};

const goalsStep = (policy: AssessmentPolicy): AssessmentStep => ({
  id: "goal-selection",
  kind: "goals",
  title: "Choose what matters most",
  prompt: `Choose one to ${policy.maximumGoals} goals. The first is primary; irrelevant branches will be skipped.`,
  options: policy.goalOptions,
});

const targetedProtocols = (
  state: DerivedAthleteState | undefined,
  bundle: DefinitionBundle,
  preferredGraphs: readonly GraphId[],
  maximum: number,
): readonly BenchmarkProtocolId[] => {
  if (!state) return [];
  const preferred = new Set(preferredGraphs);
  const graphOrder = new Map(bundle.graphs.map((graph) => [
    graph.id,
    new Map(graph.nodes.map((node, index) => [node.id, index])),
  ]));
  const candidates = state.nodeStates
    .filter((node) => node.lifecycle !== "unknown"
      && (node.lifecycle !== "established" || node.confidence !== "current"))
    .filter((node) => !preferred.size || preferred.has(node.milestone.graphId))
    .map((node) => {
      const graph = bundle.graphs.find((candidate) => candidate.id === node.milestone.graphId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.milestone.nodeId);
      const protocolId = definition?.benchmarkProtocolIds[0];
      return protocolId ? {
        protocolId,
        graphId: node.milestone.graphId,
        order: graphOrder.get(node.milestone.graphId)?.get(node.milestone.nodeId) ?? -1,
      } : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((left, right) => Number(preferred.has(right.graphId)) - Number(preferred.has(left.graphId))
      || right.order - left.order
      || left.protocolId.localeCompare(right.protocolId));
  const result: BenchmarkProtocolId[] = [];
  const usedGraphs = new Set<GraphId>();
  for (const candidate of candidates) {
    if (usedGraphs.has(candidate.graphId)) continue;
    result.push(candidate.protocolId);
    usedGraphs.add(candidate.graphId);
    if (result.length >= maximum) break;
  }
  return result;
};

export const createAssessmentDraft = (
  input: CreateAssessmentDraftInput,
  policy: AssessmentPolicy = vNextAssessmentPolicy,
): AssessmentDraft => {
  if (!isCanonicalIsoTimestamp(input.createdAt)) throw new TypeError("Assessment creation time must be canonical UTC");
  if (input.existingIntent && input.existingIntent.athleteId !== input.athleteId) {
    throw new TypeError("Existing Athlete Intent belongs to another athlete");
  }
  if (input.existingIntent && Date.parse(input.existingIntent.updatedAt) > Date.parse(input.createdAt)) {
    throw new TypeError("Assessment cannot start from a future Athlete Intent revision");
  }
  if (input.existingState && input.existingState.athleteId !== input.athleteId) {
    throw new TypeError("Existing derived state belongs to another athlete");
  }
  const mode = input.mode ?? (input.existingIntent && input.existingState
    ? "targeted-reconfirmation"
    : "new-placement");
  const defaultEquipment = input.initialEquipment ?? [
    parseStableId("equipment", "floor"),
    parseStableId("equipment", "parallettes"),
  ];
  const intentSeed = input.existingIntent ? {
    goals: input.existingIntent.goals,
    equipment: input.existingIntent.equipment,
    defaultSessionDemand: input.existingIntent.defaultSessionDemand,
    preferences: input.existingIntent.preferences,
  } : {
    goals: [],
    equipment: defaultEquipment,
    defaultSessionDemand: "standard" as const,
    preferences: { specialistOptIn: false },
  };
  const preferredGraphs = intentSeed.goals.map((goal) => goal.graphId);
  const draft: AssessmentDraft = {
    schemaVersion: VNEXT_ASSESSMENT_SCHEMA_VERSION,
    id: assessmentDraftId(input.id),
    athleteId: input.athleteId,
    policyId: VNEXT_ASSESSMENT_POLICY_ID,
    policyVersion: VNEXT_ASSESSMENT_POLICY_VERSION,
    catalogueVersion: input.bundle.catalogueVersion,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    mode,
    intentSeed,
    targetedProtocolIds: mode === "targeted-reconfirmation"
      ? targetedProtocols(input.existingState, input.bundle, preferredGraphs, policy.maximumGuidedTestsPerReview)
      : [],
    answers: [],
    history: [],
    revision: 0,
    status: "in-progress",
  };
  assertAssessmentDraft(draft, input.bundle);
  return draft;
};

export const nextAssessmentStep = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  policy: AssessmentPolicy = vNextAssessmentPolicy,
): AssessmentStep => {
  assertAssessmentDraft(draft, bundle);
  if (!answerFor(draft, "safety")) return safetyStep;
  if (draft.mode === "targeted-reconfirmation") {
    if (!selectedAssessmentGoals(draft).length) return goalsStep(policy);
    return reviewStep;
  }
  if (!answerFor(draft, "experience")) return experienceStep;
  if (!answerFor(draft, "inactivity")) return inactivityStep;
  if (!selectedAssessmentGoals(draft).length || !answerFor(draft, "goals")) return goalsStep(policy);
  if (!answerFor(draft, "equipment")) return equipmentStep;
  const selectedGoals = selectedAssessmentGoals(draft);
  const needsInversion = policy.goalOptions.some((goal) =>
    selectedGoals.includes(goal.graphId) && goal.requiresInversionContext);
  if (needsInversion && !answerFor(draft, "inversion")) return inversionStep;
  for (const anchor of policy.commonAnchors) {
    if (!anchorCanBeAsked(draft, anchor, bundle)) continue;
    if (!anchorByProtocol(draft, anchor.protocolId, policy)) {
      return { id: anchor.id, kind: "anchor", title: anchor.label, prompt: anchor.prompt, anchor };
    }
  }
  for (const graphId of selectedGoals) {
    const ladder = policy.goalLadders.get(graphId) ?? [];
    const anchor = nextLadderAnchor(draft, graphId, ladder, bundle, policy);
    if (anchor) return { id: anchor.id, kind: "anchor", title: anchor.label, prompt: anchor.prompt, anchor };
  }
  return reviewStep;
};

const assertAnswerMatchesStep = (
  step: AssessmentStep,
  value: AssessmentAnswerValue,
  policy: AssessmentPolicy,
): void => {
  if (step.kind === "review" || step.kind !== value.kind) throw new TypeError(`Answer does not match ${step.id}`);
  if (value.kind === "safety") {
    if (value.severity === "none") return;
    if (!value.demandDomains?.length || !value.bodyRegions?.length) {
      throw new TypeError("A restriction requires affected demands and body regions");
    }
    if (new Set(value.demandDomains).size !== value.demandDomains.length
      || new Set(value.bodyRegions).size !== value.bodyRegions.length) {
      throw new TypeError("Restriction details must not contain duplicates");
    }
  }
  if (value.kind === "goals") {
    const supported = new Set(policy.goalOptions.map((goal) => goal.graphId));
    if (value.graphIds.length < 1 || value.graphIds.length > policy.maximumGoals
      || new Set(value.graphIds).size !== value.graphIds.length
      || value.graphIds.some((graphId) => !supported.has(graphId))) {
      throw new TypeError("Choose a unique supported goal set within the policy limit");
    }
  }
  if (value.kind === "equipment" && (!value.equipment.length
    || new Set(value.equipment).size !== value.equipment.length)) {
    throw new TypeError("Choose at least one unique equipment option");
  }
  if (value.kind === "anchor" && value.response === "symptom" && value.bodyRegions
    && new Set(value.bodyRegions).size !== value.bodyRegions.length) {
    throw new TypeError("Symptom body regions must not contain duplicates");
  }
};

export const answerAssessmentStep = (
  draft: AssessmentDraft,
  value: AssessmentAnswerValue,
  answeredAt: string,
  bundle: DefinitionBundle,
  policy: AssessmentPolicy = vNextAssessmentPolicy,
): AssessmentDraft => {
  if (draft.status !== "in-progress") throw new TypeError("A committed assessment cannot be edited");
  if (!isCanonicalIsoTimestamp(answeredAt) || Date.parse(answeredAt) < Date.parse(draft.updatedAt)) {
    throw new TypeError("Assessment answers must append in canonical time order");
  }
  const step = nextAssessmentStep(draft, bundle, policy);
  assertAnswerMatchesStep(step, value, policy);
  const answer: AssessmentAnswerRecord = { stepId: step.id, answeredAt, value };
  const updated: AssessmentDraft = {
    ...draft,
    updatedAt: answeredAt,
    answers: [...draft.answers, answer],
    history: [...draft.history, step.id],
    revision: draft.revision + 1,
  };
  assertAssessmentDraft(updated, bundle);
  return updated;
};

export const goBackAssessment = (
  draft: AssessmentDraft,
  updatedAt: string,
  bundle: DefinitionBundle,
): AssessmentDraft => {
  if (draft.status !== "in-progress") throw new TypeError("A committed assessment cannot be edited");
  if (!draft.answers.length) return draft;
  if (!isCanonicalIsoTimestamp(updatedAt) || Date.parse(updatedAt) < Date.parse(draft.updatedAt)) {
    throw new TypeError("Assessment back navigation must append in canonical time order");
  }
  const updated: AssessmentDraft = {
    ...draft,
    updatedAt,
    answers: draft.answers.slice(0, -1),
    history: draft.history.slice(0, -1),
    revision: draft.revision + 1,
  };
  assertAssessmentDraft(updated, bundle);
  return updated;
};

export const editAssessmentAnswer = (
  draft: AssessmentDraft,
  stepId: string,
  replacement: AssessmentAnswerValue,
  updatedAt: string,
  bundle: DefinitionBundle,
  policy: AssessmentPolicy = vNextAssessmentPolicy,
): AssessmentDraft => {
  if (draft.status !== "in-progress") throw new TypeError("A committed assessment cannot be edited");
  if (!isCanonicalIsoTimestamp(updatedAt) || Date.parse(updatedAt) < Date.parse(draft.updatedAt)) {
    throw new TypeError("Assessment edits must append in canonical time order");
  }
  const index = draft.history.indexOf(stepId);
  if (index < 0) throw new TypeError(`Assessment step ${stepId} has not been answered`);
  const truncated: AssessmentDraft = {
    ...draft,
    status: "in-progress",
    committedAt: undefined,
    updatedAt,
    answers: draft.answers.slice(0, index),
    history: draft.history.slice(0, index),
    revision: draft.revision + 1,
  };
  return answerAssessmentStep(truncated, replacement, updatedAt, bundle, policy);
};

export const assessmentPromptTiming = (draft: AssessmentDraft): Readonly<{
  promptCount: number;
  estimatedMinutes: number;
}> => {
  const anchorCount = draft.answers.filter((answer) => answer.value.kind === "anchor").length;
  const contextCount = draft.answers.length - anchorCount;
  return {
    promptCount: draft.answers.length,
    estimatedMinutes: Math.max(1, Math.ceil(((anchorCount * 40) + (contextCount * 20)) / 60)),
  };
};

export const protocolAnswerRecords = (
  draft: AssessmentDraft,
  policy: AssessmentPolicy = vNextAssessmentPolicy,
): readonly Readonly<{
  anchor: PlacementAnchor;
  answer: AssessmentAnswerRecord & Readonly<{ value: Extract<AssessmentAnswerValue, { kind: "anchor" }> }>;
}>[] => {
  const anchors = new Map(allAssessmentAnchors(policy).map((anchor) => [anchor.id, anchor]));
  return draft.answers.flatMap((answer) => {
    const anchor = anchors.get(answer.stepId);
    return anchor && answer.value.kind === "anchor"
      ? [{ anchor, answer: answer as AssessmentAnswerRecord & Readonly<{ value: Extract<AssessmentAnswerValue, { kind: "anchor" }> }> }]
      : [];
  });
};

export const isAssessmentAtReview = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  policy: AssessmentPolicy = vNextAssessmentPolicy,
): boolean => nextAssessmentStep(draft, bundle, policy).kind === "review";

export const domainSchemaVersionForAssessment = DOMAIN_SCHEMA_VERSION;
