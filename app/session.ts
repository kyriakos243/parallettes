/**
 * Pure session planning primitives.
 *
 * Workout content lives in program.ts. This module deliberately contains no
 * React or browser dependencies so plan timing, swaps, persistence and timer
 * catch-up can be validated without rendering the app.
 */

export const SESSION_LEVELS = ["L1", "L2", "L3"] as const;
export type SessionLevel = (typeof SESSION_LEVELS)[number];
export type ExerciseLevel = SessionLevel | "ALL";

export const levelRank = (level: SessionLevel): number =>
  SESSION_LEVELS.indexOf(level) + 1;

const exerciseLevelRank = (level: ExerciseLevel): number =>
  level === "ALL" ? 0 : levelRank(level);

export const TRAINING_BLOCKS = [
  "warmup",
  "pre",
  "handstand",
  "lab",
  "core",
  "cooldown",
] as const;
export type TrainingBlock = (typeof TRAINING_BLOCKS)[number];

/** Authoritative display and execution order across Recommended and Custom sessions. */
export const sessionBlockOrder = (includeLab: boolean): readonly TrainingBlock[] =>
  includeLab
    ? ["warmup", "pre", "handstand", "lab", "core", "cooldown"]
    : ["warmup", "pre", "handstand", "core", "cooldown"];

export type ExerciseId = string;
export type GateId = string;
export type PrimaryFocus = string;

export type ExerciseCompatibility = {
  id: ExerciseId;
  name?: string;
  /** Difficulty shown to the user. */
  level: ExerciseLevel;
  /** Shared drills may be valid in more than one session level. */
  availableLevels?: readonly SessionLevel[];
  eligibleBlocks: readonly TrainingBlock[];
  primaryFocus: PrimaryFocus;
  /** Omit or use an empty array when a drill is valid on every day. */
  compatibleDays?: readonly number[] | "all";
  gate?: GateId;
  fallbackId?: ExerciseId;
  requiredEquipment?: readonly string[];
  progressionFamily?: string;
};

export type ExerciseLibrary<T extends ExerciseCompatibility = ExerciseCompatibility> =
  Readonly<Record<ExerciseId, T>>;

export type LabPair = Readonly<{ a: ExerciseId; b: ExerciseId }>;

export type WorkoutVariant = Readonly<{
  day: number;
  level: SessionLevel;
  warmup: readonly [ExerciseId, ExerciseId, ExerciseId];
  pre: readonly [ExerciseId, ExerciseId];
  core: readonly [ExerciseId, ExerciseId, ExerciseId, ExerciseId];
  handstand: ExerciseId;
  /** Level 2 and 3 variants provide a recommended drill plus an alternate. */
  lab?: LabPair;
  cooldown: readonly [ExerciseId, ExerciseId];
}>;

export const STABLE_SLOT_IDS = [
  "warmup-1",
  "warmup-2",
  "warmup-3",
  "pre-1",
  "pre-2",
  "handstand-1",
  "lab-a",
  "lab-b",
  "core-1",
  "core-2",
  "core-3",
  "core-4",
  "cooldown-1",
  "cooldown-2",
] as const;
export type StableSlotId = (typeof STABLE_SLOT_IDS)[number];

export type SessionSlot = Readonly<{
  id: StableSlotId;
  block: TrainingBlock;
  position: number;
  defaultExerciseId: ExerciseId;
  primaryFocus: PrimaryFocus;
}>;

export type IntervalTiming = Readonly<{ work: number; rest: number }>;
export type TimingOverride = Partial<IntervalTiming>;
export type TimingOverrides = Readonly<Partial<Record<StableSlotId, TimingOverride>>>;
export type SwapSelections = Readonly<Partial<Record<StableSlotId, ExerciseId>>>;
export type Readiness = Readonly<Record<GateId, boolean>> | ReadonlySet<GateId>;

export const DEFAULT_BLOCK_TIMING: Readonly<
  Record<TrainingBlock, IntervalTiming>
> = {
  warmup: { work: 45, rest: 15 },
  pre: { work: 40, rest: 20 },
  core: { work: 40, rest: 20 },
  handstand: { work: 30, rest: 30 },
  lab: { work: 30, rest: 30 },
  cooldown: { work: 30, rest: 0 },
};

const BLOCK_ROUNDS: Readonly<Record<Exclude<TrainingBlock, "lab" | "cooldown">, number>> = {
  warmup: 1,
  pre: 2,
  core: 3,
  handstand: 5,
};

export type PlanInterval = Readonly<{
  id: string;
  kind: "work" | "rest";
  duration: number;
  block: TrainingBlock;
  slotId: StableSlotId;
  exerciseId?: ExerciseId;
  label: string;
  round: number;
  rounds: number;
}>;

export type SessionPlan = Readonly<{
  schemaVersion: 1;
  day: number;
  level: SessionLevel;
  includeLab: boolean;
  intervals: readonly PlanInterval[];
  totalSeconds: number;
}>;

export type BuildSessionOptions = Readonly<{
  variant: WorkoutVariant;
  exercises: ExerciseLibrary;
  includeLab?: boolean;
  swaps?: SwapSelections;
  timings?: TimingOverrides;
  readiness?: Readiness;
}>;

const hasGate = (readiness: Readiness | undefined, gate: GateId): boolean => {
  if (!readiness) return false;
  if (readiness instanceof Set) return readiness.has(gate);
  return (readiness as Readonly<Record<GateId, boolean>>)[gate] === true;
};

const supportsDay = (exercise: ExerciseCompatibility, day: number): boolean =>
  !exercise.compatibleDays || exercise.compatibleDays === "all" ||
  exercise.compatibleDays.length === 0 || exercise.compatibleDays.includes(day);

const supportsLevel = (
  exercise: ExerciseCompatibility,
  level: SessionLevel,
): boolean => exercise.level === "ALL" ||
  (exercise.availableLevels ?? [exercise.level]).includes(level);

const focusGroups: readonly (readonly string[])[] = [
  ["wrist", "grip"],
  ["shoulder-mobility", "thoracic-reset", "hamstring-mobility", "hip-mobility", "adductor-mobility"],
  ["hollow", "anti-extension", "anti-rotation", "pelvic-control", "posterior-chain"],
  ["balance", "grip"],
];

/** Same-role families let the swap picker add useful variety without mixing
 * unrelated blocks or difficulty. Exact-focus matches still sort first. */
const focusCompatible = (exerciseFocus: string, slotFocus: string): boolean =>
  exerciseFocus === slotFocus || focusGroups.some((group) =>
    group.includes(exerciseFocus) && group.includes(slotFocus));

export const isExerciseStructurallyCompatible = (
  exercise: ExerciseCompatibility,
  slot: Pick<SessionSlot, "block" | "primaryFocus">,
  day: number,
): boolean =>
  exercise.eligibleBlocks.includes(slot.block) &&
  // Lab is an explicitly selected extra skill track. Unlike a programmed
  // core slot, its purpose may change from L-sit to planche or pushing.
  (slot.block === "lab" || focusCompatible(exercise.primaryFocus, slot.primaryFocus)) &&
  supportsDay(exercise, day);

export const isExerciseCompatible = (
  exercise: ExerciseCompatibility,
  slot: Pick<SessionSlot, "block" | "primaryFocus">,
  day: number,
  level: SessionLevel,
): boolean =>
  isExerciseStructurallyCompatible(exercise, slot, day) &&
  supportsLevel(exercise, level);

export function resolveGatedExercise<T extends ExerciseCompatibility>(
  requestedId: ExerciseId,
  exercises: ExerciseLibrary<T>,
  readiness?: Readiness,
): T {
  const visited = new Set<ExerciseId>();
  let currentId = requestedId;

  while (true) {
    if (visited.has(currentId)) {
      throw new Error(`Fallback cycle detected at ${currentId}`);
    }
    visited.add(currentId);

    const exercise = exercises[currentId];
    if (!exercise) throw new Error(`Unknown exercise: ${currentId}`);
    if (!exercise.gate || hasGate(readiness, exercise.gate)) return exercise;
    if (!exercise.fallbackId) {
      throw new Error(`${exercise.id} requires ${exercise.gate} but has no fallback`);
    }
    currentId = exercise.fallbackId;
  }
}

const makeSlots = (
  variant: WorkoutVariant,
  exercises: ExerciseLibrary,
  includeLab: boolean,
): SessionSlot[] => {
  const raw: Array<readonly [StableSlotId, TrainingBlock, number, ExerciseId]> = [
    ["warmup-1", "warmup", 0, variant.warmup[0]],
    ["warmup-2", "warmup", 1, variant.warmup[1]],
    ["warmup-3", "warmup", 2, variant.warmup[2]],
    ["pre-1", "pre", 0, variant.pre[0]],
    ["pre-2", "pre", 1, variant.pre[1]],
    ["handstand-1", "handstand", 0, variant.handstand],
  ];

  if (includeLab) {
    if (!variant.lab) {
      throw new Error(`Day ${variant.day} Level ${variant.level} has no Calisthenics Lab`);
    }
    // The V2.1 Lab is one selected skill repeated for five quality rounds.
    // `lab.b` remains an authored alternate surfaced through the swap picker.
    raw.push(["lab-a", "lab", 0, variant.lab.a]);
  }

  raw.push(
    ["core-1", "core", 0, variant.core[0]],
    ["core-2", "core", 1, variant.core[1]],
    ["core-3", "core", 2, variant.core[2]],
    ["core-4", "core", 3, variant.core[3]],
  );

  raw.push(
    ["cooldown-1", "cooldown", 0, variant.cooldown[0]],
    ["cooldown-2", "cooldown", 1, variant.cooldown[1]],
  );

  return raw.map(([id, block, position, defaultExerciseId]) => {
    const exercise = exercises[defaultExerciseId];
    if (!exercise) throw new Error(`Unknown default exercise: ${defaultExerciseId}`);
    return {
      id,
      block,
      position,
      defaultExerciseId,
      primaryFocus: exercise.primaryFocus,
    };
  });
};

const timingFor = (
  slot: SessionSlot,
  timings: TimingOverrides | undefined,
): IntervalTiming => {
  const base = DEFAULT_BLOCK_TIMING[slot.block];
  const override = timings?.[slot.id];
  const work = override?.work ?? base.work;
  const rest = override?.rest ?? base.rest;
  if (!Number.isFinite(work) || !Number.isFinite(rest) || work < 1 || rest < 0) {
    throw new Error(`Invalid timing for ${slot.id}`);
  }
  return { work: Math.round(work), rest: Math.round(rest) };
};

const assignmentFor = (
  slot: SessionSlot,
  options: BuildSessionOptions,
): ExerciseCompatibility => {
  const requestedId = options.swaps?.[slot.id] ?? slot.defaultExerciseId;
  const requested = options.exercises[requestedId];
  if (!requested) throw new Error(`Unknown exercise: ${requestedId}`);
  if (
    !isExerciseStructurallyCompatible(requested, slot, options.variant.day) ||
    !supportsLevel(requested, options.variant.level)
  ) {
    throw new Error(
      `${requested.id} is incompatible with ${slot.id} ` +
      `(Day ${options.variant.day}, Level ${options.variant.level}, ${slot.primaryFocus})`,
    );
  }
  // An explicit fallback is trusted as the safe regression for this slot. The
  // requested exercise—not its readiness fallback—defines swap compatibility.
  return resolveGatedExercise(requestedId, options.exercises, options.readiness);
};

const appendInterval = (
  intervals: PlanInterval[],
  slot: SessionSlot,
  exercise: ExerciseCompatibility,
  timing: IntervalTiming,
  round: number,
  rounds: number,
) => {
  intervals.push({
    id: `${slot.id}:r${round}:work`,
    kind: "work",
    duration: timing.work,
    block: slot.block,
    slotId: slot.id,
    exerciseId: exercise.id,
    label: exercise.name ?? exercise.id,
    round,
    rounds,
  });
  if (timing.rest > 0) {
    intervals.push({
      id: `${slot.id}:r${round}:rest`,
      kind: "rest",
      duration: timing.rest,
      block: slot.block,
      slotId: slot.id,
      label: slot.block === "warmup" ? "Transition" : "Rest",
      round,
      rounds,
    });
  }
};

export function buildSessionPlan(options: BuildSessionOptions): SessionPlan {
  const includeLab = options.includeLab === true;
  if (includeLab && options.variant.level === "L1") {
    throw new Error("The Calisthenics Lab is available only at Levels 2 and 3");
  }

  const slots = makeSlots(options.variant, options.exercises, includeLab);
  const byBlock = (block: TrainingBlock) => slots.filter((slot) => slot.block === block);
  const intervals: PlanInterval[] = [];

  // Complete preparation and motor-control work before either optional Lab
  // practice or the fatigue-heavy Abs/Core circuit.
  for (const block of ["warmup", "pre", "handstand"] as const) {
    const rounds = BLOCK_ROUNDS[block];
    for (let round = 1; round <= rounds; round += 1) {
      for (const slot of byBlock(block)) {
        appendInterval(
          intervals,
          slot,
          assignmentFor(slot, options),
          timingFor(slot, options.timings),
          round,
          rounds,
        );
      }
    }
  }

  if (includeLab) {
    const labSlots = byBlock("lab");
    const labA = labSlots.find((slot) => slot.id === "lab-a");
    if (!labA) throw new Error("Calisthenics Lab requires one selected skill");
    Array.from({ length: 5 }).forEach((_, index) => {
      appendInterval(
        intervals,
        labA,
        assignmentFor(labA, options),
        timingFor(labA, options.timings),
        index + 1,
        5,
      );
    });
  }

  for (const block of ["core"] as const) {
    const rounds = BLOCK_ROUNDS[block];
    for (let round = 1; round <= rounds; round += 1) {
      for (const slot of byBlock(block)) {
        appendInterval(
          intervals,
          slot,
          assignmentFor(slot, options),
          timingFor(slot, options.timings),
          round,
          rounds,
        );
      }
    }
  }

  for (const slot of byBlock("cooldown")) {
    appendInterval(
      intervals,
      slot,
      assignmentFor(slot, options),
      timingFor(slot, options.timings),
      slot.position + 1,
      2,
    );
  }

  return {
    schemaVersion: 1,
    day: options.variant.day,
    level: options.variant.level,
    includeLab,
    intervals,
    totalSeconds: intervals.reduce((total, interval) => total + interval.duration, 0),
  };
}

export type SwapDifficulty = "same" | "easier" | "harder" | "all";

export type CompatibleSwapOptions = Readonly<{
  slot: SessionSlot;
  exercises: ExerciseLibrary;
  day: number;
  level: SessionLevel;
  readiness?: Readiness;
  difficulty?: SwapDifficulty;
  includeLocked?: boolean;
  equipment?: readonly string[];
}>;

const supportsEquipment = (
  exercise: ExerciseCompatibility,
  equipment: readonly string[] | undefined,
): boolean => !equipment || (exercise.requiredEquipment ?? []).every((item) => equipment.includes(item));

export function compatibleSwaps(options: CompatibleSwapOptions): ExerciseCompatibility[] {
  const base = options.exercises[options.slot.defaultExerciseId];
  if (!base) throw new Error(`Unknown default exercise: ${options.slot.defaultExerciseId}`);
  const difficulty = options.difficulty ?? "same";

  return Object.values(options.exercises)
    .filter((exercise) =>
      isExerciseStructurallyCompatible(exercise, options.slot, options.day))
    .filter((exercise) => supportsLevel(exercise, options.level))
    .filter((exercise) => supportsEquipment(exercise, options.equipment))
    .filter((exercise) => {
      if (options.includeLocked || !exercise.gate) return true;
      return hasGate(options.readiness, exercise.gate);
    })
    .filter((exercise) => {
      if (difficulty === "all") return true;
      if (difficulty === "same") {
        return exercise.level === base.level || exercise.level === "ALL";
      }
      if (exercise.level === "ALL" || base.level === "ALL") return false;
      const distance = exerciseLevelRank(exercise.level) - exerciseLevelRank(base.level);
      if (difficulty === "easier") return distance === -1;
      return distance === 1;
    })
    .sort((a, b) => Number(b.progressionFamily === base.progressionFamily) - Number(a.progressionFamily === base.progressionFamily) ||
      exerciseLevelRank(a.level) - exerciseLevelRank(b.level) ||
      (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

export type EquipmentAdaptation = Readonly<{
  swaps: SwapSelections;
  unavailable: readonly StableSlotId[];
}>;

/** Keep the authored slot role, but transparently choose an available safe variation when possible. */
export function adaptSwapsForEquipment(options: Readonly<{
  slots: readonly SessionSlot[];
  exercises: ExerciseLibrary;
  swaps?: SwapSelections;
  day: number;
  level: SessionLevel;
  readiness?: Readiness;
  equipment: readonly string[];
}>): EquipmentAdaptation {
  const swaps: Partial<Record<StableSlotId, string>> = { ...(options.swaps ?? {}) };
  const unavailable: StableSlotId[] = [];
  for (const slot of options.slots) {
    const currentId = swaps[slot.id] ?? slot.defaultExerciseId;
    const current = options.exercises[currentId];
    if (!current) { unavailable.push(slot.id); continue; }
    const resolved = resolveGatedExercise(currentId, options.exercises, options.readiness);
    if (supportsEquipment(resolved, options.equipment)) continue;
    const candidates = compatibleSwaps({
      slot,
      exercises: options.exercises,
      day: options.day,
      level: options.level,
      readiness: options.readiness,
      difficulty: "all",
      equipment: options.equipment,
    });
    const replacement = candidates.find((item) => item.level === current.level || item.level === "ALL") ?? candidates[0];
    if (replacement) swaps[slot.id] = replacement.id;
    else unavailable.push(slot.id);
  }
  return { swaps, unavailable };
}

export const slotsForVariant = (
  variant: WorkoutVariant,
  exercises: ExerciseLibrary,
  includeLab = false,
): readonly SessionSlot[] => makeSlots(variant, exercises, includeLab);

export const variantKey = (day: number, level: SessionLevel): string =>
  `day-${day}:level-${level}`;

export type TimerPosition = Readonly<{
  complete: boolean;
  intervalIndex: number;
  interval?: PlanInterval;
  elapsedInInterval: number;
  remaining: number;
}>;

/**
 * Resolves an absolute elapsed time into a plan position. Unlike a one-step
 * interval timer, this safely catches up across any number of intervals after
 * an iPhone background/screen interruption.
 */
export function locateTimerPosition(
  plan: SessionPlan,
  elapsedSeconds: number,
): TimerPosition {
  const elapsed = Math.max(0, elapsedSeconds);
  if (elapsed >= plan.totalSeconds) {
    return {
      complete: true,
      intervalIndex: plan.intervals.length,
      elapsedInInterval: 0,
      remaining: 0,
    };
  }

  let cursor = 0;
  for (let index = 0; index < plan.intervals.length; index += 1) {
    const interval = plan.intervals[index];
    const end = cursor + interval.duration;
    if (elapsed < end) {
      const elapsedInInterval = elapsed - cursor;
      return {
        complete: false,
        intervalIndex: index,
        interval,
        elapsedInInterval,
        remaining: Math.ceil(interval.duration - elapsedInInterval),
      };
    }
    cursor = end;
  }

  return {
    complete: true,
    intervalIndex: plan.intervals.length,
    elapsedInInterval: 0,
    remaining: 0,
  };
}

export const PLAN_SNAPSHOT_VERSION = 1 as const;
export type PlanSnapshot = Readonly<{
  version: typeof PLAN_SNAPSHOT_VERSION;
  createdAt: string;
  plan: SessionPlan;
}>;

export const createPlanSnapshot = (
  plan: SessionPlan,
  createdAt = new Date().toISOString(),
): PlanSnapshot => ({
  version: PLAN_SNAPSHOT_VERSION,
  createdAt,
  plan: {
    ...plan,
    intervals: plan.intervals.map((interval) => ({ ...interval })),
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parsePlanSnapshot(value: unknown): PlanSnapshot | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed) || parsed.version !== PLAN_SNAPSHOT_VERSION) return null;
  if (typeof parsed.createdAt !== "string" || !isRecord(parsed.plan)) return null;
  const plan = parsed.plan;
  if (
    plan.schemaVersion !== 1 ||
    typeof plan.day !== "number" ||
    !SESSION_LEVELS.includes(plan.level as SessionLevel) ||
    typeof plan.includeLab !== "boolean" ||
    typeof plan.totalSeconds !== "number" ||
    !Array.isArray(plan.intervals)
  ) return null;
  const intervals = plan.intervals as unknown[];
  if (!intervals.every((interval) => {
    if (!isRecord(interval)) return false;
    return typeof interval.id === "string" &&
      (interval.kind === "work" || interval.kind === "rest") &&
      typeof interval.duration === "number" && interval.duration > 0 &&
      TRAINING_BLOCKS.includes(interval.block as TrainingBlock) &&
      STABLE_SLOT_IDS.includes(interval.slotId as StableSlotId) &&
      typeof interval.label === "string" &&
      typeof interval.round === "number" && typeof interval.rounds === "number";
  })) return null;
  const total = intervals.reduce<number>(
    (sum, interval) => sum + (interval as PlanInterval).duration,
    0,
  );
  if (total !== plan.totalSeconds) return null;
  return parsed as unknown as PlanSnapshot;
}

export const APP_STORAGE_VERSION = 2 as const;

export type StoredAppState = {
  version: typeof APP_STORAGE_VERSION;
  selectedDay: number;
  levelsByDay: Record<string, SessionLevel>;
  labByDay: Record<string, boolean>;
  swapsByVariant: Record<string, Partial<Record<StableSlotId, ExerciseId>>>;
  timingsByVariant: Record<string, Partial<Record<StableSlotId, TimingOverride>>>;
  soundOn: boolean;
  readiness: Record<GateId, boolean>;
  recentExerciseIds: ExerciseId[];
  cleanTargetSessions: Record<ExerciseId, number>;
  feedbackByExercise: Record<ExerciseId, "easy" | "right" | "hard">;
};

export const defaultStoredAppState = (): StoredAppState => ({
  version: APP_STORAGE_VERSION,
  selectedDay: 1,
  levelsByDay: { "1": "L1", "2": "L1", "3": "L1", "4": "L1", "5": "L1" },
  labByDay: { "1": false, "2": false, "3": false, "4": false, "5": false },
  swapsByVariant: {},
  timingsByVariant: {},
  soundOn: true,
  readiness: {},
  recentExerciseIds: [],
  cleanTargetSessions: {},
  feedbackByExercise: {},
});

const asLevel = (value: unknown, fallback: SessionLevel = "L1"): SessionLevel => {
  if (SESSION_LEVELS.includes(value as SessionLevel)) return value as SessionLevel;
  if (value === 1) return "L1";
  if (value === 2) return "L2";
  if (value === 3) return "L3";
  return fallback;
};

const sanitizeDay = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : 1;

/**
 * Parses current state and safely migrates the original unversioned settings.
 * Old exercise-keyed swaps/timings are intentionally reset because the new
 * stable slot IDs cannot be inferred safely from arbitrary saved data.
 */
export function parseStoredAppState(
  value: unknown,
  knownExercises?: Readonly<Record<ExerciseId, unknown>>,
): StoredAppState {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return defaultStoredAppState();
    }
  }
  if (!isRecord(parsed)) return defaultStoredAppState();

  if (parsed.version !== APP_STORAGE_VERSION) {
    const migrated = defaultStoredAppState();
    if (typeof parsed.selectedDay === "number") {
      // The original app persisted a zero-based tab index.
      migrated.selectedDay = sanitizeDay(parsed.selectedDay + 1);
    }
    if (typeof parsed.soundOn === "boolean") migrated.soundOn = parsed.soundOn;
    return migrated;
  }

  const next = defaultStoredAppState();
  next.selectedDay = sanitizeDay(parsed.selectedDay);
  next.soundOn = typeof parsed.soundOn === "boolean" ? parsed.soundOn : true;

  if (isRecord(parsed.levelsByDay)) {
    for (let day = 1; day <= 5; day += 1) {
      next.levelsByDay[String(day)] = asLevel(parsed.levelsByDay[String(day)]);
    }
  }
  if (isRecord(parsed.labByDay)) {
    for (let day = 1; day <= 5; day += 1) {
      const enabled = parsed.labByDay[String(day)] === true;
      next.labByDay[String(day)] = enabled &&
        levelRank(next.levelsByDay[String(day)]) >= 2;
    }
  }
  if (isRecord(parsed.readiness)) {
    next.readiness = Object.fromEntries(
      Object.entries(parsed.readiness).filter(([, ready]) => ready === true),
    ) as Record<GateId, boolean>;
  }
  if (Array.isArray(parsed.recentExerciseIds)) {
    next.recentExerciseIds = parsed.recentExerciseIds
      .filter((id): id is string => typeof id === "string" &&
        (!knownExercises || Boolean(knownExercises[id])))
      .slice(-50);
  }
  if (isRecord(parsed.cleanTargetSessions)) {
    next.cleanTargetSessions = Object.fromEntries(
      Object.entries(parsed.cleanTargetSessions).filter(
        ([id, count]) => id.length > 0 && typeof count === "number" &&
          Number.isInteger(count) && count >= 0 && count <= 2 &&
          (!knownExercises || Boolean(knownExercises[id])),
      ),
    ) as Record<ExerciseId, number>;
  }
  if (isRecord(parsed.feedbackByExercise)) {
    next.feedbackByExercise = Object.fromEntries(
      Object.entries(parsed.feedbackByExercise).filter(
        ([id, value]) => ["easy", "right", "hard"].includes(String(value)) &&
          (!knownExercises || Boolean(knownExercises[id])),
      ),
    ) as Record<ExerciseId, "easy" | "right" | "hard">;
  }

  // Slot maps are copied only after strict key/value validation.
  if (isRecord(parsed.swapsByVariant)) {
    for (const [key, rawMap] of Object.entries(parsed.swapsByVariant)) {
      if (!/^day-[1-5]:level-L[1-3]$/u.test(key) || !isRecord(rawMap)) continue;
      const safe = Object.fromEntries(
        Object.entries(rawMap).filter(
          ([slot, id]) => STABLE_SLOT_IDS.includes(slot as StableSlotId) &&
            typeof id === "string" && id.length > 0 &&
            (!knownExercises || Boolean(knownExercises[id])),
        ),
      ) as Partial<Record<StableSlotId, ExerciseId>>;
      next.swapsByVariant[key] = safe;
    }
  }
  if (isRecord(parsed.timingsByVariant)) {
    for (const [key, rawMap] of Object.entries(parsed.timingsByVariant)) {
      if (!/^day-[1-5]:level-L[1-3]$/u.test(key) || !isRecord(rawMap)) continue;
      const safe: Partial<Record<StableSlotId, TimingOverride>> = {};
      for (const [slot, rawTiming] of Object.entries(rawMap)) {
        if (!STABLE_SLOT_IDS.includes(slot as StableSlotId) || !isRecord(rawTiming)) continue;
        const work = typeof rawTiming.work === "number" && rawTiming.work >= 1 &&
          rawTiming.work <= 180 ? Math.round(rawTiming.work) : undefined;
        const rest = typeof rawTiming.rest === "number" && rawTiming.rest >= 0 &&
          rawTiming.rest <= 180 ? Math.round(rawTiming.rest) : undefined;
        if (work !== undefined || rest !== undefined) {
          safe[slot as StableSlotId] = { work, rest };
        }
      }
      next.timingsByVariant[key] = safe;
    }
  }

  return next;
}
