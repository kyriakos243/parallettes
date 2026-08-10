import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const motionGuideSource = readFileSync(join(projectRoot, "app/MotionGuide.tsx"), "utf8");

const loadTypeScriptModule = (relativePath, replacements = []) => {
  let source = readFileSync(join(projectRoot, relativePath), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  const runModule = new Function("exports", "module", "require", compiled);
  runModule(loaded.exports, loaded, () => {
    throw new Error(`Unexpected runtime import in ${relativePath}`);
  });
  return loaded.exports;
};

const program = loadTypeScriptModule("app/program.ts", [
  ["import.meta.env.BASE_URL", '"/parallettes/"'],
]);
const session = loadTypeScriptModule("app/session.ts");

const {
  exerciseList,
  exercises,
  programmeSummary,
  readiness,
  timing,
  workoutVariants,
  workouts,
} = program;
const {
  APP_STORAGE_VERSION,
  STABLE_SLOT_IDS,
  buildSessionPlan,
  compatibleSwaps,
  createPlanSnapshot,
  defaultStoredAppState,
  isExerciseCompatible,
  isExerciseStructurallyCompatible,
  levelRank,
  locateTimerPosition,
  parsePlanSnapshot,
  parseStoredAppState,
  slotsForVariant,
  variantKey,
} = session;

const failures = [];
const fail = (message) => failures.push(message);
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const rank = (level) => level === "ALL" ? 0 : levelRank(level);
const supportsLevel = (exercise, level) =>
  exercise.level === "ALL" || exercise.availableLevels.includes(level);
const supportsDay = (exercise, day) =>
  exercise.compatibleDays === "all" || exercise.compatibleDays.includes(day);

// Library identity and the agreed expansion size.
assert(exerciseList.length === 163, `Expected 163 exercises; found ${exerciseList.length}`);
assert(Object.keys(exercises).length === 163, "Exercise IDs are not unique");
assert(new Set(exerciseList.map((exercise) => exercise.id)).size === 163,
  "exerciseList contains duplicate IDs");
const newExercises = exerciseList.filter((exercise) => exercise.introduced === "v2");
const originalExercises = exerciseList.filter((exercise) => exercise.introduced === "original");
assert(newExercises.length === 123, `Expected exactly 123 v2 exercises; found ${newExercises.length}`);
assert(originalExercises.length === 40,
  `Expected 40 retained unique exercises; found ${originalExercises.length}`);
assert(programmeSummary?.newExercises === 123, "Programme summary does not report 123 additions");
assert(programmeSummary?.totalUniqueExercises === 163,
  "Programme summary does not report 163 unique exercises");

const validLevels = new Set(["ALL", "L1", "L2", "L3"]);
const validBlocks = new Set(["warmup", "pre", "core", "handstand", "lab", "cooldown"]);
const validStatuses = new Set(["ready", "audit", "required"]);
const validMediaKinds = new Set(["loop", "static", "transition"]);
const validEquipment = new Set(["parallettes", "floor", "wall", "rope"]);
const mediaCounts = { ready: 0, audit: 0, required: 0, files: 0, motion: 0 };
const excludedIds = ["kneeling-lean", "cross-press", "boat-hold", "plank-tap-out", "mountain-climber", "plank-knee-elbow", "frog-prep", "prayer-wrist-waves", "inchworm-pike-walkout", "crossbody-mountain-climber", "frog-stand-weight-shift", "forearm-pronator-stretch", "crossbody-shoulder-stretch", "supine-thoracic-opener"];
for (const id of excludedIds) assert(!exercises[id], `${id}: excluded audit movement returned to V2`);

for (const exercise of exerciseList) {
  assert(exercises[exercise.id] === exercise, `${exercise.id}: dictionary/list identity mismatch`);
  assert(exercise.name?.trim(), `${exercise.id}: missing name`);
  assert(validLevels.has(exercise.level), `${exercise.id}: invalid level ${exercise.level}`);
  assert(Array.isArray(exercise.availableLevels) && exercise.availableLevels.length > 0,
    `${exercise.id}: missing availableLevels`);
  assert(exercise.eligibleBlocks.length > 0 &&
    exercise.eligibleBlocks.every((block) => validBlocks.has(block)),
  `${exercise.id}: invalid eligibleBlocks`);
  assert(exercise.primaryFocus, `${exercise.id}: missing primary focus`);
  assert(exercise.target?.trim(), `${exercise.id}: missing target`);
  assert(Array.isArray(exercise.cues) && exercise.cues.length === 2 &&
    exercise.cues.every((cue) => cue.trim()), `${exercise.id}: requires two technique cues`);
  assert(exercise.regression?.trim(), `${exercise.id}: missing regression`);
  assert(Array.isArray(exercise.requiredEquipment) && exercise.requiredEquipment.length > 0 &&
    exercise.requiredEquipment.every((item) => validEquipment.has(item)),
  `${exercise.id}: invalid or missing equipment metadata`);
  assert(exercise.family?.trim() && exercise.progressionFamily?.trim(),
    `${exercise.id}: missing generator family metadata`);
  assert(exercise.how?.trim() && exercise.focus?.trim() && exercise.avoid?.trim(),
    `${exercise.id}: missing expanded technique guidance`);
  assert(!/\bbox\b|\bbench\b|\bchair\b/iu.test(`${exercise.name} ${exercise.target} ${exercise.cues.join(" ")} ${exercise.regression}`),
    `${exercise.id}: user-facing copy requires disallowed equipment`);
  assert(exercise.blocks.join("|") === exercise.eligibleBlocks.join("|"),
    `${exercise.id}: compatibility block aliases diverge`);
  const expectedDays = exercise.compatibleDays === "all"
    ? [1, 2, 3, 4, 5]
    : exercise.compatibleDays;
  assert(exercise.days.join("|") === expectedDays.join("|"),
    `${exercise.id}: compatibility day aliases diverge`);

  if (exercise.gate) {
    assert(Boolean(readiness[exercise.gate]), `${exercise.id}: unknown gate ${exercise.gate}`);
    if (exercise.gate !== "G0_LOAD") {
      assert(Boolean(exercise.fallbackId),
        `${exercise.id}: ${exercise.gate} requires an explicit fallbackId`);
    }
  }
  if (exercise.fallbackId) {
    const fallback = exercises[exercise.fallbackId];
    assert(Boolean(fallback), `${exercise.id}: missing fallback ${exercise.fallbackId}`);
    assert(exercise.fallbackId !== exercise.id, `${exercise.id}: cannot fall back to itself`);
    if (fallback) {
      assert(fallback.level === "ALL" || exercise.level === "ALL" ||
        rank(fallback.level) <= rank(exercise.level),
      `${exercise.id}: fallback ${fallback.id} is harder`);
    }
  }
  if (exercise.easierId) assert(Boolean(exercises[exercise.easierId]), `${exercise.id}: missing easier neighbor ${exercise.easierId}`);
  if (exercise.harderId) assert(Boolean(exercises[exercise.harderId]), `${exercise.id}: missing harder neighbor ${exercise.harderId}`);

  const media = exercise.media;
  assert(media && validMediaKinds.has(media.kind), `${exercise.id}: invalid media kind`);
  assert(media && validStatuses.has(media.status), `${exercise.id}: invalid media status`);
  assert(media?.specification?.trim().length >= 20,
    `${exercise.id}: media specification is too vague`);
  assert(Boolean(media?.src || media?.motion), `${exercise.id}: missing media pointer`);
  if (media && validStatuses.has(media.status)) mediaCounts[media.status] += 1;
  if (media?.motion) {
    mediaCounts.motion += 1;
    const quotedDouble = `"${media.motion}"`;
    const quotedSingle = `'${media.motion}'`;
    assert(motionGuideSource.includes(quotedDouble) || motionGuideSource.includes(quotedSingle),
      `${exercise.id}: unregistered motion guide ${media.motion}`);
  }
  if (media?.src) {
    mediaCounts.files += 1;
    const clean = media.src.split(/[?#]/u)[0];
    assert(!/^https?:/u.test(clean), `${exercise.id}: external media is not offline-safe`);
    assert(Boolean(media.motion) || !clean.toLowerCase().endsWith(".gif"),
      `${exercise.id}: an exercise may not rely on a legacy two-frame GIF`);
    const relative = clean.replace(/^\/parallettes\//u, "").replace(/^\//u, "");
    const asset = join(projectRoot, "public", relative);
    assert(existsSync(asset), `${exercise.id}: missing media file ${relative}`);
  }
}

// Fallback graphs must terminate. G0 is intentionally a hard-stop pain gate,
// so it is considered satisfied while testing higher-readiness regressions.
for (const exercise of exerciseList.filter((item) => item.gate && item.gate !== "G0_LOAD")) {
  const visited = new Set();
  let current = exercise;
  while (current?.gate && current.gate !== "G0_LOAD") {
    if (visited.has(current.id)) {
      fail(`${exercise.id}: fallback cycle at ${current.id}`);
      break;
    }
    visited.add(current.id);
    if (!current.fallbackId || !exercises[current.fallbackId]) break;
    current = exercises[current.fallbackId];
  }
}

// All five days × three levels must exist exactly once.
assert(workoutVariants.length === 15,
  `Expected 15 day/level variants; found ${workoutVariants.length}`);
assert(programmeSummary?.workoutVariants === 15,
  "Programme summary does not report 15 variants");
const variantKeys = workoutVariants.map((variant) => variantKey(variant.day, variant.level));
assert(new Set(variantKeys).size === 15, "Day/level variants are not unique");
for (let day = 1; day <= 5; day += 1) {
  for (const level of ["L1", "L2", "L3"]) {
    assert(variantKeys.includes(variantKey(day, level)), `Missing Day ${day} ${level}`);
  }
}

const allReady = Object.fromEntries(Object.keys(readiness).map((gate) => [gate, true]));
const dayResults = [];
let extendedPlans = 0;

for (const variant of workoutVariants) {
  const prefix = `Day ${variant.day} ${variant.level}`;
  assert(variant.warmup.length === 3, `${prefix}: warm-up must have 3 slots`);
  assert(variant.pre.length === 2, `${prefix}: preparation must have 2 slots`);
  assert(variant.core.length === 4, `${prefix}: core must have 4 slots`);
  assert(variant.cooldown.length === 2, `${prefix}: cooldown must have 2 slots`);
  assert(variant.level === "L1" ? !variant.lab : Boolean(variant.lab),
    `${prefix}: Lab must be absent at L1 and present at L2/L3`);
  if (variant.lab) assert(variant.lab.a !== variant.lab.b, `${prefix}: Lab A and B must differ`);

  const slots = slotsForVariant(variant, exercises, false);
  assert(slots.length === 12, `${prefix}: default plan must have 12 stable slots`);
  assert(new Set(slots.map((slot) => slot.id)).size === slots.length,
    `${prefix}: duplicate default slot IDs`);
  for (const slot of slots) {
    const exercise = exercises[slot.defaultExerciseId];
    assert(Boolean(exercise), `${prefix}/${slot.id}: missing ${slot.defaultExerciseId}`);
    if (!exercise) continue;
    assert(isExerciseCompatible(exercise, slot, variant.day, variant.level),
      `${prefix}/${slot.id}: ${exercise.id} violates block/focus/day/level compatibility`);
  }

  let plan25;
  try {
    plan25 = buildSessionPlan({ variant, exercises, readiness: allReady });
    assert(plan25.totalSeconds === 1500,
      `${prefix}: default plan is ${plan25.totalSeconds}s, expected 1500s`);
    assert(plan25.intervals.length === 50,
      `${prefix}: default plan has ${plan25.intervals.length} intervals, expected 50`);
    const parsedSnapshot = parsePlanSnapshot(
      JSON.stringify(createPlanSnapshot(plan25, "2026-01-01T00:00:00.000Z")),
    );
    assert(parsedSnapshot?.plan.totalSeconds === 1500, `${prefix}: snapshot round-trip failed`);
    const start = locateTimerPosition(plan25, 0);
    const acrossSeveralIntervals = locateTimerPosition(plan25, 245);
    const finished = locateTimerPosition(plan25, 1500);
    assert(start.intervalIndex === 0 && start.remaining === 45,
      `${prefix}: timer start position is wrong`);
    assert(acrossSeveralIntervals.intervalIndex > 1,
      `${prefix}: absolute timer catch-up did not cross intervals`);
    assert(finished.complete && finished.remaining === 0,
      `${prefix}: timer completion position is wrong`);
  } catch (error) {
    fail(`${prefix}: plan build failed: ${error.message}`);
  }

  if (variant.lab) {
    try {
      const slots30 = slotsForVariant(variant, exercises, true);
      assert(slots30.length === 14, `${prefix}: extended plan must have 14 stable slots`);
      const plan30 = buildSessionPlan({
        variant,
        exercises,
        includeLab: true,
        readiness: allReady,
      });
      assert(plan30.totalSeconds === 1800,
        `${prefix}: extended plan is ${plan30.totalSeconds}s, expected 1800s`);
      assert(plan30.intervals.length === 60,
        `${prefix}: extended plan has ${plan30.intervals.length} intervals, expected 60`);
      const pattern = plan30.intervals
        .filter((interval) => interval.block === "lab" && interval.kind === "work")
        .map((interval) => interval.slotId)
        .join("/");
      assert(pattern === "lab-a/lab-b/lab-a/lab-b/lab-a",
        `${prefix}: Lab sequence is not A/B/A/B/A`);
      const labPosition = locateTimerPosition(plan30, 1501);
      assert(labPosition.interval?.block === "lab",
        `${prefix}: 25:01 should be inside the Calisthenics Lab`);
      extendedPlans += 1;
    } catch (error) {
      fail(`${prefix}: extended plan build failed: ${error.message}`);
    }
  }

  // Swap results are derived, not trusted from hand-maintained arrays.
  for (const slot of slotsForVariant(variant, exercises, Boolean(variant.lab))) {
    const base = exercises[slot.defaultExerciseId];
    for (const difficulty of ["same", "easier", "harder"]) {
      const candidates = compatibleSwaps({
        slot,
        exercises,
        day: variant.day,
        level: variant.level,
        readiness: allReady,
        difficulty,
      });
      assert(new Set(candidates.map((item) => item.id)).size === candidates.length,
        `${prefix}/${slot.id}: duplicate ${difficulty} swaps`);
      for (const candidate of candidates) {
        assert(isExerciseStructurallyCompatible(candidate, slot, variant.day),
          `${prefix}/${slot.id}: incompatible ${difficulty} swap ${candidate.id}`);
        assert(supportsLevel(candidate, variant.level),
          `${prefix}/${slot.id}: unavailable-level swap ${candidate.id}`);
        assert(supportsDay(candidate, variant.day),
          `${prefix}/${slot.id}: wrong-day swap ${candidate.id}`);
        if (difficulty === "same") {
          assert(candidate.level === base.level || candidate.level === "ALL",
            `${prefix}/${slot.id}: ${candidate.id} is not same-level`);
        } else if (difficulty === "easier") {
          assert(base.level !== "ALL" && candidate.level !== "ALL" &&
            rank(candidate.level) === rank(base.level) - 1,
          `${prefix}/${slot.id}: ${candidate.id} is not one level easier`);
        } else {
          assert(base.level !== "ALL" && candidate.level !== "ALL" &&
            rank(candidate.level) === rank(base.level) + 1,
          `${prefix}/${slot.id}: ${candidate.id} is not one level harder`);
        }
      }
    }
  }

  dayResults.push(`${prefix}: 25:00${variant.lab ? " / 30:00 with Lab" : ""}`);
}

assert(extendedPlans === 10, `Expected 10 L2/L3 extended plans; found ${extendedPlans}`);
assert(timing.defaultTotal === 1500 && timing.extendedTotal === 1800,
  "Programme timing constants are not exactly 25/30 minutes");

// Timing overrides are tied to stable slots and repeat only where that slot is
// scheduled. This guards against the old exercise-ID/reset-index leakage.
const l2Variant = workoutVariants.find((variant) => variant.day === 1 && variant.level === "L2");
if (l2Variant) {
  try {
    const custom = buildSessionPlan({
      variant: l2Variant,
      exercises,
      includeLab: true,
      readiness: allReady,
      timings: { "core-1": { work: 45 }, "lab-a": { work: 35 } },
    });
    assert(custom.totalSeconds === 1830,
      `Stable-slot custom timing expected 1830s; found ${custom.totalSeconds}s`);
  } catch (error) {
    fail(`Stable-slot custom timing plan failed: ${error.message}`);
  }
}

// Versioned local-state parsing must preserve safe preferences and reject
// malformed/out-of-range values without crashing the app.
const defaults = defaultStoredAppState();
assert(defaults.version === APP_STORAGE_VERSION && defaults.selectedDay === 1,
  "Default storage state is invalid");
const legacy = parseStoredAppState({ selectedDay: 2, soundOn: false, swaps: { unsafe: true } });
assert(legacy.selectedDay === 3 && legacy.soundOn === false,
  "Legacy settings migration failed");
assert(Object.keys(legacy.swapsByVariant).length === 0,
  "Unsafe legacy exercise-keyed swaps should not migrate");
const corrupt = parseStoredAppState("not-json");
assert(corrupt.selectedDay === 1 && corrupt.version === APP_STORAGE_VERSION,
  "Corrupt settings did not recover to defaults");

console.log(dayResults.join("\n"));
console.log(
  `${exerciseList.length} exercises (${originalExercises.length} retained + ` +
  `${newExercises.length} new); ${workoutVariants.length} variants; ` +
  `${extendedPlans} optional 30-minute plans`,
);
console.log(
  `Media pointers: ${mediaCounts.files} files, ${mediaCounts.motion} motion IDs; ` +
  `${mediaCounts.ready} ready, ${mediaCounts.audit} audit, ${mediaCounts.required} required`,
);

if (failures.length) {
  console.error(`\n${failures.length} validation failure(s):`);
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("All programme, timing, swap, gate, media, timer and storage checks passed.");
}
