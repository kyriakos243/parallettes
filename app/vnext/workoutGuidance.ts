import type { SafeWorkoutSwap } from "./workoutUx";

const unspecifiedRegression = "Regressed — Reduce the range, lever or assistance.";

/** The frozen legacy fallback does not describe a specific easier setup. */
export const hasUnspecifiedRegressionGuidance = (label: string): boolean =>
  label === unspecifiedRegression;

/** Display adapter only: native definitions and saved selections stay intact. */
export const workoutVariantLabel = (label: string): string =>
  hasUnspecifiedRegressionGuidance(label)
    ? "Smaller comfortable range; keep the support shown."
    : label.replace(/^Regressed — /u, "Easier — ");
/** Filter menus only. Recovery and safety validation retain every native ID. */
export const workoutSwapChoices = (options: readonly SafeWorkoutSwap[]): readonly SafeWorkoutSwap[] =>
  options.filter((option) => !hasUnspecifiedRegressionGuidance(option.variantLabel));
