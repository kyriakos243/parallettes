import {
  DEMAND_DOMAINS,
  DOMAIN_SCHEMA_VERSION,
  isStableId,
  parseDefinitionVersion,
  parseStableId,
  type AssessmentDraftId,
  type AthleteGoal,
  type AthleteId,
  type BenchmarkProtocolId,
  type BenchmarkSubject,
  type DefinitionBundle,
  type DefinitionVersion,
  type DemandDomain,
  type EquipmentId,
  type GraphId,
  type IsoTimestamp,
  type ObservationMeasurement,
  type PolicyId,
  type SessionDemand,
  type SessionPlanItem,
} from "../contracts";

export const VNEXT_ASSESSMENT_SCHEMA_VERSION = 1 as const;
export const VNEXT_ASSESSMENT_POLICY_VERSION = parseDefinitionVersion(1);
export const VNEXT_ASSESSMENT_POLICY_ID = parseStableId("policy", "vnext-adaptive-placement");

export type AssessmentMode = "new-placement" | "targeted-reconfirmation";
export type AssessmentExperience = "new" | "some" | "experienced";
export type AssessmentInactivity = "active" | "one-to-six-months" | "over-six-months";
export type InversionFamiliarity = "none" | "supported" | "freestanding";
export type PlacementResponse = "clean" | "partial" | "not-yet" | "not-sure" | "symptom";

export type AssessmentIntentSeed = Readonly<{
  goals: readonly AthleteGoal[];
  equipment: readonly EquipmentId[];
  defaultSessionDemand: SessionDemand;
  preferences: Readonly<{
    preferredDurationMinutes?: number;
    specialistOptIn: boolean;
  }>;
}>;

export type AssessmentAnswerValue =
  | Readonly<{
    kind: "safety";
    severity: "none" | "modify" | "block";
    demandDomains?: readonly DemandDomain[];
    bodyRegions?: readonly string[];
    notes?: string;
  }>
  | Readonly<{ kind: "experience"; experience: AssessmentExperience }>
  | Readonly<{ kind: "inactivity"; inactivity: AssessmentInactivity }>
  | Readonly<{ kind: "goals"; graphIds: readonly GraphId[] }>
  | Readonly<{ kind: "equipment"; equipment: readonly EquipmentId[] }>
  | Readonly<{ kind: "inversion"; familiarity: InversionFamiliarity }>
  | Readonly<{
    kind: "anchor";
    response: PlacementResponse;
    bodyRegions?: readonly string[];
    notes?: string;
  }>;

export type AssessmentAnswerRecord = Readonly<{
  stepId: string;
  answeredAt: IsoTimestamp;
  value: AssessmentAnswerValue;
}>;

/**
 * Resumable UI workflow state only. It is not evidence, does not sync, and is
 * excluded from projection/export until a completed draft is explicitly
 * committed into Athlete Intent and immutable Evidence Events.
 */
export type AssessmentDraft = Readonly<{
  schemaVersion: typeof VNEXT_ASSESSMENT_SCHEMA_VERSION;
  id: AssessmentDraftId;
  athleteId: AthleteId;
  policyId: PolicyId;
  policyVersion: DefinitionVersion;
  catalogueVersion: DefinitionVersion;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  mode: AssessmentMode;
  intentSeed: AssessmentIntentSeed;
  targetedProtocolIds: readonly BenchmarkProtocolId[];
  answers: readonly AssessmentAnswerRecord[];
  history: readonly string[];
  revision: number;
  status: "in-progress" | "committed";
  committedAt?: IsoTimestamp;
}>;

export type PlacementAnchor = Readonly<{
  id: string;
  label: string;
  prompt: string;
  protocolId: BenchmarkProtocolId;
  stage: "common" | "goal";
  goalGraphId?: GraphId;
  ladderIndex?: number;
  inversionExposure: "none" | "low" | "full";
}>;

export type AssessmentGoalOption = Readonly<{
  graphId: GraphId;
  label: string;
  description: string;
  requiresInversionContext: boolean;
}>;

export type AssessmentPolicy = Readonly<{
  id: PolicyId;
  version: DefinitionVersion;
  goalOptions: readonly AssessmentGoalOption[];
  commonAnchors: readonly PlacementAnchor[];
  goalLadders: ReadonlyMap<GraphId, readonly PlacementAnchor[]>;
  maximumGoals: number;
  maximumGuidedTestsPerReview: number;
}>;

export type AssessmentStep =
  | Readonly<{ id: "context-safety"; kind: "safety"; title: string; prompt: string }>
  | Readonly<{ id: "context-experience"; kind: "experience"; title: string; prompt: string }>
  | Readonly<{ id: "context-inactivity"; kind: "inactivity"; title: string; prompt: string }>
  | Readonly<{ id: "goal-selection"; kind: "goals"; title: string; prompt: string; options: readonly AssessmentGoalOption[] }>
  | Readonly<{ id: "equipment-selection"; kind: "equipment"; title: string; prompt: string }>
  | Readonly<{ id: "context-inversion"; kind: "inversion"; title: string; prompt: string }>
  | Readonly<{ id: string; kind: "anchor"; title: string; prompt: string; anchor: PlacementAnchor }>
  | Readonly<{ id: "assessment-review"; kind: "review"; title: string; prompt: string }>;

export type GuidedTestOffer = Readonly<{
  protocolId: BenchmarkProtocolId;
  subject: BenchmarkSubject;
  label: string;
  reason: "confirm-provisional" | "resolve-uncertainty" | "reconfirm-existing";
  availability: "available" | "blocked";
  blockers: readonly string[];
}>;

export type AssessmentReview = Readonly<{
  mode: AssessmentMode;
  promptCount: number;
  estimatedMinutes: number;
  provisional: readonly Readonly<{
    protocolId: BenchmarkProtocolId;
    subject: BenchmarkSubject;
    response: PlacementResponse;
  }>[];
  guidedTests: readonly GuidedTestOffer[];
  restrictionReported: boolean;
  completionMessage: string;
}>;

export type GuidedTestResultInput = Readonly<{
  eventId: string;
  observationSessionId: string;
  occurredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  protocolId: BenchmarkProtocolId;
  outcome: "clean" | "partial" | "not-yet" | "symptom";
  measurement?: ObservationMeasurement;
  perceivedExertion?: number;
  qualityCriteriaSatisfied: boolean;
  safetyCriteriaSatisfied: boolean;
  notes?: string;
}>;

export type WorkoutReviewPrompt = Readonly<{
  planItemId: SessionPlanItem["id"];
  exerciseId: SessionPlanItem["exerciseId"];
  purpose: SessionPlanItem["purpose"];
  asksOutcome: true;
  asksDifficulty: boolean;
  asksSymptomOrInstability: true;
}>;

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const isCanonicalIsoTimestamp = (value: unknown): value is IsoTimestamp => {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const assertUniqueStableIds = (values: readonly string[], label: string): void => {
  if (values.some((value) => !isStableId(value))) throw new TypeError(`Invalid ${label}`);
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label}`);
};

function assertStringArray(values: unknown, label: string, allowEmpty = true): asserts values is readonly string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new TypeError(`Invalid ${label}`);
  }
  if (!allowEmpty && !values.length) throw new TypeError(`Empty ${label}`);
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label}`);
}

const assertAnswerValue = (value: AssessmentAnswerValue, label: string): void => {
  if (!value || typeof value !== "object" || typeof value.kind !== "string") throw new TypeError(`Invalid ${label}`);
  if (value.kind === "safety") {
    if (!["none", "modify", "block"].includes(value.severity)) throw new TypeError(`Invalid ${label} severity`);
    if (value.severity !== "none") {
      assertStringArray(value.demandDomains, `${label} demand domains`, false);
      assertStringArray(value.bodyRegions, `${label} body regions`, false);
      if (value.demandDomains.some((domain) => !DEMAND_DOMAINS.includes(domain))) throw new TypeError(`Invalid ${label} demand domain`);
    }
    if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.trim() === "")) throw new TypeError(`Invalid ${label} notes`);
    return;
  }
  if (value.kind === "experience") {
    if (!["new", "some", "experienced"].includes(value.experience)) throw new TypeError(`Invalid ${label} experience`);
    return;
  }
  if (value.kind === "inactivity") {
    if (!["active", "one-to-six-months", "over-six-months"].includes(value.inactivity)) throw new TypeError(`Invalid ${label} inactivity`);
    return;
  }
  if (value.kind === "goals") {
    assertStringArray(value.graphIds, `${label} goals`, false);
    if (value.graphIds.length > 3 || value.graphIds.some((id) => !isStableId(id))) throw new TypeError(`Invalid ${label} goals`);
    return;
  }
  if (value.kind === "equipment") {
    assertStringArray(value.equipment, `${label} equipment`, false);
    if (value.equipment.some((id) => !isStableId(id))) throw new TypeError(`Invalid ${label} equipment`);
    return;
  }
  if (value.kind === "inversion") {
    if (!["none", "supported", "freestanding"].includes(value.familiarity)) throw new TypeError(`Invalid ${label} inversion`);
    return;
  }
  if (value.kind === "anchor") {
    if (!["clean", "partial", "not-yet", "not-sure", "symptom"].includes(value.response)) throw new TypeError(`Invalid ${label} response`);
    if (value.bodyRegions !== undefined) assertStringArray(value.bodyRegions, `${label} body regions`);
    if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.trim() === "")) throw new TypeError(`Invalid ${label} notes`);
    return;
  }
  throw new TypeError(`Unknown ${label} kind`);
};

export const assertAssessmentDraft = (
  value: AssessmentDraft,
  bundle?: DefinitionBundle,
): void => {
  if (!value || typeof value !== "object") throw new TypeError("Invalid assessment draft");
  if (value.schemaVersion !== VNEXT_ASSESSMENT_SCHEMA_VERSION
    || value.policyId !== VNEXT_ASSESSMENT_POLICY_ID
    || value.policyVersion !== VNEXT_ASSESSMENT_POLICY_VERSION) {
    throw new TypeError("Unsupported assessment draft version");
  }
  if (!isStableId(value.id) || !isStableId(value.athleteId)) throw new TypeError("Invalid assessment identity");
  if (!isCanonicalIsoTimestamp(value.createdAt) || !isCanonicalIsoTimestamp(value.updatedAt)) {
    throw new TypeError("Invalid assessment timestamp");
  }
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) throw new TypeError("Assessment update predates creation");
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new TypeError("Invalid assessment revision");
  if (value.mode !== "new-placement" && value.mode !== "targeted-reconfirmation") throw new TypeError("Invalid assessment mode");
  if (value.status !== "in-progress" && value.status !== "committed") throw new TypeError("Invalid assessment status");
  if ((value.status === "committed") !== (value.committedAt !== undefined)) throw new TypeError("Invalid assessment commit state");
  if (value.committedAt !== undefined && (!isCanonicalIsoTimestamp(value.committedAt)
    || Date.parse(value.committedAt) < Date.parse(value.updatedAt))) {
    throw new TypeError("Invalid assessment commit timestamp");
  }
  if (value.catalogueVersion < 1 || !Number.isSafeInteger(value.catalogueVersion)) throw new TypeError("Invalid assessment catalogue");
  if (!Array.isArray(value.targetedProtocolIds) || !Array.isArray(value.answers) || !Array.isArray(value.history)) {
    throw new TypeError("Invalid assessment collections");
  }
  if (!value.intentSeed || typeof value.intentSeed !== "object"
    || !Array.isArray(value.intentSeed.goals) || !Array.isArray(value.intentSeed.equipment)) {
    throw new TypeError("Invalid assessment intent seed");
  }
  assertUniqueStableIds(value.targetedProtocolIds, "targeted protocols");
  assertUniqueStableIds(value.intentSeed.equipment, "intent equipment");
  if (!value.intentSeed.equipment.length) throw new TypeError("Assessment requires available equipment");
  if (value.intentSeed.goals.some((goal) => !goal || typeof goal !== "object"
    || !isStableId(goal.graphId)
    || !["primary", "secondary", "interest"].includes(goal.priority)
    || (goal.targetNodeId !== undefined && !isStableId(goal.targetNodeId)))) {
    throw new TypeError("Invalid assessment intent goals");
  }
  const goalKeys = value.intentSeed.goals.map((goal) => goal.graphId);
  assertUniqueStableIds(goalKeys, "intent goals");
  if (!["technique", "standard", "challenge"].includes(value.intentSeed.defaultSessionDemand)
    || !value.intentSeed.preferences || typeof value.intentSeed.preferences !== "object"
    || typeof value.intentSeed.preferences.specialistOptIn !== "boolean"
    || (value.intentSeed.preferences.preferredDurationMinutes !== undefined
      && (!Number.isFinite(value.intentSeed.preferences.preferredDurationMinutes)
        || value.intentSeed.preferences.preferredDurationMinutes <= 0))) {
    throw new TypeError("Invalid assessment intent preferences");
  }
  if (value.answers.some((answer) => !answer || typeof answer !== "object" || !isStableId(answer.stepId))) {
    throw new TypeError("Invalid assessment answer");
  }
  const answerIds = value.answers.map((answer) => answer.stepId);
  assertUniqueStableIds(answerIds, "assessment answer steps");
  if (answerIds.length !== value.history.length
    || answerIds.some((id, index) => value.history[index] !== id)) {
    throw new TypeError("Assessment history must exactly match answer order");
  }
  for (const answer of value.answers) {
    assertAnswerValue(answer.value, `assessment answer ${answer.stepId}`);
    if (!isCanonicalIsoTimestamp(answer.answeredAt)
      || Date.parse(answer.answeredAt) < Date.parse(value.createdAt)
      || Date.parse(answer.answeredAt) > Date.parse(value.updatedAt)) {
      throw new TypeError(`Invalid assessment answer timestamp ${answer.stepId}`);
    }
  }
  if (bundle) {
    if (bundle.catalogueVersion !== value.catalogueVersion) throw new TypeError("Assessment catalogue is unavailable");
    const protocols = new Set(bundle.benchmarkProtocols.map((protocol) => protocol.id));
    if (value.targetedProtocolIds.some((id) => !protocols.has(id))) throw new TypeError("Assessment targets an unknown protocol");
    const graphs = new Set(bundle.graphs.map((graph) => graph.id));
    if (goalKeys.some((id) => !graphs.has(id))) throw new TypeError("Assessment intent uses an unknown graph");
  }
};

export const assessmentDraftId = (value: string): AssessmentDraftId =>
  parseStableId("assessment-draft", value);
