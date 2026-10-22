import { createHash } from "node:crypto";
import { createRequire } from "node:module";
createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
const a = load("app/vnext/progression/batchA.ts");
const d = load("app/vnext/definitions/index.ts");
const c = load("app/vnext/contracts.ts");
const p = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const validation = load("app/vnext/validation.ts");
const motion = load("app/vnext/progression/batchAMotion.ts");
const workout = load("app/vnext/workoutUx.ts");
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)])) : v;
const json = (v) => JSON.stringify(canonical(v));
const hash = (v) => createHash("sha256").update(json(v)).digest("hex");
const failures = []; let checks = 0;
const scenarios = [];
const assert = (ok, message) => { checks++; if (!ok) failures.push(message); };
const bundle = a.batchADefinitionBundle;
const old = d.vNextDefinitionBundle;
const key = (ref) => `${ref.graphId}:${ref.nodeId}`;
const nodes = new Map(bundle.graphs.flatMap((g) => g.nodes.map((n) => [key({ graphId:g.id, nodeId:n.id }), n])));
const asOf = "2026-10-17T09:00:00.000Z";
const athleteId = "batch-a-check";
const equipment = [...new Set(bundle.exercises.flatMap((e) => e.equipment))];
const intentFor = (spec) => ({ schemaVersion:1, athleteId, updatedAt:asOf, goals:[{graphId:spec.graphId, targetNodeId:spec.node, priority:"primary"}], equipment, defaultSessionDemand:"standard", preferences:{specialistOptIn:false} });
const metric = (m) => m.kind === "duration-seconds" ? { value:m.minimum, unit:"seconds" }
  : m.kind === "repetitions" ? { value:m.minimum, unit:"repetitions" }
  : m.kind === "successful-attempts" ? { value:m.minimumSuccessful, unit:"attempts", attemptsTotal:m.maximumAttempts } : undefined;
let serial = 0;
const eventsFor = (protocol, version = 3, daysAgo = 12) => Array.from({length:Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions)}, (_,i) => {
  const when = new Date(Date.parse(asOf) - (daysAgo-i)*86400000).toISOString(); const id = `batch-a-fact-${++serial}`;
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
const replay = (spec, events, extra = {}) => p.projectAthleteState({athleteId, asOf, policy:a.batchAProjectionPolicy, definitionBundles:a.batchADefinitionHistory,
  evidenceEvents:events, sessionPlans:[], sessionRecords:[], intent:intentFor(spec), ...extra });
const stateOf = (r) => { assert(r.ok && r.state, `Projection failed: ${r.issues.map((i) => i.message).join("; ")}`); return r.state; };
const evaluate = (spec, state, intent = intentFor(spec), variantId = `${spec.exercise}-standard`) => p.evaluateTrainability({
  request:{exerciseId:spec.exercise, exerciseDefinitionVersion:1, prescriptionVariantId:variantId}, state, bundle, asOf, policy:a.batchAProjectionPolicy, intent });
const generate = (spec, state, demand = "standard", intent = intentFor(spec), definitionBundle = bundle) => planning.generateVNextSession({
  createdAt:asOf, bundle:definitionBundle, intent, state, projectionPolicy:a.batchAProjectionPolicy, sessionDemand:demand, seed:`batch-a-${spec.node}-${demand}` }, planning.vNextGeneratorPolicy);
const has = (result, id) => result.plan?.items.some((item) => item.exerciseId === id);
const vr = validation.validateDefinitionBundle(bundle);
assert(vr.valid, `Candidate definitions invalid: ${vr.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
assert(bundle.catalogueVersion === 3 && old.catalogueVersion === 2 && d.vNextDefinitionBundles.length === 2, "Candidate replaced a historical/current bundle");
assert(bundle.exercises.length === 230 && bundle.benchmarkProtocols.length === 99, "Unexpected candidate volume");
assert(a.batchASpecs.length === 5 && a.batchARemainingBridges.length === 16, "Batch A registry coverage differs");
assert(bundle.graphs.flatMap((g) => g.nodes).filter((n) => n.implementationStatus === "available").length === 78, "Expected 78 backed / 25 remaining nodes");
for (const ex of old.exercises) assert(json(ex) === json(bundle.exercises.find((x) => x.id === ex.id)), `Historical exercise drift ${ex.id}`);
for (const pr of old.benchmarkProtocols) assert(json(pr) === json(bundle.benchmarkProtocols.find((x) => x.id === pr.id)), `Historical protocol drift ${pr.id}`);
assert(json(old.capacities) === json(bundle.capacities), "Capacity semantics changed");
for (const graph of old.graphs) for (const node of graph.nodes) {
  const after = nodes.get(`${graph.id}:${node.id}`); const changed = a.batchASpecs.some((s) => s.graphId === graph.id && s.node === node.id);
  assert(json({...after, implementationStatus:node.implementationStatus, benchmarkProtocolIds:node.benchmarkProtocolIds}) === json(node), `Node semantics/edge drift ${node.id}`);
  assert(after.implementationStatus === (changed ? "available" : node.implementationStatus), `Out-of-scope node enabled ${node.id}`);
}
for (const spec of a.batchASpecs) {
  const protocol = a.batchAProtocols.find((x) => x.exerciseId === spec.exercise);
  const ex = a.batchAExercises.find((x) => x.id === spec.exercise);
  assert(nodes.get(`${spec.graphId}:${spec.node}`).programmingBoundary === "stronger-gated", `Weakened boundary ${spec.node}`);
  const facts = prerequisites(spec).flatMap((pr) => eventsFor(pr, 2));
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
      assert(!generated.plan.items.some((i) => a.batchASpecs.some((other) => other.exercise === i.exerciseId && other.node !== spec.node)), `Unrelated high-load Batch A destination leaked into plan ${spec.node}`);
    }
  }
  // Planner must reach the same gap on the frozen v2 definitions, before this overlay.
  const before = generate(spec,state,"standard",intentFor(spec),old);
  assert(!has(before,spec.exercise) && before.coverageGaps?.some((gap) => gap.targetMilestone?.nodeId === spec.node), `v2 did not expose the proven content gap ${spec.node}`);
  const broadFacts = old.benchmarkProtocols.flatMap((pr)=>eventsFor(pr,2));
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
  const restricted = {...state, activeRestrictions:[{source:{kind:"evidence-event",eventId:"batch-a-restriction"}, decision:"block", demandDomains:["hand-wrist-bearing"],bodyRegions:["upper-limb"],occurredAt:asOf,reasonCodes:[p.projectionReasonCodes.activeRestriction]}]};
  assert(evaluate(spec,restricted).decision === "block" && !has(generate(spec,restricted,"challenge"),spec.exercise), `Symptom/restriction bypass ${spec.node}`);
  const recent = {...state,recentLoad:{...state.recentLoad,exposures:[{source:{kind:"evidence-event",eventId:"batch-a-recent-load"},occurredAt:asOf,participationSeconds:300,demand:ex.prescriptionVariants[0].demand,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:ex.prescriptionVariants[0].id}]}};
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
  for (const other of a.batchASpecs.filter((other)=>other.node!==spec.node)) assert(success.nodeStates.find((n)=>n.milestone.nodeId===other.node).lifecycle !== "established", `Counterpart inferred: ${spec.node} -> ${other.node}`);
  const unsupported = replay(spec,[...facts,...eventsFor(protocol,2)]);
  assert(!unsupported.state?.nodeStates.some((n) => n.milestone.nodeId === spec.node && n.lifecycle === "established"), `New achievement backcredited from v2 ${spec.node}`);
  // A completed reduced-dose session cannot stand in for exact benchmark evidence.
  const technique = ex.prescriptionVariants[1];
  const plan = { schemaVersion:1,id:`batch-a-technique-${spec.node}`,athleteId,createdAt:"2026-10-01T09:00:00.000Z",catalogueVersion:3,generatorPolicyId:planning.vNextGeneratorPolicy.id,generatorPolicyVersion:planning.vNextGeneratorPolicy.version,definitionReferences:[],intendedDurationSeconds:240,
    items:[{id:`batch-a-item-${spec.node}`,exerciseId:ex.id,exerciseDefinitionVersion:1,prescriptionVariantId:technique.id,purpose:"primary-development",plannedSeconds:240,demand:technique.demand,targetMilestone:{graphId:spec.graphId,nodeId:spec.node}}],rationale:[] };
  const records = [1,2,3].map((i) => ({schemaVersion:1,id:`batch-a-record-${spec.node}-${i}`,athleteId,planId:plan.id,startedAt:`2026-10-0${i+1}T09:00:00.000Z`,completedAt:`2026-10-0${i+1}T09:04:00.000Z`,recordedAt:`2026-10-0${i+1}T09:04:00.000Z`,status:"complete",itemOutcomes:[{planItemId:plan.items[0].id,status:"completed",participationSeconds:240,review:{outcome:"clean",difficulty:"right"}}]}));
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
for (const historical of d.vNextDefinitionBundles) for (const protocol of historical.benchmarkProtocols) {
  const spec = a.batchASpecs[0];
  const facts = eventsFor(protocol,historical.catalogueVersion);
  const state = stateOf(replay(spec,facts)); if (!state) continue;
  const finding = protocol.subject.kind === "milestone"
    ? state.nodeStates.find((n)=>json(n.milestone)===json(protocol.subject.milestone))
    : state.capacityFindings.find((n)=>json(n.capacity)===json(protocol.subject.capacity));
  assert(finding && (finding.lifecycle === "established" || finding.confirmationSatisfied), `Historical finding lost v${historical.catalogueVersion}:${protocol.id}`);
  assert(a.batchASpecs.every((s)=>state.nodeStates.find((n)=>n.milestone.nodeId===s.node).lifecycle==="unknown"), `Historical evidence backdated new findings ${protocol.id}`);
}

// All existing subjects are explicitly compatible; no new subjects appear in rules.
for (const rule of a.batchAProjectionPolicy.subjectVersionCompatibilityRules.filter((r) => r.toCatalogueVersion === 3)) {
  assert(old.benchmarkProtocols.some((pr) => json(pr.subject) === json(rule.subject)), "Compatibility grants a new subject old evidence");
}
// Production upgrade: exact history selection, recovered v2 workflows, v3 persistence.
const runtimeModule = load("app/vnext/releaseCandidate/runtime.ts");
const persistence = load("app/vnext/persistence/index.ts");
const release = load("app/vnext/production/batchARelease.ts");
const assessment = load("app/vnext/assessment/index.ts");
assert(release.validateBatchAReleaseAcceptance().length === 0, "Owner acceptance ledger invalid");
for (const mutation of [
  {...release.batchAReleaseAcceptance,ownerMotionAcceptance:"pending"},
  {...release.batchAReleaseAcceptance,ownerDeploymentAuthorization:"pending"},
  {...release.batchAReleaseAcceptance,candidateFingerprint:"0".repeat(64)},
  {...release.batchAReleaseAcceptance,motionFingerprints:{}},
]) assert(release.validateBatchAReleaseAcceptance(mutation).length > 0, "Invalid release acceptance allowed");
const completionInput = (generated) => ({
  generated, startedAt:asOf,completedAt:"2026-10-17T09:25:00.000Z",recordedAt:"2026-10-17T09:25:00.000Z",status:"modified",
  timerItemOutcomes:generated.plan.items.filter((i)=>["preparation","recovery"].includes(i.purpose)).map((i)=>({planItemId:i.id,status:"skipped",participationSeconds:0,participationBasis:"measured"})),
  reviewAnswers:generated.plan.items.filter((i)=>!["preparation","recovery"].includes(i.purpose)).map((i)=>({planItemId:i.id,status:"modified",participationSeconds:10,difficulty:"right",symptomOrInstability:false,modificationReason:"Synthetic rollout check, no clean performance claimed."})),
});
for (const spec of a.batchASpecs) {
  const store = persistence.createVNextShadowStore({databaseName:`batch-a-rollout-${spec.node}-${crypto.randomUUID()}`});
  await store.putAthleteIntent(intentFor(spec));
  for (const fact of prerequisites(spec).flatMap((pr)=>eventsFor(pr,2))) await store.appendEvidenceEvent(fact);
  const oldRuntime = runtimeModule.createVNextReleaseCandidateRuntime({store,clock:()=>asOf});
  const before = await oldRuntime.refresh({athleteId,asOf,seed:"batch-a-before"});
  assert(before.projection.lookup.catalogueVersion===2 && before.projection.lookup.projectionVersion===2, "RC defaults drifted from frozen v2");
  const oldStarted = await oldRuntime.startAssessment({athleteId,asOf,createdAt:asOf,mode:"targeted-reconfirmation"});
  const runtime = runtimeModule.createVNextReleaseCandidateRuntime({store,catalogue:release.batchAProductionCatalogue,clock:()=>asOf});
  const snapshot = await runtime.refresh({athleteId,asOf,seed:"batch-a-live"});
  assert(snapshot.projection.lookup.catalogueVersion===3 && snapshot.projection.lookup.projectionVersion===3 && snapshot.projection.source==="rebuilt", "v2 cache reused in v3");
  assert(snapshot.generated.plan?.catalogueVersion===3 && has(snapshot.generated,spec.exercise), `Production coordinator omitted Batch A ${spec.node}`);
  const media = release.evaluateBatchAPlanMediaRelease(snapshot.generated.plan);
  assert(media.releaseAllowed && media.items.some((i)=>i.exerciseId===spec.exercise && i.status==="ready"), `Accepted Batch A guide blocked in production ${spec.node}`);
  assert(!release.evaluateBatchAPlanMediaRelease(snapshot.generated.plan,{...release.batchAReleaseAcceptance,ownerMotionAcceptance:"pending"}).releaseAllowed, "Production guide bypasses owner approval");
  // Old plan completion must use its original catalogue after upgrade.
  if (before.generated.ok && before.generated.plan) {
    const nativeBundle = runtimeModule.runtimeDefinitionBundle(release.batchAProductionCatalogue,before.generated.plan.catalogueVersion);
    for (const item of before.generated.plan.items) {
      const alternatives = workout.safeWorkoutSwaps({plan:before.generated.plan,item,bundle:nativeBundle,state:snapshot.state,intent:snapshot.intent,projectionPolicy:a.batchAProjectionPolicy});
      assert(alternatives.every((alt)=>nativeBundle.exercises.some((e)=>e.id===alt.exerciseId)), "A newer-catalogue swap entered an old immutable plan");
    }
    const oldPrepared = runtime.prepareWorkoutCompletion(completionInput(before.generated));
    assert(oldPrepared.plan.catalogueVersion===2, "Recovered v2 plan was rewritten as v3");
    const saved = await runtime.commitWorkoutCompletion({athleteId,prepared:oldPrepared,asOf:"2026-10-17T09:25:00.000Z"});
    assert(saved.snapshot.sources.sessionRecords.length===1, "Recovered v2 completion lost/duplicated");
  }
  const prepared = runtime.prepareWorkoutCompletion(completionInput(snapshot.generated));
  const committed = await runtime.commitWorkoutCompletion({athleteId,prepared,asOf:"2026-10-17T09:25:00.000Z"});
  const retried = await runtime.commitWorkoutCompletion({athleteId,prepared,asOf:"2026-10-17T09:25:00.000Z"});
  assert(committed.append.record.status==="inserted" && retried.append.record.status==="duplicate", "v3 completion retry duplicates truth");
  assert(retried.snapshot.sources.sessionPlans.some((plan)=>plan.catalogueVersion===2) && retried.snapshot.sources.sessionPlans.some((plan)=>plan.catalogueVersion===3), "Mixed immutable plan history lost");
  const exportBundle = await store.exportBundle(athleteId,{exportedAt:"2026-10-17T09:26:00.000Z",catalogueVersions:[1,2,3],projectionVersions:[3],definitionFingerprints:[await persistence.sha256(a.batchADefinitionHistory)],policyVersions:[{id:a.batchAProjectionPolicy.id,version:3}]});
  const restored = persistence.createVNextShadowStore({databaseName:`batch-a-restored-${crypto.randomUUID()}`});
  await restored.importBundle(exportBundle);
  const restoredRuntime = runtimeModule.createVNextReleaseCandidateRuntime({store:restored,catalogue:release.batchAProductionCatalogue,clock:()=>"2026-10-17T09:26:00.000Z"});
  const reread = await restoredRuntime.refresh({athleteId,asOf:"2026-10-17T09:26:00.000Z"});
  assert(json(reread.sources.sessionRecords)===json(retried.snapshot.sources.sessionRecords), "Mixed-version export/import changed records");
  // An unfinished old draft remains v2 through back/answer/review/commit.
  let currentAssessment = oldStarted.assessment;
  const answerFor = (step) => step.kind==="safety" ? {kind:"safety",severity:"none"}
    : step.kind==="experience" ? {kind:"experience",experience:"experienced"}
    : step.kind==="inactivity" ? {kind:"inactivity",inactivity:"active"}
    : step.kind==="goals" ? {kind:"goals",graphIds:[spec.graphId]}
    : step.kind==="equipment" ? {kind:"equipment",equipment}
    : step.kind==="inversion" ? {kind:"inversion",familiarity:"freestanding"}
    : {kind:"anchor",response:"not-yet"};
  let count=0;
  while (currentAssessment.step.kind!=="review" && count++<60) currentAssessment=await runtime.answerAssessment({draft:currentAssessment.draft,answer:answerFor(currentAssessment.step),answeredAt:new Date(Date.parse("2026-10-17T10:00:00.000Z")+count*1000).toISOString()});
  assert(currentAssessment.step.kind==="review" && currentAssessment.draft.catalogueVersion===2, "Recovered assessment did not retain v2");
  const reviewed = await runtime.commitAssessment({athleteId,draft:currentAssessment.draft,asOf:"2026-10-17T10:03:00.000Z"});
  assert(reviewed.snapshot.assessmentDraft.catalogueVersion===2, "Old placement evidence was rebound to v3");
  const fresh = await runtime.startAssessment({athleteId,asOf:"2026-10-17T10:04:00.000Z",createdAt:"2026-10-17T10:04:00.000Z"});
  assert(fresh.assessment.draft.catalogueVersion===3, "New placement did not select v3");
  const later = await runtime.refresh({athleteId,asOf:"2026-10-20T09:00:00.000Z"});
  const recoveryDraft = {...currentAssessment.draft,targetedProtocolIds:[prerequisites(spec)[0].id]};
  const oldReview = assessment.buildAssessmentReview(recoveryDraft,old,later.state);
  const oldOffer = oldReview.guidedTests.find((offer)=>offer.availability==="available");
  assert(Boolean(oldOffer), "No safe old-protocol recovery fixture");
  if (oldOffer) {
    const protocol = old.benchmarkProtocols.find((pr)=>pr.id===oldOffer.protocolId);
    const result = {eventId:`batch-a-old-guided-${spec.node}`,observationSessionId:`batch-a-old-guided-occasion-${spec.node}`,protocolId:protocol.id,outcome:"clean",occurredAt:"2026-10-20T09:00:00.000Z",recordedAt:"2026-10-20T09:00:00.000Z",measurement:metric(protocol.metric),qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true};
    const saved = await runtime.commitGuidedTest({athleteId,draft:recoveryDraft,result,asOf:result.recordedAt});
    assert(saved.event.catalogueVersion===2, "Pending v2 guided result was rebound to v3");
  }
  let advanced = await runtime.startAssessment({athleteId,asOf:"2026-10-23T09:00:00.000Z",createdAt:"2026-10-23T09:00:00.000Z",mode:"targeted-reconfirmation"});
  let advancedAssessment = advanced.assessment;
  count=0;
  while(advancedAssessment.step.kind!=="review" && count++<60) advancedAssessment=await runtime.answerAssessment({draft:advancedAssessment.draft,answer:answerFor(advancedAssessment.step),answeredAt:new Date(Date.parse("2026-10-23T09:00:00.000Z")+count*1000).toISOString()});
  const advancedSnapshot = await runtime.refresh({athleteId,asOf:"2026-10-23T09:02:00.000Z"});
  const advancedReview = assessment.buildAssessmentReview(advancedAssessment.draft,bundle,advancedSnapshot.state);
  const advancedProtocol = a.batchAProtocols.find((pr)=>pr.exerciseId===spec.exercise);
  const advancedOffer = advancedReview.guidedTests.find((offer)=>offer.protocolId===advancedProtocol.id);
  assert(advancedOffer?.availability==="available", `New advanced guided benchmark unreachable ${spec.node}: ${json(advancedReview.guidedTests)}`);
  if(advancedOffer?.availability==="available") {
    const result={eventId:`batch-a-new-guided-${spec.node}`,observationSessionId:`batch-a-new-guided-occasion-${spec.node}`,protocolId:advancedProtocol.id,outcome:"clean",occurredAt:"2026-10-23T09:02:00.000Z",recordedAt:"2026-10-23T09:02:00.000Z",measurement:metric(advancedProtocol.metric),qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true};
    const saved = await runtime.commitGuidedTest({athleteId,draft:advancedAssessment.draft,result,asOf:result.recordedAt});
    assert(saved.event.catalogueVersion===3 && saved.event.subject.milestone.nodeId===spec.node, "Advanced guided result did not retain exact v3 identity");
  }
}
const releaseApp = readFileSync(new URL("../app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx",import.meta.url),"utf8");
assert(releaseApp.includes("const workoutBundle = plan ? bundleFor(plan.catalogueVersion)") && releaseApp.includes("<WorkoutRunner plan={plan} bundle={workoutBundle}"), "Recovered UI does not select its native workout catalogue");
const productionApp = readFileSync(new URL("../app/vnext/production/VNextProductionApp.tsx",import.meta.url),"utf8");
// Goal-trust catalogue (projection 12) spreads trainingQualityCatalogue: same definitions, history and media.
assert(productionApp.includes("catalogue: goalTrustCatalogue") && readFileSync(new URL("../app/vnext/production/goalTrust.ts",import.meta.url),"utf8").includes("...trainingQualityCatalogue,") && productionApp.includes("evaluatePlanMedia: evaluateCombinedProgressionPlanMedia") && productionApp.includes('import "./combinedProgressionMedia"'), "Production omitted coherent catalogue/media activation");
const safetyCatalogue = load("app/vnext/production/restrictionSafety.ts").restrictionSafetyCatalogue;
const priorCatalogue = load("app/vnext/production/experiencedPlacement.ts").experiencedPlacementCatalogue;
assert(json(safetyCatalogue.bundle) === json(priorCatalogue.bundle) && json(safetyCatalogue.history) === json(priorCatalogue.history), "Current safety overlay changed the accepted native catalogue/history");

const guides = motion.batchAMotionGuides;
for (const [reference,g] of Object.entries(guides)) {
  assert(a.batchAExercises.some((e) => e.media[0].reference === reference), `Orphan guide ${reference}`);
  assert(g.playback === "one-way-reset" && g.gaze.length === g.poses.length && g.keyframeTimes.length === g.poses.length, `Guide playback contract ${reference}`);
  assert(g.keyframeTimes[0] === 0 && g.keyframeTimes.at(-1) === 1 && g.keyframeTimes.every((t,i) => i===0 || t>g.keyframeTimes[i-1]), `Invalid timing ${reference}`);
  assert(g.phasePoseIndexes.length === g.phases.length && g.phasePoseIndexes.every((i) => g.poses[i]), `Unreviewable phases ${reference}`);
  assert(!g.equipment.some((e) => e.includes("wall")) && !g.visuals.some((v) => v.kind === "assistance"), `Assisted candidate guide ${reference}`);
  assert(g.poses.every((pose) => Object.values(pose).every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && v.x>=0 && v.x<=640 && v.y>=0 && v.y<=480)), `Clipped guide ${reference}`);
}
const holdDuration = (ref, from, to) => guides[ref].duration*(guides[ref].keyframeTimes[to]-guides[ref].keyframeTimes[from]);
assert(holdDuration("parallette-balance-stable-variant",1,2) >= 20 && holdDuration("parallette-balance-stable-variant",6,7) >= 20, "Balance hold duration drift");
assert(holdDuration("one-leg-planche-hold",2,3)>=5 && holdDuration("one-leg-planche-hold",7,8)>=5, "Both Planche hold durations required");
for (const ref of ["straddle-planche-hold","v-sit-hold"]) assert(holdDuration(ref,2,3)>=8, `Hold shortened ${ref}`);
const collinear = (a,b,c) => Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) < 0.001;
for (const ref of ["straddle-planche-hold","v-sit-hold"]) for (const side of ["l","r"]) {
  const pose = guides[ref].poses[2]; assert(collinear(pose[`${side}h`],pose[`${side}k`],pose[`${side}a`]), `Bent knee in ${ref}/${side}`);
}
const vp = guides["v-sit-hold"].poses[2];
assert(Math.atan2(vp.lh.y-vp.la.y,vp.lh.x-vp.la.x)*180/Math.PI>=60, "V target below 60 degrees");
const push = guides["deep-forward-loaded-parallette-push-up"];
for (const i of [1,2,3,4,5,6,7,8,9]) for (const joint of ["lw","rw","la","ra"]) assert(json(push.poses[i][joint]) === json(push.poses[1][joint]), `Push contact moves ${i}/${joint}`);
for (const i of [2,4,6,8]) assert(push.duration*(push.keyframeTimes[i]-push.keyframeTimes[i-1])>=3-1e-8 && push.poses[i].ls.y===push.poses[i].le.y, "Push lower tempo/depth drift");
// Frozen default exports stay at v2; production selects its separately accepted successor.
assert(!readFileSync(new URL("../app/vnext/definitions/index.ts",import.meta.url),"utf8").includes("batchA"), "Candidate leaked into production definition exports");
const fingerprint = hash({bundle,policy:a.batchAProjectionPolicy,guides});
const manifest = load("app/vnext/progression/batchAReviewManifest.ts").batchAReviewManifest;
assert(manifest.ownerAcceptance === "pending" && manifest.productionEnabled === false, "Candidate must not claim owner approval or production authority");
assert(manifest.candidateFingerprint === fingerprint, `Candidate drift: expected ${manifest.candidateFingerprint}, got ${fingerprint}`);
assert(Object.keys(manifest.motionFingerprints).length === 5, "Incomplete motion acceptance ledger");
for (const [reference,g] of Object.entries(guides)) assert(manifest.motionFingerprints[reference] === hash(g), `Motion fingerprint drift ${reference}`);
for (const [path,expected] of Object.entries(manifest.playerSources)) assert(createHash("sha256").update(readFileSync(new URL(`../${path}`,import.meta.url))).digest("hex") === expected, `Exact reviewed player changed: ${path}`);

if (process.argv.includes("--scenarios")) console.log(JSON.stringify(scenarios,null,2));
console.log(JSON.stringify({checks,candidateFingerprint:fingerprint,motionFingerprints:Object.fromEntries(Object.entries(guides).map(([k,v])=>[k,hash(v)])),available:78,remaining:25},null,2));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`Batch A: ${checks} focused checks passed.`);
