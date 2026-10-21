import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
createRequire(import.meta.url)("fake-indexeddb/auto");

const { hasMeaningfulEmphasisTraining } = load("app/vnext/releaseCandidate/emphasisCompletion.ts");
const { structureWorkoutItem } = load("app/vnext/workoutUx.ts");
const { isMixedWorkoutPlan } = load("app/vnext/mixedWorkout.ts");
const { trainingQualityCatalogue: native } = load("app/vnext/production/trainingQuality.ts");
const { generateUsefulDoseSessionPlan, generateUsefulDoseCustomPlan } = load("app/vnext/planning/feedbackDose.ts");
const { createVNextShadowStore, canonicalJson } = load("app/vnext/persistence/index.ts");
const { createVNextReleaseCandidateRuntime } = load("app/vnext/releaseCandidate/runtime.ts");
const { vNextReleaseCandidateManifest } = load("app/vnext/releaseCandidate/manifest.ts");
const catalogue = { ...native, generateSession: generateUsefulDoseSessionPlan, generateCustomSession: generateUsefulDoseCustomPlan };
const bundle = catalogue.bundle;
const athleteId = "meaningful-emphasis-synthetic";
const at = "2026-10-21T09:00:00.000Z";
const store = createVNextShadowStore({ databaseName: `meaningful-emphasis-${Date.now()}` });
let checks = 0;
const check = (label, body) => { body(); checks++; console.log(`PASS ${label}`); };
try {
  await store.putAthleteIntent({ schemaVersion: 1, athleteId, updatedAt: at,
    goals: [{ graphId: "parallette-pushing", priority: "primary" }],
    equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard",
    preferences: { specialistOptIn: false } });
  const runtime = createVNextReleaseCandidateRuntime({ store, catalogue, clock: () => at });
  const { generated } = await runtime.refresh({ athleteId });
  assert(generated.ok && generated.plan && generated.emphasis);
  const plan = generated.plan;
  const item = plan.items.find(candidate => !["preparation", "recovery"].includes(candidate.purpose));
  assert(item);
  const firstWork = structureWorkoutItem(item, bundle).intervals.find(interval => interval.kind === "work");
  const threshold = Math.max(1, Math.ceil(firstWork.durationSeconds / 2));
  assert(threshold > 1);
  const prepare = seconds => runtime.prepareWorkoutCompletion({ generated,
    timerItemOutcomes: plan.items.filter(candidate => ["preparation", "recovery"].includes(candidate.purpose))
      .map(candidate => ({ planItemId: candidate.id, status: "skipped", participationSeconds: 0, participationBasis: "measured" })),
    reviewAnswers: plan.items.filter(candidate => !["preparation", "recovery"].includes(candidate.purpose))
      .map(candidate => candidate.id === item.id
        ? { planItemId: candidate.id, status: "modified", participationSeconds: seconds,
          difficulty: "hard", symptomOrInstability: false, modificationReason: "Synthetic early finish." }
        : { planItemId: candidate.id, status: "skipped", participationSeconds: 0 }),
    startedAt: at, completedAt: "2026-10-21T09:01:00.000Z", status: "partial" });
  const brief = prepare(1), meaningful = prepare(threshold);
  const outcomeIndex = meaningful.record.itemOutcomes.findIndex(outcome => outcome.planItemId === item.id);
  const changedRecord = (change, status) => ({ ...meaningful.record,
    ...(status ? { status } : {}), itemOutcomes: meaningful.record.itemOutcomes.map((outcome, index) =>
      index === outcomeIndex ? { ...outcome, ...change } : outcome) });
  check("one-second and below-threshold partials do not count; exact threshold and full first interval do", () => {
    assert.equal(hasMeaningfulEmphasisTraining(plan, brief.record, bundle), false);
    assert.equal(hasMeaningfulEmphasisTraining(plan, changedRecord({ participationSeconds: threshold - 1 }), bundle), false);
    assert.equal(hasMeaningfulEmphasisTraining(plan, meaningful.record, bundle), true);
    assert.equal(hasMeaningfulEmphasisTraining(plan, changedRecord({ participationSeconds: firstWork.durationSeconds, status: "completed" }), bundle), true);
  });
  check("meaningful modified and partial work counts without requiring easy feedback or claiming a benchmark", () => {
    for (const status of ["complete", "modified", "partial"]) {
      assert.equal(hasMeaningfulEmphasisTraining(plan, changedRecord({}, status), bundle), true);
    }
    assert.equal(meaningful.record.itemOutcomes[outcomeIndex].benchmarkObservation, undefined);
  });
  check("abandoned, skipped, invalid, missing, unknown and legacy timing cannot advance continuity", () => {
    assert.equal(hasMeaningfulEmphasisTraining(plan, changedRecord({}, "abandoned"), bundle), false);
    for (const change of [{ status: "skipped" }, { participationBasis: undefined },
      { participationBasis: "legacy-unknown" }, { participationSeconds: 0 },
      { participationSeconds: -1 }, { participationSeconds: NaN }, { participationSeconds: Infinity }]) {
      assert.equal(hasMeaningfulEmphasisTraining(plan, changedRecord(change), bundle), false);
    }
    assert.equal(hasMeaningfulEmphasisTraining(plan, { ...meaningful.record, itemOutcomes: [] }, bundle), false);
  });
  check("preparation and recovery alone do not count; each meaningful development/test/maintenance purpose may count", () => {
    for (const purpose of ["preparation", "recovery", "primary-development", "secondary-development", "maintenance", "guided-test"]) {
      const oneItemPlan = { ...plan, items: [{ ...item, purpose }] };
      const oneItemRecord = changedRecord({ participationSeconds: item.plannedSeconds });
      assert.equal(hasMeaningfulEmphasisTraining(oneItemPlan, oneItemRecord, bundle), !["preparation", "recovery"].includes(purpose));
    }
  });
  check("unresolved definitions, mismatched catalogue or plan fail closed", () => {
    assert.equal(hasMeaningfulEmphasisTraining(plan, { ...meaningful.record, planId: "another-plan" }, bundle), false);
    assert.equal(hasMeaningfulEmphasisTraining(plan, meaningful.record, { ...bundle, catalogueVersion: 999 }), false);
    assert.equal(hasMeaningfulEmphasisTraining({ ...plan, items: [{ ...item, exerciseId: "missing" }] }, meaningful.record, bundle), false);
    assert.equal(hasMeaningfulEmphasisTraining({ ...plan, items: [{ ...item, prescriptionVariantId: "missing" }] }, meaningful.record, bundle), false);
  });
  check("native catalogue timing uses the same half-first-work threshold across every target kind", () => {
    for (const nativeBundle of catalogue.history) {
      const targets = new Map();
      for (const exercise of nativeBundle.exercises) for (const variant of exercise.prescriptionVariants) {
        if (!targets.has(variant.target.kind)) targets.set(variant.target.kind, { exercise, variant });
      }
      for (const { exercise, variant } of targets.values()) {
        const nativeItem = { ...item, exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion,
          prescriptionVariantId: variant.id, plannedSeconds: 60 };
        const nativePlan = { ...plan, catalogueVersion: nativeBundle.catalogueVersion, items: [nativeItem] };
        const first = structureWorkoutItem(nativeItem, nativeBundle).intervals.find(interval => interval.kind === "work");
        const nativeThreshold = Math.max(1, Math.ceil(first.durationSeconds / 2));
        assert.equal(hasMeaningfulEmphasisTraining(nativePlan, changedRecord({ participationSeconds: nativeThreshold - 1 }), nativeBundle), false);
        assert.equal(hasMeaningfulEmphasisTraining(nativePlan, changedRecord({ participationSeconds: nativeThreshold }), nativeBundle), true);
      }
    }
  });

  // Exercise the actual app storage function, not a parallel implementation.
  const source = readFileSync("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", "utf8");
  const ast = ts.createSourceFile("app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = ast.statements.find(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === "rememberCompletedEmphasis"));
  assert(statement);
  const compiled = ts.transpileModule(`${statement.getText(ast)}\nreturn rememberCompletedEmphasis;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let previous;
  const writes = [];
  const remember = new Function("hasMeaningfulEmphasisTraining", "readPreviousEmphasis", "isMixedWorkoutPlan",
    "vNextReleaseCandidateManifest", "storageKeyPrefix", "localStorage", compiled)(
    hasMeaningfulEmphasisTraining, () => previous, isMixedWorkoutPlan, vNextReleaseCandidateManifest,
    (namespace, kind) => `synthetic-${namespace}-${kind}:`,
    { setItem(key, value) { previous = JSON.parse(value); writes.push({ key, value }); } });
  check("existing continuity is preserved for brief work; meaningful completion and exact retry count once", () => {
    previous = { generatorPolicyId: vNextReleaseCandidateManifest.components.generator.id,
      generatorPolicyVersion: vNextReleaseCandidateManifest.components.generator.version,
      primaryGraphId: generated.emphasis.primary.graphId, goalSignature: generated.emphasis.goalSignature,
      completedEligibleSessions: 7, lastCountedRecordId: "earlier-synthetic-record" };
    const before = canonicalJson(previous);
    remember(athleteId, generated, brief, "test-only", bundle);
    assert.equal(canonicalJson(previous), before); assert.equal(writes.length, 0);
    remember(athleteId, generated, meaningful, "test-only", bundle);
    assert.equal(previous.completedEligibleSessions, 8); assert.equal(writes.length, 1);
    remember(athleteId, generated, meaningful, "test-only", bundle);
    assert.equal(previous.completedEligibleSessions, 8); assert.equal(writes.length, 1);
    assert.equal(writes[0].key, `synthetic-test-only-emphasis:${athleteId}`);
  });
  check("a genuinely changed goal starts its new sample only after meaningful work", () => {
    previous = { ...previous, goalSignature: "previous-goals", completedEligibleSessions: 7, lastCountedRecordId: "older" };
    remember(athleteId, generated, brief, "test-only", bundle);
    assert.equal(previous.completedEligibleSessions, 7);
    remember(athleteId, generated, meaningful, "test-only", bundle);
    assert.equal(previous.completedEligibleSessions, 1);
    assert.equal(previous.goalSignature, generated.emphasis.goalSignature);
  });
  check("both save and retry use the saved plan's native bundle", () => {
    assert(source.includes("rememberCompletedEmphasis(athleteId, exactRecovery.generated, prepared, storageNamespace, bundleFor(prepared.plan.catalogueVersion))"));
    assert(source.includes("rememberCompletedEmphasis(athleteId, workoutRecovery.generated, pendingPrepared, storageNamespace, bundleFor(pendingPrepared.plan.catalogueVersion))"));
  });
  const beforeBrief = canonicalJson(brief);
  await runtime.commitWorkoutCompletion({ athleteId, prepared: brief });
  await runtime.commitWorkoutCompletion({ athleteId, prepared: brief });
  const sources = await store.readProjectionSources(athleteId);
  check("a brief partial still saves exactly once with all measured facts intact and no benchmark evidence", () => {
    assert.equal(canonicalJson(brief), beforeBrief);
    assert.equal(sources.sessionRecords.length, 1);
    assert.equal(canonicalJson(sources.sessionRecords[0]), canonicalJson(brief.record));
    assert.equal(sources.evidenceEvents.length, 0);
    assert.equal(hasMeaningfulEmphasisTraining(plan, sources.sessionRecords[0], bundle), false);
  });
  console.log(`Emphasis completion: ${checks} focused scenarios passed.`);
} finally { store.close(); }
