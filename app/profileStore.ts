export type SaveMode = "normal" | "practice" | "guest";

export type ProfileSessionRecord = {
  id: string;
  completedAt: string;
  day?: number;
  mode?: SaveMode | string;
  status?: "complete" | "modified" | "partial";
  seconds?: number;
  exerciseIds?: string[];
  completedExerciseIds?: string[];
  skippedExerciseIds?: string[];
  skippedBlockIds?: string[];
  level?: string;
  title?: string;
  lab?: boolean;
};

export type ProfileRecord = {
  profileId: string;
  username: string;
  schemaVersion: 1;
  /** Last revision accepted by the remote store. Local edits keep this base revision. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  nextProgramDay: number;
  history: ProfileSessionRecord[];
  readiness: Record<string, boolean>;
  progression: Record<string, { cleanSessions: number; lastFeedback?: "easy" | "right" | "hard" }>;
  equipment: string[];
  preferences: Record<string, unknown>;
  pendingSync?: boolean;
  lastSyncedAt?: string;
  syncError?: string;
};

const DB_NAME = "parallette25-v2";
const DB_VERSION = 2;
const PROFILE_STORE = "profiles";
const INDEX_KEY = "parallette25-profile-index-v1";
const REMOTE_API = (import.meta.env.VITE_PROFILE_API_URL as string | undefined)?.replace(/\/$/u, "");
export const remoteSyncAvailable = Boolean(REMOTE_API);

const now = () => new Date().toISOString();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sanitizeName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 32);
const timestamp = (value?: string) => value ? Date.parse(value) || 0 : 0;

export const newProfile = (username: string): ProfileRecord => ({
  profileId: makeId(), username: sanitizeName(username) || "Athlete", schemaVersion: 1, revision: 0,
  createdAt: now(), updatedAt: now(), nextProgramDay: 1, history: [], readiness: {}, progression: {},
  equipment: ["parallettes", "floor", "wall"], preferences: { soundOn: true }, pendingSync: Boolean(REMOTE_API),
});

const normalizeProfile = (profile: ProfileRecord): ProfileRecord => ({
  ...newProfile(profile.username),
  ...profile,
  username: sanitizeName(profile.username) || "Athlete",
  schemaVersion: 1,
  revision: Math.max(0, Number(profile.revision) || 0),
  history: Array.isArray(profile.history) ? profile.history : [],
  readiness: profile.readiness && typeof profile.readiness === "object" ? profile.readiness : {},
  progression: profile.progression && typeof profile.progression === "object" ? profile.progression : {},
  equipment: Array.isArray(profile.equipment) && profile.equipment.length ? profile.equipment : ["parallettes", "floor", "wall"],
  preferences: profile.preferences && typeof profile.preferences === "object" ? profile.preferences : {},
});

const localProfiles = (): ProfileRecord[] => {
  try {
    const value = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(value) ? value.map(normalizeProfile) : [];
  } catch { return []; }
};
const saveLocalMirror = (profiles: ProfileRecord[]) => localStorage.setItem(INDEX_KEY, JSON.stringify(profiles));

const openDb = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
  if (typeof indexedDB === "undefined") return resolve(null);
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(PROFILE_STORE)) {
      request.result.createObjectStore(PROFILE_STORE, { keyPath: "profileId" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

async function listLocalProfiles(): Promise<ProfileRecord[]> {
  const db = await openDb();
  if (!db) return localProfiles();
  return new Promise((resolve) => {
    const request = db.transaction(PROFILE_STORE).objectStore(PROFILE_STORE).getAll();
    request.onsuccess = () => {
      const profiles = (request.result as ProfileRecord[]).map(normalizeProfile);
      resolve((profiles.length ? profiles : localProfiles()).sort((a, b) => a.username.localeCompare(b.username)));
    };
    request.onerror = () => resolve(localProfiles());
  });
}

const cacheProfile = async (profile: ProfileRecord) => {
  const normalized = normalizeProfile(profile);
  const mirror = [...localProfiles().filter((item) => item.profileId !== normalized.profileId), normalized];
  saveLocalMirror(mirror);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).put(normalized);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
};

const newest = (a: ProfileRecord, b: ProfileRecord) => timestamp(a.updatedAt) >= timestamp(b.updatedAt) ? a : b;

/** Merge append-only training evidence so a second device cannot silently erase a completed session. */
export function mergeProfiles(local: ProfileRecord, remote: ProfileRecord): ProfileRecord {
  const localProfile = normalizeProfile(local);
  const remoteProfile = normalizeProfile(remote);
  const preferred = newest(localProfile, remoteProfile);
  const older = preferred === localProfile ? remoteProfile : localProfile;
  const sessions = new Map(remoteProfile.history.map((item) => [item.id, item]));
  for (const item of localProfile.history) sessions.set(item.id, { ...sessions.get(item.id), ...item });
  const progression = { ...older.progression };
  for (const [id, value] of Object.entries(preferred.progression)) {
    const previous = progression[id];
    progression[id] = {
      cleanSessions: Math.max(previous?.cleanSessions ?? 0, value.cleanSessions ?? 0),
      ...(value.lastFeedback ? { lastFeedback: value.lastFeedback } : previous?.lastFeedback ? { lastFeedback: previous.lastFeedback } : {}),
    };
  }
  const readinessKeys = new Set([...Object.keys(localProfile.readiness), ...Object.keys(remoteProfile.readiness)]);
  const mergedReadiness = Object.fromEntries([...readinessKeys].map((id) => [id, localProfile.readiness[id] === true || remoteProfile.readiness[id] === true]));
  const remoteSessions = new Set(remoteProfile.history.map((item) => item.id));
  const remoteMissingEvidence = localProfile.history.some((item) => !remoteSessions.has(item.id)) ||
    Object.entries(progression).some(([id, value]) => value.cleanSessions > (remoteProfile.progression[id]?.cleanSessions ?? 0));
  return normalizeProfile({
    ...older,
    ...preferred,
    profileId: localProfile.profileId,
    history: [...sessions.values()].sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt)),
    readiness: mergedReadiness,
    progression,
    revision: Math.max(localProfile.revision, remoteProfile.revision),
    pendingSync: localProfile.pendingSync === true || remoteMissingEvidence,
    lastSyncedAt: remoteProfile.lastSyncedAt ?? localProfile.lastSyncedAt,
  });
}

type RemoteResult = { profile?: ProfileRecord; conflict?: ProfileRecord; error?: string };

async function putRemote(profile: ProfileRecord, revision: number): Promise<RemoteResult> {
  if (!REMOTE_API) return { profile: { ...profile, pendingSync: false } };
  try {
    const response = await fetch(`${REMOTE_API}/profiles/${encodeURIComponent(profile.profileId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": String(revision) },
      body: JSON.stringify(profile),
    });
    const payload = await response.json().catch(() => ({})) as { profile?: ProfileRecord; error?: string } & Partial<ProfileRecord>;
    if (response.status === 409 && payload.profile) return { conflict: normalizeProfile(payload.profile) };
    if (!response.ok) return { error: payload.error ?? `Sync failed (${response.status})` };
    const saved = (payload.profileId ? payload : payload.profile) as ProfileRecord | undefined;
    return saved ? { profile: normalizeProfile(saved) } : { error: "Remote store returned no profile" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Network unavailable" };
  }
}

async function pushWithConflictMerge(profile: ProfileRecord): Promise<ProfileRecord> {
  const first = await putRemote(profile, profile.revision);
  if (first.profile) {
    const saved = { ...first.profile, pendingSync: false, syncError: undefined, lastSyncedAt: now() };
    await cacheProfile(saved);
    return saved;
  }
  if (first.conflict) {
    const merged = { ...mergeProfiles(profile, first.conflict), pendingSync: true, revision: first.conflict.revision, updatedAt: now() };
    await cacheProfile(merged);
    const retry = await putRemote(merged, first.conflict.revision);
    if (retry.profile) {
      const saved = { ...retry.profile, pendingSync: false, syncError: undefined, lastSyncedAt: now() };
      await cacheProfile(saved);
      return saved;
    }
    const pending = { ...merged, pendingSync: true, syncError: retry.error ?? "Revision conflict needs retry" };
    await cacheProfile(pending);
    return pending;
  }
  const pending = { ...profile, pendingSync: true, syncError: first.error ?? "Sync unavailable" };
  await cacheProfile(pending);
  return pending;
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  const local = await listLocalProfiles();
  if (!REMOTE_API) return local;
  try {
    const response = await fetch(`${REMOTE_API}/profiles`);
    if (!response.ok) return local;
    const payload = await response.json() as ProfileRecord[] | { profiles?: Array<ProfileRecord | Pick<ProfileRecord, "profileId" | "username">> };
    const listed = Array.isArray(payload) ? payload : payload.profiles ?? [];
    const remote = await Promise.all(listed.map(async (item) => {
      if ("revision" in item && "history" in item) return normalizeProfile(item as ProfileRecord);
      const detail = await fetch(`${REMOTE_API}/profiles/${encodeURIComponent(item.profileId)}`);
      return detail.ok ? normalizeProfile(await detail.json() as ProfileRecord) : null;
    }));
    const merged = new Map(local.map((item) => [item.profileId, item]));
    for (const item of remote) {
      if (!item) continue;
      const cached = merged.get(item.profileId);
      const reconciled = cached ? mergeProfiles(cached, item) : item;
      merged.set(item.profileId, reconciled);
      await cacheProfile(reconciled);
    }
    return [...merged.values()].sort((a, b) => a.username.localeCompare(b.username));
  } catch { return local; }
}

export async function saveProfile(profile: ProfileRecord): Promise<ProfileRecord> {
  const current = await getProfile(profile.profileId);
  const localDraft = normalizeProfile({
    ...current,
    ...profile,
    revision: Math.max(profile.revision, current?.revision ?? 0),
    updatedAt: now(),
    pendingSync: Boolean(REMOTE_API),
    syncError: undefined,
  });
  await cacheProfile(localDraft);
  return REMOTE_API ? pushWithConflictMerge(localDraft) : { ...localDraft, pendingSync: false };
}

export async function getProfile(profileId: string): Promise<ProfileRecord | null> {
  return (await listLocalProfiles()).find((profile) => profile.profileId === profileId) ?? null;
}

export async function syncProfile(profile: ProfileRecord): Promise<ProfileRecord> {
  if (!REMOTE_API) return { ...profile, pendingSync: false };
  try {
    const response = await fetch(`${REMOTE_API}/profiles/${encodeURIComponent(profile.profileId)}`);
    if (response.status === 404) return pushWithConflictMerge({ ...profile, revision: 0, pendingSync: true });
    if (!response.ok) throw new Error(`Sync failed (${response.status})`);
    const remote = normalizeProfile(await response.json() as ProfileRecord);
    const merged = mergeProfiles(profile, remote);
    if (profile.pendingSync || timestamp(profile.updatedAt) > timestamp(remote.updatedAt) || merged.history.length > remote.history.length) {
      return pushWithConflictMerge({ ...merged, revision: remote.revision, pendingSync: true, updatedAt: now() });
    }
    const saved = { ...remote, pendingSync: false, syncError: undefined, lastSyncedAt: now() };
    await cacheProfile(saved);
    return saved;
  } catch (error) {
    const pending = { ...profile, pendingSync: true, syncError: error instanceof Error ? error.message : "Network unavailable" };
    await cacheProfile(pending);
    return pending;
  }
}

export async function deleteProfile(profileId: string): Promise<void> {
  if (REMOTE_API) {
    const response = await fetch(`${REMOTE_API}/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE", headers: { "x-delete-confirm": profileId } });
    if (!response.ok && response.status !== 404) throw new Error(`Delete failed (${response.status}). Your profile is still available; reconnect and try again.`);
  }
  const all = (await listLocalProfiles()).filter((profile) => profile.profileId !== profileId);
  saveLocalMirror(all);
  const db = await openDb();
  if (db) await new Promise<void>((resolve) => {
    const request = db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).delete(profileId);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export function exportProfile(profile: ProfileRecord): string {
  return JSON.stringify({ exportedAt: now(), app: "Parallette25 V2", profile }, null, 2);
}

export function importProfile(value: string): ProfileRecord | null {
  try {
    const parsed = JSON.parse(value);
    const profile = parsed.profile ?? parsed;
    if (!profile || typeof profile.username !== "string" || typeof profile.profileId !== "string") return null;
    return normalizeProfile({ ...newProfile(profile.username), ...profile, pendingSync: Boolean(REMOTE_API) });
  } catch { return null; }
}
