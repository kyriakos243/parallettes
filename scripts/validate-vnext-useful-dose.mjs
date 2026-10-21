import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { validateShadowSessionPair, validateShadowSessionPlan } from "../profile-api/vnext-session-validation.js";
createRequire(import.meta.url)("fake-indexeddb/auto");
const { trainingQualityCatalogue: current } = load("app/vnext/production/trainingQuality.ts");
const generators = load("app/vnext/planning/feedbackDose.ts");
const { generateMixedVNextSession } = load("app/vnext/planning/mixed.ts");
const dose = load("app/vnext/practiceDose.ts");
const native = load("app/vnext/workoutUx.ts");
const { workoutExecutionTimeline, isMixedWorkoutPlan } = load("app/vnext/mixedWorkout.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { buildTodayWorkoutPresentation: buildTodayWorkout } = load("app/vnext/presentation/today.ts");
const { buildSessionHistory } = load("app/vnext/ui/sessionHistory.ts");
const { validateWorkoutStart } = load("app/vnext/releaseCandidate/workoutStartSafety.ts");
const { validateGeneratedSession } = load("app/vnext/planning/validation.ts");
const { vNextGeneratorPolicy } = load("app/vnext/planning/policy.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { createVNextShadowStore, canonicalJson, sha256 } = load("app/vnext/persistence/index.ts");
const bundle = current.bundle, asOf = "2026-10-21T09:00:00.000Z";
const definitionsBefore = canonicalJson(current.history);
const { createHash } = await import("node:crypto");
const { generateMixedVNextCustomSession } = load("app/vnext/planning/mixed.ts");
const { limitUsefulDose } = load("app/vnext/planning/usefulDose.ts");
let cases = 0;
const fixture = (graphId, demand = "standard", secondary) => {
  const intent = { schemaVersion: 1, athleteId: `useful-${graphId}-${demand}`, updatedAt: asOf,
    goals: [{ graphId, priority: "primary" }, ...(secondary ? [{ graphId: secondary, priority: "secondary" }] : [])],
    equipment: ["floor", "wall", "parallettes"], defaultSessionDemand: demand, preferences: { specialistOptIn: false } };
  const result = projectAthleteState({ athleteId: intent.athleteId, asOf, intent, policy: current.projectionPolicy,
    definitionBundles: current.history, evidenceEvents: [], sessionRecords: [], sessionPlans: [] });
  assert(result.ok);
  return { createdAt: asOf, intent, state: result.state, bundle, projectionPolicy: current.projectionPolicy,
    sessionDemand: demand, seed: "useful-dose" };
};
const workSets = (plan, item) => dose.structurePracticeWorkoutItem(plan, item, bundle).intervals.filter(i => i.kind === "work").length;
const verify = (generated, input, maximum = 1500) => {
  assert(generated.ok && generated.plan);
  const plan = generated.plan;
  assert.equal(plan.generatorPolicyVersion, 6);
  assert(isMixedWorkoutPlan(plan));
  assert.equal(validateShadowSessionPlan(plan, plan.id, plan.athleteId), null);
  assert.deepEqual(validateGeneratedSession({ ...input, generated,
    policy: { ...vNextGeneratorPolicy, id: plan.generatorPolicyId, version: 6,
      exactDurationSeconds: generated.durationException?.targetSeconds ?? maximum } }), []);
  const safety = validateWorkoutStart({ ...input, generated });
  assert(safety.allowed, JSON.stringify(safety.issues));
  assert(plan.intendedDurationSeconds <= maximum);
  assert.equal(workoutExecutionTimeline(plan, bundle).reduce((sum, i) => sum + i.durationSeconds, 0), plan.intendedDurationSeconds);
  const today = buildTodayWorkout({ generated, bundle });
  for (const item of plan.items) {
    const structured = dose.structurePracticeWorkoutItem(plan, item, bundle);
    assert.deepEqual(structured.intervals, native.structureWorkoutItem(item, bundle).intervals);
    assert.equal(today.blocks.find(b => b.planItemId === item.id).prescriptionLabel, structured.targetLabel);
    if (dose.routinePracticeLimitSeconds(item)) assert(workSets(plan, item) <= 3);
    for (const option of safety.swapOptions[item.id] ?? []) {
      assert.equal(dose.usefulDoseExceeded(plan, item, option), false);
    }
  }
  if (generated.durationException) {
    assert.equal(today.durationMessage, generated.durationException.message);
    assert.equal(generated.durationException.targetSeconds, maximum);
    assert.equal(generated.durationException.actualSeconds, plan.intendedDurationSeconds);
  }
  const repeat = maximum === 1500 ? generators.generateUsefulDoseSessionPlan(input) : undefined;
  if (repeat) assert.equal(canonicalJson(repeat), canonicalJson(generated));
  cases++;
};

// Golden outputs captured before this change, including all native Custom durations.
const historical = [];
for (const graph of bundle.graphs) for (const demand of ["technique", "standard", "challenge"]) {
  const input = fixture(graph.id, demand);
  for (const generate of [generateMixedVNextSession, generators.generateFeedbackVNextSession,
    generators.generateTrainingQualitySessionPlan, generators.generateProgressionSessionPlan, generators.generatePracticeSessionPlan]) historical.push(generate(input));
  for (const generate of [generateMixedVNextCustomSession, generators.generateFeedbackVNextCustomSession,
    generators.generateTrainingQualityCustomPlan, generators.generateProgressionCustomPlan, generators.generatePracticeCustomPlan])
    for (const minutes of [5, 10, 15, 20]) historical.push(generate(input, minutes));
}
assert.equal(createHash("sha256").update(JSON.stringify(historical)).digest("hex"),
  "90f1de3b34e834bae371e441029f64bb13b6dc7eb3c5d16e5ffa425804105ceb");
assert.equal(canonicalJson(current.history), definitionsBefore);
console.log("PASS 525 native generator 1–5 Today/Custom golden outputs and definitions 1–8 remain unchanged");

for (const graph of bundle.graphs) for (const secondary of [undefined, ...bundle.graphs.filter(g => g.id !== graph.id).map(g => g.id)])
  for (const demand of ["technique", "standard", "challenge"]) {
    const input = fixture(graph.id, demand, secondary);
    const old = generators.generatePracticeSessionPlan(input);
    const fresh = generators.generateUsefulDoseSessionPlan(input);
    verify(fresh, input);
    for (let i = 0; i < fresh.plan.items.length; i++) {
      assert.equal(fresh.plan.items[i].exerciseId, old.plan.items[i].exerciseId);
      assert(fresh.plan.items[i].plannedSeconds <= old.plan.items[i].plannedSeconds);
      if (!dose.routinePracticeLimitSeconds(fresh.plan.items[i])) assert.equal(fresh.plan.items[i].plannedSeconds, old.plan.items[i].plannedSeconds,
        "Other useful work must keep its native dose");
    }
    if (!secondary) for (const minutes of [5, 10, 15, 20]) {
      const custom = generators.generateUsefulDoseCustomPlan(input, minutes);
      verify(custom, input, minutes * 60);
      for (const item of custom.plan.items.filter(i => !["preparation", "recovery"].includes(i.purpose))) {
        const source = fresh.plan.items.find(i => i.exerciseId === item.exerciseId && i.prescriptionVariantId === item.prescriptionVariantId);
        assert(source); assert(item.plannedSeconds <= source.plannedSeconds, "Custom must not inflate native Today dose");
      }
    }
  }
console.log(`PASS ${cases} mixed-goal/demand/Custom scenarios: useful dose, no refill, exact timing, current safety and consistent presentation`);

const input = fixture("vertical-push-hspu");
const before = generators.generatePracticeCustomPlan(input, 20);
const after = generators.generateUsefulDoseCustomPlan(input, 20);
const oldPike = before.plan.items.find(i => i.exerciseId === "pike-elevation");
const pike = after.plan.items.find(i => i.exerciseId === "pike-elevation");
assert.equal(workSets(before.plan, oldPike), 17); assert.equal(workSets(after.plan, pike), 3);
assert.equal(pike.plannedSeconds, 180);
assert.match(after.durationException.message, /maximum/);
const supportInput = fixture(bundle.graphs.find(g => g.id === "l-sit-v-sit").id);
const supportBefore = generators.generatePracticeCustomPlan(supportInput, 20);
const supportAfter = generators.generateUsefulDoseCustomPlan(supportInput, 20);
const oldSupport = supportBefore.plan.items.find(i => i.exerciseId === "support-hold");
const newSupport = supportAfter.plan.items.find(i => i.exerciseId === "support-hold");
assert(oldSupport && newSupport);
assert.equal(workSets(supportBefore.plan, oldSupport), 9);
assert.equal(workSets(supportAfter.plan, newSupport), 4);
assert.equal(newSupport.plannedSeconds, generators.generateUsefulDoseSessionPlan(supportInput).plan.items.find(i => i.exerciseId === "support-hold").plannedSeconds);
const modifiedInput = { ...input, state: { ...input.state, retainedDoseAdjustments: [{ exerciseId: pike.exerciseId,
  exerciseDefinitionVersion: pike.exerciseDefinitionVersion, prescriptionVariantId: pike.prescriptionVariantId }] } };
for (const generate of [i => generators.generateUsefulDoseSessionPlan(i), i => generators.generateUsefulDoseCustomPlan(i,20)]) {
  const g = generate(modifiedInput); verify(g, modifiedInput, g.durationException.targetSeconds);
  assert.equal(workSets(g.plan, g.plan.items.find(i => i.exerciseId === "pike-elevation")), 2);
}
const small = { ...after, plan: { ...after.plan, intendedDurationSeconds: 60, items: [{...pike,plannedSeconds:60}] },
  itemExplanations: [{...after.itemExplanations.find(e => e.planItemId === pike.id)}] };
assert.equal(limitUsefulDose(input, small).plan.items[0].plannedSeconds,60);
console.log("PASS former 17-Pike/9-Support cases become 3/4 sets; feedback reduces 3 to 2 and an existing one-set dose stays smaller");

// Same aggregate limit applies to native choices, saved swaps and remaining-item resumes.
const over = { ...after, plan: { ...after.plan, items: after.plan.items.map(i => i.id === pike.id ? {...i,plannedSeconds:240} : i) } };
assert.equal(validateWorkoutStart({ ...input, generated: over }).allowed,false);
assert.equal(validateWorkoutStart({ ...input, generated: over,planItemIds:[pike.id] }).allowed,false);
const duplicate = { ...after, plan: { ...after.plan, items: [...after.plan.items,{...pike,id:"duplicate-pike",plannedSeconds:60}] } };
assert.equal(validateWorkoutStart({ ...input, generated: duplicate }).allowed,false);
const eightMinuteItem = {...pike,id:"long-block",exerciseId:oldSupport.exerciseId,exerciseDefinitionVersion:oldSupport.exerciseDefinitionVersion,
  prescriptionVariantId:oldSupport.prescriptionVariantId,demand:oldSupport.demand,plannedSeconds:480};
assert(dose.usefulDoseExceeded({...after.plan,items:[eightMinuteItem]},eightMinuteItem,pike));
const protocol = bundle.benchmarkProtocols.find(p => p.exerciseId === "pike-elevation");
assert.equal(protocol.metric.minimum,8);
const check = {...pike,purpose:"guided-test",benchmarkProtocolId:protocol.id,benchmarkProtocolVersion:protocol.definitionVersion,plannedSeconds:480};
assert.equal(dose.routinePracticeLimitSeconds(check),undefined);
assert.deepEqual(dose.structurePracticeWorkoutItem(after.plan,check,bundle),native.structureWorkoutItem(check,bundle));
const restricted = {...input,state:{...input.state,activeRestrictions:[{source:{kind:"evidence-event",eventId:"synthetic-restriction"},decision:"block",
  demandDomains:["overhead-straight-arm-upper-limb"],bodyRegions:["shoulder"],occurredAt:asOf,reasonCodes:["restriction"]}]}};
assert.equal(validateWorkoutStart({...restricted,generated:after}).allowed,false);
for (const capacity of bundle.capacities) for (const minutes of [5,10,15,20]) {
  const g=generators.generateUsefulDoseCustomPlan(input,minutes,{label:capacity.label,capacityIds:[capacity.id]});
  if(g.ok) verify(g,input,minutes*60);
}
console.log("PASS capacity focuses, restrictions, oversized/duplicate/swap/resume guards and exact eight-rep benchmark");

const databaseName = `useful-dose-${crypto.randomUUID()}`;
const store = createVNextShadowStore({ databaseName });
const catalogue = { ...current, generateSession: generators.generateUsefulDoseSessionPlan, generateCustomSession: generators.generateUsefulDoseCustomPlan };
const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => asOf });
await store.putAthleteIntent(input.intent);
const snapshot = await runtime.refresh({ athleteId: input.intent.athleteId });
const generated = snapshot.generated, plan = generated.plan;
const interval = workoutExecutionTimeline(plan, bundle).find(i => i.kind === "work");
const completedAt = "2026-10-21T09:00:10.000Z";
const prepared = runtime.prepareWorkoutCompletion({ generated, startedAt: asOf, completedAt, recordedAt: completedAt,
  status: "partial", timerItemOutcomes: plan.items.filter(i => ["preparation", "recovery"].includes(i.purpose)).map(i => ({
    planItemId: i.id, status: i.id === interval.planItemId ? "modified" : "skipped",
    participationSeconds: i.id === interval.planItemId ? 10 : 0, participationBasis: "measured" })),
  reviewAnswers: plan.items.filter(i => !["preparation", "recovery"].includes(i.purpose)).map(i => ({
    planItemId: i.id, status: "skipped", participationSeconds: 0 })) });
await runtime.commitWorkoutCompletion({ athleteId: input.intent.athleteId, prepared });
await runtime.commitWorkoutCompletion({ athleteId: input.intent.athleteId, prepared });
const saved = await store.readProjectionSources(input.intent.athleteId);
assert.equal(saved.sessionRecords.length, 1);
assert.equal(validateShadowSessionPair(saved.sessionPlans[0], saved.sessionRecords[0], input.intent.athleteId), null);
assert.equal(saved.evidenceEvents.length, 0, "Timed practice cannot create benchmark evidence");
assert.equal(saved.sessionRecords[0].itemOutcomes.reduce((sum, i) => sum + i.participationSeconds, 0), 10);
const exportBundle = await store.exportBundle(input.intent.athleteId, { exportedAt: completedAt,
  catalogueVersions: current.history.map(b => b.catalogueVersion), projectionVersions: [current.projectionPolicy.version],
  definitionFingerprints: [await sha256(current.history)], policyVersions: [{ id: current.projectionPolicy.id, version: current.projectionPolicy.version }] });
store.close();
const reopened = createVNextShadowStore({ databaseName });
assert.equal(canonicalJson((await reopened.readProjectionSources(input.intent.athleteId)).sessionPlans), canonicalJson(saved.sessionPlans));
const restored = createVNextShadowStore({ databaseName: `${databaseName}-restore` });
await restored.importBundle(exportBundle); await restored.importBundle(exportBundle);
const restoredSources = await restored.readProjectionSources(input.intent.athleteId);
assert.equal(canonicalJson(restoredSources.sessionRecords), canonicalJson(saved.sessionRecords));
assert.equal(canonicalJson(restoredSources.sessionPlans), canonicalJson(saved.sessionPlans));
const history = buildSessionHistory(saved, current.history)[0];
assert(history.movements.some(i => i.plannedPrescription?.includes("3 sets") && i.plannedPrescription?.includes("8–12 reps")));
reopened.close(); restored.close();
console.log("PASS early finish saved once, measured-only evidence, offline reopen, repeated backup import and native History targets");
