import { parseDefinitionVersion, parseStableId, type DefinitionReference, type SessionPlanItem } from "../contracts";
import { MIXED_CAPACITY_POLICY_ID, MIXED_WORKOUT_POLICY_ID } from "../mixedWorkout";
import { evaluateTrainability } from "../projection";
import { structureWorkoutItem } from "../workoutUx";
import { generateVNextSession } from "./composer";
import { generateVNextCustomSession, type VNextCustomContentFilter, type VNextCustomSessionMinutes } from "./custom";
import type { GenerateSessionInput, GeneratedSession, ItemExplanation, PlannedTrainability } from "./contracts";
import { vNextGeneratorPolicy } from "./policy";
import { stableHash } from "./utils";

/** Add variety within existing preparation/reset budgets; never add development load. */
const mixedPlan = (input: GenerateSessionInput, generated: GeneratedSession, capacityOnly = false): GeneratedSession => {
  if (!generated.ok || !generated.plan) return generated;
  const original = generated.plan;
  const policyId = parseStableId("policy", capacityOnly ? MIXED_CAPACITY_POLICY_ID : MIXED_WORKOUT_POLICY_ID);
  const version = parseDefinitionVersion(1);
  const explanations = new Map(generated.itemExplanations.map((item) => [item.planItemId, item]));
  if (original.items.some((item) => !explanations.has(item.id))) throw new TypeError("A mixed workout requires an explanation for every native item.");
  const addedReferences: DefinitionReference[] = [];
  const addedTrainability: PlannedTrainability[] = [];
  const used = new Set(original.items.map((item) => item.exerciseId));
  const entries = original.items.flatMap((item) => {
    const explanation = explanations.get(item.id)!;
    if (item.purpose !== "preparation" && item.purpose !== "recovery") return [{ item, explanation }];
    const purpose = item.purpose;
    const structured = structureWorkoutItem(item, input.bundle);
    const sets = [...new Set(structured.intervals.map((interval) => interval.set))];
    // Whole existing work/rest cycles keep total preparation work/rest exact.
    if (purpose === "preparation" && sets.length < 2) return [{ item, explanation }];
    if (purpose === "recovery" && item.plannedSeconds < 60) return [{ item, explanation }];
    const ids = purpose === "preparation" ? vNextGeneratorPolicy.preparationExerciseIds : vNextGeneratorPolicy.recoveryExerciseIds;
    const candidates = ids.flatMap((id) => {
      const exercise = input.bundle.exercises.find((entry) => entry.id === id);
      const variant = exercise?.prescriptionVariants[0];
      if (!exercise || !variant || used.has(exercise.id) || !exercise.roles.includes("preparation-recovery")
        || exercise.media[0]?.kind !== "motion" || Object.values(variant.demand).some((demand) => demand !== "low")) return [];
      const evaluation = evaluateTrainability({ request: {
        exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id,
      }, state: input.state, bundle: input.bundle, asOf: input.createdAt, policy: input.projectionPolicy, intent: input.intent });
      return evaluation.decision === "allow" ? [{ exercise, variant, evaluation }] : [];
    });
    const next = (purpose === "preparation" ? candidates.find((candidate) => candidate.exercise.id === "shoulder-sweep") : undefined)
      ?? candidates[0];
    if (!next) return [{ item, explanation }];
    const seconds = purpose === "preparation"
      ? sets.filter((_, index) => index % 2 === 1).reduce((sum, set) => sum + structured.intervals
        .filter((interval) => interval.set === set).reduce((total, interval) => total + interval.durationSeconds, 0), 0)
      : Math.floor(item.plannedSeconds / 2);
    if (seconds <= 0 || seconds >= item.plannedSeconds) return [{ item, explanation }];
    used.add(next.exercise.id);
    addedReferences.push({ kind: "exercise", id: next.exercise.id, version: next.exercise.definitionVersion });
    addedTrainability.push({ exerciseId: next.exercise.id, exerciseDefinitionVersion: next.exercise.definitionVersion,
      prescriptionVariantId: next.variant.id, decision: next.evaluation.decision, reasonCodes: next.evaluation.reasonCodes });
    const added: SessionPlanItem = { ...item, exerciseId: next.exercise.id, exerciseDefinitionVersion: next.exercise.definitionVersion,
      prescriptionVariantId: next.variant.id, plannedSeconds: seconds, demand: next.variant.demand };
    return [
      { item: { ...item, plannedSeconds: item.plannedSeconds - seconds }, explanation },
      { item: added, explanation: { ...explanation, whyExercise: purpose === "preparation"
        ? `${next.exercise.name} adds a low-load preparation movement within the same work and rest budget.`
        : `${next.exercise.name} continues the gentle reset within its existing time budget.` } },
    ];
  });
  const definitionReferences = [...original.definitionReferences, ...addedReferences, { kind: "policy" as const, id: policyId, version }]
    .filter((ref, index, all) => all.findIndex((candidate) => candidate.kind === ref.kind && candidate.id === ref.id) === index)
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const rationale = [...original.rationale, { code: parseStableId("reason", "planning-mixed-workout-structure"),
    message: "Light preparation rounds, focused skill and strength sets, compatible supporting rounds and a gentle reset. Planned rest is retained." }];
  const identity = stableHash(JSON.stringify({ original, policyId, version, entries, definitionReferences, rationale }));
  const items = entries.map(({ item }, index): SessionPlanItem => ({ ...item, id: parseStableId("plan-item", `mixed-item-${identity}-${index + 1}`) }));
  const itemExplanations: ItemExplanation[] = entries.map(({ explanation }, index) => ({ ...explanation, planItemId: items[index]!.id }));
  const selected = new Set(items.map((item) => `${item.exerciseId}@${item.exerciseDefinitionVersion}:${item.prescriptionVariantId}`));
  return {
    ...generated,
    generatorPolicyId: policyId,
    generatorPolicyVersion: version,
    plan: {
      ...original,
      id: parseStableId("session-plan", `mixed-plan-${identity}`),
      generatorPolicyId: policyId,
      generatorPolicyVersion: version,
      items,
      definitionReferences,
      rationale,
    },
    itemExplanations,
    trainabilityUsed: [...generated.trainabilityUsed, ...addedTrainability].filter((item) =>
      selected.has(`${item.exerciseId}@${item.exerciseDefinitionVersion}:${item.prescriptionVariantId}`)),
  };
};

export const generateMixedVNextSession = (input: GenerateSessionInput): GeneratedSession =>
  mixedPlan(input, generateVNextSession(input));

export const generateMixedVNextCustomSession = (
  input: GenerateSessionInput,
  minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter,
): GeneratedSession => mixedPlan(input, generateVNextCustomSession(input, minutes, contentFilter), Boolean(contentFilter));
