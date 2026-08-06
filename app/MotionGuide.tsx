import { motion, useReducedMotion } from "motion/react";

export type MotionPreset =
  | "wrist-rocks"
  | "shoulder-cars"
  | "scap-pushup"
  | "wrist-circles"
  | "wall-slides"
  | "plank-pike"
  | "dead-bug"
  | "plank-tap"
  | "mountain-climber"
  | "hollow-rock"
  | "plank-saw"
  | "cross-press"
  | "kneeling-plank-tap"
  | "plank-knee"
  | "hollow-reach"
  | "hollow-one-leg"
  | "plank-tap-out"
  | "wrist-flexor-rock"
  | "wrist-extensor-rock"
  | "child-reach"
  | "thread-needle"
  | "lat-reach"
  | "puppy-rock"
  | "chest-opener"
  | "upper-back-reach";

type Point = { x: number; y: number };
type Joint =
  | "head"
  | "neck"
  | "ls"
  | "le"
  | "lw"
  | "rs"
  | "re"
  | "rw"
  | "lh"
  | "lk"
  | "la"
  | "rh"
  | "rk"
  | "ra";
type Pose = Record<Joint, Point>;
type Equipment = "none" | "wall" | "parallettes";
type Guide = {
  poses: Pose[];
  floor: number;
  equipment?: Equipment;
  duration?: number;
  label: string;
};

const p = (x: number, y: number): Point => ({ x, y });
const change = (base: Pose, updates: Partial<Record<Joint, Point>>): Pose => ({
  ...base,
  ...updates,
});

const standing: Pose = {
  head: p(320, 78), neck: p(320, 120),
  ls: p(284, 138), le: p(272, 230), lw: p(290, 305),
  rs: p(356, 138), re: p(368, 230), rw: p(350, 305),
  lh: p(302, 285), lk: p(292, 382), la: p(282, 470),
  rh: p(338, 285), rk: p(348, 382), ra: p(358, 470),
};

const quadruped: Pose = {
  head: p(492, 205), neck: p(452, 224),
  ls: p(424, 244), le: p(426, 312), lw: p(426, 390),
  rs: p(440, 250), re: p(446, 316), rw: p(448, 390),
  lh: p(282, 246), lk: p(270, 350), la: p(190, 390),
  rh: p(300, 256), rk: p(302, 354), ra: p(220, 390),
};

const plank: Pose = {
  head: p(500, 214), neck: p(465, 234),
  ls: p(430, 250), le: p(430, 320), lw: p(430, 398),
  rs: p(446, 254), re: p(448, 324), rw: p(452, 398),
  lh: p(292, 292), lk: p(190, 332), la: p(82, 395),
  rh: p(306, 300), rk: p(204, 342), ra: p(102, 398),
};

const supine: Pose = {
  head: p(505, 379), neck: p(465, 365),
  ls: p(426, 356), le: p(398, 290), lw: p(378, 230),
  rs: p(432, 370), re: p(414, 310), rw: p(402, 252),
  lh: p(300, 372), lk: p(252, 294), la: p(230, 218),
  rh: p(312, 386), rk: p(272, 322), ra: p(252, 250),
};

const child: Pose = {
  head: p(440, 345), neck: p(400, 326),
  ls: p(370, 312), le: p(444, 354), lw: p(528, 394),
  rs: p(378, 326), re: p(452, 366), rw: p(536, 402),
  lh: p(258, 306), lk: p(236, 390), la: p(148, 407),
  rh: p(276, 316), rk: p(266, 398), ra: p(178, 414),
};

const closeLoop = (poses: Pose[]) => [...poses, ...poses.slice(0, -1).reverse()];

const shifted = (base: Pose, dx: number, dy: number): Pose =>
  Object.fromEntries(
    Object.entries(base).map(([joint, point]) => [joint, p(point.x + dx, point.y + dy)]),
  ) as Pose;

const guides: Record<MotionPreset, Guide> = {
  "wrist-rocks": {
    poses: closeLoop([
      quadruped,
      change(quadruped, {
        head: p(520, 206), neck: p(482, 225), ls: p(456, 244), rs: p(470, 250),
        le: p(448, 314), re: p(462, 318), lh: p(294, 250), rh: p(312, 260),
      }),
    ]),
    floor: 410,
    label: "Rock forward and back",
  },
  "shoulder-cars": {
    poses: closeLoop([
      standing,
      change(standing, {
        le: p(215, 142), lw: p(142, 142), re: p(425, 142), rw: p(498, 142),
      }),
      change(standing, {
        le: p(290, 76), lw: p(306, 28), re: p(350, 76), rw: p(334, 28),
      }),
    ]),
    floor: 486,
    label: "Circle through a pain-free range",
    duration: 4.6,
  },
  "scap-pushup": {
    poses: closeLoop([
      plank,
      change(plank, {
        head: p(500, 232), neck: p(464, 252), ls: p(430, 268), rs: p(446, 272),
        lh: p(292, 302), rh: p(306, 310),
      }),
    ]),
    floor: 414,
    equipment: "parallettes",
    label: "Elbows stay locked",
  },
  "wrist-circles": {
    poses: closeLoop([
      change(standing, { le: p(280, 215), lw: p(320, 225), re: p(360, 215), rw: p(320, 225) }),
      change(standing, { le: p(280, 215), lw: p(307, 209), re: p(360, 215), rw: p(333, 241) }),
      change(standing, { le: p(280, 215), lw: p(320, 196), re: p(360, 215), rw: p(320, 254) }),
    ]),
    floor: 486,
    label: "Slow circles in both directions",
  },
  "wall-slides": {
    poses: closeLoop([
      change(standing, { le: p(254, 200), lw: p(244, 142), re: p(386, 200), rw: p(396, 142) }),
      change(standing, { le: p(278, 82), lw: p(304, 28), re: p(362, 82), rw: p(336, 28) }),
    ]),
    floor: 486,
    equipment: "wall",
    label: "Ribs down; slide overhead",
  },
  "plank-pike": {
    poses: closeLoop([
      plank,
      change(plank, {
        head: p(470, 218), neck: p(432, 230), ls: p(410, 250), rs: p(426, 254),
        lh: p(278, 146), rh: p(294, 154), lk: p(184, 278), rk: p(200, 288),
      }),
    ]),
    floor: 414,
    equipment: "parallettes",
    label: "Press back into a tall pike",
  },
  "dead-bug": {
    poses: closeLoop([
      supine,
      change(supine, {
        le: p(474, 378), lw: p(560, 405),
        rk: p(210, 390), ra: p(100, 407),
      }),
      change(supine, {
        re: p(482, 386), rw: p(565, 412),
        lk: p(205, 384), la: p(98, 404),
      }),
    ]),
    floor: 426,
    label: "Opposite arm and leg",
    duration: 4.8,
  },
  "plank-tap": {
    poses: closeLoop([
      plank,
      change(plank, { le: p(486, 230), lw: p(446, 254), ls: p(430, 250), rh: p(304, 302) }),
    ]),
    floor: 414,
    equipment: "parallettes",
    label: "Shift, tap, return",
  },
  "mountain-climber": {
    poses: closeLoop([
      plank,
      change(plank, { rh: p(310, 302), rk: p(342, 350), ra: p(392, 396) }),
      change(plank, { lh: p(296, 294), lk: p(352, 342), la: p(400, 396) }),
    ]),
    floor: 414,
    equipment: "parallettes",
    label: "Slow alternating knee drives",
    duration: 4.4,
  },
  "hollow-rock": {
    poses: closeLoop([
      change(supine, { le: p(500, 350), lw: p(570, 326), re: p(505, 365), rw: p(575, 342), lk: p(210, 374), la: p(95, 352), rk: p(220, 390), ra: p(105, 370) }),
      shifted(change(supine, { le: p(500, 350), lw: p(570, 326), re: p(505, 365), rw: p(575, 342), lk: p(210, 374), la: p(95, 352), rk: p(220, 390), ra: p(105, 370) }), -8, -18),
    ]),
    floor: 426,
    label: "Keep one hollow shape",
  },
  "plank-saw": {
    poses: closeLoop([plank, shifted(plank, -35, 0)]),
    floor: 414,
    equipment: "parallettes",
    label: "Move as one solid line",
  },
  "cross-press": {
    poses: closeLoop([
      change(supine, { lw: p(292, 306), le: p(350, 324) }),
      change(supine, { lw: p(292, 306), le: p(350, 324), rk: p(210, 390), ra: p(98, 408), re: p(490, 390), rw: p(565, 414) }),
    ]),
    floor: 426,
    label: "Press knee; extend the other side",
  },
  "kneeling-plank-tap": {
    poses: closeLoop([
      change(plank, { lk: p(240, 400), la: p(170, 405), rk: p(260, 405), ra: p(190, 410) }),
      change(plank, { lk: p(240, 400), la: p(170, 405), rk: p(260, 405), ra: p(190, 410), le: p(486, 230), lw: p(446, 254) }),
    ]),
    floor: 420,
    equipment: "parallettes",
    label: "Knees down; hips quiet",
  },
  "plank-knee": {
    poses: closeLoop([plank, change(plank, { rh: p(310, 302), rk: p(385, 320), ra: p(420, 350) })]),
    floor: 414,
    equipment: "parallettes",
    label: "Knee travels toward elbow",
  },
  "hollow-reach": {
    poses: closeLoop([
      change(supine, { le: p(420, 290), lw: p(410, 230), re: p(438, 306), rw: p(430, 245), lk: p(214, 382), la: p(104, 405), rk: p(224, 396), ra: p(114, 416) }),
      change(supine, { le: p(500, 355), lw: p(572, 382), re: p(505, 370), rw: p(576, 398), lk: p(214, 382), la: p(104, 405), rk: p(224, 396), ra: p(114, 416) }),
    ]),
    floor: 426,
    label: "Reach only while the back stays flat",
  },
  "hollow-one-leg": {
    poses: closeLoop([
      change(supine, { le: p(500, 355), lw: p(570, 380), re: p(505, 370), rw: p(575, 396), lk: p(250, 320), la: p(220, 245), rk: p(212, 390), ra: p(98, 410) }),
      change(supine, { le: p(500, 355), lw: p(570, 380), re: p(505, 370), rw: p(575, 396), lk: p(212, 384), la: p(98, 405), rk: p(254, 330), ra: p(226, 252) }),
    ]),
    floor: 426,
    label: "Alternate without losing the tuck",
    duration: 4.4,
  },
  "plank-tap-out": {
    poses: closeLoop([plank, change(plank, { le: p(468, 330), lw: p(520, 398), ls: p(430, 250) })]),
    floor: 414,
    equipment: "parallettes",
    label: "Tap wide without twisting",
  },
  "wrist-flexor-rock": {
    poses: closeLoop([quadruped, change(quadruped, { head: p(515, 208), neck: p(478, 226), ls: p(454, 246), rs: p(468, 252), lh: p(292, 250), rh: p(310, 260) })]),
    floor: 410,
    label: "Palms down; fingers forward",
  },
  "wrist-extensor-rock": {
    poses: closeLoop([quadruped, change(quadruped, { head: p(470, 210), neck: p(432, 230), ls: p(410, 250), rs: p(424, 256), lh: p(272, 250), rh: p(290, 260) })]),
    floor: 410,
    label: "Fingers face the knees",
  },
  "child-reach": {
    poses: closeLoop([child, change(child, { head: p(466, 372), neck: p(420, 348), ls: p(386, 336), rs: p(394, 348), lw: p(558, 404), rw: p(566, 412), lh: p(248, 320), rh: p(266, 330) })]),
    floor: 426,
    label: "Hips back; reach long",
  },
  "thread-needle": {
    poses: closeLoop([
      quadruped,
      change(quadruped, { rs: p(404, 264), re: p(350, 330), rw: p(278, 390), head: p(420, 300), neck: p(398, 278) }),
    ]),
    floor: 410,
    label: "Slide under; rotate gently",
  },
  "lat-reach": {
    poses: closeLoop([
      change(child, { lh: p(248, 292), rh: p(266, 302), lk: p(244, 390), rk: p(272, 398), lw: p(500, 350), rw: p(522, 360) }),
      change(child, { head: p(452, 374), neck: p(410, 346), ls: p(380, 326), rs: p(388, 338), lh: p(248, 292), rh: p(266, 302), lk: p(244, 390), rk: p(272, 398), lw: p(500, 350), rw: p(522, 360) }),
    ]),
    floor: 426,
    equipment: "parallettes",
    label: "Sink the chest between the arms",
  },
  "puppy-rock": {
    poses: closeLoop([
      change(child, { lh: p(260, 260), rh: p(280, 270), lk: p(260, 390), rk: p(288, 398) }),
      change(child, { head: p(458, 378), neck: p(414, 350), ls: p(382, 330), rs: p(390, 342), lh: p(260, 260), rh: p(280, 270), lk: p(260, 390), rk: p(288, 398), lw: p(556, 404), rw: p(564, 412) }),
    ]),
    floor: 426,
    label: "Hips over knees; chest lowers",
  },
  "chest-opener": {
    poses: closeLoop([
      change(standing, { le: p(290, 238), lw: p(262, 292), re: p(300, 238), rw: p(262, 292) }),
      change(standing, { le: p(286, 216), lw: p(246, 252), re: p(298, 220), rw: p(246, 252), ls: p(276, 136), rs: p(364, 136) }),
    ]),
    floor: 486,
    label: "Clasp behind; lift gently",
  },
  "upper-back-reach": {
    poses: closeLoop([
      standing,
      change(standing, { le: p(338, 188), lw: p(372, 164), re: p(302, 188), rw: p(268, 164), head: p(320, 92), neck: p(320, 132), ls: p(292, 150), rs: p(348, 150) }),
    ]),
    floor: 486,
    label: "Hug wide; breathe into upper back",
  },
};

const joints = (poses: Pose[], joint: Joint, axis: "x" | "y") =>
  poses.map((pose) => pose[joint][axis]);

function AnimatedLine({
  poses,
  from,
  to,
  stroke,
  width,
  transition,
  muted = false,
}: {
  poses: Pose[];
  from: Joint;
  to: Joint;
  stroke: string;
  width: number;
  transition: Record<string, unknown>;
  muted?: boolean;
}) {
  return (
    <motion.line
      x1={poses[0][from].x}
      y1={poses[0][from].y}
      x2={poses[0][to].x}
      y2={poses[0][to].y}
      animate={{
        x1: joints(poses, from, "x"),
        y1: joints(poses, from, "y"),
        x2: joints(poses, to, "x"),
        y2: joints(poses, to, "y"),
      }}
      transition={transition}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={muted ? 0.55 : 1}
    />
  );
}

export function MotionGuide({ preset, compact = false }: { preset: MotionPreset; compact?: boolean }) {
  const reduceMotion = useReducedMotion();
  const guide = guides[preset];
  const poses = reduceMotion ? [guide.poses[Math.floor(guide.poses.length / 2)]] : guide.poses;
  const times = poses.map((_, index) => index / Math.max(1, poses.length - 1));
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: guide.duration ?? 3.6, repeat: Infinity, ease: "easeInOut" as const, times };

  return (
    <div className={`motion-guide ${compact ? "motion-guide-compact" : ""}`}>
      <svg viewBox="0 0 640 520" role="img" aria-label={guide.label}>
        <defs>
          <linearGradient id={`motion-bg-${preset}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7f1e8" />
            <stop offset="1" stopColor="#e6f3ef" />
          </linearGradient>
          <filter id={`motion-shadow-${preset}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#18332d" floodOpacity=".13" />
          </filter>
        </defs>
        <rect width="640" height="520" fill={`url(#motion-bg-${preset})`} />
        <ellipse cx="320" cy={guide.floor + 8} rx="250" ry="18" fill="#163a33" opacity=".07" />
        <rect x="62" y={guide.floor - 5} width="516" height="13" rx="7" fill="#8fcfc1" opacity=".65" />

        {guide.equipment === "wall" && (
          <g opacity=".5">
            <rect x="160" y="28" width="320" height="442" rx="12" fill="#fff" stroke="#c9d8d3" strokeWidth="3" />
            {[112, 198, 284, 370].map((y) => <line key={y} x1="166" x2="474" y1={y} y2={y} stroke="#dce6e2" strokeWidth="2" />)}
          </g>
        )}

        {guide.equipment === "parallettes" && (
          <g fill="none" stroke="#9b633d" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter={`url(#motion-shadow-${preset})`}>
            <path d={`M390 ${guide.floor - 18} L470 ${guide.floor - 18} M402 ${guide.floor - 18} L396 ${guide.floor + 3} M458 ${guide.floor - 18} L464 ${guide.floor + 3}`} />
            <path d={`M420 ${guide.floor - 48} L500 ${guide.floor - 48} M432 ${guide.floor - 48} L426 ${guide.floor - 27} M488 ${guide.floor - 48} L494 ${guide.floor - 27}`} opacity=".55" />
          </g>
        )}

        <g filter={`url(#motion-shadow-${preset})`}>
          <AnimatedLine poses={poses} from="rs" to="re" stroke="#c98259" width={18} transition={transition} muted />
          <AnimatedLine poses={poses} from="re" to="rw" stroke="#c98259" width={17} transition={transition} muted />
          <AnimatedLine poses={poses} from="rh" to="rk" stroke="#2d4240" width={23} transition={transition} muted />
          <AnimatedLine poses={poses} from="rk" to="ra" stroke="#2d4240" width={21} transition={transition} muted />

          <AnimatedLine poses={poses} from="neck" to="rs" stroke="#0f756d" width={27} transition={transition} muted />
          <AnimatedLine poses={poses} from="neck" to="ls" stroke="#13847a" width={29} transition={transition} />
          <AnimatedLine poses={poses} from="rs" to="rh" stroke="#0f756d" width={39} transition={transition} muted />
          <AnimatedLine poses={poses} from="ls" to="lh" stroke="#13847a" width={42} transition={transition} />
          <AnimatedLine poses={poses} from="ls" to="rs" stroke="#13847a" width={34} transition={transition} />
          <AnimatedLine poses={poses} from="lh" to="rh" stroke="#f06b4f" width={32} transition={transition} />

          <AnimatedLine poses={poses} from="lh" to="lk" stroke="#263b39" width={25} transition={transition} />
          <AnimatedLine poses={poses} from="lk" to="la" stroke="#263b39" width={22} transition={transition} />
          <AnimatedLine poses={poses} from="ls" to="le" stroke="#d38f64" width={19} transition={transition} />
          <AnimatedLine poses={poses} from="le" to="lw" stroke="#d38f64" width={18} transition={transition} />
          <AnimatedLine poses={poses} from="head" to="neck" stroke="#d38f64" width={17} transition={transition} />

          <motion.circle
            cx={poses[0].head.x}
            cy={poses[0].head.y}
            r="27"
            fill="#d89a70"
            animate={{ cx: joints(poses, "head", "x"), cy: joints(poses, "head", "y") }}
            transition={transition}
          />
          <motion.path
            d={`M ${poses[0].head.x - 25} ${poses[0].head.y - 6} Q ${poses[0].head.x} ${poses[0].head.y - 34} ${poses[0].head.x + 22} ${poses[0].head.y - 7}`}
            animate={{
              d: poses.map((pose) => `M ${pose.head.x - 25} ${pose.head.y - 6} Q ${pose.head.x} ${pose.head.y - 34} ${pose.head.x + 22} ${pose.head.y - 7}`),
            }}
            transition={transition}
            fill="none"
            stroke="#233432"
            strokeWidth="9"
            strokeLinecap="round"
            opacity=".9"
          />
          {(["lw", "rw", "la", "ra"] as Joint[]).map((joint) => (
            <motion.circle
              key={joint}
              cx={poses[0][joint].x}
              cy={poses[0][joint].y}
              r={joint.endsWith("a") ? 10 : 8}
              fill={joint.endsWith("a") ? "#263b39" : "#d38f64"}
              animate={{ cx: joints(poses, joint, "x"), cy: joints(poses, joint, "y") }}
              transition={transition}
            />
          ))}
        </g>

        {(preset === "wrist-flexor-rock" || preset === "wrist-extensor-rock") && (
          <g aria-hidden="true">
            <line
              x1={preset === "wrist-flexor-rock" ? 430 : 414}
              y1="374"
              x2={preset === "wrist-flexor-rock" ? 486 : 358}
              y2="374"
              stroke="#f06b4f"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d={preset === "wrist-flexor-rock" ? "M 474 362 L 490 374 L 474 386" : "M 370 362 L 354 374 L 370 386"}
              fill="none"
              stroke="#f06b4f"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="342" y="324" width="176" height="30" rx="15" fill="#fff" opacity=".96" />
            <text x="430" y="344" textAnchor="middle" fill="#31504a" fontSize="12" fontWeight="800">
              {preset === "wrist-flexor-rock" ? "FINGERS FORWARD" : "FINGERS TO KNEES"}
            </text>
          </g>
        )}

        {preset === "chest-opener" && (
          <g aria-hidden="true">
            <path d="M 252 248 Q 214 236 220 282" fill="none" stroke="#f06b4f" strokeWidth="7" strokeLinecap="round" />
            <path d="M 208 270 L 220 286 L 232 270" fill="none" stroke="#f06b4f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="112" y="204" width="172" height="30" rx="15" fill="#fff" opacity=".93" />
            <text x="198" y="224" textAnchor="middle" fill="#31504a" fontSize="12" fontWeight="800">HANDS BEHIND BACK</text>
          </g>
        )}

        {!compact && (
          <g>
            <rect x="28" y="26" width="222" height="35" rx="17.5" fill="#12352e" opacity=".9" />
            <text x="139" y="49" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800" letterSpacing="1.1">
              SMOOTH MOTION GUIDE
            </text>
            <rect x="28" y="462" width="360" height="36" rx="18" fill="#fff" opacity=".92" />
            <text x="46" y="485" fill="#31504a" fontSize="14" fontWeight="700">{guide.label}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
