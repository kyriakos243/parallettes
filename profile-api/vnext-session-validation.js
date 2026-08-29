const SCHEMA_VERSION = 1;
const MAX_ID_LENGTH = 180;
const ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const DEMAND_DOMAINS = new Set([
  "hand-wrist-bearing",
  "forward-straight-arm-upper-limb",
  "overhead-straight-arm-upper-limb",
  "horizontal-bent-arm-push",
  "vertical-bent-arm-push",
  "inversion-technical",
  "compression-trunk",
]);
const DEMAND_LEVELS = new Set(["low", "moderate", "high"]);
const PURPOSES = new Set([
  "preparation",
  "primary-development",
  "secondary-development",
  "maintenance",
  "guided-test",
  "recovery",
]);

class ValidationFailure extends Error {}

const fail = (message) => { throw new ValidationFailure(message); };
const object = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
};
const exactKeys = (value, allowed, label) => {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) fail(`${label} contains unsupported field ${unexpected}.`);
};
const stableId = (value, label) => {
  if (typeof value !== "string" || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    fail(`${label} is not a valid stable ID.`);
  }
  return value;
};
const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer.`);
  return value;
};
const nonNegativeNumber = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a non-negative finite number.`);
  }
  return value;
};
const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value;
};
const isoTimestamp = (value, label) => {
  if (typeof value !== "string" || !ISO_PATTERN.test(value)) fail(`${label} must be a canonical ISO timestamp.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
};
const oneOf = (value, options, label) => {
  if (!options.has(value)) fail(`${label} has an unsupported value.`);
  return value;
};

const validateLegacySource = (value, label) => {
  const source = object(value, label);
  exactKeys(source, [
    "kind", "sourceVersion", "sourceSessionId", "timingPrecision", "prescriptionPrecision",
    "sourceTotalSeconds", "sourceDay", "sourceLevel", "sourceMode",
  ], label);
  if (source.kind !== "legacy-v1.2-sparse" || source.sourceVersion !== "1.2"
    || source.timingPrecision !== "session-total-only"
    || source.prescriptionPrecision !== "catalogue-default-reconstruction") {
    fail(`${label} has unsupported legacy provenance.`);
  }
  nonEmptyString(source.sourceSessionId, `${label}.sourceSessionId`);
  if (source.sourceTotalSeconds !== undefined) nonNegativeNumber(source.sourceTotalSeconds, `${label}.sourceTotalSeconds`);
  if (source.sourceDay !== undefined && (!Number.isSafeInteger(source.sourceDay) || source.sourceDay < 0)) {
    fail(`${label}.sourceDay must be a non-negative integer.`);
  }
  if (source.sourceLevel !== undefined) nonEmptyString(source.sourceLevel, `${label}.sourceLevel`);
  if (source.sourceMode !== undefined) nonEmptyString(source.sourceMode, `${label}.sourceMode`);
};

const validateMilestone = (value, label) => {
  const milestone = object(value, label);
  exactKeys(milestone, ["graphId", "nodeId"], label);
  stableId(milestone.graphId, `${label}.graphId`);
  stableId(milestone.nodeId, `${label}.nodeId`);
};

const validateSubject = (value, label) => {
  const subject = object(value, label);
  if (subject.kind === "milestone") {
    exactKeys(subject, ["kind", "milestone"], label);
    validateMilestone(subject.milestone, `${label}.milestone`);
    return;
  }
  if (subject.kind === "capacity-facet") {
    exactKeys(subject, ["kind", "capacity"], label);
    const capacity = object(subject.capacity, `${label}.capacity`);
    exactKeys(capacity, ["capacityId", "facetId"], `${label}.capacity`);
    stableId(capacity.capacityId, `${label}.capacity.capacityId`);
    stableId(capacity.facetId, `${label}.capacity.facetId`);
    return;
  }
  fail(`${label} must identify a milestone or capacity facet.`);
};

const validateDemand = (value, label) => {
  const demand = object(value, label);
  for (const [domain, level] of Object.entries(demand)) {
    if (!DEMAND_DOMAINS.has(domain) || !DEMAND_LEVELS.has(level)) fail(`${label}.${domain} is invalid.`);
  }
};

const validateMeasurement = (value, label) => {
  const measurement = object(value, label);
  exactKeys(measurement, ["value", "unit", "attemptsTotal"], label);
  nonNegativeNumber(measurement.value, `${label}.value`);
  oneOf(measurement.unit, new Set(["seconds", "repetitions", "attempts", "degrees"]), `${label}.unit`);
  if (measurement.unit === "attempts") {
    if (!Number.isSafeInteger(measurement.value)) fail(`${label}.value must be an integer attempt count.`);
    positiveInteger(measurement.attemptsTotal, `${label}.attemptsTotal`);
    if (measurement.value > measurement.attemptsTotal) fail(`${label}.attemptsTotal cannot be below successful attempts.`);
  } else if (measurement.attemptsTotal !== undefined) {
    fail(`${label}.attemptsTotal is valid only with attempt measurements.`);
  }
};

const validateEvidenceInternal = (payload, itemId, profileId) => {
  const event = object(payload, "Evidence Event");
  const baseKeys = [
    "schemaVersion", "id", "athleteId", "occurredAt", "recordedAt", "source", "catalogueVersion", "type",
  ];
  if (event.schemaVersion !== SCHEMA_VERSION || event.id !== itemId || event.athleteId !== profileId) {
    fail("Evidence Event identity or schema version is invalid.");
  }
  stableId(event.id, "Evidence Event id");
  stableId(event.athleteId, "Evidence Event athleteId");
  const occurredAt = isoTimestamp(event.occurredAt, "Evidence Event occurredAt");
  const recordedAt = isoTimestamp(event.recordedAt, "Evidence Event recordedAt");
  if (Date.parse(recordedAt) < Date.parse(occurredAt)) fail("Evidence Event recordedAt cannot precede occurredAt.");
  oneOf(event.source, new Set(["self-assessment", "guided-test", "athlete-report", "migration", "correction"]), "Evidence Event source");
  positiveInteger(event.catalogueVersion, "Evidence Event catalogueVersion");

  if (event.type === "performance_observed") {
    exactKeys(event, [
      ...baseKeys, "subject", "outcome", "benchmarkProtocolId", "benchmarkProtocolVersion",
      "observationSessionId", "measurement", "assistance", "range", "perceivedExertion", "notes",
      "legacySourceVersion", "legacySourceReference",
    ], "Evidence Event");
    oneOf(event.source, new Set(["self-assessment", "guided-test", "athlete-report", "migration"]), "Performance Event source");
    if (event.source === "migration") {
      if (event.legacySourceVersion !== "1.2") fail("Migrated performance evidence must retain source version 1.2.");
      nonEmptyString(event.legacySourceReference, "Performance Event legacySourceReference");
    } else if (event.legacySourceVersion !== undefined || event.legacySourceReference !== undefined) {
      fail("Legacy performance provenance is valid only for migration evidence.");
    }
    validateSubject(event.subject, "Performance Event subject");
    oneOf(event.outcome, new Set(["clean", "partial", "not-yet", "symptom"]), "Performance Event outcome");
    const hasProtocolId = event.benchmarkProtocolId !== undefined;
    const hasProtocolVersion = event.benchmarkProtocolVersion !== undefined;
    if (hasProtocolId !== hasProtocolVersion) fail("Performance Event has an incomplete benchmark protocol reference.");
    if (hasProtocolId) {
      stableId(event.benchmarkProtocolId, "Performance Event benchmarkProtocolId");
      positiveInteger(event.benchmarkProtocolVersion, "Performance Event benchmarkProtocolVersion");
    }
    if (event.observationSessionId !== undefined) stableId(event.observationSessionId, "Performance Event observationSessionId");
    if (event.source === "guided-test" && hasProtocolId && event.observationSessionId === undefined) {
      fail("A guided benchmark must identify its real test occasion.");
    }
    if (event.source !== "guided-test" && event.observationSessionId !== undefined) {
      fail("Only guided tests may identify a standalone test occasion.");
    }
    if (event.measurement !== undefined) validateMeasurement(event.measurement, "Performance Event measurement");
    if (event.assistance !== undefined) nonEmptyString(event.assistance, "Performance Event assistance");
    if (event.range !== undefined) nonEmptyString(event.range, "Performance Event range");
    if (event.notes !== undefined) nonEmptyString(event.notes, "Performance Event notes");
    if (event.perceivedExertion !== undefined && (
      typeof event.perceivedExertion !== "number" || !Number.isFinite(event.perceivedExertion)
      || event.perceivedExertion < 1 || event.perceivedExertion > 10
    )) fail("Performance Event perceivedExertion must be from 1 to 10.");
    return;
  }

  if (event.type === "restriction_reported") {
    exactKeys(event, [...baseKeys, "severity", "demandDomains", "bodyRegions", "notes"], "Evidence Event");
    oneOf(event.source, new Set(["self-assessment", "guided-test", "athlete-report"]), "Restriction Event source");
    oneOf(event.severity, new Set(["modify", "block"]), "Restriction Event severity");
    if (!Array.isArray(event.demandDomains) || !event.demandDomains.length
      || event.demandDomains.some((domain) => !DEMAND_DOMAINS.has(domain))) {
      fail("Restriction Event must identify at least one valid demand domain.");
    }
    if (!Array.isArray(event.bodyRegions) || !event.bodyRegions.length) {
      fail("Restriction Event must identify at least one body region.");
    }
    event.bodyRegions.forEach((region, index) => nonEmptyString(region, `Restriction Event bodyRegions[${index}]`));
    if (event.notes !== undefined) nonEmptyString(event.notes, "Restriction Event notes");
    return;
  }

  if (event.type === "restriction_cleared") {
    exactKeys(event, [...baseKeys, "restrictionEventId", "notes"], "Evidence Event");
    oneOf(event.source, new Set(["guided-test", "athlete-report"]), "Restriction Clearance source");
    stableId(event.restrictionEventId, "Restriction Clearance restrictionEventId");
    if (event.restrictionEventId === event.id) fail("Restriction Clearance cannot reference itself.");
    if (event.notes !== undefined) nonEmptyString(event.notes, "Restriction Clearance notes");
    return;
  }

  if (event.type === "legacy_claim_imported") {
    exactKeys(event, [...baseKeys, "sourceVersion", "claim"], "Evidence Event");
    if (event.source !== "migration" || event.sourceVersion !== "1.2") {
      fail("Legacy claims must retain migration source version 1.2.");
    }
    const claim = object(event.claim, "Legacy claim");
    if (claim.kind === "readiness-gate") {
      exactKeys(claim, ["kind", "legacyGateId", "claimed"], "Legacy readiness claim");
      nonEmptyString(claim.legacyGateId, "Legacy readiness claim legacyGateId");
      if (claim.claimed !== true) fail("Only true legacy readiness claims are imported.");
      return;
    }
    if (claim.kind === "progression-hint") {
      exactKeys(claim, ["kind", "legacyExerciseId", "cleanSessions", "lastFeedback"], "Legacy progression claim");
      nonEmptyString(claim.legacyExerciseId, "Legacy progression claim legacyExerciseId");
      if (!Number.isSafeInteger(claim.cleanSessions) || claim.cleanSessions < 0) {
        fail("Legacy progression cleanSessions must be a non-negative integer.");
      }
      if (claim.lastFeedback !== undefined) {
        oneOf(claim.lastFeedback, new Set(["easy", "right", "hard"]), "Legacy progression lastFeedback");
      }
      return;
    }
    if (claim.kind === "assessment-answer") {
      exactKeys(claim, ["kind", "legacyTrackId", "legacyAnchorExerciseId", "answer"], "Legacy assessment claim");
      nonEmptyString(claim.legacyTrackId, "Legacy assessment claim legacyTrackId");
      nonEmptyString(claim.legacyAnchorExerciseId, "Legacy assessment claim legacyAnchorExerciseId");
      oneOf(claim.answer, new Set(["clean", "almost", "not-yet"]), "Legacy assessment claim answer");
      return;
    }
    fail("Legacy claim kind is unsupported.");
  }

  if (event.type === "evidence_corrected") {
    exactKeys(event, [...baseKeys, "supersedesEventId", "reason"], "Evidence Event");
    if (event.source !== "correction") fail("Evidence Correction must use correction source.");
    stableId(event.supersedesEventId, "Evidence Correction supersedesEventId");
    if (event.supersedesEventId === event.id) fail("Evidence Correction cannot supersede itself.");
    nonEmptyString(event.reason, "Evidence Correction reason");
    return;
  }

  fail("Evidence Event type is unsupported.");
};

const validateIntentInternal = (payload, profileId) => {
  const intent = object(payload, "Athlete Intent");
  exactKeys(intent, [
    "schemaVersion", "athleteId", "updatedAt", "goals", "emphasisOverride", "equipment",
    "defaultSessionDemand", "preferences",
  ], "Athlete Intent");
  if (intent.schemaVersion !== SCHEMA_VERSION || intent.athleteId !== profileId) {
    fail("Athlete Intent identity or schema version is invalid.");
  }
  stableId(intent.athleteId, "Athlete Intent athleteId");
  isoTimestamp(intent.updatedAt, "Athlete Intent updatedAt");
  if (!Array.isArray(intent.goals)) fail("Athlete Intent goals must be an array.");
  for (const [index, raw] of intent.goals.entries()) {
    const label = `Athlete Intent goals[${index}]`;
    const goal = object(raw, label);
    exactKeys(goal, ["graphId", "targetNodeId", "priority"], label);
    stableId(goal.graphId, `${label}.graphId`);
    if (goal.targetNodeId !== undefined) stableId(goal.targetNodeId, `${label}.targetNodeId`);
    oneOf(goal.priority, new Set(["primary", "secondary", "interest"]), `${label}.priority`);
  }
  if (intent.emphasisOverride !== undefined) {
    const emphasis = object(intent.emphasisOverride, "Athlete Intent emphasisOverride");
    exactKeys(emphasis, ["primaryGraphId", "secondaryGraphId"], "Athlete Intent emphasisOverride");
    stableId(emphasis.primaryGraphId, "Athlete Intent emphasisOverride.primaryGraphId");
    if (emphasis.secondaryGraphId !== undefined) {
      stableId(emphasis.secondaryGraphId, "Athlete Intent emphasisOverride.secondaryGraphId");
    }
  }
  if (!Array.isArray(intent.equipment) || !intent.equipment.length) {
    fail("Athlete Intent equipment must be a non-empty array.");
  }
  const equipment = new Set();
  for (const [index, id] of intent.equipment.entries()) {
    stableId(id, `Athlete Intent equipment[${index}]`);
    if (equipment.has(id)) fail(`Athlete Intent contains duplicate equipment ${id}.`);
    equipment.add(id);
  }
  oneOf(intent.defaultSessionDemand, new Set(["technique", "standard", "challenge"]), "Athlete Intent defaultSessionDemand");
  const preferences = object(intent.preferences, "Athlete Intent preferences");
  exactKeys(preferences, ["preferredDurationMinutes", "specialistOptIn"], "Athlete Intent preferences");
  if (preferences.preferredDurationMinutes !== undefined) {
    positiveInteger(preferences.preferredDurationMinutes, "Athlete Intent preferredDurationMinutes");
  }
  if (typeof preferences.specialistOptIn !== "boolean") {
    fail("Athlete Intent specialistOptIn must be Boolean.");
  }
};

const validatePlanInternal = (payload, itemId, profileId) => {
  const plan = object(payload, "Session Plan");
  exactKeys(plan, [
    "schemaVersion", "id", "athleteId", "createdAt", "catalogueVersion", "generatorPolicyId",
    "generatorPolicyVersion", "definitionReferences", "intendedDurationSeconds", "items", "legacySource", "rationale",
  ], "Session Plan");
  if (plan.schemaVersion !== SCHEMA_VERSION || plan.id !== itemId || plan.athleteId !== profileId) {
    fail("Session Plan identity or schema version is invalid.");
  }
  stableId(plan.id, "Session Plan id");
  stableId(plan.athleteId, "Session Plan athleteId");
  isoTimestamp(plan.createdAt, "Session Plan createdAt");
  positiveInteger(plan.catalogueVersion, "Session Plan catalogueVersion");
  stableId(plan.generatorPolicyId, "Session Plan generatorPolicyId");
  positiveInteger(plan.generatorPolicyVersion, "Session Plan generatorPolicyVersion");

  const legacy = plan.legacySource !== undefined;
  if (legacy) validateLegacySource(plan.legacySource, "Session Plan legacySource");
  if (legacy) nonNegativeNumber(plan.intendedDurationSeconds, "Session Plan intendedDurationSeconds");
  else positiveInteger(plan.intendedDurationSeconds, "Session Plan intendedDurationSeconds");

  if (!Array.isArray(plan.definitionReferences)) fail("Session Plan definitionReferences must be an array.");
  const references = new Map();
  for (const [index, raw] of plan.definitionReferences.entries()) {
    const label = `Session Plan definitionReferences[${index}]`;
    const reference = object(raw, label);
    exactKeys(reference, ["kind", "id", "version"], label);
    oneOf(reference.kind, new Set(["exercise", "graph", "capacity", "benchmark", "policy"]), `${label}.kind`);
    stableId(reference.id, `${label}.id`);
    positiveInteger(reference.version, `${label}.version`);
    const key = `${reference.kind}:${reference.id}`;
    if (references.has(key)) fail(`Session Plan contains duplicate definition reference ${key}.`);
    references.set(key, reference.version);
  }
  if (references.get(`policy:${plan.generatorPolicyId}`) !== plan.generatorPolicyVersion) {
    fail("Session Plan generator policy is not represented by an exact definition reference.");
  }

  if (!Array.isArray(plan.items) || !plan.items.length) fail("Session Plan items must be a non-empty array.");
  const itemIds = new Set();
  let plannedSeconds = 0;
  for (const [index, raw] of plan.items.entries()) {
    const label = `Session Plan items[${index}]`;
    const item = object(raw, label);
    exactKeys(item, [
      "id", "exerciseId", "exerciseDefinitionVersion", "prescriptionVariantId", "benchmarkProtocolId",
      "benchmarkProtocolVersion", "purpose", "plannedSeconds", "targetMilestone", "demand",
    ], label);
    stableId(item.id, `${label}.id`);
    if (itemIds.has(item.id)) fail(`Session Plan contains duplicate item ${item.id}.`);
    itemIds.add(item.id);
    stableId(item.exerciseId, `${label}.exerciseId`);
    positiveInteger(item.exerciseDefinitionVersion, `${label}.exerciseDefinitionVersion`);
    stableId(item.prescriptionVariantId, `${label}.prescriptionVariantId`);
    if (references.get(`exercise:${item.exerciseId}`) !== item.exerciseDefinitionVersion) {
      fail(`${label} is missing its exact exercise definition reference.`);
    }
    const hasBenchmarkId = item.benchmarkProtocolId !== undefined;
    const hasBenchmarkVersion = item.benchmarkProtocolVersion !== undefined;
    if (hasBenchmarkId !== hasBenchmarkVersion) fail(`${label} has an incomplete benchmark reference.`);
    if (hasBenchmarkId) {
      stableId(item.benchmarkProtocolId, `${label}.benchmarkProtocolId`);
      positiveInteger(item.benchmarkProtocolVersion, `${label}.benchmarkProtocolVersion`);
      if (references.get(`benchmark:${item.benchmarkProtocolId}`) !== item.benchmarkProtocolVersion) {
        fail(`${label} is missing its exact benchmark definition reference.`);
      }
    }
    oneOf(item.purpose, PURPOSES, `${label}.purpose`);
    if (item.purpose === "guided-test" && !hasBenchmarkId) fail(`${label} guided test requires a benchmark protocol.`);
    if (legacy) nonNegativeNumber(item.plannedSeconds, `${label}.plannedSeconds`);
    else positiveInteger(item.plannedSeconds, `${label}.plannedSeconds`);
    plannedSeconds += item.plannedSeconds;
    if (item.targetMilestone !== undefined) {
      validateMilestone(item.targetMilestone, `${label}.targetMilestone`);
      if (!references.has(`graph:${item.targetMilestone.graphId}`)) fail(`${label} is missing its graph definition reference.`);
    }
    validateDemand(item.demand, `${label}.demand`);
  }
  if (!legacy && plannedSeconds !== plan.intendedDurationSeconds) {
    fail("Session Plan item durations do not equal intendedDurationSeconds.");
  }

  if (!Array.isArray(plan.rationale)) fail("Session Plan rationale must be an array.");
  for (const [index, raw] of plan.rationale.entries()) {
    const label = `Session Plan rationale[${index}]`;
    const reason = object(raw, label);
    exactKeys(reason, ["code", "message", "relatedGraphId"], label);
    stableId(reason.code, `${label}.code`);
    nonEmptyString(reason.message, `${label}.message`);
    if (reason.relatedGraphId !== undefined) stableId(reason.relatedGraphId, `${label}.relatedGraphId`);
  }
};

const validateRecordInternal = (payload, itemId, profileId) => {
  const record = object(payload, "Session Record");
  exactKeys(record, [
    "schemaVersion", "id", "athleteId", "planId", "startedAt", "completedAt", "recordedAt",
    "status", "itemOutcomes", "legacySource", "supersedesRecordId",
  ], "Session Record");
  if (record.schemaVersion !== SCHEMA_VERSION || record.id !== itemId || record.athleteId !== profileId) {
    fail("Session Record identity or schema version is invalid.");
  }
  stableId(record.id, "Session Record id");
  stableId(record.athleteId, "Session Record athleteId");
  stableId(record.planId, "Session Record planId");
  const startedAt = isoTimestamp(record.startedAt, "Session Record startedAt");
  const completedAt = isoTimestamp(record.completedAt, "Session Record completedAt");
  const recordedAt = isoTimestamp(record.recordedAt, "Session Record recordedAt");
  if (Date.parse(completedAt) < Date.parse(startedAt) || Date.parse(recordedAt) < Date.parse(completedAt)) {
    fail("Session Record timestamps are not chronological.");
  }
  oneOf(record.status, new Set(["complete", "modified", "partial", "abandoned"]), "Session Record status");
  const legacy = record.legacySource !== undefined;
  if (legacy) validateLegacySource(record.legacySource, "Session Record legacySource");
  if (record.supersedesRecordId !== undefined) {
    stableId(record.supersedesRecordId, "Session Record supersedesRecordId");
    if (record.supersedesRecordId === record.id) fail("Session Record cannot supersede itself.");
  }
  if (!Array.isArray(record.itemOutcomes)) fail("Session Record itemOutcomes must be an array.");
  const outcomeIds = new Set();
  for (const [index, raw] of record.itemOutcomes.entries()) {
    const label = `Session Record itemOutcomes[${index}]`;
    const item = object(raw, label);
    exactKeys(item, [
      "planItemId", "status", "participationSeconds", "participationBasis", "performedExerciseId",
      "performedExerciseDefinitionVersion", "performedPrescriptionVariantId", "modificationReason",
      "benchmarkObservation", "review",
    ], label);
    stableId(item.planItemId, `${label}.planItemId`);
    if (outcomeIds.has(item.planItemId)) fail(`Session Record contains duplicate outcome ${item.planItemId}.`);
    outcomeIds.add(item.planItemId);
    oneOf(item.status, new Set(["completed", "modified", "skipped"]), `${label}.status`);
    if (item.participationBasis !== undefined) {
      oneOf(item.participationBasis, new Set(["measured", "legacy-unknown"]), `${label}.participationBasis`);
    }
    if (item.participationBasis === "legacy-unknown" && !legacy) fail(`${label} uses legacy participation without legacy provenance.`);
    nonNegativeNumber(item.participationSeconds, `${label}.participationSeconds`);
    if (item.status === "skipped" && item.participationSeconds !== 0) fail(`${label} skipped work must have zero participation.`);
    if (item.status !== "skipped" && item.participationSeconds === 0 && item.participationBasis !== "legacy-unknown") {
      fail(`${label} performed work requires participation or explicit legacy uncertainty.`);
    }
    const hasPerformedId = item.performedExerciseId !== undefined;
    const hasPerformedVersion = item.performedExerciseDefinitionVersion !== undefined;
    if (hasPerformedId !== hasPerformedVersion) fail(`${label} has an incomplete performed-exercise reference.`);
    if (hasPerformedId) {
      stableId(item.performedExerciseId, `${label}.performedExerciseId`);
      positiveInteger(item.performedExerciseDefinitionVersion, `${label}.performedExerciseDefinitionVersion`);
    }
    if (item.performedPrescriptionVariantId !== undefined) {
      stableId(item.performedPrescriptionVariantId, `${label}.performedPrescriptionVariantId`);
    }
    if (item.modificationReason !== undefined) nonEmptyString(item.modificationReason, `${label}.modificationReason`);
    if (item.status === "modified" && !hasPerformedId && item.performedPrescriptionVariantId === undefined
      && item.modificationReason === undefined) fail(`${label} modified work must explain the modification.`);

    if (item.benchmarkObservation !== undefined) {
      if (legacy || item.status === "skipped" || item.participationSeconds <= 0) {
        fail(`${label} cannot attach an exact benchmark to skipped, zero-time, or sparse legacy work.`);
      }
      const benchmark = object(item.benchmarkObservation, `${label}.benchmarkObservation`);
      exactKeys(benchmark, [
        "subject", "benchmarkProtocolId", "benchmarkProtocolVersion", "outcome", "measurement",
        "assistance", "range", "perceivedExertion",
      ], `${label}.benchmarkObservation`);
      validateSubject(benchmark.subject, `${label}.benchmarkObservation.subject`);
      stableId(benchmark.benchmarkProtocolId, `${label}.benchmarkObservation.benchmarkProtocolId`);
      positiveInteger(benchmark.benchmarkProtocolVersion, `${label}.benchmarkObservation.benchmarkProtocolVersion`);
      oneOf(benchmark.outcome, new Set(["clean", "partial", "not-yet", "symptom"]), `${label}.benchmarkObservation.outcome`);
      if (benchmark.measurement !== undefined) validateMeasurement(benchmark.measurement, `${label}.benchmarkObservation.measurement`);
      if (benchmark.assistance !== undefined) nonEmptyString(benchmark.assistance, `${label}.benchmarkObservation.assistance`);
      if (benchmark.range !== undefined) nonEmptyString(benchmark.range, `${label}.benchmarkObservation.range`);
      if (benchmark.perceivedExertion !== undefined && (
        typeof benchmark.perceivedExertion !== "number" || !Number.isFinite(benchmark.perceivedExertion)
        || benchmark.perceivedExertion < 1 || benchmark.perceivedExertion > 10
      )) fail(`${label}.benchmarkObservation.perceivedExertion must be from 1 to 10.`);
    }
    if (item.review !== undefined) {
      const review = object(item.review, `${label}.review`);
      exactKeys(review, ["outcome", "difficulty", "symptomOrInstability"], `${label}.review`);
      oneOf(review.outcome, new Set(["clean", "partial", "not-today"]), `${label}.review.outcome`);
      if (item.status === "skipped" && review.outcome !== "not-today") fail(`${label} skipped work cannot claim performance.`);
      if (review.difficulty !== undefined) oneOf(review.difficulty, new Set(["easy", "right", "hard"]), `${label}.review.difficulty`);
      if (review.symptomOrInstability !== undefined && typeof review.symptomOrInstability !== "boolean") {
        fail(`${label}.review.symptomOrInstability must be Boolean.`);
      }
    }
  }
};

const result = (validate) => {
  try {
    validate();
    return null;
  } catch (error) {
    if (error instanceof ValidationFailure) return error.message;
    throw error;
  }
};

export const validateShadowSessionPlan = (payload, itemId, profileId) =>
  result(() => validatePlanInternal(payload, itemId, profileId));

export const validateShadowSessionRecord = (payload, itemId, profileId) =>
  result(() => validateRecordInternal(payload, itemId, profileId));

export const validateShadowEvidenceEvent = (payload, itemId, profileId) =>
  result(() => validateEvidenceInternal(payload, itemId, profileId));

export const validateShadowAthleteIntent = (payload, profileId) =>
  result(() => validateIntentInternal(payload, profileId));

export const validateShadowSessionPair = (planPayload, recordPayload, profileId) => result(() => {
  validatePlanInternal(planPayload, planPayload?.id, profileId);
  validateRecordInternal(recordPayload, recordPayload?.id, profileId);
  if (planPayload.id !== recordPayload.planId || planPayload.athleteId !== recordPayload.athleteId) {
    fail("Session Record does not reference its same-athlete Session Plan.");
  }
  const planItemIds = new Set(planPayload.items.map((item) => item.id));
  const missing = recordPayload.itemOutcomes.find((item) => !planItemIds.has(item.planItemId));
  if (missing) fail(`Session Record references unknown plan item ${missing.planItemId}.`);
  const planLegacy = planPayload.legacySource;
  const recordLegacy = recordPayload.legacySource;
  if ((planLegacy === undefined) !== (recordLegacy === undefined)
    || (planLegacy && (planLegacy.sourceVersion !== recordLegacy.sourceVersion
      || planLegacy.sourceSessionId !== recordLegacy.sourceSessionId))) {
    fail("Session Plan and Session Record legacy provenance do not match.");
  }
});
