import {
  DEMAND_DOMAINS,
  DOMAIN_SCHEMA_VERSION,
  type AthleteEvidenceEvent,
  type BenchmarkProtocol,
  type BenchmarkSubject,
  type CapacityFacetRef,
  type DefinitionBundle,
  type DemandDomain,
  type DemandLevel,
  type DemandProfile,
  type DerivedAthleteState,
  type DevelopmentGraph,
  type DevelopmentNode,
  type ExerciseDefinition,
  type MilestoneRef,
  type NodeLifecycle,
  type ObservationSourceRef,
  type PerformanceConfidence,
  type PrerequisiteRef,
  type ReasonCode,
  type RestrictionClearedEvent,
  type RestrictionReportedEvent,
  type TrainabilityDecision,
} from "../contracts";
import { normalizeObservations } from "./normalize";
import { projectionReasonCodes } from "./policy";
import {
  milestoneKey,
  subjectKey,
  type NormalizedObservation,
  type ProjectionInput,
  type ProjectionIssue,
  type ProjectionPolicy,
  type ProjectionResult,
  type TrainabilityEvaluationInput,
  type TrainabilityRequest,
} from "./contracts";

type ProtocolEvaluation = Readonly<{
  observation: NormalizedObservation;
  protocol: BenchmarkProtocol;
  passed: boolean;
  validFailure: boolean;
  reused: boolean;
  credit: "benchmark" | "development";
}>;

type SubjectProjection = Readonly<{
  lifecycle: NodeLifecycle;
  confidence: PerformanceConfidence;
  supportingObservationRefs: readonly ObservationSourceRef[];
  /** Passing sources behind an active, fully confirmed eligibility claim. */
  eligibilitySupportingObservationRefs: readonly ObservationSourceRef[];
  reasonCodes: readonly ReasonCode[];
  latestCleanAt?: string;
}>;

type ProtocolStatus = Readonly<{
  demonstrated: boolean;
  established: boolean;
  confidence: PerformanceConfidence;
  latestCleanAt?: string;
}>;

const dayMs = 86_400_000;
const hourMs = 3_600_000;
const levelRank: Readonly<Record<DemandLevel, number>> = { low: 1, moderate: 2, high: 3 };
const lifecycleRank: Readonly<Record<NodeLifecycle, number>> = {
  unknown: 0,
  estimated: 1,
  developing: 2,
  demonstrated: 3,
  established: 4,
};

const canonicalSourceKey = (source: ObservationSourceRef): string =>
  source.kind === "evidence-event"
    ? `event:${source.eventId}`
    : `session:${source.sessionRecordId}:item:${source.planItemId}`;

const compareSource = (left: ObservationSourceRef, right: ObservationSourceRef): number =>
  canonicalSourceKey(left).localeCompare(canonicalSourceKey(right));

const uniqueSources = (sources: readonly ObservationSourceRef[]): readonly ObservationSourceRef[] => {
  const byKey = new Map(sources.map((source) => [canonicalSourceKey(source), source] as const));
  return [...byKey.values()].sort(compareSource);
};

const uniqueReasons = (codes: readonly ReasonCode[]): readonly ReasonCode[] =>
  [...new Set(codes)].sort((left, right) => left.localeCompare(right));

const maxDemand = (profiles: readonly DemandProfile[]): DemandProfile => {
  const result: Partial<Record<DemandDomain, DemandLevel>> = {};
  for (const profile of profiles) {
    for (const [domain, level] of Object.entries(profile) as [DemandDomain, DemandLevel][]) {
      if (!result[domain] || levelRank[level] > levelRank[result[domain]!]) result[domain] = level;
    }
  }
  return result;
};

const subjectsEqual = (left: BenchmarkSubject, right: BenchmarkSubject): boolean =>
  subjectKey(left) === subjectKey(right);

const sourceIsCompatibleWithCurrent = (
  observation: NormalizedObservation,
  subject: BenchmarkSubject,
  currentVersion: number,
  policy: ProjectionPolicy,
): boolean => observation.catalogueVersion === currentVersion
  || policy.subjectVersionCompatibilityRules.some((rule) =>
    rule.fromCatalogueVersion === observation.catalogueVersion
      && rule.toCatalogueVersion === currentVersion
      && subjectsEqual(rule.subject, subject));

const measurementPasses = (
  observation: NormalizedObservation,
  protocol: BenchmarkProtocol,
): boolean => {
  if (observation.outcome !== "clean") return false;
  if (observation.assistance !== undefined && observation.assistance !== protocol.conditions.assistance) return false;
  if (observation.range !== undefined && observation.range !== protocol.conditions.range) return false;
  const measurement = observation.measurement;
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
      // A clean result is an adjudicated pass of this exact protocol version.
      return true;
  }
};

/**
 * Protocol reuse is an explicit directional policy assertion that the source
 * setup is mechanically sufficient for the target finding. Its assistance
 * and range labels may therefore be stricter rather than text-identical. The
 * observed scalar must still meet the target protocol's metric.
 */
const reusedMeasurementPasses = (
  observation: NormalizedObservation,
  protocol: BenchmarkProtocol,
): boolean => {
  if (observation.outcome !== "clean") return false;
  const measurement = observation.measurement;
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

const prescriptionGuaranteesMetric = (
  bundle: DefinitionBundle,
  observation: NormalizedObservation,
  protocol: BenchmarkProtocol,
): boolean => {
  const exercise = bundle.exercises.find((candidate) => candidate.id === observation.exerciseId);
  const target = exercise?.prescriptionVariants.find(
    (candidate) => candidate.id === observation.prescriptionVariantId,
  )?.target;
  if (!target) return false;
  if (target.kind === "duration-seconds" && protocol.metric.kind === "duration-seconds") {
    return target.minimum >= protocol.metric.minimum
      && (protocol.metric.maximum === undefined
        || (target.maximum !== undefined && target.maximum <= protocol.metric.maximum));
  }
  if (target.kind === "repetitions" && protocol.metric.kind === "repetitions") {
    return target.minimum >= protocol.metric.minimum
      && (protocol.metric.maximum === undefined
        || (target.maximum !== undefined && target.maximum <= protocol.metric.maximum));
  }
  return false;
};

const confirmationMet = (
  evaluations: readonly ProtocolEvaluation[],
  protocol: BenchmarkProtocol,
): boolean => {
  const passing = evaluations.filter((evaluation) => evaluation.passed);
  const sources = new Set(passing.map((evaluation) => evaluation.observation.sourceKey));
  const sessions = new Set(passing.map((evaluation) => evaluation.observation.sessionKey));
  const containsDevelopmentCredit = passing.some((evaluation) => evaluation.credit === "development");
  const minimumObservations = Math.max(
    protocol.confirmation.qualifyingObservations,
    containsDevelopmentCredit ? 2 : 1,
  );
  const minimumSessions = Math.max(
    protocol.confirmation.minimumDistinctSessions,
    containsDevelopmentCredit ? 2 : 1,
  );
  return sources.size >= minimumObservations && sessions.size >= minimumSessions;
};

const evaluateProtocolStatus = (
  evaluations: readonly ProtocolEvaluation[],
  protocol: BenchmarkProtocol,
  policy: ProjectionPolicy,
  asOfMs: number,
): ProtocolStatus => {
  const ordered = [...evaluations].sort((left, right) =>
    Date.parse(left.observation.occurredAt) - Date.parse(right.observation.occurredAt)
      || left.observation.sourceKey.localeCompare(right.observation.sourceKey));
  const passing = ordered.filter((evaluation) => evaluation.passed);
  const established = confirmationMet(passing, protocol);
  const hasBenchmarkProof = passing.some((evaluation) => evaluation.credit === "benchmark");
  if (!hasBenchmarkProof && !established) {
    return { demonstrated: false, established: false, confidence: "unknown" };
  }
  let contradicted = false;
  let failureSessions = new Set<string>();
  let reconfirm: ProtocolEvaluation[] = [];
  let latestCleanAt = passing[0]!.observation.occurredAt;
  let proofStarted = false;
  const proofPrefix: ProtocolEvaluation[] = [];

  for (const evaluation of ordered) {
    if (evaluation.passed) {
      proofPrefix.push(evaluation);
      if (evaluation.credit === "benchmark" || confirmationMet(proofPrefix, protocol)) proofStarted = true;
      if (!proofStarted) continue;
      latestCleanAt = evaluation.observation.occurredAt;
      if (contradicted) {
        reconfirm.push(evaluation);
        if (confirmationMet(reconfirm, protocol)) {
          contradicted = false;
          failureSessions = new Set();
          reconfirm = [];
        }
      } else {
        failureSessions = new Set();
      }
      continue;
    }
    if (!evaluation.validFailure) continue;
    if (!proofStarted) continue;
    if (contradicted) {
      reconfirm = [];
      continue;
    }
    failureSessions.add(evaluation.observation.sessionKey);
    if (failureSessions.size >= policy.contradictionMinimumFailures) {
      contradicted = true;
      reconfirm = [];
    }
  }

  if (contradicted) {
    return { demonstrated: true, established, confidence: "contradicted", latestCleanAt };
  }
  const freshnessDays = protocol.confirmation.freshnessDays;
  if (freshnessDays !== undefined && asOfMs > Date.parse(latestCleanAt) + freshnessDays * dayMs) {
    return { demonstrated: true, established, confidence: "stale", latestCleanAt };
  }
  return { demonstrated: true, established, confidence: "current", latestCleanAt };
};

const projectSubject = (
  observations: readonly NormalizedObservation[],
  evaluations: readonly ProtocolEvaluation[],
  policy: ProjectionPolicy,
  asOfMs: number,
): SubjectProjection => {
  let lifecycle: NodeLifecycle = "unknown";
  const reasons: ReasonCode[] = [];
  const supports: ObservationSourceRef[] = [];
  for (const observation of observations) {
    supports.push(observation.source);
    if (observation.strength === "weak") {
      if (lifecycleRank[lifecycle] < lifecycleRank.estimated) lifecycle = "estimated";
    } else if (lifecycleRank[lifecycle] < lifecycleRank.developing) {
      lifecycle = "developing";
    }
  }

  const grouped = new Map<string, ProtocolEvaluation[]>();
  for (const evaluation of evaluations) {
    const key = `${evaluation.protocol.id}@${evaluation.protocol.definitionVersion}`;
    const group = grouped.get(key) ?? [];
    group.push(evaluation);
    grouped.set(key, group);
    supports.push(evaluation.observation.source);
    if (!evaluation.passed && lifecycleRank[lifecycle] < lifecycleRank.developing) lifecycle = "developing";
  }

  const statuses = [...grouped.values()].map((group) => {
    const status = evaluateProtocolStatus(group, group[0]!.protocol, policy, asOfMs);
    return {
      status,
      latestMs: Math.max(...group.map((item) => Date.parse(item.observation.occurredAt))),
      qualifyingRefs: status.established && status.confidence === "current"
        ? uniqueSources(group.filter((item) => item.passed).map((item) => item.observation.source))
        : [],
    };
  });
  if (statuses.some(({ status }) => status.established)) lifecycle = "established";
  else if (statuses.some(({ status }) => status.demonstrated)) lifecycle = "demonstrated";

  const provenStatuses = statuses.filter(({ status }) => status.demonstrated)
    .sort((left, right) => right.latestMs - left.latestMs);
  const confidence = provenStatuses[0]?.status.confidence ?? "unknown";
  const latestCleanAt = provenStatuses
    .map(({ status }) => status.latestCleanAt)
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

  reasons.push(
    lifecycle === "unknown" ? projectionReasonCodes.unknown
      : lifecycle === "estimated" ? projectionReasonCodes.estimated
        : lifecycle === "developing" ? projectionReasonCodes.developing
          : lifecycle === "demonstrated" ? projectionReasonCodes.demonstrated
            : projectionReasonCodes.established,
  );
  if (confidence === "stale") reasons.push(projectionReasonCodes.stale);
  if (confidence === "contradicted") reasons.push(projectionReasonCodes.contradicted);
  return {
    lifecycle,
    confidence,
    supportingObservationRefs: uniqueSources(supports),
    eligibilitySupportingObservationRefs: uniqueSources(
      statuses.flatMap(({ qualifyingRefs }) => qualifyingRefs),
    ),
    reasonCodes: uniqueReasons(reasons),
    ...(latestCleanAt ? { latestCleanAt } : {}),
  };
};

const protocolFor = (
  bundle: DefinitionBundle,
  id: string,
  version: number | undefined,
): BenchmarkProtocol | undefined => bundle.benchmarkProtocols.find(
  (protocol) => protocol.id === id && protocol.definitionVersion === version,
);

const addIssue = (
  issues: ProjectionIssue[],
  severity: ProjectionIssue["severity"],
  code: ReasonCode,
  message: string,
  source?: ObservationSourceRef,
): void => {
  issues.push({ severity, code, message, ...(source ? { source } : {}) });
};

const graphNodeMap = (bundle: DefinitionBundle): Map<string, DevelopmentNode> => {
  const result = new Map<string, DevelopmentNode>();
  for (const graph of bundle.graphs) {
    for (const node of graph.nodes) result.set(`${graph.id}:${node.id}`, node);
  }
  return result;
};

const milestonePrerequisites = (node: DevelopmentNode): readonly MilestoneRef[] => [
  ...(node.prerequisiteRule?.allOf ?? []),
  ...(node.prerequisiteRule?.anyOf ?? []),
].filter((ref): ref is Extract<PrerequisiteRef, { kind: "milestone" }> => ref.kind === "milestone")
  .map((ref) => ref.milestone);

const requiredMilestonePrerequisites = (node: DevelopmentNode): readonly MilestoneRef[] =>
  (node.prerequisiteRule?.allOf ?? [])
    .filter((ref): ref is Extract<PrerequisiteRef, { kind: "milestone" }> => ref.kind === "milestone")
    .map((ref) => ref.milestone);

const isAncestor = (
  stronger: MilestoneRef,
  predecessor: MilestoneRef,
  nodes: ReadonlyMap<string, DevelopmentNode>,
): boolean => {
  const pending = [stronger];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    const currentKey = milestoneKey(current);
    if (seen.has(currentKey)) continue;
    seen.add(currentKey);
    const node = nodes.get(currentKey);
    if (!node) continue;
    for (const parent of requiredMilestonePrerequisites(node)) {
      if (milestoneKey(parent) === milestoneKey(predecessor)) return true;
      pending.push(parent);
    }
  }
  return false;
};

const validateProjectionPolicy = (
  policy: ProjectionPolicy,
  bundle: DefinitionBundle,
  availableBundles: readonly DefinitionBundle[],
  issues: ProjectionIssue[],
): void => {
  const protocols = new Set(availableBundles.flatMap((available) =>
    available.benchmarkProtocols.map((protocol) => `${protocol.id}@${protocol.definitionVersion}`)));
  const nodes = graphNodeMap(bundle);
  const inferenceKeys = new Set<string>();
  for (const rule of policy.protocolReuseRules) {
    const sourceKey = `${rule.sourceProtocolId}@${rule.sourceProtocolVersion}`;
    const targetKey = `${rule.targetProtocolId}@${rule.targetProtocolVersion}`;
    if (!protocols.has(sourceKey) || !protocols.has(targetKey)) {
      addIssue(issues, "error", projectionReasonCodes.invalidInput, `Protocol reuse rule ${sourceKey} -> ${targetKey} references an unknown protocol version`);
    }
  }
  for (const rule of policy.mechanicalPredecessorRules) {
    const key = `${milestoneKey(rule.stronger)}>${milestoneKey(rule.predecessor)}`;
    const reverse = `${milestoneKey(rule.predecessor)}>${milestoneKey(rule.stronger)}`;
    if (!nodes.has(milestoneKey(rule.stronger)) || !nodes.has(milestoneKey(rule.predecessor))) {
      addIssue(issues, "error", projectionReasonCodes.invalidInput, `Mechanical inference ${key} references an unknown node`);
    } else if (!isAncestor(rule.stronger, rule.predecessor, nodes)) {
      addIssue(issues, "error", projectionReasonCodes.invalidInput, `Mechanical inference ${key} is not a graph-ancestor relationship`);
    }
    if (inferenceKeys.has(key) || inferenceKeys.has(reverse)) {
      addIssue(issues, "error", projectionReasonCodes.invalidInput, `Mechanical inference ${key} is duplicated or cyclic`);
    }
    inferenceKeys.add(key);
  }
};

const buildEvaluations = (
  observations: readonly NormalizedObservation[],
  bundles: ReadonlyMap<number, DefinitionBundle>,
  policy: ProjectionPolicy,
  issues: ProjectionIssue[],
): Readonly<{
  directBySubject: ReadonlyMap<string, readonly NormalizedObservation[]>;
  evaluationsBySubject: ReadonlyMap<string, readonly ProtocolEvaluation[]>;
  evaluationsByProtocol: ReadonlyMap<string, readonly ProtocolEvaluation[]>;
}> => {
  const directBySubject = new Map<string, NormalizedObservation[]>();
  const evaluationsBySubject = new Map<string, ProtocolEvaluation[]>();
  const evaluationsByProtocol = new Map<string, ProtocolEvaluation[]>();
  const reuseBySource = new Map<string, typeof policy.protocolReuseRules>();
  for (const rule of policy.protocolReuseRules) {
    const key = `${rule.sourceProtocolId}@${rule.sourceProtocolVersion}`;
    reuseBySource.set(key, [
      ...(reuseBySource.get(key) ?? []),
      rule,
    ]);
  }

  const addEvaluation = (evaluation: ProtocolEvaluation): void => {
    const targetSubjectKey = subjectKey(evaluation.protocol.subject);
    const bySubject = evaluationsBySubject.get(targetSubjectKey) ?? [];
    if (!bySubject.some((existing) => existing.observation.sourceKey === evaluation.observation.sourceKey
      && existing.protocol.id === evaluation.protocol.id
      && existing.protocol.definitionVersion === evaluation.protocol.definitionVersion)) {
      bySubject.push(evaluation);
      evaluationsBySubject.set(targetSubjectKey, bySubject);
    }
    const protocolKey = `${evaluation.protocol.id}@${evaluation.protocol.definitionVersion}`;
    const byProtocol = evaluationsByProtocol.get(protocolKey) ?? [];
    if (!byProtocol.some((existing) => existing.observation.sourceKey === evaluation.observation.sourceKey)) {
      byProtocol.push(evaluation);
      evaluationsByProtocol.set(protocolKey, byProtocol);
    }
  };

  for (const observation of observations) {
    if (!observation.subject) continue;
    const key = subjectKey(observation.subject);
    const direct = directBySubject.get(key) ?? [];
    direct.push(observation);
    directBySubject.set(key, direct);
    if (observation.strength === "development") {
      if (observation.evidenceSource !== "session-record" || observation.outcome !== "clean"
        || observation.symptomOrInstability || observation.legacySparse
        || !observation.exerciseId || !observation.prescriptionVariantId) {
        continue;
      }
      const bundle = bundles.get(observation.catalogueVersion);
      const matching = bundle?.benchmarkProtocols.filter((protocol) =>
        subjectsEqual(protocol.subject, observation.subject!)
          && protocol.exerciseId === observation.exerciseId
          && protocol.prescriptionVariantId === observation.prescriptionVariantId
          && protocol.confirmation.allowedSources.includes("session-record")
          && prescriptionGuaranteesMetric(bundle, observation, protocol)) ?? [];
      for (const protocol of matching) {
        addEvaluation({
          observation,
          protocol,
          passed: true,
          validFailure: false,
          reused: false,
          credit: "development",
        });
      }
      continue;
    }
    if (observation.strength !== "benchmark") continue;
    if (!observation.benchmarkProtocolId || !observation.benchmarkProtocolVersion) {
      addIssue(issues, "error", projectionReasonCodes.protocolMismatch, `Benchmark source ${observation.sourceKey} has no protocol version`, observation.source);
      continue;
    }
    const bundle = bundles.get(observation.catalogueVersion);
    const protocol = bundle && protocolFor(bundle, observation.benchmarkProtocolId, observation.benchmarkProtocolVersion);
    if (!protocol) {
      addIssue(issues, "error", projectionReasonCodes.unsupportedVersion, `Source ${observation.sourceKey} references unavailable protocol ${observation.benchmarkProtocolId}@${observation.benchmarkProtocolVersion}`, observation.source);
      continue;
    }
    if (!subjectsEqual(observation.subject, protocol.subject)) {
      addIssue(issues, "error", projectionReasonCodes.protocolMismatch, `Source ${observation.sourceKey} subject does not match its protocol`, observation.source);
      continue;
    }
    if (observation.exerciseId !== undefined && observation.exerciseId !== protocol.exerciseId) {
      addIssue(issues, "error", projectionReasonCodes.protocolMismatch, `Session source ${observation.sourceKey} performed ${observation.exerciseId}, not protocol exercise ${protocol.exerciseId}`, observation.source);
      continue;
    }
    if (observation.prescriptionVariantId !== undefined && protocol.prescriptionVariantId !== undefined
      && observation.prescriptionVariantId !== protocol.prescriptionVariantId) {
      addIssue(issues, "error", projectionReasonCodes.protocolMismatch, `Session source ${observation.sourceKey} performed a different prescription from protocol ${protocol.id}`, observation.source);
      continue;
    }
    const allowedSource = observation.evidenceSource === "session-record"
      ? protocol.confirmation.allowedSources.includes("session-record")
      : observation.evidenceSource === "guided-test"
        && protocol.confirmation.allowedSources.includes("guided-test");
    if (!allowedSource) {
      addIssue(issues, "error", projectionReasonCodes.protocolMismatch, `Source ${observation.sourceKey} is not allowed by protocol ${protocol.id}`, observation.source);
      continue;
    }
    const directEvaluation: ProtocolEvaluation = {
      observation,
      protocol,
      passed: measurementPasses(observation, protocol),
      validFailure: observation.outcome === "partial" || observation.outcome === "not-yet",
      reused: false,
      credit: "benchmark",
    };
    addEvaluation(directEvaluation);

    if (!directEvaluation.passed) continue;
    for (const rule of reuseBySource.get(`${protocol.id}@${protocol.definitionVersion}`) ?? []) {
      const target = protocolFor(bundle!, rule.targetProtocolId, rule.targetProtocolVersion);
      if (!target) {
        addIssue(issues, "error", projectionReasonCodes.unsupportedVersion, `Reuse target ${rule.targetProtocolId}@${rule.targetProtocolVersion} is unavailable`, observation.source);
        continue;
      }
      addEvaluation({
        observation,
        protocol: target,
        passed: reusedMeasurementPasses(observation, target),
        validFailure: false,
        reused: true,
        credit: "benchmark",
      });
    }
  }
  return { directBySubject, evaluationsBySubject, evaluationsByProtocol };
};

const statusForProtocol = (
  protocol: BenchmarkProtocol,
  evaluations: ReadonlyMap<string, readonly ProtocolEvaluation[]>,
  policy: ProjectionPolicy,
  asOfMs: number,
): ProtocolStatus => evaluateProtocolStatus(
  evaluations.get(`${protocol.id}@${protocol.definitionVersion}`) ?? [],
  protocol,
  policy,
  asOfMs,
);

const deriveRestrictions = (
  activeEvents: readonly AthleteEvidenceEvent[],
  observations: readonly NormalizedObservation[],
  compatibleEvaluations: readonly ProtocolEvaluation[],
  policy: ProjectionPolicy,
  asOfMs: number,
): Pick<DerivedAthleteState, "activeRestrictions" | "reconfirmationRequirements"> => {
  const reports = activeEvents.filter(
    (event): event is RestrictionReportedEvent => event.type === "restriction_reported",
  );
  const clearances = activeEvents.filter(
    (event): event is RestrictionClearedEvent => event.type === "restriction_cleared",
  );
  const clearedByReport = new Map<string, RestrictionClearedEvent>();
  for (const clearance of clearances) {
    const existing = clearedByReport.get(clearance.restrictionEventId);
    if (!existing
      || Date.parse(clearance.occurredAt) < Date.parse(existing.occurredAt)
      || (clearance.occurredAt === existing.occurredAt
        && Date.parse(clearance.recordedAt) < Date.parse(existing.recordedAt))
      || (clearance.occurredAt === existing.occurredAt
        && clearance.recordedAt === existing.recordedAt
        && clearance.id.localeCompare(existing.id) < 0)) {
      clearedByReport.set(clearance.restrictionEventId, clearance);
    }
  }
  const activeRestrictions: DerivedAthleteState["activeRestrictions"][number][] = [];
  const reconfirmationRequirements: DerivedAthleteState["reconfirmationRequirements"][number][] = [];

  const remainingUnconfirmedDomains = (
    domains: readonly DemandDomain[],
    since: string,
  ): readonly DemandDomain[] => domains.filter((domain) => {
    const byProtocol = new Map<string, ProtocolEvaluation[]>();
    for (const evaluation of compatibleEvaluations) {
      if (!evaluation.passed || Date.parse(evaluation.observation.occurredAt) <= Date.parse(since)) continue;
      if (evaluation.observation.demand[domain] !== "high") continue;
      const key = `${evaluation.protocol.id}@${evaluation.protocol.definitionVersion}`;
      const group = byProtocol.get(key) ?? [];
      group.push(evaluation);
      byProtocol.set(key, group);
    }
    return ![...byProtocol.values()].some((group) => confirmationMet(group, group[0]!.protocol));
  });

  for (const report of reports) {
    const clearance = clearedByReport.get(report.id);
    if (!clearance) {
      activeRestrictions.push({
        source: { kind: "evidence-event", eventId: report.id },
        decision: report.severity,
        demandDomains: [...new Set(report.demandDomains)].sort(),
        bodyRegions: [...new Set(report.bodyRegions)].sort(),
        occurredAt: report.occurredAt,
        reasonCodes: [projectionReasonCodes.activeRestriction],
      });
      continue;
    }
    const remainingDomains = remainingUnconfirmedDomains(report.demandDomains, clearance.occurredAt);
    if (remainingDomains.length) {
      reconfirmationRequirements.push({
        source: { kind: "evidence-event", eventId: report.id },
        triggeredBy: { kind: "evidence-event", eventId: clearance.id },
        requiredSince: clearance.occurredAt,
        demandDomains: [...new Set(remainingDomains)].sort(),
        reasonCodes: [projectionReasonCodes.postClearance],
      });
    }
  }

  for (const observation of observations) {
    if (!observation.symptomOrInstability) continue;
    const domains = (Object.keys(observation.demand).length
      ? Object.keys(observation.demand)
      : DEMAND_DOMAINS) as readonly DemandDomain[];
    const remainingDomains = remainingUnconfirmedDomains(domains, observation.occurredAt);
    if (!remainingDomains.length) continue;
    if (asOfMs <= Date.parse(observation.occurredAt) + policy.symptomRestrictionDays * dayMs) {
      activeRestrictions.push({
        source: observation.source,
        decision: "block",
        demandDomains: [...remainingDomains].sort(),
        bodyRegions: ["reported-symptom-or-instability"],
        occurredAt: observation.occurredAt,
        reasonCodes: [projectionReasonCodes.activeRestriction],
      });
    } else {
      reconfirmationRequirements.push({
        source: observation.source,
        requiredSince: observation.occurredAt,
        demandDomains: [...remainingDomains].sort(),
        reasonCodes: [projectionReasonCodes.postClearance],
      });
    }
  }

  activeRestrictions.sort((left, right) => canonicalSourceKey(left.source).localeCompare(canonicalSourceKey(right.source)));
  reconfirmationRequirements.sort((left, right) => canonicalSourceKey(left.source).localeCompare(canonicalSourceKey(right.source)));
  return { activeRestrictions, reconfirmationRequirements };
};

const deriveRecentLoad = (
  observations: readonly NormalizedObservation[],
  policy: ProjectionPolicy,
  asOf: string,
): DerivedAthleteState["recentLoad"] => {
  const asOfMs = Date.parse(asOf);
  const fromMs = asOfMs - policy.recentLoadDays * dayMs;
  const seen = new Set<string>();
  const exposures: DerivedAthleteState["recentLoad"]["exposures"][number][] = [];
  for (const observation of observations) {
    const occurredMs = Date.parse(observation.occurredAt);
    if (occurredMs < fromMs || occurredMs > asOfMs) continue;
    if (observation.evidenceSource !== "session-record" && observation.evidenceSource !== "guided-test") continue;
    if (!Object.keys(observation.demand).length) continue;
    if (seen.has(observation.sourceKey)) continue;
    seen.add(observation.sourceKey);
    exposures.push({
      source: observation.source,
      occurredAt: observation.occurredAt,
      participationSeconds: observation.participationSeconds,
      demand: observation.demand,
      ...(observation.exerciseId ? { exerciseId: observation.exerciseId } : {}),
      ...(observation.exerciseDefinitionVersion ? {
        exerciseDefinitionVersion: observation.exerciseDefinitionVersion,
      } : {}),
      ...(observation.prescriptionVariantId ? {
        prescriptionVariantId: observation.prescriptionVariantId,
      } : {}),
      ...(observation.reviewOutcome ? { reviewOutcome: observation.reviewOutcome } : {}),
      ...(observation.reviewDifficulty ? { reviewDifficulty: observation.reviewDifficulty } : {}),
    });
  }
  exposures.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || canonicalSourceKey(left.source).localeCompare(canonicalSourceKey(right.source)));
  return {
    from: new Date(fromMs).toISOString(),
    to: asOf,
    demand: maxDemand(exposures.map((exposure) => exposure.demand)),
    exposures,
  };
};

const prerequisiteSatisfied = (
  prerequisite: PrerequisiteRef,
  nodeStates: ReadonlyMap<string, DerivedAthleteState["nodeStates"][number]>,
  capacityStates: ReadonlyMap<string, DerivedAthleteState["capacityFindings"][number]>,
  protocolStatuses: ReadonlyMap<string, ProtocolStatus>,
): boolean => {
  if (prerequisite.kind === "milestone") {
    const state = nodeStates.get(milestoneKey(prerequisite.milestone));
    if (!state) return false;
    if (state.lifecycle === "established" && state.confidence === "current") return true;
    return state.satisfiedForEligibilityBy.some((satisfaction) => {
      const stronger = nodeStates.get(milestoneKey(satisfaction.milestone));
      return stronger !== undefined
        && stronger.lifecycle === "established"
        && stronger.confidence === "current";
    });
  }
  if (prerequisite.kind === "capacity-facet") {
    const key = `${prerequisite.capacity.capacityId}:${prerequisite.capacity.facetId}`;
    const finding = capacityStates.get(key);
    return finding?.finding === "demonstrated"
      && finding.confirmationSatisfied
      && finding.confidence === "current";
  }
  const matching = [...protocolStatuses.entries()]
    .filter(([key]) => key.startsWith(`${prerequisite.benchmarkProtocolId}@`))
    .map(([, status]) => status);
  return matching.some((status) => status.established && status.confidence === "current");
};

const nodePrerequisitesSatisfied = (
  node: DevelopmentNode,
  nodeStates: ReadonlyMap<string, DerivedAthleteState["nodeStates"][number]>,
  capacityStates: ReadonlyMap<string, DerivedAthleteState["capacityFindings"][number]>,
  protocolStatuses: ReadonlyMap<string, ProtocolStatus>,
): boolean => {
  const allOf = node.prerequisiteRule?.allOf ?? [];
  const anyOf = node.prerequisiteRule?.anyOf ?? [];
  return allOf.every((ref) => prerequisiteSatisfied(ref, nodeStates, capacityStates, protocolStatuses))
    && (!anyOf.length || anyOf.some((ref) => prerequisiteSatisfied(ref, nodeStates, capacityStates, protocolStatuses)));
};

const nodeDepth = (
  milestone: MilestoneRef,
  nodes: ReadonlyMap<string, DevelopmentNode>,
  memo: Map<string, number>,
  visiting = new Set<string>(),
): number => {
  const key = milestoneKey(milestone);
  if (memo.has(key)) return memo.get(key)!;
  if (visiting.has(key)) return 0;
  visiting.add(key);
  const node = nodes.get(key);
  const depth = node
    ? 1 + Math.max(0, ...milestonePrerequisites(node).map((parent) => nodeDepth(parent, nodes, memo, visiting)))
    : 0;
  visiting.delete(key);
  memo.set(key, depth);
  return depth;
};

const deriveFamilyState = (
  bundle: DefinitionBundle,
  stateByNode: ReadonlyMap<string, DerivedAthleteState["nodeStates"][number]>,
  capacityByFacet: ReadonlyMap<string, DerivedAthleteState["capacityFindings"][number]>,
  protocolStatuses: ReadonlyMap<string, ProtocolStatus>,
  latestCleanByNode: ReadonlyMap<string, string>,
  policy: ProjectionPolicy,
  asOfMs: number,
  specialistOptIn: boolean,
): Pick<DerivedAthleteState, "workingNodes" | "maintenanceNeeds" | "eligibleTargets"> => {
  const nodes = graphNodeMap(bundle);
  const depthMemo = new Map<string, number>();
  const branchByNode = new Map<string, string>();
  const eligibleTargets: DerivedAthleteState["eligibleTargets"][number][] = [];
  const workingCandidates: Array<DerivedAthleteState["workingNodes"][number] & {
    depth: number;
    branch: string;
    priority: number;
  }> = [];
  const maintenanceCandidates: Array<DerivedAthleteState["maintenanceNeeds"][number] & { depth: number; branch: string }> = [];

  for (const graph of bundle.graphs) {
    for (const node of graph.nodes) {
      const milestone = { graphId: graph.id, nodeId: node.id };
      const key = milestoneKey(milestone);
      branchByNode.set(key, `${graph.id}:${node.branchId}`);
      const state = stateByNode.get(key)!;
      const depth = nodeDepth(milestone, nodes, depthMemo);
      const established = state.lifecycle === "established";
      const graphReady = nodePrerequisitesSatisfied(node, stateByNode, capacityByFacet, protocolStatuses);
      const reasons: ReasonCode[] = [projectionReasonCodes.eligibleFrontier];
      if (node.implementationStatus === "missing-content") reasons.push(projectionReasonCodes.missingContent);
      if (node.programmingBoundary === "specialist" && !specialistOptIn) reasons.push(projectionReasonCodes.specialistOptInRequired);

      const contentAvailable = node.implementationStatus === "available";
      const programmingAvailable = node.programmingBoundary !== "specialist" || specialistOptIn;
      if (!established && graphReady && contentAvailable && programmingAvailable) {
        eligibleTargets.push({ milestone, reasonCodes: uniqueReasons(reasons) });
      }
      if (state.confidence === "stale" || state.confidence === "contradicted") {
        workingCandidates.push({
          milestone,
          reasonCodes: [projectionReasonCodes.reconfirmationDue],
          depth,
          branch: branchByNode.get(key)!,
          priority: 2,
        });
      } else if (
        (state.lifecycle === "estimated" || state.lifecycle === "developing"
          || state.lifecycle === "demonstrated" || (!established && graphReady))
        && graphReady
        && node.implementationStatus === "available"
        && (node.programmingBoundary !== "specialist" || specialistOptIn)
      ) {
        workingCandidates.push({
          milestone,
          reasonCodes: state.lifecycle === "estimated" || state.lifecycle === "developing"
            ? state.reasonCodes
            : [projectionReasonCodes.eligibleFrontier],
          depth,
          branch: branchByNode.get(key)!,
          priority: 1,
        });
      }
      const latestCleanAt = latestCleanByNode.get(key);
      if (established && state.confidence === "current" && latestCleanAt
        && asOfMs > Date.parse(latestCleanAt) + policy.maintenanceAfterDays * dayMs) {
        maintenanceCandidates.push({
          milestone,
          reasonCodes: [projectionReasonCodes.maintenanceDue],
          depth,
          branch: branchByNode.get(key)!,
        });
      }
    }
  }

  const deepestPerBranch = <Item extends {
    branch: string;
    depth: number;
    milestone: MilestoneRef;
    priority?: number;
  }>(
    items: readonly Item[],
  ): readonly Item[] => {
    const result = new Map<string, Item>();
    for (const item of items) {
      const existing = result.get(item.branch);
      const itemPriority = item.priority ?? 0;
      const existingPriority = existing?.priority ?? 0;
      if (!existing || itemPriority > existingPriority
        || (itemPriority === existingPriority && item.depth > existing.depth)
        || (itemPriority === existingPriority && item.depth === existing.depth
          && milestoneKey(item.milestone).localeCompare(milestoneKey(existing.milestone)) < 0)) {
        result.set(item.branch, item);
      }
    }
    return [...result.values()].sort((left, right) => milestoneKey(left.milestone).localeCompare(milestoneKey(right.milestone)));
  };

  return {
    eligibleTargets: eligibleTargets.sort((left, right) => milestoneKey(left.milestone).localeCompare(milestoneKey(right.milestone))),
    workingNodes: deepestPerBranch(workingCandidates).map(({ milestone, reasonCodes }) => ({ milestone, reasonCodes })),
    maintenanceNeeds: deepestPerBranch(maintenanceCandidates).map(({ milestone, reasonCodes }) => ({ milestone, reasonCodes })),
  };
};

const requestedExercise = (
  request: TrainabilityRequest,
  bundle: DefinitionBundle,
): Readonly<{ exercise: ExerciseDefinition; demand: DemandProfile }> | undefined => {
  const exercise = bundle.exercises.find((candidate) =>
    candidate.id === request.exerciseId && candidate.definitionVersion === request.exerciseDefinitionVersion);
  const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === request.prescriptionVariantId);
  return exercise && variant ? { exercise, demand: variant.demand } : undefined;
};

const evaluateTrainabilityInternal = (
  input: TrainabilityEvaluationInput,
  allowAlternative: boolean,
): DerivedAthleteState["trainabilityEvaluations"][number] => {
  const resolved = requestedExercise(input.request, input.bundle);
  if (!resolved) {
    return {
      ...input.request,
      decision: "block",
      reasonCodes: [projectionReasonCodes.unsupportedVersion],
    };
  }
  const { exercise, demand } = resolved;
  const blockReasons: ReasonCode[] = [];
  const modifyReasons: ReasonCode[] = [];
  const equipment = new Set(input.intent.equipment);
  if (exercise.equipment.some((item) => !equipment.has(item))) blockReasons.push(projectionReasonCodes.missingEquipment);

  for (const restriction of input.state.activeRestrictions) {
    // Catalogue profiles are deliberately dense and use `low` for negligible
    // exposure. Only material (moderate/high) demand is affected by a domain
    // restriction; treating mere key presence as exposure would block every
    // exercise, including unrelated floor recovery.
    const overlaps = restriction.demandDomains.some((domain) =>
      demand[domain] === "moderate" || demand[domain] === "high");
    if (!overlaps) continue;
    (restriction.decision === "block" ? blockReasons : modifyReasons).push(projectionReasonCodes.activeRestriction);
  }
  for (const requirement of input.state.reconfirmationRequirements) {
    if (requirement.demandDomains.some((domain) => demand[domain] === "high")) {
      modifyReasons.push(projectionReasonCodes.postClearance);
    }
  }
  const nodeStateByKey = new Map(input.state.nodeStates.map((state) => [milestoneKey(state.milestone), state] as const));
  const eligibleKeys = new Set(input.state.eligibleTargets.map((target) => milestoneKey(target.milestone)));
  const linkedNodeDecisions = exercise.graphLinks.flatMap((link) => {
    if (!link.nodeId) return [];
    const milestone = { graphId: link.graphId, nodeId: link.nodeId };
    const node = input.bundle.graphs.find((graph) => graph.id === link.graphId)
      ?.nodes.find((candidate) => candidate.id === link.nodeId);
    const nodeState = nodeStateByKey.get(milestoneKey(milestone));
    const linkedBlocks: ReasonCode[] = [];
    const linkedModifications: ReasonCode[] = [];
    if (node?.implementationStatus === "missing-content") {
      linkedBlocks.push(projectionReasonCodes.missingContent);
    }
    if (node?.programmingBoundary === "specialist" && !input.intent.preferences.specialistOptIn) {
      linkedBlocks.push(projectionReasonCodes.specialistOptInRequired);
    }
    if (nodeState?.confidence === "stale") {
      linkedModifications.push(projectionReasonCodes.staleEvidence);
    }
    if (nodeState?.confidence === "contradicted") {
      linkedModifications.push(projectionReasonCodes.contradictedEvidence);
    }
    const historicallyAchieved = nodeState !== undefined
      && lifecycleRank[nodeState.lifecycle] >= lifecycleRank.demonstrated;
    if (!historicallyAchieved && !eligibleKeys.has(milestoneKey(milestone))) {
      linkedBlocks.push(projectionReasonCodes.prerequisiteMissing);
    }
    if (node?.programmingBoundary === "stronger-gated" && nodeState?.confidence !== "current"
      && !eligibleKeys.has(milestoneKey(milestone))) {
      linkedBlocks.push(projectionReasonCodes.strongerGateNotCurrent);
    }
    return [{
      key: milestoneKey(milestone),
      blockReasons: uniqueReasons(linkedBlocks),
      modifyReasons: uniqueReasons(linkedModifications),
    }];
  });
  if (linkedNodeDecisions.length) {
    const usable = linkedNodeDecisions
      .filter((decision) => decision.blockReasons.length === 0)
      .sort((left, right) => left.modifyReasons.length - right.modifyReasons.length
        || left.key.localeCompare(right.key));
    if (usable.length) {
      modifyReasons.push(...usable[0]!.modifyReasons);
    } else {
      blockReasons.push(...linkedNodeDecisions.flatMap((decision) => decision.blockReasons));
    }
  }

  const recentCutoff = Date.parse(input.asOf) - input.policy.highLoadModificationHours * hourMs;
  if (input.state.recentLoad.exposures.some((exposure) =>
    Date.parse(exposure.occurredAt) >= recentCutoff
      && (Object.entries(demand) as [DemandDomain, DemandLevel][]).some(([domain, level]) =>
        level === "high" && exposure.demand[domain] === "high"))) {
    modifyReasons.push(projectionReasonCodes.recentHighLoad);
  }
  const difficultCutoff = Date.parse(input.asOf)
    - input.policy.difficultPerformanceModificationHours * hourMs;
  if (input.state.recentLoad.exposures.some((exposure) =>
    Date.parse(exposure.occurredAt) >= difficultCutoff
      && exposure.exerciseId === input.request.exerciseId
      && exposure.exerciseDefinitionVersion === input.request.exerciseDefinitionVersion
      && exposure.prescriptionVariantId === input.request.prescriptionVariantId
      && (exposure.reviewDifficulty === "hard" || exposure.reviewOutcome === "not-today"))) {
    modifyReasons.push(projectionReasonCodes.recentDifficultPerformance);
  }

  const decision: TrainabilityDecision = blockReasons.length ? "block" : modifyReasons.length ? "modify" : "allow";
  const reasonCodes = uniqueReasons(decision === "block" ? blockReasons : decision === "modify" ? modifyReasons : [projectionReasonCodes.requestAllowed]);
  const base: DerivedAthleteState["trainabilityEvaluations"][number] = {
    ...input.request,
    decision,
    reasonCodes,
  };
  if (!allowAlternative || decision !== "block") return base;

  const candidates = [...exercise.relations]
    .filter((relation) => relation.kind === "regression" || relation.kind === "assistance" || relation.kind === "substitution")
    .sort((left, right) => left.targetExerciseId.localeCompare(right.targetExerciseId));
  for (const relation of candidates) {
    const target = input.bundle.exercises.find((candidate) => candidate.id === relation.targetExerciseId);
    const variant = relation.targetPrescriptionVariantId
      ? target?.prescriptionVariants.find((candidate) => candidate.id === relation.targetPrescriptionVariantId)
      : target?.prescriptionVariants[0];
    if (!target || !variant) continue;
    const candidate = evaluateTrainabilityInternal({
      ...input,
      request: {
        exerciseId: target.id,
        exerciseDefinitionVersion: target.definitionVersion,
        prescriptionVariantId: variant.id,
      },
    }, false);
    if (candidate.decision === "block") continue;
    return {
      ...base,
      safeAlternative: {
        exerciseId: candidate.exerciseId,
        exerciseDefinitionVersion: candidate.exerciseDefinitionVersion,
        prescriptionVariantId: candidate.prescriptionVariantId,
      },
    };
  }
  return base;
};

export const evaluateTrainability = (
  input: TrainabilityEvaluationInput,
): DerivedAthleteState["trainabilityEvaluations"][number] =>
  evaluateTrainabilityInternal(input, true);

export const projectAthleteState = (input: ProjectionInput): ProjectionResult => {
  const normalization = normalizeObservations(input);
  const issues = [...normalization.issues];
  const asOfMs = Date.parse(input.asOf);
  const bundles = new Map(input.definitionBundles.map((bundle) => [bundle.catalogueVersion, bundle] as const));
  const currentBundle = [...input.definitionBundles]
    .sort((left, right) => right.catalogueVersion - left.catalogueVersion)[0];
  if (!currentBundle) {
    addIssue(issues, "error", projectionReasonCodes.invalidInput, "At least one definition bundle is required");
  } else {
    validateProjectionPolicy(input.policy, currentBundle, input.definitionBundles, issues);
  }
  if (input.intent.athleteId !== input.athleteId) {
    addIssue(issues, "error", projectionReasonCodes.invalidInput, "Athlete Intent belongs to another athlete");
  }
  const trainabilityRequestKeys = new Set<string>();
  for (const request of input.trainabilityRequests ?? []) {
    const key = `${request.exerciseId}:${request.prescriptionVariantId}`;
    if (trainabilityRequestKeys.has(key)) {
      addIssue(issues, "error", projectionReasonCodes.invalidInput, `Duplicate trainability request ${key}`);
    }
    trainabilityRequestKeys.add(key);
  }
  if (issues.some((item) => item.severity === "error") || !currentBundle || !Number.isFinite(asOfMs)) {
    return {
      ok: false,
      issues: issues.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message)),
      normalizedObservationCount: normalization.observations.length,
    };
  }

  const evidence = buildEvaluations(normalization.observations, bundles, input.policy, issues);
  if (issues.some((item) => item.severity === "error")) {
    return {
      ok: false,
      issues: issues.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message)),
      normalizedObservationCount: normalization.observations.length,
    };
  }

  const nodeStates: DerivedAthleteState["nodeStates"][number][] = [];
  const eligibilityProofByNode = new Map<string, readonly ObservationSourceRef[]>();
  const latestCleanByNode = new Map<string, string>();
  for (const graph of currentBundle.graphs) {
    for (const node of graph.nodes) {
      const milestone = { graphId: graph.id, nodeId: node.id };
      const key = `milestone:${milestoneKey(milestone)}`;
      const projection = projectSubject(
        (evidence.directBySubject.get(key) ?? []).filter((observation) =>
          sourceIsCompatibleWithCurrent(observation, { kind: "milestone", milestone }, currentBundle.catalogueVersion, input.policy)),
        (evidence.evaluationsBySubject.get(key) ?? []).filter((evaluation) =>
          sourceIsCompatibleWithCurrent(evaluation.observation, { kind: "milestone", milestone }, currentBundle.catalogueVersion, input.policy)),
        input.policy,
        asOfMs,
      );
      if (projection.latestCleanAt) latestCleanByNode.set(milestoneKey(milestone), projection.latestCleanAt);
      eligibilityProofByNode.set(
        milestoneKey(milestone),
        projection.eligibilitySupportingObservationRefs,
      );
      nodeStates.push({
        milestone,
        lifecycle: projection.lifecycle,
        confidence: projection.confidence,
        satisfiedForEligibilityBy: [],
        supportingObservationRefs: projection.supportingObservationRefs,
        reasonCodes: projection.reasonCodes,
      });
    }
  }
  const nodeByKey = new Map(nodeStates.map((state) => [milestoneKey(state.milestone), state] as const));
  const inferenceByPredecessor = new Map<string, Array<{
    milestone: MilestoneRef;
    supportingObservationRefs: readonly ObservationSourceRef[];
  }>>();
  const inferenceEdges = new Map<string, MilestoneRef[]>();
  for (const rule of input.policy.mechanicalPredecessorRules) {
    const edges = inferenceEdges.get(milestoneKey(rule.stronger)) ?? [];
    edges.push(rule.predecessor);
    inferenceEdges.set(milestoneKey(rule.stronger), edges);
  }
  for (const sourceState of nodeStates) {
    if (sourceState.lifecycle !== "established" || sourceState.confidence !== "current") continue;
    const eligibilityProof = eligibilityProofByNode.get(milestoneKey(sourceState.milestone)) ?? [];
    if (!eligibilityProof.length) continue;
    const pending = [...(inferenceEdges.get(milestoneKey(sourceState.milestone)) ?? [])];
    const visited = new Set<string>();
    while (pending.length) {
      const predecessor = pending.shift()!;
      const key = milestoneKey(predecessor);
      if (visited.has(key)) continue;
      visited.add(key);
      const existing = inferenceByPredecessor.get(key) ?? [];
      existing.push({
        milestone: sourceState.milestone,
        supportingObservationRefs: eligibilityProof,
      });
      inferenceByPredecessor.set(key, existing);
      pending.push(...(inferenceEdges.get(key) ?? []));
    }
  }
  for (let index = 0; index < nodeStates.length; index += 1) {
    const state = nodeStates[index]!;
    const satisfactions = (inferenceByPredecessor.get(milestoneKey(state.milestone)) ?? [])
      .sort((left, right) => milestoneKey(left.milestone).localeCompare(milestoneKey(right.milestone)));
    if (!satisfactions.length) continue;
    nodeStates[index] = {
      ...state,
      satisfiedForEligibilityBy: satisfactions,
      reasonCodes: uniqueReasons([...state.reasonCodes, projectionReasonCodes.inferredEligibility]),
    };
  }

  const capacityFindings: DerivedAthleteState["capacityFindings"][number][] = [];
  for (const capacity of currentBundle.capacities) {
    for (const facet of capacity.facets) {
      const ref: CapacityFacetRef = { capacityId: capacity.id, facetId: facet.id };
      const key = `capacity:${capacity.id}:${facet.id}`;
      const projection = projectSubject(
        (evidence.directBySubject.get(key) ?? []).filter((observation) =>
          sourceIsCompatibleWithCurrent(observation, { kind: "capacity-facet", capacity: ref }, currentBundle.catalogueVersion, input.policy)),
        (evidence.evaluationsBySubject.get(key) ?? []).filter((evaluation) =>
          sourceIsCompatibleWithCurrent(evaluation.observation, { kind: "capacity-facet", capacity: ref }, currentBundle.catalogueVersion, input.policy)),
        input.policy,
        asOfMs,
      );
      capacityFindings.push({
        capacity: ref,
        finding: lifecycleRank[projection.lifecycle] >= lifecycleRank.demonstrated
          ? "demonstrated"
          : projection.lifecycle === "unknown" ? "unknown" : "estimated",
        confirmationSatisfied: projection.lifecycle === "established",
        confidence: projection.confidence,
        supportingObservationRefs: projection.supportingObservationRefs,
        reasonCodes: projection.reasonCodes,
      });
    }
  }
  const stateByNode = new Map(nodeStates.map((state) => [milestoneKey(state.milestone), state] as const));
  const capacityByFacet = new Map(capacityFindings.map((finding) => [
    `${finding.capacity.capacityId}:${finding.capacity.facetId}`,
    finding,
  ] as const));
  const protocolStatuses = new Map<string, ProtocolStatus>();
  for (const protocol of currentBundle.benchmarkProtocols) {
    const compatibleEvaluations = new Map(evidence.evaluationsByProtocol);
    const protocolKey = `${protocol.id}@${protocol.definitionVersion}`;
    compatibleEvaluations.set(
      protocolKey,
      (evidence.evaluationsByProtocol.get(protocolKey) ?? []).filter((evaluation) =>
        sourceIsCompatibleWithCurrent(
          evaluation.observation,
          protocol.subject,
          currentBundle.catalogueVersion,
          input.policy,
        )),
    );
    protocolStatuses.set(
      protocolKey,
      statusForProtocol(protocol, compatibleEvaluations, input.policy, asOfMs),
    );
  }
  const compatibleEvaluations = [...evidence.evaluationsByProtocol.values()]
    .flatMap((evaluations) => evaluations)
    .filter((evaluation) => sourceIsCompatibleWithCurrent(
      evaluation.observation,
      evaluation.protocol.subject,
      currentBundle.catalogueVersion,
      input.policy,
    ));
  const restrictions = deriveRestrictions(
    normalization.activeEvents,
    normalization.observations,
    compatibleEvaluations,
    input.policy,
    asOfMs,
  );
  const recentLoad = deriveRecentLoad(normalization.observations, input.policy, input.asOf);
  const family = deriveFamilyState(
    currentBundle,
    stateByNode,
    capacityByFacet,
    protocolStatuses,
    latestCleanByNode,
    input.policy,
    asOfMs,
    input.intent.preferences.specialistOptIn,
  );

  const baseState: DerivedAthleteState = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    athleteId: input.athleteId,
    projectionVersion: input.policy.version,
    asOf: input.asOf,
    observationCursors: {
      ...(normalization.evidenceCursor ? { evidenceEvents: normalization.evidenceCursor } : {}),
      ...(normalization.sessionRecordCursor ? { sessionRecords: normalization.sessionRecordCursor } : {}),
    },
    nodeStates: nodeStates.sort((left, right) => milestoneKey(left.milestone).localeCompare(milestoneKey(right.milestone))),
    capacityFindings: capacityFindings.sort((left, right) =>
      `${left.capacity.capacityId}:${left.capacity.facetId}`.localeCompare(`${right.capacity.capacityId}:${right.capacity.facetId}`)),
    ...restrictions,
    recentLoad,
    ...family,
    trainabilityEvaluations: [],
  };
  const trainabilityEvaluations = (input.trainabilityRequests ?? [])
    .map((request) => evaluateTrainability({
      request,
      state: baseState,
      bundle: currentBundle,
      asOf: input.asOf,
      policy: input.policy,
      intent: input.intent,
    }))
    .sort((left, right) => `${left.exerciseId}:${left.prescriptionVariantId}`.localeCompare(`${right.exerciseId}:${right.prescriptionVariantId}`));
  const state: DerivedAthleteState = { ...baseState, trainabilityEvaluations };
  issues.sort((left, right) => left.severity.localeCompare(right.severity)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
  return { ok: true, state, issues, normalizedObservationCount: normalization.observations.length };
};
