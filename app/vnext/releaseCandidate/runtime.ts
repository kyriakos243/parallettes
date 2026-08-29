import {
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type AthleteId,
  type AthleteIntent,
  type EquipmentId,
  type IsoTimestamp,
  type SessionDemand,
  type SessionItemOutcome,
  type SessionPlan,
  type SessionRecord,
} from "../contracts";
import {
  answerAssessmentStep,
  buildAssessmentReview,
  commitAssessment as persistAssessmentCommit,
  createAssessmentDraft,
  createGuidedTestEvidence,
  createRestrictionClearance,
  createSessionRecordFromWorkoutReview,
  goBackAssessment,
  isAssessmentAtReview,
  isCanonicalIsoTimestamp,
  nextAssessmentStep,
  persistGuidedTestEvidence,
  type AssessmentAnswerValue,
  type AssessmentDraft,
  type AssessmentMode,
  type AssessmentReview,
  type AssessmentStep,
  type GuidedTestResultInput,
} from "../assessment";
import {
  vNextDefinitionBundle,
  vNextDefinitionBundleV1,
  vNextDefinitionBundles,
} from "../definitions";
import type { LegacyV12ProfileSource } from "../legacyV12";
import {
  convertLegacyV12Profile,
  sha256,
  VNEXT_PERSISTENCE_SCHEMA_VERSION,
  type AppendResult,
  type LegacyConversion,
  type ProjectionCacheLookup,
  type ProjectionSources,
  type TrainingResetTombstone,
  type VNextShadowStore,
} from "../persistence";
import {
  generateVNextSession,
  planningTrainabilityRequests,
  type GeneratedSession,
  type PreviousEmphasis,
} from "../planning";
import {
  buildAssessmentEntryPoints,
  buildGoalControls,
  buildObservationPresentationProvenance,
  buildProgressAndGoals,
  buildRestrictionPresentation,
  buildSkillDetail,
  buildTodayWorkoutPresentation,
  buildWorkoutCompletionPresentation,
  applyGoalControlSelection,
  mapWorkoutCompletionAnswers,
  presentationFamilyOrder,
  type AssessmentEntryPresentation,
  type GoalControlSelection,
  type GoalControlsPresentation,
  type ObservationPresentationProvenance,
  type ProgressAndGoalsPresentation,
  type RestrictionPresentation,
  type SkillDetailPresentation,
  type TodayWorkoutPresentation,
  type WorkoutCompletionAnswer,
  type WorkoutCompletionPresentation,
} from "../presentation";
import {
  projectAthleteState,
  vNextProjectionPolicy,
  type ProjectionIssue,
} from "../projection";

export type VNextRuntimeIdKind = "assessment-draft" | "session-record";

export type VNextRuntimeIdContext = Readonly<{
  kind: VNextRuntimeIdKind;
  athleteId: AthleteId;
  at: IsoTimestamp;
  planId?: SessionPlan["id"];
}>;

export type VNextRuntimeDependencies = Readonly<{
  store: VNextShadowStore;
  clock?: () => IsoTimestamp;
  idFactory?: (context: VNextRuntimeIdContext) => string;
}>;

export type VNextRuntimeRefreshInput = Readonly<{
  athleteId: AthleteId;
  asOf?: IsoTimestamp;
  sessionDemand?: SessionDemand;
  seed?: string;
  previousEmphasis?: PreviousEmphasis;
}>;

export type VNextRuntimePresentations = Readonly<{
  provenance: ObservationPresentationProvenance;
  progress: ProgressAndGoalsPresentation;
  skillDetails: readonly SkillDetailPresentation[];
  today: TodayWorkoutPresentation;
  goals: GoalControlsPresentation;
  assessment: AssessmentEntryPresentation;
  restrictions: RestrictionPresentation;
  completion: WorkoutCompletionPresentation;
}>;

export type VNextRuntimeSnapshot = Readonly<{
  athleteId: AthleteId;
  asOf: IsoTimestamp;
  sources: ProjectionSources;
  intent: AthleteIntent;
  state: NonNullable<ReturnType<typeof projectAthleteState>["state"]>;
  generated: GeneratedSession;
  projection: Readonly<{
    source: "cache" | "rebuilt";
    lookup: ProjectionCacheLookup;
    issues: readonly ProjectionIssue[];
    normalizedObservationCount?: number;
  }>;
  assessmentDraft?: AssessmentDraft;
  assessmentReview?: AssessmentReview;
  presentations: VNextRuntimePresentations;
}>;

export type VNextRuntimeBootstrapInput = VNextRuntimeRefreshInput & Readonly<{
  initialEquipment?: readonly EquipmentId[];
}>;

export type VNextRuntimeAssessmentState = Readonly<{
  draft: AssessmentDraft;
  step: AssessmentStep;
  review?: AssessmentReview;
}>;

export type VNextTimerItemOutcome = Readonly<{
  planItemId: SessionItemOutcome["planItemId"];
  status: SessionItemOutcome["status"];
  participationSeconds: number;
  participationBasis: "measured";
  performedExerciseId?: SessionItemOutcome["performedExerciseId"];
  performedExerciseDefinitionVersion?: SessionItemOutcome["performedExerciseDefinitionVersion"];
  performedPrescriptionVariantId?: SessionItemOutcome["performedPrescriptionVariantId"];
  modificationReason?: string;
}>;

/**
 * This object is the retry boundary. The caller should retain it before the
 * first append attempt and submit the same object after a crash or network/UI
 * retry. Its plan and Session Record are immutable.
 */
export type PreparedVNextWorkoutCompletion = Readonly<{
  plan: SessionPlan;
  record: SessionRecord;
  restrictionFollowUp: boolean;
}>;

export type VNextRuntime = Readonly<{
  bootstrap(input: VNextRuntimeBootstrapInput): Promise<Readonly<{
    createdDefaultIntent: boolean;
    snapshot: VNextRuntimeSnapshot;
  }>>;
  refresh(input: VNextRuntimeRefreshInput): Promise<VNextRuntimeSnapshot>;
  updateGoals(input: VNextRuntimeRefreshInput & Readonly<{
    selection: GoalControlSelection;
    updatedAt?: IsoTimestamp;
  }>): Promise<VNextRuntimeSnapshot>;
  selectDailyDemand(input: Omit<VNextRuntimeRefreshInput, "sessionDemand"> & Readonly<{
    sessionDemand: SessionDemand;
  }>): Promise<VNextRuntimeSnapshot>;
  resetProgress(input: VNextRuntimeRefreshInput & Readonly<{
    resetAt?: IsoTimestamp;
  }>): Promise<VNextRuntimeSnapshot>;
  prepareCopiedLegacyConversion(input: Readonly<{
    copiedProfile: LegacyV12ProfileSource;
    capturedAt?: IsoTimestamp;
  }>): Promise<LegacyConversion>;
  applyCopiedLegacyConversion(input: VNextRuntimeRefreshInput & Readonly<{
    conversion: LegacyConversion;
  }>): Promise<Readonly<{
    applyStatus: "inserted" | "duplicate";
    snapshot: VNextRuntimeSnapshot;
  }>>;
  startAssessment(input: VNextRuntimeBootstrapInput & Readonly<{
    mode?: AssessmentMode;
    draftId?: string;
    createdAt?: IsoTimestamp;
  }>): Promise<Readonly<{
    assessment: VNextRuntimeAssessmentState;
    snapshot: VNextRuntimeSnapshot;
  }>>;
  answerAssessment(input: Readonly<{
    draft: AssessmentDraft;
    answer: AssessmentAnswerValue;
    answeredAt?: IsoTimestamp;
  }>): Promise<VNextRuntimeAssessmentState>;
  backAssessment(input: Readonly<{
    draft: AssessmentDraft;
    updatedAt?: IsoTimestamp;
  }>): Promise<VNextRuntimeAssessmentState>;
  commitAssessment(input: VNextRuntimeRefreshInput & Readonly<{
    draft: AssessmentDraft;
  }>): Promise<Readonly<{
    draft: AssessmentDraft;
    review: AssessmentReview;
    clearedRestrictions: number;
    snapshot: VNextRuntimeSnapshot;
  }>>;
  commitGuidedTest(input: VNextRuntimeRefreshInput & Readonly<{
    draft: AssessmentDraft;
    result: GuidedTestResultInput;
  }>): Promise<Readonly<{
    event: ReturnType<typeof createGuidedTestEvidence>;
    snapshot: VNextRuntimeSnapshot;
  }>>;
  prepareWorkoutCompletion(input: Readonly<{
    generated: GeneratedSession;
    timerItemOutcomes: readonly VNextTimerItemOutcome[];
    reviewAnswers: readonly WorkoutCompletionAnswer[];
    startedAt: IsoTimestamp;
    completedAt: IsoTimestamp;
    recordedAt?: IsoTimestamp;
    status: SessionRecord["status"];
    recordId?: string;
  }>): PreparedVNextWorkoutCompletion;
  commitWorkoutCompletion(input: VNextRuntimeRefreshInput & Readonly<{
    prepared: PreparedVNextWorkoutCompletion;
  }>): Promise<Readonly<{
    append: Readonly<{ plan: AppendResult; record: AppendResult }>;
    prepared: PreparedVNextWorkoutCompletion;
    snapshot: VNextRuntimeSnapshot;
  }>>;
}>;

const defaultClock = (): IsoTimestamp => new Date().toISOString();

const defaultIdFactory = (context: VNextRuntimeIdContext): string =>
  `${context.kind}-vnext-rc-${crypto.randomUUID()}`;

const initialSessionRecordId = (planId: SessionPlan["id"]): SessionRecord["id"] =>
  parseStableId("session-record", planId);

const assertTimestamp = (value: IsoTimestamp, label: string): IsoTimestamp => {
  if (!isCanonicalIsoTimestamp(value)) throw new TypeError(`${label} must be a canonical UTC timestamp`);
  return value;
};

const atLeastTimestamp = (
  candidate: IsoTimestamp,
  minimum: IsoTimestamp,
  label: string,
): IsoTimestamp => {
  assertTimestamp(candidate, label);
  assertTimestamp(minimum, `${label} minimum`);
  return Date.parse(candidate) >= Date.parse(minimum) ? candidate : minimum;
};

const strictlyAfterTimestamp = (
  candidate: IsoTimestamp,
  previous: IsoTimestamp,
  label: string,
): IsoTimestamp => {
  const atLeast = atLeastTimestamp(candidate, previous, label);
  if (Date.parse(atLeast) > Date.parse(previous)) return atLeast;
  const next = new Date(Date.parse(previous) + 1).toISOString();
  return assertTimestamp(next, label);
};

const defaultEquipment = (): readonly EquipmentId[] => [
  parseStableId("equipment", "floor"),
  parseStableId("equipment", "parallettes"),
];

export const createDefaultVNextIntent = (input: Readonly<{
  athleteId: AthleteId;
  updatedAt: IsoTimestamp;
  equipment?: readonly EquipmentId[];
}>): AthleteIntent => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  athleteId: input.athleteId,
  updatedAt: assertTimestamp(input.updatedAt, "Default Athlete Intent time"),
  goals: [],
  equipment: input.equipment ?? defaultEquipment(),
  defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false },
});

const hasMeaningfulAthleteState = (
  state: VNextRuntimeSnapshot["state"],
): boolean => state.nodeStates.some((finding) => finding.lifecycle !== "unknown")
  || state.capacityFindings.some((finding) => finding.finding !== "unknown")
  || state.activeRestrictions.length > 0
  || state.reconfirmationRequirements.length > 0
  || state.recentLoad.exposures.length > 0;

const timerOutcome = (
  plan: SessionPlan,
  supplied: VNextTimerItemOutcome,
): SessionItemOutcome => {
  const item = plan.items.find((candidate) => candidate.id === supplied.planItemId);
  if (!item) throw new TypeError(`Timer outcome references unknown plan item ${supplied.planItemId}`);
  if (item.purpose !== "preparation" && item.purpose !== "recovery") {
    throw new TypeError("Only preparation and recovery outcomes come directly from the timer");
  }
  if (supplied.participationBasis !== "measured"
    || !Number.isFinite(supplied.participationSeconds)
    || supplied.participationSeconds < 0) {
    throw new TypeError(`Invalid measured timer participation for ${supplied.planItemId}`);
  }
  if (supplied.status === "skipped") {
    if (supplied.participationSeconds !== 0
      || supplied.performedExerciseId !== undefined
      || supplied.performedExerciseDefinitionVersion !== undefined
      || supplied.performedPrescriptionVariantId !== undefined) {
      throw new TypeError("A skipped timer item cannot carry participation or performed movement identity");
    }
    return {
      planItemId: item.id,
      status: "skipped",
      participationSeconds: 0,
      participationBasis: "measured",
    };
  }
  if (supplied.participationSeconds <= 0) {
    throw new TypeError("A completed or modified timer item requires measured participation");
  }
  const performed = {
    exerciseId: supplied.performedExerciseId ?? item.exerciseId,
    exerciseDefinitionVersion: supplied.performedExerciseDefinitionVersion
      ?? item.exerciseDefinitionVersion,
    prescriptionVariantId: supplied.performedPrescriptionVariantId ?? item.prescriptionVariantId,
  };
  if (supplied.status === "completed" && (
    performed.exerciseId !== item.exerciseId
    || performed.exerciseDefinitionVersion !== item.exerciseDefinitionVersion
    || performed.prescriptionVariantId !== item.prescriptionVariantId
  )) {
    throw new TypeError("Completed timer work must retain the planned movement identity");
  }
  return {
    planItemId: item.id,
    status: supplied.status,
    participationSeconds: supplied.participationSeconds,
    participationBasis: "measured",
    performedExerciseId: performed.exerciseId,
    performedExerciseDefinitionVersion: performed.exerciseDefinitionVersion,
    performedPrescriptionVariantId: performed.prescriptionVariantId,
    ...(supplied.status === "modified" ? {
      modificationReason: supplied.modificationReason?.trim()
        || "Timer recorded a modified preparation or recovery item.",
    } : {}),
  };
};

export const createVNextReleaseCandidateRuntime = (
  dependencies: VNextRuntimeDependencies,
): VNextRuntime => {
  const { store } = dependencies;
  const clock = dependencies.clock ?? defaultClock;
  const idFactory = dependencies.idFactory ?? defaultIdFactory;

  const refreshOnce = async (
    input: VNextRuntimeRefreshInput,
    sourceChangeRetries: number,
  ): Promise<VNextRuntimeSnapshot> => {
    const sources = await store.readProjectionSources(input.athleteId);
    const intent = sources.intent;
    if (!intent) {
      throw new Error("vNext runtime has no Athlete Intent; call bootstrap before refresh");
    }
    const requestedAsOf = assertTimestamp(input.asOf ?? clock(), "Projection cutoff");
    const asOf = atLeastTimestamp(requestedAsOf, intent.updatedAt, "Projection cutoff");
    const trainabilityRequests = planningTrainabilityRequests(vNextDefinitionBundle);
    const [definitionFingerprint, trainabilityRequestFingerprint] = await Promise.all([
      sha256(vNextDefinitionBundles),
      sha256(trainabilityRequests),
    ]);
    const lookup: ProjectionCacheLookup = {
      athleteId: input.athleteId,
      asOf,
      projectionVersion: vNextProjectionPolicy.version,
      catalogueVersion: vNextDefinitionBundle.catalogueVersion,
      definitionFingerprint,
      policyId: vNextProjectionPolicy.id,
      policyVersion: vNextProjectionPolicy.version,
      sourceFingerprint: sources.sourceFingerprint,
      trainabilityRequestFingerprint,
      ...(sources.resetTombstone ? { resetAt: sources.resetTombstone.resetAt } : {}),
    };
    const cached = await store.getDerivedCache(lookup);
    let state: VNextRuntimeSnapshot["state"];
    let projection: VNextRuntimeSnapshot["projection"];
    if (cached) {
      state = cached.state;
      projection = { source: "cache", lookup, issues: [] };
    } else {
      const rebuilt = projectAthleteState({
        athleteId: input.athleteId,
        asOf,
        policy: vNextProjectionPolicy,
        definitionBundles: vNextDefinitionBundles,
        evidenceEvents: sources.evidenceEvents,
        sessionPlans: sources.sessionPlans,
        sessionRecords: sources.sessionRecords,
        intent,
        trainabilityRequests,
      });
      if (!rebuilt.ok || !rebuilt.state) {
        const detail = rebuilt.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
        throw new Error(`vNext projection failed${detail ? `: ${detail}` : ""}`);
      }
      state = rebuilt.state;
      projection = {
        source: "rebuilt",
        lookup,
        issues: rebuilt.issues,
        normalizedObservationCount: rebuilt.normalizedObservationCount,
      };
      try {
        await store.putDerivedCache({
          schemaVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
          ...lookup,
          storedAt: asOf,
          state,
        });
      } catch {
        const latest = await store.readProjectionSources(input.athleteId);
        if (latest.sourceFingerprint !== sources.sourceFingerprint) {
          if (sourceChangeRetries > 0) return refreshOnce(input, sourceChangeRetries - 1);
          throw new Error("vNext projection sources changed while rebuilding derived state");
        }
        // A projection cache is an optional, rebuildable acceleration only. If
        // the source snapshot is unchanged, keep using the state just rebuilt
        // from authoritative observations even when the cache cannot be saved.
      }
    }

    const generated = generateVNextSession({
      createdAt: asOf,
      bundle: vNextDefinitionBundle,
      intent,
      state,
      projectionPolicy: vNextProjectionPolicy,
      ...(input.sessionDemand ? { sessionDemand: input.sessionDemand } : {}),
      ...(input.seed ? { seed: input.seed } : {}),
      ...(input.previousEmphasis ? { previousEmphasis: input.previousEmphasis } : {}),
    });
    const provenance = buildObservationPresentationProvenance({
      evidenceEvents: sources.evidenceEvents,
      sessionRecords: sources.sessionRecords,
    });
    const assessmentDraft = await store.readAssessmentDraft(input.athleteId) ?? undefined;
    const assessmentReview = assessmentDraft
      && assessmentDraft.catalogueVersion === vNextDefinitionBundle.catalogueVersion
      && isAssessmentAtReview(assessmentDraft, vNextDefinitionBundle)
      ? buildAssessmentReview(assessmentDraft, vNextDefinitionBundle, state)
      : undefined;
    const progressInput = {
      bundle: vNextDefinitionBundle,
      state,
      intent,
      generatedSession: generated,
      provenance,
    } as const;
    const presentations: VNextRuntimePresentations = {
      provenance,
      progress: buildProgressAndGoals(progressInput),
      skillDetails: presentationFamilyOrder.map((graphId) =>
        buildSkillDetail(progressInput, graphId)),
      today: buildTodayWorkoutPresentation({ bundle: vNextDefinitionBundle, generated }),
      goals: buildGoalControls(vNextDefinitionBundle, intent),
      assessment: buildAssessmentEntryPoints({
        bundle: vNextDefinitionBundle,
        state,
        intent,
        hasExistingObservationHistory: sources.evidenceEvents.length > 0
          || sources.sessionRecords.length > 0,
        ...(assessmentReview ? { guidedTestOffers: assessmentReview.guidedTests } : {}),
      }),
      restrictions: buildRestrictionPresentation({ bundle: vNextDefinitionBundle, state }),
      completion: buildWorkoutCompletionPresentation({
        bundle: vNextDefinitionBundle,
        generated,
      }),
    };
    return {
      athleteId: input.athleteId,
      asOf,
      sources,
      intent,
      state,
      generated,
      projection,
      ...(assessmentDraft ? { assessmentDraft } : {}),
      ...(assessmentReview ? { assessmentReview } : {}),
      presentations,
    };
  };

  const refresh = (input: VNextRuntimeRefreshInput): Promise<VNextRuntimeSnapshot> =>
    refreshOnce(input, 1);

  const bootstrap: VNextRuntime["bootstrap"] = async (input) => {
    const existing = await store.readProjectionSources(input.athleteId);
    let createdDefaultIntent = false;
    if (!existing.intent) {
      const updatedAt = assertTimestamp(input.asOf ?? clock(), "Bootstrap time");
      await store.putAthleteIntent(createDefaultVNextIntent({
        athleteId: input.athleteId,
        updatedAt,
        ...(input.initialEquipment ? { equipment: input.initialEquipment } : {}),
      }));
      createdDefaultIntent = true;
    }
    return {
      createdDefaultIntent,
      snapshot: await refresh(input),
    };
  };

  const updateGoals: VNextRuntime["updateGoals"] = async (input) => {
    const sources = await store.readProjectionSources(input.athleteId);
    if (!sources.intent) throw new Error("vNext goals require a bootstrapped Athlete Intent");
    const updatedAt = strictlyAfterTimestamp(
      input.updatedAt ?? clock(),
      sources.intent.updatedAt,
      "Goal update time",
    );
    const intent = applyGoalControlSelection({
      bundle: vNextDefinitionBundle,
      intent: sources.intent,
      selection: input.selection,
      updatedAt,
    });
    await store.putAthleteIntent(intent);
    return refresh({
      ...input,
      asOf: atLeastTimestamp(input.asOf ?? updatedAt, updatedAt, "Goal refresh cutoff"),
    });
  };

  const selectDailyDemand: VNextRuntime["selectDailyDemand"] = async (input) => {
    if (!["technique", "standard", "challenge"].includes(input.sessionDemand)) {
      throw new TypeError("Daily demand must be technique, standard or challenge");
    }
    return refresh(input);
  };

  const resetProgress: VNextRuntime["resetProgress"] = async (input) => {
    const resetAt = assertTimestamp(input.resetAt ?? clock(), "Progress reset time");
    const tombstone: TrainingResetTombstone = {
      schemaVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
      id: parseStableId("event", `athlete-reset-${await sha256({ athleteId: input.athleteId, resetAt })}`),
      athleteId: input.athleteId,
      resetAt,
      recordedAt: resetAt,
      source: "athlete-reset",
    };
    await store.applyProgressReset(tombstone);
    await store.deleteAssessmentDraft(input.athleteId);
    return refresh({ ...input, asOf: resetAt });
  };

  const prepareCopiedLegacyConversion: VNextRuntime["prepareCopiedLegacyConversion"] = async (input) => {
    const requested = assertTimestamp(input.capturedAt ?? clock(), "Copied-profile capture time");
    const capturedAt = atLeastTimestamp(
      requested,
      input.copiedProfile.updatedAt,
      "Copied-profile capture time",
    );
    return convertLegacyV12Profile(input.copiedProfile, capturedAt, vNextDefinitionBundleV1);
  };

  const applyCopiedLegacyConversion: VNextRuntime["applyCopiedLegacyConversion"] = async (input) => {
    if (input.athleteId !== input.conversion.snapshot.athleteId) {
      throw new TypeError("Copied legacy conversion belongs to another athlete");
    }
    const result = await store.applyLegacyConversion(input.conversion);
    const minimumAsOf = input.conversion.snapshot.sourceProfile.updatedAt;
    return {
      applyStatus: result.status,
      snapshot: await refresh({
        ...input,
        athleteId: input.conversion.snapshot.athleteId,
        asOf: atLeastTimestamp(input.asOf ?? clock(), minimumAsOf, "Migration refresh cutoff"),
      }),
    };
  };

  const startAssessment: VNextRuntime["startAssessment"] = async (input) => {
    const createdAt = assertTimestamp(input.createdAt ?? input.asOf ?? clock(), "Assessment creation time");
    const bootstrapped = await bootstrap({ ...input, asOf: createdAt });
    const snapshot = bootstrapped.snapshot;
    const effectiveCreatedAt = atLeastTimestamp(
      createdAt,
      snapshot.intent.updatedAt,
      "Assessment creation time",
    );
    const inferredMode: AssessmentMode = hasMeaningfulAthleteState(snapshot.state)
      ? "targeted-reconfirmation"
      : "new-placement";
    const draft = createAssessmentDraft({
      id: input.draftId ?? idFactory({
        kind: "assessment-draft",
        athleteId: input.athleteId,
        at: effectiveCreatedAt,
      }),
      athleteId: input.athleteId,
      createdAt: effectiveCreatedAt,
      bundle: vNextDefinitionBundle,
      existingIntent: snapshot.intent,
      existingState: snapshot.state,
      mode: input.mode ?? inferredMode,
      ...(input.initialEquipment ? { initialEquipment: input.initialEquipment } : {}),
    });
    await store.saveAssessmentDraft(draft);
    return {
      assessment: {
        draft,
        step: nextAssessmentStep(draft, vNextDefinitionBundle),
      },
      snapshot,
    };
  };

  const answerAssessment: VNextRuntime["answerAssessment"] = async (input) => {
    const answeredAt = strictlyAfterTimestamp(
      input.answeredAt ?? clock(),
      input.draft.updatedAt,
      "Assessment answer time",
    );
    const draft = answerAssessmentStep(
      input.draft,
      input.answer,
      answeredAt,
      vNextDefinitionBundle,
    );
    await store.saveAssessmentDraft(draft);
    const atReview = isAssessmentAtReview(draft, vNextDefinitionBundle);
    const reviewState = atReview
      ? (await refresh({ athleteId: draft.athleteId, asOf: answeredAt })).state
      : undefined;
    return {
      draft,
      step: nextAssessmentStep(draft, vNextDefinitionBundle),
      ...(reviewState ? {
        review: buildAssessmentReview(draft, vNextDefinitionBundle, reviewState),
      } : {}),
    };
  };

  const backAssessment: VNextRuntime["backAssessment"] = async (input) => {
    const updatedAt = strictlyAfterTimestamp(
      input.updatedAt ?? clock(),
      input.draft.updatedAt,
      "Assessment back-navigation time",
    );
    const draft = goBackAssessment(input.draft, updatedAt, vNextDefinitionBundle);
    await store.saveAssessmentDraft(draft);
    const atReview = isAssessmentAtReview(draft, vNextDefinitionBundle);
    const reviewState = atReview
      ? (await refresh({ athleteId: draft.athleteId, asOf: updatedAt })).state
      : undefined;
    return {
      draft,
      step: nextAssessmentStep(draft, vNextDefinitionBundle),
      ...(reviewState ? {
        review: buildAssessmentReview(draft, vNextDefinitionBundle, reviewState),
      } : {}),
    };
  };

  const commitAssessment: VNextRuntime["commitAssessment"] = async (input) => {
    if (input.athleteId !== input.draft.athleteId) {
      throw new TypeError("Assessment commit belongs to another athlete");
    }
    const before = await refresh({
      ...input,
      athleteId: input.draft.athleteId,
      asOf: atLeastTimestamp(input.asOf ?? clock(), input.draft.updatedAt, "Assessment commit cutoff"),
    });
    const review = buildAssessmentReview(input.draft, vNextDefinitionBundle, before.state);
    const committed = await persistAssessmentCommit(store, input.draft, vNextDefinitionBundle);
    const safetyAnswer = input.draft.answers.find(
      (answer) => answer.value.kind === "safety",
    );
    const reportsToClear = input.draft.mode === "targeted-reconfirmation"
      && safetyAnswer?.value.kind === "safety"
      && safetyAnswer.value.severity === "none"
      ? before.state.activeRestrictions.flatMap((restriction) => {
        if (restriction.source.kind !== "evidence-event") return [];
        const restrictionEventId = restriction.source.eventId;
        const report = before.sources.evidenceEvents.find(
          (event) => event.id === restrictionEventId
            && event.type === "restriction_reported"
            && Date.parse(event.occurredAt) <= Date.parse(safetyAnswer.answeredAt),
        );
        return report ? [report] : [];
      })
      : [];
    for (const report of reportsToClear) {
      const event = createRestrictionClearance({
        eventId: `assessment-clearance-${await sha256({
          draftId: input.draft.id,
          restrictionEventId: report.id,
        })}`,
        athleteId: input.draft.athleteId,
        occurredAt: safetyAnswer!.answeredAt,
        recordedAt: input.draft.updatedAt,
        catalogueVersion: vNextDefinitionBundle.catalogueVersion,
        restrictionEventId: report.id,
        notes: "Targeted reconfirmation reported no current symptoms or loading restriction.",
      });
      await store.appendEvidenceEvent(event);
    }
    return {
      draft: committed.draft,
      review,
      clearedRestrictions: reportsToClear.length,
      snapshot: await refresh({
        ...input,
        athleteId: input.draft.athleteId,
        asOf: atLeastTimestamp(input.asOf ?? clock(), input.draft.updatedAt, "Assessment refresh cutoff"),
      }),
    };
  };

  const commitGuidedTest: VNextRuntime["commitGuidedTest"] = async (input) => {
    if (input.athleteId !== input.draft.athleteId) {
      throw new TypeError("Guided-test commit belongs to another athlete");
    }
    const before = await refresh({
      ...input,
      athleteId: input.draft.athleteId,
      asOf: atLeastTimestamp(input.asOf ?? input.result.recordedAt, input.result.recordedAt, "Guided-test cutoff"),
    });
    const event = createGuidedTestEvidence(
      input.draft,
      vNextDefinitionBundle,
      before.state,
      input.result,
    );
    await persistGuidedTestEvidence(store, event);
    return {
      event,
      snapshot: await refresh({
        ...input,
        athleteId: input.draft.athleteId,
        asOf: atLeastTimestamp(input.asOf ?? clock(), input.result.recordedAt, "Guided-test refresh cutoff"),
      }),
    };
  };

  const prepareWorkoutCompletion: VNextRuntime["prepareWorkoutCompletion"] = (input) => {
    const plan = input.generated.plan;
    if (!input.generated.ok || !plan) {
      throw new TypeError("Workout completion requires a successful vNext Session Plan");
    }
    if (new Set(input.timerItemOutcomes.map((outcome) => outcome.planItemId)).size
      !== input.timerItemOutcomes.length) {
      throw new TypeError("Timer outcomes contain duplicate plan-item facts");
    }
    const expectedTimerIds = plan.items
      .filter((item) => item.purpose === "preparation" || item.purpose === "recovery")
      .map((item) => item.id);
    const suppliedTimerIds = new Set(input.timerItemOutcomes.map((outcome) => outcome.planItemId));
    if (expectedTimerIds.length !== suppliedTimerIds.size
      || expectedTimerIds.some((id) => !suppliedTimerIds.has(id))) {
      throw new TypeError("Measured timer facts must account for every preparation and recovery item exactly once");
    }
    const mapped = mapWorkoutCompletionAnswers({
      generated: input.generated,
      answers: input.reviewAnswers,
    });
    const outcomeById = new Map<SessionItemOutcome["planItemId"], SessionItemOutcome>();
    for (const supplied of input.timerItemOutcomes) {
      const outcome = timerOutcome(plan, supplied);
      outcomeById.set(outcome.planItemId, outcome);
    }
    for (const outcome of mapped.itemOutcomes) {
      if (outcomeById.has(outcome.planItemId)) {
        throw new TypeError(`Plan item ${outcome.planItemId} has both a timer and progression-review outcome`);
      }
      outcomeById.set(outcome.planItemId, outcome);
    }
    if (outcomeById.size !== plan.items.length
      || plan.items.some((item) => !outcomeById.has(item.id))) {
      throw new TypeError("Completion must account for every plan item exactly once");
    }
    const completedAt = assertTimestamp(input.completedAt, "Workout completion time");
    const recordedAt = atLeastTimestamp(
      input.recordedAt ?? clock(),
      completedAt,
      "Workout recording time",
    );
    const record = createSessionRecordFromWorkoutReview(plan, vNextDefinitionBundle, {
      recordId: input.recordId ?? initialSessionRecordId(plan.id),
      startedAt: assertTimestamp(input.startedAt, "Workout start time"),
      completedAt,
      recordedAt,
      status: input.status,
      itemOutcomes: plan.items.map((item) => outcomeById.get(item.id)!),
    });
    return { plan, record, restrictionFollowUp: mapped.restrictionFollowUp };
  };

  const commitWorkoutCompletion: VNextRuntime["commitWorkoutCompletion"] = async (input) => {
    if (input.prepared.plan.athleteId !== input.athleteId
      || input.prepared.record.athleteId !== input.athleteId) {
      throw new TypeError("Prepared workout completion belongs to another athlete");
    }
    const append = await store.appendSession(input.prepared.plan, input.prepared.record);
    return {
      append,
      prepared: input.prepared,
      snapshot: await refresh({
        ...input,
        asOf: atLeastTimestamp(
          input.asOf ?? clock(),
          input.prepared.record.recordedAt,
          "Workout refresh cutoff",
        ),
      }),
    };
  };

  return {
    bootstrap,
    refresh,
    updateGoals,
    selectDailyDemand,
    resetProgress,
    prepareCopiedLegacyConversion,
    applyCopiedLegacyConversion,
    startAssessment,
    answerAssessment,
    backAssessment,
    commitAssessment,
    commitGuidedTest,
    prepareWorkoutCompletion,
    commitWorkoutCompletion,
  };
};
