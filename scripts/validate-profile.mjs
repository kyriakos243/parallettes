import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("app/profileStore.ts", "utf8")
  .replaceAll("import.meta.env.VITE_PROFILE_API_URL", "undefined");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};
globalThis.indexedDB = undefined;
const loaded = { exports: {} };
new Function("exports", "module", "require", compiled)(loaded.exports, loaded, () => { throw new Error("Unexpected import"); });
const { applyFactoryReset, exportProfile, importProfile, mergeProfiles, newProfile } = loaded.exports;

memory.set("parallette25-profile-index-v1", JSON.stringify([{ profileId: "old", username: "Old" }]));
memory.set("parallette25-account-sessions-v1", JSON.stringify({ old: { token: "secret" } }));
memory.set("parallette25-history-v1:guest", JSON.stringify([{ id: "old-session" }]));
if (!await applyFactoryReset() || [...memory.keys()].some((key) => key.startsWith("parallette25-") && key !== "parallette25-factory-reset")) {
  throw new Error("Device factory reset did not remove all local account and workout data");
}
if (await applyFactoryReset()) throw new Error("Device factory reset was not idempotent");

const base = newProfile("Kyriakos");
const local = {
  ...base,
  revision: 3,
  updatedAt: "2026-08-10T10:05:00.000Z",
  pendingSync: true,
  history: [{ id: "local-session", completedAt: "2026-08-10T10:00:00.000Z", mode: "normal" }],
  progression: { hollow: { cleanSessions: 2, lastFeedback: "right" } },
  readiness: { support: true },
  readinessUpdatedAt: { support: "2026-08-10T09:00:00.000Z" },
};
const remote = {
  ...base,
  revision: 4,
  updatedAt: "2026-08-10T10:04:00.000Z",
  history: [{ id: "remote-session", completedAt: "2026-08-09T10:00:00.000Z", mode: "practice" }],
  progression: { hollow: { cleanSessions: 1 }, support: { cleanSessions: 1, lastFeedback: "easy" } },
  readiness: { support: false },
  readinessUpdatedAt: { support: "2026-08-10T09:30:00.000Z" },
};
const merged = mergeProfiles(local, remote);
if (merged.history.length !== 2 || !merged.history.some((item) => item.id === "local-session")) {
  throw new Error("Conflict merge discarded append-only session evidence");
}
if (merged.progression.hollow.cleanSessions !== 2 || merged.progression.support.cleanSessions !== 1) {
  throw new Error("Conflict merge regressed skill evidence");
}
if (merged.readiness.support !== false) throw new Error("A newer readiness revocation was overwritten by an older true value");
if (!merged.pendingSync || merged.revision !== 4) throw new Error("Conflict merge lost pending revision state");
const remoteNewer = mergeProfiles({ ...local, updatedAt: "2026-08-10T10:03:00.000Z" }, { ...remote, updatedAt: "2026-08-10T10:06:00.000Z" });
if (!remoteNewer.pendingSync || !remoteNewer.history.some((item) => item.id === "local-session")) {
  throw new Error("A newer remote revision suppressed unsynced local session evidence");
}
const restored = importProfile(exportProfile(merged));
if (!restored || restored.profileId !== merged.profileId || restored.history.length !== 2) {
  throw new Error("Profile backup round-trip failed");
}
console.log("Profiles: factory reset, stable ID, revocable readiness, backup round-trip and conflict-safe append-only history passed.");
