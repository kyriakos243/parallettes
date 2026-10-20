import type { BenchmarkProtocol, DefinitionBundle, DemandDomain, DerivedAthleteState, EquipmentId } from "../contracts";
import { restrictionExposureDomains, type ProjectionPolicy } from "../projection";
import { missingCurrentSafetyPrerequisites } from "../projection/safetyPrerequisites";

/** Current physical safety for an exact check, independent of placement entry rules. */
export const currentCheckSafetyBlockers = (input: Readonly<{
  protocol: BenchmarkProtocol;
  bundle: DefinitionBundle;
  state?: DerivedAthleteState;
  equipment: readonly EquipmentId[];
  restrictedDomains?: ReadonlySet<DemandDomain>;
  policy: ProjectionPolicy;
}>): readonly string[] => {
  const { protocol, bundle, state, policy } = input;
  const exercise = bundle.exercises.find((item) => item.id === protocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((item) => item.id === protocol.prescriptionVariantId);
  if (!exercise || !variant) return ["missing-prescription"];
  const request = { exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id };
  const blockers: string[] = [];
  if (policy.requireCurrentSafetyPrerequisites && protocol.subject.kind === "milestone"
    && missingCurrentSafetyPrerequisites({ milestone: protocol.subject.milestone, bundle, state }).length) {
    blockers.push("safety-prerequisite-not-current");
  }
  const additionalEquipment = (policy.additionalEquipmentRules ?? []).filter((rule) =>
    rule.exerciseId === request.exerciseId && rule.exerciseDefinitionVersion === request.exerciseDefinitionVersion
      && rule.prescriptionVariantIds.includes(request.prescriptionVariantId)).flatMap((rule) => rule.equipment);
  if ([...exercise.equipment, ...protocol.conditions.equipment, ...additionalEquipment]
    .some((id) => !input.equipment.includes(id))) blockers.push("missing-equipment");
  const restricted = new Set([...input.restrictedDomains ?? [],
    ...state?.activeRestrictions.flatMap((restriction) => restriction.demandDomains) ?? []]);
  if ([...restrictionExposureDomains(request, variant.demand, policy)].some((domain) => restricted.has(domain))) {
    blockers.push("active-restriction");
  }
  if (state?.recentLoad.exposures.some((item) =>
    Date.parse(item.occurredAt) >= Date.parse(state.asOf) - policy.highLoadModificationHours * 3_600_000
      && Object.entries(variant.demand).some(([domain, level]) => level === "high" && item.demand[domain as DemandDomain] === "high")
    || Date.parse(item.occurredAt) >= Date.parse(state.asOf) - policy.difficultPerformanceModificationHours * 3_600_000
      && item.exerciseId === exercise.id && item.exerciseDefinitionVersion === exercise.definitionVersion
      && item.prescriptionVariantId === variant.id && (item.reviewDifficulty === "hard" || item.reviewOutcome === "not-today"))) {
    blockers.push("recover-before-check");
  }
  return blockers;
};
