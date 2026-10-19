import { useId, useMemo, useState } from "react";
import { DEMAND_DOMAINS, type DefinitionBundle, type DemandDomain, type EquipmentId, type GraphId } from "../contracts";
import type { AssessmentAnswerValue, AssessmentDraft } from "../assessment/contracts";
import { vNextAssessmentPolicy } from "../assessment/policy";
import "./quickSetup.css";

export type QuickSetupContextProps = Readonly<{
  draft: AssessmentDraft;
  bundle: DefinitionBundle;
  busy?: boolean;
  onSubmit: (answers: readonly AssessmentAnswerValue[]) => void;
}>;

const previousAnswer = <Kind extends AssessmentAnswerValue["kind"]>(
  draft: AssessmentDraft,
  kind: Kind,
): Extract<AssessmentAnswerValue, { kind: Kind }> | undefined => (
  draft.answers.find((answer) => answer.value.kind === kind)?.value
  ?? draft.revisitAnswers?.find((answer) => answer.value.kind === kind)?.value
) as Extract<AssessmentAnswerValue, { kind: Kind }> | undefined;

const toggle = <Value extends string>(values: readonly Value[], value: Value): readonly Value[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

const equipmentLabel = (value: string): string => value.split(":").at(-1)!
  .split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");

const demandLabels: Readonly<Record<DemandDomain, string>> = {
  "hand-wrist-bearing": "Weight on hands / wrists",
  "forward-straight-arm-upper-limb": "Straight-arm leaning",
  "overhead-straight-arm-upper-limb": "Straight arms overhead",
  "horizontal-bent-arm-push": "Push-ups / horizontal pushing",
  "vertical-bent-arm-push": "Pike / overhead pressing",
  "inversion-technical": "Upside-down work",
  "compression-trunk": "Core / leg lifting",
};

const ChoiceRow = <Value extends string>({
  label, name, value, options, onChange,
}: Readonly<{
  label: string;
  name: string;
  value: Value | undefined;
  options: readonly Readonly<{ value: Value; label: string }>[];
  onChange: (value: Value) => void;
}>) => (
  <fieldset className="vnext-quick-question">
    <legend>{label}</legend>
    <div className="vnext-quick-choices">
      {options.map((option) => (
        <label key={option.value} className="vnext-quick-choice">
          <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

/** One UI screen; the parent saves the existing context answers atomically. */
export const QuickSetupContext = ({ draft, bundle, busy = false, onSubmit }: QuickSetupContextProps) => {
  const formId = useId();
  const priorSafety = previousAnswer(draft, "safety");
  const [safety, setSafety] = useState(priorSafety?.severity);
  const [domains, setDomains] = useState<readonly DemandDomain[]>(priorSafety?.demandDomains ?? []);
  const [bodyRegion, setBodyRegion] = useState(priorSafety?.bodyRegions?.join(", ") ?? "");
  const [experience, setExperience] = useState(previousAnswer(draft, "experience")?.experience);
  const [inactivity, setInactivity] = useState(previousAnswer(draft, "inactivity")?.inactivity);
  const [inversion, setInversion] = useState(previousAnswer(draft, "inversion")?.familiarity);
  const [goals, setGoals] = useState<readonly GraphId[]>(() => previousAnswer(draft, "goals")?.graphIds ?? [
    ...draft.intentSeed.goals.filter((goal) => goal.priority === "primary"),
    ...draft.intentSeed.goals.filter((goal) => goal.priority === "secondary"),
  ].map((goal) => goal.graphId));
  const [equipment, setEquipment] = useState<readonly EquipmentId[]>(
    previousAnswer(draft, "equipment")?.equipment ?? draft.intentSeed.equipment,
  );
  const [editing, setEditing] = useState(goals.length === 0);
  const availableEquipment = useMemo(() => [...new Set([
    ...bundle.exercises.flatMap((exercise) => exercise.equipment),
    ...draft.intentSeed.equipment,
  ])].sort(), [bundle, draft.intentSeed.equipment]);
  const goalOptions = vNextAssessmentPolicy.goalOptions;
  const goalLabel = (graphId: GraphId): string => goalOptions.find((goal) => goal.graphId === graphId)?.label ?? "Choose a goal";
  const needsInversion = goalOptions.some((goal) => goals.includes(goal.graphId) && goal.requiresInversionContext);
  const bodyRegions = [...new Set(bodyRegion.split(",").map((area) => area.trim()).filter(Boolean))];
  const valid = safety !== undefined && experience !== undefined && inactivity !== undefined
    && (safety === "none" || (domains.length > 0 && bodyRegions.length > 0))
    && goals.length >= 1 && goals.length <= vNextAssessmentPolicy.maximumGoals
    && goals.every((id) => goalOptions.some((goal) => goal.graphId === id))
    && equipment.length > 0 && (!needsInversion || inversion !== undefined);

  const submit = (): void => {
    if (!valid || !safety || !experience || !inactivity || busy) return;
    const answers: AssessmentAnswerValue[] = [
      safety === "none" ? { kind: "safety", severity: "none" } : {
        kind: "safety", severity: safety, demandDomains: domains, bodyRegions,
        ...(priorSafety?.severity === safety && priorSafety.notes ? { notes: priorSafety.notes } : {}),
      },
      { kind: "experience", experience },
      { kind: "inactivity", inactivity },
      { kind: "goals", graphIds: goals },
      { kind: "equipment", equipment },
    ];
    if (needsInversion && inversion) answers.push({ kind: "inversion", familiarity: inversion });
    onSubmit(answers);
  };

  return (
    <form className="vnext-quick-setup" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <fieldset className="vnext-quick-fields" disabled={busy}>
        <details className="vnext-quick-saved" open={editing} onToggle={(event) => setEditing(event.currentTarget.open)}>
          <summary>
            <span>
              <strong>{goals[0] ? goalLabel(goals[0]) : "Choose your goal"}</strong>
              {goals.length > 1 && <small>Supporting: {goals.slice(1).map(goalLabel).join(", ")}</small>}
              <small>{equipment.length ? equipment.map(equipmentLabel).join(" · ") : "Choose your equipment"}</small>
            </span>
            <span className="vnext-quick-edit">{editing ? "Close" : "Edit"}</span>
          </summary>
          <div className="vnext-quick-settings">
            <label className="vnext-quick-field">
              <span>Main goal</span>
              <select value={goals[0] ?? ""} onChange={(event) => {
                const main = event.target.value as GraphId;
                setGoals(main ? [main, ...goals.slice(1).filter((goal) => goal !== main)] : []);
              }}>
                <option value="" disabled>Choose your main goal</option>
                {goalOptions.map((goal) => <option key={goal.graphId} value={goal.graphId}>{goal.label}</option>)}
              </select>
            </label>
            <fieldset>
              <legend>Supporting goals · optional, up to two</legend>
              <div className="vnext-quick-checks">
                {goalOptions.filter((goal) => goal.graphId !== goals[0]).map((goal) => (
                  <label key={goal.graphId}>
                    <input type="checkbox" checked={goals.slice(1).includes(goal.graphId)}
                      disabled={!goals[0] || (!goals.includes(goal.graphId) && goals.length >= 3)}
                      onChange={() => setGoals([goals[0]!, ...toggle(goals.slice(1), goal.graphId)])} />
                    <span>{goal.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Equipment you have</legend>
              <div className="vnext-quick-checks">
                {availableEquipment.map((item) => (
                  <label key={item}><input type="checkbox" checked={equipment.includes(item)} onChange={() => setEquipment(toggle(equipment, item))} /><span>{equipmentLabel(item)}</span></label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>

        <ChoiceRow label="Any pain or restriction today?" name={`${formId}-safety`} value={safety} onChange={setSafety}
          options={[{ value: "none", label: "None" }, { value: "modify", label: "Adjust some moves" }, { value: "block", label: "Avoid some moves" }]} />
        {safety !== undefined && safety !== "none" && (
          <div className="vnext-quick-restriction">
            <fieldset>
              <legend>Which movements are affected?</legend>
              <div className="vnext-quick-checks">
                {DEMAND_DOMAINS.map((domain) => (
                  <label key={domain}><input type="checkbox" checked={domains.includes(domain)} onChange={() => setDomains(toggle(domains, domain))} /><span>{demandLabels[domain]}</span></label>
                ))}
              </div>
            </fieldset>
            <label className="vnext-quick-field"><span>Affected area</span><input value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value)} placeholder="For example: left wrist" /></label>
            <p className="vnext-help">This adjusts training; it does not provide medical clearance.</p>
          </div>
        )}

        <ChoiceRow label="How familiar is this training?" name={`${formId}-experience`} value={experience} onChange={setExperience}
          options={[{ value: "new", label: "New to it" }, { value: "some", label: "Some practice" }, { value: "experienced", label: "Experienced" }]} />
        <ChoiceRow label="When did you last train regularly?" name={`${formId}-inactivity`} value={inactivity} onChange={setInactivity}
          options={[{ value: "active", label: "Training now" }, { value: "one-to-six-months", label: "1–6 months ago" }, { value: "over-six-months", label: "Over 6 months" }]} />
        {needsInversion && (
          <ChoiceRow label="How familiar is upside-down practice?" name={`${formId}-inversion`} value={inversion} onChange={setInversion}
            options={[{ value: "none", label: "Not familiar" }, { value: "supported", label: "With support" }, { value: "freestanding", label: "Freestanding" }]} />
        )}
      </fieldset>
      <button type="submit" className="vnext-submit" disabled={!valid || busy}>{busy ? "Saving…" : "Continue"}</button>
    </form>
  );
};
