export type SaveMode = "normal" | "practice" | "guest";
export type ProfileRecord = {
  profileId: string;
  username: string;
  schemaVersion: 1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  nextProgramDay: number;
  history: Array<{ id: string; completedAt: string; day?: number; mode?: string; seconds?: number; exerciseIds?: string[] }>;
  readiness: Record<string, boolean>;
  progression: Record<string, { cleanSessions: number; lastFeedback?: "easy" | "right" | "hard" }>;
  equipment: string[];
  preferences: Record<string, unknown>;
};

const DB_NAME = "parallette25-v2";
const DB_VERSION = 1;
const PROFILE_STORE = "profiles";
const INDEX_KEY = "parallette25-profile-index-v1";
const REMOTE_API = (import.meta.env.VITE_PROFILE_API_URL as string | undefined)?.replace(/\/$/u, "");
export const remoteSyncAvailable = Boolean(REMOTE_API);

const now = () => new Date().toISOString();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sanitizeName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 32);

export const newProfile = (username: string): ProfileRecord => ({
  profileId: makeId(), username: sanitizeName(username) || "Athlete", schemaVersion: 1, revision: 0,
  createdAt: now(), updatedAt: now(), nextProgramDay: 1, history: [], readiness: {}, progression: {},
  equipment: ["parallettes", "floor", "wall"], preferences: { soundOn: true },
});

const localProfiles = (): ProfileRecord[] => {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as ProfileRecord[]; } catch { return []; }
};
const saveLocal = (profiles: ProfileRecord[]) => localStorage.setItem(INDEX_KEY, JSON.stringify(profiles));

const openDb = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
  if (typeof indexedDB === "undefined") return resolve(null);
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => request.result.createObjectStore(PROFILE_STORE, { keyPath: "profileId" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

export async function listProfiles(): Promise<ProfileRecord[]> {
  const db = await openDb();
  if (!db) return localProfiles();
  return new Promise((resolve) => {
    const request = db.transaction(PROFILE_STORE).objectStore(PROFILE_STORE).getAll();
    request.onsuccess = () => resolve((request.result as ProfileRecord[]).sort((a, b) => a.username.localeCompare(b.username)));
    request.onerror = () => resolve(localProfiles());
  });
}
export async function saveProfile(profile: ProfileRecord): Promise<void> {
  const updated = { ...profile, updatedAt: now(), revision: profile.revision + 1 };
  const db = await openDb();
  if (!db) { const all = localProfiles().filter((item) => item.profileId !== profile.profileId); saveLocal([...all, updated]); return; }
  await new Promise<void>((resolve) => { const request = db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).put(updated); request.onsuccess = () => resolve(); request.onerror = () => resolve(); });
  // Optional public proxy: credentials never ship to the browser. If unset,
  // the app remains fully usable offline and can be backed up as JSON.
  if (REMOTE_API) void fetch(`${REMOTE_API}/profiles/${encodeURIComponent(updated.profileId)}`, { method: "PUT", headers: { "content-type": "application/json", "if-match": String(profile.revision) }, body: JSON.stringify(updated) }).catch(() => undefined);
}
export async function getProfile(profileId: string): Promise<ProfileRecord | null> { return (await listProfiles()).find((profile) => profile.profileId === profileId) ?? null; }
export async function syncProfile(profile: ProfileRecord): Promise<ProfileRecord> {
  if (!REMOTE_API) return profile;
  try {
    const response = await fetch(`${REMOTE_API}/profiles/${encodeURIComponent(profile.profileId)}`);
    if (!response.ok) return profile;
    const remote = await response.json() as ProfileRecord;
    return remote.revision >= profile.revision ? remote : profile;
  } catch { return profile; }
}
export async function deleteProfile(profileId: string): Promise<void> { const all = (await listProfiles()).filter((profile) => profile.profileId !== profileId); saveLocal(all); const db = await openDb(); if (db) db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).delete(profileId); }
export function exportProfile(profile: ProfileRecord): string { return JSON.stringify({ exportedAt: now(), app: "Parallette25 V2", profile }, null, 2); }
export function importProfile(value: string): ProfileRecord | null { try { const parsed = JSON.parse(value); const profile = parsed.profile ?? parsed; if (!profile || typeof profile.username !== "string" || typeof profile.profileId !== "string") return null; return { ...newProfile(profile.username), ...profile, schemaVersion: 1, revision: Number(profile.revision) || 0 }; } catch { return null; } }
