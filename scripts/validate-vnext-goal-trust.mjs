import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";
import { validateShadowSessionPlan } from "../profile-api/vnext-session-validation.js";

// Goal-trust planning (review batch 1): declared main goal leads, emphasis
// reviews conclude, blocked stale nodes fall back within their family, and
// reduced doses name their real cause. Synthetic athletes only.
const { goalTrustCatalogue: catalogue } = load("app/vnext/production/goalTrust.ts");
const { projectAthleteState } = load("app/vnext/projection/index.ts");
const { createGuidedProtocolEvidence, guidedObservationOccasionId, createRestrictionReport,
  createSessionRecordFromWorkoutReview } = load("app/vnext/assessment/index.ts");
const generators = load("app/vnext/planning/feedbackDose.ts");
const { vNextGeneratorPolicy, planningReasonCodes, GOAL_TRUST_PLANNING_POLICY_ID } = load("app/vnext/planning/policy.ts");
const { hasMeaningfulEmphasisTraining } = load("app/vnext/releaseCandidate/emphasisCompletion.ts");
const { isMixedWorkoutPlan } = load("app/vnext/mixedWorkout.ts");
const { validateSessionPlan } = load("app/vnext/validation.ts");
const { buildTodayWorkoutPresentation } = load("app/vnext/presentation/today.ts");
const { vNextReleaseCandidateManifest } = load("app/vnext/releaseCandidate/manifest.ts");
const { isStableId } = load("app/vnext/contracts.ts");

const bundle = catalogue.bundle;
const policy = catalogue.projectionPolicy;
const start = Date.parse("2026-10-22T09:00:00.000Z");
const day = 86_400_000;
const iso = (time) => new Date(time).toISOString();
let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${label}`); };

const protocolFor = (graphId, nodeId) => bundle.benchmarkProtocols.find((protocol) => protocol.subject.kind === "milestone"
  && protocol.subject.milestone.graphId === graphId && protocol.subject.milestone.nodeId === nodeId);
const evidenceFor = (athleteId, protocols, ageDays) => protocols.flatMap((protocol) => {
  const count = Math.max(protocol.confirmation.qualifyingObservations, protocol.confirmation.minimumDistinctSessions);
  return Array.from({ length: count }, (_, index) => {
    const at = iso(start - (ageDays + count - index) * day);
    const metric = protocol.metric;
    const measurement = metric.kind === "duration-seconds" ? { value: metric.minimum, unit: "seconds" }
      : metric.kind === "repetitions" ? { value: metric.minimum, unit: "repetitions" }
        : metric.kind === "successful-attempts" ? { value: metric.minimumSuccessful, unit: "attempts", attemptsTotal: metric.maximumAttempts }
          : undefined;
    return createGuidedProtocolEvidence(athleteId, bundle, { eventId: `${athleteId}-${protocol.id}-${index}`, protocolId: protocol.id,
      observationSessionId: guidedObservationOccasionId(athleteId, at), occurredAt: at, recordedAt: at,
      outcome: "clean", qualityCriteriaSatisfied: true, safetyCriteriaSatisfied: true, ...(measurement ? { measurement } : {}) });
  });
});
const intentFor = (athleteId, goals, asOf) => ({ schemaVersion: 1, athleteId, updatedAt: asOf, goals,
  equipment: ["floor", "parallettes", "wall"], defaultSessionDemand: "standard", preferences: { specialistOptIn: false } });
const project = (athleteId, intent, asOf, events, records = [], plans = []) => {
  const projected = projectAthleteState({ athleteId, asOf, intent, policy, definitionBundles: catalogue.history,
    evidenceEvents: events, sessionRecords: records, sessionPlans: plans });
  assert(projected.ok, JSON.stringify(projected.issues));
  return projected.state;
};
const inputFor = (athleteId, goals, asOf, events, extra = {}) => {
  const intent = intentFor(athleteId, goals, asOf);
  return { createdAt: asOf, bundle, intent, state: project(athleteId, intent, asOf, events, extra.records, extra.plans),
    projectionPolicy: policy, sessionDemand: "standard", seed: `${athleteId}:${asOf.slice(0, 10)}`,
    ...(extra.previousEmphasis ? { previousEmphasis: extra.previousEmphasis } : {}) };
};

// Production advisory counter helpers, transpiled from the actual app source.
const appSource = readFileSync(new URL("../app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx", import.meta.url), "utf8");
const appTree = ts.createSourceFile("app.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statement = (name) => {
  let found;
  const visit = (node) => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(appTree) === name)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(appTree);
  assert(found, `Production continuity helper ${name} exists`);
  return found.getText(appTree);
};
const memory = new Map();
const bindings = {
  localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
  storageKeyPrefix: (namespace, key) => `${namespace}:${key}:`,
  vNextReleaseCandidateManifest, isStableId, isMixedWorkoutPlan, hasMeaningfulEmphasisTraining,
};
const helperCode = ts.transpileModule(`${statement("readPreviousEmphasis")}\n${statement("rememberCompletedEmphasis")}
  return { readPreviousEmphasis, rememberCompletedEmphasis };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { readPreviousEmphasis, rememberCompletedEmphasis } = new Function(...Object.keys(bindings), helperCode)(...Object.values(bindings));

/** Train every `every` days, completing the whole plan, using the real advisory counter helpers. */
const simulate = ({ id, goals, events, days, every, generate = generators.generateGoalTrustSessionPlan }) => {
  const records = [], plans = [], sessions = [];
  const namespace = `goal-trust-${id}`;
  for (let offset = 0; offset < days; offset += every) {
    const asOf = iso(start + offset * day);
    const previousEmphasis = readPreviousEmphasis(id, namespace);
    const input = inputFor(id, goals, asOf, events, { records, plans, previousEmphasis });
    const generated = generate(input);
    assert(generated.ok && generated.plan && generated.emphasis, `${id} day ${offset}: ${JSON.stringify(generated.issues)}`);
    const completedAt = iso(Date.parse(asOf) + generated.plan.intendedDurationSeconds * 1000 + 60_000);
    const record = createSessionRecordFromWorkoutReview(generated.plan, bundle, { recordId: `${id}-record-${offset}`,
      startedAt: asOf, completedAt, recordedAt: completedAt, status: "complete",
      itemOutcomes: generated.plan.items.map((item) => ({ planItemId: item.id, status: "completed",
        participationSeconds: item.plannedSeconds, participationBasis: "measured", performedExerciseId: item.exerciseId,
        performedExerciseDefinitionVersion: item.exerciseDefinitionVersion, performedPrescriptionVariantId: item.prescriptionVariantId,
        ...(["preparation", "recovery"].includes(item.purpose) ? {} : { review: { outcome: "clean", difficulty: "right" } }) })) });
    records.push(record); plans.push(generated.plan);
    rememberCompletedEmphasis(id, generated, { plan: generated.plan, record }, namespace, bundle);
    sessions.push({ offset, primary: generated.emphasis.primary.graphId, reasons: generated.emphasis.reasonCodes,
      reviewDecision: generated.emphasis.reviewDecision, counter: previousEmphasis?.completedEligibleSessions ?? 0,
      storedAfter: readPreviousEmphasis(id, namespace)?.completedEligibleSessions });
  }
  return sessions;
};
const atLeastTwoOfThree = (sessions, graphId) => sessions.every((_, index) => index + 3 > sessions.length
  || sessions.slice(index, index + 3).filter((session) => session.primary === graphId).length >= 2);

const plancheEvidence = (id) => evidenceFor(id, [
  ...["controlled-planche-lean", "toe-light-planche-loading", "foot-assisted-tuck-planche"].map((node) => protocolFor("planche", node)),
  ...["knee-push-up", "floor-push-up"].map((node) => protocolFor("parallette-pushing", node)),
  ...["foot-assisted-l-sit", "tuck-support"].map((node) => protocolFor("l-sit-v-sit", node)),
].filter(Boolean), 30);
const handstandProtocols = ["grounded-side-exit", "low-inversion-side-exit", "supported-inversion-tolerance", "wall-height-side-exit"]
  .map((node) => protocolFor("handstand-balance", node)).filter(Boolean);
const handstandEvidence = (id, age = 10) => evidenceFor(id, [...handstandProtocols,
  ...["knee-push-up", "floor-push-up"].map((node) => protocolFor("parallette-pushing", node)).filter(Boolean)], age);
const planche = [{ graphId: "planche", priority: "primary" }, { graphId: "l-sit-v-sit", priority: "secondary" }];

// C1: a high-demand main goal leads at 48- and 72-hour cadences.
for (const every of [2, 3]) {
  const sessions = simulate({ id: `planche-${every}`, goals: planche, events: plancheEvidence(`planche-${every}`), days: 30, every });
  assert(atLeastTwoOfThree(sessions, "planche"), `Planche primary sequence every ${every} days: ${sessions.map((s) => s.primary).join(",")}`);
  pass(`C1 Planche main goal leads ≥2 of every 3 sessions training every ${every} days (${sessions.filter((s) => s.primary === "planche").length}/${sessions.length})`);
}
const pushing = [{ graphId: "parallette-pushing", priority: "primary" }, { graphId: "handstand-balance", priority: "secondary" }];
const pushingSessions = simulate({ id: "pushing-2", goals: pushing, events: handstandEvidence("pushing-2"), days: 30, every: 2 });
assert(atLeastTwoOfThree(pushingSessions, "parallette-pushing"), pushingSessions.map((s) => s.primary).join(","));
pass(`C1 high-demand Pushing main goal leads ≥2 of every 3 sessions (${pushingSessions.filter((s) => s.primary === "parallette-pushing").length}/${pushingSessions.length})`);

// Daily training may defer once for recovery, never twice in a row.
const daily = simulate({ id: "planche-daily", goals: planche, events: plancheEvidence("planche-daily"), days: 14, every: 1 });
assert(daily.every((session, index) => index === 0 || session.primary === "planche" || daily[index - 1].primary === "planche"),
  daily.map((s) => s.primary).join(","));
assert(daily.some((session) => session.reasons.includes(planningReasonCodes.deferredRecentLoad)));
pass(`C1 daily training defers the main goal at most once in a row (${daily.filter((s) => s.primary === "planche").length}/${daily.length})`);

// C2: the review concludes and re-baselines; unchanged state keeps the same primary.
const handstand = [{ graphId: "handstand-balance", priority: "primary" }, { graphId: "parallette-pushing", priority: "secondary" }];
for (const [label, goals, graphId, id] of [["Handstand", handstand, "handstand-balance", "review-hs"], ["Pushing", pushing, "parallette-pushing", "review-push"]]) {
  const sessions = simulate({ id, goals, events: handstandEvidence(id), days: 40, every: 2 });
  const reviews = sessions.filter((session) => session.reasons.includes(planningReasonCodes.emphasisReviewDue));
  assert(reviews.length >= 1 && reviews.length <= 3, `${label} reviews ${reviews.map((s) => s.offset)}`);
  assert(reviews.every((session) => session.counter === vNextGeneratorPolicy.emphasisReviewMinimumSessions && session.reviewDecision !== "none"
    && session.storedAfter === 1), JSON.stringify(reviews));
  assert(sessions.every((session) => session.counter <= vNextGeneratorPolicy.emphasisReviewMinimumSessions));
  assert(sessions.filter((session) => !session.reasons.includes(planningReasonCodes.emphasisReviewDue)).every((session) => session.reviewDecision === "none"));
  const primaries = new Set(sessions.slice(8).map((session) => session.primary));
  if (label === "Handstand") assert.deepEqual([...primaries], [graphId], sessions.map((s) => s.primary).join(","));
  else assert(atLeastTwoOfThree(sessions.slice(8), graphId), sessions.map((s) => s.primary).join(","));
  pass(`C2 ${label}: review due exactly once per 8-session sample, re-baselines to 1, primary stays on the main goal`);
}

// Native generator 6 is unchanged: no review decision, its permanent review flag behaviour is kept for replay.
const native = simulate({ id: "native-review", goals: handstand, events: handstandEvidence("native-review"), days: 24, every: 2,
  generate: generators.generateUsefulDoseSessionPlan });
assert(native.every((session) => session.reviewDecision === undefined));
assert(native.slice(9).every((session) => session.reasons.includes(planningReasonCodes.emphasisReviewDue)));
pass("Native generator 6 replay keeps its original emphasis semantics and output shape");

// C4: a stale main goal is re-checked instead of silently replaced.
for (const goals of [handstand, [{ graphId: "handstand-balance", priority: "primary" }]]) {
  const id = `stale-${goals.length}`;
  const input = inputFor(id, goals, iso(start), evidenceFor(id, handstandProtocols, 120));
  const generated = generators.generateGoalTrustSessionPlan(input);
  assert(generated.ok && generated.emphasis);
  const today = buildTodayWorkoutPresentation({ generated, bundle });
  const leads = generated.emphasis.primary.graphId === "handstand-balance";
  // The earliest stale exit has no out-of-date prerequisite, so it is reconfirmed first.
  assert(leads && generated.emphasis.primary.kind === "reconfirmation"
    && generated.emphasis.primary.targetMilestone?.nodeId === "grounded-side-exit",
  JSON.stringify({ primary: generated.emphasis.primary, reasons: generated.emphasis.reasonCodes, notice: today.goalNotice }));
  assert(generated.plan.items.some((item) => item.targetMilestone?.nodeId === "grounded-side-exit"));
  assert.equal(today.goalNotice, undefined);
  const nativeGenerated = generators.generateUsefulDoseSessionPlan(input);
  pass(`C4 stale Handstand main goal (${goals.length} goal${goals.length > 1 ? "s" : ""}): ${leads
    ? `leads with ${generated.emphasis.primary.kind} of ${generated.emphasis.primary.targetMilestone?.nodeId}` : "Today explains the re-check"}`
    + ` (native generator 6: ${nativeGenerated.emphasis?.primary.graphId}/${nativeGenerated.emphasis?.primary.targetMilestone?.nodeId})`);
}

// C4: when the main goal cannot lead at all, Today says so plainly.
{
  const id = "planche-block";
  const events = [...plancheEvidence(id), createRestrictionReport({ eventId: "planche-block-report", athleteId: id,
    occurredAt: iso(start - day), recordedAt: iso(start - day), catalogueVersion: bundle.catalogueVersion,
    severity: "block", demandDomains: ["forward-straight-arm-upper-limb"], bodyRegions: ["shoulder"] })];
  const input = inputFor(id, planche, iso(start), events);
  const generated = generators.generateGoalTrustSessionPlan(input);
  assert(generated.ok && generated.emphasis, JSON.stringify(generated.issues));
  assert.notEqual(generated.emphasis.primary.graphId, "planche");
  const today = buildTodayWorkoutPresentation({ generated, bundle });
  assert(generated.emphasis.reasonCodes.includes(planningReasonCodes.mainGoalUnavailable), JSON.stringify(generated.emphasis.reasonCodes));
  assert(today.goalNotice?.startsWith("Your main goal, Planche, can’t lead today’s workout"), today.goalNotice);
  assert.equal(buildTodayWorkoutPresentation({ generated: generators.generateUsefulDoseSessionPlan(input), bundle }).goalNotice, undefined);
  pass(`C4 a blocked main goal is explained on Today: "${today.goalNotice}"`);
  // Resting the main goal after yesterday's session is a deferral, never an "unavailable" notice.
  const restDay = daily.find((session) => session.primary !== "planche");
  assert(restDay && restDay.reasons.includes(planningReasonCodes.deferredRecentLoad)
    && !restDay.reasons.includes(planningReasonCodes.mainGoalUnavailable));
  pass("C4 a recovery day after training the main goal is a deferral, not a main-goal warning");
}

// C9: a dose reduced by a restriction says so.
{
  const id = "wrist-modify";
  const events = [...handstandEvidence(id, 3), createRestrictionReport({ eventId: "wrist-modify-report", athleteId: id,
    occurredAt: iso(start - day), recordedAt: iso(start - day), catalogueVersion: bundle.catalogueVersion,
    severity: "modify", demandDomains: ["hand-wrist-bearing"], bodyRegions: ["wrist"] })];
  const input = inputFor(id, [{ graphId: "handstand-balance", priority: "primary" }], iso(start), events);
  const generated = generators.generateGoalTrustSessionPlan(input);
  assert(generated.ok && generated.plan);
  const reduced = generated.itemExplanations.filter((entry) => entry.whyIntensity.includes("calls for less work"));
  assert(reduced.length, "The restriction scenario reduces at least one development item");
  assert(reduced.every((entry) => entry.whyIntensity.startsWith("A current restriction calls for less work")), JSON.stringify(reduced.map((e) => e.whyIntensity)));
  assert(generated.durationException?.message.includes("restriction") && !generated.durationException.message.includes("feedback"),
    generated.durationException?.message);
  const nativeGenerated = generators.generateUsefulDoseSessionPlan(input);
  assert(nativeGenerated.itemExplanations.some((entry) => entry.whyIntensity.startsWith("Current feedback calls for less work")));
  pass(`C9 restriction reduction names its cause: "${generated.durationException.message}"`);
}

// Compatibility: generator-6 execution identity, one extra planning reference, valid on client and Worker.
{
  const input = inputFor("compatibility", planche, iso(start), plancheEvidence("compatibility"));
  const trusted = generators.generateGoalTrustSessionPlan(input);
  const native6 = generators.generateUsefulDoseSessionPlan(input);
  assert(trusted.ok && trusted.plan && native6.ok && native6.plan);
  assert.equal(trusted.plan.generatorPolicyVersion, 6);
  assert.equal(trusted.plan.generatorPolicyId, native6.plan.generatorPolicyId);
  assert(isMixedWorkoutPlan(trusted.plan));
  assert(trusted.plan.definitionReferences.some((reference) => reference.kind === "policy" && reference.id === GOAL_TRUST_PLANNING_POLICY_ID && reference.version === 1));
  assert(!native6.plan.definitionReferences.some((reference) => reference.id === GOAL_TRUST_PLANNING_POLICY_ID));
  assert.notEqual(trusted.plan.id, native6.plan.id);
  assert(validateSessionPlan(trusted.plan).valid, JSON.stringify(validateSessionPlan(trusted.plan).issues));
  assert.equal(validateShadowSessionPlan(trusted.plan, trusted.plan.id, "compatibility"), null);
  assert.equal(generators.generateGoalTrustSessionPlan(input).plan.id, trusted.plan.id, "Goal-trust plans are deterministic");
  for (const minutes of [5, 10, 15, 20]) {
    const custom = generators.generateGoalTrustCustomPlan(input, minutes);
    assert(custom.ok && custom.plan && custom.plan.intendedDurationSeconds <= minutes * 60);
    assert(validateSessionPlan(custom.plan).valid, JSON.stringify(validateSessionPlan(custom.plan).issues));
    assert.equal(validateShadowSessionPlan(custom.plan, custom.plan.id, "compatibility"), null);
  }
  pass("Goal-trust plans keep generator-6 execution, add one planning reference and validate on client and Worker");
}

console.log(`Goal-trust planning: ${checks} focused checks passed.`);
