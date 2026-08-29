import { useMemo, useState } from "react";
import {
  DEMAND_DOMAINS,
  type AssessmentAnswerValue,
  type AssessmentDraft,
  type AssessmentReview,
  type AssessmentStep,
  type DefinitionBundle,
  type DemandDomain,
  type EquipmentId,
  type GuidedTestOffer,
  type GraphId,
  type PlacementResponse,
} from "../index";
import { assessmentAnchorPresentation, placementResponseOptions } from "../assessment/presentation";

const labelFromId = (value: string): string => value
  .split(":").at(-1)!
  .split("-")
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join(" ");

const toggle = <Value extends string>(values: readonly Value[], value: Value): readonly Value[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

const Choice = ({
  name,
  checked,
  label,
  onChange,
}: Readonly<{
  name: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}>) => (
  <label className="vnext-rc-choice">
    <input type="radio" name={name} checked={checked} onChange={onChange} />
    <span>{label}</span>
  </label>
);

export type AssessmentRunnerProps = Readonly<{
  draft: AssessmentDraft;
  step: AssessmentStep;
  bundle: DefinitionBundle;
  review?: AssessmentReview;
  busy?: boolean;
  onAnswer: (answer: AssessmentAnswerValue) => void;
  onBack: () => void;
  onCommit: () => void;
  onClose: () => void;
  onGuidedTestRequested?: (offer: GuidedTestOffer) => void;
}>;

const AnswerStep = ({
  draft,
  step,
  bundle,
  busy,
  onAnswer,
}: Pick<AssessmentRunnerProps, "draft" | "step" | "bundle" | "busy" | "onAnswer">) => {
  const [safety, setSafety] = useState<"none" | "modify" | "block">("none");
  const [domains, setDomains] = useState<readonly DemandDomain[]>([]);
  const [bodyRegion, setBodyRegion] = useState("");
  const [experience, setExperience] = useState<"new" | "some" | "experienced">("new");
  const [inactivity, setInactivity] = useState<"active" | "one-to-six-months" | "over-six-months">("active");
  const [goals, setGoals] = useState<readonly GraphId[]>([]);
  const availableEquipment = useMemo(() => [...new Set(bundle.exercises.flatMap((exercise) => exercise.equipment))]
    .sort() as readonly EquipmentId[], [bundle]);
  const [equipment, setEquipment] = useState<readonly EquipmentId[]>(draft.intentSeed.equipment);
  const [inversion, setInversion] = useState<"none" | "supported" | "freestanding">("none");
  const [placement, setPlacement] = useState<PlacementResponse>("not-sure");
  const [anchorBodyRegion, setAnchorBodyRegion] = useState("");

  const submit = (): void => {
    if (step.kind === "safety") {
      onAnswer(safety === "none"
        ? { kind: "safety", severity: "none" }
        : {
          kind: "safety",
          severity: safety,
          demandDomains: domains,
          bodyRegions: [bodyRegion.trim()],
        });
      return;
    }
    if (step.kind === "experience") onAnswer({ kind: "experience", experience });
    else if (step.kind === "inactivity") onAnswer({ kind: "inactivity", inactivity });
    else if (step.kind === "goals") onAnswer({ kind: "goals", graphIds: goals });
    else if (step.kind === "equipment") onAnswer({ kind: "equipment", equipment });
    else if (step.kind === "inversion") onAnswer({ kind: "inversion", familiarity: inversion });
    else if (step.kind === "anchor") {
      onAnswer({
        kind: "anchor",
        response: placement,
        ...(placement === "symptom" && anchorBodyRegion.trim()
          ? { bodyRegions: [anchorBodyRegion.trim()] }
          : {}),
      });
    }
  };

  const valid = step.kind === "safety"
    ? safety === "none" || (domains.length > 0 && bodyRegion.trim().length > 0)
    : step.kind === "goals"
      ? goals.length >= 1 && goals.length <= 3
      : step.kind === "equipment"
        ? equipment.length > 0
        : step.kind === "anchor" && placement === "symptom"
          ? anchorBodyRegion.trim().length > 0
          : step.kind !== "review";

  return (
    <>
      {step.kind === "safety" && (
        <div className="vnext-rc-answer-grid">
          <Choice name="safety" checked={safety === "none"} label="No current symptom or restriction" onChange={() => setSafety("none")} />
          <Choice name="safety" checked={safety === "modify"} label="I should modify some loading" onChange={() => setSafety("modify")} />
          <Choice name="safety" checked={safety === "block"} label="I should avoid some loading" onChange={() => setSafety("block")} />
          {safety !== "none" && (
            <div className="vnext-rc-followup">
              <fieldset>
                <legend>Affected movement demands</legend>
                <div className="vnext-rc-check-grid">
                  {DEMAND_DOMAINS.map((domain) => (
                    <label key={domain}><input type="checkbox" checked={domains.includes(domain)} onChange={() => setDomains(toggle(domains, domain))} />{labelFromId(domain)}</label>
                  ))}
                </div>
              </fieldset>
              <label><span>Affected area</span><input value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value)} placeholder="For example: left wrist" /></label>
              <p className="vnext-help">This adjusts training only. It is not a diagnosis or return-to-sport clearance.</p>
            </div>
          )}
        </div>
      )}

      {step.kind === "experience" && (
        <div className="vnext-rc-answer-grid">
          <Choice name="experience" checked={experience === "new"} label="New to this kind of training" onChange={() => setExperience("new")} />
          <Choice name="experience" checked={experience === "some"} label="Some relevant practice" onChange={() => setExperience("some")} />
          <Choice name="experience" checked={experience === "experienced"} label="Experienced with these patterns" onChange={() => setExperience("experienced")} />
        </div>
      )}

      {step.kind === "inactivity" && (
        <div className="vnext-rc-answer-grid">
          <Choice name="inactivity" checked={inactivity === "active"} label="Training currently" onChange={() => setInactivity("active")} />
          <Choice name="inactivity" checked={inactivity === "one-to-six-months"} label="One to six months away" onChange={() => setInactivity("one-to-six-months")} />
          <Choice name="inactivity" checked={inactivity === "over-six-months"} label="More than six months away" onChange={() => setInactivity("over-six-months")} />
        </div>
      )}

      {step.kind === "goals" && (
        <fieldset className="vnext-rc-followup">
          <legend>Choose one primary direction, then up to two supporting goals</legend>
          <div className="vnext-rc-answer-grid">
            {step.options.map((option) => (
              <label className="vnext-rc-choice" key={option.graphId}>
                <input
                  type="checkbox"
                  checked={goals.includes(option.graphId)}
                  disabled={!goals.includes(option.graphId) && goals.length >= 3}
                  onChange={() => setGoals(toggle(goals, option.graphId))}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step.kind === "equipment" && (
        <fieldset className="vnext-rc-followup">
          <legend>Available equipment</legend>
          <div className="vnext-rc-check-grid">
            {availableEquipment.map((item) => (
              <label key={item}><input type="checkbox" checked={equipment.includes(item)} onChange={() => setEquipment(toggle(equipment, item))} />{labelFromId(item)}</label>
            ))}
          </div>
        </fieldset>
      )}

      {step.kind === "inversion" && (
        <div className="vnext-rc-answer-grid">
          <Choice name="inversion" checked={inversion === "none"} label="No familiar inversion exposure" onChange={() => setInversion("none")} />
          <Choice name="inversion" checked={inversion === "supported"} label="Supported or wall-assisted" onChange={() => setInversion("supported")} />
          <Choice name="inversion" checked={inversion === "freestanding"} label="Freestanding practice feels familiar" onChange={() => setInversion("freestanding")} />
        </div>
      )}

      {step.kind === "anchor" && (() => {
        const anchor = assessmentAnchorPresentation(step, bundle);
        return (
          <div className="vnext-rc-anchor">
            <div>
              <p className="vnext-kicker">Small placement anchor</p>
              <h3>{anchor.exercise.name}</h3>
              <p>{anchor.exercise.instructions.how}</p>
              <ul>{anchor.exercise.instructions.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
            </div>
            <fieldset>
              <legend>What best describes this today?</legend>
              <div className="vnext-rc-answer-grid">
                {placementResponseOptions.map((option) => (
                  <Choice key={option.value} name="placement" checked={placement === option.value} label={option.label} onChange={() => setPlacement(option.value)} />
                ))}
              </div>
            </fieldset>
            {placement === "symptom" && (
              <label><span>Affected area</span><input value={anchorBodyRegion} onChange={(event) => setAnchorBodyRegion(event.target.value)} placeholder="For example: right shoulder" /></label>
            )}
            <p className="vnext-authority">This answer creates a provisional placement observation only. It cannot award an achievement.</p>
          </div>
        );
      })()}

      <button type="button" className="vnext-submit" disabled={busy || !valid} onClick={submit}>Continue</button>
    </>
  );
};

export const AssessmentRunner = ({
  draft,
  step,
  bundle,
  review,
  busy = false,
  onAnswer,
  onBack,
  onCommit,
  onClose,
  onGuidedTestRequested,
}: AssessmentRunnerProps) => (
  <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-assessment-runner-title">
    <section className="vnext-rc-modal">
      <div className="vnext-rc-modal-header">
        <div>
          <p className="vnext-kicker">Adaptive placement</p>
          <h1 id="vnext-assessment-runner-title">{step.title}</h1>
          <p>{step.prompt}</p>
        </div>
        <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onClose}>Save &amp; close</button>
      </div>

      {step.kind === "review" ? (
        <div className="vnext-rc-review">
          <p><strong>{review?.promptCount ?? draft.answers.length} answers</strong> · about {review?.estimatedMinutes ?? 1} minutes completed</p>
          <p>{review?.completionMessage ?? "Your starting points are ready to save."}</p>
          {(review?.provisional.length ?? 0) > 0 && (
            <p className="vnext-authority">These are placement estimates until the benchmark policy confirms them.</p>
          )}
          {(review?.guidedTests.length ?? 0) > 0 && (
            <section>
              <h2>Optional guided confirmation</h2>
              <div className="vnext-assessment-list">
                {review!.guidedTests.map((offer) => (
                  <div className="vnext-assessment-action" key={offer.protocolId}>
                    <div><strong>{offer.label}</strong><span>{labelFromId(offer.reason)}</span>{offer.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div>
                    <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || offer.availability === "blocked" || !onGuidedTestRequested} onClick={() => onGuidedTestRequested?.(offer)}>{offer.availability === "blocked" ? "Unavailable today" : "Save placement & open test"}</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <button type="button" className="vnext-submit" disabled={busy} onClick={onCommit}>Save placement</button>
        </div>
      ) : (
        <AnswerStep key={`${draft.id}:${draft.revision}:${step.id}`} draft={draft} step={step} bundle={bundle} busy={busy} onAnswer={onAnswer} />
      )}

      <div className="vnext-actions">
        <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || draft.answers.length === 0} onClick={onBack}>Back</button>
        <span className="vnext-help">Your progress is saved on this device after every answer.</span>
      </div>
    </section>
  </main>
);
