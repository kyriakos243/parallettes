import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(projectRoot, "app/MotionGuide.tsx"), "utf8");
const program = readFileSync(join(projectRoot, "app/program.ts"), "utf8");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(source.includes("export const guides ="), "Motion guide registry export is missing");
assert(source.includes("...legacyGuides") && source.includes("...newGuides") &&
  source.includes("...existingTechniqueGuides") && source.includes("...v2ExpansionGuides") &&
  source.includes("...researchExpansionGuides"), "One or more motion guide registries are omitted");

assert(!source.includes("Move slowly through the demonstrated range"),
  "Generic quadruped fallback remains in the motion registry");
assert(source.includes("gaze: Point[]"), "Per-pose gaze support is missing");
assert(source.includes("hairPath(pose, gazes[index])"),
  "Hair does not follow the per-pose face direction");
assert(source.includes("auditFrame?: AuditFrame"),
  "Deterministic audit-frame support is missing");
assert(source.includes('get("media-audit-frame")'),
  "The media-audit page cannot select deterministic start/middle/end frames");
assert(source.includes('M390 ${guide.floor - 20} L478 ${guide.floor - 20}') &&
  source.includes('M414 ${guide.floor - 20} L502 ${guide.floor - 20}'),
"Both equal-height parallette handles must share the rendered wrist-contact plane");
assert(source.includes('"supine-90-90-breathing-reset"') &&
  source.includes('}), 426, "wall", gazeCeiling)'),
"Supine 90/90 reset must show feet supported by the wall");
assert(source.includes('"box-toe-light": dynamic("Shift shoulders, peel one foot'),
  "Wall foot-lightener must retain one wall contact at a time");
assert(source.includes("forearmSidePlank"), "Forearm side plank needs a distinct forearm pose");
assert(source.includes("forearmSawBack"), "Forearm plank saw needs planted forearm contacts");
assert(source.includes("wallBodyShift"), "Wall shifts need planted hand/foot contacts");
assert(source.includes("freeBalanceShift"), "Freestanding balance needs planted hands");
assert(source.includes('"floor-tuck-v-sit-balance") return hold("Balance on the sitting bones; hands reach forward and do not support the floor", floorTuckVSit'),
  "Tuck V-sit balance must not reuse a hand-supported tuck pose");
assert(source.includes('"sphinx-breathing-hold"') && source.includes("lw: p(520, 400)") && source.includes("rw: p(536, 406)"),
  "Sphinx forearms must extend forward with elbows under the shoulders");
assert(source.includes('"wall-handstand-side-exit": dynamic("Turn the hips and practise a controlled step-down with each lead leg"') &&
  source.includes('"floor-side-exit-practice") return dynamic("Turn the hips and land one foot at a time with each lead leg"'),
"Both wall and floor side-exit guides must demonstrate each lead leg");
assert(source.includes('"freestanding-parallette-kickup": dynamic("Kick up calmly, balance, then exit sideways one foot at a time; alternate exit sides"') &&
  source.includes("change(kickupStart, { rh: p(326, 264), rk: p(390, 330), ra: p(470, 400) })") &&
  source.includes("lh: p(304, 256), lk: p(390, 330), la: p(470, 400)") &&
  source.includes('"floor-freestanding-kick-up") return dynamic("Kick to a stacked line, then replace both feet one at a time", [pike, kickupStart, kickupSplit, freeHandstandBalance]'),
"Freestanding kick-up guides must demonstrate a controlled landing, and parallette attempts must show both exit sides");
assert(source.includes('"planche-lean-toe-lightener": (() =>') &&
  source.includes("change(loadedLean, { la: p(82, 382) })") &&
  source.includes("change(loadedLean, { ra: p(102, 382) })"),
"Planche toe lightener must unload only one toe at a time and alternate sides");
assert(source.includes('if (id.includes("bird-dog")) {') &&
  source.includes("leftArmRightLeg") && source.includes("rightArmLeftLeg"),
"Bird-dog guides must demonstrate both contralateral sides");
assert(source.includes('if (id === "floor-single-leg-pike-lift") return dynamic("Lift one locked leg, replace the heel, then change sides"'),
"Single-leg pike lift must demonstrate both sides");
assert(source.includes('"cross-press": dynamic("Press one hand into the opposite knee while the free arm and other leg extend; alternate sides"'),
  "Dead-bug cross press must pair the pressed knee with the opposite extending leg and alternate sides");

if (failures.length) {
  console.error(`Motion-guide validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Validated dedicated guide coverage, per-pose gaze, and priority contact rules.");
