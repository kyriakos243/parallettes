import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const { trainingQualityCatalogue: catalogue } = load("app/vnext/production/trainingQuality.ts");
const { restrictionSafetyCatalogue: nativeCatalogue } = load("app/vnext/production/restrictionSafety.ts");
const assessment = load("app/vnext/assessment/index.ts");
const { projectAthleteState, evaluateTrainability } = load("app/vnext/projection/index.ts");
const { missingCurrentSafetyPrerequisites } = load("app/vnext/projection/safetyPrerequisites.ts");
const { planningTrainabilityRequests } = load("app/vnext/planning/index.ts");
const { generateFeedbackVNextSession, generateFeedbackVNextCustomSession } = load("app/vnext/planning/feedbackDose.ts");
const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const { bundle, history, projectionPolicy: policy } = catalogue;
const athleteId = "current-safety-regression";
const iso = (day) => new Date(Date.UTC(2026, 0, 1 + day, 9)).toISOString();
const intent = { schemaVersion: 1, athleteId, updatedAt: iso(0), goals: [{ graphId: "vertical-push-hspu", priority: "primary" }],
  equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: true } };
const subjectKey = (subject) => subject.kind === "milestone" ? `${subject.milestone.graphId}:${subject.milestone.nodeId}`
  : `${subject.capacity.capacityId}:${subject.capacity.facetId}`;
const byId = (id) => {
  const protocol = bundle.benchmarkProtocols.find((item) => item.id === id);
  assert(protocol, id);
  return protocol;
};
const forRef = (ref) => ref.kind === "benchmark" ? byId(ref.benchmarkProtocolId)
  : bundle.benchmarkProtocols.find((item) => subjectKey(item.subject) === subjectKey(ref.kind === "milestone"
    ? { kind: "milestone", milestone: ref.milestone } : { kind: "capacity-facet", capacity: ref.capacity }));
const result = (protocol, day) => {
  const metric = protocol.metric;
  const measurement = metric.kind === "duration-seconds" ? { value: metric.minimum, unit: "seconds" }
    : metric.kind === "repetitions" ? { value: metric.minimum, unit: "repetitions" }
      : metric.kind === "successful-attempts" ? { value: metric.minimumSuccessful, unit: "attempts", attemptsTotal: metric.maximumAttempts } : undefined;
  return { eventId: `safety-${protocol.id}-${day}`, observationSessionId: `safety-occasion-${day}`,
    occurredAt: iso(day), recordedAt: iso(day), protocolId: protocol.id, outcome: "clean",
    qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true, ...(measurement ? { measurement } : {}) };
};
const evidenceFor = (protocol, day) => assessment.createGuidedProtocolEvidence(athleteId, bundle, result(protocol, day));
const events = [];
const seeded = new Set();
const seed = (protocol) => {
  if (seeded.has(protocol.id)) return;
  seeded.add(protocol.id);
  if (protocol.subject.kind === "milestone") {
    const { graphId, nodeId } = protocol.subject.milestone;
    const node = bundle.graphs.find((graph) => graph.id === graphId).nodes.find((item) => item.id === nodeId);
    for (const ref of node.prerequisiteRule?.allOf ?? []) seed(forRef(ref));
    if (node.prerequisiteRule?.anyOf?.length) seed(forRef(node.prerequisiteRule.anyOf[0]));
  }
  const count = Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions);
  for (let i = 0; i < count; i++) events.push(evidenceFor(protocol, 20 - (count - 1 - i) * 3));
};
const project = (day, currentPolicy = policy, evidenceEvents = events) => {
  const projected = projectAthleteState({ athleteId, asOf: iso(day), policy: currentPolicy, definitionBundles: history,
    evidenceEvents, sessionPlans: [], sessionRecords: [], intent, trainabilityRequests: planningTrainabilityRequests(bundle) });
  assert(projected.ok && projected.state, JSON.stringify(projected.issues));
  return projected.state;
};
const requestFor = (protocol) => ({ exerciseId: protocol.exerciseId,
  exerciseDefinitionVersion: bundle.exercises.find((item) => item.id === protocol.exerciseId).definitionVersion,
  prescriptionVariantId: protocol.prescriptionVariantId });
const evaluate = (state, protocol, currentPolicy = policy) => evaluateTrainability({
  request: requestFor(protocol), bundle, state, intent, asOf: state.asOf, policy: currentPolicy });
const offer = (state, protocol, currentPolicy = policy) => assessment.progressionCheckOffer({
  bundle, state, intent, projectionPolicy: currentPolicy }, protocol);
const draftFor = (state, protocol) => {
  let draft = assessment.createAssessmentDraft({ id: `recheck-${protocol.id}`, athleteId, createdAt: state.asOf,
    bundle, mode: "targeted-reconfirmation", existingIntent: intent, existingState: state, placementVersion: 2 });
  draft = { ...draft, targetedProtocolIds: [protocol.id] };
  for (let steps = 0; assessment.nextAssessmentStep(draft, bundle).kind !== "review"; steps++) {
    assert(steps < 12);
    const step = assessment.nextAssessmentStep(draft, bundle), kind = step.kind;
    const answer = kind === "safety" ? { kind, severity: "none" } : kind === "experience" ? { kind, experience: "experienced" }
      : kind === "inactivity" ? { kind, inactivity: "active" } : kind === "inversion" ? { kind, familiarity: "freestanding" }
        : kind === "goals" ? { kind, graphIds: ["vertical-push-hspu"] }
          : kind === "equipment" ? { kind, equipment: intent.equipment } : { kind, graphId: step.graphId, response: "not-sure" };
    draft = assessment.answerAssessmentStep(draft, answer, state.asOf, bundle);
  }
  return draft;
};
const eccentric = byId("vertical-push-hspu-wall-hspu-eccentric");
const bottom = byId("vertical-push-hspu-wall-hspu-bottom-position-exit");
const wall = byId("handstand-balance-wall-height-side-exit");
seed(byId("vertical-push-hspu-full-wall-hspu"));
const originalBytes = JSON.stringify({ events, history });
const old = project(66, nativeCatalogue.projectionPolicy);
const current = project(66);
const missing = (state, protocol) => missingCurrentSafetyPrerequisites({ milestone: protocol.subject.milestone, bundle, state })
  .map((ref) => ref.nodeId);
assert.deepEqual(missing(current, eccentric), ["wall-height-side-exit", "wall-hspu-bottom-position-exit"]);
assert.equal(evaluate(old, eccentric, nativeCatalogue.projectionPolicy).decision, "modify", "Native policy keeps its original interpretation");
assert.equal(offer(old, eccentric, nativeCatalogue.projectionPolicy).availability, "available");
for (const id of ["wall-hspu-eccentric", "assisted-wall-hspu-concentric", "partial-wall-hspu", "full-wall-hspu"]) {
  const protocol = byId(`vertical-push-hspu-${id}`);
  assert(evaluate(current, protocol).reasonCodes.includes("safety-prerequisite-not-current"), id);
  assert.equal(evaluate(current, protocol).decision, "block", id);
  assert(offer(current, protocol).blockers.includes("safety-prerequisite-not-current"), id);
  const draft = draftFor(current, protocol);
  const setupOffer = assessment.buildAssessmentReview(draft, bundle, current, policy).guidedTests.find((item) => item.protocolId === protocol.id);
  assert(!setupOffer || setupOffer.blockers.includes("safety-prerequisite-not-current"), `${id}: setup never offers an available unsafe recheck`);
  if (id === "wall-hspu-eccentric") assert(setupOffer, "The stale established eccentric is an explicit setup recheck");
  const input = result(protocol, 66);
  assert.throws(() => assessment.createGuidedTestEvidence(draft, bundle, current, input, undefined, policy),
    /safety-prerequisite-not-current|not offered/);
  const saved = assessment.createGuidedProtocolEvidence(athleteId, bundle, input);
  assert.deepEqual(assessment.createGuidedTestEvidence(draft, bundle, current, input, saved, policy), saved,
    "Current safety cannot rewrite or delete an already-saved exact native result");
}
const generate = (state, currentPolicy = policy) => ({ createdAt: state.asOf, bundle, state, intent, projectionPolicy: currentPolicy });
const oldPlan = generateFeedbackVNextSession(generate(old, nativeCatalogue.projectionPolicy));
assert(oldPlan.plan?.items.some((item) => item.exerciseId === "wall-hspu-eccentric"), "Reproduce original long-gap recommendation");
assert(validateWorkoutStart({ generated: oldPlan, bundle, state: old, intent, projectionPolicy: nativeCatalogue.projectionPolicy }).allowed);
assert(!validateWorkoutStart({ generated: oldPlan, bundle, state: current, intent, projectionPolicy: policy }).allowed,
  "A saved native workout must satisfy current exit safety before Start/Resume");
for (const generated of [generateFeedbackVNextSession(generate(current)), generateFeedbackVNextCustomSession(generate(current), 25)]) {
  assert(!generated.plan?.items.some((item) => ["wall-hspu-eccentric", "assisted-wall-hspu-concentric", "partial-wall-hspu", "parallette-wall-hspu"].includes(item.exerciseId)),
    "Today and Custom exclude demanding HSPU while exits are stale");
}
assert.equal(offer(current, wall).availability, "available", "Wall exit can be reconfirmed without re-earning strength");
assert(offer(current, bottom).blockers.includes("safety-prerequisite-not-current"));
const wallRenewed = [...events, evidenceFor(wall, 66)];
const afterWall = project(69, policy, wallRenewed);
assert.equal(offer(afterWall, bottom).availability, "available", "The next exit opens in dependency order after recovery");
assert(offer(afterWall, eccentric).blockers.includes("safety-prerequisite-not-current"));
const afterBoth = project(72, policy, [...wallRenewed, evidenceFor(bottom, 69)]);
assert.deepEqual(missing(afterBoth, eccentric), []);
assert.equal(offer(afterBoth, eccentric).availability, "available", "Historical eccentric can now be reconfirmed");
assert.equal(afterBoth.nodeStates.find((item) => item.milestone.nodeId === "wall-hspu-eccentric").confidence, "stale");
assert.equal(afterBoth.nodeStates.find((item) => item.milestone.nodeId === "wall-hspu-eccentric").lifecycle, "established");

// A longer break requires safety checks in order, not every old strength test.
const longBreakEvents = [...events];
for (const [index, id] of ["handstand-balance-grounded-side-exit", "handstand-balance-low-inversion-side-exit",
  "handstand-balance-supported-inversion-tolerance", "handstand-balance-wall-height-side-exit",
  "vertical-push-hspu-wall-hspu-bottom-position-exit"].entries()) {
  const protocol = byId(id), day = 104 + index * 3, state = project(day, policy, longBreakEvents);
  assert.equal(offer(state, protocol).availability, "available", `${id}: ordered safety recheck after 84-day break`);
  longBreakEvents.push(evidenceFor(protocol, day));
}
const recovered = project(119, policy, longBreakEvents);
assert.equal(offer(recovered, eccentric).availability, "available", "Stale general strength does not force full onboarding");
assert.deepEqual(missing(recovered, eccentric), []);
assert(recovered.capacityFindings.some((item) => item.confidence === "stale"));
const higherExit = project(107, policy, [...events, evidenceFor(wall, 104)]);
const lowerExit = higherExit.nodeStates.find((item) => item.milestone.nodeId === "low-inversion-side-exit");
assert.equal(lowerExit.confidence, "stale");
assert(lowerExit.satisfiedForEligibilityBy.some((proof) => proof.milestone.nodeId === "wall-height-side-exit"));
assert.deepEqual(missing(higherExit, eccentric), ["supported-inversion-tolerance", "wall-hspu-bottom-position-exit"],
  "Explicit current higher-exit proof covers lower exits, without inferring other readiness or the HSPU bottom exit");

// All families use the same exact-check gate, including stronger/specialist
// outcomes. This is pre-existing measured history, not a predicted learning rate.
const allEvents = bundle.benchmarkProtocols.flatMap((protocol) => {
  const count = Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions);
  return Array.from({ length: count }, (_, i) => evidenceFor(protocol, 20 - (count - 1 - i) * 3));
});
const allStale = project(104, policy, allEvents);
let gatedChecks = 0;
for (const protocol of bundle.benchmarkProtocols) {
  if (protocol.subject.kind !== "milestone" || missing(allStale, protocol).length === 0) continue;
  assert(offer(allStale, protocol).blockers.includes("safety-prerequisite-not-current"), protocol.id);
  const exercise = bundle.exercises.find((item) => item.id === protocol.exerciseId);
  const variant = exercise.prescriptionVariants.find((item) => item.id === protocol.prescriptionVariantId);
  if (variant.demand["inversion-technical"] === "high") {
    assert.equal(evaluate(allStale, protocol).decision, "block", `${protocol.id}: demanding workout cannot use another graph link to bypass exit readiness`);
  }
  const draft = draftFor(allStale, protocol);
  const setup = assessment.buildAssessmentReview(draft, bundle, allStale, policy).guidedTests.find((item) => item.protocolId === protocol.id);
  assert(!setup || setup.blockers.includes("safety-prerequisite-not-current"), `${protocol.id}: exact setup reconfirmation`);
  gatedChecks++;
}
assert(gatedChecks > 30, "Exercise safety ancestry across Handstand, HSPU, Press and Transitions");
assert.equal(JSON.stringify({ events, history }), originalBytes, "No immutable event or definition was rewritten");
console.log(`Current safety prerequisites: native 46/84-day histories, ${gatedChecks} dependent checks, ordered exits, workout gates and exact retry passed.`);
