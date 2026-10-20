"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { GraphId, PlanItemId, SessionDemand } from "../contracts";
import { VNextMotionGuide } from "../media/VNextMotionGuide";
import { SkillRoadmap } from "./SkillRoadmap";
import { useSectionNavigation } from "./sectionNavigation";
import { HistoryView, WorkoutSavedSummary } from "./HistoryPanels";
import type { VNextRecentSession } from "./sessionHistory";
export type { VNextRecentSession } from "./sessionHistory";
import type { SafeWorkoutSwap } from "../workoutUx";
import type {
  AssessmentEntryAction,
  AssessmentEntryPresentation,
  GoalControlSelection,
  GoalControlsPresentation,
  ProgressAndGoalsPresentation,
  RestrictionPresentation,
  SkillDetailPresentation,
  TodayWorkoutPresentation,
  WorkoutCompletionPresentation,
} from "../presentation";

type ViewId = "today" | "progress" | "history";
type ReviewStatus = "completed" | "modified" | "skipped";
type ReviewDifficulty = "easy" | "right" | "hard";

export type ReviewDraft = Readonly<{
  status?: ReviewStatus;
  difficulty?: ReviewDifficulty;
  symptomOrInstability: boolean;
  bodyRegion: string;
  modificationReason: string;
}>;

/** Device-local answers only; performance becomes authoritative on final save. */
export type WorkoutReviewDraft = Readonly<{
  version: 1;
  planId: string;
  reviewIndex: number;
  answers: Readonly<Record<string, ReviewDraft>>;
}>;

export type VNextWorkoutReviewFeedback = Readonly<{
  planItemId: PlanItemId;
  status: ReviewStatus;
  difficulty?: ReviewDifficulty;
  symptomOrInstability?: boolean;
  bodyRegion?: string;
  modificationReason?: string;
}>;

export type VNextExperienceProps = Readonly<{
  progress: ProgressAndGoalsPresentation;
  skillDetails: readonly SkillDetailPresentation[];
  today: TodayWorkoutPresentation;
  goals: GoalControlsPresentation;
  assessment: AssessmentEntryPresentation;
  restrictions: RestrictionPresentation;
  recentSessions: readonly VNextRecentSession[];
  completion?: WorkoutCompletionPresentation;
  reviewSessionId?: string;
  reviewDraft?: WorkoutReviewDraft;
  onReviewDraftChange?: (draft: WorkoutReviewDraft) => void;
  setupNotice?: ReactNode;
  savedWorkout?: VNextRecentSession;
  syncMessage?: string;
  onDismissSummary?: () => void;
  workoutStartBlocker?: string;
  workoutOrigin?: "today" | "custom";
  workoutRecoveryStage?: "preview" | "active";
  busy?: boolean;
  initialView?: ViewId;
  onDemandChange?: (demand: SessionDemand) => void;
  onGoalSelectionChange?: (selection: GoalControlSelection) => void | Promise<void>;
  onGoalEditingChange?: (editing: boolean) => void;
  onAssessmentRequested?: (action: AssessmentEntryAction) => void;
  onStartWorkout?: () => void;
  workoutSwapOptions?: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
  workoutSelections?: Readonly<Partial<Record<PlanItemId, SafeWorkoutSwap>>>;
  onWorkoutSwap?: (planItemId: PlanItemId, selection?: SafeWorkoutSwap) => void;
  onCustomSessionRequested?: () => void;
  onDiscardWorkout?: () => void;
  onEndRecoveredWorkout?: () => void;
  onWorkoutReviewSubmitted?: (feedback: readonly VNextWorkoutReviewFeedback[]) => void;
  onWorkoutRestrictionRequested?: () => void;
  onRestrictionRequested?: (sourceKey?: string) => void;
}>;

const demandOptions = [
  { value: "technique", label: "Easier / Technique" },
  { value: "standard", label: "Standard" },
  { value: "challenge", label: "Challenge" },
] as const satisfies readonly Readonly<{ value: SessionDemand; label: string }>[];

const initialGoalSelection = (goals: GoalControlsPresentation): GoalControlSelection => {
  const selected: Array<{ graphId: GraphId; priority: "primary" | "secondary" }> = [];
  for (const option of goals.options) {
    if (option.selectedPriority === "primary" || option.selectedPriority === "secondary") {
      selected.push({ graphId: option.graphId, priority: option.selectedPriority });
    }
  }
  return {
    goals: selected,
    ...(goals.emphasis ? { emphasis: goals.emphasis } : {}),
  };
};

const detailByGraph = (
  details: readonly SkillDetailPresentation[],
): ReadonlyMap<GraphId, SkillDetailPresentation> => new Map(
  details.map((detail) => [detail.graphId, detail]),
);

const detailAssessmentEntry = (
  detail: SkillDetailPresentation,
  assessment: AssessmentEntryPresentation,
): AssessmentEntryAction | undefined => {
  if (detail.assessmentAction.kind === "reassess") {
    return assessment.actions.find((action) => action.kind === "reassessment");
  }
  const expectedKind = detail.assessmentAction.kind === "start-reconfirmation"
    ? "reconfirmation"
    : "guided-test";
  return assessment.actions.find((action) => action.kind === expectedKind
    && action.graphId === detail.graphId
    && action.protocolIds.some((protocolId) =>
      detail.assessmentAction.protocolIds.includes(protocolId)));
};

const familyStateRowLabel = (
  family: ProgressAndGoalsPresentation["families"][number],
): string => {
  if (family.demonstratedState.kind === "demonstrated") return "Demonstrated";
  if (family.demonstratedState.kind === "provisional") {
    return family.demonstratedState.sourceLabel ?? "Starting point";
  }
  return "Current";
};

const RestrictionNotice = ({
  presentation,
  onRestrictionRequested,
}: Readonly<{
  presentation: RestrictionPresentation;
  onRestrictionRequested?: (sourceKey?: string) => void;
}>) => {
  const titleId = useId();
  return presentation.hasActiveRestrictions ? (
  <section className="vnext-restriction" aria-labelledby={titleId}>
    <h3 id={titleId}>Current training adjustment</h3>
    <p>{presentation.summary}</p>
    {presentation.items.map((item) => (
      <div key={item.sourceKey}>
        <p><strong>{item.title}</strong></p>
        <p className="vnext-trust-note">{item.achievementMessage}</p>
        <p>{item.trainingMessage}</p>
        {item.action && onRestrictionRequested && <button type="button" className="vnext-action" data-kind="secondary"
          onClick={() => onRestrictionRequested(item.sourceKey)}>
          {item.action === "clarify" ? "Update affected movements" : item.action === "comfort" ? "Update comfort" : "Review suitable checks"}
        </button>}
      </div>
    ))}
    {onRestrictionRequested && !presentation.items.some((item) => item.action) && (
      <button type="button" className="vnext-action" data-kind="secondary" onClick={() => onRestrictionRequested()}>
        Update restriction feedback
      </button>
    )}
  </section>
) : null;
};

const previewPhaseLabel = (label: string): string => ({
  Preparation: "Warm-up", "Preparation rounds": "Warm-up",
  "Technical work": "Skill practice", "Primary development": "Main work",
  "Supporting capacity": "Support", "Supporting work": "Support",
  "Supporting rounds": "Support", "Secondary focus": "Support",
  Maintenance: "Practice", Reset: "Cool-down",
}[label] ?? label);

const TodayView = ({
  active = true,
  today,
  restrictions,
  completion,
  reviewSessionId,
  reviewDraft,
  onReviewDraftChange,
  setupNotice,
  workoutStartBlocker,
  workoutOrigin,
  workoutRecoveryStage,
  busy = false,
  onDemandChange,
  onStartWorkout,
  workoutSwapOptions = {},
  workoutSelections = {},
  onWorkoutSwap,
  onCustomSessionRequested,
  onDiscardWorkout,
  onEndRecoveredWorkout,
  onWorkoutReviewSubmitted,
  onWorkoutRestrictionRequested,
  onRestrictionRequested,
  announce,
}: Readonly<Pick<VNextExperienceProps,
  "today" | "restrictions" | "completion" | "reviewSessionId" | "reviewDraft" | "onReviewDraftChange" | "setupNotice" | "onDemandChange" | "onStartWorkout" | "busy"
  | "workoutSwapOptions" | "workoutSelections" | "onWorkoutSwap" | "onCustomSessionRequested"
  | "onDiscardWorkout" | "onEndRecoveredWorkout" | "onWorkoutReviewSubmitted" | "onWorkoutRestrictionRequested" | "onRestrictionRequested" | "workoutStartBlocker"
  | "workoutOrigin" | "workoutRecoveryStage"> & {
  active?: boolean;
  announce: (message: string) => void;
}>) => {
  const reviewIdentity = reviewSessionId ?? completion?.prompts.map((item) => item.planItemId).join("|");
  const restoredReview = reviewDraft?.planId === reviewIdentity ? reviewDraft : undefined;
  const [reviewIndex, setReviewIndex] = useState(restoredReview?.reviewIndex ?? 0);
  const [swapPlanItemId, setSwapPlanItemId] = useState<PlanItemId>();
  const [swapDirection, setSwapDirection] = useState<SafeWorkoutSwap["direction"]>("similar");
  const [reviews, setReviews] = useState<Readonly<Record<string, ReviewDraft>>>(restoredReview?.answers ?? {});
  const reviewsRef = useRef(reviews);
  const reviewIndexRef = useRef(reviewIndex);
  const previousReviewIdentity = useRef(reviewIdentity);
  const prompts = completion?.prompts ?? [];
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const reviewing = Boolean(completion);
  useEffect(() => {
    if (!reviewing || !active) return;
    completionHeading.current?.focus({ preventScroll: true });
    completionHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [reviewing]);
  useEffect(() => {
    if (previousReviewIdentity.current === reviewIdentity) return;
    previousReviewIdentity.current = reviewIdentity;
    reviewsRef.current = restoredReview?.answers ?? {};
    reviewIndexRef.current = restoredReview?.reviewIndex ?? 0;
    setReviews(reviewsRef.current);
    setReviewIndex(reviewIndexRef.current);
  }, [reviewIdentity]);
  const retainReview = (): void => {
    if (reviewIdentity) onReviewDraftChange?.({ version: 1, planId: reviewIdentity,
      reviewIndex: reviewIndexRef.current, answers: reviewsRef.current });
  };
  const moveReview = (index: number): void => {
    reviewIndexRef.current = Math.max(0, Math.min(prompts.length - 1, index));
    setReviewIndex(reviewIndexRef.current);
    retainReview();
  };
  const allAnswered = prompts.length > 0 && prompts.every((prompt) =>
    reviews[prompt.planItemId]?.status !== undefined
      && (!reviews[prompt.planItemId]?.symptomOrInstability
        || Boolean(reviews[prompt.planItemId]?.bodyRegion.trim())));
  const currentReviewIndex = prompts.length
    ? Math.min(reviewIndex, prompts.length - 1)
    : 0;
  const currentReviewPrompt = prompts[currentReviewIndex];
  const currentReviewDraft = currentReviewPrompt
    ? reviews[currentReviewPrompt.planItemId] ?? {
      symptomOrInstability: false,
      bodyRegion: "",
      modificationReason: "",
    }
    : undefined;
  const currentReviewReady = Boolean(currentReviewDraft?.status)
    && (!currentReviewDraft?.symptomOrInstability || Boolean(currentReviewDraft.bodyRegion.trim()));
  const durationMinutes = today.durationLabel?.replace(/ minutes?$/, "") ?? "";
  const durationAdjective = durationMinutes ? `${durationMinutes}-minute` : "short";
  const customContext = workoutOrigin === "custom" && Boolean(workoutRecoveryStage || completion);
  const phases = today.blocks.reduce<Array<{ key: string; label: string; minutes: number }>>((result, block) => {
    const label = previewPhaseLabel(block.blockLabel);
    const previous = result[result.length - 1];
    if (previous?.label === label) previous.minutes = Math.round((previous.minutes + block.plannedMinutes) * 10) / 10;
    else result.push({ key: block.planItemId, label, minutes: block.plannedMinutes });
    return result;
  }, []);

  const updateReview = (planItemId: PlanItemId, update: Partial<ReviewDraft>) => {
    const existing = reviewsRef.current[planItemId] ?? {
      symptomOrInstability: false, bodyRegion: "", modificationReason: "",
    };
    reviewsRef.current = { ...reviewsRef.current, [planItemId]: { ...existing, ...update } };
    setReviews(reviewsRef.current);
    retainReview();
  };

  const submitReview = () => {
    if (!completion || (completion.prompts.length > 0 && !allAnswered)) return;
    const feedback = completion.prompts.map((prompt): VNextWorkoutReviewFeedback => {
      const draft = reviews[prompt.planItemId]!;
      const status = draft.status!;
      return {
        planItemId: prompt.planItemId,
        status,
        ...(status !== "skipped" && draft.difficulty ? { difficulty: draft.difficulty } : {}),
        ...(status !== "skipped" && draft.symptomOrInstability
          ? { symptomOrInstability: true }
          : {}),
        ...(status !== "skipped" && draft.symptomOrInstability && draft.bodyRegion.trim()
          ? { bodyRegion: draft.bodyRegion.trim() }
          : {}),
        ...(status === "modified" && draft.modificationReason.trim()
          ? { modificationReason: draft.modificationReason.trim() }
          : {}),
      };
    });
    onWorkoutReviewSubmitted?.(feedback);
    announce("Saving your workout…");
  };

  return (
    <section className="vnext-view" aria-labelledby="vnext-today-heading">
      {completion && (
        <section className="vnext-completion" aria-labelledby="vnext-completion-heading">
          <div className="vnext-section-heading">
            <p className="vnext-kicker">Quick finish</p>
            <h2 id="vnext-completion-heading" ref={completionHeading} tabIndex={-1}>A few taps, then you’re done</h2>
            <p>Review only the movements you actually reached.</p>
          </div>
          {currentReviewPrompt && currentReviewDraft && (
              <article className="vnext-review-item" key={currentReviewPrompt.planItemId}>
                <div className="vnext-review-motion" role="img" aria-label={`${currentReviewPrompt.exerciseName} movement guide`}>
                  {active && <VNextMotionGuide preset={currentReviewPrompt.mediaReference} />}
                </div>
                <div className="vnext-review-copy">
                  <div className="vnext-review-item-heading">
                    <p className="vnext-kicker">Movement {currentReviewIndex + 1} of {prompts.length} · {currentReviewPrompt.purposeLabel}</p>
                    <h3>{currentReviewPrompt.exerciseName}</h3>
                  </div>
                <fieldset>
                  <legend>{currentReviewPrompt.statusPrompt}</legend>
                  <div className="vnext-radio-row vnext-review-status-options">
                    {currentReviewPrompt.statusOptions.map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name={`status-${currentReviewPrompt.planItemId}`}
                          value={option.value}
                          checked={currentReviewDraft.status === option.value}
                          onChange={() => updateReview(currentReviewPrompt.planItemId, {
                            status: option.value,
                            ...(option.value === "skipped" ? {
                              difficulty: undefined,
                              symptomOrInstability: false,
                              bodyRegion: "",
                              modificationReason: "",
                            } : {}),
                          })}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {currentReviewPrompt.asksDifficulty && currentReviewDraft.status && currentReviewDraft.status !== "skipped" && (
                  <fieldset>
                    <legend>Effort <span>(optional)</span></legend>
                    <div className="vnext-radio-row">
                      {currentReviewPrompt.difficultyOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            type="radio"
                            name={`difficulty-${currentReviewPrompt.planItemId}`}
                            value={option.value}
                            checked={currentReviewDraft.difficulty === option.value}
                            onChange={() => updateReview(currentReviewPrompt.planItemId, { difficulty: option.value })}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {currentReviewDraft.status === "modified" && (
                  <label>
                    <span className="vnext-kicker">What changed?</span>
                    <input
                      className="vnext-modification"
                      value={currentReviewDraft.modificationReason}
                      onChange={(event) => updateReview(currentReviewPrompt.planItemId, { modificationReason: event.target.value })}
                      placeholder="For example: less range, more assistance or a shorter dose"
                    />
                  </label>
                )}
                {currentReviewDraft.status && currentReviewDraft.status !== "skipped" && (
                  <div>
                    <label className="vnext-symptom-label">
                      <input
                        type="checkbox"
                        checked={currentReviewDraft.symptomOrInstability}
                        onChange={(event) => updateReview(currentReviewPrompt.planItemId, {
                          symptomOrInstability: event.target.checked,
                          ...(!event.target.checked ? { bodyRegion: "" } : {}),
                        })}
                      />
                      {currentReviewPrompt.painPrompt}
                    </label>
                    {currentReviewDraft.symptomOrInstability && (
                      <label>
                        <span className="vnext-kicker">Affected area</span>
                        <input
                          value={currentReviewDraft.bodyRegion}
                          onChange={(event) => updateReview(currentReviewPrompt.planItemId, { bodyRegion: event.target.value })}
                          placeholder="For example: left wrist"
                          required
                        />
                      </label>
                    )}
                  </div>
                )}
                </div>
              </article>
          )}
          {completion.prompts.length === 0 && (
            <p className="vnext-help">No development or test movement had enough performed work to need a rating. Preparation and recovery timing will still be saved accurately.</p>
          )}
          <div className="vnext-actions vnext-review-navigation">
            {currentReviewIndex > 0 && (
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => moveReview(currentReviewIndex - 1)}>
                Previous
              </button>
            )}
            {currentReviewPrompt && currentReviewIndex < prompts.length - 1 ? (
              <button type="button" className="vnext-submit" disabled={busy || !currentReviewReady} onClick={() => moveReview(currentReviewIndex + 1)}>
                Next movement
              </button>
            ) : (
              <button
                type="button"
                className="vnext-submit"
                disabled={busy || (completion.prompts.length > 0 && !allAnswered) || !onWorkoutReviewSubmitted}
                onClick={submitReview}
              >
                {completion.prompts.length > 0 ? "Save workout" : "Save workout"}
              </button>
            )}
            {onWorkoutRestrictionRequested && (
              <button id="vnext-workout-restriction-action" type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onWorkoutRestrictionRequested}>
                Report pain or a new restriction
              </button>
            )}
          </div>
          <details className="vnext-review-authority">
            <summary>How this feedback is used</summary>
            <p>{completion.authorityNotice}</p>
          </details>
        </section>
      )}

      <RestrictionNotice presentation={restrictions} onRestrictionRequested={onRestrictionRequested} />

      {today.status === "ready" && today.focus ? (
        <>
          <section className="vnext-today-hero" aria-labelledby="vnext-today-heading" data-duration={durationMinutes}>
            <div className="vnext-focus-heading">
              <p className="vnext-kicker">{customContext ? "Short workout" : "Today’s focus"}</p>
              <h2 id="vnext-today-heading" tabIndex={-1}>{today.focus.label}</h2>
            </div>
            <div className="vnext-duration-badge">{today.durationLabel ?? "Short workout"}<span>including rest</span></div>
            <p className="vnext-focus-summary">
              <span>Main focus: <strong>{today.primary?.familyLabel ?? "Practice"}</strong></span>
              {today.secondary && <span>Supporting focus: <strong>{today.secondary.familyLabel}</strong></span>}
            </p>
          </section>

          {today.placementMessage && <p className="vnext-panel" role="status">{today.placementMessage}</p>}
          {!completion && <div className="vnext-primary-workout-actions" aria-label="Workout actions">
            <button
              type="button"
              className="vnext-action"
              disabled={busy || !onStartWorkout}
              onClick={() => {
                onStartWorkout?.();
                announce(workoutRecoveryStage === "active"
                  ? `Your exact in-progress ${workoutOrigin === "custom" ? "Custom Session" : "workout"} is ready to resume.`
                  : workoutRecoveryStage === "preview"
                    ? `Your ${workoutOrigin === "custom" ? "Custom Session" : "workout"} preview is ready.`
                    : "Your workout is ready to review and start.");
              }}
            >
              {workoutRecoveryStage === "active"
                ? `Resume ${workoutOrigin === "custom" ? "Custom Session" : "today’s workout"}`
                : workoutRecoveryStage === "preview"
                  ? `Review ${workoutOrigin === "custom" ? "Custom Session" : "today’s workout"}`
                  : today.startActionLabel ?? "Start today’s workout"}
            </button>
            {onEndRecoveredWorkout && workoutRecoveryStage === "active" && (
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onEndRecoveredWorkout}>
                End &amp; review completed work
              </button>
            )}
            {onDiscardWorkout && workoutRecoveryStage && (
              <button type="button" className="vnext-action vnext-danger-action" data-kind="secondary" disabled={busy} onClick={onDiscardWorkout}>
                {workoutRecoveryStage === "preview" && workoutOrigin === "custom"
                  ? "Cancel Custom Session"
                  : workoutRecoveryStage === "preview"
                    ? "Cancel workout preview"
                    : "Discard saved workout"}
              </button>
            )}
            {onCustomSessionRequested && !workoutRecoveryStage && (
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onCustomSessionRequested}>
                Short workout · 5–20 min
              </button>
            )}
          </div>}

          {!completion && <section className="vnext-demand" aria-labelledby="vnext-demand-heading">
            <fieldset>
              <legend id="vnext-demand-heading">How should today feel?</legend>
              <div className="vnext-demand-options">
                {demandOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    aria-pressed={today.demand.value === option.value}
                    disabled={busy || !onDemandChange}
                    onClick={() => {
                      onDemandChange?.(option.value);
                      announce(`${option.label} selected. Your current skill level stays the same.`);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="vnext-help">{today.demand.message}</p>
            </fieldset>
          </section>}

          {!completion && setupNotice}

          <div className="vnext-session-timeline" aria-label={customContext ? "Short workout phases" : "Today’s workout phases"}>
            {phases.map((phase) => (
              <div key={phase.key} style={{ flexGrow: Math.max(1, phase.minutes) }}>
                <strong>{phase.label}</strong>
                <small>{phase.minutes} min</small>
              </div>
            ))}
          </div>
          <details className="vnext-workout-explanation">
            <summary>Why this workout?</summary>
            <p>{today.reason}</p>
            {today.maintenance.length > 0 && <p>Maintenance: {today.maintenance.map((item) => item.familyLabel).join(", ")}</p>}
            <p>{today.authorityNotice}</p>
          </details>

          <section aria-labelledby="vnext-plan-heading">
            <div className="vnext-section-heading">
              <p className="vnext-kicker">Your {durationAdjective} plan</p>
              <h2 id="vnext-plan-heading">Your exercises</h2>
            </div>
            <div className="vnext-plan-grid">
              {today.blocks.map((block, index) => {
                const selected = workoutSelections[block.planItemId];
                const exerciseName = selected?.exerciseName ?? block.exerciseName;
                const mediaReference = selected?.mediaReference ?? block.mediaReference;
                const prescriptionLabel = selected
                  ? `${selected.variantLabel} • ${selected.targetLabel}`
                  : block.prescriptionLabel;
                const setStructureLabel = selected?.structureLabel ?? block.setStructureLabel;
                const alternatives = workoutSwapOptions[block.planItemId] ?? [];
                const swapOpen = swapPlanItemId === block.planItemId;
                const directionOptions = alternatives.filter((option) => option.direction === swapDirection);
                return (
                  <article className="vnext-plan-item" key={block.planItemId}>
                    <span className="vnext-plan-index" aria-hidden="true">{index + 1}</span>
                    <div className="vnext-plan-motion" role="img" aria-label={`${exerciseName} movement guide`}>
                      {active && (mediaReference ? <VNextMotionGuide preset={mediaReference} /> : <span>Guide unavailable</span>)}
                    </div>
                    <div className="vnext-plan-copy">
                      <p className="vnext-kicker">{previewPhaseLabel(block.blockLabel)}{block.blockLabel.endsWith("rounds") ? " · alternating sets" : ""}</p>
                      <h3>{exerciseName}</h3>
                      <p className="vnext-plan-prescription"><strong>{prescriptionLabel}</strong><br />{setStructureLabel}</p>
                      <details className="vnext-exercise-explanation">
                        <summary>Why this exercise?</summary>
                        <p>{block.reason} {block.intensity}</p>
                      </details>
                      {selected && <p className="vnext-swap-note">Safe swap selected: {selected.reason}</p>}
                      {onWorkoutSwap && (
                        <button
                          type="button"
                          className="vnext-plan-swap"
                          aria-expanded={swapOpen}
                          onClick={() => {
                            setSwapPlanItemId(swapOpen ? undefined : block.planItemId);
                            setSwapDirection(alternatives.some((option) => option.direction === "similar") ? "similar" : "easier");
                          }}
                        >
                          {swapOpen ? "Close alternatives" : "Swap exercise"}
                        </button>
                      )}
                      {swapOpen && (
                        <div className="vnext-swap-panel">
                          <div className="vnext-swap-tabs" aria-label={`Alternatives for ${exerciseName}`}>
                            {(["easier", "similar", "harder"] as const).map((direction) => (
                              <button key={direction} type="button" aria-pressed={swapDirection === direction} onClick={() => setSwapDirection(direction)}>
                                {direction === "easier" ? "Easier" : direction === "similar" ? "Similar" : "Harder"}
                              </button>
                            ))}
                          </div>
                          {directionOptions.length ? directionOptions.map((option) => (
                            <button
                              key={`${option.exerciseId}:${option.prescriptionVariantId}`}
                              type="button"
                              className="vnext-swap-option"
                              onClick={() => {
                                onWorkoutSwap?.(block.planItemId, option);
                                setSwapPlanItemId(undefined);
                                announce(`${option.exerciseName} selected as a safe ${option.direction} alternative.`);
                              }}
                            >
                              <strong>{option.exerciseName}</strong>
                              <span>{option.variantLabel} • {option.targetLabel}</span>
                              <small>{option.reason}</small>
                            </button>
                          )) : (
                            <p className="vnext-help">No {swapDirection} alternative satisfies this block’s purpose and today’s safety, equipment and load rules.</p>
                          )}
                          {selected && (
                            <button type="button" className="vnext-plan-swap" onClick={() => { onWorkoutSwap?.(block.planItemId, undefined); setSwapPlanItemId(undefined); }}>
                              Restore recommended movement
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="vnext-plan-time">{block.plannedMinutes} min<br /><small>{block.plannedRestSeconds > 0 ? "rest included" : "continuous block"}</small></span>
                  </article>
                );
              })}
            </div>
          </section>

          {workoutStartBlocker && <p className="vnext-authority" role="alert">{workoutStartBlocker}</p>}
        </>
      ) : (
        <section className="vnext-empty" aria-labelledby="vnext-today-heading">
          <h2 id="vnext-today-heading" tabIndex={-1}>Your workout needs an update</h2>
          <p>{today.reason}</p>
          <p>{today.authorityNotice}</p>
        </section>
      )}
      {!completion && (today.status !== "ready" || !today.focus) && setupNotice}

    </section>
  );
};

const GoalControls = ({
  presentation,
  busy = false,
  onGoalSelectionChange,
  onGoalEditingChange,
}: Readonly<{
  presentation: GoalControlsPresentation;
  busy?: boolean;
  onGoalSelectionChange?: (selection: GoalControlSelection) => void | Promise<void>;
  onGoalEditingChange?: (editing: boolean) => void;
}>) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selection, setSelection] = useState<GoalControlSelection>(() =>
    initialGoalSelection(presentation));
  const editButton = useRef<HTMLButtonElement>(null);
  const mainSelect = useRef<HTMLSelectElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => () => onGoalEditingChange?.(false), [onGoalEditingChange]);
  useEffect(() => {
    if (!editing) setSelection(initialGoalSelection(presentation));
  }, [presentation, editing]);
  useEffect(() => {
    if (editing) mainSelect.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!editing && !saving && !busy && returnFocus.current) {
      editButton.current?.focus();
      returnFocus.current = false;
    }
  }, [editing, saving, busy]);
  const primary = selection.goals.find((goal) => goal.priority === "primary")?.graphId;
  const secondaries = selection.goals
    .filter((goal) => goal.priority === "secondary")
    .map((goal) => goal.graphId);
  const savedPrimary = presentation.options.find((option) => option.graphId === presentation.primaryGraphId);
  const savedSecondaries = presentation.options.filter((option) => presentation.secondaryGraphIds.includes(option.graphId));
  const emphasisEnabled = selection.emphasis !== undefined;
  const locked = busy || saving;

  const choosePrimary = (graphId?: GraphId) => {
    setSelection((current) => ({
      goals: [
        ...(graphId ? [{ graphId, priority: "primary" as const }] : []),
        ...current.goals.filter((goal) => goal.graphId !== graphId && goal.priority === "secondary"),
      ],
    }));
  };

  const chooseSecondary = (graphId: GraphId) => {
    setSelection((current) => {
      if (current.goals.some((goal) => goal.graphId === graphId && goal.priority === "primary")) return current;
      const selected = current.goals.some((goal) => goal.graphId === graphId && goal.priority === "secondary");
      const remaining = current.goals.filter((goal) => goal.graphId !== graphId);
      if (!selected && remaining.filter((goal) => goal.priority === "secondary").length >= 2) return current;
      return { goals: selected ? remaining : [...remaining, { graphId, priority: "secondary" as const }] };
    });
  };

  const toggleEmphasis = () => {
    setSelection((current) => {
      const selectedPrimary = current.goals.find((goal) => goal.priority === "primary")?.graphId;
      if (!selectedPrimary || current.emphasis) return { goals: current.goals };
      return { goals: current.goals, emphasis: { primaryGraphId: selectedPrimary } };
    });
  };

  const chooseEmphasisSecondary = (graphId: GraphId) => {
    setSelection((current) => {
      const selectedPrimary = current.goals.find((goal) => goal.priority === "primary")?.graphId;
      if (!selectedPrimary) return current;
      const active = current.emphasis?.secondaryGraphId === graphId;
      return {
        goals: current.goals,
        emphasis: {
          primaryGraphId: selectedPrimary,
          ...(active ? {} : { secondaryGraphId: graphId }),
        },
      };
    });
  };

  const closeEditor = () => {
    returnFocus.current = true;
    onGoalEditingChange?.(false);
    setEditing(false);
    setSaveError("");
  };
  const save = async () => {
    if (!onGoalSelectionChange || locked || !primary) return;
    setSaving(true);
    setSaveError("");
    try {
      await onGoalSelectionChange(selection);
      closeEditor();
    } catch {
      setSaveError("Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="vnext-goals" aria-labelledby="vnext-goals-heading">
      <div className="vnext-goals-heading">
        <h2 id="vnext-goals-heading">{presentation.title}</h2>
        <button
          ref={editButton}
          type="button"
          className="vnext-chip"
          aria-expanded={editing}
          aria-controls={editing ? "vnext-goal-editor" : undefined}
          disabled={locked}
          onClick={() => {
            if (editing) closeEditor();
            else {
              setSelection(initialGoalSelection(presentation));
              setSaveError("");
              onGoalEditingChange?.(true);
              setEditing(true);
            }
          }}
        >{editing ? "Cancel" : savedPrimary ? "Edit goals" : "Choose goals"}</button>
      </div>
      {savedPrimary ? <dl className="vnext-goal-summary">
        <div><dt>Main goal</dt><dd>{savedPrimary.label}</dd></div>
        <div><dt>Supporting goals</dt><dd>{savedSecondaries.length ? savedSecondaries.map((option) => option.label).join(" · ") : "None selected"}</dd></div>
      </dl> : <p className="vnext-help">Choose a main goal to put its path first. You can add up to two supporting goals.</p>}
      {editing && <div className="vnext-goal-editor" id="vnext-goal-editor">
        <p className="vnext-help">Choose one main goal and up to two supporting goals.</p>
        <label className="vnext-main-goal">Main goal
          <select ref={mainSelect} value={primary ?? ""} disabled={locked} onChange={(event) => choosePrimary(event.target.value ? event.target.value as GraphId : undefined)}>
            <option value="">Choose your main goal</option>
            {presentation.options.map((option) => <option key={option.graphId} value={option.graphId}>{option.label}</option>)}
          </select>
        </label>
        {primary && <p className="vnext-help">{presentation.options.find((option) => option.graphId === primary)?.description}</p>}
        <fieldset disabled={locked}>
          <legend>Supporting goals <span className="vnext-help">{secondaries.length} of 2 selected</span></legend>
          <p className="vnext-help" id="vnext-supporting-goals-help">Optional. Uncheck a goal to make room for another.</p>
          <div className="vnext-goal-grid">
            {presentation.options.filter((option) => option.graphId !== primary).map((option) => <label className="vnext-supporting-goal" key={option.graphId}>
              <input
                type="checkbox"
                checked={secondaries.includes(option.graphId)}
                disabled={!secondaries.includes(option.graphId) && secondaries.length >= 2}
                aria-describedby="vnext-supporting-goals-help"
                onChange={() => chooseSecondary(option.graphId)}
              />
              <span><strong>{option.label}</strong><small>{option.description}</small>{option.selectedPriority === "interest" && <small>Previously saved as an interest</small>}</span>
            </label>)}
          </div>
        </fieldset>
        <details className="vnext-goal-emphasis">
          <summary>Temporary training focus <span>(optional)</span></summary>
          <p className="vnext-help">Let the app balance your goals, or give your main goal extra focus for now. Your current ability and comfort still guide each workout.</p>
          <button
            type="button"
            className="vnext-chip"
            aria-pressed={emphasisEnabled}
            disabled={locked || !primary}
            onClick={toggleEmphasis}
          >{emphasisEnabled ? "Extra focus on my main goal" : "Let the app balance my goals"}</button>
          {emphasisEnabled && secondaries.length > 0 && <div className="vnext-actions">
            {secondaries.map((graphId) => {
              const option = presentation.options.find((candidate) => candidate.graphId === graphId)!;
              return <button
                type="button"
                className="vnext-chip"
                key={graphId}
                aria-pressed={selection.emphasis?.secondaryGraphId === graphId}
                disabled={locked}
                onClick={() => chooseEmphasisSecondary(graphId)}
              >Also focus on {option.label}</button>;
            })}
          </div>}
        </details>
        <p className="vnext-authority">{presentation.authorityNotice}</p>
        {saveError && <p className="vnext-authority" role="alert">{saveError}</p>}
        <div className="vnext-actions">
          <button type="button" className="vnext-submit" disabled={locked || !onGoalSelectionChange || !primary || selection.goals.length > 3} onClick={() => { void save(); }}>
            {saving ? "Saving goals…" : "Save goals"}
          </button>
          <button type="button" className="vnext-action" data-kind="secondary" disabled={locked} onClick={closeEditor}>Cancel</button>
        </div>
      </div>}
    </section>
  );
};

const AssessmentActions = ({
  presentation,
  onAssessmentRequested,
  announce,
}: Readonly<{
  presentation: AssessmentEntryPresentation;
  onAssessmentRequested?: (action: AssessmentEntryAction) => void;
  announce: (message: string) => void;
}>) => (
  <section className="vnext-panel" aria-labelledby="vnext-assessment-heading">
    <div className="vnext-section-heading">
      <p className="vnext-kicker">Evidence, not claims</p>
      <h2 id="vnext-assessment-heading">{presentation.title}</h2>
      <p>{presentation.intro}</p>
    </div>
    <div className="vnext-assessment-list">
      {presentation.actions.map((action) => (
        <div className="vnext-assessment-action" key={action.id}>
          <div>
            <strong>{action.label}</strong>
            <span>{action.description}</span>
            {action.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}
          </div>
          <button
            type="button"
            className="vnext-action"
            data-kind="secondary"
            disabled={action.availability === "blocked" || !onAssessmentRequested}
            onClick={() => {
              onAssessmentRequested?.(action);
              announce(`${action.label} opened.`);
            }}
          >
            {action.availability === "blocked" ? "Not available now" : action.label}
          </button>
        </div>
      ))}
    </div>
    <p className="vnext-authority">{presentation.authorityNotice}</p>
  </section>
);

const ProgressView = ({
  progress,
  skillDetails,
  goals,
  assessment,
  restrictions,
  busy = false,
  onGoalSelectionChange,
  onGoalEditingChange,
  onAssessmentRequested,
  onRestrictionRequested,
  announce,
}: Readonly<Pick<VNextExperienceProps,
  "progress" | "skillDetails" | "goals" | "assessment" | "restrictions" | "busy"
  | "onGoalSelectionChange" | "onGoalEditingChange" | "onAssessmentRequested" | "onRestrictionRequested"> & {
  announce: (message: string) => void;
}>) => {
  const [selectedGraphId, setSelectedGraphId] = useState<GraphId>();
  const details = useMemo(() => detailByGraph(skillDetails), [skillDetails]);
  const detail = selectedGraphId ? details.get(selectedGraphId) : undefined;
  const detailAssessment = detail ? detailAssessmentEntry(detail, assessment) : undefined;

  return (
    <section className="vnext-view" aria-labelledby="vnext-progress-heading">
      <RestrictionNotice presentation={restrictions} onRestrictionRequested={onRestrictionRequested} />

      {detail ? (
        <section className="vnext-detail" aria-labelledby="vnext-progress-heading">
          <button
            type="button"
            className="vnext-back"
            onClick={() => {
              setSelectedGraphId(undefined);
              announce("Returned to all skill families.");
            }}
          >
            Back to all skills
          </button>
          <div className="vnext-section-heading">
            <p className="vnext-kicker">Skill detail</p>
            <h2 id="vnext-progress-heading">{detail.title}</h2>
            <p>{detail.description}</p>
          </div>
          <div className="vnext-current-next">
            <section><span>Current</span><strong>{detail.currentLabel}</strong></section>
            <section><span>Next</span><strong>{detail.nextLabel}</strong></section>
          </div>
          <section className="vnext-panel" aria-labelledby="vnext-requires-heading">
            <h3 id="vnext-requires-heading">{detail.requiresLabel}</h3>
            {detail.prerequisites.length ? (
              <ul className="vnext-requirements">
                {detail.prerequisites.map((item) => (
                  <li key={item.key} data-state={item.state}>
                    <i aria-hidden="true" />
                    <span><strong>{item.label}</strong> — {item.message}{item.requirement === "one-of" ? " One suitable option is enough." : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="vnext-help">No additional prerequisite is blocking the current safe step.</p>}
            {detail.whyNotYet && <p className="vnext-authority">Why not yet: {detail.whyNotYet}</p>}
          </section>
          <section className="vnext-panel">
            <h3>Recommended focus</h3>
            <p>{detail.recommendedFocus.message}</p>
            <p className="vnext-trust-note">{detail.demonstratedState.supportingText}</p>
            <button
              type="button"
              className="vnext-action"
              disabled={!onAssessmentRequested
                || !detailAssessment
                || detailAssessment.availability === "blocked"}
              onClick={() => {
                if (detailAssessment) onAssessmentRequested?.(detailAssessment);
                announce(detailAssessment
                  ? `${detail.assessmentAction.label} selected.`
                  : "This check is not available from the current evidence.");
              }}
            >
              {detailAssessment?.availability === "blocked"
                ? "Not available now"
                : detail.assessmentAction.label}
            </button>
          </section>
          {detail.demonstratedMilestones.length > 0 && (
            <details className="vnext-panel">
              <summary>Previously demonstrated in this family</summary>
              <ul className="vnext-requirements">
                {detail.demonstratedMilestones.map((item) => (
                  <li key={`${item.milestone.graphId}:${item.milestone.nodeId}`} data-state="met">
                    <i aria-hidden="true" /><span><strong>{item.label}</strong> — {item.confidence.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ) : (
        <>
          <div className="vnext-section-heading">
            <p className="vnext-kicker">Independent progress, one clear view</p>
            <h2 id="vnext-progress-heading">{progress.title}</h2>
            <p>{progress.intro}</p>
          </div>
          <GoalControls presentation={goals} busy={busy} onGoalSelectionChange={onGoalSelectionChange} onGoalEditingChange={onGoalEditingChange} />
          <SkillRoadmap roadmaps={progress.roadmaps} />
          <div className="vnext-section-heading"><h2>All skill families</h2><p>Explore your progress and next steps in each skill.</p></div>
          <div className="vnext-family-grid">
            {progress.families.map((family) => (
              <button
                type="button"
                className="vnext-family-card"
                key={family.graphId}
                onClick={() => {
                  setSelectedGraphId(family.graphId);
                  announce(`${family.label} detail opened.`);
                }}
              >
                <span className="vnext-family-card-header"><span className="vnext-family-title">{family.label}</span><span className="vnext-badge" data-state={family.availability.state}>{family.availability.label}</span></span>
                <span className="vnext-family-row"><span>{familyStateRowLabel(family)}</span><strong>{family.demonstratedState.label}</strong></span>
                <span className="vnext-family-row"><span>Next</span><strong>{family.nextTarget?.label ?? "Maintain current work"}</strong></span>
                <span className="vnext-family-row"><span>Focus</span><strong>{family.recommendedFocus.label}</strong></span>
                <span className="vnext-family-action">{family.action.label}</span>
              </button>
            ))}
          </div>
          <p className="vnext-authority">{progress.authorityNotice}</p>
        </>
      )}

      {!detail && (
        <>
          <AssessmentActions presentation={assessment} onAssessmentRequested={onAssessmentRequested} announce={announce} />
        </>
      )}
    </section>
  );
};

/**
 * Feature-isolated Phase 8 surface. It consumes user-safe presentation models
 * and emits commands only; Phase 9 must connect it to one coherent vNext
 * authority/read/write path before mounting it in the application root.
 * Import `./phase8.css` only from that isolated vNext entry.
 */
export const VNextExperience = ({
  progress,
  skillDetails,
  today,
  goals,
  assessment,
  restrictions,
  recentSessions,
  completion,
  reviewSessionId,
  reviewDraft,
  onReviewDraftChange,
  setupNotice,
  savedWorkout,
  syncMessage = "Saved on this device.",
  onDismissSummary,
  workoutStartBlocker,
  workoutOrigin,
  workoutRecoveryStage,
  busy = false,
  initialView = "today",
  onDemandChange,
  onGoalSelectionChange,
  onGoalEditingChange,
  onAssessmentRequested,
  onStartWorkout,
  workoutSwapOptions,
  workoutSelections,
  onWorkoutSwap,
  onCustomSessionRequested,
  onDiscardWorkout,
  onEndRecoveredWorkout,
  onWorkoutReviewSubmitted,
  onWorkoutRestrictionRequested,
  onRestrictionRequested,
}: VNextExperienceProps) => {
  const workflowStatus = completion
    ? `${workoutOrigin === "custom" ? "Your Custom Session" : "Your workout"} is ready for the short completion review.`
    : workoutRecoveryStage === "active"
      ? `Your exact in-progress ${workoutOrigin === "custom" ? "Custom Session" : "workout"} is ready to resume.`
      : workoutRecoveryStage === "preview"
        ? `Your ${workoutOrigin === "custom" ? "Custom Session" : "workout"} preview is ready to review.`
        : "Today’s workout is ready.";
  const [historySelection, setHistorySelection] = useState<string>();
  const { section: view, changeSection: setView, hasVisited } = useSectionNavigation(initialView);
  const previousSavedId = useRef(savedWorkout?.id);
  useEffect(() => {
    if (savedWorkout) setView("today");
    else if (previousSavedId.current && view === "today") {
      const heading = document.getElementById("vnext-today-heading");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start" });
    }
    previousSavedId.current = savedWorkout?.id;
  }, [savedWorkout?.id]);
  const [statusMessage, setStatusMessage] = useState(workflowStatus);
  useEffect(() => {
    setStatusMessage(workflowStatus);
  }, [workflowStatus]);
  const announce = (message: string) => setStatusMessage(message);
  const changeView = (next: ViewId) => {
    setView(next);
    announce(next === "today" ? workflowStatus : next === "progress" ? "Progress & Goals opened." : "Recent sessions opened.");
  };

  return (
    <main className="vnext-experience" aria-labelledby="vnext-app-title">
      <div className="vnext-shell vnext-simple-shell">
        <header className="vnext-header">
          <div>
            <div className="vnext-brand-lockup" aria-label="Parallette25">
              <span className="vnext-brand-mark" aria-hidden="true"><i /><i /></span>
              <span><strong>PARALLETTE</strong><b>25+</b></span>
            </div>
            <h1 id="vnext-app-title" className="vnext-visually-hidden">Parallette25</h1>
          </div>
          <nav className="vnext-nav vnext-section-navigation" aria-label="Training sections">
            <button type="button" aria-pressed={view === "today"} onClick={() => changeView("today")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 3l9 7v11h-6v-7H9v7H3Z" /></svg><span>Today</span></button>
            <button type="button" aria-pressed={view === "progress"} onClick={() => changeView("progress")} aria-label="Progress & Goals"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-5m7 5V9m7 11V3M3 21h18" /></svg><span className="vnext-nav-long-label">Progress &amp; Goals</span><span className="vnext-nav-short-label">Progress</span></button>
            <button type="button" aria-pressed={view === "history"} onClick={() => changeView("history")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2" /></svg><span>History</span></button>
          </nav>
        </header>
        <p className="vnext-live-status vnext-visually-hidden" role="status" aria-live="polite">{statusMessage}</p>
        <div className="vnext-tab-panel" hidden={view !== "today"}>
        {savedWorkout && !completion && !workoutRecoveryStage && <WorkoutSavedSummary
          session={savedWorkout}
          active={view === "today"}
          syncMessage={syncMessage}
          nextFocus={today.status === "ready" && today.focus ? `${today.focus.label}. Return when you’re ready to train.` : "Check Today for your current options and any comfort updates."}
          onDone={() => onDismissSummary?.()}
          onHistory={() => { setHistorySelection(savedWorkout.id); changeView("history"); onDismissSummary?.(); }}
        />}
        {hasVisited("today") && <TodayView
            active={view === "today"}
            today={today}
            restrictions={restrictions}
            completion={completion}
            reviewSessionId={reviewSessionId}
            reviewDraft={reviewDraft}
            onReviewDraftChange={onReviewDraftChange}
            setupNotice={setupNotice}
            workoutStartBlocker={workoutStartBlocker}
            workoutOrigin={workoutOrigin}
            workoutRecoveryStage={workoutRecoveryStage}
            busy={busy}
            onDemandChange={onDemandChange}
            onStartWorkout={onStartWorkout}
            workoutSwapOptions={workoutSwapOptions}
            workoutSelections={workoutSelections}
            onWorkoutSwap={onWorkoutSwap}
            onCustomSessionRequested={onCustomSessionRequested}
            onDiscardWorkout={onDiscardWorkout}
            onEndRecoveredWorkout={onEndRecoveredWorkout}
            onWorkoutReviewSubmitted={onWorkoutReviewSubmitted}
            onWorkoutRestrictionRequested={onWorkoutRestrictionRequested}
            onRestrictionRequested={onRestrictionRequested}
            announce={announce}
          />}
        </div>
        <div className="vnext-tab-panel" hidden={view !== "progress"}>
          {hasVisited("progress") && <ProgressView
            progress={progress}
            skillDetails={skillDetails}
            goals={goals}
            busy={busy}
            assessment={assessment}
            restrictions={restrictions}
            onGoalSelectionChange={onGoalSelectionChange}
            onGoalEditingChange={onGoalEditingChange}
            onAssessmentRequested={onAssessmentRequested}
            onRestrictionRequested={onRestrictionRequested}
            announce={announce}
          />}
        </div>
        <div className="vnext-tab-panel" hidden={view !== "history"}>
          {hasVisited("history") && <HistoryView sessions={recentSessions} selectedId={historySelection} />}
        </div>
      </div>
    </main>
  );
};
