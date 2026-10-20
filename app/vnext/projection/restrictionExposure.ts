import type { DemandDomain, DemandProfile } from "../contracts";
import type { ProjectionPolicy, TrainabilityRequest } from "./contracts";

/**
 * Low ordinal training load does not mean that the hands never bear weight.
 * Current safety policy may identify that contact without reclassifying the
 * immutable prescription, its history, recent-load totals or progression proof.
 */
export const restrictionExposureDomains = (
  request: TrainabilityRequest,
  demand: DemandProfile,
  policy: ProjectionPolicy,
): ReadonlySet<DemandDomain> => new Set([
  ...(Object.entries(demand) as [DemandDomain, string][])
    .filter(([, level]) => level === "moderate" || level === "high")
    .map(([domain]) => domain),
  ...(policy.restrictionExposureRules ?? []).filter((rule) =>
    rule.exerciseId === request.exerciseId
      && rule.exerciseDefinitionVersion === request.exerciseDefinitionVersion
      && rule.prescriptionVariantIds.includes(request.prescriptionVariantId))
    .flatMap((rule) => rule.demandDomains),
]);
