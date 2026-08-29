import { phase7MediaRequirements } from "../definitions/phase7Media";

export type OwnedMotionPoint = Readonly<{ x: number; y: number }>;
export type OwnedMotionJoint =
  | "head" | "neck"
  | "ls" | "le" | "lw" | "rs" | "re" | "rw"
  | "lh" | "lk" | "la" | "rh" | "rk" | "ra";
export type OwnedMotionPose = Readonly<Record<OwnedMotionJoint, OwnedMotionPoint>>;
export type OwnedMotionEquipment = "wall" | "left-wall" | "parallettes";
export type OwnedMotionVisual =
  | Readonly<{ kind: "pad"; x: number; y: number; width: number; height: number; label: string }>
  | Readonly<{ kind: "landmark"; x1: number; y1: number; x2: number; y2: number; label: string }>
  | Readonly<{
    kind: "assistance";
    joint: "la" | "ra" | "lh" | "rh";
    anchor: OwnedMotionPoint;
    label: string;
    contactOnly?: boolean;
    activePoseIndexes?: readonly number[];
  }>
  | Readonly<{ kind: "landing"; x: number; y: number; width: number; label: string }>
  | Readonly<{ kind: "direction"; points: readonly OwnedMotionPoint[]; label: string }>;

export type Phase10OwnedMotionGuide = Readonly<{
  reference: OwnedMotionReference;
  poses: readonly OwnedMotionPose[];
  floor: number;
  /** Handle contact plane when taller bars create usable deficit below the wrists. */
  barTop?: number;
  equipment: readonly OwnedMotionEquipment[];
  paralletteView?: "side" | "front-oblique";
  duration: number;
  keyframeTimes?: readonly number[];
  posterFrame?: number;
  label: string;
  gaze: readonly OwnedMotionPoint[];
  static?: boolean;
  handLink?: boolean;
  playback: "loop" | "one-way-reset";
  phasePoseIndexes: readonly number[];
  auditFrames: Readonly<{ start: number; middle: number; end: number }>;
  visuals: readonly OwnedMotionVisual[];
  assetFingerprint: string;
}>;

export type OwnedMotionReference =
  | "parallette-tuck-planche-hold"
  | "advanced-tuck-planche-hold"
  | "assisted-one-leg-planche-hold"
  | "assisted-straddle-planche-hold"
  | "straddle-l-sit-hold"
  | "high-l-sit-hold"
  | "assisted-v-sit-hold"
  | "partial-v-sit-hold"
  | "floor-balance-repeatable-variant"
  | "parallette-balance-repeatable-variant"
  | "freestanding-parallette-tuck-shape-change"
  | "elevated-parallette-pike-push-up"
  | "wall-hspu-bottom-position-exit"
  | "wall-hspu-eccentric"
  | "assisted-wall-hspu-concentric"
  | "partial-wall-hspu"
  | "parallette-wall-hspu"
  | "deficit-wall-hspu-bottom-position-exit"
  | "deficit-wall-hspu"
  | "feet-assisted-tuck-press-load"
  | "assisted-bent-arm-tuck-press"
  | "assisted-straddle-press-wall-handstand"
  | "wall-handstand-straddle-lower"
  | "assisted-pike-press-to-handstand"
  | "pike-press-negative"
  | "deficit-parallette-push-up"
  | "l-sit-to-tuck-planche-transition"
  | "tuck-planche-to-l-sit-transition";

const p = (x: number, y: number): OwnedMotionPoint => ({ x, y });
const pose = (base: OwnedMotionPose, changes: Partial<Record<OwnedMotionJoint, OwnedMotionPoint>>): OwnedMotionPose => ({
  ...base,
  ...changes,
});
const gaze = (poses: readonly OwnedMotionPose[], value = p(10, 6)) => poses.map(() => value);
const gazeRight = p(10, 6);
const gazeLeft = p(-13, 1);
const gazeFloorForward = p(9, 8);
const gazeFloor = p(0, 12);

const mirrorSidePose = (base: OwnedMotionPose, axisX = 445): OwnedMotionPose => {
  const mirror = (point: OwnedMotionPoint) => p(axisX * 2 - point.x, point.y);
  return {
    head: mirror(base.head), neck: mirror(base.neck),
    ls: mirror(base.rs), le: mirror(base.re), lw: mirror(base.rw),
    rs: mirror(base.ls), re: mirror(base.le), rw: mirror(base.lw),
    lh: mirror(base.rh), lk: mirror(base.rk), la: mirror(base.ra),
    rh: mirror(base.lh), rk: mirror(base.lk), ra: mirror(base.la),
  };
};

const support: OwnedMotionPose = {
  head: p(430, 145), neck: p(426, 188),
  ls: p(408, 222), le: p(421, 310), lw: p(434, 400),
  rs: p(438, 224), re: p(447, 311), rw: p(456, 400),
  lh: p(348, 306), lk: p(260, 354), la: p(174, 400),
  rh: p(366, 312), rk: p(280, 362), ra: p(194, 400),
};
const tallSupport = pose(support, {
  head: p(442, 130), neck: p(436, 174), ls: p(414, 208), rs: p(444, 210),
  lh: p(408, 294), rh: p(426, 302),
});
const lean = pose(tallSupport, {
  head: p(514, 178), neck: p(480, 204), ls: p(452, 230), rs: p(470, 234),
  le: p(444, 314), re: p(462, 316), lh: p(330, 276), rh: p(344, 286),
});
const tuckPlanche = pose(lean, {
  lh: p(344, 238), lk: p(382, 270), la: p(354, 326),
  rh: p(360, 246), rk: p(402, 280), ra: p(374, 334),
});
const advancedTuck = pose(tuckPlanche, {
  head: p(520, 184), neck: p(486, 208), lh: p(330, 246), rh: p(346, 254),
  lk: p(270, 254), rk: p(286, 266), la: p(220, 284), ra: p(236, 296),
});
const lSit = pose(tallSupport, {
  head: p(426, 140), neck: p(440, 184),
  ls: p(432, 208), rs: p(458, 210),
  lh: p(420, 304), lk: p(280, 300), la: p(112, 298),
  rh: p(436, 312), rk: p(294, 310), ra: p(126, 308),
});
const highLSit = pose(lSit, {
  lh: p(420, 294), rh: p(436, 302), lk: p(296, 250), rk: p(310, 260),
  la: p(158, 208), ra: p(172, 218),
});
const partialVSit = pose(highLSit, {
  lk: p(310, 214), rk: p(324, 224), la: p(206, 132), ra: p(220, 142),
});
const frontTallSupport: OwnedMotionPose = {
  head: p(320, 136), neck: p(320, 180),
  ls: p(288, 214), le: p(278, 304), lw: p(270, 400),
  rs: p(352, 214), re: p(362, 304), rw: p(370, 400),
  lh: p(304, 302), lk: p(244, 362), la: p(190, 420),
  rh: p(336, 302), rk: p(396, 362), ra: p(450, 420),
};
const frontGroundedStraddle = pose(frontTallSupport, {
  lh: p(304, 302), lk: p(206, 354), la: p(82, 420),
  rh: p(336, 302), rk: p(434, 354), ra: p(558, 420),
});
const frontStraddleLSit = pose(frontTallSupport, {
  lh: p(304, 302), lk: p(204, 304), la: p(82, 300),
  rh: p(336, 302), rk: p(436, 304), ra: p(558, 300),
});
const pikeStart: OwnedMotionPose = {
  head: p(476, 236), neck: p(446, 256),
  ls: p(420, 270), le: p(430, 334), lw: p(438, 400),
  rs: p(438, 276), re: p(447, 337), rw: p(456, 400),
  lh: p(282, 158), lk: p(186, 278), la: p(86, 400),
  rh: p(300, 166), rk: p(204, 286), ra: p(106, 400),
};
const wallHandstand: OwnedMotionPose = {
  head: p(468, 338), neck: p(468, 309),
  ls: p(449, 286), le: p(442, 342), lw: p(438, 400),
  rs: p(472, 286), re: p(463, 343), rw: p(456, 400),
  lh: p(482, 188), lk: p(518, 116), la: p(558, 50),
  rh: p(498, 190), rk: p(530, 118), ra: p(558, 58),
};
const freeHandstand = pose(wallHandstand, {
  lh: p(460, 186), rh: p(478, 188), lk: p(462, 112), rk: p(480, 114),
  la: p(460, 38), ra: p(478, 40),
});
const kickup: OwnedMotionPose = {
  head: p(478, 244), neck: p(448, 264),
  ls: p(420, 280), le: p(430, 340), lw: p(438, 400),
  rs: p(438, 286), re: p(448, 344), rw: p(456, 400),
  lh: p(304, 256), lk: p(210, 328), la: p(112, 400),
  rh: p(324, 264), rk: p(390, 180), ra: p(448, 92),
};
const invertedL = pose(wallHandstand, {
  lh: p(474, 185), lk: p(520, 212), la: p(558, 220),
  rh: p(490, 194), rk: p(530, 221), ra: p(558, 228),
});
const kneelExit = pose(pikeStart, {
  head: p(472, 252), neck: p(438, 274), ls: p(414, 292), rs: p(434, 298),
  lh: p(350, 332), rh: p(368, 342), lk: p(342, 400), rk: p(376, 406),
  la: p(284, 408), ra: p(316, 414),
});
const hspuHalf = pose(wallHandstand, {
  head: p(482, 358), neck: p(478, 330), ls: p(452, 314), rs: p(476, 314),
  le: p(414, 354), re: p(506, 356), lh: p(486, 214), rh: p(502, 216),
});
const hspuBottom = pose(wallHandstand, {
  head: p(482, 374), neck: p(478, 348), ls: p(448, 338), rs: p(478, 338),
  le: p(404, 354), re: p(520, 356), lh: p(492, 244), rh: p(508, 246),
  lk: p(528, 146), rk: p(540, 150),
});
const hspuDeficitBottom = pose(hspuBottom, {
  head: p(482, 402), neck: p(478, 374), ls: p(446, 362), rs: p(480, 362),
  le: p(398, 370), re: p(526, 372), lh: p(496, 262), rh: p(512, 264),
});
const sideExitLeft = pose(freeHandstand, {
  lh: p(414, 214), lk: p(340, 292), la: p(270, 400),
  rh: p(458, 198), rk: p(514, 286), ra: p(548, 400),
});
const sideExitRight = pose(freeHandstand, {
  lh: p(474, 198), lk: p(526, 286), la: p(560, 400),
  rh: p(520, 214), rk: p(350, 292), ra: p(282, 400),
});

const visual = {
  standardPad: { kind: "pad", x: 455, y: 403, width: 55, height: 11, label: "standard depth" } as const,
  deficitPad: { kind: "pad", x: 452, y: 432, width: 60, height: 11, label: "deficit depth" } as const,
  partialDepth: { kind: "landmark", x1: 394, y1: 350, x2: 530, y2: 350, label: "partial depth" } as const,
  horizontal: { kind: "landmark", x1: 82, y1: 298, x2: 348, y2: 298, label: "horizontal" } as const,
  straddleHorizontal: { kind: "landmark", x1: 82, y1: 300, x2: 558, y2: 300, label: "both heels clear" } as const,
  vTarget: { kind: "landmark", x1: 150, y1: 132, x2: 346, y2: 298, label: "partial V target" } as const,
  barTop: { kind: "landmark", x1: 382, y1: 400, x2: 516, y2: 400, label: "bar-top plane" } as const,
  landing: { kind: "landing", x: 250, y: 407, width: 325, label: "clear landing" } as const,
  deficitLanding: { kind: "landing", x: 250, y: 435, width: 325, label: "clear deficit landing" } as const,
};

export const phase10OwnedMotionFingerprints: Readonly<Record<OwnedMotionReference, string>> = {
  "parallette-tuck-planche-hold": "f744d5991305ffce2f450438011e8a163431c8b4d2864cd8e065cfe80f2e121e",
  "advanced-tuck-planche-hold": "c8cfc172c99682df505ee133b9ff2a76e59b77e9d2ce14063d373dfd9b00f84b",
  "assisted-one-leg-planche-hold": "edeb7b19425029875b0124f6db43216874891b930ac73dd6e7c2b761b5ba82aa",
  "assisted-straddle-planche-hold": "c70653201ae21f67ea18d45fb03a47429af15532d6ace2885f92133fda394d5d",
  "straddle-l-sit-hold": "668ca347eea4636b262174386c7da7ab37a7582944666b57c50c0eae80457982",
  "high-l-sit-hold": "5151f000cadc58330c132d5844cf83645240113b85e9a2ac21ebd95d630571af",
  "assisted-v-sit-hold": "bb8c9fb113232874ad337b8391e71465e43fbb1b6a0ed1c941e2713b8cca15c7",
  "partial-v-sit-hold": "7b1e87191f1bc67401a03e5cbef89f3e99bca9383ab0a55019f61237bc31b8b6",
  "floor-balance-repeatable-variant": "b404912f45b8274e1b8970f91c7ffa9e21e63484045d3f893a99d4da1754c90c",
  "parallette-balance-repeatable-variant": "a1c4577dc35920a7c6c9570fd506c06eea9e68579c8aa10435bf017fd03af2fd",
  "freestanding-parallette-tuck-shape-change": "f0b6c985cfe2e14e28dc036381d527c0a08ae2861a8a3de6a1cdd195cbf2ced4",
  "elevated-parallette-pike-push-up": "64565d50ddc27be3e80c01bf7779900cbe07c562f0eed1a2728944efa8399d5e",
  "wall-hspu-bottom-position-exit": "db99810e25fa3e513966e26e72023392b4364f9378c5c5da06c7e3600e732b17",
  "wall-hspu-eccentric": "ab7df195dfa3f4c0d4b2cd6a9292a73205bd4e8f6675c2bcc065f7c5227158a3",
  "assisted-wall-hspu-concentric": "72acf22551f640d68de61b373e7e3ed0937c5b27d8b06e99067dcac009123b3c",
  "partial-wall-hspu": "9d1179a2e3b40c93dc14391cdfacd5f1d4ab9179af74c81ca4fa8fdca07d146f",
  "parallette-wall-hspu": "7f19f0e655c029e4b13d2702ee4e9c77bc18e27c2e47cd3ae551923aff76111f",
  "deficit-wall-hspu-bottom-position-exit": "4b06e81c617b1ba15a17aa51042e73ab776cd9fc40b9b1fdd0d321d3230d290e",
  "deficit-wall-hspu": "d9ee40fec9f20ed55916db4d332423124bffbf05bf5353bb7d4513fd654cfa77",
  "feet-assisted-tuck-press-load": "d7505f01909eb660a3f1d2ddb569136e109d865e0d6ea4eb25ef08e9766ad1d8",
  "assisted-bent-arm-tuck-press": "84131e4eb17c567c043df17ebf36f64f1f2e0dd72ee420c57ebf7274412ae40c",
  "assisted-straddle-press-wall-handstand": "75bbf95a7adc41fe71d93ebd123a411364e5fa99d07b555e423af47141badb23",
  "wall-handstand-straddle-lower": "172d73114541407e0c0f1da864fe38e4f8206f2116e7e5acb8a5dabc89b11fb3",
  "assisted-pike-press-to-handstand": "a948d7e76d0f622a3d176ecf39e405aa2a1f2597c4b7c470018b88e22b5f4cf7",
  "pike-press-negative": "2c1398e4ee0f6116933925f5c3c39c5cd2306673f7e70e15f8491baf9b89b555",
  "deficit-parallette-push-up": "3661bcc92b8a1197f8c943b5e082bfe27cfd9f6202723313bd2390079c5db258",
  "l-sit-to-tuck-planche-transition": "2b384e0b704abac13d980a6fec9fb323f72f8b64588145e50b96db96d2236c30",
  "tuck-planche-to-l-sit-transition": "76772754d702dbc1075f0165a1da03c1497581142bb3e2ba01b42f0af7bdb4bf",
};

type GuideInput = Omit<Phase10OwnedMotionGuide,
  "reference" | "gaze" | "assetFingerprint" | "phasePoseIndexes" | "auditFrames">
  & Readonly<{
    phasePoseIndexes: readonly number[];
    auditFrames?: Readonly<{ start: number; middle: number; end: number }>;
    gaze?: readonly OwnedMotionPoint[];
  }>;

const makeGuide = (reference: OwnedMotionReference, input: GuideInput): Phase10OwnedMotionGuide => {
  const requirement = phase7MediaRequirements.find((item) => item.reference === reference);
  if (!requirement) throw new Error(`Unknown owned-motion brief ${reference}`);
  if (input.phasePoseIndexes.length !== requirement.movementPhases.length) {
    throw new Error(`${reference}: every movement phase needs a reviewable pose`);
  }
  const last = input.poses.length - 1;
  return {
    reference,
    ...input,
    gaze: input.gaze ?? gaze(input.poses),
    auditFrames: input.auditFrames ?? { start: 0, middle: Math.floor(last / 2), end: last },
    assetFingerprint: phase10OwnedMotionFingerprints[reference],
  };
};

const oneLegLeft = pose(advancedTuck, {
  lh: p(326, 244), lk: p(220, 248), la: p(82, 252),
});
const oneLegRight = pose(advancedTuck, {
  rh: p(342, 254), rk: p(236, 252), ra: p(82, 252),
});
const straddlePlanche = pose(advancedTuck, {
  lh: p(326, 246), lk: p(228, 216), la: p(82, 252),
  rh: p(342, 260), rk: p(236, 290), ra: p(82, 252),
});
const assistedVSit = pose(partialVSit, {
  lk: p(250, 194), rk: p(264, 202), la: p(82, 104), ra: p(82, 104),
});
const leftTuckPlanche = mirrorSidePose(tuckPlanche);
const leftTransitionTuck = pose(tallSupport, {
  head: p(394, 148), neck: p(410, 184), ls: p(414, 210), rs: p(442, 212),
  lh: p(414, 280), lk: p(468, 276), la: p(526, 302),
  rh: p(432, 288), rk: p(484, 286), ra: p(542, 314),
});
const leftPlancheToeLanding = pose(leftTuckPlanche, {
  lh: p(476, 300), lk: p(500, 352), la: p(516, 400),
  rh: p(492, 308), rk: p(516, 360), ra: p(536, 400),
});
const tuckHandstand = pose(freeHandstand, {
  lh: p(440, 190), rh: p(458, 194), lk: p(396, 218), rk: p(414, 226),
  la: p(422, 278), ra: p(440, 284),
});
const elevatedPike = pose(pikeStart, {
  lh: p(390, 174), rh: p(406, 182), lk: p(488, 212), rk: p(502, 220),
  la: p(558, 230), ra: p(558, 244),
});
const elevatedPikeBottom = pose(elevatedPike, {
  head: p(486, 374), neck: p(466, 342), ls: p(430, 328), rs: p(458, 332),
  le: p(398, 348), re: p(510, 350), lh: p(408, 184), rh: p(424, 192),
});
const hspuAssistedBottom = pose(hspuBottom, {
  lk: p(528, 158), rk: p(540, 162), la: p(558, 82), ra: p(558, 94),
});
const hspuAssistedHalf = pose(hspuHalf, {
  lk: p(522, 132), rk: p(536, 136), la: p(558, 66), ra: p(558, 78),
});
const toeTuckPress = pose(tuckPlanche, {
  lh: p(338, 286), rh: p(354, 294), lk: p(318, 344), rk: p(334, 352),
  la: p(286, 400), ra: p(306, 400),
});
const tuckPressLoad = pose(toeTuckPress, {
  head: p(480, 214), neck: p(454, 234), ls: p(436, 252), rs: p(454, 258),
  lh: p(370, 238), rh: p(386, 246), lk: p(344, 300), rk: p(360, 308),
  la: p(306, 400), ra: p(326, 400),
});
const bentArmTuck = pose(tuckPressLoad, {
  head: p(470, 310), neck: p(458, 286), ls: p(430, 278), rs: p(462, 282),
  le: p(404, 338), re: p(502, 340), lh: p(432, 206), rh: p(450, 212),
  lk: p(398, 170), rk: p(416, 176), la: p(420, 124), ra: p(438, 130),
});
const straddleStart = pose(pikeStart, {
  lh: p(282, 164), lk: p(188, 266), la: p(82, 400),
  rh: p(314, 176), rk: p(390, 286), ra: p(520, 400),
});
const straddleAssistedLoad = pose(straddleStart, {
  head: p(488, 256), neck: p(458, 274), ls: p(430, 266), rs: p(458, 272),
  lh: p(356, 202), lk: p(216, 286), la: p(82, 400),
  rh: p(382, 212), rk: p(432, 300), ra: p(520, 400),
});
const straddlePressMid = pose(straddleStart, {
  head: p(476, 300), neck: p(462, 270), ls: p(432, 260), rs: p(462, 266),
  lh: p(430, 196), lk: p(334, 154), la: p(222, 112),
  rh: p(450, 204), rk: p(492, 166), ra: p(520, 126),
});
const wallStraddle = pose(wallHandstand, {
  lh: p(468, 186), lk: p(398, 140), la: p(310, 92),
  rh: p(492, 190), rk: p(526, 128), ra: p(558, 70),
});
const pikePressMid = pose(pikeStart, {
  head: p(476, 304), neck: p(462, 274), ls: p(434, 260), rs: p(464, 266),
  lh: p(430, 190), rh: p(448, 198), lk: p(350, 152), rk: p(368, 160),
  la: p(270, 116), ra: p(288, 124),
});
const pikeAssistedLoad = pose(pikeStart, {
  head: p(492, 252), neck: p(462, 270), ls: p(434, 266), rs: p(462, 272),
  lh: p(374, 196), rh: p(392, 204), lk: p(246, 286), rk: p(264, 294),
  la: p(86, 400), ra: p(106, 400),
});
const pushTop: OwnedMotionPose = {
  head: p(520, 224), neck: p(484, 242),
  ls: p(448, 258), le: p(442, 326), lw: p(434, 400),
  rs: p(466, 264), re: p(462, 330), rw: p(456, 400),
  lh: p(306, 294), lk: p(198, 340), la: p(82, 400),
  rh: p(320, 302), rk: p(212, 350), ra: p(102, 404),
};
const deficitPushTop = pose(pushTop, {
  head: p(520, 240), neck: p(484, 258), ls: p(448, 274), rs: p(466, 280),
  lh: p(306, 350), rh: p(320, 358), lk: p(198, 400), rk: p(212, 408),
  la: p(82, 448), ra: p(102, 448),
});
const deficitPushBottom = pose(deficitPushTop, {
  head: p(524, 410), neck: p(486, 416), ls: p(446, 408), rs: p(468, 414),
  le: p(394, 386), re: p(516, 390), lh: p(310, 398), rh: p(324, 406),
  lk: p(202, 422), rk: p(216, 430),
});
const deficitKneelExit = pose(kneelExit, {
  head: p(472, 270), neck: p(438, 292), ls: p(414, 310), rs: p(434, 316),
  lh: p(350, 354), rh: p(368, 364), lk: p(342, 438), rk: p(376, 442),
  la: p(284, 448), ra: p(316, 448),
});
const deficitSideExitLeft = pose(sideExitLeft, {
  lh: p(414, 232), lk: p(340, 320), la: p(270, 448),
  rh: p(458, 216), rk: p(514, 314), ra: p(548, 448),
});

export const phase10OwnedMotionGuides = {
  "parallette-tuck-planche-hold": makeGuide("parallette-tuck-planche-hold", {
    poses: [tallSupport, lean, tuckPlanche, tuckPlanche, lean, tallSupport], floor: 420,
    equipment: ["parallettes"], duration: 12, keyframeTimes: [0, .1, .16, .84, .92, 1], playback: "loop",
    label: "Lean with locked elbows, float a clean tuck, hold, then replace both toes",
    phasePoseIndexes: [0, 1, 2, 3, 5], auditFrames: { start: 0, middle: 2, end: 5 }, visuals: [],
  }),
  "advanced-tuck-planche-hold": makeGuide("advanced-tuck-planche-hold", {
    poses: [tuckPlanche, advancedTuck, advancedTuck, tuckPlanche], floor: 420,
    equipment: ["parallettes"], duration: 10, keyframeTimes: [0, .15, .75, 1], playback: "loop",
    label: "Open the tuck without dropping the hips; keep protraction and locked elbows",
    phasePoseIndexes: [0, 1, 2, 3], visuals: [],
  }),
  "assisted-one-leg-planche-hold": makeGuide("assisted-one-leg-planche-hold", {
    poses: [advancedTuck, oneLegLeft, oneLegLeft, advancedTuck, oneLegRight, oneLegRight, advancedTuck], floor: 420,
    equipment: ["parallettes", "left-wall"], duration: 18, keyframeTimes: [0, .06, .4, .46, .52, .86, 1], playback: "loop",
    label: "Use the marked light toe contact; square the pelvis and demonstrate both legs",
    phasePoseIndexes: [0, 0, 1, 1, 2, 5], auditFrames: { start: 0, middle: 2, end: 5 },
    visuals: [
      { kind: "landmark", x1: 80, y1: 390, x2: 434, y2: 390, label: "reviewed bar-to-wall distance" },
      { kind: "assistance", joint: "la", anchor: p(82, 252), label: "left toe contact", contactOnly: true, activePoseIndexes: [1, 2] },
      { kind: "assistance", joint: "ra", anchor: p(82, 252), label: "right toe contact", contactOnly: true, activePoseIndexes: [4, 5] },
    ],
  }),
  "assisted-straddle-planche-hold": makeGuide("assisted-straddle-planche-hold", {
    poses: [advancedTuck, lean, straddlePlanche, straddlePlanche, advancedTuck], floor: 420,
    equipment: ["parallettes", "left-wall"], duration: 12, keyframeTimes: [0, .12, .28, .78, 1], playback: "loop",
    label: "Open a symmetric assisted straddle without losing the shoulder position",
    phasePoseIndexes: [0, 0, 1, 2, 3, 4],
    visuals: [
      { kind: "landmark", x1: 80, y1: 390, x2: 434, y2: 390, label: "reviewed bar-to-wall distance" },
      { kind: "landmark", x1: 64, y1: 252, x2: 116, y2: 252, label: "one equal-height toe mark" },
      { kind: "assistance", joint: "la", anchor: p(94, 232), label: "left toe contact", contactOnly: true, activePoseIndexes: [2, 3] },
      { kind: "assistance", joint: "ra", anchor: p(94, 292), label: "right toe contact", contactOnly: true, activePoseIndexes: [2, 3] },
    ],
  }),
  "straddle-l-sit-hold": makeGuide("straddle-l-sit-hold", {
    poses: [frontTallSupport, frontGroundedStraddle, frontStraddleLSit, frontStraddleLSit, frontGroundedStraddle, frontTallSupport], floor: 420,
    equipment: ["parallettes"], paralletteView: "front-oblique", duration: 14, keyframeTimes: [0, .08, .2, .8, .92, 1], playback: "loop",
    label: "Lift both straight straddled legs clear while pressing tall",
    phasePoseIndexes: [0, 1, 2, 3, 4], auditFrames: { start: 0, middle: 2, end: 4 },
    gaze: gaze([frontTallSupport, frontGroundedStraddle, frontStraddleLSit, frontStraddleLSit, frontGroundedStraddle, frontTallSupport], p(-8, 3)),
    visuals: [visual.straddleHorizontal],
  }),
  "high-l-sit-hold": makeGuide("high-l-sit-hold", {
    poses: [lSit, highLSit, highLSit, lSit], floor: 420,
    equipment: ["parallettes"], duration: 12, keyframeTimes: [0, .2, .75, 1], playback: "loop",
    label: "Compress straight legs above horizontal without leaning back",
    phasePoseIndexes: [0, 1, 2, 3], gaze: gaze([lSit, highLSit, highLSit, lSit], gazeLeft),
    visuals: [visual.horizontal],
  }),
  "assisted-v-sit-hold": makeGuide("assisted-v-sit-hold", {
    poses: [tallSupport, highLSit, assistedVSit, assistedVSit, highLSit, tallSupport], floor: 420,
    equipment: ["parallettes", "left-wall"], duration: 12, keyframeTimes: [0, .12, .25, .75, .88, 1], playback: "loop",
    label: "Use the same light assistance to reach the marked V height with straight knees",
    phasePoseIndexes: [0, 0, 2, 2, 3, 5], auditFrames: { start: 0, middle: 2, end: 5 },
    gaze: gaze([tallSupport, highLSit, assistedVSit, assistedVSit, highLSit, tallSupport], gazeLeft),
    visuals: [
      visual.vTarget,
      { kind: "landmark", x1: 82, y1: 390, x2: 434, y2: 390, label: "reviewed bar-to-wall distance" },
      { kind: "landmark", x1: 64, y1: 104, x2: 116, y2: 104, label: "one fixed heel-height mark" },
      { kind: "assistance", joint: "la", anchor: p(94, 84), label: "left heel contact", contactOnly: true, activePoseIndexes: [2, 3] },
      { kind: "assistance", joint: "ra", anchor: p(94, 144), label: "right heel contact", contactOnly: true, activePoseIndexes: [2, 3] },
    ],
  }),
  "partial-v-sit-hold": makeGuide("partial-v-sit-hold", {
    poses: [tallSupport, lSit, highLSit, partialVSit, partialVSit, highLSit, lSit, tallSupport], floor: 420,
    equipment: ["parallettes"], duration: 12, keyframeTimes: [0, .08, .18, .3, .75, .85, .93, 1], playback: "loop",
    label: "Own the unassisted partial-V angle, then return under control",
    phasePoseIndexes: [0, 3, 4, 7], auditFrames: { start: 0, middle: 3, end: 7 },
    gaze: gaze([tallSupport, lSit, highLSit, partialVSit, partialVSit, highLSit, lSit, tallSupport], gazeLeft),
    visuals: [visual.vTarget],
  }),
  "floor-balance-repeatable-variant": makeGuide("floor-balance-repeatable-variant", {
    poses: [kickup, freeHandstand, pose(freeHandstand, { la: p(450, 42), ra: p(470, 36) }), sideExitLeft, kneelExit],
    floor: 420, equipment: [], duration: 10.5, keyframeTimes: [0, .15, .65, .82, 1], playback: "one-way-reset",
    label: "Enter calmly, balance independently, then choose the planned side exit",
    phasePoseIndexes: [0, 1, 2, 3], auditFrames: { start: 0, middle: 2, end: 3 },
    gaze: [gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward], visuals: [visual.landing],
  }),
  "parallette-balance-repeatable-variant": makeGuide("parallette-balance-repeatable-variant", {
    poses: [kickup, freeHandstand, pose(freeHandstand, { la: p(452, 40), ra: p(472, 36) }), sideExitLeft, kneelExit,
      kickup, freeHandstand, pose(freeHandstand, { la: p(468, 36), ra: p(488, 42) }), sideExitRight, kneelExit],
    floor: 420, equipment: ["parallettes"], duration: 22, keyframeTimes: [0, .05, .3, .36, .43, .5, .55, .8, .86, 1], playback: "one-way-reset",
    label: "Balance separately from entry; reset and demonstrate both side exits",
    phasePoseIndexes: [0, 1, 2, 3, 8], auditFrames: { start: 0, middle: 2, end: 8 },
    gaze: [gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward],
    visuals: [visual.landing],
  }),
  "freestanding-parallette-tuck-shape-change": makeGuide("freestanding-parallette-tuck-shape-change", {
    poses: [freeHandstand, freeHandstand, tuckHandstand, freeHandstand, sideExitLeft, kneelExit],
    floor: 420, equipment: ["parallettes"], duration: 10, keyframeTimes: [0, .2, .42, .65, .82, 1], playback: "one-way-reset",
    label: "Settle the straight line, tuck symmetrically, recover the line, then exit",
    phasePoseIndexes: [0, 1, 2, 3, 4], auditFrames: { start: 0, middle: 2, end: 4 },
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward], visuals: [visual.landing],
  }),
  "elevated-parallette-pike-push-up": makeGuide("elevated-parallette-pike-push-up", {
    poses: [elevatedPike, elevatedPike, elevatedPikeBottom, elevatedPike], floor: 420,
    equipment: ["parallettes", "wall"], duration: 6, keyframeTimes: [0, .15, .6, 1], playback: "loop",
    label: "Keep hips high; lower the crown forward between the bars and press tall",
    phasePoseIndexes: [0, 0, 2, 3], auditFrames: { start: 0, middle: 2, end: 3 },
    gaze: gaze([elevatedPike, elevatedPike, elevatedPikeBottom, elevatedPike], gazeFloorForward),
    visuals: [visual.standardPad, { kind: "direction", points: [p(478, 300), p(486, 374)], label: "forward-and-down head path" }],
  }),
  "wall-hspu-bottom-position-exit": makeGuide("wall-hspu-bottom-position-exit", {
    poses: [kneelExit, invertedL, hspuBottom, invertedL, pose(kneelExit, { lk: p(330, 400), la: p(266, 410) }), kneelExit],
    floor: 420, equipment: ["parallettes", "wall"], duration: 10, playback: "one-way-reset",
    label: "Stage the bottom with foot support; slide to inverted-L and lower both knees outside",
    phasePoseIndexes: [0, 2, 3, 4, 5],
    gaze: [gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward, gazeFloorForward],
    visuals: [visual.standardPad, visual.landing],
  }),
  "wall-hspu-eccentric": makeGuide("wall-hspu-eccentric", {
    poses: [wallHandstand, hspuHalf, hspuBottom, invertedL, kneelExit], floor: 420,
    equipment: ["parallettes", "wall"], duration: 9, keyframeTimes: [0, .24, .58, .74, 1], playback: "one-way-reset",
    label: "Lower for four seconds to standard depth; do not reverse—use the trained exit",
    phasePoseIndexes: [0, 1, 2, 4], auditFrames: { start: 0, middle: 2, end: 4 },
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward],
    visuals: [visual.standardPad, { kind: "direction", points: [p(480, 320), p(482, 374)], label: "4+ second eccentric" }],
  }),
  "assisted-wall-hspu-concentric": makeGuide("assisted-wall-hspu-concentric", {
    poses: [hspuAssistedBottom, hspuAssistedHalf, wallHandstand, invertedL, kneelExit], floor: 420,
    equipment: ["parallettes", "wall"], duration: 8, keyframeTimes: [0, .28, .55, .72, 1], playback: "one-way-reset",
    label: "From the exact bottom, keep assistance visible and press smoothly to lockout",
    phasePoseIndexes: [0, 0, 2, 4],
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward],
    visuals: [visual.standardPad, {
      kind: "assistance", joint: "la", anchor: p(518, 112), label: "light wall-foot slide",
      contactOnly: true, activePoseIndexes: [0, 1, 2],
    }],
  }),
  "partial-wall-hspu": makeGuide("partial-wall-hspu", {
    poses: [wallHandstand, hspuHalf, wallHandstand, sideExitLeft], floor: 420,
    equipment: ["parallettes", "wall"], duration: 7, playback: "loop",
    label: "Touch the same partial-depth landmark and return to active lockout",
    phasePoseIndexes: [0, 1, 2, 3], gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloor], visuals: [visual.partialDepth],
  }),
  "parallette-wall-hspu": makeGuide("parallette-wall-hspu", {
    poses: [wallHandstand, hspuHalf, hspuBottom, hspuHalf, wallHandstand, sideExitLeft], floor: 420,
    equipment: ["parallettes", "wall"], duration: 8.5, playback: "loop",
    label: "Use the full standard range without crown loading, then exit safely",
    phasePoseIndexes: [0, 2, 4, 4, 5],
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloor],
    visuals: [visual.standardPad, visual.barTop],
  }),
  "deficit-wall-hspu-bottom-position-exit": makeGuide("deficit-wall-hspu-bottom-position-exit", {
    poses: [deficitKneelExit, invertedL, hspuDeficitBottom, invertedL, pose(deficitKneelExit, { lk: p(330, 438), la: p(266, 448) }), deficitKneelExit],
    floor: 448, barTop: 400, equipment: ["parallettes", "wall"], duration: 10, playback: "one-way-reset",
    label: "Stage the deeper bottom with foot support; use the complete deficit bailout",
    phasePoseIndexes: [0, 2, 3, 5],
    gaze: [gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward, gazeFloorForward],
    visuals: [visual.deficitPad, visual.barTop, visual.deficitLanding],
  }),
  "deficit-wall-hspu": makeGuide("deficit-wall-hspu", {
    poses: [wallHandstand, hspuHalf, hspuDeficitBottom, hspuHalf, wallHandstand, deficitSideExitLeft],
    floor: 448, barTop: 400, equipment: ["parallettes", "wall"], duration: 9, playback: "loop",
    label: "Lower below bar height to the reviewed deficit target and press to lockout",
    phasePoseIndexes: [0, 2, 4, 5],
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloor],
    visuals: [visual.deficitPad, visual.barTop, visual.deficitLanding],
  }),
  "feet-assisted-tuck-press-load": makeGuide("feet-assisted-tuck-press-load", {
    poses: [toeTuckPress, tuckPressLoad, tuckPressLoad, toeTuckPress], floor: 420,
    equipment: ["parallettes"], duration: 7, keyframeTimes: [0, .3, .7, 1], playback: "loop",
    label: "Keep both feet assisting as the hips lead through straight active arms",
    phasePoseIndexes: [0, 1, 2, 3], gaze: gaze([toeTuckPress, tuckPressLoad, tuckPressLoad, toeTuckPress], gazeRight),
    visuals: [
      { kind: "assistance", joint: "la", anchor: p(286, 400), label: "left toe stays assisted", contactOnly: true },
      { kind: "assistance", joint: "ra", anchor: p(306, 400), label: "right toe stays assisted", contactOnly: true },
      { kind: "direction", points: [p(350, 300), p(410, 214)], label: "hips lead forward and up" },
    ],
  }),
  "assisted-bent-arm-tuck-press": makeGuide("assisted-bent-arm-tuck-press", {
    poses: [toeTuckPress, bentArmTuck, wallHandstand, wallHandstand, sideExitLeft], floor: 420,
    equipment: ["parallettes", "wall"], duration: 9.5, keyframeTimes: [0, .4, .62, .82, 1], playback: "one-way-reset",
    label: "Use the explicit bent-arm assisted path—never kick—to a soft wall catch",
    phasePoseIndexes: [0, 1, 1, 3, 4], auditFrames: { start: 0, middle: 1, end: 4 },
    gaze: [gazeRight, gazeFloor, gazeFloor, gazeFloor, gazeFloor],
    visuals: [
      { kind: "assistance", joint: "la", anchor: p(286, 400), label: "visible toe assistance", contactOnly: true, activePoseIndexes: [0] },
      { kind: "assistance", joint: "ra", anchor: p(306, 400), label: "visible toe assistance", contactOnly: true, activePoseIndexes: [0] },
      visual.landing,
    ],
  }),
  "assisted-straddle-press-wall-handstand": makeGuide("assisted-straddle-press-wall-handstand", {
    poses: [straddleStart, straddleAssistedLoad, straddlePressMid, wallStraddle, wallHandstand, wallHandstand, sideExitLeft],
    floor: 420, equipment: ["parallettes", "wall"], duration: 11, keyframeTimes: [0, .18, .38, .52, .62, .82, 1], playback: "one-way-reset",
    label: "Keep the straddle and straight arms until a soft two-second wall catch, then exit",
    phasePoseIndexes: [0, 1, 1, 2, 5, 6], auditFrames: { start: 0, middle: 5, end: 6 },
    gaze: [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloor, gazeFloor],
    visuals: [
      { kind: "assistance", joint: "la", anchor: p(82, 400), label: "left toe assistance", contactOnly: true, activePoseIndexes: [0, 1] },
      { kind: "assistance", joint: "ra", anchor: p(520, 400), label: "right toe assistance", contactOnly: true, activePoseIndexes: [0, 1] },
      visual.landing,
    ],
  }),
  "wall-handstand-straddle-lower": makeGuide("wall-handstand-straddle-lower", {
    poses: [wallHandstand, wallStraddle, straddlePressMid, straddleStart], floor: 420,
    equipment: ["parallettes", "wall"], duration: 10, keyframeTimes: [0, .12, .55, 1], playback: "one-way-reset",
    label: "Open, fold and lower through locked arms for four seconds to a stable straddle stand",
    phasePoseIndexes: [0, 1, 2, 3, 3],
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloorForward],
    visuals: [{ kind: "direction", points: [p(480, 188), p(438, 260), p(300, 396)], label: "4+ second straight-arm descent" }, visual.landing],
  }),
  "assisted-pike-press-to-handstand": makeGuide("assisted-pike-press-to-handstand", {
    poses: [pikeStart, pikeAssistedLoad, pikePressMid, wallHandstand, wallHandstand, sideExitLeft], floor: 420,
    equipment: ["parallettes", "wall"], duration: 10, keyframeTimes: [0, .2, .42, .6, .8, 1], playback: "one-way-reset",
    label: "Keep legs together and straight; let hips lead with minimal toe assistance",
    phasePoseIndexes: [0, 1, 1, 2, 4, 5], auditFrames: { start: 0, middle: 4, end: 5 },
    gaze: [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloor],
    visuals: [
      { kind: "assistance", joint: "la", anchor: p(86, 400), label: "left toe assistance", contactOnly: true, activePoseIndexes: [0, 1] },
      { kind: "assistance", joint: "ra", anchor: p(106, 400), label: "right toe assistance", contactOnly: true, activePoseIndexes: [0, 1] },
      visual.landing,
    ],
  }),
  "pike-press-negative": makeGuide("pike-press-negative", {
    poses: [wallHandstand, wallHandstand, pikePressMid, pikeStart], floor: 420,
    equipment: ["parallettes", "wall"], duration: 10, keyframeTimes: [0, .12, .55, 1], playback: "one-way-reset",
    label: "Fold both straight together legs for four seconds and place both feet softly",
    phasePoseIndexes: [0, 2, 3, 3], auditFrames: { start: 0, middle: 2, end: 3 },
    gaze: [gazeFloor, gazeFloor, gazeFloor, gazeFloorForward],
    visuals: [{ kind: "direction", points: [p(482, 188), p(438, 248), p(100, 400)], label: "4+ second together-leg descent" }, visual.landing],
  }),
  "deficit-parallette-push-up": makeGuide("deficit-parallette-push-up", {
    poses: [deficitPushTop, deficitPushBottom, deficitPushBottom, deficitPushTop], floor: 448, barTop: 400,
    equipment: ["parallettes"], duration: 6, keyframeTimes: [0, .35, .65, 1], playback: "loop",
    label: "Lower below bar height with a connected trunk, pause, then press to lockout",
    phasePoseIndexes: [0, 1, 2, 3], gaze: gaze([deficitPushTop, deficitPushBottom, deficitPushBottom, deficitPushTop], gazeFloorForward),
    visuals: [visual.barTop, { kind: "landmark", x1: 382, y1: 406, x2: 516, y2: 406, label: "shoulders below bar top" }],
  }),
  "l-sit-to-tuck-planche-transition": makeGuide("l-sit-to-tuck-planche-transition", {
    poses: [lSit, lSit, highLSit, leftTransitionTuck, leftTuckPlanche, leftTuckPlanche, leftPlancheToeLanding], floor: 420,
    equipment: ["parallettes"], duration: 11, keyframeTimes: [0, .14, .26, .48, .65, .84, 1], playback: "one-way-reset",
    label: "Move continuously from full L-sit to a clean feet-clear tuck Planche",
    phasePoseIndexes: [0, 2, 3, 4, 5], auditFrames: { start: 0, middle: 3, end: 5 }, posterFrame: 5,
    gaze: gaze([lSit, lSit, highLSit, leftTransitionTuck, leftTuckPlanche, leftTuckPlanche, leftPlancheToeLanding], gazeLeft),
    visuals: [{ kind: "direction", points: [p(110, 300), p(330, 260), p(520, 300)], label: "continuous feet-clear ankle path" }],
  }),
  "tuck-planche-to-l-sit-transition": makeGuide("tuck-planche-to-l-sit-transition", {
    poses: [leftTuckPlanche, leftTuckPlanche, leftTransitionTuck, highLSit, lSit, lSit, tallSupport], floor: 420,
    equipment: ["parallettes"], duration: 11, keyframeTimes: [0, .18, .4, .62, .78, .88, 1], playback: "one-way-reset",
    label: "Shift under control and extend to a stable full L-sit without dropping",
    phasePoseIndexes: [0, 2, 3, 5, 6], auditFrames: { start: 0, middle: 2, end: 5 }, posterFrame: 5,
    gaze: gaze([leftTuckPlanche, leftTuckPlanche, leftTransitionTuck, highLSit, lSit, lSit, tallSupport], gazeLeft),
    visuals: [{ kind: "direction", points: [p(520, 300), p(330, 260), p(110, 300)], label: "continuous feet-clear ankle path" }],
  }),
} as const satisfies Readonly<Record<OwnedMotionReference, Phase10OwnedMotionGuide>>;

export const phase10OwnedMotionReferences = Object.keys(
  phase10OwnedMotionGuides,
) as readonly OwnedMotionReference[];
