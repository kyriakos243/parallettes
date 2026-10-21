import type {
  BenchmarkProtocol,
  DefinitionBundle,
  DemandDomain,
  GraphId,
} from "../contracts";
import type { GuidedTestOffer } from "../assessment/contracts";
import type {
  AssessmentEntryAction,
  AssessmentEntryInput,
  AssessmentEntryPresentation,
} from "./contracts";

const blockerMessage = (blocker: string): string => blocker === "missing-equipment"
  ? "Required equipment is not currently selected."
  : blocker === "active-restriction"
    ? "A current restriction affects this test."
    : blocker === "inversion-not-familiar"
      ? "Build inversion familiarity first."
      : blocker === "reacclimation-required"
        ? "Use gradual reacclimation before this inversion test."
        : blocker === "prerequisite-confirmation-needed"
          ? "Confirm the earlier safe step first."
          : blocker === "check-another-day" ? "You have already practised this today. Continue on a later day."
          : blocker === "recover-before-check" ? "Rest after recent difficult or demanding work. Check on a later training day when recovered."
          : blocker === "exit-confirmation-needed" ? "Confirm the safe wall-height exit first."
          : blocker === "safety-prerequisite-not-current" ? "Reconfirm the earlier exit and inversion safety checks first. Your achievements are kept."
          : blocker === "specialist-opt-in-required" ? "This optional skill requires specialist training to be enabled."
          : "This check is not currently available.";

const protocolFor = (
  bundle: DefinitionBundle,
  protocolId: GuidedTestOffer["protocolId"],
): BenchmarkProtocol | undefined => bundle.benchmarkProtocols
  .find((candidate) => candidate.id === protocolId);

const graphIdForProtocol = (
  bundle: DefinitionBundle,
  protocolId: GuidedTestOffer["protocolId"],
): GraphId | undefined => {
  const subject = protocolFor(bundle, protocolId)?.subject;
  return subject?.kind === "milestone" ? subject.milestone.graphId : undefined;
};

const demandDomainsForProtocol = (
  bundle: DefinitionBundle,
  protocol: BenchmarkProtocol,
): readonly DemandDomain[] => {
  const exercise = bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((candidate) =>
    candidate.id === protocol.prescriptionVariantId) ?? exercise?.prescriptionVariants[0];
  return Object.entries(variant?.demand ?? {})
    .filter(([, level]) => level === "moderate" || level === "high")
    .map(([domain]) => domain as DemandDomain);
};

const restrictionBlockers = (
  bundle: DefinitionBundle,
  input: AssessmentEntryInput,
  protocol: BenchmarkProtocol,
): readonly string[] => {
  const restricted = new Set(input.state.activeRestrictions.flatMap((item) => item.demandDomains));
  return demandDomainsForProtocol(bundle, protocol).some((domain) => restricted.has(domain))
    ? ["A current restriction affects this test."]
    : [];
};

const actionForOffer = (
  offer: GuidedTestOffer,
  input: AssessmentEntryInput,
): AssessmentEntryAction => {
  const graphId = graphIdForProtocol(input.bundle, offer.protocolId);
  const subject = offer.subject;
  const confirmationBuilding = subject.kind === "milestone"
    && input.state.nodeStates.some((finding) => finding.milestone.graphId === subject.milestone.graphId
      && finding.milestone.nodeId === subject.milestone.nodeId
      && finding.lifecycle === "demonstrated" && finding.confidence === "current");
  const reconfirming = offer.reason === "reconfirm-existing" && !confirmationBuilding;
  return {
    id: `${offer.reason}:${offer.protocolId}`,
    kind: reconfirming ? "reconfirmation" : "guided-test",
    label: confirmationBuilding ? `Complete confirmation for ${offer.label}` : reconfirming
      ? `Reconfirm ${offer.label}`
      : `Check ${offer.label}`,
    description: confirmationBuilding ? "Your clean result is saved. Complete the remaining qualifying checks before progressing."
      : offer.reason === "confirm-provisional"
      ? "Confirm a provisional placement with the approved movement standard."
      : offer.reason === "resolve-uncertainty"
        ? "Use a short guided test to replace uncertainty with an observed result."
        : "Update current availability without removing the earlier achievement.",
    mode: "targeted-reconfirmation",
    ...(graphId ? { graphId } : {}),
    protocolIds: [offer.protocolId],
    availability: offer.availability,
    blockers: offer.blockers.map(blockerMessage),
  };
};

const derivedReconfirmationActions = (
  input: AssessmentEntryInput,
  offeredProtocols: ReadonlySet<string>,
): readonly AssessmentEntryAction[] => {
  const byGraph = new Map<GraphId, BenchmarkProtocol[]>();
  for (const finding of input.state.nodeStates) {
    if ((finding.lifecycle !== "demonstrated" && finding.lifecycle !== "established")
      || (finding.confidence !== "stale" && finding.confidence !== "contradicted")) continue;
    const graph = input.bundle.graphs.find((candidate) => candidate.id === finding.milestone.graphId);
    const node = graph?.nodes.find((candidate) => candidate.id === finding.milestone.nodeId);
    const protocol = node?.benchmarkProtocolIds
      .map((id) => protocolFor(input.bundle, id))
      .find((candidate): candidate is BenchmarkProtocol => candidate !== undefined);
    if (!protocol || offeredProtocols.has(protocol.id)) continue;
    const current = byGraph.get(finding.milestone.graphId) ?? [];
    current.push(protocol);
    byGraph.set(finding.milestone.graphId, current);
  }
  return [...byGraph.entries()].map(([graphId, protocols]) => {
    const graph = input.bundle.graphs.find((candidate) => candidate.id === graphId);
    const blockers = [...new Set(protocols.flatMap((protocol) =>
      restrictionBlockers(input.bundle, input, protocol)))];
    return {
      id: `reconfirmation:${graphId}`,
      kind: "reconfirmation" as const,
      label: `Reconfirm ${graph?.label ?? "current ability"}`,
      description: "Check only the relevant current finding. Your achievement history remains unchanged.",
      mode: "targeted-reconfirmation" as const,
      graphId,
      protocolIds: protocols.map((protocol) => protocol.id),
      availability: blockers.length ? "blocked" as const : "available" as const,
      blockers,
    };
  });
};

const postRestrictionReconfirmationAction = (
  input: AssessmentEntryInput,
): AssessmentEntryAction | undefined => {
  if (!input.state.reconfirmationRequirements.length) return undefined;
  const requiredDomains = new Set(input.state.reconfirmationRequirements.flatMap((item) => item.demandDomains));
  const stillRestricted = input.state.activeRestrictions.some((restriction) =>
    restriction.demandDomains.some((domain) => requiredDomains.has(domain)));
  return {
    id: "post-restriction-reconfirmation",
    kind: "reconfirmation",
    label: "Reconfirm after recent feedback",
    description: "Review only the affected movement demands. Previously demonstrated achievements remain in your history.",
    mode: "targeted-reconfirmation",
    protocolIds: [],
    availability: stillRestricted ? "blocked" : "available",
    blockers: stillRestricted ? ["Clear or update the current restriction before testing the affected demand."] : [],
  };
};

export const buildAssessmentEntryPoints = (
  input: AssessmentEntryInput,
): AssessmentEntryPresentation => {
  if (input.state.athleteId !== input.intent.athleteId) {
    throw new TypeError("Assessment entry state and Athlete Intent belong to different athletes");
  }
  const hasExistingFinding = input.hasExistingObservationHistory === true
    || input.state.nodeStates.some((finding) => finding.lifecycle !== "unknown")
    || input.state.capacityFindings.some((finding) => finding.finding !== "unknown");
  const baseAction: AssessmentEntryAction = {
    id: hasExistingFinding ? "targeted-reassessment" : "initial-placement",
    kind: "reassessment",
    label: hasExistingFinding ? "Review my current starting point" : "Find my starting point",
    description: hasExistingFinding
      ? input.placementVersion === 2 ? "Workouts feel too easy? Update your starting skills and confirm what you can do. Your history stays." : "Update your restrictions and check the skills that need attention."
      : "Answer a few questions to help choose suitable exercises. You can finish later.",
    mode: hasExistingFinding && input.placementVersion !== 2 ? "targeted-reconfirmation" : "new-placement",
    protocolIds: [],
    availability: "available",
    blockers: [],
  };
  const offers = (input.guidedTestOffers ?? []).map((offer) => actionForOffer(offer, input));
  const offeredProtocols = new Set(offers.flatMap((action) => action.protocolIds));
  const reconfirmations = derivedReconfirmationActions(input, offeredProtocols);
  const postRestriction = postRestrictionReconfirmationAction(input);
  return {
    title: "Check or update my starting point",
    intro: hasExistingFinding
      ? "Check a skill again after time away, uncertainty or a change in restrictions."
      : "Find a starting point, then build confidence through practice and guided checks.",
    actions: [baseAction, ...offers, ...reconfirmations, ...(postRestriction ? [postRestriction] : [])],
    canManuallyClaimSkills: false,
    authorityNotice: "Your answers help choose suitable practice. Guided checks and qualifying training confirm skills.",
  };
};
