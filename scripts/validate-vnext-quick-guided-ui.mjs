import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// Run the real component handlers and foreground-clock hook. Only the React
// host, browser surfaces and media rendering are replaced; protocol definitions,
// result construction and timer/interruption behavior are the production code.
const { experiencedPlacementCatalogue } = load("app/vnext/production/experiencedPlacement.ts");
const { guidedTestPresentation } = load("app/vnext/assessment/presentation.ts");
const bundle = experiencedPlacementCatalogue.bundle;
let host;
const sameDeps = (left, right) => left && right && left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]));
const hooks = {
  useState(initial) {
    const owner = host;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [owner.slots[index].value, (next) => {
      const value = typeof next === "function" ? next(owner.slots[index].value) : next;
      if (!Object.is(value, owner.slots[index].value)) { owner.slots[index].value = value; owner.dirty = true; }
    }];
  },
  useRef(initial) { const index = host.cursor++; return (host.slots[index] ??= { current: initial }); },
  useMemo(factory, deps) {
    const index = host.cursor++;
    const previous = host.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) host.slots[index] = { deps, value: factory() };
    return host.slots[index].value;
  },
  useEffect(effect, deps) {
    const owner = host;
    const index = owner.cursor++;
    const previous = owner.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) owner.effects.push(() => {
      previous?.cleanup?.();
      owner.slots[index] = { deps, cleanup: effect() };
    });
  },
};
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
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
    if (name === "../assessment/presentation") return { guidedTestPresentation };
    if (name === "../media/VNextMotionGuide") return { VNextMotionGuide: "OwnedMotionGuide" };
    if (name === "../media/deferredMotion") return { DeferredMotionGuide: "OwnedMotionGuide" };
    if (name.endsWith(".css")) return {};
    if (name === "./useWorkoutClock" || name === "./workoutClock" || name === "./guidedTimerAudio") return componentModule(resolve(dirname(sourcePath), `${name}.ts`));
    throw new Error(`Unexpected guided-check import ${name}`);
  });
  return module.exports;
};
const { GuidedTestRunner } = componentModule("app/vnext/releaseCandidate/GuidedTestRunner.tsx");
const text = (node) => Array.isArray(node) ? node.map(text).join("")
  : node && typeof node === "object" ? text(node.props?.children)
    : node === undefined || node === null || typeof node === "boolean" ? "" : String(node);
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node && typeof node === "object" ? [node, ...elements(node.props?.children)] : [];
const eventTarget = () => {
  const groups = new Map();
  return {
    addEventListener(type, callback) { const group = groups.get(type) ?? new Set(); group.add(callback); groups.set(type, group); },
    removeEventListener(type, callback) { groups.get(type)?.delete(callback); },
    emit(type, event = {}) { for (const callback of [...(groups.get(type) ?? [])]) callback(event); },
    count: () => [...groups.values()].reduce((sum, group) => sum + group.size, 0),
  };
};
const originalGlobals = Object.fromEntries(["window", "document", "navigator", "performance"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalNow = Date.now;
const protocolFor = (kind) => {
  const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.metric.kind === kind);
  assert(protocol, `Missing authored ${kind} protocol`);
  return protocol;
};
const createHost = (kind, options = {}) => {
  const owner = { slots: [], cursor: 0, effects: [], dirty: true, key: undefined, tree: undefined,
    timers: new Map(), serial: 0, commits: [], closes: 0, wakeRequests: [], audio: [], audioContexts: [], audioResumes: 0, monotonic: 0, wall: 1_792_281_600_000,
    document: { ...eventTarget(), visibilityState: "visible" }, window: eventTarget(), protocol: protocolFor(kind) };
  owner.navigator = options.wakeLock ? { wakeLock: { request(type) {
    assert.equal(type, "screen");
    const events = eventTarget();
    const sentinel = { ...events, released: false,
      async release() { sentinel.released = true; events.emit("release"); } };
    owner.wakeRequests.push(sentinel);
    return Promise.resolve(sentinel);
  } } } : {};
  owner.props = { offer: { protocolId: owner.protocol.id, availability: "available" }, bundle,
    onCommit: (result) => owner.commits.push(result), onClose: () => { owner.closes++; } };
  Object.assign(owner.window, {
    setInterval(callback) { const id = ++owner.serial; owner.timers.set(id, callback); return id; },
    clearInterval(id) { owner.timers.delete(id); },
  });
  if (options.audio) owner.window.AudioContext = class {
    constructor() { owner.audioContexts.push(this); }
    state = options.suspendedAudio ? "suspended" : "running";
    currentTime = 0;
    destination = {};
    resume() { owner.audioResumes++; return new Promise(resolve => { owner.resumeAudio = () => { this.state = "running"; resolve(); }; }); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() {
      const node = { frequency: {}, connect() {}, disconnect() {}, start(time) { node.started = time; },
        stop(time) { if (time === undefined) { node.cancelled = true; node.onended?.(); } else node.end = time; } };
      owner.audio.push(node); return node;
    }
  };
  const install = () => {
    host = owner;
    for (const [key, value] of Object.entries({ window: owner.window, document: owner.document, navigator: owner.navigator, performance: { now: () => owner.monotonic } })) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    Date.now = () => owner.wall;
  };
  owner.cleanup = () => { install(); for (const item of owner.slots) item?.cleanup?.(); };
  owner.flush = () => {
    install();
    let passes = 0;
    do {
      assert(++passes < 30, "Guided-check effects must settle");
      owner.dirty = false; owner.cursor = 0; owner.effects = [];
      const wrapper = GuidedTestRunner(owner.props);
      if (wrapper.key !== owner.key) { owner.cleanup(); owner.slots = []; owner.key = wrapper.key; }
      owner.tree = wrapper.type(wrapper.props);
      for (const effect of owner.effects) effect();
    } while (owner.dirty);
  };
  owner.drain = async () => { install(); await Promise.resolve(); await Promise.resolve(); owner.flush(); };
  owner.button = (label) => elements(owner.tree).find((node) => node.type === "button" && text(node).includes(label));
  owner.click = (label) => {
    install(); const button = owner.button(label); assert(button, `Missing button: ${label}`);
    assert(!button.props.disabled, `Disabled button: ${label}`); button.props.onClick(); owner.flush();
  };
  owner.input = (label, value) => {
    install(); const field = elements(owner.tree).find((node) => node.type === "label" && text(node).startsWith(label));
    assert(field, `Missing field: ${label}`); elements(field).find((node) => node.type === "input").props.onChange({ target: { value } }); owner.flush();
  };
  owner.choose = (label) => {
    install(); const field = elements(owner.tree).find((node) => node.type === "label" && text(node).startsWith(label));
    assert(field, `Missing choice: ${label}`); elements(field).find((node) => node.type === "input").props.onChange(); owner.flush();
  };
  owner.sample = (milliseconds, wallMilliseconds = milliseconds) => {
    install(); owner.monotonic += milliseconds; owner.wall += wallMilliseconds;
    for (const callback of [...owner.timers.values()]) callback(); owner.flush();
  };
  owner.tick = (seconds) => { for (let quarter = 0; quarter < seconds * 4; quarter++) owner.sample(250); };
  owner.visible = (visible) => { install(); owner.document.visibilityState = visible ? "visible" : "hidden"; owner.document.emit("visibilitychange"); owner.flush(); };
  owner.lifecycle = (type, event) => { install(); owner.window.emit(type, event); owner.flush(); };
  owner.timer = () => text(elements(owner.tree).find((node) => node.props?.role === "timer"));
  owner.flush();
  return owner;
};
let checks = 0;
const check = (kind, run) => {
  const app = createHost(kind);
  try { run(app); checks++; }
  finally { app.cleanup(); assert.equal(app.timers.size, 0, "Unmount releases timer"); assert.equal(app.document.count() + app.window.count(), 0, "Unmount releases event listeners"); }
};
try {
  check("repetitions", (app) => {
    assert.equal(app.commits.length, 0);
    assert(!elements(app.tree).some((node) => node.type === "input" && node.props.checked));
    app.click("I did exactly");
    assert.deepEqual(app.commits[0], { outcome: "clean", measurement: { value: app.protocol.metric.minimum, unit: "repetitions" }, qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true });
  });
  check("repetitions", (app) => {
    app.click("Different result"); app.choose("Clean");
    assert.equal(app.button("Confirm clean result").props.disabled, true);
    app.input("Reps completed", "2.5"); assert.equal(app.button("Confirm clean result").props.disabled, true);
    app.choose("Partial"); assert.equal(app.button("Save result").props.disabled, true);
    app.input("Reps completed", "2"); app.click("Save result");
    assert.deepEqual(app.commits[0], { outcome: "partial", measurement: { value: 2, unit: "repetitions" }, qualityCriteriaSatisfied: false, safetyCriteriaSatisfied: false });
  });
  check("repetitions", (app) => {
    app.click("Different result"); app.choose("Not yet"); app.click("Save result");
    assert.equal(app.commits[0].measurement, undefined, "Blank measurement must not become zero");
  });
  check("successful-attempts", (app) => {
    assert.equal(app.button("Both counts").props.disabled, true);
    app.input("Successful attempts", String(app.protocol.metric.minimumSuccessful));
    assert.equal(app.button("Both counts").props.disabled, true);
    app.input("Total attempts", String(app.protocol.metric.minimumSuccessful - 1));
    assert.equal(app.button("Both counts").props.disabled, true);
    app.input("Total attempts", String(app.protocol.metric.maximumAttempts + 1));
    assert.equal(app.button("Both counts").props.disabled, true);
    app.input("Total attempts", String(app.protocol.metric.maximumAttempts)); app.click("Both counts");
    assert.deepEqual(app.commits[0].measurement, { value: app.protocol.metric.minimumSuccessful, unit: "attempts", attemptsTotal: app.protocol.metric.maximumAttempts });
  });
  check("successful-attempts", (app) => {
    app.props = { ...app.props, retryingExactObservation: true, onCorrectInvalidEntry: () => { app.correctRequested = true; } }; app.flush();
    assert(!app.button("Retry saving this result"), "Known invalid entry must not offer an ineffective retry");
    app.click("Correct saved entry"); assert.equal(app.correctRequested, true);
    const old = { outcome: "not-yet", measurement: { value: 0, unit: "attempts", attemptsTotal: 0 }, qualityCriteriaSatisfied: false, safetyCriteriaSatisfied: false, notes: "Original note" };
    app.props = { ...app.props, initialResult: old, retryingExactObservation: false, onCorrectInvalidEntry: undefined }; app.flush();
    assert.equal(app.button("Save corrected entry").props.disabled, true);
    assert.equal(app.commits.length, 0, "Opening correction never saves or guesses numbers");
    app.input("Successful attempts", "2"); app.input("Total attempts", "3"); app.click("Save corrected entry");
    assert.deepEqual(app.commits[0], { ...old, measurement: { value: 2, unit: "attempts", attemptsTotal: 3 } });
  });
  check("successful-attempts", (app) => {
    app.props = { ...app.props, initialResult: { outcome: "not-yet", measurement: { value: 0, unit: "attempts", attemptsTotal: 0 }, qualityCriteriaSatisfied: false, safetyCriteriaSatisfied: false } }; app.flush();
    app.props = { ...app.props, onNoAttempt: () => { app.noAttemptFinishes = (app.noAttemptFinishes ?? 0) + 1; } }; app.flush();
    app.click("No attempt made");
    assert.equal(app.commits.length, 0, "Choosing no attempt does not fabricate a failed performance");
    assert(text(app.tree).includes("No result, training load or change to your progress will be saved"));
    const finish = app.button("Finish without a result");
    finish.props.onClick(); finish.props.onClick(); app.flush();
    assert.equal(app.noAttemptFinishes, 1, "Double tap finishes locally once");
    assert.equal(app.commits.length, 0, "No attempt never reaches evidence append");
  });
  check("range", (app) => {
    app.click("I met this target");
    assert.deepEqual(app.commits[0], { outcome: "clean", qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true });
  });
  check("duration-seconds", (app) => {
    app.props = { ...app.props, onNoAttempt: () => { app.noAttemptFinishes = (app.noAttemptFinishes ?? 0) + 1; } }; app.flush();
    app.click("Different result");
    app.input("Seconds completed", "2");
    app.click("No attempt made");
    app.click("Enter an attempted result");
    assert(text(app.tree).includes("Seconds completed"), "Returning to a real attempt retains its measured form");
    app.click("No attempt made");
    app.props = { ...app.props, busy: true }; app.flush();
    assert.equal(app.button("Finish without a result").props.disabled, true);
    app.props = { ...app.props, busy: false }; app.flush();
    app.click("Finish without a result");
    assert.equal(app.noAttemptFinishes, 1);
    assert.equal(app.commits.length, 0, "An unattempted timed check cannot manufacture zero or failed evidence");
  });
  check("duration-seconds", (app) => {
    app.click("Pain or instability");
    assert.deepEqual(app.commits[0], { outcome: "symptom", qualityCriteriaSatisfied: false, safetyCriteriaSatisfied: false });
    app.props = { ...app.props, retryingExactObservation: true }; app.flush();
    assert(app.button("Retry saving this result"));
    assert(!app.button("I held exactly"), "Prepared retry must hide fresh result actions");
    assert(!app.button("Use "), "Prepared retry must not invite another physical check");
  });
  check("repetitions", (app) => {
    let discards=0;
    app.props={...app.props,onDiscardUnsavedResult:()=>{discards++;}};app.flush();
    assert(!app.button("Discard unsaved result"),'A fresh check must not offer pending-entry removal');
    app.props={...app.props,retryingExactObservation:true,error:'Current safety changed. The entry is kept.'};app.flush();
    app.click('Discard unsaved result');
    assert.equal(discards,0,'Opening confirmation cannot discard the result');
    assert(text(app.tree).includes('An unsaved result will not count toward progress'));
    assert(text(app.tree).includes('Any result already saved stays in your progress'));
    app.click('Keep result');
    assert.equal(discards,0);
    assert(app.button('Retry saving this result'),'Cancel keeps exact retry available');
    app.click('Discard unsaved result');
    app.props={...app.props,busy:true};app.flush();
    assert(app.button('Discard pending result').props.disabled);
    assert(app.button('Keep result').props.disabled);
    app.props={...app.props,busy:false};app.flush();
    const confirm=app.button('Discard pending result').props.onClick;
    confirm();confirm();app.flush();
    assert.equal(discards,1,'Double taps request one local discard');
    assert.equal(app.commits.length,0,'Discard never submits a fabricated result');
    // Failed removal retains the same pending form and permits an explicit retry.
    app.props={...app.props,busy:true};app.flush();
    app.props={...app.props,busy:false,error:'Pending entry could not be removed.'};app.flush();
    app.click('Discard pending result');
    assert.equal(discards,2);
    assert.equal(app.commits.length,0);
  });
  check("repetitions", (app) => {
    app.click("Different result"); app.input("Reps completed", "5"); app.choose("Partial");
    const next = protocolFor("successful-attempts");
    app.props = { ...app.props, offer: { protocolId: next.id, availability: "available" } }; app.flush();
    assert.equal(app.button("Both counts").props.disabled, true, "Next protocol must not retain previous form values");
  });
  check("duration-seconds", (app) => {
    app.click("Use "); assert.equal(app.timer(), "Get ready3s"); app.tick(3);
    assert.equal(app.timer(), `Hold${app.protocol.metric.minimum}s`, "Preparation must not count as hold time");
    app.tick(app.protocol.metric.minimum); assert.equal(app.timer(), "");
    assert(text(app.tree).includes("Timer finished.")); assert.equal(app.commits.length, 0, "Timer never auto-awards evidence");
    app.click("I held exactly"); assert.equal(app.commits[0].measurement.value, app.protocol.metric.minimum);
  });
  check("duration-seconds", (app) => {
    app.click("Use "); app.tick(5); app.visible(false); app.sample(60_000); app.visible(true);
    assert(text(app.tree).includes("Interrupted time cannot be added together.")); assert.equal(app.timer(), "");
    assert.equal(app.commits.length, 0); app.click("Start a new timer"); app.tick(3);
    assert.equal(app.timer(), `Hold${app.protocol.metric.minimum}s`, "Interrupted seconds cannot accumulate into a continuous hold");
  });
  check("duration-seconds", (app) => {
    app.click("Use "); app.tick(3); app.sample(250, 60_250);
    assert(text(app.tree).includes("Timer stopped.")); assert.equal(app.commits.length, 0);
  });
  check("duration-seconds", (app) => {
    app.click("Use "); app.tick(3); app.lifecycle("pagehide");
    assert(text(app.tree).includes("Timer stopped.")); assert.equal(app.commits.length, 0);
    app.click("Start a new timer"); app.tick(3); app.lifecycle("pageshow", { persisted: true });
    assert.equal(app.timer(), ""); assert.equal(app.commits.length, 0);
  });
  check("duration-seconds", (app) => {
    app.click("Use "); app.tick(3); app.click("Stop timer"); app.tick(10);
    assert.equal(app.timer(), ""); assert.equal(app.commits.length, 0);
    app.click("Start a new timer"); app.tick(3); app.click("Different result"); app.tick(10);
    assert.equal(app.timer(), ""); app.input("Seconds completed", "2.5"); app.choose("Partial"); app.click("Save result");
    assert.equal(app.commits[0].measurement.value, 2.5, "Manual duration must retain actual measured time");
  });
  check("duration-seconds", (app) => {
    app.click("Use "); app.tick(4); app.cleanup(); app.slots = []; app.key = undefined; app.flush();
    assert(app.button("Use "), "Reload begins with an idle helper, never a presumed completed hold");
    assert.equal(app.commits.length, 0);
  });
  check("duration-seconds", (app) => {
    app.click("Timer sound off");
    assert(text(app.tree).includes("Sound is unavailable"));
    assert.equal(app.button("Timer sound off").props["aria-pressed"], false);
    app.click("Use "); app.tick(3);
    assert.equal(app.timer(), `Hold${app.protocol.metric.minimum}s`, "Unsupported sound must never block the timer");
  });
  const audible = createHost("duration-seconds", { audio: true });
  try {
    audible.click("Use "); audible.tick(3);
    assert.equal(audible.audio.length, 0, "Sound requires the athlete's choice");
    audible.click("Stop timer"); audible.click("Timer sound off");
    assert.equal(audible.button("Timer sound on").props["aria-pressed"], true);
    audible.click("Start a new timer"); audible.tick(3);
    assert.equal(audible.audio.length, 1, "One beep marks the actual hold start, after preparation");
    assert(elements(audible.tree).some(node => node.props.role === "status" && text(node) === "Start holding now."));
    assert.equal(elements(audible.tree).find(node => node.props.role === "timer").props["aria-live"], "off");
    audible.tick(audible.protocol.metric.minimum);
    assert.equal(audible.audio.length, 3, "Two beeps mark completion");
    assert.equal(audible.commits.length, 0, "Audible completion never saves or confirms evidence");
    audible.visible(false);
    assert(audible.audio.every(node => node.cancelled), "Hide cancels even a just-started final cue");
    audible.sample(60_000); audible.visible(true);
    assert.equal(audible.audio.length, 3, "Returning cannot replay missed audio");
    audible.click("Start a new timer"); audible.tick(3);
    audible.click("Timer sound on");
    assert(audible.audio.every(node => node.cancelled), "Muting cancels current sound immediately");
    audible.tick(audible.protocol.metric.minimum);
    assert.equal(audible.audio.length, 4, "Muted completion remains silent");
    checks++;
  } finally { audible.cleanup(); }
  const pendingSound = createHost("duration-seconds", { audio: true, suspendedAudio: true });
  try {
    pendingSound.click("Timer sound off"); pendingSound.click("Use ");
    pendingSound.tick(1); pendingSound.visible(false);
    pendingSound.resumeAudio(); await pendingSound.drain(); pendingSound.sample(60_000); pendingSound.visible(true);
    assert.equal(pendingSound.audio.length, 0, "Late audio resume cannot play an interrupted cue");
    assert.equal(pendingSound.timer(), "");
    pendingSound.click("Start a new timer"); pendingSound.tick(3);
    assert.equal(pendingSound.audio.length, 1);
    pendingSound.click("I held exactly"); pendingSound.tick(60);
    assert(pendingSound.audio.every(node => node.cancelled), "Saving a reported result cancels the helper and all cues");
    assert.equal(pendingSound.audio.length, 1, "A save response must not restart an unfinished helper");
    checks++;
  } finally { pendingSound.cleanup(); }
  const interruptedSound = createHost("duration-seconds", { audio: true });
  try {
    interruptedSound.click("Timer sound off"); interruptedSound.click("Use "); interruptedSound.tick(3);
    interruptedSound.audioContexts[0].state = "interrupted";
    interruptedSound.visible(false); interruptedSound.visible(true);
    assert.equal(interruptedSound.audio.length, 1);
    interruptedSound.click("Start a new timer");
    assert.equal(interruptedSound.audioResumes, 1, "A new user gesture must resume iOS's interrupted audio state");
    interruptedSound.resumeAudio(); await interruptedSound.drain();
    assert.equal(interruptedSound.audio.length, 1, "Resuming audio cannot replay the interrupted cue");
    interruptedSound.tick(3);
    assert.equal(interruptedSound.audio.length, 2, "The new hold has its own start cue");
    interruptedSound.tick(interruptedSound.protocol.metric.minimum);
    assert.equal(interruptedSound.audio.length, 4);
    assert.equal(interruptedSound.commits.length, 0);
    checks++;
  } finally { interruptedSound.cleanup(); }
  const awake = createHost("duration-seconds", { wakeLock: true });
  try {
    awake.click("Use "); await awake.drain();
    assert.equal(awake.wakeRequests.length, 1);
    assert.equal(awake.wakeRequests[0].released, false);
    awake.tick(3); await awake.drain();
    assert.equal(awake.wakeRequests.length, 2, "Continuous hold interval must reacquire its screen wake lock after preparation");
    assert.equal(awake.wakeRequests[0].released, true);
    assert.equal(awake.wakeRequests[1].released, false);
    awake.click("Stop timer"); await awake.drain();
    assert.equal(awake.wakeRequests[1].released, true);
    awake.click("Start a new timer"); await awake.drain();
    assert.equal(awake.wakeRequests.length, 3);
    assert.equal(awake.wakeRequests[2].released, false);
    checks++;
  } finally {
    awake.cleanup();
    assert(awake.wakeRequests.every((sentinel) => sentinel.released), "Unmount must release every held screen lock");
  }
  console.log(`Quick guided-check UI validation passed (${checks} handler/timer scenarios).`);
} finally {
  Date.now = originalNow;
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
