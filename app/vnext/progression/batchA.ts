/** Immutable Batch A catalogue-v3 overlay. Historical RC.3 retains catalogue v2. */
import {
  DEMAND_DOMAINS, DOMAIN_SCHEMA_VERSION, parseDefinitionVersion, parseProjectionVersion, parseStableId,
  type BenchmarkMetric, type BenchmarkProtocol, type DefinitionBundle, type DemandDomain,
  type DemandLevel, type DemandProfile, type ExerciseDefinition, type GraphId, type PrescriptionTarget,
} from "../contracts";
import { vNextDefinitionBundle, vNextDefinitionBundles } from "../definitions";
import { capacityIds, capacityFacetIds, exerciseId, graphIds, milestoneBenchmarkId, nodeId, prescriptionId, regressionPrescriptionId } from "../definitions/ids";
import { remainingProgressionBridges } from "../definitions/phase7Content";
import { vNextProjectionPolicy, type ProjectionPolicy } from "../projection";

export const BATCH_A_CATALOGUE_VERSION = parseDefinitionVersion(3);
export const BATCH_A_PROJECTION_VERSION = parseProjectionVersion(3);

type Spec = Readonly<{
  bridgeId: string; graphId: GraphId; node: string; exercise: string; name: string;
  description: string; how: string; cues: readonly string[]; avoid: readonly string[];
  safety: readonly string[]; range: string; quality: readonly string[];
  target: PrescriptionTarget; technique: PrescriptionTarget; metric: BenchmarkMetric;
  confirmation: BenchmarkProtocol["confirmation"]; regression: string;
  demand: Partial<Record<DemandDomain, DemandLevel>>;
  capacityLinks: ExerciseDefinition["capacityLinks"];
}>;
const confirm = (count: number, freshnessDays: number): BenchmarkProtocol["confirmation"] => ({
  qualifyingObservations: count, minimumDistinctSessions: count,
  allowedSources: ["guided-test", "session-record"], freshnessDays,
});
const plancheDemand = {
  "hand-wrist-bearing": "high", "forward-straight-arm-upper-limb": "high", "compression-trunk": "high",
} as const;

/** Numeric targets are authored coaching policy, not validated injury/readiness cutoffs. */
export const batchASpecs = [
  {
    bridgeId: "bridge-handstand-stable-balance", graphId: graphIds.handstandBalance,
    node: "stable-longer-parallette-balance", exercise: "parallette-balance-stable-variant",
    name: "Stable Parallette Handstand Balance",
    description: "A longer independent two-arm balance, with repeatable controlled exits. Entry momentum and a lucky save do not count.",
    how: "Enter calmly, settle, then hold the time shown. Use small grip corrections and leave through your planned side exit.",
    cues: ["One attempt per set; time only settled balance", "Push tall through locked arms", "Exit while still in control"],
    avoid: ["Do not count wall contact, walking the bars, entry momentum or an uncontrolled landing"],
    safety: ["Keep both exit paths clear and both exits current.", "Stop for symptoms or a lost exit path."],
    range: "On equal-height non-slip parallettes, accept at least three of five attempts. Each includes a settled unassisted straight two-arm handstand of at least 20 seconds, followed by a controlled planned side exit. Across accepted attempts show both exit sides. No wall, spotter, bar movement or hand release.",
    quality: ["Three complete balance-and-exit chains meet the 20-second hold", "Both side exits are shown under control", "Elbows stay locked; shoulders stay elevated; corrections remain small"],
    target: { kind: "quality", description: "One settled 20-second balance and controlled side exit per set" }, technique: { kind: "quality", description: "One controlled 5-second balance and side exit per set; below benchmark" },
    metric: { kind: "successful-attempts", minimumSuccessful: 3, maximumAttempts: 5 },
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.stackedSupport] }],
    confirmation: confirm(3, 30), regression: "parallette-balance-repeatable-variant",
    demand: { "hand-wrist-bearing": "high", "overhead-straight-arm-upper-limb": "high", "inversion-technical": "high" },
  },
  {
    bridgeId: "bridge-planche-one-leg-outcome", graphId: graphIds.planche,
    node: "one-leg-planche", exercise: "one-leg-planche-hold", name: "One-Leg Planche Hold",
    description: "Removes assistance from each side independently; an assisted toe or one strong side is insufficient.",
    how: "From tuck Planche, extend one leg in line with your trunk and hold the time shown. Return to tuck, land, rest, then change sides.",
    cues: ["Lock the elbows and push the bars away", "Keep hips square and both feet clear", "Alternate sides each set"],
    avoid: ["Do not touch a wall, rest a knee on an arm, twist or kick into the hold"],
    safety: ["Return to tuck before shoulder or elbow control fades.", "Stop for symptoms or slipping bars."],
    range: "Four attempts, two per side. At least one accepted five-second hold per side: the extended knee is locked, heel/hip/shoulder stay approximately horizontal, the other leg stays tucked without knee-to-arm support, and both feet remain clear. Return to tuck and land under control; no external assistance.",
    quality: ["One five-second hold is accepted on each side", "Shoulders stay forward, elbows locked and upper back actively protracted", "Pelvis stays square with no foot contact or knee support"],
    target: { kind: "quality", description: "One 5-second hold per set; alternate sides" }, technique: { kind: "quality", description: "One 2-second hold per set; alternate sides; below benchmark" },
    metric: { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 4 },
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
    confirmation: confirm(3, 60), regression: "assisted-one-leg-planche-hold", demand: plancheDemand,
  },
  {
    bridgeId: "bridge-planche-straddle-outcome", graphId: graphIds.planche,
    node: "stable-straddle-planche", exercise: "straddle-planche-hold", name: "Straddle Planche Hold",
    description: "A sustained unassisted straddle Planche, distinct from an assisted shape or a grounded lean.",
    how: "From tuck Planche, open both straight legs evenly into a comfortable straddle. Hold the time shown, return to tuck and land softly.",
    cues: ["Push the bars away with locked elbows", "Keep trunk and hips level", "Open both legs evenly"],
    avoid: ["Do not force the straddle, pike the hips, bend the knees or use a wall"],
    safety: ["Use only a comfortable straddle and return to tuck before control fades.", "Stop for symptoms or slipping bars."],
    range: "Hold eight continuous seconds with locked elbows, straight knees and a symmetric comfortable straddle; shoulder/hip/heel line remains approximately horizontal in side view. Both feet remain clear without external assistance. Enter from tuck and return to tuck before a controlled landing.",
    quality: ["The horizontal straddle shape is sustained for the full hold", "Elbows stay locked with active protraction", "No wall, knee support, pike, sag or foot contact; exit stays controlled"],
    target: { kind: "duration-seconds", minimum: 8, maximum: 10 }, technique: { kind: "duration-seconds", minimum: 3, maximum: 4 },
    metric: { kind: "duration-seconds", minimum: 8 }, confirmation: confirm(3, 60),
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
    regression: "assisted-straddle-planche-hold", demand: plancheDemand,
  },
  {
    bridgeId: "bridge-v-sit-outcome", graphId: graphIds.lSitVSit,
    node: "stable-v-sit", exercise: "v-sit-hold", name: "V-Sit Hold",
    description: "A stable unassisted V with straight legs at least 60 degrees above horizontal, distinct from the partial-V preparation.",
    how: "Press tall from L-sit and raise both straight legs to at least 60 degrees above horizontal. Hold the time shown, then lower without swinging.",
    cues: ["Keep both knees straight and together", "Lift through compression", "Keep the trunk upright over the hands"],
    avoid: ["Do not lean back, bounce, bend the knees or touch a wall"],
    safety: ["Lower to partial V before wrist, shoulder or hip control fades.", "Stop for symptoms; never force the range."],
    range: "Hold eight continuous seconds with both straight legs together at least 60 degrees above horizontal, elbows locked, shoulders pressed tall and feet clear. Keep the torso upright without backward recoil, wall or spotter assistance. Lower continuously to L-sit and a controlled landing.",
    quality: ["Both knees remain locked at or above the 60-degree side-view landmark", "Tall support and upright torso persist without backward recoil", "No assistance, swing or momentary peak; lower under control"],
    target: { kind: "duration-seconds", minimum: 8, maximum: 10 }, technique: { kind: "duration-seconds", minimum: 3, maximum: 4 },
    metric: { kind: "duration-seconds", minimum: 8 }, confirmation: confirm(2, 60), regression: "partial-v-sit-hold",
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.tallSupport] }, { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] }],
    demand: { "hand-wrist-bearing": "high", "compression-trunk": "high" },
  },
  {
    bridgeId: "bridge-pushing-forward-load", graphId: graphIds.parallettePushing,
    node: "advanced-forward-loaded-push-up", exercise: "deep-forward-loaded-parallette-push-up",
    name: "Advanced Forward-Loaded Push-Up",
    description: "Reproducible forward-loaded bent-arm pushing with grounded toes. This is not a static Planche or a feet-clear Planche push-up.",
    how: "Mark your toe position. Keep shoulders a hand-length ahead of the grips, lower for three seconds to elbow height, then press to locked arms for the reps shown.",
    cues: ["Keep the same lean and toe marks", "Move trunk and hips together", "Press fully without shifting back"],
    avoid: ["Do not count a shorter lean, sagging hips, bouncing or a partial press"],
    safety: ["Use a comfortable depth; regress if the marked lean cannot be controlled.", "Stop for wrist, elbow or shoulder symptoms."],
    range: "Four controlled repetitions on equal-height parallettes with toes grounded at the same marked position. In side view shoulders remain at least one of the athlete's hand-lengths ahead of the grip centres throughout. Lower for at least three seconds until shoulders reach elbow height, then return to locked elbows without changing the lean, foot position or straight trunk line. No added below-elbow deficit is required.",
    quality: ["All four reps keep the marked toe position and shoulder lead", "Each descent lasts at least three seconds and reaches shoulder-to-elbow depth", "Every press returns to lockout without shifting back, bouncing or sagging"],
    target: { kind: "repetitions", minimum: 4, maximum: 5 }, technique: { kind: "repetitions", minimum: 1, maximum: 2 },
    metric: { kind: "repetitions", minimum: 4 }, confirmation: confirm(2, 60), regression: "pseudo-planche-parallette-pushup",
    capacityLinks: [{ capacityId: capacityIds.horizontalBentArmPush, facetIds: [capacityFacetIds.horizontalRepeatableStrength] }],
    demand: { "hand-wrist-bearing": "high", "forward-straight-arm-upper-limb": "high", "horizontal-bent-arm-push": "high", "compression-trunk": "moderate" },
  },
] as const satisfies readonly Spec[];

const dense = (spec: Spec): DemandProfile => Object.fromEntries(DEMAND_DOMAINS.map((domain) => [domain, spec.demand[domain] ?? "low"])) as DemandProfile;
const equipment = [parseStableId("equipment", "parallettes"), parseStableId("equipment", "floor")];
const version = parseDefinitionVersion(1);
export const batchAExercises: readonly ExerciseDefinition[] = batchASpecs.map((spec) => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: exerciseId(spec.exercise), definitionVersion: version,
  lifecycle: "active", name: spec.name, description: spec.description,
  instructions: { how: spec.how, cues: spec.cues, avoid: spec.avoid },
  media: [{ kind: "motion", reference: spec.exercise, description: `${spec.name}: complete entry, target and controlled exit` }],
  equipment, roles: ["outcome-milestone", "benchmark-test", "development-drill"],
  graphLinks: [{ graphId: spec.graphId, nodeId: nodeId(spec.node), contribution: "milestone" }], capacityLinks: spec.capacityLinks,
  prescriptionVariants: [
    { id: prescriptionId(spec.exercise), label: "Standard — controlled practice", target: spec.target, range: spec.range, demand: dense(spec) },
    { id: regressionPrescriptionId(spec.exercise), label: "Technique — reduced dose", target: spec.technique,
      range: `${spec.range} Reduced practice dose only; this variant cannot confirm the milestone.`, demand: dense(spec) },
  ],
  benchmarkProtocolIds: [milestoneBenchmarkId(spec.graphId, spec.node)],
  relations: [{ kind: "regression", targetExerciseId: exerciseId(spec.regression), fromPrescriptionVariantId: prescriptionId(spec.exercise), targetPrescriptionVariantId: prescriptionId(spec.regression) }],
  safetyNotes: spec.safety,
}));
export const batchAProtocols: readonly BenchmarkProtocol[] = batchASpecs.map((spec) => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: milestoneBenchmarkId(spec.graphId, spec.node), definitionVersion: version,
  label: spec.name, subject: { kind: "milestone", milestone: { graphId: spec.graphId, nodeId: nodeId(spec.node) } },
  exerciseId: exerciseId(spec.exercise), prescriptionVariantId: prescriptionId(spec.exercise),
  conditions: { equipment, assistance: "No wall, spotter or external assistance. Only the push-up retains grounded toes.", range: spec.range },
  metric: spec.metric, qualityCriteria: spec.quality, safetyCriteria: spec.safety, confirmation: spec.confirmation,
}));
const deliveries = new Map(batchASpecs.map((spec) => [`${spec.graphId}:${spec.node}`, spec]));
export const batchADefinitionBundle: DefinitionBundle = {
  ...vNextDefinitionBundle, catalogueVersion: BATCH_A_CATALOGUE_VERSION,
  exercises: [...vNextDefinitionBundle.exercises, ...batchAExercises],
  benchmarkProtocols: [...vNextDefinitionBundle.benchmarkProtocols, ...batchAProtocols],
  graphs: vNextDefinitionBundle.graphs.map((graph) => ({
    ...graph, definitionVersion: BATCH_A_CATALOGUE_VERSION,
    nodes: graph.nodes.map((node) => deliveries.has(`${graph.id}:${node.id}`)
      ? { ...node, implementationStatus: "available", benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)] }
      : node),
  })),
};
export const batchADefinitionHistory = [...vNextDefinitionBundles, batchADefinitionBundle] as const;
export const batchARemainingBridges = remainingProgressionBridges.filter((bridge) => !batchASpecs.some((spec) => spec.bridgeId === bridge.id));
const subjectKey = (subject: BenchmarkProtocol["subject"]) => JSON.stringify(subject);
const unchangedSubjects = vNextDefinitionBundle.benchmarkProtocols.map((protocol) => protocol.subject)
  .filter((subject, index, all) => all.findIndex((other) => subjectKey(subject) === subjectKey(other)) === index);
export const batchAProjectionPolicy: ProjectionPolicy = {
  ...vNextProjectionPolicy, version: BATCH_A_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [
    ...vNextProjectionPolicy.subjectVersionCompatibilityRules,
    ...vNextProjectionPolicy.subjectVersionCompatibilityRules.map((rule) => ({ ...rule, toCatalogueVersion: BATCH_A_CATALOGUE_VERSION })),
    ...unchangedSubjects.map((subject) => ({ subject, fromCatalogueVersion: vNextDefinitionBundle.catalogueVersion, toCatalogueVersion: BATCH_A_CATALOGUE_VERSION })),
  ],
};
