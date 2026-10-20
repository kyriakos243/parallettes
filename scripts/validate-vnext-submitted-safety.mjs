import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTypeScriptModule as load } from './lib/load-typescript.mjs';
createRequire(import.meta.url)('fake-indexeddb/auto');
const { experiencedPlacementCatalogue: catalogue } = load('app/vnext/production/experiencedPlacement.ts');
const { createVNextShadowStore, canonicalJson } = load('app/vnext/persistence/index.ts');
const { createVNextReleaseCandidateRuntime } = load('app/vnext/releaseCandidate/runtime.ts');
const { buildAssessmentEvidence, persistSubmittedAssessmentRestriction, createRestrictionReport } = load('app/vnext/assessment/index.ts');
const { reviseQuickSetupContext } = load('app/vnext/assessment/quickSetup.ts');
const bundle = catalogue.bundle;
const stores = [];
let tick = 0;
const now = () => new Date(Date.parse('2026-10-20T12:00:00.000Z') + tick++ * 1000).toISOString();
const positive = { kind:'safety', severity:'block', demandDomains:['hand-wrist-bearing'], bodyRegions:['left wrist'] };
const context = safety => [safety, {kind:'experience',experience:'new'}, {kind:'inactivity',inactivity:'active'},
  {kind:'goals',graphIds:['planche']}, {kind:'equipment',equipment:['floor','parallettes']}];
const fixture = async (clock = now) => {
  const athleteId = `submitted-safety-${crypto.randomUUID()}`;
  const base = createVNextShadowStore({databaseName:athleteId}); stores.push(base);
  const faults = {event:false,draft:false};
  const store = new Proxy(base, {get(target,key) {
    if (key === 'appendEvidenceEvent') return async event => {if (faults.event) throw new Error('Injected safety event failure');return target.appendEvidenceEvent(event);};
    if (key === 'saveAssessmentDraft') return async draft => {if (faults.draft) throw new Error('Injected safety draft failure');return target.saveAssessmentDraft(draft);};
    const value=Reflect.get(target,key);return typeof value === 'function' ? value.bind(target) : value;
  }});
  const runtime=createVNextReleaseCandidateRuntime({store,catalogue,clock});
  const started=await runtime.startAssessment({athleteId,mode:'new-placement'});
  return {athleteId,base,store,faults,runtime,started};
};
const assertRestricted = snapshot => {
  assert.equal(snapshot.state.activeRestrictions.length,1);
  assert.ok(snapshot.generated.plan);
  assert.ok(!snapshot.generated.plan.items.some(item=>['knee-push-up','side-plank'].includes(item.exerciseId)), 'Submitted hand restriction must exclude loaded pushing before placement commit');
};
try {
  const f=await fixture();
  const initialIntent=canonicalJson(f.started.snapshot.intent);
  let current=await f.runtime.updateAssessmentContext({draft:f.started.assessment.draft,answers:context(positive)});
  let snapshot=await f.runtime.refresh({athleteId:f.athleteId,asOf:f.started.assessment.draft.createdAt});
  assertRestricted(snapshot);
  assert.equal(canonicalJson(snapshot.intent),initialIntent,'Safety submission must not commit unfinished goals or placement');
  assert.equal(snapshot.sources.evidenceEvents.length,1);
  assert.equal(snapshot.sources.evidenceEvents[0].type,'restriction_reported');
  const exactReport=canonicalJson(snapshot.sources.evidenceEvents[0]);
  await persistSubmittedAssessmentRestriction(f.store,current.draft,bundle);
  current=await f.runtime.answerAssessment({draft:current.draft,answer:{kind:'skill-selection',graphId:'planche',response:'not-sure'}});
  assert.equal(current.step.kind,'review');
  snapshot=await f.runtime.refresh({athleteId:f.athleteId}); // Continue later
  assertRestricted(snapshot);
  assert.equal(snapshot.assessmentDraft.status,'in-progress');
  const reopened=createVNextShadowStore({databaseName:f.athleteId});stores.push(reopened);
  const reloaded=createVNextReleaseCandidateRuntime({store:reopened,catalogue,clock:now});
  snapshot=await reloaded.refresh({athleteId:f.athleteId});
  assertRestricted(snapshot);
  assert.equal(snapshot.sources.evidenceEvents.length,1,'Reload and exact retry must not duplicate safety reports');
  current=await f.runtime.backAssessment({draft:current.draft});
  snapshot=await f.runtime.refresh({athleteId:f.athleteId});
  assertRestricted(snapshot);
  current=await f.runtime.updateAssessmentContext({draft:current.draft,answers:context({kind:'safety',severity:'none'})});
  snapshot=await f.runtime.refresh({athleteId:f.athleteId});
  assertRestricted(snapshot);
  assert.equal(snapshot.sources.evidenceEvents.length,1,'An unfinished no-symptoms answer must not clear previous observations');
  assert.equal(canonicalJson(snapshot.sources.evidenceEvents[0]),exactReport);

  // Monotonic answer timestamps may be ahead of the wall clock by a few ms.
  // Removing their draft answer or restarting must not hide an accepted report.
  const frozenAt=now();
  const frozen=await fixture(()=>frozenAt);
  let frozenDraft=await frozen.runtime.updateAssessmentContext({draft:frozen.started.assessment.draft,answers:context(positive)});
  assertRestricted(await frozen.runtime.refresh({athleteId:frozen.athleteId}));
  while(frozenDraft.draft.answers.length) frozenDraft=await frozen.runtime.backAssessment({draft:frozenDraft.draft});
  assertRestricted(await frozen.runtime.refresh({athleteId:frozen.athleteId}));
  frozenDraft=await frozen.runtime.updateAssessmentContext({draft:frozenDraft.draft,answers:context({kind:'safety',severity:'none'})});
  assertRestricted(await frozen.runtime.refresh({athleteId:frozen.athleteId}));
  await frozen.runtime.startAssessment({athleteId:frozen.athleteId,mode:'new-placement'});
  assertRestricted(await frozen.runtime.refresh({athleteId:frozen.athleteId}));
  assert.equal((await frozen.base.readProjectionSources(frozen.athleteId)).evidenceEvents.length,1);

  // Normal completion reuses the exact independently saved event, including retries.
  const c=await fixture();
  let complete=await c.runtime.updateAssessmentContext({draft:c.started.assessment.draft,answers:context(positive)});
  complete=await c.runtime.answerAssessment({draft:complete.draft,answer:{kind:'skill-selection',graphId:'planche',response:'not-sure'}});
  const before=(await c.base.readProjectionSources(c.athleteId)).evidenceEvents;
  const committed=await c.runtime.commitAssessment({athleteId:c.athleteId,draft:complete.draft});
  await c.runtime.commitAssessment({athleteId:c.athleteId,draft:complete.draft});
  await c.runtime.commitAssessment({athleteId:c.athleteId,draft:committed.draft});
  assert.equal(canonicalJson((await c.base.readProjectionSources(c.athleteId)).evidenceEvents),canonicalJson(before));

  // Failed append retains the submitted native draft; refresh cannot return an
  // unrestricted workout and a fresh runtime recovers the exact event offline.
  const broken=await fixture();broken.faults.event=true;
  await assert.rejects(()=>broken.runtime.updateAssessmentContext({draft:broken.started.assessment.draft,answers:context(positive)}),/Injected safety event/);
  const retained=await broken.base.readAssessmentDraft(broken.athleteId);
  assert.equal(retained.answers[0].value.severity,'block');
  await assert.rejects(()=>broken.runtime.refresh({athleteId:broken.athleteId}),/Injected safety event/);
  await assert.rejects(()=>broken.runtime.backAssessment({draft:retained}),/Injected safety event/,'Back cannot discard an unsaved safety report');
  broken.faults.event=false;
  const retried=await broken.runtime.updateAssessmentContext({draft:broken.started.assessment.draft,answers:context(positive)});
  assert.equal(canonicalJson(retried.draft),canonicalJson(retained),'Retry from the original visible form must reuse the saved answer identity/time');
  const recovered=createVNextReleaseCandidateRuntime({store:broken.store,catalogue,clock:now});
  assertRestricted(await recovered.refresh({athleteId:broken.athleteId}));
  assert.equal((await broken.base.readProjectionSources(broken.athleteId)).evidenceEvents.length,1);

  // A failed atomic context write is never presented as a successful submission;
  // retry saves one report with no partial skill/intent change.
  const saveFailure=await fixture();saveFailure.faults.draft=true;
  await assert.rejects(()=>saveFailure.runtime.updateAssessmentContext({draft:saveFailure.started.assessment.draft,answers:context(positive)}),/Injected safety draft/);
  saveFailure.faults.draft=false;
  await saveFailure.runtime.updateAssessmentContext({draft:saveFailure.started.assessment.draft,answers:context(positive)});
  assertRestricted(await saveFailure.runtime.refresh({athleteId:saveFailure.athleteId}));

  // Previously emitted native context reports retain their exact legacy ID/time
  // and payload if an old assessment was interrupted before its final draft write.
  const legacy=await fixture();
  let native=reviseQuickSetupContext(legacy.started.assessment.draft,context(positive),now(),bundle);
  const {answerAssessmentStep}=load('app/vnext/assessment/index.ts');
  native=answerAssessmentStep(native,{kind:'skill-selection',graphId:'planche',response:'not-sure'},now(),bundle);
  const nativeEvents=await buildAssessmentEvidence(native,bundle);
  for(const event of nativeEvents) await legacy.base.appendEvidenceEvent(event);
  await legacy.base.saveAssessmentDraft(native);
  await legacy.runtime.refresh({athleteId:legacy.athleteId});
  await legacy.runtime.commitAssessment({athleteId:legacy.athleteId,draft:native});
  assert.equal(canonicalJson((await legacy.base.readProjectionSources(legacy.athleteId)).evidenceEvents),canonicalJson(nativeEvents));
  const reset=await c.runtime.resetProgress({athleteId:c.athleteId,resetAt:now()});
  assert.equal(reset.sources.evidenceEvents.length,0);
  assert.equal(reset.state.activeRestrictions.length,0,'Reset must not resurrect a cleared assessment draft report');
  const separate=await fixture();
  const reportedAt=now();
  const report=createRestrictionReport({eventId:'stopped-workout-restriction',athleteId:separate.athleteId,
    occurredAt:reportedAt,recordedAt:reportedAt,catalogueVersion:bundle.catalogueVersion,
    severity:'block',demandDomains:['hand-wrist-bearing'],bodyRegions:['left wrist']});
  const reported=await separate.runtime.commitRestrictionReport({athleteId:separate.athleteId,event:report});
  assertRestricted(reported.snapshot);
  const retry=await separate.runtime.commitRestrictionReport({athleteId:separate.athleteId,event:report});
  assert.equal(retry.snapshot.sources.evidenceEvents.length,1);
  assert.equal(retry.snapshot.sources.sessionRecords.length,0,'A standalone safety report must not invent a workout');
  await assert.rejects(()=>separate.runtime.commitRestrictionReport({athleteId:separate.athleteId,event:{...report,athleteId:'another-athlete'}}),/another athlete/);
  await assert.rejects(()=>separate.runtime.commitRestrictionReport({athleteId:separate.athleteId,event:{...report,severity:'modify'}}),/conflict/);
  console.log('Submitted safety passed: immediate restriction before placement, Continue later/reload/Back, no draft clearance, exact commit reuse, failed-write recovery and native partial-commit compatibility.');
} finally {for(const store of stores) store.close();}
