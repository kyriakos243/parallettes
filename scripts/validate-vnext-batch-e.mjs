import { createHash } from "node:crypto";
import { createRequire } from "node:module";
createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { acceptedMotionSnapshot, compareMotionStructures } from "./lib/accepted-motion-snapshots.mjs";
const a = load("app/vnext/progression/batchE.ts");
const prior = load("app/vnext/progression/batchD.ts");
const d = load("app/vnext/definitions/index.ts");
const c = load("app/vnext/contracts.ts");
const p = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const validation = load("app/vnext/validation.ts");
const motion = load("app/vnext/progression/batchEMotion.ts");
const workout = load("app/vnext/workoutUx.ts");
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)])) : v;
const json = (v) => JSON.stringify(canonical(v));
const hash = (v) => createHash("sha256").update(json(v)).digest("hex");
const failures = []; let checks = 0;
const scenarios = [];
const assert = (ok, message) => { checks++; if (!ok) failures.push(message); };
const guides = acceptedMotionSnapshot("E", motion.batchEMotionGuides, assert);
const bundle = a.batchEDefinitionBundle;
const old = prior.batchDDefinitionBundle;
const key = (ref) => `${ref.graphId}:${ref.nodeId}`;
const nodes = new Map(bundle.graphs.flatMap((g) => g.nodes.map((n) => [key({ graphId:g.id, nodeId:n.id }), n])));
const asOf = "2026-10-17T09:00:00.000Z";
const athleteId = "batch-e-check";
const equipment = [...new Set(bundle.exercises.flatMap((e) => e.equipment))];
const intentFor = (spec) => ({ schemaVersion:1, athleteId, updatedAt:asOf, goals:[{graphId:spec.graphId, targetNodeId:spec.node, priority:"primary"}], equipment, defaultSessionDemand:"standard", preferences:{specialistOptIn:true} });
const metric = (m) => m.kind === "duration-seconds" ? { value:m.minimum, unit:"seconds" }
  : m.kind === "repetitions" ? { value:m.minimum, unit:"repetitions" }
  : m.kind === "successful-attempts" ? { value:m.minimumSuccessful, unit:"attempts", attemptsTotal:m.maximumAttempts } : undefined;
let serial = 0;
const eventsFor = (protocol, version = 7, daysAgo = 12) => Array.from({length:Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions)}, (_,i) => {
  const when = new Date(Date.parse(asOf) - (daysAgo-i)*86400000).toISOString(); const id = `batch-e-fact-${++serial}`;
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
const replay = (spec, events, extra = {}) => p.projectAthleteState({athleteId, asOf, policy:a.batchEProjectionPolicy, definitionBundles:a.batchEDefinitionHistory,
  evidenceEvents:events, sessionPlans:[], sessionRecords:[], intent:intentFor(spec), ...extra });
const stateOf = (r) => { assert(r.ok && r.state, `Projection failed: ${r.issues.map((i) => i.message).join("; ")}`); return r.state; };
const evaluate = (spec, state, intent = intentFor(spec), variantId = `${spec.exercise}-standard`) => p.evaluateTrainability({
  request:{exerciseId:spec.exercise, exerciseDefinitionVersion:1, prescriptionVariantId:variantId}, state, bundle, asOf, policy:a.batchEProjectionPolicy, intent });
const generate = (spec, state, demand = "standard", intent = intentFor(spec), definitionBundle = bundle) => planning.generateVNextSession({
  createdAt:asOf, bundle:definitionBundle, intent, state, projectionPolicy:a.batchEProjectionPolicy, sessionDemand:demand, seed:`batch-e-${spec.node}-${demand}` }, planning.vNextGeneratorPolicy);
const has = (result, id) => result.plan?.items.some((item) => item.exerciseId === id);
const vr = validation.validateDefinitionBundle(bundle);
assert(vr.valid, `Candidate definitions invalid: ${vr.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
assert(bundle.catalogueVersion === 7 && old.catalogueVersion === 6 && d.vNextDefinitionBundles.length === 2, "Candidate replaced a historical/current bundle");
assert(bundle.exercises.length === 250 && bundle.benchmarkProtocols.length === 119, "Unexpected candidate volume");
assert(a.batchESpecs.length === 5 && a.batchERemainingBridges.length === 4, "Batch E registry coverage differs");
assert(bundle.graphs.flatMap((g) => g.nodes).filter((n) => n.implementationStatus === "available").length === 98, "Expected 98 backed / 5 remaining nodes");
for (const ex of old.exercises) assert(json(ex) === json(bundle.exercises.find((x) => x.id === ex.id)), `Historical exercise drift ${ex.id}`);
for (const pr of old.benchmarkProtocols) assert(json(pr) === json(bundle.benchmarkProtocols.find((x) => x.id === pr.id)), `Historical protocol drift ${pr.id}`);
assert(json(old.capacities) === json(bundle.capacities), "Capacity semantics changed");
for (const graph of old.graphs) for (const node of graph.nodes) {
  const after = nodes.get(`${graph.id}:${node.id}`); const changed = a.batchESpecs.some((s) => s.graphId === graph.id && s.node === node.id);
  assert(json({...after, implementationStatus:node.implementationStatus, benchmarkProtocolIds:node.benchmarkProtocolIds}) === json(node), `Node semantics/edge drift ${node.id}`);
  assert(after.implementationStatus === (changed ? "available" : node.implementationStatus), `Out-of-scope node enabled ${node.id}`);
}
for (const spec of a.batchESpecs) {
  const protocol = a.batchEProtocols.find((x) => x.exerciseId === spec.exercise);
  const ex = a.batchEExercises.find((x) => x.id === spec.exercise);
  assert(nodes.get(`${spec.graphId}:${spec.node}`).programmingBoundary === "specialist", `Weakened boundary ${spec.node}`);
  const facts = prerequisites(spec).flatMap((pr) => eventsFor(pr, old.benchmarkProtocols.some(p=>p.id===pr.id) ? 6 : 7));
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
      if(demand==='standard')assert(structured.intervals.find(i=>i.kind==='work')?.durationSeconds>=guides[spec.exercise].duration/ (spec.node.includes('one-arm')?2:1),`Attempt window truncates complete prescribed effort ${spec.node}`);
      assert(!generated.plan.items.some((i) => a.batchESpecs.some((other) => other.exercise === i.exerciseId && other.node !== spec.node)), `Unrelated high-load Batch E destination leaked into plan ${spec.node}`);
    }
  }
  // Planner must reach the same gap on the frozen v6 definitions, before this overlay.
  const before = generate(spec,state,"standard",intentFor(spec),old);
  assert(!has(before,spec.exercise) && before.coverageGaps?.some((gap) => gap.targetMilestone?.nodeId === spec.node), `v6 did not expose the proven content gap ${spec.node}`);
  const broadFacts = [...old.benchmarkProtocols.flatMap((pr)=>eventsFor(pr,6)), ...facts.filter(e=>e.catalogueVersion===7)];
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
  const restricted = {...state, activeRestrictions:[{source:{kind:"evidence-event",eventId:"batch-e-restriction"}, decision:"block", demandDomains:["hand-wrist-bearing"],bodyRegions:["upper-limb"],occurredAt:asOf,reasonCodes:[p.projectionReasonCodes.activeRestriction]}]};
  assert(evaluate(spec,restricted).decision === "block" && !has(generate(spec,restricted,"challenge"),spec.exercise), `Symptom/restriction bypass ${spec.node}`);
  const noOpt={...intentFor(spec),preferences:{specialistOptIn:false}};
  assert(evaluate(spec,state,noOpt).decision==='block'&&!has(generate(spec,state,'challenge',noOpt),spec.exercise),`No opt-in bypass ${spec.node}`);
  const broadGoal={...intentFor(spec),goals:[{graphId:spec.graphId,priority:'primary'}]};
  assert(!has(generate(spec,state,'challenge',broadGoal),spec.exercise),`Broad goal surprised athlete with specialist ${spec.node}`);
  const wrongGoal={...intentFor(spec),goals:[{graphId:spec.graphId,targetNodeId:old.graphs.find(g=>g.id===spec.graphId).nodes[0].id,priority:'primary'}]};
  assert(!has(generate(spec,state,'challenge',wrongGoal),spec.exercise),`Different explicit goal leaked specialist ${spec.node}`);
  const recent = {...state,recentLoad:{...state.recentLoad,exposures:[{source:{kind:"evidence-event",eventId:"batch-e-recent-load"},occurredAt:asOf,participationSeconds:300,demand:ex.prescriptionVariants[0].demand,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:ex.prescriptionVariants[0].id}]}};
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
  for (const other of a.batchESpecs.filter((other)=>other.node!==spec.node)) assert(success.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle === state.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle, `Counterpart inferred: ${spec.node} -> ${other.node}`);
  const unsupported = replay(spec,[...facts,...eventsFor(protocol,6)]);
  assert(!unsupported.state?.nodeStates.some((n) => n.milestone.nodeId === spec.node && n.lifecycle === "established"), `New achievement backcredited from v6 ${spec.node}`);
  // A completed reduced-dose session cannot stand in for exact benchmark evidence.
  const technique = ex.prescriptionVariants[1];
  const plan = { schemaVersion:1,id:`batch-e-technique-${spec.node}`,athleteId,createdAt:"2026-10-01T09:00:00.000Z",catalogueVersion:7,generatorPolicyId:planning.vNextGeneratorPolicy.id,generatorPolicyVersion:planning.vNextGeneratorPolicy.version,definitionReferences:[],intendedDurationSeconds:240,
    items:[{id:`batch-e-item-${spec.node}`,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:technique.id,purpose:"primary-development",plannedSeconds:240,demand:technique.demand,targetMilestone:{graphId:spec.graphId,nodeId:spec.node}}],rationale:[] };
  const records = [1,2,3].map((i) => ({schemaVersion:1,id:`batch-e-record-${spec.node}-${i}`,athleteId,planId:plan.id,startedAt:`2026-10-0${i+1}T09:00:00.000Z`,completedAt:`2026-10-0${i+1}T09:04:00.000Z`,recordedAt:`2026-10-0${i+1}T09:04:00.000Z`,status:"complete",itemOutcomes:[{planItemId:plan.items[0].id,status:"completed",participationSeconds:240,review:{outcome:"clean",difficulty:"right"}}]}));
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
for (const historical of prior.batchDDefinitionHistory) for (const protocol of historical.benchmarkProtocols) {
  const spec = a.batchESpecs[0];
  const facts = eventsFor(protocol,historical.catalogueVersion);
  const state = stateOf(replay(spec,facts)); if (!state) continue;
  const finding = protocol.subject.kind === "milestone"
    ? state.nodeStates.find((n)=>json(n.milestone)===json(protocol.subject.milestone))
    : state.capacityFindings.find((n)=>json(n.capacity)===json(protocol.subject.capacity));
  assert(finding && (finding.lifecycle === "established" || finding.confirmationSatisfied), `Historical finding lost v${historical.catalogueVersion}:${protocol.id}`);
  assert(a.batchESpecs.every((s)=>state.nodeStates.find((n)=>n.milestone.nodeId===s.node).lifecycle==="unknown"), `Historical evidence backdated new findings ${protocol.id}`);
}

// All existing subjects are explicitly compatible; no new subjects appear in rules.
for (const rule of a.batchEProjectionPolicy.subjectVersionCompatibilityRules.filter((r) => r.toCatalogueVersion === 7)) {
  assert(old.benchmarkProtocols.some((pr) => json(pr.subject) === json(rule.subject)), "Compatibility grants a new subject old evidence");
}

// Candidate coordinator is injected only in tests. Native v6 plans/records stay v6.
const runtimeModule = load("app/vnext/releaseCandidate/runtime.ts");
const persistence = load("app/vnext/persistence/index.ts");
const assessment = load("app/vnext/assessment/index.ts");
const acceptedA = load("app/vnext/production/batchARelease.ts");
const candidateCatalogue = { bundle, history:a.batchEDefinitionHistory, projectionPolicy:a.batchEProjectionPolicy };
const completionInput = generated => ({
  generated, startedAt:asOf,completedAt:"2026-10-17T09:25:00.000Z",recordedAt:"2026-10-17T09:25:00.000Z",status:"modified",
  timerItemOutcomes:generated.plan.items.filter(i=>["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"skipped",participationSeconds:0,participationBasis:"measured"})),
  reviewAnswers:generated.plan.items.filter(i=>!["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"modified",participationSeconds:10,difficulty:"right",symptomOrInstability:false,modificationReason:"Synthetic isolated candidate check; no performance claimed."})),
});
for (const spec of a.batchESpecs) {
  const store=persistence.createVNextShadowStore({databaseName:`batch-e-${spec.node}-${crypto.randomUUID()}`});
  await store.putAthleteIntent(intentFor(spec));
  for (const fact of prerequisites(spec).flatMap(pr=>eventsFor(pr,old.benchmarkProtocols.some(p=>p.id===pr.id)?6:7))) await store.appendEvidenceEvent(fact);
  const runtime=runtimeModule.createVNextReleaseCandidateRuntime({store,catalogue:candidateCatalogue,clock:()=>asOf});
  const snapshot=await runtime.refresh({athleteId,asOf,seed:"batch-e-candidate"});
  assert(snapshot.projection.lookup.catalogueVersion===7 && snapshot.projection.lookup.projectionVersion===7, "Candidate coordinator version mismatch");
  assert(snapshot.generated.plan?.catalogueVersion===7 && has(snapshot.generated,spec.exercise), `Coordinator omitted ${spec.node}`);
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
  assert(current.step.kind==='review'&&current.draft.catalogueVersion===7,'Candidate assessment lost native version');
  const review=assessment.buildAssessmentReview(current.draft,bundle,later.state);
  const protocol=a.batchEProtocols.find(pr=>pr.exerciseId===spec.exercise);
  const offer=review.guidedTests.find(o=>o.protocolId===protocol.id);
  assert(offer?.availability==='available',`Exact guided benchmark unreachable ${spec.node}`);
  if(offer?.availability==='available') {
    const occurredAt='2026-10-20T09:02:00.000Z';
    const saved=await runtime.commitGuidedTest({athleteId,draft:current.draft,result:{eventId:`batch-e-guided-${spec.node}`,observationSessionId:`batch-e-guided-occasion-${spec.node}`,protocolId:protocol.id,outcome:'clean',occurredAt,recordedAt:occurredAt,measurement:metric(protocol.metric),qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true},asOf:occurredAt});
    assert(saved.event.catalogueVersion===7&&saved.event.subject.milestone.nodeId===spec.node,'Guided result lost exact catalogue/protocol identity');
  }
  const exportBundle=await store.exportBundle(athleteId,{exportedAt:"2026-10-20T09:03:00.000Z",catalogueVersions:[1,2,3,4,5,6,7],projectionVersions:[7],definitionFingerprints:[await persistence.sha256(a.batchEDefinitionHistory)],policyVersions:[{id:a.batchEProjectionPolicy.id,version:7}]});
  const restored=persistence.createVNextShadowStore({databaseName:`batch-e-import-${crypto.randomUUID()}`});
  await restored.importBundle(exportBundle);
  const reopened=await runtimeModule.createVNextReleaseCandidateRuntime({store:restored,catalogue:candidateCatalogue,clock:()=>asOf}).refresh({athleteId,asOf:"2026-10-20T09:03:00.000Z"});
  assert(json(reopened.sources.sessionRecords)===json(retried.snapshot.sources.sessionRecords), "Candidate export/import changed immutable records");
  for(const version of [1,2,3,4,5,6]) assert(runtimeModule.runtimeDefinitionBundle(candidateCatalogue,version).catalogueVersion===version,"Native older bundle not recoverable");
}
assert(acceptedA.batchAProductionCatalogue.bundle.catalogueVersion===3, "Candidate activated in production");


// Batch E physical media contracts.
const worlds=motion.batchEWorldMotion;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const close=(a,b,tol=1e-5)=>Math.abs(a-b)<tol;
const seconds=(g,from,to)=>g.duration*(g.keyframeTimes[to]-g.keyframeTimes[from]);
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
  const w=worlds[ref].worldPoses,balance=ref.includes('one-arm');
  assert(a.batchEExercises.some(e=>e.media[0].reference===ref),`Orphan guide ${ref}`);
  assert(g.playback==='one-way-reset'&&g.poses.length===g.gaze.length&&g.poses.length===w.length&&g.poses.length===g.keyframeTimes.length,`Playback mismatch ${ref}`);
  assert(g.keyframeTimes[0]===0&&g.keyframeTimes.at(-1)===1&&g.keyframeTimes.every((t,i)=>!i||t>g.keyframeTimes[i-1]),`Timing order ${ref}`);
  assert(g.phasePoseIndexes.length===g.phases.length&&g.phasePoseIndexes.every(i=>g.poses[i]),`Missing phase ${ref}`);
  assert(g.poses.every(p=>Object.values(p).every(j=>Number.isFinite(j.x)&&Number.isFinite(j.y)&&j.x>=27&&j.x<=613&&j.y>=20&&j.y<=g.floor+1e-5)),`Clipped or floor-crossing joint ${ref}`);
  assert(g.poses.every(p=>p.head.y+27<g.floor),`Rendered head crosses floor ${ref}`);
  assert([w[0].la.y,w[0].ra.y,w.at(-1).la.y,w.at(-1).ra.y].every(y=>close(y,g.floor)),`Grounded setup/finish absent ${ref}`);
  assert(!g.equipment.some(e=>e.includes('wall')),`Wall assistance ${ref}`);
  assert(ref==='assisted-one-arm-parallette-balance'||!g.visuals.some(v=>v.kind==='assistance'),`Unexpected assistance ${ref}`);
  for(let i=0;i<w.length;i++){
    for(const joint of Object.keys(w[i]))assert(compareMotionStructures(g.poses[i][joint],motion.projectBatchEPoint(w[i][joint],worlds[ref].camera)).equal,`Projection drift ${ref}/${i}/${joint}`);
    for(const side of ['l','r']){
      assert(close(distance(w[i][`${side}s`],w[i][`${side}w`]),110),`Bent arm shortcut ${ref}/${i}/${side}`);
      if(!balance)assert(distance(w[i][`${side}w`],w[0][`${side}w`])<1e-6,`Fixed grip moved ${ref}/${i}`);
      assert(w[i][`${side}a`].y<=g.floor+1e-5&&w[i][`${side}k`].y<=g.floor+1e-5,`Foot/knee crosses floor ${ref}/${i}/${side}`);
    }
    for(const[x,y]of segments){
      const expected=distance(w[0][x],w[0][y]);
      assert(close(distance(w[i][x],w[i][y]),expected,1e-4),`Bone scales ${ref}/${i}/${x}-${y}`);
      if(i){const mid=j=>Object.fromEntries(['x','y','z'].map(k=>[k,(w[i][j][k]+w[i-1][j][k])/2]));assert(Math.abs(distance(mid(x),mid(y))/expected-1)<.04,`Interpolation deforms bone ${ref}/${i}/${x}-${y}`);}
    }
  }
  for(const window of g.holdWindows){
    assert(seconds(g,...window)>=(ref==='extended-v-sit-hold'?5:balance?3:2)-1e-8,`Hold too short ${ref}`);
    assert(Object.keys(w[window[0]]).every(j=>distance(w[window[0]][j],w[window[1]][j])<1e-5),`Unsettled endpoint ${ref}`);
    for(let i=window[0];i<=window[1];i++)for(const side of ['l','r'])assert(close(distance(w[i][`${side}h`],w[i][`${side}a`]),160)&&w[i][`${side}a`].y<g.floor-15,`Bent knee or foot help in scored hold ${ref}`);
  }
}
// Reject non-adjacent arm/leg intersections through scored paths and their linear midpoints.
for(const[ref,g]of Object.entries(guides)){
  const w=worlds[ref].worldPoses;
  const windows=ref.includes('press')?[[0,w.length-1]]:g.holdWindows;
  for(const[start,end]of windows)for(let i=start;i<=end;i++)for(const fraction of [0,.5]){
    if(fraction&&i===end)continue;
    const p=Object.fromEntries(Object.keys(w[i]).map(j=>[j,Object.fromEntries(['x','y','z'].map(k=>[k,w[i][j][k]*(1-fraction)+(w[i+1]??w[i])[j][k]*fraction]))]));
    for(const l of ['l','r'])for(const arm of ['l','r'])assert(segmentDistance(p[l+'h'],p[l+'a'],p[arm+'s'],p[arm+'w'])>5,`Arm/leg crossing ${ref}/${i}+${fraction}`);
  }
}
const high=guides['extended-v-sit-hold'],hw=worlds['extended-v-sit-hold'].worldPoses[high.holdWindows[0][0]];
for(const side of ['l','r']){
  const h=hw[`${side}h`],a=hw[`${side}a`];
  assert(Math.atan2(h.y-a.y,Math.hypot(h.x-a.x,h.z-a.z))*180/Math.PI>=75-1e-5,'High V is below75 degrees');
  assert(close(hw[`${side}s`].x,h.x)&&h.y>hw[`${side}s`].y+90,'High V leans back');
}
assert(close(hw.la.x,hw.ra.x)&&close(hw.la.y,hw.ra.y),'High V legs separate');
for(const ref of ['assisted-one-arm-parallette-balance','one-arm-parallette-handstand']){
  const g=guides[ref],w=worlds[ref].worldPoses;
  for(let n=0;n<2;n++){
    const support=n?'r':'l',free=n?'l':'r',window=g.holdWindows[n];
    for(let i=window[0];i<=window[1];i++){
      assert(distance(w[i][`${support}w`],w[0][`${support}w`])<1e-6,`Supporting hand moves ${ref}/${n}`);
      assert(w[i][`${free}w`].y<350&&distance(w[i][`${free}w`],w[0][`${free}w`])>60,`Free hand never clears bar ${ref}/${n}`);
      assert(w[i].ra.x-w[i].la.x>200,`One-arm straddle missing ${ref}/${n}`);
      const centre=(w[i].lh.x+w[i].rh.x)/2;assert(Math.abs(centre-w[i][`${support}w`].x)<15,`Pelvis fails to shift over support ${ref}/${n}`);
    }
    const regrip=g.phasePoseIndexes[n?19:7];
    assert(close(w[regrip].lw.y,400)&&close(w[regrip].rw.y,400),'Exit precedes full regrip');
    if(ref.startsWith('assisted'))for(const visual of g.visuals){
      assert(visual.kind==='assistance'&&visual.contactOnly&&['lh','rh'].includes(visual.joint),'Coach help misrepresented');
      const contact=g.contactWindows[n];
      assert(contact[0]<window[0]&&contact[1]>regrip,'Coach help absent before release or ends before regrip');
      for(let i=contact[0];i<=contact[1];i++)assert(visual.activePoseIndexes.includes(i),'Coach contact gap');
    }
  }
}
for(const ref of ['repeated-straddle-press-to-handstand','repeated-pike-press-to-handstand']){
  const g=guides[ref],w=worlds[ref].worldPoses;
  assert(g.ascentWindows.length===2&&g.holdWindows.length===2,'Repeated guide lacks two ascents/tops');
  assert(seconds(g,...g.resetWindow)>=2&&seconds(g,...g.resetWindow)<=4,'Reset outside2–4 seconds');
  for(let i=g.resetWindow[0];i<=g.resetWindow[1];i++){
    assert(close(w[i].la.y,g.floor)&&close(w[i].ra.y,g.floor),'Repeated reset is not grounded');
    assert(Object.keys(w[i]).every(j=>distance(w[i][j],w[g.resetWindow[0]][j])<1e-5),'Reset bounces or keeps moving');
  }
  for(const[start,end]of g.ascentWindows){
    assert(close(w[start].la.y,g.floor)&&close(w[start].ra.y,g.floor),'Press starts suspended');
    for(let i=start;i<=end;i++)for(const side of ['l','r'])assert(close(distance(w[i][`${side}h`],w[i][`${side}a`]),160),'Press uses a bent knee');
    for(let i=start+1;i<=end;i++)assert(w[i].lh.y<=w[i-1].lh.y+1e-5,'Ascent hips reverse');
    if(ref.includes('pike'))for(let i=start;i<=end;i++)assert(close(w[i].la.x,w[i].ra.x)&&close(w[i].la.y,w[i].ra.y)&&close(w[i].la.z,-w[i].ra.z)&&close(w[i].ra.z,8),'Pike opens to straddle');
    if(ref.includes('straddle'))for(let i=start+32;i<=end;i++)if(Math.abs(worlds[ref].bodyAngles[i])>1e-6)assert(w[i].ra.z-w[i].la.z>w[i].rh.z-w[i].lh.z+100,'Straddle closes before hip stack');
  }
}
assert(a.batchERemainingBridges.length===4&&a.batchERemainingBridges.every(b=>b.boundary==='specialist'),'Out-of-scope remaining registry');
// An endpoint is a prerequisite, never transition proof. Freeze prior ownership.
for(const letter of ['B','C','D']){
  const ledger=load(`app/vnext/progression/batch${letter}MotionAcceptance.ts`)[`batch${letter}MotionAcceptance`];
  const reviewPath=`app/vnext/progression/batch${letter}ReviewManifest.ts`;
  const priorModule=load(`app/vnext/progression/batch${letter}.ts`),priorGuides=acceptedMotionSnapshot(letter,load(`app/vnext/progression/batch${letter}Motion.ts`)[`batch${letter}MotionGuides`],assert);
  assert(ledger.ownerMotionAcceptance==='accepted'&&ledger.productionEnabled===false&&ledger.deploymentTiming==='after-all-progression-batches-complete',`Prior owner gate changed ${letter}`);
  assert(ledger.candidateFingerprint===hash({bundle:priorModule[`batch${letter}DefinitionBundle`],policy:priorModule[`batch${letter}ProjectionPolicy`],guides:priorGuides}),`Accepted prior candidate changed ${letter}`);
  assert(ledger.reviewManifestSha256===createHash('sha256').update(readFileSync(new URL(`../${reviewPath}`,import.meta.url))).digest('hex'),`Accepted prior review changed ${letter}`);
  for(const[ref,expected]of Object.entries(ledger.motionFingerprints))assert(hash(priorGuides[ref])===expected,`Accepted prior guide changed ${letter}/${ref}`);
}

// The candidate cannot become live through a default export, registration or grant.
for(const path of ["app/vnext/production/VNextProductionApp.tsx","app/vnext/production/batchAMedia.ts","app/vnext/definitions/index.ts"]) assert(!readFileSync(new URL(`../${path}`,import.meta.url),"utf8").includes("batchE"),`Candidate leaks into live entry ${path}`);
const fingerprint=hash({bundle,policy:a.batchEProjectionPolicy,guides});
const manifest=load("app/vnext/progression/batchEReviewManifest.ts").batchEReviewManifest;
assert(manifest.ownerAcceptance==="pending"&&manifest.productionEnabled===false,"Candidate cannot claim release approval");
assert(manifest.candidateFingerprint===fingerprint,`Candidate fingerprint drift: ${fingerprint}`);
for(const [ref,g] of Object.entries(guides)) assert(manifest.motionFingerprints[ref]===hash(g),`Motion fingerprint drift ${ref}`);
for(const [path,expected] of Object.entries(manifest.playerSources)) assert(createHash("sha256").update(readFileSync(new URL(`../${path}`,import.meta.url))).digest("hex")===expected,`Exact reviewed player changed ${path}`);
if(process.argv.includes("--scenarios")) console.log(JSON.stringify(scenarios,null,2));
console.log(JSON.stringify({checks,candidateFingerprint:fingerprint,motionFingerprints:Object.fromEntries(Object.entries(guides).map(([k,v])=>[k,hash(v)])),available:98,remaining:5},null,2));
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log(`Batch E: ${checks} focused checks passed.`);
