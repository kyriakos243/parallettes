/** Isolated catalogue-v6 candidate. Production remains on accepted Batch A/v3. */
import {
  DEMAND_DOMAINS, DOMAIN_SCHEMA_VERSION, parseDefinitionVersion, parseProjectionVersion, parseStableId,
  type BenchmarkMetric, type BenchmarkProtocol, type DefinitionBundle, type DemandDomain,
  type DemandLevel, type DemandProfile, type ExerciseDefinition, type GraphId, type PrescriptionTarget,
} from "../contracts";
import { capacityIds, capacityFacetIds, exerciseId, graphIds, milestoneBenchmarkId, nodeId, prescriptionId, regressionPrescriptionId } from "../definitions/ids";
import { batchCDefinitionBundle, batchCDefinitionHistory, batchCProjectionPolicy, batchCRemainingBridges } from "./batchC";
import type { ProjectionPolicy } from "../projection";

export const BATCH_D_CATALOGUE_VERSION = parseDefinitionVersion(6);
export const BATCH_D_PROJECTION_VERSION = parseProjectionVersion(6);
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
  allowedSources: ["guided-test", "session-record"], freshnessDays: 45,
};
const demand = { "hand-wrist-bearing":"high", "forward-straight-arm-upper-limb":"high", "overhead-straight-arm-upper-limb":"high", "inversion-technical":"high", "compression-trunk":"high" } as const;
const metric: BenchmarkMetric = {kind:"successful-attempts",minimumSuccessful:2,maximumAttempts:3};
const target: PrescriptionTarget = {kind:"quality",description:"One continuous transition; settle two seconds at each endpoint"};
const technique: PrescriptionTarget = {kind:"quality",description:"One controlled transition attempt; endpoint holds may be shorter"};
const assistance = "Both hands retain their fixed parallette grips. From the settled start through the settled finish: no foot, wall, spotter, band, head or knee support; no kick, swing, leg drive, reset or external assistance. Grounded setup and the separate landing are outside scoring.";
const safety = ["Use stable equal-height non-slip bars with clearance for the entire feet-clear path and your trained landing. Stop for symptoms or loss of control."];
const supportLinks: ExerciseDefinition["capacityLinks"] = [{capacityId:capacityIds.overheadSupport,facetIds:[capacityFacetIds.stackedSupport]}];
const pikeLinks: ExerciseDefinition["capacityLinks"] = [...supportLinks,{capacityId:capacityIds.pikeCompression,facetIds:[capacityFacetIds.activeDoubleLegLift]}];
const straddleLinks: ExerciseDefinition["capacityLinks"] = [...supportLinks,{capacityId:capacityIds.straddleCompression,facetIds:[capacityFacetIds.activeStraddleLift]}];
/** Exact attempt counts, endpoint holds, lowering time and freshness are authored policy, not validated clearance thresholds. */
export const batchDSpecs = [
  {
    bridgeId:"bridge-transition-advanced-press",graphId:graphIds.transitions,node:"straddle-l-press-handstand",exercise:"straddle-l-press-handstand-transition",name:"Straddle-L to Handstand Press",
    description:"One continuous straight-arm press from an already feet-clear straddle L-sit. A grounded straddle press does not establish this connection.",
    how:"Settle a feet-clear straddle L-sit. Lean and raise the hips through locked arms, keep the legs straddled until hip stack, then close into handstand. Settle and exit.",
    cues:["Hold the feet-clear start", "Keep elbows and knees straight", "Stack hips before closing the legs"],
    avoid:["Do not touch down, jump, swing, tuck the knees or reset between endpoints"],
    safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, settle for two seconds in a feet-clear straddle L-sit: upright supported trunk, hips between the bars and both straight straddled legs horizontal. Press continuously through locked elbows with both feet clear, raising the hips through the straddle path without a grounded toe-off or reset. Keep the legs straddled until the hips stack over support, then close into a straight legs-together unassisted handstand held for two seconds. End scoring there and use a separate trained exit.",
    quality:["Both accepted attempts visibly begin from a held feet-clear straddle L-sit", "The unassisted connector stays continuous with locked knees and elbows", "Hips stack before the straddle closes; the straight handstand settles two seconds"],
    target,technique,practiceRange:"One continuous feet-clear straddle-L-to-handstand press per set, with two-second start and finish holds, then a separate trained exit and planned rest. The full benchmark attempt series is separate.",
    techniqueRange:"One controlled attempt along the same feet-clear straight-arm straddle path; start/finish holds may be shorter than two seconds. Use the trained exit before control fades. This reduced practice cannot confirm the exact benchmark.",
    metric,confirmation:confirm,regression:"straddle-press-to-handstand",demand,capacityLinks:straddleLinks,
  },
  {
    bridgeId:"bridge-transition-advanced-press",graphId:graphIds.transitions,node:"full-l-pike-press-to-handstand",exercise:"full-l-pike-press-to-handstand-transition",name:"L-Sit to Pike Press Handstand",
    description:"A full legs-together L-sit connected to an unassisted straight-arm pike press without a floor reset.",
    how:"Settle a feet-clear full L-sit. Keep straight legs together, compress as the hips rise, then unfold into handstand through locked arms. Settle and exit.",
    cues:["Start in a held full L-sit", "Keep legs together and elbows locked", "Raise hips before unfolding the pike"],
    avoid:["Do not straddle, tuck, touch down, kick, swing or reset into a grounded press"],
    safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, settle for two seconds in a full feet-clear L-sit with upright supported trunk and straight together legs horizontal. Without a reset, touch-down, straddle or knee tuck, compress and raise the hips through a straight-arm pike press while both feet remain clear. Unfold only as the hips stack and finish in a straight legs-together unassisted handstand held at active lockout for two seconds. End scoring there and exit separately.",
    quality:["Both accepted attempts show the full held feet-clear legs-together L-sit start", "No toe-off, straddle, knee tuck, bent elbow or disconnected reset", "The continuous pike connector reaches a straight handstand settled two seconds"],
    target,technique,practiceRange:"One continuous full-L-sit-to-pike-press handstand per set with two-second start and finish holds, then a separate trained exit and planned rest. The full benchmark attempt series is separate.",
    techniqueRange:"One controlled feet-clear legs-together pike-connector attempt with locked elbows; start/finish holds may be shorter than two seconds. Exit before control fades. No exact benchmark confirmation.",
    metric,confirmation:confirm,regression:"pike-press-to-handstand",demand,capacityLinks:pikeLinks,
  },
  {
    bridgeId:"bridge-transition-advanced-press",graphId:graphIds.transitions,node:"handstand-to-l-sit-negative",exercise:"handstand-to-l-sit-negative",name:"Handstand to L-Sit Negative",
    description:"A one-way controlled lower into a true feet-clear full L-sit. This demonstrates neither a press ascent nor a landing in straddle stand.",
    how:"Settle in a straight handstand. With elbows locked and legs together, lower through pike for at least four seconds into full L-sit. Hold, then fold and land separately.",
    cues:["Control the entire lower", "Keep elbows locked and legs together", "Hold L-sit with both feet clear"],
    avoid:["Do not drop, straddle, bend the knees or elbows, land before L-sit or reverse into a press"],
    safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, settle for two seconds in a straight legs-together freestanding handstand at active lockout. Lower continuously for at least four seconds through a controlled pike path with locked elbows, straight together legs and feet clear, ending in an upright supported full L-sit with both straight together legs horizontal. Hold that feet-clear L-sit for two seconds before a separate fold-and-land reset. No straddle stand, floor contact, partial lower or reversed ascent substitutes for either endpoint.",
    quality:["Both accepted attempts begin with a straight handstand held two seconds", "Each complete continuous negative lasts at least four seconds with locked elbows and knees", "Each ends in a true feet-clear full L-sit held two seconds before landing"],
    target:{kind:"quality",description:"One four-second lower; settle two seconds at each endpoint"},technique,
    practiceRange:"One continuous handstand-to-full-L-sit negative per set: two-second top, at least four-second lower, two-second feet-clear L-sit, then a separate fold-and-land reset and planned rest. The full benchmark series is separate.",
    techniqueRange:"One controlled one-way lower attempt along the same legs-together path; endpoint holds may be shorter than two seconds. Use the trained exit before control fades, never reverse into an ascent. No exact benchmark confirmation.",
    metric,confirmation:confirm,regression:"wall-handstand-to-straddle-stand-lower",demand,capacityLinks:pikeLinks,
  },
  {
    bridgeId:"bridge-transition-planche-handstand",graphId:graphIds.transitions,node:"straddle-planche-to-handstand-press",exercise:"straddle-planche-to-handstand-press",name:"Straddle Planche to Handstand",
    description:"A continuous locked-arm straddle Planche press into handstand. Full-Planche and bent-arm specialist connections remain separate.",
    how:"Settle a feet-clear straddle Planche. Keep elbows and knees straight as you raise the hips into a straddled handstand. Close only after hip stack, settle and exit.",
    cues:["Hold the horizontal Planche start", "Raise the hips through locked arms", "Close the straddle after hip stack"],
    avoid:["Do not bend the elbows, tuck the knees, touch down, swing or use a wall catch"],
    safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, settle for two seconds in an unassisted feet-clear straddle Planche with locked elbows, straight straddled legs, active protraction and an approximately horizontal shoulder/hip/heel plane. Press continuously through locked arms, raising the hips and maintaining straight straddled legs until the hips stack over support. Then close into a straight legs-together unassisted handstand held for two seconds before a separate trained exit. No bent-arm 90-degree route, tuck, grounded restart or full-Planche claim is accepted.",
    quality:["Both accepted attempts show the held unassisted horizontal straddle Planche start", "The press stays feet-clear and continuous with straight elbows and knees", "Hips stack before legs close; each straight handstand settles two seconds"],
    target,technique,practiceRange:"One continuous straddle-Planche-to-handstand press per set, with two-second start and finish holds, then a separate trained exit and planned rest. The full benchmark attempt series is separate.",
    techniqueRange:"One controlled locked-arm straddle-Planche press attempt; start/finish holds may be shorter than two seconds. Keep the straddle and use the trained exit before control fades. No exact benchmark confirmation.",
    metric,confirmation:confirm,regression:"straddle-planche-hold",demand,capacityLinks:[...straddleLinks,{capacityId:capacityIds.straightArmSupport,facetIds:[capacityFacetIds.protractedForwardLoading]}],
  },
] as const satisfies readonly Spec[];

const dense = (s: Spec): DemandProfile => Object.fromEntries(DEMAND_DOMAINS.map(d => [d, s.demand[d] ?? "low"])) as DemandProfile;
const equipmentFor = (s: Spec) => s.equipment.map(id => parseStableId("equipment", id));
const version = parseDefinitionVersion(1);
export const batchDExercises: readonly ExerciseDefinition[] = batchDSpecs.map((s: Spec) => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: exerciseId(s.exercise), definitionVersion: version,
  lifecycle: "active", name: s.name, description: s.description,
  instructions: { how: s.how, cues: s.cues, avoid: s.avoid },
  media: [{ kind: "motion", reference: s.exercise, description: `${s.name}: complete entry, target and separate controlled exit` }],
  equipment: equipmentFor(s), roles: ["outcome-milestone", "benchmark-test", "development-drill"],
  graphLinks: [{ graphId: s.graphId, nodeId: nodeId(s.node), contribution: "milestone" }], capacityLinks: s.capacityLinks,
  prescriptionVariants: [
    { id: prescriptionId(s.exercise), label: "One controlled attempt", target: s.target, range: s.practiceRange ?? s.range, demand: dense(s) },
    { id: regressionPrescriptionId(s.exercise), label: "Reduced controlled practice", target: s.technique, range: s.techniqueRange, demand: dense(s) },
  ],
  benchmarkProtocolIds: [milestoneBenchmarkId(s.graphId, s.node)],
  relations: [{ kind: "regression", targetExerciseId: exerciseId(s.regression), fromPrescriptionVariantId: prescriptionId(s.exercise), targetPrescriptionVariantId: prescriptionId(s.regression) }],
  safetyNotes: s.safety,
}));
export const batchDProtocols: readonly BenchmarkProtocol[] = batchDSpecs.map(s => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: milestoneBenchmarkId(s.graphId, s.node), definitionVersion: version,
  label: s.name, subject: { kind: "milestone", milestone: { graphId: s.graphId, nodeId: nodeId(s.node) } },
  exerciseId: exerciseId(s.exercise), prescriptionVariantId: prescriptionId(s.exercise),
  conditions: { equipment: equipmentFor(s), assistance: s.assistance, range: s.range },
  metric: s.metric, qualityCriteria: s.quality, safetyCriteria: s.safety, confirmation: s.confirmation,
}));
const deliveries = new Map(batchDSpecs.map(s => [`${s.graphId}:${s.node}`, s]));
export const batchDDefinitionBundle: DefinitionBundle = {
  ...batchCDefinitionBundle, catalogueVersion: BATCH_D_CATALOGUE_VERSION,
  exercises: [...batchCDefinitionBundle.exercises, ...batchDExercises],
  benchmarkProtocols: [...batchCDefinitionBundle.benchmarkProtocols, ...batchDProtocols],
  graphs: batchCDefinitionBundle.graphs.map(graph => ({
    ...graph, definitionVersion: BATCH_D_CATALOGUE_VERSION,
    nodes: graph.nodes.map(node => deliveries.has(`${graph.id}:${node.id}`)
      ? { ...node, implementationStatus: "available", benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)] } : node),
  })),
};
export const batchDDefinitionHistory = [...batchCDefinitionHistory, batchDDefinitionBundle] as const;
export const batchDRemainingBridges = batchCRemainingBridges.filter(b => !batchDSpecs.some(s => s.bridgeId === b.id));
const subjectKey = (s: BenchmarkProtocol["subject"]) => JSON.stringify(s);
const oldSubjects = batchCDefinitionBundle.benchmarkProtocols.map(p => p.subject)
  .filter((s, i, all) => all.findIndex(other => subjectKey(s) === subjectKey(other)) === i);
export const batchDProjectionPolicy: ProjectionPolicy = {
  ...batchCProjectionPolicy, version: BATCH_D_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [
    ...batchCProjectionPolicy.subjectVersionCompatibilityRules,
    ...batchCProjectionPolicy.subjectVersionCompatibilityRules.filter(r => r.toCatalogueVersion === 5)
      .map(r => ({ ...r, toCatalogueVersion: BATCH_D_CATALOGUE_VERSION })),
    ...oldSubjects.map(subject => ({ subject, fromCatalogueVersion: batchCDefinitionBundle.catalogueVersion, toCatalogueVersion: BATCH_D_CATALOGUE_VERSION })),
  ],
};
