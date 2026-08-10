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
import { buildCustomSession, type CustomDifficulty, type CustomFocus } from "./custom";
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
  buildSessionPlan,
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

type HistoryEntry = {
  id: string;
  completedAt: string;
  day: number;
  level: DifficultyLevel;
  title: string;
  seconds: number;
  lab: boolean;
};

type TimelineItem = readonly [string, string, string, WorkoutBlock];
type TodayTimingMode = "shorter" | "reallocate";

const blockLabels: Record<WorkoutBlock, string> = {
  warmup: "Dynamic warm-up",
  pre: "Pre-handstand preparation",
  core: "Abs & core circuit",
  handstand: "Handstand skill",
  lab: "Calisthenics Lab",
  cooldown: "Cooldown reset",
};

const blockMeta: Record<WorkoutBlock, string> = {
  warmup: "1 round • 45s work / 15s transition",
  pre: "2 rounds • 40s work / 20s rest",
  core: "3 rounds • 40s work / 20s rest",
  handstand: "5 rounds • 30s practice / 30s complete rest",
  lab: "Optional • A/B/A/B/A • 30s practice / 30s complete rest",
  cooldown: "2 recovery positions • 30s each",
};

const categoryClass: Record<Category, string> = {
  "Warm-up": "tag-warm",
  "Pre-Handstand": "tag-pre",
  Abs: "tag-abs",
  Core: "tag-core",
  Handstand: "tag-handstand",
  Calisthenics: "tag-lab",
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
      ["12:00", "24:00", "Core", "core"],
      ["24:00", "29:00", "Skill Lab", "lab"],
      ["29:00", "30:00", "Reset", "cooldown"],
    ]
  : [
      ["0:00", "3:00", "Warm-up", "warmup"],
      ["3:00", "7:00", "Prepare", "pre"],
      ["7:00", "12:00", "Handstand", "handstand"],
      ["12:00", "24:00", "Core", "core"],
      ["24:00", "25:00", "Reset", "cooldown"],
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
  const adjustable = kept.filter((interval) => interval.block !== "cooldown");
  const fixedSeconds = kept.filter((interval) => interval.block === "cooldown").reduce((sum, interval) => sum + interval.duration, 0);
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
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline" | "error">("saved");
  const [customFocuses, setCustomFocuses] = useState<CustomFocus[]>(["core"]);
  const [customDifficulty, setCustomDifficulty] = useState<CustomDifficulty>("recommended");
  const [customSeconds, setCustomSeconds] = useState(900);
  const [customEquipment, setCustomEquipment] = useState(["parallettes", "floor", "wall"]);
  const [customPlan, setCustomPlan] = useState<ReturnType<typeof buildCustomSession> | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>("normal");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<SessionPlan | null>(null);
  const [timerPosition, setTimerPosition] = useState<TimerPosition | null>(null);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const anchorRef = useRef(0);
  const elapsedBaseRef = useRef(0);
  const lastIntervalRef = useRef(-1);
  const completionRecordedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  const day = workouts.find((item) => item.day === settings.selectedDay) ?? workouts[0];
  const level = settings.levelsByDay[String(day.day)] ?? "L1";
  const includeLab = level !== "L1" && settings.labByDay[String(day.day)] === true;
  const key = variantKey(day.day, level);
  const variant = useMemo(() => toSessionVariant(day.day, level), [day.day, level]);
  const activeSwaps = settings.swapsByVariant[key] ?? {};
  const activeTimings = settings.timingsByVariant[key] ?? {};
  const ready = useMemo(() => effectiveReadiness(settings.readiness), [settings.readiness]);

  const basePreviewPlan = useMemo(() => buildSessionPlan({
    variant,
    exercises,
    includeLab,
    swaps: activeSwaps,
    timings: activeTimings,
    readiness: ready,
  }), [activeSwaps, activeTimings, includeLab, ready, variant]);
  const skippedToday = useMemo(() => new Set(todaySkippedByVariant[key] ?? []), [key, todaySkippedByVariant]);
  const previewPlan = useMemo(
    () => modifyTodayPlan(basePreviewPlan, skippedToday, todayTimingMode),
    [basePreviewPlan, skippedToday, todayTimingMode],
  );

  const slots = useMemo(
    () => slotsForVariant(variant, exercises, includeLab),
    [includeLab, variant],
  );
  const timeline = timelineFor(includeLab);
  const expectedSeconds = includeLab ? 1800 : 1500;
  const exactDefault = previewPlan.totalSeconds === expectedSeconds;

  useEffect(() => {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    setSettings(parseStoredAppState(current ?? legacy));
    try {
      const storedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      if (Array.isArray(storedHistory)) setHistory(storedHistory.slice(0, 12));
    } catch {
      setHistory([]);
    }
    setHydrated(true);
    void listProfiles().then((items) => {
      setProfiles(items);
      const lastId = localStorage.getItem("parallette25-last-profile");
      const last = items.find((item) => item.profileId === lastId) ?? items[0] ?? null;
      if (last) setProfile(last);
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }
  }, []);

  const openProfile = async (next: ProfileRecord) => {
    setProfile(next);
    localStorage.setItem("parallette25-last-profile", next.profileId);
    setProfileOpen(false);
  };
  const createProfile = async () => {
    const name = window.prompt("Choose a username for this device", "Athlete");
    if (!name?.trim()) return;
    const next = newProfile(name);
    await saveProfile(next);
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
    await saveProfile({ ...profile, username: username.slice(0, 32) });
    await refreshProfiles(profile.profileId);
  };
  const syncCurrentProfile = async () => {
    if (!profile) return;
    if (!remoteSyncAvailable) { setSyncStatus("offline"); return; }
    setSyncStatus("syncing");
    try {
      const next = await syncProfile(profile);
      await saveProfile(next);
      await refreshProfiles(next.profileId);
      setSyncStatus("saved");
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
    await deleteProfile(profile.profileId);
    setProfile(null);
    localStorage.removeItem("parallette25-last-profile");
    await refreshProfiles();
  };
  const generateCustom = () => setCustomPlan(buildCustomSession({ focuses: customFocuses, equipment: customEquipment as never, seconds: customSeconds, difficulty: customDifficulty, recentIds: settings.recentExerciseIds, readiness: ready }));

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [hydrated, settings]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
  }, [history, hydrated]);

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

  useEffect(() => {
    if (!complete || !activePlan || completionRecordedRef.current) return;
    completionRecordedRef.current = true;
    const activeDay = workouts.find((item) => item.day === activePlan.day) ?? day;
    const exerciseIds = Array.from(new Set(activePlan.intervals
      .filter((interval) => interval.kind === "work" && interval.exerciseId)
      .map((interval) => interval.exerciseId as string)));
    const entry: HistoryEntry = {
      id: `${Date.now()}-${activePlan.day}`,
      completedAt: new Date().toISOString(),
      day: activePlan.day,
      level: activePlan.level,
      title: activePlan.day === 0 ? "Custom Session" : activeDay.title,
      seconds: activePlan.totalSeconds,
      lab: activePlan.includeLab,
    };
    if (saveMode !== "guest") setHistory((previous) => [entry, ...previous].slice(0, 12));
    setSettings((previous) => ({
      ...previous,
      recentExerciseIds: [...previous.recentExerciseIds, ...exerciseIds].slice(-50),
    }));
    if (profile && saveMode !== "guest") {
      const progression = { ...profile.progression };
      if (saveMode === "normal") {
        exerciseIds.forEach((exerciseId) => {
          const feedback = settings.feedbackByExercise[exerciseId];
          if (!feedback) return;
          const previous = progression[exerciseId] ?? { cleanSessions: 0 };
          progression[exerciseId] = {
            cleanSessions: feedback === "hard" ? previous.cleanSessions : Math.min(2, previous.cleanSessions + 1),
            lastFeedback: feedback,
          };
        });
      }
      const nextProfile = { ...profile, nextProgramDay: activePlan.day > 0 ? (activePlan.day % 5) + 1 : profile.nextProgramDay, history: [...profile.history, { ...entry, mode: saveMode, exerciseIds }], progression };
      setProfile(nextProfile);
      void saveProfile(nextProfile);
    }
  }, [activePlan, complete, day, profile, saveMode, settings.feedbackByExercise]);

  const setDay = (nextDay: DayNumber) => setSettings((previous) => ({ ...previous, selectedDay: nextDay }));

  const setLevel = (nextLevel: DifficultyLevel) => setSettings((previous) => ({
    ...previous,
    levelsByDay: { ...previous.levelsByDay, [String(day.day)]: nextLevel },
    labByDay: {
      ...previous.labByDay,
      ...(nextLevel === "L1" ? { [String(day.day)]: false } : {}),
    },
  }));

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
    return slot.id === "lab-a" ? lab.a : lab.b;
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
      }).filter((item) => item.id !== current);
      const fresh = options.filter((item) => !recent.has(item.id));
      const pool = fresh.length ? fresh : options;
      if (pool.length) next[slot.id] = pool[Math.floor(Math.random() * pool.length)].id;
    });
    setSettings((previous) => ({
      ...previous,
      swapsByVariant: { ...previous.swapsByVariant, [key]: next },
    }));
  };

  const resetRecommended = () => setSettings((previous) => ({
    ...previous,
    swapsByVariant: { ...previous.swapsByVariant, [key]: {} },
  }));

  const startWorkout = () => {
    setActivePlan(previewPlan);
    setTimerPosition(locateTimerPosition(previewPlan, 0));
    elapsedBaseRef.current = 0;
    anchorRef.current = Date.now();
    lastIntervalRef.current = -1;
    completionRecordedRef.current = false;
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
    const plan: SessionPlan = { schemaVersion: 1, day: 0, level: customDifficulty === "easy" ? "L1" : customDifficulty === "hard" ? "L3" : "L2", includeLab: false, intervals, totalSeconds: intervals.reduce((sum, interval) => sum + interval.duration, 0) };
    setActivePlan(plan); setTimerPosition(locateTimerPosition(plan, 0)); elapsedBaseRef.current = 0; anchorRef.current = Date.now(); lastIntervalRef.current = -1; completionRecordedRef.current = false; setComplete(false); setCustomOpen(false); setPlayerOpen(true); setRunning(true); beep(true);
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

  const sectionBlocks: WorkoutBlock[] = includeLab
    ? ["warmup", "pre", "core", "handstand", "lab", "cooldown"]
    : ["warmup", "pre", "core", "handstand", "cooldown"];

  const completedReadiness = Object.entries(settings.readiness).filter(([, value]) => value).length;

  const auditParams = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  if (auditParams?.has("media-audit")) {
    return <MediaAuditPage page={Number(auditParams.get("page") ?? 0)} />;
  }
  if (auditParams?.has("rig-approval")) return <RigApprovalPage />;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Parallette 25+ home">
          <span className="brand-mark"><i /><i /></span>
          <span><strong>PARALLETTE</strong><b>25+</b></span>
        </a>
        <div className="header-actions">
          <button type="button" className="header-button profile-button" onClick={() => setProfileOpen(true)}><span className="profile-dot">{(profile?.username ?? "G").slice(0, 1).toUpperCase()}</span><span>{profile?.username ?? "Guest"}</span></button>
          <button type="button" className="header-button" onClick={() => setSettings((previous) => ({ ...previous, soundOn: !previous.soundOn }))}>
            {settings.soundOn ? <Volume2 /> : <VolumeX />}<span>{settings.soundOn ? "Sound on" : "Sound off"}</span>
          </button>
          <button type="button" className="header-button" onClick={() => setInstallOpen(true)}><Smartphone /><span>Use on iPhone</span></button>
        </div>
      </header>

      <section className="mode-bar" aria-label="Training modes">
        <div><span className="eyebrow"><span /> TRAINING MODE</span><strong>{profile ? `Saved as ${profile.username}` : "Guest session — nothing permanent is saved"}</strong></div>
        <div className="mode-actions"><button type="button" className="secondary-button compact" onClick={() => setCustomOpen(true)}><WandSparkles /> Build Custom Session</button><button type="button" className="secondary-button compact" onClick={() => setReadinessOpen(true)}><ShieldCheck /> Skills</button></div>
      </section>

      <section className="hero" id="top">
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
            <span><Check /> 163 movements</span>
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
              const labNote = block === "lab" ? day.labs[level]?.intensityNote : undefined;
              return (
                <section className={`exercise-section ${block === "lab" ? "lab-section" : ""} ${block === "cooldown" ? "cooldown-section" : ""}`} key={block}>
                  <div className="exercise-section-title">
                    <div className={`section-icon ${block === "core" ? "icon-core" : block === "cooldown" ? "icon-reset" : block === "handstand" || block === "pre" || block === "lab" ? "icon-skill" : ""}`}><SectionIcon block={block} /></div>
                    <div><span>{String(sectionIndex + 1).padStart(2, "0")}</span><h2>{blockLabels[block]}</h2><p>{blockMeta[block]}</p></div>
                  </div>
                  {block === "lab" && <p className="lab-callout">{day.labs[level]?.label}. {labNote ?? "Complete the clean target, then rest for the remainder of the 30-second practice window."}</p>}
                  <div className="exercise-grid">
                    {sectionSlots.map((slot) => {
                      const requestedId = activeSwaps[slot.id] ?? slot.defaultExerciseId;
                      const requested = exercises[requestedId];
                      const resolvedId = resolvedIdFor(slot.id) ?? requestedId;
                      const exercise = exercises[resolvedId];
                      const rounds = block === "lab" ? (slot.id === "lab-a" ? 3 : 2) : sectionRounds[block];
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
        <p className="eyebrow"><span /> SAVED ON THIS DEVICE</p><h2>Recent sessions</h2>
        {history.length === 0 ? <div className="history-empty">Your completed workouts will appear here. Nothing is uploaded or shared.</div> : (
          <div className="history-list">{history.slice(0, 6).map((item) => <div className="history-item" key={item.id}><strong>Day {item.day} • {item.level} • {item.title}</strong><span>{new Date(item.completedAt).toLocaleDateString()} • {formatTime(item.seconds)}{item.lab ? " • Lab" : ""}</span></div>)}</div>
        )}
      </section>

      <footer><div className="brand footer-brand"><span className="brand-mark"><i /><i /></span><span><strong>PARALLETTE</strong><b>25+</b></span></div><p>Stop for sharp pain, numbness, instability or loss of a controlled exit path.</p></footer>

      <div className="mobile-start-bar"><div><span>Day {day.day} • {level}</span><strong>{formatTime(previewPlan.totalSeconds)}</strong></div><button type="button" onClick={startWorkout}><Play fill="currentColor" /> Start workout</button></div>

      <AnimatePresence>
        {swapSlotId && (() => {
          const slot = slots.find((item) => item.id === swapSlotId);
          if (!slot) return null;
          const currentId = activeSwaps[slot.id] ?? slot.defaultExerciseId;
          const options = compatibleSwaps({ slot, exercises, day: day.day, level, readiness: ready, difficulty: swapFilter, includeLocked: true });
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
                const visible = path.filter((id) => Boolean(exercises[id]));
                const masteredIndex = visible.reduce((last, id, index) => (profile?.progression[id]?.cleanSessions ?? 0) >= 2 ? index : last, -1);
                const currentIndex = Math.min(visible.length - 1, masteredIndex + 1);
                return <article key={path[0]}><strong>{exercises[visible[0]]?.progressionFamily?.replaceAll("-", " ")}</strong>{visible.map((id, index) => <div className={index <= masteredIndex ? "done" : index === currentIndex ? "current" : ""} key={id}><i>{index <= masteredIndex ? <Check /> : index + 1}</i><span>{exercises[id].name}</span>{index === currentIndex && <small>{masteredIndex >= 0 ? "READY TO TRY" : "CURRENT"}</small>}</div>)}</article>;
              })}
            </div>
            <p className="install-note"><ShieldCheck /> A locked drill is automatically replaced by its declared safe regression. Readiness never changes your whole-day level automatically.</p>
          </Drawer>
        )}

        {customizeTodayOpen && (
          <Drawer title="Customize today" subtitle="Temporary changes affect only this session and never lower your saved readiness." onClose={() => setCustomizeTodayOpen(false)}>
            <div className="custom-builder today-builder">
              <p className="control-kicker">Comfort level</p>
              <div className="custom-chip-grid">{(["L1", "L2", "L3"] as DifficultyLevel[]).map((item) => <button type="button" className={level === item ? "active" : ""} key={item} onClick={() => setLevel(item)}>{levelLabels[item].name}</button>)}</div>
              <p className="control-kicker">Time after skipping</p>
              <div className="custom-chip-grid"><button type="button" className={todayTimingMode === "shorter" ? "active" : ""} onClick={() => setTodayTimingMode("shorter")}>Keep shorter</button><button type="button" className={todayTimingMode === "reallocate" ? "active" : ""} onClick={() => setTodayTimingMode("reallocate")}>Reallocate time</button></div>
              <div className="today-total"><Clock3 /><span>Today’s session</span><strong>{formatTime(previewPlan.totalSeconds)}</strong></div>
              <p className="control-kicker">Blocks and exercises</p>
              <div className="today-blocks">
                {sectionBlocks.map((block) => {
                  const blockSlots = slots.filter((slot) => slot.block === block);
                  const fullySkipped = blockSlots.length > 0 && blockSlots.every((slot) => skippedToday.has(slot.id));
                  return <section key={block}><button type="button" className={fullySkipped ? "off" : ""} onClick={() => toggleTodayBlock(block)}><strong>{blockLabels[block]}</strong><span>{fullySkipped ? "Skipped" : "Included"}</span></button>{blockSlots.map((slot) => { const id = resolvedIdFor(slot.id) ?? slot.defaultExerciseId; const skipped = skippedToday.has(slot.id); return <label key={slot.id}><input type="checkbox" checked={!skipped} onChange={() => toggleTodaySlot(slot.id)} /><span>{exercises[id].name}</span></label>; })}</section>;
                })}
              </div>
              <div className="drawer-actions"><button type="button" className="secondary-button" onClick={() => setTodaySkippedByVariant((previous) => ({ ...previous, [key]: [] }))}><RotateCcw /> Restore all</button><button type="button" className="primary-button" disabled={previewPlan.totalSeconds === 0} onClick={() => { setCustomizeTodayOpen(false); startWorkout(); }}><Play fill="currentColor" /> Start {formatTime(previewPlan.totalSeconds)}</button></div>
            </div>
          </Drawer>
        )}

        {profileOpen && (
          <Drawer title="Who's training?" subtitle="Choose a permanent profile or start a disposable Guest session." onClose={() => setProfileOpen(false)}>
            <div className="profile-list">
              {profiles.map((item) => <button type="button" className={profile?.profileId === item.profileId ? "selected" : ""} key={item.profileId} onClick={() => void openProfile(item)}><span className="profile-dot">{item.username.slice(0, 1).toUpperCase()}</span><strong>{item.username}</strong>{profile?.profileId === item.profileId && <Check />}</button>)}
            </div>
            <div className="drawer-actions"><button type="button" className="secondary-button" onClick={() => void createProfile()}><Plus /> New profile</button><button type="button" className="secondary-button" onClick={() => { setProfile(null); setProfileOpen(false); }}>Guest session</button></div>
            {profile && <div className="profile-data-panel">
              <p className="control-kicker">Profile</p><strong>{profile.username}</strong><button type="button" onClick={() => void renameProfile()}>Rename profile</button>
              <p className="control-kicker">Sync</p><div className="sync-line"><i className={`sync-${syncStatus}`} /><span>{syncStatus === "syncing" ? "Syncing…" : syncStatus === "error" ? "Sync error — retry" : remoteSyncAvailable ? "Saved" : "Offline — saved on this device"}</span></div><button type="button" onClick={() => void syncCurrentProfile()}>Sync now</button>
              <p className="control-kicker">Data</p><div className="profile-data-actions"><button type="button" onClick={() => downloadText(`parallette25-${profile.username}.json`, exportProfile(profile))}>Export backup</button><label>Import backup<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProfileFile(file); event.currentTarget.value = ""; }} /></label><button type="button" className="danger" onClick={() => void resetCurrentProfile()}>Reset progress</button><button type="button" className="danger" onClick={() => void removeCurrentProfile()}>Delete profile</button></div>
            </div>}
          </Drawer>
        )}

        {customOpen && (
          <Drawer title="Build a custom session" subtitle="Focus, equipment, time and difficulty are independent. The generator keeps the order safe." onClose={() => setCustomOpen(false)}>
            <div className="custom-builder">
              <p className="control-kicker">What do you want to train?</p>
              <div className="custom-chip-grid">{(["handstand", "core", "compression", "lsit", "planche", "pushing", "support", "mobility", "conditioning"] as CustomFocus[]).map((focus) => <button type="button" className={customFocuses.includes(focus) ? "active" : ""} key={focus} onClick={() => setCustomFocuses((current) => current.includes(focus) ? current.filter((item) => item !== focus) : [...current, focus])}>{focus === "lsit" ? "L-sit" : focus[0].toUpperCase() + focus.slice(1)}</button>)}</div>
              <p className="control-kicker">Equipment today</p>
              <div className="custom-chip-grid equipment-chips">{(["parallettes", "floor", "wall", "rope"] as const).map((item) => <button type="button" className={customEquipment.includes(item) ? "active" : ""} key={item} onClick={() => setCustomEquipment((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}>{item === "floor" ? "Mat / Floor" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
              <p className="control-kicker">How much time?</p><div className="custom-chip-grid">{[300, 600, 900, 1200, 1500, 1800].map((seconds) => <button type="button" className={customSeconds === seconds ? "active" : ""} key={seconds} onClick={() => setCustomSeconds(seconds)}>{formatTime(seconds)}</button>)}</div>
              <p className="control-kicker">Difficulty</p><div className="custom-chip-grid"><button type="button" className={customDifficulty === "easy" ? "active" : ""} onClick={() => setCustomDifficulty("easy")}>Easy</button><button type="button" className={customDifficulty === "recommended" ? "active" : ""} onClick={() => setCustomDifficulty("recommended")}>Recommended</button><button type="button" className={customDifficulty === "hard" ? "active" : ""} onClick={() => setCustomDifficulty("hard")}>Hard</button></div>
              <p className="control-kicker">Save mode</p><div className="custom-chip-grid"><button type="button" className={saveMode === "normal" ? "active" : ""} onClick={() => setSaveMode("normal")}>Normal · progress</button><button type="button" className={saveMode === "practice" ? "active" : ""} onClick={() => setSaveMode("practice")}>Practice only</button><button type="button" className={saveMode === "guest" ? "active" : ""} onClick={() => setSaveMode("guest")}>Guest · don't save</button></div>
              <div className="drawer-actions"><button type="button" className="secondary-button" onClick={generateCustom}><RefreshCw /> Generate</button>{customPlan && <button type="button" className="primary-button" onClick={startCustomWorkout}><Play fill="currentColor" /> Start {formatTime(customPlan.seconds)}</button>}</div>
              {customPlan && <div className="custom-preview"><strong>{customPlan.title} · {formatTime(customPlan.seconds)}</strong>{customPlan.warnings.map((warning) => <span key={warning}>{warning}</span>)}{customPlan.items.map((item, index) => <div key={`${item.exerciseId}-${item.block}-${index}`}><span>{blockLabels[item.block === "skill" ? "handstand" : item.block === "strength" ? "core" : item.block]}</span><strong>{exercises[item.exerciseId]?.name}</strong><small>{item.work}s work · {item.rest}s rest</small></div>)}</div>}
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
            <p className="install-note"><CircleHelp /> Preferences and history stay on this iPhone. After a successful first load, the app shell also works through a temporary connection loss. Reconnect occasionally to receive updates.</p>
          </Drawer>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerOpen && activePlan && timerPosition && (
          <motion.section className={`player player-${current?.kind ?? "work"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!complete && current ? (
              <>
                <div className="player-topbar">
                  <button type="button" className="icon-button player-close" onClick={() => { setRunning(false); setPlayerOpen(false); }} aria-label="Close workout"><X /></button>
                  <div><span>{activePlan.day === 0 ? "CUSTOM SESSION" : `DAY ${activePlan.day}`} • {activePlan.level} • {blockLabels[current.block]}</span><div className="player-progress"><i style={{ width: `${progress}%` }} /></div></div>
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
                <span>Your session is saved on this device. Progress an exercise only after its upper target is clean in two separate sessions.</span>
                <button type="button" className="primary-button" onClick={() => { setPlayerOpen(false); setComplete(false); }}><Check /> Finish session</button>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
