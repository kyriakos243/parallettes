import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { acceptedMotionSnapshot, compareMotionStructures } from "./lib/accepted-motion-snapshots.mjs";

createRequire(import.meta.url)("fake-indexeddb/auto");
const release = load("app/vnext/production/combinedProgressionRelease.ts");
const runtimeApi = load("app/vnext/releaseCandidate/runtime.ts");
const persistence = load("app/vnext/persistence/index.ts");
const assessment = load("app/vnext/assessment/index.ts");
const projection = load("app/vnext/projection/index.ts");
const planning = load("app/vnext/planning/index.ts");
const workout = load("app/vnext/workoutUx.ts");
const definitions = load("app/vnext/definitions/index.ts");
const catalogue = release.combinedProgressionCatalogue;
const { bundle, history, projectionPolicy } = catalogue;
const batches = Object.fromEntries("ABCDEF".split("").map(letter => [letter, {
  ...load(`app/vnext/progression/batch${letter}.ts`),
  ...load(`app/vnext/progression/batch${letter}Motion.ts`),
}]));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)])) : value;
const json = value => JSON.stringify(canonical(value));
const hash = value => createHash("sha256").update(json(value)).digest("hex");
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sourceHash = text => createHash("sha256").update(text).digest("hex");
const failures = [];
let checks = 0;
const assert = (ok, message) => { checks++; if (!ok) failures.push(message); };
const expectFailure = async (action, message) => {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  assert(rejected, message);
};
const asOf = "2026-10-17T09:00:00.000Z";
const completedAt = "2026-10-17T09:25:00.000Z";
const laterAt = "2026-10-20T09:00:00.000Z";
const equipment = [...new Set(bundle.exercises.flatMap(exercise => exercise.equipment))];
const versions = history.map(item => item.catalogueVersion);
assert(json(versions) === json([1, 2, 3, 4, 5, 6, 7, 8]), "Combined release omits native history");
assert(history.at(-1) === bundle && bundle.catalogueVersion === 8 && projectionPolicy.version === 8,
  "Combined bundle/history/policy selection is incoherent");
assert(definitions.vNextDefinitionBundle.catalogueVersion === 2,
  "Combined activation changed frozen RC defaults");
assert(release.validateCombinedProgressionAcceptance().length === 0, "Combined owner acceptance is invalid");

// Verify actual accepted data and source bytes, beyond ledger-to-manifest comparisons.
let totalGuides = 0;
for (const letter of "ABCDEF") {
  const batch = batches[letter];
  const generatedGuides = batch[`batch${letter}MotionGuides`];
  const guides = letter === "A" ? generatedGuides : acceptedMotionSnapshot(letter, generatedGuides, assert);
  const manifestPath = `app/vnext/progression/batch${letter}ReviewManifest.ts`;
  const review = load(manifestPath)[`batch${letter}ReviewManifest`];
  const actualCandidate = hash({ bundle: batch[`batch${letter}DefinitionBundle`],
    policy: batch[`batch${letter}ProjectionPolicy`], guides });
  const pinsMatch = (candidateGuides, candidateSources = {}) =>
    Object.entries(review.motionFingerprints).every(([ref, pin]) => hash(candidateGuides[ref]) === pin)
    && Object.entries(review.playerSources).every(([path, pin]) => sourceHash(candidateSources[path] ?? source(path)) === pin);
  assert(actualCandidate === review.candidateFingerprint, `Accepted ${letter} candidate changed`);
  assert(Object.keys(guides).length === batch[`batch${letter}Specs`].length && pinsMatch(guides),
    `Accepted ${letter} guide/player/source pins changed`);
  if (letter !== "A") {
    const ledger = load(`app/vnext/progression/batch${letter}MotionAcceptance.ts`)[`batch${letter}MotionAcceptance`];
    assert(ledger.ownerMotionAcceptance === "accepted" && ledger.candidateFingerprint === actualCandidate,
      `${letter} owner acceptance does not bind actual candidate`);
    assert(ledger.reviewManifestSha256 === sourceHash(source(manifestPath)), `${letter} accepted manifest bytes changed`);
    assert(json(ledger.motionFingerprints) === json(review.motionFingerprints), `${letter} owner guide pins changed`);
  }
  const ref = Object.keys(guides)[0];
  const changed = { ...guides, [ref]: { ...guides[ref], duration: guides[ref].duration + .01 } };
  assert(!pinsMatch(changed), `${letter} changed guide escaped actual-content pin check`);
  if (letter !== "A") {
    const tinyChange = structuredClone(guides);
    tinyChange[ref].poses[0].head.x += 5e-11;
    assert(compareMotionStructures(tinyChange, guides).equal && !pinsMatch(tinyChange),
      `${letter} generator tolerance weakened exact literal approval`);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const nonfinite = structuredClone(guides);
      nonfinite[ref].poses[0].head.x = invalid;
      assert(!compareMotionStructures(nonfinite, guides).equal, `${letter} nonfinite generator leaf accepted`);
    }
    const changedMetadata = structuredClone(guides);
    changedMetadata[ref].label += " changed";
    const changedShape = structuredClone(guides);
    delete changedShape[ref].label;
    assert(!compareMotionStructures(changedMetadata, guides).equal
      && !compareMotionStructures(changedShape, guides).equal
      && !compareMotionStructures(changed, guides).equal,
    `${letter} generator comparison tolerated metadata, key or material number changes`);
  }
  const playerPath = Object.keys(review.playerSources)[0];
  assert(!pinsMatch(guides, { [playerPath]: `${source(playerPath)}\n/* changed */` }),
    `${letter} changed player source escaped pin check`);
  for (const spec of batch[`batch${letter}Specs`]) {
    totalGuides++;
    const plan = { id: `combined-media-${spec.exercise}`, items: [{ id: `combined-item-${spec.exercise}`, exerciseId: spec.exercise }] };
    const result = release.evaluateCombinedProgressionPlanMedia(plan);
    assert(result.releaseAllowed && result.items[0]?.status === "ready" && result.items[0]?.reference === spec.exercise,
      `Combined media gate omitted accepted ${letter} guide ${spec.exercise}`);
    if (letter !== "A") assert(!release.evaluateCombinedProgressionPlanMedia(plan,
      { ...release.combinedProgressionAcceptance, ownerDeploymentAuthorization: "pending" }).releaseAllowed,
    `Unapproved combined release exposes ${spec.exercise}`);
  }
}
assert(totalGuides === 30, "Combined release must retain all thirty A–F guides");
for (const mutation of [
  { ...release.combinedProgressionAcceptance, ownerDeploymentAuthorization: "pending" },
  { ...release.combinedProgressionAcceptance, candidateFingerprint: "0".repeat(64) },
  { ...release.combinedProgressionAcceptance, batches: ["B", "C", "D", "E"] },
]) assert(release.validateCombinedProgressionAcceptance(mutation).length > 0, "Tampered combined acceptance passed");
for (let index = 0; index < release.combinedProgressionBatches.length; index++) {
  const altered = release.combinedProgressionBatches.map((batch, i) => i === index
    ? { ...batch, acceptance: { ...batch.acceptance, motionFingerprints: {} } } : batch);
  assert(release.validateCombinedProgressionAcceptance(release.combinedProgressionAcceptance, altered).length > 0,
    `Missing ${altered[index].letter} owner guide pins passed`);
}
const mediaSource = source("app/vnext/production/combinedProgressionMedia.ts");
assert(mediaSource.includes('import "./batchAMedia"') && mediaSource.includes('import "../media/candidateMotionFrame.css"'),
  "Combined media entry omits A or exact accepted sizing stylesheet");
assert(sourceHash(source("app/vnext/media/candidateMotionFrame.css"))
  === "b8fd8ae322eb8a5aa437d72c33bb4cb270a534305492ce82c1b6a9dedbb171d8",
"Combined media sizing differs from the owner-accepted F player");
for (const letter of "BCDEF") assert(mediaSource.includes(`registerMotionGuides(batch${letter}MotionGuides)`)
  && mediaSource.includes(`from "./acceptedBatch${letter}Motion.json"`)
  && !mediaSource.includes(`from "../progression/batch${letter}Motion"`),
  `Combined media entry omits exact literal registration or retains a generator fallback ${letter}`);
const productionSource = source("app/vnext/production/VNextProductionApp.tsx");
assert(productionSource.includes('import "./combinedProgressionMedia"')
  && productionSource.includes("catalogue: combinedProgressionCatalogue")
  && productionSource.includes("evaluatePlanMedia: evaluateCombinedProgressionPlanMedia"),
"Production does not select one coherent combined release");
const uiSource = source("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx");
assert(uiSource.includes("const workoutBundle = plan ? bundleFor(plan.catalogueVersion)")
  && uiSource.includes("<WorkoutRunner plan={plan} bundle={workoutBundle}")
  && uiSource.includes("bundleFor(recoveryPlan.catalogueVersion)")
  && uiSource.includes("bundleFor(assessment.draft.catalogueVersion)")
  && uiSource.includes("bundleFor((guidedRecovery?.draft ?? snapshot.assessmentDraft)?.catalogueVersion"),
"Browser workflow recovery no longer selects native workout/assessment/guided definitions");
assert(uiSource.includes("catalogueVersions: vNextDefinitionBundles.map((bundle) => bundle.catalogueVersion)")
  && uiSource.includes("projectionVersions: [vNextProjectionPolicy.version]")
  && uiSource.includes("policyVersions: [{ id: vNextProjectionPolicy.id, version: vNextProjectionPolicy.version }]")
  && uiSource.includes("definitionFingerprints: [definitionFingerprint]"), "Normal UI export omits selected history/policy metadata");

const metric = value => value.kind === "duration-seconds" ? { value: value.minimum, unit: "seconds" }
  : value.kind === "repetitions" ? { value: value.minimum, unit: "repetitions" }
  : value.kind === "successful-attempts" ? { value: value.minimumSuccessful, unit: "attempts", attemptsTotal: value.maximumAttempts }
    : undefined;
let serial = 0;
const eventsFor = (protocol, version, athleteId) => Array.from({ length: Math.max(
  protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions) }, (_, index) => {
  const at = new Date(Date.parse(asOf) - (12 - index) * 86400000).toISOString();
  const id = `combined-fixture-${++serial}`;
  return { schemaVersion: 1, id, athleteId, occurredAt: at, recordedAt: at, source: "guided-test",
    catalogueVersion: version, type: "performance_observed", subject: protocol.subject, outcome: "clean",
    benchmarkProtocolId: protocol.id, benchmarkProtocolVersion: protocol.definitionVersion,
    observationSessionId: `${id}-occasion`, measurement: metric(protocol.metric),
    assistance: protocol.conditions.assistance, range: protocol.conditions.range };
});
const prerequisites = (definitionBundle, spec) => {
  const protocols = new Map(), visited = new Set();
  const visit = ref => {
    const subject = ref.kind === "milestone" ? { kind: ref.kind, milestone: ref.milestone }
      : ref.kind === "capacity-facet" ? { kind: ref.kind, capacity: ref.capacity } : undefined;
    if (subject && visited.has(json(subject))) return;
    if (subject) visited.add(json(subject));
    if (ref.kind === "milestone") {
      const node = definitionBundle.graphs.find(g => g.id === ref.milestone.graphId).nodes.find(n => n.id === ref.milestone.nodeId);
      for (const next of node.prerequisiteRule?.allOf ?? []) visit(next);
      if (node.prerequisiteRule?.anyOf?.length) visit(node.prerequisiteRule.anyOf[0]);
    }
    const protocol = definitionBundle.benchmarkProtocols.find(p => subject
      ? json(p.subject) === json(subject) : p.id === ref.benchmarkProtocolId);
    if (!protocol) throw new Error(`Missing combined fixture prerequisite ${json(ref)}`);
    protocols.set(protocol.id, protocol);
  };
  const node = definitionBundle.graphs.find(g => g.id === spec.graphId).nodes.find(n => n.id === spec.node);
  for (const ref of node.prerequisiteRule?.allOf ?? []) visit(ref);
  if (node.prerequisiteRule?.anyOf?.length) visit(node.prerequisiteRule.anyOf[0]);
  return [...protocols.values()];
};
const catalogueFor = version => ({ bundle: history.find(b => b.catalogueVersion === version),
  history: history.filter(b => b.catalogueVersion <= version), projectionPolicy: version === 1
    ? projection.vNextProjectionPolicyV1 : version === 2 ? projection.vNextProjectionPolicy
      : batches["ABCDEF"[version - 3]][`batch${"ABCDEF"[version - 3]}ProjectionPolicy`] });
const specFor = version => version < 3 ? { graphId: "planche", node: "controlled-planche-lean" }
  : batches["ABCDEF"[version - 3]][`batch${"ABCDEF"[version - 3]}Specs`][0];
const intentFor = (spec, athleteId) => ({ schemaVersion: 1, athleteId, updatedAt: asOf,
  goals: [{ graphId: spec.graphId, targetNodeId: spec.node, priority: "primary" }], equipment,
  defaultSessionDemand: "standard", preferences: { specialistOptIn: true } });
const completionInput = generated => ({ generated, startedAt: asOf, completedAt, recordedAt: completedAt, status: "modified",
  timerItemOutcomes: generated.plan.items.filter(i => ["preparation", "recovery"].includes(i.purpose))
    .map(i => ({ planItemId: i.id, status: "skipped", participationSeconds: 0, participationBasis: "measured" })),
  reviewAnswers: generated.plan.items.filter(i => !["preparation", "recovery"].includes(i.purpose))
    .map(i => ({ planItemId: i.id, status: "modified", participationSeconds: 10, difficulty: "right",
      symptomOrInstability: false, modificationReason: "Isolated combined-release fixture; no performance claimed." })) });
const answerFor = step => step.kind === "safety" ? { kind: "safety", severity: "none" }
  : step.kind === "experience" ? { kind: "experience", experience: "experienced" }
  : step.kind === "inactivity" ? { kind: "inactivity", inactivity: "active" }
  : step.kind === "goals" ? { kind: "goals", graphIds: ["planche"] }
  : step.kind === "equipment" ? { kind: "equipment", equipment }
  : step.kind === "inversion" ? { kind: "inversion", familiarity: "freestanding" }
  : { kind: "anchor", response: "not-yet" };
const rows = [];
for (const version of versions) {
  const athleteId = `combined-native-${version}`, spec = specFor(version), native = catalogueFor(version);
  const store = persistence.createVNextShadowStore({ databaseName: `combined-native-${version}-${randomUUID()}` });
  await store.putAthleteIntent(intentFor(spec, athleteId));
  const facts = prerequisites(native.bundle, spec).flatMap(p => eventsFor(p, version, athleteId));
  for (const fact of facts) await store.appendEvidenceEvent(fact);
  const oldRuntime = runtimeApi.createVNextReleaseCandidateRuntime({ store, catalogue: native, clock: () => asOf });
  const before = await oldRuntime.refresh({ athleteId, asOf, seed: `native-${version}` });
  assert(before.generated.ok && before.generated.plan?.catalogueVersion === version, `Native v${version} plan fixture unavailable`);
  if (!before.generated.ok || !before.generated.plan) continue;
  const pending = await oldRuntime.startAssessment({ athleteId, asOf, createdAt: asOf, mode: "targeted-reconfirmation" });
  const preparedBeforeUpgrade = oldRuntime.prepareWorkoutCompletion(completionInput(before.generated));
  const runtime = runtimeApi.createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => asOf });
  const current = await runtime.refresh({ athleteId, asOf, seed: `combined-${version}` });
  assert(current.projection.lookup.catalogueVersion === 8 && current.projection.lookup.projectionVersion === 8
    && (version === 8 || current.projection.source === "rebuilt"), `Native v${version} reused an obsolete cache`);
  assert(current.generated.ok && current.generated.plan?.catalogueVersion === 8, `Upgrade from v${version} does not create v8 plans`);
  const nativeBundle = runtimeApi.runtimeDefinitionBundle(catalogue, version);
  for (const item of before.generated.plan.items) {
    const structured = workout.structureWorkoutItem(item, nativeBundle);
    assert(structured.intervals.reduce((sum, interval) => sum + interval.durationSeconds, 0) === item.plannedSeconds,
      `Native v${version} playback timing changed ${item.id}`);
    const swaps = workout.safeWorkoutSwaps({ plan: before.generated.plan, item, bundle: nativeBundle,
      state: current.state, intent: current.intent, projectionPolicy });
    assert(swaps.every(swap => nativeBundle.exercises.some(ex => ex.id === swap.exerciseId)),
      `Native v${version} receives a newer-only exercise swap`);
  }
  assert(release.evaluateCombinedProgressionPlanMedia(before.generated.plan).releaseAllowed,
    `Native v${version} recovered plan loses accepted media`);
  const preparedAfterUpgrade = runtime.prepareWorkoutCompletion(completionInput(before.generated));
  assert(json(preparedAfterUpgrade) === json(preparedBeforeUpgrade), `Native v${version} prepared completion changed on upgrade`);
  const first = await runtime.commitWorkoutCompletion({ athleteId, prepared: preparedBeforeUpgrade, asOf: completedAt });
  const retry = await runtime.commitWorkoutCompletion({ athleteId, prepared: preparedAfterUpgrade, asOf: completedAt });
  assert(first.append.record.status === "inserted" && retry.append.record.status === "duplicate",
    `Native v${version} exact completion retry is not idempotent`);
  const fresh = runtime.prepareWorkoutCompletion(completionInput(current.generated));
  await runtime.commitWorkoutCompletion({ athleteId, prepared: fresh, asOf: completedAt });
  const freshRetry = await runtime.commitWorkoutCompletion({ athleteId, prepared: fresh, asOf: completedAt });
  // With identical v8 inputs the semantic planner may produce the same plan;
  // that is one retry, not a second workout. Earlier catalogues remain distinct.
  const expectedRecords = new Set([preparedBeforeUpgrade.plan.id, fresh.plan.id]).size;
  assert(freshRetry.append.record.status === "duplicate" && freshRetry.snapshot.sources.sessionRecords.length === expectedRecords,
    `Native v${version}/v8 mixed save lost or duplicated immutable records`);
  assert(freshRetry.snapshot.sources.sessionPlans.some(plan => plan.catalogueVersion === version)
    && freshRetry.snapshot.sources.sessionPlans.some(plan => plan.catalogueVersion === 8),
    `Native v${version} plan version was rewritten`);

  // Resume a persisted old assessment using the new coordinator, then save a native guided retry.
  let progress = pending.assessment, count = 0;
  while (progress.step.kind !== "review" && count++ < 60) progress = await runtime.answerAssessment({
    draft: progress.draft, answer: answerFor(progress.step),
    answeredAt: new Date(Date.parse(laterAt) + count * 1000).toISOString() });
  assert(progress.step.kind === "review" && progress.draft.catalogueVersion === version,
    `Native v${version} pending assessment changed catalogue`);
  const backed = await runtime.backAssessment({ draft: progress.draft, updatedAt: "2026-10-20T09:01:30.000Z" });
  progress = backed.step.kind === "review" ? backed : await runtime.answerAssessment({
    draft: backed.draft, answer: answerFor(backed.step), answeredAt: "2026-10-20T09:01:31.000Z" });
  assert(progress.step.kind === "review" && progress.draft.catalogueVersion === version,
    `Native v${version} recovered assessment back/answer lost its catalogue`);
  const committed = await runtime.commitAssessment({ athleteId, draft: progress.draft,
    asOf: "2026-10-20T09:03:00.000Z" });
  assert(committed.snapshot.assessmentDraft?.catalogueVersion === version, `Native v${version} assessment commit was rebound`);
  const protocol = nativeBundle.benchmarkProtocols.find(p => p.subject.kind === "capacity-facet");
  const guidedDraft = { ...progress.draft, targetedProtocolIds: [protocol.id] };
  const review = assessment.buildAssessmentReview(guidedDraft, nativeBundle, committed.snapshot.state);
  assert(review.guidedTests.some(offer => offer.protocolId === protocol.id && offer.availability === "available"),
    `Native v${version} pending guided fixture is unsafe/unavailable`);
  const result = { eventId: `combined-guided-${version}`, observationSessionId: `combined-occasion-${version}`,
    protocolId: protocol.id, outcome: "clean", occurredAt: "2026-10-20T09:04:00.000Z", recordedAt: "2026-10-20T09:04:00.000Z",
    measurement: metric(protocol.metric), qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true };
  const saved = await runtime.commitGuidedTest({ athleteId, draft: guidedDraft, result, asOf: result.recordedAt });
  const savedAgain = await runtime.commitGuidedTest({ athleteId, draft: guidedDraft, result, asOf: result.recordedAt });
  assert(saved.event.catalogueVersion === version && json(saved.event) === json(savedAgain.event)
    && savedAgain.snapshot.sources.evidenceEvents.filter(event => event.id === result.eventId).length === 1,
  `Native v${version} guided retry changed identity or duplicated evidence`);
  const next = await runtime.startAssessment({ athleteId, asOf: "2026-10-20T09:05:00.000Z", createdAt: "2026-10-20T09:05:00.000Z" });
  assert(next.assessment.draft.catalogueVersion === 8, `Fresh assessment after native v${version} recovery is not v8`);
  const exported = await store.exportBundle(athleteId, { exportedAt: "2026-10-20T09:06:00.000Z",
    catalogueVersions: versions, projectionVersions: [projectionPolicy.version],
    definitionFingerprints: [await persistence.sha256(history)],
    policyVersions: [{ id: projectionPolicy.id, version: projectionPolicy.version }] });
  assert(json(exported.catalogueVersions) === json(versions) && json(exported.projectionVersions) === "[8]",
    `Native v${version} mixed export metadata omits readers`);
  const restored = persistence.createVNextShadowStore({ databaseName: `combined-restored-${version}-${randomUUID()}` });
  await restored.importBundle(exported);
  await restored.importBundle(exported);
  const reread = await runtimeApi.createVNextReleaseCandidateRuntime({ store: restored, catalogue })
    .refresh({ athleteId, asOf: exported.exportedAt });
  assert(json(reread.sources.sessionPlans) === json(savedAgain.snapshot.sources.sessionPlans)
    && json(reread.sources.sessionRecords) === json(savedAgain.snapshot.sources.sessionRecords)
    && json(reread.sources.evidenceEvents) === json(savedAgain.snapshot.sources.evidenceEvents),
  `Native v${version}/v8 export/import changed immutable truth`);
  if (version < 8) await expectFailure(() => runtimeApi.createVNextReleaseCandidateRuntime({ store: restored, catalogue: native })
    .refresh({ athleteId, asOf: exported.exportedAt }), `Older v${version} reader silently accepted v8 facts`);
  assert((await restored.readProjectionSources(athleteId)).sessionRecords.length === expectedRecords,
    `Older-reader rejection deleted native v${version}/v8 facts`);
  rows.push({ nativeVersion: version, records: reread.sources.sessionRecords.length,
    guidedCatalogue: saved.event.catalogueVersion, currentCatalogue: current.generated.plan.catalogueVersion });
}

// One integration-level specialist check per specialist batch; detailed content gates stay in per-batch validators.
for (const letter of ["E", "F"]) {
  const spec = batches[letter][`batch${letter}Specs`].find(item => bundle.graphs.find(g => g.id === item.graphId)
    .nodes.find(n => n.id === item.node).programmingBoundary === "specialist");
  const athleteId = `combined-gate-${letter.toLowerCase()}`;
  const intent = intentFor(spec, athleteId);
  const evidenceEvents = prerequisites(bundle, spec).flatMap(p => eventsFor(p, 8, athleteId));
  const projected = projection.projectAthleteState({ athleteId, asOf, policy: projectionPolicy,
    definitionBundles: history, evidenceEvents, sessionPlans: [], sessionRecords: [], intent });
  assert(projected.ok && projected.state, `Combined specialist ${letter} fixture projection failed`);
  if (!projected.state) continue;
  for (const [label, selectedIntent] of [["explicit", intent], ["no-opt-in", { ...intent, preferences: { specialistOptIn: false } }],
    ["broad-goal", { ...intent, goals: [{ graphId: spec.graphId, priority: "primary" }] }]]) {
    const generated = planning.generateVNextSession({ createdAt: asOf, bundle, intent: selectedIntent, state: projected.state,
      projectionPolicy, sessionDemand: "challenge", seed: `combined-gate-${letter}-${label}` });
    const contains = generated.plan?.items.some(item => item.exerciseId === spec.exercise) ?? false;
    assert(label === "explicit" ? generated.ok && contains : !contains, `Combined specialist gate bypass ${letter}/${label}`);
  }
}
console.log(JSON.stringify({ checks, nativeWorkflowVersions: rows, acceptedGuides: totalGuides,
  candidateFingerprint: release.combinedProgressionAcceptance.candidateFingerprint }, null, 2));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`Combined progression: ${checks} focused upgrade/recovery/media checks passed.`);
