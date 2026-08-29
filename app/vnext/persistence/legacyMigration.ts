import {
  DOMAIN_SCHEMA_VERSION,
  isStableId,
  parseDefinitionVersion,
  parseStableId,
  type AthleteEvidenceEvent,
  type AthleteId,
  type AthleteIntent,
  type BenchmarkSubject,
  type DefinitionBundle,
  type DefinitionReference,
  type ExerciseDefinition,
  type IsoTimestamp,
  type LegacyClaimImportedEvent,
  type LegacySparseSessionSource,
  type PerformanceObservedEvent,
  type SessionItemOutcome,
  type SessionPlan,
  type SessionPlanItem,
  type SessionRecord,
} from "../contracts";
import { vNextDefinitionBundleV1 } from "../definitions";
import {
  captureLegacyV12CompatibilitySnapshot,
  type LegacyV12ProfileSource,
  type LegacyV12SessionSource,
} from "../legacyV12";
import {
  assertValid,
  validateAthleteEvidenceEvent,
  validateAthleteIntent,
  validateDefinitionBundle,
  validateLegacyV12CompatibilitySnapshot,
  validateSessionPlan,
  validateSessionRecord,
} from "../validation";
import { canonicalJson, sha256 } from "./canonical";
import {
  LEGACY_V12_CONVERTER_VERSION,
  VNEXT_PERSISTENCE_SCHEMA_VERSION,
  type LegacyConversion,
  type LegacyMigrationSnapshot,
  type MigrationRun,
  type PersistedEntityRef,
  type TrainingResetTombstone,
} from "./contracts";

const LEGACY_POLICY_ID = parseStableId("policy", "legacy-v12-converter");
const LEGACY_POLICY_VERSION = parseDefinitionVersion(1);
const LEGACY_REASON = parseStableId("reason", "legacy-v12-reconstructed");

const ASSESSMENT_ANCHORS = {
  hollow: ["hollow-tuck", "long-lever-hollow-hold"],
  "anti-rotation": ["side-plank", "high-plank-bird-dog"],
  "pelvic-control": ["reverse-crunch", "straight-leg-raise"],
  compression: ["single-leg-compression", "straight-compression"],
  support: ["support-hold", "tuck-support"],
  "support-transition": ["support-to-tuck-transition", "tuck-to-one-leg-lsit-transition"],
  "handstand-line": ["wall-l", "chest-wall-line"],
  "handstand-entry": ["standing-kickup-line-rehearsal", "wall-kickup"],
  "handstand-balance": ["wall-facing-handstand-weight-shift", "heel-pullaway"],
  "handstand-exit": ["grounded-side-exit-rehearsal", "wall-handstand-side-exit"],
  lsit: ["one-foot-assisted-lsit", "alternating-lsit-extension"],
  pushing: ["floor-push-up", "controlled-parallette-pushup"],
  overhead: ["shallow-range-pike-pushup", "parallette-pike-pushup"],
  planche: ["parallette-forward-lean-hold", "planche-lean-scapular-pulse"],
} as const satisfies Readonly<Record<string, readonly [string, string]>>;

type AssessmentAnswer = "clean" | "almost" | "not-yet";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isIsoTimestamp = (value: unknown): value is IsoTimestamp => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const afterReset = (occurredAt: IsoTimestamp, resetAt: IsoTimestamp | undefined): boolean =>
  resetAt === undefined || Date.parse(occurredAt) > Date.parse(resetAt);

const cloneJson = <Value>(value: Value): Value => JSON.parse(canonicalJson(value)) as Value;

/**
 * Capture only the v1.2 authority surface. Runtime ProfileRecord instances also
 * carry device/transport fields such as pendingSync and lastSyncedAt; including
 * those fields would give the same legacy facts different migration identities
 * on different devices.
 */
const canonicalLegacySourceProfile = (
  profile: LegacyV12ProfileSource,
): LegacyV12ProfileSource => cloneJson({
  profileId: profile.profileId,
  username: profile.username,
  schemaVersion: profile.schemaVersion,
  revision: profile.revision,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
  ...(profile.progressResetAt !== undefined ? { progressResetAt: profile.progressResetAt } : {}),
  nextProgramDay: profile.nextProgramDay,
  history: profile.history,
  readiness: profile.readiness,
  readinessUpdatedAt: profile.readinessUpdatedAt,
  progression: profile.progression,
  equipment: profile.equipment,
  preferences: profile.preferences,
});

const stableId = async <Kind extends Parameters<typeof parseStableId>[0]>(
  kind: Kind,
  namespace: string,
  sourceIdentity: string,
) => parseStableId(kind, `${namespace}-${await sha256({
  converterVersion: LEGACY_V12_CONVERTER_VERSION,
  sourceIdentity,
})}`);

const snapshotIdFor = async (
  athleteId: AthleteId,
  sourceFingerprint: string,
) => stableId(
  "event",
  "legacy-v12-snapshot",
  `${athleteId}\u0000${sourceFingerprint}`,
);

const orderedUnique = (...groups: readonly (readonly string[] | undefined)[]): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const group of groups) {
    for (const value of group ?? []) {
      if (seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
};

const subjectKey = (subject: BenchmarkSubject): string => canonicalJson(subject);

const uniqueProtocolSubject = (
  bundle: DefinitionBundle,
  exerciseId: string,
): BenchmarkSubject | undefined => {
  const subjects = new Map<string, BenchmarkSubject>();
  for (const protocol of bundle.benchmarkProtocols) {
    if (protocol.exerciseId !== exerciseId) continue;
    subjects.set(subjectKey(protocol.subject), protocol.subject);
  }
  return subjects.size === 1 ? [...subjects.values()][0] : undefined;
};

const uniqueMilestoneSubject = (
  bundle: DefinitionBundle,
  exerciseId: string,
): Extract<BenchmarkSubject, { kind: "milestone" }> | undefined => {
  const subjects = new Map<string, Extract<BenchmarkSubject, { kind: "milestone" }>>();
  for (const protocol of bundle.benchmarkProtocols) {
    if (protocol.exerciseId !== exerciseId || protocol.subject.kind !== "milestone") continue;
    subjects.set(subjectKey(protocol.subject), protocol.subject);
  }
  return subjects.size === 1 ? [...subjects.values()][0] : undefined;
};

const assessmentOutcome = (answer: AssessmentAnswer): PerformanceObservedEvent["outcome"] =>
  answer === "clean" ? "clean" : answer === "almost" ? "partial" : "not-yet";

const sessionReview = (
  review: NonNullable<LegacyV12SessionSource["exerciseReviews"]>[string],
): NonNullable<SessionItemOutcome["review"]> => {
  if (review.achieved === true && review.feedback === "easy") {
    return { outcome: "clean", difficulty: "easy" };
  }
  if (review.achieved !== true || review.feedback === "hard") {
    return { outcome: "not-today", difficulty: review.feedback };
  }
  return { outcome: "partial", difficulty: review.feedback };
};

const legacySessionSource = (session: LegacyV12SessionSource): LegacySparseSessionSource => ({
  kind: "legacy-v1.2-sparse",
  sourceVersion: "1.2",
  sourceSessionId: session.id,
  timingPrecision: "session-total-only",
  prescriptionPrecision: "catalogue-default-reconstruction",
  ...(session.seconds !== undefined ? { sourceTotalSeconds: session.seconds } : {}),
  ...(session.day !== undefined ? { sourceDay: session.day } : {}),
  ...(session.level !== undefined ? { sourceLevel: session.level } : {}),
  ...(session.mode !== undefined ? { sourceMode: session.mode } : {}),
});

const normalEvidenceMode = (session: LegacyV12SessionSource): boolean =>
  session.mode === undefined || session.mode === "normal";

/**
 * v1.2 aggregate claims do not always retain their own occurrence time. Using
 * the profile's mutable updatedAt would make an unrelated later save fabricate
 * a fresh observation. The stable creation boundary is deliberately
 * conservative: these imports remain weak and old rather than gaining recency
 * that the source cannot support.
 */
const untimestampedLegacyBoundary = (profile: LegacyV12ProfileSource): IsoTimestamp =>
  profile.createdAt;

const demandFromLegacyPreferences = (profile: LegacyV12ProfileSource): AthleteIntent["defaultSessionDemand"] => {
  const preferences = isRecord(profile.preferences) ? profile.preferences : {};
  const appState = isRecord(preferences.appState) ? preferences.appState : undefined;
  const levelsByDay = appState && isRecord(appState.levelsByDay) ? appState.levelsByDay : undefined;
  const currentLevel = levelsByDay?.[String(profile.nextProgramDay)];
  const assessment = isRecord(preferences.startingAssessment) ? preferences.startingAssessment : undefined;
  const suggestedLevel = assessment?.suggestedLevel;
  const level = typeof currentLevel === "string" ? currentLevel
    : typeof suggestedLevel === "string" ? suggestedLevel
      : "L1";
  return level === "L3" ? "challenge" : level === "L2" ? "standard" : "technique";
};

const eventBase = (
  id: Awaited<ReturnType<typeof stableId<"event">>>,
  athleteId: AthleteId,
  occurredAt: IsoTimestamp,
  catalogueVersion: DefinitionBundle["catalogueVersion"],
) => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id,
  athleteId,
  occurredAt,
  // v1.2 retained no independent event-recording timestamp. Using the source
  // profile's later updatedAt would mutate old immutable event payloads every
  // time an unrelated profile field changed, so the only owned time is reused.
  recordedAt: occurredAt,
  source: "migration" as const,
  catalogueVersion,
});

const warningCollector = () => {
  const values = new Set<string>();
  return {
    add: (message: string) => values.add(message),
    sorted: () => [...values].sort(compareCodeUnits),
  };
};

const assertValidConversion = async (conversion: LegacyConversion): Promise<void> => {
  if (!await verifyLegacyMigrationSnapshot(conversion.snapshot)) {
    throw new Error("Legacy migration snapshot failed its fingerprint or identity check");
  }
  assertValid("converted Athlete Intent", validateAthleteIntent(conversion.intent));
  conversion.evidenceEvents.forEach((event, index) =>
    assertValid(`converted Evidence Event ${index}`, validateAthleteEvidenceEvent(event)));
  conversion.sessionPlans.forEach((plan, index) =>
    assertValid(`converted Session Plan ${index}`, validateSessionPlan(plan)));
  conversion.sessionRecords.forEach((record, index) =>
    assertValid(`converted Session Record ${index}`, validateSessionRecord(record)));

  const planIds = new Set(conversion.sessionPlans.map((plan) => plan.id));
  const entityKeys = new Set<string>();
  for (const reference of conversion.run.generatedEntities) {
    const key = `${reference.kind}:${reference.id}`;
    if (entityKeys.has(key)) throw new Error(`Migration run contains duplicate generated entity ${key}`);
    entityKeys.add(key);
  }
  for (const record of conversion.sessionRecords) {
    if (!planIds.has(record.planId)) throw new Error(`Converted Session Record ${record.id} has no converted Session Plan`);
  }
};

export const captureLegacyMigrationSnapshot = async (
  profile: LegacyV12ProfileSource,
  capturedAt: IsoTimestamp,
): Promise<LegacyMigrationSnapshot> => {
  if (!isIsoTimestamp(capturedAt)) throw new Error("Legacy snapshot capturedAt must be an ISO-8601 UTC timestamp");
  const detached = canonicalLegacySourceProfile(profile);
  const compatibility = captureLegacyV12CompatibilitySnapshot(detached);
  assertValid("legacy v1.2 source", validateLegacyV12CompatibilitySnapshot(compatibility));
  if (!isStableId(detached.profileId)) throw new Error(`Legacy profile ID is not a valid vNext athlete ID: ${detached.profileId}`);
  if (Date.parse(detached.updatedAt) < Date.parse(detached.createdAt)) {
    throw new Error("Legacy profile updatedAt cannot predate createdAt");
  }
  if (detached.progressResetAt && Date.parse(detached.progressResetAt) > Date.parse(detached.updatedAt)) {
    throw new Error("Legacy progressResetAt cannot be later than the source profile's updatedAt timestamp");
  }
  if (Date.parse(capturedAt) < Date.parse(detached.updatedAt)) {
    throw new Error("Legacy snapshot cannot be captured before the source profile's updatedAt timestamp");
  }
  const athleteId = parseStableId("athlete", detached.profileId);
  const sourceFingerprint = await sha256(detached);
  const id = await snapshotIdFor(athleteId, sourceFingerprint);
  return {
    schemaVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
    id,
    athleteId,
    converterVersion: LEGACY_V12_CONVERTER_VERSION,
    sourceVersion: "1.2",
    sourceFingerprint,
    // The persisted boundary is source-owned and therefore byte-stable across
    // devices. The caller timestamp above proves only that this source version
    // had already existed when it was captured.
    capturedAt: detached.updatedAt,
    ...(detached.progressResetAt ? { resetAt: detached.progressResetAt } : {}),
    sourceProfile: detached,
  };
};

export const verifyLegacyMigrationSnapshot = async (
  snapshot: LegacyMigrationSnapshot,
): Promise<boolean> => {
  try {
    if (
      snapshot.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION
      || snapshot.converterVersion !== LEGACY_V12_CONVERTER_VERSION
      || snapshot.sourceVersion !== "1.2"
      || !isIsoTimestamp(snapshot.capturedAt)
      || !isStableId(snapshot.athleteId)
      || snapshot.athleteId !== snapshot.sourceProfile.profileId
      || snapshot.resetAt !== snapshot.sourceProfile.progressResetAt
      || snapshot.capturedAt !== snapshot.sourceProfile.updatedAt
      || Date.parse(snapshot.sourceProfile.updatedAt) < Date.parse(snapshot.sourceProfile.createdAt)
      || (snapshot.resetAt !== undefined
        && Date.parse(snapshot.resetAt) > Date.parse(snapshot.sourceProfile.updatedAt))
    ) return false;
    const canonicalSource = canonicalLegacySourceProfile(snapshot.sourceProfile);
    if (canonicalJson(canonicalSource) !== canonicalJson(snapshot.sourceProfile)) return false;
    const compatibility = captureLegacyV12CompatibilitySnapshot(snapshot.sourceProfile);
    if (!validateLegacyV12CompatibilitySnapshot(compatibility).valid) return false;
    const sourceFingerprint = await sha256(snapshot.sourceProfile);
    if (sourceFingerprint !== snapshot.sourceFingerprint) return false;
    const expectedId = await snapshotIdFor(snapshot.athleteId, sourceFingerprint);
    return expectedId === snapshot.id;
  } catch {
    return false;
  }
};

export const recoverLegacyMigrationSnapshot = async (
  snapshot: LegacyMigrationSnapshot,
): Promise<LegacyV12ProfileSource> => {
  if (!await verifyLegacyMigrationSnapshot(snapshot)) {
    throw new Error("Legacy migration snapshot is corrupt or does not match its source identity");
  }
  return cloneJson(snapshot.sourceProfile);
};

type ConvertedSession = Readonly<{
  plan?: SessionPlan;
  record?: SessionRecord;
  warnings: readonly string[];
}>;

const convertSession = async (
  session: LegacyV12SessionSource,
  athleteId: AthleteId,
  bundle: DefinitionBundle,
): Promise<ConvertedSession> => {
  const warnings = warningCollector();
  const exerciseById = new Map<string, ExerciseDefinition>(
    bundle.exercises.map((exercise) => [exercise.id, exercise] as const),
  );
  const reviewIds = Object.keys(session.exerciseReviews ?? {});
  const explicitlyCompleted = new Set(session.completedExerciseIds ?? []);
  const explicitlySkipped = new Set(session.skippedExerciseIds ?? []);
  const participatedIds = new Set(
    orderedUnique(session.exerciseIds, session.completedExerciseIds, reviewIds)
      .filter((id) => explicitlyCompleted.has(id) || !explicitlySkipped.has(id)),
  );
  const orderedIds = orderedUnique(
    session.exerciseIds,
    session.completedExerciseIds,
    reviewIds,
    session.skippedExerciseIds,
  );
  const usable: ExerciseDefinition[] = [];
  for (const id of orderedIds) {
    if (explicitlyCompleted.has(id) && explicitlySkipped.has(id)) {
      warnings.add(`Session ${session.id}: exercise ${id} was both completed and skipped; completed participation was retained`);
    }
    const exercise = exerciseById.get(id);
    if (!exercise) {
      warnings.add(`Session ${session.id}: retained unknown exercise ${id} only in the recovery snapshot`);
      continue;
    }
    if (!exercise.prescriptionVariants[0]) {
      warnings.add(`Session ${session.id}: exercise ${id} has no reconstructable prescription and was not projected`);
      continue;
    }
    usable.push(exercise);
  }
  if (!usable.length) {
    warnings.add(`Session ${session.id}: no usable exercise facts; no vNext Session Record was reconstructed`);
    return { warnings: warnings.sorted() };
  }

  const planId = await stableId("session-plan", "legacy-v12-plan", `${athleteId}\u0000${session.id}`);
  const recordId = await stableId("session-record", "legacy-v12-record", `${athleteId}\u0000${session.id}`);
  const legacySource = legacySessionSource(session);
  const planItems = await Promise.all(usable.map(async (exercise, index): Promise<SessionPlanItem> => {
    const sourceReview = session.exerciseReviews?.[exercise.id];
    const evidenceAllowed = normalEvidenceMode(session) && sourceReview !== undefined;
    const milestone = evidenceAllowed ? uniqueMilestoneSubject(bundle, exercise.id) : undefined;
    const prescription = exercise.prescriptionVariants[0]!;
    return {
      id: await stableId(
        "plan-item",
        "legacy-v12-item",
        `${athleteId}\u0000${session.id}\u0000${index}\u0000${exercise.id}`,
      ),
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: prescription.id,
      purpose: session.mode === "practice" ? "recovery" : evidenceAllowed ? "primary-development" : "preparation",
      plannedSeconds: 0,
      ...(milestone ? { targetMilestone: milestone.milestone } : {}),
      demand: prescription.demand,
    };
  }));

  const references = new Map<string, DefinitionReference>();
  references.set(`policy:${LEGACY_POLICY_ID}`, { kind: "policy", id: LEGACY_POLICY_ID, version: LEGACY_POLICY_VERSION });
  for (let index = 0; index < usable.length; index += 1) {
    const exercise = usable[index]!;
    const item = planItems[index]!;
    references.set(`exercise:${exercise.id}`, {
      kind: "exercise",
      id: exercise.id,
      version: exercise.definitionVersion,
    });
    if (item.targetMilestone) {
      references.set(`graph:${item.targetMilestone.graphId}`, {
        kind: "graph",
        id: item.targetMilestone.graphId,
        version: bundle.graphs.find((graph) => graph.id === item.targetMilestone!.graphId)?.definitionVersion
          ?? bundle.catalogueVersion,
      });
    }
  }

  const plan: SessionPlan = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: planId,
    athleteId,
    createdAt: session.completedAt,
    catalogueVersion: bundle.catalogueVersion,
    generatorPolicyId: LEGACY_POLICY_ID,
    generatorPolicyVersion: LEGACY_POLICY_VERSION,
    definitionReferences: [...references.values()].sort((left, right) =>
      compareCodeUnits(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`)),
    intendedDurationSeconds: session.seconds ?? 0,
    items: planItems,
    legacySource,
    rationale: [{
      code: LEGACY_REASON,
      message: "Reconstructed from sparse v1.2 history; exact item timing and prescription were not retained.",
    }],
  };

  const itemOutcomes = usable.map((exercise, index): SessionItemOutcome => {
    const planItem = planItems[index]!;
    const participated = participatedIds.has(exercise.id);
    const sourceReview = session.exerciseReviews?.[exercise.id];
    const review = participated && normalEvidenceMode(session) && sourceReview
      ? sessionReview(sourceReview)
      : undefined;
    if (!participated) return { planItemId: planItem.id, status: "skipped", participationSeconds: 0 };
    return {
      planItemId: planItem.id,
      status: "modified",
      participationSeconds: 0,
      participationBasis: "legacy-unknown",
      modificationReason: "Legacy v1.2 retained participation but not exact item timing or prescription.",
      ...(review ? { review } : {}),
    };
  });

  if (session.status === undefined) {
    warnings.add(`Session ${session.id}: missing legacy status was conservatively reconstructed as partial`);
  }
  const record: SessionRecord = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: recordId,
    athleteId,
    planId,
    startedAt: session.completedAt,
    completedAt: session.completedAt,
    // v1.2 retained only completedAt for a session. Keeping that same boundary
    // makes an unchanged historical record byte-stable across later profiles.
    recordedAt: session.completedAt,
    status: session.status ?? "partial",
    itemOutcomes,
    legacySource,
  };
  return { plan, record, warnings: warnings.sorted() };
};

const convertAssessment = async (
  profile: LegacyV12ProfileSource,
  athleteId: AthleteId,
  bundle: DefinitionBundle,
  warnings: ReturnType<typeof warningCollector>,
): Promise<readonly AthleteEvidenceEvent[]> => {
  const assessment = isRecord(profile.preferences.startingAssessment)
    ? profile.preferences.startingAssessment
    : undefined;
  if (!assessment || !isRecord(assessment.answers)) return [];
  const changedAt = isIsoTimestamp(assessment.updatedAt) ? assessment.updatedAt : undefined;
  if (!changedAt && profile.progressResetAt) {
    warnings.add("Starting assessment has no reliable timestamp after reset; its answers remain only in the recovery snapshot");
    return [];
  }
  const occurredAt = changedAt ?? untimestampedLegacyBoundary(profile);
  if (!changedAt) warnings.add("Starting assessment used the conservative profile creation boundary because v1.2 stored no assessment timestamp");
  if (!afterReset(occurredAt, profile.progressResetAt)) return [];

  const events: AthleteEvidenceEvent[] = [];
  for (const [answerKey, rawAnswer] of Object.entries(assessment.answers).sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (rawAnswer !== "clean" && rawAnswer !== "almost" && rawAnswer !== "not-yet") {
      warnings.add(`Assessment answer ${answerKey}: unsupported value remains only in the recovery snapshot`);
      continue;
    }
    const [trackId, rawIndex, ...remainder] = answerKey.split(":");
    const anchorIndex = rawIndex === "0" ? 0 : rawIndex === "1" ? 1 : undefined;
    const anchors = ASSESSMENT_ANCHORS[trackId as keyof typeof ASSESSMENT_ANCHORS];
    if (!answerKey.trim()) {
      warnings.add("An assessment answer with an empty key remains only in the recovery snapshot");
      continue;
    }
    const anchorExerciseId = anchors && anchorIndex !== undefined && remainder.length === 0
      ? anchors[anchorIndex]
      : undefined;
    const subject = anchorExerciseId ? uniqueProtocolSubject(bundle, anchorExerciseId) : undefined;
    // Assessment answers are mutable legacy placement hints. Preserve an
    // unchanged source occurrence, but append a new weak observation when its
    // source-owned time or answer genuinely changes.
    const id = await stableId(
      "event",
      "legacy-v12-assessment",
      `${athleteId}\u0000${answerKey}\u0000${occurredAt}\u0000${rawAnswer}`,
    );
    if (subject) {
      events.push({
        ...eventBase(id, athleteId, occurredAt, bundle.catalogueVersion),
        type: "performance_observed",
        subject,
        outcome: assessmentOutcome(rawAnswer),
        legacySourceVersion: "1.2",
        legacySourceReference: `preferences.startingAssessment.answers.${answerKey}`,
      });
    } else {
      const event: LegacyClaimImportedEvent = {
        ...eventBase(id, athleteId, occurredAt, bundle.catalogueVersion),
        type: "legacy_claim_imported",
        sourceVersion: "1.2",
        claim: {
          kind: "assessment-answer",
          legacyTrackId: trackId?.trim() || "unmapped-track",
          legacyAnchorExerciseId: anchorExerciseId ?? `unmapped:${answerKey}`,
          answer: rawAnswer,
        },
      };
      events.push(event);
      warnings.add(`Assessment answer ${answerKey}: no safe unique vNext subject, so it remains a weak generic legacy claim`);
    }
  }
  return events;
};

export const convertLegacyV12Profile = async (
  profile: LegacyV12ProfileSource,
  capturedAt: IsoTimestamp,
  bundle: DefinitionBundle = vNextDefinitionBundleV1,
): Promise<LegacyConversion> => {
  assertValid("vNext definition bundle", validateDefinitionBundle(bundle));
  const snapshot = await captureLegacyMigrationSnapshot(profile, capturedAt);
  const athleteId = snapshot.athleteId;
  const sourceProfile = snapshot.sourceProfile;
  const warnings = warningCollector();
  const resetAt = sourceProfile.progressResetAt;

  const sessionsById = new Map<string, LegacyV12SessionSource>();
  for (const session of sourceProfile.history) {
    const existing = sessionsById.get(session.id);
    if (existing && canonicalJson(existing) !== canonicalJson(session)) {
      throw new Error(`Legacy session ${session.id} has conflicting immutable payloads`);
    }
    if (!existing) sessionsById.set(session.id, session);
  }
  const sourceSessions = [...sessionsById.values()]
    .filter((session) => afterReset(session.completedAt, resetAt))
    .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt)
      || compareCodeUnits(left.id, right.id));
  if (resetAt && sourceSessions.length !== sessionsById.size) {
    warnings.add(`${sessionsById.size - sourceSessions.length} legacy session(s) at or before progressResetAt were not converted`);
  }

  const convertedSessions = await Promise.all(sourceSessions.map((session) =>
    convertSession(session, athleteId, bundle)));
  const sessionPlans = convertedSessions.flatMap((result) => result.plan ? [result.plan] : []);
  const sessionRecords = convertedSessions.flatMap((result) => result.record ? [result.record] : []);
  convertedSessions.flatMap((result) => result.warnings).forEach(warnings.add);

  const evidenceEvents: AthleteEvidenceEvent[] = [];
  for (const [gateId, claimed] of Object.entries(sourceProfile.readiness).sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (claimed !== true) continue;
    if (!gateId.trim()) {
      warnings.add("A readiness claim with an empty gate ID remains only in the recovery snapshot");
      continue;
    }
    const explicitTimestamp = sourceProfile.readinessUpdatedAt[gateId];
    if (!isIsoTimestamp(explicitTimestamp)) {
      if (resetAt) {
        warnings.add(`Readiness ${gateId}: missing post-reset timestamp, so the old claim was not converted`);
        continue;
      }
      warnings.add(`Readiness ${gateId}: used the conservative profile creation boundary because v1.2 stored no claim timestamp`);
    }
    const occurredAt = isIsoTimestamp(explicitTimestamp)
      ? explicitTimestamp
      : untimestampedLegacyBoundary(sourceProfile);
    if (!afterReset(occurredAt, resetAt)) continue;
    const id = await stableId(
      "event",
      "legacy-v12-readiness",
      `${athleteId}\u0000${gateId}\u0000${occurredAt}\u0000true`,
    );
    evidenceEvents.push({
      ...eventBase(id, athleteId, occurredAt, bundle.catalogueVersion),
      type: "legacy_claim_imported",
      sourceVersion: "1.2",
      claim: { kind: "readiness-gate", legacyGateId: gateId, claimed: true },
    });
  }

  evidenceEvents.push(...await convertAssessment(sourceProfile, athleteId, bundle, warnings));

  const backedClean = new Map<string, number>();
  const backedReview = new Set<string>();
  const plansById = new Map(sessionPlans.map((plan) => [plan.id, plan] as const));
  for (const record of sessionRecords) {
    const plan = plansById.get(record.planId);
    if (!plan) continue;
    const planItemsById = new Map(plan.items.map((item) => [item.id, item] as const));
    for (const outcome of record.itemOutcomes) {
      if (!outcome.review) continue;
      const item = planItemsById.get(outcome.planItemId);
      if (!item) continue;
      backedReview.add(item.exerciseId);
      if (outcome.review.outcome === "clean" && outcome.review.difficulty === "easy") {
        backedClean.set(item.exerciseId, (backedClean.get(item.exerciseId) ?? 0) + 1);
      }
    }
  }
  if (resetAt && Object.keys(sourceProfile.progression).length) {
    warnings.add("Untimestamped v1.2 progression counters were not converted after progressResetAt");
  }
  if (!resetAt) {
    for (const [exerciseId, hint] of Object.entries(sourceProfile.progression).sort(([left], [right]) => compareCodeUnits(left, right))) {
      if (!exerciseId.trim()) {
        warnings.add("A progression hint with an empty exercise ID remains only in the recovery snapshot");
        continue;
      }
      const boundedCount = Math.min(2, hint.cleanSessions);
      if (hint.cleanSessions > 2) warnings.add(`Progression ${exerciseId}: cleanSessions above the v1.2 cap was conservatively limited to 2`);
      const residualCount = Math.max(0, boundedCount - Math.min(2, backedClean.get(exerciseId) ?? 0));
      const lastFeedback = backedReview.has(exerciseId) ? undefined : hint.lastFeedback;
      if (residualCount === 0 && lastFeedback === undefined) continue;
      const claimIdentity = canonicalJson({
        occurredAt: untimestampedLegacyBoundary(sourceProfile),
        cleanSessions: residualCount,
        ...(lastFeedback ? { lastFeedback } : {}),
      });
      const id = await stableId(
        "event",
        "legacy-v12-progression",
        `${athleteId}\u0000${exerciseId}\u0000${claimIdentity}`,
      );
      evidenceEvents.push({
        ...eventBase(id, athleteId, untimestampedLegacyBoundary(sourceProfile), bundle.catalogueVersion),
        type: "legacy_claim_imported",
        sourceVersion: "1.2",
        claim: {
          kind: "progression-hint",
          legacyExerciseId: exerciseId,
          cleanSessions: residualCount,
          ...(lastFeedback ? { lastFeedback } : {}),
        },
      });
    }
  }

  evidenceEvents.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || compareCodeUnits(left.id, right.id));
  sessionPlans.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
    || compareCodeUnits(left.id, right.id));
  sessionRecords.sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt)
    || compareCodeUnits(left.id, right.id));

  const knownEquipment = new Set<string>(bundle.exercises.flatMap((exercise) => exercise.equipment));
  const equipment = [...new Set(sourceProfile.equipment.filter((id) => isStableId(id) && knownEquipment.has(id)))]
    .sort(compareCodeUnits)
    .map((id) => parseStableId("equipment", id));
  if (equipment.length !== new Set(sourceProfile.equipment).size) {
    warnings.add("Invalid or duplicate legacy equipment identifiers remain only in the recovery snapshot");
  }
  const intent: AthleteIntent = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    athleteId,
    updatedAt: sourceProfile.updatedAt,
    goals: [],
    equipment,
    defaultSessionDemand: demandFromLegacyPreferences(sourceProfile),
    preferences: { specialistOptIn: false },
  };

  const resetTombstone: TrainingResetTombstone | undefined = resetAt ? {
    schemaVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
    id: await stableId("event", "legacy-v12-reset", `${athleteId}\u0000${resetAt}`),
    athleteId,
    resetAt,
    // v1.2 retained only the reset cutoff, so do not let unrelated later
    // profile writes mutate the immutable audit payload for that same reset.
    recordedAt: resetAt,
    source: "legacy-v1.2",
  } : undefined;

  const generatedEntities: PersistedEntityRef[] = [
    ...evidenceEvents.map((event) => ({ kind: "evidence-event" as const, id: event.id })),
    ...sessionPlans.map((plan) => ({ kind: "session-plan" as const, id: plan.id })),
    ...sessionRecords.map((record) => ({ kind: "session-record" as const, id: record.id })),
  ].sort((left, right) => compareCodeUnits(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`));
  const runId = await stableId(
    "event",
    "legacy-v12-run",
    `${athleteId}\u0000${snapshot.sourceFingerprint}`,
  );
  const run: MigrationRun = {
    schemaVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
    id: runId,
    athleteId,
    converterVersion: LEGACY_V12_CONVERTER_VERSION,
    sourceVersion: "1.2",
    snapshotId: snapshot.id,
    sourceFingerprint: snapshot.sourceFingerprint,
    createdAt: snapshot.capturedAt,
    status: "active",
    generatedEntities,
    warnings: warnings.sorted(),
  };
  const conversion: LegacyConversion = {
    snapshot,
    run,
    ...(resetTombstone ? { resetTombstone } : {}),
    intent,
    evidenceEvents,
    sessionPlans,
    sessionRecords,
  };
  await assertValidConversion(conversion);
  return conversion;
};
