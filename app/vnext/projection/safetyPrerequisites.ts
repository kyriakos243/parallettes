import type { DefinitionBundle, DerivedAthleteState, MilestoneRef, PrerequisiteRef } from "../contracts";

// These are the existing graph's explicit safety/readiness outcomes. Strength,
// balance performance and mobility predecessors are deliberately not included.
// Current safety cannot be inferred from unrelated strength achievements.
const safetyMilestoneKeys = new Set([
  "handstand-balance:grounded-side-exit",
  "handstand-balance:low-inversion-side-exit",
  "handstand-balance:supported-inversion-tolerance",
  "handstand-balance:wall-height-side-exit",
  "vertical-push-hspu:wall-hspu-bottom-position-exit",
  "vertical-push-hspu:deficit-wall-hspu-bottom-position-exit",
]);

const keyFor = (milestone: MilestoneRef): string => `${milestone.graphId}:${milestone.nodeId}`;

/**
 * Safety prerequisites remain current even when a previously achieved movement
 * is being reconfirmed. The target itself is excluded so each exit can be
 * rechecked after its earlier safety stages, without re-earning old strength.
 * Callers opt in through the current projection policy; native replay is intact.
 */
export const missingCurrentSafetyPrerequisites = (input: Readonly<{
  milestone: MilestoneRef;
  bundle: DefinitionBundle;
  state?: Pick<DerivedAthleteState, "nodeStates">;
}>): readonly MilestoneRef[] => {
  const nodes = new Map(input.bundle.graphs.flatMap((graph) => graph.nodes.map((node) =>
    [keyFor({ graphId: graph.id, nodeId: node.id }), node] as const)));
  const findings = new Map(input.state?.nodeStates.map((finding) => [keyFor(finding.milestone), finding] as const));
  const current = (milestone: MilestoneRef): boolean => {
    const finding = findings.get(keyFor(milestone));
    if (finding?.lifecycle === "established" && finding.confidence === "current") return true;
    // Retain the projector's explicit wall-exit -> low-exit -> grounded-exit
    // implications. Only a currently demonstrated safety outcome can supply
    // this existing eligibility proof; a stronger strength skill never can.
    return Boolean(finding?.satisfiedForEligibilityBy.some((proof) => {
      const key = keyFor(proof.milestone);
      const source = findings.get(key);
      return safetyMilestoneKeys.has(key) && source?.lifecycle === "established" && source.confidence === "current";
    }));
  };
  const unique = (refs: readonly MilestoneRef[]): MilestoneRef[] =>
    [...new Map(refs.map((ref) => [keyFor(ref), ref])).values()];
  const visitRef = (ref: PrerequisiteRef, visiting: ReadonlySet<string>): readonly MilestoneRef[] => {
    if (ref.kind === "milestone") return visit(ref.milestone, visiting, true);
    if (ref.kind === "capacity-facet") return [];
    const protocol = input.bundle.benchmarkProtocols.find((item) => item.id === ref.benchmarkProtocolId);
    return protocol?.subject.kind === "milestone" ? visit(protocol.subject.milestone, visiting, true) : [];
  };
  const visit = (milestone: MilestoneRef, visiting: ReadonlySet<string>, includeSelf: boolean): readonly MilestoneRef[] => {
    const key = keyFor(milestone);
    if (visiting.has(key)) return [];
    const next = new Set([...visiting, key]);
    const node = nodes.get(key);
    const required = (node?.prerequisiteRule?.allOf ?? []).flatMap((ref) => visitRef(ref, next));
    const alternatives = (node?.prerequisiteRule?.anyOf ?? []).map((ref) => unique(visitRef(ref, next)));
    // Keep an actual alternative rather than requiring every branch's exits.
    // The full prerequisite evaluator still controls initial skill eligibility.
    if (alternatives.length && !alternatives.some((refs) => refs.length === 0)) {
      alternatives.sort((left, right) => left.length - right.length
        || left.map(keyFor).join("|").localeCompare(right.map(keyFor).join("|")));
      required.push(...alternatives[0]!);
    }
    if (includeSelf && safetyMilestoneKeys.has(key)) {
      if (!current(milestone)) required.push(milestone);
    }
    return unique(required);
  };
  return visit(input.milestone, new Set(), false);
};
