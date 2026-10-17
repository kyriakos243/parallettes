/** Isolated catalogue-v8 candidate. Production remains on accepted Batch A/v3. */
import {
  DEMAND_DOMAINS, DOMAIN_SCHEMA_VERSION, parseDefinitionVersion, parseProjectionVersion, parseStableId,
  type BenchmarkMetric, type BenchmarkProtocol, type DefinitionBundle, type DemandDomain,
  type DemandLevel, type DemandProfile, type ExerciseDefinition, type GraphId, type PrescriptionTarget,
} from "../contracts";
import { capacityIds, capacityFacetIds, exerciseId, graphIds, milestoneBenchmarkId, nodeId, prescriptionId, regressionPrescriptionId } from "../definitions/ids";
import { batchEDefinitionBundle, batchEDefinitionHistory, batchEProjectionPolicy, batchERemainingBridges } from "./batchE";
import type { ProjectionPolicy } from "../projection";

export const BATCH_F_CATALOGUE_VERSION = parseDefinitionVersion(8);
export const BATCH_F_PROJECTION_VERSION = parseProjectionVersion(8);
type Spec = Readonly<{
  bridgeId: string; graphId: GraphId; node: string; exercise: string; name: string;
  description: string; how: string; cues: readonly string[]; avoid: readonly string[];
  safety: readonly string[]; equipment: readonly string[]; assistance: string; range: string;
  quality: readonly string[]; target: PrescriptionTarget; technique: PrescriptionTarget;
  techniqueRange: string; practiceRange?: string; metric: BenchmarkMetric; confirmation: BenchmarkProtocol["confirmation"];
  regression: string; demand: Partial<Record<DemandDomain, DemandLevel>>;
  capacityLinks: ExerciseDefinition["capacityLinks"];
}>;
const confirm: BenchmarkProtocol["confirmation"]={qualifyingObservations:3,minimumDistinctSessions:3,allowedSources:["guided-test","session-record"],freshnessDays:30};
const metric: BenchmarkMetric={kind:"successful-attempts",minimumSuccessful:2,maximumAttempts:3};
const plancheDemand={"hand-wrist-bearing":"high","forward-straight-arm-upper-limb":"high","horizontal-bent-arm-push":"high","compression-trunk":"high"} as const;
const invertedDemand={...plancheDemand,"overhead-straight-arm-upper-limb":"high","vertical-bent-arm-push":"high","inversion-technical":"high"} as const;
const straightPressDemand={"hand-wrist-bearing":"high","forward-straight-arm-upper-limb":"high","overhead-straight-arm-upper-limb":"high","inversion-technical":"high","compression-trunk":"high"} as const;
const plancheLinks:ExerciseDefinition["capacityLinks"]=[{capacityId:capacityIds.straightArmSupport,facetIds:[capacityFacetIds.protractedForwardLoading]},{capacityId:capacityIds.horizontalBentArmPush,facetIds:[capacityFacetIds.horizontalRepeatableStrength]},{capacityId:capacityIds.bodyLineControl,facetIds:[capacityFacetIds.integratedLine]}];
const invertedLinks:ExerciseDefinition["capacityLinks"]=[...plancheLinks,{capacityId:capacityIds.overheadSupport,facetIds:[capacityFacetIds.activeElevation]}];
const assistance="Experienced coach present for the planned exit, but no coach, wall, band, head, knee or foot assistance during scoring. Fixed full grips on equal-height parallettes. Any catch or support ends that attempt as failed/modified.";
const safety=["Coach required. Keep head clear and use your trained exit; stop for symptoms or lost control.","Use stable equal-height non-slip bars with full-path clearance and a clear landing. Keep your existing prerequisites and trained exit; do not force depth. A coach catch is not clean evidence."];
const technique:PrescriptionTarget={kind:"quality",description:"One controlled reduced attempt; leave the path before control fades"};
/** Exact times/counts are authored coaching/product policy, not validated readiness or injury cutoffs. */
export const batchFSpecs=[
  {
    bridgeId:"bridge-planche-eccentric-push-up",graphId:graphIds.planche,node:"full-planche-push-up-eccentric",exercise:"full-planche-push-up-eccentric",name:"Full Planche Push-Up Lower",
    description:"A controlled full-length Planche lower to shoulder-at-elbow height, followed directly by a bent-arm landing. It does not demonstrate a push back up.",
    how:"Hold full Planche for 2s. Keep the body horizontal and legs together while lowering for at least 4s until shoulders reach elbow height. Fold and land directly from bent arms.",
    cues:["Keep straight knees and the full-length line","Lower shoulders to elbow height","Land from bent arms; do not press up"],
    avoid:["Do not pike, straddle, sag, shorten the lever, touch down early or recover upward before landing"],safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, establish an unassisted locked-elbow full Planche for two seconds with straight together legs and an approximately horizontal shoulder/hip/heel line. Lower continuously for at least four seconds by bending both elbows until the shoulders reach elbow height, retaining the same full-length horizontal line and feet clearance. Scoring ends at the controlled bottom. Fold the legs and land directly from bent arms without an upward recovery or concentric press. Ground setup/landing, coach catches, bent knees, straddle or a shortened lever do not substitute.",
    quality:["Both accepted attempts start from the held locked-arm full Planche","Each full-length horizontal lower lasts at least four seconds and reaches shoulder-at-elbow height","Head and feet remain clear through scoring; the separate bent-arm exit has no upward recovery"],
    target:{kind:"quality",description:"2s full Planche, 4s lower, bent-arm landing"},technique,
    practiceRange:"One complete four-second full-length lower per set after a two-second full-Planche start, then direct bent-arm fold/landing and planned rest. The two-of-three test series is separate.",
    techniqueRange:"One reduced full-length lower attempt; depth or lowering time may be less than the exact benchmark. Fold and land directly before control fades; no upward recovery and no exact confirmation.",metric,confirmation:confirm,regression:"deep-forward-loaded-parallette-push-up",demand:plancheDemand,capacityLinks:plancheLinks,
  },
  {
    bridgeId:"bridge-pushing-specialist",graphId:graphIds.parallettePushing,node:"full-planche-push-up",exercise:"full-planche-push-up",name:"Full Planche Push-Up",
    description:"One complete full-length Planche push-up: locked-arm horizontal start, shoulder-at-elbow bottom and return to the same locked-arm full Planche.",
    how:"Hold full Planche for 2s. Lower until shoulders reach elbow height, then press back to the same locked-arm horizontal line. Settle for 2s, then fold and land.",
    cues:["Keep the full-length legs-together line","Reach shoulder-at-elbow depth","Return to full lockout before landing"],
    avoid:["Do not count a negative alone, pike, straddle, knee bend, foot tap or partial press"],safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, start in an unassisted locked-elbow full Planche held two seconds. With straight together legs and an approximately horizontal shoulder/hip/heel line, lower until both shoulders reach elbow height, then press continuously back to the same locked-elbow full-Planche line held two seconds. Head and feet stay clear throughout the complete down-and-up cycle. Scoring ends at the returned full Planche; fold and land separately. An eccentric-only result, assisted ascent, shortened lever, pike, straddle, bent knees or early foot contact is not a repetition.",
    quality:["Both accepted attempts include the exact held full-Planche start and finish","The complete down-and-up cycle reaches shoulder-at-elbow height and returns to full lockout","Full-length horizontal line, straight together legs and unassisted feet/head clearance remain throughout"],
    target:{kind:"quality",description:"One full push-up; 2s Planche endpoints"},technique,
    practiceRange:"One complete full-Planche push-up per set with two-second held full-Planche endpoints, then separate fold/landing and planned rest. The two-of-three test series is separate.",
    techniqueRange:"One same-lever controlled partial down-and-up attempt, or stop into the trained exit before control fades. Reduced depth/endpoint holds or a lower without return cannot confirm the exact repetition.",metric,confirmation:confirm,regression:"full-planche-push-up-eccentric",demand:plancheDemand,capacityLinks:plancheLinks,
  },
  {
    bridgeId:"bridge-hspu-ninety-degree",graphId:graphIds.verticalPushHspu,node:"ninety-degree-hspu",exercise:"ninety-degree-parallette-hspu",name:"90-Degree Handstand Push-Up",
    description:"A handstand-to-bent-arm horizontal lower and complete press back to handstand. The bottom is not a locked-arm full Planche.",
    how:"Settle in handstand for 2s. Lower for at least 4s into a horizontal legs-together line with bent elbows. Press back to a straight handstand, hold 2s, then exit.",
    cues:["Keep knees straight and legs together","Control the bent-arm horizontal bottom","Press all the way back to handstand"],
    avoid:["Do not count a negative alone, a head-supported balance, pike/tuck or foot-assisted return"],safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, hold a straight unassisted locked-elbow handstand for two seconds, then lower continuously for at least four seconds into a feet-clear horizontal shoulder/hip/heel line with straight together legs and elbows bent to the reviewed approximately right-angle position, shoulders at elbow height. Reverse under control and press continuously back to a straight locked-elbow handstand held two seconds. Head never loads or contacts bars/floor. Scoring ends at the returned handstand before a separate trained exit. The bottom is a bent-arm horizontal position, not a locked-arm full Planche; a negative alone or a handstand-to-Planche connector does not demonstrate this complete cycle.",
    quality:["Both accepted attempts include two held straight handstand endpoints","Each controlled lower lasts at least four seconds and reaches the horizontal bent-arm bottom","The return is continuous and unassisted with straight together legs, full lockout and head clearance"],
    target:{kind:"quality",description:"One 90° cycle; 4s lower, 2s endpoints"},technique,
    practiceRange:"One complete 90-degree down-and-up attempt per set with a four-second lower and two-second handstand endpoints, then separate trained exit and planned rest. The full test series is separate.",
    techniqueRange:"One controlled partial-range down-and-up attempt with coach present; shorter range/holds are nonconfirming. Exit before head clearance or control becomes uncertain; never force an untrained return.",metric,confirmation:confirm,regression:"deficit-freestanding-parallette-hspu",demand:invertedDemand,capacityLinks:invertedLinks,
  },
  {
    bridgeId:"bridge-transition-specialist",graphId:graphIds.transitions,node:"full-planche-to-handstand-transition",exercise:"full-planche-to-handstand-transition",name:"Full Planche to Handstand",
    description:"A continuous straight-arm, legs-together press from held full Planche to held handstand. The straddle route and bent-arm 90-degree route remain separate.",
    how:"Hold full Planche for 2s. Keep elbows and knees locked and legs together as you raise the full-length line into handstand. Settle for 2s, then exit.",
    cues:["Start from a held full Planche","Keep both arms locked and legs together","Settle the straight handstand before exit"],
    avoid:["Do not bend elbows, straddle, pike, tuck, swing, reset on the floor or use a coach lift"],safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, hold an unassisted locked-elbow full Planche with straight together legs and horizontal shoulder/hip/heel line for two seconds. Press continuously through locked elbows, retaining the full-length straight legs-together body line as it rises into a straight unassisted handstand held two seconds. Head and feet stay clear; scoring ends at the held handstand before a separate trained exit. No bent-arm 90-degree route, straddle, pike, tuck, momentum or grounded restart substitutes for this exact straight-arm connector. Endpoint achievements alone never demonstrate it.",
    quality:["Both accepted attempts show the exact held full-Planche start","The full-length connector stays continuous, legs together and elbows/knees locked","The straight unassisted handstand settles two seconds before a separate exit"],
    target:{kind:"quality",description:"One straight-arm press; 2s endpoints"},technique,
    practiceRange:"One continuous full-length straight-arm full-Planche-to-handstand press per set with two-second endpoints, then a separate trained exit and planned rest. The test series is separate.",
    techniqueRange:"One same-route controlled partial connector attempt with legs together and elbows locked; endpoint holds/range may be reduced. Exit before control fades; reduced practice cannot confirm the full connector.",metric,confirmation:confirm,regression:"straddle-planche-to-handstand-press",demand:straightPressDemand,capacityLinks:[{capacityId:capacityIds.straightArmSupport,facetIds:[capacityFacetIds.protractedForwardLoading]},{capacityId:capacityIds.overheadSupport,facetIds:[capacityFacetIds.activeElevation]},{capacityId:capacityIds.bodyLineControl,facetIds:[capacityFacetIds.integratedLine]}],
  },
  {
    bridgeId:"bridge-transition-specialist",graphId:graphIds.transitions,node:"ninety-degree-handstand-to-planche-transition",exercise:"ninety-degree-handstand-to-planche-transition",name:"Handstand via 90° to Full Planche",
    description:"A lowering-first connection through bent-arm horizontal support, followed by active elbow lockout into full Planche. This is not purely eccentric and does not return to handstand.",
    how:"Hold handstand for 2s. Lower for at least 4s through the bent-arm horizontal position. Actively straighten the elbows into full Planche, hold 2s, then fold and land.",
    cues:["Control the horizontal bent-arm lower","Actively lock out into full Planche","Keep straight together legs until scoring ends"],
    avoid:["Do not call the active lockout passive lowering, touch down between endpoints or count a handstand return"],safety,equipment:["parallettes","floor"],assistance,
    range:"In at least two of up to three separate floor-reset attempts, hold a straight unassisted locked-elbow handstand for two seconds. Lower continuously for at least four seconds through the reviewed horizontal bent-arm approximately right-angle position with shoulders at elbow height, straight together legs and feet clear. Then actively extend both elbows into a locked-arm full Planche with horizontal shoulder/hip/heel line, held two seconds. Body orientation proceeds only from handstand toward horizontal; the active elbow extension may raise shoulders and is not a purely eccentric action. No return to handstand is demonstrated. Scoring ends at held full Planche before a separate fold/landing. No support, catch, foot tap, pike, straddle, tuck or grounded reset substitutes. The connection proves neither a full Planche push-up cycle nor a 90-degree handstand down-and-up repetition.",
    quality:["Both accepted attempts begin with the held straight handstand and a four-second controlled lower","The bent-arm horizontal position is visible, followed by an active unassisted elbow lockout","The final feet-clear horizontal full Planche holds two seconds; no return to handstand or intervening support"],
    target:{kind:"quality",description:"4s lower, active lockout, 2s endpoints"},technique,
    practiceRange:"One continuous handstand-through-90-degree-to-full-Planche connection per set, including the active lockout and two-second endpoints, then separate fold/landing and planned rest. The test series is separate.",
    techniqueRange:"One controlled reduced connection attempt with coach present; range/endpoint holds may be shorter. Active lockout stays explicit; stop into the trained exit before control fades. Partial, assisted or missing lockout cannot confirm the exact connector.",metric,confirmation:confirm,regression:"ninety-degree-parallette-hspu",demand:invertedDemand,capacityLinks:invertedLinks,
  },
] as const satisfies readonly Spec[];

const dense = (s: Spec): DemandProfile => Object.fromEntries(DEMAND_DOMAINS.map(d => [d, s.demand[d] ?? "low"])) as DemandProfile;
const equipmentFor = (s: Spec) => s.equipment.map(id => parseStableId("equipment", id));
const version = parseDefinitionVersion(1);
export const batchFExercises: readonly ExerciseDefinition[] = batchFSpecs.map((s: Spec) => ({
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
export const batchFProtocols: readonly BenchmarkProtocol[] = batchFSpecs.map(s => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION, id: milestoneBenchmarkId(s.graphId, s.node), definitionVersion: version,
  label: s.name, subject: { kind: "milestone", milestone: { graphId: s.graphId, nodeId: nodeId(s.node) } },
  exerciseId: exerciseId(s.exercise), prescriptionVariantId: prescriptionId(s.exercise),
  conditions: { equipment: equipmentFor(s), assistance: s.assistance, range: s.range },
  metric: s.metric, qualityCriteria: s.quality, safetyCriteria: s.safety, confirmation: s.confirmation,
}));
const deliveries = new Map(batchFSpecs.map(s => [`${s.graphId}:${s.node}`, s]));
export const batchFDefinitionBundle: DefinitionBundle = {
  ...batchEDefinitionBundle, catalogueVersion: BATCH_F_CATALOGUE_VERSION,
  exercises: [...batchEDefinitionBundle.exercises, ...batchFExercises],
  benchmarkProtocols: [...batchEDefinitionBundle.benchmarkProtocols, ...batchFProtocols],
  graphs: batchEDefinitionBundle.graphs.map(graph => ({
    ...graph, definitionVersion: BATCH_F_CATALOGUE_VERSION,
    nodes: graph.nodes.map(node => deliveries.has(`${graph.id}:${node.id}`)
      ? { ...node, implementationStatus: "available", benchmarkProtocolIds: [milestoneBenchmarkId(graph.id, node.id)] } : node),
  })),
};
export const batchFDefinitionHistory = [...batchEDefinitionHistory, batchFDefinitionBundle] as const;
export const batchFRemainingBridges = batchERemainingBridges.filter(b => !batchFSpecs.some(s => s.bridgeId === b.id));
const subjectKey = (s: BenchmarkProtocol["subject"]) => JSON.stringify(s);
const oldSubjects = batchEDefinitionBundle.benchmarkProtocols.map(p => p.subject)
  .filter((s, i, all) => all.findIndex(other => subjectKey(s) === subjectKey(other)) === i);
export const batchFProjectionPolicy: ProjectionPolicy = {
  ...batchEProjectionPolicy, version: BATCH_F_PROJECTION_VERSION,
  subjectVersionCompatibilityRules: [
    ...batchEProjectionPolicy.subjectVersionCompatibilityRules,
    ...batchEProjectionPolicy.subjectVersionCompatibilityRules.filter(r => r.toCatalogueVersion === 7)
      .map(r => ({ ...r, toCatalogueVersion: BATCH_F_CATALOGUE_VERSION })),
    ...oldSubjects.map(subject => ({ subject, fromCatalogueVersion: batchEDefinitionBundle.catalogueVersion, toCatalogueVersion: BATCH_F_CATALOGUE_VERSION })),
  ],
};
