import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const { trainingQualityCatalogue: catalogue } = load("app/vnext/production/trainingQuality.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId } = load("app/vnext/assessment/index.ts");
const { buildProgressAndGoals, buildSkillDetail } = load("app/vnext/presentation/progress.ts");
const { buildAssessmentEntryPoints } = load("app/vnext/presentation/assessment.ts");
const { progressionCheckOffer } = load("app/vnext/assessment/progressionCheck.ts");
const { generateProgressionSessionPlan } = load("app/vnext/planning/feedbackDose.ts");
const { safeWorkoutSwaps, structureWorkoutItem } = load("app/vnext/workoutUx.ts");
const { workoutSwapChoices, workoutVariantLabel, hasUnspecifiedRegressionGuidance } = load("app/vnext/workoutGuidance.ts");
const { canonicalJson } = load("app/vnext/persistence/index.ts");
const bundle = catalogue.bundle;
const originalDefinitions = canonicalJson(bundle);
const athleteId = "synthetic-polish-athlete";
const asOf = "2026-10-20T09:00:00.000Z";
const intent = { schemaVersion: 1, athleteId, updatedAt: asOf,
  goals: [{ graphId: "parallette-pushing", priority: "primary" }],
  equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } };
const protocol = bundle.benchmarkProtocols.find(p => p.id === "parallette-pushing-knee-push-up");
assert(protocol);
const result = occurredAt => createGuidedProtocolEvidence(athleteId, bundle, {
  eventId: `polish-${occurredAt.slice(0, 10)}`, observationSessionId: guidedObservationOccasionId(athleteId, occurredAt),
  protocolId: protocol.id, occurredAt, recordedAt: occurredAt, outcome: "clean",
  qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true,
  measurement: { value: protocol.metric.minimum, unit: "repetitions" },
});
const project = (events, at = asOf) => {
  const projected = projectAthleteState({ definitionBundles: catalogue.history, athleteId, evidenceEvents: events,
    sessionPlans: [], sessionRecords: [], intent, asOf: at, policy: catalogue.projectionPolicy });
  assert(projected.ok, JSON.stringify(projected.issues));
  return projected.state;
};
const one = [result("2026-10-17T09:00:00.000Z")];
const input = { bundle, intent, state: project(one) };
const before = canonicalJson(input);
const family = buildProgressAndGoals(input).families.find(f => f.graphId === "parallette-pushing");
assert.equal(family.confidence.state, "confirmation-building");
assert.equal(family.availability.state, "confirmation");
assert.equal(family.availability.label, "Confirmation in progress");
assert.match(family.availability.message, /2 qualifying results across at least 2 separate training occasions/);
assert.doesNotMatch(JSON.stringify(family), /Reconfirm|Reconfirmation/);
const detail = buildSkillDetail(input, "parallette-pushing");
assert.equal(detail.assessmentAction.kind, "start-guided-test");
assert.equal(detail.assessmentAction.label, "Complete confirmation");
assert(detail.assessmentAction.protocolIds.includes(protocol.id));
const offer = progressionCheckOffer({ ...input, projectionPolicy: catalogue.projectionPolicy }, protocol);
const entry = buildAssessmentEntryPoints({ ...input, guidedTestOffers: [offer] }).actions.find(a => a.protocolIds.includes(protocol.id));
assert.equal(entry.kind, "guided-test", "The detail action must match an actual offered check, so its button stays usable");
assert.match(entry.label, /Complete confirmation/);
assert.match(detail.demonstratedState.supportingText, /confirmation is still in progress/);
assert.equal(canonicalJson(input), before, "Presentation cannot mutate evidence, intent or projection");

const two = [...one, result("2026-10-20T08:00:00.000Z")];
const confirmed = buildProgressAndGoals({ ...input, state: project(two) }).families.find(f => f.graphId === "parallette-pushing");
assert.notEqual(confirmed.confidence.state, "confirmation-building");
assert.equal(confirmed.confidence.state, "current");
// Knee support is a non-expiring foundation. Exercise the presentation's
// existing stale-finding branch explicitly rather than inventing an expiry.
const confirmedState = project(two);
const staleState = { ...confirmedState, nodeStates: confirmedState.nodeStates.map(n =>
  n.milestone.nodeId === "knee-push-up" ? { ...n, confidence: "stale" } : n) };
const stale = buildSkillDetail({ ...input, state: staleState }, "parallette-pushing");
assert.equal(stale.availability.state, "reconfirmation");
assert.equal(stale.assessmentAction.label, "Reconfirm current ability");

const unknown = project([]);
const handstandIntent = { ...intent, goals: [{ graphId: "handstand-balance", priority: "primary" }] };
const generated = generateProgressionSessionPlan({ bundle, intent: handstandIntent, state: unknown,
  projectionPolicy: catalogue.projectionPolicy, createdAt: asOf, seed: "polish-guidance" });
assert(generated.ok);
const sourceItem = generated.plan.items[0];
const sideExit = bundle.exercises.find(e => e.id === "floor-side-exit-practice");
const currentItem = { ...sourceItem, exerciseId: sideExit.id, exerciseDefinitionVersion: sideExit.definitionVersion,
  prescriptionVariantId: "floor-side-exit-practice-standard", purpose: "primary-development", benchmarkProtocolId: undefined };
const nativeSwaps = safeWorkoutSwaps({ plan: { ...generated.plan, items: [currentItem] }, item: currentItem,
  bundle, state: unknown, intent: handstandIntent, projectionPolicy: catalogue.projectionPolicy });
const swapBytes = canonicalJson(nativeSwaps);
const swaps = workoutSwapChoices(nativeSwaps);
assert(!swaps.some(s => s.prescriptionVariantId === "floor-side-exit-practice-regressed"),
  "An undefined generic regression is not a useful new choice");
assert(swaps.some(s => s.exerciseId === "grounded-side-exit-rehearsal"), "The named authored easier step remains available");
assert(swaps.every(s => !/reduce.*assistance|Regressed/u.test(workoutVariantLabel(s.variantLabel))));
assert.equal(canonicalJson(nativeSwaps), swapBytes, "Menu filtering cannot change retained native recovery options");

// Retained native selections keep their identity, target and timer, even when
// their old ambiguous label is made readable on the current screen.
const selection = { exerciseId: sideExit.id, exerciseDefinitionVersion: sideExit.definitionVersion,
  prescriptionVariantId: "floor-side-exit-practice-regressed" };
const selectionBytes = canonicalJson(selection);
const saved = structureWorkoutItem(currentItem, bundle, selection);
assert(hasUnspecifiedRegressionGuidance(saved.variant.label));
assert.equal(workoutVariantLabel(saved.variant.label), "Smaller comfortable range; keep the support shown.");
assert.equal(workoutVariantLabel("Regressed — Rehearse from a low pike."), "Easier — Rehearse from a low pike.");
assert.equal(canonicalJson(selection), selectionBytes);
assert.equal(saved.intervals.reduce((sum, interval) => sum + interval.durationSeconds, 0), currentItem.plannedSeconds);
assert.equal(canonicalJson(bundle), originalDefinitions, "Native definition bytes remain unchanged");
console.log("PASS confirmation building versus stale reconfirmation; exact targets and gates retained; named easier choices; historical variants remain readable and unchanged");
