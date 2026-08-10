"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Dumbbell,
  Gauge,
  History,
  Info,
  LockKeyhole,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExerciseDemo } from "./ExerciseDemo";
import { MotionGuide, type MotionPreset } from "./MotionGuide";
import { buildCustomSession, type CustomBlocks, type CustomDifficulty, type CustomFocus } from "./custom";
import { deleteProfile, exportProfile, importProfile, listProfiles, newProfile, remoteSyncAvailable, saveProfile, syncProfile, type ProfileRecord, type SaveMode } from "./profileStore";
import {
  exercises,
  levelLabels,
  readiness,
  skillProgressionPaths,
  toSessionVariant,
  warmupsByVariant,
  workouts,
  type Category,
  type DayNumber,
  type DifficultyLevel,
  type Exercise,
  type Prescription,
  type ReadinessGateId,
  type WorkoutBlock,
} from "./program";
import {
  DEFAULT_BLOCK_TIMING,
  adaptSwapsForEquipment,
  buildSessionPlan,
  sessionBlockOrder,
  compatibleSwaps,
  defaultStoredAppState,
  locateTimerPosition,
  parseStoredAppState,
  slotsForVariant,
  variantKey,
  type IntervalTiming,
  type PlanInterval,
  type SessionPlan,
  type SessionSlot,
  type StableSlotId,
  type StoredAppState,
  type SwapDifficulty,
  type TimerPosition,
  type TimingOverride,
} from "./session";

const STORAGE_KEY = "parallette25-settings-v2";
const LEGACY_STORAGE_KEY = "parallette25-settings";
const HISTORY_KEY = "parallette25-history-v1";
const scopedKey = (base: string, profileId?: string) => `${base}:${profileId ?? "guest"}`;

type HistoryEntry = {
  id: string;
  completedAt: string;
  day: number;
  level: DifficultyLevel;
  title: string;
  seconds: number;
  lab: boolean;
  mode?: SaveMode;
  status?: "complete" | "modified" | "partial";
};

type TimelineItem = readonly [string, string, string, WorkoutBlock];
type TodayTimingMode = "shorter" | "reallocate";
type LabTrack = "lsit" | "planche" | "pushing" | "support";

const labTrackLabels: Record<LabTrack, string> = {
  lsit: "L-Sit / Compression",
  planche: "Planche Foundation",
  pushing: "Pushing Strength",
  support: "Support / Transition",
};

const labTrackFor = (exercise: Exercise): LabTrack | null => {
  const focuses = [exercise.primaryFocus, ...(exercise.secondaryFocus ?? [])];
  if (focuses.includes("lsit") || focuses.includes("compression")) return "lsit";
  if (focuses.includes("planche")) return "planche";
  if (focuses.includes("horizontal-push") || focuses.includes("vertical-push")) return "pushing";
  if (focuses.includes("support") || focuses.includes("transition") || focuses.includes("balance")) return "support";
  return null;
};

const blockLabels: Record<WorkoutBlock, string> = {
  warmup: "Dynamic warm-up",
  pre: "Pre-handstand preparation",
  core: "Abs / Core circuit",
  handstand: "Handstand skill",
  lab: "Calisthenics Lab",
  cooldown: "Cooldown & stretching",
};
const displayBlockLabel = (block: WorkoutBlock, custom = false) => custom && block === "handstand" ? "Skill practice" : blockLabels[block];

const blockMeta: Record<WorkoutBlock, string> = {
  warmup: "1 round • 45s work / 15s transition",
  pre: "2 rounds • 40s work / 20s rest",
  core: "3 rounds • 40s work / 20s rest",
  handstand: "5 rounds • 30s practice / 30s complete rest",
  lab: "Optional • one selected skill × 5 rounds • 30s practice / 30s complete rest",
  cooldown: "2 static recovery holds • 30s each",
};

const categoryClass: Record<Category, string> = {
  "Warm-up": "tag-warm",
  "Pre-Handstand": "tag-pre",
  Abs: "tag-abs",
  Core: "tag-core",
  Handstand: "tag-handstand",
  Calisthenics: "tag-lab",
  Conditioning: "tag-conditioning",
  Cooldown: "tag-cooldown",
};

const sectionRounds: Record<WorkoutBlock, number> = {
  warmup: 1,
  pre: 2,
  core: 3,
  handstand: 5,
  lab: 5,
  cooldown: 1,
};

const timelineFor = (withLab: boolean): TimelineItem[] => withLab
  ? [
      ["0:00", "3:00", "Warm-up", "warmup"],
      ["3:00", "7:00", "Prepare", "pre"],
      ["7:00", "12:00", "Handstand", "handstand"],
      ["12:00", "17:00", "Skill Lab", "lab"],
      ["17:00", "29:00", "Abs / Core", "core"],
      ["29:00", "30:00", "Cooldown / Stretch", "cooldown"],
    ]
  : [
      ["0:00", "3:00", "Warm-up", "warmup"],
      ["3:00", "7:00", "Prepare", "pre"],
      ["7:00", "12:00", "Handstand", "handstand"],
      ["12:00", "24:00", "Abs / Core", "core"],
      ["24:00", "25:00", "Cooldown / Stretch", "cooldown"],
    ];

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

const downloadText = (filename: string, value: string) => {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const modifyTodayPlan = (
  plan: SessionPlan,
  skipped: ReadonlySet<StableSlotId>,
  mode: TodayTimingMode,
): SessionPlan => {
  const kept = plan.intervals.filter((interval) => !skipped.has(interval.slotId));
  if (mode === "shorter" || kept.length === 0) {
    return { ...plan, intervals: kept, totalSeconds: kept.reduce((sum, interval) => sum + interval.duration, 0) };
  }
  const preferredBlocks: WorkoutBlock[] = kept.some((interval) => interval.block === "core")
    ? ["core"]
    : kept.some((interval) => interval.block === "lab")
      ? ["lab", "handstand"]
      : ["handstand"];
  const adjustable = kept.filter((interval) => preferredBlocks.includes(interval.block));
  const fixedSeconds = kept.filter((interval) => !preferredBlocks.includes(interval.block)).reduce((sum, interval) => sum + interval.duration, 0);
  const currentAdjustable = adjustable.reduce((sum, interval) => sum + interval.duration, 0);
  if (currentAdjustable === 0 || plan.totalSeconds <= fixedSeconds) {
    return { ...plan, intervals: kept, totalSeconds: kept.reduce((sum, interval) => sum + interval.duration, 0) };
  }
  const targetAdjustable = plan.totalSeconds - fixedSeconds;
  let remainder = targetAdjustable;
  const durations = new Map<string, number>();
  adjustable.forEach((interval) => {
    const duration = Math.max(5, Math.floor(interval.duration * targetAdjustable / currentAdjustable));
    durations.set(interval.id, duration);
    remainder -= duration;
  });
  for (let index = 0; remainder > 0; index = (index + 1) % adjustable.length) {
    const interval = adjustable[index];
    durations.set(interval.id, (durations.get(interval.id) ?? interval.duration) + 1);
    remainder -= 1;
  }
  const intervals = kept.map((interval) => durations.has(interval.id) ? { ...interval, duration: durations.get(interval.id) as number } : interval);
  return { ...plan, intervals, totalSeconds: intervals.reduce((sum, interval) => sum + interval.duration, 0) };
};

const effectiveReadiness = (raw: Record<string, boolean>) => {
  const ready: Record<string, boolean> = { ...raw, G0_LOAD: true };
  ready.G3_ENTRY = raw.G3_ENTRY === true && ready.G2_INVERSION === true;
  ready.G4_FREE_BAR = raw.G4_FREE_BAR === true &&
    ready.G1_SUPPORT === true && ready.G2_INVERSION === true && ready.G3_ENTRY === true;
  ready.G5_LSIT = raw.G5_LSIT === true && ready.G1_SUPPORT === true;
  ready.G6_PLANCHE = raw.G6_PLANCHE === true && ready.G1_SUPPORT === true;
  ready.G7_PIKE_PUSH = raw.G7_PIKE_PUSH === true;
  return ready;
};

const slotTiming = (
  slot: SessionSlot,
  timings: Partial<Record<StableSlotId, TimingOverride>>,
): IntervalTiming => ({
  work: timings[slot.id]?.work ?? DEFAULT_BLOCK_TIMING[slot.block].work,
  rest: timings[slot.id]?.rest ?? DEFAULT_BLOCK_TIMING[slot.block].rest,
});

function SectionIcon({ block }: { block: WorkoutBlock }) {
  if (block === "core") return <Dumbbell aria-hidden="true" />;
  if (block === "pre" || block === "handstand") return <Sparkles aria-hidden="true" />;
  if (block === "lab") return <WandSparkles aria-hidden="true" />;
  if (block === "cooldown") return <RefreshCw aria-hidden="true" />;
  return <Gauge aria-hidden="true" />;
}

function Stepper({
  label,
  value,
  onChange,
  min = 5,
  max = 180,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper-row">
      <div><span>{label}</span><strong>{value}s</strong></div>
      <div className="stepper-controls">
        <button type="button" aria-label={`Reduce ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 5))}><Minus /></button>
        <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 5))}><Plus /></button>
      </div>
    </div>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
      >
        <div className="drawer-handle" />
        <div className="drawer-title-row">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

function ExerciseCard({
  slot,
  exercise,
  requested,
  target,
  timing,
  rounds,
  onSwap,
  onEdit,
  feedback,
  onFeedback,
  equipmentAdjusted = false,
}: {
  slot: SessionSlot;
  exercise: Exercise;
  requested: Exercise;
  target: string;
  timing: IntervalTiming;
  rounds: number | string;
  onSwap: () => void;
  onEdit: () => void;
  feedback?: "easy" | "right" | "hard";
  onFeedback: (value: "easy" | "right" | "hard") => void;
  equipmentAdjusted?: boolean;
}) {
  const substituted = requested.id !== exercise.id;
  return (
    <motion.article layout className="exercise-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="exercise-visual"><ExerciseDemo exercise={exercise} /></div>
      <div className="exercise-copy">
        <div className="exercise-heading">
          <span className={`category-tag ${categoryClass[exercise.category]}`}>{exercise.category}</span>
          <span className={`level-tag level-${exercise.level}`}>{exercise.level}</span>
          {requested.gate && <span className="gate-tag"><ShieldCheck /> readiness</span>}
          <span className="round-chip">{rounds}×</span>
        </div>
        <h3>{exercise.name}</h3>
        <p className="target"><Clock3 /> {target}</p>
        <ul><li>{exercise.cues[0]}</li><li>{exercise.cues[1]}</li></ul>
        <p className="easier"><strong>Easier:</strong> {exercise.regression}</p>
        <details className="technique-details">
          <summary>Technique</summary>
          <div><strong>How</strong><p>{exercise.how}</p></div>
          <div><strong>Focus</strong><p>{exercise.focus}</p></div>
          <div><strong>Avoid</strong><p>{exercise.avoid}</p></div>
          {exercise.safety && <div><strong>Safety / exit</strong><p>{exercise.safety}</p></div>}
          {exercise.harderId && exercises[exercise.harderId] && <div><strong>Next progression</strong><p>{exercises[exercise.harderId].name}</p></div>}
        </details>
        {substituted && (
          <p className="substitution-note">
            <LockKeyhole /> {requested.name} is readiness-gated, so this safe regression is active.
          </p>
        )}
        {equipmentAdjusted && <p className="substitution-note"><Check /> Adapted to today’s available equipment while keeping the same training role.</p>}
        <div className="exercise-actions">
          <button type="button" className="action-button" onClick={onSwap}><Shuffle /> Swap</button>
          <button type="button" className="action-button" onClick={onEdit}>
            <Settings2 /> {slot.block === "cooldown" ? `${timing.work}s` : `${timing.work}s / ${timing.rest}s`}
          </button>
        </div>
        <div className="feedback-row" aria-label={`Feedback for ${exercise.name}`}>
          <button type="button" className={feedback === "easy" ? "active" : ""} onClick={() => onFeedback("easy")}>Too easy</button>
          <button type="button" className={feedback === "right" ? "active" : ""} onClick={() => onFeedback("right")}>Just right</button>
          <button type="button" className={feedback === "hard" ? "active" : ""} onClick={() => onFeedback("hard")}>Too hard</button>
        </div>
      </div>
    </motion.article>
  );
}

function MediaAuditPage({ page }: { page: number }) {
  const all = Object.values(exercises);
  const pageSize = 12;
  const pages = Math.ceil(all.length / pageSize);
  const safePage = Math.max(0, Math.min(pages - 1, page));
  const visible = all.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return (
    <main className="media-audit-page">
      <header><div><p>INTERNAL VISUAL QA</p><h1>Exercise media • {safePage + 1}/{pages}</h1></div><strong>{all.length} guides</strong></header>
      <div className="media-audit-grid">
        {visible.map((exercise) => (
          <article key={exercise.id}>
            <div><ExerciseDemo exercise={exercise} /></div>
            <h2>{exercise.name}</h2>
            <p>{exercise.id} • {exercise.level} • {exercise.media.kind}</p>
            <span>{exercise.media.specification}</span>
          </article>
        ))}
      </div>
    </main>
  );
}

function RigApprovalPage() {
  const tests: Array<{ preset: MotionPreset; name: string; checks: string }> = [
    { preset: "neutral-standing-avatar", name: "Neutral standing avatar", checks: "Face, hair, proportions, fitted outfit and recurring visual identity." },
    { preset: "support-hold", name: "Parallette Support Hold", checks: "Locked elbows, depressed shoulders, hands gripping equal-height bars." },
    { preset: "full-lsit-attempt", name: "Full L-Sit", checks: "Straight knees, compression, support height and static-hold treatment." },
    { preset: "chest-wall-line", name: "Chest-to-Wall Handstand", checks: "Wall orientation, toe contact, functional gaze and active shoulders." },
    { preset: "planche-lean-hold", name: "Planche Lean", checks: "Straight arms, protraction, forward loading and grounded toes." },
    { preset: "parallette-pike-pushup", name: "Pike Push-Up", checks: "Smooth head path, bent elbows, controlled depth and return." },
  ];
  return <main className="media-audit-page rig-approval-page"><header><div><p>PARALLETTE25 · BATCH 0</p><h1>Avatar & rig approval</h1></div><strong>6 representative demonstrations</strong></header><div className="media-audit-grid">{tests.map((test) => <article key={test.preset}><div><MotionGuide preset={test.preset} /></div><h2>{test.name}</h2><p>{test.preset}</p><span>{test.checks}</span></article>)}</div></main>;
}

export default function Home() {
  const [settings, setSettings] = useState<StoredAppState>(() => defaultStoredAppState());
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [swapSlotId, setSwapSlotId] = useState<StableSlotId | null>(null);
  const [swapFilter, setSwapFilter] = useState<SwapDifficulty>("same");
  const [editSlotId, setEditSlotId] = useState<StableSlotId | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [customizeTodayOpen, setCustomizeTodayOpen] = useState(false);
  const [todaySkippedByVariant, setTodaySkippedByVariant] = useState<Record<string, StableSlotId[]>>({});
  const [todayTimingMode, setTodayTimingMode] = useState<TodayTimingMode>("shorter");
  const [todayLevelByDay, setTodayLevelByDay] = useState<Partial<Record<DayNumber, DifficultyLevel>>>({});
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline" | "error">("saved");
  const [customFocuses, setCustomFocuses] = useState<CustomFocus[]>(["core"]);
  const [customDifficulty, setCustomDifficulty] = useState<CustomDifficulty>("recommended");
  const [customSeconds, setCustomSeconds] = useState(900);
  const [customEquipment, setCustomEquipment] = useState(["parallettes", "floor", "wall"]);
  const [todayEquipment, setTodayEquipment] = useState(["parallettes", "floor", "wall"]);
  const [customPlan, setCustomPlan] = useState<ReturnType<typeof buildCustomSession> | null>(null);
  const [customAdvanced, setCustomAdvanced] = useState(false);
  const [customPreferProgression, setCustomPreferProgression] = useState(true);
  const [customPreferVariety, setCustomPreferVariety] = useState(true);
  const [customBlocks, setCustomBlocks] = useState<CustomBlocks>({ warmup: true, preparation: true, skill: true, strength: true, cooldown: true, lab: false });
  const [undoSwaps, setUndoSwaps] = useState<{ key: string; swaps: Partial<Record<StableSlotId, string>> } | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>("normal");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<SessionPlan | null>(null);
  const [timerPosition, setTimerPosition] = useState<TimerPosition | null>(null);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [activeSessionModified, setActiveSessionModified] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<Record<string, "easy" | "right" | "hard">>({});
  const [sessionCleanTargets, setSessionCleanTargets] = useState<Record<string, boolean>>({});
  const anchorRef = useRef(0);
  const elapsedBaseRef = useRef(0);
  const lastIntervalRef = useRef(-1);
  const completionRecordedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  const day = workouts.find((item) => item.day === settings.selectedDay) ?? workouts[0];
  const preferredLevel = settings.levelsByDay[String(day.day)] ?? "L1";
  const level = todayLevelByDay[day.day] ?? preferredLevel;
  const includeLab = level !== "L1" && settings.labByDay[String(day.day)] === true;
  const key = variantKey(day.day, level);
  const variant = useMemo(() => toSessionVariant(day.day, level), [day.day, level]);
  const activeSwaps = settings.swapsByVariant[key] ?? {};
  const activeTimings = settings.timingsByVariant[key] ?? {};
  const ready = useMemo(() => effectiveReadiness(settings.readiness), [settings.readiness]);

  const slots = useMemo(
    () => slotsForVariant(variant, exercises, includeLab),
    [includeLab, variant],
  );
  const equipmentAdaptation = useMemo(() => adaptSwapsForEquipment({
    slots, exercises, swaps: activeSwaps, day: day.day, level, readiness: ready, equipment: todayEquipment,
  }), [activeSwaps, day.day, level, ready, slots, todayEquipment]);
  const equipmentSwaps = equipmentAdaptation.swaps;

  const basePreviewPlan = useMemo(() => buildSessionPlan({
    variant,
    exercises,
    includeLab,
    swaps: equipmentSwaps,
    timings: activeTimings,
    readiness: ready,
  }), [activeTimings, equipmentSwaps, includeLab, ready, variant]);
  const skippedToday = useMemo(() => new Set(todaySkippedByVariant[key] ?? []), [key, todaySkippedByVariant]);
  const unavailableToday = useMemo(() => new Set(equipmentAdaptation.unavailable), [equipmentAdaptation]);
  const previewPlan = useMemo(
    () => modifyTodayPlan(basePreviewPlan, new Set([...skippedToday, ...unavailableToday]), todayTimingMode),
    [basePreviewPlan, skippedToday, todayTimingMode, unavailableToday],
  );
  const previewModified = level !== preferredLevel || skippedToday.size > 0 || unavailableToday.size > 0 ||
    Object.keys(activeSwaps).length > 0 || Object.keys(activeTimings).length > 0 ||
    slots.some((slot) => equipmentSwaps[slot.id] !== activeSwaps[slot.id]);
  const timeline = timelineFor(includeLab);
  const expectedSeconds = includeLab ? 1800 : 1500;
  const exactDefault = previewPlan.totalSeconds === expectedSeconds;

  useEffect(() => {
    const current = localStorage.getItem(scopedKey(STORAGE_KEY));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    setSettings(parseStoredAppState(current ?? legacy));
    try {
      const storedHistory = JSON.parse(localStorage.getItem(scopedKey(HISTORY_KEY)) ?? "[]");
      if (Array.isArray(storedHistory)) setHistory(storedHistory.slice(0, 12));
    } catch {
      setHistory([]);
    }
    setHydrated(true);
    void listProfiles().then((items) => {
      setProfiles(items);
      const lastId = localStorage.getItem("parallette25-last-profile");
      const last = items.find((item) => item.profileId === lastId) ?? items[0] ?? null;
      if (last) void openProfile(last);
      else setProfileOpen(true);
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    if (window.location.hash) return () => { window.history.scrollRestoration = previousRestoration; };

    const alignToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    alignToTop();
    const frame = window.requestAnimationFrame(alignToTop);
    const timer = window.setTimeout(alignToTop, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  const historyForProfile = (next: ProfileRecord): HistoryEntry[] => next.history.map((item) => ({
    id: item.id,
    completedAt: item.completedAt,
    day: item.day ?? 0,
    level: (item as { level?: DifficultyLevel }).level ?? "L1",
    title: (item as { title?: string }).title ?? (item.day ? `Day ${item.day}` : "Custom Session"),
    seconds: item.seconds ?? 0,
    lab: (item as { lab?: boolean }).lab === true,
    mode: item.mode as SaveMode | undefined,
    status: item.status,
  })).slice(-12).reverse();

  const openProfile = async (next: ProfileRecord) => {
    const savedState = localStorage.getItem(scopedKey(STORAGE_KEY, next.profileId));
    const preferenceState = (next.preferences as { appState?: unknown }).appState;
    const nextSettings = parseStoredAppState(savedState ?? preferenceState ?? defaultStoredAppState(), exercises);
    nextSettings.selectedDay = next.nextProgramDay >= 1 && next.nextProgramDay <= 5 ? next.nextProgramDay : nextSettings.selectedDay;
    nextSettings.readiness = { ...nextSettings.readiness, ...next.readiness };
    setSettings(nextSettings);
    const savedHistory = localStorage.getItem(scopedKey(HISTORY_KEY, next.profileId));
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory) as HistoryEntry[]); }
      catch { setHistory(historyForProfile(next)); }
    } else setHistory(historyForProfile(next));
    setCustomEquipment(next.equipment.length ? next.equipment : ["parallettes", "floor", "wall"]);
    setTodayEquipment(next.equipment.length ? next.equipment : ["parallettes", "floor", "wall"]);
    const preferredSaveMode = (next.preferences as { saveMode?: SaveMode }).saveMode;
    setSaveMode(preferredSaveMode === "practice" || preferredSaveMode === "guest" ? preferredSaveMode : "normal");
    setProfile(next);
    localStorage.setItem("parallette25-last-profile", next.profileId);
    setProfileOpen(false);
  };
  const openGuest = () => {
    const guestState = parseStoredAppState(localStorage.getItem(scopedKey(STORAGE_KEY)), exercises);
    setSettings(guestState);
    try { setHistory(JSON.parse(localStorage.getItem(scopedKey(HISTORY_KEY)) ?? "[]") as HistoryEntry[]); }
    catch { setHistory([]); }
    setCustomEquipment(["parallettes", "floor", "wall"]);
    setTodayEquipment(["parallettes", "floor", "wall"]);
    setProfile(null);
    setSaveMode("guest");
    localStorage.removeItem("parallette25-last-profile");
    setProfileOpen(false);
  };
  const selectExistingProfile = (next: ProfileRecord) => {
    if (profile?.profileId !== next.profileId && !window.confirm(`Open existing profile “${next.username}”?\n\nThere is no password in V2. Usernames identify saved training data but are not authentication.`)) return;
    void openProfile(next);
  };
  const createProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    if (profiles.some((item) => item.username.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      window.alert(`The username “${name}” already exists. Choose it above or use a different name.`);
      return;
    }
    const next = await saveProfile(newProfile(name));
    if (next.syncError?.toLocaleLowerCase().includes("username already exists")) {
      await deleteProfile(next.profileId);
      window.alert(`The username “${name}” already exists. Refresh the list and choose that profile, or use a different name.`);
      return;
    }
    setNewProfileName("");
    setProfiles(await listProfiles());
    await openProfile(next);
  };
  const refreshProfiles = async (selectedId?: string) => {
    const items = await listProfiles();
    setProfiles(items);
    if (selectedId) setProfile(items.find((item) => item.profileId === selectedId) ?? null);
  };
  const renameProfile = async () => {
    if (!profile) return;
    const username = window.prompt("Rename this profile", profile.username)?.trim();
    if (!username) return;
    if (profiles.some((item) => item.profileId !== profile.profileId && item.username.toLocaleLowerCase() === username.toLocaleLowerCase())) {
      window.alert(`The username “${username}” already exists.`);
      return;
    }
    await saveProfile({ ...profile, username: username.slice(0, 32) });
    await refreshProfiles(profile.profileId);
  };
  const syncCurrentProfile = async () => {
    if (!profile) return;
    if (!remoteSyncAvailable) { setSyncStatus("offline"); return; }
    setSyncStatus("syncing");
    try {
      const next = await syncProfile(profile);
      setProfile(next);
      await refreshProfiles(next.profileId);
      setSyncStatus(next.pendingSync ? "error" : "saved");
    } catch { setSyncStatus("error"); }
  };
  const importProfileFile = async (file: File) => {
    const imported = importProfile(await file.text());
    if (!imported) { window.alert("That file is not a valid Parallette25 backup."); return; }
    if (profile && !window.confirm(`Replace ${profile.username} with the imported backup? A safety copy will download first.`)) return;
    if (profile) downloadText(`parallette25-${profile.username}-safety.json`, exportProfile(profile));
    const replacement = profile ? { ...imported, profileId: profile.profileId } : imported;
    await saveProfile(replacement);
    await refreshProfiles(replacement.profileId);
  };
  const resetCurrentProfile = async () => {
    if (!profile || !window.confirm(`Reset all training progress for ${profile.username}? This keeps the profile name and preferences.`)) return;
    await saveProfile({ ...profile, history: [], readiness: {}, progression: {}, nextProgramDay: 1 });
    setHistory([]);
    await refreshProfiles(profile.profileId);
  };
  const removeCurrentProfile = async () => {
    if (!profile) return;
    const phrase = window.prompt(`Type ${profile.username} to permanently delete this profile.`);
    if (phrase !== profile.username) return;
    try {
      await deleteProfile(profile.profileId);
      setProfile(null);
      setHistory([]);
      localStorage.removeItem("parallette25-last-profile");
      await refreshProfiles();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The profile could not be deleted. Please reconnect and try again.");
    }
  };
  const toggleDefaultEquipment = async (item: string) => {
    if (!profile) return;
    const current = profile.equipment.length ? profile.equipment : ["parallettes", "floor", "wall"];
    const equipment = current.includes(item)
      ? (current.length > 1 ? current.filter((value) => value !== item) : current)
      : [...current, item];
    const updated = await saveProfile({ ...profile, equipment });
    setProfile(updated);
    setCustomEquipment(equipment);
    setTodayEquipment(equipment);
    await refreshProfiles(updated.profileId);
  };
  const generateCustom = () => setCustomPlan(buildCustomSession({
    focuses: customFocuses,
    equipment: customEquipment as never,
    seconds: customSeconds,
    difficulty: customDifficulty,
    blocks: customAdvanced ? customBlocks : undefined,
    recentIds: settings.recentExerciseIds,
    readiness: ready,
    preferNextProgression: customPreferProgression,
    preferVariety: customPreferVariety,
    feedbackByExercise: settings.feedbackByExercise,
    progressionEvidence: profile?.progression,
  }));

  const openChallenge = (focus?: CustomFocus) => {
    if (!focus) {
      setTodayLevel("L3");
      setReadinessOpen(false);
      setCustomizeTodayOpen(true);
      return;
    }
    setCustomFocuses([focus]);
    setCustomDifficulty("hard");
    setCustomPreferProgression(true);
    setCustomAdvanced(true);
    setReadinessOpen(false);
    setCustomOpen(true);
    setCustomPlan(null);
  };

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(scopedKey(STORAGE_KEY, profile?.profileId), JSON.stringify(settings));
  }, [hydrated, profile?.profileId, settings]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(scopedKey(HISTORY_KEY, profile?.profileId), JSON.stringify(history.slice(0, 12)));
  }, [history, hydrated, profile?.profileId]);

  useEffect(() => {
    if (!hydrated || !profile) return;
    const profileId = profile.profileId;
    const timer = window.setTimeout(() => {
      void saveProfile({
        ...profile,
        readiness: settings.readiness,
        equipment: profile.equipment,
        preferences: { ...profile.preferences, appState: settings, saveMode },
      }).then((updated) => {
        setProfiles((current) => current.map((item) => item.profileId === profileId ? updated : item));
        setProfile((current) => current?.profileId === profileId ? updated : current);
        setSyncStatus(updated.pendingSync ? "offline" : "saved");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hydrated, profile?.profileId, saveMode, settings]);

  useEffect(() => {
    if (!profile || !remoteSyncAvailable || !profile.pendingSync) return;
    let cancelled = false;
    const retryPendingSync = () => {
      if (!navigator.onLine) return;
      setSyncStatus("syncing");
      void syncProfile(profile).then((updated) => {
        if (cancelled) return;
        setProfile(updated);
        setProfiles((current) => current.map((item) => item.profileId === updated.profileId ? updated : item));
        setSyncStatus(updated.pendingSync ? "error" : "saved");
      });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") retryPendingSync(); };
    window.addEventListener("online", retryPendingSync);
    document.addEventListener("visibilitychange", onVisibility);
    retryPendingSync();
    return () => {
      cancelled = true;
      window.removeEventListener("online", retryPendingSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [profile?.pendingSync, profile?.profileId, profile?.updatedAt]);

  const beep = useCallback((high = false) => {
    if (!settings.soundOn) return;
    try {
      const Context = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const context = audioRef.current ?? new Context();
      audioRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = high ? 880 : 620;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // The visual timer remains authoritative when audio is unavailable.
    }
  }, [settings.soundOn]);

  const elapsedFromClock = useCallback(() => elapsedBaseRef.current +
    (running ? (Date.now() - anchorRef.current) / 1000 : 0), [running]);

  useEffect(() => {
    if (!running || !activePlan || complete) return;
    const update = () => {
      const position = locateTimerPosition(activePlan, elapsedBaseRef.current + (Date.now() - anchorRef.current) / 1000);
      setTimerPosition(position);
      if (position.intervalIndex !== lastIntervalRef.current) {
        lastIntervalRef.current = position.intervalIndex;
        if (position.interval) beep(position.interval.kind === "work");
      }
      if (position.complete) {
        elapsedBaseRef.current = activePlan.totalSeconds;
        setRunning(false);
        setComplete(true);
        beep(true);
      }
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [activePlan, beep, complete, running]);

  const recordSessionOutcome = useCallback((
    plan: SessionPlan,
    status: "complete" | "modified" | "partial",
    performedSeconds: number,
    performedExerciseIds: string[],
  ) => {
    if (completionRecordedRef.current) return;
    completionRecordedRef.current = true;
    const activeDay = workouts.find((item) => item.day === plan.day) ?? day;
    const exerciseIds = Array.from(new Set(performedExerciseIds));
    const entry: HistoryEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${plan.day}`,
      completedAt: new Date().toISOString(),
      day: plan.day,
      level: plan.level,
      title: plan.day === 0 ? "Custom Session" : activeDay.title,
      seconds: performedSeconds,
      lab: plan.includeLab,
      mode: saveMode,
      status,
    };
    if (saveMode !== "guest") {
      setHistory((previous) => [entry, ...previous].slice(0, 12));
      setSettings((previous) => ({
        ...previous,
        recentExerciseIds: [...previous.recentExerciseIds, ...exerciseIds].slice(-50),
      }));
    }
    if (profile && saveMode !== "guest") {
      const progression = { ...profile.progression };
      if (saveMode === "normal") {
        exerciseIds.forEach((exerciseId) => {
          const feedback = sessionFeedback[exerciseId];
          const clean = sessionCleanTargets[exerciseId] === true;
          if (!feedback && !clean) return;
          const previous = progression[exerciseId] ?? { cleanSessions: 0 };
          progression[exerciseId] = {
            cleanSessions: clean && feedback !== "hard"
              ? Math.min(2, previous.cleanSessions + 1)
              : previous.cleanSessions,
            ...(feedback ? { lastFeedback: feedback } : previous.lastFeedback ? { lastFeedback: previous.lastFeedback } : {}),
          };
        });
      }
      const nextProgramDay = saveMode === "normal" && status !== "partial" && plan.day > 0 ? (plan.day % 5) + 1 : profile.nextProgramDay;
      const nextProfile = { ...profile, nextProgramDay, history: [...profile.history, { ...entry, mode: saveMode, status, exerciseIds, completedExerciseIds: exerciseIds }], progression };
      setProfile(nextProfile);
      if (saveMode === "normal" && status !== "partial" && plan.day > 0) {
        setSettings((previous) => ({ ...previous, selectedDay: nextProgramDay }));
      }
      void saveProfile(nextProfile).then(setProfile);
    }
  }, [day, profile, saveMode, sessionCleanTargets, sessionFeedback]);

  useEffect(() => {
    if (!complete || !activePlan || completionRecordedRef.current) return;
    const exerciseIds = activePlan.intervals
      .filter((interval) => interval.kind === "work" && interval.exerciseId)
      .map((interval) => interval.exerciseId as string);
    recordSessionOutcome(activePlan, activeSessionModified ? "modified" : "complete", activePlan.totalSeconds, exerciseIds);
  }, [activePlan, activeSessionModified, complete, recordSessionOutcome]);

  const setDay = (nextDay: DayNumber) => setSettings((previous) => ({ ...previous, selectedDay: nextDay }));

  const setLevel = (nextLevel: DifficultyLevel) => {
    setTodayLevelByDay((previous) => {
      const next = { ...previous };
      delete next[day.day];
      return next;
    });
    setSettings((previous) => ({
      ...previous,
      levelsByDay: { ...previous.levelsByDay, [String(day.day)]: nextLevel },
      labByDay: {
        ...previous.labByDay,
        ...(nextLevel === "L1" ? { [String(day.day)]: false } : {}),
      },
    }));
  };
  const setTodayLevel = (nextLevel: DifficultyLevel) => setTodayLevelByDay((previous) => ({ ...previous, [day.day]: nextLevel }));

  const toggleLab = () => {
    if (level === "L1") return;
    setSettings((previous) => ({
      ...previous,
      labByDay: { ...previous.labByDay, [String(day.day)]: !includeLab },
    }));
  };

  const toggleTodaySlot = (slotId: StableSlotId) => setTodaySkippedByVariant((previous) => {
    const selected = new Set(previous[key] ?? []);
    if (selected.has(slotId)) selected.delete(slotId); else selected.add(slotId);
    return { ...previous, [key]: Array.from(selected) };
  });
  const toggleTodayBlock = (block: WorkoutBlock) => setTodaySkippedByVariant((previous) => {
    const selected = new Set(previous[key] ?? []);
    const blockSlots = slots.filter((slot) => slot.block === block).map((slot) => slot.id);
    const shouldSkip = blockSlots.some((id) => !selected.has(id));
    blockSlots.forEach((id) => shouldSkip ? selected.add(id) : selected.delete(id));
    return { ...previous, [key]: Array.from(selected) };
  });

  const resolvedIdFor = (slotId: StableSlotId) => previewPlan.intervals.find(
    (interval) => interval.kind === "work" && interval.slotId === slotId,
  )?.exerciseId ?? slots.find((slot) => slot.id === slotId)?.defaultExerciseId;

  const prescriptionFor = (slot: SessionSlot): Prescription | undefined => {
    if (slot.block === "warmup") return warmupsByVariant[`${day.day}-${level}`][slot.position];
    const template = day.levels[level];
    if (slot.block === "pre") return template.pre[slot.position];
    if (slot.block === "core") return template.core[slot.position];
    if (slot.block === "handstand") return template.skill;
    if (slot.block === "cooldown") return template.cooldown[slot.position];
    const lab = day.labs[level];
    if (!lab) return undefined;
    return lab.a;
  };

  const targetFor = (slot: SessionSlot, exercise: Exercise, requestedId: string) => {
    if (exercise.id !== requestedId || requestedId !== slot.defaultExerciseId) return exercise.target;
    return prescriptionFor(slot)?.target ?? exercise.target;
  };

  const chooseSwap = (slot: SessionSlot, exerciseId: string) => {
    setSettings((previous) => {
      const previousMap = previous.swapsByVariant[key] ?? {};
      const nextMap = { ...previousMap };
      if (exerciseId === slot.defaultExerciseId) delete nextMap[slot.id];
      else nextMap[slot.id] = exerciseId;
      return { ...previous, swapsByVariant: { ...previous.swapsByVariant, [key]: nextMap } };
    });
    setSwapSlotId(null);
  };

  const updateTiming = (slot: SessionSlot, patch: TimingOverride) => {
    setSettings((previous) => {
      const previousMap = previous.timingsByVariant[key] ?? {};
      return {
        ...previous,
        timingsByVariant: {
          ...previous.timingsByVariant,
          [key]: { ...previousMap, [slot.id]: { ...previousMap[slot.id], ...patch } },
        },
      };
    });
  };

  const resetTiming = (slotId: StableSlotId) => setSettings((previous) => {
    const next = { ...(previous.timingsByVariant[key] ?? {}) };
    delete next[slotId];
    return { ...previous, timingsByVariant: { ...previous.timingsByVariant, [key]: next } };
  });

  const resetAllTimings = () => setSettings((previous) => ({
    ...previous,
    timingsByVariant: { ...previous.timingsByVariant, [key]: {} },
  }));

  const buildAnotherVersion = () => {
    const next: Partial<Record<StableSlotId, string>> = {};
    const recent = new Set(settings.recentExerciseIds.slice(-20));
    slots.forEach((slot) => {
      const current = activeSwaps[slot.id] ?? slot.defaultExerciseId;
      const options = compatibleSwaps({
        slot,
        exercises,
        day: day.day,
        level,
        readiness: ready,
        difficulty: "same",
        equipment: todayEquipment,
      }).filter((item) => item.id !== current);
      const fresh = options.filter((item) => !recent.has(item.id));
      const pool = fresh.length ? fresh : options;
      if (pool.length) {
        const scored = pool.map((candidate) => {
          const detailed = exercises[candidate.id];
          let score = Math.random();
          if (settings.feedbackByExercise[candidate.id] === "hard") score -= 8;
          if (settings.feedbackByExercise[candidate.id] === "right") score += 2;
          if (detailed.easierId && settings.feedbackByExercise[detailed.easierId] === "easy") score += 8;
          if (detailed.harderId && settings.feedbackByExercise[detailed.harderId] === "hard") score += 8;
          if (detailed.easierId && (profile?.progression[detailed.easierId]?.cleanSessions ?? 0) >= 2) score += 6;
          return { candidate, score };
        }).sort((a, b) => b.score - a.score);
        next[slot.id] = scored[0].candidate.id;
      }
    });
    setUndoSwaps({ key, swaps: { ...activeSwaps } });
    setSettings((previous) => ({
      ...previous,
      swapsByVariant: { ...previous.swapsByVariant, [key]: next },
    }));
  };

  const resetRecommended = () => setSettings((previous) => ({
    ...previous,
    swapsByVariant: { ...previous.swapsByVariant, [key]: {} },
  }));
  const undoVersion = () => {
    if (!undoSwaps || undoSwaps.key !== key) return;
    setSettings((previous) => ({ ...previous, swapsByVariant: { ...previous.swapsByVariant, [key]: undoSwaps.swaps } }));
    setUndoSwaps(null);
  };

  const startWorkout = () => {
    setActivePlan(previewPlan);
    setTimerPosition(locateTimerPosition(previewPlan, 0));
    elapsedBaseRef.current = 0;
    anchorRef.current = Date.now();
    lastIntervalRef.current = -1;
    completionRecordedRef.current = false;
    setSessionFeedback({});
    setSessionCleanTargets({});
    setActiveSessionModified(previewModified || previewPlan.totalSeconds !== basePreviewPlan.totalSeconds);
    setComplete(false);
    setPlayerOpen(true);
    setRunning(true);
    beep(true);
  };

  const startCustomWorkout = () => {
    if (!customPlan || customPlan.items.length === 0) return;
    const intervals: PlanInterval[] = [];
    customPlan.items.forEach((item, index) => {
      const block = item.block === "skill" ? "handstand" : item.block === "strength" ? "core" : item.block;
      const slotId = (index === 0 ? "warmup-1" : index === 1 ? "pre-1" : index === 2 ? "handstand-1" : index === customPlan.items.length - 1 ? "cooldown-1" : `core-${Math.min(4, index)}`) as StableSlotId;
      intervals.push({ id: `custom-${index}-work`, kind: "work", duration: item.work, block, slotId, exerciseId: item.exerciseId, label: exercises[item.exerciseId]?.name ?? item.exerciseId, round: 1, rounds: 1 });
      if (item.rest > 0) intervals.push({ id: `custom-${index}-rest`, kind: "rest", duration: item.rest, block, slotId, label: "Rest", round: 1, rounds: 1 });
    });
    const plan: SessionPlan = { schemaVersion: 1, day: 0, level: customDifficulty === "easy" ? "L1" : customDifficulty === "hard" ? "L3" : "L2", includeLab: customPlan.items.some((item) => item.block === "lab"), intervals, totalSeconds: intervals.reduce((sum, interval) => sum + interval.duration, 0) };
    setActivePlan(plan); setTimerPosition(locateTimerPosition(plan, 0)); elapsedBaseRef.current = 0; anchorRef.current = Date.now(); lastIntervalRef.current = -1; completionRecordedRef.current = false; setSessionFeedback({}); setSessionCleanTargets({}); setActiveSessionModified(false); setComplete(false); setCustomOpen(false); setPlayerOpen(true); setRunning(true); beep(true);
  };

  const toggleTimer = () => {
    if (!activePlan) return;
    if (running) {
      const elapsed = elapsedFromClock();
      elapsedBaseRef.current = elapsed;
      setTimerPosition(locateTimerPosition(activePlan, elapsed));
      setRunning(false);
    } else {
      anchorRef.current = Date.now();
      setRunning(true);
      beep(true);
    }
  };

  const jump = (direction: -1 | 1) => {
    if (!activePlan || !timerPosition) return;
    const currentIndex = Math.min(timerPosition.intervalIndex, activePlan.intervals.length - 1);
    const nextIndex = Math.max(0, Math.min(activePlan.intervals.length - 1, currentIndex + direction));
    const elapsed = activePlan.intervals.slice(0, nextIndex).reduce((sum, interval) => sum + interval.duration, 0);
    elapsedBaseRef.current = elapsed;
    anchorRef.current = Date.now();
    lastIntervalRef.current = nextIndex;
    setTimerPosition(locateTimerPosition(activePlan, elapsed));
  };

  const current = timerPosition?.interval;
  const currentExercise = current?.exerciseId ? exercises[current.exerciseId] : undefined;
  const nextWork = activePlan?.intervals.slice((timerPosition?.intervalIndex ?? -1) + 1)
    .find((interval) => interval.kind === "work");
  const nextExercise = nextWork?.exerciseId ? exercises[nextWork.exerciseId] : undefined;
  const elapsedBefore = activePlan && timerPosition
    ? activePlan.intervals.slice(0, Math.min(timerPosition.intervalIndex, activePlan.intervals.length))
      .reduce((sum, interval) => sum + interval.duration, 0)
    : 0;
  const elapsedTotal = elapsedBefore + (timerPosition?.elapsedInInterval ?? 0);
  const progress = activePlan ? Math.min(100, (elapsedTotal / activePlan.totalSeconds) * 100) : 0;

  const endWorkoutEarly = () => {
    if (!activePlan || complete) {
      setRunning(false);
      setPlayerOpen(false);
      return;
    }
    const performedSeconds = Math.max(0, Math.min(activePlan.totalSeconds, Math.floor(elapsedFromClock())));
    if (performedSeconds >= 5 && saveMode !== "guest") {
      const shouldSave = window.confirm("End this workout now and save the work completed so far as a partial session?\n\nPartial sessions never count as failure and do not advance the five-day program.");
      if (!shouldSave) return;
      let cursor = 0;
      const performedExerciseIds: string[] = [];
      for (const interval of activePlan.intervals) {
        if (interval.kind === "work" && interval.exerciseId && performedSeconds > cursor) performedExerciseIds.push(interval.exerciseId);
        cursor += interval.duration;
        if (cursor >= performedSeconds) break;
      }
      recordSessionOutcome(activePlan, "partial", performedSeconds, performedExerciseIds);
    }
    setRunning(false);
    setPlayerOpen(false);
  };

  const sectionBlocks = sessionBlockOrder(includeLab) as readonly WorkoutBlock[];

  const completedReadiness = Object.entries(settings.readiness).filter(([, value]) => value).length;

  const auditParams = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  if (auditParams?.has("media-audit")) {
    return <MediaAuditPage page={Number(auditParams.get("page") ?? 0)} />;
  }
  if (auditParams?.has("rig-approval")) return <RigApprovalPage />;

  return (
    <main id="app-top">
      <header className="site-header">
        <a className="brand" href="#app-top" aria-label="Parallette 25+ home">
          <span className="brand-mark"><i /><i /></span>
          <span><strong>PARALLETTE</strong><b>25+</b></span>
        </a>
        <div className="header-actions">
          <button type="button" className="header-button profile-button" aria-label={`Open profile: ${profile?.username ?? "Guest"}`} onClick={() => setProfileOpen(true)}><span className="profile-dot">{(profile?.username ?? "G").slice(0, 1).toUpperCase()}</span><span>{profile?.username ?? "Guest"}</span></button>
          <button type="button" className="header-button" aria-label={settings.soundOn ? "Turn sound off" : "Turn sound on"} onClick={() => setSettings((previous) => ({ ...previous, soundOn: !previous.soundOn }))}>
            {settings.soundOn ? <Volume2 /> : <VolumeX />}<span>{settings.soundOn ? "Sound on" : "Sound off"}</span>
          </button>
          <button type="button" className="header-button" aria-label="Installation instructions" onClick={() => setInstallOpen(true)}><Smartphone /><span>Use on iPhone</span></button>
        </div>
      </header>

      <section className="mode-bar" aria-label="Training modes">
        <div><span className="eyebrow"><span /> TRAINING MODE</span><strong>{profile ? `Saved as ${profile.username}` : "Guest session — nothing permanent is saved"}</strong></div>
        <div className="mode-actions"><button type="button" className="secondary-button compact" onClick={() => setCustomOpen(true)}><WandSparkles /> Build Custom Session</button><button type="button" className="secondary-button compact" onClick={() => setReadinessOpen(true)}><ShieldCheck /> Skills</button></div>
      </section>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> YOUR BUILT-IN TRAINING PARTNER</p>
          <h1>Stronger core.<br /><em>Skills that grow.</em></h1>
          <p className="hero-intro">
            Five parallette themes, three honest levels and precise continuous-motion guides. Train the exact 25-minute session—or add a five-minute Calisthenics Lab.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={startWorkout}><Play fill="currentColor" /> Start Day {day.day}</button>
            <button type="button" className="secondary-button" onClick={() => document.getElementById("workout")?.scrollIntoView({ behavior: "smooth" })}>Preview workout <ChevronRight /></button>
          </div>
          <div className="hero-proof">
            <span><Check /> Exact {formatTime(previewPlan.totalSeconds)}</span>
            <span><Check /> {Object.keys(exercises).length} movements</span>
            <span><Check /> Works on iPhone</span>
          </div>
        </div>
        <div className="hero-card-wrap">
          <div className="hero-card-accent" />
          <div className="hero-card">
            <div className="hero-card-top">
              <span>DAY {day.day} • {level}</span>
              <span className={`intensity intensity-${day.intensity.toLowerCase()}`}>{day.intensity}</span>
            </div>
            <h2>{day.title}</h2>
            <p>{day.focus}</p>
            <div className="timer-orbit">
              <svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="76" className="orbit-track" /><circle cx="90" cy="90" r="76" className="orbit-value" /></svg>
              <div><strong>{formatTime(previewPlan.totalSeconds)}</strong><span>{includeLab ? "WITH LAB" : "TOTAL"}</span></div>
            </div>
            <div className="mini-timeline">{timeline.map((item) => <i key={item[3]} className={`mini-${item[3]}`} />)}</div>
            <p className="rotation-note">Rotation: Day 1, Day 2, rest, Day 3, Day 4, rest, Day 5. Day 3 stays lighter.</p>
          </div>
        </div>
      </section>

      <section className={`timer-strip ${includeLab ? "with-lab" : ""}`} aria-label="Workout timeline">
        {timeline.map(([start, end, label, block], index) => (
          <div className={`timeline-item timeline-${block}`} key={block}>
            <span>{index + 1}</span><div><strong>{label}</strong><small>{start}–{end}</small></div>
          </div>
        ))}
        <div className="timeline-total"><strong>{includeLab ? "30:00" : "25:00"}</strong><small>exact default</small></div>
      </section>

      <section className="workout-shell" id="workout">
        <div className="section-intro">
          <div><p className="eyebrow"><span /> CHOOSE YOUR SESSION</p><h2>Five days. Three levels.</h2><p>Choose today’s comfort level, keep the theme, then swap or tune any interval.</p></div>
          <div className={`total-pill ${exactDefault ? "total-default" : "total-custom"}`}>
            <Clock3 /><div><span>Session total</span><strong>{formatTime(previewPlan.totalSeconds)}</strong></div>
            {!exactDefault && <button type="button" onClick={resetAllTimings}>Reset to {includeLab ? "30:00" : "25:00"}</button>}
          </div>
        </div>

        <div className="demo-standard"><Info /><div><strong>Continuous motion for movement. One precise position for a hold.</strong><span>No fake two-frame GIFs. Every active guide is self-contained, and a missing asset falls back clearly instead of leaving a broken box.</span></div></div>

        <div className="day-tabs" role="tablist" aria-label="Workout days">
          {workouts.map((item) => (
            <button type="button" role="tab" aria-selected={day.day === item.day} className={day.day === item.day ? "active" : ""} key={item.day} onClick={() => setDay(item.day)}>
              <span>Day {item.day}</span><strong>{item.title}</strong>{item.intensity === "Light" && <small>lighter day</small>}
            </button>
          ))}
        </div>

        <div className="programme-controls">
          <div className="level-picker">
            <p className="control-kicker">Today’s comfort level</p>
            <div className="level-options">
              {(["L1", "L2", "L3"] as DifficultyLevel[]).map((item) => (
                <button type="button" className={`level-option ${level === item ? "active" : ""}`} aria-pressed={level === item} key={item} onClick={() => setLevel(item)}>
                  <span>{item}</span><strong>{levelLabels[item].name}</strong><small>{levelLabels[item].description}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="session-options">
            <div className={`lab-panel ${level === "L1" ? "disabled" : ""}`}>
              <div><strong>+5 min Calisthenics Lab</strong><span>{level === "L1" ? "Available in Progress and Challenge." : "Optional skill practice; cooldown remains last."}</span></div>
              <button type="button" className={`switch ${includeLab ? "on" : ""}`} aria-label="Toggle Calisthenics Lab" aria-pressed={includeLab} disabled={level === "L1"} onClick={toggleLab}><i /></button>
            </div>
            <div className="variant-panel">
              <button type="button" onClick={() => setCustomizeTodayOpen(true)}><Settings2 /> Customize today</button>
              <button type="button" onClick={buildAnotherVersion}><Shuffle /> Build another</button>
              {undoSwaps?.key === key && <button type="button" onClick={undoVersion}><ArrowLeft /> Undo version</button>}
              <button type="button" onClick={resetRecommended}><RotateCcw /> Recommended</button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={`${day.day}-${level}-${includeLab}`} className="day-content" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <div className="day-banner">
              <div><span>DAY {day.day} • {levelLabels[level].name.toUpperCase()} • {day.intensity.toUpperCase()}</span><h2>{day.title}</h2><p>{day.focus}</p></div>
              <button type="button" className="primary-button compact" onClick={startWorkout}><Play fill="currentColor" /> Start {formatTime(previewPlan.totalSeconds)}</button>
            </div>

            {sectionBlocks.map((block, sectionIndex) => {
              const sectionSlots = slots.filter((slot) => slot.block === block);
              const visibleSlots = sectionSlots.filter((slot) => !unavailableToday.has(slot.id));
              const labNote = block === "lab" ? day.labs[level]?.intensityNote : undefined;
              const labSlot = block === "lab" ? sectionSlots[0] : undefined;
              const labChoices = labSlot ? compatibleSwaps({ slot: labSlot, exercises, day: day.day, level, readiness: ready, difficulty: "same", includeLocked: true, equipment: todayEquipment }) : [];
              const selectedLabId = labSlot ? (equipmentSwaps[labSlot.id] ?? labSlot.defaultExerciseId) : undefined;
              return (
                <section className={`exercise-section ${block === "lab" ? "lab-section" : ""} ${block === "cooldown" ? "cooldown-section" : ""}`} key={block}>
                  <div className="exercise-section-title">
                    <div className={`section-icon ${block === "core" ? "icon-core" : block === "cooldown" ? "icon-reset" : block === "handstand" || block === "pre" || block === "lab" ? "icon-skill" : ""}`}><SectionIcon block={block} /></div>
                    <div><span>{String(sectionIndex + 1).padStart(2, "0")}</span><h2>{blockLabels[block]}</h2><p>{blockMeta[block]}</p></div>
                  </div>
                  {block === "lab" && <>
                    <p className="lab-callout">Choose one track and practise its selected skill for all five rounds. {labNote ?? "Complete the clean target, then rest for the remainder of the 30-second practice window."}</p>
                    {labSlot && <div className="lab-track-picker" aria-label="Calisthenics Lab track">
                      {(Object.keys(labTrackLabels) as LabTrack[]).map((track) => {
                        const choice = labChoices.find((candidate) => labTrackFor(exercises[candidate.id]) === track);
                        const selected = Boolean(choice && choice.id === selectedLabId);
                        const locked = Boolean(choice?.gate && !ready[choice.gate]);
                        return <button type="button" className={selected ? "active" : ""} disabled={!choice} key={track} onClick={() => {
                          if (!choice) return;
                          if (locked) { setReadinessOpen(true); return; }
                          chooseSwap(labSlot, choice.id);
                        }}><strong>{labTrackLabels[track]}</strong><span>{choice ? exercises[choice.id].name : "Not available for this day"}{locked ? " · readiness required" : ""}</span></button>;
                      })}
                    </div>}
                  </>}
                  {visibleSlots.length < sectionSlots.length && <p className="equipment-note">{sectionSlots.length - visibleSlots.length} movement{sectionSlots.length - visibleSlots.length === 1 ? " is" : "s are"} unavailable with today’s equipment and removed from the timer. Choose Reallocate in Customize Today to keep the original total.</p>}
                  <div className="exercise-grid">
                    {visibleSlots.map((slot) => {
                      const requestedId = equipmentSwaps[slot.id] ?? slot.defaultExerciseId;
                      const requested = exercises[requestedId];
                      const resolvedId = resolvedIdFor(slot.id) ?? requestedId;
                      const exercise = exercises[resolvedId];
                      const rounds = block === "lab" ? 5 : sectionRounds[block];
                      return (
                        <ExerciseCard
                          key={slot.id}
                          slot={slot}
                          exercise={exercise}
                          requested={requested}
                          target={targetFor(slot, exercise, requestedId)}
                          timing={slotTiming(slot, activeTimings)}
                          rounds={rounds}
                          onSwap={() => { setSwapFilter("same"); setSwapSlotId(slot.id); }}
                          onEdit={() => setEditSlotId(slot.id)}
                          feedback={settings.feedbackByExercise[exercise.id]}
                          equipmentAdjusted={equipmentSwaps[slot.id] !== activeSwaps[slot.id]}
                          onFeedback={(value) => setSettings((previous) => ({ ...previous, feedbackByExercise: { ...previous.feedbackByExercise, [exercise.id]: value } }))}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </section>

      <section className="readiness">
        <div>
          <p className="eyebrow"><span /> PROGRESS WITH CONTROL</p>
          <h2>Earn the freestanding attempt.</h2>
          <p>You already balance on the floor, so the programme moves forward. Medium-height bars still require their own support strength, wall control and safe exit.</p>
          <div className="readiness-actions"><button type="button" className="readiness-button" onClick={() => setReadinessOpen(true)}><ShieldCheck /> Check readiness</button><span className="readiness-status">{completedReadiness} standards marked</span></div>
        </div>
        <div className="readiness-grid">
          {["30s clean support", "10 support shrugs", "25s inverted-L hold", "20s chest-to-wall", "Side exit both ways", "30s hollow hold", "Calm wall kick-up"].map((item) => <span key={item}><Check /> {item}</span>)}
        </div>
        <div className="progress-rule"><Info /> Progress only after the upper target is clean in two separate sessions. Change one thing: +2 reps, +5 seconds, less foot help, a longer lever, or slightly closer to the wall. Never add rounds.</div>
      </section>

      <section className="history-strip">
        <p className="eyebrow"><span /> {remoteSyncAvailable && profile ? "PROFILE PROGRESS" : "SAVED ON THIS DEVICE"}</p><h2>Recent sessions</h2>
        {history.length === 0 ? <div className="history-empty">Your completed workouts will appear here.{remoteSyncAvailable && profile ? " Profile updates sync when online." : " Use Export Backup before changing devices."}</div> : (
          <div className="history-list">{history.slice(0, 6).map((item) => <div className="history-item" key={item.id}><strong>{item.day === 0 ? "Custom" : `Day ${item.day}`} • {item.level} • {item.title}</strong><span>{new Date(item.completedAt).toLocaleDateString()} • {formatTime(item.seconds)}{item.lab ? " • Lab" : ""}{item.status === "modified" ? " • Modified" : item.status === "partial" ? " • Partial" : ""}{item.mode === "practice" ? " • Practice only" : ""}</span></div>)}</div>
        )}
      </section>

      <footer><div className="brand footer-brand"><span className="brand-mark"><i /><i /></span><span><strong>PARALLETTE</strong><b>25+</b></span></div><p>Stop for sharp pain, numbness, instability or loss of a controlled exit path.</p></footer>

      <div className="mobile-start-bar"><div><span>Day {day.day} • {level}</span><strong>{formatTime(previewPlan.totalSeconds)}</strong></div><button type="button" onClick={startWorkout}><Play fill="currentColor" /> Start workout</button></div>

      <AnimatePresence>
        {swapSlotId && (() => {
          const slot = slots.find((item) => item.id === swapSlotId);
          if (!slot) return null;
          const currentId = activeSwaps[slot.id] ?? slot.defaultExerciseId;
          const options = compatibleSwaps({ slot, exercises, day: day.day, level, readiness: ready, difficulty: swapFilter, includeLocked: true, equipment: todayEquipment });
          return (
            <Drawer title="Swap exercise" subtitle="Focus, day and equipment purpose stay matched. Choose the same level or inspect one adjacent level." onClose={() => setSwapSlotId(null)}>
              <div className="swap-filter">
                {(["same", "easier", "harder"] as SwapDifficulty[]).map((filter) => <button type="button" className={swapFilter === filter ? "active" : ""} key={filter} onClick={() => setSwapFilter(filter)}>{filter === "same" ? "Recommended" : filter === "easier" ? "One level easier" : "One level harder"}</button>)}
              </div>
              {options.length === 0 && <p className="swap-warning">There is no technically equivalent option in this adjacent level. The current movement is the safest match for this slot.</p>}
              <div className="swap-list">
                {options.map((optionBase) => {
                  const option = exercises[optionBase.id];
                  const selected = option.id === currentId;
                  const locked = Boolean(option.gate && !ready[option.gate]);
                  return (
                    <button type="button" className={selected ? "selected" : ""} key={option.id} onClick={() => {
                      if (locked) { setSwapSlotId(null); setReadinessOpen(true); return; }
                      chooseSwap(slot, option.id);
                    }}>
                      <div className="swap-demo"><ExerciseDemo exercise={option} compact /></div>
                      <div><span className={`category-tag ${categoryClass[option.category]}`}>{option.category} • {option.level}</span><strong>{option.name}</strong><small>{option.target}</small></div>
                      {locked ? <LockKeyhole /> : selected ? <Check /> : <ChevronRight />}
                    </button>
                  );
                })}
              </div>
            </Drawer>
          );
        })()}

        {editSlotId && (() => {
          const slot = slots.find((item) => item.id === editSlotId);
          if (!slot) return null;
          const timing = slotTiming(slot, activeTimings);
          const exerciseId = resolvedIdFor(slot.id) ?? slot.defaultExerciseId;
          return (
            <Drawer title="Adjust interval" subtitle={`${exercises[exerciseId].name} • saved for Day ${day.day} ${level}`} onClose={() => setEditSlotId(null)}>
              <div className="timing-editor">
                <Stepper label={slot.block === "handstand" || slot.block === "lab" ? "Practice" : "Work"} value={timing.work} onChange={(work) => updateTiming(slot, { work })} />
                {slot.block !== "cooldown" && <Stepper label={slot.block === "warmup" ? "Transition" : "Rest"} value={timing.rest} min={0} onChange={(rest) => updateTiming(slot, { rest })} />}
                <div className="timing-impact"><Clock3 /><span>Updated workout total</span><strong>{formatTime(previewPlan.totalSeconds)}</strong></div>
                <button type="button" className="reset-button" onClick={() => resetTiming(slot.id)}><RotateCcw /> Reset this slot</button>
              </div>
            </Drawer>
          );
        })()}

        {readinessOpen && (
          <Drawer title="Readiness standards" subtitle="Mark a standard only after you can demonstrate every item with calm, clean form." onClose={() => setReadinessOpen(false)}>
            <div className="readiness-list">
              {(Object.values(readiness) as typeof readiness[ReadinessGateId][]).filter((item) => item.id !== "G0_LOAD").map((item) => {
                const checked = settings.readiness[item.id] === true;
                const effective = ready[item.id] === true;
                return (
                  <button type="button" className={`readiness-check ${checked ? "checked" : ""}`} key={item.id} onClick={() => setSettings((previous) => ({ ...previous, readiness: { ...previous.readiness, [item.id]: !checked } }))}>
                    <i>{checked && <Check />}</i><span><strong>{item.label}{checked && !effective ? " • prerequisites still needed" : ""}</strong>{item.standards.join(" • ")}</span>
                  </button>
                );
              })}
            </div>
            <div className="skill-paths">
              <h3>Progression paths</h3>
              {skillProgressionPaths.map((path) => {
                const visible = path.steps.filter((id) => Boolean(exercises[id]));
                let masteredIndex = -1;
                visible.forEach((id, index) => {
                  if (index === masteredIndex + 1 && (profile?.progression[id]?.cleanSessions ?? 0) >= 2) masteredIndex = index;
                });
                const currentIndex = Math.min(visible.length - 1, masteredIndex + 1);
                return <article key={path.label}><strong>{path.label}</strong>{visible.map((id, index) => <div className={index <= masteredIndex ? "done" : index === currentIndex ? "current" : ""} key={id}><i>{index <= masteredIndex ? <Check /> : index + 1}</i><span>{exercises[id].name}</span>{index === currentIndex && <small>{masteredIndex >= 0 ? "READY TO TRY" : "CURRENT"}</small>}</div>)}<button type="button" className="path-challenge" onClick={() => openChallenge(path.customFocus as CustomFocus)}>Try the next appropriate step</button></article>;
              })}
            </div>
            <div className="challenge-panel"><strong>Challenge me</strong><span>Choose a safe next challenge without skipping readiness gates.</span><div><button type="button" onClick={() => openChallenge()}>Whole workout</button>{(["handstand", "core", "lsit", "planche", "pushing"] as CustomFocus[]).map((focus) => <button type="button" key={focus} onClick={() => openChallenge(focus)}>{focus === "lsit" ? "L-Sit" : focus[0].toUpperCase() + focus.slice(1)}</button>)}</div></div>
            <p className="install-note"><ShieldCheck /> A locked drill is automatically replaced by its declared safe regression. Readiness never changes your whole-day level automatically.</p>
          </Drawer>
        )}

        {customizeTodayOpen && (
          <Drawer title="Customize today" subtitle="Temporary changes affect only this session and never lower your saved readiness." onClose={() => setCustomizeTodayOpen(false)}>
            <div className="custom-builder today-builder">
              <p className="control-kicker">Comfort level</p>
              <div className="custom-chip-grid">{(["L1", "L2", "L3"] as DifficultyLevel[]).map((item) => <button type="button" className={level === item ? "active" : ""} key={item} onClick={() => setTodayLevel(item)}>{levelLabels[item].name}</button>)}<button type="button" className={level === "L1" ? "active" : ""} onClick={() => setTodayLevel("L1")}>Easy Day</button></div>
              <p className="control-kicker">Time after skipping</p>
              <div className="custom-chip-grid"><button type="button" className={todayTimingMode === "shorter" ? "active" : ""} onClick={() => setTodayTimingMode("shorter")}>Keep shorter</button><button type="button" className={todayTimingMode === "reallocate" ? "active" : ""} onClick={() => setTodayTimingMode("reallocate")}>Reallocate time</button></div>
              <div className="today-total"><Clock3 /><span>Today’s session</span><strong>{formatTime(previewPlan.totalSeconds)}</strong></div>
              <p className="control-kicker">Equipment today</p>
              <div className="custom-chip-grid equipment-chips">{(["parallettes", "floor", "wall", "rope"] as const).map((item) => <button type="button" className={todayEquipment.includes(item) ? "active" : ""} key={item} onClick={() => setTodayEquipment((current) => current.includes(item) ? (current.length > 1 ? current.filter((value) => value !== item) : current) : [...current, item])}>{item === "floor" ? "Mat / Floor" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
              <p className="control-kicker">Blocks and exercises</p>
              <div className="today-blocks">
                {sectionBlocks.map((block) => {
                  const blockSlots = slots.filter((slot) => slot.block === block);
                  const fullySkipped = blockSlots.length > 0 && blockSlots.every((slot) => skippedToday.has(slot.id));
                  return <section key={block}><button type="button" className={fullySkipped ? "off" : ""} onClick={() => toggleTodayBlock(block)}><strong>{blockLabels[block]}</strong><span>{fullySkipped ? "Skipped" : "Included"}</span></button>{blockSlots.map((slot) => { const id = resolvedIdFor(slot.id) ?? slot.defaultExerciseId; const skipped = skippedToday.has(slot.id); const unavailable = unavailableToday.has(slot.id); return <label key={slot.id}><input type="checkbox" checked={!skipped && !unavailable} disabled={unavailable} onChange={() => toggleTodaySlot(slot.id)} /><span>{exercises[id].name}{unavailable ? " · equipment unavailable" : ""}</span></label>; })}</section>;
                })}
              </div>
              <div className="drawer-actions"><button type="button" className="secondary-button" onClick={() => setTodaySkippedByVariant((previous) => ({ ...previous, [key]: [] }))}><RotateCcw /> Restore all</button><button type="button" className="primary-button" disabled={previewPlan.totalSeconds === 0} onClick={() => { setCustomizeTodayOpen(false); startWorkout(); }}><Play fill="currentColor" /> Start {formatTime(previewPlan.totalSeconds)}</button></div>
            </div>
          </Drawer>
        )}

        {profileOpen && (
          <Drawer title="Who's training?" subtitle="Choose a permanent profile or start a disposable Guest session." onClose={() => setProfileOpen(false)}>
            {profiles.length > 3 && <div className="profile-search"><label htmlFor="profile-search">Find username</label><input id="profile-search" value={profileSearch} placeholder="Search profiles" autoComplete="off" onChange={(event) => setProfileSearch(event.target.value)} /></div>}
            <div className="profile-list">
              {profiles.filter((item) => item.username.toLocaleLowerCase().includes(profileSearch.trim().toLocaleLowerCase())).map((item) => <button type="button" className={profile?.profileId === item.profileId ? "selected" : ""} key={item.profileId} onClick={() => selectExistingProfile(item)}><span className="profile-dot">{item.username.slice(0, 1).toUpperCase()}</span><strong>{item.username}</strong>{profile?.profileId === item.profileId && <Check />}</button>)}
            </div>
            <div className="new-profile-form">
              <label htmlFor="new-profile-name">Create a username</label>
              <div><input id="new-profile-name" value={newProfileName} maxLength={32} autoComplete="off" placeholder="e.g. Kyriakos" onChange={(event) => setNewProfileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createProfile(); }} /><button type="button" disabled={!newProfileName.trim()} onClick={() => void createProfile()}><Plus /> Create</button></div>
              <small>No email or password. Each username keeps separate progress.{remoteSyncAvailable ? " Changes sync when online." : " Export a backup before moving to another device."}</small>
            </div>
            <div className="drawer-actions"><button type="button" className="secondary-button" onClick={openGuest}>Guest session · don't save</button></div>
            {profile && <div className="profile-data-panel">
              <p className="control-kicker">Profile</p><strong>{profile.username}</strong><button type="button" onClick={() => void renameProfile()}>Rename profile</button>
              <p className="control-kicker">Default equipment</p><div className="custom-chip-grid equipment-chips">{(["parallettes", "floor", "wall", "rope"] as const).map((item) => <button type="button" className={profile.equipment.includes(item) ? "active" : ""} key={item} onClick={() => void toggleDefaultEquipment(item)}>{item === "floor" ? "Mat / Floor" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
              <p className="control-kicker">Session saving</p><div className="custom-chip-grid"><button type="button" className={saveMode === "normal" ? "active" : ""} onClick={() => setSaveMode("normal")}>Normal</button><button type="button" className={saveMode === "practice" ? "active" : ""} onClick={() => setSaveMode("practice")}>Practice only</button><button type="button" className={saveMode === "guest" ? "active" : ""} onClick={() => setSaveMode("guest")}>Don't save</button></div>
              <p className="control-kicker">Sync</p><div className="sync-line"><i className={`sync-${syncStatus}`} /><span>{syncStatus === "syncing" ? "Syncing…" : syncStatus === "error" ? "Sync error — retry" : profile.pendingSync ? "Sync needed" : remoteSyncAvailable ? "Saved" : "Offline — saved on this device"}</span></div>{profile.lastSyncedAt && <small>Last synced {new Date(profile.lastSyncedAt).toLocaleString()}</small>}<button type="button" onClick={() => void syncCurrentProfile()}>Sync now</button>
              <p className="control-kicker">Data</p><div className="profile-data-actions"><button type="button" onClick={() => downloadText(`parallette25-${profile.username}.json`, exportProfile(profile))}>Export backup</button><label>Import backup<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProfileFile(file); event.currentTarget.value = ""; }} /></label><button type="button" className="danger" onClick={() => void resetCurrentProfile()}>Reset progress</button><button type="button" className="danger" onClick={() => void removeCurrentProfile()}>Delete profile</button></div>
            </div>}
          </Drawer>
        )}

        {customOpen && (
          <Drawer title="Build a custom session" subtitle="Focus, equipment, time and difficulty are independent. The generator keeps the order safe." onClose={() => setCustomOpen(false)}>
            <div className="custom-builder">
              <p className="control-kicker">What do you want to train?</p>
              <div className="custom-chip-grid">{(["handstand", "core", "compression", "lsit", "planche", "pushing", "support", "mobility", "conditioning"] as CustomFocus[]).map((focus) => <button type="button" className={customFocuses.includes(focus) ? "active" : ""} key={focus} onClick={() => setCustomFocuses((current) => current.includes(focus) ? current.filter((item) => item !== focus) : [...current, focus])}>{focus === "lsit" ? "L-sit" : focus[0].toUpperCase() + focus.slice(1)}</button>)}</div>
              <p className="control-kicker">How much time?</p><div className="custom-chip-grid">{[300, 600, 900, 1200, 1500, 1800].map((seconds) => <button type="button" className={customSeconds === seconds ? "active" : ""} key={seconds} onClick={() => setCustomSeconds(seconds)}>{formatTime(seconds)}</button>)}</div>
              <label className="custom-duration">Custom minutes<input type="number" min="5" max="90" step="1" value={Math.round(customSeconds / 60)} onChange={(event) => setCustomSeconds(Math.max(300, Math.min(5400, Number(event.target.value || 5) * 60)))} /></label>
              <p className="control-kicker">Difficulty</p><div className="custom-chip-grid"><button type="button" className={customDifficulty === "easy" ? "active" : ""} onClick={() => setCustomDifficulty("easy")}>Easy</button><button type="button" className={customDifficulty === "recommended" ? "active" : ""} onClick={() => setCustomDifficulty("recommended")}>Recommended</button><button type="button" className={customDifficulty === "hard" ? "active" : ""} onClick={() => setCustomDifficulty("hard")}>Hard</button></div>
              <p className="equipment-summary">Using {customEquipment.map((item) => item === "floor" ? "Mat / Floor" : item[0].toUpperCase() + item.slice(1)).join(" · ") || "no equipment selected"}</p>
              <button type="button" className="advanced-toggle" onClick={() => setCustomAdvanced((current) => !current)}>{customAdvanced ? "Hide advanced options" : "Advanced options"}</button>
              {customAdvanced && <div className="advanced-options"><p className="control-kicker">Equipment</p><div className="custom-chip-grid equipment-chips">{(["parallettes", "floor", "wall", "rope"] as const).map((item) => <button type="button" className={customEquipment.includes(item) ? "active" : ""} key={item} onClick={() => setCustomEquipment((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}>{item === "floor" ? "Mat / Floor" : item[0].toUpperCase() + item.slice(1)}</button>)}</div><p className="control-kicker">Blocks</p>{(Object.keys(customBlocks) as Array<keyof CustomBlocks>).map((block) => <label key={block}><input type="checkbox" checked={customBlocks[block]} onChange={() => setCustomBlocks((current) => ({ ...current, [block]: !current[block] }))} /><span>{block === "preparation" ? "Preparation" : block === "strength" ? "Strength / Core" : block === "lab" ? "Calisthenics Lab" : block[0].toUpperCase() + block.slice(1)}</span></label>)}<p className="control-kicker">Preferences</p><label><input type="checkbox" checked={customPreferProgression} onChange={() => setCustomPreferProgression((current) => !current)} /><span>Prioritize my next progression</span></label><label><input type="checkbox" checked={customPreferVariety} onChange={() => setCustomPreferVariety((current) => !current)} /><span>Avoid recently used exercises</span></label></div>}
              <p className="control-kicker">Save mode</p><div className="custom-chip-grid"><button type="button" className={saveMode === "normal" ? "active" : ""} onClick={() => setSaveMode("normal")}>Normal · progress</button><button type="button" className={saveMode === "practice" ? "active" : ""} onClick={() => setSaveMode("practice")}>Practice only</button><button type="button" className={saveMode === "guest" ? "active" : ""} onClick={() => setSaveMode("guest")}>Guest · don't save</button></div>
              <div className="drawer-actions"><button type="button" className="secondary-button" onClick={generateCustom}><RefreshCw /> Generate</button>{customPlan && <button type="button" className="primary-button" onClick={startCustomWorkout}><Play fill="currentColor" /> Start {formatTime(customPlan.seconds)}</button>}</div>
              {customPlan && <div className="custom-preview"><strong>{customPlan.title} · {formatTime(customPlan.seconds)}</strong>{customPlan.warnings.map((warning) => <span key={warning}>{warning}</span>)}{customPlan.items.map((item, index) => <div key={`${item.exerciseId}-${item.block}-${index}`}><span>{item.block === "skill" ? "Skill practice" : blockLabels[item.block === "strength" ? "core" : item.block]}</span><strong>{exercises[item.exerciseId]?.name}</strong><small>{item.work}s work · {item.rest}s rest</small></div>)}</div>}
            </div>
          </Drawer>
        )}

        {installOpen && (
          <Drawer title="Put it on your iPhone" subtitle="No App Store and no subscription needed." onClose={() => setInstallOpen(false)}>
            <ol className="install-steps">
              <li><strong>1</strong><div><b>Open the live link in Safari</b><span>Safari provides the Home Screen option.</span></div></li>
              <li><strong>2</strong><div><b>Tap the Share button</b><span>It is the square with an upward arrow.</span></div></li>
              <li><strong>3</strong><div><b>Choose “Add to Home Screen”</b><span>Launch it later as a full-screen app.</span></div></li>
            </ol>
            <p className="install-note"><CircleHelp /> The app works through a temporary connection loss after a successful first load. {remoteSyncAvailable ? "Permanent profiles reconcile when you reconnect." : "This deployment stores profiles on this iPhone, so export a backup before switching devices."}</p>
          </Drawer>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerOpen && activePlan && timerPosition && (
          <motion.section className={`player player-${current?.kind ?? "work"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!complete && current ? (
              <>
                <div className="player-topbar">
                  <button type="button" className="icon-button player-close" onClick={endWorkoutEarly} aria-label="End workout"><X /></button>
                  <div><span>{activePlan.day === 0 ? "CUSTOM SESSION" : `DAY ${activePlan.day}`} • {activePlan.level} • {displayBlockLabel(current.block, activePlan.day === 0)}</span><div className="player-progress"><i style={{ width: `${progress}%` }} /></div></div>
                  <button type="button" className="icon-button" onClick={() => setSettings((previous) => ({ ...previous, soundOn: !previous.soundOn }))} aria-label="Toggle timer sound">{settings.soundOn ? <Volume2 /> : <VolumeX />}</button>
                </div>
                <div className="player-layout">
                  <div className="player-demo">
                    {current.kind === "work" && currentExercise ? <ExerciseDemo exercise={currentExercise} /> : nextExercise ? <><ExerciseDemo exercise={nextExercise} dimmed /><span className="up-next-label">UP NEXT • {nextExercise.name}</span></> : <div className="reset-visual"><RefreshCw /><span>Breathe slowly</span></div>}
                  </div>
                  <div className="player-info">
                    <span className={`phase-pill phase-${current.kind}`}>{current.kind === "work" ? "WORK" : current.label.toUpperCase()}</span>
                    <p className="round-label">Round {current.round} of {current.rounds}</p>
                    <h1>{current.kind === "work" ? current.label : "Recover completely"}</h1>
                    {currentExercise && current.kind === "work" && <p className="player-target">Target: {currentExercise.target}. Once it is clean, rest for the remaining time.</p>}
                    <div className="countdown" aria-live="polite">{formatTime(timerPosition.remaining)}</div>
                    <div className="countdown-track"><i style={{ width: `${current.duration ? (timerPosition.remaining / current.duration) * 100 : 0}%` }} /></div>
                    {currentExercise && current.kind === "work" && <div className="cue-box"><strong>FOCUS</strong><span>{currentExercise.cues[0]}</span><span>{currentExercise.cues[1]}</span></div>}
                    {currentExercise && current.kind === "work" && <div className="player-quality">
                      <button type="button" className={sessionCleanTargets[currentExercise.id] ? "clean" : ""} onClick={() => setSessionCleanTargets((previous) => ({ ...previous, [currentExercise.id]: !previous[currentExercise.id] }))}><Check /> Upper target completed cleanly</button>
                      <div aria-label={`Session feedback for ${currentExercise.name}`}>
                        {(["easy", "right", "hard"] as const).map((value) => <button type="button" className={sessionFeedback[currentExercise.id] === value ? "active" : ""} key={value} onClick={() => {
                          setSessionFeedback((previous) => ({ ...previous, [currentExercise.id]: value }));
                          setSettings((previous) => ({ ...previous, feedbackByExercise: { ...previous.feedbackByExercise, [currentExercise.id]: value } }));
                        }}>{value === "easy" ? "Too easy" : value === "right" ? "Just right" : "Too hard"}</button>)}
                      </div>
                    </div>}
                    {current.kind === "rest" && nextExercise && <p className="rest-copy">Relax the grip, shake out tension, and set both bars before the next interval.</p>}
                    <div className="player-controls">
                      <button type="button" onClick={() => jump(-1)} disabled={timerPosition.intervalIndex === 0} aria-label="Previous interval"><ArrowLeft /></button>
                      <button type="button" className="play-control" onClick={toggleTimer} aria-label={running ? "Pause timer" : "Resume timer"}>{running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
                      <button type="button" onClick={() => jump(1)} disabled={timerPosition.intervalIndex >= activePlan.intervals.length - 1} aria-label="Next interval"><ArrowRight /></button>
                    </div>
                    <p className="rest-copy">Swaps and timing edits apply to your next session, preserving this active timer.</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="complete-screen">
                <div className="complete-check"><Check /></div><p>{activePlan.day === 0 ? "CUSTOM SESSION" : `DAY ${activePlan.day}`} • {activePlan.level} COMPLETE</p>
                <h1>{formatTime(activePlan.totalSeconds)}.<br /><em>Quality earned.</em></h1>
                <span>{saveMode === "guest" ? "Guest mode: this session was not added to history or progression." : saveMode === "practice" ? "Practice only: the session is in history, but progression and the next program day were not changed." : remoteSyncAvailable && profile ? "Your profile was saved locally and will sync online." : "Your session is saved on this device."} Progress an exercise only after its upper target is clean in two separate sessions.</span>
                <button type="button" className="primary-button" onClick={() => { setPlayerOpen(false); setComplete(false); }}><Check /> Finish session</button>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
