import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// Execute the actual TodayView handlers and recovery readers with synthetic
// presentation data. No account, network or real browser storage is accessed.
const { readWorkoutReviewDraft } = load("app/vnext/releaseCandidate/workoutReviewRecovery.ts");
const { createRecoveryStorageGuard, RecoveryStorageConflict } = load("app/vnext/releaseCandidate/recoveryStorage.ts");
let host;
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
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
  useId() { return `review-recovery-${host.cursor++}`; },
  useMemo(factory, deps) { const index = host.cursor++, previous = host.slots[index]; if (!previous || !sameDeps(previous.deps, deps)) host.slots[index] = { deps, value: factory() }; return host.slots[index].value; },
  useEffect(effect, deps) {
    const owner = host, index = owner.cursor++, previous = owner.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) owner.effects.push(() => { previous?.cleanup?.(); owner.slots[index] = { deps, cleanup: effect() }; });
  },
};
const jsx = (type, props) => ({ type, props: props ?? {} });
const module = { exports: {} };
const compiled = ts.transpileModule(`${readFileSync("app/vnext/ui/VNextExperience.tsx", "utf8")}\nexport { TodayView };`, {
  fileName: "VNextExperience.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("module", "exports", "require", compiled)(module, module.exports, (name) => {
  if (name === "react") return hooks;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
  if (name === "../media/VNextMotionGuide") return { VNextMotionGuide: "OwnedMotionGuide" };
  if (name === "./SkillRoadmap") return { SkillRoadmap: "SkillRoadmap" };
  if (name === "./HistoryPanels") return { HistoryView: "HistoryView", WorkoutSavedSummary: "WorkoutSavedSummary" };
  if (name === "./sectionNavigation") return { useSectionNavigation: () => ({ section: "today", changeSection() {}, hasVisited: () => true }) };
  if (name.endsWith(".css")) return {};
  throw new Error(`Unexpected review import ${name}`);
});
const { TodayView } = module.exports;
const elements = (node) => Array.isArray(node) ? node.flatMap(elements) : node && typeof node === "object" ? [node, ...elements(node.props?.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
const createHost = (props) => {
  const owner = { slots: [], cursor: 0, effects: [], dirty: true, tree: undefined, props };
  owner.flush = () => {
    host = owner; let renders = 0;
    do { assert(++renders < 30, "Review hooks must settle"); owner.cursor = 0; owner.effects = []; owner.dirty = false; owner.tree = TodayView(owner.props); for (const effect of owner.effects) effect(); } while (owner.dirty);
  };
  owner.button = (label) => elements(owner.tree).find((node) => node.type === "button" && text(node) === label);
  owner.click = (label, flush = true) => { const button = owner.button(label); assert(button, `Missing ${label}`); assert(!button.props.disabled, `Disabled ${label}`); button.props.onClick(); if (flush) owner.flush(); };
  owner.input = (name, value) => elements(owner.tree).find((node) => node.type === "input" && node.props.name === name && node.props.value === value);
  owner.choose = (name, value, flush = true) => { const input = owner.input(name, value); assert(input, `Missing ${name} ${value}`); input.props.onChange(); if (flush) owner.flush(); };
  owner.field = (placeholder, value) => { const input = elements(owner.tree).find((node) => node.type === "input" && node.props.placeholder === placeholder); assert(input); input.props.onChange({ target: { value } }); owner.flush(); };
  owner.flush(); return owner;
};
const today = { status: "unavailable", blocks: [], reason: "Ready for review.", authorityNotice: "Measured work is retained." };
const restrictions = { hasActiveRestrictions: false, summary: "", items: [] };
const prompt = (id) => ({ planItemId: id, exerciseName: `Movement ${id}`, mediaReference: "owned-test", purposeLabel: "Main work",
  statusPrompt: "How did it go?", statusOptions: [{ value: "completed", label: "Completed" }, { value: "modified", label: "Modified" }, { value: "skipped", label: "Skipped" }],
  asksDifficulty: true, difficultyOptions: [{ value: "easy", label: "Easy" }, { value: "right", label: "Right" }, { value: "hard", label: "Hard" }], painPrompt: "Discomfort or instability?" });
const completion = { prompts: [prompt("item-one"), prompt("item-two")], authorityNotice: "Only final save writes performance." };
const props = (extras = {}) => ({ today, restrictions, completion, reviewSessionId: "plan-one", active: true, announce() {}, onWorkoutReviewSubmitted() {}, ...extras });
const answer = (extra = {}) => ({ status: "completed", difficulty: "right", symptomOrInstability: false, bodyRegion: "", modificationReason: "", ...extra });
let count = 0;
const scenario = (label, run) => { run(); count++; console.log(`PASS ${label}`); };

scenario("every answer and review position survives exact draft serialization and remount", () => {
  let saved; const feedback = [];
  const callback = (draft) => { saved = JSON.parse(JSON.stringify(draft)); };
  const first = createHost(props({ onReviewDraftChange: callback }));
  first.choose("status-item-one", "modified"); first.choose("difficulty-item-one", "hard");
  first.field("For example: less range, more assistance or a shorter dose", "More assistance");
  const symptom = elements(first.tree).find((node) => node.type === "input" && node.props.type === "checkbox");
  symptom.props.onChange({ target: { checked: true } }); first.flush();
  first.field("For example: left wrist", "left wrist");
  assert.equal(saved.answers["item-one"].bodyRegion, "left wrist");
  first.click("Next movement");
  assert.equal(saved.reviewIndex, 1);
  const restored = readWorkoutReviewDraft(saved, "plan-one", ["item-one", "item-two"]);
  const second = createHost(props({ reviewDraft: restored, onReviewDraftChange: callback, onWorkoutReviewSubmitted: (value) => feedback.push(value) }));
  assert.match(text(second.tree), /Movement 2 of 2/u);
  assert(second.button("Save workout").props.disabled, "Unanswered second movement must stay unanswered");
  second.choose("status-item-two", "completed"); second.choose("difficulty-item-two", "easy");
  second.click("Previous");
  assert(second.input("status-item-one", "modified").props.checked);
  assert(second.input("difficulty-item-one", "hard").props.checked);
  assert.equal(elements(second.tree).find((node) => node.props?.placeholder === "For example: left wrist").props.value, "left wrist");
  second.click("Next movement"); second.click("Save workout");
  assert.deepEqual(feedback, [[{ planItemId: "item-one", status: "modified", difficulty: "hard", symptomOrInstability: true, bodyRegion: "left wrist", modificationReason: "More assistance" }, { planItemId: "item-two", status: "completed", difficulty: "easy" }]]);
});

scenario("same-session presentation refresh preserves answers and position", () => {
  const writes = [];
  const view = createHost(props({ onReviewDraftChange: (value) => writes.push(value) }));
  view.choose("status-item-one", "completed"); view.click("Next movement"); view.choose("status-item-two", "modified");
  const before = JSON.stringify(writes.at(-1));
  view.props = { ...view.props, completion: JSON.parse(JSON.stringify(completion)), reviewDraft: { version: 1, planId: "plan-one", reviewIndex: 0, answers: {} } };
  view.flush();
  assert.match(text(view.tree), /Movement 2 of 2/u);
  assert(view.input("status-item-two", "modified").props.checked);
  assert.equal(JSON.stringify(writes.at(-1)), before, "A refreshed projection must not overwrite current answers with stale props");
});

scenario("a new session using the same movements cannot inherit earlier feedback", () => {
  const view = createHost(props({ reviewDraft: { version: 1, planId: "plan-one", reviewIndex: 1, answers: { "item-one": answer(), "item-two": answer() } } }));
  assert.equal(view.button("Save workout").props.disabled, false);
  view.props = { ...view.props, reviewSessionId: "plan-two" }; view.flush();
  assert.match(text(view.tree), /Movement 1 of 2/u);
  assert(!view.input("status-item-one", "completed").props.checked);
  assert(view.button("Next movement").props.disabled);
  const ownDraft = { version: 1, planId: "plan-three", reviewIndex: 1, answers: { "item-one": answer({ status: "skipped" }) } };
  view.props = { ...view.props, reviewSessionId: "plan-three", reviewDraft: ownDraft }; view.flush();
  assert.match(text(view.tree), /Movement 2 of 2/u);
  view.click("Previous"); assert(view.input("status-item-one", "skipped").props.checked);
});

scenario("consecutive actual handlers retain the latest answer even before a render", () => {
  const writes = [];
  const view = createHost(props({ reviewDraft: { version: 1, planId: "plan-one", reviewIndex: 0, answers: { "item-one": answer() } }, onReviewDraftChange: (value) => writes.push(value) }));
  view.choose("status-item-one", "modified", false); view.choose("difficulty-item-one", "hard", false); view.flush();
  assert.equal(writes.at(-1).answers["item-one"].status, "modified");
  assert.equal(writes.at(-1).answers["item-one"].difficulty, "hard");
  view.choose("status-item-one", "skipped");
  assert.deepEqual(writes.at(-1).answers["item-one"], { status: "skipped", difficulty: undefined, symptomOrInstability: false, bodyRegion: "", modificationReason: "" });
});

scenario("malformed/foreign draft hints are filtered without manufacturing answers", () => {
  const valid = { version: 1, planId: "plan-one", reviewIndex: 0, answers: { "item-one": answer() } };
  for (const invalid of [null, [], "wrong", { ...valid, version: 2 }, { ...valid, planId: "foreign" }, { ...valid, reviewIndex: -1 }, { ...valid, reviewIndex: 0.5 }, { ...valid, answers: [] }]) {
    assert.equal(readWorkoutReviewDraft(invalid, "plan-one", ["item-one", "item-two"]), undefined);
  }
  const draft = { ...valid, reviewIndex: 999, answers: { "item-one": answer(), "item-two": answer({ status: "invented" }), "foreign-item": answer() } };
  const before = JSON.stringify(draft);
  assert.deepEqual(readWorkoutReviewDraft(draft, "plan-one", ["item-one", "item-two"]), { ...valid, reviewIndex: 1 });
  assert.equal(JSON.stringify(draft), before);
  for (const malformed of [answer({ difficulty: "impossible" }), answer({ symptomOrInstability: "true" }), answer({ bodyRegion: null }), answer({ modificationReason: 10 })]) {
    const result = readWorkoutReviewDraft({ ...valid, answers: { "item-one": malformed } }, "plan-one", ["item-one"]);
    assert.deepEqual(result.answers, {});
  }
});

scenario("the app recovery reader keeps exact workout facts while rejecting foreign/malformed review hints", () => {
  // Extract this one existing parser using TypeScript's syntax tree, then run
  // its unchanged implementation without mounting unrelated app services.
  const source = ts.createSourceFile("VNextReleaseCandidateApp.tsx", readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = source.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === "readWorkoutRecovery"));
  assert(statement);
  const parserCode = ts.transpileModule(`${statement.getText(source)}\nreturn readWorkoutRecovery;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const memory = new Map(), storage = { getItem: (key) => memory.get(key) ?? null, removeItem: (key) => memory.delete(key) };
  const recoveryKey = (athlete, namespace) => `${namespace}:${athlete}`;
  const parse = new Function("localStorage", "readWorkoutReviewDraft", "workoutRecoveryKey", "hasActiveWorkoutDraft", parserCode)(storage, readWorkoutReviewDraft, recoveryKey, () => true);
  const raw = { version: 1, athleteId: "review-athlete", stage: "review", origin: "custom", generated: { ok: true, plan: { id: "plan-one", athleteId: "review-athlete", items: [{ id: "item-one" }, { id: "item-two" }], rationale: [] } }, facts: { startedAt: "2026-10-19T10:00:00.000Z", completedAt: "2026-10-19T10:01:00.000Z", completedPlanItemIds: ["item-one"], performedByPlanItem: { "item-one": { seconds: 18 } } }, reviewDraft: { version: 1, planId: "foreign-plan", reviewIndex: 1, answers: { "item-one": answer() } } };
  const key = recoveryKey("review-athlete", "test"), serialized = JSON.stringify(raw);
  memory.set(key, serialized);
  const recovered = parse("review-athlete", "test");
  assert.equal(recovered.reviewDraft, undefined); assert.deepEqual(recovered.facts, raw.facts); assert.equal(recovered.stage, "review");
  assert.equal(memory.get(key), serialized, "Review hints must not rewrite immutable or measured facts during read");
  raw.reviewDraft = { version: 1, planId: "plan-one", reviewIndex: 1, answers: { "item-one": answer(), "foreign-item": answer() } };
  memory.set(key, JSON.stringify(raw));
  assert.deepEqual(Object.keys(parse("review-athlete", "test").reviewDraft.answers), ["item-one"]);
  memory.set(key, JSON.stringify({ ...raw, athleteId: "foreign-athlete" }));
  assert.equal(parse("review-athlete", "test"), undefined);
});

scenario("a failed app checkpoint keeps the newest answers in memory and retries exactly", () => {
  const source = ts.createSourceFile("VNextReleaseCandidateApp.tsx", readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findStatement = (name) => {
    let found;
    const visit = (node) => {
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === name)) found = node;
      if (!found) ts.forEachChild(node, visit);
    };
    visit(source); assert(found, `Missing actual app handler ${name}`); return found.getText(source);
  };
  const code = ts.transpileModule(`${findStatement("retainWorkoutReview")}\n${findStatement("retryWorkoutReviewCheckpoint")}\nreturn { retainWorkoutReview, retryWorkoutReviewCheckpoint };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const original = { stage: "review", generated: { plan: { id: "plan-one" } }, facts: { seconds: 27 } };
  const ref = { current: original }; let inMemory = original, error, persisted, fail = true;
  const handlers = new Function("workoutRecoveryRef", "setWorkoutRecovery", "writeWorkoutRecovery", "workoutRecoveryStorage", "setReviewCheckpointError", "RecoveryStorageConflict", code)(ref, (value) => { inMemory = value; }, (value) => { if (fail) throw new Error("Synthetic quota failure"); persisted = JSON.stringify(value); }, {}, (value) => { error = value; }, RecoveryStorageConflict);
  const draft = { version: 1, planId: "plan-one", reviewIndex: 1, answers: { "item-one": answer({ difficulty: "hard" }) } };
  handlers.retainWorkoutReview(draft);
  assert.match(error, /could not be saved/u); assert.equal(persisted, undefined);
  assert.deepEqual(inMemory.reviewDraft, draft); assert.equal(ref.current, inMemory);
  assert.equal(ref.current.facts, original.facts, "Review edits cannot change measured work");
  fail = false; handlers.retryWorkoutReviewCheckpoint();
  assert.equal(error, undefined); assert.deepEqual(JSON.parse(persisted).reviewDraft, draft);
  const before = persisted;
  handlers.retainWorkoutReview({ ...draft, planId: "another-session" });
  assert.equal(persisted, before); assert.equal(inMemory.reviewDraft.planId, "plan-one");
});

const rootSource = ts.createSourceFile("VNextReleaseCandidateApp.tsx", readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const rootHandlers = (names, bindings) => {
  const statements = names.map((name) => {
    let found;
    const visit = (node) => { if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(rootSource) === name)) found = node; if (!found) ts.forEachChild(node, visit); };
    visit(rootSource); assert(found); return found.getText(rootSource);
  });
  const code = ts.transpileModule(`${statements.join("\n")}\nreturn { ${names.join(",")} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings));
};
const memoryStorage = () => {
  const memory = new Map(); return { memory, getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
};

scenario("stale review edits, retry and cleanup cannot overwrite or remove a newer review", () => {
  const storage = memoryStorage(), original = { stage: "review", generated: { plan: { id: "plan-one" } }, facts: { seconds: 27 } };
  storage.setItem("review", JSON.stringify(original));
  const guard = createRecoveryStorageGuard("review", storage), ref = { current: original }, errors = [];
  const handlers = rootHandlers(["retainWorkoutReview", "retryWorkoutReviewCheckpoint", "clearWorkoutRecovery"], {
    useCallback: (fn) => fn, workoutRecoveryRef: ref, workoutRecoveryStorage: guard, RecoveryStorageConflict,
    setWorkoutRecovery() {}, setWorkoutSelections() {}, setReviewCheckpointError: (value) => errors.push(value),
    writeWorkoutRecovery: (value, writer) => writer.write(JSON.stringify(value)),
  });
  const newer = JSON.stringify({ ...original, reviewDraft: { answers: { "item-one": answer({ difficulty: "hard" }) } } });
  storage.setItem("review", newer);
  handlers.retainWorkoutReview({ version: 1, planId: "plan-one", reviewIndex: 0, answers: { "item-one": answer({ difficulty: "easy" }) } });
  assert.match(errors.at(-1), /another open view/u); assert.equal(storage.getItem("review"), newer);
  handlers.retryWorkoutReviewCheckpoint(); assert.equal(storage.getItem("review"), newer);
  assert.throws(handlers.clearWorkoutRecovery, RecoveryStorageConflict); assert.equal(storage.getItem("review"), newer);
});

scenario("actual discard confirmation cannot delete a changed timer or changed workout envelope", () => {
  for (const change of ["timer", "envelope"]) {
    const storage = memoryStorage(), timerKey = "parallette25-vnext-rc-active-workout-v1:discard-athlete";
    const recovery = { stage: "active", generated: { plan: { id: "plan-one" } } };
    storage.setItem("envelope", JSON.stringify(recovery)); storage.setItem(timerKey, JSON.stringify({ athleteId: "discard-athlete", planId: "plan-one", elapsedSeconds: 5 }));
    const guard = createRecoveryStorageGuard("envelope", storage), errors = [];
    let afterConfirm;
    const handlers = rootHandlers(["captureWorkoutDiscard", "discardWorkout"], {
      athleteId: "discard-athlete", workoutRecovery: recovery, workoutRecoveryStorage: guard, RecoveryStorageConflict,
      createRecoveryStorageGuard: (key) => createRecoveryStorageGuard(key, storage), clearWorkoutRecovery: () => guard.remove(),
      setWorkoutSelections() {}, setMessage() {}, setError: (value) => errors.push(value),
      window: { confirm: () => {
        storage.setItem(change === "timer" ? timerKey : "envelope", JSON.stringify(change === "timer" ? { athleteId: "discard-athlete", planId: "plan-one", elapsedSeconds: 8 } : { ...recovery, reviewDraft: { answers: ["new"] } }));
        afterConfirm = [...storage.memory.entries()]; return true;
      } },
    });
    handlers.discardWorkout(); assert.match(errors[0], /another open view/u); assert.deepEqual([...storage.memory.entries()], afterConfirm);
  }
});

scenario("discard refuses another plan's timer before removing either recovery key", () => {
  const storage = memoryStorage(), timerKey = "parallette25-vnext-rc-active-workout-v1:discard-athlete";
  storage.setItem("envelope", "exact-envelope"); storage.setItem(timerKey, JSON.stringify({ athleteId: "discard-athlete", planId: "newer-plan", elapsedSeconds: 8 }));
  const guard = createRecoveryStorageGuard("envelope", storage), before = [...storage.memory.entries()];
  const { captureWorkoutDiscard } = rootHandlers(["captureWorkoutDiscard"], {
    athleteId: "discard-athlete", workoutRecovery: { generated: { plan: { id: "old-plan" } } }, workoutRecoveryStorage: guard,
    RecoveryStorageConflict, createRecoveryStorageGuard: (key) => createRecoveryStorageGuard(key, storage), clearWorkoutRecovery: () => guard.remove(),
  });
  assert.throws(captureWorkoutDiscard, RecoveryStorageConflict); assert.deepEqual([...storage.memory.entries()], before);
});

console.log(`Workout review recovery: ${count} actual handler/parser scenarios passed.`);
