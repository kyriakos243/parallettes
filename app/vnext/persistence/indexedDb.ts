import {
  isStableId,
  type AthleteEvidenceEvent,
  type AthleteId,
  type AthleteIntent,
  type DefinitionVersion,
  type IsoTimestamp,
  type ProjectionVersion,
  type SessionPlan,
  type SessionRecord,
} from "../contracts";
import {
  validateAthleteEvidenceEvent,
  validateAthleteIntent,
  validateDerivedAthleteState,
  validateSessionPlan,
  validateSessionRecord,
  type ValidationResult,
} from "../validation";
import { assertAssessmentDraft, type AssessmentDraft } from "../assessment/contracts";
import { canonicalJson, sha256 } from "./canonical";
import { verifyLegacyMigrationSnapshot } from "./legacyMigration";
import {
  LEGACY_V12_CONVERTER_VERSION,
  VNEXT_PERSISTENCE_SCHEMA_VERSION,
  type AppendResult,
  type EntityConflict,
  type ImmutableEntityKind,
  type ImmutableEntityProvenance,
  type LegacyConversion,
  type LegacyMigrationSnapshot,
  type MigrationRun,
  type ObservationExportBundle,
  type ProjectionCacheEntry,
  type ProjectionCacheLookup,
  type ProjectionSources,
  type SyncDeltaResponse,
  type SyncEntityKind,
  type SyncUploadItem,
  type TrainingResetTombstone,
  type VNextShadowStore,
} from "./contracts";

/** Kept separate so an old v1.2 client can always open its version-2 profile DB. */
export const VNEXT_SHADOW_DATABASE_NAME = "parallette25-vnext-shadow";
export const VNEXT_SHADOW_DATABASE_VERSION = 2;

const STORES = {
  events: "evidence-events",
  plans: "session-plans",
  records: "session-records",
  intent: "athlete-intent",
  reset: "reset-tombstones",
  outbox: "outbox",
  sync: "sync-state",
  cache: "derived-cache",
  snapshots: "legacy-snapshots",
  runs: "migration-runs",
  assessmentDrafts: "assessment-drafts",
} as const;

type StoreName = typeof STORES[keyof typeof STORES];

type StoredEntity<T> = {
  athleteId: AthleteId;
  id: string;
  hash: string;
  payload: T;
  migrationRunId?: string;
};

type StoredMutable<T> = {
  athleteId: AthleteId;
  hash: string;
  payload: T;
  migrationRunId?: string;
};

type StoredOutbox = SyncUploadItem & { athleteId: AthleteId };
type StoredSyncState = { athleteId: AthleteId; cursor: number };

export class VNextEntityConflictError extends Error {
  readonly conflict: EntityConflict;

  constructor(conflict: EntityConflict) {
    super(`${conflict.reason}: ${conflict.kind}/${conflict.id}`);
    this.name = "VNextEntityConflictError";
    this.conflict = conflict;
  }
}

export type VNextShadowStoreOptions = Readonly<{
  databaseName?: string;
  indexedDB?: IDBFactory;
}>;

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
});

const abortWith = (transaction: IDBTransaction, error: unknown): never => {
  try {
    transaction.abort();
  } catch {
    // The transaction may already have been aborted by IndexedDB.
  }
  throw error;
};

const assertValid = (label: string, result: ValidationResult): void => {
  if (result.valid) return;
  const detail = result.issues.slice(0, 4).map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  throw new TypeError(`Invalid ${label}: ${detail}`);
};

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RESET_KEYS = new Set(["schemaVersion", "id", "athleteId", "resetAt", "recordedAt", "source"]);
const SNAPSHOT_KEYS = new Set([
  "schemaVersion", "id", "athleteId", "converterVersion", "sourceVersion", "sourceFingerprint",
  "capturedAt", "resetAt", "sourceProfile",
]);
const RUN_KEYS = new Set([
  "schemaVersion", "id", "athleteId", "converterVersion", "sourceVersion", "snapshotId",
  "sourceFingerprint", "createdAt", "status", "generatedEntities", "warnings", "rolledBackAt",
]);
const NATIVE_PROVENANCE_KEYS = new Set(["kind", "id", "origin"]);
const MIGRATION_PROVENANCE_KEYS = new Set(["kind", "id", "origin", "migrationRunId"]);
const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "authorization", "password", "passwordhash", "passwordsalt", "recoverycode", "recoveryhash",
  "token", "tokenhash", "accesstoken", "refreshtoken", "sessiontoken", "authtoken", "bearertoken",
  "apikey", "apisecret", "clientsecret", "privatekey", "secretkey", "cookie", "setcookie",
]);

const isIsoTimestamp = (value: unknown): value is IsoTimestamp => {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const assertNonEmptyString: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`Invalid ${label}`);
};

const assertExactKeys = (value: object, allowed: ReadonlySet<string>, label: string): void => {
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) throw new TypeError(`${label} contains unsupported field ${extra}`);
};

const containsForbiddenSnapshotKey = (value: unknown, visited = new WeakSet<object>()): boolean => {
  if (!value || typeof value !== "object") return false;
  if (visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.some((item) => containsForbiddenSnapshotKey(item, visited));
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.normalize("NFKC").toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/gu, "");
    return FORBIDDEN_SNAPSHOT_KEYS.has(normalizedKey) || containsForbiddenSnapshotKey(child, visited);
  });
};

const assertStableId: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (!isStableId(value)) throw new TypeError(`Invalid ${label}`);
};

const assertSha256: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new TypeError(`Invalid ${label}`);
};

const assertPositiveVersion: (
  value: unknown,
  label: string,
) => asserts value is DefinitionVersion | ProjectionVersion = (value, label) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new TypeError(`Invalid ${label}`);
};

const validateReset = (value: TrainingResetTombstone): void => {
  if (!value || typeof value !== "object") throw new TypeError("Invalid reset tombstone");
  assertExactKeys(value, RESET_KEYS, "Reset tombstone");
  if (value.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION) throw new TypeError("Invalid reset schema version");
  assertStableId(value.id, "reset ID");
  assertStableId(value.athleteId, "reset athlete ID");
  if (!isIsoTimestamp(value.resetAt) || !isIsoTimestamp(value.recordedAt)) throw new TypeError("Invalid reset timestamp");
  if (Date.parse(value.recordedAt) < Date.parse(value.resetAt)) throw new TypeError("Reset recording cannot predate its cutoff");
  if (!["athlete-reset", "legacy-v1.2", "import", "sync"].includes(value.source)) throw new TypeError("Invalid reset source");
};

const validateSnapshotShape = (value: LegacyMigrationSnapshot): void => {
  if (!value || typeof value !== "object") throw new TypeError("Invalid legacy snapshot");
  assertExactKeys(value, SNAPSHOT_KEYS, "Legacy snapshot");
  if (value.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION
    || value.converterVersion !== LEGACY_V12_CONVERTER_VERSION
    || value.sourceVersion !== "1.2") {
    throw new TypeError("Invalid legacy snapshot version");
  }
  assertStableId(value.id, "snapshot ID");
  assertStableId(value.athleteId, "snapshot athlete ID");
  assertSha256(value.sourceFingerprint, "snapshot fingerprint");
  if (!isIsoTimestamp(value.capturedAt) || (value.resetAt !== undefined && !isIsoTimestamp(value.resetAt))) {
    throw new TypeError("Invalid legacy snapshot timestamp");
  }
  if (!value.sourceProfile || typeof value.sourceProfile !== "object") throw new TypeError("Invalid legacy snapshot source");
  if (value.sourceProfile.profileId !== value.athleteId) throw new TypeError("Legacy snapshot profile/athlete mismatch");
  if (containsForbiddenSnapshotKey(value.sourceProfile)) {
    throw new TypeError("Legacy snapshot source contains forbidden credential or session metadata");
  }
};

const validateSnapshot = async (value: LegacyMigrationSnapshot): Promise<void> => {
  validateSnapshotShape(value);
  if (!await verifyLegacyMigrationSnapshot(value)) {
    throw new TypeError("Legacy snapshot failed deterministic identity or source validation");
  }
};

const validateRun = (value: MigrationRun): void => {
  if (!value || typeof value !== "object") throw new TypeError("Invalid migration run");
  assertExactKeys(value, RUN_KEYS, "Migration run");
  if (value.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION
    || value.converterVersion !== LEGACY_V12_CONVERTER_VERSION
    || value.sourceVersion !== "1.2") {
    throw new TypeError("Invalid migration run version");
  }
  assertStableId(value.id, "migration run ID");
  assertStableId(value.athleteId, "migration run athlete ID");
  assertStableId(value.snapshotId, "migration snapshot ID");
  assertSha256(value.sourceFingerprint, "migration source fingerprint");
  if (!isIsoTimestamp(value.createdAt) || (value.rolledBackAt !== undefined && !isIsoTimestamp(value.rolledBackAt))) {
    throw new TypeError("Invalid migration run timestamp");
  }
  if (value.status !== "active" && value.status !== "rolled-back") throw new TypeError("Invalid migration run status");
  if (value.status === "active" && value.rolledBackAt !== undefined) {
    throw new TypeError("Active migration run cannot have a rollback timestamp");
  }
  if (value.status === "rolled-back" && value.rolledBackAt === undefined) {
    throw new TypeError("Rolled-back migration run requires a rollback timestamp");
  }
  if (value.rolledBackAt !== undefined && compareTime(value.rolledBackAt, value.createdAt) < 0) {
    throw new TypeError("Migration rollback cannot predate the run");
  }
  if (!Array.isArray(value.generatedEntities) || !Array.isArray(value.warnings)) throw new TypeError("Invalid migration run contents");
  if (value.warnings.some((warning) => typeof warning !== "string" || warning.trim() === "")) {
    throw new TypeError("Invalid migration run warning");
  }
  const refs = new Set<string>();
  for (const ref of value.generatedEntities) {
    if (!["evidence-event", "session-plan", "session-record"].includes(ref.kind)) throw new TypeError("Invalid migration entity kind");
    assertStableId(ref.id, "migration entity ID");
    const key = `${ref.kind}:${ref.id}`;
    if (refs.has(key)) throw new TypeError(`Duplicate migration entity reference ${key}`);
    refs.add(key);
  }
};

const validateDeterministicRunId = async (run: MigrationRun): Promise<void> => {
  const expectedId = `legacy-v12-run-${await sha256({
    converterVersion: run.converterVersion,
    sourceIdentity: `${run.athleteId}\u0000${run.sourceFingerprint}`,
  })}`;
  if (run.id !== expectedId) throw new TypeError("Migration run ID does not match its deterministic source identity");
};

const validateRunSnapshotRelationship = (
  run: MigrationRun,
  snapshot: LegacyMigrationSnapshot,
): void => {
  if (run.athleteId !== snapshot.athleteId
    || run.snapshotId !== snapshot.id
    || run.converterVersion !== snapshot.converterVersion
    || run.sourceVersion !== snapshot.sourceVersion
    || run.sourceFingerprint !== snapshot.sourceFingerprint
    || run.createdAt !== snapshot.capturedAt) {
    throw conflict("migration-run", run.id, "invalid-reference");
  }
};

const validateImmutableProvenance = (value: ImmutableEntityProvenance): void => {
  if (!value || typeof value !== "object") throw new TypeError("Invalid immutable entity provenance");
  if (!(["evidence-event", "session-plan", "session-record"] as const).includes(value.kind)) {
    throw new TypeError("Invalid immutable provenance kind");
  }
  assertStableId(value.id, "immutable provenance entity ID");
  if (value.origin === "native") {
    assertExactKeys(value, NATIVE_PROVENANCE_KEYS, "Native immutable provenance");
    return;
  }
  if (value.origin !== "legacy-v1.2") throw new TypeError("Invalid immutable provenance origin");
  assertExactKeys(value, MIGRATION_PROVENANCE_KEYS, "Legacy immutable provenance");
  assertStableId(value.migrationRunId, "immutable provenance migration run ID");
};

const eventStore = (kind: ImmutableEntityKind): StoreName => kind === "evidence-event"
  ? STORES.events
  : kind === "session-plan"
    ? STORES.plans
    : STORES.records;

const kindForStore = (store: StoreName): SyncEntityKind => store === STORES.events
  ? "evidence-event"
  : store === STORES.plans
    ? "session-plan"
    : store === STORES.records
      ? "session-record"
      : store === STORES.intent
        ? "athlete-intent"
        : store === STORES.reset
          ? "reset-tombstone"
          : "migration-run";

const outboxKey = (athleteId: AthleteId, kind: SyncEntityKind, id: string): IDBValidKey => [athleteId, kind, id];
const entityKey = (athleteId: AthleteId, id: string): IDBValidKey => [athleteId, id];

const conflict = (
  kind: SyncEntityKind,
  id: string,
  reason: EntityConflict["reason"],
  localHash?: string,
  incomingHash?: string,
): VNextEntityConflictError => new VNextEntityConflictError({ kind, id, reason, localHash, incomingHash });

const compareTime = (left: IsoTimestamp, right: IsoTimestamp): number => Date.parse(left) - Date.parse(right);
const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const sameAthlete = (expected: AthleteId, actual: AthleteId, label: string): void => {
  if (expected !== actual) throw conflict("session-record", label, "invalid-reference");
};

const validatePlanRecordPair = (plan: SessionPlan, record: SessionRecord): void => {
  assertValid("Session Plan", validateSessionPlan(plan));
  assertValid("Session Record", validateSessionRecord(record));
  if (plan.athleteId !== record.athleteId || plan.id !== record.planId) {
    throw conflict("session-record", record.id, "invalid-reference");
  }
  const itemIds = new Set(plan.items.map((item) => item.id));
  if (record.itemOutcomes.some((item) => !itemIds.has(item.planItemId))) {
    throw conflict("session-record", record.id, "invalid-reference");
  }
  if (plan.legacySource?.sourceSessionId !== record.legacySource?.sourceSessionId) {
    if (plan.legacySource !== undefined || record.legacySource !== undefined) {
      throw conflict("session-record", record.id, "invalid-reference");
    }
  }
};

const openDatabase = (factory: IDBFactory, name: string): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = factory.open(name, VNEXT_SHADOW_DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    const compoundStores = [STORES.events, STORES.plans, STORES.records, STORES.outbox, STORES.snapshots, STORES.runs];
    for (const storeName of compoundStores) {
      if (database.objectStoreNames.contains(storeName)) continue;
      const keyPath = storeName === STORES.outbox ? ["athleteId", "kind", "id"] : ["athleteId", "id"];
      const store = database.createObjectStore(storeName, { keyPath });
      store.createIndex("by-athlete", "athleteId", { unique: false });
    }
    for (const storeName of [STORES.intent, STORES.reset, STORES.sync, STORES.cache, STORES.assessmentDrafts]) {
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "athleteId" });
    }
  };
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error ?? new Error("Unable to open vNext shadow database"));
  request.onblocked = () => reject(new Error("vNext shadow database upgrade is blocked"));
});

const allForAthlete = async <T>(transaction: IDBTransaction, storeName: StoreName, athleteId: AthleteId): Promise<T[]> => {
  const store = transaction.objectStore(storeName);
  if (store.indexNames.contains("by-athlete")) {
    return requestResult(store.index("by-athlete").getAll(IDBKeyRange.only(athleteId))) as Promise<T[]>;
  }
  const value = await requestResult(store.get(athleteId)) as T | undefined;
  return value === undefined ? [] : [value];
};

const deleteForAthlete = async (transaction: IDBTransaction, storeName: StoreName, athleteId: AthleteId): Promise<void> => {
  const store = transaction.objectStore(storeName);
  if (!store.indexNames.contains("by-athlete")) {
    await requestResult(store.delete(athleteId));
    return;
  }
  const keys = await requestResult(store.index("by-athlete").getAllKeys(IDBKeyRange.only(athleteId)));
  await Promise.all(keys.map((key) => requestResult(store.delete(key))));
};

const putOutbox = async (
  transaction: IDBTransaction,
  athleteId: AthleteId,
  item: SyncUploadItem,
): Promise<void> => {
  const stored: StoredOutbox = { athleteId, ...item };
  await requestResult(transaction.objectStore(STORES.outbox).put(stored));
};

const invalidateCache = async (transaction: IDBTransaction, athleteId: AthleteId): Promise<void> => {
  await requestResult(transaction.objectStore(STORES.cache).delete(athleteId));
};

const storedPayloads = <T>(rows: readonly StoredEntity<T>[]): T[] => rows.map((row) => row.payload);

const migrationClaimKey = (kind: ImmutableEntityKind, id: string): string => `${kind}:${id}`;

const activeMigrationClaims = (
  runs: readonly StoredEntity<MigrationRun>[],
  excludedRunId?: string,
): ReadonlySet<string> => new Set(runs.flatMap((row) =>
  row.id !== excludedRunId && row.payload.status === "active"
    ? row.payload.generatedEntities.map((ref) => migrationClaimKey(ref.kind, ref.id))
    : []));

const isActiveImmutableRow = (
  kind: ImmutableEntityKind,
  row: Pick<StoredEntity<unknown>, "id" | "migrationRunId">,
  activeClaims: ReadonlySet<string>,
): boolean => row.migrationRunId === undefined || activeClaims.has(migrationClaimKey(kind, row.id));

const immutableProvenance = (
  kind: ImmutableEntityKind,
  row: Pick<StoredEntity<unknown>, "id" | "migrationRunId">,
): ImmutableEntityProvenance => row.migrationRunId === undefined
  ? { kind, id: row.id, origin: "native" }
  : { kind, id: row.id, origin: "legacy-v1.2", migrationRunId: row.migrationRunId };

const eventDependencyId = (event: AthleteEvidenceEvent): AthleteEvidenceEvent["id"] | undefined => event.type === "evidence_corrected"
  ? event.supersedesEventId
  : event.type === "restriction_cleared"
    ? event.restrictionEventId
    : undefined;

const isSuppressedEvent = (event: AthleteEvidenceEvent, resetAt?: IsoTimestamp): boolean => resetAt !== undefined
  && compareTime(event.occurredAt, resetAt) <= 0;

const isSuppressedRecord = (record: SessionRecord, resetAt?: IsoTimestamp): boolean => resetAt !== undefined
  && compareTime(record.completedAt, resetAt) <= 0;

const filterLinkedEvents = (events: readonly AthleteEvidenceEvent[]): AthleteEvidenceEvent[] => {
  let retained = [...events];
  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set(retained.map((event) => event.id));
    const next = retained.filter((event) => {
      const target = event.type === "evidence_corrected"
        ? event.supersedesEventId
        : event.type === "restriction_cleared"
          ? event.restrictionEventId
          : undefined;
      return target === undefined || ids.has(target);
    });
    if (next.length !== retained.length) changed = true;
    retained = next;
  }
  return retained;
};

const filterLinkedRecords = (records: readonly SessionRecord[]): SessionRecord[] => {
  let retained = [...records];
  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set(retained.map((record) => record.id));
    const next = retained.filter((record) => record.supersedesRecordId === undefined || ids.has(record.supersedesRecordId));
    if (next.length !== retained.length) changed = true;
    retained = next;
  }
  return retained;
};

const activeEventsWithDependencies = (
  rows: readonly StoredEntity<AthleteEvidenceEvent>[],
  activeClaims: ReadonlySet<string>,
  resetAt?: IsoTimestamp,
): AthleteEvidenceEvent[] => {
  const available = new Map(rows
    .filter((row) => !isSuppressedEvent(row.payload, resetAt))
    .map((row) => [row.id, row] as const));
  const retained = new Map([...available.values()]
    .filter((row) => isActiveImmutableRow("evidence-event", row, activeClaims))
    .map((row) => [row.id, row] as const));
  const pending = [...retained.values()];
  while (pending.length) {
    const targetId = eventDependencyId(pending.pop()!.payload);
    if (!targetId || retained.has(targetId)) continue;
    const target = available.get(targetId);
    if (target) {
      retained.set(target.id, target);
      pending.push(target);
    }
  }
  return filterLinkedEvents([...retained.values()].map((row) => row.payload));
};

const activeRecordsWithDependencies = (
  rows: readonly StoredEntity<SessionRecord>[],
  activeClaims: ReadonlySet<string>,
  resetAt?: IsoTimestamp,
): SessionRecord[] => {
  const available = new Map(rows
    .filter((row) => !isSuppressedRecord(row.payload, resetAt))
    .map((row) => [row.id, row] as const));
  const retained = new Map([...available.values()]
    .filter((row) => isActiveImmutableRow("session-record", row, activeClaims))
    .map((row) => [row.id, row] as const));
  const pending = [...retained.values()];
  while (pending.length) {
    const targetId = pending.pop()?.payload.supersedesRecordId;
    if (!targetId || retained.has(targetId)) continue;
    const target = available.get(targetId);
    if (target) {
      retained.set(target.id, target);
      pending.push(target);
    }
  }
  return filterLinkedRecords([...retained.values()].map((row) => row.payload));
};

/**
 * Session Records form one immutable correction chain per Session Plan. A
 * second root would double-count one prescribed workout, while two children
 * of the same record would make the effective correction device-order
 * dependent. Validate the complete active set rather than relying on append
 * order so imports and sync pages are held to the same invariant.
 */
const assertLinearSessionRecordSet = (
  records: readonly SessionRecord[],
): void => {
  const recordsByPlan = new Map<string, SessionRecord[]>();
  for (const record of records) {
    const group = recordsByPlan.get(record.planId) ?? [];
    group.push(record);
    recordsByPlan.set(record.planId, group);
  }

  for (const [planId, planRecords] of recordsByPlan) {
    const byId = new Map(planRecords.map((record) => [record.id, record] as const));
    if (byId.size !== planRecords.length) {
      throw conflict("session-record", planId, "immutable-id-conflict");
    }
    const roots = planRecords.filter((record) => record.supersedesRecordId === undefined);
    if (roots.length !== 1) throw conflict("session-record", planId, "invalid-reference");

    const childByParent = new Map<string, SessionRecord>();
    for (const record of planRecords) {
      const parentId = record.supersedesRecordId;
      if (!parentId) continue;
      const parent = byId.get(parentId);
      if (!parent || parent.planId !== planId || childByParent.has(parentId)) {
        throw conflict("session-record", record.id, "invalid-reference");
      }
      childByParent.set(parentId, record);
    }

    const visited = new Set<string>();
    let cursor: SessionRecord | undefined = roots[0];
    while (cursor) {
      if (visited.has(cursor.id)) throw conflict("session-record", cursor.id, "invalid-reference");
      visited.add(cursor.id);
      cursor = childByParent.get(cursor.id);
    }
    if (visited.size !== planRecords.length) {
      const disconnected = planRecords.find((record) => !visited.has(record.id));
      throw conflict("session-record", disconnected?.id ?? planId, "invalid-reference");
    }
  }
};

const assertLinearSessionRecordAppend = (
  record: SessionRecord,
  recordHash: string,
  rows: readonly StoredEntity<SessionRecord>[],
  activeClaims: ReadonlySet<string>,
  resetAt?: IsoTimestamp,
): void => {
  const existing = rows.find((row) => row.id === record.id);
  if (existing) {
    if (existing.hash === recordHash) return;
    throw conflict("session-record", record.id, "immutable-id-conflict", existing.hash, recordHash);
  }

  // Treat a native append as active immediately. If it corrects a quarantined
  // converter record, activeRecordsWithDependencies deliberately retains that
  // target as an immutable dependency without reactivating converter evidence.
  const combined: StoredEntity<SessionRecord>[] = [
    ...rows,
    { athleteId: record.athleteId, id: record.id, hash: recordHash, payload: record },
  ];
  assertLinearSessionRecordSet(activeRecordsWithDependencies(combined, activeClaims, resetAt));
};

const sortById = <T extends { id: string }>(values: readonly T[]): T[] => [...values]
  .sort((left, right) => compareCodeUnits(left.id, right.id));

const validateCacheLookup = (lookup: ProjectionCacheLookup): void => {
  assertStableId(lookup.athleteId, "cache athlete ID");
  if (!isIsoTimestamp(lookup.asOf)) throw new TypeError("Invalid cache projection cutoff");
  assertPositiveVersion(lookup.projectionVersion, "cache projection version");
  assertPositiveVersion(lookup.catalogueVersion, "cache catalogue version");
  assertSha256(lookup.definitionFingerprint, "cache definition fingerprint");
  assertStableId(lookup.policyId, "cache policy ID");
  assertPositiveVersion(lookup.policyVersion, "cache policy version");
  assertSha256(lookup.sourceFingerprint, "cache source fingerprint");
  assertSha256(lookup.trainabilityRequestFingerprint, "cache trainability-request fingerprint");
  if (lookup.resetAt !== undefined && !isIsoTimestamp(lookup.resetAt)) throw new TypeError("Invalid cache reset timestamp");
};

const cacheIdentityMatches = (
  entry: ProjectionCacheEntry,
  lookup: ProjectionCacheLookup,
): boolean => entry.athleteId === lookup.athleteId
  && entry.asOf === lookup.asOf
  && entry.projectionVersion === lookup.projectionVersion
  && entry.catalogueVersion === lookup.catalogueVersion
  && entry.definitionFingerprint === lookup.definitionFingerprint
  && entry.policyId === lookup.policyId
  && entry.policyVersion === lookup.policyVersion
  && entry.sourceFingerprint === lookup.sourceFingerprint
  && entry.trainabilityRequestFingerprint === lookup.trainabilityRequestFingerprint
  && entry.resetAt === lookup.resetAt;

const outboxPriority = (item: StoredOutbox): number => item.kind === "legacy-snapshot"
  ? 0
  : item.kind === "reset-tombstone"
    ? 1
    : item.kind === "migration-run"
      ? 2
      : item.kind === "athlete-intent"
        ? 3
        : item.kind === "session-plan"
          ? 4
          : item.kind === "session-record"
            ? 5
            : 6;

const outboxRowKey = (item: Pick<StoredOutbox, "kind" | "id">): string => `${item.kind}:${item.id}`;

const compareOutboxRows = (left: StoredOutbox, right: StoredOutbox): number =>
  outboxPriority(left) - outboxPriority(right)
  || compareCodeUnits(left.kind, right.kind)
  || compareCodeUnits(left.id, right.id);

const pendingDependencyKeys = (
  item: StoredOutbox,
  pending: ReadonlySet<string>,
): readonly string[] => {
  const candidates: string[] = [];
  if (item.kind === "migration-run") {
    candidates.push(`legacy-snapshot:${(item.payload as MigrationRun).snapshotId}`);
  }
  if (item.migrationRunId && ["athlete-intent", "evidence-event", "session-plan", "session-record"].includes(item.kind)) {
    candidates.push(`migration-run:${item.migrationRunId}`);
  }
  if (item.kind === "evidence-event") {
    const event = item.payload as AthleteEvidenceEvent;
    const targetId = eventDependencyId(event);
    if (targetId) candidates.push(`evidence-event:${targetId}`);
  }
  if (item.kind === "session-record") {
    const record = item.payload as SessionRecord;
    candidates.push(`session-plan:${record.planId}`);
    if (record.supersedesRecordId) candidates.push(`session-record:${record.supersedesRecordId}`);
  }
  return [...new Set(candidates.filter((key) => pending.has(key)))];
};

/**
 * Stable Kahn ordering keeps every pending dependency in an earlier upload
 * position while retaining the normal snapshot/reset/run/intent/plan priority.
 * A dependency cycle is corrupt local state and fails explicitly instead of
 * retrying one invalid batch forever. Forks remain finite and deterministic.
 */
const orderOutboxRows = (rows: readonly StoredOutbox[]): readonly StoredOutbox[] => {
  const byKey = new Map(rows.map((row) => [outboxRowKey(row), row] as const));
  const pending = new Set(byKey.keys());
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = outboxRowKey(row);
    const required = new Set(pendingDependencyKeys(row, pending));
    dependencies.set(key, required);
    for (const dependency of required) {
      const children = dependents.get(dependency) ?? new Set<string>();
      children.add(key);
      dependents.set(dependency, children);
    }
  }
  const ready = rows.filter((row) => dependencies.get(outboxRowKey(row))?.size === 0).sort(compareOutboxRows);
  const ordered: StoredOutbox[] = [];
  const emitted = new Set<string>();
  while (ready.length) {
    const row = ready.shift()!;
    const key = outboxRowKey(row);
    ordered.push(row);
    emitted.add(key);
    for (const dependent of dependents.get(key) ?? []) {
      const required = dependencies.get(dependent);
      required?.delete(key);
      if (required?.size === 0) {
        const next = byKey.get(dependent);
        if (next) {
          ready.push(next);
          ready.sort(compareOutboxRows);
        }
      }
    }
  }
  if (ordered.length !== rows.length) {
    const blocked = rows
      .filter((row) => !emitted.has(outboxRowKey(row)))
      .map(outboxRowKey)
      .sort(compareCodeUnits);
    throw new Error(`vnext-outbox-dependency-cycle:${blocked.join(",")}`);
  }
  return ordered;
};

class IndexedDbVNextShadowStore implements VNextShadowStore {
  readonly #databasePromise: Promise<IDBDatabase>;

  constructor(factory: IDBFactory, databaseName: string) {
    this.#databasePromise = openDatabase(factory, databaseName);
  }

  async #database(): Promise<IDBDatabase> {
    return this.#databasePromise;
  }

  async #currentReset(transaction: IDBTransaction, athleteId: AthleteId): Promise<StoredMutable<TrainingResetTombstone> | undefined> {
    return requestResult(transaction.objectStore(STORES.reset).get(athleteId));
  }

  async #hasActiveImmutable(
    transaction: IDBTransaction,
    athleteId: AthleteId,
    kind: ImmutableEntityKind,
    id: string,
    resetAt?: IsoTimestamp,
  ): Promise<boolean> {
    const row = await requestResult(transaction.objectStore(eventStore(kind)).get(
      entityKey(athleteId, id),
    )) as StoredEntity<AthleteEvidenceEvent | SessionPlan | SessionRecord> | undefined;
    if (!row) return false;
    if (kind === "evidence-event" && isSuppressedEvent(row.payload as AthleteEvidenceEvent, resetAt)) return false;
    if (kind === "session-record" && isSuppressedRecord(row.payload as SessionRecord, resetAt)) return false;
    if (row.migrationRunId === undefined) return true;
    const runs = await allForAthlete<StoredEntity<MigrationRun>>(transaction, STORES.runs, athleteId);
    return activeMigrationClaims(runs).has(migrationClaimKey(kind, id));
  }

  async #insertImmutable<T>(
    transaction: IDBTransaction,
    storeName: typeof STORES.events | typeof STORES.plans | typeof STORES.records,
    payload: T & { athleteId: AthleteId; id: string },
    hash: string,
    migrationRunId: string | undefined,
    enqueue: boolean,
  ): Promise<AppendResult> {
    if (migrationRunId) {
      const run = await requestResult(transaction.objectStore(STORES.runs).get(entityKey(payload.athleteId, migrationRunId))) as StoredEntity<MigrationRun> | undefined;
      if (run?.payload.status === "rolled-back") return { status: "ignored-older", hash };
    }
    const store = transaction.objectStore(storeName);
    const existing = await requestResult(store.get(entityKey(payload.athleteId, payload.id))) as StoredEntity<T> | undefined;
    if (existing) {
      if (existing.hash === hash) {
        // Payload identity is immutable, but converter ownership is not the
        // same thing as fact authority. An exact native observation arriving
        // after a converter copy must become independently owned so a later
        // migration rollback cannot hide genuine native truth.
        if (existing.migrationRunId !== undefined && migrationRunId === undefined) {
          const promoted: StoredEntity<T> = { ...existing, migrationRunId: undefined };
          await requestResult(store.put(promoted));
          if (enqueue) {
            await putOutbox(transaction, payload.athleteId, {
              kind: kindForStore(storeName),
              id: payload.id,
              hash,
              payload: payload as unknown as SyncUploadItem["payload"],
            });
          }
          return { status: "inserted", hash };
        }
        return { status: "duplicate", hash };
      }
      throw conflict(kindForStore(storeName), payload.id, "immutable-id-conflict", existing.hash, hash);
    }
    const row: StoredEntity<T> = { athleteId: payload.athleteId, id: payload.id, hash, payload, migrationRunId };
    await requestResult(store.add(row));
    if (enqueue) {
      await putOutbox(transaction, payload.athleteId, {
        kind: kindForStore(storeName),
        id: payload.id,
        hash,
        payload: payload as unknown as SyncUploadItem["payload"],
        migrationRunId,
      });
    }
    return { status: "inserted", hash };
  }

  async #putIntent(
    transaction: IDBTransaction,
    intent: AthleteIntent,
    hash: string,
    enqueue: boolean,
    migrationRunId?: string,
  ): Promise<AppendResult> {
    if (migrationRunId) {
      const run = await requestResult(transaction.objectStore(STORES.runs).get(entityKey(intent.athleteId, migrationRunId))) as StoredEntity<MigrationRun> | undefined;
      if (run?.payload.status === "rolled-back") return { status: "ignored-older", hash };
    }
    const store = transaction.objectStore(STORES.intent);
    const existing = await requestResult(store.get(intent.athleteId)) as StoredMutable<AthleteIntent> | undefined;
    if (existing) {
      // A repeated/stale v1 handoff may contribute immutable observations, but
      // converter-owned preferences can never overwrite Athlete Intent that
      // the athlete has already authored inside vNext.
      if (migrationRunId !== undefined && existing.migrationRunId === undefined) {
        return { status: "ignored-older", hash };
      }
      const order = compareTime(intent.updatedAt, existing.payload.updatedAt);
      if (order < 0) return { status: "ignored-older", hash };
      if (order === 0) {
        if (existing.hash === hash) return { status: "duplicate", hash };
        throw conflict("athlete-intent", intent.athleteId, "intent-timestamp-conflict", existing.hash, hash);
      }
    }
    const row: StoredMutable<AthleteIntent> = { athleteId: intent.athleteId, hash, payload: intent, migrationRunId };
    await requestResult(store.put(row));
    if (enqueue) await putOutbox(transaction, intent.athleteId, { kind: "athlete-intent", id: intent.athleteId, hash, payload: intent, migrationRunId });
    return { status: "inserted", hash };
  }

  async #purgeAtReset(transaction: IDBTransaction, athleteId: AthleteId, resetAt: IsoTimestamp): Promise<void> {
    const events = await allForAthlete<StoredEntity<AthleteEvidenceEvent>>(transaction, STORES.events, athleteId);
    const retainedEventIds = new Set<string>(filterLinkedEvents(events
      .map((row) => row.payload)
      .filter((event) => !isSuppressedEvent(event, resetAt)))
      .map((event) => event.id));
    for (const row of events) {
      if (retainedEventIds.has(row.id)) continue;
      await requestResult(transaction.objectStore(STORES.events).delete(entityKey(athleteId, row.id)));
      await requestResult(transaction.objectStore(STORES.outbox).delete(outboxKey(athleteId, "evidence-event", row.id)));
    }
    const records = await allForAthlete<StoredEntity<SessionRecord>>(transaction, STORES.records, athleteId);
    const retainedRecords = filterLinkedRecords(records
      .map((row) => row.payload)
      .filter((record) => !isSuppressedRecord(record, resetAt)));
    const retainedRecordIds = new Set<string>(retainedRecords.map((record) => record.id));
    for (const row of records) {
      if (retainedRecordIds.has(row.id)) continue;
      await requestResult(transaction.objectStore(STORES.records).delete(entityKey(athleteId, row.id)));
      await requestResult(transaction.objectStore(STORES.outbox).delete(outboxKey(athleteId, "session-record", row.id)));
    }
    // Plans are non-evidence immutable references. Keep both their payload and
    // pending upload: a later post-reset record may validly reuse the plan.
    await invalidateCache(transaction, athleteId);
  }

  async #putReset(
    transaction: IDBTransaction,
    tombstone: TrainingResetTombstone,
    hash: string,
    enqueue: boolean,
    migrationRunId?: string,
  ): Promise<AppendResult> {
    const store = transaction.objectStore(STORES.reset);
    const existing = await this.#currentReset(transaction, tombstone.athleteId);
    if (existing) {
      const order = compareTime(tombstone.resetAt, existing.payload.resetAt);
      if (order < 0) return { status: "ignored-older", hash };
      if (order === 0) {
        if (existing.hash === hash) return { status: "duplicate", hash };
        // Equal cutoffs have identical authority. Canonical hash order makes all devices converge.
        if (compareCodeUnits(existing.hash, hash) < 0) return { status: "ignored-older", hash };
      }
    }
    const row: StoredMutable<TrainingResetTombstone> = {
      athleteId: tombstone.athleteId,
      hash,
      payload: tombstone,
      migrationRunId,
    };
    await requestResult(store.put(row));
    await this.#purgeAtReset(transaction, tombstone.athleteId, tombstone.resetAt);
    if (enqueue) {
      await putOutbox(transaction, tombstone.athleteId, {
        kind: "reset-tombstone", id: tombstone.athleteId, hash, payload: tombstone, migrationRunId,
      });
    }
    return { status: "inserted", hash };
  }

  async saveAssessmentDraft(draft: AssessmentDraft): Promise<void> {
    assertAssessmentDraft(draft);
    const database = await this.#database();
    const transaction = database.transaction(STORES.assessmentDrafts, "readwrite");
    try {
      const store = transaction.objectStore(STORES.assessmentDrafts);
      const existing = await requestResult(store.get(draft.athleteId)) as AssessmentDraft | undefined;
      if (existing) {
        if (existing.id === draft.id && existing.revision > draft.revision) {
          await transactionDone(transaction);
          return;
        }
        if (existing.id === draft.id && existing.revision === draft.revision) {
          if (canonicalJson(existing) !== canonicalJson(draft)) {
            throw new Error(`assessment-draft-revision-conflict:${draft.id}:${draft.revision}`);
          }
          await transactionDone(transaction);
          return;
        }
        if (Date.parse(draft.updatedAt) < Date.parse(existing.updatedAt)) {
          throw new Error(`assessment-draft-older-than-current:${draft.id}`);
        }
      }
      await requestResult(store.put(draft));
      await transactionDone(transaction);
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async readAssessmentDraft(athleteId: AthleteId): Promise<AssessmentDraft | null> {
    const database = await this.#database();
    const transaction = database.transaction(STORES.assessmentDrafts, "readonly");
    const draft = await requestResult(transaction.objectStore(STORES.assessmentDrafts).get(athleteId)) as AssessmentDraft | undefined;
    await transactionDone(transaction);
    if (!draft) return null;
    assertAssessmentDraft(draft);
    return draft;
  }

  async deleteAssessmentDraft(athleteId: AthleteId): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(STORES.assessmentDrafts, "readwrite");
    await requestResult(transaction.objectStore(STORES.assessmentDrafts).delete(athleteId));
    await transactionDone(transaction);
  }

  async appendEvidenceEvent(event: AthleteEvidenceEvent, migrationRunId?: string): Promise<AppendResult> {
    assertValid("Evidence Event", validateAthleteEvidenceEvent(event));
    const hash = await sha256(event);
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      const reset = await this.#currentReset(transaction, event.athleteId);
      if (isSuppressedEvent(event, reset?.payload.resetAt)) {
        await transactionDone(transaction);
        return { status: "ignored-older", hash };
      }
      const targetId = eventDependencyId(event);
      if (targetId) {
        const activeTarget = await this.#hasActiveImmutable(
          transaction, event.athleteId, "evidence-event", targetId, reset?.payload.resetAt,
        );
        if (!activeTarget && migrationRunId === undefined) {
          const retainedTarget = await requestResult(transaction.objectStore(STORES.events).get(
            entityKey(event.athleteId, targetId),
          )) as StoredEntity<AthleteEvidenceEvent> | undefined;
          if (!retainedTarget || isSuppressedEvent(retainedTarget.payload, reset?.payload.resetAt)) {
            throw conflict("evidence-event", event.id, "invalid-reference");
          }
        } else if (!activeTarget) {
          throw conflict("evidence-event", event.id, "invalid-reference");
        }
      }
      const result = await this.#insertImmutable(transaction, STORES.events, event, hash, migrationRunId, true);
      if (result.status === "inserted") await invalidateCache(transaction, event.athleteId);
      await transactionDone(transaction);
      return result;
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async appendSession(plan: SessionPlan, record: SessionRecord, migrationRunId?: string): Promise<Readonly<{ plan: AppendResult; record: AppendResult }>> {
    validatePlanRecordPair(plan, record);
    const [planHash, recordHash] = await Promise.all([sha256(plan), sha256(record)]);
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      const reset = await this.#currentReset(transaction, record.athleteId);
      if (isSuppressedRecord(record, reset?.payload.resetAt)) {
        await transactionDone(transaction);
        return {
          plan: { status: "ignored-older", hash: planHash },
          record: { status: "ignored-older", hash: recordHash },
        };
      }
      const [recordRows, runRows] = await Promise.all([
        allForAthlete<StoredEntity<SessionRecord>>(transaction, STORES.records, record.athleteId),
        allForAthlete<StoredEntity<MigrationRun>>(transaction, STORES.runs, record.athleteId),
      ]);
      if (record.supersedesRecordId) {
        const target = recordRows.find((row) => row.id === record.supersedesRecordId);
        if (!target || isSuppressedRecord(target.payload, reset?.payload.resetAt)) {
          throw conflict("session-record", record.id, "invalid-reference");
        }
      }
      assertLinearSessionRecordAppend(
        record,
        recordHash,
        recordRows,
        activeMigrationClaims(runRows),
        reset?.payload.resetAt,
      );
      const planResult = await this.#insertImmutable(transaction, STORES.plans, plan, planHash, migrationRunId, true);
      const recordResult = await this.#insertImmutable(transaction, STORES.records, record, recordHash, migrationRunId, true);
      if (planResult.status === "inserted" || recordResult.status === "inserted") await invalidateCache(transaction, plan.athleteId);
      await transactionDone(transaction);
      return { plan: planResult, record: recordResult };
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async putAthleteIntent(intent: AthleteIntent): Promise<AppendResult> {
    assertValid("Athlete Intent", validateAthleteIntent(intent));
    const hash = await sha256(intent);
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      const result = await this.#putIntent(transaction, intent, hash, true);
      if (result.status === "inserted") await invalidateCache(transaction, intent.athleteId);
      await transactionDone(transaction);
      return result;
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async applyProgressReset(tombstone: TrainingResetTombstone): Promise<AppendResult> {
    validateReset(tombstone);
    const hash = await sha256(tombstone);
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      const result = await this.#putReset(transaction, tombstone, hash, true);
      await transactionDone(transaction);
      return result;
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async readProjectionSources(athleteId: AthleteId): Promise<ProjectionSources> {
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readonly");
    const [resetRow, intentRow, eventRows, planRows, recordRows, runRows] = await Promise.all([
      requestResult(transaction.objectStore(STORES.reset).get(athleteId)) as Promise<StoredMutable<TrainingResetTombstone> | undefined>,
      requestResult(transaction.objectStore(STORES.intent).get(athleteId)) as Promise<StoredMutable<AthleteIntent> | undefined>,
      allForAthlete<StoredEntity<AthleteEvidenceEvent>>(transaction, STORES.events, athleteId),
      allForAthlete<StoredEntity<SessionPlan>>(transaction, STORES.plans, athleteId),
      allForAthlete<StoredEntity<SessionRecord>>(transaction, STORES.records, athleteId),
      allForAthlete<StoredEntity<MigrationRun>>(transaction, STORES.runs, athleteId),
    ]);
    await transactionDone(transaction);
    const resetAt = resetRow?.payload.resetAt;
    const activeClaims = activeMigrationClaims(runRows);
    const evidenceEvents = sortById(activeEventsWithDependencies(eventRows, activeClaims, resetAt));
    const sessionRecords = sortById(activeRecordsWithDependencies(recordRows, activeClaims, resetAt));
    const planIds = new Set(sessionRecords.map((record) => record.planId));
    const sessionPlans = sortById(storedPayloads(planRows).filter((plan) => planIds.has(plan.id)));
    const sourceFingerprint = await sha256({
      athleteId,
      resetTombstone: resetRow?.payload,
      intent: intentRow?.payload,
      evidenceEvents,
      sessionPlans,
      sessionRecords,
    });
    return {
      athleteId,
      resetTombstone: resetRow?.payload,
      intent: intentRow?.payload,
      evidenceEvents,
      sessionPlans,
      sessionRecords,
      sourceFingerprint,
    };
  }

  async putDerivedCache(entry: ProjectionCacheEntry): Promise<void> {
    if (entry.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION) throw new TypeError("Invalid cache schema version");
    validateCacheLookup(entry);
    if (!isIsoTimestamp(entry.storedAt)) throw new TypeError("Invalid cache storage timestamp");
    if (compareTime(entry.storedAt, entry.asOf) < 0) throw new TypeError("Cache cannot be stored before its projection cutoff");
    assertValid("Derived Athlete State", validateDerivedAthleteState(entry.state));
    if (entry.state.athleteId !== entry.athleteId) throw new TypeError("Cache state belongs to another athlete");
    if (entry.state.asOf !== entry.asOf || entry.state.projectionVersion !== entry.projectionVersion) {
      throw new TypeError("Cache state does not match its projection identity");
    }
    const sources = await this.readProjectionSources(entry.athleteId);
    if (sources.sourceFingerprint !== entry.sourceFingerprint || sources.resetTombstone?.resetAt !== entry.resetAt) {
      throw new Error("Derived cache does not match current observation sources");
    }
    const database = await this.#database();
    const transaction = database.transaction(STORES.cache, "readwrite");
    await requestResult(transaction.objectStore(STORES.cache).put(entry));
    await transactionDone(transaction);
  }

  async getDerivedCache(lookup: ProjectionCacheLookup): Promise<ProjectionCacheEntry | null> {
    validateCacheLookup(lookup);
    const database = await this.#database();
    const transaction = database.transaction(STORES.cache, "readonly");
    const value = await requestResult(transaction.objectStore(STORES.cache).get(lookup.athleteId)) as ProjectionCacheEntry | undefined;
    await transactionDone(transaction);
    return value && cacheIdentityMatches(value, lookup) ? value : null;
  }

  async #putSnapshot(
    transaction: IDBTransaction,
    snapshot: LegacyMigrationSnapshot,
    hash: string,
    enqueue: boolean,
  ): Promise<AppendResult> {
    const store = transaction.objectStore(STORES.snapshots);
    const key = entityKey(snapshot.athleteId, snapshot.id);
    const existing = await requestResult(store.get(key)) as StoredEntity<LegacyMigrationSnapshot> | undefined;
    if (existing) {
      if (existing.hash === hash) return { status: "duplicate", hash };
      throw conflict("legacy-snapshot", snapshot.id, "immutable-id-conflict", existing.hash, hash);
    }
    const row: StoredEntity<LegacyMigrationSnapshot> = {
      athleteId: snapshot.athleteId,
      id: snapshot.id,
      hash,
      payload: snapshot,
    };
    await requestResult(store.add(row));
    if (enqueue) {
      await putOutbox(transaction, snapshot.athleteId, {
        kind: "legacy-snapshot",
        id: snapshot.id,
        hash,
        payload: snapshot,
      });
    }
    return { status: "inserted", hash };
  }

  async #putRun(
    transaction: IDBTransaction,
    run: MigrationRun,
    hash: string,
    enqueue: boolean,
  ): Promise<AppendResult> {
    const store = transaction.objectStore(STORES.runs);
    const key = entityKey(run.athleteId, run.id);
    const existing = await requestResult(store.get(key)) as StoredEntity<MigrationRun> | undefined;
    if (existing) {
      if (existing.hash === hash) return { status: "duplicate", hash };
      const stableExisting = { ...existing.payload, status: undefined, rolledBackAt: undefined };
      const stableIncoming = { ...run, status: undefined, rolledBackAt: undefined };
      if (canonicalJson(stableExisting) !== canonicalJson(stableIncoming)) {
        throw conflict("migration-run", run.id, "immutable-id-conflict", existing.hash, hash);
      }
      if (existing.payload.status === "rolled-back" && run.status === "active") return { status: "ignored-older", hash };
      if (existing.payload.status === "active" && run.status === "rolled-back") {
        // Continue: rollback dominates an active run.
      } else if (existing.payload.status === "rolled-back" && run.status === "rolled-back") {
        if (compareCodeUnits(existing.hash, hash) < 0) return { status: "ignored-older", hash };
      }
    }
    const row: StoredEntity<MigrationRun> = {
      athleteId: run.athleteId,
      id: run.id,
      hash,
      payload: run,
    };
    await requestResult(store.put(row));
    if (enqueue) await putOutbox(transaction, run.athleteId, { kind: "migration-run", id: run.id, hash, payload: run });
    return { status: "inserted", hash };
  }

  async #removeRunGenerated(transaction: IDBTransaction, run: MigrationRun): Promise<void> {
    const runRows = await allForAthlete<StoredEntity<MigrationRun>>(transaction, STORES.runs, run.athleteId);
    const activeClaims = activeMigrationClaims(runRows, run.id);
    const mayQuarantine = (ref: MigrationRun["generatedEntities"][number], entity: StoredEntity<unknown> | undefined): boolean =>
      entity?.migrationRunId !== undefined && !activeClaims.has(migrationClaimKey(ref.kind, ref.id));
    const nonPlans = run.generatedEntities.filter((ref) => ref.kind !== "session-plan");
    const plans = run.generatedEntities.filter((ref) => ref.kind === "session-plan");
    for (const ref of nonPlans) {
      const storeName = eventStore(ref.kind);
      const entity = await requestResult(transaction.objectStore(storeName).get(entityKey(run.athleteId, ref.id))) as StoredEntity<unknown> | undefined;
      // `migrationRunId` records original converter provenance. Active run
      // manifests are the ownership truth when exact stable facts are shared
      // by more than one deterministic conversion. Native-origin rows have no
      // converter provenance and are never removed by migration rollback.
      // Converter payloads are retained as a local quarantine: a later sync
      // cursor may deliver a new active owner without replaying the older fact.
      if (!mayQuarantine(ref, entity)) continue;
      await requestResult(transaction.objectStore(STORES.outbox).delete(outboxKey(run.athleteId, ref.kind, ref.id)));
    }
    const remainingRecords = (await allForAthlete<StoredEntity<SessionRecord>>(transaction, STORES.records, run.athleteId))
      .filter((row) => isActiveImmutableRow("session-record", row, activeClaims));
    for (const ref of plans) {
      // Keep the immutable reference if a later non-migration correction still uses it.
      if (remainingRecords.some((record) => record.payload.planId === ref.id)) continue;
      const entity = await requestResult(transaction.objectStore(STORES.plans).get(
        entityKey(run.athleteId, ref.id),
      )) as StoredEntity<SessionPlan> | undefined;
      if (!mayQuarantine(ref, entity)) continue;
      await requestResult(transaction.objectStore(STORES.outbox).delete(outboxKey(run.athleteId, ref.kind, ref.id)));
    }
    const intent = await requestResult(transaction.objectStore(STORES.intent).get(run.athleteId)) as StoredMutable<AthleteIntent> | undefined;
    if (intent?.migrationRunId === run.id) {
      await requestResult(transaction.objectStore(STORES.intent).delete(run.athleteId));
      await requestResult(transaction.objectStore(STORES.outbox).delete(outboxKey(run.athleteId, "athlete-intent", run.athleteId)));
    }
  }

  async #validateConversion(conversion: LegacyConversion): Promise<Readonly<{
    snapshotHash: string;
    runHash: string;
    resetHash?: string;
    intentHash: string;
    eventHashes: readonly string[];
    planHashes: readonly string[];
    recordHashes: readonly string[];
  }>> {
    await validateSnapshot(conversion.snapshot);
    validateRun(conversion.run);
    await validateDeterministicRunId(conversion.run);
    validateRunSnapshotRelationship(conversion.run, conversion.snapshot);
    const athleteId = conversion.snapshot.athleteId;
    if (conversion.run.athleteId !== athleteId
      || conversion.run.snapshotId !== conversion.snapshot.id
      || conversion.run.sourceFingerprint !== conversion.snapshot.sourceFingerprint
      || conversion.run.status !== "active") {
      throw new TypeError("Legacy conversion metadata is inconsistent");
    }
    const sourceFingerprint = await sha256(conversion.snapshot.sourceProfile);
    if (sourceFingerprint !== conversion.snapshot.sourceFingerprint) throw new TypeError("Legacy snapshot fingerprint mismatch");
    assertValid("Athlete Intent", validateAthleteIntent(conversion.intent));
    sameAthlete(athleteId, conversion.intent.athleteId, conversion.run.id);
    if (conversion.resetTombstone) {
      validateReset(conversion.resetTombstone);
      sameAthlete(athleteId, conversion.resetTombstone.athleteId, conversion.run.id);
    }
    const plans = new Map<string, SessionPlan>();
    for (const plan of conversion.sessionPlans) {
      assertValid("Session Plan", validateSessionPlan(plan));
      sameAthlete(athleteId, plan.athleteId, plan.id);
      if (plans.has(plan.id)) throw new TypeError(`Duplicate converted plan ${plan.id}`);
      plans.set(plan.id, plan);
    }
    for (const record of conversion.sessionRecords) {
      const plan = plans.get(record.planId);
      if (!plan) throw conflict("session-record", record.id, "invalid-reference");
      validatePlanRecordPair(plan, record);
    }
    for (const event of conversion.evidenceEvents) {
      assertValid("Evidence Event", validateAthleteEvidenceEvent(event));
      sameAthlete(athleteId, event.athleteId, event.id);
    }
    const expectedRefs = new Set([
      ...conversion.evidenceEvents.map((event) => `evidence-event:${event.id}`),
      ...conversion.sessionPlans.map((plan) => `session-plan:${plan.id}`),
      ...conversion.sessionRecords.map((record) => `session-record:${record.id}`),
    ]);
    const actualRefs = new Set(conversion.run.generatedEntities.map((ref) => `${ref.kind}:${ref.id}`));
    if (expectedRefs.size !== actualRefs.size || [...expectedRefs].some((ref) => !actualRefs.has(ref))) {
      throw new TypeError("Migration run generated-entity manifest does not match its conversion");
    }
    const [snapshotHash, runHash, resetHash, intentHash, eventHashes, planHashes, recordHashes] = await Promise.all([
      sha256(conversion.snapshot),
      sha256(conversion.run),
      conversion.resetTombstone ? sha256(conversion.resetTombstone) : Promise.resolve(undefined),
      sha256(conversion.intent),
      Promise.all(conversion.evidenceEvents.map(sha256)),
      Promise.all(conversion.sessionPlans.map(sha256)),
      Promise.all(conversion.sessionRecords.map(sha256)),
    ]);
    return { snapshotHash, runHash, resetHash, intentHash, eventHashes, planHashes, recordHashes };
  }

  async applyLegacyConversion(conversion: LegacyConversion): Promise<Readonly<{ status: "inserted" | "duplicate" }>> {
    const hashes = await this.#validateConversion(conversion);
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      const existingRun = await requestResult(transaction.objectStore(STORES.runs).get(
        entityKey(conversion.run.athleteId, conversion.run.id),
      )) as StoredEntity<MigrationRun> | undefined;
      if (existingRun?.payload.status === "rolled-back") {
        const stableExisting = { ...existingRun.payload, status: undefined, rolledBackAt: undefined };
        const stableIncoming = { ...conversion.run, status: undefined, rolledBackAt: undefined };
        if (canonicalJson(stableExisting) !== canonicalJson(stableIncoming)) {
          throw conflict("migration-run", conversion.run.id, "immutable-id-conflict", existingRun.hash, hashes.runHash);
        }
        await transactionDone(transaction);
        return { status: "duplicate" };
      }
      const statuses: AppendResult["status"][] = [];
      // The recovery snapshot is enqueued first and upload ordering preserves it.
      statuses.push((await this.#putSnapshot(transaction, conversion.snapshot, hashes.snapshotHash, true)).status);
      if (conversion.resetTombstone && hashes.resetHash) {
        statuses.push((await this.#putReset(
          transaction,
          conversion.resetTombstone,
          hashes.resetHash,
          true,
          conversion.run.id,
        )).status);
      }
      statuses.push((await this.#putIntent(transaction, conversion.intent, hashes.intentHash, true, conversion.run.id)).status);
      statuses.push((await this.#putRun(transaction, conversion.run, hashes.runHash, true)).status);
      for (const [index, event] of conversion.evidenceEvents.entries()) {
        const reset = await this.#currentReset(transaction, event.athleteId);
        if (isSuppressedEvent(event, reset?.payload.resetAt)) {
          statuses.push("ignored-older");
          continue;
        }
        statuses.push((await this.#insertImmutable(
          transaction, STORES.events, event, hashes.eventHashes[index], conversion.run.id, true,
        )).status);
      }
      const recordsByPlan = new Map<string, SessionRecord[]>();
      for (const record of conversion.sessionRecords) {
        const records = recordsByPlan.get(record.planId) ?? [];
        records.push(record);
        recordsByPlan.set(record.planId, records);
      }
      const reset = await this.#currentReset(transaction, conversion.snapshot.athleteId);
      for (const [index, plan] of conversion.sessionPlans.entries()) {
        const records = recordsByPlan.get(plan.id);
        if (!records?.length) throw conflict("session-plan", plan.id, "invalid-reference");
        if (records.every((record) => isSuppressedRecord(record, reset?.payload.resetAt))) {
          statuses.push("ignored-older");
          continue;
        }
        statuses.push((await this.#insertImmutable(
          transaction, STORES.plans, plan, hashes.planHashes[index], conversion.run.id, true,
        )).status);
      }
      for (const [index, record] of conversion.sessionRecords.entries()) {
        if (isSuppressedRecord(record, reset?.payload.resetAt)) {
          statuses.push("ignored-older");
          continue;
        }
        statuses.push((await this.#insertImmutable(
          transaction, STORES.records, record, hashes.recordHashes[index], conversion.run.id, true,
        )).status);
      }
      await invalidateCache(transaction, conversion.snapshot.athleteId);
      await transactionDone(transaction);
      return { status: statuses.every((status) => status !== "inserted") ? "duplicate" : "inserted" };
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async rollbackMigrationRun(athleteId: AthleteId, runId: string, rolledBackAt: IsoTimestamp): Promise<void> {
    if (!isIsoTimestamp(rolledBackAt)) throw new TypeError("Invalid rollback timestamp");
    const database = await this.#database();
    const inspection = database.transaction(STORES.runs, "readonly");
    const inspected = await requestResult(inspection.objectStore(STORES.runs).get(entityKey(athleteId, runId))) as StoredEntity<MigrationRun> | undefined;
    await transactionDone(inspection);
    if (!inspected) throw new Error(`Unknown migration run ${runId}`);
    if (inspected.payload.status === "rolled-back") return;
    if (compareTime(rolledBackAt, inspected.payload.createdAt) < 0) throw new TypeError("Rollback cannot predate migration");
    const rolledBack: MigrationRun = { ...inspected.payload, status: "rolled-back", rolledBackAt };
    validateRun(rolledBack);
    const rolledBackHash = await sha256(rolledBack);
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      const key = entityKey(athleteId, runId);
      const row = await requestResult(transaction.objectStore(STORES.runs).get(key)) as StoredEntity<MigrationRun> | undefined;
      if (!row) throw new Error(`Unknown migration run ${runId}`);
      if (row.payload.status === "rolled-back") {
        await transactionDone(transaction);
        return;
      }
      if (row.hash !== inspected.hash) throw conflict("migration-run", runId, "immutable-id-conflict", inspected.hash, row.hash);
      await this.#removeRunGenerated(transaction, row.payload);
      // A legacy progress-reset tombstone remains authoritative after converter rollback.
      const updated: StoredEntity<MigrationRun> = { ...row, hash: rolledBackHash, payload: rolledBack };
      await requestResult(transaction.objectStore(STORES.runs).put(updated));
      await putOutbox(transaction, athleteId, { kind: "migration-run", id: runId, hash: rolledBackHash, payload: rolledBack });
      await invalidateCache(transaction, athleteId);
      await transactionDone(transaction);
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async exportBundle(
    athleteId: AthleteId,
    metadata: Pick<ObservationExportBundle, "exportedAt" | "catalogueVersions" | "projectionVersions" | "definitionFingerprints" | "policyVersions">,
  ): Promise<ObservationExportBundle> {
    if (!isIsoTimestamp(metadata.exportedAt)) throw new TypeError("Invalid export timestamp");
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readonly");
    const [reset, intent, events, plans, records, snapshots, runs] = await Promise.all([
      requestResult(transaction.objectStore(STORES.reset).get(athleteId)) as Promise<StoredMutable<TrainingResetTombstone> | undefined>,
      requestResult(transaction.objectStore(STORES.intent).get(athleteId)) as Promise<StoredMutable<AthleteIntent> | undefined>,
      allForAthlete<StoredEntity<AthleteEvidenceEvent>>(transaction, STORES.events, athleteId),
      allForAthlete<StoredEntity<SessionPlan>>(transaction, STORES.plans, athleteId),
      allForAthlete<StoredEntity<SessionRecord>>(transaction, STORES.records, athleteId),
      allForAthlete<StoredEntity<LegacyMigrationSnapshot>>(transaction, STORES.snapshots, athleteId),
      allForAthlete<StoredEntity<MigrationRun>>(transaction, STORES.runs, athleteId),
    ]);
    await transactionDone(transaction);
    const resetAt = reset?.payload.resetAt;
    const activeClaims = activeMigrationClaims(runs);
    const exportedRecords = sortById(activeRecordsWithDependencies(records, activeClaims, resetAt));
    const planIds = new Set<string>(exportedRecords.map((record) => record.planId));
    const exportedEvents = sortById(activeEventsWithDependencies(events, activeClaims, resetAt));
    const exportedPlans = sortById(storedPayloads(plans).filter((plan) => planIds.has(plan.id)));
    const exportedEventIds = new Set<string>(exportedEvents.map((event) => event.id));
    const exportedRecordIds = new Set<string>(exportedRecords.map((record) => record.id));
    const immutableEntityProvenance = [
      ...events.filter((row) => exportedEventIds.has(row.id))
        .map((row) => immutableProvenance("evidence-event", row)),
      ...plans.filter((row) => planIds.has(row.id))
        .map((row) => immutableProvenance("session-plan", row)),
      ...records.filter((row) => exportedRecordIds.has(row.id))
        .map((row) => immutableProvenance("session-record", row)),
    ].sort((left, right) => compareCodeUnits(
      migrationClaimKey(left.kind, left.id),
      migrationClaimKey(right.kind, right.id),
    ));
    return {
      format: "parallette25-vnext-observations",
      formatVersion: VNEXT_PERSISTENCE_SCHEMA_VERSION,
      exportedAt: metadata.exportedAt,
      athleteId,
      catalogueVersions: [...new Set(metadata.catalogueVersions)].sort((a, b) => a - b),
      projectionVersions: [...new Set(metadata.projectionVersions)].sort((a, b) => a - b),
      definitionFingerprints: [...new Set(metadata.definitionFingerprints)].sort(),
      policyVersions: [...metadata.policyVersions].sort((a, b) => compareCodeUnits(a.id, b.id) || a.version - b.version),
      resetTombstone: reset?.payload,
      intent: intent?.payload,
      intentMigrationRunId: intent?.migrationRunId,
      evidenceEvents: exportedEvents,
      sessionPlans: exportedPlans,
      sessionRecords: exportedRecords,
      immutableEntityProvenance,
      migrationSnapshots: sortById(storedPayloads(snapshots)),
      migrationRuns: sortById(storedPayloads(runs)),
    };
  }

  async #prepareBundle(bundle: ObservationExportBundle): Promise<Readonly<{
    resetHash?: string;
    intentHash?: string;
    eventHashes: readonly string[];
    planHashes: readonly string[];
    recordHashes: readonly string[];
    snapshotHashes: readonly string[];
    runHashes: readonly string[];
    provenanceByEntity: ReadonlyMap<string, ImmutableEntityProvenance>;
  }>> {
    if (bundle.format !== "parallette25-vnext-observations" || bundle.formatVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION) {
      throw new TypeError("Unsupported observation export format");
    }
    assertStableId(bundle.athleteId, "bundle athlete ID");
    if (!isIsoTimestamp(bundle.exportedAt)) throw new TypeError("Invalid bundle export timestamp");
    if (!Array.isArray(bundle.catalogueVersions)
      || !Array.isArray(bundle.projectionVersions)
      || !Array.isArray(bundle.definitionFingerprints)
      || !Array.isArray(bundle.policyVersions)
      || !Array.isArray(bundle.evidenceEvents)
      || !Array.isArray(bundle.sessionPlans)
      || !Array.isArray(bundle.sessionRecords)
      || !Array.isArray(bundle.immutableEntityProvenance)
      || !Array.isArray(bundle.migrationSnapshots)
      || !Array.isArray(bundle.migrationRuns)) {
      throw new TypeError("Invalid observation export arrays");
    }
    if (bundle.resetTombstone) {
      validateReset(bundle.resetTombstone);
      sameAthlete(bundle.athleteId, bundle.resetTombstone.athleteId, bundle.resetTombstone.id);
    }
    if (bundle.intent) {
      assertValid("Athlete Intent", validateAthleteIntent(bundle.intent));
      sameAthlete(bundle.athleteId, bundle.intent.athleteId, bundle.athleteId);
    }
    const planMap = new Map<string, SessionPlan>();
    for (const plan of bundle.sessionPlans) {
      assertValid("Session Plan", validateSessionPlan(plan));
      sameAthlete(bundle.athleteId, plan.athleteId, plan.id);
      if (planMap.has(plan.id)) throw new TypeError(`Duplicate bundle plan ${plan.id}`);
      planMap.set(plan.id, plan);
    }
    const referencedPlans = new Set<string>();
    const recordIds = new Set<string>();
    for (const record of bundle.sessionRecords) {
      if (recordIds.has(record.id)) throw new TypeError(`Duplicate bundle record ${record.id}`);
      recordIds.add(record.id);
      const plan = planMap.get(record.planId);
      if (!plan) throw conflict("session-record", record.id, "invalid-reference");
      validatePlanRecordPair(plan, record);
      referencedPlans.add(record.planId);
    }
    if ([...planMap.keys()].some((id) => !referencedPlans.has(id))) throw new TypeError("Bundle contains an unreferenced Session Plan");
    const eventIds = new Set<string>();
    for (const event of bundle.evidenceEvents) {
      assertValid("Evidence Event", validateAthleteEvidenceEvent(event));
      sameAthlete(bundle.athleteId, event.athleteId, event.id);
      if (eventIds.has(event.id)) throw new TypeError(`Duplicate bundle event ${event.id}`);
      eventIds.add(event.id);
    }
    const snapshotById = new Map<string, LegacyMigrationSnapshot>();
    for (const snapshot of bundle.migrationSnapshots) {
      await validateSnapshot(snapshot);
      sameAthlete(bundle.athleteId, snapshot.athleteId, snapshot.id);
      if (snapshotById.has(snapshot.id)) throw new TypeError(`Duplicate bundle snapshot ${snapshot.id}`);
      snapshotById.set(snapshot.id, snapshot);
    }
    const runById = new Map<string, MigrationRun>();
    for (const run of bundle.migrationRuns) {
      validateRun(run);
      await validateDeterministicRunId(run);
      sameAthlete(bundle.athleteId, run.athleteId, run.id);
      if (runById.has(run.id)) throw new TypeError(`Duplicate bundle migration run ${run.id}`);
      const snapshot = snapshotById.get(run.snapshotId);
      if (!snapshot) throw conflict("migration-run", run.id, "invalid-reference");
      validateRunSnapshotRelationship(run, snapshot);
      runById.set(run.id, run);
    }
    const expectedProvenance = new Set([
      ...bundle.evidenceEvents.map((event) => migrationClaimKey("evidence-event", event.id)),
      ...bundle.sessionPlans.map((plan) => migrationClaimKey("session-plan", plan.id)),
      ...bundle.sessionRecords.map((record) => migrationClaimKey("session-record", record.id)),
    ]);
    const provenanceByEntity = new Map<string, ImmutableEntityProvenance>();
    for (const provenance of bundle.immutableEntityProvenance) {
      validateImmutableProvenance(provenance);
      const key = migrationClaimKey(provenance.kind, provenance.id);
      if (!expectedProvenance.has(key)) throw new TypeError(`Immutable provenance references absent entity ${key}`);
      if (provenanceByEntity.has(key)) throw new TypeError(`Duplicate immutable provenance ${key}`);
      if (provenance.origin === "legacy-v1.2") {
        const run = runById.get(provenance.migrationRunId);
        if (!run?.generatedEntities.some((ref) => migrationClaimKey(ref.kind, ref.id) === key)) {
          throw new TypeError(`Immutable provenance ${key} is not claimed by its migration run`);
        }
      }
      provenanceByEntity.set(key, provenance);
    }
    if (provenanceByEntity.size !== expectedProvenance.size) {
      const missing = [...expectedProvenance].filter((key) => !provenanceByEntity.has(key)).sort(compareCodeUnits);
      throw new TypeError(`Missing immutable provenance for ${missing.join(",")}`);
    }
    if (bundle.intentMigrationRunId !== undefined) {
      assertStableId(bundle.intentMigrationRunId, "intent migration run ID");
      if (!bundle.intent || !runById.has(bundle.intentMigrationRunId)) {
        throw new TypeError("Intent migration provenance references an absent run");
      }
      if (runById.get(bundle.intentMigrationRunId)?.status !== "active") {
        throw new TypeError("Intent migration provenance references a rolled-back run");
      }
    }
    return {
      resetHash: bundle.resetTombstone ? await sha256(bundle.resetTombstone) : undefined,
      intentHash: bundle.intent ? await sha256(bundle.intent) : undefined,
      eventHashes: await Promise.all(bundle.evidenceEvents.map(sha256)),
      planHashes: await Promise.all(bundle.sessionPlans.map(sha256)),
      recordHashes: await Promise.all(bundle.sessionRecords.map(sha256)),
      snapshotHashes: await Promise.all(bundle.migrationSnapshots.map(sha256)),
      runHashes: await Promise.all(bundle.migrationRuns.map(sha256)),
      provenanceByEntity,
    };
  }

  async importBundle(bundle: ObservationExportBundle): Promise<Readonly<{ inserted: number; duplicates: number }>> {
    const hashes = await this.#prepareBundle(bundle);
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      let inserted = 0;
      let duplicates = 0;
      const count = (result: AppendResult): void => {
        if (result.status === "inserted") inserted += 1;
        else duplicates += 1;
      };
      // Highest reset wins before any fact is considered, so stale imports cannot resurrect it.
      if (bundle.resetTombstone && hashes.resetHash) {
        count(await this.#putReset(transaction, bundle.resetTombstone, hashes.resetHash, true));
      }
      for (const [index, snapshot] of bundle.migrationSnapshots.entries()) {
        count(await this.#putSnapshot(transaction, snapshot, hashes.snapshotHashes[index], true));
      }
      if (bundle.intent && hashes.intentHash) {
        count(await this.#putIntent(
          transaction,
          bundle.intent,
          hashes.intentHash,
          true,
          bundle.intentMigrationRunId,
        ));
      }
      const reset = await this.#currentReset(transaction, bundle.athleteId);
      const existingRunRows = await allForAthlete<StoredEntity<MigrationRun>>(
        transaction, STORES.runs, bundle.athleteId,
      );
      const incomingRuns = new Map(bundle.migrationRuns.map((run) => [run.id, run] as const));
      const effectiveActiveClaims = new Set<string>();
      for (const row of existingRunRows) {
        const incoming = incomingRuns.get(row.id);
        const active = incoming
          ? row.payload.status !== "rolled-back" && incoming.status === "active"
          : row.payload.status === "active";
        if (active) for (const ref of row.payload.generatedEntities) {
          effectiveActiveClaims.add(migrationClaimKey(ref.kind, ref.id));
        }
      }
      for (const run of bundle.migrationRuns) {
        if (existingRunRows.some((row) => row.id === run.id && row.payload.status === "rolled-back")
          || run.status !== "active") continue;
        for (const ref of run.generatedEntities) effectiveActiveClaims.add(migrationClaimKey(ref.kind, ref.id));
      }
      const migrationRunFor = (key: string): string | undefined => {
        const provenance = hashes.provenanceByEntity.get(key);
        return provenance?.origin === "legacy-v1.2" ? provenance.migrationRunId : undefined;
      };
      const targetExists = async (
        kind: "evidence-event" | "session-record",
        id: string,
      ): Promise<boolean> => {
        const incoming = kind === "evidence-event"
          ? bundle.evidenceEvents.find((event) => event.id === id)
          : bundle.sessionRecords.find((record) => record.id === id);
        if (incoming) {
          const suppressed = kind === "evidence-event"
            ? isSuppressedEvent(incoming as AthleteEvidenceEvent, reset?.payload.resetAt)
            : isSuppressedRecord(incoming as SessionRecord, reset?.payload.resetAt);
          if (!suppressed) return true;
        }
        const stored = await requestResult(transaction.objectStore(eventStore(kind)).get(
          entityKey(bundle.athleteId, id),
        )) as StoredEntity<AthleteEvidenceEvent | SessionRecord> | undefined;
        if (!stored) return false;
        return kind === "evidence-event"
          ? !isSuppressedEvent(stored.payload as AthleteEvidenceEvent, reset?.payload.resetAt)
          : !isSuppressedRecord(stored.payload as SessionRecord, reset?.payload.resetAt);
      };
      for (const event of bundle.evidenceEvents) {
        if (isSuppressedEvent(event, reset?.payload.resetAt)) continue;
        const targetId = eventDependencyId(event);
        if (targetId && !await targetExists("evidence-event", targetId)) {
          throw conflict("evidence-event", event.id, "invalid-reference");
        }
      }
      for (const record of bundle.sessionRecords) {
        if (isSuppressedRecord(record, reset?.payload.resetAt)) continue;
        if (record.supersedesRecordId && !await targetExists("session-record", record.supersedesRecordId)) {
          throw conflict("session-record", record.id, "invalid-reference");
        }
      }
      const combinedRecordRows = new Map((await allForAthlete<StoredEntity<SessionRecord>>(
        transaction, STORES.records, bundle.athleteId,
      )).map((row) => [row.id, row] as const));
      for (const [index, record] of bundle.sessionRecords.entries()) {
        const incoming: StoredEntity<SessionRecord> = {
          athleteId: bundle.athleteId,
          id: record.id,
          hash: hashes.recordHashes[index],
          payload: record,
          migrationRunId: migrationRunFor(`session-record:${record.id}`),
        };
        const existing = combinedRecordRows.get(record.id);
        if (existing && existing.hash !== incoming.hash) {
          throw conflict("session-record", record.id, "immutable-id-conflict", existing.hash, incoming.hash);
        }
        // Native provenance promotes an exact converter copy; validate the
        // post-import authority set that #insertImmutable will actually store.
        if (!existing || (existing.migrationRunId !== undefined && incoming.migrationRunId === undefined)) {
          combinedRecordRows.set(record.id, incoming);
        }
      }
      assertLinearSessionRecordSet(activeRecordsWithDependencies(
        [...combinedRecordRows.values()], effectiveActiveClaims, reset?.payload.resetAt,
      ));
      for (const [index, event] of bundle.evidenceEvents.entries()) {
        if (isSuppressedEvent(event, reset?.payload.resetAt)) {
          duplicates += 1;
          continue;
        }
        count(await this.#insertImmutable(
          transaction,
          STORES.events,
          event,
          hashes.eventHashes[index],
          migrationRunFor(`evidence-event:${event.id}`),
          true,
        ));
      }
      const recordsByPlan = new Map<string, SessionRecord[]>();
      for (const record of bundle.sessionRecords) {
        const records = recordsByPlan.get(record.planId) ?? [];
        records.push(record);
        recordsByPlan.set(record.planId, records);
      }
      for (const [index, plan] of bundle.sessionPlans.entries()) {
        const records = recordsByPlan.get(plan.id);
        if (!records?.length) throw conflict("session-plan", plan.id, "invalid-reference");
        if (records.every((record) => isSuppressedRecord(record, reset?.payload.resetAt))) {
          duplicates += 1;
          continue;
        }
        count(await this.#insertImmutable(
          transaction,
          STORES.plans,
          plan,
          hashes.planHashes[index],
          migrationRunFor(`session-plan:${plan.id}`),
          true,
        ));
      }
      for (const [index, record] of bundle.sessionRecords.entries()) {
        if (isSuppressedRecord(record, reset?.payload.resetAt)) {
          duplicates += 1;
          continue;
        }
        count(await this.#insertImmutable(
          transaction,
          STORES.records,
          record,
          hashes.recordHashes[index],
          migrationRunFor(`session-record:${record.id}`),
          true,
        ));
      }
      const rolledBackRuns: MigrationRun[] = [];
      for (const [index, run] of bundle.migrationRuns.entries()) {
        const snapshot = await requestResult(transaction.objectStore(STORES.snapshots).get(entityKey(bundle.athleteId, run.snapshotId)));
        if (!snapshot) throw conflict("migration-run", run.id, "invalid-reference");
        count(await this.#putRun(transaction, run, hashes.runHashes[index], true));
        const effective = await requestResult(transaction.objectStore(STORES.runs).get(
          entityKey(bundle.athleteId, run.id),
        )) as StoredEntity<MigrationRun> | undefined;
        if (effective?.payload.status === "rolled-back") rolledBackRuns.push(effective.payload);
      }
      // Install every manifest before cleanup so an active co-owner later in
      // the same bundle protects a shared immutable fact.
      for (const run of rolledBackRuns) await this.#removeRunGenerated(transaction, run);
      await invalidateCache(transaction, bundle.athleteId);
      await transactionDone(transaction);
      return { inserted, duplicates };
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async readSyncUpload(athleteId: AthleteId, limit: number): Promise<readonly SyncUploadItem[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new RangeError("Sync upload limit must be from 1 to 1000");
    const database = await this.#database();
    const transaction = database.transaction(STORES.outbox, "readonly");
    const rows = await allForAthlete<StoredOutbox>(transaction, STORES.outbox, athleteId);
    await transactionDone(transaction);
    return orderOutboxRows(rows)
      .slice(0, limit)
      .map(({ athleteId: _athleteId, ...item }) => item);
  }

  async #prepareSyncItem(athleteId: AthleteId, item: SyncUploadItem): Promise<void> {
    assertStableId(item.id, "sync item ID");
    assertSha256(item.hash, "sync item hash");
    if (item.migrationRunId !== undefined) assertStableId(item.migrationRunId, "sync migration run ID");
    if (await sha256(item.payload) !== item.hash) throw new TypeError(`Sync hash mismatch for ${item.kind}/${item.id}`);
    if (item.kind === "evidence-event") {
      assertValid("Evidence Event", validateAthleteEvidenceEvent(item.payload));
      const payload = item.payload as AthleteEvidenceEvent;
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (payload.id !== item.id) throw new TypeError("Sync evidence ID mismatch");
    } else if (item.kind === "session-plan") {
      assertValid("Session Plan", validateSessionPlan(item.payload));
      const payload = item.payload as SessionPlan;
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (payload.id !== item.id) throw new TypeError("Sync plan ID mismatch");
    } else if (item.kind === "session-record") {
      assertValid("Session Record", validateSessionRecord(item.payload));
      const payload = item.payload as SessionRecord;
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (payload.id !== item.id) throw new TypeError("Sync record ID mismatch");
    } else if (item.kind === "athlete-intent") {
      assertValid("Athlete Intent", validateAthleteIntent(item.payload));
      const payload = item.payload as AthleteIntent;
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (item.id !== athleteId) throw new TypeError("Sync intent ID mismatch");
    } else if (item.kind === "reset-tombstone") {
      validateReset(item.payload as TrainingResetTombstone);
      const payload = item.payload as TrainingResetTombstone;
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (item.id !== athleteId) throw new TypeError("Sync reset ID mismatch");
    } else if (item.kind === "legacy-snapshot") {
      await validateSnapshot(item.payload as LegacyMigrationSnapshot);
      const payload = item.payload as LegacyMigrationSnapshot;
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (payload.id !== item.id) {
        throw new TypeError("Sync snapshot identity mismatch");
      }
    } else if (item.kind === "migration-run") {
      validateRun(item.payload as MigrationRun);
      const payload = item.payload as MigrationRun;
      await validateDeterministicRunId(payload);
      sameAthlete(athleteId, payload.athleteId, item.id);
      if (payload.id !== item.id) throw new TypeError("Sync migration run ID mismatch");
    } else {
      throw new TypeError("Unknown sync entity kind");
    }
  }

  async applySyncDelta(athleteId: AthleteId, delta: SyncDeltaResponse): Promise<void> {
    if (delta.schemaVersion !== VNEXT_PERSISTENCE_SCHEMA_VERSION
      || !Number.isSafeInteger(delta.cursor)
      || delta.cursor < 0
      || typeof delta.hasMore !== "boolean"
      || !Array.isArray(delta.changes)
      || !Array.isArray(delta.acknowledged)
      || !Array.isArray(delta.conflicts)) {
      throw new TypeError("Invalid sync delta");
    }
    if (delta.conflicts.length) throw new VNextEntityConflictError(delta.conflicts[0]);
    if (delta.resetTombstone) {
      validateReset(delta.resetTombstone);
      sameAthlete(athleteId, delta.resetTombstone.athleteId, delta.resetTombstone.id);
    }
    await Promise.all(delta.changes.map((item) => this.#prepareSyncItem(athleteId, item)));
    const resetHash = delta.resetTombstone ? await sha256(delta.resetTombstone) : undefined;
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      if (delta.resetTombstone && resetHash) await this.#putReset(transaction, delta.resetTombstone, resetHash, false);
      const changesByKind = new Map<SyncEntityKind, SyncUploadItem[]>();
      for (const change of delta.changes) {
        const list = changesByKind.get(change.kind) ?? [];
        list.push(change);
        changesByKind.set(change.kind, list);
      }
      for (const change of changesByKind.get("reset-tombstone") ?? []) {
        await this.#putReset(transaction, change.payload as TrainingResetTombstone, change.hash, false, change.migrationRunId);
      }
      for (const change of changesByKind.get("legacy-snapshot") ?? []) {
        await this.#putSnapshot(transaction, change.payload as LegacyMigrationSnapshot, change.hash, false);
      }
      for (const change of changesByKind.get("athlete-intent") ?? []) {
        await this.#putIntent(transaction, change.payload as AthleteIntent, change.hash, false, change.migrationRunId);
      }
      const reset = await this.#currentReset(transaction, athleteId);
      const incomingEvents = new Map((changesByKind.get("evidence-event") ?? [])
        .map((change) => [(change.payload as AthleteEvidenceEvent).id, change.payload as AthleteEvidenceEvent] as const));
      const incomingRecords = new Map((changesByKind.get("session-record") ?? [])
        .map((change) => [(change.payload as SessionRecord).id, change.payload as SessionRecord] as const));
      for (const event of incomingEvents.values()) {
        if (isSuppressedEvent(event, reset?.payload.resetAt)) continue;
        const targetId = eventDependencyId(event);
        if (!targetId) continue;
        const incomingTarget = incomingEvents.get(targetId);
        const storedTarget = incomingTarget ? undefined : await requestResult(transaction.objectStore(STORES.events).get(
          entityKey(athleteId, targetId),
        )) as StoredEntity<AthleteEvidenceEvent> | undefined;
        if ((incomingTarget && isSuppressedEvent(incomingTarget, reset?.payload.resetAt))
          || (!incomingTarget && (!storedTarget || isSuppressedEvent(storedTarget.payload, reset?.payload.resetAt)))) {
          throw conflict("evidence-event", event.id, "invalid-reference");
        }
      }
      for (const record of incomingRecords.values()) {
        if (isSuppressedRecord(record, reset?.payload.resetAt) || !record.supersedesRecordId) continue;
        const incomingTarget = incomingRecords.get(record.supersedesRecordId);
        const storedTarget = incomingTarget ? undefined : await requestResult(transaction.objectStore(STORES.records).get(
          entityKey(athleteId, record.supersedesRecordId),
        )) as StoredEntity<SessionRecord> | undefined;
        if ((incomingTarget && isSuppressedRecord(incomingTarget, reset?.payload.resetAt))
          || (!incomingTarget && (!storedTarget || isSuppressedRecord(storedTarget.payload, reset?.payload.resetAt)))) {
          throw conflict("session-record", record.id, "invalid-reference");
        }
      }
      const currentRunRows = await allForAthlete<StoredEntity<MigrationRun>>(
        transaction, STORES.runs, athleteId,
      );
      const incomingRunChanges = new Map((changesByKind.get("migration-run") ?? [])
        .map((change) => [(change.payload as MigrationRun).id, change.payload as MigrationRun] as const));
      const effectiveActiveClaims = new Set<string>();
      for (const row of currentRunRows) {
        const incoming = incomingRunChanges.get(row.id);
        const remainsActive = row.payload.status === "active" && incoming?.status !== "rolled-back";
        if (remainsActive) for (const ref of row.payload.generatedEntities) {
          effectiveActiveClaims.add(migrationClaimKey(ref.kind, ref.id));
        }
      }
      for (const run of incomingRunChanges.values()) {
        const current = currentRunRows.find((row) => row.id === run.id)?.payload;
        if (run.status !== "active" || current?.status === "rolled-back") continue;
        for (const ref of run.generatedEntities) effectiveActiveClaims.add(migrationClaimKey(ref.kind, ref.id));
      }
      const combinedRecordRows = new Map((await allForAthlete<StoredEntity<SessionRecord>>(
        transaction, STORES.records, athleteId,
      )).map((row) => [row.id, row] as const));
      for (const change of changesByKind.get("session-record") ?? []) {
        const record = change.payload as SessionRecord;
        const incoming: StoredEntity<SessionRecord> = {
          athleteId,
          id: record.id,
          hash: change.hash,
          payload: record,
          migrationRunId: change.migrationRunId,
        };
        const existing = combinedRecordRows.get(record.id);
        if (existing && existing.hash !== incoming.hash) {
          throw conflict("session-record", record.id, "immutable-id-conflict", existing.hash, incoming.hash);
        }
        if (!existing || (existing.migrationRunId !== undefined && incoming.migrationRunId === undefined)) {
          combinedRecordRows.set(record.id, incoming);
        }
      }
      assertLinearSessionRecordSet(activeRecordsWithDependencies(
        [...combinedRecordRows.values()], effectiveActiveClaims, reset?.payload.resetAt,
      ));
      for (const change of changesByKind.get("evidence-event") ?? []) {
        const event = change.payload as AthleteEvidenceEvent;
        if (!isSuppressedEvent(event, reset?.payload.resetAt)) {
          await this.#insertImmutable(transaction, STORES.events, event, change.hash, change.migrationRunId, false);
        }
      }
      for (const change of changesByKind.get("session-plan") ?? []) {
        const plan = change.payload as SessionPlan;
        await this.#insertImmutable(transaction, STORES.plans, plan, change.hash, change.migrationRunId, false);
      }
      for (const change of changesByKind.get("session-record") ?? []) {
        const record = change.payload as SessionRecord;
        if (isSuppressedRecord(record, reset?.payload.resetAt)) continue;
        if (change.migrationRunId) {
          const run = await requestResult(transaction.objectStore(STORES.runs).get(
            entityKey(athleteId, change.migrationRunId),
          )) as StoredEntity<MigrationRun> | undefined;
          if (run?.payload.status === "rolled-back") continue;
        }
        const plan = await requestResult(transaction.objectStore(STORES.plans).get(entityKey(athleteId, record.planId))) as StoredEntity<SessionPlan> | undefined;
        if (!plan) throw conflict("session-record", record.id, "invalid-reference");
        validatePlanRecordPair(plan.payload, record);
        await this.#insertImmutable(transaction, STORES.records, record, change.hash, change.migrationRunId, false);
      }
      const rolledBackRuns: MigrationRun[] = [];
      for (const change of changesByKind.get("migration-run") ?? []) {
        const run = change.payload as MigrationRun;
        const snapshot = await requestResult(transaction.objectStore(STORES.snapshots).get(
          entityKey(athleteId, run.snapshotId),
        )) as StoredEntity<LegacyMigrationSnapshot> | undefined;
        if (!snapshot) throw conflict("migration-run", run.id, "invalid-reference");
        validateRunSnapshotRelationship(run, snapshot.payload);
        await this.#putRun(transaction, run, change.hash, false);
        const effective = await requestResult(transaction.objectStore(STORES.runs).get(
          entityKey(athleteId, run.id),
        )) as StoredEntity<MigrationRun> | undefined;
        if (effective?.payload.status === "rolled-back") rolledBackRuns.push(effective.payload);
      }
      for (const run of rolledBackRuns) await this.#removeRunGenerated(transaction, run);
      await invalidateCache(transaction, athleteId);
      await transactionDone(transaction);
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async acknowledgeSync(
    athleteId: AthleteId,
    acknowledged: readonly Readonly<{ kind: SyncEntityKind; id: string; hash: string }>[],
    cursor: number,
  ): Promise<void> {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new RangeError("Invalid sync cursor");
    const database = await this.#database();
    const transaction = database.transaction([STORES.outbox, STORES.sync], "readwrite");
    try {
      for (const acknowledgement of acknowledged) {
        const key = outboxKey(athleteId, acknowledgement.kind, acknowledgement.id);
        const current = await requestResult(transaction.objectStore(STORES.outbox).get(key)) as StoredOutbox | undefined;
        if (current?.hash === acknowledgement.hash) await requestResult(transaction.objectStore(STORES.outbox).delete(key));
      }
      const state = await requestResult(transaction.objectStore(STORES.sync).get(athleteId)) as StoredSyncState | undefined;
      if (!state || cursor > state.cursor) {
        const next: StoredSyncState = { athleteId, cursor };
        await requestResult(transaction.objectStore(STORES.sync).put(next));
      }
      await transactionDone(transaction);
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  async getSyncCursor(athleteId: AthleteId): Promise<number> {
    const database = await this.#database();
    const transaction = database.transaction(STORES.sync, "readonly");
    const state = await requestResult(transaction.objectStore(STORES.sync).get(athleteId)) as StoredSyncState | undefined;
    await transactionDone(transaction);
    return state?.cursor ?? 0;
  }

  async clearAthlete(athleteId: AthleteId): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    try {
      await Promise.all(Object.values(STORES).map((storeName) => deleteForAthlete(transaction, storeName, athleteId)));
      await transactionDone(transaction);
    } catch (error) {
      return abortWith(transaction, error);
    }
  }

  close(): void {
    void this.#databasePromise.then((database) => database.close());
  }
}

export const createVNextShadowStore = (options: VNextShadowStoreOptions = {}): VNextShadowStore => {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("IndexedDB is unavailable");
  return new IndexedDbVNextShadowStore(factory, options.databaseName ?? VNEXT_SHADOW_DATABASE_NAME);
};

/** Factory-reset helper. It can never target the live v1.2 profile database. */
export const deleteVNextShadowDatabase = async (options: VNextShadowStoreOptions = {}): Promise<void> => {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) return;
  const databaseName = options.databaseName ?? VNEXT_SHADOW_DATABASE_NAME;
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to delete vNext shadow database"));
    request.onblocked = () => reject(new Error("vNext shadow database deletion is blocked"));
  });
};

/** Account-lifecycle helper; removes only one athlete's isolated shadow data. */
export const clearVNextShadowAthleteData = async (
  profileId: string,
  options: VNextShadowStoreOptions = {},
): Promise<void> => {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) return;
  const store = new IndexedDbVNextShadowStore(factory, options.databaseName ?? VNEXT_SHADOW_DATABASE_NAME);
  try {
    await store.clearAthlete(profileId as AthleteId);
  } finally {
    store.close();
  }
};
