import type { MotionPreset } from "./MotionGuide";

export type DifficultyLevel = "L1" | "L2" | "L3";
export type ExerciseLevel = "ALL" | DifficultyLevel;
export type DayNumber = 1 | 2 | 3 | 4 | 5;
export type WorkoutBlock =
  | "warmup"
  | "pre"
  | "core"
  | "handstand"
  | "lab"
  | "cooldown";
export type Category =
  | "Warm-up"
  | "Pre-Handstand"
  | "Abs"
  | "Core"
  | "Handstand"
  | "Calisthenics"
  | "Conditioning"
  | "Cooldown";
export type Focus =
  | "wrist"
  | "grip"
  | "shoulder-mobility"
  | "hamstring-mobility"
  | "hip-mobility"
  | "adductor-mobility"
  | "scapular"
  | "support"
  | "overhead-load"
  | "line"
  | "entry"
  | "exit"
  | "balance"
  | "hollow"
  | "compression"
  | "anti-extension"
  | "anti-rotation"
  | "pelvic-control"
  | "posterior-chain"
  | "horizontal-push"
  | "vertical-push"
  | "planche"
  | "lsit"
  | "transition"
  | "thoracic-reset"
  | "breathing"
  | "conditioning";
export type ReadinessGateId =
  | "G0_LOAD"
  | "G1_SUPPORT"
  | "G2_INVERSION"
  | "G3_ENTRY"
  | "G4_FREE_BAR"
  | "G5_LSIT"
  | "G6_PLANCHE"
  | "G7_PIKE_PUSH";
export type MediaKind = "loop" | "static" | "transition";
export type MediaStatus = "ready" | "audit" | "required";
export type Equipment = "parallettes" | "floor" | "wall" | "rope";
export type TargetType = "reps" | "hold" | "attempts" | "interval";

export type ExerciseMedia = {
  kind: MediaKind;
  status: MediaStatus;
  src?: string;
  motion?: MotionPreset;
  orientation: "side" | "front-oblique" | "rear-oblique" | "top-oblique";
  specification: string;
};

export type Exercise = {
  id: string;
  name: string;
  level: ExerciseLevel;
  category: Category;
  eligibleBlocks: WorkoutBlock[];
  primaryFocus: Focus;
  secondaryFocus: Focus[];
  compatibleDays: DayNumber[] | "all";
  target: string;
  cues: [string, string];
  regression: string;
  gate?: ReadinessGateId;
  fallbackId?: string;
  media: ExerciseMedia;
  introduced: "original" | "v2";
  availableLevels: DifficultyLevel[];
  /** Compatibility aliases for session/history tooling. */
  blocks: WorkoutBlock[];
  days: DayNumber[];
  /** V2 generator metadata. Kept additive so existing saved plans remain readable. */
  family?: string;
  subfamily?: string;
  progressionFamily?: string;
  progressionStage?: number;
  requiredEquipment?: Equipment[];
  customFocusTags?: string[];
  loadTags?: string[];
  fatigueCost?: { wrist: number; shoulder: number; pushing: number; core: number; inversion: number };
  easierId?: string;
  harderId?: string;
  prerequisites?: string[];
  how?: string;
  focus?: string;
  avoid?: string;
  safety?: string;
  targetType?: TargetType;
  targetMin?: number;
  targetMax?: number;
};

type ExerciseSeed = Omit<Exercise, "introduced" | "availableLevels" | "blocks" | "days">;

export type Prescription = {
  exerciseId: string;
  target?: string;
};

export type WorkoutLevelTemplate = {
  pre: [Prescription, Prescription];
  core: [Prescription, Prescription, Prescription, Prescription];
  skill: Prescription;
  cooldown: [Prescription, Prescription];
};

export type CalisthenicsLab = {
  label: string;
  a: Prescription;
  b: Prescription;
  sequence: ["selected", "selected", "selected", "selected", "selected"];
  intensityNote?: string;
};

export type WorkoutDay = {
  day: DayNumber;
  title: string;
  focus: string;
  intensity: "Moderate" | "Focused" | "Light" | "Strong";
  levels: Record<DifficultyLevel, WorkoutLevelTemplate>;
  labs: Partial<Record<DifficultyLevel, CalisthenicsLab>>;
};

export type ReadinessStandard = {
  id: ReadinessGateId;
  label: string;
  standards: string[];
  fallback: string;
};

export const levelLabels: Record<ExerciseLevel, { name: string; short: string; description: string }> = {
  ALL: { name: "All levels", short: "ALL", description: "Suitable at every session level." },
  L1: { name: "Foundation", short: "L1", description: "More assistance, shorter levers and technique-first control." },
  L2: { name: "Progress", short: "L2", description: "Less assistance, longer levers and stronger support work." },
  L3: { name: "Challenge", short: "L3", description: "Readiness-gated balance and higher-leverage strength work." },
};

export const readiness: Record<ReadinessGateId, ReadinessStandard> = {
  G0_LOAD: {
    id: "G0_LOAD",
    label: "Pain-free loading",
    standards: ["Warm-up is pain-free at the wrists and shoulders", "No sharp pain, numbness or instability"],
    fallback: "Reduce range or choose a non-loaded regression.",
  },
  G1_SUPPORT: {
    id: "G1_SUPPORT",
    label: "Parallette support",
    standards: ["30-second clean parallette support", "10 controlled support shrugs with locked elbows"],
    fallback: "Use foot-assisted support or a smaller lean.",
  },
  G2_INVERSION: {
    id: "G2_INVERSION",
    label: "Wall inversion",
    standards: ["25-second wall inverted-L hold", "20-second chest-to-wall line", "Controlled sideways exit on both sides"],
    fallback: "Use a low wall inverted-L or pike-loading drill.",
  },
  G3_ENTRY: {
    id: "G3_ENTRY",
    label: "Accurate entry",
    standards: ["All wall-inversion standards", "Three calm wall kick-ups without crashing into the wall"],
    fallback: "Use standing entry rehearsal or kick-up-to-wall practice.",
  },
  G4_FREE_BAR: {
    id: "G4_FREE_BAR",
    label: "Freestanding parallette readiness",
    standards: ["All support, inversion and entry standards", "30-second hollow-body hold", "Reliable sideways exit on both sides"],
    fallback: "Use a wall pull-away or accurate wall kick-up.",
  },
  G5_LSIT: {
    id: "G5_LSIT",
    label: "L-sit readiness",
    standards: ["20-second clean tuck support", "Six controlled one-leg extensions per side"],
    fallback: "Use foot-assisted L-sit or alternating extensions.",
  },
  G6_PLANCHE: {
    id: "G6_PLANCHE",
    label: "Planche-foundation readiness",
    standards: ["30-second clean support", "Pain-free 20-second planche lean", "15-second controlled frog stand"],
    fallback: "Use a smaller planche lean or assisted frog stand.",
  },
  G7_PIKE_PUSH: {
    id: "G7_PIKE_PUSH",
    label: "Pike-push readiness",
    standards: ["Eight clean pike push-ups", "Controlled depth without neck, wrist or shoulder pain"],
    fallback: "Use a shallower pike push-up or reduce the lever.",
  },
};

export const timing = {
  warmup: { start: 0, work: 45, transition: 15, exercises: 3, rounds: 1, total: 180 },
  pre: { start: 180, work: 40, transition: 20, exercises: 2, rounds: 2, total: 240 },
  handstand: { start: 420, work: 30, transition: 30, exercises: 1, rounds: 5, total: 300 },
  core25: { start: 720, work: 40, transition: 20, exercises: 4, rounds: 3, total: 720 },
  lab: { start: 720, work: 30, transition: 30, exercises: 1, rounds: 5, total: 300 },
  core30: { start: 1020, work: 40, transition: 20, exercises: 4, rounds: 3, total: 720 },
  cooldown25: { start: 1440, work: 30, transition: 0, exercises: 2, rounds: 1, total: 60 },
  cooldown30: { start: 1740, work: 30, transition: 0, exercises: 2, rounds: 1, total: 60 },
  defaultTotal: 1500,
  extendedTotal: 1800,
} as const;

const gif = (name: string) => `${import.meta.env.BASE_URL}exercises/${name}.gif`;
const days = (...values: DayNumber[]) => values;
const media = (
  kind: MediaKind,
  status: MediaStatus,
  specification: string,
  options: Pick<ExerciseMedia, "src" | "motion"> & Partial<Pick<ExerciseMedia, "orientation">> = {},
): ExerciseMedia => ({
  kind,
  status,
  orientation: options.orientation ?? "side",
  specification,
  ...options,
});

const existing: ExerciseSeed[] = [
  { id: "wrist-palms", name: "Dynamic Wrist Rocks", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "wrist", secondaryFocus: ["support"], compatibleDays: "all", target: "8–12 gentle rocks", cues: ["Keep palms and fingertips heavy", "Move through a pain-free shoulder shift"], regression: "Use a smaller shift.", media: media("loop", "audit", "Full hands visible; shoulders rock forward and return without palms lifting.", { src: gif("warmup_palm_lifts"), motion: "wrist-rocks" }) },
  { id: "shoulder-sweep", name: "Standing Shoulder CARs", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "shoulder-mobility", secondaryFocus: ["line"], compatibleDays: "all", target: "4–6 circles each way", cues: ["Keep ribs down", "Use the largest pain-free circle"], regression: "Use a smaller overhead range.", media: media("loop", "audit", "Full arm circle with quiet ribs and no cropped hands.", { src: gif("warmup_shoulder_sweep"), motion: "shoulder-cars" }) },
  { id: "scap-pushup", name: "Straight-Arm Scap Push-up", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "scapular", secondaryFocus: ["anti-extension"], compatibleDays: "all", target: "8–12 smooth reps", cues: ["Lock the elbows", "Push the floor away at the top"], regression: "Perform from the knees.", media: media("loop", "audit", "Only the shoulder blades move; elbows remain visibly straight.", { src: gif("warmup_scap_pushup"), motion: "scap-pushup" }) },
  { id: "wrist-circles", name: "Wrist Circles & Open–Close", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "6–8 circles each way", cues: ["Move slowly through each circle", "Open the fingers wide between circles"], regression: "Make smaller circles with relaxed hands.", media: media("loop", "ready", "Hands remain large and visible through a full gentle circle.", { motion: "wrist-circles", orientation: "front-oblique" }) },
  { id: "wall-slides", name: "Dynamic Wall Slides", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "shoulder-mobility", secondaryFocus: ["line"], compatibleDays: "all", target: "6–10 smooth slides", cues: ["Keep ribs gently tucked", "Slide only as high as the back stays quiet"], regression: "Stand slightly away from the wall.", media: media("loop", "ready", "Wall contact and rib position remain clear throughout.", { motion: "wall-slides", orientation: "front-oblique" }) },
  { id: "plank-pike", name: "Plank-to-Pike Flow", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "scapular", secondaryFocus: ["overhead-load", "anti-extension"], compatibleDays: "all", target: "6–8 controlled flows", cues: ["Push the bars away throughout", "Lift hips without collapsing the shoulders"], regression: "Shorten the plank and use a smaller pike.", media: media("loop", "ready", "Clear plank and pike endpoints; both bars, hands and feet visible.", { motion: "plank-pike" }) },

  { id: "pike-shift", name: "Pike Weight Shift", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "overhead-load", secondaryFocus: ["support"], compatibleDays: days(1, 3, 4), target: "6–10 slow reps", cues: ["Keep both feet grounded", "Lock elbows as shoulders travel forward"], regression: "Reduce the forward shift.", gate: "G0_LOAD", media: media("loop", "audit", "Feet stay grounded; start and finish shoulder positions are visibly different.", { src: gif("d1_pike_weight_shift_v3") }) },
  { id: "support-hold", name: "Parallette Support Hold", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre", "core"], primaryFocus: "support", secondaryFocus: ["scapular"], compatibleDays: days(1, 2, 5), target: "15–30 second hold", cues: ["Lock elbows and press the bars down", "Depress and gently protract without collapsing the neck"], regression: "Keep more weight through the feet.", gate: "G0_LOAD", media: media("static", "audit", "Straight elbows, long neck, feet grounded for the base version, both bars visible.", { src: gif("d1_support_hold") }) },
  { id: "support-shrugs", name: "Support Shrugs", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "support", secondaryFocus: ["scapular"], compatibleDays: days(1, 2, 5), target: "8–12 reps", cues: ["Keep elbows locked", "Move only a few centimetres through the shoulders"], regression: "Keep the feet more heavily grounded.", gate: "G0_LOAD", media: media("loop", "audit", "Elbows remain straight; tall and lowered support positions are distinct.", { src: gif("d2_support_shrugs") }) },
  { id: "box-pike", name: "Wall Inverted-L Alignment Hold", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre", "handstand"], primaryFocus: "line", secondaryFocus: ["overhead-load"], compatibleDays: days(2, 3, 4, 5), target: "20–30 second hold", cues: ["Keep ears between upper arms and neck neutral", "Stack shoulders over hands with both feet supported on the wall"], regression: "Walk the feet lower on the wall or use a floor pike.", gate: "G0_LOAD", media: media("static", "audit", "Neutral head, clear inverted-L, feet on wall, elbows straight and full body visible.", { src: gif("d2_box_pike_hold") }) },
  { id: "kneeling-lean", name: "Kneeling Shoulder Lean", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "overhead-load", secondaryFocus: ["anti-extension"], compatibleDays: days(1, 3, 4), target: "6–10 slow reps", cues: ["Keep ribs tucked", "Load shoulders with straight arms"], regression: "Move the knees closer to the bars.", gate: "G0_LOAD", media: media("loop", "audit", "Knees stay grounded; shoulders move beyond bars with locked elbows.", { src: gif("d3_kneeling_shoulder_lean") }) },
  { id: "partial-wall-walk", name: "Partial Wall Walk", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "line", secondaryFocus: ["overhead-load"], compatibleDays: days(3, 5), target: "2–4 controlled climbs", cues: ["Move one foot at a time", "Stop before the shoulders fatigue"], regression: "Walk only to a steep plank.", gate: "G0_LOAD", media: media("transition", "audit", "Wall and continuous foot contact remain visible; no rushed or full-height climb.", { src: gif("d3_partial_wall_walk") }) },
  { id: "frog-prep", name: "Assisted Frog-Stand Prep", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "support", secondaryFocus: ["balance"], compatibleDays: days(4, 5), target: "5–8 controlled shifts", cues: ["Look 30–60 cm forward", "Keep one or both toes ready to land"], regression: "Keep both feet fully grounded.", gate: "G0_LOAD", media: media("loop", "audit", "Forward gaze, safe toe support and both equal-height bars remain clear.", { src: gif("d4_assisted_frog_prep") }) },
  { id: "pike-elevation", name: "Pike Shoulder Elevation", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "scapular", secondaryFocus: ["overhead-load"], compatibleDays: days(1, 4), target: "8–12 reps", cues: ["Keep arms straight", "Press shoulders toward the ears"], regression: "Bring feet closer and reduce the load.", gate: "G0_LOAD", media: media("loop", "audit", "Only shoulder-blade elevation changes; head stays neutral and feet grounded.", { src: gif("d4_pike_elevation") }) },
  { id: "wall-kickup", name: "Controlled Wall Kick-up", level: "L2", category: "Pre-Handstand", eligibleBlocks: ["pre", "handstand"], primaryFocus: "entry", secondaryFocus: ["line"], compatibleDays: days(5), target: "3–5 calm entries", cues: ["Grip both bars before the legs leave", "Contact the wall softly"], regression: "Use Standing Kick-up Line Rehearsal.", gate: "G2_INVERSION", media: media("transition", "audit", "Complete entry and step-down; wall contact soft; both bars and full body visible.", { src: gif("d5_controlled_wall_kickup_v2") }) },
  { id: "chest-wall-line", name: "Chest-to-Wall Line Hold", level: "L1", category: "Handstand", eligibleBlocks: ["pre", "handstand"], primaryFocus: "line", secondaryFocus: ["scapular"], compatibleDays: days(3, 5), target: "15–25 second hold", cues: ["Face the wall; only toes touch", "Keep ribs in, glutes light and shoulders tall"], regression: "Move hands farther from the wall or use the Wall Inverted-L Hold.", gate: "G2_INVERSION", media: media("static", "audit", "Athlete faces wall; toes touch; no banana arch; hands and feet visible.", { src: gif("d3_chest_wall_alignment") }) },

  { id: "hollow-tuck", name: "Hollow Tuck Hold", level: "L1", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 4, 5), target: "20–30 second hold", cues: ["Flatten the lower back", "Exhale and keep ribs tucked"], regression: "Bring knees closer to the chest.", media: media("static", "audit", "Posterior pelvic tilt and shoulder lift are unambiguous.", { src: gif("d1_hollow_tuck_hold") }) },
  { id: "dead-bug", name: "Controlled Dead Bug", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 4), target: "6–10 total reps", cues: ["Move opposite arm and leg", "Stop before the lower back arches"], regression: "Move only the legs.", media: media("loop", "audit", "Opposite limbs extend; low back remains grounded.", { src: gif("d1_dead_bug"), motion: "dead-bug" }) },
  { id: "plank-tap", name: "Parallette Plank Shoulder Tap", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["support"], compatibleDays: days(1, 2, 4, 5), target: "6–12 total taps", cues: ["Keep hips square", "Shift slowly before lifting a hand"], regression: "Widen the feet or use Kneeling Plank Tap.", gate: "G0_LOAD", media: media("loop", "audit", "Supporting arm stays straight; pelvis remains level; both bars visible.", { src: gif("d1_plank_shoulder_tap"), motion: "plank-tap" }) },
  { id: "bent-compression", name: "Bent-Knee Compression Lift", level: "L1", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 4, 5), target: "6–10 controlled lifts", cues: ["Press down through the bars", "Lift knees without swinging"], regression: "Lift one foot at a time.", media: media("loop", "audit", "Feet begin grounded, then knees lift without momentum; both bars visible.", { src: gif("d1_bent_knee_compression") }) },
  { id: "tuck-support", name: "Tuck Support Hold", level: "L1", category: "Abs", eligibleBlocks: ["core", "lab"], primaryFocus: "support", secondaryFocus: ["compression"], compatibleDays: days(1, 2, 5), target: "8–20 second hold", cues: ["Press tall before lifting", "Pull knees toward the chest without leaning back"], regression: "Let one or both toes skim the floor.", gate: "G1_SUPPORT", media: media("static", "audit", "Unsupported tuck, straight elbows and both bars fully visible.", { src: gif("d2_tuck_support_v2") }) },
  { id: "straight-compression", name: "Straight-Leg Compression Lift", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 4, 5), target: "6–10 lifts", cues: ["Keep knees straight", "Lean forward from the hips"], regression: "Use Single-Leg Compression Lift.", media: media("loop", "audit", "Both heels clearly leave and return to floor with locked knees.", { src: gif("d2_straight_leg_compression") }) },
  { id: "mountain-climber", name: "Slow Mountain Climber", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 4), target: "8–12 total reps", cues: ["Move without bouncing", "Keep shoulders over the bars"], regression: "Use a shorter knee drive.", gate: "G0_LOAD", media: media("loop", "audit", "One knee moves at a time; full plank returns between reps.", { src: gif("d2_mountain_climber"), motion: "mountain-climber" }) },
  { id: "side-plank", name: "Side-Plank Stability Hold", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["support"], compatibleDays: days(2, 3, 5), target: "15–25 seconds per side", cues: ["Stack shoulders and hips", "Keep both feet on the floor—not on a bar"], regression: "Place the lower knee down.", gate: "G0_LOAD", media: media("static", "audit", "Feet stay on floor; unused bar is outside the leg path; full body visible.", { src: gif("d2_side_plank"), orientation: "front-oblique" }) },
  { id: "hollow-rocks", name: "Small Hollow Rocks", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 5), target: "8–15 rocks", cues: ["Keep the hollow shape fixed", "Rock from shoulders to hips"], regression: "Hold still in a tuck.", media: media("loop", "audit", "Body shape does not open and close during rocking.", { src: gif("d3_hollow_rocks_v2"), motion: "hollow-rock" }) },
  { id: "plank-saw", name: "Controlled Plank Saw", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["support"], compatibleDays: days(1, 3, 4), target: "6–10 slow reps", cues: ["Move as one solid line", "Do not let the lower back sag"], regression: "Use a smaller range.", gate: "G0_LOAD", media: media("loop", "audit", "Whole body shifts; hip and lumbar line remain fixed.", { src: gif("d3_plank_saw"), motion: "plank-saw" }) },
  { id: "cross-press", name: "Dead-Bug Cross Press", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 4), target: "5–8 reps per side", cues: ["Press hand into opposite knee", "Keep pelvis still as the other leg extends"], regression: "Tap the heel close to the hips.", media: media("loop", "audit", "Cross-body press remains continuous as the free leg extends.", { src: gif("d3_deadbug_cross_press_v2"), motion: "cross-press" }) },
  { id: "kneeling-plank-tap", name: "Kneeling Plank Tap", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["support"], compatibleDays: days(1, 3, 5), target: "8–12 total taps", cues: ["Stay tall through the support arm", "Keep hips quiet"], regression: "Widen the knees.", gate: "G0_LOAD", media: media("loop", "audit", "Knees remain grounded; alternating tap and quiet pelvis are visible.", { src: gif("d3_kneeling_plank_tap"), motion: "kneeling-plank-tap" }) },
  { id: "supported-knee-raise", name: "Supported Knee Raise", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["support", "pelvic-control"], compatibleDays: days(2, 4, 5), target: "6–10 reps", cues: ["Start with tall shoulders", "Curl the pelvis as knees rise"], regression: "Raise one knee at a time.", gate: "G1_SUPPORT", media: media("loop", "audit", "Feet begin down or lightly supported; pelvic curl is visible at the top.", { src: gif("d4_supported_knee_raise") }) },
  { id: "plank-knee-elbow", name: "Plank Knee-to-Elbow", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 4, 5), target: "6–10 total reps", cues: ["Round slightly as the knee comes in", "Return to a strong plank"], regression: "Drive the knee only halfway forward.", gate: "G0_LOAD", media: media("loop", "audit", "Knee approaches same-side elbow and returns to full plank.", { src: gif("d4_plank_knee_elbow"), motion: "plank-knee" }) },
  { id: "boat-hold", name: "Boat Hold", level: "L1", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 4), target: "20–30 second hold", cues: ["Lift through the chest", "Keep the waist braced, not collapsed"], regression: "Hold behind the thighs.", media: media("static", "audit", "Tall-chest boat is visibly distinct from rounded hollow hold.", { src: gif("d4_boat_hold") }) },
  { id: "hollow-reach", name: "Hollow Overhead Reach", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["hollow"], compatibleDays: days(1, 3, 4), target: "6–10 reaches", cues: ["Keep the lower back heavy", "Reach only as far as ribs stay down"], regression: "Keep arms aimed toward the ceiling.", media: media("loop", "audit", "Arm lever changes while lumbar contact remains constant.", { src: gif("d4_hollow_overhead_reach"), motion: "hollow-reach" }) },
  { id: "hollow-one-leg", name: "One-Leg Hollow Extension", level: "L1", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 5), target: "6–10 total changes", cues: ["Keep the back flat", "Switch legs without losing the tuck"], regression: "Keep both knees bent.", media: media("loop", "audit", "Alternating leg extension with constant trunk shape.", { src: gif("d5_hollow_one_leg"), motion: "hollow-one-leg" }) },
  { id: "single-leg-compression", name: "Single-Leg Compression Lift", level: "L1", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 5), target: "5–8 reps per side", cues: ["Lock the lifting knee", "Press down before the foot rises"], regression: "Bend the non-working knee.", media: media("loop", "audit", "One straight leg lifts independently; torso does not rock backward.", { src: gif("d5_single_leg_compression") }) },
  { id: "plank-tap-out", name: "Plank Tap-Out", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["support"], compatibleDays: days(1, 3, 5), target: "6–10 total taps", cues: ["Keep shoulders level", "Touch wide without rotating the hips"], regression: "Use a wider foot position.", gate: "G0_LOAD", media: media("loop", "audit", "Hand taps laterally and returns to its bar; pelvis stays square.", { src: gif("d5_plank_tap_out"), motion: "plank-tap-out" }) },

  { id: "wall-l", name: "Wall Inverted-L Hold", level: "L1", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "line", secondaryFocus: ["overhead-load"], compatibleDays: days(1, 2, 3, 4), target: "15–25 second hold", cues: ["Stack shoulders over the bars", "Push tall and keep hips high"], regression: "Walk the feet lower on the wall.", gate: "G0_LOAD", media: media("static", "audit", "Both feet contact wall; hips form clear inverted L; elbows locked.", { src: gif("d1_wall_inverted_l_v2") }) },
  { id: "box-toe-light", name: "Wall Inverted-L Foot Lightener", level: "L2", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "balance", secondaryFocus: ["line"], compatibleDays: days(1, 2, 4, 5), target: "4–8 controlled lighteners", cues: ["Shift shoulders before reducing foot pressure", "Never push or hop from the wall"], regression: "Lighten one foot without lifting it.", gate: "G1_SUPPORT", media: media("loop", "audit", "Wall contact, shoulder shift and controlled foot lightening are all visible.", { src: gif("d2_box_toe_lightener_v2") }) },
  { id: "wall-elevation", name: "Handstand Shoulder Elevation", level: "L2", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "scapular", secondaryFocus: ["line"], compatibleDays: days(3, 4), target: "6–10 controlled reps", cues: ["Stay chest-to-wall", "Keep elbows locked; move only the shoulder blades"], regression: "Perform in a floor pike or Wall Inverted-L position.", gate: "G2_INVERSION", media: media("loop", "audit", "Athlete faces wall; toes stay in contact; no elbow bend or banana arch.", { src: gif("d4_wall_shoulder_elevation") }) },
  { id: "heel-pullaway", name: "Back-to-Wall Heel Pull-Away", level: "L2", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "balance", secondaryFocus: ["line"], compatibleDays: days(5), target: "3–6 controlled floats", cues: ["Face away from the wall and peel heels a few centimetres", "Return before the body line breaks"], regression: "Float one heel at a time.", gate: "G3_ENTRY", media: media("loop", "audit", "Athlete faces away; heels begin on wall; small pull-away and return are distinct.", { src: gif("d5_heel_pullaway_v2") }) },

  { id: "wrist-flexor-rock", name: "Wrist Flexor Stretch Hold", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "30-second relaxed hold", cues: ["Keep palms flat with fingers forward", "Settle into only a mild stretch"], regression: "Keep shoulders directly above the hands.", media: media("static", "ready", "Pain-free static wrist-flexor hold with full hands visible.", { motion: "wrist-flexor-rock" }) },
  { id: "wrist-extensor-rock", name: "Wrist Extensor Stretch Hold", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "30-second relaxed hold", cues: ["Turn fingers gently toward the knees", "Hold light pressure with elbows soft"], regression: "Stretch one hand at a time.", media: media("static", "ready", "Static back-of-forearm stretch remains gentle; no forced wrist angle.", { motion: "wrist-extensor-rock" }) },
  { id: "child-reach", name: "Child’s-Pose Reach", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "3–4 long breaths", cues: ["Send hips back as hands reach", "Let the upper back widen"], regression: "Place a cushion between hips and heels.", media: media("static", "ready", "Long relaxed reach with no forced shoulder depth.", { motion: "child-reach" }) },
  { id: "thread-needle", name: "Thread-the-Needle Hold", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "thoracic-reset", secondaryFocus: ["shoulder-mobility"], compatibleDays: "all", target: "30-second relaxed hold per selected side", cues: ["Rest the reaching shoulder without forcing", "Breathe into the upper-back rotation"], regression: "Use a shorter reach and keep the head lifted.", media: media("static", "ready", "Static upper-back rotation is clear and supporting wrist stays comfortable.", { motion: "thread-needle" }) },
  { id: "lat-parallette", name: "Kneeling Parallette Lat Reach", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "3–4 slow breaths", cues: ["Keep hips above or behind knees", "Sink chest gently between straight arms"], regression: "Use the floor instead of the bars.", media: media("static", "ready", "Both bars stable and equal height; shoulders remain pain-free.", { motion: "lat-reach" }) },
  { id: "puppy-rock", name: "Puppy-Pose Hold", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "30-second relaxed hold", cues: ["Keep hips roughly over knees", "Let the chest settle without pinching shoulders"], regression: "Rest the forearms on the mat.", media: media("static", "ready", "Static shoulder-opening position with full body visible.", { motion: "puppy-rock" }) },
  { id: "chest-opener", name: "Gentle Chest Opener", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: [], compatibleDays: "all", target: "3–4 slow breaths", cues: ["Clasp hands loosely behind the back", "Lift only to a mild stretch"], regression: "Hold a towel between the hands.", media: media("static", "ready", "Shoulders remain down; no forced arm lift.", { motion: "chest-opener", orientation: "front-oblique" }) },
  { id: "upper-back-reach", name: "Upper-Back Hug & Reach", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "thoracic-reset", secondaryFocus: ["breathing"], compatibleDays: "all", target: "3–4 slow breaths", cues: ["Reach elbows forward", "Breathe between the shoulder blades"], regression: "Keep hands on opposite shoulders.", media: media("static", "ready", "Rounded upper back and relaxed neck remain visible.", { motion: "upper-back-reach", orientation: "front-oblique" }) },
];

const additions: ExerciseSeed[] = [
  // Dynamic warm-up: 6
  { id: "fingertip-wrist-pulses", name: "Fingertip Wrist Pulses", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "wrist", secondaryFocus: ["support"], compatibleDays: "all", target: "10–16 controlled pulses", cues: ["Keep every fingertip planted", "Use light, pain-free pressure"], regression: "Reduce pressure and range.", media: media("loop", "required", "Close side view of planted fingertips and small palm lift; elbows soft; no distorted fingers.") },
  { id: "prayer-wrist-waves", name: "Prayer Wrist Waves", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "6–10 slow waves", cues: ["Keep palms gently connected", "Move through a pain-free range"], regression: "Reduce palm contact and range.", media: media("loop", "required", "Front-oblique view; palms and fingers remain fully visible through a smooth wrist wave.", { orientation: "front-oblique" }) },
  { id: "down-dog-plank-wave", name: "Down-Dog-to-Plank Wave", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "scapular", secondaryFocus: ["overhead-load", "anti-extension"], compatibleDays: "all", target: "5–8 controlled flows", cues: ["Push the floor away", "Arrive in plank without sagging"], regression: "Shorten the plank and bend the knees.", media: media("loop", "required", "Full-body side loop with distinct down-dog and straight plank positions.") },
  { id: "wall-yw-sweep", name: "Wall Y-to-W Sweep", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "shoulder-mobility", secondaryFocus: ["line"], compatibleDays: "all", target: "5–8 smooth cycles", cues: ["Keep ribs gently down", "Move only through a comfortable range"], regression: "Stand slightly away from the wall.", media: media("loop", "required", "Rear-oblique view shows wall, hands, elbows and quiet rib cage through Y and W.", { orientation: "rear-oblique" }) },
  { id: "kneeling-thoracic-rotation", name: "Kneeling Thoracic Rotation Reach", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "thoracic-reset", secondaryFocus: ["shoulder-mobility"], compatibleDays: "all", target: "4–6 reps per side", cues: ["Keep hips above the knees", "Rotate through the upper back"], regression: "Use a shorter reach.", media: media("loop", "required", "Front-oblique full-body loop; supporting hand grounded and upper arm reaches without hip shift.", { orientation: "front-oblique" }) },
  { id: "inchworm-pike-walkout", name: "Inchworm-to-Pike Walkout", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "scapular", secondaryFocus: ["anti-extension", "overhead-load"], compatibleDays: "all", target: "4–6 walkouts", cues: ["Finish with shoulders over hands", "Keep the trunk braced in plank"], regression: "Bend the knees and shorten the walk.", media: media("transition", "required", "Complete standing fold, hand walk to plank, return and tall finish; full body never cropped.") },

  // Pre-handstand: 8
  { id: "parallette-forward-lean-hold", name: "Parallette Forward-Lean Hold", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "support", secondaryFocus: ["overhead-load"], compatibleDays: days(1, 2, 4), target: "15–25 second hold", cues: ["Lock elbows and push the bars down", "Move shoulders only slightly beyond the bars"], regression: "Keep more weight through the toes.", gate: "G0_LOAD", fallbackId: "support-hold", media: media("static", "required", "Side view; toes grounded, elbows locked, subtle forward lean and both bars visible.") },
  { id: "bear-to-pike-shoulder-load", name: "Bear-to-Pike Shoulder Load", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "overhead-load", secondaryFocus: ["scapular"], compatibleDays: days(1, 3, 4), target: "6–10 controlled reps", cues: ["Hover knees low in bear", "Press through straight arms into pike"], regression: "Keep the knees down.", gate: "G0_LOAD", fallbackId: "pike-shift", media: media("loop", "required", "Full-body side loop; bear and pike clearly differ; hands and feet stay grounded.") },
  { id: "standing-kickup-line-rehearsal", name: "Standing Kick-Up Line Rehearsal", level: "L1", category: "Pre-Handstand", eligibleBlocks: ["pre", "handstand"], primaryFocus: "entry", secondaryFocus: ["line"], compatibleDays: days(1, 5), target: "4–6 reps per lead leg", cues: ["Keep arms beside the ears", "Reach long through the rear toe"], regression: "Use a smaller leg lift.", media: media("transition", "required", "Side view of grounded lunge-to-line rehearsal; hands never touch down; both lead legs demonstrated.") },
  { id: "pike-scapular-shrugs", name: "Pike Scapular Shrugs", level: "L2", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "scapular", secondaryFocus: ["overhead-load"], compatibleDays: days(1, 2, 4), target: "8–12 reps", cues: ["Keep elbows locked", "Glide shoulders toward and away from ears"], regression: "Bend the knees and keep feet closer.", gate: "G0_LOAD", fallbackId: "pike-elevation", media: media("loop", "required", "Side view; grounded feet, neutral head and straight elbows; scapular positions clearly differ.") },
  { id: "pike-alternating-toe-float", name: "Pike Alternating Toe Float", level: "L2", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "balance", secondaryFocus: ["overhead-load"], compatibleDays: days(2, 4, 5), target: "4–8 floats per side", cues: ["Shift shoulders before lifting", "Never hop from the floor"], regression: "Lighten a toe without lifting it.", gate: "G1_SUPPORT", fallbackId: "pike-shift", media: media("loop", "required", "Side/front-oblique loop; one toe floats at a time after visible shoulder shift; no jump.", { orientation: "front-oblique" }) },
  { id: "box-pike-scapular-shrugs", name: "Wall Inverted-L Scapular Shrugs", level: "L2", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "scapular", secondaryFocus: ["line"], compatibleDays: days(2, 3, 4), target: "6–10 reps", cues: ["Keep hips stacked and elbows locked", "Move only through the shoulder blades"], regression: "Use the Wall Inverted-L Alignment Hold.", gate: "G1_SUPPORT", fallbackId: "box-pike", media: media("loop", "required", "Side view; feet stay on wall, neck neutral and only scapular height changes.") },
  { id: "box-pike-shoulder-shift", name: "Wall Inverted-L Shoulder Shift", level: "L2", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "balance", secondaryFocus: ["line", "overhead-load"], compatibleDays: days(1, 2, 3, 4, 5), target: "6–10 slow shifts", cues: ["Keep hips high", "Move shoulders slightly past the bars"], regression: "Use a smaller shift in the Wall Inverted-L Hold.", gate: "G1_SUPPORT", fallbackId: "box-pike", media: media("loop", "required", "Side view; feet stay on wall and shoulders visibly travel while hips remain high.") },
  { id: "box-pike-one-leg-line-lift", name: "Wall Inverted-L One-Leg Line Lift", level: "L3", category: "Pre-Handstand", eligibleBlocks: ["pre", "handstand"], primaryFocus: "line", secondaryFocus: ["balance"], compatibleDays: days(3, 4, 5), target: "3–6 lifts per side", cues: ["Keep the support foot planted on the wall", "Reach the lifted leg long without arching"], regression: "Lift the leg only halfway.", gate: "G2_INVERSION", fallbackId: "box-pike-shoulder-shift", media: media("loop", "required", "Side view; wall foot remains planted, other leg reaches vertical and ribs stay controlled.") },

  // Abs/core: 16
  { id: "deadbug-heel-tap", name: "Dead-Bug Heel Tap", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 3, 4), target: "6–10 taps per side", cues: ["Keep the lower back heavy", "Tap the heel softly"], regression: "Tap closer to the hips.", media: media("loop", "required", "Side view; tabletop knees alternate heel taps while lumbar contact stays constant.") },
  { id: "long-lever-parallette-plank", name: "Long-Lever Parallette Plank", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["support"], compatibleDays: days(1, 3, 4), target: "20–30 second hold", cues: ["Stack ribs over pelvis", "Push both bars down"], regression: "Move the feet closer or lower the knees.", gate: "G0_LOAD", media: media("static", "required", "Full-body side view; long straight line, feet grounded, both bars fully visible.") },
  { id: "bear-hover-knee-tap", name: "Bear-Hover Knee Tap", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 3, 5), target: "8–12 total taps", cues: ["Hover the knees low", "Keep the pelvis square"], regression: "Keep both knees down.", media: media("loop", "required", "Front-oblique loop; one hand taps opposite knee while hover height and pelvis remain stable.", { orientation: "front-oblique" }) },
  { id: "long-lever-hollow-hold", name: "Long-Lever Hollow Hold", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["anti-extension"], compatibleDays: days(1, 3, 4, 5), target: "15–30 second hold", cues: ["Keep the lower back flat", "Lengthen only while the ribs stay down"], regression: "Shorten the arm and leg levers.", media: media("static", "required", "Side view; long arms and legs, posterior tilt and lifted shoulders clearly visible.") },
  { id: "hollow-flutter-kicks", name: "Hollow Flutter Kicks", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 5), target: "12–20 total kicks", cues: ["Kick small from the hips", "Keep the lower back down"], regression: "Raise the legs or bend the knees.", media: media("loop", "required", "Side view; small alternating kicks with unchanged hollow trunk.") },
  { id: "hollow-to-tuck-rock", name: "Hollow-to-Tuck Rock", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 3, 5), target: "6–10 controlled reps", cues: ["Initiate with the abs", "Do not swing the arms"], regression: "Use a smaller rock and deeper tuck.", media: media("loop", "required", "Side loop clearly shows long hollow and compact tuck connected without arm swing.") },
  { id: "deadbug-double-leg-lower", name: "Dead-Bug Double-Leg Lower", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 4), target: "5–8 slow reps", cues: ["Exhale before lowering", "Stop before the back lifts"], regression: "Lower one leg at a time.", media: media("loop", "required", "Side view; both bent legs lower together and return while lumbar spine stays grounded.") },
  { id: "plank-knee-drive-isometric", name: "Parallette Plank Knee-Drive Hold", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control", "support"], compatibleDays: days(1, 2, 4, 5), target: "4–6 holds per side, 2–3 seconds", cues: ["Keep shoulders over the bars", "Tuck the pelvis as the knee enters"], regression: "Drive the knee only halfway.", gate: "G0_LOAD", media: media("loop", "required", "Side/front-oblique loop; knee drive pauses; both bars and quiet pelvis visible.", { orientation: "front-oblique" }) },
  { id: "crossbody-mountain-climber", name: "Cross-Body Mountain Climber", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["pelvic-control"], compatibleDays: days(2, 4, 5), target: "8–12 total reps", cues: ["Cross the knee without collapsing", "Return to a full plank"], regression: "Reduce the cross-body range.", gate: "G0_LOAD", media: media("loop", "required", "Front-oblique full-body loop; knee crosses toward opposite elbow; hips remain level.", { orientation: "front-oblique" }) },
  { id: "side-plank-hip-lift", name: "Side-Plank Hip Lift", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["support"], compatibleDays: days(2, 3, 5), target: "5–8 reps per side", cues: ["Keep the shoulder stacked", "Lift and lower the hips as one unit"], regression: "Place the lower knee down.", gate: "G0_LOAD", media: media("loop", "required", "Front-oblique view; feet stay on floor; support hand grips one bar; unused bar outside leg path.", { orientation: "front-oblique" }) },
  { id: "side-plank-reach-through", name: "Side-Plank Reach-Through", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["thoracic-reset"], compatibleDays: days(1, 2, 3, 4, 5), target: "4–6 reps per side", cues: ["Rotate through the upper back", "Keep the hips lifted"], regression: "Place the lower knee down.", gate: "G0_LOAD", media: media("loop", "required", "Front-oblique full-body loop; feet on floor, upper arm reaches under and opens.", { orientation: "front-oblique" }) },
  { id: "seated-pike-compression-pulses", name: "Seated Pike Compression Pulses", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 3, 4, 5), target: "8–15 controlled pulses", cues: ["Keep the knees locked", "Incline the chest forward"], regression: "Bend one knee or lift one leg.", media: media("loop", "required", "Front-oblique view; both straight heels pulse off floor without torso rocking back.", { orientation: "front-oblique" }) },
  { id: "alternating-pike-leg-lift", name: "Alternating Pike Leg Lift", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 4, 5), target: "5–8 lifts per side", cues: ["Press the bars down", "Lift without leaning backward"], regression: "Bend the non-working knee.", media: media("loop", "required", "Front-oblique loop; alternating straight leg lift, both bars and grounded heel visible.", { orientation: "front-oblique" }) },
  { id: "parallette-plank-leg-lift", name: "Parallette Plank Leg Lift", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-extension", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 4), target: "6–10 total lifts", cues: ["Keep the pelvis level", "Lift from the glute without arching"], regression: "Slide the toe rather than lifting it.", gate: "G0_LOAD", media: media("loop", "required", "Side view; alternating straight leg lift with unchanged rib-pelvis line and both bars visible.") },
  { id: "hollow-scissor-kicks", name: "Hollow Scissor Kicks", level: "L3", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "hollow", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 3, 4, 5), target: "10–16 total changes", cues: ["Keep both legs long", "Stop before the back arches"], regression: "Use Hollow Flutter Kicks with legs higher.", fallbackId: "hollow-flutter-kicks", media: media("loop", "required", "Side view; controlled larger alternating scissor with fixed hollow trunk.") },
  { id: "straddle-compression-lift", name: "Straddle Compression Lift", level: "L3", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "compression", secondaryFocus: ["pelvic-control"], compatibleDays: days(1, 2, 4, 5), target: "6–10 total lifts", cues: ["Point the knees upward", "Press down before both feet lift"], regression: "Alternate one straddled leg.", fallbackId: "alternating-pike-leg-lift", media: media("loop", "required", "Front view; seated straddle, both straight legs lift clearly with no backward lean.", { orientation: "front-oblique" }) },

  // Handstand skill: 8
  { id: "grounded-side-exit-rehearsal", name: "Grounded Side-Exit Rehearsal", level: "L1", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "exit", secondaryFocus: ["entry"], compatibleDays: days(1, 3, 5), target: "3–5 rehearsals per side", cues: ["Keep gripping the bars as hips turn", "Step down one foot at a time"], regression: "Rehearse from a low pike.", media: media("transition", "required", "Front-oblique low inversion rehearsal shows both exit directions and clear landing space.", { orientation: "front-oblique" }) },
  { id: "wall-facing-handstand-weight-shift", name: "Wall-Facing Handstand Weight Shift", level: "L2", category: "Handstand", eligibleBlocks: ["pre", "handstand"], primaryFocus: "balance", secondaryFocus: ["line"], compatibleDays: days(2, 3, 5), target: "6–10 small shifts", cues: ["Keep both hands on the bars", "Move only a few centimetres"], regression: "Use the Wall Inverted-L Shoulder Shift.", gate: "G2_INVERSION", fallbackId: "box-pike-shoulder-shift", media: media("loop", "required", "Front-oblique chest-to-wall view; toes remain in contact; both hands stay on bars.", { orientation: "front-oblique" }) },
  { id: "chest-wall-alternating-toe-peel", name: "Chest-to-Wall Alternating Toe Peel", level: "L2", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "balance", secondaryFocus: ["line"], compatibleDays: days(2, 3, 5), target: "4–8 peels per side", cues: ["Keep one toe on the wall", "Peel the other without arching"], regression: "Reduce the peel or use Chest-to-Wall Line Hold.", gate: "G2_INVERSION", fallbackId: "chest-wall-line", media: media("loop", "required", "Side view; athlete faces wall; one toe remains while the other peels; no banana arch.") },
  { id: "kickup-stop-short-drill", name: "Kick-Up Stop-Short Drill", level: "L2", category: "Handstand", eligibleBlocks: ["handstand", "pre"], primaryFocus: "entry", secondaryFocus: ["balance"], compatibleDays: days(1, 5), target: "3–5 reps per lead leg", cues: ["Use a deliberately soft kick", "Step down immediately before vertical"], regression: "Use Standing Kick-Up Line Rehearsal.", gate: "G2_INVERSION", fallbackId: "standing-kickup-line-rehearsal", media: media("transition", "required", "Side view; feet leave floor briefly, stop short of wall/vertical, and return under control.") },
  { id: "parallette-kickup-to-wall", name: "Parallette Kick-Up to Wall", level: "L2", category: "Handstand", eligibleBlocks: ["handstand", "pre"], primaryFocus: "entry", secondaryFocus: ["line"], compatibleDays: days(1, 4, 5), target: "3–5 calm entries", cues: ["Set the grip before kicking", "Touch the wall softly"], regression: "Use Controlled Wall Kick-Up or standing rehearsal.", gate: "G2_INVERSION", fallbackId: "wall-kickup", media: media("transition", "required", "Side view; complete grip, kick-up, soft wall contact, stable line and controlled step-down.") },
  { id: "split-leg-wall-pullaway", name: "Split-Leg Wall Pull-Away", level: "L3", category: "Handstand", eligibleBlocks: ["handstand", "pre"], primaryFocus: "balance", secondaryFocus: ["line"], compatibleDays: days(5), target: "3–6 controlled floats", cues: ["Use the front leg as a counterbalance", "Return before the line breaks"], regression: "Use Alternating Toe Peel.", gate: "G3_ENTRY", fallbackId: "chest-wall-alternating-toe-peel", media: media("loop", "required", "Side view; split-leg body, wall foot peels and returns; bars, wall and full body visible.") },
  { id: "wall-handstand-side-exit", name: "Wall Handstand Side Exit", level: "L3", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "exit", secondaryFocus: ["balance"], compatibleDays: days(3, 5), target: "2–4 exits per side", cues: ["Turn hips toward the exit side", "Land one foot at a time in clear space"], regression: "Use Grounded Side-Exit Rehearsal.", gate: "G2_INVERSION", fallbackId: "grounded-side-exit-rehearsal", media: media("transition", "required", "Front-oblique full wall handstand exit shown separately for each side; no cropped landing.", { orientation: "front-oblique" }) },
  { id: "freestanding-parallette-kickup", name: "Freestanding Parallette Kick-Up", level: "L3", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "entry", secondaryFocus: ["balance", "exit"], compatibleDays: days(5), target: "3–5 accurate attempts", cues: ["Use a low-force kick", "Exit sideways before overbalancing"], regression: "Use Parallette Kick-Up to Wall.", gate: "G4_FREE_BAR", fallbackId: "parallette-kickup-to-wall", media: media("transition", "required", "Side/front-oblique view; full calm kick-up, brief line and sideways exit; clear space and both bars visible.", { orientation: "front-oblique" }) },

  // Cooldown/reset: 6
  { id: "forearms-parallette-prayer-rock", name: "Forearms-on-Parallettes Prayer Hold", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "30-second relaxed hold", cues: ["Keep ribs gently tucked", "Breathe into a mild shoulder stretch"], regression: "Keep the hips closer to the knees.", media: media("static", "required", "Side view; forearms supported on equal bars in a static hold without lumbar arch.") },
  { id: "seated-wrist-extension-stretch", name: "Seated Wrist Extension Stretch", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "15 seconds per side", cues: ["Keep the elbow softly straight", "Use only a mild stretch"], regression: "Bend the elbow.", media: media("static", "required", "Front-oblique seated view; stretched hand, wrist angle and relaxed shoulder fully visible.", { orientation: "front-oblique" }) },
  { id: "forearm-pronator-stretch", name: "Forearm Pronator Stretch", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "15 seconds per side", cues: ["Rotate gently from the forearm", "Keep the shoulder relaxed"], regression: "Use less rotation.", media: media("static", "required", "Close front-oblique view clearly shows hand placement without forcing fingers.", { orientation: "front-oblique" }) },
  { id: "crossbody-shoulder-stretch", name: "Cross-Body Shoulder Stretch", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: [], compatibleDays: "all", target: "15 seconds per side", cues: ["Keep the stretched shoulder down", "Pull above the elbow"], regression: "Use lighter pressure.", media: media("static", "required", "Front view; arm crosses at shoulder height, neck and shoulder relaxed.", { orientation: "front-oblique" }) },
  { id: "supine-thoracic-opener", name: "Supine Thoracic Opener", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "thoracic-reset", secondaryFocus: ["shoulder-mobility"], compatibleDays: "all", target: "3–4 slow breaths", cues: ["Keep knees supported", "Rotate through the upper back without forcing"], regression: "Support the reaching arm on a cushion.", media: media("static", "required", "Top-oblique full-body view; stacked knees and open upper arm are clear.", { orientation: "top-oblique" }) },
  { id: "supine-90-90-breathing-reset", name: "Supine 90/90 Breathing Reset", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "breathing", secondaryFocus: ["pelvic-control"], compatibleDays: "all", target: "4–5 slow breaths", cues: ["Keep feet supported on the wall", "Use a long exhale to soften the ribs"], regression: "Place the feet on the floor.", media: media("static", "required", "Side view; hips and knees at 90 degrees, feet on wall and relaxed rib position visible.") },

  // Optional Calisthenics Lab: 16
  { id: "controlled-parallette-pushup", name: "Controlled Parallette Push-Up", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "horizontal-push", secondaryFocus: ["anti-extension"], compatibleDays: days(1, 4), target: "6–10 clean reps", cues: ["Keep the body rigid", "Descend only to a pain-free shoulder depth"], regression: "Perform from the knees.", gate: "G0_LOAD", media: media("loop", "required", "Side full-body loop; neutral grip, controlled safe depth, no excessive shoulder extension.") },
  { id: "parallette-pike-pushup", name: "Parallette Pike Push-Up", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "vertical-push", secondaryFocus: ["overhead-load"], compatibleDays: days(4), target: "4–8 clean reps", cues: ["Send the head forward between the bars", "Track elbows back, not wide"], regression: "Shorten the pike and reduce depth.", gate: "G1_SUPPORT", media: media("loop", "required", "Side view; crown travels forward/down between equal bars; feet grounded and hips high.") },
  { id: "planche-lean-hold", name: "Planche-Lean Hold", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["support"], compatibleDays: days(1, 3, 4, 5), target: "15–25 second hold", cues: ["Lock elbows and protract the upper back", "Lean gradually with toes grounded"], regression: "Use a smaller lean.", gate: "G1_SUPPORT", fallbackId: "parallette-forward-lean-hold", media: media("static", "required", "Side view; toes stay grounded, shoulders beyond bars, elbows straight and scapula protracted.") },
  { id: "frog-stand-hold", name: "Parallette Crane Hold", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["balance"], compatibleDays: days(3, 4, 5), target: "8–20 second hold", cues: ["Support knees on the upper arms", "Look forward and keep toes ready to land"], regression: "Let both toes skim the floor.", gate: "G1_SUPPORT", fallbackId: "floor-frog-stand-setup", media: media("static", "required", "Front-oblique view; correct knee-on-arm contact, forward gaze, bent elbows and safe foot landing path.", { orientation: "front-oblique" }) },
  { id: "frog-stand-weight-shift", name: "Frog-Stand Weight Shift", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["balance"], compatibleDays: days(3, 5), target: "4–8 controlled shifts", cues: ["Move shoulders before toes lighten", "Never jump into balance"], regression: "Keep both feet grounded.", gate: "G1_SUPPORT", fallbackId: "frog-prep", media: media("loop", "required", "Front-oblique loop; correct knee contact, forward gaze and gradual toe lightening.", { orientation: "front-oblique" }) },
  { id: "foot-assisted-lsit", name: "Foot-Assisted L-Sit", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(1, 2, 3, 5), target: "15–25 second hold", cues: ["Press tall through straight arms", "Keep heels lightly grounded"], regression: "Bend the knees and move heels closer.", gate: "G1_SUPPORT", fallbackId: "support-hold", media: media("static", "required", "Side view; heels visibly grounded, hips between bars, elbows straight and shoulders tall.") },
  { id: "alternating-lsit-extension", name: "Alternating L-Sit Leg Extension", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(1, 2, 5), target: "4–8 total extensions", cues: ["Stabilize the tuck first", "Extend one knee without losing height"], regression: "Keep the extending toes near the floor.", gate: "G1_SUPPORT", fallbackId: "tuck-support", media: media("loop", "required", "Front-oblique loop; stable tuck alternates one straight leg with no swing.", { orientation: "front-oblique" }) },
  { id: "tuck-to-one-leg-lsit-transition", name: "Tuck-to-One-Leg L-Sit Transition", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["transition", "compression"], compatibleDays: days(2, 5), target: "3–6 total transitions", cues: ["Extend only from a stable tuck", "Return before shoulders drop"], regression: "Use Foot-Assisted L-Sit.", gate: "G1_SUPPORT", fallbackId: "alternating-lsit-extension", media: media("transition", "required", "Front-oblique complete tuck-to-one-leg extension and controlled return; both sides shown.", { orientation: "front-oblique" }) },
  { id: "eccentric-pike-pushup", name: "Eccentric Pike Push-Up", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "vertical-push", secondaryFocus: ["overhead-load"], compatibleDays: days(4), target: "3–6 reps with 3–4 second lowering", cues: ["Lower the crown between the bars", "Exit safely from the knees"], regression: "Use regular Parallette Pike Push-Up.", gate: "G7_PIKE_PUSH", fallbackId: "parallette-pike-pushup", media: media("transition", "required", "Side view; slow eccentric, controlled knee landing/reset and no head contact.") },
  { id: "pseudo-planche-parallette-pushup", name: "Pseudo-Planche Parallette Push-Up", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "horizontal-push", secondaryFocus: ["planche"], compatibleDays: days(1, 4), target: "4–8 clean reps", cues: ["Keep a constant forward lean", "Track elbows back"], regression: "Use Controlled Parallette Push-Up.", gate: "G6_PLANCHE", fallbackId: "controlled-parallette-pushup", media: media("loop", "required", "Side full-body loop; shoulders remain forward of bars, toes grounded and depth controlled.") },
  { id: "planche-lean-toe-lightener", name: "Planche-Lean Toe Lightener", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["balance"], compatibleDays: days(4, 5), target: "4–8 alternating unloads", cues: ["Keep elbows locked", "Unload one toe only—never jump"], regression: "Use Planche-Lean Hold.", gate: "G6_PLANCHE", fallbackId: "planche-lean-hold", media: media("loop", "required", "Side view; protracted straight-arm lean, one toe lightens at a time, no unsupported launch.") },
  { id: "foot-assisted-tuck-planche", name: "Foot-Assisted Tuck Planche", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["support", "compression"], compatibleDays: days(4, 5), target: "8–15 second hold", cues: ["Pull knees tightly toward the chest", "Keep toes lightly skimming the floor behind"], regression: "Use Frog-Stand Hold or Planche Lean.", gate: "G6_PLANCHE", fallbackId: "planche-lean-hold", media: media("static", "required", "Side view; straight arms, protracted upper back, tucked knees and visibly assisted toes.") },
  { id: "one-leg-lsit-hold", name: "One-Leg L-Sit Hold", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(1, 2, 3, 5), target: "6–12 seconds per side", cues: ["Lock the straight knee", "Stay tall through both shoulders"], regression: "Use Alternating L-Sit Extension.", gate: "G5_LSIT", fallbackId: "alternating-lsit-extension", media: media("static", "required", "Front-oblique view; one straight horizontal leg, other knee tucked, both bars and feet visible.", { orientation: "front-oblique" }) },
  { id: "full-lsit-attempt", name: "Full L-Sit Attempt", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(1, 2, 5), target: "5–15 second clean hold", cues: ["Press down before straightening both knees", "Stop when the hips sink or elbows bend"], regression: "Use One-Leg L-Sit Hold.", gate: "G5_LSIT", fallbackId: "one-leg-lsit-hold", media: media("static", "required", "Side view; both straight legs horizontal, elbows locked, hips clear of floor and full equipment visible.") },
  { id: "tuck-to-lsit-transition", name: "Tuck-to-L-Sit Transition", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["transition", "compression"], compatibleDays: days(2, 5), target: "3–6 controlled reps", cues: ["Straighten without swinging", "Return to tuck before shoulder height drops"], regression: "Use Tuck-to-One-Leg Transition.", gate: "G5_LSIT", fallbackId: "tuck-to-one-leg-lsit-transition", media: media("transition", "required", "Side/front-oblique loop shows stable tuck, full L-sit and controlled return with no swing.", { orientation: "front-oblique" }) },
  { id: "straddle-lsit-compression-prep", name: "Straddle L-Sit Compression Prep", level: "L3", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "lsit", secondaryFocus: ["compression"], compatibleDays: days(2, 5), target: "6–10 controlled lifts", cues: ["Keep knees straight and facing up", "Lean forward from the hips"], regression: "Alternate one straddled leg.", gate: "G5_LSIT", fallbackId: "straddle-compression-lift", media: media("loop", "required", "Front-oblique seated straddle; both straight heels lift clearly without backward rocking.", { orientation: "front-oblique" }) },
];

/*
 * V2 expansion: mat-only alternatives and low-equipment conditioning from the
 * authoritative 163-exercise catalogue. These are intentionally data-driven;
 * the generator can use them without requiring a separate workout template.
 */
const v2ExpansionNames: Record<string, string> = {
  "cat-cow-flow": "Cat-Cow Flow", "bear-shoulder-circles": "Bear Shoulder Circles", "prone-y-t-w-raises": "Prone Y-T-W Raises", "easy-rope-bounce": "Easy Rope Bounce",
  "wall-shoulder-flexion-line-drill": "Wall Shoulder-Flexion Line Drill", "prone-handstand-line-hold": "Prone Handstand-Line Hold", "bear-shoulder-tap": "Bear Shoulder Tap", "down-dog-to-pike-weight-shift": "Down-Dog to Pike Weight Shift", "floor-frog-stand-setup": "Floor Frog-Stand Setup", "wall-split-kick-entry-rehearsal": "Wall Split-Kick Entry Rehearsal",
  "forearm-plank": "Forearm Plank", "rkc-plank": "RKC Plank", "plank-reach": "Plank Reach", "plank-leg-lift": "Plank Leg Lift", "forearm-plank-body-saw": "Forearm Plank Body Saw", "bird-dog": "Bird Dog", "bird-dog-knee-to-elbow": "Bird-Dog Knee-to-Elbow", "bear-crawl-step": "Bear Crawl Step",
  "reverse-crunch": "Reverse Crunch", "bent-knee-leg-lower": "Bent-Knee Leg Lower", "straight-leg-raise": "Straight-Leg Raise", "tuck-up": "Tuck-Up", "controlled-v-up": "Controlled V-Up", "alternating-jackknife": "Alternating Jackknife", "supine-toe-reach": "Supine Toe Reach", "heel-touches": "Heel Touches", "bicycle-crunch-slow": "Bicycle Crunch — Slow",
  "side-plank-star-hold": "Side-Plank Star Hold", "side-plank-knee-drive": "Side-Plank Knee Drive", "forearm-side-plank": "Forearm Side Plank", "glute-bridge-march": "Glute Bridge March", "single-leg-glute-bridge": "Single-Leg Glute Bridge", "reverse-plank-hold": "Reverse Plank Hold", "prone-swimmer": "Prone Swimmer",
  "floor-seated-knee-lift": "Floor Seated Knee Lift", "floor-single-leg-pike-lift": "Floor Single-Leg Pike Lift", "floor-double-leg-pike-lift": "Floor Double-Leg Pike Lift", "straddle-pike-pulses": "Straddle Pike Pulses", "seated-pike-hold-lift-off": "Seated Pike Hold + Lift-Off Attempts", "floor-tuck-v-sit-balance": "Floor Tuck V-Sit Balance",
  "floor-chest-wall-handstand-hold": "Floor Chest-to-Wall Handstand Hold", "floor-back-wall-heel-pull": "Floor Back-to-Wall Heel Pull", "floor-chest-wall-toe-pull": "Floor Chest-to-Wall Toe Pull", "floor-wall-weight-shift": "Floor Wall Weight Shift", "floor-controlled-kick-up-to-wall": "Floor Controlled Kick-Up to Wall", "floor-freestanding-kick-up": "Floor Freestanding Kick-Up", "floor-freestanding-balance-attempt": "Floor Freestanding Balance Attempt", "floor-side-exit-practice": "Floor Side-Exit Practice",
  "knee-push-up": "Knee Push-Up", "floor-push-up": "Floor Push-Up", "tempo-floor-push-up": "Tempo Floor Push-Up", "floor-pike-push-up": "Floor Pike Push-Up", "floor-planche-lean": "Floor Planche Lean", "floor-frog-stand": "Floor Frog Stand", "floor-crane-one-knee-float": "Floor Crane One-Knee Float", "floor-tuck-planche-attempt": "Floor Tuck Planche Attempt",
  "supine-spinal-twist": "Supine Spinal Twist", "sphinx-breathing-hold": "Sphinx Breathing Hold", "kneeling-hip-flexor-stretch": "Kneeling Hip-Flexor Stretch", "seated-straddle-fold-gentle": "Seated Straddle Fold — Gentle", "shoulder-wall-lat-stretch": "Shoulder Wall Lat Stretch",
  "basic-two-foot-bounce": "Basic Two-Foot Bounce", "alternate-foot-step": "Alternate-Foot Step", "boxer-step": "Boxer Step", "side-to-side-ski-hop": "Side-to-Side Ski Hop", "forward-back-hop": "Forward-Back Hop", "high-knee-rope": "High-Knee Rope", "fast-single-under-cadence": "Fast Single-Under Cadence", "recovery-bounce": "Recovery Bounce", "rope-step-through-mobility": "Rope Step-Through Mobility",
};
const v2ExpansionHow: Record<string, string> = {
  "cat-cow-flow": "From hands and knees, alternate a gentle spinal arch and round while the pelvis and head follow the movement smoothly.",
  "bear-shoulder-circles": "Hover the knees just above the floor, keep the trunk quiet and draw small controlled circles through both shoulders.",
  "prone-y-t-w-raises": "Lie face down and lift the arms through Y, T and W shapes using the shoulder blades, returning softly between shapes.",
  "easy-rope-bounce": "Turn the rope from relaxed wrists and make low two-foot jumps, landing quietly under the hips on every pass.",
  "wall-shoulder-flexion-line-drill": "Stand with ribs stacked and slide straight arms overhead toward the wall without leaning the torso back.",
  "prone-handstand-line-hold": "Lie face down with arms overhead, squeeze the legs together and create a long ribs-down handstand line from hands to toes.",
  "bear-shoulder-tap": "From a low bear hover, shift minimally and tap the opposite shoulder without rotating the pelvis.",
  "down-dog-to-pike-weight-shift": "From down-dog, keep the hips high and elbows locked as the shoulders travel toward the hands, then press back.",
  "floor-frog-stand-setup": "Place the knees high on the arms, lean forward gradually and test light foot pressure while keeping a safe landing area.",
  "wall-split-kick-entry-rehearsal": "Face away from the wall, place the hands, split the legs and rehearse a controlled kick path with a soft wall touch.",
  "forearm-plank": "Set elbows beneath shoulders and hold a straight shoulder-to-heel line while gently drawing the ribs toward the pelvis.",
  "rkc-plank": "From forearm plank, squeeze glutes and quads and pull elbows toward toes without moving to create short, high-tension holds.",
  "plank-reach": "From a rigid plank, reach one arm forward without shifting the hips, replace the hand and alternate sides.",
  "plank-leg-lift": "Hold a firm plank and lift one straight leg only as high as the pelvis can remain level, then alternate.",
  "forearm-plank-body-saw": "From forearm plank, glide the whole body a few centimetres backward and forward while maintaining the same trunk shape.",
  "bird-dog": "From hands and knees, extend the opposite arm and leg until long, pause without arching, then return and alternate.",
  "bird-dog-knee-to-elbow": "Extend opposite arm and leg from quadruped, then bring elbow and knee together under the trunk before re-extending.",
  "bear-crawl-step": "Keep the knees hovering low as the opposite hand and foot take a small step, maintaining a quiet level torso.",
  "reverse-crunch": "From supine bent knees, curl the pelvis toward the ribs until the tailbone lifts slightly, then lower without swinging.",
  "bent-knee-leg-lower": "Brace the trunk with hips and knees bent, lower the feet toward the floor only while the low back stays controlled, then return.",
  "straight-leg-raise": "Lie supine and raise both straight legs with the pelvis controlled, then lower only through a range that preserves the trunk position.",
  "tuck-up": "From a long supine position, bring chest and bent knees toward one another under control, then lengthen back out.",
  "controlled-v-up": "Lift straight legs and torso together toward a balanced V position, pause briefly and lower without dropping.",
  "alternating-jackknife": "Raise one straight leg as the opposite hand reaches toward it, lower with control and alternate sides.",
  "supine-toe-reach": "Keep the legs vertical and curl the shoulder blades up as the hands reach toward the toes, then lower slowly.",
  "heel-touches": "With knees bent and shoulders lightly curled, alternate side reaches toward each heel without pulling the head.",
  "bicycle-crunch-slow": "Extend one leg as the opposite shoulder rotates toward the bent knee, pause, and change sides slowly.",
  "side-plank-star-hold": "Stack into a side plank and lift the top leg into a star while the supporting shoulder and pelvis remain stable.",
  "side-plank-knee-drive": "From side plank, draw the top knee toward the torso and extend it again without allowing the hips to collapse.",
  "forearm-side-plank": "Place the elbow beneath the shoulder and hold a straight side line with hips lifted and head aligned with the trunk.",
  "glute-bridge-march": "Hold a level glute bridge and alternately lift one foot a few centimetres without letting the pelvis tip.",
  "single-leg-glute-bridge": "Extend one leg, drive through the grounded foot to lift the hips and lower while keeping the pelvis square.",
  "reverse-plank-hold": "Press through the hands and heels to lift the hips into a long reverse plank with the chest open and neck comfortable.",
  "prone-swimmer": "Lie face down and alternate a small opposite arm-and-leg lift, keeping the motion long rather than arching high.",
  "floor-seated-knee-lift": "Sit tall with knees bent and lift both feet using hip compression without rocking the torso backward.",
  "floor-single-leg-pike-lift": "Sit in pike, press the hands into the floor and lift one locked leg from the hip before changing sides.",
  "floor-double-leg-pike-lift": "Sit tall in pike and lift both straight legs together without throwing the shoulders behind the hips.",
  "straddle-pike-pulses": "Sit in a wide straddle and make small straight-leg lifts from the hips while keeping the torso tall.",
  "seated-pike-hold-lift-off": "Hold a tall pike position, press the hands down and make brief clean attempts to float both heels.",
  "floor-tuck-v-sit-balance": "Balance behind the sitting bones with knees tucked and chest lifted, using only the clean range you can control.",
  "floor-chest-wall-handstand-hold": "Walk the feet up the wall into a chest-to-wall floor handstand, push tall through locked elbows and exit sideways under control.",
  "floor-back-wall-heel-pull": "Kick up softly with heels at the wall, then use finger and wrist pressure to separate the heels briefly without pushing off.",
  "floor-chest-wall-toe-pull": "From chest-to-wall handstand, lighten or peel the toes using hand pressure and body line, then return them softly.",
  "floor-wall-weight-shift": "In a stable wall handstand, shift a small amount of weight from hand to hand without moving or twisting the hands.",
  "floor-controlled-kick-up-to-wall": "Use a calm split-leg kick-up and meet the wall softly, establishing active shoulders before the heels touch.",
  "floor-freestanding-kick-up": "Place the hands, use a measured split-leg kick and stop the entry through the hands before taking a planned side exit.",
  "floor-freestanding-balance-attempt": "Enter calmly, hold only while small hand corrections preserve the line, and exit before control deteriorates.",
  "floor-side-exit-practice": "From a low-to-near-vertical setup, turn the hips and step one foot to the side into a controlled cartwheel-style landing.",
  "knee-push-up": "Keep a straight shoulder-to-knee line as the chest lowers between the hands and presses back up.",
  "floor-push-up": "Lower the rigid body as one unit with elbows tracking back, then press the floor away to full support.",
  "tempo-floor-push-up": "Use about three seconds to lower in a rigid push-up, pause with control and press up without losing the trunk line.",
  "floor-pike-push-up": "Set the hips high, bend the elbows back and lower the head toward the floor between the hands, then press away.",
  "floor-planche-lean": "From a protracted straight-arm plank, move the shoulders gradually beyond the hands while the toes remain grounded.",
  "floor-frog-stand": "Support the knees on the upper arms, lean forward until both feet float and return them before balance is lost.",
  "floor-crane-one-knee-float": "Stabilize a frog/crane hold, lift one knee briefly from its supporting arm, replace it and change sides.",
  "floor-tuck-planche-attempt": "With locked elbows and a protracted upper back, draw the knees toward the chest for a brief controlled float, then reset.",
  "supine-spinal-twist": "Lie on the back, guide bent knees gently to one side while both shoulders relax, and breathe without forcing range.",
  "sphinx-breathing-hold": "Rest on the forearms in a low sphinx, lengthen through the chest and take slow breaths without compressing the low back.",
  "kneeling-hip-flexor-stretch": "From half kneeling, tuck the pelvis slightly and shift forward until a gentle front-of-hip stretch is felt.",
  "seated-straddle-fold-gentle": "Sit tall in a comfortable straddle and hinge forward into a mild stretch while breathing slowly.",
  "shoulder-wall-lat-stretch": "Place hands or forearms on the wall, send the hips back and lower the chest gently while keeping the ribs controlled.",
  "basic-two-foot-bounce": "Turn the rope from the wrists and clear it with low symmetrical jumps, landing quietly under the hips.",
  "alternate-foot-step": "Step over each rope pass on alternating feet in a relaxed jogging rhythm with low impact.",
  "boxer-step": "Shift weight lightly from side to side on each rope pass while keeping the bounce low and rhythm even.",
  "side-to-side-ski-hop": "Keep the feet together and make small lateral hops over each rope pass with a stable torso.",
  "forward-back-hop": "Use small two-foot hops forward and backward while the wrists maintain an even rope cadence.",
  "high-knee-rope": "Alternate higher knee drives over the rope while staying tall and landing softly; slow down before form changes.",
  "fast-single-under-cadence": "Use quick low single-unders driven by the wrists, keeping the shoulders relaxed and jumps economical.",
  "recovery-bounce": "Continue very relaxed low rope passes with easy breathing and reduce cadence whenever tension rises.",
  "rope-step-through-mobility": "Hold the rope wide as a mobility guide and pass it overhead through a comfortable shoulder range without forcing behind the body.",
};
const v2ExpansionIds = Object.keys(v2ExpansionNames);
const ropeExerciseIds = new Set([
  "easy-rope-bounce", "basic-two-foot-bounce", "alternate-foot-step", "boxer-step",
  "side-to-side-ski-hop", "forward-back-hop", "high-knee-rope",
  "fast-single-under-cadence", "recovery-bounce", "rope-step-through-mobility",
]);
const ropeWarmupIds = new Set(["easy-rope-bounce", "recovery-bounce", "rope-step-through-mobility"]);
const v2ExpansionStaticIds = new Set([
  "prone-handstand-line-hold", "forearm-plank", "rkc-plank", "side-plank-star-hold",
  "forearm-side-plank", "floor-tuck-v-sit-balance", "floor-chest-wall-handstand-hold",
  "floor-planche-lean", "reverse-plank-hold", "sphinx-breathing-hold", "supine-spinal-twist",
  "kneeling-hip-flexor-stretch", "seated-straddle-fold-gentle", "shoulder-wall-lat-stretch",
]);
const isRopeExercise = (id: string) => ropeExerciseIds.has(id);
const v2ExpansionFocus = (id: string): Focus => {
  if (isRopeExercise(id)) return id === "rope-step-through-mobility" ? "shoulder-mobility" : ropeWarmupIds.has(id) ? "scapular" : "conditioning";
  if (id.includes("handstand") || id.includes("wall-") || id.includes("kick-up") || id.includes("kickup")) return id.includes("exit") ? "exit" : id.includes("kick") ? "entry" : "line";
  if (id.includes("planche") || id.includes("frog") || id.includes("crane")) return "planche";
  if (id.includes("push-up")) return id.includes("pike") ? "vertical-push" : "horizontal-push";
  if (id.includes("compression") || id.includes("pike-lift") || id.includes("v-sit") || id.includes("leg-lift")) return "compression";
  if (id.includes("plank") || id.includes("bird") || id.includes("bear") || id.includes("bridge")) return id.includes("side") || id.includes("reach") ? "anti-rotation" : "anti-extension";
  if (id.includes("stretch") || id.includes("twist") || id.includes("sphinx") || id.includes("cat-cow")) return "thoracic-reset";
  return "hollow";
};
const v2ExpansionCategory = (id: string): Category => {
  if (id.startsWith("wall-") || id.startsWith("prone-handstand") || id.startsWith("floor-chest-wall") || id.startsWith("floor-back-wall") || id.startsWith("floor-wall") || id.includes("kick-up") || id.includes("freestanding") || id.includes("side-exit")) return "Handstand";
  if (id.startsWith("floor-") && (id.includes("push") || id.includes("planche") || id.includes("frog") || id.includes("crane"))) return "Calisthenics";
  if (id.includes("stretch") || id.includes("twist") || id.includes("sphinx") || id === "seated-straddle-fold-gentle") return "Cooldown";
  if (isRopeExercise(id)) return ropeWarmupIds.has(id) ? "Warm-up" : "Conditioning";
  if (id.includes("compression") || id.includes("pike-lift") || id.includes("v-sit") || id.includes("crunch") || id.includes("toe-reach") || id.includes("jackknife") || id.includes("leg-raise") || id.includes("tuck-up")) return "Abs";
  return "Core";
};
const v2ExpansionLevel = (id: string): ExerciseLevel => {
  if (["easy-rope-bounce", "recovery-bounce"].includes(id)) return "ALL";
  if (["controlled-v-up", "side-plank-star-hold", "floor-freestanding-kick-up", "floor-freestanding-balance-attempt", "floor-tuck-planche-attempt", "floor-crane-one-knee-float"].includes(id)) return "L3";
  if (["rkc-plank", "plank-reach", "plank-leg-lift", "forearm-plank-body-saw", "bird-dog-knee-to-elbow", "bear-crawl-step", "straight-leg-raise", "alternating-jackknife", "bicycle-crunch-slow", "side-plank-knee-drive", "single-leg-glute-bridge", "floor-double-leg-pike-lift", "floor-pike-push-up", "floor-planche-lean", "tempo-floor-push-up", "boxer-step", "side-to-side-ski-hop", "forward-back-hop", "high-knee-rope", "fast-single-under-cadence"].includes(id)) return "L2";
  return "L1";
};
const v2ExpansionSeeds: ExerciseSeed[] = v2ExpansionIds.map((id) => {
  const category = v2ExpansionCategory(id);
  const focus = v2ExpansionFocus(id);
  const level = v2ExpansionLevel(id);
  const isRope = isRopeExercise(id);
  const block: WorkoutBlock = category === "Warm-up" ? "warmup" : category === "Cooldown" ? "cooldown" : category === "Handstand" ? "handstand" : category === "Calisthenics" ? "lab" : "core";
  const equipment: Equipment[] = isRope ? ["rope", "floor"] : category === "Handstand" && id.includes("wall") ? ["wall", "floor"] : category === "Calisthenics" && !id.startsWith("floor-") ? ["parallettes", "floor"] : ["floor"];
  return {
    id,
    name: v2ExpansionNames[id],
    level,
    category,
    eligibleBlocks: [block],
    primaryFocus: focus,
    secondaryFocus: focus === "anti-extension" ? ["pelvic-control"] : ["pelvic-control"],
    compatibleDays: "all",
    target: level === "L3" ? "3–6 controlled attempts" : category === "Cooldown" ? "30-second gentle hold" : "6–12 controlled reps",
    cues: ["Move slowly and stop before alignment changes", "Use the easiest clean range first"],
    regression: "Reduce the range, lever or assistance.",
    media: media(category === "Cooldown" || v2ExpansionStaticIds.has(id) ? "static" : "loop", "audit", `Unified V2 avatar demonstrates ${v2ExpansionNames[id]} with full body and equipment visible.`, { motion: id as MotionPreset }),
    ...(equipment ? { family: category, subfamily: focus, progressionFamily: focus, progressionStage: level === "L1" ? 1 : level === "L2" ? 2 : 3, requiredEquipment: equipment, customFocusTags: [focus, category.toLowerCase()], loadTags: level === "L3" ? ["core_medium", "balance"] : ["low_fatigue"], fatigueCost: { wrist: equipment.includes("parallettes") ? 2 : 0, shoulder: equipment.includes("wall") ? 2 : 1, pushing: category === "Calisthenics" ? 2 : 0, core: 2, inversion: category === "Handstand" ? 3 : 0 }, targetType: level === "L3" ? "attempts" : category === "Cooldown" ? "hold" : "reps", targetMin: level === "L3" ? 3 : 6, targetMax: level === "L3" ? 6 : 12, how: v2ExpansionHow[id], focus: `Keep the ${focus} quality stable throughout.`, safety: "Stop for sharp or escalating pain." } : {}),
  };
});

const allDays: DayNumber[] = [1, 2, 3, 4, 5];
const canonicalCompletionSeeds: ExerciseSeed[] = [
  { id: "down-dog-scapular-shrugs", name: "Down-Dog Scapular Shrugs", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "scapular", secondaryFocus: ["overhead-load"], compatibleDays: days(2, 3, 4), target: "8–12 smooth reps", cues: ["Keep elbows locked", "Move only through the shoulder blades"], regression: "Bend the knees and shorten the down-dog stance.", media: media("loop", "audit", "Full-body down-dog with straight elbows and clearly different shoulder positions.", { motion: "down-dog-scapular-shrugs" }) },
  { id: "full-wall-walk", name: "Full Wall Walk", level: "L2", category: "Pre-Handstand", eligibleBlocks: ["pre"], primaryFocus: "line", secondaryFocus: ["overhead-load"], compatibleDays: days(4, 5), target: "2–4 calm walks", cues: ["Take small hand and foot steps", "Stop before the line or exit becomes uncertain"], regression: "Use a Partial Wall Walk.", gate: "G2_INVERSION", fallbackId: "partial-wall-walk", media: media("transition", "audit", "Feet stay on the wall through a controlled walk toward vertical and a complete walk-down.", { motion: "full-wall-walk" }) },
  { id: "one-foot-assisted-lsit", name: "One-Foot-Assisted L-Sit Support", level: "L1", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(2, 5), target: "8–15 second hold per side", cues: ["Press tall before extending one leg", "Keep only the assisting foot lightly grounded"], regression: "Use Foot-Assisted L-Sit Support.", gate: "G1_SUPPORT", fallbackId: "foot-assisted-lsit", media: media("static", "audit", "One straight leg floats while the opposite foot provides light floor assistance; both bars visible.", { motion: "one-foot-assisted-lsit" }) },
  { id: "tuck-support-knee-extensions", name: "Tuck Support Knee Extensions", level: "L2", category: "Abs", eligibleBlocks: ["core"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(2), target: "4–8 alternating extensions", cues: ["Keep shoulders pressed tall", "Return each leg to tuck without swinging"], regression: "Use a Tuck Support Hold.", gate: "G1_SUPPORT", fallbackId: "tuck-support", media: media("loop", "audit", "Stable tuck alternates one controlled knee extension at a time with locked support arms.", { motion: "tuck-support-knee-extensions" }) },
  { id: "shallow-range-pike-pushup", name: "Shallow-Range Pike Push-Up", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "vertical-push", secondaryFocus: ["overhead-load"], compatibleDays: days(4), target: "4–8 controlled reps", cues: ["Keep hips high and elbows tracking back", "Use a shallow range with no head contact"], regression: "Use a Pike Shoulder Elevation.", gate: "G0_LOAD", fallbackId: "pike-elevation", media: media("loop", "audit", "Side view shows a small controlled pike push-up range, grounded feet and a clear head path.", { motion: "shallow-range-pike-pushup" }) },
  { id: "straddle-planche-lean", name: "Straddle Planche Lean", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["support"], compatibleDays: days(1, 4), target: "10–20 second quality hold", cues: ["Keep elbows locked and upper back protracted", "Use a wide grounded straddle to control the lean"], regression: "Use a standard Planche-Lean Hold.", gate: "G1_SUPPORT", fallbackId: "planche-lean-hold", media: media("static", "audit", "Straight-arm planche lean with clearly grounded wide straddle feet and both bars visible.", { motion: "straddle-planche-lean" }) },
  { id: "support-to-tuck-transition", name: "Support-to-Tuck Transition", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "transition", secondaryFocus: ["support", "compression"], compatibleDays: days(2, 5), target: "4–8 controlled transitions", cues: ["Press tall before the feet leave", "Draw both knees in without swinging"], regression: "Use a Foot-Assisted L-Sit Support.", gate: "G1_SUPPORT", fallbackId: "foot-assisted-lsit", media: media("transition", "audit", "Tall support moves into a compact unsupported tuck and returns with straight arms.", { motion: "support-to-tuck-transition" }) },
  { id: "seated-pike-breathing-reset", name: "Seated Pike Breathing Reset", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "breathing", secondaryFocus: ["compression"], compatibleDays: days(2, 5), target: "4–5 slow breaths", cues: ["Sit tall before a gentle hinge", "Use a long exhale without forcing range"], regression: "Bend the knees slightly.", media: media("static", "audit", "Relaxed seated pike with full body visible, knees softly unlocked if needed and a long neutral spine.", { motion: "seated-pike-breathing-reset" }) },
];

/**
 * Evidence-led library expansion added after the V2.1 implementation audit.
 * These movements fill distinct gaps (active lower-body mobility, posterior
 * body-line strength, parallette pressure control and static flexibility)
 * without changing the authored 25/30-minute programme templates.
 */
const researchExpansionSeeds: ExerciseSeed[] = [
  { id: "palm-lift-wrist-conditioning", name: "Palm-Lift Wrist Conditioning", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "wrist", secondaryFocus: ["grip"], compatibleDays: "all", target: "8–12 controlled lifts", cues: ["Keep every finger pad grounded", "Lift the palms only through a pain-free range"], regression: "Lift one palm at a time or reduce the range.", media: media("loop", "ready", "Full hands stay visible while the palms lift and lower without the fingers peeling.", { motion: "palm-lift-wrist-conditioning" }), family: "Warm-up", subfamily: "wrist", progressionFamily: "Wrist & Loading", progressionStage: 3, requiredEquipment: ["floor"], customFocusTags: ["wrist", "grip"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 1, shoulder: 0, pushing: 0, core: 0, inversion: 0 }, how: "From quadruped, spread the fingers and lift both palms a few millimetres while the finger pads remain heavy, then lower slowly.", focus: "Build active finger and forearm control before gripping the bars.", avoid: "Do not collapse onto the fingertips or force a painful wrist angle.", safety: "Use a light load and stop for tingling, numbness or sharp wrist pain.", targetType: "reps", targetMin: 8, targetMax: 12 },
  { id: "forearm-turn-finger-spread", name: "Forearm Turn + Finger Spread", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "wrist", secondaryFocus: ["grip"], compatibleDays: "all", target: "6–10 turns each way", cues: ["Rotate from the forearms", "Open the fingers fully at each end"], regression: "Use a smaller turn with relaxed elbows.", media: media("loop", "ready", "Front-oblique view clearly shows alternating palm-up and palm-down positions with full finger opening.", { motion: "forearm-turn-finger-spread", orientation: "front-oblique" }), family: "Warm-up", subfamily: "wrist", progressionFamily: "Wrist & Loading", progressionStage: 2, requiredEquipment: ["floor"], customFocusTags: ["wrist", "grip"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 0, inversion: 0 }, how: "Hold the elbows near the ribs, rotate the palms up and down, and spread then softly close the fingers at each end position.", focus: "Prepare forearm rotation and the active grip used on wooden parallettes.", avoid: "Do not twist from the shoulders or snap through the range.", safety: "Keep the movement easy and pain-free.", targetType: "reps", targetMin: 6, targetMax: 10 },
  { id: "alternating-straight-leg-hamstring-sweep", name: "Alternating Straight-Leg Hamstring Sweep", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "hamstring-mobility", secondaryFocus: ["compression"], compatibleDays: "all", target: "5–8 sweeps per side", cues: ["Hinge from the hips with a long spine", "Keep the forward heel grounded and knee softly straight"], regression: "Use a shorter step and smaller hinge.", media: media("loop", "ready", "Full-body side loop alternates a heel-forward hip hinge without bouncing or rounding.", { motion: "alternating-straight-leg-hamstring-sweep" }), family: "Warm-up", subfamily: "active mobility", progressionFamily: "Compression", progressionStage: 1, requiredEquipment: ["floor"], customFocusTags: ["hamstring-mobility", "compression"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 1, inversion: 0 }, how: "Step one heel forward, send the hips back and sweep the hands toward the foot, then stand and change sides.", focus: "Create active hamstring range for pike compression and L-sit work.", avoid: "Avoid bouncing, locking the knee aggressively or rounding the lower back.", safety: "Use mild tension only; this is a warm-up, not a maximal stretch.", targetType: "reps", targetMin: 5, targetMax: 8 },
  { id: "dynamic-half-kneeling-hip-flexor-reach", name: "Dynamic Half-Kneeling Hip-Flexor Reach", level: "ALL", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "hip-mobility", secondaryFocus: ["shoulder-mobility", "pelvic-control"], compatibleDays: "all", target: "5–8 reaches per side", cues: ["Tuck the pelvis before shifting", "Reach overhead without arching the lower back"], regression: "Keep the shift small and the hands at chest height.", media: media("loop", "ready", "Full-body half-kneeling loop shows posterior pelvic tilt, gentle forward shift and overhead reach.", { motion: "dynamic-half-kneeling-hip-flexor-reach" }), family: "Warm-up", subfamily: "active mobility", progressionFamily: "Pelvic Control", progressionStage: 1, requiredEquipment: ["floor"], customFocusTags: ["hip-mobility", "shoulder-mobility", "pelvic-control"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 1, inversion: 0 }, how: "From half kneeling, gently tuck the tail, shift forward a few centimetres and reach both arms overhead before returning.", focus: "Open the hip flexors while rehearsing a ribs-down overhead line.", avoid: "Do not chase range by arching or twisting the pelvis.", safety: "Pad the kneeling knee and use a comfortable range.", targetType: "reps", targetMin: 5, targetMax: 8 },
  { id: "cossack-weight-shift", name: "Cossack Weight Shift", level: "L2", category: "Warm-up", eligibleBlocks: ["warmup"], primaryFocus: "adductor-mobility", secondaryFocus: ["hip-mobility", "compression"], compatibleDays: "all", target: "4–6 shifts per side", cues: ["Keep the moving heel grounded", "Shift only as low as the long leg stays controlled"], regression: "Use a wider stance and shallower bend.", media: media("loop", "ready", "Front-oblique full-body loop shows a controlled side-to-side squat with both feet visible.", { motion: "cossack-weight-shift", orientation: "front-oblique" }), family: "Warm-up", subfamily: "active mobility", progressionFamily: "Compression", progressionStage: 2, requiredEquipment: ["floor"], customFocusTags: ["adductor-mobility", "hip-mobility", "compression"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 1, inversion: 0 }, how: "Take a wide stance and shift into one hip while the opposite leg lengthens, then pass through centre and change sides.", focus: "Prepare active straddle and adductor range for compression work.", avoid: "Do not collapse the knee inward or force the straight-leg foot position.", safety: "Keep the range controlled and pain-free at the knees and groin.", targetType: "reps", targetMin: 4, targetMax: 6 },

  { id: "parallette-wall-grip-pressure-shift", name: "Parallette Wall Grip-Pressure Shift", level: "L2", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "grip", secondaryFocus: ["balance", "line"], compatibleDays: days(1, 2, 3, 5), target: "6–10 small pressure shifts", cues: ["Keep both arms locked and shoulders tall", "Change bar pressure without peeling the toes from the wall"], regression: "Use Wall-Facing Handstand Weight Shift.", gate: "G2_INVERSION", fallbackId: "box-pike-shoulder-shift", media: media("loop", "ready", "Chest-to-wall parallette handstand remains stacked while tiny fore-aft pressure changes are shown at both hands.", { motion: "parallette-wall-grip-pressure-shift", orientation: "front-oblique" }), family: "Handstand", subfamily: "bar balance", progressionFamily: "Handstand Balance", progressionStage: 3, requiredEquipment: ["parallettes", "wall", "floor"], customFocusTags: ["grip", "balance", "line"], loadTags: ["wrist_medium", "balance"], fatigueCost: { wrist: 2, shoulder: 2, pushing: 1, core: 2, inversion: 3 }, how: "In a stable chest-to-wall handstand, alternate a subtle squeeze and release through the bars without changing the body line.", focus: "Learn the grip-pressure corrections that replace much of the floor-hand wrist action.", avoid: "Do not bend the elbows, push off the wall or make large shoulder swings.", safety: "Use only after wall inversion and both sideways exits are reliable.", targetType: "reps", targetMin: 6, targetMax: 10 },
  { id: "chest-wall-micro-shoulder-tap", name: "Chest-to-Wall Micro Shoulder Tap", level: "L2", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "balance", secondaryFocus: ["line", "scapular"], compatibleDays: days(3, 5), target: "3–6 taps per side", cues: ["Shift fully before the hand becomes light", "Tap low and return before the hips rotate"], regression: "Use Wall-Facing Handstand Weight Shift without lifting a hand.", gate: "G2_INVERSION", fallbackId: "wall-facing-handstand-weight-shift", media: media("loop", "ready", "Chest-to-wall handstand shows a tiny controlled hand lift/tap while toes retain wall contact and the support elbow stays locked.", { motion: "chest-wall-micro-shoulder-tap", orientation: "front-oblique" }), family: "Handstand", subfamily: "weight transfer", progressionFamily: "Handstand Balance", progressionStage: 4, requiredEquipment: ["parallettes", "wall", "floor"], customFocusTags: ["balance", "line", "scapular"], loadTags: ["wrist_medium", "balance"], fatigueCost: { wrist: 2, shoulder: 3, pushing: 2, core: 2, inversion: 3 }, how: "Shift onto one locked arm, briefly touch the opposite hand toward the same-side shoulder, replace it and alternate.", focus: "Develop unilateral shoulder loading without losing the handstand line.", avoid: "Do not rush the lift, bend the support elbow or let the pelvis twist.", safety: "Stop before fatigue compromises the sideways exit.", targetType: "reps", targetMin: 3, targetMax: 6 },
  { id: "entry-balance-side-exit-chain", name: "Entry–Balance–Side-Exit Chain", level: "L3", category: "Handstand", eligibleBlocks: ["handstand"], primaryFocus: "entry", secondaryFocus: ["balance", "exit"], compatibleDays: days(5), target: "3–5 complete chains", cues: ["Use a deliberately calm kick-up", "Exit sideways while the balance is still controlled"], regression: "Practise Parallette Kick-Up to Wall and Wall Handstand Side Exit separately.", gate: "G4_FREE_BAR", fallbackId: "wall-handstand-side-exit", media: media("transition", "ready", "Full-body sequence shows a calm parallette entry, short stacked balance and complete one-foot-at-a-time side exit.", { motion: "entry-balance-side-exit-chain", orientation: "front-oblique" }), family: "Handstand", subfamily: "integration", progressionFamily: "Handstand Exit", progressionStage: 4, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["entry", "balance", "exit"], loadTags: ["wrist_medium", "balance"], fatigueCost: { wrist: 2, shoulder: 3, pushing: 2, core: 2, inversion: 3 }, how: "Perform one accurate kick-up, accept only a short controlled balance, then turn the hips and land through the trained side exit.", focus: "Join entry, balance and exit into one repeatable freestanding skill.", avoid: "Do not chase a long hold or wait for an uncontrolled fall before exiting.", safety: "Requires free-bar readiness and a clear landing area on both sides.", targetType: "attempts", targetMin: 3, targetMax: 5 },

  { id: "prone-arch-body-hold", name: "Prone Arch-Body Hold", level: "L1", category: "Core", eligibleBlocks: ["core"], primaryFocus: "posterior-chain", secondaryFocus: ["pelvic-control"], compatibleDays: "all", target: "15–25 second hold", cues: ["Reach long rather than lifting high", "Keep glutes lightly active and neck neutral"], regression: "Keep the hands beside the hips or lift one limb pair.", media: media("static", "ready", "Full-body prone hold shows a long shallow arch with face down, legs together and no excessive lumbar compression.", { motion: "prone-arch-body-hold" }), family: "Core", subfamily: "posterior body line", progressionFamily: "Posterior Chain", progressionStage: 2, requiredEquipment: ["floor"], customFocusTags: ["posterior-chain", "pelvic-control"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 1, pushing: 0, core: 2, inversion: 0 }, how: "Lie face down and lift the chest, arms and legs only a few centimetres while reaching long in both directions.", focus: "Balance hollow-body training with controlled posterior body-line strength.", avoid: "Do not crank the head up or create a high painful lower-back arch.", safety: "Stop if the lower back pinches; shorten the lever immediately.", targetType: "hold", targetMin: 15, targetMax: 25 },
  { id: "hollow-to-arch-log-roll", name: "Hollow-to-Arch Log Roll", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "posterior-chain", secondaryFocus: ["hollow", "pelvic-control"], compatibleDays: days(1, 3, 5), target: "4–8 controlled rolls", cues: ["Keep arms and legs long as one unit", "Pause in both hollow and shallow arch shapes"], regression: "Roll with arms beside the body and knees slightly bent.", media: media("transition", "ready", "Full-body sequence visibly rolls from face-up hollow through the side to a face-down shallow arch without limb swing.", { motion: "hollow-to-arch-log-roll" }), family: "Core", subfamily: "body-line integration", progressionFamily: "Posterior Chain", progressionStage: 4, requiredEquipment: ["floor"], customFocusTags: ["posterior-chain", "hollow", "pelvic-control"], loadTags: ["core_medium"], fatigueCost: { wrist: 0, shoulder: 1, pushing: 0, core: 3, inversion: 0 }, how: "Create a long hollow shape, roll as one connected unit onto the stomach, establish a shallow arch, then reverse direction.", focus: "Maintain whole-body tension while the body changes orientation.", avoid: "Do not throw the arms or legs separately to create momentum.", safety: "Use open floor space and keep the arch shallow.", targetType: "reps", targetMin: 4, targetMax: 8 },
  { id: "bridge-walkout", name: "Bridge Walkout", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "posterior-chain", secondaryFocus: ["pelvic-control", "anti-extension"], compatibleDays: days(1, 3, 4), target: "4–8 complete walkouts", cues: ["Keep the pelvis level as the feet move", "Stop before the hamstrings cramp or the hips drop"], regression: "Use a Glute Bridge March.", media: media("loop", "ready", "Supine bridge shows small alternating heel steps away and back while the pelvis remains level.", { motion: "bridge-walkout" }), family: "Core", subfamily: "posterior chain", progressionFamily: "Posterior Chain", progressionStage: 3, requiredEquipment: ["floor"], customFocusTags: ["posterior-chain", "pelvic-control", "anti-extension"], loadTags: ["core_medium"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 3, inversion: 0 }, how: "Lift into a bridge, take small alternating heel steps away until the lever lengthens, then walk back without lowering the hips.", focus: "Strengthen hamstrings and pelvic control through a gradually longer lever.", avoid: "Do not overarch the ribs, take large steps or continue through cramping.", safety: "Keep the range short until the pelvis stays level.", targetType: "reps", targetMin: 4, targetMax: 8 },
  { id: "high-plank-bird-dog", name: "High-Plank Bird Dog", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["anti-extension"], compatibleDays: days(1, 3, 4, 5), target: "4–8 extensions per side", cues: ["Reach opposite arm and leg long", "Keep the pelvis square and ribs tucked"], regression: "Use a quadruped Bird Dog or widen the feet.", gate: "G0_LOAD", media: media("loop", "ready", "Full-body high plank alternates opposite arm-and-leg reaches with a level pelvis and planted support hand/foot.", { motion: "high-plank-bird-dog" }), family: "Core", subfamily: "anti-rotation", progressionFamily: "Anti-Rotation", progressionStage: 4, requiredEquipment: ["floor"], customFocusTags: ["anti-rotation", "anti-extension"], loadTags: ["core_medium"], fatigueCost: { wrist: 2, shoulder: 2, pushing: 1, core: 3, inversion: 0 }, how: "From a wide-foot high plank, reach one arm and the opposite leg, pause without rotating, replace them and alternate.", focus: "Challenge contralateral anti-rotation with a long plank lever.", avoid: "Do not lift so high that the back arches or the pelvis opens.", safety: "Use a non-slip mat and stop if the support wrist becomes painful.", targetType: "reps", targetMin: 4, targetMax: 8 },
  { id: "lateral-bear-crawl", name: "Lateral Bear Crawl", level: "L2", category: "Core", eligibleBlocks: ["core"], primaryFocus: "anti-rotation", secondaryFocus: ["scapular", "pelvic-control"], compatibleDays: days(2, 3, 5), target: "4–8 steps each direction", cues: ["Keep the knees hovering low", "Move the hand and foot sideways without crossing"], regression: "Use single lateral bear steps with a reset.", media: media("loop", "ready", "Front-oblique full-body loop shows coordinated lateral bear steps with a quiet level trunk.", { motion: "lateral-bear-crawl", orientation: "front-oblique" }), family: "Core", subfamily: "dynamic anti-rotation", progressionFamily: "Anti-Rotation", progressionStage: 3, requiredEquipment: ["floor"], customFocusTags: ["anti-rotation", "scapular", "pelvic-control"], loadTags: ["core_medium"], fatigueCost: { wrist: 2, shoulder: 2, pushing: 1, core: 3, inversion: 0 }, how: "From a low bear hover, move one hand and the same-side foot sideways, follow with the other pair, then reverse direction.", focus: "Build dynamic trunk control while the base of support changes.", avoid: "Do not let the knees rise, feet cross or hips sway side to side.", safety: "Use small steps and clear floor space.", targetType: "reps", targetMin: 4, targetMax: 8 },

  { id: "eccentric-lsit-to-tuck-lower", name: "Eccentric L-Sit-to-Tuck Lower", level: "L2", category: "Calisthenics", eligibleBlocks: ["core", "lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(2, 5), target: "3–6 slow lowers", cues: ["Start tall before extending the legs", "Take 3–4 seconds to return to the tuck"], regression: "Use one straight leg or keep the heels lightly assisted.", gate: "G1_SUPPORT", fallbackId: "tuck-support-knee-extensions", media: media("transition", "ready", "Both bars remain visible as a controlled L-sit shape returns slowly to a high tuck with locked elbows.", { motion: "eccentric-lsit-to-tuck-lower" }), family: "Compression / L-Sit", subfamily: "eccentric control", progressionFamily: "L-Sit", progressionStage: 5, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["lsit", "compression", "support"], loadTags: ["core_medium"], fatigueCost: { wrist: 1, shoulder: 2, pushing: 1, core: 3, inversion: 0 }, how: "From a supported long-leg position, keep the shoulders tall and bend the knees slowly back to a compact tuck.", focus: "Develop the eccentric compression and support needed for longer L-sit holds.", avoid: "Do not drop the hips, bend the elbows or swing the legs into the tuck.", safety: "Use a foot-assisted start if the full long-leg position is not controlled.", targetType: "reps", targetMin: 3, targetMax: 6 },
  { id: "assisted-straddle-lsit-hold", name: "Assisted Straddle L-Sit Hold", level: "L2", category: "Calisthenics", eligibleBlocks: ["core", "lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "support"], compatibleDays: days(2, 5), target: "8–15 second hold", cues: ["Press tall and open the legs from the hips", "Keep only light heel contact with the floor"], regression: "Use a Foot-Assisted L-Sit with the legs closer together.", gate: "G1_SUPPORT", fallbackId: "foot-assisted-lsit", media: media("static", "ready", "Front-oblique view shows locked support arms, wide straight legs and light heel assistance on the floor outside the bars.", { motion: "assisted-straddle-lsit-hold", orientation: "front-oblique" }), family: "Compression / L-Sit", subfamily: "straddle support", progressionFamily: "L-Sit", progressionStage: 5, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["lsit", "compression", "support"], loadTags: ["core_medium"], fatigueCost: { wrist: 1, shoulder: 2, pushing: 1, core: 3, inversion: 0 }, how: "Press into support, open both straight legs into a comfortable straddle and keep the heels only lightly touching the floor.", focus: "Connect straddle compression to a supported L-sit position.", avoid: "Do not sit behind the hands, bend the elbows or force a wide straddle.", safety: "Keep the heel assistance heavy enough to preserve shoulder height.", targetType: "hold", targetMin: 8, targetMax: 15 },
  { id: "alternating-one-leg-lsit-switch", name: "Alternating One-Leg L-Sit Switch", level: "L3", category: "Calisthenics", eligibleBlocks: ["core", "lab"], primaryFocus: "lsit", secondaryFocus: ["compression", "transition"], compatibleDays: days(2, 5), target: "4–8 controlled switches", cues: ["Keep one leg long throughout each switch", "Change legs without dropping the shoulders"], regression: "Use Alternating L-Sit Leg Extension from a tuck.", gate: "G5_LSIT", fallbackId: "alternating-lsit-extension", media: media("loop", "ready", "Stable support alternates which leg is straight while both bars, feet and locked elbows remain visible.", { motion: "alternating-one-leg-lsit-switch", orientation: "front-oblique" }), family: "Compression / L-Sit", subfamily: "switch control", progressionFamily: "L-Sit", progressionStage: 6, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["lsit", "compression", "transition"], loadTags: ["core_medium"], fatigueCost: { wrist: 1, shoulder: 2, pushing: 1, core: 3, inversion: 0 }, how: "Hold one straight leg and one tucked leg, exchange their positions smoothly, pause and repeat without swinging.", focus: "Build one-leg L-sit endurance and controlled transitions toward a full hold.", avoid: "Do not kick through the change or let the hips drop between sides.", safety: "Use only after clean one-leg L-sit holds are established.", targetType: "reps", targetMin: 4, targetMax: 8 },

  { id: "parallette-push-up-plus", name: "Parallette Push-Up Plus", level: "L1", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "scapular", secondaryFocus: ["horizontal-push", "anti-extension"], compatibleDays: days(1, 3, 4), target: "6–10 controlled reps", cues: ["Finish every rep with straight elbows", "Push the upper back gently toward the ceiling at the top"], regression: "Perform from the knees or use only the straight-arm plus phase.", gate: "G0_LOAD", media: media("loop", "ready", "Full-body parallette push-up finishes with an unmistakable straight-arm protraction phase; both equal bars stay visible.", { motion: "parallette-push-up-plus" }), family: "Strength", subfamily: "scapular push", progressionFamily: "Pushing Strength", progressionStage: 2, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["scapular", "horizontal-push", "anti-extension"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 1, shoulder: 2, pushing: 2, core: 2, inversion: 0 }, how: "Perform a controlled push-up, lock the elbows at the top and continue by spreading the shoulder blades before returning to neutral.", focus: "Strengthen serratus-driven protraction on a stable neutral-grip base.", avoid: "Do not bend the elbows during the plus phase or sag through the lower back.", safety: "Use a pain-free depth and stable bar placement.", targetType: "reps", targetMin: 6, targetMax: 10 },
  { id: "planche-lean-scapular-pulse", name: "Planche-Lean Scapular Pulse", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "planche", secondaryFocus: ["scapular", "support"], compatibleDays: days(1, 4), target: "6–10 small pulses", cues: ["Keep elbows completely locked", "Maintain the forward lean while the shoulder blades move"], regression: "Use a smaller Parallette Forward-Lean Hold.", gate: "G1_SUPPORT", fallbackId: "parallette-forward-lean-hold", media: media("loop", "ready", "Side view shows a grounded-toe planche lean with two visibly different protraction positions and straight elbows.", { motion: "planche-lean-scapular-pulse" }), family: "Strength", subfamily: "planche support", progressionFamily: "Planche Foundation", progressionStage: 3, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["planche", "scapular", "support"], loadTags: ["wrist_medium"], fatigueCost: { wrist: 2, shoulder: 2, pushing: 2, core: 2, inversion: 0 }, how: "Hold a modest straight-arm planche lean and make small controlled scapular protraction pulses without shifting the feet.", focus: "Develop active protraction while maintaining forward straight-arm load.", avoid: "Do not bend the elbows, shrug passively or increase the lean during a pulse.", safety: "Reduce the lean immediately if the wrists or front of the shoulders become painful.", targetType: "reps", targetMin: 6, targetMax: 10 },
  { id: "staggered-parallette-push-up", name: "Staggered Parallette Push-Up", level: "L2", category: "Calisthenics", eligibleBlocks: ["lab"], primaryFocus: "horizontal-push", secondaryFocus: ["anti-rotation"], compatibleDays: days(1, 4), target: "4–8 reps per arrangement", cues: ["Place one bar only slightly ahead of the other", "Keep shoulders and hips square through the press"], regression: "Use a standard Controlled Parallette Push-Up.", gate: "G1_SUPPORT", fallbackId: "controlled-parallette-pushup", media: media("loop", "ready", "Front-oblique full-body loop clearly shows slightly staggered equal-height bars and a square controlled push-up.", { motion: "staggered-parallette-push-up", orientation: "front-oblique" }), family: "Strength", subfamily: "horizontal push", progressionFamily: "Pushing Strength", progressionStage: 4, requiredEquipment: ["parallettes", "floor"], customFocusTags: ["horizontal-push", "anti-rotation"], loadTags: ["core_medium"], fatigueCost: { wrist: 1, shoulder: 3, pushing: 3, core: 2, inversion: 0 }, how: "Offset one parallette a small amount, perform controlled square push-ups, then reverse the bar arrangement for the next set.", focus: "Add a manageable anti-rotation demand without changing bar height.", avoid: "Do not use a large stagger, rotate the pelvis or descend beyond comfortable shoulder depth.", safety: "Confirm both bars are stable before loading them.", targetType: "reps", targetMin: 4, targetMax: 8 },

  { id: "supine-hamstring-stretch", name: "Supine Hamstring Stretch", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "hamstring-mobility", secondaryFocus: ["breathing"], compatibleDays: "all", target: "15 seconds per side", cues: ["Keep the pelvis heavy and shoulders relaxed", "Hold behind the thigh rather than pulling the knee"], regression: "Bend the raised knee more or keep the other knee bent.", media: media("static", "ready", "Full-body face-up hold shows one supported raised leg, relaxed shoulders and the opposite foot grounded.", { motion: "supine-hamstring-stretch" }), family: "Cooldown", subfamily: "hamstring flexibility", progressionFamily: "Compression", progressionStage: 1, requiredEquipment: ["floor"], customFocusTags: ["hamstring-mobility", "breathing"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 0, inversion: 0 }, how: "Lie on the back, support one thigh with both hands and gently lengthen that knee while the pelvis remains still.", focus: "Use a comfortable static hamstring hold after compression work.", avoid: "Do not force the knee straight or lift the pelvis to gain range.", safety: "Use mild tension and breathe normally; stop for nerve-like pain or tingling.", targetType: "hold", targetMin: 15, targetMax: 15 },
  { id: "figure-four-glute-stretch", name: "Figure-Four Glute Stretch", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "hip-mobility", secondaryFocus: ["breathing"], compatibleDays: "all", target: "15 seconds per side", cues: ["Keep the head and shoulders relaxed", "Draw the supporting thigh in only to a mild stretch"], regression: "Keep the supporting foot on the floor.", media: media("static", "ready", "Full-body supine figure-four position clearly shows ankle-over-thigh placement with relaxed head and shoulders.", { motion: "figure-four-glute-stretch" }), family: "Cooldown", subfamily: "glute flexibility", progressionFamily: "Pelvic Control", progressionStage: 1, requiredEquipment: ["floor"], customFocusTags: ["hip-mobility", "breathing"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 0, inversion: 0 }, how: "Cross one ankle over the opposite thigh and gently bring the supporting leg toward the body while the pelvis stays heavy.", focus: "Relax the glutes and external rotators after support and compression work.", avoid: "Do not press directly on the knee or force the hip into pain.", safety: "Use the grounded-foot regression if the hip or knee feels restricted.", targetType: "hold", targetMin: 15, targetMax: 15 },
  { id: "gentle-frog-adductor-hold", name: "Gentle Frog/Adductor Hold", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "adductor-mobility", secondaryFocus: ["breathing"], compatibleDays: days(2, 5), target: "30-second gentle hold", cues: ["Keep knees comfortably padded", "Send the hips back only until a mild inner-thigh stretch"], regression: "Bring the knees closer together and keep the hips forward.", media: media("static", "ready", "Front-oblique full-body frog stretch shows padded wide knees, supported forearms and neutral spine.", { motion: "gentle-frog-adductor-hold", orientation: "front-oblique" }), family: "Cooldown", subfamily: "adductor flexibility", progressionFamily: "Compression", progressionStage: 1, requiredEquipment: ["floor"], customFocusTags: ["adductor-mobility", "breathing"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 0, inversion: 0 }, how: "From hands and knees, widen the knees comfortably, rest on the forearms and ease the hips back while breathing slowly.", focus: "Provide a gentle static adductor option after straddle compression work.", avoid: "Do not force the knees wide, bounce or twist the feet aggressively.", safety: "Use padding and stop for groin, hip or knee pain.", targetType: "hold", targetMin: 30, targetMax: 30 },
  { id: "no-rope-penguin-taps", name: "No-Rope Penguin Taps", level: "L1", category: "Conditioning", eligibleBlocks: ["core"], primaryFocus: "conditioning", secondaryFocus: ["pelvic-control"], compatibleDays: "all", target: "20–30 quiet taps", cues: ["Use low relaxed jumps", "Tap the outer thighs once per imaginary rope turn"], regression: "March in place with the same hand rhythm.", media: media("loop", "ready", "Full-body standing loop shows low symmetrical hops and hands tapping the outer thighs with no rope present.", { motion: "no-rope-penguin-taps", orientation: "front-oblique" }), family: "Conditioning", subfamily: "rope rhythm", progressionFamily: "Conditioning", progressionStage: 1, requiredEquipment: ["floor"], customFocusTags: ["conditioning", "pelvic-control"], loadTags: ["low_fatigue"], fatigueCost: { wrist: 0, shoulder: 0, pushing: 0, core: 1, inversion: 0 }, how: "Make small two-foot hops and tap both outer thighs once on each jump to rehearse rope timing without a rope.", focus: "Build single-under rhythm when a rope or suitable ceiling space is unavailable.", avoid: "Do not jump high, land stiffly or accelerate beyond a quiet rhythm.", safety: "Use a low-impact march if jumping is uncomfortable.", targetType: "reps", targetMin: 20, targetMax: 30 },
];
const correctedMotionIds = new Set([
  "pike-shift", "support-hold", "bent-compression", "hollow-tuck", "wall-l",
  "support-shrugs", "box-pike", "tuck-support", "straight-compression",
  "box-toe-light", "kneeling-lean", "partial-wall-walk", "chest-wall-line",
  "frog-prep", "pike-elevation", "supported-knee-raise", "plank-knee-elbow",
  "boat-hold", "side-plank", "wall-elevation", "wall-kickup",
  "single-leg-compression", "heel-pullaway",
]);
const fallbackDefaults: Partial<Record<string, string>> = {
  "wall-kickup": "standing-kickup-line-rehearsal",
  "chest-wall-line": "box-pike",
  "tuck-support": "support-hold",
  "supported-knee-raise": "bent-compression",
  "box-toe-light": "box-pike",
  "wall-elevation": "pike-elevation",
  "heel-pullaway": "chest-wall-line",
  "parallette-pike-pushup": "pike-scapular-shrugs",
};
const normalizeExercise = (seed: ExerciseSeed, introduced: Exercise["introduced"]): Exercise => ({
  ...seed,
  ...(seed.fallbackId || fallbackDefaults[seed.id]
    ? { fallbackId: seed.fallbackId ?? fallbackDefaults[seed.id] }
    : {}),
  media: {
    ...seed.media,
    ...((introduced === "v2" || correctedMotionIds.has(seed.id)) && !seed.media.motion
      ? { motion: seed.id as MotionPreset }
      : {}),
  },
  introduced,
  availableLevels:
    seed.level === "ALL"
      ? ["L1", "L2", "L3"]
      : seed.level === "L1"
        ? ["L1", "L2", "L3"]
        : seed.level === "L2"
          ? ["L2", "L3"]
          : ["L3"],
  blocks: seed.eligibleBlocks,
  days: seed.compatibleDays === "all" ? allDays : seed.compatibleDays,
});

const excludedV2Ids = new Set([
  "kneeling-lean", "cross-press", "boat-hold", "plank-tap-out", "mountain-climber", "plank-knee-elbow", "frog-prep",

  "prayer-wrist-waves", "inchworm-pike-walkout", "crossbody-mountain-climber", "frog-stand-weight-shift", "forearm-pronator-stretch", "supine-thoracic-opener",
]);
export const exercises: Record<string, Exercise> = Object.fromEntries([
  ...existing.filter((item) => !excludedV2Ids.has(item.id)).map((item) => [item.id, normalizeExercise(item, "original")] as const),
  ...additions.filter((item) => !excludedV2Ids.has(item.id)).map((item) => [item.id, normalizeExercise(item, "v2")] as const),
  ...v2ExpansionSeeds.filter((item) => !excludedV2Ids.has(item.id)).map((item) => [item.id, normalizeExercise(item, "v2")] as const),
  ...canonicalCompletionSeeds.map((item) => [item.id, normalizeExercise(item, "v2")] as const),
  ...researchExpansionSeeds.map((item) => [item.id, normalizeExercise(item, "v2")] as const),
]);

// V2 equipment audit: retain stable IDs for saved plans, but remove the old
// box/bench assumption from the visible instruction and generator metadata.
const equipmentFor = (exercise: Exercise): Equipment[] => {
  if (["box-pike", "box-toe-light", "box-pike-scapular-shrugs", "box-pike-shoulder-shift", "box-pike-one-leg-line-lift"].includes(exercise.id)) return ["parallettes", "wall", "floor"];
  if (["wall-facing-handstand-weight-shift", "chest-wall-alternating-toe-peel", "split-leg-wall-pullaway", "wall-handstand-side-exit", "chest-wall-micro-shoulder-tap"].includes(exercise.id)) return ["parallettes", "wall", "floor"];
  if (exercise.category === "Cooldown" || exercise.category === "Warm-up") return exercise.requiredEquipment ?? ["floor"];
  if (exercise.category === "Handstand" && exercise.id.includes("wall")) return ["wall", "floor", ...(exercise.id.includes("parallette") ? ["parallettes" as Equipment] : [])];
  return exercise.requiredEquipment ?? ["parallettes", "floor"];
};
for (const exercise of Object.values(exercises)) {
  exercise.requiredEquipment = equipmentFor(exercise);
  exercise.family ??= exercise.category;
  exercise.progressionFamily ??= exercise.primaryFocus;
  exercise.progressionStage ??= exercise.level === "L3" ? 3 : exercise.level === "L2" ? 2 : 1;
  exercise.customFocusTags ??= [exercise.primaryFocus, ...exercise.secondaryFocus];
  exercise.loadTags ??= exercise.level === "L3" ? ["wrist_medium", "core_medium"] : ["low_fatigue"];
  exercise.how ??= exercise.media.specification;
  exercise.focus ??= exercise.cues[0];
  exercise.avoid ??= exercise.category === "Warm-up"
    ? "Avoid bouncing, forced end range or loading through numbness or sharp pain."
    : exercise.category === "Cooldown"
      ? "Avoid bouncing or forcing a deeper stretch; use an easy breathing range."
      : exercise.category === "Handstand"
        ? "Avoid rushed entries, passive shoulders or continuing after the exit path becomes uncertain."
        : exercise.primaryFocus === "compression" || exercise.primaryFocus === "lsit"
          ? "Avoid rocking the torso, swinging the legs or bending the knees beyond the prescribed variation."
          : exercise.primaryFocus === "planche" || exercise.category === "Calisthenics"
            ? "Avoid losing active shoulders or the prescribed elbow position; reset before leverage changes the shape."
            : "Avoid using momentum or letting the ribs and pelvis leave the demonstrated trunk position.";
  exercise.safety ??= "Stop for sharp or escalating pain and reset before form breaks.";
  exercise.targetType ??= exercise.category === "Cooldown" || exercise.media.kind === "static" || exercise.target.toLowerCase().includes("hold") || exercise.target.toLowerCase().includes("second") ? "hold" : exercise.target.toLowerCase().includes("attempt") ? "attempts" : "reps";
  const targetNumbers = exercise.target.match(/\d+/gu)?.map(Number) ?? [];
  exercise.targetMin ??= targetNumbers[0] ?? 1;
  exercise.targetMax ??= targetNumbers[1] ?? targetNumbers[0] ?? 1;
  if (exercise.id === "box-pike") exercise.name = "Wall Inverted-L Alignment Hold";
  if (exercise.id === "box-toe-light") exercise.name = "Wall Inverted-L Foot Lightener";
  if (exercise.id === "box-pike-scapular-shrugs") exercise.name = "Wall Inverted-L Scapular Shrugs";
  if (exercise.id === "box-pike-shoulder-shift") exercise.name = "Wall Inverted-L Shoulder Shift";
  if (exercise.id === "box-pike-one-leg-line-lift") exercise.name = "Wall Inverted-L One-Leg Line Lift";
  // The production UI uses the audited, owned vector rig for every movement.
  // Legacy GIF paths remain in source history only and never ship as active media.
  if (exercise.media.motion) {
    exercise.media.status = "ready";
    delete exercise.media.src;
  }
}

// These canonical Foundation movements are intentionally available from L1;
// readiness gates, not the whole-session level, protect their loaded variants.
for (const id of ["box-toe-light", "wall-elevation", "wall-kickup", "plank-tap", "foot-assisted-lsit", "hollow-reach", "supported-knee-raise"]) {
  const exercise = exercises[id];
  if (!exercise) continue;
  exercise.level = "L1";
  exercise.availableLevels = ["L1", "L2", "L3"];
}
const addCanonicalBlock = (id: string, block: WorkoutBlock) => {
  const exercise = exercises[id];
  if (!exercise || exercise.eligibleBlocks.includes(block)) return;
  exercise.eligibleBlocks = [...exercise.eligibleBlocks, block];
  exercise.blocks = exercise.eligibleBlocks;
};
const addCanonicalDay = (id: string, day: DayNumber) => {
  const exercise = exercises[id];
  if (!exercise) return;
  const current = exercise.compatibleDays === "all" ? allDays : exercise.compatibleDays;
  const next = Array.from(new Set([...current, day])).sort() as DayNumber[];
  exercise.compatibleDays = next;
  exercise.days = next;
};
addCanonicalBlock("grounded-side-exit-rehearsal", "pre");
for (const id of ["foot-assisted-lsit", "alternating-lsit-extension", "full-lsit-attempt", "one-leg-lsit-hold", "parallette-pike-pushup", "eccentric-pike-pushup"]) addCanonicalBlock(id, "core");
for (const [id, day] of [
  ["chest-wall-line", 1], ["chest-wall-alternating-toe-peel", 1], ["heel-pullaway", 2],
  ["split-leg-wall-pullaway", 2], ["long-lever-hollow-hold", 2], ["kickup-stop-short-drill", 4],
  ["hollow-flutter-kicks", 4], ["wall-kickup", 4],
] as Array<[string, DayNumber]>) addCanonicalDay(id, day);

export const skillProgressionPaths = [
  { label: "Straight-Arm Support", customFocus: "support", steps: ["support-hold", "support-shrugs", "tuck-support", "supported-knee-raise"] },
  { label: "Hollow / Anti-Extension", customFocus: "core", steps: ["dead-bug", "deadbug-heel-tap", "hollow-tuck", "hollow-one-leg", "deadbug-double-leg-lower", "long-lever-hollow-hold", "hollow-rocks", "hollow-to-arch-log-roll", "hollow-scissor-kicks"] },
  { label: "Posterior Chain", customFocus: "core", steps: ["glute-bridge-march", "reverse-plank-hold", "prone-arch-body-hold", "bridge-walkout", "hollow-to-arch-log-roll"] },
  { label: "Pelvic Control", customFocus: "core", steps: ["reverse-crunch", "bent-knee-leg-lower", "straight-leg-raise", "controlled-v-up"] },
  { label: "Anti-Rotation", customFocus: "core", steps: ["forearm-side-plank", "side-plank", "lateral-bear-crawl", "side-plank-hip-lift", "high-plank-bird-dog", "side-plank-reach-through", "side-plank-star-hold"] },
  { label: "Compression", customFocus: "compression", steps: ["bent-compression", "single-leg-compression", "alternating-pike-leg-lift", "straight-compression", "seated-pike-compression-pulses", "straddle-compression-lift"] },
  { label: "L-Sit", customFocus: "lsit", steps: ["foot-assisted-lsit", "one-foot-assisted-lsit", "tuck-support-knee-extensions", "alternating-lsit-extension", "assisted-straddle-lsit-hold", "eccentric-lsit-to-tuck-lower", "one-leg-lsit-hold", "alternating-one-leg-lsit-switch", "full-lsit-attempt"] },
  { label: "Handstand Line", customFocus: "handstand", steps: ["pike-shift", "wall-l", "partial-wall-walk", "chest-wall-line", "chest-wall-alternating-toe-peel"] },
  { label: "Handstand Entry", customFocus: "handstand", steps: ["standing-kickup-line-rehearsal", "wall-kickup", "kickup-stop-short-drill", "freestanding-parallette-kickup"] },
  { label: "Handstand Balance", customFocus: "handstand", steps: ["wall-facing-handstand-weight-shift", "parallette-wall-grip-pressure-shift", "chest-wall-micro-shoulder-tap", "heel-pullaway", "split-leg-wall-pullaway", "freestanding-parallette-kickup"] },
  { label: "Handstand Exit", customFocus: "handstand", steps: ["grounded-side-exit-rehearsal", "floor-side-exit-practice", "wall-handstand-side-exit", "entry-balance-side-exit-chain"] },
  { label: "Planche Foundation", customFocus: "planche", steps: ["parallette-forward-lean-hold", "planche-lean-hold", "planche-lean-scapular-pulse", "planche-lean-toe-lightener", "foot-assisted-tuck-planche", "floor-tuck-planche-attempt"] },
  { label: "Pushing Strength", customFocus: "pushing", steps: ["knee-push-up", "floor-push-up", "parallette-push-up-plus", "controlled-parallette-pushup", "staggered-parallette-push-up", "tempo-floor-push-up", "pseudo-planche-parallette-pushup"] },
  { label: "Overhead Strength", customFocus: "pushing", steps: ["pike-elevation", "shallow-range-pike-pushup", "floor-pike-push-up", "parallette-pike-pushup", "eccentric-pike-pushup"] },
  { label: "Support Transitions", customFocus: "support", steps: ["support-to-tuck-transition", "tuck-to-one-leg-lsit-transition", "tuck-to-lsit-transition"] },
] as const;
for (const path of skillProgressionPaths) {
  path.steps.forEach((id, index) => {
    const exercise = exercises[id];
    if (!exercise) return;
    exercise.progressionFamily = path.label;
    exercise.progressionStage = index + 1;
    exercise.easierId = index > 0 ? path.steps[index - 1] : undefined;
    exercise.harderId = index < path.steps.length - 1 ? path.steps[index + 1] : undefined;
    exercise.prerequisites = index > 0 ? [path.steps[index - 1]] : [];
  });
}

export const exerciseList = Object.values(exercises);

const rx = (exerciseId: string, target?: string): Prescription => ({ exerciseId, ...(target ? { target } : {}) });
const levelTemplate = (
  pre: [Prescription, Prescription],
  core: [Prescription, Prescription, Prescription, Prescription],
  skill: Prescription,
  cooldown: [Prescription, Prescription],
): WorkoutLevelTemplate => ({ pre, core, skill, cooldown });
const labTemplate = (
  label: string,
  a: Prescription,
  b: Prescription,
  intensityNote?: string,
): CalisthenicsLab => ({ label, a, b, sequence: ["selected", "selected", "selected", "selected", "selected"], ...(intensityNote ? { intensityNote } : {}) });

export const universalWarmup: [Prescription, Prescription, Prescription] = [
  rx("wrist-palms"),
  rx("shoulder-sweep"),
  rx("scap-pushup"),
];
export const universalWarmupIds: [string, string, string] = [
  "wrist-palms",
  "shoulder-sweep",
  "scap-pushup",
];

/** Canonical warm-up roles from the V2.1 programme matrix.  The familiar
 * three-minute format stays fixed while the movements match each day's load. */
export const warmupsByVariant: Record<`${DayNumber}-${DifficultyLevel}`, [Prescription, Prescription, Prescription]> = {
  "1-L1": [rx("wrist-palms"), rx("shoulder-sweep"), rx("scap-pushup")],
  "1-L2": [rx("wrist-palms"), rx("shoulder-sweep"), rx("scap-pushup")],
  "1-L3": [rx("fingertip-wrist-pulses"), rx("shoulder-sweep"), rx("scap-pushup")],
  "2-L1": [rx("wrist-circles"), rx("plank-pike"), rx("alternating-straight-leg-hamstring-sweep")],
  "2-L2": [rx("wrist-circles"), rx("plank-pike"), rx("alternating-straight-leg-hamstring-sweep")],
  "2-L3": [rx("fingertip-wrist-pulses"), rx("plank-pike"), rx("cossack-weight-shift")],
  "3-L1": [rx("wrist-circles"), rx("kneeling-thoracic-rotation"), rx("down-dog-scapular-shrugs")],
  "3-L2": [rx("wrist-circles"), rx("kneeling-thoracic-rotation"), rx("down-dog-scapular-shrugs")],
  "3-L3": [rx("wrist-circles"), rx("kneeling-thoracic-rotation"), rx("down-dog-scapular-shrugs")],
  "4-L1": [rx("wrist-palms"), rx("wall-slides"), rx("scap-pushup")],
  "4-L2": [rx("wrist-palms"), rx("wall-slides"), rx("scap-pushup")],
  "4-L3": [rx("fingertip-wrist-pulses"), rx("wall-slides"), rx("scap-pushup")],
  "5-L1": [rx("fingertip-wrist-pulses"), rx("shoulder-sweep"), rx("alternating-straight-leg-hamstring-sweep")],
  "5-L2": [rx("fingertip-wrist-pulses"), rx("plank-pike"), rx("alternating-straight-leg-hamstring-sweep")],
  "5-L3": [rx("fingertip-wrist-pulses"), rx("plank-pike"), rx("cossack-weight-shift")],
};

const cooldowns: Record<DayNumber, [Prescription, Prescription]> = {
  1: [rx("wrist-flexor-rock"), rx("child-reach")],
  2: [rx("wrist-extensor-rock"), rx("seated-pike-breathing-reset")],
  3: [rx("thread-needle"), rx("supine-90-90-breathing-reset")],
  4: [rx("wrist-extensor-rock"), rx("lat-parallette")],
  5: [rx("wrist-flexor-rock"), rx("chest-opener")],
};

export const workouts: WorkoutDay[] = [
  {
    day: 1,
    title: "Foundation & Abs",
    focus: "Build straight-arm confidence, hollow control and calm wall loading.",
    intensity: "Moderate",
    levels: {
      L1: levelTemplate(
        [rx("pike-shift"), rx("support-hold")],
        [rx("hollow-tuck"), rx("deadbug-heel-tap"), rx("plank-tap"), rx("bent-compression")],
        rx("wall-l"),
        cooldowns[1],
      ),
      L2: levelTemplate(
        [rx("pike-shift"), rx("pike-elevation")],
        [rx("long-lever-hollow-hold"), rx("deadbug-double-leg-lower"), rx("plank-tap"), rx("alternating-pike-leg-lift")],
        rx("chest-wall-line"),
        cooldowns[1],
      ),
      L3: levelTemplate(
        [rx("support-shrugs"), rx("pike-elevation")],
        [rx("hollow-scissor-kicks"), rx("long-lever-parallette-plank"), rx("side-plank-reach-through"), rx("straddle-compression-lift")],
        rx("chest-wall-alternating-toe-peel"),
        [rx("wrist-flexor-rock"), rx("lat-parallette")],
      ),
    },
    labs: {
      L2: labTemplate("Planche Foundation", rx("planche-lean-hold"), rx("foot-assisted-lsit")),
      L3: labTemplate("Straddle Planche", rx("straddle-planche-lean"), rx("pseudo-planche-parallette-pushup")),
    },
  },
  {
    day: 2,
    title: "Compression & Tuck Strength",
    focus: "Own the support position and build the compression needed for future L-sits.",
    intensity: "Strong",
    levels: {
      L1: levelTemplate(
        [rx("support-shrugs"), rx("support-hold")],
        [rx("foot-assisted-lsit"), rx("single-leg-compression"), rx("one-foot-assisted-lsit"), rx("side-plank")],
        rx("box-toe-light"),
        cooldowns[2],
      ),
      L2: levelTemplate(
        [rx("support-shrugs"), rx("support-hold")],
        [rx("tuck-support"), rx("tuck-support-knee-extensions"), rx("alternating-lsit-extension"), rx("side-plank-hip-lift")],
        rx("heel-pullaway"),
        cooldowns[2],
      ),
      L3: levelTemplate(
        [rx("support-shrugs"), rx("support-hold")],
        [rx("full-lsit-attempt"), rx("straight-compression"), rx("long-lever-hollow-hold"), rx("side-plank-reach-through")],
        rx("split-leg-wall-pullaway"),
        cooldowns[2],
      ),
    },
    labs: {
      L2: labTemplate("L-Sit Transition", rx("tuck-to-one-leg-lsit-transition"), rx("support-to-tuck-transition")),
      L3: labTemplate("Full L-Sit Transition", rx("tuck-to-lsit-transition"), rx("full-lsit-attempt")),
    },
  },
  {
    day: 3,
    title: "Light Line & Control",
    focus: "A lighter wrist-and-shoulder day for line awareness, anti-rotation and quality.",
    intensity: "Light",
    levels: {
      L1: levelTemplate(
        [rx("grounded-side-exit-rehearsal"), rx("pike-shift")],
        [rx("dead-bug"), rx("side-plank"), rx("hollow-one-leg"), rx("deadbug-heel-tap")],
        rx("chest-wall-line"),
        cooldowns[3],
      ),
      L2: levelTemplate(
        [rx("grounded-side-exit-rehearsal"), rx("pike-shift")],
        [rx("dead-bug"), rx("bear-hover-knee-tap"), rx("side-plank-hip-lift"), rx("hollow-one-leg")],
        rx("wall-facing-handstand-weight-shift"),
        cooldowns[3],
      ),
      L3: levelTemplate(
        [rx("grounded-side-exit-rehearsal"), rx("pike-shift")],
        [rx("long-lever-hollow-hold"), rx("bear-hover-knee-tap"), rx("side-plank-reach-through"), rx("deadbug-double-leg-lower")],
        rx("wall-facing-handstand-weight-shift"),
        cooldowns[3],
      ),
    },
    labs: {
      L2: labTemplate("Parallette Crane", rx("frog-stand-hold"), rx("foot-assisted-lsit"), "Technique intensity: use the lower target and stop well before fatigue."),
      L3: labTemplate("Crane One-Knee Float", rx("floor-crane-one-knee-float"), rx("planche-lean-hold"), "Technique intensity: keep a safe toe landing available and leave two clean attempts in reserve."),
    },
  },
  {
    day: 4,
    title: "Abs & Overhead Strength",
    focus: "Link pelvic control, overhead push and controlled knee-raise strength.",
    intensity: "Strong",
    levels: {
      L1: levelTemplate(
        [rx("pike-elevation"), rx("bear-to-pike-shoulder-load")],
        [rx("shallow-range-pike-pushup"), rx("hollow-reach"), rx("supported-knee-raise"), rx("hollow-tuck")],
        rx("wall-elevation"),
        cooldowns[4],
      ),
      L2: levelTemplate(
        [rx("pike-elevation"), rx("full-wall-walk")],
        [rx("parallette-pike-pushup"), rx("hollow-flutter-kicks"), rx("supported-knee-raise"), rx("long-lever-parallette-plank")],
        rx("wall-kickup"),
        cooldowns[4],
      ),
      L3: levelTemplate(
        [rx("pike-elevation"), rx("full-wall-walk")],
        [rx("eccentric-pike-pushup"), rx("hollow-scissor-kicks"), rx("straight-compression"), rx("long-lever-parallette-plank")],
        rx("kickup-stop-short-drill"),
        cooldowns[4],
      ),
    },
    labs: {
      L2: labTemplate("Planche Foundation", rx("planche-lean-hold"), rx("parallette-pike-pushup")),
      L3: labTemplate("Planche Pushing", rx("pseudo-planche-parallette-pushup"), rx("eccentric-pike-pushup")),
    },
  },
  {
    day: 5,
    title: "Integration & Balance",
    focus: "Bring the week together with accurate entries, support and small balance corrections.",
    intensity: "Focused",
    levels: {
      L1: levelTemplate(
        [rx("standing-kickup-line-rehearsal"), rx("grounded-side-exit-rehearsal")],
        [rx("tuck-support"), rx("hollow-one-leg"), rx("single-leg-compression"), rx("plank-tap")],
        rx("wall-kickup"),
        cooldowns[5],
      ),
      L2: levelTemplate(
        [rx("standing-kickup-line-rehearsal"), rx("grounded-side-exit-rehearsal")],
        [rx("alternating-lsit-extension"), rx("hollow-rocks"), rx("seated-pike-compression-pulses"), rx("plank-tap")],
        rx("heel-pullaway"),
        cooldowns[5],
      ),
      L3: levelTemplate(
        [rx("standing-kickup-line-rehearsal"), rx("grounded-side-exit-rehearsal")],
        [rx("one-leg-lsit-hold"), rx("hollow-scissor-kicks"), rx("straddle-compression-lift"), rx("side-plank-reach-through")],
        rx("freestanding-parallette-kickup"),
        cooldowns[5],
      ),
    },
    labs: {
      L2: labTemplate("Support Transition", rx("support-to-tuck-transition"), rx("tuck-to-one-leg-lsit-transition")),
      L3: labTemplate("L-Sit Transition", rx("tuck-to-lsit-transition"), rx("full-lsit-attempt")),
    },
  },
];

export type WorkoutVariant = {
  day: DayNumber;
  level: DifficultyLevel;
  warmup: [string, string, string];
  pre: [string, string];
  core: [string, string, string, string];
  handstand: string;
  lab?: { a: string; b: string };
  cooldown: [string, string];
};

const ids = <T extends readonly Prescription[]>(items: T) => items.map((item) => item.exerciseId) as unknown as {
  [K in keyof T]: T[K] extends Prescription ? string : never;
};

export const workoutVariants: WorkoutVariant[] = workouts.flatMap((workout) =>
  (["L1", "L2", "L3"] as const).map((level): WorkoutVariant => {
    const template = workout.levels[level];
    const lab = workout.labs[level];
    return {
      day: workout.day,
      level,
      warmup: ids(warmupsByVariant[`${workout.day}-${level}`]),
      pre: ids(template.pre),
      core: ids(template.core),
      handstand: template.skill.exerciseId,
      ...(lab ? { lab: { a: lab.a.exerciseId, b: lab.b.exerciseId } } : {}),
      cooldown: ids(template.cooldown),
    };
  }),
);

export const toSessionVariant = (day: DayNumber, level: DifficultyLevel): WorkoutVariant => {
  const variant = workoutVariants.find((item) => item.day === day && item.level === level);
  if (!variant) throw new Error(`Missing workout variant for day ${day} at ${level}`);
  return variant;
};

export const programmeSummary = {
  existingUniqueExercises: exerciseList.filter((exercise) => exercise.introduced === "original").length,
  newExercises: exerciseList.filter((exercise) => exercise.introduced === "v2").length,
  totalUniqueExercises: exerciseList.length,
  workoutVariants: workoutVariants.length,
  defaultSeconds: timing.defaultTotal,
  extendedSeconds: timing.extendedTotal,
} as const;
