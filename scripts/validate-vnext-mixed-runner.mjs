import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// Exercise the actual TSX component, its event handlers and effects. The small
// hook host batches state updates and runs effect cleanups before timer ticks;
// it deliberately leaves media rendering and real wall-clock waits out of scope.
const workout = load("app/vnext/workoutUx.ts");
const mixed = load("app/vnext/mixedWorkout.ts");
let host;
const sameDeps = (left, right) => left && right && left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]));
const slot = () => host.cursor++;
const hooks = {
  useState(initial) {
    const index = slot();
    if (!(index in host.slots)) host.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    const owner = host;
    return [owner.slots[index].value, (next) => {
      const value = typeof next === "function" ? next(owner.slots[index].value) : next;
      if (!Object.is(value, owner.slots[index].value)) {
        owner.slots[index].value = value;
        owner.dirty = true;
      }
    }];
  },
  useRef(initial) {
    const index = slot();
    return (host.slots[index] ??= { current: initial });
  },
  useMemo(factory, deps) {
    const index = slot();
    const previous = host.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) host.slots[index] = { deps, value: factory() };
    return host.slots[index].value;
  },
  useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
  useEffect(effect, deps) {
    const index = slot();
    const previous = host.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) {
      host.effects.push(() => {
        previous?.cleanup?.();
        host.slots[index] = { deps, cleanup: effect() };
      });
    }
  },
  lazy: () => "OwnedMotionGuide",
  Suspense: "Suspense",
};
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const sourcePath = resolve("app/vnext/releaseCandidate/MixedWorkoutRunner.tsx");
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const runner = { exports: {} };
new Function("exports", "module", "require", compiled)(runner.exports, runner, (name) => {
  if (name === "react") return hooks;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
  if (name === "lucide-react") return { Volume2: "Volume2", VolumeX: "VolumeX", X: "X" };
  if (name === "../index") return workout;
  if (name === "../mixedWorkout") return mixed;
  throw new Error(`Unexpected runner import ${name}`);
});

const text = (value) => value === null || value === undefined || typeof value === "boolean" ? ""
  : Array.isArray(value) ? value.map(text).join("")
    : typeof value === "object" ? text(value.props?.children) : String(value);
const elements = (value) => Array.isArray(value) ? value.flatMap(elements)
  : value && typeof value === "object" ? [value, ...elements(value.props?.children)] : [];
const storage = () => {
  const entries = new Map([["parallette25-vnext-timer-sound-v1", "off"]]);
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key), entries };
};
const domains = ["hand-wrist-bearing", "forward-straight-arm-upper-limb", "overhead-straight-arm-upper-limb",
  "horizontal-bent-arm-push", "vertical-bent-arm-push", "inversion-technical", "compression-trunk"];
const demand = (values = {}) => Object.fromEntries(domains.map((domain) => [domain, values[domain] ?? "low"]));
const exercise = (id, roles, values = {}) => ({ id, definitionVersion: 1, name: id.toUpperCase(), roles,
  media: [{ kind: "motion", reference: `owned-${id}` }],
  instructions: { how: `Perform ${id} with control.`, cues: ["Stay comfortable."] }, safetyNotes: [],
  prescriptionVariants: [{ id: `${id}-standard`, label: `${id.toUpperCase()} standard`,
    target: { kind: "repetitions", minimum: 5, maximum: 8 }, demand: demand(values) }] });
const bundle = { exercises: [
  exercise("a", ["preparation-recovery"]), exercise("b", ["preparation-recovery"]),
  exercise("c", ["outcome-milestone"], { "horizontal-bent-arm-push": "moderate" }),
  exercise("d", ["capacity-accessory"], { "horizontal-bent-arm-push": "moderate" }),
  exercise("e", ["capacity-accessory"], { "compression-trunk": "moderate" }),
  exercise("f", ["capacity-accessory"], { "horizontal-bent-arm-push": "moderate" }),
] };
const plan = { id: "runner-mixed-plan", athleteId: "runner-test", generatorPolicyId: mixed.MIXED_WORKOUT_POLICY_ID,
  generatorPolicyVersion: 1, intendedDurationSeconds: 840,
  items: [["a", "preparation", 120], ["b", "preparation", 120], ["c", "primary-development", 120],
    ["d", "primary-development", 240], ["e", "primary-development", 240]].map(([id, purpose, plannedSeconds]) => ({
    id: `item-${id}`, exerciseId: id, exerciseDefinitionVersion: 1, prescriptionVariantId: `${id}-standard`,
    purpose, plannedSeconds, demand: bundle.exercises.find((entry) => entry.id === id).prescriptionVariants[0].demand,
  })) };
const option = { exerciseId: "f", exerciseDefinitionVersion: 1, prescriptionVariantId: "f-standard",
  direction: "similar", exerciseName: "F alternative", variantLabel: "F standard", targetLabel: "5–8 reps",
  structureLabel: "Two sets", reason: "A test-provided safe option.", mediaReference: "owned-f" };
const swapOptions = { "item-b": [option], "item-e": [option] };
const activeKey = `parallette25-vnext-rc-active-workout-v1:${plan.athleteId}`;

const createHost = (saved = storage()) => {
  const owner = { slots: [], cursor: 0, effects: [], dirty: true, tree: undefined, timers: new Map(), serial: 0,
    saved, facts: [], starts: 0, closes: [], props: undefined };
  owner.props = { plan, bundle, origin: "custom", initialSelections: {}, swapOptions,
    onStart: () => { owner.starts++; }, onFinish: (facts) => { owner.facts.push(facts); }, onClose: (started) => owner.closes.push(started) };
  const install = () => {
    host = owner;
    globalThis.localStorage = saved;
    globalThis.window = { scrollTo() {}, setInterval(callback) { const id = ++owner.serial; owner.timers.set(id, callback); return id; },
      clearInterval: (id) => owner.timers.delete(id) };
  };
  owner.flush = () => {
    install();
    let count = 0;
    do {
      assert(++count < 50, "Hooks must settle without an effect loop");
      owner.dirty = false;
      owner.cursor = 0;
      owner.effects = [];
      owner.tree = runner.exports.MixedWorkoutRunner(owner.props);
      const effects = owner.effects;
      for (const effect of effects) effect();
    } while (owner.dirty);
  };
  owner.buttons = () => elements(owner.tree).filter((node) => node.type === "button");
  owner.click = (label) => {
    install();
    const button = owner.buttons().find((node) => text(node) === label || node.props["aria-label"] === label);
    assert(button, `Missing button ${label}`);
    assert(!button.props.disabled, `Disabled button ${label}`);
    button.props.onClick();
    owner.flush();
  };
  owner.tick = (seconds = 1) => {
    for (let second = 0; second < seconds; second++) {
      install();
      for (const callback of [...owner.timers.values()]) callback();
      owner.flush();
    }
  };
  owner.draft = () => JSON.parse(saved.getItem(activeKey) ?? "null");
  owner.title = () => text(elements(owner.tree).find((node) => node.type === "h1"));
  owner.row = (id) => elements(owner.tree).find((node) => node.type === "li"
    && text(node).startsWith(`${plan.items.findIndex((item) => item.id === id) + 1}. `));
  owner.changeable = (id) => elements(owner.row(id))
    .some((node) => node.type === "button" && text(node) === "Change");
  owner.change = (id) => {
    const button = elements(owner.row(id)).find((node) => node.type === "button" && text(node) === "Change");
    assert(button, `Movement ${id} must offer Change`);
    install(); button.props.onClick(); owner.flush();
    const swap = owner.buttons().find((node) => node.props.className === "vnext-swap-option");
    assert(swap, "Safe option should be visible");
    swap.props.onClick(); owner.flush();
  };
  owner.unmount = () => { install(); for (const value of owner.slots) value?.cleanup?.(); owner.timers.clear(); };
  owner.flush();
  return owner;
};

let checks = 0;
const check = (label, callback) => { callback(); checks++; console.log(`PASS ${label}`); };

check("actual timer effects visit A1 work/rest, B1 work/rest, then A2 without completing A early", () => {
  const app = createHost();
  assert.equal(app.title(), "A");
  app.click("Start workout");
  app.tick(45);
  assert.equal(app.title(), "Rest");
  assert.equal(app.draft().intervalIndex, 1);
  assert.equal(app.draft().participationSeconds["item-a"], 45);
  app.tick(15);
  assert.equal(app.title(), "B");
  assert.equal(app.draft().intervalIndex, 2);
  assert.deepEqual(app.draft().completedPlanItemIds, []);
  app.tick(60);
  assert.equal(app.title(), "A");
  assert.equal(app.draft().intervalIndex, 4);
  assert.deepEqual(app.draft().completedPlanItemIds, []);
  app.tick(60);
  assert.equal(app.draft().intervalIndex, 6);
  assert.deepEqual(app.draft().completedPlanItemIds, ["item-a"]);
  app.tick(60);
  assert.equal(app.draft().intervalIndex, 8);
  assert.deepEqual(app.draft().completedPlanItemIds, ["item-a", "item-b"]);
  app.unmount();
});

check("active rounds lock untouched partner while future groups accept swaps without moving the cursor", () => {
  const app = createHost();
  assert(app.changeable("item-b"));
  app.click("Start workout"); app.tick(2);
  assert(!app.changeable("item-b"));
  assert(app.changeable("item-e"));
  const before = app.draft();
  app.change("item-e");
  const after = app.draft();
  assert.equal(after.intervalIndex, before.intervalIndex);
  assert.equal(after.intervalElapsedSeconds, before.intervalElapsedSeconds);
  assert.equal(after.selections["item-e"].exerciseId, "f");
  assert.deepEqual(after.participationSeconds, before.participationSeconds);
  // The future swap shares D's loading, so that untouched group falls back to
  // focused sets. Its first and second D cycles still follow the active prefix.
  app.click("Resume"); app.tick(358);
  assert.equal(app.title(), "D");
  app.tick(120);
  assert.equal(app.title(), "D", "Incompatible future pair must use D's second set before F");
  app.tick(120);
  assert.equal(app.title(), "F");
  app.unmount();
});

check("reaching the final set does not complete work skipped in an earlier round", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(5); app.click("Skip interval");
  app.click("Resume"); app.tick(135);
  assert.equal(app.draft().intervalIndex, 6);
  assert.equal(app.draft().participationSeconds["item-a"], 50);
  assert(!app.draft().completedPlanItemIds.includes("item-a"));
  app.click("Finish early");
  assert.deepEqual(app.facts[0].completedPlanItemIds, []);
  assert.equal(app.facts[0].participationSeconds["item-b"], 45);
  app.unmount();
});

check("pause and reload retain exact set, interval seconds, measured work and paused state", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(67); app.click("Pause");
  const before = app.draft();
  assert.equal(before.intervalIndex, 2);
  assert.equal(before.intervalElapsedSeconds, 7);
  app.unmount();
  const restored = createHost(app.saved);
  assert.deepEqual(restored.draft(), before);
  assert.equal(restored.timers.size, 0, "Reload must await explicit Resume");
  restored.tick(4);
  assert.deepEqual(restored.draft(), before);
  restored.click("Resume"); restored.tick(3);
  assert.equal(restored.draft().intervalIndex, 2);
  assert.equal(restored.draft().intervalElapsedSeconds, 10);
  assert.equal(restored.draft().participationSeconds["item-b"], 10);
  assert.equal(restored.starts, 0, "Resume cannot start a second session");
  restored.unmount();
});

check("previous and skip preserve measured facts; skipped work never becomes completed", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(5); app.click("Skip interval");
  assert.equal(app.draft().intervalIndex, 1);
  assert.equal(app.timers.size, 0);
  app.click("Previous interval");
  assert.equal(app.draft().intervalIndex, 0);
  assert.equal(app.draft().participationSeconds["item-a"], 5);
  app.click("Skip interval"); app.click("Resume"); app.tick(15);
  assert.equal(app.draft().intervalIndex, 2);
  assert.deepEqual(app.draft().completedPlanItemIds, []);
  app.click("Finish early");
  assert.equal(app.facts.length, 1);
  assert.deepEqual(app.facts[0].completedPlanItemIds, []);
  assert.deepEqual(app.facts[0].participationSeconds,
    { "item-a": 5, "item-b": 0, "item-c": 0, "item-d": 0, "item-e": 0 });
  assert.equal(app.saved.getItem(activeKey), null);
  app.unmount();
});

check("natural completion emits one record candidate with exact per-item work and final occurrences", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(plan.intendedDurationSeconds);
  assert.equal(app.facts.length, 1);
  assert.deepEqual([...app.facts[0].completedPlanItemIds].sort(), plan.items.map((item) => item.id).sort());
  assert.deepEqual(app.facts[0].participationSeconds,
    { "item-a": 90, "item-b": 90, "item-c": 40, "item-d": 80, "item-e": 80 });
  assert.equal(app.saved.getItem(activeKey), null);
  app.tick(3);
  assert.equal(app.facts.length, 1, "Completion callback must be idempotent");
  app.unmount();
});

check("rewinding and reloading cannot unlock a round whose other movement already started", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(361); app.click("Pause");
  // D started in the support round; E is untouched. Rewind before the group.
  assert.equal(app.draft().participationSeconds["item-d"], 1);
  app.click("Previous interval");
  assert(!app.changeable("item-e"), "Previously started group must stay locked after Previous");
  app.unmount();
  const restored = createHost(app.saved);
  assert(!restored.changeable("item-e"), "Previously started group must stay locked after reload");
  restored.unmount();
});

console.log(`Mixed workout runner: ${checks} component lifecycle scenarios passed.`);
