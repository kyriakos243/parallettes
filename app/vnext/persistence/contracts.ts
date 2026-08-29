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
  cursor: number;
  upload: readonly SyncUploadItem[];
  limit: number;
}>;

export type SyncDeltaResponse = Readonly<{
  schemaVersion: typeof VNEXT_PERSISTENCE_SCHEMA_VERSION;
  cursor: number;
  hasMore: boolean;
  resetTombstone?: TrainingResetTombstone;
  changes: readonly SyncUploadItem[];
  acknowledged: readonly Readonly<{ kind: SyncEntityKind; id: string; status: "inserted" | "duplicate" | "ignored-reset" | "ignored-older" }>[];
  conflicts: readonly EntityConflict[];
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
  readSyncUpload(athleteId: AthleteId, limit: number): Promise<readonly SyncUploadItem[]>;
  applySyncDelta(athleteId: AthleteId, delta: SyncDeltaResponse): Promise<void>;
  acknowledgeSync(
    athleteId: AthleteId,
    acknowledged: readonly Readonly<{ kind: SyncEntityKind; id: string; hash: string }>[],
    cursor: number,
  ): Promise<void>;
  getSyncCursor(athleteId: AthleteId): Promise<number>;
  clearAthlete(athleteId: AthleteId): Promise<void>;
  close(): void;
}>;
