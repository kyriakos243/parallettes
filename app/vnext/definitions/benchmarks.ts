import { exerciseList } from "../../program";
import {
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type BenchmarkMetric,
  type BenchmarkProtocol,
  type CapacityFacetId,
  type CapacityId,
  type ExerciseId,
  type EquipmentId,
  type GraphId,
  type NodeId,
} from "../contracts";
import {
  VNEXT_BASE_DEFINITION_VERSION,
  capacityBenchmarkId,
  capacityFacetIds,
  capacityIds,
  exerciseId,
  graphIds,
  milestoneBenchmarkId,
  nodeId,
  prescriptionId,
} from "./ids";

type Confirmation = BenchmarkProtocol["confirmation"];
type Conditions = BenchmarkProtocol["conditions"];

type MilestoneProtocolSpec = Readonly<{
  graphId: GraphId;
  nodeId: NodeId;
  exerciseId: ExerciseId;
  label: string;
  metric: BenchmarkMetric;
  conditions: Conditions;
  quality: readonly string[];
  safety?: readonly string[];
  confirmation?: Confirmation;
}>;

type CapacityProtocolSpec = Readonly<{
  capacityId: CapacityId;
  facetId: CapacityFacetId;
  exerciseId: ExerciseId;
  label: string;
  metric: BenchmarkMetric;
  conditions: Conditions;
  quality: readonly string[];
  safety?: readonly string[];
  confirmation?: Confirmation;
}>;

const standardConfirmation = (freshnessDays?: number): Confirmation => ({
  qualifyingObservations: 2,
  minimumDistinctSessions: 2,
  allowedSources: ["guided-test", "session-record"],
  ...(freshnessDays === undefined ? {} : { freshnessDays }),
});

const singleObservationConfirmation = (freshnessDays?: number): Confirmation => ({
  qualifyingObservations: 1,
  minimumDistinctSessions: 1,
  allowedSources: ["guided-test", "session-record"],
  ...(freshnessDays === undefined ? {} : { freshnessDays }),
});

const exerciseById = new Map(exerciseList.map((exercise) => [exercise.id, exercise] as const));
const equipmentOverrides: Readonly<Record<string, readonly string[]>> = {
  "wall-l": ["parallettes", "wall", "floor"],
  "wall-kickup": ["parallettes", "wall", "floor"],
  "standing-kickup-line-rehearsal": ["floor"],
};

const defaultRange = (metric: BenchmarkMetric): string => {
  if (metric.kind === "range" || metric.kind === "quality") return metric.description;
  if (metric.kind === "successful-attempts") return "Complete the entire authored movement and controlled return or exit for each accepted attempt.";
  if (metric.kind === "duration-seconds") return "Hold the complete authored position without shortening its lever, support or apparatus conditions.";
  return "Complete the authored start-to-end range on every counted repetition.";
};

const conditionsFor = (
  exercise: string,
  metric: BenchmarkMetric,
  overrides: Readonly<{
    equipment?: readonly string[];
    assistance?: string;
    range?: string;
  }> = {},
): Conditions => {
  const definition = exerciseById.get(exercise);
  if (!definition) throw new Error(`Unknown benchmark exercise ${exercise}`);
  const equipment = new Set(overrides.equipment ?? equipmentOverrides[exercise] ?? definition.requiredEquipment ?? ["floor"]);
  if (definition.id.includes("wall") || definition.name.toLowerCase().includes("wall")) equipment.add("wall");
  return {
    equipment: [...equipment].map((id): EquipmentId => parseStableId("equipment", id)),
    assistance: overrides.assistance ?? "No external assistance beyond the named exercise setup.",
    range: overrides.range ?? defaultRange(metric),
  };
};

type ProtocolOptions = Readonly<{
  safety?: readonly string[];
  freshnessDays?: number;
  confirmationMode?: "single-session" | "separated-sessions";
  equipment?: readonly string[];
  assistance?: string;
  range?: string;
}>;

const m = (
  graphId: GraphId,
  node: string,
  exercise: string,
  label: string,
  metric: BenchmarkMetric,
  quality: readonly string[],
  options: ProtocolOptions = {},
): MilestoneProtocolSpec => ({
  graphId,
  nodeId: nodeId(node),
  exerciseId: exerciseId(exercise),
  label,
  metric,
  conditions: conditionsFor(exercise, metric, options),
  quality,
  ...(options.safety ? { safety: options.safety } : {}),
  confirmation: options.confirmationMode === "single-session"
    ? singleObservationConfirmation(options.freshnessDays)
    : standardConfirmation(options.freshnessDays),
});

const c = (
  capacityId: CapacityId,
  facetId: CapacityFacetId,
  exercise: string,
  label: string,
  metric: BenchmarkMetric,
  quality: readonly string[],
  options: Readonly<{
    safety?: readonly string[];
    freshnessDays?: number;
    repeated?: boolean;
    equipment?: readonly string[];
    assistance?: string;
    range?: string;
  }> = {},
): CapacityProtocolSpec => ({
  capacityId,
  facetId,
  exerciseId: exerciseId(exercise),
  label,
  metric,
  conditions: conditionsFor(exercise, metric, options),
  quality,
  ...(options.safety ? { safety: options.safety } : {}),
  confirmation: options.repeated
    ? standardConfirmation(options.freshnessDays)
    : singleObservationConfirmation(options.freshnessDays),
});

export const milestoneProtocolSpecs = [
  m(
    graphIds.planche,
    "controlled-planche-lean",
    "planche-lean-hold",
    "Controlled planche lean",
    { kind: "duration-seconds", minimum: 20 },
    ["Elbows remain locked", "Upper back stays actively protracted", "Lean and foot position remain reproducible"],
    {
      safety: ["No wrist, elbow or anterior-shoulder pain", "Exit returns to grounded support under control"],
      freshnessDays: 60,
      range: "With toes grounded, the centres of both shoulders pass visibly beyond the centres of the bars while elbows stay locked.",
    },
  ),
  m(
    graphIds.planche,
    "toe-light-planche-loading",
    "planche-lean-toe-lightener",
    "Toe-light planche loading",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Foot pressure visibly reduces", "Elbows remain locked", "Protraction and pelvic line do not change"],
    { freshnessDays: 60, range: "Foot pressure reduces until each foot can become visibly light without either foot leaving through a jump." },
  ),
  m(
    graphIds.planche,
    "foot-assisted-tuck-planche",
    "foot-assisted-tuck-planche",
    "Foot-assisted tuck planche",
    { kind: "duration-seconds", minimum: 8 },
    ["Assistance is light and consistent", "Knees stay compact", "Shoulders remain protracted over locked elbows"],
    {
      freshnessDays: 60,
      assistance: "Both feet use light, reproducible floor assistance; no band or spotter assistance.",
      range: "Hips lift into a compact tuck with shoulders forward of the bars while both feet retain only the declared light contact.",
    },
  ),
  m(
    graphIds.planche,
    "brief-floor-tuck-planche",
    "floor-tuck-planche-attempt",
    "Brief floor tuck planche",
    { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 5 },
    ["Both feet clear without a jump", "Elbows remain locked", "Each float lasts at least two controlled seconds"],
    {
      safety: ["No joint pain", "Each attempt ends before shoulder or elbow position fails"],
      freshnessDays: 45,
      equipment: ["floor"],
      range: "Both feet clear the floor simultaneously for at least two seconds from a locked-elbow tuck-planche position.",
    },
  ),

  m(
    graphIds.lSitVSit,
    "foot-assisted-l-sit",
    "foot-assisted-lsit",
    "Foot-assisted L-sit",
    { kind: "duration-seconds", minimum: 15 },
    ["Support remains tall", "Both knees remain straight", "Foot assistance stays light and unchanged"],
    { assistance: "Both heels retain light, measurable floor contact; no band or spotter assistance." },
  ),
  m(
    graphIds.lSitVSit,
    "tuck-support",
    "tuck-support",
    "Tuck support",
    { kind: "duration-seconds", minimum: 20 },
    ["Both feet remain clear", "Elbows remain locked", "Shoulders remain actively depressed"],
  ),
  m(
    graphIds.lSitVSit,
    "controlled-leg-extensions",
    "alternating-lsit-extension",
    "Controlled L-sit leg extensions",
    { kind: "repetitions", minimum: 6 },
    ["At least three extensions are completed per side", "The extending knee reaches full available length", "Support height does not collapse"],
  ),
  m(
    graphIds.lSitVSit,
    "one-leg-l-sit",
    "one-leg-lsit-hold",
    "One-leg L-sit",
    { kind: "duration-seconds", minimum: 8 },
    ["The recorded duration is the shorter successful side", "The straight knee remains locked", "Hips and shoulders remain level"],
    { range: "Each leg reaches a horizontal or higher locked-knee L-sit line; record the weaker-side duration." },
  ),
  m(
    graphIds.lSitVSit,
    "full-l-sit",
    "full-lsit-attempt",
    "Full L-sit",
    { kind: "duration-seconds", minimum: 8 },
    ["Both knees remain straight", "Heels remain clear", "Support height and entry are controlled"],
    { range: "Both locked legs reach horizontal or higher and both heels remain clear of the floor for the full hold." },
  ),
  m(
    graphIds.lSitVSit,
    "assisted-straddle-l-sit",
    "assisted-straddle-lsit-hold",
    "Assisted straddle L-sit",
    { kind: "duration-seconds", minimum: 8 },
    ["Both knees remain straight", "Heel assistance is light and symmetrical", "The straddle remains comfortable rather than forced"],
    { assistance: "Both heels use light, symmetrical floor assistance; no band or spotter assistance." },
  ),

  m(
    graphIds.handstandBalance,
    "grounded-side-exit",
    "grounded-side-exit-rehearsal",
    "Grounded side-exit rehearsal",
    { kind: "successful-attempts", minimumSuccessful: 4, maximumAttempts: 6 },
    ["Two controlled rehearsals are completed to each side", "Hands, hips and landing direction follow the taught path"],
    { safety: ["Landing area is clear", "No inversion is required for this protocol"], freshnessDays: 60, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "low-inversion-side-exit",
    "floor-side-exit-practice",
    "Low-inversion side exit",
    { kind: "successful-attempts", minimumSuccessful: 4, maximumAttempts: 6 },
    ["Two controlled low-inversion exits are completed to each side", "The athlete chooses the exit before balance is lost"],
    { safety: ["Use a clear landing area", "Height stays below wall-handstand exposure"], freshnessDays: 60, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "supported-inversion-tolerance",
    "wall-l",
    "Supported inversion tolerance",
    { kind: "duration-seconds", minimum: 25 },
    ["Breathing remains calm", "Elbows remain straight", "The planned exit remains available"],
    {
      safety: ["No dizziness, pain or loss of orientation", "Stop before exit control degrades"],
      freshnessDays: 60,
      confirmationMode: "single-session",
      equipment: ["parallettes", "wall", "floor"],
    },
  ),
  m(
    graphIds.handstandBalance,
    "wall-height-side-exit",
    "wall-handstand-side-exit",
    "Wall-height side exit",
    { kind: "successful-attempts", minimumSuccessful: 4, maximumAttempts: 6 },
    ["Two calm exits are completed to each side", "The athlete initiates the exit before an uncontrolled fall"],
    { safety: ["Clear landing space on both sides", "No attempt continues after orientation is lost"], freshnessDays: 45, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "wall-inverted-l-alignment",
    "box-pike",
    "Wall inverted-L alignment",
    { kind: "duration-seconds", minimum: 25 },
    ["Shoulders stack over hands", "Head stays neutral", "Elbows remain locked and ribs controlled"],
    { freshnessDays: 90, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "floor-chest-to-wall-line",
    "chest-wall-line",
    "Floor chest-to-wall line",
    { kind: "duration-seconds", minimum: 20 },
    ["Only toes lightly contact the wall", "Shoulders remain actively elevated", "Ribs and pelvis remain organised"],
    { freshnessDays: 60, equipment: ["wall", "floor"], range: "Hands remain on the floor while the body reaches a chest-to-wall vertical line with only light toe contact." },
  ),
  m(
    graphIds.handstandBalance,
    "consistent-floor-stacked-line",
    "floor-chest-wall-handstand-hold",
    "Consistent floor-stacked line",
    { kind: "duration-seconds", minimum: 30 },
    ["Hands, shoulders, pelvis and feet form a consistent line", "Active elevation and trunk position remain stable"],
    { freshnessDays: 60, equipment: ["wall", "floor"], range: "Hands remain on the floor and the chest-to-wall vertical line is maintained without transferring the result to parallettes." },
  ),
  m(
    graphIds.handstandBalance,
    "standing-entry-line",
    "standing-kickup-line-rehearsal",
    "Standing entry-line rehearsal",
    { kind: "repetitions", minimum: 5 },
    ["Hand placement and split-leg line repeat consistently", "The rehearsal is measured rather than ballistic"],
    { freshnessDays: 90, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "controlled-wall-entry",
    "wall-kickup",
    "Controlled wall entry",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Wall contact is soft", "Hands are set before the legs leave", "Every entry ends through the planned exit"],
    { freshnessDays: 60, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "stop-short-entry",
    "kickup-stop-short-drill",
    "Stop-short entry accuracy",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["At least one accepted attempt uses each lead leg", "The kick stops before heavy wall contact", "The athlete does not chase an inaccurate attempt"],
    { freshnessDays: 45, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "controlled-floor-entry",
    "floor-freestanding-kick-up",
    "Controlled freestanding floor entry",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Three entries reach a controlled floor-handstand line", "Each entry stops through the hands rather than wall contact", "A planned side exit follows immediately"],
    { freshnessDays: 45 },
  ),
  m(
    graphIds.handstandBalance,
    "repeatable-parallette-entry",
    "freestanding-parallette-kickup",
    "Repeatable freestanding parallette entry",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Three entries reach a controlled line without wall contact", "Each attempt uses a planned side exit", "This protocol confirms entry accuracy, not sustained balance"],
    { freshnessDays: 45 },
  ),
  m(
    graphIds.handstandBalance,
    "supported-weight-shift",
    "box-pike-shoulder-shift",
    "Supported handstand weight shift",
    { kind: "repetitions", minimum: 8 },
    ["Pressure shifts without elbow bend", "Shoulder elevation and trunk line remain stable", "At least four shifts are completed each way"],
    { freshnessDays: 60, confirmationMode: "single-session" },
  ),
  m(
    graphIds.handstandBalance,
    "wall-pull-away",
    "split-leg-wall-pullaway",
    "Wall pull-away",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Wall contact is released deliberately", "Balance is recovered through the hands", "Return or exit is controlled"],
    { freshnessDays: 45 },
  ),
  m(
    graphIds.handstandBalance,
    "parallette-pressure-control",
    "parallette-wall-grip-pressure-shift",
    "Parallette pressure control",
    { kind: "repetitions", minimum: 8 },
    ["Fingertip and heel-of-hand pressure changes are deliberate", "Elbows and shoulder line remain stable", "The bars do not move"],
    { freshnessDays: 60, range: "From a full chest-to-wall parallette handstand, pressure shifts fore and aft without wall push-off or visible body-line change." },
  ),
  m(
    graphIds.handstandBalance,
    "controlled-short-floor-balance",
    "floor-freestanding-balance-attempt",
    "Controlled short floor-handstand balance",
    { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 5 },
    ["Each accepted balance is held for at least three seconds", "Small hand corrections preserve control", "The athlete exits before balance becomes an uncontrolled fall"],
    { freshnessDays: 30, confirmationMode: "single-session", equipment: ["floor"], range: "Each accepted attempt includes at least three seconds of freestanding floor-handstand balance after entry and before exit." },
  ),
  m(
    graphIds.handstandBalance,
    "controlled-short-parallette-balance",
    "entry-balance-side-exit-chain",
    "Controlled short parallette-handstand balance",
    { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 5 },
    ["Each accepted parallette balance is visibly independent of the entry", "Each balance lasts at least three controlled seconds", "The planned side exit begins before control is lost"],
    {
      safety: ["Both exit sides remain available", "A clear landing area is confirmed before testing"],
      freshnessDays: 30,
      confirmationMode: "single-session",
      range: "Each accepted chain contains at least three seconds of freestanding parallette balance clearly separated from entry and exit.",
    },
  ),
  m(
    graphIds.handstandBalance,
    "wall-weight-transfer",
    "floor-wall-weight-shift",
    "Wall handstand weight transfer",
    { kind: "repetitions", minimum: 8 },
    ["Four transfers are completed to each side", "The support shoulder remains actively elevated", "Pelvic rotation stays small"],
    { freshnessDays: 45 },
  ),
  m(
    graphIds.handstandBalance,
    "wall-micro-taps",
    "chest-wall-micro-shoulder-tap",
    "Wall handstand micro taps",
    { kind: "repetitions", minimum: 6 },
    ["Three brief unloads are completed per side", "The support elbow remains locked", "Wall and trunk position remain controlled"],
    { freshnessDays: 45 },
  ),

  m(
    graphIds.verticalPushHspu,
    "shallow-pike-push-up",
    "shallow-range-pike-pushup",
    "Shallow pike push-up",
    { kind: "repetitions", minimum: 8 },
    ["Head travels forward and down through a consistent range", "Elbows track under control", "Shoulders remain actively supported"],
    { range: "The crown descends forward to a repeatable target above the floor while the hips stay high; this does not claim full floor depth." },
  ),
  m(
    graphIds.verticalPushHspu,
    "floor-pike-push-up",
    "floor-pike-push-up",
    "Floor pike push-up",
    { kind: "repetitions", minimum: 8 },
    ["The crown reaches the padded floor target on every repetition", "The pike position and overhead path remain stable"],
    { range: "The crown reaches a padded floor target slightly ahead of the hands before a complete controlled press to lockout." },
  ),
  m(
    graphIds.verticalPushHspu,
    "parallette-pike-push-up",
    "parallette-pike-pushup",
    "Parallette pike push-up",
    { kind: "repetitions", minimum: 6 },
    ["Depth is consistent", "The head passes safely between the bars", "No trunk swing assists the press"],
    {
      safety: ["Bars remain stable", "Depth stays pain-free and clear of the floor"],
      range: "The crown passes below bar height between the parallettes before a complete controlled press to lockout.",
    },
  ),
  m(
    graphIds.verticalPushHspu,
    "controlled-pike-eccentric",
    "eccentric-pike-pushup",
    "Controlled pike eccentric",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Each descent lasts at least four seconds", "Depth and shoulder path remain controlled", "The athlete resets without claiming a concentric repetition"],
    { freshnessDays: 60, range: "Each eccentric descends from lockout until the crown passes below bar height, then resets without a concentric claim." },
  ),

  m(
    graphIds.parallettePushing,
    "knee-push-up",
    "knee-push-up",
    "Knee push-up",
    { kind: "repetitions", minimum: 8 },
    ["Body line from knees to shoulders stays stable", "Chest and elbows travel through a consistent range"],
    { range: "The chest descends to within one fist-height of the floor before full elbow lockout, with knees remaining grounded." },
  ),
  m(
    graphIds.parallettePushing,
    "floor-push-up",
    "floor-push-up",
    "Floor push-up",
    { kind: "repetitions", minimum: 8 },
    ["Full-body line remains stable", "Chest reaches within one fist-height of the floor", "Lockout is controlled"],
    { range: "The chest descends to within one fist-height of the floor before a complete controlled lockout." },
  ),
  m(
    graphIds.parallettePushing,
    "controlled-parallette-push-up",
    "controlled-parallette-pushup",
    "Controlled parallette push-up",
    { kind: "repetitions", minimum: 8 },
    ["Both bars remain stable", "Depth and lockout are consistent", "Trunk line does not sag or pike"],
    { range: "The shoulders descend at least to elbow height between stable bars before a complete controlled lockout." },
  ),
  m(
    graphIds.parallettePushing,
    "tempo-push-up",
    "tempo-floor-push-up",
    "Tempo push-up",
    { kind: "repetitions", minimum: 6 },
    ["Each lowering phase lasts at least three seconds", "Range and body line remain unchanged across repetitions"],
    { range: "Every repetition reaches the floor-push-up chest landmark and returns to full lockout with a three-second lowering phase." },
  ),
  m(
    graphIds.parallettePushing,
    "staggered-parallette-push-up",
    "staggered-parallette-push-up",
    "Staggered parallette push-up",
    { kind: "repetitions", minimum: 8 },
    ["Four repetitions are completed with each arrangement", "Pelvis remains square", "Depth remains symmetrical"],
    { range: "Each bar arrangement reaches the same shoulder-to-elbow depth and full lockout; record the total across both arrangements." },
  ),
  m(
    graphIds.parallettePushing,
    "pseudo-planche-push-up",
    "pseudo-planche-parallette-pushup",
    "Pseudo-planche push-up",
    { kind: "repetitions", minimum: 5 },
    ["Forward hand-to-shoulder relationship is reproducible", "Protraction and trunk line remain active", "Depth is controlled"],
    { freshnessDays: 60, range: "Shoulders remain visibly forward of the bar centres through the descent and return to locked elbows without shifting the feet." },
  ),

  m(
    graphIds.transitions,
    "support-to-tuck",
    "support-to-tuck-transition",
    "Support-to-tuck transition",
    { kind: "repetitions", minimum: 5 },
    ["Both feet leave and return together", "Elbows remain locked", "No uncontrolled foot contact occurs"],
  ),
  m(
    graphIds.transitions,
    "tuck-to-one-leg-l-sit",
    "tuck-to-one-leg-lsit-transition",
    "Tuck-to-one-leg L-sit transition",
    { kind: "repetitions", minimum: 6 },
    ["Three transitions are completed per side", "Support height remains stable", "The leg extends and returns without swinging"],
  ),
  m(
    graphIds.transitions,
    "tuck-to-full-l-sit",
    "tuck-to-lsit-transition",
    "Tuck-to-full L-sit transition",
    { kind: "repetitions", minimum: 4 },
    ["Both legs extend together", "Elbows remain locked", "The return to tuck is controlled"],
    { freshnessDays: 60 },
  ),
  m(
    graphIds.transitions,
    "entry-balance-safe-exit",
    "entry-balance-side-exit-chain",
    "Entry-balance-side-exit chain",
    { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    ["Entry is accurate", "A short controlled balance is visible", "The trained side exit begins before control is lost"],
    { safety: ["Both exit sides remain available", "Clear landing area is confirmed before testing"], freshnessDays: 30 },
  ),
] as const satisfies readonly MilestoneProtocolSpec[];

export const capacityProtocolSpecs = [
  c(capacityIds.straightArmSupport, capacityFacetIds.tallSupport, "support-hold", "Tall support", { kind: "duration-seconds", minimum: 30 }, ["Elbows remain locked", "Shoulders remain actively depressed", "Bars and feet remain stable"], { repeated: true, freshnessDays: 90 }),
  c(capacityIds.straightArmSupport, capacityFacetIds.scapularControl, "support-shrugs", "Straight-arm scapular control", { kind: "repetitions", minimum: 10 }, ["Elbows remain locked", "Tall and lowered scapular positions are distinct", "Movement remains controlled"], { repeated: true, freshnessDays: 90 }),
  c(capacityIds.straightArmSupport, capacityFacetIds.protractedForwardLoading, "parallette-forward-lean-hold", "Protracted forward-load access", { kind: "duration-seconds", minimum: 20 }, ["Elbows remain locked", "Upper back remains actively protracted", "Lean is reproducible"], { repeated: true, freshnessDays: 60 }),

  c(capacityIds.overheadSupport, capacityFacetIds.shoulderFlexionAccess, "wall-shoulder-flexion-line-drill", "Usable shoulder-flexion access", { kind: "range", description: "Pain-free overhead line with ribs controlled and no forced wall contact" }, ["Arms reach the task-relevant overhead line", "Ribs and pelvis remain controlled", "Range is not forced"], { freshnessDays: 120 }),
  c(capacityIds.overheadSupport, capacityFacetIds.activeElevation, "pike-elevation", "Active overhead elevation", { kind: "repetitions", minimum: 8 }, ["Elbows remain locked", "Shoulders visibly elevate and return", "Head and trunk stay controlled"], { repeated: true, freshnessDays: 90 }),
  c(capacityIds.overheadSupport, capacityFacetIds.stackedSupport, "parallette-wall-grip-pressure-shift", "Parallette stacked overhead support", { kind: "duration-seconds", minimum: 20 }, ["Shoulders stay actively elevated", "Only light toe contact is used", "Ribs and pelvis remain stacked"], { repeated: true, freshnessDays: 60, range: "Hold the full chest-to-wall parallette-handstand line without performing the pressure-shift repetitions." }),

  c(capacityIds.horizontalBentArmPush, capacityFacetIds.horizontalRange, "floor-push-up", "Horizontal push range", { kind: "repetitions", minimum: 8 }, ["Chest reaches a consistent approved depth", "Body line and lockout remain controlled"], { repeated: true, freshnessDays: 90, range: "The chest descends to within one fist-height of the floor before a complete controlled lockout." }),
  c(capacityIds.horizontalBentArmPush, capacityFacetIds.paralletteRangeControl, "controlled-parallette-pushup", "Parallette push range control", { kind: "repetitions", minimum: 6 }, ["Neutral-grip depth is consistent", "Shoulders remain controlled below hand height", "Bars stay stable"], { repeated: true, freshnessDays: 90, range: "The shoulders descend at least to elbow height between stable bars before a complete controlled lockout." }),
  c(capacityIds.horizontalBentArmPush, capacityFacetIds.horizontalRepeatableStrength, "tempo-floor-push-up", "Repeatable horizontal strength", { kind: "repetitions", minimum: 8 }, ["Each lowering phase lasts at least three seconds", "Range does not shorten across repetitions"], { repeated: true, freshnessDays: 90, range: "Every repetition reaches the floor-push-up chest landmark and returns to full lockout with a three-second lowering phase." }),

  c(capacityIds.verticalBentArmPush, capacityFacetIds.pikeRange, "shallow-range-pike-pushup", "Pike push range", { kind: "repetitions", minimum: 8 }, ["Head follows a controlled forward-down path", "Range repeats without neck collapse"], { repeated: true, freshnessDays: 90, range: "The crown descends forward to the same visible target above the floor on every repetition while the hips stay high, then returns to lockout." }),
  c(capacityIds.verticalBentArmPush, capacityFacetIds.deepPikeControl, "parallette-pike-pushup", "Deep pike control", { kind: "repetitions", minimum: 6 }, ["Head passes safely between the bars", "Depth is consistent", "No momentum assists the press"], { repeated: true, freshnessDays: 75, range: "The crown passes below bar height between the parallettes before a complete controlled press to lockout." }),
  c(capacityIds.verticalBentArmPush, capacityFacetIds.verticalRepeatableStrength, "floor-pike-push-up", "Repeatable vertical strength", { kind: "repetitions", minimum: 8 }, ["Every repetition meets the approved range", "Pike position and shoulder path remain stable"], { repeated: true, freshnessDays: 75, range: "Every repetition reaches the padded floor target slightly ahead of the hands and returns to a complete controlled lockout without shortening the pike position." }),

  c(capacityIds.pikeCompression, capacityFacetIds.usablePikeAccess, "seated-pike-hold-lift-off", "Usable seated pike access", { kind: "range", description: "From a seated pike with both knees locked, establish a tall pelvis and incline the trunk forward of vertical without lumbar collapse or neural symptoms" }, ["Both knees remain locked", "The pelvis, rather than lumbar rounding, initiates the hinge", "The setup remains pain-free and repeatable"], { freshnessDays: 120, range: "Use only the tall seated-pike setup; heel lift-off is not required for this access finding." }),
  c(capacityIds.pikeCompression, capacityFacetIds.activeSingleLegLift, "single-leg-compression", "Active single-leg compression", { kind: "repetitions", minimum: 12 }, ["Six lifts are completed per side", "Knees remain straight", "Torso does not rock"], { repeated: true, freshnessDays: 90 }),
  c(capacityIds.pikeCompression, capacityFacetIds.activeDoubleLegLift, "straight-compression", "Active double-leg compression", { kind: "repetitions", minimum: 6 }, ["Both heels leave the floor together", "Knees remain straight", "Torso does not rock"], { repeated: true, freshnessDays: 90 }),

  c(capacityIds.straddleCompression, capacityFacetIds.usableStraddleAccess, "seated-straddle-fold-gentle", "Usable straddle access", { kind: "range", description: "At a repeatable pain-free straddle width, sit without hand support, keep knees facing upward and hinge the pelvis until both elbows are visibly ahead of the hips" }, ["Range remains symmetrical and comfortable", "Knees and heels keep the same orientation", "The pelvis initiates the hinge without bouncing or forced width"], { freshnessDays: 120, range: "Use the same self-marked heel positions for reconfirmation; the endpoint is elbows ahead of hips with a long spine." }),
  c(capacityIds.straddleCompression, capacityFacetIds.activeStraddleLift, "straddle-compression-lift", "Active straddle compression", { kind: "repetitions", minimum: 6 }, ["Both straight legs lift actively", "Straddle width remains comfortable", "Torso does not rock"], { repeated: true, freshnessDays: 90 }),

  c(capacityIds.bodyLineControl, capacityFacetIds.hollowControl, "long-lever-hollow-hold", "Hollow body-line control", { kind: "duration-seconds", minimum: 30 }, ["Lower back remains controlled", "Long lever and breathing remain stable", "Shape does not open as fatigue rises"], { repeated: true, freshnessDays: 120 }),
  c(capacityIds.bodyLineControl, capacityFacetIds.archControl, "prone-arch-body-hold", "Arch body-line control", { kind: "duration-seconds", minimum: 20 }, ["Arch remains shallow and long", "Head stays neutral", "No lumbar pinching or forced height"], { freshnessDays: 120 }),
  c(capacityIds.bodyLineControl, capacityFacetIds.integratedLine, "hollow-to-arch-log-roll", "Integrated hollow-to-arch line", { kind: "repetitions", minimum: 4 }, ["Body rolls as one connected unit", "Hollow and shallow arch endpoints are distinct", "Limbs do not create momentum"], { freshnessDays: 120 }),
  c(capacityIds.bodyLineControl, capacityFacetIds.antiRotationControl, "side-plank", "Anti-rotation control", { kind: "duration-seconds", minimum: 20 }, ["The recorded duration is the shorter successful side", "Shoulders and pelvis remain stacked", "No trunk rotation or hip collapse"], { repeated: true, freshnessDays: 120, range: "Test both sides under the same setup and record the weaker-side duration." }),
] as const satisfies readonly CapacityProtocolSpec[];

const defaultSafety = [
  "The observation is symptom-free",
  "Stop before technique or exit control is lost",
] as const;

export const benchmarkProtocols = [
  ...milestoneProtocolSpecs.map((spec): BenchmarkProtocol => ({
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: milestoneBenchmarkId(spec.graphId, spec.nodeId),
    definitionVersion: VNEXT_BASE_DEFINITION_VERSION,
    label: spec.label,
    subject: {
      kind: "milestone",
      milestone: { graphId: spec.graphId, nodeId: spec.nodeId },
    },
    exerciseId: spec.exerciseId,
    prescriptionVariantId: prescriptionId(spec.exerciseId),
    conditions: spec.conditions,
    metric: spec.metric,
    qualityCriteria: spec.quality,
    safetyCriteria: spec.safety ?? defaultSafety,
    confirmation: spec.confirmation ?? standardConfirmation(),
  })),
  ...capacityProtocolSpecs.map((spec): BenchmarkProtocol => ({
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: capacityBenchmarkId(spec.capacityId, spec.facetId),
    definitionVersion: VNEXT_BASE_DEFINITION_VERSION,
    label: spec.label,
    subject: {
      kind: "capacity-facet",
      capacity: { capacityId: spec.capacityId, facetId: spec.facetId },
    },
    exerciseId: spec.exerciseId,
    prescriptionVariantId: prescriptionId(spec.exerciseId),
    conditions: spec.conditions,
    metric: spec.metric,
    qualityCriteria: spec.quality,
    safetyCriteria: spec.safety ?? defaultSafety,
    confirmation: spec.confirmation ?? singleObservationConfirmation(),
  })),
] as const satisfies readonly BenchmarkProtocol[];

export const benchmarkProtocolById = new Map(
  benchmarkProtocols.map((protocol) => [protocol.id, protocol] as const),
);
