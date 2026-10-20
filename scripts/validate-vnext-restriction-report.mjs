import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// Actual form/review handlers with a lightweight React host. Event construction
// and validation are the production implementation; no storage or network is used.
const evidence = load("app/vnext/assessment/evidence.ts");
const contracts = load("app/vnext/contracts.ts");
const { validateAthleteEvidenceEvent } = load("app/vnext/validation.ts");
let host;
const sameDeps = (left, right) => left && right && left.length === right.length
  && left.every((entry, index) => Object.is(entry, right[index]));
const hooks = {
  useState(initial) {
    const owner = host, index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [owner.slots[index].value, (next) => {
      const value = typeof next === "function" ? next(owner.slots[index].value) : next;
      if (!Object.is(value, owner.slots[index].value)) { owner.slots[index].value = value; owner.dirty = true; }
    }];
  },
  useRef(initial) { const index = host.cursor++; return (host.slots[index] ??= { current: initial }); },
  useId() { const index = host.cursor++; return `restriction-test-${index}`; },
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
const compileComponent = (path, extra = "") => {
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(path, "utf8") + extra, {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("module", "exports", "require", compiled)(module, module.exports, (name) => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "../assessment/evidence") return evidence;
    if (name === "../contracts") return contracts;
    if (name === "../media/VNextMotionGuide") return { VNextMotionGuide: "OwnedMotionGuide" };
    if (name === "./SkillRoadmap") return { SkillRoadmap: "SkillRoadmap" };
    if (name === "./HistoryPanels") return { HistoryView: "HistoryView", WorkoutSavedSummary: "WorkoutSavedSummary" };
    if (name === "./sectionNavigation") return { useSectionNavigation: () => ({ section: "today", changeSection() {}, hasVisited: (section) => section === "today" }) };
    if (name.endsWith(".css")) return {};
    throw new Error(`Unexpected report/review import ${name}`);
  });
  return module.exports;
};
const { RestrictionReportForm } = compileComponent("app/vnext/releaseCandidate/RestrictionReportForm.tsx");
// Expose the existing local component solely inside this test module.
const { TodayView, VNextExperience } = compileComponent("app/vnext/ui/VNextExperience.tsx", "\nexport { TodayView };\n");
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node && typeof node === "object" ? [node, ...elements(node.props?.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object"
  ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
const createHost = (Component, props) => {
  const owner = { slots: [], cursor: 0, effects: [], dirty: true, tree: undefined, props };
  owner.flush = () => {
    host = owner;
    let renders = 0;
    do {
      assert(++renders < 30, "Hooks must settle");
      owner.cursor = 0; owner.effects = []; owner.dirty = false;
      owner.tree = Component(owner.props);
      for (const effect of owner.effects) effect();
    } while (owner.dirty);
  };
  owner.drain = async () => { await Promise.resolve(); await Promise.resolve(); owner.flush(); };
  owner.button = (label) => elements(owner.tree).find((node) => node.type === "button" && text(node) === label);
  owner.click = (label, flush = true) => {
    const button = owner.button(label); assert(button, `Missing ${label}`); assert(!button.props.disabled, `Disabled ${label}`);
    button.props.onClick(); if (flush) owner.flush();
  };
  owner.region = (value) => {
    const field = elements(owner.tree).find((node) => node.type === "input" && node.props.placeholder === "For example: left wrist");
    assert(field); field.props.onChange({ target: { value } }); owner.flush();
  };
  owner.domain = (label) => {
    const wrapper = elements(owner.tree).find((node) => node.type === "label" && text(node) === label);
    assert(wrapper); elements(wrapper).find((node) => node.type === "input").props.onChange(); owner.flush();
  };
  owner.flush(); return owner;
};
const pendingSaves = () => {
  const calls = [];
  return { calls, save: (report) => new Promise((resolve, reject) => calls.push({ report, resolve, reject })) };
};
const base = { athleteId: "restriction-form-athlete", catalogueVersion: 8, onClose() {} };
const saveLabel = "Save restriction & return to review";
let checks = 0;
const check = async (label, callback) => { await callback(); checks++; console.log(`PASS ${label}`); };

await check("report needs a movement area and a nonblank body area before emitting any event", () => {
  let saves = 0, closes = 0;
  const app = createHost(RestrictionReportForm, { ...base, onSave: async () => { saves++; }, onClose: () => { closes++; } });
  assert(app.button(saveLabel).props.disabled);
  app.button(saveLabel).props.onClick(); assert.equal(saves, 0);
  app.domain("Weight on hands / wrists"); assert(app.button(saveLabel).props.disabled);
  app.region("   "); assert(app.button(saveLabel).props.disabled);
  app.region("left wrist"); assert.equal(app.button(saveLabel).props.disabled, false);
  app.domain("Weight on hands / wrists"); assert(app.button(saveLabel).props.disabled);
  app.click("Back to review"); assert.equal(closes, 1); assert.equal(saves, 0);
});

let retainedReport;
await check("double submission emits one exact report and failed retry keeps its original identity and time", async () => {
  const pending = pendingSaves();
  const app = createHost(RestrictionReportForm, { ...base, onSave: pending.save });
  app.domain("Weight on hands / wrists"); app.domain("Straight-arm leaning"); app.region("  left wrist  ");
  app.click(saveLabel, false); app.click(saveLabel, false); app.flush();
  assert.equal(pending.calls.length, 1);
  assert(app.button("Saving…").props.disabled);
  assert(elements(app.tree).find((node) => node.type === "fieldset").props.disabled);
  retainedReport = pending.calls[0].report;
  assert(validateAthleteEvidenceEvent(retainedReport).valid);
  assert.equal(retainedReport.type, "restriction_reported"); assert.equal(retainedReport.source, "athlete-report");
  assert.equal(retainedReport.severity, "block"); assert.deepEqual(retainedReport.bodyRegions, ["left wrist"]);
  assert.deepEqual(retainedReport.demandDomains, ["forward-straight-arm-upper-limb", "hand-wrist-bearing"]);
  assert.equal(retainedReport.occurredAt, retainedReport.recordedAt);
  assert(!("measurement" in retainedReport)); assert(!("participationSeconds" in retainedReport));
  assert(!("exerciseId" in retainedReport)); assert(!("itemOutcomes" in retainedReport));
  assert(!("planId" in retainedReport)); assert(!("observationSessionId" in retainedReport));
  const immutable = JSON.stringify(retainedReport);
  pending.calls[0].reject(new Error("Temporary save failure")); await app.drain();
  assert(text(app.tree).includes("Temporary save failure")); assert.equal(app.button("Back to review"), undefined);
  app.click("Retry saving restriction"); assert.equal(pending.calls.length, 2);
  assert.equal(pending.calls[1].report, retainedReport); assert.equal(JSON.stringify(pending.calls[1].report), immutable);
  pending.calls[1].resolve(); await app.drain();
});

await check("reconstructed pending report retries byte-identically without another symptom report", async () => {
  const initialReport = JSON.parse(JSON.stringify(retainedReport)), pending = pendingSaves();
  const app = createHost(RestrictionReportForm, { ...base, initialReport, onSave: pending.save });
  assert(elements(app.tree).find((node) => node.type === "fieldset").props.disabled);
  assert.equal(app.button("Back to review"), undefined);
  app.click("Retry saving restriction", false); app.click("Retry saving restriction", false); app.flush();
  assert.equal(pending.calls.length, 1);
  assert.deepEqual(pending.calls[0].report, retainedReport);
  assert.equal(pending.calls[0].report, initialReport);
  pending.calls[0].resolve(); await app.drain();
});

const today = { status: "unavailable", blocks: [], reason: "A saved workout is ready for review.", authorityNotice: "Exact measured work is retained." };
const restrictions = { hasActiveRestrictions: false, summary: "", items: [] };
const prompt = { planItemId: "performed-item", exerciseName: "Performed movement", mediaReference: "owned-test", purposeLabel: "Main work",
  statusPrompt: "How did it go?", statusOptions: [{ value: "completed", label: "Completed" }, { value: "modified", label: "Modified" }],
  asksDifficulty: true, difficultyOptions: [{ value: "easy", label: "Easy" }, { value: "right", label: "Right" }, { value: "hard", label: "Hard" }],
  painPrompt: "Discomfort or instability?" };
for (const prompts of [[], [prompt]]) await check(`${prompts.length}-rating review exposes pain reporting without manufacturing workout feedback`, () => {
  const completion = { prompts, authorityNotice: "Session Record owns performed work." };
  const immutable = JSON.stringify(completion), feedback = [];
  let painRequests = 0;
  const callback = () => { painRequests++; };
  const props = { today, restrictions, completion, onWorkoutRestrictionRequested: callback,
    onWorkoutReviewSubmitted: (value) => feedback.push(value), announce() {} };
  const shell = createHost(VNextExperience, { ...props, progress: { families: [] }, skillDetails: [], goals: { options: [] },
    assessment: { actions: [] }, recentSessions: [] });
  const todayNode = elements(shell.tree).find((node) => node.type === TodayView);
  assert(todayNode); assert.equal(todayNode.props.onWorkoutRestrictionRequested, callback);
  const app = createHost(TodayView, todayNode.props);
  app.click("Report pain or a new restriction"); assert.equal(painRequests, 1); assert.deepEqual(feedback, []);
  assert.equal(JSON.stringify(completion), immutable);
  if (prompts.length) {
    assert(app.button("Save workout").props.disabled);
    elements(app.tree).find((node) => node.type === "input" && node.props.value === "completed").props.onChange(); app.flush();
    elements(app.tree).find((node) => node.type === "input" && node.props.value === "right").props.onChange(); app.flush();
    app.click("Report pain or a new restriction"); assert.equal(painRequests, 2);
    // The host stays mounted while the sibling form is shown, as the app does.
    app.props = { ...app.props, active: false }; app.flush(); app.props = { ...app.props, active: true }; app.flush();
    assert(elements(app.tree).find((node) => node.type === "input" && node.props.value === "completed").props.checked);
    assert(elements(app.tree).find((node) => node.type === "input" && node.props.value === "right").props.checked);
  }
  app.click("Save workout");
  assert.deepEqual(feedback, [prompts.length ? [{ planItemId: "performed-item", status: "completed", difficulty: "right" }] : []]);
  app.props = { ...app.props, busy: true }; app.flush(); assert(app.button("Report pain or a new restriction").props.disabled);
});
console.log(`Restriction reporting: ${checks} actual form/review scenarios passed.`);
