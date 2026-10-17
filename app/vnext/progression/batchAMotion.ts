import type { MotionGuideDefinition } from "../../MotionGuide";
import { phase10OwnedMotionGuides, type OwnedMotionPose, type OwnedMotionJoint, type OwnedMotionPoint } from "../media/phase10OwnedMotion";

type Guide = MotionGuideDefinition & Readonly<{
  phasePoseIndexes: readonly number[];
  camera: string;
  phases: readonly string[];
}>;
const point = (x: number, y: number) => ({ x, y });
const change = (base: OwnedMotionPose, changes: Partial<Record<OwnedMotionJoint, OwnedMotionPoint>>): OwnedMotionPose => ({ ...base, ...changes });
const existing = phase10OwnedMotionGuides;
// Copy immutable owned geometry only where the physical execution matches.
const support = change(existing["parallette-tuck-planche-hold"].poses[0]!, { la: point(174, 420), ra: point(194, 420) });
const tuck = existing["parallette-tuck-planche-hold"].poses[2]!;
const oneLeft = change(existing["assisted-one-leg-planche-hold"].poses[1]!, { rh: tuck.rh, rk: tuck.rk, ra: tuck.ra });
const oneRight = change(existing["assisted-one-leg-planche-hold"].poses[4]!, { lh: tuck.lh, lk: tuck.lk, la: tuck.la });
// Oblique projection: each knee is exactly on its hip-to-ankle segment.
const straddle = change(existing["advanced-tuck-planche-hold"].poses[1]!, {
  lh: point(330, 246), lk: point(218, 218), la: point(106, 190),
  rh: point(346, 254), rk: point(218, 296), ra: point(90, 338),
});
const lSit = existing["partial-v-sit-hold"].poses[1]!;
const vSit = change(lSit, {
  lh: point(420, 304), lk: point(350, 174), la: point(280, 44),
  rh: point(436, 312), rk: point(366, 182), ra: point(296, 52),
});
// Shoulders are forward of fixed grip centres by 78 units; hand length is
// illustrated as 40 units. Toes and wrists remain fixed throughout each rep.
const pushTop: OwnedMotionPose = {
  head: point(592, 234), neck: point(568, 248),
  ls: point(516, 250), le: point(477, 325), lw: point(438, 400),
  rs: point(534, 258), re: point(495, 329), rw: point(456, 400),
  lh: point(342, 320), lk: point(212, 370), la: point(82, 420),
  rh: point(360, 328), rk: point(229, 374), ra: point(98, 420),
};
const pushBottom = change(pushTop, {
  head: point(592, 310), neck: point(568, 324), ls: point(516, 326), rs: point(534, 334),
  le: point(408, 326), re: point(426, 334),
  lh: point(342, 365), lk: point(212, 392.5), rh: point(360, 371), rk: point(229, 395.5),
});
const pushSetup = change(pushTop, {
  head: point(510, 235), neck: point(490, 250), ls: point(438, 252), rs: point(456, 260),
  le: point(438, 326), re: point(456, 330), lh: point(308, 330), rh: point(326, 338),
  lk: point(195, 375), rk: point(212, 379),
});
const pushLand = change(pushSetup, { lk: point(260, 420), rk: point(280, 420) });
const gaze = (poses: readonly OwnedMotionPose[], x = 10, y = 6) => poses.map(() => point(x, y));
const balance = existing["parallette-balance-repeatable-variant"];
const balancePoses = balance.poses;
const onePoses = [support, tuck, oneLeft, oneLeft, tuck, support, tuck, oneRight, oneRight, tuck, support];
const straddlePoses = [support, tuck, straddle, straddle, tuck, support];
const vPoses = [support, lSit, vSit, vSit, lSit, support];
const pushPoses = [pushSetup, pushTop, pushBottom, pushTop, pushBottom, pushTop, pushBottom, pushTop, pushBottom, pushTop, pushSetup, pushLand];

/** Candidate ledger: no owner approval and no production manifest entry. */
export const batchAMotionGuides = {
  "parallette-balance-stable-variant": {
    poses: balancePoses, floor: balance.floor, equipment: balance.equipment,
    duration: 57, keyframeTimes: [0, 3/57, 23/57, 25/57, 27/57, 30/57, 33/57, 53/57, 55/57, 1],
    label: "Settle, balance for 20 seconds, then exit; show both sides", gaze: balance.gaze,
    playback: "one-way-reset", posterFrame: 2, auditFrames: { start: 0, middle: 2, end: 8 }, visuals: balance.visuals,
    phasePoseIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    camera: "Full-body front-oblique view; both bars, hands, feet and both clear landing paths remain visible.",
    phases: ["Entry", "Settle", "20-second balance", "Left side exit", "Land/reset", "Entry", "Settle", "20-second balance", "Right side exit", "Land"],
  },
  "one-leg-planche-hold": {
    poses: onePoses, floor: 420, equipment: ["parallettes"], duration: 26,
    keyframeTimes: [0, 2/26, 4/26, 9/26, 11/26, 13/26, 15/26, 17/26, 22/26, 24/26, 1],
    label: "Extend one leg, hold five seconds, return and land; show both sides", gaze: gaze(onePoses),
    playback: "one-way-reset", posterFrame: 2, auditFrames: { start: 0, middle: 2, end: 7 }, visuals: [],
    phasePoseIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    camera: "Full-body side-oblique view with both feet, both elbows and square pelvis visible; no wall or assistance marker.",
    phases: ["Support", "Tuck", "Extend first leg", "Five-second hold", "Tuck", "Land/reset", "Tuck", "Extend other leg", "Five-second hold", "Tuck", "Land"],
  },
  "straddle-planche-hold": {
    poses: straddlePoses, floor: 420, equipment: ["parallettes"], duration: 16,
    keyframeTimes: [0, 2/16, 4/16, 12/16, 14/16, 1],
    label: "Open a straight-knee straddle, hold eight seconds, return and land", gaze: gaze(straddlePoses),
    playback: "one-way-reset", posterFrame: 2, auditFrames: { start: 0, middle: 2, end: 5 },
    visuals: [{ kind: "landmark", x1: 90, y1: 254, x2: 510, y2: 254, label: "level trunk · oblique leg view" }],
    phasePoseIndexes: [0, 1, 2, 3, 4, 5], camera: "Side-oblique view with both straight legs separated visibly and a readable horizontal trunk; both bars remain visible.",
    phases: ["Support", "Tuck", "Open straddle", "Eight-second hold", "Tuck", "Land"],
  },
  "v-sit-hold": {
    poses: vPoses, floor: 420, equipment: ["parallettes"], duration: 16,
    keyframeTimes: [0, 2/16, 4/16, 12/16, 14/16, 1],
    label: "Raise straight legs past 60 degrees, hold eight seconds, lower under control", gaze: gaze(vPoses, -13, 1),
    playback: "one-way-reset", posterFrame: 2, auditFrames: { start: 0, middle: 2, end: 5 },
    visuals: [{ kind: "landmark", x1: 420, y1: 304, x2: 270, y2: 44, label: "60° above horizontal" }],
    phasePoseIndexes: [0, 1, 2, 3, 4, 5], camera: "Full-body side view; feet, locked knees, upright trunk, bars and the 60-degree landmark remain visible.",
    phases: ["Support", "L-sit", "Raise to V", "Eight-second hold", "Lower to L", "Land"],
  },
  "deep-forward-loaded-parallette-push-up": {
    poses: pushPoses, floor: 420, equipment: ["parallettes"], duration: 24,
    keyframeTimes: [0, 2/24, 5/24, 7/24, 10/24, 12/24, 15/24, 17/24, 20/24, 22/24, 23/24, 1],
    label: "Keep the marked lean; lower three seconds and press fully for four reps", gaze: gaze(pushPoses),
    playback: "one-way-reset", posterFrame: 2, auditFrames: { start: 1, middle: 2, end: 9 },
    visuals: [
      { kind: "landmark", x1: 438, y1: 292, x2: 478, y2: 292, label: "one hand-length" },
      { kind: "landmark", x1: 516, y1: 220, x2: 516, y2: 400, label: "keep shoulder lead" },
      { kind: "landmark", x1: 70, y1: 420, x2: 112, y2: 420, label: "fixed toe mark" },
    ],
    phasePoseIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11], camera: "Full-body side view showing grip, shoulder lead, elbow-height bottom, straight trunk and fixed grounded toes.",
    phases: ["Set toe marks", "Lean", "Lower 3s", "Press", "Lower 3s", "Press", "Lower 3s", "Press", "Lower 3s", "Press", "Kneel/reset"],
  },
} as const satisfies Readonly<Record<string, Guide>>;

export type BatchAMotionReference = keyof typeof batchAMotionGuides;
