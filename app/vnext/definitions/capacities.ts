import {
  DOMAIN_SCHEMA_VERSION,
  type CapacityDefinition,
  type CapacityFacet,
  type CapacityFacetId,
  type CapacityId,
  type GraphId,
} from "../contracts";
import {
  VNEXT_BASE_DEFINITION_VERSION,
  capacityBenchmarkId,
  capacityFacetIds,
  capacityIds,
  graphIds,
} from "./ids";

const facet = (
  capacityId: CapacityId,
  id: CapacityFacetId,
  label: string,
  description: string,
): CapacityFacet => ({
  id,
  label,
  description,
  benchmarkProtocolIds: [capacityBenchmarkId(capacityId, id)],
});

const capacity = (
  id: CapacityId,
  label: string,
  description: string,
  sharedGraphIds: readonly GraphId[],
  facets: readonly CapacityFacet[],
): CapacityDefinition => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id,
  definitionVersion: VNEXT_BASE_DEFINITION_VERSION,
  label,
  description,
  facets,
  sharedGraphIds,
});

export const capacityDefinitions = [
  capacity(
    capacityIds.straightArmSupport,
    "Straight-arm support and protraction",
    "Separates tall support, scapular control and forward protracted loading instead of inferring one from another.",
    [graphIds.planche, graphIds.lSitVSit, graphIds.pressToHandstand, graphIds.transitions],
    [
      facet(
        capacityIds.straightArmSupport,
        capacityFacetIds.tallSupport,
        "Tall support",
        "Actively depressed, stable straight-arm support on parallettes.",
      ),
      facet(
        capacityIds.straightArmSupport,
        capacityFacetIds.scapularControl,
        "Scapular control",
        "Controlled scapular motion while the elbows remain straight.",
      ),
      facet(
        capacityIds.straightArmSupport,
        capacityFacetIds.protractedForwardLoading,
        "Protracted forward loading",
        "Active protraction maintained under progressive straight-arm forward load.",
      ),
    ],
  ),
  capacity(
    capacityIds.overheadSupport,
    "Overhead support and elevation",
    "Separates usable shoulder-flexion access, active elevation and stacked loaded support.",
    [graphIds.handstandBalance, graphIds.verticalPushHspu, graphIds.pressToHandstand, graphIds.transitions],
    [
      facet(
        capacityIds.overheadSupport,
        capacityFacetIds.shoulderFlexionAccess,
        "Shoulder-flexion access",
        "Usable pain-free overhead range without compensatory rib flare.",
      ),
      facet(
        capacityIds.overheadSupport,
        capacityFacetIds.activeElevation,
        "Active elevation",
        "Actively elevates the shoulder girdle under a supported pike or overhead load.",
      ),
      facet(
        capacityIds.overheadSupport,
        capacityFacetIds.stackedSupport,
        "Stacked support",
        "Maintains active overhead support in a task-relevant stacked line.",
      ),
    ],
  ),
  capacity(
    capacityIds.horizontalBentArmPush,
    "Horizontal bent-arm push",
    "Tracks clean horizontal range, parallette-specific depth control and repeatable strength.",
    [graphIds.parallettePushing, graphIds.planche],
    [
      facet(
        capacityIds.horizontalBentArmPush,
        capacityFacetIds.horizontalRange,
        "Horizontal range",
        "Controls a full-body horizontal push through an approved pain-free range.",
      ),
      facet(
        capacityIds.horizontalBentArmPush,
        capacityFacetIds.paralletteRangeControl,
        "Parallette range control",
        "Controls neutral-grip parallette depth without shoulder or trunk compensation.",
      ),
      facet(
        capacityIds.horizontalBentArmPush,
        capacityFacetIds.horizontalRepeatableStrength,
        "Repeatable horizontal strength",
        "Repeats clean horizontal pressing under a deliberate tempo.",
      ),
    ],
  ),
  capacity(
    capacityIds.verticalBentArmPush,
    "Vertical bent-arm push",
    "Tracks clean pike range, deeper pike control and repeatable vertical pressing separately.",
    [graphIds.verticalPushHspu, graphIds.pressToHandstand, graphIds.transitions],
    [
      facet(
        capacityIds.verticalBentArmPush,
        capacityFacetIds.pikeRange,
        "Pike range",
        "Controls a shallow pike push through a reproducible range.",
      ),
      facet(
        capacityIds.verticalBentArmPush,
        capacityFacetIds.deepPikeControl,
        "Deep pike control",
        "Controls a deeper parallette pike range without head or shoulder collapse.",
      ),
      facet(
        capacityIds.verticalBentArmPush,
        capacityFacetIds.verticalRepeatableStrength,
        "Repeatable vertical strength",
        "Repeats clean pike pressing while preserving the overhead path.",
      ),
    ],
  ),
  capacity(
    capacityIds.pikeCompression,
    "Pike compression and access",
    "Separates usable pike range from active single-leg and double-leg lift capacity.",
    [graphIds.lSitVSit, graphIds.pressToHandstand, graphIds.transitions],
    [
      facet(
        capacityIds.pikeCompression,
        capacityFacetIds.usablePikeAccess,
        "Usable pike access",
        "Reaches a task-usable pike position without forced range or neural symptoms.",
      ),
      facet(
        capacityIds.pikeCompression,
        capacityFacetIds.activeSingleLegLift,
        "Active single-leg lift",
        "Actively lifts each straight leg from a controlled seated pike.",
      ),
      facet(
        capacityIds.pikeCompression,
        capacityFacetIds.activeDoubleLegLift,
        "Active double-leg lift",
        "Actively lifts both straight legs without rocking or knee bend.",
      ),
    ],
  ),
  capacity(
    capacityIds.straddleCompression,
    "Straddle compression and access",
    "Separates usable straddle range from active straddle lift capacity.",
    [graphIds.lSitVSit, graphIds.pressToHandstand, graphIds.transitions],
    [
      facet(
        capacityIds.straddleCompression,
        capacityFacetIds.usableStraddleAccess,
        "Usable straddle access",
        "Uses a comfortable task-relevant straddle range without forcing adductor or hip range.",
      ),
      facet(
        capacityIds.straddleCompression,
        capacityFacetIds.activeStraddleLift,
        "Active straddle lift",
        "Actively lifts straight straddled legs with controlled trunk position.",
      ),
    ],
  ),
  capacity(
    capacityIds.bodyLineControl,
    "Body-line and trunk control",
    "Separates hollow, arch, integrated body-line and anti-rotation control.",
    [
      graphIds.planche,
      graphIds.lSitVSit,
      graphIds.handstandBalance,
      graphIds.verticalPushHspu,
      graphIds.pressToHandstand,
      graphIds.parallettePushing,
      graphIds.transitions,
    ],
    [
      facet(
        capacityIds.bodyLineControl,
        capacityFacetIds.hollowControl,
        "Hollow control",
        "Maintains posterior pelvic control in a task-relevant hollow position.",
      ),
      facet(
        capacityIds.bodyLineControl,
        capacityFacetIds.archControl,
        "Arch control",
        "Maintains a shallow controlled posterior body-line position.",
      ),
      facet(
        capacityIds.bodyLineControl,
        capacityFacetIds.integratedLine,
        "Integrated body line",
        "Changes between hollow and arch while the body moves as one unit.",
      ),
      facet(
        capacityIds.bodyLineControl,
        capacityFacetIds.antiRotationControl,
        "Anti-rotation control",
        "Maintains shoulder and pelvic alignment under asymmetric support.",
      ),
    ],
  ),
] as const satisfies readonly CapacityDefinition[];

/**
 * Facets normally gate graph eligibility. Arch control is the deliberate
 * exception: it changes body-line accessory selection and dose, but a prone
 * arch benchmark must not become a universal prerequisite for handstand or
 * Planche outcomes.
 */
export const selectionOnlyCapacityFacets = [{
  capacityId: capacityIds.bodyLineControl,
  facetId: capacityFacetIds.archControl,
  reason: "Selects posterior body-line accessories and balances hollow-dominant loading without unlocking a skill node.",
}] as const;

export const capacityDefinitionById = new Map(
  capacityDefinitions.map((definition) => [definition.id, definition] as const),
);
