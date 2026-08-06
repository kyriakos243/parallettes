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
  Info,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shuffle,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionGuide } from "./MotionGuide";
import {
  categoryClass,
  exercises,
  universalWarmup,
  workouts,
  type Exercise,
  type WorkoutDay,
} from "./workouts";

type SectionKey = "warmup" | "pre" | "core" | "skill" | "reset";
type Timing = { work: number; rest: number };
type TimingMap = Record<string, Timing>;
type SwapMap = Record<number, Record<string, string>>;
type PlanInterval = {
  id: string;
  kind: "work" | "rest";
  duration: number;
  section: SectionKey;
  sectionLabel: string;
  slotId: string;
  exerciseId?: string;
  label: string;
  round: number;
  rounds: number;
};

const sectionDefaults: Record<SectionKey, Timing> = {
  warmup: { work: 45, rest: 15 },
  pre: { work: 40, rest: 20 },
  core: { work: 40, rest: 20 },
  skill: { work: 30, rest: 30 },
  reset: { work: 30, rest: 0 },
};

const sectionLabels: Record<SectionKey, string> = {
  warmup: "Universal warm-up",
  pre: "Pre-handstand preparation",
  core: "Abs & core circuit",
  skill: "Handstand skill",
  reset: "Cooldown reset",
};

const sectionMeta: Record<SectionKey, string> = {
  warmup: "Dynamic • 1 round • 45s work / 15s transition",
  pre: "2 rounds • 40s work / 20s rest",
  core: "3 rounds • 40s work / 20s rest",
  skill: "5 rounds • 30s practice / 30s complete rest",
  reset: "Choose from 8 recovery options • 30s each",
};

const timeline = [
  ["0:00", "3:00", "Warm-up", "warmup"],
  ["3:00", "7:00", "Prepare", "pre"],
  ["7:00", "19:00", "Core", "core"],
  ["19:00", "24:00", "Skill", "skill"],
  ["24:00", "25:00", "Reset", "reset"],
] as const;

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

const getTiming = (slotId: string, section: SectionKey, timings: TimingMap) =>
  timings[slotId] ?? sectionDefaults[section];

function buildPlan(
  day: WorkoutDay,
  timings: TimingMap,
  swaps: Record<string, string>,
): PlanInterval[] {
  const plan: PlanInterval[] = [];
  const addSection = (
    section: SectionKey,
    slots: string[],
    rounds: number,
  ) => {
    for (let round = 1; round <= rounds; round += 1) {
      slots.forEach((slotId, position) => {
        const exerciseId = swaps[slotId] ?? slotId;
        const exercise = exercises[exerciseId];
        const timing = getTiming(slotId, section, timings);
        plan.push({
          id: `${section}-${round}-${position}-work`,
          kind: "work",
          duration: timing.work,
          section,
          sectionLabel: sectionLabels[section],
          slotId,
          exerciseId,
          label: exercise.name,
          round,
          rounds,
        });
        if (timing.rest > 0) {
          plan.push({
            id: `${section}-${round}-${position}-rest`,
            kind: "rest",
            duration: timing.rest,
            section,
            sectionLabel: sectionLabels[section],
            slotId,
            label: section === "warmup" ? "Transition" : "Rest",
            round,
            rounds,
          });
        }
      });
    }
  };

  addSection("warmup", universalWarmup, 1);
  addSection("pre", day.pre, 2);
  addSection("core", day.core, 3);
  addSection("skill", [day.skill], 5);
  day.cooldown.forEach((baseExerciseId, index) => {
    const slotId = `reset-${index}`;
    const exerciseId = swaps[slotId] ?? baseExerciseId;
    const exercise = exercises[exerciseId];
    plan.push({
      id: `${slotId}-work`,
      kind: "work",
      duration: getTiming(slotId, "reset", timings).work,
      section: "reset",
      sectionLabel: sectionLabels.reset,
      slotId,
      exerciseId,
      label: exercise.name,
      round: index + 1,
      rounds: 2,
    });
  });
  return plan;
}

const keyframeSource = (image: string, frame: "start" | "finish") =>
  image.replace(/exercises\/(.+)\.gif$/, `keyframes/$1_${frame}.webp`);

function ExerciseDemo({
  exercise,
  compact = false,
  dimmed = false,
}: {
  exercise: Exercise;
  compact?: boolean;
  dimmed?: boolean;
}) {
  if (exercise.video) {
    return (
      <div className={`exercise-demo exercise-demo-video ${dimmed ? "demo-dimmed" : ""}`}>
        <video autoPlay loop muted playsInline preload="metadata" aria-label={`${exercise.name} smooth demonstration`}>
          <source src={exercise.video} type="video/mp4" />
        </video>
        {!compact && <span className="loop-pill"><RefreshCw /> smooth motion</span>}
      </div>
    );
  }

  if (exercise.motion) {
    return (
      <div className={`exercise-demo exercise-demo-motion ${dimmed ? "demo-dimmed" : ""}`}>
        <MotionGuide preset={exercise.motion} compact={compact} />
      </div>
    );
  }

  if (!exercise.image) return null;
  const start = keyframeSource(exercise.image, "start");
  const finish = keyframeSource(exercise.image, "finish");

  if (exercise.hold) {
    return (
      <div className={`exercise-demo exercise-demo-hold ${dimmed ? "demo-dimmed" : ""}`}>
        <img src={start} alt={`${exercise.name} hold position`} />
      </div>
    );
  }

  return (
    <div className={`exercise-demo keyframe-demo ${compact ? "keyframe-demo-compact" : ""} ${dimmed ? "demo-dimmed" : ""}`}>
      <figure><img src={start} alt={`${exercise.name} start position`} /></figure>
      <figure><img src={finish} alt={`${exercise.name} finish position`} /></figure>
    </div>
  );
}

function SectionIcon({ section }: { section: SectionKey }) {
  if (section === "core") return <Dumbbell aria-hidden="true" />;
  if (section === "skill" || section === "pre") return <Sparkles aria-hidden="true" />;
  if (section === "reset") return <RefreshCw aria-hidden="true" />;
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
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper-row">
      <div>
        <span>{label}</span>
        <strong>{value}s</strong>
      </div>
      <div className="stepper-controls">
        <button
          type="button"
          aria-label={`Reduce ${label}`}
          onClick={() => onChange(Math.max(min, value - 5))}
          disabled={value <= min}
        >
          <Minus />
        </button>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 5))}
          disabled={value >= max}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}

function ExerciseCard({
  slotId,
  section,
  exercise,
  rounds,
  timing,
  onSwap,
  onEdit,
}: {
  slotId: string;
  section: SectionKey;
  exercise: Exercise;
  rounds: number;
  timing: Timing;
  onSwap: () => void;
  onEdit: () => void;
}) {
  return (
    <motion.article
      layout
      className="exercise-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="exercise-visual">
        <ExerciseDemo exercise={exercise} />
      </div>
      <div className="exercise-copy">
        <div className="exercise-heading">
          <span className={`category-tag ${categoryClass[exercise.category]}`}>
            {exercise.category}
          </span>
          <span className="round-chip">{rounds}×</span>
        </div>
        <h3>{exercise.name}</h3>
        <p className="target"><Clock3 /> {exercise.target}</p>
        <ul>
          <li>{exercise.cues[0]}</li>
          <li>{exercise.cues[1]}</li>
        </ul>
        <p className="easier"><strong>Easier:</strong> {exercise.easier}</p>
        <div className="exercise-actions">
          <button type="button" className="action-button" onClick={onSwap}>
            <Shuffle /> Swap
          </button>
          <button type="button" className="action-button" onClick={onEdit}>
            <Settings2 /> {section === "reset" ? `${timing.work}s` : `${timing.work}s / ${timing.rest}s`}
          </button>
        </div>
      </div>
    </motion.article>
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
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
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
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

export default function Home() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [timings, setTimings] = useState<TimingMap>({});
  const [swapMaps, setSwapMaps] = useState<SwapMap>({});
  const [swapSlot, setSwapSlot] = useState<{ slotId: string; section: SectionKey } | null>(null);
  const [editSlot, setEditSlot] = useState<{ slotId: string; section: SectionKey } | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [complete, setComplete] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const day = workouts[selectedDay];
  const activeSwaps = swapMaps[day.day] ?? {};
  const plan = useMemo(
    () => buildPlan(day, timings, activeSwaps),
    [day, timings, activeSwaps],
  );
  const totalSeconds = useMemo(
    () => plan.reduce((total, interval) => total + interval.duration, 0),
    [plan],
  );
  const defaultTotal = totalSeconds === 1500;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("parallette25-settings");
      if (saved) {
        const parsed = JSON.parse(saved) as {
          timings?: TimingMap;
          swaps?: SwapMap;
          selectedDay?: number;
          soundOn?: boolean;
        };
        if (parsed.timings) setTimings(parsed.timings);
        if (parsed.swaps) setSwapMaps(parsed.swaps);
        if (typeof parsed.selectedDay === "number") setSelectedDay(parsed.selectedDay);
        if (typeof parsed.soundOn === "boolean") setSoundOn(parsed.soundOn);
      }
    } catch {
      // A corrupted local preference should never block a workout.
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "parallette25-settings",
      JSON.stringify({ timings, swaps: swapMaps, selectedDay, soundOn }),
    );
  }, [timings, swapMaps, selectedDay, soundOn]);

  const beep = useCallback((high = false) => {
    if (!soundOn) return;
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
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // Sound is a convenience; the visual timer remains authoritative.
    }
  }, [soundOn]);

  useEffect(() => {
    if (!running || !playerOpen || complete) return;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= plan.length) {
          setRunning(false);
          setComplete(true);
          beep(true);
          return;
        }
        const nextDuration = plan[nextIndex].duration;
        beep(plan[nextIndex].kind === "work");
        setCurrentIndex(nextIndex);
        setRemaining(nextDuration);
        deadlineRef.current = Date.now() + nextDuration * 1000;
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [beep, complete, currentIndex, plan, playerOpen, running]);

  const resolveExercise = (slotId: string) => exercises[activeSwaps[slotId] ?? slotId];

  const startWorkout = () => {
    const first = plan[0];
    setComplete(false);
    setCurrentIndex(0);
    setRemaining(first.duration);
    setPlayerOpen(true);
    setRunning(true);
    deadlineRef.current = Date.now() + first.duration * 1000;
    beep(true);
  };

  const toggleTimer = () => {
    if (running) {
      setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      setRunning(false);
    } else {
      deadlineRef.current = Date.now() + remaining * 1000;
      setRunning(true);
      beep(true);
    }
  };

  const jump = (direction: -1 | 1) => {
    const nextIndex = Math.min(plan.length - 1, Math.max(0, currentIndex + direction));
    const nextDuration = plan[nextIndex].duration;
    setCurrentIndex(nextIndex);
    setRemaining(nextDuration);
    if (running) deadlineRef.current = Date.now() + nextDuration * 1000;
  };

  const updateTiming = (slotId: string, section: SectionKey, patch: Partial<Timing>) => {
    const current = getTiming(slotId, section, timings);
    setTimings((previous) => ({
      ...previous,
      [slotId]: { ...current, ...patch },
    }));
  };

  const resetTiming = (slotId: string) => {
    setTimings((previous) => {
      const next = { ...previous };
      delete next[slotId];
      return next;
    });
  };

  const resetAllTimings = () => setTimings({});

  const chooseSwap = (slotId: string, exerciseId: string) => {
    setSwapMaps((previous) => ({
      ...previous,
      [day.day]: { ...(previous[day.day] ?? {}), [slotId]: exerciseId },
    }));
    setSwapSlot(null);
  };

  const sections = [
    { key: "warmup" as const, slots: universalWarmup, rounds: 1 },
    { key: "pre" as const, slots: day.pre, rounds: 2 },
    { key: "core" as const, slots: day.core, rounds: 3 },
    { key: "skill" as const, slots: [day.skill], rounds: 5 },
  ];

  const current = plan[currentIndex];
  const currentExercise = current?.exerciseId ? exercises[current.exerciseId] : undefined;
  const nextWork = plan.slice(currentIndex + 1).find((item) => item.kind === "work");
  const nextExercise = nextWork?.exerciseId ? exercises[nextWork.exerciseId] : undefined;
  const elapsedBefore = plan
    .slice(0, currentIndex)
    .reduce((total, interval) => total + interval.duration, 0);
  const progress = totalSeconds
    ? Math.min(100, ((elapsedBefore + ((current?.duration ?? 0) - remaining)) / totalSeconds) * 100)
    : 0;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Parallette 25 home">
          <span className="brand-mark"><i /><i /></span>
          <span><strong>PARALLETTE</strong><b>25</b></span>
        </a>
        <div className="header-actions">
          <button type="button" className="header-button" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? <Volume2 /> : <VolumeX />}
            <span>{soundOn ? "Sound on" : "Sound off"}</span>
          </button>
          <button type="button" className="header-button" onClick={() => setInstallOpen(true)}>
            <Smartphone />
            <span>Use on iPhone</span>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> YOUR BUILT-IN TRAINING PARTNER</p>
          <h1>Stronger core.<br /><em>Calmer handstands.</em></h1>
          <p className="hero-intro">
            Five focused, beginner-smart sessions for medium-height parallettes—guided by a precise timer, smooth motion guides and technically exact key positions.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={startWorkout}>
              <Play fill="currentColor" /> Start Day {day.day}
            </button>
            <button type="button" className="secondary-button" onClick={() => document.getElementById("workout")?.scrollIntoView({ behavior: "smooth" })}>
              Preview workout <ChevronRight />
            </button>
          </div>
          <div className="hero-proof">
            <span><Check /> Exact {formatTime(totalSeconds)}</span>
            <span><Check /> Same-level swaps</span>
            <span><Check /> iPhone ready</span>
          </div>
        </div>
        <div className="hero-card-wrap">
          <div className="hero-card-accent" />
          <div className="hero-card">
            <div className="hero-card-top">
              <span>DAY {day.day}</span>
              <span className={`intensity intensity-${day.intensity.toLowerCase()}`}>{day.intensity}</span>
            </div>
            <h2>{day.title}</h2>
            <p>{day.focus}</p>
            <div className="timer-orbit">
              <svg viewBox="0 0 180 180" aria-hidden="true">
                <circle cx="90" cy="90" r="76" className="orbit-track" />
                <circle cx="90" cy="90" r="76" className="orbit-value" />
              </svg>
              <div><strong>{formatTime(totalSeconds)}</strong><span>TOTAL</span></div>
            </div>
            <div className="mini-timeline">
              {timeline.map((item) => <i key={item[3]} className={`mini-${item[3]}`} />)}
            </div>
            <p className="rotation-note">Suggested rotation: Day 1, Day 2, rest, Day 3, Day 4, rest, Day 5.</p>
          </div>
        </div>
      </section>

      <section className="timer-strip" aria-label="Workout timeline">
        {timeline.map(([start, end, label, key], index) => (
          <div className={`timeline-item timeline-${key}`} key={key}>
            <span>{index + 1}</span>
            <div><strong>{label}</strong><small>{start}–{end}</small></div>
          </div>
        ))}
        <div className="timeline-total"><strong>25:00</strong><small>exact default</small></div>
      </section>

      <section className="workout-shell" id="workout">
        <div className="section-intro">
          <div>
            <p className="eyebrow"><span /> CHOOSE YOUR SESSION</p>
            <h2>Five days. One clear path.</h2>
            <p>Tap any day, swap an exercise, or tune its interval before you begin.</p>
          </div>
          <div className={`total-pill ${defaultTotal ? "total-default" : "total-custom"}`}>
            <Clock3 />
            <div><span>Session total</span><strong>{formatTime(totalSeconds)}</strong></div>
            {!defaultTotal && <button type="button" onClick={resetAllTimings}>Reset to 25:00</button>}
          </div>
        </div>

        <div className="demo-standard">
          <Info />
          <div>
            <strong>Motion when motion helps. Key positions when precision matters.</strong>
            <span>Warm-ups, cooldowns and common core drills animate smoothly. Parallette and wall drills show large START / FINISH panels so hand, foot and bar contact stay technically exact.</span>
          </div>
        </div>

        <div className="day-tabs" role="tablist" aria-label="Workout days">
          {workouts.map((item, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedDay === index}
              className={selectedDay === index ? "active" : ""}
              key={item.day}
              onClick={() => setSelectedDay(index)}
            >
              <span>Day {item.day}</span>
              <strong>{item.title}</strong>
              {item.intensity === "Light" && <small>lighter day</small>}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={day.day}
            className="day-content"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
          >
            <div className="day-banner">
              <div>
                <span>DAY {day.day} • {day.intensity.toUpperCase()}</span>
                <h2>{day.title}</h2>
                <p>{day.focus}</p>
              </div>
              <button type="button" className="primary-button compact" onClick={startWorkout}>
                <Play fill="currentColor" /> Start {formatTime(totalSeconds)}
              </button>
            </div>

            {sections.map(({ key, slots, rounds }, sectionIndex) => (
              <section className="exercise-section" key={key}>
                <div className="exercise-section-title">
                  <div className={`section-icon icon-${key}`}><SectionIcon section={key} /></div>
                  <div>
                    <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                    <h2>{sectionLabels[key]}</h2>
                    <p>{sectionMeta[key]}</p>
                  </div>
                </div>
                <div className="exercise-grid">
                  {slots.map((slotId) => {
                    const exercise = resolveExercise(slotId);
                    return (
                      <ExerciseCard
                        key={slotId}
                        slotId={slotId}
                        section={key}
                        exercise={exercise}
                        rounds={rounds}
                        timing={getTiming(slotId, key, timings)}
                        onSwap={() => setSwapSlot({ slotId, section: key })}
                        onEdit={() => setEditSlot({ slotId, section: key })}
                      />
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="exercise-section cooldown-section">
              <div className="exercise-section-title">
                <div className="section-icon icon-reset"><RefreshCw /></div>
                <div>
                  <span>05</span>
                  <h2>Cooldown reset</h2>
                  <p>{sectionMeta.reset}</p>
                </div>
              </div>
              <div className="exercise-grid">
                {day.cooldown.map((baseExerciseId, index) => {
                  const slotId = `reset-${index}`;
                  const exercise = exercises[activeSwaps[slotId] ?? baseExerciseId];
                  return (
                    <ExerciseCard
                      key={slotId}
                      slotId={slotId}
                      section="reset"
                      exercise={exercise}
                      rounds={1}
                      timing={getTiming(slotId, "reset", timings)}
                      onSwap={() => setSwapSlot({ slotId, section: "reset" })}
                      onEdit={() => setEditSlot({ slotId, section: "reset" })}
                    />
                  );
                })}
              </div>
            </section>
          </motion.div>
        </AnimatePresence>
      </section>

      <section className="readiness">
        <div>
          <p className="eyebrow"><span /> PROGRESS WITH CONTROL</p>
          <h2>Earn the freestanding attempt.</h2>
          <p>Because you already balance on the floor, the app moves you forward—but first confirms parallette-specific strength, line control and a safe exit.</p>
        </div>
        <div className="readiness-grid">
          {["30s clean support", "10 support shrugs", "25s box-pike hold", "20s chest-to-wall", "Side exit both ways", "30s hollow hold", "Calm wall kick-up"].map((item) => (
            <span key={item}><Check /> {item}</span>
          ))}
        </div>
        <div className="progress-rule">
          <Info /> Progress only after the upper target is clean in two separate sessions. Change one thing: +2 reps, +5 seconds, less foot help, a longer lever, or slightly closer to the wall.
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark"><i /><i /></span>
          <span><strong>PARALLETTE</strong><b>25</b></span>
        </div>
        <p>Train within your control. Stop for sharp wrist, elbow or shoulder pain.</p>
      </footer>

      <div className="mobile-start-bar">
        <div><span>Day {day.day}</span><strong>{formatTime(totalSeconds)}</strong></div>
        <button type="button" onClick={startWorkout}><Play fill="currentColor" /> Start workout</button>
      </div>

      <AnimatePresence>
        {swapSlot && (() => {
          const baseId = swapSlot.section === "reset"
            ? day.cooldown[Number(swapSlot.slotId.split("-")[1])]
            : swapSlot.slotId;
          const currentId = activeSwaps[swapSlot.slotId] ?? baseId;
          const currentItem = exercises[currentId];
          const options = [baseId, ...exercises[baseId].swaps, ...currentItem.swaps]
            .filter((id, index, array) => exercises[id] && array.indexOf(id) === index);
          return (
            <Drawer
              title="Swap exercise"
              subtitle="Only comparable beginner-level options are shown. Timing stays the same."
              onClose={() => setSwapSlot(null)}
            >
              <div className="swap-list">
                {options.map((exerciseId) => {
                  const option = exercises[exerciseId];
                  const selected = exerciseId === currentId;
                  return (
                    <button
                      type="button"
                      className={selected ? "selected" : ""}
                      key={exerciseId}
                      onClick={() => chooseSwap(swapSlot.slotId, exerciseId)}
                    >
                      <div className="swap-demo"><ExerciseDemo exercise={option} compact /></div>
                      <div><span className={`category-tag ${categoryClass[option.category]}`}>{option.category}</span><strong>{option.name}</strong><small>{option.target}</small></div>
                      {selected ? <Check /> : <ChevronRight />}
                    </button>
                  );
                })}
              </div>
            </Drawer>
          );
        })()}

        {editSlot && (() => {
          const timing = getTiming(editSlot.slotId, editSlot.section, timings);
          const name = editSlot.section === "reset"
            ? exercises[activeSwaps[editSlot.slotId] ?? day.cooldown[Number(editSlot.slotId.split("-")[1])]].name
            : resolveExercise(editSlot.slotId).name;
          return (
            <Drawer
              title="Adjust interval"
              subtitle={`${name} • changes are saved on this iPhone`}
              onClose={() => setEditSlot(null)}
            >
              <div className="timing-editor">
                <Stepper
                  label={editSlot.section === "skill" ? "Practice" : "Work"}
                  value={timing.work}
                  onChange={(work) => updateTiming(editSlot.slotId, editSlot.section, { work })}
                />
                {editSlot.section !== "reset" && (
                  <Stepper
                    label={editSlot.section === "warmup" ? "Transition" : "Rest"}
                    value={timing.rest}
                    min={0}
                    onChange={(rest) => updateTiming(editSlot.slotId, editSlot.section, { rest })}
                  />
                )}
                <div className="timing-impact">
                  <Clock3 /><span>Updated workout total</span><strong>{formatTime(totalSeconds)}</strong>
                </div>
                <button type="button" className="reset-button" onClick={() => resetTiming(editSlot.slotId)}>
                  <RotateCcw /> Reset this exercise
                </button>
              </div>
            </Drawer>
          );
        })()}

        {installOpen && (
          <Drawer title="Put it on your iPhone" subtitle="No App Store needed." onClose={() => setInstallOpen(false)}>
            <ol className="install-steps">
              <li><strong>1</strong><div><b>Open this link in Safari</b><span>Safari provides the Home Screen option.</span></div></li>
              <li><strong>2</strong><div><b>Tap the Share button</b><span>It is the square with an upward arrow.</span></div></li>
              <li><strong>3</strong><div><b>Choose “Add to Home Screen”</b><span>Launch it later like a normal full-screen app.</span></div></li>
            </ol>
            <p className="install-note"><CircleHelp /> Your selected day, swaps and timer settings stay on this device.</p>
          </Drawer>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerOpen && (
          <motion.section
            className={`player player-${current?.kind ?? "work"}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {!complete ? (
              <>
                <div className="player-topbar">
                  <button type="button" className="icon-button player-close" onClick={() => { setRunning(false); setPlayerOpen(false); }} aria-label="Close workout"><X /></button>
                  <div>
                    <span>DAY {day.day} • {current.sectionLabel}</span>
                    <div className="player-progress"><i style={{ width: `${progress}%` }} /></div>
                  </div>
                  <button type="button" className="icon-button" onClick={() => setSoundOn((value) => !value)} aria-label="Toggle timer sound">{soundOn ? <Volume2 /> : <VolumeX />}</button>
                </div>

                <div className="player-layout">
                  <div className="player-demo">
                    {current.kind === "work" && currentExercise ? (
                      <ExerciseDemo exercise={currentExercise} />
                    ) : current.kind === "work" ? (
                      <div className="reset-visual"><RefreshCw /><span>Breathe slowly</span></div>
                    ) : nextExercise ? (
                      <><ExerciseDemo exercise={nextExercise} dimmed /><span className="up-next-label">UP NEXT • {nextExercise.name}</span></>
                    ) : (
                      <div className="reset-visual"><RefreshCw /><span>Almost done</span></div>
                    )}
                  </div>

                  <div className="player-info">
                    <span className={`phase-pill phase-${current.kind}`}>{current.kind === "work" ? "WORK" : current.label.toUpperCase()}</span>
                    <p className="round-label">Round {current.round} of {current.rounds}</p>
                    <h1>{current.kind === "work" ? current.label : "Recover completely"}</h1>
                    {currentExercise && current.kind === "work" && <p className="player-target">Target: {currentExercise.target}. Stop there if form is clean.</p>}
                    <div className="countdown" aria-live="polite">{formatTime(remaining)}</div>
                    <div className="countdown-track"><i style={{ width: `${current.duration ? (remaining / current.duration) * 100 : 0}%` }} /></div>
                    {currentExercise && current.kind === "work" && (
                      <div className="cue-box"><strong>FOCUS</strong><span>{currentExercise.cues[0]}</span><span>{currentExercise.cues[1]}</span></div>
                    )}
                    {current.kind === "rest" && nextExercise && <p className="rest-copy">Relax your grip, shake out tension, then set both bars before the next interval.</p>}
                    <div className="player-controls">
                      <button type="button" onClick={() => jump(-1)} disabled={currentIndex === 0} aria-label="Previous interval"><ArrowLeft /></button>
                      <button type="button" className="play-control" onClick={toggleTimer} aria-label={running ? "Pause timer" : "Resume timer"}>{running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
                      <button type="button" onClick={() => jump(1)} disabled={currentIndex === plan.length - 1} aria-label="Next interval"><ArrowRight /></button>
                    </div>
                    <div className="player-secondary-actions">
                      {current.exerciseId && <button type="button" onClick={() => { setRunning(false); setSwapSlot({ slotId: current.slotId, section: current.section }); }}><Shuffle /> Swap</button>}
                      <button type="button" onClick={() => { setRunning(false); setEditSlot({ slotId: current.slotId, section: current.section }); }}><Settings2 /> Adjust time</button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="complete-screen">
                <div className="complete-check"><Check /></div>
                <p>DAY {day.day} COMPLETE</p>
                <h1>25 minutes.<br /><em>Quality earned.</em></h1>
                <span>You finished {day.title}. Note any clean upper targets before progressing next time.</span>
                <button type="button" className="primary-button" onClick={() => { setPlayerOpen(false); setComplete(false); }}><Check /> Finish session</button>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
