import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { handleVNextShadowSync } from "../profile-api/vnext-shadow.js";
createRequire(import.meta.url)("fake-indexeddb/auto");
const { createAppUpdateController, hasUnfinishedUpdateWork } = load("app/vnext/releaseCandidate/appUpdate.ts");
const { syncObservationDeltas, createAuthenticatedShadowTransport, VNEXT_SYNC_READER_VERSION } = load("app/vnext/persistence/sync.ts");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const oldBuild = "a".repeat(20), newBuild = "b".repeat(20);
let checks = 0;
const pass = (name) => { checks++; console.log(`PASS ${name}`); };
const savedTimer = { athleteId: "saved-timer-athlete", workout: null, guided: null,
  timer: JSON.stringify({ athleteId: "saved-timer-athlete", planId: "saved-plan" }), savedPlanIds: ["saved-plan"] };
assert.equal(hasUnfinishedUpdateWork(savedTimer), false);
for (const changed of [{ savedPlanIds: [] }, { workout: "{}" }, { guided: "{}" }, { timer: "broken" },
  { timer: JSON.stringify({ athleteId: "other", planId: "saved-plan" }) }]) {
  assert.equal(hasUnfinishedUpdateWork({ ...savedTimer, ...changed }), true);
}
pass("a saved early finish does not block updates; unmatched, malformed and still-pending work stays protected");

// Execute the real worker, including its install/message/fetch handlers.
const handlers = {};
const cacheData = new Map();
let shellBuild = newBuild;
const caches = {
  async keys() { return [...cacheData.keys()]; },
  async delete(key) { return cacheData.delete(key); },
  async open(key) {
    if (!cacheData.has(key)) cacheData.set(key, new Map());
    const data = cacheData.get(key);
    return {
      async match(request) { return data.get(typeof request === "string" ? request : request.url)?.clone(); },
      async put(request, response) { data.set(typeof request === "string" ? request : request.url, response.clone()); },
      async addAll(requests) { for (const request of requests) data.set(request.url, new Response(request.url.endsWith("/")
        ? `NEW SHELL <meta name="p25-build-id" content="${shellBuild}" />`
        : request.url.endsWith("asset-manifest.json") ? JSON.stringify({ buildId: newBuild, channel: "vnext-production1" }) : "ASSET")); },
    };
  },
};
const scope = "https://qa.invalid/parallettes/";
let clients = [{ id: "app", url: scope }], activations = 0, network = true;
const self = {
  registration: { scope },
  addEventListener(type, handler) { handlers[type] = handler; },
  clients: { async matchAll() { return clients; }, async claim() {} },
  async skipWaiting() { activations++; },
};
const fetchFixture = async () => {
  if (!network) throw new Error("offline");
  return new Response(JSON.stringify({ buildId: newBuild, channel: "vnext-production1", assets: ["assets/new.js"] }));
};
vm.runInNewContext(readFileSync("public/sw.js", "utf8")
  .replace("__PWA_BUILD_ID__", newBuild).replace("__PWA_CACHE_CHANNEL__", "vnext-production1"),
{ self, caches, fetch: fetchFixture, URL, Request, Response });
const dispatch = async (type, event = {}) => {
  let work;
  handlers[type]({ ...event, waitUntil(promise) { work = promise; } });
  await work;
};
const message = async (data, id = "app") => {
  let reply;
  await dispatch("message", { data, source: { id }, ports: [{ postMessage(value) { reply = value; } }] });
  return reply;
};
await dispatch("install");
assert.equal(activations, 0);
const oldCache = await caches.open(`parallette-25-vnext-production1-${oldBuild}`);
await oldCache.put(`${scope}assets/old.js`, new Response("OLD LAZY ASSET"));
await caches.open("parallette-25-v1-retained");
await dispatch("activate");
assert.equal(cacheData.size, 3);
pass("install never forces activation; activation retains older assets and other cache lanes");
clients.push({ id: "other", url: scope });
assert.equal((await message({ type: "P25_APPLY_UPDATE", buildId: newBuild })).status, "other-windows");
assert.equal(activations, 0);
assert.equal(await message({ type: "P25_APPLY_UPDATE", buildId: newBuild }, "outsider"), undefined);
clients.pop();
assert.equal((await message({ type: "P25_APPLY_UPDATE", buildId: oldBuild })).status, "changed");
assert.equal((await message({ type: "P25_APPLY_UPDATE", buildId: newBuild })).status, "accepted");
assert.equal(activations, 1);
pass("only exact downloaded build from the sole app window can activate");
network = false;
const workerFetch = async (url, mode) => {
  let response;
  await dispatch("fetch", { request: { method: "GET", url, mode }, respondWith(promise) { response = promise; } });
  return (await response).text();
};
assert.match(await workerFetch(scope, "navigate"), /NEW SHELL/);
assert.equal(await workerFetch(`${scope}assets/old.js`, "cors"), "OLD LAZY ASSET");
pass("offline navigation uses a coherent shell and a surviving old page can load its native asset");
clients.push({ id: "other", url: scope });
await message({ type: "P25_RELEASE_OLD_CACHES", buildId: newBuild });
assert.equal(cacheData.size, 3);
clients.pop();
await message({ type: "P25_RELEASE_OLD_CACHES", buildId: newBuild });
assert.equal(cacheData.size, 2);
assert(cacheData.has("parallette-25-v1-retained"));
pass("obsolete assets are cleaned only after the new shell is alone; other lanes are untouched");
network = true;
shellBuild = oldBuild;
await assert.rejects(dispatch("install"), /update changed during download/);
assert.equal(cacheData.has(`parallette-25-vnext-production1-${newBuild}`), false);
assert(cacheData.has("parallette-25-v1-retained"));
pass("a mixed-version download fails installation and removes only its incomplete cache");

const makeController = (options = {}) => {
  const workers = new EventTarget();
  const active = { id: oldBuild }, waiting = { id: newBuild };
  const registration = Object.assign(new EventTarget(), { waiting, active, installing: null,
    async update() { if (options.offline) throw new Error("offline"); } });
  workers.controller = active;
  workers.register = async () => registration;
  let safe = false, reloads = 0, requests = 0, latest;
  const controller = createAppUpdateController({
    workers, base: "/parallettes/", runningBuild: options.runningBuild ?? oldBuild,
    canApply: () => safe,
    onState: (state) => { latest = state; },
    reload: () => { reloads++; },
    request: async (worker, type) => {
      if (type === "P25_UPDATE_VERSION") return { buildId: worker.id };
      if (type === "P25_APPLY_UPDATE") { requests++; return { status: options.other ? "other-windows" : "accepted" }; }
      return { status: "accepted" };
    },
  });
  return { controller, workers, waiting, setSafe(value) { safe = value; }, state: () => latest,
    reloads: () => reloads, requests: () => requests };
};
const blocked = makeController();
await blocked.controller.check();
assert.equal(blocked.state().phase, "available");
await blocked.controller.apply();
assert.equal(blocked.requests(), 0);
assert.equal(blocked.reloads(), 0);
blocked.workers.dispatchEvent(new Event("controllerchange"));
await Promise.resolve();
assert.equal(blocked.reloads(), 0);
blocked.controller.dispose();
pass("pending work blocks update; an unsolicited controller change never reloads");
const mixedShell = makeController({ runningBuild: newBuild });
await mixedShell.controller.check();
assert.equal(mixedShell.state().phase, "available");
mixedShell.setSafe(true); await mixedShell.controller.apply();
assert.equal(mixedShell.requests(), 1);
mixedShell.controller.dispose();
pass("new HTML served by a legacy worker still offers activation of its matching waiting worker");
const multi = makeController({ other: true });
await multi.controller.check(); multi.setSafe(true); await multi.controller.apply();
assert.equal(multi.reloads(), 0);
assert.match(multi.state().message, /other Parallette25/);
multi.controller.dispose();
pass("another open app window produces a recoverable instruction, not a forced reload");

// A genuine local store with unsynced intent survives activation and reopening.
const athleteId = "app-update-unsynced";
const dbName = `app-update-qa-${Date.now()}`;
const store = createVNextShadowStore({ databaseName: dbName });
await store.putAthleteIntent({ schemaVersion: 1, athleteId, updatedAt: "2026-10-20T10:00:00.000Z",
  goals: [{ graphId: "planche", priority: "primary" }], equipment: ["floor", "parallettes"],
  defaultSessionDemand: "standard", preferences: { specialistOptIn: false } });
const before = canonicalJson(await store.readSyncUpload(athleteId, 20));
const successful = makeController({ offline: true });
await successful.controller.check(); successful.setSafe(true); await successful.controller.apply();
successful.workers.controller = successful.waiting;
successful.workers.dispatchEvent(new Event("controllerchange"));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(successful.reloads(), 1);
successful.controller.dispose();
const reopened = createVNextShadowStore({ databaseName: dbName });
assert.equal(canonicalJson(await reopened.readSyncUpload(athleteId, 20)), before);
assert.equal((await reopened.readProjectionSources(athleteId)).intent.goals[0].graphId, "planche");
assert.equal(await reopened.getSyncCursor(athleteId), 0);
pass("downloaded update works offline; reopening retains exact unsynced intent/outbox and cursor");

let applyCalls = 0, acknowledgeCalls = 0;
const protectedStore = new Proxy(reopened, { get(target, key) {
  if (key === "applySyncDelta") return async () => { applyCalls++; };
  if (key === "acknowledgeSync") return async () => { acknowledgeCalls++; };
  return typeof target[key] === "function" ? target[key].bind(target) : target[key];
} });
await assert.rejects(syncObservationDeltas(protectedStore, athleteId, async (request) => {
  assert.equal(request.readerVersion, VNEXT_SYNC_READER_VERSION);
  return { schemaVersion: 1, minimumReaderVersion: VNEXT_SYNC_READER_VERSION + 1, cursor: 1, hasMore: false, changes: [], acknowledged: [], conflicts: [] };
}), /shadow-sync-update-required/);
assert.equal(applyCalls, 0); assert.equal(acknowledgeCalls, 0);
assert.equal(canonicalJson(await reopened.readSyncUpload(athleteId, 20)), before);
const transport = createAuthenticatedShadowTransport(async () => new Response("{}", { status: 426 }), "https://qa.invalid/sync");
await assert.rejects(transport({ schemaVersion: 1, cursor: 0, limit: 1, upload: [] }), /shadow-sync-update-required/);
pass("future reader requirement stops sync before local writes, cursor movement or acknowledgements");
let dbCalls = 0;
for (const readerVersion of [undefined, 1, 2, 3, "4"]) {
  const response = await handleVNextShadowSync({}, { DB: new Proxy({}, { get() { dbCalls++; throw new Error("DB must not be touched"); } }) },
    "https://qa.invalid", { profile_id: athleteId }, {
      readJson: async () => ({ schemaVersion: 1, readerVersion, cursor: 0, limit: 1, upload: [] }),
      json: (body, status) => new Response(JSON.stringify(body), { status }),
    });
  assert.equal(response.status, 426);
  assert.equal((await response.json()).minimumReaderVersion, VNEXT_SYNC_READER_VERSION);
}
assert.equal(dbCalls, 0);
pass("Worker rejects missing/old/malformed reader capabilities before touching training storage");
console.log(`App update and compatibility: ${checks} focused scenarios passed.`);
