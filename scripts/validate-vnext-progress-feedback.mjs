import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTypeScriptModule as load } from './lib/load-typescript.mjs';
createRequire(import.meta.url)('fake-indexeddb/auto');
const { restrictionSafetyCatalogue: baseCatalogue } = load('app/vnext/production/restrictionSafety.ts');
const { generateFeedbackVNextSession, generateFeedbackVNextCustomSession } = load('app/vnext/planning/feedbackDose.ts');
const { generateMixedVNextSession } = load('app/vnext/planning/mixed.ts');
const { createVNextReleaseCandidateRuntime } = load('app/vnext/releaseCandidate/runtime.ts');
const { createVNextShadowStore, canonicalJson } = load('app/vnext/persistence/index.ts');
const { structureWorkoutPlan } = load('app/vnext/workoutUx.ts');
const { isMixedWorkoutPlan, workoutExecutionTimeline } = load('app/vnext/mixedWorkout.ts');
const { stateSatisfiesSubject, guidedObservationOccasionId, createRestrictionReport, progressionCheckOffer, createGuidedProtocolEvidence } = load('app/vnext/assessment/index.ts');
const { restrictionExposureDomains } = load('app/vnext/projection/index.ts');
const { validateSessionPlan } = load('app/vnext/validation.ts');
const { validateWorkoutStart } = load('app/vnext/releaseCandidate/workoutStartSafety.ts');
const catalogue = { ...baseCatalogue, generateSession:generateFeedbackVNextSession, generateCustomSession:generateFeedbackVNextCustomSession };
const bundle = catalogue.bundle;
const stores = [];
const start = Date.parse('2026-10-20T09:00:00.000Z');
const fixture = async graphId => {
  const athleteId = `progress-feedback-${crypto.randomUUID()}`;
  const store = createVNextShadowStore({databaseName:athleteId}); stores.push(store);
  const time = { value:new Date(start).toISOString() };
  const runtime = createVNextReleaseCandidateRuntime({store,catalogue,clock:()=>time.value});
  let { assessment } = await runtime.startAssessment({athleteId,mode:'new-placement'});
  while(assessment.step.kind !== 'review') {
    const kind=assessment.step.kind;
    const answer=kind==='safety'?{kind,severity:'none'}:kind==='experience'?{kind,experience:'new'}
      :kind==='inactivity'?{kind,inactivity:'active'}:kind==='goals'?{kind,graphIds:[graphId]}
        :kind==='equipment'?{kind,equipment:['floor','parallettes','wall']}:kind==='inversion'?{kind,familiarity:'none'}
          :{kind,graphId,response:'not-sure'};
    assessment=await runtime.answerAssessment({draft:assessment.draft,answer});
  }
  await runtime.commitAssessment({athleteId,draft:assessment.draft});
  return {athleteId,store,runtime,time};
};
const complete = async (f,snapshot,difficulty='right') => {
  const {generated}=snapshot,plan=generated.plan;
  assert(plan);
  const work=new Map(structureWorkoutPlan(plan,bundle).map(item=>[item.planItemId,item.intervals.filter(i=>i.kind==='work').reduce((sum,i)=>sum+i.durationSeconds,0)]));
  const timerItemOutcomes=plan.items.filter(i=>['preparation','recovery'].includes(i.purpose)).map(i=>({planItemId:i.id,status:'completed',participationSeconds:work.get(i.id),participationBasis:'measured'}));
  const reviewAnswers=plan.items.filter(i=>!['preparation','recovery'].includes(i.purpose)).map(i=>({planItemId:i.id,status:'completed',participationSeconds:work.get(i.id),difficulty,symptomOrInstability:false}));
  const startedAt=f.time.value;
  f.time.value=new Date(Date.parse(startedAt)+plan.intendedDurationSeconds*1000).toISOString();
  const prepared=f.runtime.prepareWorkoutCompletion({generated,timerItemOutcomes,reviewAnswers,startedAt,completedAt:f.time.value,recordedAt:f.time.value,status:'complete'});
  return (await f.runtime.commitWorkoutCompletion({athleteId:f.athleteId,prepared})).snapshot;
};
const measurement = protocol => protocol.metric.kind==='duration-seconds'?{value:protocol.metric.minimum,unit:'seconds'}
  :protocol.metric.kind==='repetitions'?{value:protocol.metric.minimum,unit:'repetitions'}
    :protocol.metric.kind==='successful-attempts'?{value:protocol.metric.minimumSuccessful,unit:'attempts',attemptsTotal:protocol.metric.maximumAttempts}:undefined;
const resultFor = (f,protocol) => ({eventId:`progress-check-${crypto.randomUUID()}`,
  observationSessionId:guidedObservationOccasionId(f.athleteId,f.time.value),occurredAt:f.time.value,recordedAt:f.time.value,
  protocolId:protocol.id,outcome:'clean',qualityCriteriaSatisfied:true,safetyCriteriaSatisfied:true,
  ...(measurement(protocol)?{measurement:measurement(protocol)}:{})});
try {
  for(const graphId of ['parallette-pushing','l-sit-v-sit','handstand-balance']) {
    const f=await fixture(graphId);
    let snapshot;
    for(let day=0;day<10;day++) {
      f.time.value=new Date(start+day*72*3600000).toISOString();
      snapshot=await f.runtime.refresh({athleteId:f.athleteId});
      if(day) assert(snapshot.progressionCheck,`${graphId}: repeated practice must expose a measured next step`);
      snapshot=await complete(f,snapshot);
    }
    const ordinary=await f.store.readProjectionSources(f.athleteId);
    assert(ordinary.sessionRecords.every(record=>record.itemOutcomes.every(item=>!item.benchmarkObservation)),'Timers cannot manufacture benchmark measurements');
    f.time.value=new Date(start+10*72*3600000).toISOString();
    snapshot=await f.runtime.refresh({athleteId:f.athleteId});
    const recommendation=snapshot.progressionCheck;
    assert(recommendation && recommendation.offer.availability==='available',`${graphId}: ${JSON.stringify(recommendation)}`);
    assert(recommendation.why.includes('exact movement standard') && recommendation.when.includes('Before your next workout'));
    const protocol=bundle.benchmarkProtocols.find(item=>item.id===recommendation.offer.protocolId);
    assert(protocol && !stateSatisfiesSubject(protocol.subject,snapshot.state),'Practice alone must retain required evidence gate');
    const repetitions=Math.max(protocol.confirmation.qualifyingObservations,protocol.confirmation.minimumDistinctSessions);
    const draftBytes=canonicalJson(snapshot.assessmentDraft);
    for(let occasion=0;occasion<repetitions;occasion++) {
      f.time.value=new Date(start+(10+occasion)*72*3600000).toISOString();
      const opened=await f.runtime.startProgressionCheck({athleteId:f.athleteId,protocolId:protocol.id});
      assert.equal(opened.check.offer.protocolId,protocol.id);
      const result=resultFor(f,protocol);
      if(result.measurement) await assert.rejects(()=>f.runtime.commitProgressionCheck({athleteId:f.athleteId,catalogueVersion:bundle.catalogueVersion,result:{...result,measurement:{...result.measurement,value:0}}}),/exact metric/);
      ({snapshot}=await f.runtime.commitProgressionCheck({athleteId:f.athleteId,catalogueVersion:bundle.catalogueVersion,result}));
      const exact=canonicalJson(snapshot.sources.evidenceEvents);
      const retry=await f.runtime.commitProgressionCheck({athleteId:f.athleteId,catalogueVersion:bundle.catalogueVersion,result});
      assert.equal(canonicalJson(retry.snapshot.sources.evidenceEvents),exact,'Exact retry creates no second check');
      assert.equal(snapshot.sources.sessionRecords.length,10,'A guided check cannot invent a workout');
      assert.equal(canonicalJson(snapshot.assessmentDraft),draftBytes,'A progression check cannot replace setup');
      if(occasion<repetitions-1) assert.equal(snapshot.progressionCheck?.offer.availability,'blocked','A repeated check needs a distinct later occasion');
    }
    assert(stateSatisfiesSubject(protocol.subject,snapshot.state),`${graphId}: exact native evidence must confirm its subject`);
    assert.notEqual(snapshot.progressionCheck?.offer.protocolId,protocol.id,`${graphId}: confirmed check must stop repeating`);
    console.log(`${graphId}: ten honest practice records → ${protocol.label} measured check → confirmed native finding / next action`);
  }

  const incomplete=await fixture('parallette-pushing');
  incomplete.time.value=new Date(start+86400000).toISOString();
  await complete(incomplete,await incomplete.runtime.refresh({athleteId:incomplete.athleteId}));
  incomplete.time.value=new Date(start+4*86400000).toISOString();
  let incompleteSnapshot=await incomplete.runtime.refresh({athleteId:incomplete.athleteId});
  const incompleteProtocol=bundle.benchmarkProtocols.find(item=>item.id===incompleteSnapshot.progressionCheck.offer.protocolId);
  const partial={...resultFor(incomplete,incompleteProtocol),outcome:'partial',qualityCriteriaSatisfied:false,
    measurement:{value:1,unit:'repetitions'}};
  incompleteSnapshot=(await incomplete.runtime.commitProgressionCheck({athleteId:incomplete.athleteId,catalogueVersion:bundle.catalogueVersion,result:partial})).snapshot;
  assert(!stateSatisfiesSubject(incompleteProtocol.subject,incompleteSnapshot.state));
  assert(incompleteSnapshot.progressionCheck.why.includes('last check did not confirm'));
  assert(incompleteSnapshot.progressionCheck.why.includes('Keep practising the current variation'));
  assert.equal(incompleteSnapshot.progressionCheck.offer.availability,'blocked');

  // A generic graph prerequisite block must not mask a modify-only restriction
  // when deciding whether an exact capacity test is safe to attempt.
  const restricted=await fixture('parallette-pushing');
  restricted.time.value=new Date(start+86400000).toISOString();
  const modify=createRestrictionReport({eventId:'modify-wrist',athleteId:restricted.athleteId,catalogueVersion:bundle.catalogueVersion,
    occurredAt:restricted.time.value,recordedAt:restricted.time.value,severity:'modify',demandDomains:['hand-wrist-bearing'],bodyRegions:['wrist']});
  const restrictedSnapshot=(await restricted.runtime.commitRestrictionReport({athleteId:restricted.athleteId,event:modify})).snapshot;
  let restrictedChecks=0;
  for(const protocol of bundle.benchmarkProtocols) {
    const exercise=bundle.exercises.find(item=>item.id===protocol.exerciseId);
    const variant=exercise?.prescriptionVariants.find(item=>item.id===protocol.prescriptionVariantId);
    if(!variant) continue;
    const request={exerciseId:exercise.id,exerciseDefinitionVersion:exercise.definitionVersion,prescriptionVariantId:variant.id};
    if(!restrictionExposureDomains(request,variant.demand,catalogue.projectionPolicy).has('hand-wrist-bearing'))continue;
    const offer=progressionCheckOffer({bundle,state:restrictedSnapshot.state,intent:restrictedSnapshot.intent,projectionPolicy:catalogue.projectionPolicy},protocol);
    assert(offer.availability==='blocked' && offer.blockers.includes('active-restriction'),protocol.id);
    restrictedChecks++;
  }
  assert(restrictedChecks>50);

  const press=await fixture('press-to-handstand');
  for(const id of ['straight-arm-support-tall-support','straight-arm-support-scapular-control',
    'overhead-support-shoulder-flexion-access','overhead-support-active-elevation']) {
    const protocol=bundle.benchmarkProtocols.find(item=>item.id===id);
    assert(protocol,id);
    const observations=Math.max(protocol.confirmation.qualifyingObservations,protocol.confirmation.minimumDistinctSessions);
    for(let index=0;index<observations;index++) {
      press.time.value=new Date(start-(observations-index)*3*86400000).toISOString();
      await press.store.appendEvidenceEvent(createGuidedProtocolEvidence(press.athleteId,bundle,resultFor(press,protocol)));
    }
  }
  press.time.value=new Date(start+86400000).toISOString();
  const pressSnapshot=await press.runtime.refresh({athleteId:press.athleteId});
  assert.equal(pressSnapshot.generated.emphasis.primary.targetMilestone.nodeId,'feet-assisted-tuck-press-load');
  assert(pressSnapshot.progressionCheck && pressSnapshot.progressionCheck.offer.availability==='available',JSON.stringify(pressSnapshot.progressionCheck));
  assert.notEqual(pressSnapshot.progressionCheck.offer.protocolId,'overhead-support-stacked-support',
    'An inverted capacity prerequisite must first route to its unconfirmed safe exit ladder');

  const hard=await fixture('parallette-pushing');
  hard.time.value=new Date(start+86400000).toISOString();
  let snapshot=await hard.runtime.refresh({athleteId:hard.athleteId});
  const oldInput={createdAt:snapshot.asOf,bundle,intent:snapshot.intent,state:snapshot.state,projectionPolicy:catalogue.projectionPolicy};
  const old=generateMixedVNextSession(oldInput),oldBytes=canonicalJson(old);
  assert.equal(old.plan.generatorPolicyVersion,1);
  snapshot=await complete(hard,snapshot,'hard');
  hard.time.value=new Date(Date.parse(hard.time.value)+3600000).toISOString();
  snapshot=await hard.runtime.refresh({athleteId:hard.athleteId});
  const input={createdAt:snapshot.asOf,bundle,intent:snapshot.intent,state:snapshot.state,projectionPolicy:catalogue.projectionPolicy};
  const unreduced=generateMixedVNextSession(input),reduced=generateFeedbackVNextSession(input);
  const freshStart=validateWorkoutStart({generated:reduced,bundle,state:snapshot.state,intent:snapshot.intent,projectionPolicy:catalogue.projectionPolicy});
  assert(freshStart.allowed,JSON.stringify(freshStart.issues));
  const originalKnee=structureWorkoutPlan(unreduced.plan,bundle).find(item=>item.exercise.id==='knee-push-up');
  const reducedKnee=structureWorkoutPlan(reduced.plan,bundle).find(item=>item.exercise.id==='knee-push-up');
  assert.equal(originalKnee.intervals.filter(i=>i.kind==='work').length,4);
  assert.equal(reducedKnee.intervals.filter(i=>i.kind==='work').length,3,'Hard must reduce actual next sets');
  assert.equal(reducedKnee.targetLabel,originalKnee.targetLabel);
  assert.deepEqual(reducedKnee.intervals.filter(i=>i.kind==='rest').map(i=>i.durationSeconds),[80,80,80]);
  assert(reduced.plan.intendedDurationSeconds<unreduced.plan.intendedDurationSeconds);
  assert.equal(reduced.plan.generatorPolicyVersion,2);
  assert(isMixedWorkoutPlan(reduced.plan));
  assert(validateSessionPlan(reduced.plan).valid);
  assert.equal(workoutExecutionTimeline(reduced.plan,bundle).reduce((sum,i)=>sum+i.durationSeconds,0),reduced.plan.intendedDurationSeconds);
  assert.equal(canonicalJson(generateMixedVNextSession(oldInput)),oldBytes,'Native generator1 remains byte-identical');
  assert.equal(canonicalJson(generateFeedbackVNextSession(input)),canonicalJson(reduced),'Current generator is deterministic');
  for(const minutes of [5,10,15,20]) {
    const custom=generateFeedbackVNextCustomSession(input,minutes);
    assert(custom.ok && validateSessionPlan(custom.plan).valid);
    assert.equal(workoutExecutionTimeline(custom.plan,bundle).reduce((sum,i)=>sum+i.durationSeconds,0),custom.plan.intendedDurationSeconds);
    assert(!custom.itemExplanations.some(item=>item.whyIntensity.includes('standard dose is reduced')));
  }
  assert.equal(snapshot.progressionCheck?.offer.availability,'blocked','Hard feedback must not invite an immediate performance test');
  assert(snapshot.progressionCheck?.when.includes('Rest'));
  hard.time.value=new Date(start+2*86400000).toISOString();
  let setup=(await hard.runtime.startAssessment({athleteId:hard.athleteId,mode:'targeted-reconfirmation'})).assessment;
  while(setup.step.kind!=='review') {
    const kind=setup.step.kind;
    const answer=kind==='safety'?{kind,severity:'none'}:kind==='experience'?{kind,experience:'experienced'}
      :kind==='inactivity'?{kind,inactivity:'active'}:kind==='inversion'?{kind,familiarity:'none'}
        :kind==='goals'?{kind,graphIds:['parallette-pushing']}:kind==='equipment'?{kind,equipment:['floor','parallettes','wall']}
          :{kind,graphId:setup.step.graphId,response:'not-sure'};
    setup=await hard.runtime.answerAssessment({draft:setup.draft,answer});
  }
  const knee=bundle.benchmarkProtocols.find(item=>item.id==='parallette-pushing-knee-push-up');
  // The targeted route can be empty when no finding needs reconfirmation; use
  // its exact native target to isolate the safety gate from target selection.
  const safetyDraft={...setup.draft,targetedProtocolIds:[knee.id]};
  await assert.rejects(()=>hard.runtime.commitGuidedTest({athleteId:hard.athleteId,draft:safetyDraft,result:resultFor(hard,knee)}),/recover-before-check/,
    'Setup first append must not bypass the progression recovery gate across midnight');
  const restriction=createRestrictionReport({eventId:'feedback-test-wrist',athleteId:hard.athleteId,catalogueVersion:bundle.catalogueVersion,
    occurredAt:hard.time.value,recordedAt:hard.time.value,severity:'block',demandDomains:['hand-wrist-bearing'],bodyRegions:['wrist']});
  await hard.runtime.commitRestrictionReport({athleteId:hard.athleteId,event:restriction});
  await assert.rejects(()=>hard.runtime.startProgressionCheck({athleteId:hard.athleteId,protocolId:'parallette-pushing-knee-push-up'}));
  const removedEquipment=await fixture('l-sit-v-sit');
  let equipmentSnapshot=await removedEquipment.runtime.refresh({athleteId:removedEquipment.athleteId});
  const supportOffer=equipmentSnapshot.assessmentReview.guidedTests.find(item=>item.protocolId==='straight-arm-support-tall-support');
  assert.equal(supportOffer?.availability,'available');
  const equipmentDraft=equipmentSnapshot.assessmentDraft;
  removedEquipment.time.value=new Date(start+86400000).toISOString();
  await removedEquipment.store.putAthleteIntent({...equipmentSnapshot.intent,updatedAt:removedEquipment.time.value,equipment:['floor']});
  equipmentSnapshot=await removedEquipment.runtime.refresh({athleteId:removedEquipment.athleteId});
  assert(equipmentSnapshot.assessmentReview.guidedTests.find(item=>item.protocolId===supportOffer.protocolId)?.blockers.includes('missing-equipment'),
    'A committed setup must use current equipment after another device removes the bars');
  const support=bundle.benchmarkProtocols.find(item=>item.id===supportOffer.protocolId);
  await assert.rejects(()=>removedEquipment.runtime.commitGuidedTest({athleteId:removedEquipment.athleteId,draft:equipmentDraft,result:resultFor(removedEquipment,support)}),/missing-equipment/,
    'A stale saved setup result cannot first append through removed current equipment');
  console.log('Feedback dose: Hard 4→3 sets with original target/rest, honest shorter Today/Custom timelines, immutable native-v1 replay and current safety pass.');
} finally {for(const store of stores)store.close();}
