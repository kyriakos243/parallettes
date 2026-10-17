/** Isolated catalogue-v5 candidate. Production remains on accepted Batch A/v3. */
import {
  DEMAND_DOMAINS, DOMAIN_SCHEMA_VERSION, parseDefinitionVersion, parseProjectionVersion, parseStableId,
  type BenchmarkMetric, type BenchmarkProtocol, type DefinitionBundle, type DemandDomain,
  type DemandLevel, type DemandProfile, type ExerciseDefinition, type GraphId, type PrescriptionTarget,
} from "../contracts";
import { capacityIds, capacityFacetIds, exerciseId, graphIds, milestoneBenchmarkId, nodeId, prescriptionId, regressionPrescriptionId } from "../definitions/ids";
import { batchBDefinitionBundle, batchBDefinitionHistory, batchBProjectionPolicy, batchBRemainingBridges } from "./batchB";
import type { ProjectionPolicy } from "../projection";

export const BATCH_C_CATALOGUE_VERSION = parseDefinitionVersion(5);
export const BATCH_C_PROJECTION_VERSION = parseProjectionVersion(5);
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
const balanceDemand = { "hand-wrist-bearing":"high", "overhead-straight-arm-upper-limb":"high", "inversion-technical":"high", "compression-trunk":"moderate" } as const;
const pushDemand = { ...balanceDemand, "vertical-bent-arm-push":"high" } as const;
const unassisted = "Both hands retain their own fixed parallette grip. No wall, spotter, band, head support, kick, leg drive or other external assistance during the scored movement. Entry and grounded reset are separate.";
const setupSafety = ["Use stable non-slip equal-height bars, a clear landing and your trained exit. Stop for symptoms, instability or head contact."];
const pushSafety = [...setupSafety, "Use a range with a controlled bottom exit to feet outside the bars, both grips retained and head clear. If uncertain, use the wall regression and seek coaching."];
const balanceLinks: ExerciseDefinition["capacityLinks"] = [{ capacityId:capacityIds.overheadSupport, facetIds:[capacityFacetIds.stackedSupport] }, { capacityId:capacityIds.bodyLineControl, facetIds:[capacityFacetIds.antiRotationControl] }];
const pushLinks: ExerciseDefinition["capacityLinks"] = [{ capacityId:capacityIds.verticalBentArmPush, facetIds:[capacityFacetIds.verticalRepeatableStrength] }];
const attempt: PrescriptionTarget = {kind:"quality",description:"One controlled attempt, then exit and reset"};
const target: PrescriptionTarget = {kind:"quality",description:"One controlled repetition, then exit and reset"};
const metric: BenchmarkMetric = {kind:"successful-attempts",minimumSuccessful:2,maximumAttempts:3};
const standardRange = "unloaded crown at the standard padded landmark level with the bar tops";
/** Counts, holds, depth landmarks and freshness are authored policy, not validated injury/readiness cutoffs. */
export const batchCSpecs = [
  {
    bridgeId:"bridge-handstand-weight-transfer",graphId:graphIds.handstandBalance,node:"freestanding-weight-transfer",exercise:"freestanding-parallette-weight-shift",name:"Freestanding Parallette Weight Transfer",
    description:"Quiet side-to-side balance with both hands on the bars. This does not demonstrate one-arm balance.",
    how:"Enter your stable two-arm handstand. Shift gently left for two seconds, return to centre, then right for two seconds and return. Keep both grips; use your trained exit.",
    cues:["Push tall with both elbows locked", "Move the stacked body gently over each support side", "Keep both hands on their bars"],
    avoid:["Do not tap, lift a hand, collapse a shoulder or swing the legs to catch balance"],
    safety:setupSafety,equipment:["parallettes","floor"],assistance:unassisted,
    range:"In at least two of up to three separate floor-reset attempts, start from a settled straight two-arm freestanding handstand, shift the stacked body towards the left support for two quiet seconds, return to centre, then towards the right for two quiet seconds and return. Both hands stay in full bar contact, elbows locked and feet clear throughout. Finish with a separate trained exit.",
    quality:["Each accepted attempt includes both directions and both centred returns", "Both shoulders remain actively supported with locked elbows", "No hand lift, wall catch or swinging leg correction"],
    target:{kind:"quality",description:"One left–centre–right–centre cycle, then exit and rest"},technique:attempt,practiceRange:"One left-centre-right-centre transfer cycle per set with two-second side pauses and a separate trained exit; reset on the floor between sets. The full multi-attempt benchmark is a separate test.",
    techniqueRange:"One smaller left-centre-right-centre shift with both grips retained; no side hold required and no benchmark confirmation.",metric,confirmation:confirm,regression:"wall-facing-handstand-weight-shift",demand:balanceDemand,capacityLinks:balanceLinks,
  },
  {
    bridgeId:"bridge-handstand-weight-transfer",graphId:graphIds.handstandBalance,node:"freestanding-parallette-one-hand-light-balance",exercise:"freestanding-parallette-one-hand-light-balance",name:"Freestanding One-Hand-Light Balance",
    description:"Bias support to either side while the other hand stays touching its bar. Contact and balance are observed; unloading is not measured.",
    how:"From a settled handstand, shift over the left support and ease pressure through the right hand for three seconds without lifting it. Re-centre and repeat the other side, then use your trained exit.",
    cues:["Keep the light hand touching its bar", "Push tall through the support side", "Re-centre before changing sides"],
    avoid:["Do not lift fingers or palm clear, claim one-arm balance or rescue the hold with a leg swing"],
    safety:setupSafety,equipment:["parallettes","floor"],assistance:unassisted,
    range:"In at least two of up to three separate floor-reset attempts, settle a straight two-arm freestanding handstand, bias the stacked body over the left support and ease pressure through the opposite hand while retaining visible hand-to-bar contact for three seconds. Return to centre and repeat on the right for three seconds, then re-centre and exit separately. The athlete reports eased pressure; neither a percentage of unloading nor a one-arm hold is inferred.",
    quality:["Both sides retain a quiet three-second biased-support position", "The light hand stays touching; the support elbow stays locked and shoulder elevated", "A centred return separates the sides; no wall, head support or leg swing"],
    target:{kind:"quality",description:"One left–centre–right–centre cycle, then exit and rest"},technique:attempt,practiceRange:"One left-centre-right-centre attempt per set with three-second light-hand pauses; keep contact, then exit separately and rest. The full benchmark attempt series is separate.",
    techniqueRange:"One smaller support bias to each side with both hands touching; no three-second pause required and no benchmark confirmation.",metric,confirmation:confirm,regression:"freestanding-parallette-weight-shift",demand:balanceDemand,capacityLinks:balanceLinks,
  },
  {
    bridgeId:"bridge-hspu-freestanding",graphId:graphIds.verticalPushHspu,node:"freestanding-hspu-eccentric",exercise:"freestanding-parallette-hspu-eccentric",name:"Freestanding HSPU Eccentric",
    description:"One controlled freestanding lower followed directly by a feet-to-floor exit. A negative never proves pressing back up.",
    how:"Set the standard pad. From settled lockout, lower for four seconds to bar-top crown height without touching. Keep both grips; fold and lower legs outside the bars to the floor.",
    cues:["Control all four seconds, including the bottom", "Keep the crown clear of the pad", "Exit from the bottom; do not press back up"],
    avoid:["Do not drop, reverse the negative, borrow wall support or land between the bars"],
    safety:pushSafety,equipment:["parallettes","floor"],assistance:unassisted,
    range:`In at least two of up to three separate floor-reset attempts, settle a straight freestanding handstand at active lockout, then lower continuously for at least four seconds to the ${standardRange}, without contact. From that bent-arm bottom, fold and lower the legs outside the bars until both feet are on the floor, maintaining both grips and unloaded crown. No concentric or wall-assisted exit is credited.`,
    quality:["Each descent lasts at least four continuous seconds through the exact standard depth", "The crown remains unloaded and both elbows track under control", "Each attempt exits directly from its bottom to both grounded feet without an intervening press"],
    target:{kind:"quality",description:"One four-second negative, then exit directly from the bottom"},technique:attempt,practiceRange:"One four-second freestanding negative to the standard bar-top landmark per set, followed directly by the controlled feet-to-floor bottom exit and separate reset. Follow the timer for rest; the full benchmark series is separate.",
    techniqueRange:"One slower shallow negative, stopping above the standard landmark, followed directly by a controlled feet-to-floor exit. No concentric and no benchmark confirmation.",metric,confirmation:{...confirm,freshnessDays:45},regression:"wall-hspu-eccentric",demand:pushDemand,capacityLinks:pushLinks,
  },
  {
    bridgeId:"bridge-hspu-freestanding",graphId:graphIds.verticalPushHspu,node:"partial-freestanding-hspu",exercise:"partial-freestanding-parallette-hspu",name:"Partial Freestanding HSPU",
    description:"A complete down-and-up attempt through a fixed partial range, distinct from lowering-only and full-depth work.",
    how:"Mark halfway from top crown height to bar-top height. Lower to that marker without touching, press to lockout, settle two seconds and exit.",
    cues:["Use the same halfway marker each time", "Press back without a kip", "Settle at full lockout for two seconds"],
    avoid:["Do not move the marker, shorten the range, load the head or count a negative as a repetition"],
    safety:pushSafety,equipment:["parallettes","floor"],assistance:unassisted,
    range:"In at least two of up to three separate floor-reset attempts, start at active freestanding handstand lockout, lower the unloaded crown to the fixed visible marker halfway in vertical height between the settled top crown and the standard bar-top plane, then press back to straight active lockout and settle two seconds before a separate trained exit. Use the same marker and apparatus setup for the whole test. This partial range is not full or deficit depth.",
    quality:["Both accepted attempts reach the same halfway crown marker", "Each includes a controlled descent and unassisted concentric", "Each finishes with a straight locked-arm top settled for two seconds"],
    target,technique:attempt,practiceRange:"One down-and-up repetition to the fixed halfway crown marker per set, with a two-second locked-arm top and separate trained exit. Reset on the floor and follow the timer for rest; the full benchmark series is separate.",
    techniqueRange:"One shallower down-and-up attempt above the halfway marker; no two-second top required and no benchmark confirmation.",metric,confirmation:confirm,regression:"freestanding-parallette-hspu-eccentric",demand:pushDemand,capacityLinks:pushLinks,
  },
  {
    bridgeId:"bridge-hspu-freestanding",graphId:graphIds.verticalPushHspu,node:"full-freestanding-hspu",exercise:"freestanding-parallette-hspu",name:"Full Freestanding HSPU",
    description:"The full standard freestanding down-and-up range with an independently settled top. Partial and deficit ranges remain separate.",
    how:"From settled lockout, lower the unloaded crown to bar-top height. Press to lockout, settle two seconds and use your trained exit.",
    cues:["Reach the standard bar-top crown landmark", "Keep the crown unloaded", "Press fully and settle the straight top"],
    avoid:["Do not bounce on the pad, kip, shorten depth or use a wall catch"],
    safety:pushSafety,equipment:["parallettes","floor"],assistance:unassisted,
    range:`In at least two of up to three separate floor-reset attempts, lower from active freestanding handstand lockout to the ${standardRange}, without contact, then press back to straight active lockout and settle for two seconds before a separate trained exit. No shortened range, head support or leg drive is accepted. This is standard depth, not a below-bar deficit.`,
    quality:["Both accepted attempts include the full standard descent and ascent", "Crown stays clear of the pad without bounce or leg drive", "Each locked-arm straight top settles for two seconds"],
    target,technique:attempt,practiceRange:"One full standard-depth freestanding repetition per set, with a two-second locked-arm top and separate trained exit. Reset on the floor and follow the timer for rest; the full benchmark series is separate.",
    techniqueRange:"One partial freestanding down-and-up attempt above the standard landmark; no two-second top required and no full-depth benchmark confirmation.",metric,confirmation:confirm,regression:"partial-freestanding-parallette-hspu",demand:pushDemand,capacityLinks:pushLinks,
  },
  {
    bridgeId:"bridge-hspu-freestanding",graphId:graphIds.verticalPushHspu,node:"deficit-freestanding-hspu",exercise:"deficit-freestanding-parallette-hspu",name:"Deficit Freestanding HSPU",
    description:"Freestanding pressing to the exact reviewed below-bar depth. A standard-depth exit does not establish this deeper bailout.",
    how:"Use your reviewed below-bar pad. Lower without head contact, press to lockout, settle two seconds and exit.",
    cues:["Keep the reviewed below-bar target unchanged", "Control the deepest part without head contact", "Press tall and settle for two seconds"],
    avoid:["Do not substitute standard depth, lower the target further, bounce, kip or force shoulder range"],
    safety:[...pushSafety,"Match your current deeper-exit setup. Never explore extra depth during an attempt."],
    equipment:["parallettes","floor"],assistance:unassisted,
    range:"In at least two of up to three separate floor-reset attempts, lower from active freestanding lockout to the exact reviewed padded crown landmark visibly below the bar tops, without contact, then press to straight active lockout and settle two seconds before a separate trained exit. Bar height, pad height and clearance must match the current deeper-exit setup; the standard exit cannot substitute. No claim is made for any deeper range.",
    quality:["Both accepted attempts reach the unchanged reviewed below-bar crown landmark", "The head remains unloaded and the deeper shoulder position stays controlled", "Each unassisted ascent reaches a straight locked-arm top settled for two seconds"],
    target,technique:attempt,practiceRange:"One freestanding down-and-up repetition to the exact reviewed deficit target per set, with a two-second top and separate trained exit. Reset on the floor and follow the timer for rest; the full benchmark series is separate.",
    techniqueRange:"One down-and-up attempt stopping above the reviewed deficit target; no two-second top required and no deficit benchmark confirmation.",metric,confirmation:{...confirm,freshnessDays:45},regression:"freestanding-parallette-hspu",demand:pushDemand,capacityLinks:pushLinks,
  },
] as const satisfies readonly Spec[];

const dense = (s: Spec): DemandProfile => Object.fromEntries(DEMAND_DOMAINS.map(d => [d, s.demand[d] ?? "low"])) as DemandProfile;
const equipmentFor = (s: Spec) => s.equipment.map(id => parseStableId("equipment", id));
const version = parseDefinitionVersion(1);
export const batchCExercises: readonly ExerciseDefinition[] = batchCSpecs.map((s: Spec) => ({
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
export const batchCProtocols: readonly BenchmarkProtocol[] = batchCSpecs.map(s => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: milestoneBenchmarkId(s.graphId, s.node), definitionVersion: version,
  label: s.name, subject: { kind: "milestone", milestone: { graphId: s.graphId, nodeId: nodeId(s.node) } },
  exerciseId: exerciseId(s.exercise), prescriptionVariantId: prescriptionId(s.exercise),
  conditions: { equipment: equipmentFor(s), assistance: s.assistance, range: s.range },
  metric: s.metric, qualityCriteria: s.quality, safetyCriteria: s.safety, confirmation: s.confirmation,
}));
const deliveries = new Map(batchCSpecs.map(s => [`${s.graphId}:${s.node}`, s]));
export const batchCDefinitionBundle: DefinitionBundle = {
  ...batchBDefinitionBundle, catalogueVersion: BATCH_C_CATALOGUE_VERSION,
  exercises: [...batchBDefinitionBundle.exercises, ...batchCExercises],
  benchmarkProtocols: [...batchBDefinitionBundle.benchmarkProtocols, ...batchCProtocols],
  graphs: batchBDefinitionBundle.graphs.map(graph => ({
    ...graph, definitionVersion: BATCH_C_CATALOGUE_VERSION,
    nodes: graph.nodes.map(node => deliveries.has(`${graph.id}:${node.id}`)
      ? { ...node, implementationStatus: "available", benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)] } : node),
  })),
};
export const batchCDefinitionHistory = [...batchBDefinitionHistory, batchCDefinitionBundle] as const;
export const batchCRemainingBridges = batchBRemainingBridges.filter(b => !batchCSpecs.some(s => s.bridgeId === b.id));
const subjectKey = (s: BenchmarkProtocol["subject"]) => JSON.stringify(s);
const oldSubjects = batchBDefinitionBundle.benchmarkProtocols.map(p => p.subject)
  .filter((s, i, all) => all.findIndex(other => subjectKey(s) === subjectKey(other)) === i);
export const batchCProjectionPolicy: ProjectionPolicy = {
  ...batchBProjectionPolicy, version: BATCH_C_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [
    ...batchBProjectionPolicy.subjectVersionCompatibilityRules,
    ...batchBProjectionPolicy.subjectVersionCompatibilityRules.filter(r => r.toCatalogueVersion === 4)
      .map(r => ({ ...r, toCatalogueVersion: BATCH_C_CATALOGUE_VERSION })),
    ...oldSubjects.map(subject => ({ subject, fromCatalogueVersion: batchBDefinitionBundle.catalogueVersion, toCatalogueVersion: BATCH_C_CATALOGUE_VERSION })),
  ],
};
