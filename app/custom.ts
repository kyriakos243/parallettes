import { exercises, type DifficultyLevel, type Equipment, type Exercise, type Focus } from "./program";

export type CustomDifficulty = "easy" | "recommended" | "hard";
export type CustomFocus = "handstand" | "core" | "compression" | "lsit" | "planche" | "pushing" | "support" | "mobility" | "conditioning";
export type CustomBlocks = { warmup: boolean; preparation: boolean; skill: boolean; strength: boolean; cooldown: boolean; lab: boolean };
export type CustomRequest = {
  focuses: CustomFocus[];
  equipment: Equipment[];
  seconds: number;
  difficulty: CustomDifficulty;
  blocks?: Partial<CustomBlocks>;
  recentIds?: string[];
  readiness?: Record<string, boolean>;
  preferNextProgression?: boolean;
  preferVariety?: boolean;
  feedbackByExercise?: Record<string, "easy" | "right" | "hard">;
  progressionEvidence?: Record<string, { cleanSessions?: number }>;
  /** Changes the top-ranked choices without weakening readiness or equipment filters. */
  variationSeed?: number;
};
export type CustomBlock = "warmup" | "pre" | "skill" | "strength" | "lab" | "cooldown";
export type CustomItem = {
  exerciseId: string;
  block: CustomBlock;
  work: number;
  rest: number;
  round: number;
  rounds: number;
  station: number;
  stations: number;
  occurrence: number;
  occurrences: number;
  intentionalRepeat: boolean;
};
export type CustomPlanSummary = {
  block: CustomBlock;
  intervals: number;
  uniqueExercises: number;
  rounds: number;
};
export type CustomPlan = {
  mode: "custom";
  seconds: number;
  items: CustomItem[];
  warnings: string[];
  title: string;
  summary: CustomPlanSummary[];
};

const defaultBlocks: CustomBlocks = { warmup: true, preparation: true, skill: true, strength: true, cooldown: true, lab: false };
const focusMap: Record<CustomFocus, Focus[]> = {
  handstand: ["line", "entry", "balance", "exit", "overhead-load"],
  core: ["hollow", "anti-extension", "anti-rotation", "pelvic-control", "posterior-chain"],
  compression: ["compression"],
  lsit: ["lsit", "compression", "support"],
  planche: ["planche", "support", "horizontal-push"],
  pushing: ["horizontal-push", "vertical-push"],
  support: ["support", "transition", "scapular", "anti-extension"],
  mobility: ["wrist", "grip", "shoulder-mobility", "hamstring-mobility", "hip-mobility", "adductor-mobility", "thoracic-reset", "breathing"],
  conditioning: ["conditioning", "anti-extension", "pelvic-control"],
};
const skillFocus = (focuses: CustomFocus[]) => focuses.some((focus) =>
  ["handstand", "lsit", "planche", "pushing", "support"].includes(focus));
const blockMatches = (exercise: Exercise, block: CustomBlock, focuses: CustomFocus[]) => {
  if (block === "warmup") return exercise.category === "Warm-up";
  if (block === "pre") return exercise.category === "Pre-Handstand";
  if (block === "cooldown") return exercise.category === "Cooldown";
  if (block === "lab") return exercise.category === "Calisthenics";
  if (block === "skill") {
    if (focuses.includes("handstand") && exercise.category === "Handstand") return true;
    return exercise.category === "Calisthenics" && skillFocus(focuses);
  }
  if (focuses.length === 1 && focuses[0] === "mobility") return exercise.category === "Warm-up";
  return exercise.category === "Abs" || exercise.category === "Core" || exercise.category === "Conditioning" ||
    (exercise.category === "Calisthenics" && skillFocus(focuses));
};
const exerciseMatchesFocus = (exercise: Exercise, focus: CustomFocus) => {
  if (focus === "conditioning") {
    return exercise.primaryFocus === "conditioning" || exercise.primaryFocus === "anti-extension" ||
      exercise.primaryFocus === "pelvic-control" || exercise.requiredEquipment?.includes("rope") === true;
  }
  return [exercise.primaryFocus, ...exercise.secondaryFocus].some((tag) => focusMap[focus].includes(tag));
};
const levelFor = (difficulty: CustomDifficulty): DifficultyLevel => difficulty === "easy" ? "L1" : difficulty === "hard" ? "L3" : "L2";
const score = (
  exercise: Exercise,
  focuses: CustomFocus[],
  level: DifficultyLevel,
  recent: Set<string>,
  preferNextProgression: boolean,
  preferVariety: boolean,
  feedbackByExercise: Record<string, "easy" | "right" | "hard">,
  progressionEvidence: Record<string, { cleanSessions?: number }>,
) => {
  const focusSet = new Set(focuses.flatMap((focus) => focusMap[focus]));
  let value = focusSet.has(exercise.primaryFocus) ? 8 : exercise.secondaryFocus.some((focus) => focusSet.has(focus)) ? 4 : 0;
  if (focuses.includes("conditioning")) {
    value += exercise.requiredEquipment?.includes("rope") ? 12 : -8;
    if (exercise.category === "Conditioning") value += 6;
  }
  if (exercise.availableLevels.includes(level)) value += 3;
  if (recent.has(exercise.id)) value -= preferVariety ? 9 : 2;
  if (preferNextProgression && exercise.progressionStage === (level === "L1" ? 1 : level === "L2" ? 2 : 3)) value += 4;
  if (preferNextProgression && exercise.easierId && (progressionEvidence[exercise.easierId]?.cleanSessions ?? 0) >= 2) value += 8;
  if (feedbackByExercise[exercise.id] === "hard") value -= 8;
  if (feedbackByExercise[exercise.id] === "right") value += 2;
  if (exercise.easierId && feedbackByExercise[exercise.easierId] === "easy") value += 7;
  if (exercise.harderId && feedbackByExercise[exercise.harderId] === "hard") value += 5;
  if (exercise.loadTags?.includes("low_fatigue")) value += 1;
  return value;
};

export function buildCustomSession(request: CustomRequest): CustomPlan {
  const blocks = { ...defaultBlocks, ...request.blocks };
  if (request.blocks?.preparation === undefined && !skillFocus(request.focuses)) blocks.preparation = false;
  if (request.blocks?.skill === undefined && !skillFocus(request.focuses)) blocks.skill = false;
  const level = levelFor(request.difficulty);
  const equipment = new Set(request.equipment);
  const recent = new Set(request.recentIds ?? []);
  const warnings: string[] = [];
  if (!blocks.preparation && (request.focuses.includes("handstand") || request.focuses.includes("planche"))) {
    warnings.push("Preparation is off before a high-load skill; keep the first attempts conservative.");
  }
  if (request.focuses.includes("conditioning") && !equipment.has("rope")) {
    warnings.push("Skipping rope is not selected, so conditioning uses dynamic mat-based movements instead.");
  }
  const eligible = Object.values(exercises)
    .filter((exercise) => (exercise.requiredEquipment ?? (exercise.category === "Cooldown" || exercise.category === "Warm-up" ? ["floor"] : ["parallettes", "floor"]))
      .every((item) => equipment.has(item)))
    .filter((exercise) => exercise.level === "ALL" || exercise.availableLevels.includes(level))
    .filter((exercise) => !exercise.gate || request.readiness?.[exercise.gate] === true)
    .filter((exercise) => exercise.category === "Warm-up" || exercise.category === "Pre-Handstand" || exercise.category === "Cooldown" ||
      request.focuses.length === 0 || request.focuses.some((focus) => focus === "conditioning"
        ? exercise.primaryFocus === "conditioning" || exercise.primaryFocus === "anti-extension" || exercise.primaryFocus === "pelvic-control"
        : [exercise.primaryFocus, ...exercise.secondaryFocus].some((tag) => focusMap[focus].includes(tag))))
    .sort((a, b) => score(b, request.focuses, level, recent, request.preferNextProgression !== false, request.preferVariety !== false, request.feedbackByExercise ?? {}, request.progressionEvidence ?? {}) -
      score(a, request.focuses, level, recent, request.preferNextProgression !== false, request.preferVariety !== false, request.feedbackByExercise ?? {}, request.progressionEvidence ?? {}));

  const seed = Math.abs(Math.round(request.variationSeed ?? 0));
  const hash = (value: string) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  };
  const safeOrder: CustomBlock[] = ["warmup", "pre", "skill", "lab", "strength", "cooldown"];
  const activeBlocks = safeOrder.filter((block) => {
    if (block === "warmup") return blocks.warmup;
    if (block === "pre") return blocks.preparation;
    if (block === "skill") return blocks.skill && skillFocus(request.focuses);
    if (block === "lab") return blocks.lab;
    if (block === "strength") return blocks.strength;
    return blocks.cooldown;
  }).filter((block) => eligible.some((exercise) => blockMatches(exercise, block, request.focuses)));

  const seconds = Math.max(60, Math.round(request.seconds));
  const fullMinutes = Math.floor(seconds / 60);
  const remainder = seconds - fullMinutes * 60;
  const allocations = Object.fromEntries(safeOrder.map((block) => [block, 0])) as Record<CustomBlock, number>;

  // Every included block first receives one honest 60-second unit. When a very
  // short request cannot contain every selected block, preserve the reset,
  // warm-up and the user's primary skill/strength purpose before extras.
  const basePriority: CustomBlock[] = ["cooldown", "warmup", "skill", "strength", "pre", "lab"];
  let unallocated = fullMinutes;
  for (const block of basePriority) {
    if (unallocated > 0 && activeBlocks.includes(block)) {
      allocations[block] += 1;
      unallocated -= 1;
    }
  }
  const targets: Partial<Record<CustomBlock, number>> = { warmup: 3, pre: 2, skill: 5, lab: 5 };
  for (const block of ["warmup", "pre", "skill", "lab"] as CustomBlock[]) {
    while (unallocated > 0 && activeBlocks.includes(block) && allocations[block] < (targets[block] ?? 1)) {
      allocations[block] += 1;
      unallocated -= 1;
    }
  }
  const mainBlock = activeBlocks.includes("strength") ? "strength"
    : activeBlocks.includes("skill") ? "skill"
      : activeBlocks.includes("lab") ? "lab"
        : activeBlocks.find((block) => block !== "cooldown") ?? "cooldown";
  allocations[mainBlock] += unallocated;

  for (const block of activeBlocks) {
    if (allocations[block] === 0) warnings.push(`${block === "lab" ? "Calisthenics Lab" : block} was omitted because this session is too short to include every selected block safely.`);
  }
  if (allocations.lab > 0 && allocations.lab < 5) {
    warnings.push(`Calisthenics Lab is shortened to ${allocations.lab} clearly labelled practice round${allocations.lab === 1 ? "" : "s"}.`);
  }

  const globallyUsed = new Set<string>();
  const chooseStations = (block: CustomBlock, count: number): Exercise[] => {
    const selected: Exercise[] = [];
    for (let index = 0; index < count; index += 1) {
      const intendedFocus = request.focuses.length ? request.focuses[index % request.focuses.length] : undefined;
      const candidates = eligible.filter((exercise) => blockMatches(exercise, block, request.focuses) && !globallyUsed.has(exercise.id));
      const focused = intendedFocus ? candidates.filter((exercise) => exerciseMatchesFocus(exercise, intendedFocus)) : candidates;
      const pool = focused.length ? focused : candidates.length ? candidates
        : eligible.filter((exercise) => blockMatches(exercise, block, request.focuses) && !selected.some((item) => item.id === exercise.id));
      if (!pool.length) break;
      const shortlist = pool.slice(0, Math.min(6, pool.length));
      const choice = shortlist[hash(`${seed}:${block}:${index}`) % Math.min(4, shortlist.length)];
      selected.push(choice);
      globallyUsed.add(choice.id);
    }
    return selected;
  };

  const rawItems: Array<Omit<CustomItem, "occurrence" | "occurrences" | "intentionalRepeat">> = [];
  for (const block of safeOrder) {
    const minuteSlots = allocations[block];
    if (minuteSlots <= 0) continue;
    const intervalCount = block === "cooldown" ? minuteSlots * 2 : minuteSlots;
    const desiredStations = block === "warmup" ? Math.min(3, intervalCount)
      : block === "pre" ? Math.min(2, intervalCount)
        : block === "skill" ? Math.min(Math.max(1, Math.min(2, request.focuses.length)), intervalCount)
          : block === "lab" ? 1
            : block === "strength" ? Math.min(request.focuses.includes("mobility") ? 5 : 4, intervalCount)
              : Math.min(4, intervalCount);
    const stations = chooseStations(block, desiredStations);
    if (!stations.length) continue;
    const rounds = Math.ceil(intervalCount / stations.length);
    for (let index = 0; index < intervalCount; index += 1) {
      const round = Math.floor(index / stations.length) + 1;
      const roundStart = (round - 1) * stations.length;
      const stationsThisRound = Math.min(stations.length, intervalCount - roundStart);
      const exercise = stations[index % stations.length];
      rawItems.push({
        exerciseId: exercise.id,
        block,
        work: block === "cooldown" ? 30 : block === "warmup" ? 45 : block === "skill" || block === "lab" ? 30 : 40,
        rest: block === "cooldown" ? 0 : block === "warmup" ? 15 : block === "skill" || block === "lab" ? 30 : 20,
        round,
        rounds,
        station: (index % stations.length) + 1,
        stations: stationsThisRound,
      });
    }
  }

  if (remainder > 0 && rawItems.length) {
    const adjustable = [...rawItems].reverse().find((item) => item.block !== "cooldown") ?? rawItems[rawItems.length - 1];
    adjustable.work += remainder;
  }
  const occurrenceTotals = rawItems.reduce<Record<string, number>>((totals, item) => {
    totals[item.exerciseId] = (totals[item.exerciseId] ?? 0) + 1;
    return totals;
  }, {});
  const occurrenceCursor: Record<string, number> = {};
  const items: CustomItem[] = rawItems.map((item) => {
    const occurrence = (occurrenceCursor[item.exerciseId] ?? 0) + 1;
    occurrenceCursor[item.exerciseId] = occurrence;
    const occurrences = occurrenceTotals[item.exerciseId];
    return { ...item, occurrence, occurrences, intentionalRepeat: occurrences > 1 };
  });
  const total = items.reduce((sum, item) => sum + item.work + item.rest, 0);
  if (total !== seconds) warnings.push(`The available exercise pool produced ${total} seconds instead of ${seconds}; review the selected equipment or blocks.`);
  const summary = safeOrder.flatMap((block): CustomPlanSummary[] => {
    const blockItems = items.filter((item) => item.block === block);
    return blockItems.length ? [{
      block,
      intervals: blockItems.length,
      uniqueExercises: new Set(blockItems.map((item) => item.exerciseId)).size,
      rounds: Math.max(...blockItems.map((item) => item.rounds)),
    }] : [];
  });
  return {
    mode: "custom",
    seconds: total,
    items,
    warnings,
    summary,
    title: request.focuses.length ? request.focuses.map((focus) => focus === "lsit" ? "L-Sit" : focus[0].toUpperCase() + focus.slice(1)).join(" + ") : "Custom Session",
  };
}
