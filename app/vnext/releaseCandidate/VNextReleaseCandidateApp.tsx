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
  generateVNextCustomSession,
  safeWorkoutSwaps,
} from "../index";
import { VNextExperience, type VNextWorkoutReviewFeedback } from "../ui";
import { buildSessionHistory } from "../ui/sessionHistory";
import { confirmedSyncFingerprint, trainingSyncMessage, type TrainingSyncStatus } from "../ui/syncStatus";
import { AssessmentRunner } from "./AssessmentRunner";
import { GuidedTestRunner, type GuidedTestFormResult } from "./GuidedTestRunner";
import { CustomSessionBuilder, type VNextCustomSessionRequest } from "./CustomSessionBuilder";
import { shortWorkoutPreferenceKey } from "./shortWorkoutPreferences";
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
  clearActiveWorkoutDraft,
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
  prepared?: PreparedVNextWorkoutCompletion;
}>;

type GuidedRecovery = Readonly<{
  version: 1;
  athleteId: string;
  draft: AssessmentDraft;
  offer: GuidedTestOffer;
  result: GuidedTestResultInput;
}>;

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

const writeWorkoutRecovery = (recovery: WorkoutRecovery, namespace: string): void => {
  localStorage.setItem(workoutRecoveryKey(recovery.athleteId, namespace), JSON.stringify(recovery));
};

const readGuidedRecovery = (athleteId: string, namespace: string): GuidedRecovery | undefined => {
  const key = guidedRecoveryKey(athleteId, namespace);
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<GuidedRecovery> | null;
    if (!parsed || parsed.version !== 1 || parsed.athleteId !== athleteId
      || parsed.draft?.athleteId !== athleteId || !parsed.offer || !parsed.result
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

const writeGuidedRecovery = (recovery: GuidedRecovery, namespace: string): void => {
  localStorage.setItem(guidedRecoveryKey(recovery.athleteId, namespace), JSON.stringify(recovery));
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
  const [snapshot, setSnapshot] = useState<VNextRuntimeSnapshot>();
  const [assessment, setAssessment] = useState<VNextRuntimeAssessmentState>();
  const [restartSetupOpen, setRestartSetupOpen] = useState(false);
  const [restartForRestrictions, setRestartForRestrictions] = useState(false);
  const [guidedOffer, setGuidedOffer] = useState<GuidedTestOffer | undefined>(initialGuidedRecovery?.offer);
  const [guidedRecovery, setGuidedRecovery] = useState<GuidedRecovery | undefined>(initialGuidedRecovery);
  const [workoutRecovery, setWorkoutRecovery] = useState<WorkoutRecovery | undefined>(initialWorkoutRecovery);
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
  const [message, setMessage] = useState(deployment.openingMessage);
  const [error, setError] = useState<string>();
  const [savedWorkoutId, setSavedWorkoutId] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<TrainingSyncStatus>({ phase: "idle" });
  const commandQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingCommands = useRef(0);
  const bootstrapStarted = useRef(false);
  const completionSubmissionLocked = useRef(false);
  const guidedSubmissionLocked = useRef(false);
  const lastAutomaticSyncFingerprint = useRef<string | undefined>(undefined);

  const executionFacts = workoutRecovery?.stage === "review" || workoutRecovery?.stage === "prepared"
    ? workoutRecovery.facts
    : undefined;
  const pendingPrepared = workoutRecovery?.stage === "prepared"
    ? workoutRecovery.prepared
    : undefined;

  const persistWorkoutRecovery = useCallback((recovery: WorkoutRecovery): void => {
    writeWorkoutRecovery(recovery, storageNamespace);
    setWorkoutRecovery(recovery);
  }, [storageNamespace]);

  const clearWorkoutRecovery = useCallback((): void => {
    localStorage.removeItem(workoutRecoveryKey(athleteId, storageNamespace));
    setWorkoutRecovery(undefined);
    setWorkoutSelections({});
  }, [athleteId, storageNamespace]);

  const persistGuidedRecovery = useCallback((recovery: GuidedRecovery): void => {
    writeGuidedRecovery(recovery, storageNamespace);
    setGuidedRecovery(recovery);
  }, [storageNamespace]);

  const clearGuidedRecovery = useCallback((): void => {
    localStorage.removeItem(guidedRecoveryKey(athleteId, storageNamespace));
    setGuidedRecovery(undefined);
  }, [athleteId, storageNamespace]);

  const refreshInput = useCallback((sessionDemand?: SessionDemand) => ({
    athleteId,
    asOf: now(),
    seed: `${athleteId}:${new Date().toISOString().slice(0, 10)}`,
    ...(sessionDemand ? { sessionDemand } : {}),
    ...(readPreviousEmphasis(athleteId, storageNamespace)
      ? { previousEmphasis: readPreviousEmphasis(athleteId, storageNamespace) }
      : {}),
  }), [athleteId, storageNamespace]);

  const runCommand = useCallback((command: () => Promise<void>): void => {
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

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    runCommand(async () => {
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
    });
  }, [deployment, identity, initialGuidedRecovery, initialWorkoutRecovery, refreshInput, runCommand, runtime, store]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => setMessage(deployment.kind === "production"
      ? "Parallette25 is usable online; offline caching will retry later."
      : "The RC is usable online; offline caching will retry later."));
  }, [deployment.kind]);

  const syncTraining = useCallback(async () => {
    setSyncStatus({ phase: "syncing" });
    try {
      const { syncVNextShadowObservations } = await import("../../profileStore");
      await syncVNextShadowObservations(store, athleteId);
      const refreshed = await runtime.refresh(refreshInput());
      const fingerprint = await confirmedSyncFingerprint({
        fingerprint: refreshed.sources.sourceFingerprint,
        readFingerprint: async () => (await store.readProjectionSources(athleteId)).sourceFingerprint,
        hasPending: async () => (await store.readSyncUpload(athleteId, 1)).length > 0,
      });
      setSnapshot(refreshed);
      setSyncStatus(fingerprint ? { phase: "synced", fingerprint, confirmedAt: new Date().toISOString() } : { phase: "waiting" });
    } catch (reason) {
      const { isTransientVNextSyncError } = await import("../../profileStore");
      if (isTransientVNextSyncError(reason)) {
        setSyncStatus({ phase: "waiting" });
        return;
      }
      setSyncStatus({ phase: "error" });
      throw new Error("Your training is saved on this device, but sync could not finish. Check your account or try Sync now again.");
    }
  }, [athleteId, refreshInput, runtime, store]);

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
      runCommand(syncTraining);
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
  }, [deployment.kind, identity.mode, runCommand, snapshot, syncTraining]);

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
          ? { review: buildAssessmentReview(draft, bundleFor(draft.catalogueVersion), current.state) } : {}),
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
      setGuidedOffer(currentOffer);
      setMessage(committed.clearedRestrictions > 0
        ? "Placement was saved and current restriction feedback cleared. The exact guided confirmation protocol is ready."
        : "Placement was saved first. The exact guided confirmation protocol is ready.");
    });
  };

  const commitExactGuidedRecovery = (pending: GuidedRecovery): void => {
    if (guidedSubmissionLocked.current) return;
    guidedSubmissionLocked.current = true;
    try {
      persistGuidedRecovery(pending);
    } catch (reason) {
      guidedSubmissionLocked.current = false;
      setError(reason instanceof Error ? reason.message : "The guided observation could not be retained for safe retry.");
      return;
    }
    setGuidedOffer(pending.offer);
    runCommand(async () => {
      try {
        const committed = await runtime.commitGuidedTest({
          ...refreshInput(),
          draft: pending.draft,
          result: pending.result,
        });
        setSnapshot(committed.snapshot);
        clearGuidedRecovery();
        setGuidedOffer(undefined);
        const draft = committed.snapshot.assessmentDraft;
        if (draft?.policyVersion === 2 && committed.snapshot.assessmentReview) {
          setAssessment({ draft, step: nextAssessmentStep(draft, bundleFor(draft.catalogueVersion)), review: committed.snapshot.assessmentReview });
        }
        setMessage("Check saved. Your next workout has been updated. Repeated checks today count as one occasion.");
      } finally {
        guidedSubmissionLocked.current = false;
      }
    });
  };

  const commitGuidedTest = (result: GuidedTestFormResult): void => {
    if (guidedRecovery) {
      commitExactGuidedRecovery(guidedRecovery);
      return;
    }
    if (!guidedOffer || !snapshot?.assessmentDraft) return;
    const occurredAt = now();
    commitExactGuidedRecovery({
      version: 1,
      athleteId,
      draft: snapshot.assessmentDraft,
      offer: guidedOffer,
      result: {
        eventId: `guided-event-${crypto.randomUUID()}`,
        observationSessionId: guidedObservationOccasionId(athleteId, occurredAt),
        occurredAt,
        recordedAt: occurredAt,
        protocolId: guidedOffer.protocolId,
        ...result,
      },
    });
  };

  const submitWorkoutReview = (feedback: readonly VNextWorkoutReviewFeedback[]): void => {
    if (completionSubmissionLocked.current || workoutRecovery?.stage !== "review"
      || !workoutRecovery.generated.plan || !executionFacts) return;
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
  });

  const importObservations = (file: File): void => runCommand(async () => {
    const parsed = JSON.parse(await file.text()) as ObservationExportBundle;
    if (parsed.athleteId !== athleteId) throw new Error("This observation export belongs to a different athlete.");
    const result = await store.importBundle(parsed);
    const refreshed = await runtime.refresh(refreshInput());
    setSnapshot(refreshed);
    setMessage(`Backup imported: ${result.inserted} new entries; ${result.duplicates} already saved.`);
  });

  const syncObservations = (): void => runCommand(syncTraining);

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
    persistWorkoutRecovery({ version: 1, athleteId, stage: "preview", origin: "custom", generated, selections: {}, swapOptions });
    setCustomOpen(false);
    setWorkoutOpen(false);
    setMessage(`${request.minutes}-minute workout ready. Review the exercises, then start when you’re ready.`);
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

  const closeWorkout = (started: boolean): void => {
    setWorkoutOpen(false);
    if (started) {
      setMessage("Workout saved on this device. Resume whenever you’re ready.");
      return;
    }
    const origin = workoutRecovery?.origin ?? "today";
    clearActiveWorkoutDraft(athleteId);
    clearWorkoutRecovery();
    setWorkoutSelections({});
    setMessage(origin === "custom"
      ? "Custom Session cancelled. Today’s normal workout is available again."
      : "Returned to Today. No workout or evidence was saved because the timer never started.");
  };

  const discardWorkout = (): void => {
    const recovery = workoutRecovery;
    if (!recovery || (recovery.stage !== "preview" && recovery.stage !== "active")) return;
    if (recovery.stage === "active" && typeof window !== "undefined"
      && !window.confirm("Discard this in-progress workout without saving its performed work?")) return;
    clearActiveWorkoutDraft(athleteId);
    clearWorkoutRecovery();
    setWorkoutSelections({});
    setMessage(recovery.origin === "custom"
      ? "Custom Session discarded. Today’s normal workout is available again."
      : "Saved workout discarded. Today has returned to the current recommendation.");
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
        <div><p className="vnext-kicker">{deployment.productKicker}</p><h1>Building your evidence view…</h1><p>{error ?? message}</p></div>
      </main>
    );
  }

  if (customOpen) {
    return <CustomSessionBuilder preferenceKey={shortWorkoutPreferenceKey(athleteId, storageNamespace)} goals={snapshot.presentations.goals} currentEquipment={snapshot.intent.equipment} defaultDemand={snapshot.intent.defaultSessionDemand} busy={busy} onClose={() => setCustomOpen(false)} onBuild={startCustomSession} />;
  }

  if (workoutOpen && plan) {
    if (isMixedWorkoutPlan(plan)) return <MixedWorkoutRunner plan={plan} bundle={workoutBundle} origin={workoutRecovery?.origin ?? "today"} initialSelections={workoutRecovery?.selections} swapOptions={effectiveWorkoutSwapOptions} onStart={beginWorkout} onClose={closeWorkout} onFinish={finishWorkout} />;
    return <WorkoutRunner plan={plan} bundle={workoutBundle} origin={workoutRecovery?.origin ?? "today"} initialSelections={workoutRecovery?.selections} swapOptions={effectiveWorkoutSwapOptions} onStart={beginWorkout} onClose={closeWorkout} onFinish={finishWorkout} />;
  }

  if (guidedOffer) {
    return <GuidedTestRunner offer={guidedOffer} bundle={bundleFor((guidedRecovery?.draft ?? snapshot.assessmentDraft)?.catalogueVersion ?? vNextDefinitionBundle.catalogueVersion)} busy={busy} error={error} retryingExactObservation={Boolean(guidedRecovery)} onClose={() => setGuidedOffer(undefined)} onCommit={commitGuidedTest} />;
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
      ? buildAssessmentReview(assessment.draft, bundleFor(assessment.draft.catalogueVersion), snapshot.state)
      : undefined);
    return <AssessmentRunner draft={assessment.draft} step={assessment.step} bundle={bundleFor(assessment.draft.catalogueVersion)} review={review} busy={busy} error={error} onAnswer={answerAssessment} onBack={backAssessment} onCommit={commitAssessment} onClose={() => runCommand(async () => {
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

  const completionPresentation = executionFacts && workoutRecovery
    ? buildWorkoutCompletionPresentation({
      bundle: workoutBundle,
      generated: workoutRecovery.generated,
      participationSecondsByPlanItem: executionFacts.participationSeconds,
      performedByPlanItem: executionFacts.performedByPlanItem,
    })
    : undefined;

  return (
    <div className="vnext-rc-root vnext-simple-app">
      <aside className="vnext-rc-banner" aria-label={deployment.kind === "production" ? "Application and account status" : "Release candidate status"}>
        <span><strong>{deployment.bannerTitle}</strong> · {deployment.bannerDetail}</span>
        <div className="vnext-rc-banner-tools">
          <button type="button" className="vnext-rc-account-button" onClick={() => setAccountOpen(true)}>{identity.mode === "account" ? `Account: ${identity.username}` : "On this device"}</button>
          <details>
            <summary>Offline &amp; data tools</summary>
            <div className="vnext-actions">
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
      {(message || error) && <p className={`vnext-rc-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error ?? message}{pendingPrepared && error ? " Your workout is kept on this device so you can retry." : ""}</p>}
      {pendingPrepared && <button type="button" className="vnext-submit vnext-rc-retry" disabled={busy} onClick={retryPreparedCompletion}>Retry saving workout</button>}
      {guidedRecovery && !guidedOffer && <button type="button" className="vnext-submit vnext-rc-retry" disabled={busy} onClick={() => commitExactGuidedRecovery(guidedRecovery)}>Retry saving test result</button>}
      <VNextExperience
        setupNotice={!workflowLocked && snapshot.assessmentDraft?.status === "in-progress" ? (
        <section className="vnext-panel vnext-rc-saved-setup" aria-label="Saved setup">
          <span>Setup saved</span>
          <div className="vnext-actions">
            <button type="button" className="vnext-action" disabled={busy} onClick={() => startAssessment(snapshot.presentations.assessment.actions.find((action) => action.kind === "reassessment"))}>Resume setup</button>
            <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => { setRestartForRestrictions(false); setRestartSetupOpen(true); }}>Start over</button>
          </div>
        </section>
        ) : !workflowLocked && snapshot.assessmentDraft?.policyVersion === 2 && snapshot.assessmentReview && !snapshot.assessmentReview.checksComplete ? (
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
        onCustomSessionRequested={!workflowLocked && !busy ? () => setCustomOpen(true) : undefined}
        onDemandChange={!workflowLocked && !busy ? (demand) => runCommand(async () => { const updated = await runtime.selectDailyDemand({ ...refreshInput(), sessionDemand: demand }); setWorkoutSelections({}); setSnapshot(updated); setMessage(`${demand === "technique" ? "Easier / Technique" : demand === "challenge" ? "Challenge" : "Standard"} selected for today’s workout.`); }) : undefined}
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
        onWorkoutReviewSubmitted={!busy && workoutRecovery?.stage === "review" ? submitWorkoutReview : undefined}
        onRestrictionRequested={!workflowLocked && !busy ? () => startAssessment() : undefined}
      />
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
  const [accountAccess, setAccountAccess] = useState<"checking" | "allowed" | "locked">(
    identity?.mode === "account" ? "checking" : "allowed",
  );
  const accountValidationGeneration = useRef(0);
  useEffect(() => {
    let active = true;
    if (!identity || identity.mode === "local") {
      setAccountAccess("allowed");
      return () => { active = false; };
    }
    const validate = (): void => {
      if (!active) return;
      const generation = ++accountValidationGeneration.current;
      setAccountAccess("checking");
      void validateVNextRcAccountIdentity(identity).then(async (status) => {
        const localSessionPresent = status !== "invalid"
          && await hasVNextRcAccountSession(identity);
        if (active && generation === accountValidationGeneration.current) {
          setAccountAccess(localSessionPresent ? "allowed" : "locked");
        }
      }).catch(() => {
        if (active && generation === accountValidationGeneration.current) {
          setAccountAccess("locked");
        }
      });
    };
    const ensureLocalSession = (): void => {
      void hasVNextRcAccountSession(identity).then((present) => {
        if (active && !present) {
          accountValidationGeneration.current += 1;
          setAccountAccess("locked");
        }
      }).catch(() => {
        if (active) {
          accountValidationGeneration.current += 1;
          setAccountAccess("locked");
        }
      });
    };
    const onSessionChange = (event: Event): void => {
      const detail = (event as CustomEvent<AccountSessionChangedDetail>).detail;
      if (detail?.profileId !== identity.athleteId) return;
      if (!detail.active) {
        accountValidationGeneration.current += 1;
        setAccountAccess("locked");
      }
      else validate();
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === ACCOUNT_SESSION_STORAGE_KEY) validate();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") validate();
    };
    validate();
    window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onSessionChange);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    const expiryCheck = window.setInterval(ensureLocalSession, 30_000);
    return () => {
      active = false;
      accountValidationGeneration.current += 1;
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
