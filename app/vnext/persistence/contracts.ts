import type {
  AthleteEvidenceEvent,
  AthleteId,
  AthleteIntent,
  DefinitionVersion,
  DerivedAthleteState,
  IsoTimestamp,
  ProjectionVersion,
  SessionPlan,
  SessionRecord,
} from "../contracts";
import type { AssessmentDraft } from "../assessment/contracts";
import type { LegacyV12ProfileSource } from "../legacyV12";

export const VNEXT_PERSISTENCE_SCHEMA_VERSION = 1 as const;
export const LEGACY_V12_CONVERTER_VERSION = 1 as const;

export type ImmutableEntityKind = "evidence-event" | "session-plan" | "session-record";
export type SyncEntityKind = ImmutableEntityKind
  | "athlete-intent"
  | "reset-tombstone"
  | "legacy-snapshot"
  | "migration-run";

export type TrainingResetTombstone = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  id: string;
  athleteId: AthleteId;
  resetAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  source: "athlete-reset" | "legacy-v1.2" | "import" | "sync";
}>;

export type ProjectionCacheEntry = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  athleteId: AthleteId;
  /** Exact deterministic projection cutoff; time-sensitive state cannot cross it. */
  asOf: IsoTimestamp;
  projectionVersion: ProjectionVersion;
  catalogueVersion: DefinitionVersion;
  definitionFingerprint: string;
  policyId: string;
  policyVersion: ProjectionVersion;
  sourceFingerprint: string;
  /** Exact request-scoped trainability set projected into the cached state. */
  trainabilityRequestFingerprint: string;
  resetAt?: IsoTimestamp;
  storedAt: IsoTimestamp;
  state: DerivedAthleteState;
}>;

/** Every input that can change a derived projection is part of cache identity. */
export type ProjectionCacheLookup = Readonly<Pick<
  ProjectionCacheEntry,
  | "athleteId"
  | "asOf"
  | "projectionVersion"
  | "catalogueVersion"
  | "definitionFingerprint"
  | "policyId"
  | "policyVersion"
  | "sourceFingerprint"
  | "trainabilityRequestFingerprint"
  | "resetAt"
>>;

/** Exact, detached recovery material. It never contains account credentials. */
export type LegacyMigrationSnapshot = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  id: string;
  athleteId: AthleteId;
  converterVersion: typeof LEGACY_V12_CONVERTER_VERSION;
  sourceVersion: "1.2";
  sourceFingerprint: string;
  /**
   * Deterministic source capture boundary, copied from sourceProfile.updatedAt.
   * A caller's later wall-clock capture time is validated but is not identity.
   */
  capturedAt: IsoTimestamp;
  resetAt?: IsoTimestamp;
  sourceProfile: LegacyV12ProfileSource;
}>;

export type PersistedEntityRef = Readonly<{
  kind: ImmutableEntityKind;
  id: string;
}>;

export type MigrationRun = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  id: string;
  athleteId: AthleteId;
  converterVersion: typeof LEGACY_V12_CONVERTER_VERSION;
  sourceVersion: "1.2";
  snapshotId: string;
  sourceFingerprint: string;
  /** Deterministic source capture boundary shared with the snapshot. */
  createdAt: IsoTimestamp;
  status: "active" | "rolled-back";
  generatedEntities: readonly PersistedEntityRef[];
  warnings: readonly string[];
  rolledBackAt?: IsoTimestamp;
}>;

export type LegacyConversion = Readonly<{
  snapshot: LegacyMigrationSnapshot;
  run: MigrationRun;
  resetTombstone?: TrainingResetTombstone;
  intent: AthleteIntent;
  evidenceEvents: readonly AthleteEvidenceEvent[];
  sessionPlans: readonly SessionPlan[];
  sessionRecords: readonly SessionRecord[];
}>;

export type ImmutableEntityProvenance = Readonly<{
  kind: ImmutableEntityKind;
  id: string;
}> & (
  | Readonly<{ origin: "native" }>
  | Readonly<{ origin: "legacy-v1.2"; migrationRunId: string }>
);

export type ObservationExportBundle = Readonly<{
  format: "parallette25-vnext-observations";
  formatVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  exportedAt: IsoTimestamp;
  athleteId: AthleteId;
  catalogueVersions: readonly DefinitionVersion[];
  projectionVersions: readonly ProjectionVersion[];
  definitionFingerprints: readonly string[];
  policyVersions: readonly Readonly<{ id: string; version: ProjectionVersion }>[];
  resetTombstone?: TrainingResetTombstone;
  intent?: AthleteIntent;
  /** Present only when the current intent is still the converter-owned value. */
  intentMigrationRunId?: string;
  evidenceEvents: readonly AthleteEvidenceEvent[];
  sessionPlans: readonly SessionPlan[];
  sessionRecords: readonly SessionRecord[];
  /** Exact original ownership for every exported immutable entity. */
  immutableEntityProvenance: readonly ImmutableEntityProvenance[];
  migrationSnapshots: readonly LegacyMigrationSnapshot[];
  migrationRuns: readonly MigrationRun[];
}>;

export type EntityConflict = Readonly<{
  kind: SyncEntityKind;
  id: string;
  localHash?: string;
  incomingHash?: string;
  reason: "immutable-id-conflict" | "intent-timestamp-conflict" | "invalid-reference";
}>;

export type AppendResult = Readonly<{
  status: "inserted" | "duplicate" | "ignored-older";
  hash: string;
}>;

export type ProjectionSources = Readonly<{
  athleteId: AthleteId;
  resetTombstone?: TrainingResetTombstone;
  intent?: AthleteIntent;
  evidenceEvents: readonly AthleteEvidenceEvent[];
  sessionPlans: readonly SessionPlan[];
  sessionRecords: readonly SessionRecord[];
  sourceFingerprint: string;
}>;

export type SyncUploadItem = Readonly<{
  kind: SyncEntityKind;
  id: string;
  hash: string;
  payload: AthleteEvidenceEvent
    | SessionPlan
    | SessionRecord
    | AthleteIntent
    | TrainingResetTombstone
    | LegacyMigrationSnapshot
    | MigrationRun;
  migrationRunId?: string;
}>;

export type SyncDeltaRequest = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  /** Reader compatibility, independent of immutable observation/schema versions. */
  readerVersion?: number;
  cursor: number;
  upload: readonly SyncUploadItem[];
  limit: number;
}>;

export type SyncDeltaResponse = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  minimumReaderVersion?: number;
  cursor: number;
  hasMore: boolean;
  resetTombstone?: TrainingResetTombstone;
  changes: readonly SyncUploadItem[];
  acknowledged: readonly Readonly<{ kind: SyncEntityKind; id: string; status: "inserted" | "duplicate" | "ignored-reset" | "ignored-older" }>[];
  conflicts: readonly EntityConflict[];
}>;

export type SyncItemRef = Readonly<{ kind: SyncEntityKind; id: string }>;

/**
 * Transport state on one outbox row that the account would not accept. It is
 * not an observation, is never exported and never changes a saved fact. Rows
 * that depend on a held row are blocked with it (derived, never persisted).
 */
export type SyncHold = Readonly<{
  reason: "conflict" | "rejected" | "too-large";
  /** Conflict reason or account error code. */
  detail: string;
  /** Hash of the held local version when it was set aside. */
  localHash: string;
  remoteHash?: string;
  /** Account versions that could not be applied beside the held local version. */
  stashed: readonly SyncUploadItem[];
  heldAt: IsoTimestamp;
  /** Client build that set aside a rejected/too-large row; a new build retries it. */
  heldBuild?: string;
}>;

export type SyncHoldRequest = SyncItemRef & Readonly<{
  hash: string;
  reason: SyncHold["reason"];
  detail: string;
  remoteHash?: string;
  heldAt: IsoTimestamp;
  heldBuild?: string;
}>;

export type UnsyncedItem = SyncItemRef & Readonly<{
  hash: string;
  /** pending uploads normally; held was set aside; blocked depends on a held row. */
  state: "pending" | "held" | "blocked";
  payload: SyncUploadItem["payload"];
  hold?: SyncHold;
}>;

export type SyncHoldResolution = "keep-local" | "use-account-intent" | "retry";

export type LocalAthleteSummary = Readonly<{
  athleteId: AthleteId;
  sessionCount: number;
  lastActivityAt?: IsoTimestamp;
}>;

/** Optional atomic precondition for account sign-out, never reset/deletion. */
export type VNextSignOutClearGuard = Readonly<{
  assessmentDraft: AssessmentDraft | null;
  /**
   * Exact unsynced rows the athlete explicitly chose to discard. Without it,
   * any outbox row still refuses the clear.
   */
  outboxFingerprint?: string;
}>;

export type VNextShadowStore = Readonly<{
  saveAssessmentDraft(draft: AssessmentDraft): Promise<void>;
  readAssessmentDraft(athleteId: AthleteId): Promise<AssessmentDraft | null>;
  deleteAssessmentDraft(athleteId: AthleteId): Promise<void>;
  appendEvidenceEvent(event: AthleteEvidenceEvent, migrationRunId?: string): Promise<AppendResult>;
  appendSession(plan: SessionPlan, record: SessionRecord, migrationRunId?: string): Promise<Readonly<{
    plan: AppendResult;
    record: AppendResult;
  }>>;
  putAthleteIntent(intent: AthleteIntent): Promise<AppendResult>;
  applyProgressReset(tombstone: TrainingResetTombstone): Promise<AppendResult>;
  readProjectionSources(athleteId: AthleteId): Promise<ProjectionSources>;
  putDerivedCache(entry: ProjectionCacheEntry): Promise<void>;
  getDerivedCache(lookup: ProjectionCacheLookup): Promise<ProjectionCacheEntry | null>;
  applyLegacyConversion(conversion: LegacyConversion): Promise<Readonly<{ status: "inserted" | "duplicate" }>>;
  rollbackMigrationRun(athleteId: AthleteId, runId: string, rolledBackAt: IsoTimestamp): Promise<void>;
  exportBundle(
    athleteId: AthleteId,
    metadata: Pick<ObservationExportBundle, "exportedAt" | "catalogueVersions" | "projectionVersions" | "definitionFingerprints" | "policyVersions">,
  ): Promise<ObservationExportBundle>;
  importBundle(bundle: ObservationExportBundle): Promise<Readonly<{ inserted: number; duplicates: number }>>;
  /** Next uploadable rows; held rows and rows depending on them are excluded. */
  readSyncUpload(athleteId: AthleteId, limit: number): Promise<readonly SyncUploadItem[]>;
  /** Sets aside rows at their exact current hash; returns how many were newly held. */
  holdSyncItems(athleteId: AthleteId, holds: readonly SyncHoldRequest[]): Promise<number>;
  /** Clears rejected/too-large holds made by a different client build. */
  releaseBuildHolds(athleteId: AthleteId, currentBuild: string): Promise<number>;
  readSyncHolds(athleteId: AthleteId): Promise<readonly UnsyncedItem[]>;
  /** Every row not yet accepted by the account, in upload order. */
  readUnsyncedItems(athleteId: AthleteId): Promise<readonly UnsyncedItem[]>;
  resolveSyncHold(athleteId: AthleteId, ref: SyncItemRef, resolution: SyncHoldResolution, now: IsoTimestamp): Promise<void>;
  /** Athletes with saved training in this database (read-only). */
  listAthletes(): Promise<readonly LocalAthleteSummary[]>;
  applySyncDelta(athleteId: AthleteId, delta: SyncDeltaResponse): Promise<void>;
  acknowledgeSync(
    athleteId: AthleteId,
    acknowledged: readonly Readonly<{ kind: SyncEntityKind; id: string; hash: string }>[],
    cursor: number,
  ): Promise<void>;
  getSyncCursor(athleteId: AthleteId): Promise<number>;
  clearAthlete(athleteId: AthleteId, signOutGuard?: VNextSignOutClearGuard): Promise<void>;
  close(): void;
}>;
