import type { Exercise } from "./program";

export type ProgressionEvidenceEntry = {
  cleanSessions?: number;
  lastFeedback?: "easy" | "right" | "hard";
};

export type ProgressionEvidenceMap = Readonly<Record<string, ProgressionEvidenceEntry | undefined>>;

export type ProgressionPathState = {
  masteredThrough: number;
  currentIndex: number;
  recommendedIndex: number;
  complete: boolean;
  regressedAfterHard: boolean;
  activeHard: boolean;
};

export type ProgressionPathDefinition = Readonly<{
  label?: string;
  steps: readonly string[];
}>;

const mastered = (evidence: ProgressionEvidenceMap, id: string): boolean =>
  (evidence[id]?.cleanSessions ?? 0) >= 2;

/**
 * Resolve one visible skill path from the same evidence used by workout reviews.
 * Completing a harder movement demonstrates the preceding stages, so imported or
 * older workout history cannot leave the Skills screen stuck behind work already done.
 */
export const progressionPathState = (
  steps: readonly string[],
  evidence: ProgressionEvidenceMap,
): ProgressionPathState => {
  let masteredThrough = -1;
  steps.forEach((id, index) => {
    if (mastered(evidence, id)) masteredThrough = Math.max(masteredThrough, index);
  });
  const currentIndex = steps.length === 0 ? -1 : Math.min(steps.length - 1, masteredThrough + 1);
  const currentId = currentIndex >= 0 ? steps[currentIndex] : undefined;
  const masteredId = masteredThrough >= 0 ? steps[masteredThrough] : undefined;
  // A hard mark on the highest demonstrated step is current evidence and must
  // lower the recommendation. Older hard marks below a subsequently mastered
  // step are historical and no longer override that stronger demonstration.
  const directHardIndex = steps.findIndex((id, index) => index >= masteredThrough && evidence[id]?.lastFeedback === "hard");
  const hardIndex = directHardIndex >= 0 ? directHardIndex
    : currentId && evidence[currentId]?.lastFeedback === "hard" ? currentIndex
    : masteredId && evidence[masteredId]?.lastFeedback === "hard" ? masteredThrough
      : -1;
  const regressedAfterHard = hardIndex > 0;
  const activeHard = hardIndex >= 0;
  const complete = steps.length > 0 && masteredThrough >= steps.length - 1 && hardIndex < 0;
  return {
    masteredThrough,
    currentIndex,
    recommendedIndex: hardIndex >= 0 ? Math.max(0, hardIndex - 1) : currentIndex,
    complete,
    regressedAfterHard,
    activeHard,
  };
};

const explicitPathsForExercise = (
  exerciseId: string,
  paths: readonly ProgressionPathDefinition[],
): readonly ProgressionPathDefinition[] => paths.filter((path) => path.steps.includes(exerciseId));

/** Build the complete easier → harder chain around any exercise. */
export const progressionStepsForExercise = (
  exerciseId: string,
  library: Readonly<Record<string, Exercise>>,
): string[] => {
  if (!library[exerciseId]) return [];
  const seen = new Set<string>();
  let root = exerciseId;
  while (library[root]?.easierId && !seen.has(root)) {
    seen.add(root);
    const next = library[root].easierId;
    if (!next || !library[next]) break;
    root = next;
  }
  const steps: string[] = [];
  seen.clear();
  let cursor: string | undefined = root;
  while (cursor && library[cursor] && !seen.has(cursor)) {
    steps.push(cursor);
    seen.add(cursor);
    cursor = library[cursor].harderId;
  }
  return steps;
};

export type EligibleProgressionTarget = Readonly<{
  state: ProgressionPathState;
  idealIndex: number;
  targetIndex: number;
  hasUnmasteredTarget: boolean;
}>;

/**
 * Resolve a path against the exercises that are safe and available in the
 * current context. Prefer the logical next step, fall back to a preceding
 * stage, and only move forward across an unavailable stage when no earlier
 * stage can be used. Readiness/equipment filtering happens before this helper,
 * so it can never turn a locked movement into an eligible recommendation.
 */
export const eligibleProgressionTarget = (
  steps: readonly string[],
  evidence: ProgressionEvidenceMap,
  canUse: (exerciseId: string) => boolean = () => true,
  allowForwardSkip = true,
): EligibleProgressionTarget => {
  const state = progressionPathState(steps, evidence);
  if (!steps.length) return { state, idealIndex: -1, targetIndex: -1, hasUnmasteredTarget: false };
  const idealIndex = state.recommendedIndex;
  let targetIndex = idealIndex;
  if (!canUse(steps[targetIndex])) {
    targetIndex = -1;
    // A non-regression Custom request may bypass an unavailable movement (for
    // example a bar drill in a floor-only session), but never bypass a locked
    // movement because locked candidates were removed before this function.
    if (allowForwardSkip && !state.activeHard) {
      for (let index = idealIndex - 1; index >= 0; index -= 1) {
        if (canUse(steps[index]) && !mastered(evidence, steps[index])) { targetIndex = index; break; }
      }
      if (targetIndex < 0) {
        for (let index = idealIndex + 1; index < steps.length; index += 1) {
          if (canUse(steps[index])) { targetIndex = index; break; }
        }
      }
    }
    if (targetIndex < 0) {
      for (let index = idealIndex - 1; index >= 0; index -= 1) {
        if (canUse(steps[index])) { targetIndex = index; break; }
      }
    }
  }
  return {
    state,
    idealIndex,
    targetIndex,
    hasUnmasteredTarget: targetIndex >= 0 && !mastered(evidence, steps[targetIndex]),
  };
};

export type ProgressionRecommendation = {
  exerciseId: string;
  sourceExerciseId: string;
  reason: "progress" | "regress" | "current";
  path: readonly string[];
};

/**
 * Pick the next usable movement for a stable workout slot. This deliberately
 * follows progression links rather than L1/L2/L3 rank: adjacent skill steps
 * may share the same session level.
 */
export const recommendedProgressionExercise = (
  baseExerciseId: string,
  library: Readonly<Record<string, Exercise>>,
  evidence: ProgressionEvidenceMap,
  canUse: (exercise: Exercise) => boolean = () => true,
  paths: readonly ProgressionPathDefinition[] = [],
  allowForwardSkip = false,
): ProgressionRecommendation | undefined => {
  const base = library[baseExerciseId];
  if (!base) return undefined;
  const explicit = explicitPathsForExercise(baseExerciseId, paths);
  const candidatePaths = explicit.length
    ? explicit.map((path) => ({ steps: [...path.steps], label: path.label }))
    : [{ steps: progressionStepsForExercise(baseExerciseId, library), label: base.progressionFamily }];
  const hardOnBase = evidence[baseExerciseId]?.lastFeedback === "hard";
  const candidates = candidatePaths
    .filter(({ steps }) => steps.length > 0)
    .map(({ steps: path, label }) => {
      const baseIndex = path.indexOf(baseExerciseId);
      const state = progressionPathState(path, evidence);
      let idealIndex = baseIndex;

      // A stable Recommended slot advances only through evidence collected for
      // the movement currently occupying that slot. Evidence from another
      // exercise in the same family must not make two slots converge on one ID.
      while (idealIndex < path.length - 1 && mastered(evidence, path[idealIndex])) idealIndex += 1;

      // A previously suggested next step can send the slot back one stage after
      // a hard review, even though the authored base itself remains mastered.
      if (evidence[path[idealIndex]]?.lastFeedback === "hard" && idealIndex > 0) idealIndex -= 1;

      // A direct hard mark on an authored movement must lower just this family,
      // even when the user has not worked through the earlier path stages.
      if (evidence[baseExerciseId]?.lastFeedback === "hard") idealIndex = Math.max(0, baseIndex - 1);

      let targetIndex = idealIndex;
      if (!canUse(library[path[targetIndex]])) {
        targetIndex = -1;
        if (allowForwardSkip && !state.activeHard && !hardOnBase) {
          for (let index = idealIndex - 1; index >= 0; index -= 1) {
            if (canUse(library[path[index]]) && !mastered(evidence, path[index])) { targetIndex = index; break; }
          }
          if (targetIndex < 0) {
            for (let index = idealIndex + 1; index < path.length; index += 1) {
              if (canUse(library[path[index]])) { targetIndex = index; break; }
            }
          }
        }
        if (targetIndex < 0) {
          for (let index = idealIndex - 1; index >= 0; index -= 1) {
            if (canUse(library[path[index]])) { targetIndex = index; break; }
          }
        }
      }
      if (targetIndex < 0) return undefined;
      const exerciseId = path[targetIndex];
      const reason: ProgressionRecommendation["reason"] = targetIndex < baseIndex ? "regress"
        : targetIndex > baseIndex ? "progress"
          : "current";
      return {
        exerciseId,
        sourceExerciseId: baseExerciseId,
        reason,
        path,
        familyMatch: base.progressionFamily === label,
        distance: Math.abs(targetIndex - baseIndex),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  // Prefer a meaningful change over staying put. On equally useful paths use
  // the exercise's declared family, then the smallest one-stage adjustment.
  candidates.sort((a, b) => {
    const value = (reason: ProgressionRecommendation["reason"]) => reason === "current" ? 0
      : reason === "regress" ? (hardOnBase ? 3 : 1)
        : 2;
    return value(b.reason) - value(a.reason) || Number(b.familyMatch) - Number(a.familyMatch) || a.distance - b.distance;
  });
  const selected = candidates[0];
  if (!selected) return canUse(base) ? { exerciseId: baseExerciseId, sourceExerciseId: baseExerciseId, reason: "current", path: [baseExerciseId] } : undefined;
  return { exerciseId: selected.exerciseId, sourceExerciseId: baseExerciseId, reason: selected.reason, path: selected.path };
};

export type ProgressionSlot = Readonly<{ id: string; defaultExerciseId: string }>;

/**
 * Resolve every Recommended slot as one coordinated set. Exercise IDs are
 * reserved as the slots are processed so two same-family cards cannot silently
 * collapse into the same movement after a review.
 */
export const recommendedProgressionAssignments = (
  slots: readonly ProgressionSlot[],
  library: Readonly<Record<string, Exercise>>,
  evidence: ProgressionEvidenceMap,
  canUse: (slot: ProgressionSlot, exercise: Exercise) => boolean,
  paths: readonly ProgressionPathDefinition[] = [],
  fixed: Readonly<Record<string, string | undefined>> = {},
): Record<string, string> => {
  const assignments: Record<string, string> = {};
  const used = new Set<string>();
  for (const slot of slots) {
    const fixedId = fixed[slot.id];
    if (!fixedId || !library[fixedId]) continue;
    assignments[slot.id] = fixedId;
    used.add(fixedId);
  }
  for (const slot of slots) {
    if (assignments[slot.id]) continue;
    const base = library[slot.defaultExerciseId];
    if (!base) continue;
    const usable = (candidate: Exercise) => !used.has(candidate.id) && canUse(slot, candidate);
    const recommendation = recommendedProgressionExercise(base.id, library, evidence, usable, paths);
    let selected = recommendation ? library[recommendation.exerciseId] : undefined;
    if (!selected || !usable(selected)) {
      selected = !used.has(base.id) && canUse(slot, base) ? base : undefined;
    }
    if (!selected) {
      selected = Object.values(library)
        .filter(usable)
        .sort((a, b) => Number(b.progressionFamily === base.progressionFamily) - Number(a.progressionFamily === base.progressionFamily) ||
          Math.abs((a.progressionStage ?? 0) - (base.progressionStage ?? 0)) - Math.abs((b.progressionStage ?? 0) - (base.progressionStage ?? 0)) ||
          a.name.localeCompare(b.name))[0];
    }
    if (!selected) continue;
    assignments[slot.id] = selected.id;
    used.add(selected.id);
  }
  return assignments;
};

/** Shared Custom Session preference derived from the same path state. */
export const progressionScoreAdjustment = (
  exercise: Exercise,
  library: Readonly<Record<string, Exercise>>,
  evidence: ProgressionEvidenceMap,
  canUse: (exercise: Exercise) => boolean = () => true,
  paths: readonly ProgressionPathDefinition[] = [],
): number => {
  const explicit = explicitPathsForExercise(exercise.id, paths);
  const relevant = explicit.length ? explicit.map((path) => path.steps) : [progressionStepsForExercise(exercise.id, library)];
  const adjustments = relevant.filter((path) => path.length >= 2).map((path) => {
    const index = path.indexOf(exercise.id);
    const { state, targetIndex, hasUnmasteredTarget } = eligibleProgressionTarget(
      path,
      evidence,
      (id) => Boolean(library[id]) && canUse(library[id]),
    );
    if (targetIndex < 0) return 0;
    if (index === targetIndex && (hasUnmasteredTarget || state.activeHard)) return 14;
    if (index <= state.masteredThrough) return -8 - (state.masteredThrough - index);
    if (index > targetIndex) return -Math.min(12, (index - targetIndex) * 4);
    return -Math.min(8, (targetIndex - index) * 2);
  });
  return adjustments.length ? Math.max(...adjustments) : 0;
};
