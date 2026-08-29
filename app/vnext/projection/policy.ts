import {
  parseProjectionVersion,
  parseStableId,
  type BenchmarkProtocolId,
  type BenchmarkSubject,
  type MilestoneRef,
  type ReasonCode,
} from "../contracts";
import { benchmarkProtocols } from "../definitions/benchmarks";
import {
  VNEXT_BASE_DEFINITION_VERSION,
  VNEXT_CATALOGUE_VERSION,
  VNEXT_PHASE2_CATALOGUE_VERSION,
  graphIds,
  milestoneBenchmarkId,
  nodeId,
} from "../definitions/ids";
import type { ProjectionPolicy } from "./contracts";

export const VNEXT_PHASE3_PROJECTION_VERSION = parseProjectionVersion(1);
export const VNEXT_PROJECTION_VERSION = parseProjectionVersion(2);

export const reason = (value: string): ReasonCode => parseStableId("reason", value);

export const projectionReasonCodes = {
  unknown: reason("evidence-unknown"),
  estimated: reason("evidence-estimated"),
  developing: reason("evidence-developing"),
  demonstrated: reason("evidence-demonstrated"),
  established: reason("evidence-established"),
  stale: reason("evidence-stale"),
  contradicted: reason("evidence-contradicted"),
  inferredEligibility: reason("mechanical-predecessor-satisfied"),
  activeRestriction: reason("active-restriction"),
  postClearance: reason("post-clearance-reconfirmation"),
  recentHighLoad: reason("recent-high-load"),
  recentDifficultPerformance: reason("recent-difficult-performance"),
  missingEquipment: reason("missing-equipment"),
  staleEvidence: reason("stale-evidence"),
  contradictedEvidence: reason("contradicted-evidence"),
  specialistOptInRequired: reason("specialist-opt-in-required"),
  missingContent: reason("missing-content"),
  prerequisiteMissing: reason("prerequisite-missing"),
  strongerGateNotCurrent: reason("stronger-gate-not-current"),
  eligibleFrontier: reason("eligible-frontier"),
  reconfirmationDue: reason("reconfirmation-due"),
  maintenanceDue: reason("maintenance-due"),
  requestAllowed: reason("trainability-allowed"),
  invalidInput: reason("projection-invalid-input"),
  unsupportedVersion: reason("projection-unsupported-version"),
  duplicateConflict: reason("projection-duplicate-conflict"),
  supersessionInvalid: reason("projection-supersession-invalid"),
  missingTestContext: reason("projection-missing-test-context"),
  protocolMismatch: reason("projection-protocol-mismatch"),
} as const;

const milestone = (graphId: MilestoneRef["graphId"], node: string): MilestoneRef => ({
  graphId,
  nodeId: nodeId(node),
});

const protocol = (graph: string, node: string): BenchmarkProtocolId =>
  milestoneBenchmarkId(graph, node);

const reuse = (
  sourceProtocolId: BenchmarkProtocolId,
  targetProtocolId: BenchmarkProtocolId,
) => ({
  sourceProtocolId,
  sourceProtocolVersion: VNEXT_BASE_DEFINITION_VERSION,
  targetProtocolId,
  targetProtocolVersion: VNEXT_BASE_DEFINITION_VERSION,
});

/**
 * Directional only. The target protocol must accept the same adjudicated facts;
 * sharing an exercise ID alone is deliberately insufficient.
 */
const protocolReuseRules = [
  reuse(protocol("parallette-pushing", "floor-push-up"),
    parseStableId("benchmark", "horizontal-bent-arm-push-horizontal-range")),
  reuse(parseStableId("benchmark", "horizontal-bent-arm-push-horizontal-range"),
    protocol("parallette-pushing", "floor-push-up")),
  reuse(protocol("vertical-push-hspu", "parallette-pike-push-up"),
    parseStableId("benchmark", "vertical-bent-arm-push-deep-pike-control")),
  reuse(parseStableId("benchmark", "vertical-bent-arm-push-deep-pike-control"),
    protocol("vertical-push-hspu", "parallette-pike-push-up")),
  reuse(protocol("planche", "controlled-planche-lean"),
    parseStableId("benchmark", "straight-arm-support-protracted-forward-loading")),
  reuse(protocol("parallette-pushing", "controlled-parallette-push-up"),
    parseStableId("benchmark", "horizontal-bent-arm-push-parallette-range-control")),
] as const;

/**
 * Explicit mechanical implications. These are eligibility conveniences, not
 * synthetic demonstrations. Safety exits, capacities and anyOf alternatives
 * never appear here.
 */
const mechanicalPredecessorRules = [
  {
    stronger: milestone(graphIds.parallettePushing, "floor-push-up"),
    predecessor: milestone(graphIds.parallettePushing, "knee-push-up"),
  },
  {
    stronger: milestone(graphIds.verticalPushHspu, "floor-pike-push-up"),
    predecessor: milestone(graphIds.verticalPushHspu, "shallow-pike-push-up"),
  },
  {
    stronger: milestone(graphIds.lSitVSit, "full-l-sit"),
    predecessor: milestone(graphIds.lSitVSit, "one-leg-l-sit"),
  },
  {
    stronger: milestone(graphIds.handstandBalance, "low-inversion-side-exit"),
    predecessor: milestone(graphIds.handstandBalance, "grounded-side-exit"),
  },
  {
    stronger: milestone(graphIds.handstandBalance, "wall-height-side-exit"),
    predecessor: milestone(graphIds.handstandBalance, "low-inversion-side-exit"),
  },
  {
    stronger: milestone(graphIds.handstandBalance, "consistent-floor-stacked-line"),
    predecessor: milestone(graphIds.handstandBalance, "floor-chest-to-wall-line"),
  },
] as const;

const policyBase = {
  id: "vnext-evidence-projection",
  recentLoadDays: 7,
  highLoadModificationHours: 48,
  difficultPerformanceModificationHours: 48,
  maintenanceAfterDays: 21,
  contradictionMinimumFailures: 2,
  symptomRestrictionDays: 7,
  protocolReuseRules,
  mechanicalPredecessorRules,
} as const;

/** Exact immutable policy used by the completed Phase 3–6 contracts. */
export const vNextProjectionPolicyV1 = {
  ...policyBase,
  version: VNEXT_PHASE3_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [],
} as const satisfies ProjectionPolicy;

const subjectKey = (subject: BenchmarkSubject): string => subject.kind === "milestone"
  ? `milestone:${subject.milestone.graphId}:${subject.milestone.nodeId}`
  : `capacity:${subject.capacity.capacityId}:${subject.capacity.facetId}`;

const unchangedV1Subjects = benchmarkProtocols
  .map((protocol) => protocol.subject)
  .filter((subject, index, all) => all.findIndex((candidate) =>
    subjectKey(candidate) === subjectKey(subject)) === index);

/**
 * Phase 7 changes content availability, not the meaning of any Phase 2
 * milestone or capacity subject. Explicit rules preserve those observations
 * during catalogue-v2 projection; new Phase 7 subjects receive no back-credit.
 */
export const vNextProjectionPolicy = {
  ...policyBase,
  version: VNEXT_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: unchangedV1Subjects.map((subject) => ({
    subject,
    fromCatalogueVersion: VNEXT_PHASE2_CATALOGUE_VERSION,
    toCatalogueVersion: VNEXT_CATALOGUE_VERSION,
  })),
} as const satisfies ProjectionPolicy;
