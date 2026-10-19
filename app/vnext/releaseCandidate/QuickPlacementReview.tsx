import { useState } from "react";
import type { AssessmentDraft, AssessmentReview, BenchmarkMetric, DefinitionBundle, GuidedTestOffer } from "../index";
import { guidedTestPresentation } from "../assessment/presentation";
import { VNextMotionGuide } from "../media/VNextMotionGuide";
import "./quickPlacementReview.css";

export type QuickPlacementReviewProps = Readonly<{
  draft: AssessmentDraft;
  bundle: DefinitionBundle;
  review: AssessmentReview;
  busy?: boolean;
  onCommit: () => void;
  onGuidedTestRequested?: (offer: GuidedTestOffer) => void;
}>;

const targetLabel = (metric: BenchmarkMetric): string => {
  if (metric.kind === "duration-seconds" || metric.kind === "repetitions") {
    const unit = metric.kind === "duration-seconds" ? "seconds" : "reps";
    return metric.maximum === metric.minimum ? `${metric.minimum} ${unit}`
      : metric.maximum === undefined ? `At least ${metric.minimum} ${unit}`
        : `${metric.minimum}–${metric.maximum} ${unit}`;
  }
  if (metric.kind === "successful-attempts") return `${metric.minimumSuccessful} successful attempts in up to ${metric.maximumAttempts} tries`;
  return metric.description;
};

const blockerLabel = (blocker: string): string => ({
  "missing-equipment": "This check needs different equipment. Update your equipment or choose a movement you can practise with what you have.",
  "active-restriction": "Your current restriction affects this movement. Continue with unaffected practice or return when the restriction is resolved.",
  "inversion-not-familiar": "Build comfort with supported upside-down practice before this check.",
  "reacclimation-required": "After time away, rebuild comfort and control before this check.",
  "prerequisite-confirmation-needed": "An earlier readiness check still needs confirmation before this movement.",
  "placement-prerequisite-check-needed": "Complete the earlier readiness checks before this movement.",
  "check-another-day": "This check needs another occasion. Rest and return on a different day.",
  "exit-confirmation-needed": "Confirm the safe way out before trying this movement.",
  "specialist-opt-in-required": "This check needs specialist guidance and an explicit choice to include specialist training.",
}[blocker] ?? "Complete the earlier safety and readiness checks before this movement.");

const CheckPreview = ({ offer, bundle, busy, onOpen, optional = false }: Readonly<{
  offer: GuidedTestOffer;
  bundle: DefinitionBundle;
  busy: boolean;
  onOpen?: (offer: GuidedTestOffer) => void;
  optional?: boolean;
}>) => {
  const test = guidedTestPresentation(offer, bundle);
  const media = test.exercise.media.find((item) => item.kind === "motion")?.reference ?? test.exercise.media[0]?.reference;
  if (!media) throw new TypeError(`${test.exercise.name} has no renderable movement guide`);
  const available = offer.availability === "available";
  return <article className="vnext-quick-check" aria-label={`${test.exercise.name} check`}>
    <div className="vnext-quick-check-heading">
      <p className="vnext-kicker">{!available ? "Future check" : optional ? "Optional next check" : "Start here"}</p>
      <h2>{test.exercise.name}</h2>
      <p className="vnext-quick-check-target"><strong>{targetLabel(test.metric)}</strong></p>
    </div>
    <div className="vnext-quick-check-motion" aria-label={`${test.exercise.name} movement demonstration`}>
      <VNextMotionGuide preset={media} />
    </div>
    <div className="vnext-quick-check-copy">
      <p>{test.exercise.instructions.how}</p>
      {available ? <>
        <p className="vnext-help">{optional
          ? "Only continue if comfortable and recovered. Rest first; you can finish for today."
          : "Warm up first. Stop if uncomfortable. The next screen guides the check."}</p>
        <button type="button" className={optional ? "vnext-action" : "vnext-submit"} data-kind={optional ? "secondary" : undefined}
          disabled={busy || !onOpen} onClick={() => onOpen?.(offer)}>{optional ? "Continue checks" : "Start checks"}</button>
      </> : <div className="vnext-quick-check-blocked">
        <strong>Not ready to check today</strong>
        {offer.blockers.map((blocker) => <p key={blocker}>{blockerLabel(blocker)}</p>)}
      </div>}
      <details className="vnext-quick-review-details">
        <summary>Technique &amp; safety</summary>
        <div>
          <p><strong>Assistance:</strong> {test.conditions.assistance}</p>
          <p><strong>Range:</strong> {test.conditions.range}</p>
          <ul>{test.exercise.instructions.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
          <p><strong>A clean result means:</strong></p>
          <ul>{test.qualityCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
          <p><strong>Safety:</strong></p>
          <ul>{test.safetyCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
          {test.exercise.safetyNotes.length > 0 && <ul>{test.exercise.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul>}
        </div>
      </details>
    </div>
  </article>;
};

const OtherCheck = ({ offer, bundle, busy, onOpen }: Readonly<{
  offer: GuidedTestOffer;
  bundle: DefinitionBundle;
  busy: boolean;
  onOpen?: (offer: GuidedTestOffer) => void;
}>) => {
  const [expanded, setExpanded] = useState(false);
  return <details className="vnext-quick-review-details" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>{guidedTestPresentation(offer, bundle).exercise.name}{offer.availability === "blocked" ? " · Not ready today" : ""}</summary>
    {expanded && <div><CheckPreview offer={offer} bundle={bundle} busy={busy} onOpen={onOpen} optional /></div>}
  </details>;
};

export const QuickPlacementReview = ({ draft, bundle, review, busy = false, onCommit, onGuidedTestRequested }: QuickPlacementReviewProps) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const checked = review.checkedToday ?? [];
  const hasSavedChecks = checked.length > 0;
  const recommended = review.checksComplete ? undefined : review.guidedTests.find((offer) => offer.availability === "available");
  const otherChecks = review.guidedTests.filter((offer) => offer !== recommended);
  const firstBlocked = otherChecks.find((offer) => offer.availability === "blocked");
  const goalAnswer = draft.answers.find((answer) => answer.value.kind === "goals")?.value;
  const goals = goalAnswer?.kind === "goals" ? goalAnswer.graphIds : [
    ...draft.intentSeed.goals.filter((goal) => goal.priority === "primary"),
    ...draft.intentSeed.goals.filter((goal) => goal.priority === "secondary"),
  ].map((goal) => goal.graphId);
  const goalLabel = (id: string): string => bundle.graphs.find((graph) => graph.id === id)?.label ?? "Saved goal";

  return <div className="vnext-quick-placement-review">
    {hasSavedChecks && <>
      <section className="vnext-quick-check-results" aria-labelledby="vnext-quick-check-results-title">
        <h2 id="vnext-quick-check-results-title">Checks saved</h2>
        <ul>{checked.map((check, index) => <li key={`${check.label}:${index}`}>
          <strong>{check.label}</strong>
          <span>{check.result} · {check.target}</span>
        </li>)}</ul>
      </section>
      {(review.nextPracticeLabels?.length ?? 0) > 0 && <div className="vnext-quick-starting-practice">
        <p><strong>Your starting practice</strong></p>
        <p>{review.nextPracticeLabels!.join(", ")}</p>
        <p className="vnext-help">Used when recovered and safe to practise. Further confirmations still apply.</p>
      </div>}
      <p className="vnext-help">Demanding checks count as today’s training. You don’t need another full workout.</p>
      <button type="button" className="vnext-submit" disabled={busy} onClick={onCommit}>Finish for today</button>
    </>}

    {review.checksComplete && <p className="vnext-quick-review-status" role="status">Your selected starting skills are checked.</p>}

    {!hasSavedChecks && recommended && <p className="vnext-help">Your answers suggest a starting point. We’ll use one check at a time to confirm useful practice.</p>}
    {recommended && <CheckPreview offer={recommended} bundle={bundle} busy={busy} onOpen={onGuidedTestRequested} optional={hasSavedChecks} />}

    {!recommended && !review.checksComplete && <p className="vnext-quick-review-status" role="status">{firstBlocked?.blockers.length
      ? blockerLabel(firstBlocked.blockers[0]!)
      : "No further check is available now. Continue with your current safe practice and review your starting point later."}</p>}
    {!hasSavedChecks && !recommended && <button type="button" className="vnext-submit" disabled={busy} onClick={onCommit}>
      {review.checksComplete ? "See my workout" : "Continue to my workout"}
    </button>}

    <details className="vnext-quick-review-details vnext-quick-other-checks" onToggle={(event) => setDetailsExpanded(event.currentTarget.open)}>
      <summary>{otherChecks.length > 0 ? "Other checks & goals" : "Goals & details"}</summary>
      {detailsExpanded && <div>
        {goals.length > 0 && <p><strong>Main goal:</strong> {goalLabel(goals[0]!)}</p>}
        {goals.length > 1 && <p><strong>Supporting goals:</strong> {goals.slice(1).map(goalLabel).join(", ")}</p>}
        <p className="vnext-help">Choosing a movement does not mark it as achieved. Advanced skills keep their full safety and confirmation checks.</p>
        {otherChecks.map((offer) => <OtherCheck key={offer.protocolId} offer={offer} bundle={bundle} busy={busy} onOpen={onGuidedTestRequested} />)}
        {!hasSavedChecks && recommended && <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onCommit}>Check later — see my workout</button>}
      </div>}
    </details>
  </div>;
};
