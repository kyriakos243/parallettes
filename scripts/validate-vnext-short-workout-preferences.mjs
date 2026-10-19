import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const preferences = load("app/vnext/releaseCandidate/shortWorkoutPreferences.ts");
const domain = load("app/vnext/index.ts");
const { shortWorkoutPreferenceKey: keyFor, shortWorkoutFocusToken: tokenFor } = preferences;
const graphA = domain.graphIds.planche;
const graphB = domain.graphIds.handstandBalance;
assert.equal(typeof graphA, "string");
assert.equal(typeof graphB, "string");
const goals = { primaryGraphId: graphA, options: [{ graphId: graphA, label: "Planche" }, { graphId: graphB, label: "Handstand" }] };
const graphToken = tokenFor({ kind: "graph", graphId: graphA });
const keyA = keyFor("athlete-a", "production");
const keyB = keyFor("athlete-b", "production");
const rcKey = keyFor("athlete-a", "vnext-rc");
assert.notEqual(keyA, keyB);
assert.notEqual(keyA, rcKey);
assert.equal(keyA, "parallette25-production-short-workout-v1:athlete-a");
assert.equal(tokenFor({ kind: "capacity", plannerGraphId: graphA, capacityIds: ["b", "a"] }), tokenFor({ kind: "capacity", plannerGraphId: graphA, capacityIds: ["a", "b"] }));

const memoryStorage = (entries = []) => {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
let storage = memoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => storage });

// Exercise the actual form's hooks, handlers, controlled values and keyed remount.
let state = [], cursor = 0, lastKey;
const hooks = {
  useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
  },
  useRef: current => ({ current }),
  useEffect: () => {},
};
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mod = { exports: {} };
const compiled = ts.transpileModule(readFileSync("app/vnext/releaseCandidate/CustomSessionBuilder.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("module", "exports", "require", compiled)(mod, mod.exports, name => {
  if (name === "react") return hooks;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (name === "../index") return domain;
  if (name === "./shortWorkoutPreferences") return preferences;
  throw new Error(`Unexpected component import ${name}`);
});
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" ? text(value.props?.children) : value == null ? "" : String(value);
let builds = [], closes = 0;
const defaults = {
  goals, currentEquipment: ["floor", "parallettes"], defaultDemand: "standard", preferenceKey: keyA,
  onBuild: request => builds.push(request), onClose: () => closes++,
};
const render = (props = {}) => {
  cursor = 0;
  const form = mod.exports.CustomSessionBuilder({ ...defaults, ...props });
  if (form.key !== lastKey) { state = []; lastKey = form.key; }
  return elements(form.type(form.props));
};
const remount = (props = {}) => { state = []; lastKey = undefined; return render(props); };
const button = (tree, label) => tree.find(node => node.type === "button" && text(node) === label);
const focusSelect = tree => tree.find(node => node.type === "select");
const selectedMinutes = tree => [5, 10, 15, 20].find(value => button(tree, `${value} min`).props["aria-pressed"]);
const preview = tree => tree.find(node => node.type === "button" && text(node).startsWith("Preview "));
const checkbox = (tree, id) => tree.find(node => node.type === "input" && node.props.onChange && tree.some(parent => parent.type === "label" && text(parent) === id && elements(parent).includes(node)));

let tree = render();
assert.equal(selectedMinutes(tree), 5);
assert.equal(focusSelect(tree).props.value, graphToken);
assert.equal(storage.values.size, 0, "Reading defaults must not manufacture saved preferences");
const compressionToken = tree.find(node => node.type === "option" && text(node) === "Compression only").props.value;
button(tree, "15 min").props.onClick(); tree = render();
focusSelect(tree).props.onChange({ target: { value: compressionToken } }); tree = render();
assert.equal(selectedMinutes(tree), 15);
assert.equal(focusSelect(tree).props.value, compressionToken);
assert.deepEqual(JSON.parse(storage.getItem(keyA)), { version: 1, minutes: 15, focusToken: compressionToken });
checkbox(tree, "Parallettes").props.onChange(); tree = render();
button(tree, "Challenge").props.onClick(); tree = render();
button(tree, "Close").props.onClick();
assert.equal(closes, 1);
assert.equal(builds.length, 0, "Changing and closing choices must not generate a workout");

// A fresh storage object and hook host simulate reopening/reloading, with new current profile defaults.
storage = memoryStorage(storage.values.entries());
tree = remount({ currentEquipment: ["floor", "wall"], defaultDemand: "technique", goals: { ...goals, primaryGraphId: graphB, options: [...goals.options].reverse().map(option => ({ ...option, label: `${option.label} renamed` })) } });
assert.equal(selectedMinutes(tree), 15);
assert.equal(focusSelect(tree).props.value, compressionToken);
assert.equal(checkbox(tree, "Wall").props.checked, true);
assert.equal(checkbox(tree, "Parallettes").props.checked, false);
assert.equal(button(tree, "Easier / Technique").props["aria-pressed"], true);
preview(tree).props.onClick();
assert.deepEqual(builds.at(-1).equipment, ["floor", "wall"]);
assert.equal(builds.at(-1).demand, "technique");
assert.equal(builds.at(-1).minutes, 15);
assert.equal(builds.at(-1).focus.kind, "capacity");
assert.deepEqual(Object.keys(JSON.parse(storage.getItem(keyA))).sort(), ["focusToken", "minutes", "version"], "Only convenience duration/focus may be retained, never a generated plan/equipment/demand");
assert.equal(storage.values.size, 1);

tree = render({ preferenceKey: keyB });
assert.equal(selectedMinutes(tree), 5, "Switching athletes remounts the form without carrying choices");
assert.equal(focusSelect(tree).props.value, graphToken);
button(tree, "10 min").props.onClick();
tree = render({ preferenceKey: keyA });
assert.equal(selectedMinutes(tree), 15);
tree = remount({ preferenceKey: rcKey });
assert.equal(selectedMinutes(tree), 5, "RC and production preference namespaces stay isolated");

storage.setItem(keyA, JSON.stringify({ version: 1, minutes: 20, focusToken: tokenFor({ kind: "graph", graphId: graphB }) }));
tree = remount();
assert.equal(focusSelect(tree).props.value, tokenFor({ kind: "graph", graphId: graphB }));
tree = render({ goals: { ...goals, options: goals.options.filter(option => option.graphId !== graphB) } });
assert.equal(selectedMinutes(tree), 20);
assert.equal(focusSelect(tree).props.value, graphToken, "A removed focus falls back to the current main goal, never another index");
preview(tree).props.onClick();
assert.equal(builds.at(-1).focus.graphId, graphA);
tree = remount({ goals: { options: [] } });
assert.equal(focusSelect(tree).props.value, "general", "An unavailable goal has a balanced fallback");

for (const value of ["{", "null", "[]", "15", JSON.stringify({ version: 2, minutes: 20, focusToken: compressionToken }), JSON.stringify({ version: 1, minutes: 25, focusIndex: 3 })]) {
  storage.setItem(keyA, value);
  tree = remount();
  assert.equal(selectedMinutes(tree), 5);
  assert.equal(focusSelect(tree).props.value, graphToken);
}
storage.setItem(keyA, JSON.stringify({ version: 1, minutes: 10, focusToken: "graph:removed-goal" }));
tree = remount();
assert.equal(selectedMinutes(tree), 10);
assert.equal(focusSelect(tree).props.value, graphToken);

const fallback = { minutes: 5, focusToken: graphToken };
const throwingStorage = { getItem() { throw new Error("Storage blocked"); }, setItem() { throw new Error("Storage full"); }, removeItem() { throw new Error("Storage blocked"); } };
assert.deepEqual(preferences.readShortWorkoutPreferences(keyA, fallback, [graphToken], throwingStorage), fallback);
assert.doesNotThrow(() => preferences.clearShortWorkoutPreferences(keyA, throwingStorage));
storage = throwingStorage;
tree = remount();
button(tree, "20 min").props.onClick(); tree = render();
assert.equal(selectedMinutes(tree), 20, "Storage failures must not stop the user's current choice");
preview(tree).props.onClick();
assert.equal(builds.at(-1).minutes, 20);
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Security restriction"); } });
tree = remount();
assert.equal(selectedMinutes(tree), 5);
button(tree, "15 min").props.onClick(); tree = render();
preview(tree).props.onClick();
assert.equal(builds.at(-1).minutes, 15);
Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => storage });
storage = memoryStorage();
tree = remount({ preferenceKey: undefined });
button(tree, "10 min").props.onClick();
assert.equal(storage.values.size, 0, "An unscoped builder must never use a shared preference key");
preferences.rememberShortWorkoutPreferences(keyA, fallback);
preferences.clearShortWorkoutPreferences(keyA);
assert.equal(storage.getItem(keyA), null);
delete globalThis.localStorage;
console.log("Short-workout memory checks passed: actual form close/reopen/reload, stable focus tokens, profile defaults, account/namespace isolation, unavailable focus, malformed data and storage failures.");
