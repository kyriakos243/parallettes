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
  exerciseReviews?: Record<string, { feedback: "easy" | "right" | "hard"; achieved: boolean }>;
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
  readinessUpdatedAt: Record<string, string>;
  progression: Record<string, { cleanSessions: number; lastFeedback?: "easy" | "right" | "hard" }>;
  equipment: string[];
  preferences: Record<string, unknown>;
  pendingSync?: boolean;
  lastSyncedAt?: string;
  syncError?: string;
};

export type AccountResult = {
  profile: ProfileRecord;
  recoveryCode?: string;
};

const DB_NAME = "parallette25-v2";
const DB_VERSION = 2;
const PROFILE_STORE = "profiles";
const INDEX_KEY = "parallette25-profile-index-v1";
const TOKEN_KEY = "parallette25-account-sessions-v1";
const FACTORY_RESET_KEY = "parallette25-factory-reset";
const FACTORY_RESET_EPOCH = "2026-08-11-1";
const REMOTE_API = (import.meta.env.VITE_PROFILE_API_URL as string | undefined)?.replace(/\/$/u, "");
export const remoteSyncAvailable = Boolean(REMOTE_API);

const now = () => new Date().toISOString();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sanitizeName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 32);
const timestamp = (value?: string) => value ? Date.parse(value) || 0 : 0;

export const newProfile = (username: string): ProfileRecord => ({
  profileId: makeId(), username: sanitizeName(username) || "Athlete", schemaVersion: 1, revision: 0,
  createdAt: now(), updatedAt: now(), nextProgramDay: 1, history: [], readiness: {}, readinessUpdatedAt: {}, progression: {},
  equipment: ["parallettes", "floor", "wall"], preferences: { soundOn: true }, pendingSync: Boolean(REMOTE_API),
});

const normalizeProfile = (profile: ProfileRecord): ProfileRecord => ({
  ...newProfile(profile.username),
  ...profile,
  username: sanitizeName(profile.username) || "Athlete",
  schemaVersion: 1,
  revision: Math.max(0, Number(profile.revision) || 0),
  history: Array.isArray(profile.history) ? profile.history.slice(-500) : [],
  readiness: profile.readiness && typeof profile.readiness === "object" ? profile.readiness : {},
  readinessUpdatedAt: profile.readinessUpdatedAt && typeof profile.readinessUpdatedAt === "object" ? profile.readinessUpdatedAt : {},
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

type StoredSession = { token: string; expiresAt?: string };
const storedSessions = (): Record<string, StoredSession> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, StoredSession> : {};
  } catch { return {}; }
};
const saveSessions = (sessions: Record<string, StoredSession>) => localStorage.setItem(TOKEN_KEY, JSON.stringify(sessions));
const setSession = (profileId: string, token: string, expiresAt?: string) => saveSessions({ ...storedSessions(), [profileId]: { token, expiresAt } });
const clearSession = (profileId: string) => {
  const sessions = storedSessions();
  delete sessions[profileId];
  saveSessions(sessions);
};
const sessionFor = (profileId: string): StoredSession | null => {
  const session = storedSessions()[profileId];
  if (!session?.token) return null;
  if (session.expiresAt && timestamp(session.expiresAt) <= Date.now()) {
    clearSession(profileId);
    return null;
  }
  return session;
};

export const hasProfileSession = (profileId: string) => Boolean(sessionFor(profileId));

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

/**
 * One-time owner-requested factory reset. It removes profiles, sessions,
 * programme settings and workout history from this browser before hydration.
 * The epoch marker prevents future accounts from being cleared.
 */
export async function applyFactoryReset(): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  const resetRequired = localStorage.getItem(FACTORY_RESET_KEY) !== FACTORY_RESET_EPOCH;
  if (resetRequired) {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith("parallette25-")));
    for (const key of keys) localStorage.removeItem(key);

    const db = await openDb();
    if (db?.objectStoreNames.contains(PROFILE_STORE)) {
      await new Promise<void>((resolve) => {
        const request = db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      });
      db.close();
    }
    localStorage.setItem(FACTORY_RESET_KEY, FACTORY_RESET_EPOCH);
  }

  return resetRequired;
}

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

const removeLocalProfile = async (profileId: string) => {
  saveLocalMirror((await listLocalProfiles()).filter((profile) => profile.profileId !== profileId));
  const db = await openDb();
  if (db) await new Promise<void>((resolve) => {
    const request = db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).delete(profileId);
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
  const mergedReadiness: Record<string, boolean> = {};
  const readinessUpdatedAt: Record<string, string> = {};
  for (const id of readinessKeys) {
    const localChanged = timestamp(localProfile.readinessUpdatedAt[id]);
    const remoteChanged = timestamp(remoteProfile.readinessUpdatedAt[id]);
    const useLocal = localChanged === remoteChanged
      ? preferred === localProfile
      : localChanged > remoteChanged;
    mergedReadiness[id] = useLocal ? localProfile.readiness[id] === true : remoteProfile.readiness[id] === true;
    const changedAt = useLocal ? localProfile.readinessUpdatedAt[id] : remoteProfile.readinessUpdatedAt[id];
    if (changedAt) readinessUpdatedAt[id] = changedAt;
  }
  const remoteSessions = new Set(remoteProfile.history.map((item) => item.id));
  const localAssessment = localProfile.preferences.startingAssessment as { updatedAt?: string } | undefined;
  const remoteAssessment = remoteProfile.preferences.startingAssessment as { updatedAt?: string } | undefined;
  const startingAssessment = timestamp(localAssessment?.updatedAt) >= timestamp(remoteAssessment?.updatedAt)
    ? localProfile.preferences.startingAssessment
    : remoteProfile.preferences.startingAssessment;
  const preferences = {
    ...older.preferences,
    ...preferred.preferences,
    ...(startingAssessment ? { startingAssessment } : {}),
  };
  const remoteMissingEvidence = localProfile.history.some((item) => !remoteSessions.has(item.id)) ||
    Object.entries(progression).some(([id, value]) => value.cleanSessions > (remoteProfile.progression[id]?.cleanSessions ?? 0)) ||
    Object.keys(readinessUpdatedAt).some((id) => timestamp(readinessUpdatedAt[id]) > timestamp(remoteProfile.readinessUpdatedAt[id])) ||
    timestamp(localAssessment?.updatedAt) > timestamp(remoteAssessment?.updatedAt);
  return normalizeProfile({
    ...older,
    ...preferred,
    profileId: localProfile.profileId,
    history: [...sessions.values()].sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt)),
    readiness: mergedReadiness,
    readinessUpdatedAt,
    progression,
    preferences,
    revision: Math.max(localProfile.revision, remoteProfile.revision),
    pendingSync: localProfile.pendingSync === true || remoteMissingEvidence,
    lastSyncedAt: remoteProfile.lastSyncedAt ?? localProfile.lastSyncedAt,
  });
}

type ApiPayload = {
  profile?: ProfileRecord;
  token?: string;
  expiresAt?: string;
  recoveryCode?: string;
  error?: string;
};

class ApiError extends Error {
  status: number;
  payload: ApiPayload;
  constructor(status: number, payload: ApiPayload, fallback: string) {
    super(payload.error ?? fallback);
    this.status = status;
    this.payload = payload;
  }
}

const api = async (path: string, init: RequestInit = {}, profileId?: string): Promise<ApiPayload | ProfileRecord> => {
  if (!REMOTE_API) throw new Error("Cloud sync is not configured for this deployment.");
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (profileId) {
    const session = sessionFor(profileId);
    if (!session) throw new Error("Sign in to sync this profile.");
    headers.set("authorization", `Bearer ${session.token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${REMOTE_API}${path}`, { ...init, headers });
  } catch {
    throw new Error("Network unavailable. Your changes remain saved on this device.");
  }
  const payload = await response.json().catch(() => ({})) as ApiPayload | ProfileRecord;
  if (response.status === 401 && profileId) clearSession(profileId);
  if (!response.ok) throw new ApiError(response.status, payload as ApiPayload, `Sync failed (${response.status}).`);
  return payload;
};

const acceptAccount = async (payload: ApiPayload): Promise<AccountResult> => {
  if (!payload.profile || !payload.token) throw new Error("The account service returned an incomplete response.");
  const remote = normalizeProfile({ ...payload.profile, pendingSync: false, syncError: undefined, lastSyncedAt: now() });
  setSession(remote.profileId, payload.token, payload.expiresAt);
  const local = await getProfile(remote.profileId);
  const merged = local ? mergeProfiles(local, remote) : remote;
  const profile = merged.pendingSync ? await pushWithConflictMerge({ ...merged, revision: remote.revision }) : merged;
  await cacheProfile(profile);
  return { profile, recoveryCode: payload.recoveryCode };
};

export async function validateProfileSession(profileId: string): Promise<ProfileRecord | null> {
  if (!REMOTE_API || !sessionFor(profileId)) return null;
  try {
    const remote = normalizeProfile(await api("/auth/session", { method: "GET" }, profileId) as ProfileRecord);
    const local = await getProfile(profileId);
    const merged = local ? mergeProfiles(local, remote) : remote;
    const saved = merged.pendingSync ? await pushWithConflictMerge({ ...merged, revision: remote.revision }) : { ...merged, pendingSync: false, syncError: undefined, lastSyncedAt: now() };
    await cacheProfile(saved);
    return saved;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function registerProfile(username: string, password: string): Promise<AccountResult> {
  const draft = newProfile(username);
  const payload = await api("/auth/register", { method: "POST", body: JSON.stringify({ username, password, profile: draft }) }) as ApiPayload;
  return acceptAccount(payload);
}

export async function signInProfile(username: string, password: string): Promise<ProfileRecord> {
  const payload = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }) as ApiPayload;
  return (await acceptAccount(payload)).profile;
}

export async function claimLegacyProfile(profile: ProfileRecord, password: string): Promise<AccountResult> {
  const payload = await api("/auth/claim", {
    method: "POST",
    body: JSON.stringify({ username: profile.username, profileId: profile.profileId, password, profile }),
  }) as ApiPayload;
  return acceptAccount(payload);
}

export async function recoverAccount(username: string, recoveryCode: string, newPassword: string): Promise<AccountResult> {
  const payload = await api("/auth/recover", {
    method: "POST",
    body: JSON.stringify({ username, recoveryCode, newPassword }),
  }) as ApiPayload;
  return acceptAccount(payload);
}

export async function signOutProfile(profileId: string): Promise<void> {
  if (REMOTE_API && sessionFor(profileId)) {
    try { await api("/auth/logout", { method: "POST" }, profileId); }
    catch { /* The local token must still be removed when offline. */ }
  }
  clearSession(profileId);
}

type RemoteResult = { profile?: ProfileRecord; conflict?: ProfileRecord; error?: string };

async function putRemote(profile: ProfileRecord, revision: number): Promise<RemoteResult> {
  if (!REMOTE_API) return { profile: { ...profile, pendingSync: false } };
  if (!sessionFor(profile.profileId)) return { error: "Sign in to sync this profile." };
  try {
    const response = await api("/profiles/me", {
      method: "PUT",
      headers: { "if-match": String(revision) },
      body: JSON.stringify(profile),
    }, profile.profileId) as ProfileRecord;
    return { profile: normalizeProfile(response) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.payload.profile) {
      return { conflict: normalizeProfile(error.payload.profile) };
    }
    const message = error instanceof Error ? error.message : "Network unavailable";
    return { error: message };
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

/** Only profiles already used on this device are listed. Remote accounts are never publicly enumerated. */
export async function listProfiles(): Promise<ProfileRecord[]> {
  return listLocalProfiles();
}

export async function saveProfile(profile: ProfileRecord): Promise<ProfileRecord> {
  const current = await getProfile(profile.profileId);
  const canSync = Boolean(REMOTE_API && sessionFor(profile.profileId));
  const localDraft = normalizeProfile({
    ...current,
    ...profile,
    revision: Math.max(profile.revision, current?.revision ?? 0),
    updatedAt: now(),
    pendingSync: Boolean(REMOTE_API),
    syncError: canSync ? undefined : REMOTE_API ? "Sign in to sync this profile." : undefined,
  });
  await cacheProfile(localDraft);
  return canSync ? pushWithConflictMerge(localDraft) : localDraft;
}

export async function getProfile(profileId: string): Promise<ProfileRecord | null> {
  return (await listLocalProfiles()).find((profile) => profile.profileId === profileId) ?? null;
}

export async function syncProfile(profile: ProfileRecord): Promise<ProfileRecord> {
  if (!REMOTE_API) return { ...profile, pendingSync: false };
  if (!sessionFor(profile.profileId)) {
    const localOnly = { ...profile, pendingSync: true, syncError: "Sign in to sync this profile." };
    await cacheProfile(localOnly);
    return localOnly;
  }
  try {
    const remote = normalizeProfile(await api("/profiles/me", { method: "GET" }, profile.profileId) as ProfileRecord);
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

export async function deleteProfile(profileId: string, password?: string): Promise<void> {
  const local = await getProfile(profileId);
  if (REMOTE_API && sessionFor(profileId) && local) {
    await api("/profiles/me", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: local.username, password }),
    }, profileId);
  }
  clearSession(profileId);
  await removeLocalProfile(profileId);
}

export function exportProfile(profile: ProfileRecord): string {
  return JSON.stringify({ exportedAt: now(), app: "Parallette25 V2", profile }, null, 2);
}

export function importProfile(value: string): ProfileRecord | null {
  try {
    const parsed = JSON.parse(value);
    const profile = parsed.profile ?? parsed;
    if (!profile || typeof profile.username !== "string" || typeof profile.profileId !== "string") return null;
    return normalizeProfile({ ...newProfile(profile.username), ...profile, pendingSync: false, syncError: "Secure or sign in to sync this backup." });
  } catch { return null; }
}
