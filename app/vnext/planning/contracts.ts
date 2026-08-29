import type {
  AthleteIntent,
  DefinitionBundle,
  DefinitionVersion,
  DemandDomain,
  DemandProfile,
  DerivedAthleteState,
  ExerciseId,
  GraphId,
  IsoTimestamp,
  MilestoneRef,
  PolicyId,
  PrerequisiteRef,
  ProjectionVersion,
  ReasonCode,
  SessionDemand,
  SessionPlan,
  SessionPlanItem,
  TrainabilityDecision,
} from "../contracts";
import type { ProjectionPolicy } from "../projection";

export type EmphasisFocusKind =
  | "development"
  | "reconfirmation"
  | "prerequisite-development"
  | "maintenance";

export type EmphasisFocus = Readonly<{
  graphId: GraphId;
  targetMilestone?: MilestoneRef;
  kind: EmphasisFocusKind;
  missingPrerequisites: readonly PrerequisiteRef[];
  reasonCodes: readonly ReasonCode[];
  userMessage: string;
}>;

/**
 * App-owned planning continuity. It is deliberately separate from Athlete
 * Intent so a recommendation can never become a user-authored goal.
 */
export type PreviousEmphasis = Readonly<{
  generatorPolicyId: PolicyId;
  generatorPolicyVersion: DefinitionVersion;
  primaryGraphId: GraphId;
  secondaryGraphId?: GraphId;
  goalSignature: string;
  completedEligibleSessions: number;
}>;

export type EmphasisPlan = Readonly<{
  primary: EmphasisFocus;
  secondary?: EmphasisFocus;
  maintenance: readonly EmphasisFocus[];
  deferredGraphIds: readonly GraphId[];
  goalSignature: string;
  retainedFromPrevious: boolean;
  reasonCodes: readonly ReasonCode[];
}>;

export type SessionBlockKind =
  | "preparation"
  | "technical"
  | "primary"
  | "supporting-capacity"
  | "supplemental"
  | "secondary"
  | "maintenance"
  | "recovery";

export type ItemExplanation = Readonly<{
  planItemId: SessionPlanItem["id"];
  block: SessionBlockKind;
  reasonCodes: readonly ReasonCode[];
  whySkill: string;
  whyExercise: string;
  whyIntensity: string;
}>;

export type DurationException = Readonly<{
  targetSeconds: number;
  actualSeconds: number;
  reasonCode: ReasonCode;
  message: string;
}>;

export type PlanningIssue = Readonly<{
  severity: "warning" | "error";
  code: ReasonCode;
  message: string;
}>;

export type CoverageGap = Readonly<{
  graphId: GraphId;
  targetMilestone?: MilestoneRef;
  kind: "missing-content" | "missing-safe-prescription" | "unscoped-content-excluded";
  reasonCodes: readonly ReasonCode[];
  message: string;
}>;

export type GeneratorPolicy = Readonly<{
  id: PolicyId;
  version: DefinitionVersion;
  exactDurationSeconds: number;
  maximumProjectionAgeSeconds: number;
  emphasisReviewMinimumSessions: number;
  emphasisReviewMaximumSessions: number;
  highUpperLimbDomains: readonly DemandDomain[];
  incompatibleGraphPairs: readonly (readonly [GraphId, GraphId])[];
  preparationExerciseIds: readonly ExerciseId[];
  recoveryExerciseIds: readonly ExerciseId[];
  blockSeconds: Readonly<Record<SessionDemand, Readonly<{
    preparation: number;
    technical: number;
    primary: number;
    supporting: number;
    supplemental: number;
    recovery: number;
  }>>>;
}>;

export type GenerateSessionInput = Readonly<{
  createdAt: IsoTimestamp;
  bundle: DefinitionBundle;
  intent: AthleteIntent;
  state: DerivedAthleteState;
  projectionPolicy: ProjectionPolicy;
  sessionDemand?: SessionDemand;
  /** Equal inputs and seed produce byte-identical planning output. */
  seed?: string;
  previousEmphasis?: PreviousEmphasis;
}>;

export type PlannedTrainability = Readonly<{
  exerciseId: SessionPlanItem["exerciseId"];
  exerciseDefinitionVersion: SessionPlanItem["exerciseDefinitionVersion"];
  prescriptionVariantId: SessionPlanItem["prescriptionVariantId"];
  decision: TrainabilityDecision;
  reasonCodes: readonly ReasonCode[];
}>;

export type GeneratedSession = Readonly<{
  ok: boolean;
  generatorPolicyId: PolicyId;
  generatorPolicyVersion: DefinitionVersion;
  projectionVersion: ProjectionVersion;
  sessionDemand: SessionDemand;
  emphasis?: EmphasisPlan;
  plan?: SessionPlan;
  itemExplanations: readonly ItemExplanation[];
  trainabilityUsed: readonly PlannedTrainability[];
  coverageGaps: readonly CoverageGap[];
  durationException?: DurationException;
  issues: readonly PlanningIssue[];
}>;

export type PlanValidationInput = Readonly<{
  generated: GeneratedSession;
  bundle: DefinitionBundle;
  intent: AthleteIntent;
  state: DerivedAthleteState;
  policy: GeneratorPolicy;
}>;

export type PlanningCandidateDemand = Readonly<{
  graphId: GraphId;
  demand: DemandProfile;
}>;
