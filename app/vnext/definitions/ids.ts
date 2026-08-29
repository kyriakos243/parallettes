import {
  parseDefinitionVersion,
  parseStableId,
  type BenchmarkProtocolId,
  type BranchId,
  type CapacityFacetId,
  type CapacityId,
  type ExerciseId,
  type GraphId,
  type NodeId,
  type PrescriptionVariantId,
} from "../contracts";

/** Immutable catalogue used by the completed Phase 2–6 shadow contracts. */
export const VNEXT_PHASE2_CATALOGUE_VERSION = parseDefinitionVersion(1);

/**
 * Unchanged Phase 2 definitions retain their original per-definition version
 * when they are reused by a later catalogue. New Phase 7 definitions also
 * begin at definition version 1; the enclosing catalogue records when they
 * became available.
 */
export const VNEXT_BASE_DEFINITION_VERSION = parseDefinitionVersion(1);

/** Current additive catalogue. Catalogue v1 remains exported for replay. */
export const VNEXT_CATALOGUE_VERSION = parseDefinitionVersion(2);

/**
 * The vNext adapter reads the approved v1.2 catalogue, so its complete source
 * fingerprint is part of the definition version. A source edit must fail the
 * Phase 2 gate until a new vNext catalogue version and fingerprint entry are
 * reviewed together; updating a checksum in place would rewrite history.
 */
export const VNEXT_SOURCE_CATALOGUE_FINGERPRINTS = {
  1: "2056ad42b75c2cd8ddaa121d3cfad8b57704c3830176505ef5d963729940ab32",
} as const satisfies Readonly<Record<number, string>>;

/**
 * Canonical hash of the complete Phase 2 semantic payload: the public
 * definition bundle plus capacity-selection policy, catalogue identity policy
 * and missing-content registry. Any semantic edit must introduce a new
 * catalogue version; replacing this value in place would rewrite version 1.
 */
export const VNEXT_PHASE2_SEMANTIC_FINGERPRINTS = {
  1: "9e527995d9579c7a0981c8312952e7f9496a4cc178349d0a68d4a409b6a7cdf8",
} as const satisfies Readonly<Record<number, string>>;

/**
 * Canonical hash of the complete Phase 7 semantic payload. Any later semantic
 * edit must introduce a new catalogue version; replacing this value in place
 * would rewrite catalogue version 2.
 */
export const VNEXT_PHASE7_SEMANTIC_FINGERPRINTS = {
  2: "184a1876347db920edd0c555af0f2aec634b553a6caa19118d53e389ef03a4e4",
} as const satisfies Readonly<Record<number, string>>;

export const graphIds = {
  planche: parseStableId("graph", "planche"),
  lSitVSit: parseStableId("graph", "l-sit-v-sit"),
  handstandBalance: parseStableId("graph", "handstand-balance"),
  verticalPushHspu: parseStableId("graph", "vertical-push-hspu"),
  pressToHandstand: parseStableId("graph", "press-to-handstand"),
  parallettePushing: parseStableId("graph", "parallette-pushing"),
  transitions: parseStableId("graph", "transitions"),
} as const satisfies Record<string, GraphId>;

export const capacityIds = {
  straightArmSupport: parseStableId("capacity", "straight-arm-support"),
  overheadSupport: parseStableId("capacity", "overhead-support"),
  horizontalBentArmPush: parseStableId("capacity", "horizontal-bent-arm-push"),
  verticalBentArmPush: parseStableId("capacity", "vertical-bent-arm-push"),
  pikeCompression: parseStableId("capacity", "pike-compression"),
  straddleCompression: parseStableId("capacity", "straddle-compression"),
  bodyLineControl: parseStableId("capacity", "body-line-control"),
} as const satisfies Record<string, CapacityId>;

export const capacityFacetIds = {
  tallSupport: parseStableId("capacity-facet", "tall-support"),
  scapularControl: parseStableId("capacity-facet", "scapular-control"),
  protractedForwardLoading: parseStableId("capacity-facet", "protracted-forward-loading"),
  shoulderFlexionAccess: parseStableId("capacity-facet", "shoulder-flexion-access"),
  activeElevation: parseStableId("capacity-facet", "active-elevation"),
  stackedSupport: parseStableId("capacity-facet", "stacked-support"),
  horizontalRange: parseStableId("capacity-facet", "horizontal-range"),
  paralletteRangeControl: parseStableId("capacity-facet", "parallette-range-control"),
  horizontalRepeatableStrength: parseStableId("capacity-facet", "horizontal-repeatable-strength"),
  pikeRange: parseStableId("capacity-facet", "pike-range"),
  deepPikeControl: parseStableId("capacity-facet", "deep-pike-control"),
  verticalRepeatableStrength: parseStableId("capacity-facet", "vertical-repeatable-strength"),
  usablePikeAccess: parseStableId("capacity-facet", "usable-pike-access"),
  activeSingleLegLift: parseStableId("capacity-facet", "active-single-leg-lift"),
  activeDoubleLegLift: parseStableId("capacity-facet", "active-double-leg-lift"),
  usableStraddleAccess: parseStableId("capacity-facet", "usable-straddle-access"),
  activeStraddleLift: parseStableId("capacity-facet", "active-straddle-lift"),
  hollowControl: parseStableId("capacity-facet", "hollow-control"),
  archControl: parseStableId("capacity-facet", "arch-control"),
  integratedLine: parseStableId("capacity-facet", "integrated-line"),
  antiRotationControl: parseStableId("capacity-facet", "anti-rotation-control"),
} as const satisfies Record<string, CapacityFacetId>;

export const graphId = (value: string): GraphId => parseStableId("graph", value);
export const nodeId = (value: string): NodeId => parseStableId("node", value);
export const branchId = (value: string): BranchId => parseStableId("branch", value);
export const exerciseId = (value: string): ExerciseId => parseStableId("exercise", value);
export const prescriptionId = (value: string): PrescriptionVariantId =>
  parseStableId("prescription", `${value}-standard`);
export const regressionPrescriptionId = (value: string): PrescriptionVariantId =>
  parseStableId("prescription", `${value}-regressed`);
export const milestoneBenchmarkId = (graph: string, node: string): BenchmarkProtocolId =>
  parseStableId("benchmark", `${graph}-${node}`);
export const capacityBenchmarkId = (capacity: string, facet: string): BenchmarkProtocolId =>
  parseStableId("benchmark", `${capacity}-${facet}`);
