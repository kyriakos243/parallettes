import { createHash } from "node:crypto";
import { createRequire } from "node:module";
createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { acceptedMotionSnapshot, compareMotionStructures } from "./lib/accepted-motion-snapshots.mjs";
const a = load("app/vnext/progression/batchF.ts");
const prior = load("app/vnext/progression/batchE.ts");
const d = load("app/vnext/definitions/index.ts");
const c = load("app/vnext/contracts.ts");
const p = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const validation = load("app/vnext/validation.ts");
const motion = load("app/vnext/progression/batchFMotion.ts");
const workout = load("app/vnext/workoutUx.ts");
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)])) : v;
const json = (v) => JSON.stringify(canonical(v));
const hash = (v) => createHash("sha256").update(json(v)).digest("hex");
const failures = []; let checks = 0;
const scenarios = [];
const assert = (ok, message) => { checks++; if (!ok) failures.push(message); };
const guides = acceptedMotionSnapshot("F", motion.batchFMotionGuides, assert);
const bundle = a.batchFDefinitionBundle;
const old = prior.batchEDefinitionBundle;
const key = (ref) => `${ref.graphId}:${ref.nodeId}`;
const nodes = new Map(bundle.graphs.flatMap((g) => g.nodes.map((n) => [key({ graphId:g.id, nodeId:n.id }), n])));
const asOf = "2026-10-17T09:00:00.000Z";
const athleteId = "batch-f-check";
const equipment = [...new Set(bundle.exercises.flatMap((e) => e.equipment))];
const intentFor = (spec) => ({ schemaVersion:1, athleteId, updatedAt:asOf, goals:[{graphId:spec.graphId, targetNodeId:spec.node, priority:"primary"}], equipment, defaultSessionDemand:"standard", preferences:{specialistOptIn:true} });
const metric = (m) => m.kind === "duration-seconds" ? { value:m.minimum, unit:"seconds" }
  : m.kind === "repetitions" ? { value:m.minimum, unit:"repetitions" }
  : m.kind === "successful-attempts" ? { value:m.minimumSuccessful, unit:"attempts", attemptsTotal:m.maximumAttempts } : undefined;
let serial = 0;
const eventsFor = (protocol, version = 8, daysAgo = 12) => Array.from({length:Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions)}, (_,i) => {
  const when = new Date(Date.parse(asOf) - (daysAgo-i)*86400000).toISOString(); const id = `batch-f-fact-${++serial}`;
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
const replay = (spec, events, extra = {}) => p.projectAthleteState({athleteId, asOf, policy:a.batchFProjectionPolicy, definitionBundles:a.batchFDefinitionHistory,
  evidenceEvents:events, sessionPlans:[], sessionRecords:[], intent:intentFor(spec), ...extra });
const stateOf = (r) => { assert(r.ok && r.state, `Projection failed: ${r.issues.map((i) => i.message).join("; ")}`); return r.state; };
const evaluate = (spec, state, intent = intentFor(spec), variantId = `${spec.exercise}-standard`) => p.evaluateTrainability({
  request:{exerciseId:spec.exercise, exerciseDefinitionVersion:1, prescriptionVariantId:variantId}, state, bundle, asOf, policy:a.batchFProjectionPolicy, intent });
const generate = (spec, state, demand = "standard", intent = intentFor(spec), definitionBundle = bundle) => planning.generateVNextSession({
  createdAt:asOf, bundle:definitionBundle, intent, state, projectionPolicy:a.batchFProjectionPolicy, sessionDemand:demand, seed:`batch-f-${spec.node}-${demand}` }, planning.vNextGeneratorPolicy);
const has = (result, id) => result.plan?.items.some((item) => item.exerciseId === id);
const vr = validation.validateDefinitionBundle(bundle);
assert(vr.valid, `Candidate definitions invalid: ${vr.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
assert(bundle.catalogueVersion === 8 && old.catalogueVersion === 7 && d.vNextDefinitionBundles.length === 2, "Candidate replaced a historical/current bundle");
assert(bundle.exercises.length === 255 && bundle.benchmarkProtocols.length === 124, "Unexpected candidate volume");
assert(a.batchFSpecs.length === 5 && a.batchFRemainingBridges.length === 0, "Batch F registry coverage differs");
assert(bundle.graphs.flatMap((g) => g.nodes).filter((n) => n.implementationStatus === "available").length === 103, "Expected 103 backed / 0 remaining nodes");
for (const ex of old.exercises) assert(json(ex) === json(bundle.exercises.find((x) => x.id === ex.id)), `Historical exercise drift ${ex.id}`);
for (const pr of old.benchmarkProtocols) assert(json(pr) === json(bundle.benchmarkProtocols.find((x) => x.id === pr.id)), `Historical protocol drift ${pr.id}`);
assert(json(old.capacities) === json(bundle.capacities), "Capacity semantics changed");
for (const graph of old.graphs) for (const node of graph.nodes) {
  const after = nodes.get(`${graph.id}:${node.id}`); const changed = a.batchFSpecs.some((s) => s.graphId === graph.id && s.node === node.id);
  assert(json({...after, implementationStatus:node.implementationStatus, benchmarkProtocolIds:node.benchmarkProtocolIds}) === json(node), `Node semantics/edge drift ${node.id}`);
  assert(after.implementationStatus === (changed ? "available" : node.implementationStatus), `Out-of-scope node enabled ${node.id}`);
}
for (const spec of a.batchFSpecs) {
  const protocol = a.batchFProtocols.find((x) => x.exerciseId === spec.exercise);
  const ex = a.batchFExercises.find((x) => x.id === spec.exercise);
  assert(nodes.get(`${spec.graphId}:${spec.node}`).programmingBoundary === "specialist", `Weakened boundary ${spec.node}`);
  const facts = prerequisites(spec).flatMap((pr) => eventsFor(pr, old.benchmarkProtocols.some(p=>p.id===pr.id) ? 7 : 8));
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
      if(demand==='standard')assert(structured.intervals.find(i=>i.kind==='work')?.durationSeconds>=guides[spec.exercise].duration,`Attempt window truncates complete prescribed effort ${spec.node}`);
      assert(!generated.plan.items.some((i) => a.batchFSpecs.some((other) => other.exercise === i.exerciseId && other.node !== spec.node)), `Unrelated high-load Batch F destination leaked into plan ${spec.node}`);
    }
  }
  // Planner must reach the same gap on the frozen v7 definitions, before this overlay.
  const before = generate(spec,state,"standard",intentFor(spec),old);
  assert(!has(before,spec.exercise) && before.coverageGaps?.some((gap) => gap.targetMilestone?.nodeId === spec.node), `v7 did not expose the proven content gap ${spec.node}`);
  const broadFacts = [...old.benchmarkProtocols.flatMap((pr)=>eventsFor(pr,7)), ...facts.filter(e=>e.catalogueVersion===8)];
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
  const restricted = {...state, activeRestrictions:[{source:{kind:"evidence-event",eventId:"batch-f-restriction"}, decision:"block", demandDomains:["hand-wrist-bearing"],bodyRegions:["upper-limb"],occurredAt:asOf,reasonCodes:[p.projectionReasonCodes.activeRestriction]}]};
  assert(evaluate(spec,restricted).decision === "block" && !has(generate(spec,restricted,"challenge"),spec.exercise), `Symptom/restriction bypass ${spec.node}`);
  const noOpt={...intentFor(spec),preferences:{specialistOptIn:false}};
  assert(evaluate(spec,state,noOpt).decision==='block'&&!has(generate(spec,state,'challenge',noOpt),spec.exercise),`No opt-in bypass ${spec.node}`);
  const broadGoal={...intentFor(spec),goals:[{graphId:spec.graphId,priority:'primary'}]};
  assert(!has(generate(spec,state,'challenge',broadGoal),spec.exercise),`Broad goal surprised athlete with specialist ${spec.node}`);
  const wrongGoal={...intentFor(spec),goals:[{graphId:spec.graphId,targetNodeId:old.graphs.find(g=>g.id===spec.graphId).nodes[0].id,priority:'primary'}]};
  assert(!has(generate(spec,state,'challenge',wrongGoal),spec.exercise),`Different explicit goal leaked specialist ${spec.node}`);
  const recent = {...state,recentLoad:{...state.recentLoad,exposures:[{source:{kind:"evidence-event",eventId:"batch-f-recent-load"},occurredAt:asOf,participationSeconds:300,demand:ex.prescriptionVariants[0].demand,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:ex.prescriptionVariants[0].id}]}};
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
  for (const other of a.batchFSpecs.filter((other)=>other.node!==spec.node)) assert(success.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle === state.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle, `Counterpart inferred: ${spec.node} -> ${other.node}`);
  const unsupported = replay(spec,[...facts,...eventsFor(protocol,7)]);
  assert(!unsupported.state?.nodeStates.some((n) => n.milestone.nodeId === spec.node && n.lifecycle === "established"), `New achievement backcredited from v7 ${spec.node}`);
  // A completed reduced-dose session cannot stand in for exact benchmark evidence.
  const technique = ex.prescriptionVariants[1];
  const plan = { schemaVersion:1,id:`batch-f-technique-${spec.node}`,athleteId,createdAt:"2026-10-01T09:00:00.000Z",catalogueVersion:8,generatorPolicyId:planning.vNextGeneratorPolicy.id,generatorPolicyVersion:planning.vNextGeneratorPolicy.version,definitionReferences:[],intendedDurationSeconds:240,
    items:[{id:`batch-f-item-${spec.node}`,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:technique.id,purpose:"primary-development",plannedSeconds:240,demand:technique.demand,targetMilestone:{graphId:spec.graphId,nodeId:spec.node}}],rationale:[] };
  const records = [1,2,3].map((i) => ({schemaVersion:1,id:`batch-f-record-${spec.node}-${i}`,athleteId,planId:plan.id,startedAt:`2026-10-0${i+1}T09:00:00.000Z`,completedAt:`2026-10-0${i+1}T09:04:00.000Z`,recordedAt:`2026-10-0${i+1}T09:04:00.000Z`,status:"complete",itemOutcomes:[{planItemId:plan.items[0].id,status:"completed",participationSeconds:240,review:{outcome:"clean",difficulty:"right"}}]}));
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
for (const historical of prior.batchEDefinitionHistory) for (const protocol of historical.benchmarkProtocols) {
  const spec = a.batchFSpecs[0];
  const facts = eventsFor(protocol,historical.catalogueVersion);
  const state = stateOf(replay(spec,facts)); if (!state) continue;
  const finding = protocol.subject.kind === "milestone"
    ? state.nodeStates.find((n)=>json(n.milestone)===json(protocol.subject.milestone))
    : state.capacityFindings.find((n)=>json(n.capacity)===json(protocol.subject.capacity));
  assert(finding && (finding.lifecycle === "established" || finding.confirmationSatisfied), `Historical finding lost v${historical.catalogueVersion}:${protocol.id}`);
  assert(a.batchFSpecs.every((s)=>state.nodeStates.find((n)=>n.milestone.nodeId===s.node).lifecycle==="unknown"), `Historical evidence backdated new findings ${protocol.id}`);
}

// All existing subjects are explicitly compatible; no new subjects appear in rules.
for (const rule of a.batchFProjectionPolicy.subjectVersionCompatibilityRules.filter((r) => r.toCatalogueVersion === 8)) {
  assert(old.benchmarkProtocols.some((pr) => json(pr.subject) === json(rule.subject)), "Compatibility grants a new subject old evidence");
}

// Candidate coordinator is injected only in tests. Native v7 plans/records stay v7.
const runtimeModule = load("app/vnext/releaseCandidate/runtime.ts");
const persistence = load("app/vnext/persistence/index.ts");
const assessment = load("app/vnext/assessment/index.ts");
const acceptedA = load("app/vnext/production/batchARelease.ts");
const candidateCatalogue = { bundle, history:a.batchFDefinitionHistory, projectionPolicy:a.batchFProjectionPolicy };
const completionInput = generated => ({
  generated, startedAt:asOf,completedAt:"2026-10-17T09:25:00.000Z",recordedAt:"2026-10-17T09:25:00.000Z",status:"modified",
  timerItemOutcomes:generated.plan.items.filter(i=>["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"skipped",participationSeconds:0,participationBasis:"measured"})),
  reviewAnswers:generated.plan.items.filter(i=>!["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"modified",participationSeconds:10,difficulty:"right",symptomOrInstability:false,modificationReason:"Synthetic isolated candidate check; no performance claimed."})),
});
for (const spec of a.batchFSpecs) {
  const store=persistence.createVNextShadowStore({databaseName:`batch-f-${spec.node}-${crypto.randomUUID()}`});
  await store.putAthleteIntent(intentFor(spec));
  for (const fact of prerequisites(spec).flatMap(pr=>eventsFor(pr,old.benchmarkProtocols.some(p=>p.id===pr.id)?7:8))) await store.appendEvidenceEvent(fact);
  const runtime=runtimeModule.createVNextReleaseCandidateRuntime({store,catalogue:candidateCatalogue,clock:()=>asOf});
  const snapshot=await runtime.refresh({athleteId,asOf,seed:"batch-f-candidate"});
  assert(snapshot.projection.lookup.catalogueVersion===8 && snapshot.projection.lookup.projectionVersion===8, "Candidate coordinator version mismatch");
  assert(snapshot.generated.plan?.catalogueVersion===8 && has(snapshot.generated,spec.exercise), `Coordinator omitted ${spec.node}`);
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
  assert(current.step.kind==='review'&&current.draft.catalogueVersion===8,'Candidate assessment lost native version');
  const review=assessment.buildAssessmentReview(current.draft,bundle,later.state);
  const protocol=a.batchFProtocols.find(pr=>pr.exerciseId===spec.exercise);
  const offer=review.guidedTests.find(o=>o.protocolId===protocol.id);
  assert(offer?.availability==='available',`Exact guided benchmark unreachable ${spec.node}`);
  if(offer?.availability==='available') {
    const occurredAt='2026-10-20T09:02:00.000Z';
    const saved=await runtime.commitGuidedTest({athleteId,draft:current.draft,result:{eventId:`batch-f-guided-${spec.node}`,observationSessionId:`batch-f-guided-occasion-${spec.node}`,protocolId:protocol.id,outcome:'clean',occurredAt,recordedAt:occurredAt,measurement:metric(protocol.metric),qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true},asOf:occurredAt});
    assert(saved.event.catalogueVersion===8&&saved.event.subject.milestone.nodeId===spec.node,'Guided result lost exact catalogue/protocol identity');
  }
  const exportBundle=await store.exportBundle(athleteId,{exportedAt:"2026-10-20T09:03:00.000Z",catalogueVersions:[1,2,3,4,5,6,7,8],projectionVersions:[8],definitionFingerprints:[await persistence.sha256(a.batchFDefinitionHistory)],policyVersions:[{id:a.batchFProjectionPolicy.id,version:8}]});
  const restored=persistence.createVNextShadowStore({databaseName:`batch-f-import-${crypto.randomUUID()}`});
  await restored.importBundle(exportBundle);
  const reopened=await runtimeModule.createVNextReleaseCandidateRuntime({store:restored,catalogue:candidateCatalogue,clock:()=>asOf}).refresh({athleteId,asOf:"2026-10-20T09:03:00.000Z"});
  assert(json(reopened.sources.sessionRecords)===json(retried.snapshot.sources.sessionRecords), "Candidate export/import changed immutable records");
  for(const version of [1,2,3,4,5,6,7]) assert(runtimeModule.runtimeDefinitionBundle(candidateCatalogue,version).catalogueVersion===version,"Native older bundle not recoverable");
}
assert(acceptedA.batchAProductionCatalogue.bundle.catalogueVersion===3, "Candidate activated in production");



// Batch F physical media contracts.
const worlds=motion.batchFWorldMotion;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),close=(a,b,tol=1e-5)=>Math.abs(a-b)<tol;
const seconds=(g,a,b)=>g.duration*(g.keyframeTimes[b]-g.keyframeTimes[a]);
const segments=[['ls','le'],['le','lw'],['rs','re'],['re','rw'],['ls','lh'],['rs','rh'],['lh','lk'],['lk','la'],['rh','rk'],['rk','ra']];
const sub3=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,clamp=x=>Math.min(1,Math.max(0,x));
const separation=(p,q,r,s)=>{
  const u=sub3(q,p),v=sub3(s,r),z=sub3(p,r),a=dot(u,u),e=dot(v,v),b=dot(u,v),c=dot(u,z),f=dot(v,z),den=a*e-b*b;
  let m=den>1e-9?clamp((b*f-c*e)/den):0,n=(b*m+f)/e;
  if(n<0){n=0;m=clamp(-c/a);}else if(n>1){n=1;m=clamp((b-c)/a);}
  return Math.hypot(p.x+m*u.x-r.x-n*v.x,p.y+m*u.y-r.y-n*v.y,p.z+m*u.z-r.z-n*v.z);
};
const locked=(pose,dim)=>['l','r'].every(side=>close(distance(pose[side+'s'],pose[side+'w']),dim.arm));
const horizontal=(pose)=>['l','r'].every(side=>close(pose[side+'s'].y,pose[side+'h'].y)&&close(pose[side+'h'].y,pose[side+'a'].y));
const handstand=(pose,dim)=>locked(pose,dim)&&['l','r'].every(side=>close(pose[side+'s'].x,pose[side+'h'].x)&&close(pose[side+'h'].x,pose[side+'a'].x)&&pose[side+'a'].y<pose[side+'h'].y&&pose[side+'h'].y<pose[side+'s'].y);
for(const[ref,g]of Object.entries(guides)){
  const w=worlds[ref].worldPoses,dim=worlds[ref].dimensions;
  assert(a.batchFExercises.some(e=>e.media[0].reference===ref),`Orphan guide ${ref}`);
  assert(g.playback==='one-way-reset'&&g.poses.length===g.gaze.length&&g.poses.length===w.length&&g.poses.length===g.keyframeTimes.length,`Playback mismatch ${ref}`);
  assert(g.keyframeTimes[0]===0&&g.keyframeTimes.at(-1)===1&&g.keyframeTimes.every((t,i)=>!i||t>g.keyframeTimes[i-1]),`Timing order ${ref}`);
  assert(g.phasePoseIndexes.length===g.phases.length&&g.phasePoseIndexes.every(i=>g.poses[i]),`Missing authored phase ${ref}`);
  assert(!g.equipment.some(e=>e.includes('wall'))&&!g.visuals.some(v=>v.kind==='assistance'),`Assisted proof ${ref}`);
  assert(g.poses.every(p=>Object.values(p).every(j=>Number.isFinite(j.x)&&Number.isFinite(j.y)&&j.x>=27&&j.x<=613&&j.y>=20&&j.y<=g.floor+1e-5)),`Clipped/floor-crossing pose ${ref}`);
  assert(g.poses.every(p=>p.head.y+27<g.floor),`Rendered head crosses floor ${ref}`);
  assert([w[0].la.y,w[0].ra.y,w.at(-1).la.y,w.at(-1).ra.y].every(y=>close(y,g.floor)),`Missing grounded setup/landing ${ref}`);
  for(let i=0;i<w.length;i++){
    for(const joint of Object.keys(w[i]))assert(compareMotionStructures(g.poses[i][joint],motion.projectBatchFPoint(w[i][joint],worlds[ref].camera),`$.${ref}.poses.${i}.${joint}`).equal,`Projection drift ${ref}/${i}/${joint}`);
    for(const side of ['l','r']){
      assert(distance(w[i][side+'w'],w[0][side+'w'])<1e-6,`Grip moves ${ref}/${i}/${side}`);
      assert(w[i][side+'a'].y<=g.floor+1e-5&&w[i][side+'k'].y<=g.floor+1e-5,`Foot/knee passes floor ${ref}/${i}/${side}`);
    }
    for(const[x,y]of segments){const expected=distance(w[0][x],w[0][y]);
      assert(close(distance(w[i][x],w[i][y]),expected,1e-4),`Bone scales ${ref}/${i}/${x}-${y}`);
      if(i){const mid=j=>Object.fromEntries(['x','y','z'].map(k=>[k,(w[i][j][k]+w[i-1][j][k])/2]));assert(Math.abs(distance(mid(x),mid(y))/expected-1)<.04,`Interpolation deforms bone ${ref}/${i}/${x}-${y}`);}
    }
  }
  // Include folded setup, split entry and landing, using actual bent limb segments.
  for(let i=0;i<w.length;i++)for(const fraction of [0,.5]){
    if(fraction&&i===w.length-1)continue;const next=w[i+1]??w[i];
    const pose=Object.fromEntries(Object.keys(w[i]).map(j=>[j,Object.fromEntries(['x','y','z'].map(k=>[k,w[i][j][k]*(1-fraction)+next[j][k]*fraction]))]));
    for(const l of ['l','r'])for(const arm of ['l','r'])for(const legPair of [[l+'h',l+'k'],[l+'k',l+'a']])for(const armPair of [[arm+'s',arm+'e'],[arm+'e',arm+'w']])assert(separation(pose[legPair[0]],pose[legPair[1]],pose[armPair[0]],pose[armPair[1]])>25,`Actual bent limb collision ${ref}/${i}+${fraction}/${legPair}-${armPair}`);
  }
  for(const window of g.holdWindows){
    assert(seconds(g,...window)>=2-1e-8,`Hold shorter than2 seconds ${ref}`);
    assert(Object.keys(w[window[0]]).every(j=>distance(w[window[0]][j],w[window[1]][j])<1e-5),`Unsettled endpoint ${ref}`);
    assert(locked(w[window[0]],dim),`Endpoint elbows not locked ${ref}`);
  }
  for(let i=g.scoreWindow[0];i<=g.scoreWindow[1];i++){
    for(const side of ['l','r'])assert(close(distance(w[i][side+'h'],w[i][side+'a']),dim.leg)&&w[i][side+'a'].y<g.floor-15,`Bent knee/foot help during score ${ref}/${i}`);
    assert(close(w[i].la.x,w[i].ra.x)&&close(w[i].la.y,w[i].ra.y)&&close(w[i].la.z,-w[i].ra.z)&&close(w[i].ra.z,dim.ankleWidth),`Legs open to straddle ${ref}/${i}`);
    for(const fraction of [0,.5]){
      if(fraction&&i===g.scoreWindow[1])continue;const next=w[i+1]??w[i];
      const p=Object.fromEntries(Object.keys(w[i]).map(j=>[j,Object.fromEntries(['x','y','z'].map(k=>[k,w[i][j][k]*(1-fraction)+next[j][k]*fraction]))]));
      for(const l of ['l','r'])for(const arm of ['l','r'])assert(separation(p[l+'h'],p[l+'a'],p[arm+'s'],p[arm+'w'])>5,`Arm/leg intersection ${ref}/${i}+${fraction}`);
    }
  }
  if(g.bottomFrame!==undefined){const p=w[g.bottomFrame];assert(horizontal(p),`Bottom is not horizontal ${ref}`);
    for(const side of ['l','r']){
      assert(close(p[side+'s'].y,p[side+'e'].y),`Shoulder fails to reach elbow height ${ref}`);
      assert(Math.abs(dot(sub3(p[side+'s'],p[side+'e']),sub3(p[side+'w'],p[side+'e'])))<1e-4,`Not a right-angle bent-arm bottom ${ref}`);
    }
  }
  if(g.loweringWindow){assert(seconds(g,...g.loweringWindow)>=4-1e-8,`Lower shorter than4 seconds ${ref}`);
    for(let i=g.loweringWindow[0]+1;i<=g.loweringWindow[1];i++)assert(w[i].ls.y>=w[i-1].ls.y-1e-6&&w[i].lh.y>=w[i-1].lh.y-1e-6,`Scored lower reverses upward ${ref}/${i}`);
  }
}
for(const ref of ['full-planche-push-up-eccentric','full-planche-push-up']){
  const g=guides[ref],w=worlds[ref].worldPoses,dim=worlds[ref].dimensions;
  assert(horizontal(w[g.holdWindows[0][0]]),'Full Planche start absent');
  for(let i=g.scoreWindow[0];i<=g.scoreWindow[1];i++)assert(horizontal(w[i]),`Planche lever tilts or pikes ${ref}/${i}`);
  if(ref.endsWith('eccentric'))for(let i=g.bottomFrame+1;i<w.length;i++)assert(w[i].ls.y>=w[i-1].ls.y-1e-6&&w[i].lh.y>=w[i-1].lh.y-1e-6&&!locked(w[i],dim),'Eccentric exit invents upward recovery');
  else assert(horizontal(w[g.scoreWindow[1]])&&locked(w[g.scoreWindow[1]],dim),'Push-up fails to return full Planche');
}
const cycle=guides['ninety-degree-parallette-hspu'],cw=worlds['ninety-degree-parallette-hspu'];
assert(handstand(cw.worldPoses[cycle.scoreWindow[0]],cw.dimensions)&&handstand(cw.worldPoses[cycle.scoreWindow[1]],cw.dimensions),'90-degree cycle lacks both handstand endpoints');
const press=guides['full-planche-to-handstand-transition'],pw=worlds['full-planche-to-handstand-transition'];
assert(horizontal(pw.worldPoses[press.scoreWindow[0]])&&handstand(pw.worldPoses[press.scoreWindow[1]],pw.dimensions),'Straight-arm connector endpoints wrong');
for(let i=press.scoreWindow[0];i<=press.scoreWindow[1];i++){
  assert(locked(pw.worldPoses[i],pw.dimensions),'Straight-arm connector bends elbows');
  if(i>press.scoreWindow[0])assert(pw.bodyAngles[i]>=pw.bodyAngles[i-1]-1e-6,'Straight-arm connector reverses downward');
}
const connection=guides['ninety-degree-handstand-to-planche-transition'],nw=worlds['ninety-degree-handstand-to-planche-transition'];
assert(handstand(nw.worldPoses[connection.scoreWindow[0]],nw.dimensions)&&horizontal(nw.worldPoses[connection.scoreWindow[1]])&&locked(nw.worldPoses[connection.scoreWindow[1]],nw.dimensions),'Lowering-first connector endpoints wrong');
for(let i=connection.scoreWindow[0]+1;i<=connection.scoreWindow[1];i++)assert(nw.bodyAngles[i]<=nw.bodyAngles[i-1]+1e-6,'Lowering-first connector invents handstand return');
assert(nw.worldPoses[connection.lockoutWindow[1]].ls.y<nw.worldPoses[connection.lockoutWindow[0]].ls.y,'Active lockout is missing');
assert(a.batchFSpecs.find(s=>s.node==='ninety-degree-handstand-to-planche-transition').range.includes('not a purely eccentric action'),'Active lockout mislabelled purely eccentric');
assert(a.batchFRemainingBridges.length===0,'Frozen progression registry not completely covered');
// An endpoint is a prerequisite, never transition proof. Freeze prior ownership.
for(const letter of ['B','C','D','E']){
  const ledger=load(`app/vnext/progression/batch${letter}MotionAcceptance.ts`)[`batch${letter}MotionAcceptance`];
  const reviewPath=`app/vnext/progression/batch${letter}ReviewManifest.ts`;
  const priorModule=load(`app/vnext/progression/batch${letter}.ts`),priorGuides=acceptedMotionSnapshot(letter,load(`app/vnext/progression/batch${letter}Motion.ts`)[`batch${letter}MotionGuides`],assert);
  assert(ledger.ownerMotionAcceptance==='accepted'&&ledger.productionEnabled===false&&ledger.deploymentTiming==='after-all-progression-batches-complete',`Prior owner gate changed ${letter}`);
  assert(ledger.candidateFingerprint===hash({bundle:priorModule[`batch${letter}DefinitionBundle`],policy:priorModule[`batch${letter}ProjectionPolicy`],guides:priorGuides}),`Accepted prior candidate changed ${letter}`);
  assert(ledger.reviewManifestSha256===createHash('sha256').update(readFileSync(new URL(`../${reviewPath}`,import.meta.url))).digest('hex'),`Accepted prior review changed ${letter}`);
  for(const[ref,expected]of Object.entries(ledger.motionFingerprints))assert(hash(priorGuides[ref])===expected,`Accepted prior guide changed ${letter}/${ref}`);
}

// The candidate cannot become live through a default export, registration or grant.
for(const path of ["app/vnext/production/VNextProductionApp.tsx","app/vnext/production/batchAMedia.ts","app/vnext/definitions/index.ts"]) assert(!readFileSync(new URL(`../${path}`,import.meta.url),"utf8").includes("batchF"),`Candidate leaks into live entry ${path}`);
const fingerprint=hash({bundle,policy:a.batchFProjectionPolicy,guides});
const manifest=load("app/vnext/progression/batchFReviewManifest.ts").batchFReviewManifest;
assert(manifest.ownerAcceptance==="pending"&&manifest.productionEnabled===false,"Candidate cannot claim release approval");
assert(manifest.candidateFingerprint===fingerprint,`Candidate fingerprint drift: ${fingerprint}`);
for(const [ref,g] of Object.entries(guides)) assert(manifest.motionFingerprints[ref]===hash(g),`Motion fingerprint drift ${ref}`);
for(const [path,expected] of Object.entries(manifest.playerSources)) assert(createHash("sha256").update(readFileSync(new URL(`../${path}`,import.meta.url))).digest("hex")===expected,`Exact reviewed player changed ${path}`);
if(process.argv.includes("--scenarios")) console.log(JSON.stringify(scenarios,null,2));
console.log(JSON.stringify({checks,candidateFingerprint:fingerprint,motionFingerprints:Object.fromEntries(Object.entries(guides).map(([k,v])=>[k,hash(v)])),available:103,remaining:0},null,2));
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log(`Batch F: ${checks} focused checks passed.`);
