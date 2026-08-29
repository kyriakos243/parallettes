export const VNEXT_PRODUCTION_RELEASE_ID = "parallette25-vnext.1";
export const VNEXT_SOURCE_CANDIDATE_ID = "parallette25-vnext-rc.3";
export const VNEXT_SOURCE_FINGERPRINT =
  "1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47";
export const VNEXT_REMOTE_MIGRATION_ID = "0002_vnext_shadow_observations.sql";
export const VNEXT_SYNC_ROUTE = "/vnext/shadow/sync";
export const VNEXT_PRODUCTION_DATABASE_ID = "4dfe10d8-e66e-4115-ac7d-6be01eacd75e";
export const VNEXT_SCHEMA_FINGERPRINT =
  "2e5ff8e06af41b2e0aad00671d13c995c938ba5fc0db2db1023f9f5549dddc9d";

const LEGACY_TABLES = Object.freeze([
  "accounts",
  "auth_limits",
  "sessions",
]);

const VNEXT_TABLES = Object.freeze([
  "vnext_shadow_athlete_intents",
  "vnext_shadow_changes",
  "vnext_shadow_evidence_events",
  "vnext_shadow_legacy_snapshots",
  "vnext_shadow_migration_runs",
  "vnext_shadow_projection_caches",
  "vnext_shadow_reset_tombstones",
  "vnext_shadow_rolled_back_entities",
  "vnext_shadow_session_plans",
  "vnext_shadow_session_records",
  "vnext_shadow_sync_heads",
]);

const VNEXT_IMMUTABILITY_TRIGGERS = Object.freeze([
  "vnext_shadow_events_immutable",
  "vnext_shadow_plans_immutable",
  "vnext_shadow_records_immutable",
  "vnext_shadow_snapshots_immutable",
]);

const configuredValue = (value) => typeof value === "string" && value.trim()
  ? value.trim()
  : null;

const hexDigest = async (value) => [...new Uint8Array(await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(value),
))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const schemaObjects = async (env) => {
  const required = [
    ...LEGACY_TABLES.map((name) => ["table", name]),
    ...VNEXT_TABLES.map((name) => ["table", name]),
    ...VNEXT_IMMUTABILITY_TRIGGERS.map((name) => ["trigger", name]),
  ];
  const placeholders = required.map(() => "?").join(", ");
  const result = await env.DB.prepare(`SELECT type, name, sql FROM sqlite_schema
    WHERE name IN (${placeholders})`)
    .bind(...required.map(([, name]) => name)).all();
  return result.results ?? [];
};

const vNextSchemaFingerprint = async (env) => {
  const result = await env.DB.prepare(`SELECT type, name, sql FROM sqlite_schema
    WHERE name LIKE 'vnext_shadow_%'
      AND type IN ('table', 'index', 'trigger')
      AND sql IS NOT NULL
    ORDER BY type, name`).all();
  const canonical = (result.results ?? [])
    .map((row) => `${row.type}:${row.name}:${String(row.sql).replace(/\s+/gu, " ").trim()}`)
    .join("\n");
  return canonical ? hexDigest(canonical) : null;
};

const migrationHistoryReady = async (env) => {
  try {
    const row = await env.DB.prepare(
      "SELECT 1 AS applied FROM d1_migrations WHERE name = ? LIMIT 1",
    ).bind(VNEXT_REMOTE_MIGRATION_ID).first();
    return Boolean(row);
  } catch {
    return false;
  }
};

const allPresent = (found, type, names) => names.every((name) => found.has(`${type}:${name}`));

/**
 * Public, read-only release health. It deliberately reports deployment identity,
 * schema readiness and sync enablement as separate gates: a healthy legacy API
 * is not by itself evidence that the vNext cutover is ready.
 */
export const buildProfileApiReleaseHealth = async (env) => {
  const rows = await schemaObjects(env);
  const found = new Set(rows.map((row) => `${row.type}:${row.name}`));
  const legacyReady = allPresent(found, "table", LEGACY_TABLES);
  const observationTablesReady = allPresent(found, "table", VNEXT_TABLES);
  const immutabilityReady = allPresent(found, "trigger", VNEXT_IMMUTABILITY_TRIGGERS);
  const [schemaFingerprint, migrationApplied] = await Promise.all([
    observationTablesReady && immutabilityReady ? vNextSchemaFingerprint(env) : Promise.resolve(null),
    migrationHistoryReady(env),
  ]);
  const schemaFingerprintReady = schemaFingerprint === VNEXT_SCHEMA_FINGERPRINT;
  const observationsReady = observationTablesReady && immutabilityReady
    && schemaFingerprintReady && migrationApplied;

  const releaseId = configuredValue(env.VNEXT_RELEASE_ID);
  const sourceCandidateId = configuredValue(env.VNEXT_RELEASE_SOURCE_CANDIDATE);
  const sourceFingerprint = configuredValue(env.VNEXT_RELEASE_SOURCE_FINGERPRINT);
  const databaseId = configuredValue(env.VNEXT_DATABASE_ID);
  const identityReady = releaseId === VNEXT_PRODUCTION_RELEASE_ID
    && sourceCandidateId === VNEXT_SOURCE_CANDIDATE_ID
    && sourceFingerprint === VNEXT_SOURCE_FINGERPRINT
    && databaseId === VNEXT_PRODUCTION_DATABASE_ID;
  const syncEnabled = env.VNEXT_SHADOW_MODE === "true";
  const productionAuthorityEnabled = env.VNEXT_PRODUCTION_AUTHORITY_MODE === "true";

  return {
    ok: legacyReady,
    auth: "password",
    storage: "d1",
    capturedAt: new Date().toISOString(),
    release: {
      id: releaseId,
      sourceCandidateId,
      sourceFingerprint,
      identityReady,
      databaseId,
      databaseIdentityReady: databaseId === VNEXT_PRODUCTION_DATABASE_ID,
    },
    schema: {
      legacyReady,
      observationsReady,
      immutabilityReady,
      requiredMigration: VNEXT_REMOTE_MIGRATION_ID,
      migrationHistoryReady: migrationApplied,
      fingerprint: schemaFingerprint,
      expectedFingerprint: VNEXT_SCHEMA_FINGERPRINT,
      fingerprintReady: schemaFingerprintReady,
    },
    vnext: {
      syncRoute: VNEXT_SYNC_ROUTE,
      syncEnabled,
      productionAuthorityEnabled,
      ready: identityReady && observationsReady && syncEnabled && productionAuthorityEnabled,
    },
  };
};
