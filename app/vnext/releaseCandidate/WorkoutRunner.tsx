import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { DefinitionBundle, IsoTimestamp, PlanItemId, SessionPlan } from "../index";

const VNextMotionGuide = lazy(async () => ({
  default: (await import("../media/VNextMotionGuide")).VNextMotionGuide,
}));

export type WorkoutExecutionFacts = Readonly<{
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
  participationSeconds: Readonly<Record<string, number>>;
}>;

type ActiveWorkoutDraft = Readonly<{
  version: 1;
  athleteId: string;
  planId: string;
  startedAt: IsoTimestamp;
  currentIndex: number;
  elapsedSeconds: number;
  participationSeconds: Readonly<Record<string, number>>;
}>;

const activeKey = (athleteId: string): string => `parallette25-vnext-rc-active-workout-v1:${athleteId}`;

const parseActiveDraft = (value: string | null, plan: SessionPlan): ActiveWorkoutDraft | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<ActiveWorkoutDraft>;
    if (parsed.version !== 1 || parsed.athleteId !== plan.athleteId || parsed.planId !== plan.id
      || typeof parsed.startedAt !== "string" || !Number.isSafeInteger(parsed.currentIndex)
      || parsed.currentIndex! < 0 || parsed.currentIndex! >= plan.items.length
      || !Number.isSafeInteger(parsed.elapsedSeconds) || parsed.elapsedSeconds! < 0
      || !parsed.participationSeconds || typeof parsed.participationSeconds !== "object") return undefined;
    const allowed = new Set(plan.items.map((item) => item.id));
    const entries = Object.entries(parsed.participationSeconds);
    if (entries.some(([id, seconds]) => !allowed.has(id as PlanItemId)
      || !Number.isSafeInteger(seconds) || seconds < 0)) return undefined;
    return parsed as ActiveWorkoutDraft;
  } catch {
    return undefined;
  }
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

export const WorkoutRunner = ({
  plan,
  bundle,
  onFinish,
  onClose,
}: Readonly<{
  plan: SessionPlan;
  bundle: DefinitionBundle;
  onFinish: (facts: WorkoutExecutionFacts) => boolean | void;
  onClose: () => void;
}>) => {
  const restored = useMemo(() => typeof localStorage === "undefined"
    ? undefined
    : parseActiveDraft(localStorage.getItem(activeKey(plan.athleteId)), plan), [plan]);
  const [startedAt, setStartedAt] = useState<IsoTimestamp | undefined>(restored?.startedAt);
  const [currentIndex, setCurrentIndex] = useState(restored?.currentIndex ?? 0);
  const [elapsedSeconds, setElapsedSeconds] = useState(restored?.elapsedSeconds ?? 0);
  const [participation, setParticipation] = useState<Readonly<Record<string, number>>>(restored?.participationSeconds ?? {});
  const [running, setRunning] = useState(false);
  const current = plan.items[currentIndex];
  const currentExercise = bundle.exercises.find((exercise) => exercise.id === current.exerciseId
    && exercise.definitionVersion === current.exerciseDefinitionVersion);
  if (!currentExercise) throw new TypeError(`Workout runner cannot resolve ${current.exerciseId}`);
  const media = currentExercise.media[0];
  const motionPreset: string | undefined = media?.kind === "motion"
    ? media.reference
    : undefined;
  const secondsOnItem = participation[current.id] ?? 0;
  const remaining = Math.max(0, current.plannedSeconds - secondsOnItem);
  const completionRef = useRef(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setParticipation((value) => ({ ...value, [current.id]: (value[current.id] ?? 0) + 1 }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current.id, running]);

  useEffect(() => {
    if (!running || remaining > 0) return;
    if (currentIndex < plan.items.length - 1) setCurrentIndex((value) => value + 1);
    else setRunning(false);
  }, [currentIndex, plan.items.length, remaining, running]);

  useEffect(() => {
    if (typeof localStorage === "undefined" || completionRef.current || !startedAt) return;
    const draft: ActiveWorkoutDraft = {
      version: 1,
      athleteId: plan.athleteId,
      planId: plan.id,
      startedAt,
      currentIndex,
      elapsedSeconds,
      participationSeconds: participation,
    };
    localStorage.setItem(activeKey(plan.athleteId), JSON.stringify(draft));
  }, [currentIndex, elapsedSeconds, participation, plan.athleteId, plan.id, startedAt]);

  const finish = (): void => {
    if (completionRef.current) return;
    setRunning(false);
    const completedAt = new Date().toISOString() as IsoTimestamp;
    const facts = {
      startedAt: startedAt ?? completedAt,
      completedAt,
      participationSeconds: Object.fromEntries(plan.items.map((item) => [item.id, participation[item.id] ?? 0])),
    } satisfies WorkoutExecutionFacts;
    // The parent durably binds these facts to the exact generated plan before
    // the timer draft is removed. If that write fails, reload can still recover
    // the active draft rather than silently losing workout truth.
    if (onFinish(facts) === false) return;
    completionRef.current = true;
    localStorage.removeItem(activeKey(plan.athleteId));
  };

  return (
    <main className="vnext-experience vnext-rc-player" aria-labelledby="vnext-player-title">
      <div className="vnext-rc-player-shell">
        <header className="vnext-rc-player-header">
          <div><p className="vnext-kicker">Block {currentIndex + 1} of {plan.items.length}</p><h1 id="vnext-player-title">{currentExercise.name}</h1></div>
          <button type="button" className="vnext-action" data-kind="secondary" onClick={() => { setRunning(false); onClose(); }}>Save &amp; close</button>
        </header>

        <section className="vnext-rc-player-grid">
          <div className="vnext-rc-motion" role="img" aria-label={`${currentExercise.name} owned technique guide`}>
            {motionPreset ? (
              <Suspense fallback={<div className="motion-loading" aria-label="Loading owned movement guide" />}>
                <VNextMotionGuide preset={motionPreset} />
              </Suspense>
            ) : (
              <p role="alert">This movement has no technically approved guide. The session cannot continue.</p>
            )}
          </div>
          <div className="vnext-rc-coaching">
            <p className="vnext-kicker">{current.purpose.replaceAll("-", " ")}</p>
            <p>{currentExercise.instructions.how}</p>
            <ul>{currentExercise.instructions.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
            {currentExercise.safetyNotes.length > 0 && <p className="vnext-authority">{currentExercise.safetyNotes.join(" ")}</p>}
          </div>
        </section>

        <section className="vnext-rc-timer" aria-label="Workout timer">
          <span>Current block</span><strong aria-live="off">{displayTime(remaining)}</strong>
          <small>{displayTime(elapsedSeconds)} trained</small>
        </section>

        <div className="vnext-rc-player-actions">
          <button type="button" className="vnext-action" disabled={!motionPreset} onClick={() => { if (!startedAt) setStartedAt(new Date().toISOString() as IsoTimestamp); setRunning((value) => !value); }}>{running ? "Pause" : elapsedSeconds > 0 ? "Resume" : "Start"}</button>
          <button type="button" className="vnext-action" data-kind="secondary" disabled={currentIndex === 0} onClick={() => { setRunning(false); setCurrentIndex((value) => Math.max(0, value - 1)); }}>Previous</button>
          <button type="button" className="vnext-action" data-kind="secondary" onClick={() => { setRunning(false); if (currentIndex < plan.items.length - 1) setCurrentIndex((value) => value + 1); else finish(); }}>{currentIndex < plan.items.length - 1 ? "Next block" : "Finish workout"}</button>
          <button type="button" className="vnext-action" data-kind="secondary" disabled={elapsedSeconds === 0} onClick={finish}>Finish early</button>
        </div>
      </div>
    </main>
  );
};
