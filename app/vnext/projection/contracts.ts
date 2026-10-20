import type {
  AthleteEvidenceEvent,
  AthleteId,
  AthleteIntent,
  BenchmarkProtocolId,
  BenchmarkSubject,
  DefinitionBundle,
  DefinitionVersion,
  DemandProfile,
  DemandDomain,
  EquipmentId,
  ExerciseId,
  IsoTimestamp,
  MilestoneRef,
  ObservationMeasurement,
  ObservationSessionId,
  ObservationSourceRef,
  PrescriptionVariantId,
  ProjectionVersion,
  ReasonCode,
  SessionPlan,
  SessionRecord,
  DerivedAthleteState,
} from "../contracts";

export type ProjectionIssueSeverity = "warning" | "error";

export type ProjectionIssue = Readonly<{
  severity: ProjectionIssueSeverity;
  code: ReasonCode;
  message: string;
  source?: ObservationSourceRef;
}>;

export type NormalizedObservationStrength = "weak" | "development" | "benchmark";

/**
 * A single immutable fact source. One source may be evaluated against several
 * explicitly related protocols, but it is never copied into another event or
 * Session Record.
 */
export type NormalizedObservation = Readonly<{
  source: ObservationSourceRef;
  sourceKey: string;
  athleteId: AthleteId;
  occurredAt: IsoTimestamp;
  sessionKey: string;
  observationSessionId?: ObservationSessionId;
  catalogueVersion: DefinitionVersion;
  strength: NormalizedObservationStrength;
  /** Compatibility history has known participation but no exact item timing/prescription proof. */
  legacySparse: boolean;
  evidenceSource: "self-assessment" | "guided-test" | "athlete-report" | "migration" | "session-record";
  subject?: BenchmarkSubject;
  outcome?: "clean" | "partial" | "not-yet" | "symptom";
  benchmarkProtocolId?: BenchmarkProtocolId;
  benchmarkProtocolVersion?: DefinitionVersion;
  measurement?: ObservationMeasurement;
  assistance?: string;
  range?: string;
  perceivedExertion?: number;
  /** Preserved session feedback affects the next prescription, never capability. */
  reviewOutcome?: "clean" | "partial" | "not-today";
  reviewDifficulty?: "easy" | "right" | "hard";
  exerciseId?: ExerciseId;
  exerciseDefinitionVersion?: DefinitionVersion;
  prescriptionVariantId?: PrescriptionVariantId;
  participationSeconds: number;
  demand: DemandProfile;
  symptomOrInstability: boolean;
}>;

export type ProtocolReuseRule = Readonly<{
  sourceProtocolId: BenchmarkProtocolId;
  sourceProtocolVersion: DefinitionVersion;
  targetProtocolId: BenchmarkProtocolId;
  targetProtocolVersion: DefinitionVersion;
}>;

export type MechanicalPredecessorRule = Readonly<{
  stronger: MilestoneRef;
  predecessor: MilestoneRef;
}>;

export type SubjectVersionCompatibilityRule = Readonly<{
  subject: BenchmarkSubject;
  fromCatalogueVersion: DefinitionVersion;
  toCatalogueVersion: DefinitionVersion;
}>;

export type ProjectionPolicy = Readonly<{
  id: string;
  version: ProjectionVersion;
  recentLoadDays: number;
  highLoadModificationHours: number;
  difficultPerformanceModificationHours: number;
  maintenanceAfterDays: number;
  contradictionMinimumFailures: number;
  symptomRestrictionDays: number;
  protocolReuseRules: readonly ProtocolReuseRule[];
  mechanicalPredecessorRules: readonly MechanicalPredecessorRule[];
  /** Explicit only; equal subject IDs never imply cross-version equivalence. */
  subjectVersionCompatibilityRules: readonly SubjectVersionCompatibilityRule[];
  /** Own demonstrated ordinary practice only; never graph prerequisite eligibility. */
  measuredPlacementEntries?: readonly import("../placementEntry").PlacementEntryRule[];
  /** Audited physical exposure for restriction checks; never rewrites historical demand. */
  restrictionExposureRules?: readonly RestrictionExposureRule[];
  /** Exact current-guide apparatus corrections; native definitions remain unchanged. */
  additionalEquipmentRules?: readonly AdditionalEquipmentRule[];
}>;

export type AdditionalEquipmentRule = Readonly<{
  exerciseId: ExerciseId;
  exerciseDefinitionVersion: DefinitionVersion;
  prescriptionVariantIds: readonly PrescriptionVariantId[];
  equipment: readonly EquipmentId[];
}>;

export type RestrictionExposureRule = Readonly<{
  exerciseId: ExerciseId;
  exerciseDefinitionVersion: DefinitionVersion;
  prescriptionVariantIds: readonly PrescriptionVariantId[];
  demandDomains: readonly DemandDomain[];
}>;

export type TrainabilityRequest = Readonly<{
  exerciseId: ExerciseId;
  exerciseDefinitionVersion: DefinitionVersion;
  prescriptionVariantId: PrescriptionVariantId;
}>;

export type ProjectionInput = Readonly<{
  athleteId: AthleteId;
  asOf: IsoTimestamp;
  policy: ProjectionPolicy;
  definitionBundles: readonly DefinitionBundle[];
  evidenceEvents: readonly AthleteEvidenceEvent[];
  sessionPlans: readonly SessionPlan[];
  sessionRecords: readonly SessionRecord[];
  intent: AthleteIntent;
  trainabilityRequests?: readonly TrainabilityRequest[];
}>;

export type NormalizationInput = Pick<
  ProjectionInput,
  "athleteId" | "asOf" | "definitionBundles" | "evidenceEvents" | "sessionPlans" | "sessionRecords"
> & Readonly<{ includeGuidedPrescriptionIdentity?: boolean }>;

export type NormalizationResult = Readonly<{
  observations: readonly NormalizedObservation[];
  activeEvents: readonly AthleteEvidenceEvent[];
  activeRecords: readonly SessionRecord[];
  evidenceCursor?: string;
  sessionRecordCursor?: string;
  issues: readonly ProjectionIssue[];
}>;

export type ProjectionResult = Readonly<{
  ok: boolean;
  state?: DerivedAthleteState;
  issues: readonly ProjectionIssue[];
  normalizedObservationCount: number;
}>;

export type TrainabilityEvaluationInput = Readonly<{
  request: TrainabilityRequest;
  state: DerivedAthleteState;
  bundle: DefinitionBundle;
  asOf: IsoTimestamp;
  policy: ProjectionPolicy;
  intent: AthleteIntent;
}>;

export const milestoneKey = (milestone: MilestoneRef): string =>
  `${milestone.graphId}:${milestone.nodeId}`;

export const subjectKey = (subject: BenchmarkSubject): string =>
  subject.kind === "milestone"
    ? `milestone:${milestoneKey(subject.milestone)}`
    : `capacity:${subject.capacity.capacityId}:${subject.capacity.facetId}`;
