import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const resolveTypeScriptModule = (specifier, parentPath) => {
  const base = resolve(dirname(parentPath), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  const found = candidates.find((candidate) => {
    try { readFileSync(candidate); return true; } catch { return false; }
  });
  if (!found) throw new Error(`Cannot resolve ${specifier} from ${relative(projectRoot, parentPath)}`);
  return found;
};
const loadTypeScriptModule = (path) => {
  const absolutePath = resolve(projectRoot, path);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const loaded = { exports: {} };
  moduleCache.set(absolutePath, loaded);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) throw new Error(`Unexpected runtime import ${specifier}`);
    return loadTypeScriptModule(relative(projectRoot, resolveTypeScriptModule(specifier, absolutePath)));
  };
  new Function("exports", "module", "require", "__filename", "__dirname", compiled)(
    loaded.exports, loaded, localRequire, absolutePath, dirname(absolutePath),
  );
  return loaded.exports;
};

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "assetFingerprint")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stable(child)]));
  }
  return value;
};
const fingerprint = (guide) => createHash("sha256")
  .update(JSON.stringify(stable(guide)))
  .digest("hex");

const motion = loadTypeScriptModule("app/vnext/media/phase10OwnedMotion.ts");
const media = loadTypeScriptModule("app/vnext/releaseCandidate/mediaRelease.ts");
const requirements = loadTypeScriptModule("app/vnext/definitions/phase7Media.ts").phase7MediaRequirements;
const guides = motion.phase10OwnedMotionGuides;
const references = motion.phase10OwnedMotionReferences;
const computedFingerprints = Object.fromEntries(references.map((reference) => [reference, fingerprint(guides[reference])]));

if (process.argv.includes("--print-fingerprints")) {
  console.log(JSON.stringify(computedFingerprints, null, 2));
  process.exit(0);
}

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const hasVisual = (guide, kind, pattern) => guide.visuals.some((item) =>
  item.kind === kind && (!pattern || pattern.test(item.label)));
const canonical = (value) => JSON.stringify(stable(value));

assert(requirements.length === 28, `Expected 28 canonical briefs; found ${requirements.length}`);
assert(references.length === 28 && new Set(references).size === 28,
  `Expected 28 unique guide references; found ${references.length}/${new Set(references).size}`);
assert(requirements.flatMap((item) => item.exerciseIds).length === 30,
  "The 28 briefs no longer cover exactly 30 Phase 7 movements");

const requirementByReference = new Map(requirements.map((requirement) => [requirement.reference, requirement]));
for (const reference of references) {
  const requirement = requirementByReference.get(reference);
  const guide = guides[reference];
  assert(Boolean(requirement), `${reference} has no canonical brief`);
  assert(Boolean(guide), `${reference} has no renderable motion guide`);
  if (!requirement || !guide) continue;
  assert(guide.reference === reference, `${reference} changed its stable locator`);
  assert(guide.playback === requirement.playback,
    `${reference} playback ${guide.playback} differs from ${requirement.playback}`);
  assert(guide.poses.length >= 2, `${reference} does not animate at least two poses`);
  assert(guide.gaze.length === guide.poses.length, `${reference} gaze does not cover every pose`);
  if (guide.keyframeTimes) {
    assert(guide.keyframeTimes.length === guide.poses.length,
      `${reference} keyframe timing does not cover every pose`);
    assert(guide.keyframeTimes[0] === 0 && guide.keyframeTimes.at(-1) === 1
      && guide.keyframeTimes.every((time, index) => Number.isFinite(time)
        && time >= 0 && time <= 1
        && (index === 0 || time > guide.keyframeTimes[index - 1])),
    `${reference} keyframe timing is not strictly chronological from zero to one`);
  }
  assert(guide.phasePoseIndexes.length === requirement.movementPhases.length,
    `${reference} does not provide one reviewable pose index per canonical movement phase`);
  assert(guide.phasePoseIndexes.every((index, position) => Number.isSafeInteger(index)
    && index >= 0 && index < guide.poses.length
    && (position === 0 || index >= guide.phasePoseIndexes[position - 1])),
  `${reference} movement-phase pose indexes are invalid or out of order`);
  assert([guide.auditFrames.start, guide.auditFrames.middle, guide.auditFrames.end].every((index) =>
    Number.isSafeInteger(index) && index >= 0 && index < guide.poses.length),
  `${reference} audit frame is outside its pose sequence`);
  assert(guide.auditFrames.start <= guide.auditFrames.middle
    && guide.auditFrames.middle <= guide.auditFrames.end,
  `${reference} audit frames are not chronological`);
  assert(guide.auditFrames.start === guide.phasePoseIndexes[0],
    `${reference} audit start does not match the canonical first phase`);
  assert(guide.phasePoseIndexes.includes(guide.auditFrames.middle)
    && guide.phasePoseIndexes.includes(guide.auditFrames.end),
  `${reference} audit middle/end are not canonical movement phases`);
  if (guide.posterFrame !== undefined) {
    assert(Number.isSafeInteger(guide.posterFrame)
      && guide.posterFrame >= 0 && guide.posterFrame < guide.poses.length,
    `${reference} reduced-motion poster is outside its pose sequence`);
  }
  assert(guide.poses.every((pose) => Object.values(pose).every((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= 20 && point.x <= 610 && point.y >= 20 && point.y <= 475)),
  `${reference} contains a cropped or invalid joint coordinate`);
  for (const item of guide.visuals.filter((visual) => visual.kind === "assistance")) {
    assert(!item.activePoseIndexes || item.activePoseIndexes.every((index) =>
      Number.isSafeInteger(index) && index >= 0 && index < guide.poses.length),
    `${reference} assistance visibility references an invalid pose`);
  }
  assert(guide.assetFingerprint === computedFingerprints[reference],
    `${reference} fingerprint is stale; expected ${computedFingerprints[reference]}`);
  if (guide.playback === "one-way-reset") {
    assert(canonical(guide.poses) !== canonical([...guide.poses].reverse()),
      `${reference} is a ping-pong/palindromic one-way sequence`);
  }
}

const paralletteRequired = requirements.filter((requirement) =>
  (requirement.requiredVisuals ?? []).some((item) => /bar|parallette/iu.test(item)));
for (const requirement of paralletteRequired) {
  assert(guides[requirement.reference].equipment.includes("parallettes"),
    `${requirement.reference} omits required parallettes`);
}
for (const requirement of requirements.filter((item) =>
  (item.requiredVisuals ?? []).some((visual) => /wall/iu.test(visual)))) {
  const equipment = guides[requirement.reference].equipment;
  assert(equipment.includes("wall") || equipment.includes("left-wall"),
    `${requirement.reference} omits required wall geometry`);
}
for (const reference of [
  "elevated-parallette-pike-push-up",
  "wall-hspu-bottom-position-exit",
  "wall-hspu-eccentric",
  "assisted-wall-hspu-concentric",
  "parallette-wall-hspu",
  "deficit-wall-hspu-bottom-position-exit",
  "deficit-wall-hspu",
]) {
  assert(hasVisual(guides[reference], "pad", /depth|standard|deficit/iu),
    `${reference} omits its padded depth target`);
}
assert(hasVisual(guides["partial-wall-hspu"], "landmark", /partial depth/iu),
  "Partial wall HSPU omits its repeatable range landmark");
assert(guides["deficit-wall-hspu"].barTop < guides["deficit-wall-hspu"].floor
  && guides["deficit-wall-hspu-bottom-position-exit"].barTop
    < guides["deficit-wall-hspu-bottom-position-exit"].floor,
"Deficit HSPU guides do not make usable below-bar depth visible");
assert(guides["deficit-wall-hspu"].poses.some((pose) => pose.head.y > guides["deficit-wall-hspu"].barTop),
  "Deficit HSPU never travels below the bar-top landmark");
assert(guides["parallette-wall-hspu"].poses.every((pose) => pose.head.y < 400),
  "Standard wall HSPU crosses the bar-top/deficit boundary");
assert(guides["elevated-parallette-pike-push-up"].poses.some((pose) => pose.head.y + 27 > 400),
  "Elevated pike push-up crown never travels below the bar-top landmark");
assert(guides["deficit-parallette-push-up"].barTop === 400
  && guides["deficit-parallette-push-up"].poses.some((pose) => pose.ls.y > 400 && pose.rs.y > 400),
"Deficit push-up never places both shoulders below the bar-top landmark");

const lSitGazeReferences = [
  "high-l-sit-hold",
  "assisted-v-sit-hold",
  "partial-v-sit-hold",
  "l-sit-to-tuck-planche-transition",
  "tuck-planche-to-l-sit-transition",
];
for (const reference of lSitGazeReferences) {
  assert(guides[reference].gaze.every((point) => point.x < 0),
    `${reference} face does not remain oriented toward the left-facing L/V path`);
}
const straddleLSitGuide = guides["straddle-l-sit-hold"];
const straddleTarget = straddleLSitGuide.poses[2];
assert(straddleLSitGuide.paralletteView === "front-oblique"
  && Math.abs(straddleTarget.la.y - straddleTarget.ra.y) <= 4
  && Math.abs((straddleTarget.la.x + straddleTarget.ra.x) / 2 - 320) <= 4,
"Straddle L-sit target is not a symmetric front-oblique straddle");
const assistedVSitGuide = guides["assisted-v-sit-hold"];
assert([2, 3].every((index) => assistedVSitGuide.poses[index].la.x === 82
  && assistedVSitGuide.poses[index].ra.x === 82
  && assistedVSitGuide.poses[index].la.y === assistedVSitGuide.poses[index].ra.y)
  && assistedVSitGuide.visuals.filter((item) => item.kind === "assistance").length === 2,
"Assisted V-sit does not show both heels at one reviewed wall-height contact");
const assistedStraddlePlanche = guides["assisted-straddle-planche-hold"];
assert([2, 3].every((index) => assistedStraddlePlanche.poses[index].la.x === 82
  && assistedStraddlePlanche.poses[index].ra.x === 82
  && assistedStraddlePlanche.poses[index].la.y === assistedStraddlePlanche.poses[index].ra.y),
"Assisted straddle Planche does not show both toes at one equal-height wall mark");
const torsoOffset = (pose) => Math.abs(
  (pose.ls.x + pose.rs.x) / 2 - (pose.lh.x + pose.rh.x) / 2
);
for (const reference of ["high-l-sit-hold", "assisted-v-sit-hold", "partial-v-sit-hold"]) {
  assert(torsoOffset(guides[reference].poses[0]) <= 22,
    `${reference} begins from a materially reclined rather than tall L/V support`);
}
for (const reference of ["l-sit-to-tuck-planche-transition", "tuck-planche-to-l-sit-transition"]) {
  const transition = guides[reference];
  assert(transition.poses.slice(0, -1).every((pose) => pose.la.y < 400 && pose.ra.y < 400),
    `${reference} touches down before its separately completed landing`);
  assert(transition.posterFrame === 5,
    `${reference} reduced-motion poster does not show its held destination`);
}
const lToPlanche = guides["l-sit-to-tuck-planche-transition"];
const lShoulders = (lToPlanche.poses[0].ls.x + lToPlanche.poses[0].rs.x) / 2;
const plancheShoulders = (lToPlanche.poses[4].ls.x + lToPlanche.poses[4].rs.x) / 2;
assert(lShoulders - plancheShoulders >= 12,
  "L-sit to tuck Planche does not visibly shift the shoulders forward");
assert(lToPlanche.poses.at(-1).la.x > lToPlanche.poses.at(-1).lw.x
  && lToPlanche.poses.at(-1).ra.x > lToPlanche.poses.at(-1).rw.x,
"L-sit to tuck Planche crosses the feet under the bars instead of landing behind the target");

const dwellSeconds = (reference, startIndex, endIndex) => {
  const guide = guides[reference];
  const times = guide.keyframeTimes ?? guide.poses.map((_, index) => index / (guide.poses.length - 1));
  return guide.duration * (times[endIndex] - times[startIndex]);
};
assert(dwellSeconds("parallette-tuck-planche-hold", 2, 3) >= 8,
  "Parallette tuck Planche target is not held for the protocol minimum");
assert(dwellSeconds("assisted-one-leg-planche-hold", 1, 2) >= 6
  && dwellSeconds("assisted-one-leg-planche-hold", 4, 5) >= 6,
"Assisted one-leg Planche does not show an accepted six-second hold on both sides");
assert(dwellSeconds("straddle-l-sit-hold", 2, 3) >= 8,
  "Straddle L-sit target is not held for the protocol minimum");
assert(dwellSeconds("parallette-balance-repeatable-variant", 1, 2) >= 5
  && dwellSeconds("parallette-balance-repeatable-variant", 6, 7) >= 5,
"Repeatable parallette balance does not show five independent seconds before either exit");

for (const reference of [
  "assisted-one-leg-planche-hold",
  "assisted-straddle-planche-hold",
  "assisted-v-sit-hold",
  "assisted-wall-hspu-concentric",
  "assisted-bent-arm-tuck-press",
  "assisted-straddle-press-wall-handstand",
  "assisted-pike-press-to-handstand",
]) {
  assert(hasVisual(guides[reference], "assistance"), `${reference} hides its assistance geometry`);
}
for (const reference of ["wall-hspu-eccentric", "wall-handstand-straddle-lower", "pike-press-negative"]) {
  assert(guides[reference].playback === "one-way-reset" && hasVisual(guides[reference], "direction", /second|eccentric|descent/iu),
    `${reference} does not make its one-way eccentric direction explicit`);
}
for (const reference of ["l-sit-to-tuck-planche-transition", "tuck-planche-to-l-sit-transition"]) {
  assert(guides[reference].playback === "one-way-reset" && hasVisual(guides[reference], "direction", /continuous/iu),
    `${reference} does not make its transition direction explicit`);
}
const bothExitGuide = guides["parallette-balance-repeatable-variant"];
assert(bothExitGuide.poses.some((pose) => pose.la.x < 300 && pose.ra.x > 520)
  && bothExitGuide.poses.some((pose) => pose.ra.x < 300 && pose.la.x > 520),
"Repeatable parallette balance does not visibly demonstrate both exit sides");

// Phase review frames are release evidence, not decorative thumbnails. These
// direction-sensitive guides must index the completed opposite side, landing
// or separately-reset endpoint instead of stopping at an intermediate pose.
const exactDirectionalPhaseIndexes = {
  "assisted-one-leg-planche-hold": [0, 0, 1, 1, 2, 5],
  "parallette-balance-repeatable-variant": [0, 1, 2, 3, 8],
  "wall-hspu-bottom-position-exit": [0, 2, 3, 4, 5],
  "wall-hspu-eccentric": [0, 1, 2, 4],
  "assisted-wall-hspu-concentric": [0, 0, 2, 4],
  "deficit-wall-hspu-bottom-position-exit": [0, 2, 3, 5],
  "deficit-wall-hspu": [0, 2, 4, 5],
  "assisted-straddle-press-wall-handstand": [0, 1, 1, 2, 5, 6],
  "wall-handstand-straddle-lower": [0, 1, 2, 3, 3],
  "pike-press-negative": [0, 2, 3, 3],
  "l-sit-to-tuck-planche-transition": [0, 2, 3, 4, 5],
  "tuck-planche-to-l-sit-transition": [0, 2, 3, 5, 6],
};
for (const [reference, expected] of Object.entries(exactDirectionalPhaseIndexes)) {
  assert(JSON.stringify(guides[reference].phasePoseIndexes) === JSON.stringify(expected),
    `${reference} no longer maps every canonical phase to its completed directional endpoint`);
}

const exactSemanticAuditFrames = {
  "floor-balance-repeatable-variant": { start: 0, middle: 2, end: 3 },
  "parallette-balance-repeatable-variant": { start: 0, middle: 2, end: 8 },
  "freestanding-parallette-tuck-shape-change": { start: 0, middle: 2, end: 4 },
  "elevated-parallette-pike-push-up": { start: 0, middle: 2, end: 3 },
  "wall-hspu-eccentric": { start: 0, middle: 2, end: 4 },
  "assisted-straddle-press-wall-handstand": { start: 0, middle: 5, end: 6 },
  "assisted-pike-press-to-handstand": { start: 0, middle: 4, end: 5 },
  "l-sit-to-tuck-planche-transition": { start: 0, middle: 3, end: 5 },
  "tuck-planche-to-l-sit-transition": { start: 0, middle: 2, end: 5 },
};
for (const [reference, expected] of Object.entries(exactSemanticAuditFrames)) {
  assert(JSON.stringify(guides[reference].auditFrames) === JSON.stringify(expected),
    `${reference} no longer exposes its defining target/depth/direction in deterministic review frames`);
}

const motionGuideSource = readFileSync(resolve(projectRoot, "app/MotionGuide.tsx"), "utf8");
const vNextMotionGuideSource = readFileSync(resolve(projectRoot, "app/vnext/media/VNextMotionGuide.tsx"), "utf8");
const auditPageSource = readFileSync(resolve(projectRoot, "app/vnext/media/Phase10MediaAuditPage.tsx"), "utf8");
const entrySource = readFileSync(resolve(projectRoot, "src/main.tsx"), "utf8");
const runnerSource = readFileSync(resolve(projectRoot, "app/vnext/releaseCandidate/WorkoutRunner.tsx"), "utf8");
assert(!motionGuideSource.includes('from "./vnext/media/phase10OwnedMotion"')
  && motionGuideSource.includes("export const registerMotionGuides"),
"The ordinary renderer imports the vNext registry or cannot accept an isolated registry");
assert(vNextMotionGuideSource.includes("registerMotionGuides(phase10OwnedMotionGuides)")
  && vNextMotionGuideSource.includes("<MotionGuide preset={preset}"),
"The RC-only renderer does not register and render all Phase 10 owned guides");
assert(motionGuideSource.includes('guide.playback === "one-way-reset"')
  && motionGuideSource.includes("repeatDelay: 0.7")
  && !motionGuideSource.includes("reverseType"),
"Renderer does not preserve one-way playback/reset semantics");
assert(entrySource.includes('get("media-audit") === "phase10"')
  && entrySource.includes("Phase10MediaAuditPage"),
"The deterministic Phase 10 visual-review surface is missing");
assert(auditPageSource.includes('type ReviewMode = "motion"')
  && auditPageSource.includes('auditFrame={mode}')
  && motionGuideSource.includes('auditFrame === "motion"')
  && auditPageSource.includes("Exact final-product playback"),
"The owner review surface does not default to the exact animated product playback");
assert(runnerSource.includes('import("../media/VNextMotionGuide")')
  && runnerSource.includes("<VNextMotionGuide preset={motionPreset}"),
"Workout execution does not resolve the owned-motion registry");

const manifestIssues = media.validateVNextMediaReleaseManifest(media.vNextMediaReleaseManifest);
assert(manifestIssues.length === 0,
  `Owned-media release manifest is structurally invalid: ${manifestIssues.map((issue) => issue.code).join(", ")}`);
const mediaEvaluation = media.evaluateProductionReachableVNextMedia(
  media.phase7MediaRequiredExerciseIds,
  media.vNextMediaReleaseManifest,
);
assert(media.vNextMediaReleaseManifest.entries.every((entry) =>
  entry.state.implementation.status === "implemented"
    && entry.state.technicalReview.status === "approved"),
"One or more owned-motion assets is missing implementation or technical approval");
assert(mediaEvaluation.blocked.every((decision) => decision.reasons.length === 1
  && decision.reasons[0] === "owner-review-pending"),
"A media block remains other than explicit owner visual approval");

if (failures.length) {
  console.error(`vNext Phase 10 media validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("vNext Phase 10 owned-motion validation passed");
  console.log("- 28 renderable owned guides cover all 30 Phase 7 movements with stable local locators");
  console.log("- exact apparatus, assistance, range/depth, direction, exits and deterministic review frames validated");
  console.log(`- technical review approved; ${mediaEvaluation.blocked.length} movement mappings remain blocked only for owner visual approval`);
}
