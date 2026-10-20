import type { WorkoutReviewDraft, ReviewDraft } from "../ui/VNextExperience";

/** Ignore malformed/cross-plan UI hints; never manufacture a performance answer. */
export const readWorkoutReviewDraft = (
  value: unknown,
  planId: string,
  planItemIds: readonly string[],
): WorkoutReviewDraft | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const draft = value as Partial<WorkoutReviewDraft>;
  if (draft.version !== 1 || draft.planId !== planId || !Number.isSafeInteger(draft.reviewIndex)
    || draft.reviewIndex! < 0 || !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers)) return undefined;
  const allowed = new Set(planItemIds);
  const answers: Record<string, ReviewDraft> = {};
  for (const [id, raw] of Object.entries(draft.answers)) {
    if (!allowed.has(id) || !raw || typeof raw !== "object"
      || (raw.status !== undefined && !["completed", "modified", "skipped"].includes(raw.status))
      || (raw.difficulty !== undefined && !["easy", "right", "hard"].includes(raw.difficulty))
      || typeof raw.symptomOrInstability !== "boolean"
      || typeof raw.bodyRegion !== "string" || typeof raw.modificationReason !== "string") continue;
    answers[id] = { ...(raw.status ? { status: raw.status } : {}),
      ...(raw.difficulty ? { difficulty: raw.difficulty } : {}),
      symptomOrInstability: raw.symptomOrInstability, bodyRegion: raw.bodyRegion,
      modificationReason: raw.modificationReason };
  }
  return { version: 1, planId, reviewIndex: Math.min(draft.reviewIndex!, Math.max(0, planItemIds.length - 1)), answers };
};
