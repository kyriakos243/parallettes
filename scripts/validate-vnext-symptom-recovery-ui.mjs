import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// Run the actual form, notice and root handlers with isolated hooks. This checks
// interaction semantics and event identity; it is not a visual/iOS assertion.
const evidence = load("app/vnext/assessment/evidence.ts");
const contracts = load("app/vnext/contracts.ts");
const { validateAthleteEvidenceEvent } = load("app/vnext/validation.ts");
let host;
const sameDeps = (left, right) => left && right && left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]));
const hooks = {
  useState(initial) {
    const owner = host, index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [owner.slots[index].value, (value) => {
      const next = typeof value === "function" ? value(owner.slots[index].value) : value;
      if (!Object.is(next, owner.slots[index].value)) { owner.slots[index].value = next; owner.dirty = true; }
    }];
  },
  useRef(initial) { return host.slots[host.cursor++] ??= { current: initial }; },
  useId() { return `symptom-test-${host.cursor++}`; },
  useMemo(factory, deps) {
    const index = host.cursor++, previous = host.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) host.slots[index] = { deps, value: factory() };
    return host.slots[index].value;
  },
  useEffect(effect, deps) {
    const owner = host, index = owner.cursor++, previous = owner.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) owner.effects.push(() => {
      previous?.cleanup?.(); owner.slots[index] = { deps, cleanup: effect() };
    });
  },
};
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const compile = (path, extra = "") => {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(path, "utf8") + extra, {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("module", "exports", "require", output)(module, module.exports, (name) => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "../assessment/evidence") return evidence;
    if (name === "../contracts") return contracts;
    if (name === "./RestrictionReportForm") return compile("app/vnext/releaseCandidate/RestrictionReportForm.tsx");
    if (name === "../media/VNextMotionGuide") return { VNextMotionGuide: "OwnedMotionGuide" };
    if (name === "./SkillRoadmap") return { SkillRoadmap: "SkillRoadmap" };
    if (name === "./HistoryPanels") return { HistoryView: "HistoryView", WorkoutSavedSummary: "WorkoutSavedSummary" };
    if (name === "./sectionNavigation") return { useSectionNavigation: () => ({ section: "today", changeSection() {}, hasVisited: () => true }) };
    if (name.endsWith(".css")) return {};
    throw new Error(`Unexpected symptom UI import ${name}`);
  });
  return module.exports;
};
const { RestrictionRecoveryForm } = compile("app/vnext/releaseCandidate/RestrictionRecoveryForm.tsx");
const { RestrictionNotice } = compile("app/vnext/ui/VNextExperience.tsx", "\nexport { RestrictionNotice };\n");
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node && typeof node === "object" ? [node, ...elements(node.props?.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object"
  ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
const createHost = (Component, props) => {
  const owner = { slots: [], cursor: 0, effects: [], dirty: true, props };
  owner.flush = () => {
    host = owner;
    let renders = 0;
    do {
      assert(++renders < 30, "Hooks settle");
      owner.cursor = 0; owner.effects = []; owner.dirty = false;
      owner.tree = Component(owner.props);
      for (const effect of owner.effects) effect();
    } while (owner.dirty);
  };
  owner.drain = async () => { await Promise.resolve(); await Promise.resolve(); owner.flush(); };
  owner.button = (label) => elements(owner.tree).find((item) => item.type === "button" && text(item) === label);
  owner.click = (label, flush = true) => {
    const button = owner.button(label); assert(button, `Missing button ${label}`); assert(!button.props.disabled, `Disabled ${label}`);
    button.props.onClick(); if (flush) owner.flush();
  };
  owner.choice = (label) => {
    const field = elements(owner.tree).find((item) => item.type === "label" && text(item) === label);
    assert(field, `Missing choice ${label}`);
    elements(field).find((item) => item.type === "input").props.onChange(); owner.flush();
  };
  owner.flush();
  return owner;
};
const pendingSaves = () => {
  const calls = [];
  return { calls, save: (report, clearance) => new Promise((resolve, reject) => calls.push({ report, clearance, resolve, reject })) };
};
const source = Object.freeze({ kind: "session-item", sessionRecordId: "symptom-original-record", planItemId: "symptom-original-item" });
const context = { source, demandDomains: ["hand-wrist-bearing", "horizontal-bent-arm-push"] };
const base = { athleteId: "symptom-ui-athlete", catalogueVersion: 8, context, onClose() {} };
const saveLabel = "Save comfort update";
let checks = 0;
const check = async (label, callback) => { await callback(); checks++; console.log(`PASS ${label}`); };

await check("clarification needs one explicit comfort answer, with no typing and scoped movement defaults", () => {
  let saves = 0;
  const app = createHost(RestrictionRecoveryForm, { ...base, onSave: async () => { saves++; } });
  assert.equal(elements(app.tree).filter((item) => item.type === "input" && !["checkbox", "radio"].includes(item.props.type)).length, 0);
  assert.equal(elements(app.tree).filter((item) => item.type === "textarea").length, 0);
  assert.equal(elements(app.tree).filter((item) => item.type === "input" && item.props.type === "checkbox" && item.props.checked).length, 2);
  assert(app.button(saveLabel).props.disabled);
  app.button(saveLabel).props.onClick(); assert.equal(saves, 0);
  app.choice("Still affected — keep them paused");
  assert.equal(app.button(saveLabel).props.disabled, false);
  app.choice("Weight on hands / wrists"); app.choice("Push-ups / horizontal pushing");
  assert(app.button(saveLabel).props.disabled, "Removing every affected movement cannot emit an empty restriction");
});

await check("changed scope and optional area produce a clarification while retaining the original source", async () => {
  const pending = pendingSaves(), original = JSON.stringify(context);
  const app = createHost(RestrictionRecoveryForm, { ...base, onSave: pending.save });
  app.choice("Push-ups / horizontal pushing");
  app.choice("Straight-arm leaning");
  elements(app.tree).find((item) => item.type === "select").props.onChange({ target: { value: "Shoulder" } });
  app.flush(); app.choice("Still affected — keep them paused"); app.click(saveLabel);
  assert.equal(pending.calls.length, 1);
  const { report, clearance } = pending.calls[0];
  assert(validateAthleteEvidenceEvent(report).valid);
  assert.deepEqual(report.demandDomains, ["forward-straight-arm-upper-limb", "hand-wrist-bearing"]);
  assert.deepEqual(report.bodyRegions, ["Shoulder"]);
  assert.deepEqual(report.symptomSource, source); assert.equal(report.severity, "block"); assert.equal(clearance, undefined);
  assert.equal(JSON.stringify(context), original);
  assert(!("measurement" in report) && !("participationSeconds" in report) && !("itemOutcomes" in report));
  pending.calls[0].resolve(); await app.drain();
});

await check("comfortable answer creates separate clearance; failed partial save and rapid retry keep exact identities", async () => {
  const pending = pendingSaves();
  const app = createHost(RestrictionRecoveryForm, { ...base, onSave: pending.save });
  app.choice("Comfortable again");
  assert(text(app.tree).includes("Demanding work still needs fresh successful checks."));
  app.click(saveLabel, false); app.click(saveLabel, false); app.flush();
  assert.equal(pending.calls.length, 1);
  const prepared = pending.calls[0], original = JSON.stringify([prepared.report, prepared.clearance]);
  assert(prepared.clearance && validateAthleteEvidenceEvent(prepared.clearance).valid);
  assert.equal(prepared.clearance.restrictionEventId, prepared.report.id);
  assert.notEqual(prepared.report.id, prepared.clearance.id);
  const durable = new Map([[prepared.report.id, prepared.report]]);
  assert(app.button("Saving…").props.disabled);
  assert(elements(app.tree).find((item) => item.type === "fieldset").props.disabled);
  assert.equal(app.button("Cancel"), undefined);
  prepared.reject(new Error("Comfort save interrupted")); await app.drain();
  assert(elements(app.tree).some((item) => item.props.role === "alert" && text(item) === "Comfort save interrupted"));
  app.click("Retry saving update", false); app.click("Retry saving update", false); app.flush();
  assert.equal(pending.calls.length, 2);
  assert.equal(pending.calls[1].report, prepared.report); assert.equal(pending.calls[1].clearance, prepared.clearance);
  assert.equal(JSON.stringify([pending.calls[1].report, pending.calls[1].clearance]), original);
  for (const item of [pending.calls[1].report, pending.calls[1].clearance]) durable.set(item.id, item);
  assert.equal(durable.size, 2, "An already-appended clarification plus retried clearance are two distinct facts, not duplicates");
  pending.calls[1].resolve(); await app.drain();
});

await check("an explicit existing restriction is reused immutably for both comfort choices", async () => {
  const report = evidence.createRestrictionReport({ eventId: "original-explicit-restriction", athleteId: base.athleteId,
    catalogueVersion: 8, occurredAt: "2026-10-20T09:00:00.000Z", recordedAt: "2026-10-20T09:00:00.000Z",
    severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["left wrist"] });
  const bytes = JSON.stringify(report);
  for (const label of ["Still affected — keep them paused", "Comfortable again"]) {
    const pending = pendingSaves();
    const app = createHost(RestrictionRecoveryForm, { ...base, context: {
      source: { kind: "evidence-event", eventId: report.id }, demandDomains: report.demandDomains, report,
    }, onSave: pending.save });
    assert.equal(elements(app.tree).filter((item) => item.type === "input" && item.props.type === "checkbox").length, 0);
    app.choice(label); app.click(saveLabel);
    assert.equal(pending.calls[0].report, report); assert.equal(JSON.stringify(report), bytes);
    assert.equal(Boolean(pending.calls[0].clearance), label === "Comfortable again");
    pending.calls[0].resolve(); await app.drain();
  }
});

await check("cancel before submission emits no report or clearance", () => {
  let saves = 0, closes = 0;
  const app = createHost(RestrictionRecoveryForm, { ...base, onSave: async () => { saves++; }, onClose: () => { closes++; } });
  app.choice("Comfortable again"); app.click("Cancel");
  assert.equal(closes, 1); assert.equal(saves, 0);
});

const appPath = "app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx";
const appSource = ts.createSourceFile(appPath, readFileSync(appPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const findNode = (predicate) => {
  let found;
  const visit = (node) => { if (predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(appSource); assert(found, "Expected real root handler"); return found;
};
const evaluate = (expression, bindings) => {
  const output = ts.transpileModule(`return (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), output)(...Object.values(bindings));
};
class FocusTarget {
  isConnected = true;
  hidden = false;
  disabled = false;
  focused = 0;
  closest() { return this.hidden ? this : null; }
  matches() { return this.disabled; }
  focus() { this.focused++; }
}
await check("each notice sends its exact source; root opens clarification or existing comfort and routes rechecks", () => {
  const keys = [], opened = [];
  let rechecks = 0;
  const report = evidence.createRestrictionReport({ eventId: "wiring-explicit", athleteId: base.athleteId, catalogueVersion: 8,
    occurredAt: "2026-10-20T09:00:00.000Z", recordedAt: "2026-10-20T09:00:00.000Z",
    severity: "block", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["wrist"] });
  const items = [
    { sourceKey: "native-symptom", source, action: "clarify", demandDomains: context.demandDomains },
    { sourceKey: "explicit-report", source: { kind: "evidence-event", eventId: report.id }, action: "comfort", demandDomains: report.demandDomains },
    { sourceKey: "ready-for-check", source, action: "recheck", demandDomains: context.demandDomains },
  ];
  const notice = createHost(RestrictionNotice, { presentation: { hasActiveRestrictions: true, summary: "", items },
    onRestrictionRequested: (key) => keys.push(key) });
  for (const label of ["Update affected movements", "Update comfort", "Review suitable checks"]) notice.click(label);
  assert.deepEqual(keys, items.map((item) => item.sourceKey));
  const handlerNode = findNode((node) => ts.isJsxAttribute(node) && node.name.getText(appSource) === "onRestrictionRequested");
  const button = new FocusTarget(), restrictionReturnFocus = { current: null };
  const bindings = { workflowLocked: false, busy: false, snapshot: { presentations: { restrictions: { items } }, sources: { evidenceEvents: [report] } },
    document: { activeElement: button }, HTMLElement: FocusTarget, restrictionReturnFocus,
    startAssessment: () => { rechecks++; }, setRestrictionRecovery: (value) => opened.push(value) };
  const handler = evaluate(handlerNode.initializer.expression.getText(appSource), bindings);
  for (const key of keys) handler(key);
  assert.deepEqual(opened[0], context);
  assert.equal(opened[1].report, report);
  assert.equal(restrictionReturnFocus.current, button, "Capture the invoking button before the underlying screen is hidden");
  assert.equal(rechecks, 1);
  assert.equal(evaluate(handlerNode.initializer.expression.getText(appSource), { ...bindings, workflowLocked: true }), undefined);
  assert.equal(evaluate(handlerNode.initializer.expression.getText(appSource), { ...bindings, busy: true }), undefined);
});

await check("both overlay paths focus their heading and return to the invoking action or a visible heading", () => {
  const effect = findNode((node) => ts.isCallExpression(node) && node.expression.getText(appSource) === "useLayoutEffect"
    && node.arguments[0]?.getText(appSource).includes("previousRestrictionOpen"));
  const heading = new FocusTarget(), invoking = new FocusTarget(), today = new FocusTarget(), review = new FocusTarget(), section = new FocusTarget();
  const document = { getElementById: (id) => ({
    "vnext-restriction-report-title": heading, "vnext-today-heading": today,
    "vnext-workout-restriction-action": review,
  })[id], querySelector: () => section };
  const previousRestrictionOpen = { current: false }, restrictionReturnFocus = { current: invoking };
  const run = (restrictionOpen, restrictionRecovery) => evaluate(effect.arguments[0].getText(appSource),
    { document, previousRestrictionOpen, restrictionReturnFocus, restrictionOpen, restrictionRecovery })();
  run(false, context); assert.equal(heading.focused, 1); assert.equal(previousRestrictionOpen.current, true);
  run(false, undefined); assert.equal(invoking.focused, 1); assert.equal(restrictionReturnFocus.current, null);
  restrictionReturnFocus.current = invoking; run(false, context);
  invoking.isConnected = false; review.disabled = true;
  run(false, undefined); assert.equal(today.focused, 1, "Saving can remove or disable the original action");
  restrictionReturnFocus.current = invoking; run(false, context); today.hidden = true;
  run(false, undefined); assert.equal(section.focused, 1, "An update opened from Progress does not focus hidden Today content");
  restrictionReturnFocus.current = null; review.disabled = false;
  run(true, undefined); run(false, undefined);
  assert.equal(review.focused, 1, "The existing workout report path retains a return destination");
  const form = createHost(RestrictionRecoveryForm, { ...base, onSave: async () => {} });
  assert(elements(form.tree).some((item) => item.type === "h1" && item.props.id === "vnext-restriction-report-title" && item.props.tabIndex === -1));
});

await check("root save keeps the form on failure and closes only after the exact update succeeds", async () => {
  const node = findNode((item) => ts.isVariableDeclaration(item) && item.name.getText(appSource) === "saveComfortUpdate");
  const report = evidence.createRestrictionReport({ eventId: "root-clarification", athleteId: base.athleteId, catalogueVersion: 8,
    occurredAt: "2026-10-20T09:00:00.000Z", recordedAt: "2026-10-20T09:00:00.000Z",
    severity: "block", demandDomains: context.demandDomains, bodyRegions: ["Reported discomfort"], symptomSource: source });
  const calls = [], closed = [], snapshots = [], messages = [], queued = [];
  let fail = true;
  const save = evaluate(node.initializer.getText(appSource), {
    runCommand: (command) => queued.push(command().catch(() => undefined)),
    refreshInput: () => ({ athleteId: base.athleteId }),
    runtime: { commitRestrictionReport: async (input) => {
      calls.push(input); if (fail) throw new Error("Storage unavailable"); return { snapshot: "fresh-safe-state" };
    } },
    setSnapshot: (value) => snapshots.push(value), setWorkoutSelections() {},
    setRestrictionRecovery: (value) => closed.push(value), setMessage: (value) => messages.push(value),
  });
  await assert.rejects(save(report), /Storage unavailable/);
  await Promise.all(queued);
  assert.deepEqual(closed, []); assert.deepEqual(snapshots, []);
  fail = false;
  await save(report); await Promise.all(queued);
  assert.equal(calls[0].event, report); assert.equal(calls[1].event, report);
  assert.deepEqual(closed, [undefined]); assert.deepEqual(snapshots, ["fresh-safe-state"]);
  assert(messages[0].includes("paused"));
});

console.log(`Symptom recovery UI: ${checks} real handler scenarios passed.`);
