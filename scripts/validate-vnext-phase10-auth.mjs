import { readFileSync } from "node:fs";
import ts from "typescript";

const failures = [];
let assertions = 0;
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const apiOrigin = "https://profiles.example.test";
const source = readFileSync("app/profileStore.ts", "utf8")
  .replaceAll("import.meta.env.VITE_PROFILE_API_URL", JSON.stringify(apiOrigin));
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

const requests = [];
let simulateSessionNetworkFailure = false;
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), init });
  const pathname = new URL(String(url)).pathname;
  if (pathname === "/auth/register") {
    return Response.json({
      profile: {
        profileId: "p25_account-created",
        username: "Cloud Athlete",
        // This data must never cross the vNext account boundary.
        history: [{ id: "legacy-session" }],
        readiness: { legacy: true },
      },
      token: "register-secret",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryCode: "SAVE-THIS-CODE",
    }, { status: 201 });
  }
  if (pathname === "/auth/login") {
    return Response.json({
      profile: {
        profileId: "p25_account-signed-in",
        username: "Returning Athlete",
        history: [{ id: "legacy-session-two" }],
        progression: { planche: { cleanSessions: 99 } },
      },
      token: "login-secret",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  }
  if (pathname === "/auth/claim") {
    const body = JSON.parse(init.body);
    return Response.json({
      profile: { ...body.profile, profileId: body.profileId, username: body.username },
      token: "claim-secret",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryCode: "CLAIM-RECOVERY-CODE",
    }, { status: 201 });
  }
  if (pathname === "/auth/recover") {
    return Response.json({
      profile: { profileId: "p25_recovered", username: "Recovered Athlete" },
      token: "recovered-secret",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryCode: "ROTATED-RECOVERY-CODE",
    });
  }
  if (pathname === "/auth/session") {
    if (simulateSessionNetworkFailure) throw new TypeError("offline");
    const authorization = new Headers(init.headers).get("authorization");
    if (authorization === "Bearer register-secret") {
      return Response.json({
        profileId: "p25_account-created",
        username: "Cloud Athlete",
        history: [{ id: "must-not-hydrate" }],
      });
    }
    if (authorization === "Bearer login-secret") {
      return Response.json({
        profileId: "p25_account-signed-in",
        username: "Returning Athlete",
        progression: { mustNotHydrate: true },
      });
    }
    if (authorization === "Bearer mismatch-secret") {
      return Response.json({ profileId: "p25_someone_else", username: "Wrong Athlete" });
    }
    return Response.json({ error: "Session expired" }, { status: 401 });
  }
  if (pathname === "/auth/logout") return Response.json({ signedOut: true });
  return Response.json({ error: "Unexpected request" }, { status: 404 });
};

const loaded = { exports: {} };
const sessionSignals = [];
new Function("exports", "module", "require", compiled)(loaded.exports, loaded, (specifier) => {
  if (specifier === "./accountSessionSignals") return {
    ACCOUNT_SESSION_STORAGE_KEY: "parallette25-account-sessions-v1",
    announceAccountSessionChange: (detail) => sessionSignals.push(detail),
  };
  throw new Error(`Unexpected module import ${specifier} during the account-boundary check`);
});
const {
  hasVNextAccountSession,
  registerVNextAccount,
  readLegacyProfileForVNextMigration,
  recoverVNextAccount,
  secureVNextLocalAthlete,
  signInVNextAccount,
  signOutVNextAccount,
  validateVNextAccountSession,
} = loaded.exports;

const legacyMirror = JSON.stringify([{ profileId: "legacy-local", username: "Legacy Local", history: [{ id: "keep-me" }] }]);
memory.set("parallette25-profile-index-v1", legacyMirror);

const registered = await registerVNextAccount("Cloud Athlete", "long-enough-password");
assert(JSON.stringify(Object.keys(registered).sort()) === JSON.stringify(["profileId", "recoveryCode", "username"]),
  "vNext registration exposed legacy profile/training fields");
assert(registered.profileId === "p25_account-created" && registered.recoveryCode === "SAVE-THIS-CODE",
  "vNext registration did not return the server-owned account identity and recovery code");
assert(hasVNextAccountSession(registered.profileId), "vNext registration did not retain its bearer session");
assert(sessionSignals.some((signal) => signal.profileId === registered.profileId && signal.active),
  "A new account session did not announce same-tab access activation");
const registerBody = JSON.parse(requests.find((item) => new URL(item.url).pathname === "/auth/register").init.body);
assert(!("profile" in registerBody) && Object.keys(registerBody).sort().join(",") === "password,username",
  "vNext registration sent a legacy training profile to the account service");
assert(memory.get("parallette25-profile-index-v1") === legacyMirror,
  "vNext registration hydrated or mutated the legacy local profile mirror");

const secured = await secureVNextLocalAthlete("legacy-local", "Legacy Local", "long-enough-password");
assert(secured.profileId === "legacy-local" && secured.recoveryCode === "CLAIM-RECOVERY-CODE"
  && hasVNextAccountSession("legacy-local"),
"A device-only legacy athlete could not be secured without changing its stable athlete ID");
const recoveredVNext = await recoverVNextAccount(
  "Recovered Athlete",
  "old-recovery-code",
  "new-long-enough-password",
);
assert(recoveredVNext.profileId === "p25_recovered"
  && recoveredVNext.recoveryCode === "ROTATED-RECOVERY-CODE"
  && hasVNextAccountSession("p25_recovered"),
"The isolated vNext account boundary did not preserve password recovery and recovery-code rotation");
assert(await validateVNextAccountSession(registered.profileId) === "active",
  "A valid persisted vNext bearer did not pass the pre-hydration account check");
assert(memory.get("parallette25-profile-index-v1") === legacyMirror,
  "vNext session validation hydrated the returned legacy profile body");

const signedIn = await signInVNextAccount("Returning Athlete", "long-enough-password");
assert(JSON.stringify(Object.keys(signedIn).sort()) === JSON.stringify(["profileId", "username"]),
  "vNext sign-in exposed legacy profile/training fields");
assert(signedIn.profileId === "p25_account-signed-in" && hasVNextAccountSession(signedIn.profileId),
  "vNext sign-in did not bind the bearer session to the returned profile ID");
assert(memory.get("parallette25-profile-index-v1") === legacyMirror,
  "vNext sign-in hydrated or merged the legacy local profile mirror");
assert(await validateVNextAccountSession(signedIn.profileId) === "active",
  "A signed-in vNext account did not pass the pre-hydration session check");

await signOutVNextAccount(signedIn.profileId);
const logout = requests.find((item) => new URL(item.url).pathname === "/auth/logout");
assert(logout?.init?.headers instanceof Headers
  && logout.init.headers.get("authorization") === "Bearer login-secret",
"vNext sign-out did not use the matching account bearer session");
assert(!hasVNextAccountSession(signedIn.profileId), "vNext sign-out retained the account bearer session");
assert(sessionSignals.some((signal) => signal.profileId === signedIn.profileId && !signal.active),
  "Account sign-out did not announce same-tab access invalidation");
assert(memory.get("parallette25-profile-index-v1") === legacyMirror,
  "vNext sign-out mutated the legacy local profile mirror");

const sessionStorageKey = "parallette25-account-sessions-v1";
const retainedSessions = JSON.parse(memory.get(sessionStorageKey) ?? "{}");
memory.set(sessionStorageKey, JSON.stringify({
  ...retainedSessions,
  p25_revoked: { token: "revoked-secret", expiresAt: "2099-01-01T00:00:00.000Z" },
}));
assert(await validateVNextAccountSession("p25_revoked") === "invalid"
  && !hasVNextAccountSession("p25_revoked"),
"A rejected persisted bearer did not lock account-scoped observations before hydration");
const sessionsBeforeOffline = JSON.parse(memory.get(sessionStorageKey) ?? "{}");
memory.set(sessionStorageKey, JSON.stringify({
  ...sessionsBeforeOffline,
  p25_offline: { token: "offline-secret", expiresAt: "2099-01-01T00:00:00.000Z" },
}));
simulateSessionNetworkFailure = true;
assert(await validateVNextAccountSession("p25_offline") === "offline"
  && hasVNextAccountSession("p25_offline"),
"A valid unexpired local bearer could not retain offline-first account access during a network outage");
simulateSessionNetworkFailure = false;

const sessionsBeforeMismatch = JSON.parse(memory.get(sessionStorageKey) ?? "{}");
memory.set(sessionStorageKey, JSON.stringify({
  ...sessionsBeforeMismatch,
  p25_mismatch: { token: "mismatch-secret", expiresAt: "2099-01-01T00:00:00.000Z" },
}));
let mismatchRejected = false;
try {
  await readLegacyProfileForVNextMigration("p25_mismatch", "account");
} catch (error) {
  mismatchRejected = /another athlete identity/u.test(String(error?.message));
}
assert(mismatchRejected && !hasVNextAccountSession("p25_mismatch"),
  "A remote account identity mismatch fell back to a local legacy mirror instead of failing closed");

const appSource = readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8");
const gateSource = readFileSync("app/vnext/releaseCandidate/VNextAccountGate.tsx", "utf8");
assert(/const athleteId = identity\.athleteId/u.test(appSource)
  && /identity\.mode === "account"[\s\S]*syncObservations/u.test(appSource),
"The RC does not bind its athlete ID to the selected account identity or gate cloud sync to account mode");
assert(/accountAccess === "checking"[\s\S]*accountAccess === "locked"[\s\S]*VNextAthleteApplication/u.test(appSource),
  "The RC can mount account-scoped observations before persisted session validation completes");
assert(/setAccountAccess\(next\.mode === "account" \? "checking" : "allowed"\)/u.test(appSource),
  "Selecting a saved account can mount its observation store before the new identity is validated");
assert(/ACCOUNT_SESSION_CHANGED_EVENT[\s\S]*addEventListener\("storage"[\s\S]*visibilitychange[\s\S]*setInterval/u.test(appSource),
  "A mounted account path does not lock on same-tab, cross-tab, visibility or expiry-session changes");
assert(/accountValidationGeneration[\s\S]*generation === accountValidationGeneration\.current[\s\S]*localSessionPresent/u.test(appSource)
  && /!detail\.active[\s\S]*accountValidationGeneration\.current \+= 1/u.test(appSource),
"A stale successful session validation can reopen an account after a newer invalidation signal");
assert(/mode: "local"/u.test(gateSource) && /mode: "account"/u.test(gateSource)
  && /Use on this device/u.test(gateSource),
"The RC no longer offers an explicit offline local-only identity alongside account mode");
assert(!/\b(?:registerProfile|signInProfile|signOutProfile|saveProfile|syncProfile|getProfile|mergeProfiles|newProfile)\b/u.test(gateSource),
  "The RC account UI reached a legacy training-profile authority function");
assert(!/URLSearchParams[\s\S]*get\("athlete"\)/u.test(gateSource)
  && /legacyLocal\?\.startsWith\("vnext-rc-"\)/u.test(gateSource)
  && /identity\.mode === "local"[\s\S]*legacyAthleteKey\(namespace\)/u.test(gateSource),
  "A query or legacy account-ID fallback can select an account observation store without authentication");
assert(/The returned v1\.2 profile[\s\S]*intentionally ignored/u.test(source)
  && /syncVNextShadowObservations[\s\S]*parseStableId\("athlete", profileId\)/u.test(source),
"The shared account boundary no longer documents or enforces vNext identity-only hydration and profile-ID sync binding");
const productionSource = readFileSync("app/vnext/production/VNextProductionApp.tsx", "utf8");
assert(productionSource.includes('storageNamespace: PRODUCTION_STORAGE_NAMESPACE')
  && productionSource.includes('shadowDatabaseName: PRODUCTION_SHADOW_DATABASE')
  && productionSource.includes('"parallette25-vnext-production1"'),
"Production device identity/recovery/IndexedDB truth is not isolated from same-origin RC preview state");

if (failures.length) {
  console.error(`vNext Phase 10 account-boundary validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`vNext Phase 10 account-boundary validation passed (${assertions} assertions).`);
}
