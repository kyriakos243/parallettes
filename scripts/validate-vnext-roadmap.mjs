import assert from 'node:assert/strict';
import { loadTypeScriptModule as load } from './lib/load-typescript.mjs';
const { buildProgressAndGoals } = load('app/vnext/presentation/progress.ts');
const { batchFDefinitionBundle: bundle } = load('app/vnext/progression/batchF.ts');
const { vNextDefinitionBundleV1 } = load('app/vnext/definitions/index.ts');
const athleteId = 'roadmap-fixture';
const asOf = '2026-10-18T10:00:00.000Z';
const intent = { schemaVersion: 1, athleteId, updatedAt: asOf,
  goals: [{graphId:'planche', priority:'primary'}, {graphId:'handstand-balance', priority:'secondary'}, {graphId:'l-sit-v-sit', priority:'secondary'}, {graphId:'press-to-handstand', priority:'interest'}],
  equipment:['floor','parallettes','wall'], defaultSessionDemand:'standard', preferences:{specialistOptIn:false} };
const empty = { schemaVersion:1, athleteId, projectionVersion:8, asOf, observationCursors:{},
  nodeStates:[], capacityFindings:[], activeRestrictions:[], reconfirmationRequirements:[],
  recentLoad:{from:asOf, to:asOf, demand:{}, exposures:[]}, workingNodes:[], maintenanceNeeds:[], eligibleTargets:[], trainabilityEvaluations:[],
  recommendedEmphasis:{primaryGraphId:'parallette-pushing', reasonCodes:[]} };
const milestone = (graphId,nodeId) => ({graphId,nodeId});
const finding = (graphId,nodeId,lifecycle='unknown',confidence='current',higher) => ({
  milestone:milestone(graphId,nodeId), lifecycle, confidence,
  satisfiedForEligibilityBy:higher?[{milestone:milestone(graphId,higher),supportingObservationRefs:[]}]:[],
  supportingObservationRefs:[], reasonCodes:[] });
const build = (state=empty, selectedIntent=intent, selectedBundle=bundle) => buildProgressAndGoals({bundle:selectedBundle,state,intent:selectedIntent});
const graph = (result,id) => result.roadmaps.find(map=>map.graphId===id);
const node = (result,graphId,id) => graph(result,graphId).nodes.find(item=>item.id===id);
const before = JSON.stringify({bundle,intent,empty});
const fresh = build();
assert.equal(fresh.roadmaps.length,7);
assert.equal(fresh.roadmaps.flatMap(map=>map.nodes).length,103);
assert.deepEqual(fresh.roadmaps.filter(map=>map.priority).map(map=>[map.graphId,map.priority]), [['planche','primary'],['l-sit-v-sit','secondary'],['handstand-balance','secondary']]);
assert.equal(graph(fresh,'parallette-pushing').priority,undefined, 'Planner emphasis must not replace selected goals');
assert.equal(graph(fresh,'press-to-handstand').priority,undefined,'Interest is not a secondary goal');
assert.ok(fresh.roadmaps.every(map=>map.nodes.every(item=>item.evidence==='unknown')));
assert.equal(node(fresh,'l-sit-v-sit','foot-assisted-l-sit').branchGoal,false,'An independent foundation step is not an advanced destination');
for (const definition of bundle.graphs) {
  const map = graph(fresh,definition.id);
  assert.deepEqual(new Set(map.nodes.map(item=>item.id)),new Set(definition.nodes.map(item=>item.id)));
  assert.equal(new Set(map.levels.flat()).size,definition.nodes.length);
  assert.equal(map.levels.flat().length,definition.nodes.length);
  const depth = new Map(map.levels.flatMap((level,index)=>level.map(id=>[id,index])));
  const expectedEdges=[];
  for(const source of definition.nodes) {
    const display=node(fresh,definition.id,source.id);
    assert.equal(display.specialist,source.programmingBoundary==='specialist');
    assert.equal(display.benchmarks.length,source.benchmarkProtocolIds.length);
    assert.equal(display.requirements.length,(source.prerequisiteRule?.allOf?.length??0)+(source.prerequisiteRule?.anyOf?.length??0));
    for(const [kind, refs] of [['required',source.prerequisiteRule?.allOf??[]],['one-of',source.prerequisiteRule?.anyOf??[]]]) {
      for(const ref of refs) {
        const item=display.requirements.find(req=>JSON.stringify(req.ref)===JSON.stringify(ref)&&req.requirement===kind);
        assert.ok(item,`Missing ${kind} requirement on ${source.id}`);
        if(ref.kind==='milestone') {
          assert.deepEqual(item.milestone,ref.milestone);
          assert.ok(graph(fresh,ref.milestone.graphId)?.nodes.some(item=>item.id===ref.milestone.nodeId),'Cross-family link must resolve');
          if(ref.milestone.graphId===definition.id) expectedEdges.push({from:ref.milestone.nodeId,to:source.id,requirement:kind});
        } else if(ref.kind==='capacity-facet') {
          assert.ok(item.benchmarks?.length,`Capacity ${item.label} has no observable target`);
          assert.ok(item.benchmarks.every(bench=>bench.target&&bench.conditions&&bench.confirmation&&bench.quality.length&&bench.safety.length));
        }
      }
    }
  }
  assert.deepEqual(map.edges,expectedEdges);
  assert.ok(map.edges.every(edge=>depth.get(edge.from)<depth.get(edge.to)),'Connections must flow toward dependent nodes');
}
const stages=['unknown','estimated','developing','demonstrated','established'];
for(const lifecycle of stages) {
  const result=build({...empty,nodeStates:[finding('planche','stable-tuck-planche',lifecycle)]});
  const display=node(result,'planche','stable-tuck-planche');
  assert.equal(display.evidence,lifecycle==='established'?'confirmed':lifecycle);
  if(lifecycle==='demonstrated') assert.match(display.evidenceMessage,/More qualifying evidence/);
  if(lifecycle==='estimated') assert.match(display.evidenceMessage,/starting point/i);
}
const stale=build({...empty,nodeStates:[finding('planche','stable-tuck-planche','established','stale')]});
assert.equal(node(stale,'planche','stable-tuck-planche').evidence,'confirmed');
assert.equal(node(stale,'planche','stable-tuck-planche').recheck,true);
const mixed=build({...empty,nodeStates:[finding('planche','stable-tuck-planche','developing'),finding('planche','assisted-straddle-planche','estimated')],
 workingNodes:[{milestone:milestone('planche','stable-tuck-planche'),reasonCodes:[]},{milestone:milestone('planche','assisted-straddle-planche'),reasonCodes:[]} ]});
assert.equal(graph(mixed,'planche').nodes.filter(item=>item.current).length,2,'Parallel current work must remain visible');
for(const lifecycle of ['unknown','demonstrated','established']) {
  const coveredState={...empty,nodeStates:[finding('l-sit-v-sit','one-leg-l-sit',lifecycle,'stale','full-l-sit'),finding('l-sit-v-sit','full-l-sit','established')],
    eligibleTargets:[{milestone:milestone('l-sit-v-sit','one-leg-l-sit'),reasonCodes:[]}],workingNodes:[{milestone:milestone('l-sit-v-sit','one-leg-l-sit'),reasonCodes:[]}]};
  const covered=build(coveredState);
  const display=node(covered,'l-sit-v-sit','one-leg-l-sit');
  assert.equal(display.evidence,lifecycle==='unknown'?'covered':lifecycle==='established'?'confirmed':'demonstrated');
  assert.equal(display.recheck,false);
  assert.equal(display.current,false);
  assert.equal(display.next,false,'A covered predecessor must not be recommended as next');
  assert.match(display.evidenceMessage,/higher skill/);
  assert.doesNotMatch(display.evidenceMessage,/More qualifying evidence/);
  const staleHigher=build({...coveredState,nodeStates:coveredState.nodeStates.map(item=>({...item,confidence:'stale'}))});
  if(lifecycle==='unknown') assert.equal(node(staleHigher,'l-sit-v-sit','one-leg-l-sit').evidence,'unknown');
}
const alternative=build({...empty,nodeStates:[finding('l-sit-v-sit','high-l-sit','established')]});
const options=node(alternative,'l-sit-v-sit','assisted-v-sit').requirements;
assert.equal(options.length,2);
assert.ok(options.every(item=>item.requirement==='one-of'));
assert.deepEqual(options.map(item=>item.state),['met','not-yet']);
const capacity=node(fresh,'planche','controlled-planche-lean').requirements.find(item=>item.ref.kind==='capacity-facet');
for(const confirmationSatisfied of [false,true]) {
  const result=build({...empty,capacityFindings:[{capacity:capacity.ref.capacity,finding:'demonstrated',confirmationSatisfied,confidence:'current',supportingObservationRefs:[],reasonCodes:[]}]});
  assert.equal(node(result,'planche','controlled-planche-lean').requirements.find(item=>item.key===capacity.key).state,confirmationSatisfied?'met':'check-needed');
}
const restricted=build({...empty,nodeStates:[finding('planche','stable-tuck-planche','established')],activeRestrictions:[{source:{kind:'evidence-event',eventId:'restriction-fixture'},decision:'block',demandDomains:['forward-straight-arm-upper-limb'],bodyRegions:['wrist'],occurredAt:asOf,reasonCodes:[]}]});
assert.equal(node(restricted,'planche','stable-tuck-planche').evidence,'confirmed');
assert.equal(graph(restricted,'planche').availability.state,'restricted');
const specialist=node(fresh,'planche','full-planche-push-up-eccentric');
assert.ok(specialist.specialist);
assert.match(specialist.trainingNote,/separate opt-in/);
assert.equal(node(build(empty,{...intent,preferences:{specialistOptIn:true}}),'planche',specialist.id).evidence,'unknown');
const historical=build(empty,intent,vNextDefinitionBundleV1);
assert.match(node(historical,'planche','full-planche').trainingNote,/not available yet/);
assert.equal(JSON.stringify({bundle,intent,empty}),before,'Viewing a roadmap must not mutate definitions, preferences or evidence');
assert.throws(()=>build({...empty,athleteId:'different-athlete'}),/different athletes/);
console.log('Roadmap validation passed: all 103 milestones and exact requirements; goal priority, branch topology, alternatives, capacity targets, evidence/coverage/recheck, restrictions, specialist opt-in and read-only boundaries.');
