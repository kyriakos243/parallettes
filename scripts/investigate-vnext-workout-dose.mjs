import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
const { trainingQualityCatalogue: catalogue } = load("app/vnext/production/trainingQuality.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId } = load("app/vnext/assessment/index.ts");
const { generateProgressionSessionPlan } = load("app/vnext/planning/feedbackDose.ts");
const { structureWorkoutPlan } = load("app/vnext/workoutUx.ts");
const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const bundle = catalogue.bundle, now = Date.parse("2026-10-20T09:00:00.000Z"), day = 86400000;
const iso = n => new Date(n).toISOString();
const evidenceFor = (athleteId, ids) => ids.flatMap(id => {
  const protocol = bundle.benchmarkProtocols.find(p => p.id === id); assert(protocol, id);
  const count = Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions);
  return Array.from({ length: count }, (_, index) => {
    const at = iso(now - (count - index + 2) * day);
    const metric = protocol.metric;
    const measurement = metric.kind === "duration-seconds" ? { value: metric.minimum, unit: "seconds" }
      : metric.kind === "repetitions" ? { value: metric.minimum, unit: "repetitions" }
        : metric.kind === "successful-attempts" ? { value: metric.minimumSuccessful, unit: "attempts", attemptsTotal: metric.maximumAttempts } : undefined;
    return createGuidedProtocolEvidence(athleteId, bundle, { eventId: `${id}-${index}`, protocolId: id,
      observationSessionId: guidedObservationOccasionId(athleteId, at), occurredAt: at, recordedAt: at,
      outcome: "clean", qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true, ...(measurement ? { measurement } : {}) });
  });
});
const report = [];
const families = bundle.graphs.map(g => g.id);
for (const graphId of families) {
  for (const demand of ["technique", "standard", "challenge"]) {
    const athleteId = `dose-${graphId}-${demand}`;
    const intent = { schemaVersion: 1, athleteId, updatedAt: iso(now), goals: [{ graphId, priority: "primary" }],
      equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: demand, preferences: { specialistOptIn: false } };
    const projected = projectAthleteState({ athleteId, asOf: iso(now), intent, policy: catalogue.projectionPolicy,
      definitionBundles: catalogue.history, evidenceEvents: [], sessionRecords: [], sessionPlans: [] });
    assert(projected.ok);
    const input = { createdAt: iso(now), bundle, intent, state: projected.state,
      projectionPolicy: catalogue.projectionPolicy, sessionDemand: demand, seed: "dose-investigation" };
    const generated = generateProgressionSessionPlan(input);
    if (!generated.ok) { report.push({ graphId, demand, ok: false }); continue; }
    assert(validateWorkoutStart({ ...input, generated }).allowed);
    const items = structureWorkoutPlan(generated.plan, bundle);
    report.push({ graphId, demand, ok: true, duration: generated.plan.intendedDurationSeconds,
      development: items.filter(i => !["preparation", "recovery"].includes(generated.plan.items.find(p => p.id === i.planItemId).purpose))
        .map(i => ({ exercise: i.exercise.id, sets: i.intervals.filter(s => s.kind === "work").length,
          target: i.targetLabel, seconds: i.intervals.reduce((s, n) => s + n.durationSeconds, 0) })) });
  }
}
for (const accessConfirmed of [false, true]) {
  const athleteId = `dose-handstand-exit-${accessConfirmed}`;
  const intent = { schemaVersion: 1, athleteId, updatedAt: iso(now),
    goals: [{ graphId: "handstand-balance", priority: "primary" }, { graphId: "vertical-push-hspu", priority: "secondary" }, { graphId: "parallette-pushing", priority: "secondary" }],
    equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "challenge", preferences: { specialistOptIn: false } };
  const events = evidenceFor(athleteId, ["handstand-balance-grounded-side-exit",
    ...(accessConfirmed ? ["overhead-support-shoulder-flexion-access"] : [])]);
  const projection = projectAthleteState({ athleteId, asOf: iso(now), intent, policy: catalogue.projectionPolicy,
    definitionBundles: catalogue.history, evidenceEvents: events, sessionRecords: [], sessionPlans: [] });
  assert(projection.ok);
  const input = { createdAt: iso(now), bundle, intent, state: projection.state,
    projectionPolicy: catalogue.projectionPolicy, sessionDemand: "challenge", seed: "dose-investigation" };
  const generated = generateProgressionSessionPlan(input); assert(generated.ok);
  assert(validateWorkoutStart({ ...input, generated }).allowed);
  report.push({ graphId: "handstand-balance", stage: accessConfirmed ? "exit-and-shoulder-access-confirmed" : "grounded-exit-confirmed",
    demand: "challenge", ok: true, duration: generated.plan.intendedDurationSeconds,
    development: structureWorkoutPlan(generated.plan, bundle).filter(i => !["preparation", "recovery"].includes(generated.plan.items.find(p => p.id === i.planItemId).purpose))
      .map(i => ({ exercise: i.exercise.id, sets: i.intervals.filter(s => s.kind === "work").length,
        target: i.targetLabel, seconds: i.intervals.reduce((s, n) => s + n.durationSeconds, 0) })) });
}
const wall = bundle.exercises.find(e => e.id === "wall-shoulder-flexion-line-drill");
const variant = wall.prescriptionVariants.find(v => v.id.endsWith("-standard"));
const timingReplay = structureWorkoutPlan({ items: [{ id: "dose-observed-wall-block", exerciseId: wall.id,
  exerciseDefinitionVersion: wall.definitionVersion, prescriptionVariantId: variant.id,
  purpose: "primary-development", plannedSeconds: 480, demand: variant.demand }] }, bundle)[0];
assert.equal(timingReplay.intervals.filter(i => i.kind === "work").length, 8);
console.log(JSON.stringify({ scenarios: report, timingReplay: { note: "Timing-only replay of the observed 480-second block; not an eligibility decision.",
  exercise: wall.id, workSets: 8, workSeconds: timingReplay.intervals.filter(i => i.kind === "work").reduce((sum, i) => sum + i.durationSeconds, 0),
  restSeconds: timingReplay.plannedRestSeconds, target: timingReplay.targetLabel } }, null, 2));
