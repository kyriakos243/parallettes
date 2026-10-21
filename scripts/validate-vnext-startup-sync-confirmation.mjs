import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
createRequire(import.meta.url)("fake-indexeddb/auto");
const { fetchAccountResponse } = load("app/accountRequest.ts");
const { createBackgroundSync, serialSyncStore } = load("app/vnext/releaseCandidate/backgroundSync.ts");
const { startupRecoveryMessage } = load("app/vnext/releaseCandidate/startupRecovery.ts");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const { syncObservationDeltas } = load("app/vnext/persistence/sync.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { trainingQualityCatalogue: native } = load("app/vnext/production/trainingQuality.ts");
const { generateUsefulDoseSessionPlan, generateUsefulDoseCustomPlan } = load("app/vnext/planning/feedbackDose.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId, createAssessmentDraft, createRestrictionReport } = load("app/vnext/assessment/index.ts");
const catalogue = { ...native, generateSession: generateUsefulDoseSessionPlan, generateCustomSession: generateUsefulDoseCustomPlan };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };

let signal;
await assert.rejects(fetchAccountResponse("https://synthetic.invalid", {}, { timeoutMs: 5,
  fetcher: async (_, init) => { signal = init.signal; return new Promise(() => {}); } }), /Network unavailable/);
assert(signal.aborted);
await assert.rejects(fetchAccountResponse("https://synthetic.invalid", {}, { timeoutMs: 5,
  fetcher: async () => new Response(new ReadableStream({ start() {} })) }), /Network unavailable/);
const denied = await fetchAccountResponse("https://synthetic.invalid", {}, {
  fetcher: async () => Response.json({ error: "denied" }, { status: 401 }) });
assert.equal(denied.status, 401); assert.deepEqual(await denied.json(), { error: "denied" });
pass("connection and response-body stalls are bounded; abort and HTTP authentication status are preserved");

const gate = deferred(); let runs = 0, overlap = 0, maximumOverlap = 0;
const coalesced = createBackgroundSync(async () => {
  runs++; maximumOverlap = Math.max(maximumOverlap, ++overlap);
  if (runs === 1) await gate.promise;
  overlap--;
});
const first = coalesced.request();
for (let index = 0; index < 50; index++) assert.equal(coalesced.request(), first);
gate.resolve(); await first;
assert.equal(runs, 2); assert.equal(maximumOverlap, 1);
coalesced.dispose(); await coalesced.request(); assert.equal(runs, 2);
pass("repeated focus/source requests coalesce into one exchange and one follow-up; disposal stops retries");

const athleteId = "responsive-sync-athlete";
const base = createVNextShadowStore({ databaseName: `responsive-sync-${Date.now()}` });
const intent = { schemaVersion: 1, athleteId, updatedAt: "2026-10-17T09:00:00.000Z",
  goals: [{ graphId: "handstand-balance", priority: "primary" }, { graphId: "parallette-pushing", priority: "secondary" }],
  equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
await base.putAthleteIntent(intent);
let queue = Promise.resolve();
const serial = operation => { const result = queue.catch(() => {}).then(operation); queue = result.then(() => {}, () => {}); return result; };
const entered = deferred(), response = deferred(); let exchanges = 0;
const synced = syncObservationDeltas(serialSyncStore(base, serial), athleteId, async request => {
  if (++exchanges === 1) { entered.resolve(); await response.promise; }
  return { schemaVersion: 1, cursor: exchanges, hasMore: false, changes: [], conflicts: [],
    acknowledged: request.upload.map(item => ({ kind: item.kind, id: item.id, status: "inserted" })) };
});
await entered.promise;
const newer = { ...intent, updatedAt: "2026-10-18T09:00:00.000Z", defaultSessionDemand: "technique" };
await serial(() => base.putAthleteIntent(newer));
assert.equal((await base.readProjectionSources(athleteId)).intent.defaultSessionDemand, "technique");
response.resolve(); await synced;
assert.equal(exchanges, 2, "The old hash must not acknowledge a newer local edit");
assert.equal((await base.readSyncUpload(athleteId, 20)).length, 0);
assert.equal((await base.readProjectionSources(athleteId)).intent.defaultSessionDemand, "technique");
pass("local edits finish while network waits; serialized apply/ack retain the newest edit and exact outbox hashes");

// Exercise the actual production preparation without mounting React or contacting an account.
const path = "app/vnext/production/VNextProductionApp.tsx";
const source = readFileSync(path, "utf8");
const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const preparationSource = tree.statements.filter(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => ["hasLocalAuthority", "prepareProductionAthlete"].includes(declaration.name.getText(tree))))
  .map(statement => statement.getText(tree)).join("\n");
let remoteCalls = 0, migrationCalls = 0;
let pendingHandoff = false;
const boundary = { readLegacyProfileForVNextMigration: async (_, __, options) => {
  if (!pendingHandoff) { assert.equal(options.localOnly, true); return undefined; }
  return { provenance: "device-local-pending-vnext-handoff", profile: {} };
}, syncVNextShadowObservations: async () => { remoteCalls++; throw new Error("shadow-sync-update-required"); }, isTransientVNextSyncError: () => false };
const compiled = ts.transpileModule(preparationSource + "\nmodule.exports = { prepareProductionAthlete };", {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("module", "exports", "require", compiled)(module, module.exports, () => boundary);
const context = { identity: { mode: "account", athleteId }, store: base,
  runtime: { prepareCopiedLegacyConversion: async () => { migrationCalls++; } } };
await module.exports.prepareProductionAthlete(context);
assert.equal(remoteCalls, 0); assert.equal(migrationCalls, 0);
pendingHandoff = true;
await assert.rejects(module.exports.prepareProductionAthlete(context), /shadow-sync-update-required/);
assert.equal(remoteCalls, 1);
assert.match(startupRecoveryMessage(new Error("shadow-sync-update-required")).title, /Update/);
assert.doesNotMatch(startupRecoveryMessage(new Error("sensitive internal error")).message, /sensitive/);
pass("native training opens without network; pending legacy handoff still reconciles remotely; startup errors are actionable and plain");

const bundle = catalogue.bundle;
const protocol = bundle.benchmarkProtocols.find(item => item.id === "parallette-pushing-knee-push-up");
const at = "2026-10-21T09:00:00.000Z";
const result = (id, occurredAt) => ({ eventId: id, observationSessionId: guidedObservationOccasionId(athleteId, occurredAt),
  protocolId: protocol.id, occurredAt, recordedAt: occurredAt, outcome: "clean",
  qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true, measurement: { value: protocol.metric.minimum, unit: "repetitions" } });
await base.appendEvidenceEvent(createGuidedProtocolEvidence(athleteId, bundle, result("first-pushing-confirmation", "2026-10-17T09:00:00.000Z")));
const runtime = createVNextReleaseCandidateRuntime({ store: base, catalogue, clock: () => at });
let snapshot = await runtime.refresh({ athleteId, asOf: at });
assert.equal(await base.readAssessmentDraft(athleteId), null);
let action = snapshot.presentations.assessment.skillActions.find(item => item.protocolIds.includes(protocol.id));
assert.equal(action.kind, "guided-test"); assert.equal(action.availability, "available");
assert.match(action.label, /Complete confirmation/);
assert(!snapshot.presentations.assessment.actions.some(item => item.protocolIds.includes(protocol.id)), "No additional global checklist");
const intentBefore = canonicalJson(snapshot.intent);
const countBefore = snapshot.sources.evidenceEvents.length;
const opened = await runtime.startProgressionCheck({ athleteId, protocolId: protocol.id, asOf: at });
assert.equal(opened.check.offer.protocolId, protocol.id);
assert.equal(opened.snapshot.sources.evidenceEvents.length, countBefore);
const paused = createAssessmentDraft({ id: "unrelated-paused-setup", athleteId, bundle, createdAt: at });
await base.saveAssessmentDraft(paused);
await runtime.startProgressionCheck({ athleteId, protocolId: protocol.id, asOf: at });
assert.equal(canonicalJson(await base.readAssessmentDraft(athleteId)), canonicalJson(paused));
const input = { athleteId, asOf: at, catalogueVersion: bundle.catalogueVersion, result: result("second-pushing-confirmation", at) };
const committed = await runtime.commitProgressionCheck(input);
await runtime.commitProgressionCheck(input);
snapshot = await runtime.refresh({ athleteId, asOf: at });
assert.equal(snapshot.sources.evidenceEvents.length, countBefore + 1);
assert.equal(canonicalJson(snapshot.intent), intentBefore);
assert.equal(snapshot.sources.sessionRecords.length, 0);
assert.equal(snapshot.state.nodeStates.find(item => item.milestone.nodeId === "knee-push-up").lifecycle, "established");
assert.equal(canonicalJson(await base.readAssessmentDraft(athleteId)), canonicalJson(paused));
await assert.rejects(runtime.startProgressionCheck({ athleteId, protocolId: "parallette-pushing-tempo-push-up", asOf: at }), /no longer|another day|earlier|recovered/i);
pass("family confirmation opens without setup, preserves an unrelated draft/goals, and saves one exact result with genuine separate-occasion confirmation");

const report = createRestrictionReport({ eventId: "direct-check-restriction", athleteId, catalogueVersion: bundle.catalogueVersion,
  occurredAt: at, recordedAt: at, demandDomains: ["horizontal-bent-arm-push"], severity: "block", bodyRegions: ["upper body"], notes: "Synthetic restriction" });
await base.appendEvidenceEvent(report);
await assert.rejects(runtime.startProgressionCheck({ athleteId, protocolId: protocol.id, asOf: at }), /restriction|no longer|earlier/i);
const original = canonicalJson(committed.event);
assert.equal(canonicalJson((await runtime.commitProgressionCheck(input)).event), original, "Already-saved exact retry survives later restriction");
pass("current restrictions block a new direct attempt; an immutable already-saved retry retains its original meaning");
await base.clearAthlete(athleteId);
console.log(`Startup/sync/direct confirmation: ${checks} focused groups passed.`);
