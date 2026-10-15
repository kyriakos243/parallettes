import {
  parseStableId,
  type CapacityId,
  type DefinitionBundle,
  type DefinitionReference,
  type SessionPlanItem,
} from "../contracts";
import { evaluateTrainability } from "../projection";
import type {
  GenerateSessionInput,
  GeneratedSession,
  ItemExplanation,
  PlannedTrainability,
} from "./contracts";
import { generateVNextSession } from "./composer";

export type VNextCustomSessionMinutes = 5 | 10 | 15 | 20;

export type VNextCustomContentFilter = Readonly<{
  label: string;
  capacityIds: readonly CapacityId[];
}>;

const isDevelopment = (item: SessionPlanItem): boolean =>
  item.purpose !== "preparation" && item.purpose !== "recovery";

const supportsContentFilter = (
  item: SessionPlanItem,
  bundle: DefinitionBundle,
  contentFilter: VNextCustomContentFilter,
): boolean => {
  const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
    && candidate.definitionVersion === item.exerciseDefinitionVersion);
  return Boolean(exercise
    && exercise.roles.includes("capacity-accessory")
    && exercise.capacityLinks.some((link) => contentFilter.capacityIds.includes(link.capacityId)));
};

type CustomCapacityCandidate = Readonly<{
  item: SessionPlanItem;
  explanation: ItemExplanation;
  trainability: PlannedTrainability;
  references: readonly DefinitionReference[];
}>;

const developmentItemLimit = (minutes: VNextCustomSessionMinutes): number => {
  if (minutes === 5) return 1;
  if (minutes === 20) return 3;
  return 2;
};

const customCapacityCandidates = (
  input: GenerateSessionInput,
  contentFilter: VNextCustomContentFilter,
  limit: number,
  excludedExerciseIds: ReadonlySet<SessionPlanItem["exerciseId"]>,
): readonly CustomCapacityCandidate[] => {
  const candidates = input.bundle.exercises.flatMap((exercise) => {
    if (exercise.lifecycle !== "active"
      || !exercise.roles.includes("capacity-accessory")
      || exercise.roles.includes("outcome-milestone")
      || exercise.roles.includes("benchmark-test")
      || !exercise.capacityLinks.some((link) => contentFilter.capacityIds.includes(link.capacityId))) return [];
    return exercise.prescriptionVariants.flatMap((variant) => {
      const evaluation = evaluateTrainability({
        request: {
          exerciseId: exercise.id,
          exerciseDefinitionVersion: exercise.definitionVersion,
          prescriptionVariantId: variant.id,
        },
        state: input.state,
        bundle: input.bundle,
        asOf: input.createdAt,
        policy: input.projectionPolicy,
        intent: input.intent,
      });
      return evaluation.decision === "allow" ? [{ exercise, variant, evaluation }] : [];
    });
  }).sort((left, right) => {
    const leftPreferred = input.sessionDemand === "technique" ? left.variant.id.endsWith("-regressed") : !left.variant.id.endsWith("-regressed");
    const rightPreferred = input.sessionDemand === "technique" ? right.variant.id.endsWith("-regressed") : !right.variant.id.endsWith("-regressed");
    return Number(rightPreferred) - Number(leftPreferred)
      || left.exercise.id.localeCompare(right.exercise.id)
      || left.variant.id.localeCompare(right.variant.id);
  });
  const selectedExerciseIds = new Set(excludedExerciseIds);
  return candidates.flatMap((selected): readonly CustomCapacityCandidate[] => {
    if (selectedExerciseIds.has(selected.exercise.id)) return [];
    selectedExerciseIds.add(selected.exercise.id);
    const id = parseStableId("plan-item", `vnext-custom-capacity-${selected.exercise.id}-${selected.variant.id}`);
    const references: DefinitionReference[] = [
      { kind: "exercise", id: selected.exercise.id, version: selected.exercise.definitionVersion },
      ...selected.exercise.capacityLinks
        .filter((link) => contentFilter.capacityIds.includes(link.capacityId))
        .map((link): DefinitionReference => ({
          kind: "capacity",
          id: link.capacityId,
          version: input.bundle.capacities.find((capacity) => capacity.id === link.capacityId)?.definitionVersion
            ?? input.bundle.catalogueVersion,
        })),
    ];
    return [{
      item: {
        id,
        exerciseId: selected.exercise.id,
        exerciseDefinitionVersion: selected.exercise.definitionVersion,
        prescriptionVariantId: selected.variant.id,
        purpose: "primary-development",
        plannedSeconds: 60,
        demand: selected.variant.demand,
      },
      explanation: {
        planItemId: id,
        block: "supporting-capacity",
        reasonCodes: selected.evaluation.reasonCodes,
        whySkill: `${contentFilter.label} was explicitly selected for this Custom Session.`,
        whyExercise: `${selected.exercise.name} is an already-trainable capacity movement linked to that focus.`,
        whyIntensity: "The exact prescription passed the current vNext trainability, equipment and restriction checks.",
      },
      trainability: {
        exerciseId: selected.exercise.id,
        exerciseDefinitionVersion: selected.exercise.definitionVersion,
        prescriptionVariantId: selected.variant.id,
        decision: selected.evaluation.decision,
        reasonCodes: selected.evaluation.reasonCodes,
      },
      references,
    }];
  }).slice(0, limit);
};

const allocate = (
  items: readonly SessionPlanItem[],
  bundle: DefinitionBundle,
  minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter,
): readonly Readonly<{ item: SessionPlanItem; seconds: number }>[] => {
  const preparation = items.find((item) => item.purpose === "preparation");
  const recovery = [...items].reverse().find((item) => item.purpose === "recovery");
  const development = items.filter((item) => {
    if (!isDevelopment(item)) return false;
    if (!contentFilter) return true;
    return supportsContentFilter(item, bundle, contentFilter);
  });
  if (!development.length) return [];
  const total = minutes * 60;
  const preparationSeconds = preparation ? (minutes === 5 ? 60 : 120) : 0;
  const recoverySeconds = recovery ? 60 : 0;
  const developmentSeconds = total - preparationSeconds - recoverySeconds;
  const chosenDevelopment = development.slice(0, developmentItemLimit(minutes));
  const developmentMinutes = developmentSeconds / 60;
  const developmentAllocations = chosenDevelopment.length === 1
    ? [developmentMinutes]
    : chosenDevelopment.length === 2
      ? [Math.ceil(developmentMinutes * .56), Math.floor(developmentMinutes * .44)]
      : [
        Math.round(developmentMinutes * .42),
        Math.round(developmentMinutes * .30),
        developmentMinutes - Math.round(developmentMinutes * .42) - Math.round(developmentMinutes * .30),
      ];
  const allocations = [
    ...(preparation ? [{ item: preparation, seconds: preparationSeconds }] : []),
    ...chosenDevelopment.map((item, index) => ({
      item,
      seconds: developmentAllocations[index]! * 60,
    })),
    ...(recovery ? [{ item: recovery, seconds: recoverySeconds }] : []),
  ].filter((entry) => entry.seconds > 0);
  const actual = allocations.reduce((sum, entry) => sum + entry.seconds, 0);
  if (actual !== total) allocations[allocations.length - 1] = {
    ...allocations[allocations.length - 1]!,
    seconds: allocations[allocations.length - 1]!.seconds + total - actual,
  };
  return allocations;
};

/**
 * A one-off short session is generated from the exact vNext athlete state and
 * safe planner first, then reduced to a compact preparation/development/reset
 * sequence. It never invokes or translates the legacy custom generator.
 */
export const generateVNextCustomSession = (
  input: GenerateSessionInput,
  minutes: VNextCustomSessionMinutes,
  contentFilter?: VNextCustomContentFilter,
): GeneratedSession => {
  const generated = generateVNextSession(input);
  if (!generated.ok || !generated.plan) return generated;
  const matchingDevelopment = contentFilter
    ? generated.plan.items.filter((item) => isDevelopment(item)
      && supportsContentFilter(item, input.bundle, contentFilter))
    : [];
  const capacityCandidates = contentFilter
    ? customCapacityCandidates(
      input,
      contentFilter,
      Math.max(0, developmentItemLimit(minutes) - matchingDevelopment.length),
      new Set(generated.plan.items.filter(isDevelopment).map((item) => item.exerciseId)),
    )
    : [];
  const sourceItems = capacityCandidates.length ? (() => {
    const recoveryIndex = generated.plan!.items.findIndex((item) => item.purpose === "recovery");
    return recoveryIndex < 0
      ? [...generated.plan!.items, ...capacityCandidates.map((candidate) => candidate.item)]
      : generated.plan!.items.flatMap((item, index) => index === recoveryIndex
        ? [...capacityCandidates.map((candidate) => candidate.item), item]
        : [item]);
  })() : generated.plan.items;
  const allocations = allocate(sourceItems, input.bundle, minutes, contentFilter);
  if (!allocations.length) {
    const { plan: _plan, ...withoutPlan } = generated;
    return {
    ...withoutPlan,
    ok: false,
    itemExplanations: [],
    trainabilityUsed: [],
    issues: [...generated.issues, {
      severity: "error",
      code: parseStableId("reason", "planning-no-safe-relevant-candidate"),
      message: contentFilter
        ? `No safe ${contentFilter.label.toLowerCase()} item is available for this short session.`
        : "No safe development item is available for this short session.",
    }],
    };
  }
  const suffix = `${minutes}-${generated.plan.id}`;
  const idMap = new Map<string, SessionPlanItem["id"]>();
  const items = allocations.map(({ item, seconds }, index): SessionPlanItem => {
    const id = parseStableId("plan-item", `vnext-custom-${suffix}-${index + 1}`);
    idMap.set(item.id, id);
    return { ...item, id, plannedSeconds: seconds };
  });
  const explanationById = new Map([
    ...generated.itemExplanations.map((item) => [item.planItemId, item] as const),
    ...capacityCandidates.map((candidate) => [candidate.item.id, candidate.explanation] as const),
  ]);
  const itemExplanations = allocations.flatMap(({ item }): ItemExplanation[] => {
    const explanation = explanationById.get(item.id);
    const planItemId = idMap.get(item.id);
    return explanation && planItemId ? [{ ...explanation, planItemId }] : [];
  });
  const selectedIdentity = new Set(items.map((item) =>
    `${item.exerciseId}:${item.exerciseDefinitionVersion}:${item.prescriptionVariantId}`));
  const plan = {
    ...generated.plan,
    id: parseStableId("session-plan", `vnext-custom-${suffix}`),
    intendedDurationSeconds: minutes * 60,
    items,
    definitionReferences: [...generated.plan.definitionReferences, ...capacityCandidates.flatMap((candidate) => candidate.references)]
      .filter((reference, index, all) => all.findIndex((candidate) =>
        candidate.kind === reference.kind && candidate.id === reference.id) === index)
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)),
    rationale: [{
      code: parseStableId("reason", "planning-custom-short-session"),
      message: `${minutes}-minute vNext Custom Session: the safe planner selected the focus first, then retained only preparation, ${contentFilter ? `trainable ${contentFilter.label.toLowerCase()} work` : "the highest-priority available development work"} and a reset.`,
      ...(generated.emphasis ? { relatedGraphId: generated.emphasis.primary.graphId } : {}),
    }, ...generated.plan.rationale],
  };
  const { durationException: _durationException, ...withoutDurationException } = generated;
  return {
    ...withoutDurationException,
    plan,
    itemExplanations,
    trainabilityUsed: [...generated.trainabilityUsed, ...capacityCandidates.map((candidate) => candidate.trainability)]
      .filter((item) => selectedIdentity.has(
      `${item.exerciseId}:${item.exerciseDefinitionVersion}:${item.prescriptionVariantId}`)),
    issues: generated.issues.filter((issue) => issue.code !== parseStableId("reason", "planning-shorter-safety-exception")),
  };
};
