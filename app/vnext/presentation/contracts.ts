import type {
  AthleteGoal,
  AthleteIntent,
  BenchmarkProtocolId,
  DefinitionBundle,
  DefinitionVersion,
  DemandDomain,
  DerivedAthleteState,
  ExerciseId,
  GraphId,
  MilestoneRef,
  ObservationSourceRef,
  PlanItemId,
  PrerequisiteRef,
  PrescriptionVariantId,
  SessionDemand,
  SessionItemOutcome,
} from "../contracts";
import type { GuidedTestOffer } from "../assessment/contracts";
import type { GeneratedSession } from "../planning";

export type ObservationPresentationSourceKind =
  | "migration"
  | "assessment"
  | "guided-test"
  | "athlete-report"
  | "session"
  | "correction"
  | "unknown";

/**
 * Read-only provenance for honest display wording. It is never evidence
 * authority and is intentionally not persisted in Derived Athlete State.
 */
export type ObservationPresentationProvenance = ReadonlyMap<
  string,
  ObservationPresentationSourceKind
>;

export type ProgressPresentationInput = Readonly<{
  bundle: DefinitionBundle;
  state: DerivedAthleteState;
  intent: AthleteIntent;
  generatedSession?: GeneratedSession;
  provenance?: ObservationPresentationProvenance;
}>;

export type DemonstratedStatePresentation = Readonly<{
  kind: "none" | "provisional" | "demonstrated";
  label: string;
  supportingText: string;
  milestone?: MilestoneRef;
  historyRetained: boolean;
  sourceLabel?: "Imported starting point" | "Placement estimate" | "Provisional starting point";
}>;

export type ConfidencePresentation = Readonly<{
  state: "not-established" | "current" | "check-needed" | "conflicting-evidence";
  label: string;
  message: string;
}>;

export type AvailabilityPresentation = Readonly<{
  state: "available" | "modified" | "restricted" | "reconfirmation";
  label: string;
  message: string;
}>;

export type PrerequisitePresentation = Readonly<{
  key: string;
  ref: PrerequisiteRef;
  label: string;
  requirement: "required" | "one-of";
  state: "met" | "check-needed" | "not-yet";
  message: string;
}>;

export type TargetPresentation = Readonly<{
  milestone: MilestoneRef;
  label: string;
  state: "achievable" | "developing" | "needs-prerequisites" | "reconfirmation";
  message: string;
}>;

export type RecommendedFocusPresentation = Readonly<{
  kind: "primary" | "secondary" | "maintenance" | "build" | "restricted" | "reconfirm";
  label: string;
  message: string;
}>;

export type SkillFamilySummaryPresentation = Readonly<{
  graphId: GraphId;
  label: string;
  description: string;
  demonstratedState: DemonstratedStatePresentation;
  confidence: ConfidencePresentation;
  availability: AvailabilityPresentation;
  nextTarget?: TargetPresentation;
  prerequisites: readonly PrerequisitePresentation[];
  recommendedFocus: RecommendedFocusPresentation;
  action: Readonly<{
    kind: "open-skill-detail";
    label: string;
    graphId: GraphId;
  }>;
}>;

export type ProgressAndGoalsPresentation = Readonly<{
  title: "Progress & Goals";
  intro: string;
  families: readonly SkillFamilySummaryPresentation[];
  authorityNotice: string;
  canManuallyClaimSkills: false;
  exposesInternalScores: false;
}>;

export type SkillDetailPresentation = SkillFamilySummaryPresentation & Readonly<{
  title: string;
  currentLabel: string;
  nextLabel: string;
  requiresLabel: "Requires";
  whyNotYet?: string;
  demonstratedMilestones: readonly Readonly<{
    milestone: MilestoneRef;
    label: string;
    confidence: ConfidencePresentation;
  }>[];
  assessmentAction: Readonly<{
    kind: "start-guided-test" | "start-reconfirmation" | "reassess";
    label: string;
    graphId: GraphId;
    protocolIds: readonly BenchmarkProtocolId[];
  }>;
}>;

export type TodayFocusPresentation = Readonly<{
  graphId: GraphId;
  familyLabel: string;
  targetLabel?: string;
  label: string;
  reason: string;
}>;

export type TodayWorkoutPresentation = Readonly<{
  title: "Today's Workout";
  status: "ready" | "unavailable";
  focus?: TodayFocusPresentation;
  reason: string;
  primary?: TodayFocusPresentation;
  secondary?: TodayFocusPresentation;
  maintenance: readonly TodayFocusPresentation[];
  demand: Readonly<{
    value: SessionDemand;
    label: "Easier / Technique" | "Standard" | "Challenge";
    message: string;
  }>;
  blocks: readonly Readonly<{
    planItemId: PlanItemId;
    exerciseId: ExerciseId;
    exerciseName: string;
    blockLabel: string;
    plannedMinutes: number;
    reason: string;
    intensity: string;
  }>[];
  durationLabel?: string;
  authorityNotice: string;
  exposesRawAlgorithmDecisions: false;
}>;

export type GoalPriorityChoice = "primary" | "secondary";

export type GoalControlsPresentation = Readonly<{
  title: "Goals & emphasis";
  options: readonly Readonly<{
    graphId: GraphId;
    label: string;
    description: string;
    selectedPriority?: AthleteGoal["priority"];
    currentEmphasis?: "primary" | "secondary";
  }>[];
  primaryGraphId?: GraphId;
  secondaryGraphIds: readonly GraphId[];
  emphasis?: AthleteIntent["emphasisOverride"];
  authorityNotice: string;
  canUnlockSkills: false;
}>;

export type GoalControlSelection = Readonly<{
  goals: readonly Readonly<{
    graphId: GraphId;
    priority: GoalPriorityChoice;
  }>[];
  emphasis?: Readonly<{
    primaryGraphId: GraphId;
    secondaryGraphId?: GraphId;
  }>;
}>;

export type AssessmentEntryAction = Readonly<{
  id: string;
  kind: "reassessment" | "guided-test" | "reconfirmation";
  label: string;
  description: string;
  mode: "new-placement" | "targeted-reconfirmation";
  graphId?: GraphId;
  protocolIds: readonly BenchmarkProtocolId[];
  availability: "available" | "blocked";
  blockers: readonly string[];
}>;

export type AssessmentEntryPresentation = Readonly<{
  title: "Check or update my starting point";
  intro: string;
  actions: readonly AssessmentEntryAction[];
  canManuallyClaimSkills: false;
  authorityNotice: string;
}>;

export type AssessmentEntryInput = Readonly<{
  bundle: DefinitionBundle;
  state: DerivedAthleteState;
  intent: AthleteIntent;
  guidedTestOffers?: readonly GuidedTestOffer[];
  /**
   * Navigation context only. Existing immutable observations may be too weak
   * to create a projected finding, but still mean an imported athlete must be
   * offered targeted reconfirmation rather than full first-use placement.
   */
  hasExistingObservationHistory?: boolean;
}>;

export type RestrictionPresentation = Readonly<{
  hasActiveRestrictions: boolean;
  summary: string;
  items: readonly Readonly<{
    sourceKey: string;
    state: "modified" | "restricted";
    title: string;
    bodyRegions: readonly string[];
    affectedFamilyIds: readonly GraphId[];
    affectedFamilyLabels: readonly string[];
    demandDomains: readonly DemandDomain[];
    achievementMessage: string;
    trainingMessage: string;
  }>[];
}>;

export type WorkoutCompletionPresentation = Readonly<{
  title: "How did today's workout go?";
  intro: string;
  prompts: readonly Readonly<{
    planItemId: PlanItemId;
    exerciseId: ExerciseId;
    exerciseName: string;
    purposeLabel: string;
    statusPrompt: string;
    statusOptions: readonly Readonly<{
      value: "completed" | "modified" | "skipped";
      label: string;
    }>[];
    asksModificationReason: true;
    modificationPrompt: string;
    asksDifficulty: boolean;
    difficultyOptions: readonly Readonly<{
      value: "easy" | "right" | "hard";
      label: string;
    }>[];
    asksPainOrInstability: true;
    painPrompt: string;
    painFollowUp: string;
  }>[];
  authorityNotice: string;
  createsSessionRecord: false;
}>;

export type WorkoutCompletionAnswer = Readonly<{
  planItemId: PlanItemId;
  status: "completed" | "modified" | "skipped";
  participationSeconds: number;
  difficulty?: "easy" | "right" | "hard";
  symptomOrInstability?: boolean;
  modificationReason?: string;
  performed?: Readonly<{
    exerciseId: ExerciseId;
    exerciseDefinitionVersion: DefinitionVersion;
    prescriptionVariantId: PrescriptionVariantId;
  }>;
}>;

export type WorkoutCompletionMapping = Readonly<{
  itemOutcomes: readonly SessionItemOutcome[];
  restrictionFollowUp: boolean;
  authorityNotice: string;
}>;

export type TodayPresentationInput = Readonly<{
  bundle: DefinitionBundle;
  generated: GeneratedSession;
}>;

export type WorkoutCompletionInput = Readonly<{
  bundle: DefinitionBundle;
  generated: GeneratedSession;
}>;

export const observationPresentationSourceKey = (
  source: ObservationSourceRef,
): string => source.kind === "evidence-event"
  ? `event:${source.eventId}`
  : `session:${source.sessionRecordId}:item:${source.planItemId}`;
