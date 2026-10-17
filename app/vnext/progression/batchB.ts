/** Isolated catalogue-v4 candidate. Production remains on accepted Batch A/v3. */
import {
  DEMAND_DOMAINS, DOMAIN_SCHEMA_VERSION, parseDefinitionVersion, parseProjectionVersion, parseStableId,
  type BenchmarkMetric, type BenchmarkProtocol, type DefinitionBundle, type DemandDomain,
  type DemandLevel, type DemandProfile, type ExerciseDefinition, type GraphId, type PrescriptionTarget,
} from "../contracts";
import { capacityIds, capacityFacetIds, exerciseId, graphIds, milestoneBenchmarkId, nodeId, prescriptionId, regressionPrescriptionId } from "../definitions/ids";
import { batchADefinitionBundle, batchADefinitionHistory, batchAProjectionPolicy, batchARemainingBridges } from "./batchA";
import type { ProjectionPolicy } from "../projection";

export const BATCH_B_CATALOGUE_VERSION = parseDefinitionVersion(4);
export const BATCH_B_PROJECTION_VERSION = parseProjectionVersion(4);
type Spec = Readonly<{
  bridgeId: string; graphId: GraphId; node: string; exercise: string; name: string;
  description: string; how: string; cues: readonly string[]; avoid: readonly string[];
  safety: readonly string[]; equipment: readonly string[]; assistance: string; range: string;
  quality: readonly string[]; target: PrescriptionTarget; technique: PrescriptionTarget;
  techniqueRange: string; practiceRange?: string; metric: BenchmarkMetric; confirmation: BenchmarkProtocol["confirmation"];
  regression: string; demand: Partial<Record<DemandDomain, DemandLevel>>;
  capacityLinks: ExerciseDefinition["capacityLinks"];
}>;
const confirm: BenchmarkProtocol["confirmation"] = {
  qualifyingObservations: 3, minimumDistinctSessions: 3,
  allowedSources: ["guided-test", "session-record"], freshnessDays: 60,
};
const plancheDemand = { "hand-wrist-bearing": "high", "forward-straight-arm-upper-limb": "high", "compression-trunk": "high" } as const;
const pressDemand = { "hand-wrist-bearing": "high", "forward-straight-arm-upper-limb": "moderate", "overhead-straight-arm-upper-limb": "high", "inversion-technical": "high", "compression-trunk": "high" } as const;
const noAssistance = "No wall, spotter, band, head support or external assistance. Ground contact is only the stationary starting position and the separate landing; no jump, kick or toe propulsion.";
const pressTarget: PrescriptionTarget = { kind: "quality", description: "One controlled press to a 2-second unassisted handstand, then a separate trained exit; reset from the floor each set" };
const pressTechnique: PrescriptionTarget = { kind: "quality", description: "One controlled press attempt; exit before control fades; below benchmark and no top hold required" };
const pressMetric: BenchmarkMetric = { kind: "successful-attempts", minimumSuccessful: 2, maximumAttempts: 4 };

/** Exact thresholds are authored coaching/product policy, not validated readiness or injury cutoffs. */
export const batchBSpecs = [
  {
    bridgeId: "bridge-planche-full-assisted", graphId: graphIds.planche,
    node: "assisted-full-planche", exercise: "assisted-full-planche-hold", name: "Wall-Assisted Full Planche Hold",
    description: "Full-length, legs-together Planche exposure with explicit wall assistance. The contact does not measure how much load the wall removes.",
    how: "Mark the bar position and equal-height toe contacts. From tuck, extend both straight legs together to the wall, hold the time shown, then return to tuck and land.",
    cues: ["Lock both elbows and push the bars away", "Keep shoulders, hips and heels level", "Keep the same toe contact; no wall launch"],
    avoid: ["Do not hide wall assistance, bend the knees, sag or increase pressure to rescue the hold"],
    safety: ["Use non-slip bars and a secure wall with a clear landing.", "Return to tuck before symptoms, slipping or loss of shoulder control."],
    equipment: ["parallettes", "floor", "wall"],
    assistance: "Both toes use marked equal-height contact on the wall behind the athlete; keep the same marked bar-to-wall distance. Wall reaction/friction provides unquantified assistance. No kick, wall launch or increasing pressure to rescue the hold; never credit it as unassisted.",
    range: "Hold six continuous seconds in a legs-together full-length shape with locked knees and elbows, active protraction and an approximately horizontal shoulder/hip/heel line. Both toes retain their marked wall contact, with no other support. Enter from tuck, return to tuck and land under control.",
    quality: ["The six-second full-length lever is visible, with straight knees together", "Elbows stay locked and upper back actively protracted", "Marked contact and bar position remain unchanged; entry and return stay controlled"],
    target: { kind: "duration-seconds", minimum: 6, maximum: 8 }, technique: { kind: "duration-seconds", minimum: 2, maximum: 3 },
    techniqueRange: "Use the same marked wall-assisted full-length shape for two to three seconds, then return to tuck and land; below the six-second benchmark.",
    metric: { kind: "duration-seconds", minimum: 6 }, confirmation: { ...confirm, qualifyingObservations: 2, minimumDistinctSessions: 2 }, regression: "straddle-planche-hold", demand: plancheDemand,
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
  },
  {
    bridgeId: "bridge-planche-full-outcome", graphId: graphIds.planche,
    node: "full-planche", exercise: "full-planche-hold", name: "Full Planche Hold",
    description: "An unassisted straight-arm, legs-together full Planche. Assisted lever work does not prove this outcome.",
    how: "From tuck Planche, extend both straight legs together, hold the time shown, then close to tuck and land softly.",
    cues: ["Lean with locked elbows and active protraction", "Keep knees straight and feet together", "Return to tuck before the line fades"],
    avoid: ["Do not count a straddle, pike, bent knee, bent elbow, wall contact or momentary swing"],
    safety: ["Use non-slip equal-height bars and a clear landing.", "Stop for symptoms or loss of elbow, shoulder or trunk control."],
    equipment: ["parallettes", "floor"], assistance: noAssistance,
    range: "Hold five continuous seconds with both straight legs together and feet clear, elbows locked and upper back protracted. Shoulder, hip and heel line stays approximately horizontal without pike, sag, straddle or any external support. Enter from tuck, return to tuck and land under control.",
    quality: ["The full-length feet-clear shape persists for five seconds", "Knees and elbows stay locked; feet stay together", "No assistance, momentum or lever shortening; the return remains controlled"],
    target: { kind: "duration-seconds", minimum: 5, maximum: 7 }, technique: { kind: "duration-seconds", minimum: 2, maximum: 3 },
    techniqueRange: "Use the same unassisted legs-together full-length shape for two to three seconds, then return to tuck and land; below the five-second benchmark.",
    metric: { kind: "duration-seconds", minimum: 5 }, confirmation: confirm, regression: "assisted-full-planche-hold", demand: plancheDemand,
    capacityLinks: [{ capacityId: capacityIds.straightArmSupport, facetIds: [capacityFacetIds.protractedForwardLoading] }],
  },
  {
    bridgeId: "bridge-press-bent-arm-outcome", graphId: graphIds.pressToHandstand,
    node: "full-bent-arm-tuck-press", exercise: "bent-arm-tuck-press-to-handstand", name: "Bent-Arm Tuck Press to Handstand",
    description: "A grounded-start unassisted bent-arm tuck press. This sibling branch proves neither straight-arm pressing nor an L-sit transition.",
    how: "From a still compact crouch holding the bars, shift forward without jumping. Lift through a tucked bent-arm path, press to locked elbows, extend into handstand and settle for two seconds; exit separately.",
    cues: ["Keep the tuck compact as hips rise", "Keep the head clear of floor and bars", "Press fully before opening into the straight top"],
    avoid: ["Do not kick, rest knees on arms, load the head or use a wall catch"],
    safety: ["Use your current trained inversion exit and keep its landing clear.", "End the attempt before the head path, elbow control or exit becomes uncertain; stop for symptoms."],
    equipment: ["parallettes", "floor"], assistance: noAssistance,
    range: "Across up to four separate floor-reset attempts, accept at least two continuous presses from a still compact crouch: both feet lift without jumping or toe propulsion, elbows visibly bend while the tucked hips rise, then press fully to locked elbows and extend to a straight unassisted two-arm handstand held for two seconds. Knees never rest on arms and the head never bears load. Scoring ends at the settled top; use a separate trained exit. This is not a feet-clear L-sit start or repeated connected press set.",
    quality: ["At least two complete presses meet the distinct bent-arm tuck path", "No jump, head load, knee support, wall or spotter contact", "Each top is straight, locked-arm and independently settled for two seconds"],
    target: pressTarget, technique: pressTechnique,
    practiceRange: "One continuous grounded-start unassisted bent-arm tuck press per set, with a two-second locked-arm straight handstand and a separate trained exit. Reset from the floor and follow the timer for rest; the full benchmark attempt series is a separate test.",
    techniqueRange: "From the same stationary crouch, attempt the unassisted bent-arm tuck path only while head clearance and the trained exit remain controlled. No top hold is required; this attempt cannot confirm the benchmark.",
    metric: pressMetric, confirmation: confirm, regression: "assisted-bent-arm-tuck-press",
    demand: { ...pressDemand, "vertical-bent-arm-push": "high" },
    capacityLinks: [{ capacityId: capacityIds.verticalBentArmPush, facetIds: [capacityFacetIds.deepPikeControl] }],
  },
  {
    bridgeId: "bridge-press-straddle-outcome", graphId: graphIds.pressToHandstand,
    node: "full-straddle-press", exercise: "straddle-press-to-handstand", name: "Straight-Arm Straddle Press to Handstand",
    description: "An unassisted press from a grounded straddle. Negative, assisted and later straddle-L transition outcomes remain distinct.",
    how: "Start still with straight legs in a comfortable grounded straddle. Shift over locked arms and raise the hips before closing the legs into handstand. Settle for two seconds and exit separately.",
    cues: ["Keep elbows and knees straight throughout", "Let hips rise before closing the straddle", "Press tall into the quiet unassisted top"],
    avoid: ["Do not jump, bend the elbows, force the straddle or touch a wall"],
    safety: ["Use a comfortable straddle and a current trained inversion exit with a clear landing.", "Stop for symptoms, lost elbow lock or an uncontrolled ascent; do not force range."],
    equipment: ["parallettes", "floor"], assistance: noAssistance,
    range: "Across up to four separate floor-reset attempts, accept at least two continuous presses from a stationary grounded straddle. Both knees and elbows remain locked; the feet lift by controlled weight shift without jump or toe propulsion. Hips rise above shoulders before straight legs close into an unassisted straight two-arm handstand held for two seconds. Scoring ends at the settled top; exit separately. No L-sit start, wall contact or repeated connected presses are credited.",
    quality: ["At least two complete straight-arm straddle ascents are accepted", "Knees stay locked; the straddle remains comfortable until hip stack", "No assistance or jump; each straight handstand settles for two seconds"],
    target: pressTarget, technique: pressTechnique,
    practiceRange: "One continuous grounded-start unassisted straight-arm straddle press per set, with locked knees, hip stack before leg closure, a two-second straight handstand and a separate trained exit. Reset from the floor and follow the timer for rest; the full benchmark attempt series is a separate test.",
    techniqueRange: "From the same stationary straight-knee straddle, attempt the unassisted locked-arm path only while compression, elbow lock and the trained exit remain controlled. No top hold is required; this attempt cannot confirm the benchmark.",
    metric: pressMetric, confirmation: confirm, regression: "assisted-straddle-press-to-handstand", demand: pressDemand,
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.activeElevation] }, { capacityId: capacityIds.straddleCompression, facetIds: [capacityFacetIds.activeStraddleLift] }],
  },
  {
    bridgeId: "bridge-press-pike-outcome", graphId: graphIds.pressToHandstand,
    node: "full-pike-press", exercise: "pike-press-to-handstand", name: "Straight-Arm Pike Press to Handstand",
    description: "An unassisted feet-together pike press from the floor, without treating straddle or negative evidence as a concentric pike press.",
    how: "From a still grounded pike with legs together, shift over locked arms and lift the hips. Keep both legs straight and together as they rise into handstand. Settle for two seconds and exit separately.",
    cues: ["Keep both knees locked and legs together", "Raise hips before unfolding the pike", "Push tall through straight arms"],
    avoid: ["Do not jump, straddle, bend elbows or knees, or use a wall catch"],
    safety: ["Use current pike access and a trained inversion exit with a clear landing.", "Stop for symptoms or compensating range; never force the hamstrings or shoulder position."],
    equipment: ["parallettes", "floor"], assistance: noAssistance,
    range: "Across up to four separate floor-reset attempts, accept at least two continuous presses from a stationary grounded feet-together pike. Knees and elbows stay locked and legs remain together from liftoff through the complete ascent. Feet lift without jump or toe propulsion as hips rise above shoulders, then straight legs unfold into an unassisted straight two-arm handstand held for two seconds. Scoring ends at the settled top; exit separately. No straddle, L-sit start, wall contact or repeated connected presses are credited.",
    quality: ["At least two complete together-leg straight-arm ascents are accepted", "Knees and elbows stay locked; no straddle or momentum", "Each unassisted straight handstand settles for two seconds"],
    target: pressTarget, technique: pressTechnique,
    practiceRange: "One continuous grounded-start unassisted straight-arm feet-together pike press per set, with locked knees, a two-second straight handstand and a separate trained exit. Reset from the floor and follow the timer for rest; the full benchmark attempt series is a separate test.",
    techniqueRange: "From the same stationary straight-knee feet-together pike, attempt the unassisted locked-arm path only while compression, elbow lock and the trained exit remain controlled. No top hold is required; this attempt cannot confirm the benchmark.",
    metric: pressMetric, confirmation: confirm, regression: "assisted-pike-press-to-handstand", demand: pressDemand,
    capacityLinks: [{ capacityId: capacityIds.overheadSupport, facetIds: [capacityFacetIds.activeElevation] }, { capacityId: capacityIds.pikeCompression, facetIds: [capacityFacetIds.activeDoubleLegLift] }],
  },
] as const satisfies readonly Spec[];

const dense = (s: Spec): DemandProfile => Object.fromEntries(DEMAND_DOMAINS.map(d => [d, s.demand[d] ?? "low"])) as DemandProfile;
const equipmentFor = (s: Spec) => s.equipment.map(id => parseStableId("equipment", id));
const version = parseDefinitionVersion(1);
export const batchBExercises: readonly ExerciseDefinition[] = batchBSpecs.map((s: Spec) => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: exerciseId(s.exercise), definitionVersion: version,
  lifecycle: "active", name: s.name, description: s.description,
  instructions: { how: s.how, cues: s.cues, avoid: s.avoid },
  media: [{ kind: "motion", reference: s.exercise, description: `${s.name}: complete entry, target and separate controlled exit` }],
  equipment: equipmentFor(s), roles: ["outcome-milestone", "benchmark-test", "development-drill"],
  graphLinks: [{ graphId: s.graphId, nodeId: nodeId(s.node), contribution: "milestone" }], capacityLinks: s.capacityLinks,
  prescriptionVariants: [
    { id: prescriptionId(s.exercise), label: s.target.kind === "duration-seconds" ? `Hold ${s.target.minimum}–${s.target.maximum} seconds` : "One controlled press", target: s.target, range: s.practiceRange ?? s.range, demand: dense(s) },
    { id: regressionPrescriptionId(s.exercise), label: s.technique.kind === "duration-seconds" ? "Short controlled hold" : "One controlled attempt", target: s.technique, range: s.techniqueRange, demand: dense(s) },
  ],
  benchmarkProtocolIds: [milestoneBenchmarkId(s.graphId, s.node)],
  relations: [{ kind: "regression", targetExerciseId: exerciseId(s.regression), fromPrescriptionVariantId: prescriptionId(s.exercise), targetPrescriptionVariantId: prescriptionId(s.regression) }],
  safetyNotes: s.safety,
}));
export const batchBProtocols: readonly BenchmarkProtocol[] = batchBSpecs.map(s => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: milestoneBenchmarkId(s.graphId, s.node), definitionVersion: version,
  label: s.name, subject: { kind: "milestone", milestone: { graphId: s.graphId, nodeId: nodeId(s.node) } },
  exerciseId: exerciseId(s.exercise), prescriptionVariantId: prescriptionId(s.exercise),
  conditions: { equipment: equipmentFor(s), assistance: s.assistance, range: s.range },
  metric: s.metric, qualityCriteria: s.quality, safetyCriteria: s.safety, confirmation: s.confirmation,
}));
const deliveries = new Map(batchBSpecs.map(s => [`${s.graphId}:${s.node}`, s]));
export const batchBDefinitionBundle: DefinitionBundle = {
  ...batchADefinitionBundle, catalogueVersion: BATCH_B_CATALOGUE_VERSION,
  exercises: [...batchADefinitionBundle.exercises, ...batchBExercises],
  benchmarkProtocols: [...batchADefinitionBundle.benchmarkProtocols, ...batchBProtocols],
  graphs: batchADefinitionBundle.graphs.map(graph => ({
    ...graph, definitionVersion: BATCH_B_CATALOGUE_VERSION,
    nodes: graph.nodes.map(node => deliveries.has(`${graph.id}:${node.id}`)
      ? { ...node, implementationStatus: "available", benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)] } : node),
  })),
};
export const batchBDefinitionHistory = [...batchADefinitionHistory, batchBDefinitionBundle] as const;
export const batchBRemainingBridges = batchARemainingBridges.filter(b => !batchBSpecs.some(s => s.bridgeId === b.id));
const subjectKey = (s: BenchmarkProtocol["subject"]) => JSON.stringify(s);
const oldSubjects = batchADefinitionBundle.benchmarkProtocols.map(p => p.subject)
  .filter((s, i, all) => all.findIndex(other => subjectKey(s) === subjectKey(other)) === i);
export const batchBProjectionPolicy: ProjectionPolicy = {
  ...batchAProjectionPolicy, version: BATCH_B_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [
    ...batchAProjectionPolicy.subjectVersionCompatibilityRules,
    ...batchAProjectionPolicy.subjectVersionCompatibilityRules.filter(r => r.toCatalogueVersion === 3)
      .map(r => ({ ...r, toCatalogueVersion: BATCH_B_CATALOGUE_VERSION })),
    ...oldSubjects.map(subject => ({ subject, fromCatalogueVersion: batchADefinitionBundle.catalogueVersion, toCatalogueVersion: BATCH_B_CATALOGUE_VERSION })),
  ],
};
