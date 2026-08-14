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
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ExerciseDemo } from "./ExerciseDemo";
import type { MotionPreset } from "./MotionGuide";
import {
  answerAssessmentQuestion,
  assessmentProgress,
  assessmentQuestions,
  assessmentSections,
  assessmentTracks,
  emptyStartingAssessment,
  evidenceWithProvisionalPlacement,
  parseStartingAssessment,
  reopenAssessmentTrack,
  restartStartingAssessment,
  suggestedWorkoutLevel,
  undoLastAssessmentAnswer,
  visibleProvisionalIndex,
  type AssessmentAnswer,
  type StartingAssessment,
} from "./assessment";
import { buildCustomSession, type CustomBlocks, type CustomDifficulty, type CustomFocus } from "./custom";
import { progressionPathState, recommendedProgressionAssignments } from "./progression";
import {
  applyFactoryReset,
  claimLegacyProfile,
  deleteProfile,
  exportProfile,
  hasProfileSession,
  importProfile,
  isSecuredProfile,
  listProfiles,
  recoverAccount,
  registerProfile,
  remoteSyncAvailable,
  resetProfileTraining,
  saveProfile,
  signInProfile,
  signOutProfile,
  profileSessionStorageKey,
  syncProfile,
  validateProfileSession,
  type ProfileRecord,
  type SaveMode,
} from "./profileStore";
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
  addExecutionRange,
  applySessionProgression,
  adaptSwapsForEquipment,
  buildSessionPlan,
  sessionBlockOrder,
  compatibleSwaps,
  defaultStoredAppState,
  hasMeaningfulProgrammeWork,
  locateTimerPosition,
  nextProgramDayAfterSession,
  parseStoredAppState,
  performedExerciseIdsFromExecution,
  reviewableExerciseIdsFromExecution,
  slotsForVariant,
  variantKey,
  type IntervalTiming,
  type IntervalExecution,
  type ExerciseFeedback,
  type ExerciseReview,
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
const ACTIVE_SESSION_KEY = "parallette25-active-session-v1";
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "development";
const scopedKey = (base: string, profileId?: string) => `${base}:${profileId ?? "guest"}`;
const MotionGuide = lazy(async () => ({ default: (await import("./MotionGuide")).MotionGuide }));

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
  exerciseReviews?: Partial<Record<string, ExerciseReview>>;
};

type PendingReview = {
  status: "complete" | "modified" | "partial";
  performedSeconds: number;
  exerciseIds: string[];
};
type ActiveSessionSnapshot = {
  version: 2;
  ownerId: string;
  plan: SessionPlan;
  elapsed: number;
  running: boolean;
  savedAt: number;
  modified: boolean;
  saveMode: SaveMode;
  pendingReview: PendingReview | null;
  reviews: Partial<Record<string, ExerciseReview>>;
  execution: Record<string, number>;
  /** Actual time spent with the timer running; navigation jumps never add time. */
  trainedSeconds: number;
};

const parseActiveSession = (value: string | null): ActiveSessionSnapshot | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Omit<ActiveSessionSnapshot, "version">> & { version?: number };
    if ((parsed.version !== 1 && parsed.version !== 2) || typeof parsed.ownerId !== "string" || !parsed.plan ||
      !Array.isArray(parsed.plan.intervals) || !Number.isFinite(parsed.plan.totalSeconds) ||
      !Number.isFinite(parsed.elapsed) || !Number.isFinite(parsed.savedAt) ||
      Date.now() - Number(parsed.savedAt) > 24 * 60 * 60 * 1000) return null;
    return {
      ...(parsed as Omit<ActiveSessionSnapshot, "version" | "execution">),
      version: 2,
      execution: parsed.execution && typeof parsed.execution === "object" ? parsed.execution : {},
      reviews: parsed.reviews && typeof parsed.reviews === "object" ? parsed.reviews : {},
      trainedSeconds: Number.isFinite(parsed.trainedSeconds)
        ? Math.max(0, Number(parsed.trainedSeconds))
        : Math.max(0, Number(parsed.elapsed)),
    };
  } catch { return null; }
};

type TimelineItem = readonly [string, string, string, WorkoutBlock];
type TodayTimingMode = "shorter" | "reallocate";
type LabTrack = "lsit" | "planche" | "pushing" | "support";

const reviewableCategories = new Set<Category>([
  "Pre-Handstand",
  "Handstand",
  "Abs",
  "Core",
  "Calisthenics",
  "Conditioning",
]);

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
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panel?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <motion.div
      className="drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
      >
        <div className="drawer-handle" />
        <div className="drawer-title-row">
          <div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
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
  equipmentAdjusted = false,
  progressionAdjusted = false,
}: {
  slot: SessionSlot;
  exercise: Exercise;
  requested: Exercise;
  target: string;
  timing: IntervalTiming;
  rounds: number | string;
  onSwap: () => void;
  onEdit: () => void;
  equipmentAdjusted?: boolean;
  progressionAdjusted?: boolean;
}) {
  const substituted = requested.id !== exercise.id;
  return (
    <motion.article layout className="exercise-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="exercise-visual"><ExerciseDemo exercise={exercise} deferOffscreen /></div>
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
        {equipmentAdjusted && <p className="substitution-note"><Check /> Adapted to today’s readiness or available equipment while keeping the same training role and avoiding duplicate drills.</p>}
        {progressionAdjusted && <p className="progression-note"><Sparkles /> Recommended from your latest review and clean-session evidence. Use Swap if you prefer another step today.</p>}
        <div className="exercise-actions">
          <button type="button" className="action-button" onClick={onSwap}><Shuffle /> Swap</button>
          <button type="button" className="action-button" onClick={onEdit}>
            <Settings2 /> {slot.block === "cooldown" ? `${timing.work}s` : `${timing.work}s / ${timing.rest}s`}
          </button>
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
  return <main className="media-audit-page rig-approval-page"><header><div><p>PARALLETTE25 · BATCH 0</p><h1>Avatar & rig approval</h1></div><strong>6 representative demonstrations</strong></header><div className="media-audit-grid">{tests.map((test) => <article key={test.preset}><div><Suspense fallback={<div className="motion-loading" />}><MotionGuide preset={test.preset} /></Suspense></div><h2>{test.name}</h2><p>{test.preset}</p><span>{test.checks}</span></article>)}</div></main>;
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
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentDraft, setAssessmentDraft] = useState<StartingAssessment>(() => emptyStartingAssessment());
  const [customizeTodayOpen, setCustomizeTodayOpen] = useState(false);
  const [todaySkippedByVariant, setTodaySkippedByVariant] = useState<Record<string, StableSlotId[]>>({});
  const [todayTimingMode, setTodayTimingMode] = useState<TodayTimingMode>("shorter");
  const [todayLevelByDay, setTodayLevelByDay] = useState<Partial<Record<DayNumber, DifficultyLevel>>>({});
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [accountMode, setAccountMode] = useState<"signin" | "create" | "recover">("signin");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [accountRecoveryInput, setAccountRecoveryInput] = useState("");
  const [accountRecoveryCode, setAccountRecoveryCode] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
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
  const [sessionReviews, setSessionReviews] = useState<Partial<Record<string, ExerciseReview>>>({});
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [recoverySnapshot, setRecoverySnapshot] = useState<ActiveSessionSnapshot | null>(null);
  const [activeSessionIdentity, setActiveSessionIdentity] = useState<{ ownerId: string; saveMode: SaveMode } | null>(null);
  const anchorRef = useRef(0);
  const elapsedBaseRef = useRef(0);
  const trainedAnchorRef = useRef(0);
  const trainedSecondsRef = useRef(0);
  const executionCursorRef = useRef(0);
  const executionRef = useRef<Record<string, number>>({});
  const lastIntervalRef = useRef(-1);
  const completionRecordedRef = useRef(false);
  const customGenerationRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void>; released: boolean } | null>(null);
  const profileRef = useRef<ProfileRecord | null>(null);
  const profileContextGenerationRef = useRef(0);
  const playerRef = useRef<HTMLElement>(null);
  const endWorkoutEarlyRef = useRef<() => void>(() => undefined);
  const playerTitleId = useId();
  profileRef.current = profile;

  const day = workouts.find((item) => item.day === settings.selectedDay) ?? workouts[0];
  const preferredLevel = settings.levelsByDay[String(day.day)] ?? "L1";
  const level = todayLevelByDay[day.day] ?? preferredLevel;
  const includeLab = level !== "L1" && settings.labByDay[String(day.day)] === true;
  const key = variantKey(day.day, level);
  const variant = useMemo(() => toSessionVariant(day.day, level), [day.day, level]);
  const activeSwaps = settings.swapsByVariant[key] ?? {};
  const activeTimings = settings.timingsByVariant[key] ?? {};
  const ready = useMemo(() => effectiveReadiness(settings.readiness), [settings.readiness]);
  const appliedPlacements = useMemo(() => assessmentDraft.appliedPlacements, [assessmentDraft.appliedPlacements]);
  const effectiveProgression = useMemo(() => evidenceWithProvisionalPlacement(
    profile?.progression ?? {},
    appliedPlacements,
    skillProgressionPaths,
  ), [appliedPlacements, profile?.progression]);
  const currentAssessmentQuestions = useMemo(() => assessmentQuestions(assessmentDraft), [assessmentDraft]);
  const currentAssessmentQuestion = currentAssessmentQuestions[0];
  const currentAssessmentProgress = useMemo(() => assessmentProgress(assessmentDraft), [assessmentDraft]);
  const assessmentSuggestedLevel = useMemo(() => suggestedWorkoutLevel(assessmentDraft), [assessmentDraft]);

  const slots = useMemo(
    () => slotsForVariant(variant, exercises, includeLab),
    [includeLab, variant],
  );
  const progressionSwaps = useMemo(() => {
    const compatibleBySlot = new Map<string, Set<string>>(slots.map((slot) => [slot.id, new Set(compatibleSwaps({
      slot, exercises, day: day.day, level, readiness: ready,
      difficulty: "all", equipment: todayEquipment,
    }).map((candidate) => candidate.id))]));
    const assignments = recommendedProgressionAssignments(
      slots,
      exercises,
      effectiveProgression,
      (slot, candidate) => compatibleBySlot.get(slot.id)?.has(candidate.id) === true,
      skillProgressionPaths,
      activeSwaps,
    );
    return Object.fromEntries(slots.flatMap((slot) => assignments[slot.id] && assignments[slot.id] !== slot.defaultExerciseId
      ? [[slot.id, assignments[slot.id]]]
      : []));
  }, [activeSwaps, day.day, effectiveProgression, level, ready, slots, todayEquipment]);
  const equipmentAdaptation = useMemo(() => adaptSwapsForEquipment({
    slots, exercises, swaps: progressionSwaps, day: day.day, level, readiness: ready, equipment: todayEquipment,
  }), [day.day, level, progressionSwaps, ready, slots, todayEquipment]);
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
    slots.some((slot) => equipmentSwaps[slot.id] !== progressionSwaps[slot.id]);
  const timeline = timelineFor(includeLab);
  const expectedSeconds = includeLab ? 1800 : 1500;
  const exactDefault = previewPlan.totalSeconds === expectedSeconds;

  useEffect(() => {
    let active = true;
    void (async () => {
      await applyFactoryReset();
      if (!active) return;
      const savedSession = parseActiveSession(localStorage.getItem(ACTIVE_SESSION_KEY));
      if (savedSession) setRecoverySnapshot(savedSession);
      else localStorage.removeItem(ACTIVE_SESSION_KEY);
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
      const items = await listProfiles();
      if (!active) return;
      setProfiles(items);
      const lastId = localStorage.getItem("parallette25-last-profile");
      const last = items.find((item) => item.profileId === lastId) ?? null;
      if (last && (!isSecuredProfile(last) || hasProfileSession(last.profileId))) {
        let verified = last;
        if (remoteSyncAvailable && hasProfileSession(last.profileId)) {
          try {
            const validated = await validateProfileSession(last.profileId);
            if (!validated) {
              if (active) { openGuest(); setProfileOpen(true); }
              return;
            }
            verified = validated;
          }
          catch { /* Keep the local profile available while offline. */ }
        }
        if (active) void openProfile(verified);
      }
      else {
        setSaveMode("guest");
        setProfileOpen(true);
      }
    })();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const topHash = window.location.hash === "#top" || window.location.hash === "#app-top";
    if (window.location.hash && !topHash) return () => { window.history.scrollRestoration = previousRestoration; };
    if (topHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

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

  const clearAccountSecrets = () => {
    setAccountPassword("");
    setAccountPasswordConfirm("");
    setAccountRecoveryInput("");
    setAccountError("");
  };
  const clearAccountForm = () => {
    clearAccountSecrets();
    setAccountRecoveryCode("");
  };
  const resetEphemeralTrainingChoices = () => {
    setTodayLevelByDay({});
    setTodaySkippedByVariant({});
    setTodayTimingMode("shorter");
    setCustomFocuses(["core"]);
    setCustomDifficulty("recommended");
    setCustomSeconds(900);
    setCustomPlan(null);
    setCustomAdvanced(false);
    setCustomPreferProgression(true);
    setCustomPreferVariety(true);
    setCustomBlocks({ warmup: true, preparation: true, skill: true, strength: true, cooldown: true, lab: false });
    setUndoSwaps(null);
    setSwapSlotId(null);
    setEditSlotId(null);
    setCustomizeTodayOpen(false);
    setCustomOpen(false);
  };

  const openProfile = async (next: ProfileRecord, preserveRecoveryCode = false) => {
    profileContextGenerationRef.current += 1;
    resetEphemeralTrainingChoices();
    if (!preserveRecoveryCode) clearAccountForm();
    setNewProfileName("");
    const savedState = localStorage.getItem(scopedKey(STORAGE_KEY, next.profileId));
    const preferenceState = (next.preferences as { appState?: unknown }).appState;
    // A signed account's merged profile is authoritative across devices. The
    // scoped mirror is only a legacy/offline fallback, never a stale override.
    const nextSettings = parseStoredAppState(
      isSecuredProfile(next)
        ? preferenceState ?? savedState ?? defaultStoredAppState()
        : savedState ?? preferenceState ?? defaultStoredAppState(),
      exercises,
    );
    nextSettings.selectedDay = next.nextProgramDay >= 1 && next.nextProgramDay <= 5 ? next.nextProgramDay : nextSettings.selectedDay;
    nextSettings.readiness = { ...nextSettings.readiness, ...next.readiness };
    setSettings(nextSettings);
    setHistory(historyForProfile(next));
    setCustomEquipment(next.equipment.length ? next.equipment : ["parallettes", "floor", "wall"]);
    setTodayEquipment(next.equipment.length ? next.equipment : ["parallettes", "floor", "wall"]);
    const preferredSaveMode = (next.preferences as { saveMode?: SaveMode }).saveMode;
    setSaveMode(preferredSaveMode === "practice" || preferredSaveMode === "guest" ? preferredSaveMode : "normal");
    setAssessmentDraft(parseStartingAssessment((next.preferences as { startingAssessment?: unknown }).startingAssessment));
    profileRef.current = next;
    setProfile(next);
    setSyncStatus(remoteSyncAvailable && hasProfileSession(next.profileId) ? "saved" : "offline");
    localStorage.setItem("parallette25-last-profile", next.profileId);
    setProfileOpen(false);
  };
  const openGuest = () => {
    profileContextGenerationRef.current += 1;
    resetEphemeralTrainingChoices();
    clearAccountForm();
    setNewProfileName("");
    const guestState = parseStoredAppState(localStorage.getItem(scopedKey(STORAGE_KEY)), exercises);
    setSettings(guestState);
    try { setHistory(JSON.parse(localStorage.getItem(scopedKey(HISTORY_KEY)) ?? "[]") as HistoryEntry[]); }
    catch { setHistory([]); }
    setCustomEquipment(["parallettes", "floor", "wall"]);
    setTodayEquipment(["parallettes", "floor", "wall"]);
    profileRef.current = null;
    setProfile(null);
    setAssessmentDraft(emptyStartingAssessment());
    setSaveMode("guest");
    localStorage.removeItem("parallette25-last-profile");
    setProfileOpen(false);
  };
  const selectExistingProfile = (next: ProfileRecord) => {
    clearAccountForm();
    if (isSecuredProfile(next) && !hasProfileSession(next.profileId)) {
      setNewProfileName(next.username);
      setAccountMode("signin");
      setAccountError("Sign in to unlock this account on this device.");
      setProfileOpen(true);
      return;
    }
    if (profile?.profileId !== next.profileId && !window.confirm(`Use “${next.username}” on this device?`)) return;
    void openProfile(next);
  };
  const showRecoveryCode = (code?: string) => {
    if (!code) return;
    setAccountRecoveryCode(code);
    window.setTimeout(() => document.getElementById("recovery-code")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const createAccount = async () => {
    const name = newProfileName.trim();
    if (!name || accountBusy) return;
    if (accountPassword !== accountPasswordConfirm) { setAccountError("The two passwords do not match."); return; }
    setAccountBusy(true);
    setAccountError("");
    try {
      const result = await registerProfile(name, accountPassword);
      showRecoveryCode(result.recoveryCode);
      setNewProfileName("");
      clearAccountSecrets();
      setProfiles(await listProfiles());
      await openProfile(result.profile, true);
      setProfileOpen(true);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "The account could not be created.");
    } finally { setAccountBusy(false); }
  };
  const signInAccount = async () => {
    const name = newProfileName.trim();
    if (!name || accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      const next = await signInProfile(name, accountPassword);
      clearAccountForm();
      setNewProfileName("");
      setProfiles(await listProfiles());
      await openProfile(next);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally { setAccountBusy(false); }
  };
  const secureCurrentProfile = async () => {
    if (!profile || accountBusy) return;
    if (accountPassword !== accountPasswordConfirm) { setAccountError("The two passwords do not match."); return; }
    setAccountBusy(true);
    setAccountError("");
    try {
      const result = await claimLegacyProfile(profile, accountPassword);
      showRecoveryCode(result.recoveryCode);
      clearAccountSecrets();
      setProfiles(await listProfiles());
      await openProfile(result.profile, true);
      setProfileOpen(true);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "This profile could not be secured.");
    } finally { setAccountBusy(false); }
  };
  const recoverProfileAccount = async () => {
    const name = newProfileName.trim();
    if (!name || accountBusy) return;
    if (accountPassword !== accountPasswordConfirm) { setAccountError("The two passwords do not match."); return; }
    setAccountBusy(true);
    setAccountError("");
    try {
      const result = await recoverAccount(name, accountRecoveryInput, accountPassword);
      showRecoveryCode(result.recoveryCode);
      clearAccountSecrets();
      setNewProfileName("");
      setProfiles(await listProfiles());
      await openProfile(result.profile, true);
      setProfileOpen(true);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Recovery failed.");
    } finally { setAccountBusy(false); }
  };
  const refreshProfiles = async (selectedId?: string) => {
    const items = await listProfiles();
    setProfiles(items);
    if (selectedId) {
      const selected = items.find((item) => item.profileId === selectedId) ?? null;
      profileRef.current = selected;
      setProfile(selected);
      if (selected) setAssessmentDraft(parseStartingAssessment((selected.preferences as { startingAssessment?: unknown }).startingAssessment));
    }
  };
  const renameProfile = async () => {
    if (!profile) return;
    if (remoteSyncAvailable && !hasProfileSession(profile.profileId)) {
      setAccountError("Secure this profile before changing its username.");
      setProfileOpen(true);
      return;
    }
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
    if (!hasProfileSession(profile.profileId)) {
      setSyncStatus("offline");
      setAccountError("Secure this legacy profile, or sign in, to enable cross-device sync.");
      return;
    }
    setSyncStatus("syncing");
    try {
      const next = await syncProfile(profile);
      profileRef.current = next;
      setProfile(next);
      setHistory(historyForProfile(next));
      const syncedState = (next.preferences as { appState?: unknown }).appState;
      if (syncedState) {
        const nextSettings = parseStoredAppState(syncedState, exercises);
        nextSettings.selectedDay = next.nextProgramDay;
        nextSettings.readiness = { ...nextSettings.readiness, ...next.readiness };
        setSettings(nextSettings);
      }
      await refreshProfiles(next.profileId);
      setSyncStatus(next.pendingSync ? "error" : "saved");
    } catch { setSyncStatus("error"); }
  };
  const importProfileFile = async (file: File) => {
    const imported = importProfile(await file.text());
    if (!imported) { window.alert("That file is not a valid Parallette25 backup."); return; }
    const replaceAuthenticated = Boolean(profile && hasProfileSession(profile.profileId) && window.confirm(
      `Replace the training data inside signed-in account “${profile.username}”? A safety copy downloads first.\n\nChoose Cancel to import this backup as a separate local profile instead.`,
    ));
    let replacement: ProfileRecord;
    if (replaceAuthenticated && profile) {
      downloadText(`parallette25-${profile.username}-safety.json`, exportProfile(profile));
      replacement = {
        ...imported,
        profileId: profile.profileId,
        username: profile.username,
        accountSecured: profile.accountSecured,
        revision: profile.revision,
        createdAt: profile.createdAt,
        lastSyncedAt: profile.lastSyncedAt,
      };
    } else {
      const baseName = imported.username.trim() || "Imported athlete";
      const usedNames = new Set(profiles.map((item) => item.username.toLocaleLowerCase()));
      let username = baseName;
      for (let suffix = 2; usedNames.has(username.toLocaleLowerCase()); suffix += 1) username = `${baseName} ${suffix}`.slice(0, 32);
      const { accountSecured: _accountSecured, lastSyncedAt: _lastSyncedAt, syncError: _syncError, ...localBackup } = imported;
      replacement = {
        ...localBackup,
        profileId: globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        username,
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingSync: false,
      };
    }
    const updated = await saveProfile(replacement);
    setProfiles(await listProfiles());
    await openProfile(updated);
  };
  const resetCurrentProfile = async () => {
    if (!profile || !window.confirm(`Reset all training progress for ${profile.username}? This keeps the profile name and preferences.`)) return;
    const profileId = profile.profileId;
    const storedSession = parseActiveSession(localStorage.getItem(ACTIVE_SESSION_KEY));
    if (storedSession?.ownerId === profileId) localStorage.removeItem(ACTIVE_SESSION_KEY);
    if (recoverySnapshot?.ownerId === profileId) setRecoverySnapshot(null);
    if (activeSessionIdentity?.ownerId === profileId) {
      setRunning(false);
      setPlayerOpen(false);
      setComplete(false);
      setActivePlan(null);
      setTimerPosition(null);
      setPendingReview(null);
      setSessionReviews({});
      setActiveSessionIdentity(null);
      executionRef.current = {};
      executionCursorRef.current = 0;
      trainedSecondsRef.current = 0;
    }
    const resetAt = new Date().toISOString();
    const startingAssessment = emptyStartingAssessment();
    const resetSettings: StoredAppState = {
      ...settings,
      selectedDay: 1,
      readiness: {},
      recentExerciseIds: [],
      cleanTargetSessions: {},
      feedbackByExercise: {},
    };
    setSettings(resetSettings);
    setAssessmentDraft(startingAssessment);
    setHistory([]);
    setTodayLevelByDay({});
    setTodaySkippedByVariant({});
    localStorage.setItem(scopedKey(STORAGE_KEY, profile.profileId), JSON.stringify(resetSettings));
    localStorage.setItem(scopedKey(HISTORY_KEY, profile.profileId), "[]");
    const resetProfile = {
      ...resetProfileTraining(profile, resetAt),
      preferences: {
        ...profile.preferences,
        startingAssessment,
        appState: resetSettings,
        appStateUpdatedAt: resetAt,
      },
    };
    profileRef.current = resetProfile;
    setProfile(resetProfile);
    const updated = await saveProfile(resetProfile);
    profileRef.current = updated;
    setProfile(updated);
    await refreshProfiles(updated.profileId);
  };
  const removeCurrentProfile = async () => {
    if (!profile) return;
    if (isSecuredProfile(profile) && !hasProfileSession(profile.profileId)) {
      setNewProfileName(profile.username);
      setAccountMode("signin");
      setAccountError("Sign in first to permanently delete this cloud account.");
      setProfileOpen(true);
      return;
    }
    const phrase = window.prompt(`Type ${profile.username} to permanently delete this profile.`);
    if (phrase !== profile.username) return;
    try {
      const password = hasProfileSession(profile.profileId) ? window.prompt("Enter your password to delete this account permanently.") ?? undefined : undefined;
      if (hasProfileSession(profile.profileId) && !password) return;
      await deleteProfile(profile.profileId, password);
      openGuest();
      await refreshProfiles();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The profile could not be deleted. Please reconnect and try again.");
    }
  };
  const signOutCurrentProfile = async () => {
    if (!profile) return;
    const profileId = profile.profileId;
    clearAccountForm();
    await signOutProfile(profile.profileId);
    localStorage.removeItem(scopedKey(STORAGE_KEY, profileId));
    localStorage.removeItem(scopedKey(HISTORY_KEY, profileId));
    openGuest();
    setProfiles(await listProfiles());
  };
  const toggleDefaultEquipment = async (item: string) => {
    if (!profile) return;
    const current = profile.equipment.length ? profile.equipment : ["parallettes", "floor", "wall"];
    const equipment = current.includes(item)
      ? (current.length > 1 ? current.filter((value) => value !== item) : current)
      : [...current, item];
    const updated = await saveProfile({ ...profile, equipment });
    profileRef.current = updated;
    setProfile(updated);
    setCustomEquipment(equipment);
    setTodayEquipment(equipment);
    await refreshProfiles(updated.profileId);
  };
  const persistStartingAssessment = async (next: StartingAssessment) => {
    const current = profileRef.current;
    if (!current) return;
    setAssessmentDraft(next);
    const optimistic = { ...current, preferences: { ...current.preferences, startingAssessment: next } };
    profileRef.current = optimistic;
    setProfile(optimistic);
    setAssessmentBusy(true);
    try {
      const updated = await saveProfile(optimistic);
      profileRef.current = updated;
      setProfile(updated);
      setProfiles((items) => items.map((item) => item.profileId === updated.profileId ? updated : item));
      setSyncStatus(updated.pendingSync ? "offline" : "saved");
    } finally { setAssessmentBusy(false); }
  };
  const startStartingAssessment = (restart = false) => {
    if (!profile) {
      setAccountError("Create an account or sign in before setting a permanent starting level.");
      setReadinessOpen(false);
      setAssessmentOpen(false);
      setProfileOpen(true);
      return;
    }
    const next = restart || assessmentDraft.status === "offered" || assessmentDraft.status === "dismissed"
      ? restartStartingAssessment(restart ? assessmentDraft : undefined)
      : assessmentDraft;
    setAssessmentDraft(next);
    setReadinessOpen(false);
    setProfileOpen(false);
    setAssessmentOpen(true);
    if (next !== assessmentDraft) void persistStartingAssessment(next);
  };
  const dismissStartingAssessment = () => {
    const next = { ...assessmentDraft, status: "dismissed" as const, updatedAt: new Date().toISOString() };
    void persistStartingAssessment(next);
  };
  const recordAssessmentAnswer = (answer: AssessmentAnswer) => {
    const question = assessmentQuestions(assessmentDraft)[0];
    if (!question || assessmentBusy) return;
    void persistStartingAssessment(answerAssessmentQuestion(assessmentDraft, question, answer, skillProgressionPaths));
  };
  const undoAssessmentAnswer = () => {
    if (assessmentBusy || assessmentDraft.answerOrder.length === 0) return;
    void persistStartingAssessment(undoLastAssessmentAnswer(assessmentDraft, skillProgressionPaths));
  };
  const editAssessmentTrack = (trackId: string) => {
    if (assessmentBusy) return;
    void persistStartingAssessment(reopenAssessmentTrack(assessmentDraft, trackId));
  };
  const restartAssessmentFromScratch = () => {
    if (assessmentBusy || !window.confirm("Restart all assessment answers? Your previously applied starting points remain active until you apply the new result.")) return;
    void persistStartingAssessment(restartStartingAssessment(assessmentDraft));
  };
  const applyStartingAssessment = async () => {
    const current = profileRef.current;
    if (!current || assessmentBusy || assessmentDraft.status !== "review") return;
    const changedAt = new Date().toISOString();
    const next = { ...assessmentDraft, status: "completed" as const, appliedPlacements: { ...assessmentDraft.placements }, updatedAt: changedAt };
    const nextSettings: StoredAppState = {
      ...settings,
      levelsByDay: Object.fromEntries([1, 2, 3, 4, 5].map((dayNumber) => [String(dayNumber), assessmentSuggestedLevel])) as StoredAppState["levelsByDay"],
      ...(assessmentSuggestedLevel === "L1" ? { labByDay: { "1": false, "2": false, "3": false, "4": false, "5": false } } : {}),
    };
    profileContextGenerationRef.current += 1;
    setTodayLevelByDay({});
    setSettings(nextSettings);
    setAssessmentDraft(next);
    localStorage.setItem(scopedKey(STORAGE_KEY, current.profileId), JSON.stringify(nextSettings));
    const optimistic = {
      ...current,
      preferences: {
        ...current.preferences,
        startingAssessment: next,
        appState: nextSettings,
        appStateUpdatedAt: changedAt,
      },
    };
    profileRef.current = optimistic;
    setProfile(optimistic);
    setAssessmentBusy(true);
    try {
      const updated = await saveProfile(optimistic);
      profileRef.current = updated;
      setProfile(updated);
      setProfiles((items) => items.map((item) => item.profileId === updated.profileId ? updated : item));
      setSyncStatus(updated.pendingSync ? "offline" : "saved");
      setAssessmentOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The starting point could not be saved. Please try again.");
    } finally {
      setAssessmentBusy(false);
    }
  };
  const generateCustom = () => {
    customGenerationRef.current += 1;
    setCustomPlan(buildCustomSession({
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
      progressionEvidence: effectiveProgression,
      variationSeed: Date.now() + customGenerationRef.current,
    }));
  };

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
    const contextGeneration = profileContextGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (profileContextGenerationRef.current !== contextGeneration) return;
      const activeProfile = profileRef.current;
      if (!activeProfile || activeProfile.profileId !== profileId) return;
      const readinessUpdatedAt = { ...activeProfile.readinessUpdatedAt };
      const changedAt = new Date().toISOString();
      for (const id of new Set([...Object.keys(activeProfile.readiness), ...Object.keys(settings.readiness)])) {
        if ((activeProfile.readiness[id] === true) !== (settings.readiness[id] === true)) readinessUpdatedAt[id] = changedAt;
      }
      void saveProfile({
        ...activeProfile,
        readiness: settings.readiness,
        readinessUpdatedAt,
        equipment: activeProfile.equipment,
        preferences: { ...activeProfile.preferences, appState: settings, appStateUpdatedAt: changedAt, saveMode },
      }).then((updated) => {
        if (profileContextGenerationRef.current !== contextGeneration) return;
        profileRef.current = updated;
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
        profileRef.current = updated;
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

  // Returning to the app is a deliberate sync point even when this device has
  // no pending edits; otherwise sessions completed on another phone can remain
  // invisible until a full reload.
  useEffect(() => {
    if (!profile?.profileId || !remoteSyncAvailable || !hasProfileSession(profile.profileId)) return;
    let cancelled = false;
    const pullLatest = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || !profileRef.current) return;
      void syncProfile(profileRef.current).then((updated) => {
        if (cancelled) return;
        profileRef.current = updated;
        setProfile(updated);
        setProfiles((current) => current.map((item) => item.profileId === updated.profileId ? updated : item));
        setHistory(historyForProfile(updated));
        const syncedState = (updated.preferences as { appState?: unknown }).appState;
        if (syncedState) {
          const nextSettings = parseStoredAppState(syncedState, exercises);
          nextSettings.selectedDay = updated.nextProgramDay;
          nextSettings.readiness = { ...nextSettings.readiness, ...updated.readiness };
          setSettings(nextSettings);
        }
        setSyncStatus(updated.pendingSync ? "error" : "saved");
      });
    };
    document.addEventListener("visibilitychange", pullLatest);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", pullLatest); };
  }, [profile?.profileId]);

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

  useEffect(() => {
    if (!playerOpen || !running || complete) return;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || wakeLockRef.current) return;
      const manager = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void>; released: boolean }> } }).wakeLock;
      if (!manager) return;
      try {
        const sentinel = await manager.request("screen");
        if (cancelled) await sentinel.release();
        else wakeLockRef.current = sentinel;
      } catch { /* The timer still works when the browser denies screen wake lock. */ }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
      else wakeLockRef.current = null;
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };
  }, [complete, playerOpen, running]);

  const elapsedFromClock = useCallback(() => elapsedBaseRef.current +
    (running ? (Date.now() - anchorRef.current) / 1000 : 0), [running]);

  const trainedSecondsFromClock = useCallback(() => trainedSecondsRef.current +
    (running ? Math.max(0, (Date.now() - trainedAnchorRef.current) / 1000) : 0), [running]);

  const commitTrainedTime = useCallback(() => {
    trainedSecondsRef.current = trainedSecondsFromClock();
    trainedAnchorRef.current = Date.now();
    return trainedSecondsRef.current;
  }, [trainedSecondsFromClock]);

  const creditExecutionTo = useCallback((elapsed: number) => {
    if (!activePlan) return;
    const bounded = Math.max(0, Math.min(activePlan.totalSeconds, elapsed));
    if (bounded > executionCursorRef.current) {
      executionRef.current = addExecutionRange(
        activePlan,
        executionRef.current,
        executionCursorRef.current,
        bounded,
      );
    }
    executionCursorRef.current = bounded;
  }, [activePlan]);

  useEffect(() => {
    if (!running || !activePlan || complete) return;
    const update = () => {
      const elapsed = elapsedBaseRef.current + (Date.now() - anchorRef.current) / 1000;
      creditExecutionTo(elapsed);
      const position = locateTimerPosition(activePlan, elapsed);
      setTimerPosition(position);
      if (position.intervalIndex !== lastIntervalRef.current) {
        lastIntervalRef.current = position.intervalIndex;
        if (position.interval) beep(position.interval.kind === "work");
      }
      if (position.complete) {
        commitTrainedTime();
        elapsedBaseRef.current = activePlan.totalSeconds;
        setRunning(false);
        setComplete(true);
        beep(true);
      }
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [activePlan, beep, commitTrainedTime, complete, creditExecutionTo, running]);

  const persistActiveSession = useCallback((runningOverride = running): ActiveSessionSnapshot | null => {
    if (!playerOpen || !activePlan) return null;
    const elapsed = Math.max(0, Math.min(activePlan.totalSeconds, elapsedFromClock()));
    creditExecutionTo(elapsed);
    const identity = activeSessionIdentity ?? { ownerId: profile?.profileId ?? "guest", saveMode };
    const snapshot: ActiveSessionSnapshot = {
      version: 2,
      ownerId: identity.ownerId,
      plan: activePlan,
      elapsed,
      running: runningOverride,
      savedAt: Date.now(),
      modified: activeSessionModified,
      saveMode: identity.saveMode,
      pendingReview,
      reviews: sessionReviews,
      execution: executionRef.current,
      trainedSeconds: trainedSecondsFromClock(),
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snapshot));
    return snapshot;
  }, [activePlan, activeSessionIdentity, activeSessionModified, creditExecutionTo, elapsedFromClock, pendingReview, playerOpen, profile?.profileId, running, saveMode, sessionReviews, trainedSecondsFromClock]);

  useEffect(() => {
    if (!playerOpen || !activePlan) return;
    persistActiveSession();
    const timer = window.setInterval(persistActiveSession, 1000);
    const onPageHide = () => { persistActiveSession(); };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [activePlan, persistActiveSession, playerOpen]);

  useEffect(() => {
    const onAccountSessionChange = (event: StorageEvent) => {
      if (event.key !== profileSessionStorageKey) return;
      const currentProfile = profileRef.current;
      if (!currentProfile || !isSecuredProfile(currentProfile) || hasProfileSession(currentProfile.profileId)) return;

      if (playerOpen && activeSessionIdentity?.ownerId === currentProfile.profileId) {
        const lockedSnapshot = persistActiveSession(false);
        if (lockedSnapshot) setRecoverySnapshot({ ...lockedSnapshot, running: false });
        setRunning(false);
        setPlayerOpen(false);
        setComplete(false);
        setActivePlan(null);
        setTimerPosition(null);
        setPendingReview(null);
        setSessionReviews({});
        setActiveSessionIdentity(null);
        executionRef.current = {};
        executionCursorRef.current = 0;
        trainedSecondsRef.current = 0;
      }

      // The preserved snapshot remains locked to its original owner. Guest
      // state is loaded only after it has been parked, so no history or review
      // can leak into the disposable profile.
      openGuest();
      setProfileOpen(true);
      void listProfiles().then(setProfiles);
    };
    window.addEventListener("storage", onAccountSessionChange);
    return () => window.removeEventListener("storage", onAccountSessionChange);
  }, [activeSessionIdentity?.ownerId, persistActiveSession, playerOpen]);

  const recordSessionOutcome = useCallback(async (
    plan: SessionPlan,
    status: "complete" | "modified" | "partial",
    performedSeconds: number,
    performedExerciseIds: string[],
    reviews: Partial<Record<string, ExerciseReview>>,
  ): Promise<boolean> => {
    if (completionRecordedRef.current) return false;
    const activeDay = workouts.find((item) => item.day === plan.day) ?? day;
    const exerciseIds = Array.from(new Set(performedExerciseIds));
    const participatedExerciseIds = performedExerciseIdsFromExecution(plan, executionRef.current);
    const skippedExerciseIds = Array.from(new Set(plan.intervals.flatMap((interval) =>
      interval.kind === "work" && interval.exerciseId && !participatedExerciseIds.includes(interval.exerciseId)
        ? [interval.exerciseId]
        : [])));
    const ratedReviews = Object.fromEntries(Object.entries(reviews).filter((entry): entry is [string, ExerciseReview] => Boolean(entry[1])));
    const identity = activeSessionIdentity ?? { ownerId: profile?.profileId ?? "guest", saveMode };
    const sessionMode = identity.saveMode;
    const currentProfile = profileRef.current;
    const ownerProfile = currentProfile?.profileId === identity.ownerId ? currentProfile : null;
    if (sessionMode !== "guest" && !ownerProfile) {
      window.alert("This workout belongs to another signed-in profile. Switch back to that athlete before saving the review.");
      return false;
    }
    completionRecordedRef.current = true;
    const entry: HistoryEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${plan.day}`,
      completedAt: new Date().toISOString(),
      day: plan.day,
      level: plan.level,
      title: plan.day === 0 ? "Custom Session" : activeDay.title,
      seconds: performedSeconds,
      lab: plan.includeLab,
      mode: sessionMode,
      status,
      exerciseReviews: ratedReviews,
    };
    if (ownerProfile && sessionMode !== "guest") {
      setHistory((previous) => [entry, ...previous].slice(0, 12));
      setSettings((previous) => ({
        ...previous,
        recentExerciseIds: [...previous.recentExerciseIds, ...exerciseIds].slice(-50),
        feedbackByExercise: {
          ...previous.feedbackByExercise,
          ...Object.fromEntries(Object.entries(ratedReviews).map(([id, review]) => [id, review.feedback])),
        },
      }));
    }
    if (ownerProfile && sessionMode !== "guest") {
      const progression = applySessionProgression(ownerProfile.progression, exerciseIds, ratedReviews, sessionMode);
      const meaningfulProgrammeWork = hasMeaningfulProgrammeWork(plan, executionRef.current);
      const nextProgramDay = nextProgramDayAfterSession(ownerProfile.nextProgramDay, plan.day, status, sessionMode, meaningfulProgrammeWork);
      const nextProfile = {
        ...ownerProfile,
        nextProgramDay,
        history: [...ownerProfile.history, {
          ...entry,
          mode: sessionMode,
          status,
          exerciseIds: participatedExerciseIds,
          completedExerciseIds: exerciseIds,
          skippedExerciseIds,
          advancesProgram: sessionMode === "normal" && status !== "partial" && plan.day > 0 && meaningfulProgrammeWork,
          exerciseReviews: ratedReviews,
        }],
        progression,
      };
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      if (sessionMode === "normal" && status !== "partial" && plan.day > 0 && meaningfulProgrammeWork) {
        setSettings((previous) => ({ ...previous, selectedDay: nextProgramDay }));
      }
      try {
        const updated = await saveProfile(nextProfile);
        profileRef.current = updated;
        setProfile(updated);
        setProfiles((items) => items.map((item) => item.profileId === updated.profileId ? updated : item));
        setHistory(historyForProfile(updated));
        setSyncStatus(updated.pendingSync ? "offline" : "saved");
      } catch (error) {
        completionRecordedRef.current = false;
        window.alert(error instanceof Error ? error.message : "The workout could not be saved. Your review is still open; please try again.");
        return false;
      }
    }
    return true;
  }, [activeSessionIdentity, day, profile?.profileId, saveMode]);

  const openSessionReview = useCallback((
    plan: SessionPlan,
    status: PendingReview["status"],
    performedSeconds: number,
  ) => {
    const exerciseIds = reviewableExerciseIdsFromExecution(plan, executionRef.current)
      .filter((exerciseId) => reviewableCategories.has(exercises[exerciseId]?.category));
    setSessionReviews({});
    setPendingReview({ status, performedSeconds: Math.floor(performedSeconds), exerciseIds });
    setRunning(false);
    setComplete(true);
  }, []);

  useEffect(() => {
    if (!complete || !activePlan || pendingReview || completionRecordedRef.current) return;
    openSessionReview(activePlan, activeSessionModified ? "modified" : "complete", trainedSecondsFromClock());
  }, [activePlan, activeSessionModified, complete, openSessionReview, pendingReview, trainedSecondsFromClock]);

  const setDay = (nextDay: DayNumber) => setSettings((previous) => ({ ...previous, selectedDay: nextDay }));

  const saveDefaultLevel = (nextLevel: DifficultyLevel) => {
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
          if (detailed.easierId && (effectiveProgression[detailed.easierId]?.cleanSessions ?? 0) >= 2) score += 6;
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
    if (previewPlan.totalSeconds <= 0 || previewPlan.intervals.length === 0) {
      window.alert("Add at least one exercise before starting this workout.");
      return;
    }
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    setRecoverySnapshot(null);
    setActivePlan(previewPlan);
    setTimerPosition(locateTimerPosition(previewPlan, 0));
    elapsedBaseRef.current = 0;
    trainedSecondsRef.current = 0;
    trainedAnchorRef.current = Date.now();
    executionCursorRef.current = 0;
    executionRef.current = {};
    anchorRef.current = Date.now();
    lastIntervalRef.current = -1;
    completionRecordedRef.current = false;
    setSessionReviews({});
    setActiveSessionIdentity({ ownerId: profile?.profileId ?? "guest", saveMode });
    setPendingReview(null);
    setActiveSessionModified(previewModified || previewPlan.totalSeconds !== basePreviewPlan.totalSeconds);
    setComplete(false);
    setPlayerOpen(true);
    setRunning(true);
    beep(true);
  };

  const startCustomWorkout = () => {
    if (!customPlan || customPlan.items.length === 0) return;
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    setRecoverySnapshot(null);
    const intervals: PlanInterval[] = [];
    customPlan.items.forEach((item, index) => {
      const block = item.block === "skill" ? "handstand" : item.block === "strength" ? "core" : item.block;
      const station = Math.max(1, item.station);
      const slotId = (block === "warmup" ? `warmup-${Math.min(3, station)}`
        : block === "pre" ? `pre-${Math.min(2, station)}`
        : block === "handstand" ? "handstand-1"
        : block === "lab" ? "lab-a"
        : block === "cooldown" ? `cooldown-${Math.min(2, station)}`
        : `core-${Math.min(4, station)}`) as StableSlotId;
      intervals.push({ id: `custom-${index}-work`, kind: "work", duration: item.work, block, slotId, exerciseId: item.exerciseId, label: exercises[item.exerciseId]?.name ?? item.exerciseId, round: item.round, rounds: item.rounds });
      if (item.rest > 0) intervals.push({ id: `custom-${index}-rest`, kind: "rest", duration: item.rest, block, slotId, label: "Rest", round: item.round, rounds: item.rounds });
    });
    const plan: SessionPlan = { schemaVersion: 1, day: 0, level: customDifficulty === "easy" ? "L1" : customDifficulty === "hard" ? "L3" : "L2", includeLab: customPlan.items.some((item) => item.block === "lab"), intervals, totalSeconds: intervals.reduce((sum, interval) => sum + interval.duration, 0) };
    if (plan.totalSeconds <= 0 || plan.intervals.length === 0) {
      window.alert("The selected options did not produce a trainable interval. Add a training block or exercise and generate again.");
      return;
    }
    setActivePlan(plan); setTimerPosition(locateTimerPosition(plan, 0)); elapsedBaseRef.current = 0; trainedSecondsRef.current = 0; trainedAnchorRef.current = Date.now(); executionCursorRef.current = 0; executionRef.current = {}; anchorRef.current = Date.now(); lastIntervalRef.current = -1; completionRecordedRef.current = false; setSessionReviews({}); setActiveSessionIdentity({ ownerId: profile?.profileId ?? "guest", saveMode }); setPendingReview(null); setActiveSessionModified(false); setComplete(false); setCustomOpen(false); setPlayerOpen(true); setRunning(true); beep(true);
  };

  const toggleTimer = () => {
    if (!activePlan) return;
    if (running) {
      const elapsed = elapsedFromClock();
      creditExecutionTo(elapsed);
      commitTrainedTime();
      elapsedBaseRef.current = elapsed;
      setTimerPosition(locateTimerPosition(activePlan, elapsed));
      setRunning(false);
    } else {
      anchorRef.current = Date.now();
      trainedAnchorRef.current = Date.now();
      setRunning(true);
      beep(true);
    }
  };

  const jump = (direction: -1 | 1) => {
    if (!activePlan || !timerPosition) return;
    creditExecutionTo(elapsedFromClock());
    commitTrainedTime();
    const currentIndex = Math.min(timerPosition.intervalIndex, activePlan.intervals.length - 1);
    const nextIndex = Math.max(0, Math.min(activePlan.intervals.length - 1, currentIndex + direction));
    const elapsed = activePlan.intervals.slice(0, nextIndex).reduce((sum, interval) => sum + interval.duration, 0);
    elapsedBaseRef.current = elapsed;
    executionCursorRef.current = elapsed;
    anchorRef.current = Date.now();
    lastIntervalRef.current = nextIndex;
    setTimerPosition(locateTimerPosition(activePlan, elapsed));
    setActiveSessionModified(true);
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
  const announcedSecond = Math.ceil(timerPosition?.remaining ?? 0);
  const playerAnnouncement = current
    ? `${current.kind === "work" ? "Work" : "Rest"}: ${current.label}.${[10, 5, 3, 2, 1].includes(announcedSecond) ? ` ${announcedSecond} seconds remaining.` : ""}`
    : "";

  const endWorkoutEarly = () => {
    if (!activePlan || complete) {
      setRunning(false);
      setPlayerOpen(false);
      setActiveSessionIdentity(null);
      executionRef.current = {};
      executionCursorRef.current = 0;
      trainedSecondsRef.current = 0;
      trainedAnchorRef.current = Date.now();
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    const timerElapsed = Math.max(0, Math.min(activePlan.totalSeconds, elapsedFromClock()));
    creditExecutionTo(timerElapsed);
    const performedSeconds = Math.max(0, Math.floor(commitTrainedTime()));
    if (performedSeconds < 1 || performedExerciseIdsFromExecution(activePlan, executionRef.current).length === 0) {
      if (!window.confirm("End this workout before recording any exercise?")) return;
      setRunning(false);
      setPlayerOpen(false);
      setActiveSessionIdentity(null);
      executionRef.current = {};
      executionCursorRef.current = 0;
      trainedSecondsRef.current = 0;
      trainedAnchorRef.current = Date.now();
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    if (!window.confirm("End this workout now? You can quickly review only the exercises completed so far. The partial session will not advance the five-day programme.")) return;
    openSessionReview(activePlan, "partial", performedSeconds);
  };
  endWorkoutEarlyRef.current = endWorkoutEarly;

  const resumeRecoveredWorkout = (reviewNow = false) => {
    if (!recoverySnapshot) return;
    const recoveryGap = Math.max(0, (Date.now() - recoverySnapshot.savedAt) / 1000);
    const elapsed = Math.max(0, Math.min(
      recoverySnapshot.plan.totalSeconds,
      recoverySnapshot.elapsed + (recoverySnapshot.running && recoveryGap <= 2 * 60 * 60 ? recoveryGap : 0),
    ));
    const recoveredModified = recoverySnapshot.modified || elapsed > recoverySnapshot.elapsed + 1;
    setSaveMode(recoverySnapshot.saveMode);
    setActiveSessionIdentity({ ownerId: recoverySnapshot.ownerId, saveMode: recoverySnapshot.saveMode });
    setActivePlan(recoverySnapshot.plan);
    setActiveSessionModified(recoveredModified);
    setSessionReviews(recoverySnapshot.reviews ?? {});
    // A reload gap can advance the visible timer, but it is not proof that the
    // athlete performed those intervals. Keep only evidence saved before exit.
    executionRef.current = { ...(recoverySnapshot.execution ?? {}) };
    executionCursorRef.current = elapsed;
    elapsedBaseRef.current = elapsed;
    trainedSecondsRef.current = Math.max(0, recoverySnapshot.trainedSeconds);
    trainedAnchorRef.current = Date.now();
    anchorRef.current = Date.now();
    lastIntervalRef.current = -1;
    completionRecordedRef.current = false;
    setTimerPosition(locateTimerPosition(recoverySnapshot.plan, elapsed));
    setPlayerOpen(true);
    setRecoverySnapshot(null);
    if (recoverySnapshot.pendingReview) {
      setPendingReview(recoverySnapshot.pendingReview);
      setComplete(true);
      setRunning(false);
    } else if (reviewNow || elapsed >= recoverySnapshot.plan.totalSeconds) {
      openSessionReview(
        recoverySnapshot.plan,
        elapsed >= recoverySnapshot.plan.totalSeconds ? (recoveredModified ? "modified" : "complete") : "partial",
        recoverySnapshot.trainedSeconds,
      );
    } else {
      setPendingReview(null);
      setComplete(false);
      setRunning(true);
    }
  };

  const discardRecoveredWorkout = () => {
    if (!window.confirm("Discard this interrupted workout without saving it?")) return;
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    setRecoverySnapshot(null);
    setActiveSessionIdentity(null);
    executionRef.current = {};
    executionCursorRef.current = 0;
    trainedSecondsRef.current = 0;
    trainedAnchorRef.current = Date.now();
  };

  useEffect(() => {
    if (!playerOpen) return;
    const panel = playerRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = Array.from(panel.parentElement?.children ?? []).filter((item) => item !== panel) as HTMLElement[];
    const siblingState = siblings.map((item) => ({
      item,
      inert: item.hasAttribute("inert"),
      ariaHidden: item.getAttribute("aria-hidden"),
    }));
    siblings.forEach((item) => { item.setAttribute("inert", ""); item.setAttribute("aria-hidden", "true"); });
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((item) => item.offsetParent !== null);
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); endWorkoutEarlyRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items.at(-1) as HTMLElement;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      siblingState.forEach(({ item, inert, ariaHidden }) => {
        if (!inert) item.removeAttribute("inert");
        if (ariaHidden === null) item.removeAttribute("aria-hidden");
        else item.setAttribute("aria-hidden", ariaHidden);
      });
      previousFocus?.focus();
    };
  }, [playerOpen]);

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
        <div><span className="eyebrow"><span /> TRAINING MODE</span><strong>{profile ? `${hasProfileSession(profile.profileId) ? "Synced" : "On this device"} as ${profile.username}` : "Guest session — nothing permanent is saved"}</strong></div>
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
                <button type="button" className={`level-option ${level === item ? "active" : ""}`} aria-pressed={level === item} key={item} onClick={() => setTodayLevel(item)}>
                  <span>{item}</span><strong>{levelLabels[item].name}</strong><small>{levelLabels[item].description}</small>
                </button>
              ))}
            </div>
            <div className="comfort-level-note"><span>{level === preferredLevel ? `${level} is your saved Day ${day.day} default.` : `${level} applies to this session only.`}</span>{level !== preferredLevel && <button type="button" onClick={() => saveDefaultLevel(level)}>Save {level} as Day {day.day} default</button>}</div>
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
                          equipmentAdjusted={equipmentSwaps[slot.id] !== progressionSwaps[slot.id]}
                          progressionAdjusted={!activeSwaps[slot.id] && progressionSwaps[slot.id] !== undefined}
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
        {recoverySnapshot && !playerOpen && !profileOpen && recoverySnapshot.ownerId === (profile?.profileId ?? "guest") && (
          <Drawer title="Workout interrupted" subtitle="Your timer was safely preserved on this device." onClose={discardRecoveredWorkout}>
            <div className="recovery-panel">
              <Clock3 />
              <div><strong>{recoverySnapshot.plan.day === 0 ? "Custom Session" : `Day ${recoverySnapshot.plan.day}`} • {recoverySnapshot.plan.level}</strong><span>{formatTime(Math.min(recoverySnapshot.plan.totalSeconds, recoverySnapshot.elapsed))} of {formatTime(recoverySnapshot.plan.totalSeconds)} recorded</span></div>
            </div>
            <div className="drawer-actions recovery-actions">
              <button type="button" className="primary-button" onClick={() => resumeRecoveredWorkout(false)}><Play fill="currentColor" /> Resume workout</button>
              <button type="button" className="secondary-button" onClick={() => resumeRecoveredWorkout(true)}><Check /> End & review completed work</button>
              <button type="button" className="text-button danger-text" onClick={discardRecoveredWorkout}>Discard workout</button>
            </div>
          </Drawer>
        )}
        {recoverySnapshot && !playerOpen && !profileOpen && recoverySnapshot.ownerId !== (profile?.profileId ?? "guest") && (
          <Drawer title="Workout belongs to another profile" subtitle="The saved timer stays attached to the athlete who started it." onClose={discardRecoveredWorkout}>
            <div className="recovery-panel">
              <LockKeyhole />
              <div><strong>{profiles.find((item) => item.profileId === recoverySnapshot.ownerId)?.username ?? "Another local profile"}</strong><span>Switch or sign in to that profile to resume. You can also discard this device-only timer.</span></div>
            </div>
            <div className="drawer-actions recovery-actions">
              <button type="button" className="primary-button" onClick={() => setProfileOpen(true)}>Switch or sign in</button>
              <button type="button" className="text-button danger-text" onClick={discardRecoveredWorkout}>Discard saved timer</button>
            </div>
          </Drawer>
        )}
        {swapSlotId && (() => {
          const slot = slots.find((item) => item.id === swapSlotId);
          if (!slot) return null;
          const currentId = equipmentSwaps[slot.id] ?? slot.defaultExerciseId;
          const options = compatibleSwaps({ slot, exercises, day: day.day, level, readiness: ready, difficulty: swapFilter, includeLocked: true, equipment: todayEquipment });
          return (
            <Drawer title="Swap exercise" subtitle="Training block, day, equipment and difficulty stay compatible. Choose the recommended level or inspect one adjacent level." onClose={() => setSwapSlotId(null)}>
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
          <Drawer title="Skills & readiness" subtitle="See achieved skills, follow your next steps, or set a more accurate starting point." onClose={() => setReadinessOpen(false)}>
            <div className="assessment-entry-card">
              <div><Sparkles /><span><strong>{assessmentDraft.status === "completed" ? "Starting point applied" : assessmentDraft.status === "in-progress" || assessmentDraft.status === "review" ? "Assessment saved" : "Already have training experience?"}</strong><small>{assessmentDraft.status === "completed" ? "Your provisional placements guide recommendations until tracked workouts verify them." : assessmentDraft.status === "in-progress" || assessmentDraft.status === "review" ? "Continue exactly where you stopped." : "Use a short adaptive assessment instead of beginning every path at Foundation."}</small></span></div>
              <button type="button" onClick={() => startStartingAssessment(assessmentDraft.status === "completed")}>
                {assessmentDraft.status === "completed" ? "Reassess my starting point" : assessmentDraft.status === "in-progress" || assessmentDraft.status === "review" ? "Resume assessment" : "Set my starting level"}
              </button>
              {!profile && <small>Sign in or create an account first so your placement can sync across devices.</small>}
            </div>
            <div className="readiness-list">
              {(Object.values(readiness) as typeof readiness[ReadinessGateId][]).filter((item) => item.id !== "G0_LOAD").map((item) => {
                const checked = settings.readiness[item.id] === true;
                const effective = ready[item.id] === true;
                return (
                  <button
                    type="button"
                    className={`readiness-check ${checked ? "checked" : ""}`}
                    key={item.id}
                    aria-pressed={checked}
                    onClick={() => {
                      const needsSafetyConfirmation = ["G2_INVERSION", "G3_ENTRY", "G4_FREE_BAR", "G6_PLANCHE", "G7_PIKE_PUSH"].includes(item.id);
                      if (!checked && needsSafetyConfirmation && !window.confirm(
                        `Confirm ${item.label}\n\nOnly mark this ready if you can demonstrate every standard safely and with clean form:\n\n• ${item.standards.join("\n• ")}\n\nYou can turn it off at any time.`,
                      )) return;
                      setSettings((previous) => ({ ...previous, readiness: { ...previous.readiness, [item.id]: !checked } }));
                    }}
                  >
                    <i>{checked && <Check />}</i><span><strong>{item.label}{checked && !effective ? " • prerequisites still needed" : ""}</strong>{item.standards.join(" • ")}</span>
                  </button>
                );
              })}
            </div>
            <div className="skill-paths">
              <h3>Progression paths</h3>
              {skillProgressionPaths.map((path) => {
                const visible = path.steps.filter((id) => Boolean(exercises[id]));
                const state = progressionPathState(visible, profile?.progression ?? {});
                const provisionalIndex = visibleProvisionalIndex(path, assessmentDraft.appliedPlacements[path.label], profile?.progression ?? {});
                const recommendedIndex = provisionalIndex >= 0 ? provisionalIndex : state.recommendedIndex;
                return <article key={path.label}><strong>{path.label}</strong>{visible.map((id, index) => {
                  const achieved = index <= state.masteredThrough;
                  const provisionallyPassed = provisionalIndex >= 0 && index < provisionalIndex && !achieved;
                  return <div className={achieved ? "done" : provisionallyPassed ? "provisional" : index === recommendedIndex ? "current" : ""} key={id}><i>{achieved ? <Check /> : provisionallyPassed ? <Sparkles /> : index + 1}</i><span>{exercises[id].name}</span>{state.complete && index === visible.length - 1 ? <small>MASTERED</small> : index === recommendedIndex && <small>{provisionalIndex >= 0 ? "PROVISIONAL START" : state.activeHard ? "BUILD CONFIDENCE" : state.masteredThrough >= 0 ? "READY TO TRY" : "CURRENT"}</small>}</div>;
                })}<button type="button" className="path-challenge" onClick={() => openChallenge(path.customFocus as CustomFocus)}>Try the next appropriate step</button></article>;
              })}
            </div>
            <div className="challenge-panel"><strong>Challenge me</strong><span>Choose a safe next challenge without skipping readiness gates.</span><div><button type="button" onClick={() => openChallenge()}>Whole workout</button>{(["handstand", "core", "lsit", "planche", "pushing"] as CustomFocus[]).map((focus) => <button type="button" key={focus} onClick={() => openChallenge(focus)}>{focus === "lsit" ? "L-Sit" : focus[0].toUpperCase() + focus.slice(1)}</button>)}</div></div>
            <p className="install-note"><ShieldCheck /> A locked drill is automatically replaced by its declared safe regression. Readiness never changes your whole-day level automatically.</p>
          </Drawer>
        )}

        {assessmentOpen && profile && (
          <Drawer
            title={assessmentDraft.status === "review" || assessmentDraft.status === "completed" ? "Your starting points" : "Set my starting level"}
            subtitle="Adaptive, optional and resumable. Answers guide recommendations but never award achievements or bypass readiness standards."
            onClose={() => setAssessmentOpen(false)}
          >
            <div className="starting-assessment">
              <div className="assessment-progress-copy">
                <span>{currentAssessmentProgress.completedTracks} of {currentAssessmentProgress.totalTracks} skill families placed</span>
                <strong>{Math.round((currentAssessmentProgress.completedTracks / currentAssessmentProgress.totalTracks) * 100)}%</strong>
              </div>
              <div className="assessment-progress-track"><i style={{ width: `${(currentAssessmentProgress.completedTracks / currentAssessmentProgress.totalTracks) * 100}%` }} /></div>
              <div className="assessment-section-strip">
                {assessmentSections.map((section) => {
                  const tracks = assessmentTracks.filter((track) => track.section === section);
                  const completed = tracks.filter((track) => assessmentDraft.placements[track.pathLabel]).length;
                  const active = currentAssessmentQuestion?.track.section === section;
                  return <div className={`${active ? "active" : ""} ${completed === tracks.length ? "complete" : ""}`} key={section}><i>{completed === tracks.length ? <Check /> : `${completed}/${tracks.length}`}</i><span>{section}</span></div>;
                })}
              </div>

              {currentAssessmentQuestion && assessmentDraft.status !== "review" && assessmentDraft.status !== "completed" ? (() => {
                const exercise = exercises[currentAssessmentQuestion.exerciseId];
                return <article className="assessment-question">
                  <p className="control-kicker">{currentAssessmentQuestion.track.section} • {currentAssessmentQuestion.track.label}</p>
                  <div className="assessment-demo"><ExerciseDemo exercise={exercise} /></div>
                  <h3>{exercise.name}</h3>
                  <p className="assessment-target"><strong>Target:</strong> {exercise.target}</p>
                  <ul><li>{exercise.cues[0]}</li><li>{exercise.cues[1]}</li></ul>
                  <p className="assessment-honesty">Choose “Yes” only if you can meet the full target now with the form shown—not because you have tried it before.</p>
                  <p className="assessment-safety"><ShieldCheck /> Assess fresh after a short dynamic warm-up, with a clear mat and wall area. Stop for pain, instability or any uncontrolled exit.</p>
                  <div className="assessment-answers">
                    <button type="button" disabled={assessmentBusy} onClick={() => recordAssessmentAnswer("clean")}><Check /><span><strong>Yes — clean at target</strong><small>Check the next harder anchor.</small></span></button>
                    <button type="button" disabled={assessmentBusy} onClick={() => recordAssessmentAnswer("almost")}><Gauge /><span><strong>Almost — inconsistent</strong><small>Start at this exercise.</small></span></button>
                    <button type="button" disabled={assessmentBusy} onClick={() => recordAssessmentAnswer("not-yet")}><ArrowLeft /><span><strong>Not yet / not sure</strong><small>Use a safer starting point.</small></span></button>
                  </div>
                  {currentAssessmentQuestion.track.section === "Handstand" && <p className="assessment-safety"><ShieldCheck /> Handstand answers never unlock readiness gates. Support, wall control and safe exits must still be demonstrated separately.</p>}
                </article>;
              })() : (
                <div className="assessment-results">
                  <div className="assessment-result-intro"><Sparkles /><div><strong>Proposed provisional placements</strong><span>These choose where recommendations begin. No exercise receives an achieved checkmark until verified in tracked workouts.</span></div></div>
                  <p className="assessment-level-suggestion"><Gauge /><span><strong>Suggested default: {assessmentSuggestedLevel} • {levelLabels[assessmentSuggestedLevel].name}</strong>Your five workout-day defaults will start here. You can still choose an easier or harder level for any session, and readiness gates remain authoritative.</span></p>
                  {assessmentSections.map((section) => <section key={section}><h3>{section}</h3>{assessmentTracks.filter((track) => track.section === section).map((track) => {
                    const placementId = assessmentDraft.placements[track.pathLabel];
                    return <div key={track.id}><span>{track.label}</span><strong>{placementId ? exercises[placementId]?.name : "Foundation"}</strong><button type="button" disabled={assessmentBusy} onClick={() => editAssessmentTrack(track.id)}>Change</button></div>;
                  })}</section>)}
                  {assessmentDraft.status === "review" && <button type="button" className="primary-button assessment-apply" disabled={assessmentBusy} onClick={applyStartingAssessment}><Check /> Apply starting points & {assessmentSuggestedLevel}</button>}
                  {assessmentDraft.status === "completed" && <p className="assessment-applied"><Check /> Applied. Recommended normal and custom workouts can now meet you closer to your current ability.</p>}
                </div>
              )}
              <div className="assessment-footer-actions">
                <button type="button" disabled={assessmentBusy || assessmentDraft.answerOrder.length === 0} onClick={undoAssessmentAnswer}>Back one answer</button>
                <button type="button" onClick={() => setAssessmentOpen(false)}>Save & continue later</button>
                <button type="button" disabled={assessmentBusy} onClick={restartAssessmentFromScratch}>Start assessment again</button>
              </div>
            </div>
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
          <Drawer
            title="Who's training?"
            subtitle="Only accounts used on this device appear here. Sign in to use your profile elsewhere."
            onClose={() => { clearAccountForm(); setNewProfileName(""); setProfileOpen(false); }}
          >
            <div className="profile-list">
              {profiles.map((item) => {
                const locked = isSecuredProfile(item) && !hasProfileSession(item.profileId);
                return <button type="button" className={profile?.profileId === item.profileId ? "selected" : ""} aria-label={`${item.username}, ${locked ? "locked, sign in required" : hasProfileSession(item.profileId) ? "signed in" : "local profile"}`} key={item.profileId} onClick={() => selectExistingProfile(item)}><span className="profile-dot">{item.username.slice(0, 1).toUpperCase()}</span><strong>{item.username}<small>{hasProfileSession(item.profileId) ? "Signed in" : locked ? "Locked • sign in" : "Local profile"}</small></strong>{locked ? <LockKeyhole /> : profile?.profileId === item.profileId && <Check />}</button>;
              })}
            </div>
            {remoteSyncAvailable && profile && !isSecuredProfile(profile) && !hasProfileSession(profile.profileId) && <div className="account-security-card">
              <LockKeyhole /><div><strong>Secure {profile.username}</strong><span>Choose a password once to protect this existing profile and sync it across your devices.</span></div>
              <label>Password<input type="password" value={accountPassword} minLength={10} maxLength={128} autoComplete="new-password" onChange={(event) => setAccountPassword(event.target.value)} /></label>
              <label>Confirm password<input type="password" value={accountPasswordConfirm} minLength={10} maxLength={128} autoComplete="new-password" onChange={(event) => setAccountPasswordConfirm(event.target.value)} /></label>
              <button type="button" disabled={accountBusy || accountPassword.length < 10 || accountPassword !== accountPasswordConfirm} onClick={() => void secureCurrentProfile()}><ShieldCheck /> Secure this profile</button>
            </div>}
            {remoteSyncAvailable && <div className="account-form">
              <div className="account-tabs">{(["signin", "create", "recover"] as const).map((mode) => <button type="button" className={accountMode === mode ? "active" : ""} key={mode} onClick={() => { setAccountMode(mode); clearAccountForm(); }}>{mode === "signin" ? "Sign in" : mode === "create" ? "Create account" : "Recover"}</button>)}</div>
              <label htmlFor="account-name">Username<input id="account-name" value={newProfileName} maxLength={32} autoComplete="username" placeholder="e.g. Kyriakos" onChange={(event) => setNewProfileName(event.target.value)} /></label>
              {accountMode === "recover" && <label>Recovery code<input type="text" value={accountRecoveryInput} autoCapitalize="characters" autoComplete="off" onChange={(event) => setAccountRecoveryInput(event.target.value)} /></label>}
              <label>{accountMode === "recover" ? "New password" : "Password"}<input type="password" value={accountPassword} minLength={10} maxLength={128} autoComplete={accountMode === "signin" ? "current-password" : "new-password"} onChange={(event) => setAccountPassword(event.target.value)} /></label>
              {accountMode !== "signin" && <label>Confirm password<input type="password" value={accountPasswordConfirm} minLength={10} maxLength={128} autoComplete="new-password" onChange={(event) => setAccountPasswordConfirm(event.target.value)} /></label>}
              <button type="button" disabled={accountBusy || !newProfileName.trim() || accountPassword.length < 10 || (accountMode !== "signin" && accountPassword !== accountPasswordConfirm) || (accountMode === "recover" && !accountRecoveryInput.trim())} onClick={() => void (accountMode === "signin" ? signInAccount() : accountMode === "create" ? createAccount() : recoverProfileAccount())}>{accountBusy ? "Please wait…" : accountMode === "signin" ? "Sign in securely" : accountMode === "create" ? "Create secure account" : "Reset password"}</button>
              <small>No email is required. Usernames are unique, passwords stay private, and only this device remembers your signed-in accounts.</small>
            </div>}
            {accountError && <p className="account-message account-error" role="alert">{accountError}</p>}
            {accountRecoveryCode && <div className="recovery-code" id="recovery-code"><ShieldCheck /><div><strong>Save your new recovery code</strong><span>This is shown once. Store it somewhere private; it can reset your password without email.</span><code>{accountRecoveryCode}</code></div><button type="button" onClick={() => void navigator.clipboard?.writeText(accountRecoveryCode)}>Copy</button><button type="button" onClick={() => setAccountRecoveryCode("")}>I saved it</button></div>}
            {profile && assessmentDraft.status !== "completed" && assessmentDraft.status !== "dismissed" && <div className="assessment-onboarding-card">
              <Sparkles /><div><strong>{assessmentDraft.status === "in-progress" || assessmentDraft.status === "review" ? "Continue your starting-level assessment" : "Already have training experience?"}</strong><span>{assessmentDraft.status === "in-progress" || assessmentDraft.status === "review" ? "Your answers are saved. Resume from the next exercise." : "Set a provisional starting point so recommendations do not make you repeat weeks of work you already own."}</span></div>
              <button type="button" onClick={() => startStartingAssessment()}>{assessmentDraft.status === "in-progress" || assessmentDraft.status === "review" ? "Resume assessment" : "Set my starting level"}</button>
              {assessmentDraft.status === "offered" && <button type="button" className="assessment-skip" onClick={dismissStartingAssessment}>Skip for now</button>}
            </div>}
            <div className="drawer-actions"><button type="button" className="secondary-button" onClick={openGuest}>Guest session · don't save</button></div>
            {profile && <div className="profile-data-panel">
              <p className="control-kicker">Profile</p><strong>{profile.username}</strong><button type="button" onClick={() => void renameProfile()}>Rename profile</button>{hasProfileSession(profile.profileId) && <button type="button" onClick={() => void signOutCurrentProfile()}>Sign out on this device</button>}
              <p className="control-kicker">Default equipment</p><div className="custom-chip-grid equipment-chips">{(["parallettes", "floor", "wall", "rope"] as const).map((item) => <button type="button" className={profile.equipment.includes(item) ? "active" : ""} key={item} onClick={() => void toggleDefaultEquipment(item)}>{item === "floor" ? "Mat / Floor" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
              <p className="control-kicker">Session saving</p><div className="custom-chip-grid"><button type="button" className={saveMode === "normal" ? "active" : ""} onClick={() => setSaveMode("normal")}>Normal</button><button type="button" className={saveMode === "practice" ? "active" : ""} onClick={() => setSaveMode("practice")}>Practice only</button><button type="button" className={saveMode === "guest" ? "active" : ""} onClick={() => setSaveMode("guest")}>Don't save</button></div>
              <p className="control-kicker">Sync</p><div className="sync-line"><i className={`sync-${syncStatus}`} /><span>{syncStatus === "syncing" ? "Syncing…" : syncStatus === "error" ? "Sync error — retry" : profile.pendingSync ? "Sync needed" : remoteSyncAvailable && hasProfileSession(profile.profileId) ? "Saved securely" : "Saved on this device"}</span></div>{profile.lastSyncedAt && <small>Last synced {new Date(profile.lastSyncedAt).toLocaleString()}</small>}<button type="button" onClick={() => void syncCurrentProfile()}>Sync now</button>
              <p className="control-kicker">Data</p><div className="profile-data-actions"><button type="button" onClick={() => downloadText(`parallette25-${profile.username}.json`, exportProfile(profile))}>Export backup</button><label>Import backup<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProfileFile(file); event.currentTarget.value = ""; }} /></label><button type="button" className="danger" onClick={() => void resetCurrentProfile()}>Reset progress</button><button type="button" className="danger" onClick={() => void removeCurrentProfile()}>Delete profile</button></div>
            </div>}
            <div className="app-version"><span>Parallette 25+ version</span><strong>v{APP_VERSION}</strong></div>
          </Drawer>
        )}

        {customOpen && (
          <Drawer title="Build a custom session" subtitle="The generator builds your main work first, then matches dynamic warm-up and static cooldown exercises to its actual demands." onClose={() => setCustomOpen(false)}>
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
              {customPlan && <div className="custom-preview">
                <strong>{customPlan.title} · {formatTime(customPlan.seconds)}</strong>
                <div className="custom-plan-summary">{customPlan.summary.map((item) => <span key={item.block}><b>{item.block === "skill" ? "Skill" : item.block === "strength" ? "Strength / Core" : item.block === "pre" ? "Prepare" : item.block === "lab" ? "Lab" : item.block[0].toUpperCase() + item.block.slice(1)}</b>{item.uniqueExercises} exercise{item.uniqueExercises === 1 ? "" : "s"} · {item.rounds} round{item.rounds === 1 ? "" : "s"}</span>)}</div>
                {customPlan.warnings.map((warning) => <span className="custom-warning" key={warning}>{warning}</span>)}
                {customPlan.items.map((item, index) => <div key={`${item.exerciseId}-${item.block}-${index}`}>
                  <span>{item.block === "skill" ? "Skill practice" : item.block === "strength" ? "Strength / Core" : blockLabels[item.block]} · Round {item.round}/{item.rounds}{item.stations > 1 ? ` · Station ${item.station}/${item.stations}` : ""}</span>
                  <strong>{exercises[item.exerciseId]?.name}</strong>
                  <small>{item.work}s work · {item.rest}s rest{item.intentionalRepeat ? ` · repeat ${item.occurrence}/${item.occurrences}` : " · one appearance"}</small>
                </div>)}
              </div>}
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
          <motion.section ref={playerRef} className={`player player-${current?.kind ?? "work"}`} role="dialog" aria-modal="true" aria-labelledby={playerTitleId} tabIndex={-1} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!complete && current ? (
              <>
                <div className="player-topbar">
                  <button type="button" className="icon-button player-close" onClick={endWorkoutEarly} aria-label="End workout"><X /></button>
                  <div><span>{activePlan.day === 0 ? "CUSTOM SESSION" : `DAY ${activePlan.day}`} • {activePlan.level} • {displayBlockLabel(current.block, activePlan.day === 0)}</span><div className="player-progress"><i style={{ width: `${progress}%` }} /></div></div>
                  <button type="button" className="icon-button" onClick={() => setSettings((previous) => ({ ...previous, soundOn: !previous.soundOn }))} aria-label={settings.soundOn ? "Turn timer sound off" : "Turn timer sound on"}>{settings.soundOn ? <Volume2 /> : <VolumeX />}</button>
                </div>
                <div className="player-layout">
                  <div className="player-demo">
                    {current.kind === "work" && currentExercise ? <ExerciseDemo exercise={currentExercise} /> : nextExercise ? <><ExerciseDemo exercise={nextExercise} dimmed /><span className="up-next-label">UP NEXT • {nextExercise.name}</span></> : <div className="reset-visual"><RefreshCw /><span>Breathe slowly</span></div>}
                  </div>
                  <div className="player-info">
                    <span className={`phase-pill phase-${current.kind}`}>{current.kind === "work" ? "WORK" : current.label.toUpperCase()}</span>
                    <p className="round-label">Round {current.round} of {current.rounds}</p>
                    <h1 id={playerTitleId}>{current.kind === "work" ? current.label : "Recover completely"}</h1>
                    {currentExercise && current.kind === "work" && <p className="player-target">Target: {currentExercise.target}. Once it is clean, rest for the remaining time.</p>}
                    <div className="countdown" aria-hidden="true">{formatTime(timerPosition.remaining)}</div>
                    <span className="sr-only" aria-live="polite" aria-atomic="true">{playerAnnouncement}</span>
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
                <div className="complete-check"><Check /></div><p>{activePlan.day === 0 ? "CUSTOM SESSION" : `DAY ${activePlan.day}`} • {activePlan.level} {pendingReview?.status === "partial" ? "ENDED EARLY" : "COMPLETE"}</p>
                <h1 id={playerTitleId}>{formatTime(pendingReview?.performedSeconds ?? activePlan.totalSeconds)}.<br /><em>{pendingReview?.status === "partial" ? "Work completed." : "Quality earned."}</em></h1>
                {pendingReview && <>
                  <span className="review-intro">Quick review — tap only exercises you want to rate. Unrated exercises leave your progression unchanged. Warm-up and cooldown never need a rating.</span>
                  <div className="post-workout-review">
                    {pendingReview.exerciseIds.map((exerciseId) => {
                      const exercise = exercises[exerciseId];
                      const review = sessionReviews[exerciseId];
                      const cleanCount = profile?.progression[exerciseId]?.cleanSessions ?? 0;
                      const nextExercise = exercise?.harderId ? exercises[exercise.harderId] : undefined;
                      return <article key={exerciseId}>
                        {exercise && <div className="review-demo"><ExerciseDemo exercise={exercise} compact /></div>}
                        <div className="review-exercise-info"><strong>{exercise?.name ?? exerciseId}</strong><small>{cleanCount}/2 clean sessions{nextExercise ? ` • Next: ${nextExercise.name}` : ""}</small></div>
                        <div className="review-rating" aria-label={`Difficulty for ${exercise?.name ?? exerciseId}`}>
                          {(["easy", "right", "hard"] as const).map((value) => <button type="button" aria-pressed={review?.feedback === value} className={review?.feedback === value ? "active" : ""} key={value} onClick={() => setSessionReviews((previous) => ({ ...previous, [exerciseId]: { feedback: value, achieved: value === "easy" } }))}>{value === "easy" ? "Ready to progress" : value === "right" ? "Right level" : "Too hard"}</button>)}
                        </div>
                      </article>;
                    })}
                  </div>
                  {pendingReview.exerciseIds.length === 0 && <span>No progression exercise was reached yet, so there is nothing to rate.</span>}
                  {pendingReview.exerciseIds.length > 0 && <span>{Object.values(sessionReviews).filter(Boolean).length} of {pendingReview.exerciseIds.length} rated • unrated cards are safely ignored.</span>}
                  <span>{(activeSessionIdentity?.saveMode ?? saveMode) === "guest" ? "Guest mode: this review will not be saved." : (activeSessionIdentity?.saveMode ?? saveMode) === "practice" ? "Practice mode saves history, but does not change progression or advance the programme." : pendingReview.status === "partial" ? "This partial session saves your work but does not advance the programme day." : "Two clean sessions unlock the recommendation for the next progression."}</span>
                  <button type="button" className="primary-button" disabled={reviewSaving} onClick={async () => {
                    if (reviewSaving) return;
                    setReviewSaving(true);
                    try {
                      const saved = await recordSessionOutcome(activePlan, pendingReview.status, pendingReview.performedSeconds, pendingReview.exerciseIds, sessionReviews);
                      if (!saved) return;
                      localStorage.removeItem(ACTIVE_SESSION_KEY);
                      setPendingReview(null); setPlayerOpen(false); setComplete(false); setActivePlan(null); setActiveSessionIdentity(null); executionRef.current = {}; executionCursorRef.current = 0; trainedSecondsRef.current = 0;
                    } finally {
                      setReviewSaving(false);
                    }
                  }}><Check /> {reviewSaving ? "Saving safely…" : "Save review & finish"}</button>
                </>}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
