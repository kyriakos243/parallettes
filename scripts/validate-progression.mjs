import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = (path) => ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.env.BASE_URL", '"/parallettes/"'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const load = (path, imports = {}) => {
  const loaded = { exports: {} };
  new Function("exports", "module", "require", compile(path))(loaded.exports, loaded, (name) => imports[name] ?? require(name));
  return loaded.exports;
};

const program = load("app/program.ts");
const session = load("app/session.ts");
const progression = load("app/progression.ts", { "./program": program });
const custom = load("app/custom.ts", { "./program": program, "./progression": progression });
const {
  exercises, readiness, skillProgressionPaths, workoutVariants,
} = program;
const {
  adaptSwapsForEquipment, applyExerciseReviews, applySessionProgression, buildSessionPlan, compatibleSwaps,
  nextProgramDayAfterSession, reviewableExerciseIdsFor, slotsForVariant,
} = session;
const {
  eligibleProgressionTarget, progressionPathState, progressionScoreAdjustment,
  recommendedProgressionAssignments, recommendedProgressionExercise,
} = progression;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const allReady = Object.fromEntries(Object.keys(readiness).map((id) => [id, true]));
const allEquipment = ["parallettes", "floor", "wall", "rope"];
const reviewableCategories = new Set(["Pre-Handstand", "Handstand", "Abs", "Core", "Calisthenics", "Conditioning"]);
const levelRank = (level) => level === "ALL" ? 0 : ({ L1: 1, L2: 2, L3: 3 })[level];
const cleanReview = (ids) => Object.fromEntries(ids.map((id) => [id, { feedback: "easy", achieved: true }]));
const rightReview = (ids) => Object.fromEntries(ids.map((id) => [id, { feedback: "right", achieved: false }]));
const hardReview = (ids) => Object.fromEntries(ids.map((id) => [id, { feedback: "hard", achieved: false }]));

// Post-workout controls are a strict two-session threshold. Just Right, Too
// Hard, duplicate circuit rounds, Practice and Guest must never add evidence.
let evidence = applyExerciseReviews({}, ["demo", "demo", "demo"], cleanReview(["demo"]));
assert(evidence.demo.cleanSessions === 1, "One workout or repeated rounds counted as multiple clean sessions");
evidence = applyExerciseReviews(evidence, ["demo"], rightReview(["demo"]));
assert(evidence.demo.cleanSessions === 1 && evidence.demo.lastFeedback === "right", "Right level changed mastery evidence");
evidence = applyExerciseReviews(evidence, ["demo"], hardReview(["demo"]));
assert(evidence.demo.cleanSessions === 1 && evidence.demo.lastFeedback === "hard", "Too hard changed mastery evidence");
evidence = applyExerciseReviews(evidence, ["demo"], cleanReview(["demo"]));
assert(evidence.demo.cleanSessions === 2, "Two Ready-to-progress workouts did not unlock progression");
assert(applySessionProgression(evidence, ["other"], cleanReview(["other"]), "practice") === evidence,
  "Practice mode mutated progression");
assert(applySessionProgression(evidence, ["other"], cleanReview(["other"]), "guest") === evidence,
  "Guest mode mutated progression");
assert(applySessionProgression(evidence, ["other"], cleanReview(["other"]), "normal").other.cleanSessions === 1,
  "Normal Custom/Recommended work did not contribute progression");
assert(nextProgramDayAfterSession(3, 0, "complete", "normal") === 3,
  "A normal Custom Session consumed a five-day Program day");
assert(nextProgramDayAfterSession(3, 3, "partial", "normal") === 3,
  "A partial Recommended session advanced the Program day");
assert(nextProgramDayAfterSession(3, 3, "complete", "practice") === 3,
  "A Practice session advanced the Program day");
assert(nextProgramDayAfterSession(3, 3, "modified", "normal") === 4,
  "A completed modified Recommended session failed to advance the Program day");

// Every Skills path must be trainable and must expose one coherent current
// step after each repeated pair of clean sessions.
for (const path of skillProgressionPaths) {
  assert(path.steps.length >= 3, `${path.label}: path is too short`);
  assert(path.steps.every((id) => Boolean(exercises[id])), `${path.label}: contains a missing exercise`);
  for (let index = 1; index < path.steps.length; index += 1) {
    const previous = exercises[path.steps[index - 1]];
    const current = exercises[path.steps[index]];
    assert(levelRank(current.level) >= levelRank(previous.level),
      `${path.label}: ${current.name} (${current.level}) is labelled easier than preceding ${previous.name} (${previous.level})`);
  }
  assert(path.steps.some((id) => reviewableCategories.has(exercises[id].category)),
    `${path.label}: visible path has no post-workout-reviewable movement`);
  const customRoute = ["easy", "recommended", "hard"].some((difficulty) => path.steps.some((id) =>
    custom.isCustomExerciseEligible(exercises[id], {
      focuses: [path.customFocus], equipment: allEquipment, difficulty, readiness: allReady,
    })));
  assert(customRoute, `${path.label}: visible path has no Custom-selectable route`);
  const root = progressionPathState(path.steps, {});
  assert(root.masteredThrough === -1 && root.recommendedIndex === 0 && !root.complete && !root.activeHard,
    `${path.label}: new-profile state is invalid`);
  const hardRoot = progressionPathState(path.steps, { [path.steps[0]]: { cleanSessions: 2, lastFeedback: "hard" } });
  assert(hardRoot.recommendedIndex === 0 && hardRoot.activeHard && !hardRoot.complete,
    `${path.label}: Too Hard on the root incorrectly recommended progression`);
  let pathEvidence = {};
  for (let index = 0; index < path.steps.length; index += 1) {
    const id = path.steps[index];
    pathEvidence = applyExerciseReviews(pathEvidence, [id], cleanReview([id]));
    assert(progressionPathState(path.steps, pathEvidence).masteredThrough === index - 1,
      `${path.label}: one clean session prematurely mastered ${id}`);
    pathEvidence = applyExerciseReviews(pathEvidence, [id], cleanReview([id]));
    const state = progressionPathState(path.steps, pathEvidence);
    assert(state.masteredThrough === index, `${path.label}: two clean sessions failed to master ${id}`);
    assert(state.recommendedIndex === Math.min(path.steps.length - 1, index + 1),
      `${path.label}: Skills tab did not reveal the next step after ${id}`);
  }
  assert(progressionPathState(path.steps, pathEvidence).complete, `${path.label}: complete path was not marked complete`);
  const hardFinalEvidence = { ...pathEvidence, [path.steps.at(-1)]: { cleanSessions: 2, lastFeedback: "hard" } };
  const hardFinal = progressionPathState(path.steps, hardFinalEvidence);
  assert(!hardFinal.complete && hardFinal.activeHard && hardFinal.recommendedIndex === path.steps.length - 2,
    `${path.label}: Too Hard on the final step incorrectly remained mastered`);

  if (path.steps.length > 1) {
    const harder = path.steps[1];
    const hardEvidence = { [harder]: { cleanSessions: 0, lastFeedback: "hard" } };
    const state = progressionPathState(path.steps, hardEvidence);
    assert(state.recommendedIndex === 0 && state.regressedAfterHard,
      `${path.label}: Too Hard did not regress exactly one stage`);
    const easierScore = progressionScoreAdjustment(exercises[path.steps[0]], exercises, hardEvidence, () => true, skillProgressionPaths);
    const hardScore = progressionScoreAdjustment(exercises[harder], exercises, hardEvidence, () => true, skillProgressionPaths);
    assert(easierScore > hardScore, `${path.label}: Custom scoring did not favor the easier logical step after Too Hard`);
  }
}

// A completed harder step proves earlier stages even when it came from an
// imported profile or Custom session; stale hard marks below it cannot regress
// the Skills display.
{
  const path = skillProgressionPaths.find((item) => item.label === "Compression");
  const imported = {
    [path.steps[0]]: { cleanSessions: 0, lastFeedback: "hard" },
    [path.steps[3]]: { cleanSessions: 2, lastFeedback: "easy" },
  };
  const state = progressionPathState(path.steps, imported);
  assert(state.masteredThrough === 3 && state.recommendedIndex === 4 && !state.regressedAfterHard,
    "A stale easier-stage hard mark overrode demonstrated harder skill work");
}

// Exercise recommendations can cross same-level stages and continue farther
// than the first successor, but only from evidence performed in this slot.
{
  const path = skillProgressionPaths.find((item) => item.label === "Hollow / Anti-Extension");
  assert(path, "Hollow path is missing");
  let slotEvidence = {};
  const base = "hollow-tuck";
  const baseIndex = path.steps.indexOf(base);
  const baseOnly = recommendedProgressionExercise(base, exercises, slotEvidence, () => true, skillProgressionPaths);
  assert(baseOnly.exerciseId === base, "An unmastered slot was changed by unrelated family evidence");
  slotEvidence = { "deadbug-double-leg-lower": { cleanSessions: 2, lastFeedback: "easy" } };
  assert(recommendedProgressionExercise(base, exercises, slotEvidence, () => true, skillProgressionPaths).exerciseId === base,
    "A different same-family exercise hijacked the stable slot");
  slotEvidence = { [base]: { cleanSessions: 2, lastFeedback: "easy" } };
  let recommendation = recommendedProgressionExercise(base, exercises, slotEvidence, () => true, skillProgressionPaths);
  assert(recommendation.exerciseId === path.steps[baseIndex + 1], "Same-level successor was not recommended");
  slotEvidence[recommendation.exerciseId] = { cleanSessions: 2, lastFeedback: "easy" };
  recommendation = recommendedProgressionExercise(base, exercises, slotEvidence, () => true, skillProgressionPaths);
  assert(recommendation.exerciseId === path.steps[baseIndex + 2], "Repeated clean sessions stalled after one transition");
  slotEvidence[recommendation.exerciseId] = { cleanSessions: 0, lastFeedback: "hard" };
  assert(recommendedProgressionExercise(base, exercises, slotEvidence, () => true, skillProgressionPaths).exerciseId === path.steps[baseIndex + 1],
    "Too Hard on a recommended successor did not restore the preceding clean step");
}

const assignmentsFor = (variant, progressionEvidence, fixed = {}) => {
  const slots = slotsForVariant(variant, exercises, variant.level !== "L1");
  const compatible = new Map(slots.map((slot) => [slot.id, new Set(compatibleSwaps({
    slot, exercises, day: variant.day, level: variant.level, readiness: allReady,
    difficulty: "all", equipment: allEquipment,
  }).map((item) => item.id))]));
  return {
    slots,
    assignments: recommendedProgressionAssignments(
      slots, exercises, progressionEvidence,
      (slot, exercise) => compatible.get(slot.id)?.has(exercise.id) === true,
      skillProgressionPaths, fixed,
    ),
  };
};

// A brand-new athlete has no readiness gates. Different locked movements may
// share the same fallback, but the visible plan must still contain distinct
// drills rather than silently repeating that fallback in multiple cards.
for (const variant of workoutVariants) {
  const slots = slotsForVariant(variant, exercises, variant.level !== "L1");
  const baselineReadiness = { G0_LOAD: true };
  const adapted = adaptSwapsForEquipment({
    slots, exercises, swaps: {}, day: variant.day, level: variant.level,
    readiness: baselineReadiness, equipment: ["parallettes", "floor", "wall", "rope"],
  });
  const plan = buildSessionPlan({
    variant, exercises, includeLab: variant.level !== "L1",
    swaps: adapted.swaps, readiness: baselineReadiness,
  });
  const visibleIds = slots.map((slot) => plan.intervals.find((interval) => interval.kind === "work" && interval.slotId === slot.id)?.exerciseId);
  assert(visibleIds.every(Boolean), `${variant.day}/${variant.level}: a no-readiness slot became unavailable`);
  assert(new Set(visibleIds).size === visibleIds.length,
    `${variant.day}/${variant.level}: no-readiness fallbacks created duplicate drills ${visibleIds.join(", ")}`);
}

// Simulate six complete normal workout cycles for every day/level. Every
// resolved plan remains unique, executable, and progresses only after two
// separate post-workout reviews. This includes the Day 1 duplicate regression.
for (const variant of workoutVariants) {
  let progressionEvidence = {};
  let previousAssignments = null;
  for (let cycle = 0; cycle < 6; cycle += 1) {
    const { slots, assignments } = assignmentsFor(variant, progressionEvidence);
    const ids = slots.map((slot) => assignments[slot.id]).filter(Boolean);
    assert(ids.length === slots.length, `${variant.day}/${variant.level}/cycle${cycle}: an exercise slot is unresolved`);
    assert(new Set(ids).size === ids.length, `${variant.day}/${variant.level}/cycle${cycle}: duplicate exercises ${ids.join(", ")}`);
    const swaps = Object.fromEntries(slots.flatMap((slot) => assignments[slot.id] !== slot.defaultExerciseId
      ? [[slot.id, assignments[slot.id]]]
      : []));
    const plan = buildSessionPlan({ variant, exercises, includeLab: variant.level !== "L1", swaps, readiness: allReady });
    const reviewable = reviewableExerciseIdsFor(plan, plan.totalSeconds);
    const afterOne = applySessionProgression(progressionEvidence, reviewable, cleanReview(reviewable), "normal");
    const interim = assignmentsFor(variant, afterOne).assignments;
    assert(JSON.stringify(interim) === JSON.stringify(assignments),
      `${variant.day}/${variant.level}/cycle${cycle}: progressed after only one clean workout`);
    progressionEvidence = applySessionProgression(afterOne, reviewable, cleanReview(reviewable), "normal");
    const next = assignmentsFor(variant, progressionEvidence).assignments;
    const nextIds = slots.map((slot) => next[slot.id]);
    assert(new Set(nextIds).size === nextIds.length,
      `${variant.day}/${variant.level}/cycle${cycle}: progression created duplicate exercises`);
    if (cycle === 0) {
      // Any change must be one linked logical step and remain structurally valid.
      for (const slot of slots) {
        const before = assignments[slot.id];
        const after = next[slot.id];
        if (before === after) continue;
        const recommendation = recommendedProgressionExercise(before, exercises, progressionEvidence, () => true, skillProgressionPaths);
        assert(recommendation.path.includes(after), `${variant.day}/${variant.level}: ${before} changed to unrelated ${after}`);
      }
    }
    previousAssignments = assignments;
  }
  assert(previousAssignments, `${variant.day}/${variant.level}: normal simulation did not run`);
}

// Exact Day 1 L2 browser regression: two Hollow-family slots must never both
// become One-Leg Hollow Extension, and Pike Shift may remain when its direct
// successor belongs to another stable block.
{
  const variant = workoutVariants.find((item) => item.day === 1 && item.level === "L2");
  let progressionEvidence = {};
  const first = assignmentsFor(variant, progressionEvidence);
  const plan = buildSessionPlan({ variant, exercises, swaps: {}, readiness: allReady });
  const ids = reviewableExerciseIdsFor(plan, plan.totalSeconds);
  progressionEvidence = applyExerciseReviews(progressionEvidence, ids, cleanReview(ids));
  progressionEvidence = applyExerciseReviews(progressionEvidence, ids, cleanReview(ids));
  const second = assignmentsFor(variant, progressionEvidence).assignments;
  const selected = first.slots.map((slot) => second[slot.id]);
  assert(new Set(selected).size === selected.length, `Day 1 L2 reproduced duplicate after two workouts: ${selected.join(", ")}`);
  const pikeSlot = first.slots.find((slot) => slot.defaultExerciseId === "pike-shift");
  assert(second[pikeSlot.id] === "pike-shift", "Pike Shift incorrectly crossed into an incompatible handstand slot");
}

// Custom Session targeting uses the next *eligible* safe stage for its current
// equipment/level/readiness, rather than rewarding an unavailable absolute root.
for (const path of skillProgressionPaths) {
  const focus = path.customFocus;
  let progressionEvidence = {};
  for (let transition = 0; transition < Math.min(4, path.steps.length); transition += 1) {
    const id = path.steps[transition];
    progressionEvidence = applyExerciseReviews(progressionEvidence, [id], cleanReview([id]));
    progressionEvidence = applyExerciseReviews(progressionEvidence, [id], cleanReview([id]));
  }
  for (const difficulty of ["easy", "recommended", "hard"]) {
    for (const equipment of [allEquipment, ["parallettes", "floor"], ["floor", "wall"], ["floor"]]) {
      const plan = custom.buildCustomSession({
        focuses: [focus], equipment, seconds: 1500, difficulty, readiness: allReady,
        progressionEvidence, preferNextProgression: true, preferVariety: false, variationSeed: 1,
      });
      assert(plan.items.length > 0, `${path.label}/${difficulty}/${equipment.join("+")}: Custom plan is empty`);
      for (const item of plan.items) {
        const exercise = exercises[item.exerciseId];
        assert((exercise.requiredEquipment ?? []).every((required) => equipment.includes(required)),
          `${path.label}: Custom progression bypassed equipment for ${item.exerciseId}`);
        assert(!exercise.gate || allReady[exercise.gate], `${path.label}: Custom progression bypassed readiness for ${item.exerciseId}`);
      }
    }
  }
}

// Complete actual Custom plans twice in Normal mode, then regenerate from the
// resulting profile evidence. Every performed review is credited once per
// session, Custom remains day 0, and at least one focus-specific recommendation
// responds to the accumulated evidence.
for (const focus of ["handstand", "core", "compression", "lsit", "planche", "pushing", "support"]) {
  const request = {
    focuses: [focus], equipment: allEquipment, seconds: 1800, difficulty: "recommended",
    readiness: allReady, preferNextProgression: true, preferVariety: false, variationSeed: 17,
  };
  const before = custom.buildCustomSession(request);
  const performed = [...new Set(before.items.filter((item) => !["warmup", "cooldown"].includes(item.block)).map((item) => item.exerciseId))];
  let customEvidence = applySessionProgression({}, performed, cleanReview(performed), "normal");
  customEvidence = applySessionProgression(customEvidence, performed, cleanReview(performed), "normal");
  assert(performed.every((id) => customEvidence[id]?.cleanSessions === 2),
    `${focus}: two normal Custom sessions did not persist performed exercise evidence`);
  assert(nextProgramDayAfterSession(4, 0, "complete", "normal") === 4,
    `${focus}: Custom progression changed the Program sequence`);
  const after = custom.buildCustomSession({ ...request, progressionEvidence: customEvidence });
  const afterIds = new Set(after.items.map((item) => item.exerciseId));
  const hasLogicalResponse = performed.some((id) => {
    const recommendation = recommendedProgressionExercise(id, exercises, customEvidence, () => true, skillProgressionPaths, true);
    return recommendation?.exerciseId !== id && afterIds.has(recommendation.exerciseId);
  });
  assert(hasLogicalResponse || performed.every((id) => !exercises[id].harderId),
    `${focus}: regenerated Custom session ignored all newly unlocked progressions`);
}

// Direct score proof for an L3-only context whose root is unavailable: the
// first eligible unmastered step wins, while mastered/unavailable roots do not.
{
  const path = skillProgressionPaths.find((item) => item.label === "Pushing Strength");
  const evidence = Object.fromEntries(path.steps.slice(0, 4).map((id) => [id, { cleanSessions: 2, lastFeedback: "easy" }]));
  const canUse = (exercise) => exercise.availableLevels.includes("L3") && (exercise.requiredEquipment ?? []).every((item) => ["parallettes", "floor"].includes(item)) && (!exercise.gate || allReady[exercise.gate]);
  const target = eligibleProgressionTarget(path.steps, evidence, (id) => canUse(exercises[id]));
  assert(target.targetIndex >= 4, "Eligible progression target fell back to an already mastered unavailable root");
  const scores = path.steps.filter((id) => canUse(exercises[id])).map((id) => [id, progressionScoreAdjustment(exercises[id], exercises, evidence, canUse, skillProgressionPaths)]);
  const winner = scores.sort((a, b) => b[1] - a[1])[0]?.[0];
  assert(winner === path.steps[target.targetIndex], `Custom score chose ${winner} instead of eligible next ${path.steps[target.targetIndex]}`);
}

console.log(`Progression: ${workoutVariants.length} normal variants × 6 repeated cycles, ${skillProgressionPaths.length} Skills paths, Custom eligibility contexts, Ready/Right/Hard behavior, mode isolation and duplicate prevention passed.`);
