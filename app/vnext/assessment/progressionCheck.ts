import type { AthleteEvidenceEvent, AthleteIntent, BenchmarkProtocol, BenchmarkSubject, DefinitionBundle, DerivedAthleteState, MilestoneRef, PrerequisiteRef } from "../contracts";
import type { GeneratedSession } from "../planning/contracts";
import { evaluateTrainability, projectionReasonCodes, type ProjectionPolicy } from "../projection";
import type { AssessmentDraft, GuidedTestOffer } from "./contracts";
import { protocolPrerequisitesSatisfied, stateSatisfiesSubject } from "./evidence";
import { currentCheckSafetyBlockers } from "./checkSafety";

export type ProgressionCheckRecommendation = Readonly<{
  catalogueVersion: DefinitionBundle["catalogueVersion"];
  offer: GuidedTestOffer;
  target: string;
  why: string;
  when: string;
  confirmation: string;
}>;

type CheckContext = Readonly<{
  bundle: DefinitionBundle;
  state: DerivedAthleteState;
  intent: AthleteIntent;
  projectionPolicy: ProjectionPolicy;
  assessmentDraft?: AssessmentDraft;
}>;

const subjectKey = (subject: BenchmarkSubject): string => subject.kind === "milestone"
  ? `milestone:${subject.milestone.graphId}:${subject.milestone.nodeId}`
  : `capacity:${subject.capacity.capacityId}:${subject.capacity.facetId}`;

const targetLabel = (protocol: BenchmarkProtocol): string => {
  const metric = protocol.metric;
  if (metric.kind === "duration-seconds" || metric.kind === "repetitions") {
    const amount = metric.maximum !== undefined && metric.maximum !== metric.minimum
      ? `${metric.minimum}–${metric.maximum}` : `${metric.minimum}`;
    return `${amount} ${metric.kind === "duration-seconds" ? "seconds" : "reps"}`;
  }
  if (metric.kind === "successful-attempts") return `${metric.minimumSuccessful} controlled successes in up to ${metric.maximumAttempts} attempts`;
  return metric.description;
};

/** Current test safety, without manufacturing an assessment or safety answer. */
export const progressionCheckOffer = (input: CheckContext, protocol: BenchmarkProtocol): GuidedTestOffer => {
  const { bundle, state, intent, projectionPolicy } = input;
  const blockers: string[] = [];
  blockers.push(...currentCheckSafetyBlockers({ protocol, bundle, state, equipment: intent.equipment, policy: projectionPolicy }));
  const exercise = bundle.exercises.find((item) => item.id === protocol.exerciseId);
  const variant = exercise?.prescriptionVariants.find((item) => item.id === protocol.prescriptionVariantId);
  if (!exercise || !variant) blockers.push("missing-prescription");
  const milestone = protocol.subject.kind === "milestone" ? protocol.subject.milestone : undefined;
  const node = milestone && bundle.graphs.find((graph) => graph.id === milestone.graphId)?.nodes.find((item) => item.id === milestone.nodeId);
  if (node?.programmingBoundary === "specialist" && !intent.preferences.specialistOptIn) blockers.push("specialist-opt-in-required");
  const finding = milestone && state.nodeStates.find((item) => item.milestone.graphId === milestone.graphId && item.milestone.nodeId === milestone.nodeId);
  const reconfirming = finding && (finding.lifecycle === "established" || finding.lifecycle === "demonstrated");
  if (!protocolPrerequisitesSatisfied(protocol, bundle, state, finding?.lifecycle === "established")) blockers.push("prerequisite-confirmation-needed");
  if (protocol.conditions.equipment.some((id) => !intent.equipment.includes(id))) blockers.push("missing-equipment");
  if (exercise && variant) {
    const request = { exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id };
    const evaluation = evaluateTrainability({ request, bundle, state, intent, asOf: state.asOf, policy: projectionPolicy });
    // Exact protocol prerequisites above govern tests. An exercise's other graph
    // links cannot prevent checking a shared capacity needed by those graphs.
    for (const reason of [projectionReasonCodes.activeRestriction, projectionReasonCodes.missingEquipment,
      projectionReasonCodes.specialistOptInRequired, projectionReasonCodes.missingContent]) {
      if (evaluation.reasonCodes.includes(reason)) blockers.push(reason);
    }
    if (evaluation.reasonCodes.includes(projectionReasonCodes.recentHighLoad)
      || evaluation.reasonCodes.includes(projectionReasonCodes.recentDifficultPerformance)) blockers.push("recover-before-check");
    if (variant.demand["inversion-technical"] === "high") {
      const exit = bundle.benchmarkProtocols.find((item) => item.subject.kind === "milestone"
        && item.subject.milestone.graphId === "handstand-balance" && item.subject.milestone.nodeId === "wall-height-side-exit");
      if (protocol.subject.kind === "capacity-facet" && (!exit || !stateSatisfiesSubject(exit.subject, state))) blockers.push("exit-confirmation-needed");
      const context = input.assessmentDraft?.answers;
      if (context?.some((answer) => answer.value.kind === "inversion" && answer.value.familiarity === "none")) blockers.push("inversion-not-familiar");
      if (context?.some((answer) => answer.value.kind === "inactivity" && answer.value.inactivity !== "active")) blockers.push("reacclimation-required");
    }
  }
  if (state.recentLoad.exposures.some((item) => item.exerciseId === protocol.exerciseId
    && item.occurredAt.slice(0, 10) === state.asOf.slice(0, 10))) blockers.push("check-another-day");
  return { protocolId: protocol.id, subject: protocol.subject, label: protocol.label,
    reason: reconfirming ? "reconfirm-existing" : "confirm-provisional",
    availability: blockers.length ? "blocked" : "available", blockers: [...new Set(blockers)] };
};

const whenLabel = (offer: GuidedTestOffer): string => offer.blockers.includes("active-restriction")
  ? "Update your restriction feedback when resolved; use unaffected practice meanwhile."
  : offer.blockers.includes("safety-prerequisite-not-current")
    ? "Reconfirm the earlier exit and inversion safety checks before attempting this movement. Your achievements are kept."
  : offer.blockers.includes("missing-equipment") ? "Select the required equipment before this check."
    : offer.blockers.includes("recover-before-check") ? "Rest after recent difficult or demanding work. Check on a later training day when recovered."
      : offer.blockers.includes("check-another-day") ? "You have already trained this movement today. Check on another day when recovered."
        : offer.blockers.includes("inversion-not-familiar") || offer.blockers.includes("reacclimation-required")
          ? "Build comfort with supported practice, then update your starting point before this upside-down check."
          : offer.availability === "blocked" ? "Complete the earlier readiness checks before attempting this movement."
            : "Before your next workout, after warming up and when comfortable and recovered. The check counts toward today's training.";

/** The same exact protocol and current safety gate serve Today and skill detail. */
export const describeProgressionCheck = (
  input: CheckContext,
  protocol: BenchmarkProtocol,
  why = `Confirm ${protocol.label} using the displayed movement standard. Your earlier achievements are kept.`,
): ProgressionCheckRecommendation => {
  const offer = progressionCheckOffer(input, protocol);
  return { catalogueVersion: input.bundle.catalogueVersion, offer, target: targetLabel(protocol), why,
    when: whenLabel(offer),
    confirmation: `This standard needs ${protocol.confirmation.qualifyingObservations} qualifying result${protocol.confirmation.qualifyingObservations === 1 ? "" : "s"} across at least ${protocol.confirmation.minimumDistinctSessions} separate training occasion${protocol.confirmation.minimumDistinctSessions === 1 ? "" : "s"}. Earlier achievements are kept.` };
};

const protocolForSubject = (bundle: DefinitionBundle, subject: BenchmarkSubject): BenchmarkProtocol | undefined =>
  bundle.benchmarkProtocols.find((protocol) => subjectKey(protocol.subject) === subjectKey(subject));

const protocolForRef = (bundle: DefinitionBundle, ref: PrerequisiteRef): BenchmarkProtocol | undefined => ref.kind === "benchmark"
  ? bundle.benchmarkProtocols.find((protocol) => protocol.id === ref.benchmarkProtocolId)
  : protocolForSubject(bundle, ref.kind === "milestone" ? { kind: "milestone", milestone: ref.milestone }
    : { kind: "capacity-facet", capacity: ref.capacity });

/** One honest dependency route, shared by Today and family prerequisite checks. */
const unconfirmedCheckDependencies = (input: CheckContext, roots: readonly BenchmarkProtocol[]): BenchmarkProtocol[] => {
  const { bundle, state } = input;
  const forRef = (ref: PrerequisiteRef) => protocolForRef(bundle, ref);
  const candidates: BenchmarkProtocol[] = [];
  const visited = new Set<string>();
  const visit = (protocol: BenchmarkProtocol): void => {
    if (visited.has(protocol.id) || stateSatisfiesSubject(protocol.subject, state)) return;
    visited.add(protocol.id);
    if (protocol.subject.kind === "milestone") {
      const milestone = protocol.subject.milestone;
      const node = bundle.graphs.find((graph) => graph.id === milestone.graphId)?.nodes.find((item) => item.id === milestone.nodeId);
      for (const ref of node?.prerequisiteRule?.allOf ?? []) { const next = forRef(ref); if (next) visit(next); }
      const alternatives = (node?.prerequisiteRule?.anyOf ?? []).map(forRef).filter((item): item is BenchmarkProtocol => Boolean(item));
      if (alternatives.length && !alternatives.some((item) => stateSatisfiesSubject(item.subject, state))) {
        const next = alternatives.find((item) => progressionCheckOffer(input, item).availability === "available") ?? alternatives[0];
        if (next) visit(next);
      }
    } else {
      const exercise = bundle.exercises.find((item) => item.id === protocol.exerciseId);
      const variant = exercise?.prescriptionVariants.find((item) => item.id === protocol.prescriptionVariantId);
      if (variant?.demand["inversion-technical"] === "high") {
        const exit = bundle.benchmarkProtocols.find((item) => item.subject.kind === "milestone"
          && item.subject.milestone.graphId === "handstand-balance" && item.subject.milestone.nodeId === "wall-height-side-exit");
        if (exit) visit(exit);
      }
    }
    candidates.push(protocol);
  };
  roots.forEach(visit);
  return candidates;
};

/** A skill's unmet prerequisite, without restarting placement or changing goals. */
export const recommendPrerequisiteCheck = (
  input: CheckContext,
  target: MilestoneRef,
): ProgressionCheckRecommendation | undefined => {
  const root = protocolForSubject(input.bundle, { kind: "milestone", milestone: target });
  if (!root) return undefined;
  const protocol = unconfirmedCheckDependencies(input, [root]).find((candidate) => candidate.id !== root.id);
  if (!protocol) return undefined;
  const goal = input.bundle.graphs.find((graph) => graph.id === target.graphId)?.label ?? "this skill";
  return describeProgressionCheck(input, protocol,
    `This earlier check is needed for ${goal}. Confirm ${protocol.label} using the displayed movement standard.`);
};

/** One actionable next check; ordinary feedback never becomes an exact measurement. */
export const recommendProgressionCheck = (input: CheckContext & Readonly<{
  generated: GeneratedSession;
  hasPracticeHistory: boolean;
  evidenceEvents?: readonly AthleteEvidenceEvent[];
}>): ProgressionCheckRecommendation | undefined => {
  if (!input.hasPracticeHistory || !input.generated.emphasis) return undefined;
  const { bundle, state } = input;
  const roots: BenchmarkProtocol[] = [];
  const add = (protocol: BenchmarkProtocol | undefined) => { if (protocol && !roots.some((item) => item.id === protocol.id)) roots.push(protocol); };
  const focuses = [input.generated.emphasis.primary, input.generated.emphasis.secondary].filter((focus) => focus !== undefined);
  for (const focus of focuses) {
    if (focus.targetMilestone) add(protocolForSubject(bundle, { kind: "milestone", milestone: focus.targetMilestone }));
    focus.missingPrerequisites.forEach((ref) => add(protocolForRef(bundle, ref)));
  }
  for (const item of input.generated.plan?.items ?? []) {
    if (item.purpose === "preparation" || item.purpose === "recovery" || item.purpose === "maintenance") continue;
    if (item.targetMilestone) add(protocolForSubject(bundle, { kind: "milestone", milestone: item.targetMilestone }));
    for (const protocol of bundle.benchmarkProtocols) if (protocol.exerciseId === item.exerciseId
      && protocol.prescriptionVariantId === item.prescriptionVariantId) add(protocol);
  }
  const candidates = unconfirmedCheckDependencies(input, roots);
  // Retain the earliest dependency if it merely needs recovery/another occasion;
  // do not turn one check prompt into an invitation to test every other skill.
  const protocol = candidates[0];
  if (!protocol) return undefined;
  const goal = bundle.graphs.find((graph) => graph.id === input.generated.emphasis!.primary.graphId)?.label ?? "your main goal";
  const activeSources = new Set(state.recentLoad.exposures.flatMap((item) => item.source.kind === "evidence-event" ? [item.source.eventId] : []));
  const latestResult = input.evidenceEvents?.filter((event) => event.type === "performance_observed"
    && event.benchmarkProtocolId === protocol.id && event.benchmarkProtocolVersion === protocol.definitionVersion
    && event.source === "guided-test" && activeSources.has(event.id)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const resultMessage = latestResult?.type === "performance_observed" && latestResult.outcome !== "clean"
    ? `Your last check did not confirm ${targetLabel(protocol)}. Keep practising the current variation, then repeat this exact check when the target feels controlled.`
    : latestResult?.type === "performance_observed" && latestResult.outcome === "clean"
      ? "A qualifying result is saved. Repeat this same standard on a separate training occasion to finish confirmation."
      : "Workout feedback records useful practice; this check records the exact movement standard needed for the next step.";
  return describeProgressionCheck(input, protocol, `To progress toward ${goal}, confirm ${protocol.label}. ${resultMessage}`);
};
