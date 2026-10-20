import { useEffect, useRef, useState } from "react";
import type { PlanItemId, WorkoutExerciseSelection } from "../index";

export type WorkoutRunRequest = Readonly<{
  selections: Readonly<Partial<Record<PlanItemId, WorkoutExerciseSelection>>>;
  planItemIds: readonly PlanItemId[];
}>;

/** Every Start/Resume waits for current safety; leaving the player cancels it. */
export const useWorkoutRunAuthorization = (authorize?: (request: WorkoutRunRequest) => Promise<boolean>) => {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const inFlight = useRef(false);
  const cancel = (): void => {
    generation.current += 1;
    inFlight.current = false;
    setChecking(false);
  };
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") return;
      cancel();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", cancel);
    return () => {
      generation.current += 1;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", cancel);
    };
  }, []);
  const run = (request: WorkoutRunRequest, start: () => boolean | void): void => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    setError(undefined);
    if (!authorize) { start(); return; }
    const token = ++generation.current;
    inFlight.current = true;
    setChecking(true);
    void (async () => {
      try {
        const allowed = await authorize(request);
        if (generation.current !== token || document.visibilityState !== "visible") return;
        if (!allowed || start() === false) setError("The workout could not start safely. Your place is kept; return to Today to review it.");
      } catch (reason) {
        if (generation.current === token) setError(reason instanceof Error ? reason.message : "Current safety could not be checked. Try again before training.");
      } finally {
        if (generation.current === token) { inFlight.current = false; setChecking(false); }
      }
    })();
  };
  return { checking, error, run, cancel };
};
