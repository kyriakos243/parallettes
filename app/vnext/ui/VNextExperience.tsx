"use client";

import { useEffect, useMemo, useState } from "react";
import type { GraphId, PlanItemId, SessionDemand } from "../contracts";
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

type ViewId = "today" | "progress";
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

export type VNextExperienceProps = Readonly<{
  progress: ProgressAndGoalsPresentation;
  skillDetails: readonly SkillDetailPresentation[];
  today: TodayWorkoutPresentation;
  goals: GoalControlsPresentation;
  assessment: AssessmentEntryPresentation;
  restrictions: RestrictionPresentation;
  completion?: WorkoutCompletionPresentation;
  workoutStartBlocker?: string;
  resumingWorkout?: boolean;
  busy?: boolean;
  initialView?: ViewId;
  onDemandChange?: (demand: SessionDemand) => void;
  onGoalSelectionChange?: (selection: GoalControlSelection) => void;
  onAssessmentRequested?: (action: AssessmentEntryAction) => void;
  onStartWorkout?: () => void;
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
  resumingWorkout = false,
  busy = false,
  onDemandChange,
  onStartWorkout,
  onWorkoutReviewSubmitted,
  onRestrictionRequested,
  announce,
}: Readonly<Pick<VNextExperienceProps,
  "today" | "restrictions" | "completion" | "onDemandChange" | "onStartWorkout" | "busy"
  | "onWorkoutReviewSubmitted" | "onRestrictionRequested" | "workoutStartBlocker" | "resumingWorkout"> & {
  announce: (message: string) => void;
}>) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const prompts = completion?.prompts ?? [];
  const allAnswered = prompts.length > 0 && prompts.every((prompt) =>
    reviews[prompt.planItemId]?.status !== undefined
      && (!reviews[prompt.planItemId]?.symptomOrInstability
        || Boolean(reviews[prompt.planItemId]?.bodyRegion.trim())));

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
    if (!completion || !allAnswered) return;
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
      <RestrictionNotice presentation={restrictions} onRestrictionRequested={onRestrictionRequested} />

      {today.status === "ready" && today.focus ? (
        <>
          <section className="vnext-today-hero" aria-labelledby="vnext-today-heading">
            <div>
              <p className="vnext-kicker">Today’s focus</p>
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

          <section className="vnext-demand" aria-labelledby="vnext-demand-heading">
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
          </section>

          <section aria-labelledby="vnext-plan-heading">
            <div className="vnext-section-heading">
              <p className="vnext-kicker">Your 25-minute plan</p>
              <h2 id="vnext-plan-heading">Every block has a reason</h2>
            </div>
            <div className="vnext-plan-grid">
              {today.blocks.map((block, index) => (
                <article className="vnext-plan-item" key={block.planItemId}>
                  <span className="vnext-plan-index" aria-hidden="true">{index + 1}</span>
                  <div>
                    <p className="vnext-kicker">{block.blockLabel}</p>
                    <h3>{block.exerciseName}</h3>
                    <p>{block.reason} {block.intensity}</p>
                  </div>
                  <span className="vnext-plan-time">{block.plannedMinutes} min</span>
                </article>
              ))}
            </div>
          </section>

          <p className="vnext-authority">{today.authorityNotice}</p>
          {workoutStartBlocker && <p className="vnext-authority" role="alert">{workoutStartBlocker}</p>}
          <div className="vnext-actions">
            <button
              type="button"
              className="vnext-action"
              disabled={busy || !onStartWorkout}
              onClick={() => {
                onStartWorkout?.();
                announce(resumingWorkout
                  ? "Your exact in-progress workout is ready to resume."
                  : "Today’s vNext workout is ready to start.");
              }}
            >
              {resumingWorkout ? "Resume today’s workout" : "Start today’s workout"}
            </button>
            {completion && completion.prompts.length > 0 && (
              <button
                type="button"
                className="vnext-action"
                data-kind="secondary"
                aria-expanded={reviewOpen}
                disabled={busy}
                onClick={() => setReviewOpen((open) => !open)}
              >
                {reviewOpen ? "Hide workout review" : "Review a completed workout"}
              </button>
            )}
          </div>
        </>
      ) : (
        <section className="vnext-empty" aria-labelledby="vnext-today-heading">
          <h2 id="vnext-today-heading">Today’s safe plan needs an update</h2>
          <p>{today.reason}</p>
          <p>{today.authorityNotice}</p>
        </section>
      )}

      {reviewOpen && completion && (
        <section className="vnext-completion" aria-labelledby="vnext-completion-heading">
          <div className="vnext-section-heading">
            <p className="vnext-kicker">Useful feedback only</p>
            <h2 id="vnext-completion-heading">{completion.title}</h2>
            <p>{completion.intro}</p>
          </div>
          {completion.prompts.map((prompt) => {
            const draft = reviews[prompt.planItemId] ?? {
              symptomOrInstability: false,
              bodyRegion: "",
              modificationReason: "",
            };
            return (
              <article className="vnext-review-item" key={prompt.planItemId}>
                <div><p className="vnext-kicker">{prompt.purposeLabel}</p><h3>{prompt.exerciseName}</h3></div>
                <fieldset>
                  <legend>{prompt.statusPrompt}</legend>
                  <div className="vnext-radio-row">
                    {prompt.statusOptions.map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name={`status-${prompt.planItemId}`}
                          value={option.value}
                          checked={draft.status === option.value}
                          onChange={() => updateReview(prompt.planItemId, {
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
                {prompt.asksDifficulty && draft.status && draft.status !== "skipped" && (
                  <fieldset>
                    <legend>How difficult was it?</legend>
                    <div className="vnext-radio-row">
                      {prompt.difficultyOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            type="radio"
                            name={`difficulty-${prompt.planItemId}`}
                            value={option.value}
                            checked={draft.difficulty === option.value}
                            onChange={() => updateReview(prompt.planItemId, { difficulty: option.value })}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {draft.status === "modified" && (
                  <label>
                    <span className="vnext-kicker">What changed?</span>
                    <textarea
                      className="vnext-modification"
                      value={draft.modificationReason}
                      onChange={(event) => updateReview(prompt.planItemId, { modificationReason: event.target.value })}
                      placeholder="For example: less range, more assistance or a shorter dose"
                    />
                  </label>
                )}
                {draft.status && draft.status !== "skipped" && (
                  <div>
                    <label className="vnext-symptom-label">
                      <input
                        type="checkbox"
                        checked={draft.symptomOrInstability}
                        onChange={(event) => updateReview(prompt.planItemId, {
                          symptomOrInstability: event.target.checked,
                          ...(!event.target.checked ? { bodyRegion: "" } : {}),
                        })}
                      />
                      {prompt.painPrompt}
                    </label>
                    {draft.symptomOrInstability && (
                      <label>
                        <span className="vnext-kicker">Affected area</span>
                        <input
                          value={draft.bodyRegion}
                          onChange={(event) => updateReview(prompt.planItemId, { bodyRegion: event.target.value })}
                          placeholder="For example: left wrist"
                          required
                        />
                      </label>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          <p className="vnext-authority">{completion.authorityNotice}</p>
          <div className="vnext-actions">
            <button
              type="button"
              className="vnext-submit"
              disabled={busy || !allAnswered || !onWorkoutReviewSubmitted}
              onClick={submitReview}
            >
              Save review with workout
            </button>
            {onRestrictionRequested && (
              <button type="button" className="vnext-action" data-kind="secondary" onClick={onRestrictionRequested}>
                Report pain or a new restriction
              </button>
            )}
          </div>
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
  completion,
  workoutStartBlocker,
  resumingWorkout = false,
  busy = false,
  initialView = "today",
  onDemandChange,
  onGoalSelectionChange,
  onAssessmentRequested,
  onStartWorkout,
  onWorkoutReviewSubmitted,
  onRestrictionRequested,
}: VNextExperienceProps) => {
  const [view, setView] = useState<ViewId>(initialView);
  const [statusMessage, setStatusMessage] = useState("Today’s safe vNext plan is ready to review.");
  const announce = (message: string) => setStatusMessage(message);
  const changeView = (next: ViewId) => {
    setView(next);
    announce(next === "today" ? "Today’s Workout opened." : "Progress & Goals opened.");
  };

  return (
    <main className="vnext-experience" aria-labelledby="vnext-app-title">
      <div className="vnext-shell">
        <header className="vnext-header">
          <div>
            <p className="vnext-kicker">Parallette25 vNext</p>
            <h1 id="vnext-app-title">Train what matters, at the step that fits.</h1>
            <p>Goals set the direction. Demonstrated evidence and current context keep each session safe and useful.</p>
          </div>
          <nav className="vnext-nav" aria-label="vNext training sections">
            <button type="button" aria-pressed={view === "today"} onClick={() => changeView("today")}>Today</button>
            <button type="button" aria-pressed={view === "progress"} onClick={() => changeView("progress")}>Progress &amp; Goals</button>
          </nav>
        </header>
        <p className="vnext-live-status" role="status" aria-live="polite">{statusMessage}</p>
        {view === "today" ? (
          <TodayView
            today={today}
            restrictions={restrictions}
            completion={completion}
            workoutStartBlocker={workoutStartBlocker}
            resumingWorkout={resumingWorkout}
            busy={busy}
            onDemandChange={onDemandChange}
            onStartWorkout={onStartWorkout}
            onWorkoutReviewSubmitted={onWorkoutReviewSubmitted}
            onRestrictionRequested={onRestrictionRequested}
            announce={announce}
          />
        ) : (
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
        )}
      </div>
    </main>
  );
};
