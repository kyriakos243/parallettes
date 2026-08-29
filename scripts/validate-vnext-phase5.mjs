import { createRequire } from "node:module";

createRequire(import.meta.url)("fake-indexeddb/auto");
import { readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const resolveTypeScriptModule = (specifier, parentPath) => {
  const base = resolve(dirname(parentPath), specifier);
  const candidates = extname(base) ? [base] : [`${base}.ts`, join(base, "index.ts")];
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
  if (absolutePath.endsWith("/app/program.ts")) source = source.replaceAll("import.meta.env.BASE_URL", '"/parallettes/"');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
const assessment = loadTypeScriptModule("app/vnext/assessment/index.ts");
const persistence = loadTypeScriptModule("app/vnext/persistence/index.ts");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts");

const bundle = definitions.vNextDefinitionBundleV1;
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
const equipment = ["floor", "parallettes", "wall"].map((id) => contracts.parseStableId("equipment", id));
const at = (minute) => new Date(Date.parse("2026-05-01T09:00:00.000Z") + minute * 60_000).toISOString();
const uniqueDatabaseName = (label) => `parallette25-vnext-phase5-${label}-${crypto.randomUUID()}`;
const makeStore = (label) => persistence.createVNextShadowStore({ databaseName: uniqueDatabaseName(label) });
const protocolById = new Map(bundle.benchmarkProtocols.map((protocol) => [protocol.id, protocol]));

const answerRoute = (draft, resolver, startMinute = 1, maximumSteps = 40) => {
  let current = draft;
  let minute = startMinute;
  for (let index = 0; index < maximumSteps; index += 1) {
    const step = assessment.nextAssessmentStep(current, bundle);
    if (step.kind === "review") return current;
    current = assessment.answerAssessmentStep(current, resolver(step), at(minute), bundle);
    minute += 1;
  }
  throw new Error("Assessment route did not terminate");
};

const baseResolver = (goals, experience, anchorResponse = "clean", options = {}) => (step) => {
  switch (step.kind) {
    case "safety": return options.safety ?? { kind: "safety", severity: "none" };
    case "experience": return { kind: "experience", experience };
    case "inactivity": return { kind: "inactivity", inactivity: options.inactivity ?? "active" };
    case "goals": return { kind: "goals", graphIds: goals };
    case "equipment": return { kind: "equipment", equipment };
    case "inversion": return { kind: "inversion", familiarity: options.inversion ?? "supported" };
    case "anchor": return {
      kind: "anchor",
      response: typeof anchorResponse === "function" ? anchorResponse(step.anchor) : anchorResponse,
    };
    default: throw new Error(`Unexpected step ${step.kind}`);
  }
};

const newDraft = (label, athleteId, extras = {}) => assessment.createAssessmentDraft({
  id: `phase5-${label}`,
  athleteId,
  createdAt: at(0),
  bundle,
  initialEquipment: equipment,
  ...extras,
});

// 1. Beginner: all common anchors and the first relevant branch, then stop.
const beginnerId = contracts.parseStableId("athlete", "phase5-beginner");
const beginnerDraft = answerRoute(
  newDraft("beginner", beginnerId),
  baseResolver([definitions.graphIds.lSitVSit], "new", "not-yet"),
);
const beginnerReview = assessment.buildAssessmentReview(beginnerDraft, bundle);
assert(beginnerReview.promptCount >= 7 && beginnerReview.promptCount <= 10,
  `Beginner route should remain short; saw ${beginnerReview.promptCount} prompts`);
assert(beginnerReview.estimatedMinutes >= 3 && beginnerReview.estimatedMinutes <= 6,
  `Beginner route should take about 3-6 minutes; estimated ${beginnerReview.estimatedMinutes}`);
assert(beginnerReview.provisional.every((item) => item.response === "not-yet"),
  "Beginner route invented a positive placement");

// 2. Experienced multi-goal: starts near the middle and climbs only on clean answers.
const experiencedId = contracts.parseStableId("athlete", "phase5-experienced");
const experiencedDraft = answerRoute(
  newDraft("experienced", experiencedId),
  baseResolver([
    definitions.graphIds.handstandBalance,
    definitions.graphIds.planche,
    definitions.graphIds.lSitVSit,
  ], "experienced", "clean", { inversion: "freestanding" }),
);
const experiencedReview = assessment.buildAssessmentReview(experiencedDraft, bundle);
assert(experiencedReview.promptCount <= 18,
  `Experienced route became exhaustive; saw ${experiencedReview.promptCount} prompts`);
assert(experiencedReview.estimatedMinutes >= 6 && experiencedReview.estimatedMinutes <= 10,
  `Experienced route should take about 6-10 minutes; estimated ${experiencedReview.estimatedMinutes}`);
assert(experiencedReview.provisional.some((item) => item.subject.kind === "milestone"
  && item.subject.milestone.graphId === definitions.graphIds.planche), "Experienced route skipped Planche branching");
assert(experiencedReview.provisional.some((item) => item.subject.kind === "milestone"
  && item.subject.milestone.graphId === definitions.graphIds.handstandBalance), "Experienced route skipped Handstand branching");

// 3. Uncertain answer: branch stops and offers targeted resolution instead of guessing upward.
const uncertainId = contracts.parseStableId("athlete", "phase5-uncertain");
const uncertainDraft = answerRoute(
  newDraft("uncertain", uncertainId),
  baseResolver([definitions.graphIds.planche], "some", (anchor) =>
    anchor.goalGraphId === definitions.graphIds.planche ? "not-sure" : "clean"),
);
const uncertainReview = assessment.buildAssessmentReview(uncertainDraft, bundle);
assert(uncertainReview.guidedTests.some((test) => test.reason === "resolve-uncertainty"),
  "Uncertain placement did not produce a targeted guided-test recommendation");
const plancheAnswers = uncertainReview.provisional.filter((item) => item.subject.kind === "milestone"
  && item.subject.milestone.graphId === definitions.graphIds.planche);
assert(plancheAnswers.length === 1 && plancheAnswers[0].response === "not-sure",
  "Uncertain branch continued upward after a not-sure response");

// 4. Mixed skill: families remain independent and no global level is produced.
const mixedId = contracts.parseStableId("athlete", "phase5-mixed");
const mixedDraft = answerRoute(
  newDraft("mixed", mixedId),
  baseResolver([
    definitions.graphIds.planche,
    definitions.graphIds.lSitVSit,
    definitions.graphIds.verticalPushHspu,
  ], "some", (anchor) => {
    if (anchor.goalGraphId === definitions.graphIds.planche) return "clean";
    if (anchor.goalGraphId === definitions.graphIds.lSitVSit) return "partial";
    if (anchor.goalGraphId === definitions.graphIds.verticalPushHspu) return "not-yet";
    return "clean";
  }),
);
const mixedReview = assessment.buildAssessmentReview(mixedDraft, bundle);
const mixedGraphs = new Set(mixedReview.provisional.flatMap((item) =>
  item.subject.kind === "milestone" ? [item.subject.milestone.graphId] : []));
assert(mixedGraphs.has(definitions.graphIds.planche)
  && mixedGraphs.has(definitions.graphIds.lSitVSit)
  && mixedGraphs.has(definitions.graphIds.verticalPushHspu),
"Mixed assessment failed to retain independent family findings");
assert(!Object.hasOwn(mixedReview, "level"), "Assessment reintroduced a global ability level");

// 5. Inversion restriction: affected exposure is skipped/blocked and becomes a restriction event.
const restrictedId = contracts.parseStableId("athlete", "phase5-restricted");
const restrictedDraft = answerRoute(
  newDraft("restricted", restrictedId),
  baseResolver([definitions.graphIds.handstandBalance], "some", "clean", {
    safety: {
      kind: "safety",
      severity: "block",
      demandDomains: ["inversion-technical", "overhead-straight-arm-upper-limb"],
      bodyRegions: ["head-neck"],
      notes: "Current symptoms; do not test inversion.",
    },
    inversion: "none",
  }),
);
const restrictedReview = assessment.buildAssessmentReview(restrictedDraft, bundle);
assert(restrictedReview.restrictionReported, "Restriction route did not retain the safety report");
for (const test of restrictedReview.guidedTests) {
  const demands = assessment.demandDomainsForAssessmentProtocol(bundle, test.protocolId);
  if (demands.some((domain) => ["inversion-technical", "overhead-straight-arm-upper-limb"].includes(domain))) {
    assert(test.availability === "blocked" && test.blockers.includes("active-restriction"),
      `Restricted guided test ${test.protocolId} was marked available`);
  }
}
assert(assessment.protocolAnswerRecords(restrictedDraft).every(({ anchor }) => anchor.inversionExposure !== "full"),
  "Restriction route continued into full-inversion placement anchors");
const restrictedEvents = await assessment.buildAssessmentEvidence(restrictedDraft, bundle);
assert(restrictedEvents.some((event) => event.type === "restriction_reported"),
  "Assessment restriction was not converted to an immutable restriction event");
const restrictedProjection = projection.projectAthleteState({
  athleteId: restrictedId,
  asOf: at(30),
  policy: projection.vNextProjectionPolicyV1,
  definitionBundles: [bundle],
  evidenceEvents: restrictedEvents,
  sessionPlans: [],
  sessionRecords: [],
  intent: assessment.buildAssessmentIntent(restrictedDraft),
  trainabilityRequests: [],
});
assert(restrictedProjection.ok && restrictedProjection.state?.activeRestrictions.length,
  "Restriction report did not immediately affect derived trainability state");

// 6. Back/resume/edit and local draft persistence in the isolated shadow DB.
const navigationId = contracts.parseStableId("athlete", "phase5-navigation");
const navigationStore = makeStore("navigation");
let navigationDraft = newDraft("navigation", navigationId);
navigationDraft = assessment.answerAssessmentStep(navigationDraft, { kind: "safety", severity: "none" }, at(1), bundle);
navigationDraft = assessment.answerAssessmentStep(navigationDraft, { kind: "experience", experience: "some" }, at(2), bundle);
navigationDraft = assessment.answerAssessmentStep(navigationDraft, { kind: "inactivity", inactivity: "active" }, at(3), bundle);
navigationDraft = assessment.answerAssessmentStep(navigationDraft, {
  kind: "goals", graphIds: [definitions.graphIds.planche],
}, at(4), bundle);
await navigationStore.saveAssessmentDraft(navigationDraft);
const resumed = await navigationStore.readAssessmentDraft(navigationId);
assert(resumed && persistence.canonicalJson(resumed) === persistence.canonicalJson(navigationDraft),
  "Assessment draft did not resume exactly");
navigationDraft = assessment.editAssessmentAnswer(
  resumed,
  "goal-selection",
  { kind: "goals", graphIds: [definitions.graphIds.lSitVSit] },
  at(5),
  bundle,
);
assert(assessment.selectedAssessmentGoals(navigationDraft)[0] === definitions.graphIds.lSitVSit,
  "Editing goals did not replace the adaptive branch");
navigationDraft = assessment.answerAssessmentStep(navigationDraft, { kind: "equipment", equipment }, at(6), bundle);
navigationDraft = assessment.goBackAssessment(navigationDraft, at(7), bundle);
assert(assessment.nextAssessmentStep(navigationDraft, bundle).kind === "equipment",
  "Back navigation did not restore the preceding step");
await navigationStore.saveAssessmentDraft(navigationDraft);
navigationStore.close();

// 7. Commit is idempotent, self-assessment remains provisional, and no gate is bypassed.
const commitStore = makeStore("commit");
await commitStore.saveAssessmentDraft(experiencedDraft);
const firstCommit = await assessment.commitAssessment(commitStore, experiencedDraft, bundle);
await assessment.commitAssessment(commitStore, firstCommit.draft, bundle);
const committedDraft = await commitStore.readAssessmentDraft(experiencedId);
const committedSources = await commitStore.readProjectionSources(experiencedId);
assert(committedDraft?.status === "committed", "Committed draft status was not persisted");
assert(committedSources.evidenceEvents.length === firstCommit.evidenceEvents.length,
  "Repeated commit duplicated assessment observations");
assert(committedSources.intent?.goals.length === 3, "Assessment goals did not persist as Athlete Intent");
const provisionalProjection = projection.projectAthleteState({
  athleteId: experiencedId,
  asOf: at(30),
  policy: projection.vNextProjectionPolicyV1,
  definitionBundles: [bundle],
  evidenceEvents: committedSources.evidenceEvents,
  sessionPlans: committedSources.sessionPlans,
  sessionRecords: committedSources.sessionRecords,
  intent: committedSources.intent,
  trainabilityRequests: [],
});
assert(provisionalProjection.ok && provisionalProjection.state, "Committed provisional evidence did not replay");
assert(provisionalProjection.state?.nodeStates.every((node) => node.lifecycle !== "established"),
  "Self-assessment directly awarded an established achievement");
assert(provisionalProjection.state?.capacityFindings.every((finding) => !finding.confirmationSatisfied),
  "Self-assessment bypassed a capacity confirmation policy");
const stateValidation = validation.validateDerivedAthleteState(provisionalProjection.state);
assert(stateValidation.valid, "Phase 5 provisional replay emitted invalid derived state");
await assertRejects(() => Promise.resolve(assessment.editAssessmentAnswer(
  firstCommit.draft,
  "goal-selection",
  { kind: "goals", graphIds: [definitions.graphIds.planche] },
  at(33),
  bundle,
)), /cannot be edited/u, "Committed immutable assessment evidence could be silently edited");

// Guided tests are exact protocol observations and blocked offers cannot be recorded.
const availableOffer = firstCommit.review.guidedTests.find((offer) => offer.availability === "available");
assert(availableOffer, "Assessment review did not expose any safe guided confirmation");
const measurementFor = (protocol) => {
  if (protocol.metric.kind === "duration-seconds") return { value: protocol.metric.minimum, unit: "seconds" };
  if (protocol.metric.kind === "repetitions") return { value: protocol.metric.minimum, unit: "repetitions" };
  if (protocol.metric.kind === "successful-attempts") return {
    value: protocol.metric.minimumSuccessful,
    unit: "attempts",
    attemptsTotal: protocol.metric.maximumAttempts,
  };
  return undefined;
};
if (availableOffer) {
  const protocol = protocolById.get(availableOffer.protocolId);
  const presentation = assessment.guidedTestPresentation(availableOffer, bundle);
  assert(presentation.exercise.media && presentation.qualityCriteria.length,
    "Guided test presentation lost exercise media/instruction hooks or benchmark criteria");
  if (["duration-seconds", "repetitions", "successful-attempts"].includes(protocol.metric.kind)) {
    const failingMeasurement = protocol.metric.kind === "duration-seconds"
      ? { value: Math.max(0, protocol.metric.minimum - 1), unit: "seconds" }
      : protocol.metric.kind === "repetitions"
        ? { value: Math.max(0, protocol.metric.minimum - 1), unit: "repetitions" }
        : { value: Math.max(0, protocol.metric.minimumSuccessful - 1), unit: "attempts", attemptsTotal: protocol.metric.maximumAttempts };
    await assertRejects(() => Promise.resolve(assessment.createGuidedTestEvidence(firstCommit.draft, bundle, provisionalProjection.state, {
      eventId: "phase5-guided-below-metric",
      observationSessionId: "phase5-guided-below-metric-occasion",
      occurredAt: at(30),
      recordedAt: at(30),
      protocolId: protocol.id,
      outcome: "clean",
      measurement: failingMeasurement,
      qualityCriteriaSatisfied: true,
      safetyCriteriaSatisfied: true,
    })), /exact metric/u, "A below-protocol result was recorded as a clean guided confirmation");
  }
  const event = assessment.createGuidedTestEvidence(firstCommit.draft, bundle, provisionalProjection.state, {
    eventId: "phase5-guided-confirmation",
    observationSessionId: "phase5-guided-occasion",
    occurredAt: at(31),
    recordedAt: at(31),
    protocolId: protocol.id,
    outcome: "clean",
    measurement: measurementFor(protocol),
    qualityCriteriaSatisfied: true,
    safetyCriteriaSatisfied: true,
  });
  await assessment.persistGuidedTestEvidence(commitStore, event);
  assert(event.source === "guided-test" && event.benchmarkProtocolId === protocol.id,
    "Guided test lost exact protocol provenance");
}
const blockedOffer = firstCommit.review.guidedTests.find((offer) => offer.availability === "blocked");
if (blockedOffer) {
  const protocol = protocolById.get(blockedOffer.protocolId);
  await assertRejects(() => Promise.resolve(assessment.createGuidedTestEvidence(firstCommit.draft, bundle, provisionalProjection.state, {
    eventId: "phase5-blocked-guided",
    observationSessionId: "phase5-blocked-occasion",
    occurredAt: at(32),
    recordedAt: at(32),
    protocolId: protocol.id,
    outcome: "clean",
    measurement: measurementFor(protocol),
    qualityCriteriaSatisfied: true,
    safetyCriteriaSatisfied: true,
  })), /blocked/u, "A blocked guided test bypassed readiness");
}

// 8. Existing athlete: stale evidence produces only targeted reconfirmation, not onboarding.
const plancheProtocol = protocolById.get(definitions.milestoneBenchmarkId("planche", "controlled-planche-lean"));
const existingIntent = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId: contracts.parseStableId("athlete", "phase5-existing"),
  updatedAt: "2026-01-01T00:00:00.000Z",
  goals: [{ graphId: definitions.graphIds.planche, priority: "primary" }],
  equipment,
  defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false },
};
const guided = (id, date, occasion) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("event", id),
  athleteId: existingIntent.athleteId,
  occurredAt: date,
  recordedAt: date,
  source: "guided-test",
  catalogueVersion: bundle.catalogueVersion,
  type: "performance_observed",
  subject: plancheProtocol.subject,
  outcome: "clean",
  benchmarkProtocolId: plancheProtocol.id,
  benchmarkProtocolVersion: plancheProtocol.definitionVersion,
  observationSessionId: contracts.parseStableId("observation-session", occasion),
  measurement: { value: 20, unit: "seconds" },
  assistance: plancheProtocol.conditions.assistance,
  range: plancheProtocol.conditions.range,
});
const existingProjection = projection.projectAthleteState({
  athleteId: existingIntent.athleteId,
  asOf: "2026-05-01T09:00:00.000Z",
  policy: projection.vNextProjectionPolicyV1,
  definitionBundles: [bundle],
  evidenceEvents: [
    guided("phase5-existing-proof-one", "2026-01-01T09:00:00.000Z", "phase5-existing-occasion-one"),
    guided("phase5-existing-proof-two", "2026-01-03T09:00:00.000Z", "phase5-existing-occasion-two"),
  ],
  sessionPlans: [],
  sessionRecords: [],
  intent: existingIntent,
  trainabilityRequests: [],
});
assert(existingProjection.ok && existingProjection.state, "Existing-user fixture projection failed");
let targetedDraft = assessment.createAssessmentDraft({
  id: "phase5-targeted-existing",
  athleteId: existingIntent.athleteId,
  createdAt: at(0),
  bundle,
  existingIntent,
  existingState: existingProjection.state,
});
targetedDraft = assessment.answerAssessmentStep(targetedDraft, { kind: "safety", severity: "none" }, at(1), bundle);
const targetedReview = assessment.buildAssessmentReview(targetedDraft, bundle, existingProjection.state);
assert(targetedReview.mode === "targeted-reconfirmation" && targetedReview.promptCount === 1,
  "Existing athlete was forced through full onboarding");
assert(targetedReview.guidedTests.some((test) => test.protocolId === plancheProtocol.id
  && test.reason === "reconfirm-existing"), "Stale existing evidence did not target its exact protocol");
assert(targetedReview.guidedTests.some((test) => test.protocolId === plancheProtocol.id
  && test.availability === "available"), "An established stale outcome could not be directly reconfirmed");

// 9. Minimal post-workout review: only meaningful items ask questions and one Session Record owns facts.
const floorPushProtocol = protocolById.get(definitions.milestoneBenchmarkId("parallette-pushing", "floor-push-up"));
const floorPushExercise = bundle.exercises.find((exercise) => exercise.id === floorPushProtocol.exerciseId);
const floorPushVariant = floorPushExercise.prescriptionVariants.find((variant) =>
  variant.id === floorPushProtocol.prescriptionVariantId);
const plan = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: contracts.parseStableId("session-plan", "phase5-review-plan"),
  athleteId: experiencedId,
  createdAt: at(40),
  catalogueVersion: bundle.catalogueVersion,
  generatorPolicyId: contracts.parseStableId("policy", "phase5-isolated-fixture"),
  generatorPolicyVersion: contracts.parseDefinitionVersion(1),
  definitionReferences: [
    { kind: "exercise", id: floorPushExercise.id, version: floorPushExercise.definitionVersion },
    { kind: "graph", id: floorPushProtocol.subject.milestone.graphId, version: floorPushProtocol.definitionVersion },
    { kind: "benchmark", id: floorPushProtocol.id, version: floorPushProtocol.definitionVersion },
    { kind: "policy", id: "phase5-isolated-fixture", version: contracts.parseDefinitionVersion(1) },
  ],
  intendedDurationSeconds: 300,
  items: [
    {
      id: contracts.parseStableId("plan-item", "phase5-review-preparation"),
      exerciseId: floorPushExercise.id,
      exerciseDefinitionVersion: floorPushExercise.definitionVersion,
      prescriptionVariantId: floorPushVariant.id,
      purpose: "preparation",
      plannedSeconds: 60,
      demand: floorPushVariant.demand,
    },
    {
      id: contracts.parseStableId("plan-item", "phase5-review-primary"),
      exerciseId: floorPushExercise.id,
      exerciseDefinitionVersion: floorPushExercise.definitionVersion,
      prescriptionVariantId: floorPushVariant.id,
      benchmarkProtocolId: floorPushProtocol.id,
      benchmarkProtocolVersion: floorPushProtocol.definitionVersion,
      purpose: "primary-development",
      plannedSeconds: 180,
      targetMilestone: floorPushProtocol.subject.milestone,
      demand: floorPushVariant.demand,
    },
    {
      id: contracts.parseStableId("plan-item", "phase5-review-recovery"),
      exerciseId: floorPushExercise.id,
      exerciseDefinitionVersion: floorPushExercise.definitionVersion,
      prescriptionVariantId: floorPushVariant.id,
      purpose: "recovery",
      plannedSeconds: 60,
      demand: floorPushVariant.demand,
    },
  ],
  rationale: [],
};
const prompts = assessment.workoutReviewPrompts(plan);
assert(prompts.length === 1 && prompts[0].planItemId === plan.items[1].id,
  "Workout completion asked about preparation or recovery filler");
const record = assessment.createSessionRecordFromWorkoutReview(plan, bundle, {
  recordId: "phase5-review-record",
  startedAt: at(40),
  completedAt: at(45),
  recordedAt: at(45),
  status: "complete",
  itemOutcomes: [
    {
      planItemId: plan.items[0].id,
      status: "completed",
      participationSeconds: 60,
      performedExerciseId: floorPushExercise.id,
      performedExerciseDefinitionVersion: floorPushExercise.definitionVersion,
      performedPrescriptionVariantId: floorPushVariant.id,
    },
    {
      planItemId: plan.items[1].id,
      status: "completed",
      participationSeconds: 180,
      performedExerciseId: floorPushExercise.id,
      performedExerciseDefinitionVersion: floorPushExercise.definitionVersion,
      performedPrescriptionVariantId: floorPushVariant.id,
      benchmarkObservation: {
        subject: floorPushProtocol.subject,
        benchmarkProtocolId: floorPushProtocol.id,
        benchmarkProtocolVersion: floorPushProtocol.definitionVersion,
        outcome: "clean",
        measurement: { value: 8, unit: "repetitions" },
        assistance: floorPushProtocol.conditions.assistance,
        range: floorPushProtocol.conditions.range,
      },
      review: { outcome: "clean", difficulty: "right", symptomOrInstability: false },
    },
    {
      planItemId: plan.items[2].id,
      status: "completed",
      participationSeconds: 60,
      performedExerciseId: floorPushExercise.id,
      performedExerciseDefinitionVersion: floorPushExercise.definitionVersion,
      performedPrescriptionVariantId: floorPushVariant.id,
    },
  ],
});
await assessment.persistWorkoutReview(commitStore, plan, record);
const afterReview = await commitStore.readProjectionSources(experiencedId);
assert(afterReview.sessionRecords.filter((item) => item.id === record.id).length === 1,
  "Workout evidence did not persist as exactly one Session Record");
assert(!afterReview.evidenceEvents.some((event) => event.id.includes("phase5-review")),
  "Workout review duplicated Session Record truth as an Evidence Event");
commitStore.close();

if (failures.length) {
  console.error(`vNext Phase 5 validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`vNext Phase 5: beginner ${beginnerReview.promptCount} prompts/${beginnerReview.estimatedMinutes} min; experienced ${experiencedReview.promptCount} prompts/${experiencedReview.estimatedMinutes} min; adaptive, targeted, restriction, persistence, no-bypass and minimal-review scenarios passed.`);
}
