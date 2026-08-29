import { readFileSync, readdirSync } from "node:fs";
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
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const presentation = loadTypeScriptModule("app/vnext/presentation/index.ts");

const bundle = definitions.vNextDefinitionBundle;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const asOf = "2026-08-24T09:00:00.000Z";
const reason = (value) => contracts.parseStableId("reason", value);
const equipment = ["floor", "parallettes", "wall"].map((id) =>
  contracts.parseStableId("equipment", id));
const milestone = (graphId, node) => ({ graphId, nodeId: definitions.nodeId(node) });
const source = (id) => ({
  kind: "evidence-event",
  eventId: contracts.parseStableId("event", id),
});

const intentFor = (athleteId, goals = []) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId,
  updatedAt: asOf,
  goals,
  equipment,
  defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false },
});

const stateFor = (athleteId, overrides = {}) => ({
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId,
  projectionVersion: projection.VNEXT_PROJECTION_VERSION,
  asOf,
  observationCursors: {},
  nodeStates: [],
  capacityFindings: [],
  activeRestrictions: [],
  reconfirmationRequirements: [],
  recentLoad: {
    from: "2026-08-17T09:00:00.000Z",
    to: asOf,
    demand: {},
    exposures: [],
  },
  workingNodes: [],
  maintenanceNeeds: [],
  eligibleTargets: [],
  trainabilityEvaluations: [],
  ...overrides,
});

const nodeState = (target, lifecycle, confidence, supportingObservationRefs = []) => ({
  milestone: target,
  lifecycle,
  confidence,
  satisfiedForEligibilityBy: [],
  supportingObservationRefs,
  reasonCodes: [reason(`phase8-${lifecycle}`)],
});

const family = (progress, graphId) => progress.families.find((item) => item.graphId === graphId);
const allText = (value, result = []) => {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allText(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => allText(item, result));
  return result;
};
const readTextOrEmpty = (path) => {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
};
const assertPlainAthleteCopy = (value, label) => {
  const text = allText(value).join("\n");
  assert(!/(?:\b(?:readiness|capacity|fatigue) score\b|\bglobal level\b|\bL[123]\b|\d+(?:\.\d+)?%)/i.test(text),
    `${label} exposed a hidden score, percentage or global level`);
  assert(!/\b(?:prerequisite-missing|eligible-frontier|trainability-allowed|recent-high-load|specialist-opt-in-required)\b/.test(text),
    `${label} exposed a raw algorithm reason code`);
};

const graphNode = (target) => bundle.graphs
  .find((graph) => graph.id === target.graphId)
  ?.nodes.find((node) => node.id === target.nodeId);
const exerciseForMilestone = (target) => {
  const exercise = bundle.exercises.find((candidate) => candidate.graphLinks.some((link) =>
    link.graphId === target.graphId && link.nodeId === target.nodeId));
  if (!exercise) throw new TypeError(`Missing fixture exercise for ${target.graphId}:${target.nodeId}`);
  const variant = exercise.prescriptionVariants.find((candidate) => candidate.id.endsWith("-standard"))
    ?? exercise.prescriptionVariants[0];
  if (!variant) throw new TypeError(`Missing fixture prescription for ${exercise.id}`);
  return { exercise, variant };
};

const generatedFixture = (athleteId) => {
  const primaryTarget = milestone(definitions.graphIds.planche, "assisted-one-leg-planche");
  const secondaryTarget = milestone(definitions.graphIds.lSitVSit, "high-l-sit");
  const maintenanceTarget = milestone(definitions.graphIds.parallettePushing, "controlled-parallette-push-up");
  const itemSpecs = [
    { key: "primary", target: primaryTarget, purpose: "primary-development", seconds: 720, block: "primary" },
    { key: "secondary", target: secondaryTarget, purpose: "secondary-development", seconds: 480, block: "secondary" },
    { key: "maintenance", target: maintenanceTarget, purpose: "maintenance", seconds: 300, block: "maintenance" },
  ];
  const items = itemSpecs.map((spec) => {
    const { exercise, variant } = exerciseForMilestone(spec.target);
    return {
      id: contracts.parseStableId("plan-item", `phase8-${spec.key}`),
      exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: variant.id,
      purpose: spec.purpose,
      plannedSeconds: spec.seconds,
      targetMilestone: spec.target,
      demand: variant.demand,
    };
  });
  const itemExplanations = itemSpecs.map((spec, index) => ({
    planItemId: items[index].id,
    block: spec.block,
    reasonCodes: [reason(`phase8-${spec.key}-reason`)],
    whySkill: `${graphNode(spec.target)?.label ?? "This step"} serves the selected goal.`,
    whyExercise: "The selected movement directly supports this step.",
    whyIntensity: "The current evidence supports this workload.",
  }));
  const focus = (graphId, targetMilestone, kind, message) => ({
    graphId,
    targetMilestone,
    kind,
    missingPrerequisites: [],
    reasonCodes: [reason("phase8-fixture-focus")],
    userMessage: message,
  });
  const emphasis = {
    primary: focus(definitions.graphIds.planche, primaryTarget, "development",
      "Planche is your current priority and has a safe next step."),
    secondary: focus(definitions.graphIds.lSitVSit, secondaryTarget, "development",
      "L-sit work is compatible with today’s primary focus."),
    maintenance: [focus(definitions.graphIds.parallettePushing, maintenanceTarget, "maintenance",
      "A small pushing dose keeps this demonstrated work available.")],
    deferredGraphIds: [],
    goalSignature: "phase8-mixed-goals",
    retainedFromPrevious: false,
    reasonCodes: [reason("phase8-fixture-emphasis")],
  };
  return {
    ok: true,
    generatorPolicyId: planning.vNextGeneratorPolicy.id,
    generatorPolicyVersion: planning.vNextGeneratorPolicy.version,
    projectionVersion: projection.VNEXT_PROJECTION_VERSION,
    sessionDemand: "standard",
    emphasis,
    plan: {
      schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
      id: contracts.parseStableId("session-plan", "phase8-explainable-plan"),
      athleteId,
      createdAt: asOf,
      catalogueVersion: bundle.catalogueVersion,
      generatorPolicyId: planning.vNextGeneratorPolicy.id,
      generatorPolicyVersion: planning.vNextGeneratorPolicy.version,
      definitionReferences: [],
      intendedDurationSeconds: 1_500,
      items,
      rationale: [{
        code: reason("phase8-fixture-rationale"),
        message: "Planche is the safest actionable priority today.",
        relatedGraphId: definitions.graphIds.planche,
      }],
    },
    itemExplanations,
    trainabilityUsed: items.map((item) => ({
      exerciseId: item.exerciseId,
      exerciseDefinitionVersion: item.exerciseDefinitionVersion,
      prescriptionVariantId: item.prescriptionVariantId,
      decision: "allow",
      reasonCodes: [reason("phase8-fixture-allowed")],
    })),
    coverageGaps: [],
    issues: [],
  };
};

// 1. New athlete: all seven families are understandable without invented state.
const newAthleteId = contracts.parseStableId("athlete", "phase8-new-athlete");
const newIntent = intentFor(newAthleteId, [{
  graphId: definitions.graphIds.planche,
  priority: "primary",
}]);
const newState = stateFor(newAthleteId);
const newProgress = presentation.buildProgressAndGoals({
  bundle,
  state: newState,
  intent: newIntent,
});
assert(newProgress.title === "Progress & Goals", "New athlete did not receive Progress & Goals");
assert(newProgress.families.length === 7, `Progress & Goals should show seven families; saw ${newProgress.families.length}`);
assert(newProgress.families.map((item) => item.graphId).join("|")
  === presentation.presentationFamilyOrder.join("|"), "Progress families are incomplete or out of canonical order");
assert(newProgress.families.every((item) => item.demonstratedState.kind === "none"),
  "New athlete was shown an invented demonstrated or provisional state");
assert(newProgress.canManuallyClaimSkills === false && newProgress.exposesInternalScores === false,
  "New Progress & Goals exposes a manual claim or internal score authority");

// Missing prerequisites are an ordinary progression gate, not an athlete
// restriction. The full runtime projects blocked exercise requests during
// placement, so keep this distinction locked at the presentation boundary.
const newPlancheTarget = family(newProgress, definitions.graphIds.planche)?.nextTarget?.milestone;
const newPlancheExercise = newPlancheTarget ? exerciseForMilestone(newPlancheTarget) : undefined;
const prerequisiteBlockedState = stateFor(newAthleteId, {
  trainabilityEvaluations: newPlancheExercise ? [{
    exerciseId: newPlancheExercise.exercise.id,
    exerciseDefinitionVersion: newPlancheExercise.exercise.definitionVersion,
    prescriptionVariantId: newPlancheExercise.variant.id,
    decision: "block",
    reasonCodes: [projection.projectionReasonCodes.prerequisiteMissing],
  }] : [],
});
const prerequisiteBlockedProgress = presentation.buildProgressAndGoals({
  bundle,
  state: prerequisiteBlockedState,
  intent: newIntent,
});
assert(family(prerequisiteBlockedProgress, definitions.graphIds.planche)?.availability.state !== "restricted",
  "A missing prerequisite was presented as an active athlete restriction");
const newAssessment = presentation.buildAssessmentEntryPoints({
  bundle,
  state: newState,
  intent: newIntent,
});
assert(newAssessment.actions[0]?.mode === "new-placement"
  && newAssessment.actions[0]?.kind === "reassessment", "New athlete did not receive the short placement entry point");
assert(newAssessment.canManuallyClaimSkills === false, "Assessment reintroduced manual skill claiming");
assertPlainAthleteCopy([newProgress, newAssessment], "new athlete presentation");

// 2. Migrated evidence remains a provisional imported starting point, never an award.
const migratedAthleteId = contracts.parseStableId("athlete", "phase8-migrated-athlete");
const migratedTarget = milestone(definitions.graphIds.planche, "stable-tuck-planche");
const migratedSource = source("phase8-migrated-source");
const migratedState = stateFor(migratedAthleteId, {
  nodeStates: [nodeState(migratedTarget, "estimated", "current", [migratedSource])],
  workingNodes: [{ milestone: migratedTarget, reasonCodes: [reason("phase8-provisional-working")] }],
});
const migratedIntent = intentFor(migratedAthleteId, [{
  graphId: definitions.graphIds.planche,
  targetNodeId: migratedTarget.nodeId,
  priority: "primary",
}]);
const migratedEvent = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  id: migratedSource.eventId,
  athleteId: migratedAthleteId,
  occurredAt: "2026-08-01T09:00:00.000Z",
  recordedAt: "2026-08-01T09:00:00.000Z",
  source: "migration",
  catalogueVersion: bundle.catalogueVersion,
  type: "performance_observed",
  subject: { kind: "milestone", milestone: migratedTarget },
  outcome: "clean",
  legacySourceVersion: "1.2",
  legacySourceReference: "phase8-fixture",
};
const migratedProvenance = presentation.buildObservationPresentationProvenance({
  evidenceEvents: [migratedEvent],
  sessionRecords: [],
});
const migratedProgress = presentation.buildProgressAndGoals({
  bundle,
  state: migratedState,
  intent: migratedIntent,
  provenance: migratedProvenance,
});
const migratedPlanche = family(migratedProgress, definitions.graphIds.planche);
assert(migratedPlanche?.demonstratedState.kind === "provisional"
  && migratedPlanche.demonstratedState.sourceLabel === "Imported starting point",
"Migrated estimate was not distinguished as an imported provisional starting point");
assert(migratedPlanche?.confidence.state === "not-established",
  "Migrated estimate was presented as confirmed capability");
const migratedAssessment = presentation.buildAssessmentEntryPoints({
  bundle,
  state: migratedState,
  intent: migratedIntent,
});
assert(migratedAssessment.actions[0]?.mode === "targeted-reconfirmation",
  "Migrated athlete was routed through full new-user placement");
assertPlainAthleteCopy([migratedProgress, migratedAssessment], "migrated athlete presentation");

// The same lifecycle from self-assessment has different wording; IDs are never
// used to infer provenance.
const assessmentProvenance = new Map([[
  presentation.observationPresentationSourceKey(migratedSource), "assessment",
]]);
const assessedProgress = presentation.buildProgressAndGoals({
  bundle,
  state: migratedState,
  intent: migratedIntent,
  provenance: assessmentProvenance,
});
assert(family(assessedProgress, definitions.graphIds.planche)?.demonstratedState.sourceLabel
  === "Placement estimate", "Self-assessment provenance was labelled as migration");

// 3. Mixed athlete: families stay independent and the highest real achievement
// is visible even when an earlier prerequisite has stronger confirmation.
const mixedAthleteId = contracts.parseStableId("athlete", "phase8-mixed-athlete");
const stableTuck = milestone(definitions.graphIds.planche, "stable-tuck-planche");
const advancedTuck = milestone(definitions.graphIds.planche, "advanced-tuck-planche");
const assistedOneLeg = milestone(definitions.graphIds.planche, "assisted-one-leg-planche");
const fullLSit = milestone(definitions.graphIds.lSitVSit, "full-l-sit");
const highLSit = milestone(definitions.graphIds.lSitVSit, "high-l-sit");
const pikeEccentric = milestone(definitions.graphIds.verticalPushHspu, "controlled-pike-eccentric");
const elevatedPike = milestone(definitions.graphIds.verticalPushHspu, "elevated-deep-pike-push-up");
const mixedState = stateFor(mixedAthleteId, {
  nodeStates: [
    nodeState(stableTuck, "established", "current", [source("phase8-stable-tuck")]),
    nodeState(advancedTuck, "established", "current", [source("phase8-advanced-tuck")]),
    nodeState(fullLSit, "established", "current", [source("phase8-full-l-sit")]),
    nodeState(pikeEccentric, "developing", "current", [source("phase8-pike-development")]),
  ],
  workingNodes: [
    { milestone: elevatedPike, reasonCodes: [reason("phase8-working")] },
  ],
  eligibleTargets: [
    { milestone: assistedOneLeg, reasonCodes: [reason("phase8-eligible")] },
    { milestone: highLSit, reasonCodes: [reason("phase8-eligible")] },
  ],
  maintenanceNeeds: [{
    milestone: milestone(definitions.graphIds.parallettePushing, "controlled-parallette-push-up"),
    reasonCodes: [reason("phase8-maintenance")],
  }],
});
const mixedIntent = intentFor(mixedAthleteId, [
  { graphId: definitions.graphIds.planche, targetNodeId: assistedOneLeg.nodeId, priority: "primary" },
  { graphId: definitions.graphIds.lSitVSit, targetNodeId: highLSit.nodeId, priority: "secondary" },
  { graphId: definitions.graphIds.verticalPushHspu, priority: "interest" },
]);
const generated = generatedFixture(mixedAthleteId);
const mixedProgress = presentation.buildProgressAndGoals({
  bundle,
  state: mixedState,
  intent: mixedIntent,
  generatedSession: generated,
});
const mixedPlanche = family(mixedProgress, definitions.graphIds.planche);
const mixedLSit = family(mixedProgress, definitions.graphIds.lSitVSit);
const mixedHspu = family(mixedProgress, definitions.graphIds.verticalPushHspu);
assert(mixedPlanche?.demonstratedState.label === graphNode(advancedTuck)?.label,
  "Mixed athlete did not show the highest established Planche outcome");
assert(mixedPlanche?.nextTarget?.milestone.nodeId === assistedOneLeg.nodeId
  && mixedLSit?.nextTarget?.milestone.nodeId === highLSit.nodeId
  && mixedHspu?.nextTarget?.milestone.nodeId === elevatedPike.nodeId,
"Mixed athlete families did not preserve independent next targets");
assert(mixedPlanche?.recommendedFocus.kind === "primary"
  && mixedLSit?.recommendedFocus.kind === "secondary",
"Primary and compatible secondary emphasis were not mapped to Progress & Goals");
const plancheDetail = presentation.buildSkillDetail({
  bundle,
  state: mixedState,
  intent: mixedIntent,
  generatedSession: generated,
}, definitions.graphIds.planche);
assert(plancheDetail.currentLabel === graphNode(advancedTuck)?.label
  && plancheDetail.nextLabel === graphNode(assistedOneLeg)?.label,
"Skill detail did not map current and next Planche states correctly");
assert(plancheDetail.requiresLabel === "Requires" && Array.isArray(plancheDetail.prerequisites),
  "Skill detail omitted its educational prerequisite view");
assertPlainAthleteCopy([mixedProgress, plancheDetail], "mixed athlete presentation");

const orderingAthleteId = contracts.parseStableId("athlete", "phase8-achievement-ordering");
const orderingState = stateFor(orderingAthleteId, {
  nodeStates: [
    nodeState(stableTuck, "established", "current", [source("phase8-ordering-stable")]),
    nodeState(advancedTuck, "demonstrated", "current", [source("phase8-ordering-advanced")]),
  ],
});
const orderingProgress = presentation.buildProgressAndGoals({
  bundle,
  state: orderingState,
  intent: intentFor(orderingAthleteId, [{ graphId: definitions.graphIds.planche, priority: "primary" }]),
});
assert(family(orderingProgress, definitions.graphIds.planche)?.demonstratedState.label
  === graphNode(advancedTuck)?.label,
"A lower Established prerequisite hid a higher Demonstrated Planche achievement");

const advancedAthleteId = contracts.parseStableId("athlete", "phase8-advanced-athlete");
const plancheGraph = bundle.graphs.find((graph) => graph.id === definitions.graphIds.planche);
const advancedState = stateFor(advancedAthleteId, {
  nodeStates: (plancheGraph?.nodes ?? [])
    .filter((node) => node.implementationStatus === "available"
      && node.programmingBoundary === "automatic")
    .map((node, index) => nodeState(
      { graphId: definitions.graphIds.planche, nodeId: node.id },
      "established",
      "current",
      [source(`phase8-advanced-proof-${index}`)],
    )),
});
const advancedIntent = intentFor(advancedAthleteId, [{
  graphId: definitions.graphIds.planche,
  priority: "primary",
}]);
const advancedDetail = presentation.buildSkillDetail({
  bundle,
  state: advancedState,
  intent: advancedIntent,
}, definitions.graphIds.planche);
assert(advancedDetail.nextLabel === "Maintain your current work"
  && advancedDetail.assessmentAction.kind === "reassess",
"Fully developed automatic Planche state invented an unavailable next target or wrong follow-up action");

// A stale demonstrated milestone reconfirms its own observation contract. The
// separately eligible next target must never replace that protocol in the CTA.
const staleAthleteId = contracts.parseStableId("athlete", "phase8-stale-current-athlete");
const staleState = stateFor(staleAthleteId, {
  nodeStates: [
    nodeState(stableTuck, "established", "stale", [source("phase8-stale-stable-tuck")]),
  ],
  eligibleTargets: [{
    milestone: advancedTuck,
    reasonCodes: [reason("phase8-eligible-next-after-stale")],
  }],
});
const staleIntent = intentFor(staleAthleteId, [{
  graphId: definitions.graphIds.planche,
  targetNodeId: advancedTuck.nodeId,
  priority: "primary",
}]);
const staleDetail = presentation.buildSkillDetail({
  bundle,
  state: staleState,
  intent: staleIntent,
}, definitions.graphIds.planche);
const staleCurrentProtocolIds = graphNode(stableTuck)?.benchmarkProtocolIds ?? [];
const staleNextProtocolIds = graphNode(advancedTuck)?.benchmarkProtocolIds ?? [];
assert(staleDetail.nextLabel === graphNode(advancedTuck)?.label,
  "Stale-current fixture did not retain its independently eligible next target");
assert(staleDetail.assessmentAction.kind === "start-reconfirmation",
  "Stale demonstrated capability did not request reconfirmation");
assert(staleDetail.assessmentAction.protocolIds.join("|") === staleCurrentProtocolIds.join("|")
  && staleDetail.assessmentAction.protocolIds.every((id) => !staleNextProtocolIds.includes(id)),
"Stale capability reconfirmation used the next target protocol instead of the current demonstrated milestone protocol");
const staleAssessment = presentation.buildAssessmentEntryPoints({
  bundle,
  state: staleState,
  intent: staleIntent,
});
assert(staleAssessment.actions.some((action) => action.kind === "reconfirmation"
  && action.graphId === definitions.graphIds.planche
  && action.protocolIds.some((id) => staleDetail.assessmentAction.protocolIds.includes(id))),
"Stale skill detail has no exact reconfirmation action in the approved assessment entry points");

// 4. Restrictions change current training without deleting capability and only
// affect families with material (moderate/high) demand overlap.
const restrictedAthleteId = contracts.parseStableId("athlete", "phase8-restricted-athlete");
const balance = milestone(definitions.graphIds.handstandBalance, "repeatable-parallette-balance");
const shapeChange = milestone(definitions.graphIds.handstandBalance, "freestanding-parallette-tuck-shape-change");
const restrictionSource = source("phase8-inversion-restriction");
const restrictedState = stateFor(restrictedAthleteId, {
  nodeStates: [
    nodeState(balance, "established", "current", [source("phase8-established-balance")]),
    nodeState(stableTuck, "established", "current", [source("phase8-restricted-stable-tuck")]),
  ],
  eligibleTargets: [
    { milestone: shapeChange, reasonCodes: [reason("phase8-eligible")] },
    { milestone: advancedTuck, reasonCodes: [reason("phase8-eligible")] },
  ],
  activeRestrictions: [{
    source: restrictionSource,
    decision: "block",
    demandDomains: ["inversion-technical", "overhead-straight-arm-upper-limb"],
    bodyRegions: ["head-neck"],
    occurredAt: "2026-08-23T09:00:00.000Z",
    reasonCodes: [reason("active-restriction")],
  }],
});
const restrictedIntent = intentFor(restrictedAthleteId, [
  { graphId: definitions.graphIds.handstandBalance, priority: "primary" },
  { graphId: definitions.graphIds.planche, priority: "secondary" },
]);
const restrictedProgress = presentation.buildProgressAndGoals({
  bundle,
  state: restrictedState,
  intent: restrictedIntent,
});
const restrictedHandstand = family(restrictedProgress, definitions.graphIds.handstandBalance);
const unaffectedPlanche = family(restrictedProgress, definitions.graphIds.planche);
const unaffectedLSit = family(restrictedProgress, definitions.graphIds.lSitVSit);
const unaffectedPushing = family(restrictedProgress, definitions.graphIds.parallettePushing);
assert(restrictedHandstand?.demonstratedState.kind === "demonstrated"
  && restrictedHandstand.demonstratedState.historyRetained,
"Restriction removed a previously demonstrated Handstand achievement");
assert(restrictedHandstand?.availability.state === "restricted"
  && /achievement is maintained/i.test(restrictedHandstand.availability.message),
"Restricted family did not separate maintained achievement from current training");
assert(unaffectedPlanche?.availability.state !== "restricted"
  && unaffectedLSit?.availability.state !== "restricted"
  && unaffectedPushing?.availability.state !== "restricted",
"Dense low demand tags spread an inversion restriction into unaffected families");
const restrictionView = presentation.buildRestrictionPresentation({ bundle, state: restrictedState });
assert(restrictionView.hasActiveRestrictions && /not been removed/i.test(restrictionView.summary),
  "Restriction trust copy does not preserve achievement history");
assert(restrictionView.items[0]?.affectedFamilyIds.includes(definitions.graphIds.handstandBalance)
  && !restrictionView.items[0]?.affectedFamilyIds.includes(definitions.graphIds.parallettePushing),
"Restriction explanation mapped to the wrong skill families");
assertPlainAthleteCopy([restrictedProgress, restrictionView], "restricted athlete presentation");

// 5. Goal controls mutate Athlete Intent only. They cannot alter evidence,
// Derived Athlete State or the safe progression frontier.
const stateBeforeGoalChange = JSON.stringify(mixedState);
const goalControls = presentation.buildGoalControls(bundle, mixedIntent);
const updatedIntent = presentation.applyGoalControlSelection({
  bundle,
  intent: mixedIntent,
  selection: {
    goals: [
      { graphId: definitions.graphIds.handstandBalance, priority: "primary" },
      { graphId: definitions.graphIds.planche, priority: "secondary" },
    ],
    emphasis: {
      primaryGraphId: definitions.graphIds.handstandBalance,
      secondaryGraphId: definitions.graphIds.planche,
    },
  },
  updatedAt: "2026-08-24T09:05:00.000Z",
});
assert(goalControls.canUnlockSkills === false, "Goal controls expose a skill unlock action");
assert(JSON.stringify(mixedState) === stateBeforeGoalChange,
  "Changing goals mutated Derived Athlete State");
assert(updatedIntent.athleteId === mixedIntent.athleteId
  && updatedIntent.goals[0]?.graphId === definitions.graphIds.handstandBalance
  && !Object.hasOwn(updatedIntent, "nodeStates")
  && !Object.hasOwn(updatedIntent, "evidenceEvents"),
"Goal selection returned anything other than Athlete Intent");
const changedGoalProgress = presentation.buildProgressAndGoals({
  bundle,
  state: mixedState,
  intent: updatedIntent,
});
assert(family(changedGoalProgress, definitions.graphIds.planche)?.demonstratedState.label
  === mixedPlanche?.demonstratedState.label,
"Changing a goal manually changed demonstrated capability");
const rejectsGoalSelection = (goals, label) => {
  let rejected = false;
  try {
    presentation.applyGoalControlSelection({
      bundle,
      intent: mixedIntent,
      selection: { goals },
      updatedAt: "2026-08-24T09:06:00.000Z",
    });
  } catch {
    rejected = true;
  }
  assert(rejected, label);
};
rejectsGoalSelection([], "Goal controls allowed saving an empty goal selection");
rejectsGoalSelection([
  { graphId: definitions.graphIds.planche, priority: "secondary" },
], "Goal controls allowed a saved selection without one primary goal");
rejectsGoalSelection([
  { graphId: definitions.graphIds.planche, priority: "primary" },
  { graphId: definitions.graphIds.lSitVSit, priority: "secondary" },
  { graphId: definitions.graphIds.handstandBalance, priority: "secondary" },
  { graphId: definitions.graphIds.verticalPushHspu, priority: "secondary" },
], "Goal controls allowed more than the approved three goal families");
assertPlainAthleteCopy(goalControls, "goal controls");

// 6. Today maps generator focus/item roles to plain explanations and keeps
// Technique/Standard/Challenge as workload choices, not unlock controls.
const today = presentation.buildTodayWorkoutPresentation({ bundle, generated });
assert(today.status === "ready" && today.primary?.graphId === definitions.graphIds.planche,
  "Today's Workout lost the generated primary focus");
assert(today.secondary?.graphId === definitions.graphIds.lSitVSit
  && today.maintenance.some((item) => item.graphId === definitions.graphIds.parallettePushing),
"Today's Workout lost compatible secondary or maintenance work");
assert(today.blocks.length === generated.plan.items.length
  && today.blocks.every((block) => block.reason.length > 0 && block.intensity.length > 0),
"Today's Workout did not explain every generated exercise and intensity");
assert(today.demand.label === "Standard"
  && /never unlocks|safe progression/i.test(today.authorityNotice + today.demand.message),
"Today's demand control does not preserve the safe frontier");
assert(today.exposesRawAlgorithmDecisions === false,
  "Today's Workout exposes raw algorithm decisions");
assertPlainAthleteCopy(today, "Today's Workout");

// 7. Completion asks only about meaningful development/maintenance work and
// maps answers to item outcomes without constructing a second session fact.
const preparationExercise = bundle.exercises.find((exercise) =>
  exercise.roles.includes("preparation-recovery"));
if (!preparationExercise?.prescriptionVariants[0]) {
  throw new TypeError("Phase 8 fixture needs one preparation/recovery exercise");
}
const preparationVariant = preparationExercise.prescriptionVariants[0];
const timerOnlyItem = (suffix, purpose) => ({
  id: contracts.parseStableId("plan-item", `phase8-${suffix}`),
  exerciseId: preparationExercise.id,
  exerciseDefinitionVersion: preparationExercise.definitionVersion,
  prescriptionVariantId: preparationVariant.id,
  purpose,
  plannedSeconds: 120,
  demand: preparationVariant.demand,
});
const preparationItem = timerOnlyItem("preparation", "preparation");
const recoveryItem = timerOnlyItem("recovery", "recovery");
const completionGenerated = {
  ...generated,
  plan: {
    ...generated.plan,
    intendedDurationSeconds: generated.plan.intendedDurationSeconds + 240,
    items: [preparationItem, ...generated.plan.items, recoveryItem],
  },
};
const completion = presentation.buildWorkoutCompletionPresentation({
  bundle,
  generated: completionGenerated,
});
assert(completion.prompts.length === generated.plan.items.length,
  "Workout completion surveyed preparation or recovery instead of meaningful work only");
assert(!completion.prompts.some((prompt) =>
  prompt.planItemId === preparationItem.id || prompt.planItemId === recoveryItem.id),
"Workout completion duplicated timer-owned preparation/recovery facts");
assert(completion.prompts.every((prompt) => prompt.statusOptions.map((option) => option.value).join("|")
  === "completed|modified|skipped" && prompt.asksPainOrInstability === true),
"Workout completion does not capture completed/modified/skipped and symptom feedback");
assert(completion.prompts.some((prompt) => prompt.asksDifficulty),
  "Workout completion omitted difficulty from all meaningful work");
assert(completion.createsSessionRecord === false,
  "Workout completion presentation became a second Session Record authority");
const [primaryItem, secondaryItem, maintenanceItem] = generated.plan.items;
const completionMapping = presentation.mapWorkoutCompletionAnswers({
  generated: completionGenerated,
  answers: [
    {
      planItemId: primaryItem.id,
      status: "completed",
      participationSeconds: primaryItem.plannedSeconds,
      difficulty: "right",
      symptomOrInstability: false,
    },
    {
      planItemId: secondaryItem.id,
      status: "modified",
      participationSeconds: Math.floor(secondaryItem.plannedSeconds * 0.75),
      difficulty: "hard",
      symptomOrInstability: true,
      modificationReason: "Reduced the range after new wrist feedback.",
    },
    {
      planItemId: maintenanceItem.id,
      status: "skipped",
      participationSeconds: 0,
    },
  ],
});
assert(completionMapping.itemOutcomes.length === 3
  && completionMapping.itemOutcomes[1]?.status === "modified"
  && completionMapping.itemOutcomes[1]?.review?.difficulty === "hard"
  && completionMapping.itemOutcomes[1]?.review?.symptomOrInstability === true,
"Completion answers did not map modification, difficulty and symptom feedback correctly");
assert(completionMapping.restrictionFollowUp === true,
  "Pain/restriction feedback did not request contextual follow-up");
assert(!Object.hasOwn(completionMapping, "id")
  && !Object.hasOwn(completionMapping, "planId")
  && !Object.hasOwn(completionMapping, "sessionRecord"),
"Completion mapping constructed or impersonated a Session Record");
let duplicateCompletionRejected = false;
try {
  presentation.mapWorkoutCompletionAnswers({
    generated: completionGenerated,
    answers: [
      { planItemId: primaryItem.id, status: "completed", participationSeconds: 1 },
      { planItemId: primaryItem.id, status: "completed", participationSeconds: 1 },
    ],
  });
} catch {
  duplicateCompletionRejected = true;
}
assert(duplicateCompletionRejected, "Completion mapping accepted duplicate plan-item facts");
assertPlainAthleteCopy([completion, completionMapping], "workout completion");

// The isolated React surface remains unmounted, but its semantic and responsive
// contracts are still checked now so Phase 9 does not inherit avoidable UX debt.
const uiDirectory = resolve(projectRoot, "app/vnext/ui");
const uiSources = readdirSync(uiDirectory)
  .filter((name) => name.endsWith(".tsx"))
  .sort()
  .map((name) => readFileSync(join(uiDirectory, name), "utf8"))
  .join("\n");
const uiCss = readFileSync(join(uiDirectory, "phase8.css"), "utf8");
const uiIndex = readTextOrEmpty(join(uiDirectory, "index.ts"));
const legacyRoot = readFileSync(resolve(projectRoot, "src/main.tsx"), "utf8");
const legacyPage = readFileSync(resolve(projectRoot, "app/page.tsx"), "utf8");
const coreVNextIndex = readFileSync(resolve(projectRoot, "app/vnext/index.ts"), "utf8");

assert(/<main\b/.test(uiSources), "vNext experience lacks a native main landmark");
assert(/<nav\b[^>]*aria-label=/.test(uiSources), "vNext experience lacks a labelled navigation landmark");
assert(/<button\b[^>]*type=["']button["']/.test(uiSources), "vNext actions are not native typed buttons");
assert(/<fieldset\b/.test(uiSources) && /<legend\b/.test(uiSources),
  "Goal controls are not grouped by fieldset and legend");
assert(/aria-live=["']polite["']/.test(uiSources), "vNext changing status lacks a polite live region");
assert(/Set \$\{option\.label\} as primary goal/.test(uiSources)
  && /Add \$\{option\.label\} as secondary goal/.test(uiSources),
"Per-family goal buttons do not have distinct accessible names");
assert(!/<(?:div|span|article|li)\b[^>]*\bonClick=/.test(uiSources),
  "vNext surface uses a non-native click target");
assert(!/\btabIndex\s*=/.test(uiSources), "vNext surface introduces manual tab order");
assert(!/\.(?:reasonCodes|lifecycle|capacityFindings|programmingBoundary)\b/.test(uiSources),
  "vNext surface renders an internal projection/graph field directly");
assert(!/(?:Skills\s*&\s*Readiness|mark (?:as )?achieved|claim (?:this )?skill|unlock skill|I have (?:this|the) skill)/i.test(uiSources),
  "vNext surface retains manual readiness/skill-claim language");
assert(/family\.demonstratedState\.kind/.test(uiSources)
  && /family\.demonstratedState\.sourceLabel/.test(uiSources),
"Family cards do not distinguish imported/provisional starting points from demonstrated skills");
assert(/detail\.assessmentAction\.protocolIds/.test(uiSources)
  && /action\.protocolIds\.(?:some|includes)/.test(uiSources),
"Skill-detail guided actions are not matched to the exact approved protocol offer");
assert(/disabled=\{(?:busy\s*\|\|\s*)?!onDemandChange\}/.test(uiSources),
  "Today's demand controls remain interactive without an owning change callback");
assert(/disabled=\{(?:busy\s*\|\|\s*)?!allAnswered\s*\|\|\s*!onWorkoutReviewSubmitted\}/.test(uiSources),
  "Workout review can be submitted without an owning completion callback");
assert(/:focus-visible\b/.test(uiCss), "vNext CSS lacks a visible keyboard focus treatment");
assert(/(?:44px|2\.75rem)/.test(uiCss), "vNext controls do not declare a 44px minimum touch target");
assert(/grid-template-columns:\s*(?:minmax\(0,\s*1fr\)|1fr)/.test(uiCss),
  "vNext mobile layout lacks an explicit single-column grid");
assert(/overflow-wrap:\s*(?:anywhere|break-word)/.test(uiCss),
  "vNext mobile copy has no long-text wrapping invariant");
assert(/@media\s*\(max-width:\s*(?:760px|48rem)\)/.test(uiCss),
  "vNext CSS lacks the approved <=760px/48rem mobile breakpoint");
assert(/VNextExperience/.test(uiIndex), "vNext UI index does not expose its isolated experience");
assert(!/(?:VNextExperience|app\/vnext\/ui)/.test(legacyPage)
  && /if \(import\.meta\.env\.VITE_VNEXT_RC_ENABLED === "true"\)/.test(legacyRoot)
  && /const mountLegacyApplication = async/.test(legacyRoot)
  && /const mountReleaseCandidate = async/.test(legacyRoot)
  && !/^import .*app\/vnext/m.test(legacyRoot),
  "The isolated vNext build branch can leak into the live v1.2 application path");
assert(!/(?:\.\/ui|VNextExperience)/.test(coreVNextIndex),
  "Core vNext data API unexpectedly exports the isolated React surface");
assertPlainAthleteCopy(uiSources, "vNext UI source");

if (failures.length) {
  console.error(`vNext Phase 8 validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("vNext Phase 8 validation passed: presentation scenarios, authority boundaries, plain explanations, keyboard semantics, mobile layout and feature isolation are intact.");
}
