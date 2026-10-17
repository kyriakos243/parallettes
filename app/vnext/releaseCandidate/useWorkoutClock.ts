import { useEffect, useRef, useState } from "react";
import { createWorkoutClock, type WorkoutPauseReason } from "./workoutClock";
export type { WorkoutPauseReason } from "./workoutClock";

export const useWorkoutClock = (options: Readonly<{
  running: boolean;
  intervalKey: number;
  onSeconds: (seconds: number) => void;
  onAutoPause: (reason: WorkoutPauseReason) => void;
}>) => {
  const latest = useRef(options);
  latest.current = options;
  const control = useRef<ReturnType<typeof createWorkoutClock> | undefined>(undefined);
  const lock = useRef<WakeLockSentinel | undefined>(undefined);
  const generation = useRef(0);
  const [screenAwake, setScreenAwake] = useState(false);

  const releaseLock = (): void => {
    generation.current++;
    const current = lock.current;
    lock.current = undefined;
    if (current) void current.release().catch(() => undefined);
  };
  const stop = (): void => {
    control.current?.stop();
    releaseLock();
  };

  useEffect(() => {
    if (!options.running) return;
    const clock = createWorkoutClock({
      now: () => performance.now(),
      wallNow: () => Date.now(),
      isVisible: () => document.visibilityState === "visible",
      onSeconds: (seconds) => {
        // A previous interval's queued callback must never credit a new cursor
        // while React is between committing that cursor and cleaning up effects.
        if (latest.current.running && latest.current.intervalKey === options.intervalKey) {
          latest.current.onSeconds(seconds);
        }
      },
      onPause: (reason) => {
        releaseLock();
        latest.current.onAutoPause(reason);
      },
    });
    control.current = clock;
    const hidden = (): void => {
      if (document.visibilityState !== "visible") clock.interrupt("hidden");
    };
    const pagehide = (): void => clock.interrupt("hidden");
    const pageshow = (event: PageTransitionEvent): void => {
      if (event.persisted) clock.interrupt("interrupted");
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    const timer = window.setInterval(clock.sample, 250);
    hidden();
    return () => {
      clock.stop();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
    };
  }, [options.running, options.intervalKey]);

  useEffect(() => {
    setScreenAwake(false);
    if (!options.running || document.visibilityState !== "visible" || !navigator.wakeLock) return;
    let disposed = false;
    const requestedGeneration = ++generation.current;
    void navigator.wakeLock.request("screen").then((sentinel) => {
      if (disposed || requestedGeneration !== generation.current || !control.current?.isActive()) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      lock.current = sentinel;
      setScreenAwake(!sentinel.released);
      sentinel.addEventListener("release", () => {
        if (!disposed && lock.current === sentinel) {
          lock.current = undefined;
          setScreenAwake(false);
        }
      }, { once: true });
    }).catch(() => {
      // Unsupported/denied/low-power cases keep the same safe pause policy.
    });
    return () => { disposed = true; releaseLock(); };
  }, [options.running]);

  return { stop, isActive: () => control.current?.isActive() ?? false, screenAwake };
};
