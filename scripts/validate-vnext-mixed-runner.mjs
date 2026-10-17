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
    if (name === "../mixedWorkout") return mixed;
    if (name === "./useWorkoutClock" || name === "./workoutClock") {
      return componentModule(resolve(dirname(sourcePath), `${name}.ts`));
    }
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
  owner.props = { plan: options.native ? nativePlan : plan, bundle, origin: "custom", initialSelections: {}, swapOptions,
    onStart: () => { owner.starts++; }, onFinish: (facts) => { owner.facts.push(facts); }, onClose: (started) => owner.closes.push(started) };
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

console.log(`Workout reliability: ${checks} actual player/hook/controller lifecycle scenarios passed.`);
