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
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const program = load("app/program.ts");
const progression = load("app/progression.ts", { "./program": program });
const assessment = load("app/assessment.ts", { "./program": program, "./progression": progression });
const session = load("app/session.ts", { "./program": program });
const custom = load("app/custom.ts", { "./program": program, "./progression": progression });
const { exercises, skillProgressionPaths } = program;
const {
  answerAssessmentQuestion,
  assessmentProgress,
  assessmentQuestions,
  assessmentSections,
  assessmentTracks,
  emptyStartingAssessment,
  evidenceWithProvisionalPlacement,
  parseStartingAssessment,
  reopenAssessmentTrack,
  restartStartingAssessment,
  suggestedWorkoutLevel,
  undoLastAssessmentAnswer,
  validateAssessmentTracks,
  visibleProvisionalIndex,
} = assessment;

const trackErrors = validateAssessmentTracks(exercises, skillProgressionPaths);
assert(trackErrors.length === 0, trackErrors.join("\n"));
assert(assessmentSections.length === 4 && new Set(assessmentTracks.map((track) => track.section)).size === 4,
  "Assessment is not divided into Abs/Core, Support, Handstand and Calisthenics");
assert(assessmentTracks.length >= 12 && assessmentTracks.length <= 15,
  `Assessment should use 12–15 representative families, found ${assessmentTracks.length}`);

const start = emptyStartingAssessment("in-progress");
assert(assessmentQuestions(start).length === assessmentTracks.length, "A new assessment did not start with one card per family");
assert(assessmentProgress(start).completedTracks === 0, "A new assessment incorrectly reported completed tracks");

// Clean on the first anchor must branch to a harder card without prematurely
// applying a placement. The second response resolves exactly one family.
const firstQuestion = assessmentQuestions(start)[0];
const afterFirstClean = answerAssessmentQuestion(start, firstQuestion, "clean", skillProgressionPaths);
assert(assessmentQuestions(afterFirstClean)[0].track.id === firstQuestion.track.id &&
  assessmentQuestions(afterFirstClean)[0].anchorIndex === 1,
  "A clean first anchor did not reveal the harder adaptive card");
assert(!afterFirstClean.placements[firstQuestion.track.pathLabel], "An unfinished adaptive branch was counted as placed");
const afterSecondAlmost = answerAssessmentQuestion(afterFirstClean, assessmentQuestions(afterFirstClean)[0], "almost", skillProgressionPaths);
assert(afterSecondAlmost.placements[firstQuestion.track.pathLabel] === firstQuestion.track.anchors[1],
  "Almost on the harder anchor did not place the athlete at that exercise");

// Back removes only the latest adaptive answer, recomputes that family's
// placement and survives the same JSON round-trip used by profile sync.
const serializedAdaptiveBranch = parseStartingAssessment(JSON.parse(JSON.stringify(afterSecondAlmost)));
const backToHarderCard = undoLastAssessmentAnswer(serializedAdaptiveBranch, skillProgressionPaths);
assert(backToHarderCard.answers[`${firstQuestion.track.id}:0`] === "clean" &&
  !backToHarderCard.answers[`${firstQuestion.track.id}:1`] &&
  !backToHarderCard.placements[firstQuestion.track.pathLabel] &&
  assessmentQuestions(backToHarderCard)[0]?.anchorIndex === 1,
"Back did not reopen the harder adaptive card without losing the first answer");
const backToFirstCard = undoLastAssessmentAnswer(backToHarderCard, skillProgressionPaths);
assert(!Object.keys(backToFirstCard.answers).length && !backToFirstCard.answerOrder.length &&
  assessmentQuestions(backToFirstCard)[0]?.anchorIndex === 0,
"A second Back did not return to the original first card cleanly");

// All three routes must be safe and resumable through JSON profile storage.
for (const answer of ["clean", "almost", "not-yet"]) {
  let state = emptyStartingAssessment("in-progress");
  let guard = 0;
  while (assessmentQuestions(state).length) {
    state = answerAssessmentQuestion(state, assessmentQuestions(state)[0], answer, skillProgressionPaths);
    if (++guard > assessmentTracks.length * 2) throw new Error(`${answer}: adaptive questionnaire did not terminate`);
  }
  assert(state.status === "review", `${answer}: completed questions skipped the review/apply step`);
  assert(assessmentProgress(state).completedTracks === assessmentTracks.length, `${answer}: not every family received a placement`);
  const restored = parseStartingAssessment(JSON.parse(JSON.stringify(state)));
  assert(JSON.stringify(restored.answers) === JSON.stringify(state.answers) && JSON.stringify(restored.placements) === JSON.stringify(state.placements),
    `${answer}: assessment did not resume faithfully after profile serialization`);
}

const completeAssessment = (answerFor) => {
  let state = emptyStartingAssessment("in-progress");
  let guard = 0;
  while (assessmentQuestions(state).length) {
    const question = assessmentQuestions(state)[0];
    state = answerAssessmentQuestion(state, question, answerFor(question), skillProgressionPaths);
    if (++guard > assessmentTracks.length * 2) throw new Error("Suggested-level assessment did not terminate");
  }
  return state;
};

const l1Assessment = completeAssessment(() => "not-yet");
const l2Assessment = completeAssessment(() => "almost");
const l3Assessment = completeAssessment(() => "clean");
assert(suggestedWorkoutLevel(l1Assessment) === "L1", "Not-yet answers did not produce the conservative L1 start");
assert(suggestedWorkoutLevel(l2Assessment) === "L2", "Broad first-anchor ability did not produce an L2 start");
assert(suggestedWorkoutLevel(l3Assessment) === "L3", "Clean harder anchors did not produce an L3 start");

// Advanced totals alone cannot bypass the support prerequisite for L3.
const l3WithoutSupport = completeAssessment((question) =>
  question.track.section === "Support" && question.anchorIndex === 1 ? "not-yet" : "clean");
assert(suggestedWorkoutLevel(l3WithoutSupport) === "L2",
  "L3 was suggested despite an incomplete support prerequisite");

// Change one family from the result screen without erasing the other thirteen
// answers, their placements or a previously applied assessment.
const editable = { ...l3Assessment, appliedPlacements: { ...l3Assessment.placements } };
const trackToEdit = assessmentTracks.find((track) => track.id === "compression");
const reopened = reopenAssessmentTrack(editable, trackToEdit.id);
assert(reopened.status === "in-progress" &&
  !reopened.placements[trackToEdit.pathLabel] &&
  !Object.keys(reopened.answers).some((key) => key.startsWith(`${trackToEdit.id}:`)) &&
  assessmentProgress(reopened).completedTracks === assessmentTracks.length - 1 &&
  Object.keys(reopened.appliedPlacements).length === assessmentTracks.length,
"Changing one assessment family erased unrelated or already-applied results");
assert(assessmentQuestions(reopened).length === 1 && assessmentQuestions(reopened)[0].track.id === trackToEdit.id,
  "Changing one assessment family reopened more than that family");
const editedFamily = answerAssessmentQuestion(reopened, assessmentQuestions(reopened)[0], "not-yet", skillProgressionPaths);
const untouchedTrack = assessmentTracks.find((track) => track.id === "hollow");
assert(editedFamily.status === "review" &&
  editedFamily.placements[trackToEdit.pathLabel] !== l3Assessment.placements[trackToEdit.pathLabel] &&
  editedFamily.placements[untouchedTrack.pathLabel] === l3Assessment.placements[untouchedTrack.pathLabel],
"A changed family did not return to review with its new result and unrelated placements intact");

// V1 profiles created before answerOrder existed remain resumable, and a
// completed legacy placement becomes the last applied result.
const legacyAssessment = parseStartingAssessment({
  version: 1,
  status: "completed",
  answers: { "hollow:0": "clean", "hollow:1": "almost" },
  placements: { "Hollow / Anti-Extension": "long-lever-hollow-hold" },
  updatedAt: "2026-01-01T00:00:00.000Z",
});
assert(legacyAssessment.answerOrder.join("|") === "hollow:0|hollow:1" &&
  legacyAssessment.appliedPlacements["Hollow / Anti-Extension"] === "long-lever-hollow-hold",
"Assessment migration lost legacy answer order or applied placement");
const normalizedOrder = parseStartingAssessment({
  ...legacyAssessment,
  answerOrder: ["hollow:1", "missing:0", "hollow:1"],
});
assert(normalizedOrder.answerOrder.join("|") === "hollow:1|hollow:0",
  "Assessment migration retained unknown/duplicate order keys or dropped a real answer");

const previouslyApplied = { ...emptyStartingAssessment("completed"), appliedPlacements: { "Straight-Arm Support": "tuck-support" } };
const reassessing = restartStartingAssessment(previouslyApplied);
assert(reassessing.status === "in-progress" && reassessing.appliedPlacements["Straight-Arm Support"] === "tuck-support" && !Object.keys(reassessing.answers).length,
  "Reassessment erased the last applied placement before the replacement was reviewed and applied");

// Provisional placement influences recommendations without adding real
// achievement evidence or overwriting a genuine hard review.
const supportPath = skillProgressionPaths.find((path) => path.label === "Straight-Arm Support");
const placements = { [supportPath.label]: "tuck-support" };
const realEvidence = { "support-hold": { cleanSessions: 0, lastFeedback: "right" } };
const effective = evidenceWithProvisionalPlacement(realEvidence, placements, skillProgressionPaths);
assert(realEvidence["support-hold"].cleanSessions === 0, "Provisional placement mutated achieved skill evidence");
assert(effective["support-hold"].cleanSessions === 2 && effective["support-shrugs"].cleanSessions === 2,
  "Provisional placement did not bridge earlier recommendation stages");
assert(!effective["tuck-support"]?.cleanSessions, "The provisional target was falsely marked achieved");
assert(visibleProvisionalIndex(supportPath, "tuck-support", realEvidence) === supportPath.steps.indexOf("tuck-support"),
  "Skills cannot display the provisional starting point");
const verifiedEvidence = Object.fromEntries(supportPath.steps.slice(0, 3).map((id) => [id, { cleanSessions: 2, lastFeedback: "easy" }]));
assert(visibleProvisionalIndex(supportPath, "tuck-support", verifiedEvidence) === -1,
  "A completed placement continued to override verified tracked workouts");

// The same provisional evidence must reach both product routes. Recommended
// programme slots still enforce compatibility, while Custom still enforces
// equipment, level and readiness eligibility.
const allReady = Object.fromEntries(Object.keys(program.readiness).map((id) => [id, true]));
let programmeUsedPlacement = false;
for (const variant of program.workoutVariants) {
  const slots = session.slotsForVariant(variant, exercises, variant.level !== "L1");
  const allowed = new Map(slots.map((slot) => [slot.id, new Set(session.compatibleSwaps({
    slot, exercises, day: variant.day, level: variant.level, readiness: allReady,
    difficulty: "all", equipment: ["parallettes", "floor", "wall", "rope"],
  }).map((exercise) => exercise.id))]));
  const assignments = progression.recommendedProgressionAssignments(
    slots, exercises, effective,
    (slot, exercise) => allowed.get(slot.id)?.has(exercise.id) === true,
    skillProgressionPaths,
  );
  if (Object.values(assignments).includes("tuck-support")) programmeUsedPlacement = true;
}
assert(programmeUsedPlacement, "Applied starting placement never reached a compatible Recommended programme slot");
const customPlan = custom.buildCustomSession({
  focuses: ["support"], equipment: ["parallettes", "floor", "wall"], seconds: 1500,
  difficulty: "recommended", readiness: allReady, preferNextProgression: true,
  preferVariety: false, progressionEvidence: effective, variationSeed: 17,
});
assert(customPlan.items.some((item) => item.exerciseId === "tuck-support"),
  "Applied starting placement did not influence an eligible Custom Session");

const pageSource = readFileSync("app/page.tsx", "utf8");
assert(pageSource.includes("assessmentDraft.appliedPlacements") && !pageSource.includes("effectiveProgression(assessmentDraft.placements"),
  "Unconfirmed questionnaire answers can influence workouts");
assert(pageSource.includes("Handstand answers never unlock readiness gates"),
  "Assessment is missing the handstand gate safety explanation");
assert(pageSource.includes("VITE_APP_VERSION"), "Account area does not expose the built app version");

console.log(`Starting assessment: ${assessmentTracks.length} adaptive families across 4 sections, three responses, resumable review/apply, provisional-only placement and safety separation passed.`);
