import type {
  AthleteEvidenceEvent,
  DefinitionBundle,
  DemandLevel,
  DemandProfile,
  ExerciseDefinition,
  PerformanceObservedEvent,
  SessionPlan,
  SessionRecord,
} from "../contracts";
import {
  projectionReasonCodes,
} from "./policy";
import type {
  NormalizationInput,
  NormalizationResult,
  NormalizedObservation,
  ProjectionIssue,
} from "./contracts";

const sourceKey = (source: NormalizedObservation["source"]): string =>
  source.kind === "evidence-event"
    ? `event:${source.eventId}`
    : `session:${source.sessionRecordId}:item:${source.planItemId}`;

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

const issue = (
  issues: ProjectionIssue[],
  severity: ProjectionIssue["severity"],
  code: ProjectionIssue["code"],
  message: string,
  source?: ProjectionIssue["source"],
): void => {
  issues.push({ severity, code, message, ...(source ? { source } : {}) });
};

const deduplicate = <Item extends { readonly id: string }>(
  items: readonly Item[],
  label: string,
  issues: ProjectionIssue[],
): readonly Item[] => {
  const byId = new Map<string, Item>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
    } else if (canonical(existing) !== canonical(item)) {
      issue(
        issues,
        "error",
        projectionReasonCodes.duplicateConflict,
        `${label} ${item.id} has conflicting payloads`,
      );
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
};

const levelRank: Readonly<Record<DemandLevel, number>> = { low: 1, moderate: 2, high: 3 };

const mergeDemand = (...profiles: readonly DemandProfile[]): DemandProfile => {
  const result: Partial<Record<keyof DemandProfile, DemandLevel>> = {};
  for (const profile of profiles) {
    for (const [domain, level] of Object.entries(profile) as [keyof DemandProfile, DemandLevel][]) {
      if (!result[domain] || levelRank[level] > levelRank[result[domain]!]) result[domain] = level;
    }
  }
  return result;
};

const resolveExercise = (
  bundle: DefinitionBundle,
  exerciseId: string,
  version: number,
): ExerciseDefinition | undefined => bundle.exercises.find(
  (exercise) => exercise.id === exerciseId && exercise.definitionVersion === version,
);

const prescriptionDemand = (
  bundle: DefinitionBundle,
  exerciseId: string | undefined,
  exerciseVersion: number | undefined,
  prescriptionId: string | undefined,
): DemandProfile => {
  if (!exerciseId || !exerciseVersion || !prescriptionId) return {};
  const exercise = resolveExercise(bundle, exerciseId, exerciseVersion);
  return exercise?.prescriptionVariants.find((variant) => variant.id === prescriptionId)?.demand ?? {};
};

const resolveEventDemand = (
  event: PerformanceObservedEvent,
  bundle: DefinitionBundle,
): DemandProfile => {
  if (!event.benchmarkProtocolId) return {};
  const protocol = bundle.benchmarkProtocols.find(
    (candidate) => candidate.id === event.benchmarkProtocolId
      && candidate.definitionVersion === event.benchmarkProtocolVersion,
  );
  if (!protocol) return {};
  const exercise = bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  const variant = protocol.prescriptionVariantId
    ? exercise?.prescriptionVariants.find((candidate) => candidate.id === protocol.prescriptionVariantId)
    : exercise?.prescriptionVariants[0];
  return variant?.demand ?? {};
};

const resolveCorrections = (
  events: readonly AthleteEvidenceEvent[],
  athleteId: string,
  issues: ProjectionIssue[],
): readonly AthleteEvidenceEvent[] => {
  const byId = new Map(events.map((event) => [event.id, event] as const));
  const correctedTargets = new Set<string>();
  for (const event of events) {
    if (event.athleteId !== athleteId) {
      issue(issues, "error", projectionReasonCodes.invalidInput, `Event ${event.id} belongs to another athlete`);
      continue;
    }
    if (event.type !== "evidence_corrected") continue;
    const target = byId.get(event.supersedesEventId);
    if (!target) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Correction ${event.id} has an unknown target`);
      continue;
    }
    if (target.athleteId !== event.athleteId || target.type === "evidence_corrected") {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Correction ${event.id} has an ambiguous or cross-athlete target`);
      continue;
    }
    if (Date.parse(event.recordedAt) < Date.parse(target.recordedAt)) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Correction ${event.id} was recorded before its target`);
      continue;
    }
    if (correctedTargets.has(target.id)) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Evidence ${target.id} is corrected more than once`);
      continue;
    }
    correctedTargets.add(target.id);
  }
  return events.filter((event) => event.type !== "evidence_corrected" && !correctedTargets.has(event.id));
};

const validateRestrictionLinks = (
  events: readonly AthleteEvidenceEvent[],
  issues: ProjectionIssue[],
): void => {
  const byId = new Map(events.map((event) => [event.id, event] as const));
  for (const event of events) {
    if (event.type !== "restriction_cleared") continue;
    const report = byId.get(event.restrictionEventId);
    if (!report || report.type !== "restriction_reported" || report.athleteId !== event.athleteId) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Restriction clearance ${event.id} has an unknown or invalid report`);
      continue;
    }
    if (Date.parse(event.occurredAt) < Date.parse(report.occurredAt)) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Restriction clearance ${event.id} predates its report`);
    }
  }
};

const resolveRecordSupersession = (
  records: readonly SessionRecord[],
  athleteId: string,
  plans: ReadonlyMap<string, SessionPlan>,
  issues: ProjectionIssue[],
): readonly SessionRecord[] => {
  const byId = new Map(records.map((record) => [record.id, record] as const));
  const successorByTarget = new Map<string, SessionRecord>();
  const recordsByPlan = new Map<string, SessionRecord[]>();

  for (const record of records) {
    if (record.athleteId !== athleteId) {
      issue(issues, "error", projectionReasonCodes.invalidInput, `Session Record ${record.id} belongs to another athlete`);
      continue;
    }
    const plan = plans.get(record.planId);
    if (!plan || plan.athleteId !== record.athleteId) {
      issue(issues, "error", projectionReasonCodes.invalidInput, `Session Record ${record.id} has no same-athlete Session Plan`);
    }
    const planRecords = recordsByPlan.get(record.planId) ?? [];
    planRecords.push(record);
    recordsByPlan.set(record.planId, planRecords);
    if (!record.supersedesRecordId) continue;
    const target = byId.get(record.supersedesRecordId);
    if (!target || target.athleteId !== record.athleteId || target.planId !== record.planId) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Session replacement ${record.id} has an invalid target`);
      continue;
    }
    if (Date.parse(record.recordedAt) < Date.parse(target.recordedAt)) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Session replacement ${record.id} was recorded before its target`);
      continue;
    }
    if (successorByTarget.has(target.id)) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Session Record ${target.id} has a replacement fork`);
      continue;
    }
    successorByTarget.set(target.id, record);
  }

  for (const [planId, planRecords] of recordsByPlan) {
    const leaves = planRecords.filter((record) => !successorByTarget.has(record.id));
    if (leaves.length > 1) {
      issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Session Plan ${planId} has multiple active records`);
    }
    for (const record of planRecords) {
      const visited = new Set<string>();
      let cursor: SessionRecord | undefined = record;
      while (cursor?.supersedesRecordId) {
        if (visited.has(cursor.id)) {
          issue(issues, "error", projectionReasonCodes.supersessionInvalid, `Session replacement chain for ${record.id} is cyclic`);
          break;
        }
        visited.add(cursor.id);
        cursor = byId.get(cursor.supersedesRecordId);
      }
    }
  }

  return records.filter((record) => !successorByTarget.has(record.id));
};

export const normalizeObservations = (input: NormalizationInput): NormalizationResult => {
  const issues: ProjectionIssue[] = [];
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) {
    issue(issues, "error", projectionReasonCodes.invalidInput, "Projection asOf must be an ISO timestamp");
  }

  const bundles = new Map<number, DefinitionBundle>();
  for (const bundle of input.definitionBundles) {
    const existing = bundles.get(bundle.catalogueVersion);
    if (existing && canonical(existing) !== canonical(bundle)) {
      issue(issues, "error", projectionReasonCodes.duplicateConflict, `Catalogue version ${bundle.catalogueVersion} has conflicting bundles`);
    } else {
      bundles.set(bundle.catalogueVersion, bundle);
    }
  }

  const plans = deduplicate(input.sessionPlans, "Session Plan", issues);
  const planById = new Map(plans.map((plan) => [plan.id, plan] as const));
  for (const plan of plans) {
    if (plan.athleteId !== input.athleteId) {
      issue(issues, "error", projectionReasonCodes.invalidInput, `Session Plan ${plan.id} belongs to another athlete`);
    }
    if (!bundles.has(plan.catalogueVersion)) {
      issue(issues, "error", projectionReasonCodes.unsupportedVersion, `Session Plan ${plan.id} uses unavailable catalogue ${plan.catalogueVersion}`);
    }
  }

  const knownEvents = deduplicate(input.evidenceEvents, "Evidence Event", issues)
    .filter((event) => Date.parse(event.recordedAt) <= asOfMs && Date.parse(event.occurredAt) <= asOfMs)
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
      || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
      || left.id.localeCompare(right.id));
  const activeEvents = resolveCorrections(knownEvents, input.athleteId, issues);
  validateRestrictionLinks(activeEvents, issues);

  const knownRecords = deduplicate(input.sessionRecords, "Session Record", issues)
    .filter((record) => Date.parse(record.recordedAt) <= asOfMs && Date.parse(record.completedAt) <= asOfMs)
    .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt)
      || Date.parse(left.startedAt) - Date.parse(right.startedAt)
      || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
      || left.id.localeCompare(right.id));
  const activeRecords = resolveRecordSupersession(knownRecords, input.athleteId, planById, issues);

  const observations: NormalizedObservation[] = [];
  for (const event of activeEvents) {
    if (event.type !== "performance_observed") continue;
    const source = { kind: "evidence-event" as const, eventId: event.id };
    const bundle = bundles.get(event.catalogueVersion);
    if (!bundle) {
      issue(issues, "error", projectionReasonCodes.unsupportedVersion, `Event ${event.id} uses unavailable catalogue ${event.catalogueVersion}`, source);
      continue;
    }
    const guidedProtocol = event.source === "guided-test" && event.benchmarkProtocolId !== undefined;
    if (guidedProtocol && !event.observationSessionId) {
      issue(issues, "warning", projectionReasonCodes.missingTestContext, `Guided event ${event.id} cannot contribute to confirmation without a test occasion ID`, source);
    }
    observations.push({
      source,
      sourceKey: sourceKey(source),
      athleteId: event.athleteId,
      occurredAt: event.occurredAt,
      sessionKey: event.observationSessionId ? `test:${event.observationSessionId}` : `event:${event.id}`,
      ...(event.observationSessionId ? { observationSessionId: event.observationSessionId } : {}),
      catalogueVersion: event.catalogueVersion,
      strength: guidedProtocol && event.observationSessionId ? "benchmark" : "weak",
      legacySparse: false,
      evidenceSource: event.source,
      subject: event.subject,
      outcome: event.outcome,
      ...(event.benchmarkProtocolId ? { benchmarkProtocolId: event.benchmarkProtocolId } : {}),
      ...(event.benchmarkProtocolVersion ? { benchmarkProtocolVersion: event.benchmarkProtocolVersion } : {}),
      ...(event.measurement ? { measurement: event.measurement } : {}),
      ...(event.assistance ? { assistance: event.assistance } : {}),
      ...(event.range ? { range: event.range } : {}),
      ...(event.perceivedExertion ? { perceivedExertion: event.perceivedExertion } : {}),
      participationSeconds: 0,
      demand: resolveEventDemand(event, bundle),
      symptomOrInstability: event.outcome === "symptom",
    });
  }

  for (const record of activeRecords) {
    const plan = planById.get(record.planId);
    const bundle = plan ? bundles.get(plan.catalogueVersion) : undefined;
    if (!plan || !bundle) continue;
    const legacySparse = plan.legacySource?.kind === "legacy-v1.2-sparse"
      || record.legacySource?.kind === "legacy-v1.2-sparse";
    if (legacySparse && (
      plan.legacySource?.sourceSessionId !== record.legacySource?.sourceSessionId
      || plan.legacySource?.sourceVersion !== record.legacySource?.sourceVersion
    )) {
      issue(
        issues,
        "error",
        projectionReasonCodes.invalidInput,
        `Legacy Session Plan/Record provenance differs for ${record.id}`,
      );
      continue;
    }
    const itemById = new Map(plan.items.map((item) => [item.id, item] as const));
    for (const outcome of record.itemOutcomes) {
      if (outcome.status === "skipped"
        || (outcome.participationSeconds <= 0 && outcome.participationBasis !== "legacy-unknown")) continue;
      const planItem = itemById.get(outcome.planItemId);
      if (!planItem) {
        issue(issues, "error", projectionReasonCodes.invalidInput, `Session Record ${record.id} references unknown plan item ${outcome.planItemId}`);
        continue;
      }
      const source = {
        kind: "session-item" as const,
        sessionRecordId: record.id,
        planItemId: outcome.planItemId,
      };
      const exerciseId = outcome.performedExerciseId ?? planItem.exerciseId;
      const exerciseVersion = outcome.performedExerciseDefinitionVersion ?? planItem.exerciseDefinitionVersion;
      const prescriptionVariantId = outcome.performedPrescriptionVariantId ?? planItem.prescriptionVariantId;
      const actualExercise = resolveExercise(bundle, exerciseId, exerciseVersion);
      const actualVariant = actualExercise?.prescriptionVariants.find(
        (variant) => variant.id === prescriptionVariantId,
      );
      if (!actualExercise || !actualVariant) {
        issue(
          issues,
          "error",
          projectionReasonCodes.unsupportedVersion,
          `Session item ${record.id}:${outcome.planItemId} references an unavailable exercise or prescription definition`,
          source,
        );
        continue;
      }
      const actualDemand = prescriptionDemand(bundle, exerciseId, exerciseVersion, prescriptionVariantId);
      const benchmark = outcome.benchmarkObservation;
      observations.push({
        source,
        sourceKey: sourceKey(source),
        athleteId: record.athleteId,
        occurredAt: record.completedAt,
        sessionKey: `record:${record.id}`,
        catalogueVersion: plan.catalogueVersion,
        strength: benchmark ? "benchmark" : "development",
        legacySparse,
        evidenceSource: "session-record",
        ...(benchmark?.subject ? { subject: benchmark.subject } : planItem.targetMilestone ? {
          subject: { kind: "milestone" as const, milestone: planItem.targetMilestone },
        } : {}),
        ...(benchmark ? {
          outcome: benchmark.outcome,
          benchmarkProtocolId: benchmark.benchmarkProtocolId,
          benchmarkProtocolVersion: benchmark.benchmarkProtocolVersion,
        } : outcome.review ? {
          outcome: outcome.review.outcome === "clean"
            ? "clean" as const
            : outcome.review.outcome === "partial"
              ? "partial" as const
              : "not-yet" as const,
        } : {}),
        ...(benchmark?.measurement ? { measurement: benchmark.measurement } : {}),
        ...(benchmark?.assistance ? { assistance: benchmark.assistance } : {}),
        ...(benchmark?.range ? { range: benchmark.range } : {}),
        ...(benchmark?.perceivedExertion ? { perceivedExertion: benchmark.perceivedExertion } : {}),
        ...(outcome.review ? {
          reviewOutcome: outcome.review.outcome,
          ...(outcome.review.difficulty ? { reviewDifficulty: outcome.review.difficulty } : {}),
        } : {}),
        exerciseId,
        exerciseDefinitionVersion: exerciseVersion,
        prescriptionVariantId,
        participationSeconds: outcome.participationSeconds,
        demand: Object.keys(actualDemand).length ? actualDemand : mergeDemand(planItem.demand),
        symptomOrInstability: benchmark?.outcome === "symptom" || outcome.review?.symptomOrInstability === true,
      });
    }
  }

  observations.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.source.kind.localeCompare(right.source.kind)
    || left.sourceKey.localeCompare(right.sourceKey));
  issues.sort((left, right) => left.severity.localeCompare(right.severity)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));

  const evidenceCursor = [...knownEvents]
    .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
      || right.id.localeCompare(left.id))[0]?.id;
  const sessionRecordCursor = [...knownRecords]
    .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
      || right.id.localeCompare(left.id))[0]?.id;
  return {
    observations,
    activeEvents,
    activeRecords,
    ...(evidenceCursor ? { evidenceCursor } : {}),
    ...(sessionRecordCursor ? { sessionRecordCursor } : {}),
    issues,
  };
};
