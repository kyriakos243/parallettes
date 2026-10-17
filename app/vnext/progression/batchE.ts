/** Isolated catalogue-v7 candidate. Production remains on accepted Batch A/v3. */
import {
  DEMAND_DOMAINS, DOMAIN_SCHEMA_VERSION, parseDefinitionVersion, parseProjectionVersion, parseStableId,
  type BenchmarkMetric, type BenchmarkProtocol, type DefinitionBundle, type DemandDomain,
  type DemandLevel, type DemandProfile, type ExerciseDefinition, type GraphId, type PrescriptionTarget,
} from "../contracts";
import { capacityIds, capacityFacetIds, exerciseId, graphIds, milestoneBenchmarkId, nodeId, prescriptionId, regressionPrescriptionId } from "../definitions/ids";
import { batchDDefinitionBundle, batchDDefinitionHistory, batchDProjectionPolicy, batchDRemainingBridges } from "./batchD";
import type { ProjectionPolicy } from "../projection";

export const BATCH_E_CATALOGUE_VERSION = parseDefinitionVersion(7);
export const BATCH_E_PROJECTION_VERSION = parseProjectionVersion(7);
type Spec = Readonly<{
  bridgeId: string; graphId: GraphId; node: string; exercise: string; name: string;
  description: string; how: string; cues: readonly string[]; avoid: readonly string[];
  safety: readonly string[]; equipment: readonly string[]; assistance: string; range: string;
  quality: readonly string[]; target: PrescriptionTarget; technique: PrescriptionTarget;
  techniqueRange: string; practiceRange?: string; metric: BenchmarkMetric; confirmation: BenchmarkProtocol["confirmation"];
  regression: string; demand: Partial<Record<DemandDomain, DemandLevel>>;
  capacityLinks: ExerciseDefinition["capacityLinks"];
}>;
const confirm = (freshnessDays: number): BenchmarkProtocol["confirmation"] => ({
  qualifyingObservations: 3, minimumDistinctSessions: 3,
  allowedSources: ["guided-test", "session-record"], freshnessDays,
});
const holdDemand = {"hand-wrist-bearing":"high","compression-trunk":"high"} as const;
const invertedDemand = {...holdDemand,"overhead-straight-arm-upper-limb":"high","inversion-technical":"high"} as const;
const pressDemand = {...invertedDemand,"forward-straight-arm-upper-limb":"moderate"} as const;
const supportLinks: ExerciseDefinition["capacityLinks"] = [{capacityId:capacityIds.straightArmSupport,facetIds:[capacityFacetIds.tallSupport]},{capacityId:capacityIds.pikeCompression,facetIds:[capacityFacetIds.activeDoubleLegLift]}];
const balanceLinks: ExerciseDefinition["capacityLinks"] = [{capacityId:capacityIds.overheadSupport,facetIds:[capacityFacetIds.activeElevation]},{capacityId:capacityIds.bodyLineControl,facetIds:[capacityFacetIds.integratedLine]}];
const balanceSafety = ["Experienced coach required. Use stable bars and your trained two-hand return and exit. Stop for symptoms or loss of control.","Use stable equal-height non-slip parallettes and a clear landing. The coach chooses a comfortable straddle width; do not force the drawing’s width. Stop for symptoms, slipping or loss of shoulder/elbow control; a coach catch ends the scored attempt."];
const sideMetric: BenchmarkMetric = {kind:"successful-attempts",minimumSuccessful:2,maximumAttempts:4};
const pressAssistance = "No wall, coach contact, band, head/knee support or external assistance during either press. Both feet start each ascent stationary on the floor, without jump, kick or toe propulsion.";
const pressSafety = ["Specialist sets require your trained inversion exit. Stop for symptoms or lost control; keep the landing clear.","Use non-slip equal-height bars and a clear landing. Stop rather than hurry the reset if control is not ready; symptoms or an unplanned catch end the set."];
const pressRange = (branch:string) => `One complete two-repetition set of unassisted straight-arm ${branch} presses from stationary grounded feet. Each ascent reaches a straight legs-together handstand with locked elbows and a two-second settled top. Lower under control along the same branch to both feet on the floor; keep both grips and reset motionless for two to four seconds before the second ascent. No bounce, extra discretionary rest, jump, tuck, bent arm or assistance. Scoring ends after the second held top; use a separate controlled return and landing. The two-rep set is one observation, not two occasions. It proves neither a suspended L-sit/stalder connector nor the other press branch.`;
/** All thresholds are authored coaching/product policy; no validated readiness or injury cutoffs. */
export const batchESpecs = [
  {
    bridgeId:"bridge-v-sit-specialist",graphId:graphIds.lSitVSit,node:"extended-v-sit-hold",exercise:"extended-v-sit-hold",name:"High V-Sit Hold",
    description:"A higher specialist V-sit: both straight legs at least 75 degrees above horizontal. Longer lower-V holds do not demonstrate this range; no manna or press connection is claimed.",
    how:"From tall L-sit support, raise both straight together legs to the 75-degree landmark. Keep the trunk upright, hold five seconds, then lower to L-sit and land.",
    cues:["Press tall with locked elbows","Keep knees straight and legs together","Hold the higher range without leaning back"],
    avoid:["Do not swing, recoil, bend the knees, force range or use a wall/coach lift"],
    safety:["Optional specialist hold after stable V-sit; lower to your established range before control fades.","Use stable non-slip bars with clear feet and landing. Stop for symptoms; do not force compression or lean into a manna attempt."],
    equipment:["parallettes","floor"],assistance:"Unassisted: no wall, foot, band, coach or other external support during the hold.",
    range:"Hold five continuous seconds in tall support with locked elbows, an upright trunk and both straight together legs at least 75 degrees above horizontal. Feet stay clear and knees straight without swing, backward recoil or external support. Enter through L-sit and lower under control to L-sit before landing. A 60-degree V, longer lower hold, bent knees, manna or press connection does not substitute.",
    quality:["Both straight legs remain at or above the 75-degree side-view landmark for five seconds","Tall support and upright trunk remain without backward recoil","No assistance, swing or peak-only range; return to L-sit remains controlled"],
    target:{kind:"quality",description:"One 5s high hold, then lower through L-sit"},technique:{kind:"quality",description:"One 2–3s high hold, then lower"},
    practiceRange:"One five-second higher V-sit hold per set at the exact range, then controlled L-sit return and landing; rest as timed.",
    techniqueRange:"Use the same higher V shape only for two to three controlled seconds, then lower. Below the five-second benchmark and nonconfirming.",
    metric:{kind:"duration-seconds",minimum:5},confirmation:confirm(45),regression:"v-sit-hold",demand:holdDemand,capacityLinks:supportLinks,
  },
  {
    bridgeId:"bridge-handstand-one-arm",graphId:graphIds.handstandBalance,node:"assisted-one-arm-parallette-balance",exercise:"assisted-one-arm-parallette-balance",name:"Coach-Assisted One-Arm Balance",
    description:"A coached straddle one-arm hold with explicit hands-on pelvic assistance. The lifted free hand is fully clear; coach assistance is unquantified and never counts as unassisted balance.",
    how:"Coach holds both sides of your pelvis. Shift and lift the free hand; hold 3s. Regrip before the coach releases. Land, rest, then change sides.",
    cues:["Coach contact starts before hand release","Push tall over the supporting bar","Regrip fully before assistance ends"],
    avoid:["Do not use fingertips on the spare bar, wall/foot support, a rescue catch or a bent supporting elbow as a clean hold"],
    safety:balanceSafety,equipment:["parallettes","floor"],
    assistance:"An experienced coach provides continuous hands-on support at both sides of the pelvis before free-hand release, throughout the hold and until both full grips return. Keep this contact method consistent; force is unmeasured. No wall, head or foot support and no free-hand bar contact during the scored hold. Never credit this as unassisted.",
    range:"Across at most four separate floor-reset attempts (at most two per side), accept at least one three-second straddle one-arm hold on each supporting arm. Coach pelvic contact is established before release and remains continuous through the hold and full two-hand regrip. Supporting elbow stays locked and shoulder elevated, trunk controlled and both straight straddled legs feet-clear; the free hand is fully off both bars. Land and take planned rest between sides/attempts. An emergency catch, free-hand touch, changed assistance method or missing side does not complete the paired benchmark.",
    quality:["At least one accepted three-second hold on each supporting arm, no more than two attempts per side","Coach pelvic support remains continuous before release through full two-hand regrip","Supporting elbow locked and shoulder active; straight straddle, feet clear and free hand fully off the bars"],
    target:{kind:"quality",description:"3s with coach support on one side; alternate sets"},technique:{kind:"quality",description:"One shorter coached release attempt on one side; regrip before control fades"},
    practiceRange:"One coached three-second hold on one side per set, then full regrip, controlled landing and planned rest; alternate sides across sets. A complete paired test is separate.",
    techniqueRange:"One shorter same-assistance release attempt on one side, return both grips before coach release, then land. Shorter or one-sided practice cannot confirm the paired benchmark.",
    metric:sideMetric,confirmation:confirm(30),regression:"freestanding-parallette-one-hand-light-balance",demand:invertedDemand,capacityLinks:balanceLinks,
  },
  {
    bridgeId:"bridge-handstand-one-arm",graphId:graphIds.handstandBalance,node:"one-arm-handstand",exercise:"one-arm-parallette-handstand",name:"One-Arm Parallette Handstand",
    description:"A coached specialist straddle one-arm hold without contact assistance. A nearby coach is required for the planned exit; any physical help invalidates unassisted scoring.",
    how:"With a coach present, shift and lift the free hand. Hold 3s without contact help. Regrip, land and rest before changing sides.",
    cues:["Shift under control before the hand lifts","Keep the supporting shoulder tall","Return both full grips before exiting"],
    avoid:["Do not count a coach catch, fingertips, wall contact, bent supporting elbow or one-sided result as the paired benchmark"],
    safety:balanceSafety,equipment:["parallettes","floor"],
    assistance:"Coach present for the planned exit, but no coach, wall, foot, head, band or free-hand contact during either scored three-second hold. Any physical assistance ends that attempt as failed/modified; never label a catch clean unassisted proof.",
    range:"Across at most four separate floor-reset attempts (at most two per side), accept at least one unassisted three-second straddle one-arm hold on each supporting arm. Settle from two full grips, shift under control and lift the other hand fully clear. Supporting elbow stays locked and shoulder elevated, trunk controlled and both straight straddled legs feet-clear. No other body/bar/wall/coach contact during scoring. Regrip with both hands before the separate controlled exit; land and rest between sides/attempts. A single side, momentary lift, light-hand contact or coached hold does not complete this paired benchmark.",
    quality:["At least one accepted three-second unassisted hold on each supporting arm, no more than two attempts per side","Free hand remains fully clear; no coach, wall, head or foot assistance during scoring","Locked supporting elbow, tall shoulder and controlled straight-leg straddle; full two-hand regrip before exit"],
    target:{kind:"quality",description:"3s without contact help on one side; alternate sets"},technique:{kind:"quality",description:"One shorter unassisted release attempt with coach present; regrip before control fades"},
    practiceRange:"One unassisted three-second hold on one side per set with coach present, then full regrip, controlled landing and planned rest; alternate sides across sets. A complete paired test is separate.",
    techniqueRange:"One shorter unassisted release attempt on one side with coach present, then two-hand regrip and landing. Any coach contact makes it modified; shorter/one-sided practice cannot confirm the paired benchmark.",
    metric:sideMetric,confirmation:confirm(30),regression:"assisted-one-arm-parallette-balance",demand:invertedDemand,capacityLinks:balanceLinks,
  },
  ...([true,false] as const).map(straddle => ({
    bridgeId:"bridge-press-specialist",graphId:graphIds.pressToHandstand,node:straddle?"repeated-straddle-presses":"repeated-pike-presses",exercise:straddle?"repeated-straddle-press-to-handstand":"repeated-pike-press-to-handstand",name:straddle?"Two Straddle Presses":"Two Pike Presses",
    description:"Two complete grounded-start straight-arm presses in one set, separated by a stationary two-to-four-second floor reset. This does not demonstrate a feet-clear L-sit/stalder connection.",
    how:`Press from still ${straddle?"straddle":"together-leg pike"} feet to a 2s handstand. Lower to both feet, reset motionless for 2–4s, then repeat. Stop if control fades; rest after the pair.`,
    cues:["Keep both knees and elbows straight","Settle each straight top for two seconds","Both feet reset quietly for two to four seconds"],
    avoid:["Do not bounce, kick, tuck, use a coach catch or extend the in-set rest to turn isolated attempts into a repeated set"],
    safety:pressSafety,equipment:["parallettes","floor"],assistance:pressAssistance,
    range:pressRange(straddle?"straddle":"together-leg pike"),
    quality:["Two complete same-branch ascents in one set, each with a settled two-second straight handstand",`Both knees and elbows remain straight; ${straddle?"straddle remains until hip stack, then closes":"legs remain together through both pike ascents"}`,"Controlled floor return and motionless two-to-four-second reset; no bounce, assistance or extra rest"],
    target:{kind:"repetitions",minimum:2,maximum:2} as PrescriptionTarget,technique:{kind:"repetitions",minimum:1,maximum:1} as PrescriptionTarget,
    practiceRange:"One complete two-press set per practice set, with two-second tops and a stationary two-to-four-second grounded reset; planned rest follows the pair.",
    techniqueRange:"One complete same-branch grounded press, settled top and controlled return only. Single-press practice is below the two-repetition benchmark and cannot confirm it.",
    metric:{kind:"repetitions",minimum:2} as BenchmarkMetric,confirmation:confirm(45),regression:straddle?"straddle-press-to-handstand":"pike-press-to-handstand",demand:pressDemand,
    capacityLinks:[{capacityId:capacityIds.straightArmSupport,facetIds:[capacityFacetIds.tallSupport]},{capacityId:straddle?capacityIds.straddleCompression:capacityIds.pikeCompression,facetIds:[straddle?capacityFacetIds.activeStraddleLift:capacityFacetIds.activeDoubleLegLift]}],
  })),
] as const satisfies readonly Spec[];

const dense = (s: Spec): DemandProfile => Object.fromEntries(DEMAND_DOMAINS.map(d => [d, s.demand[d] ?? "low"])) as DemandProfile;
const equipmentFor = (s: Spec) => s.equipment.map(id => parseStableId("equipment", id));
const version = parseDefinitionVersion(1);
export const batchEExercises: readonly ExerciseDefinition[] = batchESpecs.map((s: Spec) => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: exerciseId(s.exercise), definitionVersion: version,
  lifecycle: "active", name: s.name, description: s.description,
  instructions: { how: s.how, cues: s.cues, avoid: s.avoid },
  media: [{ kind: "motion", reference: s.exercise, description: `${s.name}: complete entry, target and separate controlled exit` }],
  equipment: equipmentFor(s), roles: ["outcome-milestone", "benchmark-test", "development-drill"],
  graphLinks: [{ graphId: s.graphId, nodeId: nodeId(s.node), contribution: "milestone" }], capacityLinks: s.capacityLinks,
  prescriptionVariants: [
    { id: prescriptionId(s.exercise), label: s.node.includes("one-arm") ? "One side; alternate sets" : s.node.startsWith("repeated") ? "Two presses per set" : "One high hold", target: s.target, range: s.practiceRange ?? s.range, demand: dense(s) },
    { id: regressionPrescriptionId(s.exercise), label: "Reduced controlled practice", target: s.technique, range: s.techniqueRange, demand: dense(s) },
  ],
  benchmarkProtocolIds: [milestoneBenchmarkId(s.graphId, s.node)],
  relations: [{ kind: "regression", targetExerciseId: exerciseId(s.regression), fromPrescriptionVariantId: prescriptionId(s.exercise), targetPrescriptionVariantId: prescriptionId(s.regression) }],
  safetyNotes: s.safety,
}));
export const batchEProtocols: readonly BenchmarkProtocol[] = batchESpecs.map(s => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: milestoneBenchmarkId(s.graphId, s.node), definitionVersion: version,
  label: s.name, subject: { kind: "milestone", milestone: { graphId: s.graphId, nodeId: nodeId(s.node) } },
  exerciseId: exerciseId(s.exercise), prescriptionVariantId: prescriptionId(s.exercise),
  conditions: { equipment: equipmentFor(s), assistance: s.assistance, range: s.range },
  metric: s.metric, qualityCriteria: s.quality, safetyCriteria: s.safety, confirmation: s.confirmation,
}));
const deliveries = new Map(batchESpecs.map(s => [`${s.graphId}:${s.node}`, s]));
export const batchEDefinitionBundle: DefinitionBundle = {
  ...batchDDefinitionBundle, catalogueVersion: BATCH_E_CATALOGUE_VERSION,
  exercises: [...batchDDefinitionBundle.exercises, ...batchEExercises],
  benchmarkProtocols: [...batchDDefinitionBundle.benchmarkProtocols, ...batchEProtocols],
  graphs: batchDDefinitionBundle.graphs.map(graph => ({
    ...graph, definitionVersion: BATCH_E_CATALOGUE_VERSION,
    nodes: graph.nodes.map(node => deliveries.has(`${graph.id}:${node.id}`)
      ? { ...node, implementationStatus: "available", benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)] } : node),
  })),
};
export const batchEDefinitionHistory = [...batchDDefinitionHistory, batchEDefinitionBundle] as const;
export const batchERemainingBridges = batchDRemainingBridges.filter(b => !batchESpecs.some(s => s.bridgeId === b.id));
const subjectKey = (s: BenchmarkProtocol["subject"]) => JSON.stringify(s);
const oldSubjects = batchDDefinitionBundle.benchmarkProtocols.map(p => p.subject)
  .filter((s, i, all) => all.findIndex(other => subjectKey(s) === subjectKey(other)) === i);
export const batchEProjectionPolicy: ProjectionPolicy = {
  ...batchDProjectionPolicy, version: BATCH_E_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [
    ...batchDProjectionPolicy.subjectVersionCompatibilityRules,
    ...batchDProjectionPolicy.subjectVersionCompatibilityRules.filter(r => r.toCatalogueVersion === 6)
      .map(r => ({ ...r, toCatalogueVersion: BATCH_E_CATALOGUE_VERSION })),
    ...oldSubjects.map(subject => ({ subject, fromCatalogueVersion: batchDDefinitionBundle.catalogueVersion, toCatalogueVersion: BATCH_E_CATALOGUE_VERSION })),
  ],
};
