"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphId, PlanItemId, SessionDemand } from "../contracts";
import { VNextMotionGuide } from "../media/VNextMotionGuide";
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

type ReviewDraft = Readonly<{
  status?: ReviewStatus;
  difficulty?: ReviewDifficulty;
  symptomOrInstability: boolean;
  bodyRegion: string;
  modificationReason: string;
}>;

export type VNextWorkoutReviewFeedback = Readonly<{
  planItemId: PlanItemId;
  status: ReviewStatus;
  difficulty?: ReviewDifficulty;
  symptomOrInstability?: boolean;
  bodyRegion?: string;
  modificationReason?: string;
}>;

export type VNextRecentSession = Readonly<{
  id: string;
  title: string;
  completedAt: string;
  participationSeconds: number;
  status: "complete" | "modified" | "partial" | "abandoned";
  source: "vnext" | "migrated";
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
  workoutStartBlocker?: string;
  workoutOrigin?: "today" | "custom";
  workoutRecoveryStage?: "preview" | "active";
  busy?: boolean;
  initialView?: ViewId;
  onDemandChange?: (demand: SessionDemand) => void;
  onGoalSelectionChange?: (selection: GoalControlSelection) => void;
  onAssessmentRequested?: (action: AssessmentEntryAction) => void;
  onStartWorkout?: () => void;
  workoutSwapOptions?: Readonly<Partial<Record<PlanItemId, readonly SafeWorkoutSwap[]>>>;
  workoutSelections?: Readonly<Partial<Record<PlanItemId, SafeWorkoutSwap>>>;
  onWorkoutSwap?: (planItemId: PlanItemId, selection?: SafeWorkoutSwap) => void;
  onCustomSessionRequested?: () => void;
  onDiscardWorkout?: () => void;
  onEndRecoveredWorkout?: () => void;
  onWorkoutReviewSubmitted?: (feedback: readonly VNextWorkoutReviewFeedback[]) => void;
  onRestrictionRequested?: () => void;
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
  onRestrictionRequested?: () => void;
}>) => presentation.hasActiveRestrictions ? (
  <section className="vnext-restriction" aria-labelledby="vnext-restriction-title">
    <h3 id="vnext-restriction-title">Current training adjustment</h3>
    <p>{presentation.summary}</p>
    {presentation.items.map((item) => (
      <div key={item.sourceKey}>
        <p><strong>{item.title}</strong></p>
        <p className="vnext-trust-note">{item.achievementMessage}</p>
        <p>{item.trainingMessage}</p>
      </div>
    ))}
    {onRestrictionRequested && (
      <button type="button" className="vnext-action" data-kind="secondary" onClick={onRestrictionRequested}>
        Update restriction feedback
      </button>
    )}
  </section>
) : null;

const TodayView = ({
  today,
  restrictions,
  completion,
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
  onRestrictionRequested,
  announce,
}: Readonly<Pick<VNextExperienceProps,
  "today" | "restrictions" | "completion" | "onDemandChange" | "onStartWorkout" | "busy"
  | "workoutSwapOptions" | "workoutSelections" | "onWorkoutSwap" | "onCustomSessionRequested"
  | "onDiscardWorkout" | "onEndRecoveredWorkout" | "onWorkoutReviewSubmitted" | "onRestrictionRequested" | "workoutStartBlocker"
  | "workoutOrigin" | "workoutRecoveryStage"> & {
  announce: (message: string) => void;
}>) => {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [swapPlanItemId, setSwapPlanItemId] = useState<PlanItemId>();
  const [swapDirection, setSwapDirection] = useState<SafeWorkoutSwap["direction"]>("similar");
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const prompts = completion?.prompts ?? [];
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const reviewing = Boolean(completion);
  useEffect(() => {
    if (!reviewing) return;
    completionHeading.current?.focus({ preventScroll: true });
    completionHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [reviewing]);
  useEffect(() => setReviewIndex(0), [completion]);
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

  const updateReview = (planItemId: PlanItemId, update: Partial<ReviewDraft>) => {
    setReviews((current) => {
      const existing = current[planItemId] ?? {
        symptomOrInstability: false,
        bodyRegion: "",
        modificationReason: "",
      };
      return {
        ...current,
        [planItemId]: {
          ...existing,
        ...update,
      },
      };
    });
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
    announce("Workout feedback is ready for the single vNext Session Record.");
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
                  <VNextMotionGuide preset={currentReviewPrompt.mediaReference} />
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
              <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => setReviewIndex((index) => Math.max(0, index - 1))}>
                Previous
              </button>
            )}
            {currentReviewPrompt && currentReviewIndex < prompts.length - 1 ? (
              <button type="button" className="vnext-submit" disabled={busy || !currentReviewReady} onClick={() => setReviewIndex((index) => Math.min(prompts.length - 1, index + 1))}>
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
            {onRestrictionRequested && completion.prompts.length === 0 && (
              <button type="button" className="vnext-action" data-kind="secondary" onClick={onRestrictionRequested}>
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
            <div>
              <p className="vnext-kicker">{customContext ? "Custom Session focus" : "Today’s focus"}</p>
              <h2 id="vnext-today-heading">{today.focus.label}</h2>
              <p>{today.reason}</p>
            </div>
            <div className="vnext-today-meta">
              <div><span>Primary goal</span><strong>{today.primary?.familyLabel ?? "Purposeful practice"}</strong></div>
              <div><span>Secondary</span><strong>{today.secondary?.familyLabel ?? "None today"}</strong></div>
              <div><span>Session</span><strong>{today.durationLabel ?? "Safe shorter session"}</strong></div>
              <div><span>Maintenance</span><strong>{today.maintenance.map((item) => item.familyLabel).join(", ") || "As needed"}</strong></div>
            </div>
          </section>

          <div className="vnext-session-timeline" aria-label={customContext ? "Custom Session timeline" : "Today’s workout timeline"}>
            {today.blocks.map((block, index) => (
              <div key={block.planItemId} style={{ flexGrow: Math.max(1, block.plannedMinutes) }}>
                <span>{index + 1}</span>
                <strong>{block.blockLabel}</strong>
                <small>{block.plannedMinutes} min</small>
              </div>
            ))}
          </div>

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
                    : "Today’s vNext workout is ready to review and start.");
              }}
            >
              {workoutRecoveryStage === "active"
                ? `Resume ${workoutOrigin === "custom" ? "Custom Session" : "today’s workout"}`
                : workoutRecoveryStage === "preview"
                  ? `Review ${workoutOrigin === "custom" ? "Custom Session" : "today’s workout"}`
                  : "Start today’s workout"}
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
                Build a 5–20 minute session
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
                      announce(`${option.label} selected. The safe skill frontier stays the same.`);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="vnext-help">{today.demand.message}</p>
            </fieldset>
          </section>}

          <section aria-labelledby="vnext-plan-heading">
            <div className="vnext-section-heading">
              <p className="vnext-kicker">Your {durationAdjective} plan</p>
              <h2 id="vnext-plan-heading">Every block has a reason</h2>
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
                      {mediaReference ? <VNextMotionGuide preset={mediaReference} /> : <span>Guide unavailable</span>}
                    </div>
                    <div className="vnext-plan-copy">
                      <p className="vnext-kicker">{block.blockLabel}</p>
                      <h3>{exerciseName}</h3>
                      <p className="vnext-plan-prescription"><strong>{prescriptionLabel}</strong><br />{setStructureLabel}</p>
                      <p>{block.reason} {block.intensity}</p>
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

          <p className="vnext-authority">{today.authorityNotice}</p>
          {workoutStartBlocker && <p className="vnext-authority" role="alert">{workoutStartBlocker}</p>}
        </>
      ) : (
        <section className="vnext-empty" aria-labelledby="vnext-today-heading">
          <h2 id="vnext-today-heading">Today’s safe plan needs an update</h2>
          <p>{today.reason}</p>
          <p>{today.authorityNotice}</p>
        </section>
      )}


    </section>
  );
};

const GoalControls = ({
  presentation,
  onGoalSelectionChange,
  announce,
}: Readonly<{
  presentation: GoalControlsPresentation;
  onGoalSelectionChange?: (selection: GoalControlSelection) => void;
  announce: (message: string) => void;
}>) => {
  const [selection, setSelection] = useState<GoalControlSelection>(() =>
    initialGoalSelection(presentation));
  useEffect(() => setSelection(initialGoalSelection(presentation)), [presentation]);
  const primary = selection.goals.find((goal) => goal.priority === "primary")?.graphId;
  const secondaries = selection.goals
    .filter((goal) => goal.priority === "secondary")
    .map((goal) => goal.graphId);
  const emphasisEnabled = selection.emphasis !== undefined;

  const choosePrimary = (graphId: GraphId) => {
    setSelection((current) => {
      const wasPrimary = current.goals.some((goal) => goal.graphId === graphId
        && goal.priority === "primary");
      const remaining = current.goals.filter((goal) => goal.graphId !== graphId
        && goal.priority !== "primary");
      const goals = wasPrimary ? remaining : [{ graphId, priority: "primary" as const }, ...remaining];
      return { goals, emphasis: undefined };
    });
  };

  const chooseSecondary = (graphId: GraphId) => {
    setSelection((current) => {
      if (current.goals.some((goal) => goal.graphId === graphId && goal.priority === "primary")) return current;
      const selected = current.goals.some((goal) => goal.graphId === graphId && goal.priority === "secondary");
      const remaining = current.goals.filter((goal) => goal.graphId !== graphId);
      if (!selected && remaining.filter((goal) => goal.priority === "secondary").length >= 2) return current;
      return { goals: selected ? remaining : [...remaining, { graphId, priority: "secondary" as const }], emphasis: undefined };
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

  return (
    <section className="vnext-goals" aria-labelledby="vnext-goals-heading">
      <div className="vnext-section-heading">
        <p className="vnext-kicker">Your direction</p>
        <h2 id="vnext-goals-heading">{presentation.title}</h2>
      </div>
      <fieldset>
        <legend>Choose one primary goal and up to two secondary goals</legend>
        <div className="vnext-goal-grid">
          {presentation.options.map((option) => (
            <div className="vnext-goal-option" key={option.graphId}>
              <div><strong>{option.label}</strong><small>{option.description}</small></div>
              <div className="vnext-goal-choice">
                <button
                  type="button"
                  className="vnext-chip"
                  aria-pressed={primary === option.graphId}
                  aria-label={primary === option.graphId
                    ? `Remove ${option.label} as primary goal`
                    : `Set ${option.label} as primary goal`}
                  onClick={() => choosePrimary(option.graphId)}
                >
                  Primary
                </button>
                <button
                  type="button"
                  className="vnext-chip"
                  aria-pressed={secondaries.includes(option.graphId)}
                  aria-label={secondaries.includes(option.graphId)
                    ? `Remove ${option.label} as secondary goal`
                    : `Add ${option.label} as secondary goal`}
                  disabled={primary === option.graphId}
                  onClick={() => chooseSecondary(option.graphId)}
                >
                  Secondary
                </button>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Optional emphasis</legend>
        <button
          type="button"
          className="vnext-chip"
          aria-pressed={emphasisEnabled}
          disabled={!primary}
          onClick={toggleEmphasis}
        >
          {emphasisEnabled ? "Primary goal prioritised for now" : "System chooses the balance"}
        </button>
        {emphasisEnabled && secondaries.length > 0 && (
          <div className="vnext-actions">
            {secondaries.map((graphId) => {
              const option = presentation.options.find((candidate) => candidate.graphId === graphId)!;
              return (
                <button
                  type="button"
                  className="vnext-chip"
                  key={graphId}
                  aria-pressed={selection.emphasis?.secondaryGraphId === graphId}
                  onClick={() => chooseEmphasisSecondary(graphId)}
                >
                  Also emphasise {option.label}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <p className="vnext-authority">{presentation.authorityNotice}</p>
      <button
        type="button"
        className="vnext-submit"
        disabled={!onGoalSelectionChange || !primary || selection.goals.length > 3}
        onClick={() => {
          onGoalSelectionChange?.(selection);
          announce("Goals saved. Safe progression still comes from current evidence.");
        }}
      >
        Save goals
      </button>
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
  onGoalSelectionChange,
  onAssessmentRequested,
  onRestrictionRequested,
  announce,
}: Readonly<Pick<VNextExperienceProps,
  "progress" | "skillDetails" | "goals" | "assessment" | "restrictions"
  | "onGoalSelectionChange" | "onAssessmentRequested" | "onRestrictionRequested"> & {
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
          <GoalControls presentation={goals} onGoalSelectionChange={onGoalSelectionChange} announce={announce} />
          <AssessmentActions presentation={assessment} onAssessmentRequested={onAssessmentRequested} announce={announce} />
        </>
      )}
    </section>
  );
};

const historyDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  return remainder === 0 ? `${minutes} min` : `${minutes}m ${remainder}s`;
};

const HistoryView = ({ sessions }: Readonly<{ sessions: readonly VNextRecentSession[] }>) => (
  <section className="vnext-view" aria-labelledby="vnext-history-heading">
    <div className="vnext-section-heading">
      <p className="vnext-kicker">Your training</p>
      <h2 id="vnext-history-heading">Recent sessions</h2>
      <p>Completed and partial workouts stay visible here. Migrated v1.2 sessions remain clearly identified and are never presented as more precise than their saved history.</p>
    </div>
    {sessions.length === 0 ? (
      <div className="vnext-empty">Your completed workouts will appear here after the first saved Session Record.</div>
    ) : (
      <div className="vnext-history-list">
        {sessions.map((session) => (
          <article className="vnext-history-item" key={session.id}>
            <div>
              <strong>{session.title}</strong>
              <span>{new Date(session.completedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
            </div>
            <div className="vnext-history-meta">
              <span>{historyDuration(session.participationSeconds)}</span>
              <span>{session.status === "complete" ? "Completed" : session.status === "modified" ? "Modified" : session.status === "partial" ? "Partial" : "Ended early"}</span>
              {session.source === "migrated" && <span>Migrated v1.2</span>}
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
);

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
  workoutStartBlocker,
  workoutOrigin,
  workoutRecoveryStage,
  busy = false,
  initialView = "today",
  onDemandChange,
  onGoalSelectionChange,
  onAssessmentRequested,
  onStartWorkout,
  workoutSwapOptions,
  workoutSelections,
  onWorkoutSwap,
  onCustomSessionRequested,
  onDiscardWorkout,
  onEndRecoveredWorkout,
  onWorkoutReviewSubmitted,
  onRestrictionRequested,
}: VNextExperienceProps) => {
  const workflowStatus = completion
    ? `${workoutOrigin === "custom" ? "Your Custom Session" : "Your workout"} is ready for the short completion review.`
    : workoutRecoveryStage === "active"
      ? `Your exact in-progress ${workoutOrigin === "custom" ? "Custom Session" : "workout"} is ready to resume.`
      : workoutRecoveryStage === "preview"
        ? `Your ${workoutOrigin === "custom" ? "Custom Session" : "workout"} preview is ready to review.`
        : "Today’s safe vNext plan is ready to review.";
  const [view, setView] = useState<ViewId>(initialView);
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
      <div className="vnext-shell">
        <header className="vnext-header">
          <div>
            <div className="vnext-brand-lockup" aria-label="Parallette25">
              <span className="vnext-brand-mark" aria-hidden="true"><i /><i /></span>
              <span><strong>PARALLETTE</strong><b>25+</b></span>
            </div>
            <h1 id="vnext-app-title">Train what matters, at the step that fits.</h1>
            <p>Goals set the direction. Demonstrated evidence and current context keep each session safe and useful.</p>
          </div>
          <nav className="vnext-nav" aria-label="vNext training sections">
            <button type="button" aria-pressed={view === "today"} onClick={() => changeView("today")}>Today</button>
            <button type="button" aria-pressed={view === "progress"} onClick={() => changeView("progress")}>Progress &amp; Goals</button>
            <button type="button" aria-pressed={view === "history"} onClick={() => changeView("history")}>History</button>
          </nav>
        </header>
        <p className="vnext-live-status" role="status" aria-live="polite">{statusMessage}</p>
        {view === "today" ? (
          <TodayView
            today={today}
            restrictions={restrictions}
            completion={completion}
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
            onRestrictionRequested={onRestrictionRequested}
            announce={announce}
          />
        ) : view === "progress" ? (
          <ProgressView
            progress={progress}
            skillDetails={skillDetails}
            goals={goals}
            assessment={assessment}
            restrictions={restrictions}
            onGoalSelectionChange={onGoalSelectionChange}
            onAssessmentRequested={onAssessmentRequested}
            onRestrictionRequested={onRestrictionRequested}
            announce={announce}
          />
        ) : (
          <HistoryView sessions={recentSessions} />
        )}
      </div>
    </main>
  );
};
