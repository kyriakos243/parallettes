import type { BenchmarkProtocolId, GraphId } from "../contracts";
import {
  capacityBenchmarkId,
  graphIds,
  milestoneBenchmarkId,
} from "../definitions/ids";
import {
  VNEXT_ASSESSMENT_POLICY_ID,
  VNEXT_ASSESSMENT_POLICY_VERSION,
  type AssessmentGoalOption,
  type AssessmentPolicy,
  type PlacementAnchor,
} from "./contracts";

const anchor = (
  id: string,
  label: string,
  prompt: string,
  protocolId: BenchmarkProtocolId,
  options: Readonly<{
    stage: PlacementAnchor["stage"];
    goalGraphId?: GraphId;
    ladderIndex?: number;
    inversionExposure?: PlacementAnchor["inversionExposure"];
  }>,
): PlacementAnchor => ({
  id,
  label,
  prompt,
  protocolId,
  stage: options.stage,
  ...(options.goalGraphId ? { goalGraphId: options.goalGraphId } : {}),
  ...(options.ladderIndex === undefined ? {} : { ladderIndex: options.ladderIndex }),
  inversionExposure: options.inversionExposure ?? "none",
});

const goal = (
  graphId: GraphId,
  label: string,
  description: string,
  requiresInversionContext: boolean,
): AssessmentGoalOption => ({ graphId, label, description, requiresInversionContext });

const ladder = (
  goalGraphId: GraphId,
  items: readonly Readonly<{
    id: string;
    label: string;
    prompt: string;
    protocolId: BenchmarkProtocolId;
    inversionExposure?: PlacementAnchor["inversionExposure"];
  }>[] ,
): readonly PlacementAnchor[] => items.map((item, ladderIndex) => anchor(
  item.id,
  item.label,
  item.prompt,
  item.protocolId,
  {
    stage: "goal",
    goalGraphId,
    ladderIndex,
    ...(item.inversionExposure ? { inversionExposure: item.inversionExposure } : {}),
  },
));

export const assessmentGoalOptions = [
  goal(graphIds.handstandBalance, "Handstand", "Entry, safe exit, line and balance on floor or parallettes.", true),
  goal(graphIds.planche, "Planche", "Straight-arm support, protraction and progressively lighter foot assistance.", false),
  goal(graphIds.lSitVSit, "L-sit / V-sit", "Support, long-leg control and active compression.", false),
  goal(graphIds.verticalPushHspu, "HSPU", "Pike pressing now, with inversion-specific work only after safety gates.", true),
  goal(graphIds.pressToHandstand, "Press to handstand", "Support, compression and overhead prerequisites for later press work.", true),
  goal(graphIds.parallettePushing, "General parallette strength", "Foundational horizontal pushing and controlled range.", false),
] as const satisfies readonly AssessmentGoalOption[];

export const commonPlacementAnchors = [
  anchor(
    "anchor-common-tall-support",
    "Tall support",
    "Which description best matches a calm, locked-elbow support between the parallettes?",
    capacityBenchmarkId("straight-arm-support", "tall-support"),
    { stage: "common" },
  ),
  anchor(
    "anchor-common-pike-access",
    "Usable pike access",
    "Which description best matches the shown pain-free seated pike position with straight knees?",
    capacityBenchmarkId("pike-compression", "usable-pike-access"),
    { stage: "common" },
  ),
  anchor(
    "anchor-common-knee-push",
    "Foundation push",
    "Which description best matches the shown controlled knee push-up range?",
    milestoneBenchmarkId("parallette-pushing", "knee-push-up"),
    { stage: "common" },
  ),
] as const satisfies readonly PlacementAnchor[];

const planche = ladder(graphIds.planche, [
  {
    id: "anchor-planche-lean",
    label: "Controlled planche lean",
    prompt: "Can you reproduce the shown pain-free locked-elbow lean with active protraction?",
    protocolId: milestoneBenchmarkId("planche", "controlled-planche-lean"),
  },
  {
    id: "anchor-planche-toe-light",
    label: "Toe-light loading",
    prompt: "Can you make both feet visibly light without jumping or losing protraction?",
    protocolId: milestoneBenchmarkId("planche", "toe-light-planche-loading"),
  },
  {
    id: "anchor-planche-assisted-tuck",
    label: "Foot-assisted tuck planche",
    prompt: "Can you hold the compact shown tuck with only light, repeatable foot contact?",
    protocolId: milestoneBenchmarkId("planche", "foot-assisted-tuck-planche"),
  },
]);

const lSit = ladder(graphIds.lSitVSit, [
  {
    id: "anchor-lsit-tuck",
    label: "Tuck support",
    prompt: "Can you hold the shown feet-clear tuck with locked elbows and tall shoulders?",
    protocolId: milestoneBenchmarkId("l-sit-v-sit", "tuck-support"),
  },
  {
    id: "anchor-lsit-extensions",
    label: "Controlled leg extensions",
    prompt: "Can you alternate straight-leg extensions without losing support height?",
    protocolId: milestoneBenchmarkId("l-sit-v-sit", "controlled-leg-extensions"),
  },
  {
    id: "anchor-lsit-full",
    label: "Full L-sit",
    prompt: "Can you hold both locked legs at or above horizontal with both heels clear?",
    protocolId: milestoneBenchmarkId("l-sit-v-sit", "full-l-sit"),
  },
]);

const handstand = ladder(graphIds.handstandBalance, [
  {
    id: "anchor-handstand-grounded-exit",
    label: "Grounded side exit",
    prompt: "Can you calmly rehearse the taught side-exit path to both sides while grounded?",
    protocolId: milestoneBenchmarkId("handstand-balance", "grounded-side-exit"),
  },
  {
    id: "anchor-handstand-low-exit",
    label: "Low-inversion side exit",
    prompt: "Can you choose and complete the shown exit from low inversion to both sides?",
    protocolId: milestoneBenchmarkId("handstand-balance", "low-inversion-side-exit"),
    inversionExposure: "low" as const,
  },
  {
    id: "anchor-handstand-supported",
    label: "Supported inversion",
    prompt: "Can you stay calm and oriented in the shown supported inversion with an exit available?",
    protocolId: milestoneBenchmarkId("handstand-balance", "supported-inversion-tolerance"),
    inversionExposure: "full" as const,
  },
  {
    id: "anchor-handstand-wall-entry",
    label: "Controlled wall entry",
    prompt: "Can you enter wall support softly and finish through the planned exit?",
    protocolId: milestoneBenchmarkId("handstand-balance", "controlled-wall-entry"),
    inversionExposure: "full" as const,
  },
  {
    id: "anchor-handstand-short-balance",
    label: "Short parallette balance",
    prompt: "Can you separate entry, at least three seconds of balance, and a planned side exit?",
    protocolId: milestoneBenchmarkId("handstand-balance", "controlled-short-parallette-balance"),
    inversionExposure: "full" as const,
  },
]);

const hspu = ladder(graphIds.verticalPushHspu, [
  {
    id: "anchor-hspu-shallow-pike",
    label: "Shallow pike push-up",
    prompt: "Can you repeat the shown forward-down pike press without neck or shoulder collapse?",
    protocolId: milestoneBenchmarkId("vertical-push-hspu", "shallow-pike-push-up"),
  },
  {
    id: "anchor-hspu-floor-pike",
    label: "Floor pike push-up",
    prompt: "Can you reach the padded floor target and return to lockout with the hips high?",
    protocolId: milestoneBenchmarkId("vertical-push-hspu", "floor-pike-push-up"),
  },
  {
    id: "anchor-hspu-parallette-pike",
    label: "Parallette pike push-up",
    prompt: "Can you press through the shown below-bar pike depth without momentum?",
    protocolId: milestoneBenchmarkId("vertical-push-hspu", "parallette-pike-push-up"),
  },
  {
    id: "anchor-hspu-pike-eccentric",
    label: "Controlled pike eccentric",
    prompt: "Can you lower for four controlled seconds through the shown depth, then reset?",
    protocolId: milestoneBenchmarkId("vertical-push-hspu", "controlled-pike-eccentric"),
  },
]);

const press = ladder(graphIds.pressToHandstand, [
  {
    id: "anchor-press-support-transition",
    label: "Support-to-tuck control",
    prompt: "Can you move from tall support to a feet-clear tuck and return without elbow bend?",
    protocolId: milestoneBenchmarkId("transitions", "support-to-tuck"),
  },
  {
    id: "anchor-press-straddle-lift",
    label: "Active straddle lift",
    prompt: "Can you actively lift both straight legs from the shown comfortable straddle without rocking?",
    protocolId: capacityBenchmarkId("straddle-compression", "active-straddle-lift"),
  },
  {
    id: "anchor-press-inverted-l",
    label: "Wall inverted-L alignment",
    prompt: "Can you hold the shown stacked inverted-L line with locked elbows and calm control?",
    protocolId: milestoneBenchmarkId("handstand-balance", "wall-inverted-l-alignment"),
    inversionExposure: "low" as const,
  },
]);

const pushing = ladder(graphIds.parallettePushing, [
  {
    id: "anchor-push-knee",
    label: "Knee push-up",
    prompt: "Can you repeat the shown knee push-up range with a stable trunk?",
    protocolId: milestoneBenchmarkId("parallette-pushing", "knee-push-up"),
  },
  {
    id: "anchor-push-floor",
    label: "Floor push-up",
    prompt: "Can you repeat the shown full-body floor push-up range and lockout?",
    protocolId: milestoneBenchmarkId("parallette-pushing", "floor-push-up"),
  },
  {
    id: "anchor-push-parallette",
    label: "Parallette push-up",
    prompt: "Can you control the shown shoulder-to-elbow depth between stable bars?",
    protocolId: milestoneBenchmarkId("parallette-pushing", "controlled-parallette-push-up"),
  },
  {
    id: "anchor-push-tempo",
    label: "Tempo push-up",
    prompt: "Can you preserve full range with a three-second lowering phase on every repetition?",
    protocolId: milestoneBenchmarkId("parallette-pushing", "tempo-push-up"),
  },
]);

export const goalPlacementLadders = new Map<GraphId, readonly PlacementAnchor[]>([
  [graphIds.planche, planche],
  [graphIds.lSitVSit, lSit],
  [graphIds.handstandBalance, handstand],
  [graphIds.verticalPushHspu, hspu],
  [graphIds.pressToHandstand, press],
  [graphIds.parallettePushing, pushing],
]);

export const vNextAssessmentPolicy = {
  id: VNEXT_ASSESSMENT_POLICY_ID,
  version: VNEXT_ASSESSMENT_POLICY_VERSION,
  goalOptions: assessmentGoalOptions,
  commonAnchors: commonPlacementAnchors,
  goalLadders: goalPlacementLadders,
  maximumGoals: 3,
  maximumGuidedTestsPerReview: 4,
} as const satisfies AssessmentPolicy;
