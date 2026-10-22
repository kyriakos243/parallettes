import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
// Load the actual hook/controller alongside both current players; only React,
// media/icons and the browser host are replaced, never the timing implementation.
const modules = new Map();
const componentModule = (path) => {
  const sourcePath = resolve(path);
  if (modules.has(sourcePath)) return modules.get(sourcePath).exports;
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  modules.set(sourcePath, module);
  new Function("exports", "module", "require", compiled)(module.exports, module, (name) => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "lucide-react") return { Volume2: "Volume2", VolumeX: "VolumeX", X: "X" };
    if (name === "../index") return workout;
    if (name === "../workoutGuidance") return load("app/vnext/workoutGuidance.ts");
    if (name === "../practiceDose") return load("app/vnext/practiceDose.ts");
    if (name === "../mixedWorkout") return mixed;
    if (name === "./useWorkoutClock" || name === "./workoutClock" || name === "./useWorkoutRunAuthorization" || name === "./recoveryStorage"
      || name === "./workoutCueAudio" || name === "./guidedTimerAudio") {
      return componentModule(resolve(dirname(sourcePath), `${name}.ts`));
    }
    if (name.endsWith(".css")) return {};
    throw new Error(`Unexpected runner import ${name}`);
  });
  return module.exports;
};
const runner = componentModule("app/vnext/releaseCandidate/MixedWorkoutRunner.tsx");
const nativeRunner = componentModule("app/vnext/releaseCandidate/ReliableWorkoutRunner.tsx");

const text = (value) => value === null || value === undefined || typeof value === "boolean" ? ""
  : Array.isArray(value) ? value.map(text).join("")
    : typeof value === "object" ? text(value.props?.children) : String(value);
const elements = (value) => Array.isArray(value) ? value.flatMap(elements)
  : value && typeof value === "object" ? [value, ...elements(value.props?.children)] : [];
const storage = () => {
  const entries = new Map([["parallette25-vnext-timer-sound-v1", "off"]]);
  const saved = { failWrites: false, writeAttempts: 0,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      saved.writeAttempts++;
      if (saved.failWrites) throw new Error("Storage quota exhausted");
      entries.set(key, String(value));
    }, removeItem: (key) => entries.delete(key), entries };
  return saved;
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
// Distinct neighboring targets make a stale prescription visible in the rest
// preview instead of letting identical test targets mask a mismatched card.
bundle.exercises.find((entry) => entry.id === "b").prescriptionVariants[0].target = { kind: "repetitions", minimum: 7, maximum: 9 };
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

const eventTarget = () => {
  const listeners = new Map();
  return {
    addEventListener(type, callback, options) {
      const group = listeners.get(type) ?? new Map();
      group.set(callback, options?.once === true); listeners.set(type, group);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, event = {}) {
      for (const [callback, once] of [...(listeners.get(type) ?? [])]) {
        if (once) listeners.get(type)?.delete(callback);
        callback({ type, ...event });
      }
    },
    count: () => [...listeners.values()].reduce((sum, group) => sum + group.size, 0),
  };
};
const sentinel = () => {
  const target = eventTarget();
  const value = { ...target, released: false, releaseCalls: 0,
    async release() { value.releaseCalls++; value.releaseFromBrowser(); },
    releaseFromBrowser() { if (!value.released) { value.released = true; target.emit("release"); } },
  };
  return value;
};
const nativePlan = { ...plan, id: "runner-native-plan", generatorPolicyId: "vnext-workout-generator", generatorPolicyVersion: 1 };
const createHost = (saved = storage(), options = {}) => {
  const owner = { slots: [], cursor: 0, effects: [], dirty: true, tree: undefined, timers: new Map(), serial: 0,
    saved, facts: [], starts: 0, closes: [], props: undefined, monotonic: 0, wall: 1_792_281_600_000,
    wakeRequests: [], document: { ...eventTarget(), visibilityState: "visible" }, window: eventTarget() };
  owner.props = { plan: options.plan ?? (options.native ? nativePlan : plan), bundle: options.bundle ?? bundle, origin: "custom", initialSelections: {}, swapOptions,
    onStart: () => { owner.starts++; }, onFinish: (facts) => { owner.facts.push(facts); }, onClose: (started) => owner.closes.push(started) };
  if (options.onBeforeRun) owner.props.onBeforeRun = options.onBeforeRun;
  if (options.safetyVersion !== undefined) owner.props.safetyVersion = options.safetyVersion;
  if (options.autoStart) owner.props.autoStart = true;
  Object.assign(owner.window, { scrollTo() {}, setInterval(callback, delay) {
    const id = ++owner.serial; owner.timers.set(id, { callback, delay }); return id;
  }, clearInterval: (id) => owner.timers.delete(id) });
  owner.navigator = options.wakeLock ? { wakeLock: { request(type) {
    assert.equal(type, "screen");
    return new Promise((resolve, reject) => owner.wakeRequests.push({ resolve, reject }));
  } } } : {};
  const install = () => {
    host = owner;
    globalThis.localStorage = saved;
    globalThis.window = owner.window;
    globalThis.document = owner.document;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: owner.navigator });
    Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => owner.monotonic } });
    Date.now = () => owner.wall;
  };
  owner.flush = () => {
    install();
    let count = 0;
    do {
      assert(++count < 50, "Hooks must settle without an effect loop");
      owner.dirty = false;
      owner.cursor = 0;
      owner.effects = [];
      owner.tree = (options.native ? nativeRunner.ReliableWorkoutRunner : runner.MixedWorkoutRunner)(owner.props);
      const effects = owner.effects;
      owner.beforeEffects?.();
      for (const effect of effects) effect();
    } while (owner.dirty);
  };
  owner.drain = async () => { install(); await Promise.resolve(); await Promise.resolve(); owner.flush(); };
  owner.buttons = () => elements(owner.tree).filter((node) => node.type === "button");
  owner.click = (label, flush = true) => {
    install();
    const button = owner.buttons().find((node) => text(node) === label || node.props["aria-label"] === label);
    assert(button, `Missing button ${label}`);
    assert(!button.props.disabled, `Disabled button ${label}`);
    button.props.onClick();
    if (flush) owner.flush();
  };
  // A sample can intentionally run before React renders, or after a sleep where
  // wall time moved farther than performance.now (observed on some browsers).
  owner.sample = (milliseconds, { wallMilliseconds = milliseconds, flush = true } = {}) => {
    install(); owner.monotonic += milliseconds; owner.wall += wallMilliseconds;
    for (const { callback } of [...owner.timers.values()]) callback();
    if (flush) owner.flush();
  };
  owner.tick = (seconds = 1) => {
    for (let quarter = 0; quarter < seconds * 4; quarter++) owner.sample(250);
  };
  owner.visible = (visible, flush = true) => {
    install(); owner.document.visibilityState = visible ? "visible" : "hidden";
    owner.document.emit("visibilitychange"); if (flush) owner.flush();
  };
  owner.lifecycle = (event, properties = {}, flush = true) => {
    install(); owner.window.emit(event, properties); if (flush) owner.flush();
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
const check = async (label, callback) => { await callback(); checks++; console.log(`PASS ${label}`); };

for (const native of [false, true]) await check(`${native ? "native reliable" : "mixed"} rest preview uses the next exact movement, target and set structure`, () => {
  const app = createHost(storage(), { native });
  const activePlan = native ? nativePlan : plan;
  const structured = workout.structureWorkoutPlan(activePlan, bundle);
  const timeline = native ? structured.flatMap(item => item.intervals) : mixed.workoutExecutionTimeline(activePlan, bundle);
  const boundary = timeline.findIndex((interval, index) => interval.kind === "rest"
    && timeline[index + 1]?.planItemId !== interval.planItemId && timeline[index + 1]);
  assert(boundary >= 0);
  for (let index = 0; index < boundary; index++) app.click("Skip interval");
  const next = structured.find(item => item.planItemId === timeline[boundary + 1].planItemId);
  const card = elements(app.tree).find(node => node.props.className === "vnext-rc-coaching");
  assert.equal(app.title(), "Rest");
  assert.equal(text(elements(card).find(node => node.type === "h2")), next.variant.label);
  assert.equal(text(elements(card).find(node => node.props.className === "vnext-rc-target")), next.targetLabel);
  assert.equal(text(elements(card).find(node => node.props.className === "vnext-rc-structure")), next.structureLabel);
  assert.equal(elements(app.tree).find(node => node.type === "OwnedMotionGuide").props.preset, next.exercise.media[0].reference);
  const timer = elements(app.tree).find(node => node.props.className === "vnext-rc-timer");
  assert(text(timer).startsWith("Rest"), "The countdown must remain explicitly a rest timer");
  for (let index = boundary; index < timeline.length - 1; index++) app.click("Skip interval");
  assert.equal(app.title(), "Rest");
  const finalCard = elements(app.tree).find(node => node.props.className === "vnext-rc-coaching");
  assert(!elements(finalCard).some(node => node.props.className === "vnext-rc-target"), "Final rest must not advertise another work target");
  assert(text(finalCard).includes("complete after this rest"));
  app.unmount();
});

await check("actual timer effects visit A1 work/rest, B1 work/rest, then A2 without completing A early", () => {
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

await check("active rounds lock untouched partner while future groups accept swaps without moving the cursor", () => {
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

await check("reaching the final set does not complete work skipped in an earlier round", () => {
  const app = createHost();
  // Skip inside a running workout keeps the timer running; no Resume is needed.
  app.click("Start workout"); app.tick(5); app.click("Skip interval");
  app.tick(135);
  assert.equal(app.draft().intervalIndex, 6);
  assert.equal(app.draft().participationSeconds["item-a"], 50);
  assert(!app.draft().completedPlanItemIds.includes("item-a"));
  app.click("Finish early");
  assert.deepEqual(app.facts[0].completedPlanItemIds, []);
  assert.equal(app.facts[0].participationSeconds["item-b"], 45);
  app.unmount();
});

await check("pause and reload retain exact set, interval seconds, measured work and paused state", () => {
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

await check("previous and skip preserve measured facts; skipped work never becomes completed", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(5); app.click("Skip interval");
  assert.equal(app.draft().intervalIndex, 1);
  assert(app.timers.size > 0, "Skip while running must keep the timer running");
  assert(app.buttons().some((button) => text(button) === "Pause"), "Skip while running must not require Resume");
  app.tick(2);
  assert.equal(app.draft().participationSeconds["item-a"], 5, "A skipped rest earns no work participation");
  app.click("Previous interval");
  assert.equal(app.timers.size, 0, "Previous still pauses so earlier items are re-checked");
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

await check("natural completion emits one record candidate with exact per-item work and final occurrences", () => {
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

await check("rewinding and reloading cannot unlock a round whose other movement already started", () => {
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


for (const native of [false, true]) {
  const name = native ? "native" : "mixed";
  await check(`${name}: irregular foreground callbacks credit measured time, not callback count`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout");
    for (const delay of [100, 600, 450, 1200, 50, 1600]) app.sample(delay);
    assert.equal(app.draft().elapsedSeconds, 4);
    assert.equal(app.draft().intervalElapsedSeconds, 4);
    assert.equal(app.draft().participationSeconds["item-a"], 4);
    app.click("Pause"); const paused = app.draft();
    app.sample(60_000); assert.deepEqual(app.draft(), paused);
    app.click("Resume"); app.sample(750); app.sample(250);
    assert.equal(app.draft().elapsedSeconds, 5);
    app.unmount();
  });

  await check(`${name}: hidden event checkpoints a pending tick before React renders and requires Resume`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.tick(7);
    app.sample(1000, { flush: false });
    app.visible(false, false);
    const saved = app.draft();
    assert.equal(saved.elapsedSeconds, 8);
    assert.equal(saved.participationSeconds["item-a"], 8);
    assert.equal(saved.pauseReason, "hidden");
    app.sample(60_000, { flush: false });
    assert.deepEqual(app.draft(), saved, "Queued callback cannot add hidden work before effect cleanup");
    app.flush(); app.visible(true); app.tick(2);
    assert.equal(app.timers.size, 0);
    assert.deepEqual(app.draft(), saved);
    assert(text(app.tree).includes("Paused when you left the app."));
    app.unmount();
    const restored = createHost(app.saved, { native });
    assert.deepEqual(restored.draft(), saved);
    assert.equal(restored.timers.size, 0);
    restored.click("Resume"); restored.tick(2);
    assert.equal(restored.draft().elapsedSeconds, 10);
    assert.equal(restored.draft().pauseReason, undefined);
    restored.unmount();
  });

  await check(`${name}: pagehide checkpoints synchronously even if visibility did not change`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.sample(2000, { flush: false });
    app.lifecycle("pagehide", {}, false);
    assert.equal(app.draft().elapsedSeconds, 2);
    assert.equal(app.draft().pauseReason, "hidden");
    const saved = app.draft(); app.sample(1000, { flush: false });
    assert.deepEqual(app.draft(), saved);
    app.flush(); app.lifecycle("pageshow", { persisted: true });
    assert.equal(app.timers.size, 0);
    app.click("Resume"); app.tick(1);
    assert.equal(app.draft().elapsedSeconds, 3);
    app.unmount();
  });

  await check(`${name}: hidden at an interval boundary cannot advance or auto-complete while away`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.tick(44);
    app.sample(1000, { flush: false }); app.visible(false, false);
    assert.equal(app.draft().intervalIndex, 0);
    assert.equal(app.draft().intervalElapsedSeconds, 45);
    assert.equal(app.draft().participationSeconds["item-a"], 45);
    app.flush(); app.sample(30_000); app.visible(true);
    assert.equal(app.draft().intervalIndex, 0);
    assert.equal(app.facts.length, 0);
    app.click("Resume");
    assert.equal(app.draft().intervalIndex, 1);
    assert.equal(app.draft().elapsedSeconds, 45);
    app.tick(1);
    assert.equal(app.draft().intervalElapsedSeconds, 1);
    assert.equal(app.draft().participationSeconds["item-a"], 45);
    app.unmount();
  });

  await check(`${name}: long callback suspension and a sleeping monotonic clock pause without invented work`, () => {
    for (const sample of [{ milliseconds: 6000 }, { milliseconds: 250, wallMilliseconds: 60_250 }]) {
      const app = createHost(storage(), { native });
      app.click("Start workout"); app.tick(3);
      app.sample(sample.milliseconds, sample);
      assert.equal(app.draft().elapsedSeconds, 3);
      assert.equal(app.draft().participationSeconds["item-a"], 3);
      assert.equal(app.draft().pauseReason, "interrupted");
      assert.equal(app.timers.size, 0);
      app.tick(5); assert.equal(app.draft().elapsedSeconds, 3);
      app.click("Resume"); app.tick(1); assert.equal(app.draft().elapsedSeconds, 4);
      app.unmount();
    }
  });

  await check(`${name}: initial hide, Save & close and early finish preserve latest measured facts`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.visible(false);
    assert.equal(app.draft().elapsedSeconds, 0);
    assert(app.buttons().some((button) => text(button) === "Resume"));
    app.visible(true); app.click("Resume"); app.sample(2000, { flush: false });
    app.click("Save & close", false);
    assert.equal(app.draft().elapsedSeconds, 2);
    assert.deepEqual(app.closes, [true]);
    app.sample(2000, { flush: false });
    assert.equal(app.draft().elapsedSeconds, 2);
    app.flush(); app.click("Resume"); app.sample(1000, { flush: false });
    app.click("Finish early");
    assert.equal(app.facts.length, 1);
    assert.equal(app.facts[0].participationSeconds["item-a"], 3);
    assert.equal(app.saved.getItem(activeKey), null);
    app.tick(3); assert.equal(app.facts.length, 1);
    app.unmount();
  });
}

await check("interval overshoot never credits work from an unseen next interval", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(44); app.sample(3000);
  assert.equal(app.draft().intervalIndex, 1);
  assert.equal(app.draft().elapsedSeconds, 45);
  assert.equal(app.draft().intervalElapsedSeconds, 0);
  assert.equal(app.draft().participationSeconds["item-a"], 45);
  app.tick(15);
  assert.equal(app.draft().intervalIndex, 2);
  assert.equal(app.draft().elapsedSeconds, 60);
  assert.equal(app.draft().participationSeconds["item-b"], undefined);
  app.unmount();
});

await check("wake lock stays optional; denial does not stop measured foreground work", async () => {
  const app = createHost(storage(), { wakeLock: true });
  app.click("Start workout");
  assert.equal(app.wakeRequests.length, 1);
  app.wakeRequests[0].reject(new Error("Permission denied"));
  await app.drain(); app.tick(2);
  assert.equal(app.draft().elapsedSeconds, 2);
  assert(text(app.tree).includes("Keep this screen open"));
  app.unmount();
});

await check("accepted wake lock releases on hide; OS release updates status without an acquisition loop", async () => {
  const app = createHost(storage(), { wakeLock: true });
  app.click("Start workout");
  const first = sentinel(); app.wakeRequests[0].resolve(first); await app.drain();
  assert(text(app.tree).includes("Screen staying on"));
  first.releaseFromBrowser(); await app.drain();
  assert(text(app.tree).includes("Keep this screen open"));
  assert.equal(app.wakeRequests.length, 1);
  app.tick(2); assert.equal(app.draft().elapsedSeconds, 2);
  app.click("Pause"); app.click("Resume");
  assert.equal(app.wakeRequests.length, 2);
  const second = sentinel(); app.wakeRequests[1].resolve(second); await app.drain();
  app.visible(false, false);
  assert.equal(second.releaseCalls, 1, "Hidden event must release immediately, before React cleanup");
  app.flush(); app.visible(true);
  assert.equal(app.wakeRequests.length, 2, "Visibility alone must not resume or request screen access");
  app.unmount();
});

await check("a delayed wake lock resolves safely after pause, hide or unmount", async () => {
  for (const stop of ["pause", "hidden", "unmount"]) {
    const app = createHost(storage(), { wakeLock: true });
    app.click("Start workout");
    if (stop === "pause") app.click("Pause");
    else if (stop === "hidden") app.visible(false);
    else app.unmount();
    const late = sentinel(); app.wakeRequests[0].resolve(late);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(late.releaseCalls, 1, `Late request must release after ${stop}`);
    if (stop !== "unmount") { app.flush(); assert(!text(app.tree).includes("Screen staying on")); app.unmount(); }
    assert.equal(app.document.count(), 0);
    assert.equal(app.window.count(), 0);
  }
});

await check("a restored bfcache page pauses even if a hidden event was missed", () => {
  const app = createHost();
  app.click("Start workout"); app.tick(1);
  app.lifecycle("pageshow", { persisted: true }, false);
  assert.equal(app.draft().pauseReason, "interrupted");
  app.sample(10_000, { flush: false }); assert.equal(app.draft().elapsedSeconds, 1);
  app.flush(); assert.equal(app.timers.size, 0);
  app.unmount();
});

await check("native v1 and v2 recovery preserve original order, identifiers and measured facts", () => {
  for (const version of [1, 2]) {
    const saved = storage();
    const original = { version, athleteId: nativePlan.athleteId, planId: nativePlan.id,
      startedAt: "2026-10-18T09:00:00.000Z", elapsedSeconds: version === 1 ? 120 : 67,
      participationSeconds: { "item-a": version === 1 ? 90 : 52 },
      ...(version === 1 ? { currentIndex: 1 } : { intervalIndex: 2, intervalElapsedSeconds: 7,
        selections: {}, completedPlanItemIds: [] }),
    };
    saved.setItem(activeKey, JSON.stringify(original));
    const app = createHost(saved, { native: true });
    assert.equal(app.draft().version, 2);
    assert.equal(app.draft().planId, original.planId);
    assert.equal(app.draft().startedAt, original.startedAt);
    assert.deepEqual(app.draft().participationSeconds, original.participationSeconds);
    assert.equal(app.draft().intervalIndex, version === 1 ? 4 : 2);
    assert.equal(app.title(), version === 1 ? "B" : "A", "Native plan retains A2 before B1");
    assert.equal(app.timers.size, 0);
    app.click("Resume"); app.tick(1);
    assert.equal(app.draft().elapsedSeconds, original.elapsedSeconds + 1);
    app.visible(false); app.visible(true);
    app.click("Finish early");
    assert.equal(app.facts.length, 1);
    assert.equal(app.facts[0].startedAt, original.startedAt);
    assert.equal(app.saved.getItem(activeKey), null);
    app.unmount();
  }
});

await check("native completion keeps focused order and emits exactly one record with exact measured work", () => {
  const app = createHost(storage(), { native: true });
  app.click("Start workout"); app.tick(60);
  assert.equal(app.title(), "A");
  assert.equal(app.draft().intervalIndex, 2);
  app.tick(60); assert.equal(app.title(), "B");
  app.tick(nativePlan.intendedDurationSeconds - 120);
  assert.equal(app.facts.length, 1);
  assert.deepEqual([...app.facts[0].completedPlanItemIds].sort(), nativePlan.items.map((item) => item.id).sort());
  assert.deepEqual(app.facts[0].participationSeconds,
    { "item-a": 90, "item-b": 90, "item-c": 40, "item-d": 80, "item-e": 80 });
  assert.equal(app.saved.getItem(activeKey), null);
  app.tick(5); assert.equal(app.facts.length, 1);
  app.unmount();
});

for (const native of [false, true]) {
  await check(`${native ? "native" : "mixed"}: final boundary stays paused while hidden and completes exactly once after Resume`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.tick(plan.intendedDurationSeconds - 1);
    app.sample(1000, { flush: false }); app.lifecycle("pagehide", {}, false);
    assert.equal(app.draft().elapsedSeconds, plan.intendedDurationSeconds);
    assert.equal(app.facts.length, 0);
    app.flush(); app.tick(20);
    assert.equal(app.facts.length, 0);
    app.click("Resume");
    assert.equal(app.facts.length, 1);
    assert.equal(app.saved.getItem(activeKey), null);
    app.tick(5); assert.equal(app.facts.length, 1);
    app.unmount();
  });
}

await check("a stale wake request cannot replace the lock acquired after explicit Resume", async () => {
  const app = createHost(storage(), { wakeLock: true });
  app.click("Start workout"); app.click("Pause"); app.click("Resume");
  assert.equal(app.wakeRequests.length, 2);
  const current = sentinel(); app.wakeRequests[1].resolve(current); await app.drain();
  const stale = sentinel(); app.wakeRequests[0].resolve(stale); await app.drain();
  assert.equal(stale.releaseCalls, 1);
  assert.equal(current.releaseCalls, 0);
  assert(text(app.tree).includes("Screen staying on"));
  app.click("Pause"); assert.equal(current.releaseCalls, 1);
  app.unmount();
});

for (const native of [false, true]) {
  await check(`${native ? "native" : "mixed"}: stale callback between cursor commit and passive cleanup cannot credit the new interval`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.tick(44);
    const previousTimer = [...app.timers.values()][0].callback;
    let raced = false;
    app.beforeEffects = () => {
      if (raced || app.title() !== "Rest") return;
      raced = true;
      app.monotonic += 1000; app.wall += 1000;
      previousTimer();
    };
    app.sample(1000);
    assert(raced, "Race must run after the next cursor is committed, before old effect cleanup");
    assert.equal(app.draft().intervalIndex, 1);
    assert.equal(app.draft().intervalElapsedSeconds, 0);
    assert.equal(app.draft().elapsedSeconds, 45);
    assert.equal(app.draft().participationSeconds["item-a"], 45);
    app.tick(1);
    assert.equal(app.draft().intervalElapsedSeconds, 1);
    app.unmount();
  });
}

const pendingAuthorization = () => {
  const requests = [];
  const authorize = (request) => new Promise((resolve, reject) => requests.push({ request, resolve, reject }));
  return { requests, authorize };
};
for (const native of [false, true]) {
  const name = native ? "native" : "mixed";
  await check(`${name}: first Start and every Resume await one current safety decision`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize });
    app.change("item-e");
    app.click("Start workout", false); app.click("Start workout", false); app.flush();
    assert.equal(gate.requests.length, 1, "Rapid duplicate taps must share the same request");
    assert.deepEqual(gate.requests[0].request.selections, { "item-e": option });
    assert.deepEqual(new Set(gate.requests[0].request.planItemIds), new Set(plan.items.map((item) => item.id)));
    app.tick(3); assert.equal(app.starts, 0); assert.equal(app.draft(), null);
    assert(text(app.tree).includes("Checking safety…"));
    for (const label of ["Previous interval", "Skip interval", "Finish early", "Change"]) {
      assert(app.buttons().filter((button) => text(button) === label).every((button) => button.props.disabled),
        `${label} must not change a pending authorization request`);
    }
    gate.requests[0].resolve(true); await app.drain();
    assert.equal(app.starts, 1); app.tick(3); assert.equal(app.draft().elapsedSeconds, 3);
    app.click("Pause"); const checkpoint = JSON.stringify(app.draft());
    app.click("Resume"); assert.equal(gate.requests.length, 2); app.tick(3);
    assert.equal(JSON.stringify(app.draft()), checkpoint);
    gate.requests[1].resolve(true); await app.drain(); app.tick(2);
    assert.equal(app.draft().elapsedSeconds, 5);
    assert.equal(app.starts, 1, "Resume must not create another workout start");
    app.unmount();
  });
  await check(`${name}: rejected and failed safety checks keep measured facts paused`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize });
    app.click("Start workout"); gate.requests[0].resolve(true); await app.drain(); app.tick(5); app.click("Pause");
    const checkpoint = JSON.stringify(app.draft());
    app.click("Resume"); gate.requests[1].resolve(false); await app.drain(); app.tick(3);
    assert.equal(JSON.stringify(app.draft()), checkpoint);
    assert(text(app.tree).includes("Your place is kept"));
    app.click("Resume"); gate.requests[2].reject(new Error("Safety check unavailable")); await app.drain(); app.tick(3);
    assert.equal(JSON.stringify(app.draft()), checkpoint);
    assert(text(app.tree).includes("Safety check unavailable"));
    assert.equal(app.facts.length, 0);
    app.unmount();
  });
  await check(`${name}: hide and unmount invalidate late safety approvals`, async () => {
    for (const leave of ["hidden", "pagehide", "unmount"]) {
      const gate = pendingAuthorization();
      const app = createHost(storage(), { native, onBeforeRun: gate.authorize });
      app.click("Start workout");
      if (leave === "hidden") { app.visible(false); app.visible(true); }
      else if (leave === "pagehide") app.lifecycle("pagehide");
      else app.unmount();
      gate.requests[0].resolve(true);
      await Promise.resolve(); await Promise.resolve();
      if (leave !== "unmount") { app.flush(); app.tick(3); }
      assert.equal(app.starts, 0); assert.equal(app.saved.getItem(activeKey), null);
      app.unmount();
    }
  });
  await check(`${name}: changed safety pauses running work and every continuation is checked`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize, safetyVersion: "original" });
    app.click("Start workout"); gate.requests[0].resolve(true); await app.drain(); app.tick(3);
    app.props = { ...app.props, safetyVersion: "new-restriction" }; app.flush();
    const checkpoint = JSON.stringify(app.draft()); app.tick(3);
    assert.equal(JSON.stringify(app.draft()), checkpoint);
    assert(app.buttons().some((button) => text(button) === "Resume"));
    app.click("Resume"); assert.equal(gate.requests.length, 2);
    gate.requests[1].resolve(false); await app.drain(); app.tick(3);
    assert.equal(JSON.stringify(app.draft()), checkpoint);
    app.unmount();
  });
  await check(`${name}: a safety update invalidates a pending grant`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize, safetyVersion: "original" });
    app.click("Start workout");
    app.props = { ...app.props, safetyVersion: "new-restriction" }; app.flush();
    gate.requests[0].resolve(true); await app.drain(); app.tick(3);
    assert.equal(app.starts, 0); assert.equal(app.draft(), null);
    app.click("Start workout"); assert.equal(gate.requests.length, 2);
    gate.requests[1].resolve(true); await app.drain(); app.tick(2);
    assert.equal(app.starts, 1); assert.equal(app.draft().elapsedSeconds, 2);
    app.unmount();
  });
}

for (const native of [false, true]) {
  const name = native ? "native" : "mixed";
  await check(`${name}: a failed mid-tick checkpoint stops immediately and explicit retry keeps the newest facts`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.tick(5);
    const staleSkip = app.buttons().find(button => text(button) === "Skip interval").props.onClick;
    const staleFinish = app.buttons().find(button => text(button) === "Finish early").props.onClick;
    app.saved.failWrites = true;
    app.sample(1000, { flush: false });
    assert.equal(app.draft().elapsedSeconds, 5, "Failed write leaves only the earlier durable checkpoint");
    app.sample(2000, { flush: false }); staleSkip(); staleFinish();
    app.flush();
    assert.equal(app.title(), "A");
    assert(text(app.tree).includes("could not be saved on this device"));
    assert.equal(app.timers.size, 0);
    for (const label of ["Resume", "Previous interval", "Skip interval", "Finish early", "Change"]) {
      assert(app.buttons().filter(button => text(button) === label).every(button => button.props.disabled));
    }
    app.click("Save & close"); assert.deepEqual(app.closes, [], "Close must retain the only copy of unsaved facts");
    const failedAttempts = app.saved.writeAttempts;
    app.tick(5); app.flush();
    assert.equal(app.saved.writeAttempts, failedAttempts, "Failure stays latched until an explicit retry");
    app.click("Retry saving progress");
    assert(text(app.tree).includes("could not be saved on this device"), "A failed retry remains actionable");
    app.saved.failWrites = false;
    app.click("Retry saving progress");
    assert.equal(app.draft().elapsedSeconds, 6, "Retry saves the measured second that initially failed");
    assert.equal(app.draft().intervalElapsedSeconds, 6);
    assert.equal(app.draft().participationSeconds["item-a"], 6);
    assert(!text(app.tree).includes("Retry saving progress"));
    assert.equal(app.timers.size, 0, "Saving cannot implicitly resume exercise");
    app.tick(10); assert.equal(app.draft().elapsedSeconds, 6);
    app.click("Resume"); app.tick(2); app.click("Finish early");
    assert.equal(app.facts.length, 1);
    assert.equal(app.facts[0].participationSeconds["item-a"], 8);
    assert.equal(app.saved.getItem(activeKey), null);
    app.tick(3); assert.equal(app.facts.length, 1);
    app.unmount();
  });
  await check(`${name}: failed hidden checkpoint preserves the last pending tick and remains paused on return`, () => {
    const app = createHost(storage(), { native });
    app.click("Start workout"); app.tick(5);
    app.sample(1000, { flush: false });
    app.saved.failWrites = true; app.visible(false, false); app.flush();
    assert.equal(app.timers.size, 0);
    app.sample(60_000); app.visible(true);
    assert(text(app.tree).includes("Retry saving progress"));
    app.click("Save & close"); assert.deepEqual(app.closes, []);
    app.saved.failWrites = false; app.click("Retry saving progress");
    assert.equal(app.draft().elapsedSeconds, 6);
    assert.equal(app.draft().participationSeconds["item-a"], 6);
    assert.equal(app.draft().pauseReason, "hidden");
    assert.equal(app.timers.size, 0);
    app.click("Save & close"); assert.deepEqual(app.closes, [true]);
    app.unmount();
  });
  await check(`${name}: a failed first checkpoint preserves the start and cannot credit unsaved running time`, () => {
    const saved = storage(); saved.failWrites = true;
    const app = createHost(saved, { native });
    app.click("Start workout");
    assert.equal(app.starts, 1);
    assert.equal(app.draft(), null);
    assert.equal(app.timers.size, 0);
    assert(text(app.tree).includes("Retry saving progress"));
    app.tick(10); app.click("Save & close"); assert.deepEqual(app.closes, []);
    saved.failWrites = false; app.click("Retry saving progress");
    assert.equal(app.draft().elapsedSeconds, 0);
    assert.deepEqual(app.draft().participationSeconds, {});
    if (!native) assert.deepEqual(app.draft().lockedPlanItemIds, ["item-a", "item-b"]);
    const firstStart = app.draft().startedAt;
    app.click("Resume"); app.tick(1);
    assert.equal(app.starts, 1);
    assert.equal(app.draft().startedAt, firstStart);
    assert.equal(app.draft().participationSeconds["item-a"], 1);
    app.unmount();
  });
  await check(`${name}: rejected completion stays visible and retries all completed facts once`, () => {
    const app = createHost(storage(), { native });
    const attempts = [];
    let accept = false;
    app.props = { ...app.props, onFinish: facts => { attempts.push(facts); if (!accept) return false; app.facts.push(facts); return true; } };
    app.flush(); app.click("Start workout"); app.tick(plan.intendedDurationSeconds);
    assert.equal(attempts.length, 1);
    assert.equal(app.facts.length, 0);
    assert(text(app.tree).includes("completed work could not be saved for review"));
    assert.equal(app.timers.size, 0);
    app.tick(5); assert.equal(attempts.length, 1, "Failure must not retry completion repeatedly");
    app.click("Save & close"); assert.deepEqual(app.closes, []);
    app.click("Retry saving progress");
    assert.equal(app.timers.size, 0);
    accept = true; app.click("Finish workout");
    assert.equal(app.facts.length, 1);
    assert.deepEqual(app.facts[0].participationSeconds, attempts[0].participationSeconds);
    assert.deepEqual(app.facts[0].completedPlanItemIds, attempts[0].completedPlanItemIds, "Retry must retain the naturally finished final item");
    assert.equal(app.saved.getItem(activeKey), null);
    app.tick(5); assert.equal(app.facts.length, 1);
    app.unmount();
  });
}

for (const native of [false, true]) await check(`${native ? "native" : "mixed"}: an older open player cannot overwrite newer measured progress`, () => {
  const saved = storage(), active = createHost(saved, { native });
  active.click("Start workout"); active.tick(5);
  const stale = createHost(saved, { native });
  active.tick(3);
  const newer = saved.getItem(activeKey);
  stale.click("Resume");
  assert.equal(saved.getItem(activeKey), newer, "Stale paused state must never overwrite newer measured seconds");
  assert(text(stale.tree).includes("another open view"));
  assert.equal(stale.timers.size, 0);
  stale.click("Retry saving progress");
  assert.equal(saved.getItem(activeKey), newer, "Retry must not turn a stale view into the writer");
  active.unmount(); stale.unmount();
});

for (const native of [false, true]) {
  const name = native ? "native" : "mixed";
  await check(`${name}: removed recovery cannot be resurrected by a stale player`, () => {
    const saved = storage(), app = createHost(saved, { native });
    app.click("Start workout"); app.tick(5); app.click("Pause"); saved.removeItem(activeKey);
    app.click("Resume"); assert.equal(saved.getItem(activeKey), null); assert.equal(app.timers.size, 0);
    app.click("Retry saving progress"); assert.equal(saved.getItem(activeKey), null);
    app.unmount();
  });
  await check(`${name}: storage event pauses immediately and preserves another view's newer recovery`, () => {
    const saved = storage(), app = createHost(saved, { native }); app.click("Start workout"); app.tick(5);
    const newer = JSON.stringify({ ...app.draft(), elapsedSeconds: 7, intervalElapsedSeconds: 7, participationSeconds: { "item-a": 7 } });
    saved.setItem(activeKey, newer); app.lifecycle("storage", { key: activeKey });
    assert.equal(app.timers.size, 0); app.tick(3); assert.equal(saved.getItem(activeKey), newer);
    assert(text(app.tree).includes("another open view")); app.unmount();
  });
  await check(`${name}: another view's start invalidates a pending first authorization`, async () => {
    const gate = pendingAuthorization(), saved = storage(), app = createHost(saved, { native, onBeforeRun: gate.authorize });
    app.click("Start workout"); const newer = JSON.stringify({ version: native ? 2 : 3, planId: "newer-plan", elapsedSeconds: 8 });
    saved.setItem(activeKey, newer); gate.requests[0].resolve(true); await app.drain();
    assert.equal(app.starts, 0); assert.equal(app.timers.size, 0); assert.equal(saved.getItem(activeKey), newer);
    app.unmount();
  });
  await check(`${name}: interval-transition write failure retains and restores the exact next cursor`, () => {
    const saved = storage(), app = createHost(saved, { native }); app.click("Start workout"); app.tick(44);
    let failed = false;
    app.beforeEffects = () => { if (!failed && app.title() === "Rest") { failed = true; saved.failWrites = true; } };
    app.tick(1); assert(failed); assert.equal(app.timers.size, 0);
    assert.equal(app.draft().intervalIndex, 0); assert.equal(app.draft().intervalElapsedSeconds, 45);
    saved.failWrites = false; app.click("Retry saving progress");
    assert.equal(app.draft().intervalIndex, 1); assert.equal(app.draft().intervalElapsedSeconds, 0); assert.equal(app.draft().elapsedSeconds, 45);
    app.unmount(); const reloaded = createHost(saved, { native });
    assert.equal(reloaded.title(), "Rest"); assert.equal(reloaded.timers.size, 0);
    reloaded.click("Resume"); reloaded.tick(1); assert.equal(reloaded.draft().elapsedSeconds, 46);
    assert.equal(reloaded.draft().participationSeconds["item-a"], 45); reloaded.unmount();
  });
  await check(`${name}: completion cleanup cannot delete a new recovery written during handoff`, () => {
    const saved = storage(), app = createHost(saved, { native }); app.click("Start workout"); app.tick(5);
    const newer = JSON.stringify({ version: native ? 2 : 3, planId: "newer-workout", elapsedSeconds: 3 });
    app.props = { ...app.props, onFinish: () => { saved.setItem(activeKey, newer); return true; } }; app.flush(); app.click("Finish early");
    assert.equal(saved.getItem(activeKey), newer); app.unmount();
  });
  await check(`${name}: unreadable initial storage shows a blocked player instead of throwing or replacing unknown work`, () => {
    const saved = storage(), getItem = saved.getItem;
    saved.getItem = () => { throw new Error("Unavailable storage"); };
    const app = createHost(saved, { native }); assert.equal(app.starts, 0); assert.equal(app.timers.size, 0);
    saved.getItem = getItem; app.click("Retry saving progress");
    assert(text(app.tree).includes("could not be read")); assert.equal(app.starts, 0); assert.equal(saved.getItem(activeKey), null);
    app.unmount();
  });
}

await check("generator 5 player and restored draft retain explicit exit targets and native rest", () => {
  const realBundle = load("app/vnext/production/trainingQuality.ts").trainingQualityCatalogue.bundle;
  const exit = realBundle.exercises.find(e => e.id === "grounded-side-exit-rehearsal");
  const variant = exit.prescriptionVariants[0];
  const dosePlan = { ...plan, generatorPolicyVersion: 5, intendedDurationSeconds: 180,
    items: [{ ...plan.items[0], purpose: "primary-development", exerciseId: exit.id,
      exerciseDefinitionVersion: exit.definitionVersion, prescriptionVariantId: variant.id,
      plannedSeconds: 180, demand: variant.demand }] };
  const saved = storage(), options = { plan: dosePlan, bundle: realBundle };
  const app = createHost(saved, options);
  assert(text(app.tree).includes("1–2 controlled exits per side"));
  assert(!text(app.tree).includes("6–12 reps"));
  app.click("Start workout"); app.tick(10); app.click("Pause");
  const before = app.draft(); app.unmount();
  const reopened = createHost(saved, options);
  assert.equal(reopened.draft().elapsedSeconds, before.elapsedSeconds);
  assert(text(reopened.tree).includes("1–2 controlled exits per side"));
  const timeline = mixed.workoutExecutionTimeline(dosePlan, realBundle);
  assert.equal(timeline.filter(i => i.kind === "rest").reduce((sum, i) => sum + i.durationSeconds, 0), 90);
  reopened.unmount();
});

await check("generator 6 Pike practice preserves three sets, target, rest, paused recovery and measured-only completion", () => {
  const realBundle = load("app/vnext/production/trainingQuality.ts").trainingQualityCatalogue.bundle;
  const exercise = realBundle.exercises.find(e => e.id === "pike-elevation");
  const variant = exercise.prescriptionVariants[0];
  const dosePlan = { ...plan, generatorPolicyVersion: 6, intendedDurationSeconds: 180,
    items: [{ ...plan.items[0], purpose: "primary-development", exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id,
      plannedSeconds: 180, demand: variant.demand }] };
  const saved = storage(), options = { plan: dosePlan, bundle: realBundle };
  const app = createHost(saved, options);
  assert(text(app.tree).includes("3 sets")); assert(text(app.tree).includes("8–12 reps"));
  app.click("Start workout"); app.tick(30);
  assert.equal(app.title(), "Rest"); assert(text(app.tree).includes("8–12 reps"));
  app.click("Pause"); const before = app.draft(); app.unmount();
  const reopened = createHost(saved, options);
  assert.equal(reopened.draft().elapsedSeconds, before.elapsedSeconds);
  assert.equal(reopened.timers.size, 0);
  reopened.click("Resume"); reopened.tick(150);
  assert.equal(reopened.facts.length, 1);
  assert.equal(reopened.facts[0].participationSeconds[dosePlan.items[0].id], 90);
  assert.equal(reopened.saved.getItem(activeKey), null);
  reopened.unmount();
});

for (const native of [false, true]) {
  const name = native ? "native" : "mixed";
  await check(`${name}: one tap from Today auto-starts once through the normal safety check`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize, autoStart: true });
    app.flush(); app.flush();
    assert.equal(gate.requests.length, 1, "Auto-start must request exactly one safety decision");
    assert.deepEqual(new Set(gate.requests[0].request.planItemIds), new Set(plan.items.map((item) => item.id)));
    assert.equal(app.starts, 0, "Nothing starts before the safety check passes");
    assert(text(app.tree).includes("Checking safety…"));
    gate.requests[0].resolve(true); await app.drain();
    assert.equal(app.starts, 1); app.tick(3);
    assert.equal(app.draft().elapsedSeconds, 3);
    app.click("Pause"); app.flush();
    assert.equal(gate.requests.length, 1, "Pausing must not trigger another automatic start");
    app.unmount();
  });
  await check(`${name}: a rejected auto-start safety check leaves Start available and saves nothing`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize, autoStart: true });
    gate.requests[0].reject(new Error("This workout is no longer suitable.")); await app.drain();
    assert.equal(app.starts, 0); assert.equal(app.draft(), null); assert.equal(app.timers.size, 0);
    assert(app.buttons().some((button) => text(button) === "Start workout" && !button.props.disabled));
    app.unmount();
  });
  await check(`${name}: a restored draft never auto-starts and waits for an explicit Resume`, () => {
    const first = createHost(storage(), { native });
    first.click("Start workout"); first.tick(7); first.click("Pause");
    const before = first.draft(); first.unmount();
    const reopened = createHost(first.saved, { native, autoStart: true });
    reopened.flush();
    assert.deepEqual(reopened.draft(), before);
    assert.equal(reopened.timers.size, 0, "A restored workout must stay paused");
    assert.equal(reopened.starts, 0);
    assert(reopened.buttons().some((button) => text(button) === "Resume"));
    reopened.unmount();
  });
  await check(`${name}: skipping a running rest starts the next work interval without a new safety check`, async () => {
    const gate = pendingAuthorization();
    const app = createHost(storage(), { native, onBeforeRun: gate.authorize });
    app.click("Start workout"); gate.requests[0].resolve(true); await app.drain();
    const timeline = native
      ? workout.structureWorkoutPlan(nativePlan, bundle).flatMap((item) => item.intervals)
      : mixed.workoutExecutionTimeline(plan, bundle);
    const firstRest = timeline.findIndex((interval) => interval.kind === "rest");
    app.tick(timeline.slice(0, firstRest).reduce((sum, interval) => sum + interval.durationSeconds, 0) + 1);
    assert.equal(app.draft().intervalIndex, firstRest); assert.equal(app.title(), "Rest");
    const workBefore = { ...app.draft().participationSeconds };
    app.click("Skip interval");
    assert.equal(gate.requests.length, 1, "Skip inside an authorised running workout needs no new check");
    assert.equal(app.draft().intervalIndex, firstRest + 1);
    assert.notEqual(app.title(), "Rest");
    app.tick(4);
    const next = timeline[firstRest + 1];
    assert.equal(app.draft().participationSeconds[next.planItemId] - (workBefore[next.planItemId] ?? 0), 4,
      "The next work interval is measured from the skip onwards");
    app.unmount();
  });
}

console.log(`Workout reliability: ${checks} actual player/hook/controller lifecycle scenarios passed.`);
