/** Short foreground-only cues. No promise or background timer may queue a cue. */
export const createGuidedTimerAudio = () => {
  let context: AudioContext | undefined;
  const active = new Set<OscillatorNode>();
  const cancel = (): void => {
    for (const oscillator of active) {
      try { oscillator.stop(); } catch { /* Already ended. */ }
      oscillator.disconnect();
    }
    active.clear();
  };
  const prepare = (): boolean => {
    if (typeof window === "undefined") return false;
    try {
      const Context = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return false;
      if (!context || context.state === "closed") context = new Context();
      // Called from a user gesture. Completion never schedules audio, so a late
      // resume cannot replay a start/end cue after interruption or navigation.
      if (context.state === "suspended" || context.state === "interrupted") void context.resume().catch(() => undefined);
      return true;
    } catch { return false; }
  };
  const play = (kind: "start" | "finish"): boolean => {
    cancel();
    if (!context || context.state !== "running" || document.visibilityState !== "visible") return false;
    try {
      for (const offset of kind === "start" ? [0] : [0, 0.2]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + offset;
        oscillator.frequency.value = kind === "start" ? 660 : 880;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        active.add(oscillator);
        oscillator.start(start);
        oscillator.stop(start + 0.15);
      }
      return true;
    } catch { cancel(); return false; }
  };
  /** One short workout cue on the already-unlocked context; never creates or resumes audio. */
  const tone = (frequency: number, seconds: number): boolean => {
    if (!context || context.state !== "running" || document.visibilityState !== "visible") return false;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      active.add(oscillator);
      oscillator.start(start);
      oscillator.stop(start + seconds + 0.01);
      return true;
    } catch { return false; }
  };
  const dispose = (): void => {
    cancel();
    const closing = context;
    context = undefined;
    if (closing) void closing.close().catch(() => undefined);
  };
  return { prepare, play, tone, cancel, dispose };
};
