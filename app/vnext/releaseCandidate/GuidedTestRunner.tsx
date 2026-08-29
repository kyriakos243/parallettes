import { useMemo, useState } from "react";
import type {
  DefinitionBundle,
  GuidedTestOffer,
  ObservationMeasurement,
} from "../index";
import { guidedTestPresentation } from "../assessment/presentation";

export type GuidedTestFormResult = Readonly<{
  outcome: "clean" | "partial" | "not-yet" | "symptom";
  measurement?: ObservationMeasurement;
  perceivedExertion?: number;
  qualityCriteriaSatisfied: boolean;
  safetyCriteriaSatisfied: boolean;
  notes?: string;
}>;

export const GuidedTestRunner = ({
  offer,
  bundle,
  busy = false,
  error,
  retryingExactObservation = false,
  onCommit,
  onClose,
}: Readonly<{
  offer: GuidedTestOffer;
  bundle: DefinitionBundle;
  busy?: boolean;
  error?: string;
  retryingExactObservation?: boolean;
  onCommit: (result: GuidedTestFormResult) => void;
  onClose: () => void;
}>) => {
  const presentation = useMemo(() => guidedTestPresentation(offer, bundle), [offer, bundle]);
  const [outcome, setOutcome] = useState<GuidedTestFormResult["outcome"]>("not-yet");
  const [measurementValue, setMeasurementValue] = useState("");
  const [attemptsTotal, setAttemptsTotal] = useState("");
  const [quality, setQuality] = useState(false);
  const [safety, setSafety] = useState(false);
  const [exertion, setExertion] = useState("");
  const [notes, setNotes] = useState("");
  const metric = presentation.metric;
  const needsMeasurement = metric.kind === "duration-seconds"
    || metric.kind === "repetitions"
    || metric.kind === "successful-attempts";
  const parsedMeasurement = Number(measurementValue);
  const parsedAttempts = Number(attemptsTotal);
  const measurement = (): ObservationMeasurement | undefined => {
    if (!needsMeasurement || !Number.isFinite(parsedMeasurement) || parsedMeasurement < 0) return undefined;
    if (metric.kind === "duration-seconds") return { value: parsedMeasurement, unit: "seconds" };
    if (metric.kind === "repetitions") return { value: parsedMeasurement, unit: "repetitions" };
    return Number.isSafeInteger(parsedMeasurement) && Number.isSafeInteger(parsedAttempts)
      ? { value: parsedMeasurement, unit: "attempts", attemptsTotal: parsedAttempts }
      : undefined;
  };
  const exactMeasurement = measurement();
  const measurementPasses = !needsMeasurement || (exactMeasurement !== undefined && (
    metric.kind === "duration-seconds"
      ? exactMeasurement.unit === "seconds" && exactMeasurement.value >= metric.minimum
        && (metric.maximum === undefined || exactMeasurement.value <= metric.maximum)
      : metric.kind === "repetitions"
        ? exactMeasurement.unit === "repetitions" && exactMeasurement.value >= metric.minimum
          && (metric.maximum === undefined || exactMeasurement.value <= metric.maximum)
        : metric.kind === "successful-attempts"
          ? exactMeasurement.unit === "attempts" && exactMeasurement.value >= metric.minimumSuccessful
            && exactMeasurement.attemptsTotal !== undefined
            && exactMeasurement.attemptsTotal >= exactMeasurement.value
            && exactMeasurement.attemptsTotal <= metric.maximumAttempts
          : true
  ));
  const cleanIsValid = outcome !== "clean" || (quality && safety && measurementPasses);
  const metricRequirement = metric.kind === "duration-seconds"
    ? `Hold for at least ${metric.minimum} seconds${metric.maximum === undefined ? "" : ` and no more than ${metric.maximum} seconds`}.`
    : metric.kind === "repetitions"
      ? `Complete at least ${metric.minimum} repetitions${metric.maximum === undefined ? "" : ` and no more than ${metric.maximum}`}.`
      : metric.kind === "successful-attempts"
        ? `Complete at least ${metric.minimumSuccessful} successful attempts within no more than ${metric.maximumAttempts} total attempts.`
        : metric.description;
  const measurementMaximum = metric.kind === "duration-seconds" || metric.kind === "repetitions"
    ? metric.maximum
    : metric.kind === "successful-attempts" ? metric.maximumAttempts : undefined;
  const equipmentLabel = presentation.conditions.equipment
    .map((item) => item.split(":").at(-1)!.replaceAll("-", " "))
    .join(", ");

  return (
    <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-guided-title">
      <section className="vnext-rc-modal">
        <div className="vnext-rc-modal-header">
          <div>
            <p className="vnext-kicker">Guided confirmation</p>
            <h1 id="vnext-guided-title">{presentation.exercise.name}</h1>
            <p>{presentation.exercise.instructions.how}</p>
          </div>
          <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onClose}>Close</button>
        </div>

        <div className="vnext-rc-anchor">
          <section>
            <h2>Exact test conditions</h2>
            <p><strong>Target:</strong> {metricRequirement}</p>
            <p><strong>Equipment:</strong> {equipmentLabel || "No additional equipment"}</p>
            <p><strong>Assistance:</strong> {presentation.conditions.assistance}</p>
            <p><strong>Range:</strong> {presentation.conditions.range}</p>
            <ul>{presentation.exercise.instructions.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
            <h3>Quality criteria</h3>
            <ul>{presentation.qualityCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            <h3>Safety criteria</h3>
            <ul>{presentation.safetyCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            {presentation.exercise.safetyNotes.length > 0 && (
              <p className="vnext-authority">{presentation.exercise.safetyNotes.join(" ")}</p>
            )}
            <p className="vnext-help">Confirmation policy: {presentation.confirmation.qualifyingObservations} qualifying observation{presentation.confirmation.qualifyingObservations === 1 ? "" : "s"} across at least {presentation.confirmation.minimumDistinctSessions} distinct session{presentation.confirmation.minimumDistinctSessions === 1 ? "" : "s"}.</p>
            <p className="vnext-authority">Stop if a safety criterion is not met. A preference or self-report cannot bypass this protocol.</p>
          </section>

          {needsMeasurement && (
            <div className="vnext-rc-field-row">
              <label>
                <span>{metric.kind === "duration-seconds" ? "Seconds" : metric.kind === "repetitions" ? "Repetitions" : "Successful attempts"}</span>
                <input
                  type="number"
                  min={0}
                  max={measurementMaximum}
                  step="1"
                  inputMode="numeric"
                  value={measurementValue}
                  onChange={(event) => setMeasurementValue(event.target.value)}
                />
              </label>
              {metric.kind === "successful-attempts" && (
                <label><span>Total attempts (maximum {metric.maximumAttempts})</span><input type="number" min={1} max={metric.maximumAttempts} step="1" inputMode="numeric" value={attemptsTotal} onChange={(event) => setAttemptsTotal(event.target.value)} /></label>
              )}
            </div>
          )}

          <fieldset>
            <legend>Observed outcome</legend>
            <div className="vnext-rc-answer-grid">
              {([
                ["clean", "Met the exact target cleanly"],
                ["partial", "Partial or inconsistent"],
                ["not-yet", "Not yet"],
                ["symptom", "Symptoms or instability — stopped"],
              ] as const).map(([value, label]) => (
                <label className="vnext-rc-choice" key={value}><input type="radio" name="guided-outcome" checked={outcome === value} onChange={() => setOutcome(value)} /><span>{label}</span></label>
              ))}
            </div>
          </fieldset>

          <div className="vnext-rc-check-grid">
            <label><input type="checkbox" checked={quality} onChange={(event) => setQuality(event.target.checked)} />All quality criteria were met</label>
            <label><input type="checkbox" checked={safety} onChange={(event) => setSafety(event.target.checked)} />All safety criteria were met</label>
          </div>
          <div className="vnext-rc-field-row">
            <label><span>Effort, 1–10 (optional)</span><input type="number" min="1" max="10" step="1" inputMode="numeric" value={exertion} onChange={(event) => setExertion(event.target.value)} /></label>
            <label><span>Notes (optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          {error && <p className="vnext-authority" role="alert">{error} The exact observation identity and result remain retained for retry.</p>}
          <button
            type="button"
            className="vnext-submit"
            disabled={busy || offer.availability !== "available" || !cleanIsValid}
            onClick={() => {
              const perceivedExertion = Number(exertion);
              onCommit({
                outcome,
                ...(exactMeasurement ? { measurement: exactMeasurement } : {}),
                ...(Number.isFinite(perceivedExertion) && perceivedExertion >= 1 && perceivedExertion <= 10
                  ? { perceivedExertion }
                  : {}),
                qualityCriteriaSatisfied: quality,
                safetyCriteriaSatisfied: safety,
                ...(notes.trim() ? { notes: notes.trim() } : {}),
              });
            }}
          >{retryingExactObservation ? "Retry same guided observation" : "Save guided observation"}</button>
        </div>
      </section>
    </main>
  );
};
