import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

createRequire(import.meta.url)("fake-indexeddb/auto");
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};
const dbName = "parallette25-vnext-production1";
const athleteId = "signout-test-athlete";
const otherId = "signout-other-athlete";
const key = (kind, athlete = athleteId, namespace = "vnext-production1") => `parallette25-${namespace}-${kind}-v1:${athlete}`;
const requests = [];
let duringSync;
let duringLogout;
let beforeFinalClear;
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(String(url)).pathname;
  requests.push({ path, init });
  if (path === "/auth/login") return Response.json({ profile: { profileId: athleteId, username: "Test Athlete" }, token: "synthetic-token", expiresAt: "2099-01-01T00:00:00.000Z" });
  if (path === "/auth/logout") { await duringLogout?.(); return Response.json({ ok: true }); }
  if (path === "/vnext/shadow/sync") {
    await duringSync?.();
    return Response.json({ error: "Synthetic offline sync" }, { status: 503 });
  }
  throw new Error(`Unexpected synthetic request ${path}`);
};
const compile = (path, require) => {
  const source = readFileSync(path, "utf8").replaceAll("import.meta.env.VITE_PROFILE_API_URL", '"https://profiles.example.test"');
  const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", compiled)(module, module.exports, require);
  return module.exports;
};
const boundary = compile("app/profileStore.ts", (name) => {
  if (!name.startsWith("./")) throw new Error(`Unexpected account import ${name}`);
  if (name === "./vnext/persistence/indexedDb") {
    const actual = load("app/vnext/persistence/indexedDb.ts");
    return { ...actual, clearVNextShadowAthleteData: async (...args) => { await beforeFinalClear?.(); return actual.clearVNextShadowAthleteData(...args); } };
  }
  return load(`app/${name.slice(2)}.ts`);
});
const { createVNextShadowStore } = load("app/vnext/persistence/indexedDb.ts");
const { createAssessmentDraft } = load("app/vnext/assessment/flow.ts");
const { vNextDefinitionBundle: bundle } = load("app/vnext/definitions/index.ts");
const store = createVNextShadowStore({ databaseName: dbName });
let count = 0;
const scenario = async (label, run) => {
  memory.clear(); requests.length = 0; duringSync = undefined; duringLogout = undefined; beforeFinalClear = undefined;
  await store.clearAthlete(athleteId); await store.clearAthlete(otherId);
  await boundary.signInVNextAccount("Test Athlete", "synthetic-password");
  requests.length = 0;
  await run(); count++; console.log(`PASS ${label}`);
};
const blocked = async (options) => {
  let error;
  try { await boundary.signOutVNextAccount(athleteId, dbName, options); } catch (reason) { error = reason; }
  assert(error instanceof boundary.VNextPendingWorkError, "Pending work must use the actionable guard");
  assert(boundary.hasVNextAccountSession(athleteId), "Guard must keep account access");
  assert(!requests.some(({ path }) => path === "/auth/logout"), "Guard must run before logout");
  return error.pendingWork;
};
const draft = () => createAssessmentDraft({ id: "signout-setup", athleteId, createdAt: "2026-10-19T10:00:00.000Z", bundle });

for (const stage of ["preview", "active", "review", "prepared"]) await scenario(`${stage} workout cannot silently disappear on sign-out`, async () => {
  const raw = JSON.stringify({ version: 1, stage, athleteId, facts: { measuredSeconds: 42 }, reviewDraft: { answers: ["right"] } });
  memory.set(key("workout-recovery"), raw);
  const pending = await blocked();
  assert.equal(memory.get(key("workout-recovery")), raw);
  assert.match(pending.fingerprint, /^[a-f0-9]{64}$/u);
});

for (const version of [1, 2]) await scenario(`guided-check recovery v${version} is protected without reinterpretation`, async () => {
  const raw = JSON.stringify({ version, kind: version === 2 ? "progression" : undefined, pending: { measuredSeconds: 20 } });
  memory.set(key("guided-recovery"), raw);
  assert((await blocked()).descriptions.includes("an unfinished guided check"));
  assert.equal(memory.get(key("guided-recovery")), raw);
});

for (const version of [2, 3]) await scenario(`native/mixed runner v${version} original timer key is protected`, async () => {
  const timerKey = key("active-workout", athleteId, "vnext-rc");
  memory.set(timerKey, JSON.stringify({ version, seconds: 51 }));
  const pending = await blocked();
  await boundary.signOutVNextAccount(athleteId, dbName, { discardPendingWorkFingerprint: pending.fingerprint });
  assert(!memory.has(timerKey));
  assert(!boundary.hasVNextAccountSession(athleteId));
});

await scenario("unfinished setup is protected; informed discard clears only this athlete", async () => {
  await store.saveAssessmentDraft(draft());
  const other = { ...draft(), id: "other-setup", athleteId: otherId };
  await store.saveAssessmentDraft(other);
  memory.set(key("guided-recovery", otherId), "other private draft");
  memory.set(key("short-workout"), "saved preference");
  const pending = await blocked();
  assert(pending.descriptions.includes("unfinished setup"));
  assert.deepEqual(await store.readAssessmentDraft(athleteId), draft());
  await boundary.signOutVNextAccount(athleteId, dbName, { discardPendingWorkFingerprint: pending.fingerprint });
  assert.equal(await store.readAssessmentDraft(athleteId), null);
  assert.deepEqual(await store.readAssessmentDraft(otherId), other);
  assert.equal(memory.get(key("guided-recovery", otherId)), "other private draft");
  assert(!memory.has(key("short-workout")));
});

await scenario("unknown or corrupt recovery requires an explicit choice", async () => {
  memory.set(key("workout-recovery"), "{not-valid-json");
  const pending = await blocked();
  assert.equal(memory.get(key("workout-recovery")), "{not-valid-json");
  await boundary.signOutVNextAccount(athleteId, dbName, { discardPendingWorkFingerprint: pending.fingerprint });
  assert(!memory.has(key("workout-recovery")));
});

await scenario("discard choice cannot remove a newer review draft", async () => {
  memory.set(key("workout-recovery"), JSON.stringify({ stage: "review", reviewDraft: { answers: ["right"] } }));
  const pending = await blocked();
  memory.set(key("workout-recovery"), JSON.stringify({ stage: "review", reviewDraft: { answers: ["hard"] } }));
  const changed = await blocked({ discardPendingWorkFingerprint: pending.fingerprint });
  assert.notEqual(changed.fingerprint, pending.fingerprint);
  assert.match(memory.get(key("workout-recovery")), /hard/u);
});

await scenario("work created while sync waits is rechecked before logout", async () => {
  duringSync = () => memory.set(key("guided-recovery"), JSON.stringify({ version: 2, measuredSeconds: 10 }));
  await blocked();
  assert(memory.has(key("guided-recovery")));
});

await scenario("inaccessible recovery storage fails closed before logout or deletion", async () => {
  const getItem = localStorage.getItem;
  localStorage.getItem = (storageKey) => {
    if (storageKey === key("workout-recovery")) throw new Error("Synthetic storage read failure");
    return getItem(storageKey);
  };
  try {
    await assert.rejects(boundary.signOutVNextAccount(athleteId, dbName), /Synthetic storage read failure/u);
    assert(boundary.hasVNextAccountSession(athleteId));
    assert(!requests.some(({ path }) => path === "/auth/logout"));
  } finally { localStorage.getItem = getItem; }
});

await scenario("work changed during async fingerprinting is checked synchronously before logout", async () => {
  memory.set(key("workout-recovery"), JSON.stringify({ stage: "review", answers: ["right"] }));
  const pending = await blocked(), digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  crypto.subtle.digest = async (...args) => {
    const result = await digest(...args);
    if (++calls === 2) memory.set(key("workout-recovery"), JSON.stringify({ stage: "review", answers: ["hard"] }));
    return result;
  };
  try {
    await assert.rejects(boundary.signOutVNextAccount(athleteId, dbName, { discardPendingWorkFingerprint: pending.fingerprint }), /training changed in another open view/u);
    assert.match(memory.get(key("workout-recovery")), /hard/u); assert(boundary.hasVNextAccountSession(athleteId));
    assert(!requests.some(({ path }) => path === "/auth/logout"));
  } finally { crypto.subtle.digest = digest; }
});

await scenario("an observation arriving after preflight aborts deletion atomically and stays account-locked", async () => {
  beforeFinalClear = () => store.putAthleteIntent({ schemaVersion: 1, athleteId, updatedAt: "2026-10-19T10:00:00.000Z", goals: [], equipment: ["floor"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } });
  await assert.rejects(boundary.signOutVNextAccount(athleteId, dbName), /New training arrived while signing out/u);
  assert(!boundary.hasVNextAccountSession(athleteId));
  assert((await store.readSyncUpload(athleteId, 10)).length > 0);
  assert((await store.readProjectionSources(athleteId)).intent);
});

await scenario("setup changed after preflight is retained by the deletion transaction", async () => {
  beforeFinalClear = () => store.saveAssessmentDraft(draft());
  await assert.rejects(boundary.signOutVNextAccount(athleteId, dbName), /New training arrived while signing out/u);
  assert.deepEqual(await store.readAssessmentDraft(athleteId), draft());
  assert(!boundary.hasVNextAccountSession(athleteId));
});

await scenario("a new workflow arriving during final account cleanup is retained and locked", async () => {
  beforeFinalClear = () => memory.set(key("guided-recovery"), JSON.stringify({ version: 2, result: { eventId: "new-check" } }));
  await assert.rejects(boundary.signOutVNextAccount(athleteId, dbName), /New unfinished training arrived/u);
  assert.match(memory.get(key("guided-recovery")), /new-check/u); assert(!boundary.hasVNextAccountSession(athleteId));
});

await scenario("explicit workflow discard never bypasses unsynced observation protection", async () => {
  memory.set(key("workout-recovery"), JSON.stringify({ stage: "review" }));
  const pending = await blocked();
  await store.putAthleteIntent({ schemaVersion: 1, athleteId, updatedAt: "2026-10-19T10:00:00.000Z", goals: [], equipment: ["floor"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } });
  await assert.rejects(boundary.signOutVNextAccount(athleteId, dbName, { discardPendingWorkFingerprint: pending.fingerprint }), /Connect and sync/u);
  assert(boundary.hasVNextAccountSession(athleteId));
  assert(memory.has(key("workout-recovery")));
  assert((await store.readSyncUpload(athleteId, 10)).length > 0);
  assert(!requests.some(({ path }) => path === "/auth/logout"));
});

await scenario("finished setup and no pending work need no extra sign-out choice", async () => {
  await store.saveAssessmentDraft({ ...draft(), status: "committed", committedAt: "2026-10-19T10:01:00.000Z", updatedAt: "2026-10-19T10:01:00.000Z", revision: 1 });
  await boundary.signOutVNextAccount(athleteId, dbName);
  assert.equal(await store.readAssessmentDraft(athleteId), null);
  assert(!boundary.hasVNextAccountSession(athleteId));
  assert.equal(requests.filter(({ path }) => path === "/auth/logout").length, 1);
});

await scenario("slow logout locks local account access immediately and keeps authenticated revocation", async () => {
  let finishLogout;
  duringLogout = () => new Promise((resolve) => { finishLogout = resolve; });
  const completion = boundary.signOutVNextAccount(athleteId, dbName);
  for (let attempt = 0; attempt < 100 && !finishLogout; attempt++) await new Promise(setImmediate);
  assert(finishLogout, "Synthetic logout must begin");
  assert(!boundary.hasVNextAccountSession(athleteId), "Account must lock before the network responds");
  const request = requests.find(({ path }) => path === "/auth/logout");
  assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer synthetic-token");
  finishLogout(); await completion;
});

// Exercise the actual account buttons, including repeated taps before render.
let host;
const hooks = {
  useState(initial) {
    const owner = host, index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [owner.slots[index].value, (next) => { owner.slots[index].value = typeof next === "function" ? next(owner.slots[index].value) : next; }];
  },
  useRef(initial) { const index = host.cursor++; return (host.slots[index] ??= { current: initial }); },
  useEffect(effect, deps) {
    const owner = host, index = owner.cursor++, previous = owner.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) owner.effects.push(() => { previous?.cleanup?.(); owner.slots[index] = { deps, cleanup: effect() }; });
  },
};
const jsx = (type, props) => ({ type, props: props ?? {} });
let accountApi;
const { VNextAccountGate } = compile("app/vnext/releaseCandidate/VNextAccountGate.tsx", (name) => {
  if (name === "react") return hooks;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (name === "../../profileStore") return accountApi;
  if (name === "../../accountSessionSignals") return load("app/accountSessionSignals.ts");
  if (name === "../index") return load("app/vnext/contracts.ts");
  throw new Error(`Unexpected UI import ${name}`);
});
const elements = (node) => Array.isArray(node) ? node.flatMap(elements) : node && typeof node === "object" ? [node, ...elements(node.props?.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
const createHost = (props) => {
  const owner = { slots: [], cursor: 0, effects: [], tree: undefined };
  owner.render = () => { host = owner; owner.cursor = 0; owner.effects = []; owner.tree = VNextAccountGate(props); for (const effect of owner.effects) effect(); };
  owner.drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); owner.render(); };
  owner.button = (label) => elements(owner.tree).find((node) => node.type === "button" && text(node) === label);
  owner.click = (label) => { const button = owner.button(label); assert(button, `Missing ${label}`); assert(!button.props.disabled); button.props.onClick(); };
  owner.render(); return owner;
};
await scenario("account UI returns to pending work or explicitly discards the exact inspected drafts", async () => {
  const pending = { descriptions: ["a workout waiting to be saved"], fingerprint: "exact-draft-fingerprint" };
  const calls = []; let returned = 0, signedOut = 0;
  accountApi = { hasVNextAccountSession: () => true, VNextPendingWorkError: boundary.VNextPendingWorkError,
    signOutVNextAccount: async (...args) => { calls.push(args); if (!args[2].discardPendingWorkFingerprint) throw new boundary.VNextPendingWorkError(pending); } };
  const view = createHost({ current: { version: 1, athleteId, mode: "account", username: "Test" }, storageNamespace: "vnext-production1", shadowDatabaseName: dbName, onSelected() {}, onClose() { returned++; }, onSignedOut() { signedOut++; } });
  await view.drain();
  view.click("Sign out on this device"); view.click("Sign out on this device");
  await view.drain();
  assert.equal(calls.length, 1, "Double tap must not duplicate sign-out");
  assert.equal(signedOut, 0);
  assert.match(text(view.tree), /cannot be restored from sync/u);
  view.click("Return to training");
  assert.equal(returned, 1); assert.equal(calls.length, 1);
  view.click("Discard unfinished work & sign out");
  await view.drain();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], [athleteId, dbName, { discardPendingWorkFingerprint: pending.fingerprint }]);
  assert.equal(signedOut, 1);
});
store.close();
console.log(`Sign-out safety: ${count} scenarios passed using synthetic local data and a mock account service.`);
