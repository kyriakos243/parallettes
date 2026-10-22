import { createGuidedTimerAudio } from "./guidedTimerAudio";

export const WORKOUT_SOUND_PREFERENCE_KEY = "parallette25-vnext-timer-sound-v1";

/**
 * One page-wide audio context for workout timer cues. iOS only lets a context
 * play once it has been created or resumed inside a user gesture, so every tap
 * that starts or resumes training calls `prepare()` synchronously. Timer cues
 * then reuse that context instead of creating a new, silent one per cue.
 */
export const workoutCueAudio = createGuidedTimerAudio();

export const workoutSoundEnabled = (): boolean => {
  try { return typeof localStorage === "undefined" || localStorage.getItem(WORKOUT_SOUND_PREFERENCE_KEY) !== "off"; }
  catch { return false; }
};

/** Call only from a user gesture. Optional convenience: failure never blocks training. */
export const prepareWorkoutCues = (): void => {
  if (workoutSoundEnabled()) workoutCueAudio.prepare();
};
