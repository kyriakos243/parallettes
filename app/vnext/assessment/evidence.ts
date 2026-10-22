import {
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type AthleteEvidenceEvent,
  type AthleteId,
  type AthleteIntent,
  type BenchmarkProtocol,
  type BenchmarkSubject,
  type DefinitionBundle,
  type DemandDomain,
  type DerivedAthleteState,
  type EvidenceEventId,
  type EquipmentId,
  type IsoTimestamp,
  type ObservationMeasurement,
  type ObservationSessionId,
  type ObservationSourceRef,
  type PrerequisiteRef,
  type RestrictionClearedEvent,
  type RestrictionReportedEvent,
  type SessionItemOutcome,
  type SessionPlan,
  type SessionRecord,
} from "../contracts";
import type { VNextShadowStore } from "../persistence/contracts";
import { canonicalJson, sha256 } from "../persistence/canonical";
import { validateAthleteEvidenceEvent, validateSessionRecord } from "../validation";
import {
  assessmentPromptTiming,
  demandDomainsForAssessmentProtocol,
  isAssessmentAtReview,
  protocolAnswerRecords,
  selectedAssessmentEquipment,
  selectedAssessmentGoals,
} from "./flow";
import {
  assertAssessmentDraft,
  isCanonicalIsoTimestamp,
  type AssessmentDraft,
  type AssessmentReview,
  type GuidedTestOffer,
  type GuidedTestResultInput,
  type PlacementAnchor,
  type WorkoutReviewPrompt,
} from "./contracts";
import { vNextAssessmentPolicy } from "./policy";
import { placementEntryRuleFor, placementEntryRules, placementReadinessSatisfied, placementSubjectDemonstrated } from "../placementEntry";
import { milestoneBenchmarkId } from "../definitions/ids";
import type { ProjectionPolicy } from "../projection";
import { currentCheckSafetyBlockers } from "./checkSafety";

/** The current projection policy owns the bounded entry list; older policies keep the native list. */
const placementRules = (policy?: ProjectionPolicy) => policy?.measuredPlacementEntries ?? placementEntryRules;

const placementRule = (draft: AssessmentDraft, protocol: BenchmarkProtocol, policy?: ProjectionPolicy) => {
  if (draft.policyVersion !== 2 || !draft.answers.some((answer) => answer.value.kind === "inactivity" && answer.value.inactivity === "active")
    || !draft.answers.some((answer) => answer.value.kind === "skill-selection" && answer.value.protocolId === protocol.id && answer.value.response === "clean")) return undefined;
  return placementEntryRuleFor(protocol.subject, placementRules(policy));
};

/** One UTC calendar day is one guided occasion, across reloads, retries and devices. */
export const guidedObservationOccasionId = (athleteId: string, occurredAt: string): string => {
  if (!isCanonicalIsoTimestamp(occurredAt)) throw new TypeError("Invalid guided occasion time");
  return `guided-day-${athleteId}-${occurredAt.slice(0, 10)}`;
};


const protocolById = (bundle: DefinitionBundle, id: string): BenchmarkProtocol => {
  const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === id);
  if (!protocol) throw new TypeError(`Unknown benchmark protocol ${id}`);
  return protocol;
};

const subjectKey = (subject: BenchmarkSubject): string => subject.kind === "milestone"
  ? `milestone:${subject.milestone.graphId}:${subject.milestone.nodeId}`
  : `capacity:${subject.capacity.capacityId}:${subject.capacity.facetId}`;

export const stateSatisfiesSubject = (
  subject: BenchmarkSubject,
  state: DerivedAthleteState | undefined,
): boolean => {
  if (!state) return false;
  if (subject.kind === "milestone") {
    const finding = state.nodeStates.find((candidate) =>
      candidate.milestone.graphId === subject.milestone.graphId
      && candidate.milestone.nodeId === subject.milestone.nodeId);
    return (finding?.lifecycle === "established" && finding.confidence === "current")
      || Boolean(finding?.satisfiedForEligibilityBy.length);
  }
  const finding = state.capacityFindings.find((candidate) =>
    candidate.capacity.capacityId === subject.capacity.capacityId
    && candidate.capacity.facetId === subject.capacity.facetId);
  return finding?.finding === "demonstrated"
    && finding.confirmationSatisfied
    && finding.confidence === "current";
};

const prerequisiteSatisfied = (
  prerequisite: PrerequisiteRef,
  bundle: DefinitionBundle,
  state: DerivedAthleteState | undefined,
): boolean => {
  if (prerequisite.kind === "milestone") {
    return stateSatisfiesSubject({ kind: "milestone", milestone: prerequisite.milestone }, state);
  }
  if (prerequisite.kind === "capacity-facet") {
    return stateSatisfiesSubject({ kind: "capacity-facet", capacity: prerequisite.capacity }, state);
  }
  const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === prerequisite.benchmarkProtocolId);
  return protocol ? stateSatisfiesSubject(protocol.subject, state) : false;
};

export const protocolPrerequisitesSatisfied = (
  protocol: BenchmarkProtocol,
  bundle: DefinitionBundle,
  state: DerivedAthleteState | undefined,
  reconfirmingEstablished: boolean,
): boolean => {
  if (protocol.subject.kind === "capacity-facet") return true;
  // Rechecking an already-established outcome does not require every older
  // prerequisite to be current; restrictions/equipment still apply above.
  if (reconfirmingEstablished) return true;
  const milestone = protocol.subject.milestone;
  const graph = bundle.graphs.find((candidate) => candidate.id === milestone.graphId);
  const node = graph?.nodes.find((candidate) => candidate.id === milestone.nodeId);
  if (!node || node.implementationStatus !== "available") return false;
  const allOf = node.prerequisiteRule?.allOf ?? [];
  const anyOf = node.prerequisiteRule?.anyOf ?? [];
  return allOf.every((item) => prerequisiteSatisfied(item, bundle, state))
    && (!anyOf.length || anyOf.some((item) => prerequisiteSatisfied(item, bundle, state)));
};

const restrictionDomains = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  state?: DerivedAthleteState,
): ReadonlySet<DemandDomain> => {
  const domains = new Set<DemandDomain>(state?.activeRestrictions.flatMap((item) => item.demandDomains) ?? []);
  for (const answer of draft.answers) {
    if (answer.value.kind === "safety" && answer.value.severity !== "none") {
      for (const domain of answer.value.demandDomains ?? []) domains.add(domain);
    }
  }
  for (const { anchor, answer } of protocolAnswerRecords(draft, undefined, bundle)) {
    if (answer.value.response !== "symptom") continue;
    for (const domain of demandDomainsForAssessmentProtocol(bundle, anchor.protocolId)) domains.add(domain);
  }
  return domains;
};

const availabilityFor = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  protocol: BenchmarkProtocol,
  state: DerivedAthleteState | undefined,
  reason: GuidedTestOffer["reason"],
  currentPolicy?: ProjectionPolicy,
  currentEquipment?: readonly EquipmentId[],
): Pick<GuidedTestOffer, "availability" | "blockers"> => {
  const blockers: string[] = [];
  const equipment = new Set(currentEquipment ?? selectedAssessmentEquipment(draft));
  if (protocol.conditions.equipment.some((item) => !equipment.has(item))) blockers.push("missing-equipment");
  const demands = demandDomainsForAssessmentProtocol(bundle, protocol.id);
  const restricted = restrictionDomains(draft, bundle, state);
  if (currentPolicy) blockers.push(...currentCheckSafetyBlockers({ protocol, bundle, state,
    equipment: [...equipment], restrictedDomains: restricted, policy: currentPolicy }));
  if (demands.some((domain) => restricted.has(domain))) blockers.push("active-restriction");
  const exerciseVersion = bundle.exercises.find((item) => item.id === protocol.exerciseId)?.definitionVersion;
  if (state?.trainabilityEvaluations.some((item) => item.exerciseId === protocol.exerciseId
    && item.exerciseDefinitionVersion === exerciseVersion
    && item.prescriptionVariantId === protocol.prescriptionVariantId
    && item.reasonCodes.some((code) => code === "active-restriction"))) blockers.push("active-restriction");
  const inversion = draft.answers.find((answer) => answer.value.kind === "inversion")?.value;
  const anchor = protocolAnswerRecords(draft, undefined, bundle).find((item) => item.anchor.protocolId === protocol.id)?.anchor;
  if (anchor?.inversionExposure === "full"
    && inversion?.kind === "inversion" && inversion.familiarity === "none") blockers.push("inversion-not-familiar");
  const inactivity = draft.answers.find((answer) => answer.value.kind === "inactivity")?.value;
  if (anchor?.inversionExposure === "full"
    && inactivity?.kind === "inactivity" && inactivity.inactivity === "over-six-months") {
    blockers.push("reacclimation-required");
  }
  const milestone = protocol.subject.kind === "milestone" ? protocol.subject.milestone : undefined;
  const existingFinding = milestone ? state?.nodeStates.find((item) =>
    item.milestone.graphId === milestone.graphId
    && item.milestone.nodeId === milestone.nodeId) : undefined;
  const reconfirmingEstablished = reason === "reconfirm-existing" && existingFinding?.lifecycle === "established";
  const entryReady = placementReadinessSatisfied(placementRule(draft, protocol, currentPolicy), bundle, state, placementRules(currentPolicy));
  if (!entryReady && !protocolPrerequisitesSatisfied(protocol, bundle, state, reconfirmingEstablished)) {
    blockers.push("prerequisite-confirmation-needed");
  }
  if (draft.policyVersion === 2) {
    const exercise = bundle.exercises.find((item) => item.id === protocol.exerciseId);
    const variant = exercise?.prescriptionVariants.find((item) => item.id === protocol.prescriptionVariantId);
    const fullInversion = variant?.demand["inversion-technical"] === "high";
    if (fullInversion && inversion?.kind === "inversion" && inversion.familiarity === "none") blockers.push("inversion-not-familiar");
    if (fullInversion && inactivity?.kind === "inactivity" && inactivity.inactivity !== "active") blockers.push("reacclimation-required");
    // Capacity protocols are not a back door around the handstand exit graph.
    if (protocol.subject.kind === "capacity-facet" && fullInversion) {
      const exit = bundle.benchmarkProtocols.find((item) => item.id === milestoneBenchmarkId("handstand-balance", "wall-height-side-exit"));
      if (!exit || !stateSatisfiesSubject(exit.subject, state)) blockers.push("exit-confirmation-needed");
    }
    if (state?.recentLoad.exposures.some((item) => item.exerciseId === protocol.exerciseId
      && item.occurredAt.slice(0, 10) === state.asOf.slice(0, 10))) blockers.push("check-another-day");
    const node = protocol.subject.kind === "milestone" ? bundle.graphs.find((item) => item.id === milestone?.graphId)
      ?.nodes.find((item) => protocol.subject.kind === "milestone" && item.id === protocol.subject.milestone.nodeId) : undefined;
    if (node?.programmingBoundary === "specialist" && !draft.intentSeed.preferences.specialistOptIn) blockers.push("specialist-opt-in-required");
  }
  return { availability: blockers.length ? "blocked" : "available", blockers: [...new Set(blockers)].sort() };
};

const offerKey = (offer: Pick<GuidedTestOffer, "protocolId">): string => offer.protocolId;

/** Dependency-ordered checks for the selected goal only; no fabricated predecessor evidence. */
const placementReviewChecks = (draft: AssessmentDraft, bundle: DefinitionBundle, state?: DerivedAthleteState,
  currentPolicy?: ProjectionPolicy, currentEquipment?: readonly EquipmentId[]) => {
  const roots = draft.mode === "targeted-reconfirmation"
    ? draft.targetedProtocolIds.map((id) => protocolById(bundle, id))
    : selectedAssessmentGoals(draft).flatMap((graphId) => {
      const answer = draft.answers.find((item) => item.value.kind === "skill-selection" && item.value.graphId === graphId)?.value;
      const id = answer?.kind === "skill-selection" ? answer.protocolId : undefined;
      const graph = bundle.graphs.find((item) => item.id === graphId);
      const first = graph?.nodes.find((node) => node.implementationStatus === "available" && node.programmingBoundary === "automatic");
      const protocol = id ? protocolById(bundle, id) : bundle.benchmarkProtocols.find((item) => first?.benchmarkProtocolIds.includes(item.id));
      return protocol ? [protocol] : [];
    });
  const candidates: GuidedTestOffer[] = [];
  const seen = new Set<string>();
  // Goal-trust review: remember which selected goal first required each check.
  const rootGraphFor = new Map<string, string | undefined>();
  let currentRootGraph: string | undefined;
  const completed = (protocol: BenchmarkProtocol, measured: boolean) => measured
    ? placementSubjectDemonstrated(protocol.subject, state) : stateSatisfiesSubject(protocol.subject, state);
  const forRef = (ref: PrerequisiteRef): BenchmarkProtocol | undefined => ref.kind === "benchmark"
    ? bundle.benchmarkProtocols.find((item) => item.id === ref.benchmarkProtocolId)
    : bundle.benchmarkProtocols.find((item) => subjectKey(item.subject) === subjectKey(ref.kind === "milestone"
      ? { kind: "milestone", milestone: ref.milestone } : { kind: "capacity-facet", capacity: ref.capacity }));
  const visit = (protocol: BenchmarkProtocol, measured = false): void => {
    if (completed(protocol, measured) || seen.has(protocol.id)) return;
    seen.add(protocol.id);
    const entry = placementRule(draft, protocol, currentPolicy);
    if (entry) {
      entry.readinessProtocolIds.forEach((id) => visit(protocolById(bundle, id), true));
    } else if (protocol.subject.kind === "milestone") {
      const milestone = protocol.subject.milestone;
      const node = bundle.graphs.find((graph) => graph.id === milestone.graphId)?.nodes.find((item) => item.id === milestone.nodeId);
      for (const ref of node?.prerequisiteRule?.allOf ?? []) { const next = forRef(ref); if (next) visit(next); }
      const any = node?.prerequisiteRule?.anyOf ?? [];
      if (any.length && !any.some((ref) => prerequisiteSatisfied(ref, bundle, state))) {
        const options = any.map(forRef).filter((item): item is BenchmarkProtocol => Boolean(item));
        const next = options.find((item) => availabilityFor(draft, bundle, item, state, "confirm-provisional", currentPolicy, currentEquipment).availability === "available") ?? options[0];
        if (next) visit(next);
      }
    } else {
      const exercise = bundle.exercises.find((item) => item.id === protocol.exerciseId);
      const variant = exercise?.prescriptionVariants.find((item) => item.id === protocol.prescriptionVariantId);
      if (variant?.demand["inversion-technical"] === "high") {
        const exit = bundle.benchmarkProtocols.find((item) => item.id === milestoneBenchmarkId("handstand-balance", "wall-height-side-exit"));
        if (exit) visit(exit);
      }
    }
    const reason = draft.mode === "targeted-reconfirmation" ? "reconfirm-existing" as const : "confirm-provisional" as const;
    rootGraphFor.set(protocol.id, currentRootGraph);
    candidates.push({ protocolId: protocol.id, subject: protocol.subject, label: protocol.label, reason,
      ...availabilityFor(draft, bundle, protocol, state, reason, currentPolicy, currentEquipment) });
  };
  let checkedCount = 0;
  for (const root of roots) {
    currentRootGraph = root.subject.kind === "milestone" ? root.subject.milestone.graphId : undefined;
    const measured = Boolean(placementRule(draft, root, currentPolicy));
    if (completed(root, measured)) checkedCount++;
    else visit(root, measured);
  }
  // Stable ordering retains goal/dependency priority rather than alphabetically burying useful checks.
  const byAvailability = [...candidates].sort((a, b) => Number(a.availability === "blocked") - Number(b.availability === "blocked"));
  const mainGraph = selectedAssessmentGoals(draft)[0];
  const ordered = currentPolicy?.mainGoalFirstPlacementReview && draft.mode !== "targeted-reconfirmation" && mainGraph
    ? (() => {
      // While the main goal has an available check, show it first and at most
      // one supporting-goal check; supporting checks follow once it is done.
      const isMain = (offer: GuidedTestOffer) => rootGraphFor.get(offer.protocolId) === mainGraph;
      const mainAvailable = candidates.filter((offer) => isMain(offer) && offer.availability === "available");
      const supportingAvailable = candidates.filter((offer) => !isMain(offer) && offer.availability === "available");
      const mainBlocked = candidates.filter((offer) => isMain(offer) && offer.availability === "blocked");
      const supportingBlocked = candidates.filter((offer) => !isMain(offer) && offer.availability === "blocked");
      return mainAvailable.length
        ? [...mainAvailable, ...supportingAvailable.slice(0, 1), ...mainBlocked]
        : [...supportingAvailable, ...mainBlocked, ...supportingBlocked];
    })()
    : byAvailability;
  const guidedTests = ordered.slice(0, vNextAssessmentPolicy.maximumGuidedTestsPerReview);
  return { guidedTests, checkedCount, remainingCheckCount: candidates.length, checksComplete: checkedCount === roots.length };
};

export const buildAssessmentReview = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  state?: DerivedAthleteState,
  currentPolicy?: ProjectionPolicy,
  currentEquipment?: readonly EquipmentId[],
): AssessmentReview => {
  assertAssessmentDraft(draft, bundle);
  if (!isAssessmentAtReview(draft, bundle)) throw new TypeError("Assessment is not ready for review");
  const provisional = protocolAnswerRecords(draft, undefined, bundle).map(({ anchor, answer }) => ({
    protocolId: anchor.protocolId,
    subject: protocolById(bundle, anchor.protocolId).subject,
    response: answer.value.response,
  }));
  const candidates: Array<{
    protocol: BenchmarkProtocol;
    reason: GuidedTestOffer["reason"];
    priority: number;
  }> = [];
  const selectedGoals = new Set(selectedAssessmentGoals(draft));
  for (const protocolId of draft.targetedProtocolIds) {
    const protocol = protocolById(bundle, protocolId);
    if (protocol.subject.kind === "milestone" && selectedGoals.size
      && !selectedGoals.has(protocol.subject.milestone.graphId)) continue;
    candidates.push({ protocol, reason: "reconfirm-existing", priority: 0 });
  }
  for (const { anchor, answer } of protocolAnswerRecords(draft, undefined, bundle)) {
    if (answer.value.response === "symptom" || answer.value.response === "not-yet") continue;
    const reason = answer.value.response === "not-sure" || answer.value.response === "partial"
      ? "resolve-uncertainty" as const
      : "confirm-provisional" as const;
    candidates.push({
      protocol: protocolById(bundle, anchor.protocolId),
      reason,
      priority: reason === "resolve-uncertainty" ? 1 : anchor.stage === "goal" ? 2 : 3,
    });
  }
  const seen = new Set<string>();
  const guidedTests = candidates
    .sort((left, right) => left.priority - right.priority || left.protocol.id.localeCompare(right.protocol.id))
    .flatMap(({ protocol, reason }) => {
      const key = offerKey({ protocolId: protocol.id });
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        protocolId: protocol.id,
        subject: protocol.subject,
        label: protocol.label,
        reason,
        ...availabilityFor(draft, bundle, protocol, state, reason, currentPolicy, currentEquipment),
      } satisfies GuidedTestOffer];
    })
    .sort((left, right) => Number(left.availability === "blocked") - Number(right.availability === "blocked")
      || left.protocolId.localeCompare(right.protocolId))
    .slice(0, vNextAssessmentPolicy.maximumGuidedTestsPerReview);
  const restrictionReported = draft.answers.some((answer) =>
    (answer.value.kind === "safety" && answer.value.severity !== "none")
    || (answer.value.kind === "anchor" && answer.value.response === "symptom"));
  const timing = assessmentPromptTiming(draft);
  return {
    mode: draft.mode,
    ...timing,
    provisional,
    guidedTests,
    ...(draft.policyVersion === 2 ? placementReviewChecks(draft, bundle, state, currentPolicy, currentEquipment) : {}),
    restrictionReported,
    completionMessage: draft.policyVersion === 2
      ? "Your answers are estimates. Start with the available checks below; each saved result updates your workout. A checked ordinary variation becomes your starting practice when recovered, without claiming harder skills. Some skills need confirmation on another day. Stop when tired or uncomfortable; you can continue later."
      : draft.mode === "targeted-reconfirmation"
      ? "Only the skills that need a fresh check are shown. Your achievements are kept."
      : "These are starting estimates. Guided checks and qualifying training confirm your skills.",
  };
};

const eventIdFor = async (draft: AssessmentDraft, key: string): Promise<EvidenceEventId> =>
  parseStableId("event", `assessment-${await sha256({ draftId: draft.id, key })}`);

/** An explicitly submitted restriction is independent of unfinished placement. */
const submittedRestrictionEvidence = async (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
): Promise<RestrictionReportedEvent | undefined> => {
  assertAssessmentDraft(draft, bundle);
  const answer = draft.answers.find((item) => item.value.kind === "safety");
  if (answer?.value.kind !== "safety" || answer.value.severity === "none") return undefined;
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: parseStableId("event", `assessment-safety-${await sha256({ draftId: draft.id, answer })}`),
    athleteId: draft.athleteId,
    occurredAt: answer.answeredAt,
    recordedAt: answer.answeredAt,
    source: "self-assessment",
    catalogueVersion: draft.catalogueVersion,
    type: "restriction_reported",
    severity: answer.value.severity,
    demandDomains: answer.value.demandDomains ?? [],
    bodyRegions: answer.value.bodyRegions ?? [],
    ...(answer.value.notes ? { notes: answer.value.notes } : {}),
  };
};

/**
 * Recover a submitted positive report before planning or changing its draft.
 * No-symptoms answers and Back prefills never clear or create observations.
 * Native partial/complete assessment commits keep their original event bytes.
 */
export const persistSubmittedAssessmentRestriction = async (
  store: VNextShadowStore,
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
): Promise<void> => {
  if (draft.status === "committed") return;
  const event = await submittedRestrictionEvidence(draft, bundle);
  if (!event) return;
  const sources = await store.readProjectionSources(draft.athleteId);
  const legacyId = await eventIdFor(draft, "context-restriction");
  const legacy = sources.evidenceEvents.find((item) => item.id === legacyId);
  if (legacy?.type === "restriction_reported") {
    const { id: _oldId, recordedAt: _oldRecordedAt, ...oldReport } = legacy;
    const { id: _newId, recordedAt: _newRecordedAt, ...newReport } = event;
    if (canonicalJson(oldReport) === canonicalJson(newReport)) return;
  }
  const existing = sources.evidenceEvents.find((item) => item.id === event.id);
  if (existing && canonicalJson(existing) === canonicalJson(event)) return;
  await store.appendEvidenceEvent(event);
};

const assessmentOutcome = (
  response: ReturnType<typeof protocolAnswerRecords>[number]["answer"]["value"]["response"],
): "clean" | "partial" | "not-yet" | "symptom" => response === "not-sure"
  ? "not-yet"
  : response;

export const buildAssessmentEvidence = async (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
): Promise<readonly AthleteEvidenceEvent[]> => {
  assertAssessmentDraft(draft, bundle);
  if (!isAssessmentAtReview(draft, bundle)) throw new TypeError("Assessment is not complete");
  const events: AthleteEvidenceEvent[] = [];
  const safety = draft.answers.find((answer) => answer.value.kind === "safety");
  if (safety?.value.kind === "safety" && safety.value.severity !== "none") {
    events.push({
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      id: await eventIdFor(draft, "context-restriction"),
      athleteId: draft.athleteId,
      occurredAt: safety.answeredAt,
      recordedAt: draft.updatedAt,
      source: "self-assessment",
      catalogueVersion: draft.catalogueVersion,
      type: "restriction_reported",
      severity: safety.value.severity,
      demandDomains: safety.value.demandDomains ?? [],
      bodyRegions: safety.value.bodyRegions ?? [],
      ...(safety.value.notes ? { notes: safety.value.notes } : {}),
    });
  }
  for (const { anchor, answer } of protocolAnswerRecords(draft, undefined, bundle)) {
    const protocol = protocolById(bundle, anchor.protocolId);
    events.push({
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      id: await eventIdFor(draft, answer.stepId),
      athleteId: draft.athleteId,
      occurredAt: answer.answeredAt,
      recordedAt: draft.updatedAt,
      source: "self-assessment",
      catalogueVersion: draft.catalogueVersion,
      type: "performance_observed",
      subject: protocol.subject,
      outcome: assessmentOutcome(answer.value.response),
      benchmarkProtocolId: protocol.id,
      benchmarkProtocolVersion: protocol.definitionVersion,
      ...(answer.value.notes ? { notes: answer.value.notes } : {}),
    });
  }
  for (const event of events) {
    const result = validateAthleteEvidenceEvent(event);
    if (!result.valid) throw new TypeError(`Assessment emitted invalid evidence: ${result.issues.map((issue) => issue.message).join("; ")}`);
  }
  return events;
};

export const buildAssessmentIntent = (draft: AssessmentDraft): AthleteIntent => {
  const graphIds = selectedAssessmentGoals(draft);
  const modernGoals = draft.goalSelectionVersion === 2;
  const hasGoalAnswer = draft.answers.some((answer) => answer.value.kind === "goals");
  // Unmarked drafts retain their original mapping for exact partial-commit retry.
  const selected: AthleteIntent["goals"] = modernGoals && !hasGoalAnswer ? draft.intentSeed.goals
    : graphIds.map((graphId, index) => {
      const existing = modernGoals ? draft.intentSeed.goals.find((goal) => goal.graphId === graphId) : undefined;
      return {
        graphId,
        ...(existing?.targetNodeId ? { targetNodeId: existing.targetNodeId } : {}),
        priority: index === 0 ? "primary" : index === 1 || modernGoals ? "secondary" : "interest",
      };
    });
  const goals: AthleteIntent["goals"] = modernGoals && hasGoalAnswer
    ? [...selected, ...draft.intentSeed.goals.filter((goal) => goal.priority === "interest"
      && !selected.some((item) => item.graphId === goal.graphId))]
    : selected;
  const focus = modernGoals ? draft.intentSeed.emphasisOverride : undefined;
  const focusStillSelected = focus && goals.some((goal) => goal.graphId === focus.primaryGraphId)
    && (!focus.secondaryGraphId || goals.some((goal) => goal.graphId === focus.secondaryGraphId));
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    athleteId: draft.athleteId,
    updatedAt: draft.updatedAt,
    goals,
    ...(focusStillSelected ? { emphasisOverride: focus } : {}),
    equipment: selectedAssessmentEquipment(draft),
    defaultSessionDemand: draft.intentSeed.defaultSessionDemand,
    preferences: draft.intentSeed.preferences,
  };
};

export const commitAssessment = async (
  store: VNextShadowStore,
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  options: Readonly<{ persistIntent?: boolean }> = {},
): Promise<Readonly<{
  draft: AssessmentDraft;
  review: AssessmentReview;
  evidenceEvents: readonly AthleteEvidenceEvent[];
}>> => {
  const review = buildAssessmentReview(draft, bundle);
  const nativeEvidence = await buildAssessmentEvidence(draft, bundle);
  const submittedRestriction = await submittedRestrictionEvidence(draft, bundle);
  const sources = submittedRestriction ? await store.readProjectionSources(draft.athleteId) : undefined;
  const legacyRestrictionId = await eventIdFor(draft, "context-restriction");
  const useSubmittedRestriction = submittedRestriction
    && !sources?.evidenceEvents.some((event) => event.id === legacyRestrictionId)
    && sources?.evidenceEvents.some((event) => event.id === submittedRestriction.id);
  const evidenceEvents = nativeEvidence.map((event) => event.id === legacyRestrictionId && useSubmittedRestriction
    ? submittedRestriction : event);
  const changedIntent = draft.mode === "new-placement"
    || draft.answers.some((answer) => answer.value.kind === "goals" || answer.value.kind === "equipment");
  // The integrated runtime saves submitted context independently. The default
  // retains the native standalone/partially committed assessment retry contract.
  if (changedIntent && options.persistIntent !== false) await store.putAthleteIntent(buildAssessmentIntent(draft));
  for (const event of evidenceEvents) await store.appendEvidenceEvent(event);
  const committed: AssessmentDraft = draft.status === "committed" ? draft : {
    ...draft,
    revisitAnswers: [],
    status: "committed",
    committedAt: draft.updatedAt,
    revision: draft.revision + 1,
  };
  await store.saveAssessmentDraft(committed);
  return { draft: committed, review, evidenceEvents };
};

const measurementPasses = (
  measurement: ObservationMeasurement | undefined,
  protocol: BenchmarkProtocol,
): boolean => {
  switch (protocol.metric.kind) {
    case "duration-seconds":
      return measurement?.unit === "seconds"
        && measurement.value >= protocol.metric.minimum
        && (protocol.metric.maximum === undefined || measurement.value <= protocol.metric.maximum);
    case "repetitions":
      return measurement?.unit === "repetitions"
        && measurement.value >= protocol.metric.minimum
        && (protocol.metric.maximum === undefined || measurement.value <= protocol.metric.maximum);
    case "successful-attempts":
      return measurement?.unit === "attempts"
        && measurement.value >= protocol.metric.minimumSuccessful
        && measurement.attemptsTotal !== undefined
        && measurement.attemptsTotal >= measurement.value
        && measurement.attemptsTotal <= protocol.metric.maximumAttempts;
    case "range":
    case "quality":
      return true;
  }
};

export const createGuidedTestEvidence = (
  draft: AssessmentDraft,
  bundle: DefinitionBundle,
  state: DerivedAthleteState | undefined,
  input: GuidedTestResultInput,
  existingEvent?: AthleteEvidenceEvent,
  currentPolicy?: ProjectionPolicy,
  currentEquipment?: readonly EquipmentId[],
): AthleteEvidenceEvent => {
  const offer = buildAssessmentReview(draft, bundle, state, currentPolicy, currentEquipment).guidedTests.find((candidate) =>
    candidate.protocolId === input.protocolId);
  if (!existingEvent && !offer) throw new TypeError("Guided result was not offered by the current assessment review");
  if (!existingEvent && offer?.availability !== "available") throw new TypeError(`Guided test is blocked: ${offer?.blockers.join(", ")}`);
  return createGuidedProtocolEvidence(draft.athleteId, bundle, input, existingEvent);
};

/** Exact native result builder. Callers must validate the current offered check first. */
export const createGuidedProtocolEvidence = (
  athleteId: AthleteId,
  bundle: DefinitionBundle,
  input: GuidedTestResultInput,
  existingEvent?: AthleteEvidenceEvent,
): AthleteEvidenceEvent => {
  if (!isCanonicalIsoTimestamp(input.occurredAt) || !isCanonicalIsoTimestamp(input.recordedAt)
    || Date.parse(input.recordedAt) < Date.parse(input.occurredAt)) {
    throw new TypeError("Guided test timestamps must be canonical and ordered");
  }
  const protocol = protocolById(bundle, input.protocolId);
  if (input.outcome === "clean" && (!input.qualityCriteriaSatisfied
    || !input.safetyCriteriaSatisfied
    || !measurementPasses(input.measurement, protocol))) {
    throw new TypeError("A clean guided result must satisfy the exact metric, quality and safety protocol");
  }
  const event: AthleteEvidenceEvent = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: parseStableId("event", input.eventId),
    athleteId,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
    source: "guided-test",
    catalogueVersion: bundle.catalogueVersion,
    type: "performance_observed",
    subject: protocol.subject,
    outcome: input.outcome,
    benchmarkProtocolId: protocol.id,
    benchmarkProtocolVersion: protocol.definitionVersion,
    observationSessionId: parseStableId("observation-session", input.observationSessionId),
    ...(input.measurement ? { measurement: input.measurement } : {}),
    assistance: protocol.conditions.assistance,
    range: protocol.conditions.range,
    ...(input.perceivedExertion ? { perceivedExertion: input.perceivedExertion } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
  const result = validateAthleteEvidenceEvent(event);
  if (!result.valid) throw new TypeError(`Invalid guided evidence: ${result.issues.map((issue) => issue.message).join("; ")}`);
  if (existingEvent && canonicalJson(existingEvent) !== canonicalJson(event)) throw new TypeError("Guided retry differs from its saved observation");
  return event;
};

export const persistGuidedTestEvidence = async (
  store: VNextShadowStore,
  event: AthleteEvidenceEvent,
): Promise<void> => {
  if (event.type !== "performance_observed" || event.source !== "guided-test") {
    throw new TypeError("Only guided-test performance evidence is accepted");
  }
  await store.appendEvidenceEvent(event);
};

export const createRestrictionReport = (input: Readonly<{
  eventId: string;
  athleteId: AthleteId;
  occurredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  catalogueVersion: DefinitionBundle["catalogueVersion"];
  severity: RestrictionReportedEvent["severity"];
  demandDomains: readonly DemandDomain[];
  bodyRegions: readonly string[];
  notes?: string;
  symptomSource?: ObservationSourceRef;
}>): RestrictionReportedEvent => {
  const event: RestrictionReportedEvent = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: parseStableId("event", input.eventId),
    athleteId: input.athleteId,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
    source: "athlete-report",
    catalogueVersion: input.catalogueVersion,
    type: "restriction_reported",
    severity: input.severity,
    demandDomains: [...new Set(input.demandDomains)].sort(),
    bodyRegions: [...new Set(input.bodyRegions)].sort(),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.symptomSource ? { symptomSource: input.symptomSource } : {}),
  };
  const result = validateAthleteEvidenceEvent(event);
  if (!result.valid) throw new TypeError(`Invalid restriction report: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return event;
};

export const createRestrictionClearance = (input: Readonly<{
  eventId: string;
  athleteId: AthleteId;
  occurredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  catalogueVersion: DefinitionBundle["catalogueVersion"];
  restrictionEventId: EvidenceEventId;
  notes?: string;
}>): RestrictionClearedEvent => {
  const event: RestrictionClearedEvent = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: parseStableId("event", input.eventId),
    athleteId: input.athleteId,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
    source: "athlete-report",
    catalogueVersion: input.catalogueVersion,
    type: "restriction_cleared",
    restrictionEventId: input.restrictionEventId,
    ...(input.notes ? { notes: input.notes } : {}),
  };
  const result = validateAthleteEvidenceEvent(event);
  if (!result.valid) throw new TypeError(`Invalid restriction clearance: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return event;
};

export const workoutReviewPrompts = (plan: SessionPlan): readonly WorkoutReviewPrompt[] =>
  plan.items
    .filter((item) => !["preparation", "recovery"].includes(item.purpose))
    .map((item) => ({
      planItemId: item.id,
      exerciseId: item.exerciseId,
      purpose: item.purpose,
      asksOutcome: true,
      asksDifficulty: item.purpose !== "guided-test",
      asksSymptomOrInstability: true,
    }));

export const createSessionRecordFromWorkoutReview = (
  plan: SessionPlan,
  bundle: DefinitionBundle,
  input: Readonly<{
    recordId: string;
    startedAt: IsoTimestamp;
    completedAt: IsoTimestamp;
    recordedAt: IsoTimestamp;
    status: SessionRecord["status"];
    itemOutcomes: readonly SessionItemOutcome[];
    supersedesRecordId?: SessionRecord["supersedesRecordId"];
  }>,
): SessionRecord => {
  if (plan.catalogueVersion !== bundle.catalogueVersion) throw new TypeError("Workout plan catalogue is unavailable");
  const planItems = new Map(plan.items.map((item) => [item.id, item]));
  if (input.itemOutcomes.length !== plan.items.length
    || new Set(input.itemOutcomes.map((item) => item.planItemId)).size !== plan.items.length
    || input.itemOutcomes.some((item) => !planItems.has(item.planItemId))) {
    throw new TypeError("Workout review must account for each planned item exactly once");
  }
  for (const outcome of input.itemOutcomes) {
    const item = planItems.get(outcome.planItemId)!;
    if (["preparation", "recovery"].includes(item.purpose) && outcome.review !== undefined) {
      throw new TypeError("Preparation and recovery items must not create progression reviews");
    }
    if ((outcome.status === "skipped" || outcome.participationSeconds === 0)
      && (outcome.review !== undefined || outcome.benchmarkObservation !== undefined)) {
      throw new TypeError("Skipped or zero-participation items cannot create evidence conclusions");
    }
    if (outcome.status === "completed" && (
      outcome.performedExerciseId !== item.exerciseId
      || outcome.performedExerciseDefinitionVersion !== item.exerciseDefinitionVersion
      || outcome.performedPrescriptionVariantId !== item.prescriptionVariantId
    )) {
      throw new TypeError("Completed work must retain the exact planned exercise and prescription identity");
    }
    if (outcome.benchmarkObservation && (
      item.benchmarkProtocolId !== outcome.benchmarkObservation.benchmarkProtocolId
      || item.benchmarkProtocolVersion !== outcome.benchmarkObservation.benchmarkProtocolVersion
    )) {
      throw new TypeError("An in-session benchmark result must match the exact planned protocol");
    }
    if (outcome.benchmarkObservation) {
      const protocol = protocolById(bundle, outcome.benchmarkObservation.benchmarkProtocolId);
      if (protocol.definitionVersion !== outcome.benchmarkObservation.benchmarkProtocolVersion
        || subjectKey(protocol.subject) !== subjectKey(outcome.benchmarkObservation.subject)
        || protocol.exerciseId !== outcome.performedExerciseId) {
        throw new TypeError("An in-session benchmark result must match its versioned subject and exercise");
      }
      if (outcome.benchmarkObservation.outcome === "clean" && (
        outcome.benchmarkObservation.assistance !== protocol.conditions.assistance
        || outcome.benchmarkObservation.range !== protocol.conditions.range
        || !measurementPasses(outcome.benchmarkObservation.measurement, protocol)
      )) {
        throw new TypeError("A clean in-session benchmark must satisfy the exact metric and conditions");
      }
      if (item.targetMilestone && protocol.subject.kind === "milestone"
        && (item.targetMilestone.graphId !== protocol.subject.milestone.graphId
          || item.targetMilestone.nodeId !== protocol.subject.milestone.nodeId)) {
        throw new TypeError("An in-session benchmark subject must match the planned target milestone");
      }
    }
  }
  const elapsedSeconds = (Date.parse(input.completedAt) - Date.parse(input.startedAt)) / 1000;
  if (input.itemOutcomes.reduce((sum, outcome) => sum + outcome.participationSeconds, 0) > elapsedSeconds) {
    throw new TypeError("Item participation cannot exceed elapsed session time");
  }
  const record: SessionRecord = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: parseStableId("session-record", input.recordId),
    athleteId: plan.athleteId,
    planId: plan.id,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    recordedAt: input.recordedAt,
    status: input.status,
    itemOutcomes: input.itemOutcomes,
    ...(input.supersedesRecordId ? { supersedesRecordId: input.supersedesRecordId } : {}),
  };
  const result = validateSessionRecord(record);
  if (!result.valid) throw new TypeError(`Invalid workout review record: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return record;
};

export const persistWorkoutReview = async (
  store: VNextShadowStore,
  plan: SessionPlan,
  record: SessionRecord,
): Promise<void> => {
  await store.appendSession(plan, record);
};

export const assessmentSubjectKey = subjectKey;
