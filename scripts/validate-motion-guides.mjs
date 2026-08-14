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
assert(program.includes('{ id: "shoulder-sweep", name: "Standing Shoulder Sweep"') &&
  source.includes('"shoulder-cars": dynamic("Sweep from thighs to overhead through a pain-free range"') &&
  !source.includes('"shoulder-cars": dynamic("Circle through a pain-free range"'),
"The former shoulder-CAR guide must be named and described as the sweep it actually demonstrates");
assert(source.includes("handLink?: boolean") &&
  source.includes('if (id === "rope-step-through-mobility") return {') &&
  source.includes("handLink: true") &&
  source.includes('aria-label="mobility rope held between both hands"') &&
  source.includes('change(standing, { le: p(267, 90), lw: p(250, 42), re: p(373, 90), rw: p(390, 42) })'),
"Rope mobility must draw an animated wide hand-to-hand rope with straight, symmetric overhead arms");
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
  source.includes('"floor-freestanding-kick-up") return dynamic("Kick to a stacked line, then use a controlled side exit"') &&
  source.includes('"floor-freestanding-balance-attempt")') &&
  source.includes('Enter calmly; keep corrections small, then use a controlled side exit'),
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
assert(source.includes('la: p(544, 181)') && source.includes('ra: p(544, 196)') &&
  !source.includes('la: p(520, 196)') && !source.includes('ra: p(522, 204)'),
"Wall foot lightener must preserve visible shin length while each foot peels away from the wall");
assert(source.includes('"pike-alternating-toe-float": dynamic("Float one toe without jumping", [\n    pike,\n    change(pike, { lk: p(190, 270), la: p(116, 344) }),\n    pike,'),
"Alternating pike toe floats must replace the first foot before lifting the second");
assert(source.includes('le: p(380, 328), lw: p(286, 352)') &&
  source.includes('rw: p(306, 346), lk: p(306, 346)') &&
  source.includes('}), bearHover, change(bearHover'),
"Bear-hover knee taps must reset between sides and visibly join each hand to the opposite knee");
assert(source.includes('le: p(429, 354), re: p(446, 356)') &&
  source.includes('le: p(447, 335), re: p(465, 338)') &&
  source.includes('change(wallStandingSide, { le: p(493, 166), re: p(503, 176) })'),
"Straight-arm wall, pike and inverted-L drills must keep elbow joints collinear");
assert(source.includes('"cat-cow-flow") return dynamic("Round and extend the spine slowly"') &&
  source.includes('head: p(448, 286), neck: p(424, 258)') &&
  source.includes('[p(10, 4), p(4, 12), p(10, -5)]'),
"Cat-cow must tuck the head and gaze in flexion, then look forward/up in extension");
assert(source.includes('"forearms-parallette-prayer-rock"') &&
  source.includes('le: p(392, 400), lw: p(430, 400), re: p(410, 400), rw: p(448, 400)') &&
  source.includes('"lat-reach"') && source.includes('le: p(407, 366), lw: p(434, 406), re: p(422, 372), rw: p(456, 406)'),
"Parallette cooldowns must visibly establish the claimed hand or forearm contact");
assert(source.includes('"staggered-parallette-push-up"') &&
  source.includes('lw: p(420, 400), rw: p(470, 400)') && !source.includes('rw: p(470, 372)'),
"Staggered push-up wrists must both contact the equal-height handle plane");
assert(source.includes('const leftReach = change(supine') && source.includes('const rightReach = change(supine') &&
  source.includes('alternate one hand toward the same-side heel'),
"Heel touches must rebuild both complete arm chains instead of stretching one inherited forearm");
assert(source.includes('"gentle-frog-adductor-hold"') &&
  source.includes('le: p(438, 400), lw: p(500, 400), re: p(454, 406), rw: p(516, 406)'),
"Frog/adductor hold must rest both forearms on the floor as prescribed");
assert(source.includes('const groundedStraddle = change(seatedPike') &&
  source.includes('const liftedStraddle = change(seatedPike') &&
  source.includes('lk: p(211, 370), la: p(80, 410), rk: p(270, 374), ra: p(180, 410)') &&
  source.includes('lk: p(217, 357), la: p(80, 410), rk: p(283, 361), ra: p(196, 410)'),
"Straddle compression guides must use visibly separated, straight leg chains with grounded heel contacts");
assert(source.includes('"long-lever-parallette-plank": hold("Hands stay slightly ahead of the shoulders; keep one long braced line"') &&
  !source.includes('"long-lever-parallette-plank": hold("Long straight line; ribs stay tucked", plancheLean'),
"Long-lever plank must not reuse the more advanced planche-lean pose");
assert(source.includes('if (id === "floor-frog-stand-setup")') &&
  source.includes('const groundedFrog = change(frog') && source.includes('const lightenedFrog = change(groundedFrog') &&
  source.includes('if (id === "floor-frog-stand") return dynamic("Knees rest lightly on arms; float briefly'),
"Frog-stand setup must retain toe availability and remain visually distinct from the achieved float");
assert(source.includes('if (id === "forward-back-hop") {') && source.includes('const sideLow = change(low') &&
  source.includes('Side view: hop a few centimetres forward and back') &&
  source.includes('shifted(sideLow, -12, 0)') && source.includes('shifted(sideLow, 12, 0)'),
"Forward-back hops must use a side-profile rig so horizontal travel is not mistaken for lateral hopping");
assert(source.includes('"lateral-bear-crawl": dynamic("Knees hover low; move one hand with the opposite foot, then follow"') &&
  source.includes('rw: p(460, 400), la: p(204, 394)') &&
  source.includes('lw: p(458, 400), ra: p(244, 394)'),
"Lateral bear crawl must demonstrate alternating contralateral steps instead of translating a static rig");

if (failures.length) {
  console.error(`Motion-guide validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Validated dedicated guide coverage, per-pose gaze, and priority contact rules.");
