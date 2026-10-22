// Dependability checks for training sync: a row the account will not accept is
// set aside (with its dependants) while every independent row still uploads;
// sign-out names unsynced rows; device-only athletes stay reachable; honest
// save outcomes; size-scaled sync deadline. Synthetic data only: fake-indexeddb
// and an in-memory SQLite D1 adapter running the real Worker code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
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

const worker = (await import("../profile-api/worker.js")).default;
const contracts = load("app/vnext/contracts.ts");
const definitions = load("app/vnext/definitions/index.ts");
const persistence = load("app/vnext/persistence/index.ts");
const accountRequest = load("app/accountRequest.ts");
const { sha256 } = persistence;
const bundle = definitions.vNextDefinitionBundle;

let passed = 0;
const scenario = async (label, run) => { await run(); passed += 1; console.log(`PASS ${label}`); };
const rejects = async (fn, pattern) => {
  try { await fn(); } catch (error) {
    if (pattern) assert.match(String(error?.message ?? error), pattern);
    return error;
  }
  throw new Error(`Expected rejection${pattern ? ` matching ${pattern}` : ""}`);
};
const ts0 = (minute, hour = 9, day = 20) => new Date(Date.UTC(2026, 7, day, hour, minute, 0, 0)).toISOString();
const newStore = (label) => persistence.createVNextShadowStore({ databaseName: `dependability-${label}-${crypto.randomUUID()}` });

const floorPush = bundle.benchmarkProtocols.find((p) => p.id === definitions.milestoneBenchmarkId("parallette-pushing", "floor-push-up"));
const exercise = bundle.exercises.find((item) => item.id === floorPush.exerciseId);
const variant = exercise.prescriptionVariants.find((item) => item.id === floorPush.prescriptionVariantId);
const graph = bundle.graphs.find((item) => item.id === floorPush.subject.milestone.graphId);
const planFixture = (athleteId, suffix, createdAt, rationale = []) => {
  const policyId = contracts.parseStableId("policy", "dependability-generator");
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("session-plan", `dependability-plan-${suffix}`),
    athleteId, createdAt, catalogueVersion: bundle.catalogueVersion,
    generatorPolicyId: policyId, generatorPolicyVersion: contracts.parseDefinitionVersion(1),
    definitionReferences: [
      { kind: "policy", id: policyId, version: contracts.parseDefinitionVersion(1) },
      { kind: "exercise", id: exercise.id, version: exercise.definitionVersion },
      { kind: "graph", id: graph.id, version: graph.definitionVersion },
    ],
    intendedDurationSeconds: 300,
    items: [{ id: contracts.parseStableId("plan-item", `dependability-item-${suffix}`), exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id, purpose: "primary-development",
      plannedSeconds: 300, targetMilestone: floorPush.subject.milestone, demand: variant.demand }],
    rationale,
  };
};
const recordFor = (plan, startedAt, overrides = {}) => {
  const completedAt = new Date(Date.parse(startedAt) + 300_000).toISOString();
  return {
    schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
    id: contracts.parseStableId("session-record", plan.id),
    athleteId: plan.athleteId, planId: plan.id, startedAt, completedAt, recordedAt: completedAt, status: "complete",
    itemOutcomes: [{ planItemId: plan.items[0].id, status: "completed", participationSeconds: 240, review: { outcome: "partial", difficulty: "right" } }],
    ...overrides,
  };
};
const intentFixture = (athleteId, updatedAt, goals = []) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION, athleteId, updatedAt, goals,
  equipment: [contracts.parseStableId("equipment", "floor"), contracts.parseStableId("equipment", "parallettes")],
  defaultSessionDemand: "standard", preferences: { specialistOptIn: false },
});
const pushingGoal = [{ graphId: contracts.parseStableId("graph", "parallette-pushing"), priority: "primary" }];
const resetFixture = async (athleteId, resetAt) => ({
  schemaVersion: 1, id: contracts.parseStableId("event", `athlete-reset-${await sha256({ athleteId, resetAt })}`),
  athleteId, resetAt, recordedAt: resetAt, source: "athlete-reset",
});

// ---------- Real Worker over an in-memory SQLite D1 adapter ----------
class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first(column) { const row = this.db.prepare(this.sql).get(...this.values) ?? null; return column && row ? row[column] : row; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
class D1 {
  database = new DatabaseSync(":memory:");
  constructor() {
    this.database.exec(readFileSync("profile-api/migrations/0001_password_accounts.sql", "utf8"));
    this.database.exec(readFileSync("profile-api/migrations/0002_vnext_shadow_observations.sql", "utf8"));
  }
  prepare(sql) { return new Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try { const out = []; for (const s of statements) out.push(await s.run()); this.database.exec("COMMIT"); return out; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}
const origin = "https://kyriakos243.github.io";
const endpoint = "https://profiles.example";
const env = { DB: new D1(), PROFILES: { async get() { return null; } }, ALLOWED_ORIGINS: origin, VNEXT_SHADOW_MODE: "true", VNEXT_PRODUCTION_AUTHORITY_MODE: "true" };
let ipSequence = 0;
const register = async (username) => {
  const response = await worker.fetch(new Request(`${endpoint}/auth/register`, { method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": `203.0.113.${++ipSequence}` },
    body: JSON.stringify({ username, password: "dependability password 123" }) }), env);
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return { athleteId: contracts.parseStableId("athlete", body.profile.profileId), profileId: body.profile.profileId, token: body.token };
};
const transportFor = (token) => persistence.createAuthenticatedShadowTransport(async (input, init = {}) => {
  const headers = new Headers(init.headers); headers.set("origin", origin); headers.set("authorization", `Bearer ${token}`);
  return worker.fetch(new Request(input, { ...init, headers }), env);
}, `${endpoint}/vnext/shadow/sync`);
const serverCount = (table, profileId) => Number(env.DB.database.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE profile_id = ?`).get(profileId).c);
const sync = (store, account, options) => persistence.syncObservationDeltas(store, account.athleteId, transportFor(account.token), options);

await scenario("goal tie is set aside; a later workout still reaches the account; keeping this device's goals resolves it", async () => {
  const account = await register("Dependability Goal Tie");
  const deviceA = newStore("tie-a"), deviceB = newStore("tie-b");
  await deviceA.putAthleteIntent(intentFixture(account.athleteId, ts0(0)));
  await sync(deviceA, account);
  await deviceB.putAthleteIntent(intentFixture(account.athleteId, ts0(0), pushingGoal));
  const plan = planFixture(account.athleteId, "tie-workout", ts0(5));
  await deviceB.appendSession(plan, recordFor(plan, ts0(5)));
  const error = await rejects(() => sync(deviceB, account), /^shadow-sync-conflict:athlete-intent:.*intent-timestamp-conflict/u);
  assert(error instanceof persistence.ShadowSyncHeldError);
  assert.equal(serverCount("vnext_shadow_session_records", account.profileId), 1, "independent workout must upload");
  const holds = await deviceB.readSyncHolds(account.athleteId);
  assert.deepEqual(holds.map(({ kind, state }) => [kind, state]), [["athlete-intent", "held"]]);
  assert.equal(holds[0].hold.detail, "intent-timestamp-conflict");
  assert.equal((await deviceB.readSyncUpload(account.athleteId, 10)).length, 0);
  const again = await sync(deviceB, account);
  assert.equal(again.held, 1, "later runs report the hold without throwing");
  assert(holds[0].hold.stashed.length === 0 || holds[0].hold.stashed[0].kind === "athlete-intent");
  const stashedNow = (await deviceB.readSyncHolds(account.athleteId))[0].hold.stashed;
  assert.equal(stashedNow.length, 1, "the other device's goals are kept for an explicit choice");
  await deviceB.resolveSyncHold(account.athleteId, { kind: "athlete-intent", id: account.athleteId }, "keep-local", ts0(30));
  const resolved = await sync(deviceB, account);
  assert.equal(resolved.held, 0);
  assert.equal((await deviceB.readUnsyncedItems(account.athleteId)).length, 0, "outbox empties after resolution");
  await sync(deviceA, account);
  assert.deepEqual((await deviceA.readProjectionSources(account.athleteId)).intent.goals, pushingGoal, "kept goals reach the other device");
  deviceA.close(); deviceB.close();
});

await scenario("using the other device's goals replaces only the mutable goals and clears the hold", async () => {
  const account = await register("Dependability Use Account Goals");
  const deviceA = newStore("use-a"), deviceB = newStore("use-b");
  await deviceA.putAthleteIntent(intentFixture(account.athleteId, ts0(0), pushingGoal));
  await sync(deviceA, account);
  await deviceB.putAthleteIntent(intentFixture(account.athleteId, ts0(0)));
  await rejects(() => sync(deviceB, account), /intent-timestamp-conflict/u);
  await sync(deviceB, account);
  await deviceB.resolveSyncHold(account.athleteId, { kind: "athlete-intent", id: account.athleteId }, "use-account-intent", ts0(30));
  assert.deepEqual((await deviceB.readProjectionSources(account.athleteId)).intent.goals, pushingGoal);
  assert.equal((await deviceB.readUnsyncedItems(account.athleteId)).length, 0);
  assert.equal((await sync(deviceB, account)).held, 0);
  await rejects(() => deviceB.resolveSyncHold(account.athleteId, { kind: "athlete-intent", id: account.athleteId }, "keep-local", ts0(31)), /sync-hold-not-found/u);
  deviceA.close(); deviceB.close();
});

await scenario("same plan completed on two devices: the workout and its correction are set aside, independent work uploads, the account version is kept aside", async () => {
  const account = await register("Dependability Same Plan");
  const deviceA = newStore("plan-a"), deviceB = newStore("plan-b");
  const plan = planFixture(account.athleteId, "shared", ts0(0));
  const recordA = recordFor(plan, ts0(0));
  await deviceA.appendSession(plan, recordA);
  await sync(deviceA, account);
  const recordB = recordFor(plan, ts0(1), { itemOutcomes: [{ ...recordA.itemOutcomes[0], participationSeconds: 200 }] });
  await deviceB.appendSession(plan, recordB);
  const correctionB = { ...recordFor(plan, ts0(1)), id: contracts.parseStableId("session-record", "dependability-correction-b"),
    supersedesRecordId: recordB.id, recordedAt: ts0(20), itemOutcomes: [{ ...recordA.itemOutcomes[0], participationSeconds: 180 }] };
  await deviceB.appendSession(plan, correctionB);
  const other = planFixture(account.athleteId, "independent", ts0(30));
  await deviceB.appendSession(other, recordFor(other, ts0(30)));
  await rejects(() => sync(deviceB, account), /^shadow-sync-conflict:.*session-record:.*immutable-id-conflict/u);
  const unsynced = await deviceB.readUnsyncedItems(account.athleteId);
  const states = Object.fromEntries(unsynced.map((item) => [`${item.kind}:${item.id}`, item.state]));
  assert.equal(states[`session-record:${recordB.id}`], "held");
  assert.equal(states[`session-record:${correctionB.id}`], "blocked", "the correction must never attach to the other device's workout");
  assert.equal(serverCount("vnext_shadow_session_records", account.profileId), 2, "account keeps its workout plus the independent one");
  assert.equal(Number(env.DB.database.prepare("SELECT COUNT(*) AS c FROM vnext_shadow_session_records WHERE profile_id = ? AND record_id = ?")
    .get(account.profileId, correctionB.id).c), 0);
  const beforeCursor = await deviceB.getSyncCursor(account.athleteId);
  const later = await sync(deviceB, account);
  assert.equal(later.held, 1);
  assert(later.cursor >= beforeCursor);
  const stash = (await deviceB.readSyncHolds(account.athleteId))[0].hold.stashed;
  assert(stash.some((item) => item.kind === "session-record" && item.id === recordB.id), "the account version is stashed, not applied");
  const local = await deviceB.readProjectionSources(account.athleteId);
  assert.equal(local.sessionRecords.find((record) => record.id === recordB.id).itemOutcomes[0].participationSeconds, 200,
    "this device's saved workout is never replaced");
  await rejects(() => deviceB.resolveSyncHold(account.athleteId, { kind: "session-record", id: recordB.id }, "keep-local", ts0(40)),
    /sync-hold-not-resolvable-here/u);
  await rejects(() => deviceB.resolveSyncHold(account.athleteId, { kind: "session-record", id: recordB.id }, "retry", ts0(40)),
    /sync-hold-not-retryable/u);
  deviceA.close(); deviceB.close();
});

await scenario("two devices correcting the same workout: the fork is set aside instead of blocking every later page", async () => {
  const account = await register("Dependability Chain Fork");
  const deviceA = newStore("fork-a"), deviceB = newStore("fork-b");
  const plan = planFixture(account.athleteId, "fork", ts0(0));
  const root = recordFor(plan, ts0(0));
  await deviceA.appendSession(plan, root);
  await sync(deviceA, account);
  await sync(deviceB, account);
  const correction = (suffix, seconds, recordedAt) => ({ ...root, id: contracts.parseStableId("session-record", `dependability-fork-${suffix}`),
    supersedesRecordId: root.id, recordedAt, itemOutcomes: [{ ...root.itemOutcomes[0], participationSeconds: seconds }] });
  await deviceA.appendSession(plan, correction("a", 100, ts0(20)));
  await sync(deviceA, account);
  const forkB = correction("b", 90, ts0(21));
  await deviceB.appendSession(plan, forkB);
  await rejects(() => sync(deviceB, account), /^shadow-sync-conflict:.*invalid-reference/u);
  const later = await sync(deviceB, account);
  assert.equal(later.held, 1);
  const hold = (await deviceB.readSyncHolds(account.athleteId))[0];
  assert.equal(hold.id, forkB.id);
  assert(hold.hold.stashed.some((item) => item.id === correction("a", 100, ts0(20)).id), "the other device's correction is kept aside");
  const independent = planFixture(account.athleteId, "after-fork", ts0(40));
  await deviceB.appendSession(independent, recordFor(independent, ts0(40)));
  await sync(deviceB, account);
  assert.equal(Number(env.DB.database.prepare("SELECT COUNT(*) AS c FROM vnext_shadow_session_records WHERE profile_id = ? AND record_id = ?")
    .get(account.profileId, recordFor(independent, ts0(40)).id).c), 1);
  deviceA.close(); deviceB.close();
});

await scenario("an item over the request budget is set aside; the rest uploads; a new build retries it", async () => {
  const account = await register("Dependability Too Large");
  const device = newStore("large");
  const big = planFixture(account.athleteId, "big", ts0(0), [{ code: contracts.parseStableId("reason", "dependability-padding"), message: "x".repeat(9_000) }]);
  await device.appendSession(big, recordFor(big, ts0(0)));
  const small = planFixture(account.athleteId, "small", ts0(10));
  await device.appendSession(small, recordFor(small, ts0(10)));
  await device.putAthleteIntent(intentFixture(account.athleteId, ts0(11)));
  const error = await rejects(() => sync(device, account, { maximumRequestBytes: 6_000, build: "build-one" }), /^shadow-sync-held:session-plan:/u);
  assert.deepEqual(error.summary.newlyHeld.map(({ reason }) => reason), ["too-large"]);
  const states = Object.fromEntries((await device.readUnsyncedItems(account.athleteId)).map((item) => [`${item.kind}:${item.id}`, item.state]));
  assert.equal(states[`session-plan:${big.id}`], "held");
  assert.equal(states[`session-record:${recordFor(big, ts0(0)).id}`], "blocked", "a record cannot upload without its plan");
  assert.equal(serverCount("vnext_shadow_session_records", account.profileId), 1, "the small workout uploads");
  assert.equal((await sync(device, account, { maximumRequestBytes: 6_000, build: "build-one" })).held, 1, "same build keeps it aside");
  const retried = await sync(device, account, { build: "build-two" });
  assert.equal(retried.held, 0, "a new build retries rejected/too-large rows");
  assert.equal(serverCount("vnext_shadow_session_records", account.profileId), 2);
  device.close();
});

await scenario("only item-scoped rejections are pinned on one item; page-wide failures set nothing aside; repeated rejection stops", async () => {
  const account = await register("Dependability Isolation");
  const real = transportFor(account.token);
  const make = async (label) => {
    const device = newStore(label);
    await device.putAthleteIntent(intentFixture(account.athleteId, ts0(0)));
    for (const suffix of ["one", "two", "three"]) {
      const plan = planFixture(account.athleteId, `${label}-${suffix}`, ts0(5));
      await device.appendSession(plan, recordFor(plan, ts0(5)));
    }
    return device;
  };
  const badRecordId = recordFor(planFixture(account.athleteId, "iso-two", ts0(5)), ts0(5)).id;
  const httpError = (status, code) => new persistence.ShadowSyncHttpError(status, code);
  const isolating = async (request) => {
    if (request.upload.some((item) => item.kind === "session-record" && item.id === badRecordId)) throw httpError(400, "vnext-invalid-record");
    return real(request);
  };
  const device = await make("iso");
  const error = await rejects(() => persistence.syncObservationDeltas(device, account.athleteId, isolating), /^shadow-sync-held:session-record:/u);
  assert.deepEqual(error.summary.newlyHeld.map(({ id, reason, detail }) => [id, reason, detail]), [[badRecordId, "rejected", "vnext-invalid-record"]]);
  assert.equal((await device.readUnsyncedItems(account.athleteId)).filter(({ state }) => state === "pending").length, 0);
  device.close();

  for (const [status, code] of [[413, "vnext-delta-too-large"], [401, undefined], [503, undefined], [400, "vnext-delta-limit"], [403, "vnext-athlete-ownership"]]) {
    const pageWide = await make(`page-${status}-${code ?? "none"}`);
    await rejects(() => persistence.syncObservationDeltas(pageWide, account.athleteId, async () => { throw httpError(status, code); }),
      new RegExp(`^shadow-sync-http-${status}$`, "u"));
    assert.equal((await pageWide.readSyncHolds(account.athleteId)).length, 0, `${status} ${code} must not set anything aside`);
    pageWide.close();
  }
  const requestLevel = await make("request-level");
  await rejects(() => persistence.syncObservationDeltas(requestLevel, account.athleteId, async () => { throw httpError(400, "vnext-invalid-envelope"); }),
    /^shadow-sync-http-400$/u);
  assert.equal((await requestLevel.readSyncHolds(account.athleteId)).length, 0, "a failing empty control proves a request-level problem");
  requestLevel.close();

  const systemic = await make("systemic");
  await rejects(() => persistence.syncObservationDeltas(systemic, account.athleteId, async (request) => {
    if (request.upload.length) throw httpError(400, "vnext-invalid-event");
    return real(request);
  }), /^shadow-sync-http-400$/u);
  assert.equal((await systemic.readSyncHolds(account.athleteId)).length, 1, "the same rejection twice stops after one hold");
  systemic.close();

  const cursorAhead = await make("cursor-ahead");
  await rejects(() => persistence.syncObservationDeltas(cursorAhead, account.athleteId, persistence.createAuthenticatedShadowTransport(
    async () => Response.json({ code: "vnext-cursor-ahead", error: "ahead" }, { status: 409 }), `${endpoint}/vnext/shadow/sync`)), /^shadow-sync-cursor-ahead$/u);
  assert.equal((await cursorAhead.readSyncHolds(account.athleteId)).length, 0);
  cursorAhead.close();
});

await scenario("reset-suppressed incoming facts are skipped before anything is set aside; a reset purge removes its hold", async () => {
  const athleteId = contracts.parseStableId("athlete", "dependability-reset-athlete");
  const device = newStore("reset");
  const plan = planFixture(athleteId, "reset", ts0(0));
  const local = recordFor(plan, ts0(0));
  await device.appendSession(plan, local);
  const remote = recordFor(plan, ts0(0), { itemOutcomes: [{ ...local.itemOutcomes[0], participationSeconds: 120 }] });
  const item = async (kind, payload) => ({ kind, id: payload.id, hash: await sha256(payload), payload });
  const reset = await resetFixture(athleteId, ts0(50));
  // The reset purges the local record and its outbox row; the stale remote copy is ignored, not diverted.
  await device.applySyncDelta(athleteId, { schemaVersion: 1, cursor: 3, hasMore: false, resetTombstone: reset,
    changes: [await item("session-plan", plan), await item("session-record", remote)], acknowledged: [], conflicts: [] });
  assert.equal((await device.readSyncHolds(athleteId)).length, 0);
  assert.equal((await device.readProjectionSources(athleteId)).sessionRecords.length, 0);

  const later = planFixture(athleteId, "post-reset", ts0(60));
  const kept = recordFor(later, ts0(60));
  await device.appendSession(later, kept);
  await device.holdSyncItems(athleteId, [{ kind: "session-record", id: kept.id, hash: await sha256(kept), reason: "rejected", detail: "vnext-invalid-record", heldAt: ts0(70) }]);
  assert.equal((await device.readSyncHolds(athleteId)).length, 1);
  await device.applyProgressReset(await resetFixture(athleteId, ts0(90)));
  assert.equal((await device.readSyncHolds(athleteId)).length, 0, "no orphan hold survives the purge");
  device.close();
});

await scenario("hold writes are hash-specific and survive re-queuing the same version", async () => {
  const athleteId = contracts.parseStableId("athlete", "dependability-hash-athlete");
  const device = newStore("hash");
  await device.putAthleteIntent(intentFixture(athleteId, ts0(0)));
  const [queued] = await device.readSyncUpload(athleteId, 1);
  assert.equal(await device.holdSyncItems(athleteId, [{ kind: "athlete-intent", id: athleteId, hash: "0".repeat(64), reason: "conflict", detail: "intent-timestamp-conflict", heldAt: ts0(1) }]), 0);
  assert.equal(await device.holdSyncItems(athleteId, [{ kind: "athlete-intent", id: athleteId, hash: queued.hash, reason: "conflict", detail: "intent-timestamp-conflict", heldAt: ts0(1) }]), 1);
  assert.equal(await device.holdSyncItems(athleteId, [{ kind: "athlete-intent", id: athleteId, hash: queued.hash, reason: "conflict", detail: "intent-timestamp-conflict", heldAt: ts0(2) }]), 0);
  await device.putAthleteIntent(intentFixture(athleteId, ts0(5), pushingGoal));
  assert.equal((await device.readSyncHolds(athleteId)).length, 0, "a new goal edit replaces the set-aside version");
  assert.equal((await device.readSyncUpload(athleteId, 1)).length, 1);
  assert.equal((await device.readSyncUpload(athleteId, 1))[0].hold, undefined, "upload items never carry hold state");
  device.close();
});

await scenario("device-only athletes are listed from the training database", async () => {
  const store = newStore("list");
  const localId = contracts.parseStableId("athlete", `vnext-rc-${crypto.randomUUID()}`);
  const accountId = contracts.parseStableId("athlete", "p25_account-listed");
  const plan = planFixture(localId, "listed", ts0(0));
  await store.putAthleteIntent(intentFixture(localId, ts0(0)));
  await store.appendSession(plan, recordFor(plan, ts0(0)));
  await store.putAthleteIntent(intentFixture(accountId, ts0(1)));
  let listed = await store.listAthletes();
  assert.deepEqual(listed.map(({ athleteId }) => athleteId).sort(), [accountId, localId].sort());
  const local = listed.find(({ athleteId }) => athleteId === localId);
  assert.equal(local.sessionCount, 1);
  assert.equal(local.lastActivityAt, recordFor(plan, ts0(0)).completedAt);
  await store.clearAthlete(accountId);
  listed = await store.listAthletes();
  assert.deepEqual(listed.map(({ athleteId }) => athleteId), [localId], "the device-only athlete survives an account sign-out clear");
  store.close();
});

await scenario("sync requests get a size-scaled deadline; other account requests keep ten seconds", async () => {
  assert.equal(accountRequest.ACCOUNT_REQUEST_TIMEOUT_MS, 10_000);
  assert.equal(accountRequest.syncRequestTimeoutMs(0), 10_000);
  assert.equal(accountRequest.syncRequestTimeoutMs(50_000), 11_000);
  assert.equal(accountRequest.syncRequestTimeoutMs(1_400_000), 38_000);
  assert.equal(accountRequest.syncRequestTimeoutMs(10_000_000), 45_000);
  const source = readFileSync("app/profileStore.ts", "utf8");
  assert.match(source, /apiResponse\("\/vnext\/shadow\/sync", init, profileId, syncRequestTimeoutMs\(bodyBytes\)\)/u);
});

// ---------- Sign-out through the real account boundary (mock account service, offline sync) ----------
const signOutDb = "parallette25-vnext-production1";
const signOutProfileId = "dependability-signout-athlete";
const accountRequests = [];
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(String(url)).pathname;
  accountRequests.push(path);
  if (path === "/auth/login") return Response.json({ profile: { profileId: signOutProfileId, username: "Dependability Athlete" }, token: "synthetic-token", expiresAt: "2099-01-01T00:00:00.000Z" });
  if (path === "/auth/logout") return Response.json({ ok: true });
  if (path === "/vnext/shadow/sync") return Response.json({ error: "Synthetic offline sync" }, { status: 503 });
  throw new Error(`Unexpected synthetic request ${path}`);
};
const compileBoundary = () => {
  const source = readFileSync("app/profileStore.ts", "utf8").replaceAll("import.meta.env.VITE_PROFILE_API_URL", '"https://profiles.example.test"');
  const compiled = ts.transpileModule(source, { fileName: "app/profileStore.ts", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", compiled)(module, module.exports, (name) => {
    if (!name.startsWith("./")) throw new Error(`Unexpected account import ${name}`);
    return load(`app/${name.slice(2)}.ts`);
  });
  return module.exports;
};
const boundary = compileBoundary();
const signOutAthlete = contracts.parseStableId("athlete", signOutProfileId);
const signOutStore = persistence.createVNextShadowStore({ databaseName: signOutDb });

await scenario("sign-out names set-aside and unsynced training, refuses without consent and clears only the exact rows chosen", async () => {
  memory.clear();
  await signOutStore.clearAthlete(signOutAthlete);
  await boundary.signInVNextAccount("Dependability Athlete", "synthetic-password");
  await signOutStore.putAthleteIntent(intentFixture(signOutAthlete, ts0(0)));
  const plan = planFixture(signOutAthlete, "signout", ts0(5));
  const record = recordFor(plan, ts0(5));
  await signOutStore.appendSession(plan, record);
  await signOutStore.holdSyncItems(signOutAthlete, [{ kind: "session-record", id: record.id, hash: await sha256(record), reason: "conflict", detail: "immutable-id-conflict", heldAt: ts0(9) }]);

  const first = await rejects(() => boundary.signOutVNextAccount(signOutProfileId, signOutDb), /^Connect and sync this athlete before signing out/u);
  assert(first instanceof boundary.VNextPendingWorkError);
  assert.match(first.pendingWork.unsyncedFingerprint, /^[a-f0-9]{64}$/u);
  assert(first.pendingWork.descriptions.some((line) => line.startsWith("Workout on") && line.includes("set aside")), first.pendingWork.descriptions.join(" | "));
  assert(first.pendingWork.descriptions.includes("goal and equipment changes not yet synced"));
  assert(boundary.hasVNextAccountSession(signOutProfileId), "a refused sign-out keeps account access");
  assert(!accountRequests.includes("/auth/logout"));

  // New training after the decision needs a fresh decision.
  const later = planFixture(signOutAthlete, "signout-later", ts0(20));
  await signOutStore.appendSession(later, recordFor(later, ts0(20)));
  const second = await rejects(() => boundary.signOutVNextAccount(signOutProfileId, signOutDb, { discardUnsyncedFingerprint: first.pendingWork.unsyncedFingerprint }),
    /^Connect and sync/u);
  assert.notEqual(second.pendingWork.unsyncedFingerprint, first.pendingWork.unsyncedFingerprint);
  assert.equal((await signOutStore.readProjectionSources(signOutAthlete)).sessionRecords.length, 2, "nothing was removed");

  await boundary.signOutVNextAccount(signOutProfileId, signOutDb, {
    discardPendingWorkFingerprint: second.pendingWork.fingerprint || undefined,
    discardUnsyncedFingerprint: second.pendingWork.unsyncedFingerprint,
  });
  assert(!boundary.hasVNextAccountSession(signOutProfileId));
  const cleared = await signOutStore.readProjectionSources(signOutAthlete);
  assert.equal(cleared.sessionRecords.length + cleared.sessionPlans.length, 0);
  assert.equal((await signOutStore.readUnsyncedItems(signOutAthlete)).length, 0);
});

await scenario("the clear itself refuses unsynced rows that differ from the ones chosen", async () => {
  const athleteId = contracts.parseStableId("athlete", "dependability-guard-athlete");
  await signOutStore.putAthleteIntent(intentFixture(athleteId, ts0(0)));
  const chosen = await signOutStore.readUnsyncedItems(athleteId);
  const fingerprint = persistence.unsyncedItemsFingerprint(chosen);
  const plan = planFixture(athleteId, "guard", ts0(5));
  await signOutStore.appendSession(plan, recordFor(plan, ts0(5)));
  await rejects(() => signOutStore.clearAthlete(athleteId, { assessmentDraft: null, outboxFingerprint: fingerprint }), /^New training arrived while signing out/u);
  await rejects(() => signOutStore.clearAthlete(athleteId, { assessmentDraft: null }), /^New training arrived while signing out/u);
  assert.equal((await signOutStore.readProjectionSources(athleteId)).sessionRecords.length, 1);
  await signOutStore.clearAthlete(athleteId, { assessmentDraft: null, outboxFingerprint: persistence.unsyncedItemsFingerprint(await signOutStore.readUnsyncedItems(athleteId)) });
  assert.equal((await signOutStore.readProjectionSources(athleteId)).sessionRecords.length, 0);
});

await scenario("the sign-in screen offers saved device-only training but never an account's leftover data", async () => {
  const { deviceOnlyAthleteChoices } = load("app/vnext/production/deviceOnlyAthletes.ts");
  const choices = deviceOnlyAthleteChoices([
    { athleteId: "vnext-rc-older", sessionCount: 1, lastActivityAt: ts0(0, 9, 1) },
    { athleteId: "vnext-rc-newer", sessionCount: 3, lastActivityAt: ts0(0, 9, 10) },
    { athleteId: "p25_account-leftover", sessionCount: 4, lastActivityAt: ts0(0, 9, 12) },
    { athleteId: "vnext-rc-already-listed", sessionCount: 0 },
  ], new Set(["vnext-rc-already-listed"]));
  assert.deepEqual(choices.map(({ identity }) => identity.athleteId), ["vnext-rc-newer", "vnext-rc-older"]);
  assert(choices.every(({ identity }) => identity.mode === "local"));
  assert.match(choices[0].detail, /^Saved on this device · 3 workouts · last on /u);
  assert.match(choices[1].detail, /· 1 workout ·/u);
  const productionSource = readFileSync("app/vnext/production/VNextProductionApp.tsx", "utf8");
  assert.match(productionSource, /deviceOnlyAthleteChoices\(await shadow\.listAthletes\(\)/u);
});

await scenario("a reset-suppressed save is reported as not saved; a reset that drops an uploaded workout is announced", async () => {
  const status = load("app/vnext/ui/syncStatus.ts");
  assert.equal(status.workoutSaveOutcomeMessage("ignored-older", { retry: false }),
    "Not saved: a training reset on your account covers this workout’s date, so it was not added to History.");
  assert.equal(status.workoutSaveOutcomeMessage("ignored-older", { retry: true, restrictionFollowUp: true }).startsWith("Not saved"), true);
  assert.equal(status.workoutSaveOutcomeMessage("inserted", { retry: false }), "");
  assert.equal(status.workoutSaveOutcomeMessage("inserted", { retry: true }), "Workout saved.");
  assert.equal(status.workoutSaveOutcomeMessage("duplicate", { retry: true }), "Workout already saved. No duplicate was added.");
  assert.match(status.workoutSaveOutcomeMessage("inserted", { retry: false, restrictionFollowUp: true }), /^Workout saved\. Your reported discomfort/u);
  assert.match(status.suppressedWorkoutNotice([{ kind: "session-record", status: "ignored-reset", payload: { completedAt: ts0(0) } }]),
    /^A workout from .+ was removed because a training reset from another device covers it\.$/u);
  assert.equal(status.suppressedWorkoutNotice([{ kind: "session-record", status: "ignored-older", payload: {} }]), undefined);
  assert.equal(status.suppressedWorkoutNotice([{ kind: "evidence-event", status: "ignored-reset", payload: {} }]), undefined);
  const app = readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8");
  assert.equal((app.match(/workoutSaveOutcomeMessage\(recordStatus/gu) ?? []).length, 2, "both the first save and the retry use the honest outcome");
  assert(!/setMessage\(committed\.append\.record\.status === "duplicate"/u.test(app));

  // The underlying store behaviour the message reflects.
  const athleteId = contracts.parseStableId("athlete", "dependability-suppressed-athlete");
  const device = newStore("suppressed");
  await device.applyProgressReset(await resetFixture(athleteId, ts0(30)));
  const plan = planFixture(athleteId, "suppressed", ts0(20));
  const result = await device.appendSession(plan, recordFor(plan, ts0(20)));
  assert.equal(result.record.status, "ignored-older");
  device.close();
});

await scenario("sync status never claims Synced while anything is set aside", async () => {
  const status = load("app/vnext/ui/syncStatus.ts");
  const message = status.trainingSyncMessage({ account: true, online: true, fingerprint: "f", status: { phase: "attention", held: 2, fingerprint: "f", confirmedAt: ts0(0) } });
  assert.equal(message, "Saved on this device · 2 changes couldn't sync. Everything else keeps syncing.");
  assert.equal(status.trainingSyncMessage({ account: true, online: false, status: { phase: "attention", held: 1 } }),
    "Saved on this device · 1 change couldn't sync. Everything else keeps syncing.");
  assert.equal(status.trainingSyncAnnouncement({ account: true, online: true, status: { phase: "attention", held: 1 } }), "Saved on this device. 1 change couldn't sync.");
  assert.equal(status.describeSyncItem({ kind: "athlete-intent", payload: {} }), "Goal and equipment changes");
  assert.equal(status.describeHoldReason({ kind: "athlete-intent", payload: {}, hold: { reason: "conflict", detail: "intent-timestamp-conflict" } }),
    "Another device saved different goals at the same moment.");
  const app = readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8");
  assert.match(app, /holds\.length \? \{ phase: "attention", held: holds\.length \}/u);
  assert.match(app, /reason instanceof ShadowSyncHeldError/u);
});

signOutStore.close();
console.log(`Sync dependability: ${passed} scenarios passed.`);
