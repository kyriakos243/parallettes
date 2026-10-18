import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
const { buildSessionHistory, historyStatus } = load("app/vnext/ui/sessionHistory.ts");
const { trainingSyncMessage, confirmedSyncFingerprint } = load("app/vnext/ui/syncStatus.ts");
const { representativeSessionPlan: plan, representativeSessionRecord: record, representativeDefinitionBundle: bundle } = load("app/vnext/fixtures.ts");
const sources = { sessionPlans: [plan], sessionRecords: [record] };
const before = JSON.stringify({ sources, bundle });
const build = (records = [record], plans = [plan], bundles = [bundle]) => buildSessionHistory({ sessionPlans: plans, sessionRecords: records }, bundles);
const native = build()[0];
assert.equal(native.participationSeconds, 540);
assert.equal(native.durationLabel, "9 min recorded activity");
assert.equal(native.plannedDuration, "10 min planned, including rest");
assert.match(native.durationNote, /excludes rest and pauses/);
assert.match(native.movements[0].plannedPrescription, /sets/);
assert.equal(native.movements[1].performedName, bundle.exercises.find(e => e.id === record.itemOutcomes[1].performedExerciseId).name);
assert.notEqual(native.movements[1].performedName, native.movements[1].plannedName);
assert.match(native.movements[1].feedback.join(" "), /hard/);
assert.equal(native.movements[0].performedNote, "Actual variation not recorded.");
assert.equal(build([{ ...record, startedAt: "2020-01-01T00:00:00Z" }])[0].durationLabel, native.durationLabel, "Wall time must not become activity time");

const correction = { ...record, id: "replacement-record", supersedesRecordId: record.id };
const final = { ...correction, id: "final-record", supersedesRecordId: correction.id };
assert.deepEqual(build([record, correction, final]).map(s => s.id), [final.id]);
const many = Array.from({ length: 30 }, (_, i) => ({ ...record, id: `history-${String(i).padStart(2, "0")}`, completedAt: new Date(Date.parse(record.completedAt) + i * 86400000).toISOString() }));
const all = build(many);
assert.equal(all.length, 30, "Older records must stay available");
assert.equal(all[0].id, "history-29");
assert.equal(all.at(-1).id, "history-00");
assert.equal(build([{ ...record, itemOutcomes: record.itemOutcomes.map(item => ({ ...item, status: "skipped", participationSeconds: 0 })) }])[0].movements[0].performed, false);

const legacySource = { kind: "legacy-v1.2-sparse", sourceVersion: "1.2", sourceSessionId: "old-session", timingPrecision: "session-total-only", prescriptionPrecision: "catalogue-default-reconstruction", sourceTotalSeconds: 1500 };
const sparse = { ...record, legacySource, itemOutcomes: record.itemOutcomes.map(item => ({ ...item, participationSeconds: 0, participationBasis: "legacy-unknown" })) };
const imported = build([sparse], [{ ...plan, legacySource }])[0];
assert.equal(imported.durationLabel, "25 min recorded session duration");
assert.equal(imported.plannedDuration, undefined);
assert.ok(imported.movements.every(item => item.outcome === "Participation recorded"));
assert.equal(historyStatus("modified"), "Modified workout");
assert.ok(imported.movements.every(item => item.plannedPrescription === undefined && item.performedName === undefined && item.activity === "Activity time not recorded"));
assert.equal(build([{ ...sparse, legacySource: { ...legacySource, sourceTotalSeconds: undefined } }])[0].durationLabel, "Duration not recorded");
assert.equal(build([record], [plan], [])[0].movements[0].plannedPrescription, undefined);
const newer = { ...bundle, catalogueVersion: 999, exercises: bundle.exercises.map(e => ({ ...e, name: "WRONG NEW DEFINITION" })) };
assert.deepEqual(build([record], [plan], [newer, bundle]), [native], "Historical rows must use their native catalogue");
const symptom = build([{ ...record, itemOutcomes: [{ ...record.itemOutcomes[0], review: { outcome: "partial", symptomOrInstability: true }, modificationReason: "Stopped because of discomfort" }] }])[0];
assert.match(symptom.movements[0].feedback.join(" "), /Discomfort/);
assert.equal(symptom.movements[1].outcome, "No outcome recorded");
assert.equal(JSON.stringify({ sources, bundle }), before, "History must be read only");

// Check every retained native catalogue resolves its own definition provenance.
const { combinedProgressionCatalogue } = load("app/vnext/production/combinedProgressionRelease.ts");
for (const version of combinedProgressionCatalogue.history) {
  const e = version.exercises[0];
  const item = { ...plan.items[0], exerciseId: e.id, exerciseDefinitionVersion: e.definitionVersion, prescriptionVariantId: e.prescriptionVariants[0].id };
  const oldPlan = { ...plan, catalogueVersion: version.catalogueVersion, items: [item] };
  assert.equal(build([record], [oldPlan], combinedProgressionCatalogue.history)[0].movements[0].plannedName, e.name);
}

const message = (status, extra = {}) => trainingSyncMessage({ account: true, online: true, fingerprint: "new", status, ...extra });
assert.match(message({ phase: "idle" }), /Waiting/);
assert.match(message({ phase: "syncing" }), /Syncing/);
assert.match(message({ phase: "error", fingerprint: "new" }), /needs attention/);
assert.match(message({ phase: "synced", fingerprint: "old", confirmedAt: record.completedAt }), /Waiting/);
assert.match(message({ phase: "synced", fingerprint: "new", confirmedAt: record.completedAt }), /^Synced/);
assert.match(message({ phase: "synced", fingerprint: "new", confirmedAt: record.completedAt }, { online: false }), /Offline/);
assert.match(message({ phase: "synced" }, { account: false }), /Set up an account/);
assert.equal(await confirmedSyncFingerprint({ fingerprint: "a", readFingerprint: async () => "a", hasPending: async () => false }), "a");
assert.equal(await confirmedSyncFingerprint({ fingerprint: "a", readFingerprint: async () => "b", hasPending: async () => false }), undefined);
assert.equal(await confirmedSyncFingerprint({ fingerprint: "a", readFingerprint: async () => "a", hasPending: async () => true }), undefined);
let reads = 0;
assert.equal(await confirmedSyncFingerprint({ fingerprint: "a", readFingerprint: async () => "a", hasPending: async () => ++reads === 2 }), undefined, "A new outbox item during refresh cannot claim sync success");

// Run the real History component with a small hook host to exercise pagination.
let state = [], cursor = 0;
const hooks = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; }, useRef: current => ({ current }), useEffect: () => {} };
const jsx = (type, props) => ({ type, props: props ?? {} });
const mod = { exports: {} };
const compiled = ts.transpileModule(readFileSync("app/vnext/ui/HistoryPanels.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function("module", "exports", "require", compiled)(mod, mod.exports, name => name === "react" ? hooks : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : load("app/vnext/ui/sessionHistory.ts"));
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
const render = () => { cursor = 0; return elements(mod.exports.HistoryView({ sessions: all })); };
let tree = render();
assert.equal(tree.filter(e => e.type === "article").length, 12);
tree.find(e => e.type === "button").props.onClick(); tree = render();
assert.equal(tree.filter(e => e.type === "article").length, 24);
tree.find(e => e.type === "button").props.onClick(); tree = render();
assert.equal(tree.filter(e => e.type === "article").length, 30);
assert.ok(!tree.some(e => e.type === "button"));
assert.equal(historyStatus("partial"), "Partly completed");
console.log("History/summary/sync checks passed: native v1–v8, correction chains, 30-row paging, swapped/partial/skipped work, sparse imports, immutable inputs, and sync confirmation/invalidation.");
