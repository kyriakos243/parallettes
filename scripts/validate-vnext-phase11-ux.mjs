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
const projection = loadTypeScriptModule("app/vnext/projection/index.ts");
const planning = loadTypeScriptModule("app/vnext/planning/index.ts");
const presentation = loadTypeScriptModule("app/vnext/presentation/index.ts");
const validation = loadTypeScriptModule("app/vnext/validation.ts");
const workoutUx = loadTypeScriptModule("app/vnext/workoutUx.ts");

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const bundle = definitions.vNextDefinitionBundle;
const policy = projection.vNextProjectionPolicy;
const asOf = "2026-08-29T08:00:00.000Z";
const athleteId = contracts.parseStableId("athlete", "phase11-ux-athlete");
const intent = {
  schemaVersion: contracts.DOMAIN_SCHEMA_VERSION,
  athleteId,
  updatedAt: asOf,
  goals: [{ graphId: definitions.graphIds.parallettePushing, priority: "primary" }],
  equipment: ["floor", "parallettes", "wall"].map((id) => contracts.parseStableId("equipment", id)),
  defaultSessionDemand: "standard",
  preferences: { specialistOptIn: false },
};
const projected = projection.projectAthleteState({
  athleteId,
  asOf,
  policy,
  definitionBundles: definitions.vNextDefinitionBundles,
  evidenceEvents: [],
  sessionPlans: [],
  sessionRecords: [],
  intent,
  trainabilityRequests: planning.planningTrainabilityRequests(bundle),
});
assert(projected.ok && projected.state, "Beginner projection failed");
if (!projected.state) throw new Error("Phase 11 UX validation could not build beginner state");
const state = projected.state;
const generated = planning.generateVNextSession({
  createdAt: asOf,
  bundle,
  intent,
  state,
  projectionPolicy: policy,
  sessionDemand: "standard",
  seed: "phase11-ux",
});
assert(generated.ok && generated.plan, "Beginner Today plan failed");
if (!generated.plan) throw new Error("Phase 11 UX validation could not build Today plan");

const structured = workoutUx.structureWorkoutPlan(generated.plan, bundle);
assert(structured.length === generated.plan.items.length, "Preview omitted a planned block");
for (const item of structured) {
  const planned = generated.plan.items.find((candidate) => candidate.id === item.planItemId);
  assert(item.intervals.reduce((sum, interval) => sum + interval.durationSeconds, 0) === planned?.plannedSeconds,
    `Structured timer does not preserve ${item.exercise.name} block budget`);
  assert(item.targetLabel.length > 0 && item.structureLabel.length > 0,
    `${item.exercise.name} lacks a visible prescription structure`);
  if (planned && planned.purpose !== "recovery" && planned.plannedSeconds >= 120) {
    assert(item.intervals.some((interval) => interval.kind === "rest"),
      `${item.exercise.name} still presents a long block without rest`);
  }
  if (planned && planned.purpose !== "recovery" && planned.plannedSeconds >= 360) {
    assert(item.intervals.filter((interval) => interval.kind === "work").length <= 5,
      `${item.exercise.name} converts a 6–8 minute block into too many work sets`);
  }
}
assert(structured.flatMap((item) => item.intervals).some((interval) => interval.kind === "rest"),
  "Automatic execution timeline contains no rest intervals");

const today = presentation.buildTodayWorkoutPresentation({ bundle, generated });
assert(today.blocks.length === generated.plan.items.length, "Today preview does not show every planned movement");
assert(today.blocks.every((block) => block.mediaReference && block.prescriptionLabel && block.setStructureLabel),
  "Today preview is missing motion or prescription detail");
assert(today.blocks.some((block) => block.plannedRestSeconds > 0), "Today preview does not identify rest inside blocks");

const swapOptions = generated.plan.items.flatMap((item) => workoutUx.safeWorkoutSwaps({
  plan: generated.plan,
  item,
  bundle,
  state,
  intent,
  projectionPolicy: policy,
}));
assert(swapOptions.length > 0, "Representative Today plan exposes no authored safe alternative");
assert(swapOptions.every((option) => option.mediaReference && ["easier", "similar", "harder"].includes(option.direction)),
  "Swap option lacks owned media or difficulty classification");

for (const minutes of [5, 10, 15, 20]) {
  const custom = planning.generateVNextCustomSession({
    createdAt: asOf,
    bundle,
    intent,
    state,
    projectionPolicy: policy,
    sessionDemand: "technique",
    seed: `phase11-custom-${minutes}`,
  }, minutes);
  assert(custom.ok && custom.plan, `${minutes}-minute vNext Custom Session failed`);
  if (!custom.plan) continue;
  assert(custom.plan.intendedDurationSeconds === minutes * 60
    && custom.plan.items.reduce((sum, item) => sum + item.plannedSeconds, 0) === minutes * 60,
  `${minutes}-minute Custom Session has incorrect timing`);
  assert(validation.validateSessionPlan(custom.plan).valid, `${minutes}-minute Custom Session violates Session Plan contract`);
  assert(!Object.hasOwn(custom.plan, "level"), `${minutes}-minute Custom Session leaked legacy L1/L2/L3 authority`);
  const customDevelopment = custom.plan.items.filter((item) =>
    item.purpose !== "preparation" && item.purpose !== "recovery");
  assert(customDevelopment.length === (minutes === 5 ? 1 : minutes === 20 ? 3 : 2),
    `${minutes}-minute Custom Session has an unsuitable number of development movements`);
  assert(customDevelopment.length > 0,
    `${minutes}-minute Custom Session contains no development work`);
  assert(new Set(customDevelopment.map((item) => item.exerciseId)).size === customDevelopment.length,
    `${minutes}-minute Custom Session repeats the same development movement`);
  assert(Math.max(...customDevelopment.map((item) => item.plannedSeconds)) <= 10 * 60,
    `${minutes}-minute Custom Session stretches one development movement beyond 10 minutes`);
}

const compressionIntent = {
  ...intent,
  goals: [{ graphId: definitions.graphIds.lSitVSit, priority: "primary" }],
};
for (const minutes of [5, 20]) {
  const compressionCustom = planning.generateVNextCustomSession({
    createdAt: asOf,
    bundle,
    intent: compressionIntent,
    state,
    projectionPolicy: policy,
    sessionDemand: "technique",
    seed: `phase11-custom-compression-${minutes}`,
  }, minutes, {
    label: "Compression only",
    capacityIds: [definitions.capacityIds.pikeCompression, definitions.capacityIds.straddleCompression],
  });
  assert(compressionCustom.ok && compressionCustom.plan,
    `${minutes}-minute Compression-only Custom Session failed to select safe capacity work`);
  const compressionDevelopment = compressionCustom.plan?.items.filter((candidate) =>
    candidate.purpose !== "preparation" && candidate.purpose !== "recovery") ?? [];
  if (minutes === 20) {
    assert(compressionDevelopment.length >= 2,
      "20-minute Compression-only Custom Session did not provide enough movement variety");
    assert(Math.max(...compressionDevelopment.map((item) => item.plannedSeconds)) <= 10 * 60,
      "20-minute Compression-only Custom Session stretched one movement beyond 10 minutes");
  }
  for (const item of compressionDevelopment) {
    const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    assert(Boolean(exercise
      && exercise.capacityLinks.some((link) => [
        definitions.capacityIds.pikeCompression,
        definitions.capacityIds.straddleCompression,
      ].includes(link.capacityId))),
    "Compression-only Custom Session included non-capacity development work");
  }
}

const coreIntent = {
  ...intent,
  goals: [{ graphId: definitions.graphIds.planche, priority: "primary" }],
};
for (const minutes of [5, 20]) {
  const coreCustom = planning.generateVNextCustomSession({
    createdAt: asOf,
    bundle,
    intent: coreIntent,
    state,
    projectionPolicy: policy,
    sessionDemand: "technique",
    seed: `phase11-custom-core-${minutes}`,
  }, minutes, {
    label: "Core & body line",
    capacityIds: [definitions.capacityIds.bodyLineControl],
  });
  assert(coreCustom.ok && coreCustom.plan,
    `${minutes}-minute Core Custom Session failed to select safe body-line work`);
  const coreDevelopment = coreCustom.plan?.items.filter((candidate) =>
    candidate.purpose !== "preparation" && candidate.purpose !== "recovery") ?? [];
  if (minutes === 20) {
    assert(coreDevelopment.length >= 2,
      "20-minute Core Custom Session did not provide enough movement variety");
    assert(Math.max(...coreDevelopment.map((item) => item.plannedSeconds)) <= 10 * 60,
      "20-minute Core Custom Session stretched one movement beyond 10 minutes");
  }
  for (const item of coreDevelopment) {
    const exercise = bundle.exercises.find((candidate) => candidate.id === item.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    assert(Boolean(exercise?.capacityLinks.some((link) =>
      link.capacityId === definitions.capacityIds.bodyLineControl)),
    "Core Custom Session included non-body-line development work");
  }
}

const developmentItems = generated.plan.items.filter((item) =>
  item.purpose !== "preparation" && item.purpose !== "recovery");
const firstDevelopment = developmentItems[0];
const firstStructure = firstDevelopment ? structured.find((item) => item.planItemId === firstDevelopment.id) : undefined;
const threshold = Math.ceil((firstStructure?.intervals.find((interval) => interval.kind === "work")?.durationSeconds ?? 1) / 2);
const participationSecondsByPlanItem = Object.fromEntries(generated.plan.items.map((item) => [item.id, 0]));
if (firstDevelopment) participationSecondsByPlanItem[firstDevelopment.id] = threshold;
const completion = presentation.buildWorkoutCompletionPresentation({
  bundle,
  generated,
  participationSecondsByPlanItem,
  performedByPlanItem: {},
});
assert(completion.prompts.length === (firstDevelopment ? 1 : 0),
  "Completion review includes unreached or non-evidence-relevant movements");
assert(completion.prompts.every((prompt) => {
  const planned = generated.plan.items.find((item) => item.id === prompt.planItemId);
  return planned?.purpose !== "preparation" && planned?.purpose !== "recovery";
}), "Completion review includes preparation or recovery");

if (failures.length) {
  console.error(`Phase 11 UX validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Phase 11 UX validation passed: ${structured.length} preview blocks, ${swapOptions.length} safe alternatives, 5/10/15/20-minute plus core/compression custom plans, automatic rest timeline, performed-only review.`);
