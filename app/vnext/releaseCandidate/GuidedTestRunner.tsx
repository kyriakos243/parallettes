import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DefinitionBundle,
  GuidedTestOffer,
  ObservationMeasurement,
} from "../index";
import { guidedTestPresentation } from "../assessment/presentation";
import { VNextMotionGuide } from "../media/VNextMotionGuide";
import { useWorkoutClock } from "./useWorkoutClock";
import { createGuidedTimerAudio } from "./guidedTimerAudio";
import "./quickGuided.css";

export type GuidedTestFormResult = Readonly<{
  outcome: "clean" | "partial" | "not-yet" | "symptom";
  measurement?: ObservationMeasurement;
  perceivedExertion?: number;
  qualityCriteriaSatisfied: boolean;
  safetyCriteriaSatisfied: boolean;
  notes?: string;
}>;

type GuidedTestRunnerProps = Readonly<{
  offer: GuidedTestOffer;
  bundle: DefinitionBundle;
  busy?: boolean;
  error?: string;
  retryingExactObservation?: boolean;
  hasSavedChecks?: boolean;
  initialResult?: GuidedTestFormResult;
  onCorrectInvalidEntry?: () => void;
  /** Clear only local pending recovery; never remove an already saved observation. */
  onDiscardUnsavedResult?: () => void;
  /** Explicitly no physical attempt: finish locally without performance evidence. */
  onNoAttempt?: () => void;
  onCommit: (result: GuidedTestFormResult) => void;
  onClose: () => void;
}>;

const GuidedTestForm = ({
  offer,
  bundle,
  busy = false,
  error,
  retryingExactObservation = false,
  hasSavedChecks = false,
  initialResult,
  onCorrectInvalidEntry,
  onDiscardUnsavedResult,
  onNoAttempt,
  onCommit,
  onClose,
}: GuidedTestRunnerProps) => {
  const presentation = useMemo(() => guidedTestPresentation(offer, bundle), [offer, bundle]);
  const [differentResult, setDifferentResult] = useState(Boolean(initialResult));
  const [outcome, setOutcome] = useState<GuidedTestFormResult["outcome"] | undefined>(initialResult?.outcome);
  const [measurementValue, setMeasurementValue] = useState(initialResult?.measurement ? String(initialResult.measurement.value) : "");
  const [attemptsTotal, setAttemptsTotal] = useState(initialResult?.measurement?.attemptsTotal === undefined ? "" : String(initialResult.measurement.attemptsTotal));
  const [exertion, setExertion] = useState(initialResult?.perceivedExertion === undefined ? "" : String(initialResult.perceivedExertion));
  const [notes, setNotes] = useState(initialResult?.notes ?? "");
  const [discardConfirmation, setDiscardConfirmation] = useState(false);
  const [noAttempt, setNoAttempt] = useState(false);
  const noAttemptRequested = useRef(false);
  const discardRequested = useRef(false);
  useEffect(() => { if (!busy) { discardRequested.current = false; noAttemptRequested.current = false; } }, [busy, error]);
  type HoldTimer = Readonly<{ stage: "idle" | "ready" | "holding" | "complete" | "interrupted"; remaining: number; run: number }>;
  const [holdTimer, setHoldTimer] = useState<HoldTimer>({ stage: "idle", remaining: 0, run: 0 });
  const [soundOn, setSoundOn] = useState(false);
  const [soundUnavailable, setSoundUnavailable] = useState(false);
  const holdAudio = useMemo(createGuidedTimerAudio, []);
  useEffect(() => {
    const hide = (): void => { if (document.visibilityState !== "visible") holdAudio.cancel(); };
    const cancel = (): void => holdAudio.cancel();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", cancel);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", cancel);
      holdAudio.dispose();
    };
  }, [holdAudio]);
  const holdTimerRef = useRef(holdTimer);
  const changeHoldTimer = (next: HoldTimer): void => {
    holdTimerRef.current = next;
    setHoldTimer(next);
  };
  const metric = presentation.metric;
  const holdClock = useWorkoutClock({
    running: (holdTimer.stage === "ready" || holdTimer.stage === "holding") && !busy && !retryingExactObservation,
    intervalKey: holdTimer.run,
    onSeconds: (seconds) => {
      const current = holdTimerRef.current;
      if (metric.kind !== "duration-seconds" || (current.stage !== "ready" && current.stage !== "holding")) return;
      const remaining = Math.max(0, current.remaining - seconds);
      if (remaining > 0) {
        changeHoldTimer({ ...current, remaining });
      } else {
        // Start a fresh interval at the end of preparation. No preparation time
        // or queued callback can count toward the continuous hold itself.
        holdClock.stop();
        if (soundOn && !holdAudio.play(current.stage === "ready" ? "start" : "finish")) setSoundUnavailable(true);
        changeHoldTimer({
          stage: current.stage === "ready" ? "holding" : "complete",
          remaining: current.stage === "ready" ? metric.minimum : 0,
          run: current.run + 1,
        });
      }
    },
    onAutoPause: () => {
      holdAudio.cancel();
      const current = holdTimerRef.current;
      changeHoldTimer({ stage: "interrupted", remaining: 0, run: current.run + 1 });
    },
  });
  const stopHoldTimer = (): void => {
    holdClock.stop();
    holdAudio.cancel();
    changeHoldTimer({ stage: "interrupted", remaining: 0, run: holdTimerRef.current.run + 1 });
  };
  const needsMeasurement = metric.kind === "duration-seconds"
    || metric.kind === "repetitions"
    || metric.kind === "successful-attempts";
  const isAttempts = metric.kind === "successful-attempts";
  const measurement = (): ObservationMeasurement | undefined => {
    if (!needsMeasurement || measurementValue.trim() === "") return undefined;
    const value = Number(measurementValue);
    if (!Number.isFinite(value) || value < 0) return undefined;
    if (metric.kind === "duration-seconds") return { value, unit: "seconds" };
    if (!Number.isSafeInteger(value)) return undefined;
    if (metric.kind === "repetitions") return { value, unit: "repetitions" };
    const total = Number(attemptsTotal);
    return attemptsTotal.trim() !== "" && Number.isSafeInteger(total) && total >= 1 && total >= value
      ? { value, unit: "attempts", attemptsTotal: total }
      : undefined;
  };
  const exactMeasurement = measurement();
  const hasMeasurementInput = measurementValue.trim() !== "" || (isAttempts && attemptsTotal.trim() !== "");
  const measurementIsValid = !needsMeasurement || !hasMeasurementInput || exactMeasurement !== undefined;
  const measurementPasses = !needsMeasurement || (exactMeasurement !== undefined && (
    metric.kind === "duration-seconds" || metric.kind === "repetitions"
      ? exactMeasurement.value >= metric.minimum
        && (metric.maximum === undefined || exactMeasurement.value <= metric.maximum)
      : metric.kind === "successful-attempts"
        ? exactMeasurement.value >= metric.minimumSuccessful
          && exactMeasurement.attemptsTotal !== undefined
          && exactMeasurement.attemptsTotal <= metric.maximumAttempts
        : true
  ));
  const targetMeasurement: ObservationMeasurement | undefined = metric.kind === "duration-seconds"
    ? { value: metric.minimum, unit: "seconds" }
    : metric.kind === "repetitions" ? { value: metric.minimum, unit: "repetitions" } : undefined;
  const targetLabel = metric.kind === "duration-seconds"
    ? `${metric.minimum} seconds`
    : metric.kind === "repetitions" ? `${metric.minimum} reps` : "the shown target";
  const metricRequirement = metric.kind === "duration-seconds"
    ? `${metric.minimum}${metric.maximum === undefined ? "" : `–${metric.maximum}`} seconds`
    : metric.kind === "repetitions"
      ? `${metric.minimum}${metric.maximum === undefined ? "" : `–${metric.maximum}`} reps`
      : metric.kind === "successful-attempts"
        ? `${metric.minimumSuccessful} successful attempts within ${metric.maximumAttempts} total attempts`
        : metric.description;
  const exactResultLabel = metric.kind === "duration-seconds"
    ? `I held exactly ${metric.minimum} seconds cleanly`
    : metric.kind === "repetitions"
      ? `I did exactly ${metric.minimum} clean reps`
      : "I met this target cleanly";
  const locked = busy || retryingExactObservation;
  const canSave = !busy && offer.availability === "available";
  const exertionValue = Number(exertion);
  const optionalInputValid = exertion.trim() === ""
    || (Number.isFinite(exertionValue) && exertionValue >= 1 && exertionValue <= 10);
  const saveResult = (
    resultOutcome: GuidedTestFormResult["outcome"],
    resultMeasurement?: ObservationMeasurement,
  ): void => {
    holdClock.stop();
    holdAudio.cancel();
    if (holdTimerRef.current.stage === "ready" || holdTimerRef.current.stage === "holding") {
      changeHoldTimer({ stage: "interrupted", remaining: 0, run: holdTimerRef.current.run + 1 });
    }
    onCommit({
      outcome: resultOutcome,
      ...(resultMeasurement ? { measurement: resultMeasurement } : {}),
      ...(exertion.trim() !== "" && optionalInputValid ? { perceivedExertion: exertionValue } : {}),
      // Only a clean-result action explicitly attests to every displayed criterion.
      qualityCriteriaSatisfied: resultOutcome === "clean",
      safetyCriteriaSatisfied: resultOutcome === "clean",
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };
  const equipmentLabel = presentation.conditions.equipment
    .map((item) => item.split(":").at(-1)!.replaceAll("-", " "))
    .join(", ");
  const mediaReference = presentation.exercise.media.find((item) => item.kind === "motion")?.reference
    ?? presentation.exercise.media[0]?.reference;
  if (!mediaReference) throw new TypeError(`${presentation.exercise.name} has no renderable movement guide`);

  const measuredFields = (
    <div className="vnext-rc-field-row">
      <label>
        <span>{metric.kind === "duration-seconds" ? "Seconds completed" : metric.kind === "repetitions" ? "Reps completed" : "Successful attempts"}</span>
        <input
          type="number"
          min={0}
          step={metric.kind === "duration-seconds" ? "any" : "1"}
          inputMode={metric.kind === "duration-seconds" ? "decimal" : "numeric"}
          value={measurementValue}
          disabled={locked}
          onChange={(event) => setMeasurementValue(event.target.value)}
        />
      </label>
      {isAttempts && (
        <label>
          <span>Total attempts</span>
          <input type="number" min={1} step="1" inputMode="numeric" value={attemptsTotal} disabled={locked} onChange={(event) => setAttemptsTotal(event.target.value)} />
        </label>
      )}
    </div>
  );

  return (
    <main className="vnext-experience vnext-rc-overlay vnext-quick-guided" aria-labelledby="vnext-guided-title">
      <section className="vnext-rc-modal">
        <div className="vnext-rc-modal-header">
          <div>
            <p className="vnext-kicker">Starting-point check</p>
            <h1 id="vnext-guided-title">{presentation.exercise.name}</h1>
          </div>
          <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => { holdClock.stop(); holdAudio.cancel(); onClose(); }}>Back</button>
        </div>

        {hasSavedChecks && !retryingExactObservation && <p className="vnext-help" role="status">Previous check saved. Rest before continuing. Back returns to your results so you can finish for today.</p>}

        <section className="vnext-rc-question-movement" aria-label={`${presentation.exercise.name} movement demonstration`}>
          <div className="vnext-rc-question-motion">
            <VNextMotionGuide preset={mediaReference} />
          </div>
          <div className="vnext-rc-question-copy">
            <p className="vnext-quick-guided-target"><span>Target</span><strong>{metricRequirement}</strong></p>
            <p>{presentation.exercise.instructions.how}</p>
            {metric.kind === "duration-seconds" && !retryingExactObservation && (
              <div className="vnext-quick-guided-timer" aria-label="Optional hold timer">
                <button type="button" className="vnext-action" data-kind="secondary" aria-pressed={soundOn} disabled={busy} onClick={() => {
                  if (soundOn) { holdAudio.cancel(); setSoundOn(false); setSoundUnavailable(false); }
                  else { const available = holdAudio.prepare(); setSoundOn(available); setSoundUnavailable(!available); }
                }}>Timer sound {soundOn ? "on" : "off"}</button>
                {soundOn && <p className="vnext-help">One beep starts the hold; two beeps finish it.</p>}
                {soundUnavailable && <p className="vnext-help" role="status">Sound is unavailable. Follow the onscreen timer.</p>}
                {holdTimer.stage === "ready" || holdTimer.stage === "holding" ? (
                  <>
                    <p role="status">{holdTimer.stage === "ready" ? "Get ready. The hold starts after the countdown." : "Start holding now."}</p>
                    <p role="timer" aria-live="off" aria-label={holdTimer.stage === "ready" ? "Get ready countdown" : "Hold time remaining"}>
                      <span>{holdTimer.stage === "ready" ? "Get ready" : "Hold"}</span><strong>{holdTimer.remaining}s</strong>
                    </p>
                    <button type="button" className="vnext-action" data-kind="secondary" onClick={stopHoldTimer}>Stop timer</button>
                  </>
                ) : (
                  <>
                    {holdTimer.stage === "complete" && <p role="status">Timer finished. Only confirm below if you held continuously and met every technique and safety point.</p>}
                    {holdTimer.stage === "interrupted" && <p role="status">Timer stopped. Nothing was saved. Use your own measured result, or restart later when rested. Interrupted time cannot be added together.</p>}
                    <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || offer.availability !== "available"} onClick={() => {
                      holdClock.stop();
                      holdAudio.cancel();
                      if (soundOn) setSoundUnavailable(!holdAudio.prepare());
                      changeHoldTimer({ stage: "ready", remaining: 3, run: holdTimerRef.current.run + 1 });
                    }}>{holdTimer.stage === "idle" ? `Use ${metric.minimum}-second timer` : "Start a new timer"}</button>
                    {holdTimer.stage === "idle" && <p className="vnext-help">Optional · 3 seconds to get ready. Stops if you leave the app. Time alone never saves a result.</p>}
                  </>
                )}
              </div>
            )}
            <p className="vnext-quick-guided-prepare">Warm up first. Rest between checks. Stop for pain, symptoms, instability or loss of control; continue later if tired.</p>
            <dl className="vnext-quick-guided-conditions">
              <div><dt>Equipment</dt><dd>{equipmentLabel || "No additional equipment"}</dd></div>
              <div><dt>Assistance</dt><dd>{presentation.conditions.assistance}</dd></div>
              <div><dt>Range</dt><dd>{presentation.conditions.range}</dd></div>
            </dl>
            <section className="vnext-quick-guided-criteria" aria-label="Technique and safety to confirm">
              <h2>Keep it clean and safe</h2>
              <ul>{[...new Set([...presentation.qualityCriteria, ...presentation.safetyCriteria])].map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
              {presentation.exercise.safetyNotes.length > 0 && <p>{presentation.exercise.safetyNotes.join(" ")}</p>}
            </section>
          </div>
        </section>

        <div className="vnext-rc-anchor vnext-rc-guided-form vnext-quick-guided-result">
          <h2>How did it go?</h2>
          {error && <p className="vnext-authority" role="alert">{onCorrectInvalidEntry ? "The saved entry needs a valid total attempt count. Use Correct saved entry below." : error} Your entry is kept. You do not need to repeat the check.</p>}
          {initialResult && <p className="vnext-help">Correct the numbers from your original check. Nothing changes until you save. You do not need to perform it again.</p>}
          {retryingExactObservation ? (
            <>
              <p>{onCorrectInvalidEntry ? "An older saved entry has a missing or invalid total attempt count. Review the entry to correct it." : "Your original result is ready to save. You do not need to fill this in again."}</p>
              {onCorrectInvalidEntry && <button type="button" className="vnext-submit" disabled={busy} onClick={onCorrectInvalidEntry}>Correct saved entry</button>}
              {!onCorrectInvalidEntry && <button type="button" className="vnext-submit" disabled={busy} onClick={() => {
                // The coordinator ignores fresh form values while retrying and reuses its exact prepared observation.
                saveResult(outcome ?? "not-yet", exactMeasurement);
              }}>{busy ? "Saving…" : "Retry saving this result"}</button>}
              {onDiscardUnsavedResult && (discardConfirmation ? (
                <section className="vnext-quick-guided-discard" aria-labelledby="vnext-guided-discard-title" role="alert">
                  <h3 id="vnext-guided-discard-title">Discard this pending result?</h3>
                  <p>This removes the pending entry from this device. An unsaved result will not count toward progress. Any result already saved stays in your progress.</p>
                  <p>You can then update your restriction feedback or return to Today.</p>
                  <div className="vnext-actions">
                    <button type="button" className="vnext-action" autoFocus disabled={busy} onClick={() => setDiscardConfirmation(false)}>Keep result</button>
                    <button type="button" className="vnext-action vnext-quick-guided-stop" data-kind="secondary" disabled={busy} onClick={() => {
                      if (discardRequested.current) return;
                      discardRequested.current = true;
                      holdClock.stop();
                      holdAudio.cancel();
                      onDiscardUnsavedResult();
                    }}>Discard pending result</button>
                  </div>
                </section>
              ) : <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => setDiscardConfirmation(true)}>Discard unsaved result…</button>)}
            </>
          ) : (
            <>
              {!differentResult && (
                <>
                  {isAttempts && measuredFields}
                  <p id="vnext-guided-attestation" className="vnext-help">
                    {isAttempts
                      ? "Enter both counts, then confirm that every technique and safety point above was met."
                      : `Tap below only if you completed ${targetMeasurement ? `exactly ${targetLabel}` : targetLabel} and met every technique and safety point above. Use Different result for anything else.`}
                  </p>
                  <button
                    type="button"
                    className="vnext-submit"
                    aria-describedby="vnext-guided-attestation"
                    disabled={!canSave || !optionalInputValid || (isAttempts && !measurementPasses)}
                    onClick={() => saveResult("clean", isAttempts ? exactMeasurement : targetMeasurement)}
                  >{busy ? "Saving…" : isAttempts ? "Both counts are correct and clean — save" : exactResultLabel}</button>
                  <button type="button" className="vnext-action" data-kind="secondary" disabled={locked} onClick={() => {
                    if (holdTimerRef.current.stage === "ready" || holdTimerRef.current.stage === "holding") stopHoldTimer();
                    setDifferentResult(true);
                  }}>Different result / not completed</button>
                  <button type="button" className="vnext-action vnext-quick-guided-stop" data-kind="secondary" disabled={!canSave} onClick={() => saveResult("symptom")}>Pain or instability — I stopped</button>
                </>
              )}
              {differentResult && (
                <>
                  {noAttempt && onNoAttempt ? <>
                    <p className="vnext-help">You did not try this check. No result, training load or change to your progress will be saved.</p>
                    <button type="button" className="vnext-submit" disabled={locked} onClick={() => {
                      if (locked || noAttemptRequested.current) return;
                      noAttemptRequested.current = true;
                      holdClock.stop();
                      holdAudio.cancel();
                      onNoAttempt();
                    }}>Finish without a result</button>
                    <button type="button" className="vnext-action" data-kind="secondary" disabled={locked} onClick={() => setNoAttempt(false)}>Enter an attempted result</button>
                  </> : <>
                  {needsMeasurement && measuredFields}
                  {onNoAttempt && <button type="button" className="vnext-action" data-kind="secondary" disabled={locked} onClick={() => setNoAttempt(true)}>No attempt made</button>}
                  <fieldset disabled={locked}>
                    <legend>Your result</legend>
                    <div className="vnext-rc-answer-grid">
                      {([
                        ["clean", "Clean — all technique and safety points met"],
                        ["partial", "Partial or inconsistent"],
                        ["not-yet", "Not yet"],
                        ["symptom", "Symptoms or instability — stopped"],
                      ] as const).map(([value, label]) => (
                        <label className="vnext-rc-choice" key={value}><input type="radio" name="guided-outcome" checked={outcome === value} onChange={() => setOutcome(value)} /><span>{label}</span></label>
                      ))}
                    </div>
                  </fieldset>
                  {outcome === "clean" && <p className="vnext-help">Saving confirms these are your actual results and every technique and safety point above was met.</p>}
                  {outcome === "clean" && !measurementPasses && <p className="vnext-help">Enter a result that meets the shown target, or choose Partial / Not yet.</p>}
                  {hasMeasurementInput && !measurementIsValid && <p className="vnext-help">Check your numbers.{isAttempts ? " Use whole counts and at least 1 total attempt. Successes cannot exceed total attempts. If you did not try it, choose No attempt made." : " Use a non-negative number."}</p>}
                  <button
                    type="button"
                    className="vnext-submit"
                    disabled={!canSave || !outcome || !measurementIsValid || !optionalInputValid || (outcome === "clean" && !measurementPasses)}
                    onClick={() => { if (outcome) saveResult(outcome, exactMeasurement); }}
                  >{busy ? "Saving…" : initialResult ? "Save corrected entry" : outcome === "clean" ? "Confirm clean result" : "Save result"}</button>
                  {!initialResult && <button type="button" className="vnext-action" data-kind="secondary" disabled={locked} onClick={() => setDifferentResult(false)}>Back to quick result</button>}
                  </>}
                </>
              )}
              <details className="vnext-quick-guided-details">
                <summary>Add a note or effort (optional)</summary>
                <div className="vnext-rc-field-row">
                  <label><span>Effort, 1–10</span><input type="number" min="1" max="10" step="1" inputMode="numeric" value={exertion} disabled={locked} onChange={(event) => setExertion(event.target.value)} /></label>
                  <label><span>Note</span><input value={notes} disabled={locked} onChange={(event) => setNotes(event.target.value)} /></label>
                </div>
                {!optionalInputValid && <p className="vnext-help">Use an effort from 1 to 10, or leave it blank.</p>}
              </details>
            </>
          )}
          <details className="vnext-quick-guided-details">
            <summary>More technique tips &amp; what this check means</summary>
            <ul>{presentation.exercise.instructions.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
            <p className="vnext-help">Full confirmation needs {presentation.confirmation.qualifyingObservations} clean result{presentation.confirmation.qualifyingObservations === 1 ? "" : "s"} across at least {presentation.confirmation.minimumDistinctSessions} separate session{presentation.confirmation.minimumDistinctSessions === 1 ? "" : "s"}.{presentation.confirmation.minimumDistinctSessions > 1 ? " Repeating it now does not replace a check on another occasion." : ""}</p>
          </details>
        </div>
      </section>
    </main>
  );
};

// Automatic next-check navigation must never carry the previous check's form values forward.
export const GuidedTestRunner = (props: GuidedTestRunnerProps) => <GuidedTestForm key={`${props.offer.protocolId}:${props.initialResult ? "correct" : "result"}`} {...props} />;
