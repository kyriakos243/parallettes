import { useEffect, useRef, useState } from "react";
import {
  capacityIds,
  graphIds,
  parseStableId,
  type CapacityId,
  type EquipmentId,
  type GoalControlsPresentation,
  type GraphId,
  type SessionDemand,
  type VNextCustomSessionMinutes,
} from "../index";
import {
  readShortWorkoutPreferences,
  rememberShortWorkoutPreferences,
  shortWorkoutFocusToken,
  type ShortWorkoutPreferences,
} from "./shortWorkoutPreferences";

export type VNextCustomSessionRequest = Readonly<{
  minutes: VNextCustomSessionMinutes;
  focus: VNextCustomSessionFocus;
  equipment: readonly EquipmentId[];
  demand: SessionDemand;
}>;

export type VNextCustomSessionFocus =
  | Readonly<{ kind: "general"; label: string }>
  | Readonly<{ kind: "graph"; label: string; graphId: GraphId }>
  | Readonly<{
    kind: "capacity";
    label: string;
    plannerGraphId: GraphId;
    capacityIds: readonly CapacityId[];
  }>;

const equipmentOptions = [
  { id: parseStableId("equipment", "floor"), label: "Floor" },
  { id: parseStableId("equipment", "parallettes"), label: "Parallettes" },
  { id: parseStableId("equipment", "wall"), label: "Wall" },
] as const;

type CustomSessionBuilderProps = Readonly<{
  goals: GoalControlsPresentation;
  currentEquipment: readonly EquipmentId[];
  defaultDemand: SessionDemand;
  preferenceKey?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onBuild: (request: VNextCustomSessionRequest) => void;
}>;

// Account changes remount the form, including its current equipment/effort.
export const CustomSessionBuilder = (props: CustomSessionBuilderProps) =>
  <CustomSessionForm key={props.preferenceKey ?? "temporary"} {...props} />;

const CustomSessionForm = ({
  goals,
  currentEquipment,
  defaultDemand,
  preferenceKey,
  busy,
  error,
  onClose,
  onBuild,
}: CustomSessionBuilderProps) => {
  const focusOptions: readonly VNextCustomSessionFocus[] = [
    { kind: "general", label: "General / balanced" },
    {
      kind: "capacity",
      label: "Core & body line",
      plannerGraphId: graphIds.planche,
      capacityIds: [capacityIds.bodyLineControl],
    },
    {
      kind: "capacity",
      label: "Compression only",
      plannerGraphId: graphIds.lSitVSit,
      capacityIds: [capacityIds.pikeCompression, capacityIds.straddleCompression],
    },
    ...goals.options.map((option): VNextCustomSessionFocus => ({
      kind: "graph",
      label: option.label,
      graphId: option.graphId,
    })),
  ];
  const initialGraphId = goals.primaryGraphId ?? goals.options[0]?.graphId;
  const initialFocus = focusOptions.find((focus) =>
    focus.kind === "graph" && focus.graphId === initialGraphId);
  const defaultFocus = initialFocus ?? focusOptions[0]!;
  const [preferences, setPreferences] = useState<ShortWorkoutPreferences>(() => readShortWorkoutPreferences(
    preferenceKey,
    { minutes: 5, focusToken: shortWorkoutFocusToken(defaultFocus) },
    focusOptions.map(shortWorkoutFocusToken),
  ));
  const { minutes } = preferences;
  const focus = focusOptions.find((option) => shortWorkoutFocusToken(option) === preferences.focusToken) ?? defaultFocus;
  const focusToken = shortWorkoutFocusToken(focus);
  const remember = (next: ShortWorkoutPreferences) => {
    setPreferences(next);
    rememberShortWorkoutPreferences(preferenceKey, next);
  };
  const [equipment, setEquipment] = useState<readonly EquipmentId[]>(currentEquipment);
  const [demand, setDemand] = useState<SessionDemand>(defaultDemand);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest("section")?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  const toggleEquipment = (id: EquipmentId) => setEquipment((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-custom-title">
      <section className="vnext-rc-modal vnext-rc-custom">
        <header className="vnext-rc-modal-header">
          <div><p className="vnext-kicker">Custom session</p><h1 id="vnext-custom-title" ref={heading} tabIndex={-1}>Short workout</h1></div>
          <button type="button" className="vnext-action" data-kind="secondary" onClick={onClose}>Close</button>
        </header>
        <p>Choose your maximum time and focus. Your workout may be shorter when the useful work is complete.</p>

        <fieldset>
          <legend>Time available</legend>
          <div className="vnext-custom-choice-row">
            {([5, 10, 15, 20] as const).map((value) => <button key={value} type="button" aria-pressed={minutes === value} onClick={() => remember({ minutes: value, focusToken })}>{value} min</button>)}
          </div>
        </fieldset>

        <label>
          <span>Focus</span>
          <select value={focusToken} onChange={(event) => {
            const next = event.target.value;
            if (focusOptions.some((option) => shortWorkoutFocusToken(option) === next)) remember({ minutes, focusToken: next });
          }}>
            {focusOptions.map((option) => <option key={shortWorkoutFocusToken(option)} value={shortWorkoutFocusToken(option)}>{option.label}</option>)}
          </select>
        </label>

        <details className="vnext-custom-settings">
          <summary>Equipment &amp; effort<span>{equipmentOptions.filter((option) => equipment.includes(option.id)).map((option) => option.label).join(", ") || "Choose equipment"} · {demand === "technique" ? "Easier / Technique" : demand === "challenge" ? "Challenge" : "Standard"}</span></summary>
        <fieldset>
          <legend>Equipment available now</legend>
          <div className="vnext-custom-checks">
            {equipmentOptions.map((option) => (
              <label key={option.id}><input type="checkbox" checked={equipment.includes(option.id)} onChange={() => toggleEquipment(option.id)} />{option.label}</label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>How should it feel?</legend>
          <div className="vnext-custom-choice-row">
            {(["technique", "standard", "challenge"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={demand === value} onClick={() => setDemand(value)}>
                {value === "technique" ? "Easier / Technique" : value === "standard" ? "Standard" : "Challenge"}
              </button>
            ))}
          </div>
          <p className="vnext-help">The exercises stay within your current abilities.</p>
        </fieldset>

        </details>
        {equipment.length === 0 && <p role="alert">Choose at least one available training space or piece of equipment.</p>}
        {error && <p className="vnext-authority" role="alert">{error} Choose another focus or check your available equipment, then try Preview again.</p>}
        <button type="button" className="vnext-submit" disabled={busy || equipment.length === 0} onClick={() => onBuild({ minutes, focus, equipment, demand })}>
          Preview workout
        </button>
      </section>
    </main>
  );
};
