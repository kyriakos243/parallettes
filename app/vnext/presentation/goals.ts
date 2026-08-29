import type { AthleteIntent, DefinitionBundle, GraphId, IsoTimestamp } from "../contracts";
import { isCanonicalIsoTimestamp } from "../assessment/contracts";
import {
  type GoalControlSelection,
  type GoalControlsPresentation,
} from "./contracts";
import { presentationFamilyLabel, presentationFamilyOrder } from "./progress";

export const buildGoalControls = (
  bundle: DefinitionBundle,
  intent: AthleteIntent,
): GoalControlsPresentation => {
  const selectedByGraph = new Map(intent.goals.map((goal) => [goal.graphId, goal]));
  const options = presentationFamilyOrder.map((graphId) => {
    const graph = bundle.graphs.find((candidate) => candidate.id === graphId);
    if (!graph) throw new TypeError(`Goals & emphasis requires graph ${graphId}`);
    const selected = selectedByGraph.get(graphId);
    const currentEmphasis = intent.emphasisOverride?.primaryGraphId === graphId
      ? "primary" as const
      : intent.emphasisOverride?.secondaryGraphId === graphId
        ? "secondary" as const
        : undefined;
    return {
      graphId,
      label: presentationFamilyLabel(graph),
      description: graph.description,
      ...(selected ? { selectedPriority: selected.priority } : {}),
      ...(currentEmphasis ? { currentEmphasis } : {}),
    };
  });
  return {
    title: "Goals & emphasis",
    options,
    ...(intent.goals.find((goal) => goal.priority === "primary")?.graphId
      ? { primaryGraphId: intent.goals.find((goal) => goal.priority === "primary")!.graphId }
      : {}),
    secondaryGraphIds: intent.goals
      .filter((goal) => goal.priority === "secondary")
      .map((goal) => goal.graphId),
    ...(intent.emphasisOverride ? { emphasis: intent.emphasisOverride } : {}),
    authorityNotice: "You choose what matters. Evidence, prerequisites and current restrictions still decide which progression is safe.",
    canUnlockSkills: false,
  };
};

const assertGoalSelection = (
  bundle: DefinitionBundle,
  selection: GoalControlSelection,
): void => {
  const available = new Set(bundle.graphs.map((graph) => graph.id));
  const goalIds = selection.goals.map((goal) => goal.graphId);
  if (selection.goals.length < 1 || selection.goals.length > 3) {
    throw new TypeError("Choose one to three goal families");
  }
  if (new Set(goalIds).size !== goalIds.length) throw new TypeError("A goal family can be selected only once");
  const primaryCount = selection.goals.filter((goal) => goal.priority === "primary").length;
  if (primaryCount !== 1) {
    throw new TypeError("A goal selection requires exactly one primary goal");
  }
  if (selection.goals.some((goal) => !available.has(goal.graphId))) {
    throw new TypeError("Goals & emphasis references a graph outside the current catalogue");
  }
  if (!selection.emphasis) return;
  if (!goalIds.includes(selection.emphasis.primaryGraphId)
    || (selection.emphasis.secondaryGraphId !== undefined
      && !goalIds.includes(selection.emphasis.secondaryGraphId))) {
    throw new TypeError("Optional emphasis must reference a selected goal");
  }
  if (selection.emphasis.secondaryGraphId === selection.emphasis.primaryGraphId) {
    throw new TypeError("Primary and secondary emphasis must be different families");
  }
};

/**
 * Applies user intent only. It cannot write evidence, change Derived Athlete
 * State, mark a node achieved or make a progression trainable.
 */
export const applyGoalControlSelection = (input: Readonly<{
  bundle: DefinitionBundle;
  intent: AthleteIntent;
  selection: GoalControlSelection;
  updatedAt: IsoTimestamp;
}>): AthleteIntent => {
  if (!isCanonicalIsoTimestamp(input.updatedAt)) {
    throw new TypeError("Goal update time must be a canonical UTC timestamp");
  }
  if (Date.parse(input.updatedAt) < Date.parse(input.intent.updatedAt)) {
    throw new TypeError("Goal update cannot predate the current Athlete Intent");
  }
  assertGoalSelection(input.bundle, input.selection);
  const existingByGraph = new Map(input.intent.goals.map((goal) => [goal.graphId, goal]));
  const goals = input.selection.goals.map((selection) => {
    const existing = existingByGraph.get(selection.graphId);
    return {
      graphId: selection.graphId,
      ...(existing?.targetNodeId ? { targetNodeId: existing.targetNodeId } : {}),
      priority: selection.priority,
    };
  });
  const { emphasisOverride: _previousEmphasis, ...intentWithoutEmphasis } = input.intent;
  return {
    ...intentWithoutEmphasis,
    updatedAt: input.updatedAt,
    goals,
    ...(input.selection.emphasis ? { emphasisOverride: input.selection.emphasis } : {}),
  };
};

export const selectedGoalGraphIds = (
  selection: GoalControlSelection,
): readonly GraphId[] => selection.goals.map((goal) => goal.graphId);
