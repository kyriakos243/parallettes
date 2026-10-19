import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
createRequire(import.meta.url)('fake-indexeddb/auto');
import { loadTypeScriptModule as load } from './lib/load-typescript.mjs';
const { experiencedPlacementCatalogue: catalogue } = load('app/vnext/production/experiencedPlacement.ts');
const { createVNextReleaseCandidateRuntime } = load('app/vnext/releaseCandidate/runtime.ts');
const { createVNextShadowStore } = load('app/vnext/persistence/index.ts');
const assessment = load('app/vnext/assessment/index.ts');
const { generateMixedVNextSession, generateMixedVNextCustomSession } = load('app/vnext/planning/mixed.ts');
const { milestoneBenchmarkId } = load('app/vnext/definitions/ids.ts');
const { projectAthleteState } = load('app/vnext/projection/index.ts');
const bundle = catalogue.bundle;
let tick = 0;
const now = () => new Date(Date.parse('2026-10-19T09:00:00.000Z') + tick++ * 1000).toISOString();
const setup = async (graphId, nodeId, extra = {}) => {
  const athleteId = `placement-${crypto.randomUUID()}`;
  const store = createVNextShadowStore({ databaseName: athleteId });
  const runtime = createVNextReleaseCandidateRuntime({ store, clock: now, catalogue: { ...catalogue,
    generateSession: generateMixedVNextSession, generateCustomSession: generateMixedVNextCustomSession } });
  let started = await runtime.startAssessment({ athleteId, mode: 'new-placement', initialEquipment: ['floor', 'parallettes', 'wall'] });
  let current = started.assessment;
  const steps = [];
  while (current.step.kind !== 'review') {
    steps.push(current.step.kind);
    const kind = current.step.kind;
    const answer = kind === 'safety' ? { kind, severity: extra.restriction ? 'block' : 'none', ...(extra.restriction ? { demandDomains: ['hand-wrist-bearing'], bodyRegions: ['wrist'] } : {}) }
      : kind === 'experience' ? { kind, experience: 'experienced' }
      : kind === 'inactivity' ? { kind, inactivity: extra.inactivity ?? 'active' }
      : kind === 'goals' ? { kind, graphIds: [graphId] }
      : kind === 'equipment' ? { kind, equipment: extra.equipment ?? ['floor','parallettes','wall'] }
      : kind === 'inversion' ? { kind, familiarity: 'freestanding' }
      : { kind, graphId, ...(nodeId ? { protocolId: milestoneBenchmarkId(graphId, nodeId) } : {}), response: nodeId ? 'clean' : 'not-sure' };
    assert.ok(steps.length < 12, 'New setup should not traverse every lower skill');
    current = await runtime.answerAssessment({ draft: current.draft, answer });
  }
  const committed = await runtime.commitAssessment({ athleteId, draft: current.draft });
  return { athleteId, runtime, store, draft: committed.draft, snapshot: committed.snapshot, steps };
};
const cleanInput = (ctx, protocolId, outcome = 'clean') => {
  const protocol = bundle.benchmarkProtocols.find(p => p.id === protocolId);
  const metric = protocol.metric;
  const at = now();
  return { eventId: `test-${crypto.randomUUID()}`, observationSessionId: assessment.guidedObservationOccasionId(ctx.athleteId, at),
    occurredAt: at, recordedAt: at, protocolId, outcome, qualityCriteriaSatisfied: outcome === 'clean', safetyCriteriaSatisfied: outcome === 'clean',
    ...(metric.kind === 'duration-seconds' ? { measurement: { value: metric.minimum, unit: 'seconds' } }
      : metric.kind === 'repetitions' ? { measurement: { value: metric.minimum, unit: 'repetitions' } }
      : metric.kind === 'successful-attempts' ? { measurement: { value: metric.minimumSuccessful, unit: 'attempts', attemptsTotal: metric.minimumSuccessful } } : {}) };
};
const check = async (ctx, protocolId, outcome = 'clean') => {
  const input = cleanInput(ctx, protocolId, outcome);
  const result = await ctx.runtime.commitGuidedTest({ athleteId: ctx.athleteId, draft: ctx.draft, result: input });
  ctx.snapshot = result.snapshot;
  const replay = await ctx.runtime.commitGuidedTest({ athleteId: ctx.athleteId, draft: ctx.draft, result: input });
  assert.equal(replay.snapshot.sources.evidenceEvents.length, result.snapshot.sources.evidenceEvents.length, 'Exact saved retry must not duplicate or be blocked by completed-check suppression');
  await assert.rejects(() => ctx.runtime.commitGuidedTest({ athleteId: ctx.athleteId, draft: ctx.draft, result: { ...input, outcome: 'partial' } }), /differs/);
  return input;
};
const floor = await setup('parallette-pushing', 'floor-push-up');
assert.equal(floor.draft.policyVersion, 2);
assert.equal(floor.steps.filter(s => s === 'skill-selection').length, 1);
assert.equal(floor.snapshot.state.nodeStates.find(n => n.milestone.nodeId === 'floor-push-up').lifecycle, 'estimated');
assert.ok(!floor.snapshot.state.workingNodes.some(n => n.milestone.nodeId === 'floor-push-up'), 'Claim alone must not create a working skill');
let offer = floor.snapshot.assessmentReview.guidedTests.find(o => o.availability === 'available');
assert.equal(offer.protocolId, 'body-line-control-hollow-control');
await check(floor, offer.protocolId);
offer = floor.snapshot.assessmentReview.guidedTests.find(o => o.availability === 'available');
assert.equal(offer.protocolId, 'parallette-pushing-floor-push-up');
await check(floor, offer.protocolId);
const state = floor.snapshot.state;
assert.equal(state.nodeStates.find(n => n.milestone.nodeId === 'floor-push-up').lifecycle, 'demonstrated');
assert.ok(state.workingNodes.some(n => n.milestone.nodeId === 'floor-push-up'), 'Measured own skill should become practice');
assert.ok(!state.eligibleTargets.some(n => n.milestone.nodeId === 'controlled-parallette-push-up'), 'One placement must not unlock successor');
assert.equal(state.capacityFindings.find(c => c.capacity.facetId === 'hollow-control').confirmationSatisfied, false, 'One day must not pretend repeated confirmation');
assert.ok(floor.snapshot.assessmentReview.checksComplete);
assert.ok(floor.snapshot.assessmentReview.checkedToday.some(c => c.label === 'Floor push-up' && c.result === 'Target met'));
assert.ok(floor.snapshot.assessmentReview.nextPracticeLabels.includes('Floor push-up'));
assert.ok(!floor.snapshot.generated.plan.items.some(i => i.targetMilestone?.nodeId === 'floor-push-up'), 'Recent check load must not be discarded for extra hard work');
const checkedFloorEvent = floor.snapshot.sources.evidenceEvents.find(e => e.source === 'guided-test' && e.benchmarkProtocolId === 'parallette-pushing-floor-push-up');
await floor.store.appendEvidenceEvent({ ...checkedFloorEvent, id: 'same-occasion-repeat' });
let repeated = await floor.runtime.refresh({ athleteId: floor.athleteId });
assert.equal(repeated.state.nodeStates.find(n=>n.milestone.nodeId==='floor-push-up').lifecycle, 'demonstrated', 'Repeated facts in one occasion cannot manufacture confirmation');
const firstRecovered = await floor.runtime.refresh({ athleteId: floor.athleteId, asOf:'2026-10-22T10:00:00.000Z' });
assert.ok(firstRecovered.generated.plan.items.some(i=>i.targetMilestone?.nodeId==='floor-push-up'),'First recovered workout must contain the checked skill');
const nextDayAt = '2026-10-20T12:00:00.000Z';
await floor.store.appendEvidenceEvent({ ...checkedFloorEvent, id: 'later-occasion-floor', occurredAt: nextDayAt, recordedAt: nextDayAt,
  observationSessionId: assessment.guidedObservationOccasionId(floor.athleteId,nextDayAt) });
const recovered = await floor.runtime.refresh({ athleteId: floor.athleteId, asOf: '2026-10-23T12:00:00.000Z' });
assert.equal(recovered.state.nodeStates.find(n=>n.milestone.nodeId==='floor-push-up').lifecycle,'established');
assert.ok(recovered.generated.plan.items.some(i=>['floor-push-up','controlled-parallette-push-up'].includes(i.targetMilestone?.nodeId)),'Confirmed skill must retain its level or advance through fully satisfied successor gates');
assert.equal(recovered.assessmentReview.checkedToday.length,0,'Today summary must expire without altering history');
assert.ok(floor.snapshot.generated.ok, 'Checked profile must retain a usable plan');
assert.ok(state.recentLoad.exposures.length >= 2, 'Checks must count as load');

const lsit = await setup('l-sit-v-sit','full-l-sit');
let checks = 0;
while (!lsit.snapshot.assessmentReview.checksComplete) {
  const next = lsit.snapshot.assessmentReview.guidedTests.find(o => o.availability === 'available');
  assert.ok(next, 'L-sit readiness route should progress without replaying lower achievements');
  await check(lsit, next.protocolId);
  assert.ok(++checks <= 5);
}
assert.equal(checks,5);
assert.ok(lsit.snapshot.state.workingNodes.some(n => n.milestone.nodeId === 'full-l-sit'));
assert.equal(lsit.snapshot.state.nodeStates.find(n => n.milestone.nodeId === 'one-leg-l-sit').lifecycle,'unknown');
const recoveredL = await lsit.runtime.refresh({ athleteId: lsit.athleteId, asOf:'2026-10-22T12:00:00.000Z' });
assert.ok(recoveredL.generated.plan.items.some(i=>i.targetMilestone?.nodeId==='full-l-sit'));

const symptom = await setup('parallette-pushing','floor-push-up');
await check(symptom,'body-line-control-hollow-control','symptom');
assert.ok(!symptom.snapshot.assessmentReview.guidedTests.some(o => o.protocolId === 'parallette-pushing-floor-push-up' && o.availability === 'available'));
assert.ok(!symptom.snapshot.state.workingNodes.some(n => n.milestone.nodeId === 'floor-push-up'));
const restricted = await setup('l-sit-v-sit','full-l-sit',{restriction:true});
assert.ok(!restricted.snapshot.assessmentReview.guidedTests.some(o => o.protocolId === 'straight-arm-support-tall-support' && o.availability === 'available'));
const away = await setup('parallette-pushing','floor-push-up',{inactivity:'over-six-months'});
assert.ok(away.snapshot.assessmentReview.guidedTests.some(o => o.protocolId === 'parallette-pushing-knee-push-up'), 'Time away keeps ordinary gate route');
await check(away,'body-line-control-hollow-control');
assert.ok(away.snapshot.assessmentReview.guidedTests.find(o=>o.protocolId==='body-line-control-hollow-control').blockers.includes('check-another-day'), 'A second occasion must not be immediately offered');
const hs = await setup('handstand-balance','controlled-short-parallette-balance');
assert.ok(hs.snapshot.assessmentReview.guidedTests.some(o=>o.protocolId==='handstand-balance-grounded-side-exit' && o.availability==='available'));
assert.ok(!hs.snapshot.assessmentReview.guidedTests.some(o=>o.protocolId==='handstand-balance-controlled-short-parallette-balance' && o.availability==='available'));
const beginner = await setup('parallette-pushing');
assert.equal(beginner.snapshot.state.nodeStates.find(n=>n.milestone.nodeId==='knee-push-up').lifecycle,'unknown');
assert.ok(beginner.snapshot.generated.ok);
assert.equal(assessment.guidedObservationOccasionId(floor.athleteId,'2026-10-19T23:00:00.000Z'), assessment.guidedObservationOccasionId(floor.athleteId,'2026-10-19T09:00:00.000Z'));
assert.notEqual(assessment.guidedObservationOccasionId(floor.athleteId,'2026-10-20T09:00:00.000Z'), assessment.guidedObservationOccasionId(floor.athleteId,'2026-10-19T09:00:00.000Z'));
console.log('Placement checks passed: visual route, estimates only, exact measured entry, no successor unlock, readiness/symptoms/inactivity/exit gates, retained load, same-day occasions and idempotent retry.');
