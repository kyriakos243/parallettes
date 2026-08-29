import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  VNEXT_CATALOGUE_VERSION,
  VNEXT_PHASE2_CATALOGUE_VERSION,
  buildAssessmentReview,
  buildTodayWorkoutPresentation,
  buildWorkoutCompletionPresentation,
  createVNextShadowStore,
  isAssessmentAtReview,
  isStableId,
  nextAssessmentStep,
  sha256,
  vNextDefinitionBundle,
  vNextDefinitionBundles,
  vNextProjectionPolicy,
  type AssessmentAnswerValue,
  type AssessmentDraft,
  type AssessmentEntryAction,
  type GeneratedSession,
  type GuidedTestOffer,
  type GuidedTestResultInput,
  type IsoTimestamp,
  type ObservationExportBundle,
  type PreviousEmphasis,
  type SessionDemand,
  type VNextShadowStore,
  type WorkoutCompletionAnswer,
} from "../index";
import { VNextExperience, type VNextWorkoutReviewFeedback } from "../ui";
import { AssessmentRunner } from "./AssessmentRunner";
import { GuidedTestRunner, type GuidedTestFormResult } from "./GuidedTestRunner";
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
} from "./runtime";
import {
  WorkoutRunner,
  type WorkoutExecutionFacts,
  unresolvedRenderablePlanItems,
} from "./WorkoutRunner";

const storageKeyPrefix = (
  namespace: string,
  kind: "emphasis" | "workout-recovery" | "guided-recovery",
) => `parallette25-${namespace}-${kind}-v1:`;

export type VNextApplicationDeployment = Readonly<{
  kind: "release-candidate" | "production";
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
  stage: "active" | "review" | "prepared";
  generated: GeneratedSession;
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
    generatorPolicyId: generated.generatorPolicyId,
    generatorPolicyVersion: generated.generatorPolicyVersion,
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
    const validStage = parsed?.stage === "active" || parsed?.stage === "review" || parsed?.stage === "prepared";
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
    return parsed as WorkoutRecovery;
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
  const statuses = plan.items.map((item) => {
    const seconds = facts.participationSeconds[item.id] ?? 0;
    const review = reviewed.get(item.id);
    if (seconds === 0) return "skipped" as const;
    if (review?.status === "modified" || review?.status === "skipped"
      || review?.symptomOrInstability || seconds < item.plannedSeconds) return "modified" as const;
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
  const athleteId = identity.athleteId;
  const storageNamespace = deployment.storageNamespace ?? VNEXT_RC_STORAGE_NAMESPACE;
  const store = useMemo(
    () => createVNextShadowStore(deployment.shadowDatabaseName
      ? { databaseName: deployment.shadowDatabaseName }
      : {}),
    [deployment.shadowDatabaseName],
  );
  const runtime = useMemo(() => createVNextReleaseCandidateRuntime({ store }), [store]);
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
  const [guidedOffer, setGuidedOffer] = useState<GuidedTestOffer | undefined>(initialGuidedRecovery?.offer);
  const [guidedRecovery, setGuidedRecovery] = useState<GuidedRecovery | undefined>(initialGuidedRecovery);
  const [workoutRecovery, setWorkoutRecovery] = useState<WorkoutRecovery | undefined>(initialWorkoutRecovery);
  const [workoutOpen, setWorkoutOpen] = useState(initialWorkoutRecovery?.stage === "active");
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [message, setMessage] = useState(deployment.openingMessage);
  const [error, setError] = useState<string>();
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
      setError(reason instanceof Error ? reason.message : "The vNext operation could not be completed.");
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
        setMessage("Your exact in-progress workout is ready to resume on this device.");
      } else if (initialWorkoutRecovery?.stage === "review") {
        setMessage("Your completed timer facts were recovered. Add the short review to save one Session Record.");
      } else if (initialWorkoutRecovery?.stage === "prepared") {
        setMessage("The exact prepared Session Record was recovered and is ready for idempotent retry.");
      } else if (initialGuidedRecovery) {
        setMessage("The exact guided observation was recovered and is ready for idempotent retry.");
      } else if (result.snapshot.assessmentDraft?.status === "in-progress") {
        const draft = result.snapshot.assessmentDraft;
        setAssessment({
          draft,
          step: nextAssessmentStep(draft, vNextDefinitionBundle),
          ...(result.snapshot.assessmentReview ? { review: result.snapshot.assessmentReview } : {}),
        });
        setMessage("Your saved placement check is ready to resume.");
      } else if (result.createdDefaultIntent) {
        const started = await runtime.startAssessment({ ...refreshInput(), mode: "new-placement" });
        setSnapshot(started.snapshot);
        setAssessment(started.assessment);
        setMessage("A short adaptive placement will create your provisional starting points.");
      } else {
        setMessage(preparation?.message ?? "vNext observations rebuilt successfully on this device.");
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

  useEffect(() => {
    if (deployment.kind !== "production" || identity.mode !== "account" || !snapshot) return;
    const sync = (force = false): void => {
      const fingerprint = snapshot.sources.sourceFingerprint;
      if (!force && lastAutomaticSyncFingerprint.current === fingerprint) return;
      lastAutomaticSyncFingerprint.current = fingerprint;
      runCommand(async () => {
        try {
          const { syncVNextShadowObservations } = await import("../../profileStore");
          await syncVNextShadowObservations(store, athleteId);
          const refreshed = await runtime.refresh(refreshInput());
          setSnapshot(refreshed);
        } catch (error) {
          const { isTransientVNextSyncError } = await import("../../profileStore");
          if (!isTransientVNextSyncError(error)) throw error;
          // Local append-only truth remains authoritative while offline. The
          // online event or the next source change retries the same outbox.
          setMessage("Saved safely on this device. Secure sync will retry when the connection returns.");
        }
      });
    };
    sync();
    const refreshRemote = (): void => {
      lastAutomaticSyncFingerprint.current = undefined;
      sync(true);
    };
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
  }, [athleteId, deployment.kind, identity.mode, refreshInput, runCommand, runtime, snapshot, store]);

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

  const displayedGenerated = workoutRecovery?.generated ?? snapshot?.generated;
  const plan = displayedGenerated?.plan;
  const mediaEvaluation = useMemo(() => plan ? evaluateVNextPlanMediaRelease(plan) : undefined, [plan]);
  const unrenderableItems = useMemo(() => plan
    ? unresolvedRenderablePlanItems(plan, vNextDefinitionBundle)
    : [], [plan]);
  const mediaBlocked = Boolean(plan && (
    !mediaEvaluation?.releaseAllowed || unrenderableItems.length > 0
  ));
  const workoutStartBlocker = workoutRecovery?.stage === "review" || workoutRecovery?.stage === "prepared"
    ? "Save the completed workout review before starting another session."
    : mediaBlocked && workoutRecovery?.stage !== "active"
    ? "This workout cannot start because at least one movement guide has not completed owned technical and owner review. No substitute will be used."
    : undefined;

  const startAssessment = (action?: AssessmentEntryAction): void => runCommand(async () => {
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
      ...(action ? { mode: action.mode } : { mode: "targeted-reconfirmation" as const }),
    });
    setSnapshot(started.snapshot);
    setAssessment(started.assessment);
    setMessage(action?.mode === "new-placement"
      ? "Placement restarted with current context."
      : "Only the relevant current starting points will be checked.");
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
      setMessage("Previous answer reopened. Later branch answers were safely removed from the draft only.");
    });
  };

  const commitAssessmentDraft = async (draft: AssessmentDraft) =>
    runtime.commitAssessment({ ...refreshInput(), draft });

  const commitAssessment = (): void => {
    if (!assessment) return;
    runCommand(async () => {
      const committed = await commitAssessmentDraft(assessment.draft);
      setSnapshot(committed.snapshot);
      setAssessment(undefined);
      setMessage(committed.clearedRestrictions > 0
        ? "Placement saved and current restriction feedback cleared. Achievement history remains intact; reconfirmation rules still apply."
        : "Placement saved as provisional evidence. Achievements still require the approved confirmation policy.");
    });
  };

  const openGuidedTestFromReview = (offer: GuidedTestOffer): void => {
    if (!assessment) return;
    runCommand(async () => {
      const committed = await commitAssessmentDraft(assessment.draft);
      setSnapshot(committed.snapshot);
      setAssessment(undefined);
      setGuidedOffer(offer);
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
        setMessage("One guided observation was saved. The projection—not the form—decides what it confirms.");
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
        observationSessionId: `guided-observation-${crypto.randomUUID()}`,
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
        const reviewAnswers: WorkoutCompletionAnswer[] = feedback.map((item) => {
          const planned = currentPlan.items.find((candidate) => candidate.id === item.planItemId);
          if (!planned || planned.purpose === "preparation" || planned.purpose === "recovery") {
            throw new TypeError(`Workout review references an unexpected plan item ${item.planItemId}`);
          }
          const measured = executionFacts.participationSeconds[item.planItemId] ?? 0;
          if (item.symptomOrInstability && !item.bodyRegion?.trim()) {
            throw new TypeError("A symptom or instability report requires the affected body area");
          }
          if (measured === 0) return {
            planItemId: item.planItemId,
            status: "skipped",
            participationSeconds: 0,
          };
          const modified = item.status !== "completed"
            || measured < planned.plannedSeconds
            || item.symptomOrInstability === true;
          const modificationReasons = [
            item.modificationReason?.trim(),
            item.status === "skipped" ? `Timer retained ${measured} seconds completed before the athlete stopped.` : undefined,
            measured < planned.plannedSeconds ? "Timer recorded a shortened dose." : undefined,
            item.symptomOrInstability ? `Reported symptom or instability area: ${item.bodyRegion!.trim()}.` : undefined,
          ].filter((reason): reason is string => Boolean(reason));
          return {
            planItemId: item.planItemId,
            status: modified ? "modified" : "completed",
            participationSeconds: measured,
            participationBasis: "measured",
            ...(item.difficulty ? { difficulty: item.difficulty } : {}),
            ...(item.symptomOrInstability ? { symptomOrInstability: true } : {}),
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
            const modified = seconds < item.plannedSeconds;
            return {
              planItemId: item.id,
              status: modified ? "modified" as const : "completed" as const,
              participationSeconds: seconds,
              participationBasis: "measured" as const,
              ...(modified ? { modificationReason: "Timer recorded a shortened preparation or recovery dose." } : {}),
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
        setMessage(prepared.restrictionFollowUp
          ? "Workout saved as one immutable Session Record. The reported symptom now restricts the affected training demand while your achievement history remains intact."
          : "Workout saved as one immutable Session Record. Today’s recommendation has been rebuilt from the updated evidence.");
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
        setMessage(committed.append.record.status === "duplicate"
          ? "The existing Session Record was verified; no duplicate was created."
          : "The retained Session Record was saved successfully.");
      } finally {
        completionSubmissionLocked.current = false;
      }
    });
  };

  const exportObservations = (): void => runCommand(async () => {
    const definitionFingerprint = await sha256(vNextDefinitionBundles);
    const bundle = await store.exportBundle(athleteId, {
      exportedAt: now(),
      catalogueVersions: [VNEXT_PHASE2_CATALOGUE_VERSION, VNEXT_CATALOGUE_VERSION],
      projectionVersions: [vNextProjectionPolicy.version],
      definitionFingerprints: [definitionFingerprint],
      policyVersions: [{ id: vNextProjectionPolicy.id, version: vNextProjectionPolicy.version }],
    });
    downloadJson(`parallette25-vnext-${athleteId}.json`, bundle);
    setMessage("A complete vNext observation export was created without changing its evidence.");
  });

  const importObservations = (file: File): void => runCommand(async () => {
    const parsed = JSON.parse(await file.text()) as ObservationExportBundle;
    if (parsed.athleteId !== athleteId) throw new Error("This observation export belongs to a different athlete.");
    const result = await store.importBundle(parsed);
    const refreshed = await runtime.refresh(refreshInput());
    setSnapshot(refreshed);
    setMessage(`Observation import complete: ${result.inserted} inserted, ${result.duplicates} already present.`);
  });

  const syncObservations = (): void => runCommand(async () => {
    const { syncVNextShadowObservations } = await import("../../profileStore");
    const result = await syncVNextShadowObservations(store, athleteId);
    const refreshed = await runtime.refresh(refreshInput());
    setSnapshot(refreshed);
    setMessage(`Sync complete through cursor ${result.cursor}; immutable observations were unioned without double-counting.`);
  });

  const resetProgress = async (): Promise<void> => {
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

  const startOrResumeWorkout = (): void => {
    if (busy || workoutRecovery?.stage === "review" || workoutRecovery?.stage === "prepared") return;
    if (workoutRecovery?.stage === "active") {
      setWorkoutOpen(true);
      setMessage("Resuming the exact locally retained Session Plan.");
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
      const media = evaluateVNextPlanMediaRelease(generated.plan);
      const unresolved = unresolvedRenderablePlanItems(generated.plan, vNextDefinitionBundle);
      if (!media.releaseAllowed || unresolved.length > 0) {
        throw new Error("This workout is blocked because an exact owned movement guide is unavailable.");
      }
      persistWorkoutRecovery({ version: 1, athleteId, stage: "active", generated });
      setWorkoutOpen(true);
    });
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
    setMessage("Workout timer facts are durably retained. Add the minimal review to create one Session Record.");
    return true;
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

  if (workoutOpen && plan) {
    return <WorkoutRunner plan={plan} bundle={vNextDefinitionBundle} onClose={() => { setWorkoutOpen(false); setMessage("The exact in-progress workout remains on this device and can be resumed."); }} onFinish={finishWorkout} />;
  }

  if (guidedOffer) {
    return <GuidedTestRunner offer={guidedOffer} bundle={vNextDefinitionBundle} busy={busy} error={error} retryingExactObservation={Boolean(guidedRecovery)} onClose={() => setGuidedOffer(undefined)} onCommit={commitGuidedTest} />;
  }

  if (assessment) {
    const review = assessment.review ?? (isAssessmentAtReview(assessment.draft, vNextDefinitionBundle)
      ? buildAssessmentReview(assessment.draft, vNextDefinitionBundle, snapshot.state)
      : undefined);
    return <AssessmentRunner draft={assessment.draft} step={assessment.step} bundle={vNextDefinitionBundle} review={review} busy={busy} onAnswer={answerAssessment} onBack={backAssessment} onCommit={commitAssessment} onClose={() => setAssessment(undefined)} onGuidedTestRequested={openGuidedTestFromReview} />;
  }

  const workflowLocked = Boolean(workoutRecovery || guidedRecovery);
  const todayPresentation = workoutRecovery
    ? buildTodayWorkoutPresentation({ bundle: vNextDefinitionBundle, generated: workoutRecovery.generated })
    : snapshot.presentations.today;
  const completionPresentation = executionFacts && workoutRecovery
    ? buildWorkoutCompletionPresentation({ bundle: vNextDefinitionBundle, generated: workoutRecovery.generated })
    : undefined;

  return (
    <div className="vnext-rc-root">
      <aside className="vnext-rc-banner" aria-label={deployment.kind === "production" ? "Application and account status" : "Release candidate status"}>
        <span><strong>{deployment.bannerTitle}</strong> · {deployment.bannerDetail}</span>
        <div className="vnext-rc-banner-tools">
          <button type="button" className="vnext-rc-account-button" onClick={() => setAccountOpen(true)}>{identity.mode === "account" ? `Synced as ${identity.username}` : "On this device"}</button>
          <details>
            <summary>Offline &amp; data tools</summary>
            <div className="vnext-actions">
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || workflowLocked} onClick={exportObservations}>Export observations</button>
              <label className="vnext-action" data-kind="secondary" aria-disabled={busy || workflowLocked}>Import observations<input className="vnext-rc-file" type="file" accept="application/json,.json" disabled={busy || workflowLocked} onChange={(event) => { const file = event.target.files?.[0]; if (file) importObservations(file); event.target.value = ""; }} /></label>
              {identity.mode === "account"
                ? <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || workflowLocked} onClick={syncObservations}>Sync observations</button>
                : <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || workflowLocked} onClick={() => setAccountOpen(true)}>Set up sync</button>}
            </div>
          </details>
        </div>
      </aside>
      {(message || error) && <p className={`vnext-rc-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error ?? message}{pendingPrepared && error ? " The exact prepared record is retained for retry." : ""}</p>}
      {pendingPrepared && <button type="button" className="vnext-submit vnext-rc-retry" disabled={busy} onClick={retryPreparedCompletion}>Retry the same Session Record</button>}
      {guidedRecovery && !guidedOffer && <button type="button" className="vnext-submit vnext-rc-retry" disabled={busy} onClick={() => commitExactGuidedRecovery(guidedRecovery)}>Retry the same guided observation</button>}
      <VNextExperience
        key={snapshot.intent.updatedAt}
        progress={snapshot.presentations.progress}
        skillDetails={snapshot.presentations.skillDetails}
        today={todayPresentation}
        goals={snapshot.presentations.goals}
        assessment={snapshot.presentations.assessment}
        restrictions={snapshot.presentations.restrictions}
        completion={completionPresentation}
        busy={busy}
        workoutStartBlocker={workoutStartBlocker}
        resumingWorkout={workoutRecovery?.stage === "active"}
        onDemandChange={!workflowLocked && !busy ? (demand) => runCommand(async () => { const updated = await runtime.selectDailyDemand({ ...refreshInput(), sessionDemand: demand }); setSnapshot(updated); setMessage(`${demand === "technique" ? "Easier / Technique" : demand === "challenge" ? "Challenge" : "Standard"} changes today’s dose only; the safe frontier was preserved.`); }) : undefined}
        onGoalSelectionChange={!workflowLocked && !busy ? (selection) => runCommand(async () => { const updated = await runtime.updateGoals({ ...refreshInput(), selection }); setSnapshot(updated); setMessage("Goals saved as Athlete Intent. No skill was manually unlocked."); }) : undefined}
        onAssessmentRequested={!workflowLocked && !busy ? startAssessment : undefined}
        onStartWorkout={!busy && plan && (workoutRecovery?.stage === "active" || (!workoutRecovery && snapshot.generated.ok && !mediaBlocked)) ? startOrResumeWorkout : undefined}
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
