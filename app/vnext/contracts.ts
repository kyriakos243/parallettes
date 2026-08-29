/**
 * Parallette25 vNext domain contracts.
 *
 * Phase 1 defines vocabulary only. Nothing in this module is wired into the
 * live v1.2 assessment, generator, persistence, profile, or UI paths.
 */

export const DOMAIN_SCHEMA_VERSION = 1 as const;
export type DomainSchemaVersion = typeof DOMAIN_SCHEMA_VERSION;

// Opaque persisted IDs may begin with a digit so existing UUID profile IDs are
// accepted. New authored definition IDs use lower-kebab form by convention.
export const MAX_STABLE_ID_LENGTH = 180;
export const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u;
export const MAX_ANY_OF_OPTIONS = 4;

export type StableIdKind =
  | "assessment-draft"
  | "athlete"
  | "benchmark"
  | "branch"
  | "capacity"
  | "capacity-facet"
  | "equipment"
  | "event"
  | "exercise"
  | "graph"
  | "node"
  | "observation-session"
  | "plan-item"
  | "policy"
  | "prescription"
  | "reason"
  | "session-plan"
  | "session-record";

declare const stableIdBrand: unique symbol;
export type StableId<Kind extends StableIdKind> = string & {
  readonly [stableIdBrand]: Kind;
};

declare const definitionVersionBrand: unique symbol;
export type DefinitionVersion = number & {
  readonly [definitionVersionBrand]: "definition-version";
};

declare const projectionVersionBrand: unique symbol;
export type ProjectionVersion = number & {
  readonly [projectionVersionBrand]: "projection-version";
};

export const isStableId = (value: unknown): value is string =>
  typeof value === "string"
  && value.length <= MAX_STABLE_ID_LENGTH
  && STABLE_ID_PATTERN.test(value);

export const parseStableId = <Kind extends StableIdKind>(
  kind: Kind,
  value: string,
): StableId<Kind> => {
  if (!isStableId(value)) {
    throw new Error(`Invalid ${kind} ID: ${value}`);
  }
  return value as StableId<Kind>;
};

const parsePositiveVersion = <Version extends number>(
  label: string,
  value: number,
): Version => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as Version;
};

export const parseDefinitionVersion = (value: number): DefinitionVersion =>
  parsePositiveVersion<DefinitionVersion>("Definition version", value);

export const parseProjectionVersion = (value: number): ProjectionVersion =>
  parsePositiveVersion<ProjectionVersion>("Projection version", value);

export type AthleteId = StableId<"athlete">;
export type AssessmentDraftId = StableId<"assessment-draft">;
export type BenchmarkProtocolId = StableId<"benchmark">;
export type BranchId = StableId<"branch">;
export type CapacityId = StableId<"capacity">;
export type CapacityFacetId = StableId<"capacity-facet">;
export type EquipmentId = StableId<"equipment">;
export type EvidenceEventId = StableId<"event">;
export type ExerciseId = StableId<"exercise">;
export type GraphId = StableId<"graph">;
export type NodeId = StableId<"node">;
export type ObservationSessionId = StableId<"observation-session">;
export type PlanItemId = StableId<"plan-item">;
export type PolicyId = StableId<"policy">;
export type PrescriptionVariantId = StableId<"prescription">;
export type ReasonCode = StableId<"reason">;
export type SessionPlanId = StableId<"session-plan">;
export type SessionRecordId = StableId<"session-record">;

export type IsoTimestamp = string;

export type DefinitionReference = Readonly<{
  kind: "exercise" | "graph" | "capacity" | "benchmark" | "policy";
  id: string;
  version: DefinitionVersion;
}>;

export type MilestoneRef = Readonly<{
  graphId: GraphId;
  nodeId: NodeId;
}>;

export type CapacityFacetRef = Readonly<{
  capacityId: CapacityId;
  facetId: CapacityFacetId;
}>;

export type PrerequisiteRef =
  | Readonly<{ kind: "milestone"; milestone: MilestoneRef }>
  | Readonly<{ kind: "capacity-facet"; capacity: CapacityFacetRef }>
  | Readonly<{ kind: "benchmark"; benchmarkProtocolId: BenchmarkProtocolId }>;

/**
 * Deliberately non-recursive prerequisite grammar.
 * Every allOf item is required; when anyOf is present, at least one of its
 * two-to-four alternatives is also required.
 */
export type PrerequisiteRule = Readonly<{
  allOf?: readonly PrerequisiteRef[];
  anyOf?: readonly PrerequisiteRef[];
}>;

export const EXERCISE_ROLES = [
  "outcome-milestone",
  "benchmark-test",
  "development-drill",
  "capacity-accessory",
  "technique-safety",
  "preparation-recovery",
  "conditioning",
] as const;
export type ExerciseRole = (typeof EXERCISE_ROLES)[number];

export const DEMAND_DOMAINS = [
  "hand-wrist-bearing",
  "forward-straight-arm-upper-limb",
  "overhead-straight-arm-upper-limb",
  "horizontal-bent-arm-push",
  "vertical-bent-arm-push",
  "inversion-technical",
  "compression-trunk",
] as const;
export type DemandDomain = (typeof DEMAND_DOMAINS)[number];
export type DemandLevel = "low" | "moderate" | "high";
export type DemandProfile = Readonly<Partial<Record<DemandDomain, DemandLevel>>>;

export type PrescriptionTarget =
  | Readonly<{ kind: "repetitions"; minimum: number; maximum?: number }>
  | Readonly<{ kind: "duration-seconds"; minimum: number; maximum?: number }>
  | Readonly<{ kind: "attempts"; minimum: number; maximum?: number }>
  | Readonly<{
    kind: "interval";
    workSeconds: number;
    restSeconds: number;
    rounds: number;
  }>
  | Readonly<{ kind: "quality"; description: string }>;

export type PrescriptionVariant = Readonly<{
  id: PrescriptionVariantId;
  label: string;
  target: PrescriptionTarget;
  assistance?: string;
  range?: string;
  demand: DemandProfile;
}>;

export type ExerciseMedia = Readonly<{
  kind: "motion" | "image" | "video";
  reference: string;
  description: string;
}>;

export type ExerciseRelation = Readonly<{
  kind: "regression" | "assistance" | "substitution";
  targetExerciseId: ExerciseId;
  fromPrescriptionVariantId?: PrescriptionVariantId;
  targetPrescriptionVariantId?: PrescriptionVariantId;
}>;

export type ExerciseDefinition = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: ExerciseId;
  definitionVersion: DefinitionVersion;
  lifecycle: "active" | "deprecated";
  name: string;
  description: string;
  instructions: Readonly<{
    how: string;
    cues: readonly string[];
    avoid?: readonly string[];
  }>;
  media: readonly ExerciseMedia[];
  equipment: readonly EquipmentId[];
  roles: readonly ExerciseRole[];
  graphLinks: readonly Readonly<{
    graphId: GraphId;
    nodeId?: NodeId;
    contribution: "milestone" | "development" | "technique" | "transition";
  }>[];
  capacityLinks: readonly Readonly<{
    capacityId: CapacityId;
    facetIds: readonly CapacityFacetId[];
  }>[];
  prescriptionVariants: readonly PrescriptionVariant[];
  benchmarkProtocolIds: readonly BenchmarkProtocolId[];
  relations: readonly ExerciseRelation[];
  safetyNotes: readonly string[];
}>;

export type GraphKind = "outcome-family" | "foundation-track" | "composite";
export type ProgressionTier = "foundation" | "intermediate" | "advanced" | "specialist";
export type ProgrammingBoundary = "automatic" | "stronger-gated" | "specialist";

export type DevelopmentNode = Readonly<{
  id: NodeId;
  branchId: BranchId;
  label: string;
  description: string;
  progressionTier: ProgressionTier;
  programmingBoundary: ProgrammingBoundary;
  implementationStatus: "available" | "missing-content";
  prerequisiteRule?: PrerequisiteRule;
  benchmarkProtocolIds: readonly BenchmarkProtocolId[];
}>;

export type DevelopmentBranch = Readonly<{
  id: BranchId;
  label: string;
  description: string;
}>;

export type DevelopmentGraph = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: GraphId;
  definitionVersion: DefinitionVersion;
  kind: GraphKind;
  label: string;
  description: string;
  branches: readonly DevelopmentBranch[];
  nodes: readonly DevelopmentNode[];
}>;

export type CapacityFacet = Readonly<{
  id: CapacityFacetId;
  label: string;
  description: string;
  benchmarkProtocolIds: readonly BenchmarkProtocolId[];
}>;

export type CapacityDefinition = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: CapacityId;
  definitionVersion: DefinitionVersion;
  label: string;
  description: string;
  facets: readonly CapacityFacet[];
  sharedGraphIds: readonly GraphId[];
}>;

export type BenchmarkSubject =
  | Readonly<{ kind: "milestone"; milestone: MilestoneRef }>
  | Readonly<{ kind: "capacity-facet"; capacity: CapacityFacetRef }>;

export type BenchmarkMetric =
  | Readonly<{ kind: "duration-seconds"; minimum: number; maximum?: number }>
  | Readonly<{ kind: "repetitions"; minimum: number; maximum?: number }>
  | Readonly<{
    kind: "successful-attempts";
    minimumSuccessful: number;
    maximumAttempts: number;
  }>
  | Readonly<{ kind: "range"; description: string }>
  | Readonly<{ kind: "quality"; description: string }>;

export type EvidenceSource =
  | "self-assessment"
  | "guided-test"
  | "athlete-report"
  | "migration"
  | "correction";

export type BenchmarkConfirmationSource = "guided-test" | "session-record";

export type BenchmarkProtocol = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: BenchmarkProtocolId;
  definitionVersion: DefinitionVersion;
  label: string;
  subject: BenchmarkSubject;
  exerciseId: ExerciseId;
  prescriptionVariantId?: PrescriptionVariantId;
  conditions: Readonly<{
    equipment: readonly EquipmentId[];
    assistance: string;
    range: string;
  }>;
  metric: BenchmarkMetric;
  qualityCriteria: readonly string[];
  safetyCriteria: readonly string[];
  confirmation: Readonly<{
    qualifyingObservations: number;
    minimumDistinctSessions: number;
    allowedSources: readonly BenchmarkConfirmationSource[];
    freshnessDays?: number;
  }>;
}>;

export type DefinitionBundle = Readonly<{
  schemaVersion: DomainSchemaVersion;
  catalogueVersion: DefinitionVersion;
  exercises: readonly ExerciseDefinition[];
  graphs: readonly DevelopmentGraph[];
  capacities: readonly CapacityDefinition[];
  benchmarkProtocols: readonly BenchmarkProtocol[];
}>;

export type ObservationMeasurement = Readonly<{
  value: number;
  unit: "seconds" | "repetitions" | "attempts" | "degrees";
  /** Required with attempt metrics when the protocol constrains total attempts. */
  attemptsTotal?: number;
}>;

/** Stable provenance for one raw observation. Derived findings may share it. */
export type ObservationSourceRef =
  | Readonly<{ kind: "evidence-event"; eventId: EvidenceEventId }>
  | Readonly<{
    kind: "session-item";
    sessionRecordId: SessionRecordId;
    planItemId: PlanItemId;
  }>;

type EvidenceEventBase = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: EvidenceEventId;
  athleteId: AthleteId;
  occurredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  source: EvidenceSource;
  catalogueVersion: DefinitionVersion;
}>;

export type PerformanceObservedEvent = EvidenceEventBase & Readonly<{
  type: "performance_observed";
  source: Exclude<EvidenceSource, "correction">;
  subject: BenchmarkSubject;
  outcome: "clean" | "partial" | "not-yet" | "symptom";
  benchmarkProtocolId?: BenchmarkProtocolId;
  benchmarkProtocolVersion?: DefinitionVersion;
  /** Groups standalone guided observations from the same real test sitting. */
  observationSessionId?: ObservationSessionId;
  measurement?: ObservationMeasurement;
  assistance?: string;
  range?: string;
  perceivedExertion?: number;
  notes?: string;
  legacySourceVersion?: "1.2";
  legacySourceReference?: string;
}>;

export type RestrictionReportedEvent = EvidenceEventBase & Readonly<{
  type: "restriction_reported";
  severity: "modify" | "block";
  demandDomains: readonly DemandDomain[];
  bodyRegions: readonly string[];
  notes?: string;
}>;

export type RestrictionClearedEvent = EvidenceEventBase & Readonly<{
  type: "restriction_cleared";
  restrictionEventId: EvidenceEventId;
  notes?: string;
}>;

export type LegacyClaimImportedEvent = EvidenceEventBase & Readonly<{
  type: "legacy_claim_imported";
  source: "migration";
  sourceVersion: "1.2";
  claim:
    | Readonly<{
      kind: "readiness-gate";
      legacyGateId: string;
      claimed: true;
    }>
    | Readonly<{
      kind: "progression-hint";
      legacyExerciseId: string;
      cleanSessions: number;
      lastFeedback?: "easy" | "right" | "hard";
    }>
    | Readonly<{
      kind: "assessment-answer";
      legacyTrackId: string;
      legacyAnchorExerciseId: string;
      answer: "clean" | "almost" | "not-yet";
    }>;
}>;

export type EvidenceCorrectedEvent = EvidenceEventBase & Readonly<{
  type: "evidence_corrected";
  source: "correction";
  supersedesEventId: EvidenceEventId;
  reason: string;
}>;

export type AthleteEvidenceEvent =
  | PerformanceObservedEvent
  | RestrictionReportedEvent
  | RestrictionClearedEvent
  | LegacyClaimImportedEvent
  | EvidenceCorrectedEvent;

export type SessionDemand = "technique" | "standard" | "challenge";

export type AthleteGoal = Readonly<{
  graphId: GraphId;
  targetNodeId?: NodeId;
  priority: "primary" | "secondary" | "interest";
}>;

export type AthleteIntent = Readonly<{
  schemaVersion: DomainSchemaVersion;
  athleteId: AthleteId;
  updatedAt: IsoTimestamp;
  goals: readonly AthleteGoal[];
  emphasisOverride?: Readonly<{
    primaryGraphId: GraphId;
    secondaryGraphId?: GraphId;
  }>;
  equipment: readonly EquipmentId[];
  defaultSessionDemand: SessionDemand;
  preferences: Readonly<{
    preferredDurationMinutes?: number;
    specialistOptIn: boolean;
  }>;
}>;

export type SessionPurpose =
  | "preparation"
  | "primary-development"
  | "secondary-development"
  | "maintenance"
  | "guided-test"
  | "recovery";

export type SessionPlanItem = Readonly<{
  id: PlanItemId;
  exerciseId: ExerciseId;
  exerciseDefinitionVersion: DefinitionVersion;
  prescriptionVariantId: PrescriptionVariantId;
  benchmarkProtocolId?: BenchmarkProtocolId;
  benchmarkProtocolVersion?: DefinitionVersion;
  purpose: SessionPurpose;
  plannedSeconds: number;
  targetMilestone?: MilestoneRef;
  demand: DemandProfile;
}>;

/**
 * v1.2 did not retain an immutable plan, exact per-item timing, or performed
 * prescription. Reconstructed compatibility records keep that uncertainty
 * explicit so replay never treats invented precision as native evidence.
 */
export type LegacySparseSessionSource = Readonly<{
  kind: "legacy-v1.2-sparse";
  sourceVersion: "1.2";
  sourceSessionId: string;
  timingPrecision: "session-total-only";
  prescriptionPrecision: "catalogue-default-reconstruction";
  sourceTotalSeconds?: number;
  sourceDay?: number;
  sourceLevel?: string;
  sourceMode?: string;
}>;

export type SessionPlan = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: SessionPlanId;
  athleteId: AthleteId;
  createdAt: IsoTimestamp;
  catalogueVersion: DefinitionVersion;
  generatorPolicyId: PolicyId;
  generatorPolicyVersion: DefinitionVersion;
  definitionReferences: readonly DefinitionReference[];
  intendedDurationSeconds: number;
  items: readonly SessionPlanItem[];
  legacySource?: LegacySparseSessionSource;
  rationale: readonly Readonly<{
    code: ReasonCode;
    message: string;
    relatedGraphId?: GraphId;
  }>[];
}>;

export type SessionItemOutcome = Readonly<{
  planItemId: PlanItemId;
  status: "completed" | "modified" | "skipped";
  participationSeconds: number;
  /** Zero with this marker means participation was known but item timing was not. */
  participationBasis?: "measured" | "legacy-unknown";
  performedExerciseId?: ExerciseId;
  performedExerciseDefinitionVersion?: DefinitionVersion;
  performedPrescriptionVariantId?: PrescriptionVariantId;
  modificationReason?: string;
  benchmarkObservation?: Readonly<{
    subject: BenchmarkSubject;
    benchmarkProtocolId: BenchmarkProtocolId;
    benchmarkProtocolVersion: DefinitionVersion;
    outcome: "clean" | "partial" | "not-yet" | "symptom";
    measurement?: ObservationMeasurement;
    assistance?: string;
    range?: string;
    perceivedExertion?: number;
  }>;
  review?: Readonly<{
    outcome: "clean" | "partial" | "not-today";
    difficulty?: "easy" | "right" | "hard";
    symptomOrInstability?: boolean;
  }>;
}>;

export type SessionRecord = Readonly<{
  schemaVersion: DomainSchemaVersion;
  id: SessionRecordId;
  athleteId: AthleteId;
  planId: SessionPlanId;
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
  /** When this immutable record became known to the projection/sync log. */
  recordedAt: IsoTimestamp;
  status: "complete" | "modified" | "partial" | "abandoned";
  itemOutcomes: readonly SessionItemOutcome[];
  legacySource?: LegacySparseSessionSource;
  supersedesRecordId?: SessionRecordId;
}>;

export type NodeLifecycle =
  | "unknown"
  | "estimated"
  | "developing"
  | "demonstrated"
  | "established";
export type PerformanceConfidence = "unknown" | "current" | "stale" | "contradicted";
export type TrainabilityDecision = "allow" | "modify" | "block";

export type ReasonedMilestone = Readonly<{
  milestone: MilestoneRef;
  reasonCodes: readonly ReasonCode[];
}>;

export type LoadExposure = Readonly<{
  /** One source is represented once, even when it supports several findings. */
  source: ObservationSourceRef;
  occurredAt: IsoTimestamp;
  participationSeconds: number;
  demand: DemandProfile;
  exerciseId?: ExerciseId;
  exerciseDefinitionVersion?: DefinitionVersion;
  prescriptionVariantId?: PrescriptionVariantId;
  reviewOutcome?: "clean" | "partial" | "not-today";
  reviewDifficulty?: "easy" | "right" | "hard";
}>;

export type DerivedAthleteState = Readonly<{
  schemaVersion: DomainSchemaVersion;
  athleteId: AthleteId;
  projectionVersion: ProjectionVersion;
  /** Explicit projection cutoff; identical inputs at the same cutoff replay identically. */
  asOf: IsoTimestamp;
  observationCursors: Readonly<{
    evidenceEvents?: string;
    sessionRecords?: string;
  }>;
  nodeStates: readonly Readonly<{
    milestone: MilestoneRef;
    lifecycle: NodeLifecycle;
    confidence: PerformanceConfidence;
    /** Eligibility implications are not claims that this predecessor was demonstrated. */
    satisfiedForEligibilityBy: readonly Readonly<{
      milestone: MilestoneRef;
      supportingObservationRefs: readonly ObservationSourceRef[];
    }>[];
    supportingObservationRefs: readonly ObservationSourceRef[];
    reasonCodes: readonly ReasonCode[];
  }>[];
  capacityFindings: readonly Readonly<{
    capacity: CapacityFacetRef;
    finding: "unknown" | "estimated" | "demonstrated";
    /** True only when the exact movement-specific confirmation policy is met. */
    confirmationSatisfied: boolean;
    confidence: PerformanceConfidence;
    supportingObservationRefs: readonly ObservationSourceRef[];
    reasonCodes: readonly ReasonCode[];
  }>[];
  activeRestrictions: readonly Readonly<{
    source: ObservationSourceRef;
    decision: Exclude<TrainabilityDecision, "allow">;
    demandDomains: readonly DemandDomain[];
    bodyRegions: readonly string[];
    occurredAt: IsoTimestamp;
    reasonCodes: readonly ReasonCode[];
  }>[];
  reconfirmationRequirements: readonly Readonly<{
    source: ObservationSourceRef;
    triggeredBy?: ObservationSourceRef;
    requiredSince: IsoTimestamp;
    demandDomains: readonly DemandDomain[];
    reasonCodes: readonly ReasonCode[];
  }>[];
  recentLoad: Readonly<{
    from: IsoTimestamp;
    to: IsoTimestamp;
    demand: DemandProfile;
    exposures: readonly LoadExposure[];
  }>;
  workingNodes: readonly ReasonedMilestone[];
  maintenanceNeeds: readonly ReasonedMilestone[];
  eligibleTargets: readonly ReasonedMilestone[];
  trainabilityEvaluations: readonly Readonly<{
    exerciseId: ExerciseId;
    exerciseDefinitionVersion: DefinitionVersion;
    prescriptionVariantId: PrescriptionVariantId;
    decision: TrainabilityDecision;
    reasonCodes: readonly ReasonCode[];
    safeAlternative?: Readonly<{
      exerciseId: ExerciseId;
      exerciseDefinitionVersion: DefinitionVersion;
      prescriptionVariantId: PrescriptionVariantId;
    }>;
  }>[];
  recommendedEmphasis?: Readonly<{
    primaryGraphId: GraphId;
    secondaryGraphId?: GraphId;
    reasonCodes: readonly ReasonCode[];
  }>;
}>;
