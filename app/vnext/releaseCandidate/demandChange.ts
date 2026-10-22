import type { DefinitionBundle, SessionDemand, SessionPlan } from "../contracts";
import { structurePracticeWorkoutPlan } from "../practiceDose";

const demandLabel = (demand: SessionDemand): string => demand === "technique"
  ? "Easier / Technique"
  : demand === "challenge" ? "Challenge" : "Standard";

/** What the athlete actually sees per exercise: movement, variant, sets, target and rest. */
const visibleSets = (plan: SessionPlan, bundle: DefinitionBundle): string => structurePracticeWorkoutPlan(plan, bundle)
  .map((item) => `${item.exercise.id}|${item.variant.id}|${item.structureLabel}`)
  .join(";");

/**
 * Presentation only. Says plainly when a demand change leaves every exercise,
 * variant, set count, target and rest unchanged, instead of implying a change.
 * It never alters the plan, its dose or what is eligible.
 */
export const demandChangeMessage = (input: Readonly<{
  demand: SessionDemand;
  before?: SessionPlan;
  after?: SessionPlan;
  bundleFor: (plan: SessionPlan) => DefinitionBundle;
}>): string => {
  const { demand, before, after } = input;
  const unchanged = demand !== "standard" && before !== undefined && after !== undefined
    && visibleSets(before, input.bundleFor(before)) === visibleSets(after, input.bundleFor(after));
  if (unchanged && demand === "challenge") {
    return "Challenge selected. Today’s sets stay the same, so aim for the top of each target range with clean form.";
  }
  if (unchanged) {
    return "Easier / Technique selected. Today’s sets stay the same; use Swap exercise for an easier option if you need one.";
  }
  return `${demandLabel(demand)} selected for today’s workout.`;
};
