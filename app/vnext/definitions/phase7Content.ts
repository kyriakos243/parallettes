import {
  DEMAND_DOMAINS,
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type BenchmarkMetric,
  type BenchmarkProtocol,
  type CapacityFacetId,
  type CapacityId,
  type DemandDomain,
  type DemandLevel,
  type DemandProfile,
  type DevelopmentGraph,
  type DevelopmentNode,
  type EquipmentId,
  type ExerciseDefinition,
  type ExerciseId,
  type ExerciseRole,
  type GraphId,
  type NodeId,
  type PrescriptionTarget,
  type PrerequisiteRef,
} from "../contracts";
import { benchmarkProtocols } from "./benchmarks";
import { exerciseDefinitions } from "./catalogue";
import { developmentGraphs } from "./graphs";
import {
  VNEXT_BASE_DEFINITION_VERSION,
  VNEXT_CATALOGUE_VERSION,
  capacityFacetIds,
  capacityIds,
  exerciseId,
  graphIds,
  milestoneBenchmarkId,
  nodeId,
  prescriptionId,
  regressionPrescriptionId,
} from "./ids";
import { missingProgressionBridges } from "./missingBridges";
import { phase7MediaForExercise } from "./phase7Media";

type Phase7ContentRole =
  | "progression-node"
  | "benchmark-preparation"
  | "technique-drill";

type CapacityLinkSpec = Readonly<{
  capacityId: CapacityId;
  facetIds: readonly CapacityFacetId[];
}>;

type ContentSpec = Readonly<{
  bridgeId: string;
  graphId: GraphId;
  node: string;
  exercise: string;
  name: string;
  contentRole: Phase7ContentRole;
  description: string;
  how: string;
  cues: readonly string[];
  avoid: readonly string[];
  safety: readonly string[];
  equipment: readonly string[];
  demand: Readonly<Partial<Record<DemandDomain, DemandLevel>>>;
  capacityLinks?: readonly CapacityLinkSpec[];
  target: PrescriptionTarget;
  metric: BenchmarkMetric;
  assistance: string;
  variantAssistance?: string;
  range: string;
  quality: readonly string[];
  confirmation: BenchmarkProtocol["confirmation"];
  regression: Readonly<{
    exercise: string;
    assistance: string;
  }>;
}>;

const equipment = (ids: readonly string[]): readonly EquipmentId[] =>
  ids.map((id) => parseStableId("equipment", id));

const denseDemand = (
  values: Readonly<Partial<Record<DemandDomain, DemandLevel>>>,
): DemandProfile => {
  const result = Object.fromEntries(
    DEMAND_DOMAINS.map((domain) => [domain, values[domain] ?? "low"]),
  );
  return result as DemandProfile;
};

const separated = (freshnessDays?: number): BenchmarkProtocol["confirmation"] => ({
  qualifyingObservations: 2,
  minimumDistinctSessions: 2,
  allowedSources: ["guided-test", "session-record"],
  ...(freshnessDays === undefined ? {} : { freshnessDays }),
});

const singleSession = (freshnessDays: number): BenchmarkProtocol["confirmation"] => ({
  qualifyingObservations: 1,
  minimumDistinctSessions: 1,
  allowedSources: ["guided-test", "session-record"],
  freshnessDays,
});

const targetLabel = (target: PrescriptionTarget): string => {
  switch (target.kind) {
    case "duration-seconds":
      return `${target.minimum}${target.maximum ? `–${target.maximum}` : "+"} second hold`;
    case "repetitions":
      return `${target.minimum}${target.maximum ? `–${target.maximum}` : "+"} controlled repetitions`;
    case "attempts":
      return `${target.minimum}${target.maximum ? `–${target.maximum}` : "+"} quality attempts`;
    case "interval":
      return `${target.rounds} rounds of ${target.workSeconds} seconds work`;
    case "quality":
      return target.description;
  }
};

const techniqueTarget = (target: PrescriptionTarget): PrescriptionTarget => {
  switch (target.kind) {
    case "duration-seconds": {
      const minimum = Math.max(2, Math.floor(target.minimum / 2));
      return { kind: target.kind, minimum, maximum: Math.max(minimum, target.minimum) };
    }
    case "repetitions": {
      const minimum = Math.max(1, Math.ceil(target.minimum / 2));
      return { kind: target.kind, minimum, maximum: Math.max(minimum, target.minimum) };
    }
    case "attempts": {
      const minimum = Math.max(1, Math.ceil(target.minimum / 2));
      return {
        kind: target.kind,
        minimum,
        maximum: Math.max(minimum, Math.min(target.maximum ?? target.minimum, target.minimum - 1)),
      };
    }
    case "interval":
      return { ...target, rounds: Math.max(1, Math.ceil(target.rounds / 2)) };
    case "quality":
      return { kind: target.kind, description: `Technique-dose practice: ${target.description}` };
  }
};

const plancheDemand = {
  "hand-wrist-bearing": "high",
  "forward-straight-arm-upper-limb": "high",
  "compression-trunk": "high",
} as const;

const supportCompressionDemand = {
  "hand-wrist-bearing": "moderate",
  "compression-trunk": "high",
} as const;

const contentSpecs: readonly ContentSpec[] = [
  {
    bridgeId: "bridge-planche-stable-tuck",
    graphId: graphIds.planche,
    node: "stable-tuck-planche",
    exercise: "parallette-tuck-planche-hold",
    name: "Parallette Tuck Planche Hold",
    contentRole: "progression-node",
    description: "Turns the brief floor float into a stable, apparatus-specific tuck Planche outcome.",
    how: "Press tall, protract and lean before drawing both feet into a compact tuck; hold without knee-on-arm support and return both toes together.",
    cues: ["Lock both elbows", "Keep the upper back actively protracted", "Float without a hop"],
    avoid: ["Do not rest the knees on the arms", "Do not count a momentary jump or collapsed hold"],
    safety: ["Use stable equal-height bars", "Stop for wrist, elbow or shoulder pain and land before protraction is lost"],
    equipment: ["parallettes", "floor"],
    demand: plancheDemand,
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
    target: { kind: "duration-seconds", minimum: 8, maximum: 15 },
    metric: { kind: "duration-seconds", minimum: 8 },
    assistance: "No external assistance and no knee-on-arm contact.",
    range: "Both feet remain clear in a compact tuck Planche for the full hold, with locked elbows and shoulders forward of the bars.",
    quality: ["The float starts without a hop", "Protraction and hip height remain stable", "The return is controlled"],
    confirmation: separated(60),
    regression: { exercise: "floor-tuck-planche-attempt", assistance: "Use the brief floor tuck attempt or return one toe lightly to the floor." },
  },
  {
    bridgeId: "bridge-planche-advanced-tuck",
    graphId: graphIds.planche,
    node: "advanced-tuck-planche",
    exercise: "advanced-tuck-planche-hold",
    name: "Advanced Tuck Planche Hold",
    contentRole: "progression-node",
    description: "Opens the compact tuck into a longer lever while preserving a true straight-arm Planche.",
    how: "From a stable tuck Planche, open the hips until the thighs move behind the hands while both feet stay clear; close back to tuck before landing.",
    cues: ["Open the lever without dropping the hips", "Keep elbows locked", "Keep active protraction"],
    avoid: ["Do not count a compact tuck", "Do not arch, sag or bend the arms to lengthen the shape"],
    safety: ["Attempt only from a stable tuck", "Return to tuck or place both toes down before shoulder control is lost"],
    equipment: ["parallettes", "floor"],
    demand: plancheDemand,
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
    target: { kind: "duration-seconds", minimum: 5, maximum: 10 },
    metric: { kind: "duration-seconds", minimum: 5 },
    assistance: "No external assistance.",
    range: "The hips and knees open visibly beyond compact tuck while both feet remain clear and the shoulders stay forward of the bars.",
    quality: ["The longer lever is unambiguous", "Elbows and protraction remain unchanged", "The athlete closes the tuck before landing"],
    confirmation: separated(60),
    regression: { exercise: "parallette-tuck-planche-hold", assistance: "Return to the stable compact tuck lever." },
  },
  {
    bridgeId: "bridge-planche-one-leg-assisted",
    graphId: graphIds.planche,
    node: "assisted-one-leg-planche",
    exercise: "assisted-one-leg-planche-hold",
    name: "Wall-Assisted One-Leg Planche Hold",
    contentRole: "progression-node",
    description: "Introduces a unilateral longer Planche lever with one fixed, visible wall-contact condition.",
    how: "Set the bars at the reviewed wall distance, establish advanced tuck, then lengthen one leg until its toe makes only the marked wall contact; repeat on both sides.",
    cues: ["Keep the pelvis square", "Use the same wall mark on both sides", "Keep the tucked leg and shoulders still"],
    avoid: ["Do not launch from the wall", "Do not rotate the pelvis or hide the assistance"],
    safety: ["Clear the landing area and use non-slip bars", "Stop before the wall contact becomes a push"],
    equipment: ["parallettes", "wall", "floor"],
    demand: plancheDemand,
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
    target: { kind: "attempts", minimum: 4, maximum: 4 },
    metric: { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 4 },
    assistance: "The bars remain at the reviewed marked wall distance; one extended toe uses the same marked light wall contact and no wall push is allowed.",
    variantAssistance: "Marked light wall contact at the extended toe.",
    range: "At the same marked bar-to-wall distance, complete four attempts with at least one accepted six-second hold per side from an advanced-tuck base.",
    quality: ["At least one accepted hold is completed on each side", "Pelvis remains square", "Wall pressure stays light and unchanged"],
    confirmation: separated(60),
    regression: { exercise: "advanced-tuck-planche-hold", assistance: "Keep both legs in advanced tuck or shorten the extended leg." },
  },
  {
    bridgeId: "bridge-planche-straddle-assisted",
    graphId: graphIds.planche,
    node: "assisted-straddle-planche",
    exercise: "assisted-straddle-planche-hold",
    name: "Wall-Assisted Straddle Planche Hold",
    contentRole: "progression-node",
    description: "Creates a true floor-clear straddle lever using fixed wall contact rather than relabelling a grounded straddle lean.",
    how: "Set both toes at equal marked wall contacts behind the bars, lean with locked elbows and open to a symmetric floor-clear straddle before returning to tuck.",
    cues: ["Keep both toes at the same wall mark", "Open symmetrically", "Maintain protraction and hip height"],
    avoid: ["Do not count grounded feet", "Do not force straddle width or push away from the wall"],
    safety: ["Use a comfortable straddle and a clear two-foot landing", "Stop for wrist, elbow, shoulder or hip pain"],
    equipment: ["parallettes", "wall", "floor"],
    demand: plancheDemand,
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] },
      { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.usableStraddleAccess] },
    ],
    target: { kind: "duration-seconds", minimum: 6, maximum: 10 },
    metric: { kind: "duration-seconds", minimum: 6 },
    assistance: "The bars remain at the reviewed marked wall distance; both extended toes use equal marked light wall contact and no wall push is allowed.",
    variantAssistance: "Equal light wall-toe contact at a fixed mark.",
    range: "At the same marked bar-to-wall distance, both legs open into a symmetric straddle clear of the floor while wall contact remains visible and constant.",
    quality: ["The movement is not a grounded straddle lean", "Both elbows stay locked", "The return is controlled"],
    confirmation: separated(60),
    regression: { exercise: "advanced-tuck-planche-hold", assistance: "Use advanced tuck or the assisted one-leg bridge." },
  },
  {
    bridgeId: "bridge-l-sit-straddle",
    graphId: graphIds.lSitVSit,
    node: "stable-straddle-l-sit",
    exercise: "straddle-l-sit-hold",
    name: "Straddle L-Sit Hold",
    contentRole: "progression-node",
    description: "Removes heel assistance from the existing straddle support without forcing additional range.",
    how: "Press tall, open to a comfortable straddle and lift both straight heels clear while the hips remain between the bars; land softly.",
    cues: ["Keep knees facing upward", "Press the shoulders tall", "Lift both heels together"],
    avoid: ["Do not skim the floor", "Do not lean behind the hands or force a wider straddle"],
    safety: ["Use only a comfortable pain-free straddle", "Reduce range before shoulder height collapses"],
    equipment: ["parallettes", "floor"],
    demand: supportCompressionDemand,
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.tallSupport] },
      { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.activeStraddleLift] },
    ],
    target: { kind: "duration-seconds", minimum: 8, maximum: 15 },
    metric: { kind: "duration-seconds", minimum: 8 },
    assistance: "No heel or external assistance.",
    range: "Both straight heels remain visibly clear at a self-selected comfortable straddle width for the full hold.",
    quality: ["Both knees stay straight and face upward", "Shoulder height remains stable", "Entry and landing are controlled"],
    confirmation: separated(90),
    regression: { exercise: "assisted-straddle-lsit-hold", assistance: "Restore symmetrical light heel assistance." },
  },
  {
    bridgeId: "bridge-v-sit-development",
    graphId: graphIds.lSitVSit,
    node: "high-l-sit",
    exercise: "high-l-sit-hold",
    name: "High L-Sit Hold",
    contentRole: "progression-node",
    description: "Raises a stable full L-sit above horizontal through active compression rather than backward lean.",
    how: "From a full L-sit, press tall and raise both locked legs above the bar-top horizontal landmark; lower to L-sit before landing.",
    cues: ["Keep the torso tall", "Lift from the hips", "Keep both knees locked"],
    avoid: ["Do not lean backward, swing or bend the knees", "Do not count a brief pass through the target"],
    safety: ["Return to full L-sit before support height drops", "Stop for hip or shoulder pain"],
    equipment: ["parallettes", "floor"],
    demand: supportCompressionDemand,
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.tallSupport] },
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "duration-seconds", minimum: 6, maximum: 10 },
    metric: { kind: "duration-seconds", minimum: 6 },
    assistance: "No external assistance.",
    range: "Both locked legs remain visibly above horizontal while the hips stay between the bars and the torso does not recline.",
    quality: ["Leg height comes from compression", "Support remains tall", "The return to L-sit is controlled"],
    confirmation: separated(90),
    regression: { exercise: "full-lsit-attempt", assistance: "Return to the horizontal full L-sit landmark." },
  },
  {
    bridgeId: "bridge-v-sit-development",
    graphId: graphIds.lSitVSit,
    node: "assisted-v-sit",
    exercise: "assisted-v-sit-hold",
    name: "Wall-Assisted V-Sit Hold",
    contentRole: "progression-node",
    description: "Uses a fixed heel-to-wall height to make V-specific assistance visible and reproducible.",
    how: "Face a marked wall position, press tall and raise both locked legs until the heels make light contact at the reviewed V height; hold without pushing into the wall.",
    cues: ["Touch the same wall mark", "Keep both knees locked", "Keep shoulders tall and assistance light"],
    avoid: ["Do not bounce into the wall", "Do not hide heel pressure or collapse the shoulders"],
    safety: ["Choose a mark below forced hip range", "Stop for hip, hamstring, wrist or shoulder symptoms"],
    equipment: ["parallettes", "wall", "floor"],
    demand: supportCompressionDemand,
    capacityLinks: [
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "duration-seconds", minimum: 6, maximum: 10 },
    metric: { kind: "duration-seconds", minimum: 6 },
    assistance: "The bars remain at one marked start distance from the wall and both heels use light contact at one fixed wall-height mark; no push into the wall is allowed.",
    variantAssistance: "Fixed light heel-to-wall contact at the reviewed V height.",
    range: "From the same marked bar-to-wall start distance, both locked legs reach the fixed above-horizontal wall-height mark with symmetric light contact.",
    quality: ["Assistance stays visible and constant", "The pelvis and shoulders do not collapse", "The hold is entered and exited without a swing"],
    confirmation: separated(90),
    regression: { exercise: "high-l-sit-hold", assistance: "Lower the target to high L-sit or use the stable straddle-L branch." },
  },
  {
    bridgeId: "bridge-v-sit-development",
    graphId: graphIds.lSitVSit,
    node: "partial-v-sit",
    exercise: "partial-v-sit-hold",
    name: "Partial V-Sit Hold",
    contentRole: "progression-node",
    description: "Removes wall assistance while keeping a precise submaximal V-height target.",
    how: "Press tall and raise both locked legs to the reviewed feet-clear partial-V angle; stabilise, then lower under control.",
    cues: ["Own the target angle", "Keep both legs together and straight", "Press tall throughout"],
    avoid: ["Do not kick through the target", "Do not count bent knees, wall contact or a momentary peak"],
    safety: ["Use the assisted V-sit if the target cannot be held", "Stop before wrist, shoulder or hip control is lost"],
    equipment: ["parallettes", "floor"],
    demand: supportCompressionDemand,
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.tallSupport] },
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "duration-seconds", minimum: 5, maximum: 10 },
    metric: { kind: "duration-seconds", minimum: 5 },
    assistance: "No wall or external assistance.",
    range: "Both locked legs remain feet-clear at the approved angle above the high-L landmark and below the stronger-gated full V target.",
    quality: ["The target is held rather than passed through", "Shoulders remain tall", "The descent is controlled"],
    confirmation: separated(90),
    regression: { exercise: "assisted-v-sit-hold", assistance: "Restore the fixed light heel-to-wall contact." },
  },
  {
    bridgeId: "bridge-handstand-repeatable-floor-balance",
    graphId: graphIds.handstandBalance,
    node: "repeatable-floor-balance",
    exercise: "floor-balance-repeatable-variant",
    name: "Repeatable Floor Handstand Balance Test",
    contentRole: "technique-drill",
    description: "Reuses the existing floor-balance movement with a stricter repeatability protocol instead of inventing new geometry.",
    how: "Use calm floor entries to produce distinct controlled balances, then leave through the planned side exit before control is lost.",
    cues: ["Separate entry from balance", "Use small pressure corrections", "Choose the exit deliberately"],
    avoid: ["Do not count entry momentum or an uncontrolled fall", "Do not chase duration after the exit window is lost"],
    safety: ["Use a clear landing area and established floor-exit competence", "Stop after any uncontrolled landing or symptom"],
    equipment: ["floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] }],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Freestanding on the floor with no wall contact or spotter assistance.",
    range: "Each accepted attempt includes an independent balance of at least five seconds followed by a controlled planned side exit.",
    quality: ["At least three attempts meet the full balance and exit criteria", "Entries are not counted as balance", "Both shoulders remain actively elevated"],
    confirmation: separated(45),
    regression: { exercise: "floor-freestanding-balance-attempt", assistance: "Return to the controlled short floor-balance protocol." },
  },
  {
    bridgeId: "bridge-handstand-repeatable-parallette-balance",
    graphId: graphIds.handstandBalance,
    node: "repeatable-parallette-balance",
    exercise: "parallette-balance-repeatable-variant",
    name: "Repeatable Parallette Handstand Balance Test",
    contentRole: "technique-drill",
    description: "Reuses the entry-balance-exit chain with a stricter independently observable balance requirement.",
    how: "Enter between stable bars, settle the entry, hold an independent balance with small grip-pressure corrections, then use a planned side exit.",
    cues: ["Finish the entry before timing balance", "Keep shoulders elevated", "Exit while both directions remain available"],
    avoid: ["Do not count a lucky kick-up", "Do not wait for a fall or use wall contact"],
    safety: ["Use equal-height non-slip bars and a clear landing area", "Both wall-height exits must already be current"],
    equipment: ["parallettes", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] }],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Freestanding on parallettes with no wall contact or spotter assistance.",
    range: "Each accepted attempt contains an independent balance of at least five seconds after entry and before a controlled side exit.",
    quality: ["At least three attempts meet the complete chain", "Bar-pressure corrections remain small", "The landing is planned rather than reactive"],
    confirmation: separated(45),
    regression: { exercise: "entry-balance-side-exit-chain", assistance: "Return to the controlled short parallette-balance chain." },
  },
  {
    bridgeId: "bridge-handstand-shapes",
    graphId: graphIds.handstandBalance,
    node: "freestanding-parallette-tuck-shape-change",
    exercise: "freestanding-parallette-tuck-shape-change",
    name: "Freestanding Parallette Tuck Shape Change",
    contentRole: "technique-drill",
    description: "Adds one exact two-arm freestanding shape change without implying one-arm or turning skill.",
    how: "Settle a straight parallette handstand, draw both knees into a symmetric compact tuck, return to straight and use the planned side exit.",
    cues: ["Keep shoulders stacked and elevated", "Move both legs together", "Re-establish straight before exiting"],
    avoid: ["Do not substitute a pike", "Do not use wall contact, bent arms or an uncontrolled exit"],
    safety: ["Attempt only with repeatable parallette balance and both exits current", "Abort to the planned exit at the first loss of shoulder control"],
    equipment: ["parallettes", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "moderate",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] },
      { capacityId: capacityIds.bodyLineControl, facetIds: [capacityFacetIds.hollowControl] },
    ],
    target: { kind: "attempts", minimum: 4, maximum: 4 },
    metric: { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 4 },
    assistance: "Freestanding on parallettes with no wall contact or spotter assistance.",
    range: "Each accepted attempt shows a stable straight balance, symmetric tuck, return to straight and controlled side exit without a reset.",
    quality: ["The tuck is distinct from a pike", "Shoulder stack remains controlled", "Both accepted attempts complete the full sequence"],
    confirmation: separated(45),
    regression: { exercise: "parallette-balance-repeatable-variant", assistance: "Return to repeatable straight-body parallette balances." },
  },
  {
    bridgeId: "bridge-hspu-elevated-pike",
    graphId: graphIds.verticalPushHspu,
    node: "elevated-deep-pike-push-up",
    exercise: "elevated-parallette-pike-push-up",
    name: "Wall-Elevated Parallette Pike Push-Up",
    contentRole: "progression-node",
    description: "Bridges grounded pike pressing to a deeper, more vertical but still supported press.",
    how: "Place both feet at the marked low wall height, stack the hips over the shoulders, lower the crown forward between the bars and press to active lockout.",
    cues: ["Keep hips high", "Track elbows back", "Press tall at the top"],
    avoid: ["Do not drop the head straight down", "Do not shorten depth, flare the elbows or let the feet slip"],
    safety: ["Use a low non-slip wall contact and padded head path", "Stop before the crown bears weight"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "moderate",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "moderate",
      "compression-trunk": "moderate",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.activeElevation] },
      { capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.deepPikeControl] },
    ],
    target: { kind: "repetitions", minimum: 6, maximum: 8 },
    metric: { kind: "repetitions", minimum: 6 },
    assistance: "Both feet remain supported at the same marked low wall height; no leg drive.",
    variantAssistance: "Low wall foot support at a fixed height.",
    range: "The crown travels forward and below bar height between the parallettes before every complete active lockout.",
    quality: ["Depth remains constant", "Hips remain high", "The feet provide position support rather than propulsion"],
    confirmation: separated(60),
    regression: { exercise: "eccentric-pike-pushup", assistance: "Return to the grounded controlled pike eccentric or lower the wall height." },
  },
  {
    bridgeId: "bridge-hspu-wall-core",
    graphId: graphIds.verticalPushHspu,
    node: "wall-hspu-bottom-position-exit",
    exercise: "wall-hspu-bottom-position-exit",
    name: "Wall HSPU Bottom-Position Exit",
    contentRole: "benchmark-preparation",
    description: "Makes the standard-depth bailout an independently observed safety milestone before eccentric work.",
    how: "Stage the bent-arm bottom with feet walking up the wall from a low supported setup—never by descending from lockout—then slide both feet down to an inverted-L, lower one knee and then the other outside the bars, and finish kneeling with the crown unloaded.",
    cues: ["Use foot support to stage the bottom gradually", "Keep grip until both knees are safely down", "Keep the crown unloaded"],
    avoid: ["Do not descend from a full wall handstand before this exit is established", "Do not drop the feet between the bars or press from the head"],
    safety: ["Use a firm pad level with the bar tops and a clear landing path", "Stop after any head contact, pain or uncontrolled landing"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "moderate",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] }],
    target: { kind: "attempts", minimum: 3, maximum: 3 },
    metric: { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 3 },
    assistance: "Feet walk up the wall from a low supported setup to stage the standard bottom; no top-to-bottom eccentric, spotter or head support.",
    variantAssistance: "Foot-supported staged entry to the standard bottom; no descent from lockout.",
    range: "Reach the standard padded landmark level with the bar tops from the staged setup, then slide the feet down to inverted-L and lower both knees outside the bars without loading the crown.",
    quality: ["At least two exits begin from the exact standard bottom", "Both feet and then both knees follow the authored path", "The head remains unloaded"],
    confirmation: singleSession(30),
    regression: { exercise: "elevated-parallette-pike-push-up", assistance: "Rehearse the bailout from an elevated pike position before full inversion." },
  },
  {
    bridgeId: "bridge-hspu-wall-core",
    graphId: graphIds.verticalPushHspu,
    node: "wall-hspu-eccentric",
    exercise: "wall-hspu-eccentric",
    name: "Wall HSPU Eccentric",
    contentRole: "progression-node",
    description: "Adds a one-way full-range descent without claiming concentric strength.",
    how: "From the wall-handstand top, lower for at least four seconds to the standard padded bottom, then use the trained bailout and reset separately.",
    cues: ["Control all of the descent", "Track both elbows evenly", "Use the exit rather than pressing up"],
    avoid: ["Do not drop through the final range", "Do not touch the head or reverse the movement into a concentric"],
    safety: ["The standard bottom exit must be current", "Use the exact pad and stop after any uncontrolled descent"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.deepPikeControl] }],
    target: { kind: "repetitions", minimum: 3, maximum: 5 },
    metric: { kind: "repetitions", minimum: 3 },
    assistance: "Wall contact supplies balance only; every repetition ends with the trained bailout and a separate reset.",
    variantAssistance: "Wall contact for balance only.",
    range: "Each eccentric lasts at least four seconds from active lockout to the standard padded bar-top bottom landmark.",
    quality: ["All three descents retain control through the final third", "The crown remains unloaded", "No concentric is claimed"],
    confirmation: separated(45),
    regression: { exercise: "wall-hspu-bottom-position-exit", assistance: "Return to the standard bottom-position exit or elevated pike eccentric." },
  },
  {
    bridgeId: "bridge-hspu-wall-core",
    graphId: graphIds.verticalPushHspu,
    node: "assisted-wall-hspu-concentric",
    exercise: "assisted-wall-hspu-concentric",
    name: "Assisted Wall HSPU Concentric",
    contentRole: "progression-node",
    description: "Introduces the concentric direction with one explicit wall-foot assistance condition.",
    how: "Set the standard padded bottom, use only the prescribed light wall-foot slide and press smoothly to active lockout before resetting separately.",
    cues: ["Keep the assistance visible", "Press symmetrically", "Finish with active elevation"],
    avoid: ["Do not kip, push from the head or hide leg drive", "Do not shorten the bottom position"],
    safety: ["Use only after the full eccentric and exit are controlled", "Stop if neck, elbow or shoulder loading becomes uncontrolled"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.verticalRepeatableStrength] }],
    target: { kind: "repetitions", minimum: 4, maximum: 6 },
    metric: { kind: "repetitions", minimum: 4 },
    assistance: "A light, continuous foot slide on the wall is allowed; no kick or forceful wall push.",
    variantAssistance: "Visible light wall-foot slide throughout the concentric.",
    range: "Begin at the standard padded bar-top bottom landmark and press to complete active lockout without head support.",
    quality: ["Assistance remains light and constant", "Both elbows track symmetrically", "Every repetition reaches active lockout"],
    confirmation: separated(60),
    regression: { exercise: "wall-hspu-eccentric", assistance: "Return to controlled eccentrics or increase the light wall-foot slide." },
  },
  {
    bridgeId: "bridge-hspu-wall-core",
    graphId: graphIds.verticalPushHspu,
    node: "partial-wall-hspu",
    exercise: "partial-wall-hspu",
    name: "Partial Wall HSPU",
    contentRole: "progression-node",
    description: "Removes propulsion assistance while keeping a fixed, repeatable partial depth.",
    how: "From active wall-handstand lockout, lower to the marked partial-depth target and press back to the same top without wall leg drive.",
    cues: ["Touch the same depth every time", "Keep wall contact passive", "Reach full lockout"],
    avoid: ["Do not drift shallower", "Do not push through the feet, flare the elbows or miss lockout"],
    safety: ["Use a range that leaves an immediate controlled exit", "Stop before the head approaches the pad unintentionally"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.verticalRepeatableStrength] }],
    target: { kind: "repetitions", minimum: 4, maximum: 6 },
    metric: { kind: "repetitions", minimum: 4 },
    assistance: "Wall contact supplies balance only; no foot drive or spotter assistance.",
    variantAssistance: "Wall contact for balance only.",
    range: "Descend to the same reviewed partial-depth marker above the standard pad and return to active lockout.",
    quality: ["Range does not shorten", "The trunk and wall contact remain stable", "All repetitions finish at lockout"],
    confirmation: separated(60),
    regression: { exercise: "assisted-wall-hspu-concentric", assistance: "Restore the explicit light wall-foot assistance." },
  },
  {
    bridgeId: "bridge-hspu-wall-core",
    graphId: graphIds.verticalPushHspu,
    node: "full-wall-hspu",
    exercise: "parallette-wall-hspu",
    name: "Full Parallette Wall HSPU",
    contentRole: "progression-node",
    description: "Completes the standard bar-top wall-HSPU range before any deficit work.",
    how: "From active wall-handstand lockout, lower until the unloaded crown reaches the standard padded bar-top landmark, then press to lockout and exit safely.",
    cues: ["Own the full standard range", "Keep the crown unloaded", "Finish tall"],
    avoid: ["Do not bounce from the pad", "Do not use wall leg drive, flare or finish passively"],
    safety: ["Use the approved standard pad and trained exit", "Stop after any head contact or uncontrolled repetition"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.verticalRepeatableStrength] }],
    target: { kind: "repetitions", minimum: 3, maximum: 5 },
    metric: { kind: "repetitions", minimum: 3 },
    assistance: "Wall contact supplies balance only; no foot drive, head support or spotter assistance.",
    variantAssistance: "Wall contact for balance only.",
    range: "Every repetition reaches the standard padded bottom level with the bar tops and returns to complete active lockout.",
    quality: ["Depth and lockout remain consistent", "The crown never bears weight", "The wall supplies no propulsion"],
    confirmation: separated(60),
    regression: { exercise: "partial-wall-hspu", assistance: "Return to the marked partial range." },
  },
  {
    bridgeId: "bridge-hspu-wall-deficit",
    graphId: graphIds.verticalPushHspu,
    node: "deficit-wall-hspu-bottom-position-exit",
    exercise: "deficit-wall-hspu-bottom-position-exit",
    name: "Deficit Wall HSPU Bottom-Position Exit",
    contentRole: "benchmark-preparation",
    description: "Separates the deeper-range bailout from the standard exit before deficit pressing is allowed.",
    how: "Stage the bent-arm deficit bottom with feet walking up the wall from a low supported setup—never by testing an unproved deficit eccentric—then slide both feet down to inverted-L and lower both knees outside the bars.",
    cues: ["Distinguish the deficit target clearly", "Use foot support to enter the deeper bottom gradually", "Maintain grip until both knees are down"],
    avoid: ["Do not reuse the standard-depth exit", "Do not descend from lockout, force shoulder range or load the head"],
    safety: ["Use a reviewed below-bar pad height and clear landing path", "Stop for shoulder, neck or head symptoms"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "moderate",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] }],
    target: { kind: "attempts", minimum: 3, maximum: 3 },
    metric: { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 3 },
    assistance: "Feet walk up the wall from a low supported setup to stage the reviewed deficit bottom; no deficit eccentric, spotter or head support.",
    variantAssistance: "Foot-supported staged entry to the reviewed deficit bottom; no descent from lockout.",
    range: "Reach the reviewed padded target visibly below bar-top height from the staged setup, then slide the feet down to inverted-L and lower both knees outside the bars.",
    quality: ["At least two exits begin from the exact deficit bottom", "The deeper shoulder position remains controlled", "The head stays unloaded through the two-knee landing"],
    confirmation: singleSession(30),
    regression: { exercise: "parallette-wall-hspu", assistance: "Return to standard full range and the standard-depth exit." },
  },
  {
    bridgeId: "bridge-hspu-wall-deficit",
    graphId: graphIds.verticalPushHspu,
    node: "deficit-wall-hspu",
    exercise: "deficit-wall-hspu",
    name: "Deficit Wall HSPU",
    contentRole: "progression-node",
    description: "Adds only the reviewed extra range after the matching deficit bailout is confirmed.",
    how: "From active wall-handstand lockout, lower to the exact below-bar padded target, press back to lockout and use the trained exit.",
    cues: ["Use the reviewed deficit landmark", "Keep elbows and shoulders controlled", "Finish at active lockout"],
    avoid: ["Do not call standard depth a deficit", "Do not bounce, force shoulder extension or load the head"],
    safety: ["The deficit exit must be current at this exact depth", "Stop before range or bar stability changes"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.verticalRepeatableStrength] }],
    target: { kind: "repetitions", minimum: 2, maximum: 4 },
    metric: { kind: "repetitions", minimum: 2 },
    assistance: "Wall contact supplies balance only; no foot drive, head support or spotter assistance.",
    variantAssistance: "Wall contact for balance only.",
    range: "Every repetition reaches the reviewed padded target below the bar tops and returns to complete active lockout.",
    quality: ["The extra range is clear and unchanged", "The crown remains unloaded", "Every repetition ends under control"],
    confirmation: separated(45),
    regression: { exercise: "parallette-wall-hspu", assistance: "Return to the standard-depth full Wall HSPU." },
  },
  {
    bridgeId: "bridge-press-foundation",
    graphId: graphIds.pressToHandstand,
    node: "feet-assisted-tuck-press-load",
    exercise: "feet-assisted-tuck-press-load",
    name: "Feet-Assisted Tuck Press Load",
    contentRole: "progression-node",
    description: "Provides the exact straight-arm forward-to-overhead loading bridge that generic support and pike drills cannot demonstrate.",
    how: "From a compact feet-assisted start between the bars, shift through locked arms and raise the hips with active overhead intent before returning both feet without a jump.",
    cues: ["Keep elbows locked", "Let the hips lead", "Keep both feet explicitly assisted"],
    avoid: ["Do not jump, bend the arms or turn the movement into a static Planche lean"],
    safety: ["Use only after current wall-height exit and support prerequisites", "Stop before foot pressure or shoulder position becomes uncontrolled"],
    equipment: ["parallettes", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "high",
      "overhead-straight-arm-upper-limb": "moderate",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.tallSupport, capacityFacetIds.scapularControl] },
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.activeElevation] },
    ],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Both toes retain light floor contact throughout; pressure may reduce but neither foot may jump or leave the declared assisted setup.",
    variantAssistance: "Light two-toe floor contact throughout the loading path.",
    range: "Shoulders travel forward through locked arms as the hips rise visibly toward the overhead line, then return without a reset or jump.",
    quality: ["At least three attempts use the complete continuous path", "The elbows remain locked", "Foot pressure assists position rather than propulsion"],
    confirmation: separated(60),
    regression: { exercise: "pike-shift", assistance: "Reduce the hip rise and practise the straight-arm pike weight shift." },
  },
  {
    bridgeId: "bridge-press-bent-arm-assisted",
    graphId: graphIds.pressToHandstand,
    node: "assisted-bent-arm-tuck-press",
    exercise: "assisted-bent-arm-tuck-press",
    name: "Assisted Bent-Arm Tuck Press",
    contentRole: "progression-node",
    description: "Keeps the bent-arm Press branch explicit instead of presenting it as straight-arm Press progress.",
    how: "From a toe-assisted compact start, follow the reviewed bent-arm path until the tucked hips stack and the feet meet the wall softly; exit through the trained route.",
    cues: ["Show the elbow bend clearly", "Keep the tuck compact", "Use toe assistance without kicking"],
    avoid: ["Do not load the head", "Do not masquerade a kick-up or straight-arm Press as this branch"],
    safety: ["Use a padded head path and current inversion exits", "Stop if the wall catch or elbow path is uncontrolled"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "overhead-straight-arm-upper-limb": "high",
      "vertical-bent-arm-push": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.deepPikeControl] }],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Both toes may supply the same light floor assistance until hip rise is established; the wall only catches the controlled top.",
    variantAssistance: "Light toe assistance with a soft wall-caught endpoint.",
    range: "Move continuously from the compact assisted start through a visible bent-arm tuck path to a controlled wall-handstand top and planned exit.",
    quality: ["At least three attempts are continuous", "No head loading or kick occurs", "The top is controlled before exit"],
    confirmation: separated(60),
    regression: { exercise: "feet-assisted-tuck-press-load", assistance: "Return to the straight-arm loading foundation or use greater toe assistance." },
  },
  {
    bridgeId: "bridge-press-straddle-development",
    graphId: graphIds.pressToHandstand,
    node: "assisted-straddle-press",
    exercise: "assisted-straddle-press-to-handstand",
    name: "Assisted Straddle Press to Handstand",
    contentRole: "progression-node",
    description: "Benchmarks the assisted straight-arm straddle Press mechanics through hip stack and a controlled wall catch; the later transition separately owns the uninterrupted catch-to-exit chain.",
    how: "From a wide grounded start, shift through locked arms, use minimal toe assistance while the hips stack, then close the legs into a soft wall-handstand catch and hold it for two seconds; end the scored Press there and exit separately.",
    cues: ["Keep elbows straight", "Keep the straddle until the hips rise", "Make toe assistance visible", "Settle the wall catch before a separate exit"],
    avoid: ["Do not kick up, close the legs early, collide with the wall or count the exit as part of this Press benchmark"],
    safety: ["Use a comfortable straddle and current wall exit", "Stop if shoulder elevation, elbow lock or the wall catch is lost"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "moderate",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.activeElevation] },
      { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.activeStraddleLift] },
    ],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Minimal toe pressure is permitted only until the hips stack; the wall provides a two-second controlled catch, not propulsion, and the exit is outside this benchmark.",
    variantAssistance: "Visible minimal toe assistance with a wall-caught top.",
    range: "The locked-arm straddle path raises the hips above the shoulders before the legs close into a quiet wall-handstand catch held for two seconds; scoring ends before the separate exit.",
    quality: ["At least three attempts avoid a jump", "Elbows remain locked through hip stack", "The two-second wall catch is quiet and controlled"],
    confirmation: separated(60),
    regression: { exercise: "feet-assisted-tuck-press-load", assistance: "Return to the compact assisted foundation or increase toe assistance." },
  },
  {
    bridgeId: "bridge-press-straddle-development",
    graphId: graphIds.pressToHandstand,
    node: "straddle-press-negative",
    exercise: "straddle-press-negative",
    name: "Straddle Press Negative",
    contentRole: "progression-node",
    description: "Observes the one-way straight-arm lowering path independently of any concentric Press claim.",
    how: "From a stable wall handstand, open to straddle and lower through locked arms for at least four seconds until both heels land; reset from the floor.",
    cues: ["Keep elbows locked", "Let compression control the descent", "Land both heels together"],
    avoid: ["Do not drop the feet, bend the arms or reverse the clip into a concentric"],
    safety: ["Use current wall-handstand control and a clear landing", "Stop if the descent accelerates beyond control"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "moderate",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] },
      { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.activeStraddleLift] },
    ],
    target: { kind: "repetitions", minimum: 3, maximum: 5 },
    metric: { kind: "repetitions", minimum: 3 },
    assistance: "The wall supplies only the starting handstand; each repetition lowers one way and resets from the floor.",
    variantAssistance: "Wall-supported starting handstand only.",
    range: "Open from wall handstand and lower both straight straddled legs through the complete locked-arm Press path for at least four seconds.",
    quality: ["All descents remain controlled", "Both elbows and knees stay locked", "No concentric ability is inferred"],
    confirmation: separated(60),
    regression: { exercise: "assisted-straddle-press-to-handstand", assistance: "Return to the assisted concentric path or shorten the negative range." },
  },
  {
    bridgeId: "bridge-press-pike-development",
    graphId: graphIds.pressToHandstand,
    node: "assisted-pike-press",
    exercise: "assisted-pike-press-to-handstand",
    name: "Assisted Pike Press to Handstand",
    contentRole: "progression-node",
    description: "Adds a distinct together-leg straight-arm Press bridge rather than treating straddle and pike as interchangeable.",
    how: "From a feet-together pike, shift through locked arms and use minimal toe assistance while the hips and straight legs rise to a soft wall-handstand catch.",
    cues: ["Keep the legs together", "Let the hips lead", "Keep shoulders actively elevated"],
    avoid: ["Do not jump, straddle, bend the knees or bend the elbows"],
    safety: ["Use current pike access and wall exit", "Stop if the lower back, hamstrings or shoulders compensate"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "moderate",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.activeElevation] },
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Minimal toe pressure is permitted only until the hips stack; the wall provides a soft endpoint, not propulsion.",
    variantAssistance: "Visible minimal toe assistance with a wall-caught top.",
    range: "The locked-arm together-leg pike path raises hips then straight legs into the wall-handstand endpoint without straddling.",
    quality: ["At least three attempts avoid a jump", "Knees and elbows stay locked", "The wall contact is controlled"],
    confirmation: separated(60),
    regression: { exercise: "feet-assisted-tuck-press-load", assistance: "Return to the compact assisted foundation or increase toe assistance." },
  },
  {
    bridgeId: "bridge-press-pike-development",
    graphId: graphIds.pressToHandstand,
    node: "pike-press-negative",
    exercise: "pike-press-negative",
    name: "Pike Press Negative",
    contentRole: "progression-node",
    description: "Observes the together-leg straight-arm lowering path without awarding the concentric pike Press.",
    how: "From a wall handstand, fold at the hips with both legs together and lower for at least four seconds until both feet land; reset from the floor.",
    cues: ["Keep arms and knees straight", "Keep both legs together", "Control the entire fold"],
    avoid: ["Do not drop, straddle or reverse the movement into a concentric claim"],
    safety: ["Use current wall-handstand control and a clear landing", "Stop before hamstring range or shoulder elevation forces compensation"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "moderate",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] },
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "repetitions", minimum: 3, maximum: 5 },
    metric: { kind: "repetitions", minimum: 3 },
    assistance: "The wall supplies only the starting handstand; each repetition lowers one way and resets from the floor.",
    variantAssistance: "Wall-supported starting handstand only.",
    range: "Lower both straight together legs through the complete locked-arm pike path for at least four seconds to a two-foot landing.",
    quality: ["All descents remain controlled", "No straddle or knee bend occurs", "No concentric ability is inferred"],
    confirmation: separated(60),
    regression: { exercise: "assisted-pike-press-to-handstand", assistance: "Return to the assisted concentric path or shorten the negative range." },
  },
  {
    bridgeId: "bridge-pushing-deficit",
    graphId: graphIds.parallettePushing,
    node: "deep-deficit-parallette-push-up",
    exercise: "deficit-parallette-push-up",
    name: "Deficit Parallette Push-Up",
    contentRole: "progression-node",
    description: "Adds a defined extra range to general parallette pushing without relabelling it as Planche or HSPU strength.",
    how: "From a rigid top plank, lower between stable bars until the shoulders reach the reviewed below-bar landmark, then press to the same lockout.",
    cues: ["Keep the trunk connected", "Track the elbows consistently", "Own the same extra depth"],
    avoid: ["Do not chase uncontrolled depth", "Do not flare, sag, bounce or use unstable bars"],
    safety: ["Use only a pain-free shoulder range", "Reduce depth immediately if the front of the shoulder loses control"],
    equipment: ["parallettes", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "horizontal-bent-arm-push": "high",
    },
    capacityLinks: [{ capacityId: capacityIds.horizontalBentArmPush, facetIds: [capacityFacetIds.paralletteRangeControl] }],
    target: { kind: "repetitions", minimum: 6, maximum: 8 },
    metric: { kind: "repetitions", minimum: 6 },
    assistance: "No external assistance; use stable equal-height parallettes.",
    range: "The shoulders descend to the reviewed landmark below elbow/bar-top level before every complete controlled lockout.",
    quality: ["Depth remains consistent", "Body line and shoulder control remain stable", "No bounce assists the press"],
    confirmation: separated(90),
    regression: { exercise: "controlled-parallette-pushup", assistance: "Return to the standard parallette push-up depth." },
  },
  {
    bridgeId: "bridge-transition-l-sit-planche",
    graphId: graphIds.transitions,
    node: "l-sit-to-tuck-planche",
    exercise: "l-sit-to-tuck-planche-transition",
    name: "L-Sit to Tuck Planche Transition",
    contentRole: "progression-node",
    description: "Connects two demonstrated endpoints through one continuous direction without treating endpoint ability as transition evidence.",
    how: "Hold full L-sit, compress and retract the legs as the shoulders lean, then stabilise a feet-clear tuck Planche before the planned landing.",
    cues: ["Keep elbows locked", "Keep both feet clear", "Show both endpoints distinctly"],
    avoid: ["Do not swing, touch down, rest knees on the arms or skip either endpoint"],
    safety: ["Both endpoint milestones must be current", "Land immediately before shoulder or elbow control is lost"],
    equipment: ["parallettes", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] },
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "No foot, wall or spotter assistance between the two endpoints.",
    range: "Move continuously from a held full L-sit to a stabilised feet-clear tuck Planche without a reset or floor contact.",
    quality: ["At least three attempts show both endpoints", "Elbows remain locked", "Momentum does not replace the shoulder shift"],
    confirmation: separated(60),
    regression: { exercise: "parallette-tuck-planche-hold", assistance: "Practise the endpoints and the support shift separately before reconnecting them." },
  },
  {
    bridgeId: "bridge-transition-l-sit-planche",
    graphId: graphIds.transitions,
    node: "tuck-planche-to-l-sit",
    exercise: "tuck-planche-to-l-sit-transition",
    name: "Tuck Planche to L-Sit Transition",
    contentRole: "progression-node",
    description: "Defines the reverse direction separately because gravity-assisted lowering is not equivalent to the L-sit-to-Planche direction.",
    how: "Stabilise a feet-clear tuck Planche, shift hips and shoulders under control, extend both legs to a held full L-sit and land softly.",
    cues: ["Keep elbows locked", "Control the shoulder shift", "Finish in a clear full L-sit"],
    avoid: ["Do not kick the legs, drop through support or count a brief low endpoint"],
    safety: ["Both endpoint milestones must be current", "Return to tuck or land before the forward shoulder position is lost"],
    equipment: ["parallettes", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] },
      { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] },
    ],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "No foot, wall or spotter assistance between the two endpoints.",
    range: "Move continuously from a held feet-clear tuck Planche to a stabilised full L-sit without a reset or floor contact.",
    quality: ["At least three attempts show both endpoints", "The L-sit is held rather than passed through", "Elbows remain locked"],
    confirmation: separated(60),
    regression: { exercise: "full-lsit-attempt", assistance: "Practise the endpoints and controlled support shift separately." },
  },
  {
    bridgeId: "bridge-transition-handstand-lower",
    graphId: graphIds.transitions,
    node: "wall-handstand-to-straddle-stand-lower",
    exercise: "wall-handstand-to-straddle-stand-lower",
    name: "Wall Handstand to Straddle-Stand Lower",
    contentRole: "progression-node",
    description: "Requires the complete handstand-to-standing connection rather than crediting compression or a partial Press negative alone.",
    how: "From wall handstand, open into straddle and lower through locked arms until both heels land together in a stable straddle stand.",
    cues: ["Keep elbows locked", "Lower hips before dropping the feet", "Own the standing endpoint"],
    avoid: ["Do not drop, twist, bend the arms or land one foot at a time"],
    safety: ["Use current wall exits and a comfortable straddle", "Stop before the descent accelerates or the landing path is lost"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "moderate",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] },
      { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.usableStraddleAccess] },
    ],
    target: { kind: "attempts", minimum: 4, maximum: 4 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 4 },
    assistance: "The wall supplies only the starting handstand; no spotter assistance is used during the lower.",
    variantAssistance: "Wall-supported starting handstand only.",
    range: "Complete the continuous locked-arm straddle lower from wall handstand to a balanced two-foot straddle stand.",
    quality: ["At least three attempts reach the stable standing endpoint", "Both legs remain symmetric and straight", "The descent is controlled"],
    confirmation: separated(60),
    regression: { exercise: "box-pike", assistance: "Shorten the wall-assisted lowering range while retaining a controlled two-foot landing." },
  },
  {
    bridgeId: "bridge-transition-assisted-press",
    graphId: graphIds.transitions,
    node: "feet-assisted-straddle-press-to-wall-handstand",
    exercise: "feet-assisted-straddle-press-to-wall-handstand",
    name: "Feet-Assisted Straddle Press to Wall Handstand Transition",
    contentRole: "progression-node",
    description: "Requires one uninterrupted assisted Press-to-handstand connection and exit rather than crediting either endpoint alone.",
    how: "From a wide grounded start, use minimal visible toe assistance through locked arms, stack the hips, close into a soft wall handstand and use the planned side exit without a reset.",
    cues: ["Keep the connection continuous", "Close the legs only after hip rise", "Exit under control"],
    avoid: ["Do not kick up, bend the arms, hit the wall or pause/reset before the handstand"],
    safety: ["The assisted straddle Press and wall-handstand line must be current", "Use a clear side-exit landing path"],
    equipment: ["parallettes", "wall", "floor"],
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "moderate",
      "overhead-straight-arm-upper-limb": "high",
      "inversion-technical": "high",
      "compression-trunk": "high",
    },
    capacityLinks: [
      { capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] },
      { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.activeStraddleLift] },
    ],
    target: { kind: "attempts", minimum: 5, maximum: 5 },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    assistance: "Minimal visible toe pressure is allowed before hip stack; the wall supplies only a soft endpoint before the planned exit.",
    variantAssistance: "Minimal toe assistance plus a wall-caught endpoint.",
    range: "Complete the feet-assisted locked-arm straddle Press, stable wall-handstand endpoint and planned side exit as one uninterrupted chain.",
    quality: ["At least three attempts complete the whole chain", "No jump or reset occurs", "The wall catch and exit remain controlled"],
    confirmation: separated(60),
    regression: { exercise: "feet-assisted-tuck-press-load", assistance: "Return to the assisted Press foundation or practise the wall endpoint separately." },
  },
] as const satisfies readonly ContentSpec[];

const rolesFor = (role: Phase7ContentRole): readonly ExerciseRole[] => {
  if (role === "benchmark-preparation") {
    // These are observable safety milestones in the graph, not ordinary
    // accessories: the benchmark proves the bailout before deeper work.
    return ["outcome-milestone", "benchmark-test", "technique-safety"];
  }
  if (role === "technique-drill") {
    return ["outcome-milestone", "benchmark-test", "technique-safety"];
  }
  return ["outcome-milestone", "benchmark-test", "development-drill"];
};

const phase7Exercise = (spec: ContentSpec): ExerciseDefinition => {
  const id = exerciseId(spec.exercise);
  const standardId = prescriptionId(spec.exercise);
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id,
    definitionVersion: VNEXT_BASE_DEFINITION_VERSION,
    lifecycle: "active",
    name: spec.name,
    description: spec.description,
    instructions: {
      how: spec.how,
      cues: spec.cues,
      avoid: spec.avoid,
    },
    media: phase7MediaForExercise(id),
    equipment: equipment(spec.equipment),
    roles: rolesFor(spec.contentRole),
    graphLinks: [{
      graphId: spec.graphId,
      nodeId: nodeId(spec.node),
      contribution: "milestone",
    }],
    capacityLinks: spec.capacityLinks ?? [],
    prescriptionVariants: [
      {
        id: standardId,
        label: targetLabel(spec.target),
        target: spec.target,
        ...(spec.variantAssistance ? { assistance: spec.variantAssistance } : {}),
        range: spec.range,
        demand: denseDemand(spec.demand),
      },
      {
        id: regressionPrescriptionId(spec.exercise),
        label: "Technique — reduced dose",
        target: techniqueTarget(spec.target),
        ...(spec.variantAssistance ? { assistance: spec.variantAssistance } : {}),
        range: `${spec.range} This technique variant uses a sub-benchmark dose and cannot confirm the milestone protocol.`,
        // The easier dose is not assigned a lower demand until that exact
        // prescription is independently audited. Restriction handling remains
        // conservative, while the external relation owns a true regression.
        demand: denseDemand(spec.demand),
      },
    ],
    benchmarkProtocolIds: [milestoneBenchmarkId(spec.graphId, spec.node)],
    relations: [{
      kind: "regression",
      targetExerciseId: exerciseId(spec.regression.exercise),
      fromPrescriptionVariantId: standardId,
      targetPrescriptionVariantId: prescriptionId(spec.regression.exercise),
    }],
    safetyNotes: spec.safety,
  };
};

const phase7Protocol = (spec: ContentSpec): BenchmarkProtocol => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: milestoneBenchmarkId(spec.graphId, spec.node),
  definitionVersion: VNEXT_BASE_DEFINITION_VERSION,
  label: spec.name,
  subject: {
    kind: "milestone",
    milestone: { graphId: spec.graphId, nodeId: nodeId(spec.node) },
  },
  exerciseId: exerciseId(spec.exercise),
  prescriptionVariantId: prescriptionId(spec.exercise),
  conditions: {
    equipment: equipment(spec.equipment),
    assistance: spec.assistance,
    range: spec.range,
  },
  metric: spec.metric,
  qualityCriteria: spec.quality,
  safetyCriteria: spec.safety,
  confirmation: spec.confirmation,
});

export const phase7ExerciseDefinitions = contentSpecs.map(phase7Exercise) as ReadonlyArray<ExerciseDefinition>;

export const phase7BenchmarkProtocols = contentSpecs.map(phase7Protocol) as ReadonlyArray<BenchmarkProtocol>;

const nodeKey = (graphId: GraphId, id: NodeId): string => `${graphId}:${id}`;

export const phase7ImplementedNodeKeys = contentSpecs.map((spec) =>
  nodeKey(spec.graphId, nodeId(spec.node))) as readonly string[];

const implementedNodeKeySet = new Set(phase7ImplementedNodeKeys);

export const phase7ImplementedBridgeIds = [...new Set(
  contentSpecs.map((spec) => spec.bridgeId),
)] as readonly string[];

const implementedBridgeIdSet = new Set(phase7ImplementedBridgeIds);

export const remainingProgressionBridges = missingProgressionBridges.filter(
  (bridge) => !implementedBridgeIdSet.has(bridge.id),
);

export const currentDevelopmentGraphs = developmentGraphs.map((graph): DevelopmentGraph => ({
  ...graph,
  definitionVersion: VNEXT_CATALOGUE_VERSION,
  nodes: graph.nodes.map((node): DevelopmentNode => {
    if (!implementedNodeKeySet.has(nodeKey(graph.id, node.id))) return node;
    return {
      ...node,
      implementationStatus: "available",
      benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)],
    };
  }),
}));

export const currentExerciseDefinitions = [
  ...exerciseDefinitions,
  ...phase7ExerciseDefinitions,
] as readonly ExerciseDefinition[];

export const currentBenchmarkProtocols = [
  ...benchmarkProtocols,
  ...phase7BenchmarkProtocols,
] as readonly BenchmarkProtocol[];

export const currentExerciseDefinitionById = new Map(
  currentExerciseDefinitions.map((definition) => [definition.id, definition] as const),
);

export const currentBenchmarkProtocolById = new Map(
  currentBenchmarkProtocols.map((protocol) => [protocol.id, protocol] as const),
);

const currentNodeByKey = new Map<string, Readonly<{
  graph: DevelopmentGraph;
  node: DevelopmentNode;
}>>();

for (const graph of currentDevelopmentGraphs) {
  for (const node of graph.nodes) currentNodeByKey.set(nodeKey(graph.id, node.id), { graph, node });
}

const milestoneKeys = (refs: readonly PrerequisiteRef[] | undefined): readonly string[] =>
  (refs ?? [])
    .filter((ref): ref is Extract<PrerequisiteRef, { kind: "milestone" }> => ref.kind === "milestone")
    .map((ref) => nodeKey(ref.milestone.graphId, ref.milestone.nodeId));

const successorKeysFor = (key: string): readonly string[] => {
  const successors: string[] = [];
  for (const [candidateKey, { node }] of currentNodeByKey) {
    const prerequisites = [
      ...milestoneKeys(node.prerequisiteRule?.allOf),
      ...milestoneKeys(node.prerequisiteRule?.anyOf),
    ];
    if (prerequisites.includes(key)) successors.push(candidateKey);
  }
  return successors.sort();
};

/**
 * Review sidecar derived from the canonical graph. It records why each item
 * exists and its before/after relationships without duplicating graph topology
 * on Exercise Definitions.
 */
export const phase7DeliveryRecords = contentSpecs.map((spec) => {
  const key = nodeKey(spec.graphId, nodeId(spec.node));
  const entry = currentNodeByKey.get(key);
  if (!entry) throw new Error(`Phase 7 content references unknown node ${key}`);
  return {
    bridgeId: spec.bridgeId,
    graphId: spec.graphId,
    nodeId: nodeId(spec.node),
    exerciseId: exerciseId(spec.exercise),
    benchmarkProtocolId: milestoneBenchmarkId(spec.graphId, spec.node),
    contentRole: spec.contentRole,
    prerequisiteRule: entry.node.prerequisiteRule,
    comesAfterMilestoneKeys: [
      ...milestoneKeys(entry.node.prerequisiteRule?.allOf),
      ...milestoneKeys(entry.node.prerequisiteRule?.anyOf),
    ].sort(),
    comesBeforeMilestoneKeys: successorKeysFor(key),
    regressionExerciseId: exerciseId(spec.regression.exercise),
  } as const;
});

export const phase7CatalogueIdentityPolicy = {
  sourceVersion: "vnext-catalogue-2",
  stableIdsRetained: exerciseDefinitions.map((definition) => definition.id),
  addedStableIds: phase7ExerciseDefinitions.map((definition) => definition.id),
  aliases: [] as readonly Readonly<{ alias: ExerciseId; canonicalId: ExerciseId }>[],
  tombstones: [] as readonly Readonly<{ id: ExerciseId; reason: string }>[],
} as const;

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

if (!unique(phase7ExerciseDefinitions.map((definition) => definition.id))) {
  throw new Error("Phase 7 exercise IDs must be unique");
}
if (!unique(phase7BenchmarkProtocols.map((protocol) => protocol.id))) {
  throw new Error("Phase 7 benchmark protocol IDs must be unique");
}
if (!unique(phase7ImplementedNodeKeys)) {
  throw new Error("Each Phase 7 node must have exactly one content definition");
}
for (const bridgeId of phase7ImplementedBridgeIds) {
  if (!missingProgressionBridges.some((bridge) => bridge.id === bridgeId)) {
    throw new Error(`Phase 7 content references unknown bridge ${bridgeId}`);
  }
}
