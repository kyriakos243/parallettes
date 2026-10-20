import assert from 'node:assert/strict';
import { loadTypeScriptModule as load } from './lib/load-typescript.mjs';
const { restrictionSafetyCatalogue: catalogue } = load('app/vnext/production/restrictionSafety.ts');
const assessment = load('app/vnext/assessment/index.ts');
const { projectAthleteState, evaluateTrainability, restrictionExposureDomains } = load('app/vnext/projection/index.ts');
const { planningTrainabilityRequests } = load('app/vnext/planning/index.ts');
const { generateFeedbackVNextSession, generateFeedbackVNextCustomSession } = load('app/vnext/planning/feedbackDose.ts');
const { validateWorkoutStart } = load('app/vnext/releaseCandidate/workoutStartSafety.ts');
const { workoutExecutionTimeline } = load('app/vnext/mixedWorkout.ts');
const { validateSessionPlan } = load('app/vnext/validation.ts');
const { bundle, history, projectionPolicy: policy } = catalogue;
const asOf = '2026-10-20T09:00:00.000Z';
const athleteId = 'cross-path-guided-safety';
const intent = { schemaVersion: 1, athleteId, updatedAt: asOf, goals: [{graphId:'parallette-pushing',priority:'primary'}],
  equipment:['floor','parallettes','wall','rope'], defaultSessionDemand:'standard', preferences:{specialistOptIn:true} };
const projected = projectAthleteState({ athleteId, asOf, policy, definitionBundles:history,
  evidenceEvents:[], sessionPlans:[], sessionRecords:[], intent, trainabilityRequests:planningTrainabilityRequests(bundle) });
assert(projected.ok && projected.state);
const originalDefinitions = JSON.stringify(history);
const ready = { ...projected.state,
  nodeStates:projected.state.nodeStates.map(item=>({...item,lifecycle:'established',confidence:'current'})),
  capacityFindings:projected.state.capacityFindings.map(item=>({...item,finding:'demonstrated',confidence:'current',confirmationSatisfied:true})),
};
const forProtocol = (protocol, additions={}) => {
  const state = { ...ready, ...additions,
    nodeStates:ready.nodeStates.map(item=>protocol.subject.kind==='milestone' && item.milestone.graphId===protocol.subject.milestone.graphId
      && item.milestone.nodeId===protocol.subject.milestone.nodeId ? {...item,lifecycle:'unknown',confidence:'unknown',satisfiedForEligibilityBy:[]} : item),
    capacityFindings:ready.capacityFindings.map(item=>protocol.subject.kind==='capacity-facet' && item.capacity.capacityId===protocol.subject.capacity.capacityId
      && item.capacity.facetId===protocol.subject.capacity.facetId ? {...item,finding:'unknown',confidence:'unknown',confirmationSatisfied:false} : item),
  };
  return {...state,trainabilityEvaluations:planningTrainabilityRequests(bundle).map(request=>evaluateTrainability({request,state,bundle,intent,asOf,policy}))};
};
const draftFor = (protocol,state,equipment=intent.equipment) => {
  let draft=assessment.createAssessmentDraft({id:'cross-path-check',athleteId,createdAt:asOf,bundle,
    mode:'targeted-reconfirmation',existingIntent:{...intent,equipment},existingState:state,placementVersion:2});
  draft={...draft,targetedProtocolIds:[protocol.id]};
  for(let count=0;assessment.nextAssessmentStep(draft,bundle).kind!=='review';count++) {
    assert(count<12);
    const step=assessment.nextAssessmentStep(draft,bundle),kind=step.kind;
    const answer=kind==='safety'?{kind,severity:'none'}:kind==='experience'?{kind,experience:'experienced'}
      :kind==='inactivity'?{kind,inactivity:'active'}:kind==='inversion'?{kind,familiarity:'freestanding'}
        :kind==='goals'?{kind,graphIds:[protocol.subject.kind==='milestone'?protocol.subject.milestone.graphId:'parallette-pushing']}
          :kind==='equipment'?{kind,equipment}:{kind,graphId:step.graphId,response:'not-sure'};
    draft=assessment.answerAssessmentStep(draft,answer,asOf,bundle);
  }
  return draft;
};
let restrictions=0,loadChecks=0,equipmentChecks=0;
for(const protocol of bundle.benchmarkProtocols) {
  const exercise=bundle.exercises.find(item=>item.id===protocol.exerciseId);
  const variant=exercise?.prescriptionVariants.find(item=>item.id===protocol.prescriptionVariantId);
  assert(exercise && variant);
  const request={exerciseId:exercise.id,exerciseDefinitionVersion:exercise.definitionVersion,prescriptionVariantId:variant.id};
  const state=forProtocol(protocol),draft=draftFor(protocol,state);
  const getOffer=(state,draft=draftFor(protocol,state),currentPolicy=policy)=>assessment.buildAssessmentReview(draft,bundle,state,currentPolicy).guidedTests.find(item=>item.protocolId===protocol.id);
  const base=getOffer(state,draft);
  assert(base,`${protocol.id}: exact target visible when prerequisites current`);
  for(const domain of restrictionExposureDomains(request,variant.demand,policy)) for(const decision of ['modify','block']) {
    const restricted=forProtocol(protocol,{activeRestrictions:[{source:{kind:'evidence-event',eventId:'restriction'},decision,
      demandDomains:[domain],bodyRegions:['reported'],occurredAt:asOf,reasonCodes:['active-restriction']}]});
    for(const offer of [getOffer(restricted),assessment.progressionCheckOffer({bundle,state:restricted,intent,projectionPolicy:policy},protocol)]) {
      assert(offer?.availability==='blocked' && offer.blockers.includes('active-restriction'),`${protocol.id}: ${domain}/${decision}`);
    }
    restrictions++;
  }
  const exposure={source:{kind:'evidence-event',eventId:'exact-prior-work'},occurredAt:'2026-10-19T23:00:00.000Z',participationSeconds:40,
    demand:variant.demand,...request,reviewDifficulty:'hard'};
  const tired=forProtocol(protocol,{recentLoad:{...state.recentLoad,exposures:[exposure]}});
  for(const offer of [getOffer(tired),assessment.progressionCheckOffer({bundle,state:tired,intent,projectionPolicy:policy},protocol)]) {
    assert(offer?.availability==='blocked' && offer.blockers.includes('recover-before-check'),`${protocol.id}: hard previous UTC day still needs recovery`);
  }
  const rested=forProtocol(protocol,{recentLoad:{...state.recentLoad,exposures:[{...exposure,occurredAt:'2026-10-17T09:00:00.000Z'}]}});
  assert(!getOffer(rested).blockers.includes('recover-before-check'),`${protocol.id}: recovered exact work is not blocked forever`);
  const wrongVariant=forProtocol(protocol,{recentLoad:{...state.recentLoad,exposures:[{...exposure,prescriptionVariantId:'unrelated-variant',demand:{}}]}});
  assert(!getOffer(wrongVariant).blockers.includes('recover-before-check'),`${protocol.id}: exact hard identity is respected`);
  loadChecks++;
  if(protocol.conditions.equipment.length) {
    const withoutRequired=intent.equipment.filter(id=>id!==protocol.conditions.equipment[0]);
    const noEquipment=draftFor(protocol,state,withoutRequired);
    assert(getOffer(state,noEquipment).blockers.includes('missing-equipment'));
    const committed={...draft,status:'committed',committedAt:draft.updatedAt,revision:draft.revision+1};
    const currentOffer=assessment.buildAssessmentReview(committed,bundle,state,policy,withoutRequired).guidedTests.find(item=>item.protocolId===protocol.id);
    assert(currentOffer?.blockers.includes('missing-equipment'),`${protocol.id}: committed draft cannot restore removed equipment`);
    assert(assessment.progressionCheckOffer({bundle,state,intent:{...intent,equipment:withoutRequired},projectionPolicy:policy},protocol).blockers.includes('missing-equipment'));
    equipmentChecks++;
  }
}
// The exact original reader remains available; current policy gates both offer
// and first append, but an already saved canonical retry remains valid.
const knee=bundle.benchmarkProtocols.find(item=>item.id==='parallette-pushing-knee-push-up');
const exercise=bundle.exercises.find(item=>item.id===knee.exerciseId),variant=exercise.prescriptionVariants.find(item=>item.id===knee.prescriptionVariantId);
const kneeState=forProtocol(knee,{recentLoad:{...ready.recentLoad,exposures:[{source:{kind:'evidence-event',eventId:'hard'},
  occurredAt:'2026-10-19T23:00:00.000Z',participationSeconds:40,demand:variant.demand,exerciseId:exercise.id,
  exerciseDefinitionVersion:exercise.definitionVersion,prescriptionVariantId:variant.id,reviewDifficulty:'hard'}]}});
const draft=draftFor(knee,kneeState);
assert.equal(assessment.buildAssessmentReview(draft,bundle,kneeState).guidedTests.find(item=>item.protocolId===knee.id).availability,'available','Native reader unchanged');
const result={eventId:'exact-native-result',protocolId:knee.id,occurredAt:asOf,recordedAt:asOf,
  observationSessionId:assessment.guidedObservationOccasionId(athleteId,asOf),outcome:'partial',measurement:{value:1,unit:'repetitions'},qualityCriteriaSatisfied:false,safetyCriteriaSatisfied:false};
assert.throws(()=>assessment.createGuidedTestEvidence(draft,bundle,kneeState,result,undefined,policy),/recover-before-check/);
const saved=assessment.createGuidedProtocolEvidence(athleteId,bundle,result);
assert.deepEqual(assessment.createGuidedTestEvidence(draft,bundle,kneeState,result,saved,policy),saved,'Exact already-saved retry is unchanged');
const restedKnee=forProtocol(knee);
assert.throws(()=>assessment.createGuidedTestEvidence(draft,bundle,restedKnee,result,undefined,policy,['wall']),/missing-equipment/);
assert.deepEqual(assessment.createGuidedTestEvidence(draft,bundle,restedKnee,result,saved,policy,['wall']),saved,'Missing current equipment cannot corrupt a saved exact retry');
// Isolate dose/start/time coherence across every family and both a fresh and a
// fully confirmed state. The real generator selects the previous hard work.
let plans=0;
for(const graph of bundle.graphs) for(const experience of [projected.state,ready]) for(const demand of ['technique','standard','challenge']) {
  const currentIntent={...intent,goals:[{graphId:graph.id,priority:'primary'}],defaultSessionDemand:demand};
  const input={createdAt:asOf,bundle,state:experience,intent:currentIntent,projectionPolicy:policy,sessionDemand:demand};
  const before=generateFeedbackVNextSession(input);
  if(!before.plan)continue;
  const state={...experience,recentLoad:{...experience.recentLoad,exposures:before.plan.items
    .filter(item=>!['preparation','recovery'].includes(item.purpose)).map(item=>({...item,
      source:{kind:'evidence-event',eventId:`prior-${item.id}`},occurredAt:'2026-10-19T23:00:00.000Z',
      participationSeconds:40,reviewDifficulty:'hard'}))}};
  for(const minutes of [undefined,5,10,15,20]) {
    const generated=minutes ? generateFeedbackVNextCustomSession({...input,state},minutes) : generateFeedbackVNextSession({...input,state});
    if(!generated.plan)continue;
    const start=validateWorkoutStart({generated,bundle,state,intent:currentIntent,projectionPolicy:policy});
    assert(start.allowed,`${graph.id}/${demand}/${minutes}: ${JSON.stringify(start.issues)}`);
    assert(validateSessionPlan(generated.plan).valid);
    assert.equal(workoutExecutionTimeline(generated.plan,bundle).reduce((sum,item)=>sum+item.durationSeconds,0),generated.plan.intendedDurationSeconds);
    assert.equal(generated.plan.generatorPolicyVersion,2);
    plans++;
  }
}
assert(plans>100,'All-family dose coverage must produce useful safe workouts');
assert.equal(JSON.stringify(history),originalDefinitions);
console.log(`Cross-path checks: ${restrictions} domain/severity restriction cases, ${loadChecks} exact hard/recovered protocols, ${equipmentChecks} equipment gates, ${plans} all-family dose/start/timeline plans, first append safety and native exact retry pass.`);
