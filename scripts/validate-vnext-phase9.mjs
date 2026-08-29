import { createRequire } from "node:module";

createRequire(import.meta.url)("fake-indexeddb/auto");
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const resolveTypeScriptModule = (specifier, parentPath) => {
  const base = resolve(dirname(parentPath), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  const found = candidates.find((candidate) => {
    try { readFileSync(candidate); return true; } catch { return false; }
  });
  if (!found) throw new Error(`Cannot resolve ${specifier} from ${relative(projectRoot, parentPath)}`);
  return found;
};

const loadTypeScriptModule = (path) => {
  const absolutePath = resolve(projectRoot, path);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  let source = readFileSync(absolutePath, "utf8");
  if (absolutePath.endsWith("/app/program.ts")) {
    source = source.replaceAll("import.meta.env.BASE_URL", '"/parallettes/"');
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const loaded = { exports: {} };
  moduleCache.set(absolutePath, loaded);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) throw new Error(`Unexpected runtime import ${specifier}`);
    return loadTypeScriptModule(relative(projectRoot, resolveTypeScriptModule(specifier, absolutePath)));
  };
  new Function("exports", "module", "require", "__filename", "__dirname", compiled)(
    loaded.exports, loaded, localRequire, absolutePath, dirname(absolutePath),
  );
  return loaded.exports;
};

const contracts = loadTypeScriptModule("app/vnext/contracts.ts");
const definitions = loadTypeScriptModule("app/vnext/definitions/index.ts");
const persistence = loadTypeScriptModule("app/vnext/persistence/index.ts");
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const legacyMigration = loadTypeScriptModule("app/vnext/persistence/legacyMigration.ts");
const entry = loadTypeScriptModule("app/vnext/releaseCandidate/entry.ts");
const media = loadTypeScriptModule("app/vnext/releaseCandidate/mediaRelease.ts");
const release = loadTypeScriptModule("app/vnext/releaseCandidate/manifest.ts");
const runtimeModule = loadTypeScriptModule("app/vnext/releaseCandidate/runtime.ts");

const bundle = definitions.vNextDefinitionBundle;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const assertRejects = async (action, pattern, message) => {
  try {
    await action();
    failures.push(message);
  } catch (error) {
    if (pattern && !pattern.test(String(error?.message ?? error))) {
      failures.push(`${message}; unexpected error: ${error?.message ?? error}`);
    }
  }
};
const readText = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const integrationSourceFiles = () => {
  const result = [];
  const walk = (relativeDirectory, include) => {
    const absoluteDirectory = resolve(projectRoot, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const path = join(relativeDirectory, entry.name);
      if (entry.isDirectory()) walk(path, include);
      else if (entry.isFile() && include(path)) result.push(path);
    }
  };
  walk("app", (path) => /\.(?:ts|tsx|css)$/u.test(path));
  walk("src", (path) => /\.(?:ts|tsx|css)$/u.test(path));
  walk("public", () => true);
  walk("profile-api", (path) => /(?:\.js|\.sql|\.toml|\.toml\.example)$/u.test(path));
  result.push(
    ".github/workflows/deploy-pages.yml",
    "index.html",
    "package.json",
    "pnpm-lock.yaml",
    "scripts/validate-dist.mjs",
    "scripts/validate-vnext-phase9.mjs",
    "tsconfig.json",
    "vite.config.ts",
  );
  return [...new Set(result)].sort();
};
const integrationSourceFingerprint = () => {
  const digest = createHash("sha256");
  for (const path of integrationSourceFiles()) {
    let bytes = readFileSync(resolve(projectRoot, path));
    if (path === "app/vnext/releaseCandidate/manifest.ts") {
      const normalized = bytes.toString("utf8").replace(
        /(VNEXT_RELEASE_INTEGRATION_SOURCE_FINGERPRINT\s*=\s*)"[a-f0-9]{64}"/u,
        '$1"<canonical-self>"',
      );
      bytes = Buffer.from(normalized);
    }
    digest.update(path);
    digest.update("\0");
    digest.update(bytes);
    digest.update("\0");
  }
  return digest.digest("hex");
};
const canonical = persistence.canonicalJson;
const athlete = (id) => contracts.parseStableId("athlete", `phase9-${id}`);
const equipment = ["floor", "parallettes", "wall"].map((id) =>
  contracts.parseStableId("equipment", id));
const uniqueDatabaseName = (label) => `parallette25-vnext-phase9-${label}-${crypto.randomUUID()}`;
const makeStore = (label) => persistence.createVNextShadowStore({ databaseName: uniqueDatabaseName(label) });
const instant = (minute, day = 1) => new Date(Date.UTC(2026, 8, day, 9, minute, 0, 0)).toISOString();
const metadata = (exportedAt) => ({
  exportedAt,
  catalogueVersions: [bundle.catalogueVersion],
  projectionVersions: [projection.vNextProjectionPolicy.version],
  definitionFingerprints: [definitions.VNEXT_PHASE7_SEMANTIC_FINGERPRINTS[bundle.catalogueVersion]],
  policyVersions: [
    { id: projection.vNextProjectionPolicy.id, version: projection.vNextProjectionPolicy.version },
    { id: planning.vNextGeneratorPolicy.id, version: planning.vNextGeneratorPolicy.version },
  ],
});

// 1. Authority is v1.2 by default. vNext requires all three exact, isolated factors.
const authorityInput = {
  enabled: true,
  configuredReleaseCandidateId: entry.VNEXT_RELEASE_CANDIDATE_ID,
  baseUrl: entry.VNEXT_RELEASE_CANDIDATE_BASE,
  pathname: `${entry.VNEXT_RELEASE_CANDIDATE_BASE}today`,
  search: `?experience=${encodeURIComponent(entry.VNEXT_RELEASE_CANDIDATE_ID)}`,
};
assert(entry.selectApplicationAuthority(authorityInput) === "vnext-rc",
  "Exact isolated RC request did not select coherent vNext authority");
for (const mutation of [
  { enabled: false },
  { configuredReleaseCandidateId: "wrong-rc" },
  { baseUrl: "/parallettes/" },
  { pathname: "/parallettes/" },
  { search: "" },
]) {
  assert(entry.selectApplicationAuthority({ ...authorityInput, ...mutation }) === "v1.2",
    `Authority gate failed closed when ${Object.keys(mutation)[0]} did not match`);
}
assert(entry.VNEXT_RELEASE_CANDIDATE_BASE !== "/parallettes/",
  "RC deployment scope collides with the ordinary v1.2 scope");

// Runtime assessment helpers deliberately drive the public coordinator rather
// than constructing projection state or Session Records behind its back.
const answerFor = (step, scenario) => {
  switch (step.kind) {
    case "safety": return scenario.safety ?? { kind: "safety", severity: "none" };
    case "experience": return { kind: "experience", experience: scenario.experience };
    case "inactivity": return { kind: "inactivity", inactivity: scenario.inactivity ?? "active" };
    case "goals": return { kind: "goals", graphIds: scenario.goals };
    case "equipment": return { kind: "equipment", equipment };
    case "inversion": return { kind: "inversion", familiarity: scenario.inversion ?? "supported" };
    case "anchor": return {
      kind: "anchor",
      response: typeof scenario.anchor === "function" ? scenario.anchor(step.anchor) : scenario.anchor,
    };
    default: throw new Error(`Unexpected assessment step ${step.kind}`);
  }
};

const completeAssessment = async (label, scenario) => {
  const store = makeStore(label);
  const athleteId = athlete(label);
  let serial = 0;
  const runtime = runtimeModule.createVNextReleaseCandidateRuntime({
    store,
    clock: () => instant(serial += 1),
    idFactory: ({ kind }) => `${kind}-phase9-${label}`,
  });
  const started = await runtime.startAssessment({
    athleteId,
    asOf: instant(0),
    createdAt: instant(0),
    initialEquipment: equipment,
    seed: `phase9-${label}`,
  });
  let assessmentState = started.assessment;
  for (let index = 0; assessmentState.step.kind !== "review" && index < 40; index += 1) {
    assessmentState = await runtime.answerAssessment({
      draft: assessmentState.draft,
      answer: answerFor(assessmentState.step, scenario),
      answeredAt: instant(index + 1),
    });
  }
  if (assessmentState.step.kind !== "review") throw new Error(`${label} assessment did not terminate`);
  const committed = await runtime.commitAssessment({
    athleteId,
    draft: assessmentState.draft,
    asOf: instant(50),
    seed: `phase9-${label}`,
  });
  return { store, athleteId, runtime, committed };
};

// 2. Fresh coordinator path: placement -> projection -> plan -> exactly one
// immutable Session Record -> deterministic reprojection.
const fresh = await completeAssessment("fresh", {
  goals: [definitions.graphIds.parallettePushing],
  experience: "new",
  anchor: "not-yet",
  inversion: "none",
});
assert(fresh.committed.snapshot.generated.ok && fresh.committed.snapshot.generated.plan,
  "Fresh assessment did not produce a usable projected Session Plan");
const freshPlan = fresh.committed.snapshot.generated.plan;
if (!freshPlan) throw new Error("Fresh Phase 9 fixture has no Session Plan");
const freshEventsBefore = fresh.committed.snapshot.sources.evidenceEvents.length;
const timerItemOutcomes = freshPlan.items
  .filter((item) => item.purpose === "preparation" || item.purpose === "recovery")
  .map((item) => ({
    planItemId: item.id,
    status: "completed",
    participationSeconds: item.plannedSeconds,
    participationBasis: "measured",
  }));
const reviewAnswers = freshPlan.items
  .filter((item) => item.purpose !== "preparation" && item.purpose !== "recovery")
  .map((item) => ({
    planItemId: item.id,
    status: "completed",
    participationSeconds: item.plannedSeconds,
    difficulty: "right",
    symptomOrInstability: false,
  }));
const freshCompletionInput = {
  generated: fresh.committed.snapshot.generated,
  timerItemOutcomes,
  reviewAnswers,
  startedAt: instant(51),
  completedAt: instant(76),
  recordedAt: instant(77),
  status: "complete",
};
const prepared = fresh.runtime.prepareWorkoutCompletion(freshCompletionInput);
assert(prepared.record.id === prepared.plan.id,
  "Default initial Session Record identity is not one-to-one with its immutable Session Plan");
const completed = await fresh.runtime.commitWorkoutCompletion({
  athleteId: fresh.athleteId,
  prepared,
  asOf: instant(78),
  seed: "phase9-fresh-after",
});
assert(completed.append.plan.status === "inserted" && completed.append.record.status === "inserted",
  "Coordinator did not append the generated plan and one immutable Session Record together");
assert(completed.snapshot.sources.sessionRecords.length === 1,
  "Fresh completion did not leave exactly one Session Record authority");
assert(completed.snapshot.sources.evidenceEvents.length === freshEventsBefore,
  "Workout completion duplicated Session Record truth as Evidence Events");
const retried = await fresh.runtime.commitWorkoutCompletion({
  athleteId: fresh.athleteId,
  prepared,
  asOf: instant(78),
  seed: "phase9-fresh-after",
});
assert(retried.append.plan.status === "duplicate" && retried.append.record.status === "duplicate"
  && retried.snapshot.sources.sessionRecords.length === 1,
"Retrying the retained completion object duplicated session truth");
const secondUnsuperseded = fresh.runtime.prepareWorkoutCompletion({
  ...freshCompletionInput,
  recordId: "session-record-phase9-second-unsuperseded",
});
await assertRejects(
  () => fresh.runtime.commitWorkoutCompletion({
    athleteId: fresh.athleteId,
    prepared: secondUnsuperseded,
    asOf: instant(79),
    seed: "phase9-second-unsuperseded",
  }),
  /invalid-reference/u,
  "A second unsuperseded Session Record was accepted for one immutable Session Plan",
);
assert((await fresh.store.readProjectionSources(fresh.athleteId)).sessionRecords.length === 1,
  "Rejected second Session Record changed the authoritative record set");
const deterministicA = await fresh.runtime.refresh({
  athleteId: fresh.athleteId, asOf: instant(90), seed: "phase9-deterministic",
});
const deterministicB = await fresh.runtime.refresh({
  athleteId: fresh.athleteId, asOf: instant(90), seed: "phase9-deterministic",
});
assert(canonical(deterministicA.generated) === canonical(deterministicB.generated),
  "Identical evidence, cutoff and seed produced different Session Plans");
if (deterministicA.generated.plan) {
  const plannedSeconds = deterministicA.generated.plan.items.reduce((sum, item) => sum + item.plannedSeconds, 0);
  assert(plannedSeconds === deterministicA.generated.plan.intendedDurationSeconds,
    "Generated Session Plan timing does not equal its item-duration sum");
  assert(plannedSeconds >= 20 * 60 && plannedSeconds <= 30 * 60,
    `Generated Session Plan escaped the approximately 25-minute envelope (${plannedSeconds}s)`);
}

// The cache must include the exact request-scoped trainability set. A valid but
// different fingerprint may not reuse a projection built for another request.
assert(deterministicB.projection.source === "cache",
  "Repeated identical projection did not exercise the rebuildable cache seam");
const wrongTrainabilityLookup = {
  ...deterministicB.projection.lookup,
  trainabilityRequestFingerprint: "0".repeat(64),
};
assert(await fresh.store.getDerivedCache(wrongTrainabilityLookup) === null,
  "Projection cache reused state across a trainability-request fingerprint mismatch");

let failedCacheWrites = 0;
const cacheFailingStore = new Proxy(fresh.store, {
  get(target, property) {
    if (property === "putDerivedCache") return async () => {
      failedCacheWrites += 1;
      throw new Error("phase9-synthetic-cache-write-failure");
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
const cacheFailureRuntime = runtimeModule.createVNextReleaseCandidateRuntime({ store: cacheFailingStore });
const cacheFailureSnapshot = await cacheFailureRuntime.refresh({
  athleteId: fresh.athleteId,
  asOf: instant(91),
  seed: "phase9-cache-write-failure",
});
assert(failedCacheWrites === 1 && cacheFailureSnapshot.projection.source === "rebuilt"
  && cacheFailureSnapshot.state.athleteId === fresh.athleteId,
"A rebuildable cache write failure prevented authoritative projection state from being returned");

// 3. Representative coordinator snapshots preserve independent skill families
// and reallocate rather than bypassing a live restriction.
const mixed = await completeAssessment("mixed", {
  goals: [
    definitions.graphIds.planche,
    definitions.graphIds.lSitVSit,
    definitions.graphIds.verticalPushHspu,
  ],
  experience: "some",
  anchor: (anchor) => anchor.goalGraphId === definitions.graphIds.planche
    ? "clean"
    : anchor.goalGraphId === definitions.graphIds.lSitVSit ? "partial" : "not-yet",
  inversion: "supported",
});
const mixedGraphs = new Set(mixed.committed.review.provisional.flatMap((finding) =>
  finding.subject.kind === "milestone" ? [finding.subject.milestone.graphId] : []));
assert([
  definitions.graphIds.planche,
  definitions.graphIds.lSitVSit,
  definitions.graphIds.verticalPushHspu,
].every((graphId) => mixedGraphs.has(graphId)),
"Mixed-skill coordinator snapshot collapsed independent family placement");

const advanced = await completeAssessment("advanced", {
  goals: [
    definitions.graphIds.planche,
    definitions.graphIds.lSitVSit,
    definitions.graphIds.handstandBalance,
  ],
  experience: "experienced",
  anchor: "clean",
  inversion: "freestanding",
});
assert(advanced.committed.review.provisional.length >= 6
  && advanced.committed.snapshot.generated.ok,
"Experienced multi-family rehearsal did not retain advanced placement evidence and a plan");

const restricted = await completeAssessment("restricted", {
  goals: [definitions.graphIds.handstandBalance, definitions.graphIds.lSitVSit],
  experience: "some",
  anchor: "clean",
  inversion: "none",
  safety: {
    kind: "safety",
    severity: "block",
    demandDomains: ["inversion-technical", "overhead-straight-arm-upper-limb"],
    bodyRegions: ["head-neck"],
    notes: "Current symptoms; do not rehearse inversion.",
  },
});
assert(restricted.committed.snapshot.state.activeRestrictions.length === 1,
  "Restricted coordinator snapshot lost its immutable restriction report");
assert(!restricted.committed.snapshot.generated.plan?.items.some((item) =>
  ["inversion-technical", "overhead-straight-arm-upper-limb"].some((domain) =>
    item.demand[domain] === "moderate" || item.demand[domain] === "high")),
"Restricted coordinator plan retained material blocked inversion/overhead demand");

// A targeted no-symptom answer may clear an explicit restriction report, but
// it must not erase a separate symptom observation whose provenance requires
// its own reconfirmation path.
const explicitRestriction = restricted.committed.snapshot.sources.evidenceEvents.find(
  (event) => event.type === "restriction_reported",
);
if (!explicitRestriction) throw new Error("Restricted Phase 9 fixture has no explicit report");
const symptomProtocol = bundle.benchmarkProtocols.find((protocol) =>
  protocol.subject.kind === "milestone"
    && protocol.subject.milestone.graphId === definitions.graphIds.handstandBalance);
if (!symptomProtocol) throw new Error("Phase 9 fixture has no Handstand symptom protocol");
const symptomEvent = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase9-targeted-symptom-observation"),
  athleteId: restricted.athleteId,
  occurredAt: instant(0, 2),
  recordedAt: instant(0, 2),
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "performance_observed",
  subject: symptomProtocol.subject,
  outcome: "symptom",
  benchmarkProtocolId: symptomProtocol.id,
  benchmarkProtocolVersion: symptomProtocol.definitionVersion,
};
await restricted.store.appendEvidenceEvent(symptomEvent);
const beforeTargetedClearance = await restricted.runtime.refresh({
  athleteId: restricted.athleteId,
  asOf: instant(4, 2),
  seed: "phase9-before-targeted-clearance",
});
assert(beforeTargetedClearance.state.activeRestrictions.some((item) =>
  item.source.kind === "evidence-event" && item.source.eventId === explicitRestriction.id)
  && beforeTargetedClearance.state.activeRestrictions.some((item) =>
    item.source.kind === "evidence-event" && item.source.eventId === symptomEvent.id),
"Targeted-reconfirmation fixture did not retain distinct explicit and symptom-derived restrictions");
const targetedStarted = await restricted.runtime.startAssessment({
  athleteId: restricted.athleteId,
  asOf: instant(5, 2),
  createdAt: instant(5, 2),
  mode: "targeted-reconfirmation",
  draftId: "assessment-draft-phase9-targeted-clearance",
});
const targetedAnswered = await restricted.runtime.answerAssessment({
  draft: targetedStarted.assessment.draft,
  answer: { kind: "safety", severity: "none" },
  answeredAt: instant(6, 2),
});
assert(targetedAnswered.step.kind === "review",
  "Targeted no-symptom reassessment expanded into full onboarding");
const targetedCommitted = await restricted.runtime.commitAssessment({
  athleteId: restricted.athleteId,
  draft: targetedAnswered.draft,
  asOf: instant(7, 2),
  seed: "phase9-after-targeted-clearance",
});
const targetedClearances = targetedCommitted.snapshot.sources.evidenceEvents.filter(
  (event) => event.type === "restriction_cleared",
);
assert(targetedCommitted.clearedRestrictions === 1
  && targetedClearances.some((event) => event.restrictionEventId === explicitRestriction.id)
  && !targetedClearances.some((event) => event.restrictionEventId === symptomEvent.id)
  && !targetedCommitted.snapshot.state.activeRestrictions.some((item) =>
    item.source.kind === "evidence-event" && item.source.eventId === explicitRestriction.id)
  && targetedCommitted.snapshot.state.activeRestrictions.some((item) =>
    item.source.kind === "evidence-event" && item.source.eventId === symptomEvent.id),
"Targeted no-symptom reassessment did not clear only the explicit evidence restriction");

// Separate offline drafts may both record a genuine clearance before they
// reconcile. Preserve both immutable observations, but fold the first valid
// clearance so a redundant later report cannot discard post-clearance proof.
const firstClearance = targetedClearances.find(
  (event) => event.restrictionEventId === explicitRestriction.id,
);
if (!firstClearance) throw new Error("Targeted Phase 9 fixture has no first clearance");
const redundantClearance = {
  ...structuredClone(firstClearance),
  id: contracts.parseStableId("event", "phase9-second-device-clearance"),
  occurredAt: instant(8, 2),
  recordedAt: instant(8, 2),
};
await restricted.store.appendEvidenceEvent(redundantClearance);
const reconciledClearances = await restricted.runtime.refresh({
  athleteId: restricted.athleteId,
  asOf: instant(9, 2),
  seed: "phase9-reconciled-clearances",
});
const explicitReconfirmation = reconciledClearances.state.reconfirmationRequirements.find((item) =>
  item.source.kind === "evidence-event" && item.source.eventId === explicitRestriction.id);
assert(reconciledClearances.sources.evidenceEvents.filter((event) =>
  event.type === "restriction_cleared"
    && event.restrictionEventId === explicitRestriction.id).length === 2
  && explicitReconfirmation?.requiredSince === firstClearance.occurredAt,
"Multi-device restriction clearances did not preserve both observations and fold the earliest one deterministically");

// Feedback reported after the athlete answered the safety prompt must remain
// active even if it arrives before that draft is committed.
const lateStarted = await restricted.runtime.startAssessment({
  athleteId: restricted.athleteId,
  asOf: instant(0, 3),
  createdAt: instant(0, 3),
  mode: "targeted-reconfirmation",
  draftId: "assessment-draft-phase9-late-restriction",
});
const lateAnswered = await restricted.runtime.answerAssessment({
  draft: lateStarted.assessment.draft,
  answer: { kind: "safety", severity: "none" },
  answeredAt: instant(1, 3),
});
const lateRestriction = {
  ...structuredClone(explicitRestriction),
  id: contracts.parseStableId("event", "phase9-restriction-after-safety-answer"),
  occurredAt: instant(2, 3),
  recordedAt: instant(2, 3),
};
await restricted.store.appendEvidenceEvent(lateRestriction);
const lateCommitted = await restricted.runtime.commitAssessment({
  athleteId: restricted.athleteId,
  draft: lateAnswered.draft,
  asOf: instant(3, 3),
  seed: "phase9-late-restriction",
});
assert(lateCommitted.clearedRestrictions === 0
  && lateCommitted.snapshot.state.activeRestrictions.some((item) =>
    item.source.kind === "evidence-event" && item.source.eventId === lateRestriction.id),
"A targeted assessment cleared restriction feedback that occurred after its safety answer");

// 4. Copied v1.2 conversion is deterministic, retry-safe and visibly honest.
const copiedProfile = {
  profileId: "phase9-migrated-athlete",
  username: "phase9-copy",
  schemaVersion: 1,
  revision: 4,
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-08-18T08:00:00.000Z",
  progressResetAt: "2026-08-01T08:00:00.000Z",
  nextProgramDay: 3,
  history: [{
    id: "phase9-legacy-session",
    completedAt: "2026-08-10T08:25:00.000Z",
    day: 2,
    status: "complete",
    seconds: 1500,
    completedExerciseIds: ["support-hold", "tuck-support"],
  }],
  readiness: { G1: true, G6: true },
  readinessUpdatedAt: {
    G1: "2026-08-02T08:00:00.000Z",
    G6: "2026-08-02T08:00:00.000Z",
  },
  progression: { "support-hold": { cleanSessions: 2, lastFeedback: "right" } },
  equipment: ["parallettes", "floor"],
  preferences: { startingAssessment: { suggestedLevel: "L2" }, soundEnabled: true },
};
const migrationStore = makeStore("migration");
const migrationRuntime = runtimeModule.createVNextReleaseCandidateRuntime({
  store: migrationStore,
  clock: () => "2026-08-18T09:00:00.000Z",
});
const conversion = await migrationRuntime.prepareCopiedLegacyConversion({
  copiedProfile,
  capturedAt: "2026-08-18T09:00:00.000Z",
});
const migrationFirst = await migrationRuntime.applyCopiedLegacyConversion({
  athleteId: conversion.snapshot.athleteId,
  conversion,
  asOf: "2026-08-18T09:00:00.000Z",
  seed: "phase9-migration",
});
const migrationRetry = await migrationRuntime.applyCopiedLegacyConversion({
  athleteId: conversion.snapshot.athleteId,
  conversion,
  asOf: "2026-08-18T09:00:00.000Z",
  seed: "phase9-migration",
});
assert(migrationFirst.applyStatus === "inserted" && migrationRetry.applyStatus === "duplicate",
  "Copied-profile migration was not idempotent across an exact retry");
assert(migrationRetry.snapshot.sources.sessionRecords.length === conversion.sessionRecords.length
  && migrationRetry.snapshot.sources.evidenceEvents.length === conversion.evidenceEvents.length,
"Repeated migration changed the canonical converted observation set");
const migratedSourceKinds = [...migrationRetry.snapshot.presentations.provenance.values()];
assert(migratedSourceKinds.includes("migration") && !migratedSourceKinds.includes("session"),
  "Legacy sparse Session Record provenance was not classified as migration");
assert(migrationRetry.snapshot.presentations.progress.families.every((family) =>
  family.demonstratedState.kind !== "provisional"
    || family.demonstratedState.sourceLabel === "Imported starting point"),
"A migrated provisional finding was presented without imported-starting-point provenance");

// 5. JSON export/import round-trip, reset lower bound and recoverable rollback.
const exported = await migrationStore.exportBundle(
  conversion.snapshot.athleteId,
  metadata("2026-08-18T10:00:00.000Z"),
);
const exportedJson = JSON.stringify(exported);
const importStore = makeStore("import");
const imported = await importStore.importBundle(JSON.parse(exportedJson));
const repeatedImport = await importStore.importBundle(JSON.parse(exportedJson));
const importedSources = await importStore.readProjectionSources(conversion.snapshot.athleteId);
assert(imported.inserted > 0 && repeatedImport.inserted === 0 && repeatedImport.duplicates > 0,
  "Observation export/import was not an idempotent JSON round-trip");
assert(canonical(importedSources.evidenceEvents) === canonical(migrationRetry.snapshot.sources.evidenceEvents)
  && canonical(importedSources.sessionRecords) === canonical(migrationRetry.snapshot.sources.sessionRecords),
"Observation export/import changed converted evidence or session truth");
const newerReset = {
  schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
  id: "phase9-newer-reset",
  athleteId: conversion.snapshot.athleteId,
  resetAt: "2026-08-12T00:00:00.000Z",
  recordedAt: "2026-08-19T00:00:00.000Z",
  source: "athlete-reset",
};
await importStore.applyProgressReset(newerReset);
await importStore.importBundle(JSON.parse(exportedJson));
const afterResetImport = await importStore.readProjectionSources(conversion.snapshot.athleteId);
assert(afterResetImport.resetTombstone?.resetAt === newerReset.resetAt,
  "Older imported progressResetAt replaced the newer reset lower bound");
assert(afterResetImport.evidenceEvents.every((event) => Date.parse(event.occurredAt) > Date.parse(newerReset.resetAt))
  && afterResetImport.sessionRecords.every((record) => Date.parse(record.completedAt) > Date.parse(newerReset.resetAt)),
"Import resurrected observation history at or before progressResetAt");

const nativeRestriction = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", "phase9-native-after-migration"),
  athleteId: conversion.snapshot.athleteId,
  occurredAt: "2026-08-20T09:00:00.000Z",
  recordedAt: "2026-08-20T09:00:00.000Z",
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_reported",
  severity: "modify",
  demandDomains: ["hand-wrist-bearing"],
  bodyRegions: ["wrist"],
};
await migrationStore.appendEvidenceEvent(nativeRestriction);
await migrationStore.rollbackMigrationRun(
  conversion.snapshot.athleteId,
  conversion.run.id,
  "2026-08-21T00:00:00.000Z",
);
const rolledBackSources = await migrationStore.readProjectionSources(conversion.snapshot.athleteId);
assert(rolledBackSources.evidenceEvents.length === 1
  && rolledBackSources.evidenceEvents[0]?.id === nativeRestriction.id
  && rolledBackSources.sessionRecords.length === 0,
"Migration rollback deleted native truth or retained converter-owned observations");
const rollbackBundle = await migrationStore.exportBundle(
  conversion.snapshot.athleteId,
  metadata("2026-08-21T01:00:00.000Z"),
);
assert(rollbackBundle.migrationSnapshots.length === 1
  && rollbackBundle.migrationRuns[0]?.status === "rolled-back",
"Rollback failed to retain its recovery snapshot and revocation receipt");
assert(canonical(await legacyMigration.recoverLegacyMigrationSnapshot(rollbackBundle.migrationSnapshots[0]))
  === canonical(copiedProfile),
"Recovery snapshot did not reconstruct the exact copied legacy profile");

// 6. In-memory append-only remote validates offline upload/reconnect and
// disjoint multi-device set union without exercising an external service.
const createMemoryShadowTransport = () => {
  let sequence = 0;
  const rows = new Map();
  return async (request) => {
    const acknowledged = [];
    const conflicts = [];
    for (const item of request.upload) {
      const key = `${item.kind}:${item.id}`;
      const existing = rows.get(key);
      if (existing) {
        if (existing.item.hash === item.hash) acknowledged.push({ kind: item.kind, id: item.id, status: "duplicate" });
        else conflicts.push({ kind: item.kind, id: item.id, reason: "immutable-id-conflict" });
        continue;
      }
      sequence += 1;
      rows.set(key, { sequence, item: structuredClone(item) });
      acknowledged.push({ kind: item.kind, id: item.id, status: "inserted" });
    }
    const available = [...rows.values()]
      .filter((row) => row.sequence > request.cursor)
      .sort((left, right) => left.sequence - right.sequence);
    const page = available.slice(0, request.limit);
    const cursor = page.at(-1)?.sequence ?? request.cursor;
    const resetRow = [...rows.values()]
      .filter((row) => row.item.kind === "reset-tombstone")
      .sort((left, right) => right.sequence - left.sequence)[0];
    return {
      schemaVersion: persistence.VNEXT_PERSISTENCE_SCHEMA_VERSION,
      cursor,
      hasMore: available.length > page.length,
      ...(resetRow ? { resetTombstone: structuredClone(resetRow.item.payload) } : {}),
      changes: page.map((row) => structuredClone(row.item)),
      acknowledged,
      conflicts,
    };
  };
};

const offlineSource = makeStore("offline-source");
await offlineSource.importBundle(JSON.parse(exportedJson));
const offlineAthleteId = conversion.snapshot.athleteId;
const pendingBeforeReconnect = await offlineSource.readSyncUpload(offlineAthleteId, 100);
assert(pendingBeforeReconnect.length > 0, "Offline writes did not remain in the local sync outbox");
const memoryTransport = createMemoryShadowTransport();
let partialSyncError;
try {
  await persistence.syncObservationDeltas(
    offlineSource,
    offlineAthleteId,
    memoryTransport,
    { pageSize: 2, maximumPages: 1 },
  );
} catch (error) {
  partialSyncError = error;
}
const pendingAfterPartialSync = await offlineSource.readSyncUpload(offlineAthleteId, 100);
assert(partialSyncError instanceof Error && partialSyncError.message === "shadow-sync-page-limit"
  && pendingAfterPartialSync.length > 0
  && pendingAfterPartialSync.length < pendingBeforeReconnect.length,
"Interrupted paged migration/sync did not retain a resumable idempotent outbox boundary");
const uploadSummary = await persistence.syncObservationDeltas(
  offlineSource, offlineAthleteId, memoryTransport, { pageSize: 40 },
);
assert(uploadSummary.uploaded > 0 && (await offlineSource.readSyncUpload(offlineAthleteId, 1)).length === 0,
  "Reconnect did not upload and acknowledge the offline observation outbox");
const deviceB = makeStore("device-b");
await persistence.syncObservationDeltas(deviceB, offlineAthleteId, memoryTransport, { pageSize: 40 });
const deviceBSources = await deviceB.readProjectionSources(offlineAthleteId);
assert(deviceBSources.sourceFingerprint === (await offlineSource.readProjectionSources(offlineAthleteId)).sourceFingerprint,
  "Reconnect replay did not reproduce the same canonical observation sources on a second device");

const eventFor = (id, domain, occurredAt) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", id),
  athleteId: offlineAthleteId,
  occurredAt,
  recordedAt: occurredAt,
  source: "athlete-report",
  catalogueVersion: bundle.catalogueVersion,
  type: "restriction_reported",
  severity: "modify",
  demandDomains: [domain],
  bodyRegions: ["other"],
});
await offlineSource.appendEvidenceEvent(eventFor(
  "phase9-device-a-observation", "hand-wrist-bearing", "2026-08-22T09:00:00.000Z",
));
await deviceB.appendEvidenceEvent(eventFor(
  "phase9-device-b-observation", "compression-trunk", "2026-08-22T09:05:00.000Z",
));
await persistence.syncObservationDeltas(offlineSource, offlineAthleteId, memoryTransport, { pageSize: 40 });
await persistence.syncObservationDeltas(deviceB, offlineAthleteId, memoryTransport, { pageSize: 40 });
await persistence.syncObservationDeltas(offlineSource, offlineAthleteId, memoryTransport, { pageSize: 40 });
const unionA = await offlineSource.readProjectionSources(offlineAthleteId);
const unionB = await deviceB.readProjectionSources(offlineAthleteId);
assert(unionA.sourceFingerprint === unionB.sourceFingerprint
  && unionA.evidenceEvents.some((event) => event.id === "phase9-device-a-observation")
  && unionA.evidenceEvents.some((event) => event.id === "phase9-device-b-observation"),
"Disjoint multi-device observations did not converge by stable-ID set union");

// 7. Phase 10 owner review approved the exact 28 local implementations that
// cover 30 exercises. Approval remains fingerprint-bound and no substitute
// movement is invented.
const requiredMediaIds = media.phase7MediaRequiredExerciseIds;
const mediaEvaluation = media.evaluateProductionReachableVNextMedia(
  requiredMediaIds,
  media.vNextMediaReleaseManifest,
);
assert(media.vNextMediaReleaseManifest.entries.length === 28,
  `Media release gate expected 28 requirements; found ${media.vNextMediaReleaseManifest.entries.length}`);
assert(requiredMediaIds.length === 30 && new Set(requiredMediaIds).size === 30,
  `Media release gate expected 30 unique exercise IDs; found ${new Set(requiredMediaIds).size}`);
assert(mediaEvaluation.releaseAllowed === true
  && mediaEvaluation.blocked.length === 0
  && mediaEvaluation.fallbackPolicy === "block-no-substitution",
"Owner-approved owned media does not release all 30 exact production-reachable exercises");
assert(mediaEvaluation.decisions.every((decision, index) =>
  decision.exerciseId === requiredMediaIds[index]
    && !Object.hasOwn(decision, "substitute")
    && !Object.hasOwn(decision, "replacement")
    && !Object.hasOwn(decision, "safeAlternative")),
"Media gate substituted or reordered a movement instead of blocking its exact exercise ID");

// 8. Frozen manifest, service-worker namespace and staging order are coherent.
const manifestValidation = release.validateVNextReleaseCandidateManifest(
  release.vNextReleaseCandidateManifest,
  media.vNextMediaReleaseManifest,
);
assert(manifestValidation.manifestValid && !manifestValidation.productionEligible
  && release.vNextReleaseCandidateManifest.phase10Readiness.status === "approved"
  && release.vNextReleaseCandidateManifest.phase10Readiness.comprehensiveValidation === "passed"
  && release.vNextReleaseCandidateManifest.phase10Readiness.ownerReleaseApproval === "pending",
"Corrected release manifest is invalid, does not record completed Phase 10 validation, or is prematurely production-eligible");
assert(!manifestValidation.issues.some((issue) => issue.code === "unresolved-production-media")
  && release.vNextReleaseCandidateManifest.media.releaseAllowed,
"Frozen RC media snapshot did not retain the exact completed owner review");
const phase11SourceFingerprint = integrationSourceFingerprint();
assert(
  release.vNextReleaseCandidateManifest.releaseCandidate.integrationSourceFingerprint
    === "1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47"
    && phase11SourceFingerprint !== release.vNextReleaseCandidateManifest.releaseCandidate.integrationSourceFingerprint,
  "Historical RC.3 provenance changed or was incorrectly reused for the later Phase 11 source tree",
);
const stagedIds = release.vNextReleaseCandidateManifest.stagingDeploymentRehearsal.map((step) => step.id);
assert(stagedIds.join("|") === [
  "verify-baseline-and-freeze-identity",
  "snapshot-copied-and-synthetic-sources",
  "apply-additive-shadow-schema",
  "deploy-shadow-api-disabled",
  "deploy-rc-assets-disabled",
  "convert-copies-in-shadow",
  "enable-staging-shadow-sync",
  "switch-isolated-cohort-read-write-authority",
  "reconcile-staging-observations-and-plans",
  "freeze-phase-10-candidate",
].join("|"), "Staging schema/API/sync/authority/reconciliation order changed");
assert(release.vNextReleaseCandidateManifest.stagingDeploymentRehearsal.every((step) =>
  step.environment === "staging" && step.migrationMode !== "live"
    && step.additiveSchemaOnly && !step.deletesLegacyData),
"Staging rehearsal includes a production, live-migration or destructive step");
assert(release.vNextReleaseCandidateManifest.rollbackRehearsal.every((step) =>
  step.environment === "staging" && step.preservesAdditiveSchema
    && step.preservesVNextObservationData && step.preservesLegacyData && !step.deletesData),
"Rollback rehearsal deletes additive, vNext observation or legacy data");
const stagedAssetDeploy = release.vNextReleaseCandidateManifest.stagingDeploymentRehearsal.find(
  (step) => step.id === "deploy-rc-assets-disabled",
);
const stagedAuthoritySwitch = release.vNextReleaseCandidateManifest.stagingDeploymentRehearsal.find(
  (step) => step.id === "switch-isolated-cohort-read-write-authority",
);
const stagedAuthorityRollback = release.vNextReleaseCandidateManifest.rollbackRehearsal.find(
  (step) => step.id === "disable-new-rc-authority",
);
assert(stagedAssetDeploy?.action.includes("access-controlled isolated origin")
  && stagedAssetDeploy.action.includes("parent v1 worker exclusion")
  && stagedAssetDeploy.action.includes("experience query is build identity routing, never access control")
  && stagedAuthoritySwitch?.action.includes("never treat the experience query as cohort access control")
  && stagedAuthorityRollback?.action.includes("must stay inert"),
"Deployment rehearsal does not enforce hosting access control, parent-worker sequencing and inert RC rollback");

const serviceWorker = readText("public/sw.js");
const distValidator = readText("scripts/validate-dist.mjs");
const packageSource = readText("package.json");
const deploymentWorkflow = readText(".github/workflows/deploy-pages.yml");
const productionWorkerConfig = readText("profile-api/wrangler.toml");
const rcWorkerConfig = readText("profile-api/wrangler.vnext-rc.toml.example");
assert(serviceWorker.includes('const CACHE_CHANNEL = "__PWA_CACHE_CHANNEL__";')
  && serviceWorker.includes("parallette-25-${CACHE_CHANNEL}-")
  && serviceWorker.includes("manifest.channel !== CACHE_CHANNEL")
  && serviceWorker.includes("key.startsWith(CACHE_PREFIX)")
  && serviceWorker.includes('const VNEXT_RC_PATH = "/parallettes/vnext-rc/";')
  && serviceWorker.includes('CACHE_CHANNEL === "v1" && requestUrl.pathname.startsWith(VNEXT_RC_PATH)')
  && !serviceWorker.includes("self.skipWaiting("),
"Service worker lost channel isolation, parent RC exclusion, scoped cleanup or safe waiting updates");
assert(distValidator.indexOf("writeFileSync(assetManifestPath")
  < distValidator.indexOf("writeFileSync(builtWorkerPath"),
"Distribution validator no longer writes the fingerprinted asset manifest before the matching worker");
assert(distValidator.includes('P25_PWA_CACHE_CHANNEL ?? "v1"')
  && distValidator.includes('P25_PWA_BASE ?? "/parallettes/"')
  && distValidator.includes('/parallettes/vnext-rc/?experience=${encodeURIComponent(releaseCandidateId)}')
  && distValidator.includes("crossed cache channel or deployment base")
  && distValidator.includes("mixes ${applicationVariant} with the opposite application asset graph")
  && distValidator.includes("p25-build-lane:v1")
  && distValidator.includes("p25-build-lane:vnext-rc3"),
"Distribution validation no longer proves exact v1/RC base, launch identity and mutually exclusive asset graphs");
assert(packageSource.includes('"build": "VITE_VNEXT_PRODUCTION_ENABLED=false VITE_VNEXT_RC_ENABLED=false vite build"')
  && packageSource.includes("P25_PWA_VARIANT=vnext-rc")
  && packageSource.includes("P25_PWA_BASE=/parallettes/vnext-rc/")
  && packageSource.includes('"build:vnext-production": "node scripts/validate-vnext-production-env.mjs && P25_BUILD_BASE=/parallettes/ VITE_VNEXT_PRODUCTION_ENABLED=true')
  && packageSource.includes("P25_PWA_VARIANT=vnext-production"),
"Build scripts no longer declare mutually exclusive v1 and exact RC distribution variants");
assert(!deploymentWorkflow.includes("build:vnext-rc")
  && !deploymentWorkflow.includes("VITE_VNEXT_RC_ENABLED")
  && deploymentWorkflow.includes("pnpm build:vnext-production")
  && deploymentWorkflow.includes("pnpm validate:dist:vnext-production"),
"Production deployment workflow can enable the isolated RC or legacy lane");
assert(productionWorkerConfig.includes('VNEXT_SHADOW_MODE = "true"')
  && productionWorkerConfig.includes('VNEXT_PRODUCTION_AUTHORITY_MODE = "true"')
  && productionWorkerConfig.includes('database_id = "4dfe10d8-e66e-4115-ac7d-6be01eacd75e"')
  && !productionWorkerConfig.includes("replace-with-isolated-vnext-rc")
  && rcWorkerConfig.includes('VNEXT_SHADOW_MODE = "true"')
  && !rcWorkerConfig.includes("VNEXT_PRODUCTION_AUTHORITY_MODE")
  && rcWorkerConfig.includes("replace-with-isolated-vnext-rc-origin.example")
  && rcWorkerConfig.includes("replace-with-isolated-vnext-rc-kv-namespace-id")
  && rcWorkerConfig.includes("replace-with-isolated-vnext-rc-d1-database-id"),
"RC shadow bindings are not isolated placeholders or the accepted Phase 11 production authority pair is incoherent");

// 9. The build-time branch must eliminate the opposite application graph. An
// invalid RC identity is inert rather than running legacy startup. The selected
// RC root may use the narrow authenticated sync adapter, but no legacy profile
// authority or legacy save/reset path.
const mainSource = readText("src/main.tsx");
const releaseDirectory = resolve(projectRoot, "app/vnext/releaseCandidate");
const releaseAppPath = join(releaseDirectory, "VNextReleaseCandidateApp.tsx");
assert(existsSync(releaseAppPath),
  "Authority gate targets a missing isolated VNextReleaseCandidateApp root");
const releaseAppSource = readFileSync(releaseAppPath, "utf8");
const releaseSources = readdirSync(releaseDirectory)
  .filter((name) => /\.(?:ts|tsx)$/u.test(name))
  .map((name) => readFileSync(join(releaseDirectory, name), "utf8"))
  .join("\n");
const legacyMountStart = mainSource.indexOf("const mountLegacyApplication");
const releaseMountStart = mainSource.indexOf("const mountReleaseCandidate");
const buildBranchStart = mainSource.indexOf("if (import.meta.env.VITE_VNEXT_RC_ENABLED");
const legacyMountSource = mainSource.slice(legacyMountStart, releaseMountStart);
const releaseMountSource = mainSource.slice(releaseMountStart, buildBranchStart);
assert(legacyMountStart >= 0 && releaseMountStart > legacyMountStart && buildBranchStart > releaseMountStart
  && legacyMountSource.includes('import("../app/page")')
  && !legacyMountSource.includes("VNextReleaseCandidateApp")
  && releaseMountSource.includes('import("../app/vnext/releaseCandidate/entry")')
  && releaseMountSource.includes('import("../app/vnext/releaseCandidate/VNextReleaseCandidateApp")')
  && !releaseMountSource.includes('import("../app/page")')
  && releaseMountSource.includes('authority !== "vnext-rc"')
  && releaseMountSource.includes("This isolated preview is unavailable")
  && mainSource.includes("void mountReleaseCandidate().catch(renderStartupError)")
  && mainSource.includes("void mountLegacyApplication().catch(renderStartupError)")
  && !/^import\s+.*(?:app\/page|releaseCandidate\/entry)/mu.test(mainSource),
"Application root no longer uses mutually exclusive build-time authority graphs with an inert invalid RC state");
assert(!/(?:\bsaveProfile\s*\(|\bresetProfileTraining\s*\(|from\s+["'][^"']*(?:app\/page|\.\.\/\.\.\/page)["'])/u.test(releaseSources),
  "Isolated vNext root imports or invokes a legacy profile/save/reset authority path");
assert(!/\b(?:newProfile|mergeProfiles|saveProfile|resetProfileTraining|getProfile|syncProfile|exportProfile|importProfile|deleteProfile)\b/u.test(releaseSources),
  "Isolated vNext root references a legacy profile blob read/write/reset/import/export authority");
const profileStoreReferences = releaseAppSource.match(/profileStore/gu) ?? [];
assert(profileStoreReferences.length >= 3
  && releaseAppSource.includes("syncVNextShadowObservations")
  && releaseAppSource.includes("isTransientVNextSyncError")
  && !/profileStore[\s\S]{0,300}\b(?:saveProfile|resetProfileTraining|syncProfile|deleteProfile)\b/u.test(releaseAppSource),
"Isolated vNext root reaches profileStore through anything except the narrow authenticated shadow-sync adapter");
assert(/createVNextShadowStore\(deployment\.shadowDatabaseName/u.test(releaseAppSource)
  && /createVNextReleaseCandidateRuntime\(\{\s*store\s*\}\)/u.test(releaseAppSource)
  && !/store\.(?:appendEvidenceEvent|appendSession|putAthleteIntent|applyProgressReset|rollbackMigrationRun|clearAthlete)\s*\(/u.test(releaseAppSource),
"RC root bypasses the coherent vNext coordinator for evidence, session, intent, reset or rollback authority");
assert(/store\.exportBundle\s*\(/u.test(releaseAppSource)
  && /store\.importBundle\s*\(/u.test(releaseAppSource),
"RC root does not expose the approved observation-model export/import seam");

for (const store of [
  fresh.store,
  mixed.store,
  advanced.store,
  restricted.store,
  migrationStore,
  importStore,
  offlineSource,
  deviceB,
]) store.close();

if (failures.length) {
  console.error(`vNext Phase 9 validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    "vNext Phase 9 validation passed: isolated authority, coordinator completion, representative snapshots, migration/reconciliation, offline union, export/reset/rollback, cache identity, exact media approvals and release ordering are coherent.",
  );
}
