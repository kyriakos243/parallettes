import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import type {
  DefinitionBundle,
  IsoTimestamp,
  PlanItemId,
  SafeWorkoutSwap,
  SessionPlan,
  WorkoutExerciseSelection,
} from "../index";
import { structureWorkoutPlan } from "../index";
import { hasFinishedWorkoutItem, workoutExecutionGroups, workoutExecutionTimeline, workoutGroupHasStarted } from "../mixedWorkout";

const VNextMotionGuide = lazy(async () => ({
  default: (await import("../media/VNextMotionGuide")).VNextMotionGuide,
}));

export type WorkoutExecutionFacts = Readonly<{
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
  participationSeconds: Readonly<Record<string, number>>;
  completedPlanItemIds: readonly PlanItemId[];
  performedByPlanItem: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>;
}>;

type ActiveWorkoutDraft = Readonly<{
  version: 3;
  athleteId: string;
  planId: string;
  startedAt: IsoTimestamp;
  intervalIndex: number;
  intervalElapsedSeconds: number;
  elapsedSeconds: number;
  participationSeconds: Readonly<Record<string, number>>;
  selections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>;
  completedPlanItemIds: readonly PlanItemId[];
  lockedPlanItemIds: readonly PlanItemId[];
}>;

const activeKey = (athleteId: string): string => `parallette25-vnext-rc-active-workout-v1:${athleteId}`;

export const hasActiveWorkoutDraft = (athleteId: string, planId?: string): boolean => {
  if (typeof localStorage === "undefined") return false;
  try {
    const parsed = JSON.parse(localStorage.getItem(activeKey(athleteId)) ?? "null") as {
      athleteId?: string;
      planId?: string;
      startedAt?: string;
    } | null;
    return parsed?.athleteId === athleteId
      && typeof parsed.startedAt === "string"
      && (!planId || parsed.planId === planId);
  } catch {
    return false;
  }
};

export const clearActiveWorkoutDraft = (athleteId: string): void => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(activeKey(athleteId));
};

const selectionKey = (selection: WorkoutExerciseSelection): string =>
  `${selection.exerciseId}@${selection.exerciseDefinitionVersion}:${selection.prescriptionVariantId}`;

const allowedSelection = (
  planItemId: PlanItemId,
  selection: WorkoutExerciseSelection,
  swapOptions: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>,
): boolean => (swapOptions[planItemId] ?? []).some((option) => selectionKey(option) === selectionKey(selection));

const parseActiveDraft = (
  value: string | null,
  plan: SessionPlan,
  bundle: DefinitionBundle,
  initialSelections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>,
  swapOptions: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>,
): ActiveWorkoutDraft | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<ActiveWorkoutDraft>;
    if (parsed.version !== 3
      || parsed.athleteId !== plan.athleteId || parsed.planId !== plan.id
      || typeof parsed.startedAt !== "string"
      || !Number.isSafeInteger(parsed.elapsedSeconds) || parsed.elapsedSeconds! < 0
      || !parsed.participationSeconds || typeof parsed.participationSeconds !== "object") return undefined;
    const allowed = new Set(plan.items.map((item) => item.id));
    if (Object.entries(parsed.participationSeconds).some(([id, seconds]) => !allowed.has(id as PlanItemId)
      || !Number.isSafeInteger(seconds) || seconds < 0)) return undefined;
    const selections = parsed.selections
      ? Object.fromEntries(Object.entries(parsed.selections).filter(([id, selection]) =>
        allowed.has(id as PlanItemId)
          && selection !== undefined
          && allowedSelection(id as PlanItemId, selection, swapOptions)))
      : initialSelections;
    const timeline = workoutExecutionTimeline(plan, bundle, selections);
    if (!timeline.length) return undefined;
    const parsedV3 = parsed as Partial<ActiveWorkoutDraft>;
    if (!Array.isArray(parsedV3.lockedPlanItemIds) || parsedV3.lockedPlanItemIds.some((id) => !allowed.has(id))) return undefined;
    if (!Number.isSafeInteger(parsedV3.intervalIndex) || parsedV3.intervalIndex! < 0
      || parsedV3.intervalIndex! >= timeline.length
      || !Number.isSafeInteger(parsedV3.intervalElapsedSeconds)
      || parsedV3.intervalElapsedSeconds! < 0
      || parsedV3.intervalElapsedSeconds! > timeline[parsedV3.intervalIndex!]!.durationSeconds) return undefined;
    return {
      version: 3,
      athleteId: plan.athleteId,
      planId: plan.id,
      startedAt: parsed.startedAt,
      intervalIndex: parsedV3.intervalIndex!,
      intervalElapsedSeconds: parsedV3.intervalElapsedSeconds!,
      elapsedSeconds: parsed.elapsedSeconds!,
      participationSeconds: parsed.participationSeconds,
      selections,
      completedPlanItemIds: (parsedV3.completedPlanItemIds ?? []).filter((id) => allowed.has(id)),
      lockedPlanItemIds: parsedV3.lockedPlanItemIds,
    };
  } catch {
    return undefined;
  }
};

export const recoverActiveWorkoutFacts = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
  initialSelections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>> = {},
  swapOptions: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>> = {},
): WorkoutExecutionFacts | undefined => {
  if (typeof localStorage === "undefined") return undefined;
  const draft = parseActiveDraft(
    localStorage.getItem(activeKey(plan.athleteId)),
    plan,
    bundle,
    initialSelections,
    swapOptions,
  );
  if (!draft) return undefined;
  return {
    startedAt: draft.startedAt,
    completedAt: new Date().toISOString() as IsoTimestamp,
    participationSeconds: Object.fromEntries(plan.items.map((item) => [
      item.id,
      draft.participationSeconds[item.id] ?? 0,
    ])),
    completedPlanItemIds: draft.completedPlanItemIds,
    performedByPlanItem: draft.selections,
  };
};

const displayTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${Math.max(0, seconds % 60).toString().padStart(2, "0")}`;
};

/** Every started RC item must resolve to an exact owned renderer; no fallback. */
export const unresolvedRenderablePlanItems = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
): readonly PlanItemId[] => plan.items.flatMap((item) => {
  const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
    && candidate.definitionVersion === item.exerciseDefinitionVersion);
  const media = exercise?.media[0];
  return media?.kind === "motion" && media.reference.length > 0 ? [] : [item.id];
});

export const MixedWorkoutRunner = ({
  plan,
  bundle,
  origin,
  initialSelections = {},
  swapOptions = {},
  onStart,
  onFinish,
  onClose,
}: Readonly<{
  plan: SessionPlan;
  bundle: DefinitionBundle;
  origin: "today" | "custom";
  initialSelections?: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>;
  swapOptions?: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
  onStart: () => boolean | void;
  onFinish: (facts: WorkoutExecutionFacts) => boolean | void;
  onClose: (started: boolean) => void;
}>) => {
  const restored = useMemo(() => typeof localStorage === "undefined"
    ? undefined
    : parseActiveDraft(localStorage.getItem(activeKey(plan.athleteId)), plan, bundle, initialSelections, swapOptions),
  [bundle, initialSelections, plan, swapOptions]);
  const [startedAt, setStartedAt] = useState<IsoTimestamp | undefined>(restored?.startedAt);
  const [intervalIndex, setIntervalIndex] = useState(restored?.intervalIndex ?? 0);
  const [intervalElapsedSeconds, setIntervalElapsedSeconds] = useState(restored?.intervalElapsedSeconds ?? 0);
  const [elapsedSeconds, setElapsedSeconds] = useState(restored?.elapsedSeconds ?? 0);
  const [participation, setParticipation] = useState<Readonly<Record<string, number>>>(restored?.participationSeconds ?? {});
  const [completedPlanItemIds, setCompletedPlanItemIds] = useState<readonly PlanItemId[]>(restored?.completedPlanItemIds ?? []);
  const [selections, setSelections] = useState<Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>>(
    restored?.selections ?? initialSelections,
  );
  const [lockedPlanItemIds, setLockedPlanItemIds] = useState<readonly PlanItemId[]>(restored?.lockedPlanItemIds ?? []);
  const [running, setRunning] = useState(false);
  const [soundOn, setSoundOn] = useState(() => typeof localStorage === "undefined"
    || localStorage.getItem("parallette25-vnext-timer-sound-v1") !== "off");
  const [swapPlanItemId, setSwapPlanItemId] = useState<PlanItemId>();
  const [swapDirection, setSwapDirection] = useState<SafeWorkoutSwap["direction"]>("similar");
  const structured = useMemo(() => structureWorkoutPlan(plan, bundle, selections), [bundle, plan, selections]);
  const groups = useMemo(() => workoutExecutionGroups(plan, bundle, selections), [bundle, plan, selections]);
  const timeline = useMemo(() => workoutExecutionTimeline(plan, bundle, selections), [bundle, plan, selections]);
  const currentInterval = timeline[Math.min(intervalIndex, timeline.length - 1)]!;
  const currentItem = plan.items.find((item) => item.id === currentInterval.planItemId)!;
  const currentStructured = structured.find((item) => item.planItemId === currentItem.id)!;
  const currentExercise = currentStructured.exercise;
  const nextInterval = timeline[intervalIndex + 1];
  const nextStructured = nextInterval
    ? structured.find((item) => item.planItemId === nextInterval.planItemId)
    : undefined;
  const previewExercise = currentInterval.kind === "rest" && nextStructured
    ? nextStructured.exercise
    : currentExercise;
  const media = previewExercise.media[0];
  const motionPreset = media?.kind === "motion" ? media.reference : undefined;
  const remaining = Math.max(0, currentInterval.durationSeconds - intervalElapsedSeconds);
  const totalSeconds = timeline.reduce((sum, interval) => sum + interval.durationSeconds, 0);
  const progressPercent = totalSeconds > 0 ? Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100)) : 0;
  const completionRef = useRef(false);

  const playCue = useCallback((frequency = 760, duration = .07): void => {
    if (!soundOn) return;
    try {
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.1, context.currentTime + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + .01);
      oscillator.addEventListener("ended", () => void context.close(), { once: true });
    } catch {
      // Timer audio is an optional convenience; the visible timer remains authoritative.
    }
  }, [soundOn]);

  const finish = useCallback((completeCurrent = false): void => {
    if (completionRef.current) return;
    setRunning(false);
    const completedAt = new Date().toISOString() as IsoTimestamp;
    const facts = {
      startedAt: startedAt ?? completedAt,
      completedAt,
      participationSeconds: Object.fromEntries(plan.items.map((item) => [item.id, participation[item.id] ?? 0])),
      completedPlanItemIds: completeCurrent && hasFinishedWorkoutItem(currentItem.id, intervalIndex, timeline, participation[currentItem.id] ?? 0)
        ? [...new Set([...completedPlanItemIds, currentItem.id])]
        : completedPlanItemIds,
      performedByPlanItem: selections,
    } satisfies WorkoutExecutionFacts;
    if (onFinish(facts) === false) return;
    completionRef.current = true;
    localStorage.removeItem(activeKey(plan.athleteId));
  }, [completedPlanItemIds, currentItem.id, onFinish, participation, plan.athleteId, plan.items, selections, startedAt, intervalIndex, timeline]);

  useEffect(() => {
    // Opening the player or starting after the expanded preview must show the
    // current guide, rather than retain the previous screen's scroll position.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [startedAt]);

  useEffect(() => {
    if (!running) return;
    const group = groups.find((entry) => entry.items.some((item) => item.planItemId === currentItem.id));
    setLockedPlanItemIds((current) => {
      const additions = group?.items.map((item) => item.planItemId).filter((id) => !current.includes(id)) ?? [];
      return additions.length ? [...current, ...additions] : current;
    });
  }, [currentItem.id, groups, running]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setIntervalElapsedSeconds((value) => Math.min(currentInterval.durationSeconds, value + 1));
      if (currentInterval.kind === "work") setParticipation((value) => ({
          ...value,
          [currentItem.id]: Math.min(currentItem.plannedSeconds, (value[currentItem.id] ?? 0) + 1),
        }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentInterval.durationSeconds, currentInterval.kind, currentItem.id, currentItem.plannedSeconds, running]);

  useEffect(() => {
    if (!running || remaining > 0) return;
    playCue(currentInterval.kind === "rest" ? 880 : 660, .1);
    if (intervalIndex < timeline.length - 1) {
      if (hasFinishedWorkoutItem(currentItem.id, intervalIndex, timeline, participation[currentItem.id] ?? 0)) {
        setCompletedPlanItemIds((current) => current.includes(currentItem.id) ? current : [...current, currentItem.id]);
      }
      setIntervalIndex((value) => value + 1);
      setIntervalElapsedSeconds(0);
    } else {
      finish(true);
    }
  }, [currentInterval.kind, finish, intervalIndex, playCue, remaining, running, timeline, participation, currentItem.id]);

  useEffect(() => {
    if (running && remaining > 0 && remaining <= 3) playCue(560 + ((4 - remaining) * 90), .05);
  }, [playCue, remaining, running]);

  useEffect(() => {
    if (typeof localStorage === "undefined" || completionRef.current || !startedAt) return;
    const draft: ActiveWorkoutDraft = {
      version: 3,
      athleteId: plan.athleteId,
      planId: plan.id,
      startedAt,
      intervalIndex,
      intervalElapsedSeconds,
      elapsedSeconds,
      participationSeconds: participation,
      selections,
      completedPlanItemIds,
      lockedPlanItemIds,
    };
    localStorage.setItem(activeKey(plan.athleteId), JSON.stringify(draft));
  }, [completedPlanItemIds, elapsedSeconds, intervalElapsedSeconds, intervalIndex, participation, plan.athleteId, plan.id, selections, startedAt, lockedPlanItemIds]);

  const move = (offset: -1 | 1): void => {
    setRunning(false);
    setIntervalIndex((value) => Math.max(0, Math.min(timeline.length - 1, value + offset)));
    setIntervalElapsedSeconds(0);
  };

  const chooseSwap = (planItemId: PlanItemId, option?: SafeWorkoutSwap): void => {
    if ((participation[planItemId] ?? 0) > 0 || lockedPlanItemIds.includes(planItemId)
      || (startedAt && workoutGroupHasStarted(planItemId, intervalIndex, groups, timeline))
      || (option && !allowedSelection(planItemId, option, swapOptions))) return;
    setSelections((current) => {
      const next = { ...current };
      if (option) next[planItemId] = option;
      else delete next[planItemId];
      return next;
    });
    setSwapPlanItemId(undefined);
  };

  const blockIndex = plan.items.findIndex((item) => item.id === currentItem.id);
  const swapTarget = swapPlanItemId ? plan.items.find((item) => item.id === swapPlanItemId) : undefined;
  const alternatives = swapTarget ? swapOptions[swapTarget.id] ?? [] : [];
  const visibleAlternatives = alternatives.filter((option) => option.direction === swapDirection);
  const closeLabel = startedAt
    ? "Save & close"
    : origin === "custom"
      ? "Cancel custom session"
      : "Back to Today";

  const toggleWorkout = (): void => {
    if (!startedAt) {
      if (onStart() === false) return;
      setStartedAt(new Date().toISOString() as IsoTimestamp);
      playCue(880, .1);
    }
    setRunning((value) => !value);
  };

  return (
    <main className="vnext-experience vnext-rc-player" aria-labelledby="vnext-player-title">
      <div className="vnext-rc-player-shell">
        <div className="vnext-rc-player-stage">
          <header className="vnext-rc-player-header">
            <div>
              <p className="vnext-kicker">{groups.find((group) => group.items.some((item) => item.planItemId === currentItem.id))?.mode === "rounds" ? "Rotating sets" : "Focused sets"} • Exercise {blockIndex + 1} of {plan.items.length} • {currentInterval.kind === "work" ? `Set ${currentInterval.set} of ${currentInterval.sets}` : "Planned rest"}</p>
              <h1 id="vnext-player-title">{currentInterval.kind === "rest" ? "Rest" : currentExercise.name}</h1>
              {currentInterval.kind === "rest" && <p>{nextStructured
                ? `Up next: ${nextStructured.exercise.name}${nextInterval?.kind === "work" ? `, set ${nextInterval.set} of ${nextInterval.sets}` : ""}`
                : "Workout complete after this recovery interval."}</p>}
            </div>
            <div className="vnext-rc-player-header-actions">
              <button
                type="button"
                className="vnext-rc-sound-button"
                aria-pressed={soundOn}
                aria-label={soundOn ? "Turn timer sound off" : "Turn timer sound on"}
                onClick={() => setSoundOn((value) => {
                  localStorage.setItem("parallette25-vnext-timer-sound-v1", value ? "off" : "on");
                  return !value;
                })}
              >{soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
                <span>{soundOn ? "Sound on" : "Sound off"}</span></button>
              <button type="button" className="vnext-action" data-kind="secondary" aria-label={closeLabel} onClick={() => { setRunning(false); onClose(Boolean(startedAt)); }}><X className="vnext-rc-close-icon" aria-hidden="true" /><span>{closeLabel}</span></button>
            </div>
          </header>

          <div className="vnext-rc-session-progress" aria-label={`${progressPercent}% of workout elapsed`}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>

          <section className="vnext-rc-player-grid">
            <div className={`vnext-rc-motion${currentInterval.kind === "rest" ? " is-resting" : ""}`} role="img" aria-label={`${previewExercise.name} owned technique guide`}>
              {motionPreset ? (
                <Suspense fallback={<div className="motion-loading" aria-label="Loading owned movement guide" />}>
                  <VNextMotionGuide preset={motionPreset} />
                </Suspense>
              ) : <p role="alert">This movement has no technically approved guide. The session cannot continue.</p>}
            </div>
            <div className="vnext-rc-coaching">
              <p className="vnext-kicker vnext-rc-purpose">{currentInterval.kind === "rest" ? "Recover and set up" : currentItem.purpose.replaceAll("-", " ")}</p>
              <h2>{currentStructured.variant.label}</h2>
              <p className="vnext-rc-target">{currentStructured.targetLabel}</p>
              <p className="vnext-rc-structure">{currentStructured.structureLabel}</p>
              {currentInterval.kind === "work" ? (
                <>
                  <p>{currentExercise.instructions.how}</p>
                  <ul>{currentExercise.instructions.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
                  {currentExercise.safetyNotes.length > 0 && <p className="vnext-authority">{currentExercise.safetyNotes.join(" ")}</p>}
                </>
              ) : <p>Relax the grip, breathe, and set the parallettes or assistance exactly before the next work interval.</p>}
            </div>
          </section>

          <div className="vnext-rc-player-controls">
            <section className="vnext-rc-timer" aria-label="Workout timer">
              <span>{currentInterval.kind === "work" ? "Work" : "Rest"}</span>
              <strong aria-live="off">{displayTime(remaining)}</strong>
              <small>{displayTime(elapsedSeconds)} elapsed • next interval starts automatically</small>
            </section>

            <div className="vnext-rc-player-actions">
              <button type="button" className="vnext-action" disabled={!motionPreset} onClick={toggleWorkout}>{running ? "Pause" : elapsedSeconds > 0 ? "Resume" : "Start workout"}</button>
              <button type="button" className="vnext-action" data-kind="secondary" disabled={intervalIndex === 0} onClick={() => move(-1)}>Previous interval</button>
              <button type="button" className="vnext-action" data-kind="secondary" onClick={() => intervalIndex < timeline.length - 1 ? move(1) : finish()}>{intervalIndex < timeline.length - 1 ? "Skip interval" : "Finish workout"}</button>
              <button type="button" className="vnext-action" data-kind="secondary" disabled={elapsedSeconds === 0} onClick={() => finish()}>Finish early</button>
            </div>
          </div>
        </div>
        <details className="vnext-rc-sequence" open={!startedAt ? true : undefined}>
          <summary>Workout sequence and exercise changes</summary>
          <p className="vnext-help">Preparation and compatible support movements rotate between sets. Skill and primary strength use focused sets. Planned rest stays between efforts.</p>
          <ol>
            {structured.map((item, index) => {
              const canChange = (participation[item.planItemId] ?? 0) === 0
                && !lockedPlanItemIds.includes(item.planItemId)
                && (!startedAt || !workoutGroupHasStarted(item.planItemId, intervalIndex, groups, timeline));
              return (
                <li key={item.planItemId} data-current={item.planItemId === currentItem.id}>
                  <div><strong>{index + 1}. {item.exercise.name}</strong><span>{item.structureLabel}</span></div>
                  {canChange && (swapOptions[item.planItemId]?.length ?? 0) > 0 && (
                    <button type="button" onClick={() => { setRunning(false); setSwapPlanItemId(item.planItemId); setSwapDirection("similar"); }}>Change</button>
                  )}
                </li>
              );
            })}
          </ol>
        </details>

        {swapTarget && (
          <section className="vnext-rc-swap" aria-labelledby="vnext-runner-swap-heading">
            <div><p className="vnext-kicker">Safe alternatives</p><h2 id="vnext-runner-swap-heading">Change an upcoming movement</h2></div>
            <div className="vnext-swap-tabs">
              {(["easier", "similar", "harder"] as const).map((direction) => <button key={direction} type="button" aria-pressed={swapDirection === direction} onClick={() => setSwapDirection(direction)}>{direction === "easier" ? "Easier" : direction === "similar" ? "Similar" : "Harder"}</button>)}
            </div>
            {visibleAlternatives.length ? visibleAlternatives.map((option) => (
              <button key={`${option.exerciseId}:${option.prescriptionVariantId}`} type="button" className="vnext-swap-option" onClick={() => chooseSwap(swapTarget.id, option)}>
                <strong>{option.exerciseName}</strong><span>{option.variantLabel} • {option.targetLabel}</span><small>{option.reason}</small>
              </button>
            )) : <p className="vnext-help">No {swapDirection} alternative remains compatible with this block and today’s safety rules.</p>}
            {selections[swapTarget.id] && <button type="button" className="vnext-plan-swap" onClick={() => chooseSwap(swapTarget.id)}>Restore recommended movement</button>}
            <button type="button" className="vnext-action" data-kind="secondary" onClick={() => setSwapPlanItemId(undefined)}>Keep current movement</button>
          </section>
        )}
      </div>
    </main>
  );
};
