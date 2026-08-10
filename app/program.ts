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
  | "Cooldown";
export type Focus =
  | "wrist"
  | "shoulder-mobility"
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
  | "horizontal-push"
  | "vertical-push"
  | "planche"
  | "lsit"
  | "transition"
  | "thoracic-reset"
  | "breathing";
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
  sequence: ["a", "b", "a", "b", "a"];
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
  core: { start: 420, work: 40, transition: 20, exercises: 4, rounds: 3, total: 720 },
  handstand: { start: 1140, work: 30, transition: 30, exercises: 1, rounds: 5, total: 300 },
  lab: { start: 1440, work: 30, transition: 30, exercises: 2, rounds: 5, total: 300 },
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

  { id: "wrist-flexor-rock", name: "Wrist Flexor Rock-Back", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "4–6 slow rocks in 30 seconds", cues: ["Keep palms flat with fingers forward", "Use only a mild stretch"], regression: "Keep shoulders directly above the hands.", media: media("loop", "ready", "Slow pain-free rock with full hands visible.", { motion: "wrist-flexor-rock" }) },
  { id: "wrist-extensor-rock", name: "Wrist Extensor Rock-Back", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "wrist", secondaryFocus: [], compatibleDays: "all", target: "4–6 slow rocks in 30 seconds", cues: ["Turn fingers gently toward the knees", "Keep pressure light and elbows soft"], regression: "Stretch one hand at a time.", media: media("loop", "ready", "Back-of-forearm stretch remains gentle; no forced wrist angle.", { motion: "wrist-extensor-rock" }) },
  { id: "child-reach", name: "Child’s-Pose Reach", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "3–4 long breaths", cues: ["Send hips back as hands reach", "Let the upper back widen"], regression: "Place a cushion between hips and heels.", media: media("static", "ready", "Long relaxed reach with no forced shoulder depth.", { motion: "child-reach" }) },
  { id: "thread-needle", name: "Thread-the-Needle Flow", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "thoracic-reset", secondaryFocus: ["shoulder-mobility"], compatibleDays: "all", target: "2–3 slow reps per side", cues: ["Slide one arm under without forcing", "Rotate through the upper back"], regression: "Use a shorter reach and keep the head lifted.", media: media("loop", "ready", "Upper-back rotation is clear and supporting wrist stays comfortable.", { motion: "thread-needle" }) },
  { id: "lat-parallette", name: "Kneeling Parallette Lat Reach", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "3–4 slow breaths", cues: ["Keep hips above or behind knees", "Sink chest gently between straight arms"], regression: "Use the floor instead of the bars.", media: media("static", "ready", "Both bars stable and equal height; shoulders remain pain-free.", { motion: "lat-reach" }) },
  { id: "puppy-rock", name: "Puppy-Pose Rock", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "3–5 slow rocks", cues: ["Keep hips roughly over knees", "Lower chest without pinching shoulders"], regression: "Rest the forearms on the mat.", media: media("loop", "ready", "Small controlled shoulder-opening rock, full body visible.", { motion: "puppy-rock" }) },
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
  { id: "forearms-parallette-prayer-rock", name: "Forearms-on-Parallettes Prayer Rock", level: "ALL", category: "Cooldown", eligibleBlocks: ["cooldown"], primaryFocus: "shoulder-mobility", secondaryFocus: ["thoracic-reset"], compatibleDays: "all", target: "3–5 slow rocks", cues: ["Keep ribs gently tucked", "Use a mild shoulder stretch"], regression: "Reduce hip travel.", media: media("loop", "required", "Side view; forearms supported on equal bars, hips rock back without lumbar arch.") },
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
const v2ExpansionIds = Object.keys(v2ExpansionNames);
const ropeExerciseIds = new Set([
  "easy-rope-bounce", "basic-two-foot-bounce", "alternate-foot-step", "boxer-step",
  "side-to-side-ski-hop", "forward-back-hop", "high-knee-rope",
  "fast-single-under-cadence", "recovery-bounce", "rope-step-through-mobility",
]);
const isRopeExercise = (id: string) => ropeExerciseIds.has(id);
const v2ExpansionFocus = (id: string): Focus => {
  if (isRopeExercise(id)) return id === "rope-step-through-mobility" ? "shoulder-mobility" : "support";
  if (id.includes("handstand") || id.includes("wall-") || id.includes("kick-up") || id.includes("kickup")) return id.includes("exit") ? "exit" : id.includes("kick") ? "entry" : "line";
  if (id.includes("compression") || id.includes("pike-lift") || id.includes("v-sit") || id.includes("leg-lift")) return "compression";
  if (id.includes("plank") || id.includes("bird") || id.includes("bear") || id.includes("bridge")) return id.includes("side") || id.includes("reach") ? "anti-rotation" : "anti-extension";
  if (id.includes("stretch") || id.includes("twist") || id.includes("sphinx") || id.includes("cat-cow")) return "thoracic-reset";
  return "hollow";
};
const v2ExpansionCategory = (id: string): Category => {
  if (id.startsWith("wall-") || id.startsWith("prone-handstand") || id.includes("kick-up") || id.includes("freestanding") || id.includes("side-exit")) return "Handstand";
  if (id.startsWith("floor-") && (id.includes("push") || id.includes("planche") || id.includes("frog") || id.includes("crane"))) return "Calisthenics";
  if (id.includes("stretch") || id.includes("twist") || id.includes("sphinx")) return "Cooldown";
  if (isRopeExercise(id)) return "Warm-up";
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
    media: media(category === "Cooldown" ? "static" : "loop", "audit", `Unified V2 avatar demonstrates ${v2ExpansionNames[id]} with full body and equipment visible.`, { motion: id as MotionPreset }),
    ...(equipment ? { family: category, subfamily: focus, progressionFamily: focus, progressionStage: level === "L1" ? 1 : level === "L2" ? 2 : 3, requiredEquipment: equipment, customFocusTags: [focus, category.toLowerCase()], loadTags: level === "L3" ? ["core_medium", "balance"] : ["low_fatigue"], fatigueCost: { wrist: equipment.includes("parallettes") ? 2 : 0, shoulder: equipment.includes("wall") ? 2 : 1, pushing: category === "Calisthenics" ? 2 : 0, core: 2, inversion: category === "Handstand" ? 3 : 0 }, targetType: level === "L3" ? "attempts" : category === "Cooldown" ? "hold" : "reps", targetMin: level === "L3" ? 3 : 6, targetMax: level === "L3" ? 6 : 12, how: `Start in the demonstrated ${v2ExpansionNames[id]} position, move with control, then return to a comfortable reset.`, focus: `Keep the ${focus} quality stable throughout.`, avoid: "Do not chase the timer with rushed or painful repetitions.", safety: "Stop for sharp or escalating pain." } : {}),
  };
});

const allDays: DayNumber[] = [1, 2, 3, 4, 5];
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
  "prayer-wrist-waves", "inchworm-pike-walkout", "crossbody-mountain-climber", "frog-stand-weight-shift", "forearm-pronator-stretch", "crossbody-shoulder-stretch", "supine-thoracic-opener",
]);
export const exercises: Record<string, Exercise> = Object.fromEntries([
  ...existing.filter((item) => !excludedV2Ids.has(item.id)).map((item) => [item.id, normalizeExercise(item, "original")] as const),
  ...additions.filter((item) => !excludedV2Ids.has(item.id)).map((item) => [item.id, normalizeExercise(item, "v2")] as const),
  ...v2ExpansionSeeds.map((item) => [item.id, normalizeExercise(item, "v2")] as const),
]);

// V2 equipment audit: retain stable IDs for saved plans, but remove the old
// box/bench assumption from the visible instruction and generator metadata.
const equipmentFor = (exercise: Exercise): Equipment[] => {
  if (["box-pike", "box-toe-light", "box-pike-scapular-shrugs", "box-pike-shoulder-shift", "box-pike-one-leg-line-lift"].includes(exercise.id)) return ["wall", "floor"];
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
  exercise.how ??= `Start in the demonstrated ${exercise.name} position, move slowly through the clean range, then return under control.`;
  exercise.focus ??= exercise.cues[0];
  exercise.avoid ??= exercise.cues[1];
  exercise.safety ??= "Stop for sharp or escalating pain and reset before form breaks.";
  exercise.targetType ??= exercise.target.toLowerCase().includes("hold") || exercise.target.toLowerCase().includes("second") ? "hold" : exercise.target.toLowerCase().includes("attempt") ? "attempts" : "reps";
  if (exercise.id === "box-pike") exercise.name = "Wall Inverted-L Alignment Hold";
  if (exercise.id === "box-toe-light") exercise.name = "Wall Inverted-L Foot Lightener";
  if (exercise.id === "box-pike-scapular-shrugs") exercise.name = "Wall Inverted-L Scapular Shrugs";
  if (exercise.id === "box-pike-shoulder-shift") exercise.name = "Wall Inverted-L Shoulder Shift";
  if (exercise.id === "box-pike-one-leg-line-lift") exercise.name = "Wall Inverted-L One-Leg Line Lift";
}

export const skillProgressionPaths = [
  ["dead-bug", "deadbug-heel-tap", "deadbug-double-leg-lower", "hollow-tuck", "hollow-one-leg", "long-lever-hollow-hold", "hollow-rocks", "hollow-scissor-kicks"],
  ["support-hold", "support-shrugs", "tuck-support", "supported-knee-raise", "alternating-lsit-extension", "one-leg-lsit-hold", "full-lsit-attempt"],
  ["bent-compression", "single-leg-compression", "alternating-pike-leg-lift", "straight-compression", "seated-pike-compression-pulses", "straddle-compression-lift"],
  ["pike-shift", "wall-l", "partial-wall-walk", "chest-wall-line", "wall-kickup", "heel-pullaway", "split-leg-wall-pullaway", "freestanding-parallette-kickup"],
  ["controlled-parallette-pushup", "parallette-pike-pushup", "eccentric-pike-pushup"],
  ["parallette-forward-lean-hold", "planche-lean-hold", "frog-stand-hold", "foot-assisted-tuck-planche"],
] as const;
for (const path of skillProgressionPaths) {
  path.forEach((id, index) => {
    const exercise = exercises[id];
    if (!exercise) return;
    exercise.progressionFamily = path[0];
    exercise.progressionStage = index + 1;
    exercise.easierId = index > 0 ? path[index - 1] : undefined;
    exercise.harderId = index < path.length - 1 ? path[index + 1] : undefined;
    exercise.prerequisites = index > 0 ? [path[index - 1]] : [];
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
): CalisthenicsLab => ({ label, a, b, sequence: ["a", "b", "a", "b", "a"], ...(intensityNote ? { intensityNote } : {}) });

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
  "2-L1": [rx("wrist-circles"), rx("wall-slides"), rx("plank-pike")],
  "2-L2": [rx("wrist-circles"), rx("wall-slides"), rx("plank-pike")],
  "2-L3": [rx("fingertip-wrist-pulses"), rx("wall-slides"), rx("plank-pike")],
  "3-L1": [rx("wrist-circles"), rx("kneeling-thoracic-rotation"), rx("plank-pike")],
  "3-L2": [rx("wrist-circles"), rx("kneeling-thoracic-rotation"), rx("plank-pike")],
  "3-L3": [rx("wrist-circles"), rx("kneeling-thoracic-rotation"), rx("plank-pike")],
  "4-L1": [rx("wrist-palms"), rx("wall-slides"), rx("scap-pushup")],
  "4-L2": [rx("wrist-palms"), rx("wall-slides"), rx("scap-pushup")],
  "4-L3": [rx("fingertip-wrist-pulses"), rx("wall-slides"), rx("scap-pushup")],
  "5-L1": [rx("fingertip-wrist-pulses"), rx("shoulder-sweep"), rx("plank-pike")],
  "5-L2": [rx("fingertip-wrist-pulses"), rx("shoulder-sweep"), rx("plank-pike")],
  "5-L3": [rx("fingertip-wrist-pulses"), rx("shoulder-sweep"), rx("plank-pike")],
};

const cooldowns: Record<DayNumber, [Prescription, Prescription]> = {
  1: [rx("wrist-flexor-rock"), rx("child-reach")],
  2: [rx("wrist-extensor-rock"), rx("upper-back-reach")],
  3: [rx("wrist-flexor-rock"), rx("thread-needle")],
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
        [rx("hollow-tuck"), rx("dead-bug"), rx("kneeling-plank-tap"), rx("bent-compression")],
        rx("wall-l"),
        cooldowns[1],
      ),
      L2: levelTemplate(
        [rx("parallette-forward-lean-hold"), rx("pike-scapular-shrugs")],
        [rx("long-lever-hollow-hold"), rx("deadbug-double-leg-lower"), rx("plank-tap"), rx("seated-pike-compression-pulses")],
        rx("box-toe-light"),
        cooldowns[1],
      ),
      L3: levelTemplate(
        [rx("support-shrugs", "10–12 controlled reps"), rx("box-pike-shoulder-shift")],
        [rx("hollow-scissor-kicks"), rx("plank-knee-drive-isometric"), rx("straddle-compression-lift"), rx("side-plank-reach-through")],
        rx("parallette-kickup-to-wall"),
        cooldowns[1],
      ),
    },
    labs: {
      L2: labTemplate("Support & L-Sit", rx("foot-assisted-lsit"), rx("controlled-parallette-pushup")),
      L3: labTemplate("L-Sit & Planche Push", rx("full-lsit-attempt"), rx("pseudo-planche-parallette-pushup")),
    },
  },
  {
    day: 2,
    title: "Compression & Tuck Strength",
    focus: "Own the support position and build the compression needed for future L-sits.",
    intensity: "Strong",
    levels: {
      L1: levelTemplate(
        [rx("support-shrugs"), rx("box-pike")],
        [rx("tuck-support"), rx("bent-compression"), rx("deadbug-heel-tap"), rx("side-plank")],
        rx("wall-l"),
        cooldowns[2],
      ),
      L2: levelTemplate(
        [rx("pike-alternating-toe-float"), rx("box-pike-scapular-shrugs")],
        [rx("straight-compression"), rx("seated-pike-compression-pulses"), rx("alternating-pike-leg-lift"), rx("side-plank-hip-lift")],
        rx("wall-facing-handstand-weight-shift"),
        cooldowns[2],
      ),
      L3: levelTemplate(
        [rx("box-pike-shoulder-shift"), rx("pike-scapular-shrugs", "10–12 controlled reps")],
        [rx("straddle-compression-lift"), rx("hollow-to-tuck-rock"), rx("bear-hover-knee-tap"), rx("side-plank-reach-through")],
        rx("chest-wall-alternating-toe-peel"),
        cooldowns[2],
      ),
    },
    labs: {
      L2: labTemplate("Compression Transitions", rx("alternating-lsit-extension"), rx("tuck-to-one-leg-lsit-transition")),
      L3: labTemplate("L-Sit & Straddle", rx("full-lsit-attempt"), rx("straddle-lsit-compression-prep")),
    },
  },
  {
    day: 3,
    title: "Light Line & Control",
    focus: "A lighter wrist-and-shoulder day for line awareness, anti-rotation and quality.",
    intensity: "Light",
    levels: {
      L1: levelTemplate(
        [rx("pike-shift"), rx("partial-wall-walk", "2–4 controlled climbs")],
        [rx("hollow-one-leg"), rx("long-lever-parallette-plank", "20–25 second hold"), rx("dead-bug"), rx("kneeling-plank-tap")],
        rx("chest-wall-line", "15–20 second hold"),
        cooldowns[3],
      ),
      L2: levelTemplate(
        [rx("bear-to-pike-shoulder-load"), rx("box-pike-scapular-shrugs", "6–8 reps")],
        [rx("hollow-to-tuck-rock", "6–8 reps"), rx("plank-saw", "6–8 slow reps"), rx("deadbug-double-leg-lower", "5–6 reps"), rx("side-plank-hip-lift", "5–6 per side")],
        rx("wall-facing-handstand-weight-shift", "6–8 small shifts"),
        cooldowns[3],
      ),
      L3: levelTemplate(
        [rx("box-pike-shoulder-shift", "6–8 slow shifts"), rx("box-pike-one-leg-line-lift", "3–4 lifts per side")],
        [rx("hollow-scissor-kicks", "10–12 total changes"), rx("deadbug-double-leg-lower", "5–6 reps"), rx("side-plank-reach-through", "4–5 per side"), rx("seated-pike-compression-pulses", "8–10 pulses")],
        rx("chest-wall-alternating-toe-peel", "4–6 peels per side"),
        cooldowns[3],
      ),
    },
    labs: {
      L2: labTemplate("Technique Support", rx("frog-stand-hold", "8–12 second hold"), rx("foot-assisted-lsit", "15–20 second hold"), "Technique intensity: use the lower target and stop well before fatigue."),
      L3: labTemplate("Light Skill Shapes", rx("one-leg-lsit-hold", "6–8 seconds per side"), rx("planche-lean-hold", "12–15 second hold"), "Technique intensity: use a shorter lean and leave at least two clean reps in reserve."),
    },
  },
  {
    day: 4,
    title: "Abs & Overhead Strength",
    focus: "Link pelvic control, overhead push and controlled knee-raise strength.",
    intensity: "Strong",
    levels: {
      L1: levelTemplate(
        [rx("bear-to-pike-shoulder-load"), rx("pike-elevation")],
        [rx("bent-compression"), rx("deadbug-heel-tap"), rx("hollow-tuck"), rx("dead-bug")],
        rx("wall-l"),
        cooldowns[4],
      ),
      L2: levelTemplate(
        [rx("pike-scapular-shrugs"), rx("box-pike-shoulder-shift")],
        [rx("supported-knee-raise"), rx("plank-tap"), rx("long-lever-hollow-hold"), rx("alternating-pike-leg-lift")],
        rx("wall-elevation"),
        cooldowns[4],
      ),
      L3: levelTemplate(
        [rx("pike-alternating-toe-float"), rx("box-pike-one-leg-line-lift")],
        [rx("straddle-compression-lift"), rx("plank-knee-drive-isometric"), rx("hollow-scissor-kicks"), rx("side-plank-reach-through")],
        rx("parallette-kickup-to-wall"),
        cooldowns[4],
      ),
    },
    labs: {
      L2: labTemplate("Pike Push & Planche Lean", rx("parallette-pike-pushup"), rx("planche-lean-hold")),
      L3: labTemplate("Overhead & Tuck Planche", rx("eccentric-pike-pushup"), rx("foot-assisted-tuck-planche")),
    },
  },
  {
    day: 5,
    title: "Integration & Balance",
    focus: "Bring the week together with accurate entries, support and small balance corrections.",
    intensity: "Focused",
    levels: {
      L1: levelTemplate(
        [rx("standing-kickup-line-rehearsal"), rx("chest-wall-line")],
        [rx("tuck-support", "10–20 second hold"), rx("hollow-one-leg"), rx("single-leg-compression"), rx("bear-hover-knee-tap")],
        rx("grounded-side-exit-rehearsal"),
        cooldowns[5],
      ),
      L2: levelTemplate(
        [rx("parallette-kickup-to-wall"), rx("wall-facing-handstand-weight-shift")],
        [rx("tuck-support", "12–20 second hold"), rx("hollow-to-tuck-rock"), rx("seated-pike-compression-pulses"), rx("plank-tap")],
        rx("chest-wall-alternating-toe-peel"),
        cooldowns[5],
      ),
      L3: levelTemplate(
        [rx("kickup-stop-short-drill"), rx("split-leg-wall-pullaway")],
        [rx("straddle-compression-lift"), rx("hollow-scissor-kicks"), rx("alternating-pike-leg-lift"), rx("side-plank-reach-through")],
        rx("freestanding-parallette-kickup"),
        cooldowns[5],
      ),
    },
    labs: {
      L2: labTemplate("Balance & Transition", rx("frog-stand-hold"), rx("tuck-to-one-leg-lsit-transition")),
      L3: labTemplate("Planche & L-Sit Transition", rx("planche-lean-toe-lightener"), rx("tuck-to-lsit-transition")),
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
