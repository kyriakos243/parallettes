import { createHash } from "node:crypto";
import { createRequire } from "node:module";
createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { acceptedMotionSnapshot, compareMotionStructures } from "./lib/accepted-motion-snapshots.mjs";
const a = load("app/vnext/progression/batchD.ts");
const prior = load("app/vnext/progression/batchC.ts");
const d = load("app/vnext/definitions/index.ts");
const c = load("app/vnext/contracts.ts");
const p = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const validation = load("app/vnext/validation.ts");
const motion = load("app/vnext/progression/batchDMotion.ts");
const workout = load("app/vnext/workoutUx.ts");
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)])) : v;
const json = (v) => JSON.stringify(canonical(v));
const hash = (v) => createHash("sha256").update(json(v)).digest("hex");
const failures = []; let checks = 0;
const scenarios = [];
const assert = (ok, message) => { checks++; if (!ok) failures.push(message); };
const guides = acceptedMotionSnapshot("D", motion.batchDMotionGuides, assert);
const bundle = a.batchDDefinitionBundle;
const old = prior.batchCDefinitionBundle;
const key = (ref) => `${ref.graphId}:${ref.nodeId}`;
const nodes = new Map(bundle.graphs.flatMap((g) => g.nodes.map((n) => [key({ graphId:g.id, nodeId:n.id }), n])));
const asOf = "2026-10-17T09:00:00.000Z";
const athleteId = "batch-d-check";
const equipment = [...new Set(bundle.exercises.flatMap((e) => e.equipment))];
const intentFor = (spec) => ({ schemaVersion:1, athleteId, updatedAt:asOf, goals:[{graphId:spec.graphId, targetNodeId:spec.node, priority:"primary"}], equipment, defaultSessionDemand:"standard", preferences:{specialistOptIn:false} });
const metric = (m) => m.kind === "duration-seconds" ? { value:m.minimum, unit:"seconds" }
  : m.kind === "repetitions" ? { value:m.minimum, unit:"repetitions" }
  : m.kind === "successful-attempts" ? { value:m.minimumSuccessful, unit:"attempts", attemptsTotal:m.maximumAttempts } : undefined;
let serial = 0;
const eventsFor = (protocol, version = 6, daysAgo = 12) => Array.from({length:Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions)}, (_,i) => {
  const when = new Date(Date.parse(asOf) - (daysAgo-i)*86400000).toISOString(); const id = `batch-d-fact-${++serial}`;
  return { schemaVersion:1, id, athleteId, occurredAt:when, recordedAt:when, source:"guided-test", catalogueVersion:version,
    type:"performance_observed", subject:protocol.subject, outcome:"clean", benchmarkProtocolId:protocol.id,
    benchmarkProtocolVersion:protocol.definitionVersion, observationSessionId:`${id}-occasion`, measurement:metric(protocol.metric), assistance:protocol.conditions.assistance, range:protocol.conditions.range };
});
const protocolBySubject = (subject) => bundle.benchmarkProtocols.find((x) => json(x.subject) === json(subject));
const prerequisites = (spec) => {
  const protocols = new Map(); const visited = new Set();
  const visit = (ref) => {
    if (ref.kind === "milestone") {
      const k = key(ref.milestone); if (visited.has(k)) return; visited.add(k);
      const n = nodes.get(k); for (const next of n.prerequisiteRule?.allOf ?? []) visit(next);
      // Choose a single genuine anyOf route, never flatten it into allOf.
      if (n.prerequisiteRule?.anyOf?.length) visit(n.prerequisiteRule.anyOf[0]);
      const protocol = protocolBySubject({kind:"milestone", milestone:ref.milestone});
      if (!protocol) throw new Error(`Missing fixture prerequisite ${k}`); protocols.set(protocol.id, protocol);
    } else if (ref.kind === "capacity-facet") {
      const protocol = protocolBySubject({kind:"capacity-facet", capacity:ref.capacity});
      if (!protocol) throw new Error(`Missing capacity ${json(ref)}`); protocols.set(protocol.id, protocol);
    } else { const protocol = bundle.benchmarkProtocols.find((x) => x.id === ref.benchmarkProtocolId); protocols.set(protocol.id, protocol); }
  };
  const n = nodes.get(`${spec.graphId}:${spec.node}`);
  for (const ref of n.prerequisiteRule?.allOf ?? []) visit(ref);
  if (n.prerequisiteRule?.anyOf?.length) visit(n.prerequisiteRule.anyOf[0]);
  return [...protocols.values()];
};
const replay = (spec, events, extra = {}) => p.projectAthleteState({athleteId, asOf, policy:a.batchDProjectionPolicy, definitionBundles:a.batchDDefinitionHistory,
  evidenceEvents:events, sessionPlans:[], sessionRecords:[], intent:intentFor(spec), ...extra });
const stateOf = (r) => { assert(r.ok && r.state, `Projection failed: ${r.issues.map((i) => i.message).join("; ")}`); return r.state; };
const evaluate = (spec, state, intent = intentFor(spec), variantId = `${spec.exercise}-standard`) => p.evaluateTrainability({
  request:{exerciseId:spec.exercise, exerciseDefinitionVersion:1, prescriptionVariantId:variantId}, state, bundle, asOf, policy:a.batchDProjectionPolicy, intent });
const generate = (spec, state, demand = "standard", intent = intentFor(spec), definitionBundle = bundle) => planning.generateVNextSession({
  createdAt:asOf, bundle:definitionBundle, intent, state, projectionPolicy:a.batchDProjectionPolicy, sessionDemand:demand, seed:`batch-d-${spec.node}-${demand}` }, planning.vNextGeneratorPolicy);
const has = (result, id) => result.plan?.items.some((item) => item.exerciseId === id);
const vr = validation.validateDefinitionBundle(bundle);
assert(vr.valid, `Candidate definitions invalid: ${vr.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
assert(bundle.catalogueVersion === 6 && old.catalogueVersion === 5 && d.vNextDefinitionBundles.length === 2, "Candidate replaced a historical/current bundle");
assert(bundle.exercises.length === 245 && bundle.benchmarkProtocols.length === 114, "Unexpected candidate volume");
assert(a.batchDSpecs.length === 4 && a.batchDRemainingBridges.length === 7, "Batch D registry coverage differs");
assert(bundle.graphs.flatMap((g) => g.nodes).filter((n) => n.implementationStatus === "available").length === 93, "Expected 93 backed / 10 remaining nodes");
for (const ex of old.exercises) assert(json(ex) === json(bundle.exercises.find((x) => x.id === ex.id)), `Historical exercise drift ${ex.id}`);
for (const pr of old.benchmarkProtocols) assert(json(pr) === json(bundle.benchmarkProtocols.find((x) => x.id === pr.id)), `Historical protocol drift ${pr.id}`);
assert(json(old.capacities) === json(bundle.capacities), "Capacity semantics changed");
for (const graph of old.graphs) for (const node of graph.nodes) {
  const after = nodes.get(`${graph.id}:${node.id}`); const changed = a.batchDSpecs.some((s) => s.graphId === graph.id && s.node === node.id);
  assert(json({...after, implementationStatus:node.implementationStatus, benchmarkProtocolIds:node.benchmarkProtocolIds}) === json(node), `Node semantics/edge drift ${node.id}`);
  assert(after.implementationStatus === (changed ? "available" : node.implementationStatus), `Out-of-scope node enabled ${node.id}`);
}
for (const spec of a.batchDSpecs) {
  const protocol = a.batchDProtocols.find((x) => x.exerciseId === spec.exercise);
  const ex = a.batchDExercises.find((x) => x.id === spec.exercise);
  assert(nodes.get(`${spec.graphId}:${spec.node}`).programmingBoundary === "stronger-gated", `Weakened boundary ${spec.node}`);
  const facts = prerequisites(spec).flatMap((pr) => eventsFor(pr, old.benchmarkProtocols.some(p=>p.id===pr.id) ? 5 : 6));
  const state = stateOf(replay(spec, facts)); if (!state) continue;
  assert(state.nodeStates.find((n) => key(n.milestone) === `${spec.graphId}:${spec.node}`).lifecycle === "unknown", `Backdated new outcome ${spec.node}`);
  assert(evaluate(spec, state).decision === "allow", `Prerequisite-complete target blocked ${spec.node}: ${json(evaluate(spec,state))}`);
  for (const demand of ["technique", "standard", "challenge"]) {
    const generated = generate(spec,state,demand);
    assert(generated.ok && has(generated,spec.exercise), `Planner omitted ${spec.node}/${demand}: ${json(generated.issues)}`);
    if (generated.plan) {
      assert(validation.validateSessionPlan(generated.plan).valid, `Invalid plan ${spec.node}/${demand}`);
      assert(generated.plan.intendedDurationSeconds === 1500 || (generated.durationException?.actualSeconds === generated.plan.intendedDurationSeconds && generated.durationException?.targetSeconds === 1500), `Missing explicit safety exception ${spec.node}/${demand}: ${json(generated.durationException)}`);
      scenarios.push({node:spec.node,demand,durationSeconds:generated.plan.intendedDurationSeconds,exception:generated.durationException,items:generated.plan.items.map((i)=>({exerciseId:i.exerciseId,seconds:i.plannedSeconds,variant:i.prescriptionVariantId}))});
      const item = generated.plan.items.find((i) => i.exerciseId === spec.exercise);
      const structured = workout.structureWorkoutItem(item,bundle);
      assert(structured.intervals.reduce((n,i) => n+i.durationSeconds,0) === item.plannedSeconds, `Timing mismatch ${spec.node}`);
      assert(!generated.plan.items.some((i) => a.batchDSpecs.some((other) => other.exercise === i.exerciseId && other.node !== spec.node)), `Unrelated high-load Batch D destination leaked into plan ${spec.node}`);
    }
  }
  // Planner must reach the same gap on the frozen v5 definitions, before this overlay.
  const before = generate(spec,state,"standard",intentFor(spec),old);
  assert(!has(before,spec.exercise) && before.coverageGaps?.some((gap) => gap.targetMilestone?.nodeId === spec.node), `v5 did not expose the proven content gap ${spec.node}`);
  const broadFacts = [...old.benchmarkProtocols.flatMap((pr)=>eventsFor(pr,5)), ...facts.filter(e=>e.catalogueVersion===6)];
  const broad = stateOf(replay(spec,broadFacts));
  const broadPlan = generate(spec,broad);
  assert(broadPlan.ok && has(broadPlan,spec.exercise), `Broad established profile lost destination ${spec.node}`);
  const empty = stateOf(replay(spec,[]));
  assert(evaluate(spec,empty).decision !== "allow" && !has(generate(spec,empty,"challenge"),spec.exercise), `Challenge bypassed unknown prerequisites ${spec.node}`);
  const missingEquipment = {...intentFor(spec), equipment:[]};
  assert(evaluate(spec,state,missingEquipment).decision === "block" && !has(generate(spec,state,"challenge",missingEquipment),spec.exercise), `Equipment bypass ${spec.node}`);
  const stale = stateOf(replay(spec,facts.map((e) => ({...e,occurredAt:"2025-01-01T09:00:00.000Z",recordedAt:"2025-01-01T09:00:00.000Z"}))));
  assert(evaluate(spec,stale).decision !== "allow" && !has(generate(spec,stale,"challenge"),spec.exercise), `Stale prerequisites bypass ${spec.node}`);
  // Remove each direct prerequisite's evidence independently (including the pushing capacity).
  for (const ref of nodes.get(`${spec.graphId}:${spec.node}`).prerequisiteRule.allOf) {
    const subject = ref.kind === "milestone" ? {kind:ref.kind,milestone:ref.milestone} : {kind:ref.kind,capacity:ref.capacity};
    const reduced = stateOf(replay(spec,facts.filter((e) => json(e.subject) !== json(subject))));
    assert(evaluate(spec,reduced).decision !== "allow", `Missing direct prerequisite bypass ${spec.node}:${json(ref)}`);
  }
  const restricted = {...state, activeRestrictions:[{source:{kind:"evidence-event",eventId:"batch-d-restriction"}, decision:"block", demandDomains:["hand-wrist-bearing"],bodyRegions:["upper-limb"],occurredAt:asOf,reasonCodes:[p.projectionReasonCodes.activeRestriction]}]};
  assert(evaluate(spec,restricted).decision === "block" && !has(generate(spec,restricted,"challenge"),spec.exercise), `Symptom/restriction bypass ${spec.node}`);
  const recent = {...state,recentLoad:{...state.recentLoad,exposures:[{source:{kind:"evidence-event",eventId:"batch-d-recent-load"},occurredAt:asOf,participationSeconds:300,demand:ex.prescriptionVariants[0].demand,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:ex.prescriptionVariants[0].id}]}};
  assert(evaluate(spec,recent).decision !== "allow", `Recent high load bypass ${spec.node}`);
  const success = stateOf(replay(spec,[...facts,...eventsFor(protocol)]));
  assert(success.nodeStates.find((n) => n.milestone.nodeId === spec.node).lifecycle === "established", `Exact protocol not established ${spec.node}`);
  const once = eventsFor(protocol).map((e) => ({...e,observationSessionId:"same-test-occasion"}));
  const oneState = stateOf(replay(spec,[...facts,...once]));
  assert(oneState.nodeStates.find((n) => n.milestone.nodeId === spec.node).lifecycle !== "established", `One occasion falsely confirmed ${spec.node}`);
  const under = eventsFor(protocol).map((e) => ({...e,measurement:{...e.measurement,value:e.measurement.value-1}}));
  assert(stateOf(replay(spec,[...facts,...under])).nodeStates.find((n) => n.milestone.nodeId === spec.node).lifecycle !== "established", `Subminimum confirmed ${spec.node}`);
  // Same ID, older catalogue cannot claim an outcome absent in that catalogue.
  for (const malformed of [
    eventsFor(protocol).map((e)=>({...e,assistance:"wall assisted"})),
    eventsFor(protocol).map((e)=>({...e,range:"partial range"})),
    eventsFor(protocol).map((e)=>({...e,measurement:undefined})),
    eventsFor(protocol).map((e)=>({...e,source:"self-assessment",benchmarkProtocolId:undefined,benchmarkProtocolVersion:undefined})),
  ]) {
    const wrong = replay(spec,[...facts,...malformed]);
    assert(!wrong.state?.nodeStates.some((n)=>n.milestone.nodeId===spec.node && n.lifecycle==="established"), `Wrong conditions or weak evidence confirmed ${spec.node}`);
  }
  for (const other of a.batchDSpecs.filter((other)=>other.node!==spec.node)) assert(success.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle === state.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle, `Counterpart inferred: ${spec.node} -> ${other.node}`);
  const unsupported = replay(spec,[...facts,...eventsFor(protocol,5)]);
  assert(!unsupported.state?.nodeStates.some((n) => n.milestone.nodeId === spec.node && n.lifecycle === "established"), `New achievement backcredited from v5 ${spec.node}`);
  // A completed reduced-dose session cannot stand in for exact benchmark evidence.
  const technique = ex.prescriptionVariants[1];
  const plan = { schemaVersion:1,id:`batch-d-technique-${spec.node}`,athleteId,createdAt:"2026-10-01T09:00:00.000Z",catalogueVersion:6,generatorPolicyId:planning.vNextGeneratorPolicy.id,generatorPolicyVersion:planning.vNextGeneratorPolicy.version,definitionReferences:[],intendedDurationSeconds:240,
    items:[{id:`batch-d-item-${spec.node}`,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:technique.id,purpose:"primary-development",plannedSeconds:240,demand:technique.demand,targetMilestone:{graphId:spec.graphId,nodeId:spec.node}}],rationale:[] };
  const records = [1,2,3].map((i) => ({schemaVersion:1,id:`batch-d-record-${spec.node}-${i}`,athleteId,planId:plan.id,startedAt:`2026-10-0${i+1}T09:00:00.000Z`,completedAt:`2026-10-0${i+1}T09:04:00.000Z`,recordedAt:`2026-10-0${i+1}T09:04:00.000Z`,status:"complete",itemOutcomes:[{planItemId:plan.items[0].id,status:"completed",participationSeconds:240,review:{outcome:"clean",difficulty:"right"}}]}));
  // One initial record per plan; use separate immutable plans/IDs per session.
  const plans = records.map((r,i) => ({...plan,id:`${plan.id}-${i}`}));
  const rr = records.map((r,i) => ({...r,planId:plans[i].id}));
  const practice = stateOf(replay(spec,facts,{sessionPlans:plans,sessionRecords:rr}));
  assert(practice.nodeStates.find((n) => n.milestone.nodeId === spec.node).lifecycle !== "established", `Reduced practice falsely confirms ${spec.node}`);
  const overstated = rr.map((record)=>({...record,itemOutcomes:record.itemOutcomes.map((outcome)=>({...outcome,benchmarkObservation:{subject:protocol.subject,benchmarkProtocolId:protocol.id,benchmarkProtocolVersion:protocol.definitionVersion,outcome:"clean",measurement:metric(protocol.metric),assistance:protocol.conditions.assistance,range:protocol.conditions.range}}))}));
  const mismatch = replay(spec,facts,{sessionPlans:plans,sessionRecords:overstated});
  assert(!mismatch.state?.nodeStates.some((n)=>n.milestone.nodeId===spec.node && n.lifecycle==="established"), `Reduced prescription accepted standard-protocol claim ${spec.node}`);
  const expired = stateOf(replay(spec,[...facts,...eventsFor(protocol)],{asOf:"2027-02-17T09:00:00.000Z"}));
  const expiredFinding = expired.nodeStates.find((n)=>n.milestone.nodeId===spec.node);
  assert(expiredFinding.lifecycle === "established" && expiredFinding.confidence === "stale", `Freshness erased achievement ${spec.node}`);
}

// Every old benchmark subject replays into the candidate without changed meaning.
for (const historical of prior.batchCDefinitionHistory) for (const protocol of historical.benchmarkProtocols) {
  const spec = a.batchDSpecs[0];
  const facts = eventsFor(protocol,historical.catalogueVersion);
  const state = stateOf(replay(spec,facts)); if (!state) continue;
  const finding = protocol.subject.kind === "milestone"
    ? state.nodeStates.find((n)=>json(n.milestone)===json(protocol.subject.milestone))
    : state.capacityFindings.find((n)=>json(n.capacity)===json(protocol.subject.capacity));
  assert(finding && (finding.lifecycle === "established" || finding.confirmationSatisfied), `Historical finding lost v${historical.catalogueVersion}:${protocol.id}`);
  assert(a.batchDSpecs.every((s)=>state.nodeStates.find((n)=>n.milestone.nodeId===s.node).lifecycle==="unknown"), `Historical evidence backdated new findings ${protocol.id}`);
}

// All existing subjects are explicitly compatible; no new subjects appear in rules.
for (const rule of a.batchDProjectionPolicy.subjectVersionCompatibilityRules.filter((r) => r.toCatalogueVersion === 6)) {
  assert(old.benchmarkProtocols.some((pr) => json(pr.subject) === json(rule.subject)), "Compatibility grants a new subject old evidence");
}

// Candidate coordinator is injected only in tests. Native v5 plans/records stay v5.
const runtimeModule = load("app/vnext/releaseCandidate/runtime.ts");
const persistence = load("app/vnext/persistence/index.ts");
const assessment = load("app/vnext/assessment/index.ts");
const acceptedA = load("app/vnext/production/batchARelease.ts");
const candidateCatalogue = { bundle, history:a.batchDDefinitionHistory, projectionPolicy:a.batchDProjectionPolicy };
const completionInput = generated => ({
  generated, startedAt:asOf,completedAt:"2026-10-17T09:25:00.000Z",recordedAt:"2026-10-17T09:25:00.000Z",status:"modified",
  timerItemOutcomes:generated.plan.items.filter(i=>["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"skipped",participationSeconds:0,participationBasis:"measured"})),
  reviewAnswers:generated.plan.items.filter(i=>!["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"modified",participationSeconds:10,difficulty:"right",symptomOrInstability:false,modificationReason:"Synthetic isolated candidate check; no performance claimed."})),
});
for (const spec of a.batchDSpecs) {
  const store=persistence.createVNextShadowStore({databaseName:`batch-d-${spec.node}-${crypto.randomUUID()}`});
  await store.putAthleteIntent(intentFor(spec));
  for (const fact of prerequisites(spec).flatMap(pr=>eventsFor(pr,old.benchmarkProtocols.some(p=>p.id===pr.id)?5:6))) await store.appendEvidenceEvent(fact);
  const runtime=runtimeModule.createVNextReleaseCandidateRuntime({store,catalogue:candidateCatalogue,clock:()=>asOf});
  const snapshot=await runtime.refresh({athleteId,asOf,seed:"batch-d-candidate"});
  assert(snapshot.projection.lookup.catalogueVersion===6 && snapshot.projection.lookup.projectionVersion===6, "Candidate coordinator version mismatch");
  assert(snapshot.generated.plan?.catalogueVersion===6 && has(snapshot.generated,spec.exercise), `Coordinator omitted ${spec.node}`);
  if (!snapshot.generated.plan) continue;
  const prepared=runtime.prepareWorkoutCompletion(completionInput(snapshot.generated));
  const committed=await runtime.commitWorkoutCompletion({athleteId,prepared,asOf:"2026-10-17T09:25:00.000Z"});
  const retried=await runtime.commitWorkoutCompletion({athleteId,prepared,asOf:"2026-10-17T09:25:00.000Z"});
  assert(committed.append.record.status==="inserted" && retried.append.record.status==="duplicate", "Candidate completion retry duplicated facts");
  assert(retried.snapshot.sources.sessionRecords.length===1, "Candidate save not one record per plan");
  const guidedAt="2026-10-20T09:00:00.000Z";
  const later=await runtime.refresh({athleteId,asOf:guidedAt});
  let current=(await runtime.startAssessment({athleteId,asOf:guidedAt,createdAt:guidedAt,mode:"targeted-reconfirmation"})).assessment;
  const answerFor=step=>step.kind==='safety'?{kind:'safety',severity:'none'}
    :step.kind==='experience'?{kind:'experience',experience:'experienced'}
    :step.kind==='inactivity'?{kind:'inactivity',inactivity:'active'}
    :step.kind==='goals'?{kind:'goals',graphIds:[spec.graphId]}
    :step.kind==='equipment'?{kind:'equipment',equipment}
    :step.kind==='inversion'?{kind:'inversion',familiarity:'freestanding'}:{kind:'anchor',response:'not-yet'};
  let count=0;
  while(current.step.kind!=='review'&&count++<60) current=await runtime.answerAssessment({draft:current.draft,answer:answerFor(current.step),answeredAt:new Date(Date.parse(guidedAt)+count*1000).toISOString()});
  assert(current.step.kind==='review'&&current.draft.catalogueVersion===6,'Candidate assessment lost native version');
  const review=assessment.buildAssessmentReview(current.draft,bundle,later.state);
  const protocol=a.batchDProtocols.find(pr=>pr.exerciseId===spec.exercise);
  const offer=review.guidedTests.find(o=>o.protocolId===protocol.id);
  assert(offer?.availability==='available',`Exact guided benchmark unreachable ${spec.node}`);
  if(offer?.availability==='available') {
    const occurredAt='2026-10-20T09:02:00.000Z';
    const saved=await runtime.commitGuidedTest({athleteId,draft:current.draft,result:{eventId:`batch-d-guided-${spec.node}`,observationSessionId:`batch-d-guided-occasion-${spec.node}`,protocolId:protocol.id,outcome:'clean',occurredAt,recordedAt:occurredAt,measurement:metric(protocol.metric),qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true},asOf:occurredAt});
    assert(saved.event.catalogueVersion===6&&saved.event.subject.milestone.nodeId===spec.node,'Guided result lost exact catalogue/protocol identity');
  }
  const exportBundle=await store.exportBundle(athleteId,{exportedAt:"2026-10-20T09:03:00.000Z",catalogueVersions:[1,2,3,4,5,6],projectionVersions:[6],definitionFingerprints:[await persistence.sha256(a.batchDDefinitionHistory)],policyVersions:[{id:a.batchDProjectionPolicy.id,version:6}]});
  const restored=persistence.createVNextShadowStore({databaseName:`batch-d-import-${crypto.randomUUID()}`});
  await restored.importBundle(exportBundle);
  const reopened=await runtimeModule.createVNextReleaseCandidateRuntime({store:restored,catalogue:candidateCatalogue,clock:()=>asOf}).refresh({athleteId,asOf:"2026-10-20T09:03:00.000Z"});
  assert(json(reopened.sources.sessionRecords)===json(retried.snapshot.sources.sessionRecords), "Candidate export/import changed immutable records");
  for(const version of [1,2,3,4,5]) assert(runtimeModule.runtimeDefinitionBundle(candidateCatalogue,version).catalogueVersion===version,"Native older bundle not recoverable");
}
assert(acceptedA.batchAProductionCatalogue.bundle.catalogueVersion===3, "Candidate activated in production");


const worlds=motion.batchDWorldMotion;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const seconds=(g,from,to)=>g.duration*(g.keyframeTimes[to]-g.keyframeTimes[from]);
const close=(a,b,tol=1e-6)=>Math.abs(a-b)<tol;
const segments=[['ls','le'],['le','lw'],['rs','re'],['re','rw'],['ls','lh'],['rs','rh'],['lh','lk'],['lk','la'],['rh','rk'],['rk','ra']];
// Closest points on two finite 3D segments (not a screen-overlap test).
const sub3=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot3=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const clamp01=n=>Math.min(1,Math.max(0,n));
const segmentDistance=(p1,q1,p2,q2)=>{
  const u=sub3(q1,p1),v=sub3(q2,p2),r=sub3(p1,p2),a=dot3(u,u),e=dot3(v,v),b=dot3(u,v),c=dot3(u,r),f=dot3(v,r),den=a*e-b*b;
  let s=den>1e-9?clamp01((b*f-c*e)/den):0,t=(b*s+f)/e;
  if(t<0){t=0;s=clamp01(-c/a);}else if(t>1){t=1;s=clamp01((b-c)/a);}
  return Math.hypot(p1.x+s*u.x-p2.x-t*v.x,p1.y+s*u.y-p2.y-t*v.y,p1.z+s*u.z-p2.z-t*v.z);
};
for(const[ref,g]of Object.entries(guides)){
  const w=worlds[ref].worldPoses;
  assert(a.batchDExercises.some(e=>e.media[0].reference===ref),`Orphan guide ${ref}`);
  assert(g.playback==='one-way-reset'&&g.poses.length===g.gaze.length&&g.poses.length===g.keyframeTimes.length&&g.poses.length===w.length,`Playback mismatch ${ref}`);
  assert(g.keyframeTimes[0]===0&&g.keyframeTimes.at(-1)===1&&g.keyframeTimes.every((t,i)=>i===0||t>g.keyframeTimes[i-1]),`Timing order ${ref}`);
  assert(g.phasePoseIndexes.length===g.phases.length&&g.phasePoseIndexes.every(i=>g.poses[i]),`Missing authored phase ${ref}`);
  assert(!g.equipment.includes('wall')&&!g.equipment.includes('left-wall')&&!g.visuals.some(v=>v.kind==='assistance'),`Assistance leaked ${ref}`);
  assert(g.poses.every(pose=>Object.values(pose).every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=27&&v.x<=613&&v.y>=20&&v.y<=g.floor+2)),`Clipped/body-through-floor geometry ${ref}`);
  assert(g.poses.every(pose=>pose.head.y+27<g.floor),`Rendered head crosses floor ${ref}`);
  assert([w[0].la.y,w[0].ra.y,w.at(-1).la.y,w.at(-1).ra.y].every(y=>close(y,worlds[ref].camera.worldFloor)),`No grounded setup/landing ${ref}`);
  for(let i=0;i<w.length;i++){
    assert([w[i].la,w[i].ra,w[i].lk,w[i].rk].every(j=>j.y<=worlds[ref].camera.worldFloor+1e-6),`World knee/foot crosses physical floor ${ref}/${i}`);
    for(const joint of Object.keys(w[i]))assert(compareMotionStructures(g.poses[i][joint],motion.projectBatchDPoint(w[i][joint],worlds[ref].camera)).equal,`Guide diverges from fixed projection ${ref}/${i}/${joint}`);
    for(const side of ['l','r']){
      assert(json(w[i][`${side}w`])===json(w[0][`${side}w`]),`Grip moves ${ref}`);
      assert(distance(w[i][`${side}s`],w[i][`${side}w`])>109.99999,`Bent arm shortcut ${ref}/${i}`);
    }
    for(const[x,y]of segments){
      const expected=distance(w[0][x],w[0][y]);
      assert(close(distance(w[i][x],w[i][y]),expected,1e-4),`World bone scales ${ref}/${i}/${x}-${y}`);
      if(i){
        const midA=Object.fromEntries(['x','y','z'].map(k=>[k,(w[i][x][k]+w[i-1][x][k])/2]));
        const midB=Object.fromEntries(['x','y','z'].map(k=>[k,(w[i][y][k]+w[i-1][y][k])/2]));
        assert(Math.abs(distance(midA,midB)/expected-1)<.04,`Sparse samples deform world bone ${ref}/${i}/${x}-${y}`);
      }
    }
  }
  for(const window of [g.startHold,g.finishHold])assert(seconds(g,...window)>=2-1e-8&&Object.keys(w[window[0]]).every(j=>distance(w[window[0]][j],w[window[1]][j])<1e-5),`Endpoint not held two seconds ${ref}`);
  for(let i=g.startHold[0];i<=g.finishHold[1];i++)for(const side of ['l','r']){
    assert(w[i][`${side}a`].y<worlds[ref].camera.worldFloor-10,`Foot contact through connector ${ref}/${i}`);
    assert(close(distance(w[i][`${side}h`],w[i][`${side}a`]),160),`Knee tuck shortcut ${ref}/${i}`);
  }
  for(const side of ['l','r']){
    const start=w[g.startHold[0]],end=w[g.finishHold[1]];
    const lSit=ref==='handstand-to-l-sit-negative'?end:start;
    if(ref!=='straddle-planche-to-handstand-press')assert(lSit[`${side}h`].y>lSit[`${side}s`].y+90&&close(lSit[`${side}h`].x,lSit[`${side}s`].x)&&close(lSit[`${side}h`].y,lSit[`${side}a`].y),`False L-sit endpoint ${ref}`);
    if(ref==='straddle-planche-to-handstand-press')assert(close(start[`${side}s`].y,start[`${side}h`].y)&&close(start[`${side}h`].y,start[`${side}a`].y),`False horizontal Planche start ${ref}`);
    const top=ref==='handstand-to-l-sit-negative'?start:end;
    assert(top[`${side}a`].y<top[`${side}h`].y&&top[`${side}h`].y<top[`${side}s`].y&&close(top[`${side}a`].x,top[`${side}h`].x),`False straight handstand ${ref}`);
  }
}
// Non-adjacent leg/arm centre lines must not cross; the open straddle
// connector additionally keeps a visible gap at all samples and midpoints.
for(const[ref,g]of Object.entries(guides)){
  const w=worlds[ref].worldPoses,minGap=ref==='straddle-l-press-handstand-transition'?20:5;
  for(let i=g.startHold[0];i<=g.finishHold[1];i++)for(const fraction of [0,.5]){
    if(fraction&&i===g.finishHold[1])continue;
    const pose=Object.fromEntries(Object.keys(w[i]).map(j=>[j,Object.fromEntries(['x','y','z'].map(k=>[k,w[i][j][k]*(1-fraction)+w[i+1][j][k]*fraction]))]));
    for(const legSide of ['l','r'])for(const armSide of ['l','r'])assert(segmentDistance(pose[`${legSide}h`],pose[`${legSide}a`],pose[`${armSide}s`],pose[`${armSide}w`])>=minGap,`Leg crosses support arm ${ref}/${i}+${fraction}/${legSide}-${armSide}`);
  }
}
const negative=guides['handstand-to-l-sit-negative'],nw=worlds['handstand-to-l-sit-negative'].worldPoses;
assert(seconds(negative,...negative.performanceWindow)>=4-1e-8,'Negative lower shorter than four seconds');
for(let i=negative.performanceWindow[0]+1;i<=negative.performanceWindow[1];i++)assert(nw[i].lh.y>=nw[i-1].lh.y-1e-6,'Negative connector reverses into ascent');
for(const ref of ['full-l-pike-press-to-handstand-transition','handstand-to-l-sit-negative']){
  const g=guides[ref],w=worlds[ref].worldPoses;
  for(let i=g.startHold[0];i<=g.finishHold[1];i++)assert(close(w[i].la.x,w[i].ra.x)&&close(w[i].la.y,w[i].ra.y)&&close(Math.abs(w[i].la.z),8)&&close(w[i].la.z+w[i].ra.z,0),'Together-leg path opens to straddle');
}
for(const ref of ['straddle-l-press-handstand-transition','straddle-planche-to-handstand-press']){
  const g=guides[ref],w=worlds[ref].worldPoses;
  for(let i=g.startHold[0];i<=g.performanceWindow[1];i++)if(Math.abs(worlds[ref].bodyAngles[i])>1e-6)assert(w[i].ra.z-w[i].la.z>w[i].rh.z-w[i].lh.z+100,`Straddle closes before hips stack ${ref}/${i}`);
}
for(const spec of a.batchDSpecs)assert(spec.practiceRange.startsWith('One continuous'),'Practice asks for a whole test series');
assert(a.batchDRemainingBridges.every(b=>b.boundary==='specialist'),'Normal/stronger-gated gaps remain after Batch D');
// An endpoint is a prerequisite, never transition proof. Freeze prior ownership.
for(const letter of ['B','C']){
  const ledger=load(`app/vnext/progression/batch${letter}MotionAcceptance.ts`)[`batch${letter}MotionAcceptance`];
  const reviewPath=`app/vnext/progression/batch${letter}ReviewManifest.ts`;
  const priorModule=load(`app/vnext/progression/batch${letter}.ts`),priorGuides=acceptedMotionSnapshot(letter,load(`app/vnext/progression/batch${letter}Motion.ts`)[`batch${letter}MotionGuides`],assert);
  assert(ledger.ownerMotionAcceptance==='accepted'&&ledger.productionEnabled===false&&ledger.deploymentTiming==='after-all-progression-batches-complete',`Prior owner gate changed ${letter}`);
  assert(ledger.candidateFingerprint===hash({bundle:priorModule[`batch${letter}DefinitionBundle`],policy:priorModule[`batch${letter}ProjectionPolicy`],guides:priorGuides}),`Accepted prior candidate changed ${letter}`);
  assert(ledger.reviewManifestSha256===createHash('sha256').update(readFileSync(new URL(`../${reviewPath}`,import.meta.url))).digest('hex'),`Accepted prior review changed ${letter}`);
  for(const[ref,expected]of Object.entries(ledger.motionFingerprints))assert(hash(priorGuides[ref])===expected,`Accepted prior guide changed ${letter}/${ref}`);
}

// The candidate cannot become live through a default export, registration or grant.
for(const path of ["app/vnext/production/VNextProductionApp.tsx","app/vnext/production/batchAMedia.ts","app/vnext/definitions/index.ts"]) assert(!readFileSync(new URL(`../${path}`,import.meta.url),"utf8").includes("batchD"),`Candidate leaks into live entry ${path}`);
const fingerprint=hash({bundle,policy:a.batchDProjectionPolicy,guides});
const manifest=load("app/vnext/progression/batchDReviewManifest.ts").batchDReviewManifest;
assert(manifest.ownerAcceptance==="pending"&&manifest.productionEnabled===false,"Candidate cannot claim release approval");
assert(manifest.candidateFingerprint===fingerprint,`Candidate fingerprint drift: ${fingerprint}`);
for(const [ref,g] of Object.entries(guides)) assert(manifest.motionFingerprints[ref]===hash(g),`Motion fingerprint drift ${ref}`);
for(const [path,expected] of Object.entries(manifest.playerSources)) assert(createHash("sha256").update(readFileSync(new URL(`../${path}`,import.meta.url))).digest("hex")===expected,`Exact reviewed player changed ${path}`);
if(process.argv.includes("--scenarios")) console.log(JSON.stringify(scenarios,null,2));
console.log(JSON.stringify({checks,candidateFingerprint:fingerprint,motionFingerprints:Object.fromEntries(Object.entries(guides).map(([k,v])=>[k,hash(v)])),available:93,remaining:10},null,2));
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log(`Batch D: ${checks} focused checks passed.`);
