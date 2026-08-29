import type { DefinitionBundle, DevelopmentGraph, MilestoneRef, SessionDemand } from "../contracts";
import type { EmphasisFocus, GeneratedSession, ItemExplanation } from "../planning";
import type {
  TodayFocusPresentation,
  TodayPresentationInput,
  TodayWorkoutPresentation,
} from "./contracts";
import { presentationFamilyLabel } from "./progress";

const demandPresentation = (
  demand: SessionDemand,
): TodayWorkoutPresentation["demand"] => demand === "technique" ? {
  value: demand,
  label: "Easier / Technique",
  message: "Prioritises assistance, control and clean practice at the same safe progression frontier.",
} : demand === "challenge" ? {
  value: demand,
  label: "Challenge",
  message: "Adds workload to work that is already available today; it never unlocks a harder skill.",
} : {
  value: demand,
  label: "Standard",
  message: "Uses the normal quality workload for today’s available work.",
};

const graphFor = (bundle: DefinitionBundle, graphId: EmphasisFocus["graphId"]): DevelopmentGraph | undefined =>
  bundle.graphs.find((candidate) => candidate.id === graphId);

const nodeLabel = (
  bundle: DefinitionBundle,
  milestone?: MilestoneRef,
): string | undefined => milestone && graphFor(bundle, milestone.graphId)
  ?.nodes.find((candidate) => candidate.id === milestone.nodeId)?.label;

const focusReason = (
  focus: EmphasisFocus,
  role: "primary" | "secondary" | "maintenance",
  bundle: DefinitionBundle,
): string => {
  const target = nodeLabel(bundle, focus.targetMilestone);
  if (focus.kind === "reconfirmation") {
    return `A short quality check will update whether ${target ?? "this skill"} is ready for harder work today.`;
  }
  if (focus.kind === "prerequisite-development") {
    return `${target ?? "This goal"} remains the destination; today develops the requirement that safely comes first.`;
  }
  if (focus.kind === "maintenance" || role === "maintenance") {
    return `${target ?? "This skill"} gets a small quality dose so it stays available without competing with the primary goal.`;
  }
  if (role === "secondary") {
    return `${target ?? "This skill"} is compatible with the primary focus and adds useful practice without excessive overlap.`;
  }
  return `${target ?? "This skill"} is the current safe step for a goal you prioritised.`;
};

const focusPresentation = (
  focus: EmphasisFocus,
  role: "primary" | "secondary" | "maintenance",
  bundle: DefinitionBundle,
): TodayFocusPresentation => {
  const graph = graphFor(bundle, focus.graphId);
  const targetLabel = nodeLabel(bundle, focus.targetMilestone);
  const familyLabel = graph ? presentationFamilyLabel(graph) : "Your selected goal";
  return {
    graphId: focus.graphId,
    familyLabel,
    ...(targetLabel ? { targetLabel } : {}),
    label: role === "primary"
      ? `${familyLabel} development`
      : role === "secondary"
        ? `${familyLabel} support`
        : `${familyLabel} maintenance`,
    reason: focusReason(focus, role, bundle),
  };
};

const blockLabel = (block: ItemExplanation["block"]): string => block === "preparation"
  ? "Preparation"
  : block === "technical"
    ? "Technical work"
    : block === "primary"
      ? "Primary development"
      : block === "supporting-capacity"
        ? "Supporting capacity"
        : block === "secondary"
          ? "Secondary focus"
          : block === "maintenance"
            ? "Maintenance"
            : block === "recovery"
              ? "Reset"
              : "Supporting work";

const simpleExerciseReason = (explanation: ItemExplanation): string => explanation.block === "preparation"
  ? "Prepares the joints and movement pattern used later in the session."
  : explanation.block === "technical"
    ? "Practises coordination and control before fatigue."
    : explanation.block === "primary"
      ? "Directly develops today’s primary progression."
      : explanation.block === "supporting-capacity"
        ? "Builds a specific requirement for the selected progression."
        : explanation.block === "secondary"
          ? "Adds compatible work for a secondary goal."
          : explanation.block === "maintenance"
            ? "Keeps a demonstrated skill available with a small quality dose."
            : explanation.block === "recovery"
              ? "Finishes with a brief reset after the main work."
              : "Adds useful support without unnecessary filler.";

const simpleIntensityReason = (
  generated: GeneratedSession,
  explanation: ItemExplanation,
): string => {
  const evaluation = generated.trainabilityUsed.find((candidate) => {
    const item = generated.plan?.items.find((planItem) => planItem.id === explanation.planItemId);
    return item
      && candidate.exerciseId === item.exerciseId
      && candidate.prescriptionVariantId === item.prescriptionVariantId;
  });
  if (evaluation?.decision === "modify") return "Adjusted to match current restrictions and availability.";
  if (generated.sessionDemand === "technique") return "Uses today’s easier, technique-focused dose.";
  if (generated.sessionDemand === "challenge") return "Uses a larger dose of work that was already available.";
  return "Uses the normal quality dose for this movement.";
};

export const buildTodayWorkoutPresentation = (
  input: TodayPresentationInput,
): TodayWorkoutPresentation => {
  const { generated, bundle } = input;
  const demand = demandPresentation(generated.sessionDemand);
  if (!generated.ok || !generated.plan || !generated.emphasis) return {
    title: "Today's Workout",
    status: "unavailable",
    reason: "A safe, goal-relevant session is not available from the current information. Review current restrictions, equipment or placement.",
    maintenance: [],
    demand,
    blocks: [],
    authorityNotice: "Changing goals or today’s workload never bypasses prerequisites, restrictions or specialist boundaries.",
    exposesRawAlgorithmDecisions: false,
  };
  const primary = focusPresentation(generated.emphasis.primary, "primary", bundle);
  const secondary = generated.emphasis.secondary
    ? focusPresentation(generated.emphasis.secondary, "secondary", bundle)
    : undefined;
  const maintenance = generated.emphasis.maintenance.map((focus) =>
    focusPresentation(focus, "maintenance", bundle));
  const explanationByItem = new Map(generated.itemExplanations.map((item) => [item.planItemId, item]));
  const blocks = generated.plan.items.map((item) => {
    const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    const explanation = explanationByItem.get(item.id);
    return {
      planItemId: item.id,
      exerciseId: item.exerciseId,
      exerciseName: exercise?.name ?? "Planned movement",
      blockLabel: blockLabel(explanation?.block ?? "supplemental"),
      plannedMinutes: Math.round(item.plannedSeconds / 6) / 10,
      reason: explanation
        ? simpleExerciseReason(explanation)
        : "Supports today’s safe, goal-directed session.",
      intensity: explanation
        ? simpleIntensityReason(generated, explanation)
        : demand.message,
    };
  });
  const minutes = generated.plan.intendedDurationSeconds / 60;
  return {
    title: "Today's Workout",
    status: "ready",
    focus: primary,
    reason: primary.reason,
    primary,
    ...(secondary ? { secondary } : {}),
    maintenance,
    demand,
    blocks,
    durationLabel: Number.isInteger(minutes) ? `${minutes} minutes` : `${minutes.toFixed(1)} minutes`,
    authorityNotice: "Your goals guide the focus. The system still decides the safe progression, exercise and dose from current evidence and restrictions.",
    exposesRawAlgorithmDecisions: false,
  };
};
