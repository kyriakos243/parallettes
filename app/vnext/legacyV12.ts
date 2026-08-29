/**
 * Read-only v1.2 compatibility boundary.
 *
 * This module deliberately does not emit vNext events, Session Records, or
 * profile writes. Phase 4 will own conversion after its policies are approved.
 */

export const LEGACY_V12_SOURCE_VERSION = "1.2" as const;

export type LegacyV12SessionSource = Readonly<{
  id: string;
  completedAt: string;
  day?: number;
  mode?: string;
  status?: "complete" | "modified" | "partial";
  seconds?: number;
  exerciseIds?: readonly string[];
  completedExerciseIds?: readonly string[];
  skippedExerciseIds?: readonly string[];
  skippedBlockIds?: readonly string[];
  level?: string;
  title?: string;
  lab?: boolean;
  advancesProgram?: boolean;
  exerciseReviews?: Readonly<Record<
    string,
    Readonly<{
      feedback: "easy" | "right" | "hard";
      achieved: boolean;
    }>
  >>;
}>;

export type LegacyV12ProgressionHint = Readonly<{
  cleanSessions: number;
  lastFeedback?: "easy" | "right" | "hard";
}>;

export type LegacyV12ProfileSource = Readonly<{
  profileId: string;
  username: string;
  schemaVersion: 1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  progressResetAt?: string;
  nextProgramDay: number;
  history: readonly LegacyV12SessionSource[];
  readiness: Readonly<Record<string, boolean>>;
  readinessUpdatedAt: Readonly<Record<string, string>>;
  progression: Readonly<Record<string, LegacyV12ProgressionHint>>;
  equipment: readonly string[];
  preferences: Readonly<Record<string, unknown>>;
}>;

/**
 * An exact compatibility view of legacy facts. Field names intentionally say
 * "claim" and "hint": this boundary must not upgrade them into vNext proof.
 */
export type LegacyV12CompatibilitySnapshot = Readonly<{
  sourceVersion: typeof LEGACY_V12_SOURCE_VERSION;
  sourceSchemaVersion: 1;
  sourceRevision: number;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  profileId: string;
  username: string;
  progressResetAt?: string;
  nextProgramDay: number;
  history: readonly LegacyV12SessionSource[];
  readinessClaims: Readonly<Record<string, boolean>>;
  readinessClaimUpdatedAt: Readonly<Record<string, string>>;
  progressionHints: Readonly<Record<string, LegacyV12ProgressionHint>>;
  equipment: readonly string[];
  preferences: Readonly<Record<string, unknown>>;
}>;

export type LegacyV12CompatibilityAdapter = Readonly<{
  sourceVersion: typeof LEGACY_V12_SOURCE_VERSION;
  mode: "read-only";
  capture(profile: LegacyV12ProfileSource): LegacyV12CompatibilitySnapshot;
}>;

export const captureLegacyV12CompatibilitySnapshot = (
  profile: LegacyV12ProfileSource,
): LegacyV12CompatibilitySnapshot => {
  // v1.2 profiles are JSON-compatible. Detach every collection so the
  // captured compatibility view cannot change if the live profile mutates.
  const history = structuredClone(profile.history);
  const readinessClaims = structuredClone(profile.readiness);
  const readinessClaimUpdatedAt = structuredClone(profile.readinessUpdatedAt);
  const progressionHints = structuredClone(profile.progression);
  const equipment = structuredClone(profile.equipment);
  const preferences = structuredClone(profile.preferences);
  return {
    sourceVersion: LEGACY_V12_SOURCE_VERSION,
    sourceSchemaVersion: profile.schemaVersion,
    sourceRevision: profile.revision,
    sourceCreatedAt: profile.createdAt,
    sourceUpdatedAt: profile.updatedAt,
    profileId: profile.profileId,
    username: profile.username,
    ...(profile.progressResetAt ? { progressResetAt: profile.progressResetAt } : {}),
    nextProgramDay: profile.nextProgramDay,
    history,
    readinessClaims,
    readinessClaimUpdatedAt,
    progressionHints,
    equipment,
    preferences,
  };
};

export const legacyV12CompatibilityAdapter: LegacyV12CompatibilityAdapter = {
  sourceVersion: LEGACY_V12_SOURCE_VERSION,
  mode: "read-only",
  capture: captureLegacyV12CompatibilitySnapshot,
};
