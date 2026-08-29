import type { GraphId, NodeId, ProgrammingBoundary } from "../contracts";
import { graphIds, nodeId } from "./ids";

export type MissingProgressionBridge = Readonly<{
  id: string;
  graphId: GraphId;
  nodeIds: readonly NodeId[];
  boundary: ProgrammingBoundary;
  priority: "planner-core-candidate" | "optional-extension" | "specialist-optional";
  reason: string;
  proposedContentIds: readonly string[];
  deliveryPhase: "phase-7";
}>;

const bridge = (
  id: string,
  graphId: GraphId,
  nodes: readonly string[],
  boundary: ProgrammingBoundary,
  priority: MissingProgressionBridge["priority"],
  reason: string,
  proposedContentIds: readonly string[],
): MissingProgressionBridge => ({
  id,
  graphId,
  nodeIds: nodes.map(nodeId),
  boundary,
  priority,
  reason,
  proposedContentIds,
  deliveryPhase: "phase-7",
});

/**
 * Canonical Phase 2 gap registry. Programming permission and content priority
 * are deliberately independent: an automatic node is not automatically a
 * release requirement. `planner-core-candidate` means Phase 6 must prove that
 * the bridge is needed for coherent coverage before Phase 7 implements it.
 * Proposed IDs reserve reviewable intent for an exercise, prescription variant
 * or protocol; they add none of those yet.
 */
export const missingProgressionBridges = [
  bridge("bridge-planche-stable-tuck", graphIds.planche, ["stable-tuck-planche"], "automatic", "planner-core-candidate", "The floor tuck attempt is brief and apparatus-specific; it cannot stand in for a stable parallette tuck.", ["parallette-tuck-planche-hold"]),
  bridge("bridge-planche-advanced-tuck", graphIds.planche, ["advanced-tuck-planche"], "automatic", "planner-core-candidate", "No existing exercise opens the tuck lever while preserving a true feet-clear planche.", ["advanced-tuck-planche-hold"]),
  bridge("bridge-planche-one-leg-assisted", graphIds.planche, ["assisted-one-leg-planche"], "automatic", "optional-extension", "The catalogue has no assisted one-leg bridge after advanced tuck.", ["assisted-one-leg-planche-hold"]),
  bridge("bridge-planche-one-leg-outcome", graphIds.planche, ["one-leg-planche"], "stronger-gated", "optional-extension", "The catalogue has no unassisted one-leg Planche outcome.", ["one-leg-planche-hold"]),
  bridge("bridge-planche-straddle-assisted", graphIds.planche, ["assisted-straddle-planche"], "automatic", "optional-extension", "Straddle Planche Lean keeps the feet grounded and is not an assisted feet-clear straddle outcome.", ["assisted-straddle-planche-hold"]),
  bridge("bridge-planche-straddle-outcome", graphIds.planche, ["stable-straddle-planche"], "stronger-gated", "optional-extension", "The catalogue has no stable unassisted straddle-planche outcome.", ["straddle-planche-hold"]),
  bridge("bridge-planche-full-assisted", graphIds.planche, ["assisted-full-planche"], "automatic", "optional-extension", "No full-planche-specific assisted lever content exists after stable straddle.", ["assisted-full-planche-hold"]),
  bridge("bridge-planche-full-outcome", graphIds.planche, ["full-planche"], "stronger-gated", "optional-extension", "No unassisted full-planche outcome exists.", ["full-planche-hold"]),
  bridge("bridge-planche-eccentric-push-up", graphIds.planche, ["full-planche-push-up-eccentric"], "specialist", "specialist-optional", "The exact full-Planche push-up eccentric is optional specialist work and has no current content; it does not claim the later concentric outcome.", ["full-planche-push-up-eccentric"]),

  bridge("bridge-l-sit-straddle", graphIds.lSitVSit, ["stable-straddle-l-sit"], "automatic", "optional-extension", "The existing straddle hold remains heel-assisted.", ["straddle-l-sit-hold"]),
  bridge("bridge-v-sit-development", graphIds.lSitVSit, ["high-l-sit", "assisted-v-sit", "partial-v-sit"], "automatic", "planner-core-candidate", "The catalogue ends at full/assisted-straddle L-sit and contains no true assisted path into V-sit.", ["high-l-sit-hold", "assisted-v-sit-hold", "partial-v-sit-hold"]),
  bridge("bridge-v-sit-outcome", graphIds.lSitVSit, ["stable-v-sit"], "stronger-gated", "optional-extension", "The catalogue has no unassisted stable V-sit outcome.", ["v-sit-hold"]),
  bridge("bridge-v-sit-specialist", graphIds.lSitVSit, ["extended-v-sit-hold"], "specialist", "specialist-optional", "An extended V-sit hold is optional specialist scope; press and manna combinations remain separate decisions.", ["extended-v-sit-hold"]),

  bridge("bridge-handstand-repeatable-floor-balance", graphIds.handstandBalance, ["repeatable-floor-balance"], "automatic", "optional-extension", "The current floor movement can supply a stricter repeatable-balance prescription/protocol variant, but floor repeatability is not automatically required for the parallette-first release path.", ["floor-balance-repeatable-variant"]),
  bridge("bridge-handstand-repeatable-parallette-balance", graphIds.handstandBalance, ["repeatable-parallette-balance"], "automatic", "planner-core-candidate", "The existing parallette chain can supply a stricter repeatable-balance prescription/protocol variant; its current short-balance protocol does not prove repeatability.", ["parallette-balance-repeatable-variant"]),
  bridge("bridge-handstand-stable-balance", graphIds.handstandBalance, ["stable-longer-parallette-balance"], "stronger-gated", "optional-extension", "The existing chain can support a stronger longer-hold variant, but no such prescription/protocol is authored yet.", ["parallette-balance-stable-variant"]),
  bridge("bridge-handstand-shapes", graphIds.handstandBalance, ["freestanding-parallette-tuck-shape-change"], "automatic", "optional-extension", "No current exercise benchmarks the exact freestanding parallette straight-to-tuck-to-straight change.", ["freestanding-parallette-tuck-shape-change"]),
  bridge("bridge-handstand-weight-transfer", graphIds.handstandBalance, ["freestanding-weight-transfer", "freestanding-parallette-one-hand-light-balance"], "stronger-gated", "optional-extension", "Current weight-transfer work remains wall-supported and never reaches a freestanding one-hand-light outcome.", ["freestanding-parallette-weight-shift", "freestanding-parallette-one-hand-light-balance"]),
  bridge("bridge-handstand-one-arm", graphIds.handstandBalance, ["assisted-one-arm-parallette-balance", "one-arm-handstand"], "specialist", "specialist-optional", "Assisted and unassisted one-arm outcomes are optional coached specialist scope.", ["assisted-one-arm-parallette-balance", "one-arm-parallette-handstand"]),

  bridge("bridge-hspu-elevated-pike", graphIds.verticalPushHspu, ["elevated-deep-pike-push-up"], "automatic", "planner-core-candidate", "The current path ends at eccentric pike work without an elevated/deeper pike bridge.", ["elevated-parallette-pike-push-up"]),
  bridge("bridge-hspu-wall-core", graphIds.verticalPushHspu, ["wall-hspu-bottom-position-exit", "wall-hspu-eccentric", "assisted-wall-hspu-concentric", "partial-wall-hspu", "full-wall-hspu"], "automatic", "planner-core-candidate", "No standard-depth wall HSPU bottom-position exit, eccentric-to-concentric or full-range content exists.", ["wall-hspu-bottom-position-exit", "parallette-wall-hspu"]),
  bridge("bridge-hspu-wall-deficit", graphIds.verticalPushHspu, ["deficit-wall-hspu-bottom-position-exit", "deficit-wall-hspu"], "automatic", "optional-extension", "Deficit wall pressing needs its own reviewed deeper bottom-position exit and pressing content; the standard-depth exit cannot prove this range.", ["deficit-wall-hspu-bottom-position-exit", "deficit-wall-hspu"]),
  bridge("bridge-hspu-freestanding", graphIds.verticalPushHspu, ["freestanding-hspu-eccentric", "partial-freestanding-hspu", "full-freestanding-hspu", "deficit-freestanding-hspu"], "stronger-gated", "optional-extension", "No unassisted freestanding HSPU progression exists.", ["freestanding-parallette-hspu"]),
  bridge("bridge-hspu-ninety-degree", graphIds.verticalPushHspu, ["ninety-degree-hspu"], "specialist", "specialist-optional", "90-degree pressing is optional specialist content.", ["ninety-degree-parallette-hspu"]),

  bridge("bridge-press-foundation", graphIds.pressToHandstand, ["feet-assisted-tuck-press-load"], "automatic", "planner-core-candidate", "The catalogue has capacity seeds but no exact feet-assisted tuck press-loading drill.", ["feet-assisted-tuck-press-load"]),
  bridge("bridge-press-bent-arm-assisted", graphIds.pressToHandstand, ["assisted-bent-arm-tuck-press"], "automatic", "optional-extension", "No assisted bent-arm tuck-press exercise exists; this remains a sibling branch.", ["assisted-bent-arm-tuck-press"]),
  bridge("bridge-press-bent-arm-outcome", graphIds.pressToHandstand, ["full-bent-arm-tuck-press"], "stronger-gated", "optional-extension", "No unassisted bent-arm tuck-press outcome exists.", ["bent-arm-tuck-press-to-handstand"]),
  bridge("bridge-press-straddle-development", graphIds.pressToHandstand, ["assisted-straddle-press", "straddle-press-negative"], "automatic", "planner-core-candidate", "No straight-arm straddle press assistance or negative content exists.", ["assisted-straddle-press-to-handstand", "straddle-press-negative"]),
  bridge("bridge-press-straddle-outcome", graphIds.pressToHandstand, ["full-straddle-press"], "stronger-gated", "optional-extension", "No unassisted full straddle-press outcome exists.", ["straddle-press-to-handstand"]),
  bridge("bridge-press-pike-development", graphIds.pressToHandstand, ["assisted-pike-press", "pike-press-negative"], "automatic", "planner-core-candidate", "No straight-arm pike press assistance or negative content exists.", ["assisted-pike-press-to-handstand", "pike-press-negative"]),
  bridge("bridge-press-pike-outcome", graphIds.pressToHandstand, ["full-pike-press"], "stronger-gated", "optional-extension", "No unassisted full pike-press outcome exists.", ["pike-press-to-handstand"]),
  bridge("bridge-press-specialist", graphIds.pressToHandstand, ["repeated-straddle-presses", "repeated-pike-presses"], "specialist", "specialist-optional", "Repeated straight-arm straddle and pike presses are distinct optional specialist outcomes.", ["repeated-straddle-press-to-handstand", "repeated-pike-press-to-handstand"]),

  bridge("bridge-pushing-deficit", graphIds.parallettePushing, ["deep-deficit-parallette-push-up"], "automatic", "optional-extension", "The current catalogue has no explicit deep-deficit range progression.", ["deficit-parallette-push-up"]),
  bridge("bridge-pushing-forward-load", graphIds.parallettePushing, ["advanced-forward-loaded-push-up"], "stronger-gated", "optional-extension", "Pseudo-planche pressing is the current ceiling for forward-loaded bent-arm work.", ["deep-forward-loaded-parallette-push-up"]),
  bridge("bridge-pushing-specialist", graphIds.parallettePushing, ["full-planche-push-up"], "specialist", "specialist-optional", "The exact full-Planche push-up remains optional specialist content with static full-Planche, forward-loaded pressing and eccentric prerequisites.", ["full-planche-push-up"]),

  bridge("bridge-transition-l-sit-planche", graphIds.transitions, ["l-sit-to-tuck-planche", "tuck-planche-to-l-sit"], "automatic", "planner-core-candidate", "Existing transitions stop at support-to-L-sit and do not connect L-sit and tuck planche in either direction.", ["l-sit-to-tuck-planche-transition", "tuck-planche-to-l-sit-transition"]),
  bridge("bridge-transition-handstand-lower", graphIds.transitions, ["wall-handstand-to-straddle-stand-lower"], "automatic", "planner-core-candidate", "No current exercise defines the exact wall-handstand-to-straddle-stand lowering endpoint.", ["wall-handstand-to-straddle-stand-lower"]),
  bridge("bridge-transition-assisted-press", graphIds.transitions, ["feet-assisted-straddle-press-to-wall-handstand"], "automatic", "planner-core-candidate", "The exact feet-assisted straddle-press-to-wall-handstand connection has no current content or transition protocol.", ["feet-assisted-straddle-press-to-wall-handstand"]),
  bridge("bridge-transition-advanced-press", graphIds.transitions, ["straddle-l-press-handstand", "full-l-pike-press-to-handstand", "handstand-to-l-sit-negative"], "stronger-gated", "optional-extension", "Exact advanced L-sit/press/handstand connections have no current content.", ["straddle-l-press-handstand-transition", "full-l-pike-press-to-handstand-transition", "handstand-to-l-sit-negative"]),
  bridge("bridge-transition-planche-handstand", graphIds.transitions, ["straddle-planche-to-handstand-press"], "stronger-gated", "optional-extension", "No current exercise presses from a demonstrated straddle planche to a stable handstand.", ["straddle-planche-to-handstand-press"]),
  bridge("bridge-transition-specialist", graphIds.transitions, ["full-planche-to-handstand-transition", "ninety-degree-handstand-to-planche-transition"], "specialist", "specialist-optional", "The two exact high-load specialist directions have no current content.", ["full-planche-to-handstand-transition", "ninety-degree-handstand-to-planche-transition"]),
] as const satisfies readonly MissingProgressionBridge[];
