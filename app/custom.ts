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
};
export type CustomItem = { exerciseId: string; block: "warmup" | "pre" | "skill" | "strength" | "lab" | "cooldown"; work: number; rest: number };
export type CustomPlan = { mode: "custom"; seconds: number; items: CustomItem[]; warnings: string[]; title: string };

const defaultBlocks: CustomBlocks = { warmup: true, preparation: true, skill: true, strength: true, cooldown: true, lab: false };
const focusMap: Record<CustomFocus, Focus[]> = {
  handstand: ["line", "entry", "balance", "exit", "overhead-load"],
  core: ["hollow", "anti-extension", "anti-rotation", "pelvic-control"],
  compression: ["compression"],
  lsit: ["lsit", "compression", "support"],
  planche: ["planche", "support", "horizontal-push"],
  pushing: ["horizontal-push", "vertical-push"],
  support: ["support", "transition"],
  mobility: ["wrist", "shoulder-mobility", "thoracic-reset", "breathing"],
  conditioning: ["support", "anti-rotation"],
};
const sectionFor = (exercise: Exercise): CustomItem["block"] => {
  if (exercise.category === "Warm-up") return "warmup";
  if (exercise.category === "Pre-Handstand") return "pre";
  if (exercise.category === "Handstand") return "skill";
  if (exercise.category === "Cooldown") return "cooldown";
  if (exercise.category === "Calisthenics") return "lab";
  return "strength";
};
const levelFor = (difficulty: CustomDifficulty): DifficultyLevel => difficulty === "easy" ? "L1" : difficulty === "hard" ? "L3" : "L2";
const score = (exercise: Exercise, focuses: CustomFocus[], level: DifficultyLevel, recent: Set<string>) => {
  const focusSet = new Set(focuses.flatMap((focus) => focusMap[focus]));
  let value = focusSet.has(exercise.primaryFocus) ? 8 : exercise.secondaryFocus.some((focus) => focusSet.has(focus)) ? 4 : 0;
  if (exercise.availableLevels.includes(level)) value += 3;
  if (recent.has(exercise.id)) value -= 4;
  if (exercise.loadTags?.includes("low_fatigue")) value += 1;
  return value;
};

export function buildCustomSession(request: CustomRequest): CustomPlan {
  const blocks = { ...defaultBlocks, ...request.blocks };
  const level = levelFor(request.difficulty);
  const equipment = new Set(request.equipment);
  const recent = new Set(request.recentIds ?? []);
  const warnings: string[] = [];
  if (!blocks.preparation && (request.focuses.includes("handstand") || request.focuses.includes("planche"))) {
    warnings.push("Preparation is off before a high-load skill; keep the first attempts conservative.");
  }
  const eligible = Object.values(exercises)
    .filter((exercise) => (exercise.requiredEquipment ?? (exercise.category === "Cooldown" || exercise.category === "Warm-up" ? ["floor"] : ["parallettes", "floor"]))
      .every((item) => equipment.has(item)))
    .filter((exercise) => exercise.level === "ALL" || exercise.availableLevels.includes(level))
    .filter((exercise) => request.focuses.length === 0 || request.focuses.some((focus) => [exercise.primaryFocus, ...exercise.secondaryFocus].some((tag) => focusMap[focus].includes(tag))))
    .sort((a, b) => score(b, request.focuses, level, recent) - score(a, request.focuses, level, recent));

  const pick = (block: CustomItem["block"], fallbackCategory?: Exercise["category"]): Exercise | undefined => {
    const pool = eligible.filter((exercise) => sectionFor(exercise) === block);
    return pool[0] ?? eligible.find((exercise) => fallbackCategory ? exercise.category === fallbackCategory : true);
  };
  const items: CustomItem[] = [];
  const add = (block: CustomItem["block"], count: number, work: number, rest: number, fallback?: Exercise["category"]) => {
    const used = new Set(items.map((item) => item.exerciseId));
    for (let index = 0; index < count; index += 1) {
      const candidate = eligible.find((exercise) => sectionFor(exercise) === block && !used.has(exercise.id)) ?? pick(block, fallback);
      if (!candidate) continue;
      used.add(candidate.id);
      items.push({ exerciseId: candidate.id, block, work, rest });
    }
  };

  // Small sessions remain coherent: warm-up → prep → skill → strength → reset.
  const seconds = Math.max(60, Math.round(request.seconds));
  if (blocks.warmup && seconds >= 180) add("warmup", 3, 30, 15, "Warm-up");
  if (blocks.preparation && seconds >= 300) add("pre", 2, 30, 15, "Pre-Handstand");
  if (blocks.skill && request.focuses.some((focus) => focus === "handstand" || focus === "planche" || focus === "lsit")) add("skill", 1, 30, 30, "Handstand");
  if (blocks.strength) add("strength", seconds >= 900 ? 4 : seconds >= 600 ? 3 : 2, 40, 20);
  if (blocks.lab && seconds >= 300) add("lab", 1, 30, 30, "Calisthenics");
  if (blocks.cooldown) add("cooldown", 1, 30, 0, "Cooldown");

  // Exact-duration allocation: preserve the selected sequence and distribute
  // the available seconds without inventing unrelated movements.
  let desired = items.reduce((sum, item) => sum + item.work + item.rest, 0);
  if (desired > seconds && items.length) {
    const scale = seconds / desired;
    for (const item of items) { item.work = Math.max(10, Math.round(item.work * scale)); item.rest = Math.max(0, Math.round(item.rest * scale)); }
  }
  let total = items.reduce((sum, item) => sum + item.work + item.rest, 0);
  const cooldown = items.filter((item) => item.block === "cooldown");
  const training = items.filter((item) => item.block !== "cooldown" && item.block !== "warmup");
  const repeatPool = training.length ? training : items.filter((item) => item.block !== "cooldown");
  if (total < seconds && repeatPool.length) {
    let cursor = 0;
    while (true) {
      const candidate = repeatPool[cursor % repeatPool.length];
      const duration = candidate.work + candidate.rest;
      if (total + duration > seconds) break;
      const insertAt = Math.max(0, items.length - cooldown.length);
      items.splice(insertAt, 0, { ...candidate });
      total += duration;
      cursor += 1;
    }
  }
  // Any remainder is smaller than one normal interval. Spread it across the
  // active work periods so the reset never becomes an implausibly long hold.
  const workItems = items.filter((item) => item.block !== "cooldown");
  for (let cursor = 0; total < seconds && workItems.length; cursor = (cursor + 1) % workItems.length) {
    workItems[cursor].work += 1;
    total += 1;
  }
  if (items.length && total > seconds) {
    let excess = total - seconds;
    for (let index = items.length - 1; index >= 0 && excess > 0; index -= 1) {
      const reducibleRest = Math.min(excess, items[index].rest);
      items[index].rest -= reducibleRest; excess -= reducibleRest;
      const reducibleWork = Math.min(excess, Math.max(0, items[index].work - 10));
      items[index].work -= reducibleWork; excess -= reducibleWork;
    }
    total = items.reduce((sum, item) => sum + item.work + item.rest, 0);
  }
  if (total !== seconds) warnings.push(`This short session is ${Math.abs(seconds - total)} seconds from the requested duration; adjust intervals before starting.`);
  return { mode: "custom", seconds: total, items, warnings, title: request.focuses.length ? request.focuses.map((focus) => focus[0].toUpperCase() + focus.slice(1)).join(" + ") : "Custom Session" };
}
