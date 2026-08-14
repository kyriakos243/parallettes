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
const { applyFactoryReset, exportProfile, importProfile, mergeProfiles, newProfile, resetProfileTraining } = loaded.exports;

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
const assessmentLocal = {
  ...local,
  preferences: { startingAssessment: { version: 1, status: "in-progress", answers: { "hollow:0": "clean" }, placements: {}, updatedAt: "2026-08-10T11:00:00.000Z" } },
};
const assessmentRemote = {
  ...remote,
  preferences: { startingAssessment: { version: 1, status: "offered", answers: {}, placements: {}, updatedAt: "2026-08-10T10:00:00.000Z" } },
};
const mergedAssessment = mergeProfiles(assessmentLocal, assessmentRemote).preferences.startingAssessment;
if (mergedAssessment.status !== "in-progress" || mergedAssessment.answers["hollow:0"] !== "clean") {
  throw new Error("Cross-device merge discarded the newest resumable starting assessment");
}
const restored = importProfile(exportProfile(merged));
if (!restored || restored.profileId !== merged.profileId || restored.history.length !== 2) {
  throw new Error("Profile backup round-trip failed");
}

const reviewedSession = ({ id, completedAt, day = 1, feedback = "easy", achieved = feedback === "easy", status = "complete", mode = "normal", exerciseId = "support-hold" }) => ({
  id, completedAt, day, mode, status, seconds: 1500,
  exerciseIds: [exerciseId], completedExerciseIds: [exerciseId],
  exerciseReviews: { [exerciseId]: { feedback, achieved } },
});

// Two devices can each finish the first clean session before either syncs.
// The union of immutable review events, not Math.max(1, 1), must reach two.
const concurrentBase = newProfile("Concurrent Athlete");
const concurrentLocal = {
  ...concurrentBase, revision: 2, updatedAt: "2026-08-13T10:01:00.000Z", pendingSync: true,
  history: [reviewedSession({ id: "clean-local", completedAt: "2026-08-13T10:00:00.000Z" })],
  progression: { "support-hold": { cleanSessions: 1, lastFeedback: "easy" } },
};
const concurrentRemote = {
  ...concurrentBase, revision: 3, updatedAt: "2026-08-13T10:03:00.000Z",
  history: [reviewedSession({ id: "clean-remote", completedAt: "2026-08-13T10:02:00.000Z" })],
  progression: { "support-hold": { cleanSessions: 1, lastFeedback: "easy" } },
};
const concurrentMerged = mergeProfiles(concurrentLocal, concurrentRemote);
if (concurrentMerged.history.length !== 2 || concurrentMerged.progression["support-hold"].cleanSessions !== 2) {
  throw new Error("Concurrent clean reviews collapsed instead of reaching the two-session threshold");
}

// A later preference-only write cannot rewrite the latest actual review or
// the programme cursor derived from a completed workout.
const hardEvent = {
  ...concurrentBase, revision: 4, updatedAt: "2026-08-13T11:01:00.000Z", nextProgramDay: 4,
  history: [reviewedSession({ id: "hard-day-3", completedAt: "2026-08-13T11:00:00.000Z", day: 3, feedback: "hard", achieved: false })],
  progression: { "support-hold": { cleanSessions: 0, lastFeedback: "hard" } },
};
const laterSetting = {
  ...concurrentBase, revision: 3, updatedAt: "2026-08-13T11:02:00.000Z", nextProgramDay: 3,
  preferences: { soundOn: false },
  progression: { "support-hold": { cleanSessions: 0, lastFeedback: "right" } },
};
const eventMerged = mergeProfiles(laterSetting, hardEvent);
if (eventMerged.progression["support-hold"].lastFeedback !== "hard" || eventMerged.nextProgramDay !== 4) {
  throw new Error("An unrelated newer setting overwrote review feedback or the event-derived programme day");
}

// App state and starting assessment use their own clocks. Neither is allowed
// to hitchhike on the whole profile's updatedAt timestamp.
const preferenceLocal = {
  ...concurrentBase, updatedAt: "2026-08-13T12:05:00.000Z",
  preferences: {
    appState: { selectedDay: 2 }, appStateUpdatedAt: "2026-08-13T12:01:00.000Z",
    startingAssessment: { status: "in-progress", answers: { "hollow:0": "clean" }, updatedAt: "2026-08-13T12:04:00.000Z" },
  },
};
const preferenceRemote = {
  ...concurrentBase, updatedAt: "2026-08-13T12:03:00.000Z",
  preferences: {
    appState: { selectedDay: 5 }, appStateUpdatedAt: "2026-08-13T12:02:00.000Z",
    startingAssessment: { status: "offered", answers: {}, updatedAt: "2026-08-13T12:00:00.000Z" },
  },
};
const preferenceMerged = mergeProfiles(preferenceLocal, preferenceRemote);
if (preferenceMerged.preferences.appState.selectedDay !== 5 ||
  preferenceMerged.preferences.appStateUpdatedAt !== "2026-08-13T12:02:00.000Z" ||
  preferenceMerged.preferences.startingAssessment.answers["hollow:0"] !== "clean") {
  throw new Error("Independent app-state or starting-assessment clocks were ignored");
}

// A reset is a durable tombstone: older sessions, derived progression and
// readiness must not return when an offline device next meets the cloud copy.
const beforeReset = {
  ...concurrentBase, revision: 8, updatedAt: "2026-08-13T12:59:00.000Z", nextProgramDay: 2,
  history: [reviewedSession({ id: "before-reset", completedAt: "2026-08-13T12:58:00.000Z" })],
  progression: { "support-hold": { cleanSessions: 2, lastFeedback: "easy" } },
  readiness: { G1_SUPPORT: true }, readinessUpdatedAt: { G1_SUPPORT: "2026-08-13T12:57:00.000Z" },
};
const resetAt = "2026-08-13T13:00:00.000Z";
const resetLocal = resetProfileTraining({ ...concurrentBase, revision: 7 }, resetAt);
if ("startingAssessment" in resetLocal.preferences || "appState" in resetLocal.preferences ||
  "appStateUpdatedAt" in resetLocal.preferences) {
  throw new Error("Training reset retained assessment or app-state progress components locally");
}
const resetMerged = mergeProfiles(resetLocal, beforeReset);
if (resetMerged.progressResetAt !== resetAt || resetMerged.history.length ||
  Object.keys(resetMerged.progression).length || Object.keys(resetMerged.readiness).length ||
  resetMerged.nextProgramDay !== 1 || !resetMerged.pendingSync) {
  throw new Error("Offline reset tombstone did not suppress older cloud training data");
}

// Even a later preference-only edit from a device that never received the
// tombstone cannot make untimestamped legacy counters reappear.
const staleDeviceEditedLater = {
  ...beforeReset,
  updatedAt: "2026-08-13T13:05:00.000Z",
  nextProgramDay: 5,
  readiness: { G1_SUPPORT: true }, readinessUpdatedAt: { G1_SUPPORT: "2026-08-13T12:57:00.000Z" },
  preferences: {
    soundOn: false,
    startingAssessment: { status: "complete", placements: { support: 2 }, updatedAt: "2026-08-13T12:58:00.000Z" },
    appState: { selectedDay: 5, readiness: { G1_SUPPORT: true } },
    appStateUpdatedAt: "2026-08-13T12:59:00.000Z",
  },
};
const resetVersusLateSetting = mergeProfiles(resetLocal, staleDeviceEditedLater);
if (Object.keys(resetVersusLateSetting.progression).length || resetVersusLateSetting.history.length ||
  Object.keys(resetVersusLateSetting.readiness).length || resetVersusLateSetting.nextProgramDay !== 1 ||
  "startingAssessment" in resetVersusLateSetting.preferences || "appState" in resetVersusLateSetting.preferences ||
  "appStateUpdatedAt" in resetVersusLateSetting.preferences) {
  throw new Error("A later unrelated edit on a pre-reset device resurrected reset training components");
}

// A component created after the reset is allowed back only when the source has
// received the reset tombstone and the component's own clock is post-reset.
const resetAwarePreferences = mergeProfiles({
  ...resetLocal,
  updatedAt: "2026-08-13T13:06:00.000Z",
  preferences: {
    soundOn: true,
    startingAssessment: { status: "in-progress", answers: { "support:0": "clean" }, updatedAt: "2026-08-13T13:04:00.000Z" },
    appState: { selectedDay: 2 }, appStateUpdatedAt: "2026-08-13T13:05:00.000Z",
  },
}, staleDeviceEditedLater);
if (resetAwarePreferences.preferences.startingAssessment.answers["support:0"] !== "clean" ||
  resetAwarePreferences.preferences.appState.selectedDay !== 2) {
  throw new Error("Post-reset assessment/app-state components were discarded");
}

// New evidence after the reset remains valid, while an older readiness value
// stays deleted and a post-reset readiness revocation wins unrelated writes.
const postResetLocal = {
  ...resetLocal, revision: 8, updatedAt: "2026-08-13T13:03:00.000Z",
  history: [reviewedSession({ id: "after-reset", completedAt: "2026-08-13T13:02:00.000Z", day: 2 })],
  progression: { "support-hold": { cleanSessions: 1, lastFeedback: "easy" } },
  readiness: { G1_SUPPORT: false }, readinessUpdatedAt: { G1_SUPPORT: "2026-08-13T13:01:00.000Z" },
};
const postResetMerged = mergeProfiles(postResetLocal, beforeReset);
if (postResetMerged.history.length !== 1 || postResetMerged.history[0].id !== "after-reset" ||
  postResetMerged.progression["support-hold"].cleanSessions !== 1 ||
  postResetMerged.readiness.G1_SUPPORT !== false || postResetMerged.nextProgramDay !== 3) {
  throw new Error("Post-reset evidence/readiness did not survive while pre-reset evidence stayed deleted");
}

// Profiles predating immutable review history still retain counters for IDs
// that have no review events in the merged history.
const legacyOnly = mergeProfiles({
  ...concurrentBase, updatedAt: "2026-08-13T14:01:00.000Z",
  progression: { "legacy-drill": { cleanSessions: 2, lastFeedback: "right" } },
}, {
  ...concurrentBase, updatedAt: "2026-08-13T14:00:00.000Z",
  progression: { "legacy-drill": { cleanSessions: 1, lastFeedback: "easy" } },
});
if (legacyOnly.progression["legacy-drill"].cleanSessions !== 2 || legacyOnly.progression["legacy-drill"].lastFeedback !== "right") {
  throw new Error("Legacy progression without immutable review events was discarded");
}

// Legacy clean counters remain monotonic, but immutable review events are the
// authority for the latest feedback—even when an unrelated profile edit is newer.
const legacyWithLatestEvent = mergeProfiles({
  ...concurrentBase, updatedAt: "2026-08-13T15:03:00.000Z",
  progression: { "legacy-drill": { cleanSessions: 2, lastFeedback: "easy" } },
  history: [reviewedSession({ id: "legacy-hard", completedAt: "2026-08-13T15:02:00.000Z", exerciseId: "legacy-drill", feedback: "hard", achieved: false })],
}, {
  ...concurrentBase, updatedAt: "2026-08-13T15:04:00.000Z",
  progression: { "legacy-drill": { cleanSessions: 1, lastFeedback: "right" } },
  preferences: { soundOn: false },
});
if (legacyWithLatestEvent.progression["legacy-drill"].cleanSessions !== 2 ||
  legacyWithLatestEvent.progression["legacy-drill"].lastFeedback !== "hard") {
  throw new Error("Legacy clean evidence or latest event feedback lost its intended authority");
}

// This reproduces a stale whole-profile settings save racing a completed
// workout. mergeProfiles is the composition used by saveProfile before cache.
const workoutWrite = {
  ...concurrentBase, updatedAt: "2026-08-13T16:02:00.000Z", nextProgramDay: 2,
  history: [reviewedSession({ id: "race-workout", completedAt: "2026-08-13T16:01:00.000Z", day: 1 })],
  progression: { "support-hold": { cleanSessions: 1, lastFeedback: "easy" } },
  readiness: { G1_SUPPORT: true }, readinessUpdatedAt: { G1_SUPPORT: "2026-08-13T16:00:30.000Z" },
  preferences: { appState: { selectedDay: 2 }, appStateUpdatedAt: "2026-08-13T16:02:00.000Z" },
};
const staleSettingsWrite = {
  ...concurrentBase, updatedAt: "2026-08-13T16:03:00.000Z", nextProgramDay: 1,
  preferences: { soundOn: false, appState: { selectedDay: 1 }, appStateUpdatedAt: "2026-08-13T16:00:00.000Z" },
};
const staleSaveComposed = mergeProfiles(staleSettingsWrite, workoutWrite);
if (!staleSaveComposed.history.some((session) => session.id === "race-workout") ||
  staleSaveComposed.progression["support-hold"].cleanSessions !== 1 ||
  staleSaveComposed.readiness.G1_SUPPORT !== true || staleSaveComposed.nextProgramDay !== 2 ||
  staleSaveComposed.preferences.appState.selectedDay !== 2 || staleSaveComposed.preferences.soundOn !== false) {
  throw new Error("Stale settings save erased durable evidence or intentional newer user fields");
}

// Every component-level difference must request an upload; syncProfile relies
// on this flag instead of brittle whole-object timestamps/history lengths.
const cloudSnapshot = {
  ...concurrentBase, revision: 9, updatedAt: "2026-08-13T17:00:00.000Z", pendingSync: false,
  username: "Concurrent Athlete", equipment: ["parallettes", "floor", "wall"],
};
const necessaryComponentCases = [
  { label: "username", value: { ...cloudSnapshot, username: "Renamed Athlete", updatedAt: "2026-08-13T17:01:00.000Z" } },
  { label: "equipment", value: { ...cloudSnapshot, equipment: ["parallettes", "wall"], updatedAt: "2026-08-13T17:01:00.000Z" } },
  { label: "readiness revocation", value: { ...cloudSnapshot, readiness: { G1_SUPPORT: false }, readinessUpdatedAt: { G1_SUPPORT: "2026-08-13T17:01:00.000Z" } } },
  { label: "assessment", value: { ...cloudSnapshot, preferences: { startingAssessment: { status: "in-progress", updatedAt: "2026-08-13T17:01:00.000Z" } } } },
  { label: "app state", value: { ...cloudSnapshot, preferences: { appState: { selectedDay: 4 }, appStateUpdatedAt: "2026-08-13T17:01:00.000Z" } } },
];
for (const testCase of necessaryComponentCases) {
  const result = mergeProfiles(testCase.value, cloudSnapshot);
  if (!result.pendingSync) throw new Error(`Necessary ${testCase.label} component merge was incorrectly treated as synchronized`);
}
const noOpMerge = mergeProfiles({ ...cloudSnapshot }, { ...cloudSnapshot });
if (noOpMerge.pendingSync) throw new Error("Identical profile snapshots caused an unnecessary upload");

console.log("Profiles: factory reset; append-only/concurrent history; monotonic legacy clean evidence with event-latest feedback; stale-save composition; durable symmetric reset across history/progression/readiness/assessment/app-state/day; component-clock preference merge; necessary sync detection; intentional username/equipment/settings preservation; backup round-trip passed.");
