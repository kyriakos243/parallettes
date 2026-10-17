export type WorkoutPauseReason = "hidden" | "interrupted";

/** Whole seconds of observed foreground time, never inferred background work. */
export const createWorkoutClock = (options: Readonly<{
  now: () => number;
  wallNow: () => number;
  isVisible: () => boolean;
  onSeconds: (seconds: number) => void;
  onPause: (reason: WorkoutPauseReason) => void;
}>) => {
  let active = true;
  let previous = options.now();
  let previousWall = options.wallNow();
  let fraction = 0;
  const stop = (): void => { active = false; };
  const interrupt = (reason: WorkoutPauseReason): void => {
    if (!active) return;
    stop();
    options.onPause(reason);
  };
  const sample = (): void => {
    if (!active) return;
    if (!options.isVisible()) { interrupt("hidden"); return; }
    const now = options.now();
    const wall = options.wallNow();
    const delta = now - previous;
    const wallDelta = wall - previousWall;
    previous = now;
    previousWall = wall;
    // Some platforms stop performance.now during sleep. A wall-clock cross-check
    // also catches that suspension, while ordinary timing ignores clock edits.
    if (!Number.isFinite(delta) || !Number.isFinite(wallDelta) || delta < 0
      || delta >= 5000 || Math.abs(wallDelta - delta) >= 2000) {
      interrupt("interrupted");
      return;
    }
    fraction += delta;
    const seconds = Math.floor(fraction / 1000);
    fraction -= seconds * 1000;
    if (seconds) options.onSeconds(seconds);
  };
  return { sample, stop, interrupt, isActive: () => active && options.isVisible() };
};
