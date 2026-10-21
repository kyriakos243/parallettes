import { safePracticeWorkoutSwaps as safeWorkoutSwaps } from "../practiceDose";
import { correctInvalidGuidedAttemptResult, hasInvalidGuidedAttemptCount } from "../assessment/guidedRecovery";
import { guidedObservationOccasionId } from "../assessment/evidence";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  buildAssessmentReview,
  buildTodayWorkoutPresentation,
  buildWorkoutCompletionPresentation,
  createVNextShadowStore,
  isAssessmentAtReview,
  isStableId,
  nextAssessmentStep,
  sha256,
  type AssessmentAnswerValue,
  type AssessmentDraft,
  type AssessmentEntryAction,
  type GeneratedSession,
  type DefinitionBundle,
  type GuidedTestOffer,
  type GuidedTestResultInput,
  type IsoTimestamp,
  type ObservationExportBundle,
  type PlanItemId,
  type PreviousEmphasis,
  type SafeWorkoutSwap,
  type SessionDemand,
  type VNextShadowStore,
  type WorkoutCompletionAnswer,
  type RestrictionReportedEvent,
  type RestrictionClearedEvent,
  generateVNextCustomSession,
} from "../index";
import { VNextExperience, type VNextWorkoutReviewFeedback } from "../ui";
import type { WorkoutReviewDraft } from "../ui/VNextExperience";
import { readWorkoutReviewDraft } from "./workoutReviewRecovery";
import { createRecoveryStorageGuard, RecoveryStorageConflict } from "./recoveryStorage";
import { buildSessionHistory } from "../ui/sessionHistory";
import { confirmedSyncFingerprint, trainingSyncMessage, type TrainingSyncStatus } from "../ui/syncStatus";
import { AssessmentRunner } from "./AssessmentRunner";
import { GuidedTestRunner, type GuidedTestFormResult } from "./GuidedTestRunner";
import { CustomSessionBuilder, type VNextCustomSessionRequest } from "./CustomSessionBuilder";
import { RestrictionReportForm } from "./RestrictionReportForm";
import { RestrictionRecoveryForm, type RestrictionRecoveryContext } from "./RestrictionRecoveryForm";
import { validateWorkoutStart } from "./workoutStartSafety";
import type { WorkoutRunRequest } from "./useWorkoutRunAuthorization";
import { shortWorkoutPreferenceKey } from "./shortWorkoutPreferences";
import { createAppUpdateController, hasUnfinishedUpdateWork, type AppUpdateState } from "./appUpdate";
import { createAccountAccessController, type AccountAccess } from "./accountAccess";
import { createBackgroundSync, serialSyncStore, type SerialOperation } from "./backgroundSync";
import { startupRecoveryMessage } from "./startupRecovery";
import "./appUpdate.css";
import { isMixedWorkoutPlan } from "../mixedWorkout";
import { ReliableWorkoutRunner } from "./ReliableWorkoutRunner";
import { MixedWorkoutRunner, recoverActiveWorkoutFacts as recoverMixedWorkoutFacts } from "./MixedWorkoutRunner";
import {
  VNextAccountGate,
  ACCOUNT_SESSION_CHANGED_EVENT,
  ACCOUNT_SESSION_STORAGE_KEY,
  hasVNextRcAccountSession,
  persistVNextRcIdentity,
  readVNextRcIdentity,
  validateVNextRcAccountIdentity,
  VNEXT_RC_STORAGE_NAMESPACE,
  type AccountGateProps,
  type VNextAccountGatePresentation,
  type AccountSessionChangedDetail,
  type VNextRcIdentity,
} from "./VNextAccountGate";
import { evaluateVNextPlanMediaRelease } from "./mediaRelease";
import { vNextReleaseCandidateManifest } from "./manifest";
import {
  createVNextReleaseCandidateRuntime,
  type PreparedVNextWorkoutCompletion,
  type VNextRuntime,
  type VNextRuntimeAssessmentState,
  type VNextRuntimeSnapshot,
  type VNextRuntimeCatalogue,
  vNextReleaseCandidateCatalogue,
  runtimeDefinitionBundle,
} from "./runtime";
import {
  hasActiveWorkoutDraft,
  recoverActiveWorkoutFacts,
  WorkoutRunner as FrozenWorkoutRunner,
  type WorkoutExecutionFacts,
  unresolvedRenderablePlanItems,
} from "./WorkoutRunner";

const storageKeyPrefix = (
  namespace: string,
  kind: "emphasis" | "workout-recovery" | "guided-recovery",
) => `parallette25-${namespace}-${kind}-v1:`;

export type VNextApplicationDeployment = Readonly<{
  kind: "release-candidate" | "production";
  catalogue?: VNextRuntimeCatalogue;
  workoutGenerators?: Pick<VNextRuntimeCatalogue, "generateSession" | "generateCustomSession">;
  evaluatePlanMedia?: (plan: Parameters<typeof evaluateVNextPlanMediaRelease>[0]) => ReturnType<typeof evaluateVNextPlanMediaRelease>;
  productKicker: string;
  openingMessage: string;
  bannerTitle: string;
  bannerDetail: string;
  accountPresentation?: VNextAccountGatePresentation;
  AccountGate?: ComponentType<AccountGateProps>;
  prepareAthlete?: (context: Readonly<{
    identity: VNextRcIdentity;
    store: VNextShadowStore;
    runtime: VNextRuntime;
  }>) => Promise<Readonly<{ message?: string }>>;
  storageNamespace?: string;
  shadowDatabaseName?: string;
}>;

const RELEASE_CANDIDATE_DEPLOYMENT: VNextApplicationDeployment = {
  kind: "release-candidate",
  productKicker: "Parallette25 vNext RC.3",
  openingMessage: "Opening the isolated vNext release candidate…",
  bannerTitle: "RC.3 isolated preview",
  bannerDetail: "ordinary v1.2 authority is unchanged",
};

const now = (): IsoTimestamp => new Date().toISOString();

type StoredPreviousEmphasis = PreviousEmphasis & Readonly<{ lastCountedRecordId?: string }>;

type WorkoutRecovery = Readonly<{
  version: 1;
  athleteId: string;
  stage: "preview" | "active" | "review" | "prepared";
  origin: "today" | "custom";
  generated: GeneratedSession;
  selections?: Readonly<Partial<Record<PlanItemId, SafeWorkoutSwap>>>;
  swapOptions?: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
  facts?: WorkoutExecutionFacts;
  reviewDraft?: WorkoutReviewDraft;
  prepared?: PreparedVNextWorkoutCompletion;
  /** Advisory context only; saved plans and measured facts remain immutable. */
  customRequest?: VNextCustomSessionRequest;
  equipmentAtPreview?: VNextRuntimeSnapshot["intent"]["equipment"];
  /** Exact retry for an explicitly submitted current restriction. */
  pendingRestriction?: RestrictionReportedEvent;
}>;

type GuidedRecovery = Readonly<{
  athleteId: string;
  offer: GuidedTestOffer;
  result: GuidedTestResultInput;
}> & (Readonly<{ version: 1; draft: AssessmentDraft }>
  | Readonly<{ version: 2; kind: "progression"; catalogueVersion: DefinitionBundle["catalogueVersion"] }>);

const workoutRecoveryKey = (athleteId: string, namespace: string): string =>
  `${storageKeyPrefix(namespace, "workout-recovery")}${athleteId}`;

const guidedRecoveryKey = (athleteId: string, namespace: string): string =>
  `${storageKeyPrefix(namespace, "guided-recovery")}${athleteId}`;

const readPreviousEmphasis = (athleteId: string, namespace: string): StoredPreviousEmphasis | undefined => {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${storageKeyPrefix(namespace, "emphasis")}${athleteId}`) ?? "null") as PreviousEmphasis | null;
    if (!parsed || parsed.generatorPolicyId !== vNextReleaseCandidateManifest.components.generator.id
      || parsed.generatorPolicyVersion !== vNextReleaseCandidateManifest.components.generator.version
      || !isStableId(parsed.primaryGraphId)
      || !Number.isSafeInteger(parsed.completedEligibleSessions)
      || parsed.completedEligibleSessions < 0) return undefined;
    return parsed as StoredPreviousEmphasis;
  } catch {
    return undefined;
  }
};

const rememberCompletedEmphasis = (
  athleteId: string,
  generated: GeneratedSession,
  prepared: PreparedVNextWorkoutCompletion,
  namespace: string,
): void => {
  const emphasis = generated.emphasis;
  const eligible = prepared.record.status !== "abandoned"
    && prepared.plan.items.some((item) => item.purpose !== "preparation"
      && item.purpose !== "recovery"
      && (prepared.record.itemOutcomes.find((outcome) => outcome.planItemId === item.id)
        ?.participationSeconds ?? 0) > 0);
  if (!emphasis || !eligible) return;
  const previous = readPreviousEmphasis(athleteId, namespace);
  if (previous?.lastCountedRecordId === prepared.record.id) return;
  const value: StoredPreviousEmphasis = {
    // Execution changes do not reset the unchanged emphasis planner's sample.
    generatorPolicyId: isMixedWorkoutPlan(generated) ? vNextReleaseCandidateManifest.components.generator.id : generated.generatorPolicyId,
    generatorPolicyVersion: isMixedWorkoutPlan(generated) ? vNextReleaseCandidateManifest.components.generator.version : generated.generatorPolicyVersion,
    primaryGraphId: emphasis.primary.graphId,
    ...(emphasis.secondary ? { secondaryGraphId: emphasis.secondary.graphId } : {}),
    goalSignature: emphasis.goalSignature,
    completedEligibleSessions: previous?.goalSignature === emphasis.goalSignature
      ? previous.completedEligibleSessions + 1
      : 1,
    lastCountedRecordId: prepared.record.id,
  };
  localStorage.setItem(`${storageKeyPrefix(namespace, "emphasis")}${athleteId}`, JSON.stringify(value));
};

const readWorkoutRecovery = (athleteId: string, namespace: string): WorkoutRecovery | undefined => {
  const key = workoutRecoveryKey(athleteId, namespace);
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<WorkoutRecovery> | null;
    const plan = parsed?.generated?.plan;
    const validStage = parsed?.stage === "preview" || parsed?.stage === "active" || parsed?.stage === "review" || parsed?.stage === "prepared";
    const factsRequired = parsed?.stage === "review" || parsed?.stage === "prepared";
    if (!parsed || parsed.version !== 1 || parsed.athleteId !== athleteId || !validStage
      || parsed.generated?.ok !== true || !plan || plan.athleteId !== athleteId
      || (factsRequired && (!parsed.facts || typeof parsed.facts.startedAt !== "string"
        || typeof parsed.facts.completedAt !== "string"))
      || (parsed.stage === "prepared" && (!parsed.prepared
        || parsed.prepared.plan.id !== plan.id
        || parsed.prepared.record.planId !== plan.id
        || parsed.prepared.record.athleteId !== athleteId))) {
      localStorage.removeItem(key);
      return undefined;
    }
    const inferredOrigin = parsed.origin === "today" || parsed.origin === "custom"
      ? parsed.origin
      : plan.rationale.some((reason) => reason.code === "planning-custom-short-session")
        ? "custom"
        : "today";
    const recoveredStage = parsed.stage === "active" && !hasActiveWorkoutDraft(athleteId, plan.id)
      ? "preview"
      : parsed.stage;
    return {
      ...parsed,
      reviewDraft: readWorkoutReviewDraft(parsed.reviewDraft, plan.id, plan.items.map((item) => item.id)),
      stage: recoveredStage,
      origin: inferredOrigin,
      ...(parsed.facts ? { facts: {
        ...parsed.facts,
        completedPlanItemIds: parsed.facts.completedPlanItemIds ?? [],
        performedByPlanItem: parsed.facts.performedByPlanItem ?? {},
      } } : {}),
    } as WorkoutRecovery;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
};

const writeWorkoutRecovery = (recovery: WorkoutRecovery, guard: ReturnType<typeof createRecoveryStorageGuard>): void => {
  guard.write(JSON.stringify(recovery));
};

const readGuidedRecovery = (athleteId: string, namespace: string): GuidedRecovery | undefined => {
  const key = guidedRecoveryKey(athleteId, namespace);
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<GuidedRecovery> | null;
    if (!parsed || parsed.athleteId !== athleteId
      || !((parsed.version === 1 && parsed.draft?.athleteId === athleteId)
        || (parsed.version === 2 && parsed.kind === "progression" && Number.isSafeInteger(parsed.catalogueVersion) && parsed.catalogueVersion! > 0))
      || !parsed.offer || !parsed.result
      || parsed.result.protocolId !== parsed.offer.protocolId) {
      localStorage.removeItem(key);
      return undefined;
    }
    return parsed as GuidedRecovery;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
};

const writeGuidedRecovery = (recovery: GuidedRecovery, guard: ReturnType<typeof createRecoveryStorageGuard>): void => {
  guard.write(JSON.stringify(recovery));
};

const downloadJson = (filename: string, value: unknown): void => {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const completionStatus = (
  plan: NonNullable<VNextRuntimeSnapshot["generated"]["plan"]>,
  facts: WorkoutExecutionFacts,
  feedback: readonly VNextWorkoutReviewFeedback[],
): "complete" | "modified" | "partial" | "abandoned" => {
  const reviewed = new Map(feedback.map((item) => [item.planItemId, item]));
  const completed = new Set(facts.completedPlanItemIds);
  const statuses = plan.items.map((item) => {
    const seconds = facts.participationSeconds[item.id] ?? 0;
    const review = reviewed.get(item.id);
    const performed = facts.performedByPlanItem[item.id];
    const identityChanged = performed !== undefined && (
      performed.exerciseId !== item.exerciseId
        || performed.exerciseDefinitionVersion !== item.exerciseDefinitionVersion
        || performed.prescriptionVariantId !== item.prescriptionVariantId);
    if (seconds === 0) return "skipped" as const;
    if (review?.status === "modified" || review?.status === "skipped"
      || review?.symptomOrInstability || !completed.has(item.id) || identityChanged) return "modified" as const;
    return "completed" as const;
  });
  if (statuses.every((status) => status === "skipped")) return "abandoned";
  if (statuses.includes("skipped")) return "partial";
  if (statuses.includes("modified")) return "modified";
  return "complete";
};

const VNextAthleteApplication = ({
  identity,
  onIdentitySelected,
  onSignedOut,
  deployment,
}: Readonly<{
  identity: VNextRcIdentity;
  onIdentitySelected: (identity: VNextRcIdentity) => void;
  onSignedOut: () => void;
  deployment: VNextApplicationDeployment;
}>) => {
  const WorkoutRunner = deployment.kind === "production" ? ReliableWorkoutRunner : FrozenWorkoutRunner;
  const catalogue = useMemo(() => deployment.workoutGenerators
    ? { ...(deployment.catalogue ?? vNextReleaseCandidateCatalogue), ...deployment.workoutGenerators }
    : deployment.catalogue ?? vNextReleaseCandidateCatalogue, [deployment.catalogue, deployment.workoutGenerators]);
  const { bundle: vNextDefinitionBundle, history: vNextDefinitionBundles, projectionPolicy: vNextProjectionPolicy } = catalogue;
  const evaluatePlanMedia = deployment.evaluatePlanMedia ?? evaluateVNextPlanMediaRelease;
  const bundleFor = (version: DefinitionBundle["catalogueVersion"]) => runtimeDefinitionBundle(catalogue, version);
  const athleteId = identity.athleteId;
  const storageNamespace = deployment.storageNamespace ?? VNEXT_RC_STORAGE_NAMESPACE;
  const store = useMemo(
    () => createVNextShadowStore(deployment.shadowDatabaseName
      ? { databaseName: deployment.shadowDatabaseName }
      : {}),
    [deployment.shadowDatabaseName],
  );
  const runtime = useMemo(() => createVNextReleaseCandidateRuntime({ store, catalogue }), [store, catalogue]);
  const initialWorkoutRecovery = useMemo(
    () => readWorkoutRecovery(athleteId, storageNamespace),
    [athleteId, storageNamespace],
  );
  const initialGuidedRecovery = useMemo(
    () => readGuidedRecovery(athleteId, storageNamespace),
    [athleteId, storageNamespace],
  );
  const workoutRecoveryStorage = useMemo(() => createRecoveryStorageGuard(workoutRecoveryKey(athleteId, storageNamespace)), [athleteId, storageNamespace]);
  const guidedRecoveryStorage = useMemo(() => createRecoveryStorageGuard(guidedRecoveryKey(athleteId, storageNamespace)), [athleteId, storageNamespace]);
  const [snapshot, setSnapshot] = useState<VNextRuntimeSnapshot>();
  const [assessment, setAssessment] = useState<VNextRuntimeAssessmentState>();
  const [restartSetupOpen, setRestartSetupOpen] = useState(false);
  const [restartForRestrictions, setRestartForRestrictions] = useState(false);
  const [guidedOffer, setGuidedOffer] = useState<GuidedTestOffer | undefined>(initialGuidedRecovery?.offer);
  const [progressionCatalogueVersion, setProgressionCatalogueVersion] = useState<DefinitionBundle["catalogueVersion"] | undefined>(
    initialGuidedRecovery?.version === 2 ? initialGuidedRecovery.catalogueVersion : undefined,
  );
  const [correctingGuidedEntry, setCorrectingGuidedEntry] = useState(false);
  const [guidedRecovery, setGuidedRecovery] = useState<GuidedRecovery | undefined>(initialGuidedRecovery);
  const [workoutRecovery, setWorkoutRecovery] = useState<WorkoutRecovery | undefined>(initialWorkoutRecovery);
  const workoutRecoveryRef = useRef(workoutRecovery);
  workoutRecoveryRef.current = workoutRecovery;
  const [reviewCheckpointError, setReviewCheckpointError] = useState<string>();
  const [workoutSelections, setWorkoutSelections] = useState<Readonly<Partial<Record<PlanItemId, SafeWorkoutSwap>>>>(
    initialWorkoutRecovery?.selections ?? {},
  );
  const [workoutOpen, setWorkoutOpen] = useState(
    initialWorkoutRecovery?.stage === "active"
      || (initialWorkoutRecovery?.stage === "preview" && initialWorkoutRecovery.origin === "today"),
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [restrictionOpen, setRestrictionOpen] = useState(Boolean(initialWorkoutRecovery?.pendingRestriction));
  const [restrictionRecovery, setRestrictionRecovery] = useState<RestrictionRecoveryContext>();
  const [message, setMessage] = useState(deployment.openingMessage);
  const [error, setError] = useState<string>();
  const [startupFailure, setStartupFailure] = useState<ReturnType<typeof startupRecoveryMessage>>();
  const [startupUpdateSafe, setStartupUpdateSafe] = useState(false);
  const [savedWorkoutId, setSavedWorkoutId] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<TrainingSyncStatus>({ phase: "idle" });
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>({ phase: "idle" });
  const [goalEditing, setGoalEditing] = useState(false);
  const updateController = useRef<ReturnType<typeof createAppUpdateController> | undefined>(undefined);
  const updateLocked = useRef(false);
  const updateSafe = useRef(false);
  const savedUpdatePlanIds = useRef<readonly string[]>([]);
  savedUpdatePlanIds.current = snapshot?.sources.sessionRecords.map((record) => record.planId) ?? [];
  const commandQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingCommands = useRef(0);
  const bootstrapStarted = useRef(false);
  const completionSubmissionLocked = useRef(false);
  const guidedSubmissionLocked = useRef(false);
  const lastAutomaticSyncFingerprint = useRef<string | undefined>(undefined);
  const dailyDemand = useRef<{ day: string; demand: SessionDemand } | undefined>(undefined);
  const syncController = useRef<ReturnType<typeof createBackgroundSync> | undefined>(undefined);
  const syncGeneration = useRef(0);
  const syncInFlight = useRef(false);
  updateSafe.current = (Boolean(snapshot) || Boolean(startupFailure && startupUpdateSafe)) && !busy && !syncInFlight.current && !workoutRecovery && !guidedRecovery
    && !assessment && !guidedOffer && !workoutOpen && !customOpen && !accountOpen
    && !restrictionOpen && !restrictionRecovery && !restartSetupOpen && !reviewCheckpointError && !goalEditing;

  const executionFacts = workoutRecovery?.stage === "review" || workoutRecovery?.stage === "prepared"
    ? workoutRecovery.facts
    : undefined;
  const pendingPrepared = workoutRecovery?.stage === "prepared"
    ? workoutRecovery.prepared
    : undefined;

  const persistWorkoutRecovery = useCallback((recovery: WorkoutRecovery): void => {
    writeWorkoutRecovery(recovery, workoutRecoveryStorage);
    workoutRecoveryRef.current = recovery;
    setWorkoutRecovery(recovery);
  }, [workoutRecoveryStorage]);

  const retainWorkoutReview = (draft: WorkoutReviewDraft): void => {
    const current = workoutRecoveryRef.current;
    if (!current || current.stage !== "review" || current.generated.plan?.id !== draft.planId) return;
    const next = { ...current, reviewDraft: draft };
    // Keep the newest answers in memory even when device storage is unavailable.
    workoutRecoveryRef.current = next;
    setWorkoutRecovery(next);
    try {
      writeWorkoutRecovery(next, workoutRecoveryStorage);
      setReviewCheckpointError(undefined);
    } catch (reason) {
      setReviewCheckpointError(reason instanceof RecoveryStorageConflict ? reason.message
        : "Your latest answers could not be saved on this device. Keep this screen open and retry before leaving or saving the workout.");
    }
  };
  const retryWorkoutReviewCheckpoint = (): void => {
    const current = workoutRecoveryRef.current;
    if (current?.reviewDraft) retainWorkoutReview(current.reviewDraft);
  };

  const clearWorkoutRecovery = useCallback((): void => {
    workoutRecoveryStorage.remove();
    workoutRecoveryRef.current = undefined;
    setWorkoutRecovery(undefined);
    setReviewCheckpointError(undefined);
    setWorkoutSelections({});
  }, [workoutRecoveryStorage]);

  const persistGuidedRecovery = useCallback((recovery: GuidedRecovery): void => {
    writeGuidedRecovery(recovery, guidedRecoveryStorage);
    setGuidedRecovery(recovery);
  }, [guidedRecoveryStorage]);

  const clearGuidedRecovery = useCallback((): void => {
    guidedRecoveryStorage.remove();
    setGuidedRecovery(undefined);
  }, [guidedRecoveryStorage]);

  const refreshInput = useCallback((sessionDemand?: SessionDemand) => {
    const asOf = now();
    const demand = sessionDemand ?? (dailyDemand.current?.day === asOf.slice(0, 10) ? dailyDemand.current.demand : undefined);
    return {
    athleteId,
    asOf,
    seed: `${athleteId}:${new Date().toISOString().slice(0, 10)}`,
    ...(demand ? { sessionDemand: demand } : {}),
    ...(readPreviousEmphasis(athleteId, storageNamespace)
      ? { previousEmphasis: readPreviousEmphasis(athleteId, storageNamespace) }
      : {}),
    };
  }, [athleteId, storageNamespace]);

  const runCommand = useCallback((command: () => Promise<void>): void => {
    if (updateLocked.current) return;
    pendingCommands.current += 1;
    setBusy(true);
    setError(undefined);
    const queued = commandQueue.current.catch(() => undefined).then(command);
    commandQueue.current = queued.then(() => undefined, () => undefined);
    void queued.catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "This action could not be completed. Please try again.");
    }).finally(() => {
      pendingCommands.current -= 1;
      if (pendingCommands.current === 0) setBusy(false);
    });
  }, []);

  const openTraining = useCallback((): void => {
    setStartupFailure(undefined);
    setStartupUpdateSafe(false);
    setMessage(deployment.openingMessage);
    runCommand(async () => {
      try {
        const preparation = await deployment.prepareAthlete?.({ identity, store, runtime });
        const result = await runtime.bootstrap(refreshInput());
        setSnapshot(result.snapshot);
        if (initialWorkoutRecovery?.stage === "active") {
          setMessage("Your paused workout is ready to resume.");
        } else if (initialWorkoutRecovery?.stage === "preview") {
          setMessage(`Your ${initialWorkoutRecovery.origin === "custom" ? "Custom Session" : "Today workout"} preview was restored. It has not recorded training.`);
        } else if (initialWorkoutRecovery?.stage === "review") {
          setMessage("Your workout is ready to save. Finish the short review.");
        } else if (initialWorkoutRecovery?.stage === "prepared") {
          setMessage("Your workout is ready to save again. Retrying will not create a duplicate.");
        } else if (initialGuidedRecovery) {
          setMessage("Your test result is ready to save again. Retrying will not create a duplicate.");
        } else if (result.snapshot.assessmentDraft?.status === "in-progress") {
          setMessage("");
        } else if (result.createdDefaultIntent) {
          const started = await runtime.startAssessment({ ...refreshInput(), mode: "new-placement" });
          setSnapshot(started.snapshot);
          setAssessment(started.assessment);
          setMessage("A few questions will help choose your starting point. You can finish later.");
        } else {
          setMessage(preparation?.message ?? "");
        }
      } catch (reason) {
        // Do not activate over an unreadable or unfinished setup. Other saved
        // workout/check/timer journals are rechecked by the update controller.
        try {
          const draft = await store.readAssessmentDraft(athleteId);
          setStartupUpdateSafe(draft?.status !== "in-progress");
        } catch { setStartupUpdateSafe(false); }
        setStartupFailure(startupRecoveryMessage(reason));
        throw reason;
      }
    });
  }, [athleteId, deployment, identity, initialGuidedRecovery, initialWorkoutRecovery, refreshInput, runCommand, runtime, store]);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    openTraining();
  }, [openTraining]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const controller = createAppUpdateController({
      workers: navigator.serviceWorker,
      base: import.meta.env.BASE_URL,
      runningBuild: document.querySelector<HTMLMetaElement>('meta[name="p25-build-id"]')?.content,
      canApply: () => {
        if (!updateSafe.current || pendingCommands.current) return false;
        try {
          // Recheck disk as well as this render: another window may have saved work.
          return !hasUnfinishedUpdateWork({
            athleteId,
            workout: localStorage.getItem(workoutRecoveryKey(athleteId, storageNamespace)),
            guided: localStorage.getItem(guidedRecoveryKey(athleteId, storageNamespace)),
            timer: localStorage.getItem(`parallette25-vnext-rc-active-workout-v1:${athleteId}`),
            savedPlanIds: savedUpdatePlanIds.current,
          });
        } catch { return false; }
      },
      onState: (state) => {
        updateLocked.current = state.phase === "applying";
        setAppUpdate(state);
      },
      reload: () => window.location.reload(),
    });
    updateController.current = controller;
    let lastCheck = Date.now();
    void controller.check();
    const checkVisible = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - lastCheck < 300_000) return;
      lastCheck = Date.now();
      void controller.check();
    };
    window.addEventListener("online", checkVisible);
    window.addEventListener("focus", checkVisible);
    document.addEventListener("visibilitychange", checkVisible);
    return () => {
      controller.dispose();
      updateLocked.current = false;
      window.removeEventListener("online", checkVisible);
      window.removeEventListener("focus", checkVisible);
      document.removeEventListener("visibilitychange", checkVisible);
    };
  }, [athleteId, storageNamespace]);

  const queueBackground: SerialOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const queued = commandQueue.current.catch(() => undefined).then(operation);
    commandQueue.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  const syncTraining = useCallback(async () => {
    if (updateLocked.current) return;
    const generation = syncGeneration.current;
    const current = () => generation === syncGeneration.current;
    syncInFlight.current = true;
    setSyncStatus({ phase: "syncing" });
    try {
      const { syncVNextShadowObservations } = await import("../../profileStore");
      const syncStore = serialSyncStore(store, (operation) => queueBackground(async () => {
        if (!current() || updateLocked.current) throw new Error("Sync was cancelled before applying its response.");
        return operation();
      }));
      await syncVNextShadowObservations(syncStore, athleteId);
      await queueBackground(async () => {
        if (!current() || updateLocked.current) return;
        const refreshed = await runtime.refresh(refreshInput());
        const fingerprint = await confirmedSyncFingerprint({
          fingerprint: refreshed.sources.sourceFingerprint,
          readFingerprint: async () => (await store.readProjectionSources(athleteId)).sourceFingerprint,
          hasPending: async () => (await store.readSyncUpload(athleteId, 1)).length > 0,
        });
        if (current() && !updateLocked.current) {
          setSnapshot(refreshed);
          setSyncStatus(fingerprint ? { phase: "synced", fingerprint, confirmedAt: new Date().toISOString() } : { phase: "waiting" });
        }
      });
    } catch (reason) {
      if (!current()) return;
      if (reason instanceof Error && reason.message === "shadow-sync-update-required") {
        setSyncStatus({ phase: "update-required" });
        void updateController.current?.check();
        return;
      }
      const { isTransientVNextSyncError } = await import("../../profileStore");
      if (isTransientVNextSyncError(reason)) {
        setSyncStatus({ phase: "waiting" });
        return;
      }
      setSyncStatus({ phase: "error" });
    } finally {
      if (current()) syncInFlight.current = false;
    }
  }, [athleteId, queueBackground, refreshInput, runtime, store]);

  useEffect(() => {
    syncGeneration.current += 1;
    const controller = createBackgroundSync(syncTraining);
    syncController.current = controller;
    return () => {
      controller.dispose();
      syncGeneration.current += 1;
      syncInFlight.current = false;
      if (syncController.current === controller) syncController.current = undefined;
    };
  }, [syncTraining]);

  const requestTrainingSync = useCallback((): void => {
    if (!updateLocked.current) void syncController.current?.request().catch(() => undefined);
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (deployment.kind !== "production" || identity.mode !== "account" || !snapshot) return;
    const sync = (force = false): void => {
      const fingerprint = snapshot.sources.sourceFingerprint;
      if (!force && lastAutomaticSyncFingerprint.current === fingerprint) return;
      lastAutomaticSyncFingerprint.current = fingerprint;
      requestTrainingSync();
    };
    sync();
    const refreshRemote = (): void => { sync(true); };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") refreshRemote();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) refreshRemote();
    }, 60_000);
    window.addEventListener("online", refreshRemote);
    window.addEventListener("focus", refreshRemote);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refreshRemote);
      window.removeEventListener("focus", refreshRemote);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [deployment.kind, identity.mode, requestTrainingSync, snapshot]);

  useEffect(() => {
    if (deployment.kind !== "production" || identity.mode !== "local" || !snapshot
      || workoutRecovery || assessment || guidedOffer) return;
    const refreshVisiblePlan = (): void => {
      if (document.visibilityState !== "visible") return;
      runCommand(async () => {
        const refreshed = await runtime.refresh(refreshInput());
        setSnapshot(refreshed);
      });
    };
    document.addEventListener("visibilitychange", refreshVisiblePlan);
    return () => document.removeEventListener("visibilitychange", refreshVisiblePlan);
  }, [assessment, deployment.kind, guidedOffer, identity.mode, refreshInput, runCommand, runtime, snapshot, workoutRecovery]);

  const placementScreenKey = guidedOffer ? `guided:${guidedOffer.protocolId}`
    : assessment ? `assessment:${assessment.draft.id}:${assessment.draft.revision}:${assessment.review?.checkedToday?.length ?? 0}` : "browse";
  const previousPlacementScreen = useRef(placementScreenKey);
  useLayoutEffect(() => {
    if (previousPlacementScreen.current !== placementScreenKey) {
      window.scrollTo({ top: 0, behavior: "instant" });
      const heading = document.getElementById("vnext-assessment-runner-title") ?? document.getElementById("vnext-guided-title");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }
    previousPlacementScreen.current = placementScreenKey;
  }, [placementScreenKey]);

  const sessionHistory = useMemo(() => snapshot ? buildSessionHistory(snapshot.sources, vNextDefinitionBundles) : [], [snapshot, vNextDefinitionBundles]);
  const syncMessage = trainingSyncMessage({ account: identity.mode === "account", online, fingerprint: snapshot?.sources.sourceFingerprint, status: syncStatus });

  const displayedGenerated = workoutRecovery?.generated ?? snapshot?.generated;
  const plan = displayedGenerated?.plan;
  const workoutBundle = plan ? bundleFor(plan.catalogueVersion) : vNextDefinitionBundle;
  // Keep the current review and its answers mounted while reporting a restriction.
  const completionGenerated = workoutRecovery?.generated;
  const completionPresentation = useMemo(() => executionFacts && completionGenerated
    ? buildWorkoutCompletionPresentation({
      bundle: workoutBundle,
      generated: completionGenerated,
      participationSecondsByPlanItem: executionFacts.participationSeconds,
      performedByPlanItem: executionFacts.performedByPlanItem,
    })
    : undefined, [workoutBundle, completionGenerated, executionFacts]);
  const previousRestrictionOpen = useRef(restrictionOpen);
  const restrictionReturnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const open = restrictionOpen || Boolean(restrictionRecovery);
    if (open) document.getElementById("vnext-restriction-report-title")?.focus();
    else if (previousRestrictionOpen.current) {
      const target = restrictionReturnFocus.current;
      if (target?.isConnected && !target.closest("[hidden]") && !target.matches(":disabled")) target.focus();
      else [...["vnext-workout-restriction-action", "vnext-completion-heading", "vnext-today-heading"]
        .map((id) => document.getElementById(id)),
        document.querySelector<HTMLElement>('.vnext-section-navigation button[aria-pressed="true"]')]
        .find((element) => element && !element.closest("[hidden]") && !element.matches(":disabled"))?.focus();
      restrictionReturnFocus.current = null;
    }
    previousRestrictionOpen.current = open;
  }, [restrictionOpen, restrictionRecovery]);
  const workoutSwapOptions = useMemo(() => !plan || !snapshot ? {} : Object.fromEntries(
    plan.items.map((item) => [item.id, safeWorkoutSwaps({
      plan,
      item,
      bundle: workoutBundle,
      state: snapshot.state,
      intent: snapshot.intent,
      projectionPolicy: vNextProjectionPolicy,
    })]),
  ) as Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>, [plan, snapshot, workoutBundle]);
  const effectiveWorkoutSwapOptions = workoutRecovery?.swapOptions ?? workoutSwapOptions;
  const mediaEvaluation = useMemo(() => plan ? evaluatePlanMedia(plan) : undefined, [plan]);
  const unrenderableItems = useMemo(() => plan
    ? unresolvedRenderablePlanItems(plan, workoutBundle)
    : [], [plan, workoutBundle]);
  const mediaBlocked = Boolean(plan && (
    !mediaEvaluation?.releaseAllowed || unrenderableItems.length > 0
  ));
  const workoutStartBlocker = workoutRecovery?.stage === "review" || workoutRecovery?.stage === "prepared"
    ? "Save the completed workout review before starting another session."
    : mediaBlocked && workoutRecovery?.stage !== "active"
    ? "This workout cannot start because at least one movement guide has not completed owned technical and owner review. No substitute will be used."
    : undefined;

  const startAssessment = (action?: AssessmentEntryAction, restart = false): void => runCommand(async () => {
    const current = await runtime.refresh(refreshInput());
    const direct = !restart && action?.kind !== "reassessment" && action?.protocolIds.find((id) =>
      current.presentations.assessment.skillActions?.some((candidate) => candidate.graphId === action.graphId
        && candidate.protocolIds.includes(id)));
    if (direct) {
      const selected = await runtime.startProgressionCheck({ ...refreshInput(), protocolId: direct });
      setSnapshot(selected.snapshot);
      setProgressionCatalogueVersion(selected.check.catalogueVersion);
      setGuidedOffer(selected.check.offer);
      setMessage("");
      return;
    }
    if (!restart && current.assessmentDraft?.status === "in-progress") {
      const draft = current.assessmentDraft;
      if (!action) {
        setRestartForRestrictions(true);
        setRestartSetupOpen(true);
        return;
      }
      setSnapshot({ ...current, assessmentDraft: draft });
      setAssessment({
        draft,
        step: nextAssessmentStep(draft, bundleFor(draft.catalogueVersion)),
        ...(isAssessmentAtReview(draft, bundleFor(draft.catalogueVersion))
          ? { review: buildAssessmentReview(draft, bundleFor(draft.catalogueVersion), current.state, vNextProjectionPolicy,
            draft.status === "committed" ? current.intent.equipment : undefined) } : {}),
      });
      setRestartSetupOpen(false);
      setMessage("Continue from your saved answers. You can go Back to change them.");
      return;
    }
    if (action && action.kind !== "reassessment" && snapshot?.assessmentDraft && snapshot.assessmentReview) {
      const offer = snapshot.assessmentReview.guidedTests.find((candidate) =>
        action.protocolIds.includes(candidate.protocolId) && candidate.availability === "available");
      if (offer) {
        setGuidedOffer(offer);
        setMessage("The exact guided confirmation protocol is ready.");
        return;
      }
    }
    const started = await runtime.startAssessment({
      ...refreshInput(),
      ...(restart && current.assessmentDraft && !restartForRestrictions ? { mode: current.assessmentDraft.mode } : action ? { mode: action.mode } : { mode: "targeted-reconfirmation" as const }),
    });
    setSnapshot(started.snapshot);
    setAssessment(started.assessment);
    setRestartSetupOpen(false);
    setMessage(action?.mode === "new-placement"
      ? "Let’s find your starting point."
      : "We’ll check the areas that need an update.");
  });

  const answerAssessment = (answer: AssessmentAnswerValue): void => {
    if (!assessment) return;
    runCommand(async () => {
      const updated = await runtime.answerAssessment({ draft: assessment.draft, answer });
      setAssessment(updated);
      setMessage(updated.step.kind === "review" ? "Placement is ready to review." : "Answer saved on this device.");
    });
  };

  const updateAssessmentContext = (answers: readonly AssessmentAnswerValue[]): void => {
    if (!assessment) return;
    runCommand(async () => {
      setAssessment(await runtime.updateAssessmentContext({ draft: assessment.draft, answers }));
      setMessage("Setup saved. Choose a movement you know.");
    });
  };

  const deferSupportingAssessment = (): void => {
    if (!assessment) return;
    runCommand(async () => {
      setAssessment(await runtime.deferSupportingAssessment({ draft: assessment.draft }));
      setMessage("Your supporting goals are kept. Start with your main goal’s checks.");
    });
  };

  const backAssessment = (): void => {
    if (!assessment) return;
    runCommand(async () => {
      const updated = await runtime.backAssessment({ draft: assessment.draft });
      setAssessment(updated);
      setMessage("Your previous answer is ready to review. Changing it may change the questions that follow.");
    });
  };

  const commitAssessmentDraft = async (draft: AssessmentDraft) =>
    runtime.commitAssessment({ ...refreshInput(), draft });

  const commitAssessment = (): void => {
    if (!assessment) return;
    runCommand(async () => {
      if (assessment.draft.status === "committed") {
        setSnapshot(await runtime.refresh(refreshInput()));
        setAssessment(undefined);
        setMessage("Your workout uses your saved checks and current readiness. Rest first if the checks felt demanding.");
        return;
      }
      const committed = await commitAssessmentDraft(assessment.draft);
      setSnapshot(committed.snapshot);
      setAssessment(undefined);
      setMessage(committed.clearedRestrictions > 0
        ? "Starting points saved and restrictions updated. Your achievements are kept; some skills may need a fresh check."
        : "Starting points saved. Guided checks and qualifying training will confirm your skills.");
    });
  };

  const openGuidedTestFromReview = (offer: GuidedTestOffer): void => {
    if (!assessment) return;
    runCommand(async () => {
      const committed = assessment.draft.status === "committed"
        ? { snapshot: await runtime.refresh(refreshInput()), clearedRestrictions: 0 }
        : await commitAssessmentDraft(assessment.draft);
      const currentOffer = committed.snapshot.assessmentReview?.guidedTests.find((item) => item.protocolId === offer.protocolId && item.availability === "available");
      if (!currentOffer) throw new Error("This check is no longer available. Return to your starting points for the next safe check.");
      setSnapshot(committed.snapshot);
      setAssessment(undefined);
      setProgressionCatalogueVersion(undefined);
      setGuidedOffer(currentOffer);
      setMessage(committed.clearedRestrictions > 0
        ? "Placement was saved and current restriction feedback cleared. The exact guided confirmation protocol is ready."
        : "Placement was saved first. The exact guided confirmation protocol is ready.");
    });
  };

  const openProgressionCheck = (): void => {
    const check = snapshot?.progressionCheck;
    if (!check || workoutRecovery || guidedRecovery || busy) return;
    runCommand(async () => {
      const current = await runtime.startProgressionCheck({ ...refreshInput(), protocolId: check.offer.protocolId });
      setSnapshot(current.snapshot);
      setProgressionCatalogueVersion(current.check.catalogueVersion);
      setGuidedOffer(current.check.offer);
      setMessage("");
    });
  };

  const commitExactGuidedRecovery = (pending: GuidedRecovery): void => {
    if (guidedSubmissionLocked.current) return;
    guidedSubmissionLocked.current = true;
    try {
      persistGuidedRecovery(pending);
      setCorrectingGuidedEntry(false);
    } catch (reason) {
      guidedSubmissionLocked.current = false;
      setError(reason instanceof Error ? reason.message : "The guided observation could not be retained for safe retry.");
      return;
    }
    setGuidedOffer(pending.offer);
    runCommand(async () => {
      try {
        guidedRecoveryStorage.assertCurrent();
        const committed = pending.version === 2
          ? await runtime.commitProgressionCheck({ ...refreshInput(), catalogueVersion: pending.catalogueVersion, result: pending.result })
          : await runtime.commitGuidedTest({ ...refreshInput(), draft: pending.draft, result: pending.result });
        setSnapshot(committed.snapshot);
        clearGuidedRecovery();
        setGuidedOffer(undefined);
        setProgressionCatalogueVersion(undefined);
        const draft = committed.snapshot.assessmentDraft;
        if (pending.version === 1 && draft?.policyVersion === 2 && committed.snapshot.assessmentReview) {
          const review = committed.snapshot.assessmentReview;
          const next = review.guidedTests.find((offer) => offer.availability === "available");
          // Open instructions only. A saved clean result never starts a timer,
          // awards the next check or removes the athlete’s choice to stop.
          if (pending.result.outcome === "clean" && next && !review.nextPracticeLabels?.length) {
            setAssessment(undefined);
            setGuidedOffer(next);
          } else {
            setAssessment({ draft, step: nextAssessmentStep(draft, bundleFor(draft.catalogueVersion)), review });
          }
        }
        setMessage("Check saved. Rest before continuing; you can finish for today.");
      } finally {
        guidedSubmissionLocked.current = false;
      }
    });
  };

  const discardPendingGuidedResult = (): void => {
    const pending = guidedRecovery;
    if (!pending || busy || guidedSubmissionLocked.current) return;
    runCommand(async () => {
      const retained = localStorage.getItem(guidedRecoveryKey(athleteId, storageNamespace));
      if (retained && retained !== JSON.stringify(pending)) {
        throw new Error("The pending check changed in another view. Reopen the app before discarding it.");
      }
      // Clear only the local form/retry envelope. An already appended observation
      // remains immutable even if its acknowledgement previously failed.
      clearGuidedRecovery();
      setGuidedOffer(undefined);
      setProgressionCatalogueVersion(undefined);
      setCorrectingGuidedEntry(false);
      setSnapshot(await runtime.refresh(refreshInput()));
      setMessage("Pending check closed. Previously saved observations and restrictions are kept.");
    });
  };

  const commitGuidedTest = (result: GuidedTestFormResult): void => {
    if (guidedRecovery) {
      if (correctingGuidedEntry) {
        try {
          commitExactGuidedRecovery({ ...guidedRecovery, result: correctInvalidGuidedAttemptResult(guidedRecovery.result, result) });
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Check the attempt counts before saving.");
        }
      } else commitExactGuidedRecovery(guidedRecovery);
      return;
    }
    if (!guidedOffer || (!progressionCatalogueVersion && !snapshot?.assessmentDraft)) return;
    const occurredAt = now();
    const resultInput: GuidedTestResultInput = {
        eventId: `guided-event-${crypto.randomUUID()}`,
        observationSessionId: guidedObservationOccasionId(athleteId, occurredAt),
        occurredAt,
        recordedAt: occurredAt,
        protocolId: guidedOffer.protocolId,
        ...result,
    };
    commitExactGuidedRecovery(progressionCatalogueVersion
      ? { version: 2, kind: "progression", athleteId, catalogueVersion: progressionCatalogueVersion, offer: guidedOffer, result: resultInput }
      : { version: 1, athleteId, draft: snapshot!.assessmentDraft!, offer: guidedOffer, result: resultInput });
  };

  const finishGuidedWithoutAttempt = (): void => {
    if (busy || guidedSubmissionLocked.current) return;
    runCommand(async () => {
      // This is an explicit form choice, not a failed performance observation.
      // Only the local unsaved form is closed; historical observations stay intact.
      clearGuidedRecovery();
      setGuidedOffer(undefined);
      setProgressionCatalogueVersion(undefined);
      setCorrectingGuidedEntry(false);
      setSnapshot(await runtime.refresh(refreshInput()));
      setMessage("Check closed without a result. Your progress and training load are unchanged.");
    });
  };

  const submitWorkoutReview = (feedback: readonly VNextWorkoutReviewFeedback[]): void => {
    if (completionSubmissionLocked.current || workoutRecovery?.stage !== "review"
      || !workoutRecovery.generated.plan || !executionFacts || workoutRecovery.pendingRestriction || reviewCheckpointError) return;
    completionSubmissionLocked.current = true;
    runCommand(async () => {
      try {
        const exactRecovery = workoutRecovery;
        const currentPlan = exactRecovery.generated.plan!;
        const completedPlanItemIds = new Set(executionFacts.completedPlanItemIds);
        const feedbackByItem = new Map(feedback.map((item) => [item.planItemId, item]));
        const reviewAnswers: WorkoutCompletionAnswer[] = currentPlan.items
          .filter((planned) => planned.purpose !== "preparation" && planned.purpose !== "recovery")
          .map((planned) => {
          const item = feedbackByItem.get(planned.id);
          const measured = executionFacts.participationSeconds[planned.id] ?? 0;
          if (item?.symptomOrInstability && !item.bodyRegion?.trim()) {
            throw new TypeError("A symptom or instability report requires the affected body area");
          }
          if (measured === 0) return {
            planItemId: planned.id,
            status: "skipped",
            participationSeconds: 0,
          };
          const performed = executionFacts.performedByPlanItem[planned.id];
          const identityChanged = performed !== undefined && (
            performed.exerciseId !== planned.exerciseId
              || performed.exerciseDefinitionVersion !== planned.exerciseDefinitionVersion
              || performed.prescriptionVariantId !== planned.prescriptionVariantId);
          const modified = !item || item.status !== "completed"
            || !completedPlanItemIds.has(planned.id)
            || item.symptomOrInstability === true
            || identityChanged;
          const modificationReasons = [
            item?.modificationReason?.trim(),
            item?.status === "skipped" ? `Timer retained ${measured} seconds completed before the athlete stopped.` : undefined,
            !item ? "Only a brief partial attempt was recorded, so no progression rating was requested." : undefined,
            !completedPlanItemIds.has(planned.id) ? "Timer recorded a shortened dose." : undefined,
            identityChanged ? "Athlete selected an approved safe alternative." : undefined,
            item?.symptomOrInstability ? `Reported symptom or instability area: ${item.bodyRegion!.trim()}.` : undefined,
          ].filter((reason): reason is string => Boolean(reason));
          return {
            planItemId: planned.id,
            status: modified ? "modified" : "completed",
            participationSeconds: measured,
            participationBasis: "measured",
            ...(item?.difficulty ? { difficulty: item.difficulty } : {}),
            ...(item?.symptomOrInstability ? { symptomOrInstability: true } : {}),
            ...(identityChanged ? { performed } : {}),
            ...(modified ? { modificationReason: modificationReasons.join(" ") || "Measured work differed from the planned dose." } : {}),
          };
        });
        const timerItemOutcomes = currentPlan.items
          .filter((item) => item.purpose === "preparation" || item.purpose === "recovery")
          .map((item) => {
            const seconds = executionFacts.participationSeconds[item.id] ?? 0;
            if (seconds === 0) return {
              planItemId: item.id,
              status: "skipped" as const,
              participationSeconds: 0,
              participationBasis: "measured" as const,
            };
            const performed = executionFacts.performedByPlanItem[item.id];
            const identityChanged = performed !== undefined && (
              performed.exerciseId !== item.exerciseId
                || performed.exerciseDefinitionVersion !== item.exerciseDefinitionVersion
                || performed.prescriptionVariantId !== item.prescriptionVariantId);
            const modified = !completedPlanItemIds.has(item.id) || identityChanged;
            return {
              planItemId: item.id,
              status: modified ? "modified" as const : "completed" as const,
              participationSeconds: seconds,
              participationBasis: "measured" as const,
              ...(identityChanged ? {
                performedExerciseId: performed.exerciseId,
                performedExerciseDefinitionVersion: performed.exerciseDefinitionVersion,
                performedPrescriptionVariantId: performed.prescriptionVariantId,
              } : {}),
              ...(modified ? { modificationReason: identityChanged
                ? "Athlete selected an approved safe alternative."
                : "Timer recorded a shortened preparation or recovery dose." } : {}),
            };
          });
        const prepared = runtime.prepareWorkoutCompletion({
          generated: exactRecovery.generated,
          timerItemOutcomes,
          reviewAnswers,
          startedAt: executionFacts.startedAt,
          completedAt: executionFacts.completedAt,
          status: completionStatus(currentPlan, executionFacts, feedback),
        });
        persistWorkoutRecovery({ ...exactRecovery, stage: "prepared", prepared });
        await runtime.commitWorkoutCompletion({ ...refreshInput(), prepared });
        rememberCompletedEmphasis(athleteId, exactRecovery.generated, prepared, storageNamespace);
        const refreshed = await runtime.refresh(refreshInput());
        setSnapshot(refreshed);
        clearWorkoutRecovery();
        setSavedWorkoutId(prepared.record.id);
        setMessage(prepared.restrictionFollowUp
          ? "Workout saved. Your reported discomfort will be considered in future workouts; your achievements are kept."
          : "");
      } finally {
        completionSubmissionLocked.current = false;
      }
    });
  };

  const retryPreparedCompletion = (): void => {
    if (completionSubmissionLocked.current || !pendingPrepared || !workoutRecovery) return;
    completionSubmissionLocked.current = true;
    runCommand(async () => {
      try {
        workoutRecoveryStorage.assertCurrent();
        const committed = await runtime.commitWorkoutCompletion({ ...refreshInput(), prepared: pendingPrepared });
        rememberCompletedEmphasis(athleteId, workoutRecovery.generated, pendingPrepared, storageNamespace);
        const refreshed = await runtime.refresh(refreshInput());
        setSnapshot(refreshed);
        clearWorkoutRecovery();
        setSavedWorkoutId(pendingPrepared.record.id);
        setMessage(committed.append.record.status === "duplicate"
          ? "Workout already saved. No duplicate was added."
          : "Workout saved.");
      } finally {
        completionSubmissionLocked.current = false;
      }
    });
  };

  const exportObservations = (): void => runCommand(async () => {
    try {
      const definitionFingerprint = await sha256(vNextDefinitionBundles);
      const bundle = await store.exportBundle(athleteId, {
        exportedAt: now(),
        catalogueVersions: vNextDefinitionBundles.map((bundle) => bundle.catalogueVersion),
        projectionVersions: [vNextProjectionPolicy.version],
        definitionFingerprints: [definitionFingerprint],
        policyVersions: [{ id: vNextProjectionPolicy.id, version: vNextProjectionPolicy.version }],
      });
      downloadJson(`parallette25-vnext-${athleteId}.json`, bundle);
      setMessage("Your training backup is ready.");
    } catch (reason) {
      setMessage("Backup export could not finish. Keep this app and its storage, then try again.");
      throw reason;
    }
  });

  const importObservations = (file: File): void => runCommand(async () => {
    const parsed = JSON.parse(await file.text()) as ObservationExportBundle;
    if (parsed.athleteId !== athleteId) throw new Error("This observation export belongs to a different athlete.");
    const result = await store.importBundle(parsed);
    const refreshed = await runtime.refresh(refreshInput());
    setSnapshot(refreshed);
    setMessage(`Backup imported: ${result.inserted} new entries; ${result.duplicates} already saved.`);
  });

  const syncObservations = requestTrainingSync;

  const resetProgress = async (): Promise<void> => {
    setSavedWorkoutId(undefined);
    setSyncStatus({ phase: "waiting" });
    const resetAt = now();
    const refreshed = await runtime.resetProgress({ ...refreshInput(), resetAt });
    clearWorkoutRecovery();
    clearGuidedRecovery();
    setAssessment(undefined);
    setGuidedOffer(undefined);
    setSnapshot(refreshed);
    if (identity.mode === "account") {
      const boundary = await import("../../profileStore");
      try {
        await boundary.syncVNextShadowObservations(store, athleteId);
      } catch (error) {
        if (!boundary.isTransientVNextSyncError(error)) throw error;
        setMessage("Progress was reset safely on this device. The reset will sync when the connection returns.");
        return;
      }
    }
    setMessage("Training progress was reset. Account access remains available and old devices cannot restore earlier evidence.");
  };

  const startCustomSession = (request: VNextCustomSessionRequest): void => runCommand(async () => {
    const refreshed = await runtime.refresh(refreshInput(request.demand));
    setSnapshot(refreshed);
    const plannerGraphId = request.focus.kind === "graph"
      ? request.focus.graphId
      : request.focus.kind === "capacity"
        ? request.focus.plannerGraphId
        : undefined;
    const intent = {
      ...refreshed.intent,
      updatedAt: refreshed.asOf,
      ...(plannerGraphId ? { goals: [{ graphId: plannerGraphId, priority: "primary" as const }] } : {}),
      equipment: request.equipment,
      defaultSessionDemand: request.demand,
    };
    const generated = (catalogue.generateCustomSession ?? generateVNextCustomSession)({
      createdAt: refreshed.asOf,
      bundle: vNextDefinitionBundle,
      intent,
      state: refreshed.state,
      projectionPolicy: vNextProjectionPolicy,
      sessionDemand: request.demand,
      seed: `${athleteId}:custom:${request.focus.kind}:${request.focus.label}:${request.minutes}:${refreshed.asOf.slice(0, 10)}`,
    }, request.minutes, request.focus.kind === "capacity" ? {
      label: request.focus.label,
      capacityIds: request.focus.capacityIds,
    } : undefined);
    if (!generated.ok || !generated.plan) {
      throw new Error("No safe short session is available for that focus and equipment today.");
    }
    const media = evaluatePlanMedia(generated.plan);
    const unresolved = unresolvedRenderablePlanItems(generated.plan, vNextDefinitionBundle);
    if (!media.releaseAllowed || unresolved.length > 0) {
      throw new Error("This short session is blocked because an exact owned movement guide is unavailable.");
    }
    const swapOptions = Object.fromEntries(generated.plan.items.map((item) => [item.id, safeWorkoutSwaps({
      plan: generated.plan!,
      item,
      bundle: vNextDefinitionBundle,
      state: refreshed.state,
      intent,
      projectionPolicy: vNextProjectionPolicy,
    })])) as Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
    setWorkoutSelections({});
    persistWorkoutRecovery({ version: 1, athleteId, stage: "preview", origin: "custom", generated, selections: {}, swapOptions,
      customRequest: request, equipmentAtPreview: refreshed.intent.equipment });
    setCustomOpen(false);
    setWorkoutOpen(false);
    setMessage("Custom workout ready. Review the exercises, then start when you’re ready.");
  });

  const startOrResumeWorkout = (): void => {
    if (busy || workoutRecovery?.stage === "review" || workoutRecovery?.stage === "prepared") return;
    if (workoutRecovery?.stage === "active" || workoutRecovery?.stage === "preview") {
      setWorkoutOpen(true);
      setMessage(workoutRecovery.stage === "active"
        ? "Your paused workout is ready."
        : `Reviewing the ${workoutRecovery.origin === "custom" ? "Custom Session" : "Today workout"} before its timer starts.`);
      return;
    }
    runCommand(async () => {
      // A never-started plan is advisory, not historical truth. Rebuild it at
      // the instant the athlete starts so inactivity, confidence, restrictions
      // and recent exposure cannot be stale after a suspended PWA resumes.
      const refreshed = await runtime.refresh(refreshInput());
      setSnapshot(refreshed);
      const generated = refreshed.generated;
      if (!generated.ok || !generated.plan) throw new Error("Today's safe workout is not currently available.");
      const media = evaluatePlanMedia(generated.plan);
      const unresolved = unresolvedRenderablePlanItems(generated.plan, vNextDefinitionBundle);
      if (!media.releaseAllowed || unresolved.length > 0) {
        throw new Error("This workout is blocked because an exact owned movement guide is unavailable.");
      }
      const previewItems = plan?.items ?? [];
      const freshSwapOptions = Object.fromEntries(generated.plan.items.map((item) => [item.id, safeWorkoutSwaps({
        plan: generated.plan!,
        item,
        bundle: vNextDefinitionBundle,
        state: refreshed.state,
        intent: refreshed.intent,
        projectionPolicy: vNextProjectionPolicy,
      })])) as Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
      const validSelections = Object.fromEntries(generated.plan.items.flatMap((item, index) => {
        const previewItem = previewItems[index];
        const selection = previewItem ? workoutSelections[previewItem.id] : undefined;
        if (!selection) return [];
        const safe = freshSwapOptions[item.id] ?? [];
        return safe.some((option) => option.exerciseId === selection.exerciseId
          && option.exerciseDefinitionVersion === selection.exerciseDefinitionVersion
          && option.prescriptionVariantId === selection.prescriptionVariantId)
          ? [[item.id, selection] as const]
          : [];
      }));
      persistWorkoutRecovery({ version: 1, athleteId, stage: "preview", origin: "today", generated, selections: validSelections, swapOptions: freshSwapOptions });
      setWorkoutOpen(true);
    });
  };

  const beginWorkout = (): boolean => {
    const preview = workoutRecovery;
    if (!preview || preview.stage !== "preview") return preview?.stage === "active";
    try {
      persistWorkoutRecovery({ ...preview, stage: "active" });
      setMessage(`${preview.origin === "custom" ? "Custom Session" : "Today’s workout"} started. Exact timer progress is recoverable on this device.`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The workout could not be made recoverable, so its timer was not started.");
      return false;
    }
  };

  const checkWorkoutBeforeRun = (request: WorkoutRunRequest): Promise<boolean> => new Promise((resolve, reject) => {
    runCommand(async () => {
      try {
        workoutRecoveryStorage.assertCurrent();
        const recovery = workoutRecovery;
        if (!recovery || (recovery.stage !== "preview" && recovery.stage !== "active") || recovery.pendingRestriction) {
          throw new Error("Finish saving your restriction or workout review before continuing training.");
        }
        const refreshed = await runtime.refresh(refreshInput());
        setSnapshot(refreshed);
        const sameEquipment = recovery.equipmentAtPreview
          && [...recovery.equipmentAtPreview].sort().join("|") === [...refreshed.intent.equipment].sort().join("|");
        // Custom equipment is an explicit one-off choice. Keep it while the saved
        // profile is unchanged; a later equipment change can only narrow it.
        const equipment = recovery.customRequest
          ? recovery.customRequest.equipment.filter((id) => sameEquipment || refreshed.intent.equipment.includes(id))
          : refreshed.intent.equipment;
        const result = validateWorkoutStart({
          generated: recovery.generated,
          bundle: bundleFor(recovery.generated.plan!.catalogueVersion),
          state: refreshed.state,
          intent: { ...refreshed.intent, equipment },
          projectionPolicy: vNextProjectionPolicy,
          selections: request.selections,
          ...(recovery.stage === "active" ? { planItemIds: request.planItemIds } : {}),
        });
        if (!result.allowed) {
          throw new Error(`${result.issues[0]?.message ?? "This workout is no longer suitable."} ${recovery.stage === "active"
            ? "Your completed work is kept. Save and close, then end and review it from Today."
            : "Return to Today and choose a fresh workout."}`);
        }
        if ((await store.readProjectionSources(athleteId)).sourceFingerprint !== refreshed.sources.sourceFingerprint) {
          throw new Error("Your training information changed during the safety check. Tap Start or Resume to check again.");
        }
        workoutRecoveryStorage.assertCurrent();
        resolve(true);
      } catch (reason) {
        reject(reason);
        throw reason;
      }
    });
  });

  const saveWorkoutRestriction = (report: RestrictionReportedEvent): Promise<void> => new Promise((resolve, reject) => {
    runCommand(async () => {
      try {
        const recovery = workoutRecovery;
        if (!recovery || recovery.stage !== "review" || report.athleteId !== athleteId) {
          throw new Error("The workout review is unavailable. Your work has not been removed.");
        }
        persistWorkoutRecovery({ ...recovery, pendingRestriction: report });
        const result = await runtime.commitRestrictionReport({ ...refreshInput(), event: report });
        setSnapshot(result.snapshot);
        const { pendingRestriction: _pending, ...retained } = recovery;
        persistWorkoutRecovery(retained);
        setRestrictionOpen(false);
        setMessage("Restriction saved. Affected movements are paused; finish saving your completed work below.");
        resolve();
      } catch (reason) {
        reject(reason);
        throw reason;
      }
    });
  });

  const saveComfortUpdate = (event: RestrictionReportedEvent, clearance?: RestrictionClearedEvent): Promise<void> => new Promise((resolve, reject) => {
    runCommand(async () => {
      try {
        const result = await runtime.commitRestrictionReport({ ...refreshInput(), event, clearance });
        setSnapshot(result.snapshot);
        setWorkoutSelections({});
        setRestrictionRecovery(undefined);
        setMessage(clearance
          ? "Comfort updated. Your history is kept; suitable practice and checks will guide your return."
          : "Affected movements are paused. Your original feedback and progress are kept.");
        resolve();
      } catch (reason) {
        reject(reason);
        throw reason;
      }
    });
  });

  const captureWorkoutDiscard = (): (() => void) => {
    const timerStorage = createRecoveryStorageGuard(`parallette25-vnext-rc-active-workout-v1:${athleteId}`);
    if (timerStorage.initialValue !== null) {
      const timer = JSON.parse(timerStorage.initialValue) as { athleteId?: string; planId?: string };
      if (timer?.athleteId !== athleteId || timer.planId !== workoutRecovery?.generated.plan?.id) {
        throw new RecoveryStorageConflict();
      }
    }
    workoutRecoveryStorage.assertCurrent();
    timerStorage.assertCurrent();
    return () => {
      // Check both records before deleting either. No async work may split this
      // pair: a confirmation dialog can allow another view to save new work.
      workoutRecoveryStorage.assertCurrent();
      timerStorage.assertCurrent();
      timerStorage.remove();
      clearWorkoutRecovery();
    };
  };

  const closeWorkout = (started: boolean): void => {
    if (started) {
      setWorkoutOpen(false);
      setMessage("Workout saved on this device. Resume whenever you’re ready.");
      return;
    }
    try {
      const origin = workoutRecovery?.origin ?? "today";
      captureWorkoutDiscard()();
      setWorkoutOpen(false);
      setWorkoutSelections({});
      setMessage(origin === "custom"
        ? "Custom Session cancelled. Today’s normal workout is available again."
        : "Returned to Today. No workout or evidence was saved because the timer never started.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved workout could not be safely closed.");
    }
  };

  const discardWorkout = (): void => {
    const recovery = workoutRecovery;
    if (!recovery || (recovery.stage !== "preview" && recovery.stage !== "active")) return;
    try {
      const discard = captureWorkoutDiscard();
      if (recovery.stage === "active" && typeof window !== "undefined"
        && !window.confirm("Discard this in-progress workout without saving its performed work?")) return;
      discard();
      setWorkoutSelections({});
      setMessage(recovery.origin === "custom"
        ? "Custom Session discarded. Today’s normal workout is available again."
        : "Saved workout discarded. Today has returned to the current recommendation.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved workout could not be safely discarded.");
    }
  };

  const finishWorkout = (facts: WorkoutExecutionFacts): boolean => {
    const active = workoutRecovery;
    if (!active || active.stage !== "active" || !active.generated.plan) {
      setError("The exact active Session Plan is unavailable; timer facts were not discarded.");
      return false;
    }
    try {
      persistWorkoutRecovery({ ...active, stage: "review", facts });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Timer facts could not be durably retained; the active workout remains recoverable.");
      return false;
    }
    setWorkoutOpen(false);
    setMessage("Your workout is kept on this device. Finish the short review to save it in History.");
    return true;
  };

  const endRecoveredWorkout = (): void => {
    const recovery = workoutRecovery;
    const recoveryPlan = recovery?.generated.plan;
    if (!recovery || recovery.stage !== "active" || !recoveryPlan) return;
    const facts = (isMixedWorkoutPlan(recoveryPlan) ? recoverMixedWorkoutFacts : recoverActiveWorkoutFacts)(
      recoveryPlan,
      bundleFor(recoveryPlan.catalogueVersion),
      recovery.selections,
      effectiveWorkoutSwapOptions,
    );
    if (!facts) {
      setError("The saved timer could not be read safely. Resume the workout to inspect it before ending.");
      return;
    }
    finishWorkout(facts);
  };

  if (accountOpen) {
    const AccountGate = deployment.AccountGate ?? VNextAccountGate;
    return <AccountGate current={identity} onSelected={onIdentitySelected} onClose={() => setAccountOpen(false)} onSignedOut={onSignedOut} onResetProgress={resetProgress} presentation={deployment.accountPresentation} storageNamespace={storageNamespace} shadowDatabaseName={deployment.shadowDatabaseName} />;
  }

  if (!snapshot) {
    return (
      <main className="vnext-experience vnext-rc-loading" aria-live="polite">
        <div inert={appUpdate.phase === "applying"}>
          <p className="vnext-kicker">{deployment.productKicker}</p>
          <h1>{startupFailure?.title ?? "Opening your training…"}</h1>
          <p>{startupFailure?.message ?? "Your saved training is being opened on this device."}</p>
          {startupFailure && <>
            <div className="vnext-actions">
              <button type="button" className="vnext-action" disabled={busy} onClick={openTraining}>Try again</button>
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || appUpdate.phase === "checking"}
                onClick={() => { void updateController.current?.check(); }}>Check for updates</button>
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => setAccountOpen(true)}>Account options</button>
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={exportObservations}>Export saved training</button>
            </div>
            {appUpdate.message && <p role="status">{appUpdate.message}</p>}
            {appUpdate.availableBuild && <aside className="vnext-update-notice" aria-label="App update">
              <p>Update ready. Your saved progress stays on this device.</p>
              {(!startupUpdateSafe || workoutRecovery || guidedRecovery) && <p>Unfinished work is protected. Try opening your saved training again before updating.</p>}
              <button type="button" className="vnext-action" disabled={busy || !startupUpdateSafe || Boolean(workoutRecovery || guidedRecovery)}
                onClick={() => { void updateController.current?.apply(); }}>Update now</button>
            </aside>}
            {(message === "Your training backup is ready." || message.startsWith("Backup export could not finish.")) && <p role="status">{message}</p>}
          </>}
        </div>
        {appUpdate.phase === "applying" && <div className="vnext-update-overlay" role="status"><p>Opening the update… Your saved progress is kept.</p></div>}
      </main>
    );
  }

  if (customOpen) {
    return <CustomSessionBuilder preferenceKey={shortWorkoutPreferenceKey(athleteId, storageNamespace)} goals={snapshot.presentations.goals} currentEquipment={snapshot.intent.equipment} defaultDemand={snapshot.intent.defaultSessionDemand} busy={busy} error={error} onClose={() => setCustomOpen(false)} onBuild={startCustomSession} />;
  }

  if (workoutOpen && plan) {
    const safetyProps = deployment.kind === "production" ? { onBeforeRun: checkWorkoutBeforeRun, safetyVersion: snapshot.sources.sourceFingerprint } : {};
    if (isMixedWorkoutPlan(plan)) return <MixedWorkoutRunner plan={plan} bundle={workoutBundle} origin={workoutRecovery?.origin ?? "today"} initialSelections={workoutRecovery?.selections} swapOptions={effectiveWorkoutSwapOptions} onStart={beginWorkout} {...safetyProps} onClose={closeWorkout} onFinish={finishWorkout} />;
    return <WorkoutRunner plan={plan} bundle={workoutBundle} origin={workoutRecovery?.origin ?? "today"} initialSelections={workoutRecovery?.selections} swapOptions={effectiveWorkoutSwapOptions} onStart={beginWorkout} {...safetyProps} onClose={closeWorkout} onFinish={finishWorkout} />;
  }

  if (guidedOffer) {
    return <GuidedTestRunner key={`${guidedOffer.protocolId}:${guidedRecovery?.result.eventId ?? "new"}:${correctingGuidedEntry ? "correct" : "retry"}`} offer={guidedOffer} bundle={bundleFor(guidedRecovery?.version === 2 ? guidedRecovery.catalogueVersion : progressionCatalogueVersion ?? (guidedRecovery?.draft ?? snapshot.assessmentDraft)?.catalogueVersion ?? vNextDefinitionBundle.catalogueVersion)} busy={busy} error={error} retryingExactObservation={Boolean(guidedRecovery) && !correctingGuidedEntry} initialResult={correctingGuidedEntry ? guidedRecovery?.result : undefined} onCorrectInvalidEntry={guidedRecovery && hasInvalidGuidedAttemptCount(guidedRecovery.result) && !correctingGuidedEntry ? () => {
      setCorrectingGuidedEntry(true);
      setError(undefined);
    } : undefined} hasSavedChecks={Boolean(snapshot.assessmentReview?.checkedToday?.length)} onClose={() => {
      setGuidedOffer(undefined);
      setProgressionCatalogueVersion(undefined);
      const draft = snapshot.assessmentDraft;
      if (!progressionCatalogueVersion && !guidedRecovery && draft?.policyVersion === 2 && snapshot.assessmentReview) {
        setAssessment({ draft, step: nextAssessmentStep(draft, bundleFor(draft.catalogueVersion)), review: snapshot.assessmentReview });
      }
    }} onCommit={commitGuidedTest} onNoAttempt={finishGuidedWithoutAttempt} onDiscardUnsavedResult={guidedRecovery ? discardPendingGuidedResult : undefined} />;
  }

  if (restartSetupOpen) {
    return <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-restart-title">
      <section className="vnext-rc-modal">
        <h1 id="vnext-restart-title">{restartForRestrictions ? "Update your comfort and restrictions?" : "Start setup again?"}</h1>
        <p>{restartForRestrictions ? "This starts a fresh comfort check and replaces your unfinished setup answers on this device." : "This replaces your unfinished setup answers on this device."} Saved workouts and achievements are kept.</p>
        {error && <p className="vnext-rc-message is-error" role="alert">{error}</p>}
        <div className="vnext-actions">
          <button type="button" className="vnext-action" autoFocus disabled={busy} onClick={() => startAssessment(undefined, true)}>{restartForRestrictions ? "Start comfort check" : "Start setup again"}</button>
          <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => setRestartSetupOpen(false)}>Keep my answers</button>
        </div>
      </section>
    </main>;
  }

  if (assessment) {
    const review = assessment.review ?? (isAssessmentAtReview(assessment.draft, bundleFor(assessment.draft.catalogueVersion))
      ? buildAssessmentReview(assessment.draft, bundleFor(assessment.draft.catalogueVersion), snapshot.state, vNextProjectionPolicy,
        assessment.draft.status === "committed" ? snapshot.intent.equipment : undefined)
      : undefined);
    return <AssessmentRunner draft={assessment.draft} step={assessment.step} bundle={bundleFor(assessment.draft.catalogueVersion)} review={review} busy={busy} error={error} onAnswer={answerAssessment} onContextSubmit={updateAssessmentContext} onDeferSupporting={deferSupportingAssessment} onBack={backAssessment} onCommit={commitAssessment} onClose={() => runCommand(async () => {
      setSnapshot(await runtime.refresh(refreshInput()));
      setAssessment(undefined);
      setMessage("");
    })} onGuidedTestRequested={openGuidedTestFromReview} />;
  }

  const customPreview = workoutRecovery?.stage === "preview" && workoutRecovery.origin === "custom";
  const selectPreviewSwap = (planItemId: PlanItemId, selection?: SafeWorkoutSwap): void => {
    if (!customPreview || !workoutRecovery?.generated.plan?.items.some((item) => item.id === planItemId)) return;
    const offered = selection && effectiveWorkoutSwapOptions[planItemId]?.find((option) =>
      option.exerciseId === selection.exerciseId
      && option.exerciseDefinitionVersion === selection.exerciseDefinitionVersion
      && option.prescriptionVariantId === selection.prescriptionVariantId);
    if (selection && !offered) {
      setError("That alternative is no longer available. Choose one of the listed options.");
      return;
    }
    const selections = { ...workoutRecovery.selections };
    if (offered) selections[planItemId] = offered;
    else delete selections[planItemId];
    try {
      persistWorkoutRecovery({ ...workoutRecovery, selections });
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The preview change could not be saved. Please try again.");
    }
  };
  const workflowLocked = Boolean(workoutRecovery || guidedRecovery);
  const baseTodayPresentation = workoutRecovery
    ? buildTodayWorkoutPresentation({ bundle: workoutBundle, generated: workoutRecovery.generated }, workoutRecovery.selections)
    : buildTodayWorkoutPresentation({ bundle: vNextDefinitionBundle, generated: snapshot.generated }, workoutSelections);
  const checksToday = !workoutRecovery && (snapshot.assessmentReview?.checkedToday?.length ?? 0) > 0;
  const startingPractice = snapshot.assessmentReview?.nextPracticeLabels ?? [];
  const todayPresentation = checksToday ? { ...baseTodayPresentation,
    ...(baseTodayPresentation.focus ? { focus: { ...baseTodayPresentation.focus, label: "Optional practice after checks" } } : {}),
    startActionLabel: "Review optional practice",
    placementMessage: `Today’s checks are saved and count toward your training load. You can finish for today.${startingPractice.length ? ` Starting practice: ${startingPractice.join(", ")}, when recovered and current safety checks allow it.` : " Continue the remaining checks when ready."} Any practice below is optional and respects the load already recorded.`,
  } : baseTodayPresentation;

  const showingRestrictionReport = restrictionOpen && workoutRecovery?.stage === "review";
  const showingComfortUpdate = Boolean(restrictionRecovery);

  return (
    <div className="vnext-rc-root vnext-simple-app">
      {showingRestrictionReport && <RestrictionReportForm athleteId={athleteId} catalogueVersion={vNextDefinitionBundle.catalogueVersion}
        initialReport={workoutRecovery.pendingRestriction} onSave={saveWorkoutRestriction} onClose={() => setRestrictionOpen(false)} />}
      {restrictionRecovery && <RestrictionRecoveryForm athleteId={athleteId} catalogueVersion={vNextDefinitionBundle.catalogueVersion}
        context={restrictionRecovery} onSave={saveComfortUpdate} onClose={() => setRestrictionRecovery(undefined)} />}
      <div hidden={showingRestrictionReport || showingComfortUpdate}>
      <div inert={appUpdate.phase === "applying"}>
      <aside className="vnext-rc-banner" aria-label={deployment.kind === "production" ? "Application and account status" : "Release candidate status"}>
        <span><strong>{deployment.bannerTitle}</strong> · {deployment.bannerDetail}</span>
        <div className="vnext-rc-banner-tools">
          <button type="button" className="vnext-rc-account-button" disabled={Boolean(reviewCheckpointError)} onClick={() => setAccountOpen(true)}>{identity.mode === "account" ? `Account: ${identity.username}` : "On this device"}</button>
          <details>
            <summary>Offline &amp; data tools</summary>
            <p>App version: {appUpdate.runningBuild?.slice(0, 8) ?? "local preview"}</p>
            <p role="status">{appUpdate.message}</p>
            <div className="vnext-actions">
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || appUpdate.phase === "checking"} onClick={() => { void updateController.current?.check(); }}>Check for updates</button>
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || workflowLocked} onClick={exportObservations}>Export backup</button>
              <label className="vnext-action" data-kind="secondary" aria-disabled={busy || workflowLocked}>Import backup<input className="vnext-rc-file" type="file" accept="application/json,.json" disabled={busy || workflowLocked} onChange={(event) => { const file = event.target.files?.[0]; if (file) importObservations(file); event.target.value = ""; }} /></label>
              {identity.mode === "account"
                ? <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || workflowLocked} onClick={syncObservations}>Sync now</button>
                : <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || workflowLocked} onClick={() => setAccountOpen(true)}>Set up sync</button>}
            </div>
          </details>
        </div>
      </aside>
      <p className="vnext-sync-status" data-state={syncStatus.phase} role="status">{syncMessage}</p>
      {appUpdate.availableBuild && <aside className="vnext-update-notice" aria-label="App update">
        <p><strong>Update ready</strong> · Your saved progress stays on this device.
          {workflowLocked ? " Finish saving your workout or check before updating." : ""}
          {goalEditing ? " Save or cancel your goal changes before updating." : ""}</p>
        {syncInFlight.current && <p>Sync is finishing. The update will be available when it finishes.</p>}
        {appUpdate.message && <p role="status">{appUpdate.message}</p>}
        <button type="button" className="vnext-action" disabled={busy || syncInFlight.current || workflowLocked || goalEditing || Boolean(reviewCheckpointError)}
          onClick={() => { void updateController.current?.apply(); }}>Update now</button>
      </aside>}
      {(message || error) && <p className={`vnext-rc-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error ?? message}{pendingPrepared && error ? " Your workout is kept on this device so you can retry." : ""}</p>}
      {pendingPrepared && <button type="button" className="vnext-submit vnext-rc-retry" disabled={busy} onClick={retryPreparedCompletion}>Retry saving workout</button>}
      {guidedRecovery && !guidedOffer && <button type="button" className="vnext-submit vnext-rc-retry" disabled={busy} onClick={() => {
        setProgressionCatalogueVersion(guidedRecovery.version === 2 ? guidedRecovery.catalogueVersion : undefined);
        setGuidedOffer(guidedRecovery.offer);
      }}>Review pending test result</button>}
      {reviewCheckpointError && <div className="vnext-run-safety-message" role="alert"><p>{reviewCheckpointError}</p><button type="button" className="vnext-action" onClick={retryWorkoutReviewCheckpoint}>Retry saving review</button></div>}
      <VNextExperience
        onGoalEditingChange={setGoalEditing}
        setupNotice={!workflowLocked ? <>
          {snapshot.assessmentDraft?.status === "in-progress" && (
            <section className="vnext-panel vnext-rc-saved-setup" aria-label="Saved setup">
              <span>Setup saved</span>
              <div className="vnext-actions">
                <button type="button" className="vnext-action" disabled={busy} onClick={() => startAssessment(snapshot.presentations.assessment.actions.find((action) => action.kind === "reassessment"))}>Resume setup</button>
                <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => { setRestartForRestrictions(false); setRestartSetupOpen(true); }}>Start over</button>
              </div>
            </section>
          )}
          {snapshot.progressionCheck ? (
          <section className="vnext-panel vnext-rc-saved-setup" aria-label="Your next progress check">
            <h3>Your next progress check</h3>
            <p><strong>{snapshot.progressionCheck.offer.label} · {snapshot.progressionCheck.target}</strong></p>
            <p>{snapshot.progressionCheck.why}</p>
            <p>{snapshot.progressionCheck.when}</p>
            <details><summary>What confirms progress?</summary><p>{snapshot.progressionCheck.confirmation}</p></details>
            {snapshot.progressionCheck.offer.availability === "available" && <button type="button" className="vnext-action" disabled={busy} onClick={openProgressionCheck}>View check</button>}
          </section>
        ) : snapshot.assessmentDraft?.status !== "in-progress" && snapshot.assessmentDraft?.policyVersion === 2 && snapshot.assessmentReview && !snapshot.assessmentReview.checksComplete ? (
          <section className="vnext-panel vnext-rc-saved-setup" aria-label="Starting-point checks">
            <p><strong>Confirm your starting point</strong><br />A few relevant checks help match the workout to what you can do. Some skills need another day’s confirmation.</p>
            <button type="button" className="vnext-action" disabled={busy} onClick={() => runCommand(async () => {
              const current = await runtime.refresh(refreshInput());
              const draft = current.assessmentDraft;
              if (!draft || !current.assessmentReview) return;
              setSnapshot(current);
              setAssessment({ draft, step: nextAssessmentStep(draft, bundleFor(draft.catalogueVersion)), review: current.assessmentReview });
            })}>Continue checks</button>
          </section>
        ) : undefined}
        </> : undefined}
        progress={snapshot.presentations.progress}
        skillDetails={snapshot.presentations.skillDetails}
        today={todayPresentation}
        goals={snapshot.presentations.goals}
        assessment={snapshot.presentations.assessment}
        restrictions={snapshot.presentations.restrictions}
        recentSessions={sessionHistory}
        savedWorkout={sessionHistory.find((session) => session.id === savedWorkoutId)}
        syncMessage={syncMessage}
        onDismissSummary={() => setSavedWorkoutId(undefined)}
        completion={completionPresentation}
        reviewSessionId={completionPresentation ? workoutRecovery?.generated.plan?.id : undefined}
        reviewDraft={workoutRecovery?.reviewDraft}
        onReviewDraftChange={workoutRecovery?.stage === "review" ? retainWorkoutReview : undefined}
        busy={busy}
        workoutStartBlocker={workoutStartBlocker}
        workoutOrigin={workoutRecovery?.origin}
        workoutRecoveryStage={workoutRecovery?.stage === "preview" || workoutRecovery?.stage === "active"
          ? workoutRecovery.stage
          : undefined}
        workoutSwapOptions={!workflowLocked ? workoutSwapOptions : effectiveWorkoutSwapOptions}
        workoutSelections={!workflowLocked ? workoutSelections : workoutRecovery?.selections}
        onWorkoutSwap={!busy && customPreview ? selectPreviewSwap : !workflowLocked && !busy ? (planItemId, selection) => setWorkoutSelections((current) => {
          const next = { ...current };
          if (selection) next[planItemId] = selection;
          else delete next[planItemId];
          return next;
        }) : undefined}
        onCustomSessionRequested={!workflowLocked && !busy ? () => { setError(undefined); setCustomOpen(true); } : undefined}
        onDemandChange={!workflowLocked && !busy ? (demand) => runCommand(async () => { const updated = await runtime.selectDailyDemand({ ...refreshInput(), sessionDemand: demand }); dailyDemand.current = { day: updated.asOf.slice(0, 10), demand }; setWorkoutSelections({}); setSnapshot(updated); setMessage(`${demand === "technique" ? "Easier / Technique" : demand === "challenge" ? "Challenge" : "Standard"} selected for today’s workout.`); }) : undefined}
        onGoalSelectionChange={!workflowLocked && !busy ? (selection) => new Promise<void>((resolve, reject) => {
          runCommand(async () => {
            try {
              const updated = await runtime.updateGoals({ ...refreshInput(), selection });
              setWorkoutSelections({});
              setSnapshot(updated);
              setMessage("Goals saved. Your next workout will use these priorities.");
              resolve();
            } catch (reason) {
              reject(reason);
              throw reason;
            }
          });
        }) : undefined}
        onAssessmentRequested={!workflowLocked && !busy ? startAssessment : undefined}
        onStartWorkout={!busy && plan && ((workoutRecovery?.stage === "active" || workoutRecovery?.stage === "preview") || (!workoutRecovery && snapshot.generated.ok && !mediaBlocked)) ? startOrResumeWorkout : undefined}
        onDiscardWorkout={!busy && (workoutRecovery?.stage === "preview" || workoutRecovery?.stage === "active") ? discardWorkout : undefined}
        onEndRecoveredWorkout={!busy && workoutRecovery?.stage === "active" ? endRecoveredWorkout : undefined}
        onWorkoutReviewSubmitted={!busy && !reviewCheckpointError && workoutRecovery?.stage === "review" ? submitWorkoutReview : undefined}
        onWorkoutRestrictionRequested={!busy && !reviewCheckpointError && workoutRecovery?.stage === "review" ? () => {
          restrictionReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setRestrictionOpen(true);
        } : undefined}
        onRestrictionRequested={!workflowLocked && !busy ? (sourceKey) => {
          const item = snapshot.presentations.restrictions.items.find((candidate) => candidate.sourceKey === sourceKey);
          if (!item?.source || item.action === "recheck") { startAssessment(); return; }
          const source = item.source;
          const report = source.kind === "evidence-event" ? snapshot.sources.evidenceEvents.find((event): event is RestrictionReportedEvent =>
            event.id === source.eventId && event.type === "restriction_reported") : undefined;
          restrictionReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setRestrictionRecovery({ source, demandDomains: item.demandDomains, ...(report ? { report } : {}) });
        } : undefined}
      />
      </div>
      </div>
      {appUpdate.phase === "applying" && <div className="vnext-update-overlay" role="status" aria-live="polite">
        <p>Opening the update… Your saved progress is kept.</p>
      </div>}
    </div>
  );
};

export const VNextReleaseCandidateApp = ({
  deployment = RELEASE_CANDIDATE_DEPLOYMENT,
}: Readonly<{ deployment?: VNextApplicationDeployment }>) => {
  const AccountGate = deployment.AccountGate ?? VNextAccountGate;
  const storageNamespace = deployment.storageNamespace ?? VNEXT_RC_STORAGE_NAMESPACE;
  const [identity, setIdentity] = useState<VNextRcIdentity | undefined>(
    () => readVNextRcIdentity(storageNamespace),
  );
  const [accountAccess, setAccountAccess] = useState<AccountAccess>(
    identity?.mode === "account" ? "checking" : "allowed",
  );
  useEffect(() => {
    if (!identity || identity.mode === "local") {
      setAccountAccess("allowed");
      return;
    }
    const access = createAccountAccessController({
      hasSession: () => hasVNextRcAccountSession(identity),
      validateSession: () => validateVNextRcAccountIdentity(identity),
      onAccessChange: setAccountAccess,
    });
    const onSessionChange = (event: Event): void => {
      const detail = (event as CustomEvent<AccountSessionChangedDetail>).detail;
      if (detail?.profileId !== identity.athleteId) return;
      if (!detail.active) {
        access.lock();
      }
      else void access.validate();
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === ACCOUNT_SESSION_STORAGE_KEY || event.key === null) void access.validate();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void access.validate({ preserveMounted: true });
    };
    void access.validate();
    window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onSessionChange);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    const expiryCheck = window.setInterval(() => void access.ensureLocalSession(), 30_000);
    return () => {
      access.dispose();
      window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onSessionChange);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(expiryCheck);
    };
  }, [identity]);
  const selectIdentity = useCallback((next: VNextRcIdentity): void => {
    persistVNextRcIdentity(next, storageNamespace);
    setAccountAccess(next.mode === "account" ? "checking" : "allowed");
    setIdentity(next);
  }, [storageNamespace]);
  if (!identity) return <AccountGate onSelected={selectIdentity} presentation={deployment.accountPresentation} storageNamespace={storageNamespace} shadowDatabaseName={deployment.shadowDatabaseName} />;
  if (accountAccess === "checking") {
    return (
      <main className="vnext-experience vnext-rc-loading" aria-live="polite">
        <div><p className="vnext-kicker">{deployment.productKicker}</p><h1>Checking secure access…</h1><p>Account observations remain locked until this device’s session is verified.</p></div>
      </main>
    );
  }
  if (accountAccess === "locked") {
    return (
      <AccountGate
        current={identity}
        onSelected={selectIdentity}
        onSignedOut={() => { setIdentity(undefined); setAccountAccess("allowed"); }}
        presentation={deployment.accountPresentation}
        storageNamespace={storageNamespace}
        shadowDatabaseName={deployment.shadowDatabaseName}
      />
    );
  }
  return (
    <VNextAthleteApplication
      key={`${identity.mode}:${identity.athleteId}`}
      identity={identity}
      deployment={deployment}
      onIdentitySelected={selectIdentity}
      onSignedOut={() => { setIdentity(undefined); setAccountAccess("allowed"); }}
    />
  );
};
