import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compiled = ts.transpileModule(readFileSync("app/vnext/ui/sectionNavigation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function navigation(initial = "today") {
  let slots = [], cursor = 0, effects = [], dependencies = [];
  const hooks = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], value => { slots[i] = value; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useLayoutEffect(callback, deps) { const i = cursor++; if (!dependencies[i] || deps.some((d,n) => dependencies[i][n] !== d)) effects.push(callback); dependencies[i] = deps; },
  };
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, () => hooks);
  return () => { cursor = 0; effects = []; const value = mod.exports.useSectionNavigation(initial); effects.forEach(fn => fn()); return value; };
}
let scrolls = [];
global.window = { scrollY: 0, scrollTo: options => { scrolls.push(options.top); window.scrollY = options.top; } };
const render = navigation();
let nav = render();
assert.equal(scrolls.length, 0, "Mount must not move a restored workout/summary");
assert.equal(nav.hasVisited("progress"), false, "Do not eagerly mount hidden screens");
window.scrollY = 960; nav.changeSection("progress"); nav = render();
assert.equal(nav.section, "progress"); assert.equal(window.scrollY, 0);
assert.ok(nav.hasVisited("today") && nav.hasVisited("progress"));
window.scrollY = 1820; nav.changeSection("history"); nav = render();
assert.equal(window.scrollY, 0); assert.ok(nav.hasVisited("progress"));
window.scrollY = 2410; nav.changeSection("today"); nav = render();
assert.equal(window.scrollY, 960);
nav.changeSection("progress"); nav = render(); assert.equal(window.scrollY, 1820);
nav.changeSection("history"); nav = render(); assert.equal(window.scrollY, 2410);
window.scrollY = 2460; const calls = scrolls.length; nav.changeSection("history"); nav = render();
assert.equal(window.scrollY, 2460); assert.equal(scrolls.length, calls, "Current tab must not reset its position");
nav = render(); assert.equal(scrolls.length, calls, "Unrelated refresh must not scroll");
const fresh = navigation()(); assert.equal(fresh.section, "today"); assert.equal(fresh.hasVisited("history"), false, "A new athlete/app mount must not inherit navigation memory");
console.log("Section navigation passed: independent scroll positions, lazy visited sections, same-tab stability, refresh stability and mount isolation.");
