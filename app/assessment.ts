import type { Exercise } from "./program";
import type { ProgressionEvidenceMap, ProgressionPathDefinition } from "./progression";

export type AssessmentSection = "Abs / Core" | "Support" | "Handstand" | "Calisthenics";
export type AssessmentAnswer = "clean" | "almost" | "not-yet";

export type AssessmentTrack = Readonly<{
  id: string;
  label: string;
  section: AssessmentSection;
  pathLabel: string;
  anchors: readonly [string, string];
}>;

export type StartingAssessment = {
  version: 1;
  status: "offered" | "dismissed" | "in-progress" | "review" | "completed";
  answers: Record<string, AssessmentAnswer>;
  placements: Record<string, string>;
  /** Last explicitly applied result; retained while a reassessment is underway. */
  appliedPlacements: Record<string, string>;
  updatedAt: string;
};

export type AssessmentQuestion = Readonly<{
  track: AssessmentTrack;
  exerciseId: string;
  anchorIndex: 0 | 1;
}>;

export const assessmentSections: readonly AssessmentSection[] = [
  "Abs / Core",
  "Support",
  "Handstand",
  "Calisthenics",
];

/**
 * Thirteen representative skill families keep the assessment useful without
 * asking a new athlete to audit the complete exercise library. Each family
 * starts at its first anchor and only shows the second when the first target
 * is already clean.
 */
export const assessmentTracks: readonly AssessmentTrack[] = [
  { id: "hollow", label: "Hollow control", section: "Abs / Core", pathLabel: "Hollow / Anti-Extension", anchors: ["hollow-tuck", "long-lever-hollow-hold"] },
  { id: "anti-rotation", label: "Anti-rotation", section: "Abs / Core", pathLabel: "Anti-Rotation", anchors: ["side-plank", "high-plank-bird-dog"] },
  { id: "pelvic-control", label: "Pelvic control", section: "Abs / Core", pathLabel: "Pelvic Control", anchors: ["reverse-crunch", "straight-leg-raise"] },
  { id: "compression", label: "Compression", section: "Abs / Core", pathLabel: "Compression", anchors: ["single-leg-compression", "straight-compression"] },
  { id: "support", label: "Straight-arm support", section: "Support", pathLabel: "Straight-Arm Support", anchors: ["support-hold", "tuck-support"] },
  { id: "support-transition", label: "Support transitions", section: "Support", pathLabel: "Support Transitions", anchors: ["support-to-tuck-transition", "tuck-to-one-leg-lsit-transition"] },
  { id: "handstand-line", label: "Handstand line", section: "Handstand", pathLabel: "Handstand Line", anchors: ["wall-l", "chest-wall-line"] },
  { id: "handstand-entry", label: "Handstand entry", section: "Handstand", pathLabel: "Handstand Entry", anchors: ["standing-kickup-line-rehearsal", "wall-kickup"] },
  { id: "handstand-balance", label: "Handstand balance", section: "Handstand", pathLabel: "Handstand Balance", anchors: ["wall-facing-handstand-weight-shift", "heel-pullaway"] },
  { id: "handstand-exit", label: "Safe exits", section: "Handstand", pathLabel: "Handstand Exit", anchors: ["grounded-side-exit-rehearsal", "wall-handstand-side-exit"] },
  { id: "lsit", label: "L-sit", section: "Calisthenics", pathLabel: "L-Sit", anchors: ["one-foot-assisted-lsit", "alternating-lsit-extension"] },
  { id: "pushing", label: "Pushing strength", section: "Calisthenics", pathLabel: "Pushing Strength", anchors: ["floor-push-up", "controlled-parallette-pushup"] },
  { id: "overhead", label: "Overhead strength", section: "Calisthenics", pathLabel: "Overhead Strength", anchors: ["shallow-range-pike-pushup", "parallette-pike-pushup"] },
  { id: "planche", label: "Planche foundation", section: "Calisthenics", pathLabel: "Planche Foundation", anchors: ["parallette-forward-lean-hold", "planche-lean-scapular-pulse"] },
] as const;

export const emptyStartingAssessment = (status: StartingAssessment["status"] = "offered"): StartingAssessment => ({
  version: 1,
  status,
  answers: {},
  placements: {},
  appliedPlacements: {},
  updatedAt: new Date().toISOString(),
});

export const parseStartingAssessment = (value: unknown): StartingAssessment => {
  if (!value || typeof value !== "object") return emptyStartingAssessment();
  const parsed = value as Partial<StartingAssessment>;
  const validStatus = ["offered", "dismissed", "in-progress", "review", "completed"].includes(parsed.status ?? "");
  const answers = Object.fromEntries(Object.entries(parsed.answers ?? {}).filter((entry): entry is [string, AssessmentAnswer] =>
    ["clean", "almost", "not-yet"].includes(String(entry[1]))));
  const placements = Object.fromEntries(Object.entries(parsed.placements ?? {}).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string"));
  const appliedPlacements = Object.fromEntries(Object.entries(parsed.appliedPlacements ?? (parsed.status === "completed" ? placements : {})).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string"));
  return {
    version: 1,
    status: validStatus ? parsed.status as StartingAssessment["status"] : "offered",
    answers,
    placements,
    appliedPlacements,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  };
};

const answerKey = (trackId: string, anchorIndex: number) => `${trackId}:${anchorIndex}`;

/** Return only the cards still needed by the adaptive route. */
export const assessmentQuestions = (assessment: StartingAssessment): AssessmentQuestion[] => assessmentTracks.flatMap<AssessmentQuestion>((track) => {
  const first = assessment.answers[answerKey(track.id, 0)];
  if (!first) return [{ track, exerciseId: track.anchors[0], anchorIndex: 0 as const }];
  if (first !== "clean") return [];
  const second = assessment.answers[answerKey(track.id, 1)];
  return second ? [] : [{ track, exerciseId: track.anchors[1], anchorIndex: 1 as const }];
});

const pathFor = (track: AssessmentTrack, paths: readonly ProgressionPathDefinition[]) =>
  paths.find((path) => path.label === track.pathLabel)?.steps ?? [];

/**
 * Convert a response to the exercise that should be recommended now. No
 * exercise is marked achieved: this is placement evidence only.
 */
const placementFor = (
  track: AssessmentTrack,
  answers: Record<string, AssessmentAnswer>,
  paths: readonly ProgressionPathDefinition[],
): string | undefined => {
  const path = pathFor(track, paths);
  if (!path.length) return undefined;
  const firstIndex = path.indexOf(track.anchors[0]);
  const secondIndex = path.indexOf(track.anchors[1]);
  const first = answers[answerKey(track.id, 0)];
  const second = answers[answerKey(track.id, 1)];
  let targetIndex = Math.max(0, firstIndex);
  if (first === "not-yet") targetIndex = Math.max(0, firstIndex - 1);
  else if (first === "almost") targetIndex = Math.max(0, firstIndex);
  else if (first === "clean") {
    targetIndex = Math.max(0, secondIndex);
    if (second === "not-yet") targetIndex = Math.max(0, secondIndex - 1);
    else if (second === "almost") targetIndex = Math.max(0, secondIndex);
    else if (second === "clean") targetIndex = Math.min(path.length - 1, secondIndex + 1);
  }
  return path[targetIndex];
};

export const answerAssessmentQuestion = (
  assessment: StartingAssessment,
  question: AssessmentQuestion,
  answer: AssessmentAnswer,
  paths: readonly ProgressionPathDefinition[],
): StartingAssessment => {
  const answers = { ...assessment.answers, [answerKey(question.track.id, question.anchorIndex)]: answer };
  const first = answers[answerKey(question.track.id, 0)];
  const second = answers[answerKey(question.track.id, 1)];
  const placement = first !== "clean" || Boolean(second) ? placementFor(question.track, answers, paths) : undefined;
  const placements = { ...assessment.placements, ...(placement ? { [question.track.pathLabel]: placement } : {}) };
  const provisional = { ...assessment, status: "in-progress" as const, answers, placements, updatedAt: new Date().toISOString() };
  return assessmentQuestions(provisional).length ? provisional : { ...provisional, status: "review" };
};

export const restartStartingAssessment = (current?: StartingAssessment): StartingAssessment => ({
  ...emptyStartingAssessment("in-progress"),
  appliedPlacements: { ...(current?.appliedPlacements ?? {}) },
});

export const assessmentProgress = (assessment: StartingAssessment) => ({
  completedTracks: assessmentTracks.filter((track) => Boolean(assessment.placements[track.pathLabel])).length,
  totalTracks: assessmentTracks.length,
});

/**
 * Make earlier stages behave as demonstrated for recommendation purposes only.
 * The real evidence object remains untouched, so Skills never displays a
 * questionnaire answer as an achieved checkmark.
 */
export const evidenceWithProvisionalPlacement = (
  evidence: ProgressionEvidenceMap,
  placements: Readonly<Record<string, string>>,
  paths: readonly ProgressionPathDefinition[],
): Record<string, { cleanSessions?: number; lastFeedback?: "easy" | "right" | "hard" }> => {
  const next = Object.fromEntries(Object.entries(evidence).map(([id, value]) => [id, value ? { ...value } : {}]));
  for (const path of paths) {
    const placedId = path.label ? placements[path.label] : undefined;
    const targetIndex = placedId ? path.steps.indexOf(placedId) : -1;
    if (targetIndex < 0) continue;
    for (let index = 0; index < targetIndex; index += 1) {
      const id = path.steps[index];
      next[id] = { ...next[id], cleanSessions: Math.max(2, next[id]?.cleanSessions ?? 0) };
    }
  }
  return next;
};

export const visibleProvisionalIndex = (
  path: ProgressionPathDefinition,
  placementId: string | undefined,
  evidence: ProgressionEvidenceMap,
): number => {
  if (!placementId) return -1;
  const index = path.steps.indexOf(placementId);
  if (index < 0) return -1;
  if ((evidence[placementId]?.cleanSessions ?? 0) >= 2 || evidence[placementId]?.lastFeedback === "hard") return -1;
  const actualHighest = path.steps.reduce((highest, id, step) =>
    (evidence[id]?.cleanSessions ?? 0) >= 2 ? Math.max(highest, step) : highest, -1);
  return actualHighest > index ? -1 : index;
};

export const validateAssessmentTracks = (
  library: Readonly<Record<string, Exercise>>,
  paths: readonly ProgressionPathDefinition[],
): string[] => assessmentTracks.flatMap((track) => {
  const path = pathFor(track, paths);
  const errors: string[] = [];
  if (!path.length) errors.push(`${track.id}: missing progression path ${track.pathLabel}`);
  for (const id of track.anchors) {
    if (!library[id]) errors.push(`${track.id}: missing exercise ${id}`);
    else if (!path.includes(id)) errors.push(`${track.id}: ${id} is outside ${track.pathLabel}`);
  }
  if (path.indexOf(track.anchors[0]) >= path.indexOf(track.anchors[1])) errors.push(`${track.id}: anchors are not easier → harder`);
  return errors;
});
