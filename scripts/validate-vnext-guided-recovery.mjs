import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
const { createRecoveryStorageGuard, RecoveryStorageConflict } = load("app/vnext/releaseCandidate/recoveryStorage.ts");

// Run the app's actual local recovery reader/writer and command handlers with
// mocked runtime commits; runtime evidence semantics have their own validators.
const path = "app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx";
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statement = (name) => {
  let found;
  const visit = (node) => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === name)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source); assert(found, `Missing app declaration ${name}`); return found.getText(source);
};
const execute = (text, bindings) => {
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings));
};
const memory = new Map();
const localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
const guidedRecoveryKey = (athlete, namespace) => `${namespace}:${athlete}`;
const { readGuidedRecovery, writeGuidedRecovery: guardedWriteGuidedRecovery } = execute(`${statement("readGuidedRecovery")}\n${statement("writeGuidedRecovery")}\nreturn { readGuidedRecovery, writeGuidedRecovery };`, { localStorage, guidedRecoveryKey });
const writeGuidedRecovery = (recovery, namespace) => guardedWriteGuidedRecovery(recovery, createRecoveryStorageGuard(guidedRecoveryKey(recovery.athleteId, namespace), localStorage));
const athleteId = "guided-recovery-athlete", storageNamespace = "synthetic", storageKey = guidedRecoveryKey(athleteId, storageNamespace);
const result = { eventId: "guided-event-exact", observationSessionId: "guided-occasion-exact", occurredAt: "2026-10-19T10:00:00.000Z", recordedAt: "2026-10-19T10:00:00.000Z", protocolId: "exact-protocol", outcome: "clean", measurement: { value: 20, unit: "seconds" }, conditions: { apparatus: "floor" }, quality: { painFree: true, controlled: true } };
const offer = { protocolId: result.protocolId, availability: "available", label: "Exact native check" };
const legacy = (catalogueVersion = 1) => ({ version: 1, athleteId, draft: { athleteId, catalogueVersion, policyVersion: 1, id: "native-draft" }, offer, result });
const progression = () => ({ version: 2, kind: "progression", athleteId, catalogueVersion: 8, offer, result });
const harness = ({ fail = false, pending, snapshot = { assessmentDraft: { athleteId, policyVersion: 2, catalogueVersion: 8 }, assessmentReview: { guidedTests: [{ protocolId: "another-check", availability: "available" }], nextPracticeLabels: ["Practice first"] } } } = {}) => {
  const calls = [], commands = [], assessments = [], offers = [], errors = [], snapshots = [], versions = [], locked = { current: false };
  let failCommit = fail, corrections = [], messages = [];
  const guidedRecoveryStorage = createRecoveryStorageGuard(storageKey, localStorage);
  const runtime = Object.fromEntries(["commitGuidedTest", "commitProgressionCheck"].map((method) => [method, async (input) => {
    calls.push({ method, input }); if (failCommit) throw new Error("Synthetic append failure"); return { snapshot };
  }]));
  const bindings = {
    guidedSubmissionLocked: locked,
    persistGuidedRecovery: (value) => guardedWriteGuidedRecovery(value, guidedRecoveryStorage), guidedRecoveryStorage,
    setCorrectingGuidedEntry: (value) => corrections.push(value),
    setError: (value) => errors.push(value), setGuidedOffer: (value) => offers.push(value),
    runCommand: (operation) => { commands.push(operation().catch((reason) => errors.push(reason.message))); },
    runtime, refreshInput: () => ({ athleteId, asOf: "2026-10-19T12:00:00.000Z" }),
    setSnapshot: (value) => snapshots.push(value), clearGuidedRecovery: () => guidedRecoveryStorage.remove(),
    setProgressionCatalogueVersion: (value) => versions.push(value),
    setAssessment: (value) => assessments.push(value), nextAssessmentStep: (draft, bundle) => ({ id: "native-step", catalogueVersion: bundle.catalogueVersion }),
    bundleFor: (catalogueVersion) => ({ catalogueVersion }), setMessage: (value) => messages.push(value),
  };
  const commit = execute(`${statement("commitExactGuidedRecovery")}\nreturn commitExactGuidedRecovery;`, bindings);
  return { calls, commands, assessments, offers, errors, snapshots, versions, locked, commit, settle: () => Promise.all(commands), succeed: () => { failCommit = false; } };
};
let count = 0;
const scenario = async (label, run) => { memory.clear(); await run(); count++; console.log(`PASS ${label}`); };

await scenario("v1 native guided recovery round-trips unchanged and retains its assessment commit", async () => {
  for (const version of [1, 8]) {
    const pending = legacy(version), bytes = JSON.stringify(pending);
    writeGuidedRecovery(pending, storageNamespace);
    const restored = readGuidedRecovery(athleteId, storageNamespace);
    assert.equal(JSON.stringify(restored), bytes); assert.equal(memory.get(storageKey), bytes);
    const app = harness({ snapshot: { assessmentDraft: pending.draft } });
    app.commit(restored); await app.settle();
    assert.equal(app.calls.length, 1); assert.equal(app.calls[0].method, "commitGuidedTest");
    assert.equal(app.calls[0].input.draft, restored.draft); assert.equal(app.calls[0].input.result, restored.result);
    assert.equal(app.calls[0].input.draft.catalogueVersion, version); assert(!memory.has(storageKey));
  }
});

await scenario("v2 progression recovery survives reload and uses only progression commit", async () => {
  const pending = progression(), bytes = JSON.stringify(pending);
  writeGuidedRecovery(pending, storageNamespace);
  const restored = readGuidedRecovery(athleteId, storageNamespace);
  assert.equal(JSON.stringify(restored), bytes);
  const app = harness(); app.commit(restored); await app.settle();
  assert.equal(app.calls[0].method, "commitProgressionCheck");
  assert.equal(app.calls[0].input.catalogueVersion, 8); assert.equal(app.calls[0].input.result, restored.result);
  assert(!("draft" in app.calls[0].input)); assert.deepEqual(app.assessments, [], "Progression completion must not enter or change setup UI");
  assert.deepEqual(app.offers, [restored.offer, undefined], "Progression save must not automatically open a setup check");
  assert(!memory.has(storageKey));
});

await scenario("failed progression retry preserves every result byte and blocks duplicate submission", async () => {
  const pending = progression(), bytes = JSON.stringify(pending), app = harness({ fail: true });
  app.commit(pending); app.commit(pending); await app.settle();
  assert.equal(app.calls.length, 1); assert.equal(memory.get(storageKey), bytes); assert.equal(app.locked.current, false);
  const restored = readGuidedRecovery(athleteId, storageNamespace);
  app.succeed(); app.commit(restored); await app.settle();
  assert.equal(app.calls.length, 2); assert.equal(JSON.stringify(app.calls[0].input.result), JSON.stringify(app.calls[1].input.result));
  assert.deepEqual(app.calls[1].input.result, result); assert(!memory.has(storageKey)); assert.deepEqual(app.assessments, []);
});

await scenario("native policy-2 setup still returns to its existing review after a saved check", async () => {
  const pending = { ...legacy(8), draft: { ...legacy(8).draft, policyVersion: 2 } }, app = harness();
  app.commit(pending); await app.settle();
  assert.equal(app.calls[0].method, "commitGuidedTest"); assert.equal(app.assessments.length, 1);
  assert.equal(app.assessments[0].draft.policyVersion, 2); assert.equal(app.assessments[0].step.catalogueVersion, 8);
});

await scenario("foreign and malformed guided recovery envelopes fail closed", () => {
  for (const invalid of [{ ...legacy(), athleteId: "other" }, { ...legacy(), draft: { athleteId: "other" } }, { ...progression(), kind: "assessment" }, { ...progression(), catalogueVersion: 0 }, { ...progression(), catalogueVersion: 1.5 }, { ...progression(), result: { ...result, protocolId: "other-protocol" } }, { ...progression(), version: 3 }]) {
    memory.set(storageKey, JSON.stringify(invalid)); assert.equal(readGuidedRecovery(athleteId, storageNamespace), undefined); assert(!memory.has(storageKey));
  }
});

await scenario("new progression submission creates one identity and existing retry ignores replacement form input", () => {
  const calls = []; let createdIds = 0;
  const bindings = { guidedRecovery: undefined, correctingGuidedEntry: false, guidedOffer: offer, progressionCatalogueVersion: 8,
    snapshot: { assessmentDraft: legacy().draft }, athleteId, now: () => result.occurredAt,
    crypto: { randomUUID: () => { createdIds++; return "new-once"; } }, guidedObservationOccasionId: () => result.observationSessionId,
    commitExactGuidedRecovery: (value) => calls.push(value), setError() {}, correctInvalidGuidedAttemptResult() { throw new Error("Unexpected correction"); } };
  const form = { outcome: result.outcome, measurement: result.measurement, conditions: result.conditions, quality: result.quality };
  const submit = execute(`${statement("commitGuidedTest")}\nreturn commitGuidedTest;`, bindings); submit(form);
  const pending = calls[0]; assert.equal(pending.version, 2); assert.equal(pending.kind, "progression"); assert.equal(pending.catalogueVersion, 8); assert(!("draft" in pending));
  assert.equal(pending.result.eventId, "guided-event-new-once"); assert.equal(createdIds, 1);
  const retry = execute(`${statement("commitGuidedTest")}\nreturn commitGuidedTest;`, { ...bindings, guidedRecovery: pending });
  retry({ ...form, measurement: { value: 999, unit: "seconds" } });
  assert.equal(calls[1], pending); assert.equal(createdIds, 1); assert.equal(calls[1].result.measurement.value, 20);
});

await scenario("actual guided runner selects native bundles and closing progression never opens setup", () => {
  let runner;
  const visit = (node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "GuidedTestRunner") runner = node; ts.forEachChild(node, visit); };
  visit(source); assert(runner);
  const expression = (name) => runner.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === name).initializer.expression.getText(source);
  for (const recovery of [legacy(1), legacy(8), progression()]) {
    const assessments = [], bindings = { guidedRecovery: recovery, progressionCatalogueVersion: recovery.version === 2 ? 8 : undefined,
      snapshot: { assessmentDraft: { policyVersion: 2, catalogueVersion: 8 }, assessmentReview: {} }, vNextDefinitionBundle: { catalogueVersion: 8 },
      bundleFor: (version) => ({ catalogueVersion: version }), setGuidedOffer() {}, setProgressionCatalogueVersion() {}, setAssessment: (value) => assessments.push(value), nextAssessmentStep: () => ({}) };
    const bundle = execute(`return ${expression("bundle")};`, bindings);
    assert.equal(bundle.catalogueVersion, recovery.version === 2 ? 8 : recovery.draft.catalogueVersion);
    if (recovery.version === 2) { execute(`return ${expression("onClose")};`, bindings)(); assert.deepEqual(assessments, []); }
  }
});
await scenario("explicit pending-result discard clears only the unchanged local envelope", async () => {
  const pending = progression(); writeGuidedRecovery(pending, storageNamespace);
  const preservedEvidence = structuredClone(result), calls = [], errors = [], commands = [];
  const bindings = { guidedRecovery: pending, busy: false, guidedSubmissionLocked: {current:false},
    athleteId, storageNamespace, localStorage, guidedRecoveryKey,
    runCommand: op => commands.push(op().catch(error => errors.push(error.message))),
    clearGuidedRecovery: () => { localStorage.removeItem(storageKey); calls.push("clear"); },
    setGuidedOffer: value => calls.push(["offer",value]), setProgressionCatalogueVersion() {}, setCorrectingGuidedEntry() {},
    setSnapshot() {}, setMessage() {}, refreshInput: () => ({athleteId}),
    runtime: { refresh: async () => ({sources:{evidenceEvents:[preservedEvidence]}}) } };
  const discard = () => execute(`${statement("discardPendingGuidedResult")}\nreturn discardPendingGuidedResult;`,bindings)();
  // A correction in another view may reuse the event ID. Consent must still
  // protect its changed measured value, not merely compare event identifiers.
  writeGuidedRecovery({...pending,result:{...result,measurement:{value:25,unit:"seconds"}}},storageNamespace);
  discard(); await Promise.all(commands);
  assert.equal(calls.length,0); assert.equal(errors.length,1); assert(memory.has(storageKey));
  writeGuidedRecovery(pending,storageNamespace); discard(); await Promise.all(commands);
  assert.equal(calls.filter(call=>call==="clear").length,1); assert(!memory.has(storageKey));
  assert.deepEqual(preservedEvidence,result,"A local discard cannot mutate saved evidence");
});

await scenario("failed pending-result removal keeps recovery and the runner available", async () => {
  const pending=progression();writeGuidedRecovery(pending,storageNamespace);
  const changes=[],errors=[],commands=[];
  const discard=execute(`${statement("discardPendingGuidedResult")}\nreturn discardPendingGuidedResult;`, {
    guidedRecovery:pending,busy:false,guidedSubmissionLocked:{current:false},athleteId,storageNamespace,localStorage,guidedRecoveryKey,
    runCommand:op=>commands.push(op().catch(error=>errors.push(error.message))),
    clearGuidedRecovery:()=>{throw new Error("Storage unavailable");},
    setGuidedOffer:value=>changes.push(value),setProgressionCatalogueVersion(){},setCorrectingGuidedEntry(){},setSnapshot(){},setMessage(){},
    runtime:{refresh:async()=>{throw new Error("Unexpected refresh");}},refreshInput:()=>({athleteId}) });
  discard();await Promise.all(commands);
  assert.deepEqual(errors,["Storage unavailable"]);assert.deepEqual(changes,[]);assert.equal(memory.get(storageKey),JSON.stringify(pending));
});

await scenario("Today retains unfinished setup controls beside a useful progression check", () => {
  let experience;
  const visit = (node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "VNextExperience") experience = node; ts.forEachChild(node, visit); };
  visit(source); assert(experience);
  const expression = experience.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === "setupNotice").initializer.expression.getText(source);
  const code = ts.transpileModule(`return (${expression});`, { fileName: "notice.tsx", compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "jsx", jsxFragmentFactory: "Fragment" } }).outputText;
  const resumed = [], restarted = [], checks = [], reassessment = { kind: "reassessment", id: "resume-existing" };
  const snapshot = { assessmentDraft: { status: "in-progress", policyVersion: 2 }, assessmentReview: { checksComplete: false },
    presentations: { assessment: { actions: [reassessment] } },
    progressionCheck: { offer: { label: "Support check", availability: "available" }, target: "20 seconds", why: "Confirm practice", when: "When recovered", confirmation: "Two separate days" } };
  const render = (updates = {}) => {
    const bindings = { jsx: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }), Fragment: "fragment",
      snapshot, workflowLocked: false, busy: false, startAssessment: (action) => resumed.push(action),
      setRestartForRestrictions: (value) => restarted.push(["restriction", value]), setRestartSetupOpen: (value) => restarted.push(["open", value]),
      openProgressionCheck: () => checks.push("open"), ...updates };
    const tree = new Function(...Object.keys(bindings), code)(...Object.values(bindings));
    const nodes = [];
    const collect = (node) => { if (node && typeof node === "object") { nodes.push(node); node.children.forEach(collect); } };
    collect(tree); return nodes;
  };
  const nodes = render(), button = (label) => nodes.find((node) => node.type === "button" && node.children.includes(label));
  assert(nodes.some((node) => node.props["aria-label"] === "Saved setup"));
  assert(nodes.some((node) => node.props["aria-label"] === "Your next progress check"));
  button("Resume setup").props.onClick(); button("Start over").props.onClick(); button("View check").props.onClick();
  assert.deepEqual(resumed, [reassessment]); assert.deepEqual(restarted, [["restriction", false], ["open", true]]); assert.deepEqual(checks, ["open"]);
  assert.equal(render({ workflowLocked: true }).length, 0);
  assert(render({ busy: true }).filter((node) => node.type === "button").every((node) => node.props.disabled));
  assert(render({ snapshot: { ...snapshot, progressionCheck: undefined } }).some((node) => node.children.includes("Resume setup")));
  assert(!render({ snapshot: { ...snapshot, assessmentDraft: { status: "committed", policyVersion: 2 } } }).some((node) => node.children.includes("Resume setup")));
  assert(render({ snapshot: { ...snapshot, assessmentDraft: { status: "committed", policyVersion: 2 }, progressionCheck: undefined } }).some((node) => node.children.includes("Continue checks")));
});

await scenario("stale guided commit cannot replace another view's pending correction", async () => {
  const pending = progression(); writeGuidedRecovery(pending, storageNamespace); const app = harness();
  const newer = { ...pending, result: { ...result, measurement: { value: 30, unit: "seconds" } } };
  writeGuidedRecovery(newer, storageNamespace); app.commit(pending); await app.settle();
  assert.equal(app.calls.length, 0); assert.match(app.errors[0], /another open view/u);
  assert.equal(memory.get(storageKey), JSON.stringify(newer));
});

await scenario("closing a check without an attempt appends no observation and never enters setup", async () => {
  const changes = [], commands = [], evidence = [{ eventId: "previously-saved", value: 20 }];
  const snapshot = { sources: { evidenceEvents: evidence }, assessmentDraft: { id: "untouched-setup" } };
  const close = execute(`${statement("finishGuidedWithoutAttempt")}\nreturn finishGuidedWithoutAttempt;`, {
    busy: false, guidedSubmissionLocked: { current: false }, runCommand: (op) => commands.push(op()),
    clearGuidedRecovery: () => changes.push("clear-local"), setGuidedOffer: (value) => changes.push(["offer", value]),
    setProgressionCatalogueVersion: (value) => changes.push(["version", value]), setCorrectingGuidedEntry() {}, setMessage() {},
    setSnapshot: (value) => changes.push(["snapshot", value]), refreshInput: () => ({ athleteId }),
    runtime: { refresh: async () => snapshot, commitGuidedTest: () => { throw new Error("No attempt must not become evidence"); }, commitProgressionCheck: () => { throw new Error("No attempt must not become evidence"); } },
  });
  close(); await Promise.all(commands);
  assert.equal(changes[0], "clear-local"); assert.equal(changes.at(-1)[1], snapshot); assert.deepEqual(snapshot.sources.evidenceEvents, evidence);
  let runner; const visit = (node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "GuidedTestRunner") runner = node; ts.forEachChild(node, visit); }; visit(source);
  assert.equal(runner.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === "onNoAttempt").initializer.expression.getText(source), "finishGuidedWithoutAttempt");
});

console.log(`Guided recovery: ${count} actual reader/handler scenarios passed.`);
