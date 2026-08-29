import type {
  DemandDomain,
  DemandLevel,
  DemandProfile,
  MilestoneRef,
  ReasonCode,
} from "../contracts";

export const milestoneKey = (milestone: MilestoneRef): string =>
  `${milestone.graphId}:${milestone.nodeId}`;

export const demandRank: Readonly<Record<DemandLevel, number>> = {
  low: 0,
  moderate: 1,
  high: 2,
};

export const materialDemandDomains = (demand: DemandProfile): readonly DemandDomain[] =>
  (Object.entries(demand) as [DemandDomain, DemandLevel][])
    .filter(([, level]) => level === "moderate" || level === "high")
    .map(([domain]) => domain)
    .sort();

export const highDemandDomains = (demand: DemandProfile): readonly DemandDomain[] =>
  (Object.entries(demand) as [DemandDomain, DemandLevel][])
    .filter(([, level]) => level === "high")
    .map(([domain]) => domain)
    .sort();

export const demandsOverlapAtHigh = (
  left: DemandProfile,
  right: DemandProfile,
  domains: readonly DemandDomain[],
): boolean => domains.some((domain) => left[domain] === "high" && right[domain] === "high");

export const mergeDemandProfiles = (profiles: readonly DemandProfile[]): DemandProfile => {
  const merged = new Map<DemandDomain, DemandLevel>();
  for (const profile of profiles) {
    for (const [domain, level] of Object.entries(profile) as [DemandDomain, DemandLevel][]) {
      const current = merged.get(domain);
      if (!current || demandRank[level] > demandRank[current]) merged.set(domain, level);
    }
  }
  return Object.fromEntries([...merged.entries()].sort(([left], [right]) => left.localeCompare(right)));
};

export const uniqueReasons = (reasons: readonly ReasonCode[]): readonly ReasonCode[] =>
  [...new Set(reasons)].sort((left, right) => left.localeCompare(right));

/** Stable, non-security hash for deterministic ordering and idempotent IDs. */
export const stableHash = (value: string): string => {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds.map((seed) => {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash = (hash ^ (hash >>> 13)) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }).join("");
};

export const seededOrder = (seed: string, value: string): string =>
  stableHash(`${seed}:${value}`);

export const isCanonicalIsoTimestamp = (value: string): boolean => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};
