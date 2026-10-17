import { createHash } from "node:crypto";
import { createRequire } from "node:module";
createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
const a = load("app/vnext/progression/batchC.ts");
const prior = load("app/vnext/progression/batchB.ts");
const d = load("app/vnext/definitions/index.ts");
const c = load("app/vnext/contracts.ts");
const p = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const validation = load("app/vnext/validation.ts");
const motion = load("app/vnext/progression/batchCMotion.ts");
const workout = load("app/vnext/workoutUx.ts");
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)])) : v;
const json = (v) => JSON.stringify(canonical(v));
const hash = (v) => createHash("sha256").update(json(v)).digest("hex");
const failures = []; let checks = 0;
const scenarios = [];
const assert = (ok, message) => { checks++; if (!ok) failures.push(message); };
const bundle = a.batchCDefinitionBundle;
const old = prior.batchBDefinitionBundle;
const key = (ref) => `${ref.graphId}:${ref.nodeId}`;
const nodes = new Map(bundle.graphs.flatMap((g) => g.nodes.map((n) => [key({ graphId:g.id, nodeId:n.id }), n])));
const asOf = "2026-10-17T09:00:00.000Z";
const athleteId = "batch-c-check";
const equipment = [...new Set(bundle.exercises.flatMap((e) => e.equipment))];
const intentFor = (spec) => ({ schemaVersion:1, athleteId, updatedAt:asOf, goals:[{graphId:spec.graphId, targetNodeId:spec.node, priority:"primary"}], equipment, defaultSessionDemand:"standard", preferences:{specialistOptIn:false} });
const metric = (m) => m.kind === "duration-seconds" ? { value:m.minimum, unit:"seconds" }
  : m.kind === "repetitions" ? { value:m.minimum, unit:"repetitions" }
  : m.kind === "successful-attempts" ? { value:m.minimumSuccessful, unit:"attempts", attemptsTotal:m.maximumAttempts } : undefined;
let serial = 0;
const eventsFor = (protocol, version = 5, daysAgo = 12) => Array.from({length:Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions)}, (_,i) => {
  const when = new Date(Date.parse(asOf) - (daysAgo-i)*86400000).toISOString(); const id = `batch-c-fact-${++serial}`;
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
const replay = (spec, events, extra = {}) => p.projectAthleteState({athleteId, asOf, policy:a.batchCProjectionPolicy, definitionBundles:a.batchCDefinitionHistory,
  evidenceEvents:events, sessionPlans:[], sessionRecords:[], intent:intentFor(spec), ...extra });
const stateOf = (r) => { assert(r.ok && r.state, `Projection failed: ${r.issues.map((i) => i.message).join("; ")}`); return r.state; };
const evaluate = (spec, state, intent = intentFor(spec), variantId = `${spec.exercise}-standard`) => p.evaluateTrainability({
  request:{exerciseId:spec.exercise, exerciseDefinitionVersion:1, prescriptionVariantId:variantId}, state, bundle, asOf, policy:a.batchCProjectionPolicy, intent });
const generate = (spec, state, demand = "standard", intent = intentFor(spec), definitionBundle = bundle) => planning.generateVNextSession({
  createdAt:asOf, bundle:definitionBundle, intent, state, projectionPolicy:a.batchCProjectionPolicy, sessionDemand:demand, seed:`batch-c-${spec.node}-${demand}` }, planning.vNextGeneratorPolicy);
const has = (result, id) => result.plan?.items.some((item) => item.exerciseId === id);
const vr = validation.validateDefinitionBundle(bundle);
assert(vr.valid, `Candidate definitions invalid: ${vr.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
assert(bundle.catalogueVersion === 5 && old.catalogueVersion === 4 && d.vNextDefinitionBundles.length === 2, "Candidate replaced a historical/current bundle");
assert(bundle.exercises.length === 241 && bundle.benchmarkProtocols.length === 110, "Unexpected candidate volume");
assert(a.batchCSpecs.length === 6 && a.batchCRemainingBridges.length === 9, "Batch C registry coverage differs");
assert(bundle.graphs.flatMap((g) => g.nodes).filter((n) => n.implementationStatus === "available").length === 89, "Expected 89 backed / 14 remaining nodes");
for (const ex of old.exercises) assert(json(ex) === json(bundle.exercises.find((x) => x.id === ex.id)), `Historical exercise drift ${ex.id}`);
for (const pr of old.benchmarkProtocols) assert(json(pr) === json(bundle.benchmarkProtocols.find((x) => x.id === pr.id)), `Historical protocol drift ${pr.id}`);
assert(json(old.capacities) === json(bundle.capacities), "Capacity semantics changed");
for (const graph of old.graphs) for (const node of graph.nodes) {
  const after = nodes.get(`${graph.id}:${node.id}`); const changed = a.batchCSpecs.some((s) => s.graphId === graph.id && s.node === node.id);
  assert(json({...after, implementationStatus:node.implementationStatus, benchmarkProtocolIds:node.benchmarkProtocolIds}) === json(node), `Node semantics/edge drift ${node.id}`);
  assert(after.implementationStatus === (changed ? "available" : node.implementationStatus), `Out-of-scope node enabled ${node.id}`);
}
for (const spec of a.batchCSpecs) {
  const protocol = a.batchCProtocols.find((x) => x.exerciseId === spec.exercise);
  const ex = a.batchCExercises.find((x) => x.id === spec.exercise);
  assert(nodes.get(`${spec.graphId}:${spec.node}`).programmingBoundary === "stronger-gated", `Weakened boundary ${spec.node}`);
  const facts = prerequisites(spec).flatMap((pr) => eventsFor(pr, old.benchmarkProtocols.some(p=>p.id===pr.id) ? 4 : 5));
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
      assert(!generated.plan.items.some((i) => a.batchCSpecs.some((other) => other.exercise === i.exerciseId && other.node !== spec.node)), `Unrelated high-load Batch C destination leaked into plan ${spec.node}`);
    }
  }
  // Planner must reach the same gap on the frozen v4 definitions, before this overlay.
  const before = generate(spec,state,"standard",intentFor(spec),old);
  assert(!has(before,spec.exercise) && before.coverageGaps?.some((gap) => gap.targetMilestone?.nodeId === spec.node), `v4 did not expose the proven content gap ${spec.node}`);
  const broadFacts = [...old.benchmarkProtocols.flatMap((pr)=>eventsFor(pr,4)), ...facts.filter(e=>e.catalogueVersion===5)];
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
  const restricted = {...state, activeRestrictions:[{source:{kind:"evidence-event",eventId:"batch-c-restriction"}, decision:"block", demandDomains:["hand-wrist-bearing"],bodyRegions:["upper-limb"],occurredAt:asOf,reasonCodes:[p.projectionReasonCodes.activeRestriction]}]};
  assert(evaluate(spec,restricted).decision === "block" && !has(generate(spec,restricted,"challenge"),spec.exercise), `Symptom/restriction bypass ${spec.node}`);
  const recent = {...state,recentLoad:{...state.recentLoad,exposures:[{source:{kind:"evidence-event",eventId:"batch-c-recent-load"},occurredAt:asOf,participationSeconds:300,demand:ex.prescriptionVariants[0].demand,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:ex.prescriptionVariants[0].id}]}};
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
  for (const other of a.batchCSpecs.filter((other)=>other.node!==spec.node)) assert(success.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle === state.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle, `Counterpart inferred: ${spec.node} -> ${other.node}`);
  const unsupported = replay(spec,[...facts,...eventsFor(protocol,4)]);
  assert(!unsupported.state?.nodeStates.some((n) => n.milestone.nodeId === spec.node && n.lifecycle === "established"), `New achievement backcredited from v4 ${spec.node}`);
  // A completed reduced-dose session cannot stand in for exact benchmark evidence.
  const technique = ex.prescriptionVariants[1];
  const plan = { schemaVersion:1,id:`batch-c-technique-${spec.node}`,athleteId,createdAt:"2026-10-01T09:00:00.000Z",catalogueVersion:5,generatorPolicyId:planning.vNextGeneratorPolicy.id,generatorPolicyVersion:planning.vNextGeneratorPolicy.version,definitionReferences:[],intendedDurationSeconds:240,
    items:[{id:`batch-c-item-${spec.node}`,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:technique.id,purpose:"primary-development",plannedSeconds:240,demand:technique.demand,targetMilestone:{graphId:spec.graphId,nodeId:spec.node}}],rationale:[] };
  const records = [1,2,3].map((i) => ({schemaVersion:1,id:`batch-c-record-${spec.node}-${i}`,athleteId,planId:plan.id,startedAt:`2026-10-0${i+1}T09:00:00.000Z`,completedAt:`2026-10-0${i+1}T09:04:00.000Z`,recordedAt:`2026-10-0${i+1}T09:04:00.000Z`,status:"complete",itemOutcomes:[{planItemId:plan.items[0].id,status:"completed",participationSeconds:240,review:{outcome:"clean",difficulty:"right"}}]}));
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
for (const historical of prior.batchBDefinitionHistory) for (const protocol of historical.benchmarkProtocols) {
  const spec = a.batchCSpecs[0];
  const facts = eventsFor(protocol,historical.catalogueVersion);
  const state = stateOf(replay(spec,facts)); if (!state) continue;
  const finding = protocol.subject.kind === "milestone"
    ? state.nodeStates.find((n)=>json(n.milestone)===json(protocol.subject.milestone))
    : state.capacityFindings.find((n)=>json(n.capacity)===json(protocol.subject.capacity));
  assert(finding && (finding.lifecycle === "established" || finding.confirmationSatisfied), `Historical finding lost v${historical.catalogueVersion}:${protocol.id}`);
  assert(a.batchCSpecs.every((s)=>state.nodeStates.find((n)=>n.milestone.nodeId===s.node).lifecycle==="unknown"), `Historical evidence backdated new findings ${protocol.id}`);
}

// All existing subjects are explicitly compatible; no new subjects appear in rules.
for (const rule of a.batchCProjectionPolicy.subjectVersionCompatibilityRules.filter((r) => r.toCatalogueVersion === 5)) {
  assert(old.benchmarkProtocols.some((pr) => json(pr.subject) === json(rule.subject)), "Compatibility grants a new subject old evidence");
}

// Candidate coordinator is injected only in tests. Native v4 plans/records stay v4.
const runtimeModule = load("app/vnext/releaseCandidate/runtime.ts");
const persistence = load("app/vnext/persistence/index.ts");
const assessment = load("app/vnext/assessment/index.ts");
const acceptedA = load("app/vnext/production/batchARelease.ts");
const candidateCatalogue = { bundle, history:a.batchCDefinitionHistory, projectionPolicy:a.batchCProjectionPolicy };
const completionInput = generated => ({
  generated, startedAt:asOf,completedAt:"2026-10-17T09:25:00.000Z",recordedAt:"2026-10-17T09:25:00.000Z",status:"modified",
  timerItemOutcomes:generated.plan.items.filter(i=>["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"skipped",participationSeconds:0,participationBasis:"measured"})),
  reviewAnswers:generated.plan.items.filter(i=>!["preparation","recovery"].includes(i.purpose)).map(i=>({planItemId:i.id,status:"modified",participationSeconds:10,difficulty:"right",symptomOrInstability:false,modificationReason:"Synthetic isolated candidate check; no performance claimed."})),
});
for (const spec of a.batchCSpecs) {
  const store=persistence.createVNextShadowStore({databaseName:`batch-c-${spec.node}-${crypto.randomUUID()}`});
  await store.putAthleteIntent(intentFor(spec));
  for (const fact of prerequisites(spec).flatMap(pr=>eventsFor(pr,old.benchmarkProtocols.some(p=>p.id===pr.id)?4:5))) await store.appendEvidenceEvent(fact);
  const runtime=runtimeModule.createVNextReleaseCandidateRuntime({store,catalogue:candidateCatalogue,clock:()=>asOf});
  const snapshot=await runtime.refresh({athleteId,asOf,seed:"batch-c-candidate"});
  assert(snapshot.projection.lookup.catalogueVersion===5 && snapshot.projection.lookup.projectionVersion===5, "Candidate coordinator version mismatch");
  assert(snapshot.generated.plan?.catalogueVersion===5 && has(snapshot.generated,spec.exercise), `Coordinator omitted ${spec.node}`);
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
  assert(current.step.kind==='review'&&current.draft.catalogueVersion===5,'Candidate assessment lost native version');
  const review=assessment.buildAssessmentReview(current.draft,bundle,later.state);
  const protocol=a.batchCProtocols.find(pr=>pr.exerciseId===spec.exercise);
  const offer=review.guidedTests.find(o=>o.protocolId===protocol.id);
  assert(offer?.availability==='available',`Exact guided benchmark unreachable ${spec.node}`);
  if(offer?.availability==='available') {
    const occurredAt='2026-10-20T09:02:00.000Z';
    const saved=await runtime.commitGuidedTest({athleteId,draft:current.draft,result:{eventId:`batch-c-guided-${spec.node}`,observationSessionId:`batch-c-guided-occasion-${spec.node}`,protocolId:protocol.id,outcome:'clean',occurredAt,recordedAt:occurredAt,measurement:metric(protocol.metric),qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true},asOf:occurredAt});
    assert(saved.event.catalogueVersion===5&&saved.event.subject.milestone.nodeId===spec.node,'Guided result lost exact catalogue/protocol identity');
  }
  const exportBundle=await store.exportBundle(athleteId,{exportedAt:"2026-10-20T09:03:00.000Z",catalogueVersions:[1,2,3,4,5],projectionVersions:[5],definitionFingerprints:[await persistence.sha256(a.batchCDefinitionHistory)],policyVersions:[{id:a.batchCProjectionPolicy.id,version:5}]});
  const restored=persistence.createVNextShadowStore({databaseName:`batch-c-import-${crypto.randomUUID()}`});
  await restored.importBundle(exportBundle);
  const reopened=await runtimeModule.createVNextReleaseCandidateRuntime({store:restored,catalogue:candidateCatalogue,clock:()=>asOf}).refresh({athleteId,asOf:"2026-10-20T09:03:00.000Z"});
  assert(json(reopened.sources.sessionRecords)===json(retried.snapshot.sources.sessionRecords), "Candidate export/import changed immutable records");
  for(const version of [1,2,3,4]) assert(runtimeModule.runtimeDefinitionBundle(candidateCatalogue,version).catalogueVersion===version,"Native older bundle not recoverable");
}
assert(acceptedA.batchAProductionCatalogue.bundle.catalogueVersion===3, "Candidate activated in production");

const guides=motion.batchCMotionGuides;
const collinear=(a,b,c)=>Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))<0.001;
const seconds=(g,from,to)=>g.duration*(g.keyframeTimes[to]-g.keyframeTimes[from]);
for(const [ref,g] of Object.entries(guides)) {
  assert(a.batchCExercises.some(e=>e.media[0].reference===ref),`Orphan owned guide ${ref}`);
  assert(g.playback==="one-way-reset" && g.poses.length===g.gaze.length && g.poses.length===g.keyframeTimes.length,`Playback contract ${ref}`);
  assert(g.keyframeTimes[0]===0 && g.keyframeTimes.at(-1)===1 && g.keyframeTimes.every((t,i)=>i===0||t>g.keyframeTimes[i-1]),`Timing order ${ref}`);
  assert(g.phasePoseIndexes.length===g.phases.length && g.phasePoseIndexes.every(i=>g.poses[i]),`Missing review phase ${ref}`);
  assert(g.poses.every(pose=>Object.values(pose).every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=640&&v.y>=0&&v.y<=480)),`Clipped owned geometry ${ref}`);
  assert([g.poses[0].la.y,g.poses[0].ra.y,g.poses.at(-1).la.y,g.poses.at(-1).ra.y].every(y=>Math.abs(y-g.floor)<1e-6),`Missing grounded setup/landing ${ref}`);
  for(const pose of g.poses) for(const side of ["l","r"]) assert(json(pose[`${side}w`])===json(g.poses[0][`${side}w`]),`Moving grip ${ref}`);
  if(ref!=="assisted-full-planche-hold") assert(!g.equipment.includes("left-wall")&&!g.equipment.includes("wall")&&!g.visuals.some(v=>v.kind==="assistance"),`Assistance leaked into unassisted guide ${ref}`);
}
const balanceRefs=["freestanding-parallette-weight-shift","freestanding-parallette-one-hand-light-balance"];
for(const ref of balanceRefs) {
  const g=guides[ref];const hold=ref.includes('one-hand')?3:2;
  assert(g.paralletteView==='front-oblique',`Both grips must be visible ${ref}`);
  for(const [from,to] of [[4,5],[7,8]]) {
    assert(seconds(g,g.phasePoseIndexes[from],g.phasePoseIndexes[to])>=hold-1e-8,`Short side hold ${ref}`);
    assert(json(g.poses[g.phasePoseIndexes[from]])===json(g.poses[g.phasePoseIndexes[to]]),`Unsettled side hold ${ref}`);
  }
  for(const pose of g.poses.slice(g.phasePoseIndexes[2],g.phasePoseIndexes[9]+1))for(const side of ['l','r']){
    assert(collinear(pose[`${side}s`],pose[`${side}e`],pose[`${side}w`]),`Bent support arm ${ref}`);
    assert(collinear(pose[`${side}h`],pose[`${side}k`],pose[`${side}a`]),`Bent balance knee ${ref}`);
  }
  const left=g.poses[g.phasePoseIndexes[5]],right=g.poses[g.phasePoseIndexes[8]],centre=g.poses[g.phasePoseIndexes[6]];
  assert(left.lh.x<centre.lh.x&&right.lh.x>centre.lh.x,`Both side biases absent ${ref}`);
}
const eccentric=guides['freestanding-parallette-hspu-eccentric'];
assert(seconds(eccentric,...eccentric.benchmarkPoseWindow)>=4-1e-8,'Negative shorter than four seconds');
for(let i=eccentric.phasePoseIndexes[4]+1;i<eccentric.poses.length;i++)assert(eccentric.poses[i].ls.y>=eccentric.poses[i-1].ls.y-1e-6,'Eccentric exit invents an upward press');
for(const ref of ['partial-freestanding-parallette-hspu','freestanding-parallette-hspu','deficit-freestanding-parallette-hspu']){
  const g=guides[ref];const start=g.poses[g.phasePoseIndexes[3]],bottom=g.poses[g.phasePoseIndexes[4]],top=g.poses[g.phasePoseIndexes[5]];
  assert(json(start)===json(top)&&json(top)===json(g.poses[g.phasePoseIndexes[6]]),`Press lacks returned settled top ${ref}`);
  assert(seconds(g,g.phasePoseIndexes[5],g.phasePoseIndexes[6])>=2-1e-8,`Press top shorter than two seconds ${ref}`);
  assert(bottom.head.y>top.head.y&&!collinear(bottom.ls,bottom.le,bottom.lw),`Missing visible bent-arm bottom ${ref}`);
  for(const side of ['l','r'])assert(collinear(top[`${side}s`],top[`${side}e`],top[`${side}w`]),`Missing active lockout ${ref}`);
}
const crown=(g,key)=>g.poses[g.phasePoseIndexes[key]].head.y+27;
const partial=guides['partial-freestanding-parallette-hspu'],full=guides['freestanding-parallette-hspu'],deficit=guides['deficit-freestanding-parallette-hspu'];
assert(Math.abs(crown(partial,4)-(crown(partial,3)+400)/2)<1e-6,'Partial marker not halfway from crown top to bar plane');
assert(crown(full,4)===400&&crown(eccentric,4)===400,'Standard crown depth differs');
assert(crown(deficit,4)>400&&deficit.floor>432,'Deficit must be visibly below bars with clear floor');
for(const g of [full,eccentric,deficit]){
  const pad=g.visuals.find(v=>v.kind==='pad');
  assert(crown(g,4)<pad.y&&g.poses.every(p=>p.head.y+27<=pad.y),`Head/pad contact in ${g.label}`);
}
// Fixed segments and dense angular/IK samples prevent anatomical scaling.
const length=(pose,a,b)=>Math.hypot(pose[a].x-pose[b].x,pose[a].y-pose[b].y);
for(const [ref,g] of Object.entries(guides)) {
  const segments=[['ls','le'],['le','lw'],['rs','re'],['re','rw'],['ls','lh'],['rs','rh'],['lh','lk'],['lk','la'],['rh','rk'],['rk','ra']];
  for(const [a,b] of segments) {
    const expected=length(g.poses[0],a,b);
    for(let i=0;i<g.poses.length;i++) {
      assert(Math.abs(length(g.poses[i],a,b)-expected)<1e-4,`Segment scales ${ref}/${i}/${a}-${b}`);
      if(i) {
        const mid=Object.fromEntries(Object.entries(g.poses[i]).map(([k,v])=>[k,{x:(v.x+g.poses[i-1][k].x)/2,y:(v.y+g.poses[i-1][k].y)/2}]));
        assert(Math.abs(length(mid,a,b)/expected-1)<.04,`Interpolation deforms limb ${ref}/${i}/${a}-${b}`);
      }
    }
  }
  assert(g.poses.every(p=>[p.la,p.ra,p.lk,p.rk].every(j=>j.y<=g.floor+1e-6)),`Feet or knees cross floor ${ref}`);
}
for(const spec of a.batchCSpecs){
  const ex=a.batchCExercises.find(e=>e.id===spec.exercise);
  assert(ex.prescriptionVariants[0].range.startsWith('One '),'Practice must use one attempt/cycle per set');
}
// The candidate cannot become live through a default export, registration or grant.
for(const path of ["app/vnext/production/VNextProductionApp.tsx","app/vnext/production/batchAMedia.ts","app/vnext/definitions/index.ts"]) assert(!readFileSync(new URL(`../${path}`,import.meta.url),"utf8").includes("batchC"),`Candidate leaks into live entry ${path}`);
const fingerprint=hash({bundle,policy:a.batchCProjectionPolicy,guides});
const manifest=load("app/vnext/progression/batchCReviewManifest.ts").batchCReviewManifest;
assert(manifest.ownerAcceptance==="pending"&&manifest.productionEnabled===false,"Candidate cannot claim release approval");
assert(manifest.candidateFingerprint===fingerprint,`Candidate fingerprint drift: ${fingerprint}`);
for(const [ref,g] of Object.entries(guides)) assert(manifest.motionFingerprints[ref]===hash(g),`Motion fingerprint drift ${ref}`);
for(const [path,expected] of Object.entries(manifest.playerSources)) assert(createHash("sha256").update(readFileSync(new URL(`../${path}`,import.meta.url))).digest("hex")===expected,`Exact reviewed player changed ${path}`);
if(process.argv.includes("--scenarios")) console.log(JSON.stringify(scenarios,null,2));
console.log(JSON.stringify({checks,candidateFingerprint:fingerprint,motionFingerprints:Object.fromEntries(Object.entries(guides).map(([k,v])=>[k,hash(v)])),available:89,remaining:14},null,2));
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log(`Batch C: ${checks} focused checks passed.`);
