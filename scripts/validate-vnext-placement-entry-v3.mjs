import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// Goal-trust placement (projection 12, review batch 1). An honest experienced
// athlete who declares a clean stable tuck planche reaches that exact check
// within two occasions; a passed readiness check does not block its own
// milestone check next day; the main goal's checks lead the review.
createRequire(import.meta.url)("fake-indexeddb/auto");
const { createVNextShadowStore } = load("app/vnext/persistence/index.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { goalTrustCatalogue } = load("app/vnext/production/goalTrust.ts");
const { trainingQualityCatalogue } = load("app/vnext/production/trainingQuality.ts");
const { generateGoalTrustSessionPlan } = load("app/vnext/planning/feedbackDose.ts");
const A = load("app/vnext/assessment/index.ts");
const { currentCheckSafetyBlockers } = load("app/vnext/assessment/checkSafety.ts");
const { evaluateTrainability } = load("app/vnext/projection/index.ts");

let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${label}`); };
const bundle = goalTrustCatalogue.bundle;
const protocol = (id) => bundle.benchmarkProtocols.find((item) => item.id === id);
const tuckId = "planche-stable-tuck-planche";
const graphOf = (offer) => offer.subject.kind === "milestone" ? offer.subject.milestone.graphId : "capacity";

const simulate = async (label, catalogue, occasions = 4) => {
  const policy = catalogue.projectionPolicy;
  const athleteId = `placement-v3-${label}`;
  const store = createVNextShadowStore({ databaseName: `${athleteId}-${Date.now()}` });
  // Occasions 49 h apart: every guided check is a genuine separate occasion.
  const occasion = (n, hour = 9) => new Date(Date.UTC(2026, 9, 1, hour) + n * 49 * 3_600_000).toISOString();
  let draft = A.createAssessmentDraft({ id: `${athleteId}-draft`, athleteId, createdAt: occasion(0, 8), bundle, placementVersion: 2 });
  let tick = Date.parse(occasion(0, 8));
  const answer = (value) => { draft = A.answerAssessmentStep(draft, value, new Date(tick += 1000).toISOString(), bundle); };
  answer({ kind: "safety", severity: "none" });
  answer({ kind: "experience", experience: "experienced" });
  answer({ kind: "inactivity", inactivity: "active" });
  answer({ kind: "goals", graphIds: ["planche", "l-sit-v-sit"] });
  answer({ kind: "equipment", equipment: ["floor", "parallettes"] });
  answer({ kind: "skill-selection", graphId: "planche", protocolId: tuckId, response: "clean" });
  answer({ kind: "skill-selection", graphId: "l-sit-v-sit", protocolId: "l-sit-v-sit-full-l-sit", response: "clean" });
  assert(A.isAssessmentAtReview(draft, bundle));
  await A.commitAssessment(store, draft, bundle);
  const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => occasion(0) });
  const result = (item, occurredAt) => ({ eventId: `${athleteId}-${item.id}-${occurredAt.slice(0, 16).replace(/[^0-9]/gu, "")}`,
    observationSessionId: A.guidedObservationOccasionId(athleteId, occurredAt), protocolId: item.id,
    occurredAt, recordedAt: occurredAt, outcome: "clean", qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true,
    ...(item.metric.kind === "range" || item.metric.kind === "quality" ? {} : { measurement: item.metric.kind === "repetitions"
      ? { value: item.metric.minimum, unit: "repetitions" }
      : item.metric.kind === "duration-seconds" ? { value: item.metric.minimum, unit: "seconds" }
        : { value: item.metric.minimumSuccessful, unit: "attempts", attemptsTotal: item.metric.maximumAttempts } }) });
  const days = [];
  let firstReview;
  for (let n = 0; n < occasions; n++) {
    let asOf = occasion(n);
    let snapshot = await runtime.refresh({ athleteId, asOf });
    const before = snapshot.generated;
    const saved = [];
    let tuckOffered = false;
    for (let step = 0; step < 12; step++) {
      const review = A.buildAssessmentReview(draft, bundle, snapshot.state, policy);
      firstReview ??= review;
      if (review.guidedTests.some((offer) => offer.protocolId === tuckId && offer.availability === "available")) tuckOffered = true;
      const next = review.guidedTests.find((offer) => offer.availability === "available" && !saved.includes(offer.protocolId));
      if (!next) break;
      const item = protocol(next.protocolId);
      asOf = new Date(Date.parse(asOf) + 120_000).toISOString();
      await A.persistGuidedTestEvidence(store, A.createGuidedTestEvidence(draft, bundle, snapshot.state, result(item, asOf), undefined, policy, undefined));
      saved.push(item.id);
      snapshot = await runtime.refresh({ athleteId, asOf });
    }
    days.push({ occasion: n, saved, tuckOffered, state: snapshot.state, intent: snapshot.intent, asOf, before });
  }
  return { days, firstReview, policy };
};

const trust = await simulate("trust", { ...goalTrustCatalogue, generateSession: generateGoalTrustSessionPlan });
const native = await simulate("native", trainingQualityCatalogue);

// The main goal's available checks lead; at most one supporting-goal check while one is available.
{
  const offers = trust.firstReview.guidedTests;
  const plancheAvailable = offers.filter((offer) => offer.availability === "available"
    && !offer.protocolId.startsWith("l-sit") && !["pike-compression", "l-sit-v-sit"].some((key) => offer.protocolId.includes(key)));
  const lsitShown = offers.filter((offer) => graphOf(offer) === "l-sit-v-sit" || offer.protocolId.includes("pike-compression"));
  assert(plancheAvailable.length >= 1, JSON.stringify(offers.map((o) => o.protocolId)));
  assert(lsitShown.length <= 1, JSON.stringify(offers.map((o) => o.protocolId)));
  assert(offers.length <= 4);
  pass(`Main goal checks lead the first review (${offers.map((offer) => offer.protocolId).join(", ")})`);
}

// The declared clean tuck check is reached within two occasions (native: not within four).
{
  const firstTuck = trust.days.find((day) => day.tuckOffered);
  assert(firstTuck && firstTuck.occasion <= 1, JSON.stringify(trust.days.map((day) => ({ occasion: day.occasion, saved: day.saved }))));
  assert(!native.days.some((day) => day.tuckOffered), "Native projection 11 keeps its original ladder");
  const tuckState = (day) => day.state.nodeStates.find((item) => item.milestone.graphId === "planche" && item.milestone.nodeId === "stable-tuck-planche");
  const afterTuck = trust.days.find((day) => day.saved.includes(tuckId));
  assert(afterTuck, "The tuck check was saved");
  assert(["demonstrated", "established"].includes(tuckState(afterTuck).lifecycle));
  assert(afterTuck.state.workingNodes.some((item) => item.milestone.nodeId === "stable-tuck-planche"),
    "A measured tuck becomes working practice without demonstrating any predecessor");
  for (const predecessor of ["toe-light-planche-loading", "foot-assisted-tuck-planche", "brief-floor-tuck-planche"]) {
    const finding = afterTuck.state.nodeStates.find((item) => item.milestone.nodeId === predecessor);
    assert(!["demonstrated", "established"].includes(finding.lifecycle), `${predecessor} is not fabricated`);
  }
  assert(!afterTuck.state.eligibleTargets.some((item) => item.milestone.nodeId === "advanced-tuck-planche"),
    "Advanced tuck is not unlocked by measured entry");
  pass(`Declared stable tuck reached on occasion ${firstTuck.occasion + 1} (native projection 11: not within ${native.days.length}); no predecessor or successor credit`);
}

// The next recovered session leads with the declared main goal and practises the measured tuck.
{
  const next = trust.days[1].before;
  assert(next.ok && next.emphasis && next.plan, JSON.stringify(next.issues));
  assert.equal(next.emphasis.primary.graphId, "planche", JSON.stringify(next.emphasis));
  assert(next.plan.items.some((item) => item.targetMilestone?.nodeId === "stable-tuck-planche"),
    next.plan.items.map((item) => `${item.exerciseId}->${item.targetMilestone?.nodeId ?? "-"}`).join(", "));
  pass(`Next recovered session leads with Planche and practises the measured tuck (${next.plan.items.filter((item) => item.targetMilestone).map((item) => item.exerciseId).join(", ")})`);
}

// A passed readiness check does not block its own milestone check the next day.
{
  const day0 = trust.days[0];
  assert(day0.saved.includes("straight-arm-support-protracted-forward-loading"), JSON.stringify(day0.saved));
  const nextDay = new Date(Date.parse(day0.asOf) + 20 * 3_600_000).toISOString();
  const state = { ...day0.state, asOf: nextDay };
  const lean = protocol("planche-controlled-planche-lean");
  const blockersFor = (policy) => currentCheckSafetyBlockers({ protocol: lean, bundle, state, equipment: ["floor", "parallettes"], policy });
  assert(!blockersFor(trust.policy).includes("recover-before-check"), JSON.stringify(blockersFor(trust.policy)));
  assert(blockersFor(native.policy).includes("recover-before-check"), "Native projection 11 keeps its domain-wide check rule");
  const sameExercise = protocol("straight-arm-support-protracted-forward-loading");
  assert(currentCheckSafetyBlockers({ protocol: sameExercise, bundle, state, equipment: ["floor", "parallettes"], policy: trust.policy })
    .includes("recover-before-check"), "Repeating the same check within 48 h is still delayed");
  pass("A passed forward-lean check no longer blocks the planche-lean check next day; repeating the same check still waits 48 h");
}

// Workout high-load rule: 40 h in projection 12, unchanged 48 h in projection 11.
{
  const day0 = trust.days[0];
  const exercise = bundle.exercises.find((item) => item.id === "parallette-tuck-planche-hold");
  const at = (hours) => new Date(Date.parse(day0.asOf) + hours * 3_600_000).toISOString();
  const decision = (policy, hours) => evaluateTrainability({ request: { exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion,
    prescriptionVariantId: exercise.prescriptionVariants[0].id }, bundle, state: { ...day0.state, asOf: at(hours) }, intent: day0.intent, asOf: at(hours), policy });
  assert(decision(trust.policy, 20).reasonCodes.includes("recent-high-load"));
  assert(!decision(trust.policy, 44).reasonCodes.includes("recent-high-load"));
  assert(decision(native.policy, 44).reasonCodes.includes("recent-high-load"));
  pass("High-demand work is recovered after 40 h in projection 12 (still modified the next day); projection 11 keeps 48 h");
}

console.log(`Goal-trust placement: ${checks} focused checks passed.`);
