import {
  validateShadowAthleteIntent,
  validateShadowEvidenceEvent,
  validateShadowSessionPair,
  validateShadowSessionPlan,
  validateShadowSessionRecord,
} from "./vnext-session-validation.js";

const SCHEMA_VERSION = 1;
// Keep the upload side comfortably inside the Workers Free 50-subrequest
// budget even for validation-heavy migration pages. Delta reads have their
// own independent item and byte bounds.
const MAX_UPLOAD_ITEMS = 8;
const MAX_DELTA_ITEMS = 200;
const MAX_SYNC_ITEM_BYTES = 1_150_000;
const MAX_DELTA_RESPONSE_BYTES = 1_250_000;
const MAX_ID_LENGTH = 180;
const ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const KINDS = new Set([
  "evidence-event",
  "session-plan",
  "session-record",
  "athlete-intent",
  "reset-tombstone",
  "legacy-snapshot",
  "migration-run",
]);
const IMMUTABLE_KINDS = new Set(["evidence-event", "session-plan", "session-record", "legacy-snapshot"]);
const EVENT_TYPES = new Set([
  "performance_observed",
  "restriction_reported",
  "restriction_cleared",
  "legacy_claim_imported",
  "evidence_corrected",
]);
const RECORD_STATUSES = new Set(["complete", "modified", "partial", "abandoned"]);
const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "authorization", "password", "passwordhash", "passwordsalt", "recoverycode", "recoveryhash",
  "token", "tokenhash", "accesstoken", "refreshtoken", "sessiontoken", "authtoken", "bearertoken",
  "apikey", "apisecret", "clientsecret", "privatekey", "secretkey", "cookie", "setcookie",
]);

class RequestProblem extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const problem = (status, code, message) => { throw new RequestProblem(status, code, message); };
const object = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    problem(400, "vnext-invalid-envelope", `${label} must be an object.`);
  }
  return value;
};
const stableId = (value, label) => {
  if (typeof value !== "string" || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    problem(400, "vnext-invalid-id", `${label} is not a valid stable ID.`);
  }
  return value;
};
const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) problem(400, "vnext-invalid-version", `${label} must be a positive integer.`);
  return value;
};
const nonNegativeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) problem(400, "vnext-invalid-number", `${label} must be a non-negative integer.`);
  return value;
};
const time = (value, label) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    problem(400, "vnext-invalid-timestamp", `${label} must be an exact UTC ISO timestamp.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    problem(400, "vnext-invalid-timestamp", `${label} must be an exact UTC ISO timestamp.`);
  }
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
};
const optionalTime = (value, label) => value === undefined ? null : time(value, label);
const ensureAthlete = (athleteId, profileId, label) => {
  if (athleteId !== profileId) problem(403, "vnext-athlete-ownership", `${label} is not owned by this account.`);
};
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const stableMigrationJson = (payload) => canonicalJson({
  ...payload,
  status: undefined,
  rolledBackAt: undefined,
});
const sha256 = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const parseJson = (value, label) => {
  try { return JSON.parse(value); }
  catch { problem(500, "vnext-corrupt-storage", `${label} contains invalid JSON.`); }
};
const rows = async (statement) => {
  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
};

const exactKeys = (value, allowed, label, code = "vnext-invalid-snapshot") => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problem(400, code, `${label} contains unsupported field ${key}.`);
  }
};
const exactIso = (value, label) => {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    problem(400, "vnext-invalid-snapshot", `${label} must be an exact UTC ISO timestamp.`);
  }
  return milliseconds;
};
const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") {
    problem(400, "vnext-invalid-snapshot", `${label} must be a non-empty string.`);
  }
};
const stringArray = (value, label) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    problem(400, "vnext-invalid-snapshot", `${label} must be an array of non-empty strings.`);
  }
};
const validateLegacySourceProfile = (sourceProfile, profileId) => {
  exactKeys(sourceProfile, new Set([
    "profileId", "username", "schemaVersion", "revision", "createdAt", "updatedAt", "progressResetAt",
    "nextProgramDay", "history", "readiness", "readinessUpdatedAt", "progression", "equipment", "preferences",
  ]), "Legacy source profile");
  if (sourceProfile.profileId !== profileId || sourceProfile.schemaVersion !== 1
    || !Number.isSafeInteger(sourceProfile.revision) || sourceProfile.revision < 0
    || !Number.isSafeInteger(sourceProfile.nextProgramDay) || sourceProfile.nextProgramDay < 1
    || sourceProfile.nextProgramDay > 5) {
    problem(400, "vnext-invalid-snapshot", "Legacy source identity, schema, revision or programme day is invalid.");
  }
  nonEmptyString(sourceProfile.username, "Legacy source username");
  const createdAt = exactIso(sourceProfile.createdAt, "Legacy source createdAt");
  const updatedAt = exactIso(sourceProfile.updatedAt, "Legacy source updatedAt");
  if (updatedAt < createdAt) problem(400, "vnext-invalid-snapshot", "Legacy source updatedAt cannot predate createdAt.");
  if (sourceProfile.progressResetAt !== undefined
    && exactIso(sourceProfile.progressResetAt, "Legacy source progressResetAt") > updatedAt) {
    problem(400, "vnext-invalid-snapshot", "Legacy progressResetAt cannot follow source updatedAt.");
  }
  if (!Array.isArray(sourceProfile.history)) problem(400, "vnext-invalid-snapshot", "Legacy history must be an array.");
  for (const [index, raw] of sourceProfile.history.entries()) {
    const session = object(raw, `Legacy history[${index}]`);
    exactKeys(session, new Set([
      "id", "completedAt", "day", "mode", "status", "seconds", "exerciseIds", "completedExerciseIds",
      "skippedExerciseIds", "skippedBlockIds", "level", "title", "lab", "advancesProgram", "exerciseReviews",
    ]), `Legacy history[${index}]`);
    nonEmptyString(session.id, `Legacy history[${index}].id`);
    exactIso(session.completedAt, `Legacy history[${index}].completedAt`);
    if (session.day !== undefined && (!Number.isSafeInteger(session.day) || session.day < 0 || session.day > 5)) {
      problem(400, "vnext-invalid-snapshot", "Legacy session day is invalid.");
    }
    if (session.mode !== undefined) nonEmptyString(session.mode, "Legacy session mode");
    if (session.status !== undefined && !new Set(["complete", "modified", "partial"]).has(session.status)) {
      problem(400, "vnext-invalid-snapshot", "Legacy session status is invalid.");
    }
    if (session.seconds !== undefined && (!Number.isSafeInteger(session.seconds) || session.seconds < 0)) {
      problem(400, "vnext-invalid-snapshot", "Legacy session seconds are invalid.");
    }
    for (const key of ["exerciseIds", "completedExerciseIds", "skippedExerciseIds", "skippedBlockIds"]) {
      if (session[key] !== undefined) stringArray(session[key], `Legacy session ${key}`);
    }
    if (session.level !== undefined) nonEmptyString(session.level, "Legacy session level");
    if (session.title !== undefined) nonEmptyString(session.title, "Legacy session title");
    if (session.lab !== undefined && typeof session.lab !== "boolean") problem(400, "vnext-invalid-snapshot", "Legacy lab flag is invalid.");
    if (session.advancesProgram !== undefined && typeof session.advancesProgram !== "boolean") {
      problem(400, "vnext-invalid-snapshot", "Legacy advancesProgram flag is invalid.");
    }
    if (session.exerciseReviews !== undefined) {
      const reviews = object(session.exerciseReviews, "Legacy exercise reviews");
      for (const reviewRaw of Object.values(reviews)) {
        const review = object(reviewRaw, "Legacy exercise review");
        exactKeys(review, new Set(["feedback", "achieved"]), "Legacy exercise review");
        if (!new Set(["easy", "right", "hard"]).has(review.feedback) || typeof review.achieved !== "boolean") {
          problem(400, "vnext-invalid-snapshot", "Legacy exercise review is invalid.");
        }
      }
    }
  }
  for (const [label, value, validator] of [
    ["readiness", sourceProfile.readiness, (item) => typeof item === "boolean"],
    ["readinessUpdatedAt", sourceProfile.readinessUpdatedAt, (item) => {
      try { exactIso(item, "Legacy readiness timestamp"); return true; } catch (error) { throw error; }
    }],
  ]) {
    const record = object(value, `Legacy ${label}`);
    for (const item of Object.values(record)) {
      if (!validator(item)) problem(400, "vnext-invalid-snapshot", `Legacy ${label} value is invalid.`);
    }
  }
  const progression = object(sourceProfile.progression, "Legacy progression");
  for (const hintRaw of Object.values(progression)) {
    const hint = object(hintRaw, "Legacy progression hint");
    exactKeys(hint, new Set(["cleanSessions", "lastFeedback"]), "Legacy progression hint");
    if (!Number.isSafeInteger(hint.cleanSessions) || hint.cleanSessions < 0
      || (hint.lastFeedback !== undefined && !new Set(["easy", "right", "hard"]).has(hint.lastFeedback))) {
      problem(400, "vnext-invalid-snapshot", "Legacy progression hint is invalid.");
    }
  }
  stringArray(sourceProfile.equipment, "Legacy equipment");
  object(sourceProfile.preferences, "Legacy preferences");
};

const legacyStableId = async (namespace, athleteId, sourceFingerprint) =>
  `${namespace}-${await sha256({
    converterVersion: 1,
    sourceIdentity: `${athleteId}\u0000${sourceFingerprint}`,
  })}`;

const containsForbiddenSnapshotKey = (value) => {
  if (Array.isArray(value)) return value.some(containsForbiddenSnapshotKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_SNAPSHOT_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/gu, ""))
      || containsForbiddenSnapshotKey(child));
};

const validateGeneratedRefs = (value) => {
  if (!Array.isArray(value)) problem(400, "vnext-invalid-migration-run", "Migration generatedEntities must be an array.");
  const seen = new Set();
  return value.map((raw, index) => {
    const ref = object(raw, `generatedEntities[${index}]`);
    if (!new Set(["evidence-event", "session-plan", "session-record"]).has(ref.kind)) {
      problem(400, "vnext-invalid-migration-run", "Migration generated entity kind is invalid.");
    }
    const validated = { kind: ref.kind, id: stableId(ref.id, "generated entity ID") };
    const key = `${validated.kind}:${validated.id}`;
    if (seen.has(key)) problem(400, "vnext-invalid-migration-run", "Migration generatedEntities cannot contain duplicates.");
    seen.add(key);
    return validated;
  });
};

const validatePayload = (kind, itemId, payload, profileId) => {
  if (payload.schemaVersion !== SCHEMA_VERSION) problem(400, "vnext-schema-version", `Unsupported ${kind} schema version.`);
  ensureAthlete(payload.athleteId, profileId, kind);
  if (kind === "session-plan") {
    const validationError = validateShadowSessionPlan(payload, itemId, profileId);
    if (validationError) problem(400, "vnext-invalid-plan", validationError);
    if (payload.id !== itemId) problem(400, "vnext-invalid-reference", "Session Plan wrapper and payload IDs differ.");
    const created = time(payload.createdAt, "Session Plan createdAt");
    positiveInteger(payload.catalogueVersion, "Session Plan catalogueVersion");
    stableId(payload.generatorPolicyId, "Session Plan generatorPolicyId");
    positiveInteger(payload.generatorPolicyVersion, "Session Plan generatorPolicyVersion");
    if (!Array.isArray(payload.items)) problem(400, "vnext-invalid-plan", "Session Plan items must be an array.");
    return { fact: created, recorded: created, plan: {
      catalogueVersion: payload.catalogueVersion,
      generatorPolicyId: payload.generatorPolicyId,
      generatorPolicyVersion: payload.generatorPolicyVersion,
    } };
  }
  if (kind === "evidence-event") {
    const validationError = validateShadowEvidenceEvent(payload, itemId, profileId);
    if (validationError) problem(400, "vnext-invalid-event", validationError);
    if (payload.id !== itemId) problem(400, "vnext-invalid-reference", "Evidence Event wrapper and payload IDs differ.");
    if (!EVENT_TYPES.has(payload.type) || typeof payload.source !== "string") {
      problem(400, "vnext-invalid-event", "Evidence Event type or source is invalid.");
    }
    if (payload.source === "session-record" || Object.hasOwn(payload, "itemOutcomes") ||
      Object.hasOwn(payload, "sessionRecordId") || Object.hasOwn(payload, "planId")) {
      problem(400, "vnext-session-authority", "Actual session facts belong only in Session Records.");
    }
    const occurred = time(payload.occurredAt, "Evidence Event occurredAt");
    const recorded = time(payload.recordedAt, "Evidence Event recordedAt");
    if (recorded.milliseconds < occurred.milliseconds) {
      problem(400, "vnext-event-time-order", "Evidence Event recordedAt cannot precede occurredAt.");
    }
    positiveInteger(payload.catalogueVersion, "Evidence Event catalogueVersion");
    const targetEventId = payload.type === "evidence_corrected"
      ? stableId(payload.supersedesEventId, "superseded Evidence Event ID")
      : payload.type === "restriction_cleared"
        ? stableId(payload.restrictionEventId, "cleared restriction Evidence Event ID")
        : null;
    if (targetEventId === itemId) problem(400, "vnext-invalid-reference", "Evidence Event cannot target itself.");
    return { fact: occurred, recorded, event: {
      type: payload.type, source: payload.source, catalogueVersion: payload.catalogueVersion, targetEventId,
    } };
  }
  if (kind === "session-record") {
    const validationError = validateShadowSessionRecord(payload, itemId, profileId);
    if (validationError) problem(400, "vnext-invalid-record", validationError);
    if (payload.id !== itemId) problem(400, "vnext-invalid-reference", "Session Record wrapper and payload IDs differ.");
    const planId = stableId(payload.planId, "Session Record planId");
    const started = time(payload.startedAt, "Session Record startedAt");
    const completed = time(payload.completedAt, "Session Record completedAt");
    const recorded = time(payload.recordedAt, "Session Record recordedAt");
    if (completed.milliseconds < started.milliseconds || recorded.milliseconds < completed.milliseconds) {
      problem(400, "vnext-record-time-order", "Session Record timestamps are not chronological.");
    }
    if (!RECORD_STATUSES.has(payload.status) || !Array.isArray(payload.itemOutcomes)) {
      problem(400, "vnext-invalid-record", "Session Record status or item outcomes are invalid.");
    }
    const supersedesRecordId = payload.supersedesRecordId === undefined
      ? null : stableId(payload.supersedesRecordId, "superseded Session Record ID");
    if (supersedesRecordId === itemId) problem(400, "vnext-invalid-reference", "Session Record cannot supersede itself.");
    return { fact: completed, recorded, record: { planId, started, status: payload.status, supersedesRecordId } };
  }
  if (kind === "athlete-intent") {
    const validationError = validateShadowAthleteIntent(payload, profileId);
    if (validationError) problem(400, "vnext-invalid-intent", validationError);
    if (itemId !== profileId) problem(400, "vnext-invalid-reference", "Athlete Intent sync ID must equal the athlete ID.");
    const updated = time(payload.updatedAt, "Athlete Intent updatedAt");
    if (!Array.isArray(payload.goals) || !Array.isArray(payload.equipment)) {
      problem(400, "vnext-invalid-intent", "Athlete Intent goals or equipment are invalid.");
    }
    return { fact: updated, recorded: updated, intent: { updated } };
  }
  if (kind === "reset-tombstone") {
    exactKeys(payload, new Set([
      "schemaVersion", "id", "athleteId", "resetAt", "recordedAt", "source",
    ]), "Reset tombstone", "vnext-invalid-reset");
    if (itemId !== profileId) problem(400, "vnext-invalid-reference", "Reset sync ID must equal the athlete ID.");
    stableId(payload.id, "reset tombstone audit ID");
    const reset = time(payload.resetAt, "resetAt");
    const recorded = time(payload.recordedAt, "reset recordedAt");
    if (recorded.milliseconds < reset.milliseconds) {
      problem(400, "vnext-reset-time-order", "Reset recordedAt cannot precede resetAt.");
    }
    if (!new Set(["athlete-reset", "legacy-v1.2", "import", "sync"]).has(payload.source)) {
      problem(400, "vnext-invalid-reset", "Reset source is invalid.");
    }
    return { fact: reset, recorded, reset: { reset, auditId: payload.id, source: payload.source } };
  }
  if (kind === "legacy-snapshot") {
    exactKeys(payload, new Set([
      "schemaVersion", "id", "athleteId", "converterVersion", "sourceVersion", "sourceFingerprint",
      "capturedAt", "resetAt", "sourceProfile",
    ]), "Legacy snapshot");
    if (payload.id !== itemId) problem(400, "vnext-invalid-reference", "Legacy snapshot wrapper and payload IDs differ.");
    if (payload.converterVersion !== 1 || payload.sourceVersion !== "1.2" || typeof payload.sourceFingerprint !== "string" ||
      !HASH_PATTERN.test(payload.sourceFingerprint)) {
      problem(400, "vnext-invalid-snapshot", "Legacy snapshot source metadata is invalid.");
    }
    const captured = time(payload.capturedAt, "snapshot capturedAt");
    const reset = optionalTime(payload.resetAt, "snapshot resetAt");
    const sourceProfile = object(payload.sourceProfile, "snapshot sourceProfile");
    if (sourceProfile.profileId !== profileId) problem(403, "vnext-athlete-ownership", "Snapshot source profile is not owned by this account.");
    validateLegacySourceProfile(sourceProfile, profileId);
    if (payload.capturedAt !== sourceProfile.updatedAt || payload.resetAt !== sourceProfile.progressResetAt) {
      problem(400, "vnext-invalid-snapshot", "Legacy snapshot capture/reset boundaries do not match their source profile.");
    }
    if (containsForbiddenSnapshotKey(sourceProfile)) {
      problem(400, "vnext-snapshot-secret", "Legacy snapshots cannot contain authentication or session secrets.");
    }
    return { fact: captured, recorded: captured, snapshot: {
      converterVersion: payload.converterVersion,
      sourceVersion: payload.sourceVersion,
      sourceFingerprint: payload.sourceFingerprint,
      captured,
      reset,
    } };
  }
  if (kind === "migration-run") {
    exactKeys(payload, new Set([
      "schemaVersion", "id", "athleteId", "converterVersion", "sourceVersion", "sourceFingerprint",
      "snapshotId", "createdAt", "status", "generatedEntities", "warnings", "rolledBackAt",
    ]), "Migration run", "vnext-invalid-migration-run");
    if (payload.id !== itemId) problem(400, "vnext-invalid-reference", "Migration run wrapper and payload IDs differ.");
    if (payload.converterVersion !== 1 || payload.sourceVersion !== "1.2" || typeof payload.sourceFingerprint !== "string" ||
      !HASH_PATTERN.test(payload.sourceFingerprint)) {
      problem(400, "vnext-invalid-migration-run", "Migration run source metadata is invalid.");
    }
    const snapshotId = stableId(payload.snapshotId, "migration snapshotId");
    const created = time(payload.createdAt, "migration createdAt");
    if (!new Set(["active", "rolled-back"]).has(payload.status)) {
      problem(400, "vnext-invalid-migration-run", "Migration run status is invalid.");
    }
    const rolledBack = payload.status === "rolled-back"
      ? time(payload.rolledBackAt, "migration rolledBackAt")
      : null;
    if (payload.status === "active" && payload.rolledBackAt !== undefined) {
      problem(400, "vnext-invalid-migration-run", "An active migration cannot have rolledBackAt.");
    }
    if (rolledBack && rolledBack.milliseconds < created.milliseconds) {
      problem(400, "vnext-invalid-migration-run", "Migration rolledBackAt cannot precede createdAt.");
    }
    if (!Array.isArray(payload.warnings) || payload.warnings.some((warning) => typeof warning !== "string" || warning.trim() === "")) {
      problem(400, "vnext-invalid-migration-run", "Migration warnings are invalid.");
    }
    const generatedEntities = validateGeneratedRefs(payload.generatedEntities);
    return { fact: created, recorded: rolledBack ?? created, migration: {
      converterVersion: payload.converterVersion,
      sourceVersion: payload.sourceVersion,
      sourceFingerprint: payload.sourceFingerprint,
      snapshotId,
      created,
      status: payload.status,
      rolledBack,
      generatedEntities,
    } };
  }
  problem(400, "vnext-invalid-kind", "Unsupported vNext sync kind.");
};

const normalizeItem = async (raw, profileId, fromClient = true) => {
  const item = object(raw, "sync item");
  if (!KINDS.has(item.kind)) problem(400, "vnext-invalid-kind", "Unsupported vNext sync kind.");
  const id = stableId(item.id, "sync item ID");
  if (typeof item.hash !== "string" || !HASH_PATTERN.test(item.hash)) {
    problem(400, "vnext-invalid-hash", "Sync item hash must be a lowercase SHA-256 hex digest.");
  }
  const migrationRunId = item.migrationRunId === undefined
    ? undefined : stableId(item.migrationRunId, "migrationRunId");
  const payload = object(item.payload, `${item.kind} payload`);
  const metadata = validatePayload(item.kind, id, payload, profileId);
  const computedHash = await sha256(payload);
  if (item.kind === "legacy-snapshot" && await sha256(payload.sourceProfile) !== payload.sourceFingerprint) {
    problem(400, "vnext-invalid-snapshot", "Legacy snapshot source fingerprint does not match its source profile.");
  }
  if (item.kind === "legacy-snapshot"
    && id !== await legacyStableId("legacy-v12-snapshot", profileId, payload.sourceFingerprint)) {
    problem(400, "vnext-invalid-snapshot", "Legacy snapshot ID is not deterministic for its source profile.");
  }
  if (item.kind === "migration-run"
    && id !== await legacyStableId("legacy-v12-run", profileId, payload.sourceFingerprint)) {
    problem(400, "vnext-invalid-migration-run", "Migration run ID is not deterministic for its source profile.");
  }
  const payloadJson = canonicalJson(payload);
  if (new TextEncoder().encode(canonicalJson({
    kind: item.kind,
    id,
    hash: item.hash,
    payload,
    ...(migrationRunId ? { migrationRunId } : {}),
  })).byteLength > MAX_SYNC_ITEM_BYTES) {
    problem(413, "vnext-item-too-large", `The ${item.kind} item exceeds the shadow-sync item limit.`);
  }
  return {
    kind: item.kind,
    id,
    hash: item.hash,
    computedHash,
    payload,
    payloadJson,
    migrationRunId,
    metadata,
    fromClient,
  };
};

const legacyResetItem = async (account, profileId) => {
  let profile;
  try { profile = JSON.parse(account.profile_json); }
  catch { return null; }
  if (typeof profile?.progressResetAt !== "string" || !Number.isFinite(Date.parse(profile.progressResetAt))) return null;
  const resetAt = new Date(Date.parse(profile.progressResetAt)).toISOString();
  const auditHash = await sha256(`${profileId}\n${resetAt}`);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    id: `legacy-reset:${auditHash}`,
    athleteId: profileId,
    resetAt,
    recordedAt: resetAt,
    source: "legacy-v1.2",
  };
  const hash = await sha256(payload);
  return normalizeItem({ kind: "reset-tombstone", id: profileId, hash, payload }, profileId, false);
};

const conflict = (row, reason, localHash) => ({
  kind: row.kind,
  id: row.id,
  ...(localHash ? { localHash } : {}),
  incomingHash: row.hash,
  reason,
});

const currentHead = async (env, profileId) => env.DB.prepare(`SELECT change_cursor, reset_tombstone_id,
  reset_tombstone_hash, reset_at, reset_at_ms, reset_payload_json
  FROM vnext_shadow_sync_heads WHERE profile_id = ?`).bind(profileId).first();

const ensureHead = async (env, profileId) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_sync_heads
  (profile_id, athlete_id, change_cursor, updated_at) VALUES (?, ?, 0, ?)`)
  .bind(profileId, profileId, new Date().toISOString()).run();

const currentResetRow = (head, profileId) => {
  if (!head?.reset_payload_json) return null;
  const payload = parseJson(head.reset_payload_json, "reset tombstone");
  return {
    kind: "reset-tombstone",
    id: profileId,
    hash: String(head.reset_tombstone_hash),
    computedHash: String(head.reset_tombstone_hash),
    payload,
    payloadJson: String(head.reset_payload_json),
    metadata: {
      fact: time(payload.resetAt, "stored resetAt"),
      recorded: time(payload.recordedAt, "stored reset recordedAt"),
      reset: {
        reset: time(payload.resetAt, "stored resetAt"),
        auditId: payload.id,
        source: payload.source,
      },
    },
    fromClient: false,
  };
};

// Higher cutoff wins. Equal-cutoff metadata converges to the lexicographically
// smaller canonical payload hash, matching the local shadow store.
const compareReset = (left, right) => left.metadata.reset.reset.milliseconds - right.metadata.reset.reset.milliseconds
  || compareCodeUnits(right.hash, left.hash);

const hashesByEntity = async (env, profileId, normalized) => {
  const result = new Map();
  for (const kind of KINDS) {
    const ids = [...new Set(normalized.filter((row) => row.kind === kind).map((row) => row.id))];
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(", ");
    const found = await rows(env.DB.prepare(`SELECT entity_id, payload_hash FROM vnext_shadow_changes
      WHERE profile_id = ? AND entity_kind = ? AND entity_id IN (${placeholders})`)
      .bind(profileId, kind, ...ids));
    for (const row of found) {
      const key = `${kind}:${row.entity_id}`;
      const values = result.get(key) ?? new Set();
      values.add(String(row.payload_hash));
      result.set(key, values);
    }
  }
  return result;
};

const idSet = async (env, table, column, profileId, ids, extra = "", extraValues = []) => {
  if (!ids.length) return new Set();
  const placeholders = ids.map(() => "?").join(", ");
  const found = await rows(env.DB.prepare(`SELECT ${column} AS id FROM ${table}
    WHERE profile_id = ? AND ${column} IN (${placeholders}) ${extra}`)
    .bind(profileId, ...ids, ...extraValues));
  return new Set(found.map((row) => String(row.id)));
};

const storedPlansById = async (env, profileId, ids) => {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const found = await rows(env.DB.prepare(`SELECT plans.plan_id, changes.payload_json
    FROM vnext_shadow_session_plans AS plans
    INNER JOIN vnext_shadow_changes AS changes ON changes.sequence = plans.change_sequence
    WHERE plans.profile_id = ? AND plans.plan_id IN (${placeholders})`)
    .bind(profileId, ...ids));
  return new Map(found.map((row) => [String(row.plan_id), parseJson(row.payload_json, "stored Session Plan")]));
};

const storedRecordRowsForPlans = async (env, profileId, planIds, resetMilliseconds) => {
  if (!planIds.length) return [];
  const placeholders = planIds.map(() => "?").join(",");
  return rows(env.DB.prepare(`SELECT record.record_id, record.plan_id, record.supersedes_record_id,
      CASE WHEN revoked.entity_id IS NULL THEN 0 ELSE 1 END AS revoked
    FROM vnext_shadow_session_records AS record
    LEFT JOIN vnext_shadow_rolled_back_entities AS revoked
      ON revoked.profile_id = record.profile_id AND revoked.entity_kind = 'session-record'
      AND revoked.entity_id = record.record_id
    WHERE record.profile_id = ? AND record.plan_id IN (${placeholders})
      ${resetMilliseconds === null ? "" : "AND record.completed_at_ms > ?"}`)
    .bind(profileId, ...planIds, ...(resetMilliseconds === null ? [] : [resetMilliseconds])));
};

const linearRecordChainIssue = (records) => {
  const byPlan = new Map();
  for (const record of records) {
    const planRecords = byPlan.get(record.planId) ?? [];
    planRecords.push(record);
    byPlan.set(record.planId, planRecords);
  }
  for (const [planId, planRecords] of byPlan) {
    const byId = new Map(planRecords.map((record) => [record.id, record]));
    const roots = planRecords.filter((record) => !record.supersedesRecordId);
    if (byId.size !== planRecords.length || roots.length !== 1) return { planId, recordId: roots[0]?.id };
    const childByParent = new Map();
    for (const record of planRecords) {
      if (!record.supersedesRecordId) continue;
      const parent = byId.get(record.supersedesRecordId);
      if (!parent || parent.planId !== planId || childByParent.has(record.supersedesRecordId)) {
        return { planId, recordId: record.id };
      }
      childByParent.set(record.supersedesRecordId, record);
    }
    const visited = new Set();
    let cursor = roots[0];
    while (cursor) {
      if (visited.has(cursor.id)) return { planId, recordId: cursor.id };
      visited.add(cursor.id);
      cursor = childByParent.get(cursor.id);
    }
    if (visited.size !== planRecords.length) {
      return { planId, recordId: planRecords.find((record) => !visited.has(record.id))?.id };
    }
  }
  return null;
};

const storedSnapshotsById = async (env, profileId, ids) => {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const found = await rows(env.DB.prepare(`SELECT snapshot_id, converter_version, source_version,
    source_fingerprint, captured_at FROM vnext_shadow_legacy_snapshots
    WHERE profile_id = ? AND snapshot_id IN (${placeholders})`).bind(profileId, ...ids));
  return new Map(found.map((row) => [String(row.snapshot_id), {
    converterVersion: Number(row.converter_version),
    sourceVersion: String(row.source_version),
    sourceFingerprint: String(row.source_fingerprint),
    capturedAt: String(row.captured_at),
  }]));
};

const getCurrentIntents = async (env, profileId) => env.DB.prepare(`SELECT payload_hash, payload_json,
  updated_at_ms, migration_run_id FROM vnext_shadow_athlete_intents WHERE profile_id = ?`)
  .bind(profileId).first();

const getMigrationRuns = async (env, profileId, ids) => {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const found = await rows(env.DB.prepare(`SELECT run_id, payload_hash, payload_json, status,
    source_fingerprint, snapshot_id FROM vnext_shadow_migration_runs
    WHERE profile_id = ? AND run_id IN (${placeholders})`).bind(profileId, ...ids));
  return new Map(found.map((row) => [String(row.run_id), row]));
};

const getRolledBackRefs = async (env, profileId, normalized) => {
  const refs = new Set();
  for (const kind of ["evidence-event", "session-plan", "session-record"]) {
    const ids = normalized.filter((row) => row.kind === kind).map((row) => row.id);
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(", ");
    const found = await rows(env.DB.prepare(`SELECT entity_kind, entity_id
      FROM vnext_shadow_rolled_back_entities
      WHERE profile_id = ? AND entity_kind = ? AND entity_id IN (${placeholders})`)
      .bind(profileId, kind, ...ids));
    for (const row of found) refs.add(`${row.entity_kind}:${row.entity_id}`);
  }
  return refs;
};

const getActiveOwnedRefs = async (env, profileId) => {
  const activeRuns = await rows(env.DB.prepare(`SELECT generated_entities_json
    FROM vnext_shadow_migration_runs WHERE profile_id = ? AND status = 'active'`).bind(profileId));
  return new Set(activeRuns.flatMap((row) =>
    parseJson(row.generated_entities_json, "active migration manifest")
      .map((ref) => `${ref.kind}:${ref.id}`)));
};

const sourceFingerprintRun = async (env, profileId, converterVersion, sourceFingerprint) =>
  env.DB.prepare(`SELECT run_id, payload_hash, status FROM vnext_shadow_migration_runs
    WHERE profile_id = ? AND converter_version = ? AND source_fingerprint = ?`)
    .bind(profileId, converterVersion, sourceFingerprint).first();

const sourceFingerprintSnapshot = async (env, profileId, converterVersion, sourceFingerprint) =>
  env.DB.prepare(`SELECT snapshot_id, payload_hash FROM vnext_shadow_legacy_snapshots
    WHERE profile_id = ? AND converter_version = ? AND source_fingerprint = ?`)
    .bind(profileId, converterVersion, sourceFingerprint).first();

const planRequest = async (env, profileId, incoming, head) => {
  const conflicts = [];
  const decisions = new Map();
  const requestDuplicates = new Set();
  const unique = new Map();
  for (const row of incoming) {
    if (row.hash !== row.computedHash) conflicts.push(conflict(row, "invalid-reference", row.computedHash));
    const key = `${row.kind}:${row.id}`;
    const prior = unique.get(key);
    if (!prior) unique.set(key, row);
    else if (prior.hash === row.hash) requestDuplicates.add(key);
    else if (row.kind === "reset-tombstone") {
      // Reset is a mutable per-athlete head. Multiple sources can legitimately
      // arrive together; deterministic authority ordering selects one winner.
      if (compareReset(row, prior) > 0) unique.set(key, row);
    }
    else conflicts.push(conflict(row, row.kind === "athlete-intent" ? "intent-timestamp-conflict" : "immutable-id-conflict", prior.hash));
  }
  const normalized = [...unique.values()];
  const existingHashes = await hashesByEntity(env, profileId, normalized);

  const resetRows = normalized.filter((row) => row.kind === "reset-tombstone");
  const currentReset = currentResetRow(head, profileId);
  const resetCandidates = [...resetRows, ...(currentReset ? [currentReset] : [])];
  const effectiveReset = resetCandidates.sort(compareReset).at(-1) ?? null;
  for (const row of resetRows) {
    const key = `${row.kind}:${row.id}`;
    const hashes = existingHashes.get(key) ?? new Set();
    if (hashes.has(row.hash) || requestDuplicates.has(key)) decisions.set(key, { row, status: "duplicate" });
    else if (effectiveReset !== row) decisions.set(key, { row, status: "ignored-older" });
    else decisions.set(key, { row, status: "inserted" });
  }
  const resetMilliseconds = effectiveReset?.metadata.reset.reset.milliseconds ?? null;

  const snapshots = normalized.filter((row) => row.kind === "legacy-snapshot");
  for (const row of snapshots) {
    const key = `${row.kind}:${row.id}`;
    const hashes = existingHashes.get(key) ?? new Set();
    const sameSource = await sourceFingerprintSnapshot(env, profileId,
      row.metadata.snapshot.converterVersion, row.metadata.snapshot.sourceFingerprint);
    if (hashes.has(row.hash) || sameSource?.payload_hash === row.hash || requestDuplicates.has(key)) {
      decisions.set(key, { row, status: "duplicate" });
    } else if (hashes.size || sameSource) {
      conflicts.push(conflict(row, "immutable-id-conflict", String(sameSource?.payload_hash ?? [...hashes][0])));
    } else decisions.set(key, { row, status: "inserted" });
  }

  const migrationRows = normalized.filter((row) => row.kind === "migration-run");
  const currentRuns = await getMigrationRuns(env, profileId, [...new Set([
    ...migrationRows.map((row) => row.id),
    ...normalized.map((row) => row.migrationRunId).filter(Boolean),
  ])]);
  for (const row of migrationRows) {
    const key = `${row.kind}:${row.id}`;
    const current = currentRuns.get(row.id);
    const sameSource = await sourceFingerprintRun(env, profileId,
      row.metadata.migration.converterVersion, row.metadata.migration.sourceFingerprint);
    if (sameSource && String(sameSource.run_id) !== row.id) {
      conflicts.push(conflict(row, "immutable-id-conflict", String(sameSource.payload_hash)));
    } else if (!current) decisions.set(key, { row, status: "inserted" });
    else if (String(current.payload_hash) === row.hash || requestDuplicates.has(key)) {
      decisions.set(key, { row, status: "duplicate" });
    } else if (stableMigrationJson(parseJson(current.payload_json, "migration run")) !== stableMigrationJson(row.payload)) {
      conflicts.push(conflict(row, "immutable-id-conflict", String(current.payload_hash)));
    } else if (current.status === "rolled-back" && row.metadata.migration.status === "active") {
      decisions.set(key, { row, status: "ignored-older" });
    } else if (current.status === "active" && row.metadata.migration.status === "rolled-back") {
      decisions.set(key, { row, status: "inserted" });
    } else if (current.status === "rolled-back" && row.metadata.migration.status === "rolled-back") {
      decisions.set(key, {
        row,
        status: compareCodeUnits(String(current.payload_hash), row.hash) < 0 ? "ignored-older" : "inserted",
      });
    } else conflicts.push(conflict(row, "immutable-id-conflict", String(current.payload_hash)));
  }

  const effectiveRuns = new Map(currentRuns);
  for (const row of migrationRows) {
    const decision = decisions.get(`${row.kind}:${row.id}`);
    if (decision?.status === "inserted") effectiveRuns.set(row.id, {
      status: row.metadata.migration.status,
      payload_hash: row.hash,
      payload_json: row.payloadJson,
      snapshot_id: row.metadata.migration.snapshotId,
    });
  }
  const rolledBackRefs = await getRolledBackRefs(env, profileId, normalized);
  const activeOwnedRefs = await getActiveOwnedRefs(env, profileId);
  for (const row of migrationRows) {
    const effective = effectiveRuns.get(row.id);
    if (effective?.status !== "active") continue;
    const payload = parseJson(effective.payload_json, "active migration run");
    for (const ref of payload.generatedEntities) activeOwnedRefs.add(`${ref.kind}:${ref.id}`);
  }
  for (const ref of activeOwnedRefs) rolledBackRefs.delete(ref);

  const immutableRows = normalized.filter((row) => ["session-plan", "evidence-event", "session-record"].includes(row.kind));
  for (const row of immutableRows) {
    const key = `${row.kind}:${row.id}`;
    if ((row.kind === "evidence-event" || row.kind === "session-record") &&
      resetMilliseconds !== null && row.metadata.fact.milliseconds <= resetMilliseconds) {
      decisions.set(key, { row, status: "ignored-reset" });
      continue;
    }
    if (rolledBackRefs.has(key) || (row.migrationRunId && effectiveRuns.get(row.migrationRunId)?.status === "rolled-back")) {
      decisions.set(key, { row, status: "ignored-older" });
      continue;
    }
    if (row.migrationRunId && effectiveRuns.get(row.migrationRunId)?.status !== "active") {
      conflicts.push(conflict(row, "invalid-reference"));
      continue;
    }
    if (row.migrationRunId) {
      const run = effectiveRuns.get(row.migrationRunId);
      const runPayload = run?.payload_json ? parseJson(run.payload_json, "migration run") : null;
      if (!runPayload?.generatedEntities?.some((ref) => ref.kind === row.kind && ref.id === row.id)) {
        conflicts.push(conflict(row, "invalid-reference"));
        continue;
      }
    }
    const hashes = existingHashes.get(key) ?? new Set();
    if (hashes.has(row.hash) || requestDuplicates.has(key)) decisions.set(key, { row, status: "duplicate" });
    else if (hashes.size) conflicts.push(conflict(row, "immutable-id-conflict", String([...hashes][0])));
    else decisions.set(key, { row, status: "inserted" });
  }

  const intentRows = normalized.filter((row) => row.kind === "athlete-intent");
  const currentIntent = await getCurrentIntents(env, profileId);
  for (const row of intentRows) {
    const key = `${row.kind}:${row.id}`;
    if (row.migrationRunId && effectiveRuns.get(row.migrationRunId)?.status === "rolled-back") {
      decisions.set(key, { row, status: "ignored-older" });
    } else if (row.migrationRunId && effectiveRuns.get(row.migrationRunId)?.status !== "active") {
      conflicts.push(conflict(row, "invalid-reference"));
    } else if (!currentIntent) decisions.set(key, { row, status: "inserted" });
    else if (String(currentIntent.payload_hash) === row.hash || requestDuplicates.has(key)) {
      decisions.set(key, { row, status: "duplicate" });
    } else if (row.metadata.intent.updated.milliseconds > Number(currentIntent.updated_at_ms)) {
      decisions.set(key, { row, status: "inserted" });
    } else if (row.metadata.intent.updated.milliseconds < Number(currentIntent.updated_at_ms)) {
      decisions.set(key, { row, status: "ignored-older" });
    } else conflicts.push(conflict(row, "intent-timestamp-conflict", String(currentIntent.payload_hash)));
  }

  const availableSnapshots = new Map(snapshots
    .filter((row) => ["inserted", "duplicate"].includes(decisions.get(`${row.kind}:${row.id}`)?.status))
    .map((row) => [row.id, row.metadata.snapshot]));
  const missingSnapshotIds = [...new Set(migrationRows.map((row) => row.metadata.migration.snapshotId)
    .filter((id) => !availableSnapshots.has(id)))];
  const storedSnapshots = await storedSnapshotsById(env, profileId, missingSnapshotIds);
  for (const row of migrationRows) {
    const snapshot = availableSnapshots.get(row.metadata.migration.snapshotId)
      ?? storedSnapshots.get(row.metadata.migration.snapshotId);
    if (!snapshot || snapshot.converterVersion !== row.metadata.migration.converterVersion
      || snapshot.sourceVersion !== row.metadata.migration.sourceVersion
      || snapshot.sourceFingerprint !== row.metadata.migration.sourceFingerprint
      || (snapshot.captured?.iso ?? snapshot.capturedAt) !== row.metadata.migration.created.iso) {
      conflicts.push(conflict(row, "invalid-reference"));
    }
  }

  const usable = (kind, id) => {
    const decision = decisions.get(`${kind}:${id}`);
    return decision && ["inserted", "duplicate"].includes(decision.status);
  };
  const incomingPlans = new Map(immutableRows
    .filter((row) => row.kind === "session-plan" && usable(row.kind, row.id))
    .map((row) => [row.id, row.payload]));
  const incomingPlanIds = new Set(incomingPlans.keys());
  const neededPlanIds = [...new Set(immutableRows.filter((row) => row.kind === "session-record" && usable(row.kind, row.id))
    .map((row) => row.metadata.record.planId).filter((id) => !incomingPlanIds.has(id)))];
  const storedPlans = await storedPlansById(env, profileId, neededPlanIds);
  for (const row of immutableRows.filter((candidate) => candidate.kind === "session-record" && usable(candidate.kind, candidate.id))) {
    const planPayload = incomingPlans.get(row.metadata.record.planId) ?? storedPlans.get(row.metadata.record.planId);
    if (!planPayload) {
      conflicts.push(conflict(row, "invalid-reference"));
      continue;
    }
    const validationError = validateShadowSessionPair(planPayload, row.payload, profileId);
    if (validationError) problem(400, "vnext-invalid-session-pair", validationError);
  }

  const incomingEventIds = new Set(immutableRows.filter((row) => row.kind === "evidence-event" && usable(row.kind, row.id)).map((row) => row.id));
  const eventTargets = [...new Set(immutableRows.filter((row) => row.kind === "evidence-event" && usable(row.kind, row.id))
    .map((row) => row.metadata.event.targetEventId).filter((id) => id && !incomingEventIds.has(id)))];
  const storedEventIds = await idSet(env, "vnext_shadow_evidence_events", "event_id", profileId, eventTargets,
    resetMilliseconds === null ? "" : "AND occurred_at_ms > ?", resetMilliseconds === null ? [] : [resetMilliseconds]);
  for (const row of immutableRows.filter((candidate) => candidate.kind === "evidence-event" && usable(candidate.kind, candidate.id))) {
    const target = row.metadata.event.targetEventId;
    if (target && !incomingEventIds.has(target) && !storedEventIds.has(target)) conflicts.push(conflict(row, "invalid-reference"));
  }

  const incomingRecordIds = new Set(immutableRows.filter((row) => row.kind === "session-record" && usable(row.kind, row.id)).map((row) => row.id));
  const recordTargets = [...new Set(immutableRows.filter((row) => row.kind === "session-record" && usable(row.kind, row.id))
    .map((row) => row.metadata.record.supersedesRecordId).filter((id) => id && !incomingRecordIds.has(id)))];
  const storedRecordIds = await idSet(env, "vnext_shadow_session_records", "record_id", profileId, recordTargets,
    resetMilliseconds === null ? "" : "AND completed_at_ms > ?", resetMilliseconds === null ? [] : [resetMilliseconds]);
  for (const row of immutableRows.filter((candidate) => candidate.kind === "session-record" && usable(candidate.kind, candidate.id))) {
    const target = row.metadata.record.supersedesRecordId;
    if (target && !incomingRecordIds.has(target) && !storedRecordIds.has(target)) conflicts.push(conflict(row, "invalid-reference"));
  }

  const usableRecordRows = immutableRows.filter((row) => row.kind === "session-record" && usable(row.kind, row.id));
  const affectedPlanIds = [...new Set(usableRecordRows.map((row) => row.metadata.record.planId))];
  const storedChainRows = await storedRecordRowsForPlans(env, profileId, affectedPlanIds, resetMilliseconds);
  const availableRecords = new Map(storedChainRows.map((row) => [String(row.record_id), {
    id: String(row.record_id),
    planId: String(row.plan_id),
    supersedesRecordId: row.supersedes_record_id ? String(row.supersedes_record_id) : null,
    revoked: Number(row.revoked) === 1,
  }]));
  const retainedRecords = new Map([...availableRecords.values()]
    .filter((record) => !record.revoked)
    .map((record) => [record.id, record]));
  for (const row of usableRecordRows) {
    const incoming = {
      id: row.id,
      planId: row.metadata.record.planId,
      supersedesRecordId: row.metadata.record.supersedesRecordId,
      revoked: false,
    };
    availableRecords.set(incoming.id, incoming);
    retainedRecords.set(incoming.id, incoming);
  }
  const pendingRecords = [...retainedRecords.values()];
  while (pendingRecords.length) {
    const targetId = pendingRecords.pop().supersedesRecordId;
    if (!targetId || retainedRecords.has(targetId)) continue;
    const target = availableRecords.get(targetId);
    if (target) {
      retainedRecords.set(target.id, target);
      pendingRecords.push(target);
    }
  }
  const chainIssue = linearRecordChainIssue([...retainedRecords.values()]
    .filter((record) => affectedPlanIds.includes(record.planId)));
  if (chainIssue) {
    const related = usableRecordRows.find((row) => row.id === chainIssue.recordId)
      ?? usableRecordRows.find((row) => row.metadata.record.planId === chainIssue.planId);
    if (related) conflicts.push(conflict(related, "invalid-reference"));
  }

  return { conflicts, decisions, normalized, effectiveReset, currentReset, effectiveRuns };
};

const immutableChangeStatement = (env, profileId, row, createdAt) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_changes
  (profile_id, entity_kind, entity_id, payload_hash, migration_run_id, fact_time, fact_time_ms,
    recorded_at, recorded_at_ms, payload_json, created_at)
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE (? NOT IN ('evidence-event', 'session-record') OR NOT EXISTS (
      SELECT 1 FROM vnext_shadow_sync_heads
      WHERE profile_id = ? AND reset_at_ms IS NOT NULL AND reset_at_ms >= ?
    ))
    AND (? NOT IN ('evidence-event', 'session-plan', 'session-record') OR NOT EXISTS (
      SELECT 1 FROM vnext_shadow_rolled_back_entities
      WHERE profile_id = ? AND entity_kind = ? AND entity_id = ?
    ))
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM vnext_shadow_migration_runs
      WHERE profile_id = ? AND run_id = ? AND status = 'active'
    ))
    AND (? <> 'legacy-snapshot' OR NOT EXISTS (
      SELECT 1 FROM vnext_shadow_legacy_snapshots
      WHERE profile_id = ? AND converter_version = ? AND source_fingerprint = ?
    ))
    AND (? <> 'session-record' OR (
      (? IS NULL AND NOT EXISTS (
        SELECT 1 FROM vnext_shadow_session_records
        WHERE profile_id = ? AND plan_id = ? AND supersedes_record_id IS NULL
      ))
      OR (? IS NOT NULL AND EXISTS (
        SELECT 1 FROM vnext_shadow_session_records
        WHERE profile_id = ? AND plan_id = ? AND record_id = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM vnext_shadow_session_records
        WHERE profile_id = ? AND supersedes_record_id = ?
      ))
    ))`)
  .bind(profileId, row.kind, row.id, row.hash, row.migrationRunId ?? null,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.recorded.iso, row.metadata.recorded.milliseconds, row.payloadJson, createdAt,
    row.kind, profileId, row.metadata.fact.milliseconds,
    row.kind, profileId, row.kind, row.id,
    row.migrationRunId ?? null, profileId, row.migrationRunId ?? null,
    row.kind, profileId, row.metadata.snapshot?.converterVersion ?? 0,
    row.metadata.snapshot?.sourceFingerprint ?? "",
    row.kind,
    row.metadata.record?.supersedesRecordId ?? null,
    profileId, row.metadata.record?.planId ?? "",
    row.metadata.record?.supersedesRecordId ?? null,
    profileId, row.metadata.record?.planId ?? "", row.metadata.record?.supersedesRecordId ?? "",
    profileId, row.metadata.record?.supersedesRecordId ?? "");

const intentChangeStatement = (env, profileId, row, createdAt) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_changes
  (profile_id, entity_kind, entity_id, payload_hash, migration_run_id, fact_time, fact_time_ms,
    recorded_at, recorded_at_ms, payload_json, created_at)
  SELECT ?, 'athlete-intent', ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE NOT EXISTS (
      SELECT 1 FROM vnext_shadow_athlete_intents
      WHERE profile_id = ? AND updated_at_ms >= ?
    )
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM vnext_shadow_migration_runs
      WHERE profile_id = ? AND run_id = ? AND status = 'active'
    ))`)
  .bind(profileId, row.id, row.hash, row.migrationRunId ?? null,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.recorded.iso, row.metadata.recorded.milliseconds, row.payloadJson, createdAt,
    profileId, row.metadata.fact.milliseconds,
    row.migrationRunId ?? null, profileId, row.migrationRunId ?? null);

const resetChangeStatement = (env, profileId, row, createdAt) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_changes
  (profile_id, entity_kind, entity_id, payload_hash, migration_run_id, fact_time, fact_time_ms,
    recorded_at, recorded_at_ms, payload_json, created_at)
  SELECT ?, 'reset-tombstone', ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM vnext_shadow_sync_heads WHERE profile_id = ? AND (
      reset_at_ms IS NULL OR ? > reset_at_ms OR (? = reset_at_ms AND ? < reset_tombstone_hash)
    )
  )`)
  .bind(profileId, row.id, row.hash, row.migrationRunId ?? null,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.recorded.iso, row.metadata.recorded.milliseconds, row.payloadJson, createdAt,
    profileId, row.metadata.reset.reset.milliseconds,
    row.metadata.reset.reset.milliseconds, row.hash);

const migrationChangeStatement = (env, profileId, row, createdAt) => {
  const stablePayloadJson = stableMigrationJson(row.payload);
  return env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_changes
    (profile_id, entity_kind, entity_id, payload_hash, migration_run_id, fact_time, fact_time_ms,
      recorded_at, recorded_at_ms, payload_json, created_at)
    SELECT ?, 'migration-run', ?, ?, NULL, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
        SELECT 1 FROM vnext_shadow_migration_runs
        WHERE profile_id = ? AND converter_version = ? AND source_fingerprint = ? AND run_id <> ?
      )
      AND (NOT EXISTS (
        SELECT 1 FROM vnext_shadow_migration_runs WHERE profile_id = ? AND run_id = ?
      ) OR EXISTS (
        SELECT 1 FROM vnext_shadow_migration_runs WHERE profile_id = ? AND run_id = ?
          AND stable_payload_json = ? AND (
            (status = 'active' AND ? = 'rolled-back')
            OR (status = 'rolled-back' AND ? = 'rolled-back' AND ? < payload_hash)
          )
      ))`)
    .bind(profileId, row.id, row.hash,
      row.metadata.fact.iso, row.metadata.fact.milliseconds,
      row.metadata.recorded.iso, row.metadata.recorded.milliseconds, row.payloadJson, createdAt,
      profileId, row.metadata.migration.converterVersion, row.metadata.migration.sourceFingerprint, row.id,
      profileId, row.id,
      profileId, row.id, stablePayloadJson,
      row.metadata.migration.status, row.metadata.migration.status, row.hash);
};

const changeStatement = (env, profileId, row, createdAt) => row.kind === "athlete-intent"
  ? intentChangeStatement(env, profileId, row, createdAt)
  : row.kind === "reset-tombstone"
    ? resetChangeStatement(env, profileId, row, createdAt)
    : row.kind === "migration-run"
      ? migrationChangeStatement(env, profileId, row, createdAt)
      : immutableChangeStatement(env, profileId, row, createdAt);

const planStatement = (env, profileId, row) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_session_plans
  (profile_id, plan_id, change_sequence, athlete_id, migration_run_id, created_at, created_at_ms,
    catalogue_version, generator_policy_id, generator_policy_version, payload_hash)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'session-plan' AND entity_id = ? AND payload_hash = ?`)
  .bind(profileId, row.id, profileId, row.migrationRunId ?? null,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.plan.catalogueVersion, row.metadata.plan.generatorPolicyId,
    row.metadata.plan.generatorPolicyVersion, row.hash, profileId, row.id, row.hash);

const eventStatement = (env, profileId, row) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_evidence_events
  (profile_id, event_id, change_sequence, athlete_id, migration_run_id, event_type, source,
    occurred_at, occurred_at_ms, recorded_at, recorded_at_ms, catalogue_version, target_event_id, payload_hash)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'evidence-event' AND entity_id = ? AND payload_hash = ?`)
  .bind(profileId, row.id, profileId, row.migrationRunId ?? null,
    row.metadata.event.type, row.metadata.event.source,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.recorded.iso, row.metadata.recorded.milliseconds,
    row.metadata.event.catalogueVersion, row.metadata.event.targetEventId, row.hash,
    profileId, row.id, row.hash);

const recordStatement = (env, profileId, row) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_session_records
  (profile_id, record_id, change_sequence, athlete_id, migration_run_id, plan_id,
    started_at, started_at_ms, completed_at, completed_at_ms, recorded_at, recorded_at_ms,
    status, supersedes_record_id, payload_hash)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'session-record' AND entity_id = ? AND payload_hash = ?`)
  .bind(profileId, row.id, profileId, row.migrationRunId ?? null, row.metadata.record.planId,
    row.metadata.record.started.iso, row.metadata.record.started.milliseconds,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.recorded.iso, row.metadata.recorded.milliseconds,
    row.metadata.record.status, row.metadata.record.supersedesRecordId, row.hash,
    profileId, row.id, row.hash);

const snapshotStatement = (env, profileId, row) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_legacy_snapshots
  (profile_id, snapshot_id, change_sequence, athlete_id, converter_version, source_version,
    source_fingerprint, captured_at, captured_at_ms, reset_at, reset_at_ms, payload_hash, payload_json)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'legacy-snapshot' AND entity_id = ? AND payload_hash = ?`)
  .bind(profileId, row.id, profileId, row.metadata.snapshot.converterVersion,
    row.metadata.snapshot.sourceVersion, row.metadata.snapshot.sourceFingerprint,
    row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.metadata.snapshot.reset?.iso ?? null, row.metadata.snapshot.reset?.milliseconds ?? null,
    row.hash, row.payloadJson, profileId, row.id, row.hash);

const resetStatement = (env, profileId, row) => env.DB.prepare(`INSERT OR IGNORE INTO vnext_shadow_reset_tombstones
  (profile_id, tombstone_id, change_sequence, athlete_id, reset_at, reset_at_ms,
    recorded_at, recorded_at_ms, source, payload_hash)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'reset-tombstone' AND entity_id = ? AND payload_hash = ?`)
  .bind(profileId, row.payload.id, profileId,
    row.metadata.reset.reset.iso, row.metadata.reset.reset.milliseconds,
    row.metadata.recorded.iso, row.metadata.recorded.milliseconds,
    row.metadata.reset.source, row.hash, profileId, row.id, row.hash);

const intentStatement = (env, profileId, row) => env.DB.prepare(`INSERT INTO vnext_shadow_athlete_intents
  (profile_id, athlete_id, change_sequence, updated_at, updated_at_ms, migration_run_id, payload_hash, payload_json)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'athlete-intent' AND entity_id = ? AND payload_hash = ?
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM vnext_shadow_migration_runs
      WHERE profile_id = ? AND run_id = ? AND status = 'active'
    ))
  ON CONFLICT(profile_id) DO UPDATE SET
    athlete_id = excluded.athlete_id,
    change_sequence = excluded.change_sequence,
    updated_at = excluded.updated_at,
    updated_at_ms = excluded.updated_at_ms,
    migration_run_id = excluded.migration_run_id,
    payload_hash = excluded.payload_hash,
    payload_json = excluded.payload_json
  WHERE excluded.updated_at_ms > vnext_shadow_athlete_intents.updated_at_ms`)
  .bind(profileId, profileId, row.metadata.fact.iso, row.metadata.fact.milliseconds,
    row.migrationRunId ?? null, row.hash, row.payloadJson, profileId, row.id, row.hash,
    row.migrationRunId ?? null, profileId, row.migrationRunId ?? null);

const migrationStatement = (env, profileId, row) => env.DB.prepare(`INSERT INTO vnext_shadow_migration_runs
  (profile_id, run_id, change_sequence, athlete_id, converter_version, source_version,
    source_fingerprint, snapshot_id, status, created_at, created_at_ms, rolled_back_at,
    rolled_back_at_ms, generated_entities_json, stable_payload_json, payload_hash, payload_json)
  SELECT ?, ?, sequence, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM vnext_shadow_changes
  WHERE profile_id = ? AND entity_kind = 'migration-run' AND entity_id = ? AND payload_hash = ?
  ON CONFLICT(profile_id, run_id) DO UPDATE SET
    change_sequence = excluded.change_sequence,
    status = excluded.status,
    rolled_back_at = excluded.rolled_back_at,
    rolled_back_at_ms = excluded.rolled_back_at_ms,
    generated_entities_json = excluded.generated_entities_json,
    stable_payload_json = excluded.stable_payload_json,
    payload_hash = excluded.payload_hash,
    payload_json = excluded.payload_json
  WHERE excluded.stable_payload_json = vnext_shadow_migration_runs.stable_payload_json
    AND (
      (vnext_shadow_migration_runs.status = 'active' AND excluded.status = 'rolled-back')
      OR (vnext_shadow_migration_runs.status = 'rolled-back' AND excluded.status = 'rolled-back'
        AND excluded.payload_hash < vnext_shadow_migration_runs.payload_hash)
    )`)
  .bind(profileId, row.id, profileId,
    row.metadata.migration.converterVersion, row.metadata.migration.sourceVersion,
    row.metadata.migration.sourceFingerprint, row.metadata.migration.snapshotId,
    row.metadata.migration.status, row.metadata.migration.created.iso,
    row.metadata.migration.created.milliseconds,
    row.metadata.migration.rolledBack?.iso ?? null,
    row.metadata.migration.rolledBack?.milliseconds ?? null,
    canonicalJson(row.metadata.migration.generatedEntities), stableMigrationJson(row.payload), row.hash, row.payloadJson,
    profileId, row.id, row.hash);

const runBatches = async (env, statements, size = 60) => {
  for (let index = 0; index < statements.length; index += size) {
    await env.DB.batch(statements.slice(index, index + size));
  }
};

const insertRows = async (env, profileId, selected, normalizedStatement) => {
  if (!selected.length) return;
  const createdAt = new Date().toISOString();
  const statements = [];
  for (const row of selected) {
    statements.push(changeStatement(env, profileId, row, createdAt));
    statements.push(normalizedStatement(env, profileId, row));
  }
  await runBatches(env, statements);
};

const persistReset = async (env, profileId, row) => {
  const createdAt = new Date().toISOString();
  const resetMilliseconds = row.metadata.reset.reset.milliseconds;
  await env.DB.batch([
    resetChangeStatement(env, profileId, row, createdAt),
    resetStatement(env, profileId, row),
    env.DB.prepare(`UPDATE vnext_shadow_sync_heads SET
      reset_tombstone_id = ?, reset_tombstone_hash = ?, reset_at = ?, reset_at_ms = ?,
      reset_payload_json = ?, updated_at = ?
      WHERE profile_id = ? AND (
        reset_at_ms IS NULL OR ? > reset_at_ms OR (? = reset_at_ms AND ? < reset_tombstone_hash)
      )`)
      .bind(row.payload.id, row.hash, row.metadata.reset.reset.iso, resetMilliseconds,
        row.payloadJson, createdAt, profileId, resetMilliseconds, resetMilliseconds, row.hash),
    env.DB.prepare(`WITH RECURSIVE invalid_records(record_id) AS (
      SELECT record_id FROM vnext_shadow_session_records
      WHERE profile_id = ? AND completed_at_ms <= ?
      UNION
      SELECT child.record_id FROM vnext_shadow_session_records AS child
      INNER JOIN invalid_records AS parent ON child.supersedes_record_id = parent.record_id
      WHERE child.profile_id = ?
    )
      DELETE FROM vnext_shadow_changes
      WHERE profile_id = ? AND entity_kind = 'session-record'
        AND entity_id IN (SELECT record_id FROM invalid_records) AND EXISTS (
          SELECT 1 FROM vnext_shadow_sync_heads
          WHERE profile_id = ? AND reset_tombstone_hash = ?
        )`).bind(profileId, resetMilliseconds, profileId, profileId, profileId, row.hash),
    env.DB.prepare(`WITH RECURSIVE invalid_events(event_id) AS (
      SELECT event_id FROM vnext_shadow_evidence_events
      WHERE profile_id = ? AND occurred_at_ms <= ?
      UNION
      SELECT child.event_id FROM vnext_shadow_evidence_events AS child
      INNER JOIN invalid_events AS parent ON child.target_event_id = parent.event_id
      WHERE child.profile_id = ?
    )
      DELETE FROM vnext_shadow_changes
      WHERE profile_id = ? AND entity_kind = 'evidence-event'
        AND entity_id IN (SELECT event_id FROM invalid_events) AND EXISTS (
          SELECT 1 FROM vnext_shadow_sync_heads
          WHERE profile_id = ? AND reset_tombstone_hash = ?
        )`).bind(profileId, resetMilliseconds, profileId, profileId, profileId, row.hash),
    // Plans contain intended facts only. Retaining an orphan permits a later
    // sync page to attach its post-reset Session Record deterministically.
    env.DB.prepare(`DELETE FROM vnext_shadow_projection_caches
      WHERE profile_id = ? AND EXISTS (
        SELECT 1 FROM vnext_shadow_sync_heads
        WHERE profile_id = ? AND reset_tombstone_hash = ?
      )`).bind(profileId, profileId, row.hash),
  ]);
};

const clearGeneratedIntentAfterRollback = async (env, profileId, runId) => {
  await env.DB.prepare(`DELETE FROM vnext_shadow_athlete_intents
    WHERE profile_id = ? AND migration_run_id = ?`).bind(profileId, runId).run();
};

const applyRollback = async (env, profileId, row) => {
  const rolledBackAt = row.metadata.migration.rolledBack.iso;
  // A run manifest is provenance ownership. Shared deterministic conversion
  // entities remain live while any other active run claims the same ref.
  // json_each keeps even a 1,000-ref rollback to one D1 statement.
  await env.DB.prepare(`WITH RECURSIVE
    rollback_refs(kind, id) AS (
      SELECT json_extract(value, '$.kind'), json_extract(value, '$.id') FROM json_each(?)
    ),
    live_run_refs(kind, id) AS (
      SELECT json_extract(ref.value, '$.kind'), json_extract(ref.value, '$.id')
      FROM vnext_shadow_migration_runs AS owner,
        json_each(owner.generated_entities_json) AS ref
      WHERE owner.profile_id = ? AND owner.run_id <> ? AND owner.status = 'active'
    ),
    protected_records(record_id, supersedes_record_id) AS (
      SELECT record.record_id, record.supersedes_record_id
      FROM vnext_shadow_session_records AS record
      WHERE record.profile_id = ? AND (
        record.migration_run_id IS NULL OR EXISTS (
          SELECT 1 FROM live_run_refs WHERE kind = 'session-record' AND id = record.record_id
        )
      )
      UNION
      SELECT target.record_id, target.supersedes_record_id
      FROM vnext_shadow_session_records AS target
      INNER JOIN protected_records AS child ON child.supersedes_record_id = target.record_id
      WHERE target.profile_id = ?
    ),
    protected_events(event_id, target_event_id) AS (
      SELECT event.event_id, event.target_event_id
      FROM vnext_shadow_evidence_events AS event
      WHERE event.profile_id = ? AND (
        event.migration_run_id IS NULL OR EXISTS (
          SELECT 1 FROM live_run_refs WHERE kind = 'evidence-event' AND id = event.event_id
        )
      )
      UNION
      SELECT target.event_id, target.target_event_id
      FROM vnext_shadow_evidence_events AS target
      INNER JOIN protected_events AS child ON child.target_event_id = target.event_id
      WHERE target.profile_id = ?
    ),
    protected_plans(plan_id) AS (
      SELECT DISTINCT record.plan_id FROM vnext_shadow_session_records AS record
      INNER JOIN protected_records ON protected_records.record_id = record.record_id
      WHERE record.profile_id = ?
    )
    INSERT OR IGNORE INTO vnext_shadow_rolled_back_entities
    (profile_id, entity_kind, entity_id, migration_run_id, rolled_back_at)
    SELECT ?, ref.kind, ref.id, ?, ? FROM rollback_refs AS ref
    WHERE NOT EXISTS (
      SELECT 1 FROM live_run_refs WHERE live_run_refs.kind = ref.kind AND live_run_refs.id = ref.id
    ) AND NOT (
      ref.kind = 'session-record' AND EXISTS (
        SELECT 1 FROM protected_records WHERE protected_records.record_id = ref.id
      )
    ) AND NOT (
      ref.kind = 'evidence-event' AND EXISTS (
        SELECT 1 FROM protected_events WHERE protected_events.event_id = ref.id
      )
    ) AND NOT (
      ref.kind = 'session-plan' AND EXISTS (
        SELECT 1 FROM protected_plans WHERE protected_plans.plan_id = ref.id
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM vnext_shadow_changes AS native
      WHERE native.profile_id = ?
        AND native.entity_kind = ref.kind
        AND native.entity_id = ref.id
        AND native.migration_run_id IS NULL
    )`).bind(canonicalJson(row.metadata.migration.generatedEntities),
    profileId, row.id,
    profileId, profileId,
    profileId, profileId,
    profileId,
    profileId, row.id, rolledBackAt, profileId).run();
  // Immutable payload rows are a logical quarantine, not physical deletion.
  // Their terminal/active manifests determine visibility and allow a later
  // co-owner receipt to reactivate an old stable fact without payload replay.
  await env.DB.prepare("DELETE FROM vnext_shadow_projection_caches WHERE profile_id = ?").bind(profileId).run();
  await clearGeneratedIntentAfterRollback(env, profileId, row.id);
};

const activateMigrationOwnership = async (env, profileId, row) => {
  await env.DB.prepare(`DELETE FROM vnext_shadow_rolled_back_entities
    WHERE profile_id = ? AND EXISTS (
      SELECT 1 FROM json_each(?) AS ref
      WHERE json_extract(ref.value, '$.kind') = vnext_shadow_rolled_back_entities.entity_kind
        AND json_extract(ref.value, '$.id') = vnext_shadow_rolled_back_entities.entity_id
    )`).bind(profileId, canonicalJson(row.metadata.migration.generatedEntities)).run();
};

const clearNativeDependencyRevocations = async (env, profileId, rowsToCheck) => {
  const nativeEventIds = rowsToCheck.filter((row) => row.kind === "evidence-event"
    && !row.migrationRunId && row.metadata.event.targetEventId).map((row) => row.id);
  if (nativeEventIds.length) {
    await env.DB.prepare(`WITH RECURSIVE
      seed_events(event_id, target_event_id) AS (
        SELECT event_id, target_event_id FROM vnext_shadow_evidence_events
        WHERE profile_id = ? AND migration_run_id IS NULL
          AND event_id IN (SELECT value FROM json_each(?))
      ),
      dependencies(event_id, target_event_id) AS (
        SELECT target.event_id, target.target_event_id
        FROM seed_events AS seed
        INNER JOIN vnext_shadow_evidence_events AS target
          ON target.profile_id = ? AND target.event_id = seed.target_event_id
        UNION
        SELECT target.event_id, target.target_event_id
        FROM dependencies AS child
        INNER JOIN vnext_shadow_evidence_events AS target
          ON target.profile_id = ? AND target.event_id = child.target_event_id
      )
      DELETE FROM vnext_shadow_rolled_back_entities
      WHERE profile_id = ? AND entity_kind = 'evidence-event'
        AND entity_id IN (SELECT event_id FROM dependencies)`)
      .bind(profileId, canonicalJson(nativeEventIds), profileId, profileId, profileId).run();
  }

  const nativeRecordIds = rowsToCheck.filter((row) => row.kind === "session-record"
    && !row.migrationRunId).map((row) => row.id);
  if (nativeRecordIds.length) {
    await env.DB.prepare(`WITH RECURSIVE
      seed_records(record_id, supersedes_record_id, plan_id) AS (
        SELECT record_id, supersedes_record_id, plan_id FROM vnext_shadow_session_records
        WHERE profile_id = ? AND migration_run_id IS NULL
          AND record_id IN (SELECT value FROM json_each(?))
      ),
      dependencies(record_id, supersedes_record_id, plan_id) AS (
        SELECT target.record_id, target.supersedes_record_id, target.plan_id
        FROM seed_records AS seed
        INNER JOIN vnext_shadow_session_records AS target
          ON target.profile_id = ? AND target.record_id = seed.supersedes_record_id
        UNION
        SELECT target.record_id, target.supersedes_record_id, target.plan_id
        FROM dependencies AS child
        INNER JOIN vnext_shadow_session_records AS target
          ON target.profile_id = ? AND target.record_id = child.supersedes_record_id
      ),
      required_plans(plan_id) AS (
        SELECT plan_id FROM seed_records UNION SELECT plan_id FROM dependencies
      )
      DELETE FROM vnext_shadow_rolled_back_entities
      WHERE profile_id = ? AND (
        (entity_kind = 'session-record' AND entity_id IN (SELECT record_id FROM dependencies))
        OR (entity_kind = 'session-plan' AND entity_id IN (SELECT plan_id FROM required_plans))
      )`).bind(profileId, canonicalJson(nativeRecordIds), profileId, profileId, profileId).run();
  }
  if (nativeEventIds.length || nativeRecordIds.length) {
    await env.DB.prepare("DELETE FROM vnext_shadow_projection_caches WHERE profile_id = ?")
      .bind(profileId).run();
  }
};

const authoritativeRollbackRows = async (env, profileId, requestedRows) => {
  const result = [];
  for (const requested of requestedRows) {
    const current = await env.DB.prepare(`SELECT payload_hash, payload_json, status
      FROM vnext_shadow_migration_runs WHERE profile_id = ? AND run_id = ?`)
      .bind(profileId, requested.id).first();
    if (current?.status !== "rolled-back") continue;
    const payload = parseJson(current.payload_json, "migration rollback");
    if (stableMigrationJson(payload) !== stableMigrationJson(requested.payload)) continue;
    result.push(await normalizeItem({
      kind: "migration-run",
      id: requested.id,
      hash: String(current.payload_hash),
      payload,
    }, profileId, false));
  }
  return result;
};

const refreshCursor = async (env, profileId, invalidateCache) => {
  const statements = [env.DB.prepare(`UPDATE vnext_shadow_sync_heads SET
    change_cursor = MAX(change_cursor, COALESCE((
      SELECT MAX(sequence) FROM vnext_shadow_changes WHERE profile_id = ?
    ), 0)), updated_at = ? WHERE profile_id = ?`)
    .bind(profileId, new Date().toISOString(), profileId)];
  if (invalidateCache) statements.push(
    env.DB.prepare("DELETE FROM vnext_shadow_projection_caches WHERE profile_id = ?").bind(profileId),
  );
  await env.DB.batch(statements);
  return Number(await env.DB.prepare("SELECT change_cursor FROM vnext_shadow_sync_heads WHERE profile_id = ?")
    .bind(profileId).first("change_cursor") ?? 0);
};

const deltaPage = async (env, profileId, cursor, limit, serverCursor, responseBase) => {
  const found = await rows(env.DB.prepare(`SELECT sequence, entity_kind, entity_id, payload_hash,
    migration_run_id, payload_json FROM vnext_shadow_changes
    WHERE profile_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?`)
    .bind(profileId, cursor, limit + 1));
  const changes = [];
  let byteTruncated = false;
  for (const row of found.slice(0, limit)) {
    const change = {
      kind: row.entity_kind,
      id: row.entity_id,
      hash: row.payload_hash,
      payload: parseJson(row.payload_json, "vNext sync change"),
      ...(row.migration_run_id ? { migrationRunId: row.migration_run_id } : {}),
    };
    const candidate = {
      ...responseBase,
      cursor: Number(row.sequence),
      hasMore: true,
      changes: [...changes, change],
    };
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_DELTA_RESPONSE_BYTES) {
      if (!changes.length) {
        problem(413, "vnext-delta-item-too-large", "A stored shadow-sync item exceeds the response limit.");
      }
      byteTruncated = true;
      break;
    }
    changes.push(change);
  }
  const hasMore = byteTruncated || found.length > changes.length;
  return {
    cursor: hasMore ? Number(found[changes.length - 1]?.sequence ?? cursor) : Math.max(cursor, serverCursor),
    hasMore,
    changes,
  };
};

const plannedAcknowledgement = (plan, row, fallback = "duplicate") => {
  const decision = plan.decisions.get(`${row.kind}:${row.id}`);
  return decision?.row.hash === row.hash && decision.status === "inserted" ? "inserted" : fallback;
};

const classifyCommittedUploads = async (env, profileId, uploads, plan) => {
  const acknowledged = [];
  const conflicts = [];
  const immutableRows = uploads.filter((row) => IMMUTABLE_KINDS.has(row.kind));
  const immutableHashes = await hashesByEntity(env, profileId, immutableRows);
  const head = await currentHead(env, profileId);
  const currentReset = currentResetRow(head, profileId);
  const currentIntent = await getCurrentIntents(env, profileId);
  const migrationRows = uploads.filter((row) => row.kind === "migration-run");
  const relevantRunIds = [...new Set([
    ...migrationRows.map((row) => row.id),
    ...uploads.map((row) => row.migrationRunId).filter(Boolean),
  ])];
  const currentRuns = await getMigrationRuns(env, profileId, relevantRunIds);
  const rolledBackRefs = await getRolledBackRefs(env, profileId, immutableRows);

  for (const row of uploads) {
    const key = `${row.kind}:${row.id}`;
    if (IMMUTABLE_KINDS.has(row.kind)) {
      const hashes = immutableHashes.get(key) ?? new Set();
      if (hashes.has(row.hash)) {
        acknowledged.push({ kind: row.kind, id: row.id, status: plannedAcknowledgement(plan, row) });
        continue;
      }
      if (hashes.size) {
        conflicts.push(conflict(row, "immutable-id-conflict", String([...hashes][0])));
        continue;
      }
      if (row.kind === "legacy-snapshot") {
        const sameSource = await sourceFingerprintSnapshot(env, profileId,
          row.metadata.snapshot.converterVersion, row.metadata.snapshot.sourceFingerprint);
        if (sameSource) {
          conflicts.push(conflict(row, "immutable-id-conflict", String(sameSource.payload_hash)));
          continue;
        }
      }
      if ((row.kind === "evidence-event" || row.kind === "session-record") && currentReset &&
        row.metadata.fact.milliseconds <= currentReset.metadata.reset.reset.milliseconds) {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-reset" });
        continue;
      }
      if (rolledBackRefs.has(key) || (row.migrationRunId && currentRuns.get(row.migrationRunId)?.status === "rolled-back")) {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-older" });
        continue;
      }
      conflicts.push(conflict(row, "invalid-reference"));
      continue;
    }

    if (row.kind === "athlete-intent") {
      if (String(currentIntent?.payload_hash ?? "") === row.hash) {
        acknowledged.push({ kind: row.kind, id: row.id, status: plannedAcknowledgement(plan, row) });
      } else if (currentIntent && Number(currentIntent.updated_at_ms) > row.metadata.intent.updated.milliseconds) {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-older" });
      } else if (currentIntent && Number(currentIntent.updated_at_ms) === row.metadata.intent.updated.milliseconds) {
        conflicts.push(conflict(row, "intent-timestamp-conflict", String(currentIntent.payload_hash)));
      } else if (row.migrationRunId && currentRuns.get(row.migrationRunId)?.status === "rolled-back") {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-older" });
      } else {
        conflicts.push(conflict(row, "invalid-reference"));
      }
      continue;
    }

    if (row.kind === "reset-tombstone") {
      if (currentReset?.hash === row.hash) {
        acknowledged.push({ kind: row.kind, id: row.id, status: plannedAcknowledgement(plan, row) });
      } else if (currentReset && compareReset(row, currentReset) < 0) {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-older" });
      } else {
        conflicts.push(conflict(row, "invalid-reference", currentReset?.hash));
      }
      continue;
    }

    if (row.kind === "migration-run") {
      const current = currentRuns.get(row.id);
      if (String(current?.payload_hash ?? "") === row.hash) {
        acknowledged.push({ kind: row.kind, id: row.id, status: plannedAcknowledgement(plan, row) });
      } else if (current && stableMigrationJson(parseJson(current.payload_json, "migration run")) !== stableMigrationJson(row.payload)) {
        conflicts.push(conflict(row, "immutable-id-conflict", String(current.payload_hash)));
      } else if (current?.status === "rolled-back" && row.metadata.migration.status === "active") {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-older" });
      } else if (current?.status === "rolled-back" && row.metadata.migration.status === "rolled-back" &&
        compareCodeUnits(String(current.payload_hash), row.hash) < 0) {
        acknowledged.push({ kind: row.kind, id: row.id, status: "ignored-older" });
      } else if (!current) {
        const sameSource = await sourceFingerprintRun(env, profileId,
          row.metadata.migration.converterVersion, row.metadata.migration.sourceFingerprint);
        if (sameSource) conflicts.push(conflict(row, "immutable-id-conflict", String(sameSource.payload_hash)));
        else conflicts.push(conflict(row, "invalid-reference"));
      } else {
        conflicts.push(conflict(row, "invalid-reference", String(current.payload_hash)));
      }
    }
  }
  return { acknowledged, conflicts };
};

const responseFor = async (env, profileId, cursor, limit, acknowledged, conflicts) => {
  const head = await currentHead(env, profileId);
  const serverCursor = Number(head?.change_cursor ?? 0);
  const responseBase = {
    schemaVersion: SCHEMA_VERSION,
    ...(head?.reset_payload_json ? { resetTombstone: parseJson(head.reset_payload_json, "reset tombstone") } : {}),
    acknowledged,
    conflicts,
  };
  const delta = await deltaPage(env, profileId, cursor, limit, serverCursor, responseBase);
  const response = { ...responseBase, cursor: delta.cursor, hasMore: delta.hasMore, changes: delta.changes };
  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > MAX_DELTA_RESPONSE_BYTES) {
    problem(413, "vnext-delta-too-large", "The shadow-sync response exceeds its byte limit.");
  }
  return response;
};

const persistPlan = async (env, profileId, plan) => {
  const inserted = [...plan.decisions.values()].filter(({ status }) => status === "inserted").map(({ row }) => row);
  const insertedReset = inserted.filter((row) => row.kind === "reset-tombstone");
  const winningReset = plan.effectiveReset && insertedReset.includes(plan.effectiveReset) ? plan.effectiveReset : null;
  if (winningReset) await persistReset(env, profileId, winningReset);

  await insertRows(env, profileId, inserted.filter((row) => row.kind === "legacy-snapshot"), snapshotStatement);
  await insertRows(env, profileId, inserted.filter((row) => row.kind === "migration-run" &&
    row.metadata.migration.status === "active"), migrationStatement);
  const activeRunRequests = plan.normalized.filter((row) => row.kind === "migration-run"
    && row.metadata.migration.status === "active"
    && plan.effectiveRuns.get(row.id)?.status === "active");
  for (const activeRun of activeRunRequests) await activateMigrationOwnership(env, profileId, activeRun);
  await insertRows(env, profileId, inserted.filter((row) => row.kind === "athlete-intent"), intentStatement);
  await insertRows(env, profileId, inserted.filter((row) => row.kind === "session-plan"), planStatement);
  await insertRows(env, profileId, inserted.filter((row) => row.kind === "evidence-event"), eventStatement);
  await insertRows(env, profileId, inserted.filter((row) => row.kind === "session-record"), recordStatement);
  const rollbacks = inserted.filter((row) => row.kind === "migration-run" &&
    row.metadata.migration.status === "rolled-back");
  await insertRows(env, profileId, rollbacks, migrationStatement);
  const requestedRollbacks = plan.normalized.filter((row) => row.kind === "migration-run" &&
    row.metadata.migration.status === "rolled-back");
  for (const rollback of await authoritativeRollbackRows(env, profileId, requestedRollbacks)) {
    await applyRollback(env, profileId, rollback);
  }

  return refreshCursor(env, profileId, inserted.length > 0 || requestedRollbacks.length > 0);
};

/**
 * Additive authenticated shadow delta. The existing Worker supplies its
 * bounded JSON reader and response helper, so this module owns no credentials,
 * request globals or production profile authority.
 */
export async function handleVNextShadowSync(request, env, origin, account, helpers) {
  try {
    const body = object(await helpers.readJson(request), "request body");
    if (body.schemaVersion !== SCHEMA_VERSION) problem(400, "vnext-schema-version", "Unsupported shadow-sync schema version.");
    const cursor = nonNegativeInteger(body.cursor, "cursor");
    const limit = nonNegativeInteger(body.limit, "limit");
    if (limit < 1 || limit > MAX_DELTA_ITEMS) problem(400, "vnext-delta-limit", `limit must be 1-${MAX_DELTA_ITEMS}.`);
    if (!Array.isArray(body.upload) || body.upload.length > MAX_UPLOAD_ITEMS) {
      problem(413, "vnext-upload-limit", `upload must contain at most ${MAX_UPLOAD_ITEMS} items.`);
    }
    const profileId = String(account.profile_id);
    await ensureHead(env, profileId);
    const head = await currentHead(env, profileId);
    if (cursor > Number(head?.change_cursor ?? 0)) {
      problem(409, "vnext-cursor-ahead", "The client cursor is ahead of this account's server cursor.");
    }
    const normalized = await Promise.all(body.upload.map((item) => normalizeItem(item, profileId)));
    // The live v1.2 profile cutoff remains a hard lower bound even when a
    // stale device includes its own reset head in the same request.
    const legacyReset = await legacyResetItem(account, profileId);
    const planned = await planRequest(env, profileId, legacyReset ? [...normalized, legacyReset] : normalized, head);
    if (planned.conflicts.length) {
      const resetDecision = legacyReset
        ? planned.decisions.get(`reset-tombstone:${profileId}`)
        : null;
      if (legacyReset && resetDecision?.row.hash === legacyReset.hash && resetDecision.status === "inserted") {
        await persistReset(env, profileId, legacyReset);
        await refreshCursor(env, profileId, true);
      }
      return helpers.json(await responseFor(env, profileId, cursor, limit, [], planned.conflicts), 200, origin);
    }
    await persistPlan(env, profileId, planned);
    const committed = await classifyCommittedUploads(env, profileId, normalized, planned);
    if (committed.conflicts.length) {
      return helpers.json(await responseFor(env, profileId, cursor, limit, [], committed.conflicts), 200, origin);
    }
    await clearNativeDependencyRevocations(env, profileId, normalized);
    return helpers.json(await responseFor(env, profileId, cursor, limit, committed.acknowledged, []), 200, origin);
  } catch (error) {
    if (error instanceof RequestProblem) {
      return helpers.json({ error: error.message, code: error.code }, error.status, origin);
    }
    throw error;
  }
}

export const vNextShadowSyncContract = Object.freeze({
  path: "/vnext/shadow/sync",
  schemaVersion: SCHEMA_VERSION,
  maximumUploadItems: MAX_UPLOAD_ITEMS,
  maximumDeltaItems: MAX_DELTA_ITEMS,
  maximumItemBytes: MAX_SYNC_ITEM_BYTES,
  maximumResponseBytes: MAX_DELTA_RESPONSE_BYTES,
});
