import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTypeScriptModule as load } from './lib/load-typescript.mjs';
createRequire(import.meta.url)('fake-indexeddb/auto');
const { experiencedPlacementCatalogue: catalogue } = load('app/vnext/production/experiencedPlacement.ts');
const { createVNextShadowStore, canonicalJson } = load('app/vnext/persistence/index.ts');
const { createVNextReleaseCandidateRuntime } = load('app/vnext/releaseCandidate/runtime.ts');
const { reviseQuickSetupContext, deferSupportingPlacement } = load('app/vnext/assessment/quickSetup.ts');
const { createAssessmentDraft, answerAssessmentStep, goBackAssessment, nextAssessmentStep, buildAssessmentEvidence } = load('app/vnext/assessment/index.ts');
const bundle = catalogue.bundle;
let tick = 0;
const now = () => new Date(Date.parse('2026-10-19T12:00:00.000Z') + tick++ * 1000).toISOString();
const athleteId = 'quick-setup-fixture';
const baseStore = createVNextShadowStore({ databaseName:`quick-setup-${crypto.randomUUID()}` });
let saves = 0, failSave = false;
const store = new Proxy(baseStore, { get(target, key) {
  if (key === 'saveAssessmentDraft') return async draft => { saves++; if (failSave) throw new Error('Injected draft save failure'); return target.saveAssessmentDraft(draft); };
  const value = Reflect.get(target, key);
  return typeof value === 'function' ? value.bind(target) : value;
} });
const runtime = createVNextReleaseCandidateRuntime({store,catalogue,clock:now});
const context = [
  {kind:'safety',severity:'none'},
  {kind:'experience',experience:'experienced'},
  {kind:'inactivity',inactivity:'active'},
  {kind:'goals',graphIds:['parallette-pushing','l-sit-v-sit']},
  {kind:'equipment',equipment:['floor','parallettes']},
];
try {
  const start = await runtime.startAssessment({athleteId,mode:'new-placement'});
  const savedBefore = saves;
  let current = await runtime.updateAssessmentContext({draft:start.assessment.draft,answers:context});
  assert.equal(saves,savedBefore+1,'Grouped context must be one atomic draft write');
  assert.equal(current.step.kind,'skill-selection');
  assert.equal(current.step.graphId,'parallette-pushing');
  assert.equal(current.draft.answers.length,5);
  const savedContext = (await runtime.refresh({athleteId})).intent;
  assert.deepEqual(savedContext.goals.map(goal => goal.graphId), context[3].graphIds,'Submitted goals apply before placement checks');
  assert.deepEqual(savedContext.equipment, context[4].equipment,'Submitted equipment applies before placement checks');
  assert.equal((await runtime.refresh({athleteId})).sources.evidenceEvents.length,0,'Context is not evidence');
  await assert.rejects(()=>runtime.deferSupportingAssessment({draft:current.draft}),/main starting point/);
  current = await runtime.answerAssessment({draft:current.draft,answer:{kind:'skill-selection',graphId:'parallette-pushing',protocolId:'parallette-pushing-floor-push-up',response:'clean'}});
  current = await runtime.deferSupportingAssessment({draft:current.draft});
  assert.equal(current.step.kind,'review');
  assert.deepEqual(current.review.provisional.map(x=>x.protocolId),['parallette-pushing-floor-push-up']);
  assert.deepEqual(current.draft.answers.find(x=>x.value.kind==='goals').value.graphIds,context[3].graphIds,'Deferring checks must preserve supporting goals');
  const weak = await buildAssessmentEvidence(current.draft,bundle);
  assert.equal(weak.filter(e=>e.type==='performance_observed').length,1,'Deferred choices must create no observation');
  assert.ok(weak.every(e=>e.source==='self-assessment'));
  const atReview = current.draft;
  let revisited = reviseQuickSetupContext(atReview,context,now(),bundle);
  assert.equal(revisited.revisitAnswers.find(x=>x.stepId==='skill-parallette-pushing').value.protocolId,'parallette-pushing-floor-push-up','Same context retains the known choice');
  revisited = reviseQuickSetupContext(atReview,[...context.slice(0,4),{kind:'equipment',equipment:['floor']}],now(),bundle);
  assert.ok(!revisited.revisitAnswers.length,'Changed equipment must invalidate downstream prefills');
  const beforeFailure = canonicalJson((await runtime.refresh({athleteId})).assessmentDraft);
  const writesBeforeFailure = saves;
  await assert.rejects(()=>runtime.updateAssessmentContext({draft:atReview,answers:[{kind:'safety',severity:'block'},...context.slice(1)]}),/restriction/);
  assert.equal(saves,writesBeforeFailure,'Invalid context must not persist partially');
  await assert.rejects(()=>runtime.updateAssessmentContext({draft:atReview,answers:context.slice(0,3)}),/Complete the required context/);
  assert.equal(canonicalJson((await runtime.refresh({athleteId})).assessmentDraft),beforeFailure);
  failSave=true;
  await assert.rejects(()=>runtime.updateAssessmentContext({draft:atReview,answers:context}),/Injected/);
  failSave=false;
  assert.equal(canonicalJson((await runtime.refresh({athleteId})).assessmentDraft),beforeFailure,'Failed atomic write preserves the prior draft');
  const legacy=createAssessmentDraft({id:'native-old-draft',athleteId,createdAt:now(),bundle,mode:'new-placement'});
  assert.throws(()=>reviseQuickSetupContext(legacy,context,now(),bundle),/modern/);
  assert.throws(()=>deferSupportingPlacement(legacy,now(),bundle),/modern/);
  const inverted = [...context.slice(0,3),{kind:'goals',graphIds:['handstand-balance']},context[4]];
  assert.throws(()=>reviseQuickSetupContext(atReview,inverted,now(),bundle),/Complete the required context/,'Inversion context must not disappear behind grouped UI');
  const validInversion=reviseQuickSetupContext(atReview,[...inverted,{kind:'inversion',familiarity:'none'}],now(),bundle);
  assert.equal(nextAssessmentStep(validInversion,bundle).graphId,'handstand-balance');
  const back=goBackAssessment(validInversion,now(),bundle);
  assert.equal(nextAssessmentStep(back,bundle).kind,'inversion');
  console.log('Quick setup passed: atomic native context, submitted goals/equipment without premature evidence, Back retention, changed-choice invalidation, supporting deferral, safe required context and save-failure recovery.');
} finally { baseStore.close(); }
