import { motion, useReducedMotion } from "motion/react";

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
type Equipment = "wall" | "parallettes" | "rope";
type Guide = {
  poses: Pose[];
  floor: number;
  equipment?: Equipment | Equipment[];
  duration?: number;
  label: string;
  /** One gaze vector per pose keeps the face readable when body orientation changes. */
  gaze: Point[];
  static?: boolean;
};

const p = (x: number, y: number): Point => ({ x, y });
const change = (base: Pose, updates: Partial<Record<Joint, Point>>): Pose => ({
  ...base,
  ...updates,
});
const shifted = (base: Pose, dx: number, dy: number): Pose =>
  Object.fromEntries(
    Object.entries(base).map(([joint, point]) => [joint, p(point.x + dx, point.y + dy)]),
  ) as Pose;
const closeLoop = <T,>(items: T[]) =>
  items.length < 2 ? items : [...items, ...items.slice(0, -1).reverse()];
const gazeRight = p(13, 0);
const gazeLeft = p(-13, 1);
const gazeFloorForward = p(9, 8);
const gazeFloor = p(0, 12);
const gazeCeiling = p(0, -12);
const gazeTowardKnees = p(-10, -6);
const dynamic = (
  label: string,
  poses: Pose[],
  floor = 420,
  equipment?: Guide["equipment"],
  duration = 4.2,
  gaze: Point | Point[] = p(10, 6),
): Guide => {
  const forwardGaze = "x" in gaze ? poses.map(() => gaze) : gaze;
  if (forwardGaze.length !== poses.length) {
    throw new Error(`${label}: gaze count must match pose count`);
  }
  return {
    poses: closeLoop(poses),
    floor,
    equipment,
    duration,
    label,
    gaze: closeLoop(forwardGaze),
  };
};
const hold = (
  label: string,
  pose: Pose,
  floor = 420,
  equipment?: Guide["equipment"],
  gaze = p(10, 4),
): Guide => ({ poses: [pose], floor, equipment, label, gaze: [gaze], static: true });

const standing: Pose = {
  head: p(320, 78), neck: p(320, 120),
  ls: p(284, 138), le: p(272, 230), lw: p(290, 305),
  rs: p(356, 138), re: p(368, 230), rw: p(350, 305),
  lh: p(302, 285), lk: p(292, 382), la: p(282, 470),
  rh: p(338, 285), rk: p(348, 382), ra: p(358, 470),
};

// Side-on wall stance: the wall is drawn at x=558, so wrist contact is
// unmistakable while the ribs, pelvis and feet remain stacked underneath.
const wallStandingSide: Pose = {
  head: p(458, 82), neck: p(448, 122),
  ls: p(428, 142), le: p(492, 188), lw: p(558, 190),
  rs: p(448, 146), re: p(506, 202), rw: p(558, 205),
  lh: p(420, 286), lk: p(414, 380), la: p(410, 470),
  rh: p(440, 290), rk: p(438, 382), ra: p(442, 470),
};

const halfKneeling: Pose = {
  head: p(330, 126), neck: p(326, 168),
  ls: p(300, 188), le: p(292, 258), lw: p(310, 320),
  rs: p(352, 188), re: p(360, 258), rw: p(342, 320),
  lh: p(308, 310), lk: p(392, 372), la: p(430, 470),
  rh: p(340, 312), rk: p(250, 470), ra: p(170, 470),
};

const quadruped: Pose = {
  head: p(492, 205), neck: p(452, 224),
  ls: p(424, 244), le: p(426, 312), lw: p(426, 400),
  rs: p(440, 250), re: p(446, 316), rw: p(448, 400),
  lh: p(282, 246), lk: p(270, 350), la: p(190, 400),
  rh: p(300, 256), rk: p(302, 354), ra: p(220, 400),
};

const plank: Pose = {
  head: p(500, 214), neck: p(465, 234),
  ls: p(430, 250), le: p(432, 324), lw: p(434, 400),
  rs: p(446, 254), re: p(450, 326), rw: p(454, 400),
  lh: p(292, 292), lk: p(190, 332), la: p(82, 400),
  rh: p(306, 300), rk: p(204, 342), ra: p(102, 400),
};

const pike: Pose = {
  head: p(476, 236), neck: p(446, 256),
  ls: p(420, 270), le: p(430, 334), lw: p(438, 400),
  rs: p(438, 276), re: p(447, 337), rw: p(456, 400),
  lh: p(282, 158), lk: p(186, 278), la: p(86, 400),
  rh: p(300, 166), rk: p(204, 286), ra: p(106, 400),
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
  ls: p(370, 312), le: p(444, 354), lw: p(528, 404),
  rs: p(378, 326), re: p(452, 366), rw: p(536, 412),
  lh: p(258, 306), lk: p(236, 400), la: p(148, 412),
  rh: p(276, 316), rk: p(266, 406), ra: p(178, 418),
};

const support: Pose = {
  head: p(430, 145), neck: p(426, 188),
  ls: p(408, 222), le: p(421, 310), lw: p(434, 400),
  rs: p(438, 224), re: p(447, 311), rw: p(456, 400),
  lh: p(348, 306), lk: p(260, 354), la: p(174, 400),
  rh: p(366, 312), rk: p(280, 362), ra: p(194, 400),
};

const tuckSupport = change(support, {
  lh: p(350, 300), lk: p(302, 326), la: p(330, 382),
  rh: p(368, 307), rk: p(318, 334), ra: p(346, 389),
});

const lSit = change(support, {
  head: p(426, 140), neck: p(424, 184),
  lh: p(354, 304), lk: p(236, 300), la: p(98, 298),
  rh: p(370, 312), rk: p(250, 310), ra: p(110, 308),
});

const seatedPike: Pose = {
  head: p(414, 170), neck: p(402, 210),
  ls: p(382, 234), le: p(406, 310), lw: p(428, 396),
  rs: p(414, 238), re: p(432, 316), rw: p(452, 396),
  lh: p(342, 330), lk: p(226, 345), la: p(92, 350),
  rh: p(360, 338), rk: p(242, 356), ra: p(108, 362),
};

const floorTuckVSit: Pose = {
  head: p(424, 194), neck: p(404, 230),
  ls: p(380, 250), le: p(348, 276), lw: p(300, 252),
  rs: p(410, 256), re: p(370, 284), rw: p(318, 260),
  lh: p(350, 334), lk: p(316, 288), la: p(286, 240),
  rh: p(368, 342), rk: p(336, 296), ra: p(306, 248),
};

const sidePlank: Pose = {
  head: p(476, 230), neck: p(444, 250),
  ls: p(420, 270), le: p(430, 334), lw: p(438, 400),
  rs: p(430, 258), re: p(400, 190), rw: p(370, 120),
  lh: p(292, 306), lk: p(190, 350), la: p(84, 400),
  rh: p(306, 314), rk: p(204, 360), ra: p(104, 404),
};

const reversePlank: Pose = {
  head: p(488, 318), neck: p(450, 326),
  ls: p(420, 330), le: p(428, 364), lw: p(438, 402),
  rs: p(438, 338), re: p(446, 370), rw: p(456, 402),
  lh: p(292, 310), lk: p(190, 340), la: p(82, 400),
  rh: p(306, 320), rk: p(204, 350), ra: p(102, 404),
};

const prone: Pose = {
  head: p(500, 382), neck: p(458, 374),
  ls: p(426, 366), le: p(382, 354), lw: p(330, 346),
  rs: p(434, 380), re: p(390, 370), rw: p(338, 362),
  lh: p(300, 376), lk: p(206, 386), la: p(98, 398),
  rh: p(314, 390), rk: p(220, 400), ra: p(112, 412),
};

const bridge: Pose = change(supine, {
  head: p(506, 390), neck: p(466, 378), ls: p(428, 366), rs: p(438, 380),
  lh: p(314, 306), rh: p(330, 318), lk: p(240, 336), rk: p(258, 348),
  la: p(176, 410), ra: p(194, 414), le: p(412, 386), re: p(426, 398), lw: p(360, 410), rw: p(374, 414),
});

const boxPike: Pose = {
  head: p(478, 262), neck: p(447, 278),
  ls: p(423, 292), le: p(431, 346), lw: p(438, 400),
  rs: p(440, 298), re: p(448, 350), rw: p(456, 400),
  lh: p(404, 152), lk: p(300, 200), la: p(190, 244),
  rh: p(420, 158), rk: p(316, 207), ra: p(206, 244),
};

const frog: Pose = {
  head: p(500, 252), neck: p(462, 270),
  ls: p(426, 282), le: p(424, 338), lw: p(434, 400),
  rs: p(444, 288), re: p(446, 342), rw: p(456, 400),
  lh: p(340, 280), lk: p(410, 330), la: p(340, 386),
  rh: p(356, 290), rk: p(430, 340), ra: p(360, 392),
};

const wallHandstand: Pose = {
  head: p(468, 338), neck: p(468, 309),
  ls: p(449, 286), le: p(442, 342), lw: p(438, 400),
  rs: p(472, 286), re: p(463, 343), rw: p(456, 400),
  lh: p(482, 188), lk: p(518, 116), la: p(558, 50),
  rh: p(498, 190), rk: p(530, 118), ra: p(558, 58),
};

const invertedL = change(wallHandstand, {
  lh: p(474, 185), lk: p(520, 212), la: p(558, 220),
  rh: p(490, 194), rk: p(530, 221), ra: p(558, 228),
});

const kickupStart: Pose = {
  head: p(478, 244), neck: p(448, 264),
  ls: p(420, 280), le: p(430, 340), lw: p(438, 400),
  rs: p(438, 286), re: p(448, 344), rw: p(456, 400),
  lh: p(304, 256), lk: p(210, 328), la: p(112, 400),
  rh: p(324, 264), rk: p(390, 180), ra: p(448, 92),
};

const kickupSplit = change(wallHandstand, {
  lh: p(474, 190), lk: p(502, 120), la: p(530, 50),
  rh: p(490, 200), rk: p(402, 185), ra: p(310, 170),
});

const longHollow = change(supine, {
  head: p(508, 372), neck: p(470, 360),
  le: p(500, 340), lw: p(574, 320), re: p(505, 355), rw: p(578, 336),
  lk: p(206, 376), la: p(82, 370), rk: p(218, 390), ra: p(92, 386),
});

const bearHover = change(quadruped, {
  lk: p(258, 346), la: p(188, 392), rk: p(286, 352), ra: p(216, 394),
});

const forearmPlank = change(plank, {
  le: p(432, 400), lw: p(506, 400),
  re: p(450, 406), rw: p(524, 406),
});

const forearmSidePlank = change(sidePlank, {
  le: p(438, 400), lw: p(510, 400),
});

const plankSawBack = change(plank, {
  head: p(474, 214), neck: p(440, 234),
  ls: p(408, 250), rs: p(424, 254),
  le: p(420, 324), re: p(438, 326),
  lh: p(272, 292), rh: p(286, 300),
  lk: p(178, 332), rk: p(192, 342),
});

const forearmSawBack = change(forearmPlank, {
  head: p(474, 214), neck: p(440, 234),
  ls: p(408, 250), rs: p(424, 254),
  lh: p(272, 292), rh: p(286, 300),
  lk: p(178, 332), rk: p(192, 342),
});

const wallBodyShift = (dx: number) => change(wallHandstand, {
  head: p(wallHandstand.head.x + dx, wallHandstand.head.y),
  neck: p(wallHandstand.neck.x + dx, wallHandstand.neck.y),
  ls: p(wallHandstand.ls.x + dx, wallHandstand.ls.y),
  rs: p(wallHandstand.rs.x + dx, wallHandstand.rs.y),
  lh: p(wallHandstand.lh.x + dx, wallHandstand.lh.y),
  rh: p(wallHandstand.rh.x + dx, wallHandstand.rh.y),
  lk: p(wallHandstand.lk.x + dx * 0.5, wallHandstand.lk.y),
  rk: p(wallHandstand.rk.x + dx * 0.5, wallHandstand.rk.y),
});

const freeHandstandBalance = change(wallHandstand, {
  la: p(460, 38), ra: p(478, 40),
  lk: p(464, 112), rk: p(482, 114),
});

const freeBalanceShift = (base: Pose, dx: number) => change(base, {
  head: p(base.head.x + dx, base.head.y),
  neck: p(base.neck.x + dx, base.neck.y),
  ls: p(base.ls.x + dx, base.ls.y),
  rs: p(base.rs.x + dx, base.rs.y),
  lh: p(base.lh.x + dx, base.lh.y),
  rh: p(base.rh.x + dx, base.rh.y),
  lk: p(base.lk.x + dx * 1.5, base.lk.y),
  rk: p(base.rk.x + dx * 1.5, base.rk.y),
  la: p(base.la.x + dx * 1.8, base.la.y),
  ra: p(base.ra.x + dx * 1.8, base.ra.y),
});

const plancheLean = change(plank, {
  head: p(530, 218), neck: p(494, 238),
  ls: p(466, 256), le: p(452, 328), lw: p(438, 400),
  rs: p(484, 260), re: p(470, 330), rw: p(456, 400),
  lh: p(318, 296), rh: p(332, 304),
});

const tuckPlanche = change(frog, {
  head: p(500, 242), neck: p(462, 260),
  ls: p(432, 272), le: p(430, 334), lw: p(434, 400),
  rs: p(450, 278), re: p(450, 338), rw: p(456, 400),
  lh: p(350, 220), lk: p(394, 272), la: p(364, 330),
  rh: p(366, 230), rk: p(414, 282), ra: p(384, 338),
});

const legacyGuides = {
  "neutral-standing-avatar": hold("Parallette25 avatar identity and proportions", standing, 486, undefined, p(13, 0)),
  "wrist-rocks": dynamic("Rock forward and back", [quadruped, change(quadruped, {
    head: p(520, 206), neck: p(482, 225), ls: p(456, 244), rs: p(470, 250),
    le: p(448, 314), re: p(462, 318), lh: p(294, 250), rh: p(312, 260),
  })], 420, undefined, 3.8, p(10, 7)),
  "shoulder-cars": dynamic("Circle through a pain-free range", [
    standing,
    change(standing, { le: p(215, 142), lw: p(142, 142), re: p(425, 142), rw: p(498, 142) }),
    change(standing, { le: p(290, 76), lw: p(306, 28), re: p(350, 76), rw: p(334, 28) }),
  ], 486, undefined, 5, p(13, 0)),
  "scap-pushup": dynamic("Elbows stay locked", [plank, change(plank, {
    head: p(500, 230), neck: p(464, 250), ls: p(430, 268), rs: p(446, 272),
    lh: p(292, 302), rh: p(306, 310),
  })], 420, "parallettes", 3.8, p(10, 7)),
  "wrist-circles": dynamic("Slow circles in both directions", [
    change(standing, { le: p(280, 215), lw: p(320, 225), re: p(360, 215), rw: p(320, 225) }),
    change(standing, { le: p(280, 215), lw: p(307, 209), re: p(360, 215), rw: p(333, 241) }),
    change(standing, { le: p(280, 215), lw: p(320, 196), re: p(360, 215), rw: p(320, 254) }),
  ], 486, undefined, 4, p(13, 0)),
  "wall-slides": dynamic("Ribs down; forearms maintain light wall contact", [
    wallStandingSide,
    change(wallStandingSide, { le: p(500, 126), lw: p(558, 82), re: p(514, 138), rw: p(558, 94) }),
  ], 486, "wall", 4.2, p(13, 0)),
  "plank-pike": dynamic("Press back into a tall pike", [plank, pike], 420, "parallettes", 4.4, p(10, 7)),
  "dead-bug": dynamic("Opposite arm and leg", [
    supine,
    change(supine, { le: p(474, 378), lw: p(560, 405), rk: p(210, 390), ra: p(100, 407) }),
    change(supine, { re: p(482, 386), rw: p(565, 412), lk: p(205, 384), la: p(98, 404) }),
  ], 426, undefined, 4.8, p(0, -12)),
  "plank-tap": dynamic("Shift fully, tap one shoulder, replace the hand, then alternate", [
    plank,
    change(plank, { le: p(520, 320), lw: p(460, 250), ls: p(430, 250), rh: p(304, 302) }),
    plank,
    change(plank, { re: p(540, 300), rw: p(420, 240), rs: p(446, 254), lh: p(292, 292) }),
  ], 420, "parallettes", 5.6, p(10, 7)),
  "mountain-climber": dynamic("Slow alternating knee drives", [
    plank,
    change(plank, { rh: p(310, 302), rk: p(342, 350), ra: p(392, 396) }),
    change(plank, { lh: p(296, 294), lk: p(352, 342), la: p(400, 396) }),
  ], 420, "parallettes", 4.6, p(10, 7)),
  "hollow-rock": dynamic("Keep one hollow shape", [longHollow, shifted(longHollow, -8, -18)], 426, undefined, 3.8, p(0, -12)),
  "plank-saw": dynamic("Move as one solid line while hands stay planted", [plank, plankSawBack], 420, "parallettes", 4, gazeFloorForward),
  "cross-press": dynamic("Press one hand into the opposite knee while the free arm and other leg extend; alternate sides", [
    supine,
    change(supine, {
      le: p(350, 324), lw: p(294, 304),
      lk: p(210, 390), la: p(98, 408),
      re: p(490, 390), rw: p(565, 414),
    }),
    supine,
    change(supine, {
      re: p(370, 336), rw: p(286, 286),
      rk: p(220, 400), ra: p(108, 418),
      le: p(480, 380), lw: p(560, 405),
    }),
  ], 426, undefined, 6, gazeCeiling),
  "kneeling-plank-tap": dynamic("Knees stay down; tap one shoulder, replace the hand, then alternate", [
    change(plank, { lk: p(240, 400), la: p(170, 405), rk: p(260, 405), ra: p(190, 410) }),
    change(plank, { lk: p(240, 400), la: p(170, 405), rk: p(260, 405), ra: p(190, 410), le: p(520, 320), lw: p(460, 250) }),
    change(plank, { lk: p(240, 400), la: p(170, 405), rk: p(260, 405), ra: p(190, 410) }),
    change(plank, { lk: p(240, 400), la: p(170, 405), rk: p(260, 405), ra: p(190, 410), re: p(540, 300), rw: p(420, 240) }),
  ], 420, "parallettes", 5.6, p(10, 7)),
  "plank-knee": dynamic("Drive one knee toward its elbow, return to plank, then alternate", [
    plank,
    change(plank, { rh: p(310, 302), rk: p(385, 320), ra: p(420, 350) }),
    plank,
    change(plank, { lh: p(296, 294), lk: p(377, 310), la: p(412, 342) }),
  ], 420, "parallettes", 5.6, p(10, 7)),
  "hollow-reach": dynamic("Reach only while the back stays flat", [
    change(longHollow, { le: p(420, 290), lw: p(410, 230), re: p(438, 306), rw: p(430, 245) }),
    longHollow,
  ], 426, undefined, 4, p(0, -12)),
  "hollow-one-leg": dynamic("Alternate without losing the tuck", [
    change(longHollow, { lk: p(250, 320), la: p(220, 245) }),
    change(longHollow, { rk: p(254, 330), ra: p(226, 252) }),
  ], 426, undefined, 4.4, p(0, -12)),
  "plank-tap-out": dynamic("Tap one hand wide, replace it on the bar, then alternate without twisting", [
    plank,
    change(plank, { le: p(468, 330), lw: p(520, 400), ls: p(430, 250) }),
    plank,
    change(plank, { re: p(414, 330), rw: p(370, 400), rs: p(446, 254) }),
  ], 420, "parallettes", 5.6, p(10, 7)),
  "wrist-flexor-rock": hold("Palms down; hold a mild stretch with fingers forward", change(quadruped, {
    head: p(515, 208), neck: p(478, 226), ls: p(454, 246), rs: p(468, 252), lh: p(292, 250), rh: p(310, 260),
  }), 420, undefined, p(10, 7)),
  "wrist-extensor-rock": hold("Fingers toward knees; hold only gentle pressure", change(quadruped, {
    head: p(470, 210), neck: p(432, 230), ls: p(410, 250), rs: p(424, 256), lh: p(272, 250), rh: p(290, 260),
  }), 420, undefined, p(10, 7)),
  "child-reach": hold("Hips back; relax into a long reach", change(child, {
    head: p(466, 372), neck: p(420, 348), ls: p(386, 336), rs: p(394, 348), lw: p(558, 404), rw: p(566, 412), lh: p(248, 320), rh: p(266, 330),
  }), 426, undefined, p(7, 9)),
  "thread-needle": hold("Rest in the rotation and breathe without forcing", change(quadruped, {
    rs: p(404, 264), re: p(350, 330), rw: p(278, 400), head: p(420, 300), neck: p(398, 278),
  }), 420, undefined, p(8, 8)),
  "lat-reach": hold("Sink the chest gently and breathe", change(child, { head: p(452, 374), neck: p(410, 346), ls: p(380, 326), rs: p(388, 338), lh: p(248, 292), rh: p(266, 302), lk: p(244, 400), rk: p(272, 406), lw: p(500, 360), rw: p(522, 370) }), 426, "parallettes", p(8, 9)),
  "puppy-rock": hold("Hips over knees; relax into a mild shoulder stretch", change(child, { head: p(458, 378), neck: p(414, 350), ls: p(382, 330), rs: p(390, 342), lh: p(260, 260), rh: p(280, 270), lk: p(260, 400), rk: p(288, 406), lw: p(556, 404), rw: p(564, 412) }), 426, undefined, p(7, 9)),
  "chest-opener": hold("Clasp behind; hold a mild chest opening", change(standing, { le: p(286, 216), lw: p(246, 252), re: p(298, 220), rw: p(246, 252), ls: p(276, 136), rs: p(364, 136) }), 486, undefined, p(13, 0)),
  "upper-back-reach": hold("Hug wide; breathe into the upper back", change(standing, {
    le: p(338, 188), lw: p(372, 164), re: p(302, 188), rw: p(268, 164), head: p(320, 92), neck: p(320, 132), ls: p(292, 150), rs: p(348, 150),
  }), 486, undefined, p(13, 0)),
} as const;

const newGuides = {
  // Dynamic warm-up (6)
  "fingertip-wrist-pulses": dynamic("Fingers stay long; pulse gently", [
    change(quadruped, { lw: p(426, 400), rw: p(448, 400) }),
    change(quadruped, { lw: p(426, 392), rw: p(448, 392), head: p(505, 204) }),
  ], 420, undefined, 3.6, p(10, 7)),
  "prayer-wrist-waves": dynamic("Palms meet; roll through the wrists", [
    change(standing, { le: p(288, 210), lw: p(320, 224), re: p(352, 210), rw: p(320, 224) }),
    change(standing, { le: p(286, 200), lw: p(320, 190), re: p(354, 200), rw: p(320, 190) }),
    change(standing, { le: p(288, 220), lw: p(320, 250), re: p(352, 220), rw: p(320, 250) }),
  ], 486, undefined, 4.2, p(13, 0)),
  "down-dog-plank-wave": dynamic("Wave forward to plank, then press back", [pike, change(pike, {
    head: p(492, 238), neck: p(458, 250), ls: p(432, 264), rs: p(448, 268),
    lh: p(294, 250), rh: p(310, 258), lk: p(190, 330), rk: p(204, 340),
  }), plank], 420, undefined, 5, p(10, 7)),
  "wall-yw-sweep": dynamic("Slide from W to Y with light wall contact", [
    wallStandingSide,
    change(wallStandingSide, { le: p(500, 126), lw: p(558, 82), re: p(514, 138), rw: p(558, 94) }),
    change(wallStandingSide, { le: p(510, 88), lw: p(558, 35), re: p(524, 100), rw: p(558, 48) }),
  ], 486, "wall", 4.8, p(13, 0)),
  "kneeling-thoracic-rotation": dynamic("Rotate through the upper back; complete the target on both sides", [quadruped, change(quadruped, {
    rs: p(420, 238), re: p(382, 166), rw: p(350, 94), head: p(432, 172), neck: p(410, 212),
  })], 420, undefined, 4.8, p(7, -10)),
  "inchworm-pike-walkout": dynamic("Walk out under control; return to pike", [
    change(standing, { head: p(380, 210), neck: p(356, 238), ls: p(338, 256), rs: p(354, 260), le: p(390, 320), re: p(406, 324), lw: p(430, 400), rw: p(448, 400), lh: p(300, 282), rh: p(318, 290) }),
    pike,
    plank,
  ], 420, undefined, 5.4, p(10, 7)),

  // Pre-handstand (8)
  "parallette-forward-lean-hold": hold("Shoulders slightly beyond hands; elbows locked", plancheLean, 420, "parallettes", p(10, 7)),
  "bear-to-pike-shoulder-load": dynamic("Keep arms straight as hips rise", [bearHover, pike], 420, "parallettes", 4.8, p(10, 7)),
  "standing-kickup-line-rehearsal": dynamic("Reach long from fingers to the lifted heel; rehearse both lead legs", [
    standing,
    change(standing, { le: p(284, 78), lw: p(300, 24), re: p(356, 78), rw: p(340, 24), lh: p(302, 280), lk: p(208, 230), la: p(110, 170), rh: p(338, 285), rk: p(345, 380), ra: p(350, 470) }),
    standing,
    change(standing, { le: p(284, 78), lw: p(300, 24), re: p(356, 78), rw: p(340, 24), lh: p(302, 285), lk: p(295, 380), la: p(290, 470), rh: p(338, 280), rk: p(208, 230), ra: p(110, 170) }),
  ], 486, undefined, 6, p(13, 0)),
  "pike-scapular-shrugs": dynamic("Elbows stay locked; elevate and depress only", [pike, change(pike, {
    head: p(468, 246), neck: p(440, 266), ls: p(416, 286), rs: p(434, 292),
  })], 420, "parallettes", 3.8, p(9, 8)),
  "pike-alternating-toe-float": dynamic("Float one toe without jumping", [
    pike,
    change(pike, { lk: p(190, 270), la: p(116, 344) }),
    change(pike, { rk: p(208, 278), ra: p(136, 350) }),
  ], 420, "parallettes", 4.8, p(9, 8)),
  "box-pike-scapular-shrugs": dynamic("Feet stay on wall; move only the shoulder blades", [invertedL, change(invertedL, {
    head: p(472, 270), neck: p(442, 288), ls: p(419, 307), rs: p(436, 312),
  })], 420, ["wall", "parallettes"], 3.8, p(9, 8)),
  "box-pike-shoulder-shift": dynamic("Feet stay on wall; shift shoulders just past the bars", [invertedL, change(invertedL, {
    head: p(504, 264), neck: p(472, 280), ls: p(448, 294), rs: p(466, 300),
    le: p(442, 346), re: p(458, 350),
  })], 420, ["wall", "parallettes"], 4.2, p(9, 8)),
  "box-pike-one-leg-line-lift": dynamic("One foot stays on the wall while the free leg reaches tall; alternate legs", [
    invertedL,
    change(invertedL, { lh: p(408, 152), lk: p(430, 84), la: p(448, 24) }),
    invertedL,
    change(invertedL, { rh: p(424, 158), rk: p(446, 88), ra: p(464, 28) }),
  ], 420, ["wall", "parallettes"], 6, gazeFloor),

  // Abs and core (16)
  "deadbug-heel-tap": dynamic("Tap one heel without arching the back", [supine, change(supine, {
    rk: p(250, 350), ra: p(205, 410),
  }), change(supine, { lk: p(238, 342), la: p(195, 410) })], 426, undefined, 4.8, p(0, -12)),
  "long-lever-parallette-plank": hold("Long straight line; ribs stay tucked", plancheLean, 420, "parallettes", p(10, 7)),
  "bear-hover-knee-tap": dynamic("Hover low; tap one knee softly", [bearHover, change(bearHover, {
    le: p(380, 328), lw: p(286, 348),
  }), change(bearHover, { re: p(400, 334), rw: p(306, 354) })], 420, undefined, 4.6, p(10, 7)),
  "long-lever-hollow-hold": hold("Lower back heavy; arms and legs reach long", longHollow, 426, undefined, p(0, -12)),
  "hollow-flutter-kicks": dynamic("Small alternating kicks; keep the hollow", [
    change(longHollow, { la: p(82, 350), ra: p(92, 398) }),
    change(longHollow, { la: p(82, 398), ra: p(92, 350) }),
  ], 426, undefined, 3.4, p(0, -12)),
  "hollow-to-tuck-rock": dynamic("Rock without losing posterior pelvic tilt", [longHollow, change(supine, {
    head: p(500, 352), neck: p(462, 342), le: p(420, 330), lw: p(360, 314), re: p(432, 344), rw: p(372, 328), lh: p(300, 360), lk: p(348, 318), la: p(370, 270), rh: p(314, 374), rk: p(362, 332), ra: p(382, 284),
  })], 426, undefined, 4.2, [gazeCeiling, gazeTowardKnees]),
  "deadbug-double-leg-lower": dynamic("Lower both heels only while the back stays flat", [supine, change(supine, {
    lk: p(210, 388), la: p(90, 410), rk: p(220, 400), ra: p(100, 418),
  })], 426, undefined, 4.8, p(0, -12)),
  "plank-knee-drive-isometric": dynamic("Drive one knee forward, pause with square hips, reset, then alternate", [
    plank,
    change(plank, { rh: p(310, 302), rk: p(386, 326), ra: p(420, 360) }),
    plank,
    change(plank, { lh: p(294, 292), lk: p(374, 316), la: p(410, 352) }),
  ], 420, "parallettes", 5.8, p(10, 7)),
  "crossbody-mountain-climber": dynamic("Knee travels toward opposite elbow", [plank, change(plank, {
    rh: p(310, 302), rk: p(390, 314), ra: p(428, 350),
  }), change(plank, { lh: p(294, 292), lk: p(382, 324), la: p(424, 360) })], 420, "parallettes", 4.8, p(10, 7)),
  "side-plank-hip-lift": dynamic("Lift hips into one long line; complete the target on both sides", [change(sidePlank, {
    lh: p(300, 350), rh: p(314, 358), head: p(470, 270), neck: p(438, 286), ls: p(416, 300),
  }), sidePlank], 420, "parallettes", 4.2, p(11, 2)),
  "side-plank-reach-through": dynamic("Rotate under slowly with feet on the floor; repeat the other side", [sidePlank, change(sidePlank, {
    rs: p(428, 272), re: p(350, 318), rw: p(278, 360), head: p(452, 284), neck: p(424, 292),
  })], 420, "parallettes", 4.8, p(10, 4)),
  "seated-pike-compression-pulses": dynamic("Press down and float both heels", [seatedPike, change(seatedPike, {
    lk: p(226, 325), la: p(92, 322), rk: p(242, 336), ra: p(108, 332),
  })], 420, "parallettes", 3.8, gazeLeft),
  "alternating-pike-leg-lift": dynamic("Lift one straight leg at a time", [
    seatedPike,
    change(seatedPike, { lk: p(220, 300), la: p(92, 276) }),
    change(seatedPike, { rk: p(236, 310), ra: p(108, 286) }),
  ], 420, "parallettes", 4.6, gazeLeft),
  "parallette-plank-leg-lift": dynamic("Squeeze one glute; do not arch", [plank, change(plank, {
    lk: p(186, 300), la: p(74, 260),
  }), change(plank, { rk: p(200, 310), ra: p(92, 270) })], 420, "parallettes", 4.6, p(10, 7)),
  "hollow-scissor-kicks": dynamic("Cross straight legs without losing the hollow", [
    change(longHollow, { la: p(80, 350), ra: p(126, 396) }),
    change(longHollow, { la: p(126, 396), ra: p(80, 350) }),
  ], 426, undefined, 3.4, p(0, -12)),
  "straddle-compression-lift": dynamic("Lock knees; lift both heels from the hips", [
    change(seatedPike, { lk: p(216, 348), la: p(76, 378), rk: p(252, 348), ra: p(122, 314) }),
    change(seatedPike, { lk: p(216, 320), la: p(76, 338), rk: p(252, 320), ra: p(122, 286) }),
  ], 420, "parallettes", 4.2, gazeLeft),

  // Handstand skill (8)
  "grounded-side-exit-rehearsal": dynamic("Step one leg sideways; keep hands until feet are safe", [
    pike,
    change(pike, { lh: p(286, 160), lk: p(226, 250), la: p(170, 342), rh: p(300, 168), rk: p(356, 248), ra: p(430, 326) }),
    change(pike, { lh: p(310, 220), lk: p(248, 314), la: p(184, 400), rh: p(326, 228), rk: p(390, 318), ra: p(470, 402) }),
    pike,
    change(pike, { lh: p(286, 160), lk: p(360, 248), la: p(444, 326), rh: p(300, 168), rk: p(230, 250), ra: p(164, 342) }),
    change(pike, { lh: p(310, 220), lk: p(394, 318), la: p(474, 402), rh: p(326, 228), rk: p(252, 314), ra: p(180, 400) }),
  ], 420, "parallettes", 7, gazeFloorForward),
  "wall-facing-handstand-weight-shift": dynamic("Shift shoulder pressure left and right", [
    wallHandstand,
    change(wallHandstand, { ls: p(438, 286), rs: p(462, 286), head: p(456, 338) }),
    change(wallHandstand, { ls: p(458, 286), rs: p(482, 286), head: p(478, 338) }),
  ], 420, ["wall", "parallettes"], 4.6, p(0, 12)),
  "chest-wall-alternating-toe-peel": dynamic("Peel one toe; return before the line changes", [
    wallHandstand,
    change(wallHandstand, { lk: p(500, 112), la: p(520, 62) }),
    change(wallHandstand, { rk: p(510, 116), ra: p(530, 66) }),
  ], 420, ["wall", "parallettes"], 4.8, p(0, 12)),
  "kickup-stop-short-drill": dynamic("Grip first, kick softly below vertical, then replace both feet", [pike, kickupStart, change(kickupSplit, {
    lh: p(444, 210), lk: p(470, 145), la: p(492, 86), rh: p(460, 220), rk: p(376, 224), ra: p(286, 230),
  })], 420, "parallettes", 5.6, [gazeFloorForward, gazeFloorForward, gazeFloor]),
  "parallette-kickup-to-wall": dynamic("Grip first; kick softly to the wall, then step both feet down", [pike, kickupStart, kickupSplit, wallHandstand], 420, ["wall", "parallettes"], 6.4, [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor]),
  "split-leg-wall-pullaway": dynamic("Split, float briefly, then return to the wall", [wallHandstand, kickupSplit, change(kickupSplit, {
    lh: p(470, 184), lk: p(480, 108), la: p(490, 38), rh: p(490, 194), rk: p(420, 166), ra: p(350, 132),
  })], 420, ["wall", "parallettes"], 5, gazeFloor),
  "wall-handstand-side-exit": dynamic("Turn the hips and practise a controlled step-down with each lead leg", [
    wallHandstand,
    change(kickupSplit, {
      lh: p(480, 190), lk: p(540, 160), la: p(558, 132),
      rh: p(496, 198), rk: p(402, 242), ra: p(306, 294),
    }),
    change(kickupStart, { rh: p(326, 264), rk: p(390, 330), ra: p(470, 400) }),
    wallHandstand,
    change(kickupSplit, {
      lh: p(480, 190), lk: p(402, 242), la: p(306, 294),
      rh: p(496, 198), rk: p(540, 160), ra: p(558, 132),
    }),
    change(kickupStart, {
      lh: p(304, 256), lk: p(390, 330), la: p(470, 400),
      rh: p(324, 264), rk: p(210, 328), ra: p(112, 400),
    }),
  ], 420, ["wall", "parallettes"], 8, [gazeFloor, gazeFloor, gazeFloorForward, gazeFloor, gazeFloor, gazeFloorForward]),
  "freestanding-parallette-kickup": dynamic("Kick up calmly, balance, then exit sideways one foot at a time; alternate exit sides", [
    pike,
    kickupStart,
    kickupSplit,
    freeHandstandBalance,
    change(kickupSplit, {
      lh: p(480, 190), lk: p(540, 160), la: p(558, 132),
      rh: p(496, 198), rk: p(402, 242), ra: p(306, 294),
    }),
    change(kickupStart, { rh: p(326, 264), rk: p(390, 330), ra: p(470, 400) }),
    pike,
    kickupStart,
    kickupSplit,
    freeHandstandBalance,
    change(kickupSplit, {
      lh: p(480, 190), lk: p(402, 242), la: p(306, 294),
      rh: p(496, 198), rk: p(540, 160), ra: p(558, 132),
    }),
    change(kickupStart, {
      lh: p(304, 256), lk: p(390, 330), la: p(470, 400),
      rh: p(324, 264), rk: p(210, 328), ra: p(112, 400),
    }),
  ], 420, "parallettes", 10, [
    gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward,
    gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward,
  ]),

  // Cooldown (6)
  "forearms-parallette-prayer-rock": hold("Forearms supported; breathe in a mild lat stretch", change(quadruped, { head: p(454, 230), neck: p(418, 246), ls: p(390, 264), rs: p(406, 270), le: p(392, 332), lw: p(430, 380), re: p(424, 336), rw: p(448, 380), lh: p(260, 260), rh: p(278, 270) }), 420, "parallettes", p(8, 9)),
  "seated-wrist-extension-stretch": hold("Palm up; draw fingers back gently; repeat the other wrist", change(seatedPike, {
    le: p(344, 250), lw: p(292, 230), re: p(360, 254), rw: p(298, 230),
  }), 420, undefined, gazeLeft),
  "forearm-pronator-stretch": dynamic("Rotate palm up and down without forcing; repeat the other forearm", [
    change(standing, { le: p(282, 208), lw: p(340, 220), re: p(358, 208), rw: p(300, 220) }),
    change(standing, { le: p(282, 208), lw: p(340, 198), re: p(358, 208), rw: p(300, 242) }),
  ], 486, undefined, 4, p(13, 0)),
  "crossbody-shoulder-stretch": hold("Draw one arm across without lifting the shoulder; repeat the other side", change(standing, {
    le: p(352, 184), lw: p(408, 190), re: p(338, 214), rw: p(370, 186),
  }), 486, undefined, p(13, 0)),
  "supine-thoracic-opener": hold("Let the upper back open; breathe softly", change(supine, {
    le: p(420, 286), lw: p(400, 210), re: p(446, 290), rw: p(466, 214), lk: p(270, 360), la: p(250, 414), rk: p(286, 370), ra: p(268, 416),
  }), 426, undefined, p(0, -12)),
  "supine-90-90-breathing-reset": hold("Feet supported on the wall; hips and knees stay near 90 degrees", change(supine, {
    le: p(430, 330), lw: p(366, 310), re: p(444, 344), rw: p(380, 324),
    lh: p(306, 372), lk: p(386, 330), la: p(558, 330),
    rh: p(320, 386), rk: p(400, 344), ra: p(558, 344),
  }), 426, "wall", gazeCeiling),

  // Optional five-minute Calisthenics Lab (16)
  "controlled-parallette-pushup": dynamic("Lower between the bars; stop at a safe depth", [plank, change(plank, {
    head: p(500, 282), neck: p(466, 296), ls: p(432, 308), le: p(470, 350), lw: p(434, 400), rs: p(448, 312), re: p(486, 354), rw: p(456, 400), lh: p(294, 330), rh: p(308, 338),
  })], 420, "parallettes", 4.4, p(10, 7)),
  "parallette-pike-pushup": dynamic("Head travels forward between the bars", [pike, change(pike, {
    head: p(476, 330), neck: p(444, 310), ls: p(414, 296), le: p(470, 340), lw: p(438, 400), rs: p(432, 302), re: p(486, 346), rw: p(456, 400),
  })], 420, "parallettes", 4.6, p(9, 8)),
  "planche-lean-hold": hold("Lean as one line; elbows locked", plancheLean, 420, "parallettes", p(10, 7)),
  "frog-stand-hold": hold("Knees supported; gaze slightly forward", frog, 420, "parallettes", p(13, 1)),
  "frog-stand-weight-shift": dynamic("Shift a few centimetres without jumping", [frog, change(frog, {
    head: p(526, 250), neck: p(488, 268), ls: p(452, 280), rs: p(470, 286), lh: p(358, 278), rh: p(374, 288),
  })], 420, "parallettes", 4, p(13, 1)),
  "foot-assisted-lsit": hold("Press tall; keep only light heel assistance", change(lSit, {
    la: p(98, 400), ra: p(110, 404),
  }), 420, "parallettes", gazeLeft),
  "alternating-lsit-extension": dynamic("Extend one knee while the other stays tucked", [tuckSupport, change(tuckSupport, {
    lk: p(248, 326), la: p(112, 318),
  }), change(tuckSupport, { rk: p(258, 336), ra: p(122, 328) })], 420, "parallettes", 4.6, gazeLeft),
  "tuck-to-one-leg-lsit-transition": dynamic("Extend one leg from a stable tuck, return, then change legs", [
    tuckSupport,
    change(lSit, { rk: p(380, 352), ra: p(340, 386) }),
    tuckSupport,
    change(lSit, { lk: p(366, 344), la: p(328, 380) }),
  ], 420, "parallettes", 6, gazeLeft),
  "eccentric-pike-pushup": dynamic("Lower for the full count, place knees down, then reset safely", [pike, change(pike, {
    head: p(476, 312), neck: p(444, 300), ls: p(414, 292), le: p(472, 340), lw: p(438, 400), rs: p(432, 298), re: p(488, 346), rw: p(456, 400),
  }), change(pike, {
    head: p(474, 348), neck: p(442, 324), ls: p(412, 306), le: p(482, 352), lw: p(438, 400), rs: p(430, 312), re: p(498, 358), rw: p(456, 400),
  }), change(quadruped, {
    head: p(474, 292), neck: p(444, 310), ls: p(416, 326), le: p(430, 356), lw: p(438, 400),
    rs: p(434, 332), re: p(448, 360), rw: p(456, 400), lh: p(296, 324), rh: p(314, 332),
    lk: p(236, 400), la: p(170, 410), rk: p(254, 402), ra: p(188, 414),
  })], 420, "parallettes", 7, p(9, 8)),
  "pseudo-planche-parallette-pushup": dynamic("Lean first; bend without losing the body line", [plancheLean, change(plancheLean, {
    head: p(530, 278), neck: p(494, 290), ls: p(460, 300), le: p(486, 346), lw: p(438, 400), rs: p(478, 304), re: p(502, 350), rw: p(456, 400), lh: p(314, 326), rh: p(328, 334),
  })], 420, "parallettes", 4.8, p(10, 7)),
  "planche-lean-toe-lightener": (() => {
    const loadedLean = change(plancheLean, {
      head: p(538, 216), neck: p(502, 236), ls: p(474, 254), rs: p(492, 258),
    });
    return dynamic("Lean until one toe becomes light; replace it before alternating—never hop", [
      loadedLean,
      change(loadedLean, { la: p(82, 382) }),
      loadedLean,
      change(loadedLean, { ra: p(102, 382) }),
    ], 420, "parallettes", 5.4, p(10, 7));
  })(),
  "foot-assisted-tuck-planche": hold("Push tall; keep one toe as a safety contact", change(tuckPlanche, {
    la: p(330, 398), ra: p(378, 338),
  }), 420, "parallettes", p(12, 4)),
  "one-leg-lsit-hold": hold("One leg long; shoulders remain tall; repeat the other side", change(lSit, {
    rk: p(382, 350), ra: p(338, 386),
  }), 420, "parallettes", gazeLeft),
  "full-lsit-attempt": hold("Press tall before both straight legs float", lSit, 420, "parallettes", gazeLeft),
  "tuck-to-lsit-transition": dynamic("Extend and return without swinging", [tuckSupport, change(lSit, {
    lk: p(278, 306), la: p(168, 302), rk: p(292, 316), ra: p(180, 312),
  }), lSit], 420, "parallettes", 5, gazeLeft),
  "straddle-lsit-compression-prep": dynamic("Open to straddle; lift from the hips", [tuckSupport, change(seatedPike, {
    lk: p(222, 322), la: p(82, 288), rk: p(250, 326), ra: p(132, 374),
  })], 420, "parallettes", 4.8, gazeLeft),
} as const;

const existingTechniqueGuides = {
  // Existing photo/GIF drills that need an unambiguous technically correct fallback.
  "pike-shift": dynamic("Feet grounded; shoulders glide past locked elbows", [pike, change(pike, {
    head: p(512, 236), neck: p(480, 256), ls: p(454, 270), rs: p(472, 276), le: p(446, 334), re: p(462, 337), lh: p(296, 158), rh: p(314, 166),
  })], 420, "parallettes", 4.2, p(9, 8)),
  "support-hold": hold("Straight arms; feet remain grounded in front for assistance", support, 420, "parallettes", gazeLeft),
  "bent-compression": dynamic("Press down; lift bent knees without swinging", [seatedPike, change(seatedPike, {
    lh: p(342, 324), lk: p(286, 306), la: p(318, 370), rh: p(360, 332), rk: p(302, 314), ra: p(334, 378),
  })], 420, "parallettes", 4, gazeLeft),
  "hollow-tuck": hold("Face the ceiling; lower back stays pressed down", change(supine, {
    head: p(504, 366), neck: p(466, 354), le: p(438, 332), lw: p(376, 316), re: p(450, 346), rw: p(388, 330),
    lk: p(342, 316), la: p(362, 266), rk: p(356, 330), ra: p(376, 280),
  }), 426, undefined, p(0, -12)),
  "wall-l": hold("Feet contact the wall; hips stack over shoulders; eyes look between bars", invertedL, 420, ["wall", "parallettes"], gazeFloor),
  "support-shrugs": dynamic("Elbows locked; press tall then lower slightly", [support, change(support, {
    head: p(430, 154), neck: p(426, 198), ls: p(408, 234), rs: p(438, 236),
  })], 420, "parallettes", 3.8, gazeLeft),
  "box-pike": hold("Feet stay on wall; shoulders stack over hands; eyes look between bars", invertedL, 420, ["wall", "parallettes"], gazeFloor),
  "tuck-support": hold("Press tall; knees lift in front without swinging", tuckSupport, 420, "parallettes", gazeLeft),
  "straight-compression": dynamic("Locked knees; lift from the hips", [seatedPike, change(seatedPike, {
    lk: p(226, 322), la: p(92, 314), rk: p(242, 332), ra: p(108, 324),
  })], 420, "parallettes", 4, gazeLeft),
  "box-toe-light": dynamic("Shift shoulders, peel one foot, replace it, then change sides", [
    invertedL,
    change(invertedL, { ls: p(431, 292), rs: p(448, 298), head: p(490, 260), neck: p(459, 278), la: p(520, 196) }),
    invertedL,
    change(invertedL, { ls: p(431, 292), rs: p(448, 298), head: p(490, 260), neck: p(459, 278), ra: p(522, 204) }),
  ], 420, ["wall", "parallettes"], 5.6, gazeFloor),
  "kneeling-lean": dynamic("Load shoulders with straight arms", [quadruped, change(quadruped, {
    head: p(534, 204), neck: p(496, 224), ls: p(466, 244), rs: p(482, 250), le: p(450, 318), re: p(466, 322), lh: p(300, 250), rh: p(318, 260),
  })], 420, "parallettes", 4.2, p(10, 7)),
  "partial-wall-walk": dynamic("Feet stay on the wall; climb only to control", [change(plank, {
    la: p(558, 360), ra: p(558, 376), lh: p(360, 290), rh: p(376, 300), lk: p(470, 326), rk: p(486, 336), head: p(360, 220), neck: p(390, 236), ls: p(418, 250), rs: p(434, 256)
  }), invertedL], 420, ["wall", "parallettes"], 5.2, [gazeFloorForward, gazeFloor]),
  "wall-alignment": hold("Chest faces wall; toes maintain light contact", wallHandstand, 420, ["wall", "parallettes"], p(0, 12)),
  "chest-wall-line": hold("Chest faces wall; toes touch lightly; body stays hollow", wallHandstand, 420, ["wall", "parallettes"], p(0, 12)),
  "frog-prep": dynamic("Gaze forward; keep toes available", [change(frog, {
    la: p(330, 400), ra: p(350, 404),
  }), frog], 420, "parallettes", 4.2, p(13, 1)),
  "pike-elevation": dynamic("Straight arms; shoulders press toward ears", [pike, change(pike, {
    head: p(466, 246), neck: p(438, 266), ls: p(414, 286), rs: p(432, 292),
  })], 420, "parallettes", 3.8, p(9, 8)),
  "supported-knee-raise": dynamic("Curl pelvis as knees rise in front; no swing", [support, tuckSupport], 420, "parallettes", 4.4, gazeLeft),
  "plank-knee-elbow": dynamic("Bring one knee toward its elbow, return to plank, then alternate", [
    plank,
    change(plank, { rh: p(310, 302), rk: p(385, 320), ra: p(420, 350) }),
    plank,
    change(plank, { lh: p(296, 294), lk: p(377, 310), la: p(412, 342) }),
  ], 420, "parallettes", 5.6, p(10, 7)),
  "boat-hold": hold("Chest stays lifted; gaze forward rather than down", change(seatedPike, {
    head: p(414, 186), neck: p(400, 224), ls: p(382, 246), rs: p(414, 250),
    le: p(330, 268), lw: p(258, 282), re: p(346, 278), rw: p(274, 292),
    lh: p(342, 326), lk: p(278, 280), la: p(226, 224), rh: p(360, 334), rk: p(296, 290), ra: p(244, 234),
  }), 420, undefined, gazeLeft),
  "side-plank": hold("Feet stay on the floor; unused bar remains clear; repeat the other side", sidePlank, 420, "parallettes", p(11, 2)),
  "wall-elevation": dynamic("Elbows locked; elevate through the shoulders", [wallHandstand, change(wallHandstand, {
    head: p(468, 346), neck: p(468, 317), ls: p(449, 298), rs: p(472, 298), lh: p(482, 198), rh: p(498, 200),
  })], 420, ["wall", "parallettes"], 3.8, p(0, 12)),
  "wall-kickup": dynamic("Grip both bars before the feet leave; step both feet down to finish", [pike, kickupStart, kickupSplit, wallHandstand], 420, ["wall", "parallettes"], 6.4, [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor]),
  "chest-wall": hold("Chest faces wall; ribs in; toes touch lightly", wallHandstand, 420, ["wall", "parallettes"], p(0, 12)),
  "tuck-support-2": hold("Press tall; lift knees in front without leaning back", tuckSupport, 420, "parallettes", gazeLeft),
  "single-leg-compression": dynamic("One locked knee lifts at a time", [seatedPike, change(seatedPike, {
    lk: p(220, 304), la: p(92, 282),
  }), change(seatedPike, { rk: p(236, 314), ra: p(108, 292) })], 420, "parallettes", 4.6, gazeLeft),
  "heel-pullaway": dynamic("Face away; pull heels a few centimetres; return before arching", [wallHandstand, change(wallHandstand, {
    lk: p(494, 112), la: p(510, 54), rk: p(508, 116), ra: p(522, 62),
  })], 420, ["wall", "parallettes"], 4.4, p(-8, 12)),
  "down-dog-scapular-shrugs": dynamic("Keep elbows locked; glide shoulders toward and away from ears", [pike, change(pike, {
    head: p(476, 250), neck: p(446, 270), ls: p(420, 290), rs: p(438, 296),
  }), pike], 420, undefined, 4.2, p(9, 8)),
  "full-wall-walk": dynamic("Keep feet on the wall; walk in and back out under control", [change(plank, {
    la: p(558, 360), ra: p(558, 376), lh: p(360, 290), rh: p(376, 300), lk: p(470, 326), rk: p(486, 336), head: p(360, 220), neck: p(390, 236), ls: p(418, 250), rs: p(434, 256),
  }), invertedL, wallHandstand, invertedL], 420, ["wall", "parallettes"], 6.4, [gazeFloorForward, gazeFloor, gazeFloor, gazeFloor]),
  "one-foot-assisted-lsit": hold("Press tall; one straight leg floats while the other foot assists; repeat the other side", change(support, {
    lk: p(276, 328), la: p(132, 318), rk: p(308, 374), ra: p(286, 418),
  }), 420, "parallettes", gazeLeft),
  "tuck-support-knee-extensions": dynamic("Keep the tuck high; extend one knee at a time without swinging", [tuckSupport, change(tuckSupport, {
    lk: p(274, 326), la: p(124, 316),
  }), tuckSupport, change(tuckSupport, { rk: p(292, 336), ra: p(142, 326) })], 420, "parallettes", 5.2, gazeLeft),
  "shallow-range-pike-pushup": dynamic("Use a shallow head path; keep hips high and feet grounded", [pike, change(pike, {
    head: p(470, 304), neck: p(442, 316), ls: p(416, 326), rs: p(434, 332), le: p(452, 350), re: p(470, 356),
  }), pike], 420, "parallettes", 4.8, p(9, 8)),
  "straddle-planche-lean": hold("Lean with locked elbows; wide feet stay grounded", change(plancheLean, {
    lk: p(206, 330), la: p(76, 392), rk: p(224, 350), ra: p(130, 418),
  }), 420, "parallettes", p(10, 7)),
  "support-to-tuck-transition": dynamic("Press tall before both knees lift in front; return without dropping", [support, tuckSupport, support], 420, "parallettes", 4.8, gazeLeft),
  "seated-pike-breathing-reset": hold("Sit tall, look toward the legs and use a long exhale", seatedPike, 420, undefined, gazeLeft),
} as const;

const v2ExpansionGuideIds = [
  "cat-cow-flow", "bear-shoulder-circles", "prone-y-t-w-raises", "easy-rope-bounce", "wall-shoulder-flexion-line-drill", "prone-handstand-line-hold", "bear-shoulder-tap", "down-dog-to-pike-weight-shift", "floor-frog-stand-setup", "wall-split-kick-entry-rehearsal",
  "forearm-plank", "rkc-plank", "plank-reach", "plank-leg-lift", "forearm-plank-body-saw", "bird-dog", "bird-dog-knee-to-elbow", "bear-crawl-step", "reverse-crunch", "bent-knee-leg-lower", "straight-leg-raise", "tuck-up", "controlled-v-up", "alternating-jackknife", "supine-toe-reach", "heel-touches", "bicycle-crunch-slow", "side-plank-star-hold", "side-plank-knee-drive", "forearm-side-plank", "glute-bridge-march", "single-leg-glute-bridge", "reverse-plank-hold", "prone-swimmer",
  "floor-seated-knee-lift", "floor-single-leg-pike-lift", "floor-double-leg-pike-lift", "straddle-pike-pulses", "seated-pike-hold-lift-off", "floor-tuck-v-sit-balance", "floor-chest-wall-handstand-hold", "floor-back-wall-heel-pull", "floor-chest-wall-toe-pull", "floor-wall-weight-shift", "floor-controlled-kick-up-to-wall", "floor-freestanding-kick-up", "floor-freestanding-balance-attempt", "floor-side-exit-practice", "knee-push-up", "floor-push-up", "tempo-floor-push-up", "floor-pike-push-up", "floor-planche-lean", "floor-frog-stand", "floor-crane-one-knee-float", "floor-tuck-planche-attempt",
  "supine-spinal-twist", "sphinx-breathing-hold", "kneeling-hip-flexor-stretch", "seated-straddle-fold-gentle", "shoulder-wall-lat-stretch", "basic-two-foot-bounce", "alternate-foot-step", "boxer-step", "side-to-side-ski-hop", "forward-back-hop", "high-knee-rope", "fast-single-under-cadence", "recovery-bounce", "rope-step-through-mobility",
] as const;

const expansionGuide = (id: (typeof v2ExpansionGuideIds)[number]): Guide => {
  if (id === "cat-cow-flow") return dynamic("Round and extend the spine slowly", [quadruped, change(quadruped, { head: p(480, 230), neck: p(438, 250), ls: p(402, 272), rs: p(420, 278), lh: p(282, 220), rh: p(300, 230) }), change(quadruped, { head: p(516, 184), neck: p(474, 210), ls: p(434, 232), rs: p(450, 238), lh: p(282, 278), rh: p(300, 288) })], 420, undefined, 5, p(10, 4));
  if (id === "bear-shoulder-circles") return dynamic("Hands and toes stay planted through small shoulder circles", [
    bearHover,
    change(bearHover, { head: p(500, 198), neck: p(462, 216), ls: p(434, 236), rs: p(450, 242), lh: p(288, 248), rh: p(306, 258) }),
    change(bearHover, { head: p(486, 212), neck: p(446, 232), ls: p(416, 252), rs: p(432, 258), lh: p(278, 250), rh: p(296, 260) }),
  ], 420, undefined, 4.8, p(10, 6));
  if (id === "prone-y-t-w-raises") return dynamic("Lift into Y, T and W without arching", [
    prone,
    change(prone, { le: p(476, 342), lw: p(552, 310), re: p(484, 356), rw: p(558, 326) }),
    change(prone, { le: p(444, 330), lw: p(444, 268), re: p(454, 344), rw: p(454, 282) }),
    change(prone, { le: p(454, 334), lw: p(414, 296), re: p(464, 348), rw: p(424, 310) }),
  ], 426, undefined, 6.4, p(0, 10));
  if (["easy-rope-bounce", "basic-two-foot-bounce", "alternate-foot-step", "boxer-step", "side-to-side-ski-hop", "forward-back-hop", "high-knee-rope", "fast-single-under-cadence", "recovery-bounce", "rope-step-through-mobility"].includes(id)) {
    const low = change(standing, { lk: p(292, 390), la: p(282, 462), rk: p(348, 390), ra: p(358, 462), le: p(276, 226), lw: p(242, 280), re: p(364, 226), rw: p(398, 280) });
    const airborne = change(low, { head: p(320, 66), neck: p(320, 108), ls: p(284, 126), rs: p(356, 126), lh: p(302, 273), rh: p(338, 273), lk: p(292, 370), rk: p(348, 370), la: p(282, 448), ra: p(358, 448) });
    if (id === "rope-step-through-mobility") return dynamic("Guide the rope overhead through a comfortable shoulder range", [change(standing, { le: p(274, 176), lw: p(250, 104), re: p(366, 176), rw: p(390, 104) }), change(standing, { le: p(294, 102), lw: p(304, 42), re: p(346, 102), rw: p(336, 42) }), change(standing, { le: p(278, 196), lw: p(250, 260), re: p(362, 196), rw: p(390, 260) })], 486, "rope", 5.4, p(13, 0));
    if (id === "alternate-foot-step") return dynamic("Alternate feet in a relaxed jogging rhythm", [low, change(low, { lk: p(286, 356), la: p(278, 420), rk: p(350, 394), ra: p(360, 462) }), change(low, { rk: p(354, 356), ra: p(362, 420), lk: p(290, 394), la: p(280, 462) })], 486, "rope", 3.8, p(13, 0));
    if (id === "boxer-step") return dynamic("Shift weight softly from side to side", [change(low, { lh: p(294, 282), rh: p(330, 290), la: p(270, 462), ra: p(348, 458) }), change(low, { lh: p(310, 282), rh: p(346, 290), la: p(292, 458), ra: p(370, 462) })], 486, "rope", 3.8, p(13, 0));
    if (id === "side-to-side-ski-hop") return dynamic("Make small two-foot lateral hops", [shifted(low, -18, 0), shifted(airborne, 0, 0), shifted(low, 18, 0)], 486, "rope", 3.4, p(13, 0));
    if (id === "forward-back-hop") return dynamic("Hop a few centimetres forward and back", [shifted(low, -10, 0), shifted(airborne, 0, 0), shifted(low, 12, 0)], 486, "rope", 3.4, p(13, 0));
    if (id === "high-knee-rope") return dynamic("Lift one knee at a time while staying tall", [change(low, { lk: p(306, 326), la: p(324, 374) }), change(low, { rk: p(334, 326), ra: p(316, 374) })], 486, "rope", 3.2, p(13, 0));
    if (id === "fast-single-under-cadence") return dynamic("Quick low jumps; speed comes from the wrists", [low, change(airborne, { head: p(320, 72), neck: p(320, 114), la: p(282, 454), ra: p(358, 454) }), low], 486, "rope", 2.2, p(13, 0));
    if (id === "recovery-bounce") return dynamic("Use a very relaxed low recovery bounce", [low, change(airborne, { head: p(320, 72), neck: p(320, 114), la: p(282, 456), ra: p(358, 456) }), low], 486, "rope", 4.8, p(13, 0));
    return dynamic("Turn from the wrists; use low symmetrical jumps", [low, airborne, low], 486, "rope", 3.8, p(13, 0));
  }
  if (id === "wall-shoulder-flexion-line-drill") return dynamic("Ribs stay controlled; hands slide up the wall", [wallStandingSide, change(wallStandingSide, { le: p(500, 126), lw: p(558, 70), re: p(514, 138), rw: p(558, 84) })], 486, "wall", 4.4, p(13, 0));
  if (id === "prone-handstand-line-hold") return hold("Long prone hollow line; arms reach overhead with the face toward the mat", change(prone, { le: p(480, 350), lw: p(560, 328), re: p(488, 364), rw: p(568, 344), lk: p(198, 382), la: p(78, 388), rk: p(212, 396), ra: p(92, 402) }), 426, undefined, p(0, 10));
  if (id === "bear-shoulder-tap") return dynamic("Tap slowly without rotating the torso", [bearHover, change(bearHover, { le: p(454, 282), lw: p(414, 246) }), change(bearHover, { re: p(438, 286), rw: p(396, 250) })], 420, undefined, 4.8, p(10, 6));
  if (id === "down-dog-to-pike-weight-shift") return dynamic("Elbows locked; shoulders glide toward hands", [pike, change(pike, { head: p(520, 236), neck: p(486, 254), ls: p(456, 270), rs: p(474, 276), lh: p(296, 170), rh: p(314, 178) })], 420, undefined, 4.5, p(9, 8));
  if (id === "floor-frog-stand-setup" || id === "floor-frog-stand") return dynamic("Knees rest lightly on arms; return feet safely", [change(frog, { la: p(330, 402), ra: p(350, 406) }), frog], 420, undefined, 4.8, p(13, 1));
  if (id === "floor-crane-one-knee-float") return dynamic("Float one knee, replace it, then change sides", [
    frog,
    change(frog, { rh: p(366, 250), rk: p(414, 286), ra: p(374, 338) }),
    frog,
    change(frog, { lh: p(350, 242), lk: p(402, 278), la: p(362, 332) }),
  ], 420, undefined, 5.8, p(13, 1));
  if (id === "floor-tuck-planche-attempt") return dynamic("Press tall; float briefly with locked elbows", [change(tuckPlanche, { la: p(330, 402) }), tuckPlanche], 420, undefined, 4.8, p(12, 4));
  if (id === "wall-split-kick-entry-rehearsal" || id === "floor-controlled-kick-up-to-wall") return dynamic("Kick softly to the wall, then replace both feet under control", [pike, kickupStart, kickupSplit, wallHandstand], 420, "wall", 6.4, [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor]);
  if (id.startsWith("floor-") && id.includes("wall") && (id.includes("handstand") || id.includes("pull") || id.includes("shift"))) {
    if (id.includes("heel")) return dynamic("Face away; peel heels gently and return", [wallHandstand, change(wallHandstand, { la: p(514, 52), ra: p(526, 60) })], 420, "wall", 4.6, p(-8, 12));
    if (id.includes("toe")) return dynamic("Face the wall; pull toes away without pushing", [wallHandstand, change(wallHandstand, { la: p(532, 50), ra: p(540, 58) })], 420, "wall", 4.6, p(8, 12));
    if (id.includes("shift")) return dynamic("Shift a few centimetres while hands and wall-contact feet stay planted", [wallHandstand, wallBodyShift(-8), wallBodyShift(8)], 420, "wall", 4.6, gazeFloor);
    return hold("Active shoulders; chest faces wall; toes touch lightly", wallHandstand, 420, "wall", p(8, 12));
  }
  if (id === "floor-freestanding-kick-up") return dynamic("Kick to a stacked line, then replace both feet one at a time", [pike, kickupStart, kickupSplit, freeHandstandBalance], 420, undefined, 7, [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor]);
  if (id === "floor-freestanding-balance-attempt") {
    return dynamic("Enter calmly; hands stay planted through tiny corrections; replace both feet to finish", [pike, kickupStart, kickupSplit, freeHandstandBalance, freeBalanceShift(freeHandstandBalance, -5), freeBalanceShift(freeHandstandBalance, 4)], 420, undefined, 8, [gazeFloorForward, gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloor]);
  }
  if (id === "floor-side-exit-practice") return dynamic("Turn the hips and land one foot at a time with each lead leg", [
    kickupSplit,
    change(kickupSplit, { lk: p(540, 160), la: p(558, 132), rk: p(402, 242), ra: p(306, 294) }),
    change(kickupStart, { rh: p(326, 264), rk: p(390, 330), ra: p(470, 400) }),
    kickupSplit,
    change(kickupSplit, { lk: p(402, 242), la: p(306, 294), rk: p(540, 160), ra: p(558, 132) }),
    change(kickupStart, {
      lh: p(304, 256), lk: p(390, 330), la: p(470, 400),
      rh: p(324, 264), rk: p(210, 328), ra: p(112, 400),
    }),
  ], 420, undefined, 8, [gazeFloor, gazeFloor, gazeFloorForward, gazeFloor, gazeFloor, gazeFloorForward]);
  if (id.includes("side-plank")) {
    if (id.includes("knee-drive")) return dynamic("Keep hips lifted as the top knee drives; repeat the other side", [sidePlank, change(sidePlank, { rk: p(326, 286), ra: p(390, 310) })], 420, undefined, 4.5, p(11, 2));
    if (id.includes("star")) return hold("Lift the top leg without losing the body line; repeat the other side", change(sidePlank, { rk: p(248, 250), ra: p(138, 188) }), 420, undefined, p(11, 2));
    if (id.includes("forearm")) return hold("Forearm planted; shoulder stacked; repeat the other side", forearmSidePlank, 420, undefined, p(11, 2));
    return hold("Shoulder stacked; body stays in one line; repeat the other side", sidePlank, 420, undefined, p(11, 2));
  }
  if (id.includes("bird-dog")) {
    const leftArmRightLeg = change(quadruped, { le: p(484, 212), lw: p(552, 188), rk: p(204, 278), ra: p(92, 250) });
    const leftElbowRightKnee = change(quadruped, { le: p(402, 274), lw: p(360, 300), rk: p(330, 300), ra: p(370, 332) });
    const rightArmLeftLeg = change(quadruped, { re: p(500, 220), rw: p(568, 196), lk: p(190, 268), la: p(78, 238) });
    const rightElbowLeftKnee = change(quadruped, { re: p(414, 282), rw: p(372, 308), lk: p(314, 292), la: p(354, 326) });
    const poses = id.includes("knee-to-elbow")
      ? [quadruped, leftArmRightLeg, leftElbowRightKnee, leftArmRightLeg, quadruped, rightArmLeftLeg, rightElbowLeftKnee, rightArmLeftLeg]
      : [quadruped, leftArmRightLeg, quadruped, rightArmLeftLeg];
    return dynamic("Reach opposite arm and leg, return with square hips, then alternate sides", poses, 420, undefined, id.includes("knee-to-elbow") ? 8 : 6, p(10, 6));
  }
  if (id.includes("bear-crawl")) return dynamic("Keep knees low through small opposite hand-and-foot steps", [
    bearHover,
    change(bearHover, { le: p(442, 310), lw: p(458, 400), rk: p(296, 346), ra: p(246, 394) }),
    change(bearHover, { re: p(464, 314), rw: p(480, 400), lk: p(276, 340), la: p(218, 392) }),
  ], 420, undefined, 5, p(10, 6));
  if (id.includes("plank") && !id.includes("reverse")) {
    if (id.includes("forearm") || id === "rkc-plank") return id.includes("saw") ? dynamic("Forearms stay planted as the rigid body shifts", [forearmPlank, forearmSawBack], 420, undefined, 4.4, gazeFloorForward) : hold("Forearms planted; ribs tucked; glutes active", forearmPlank, 420, undefined, gazeFloorForward);
    if (id.includes("reach")) return dynamic("Reach one arm without rotating the hips", [plank, change(plank, { le: p(474, 250), lw: p(554, 222) })], 420, undefined, 4.4, p(10, 7));
    if (id.includes("leg-lift")) return dynamic("Lift one straight leg without arching, replace it, then alternate", [
      plank,
      change(plank, { lk: p(180, 300), la: p(74, 270) }),
      plank,
      change(plank, { rk: p(194, 310), ra: p(92, 280) }),
    ], 420, undefined, 5.6, p(10, 7));
    return hold("Maintain a straight, braced plank", plank, 420, undefined, p(10, 7));
  }
  if (id === "glute-bridge-march") return dynamic("Keep hips lifted while alternating one controlled march", [
    bridge,
    change(bridge, { rk: p(300, 292), ra: p(314, 236) }),
    bridge,
    change(bridge, { lk: p(282, 282), la: p(296, 226) }),
  ], 426, undefined, 5.2, gazeCeiling);
  if (id === "single-leg-glute-bridge") {
    const singleDown = change(supine, { rk: p(286, 260), ra: p(300, 190) });
    const singleUp = change(bridge, { rk: p(286, 260), ra: p(300, 190) });
    return dynamic("Keep one leg raised as the planted foot lifts and lowers the hips", [singleDown, singleUp], 426, undefined, 4.8, gazeCeiling);
  }
  if (id === "reverse-plank-hold") return hold("Hips lifted; shoulders controlled; body long", reversePlank, 420, undefined, p(5, -11));
  if (id === "prone-swimmer") return dynamic("Alternate a small arm and leg lift", [prone, change(prone, { le: p(420, 330), lw: p(500, 290), rk: p(210, 370), ra: p(90, 350) }), change(prone, { re: p(432, 344), rw: p(512, 304), lk: p(196, 356), la: p(76, 336) })], 426, undefined, 5, p(0, 10));
  if (id === "floor-seated-knee-lift") {
    const bent = change(seatedPike, { lk: p(250, 314), la: p(284, 368), rk: p(270, 324), ra: p(304, 378) });
    return dynamic("Keep the chest tall; draw both bent knees upward", [bent, change(bent, { lk: p(270, 270), la: p(306, 326), rk: p(290, 280), ra: p(326, 336) }), bent], 420, undefined, 4.8, gazeLeft);
  }
  if (id === "floor-single-leg-pike-lift") return dynamic("Lift one locked leg, replace the heel, then change sides", [
    seatedPike,
    change(seatedPike, { lk: p(220, 296), la: p(88, 270) }),
    seatedPike,
    change(seatedPike, { rk: p(236, 306), ra: p(104, 280) }),
  ], 420, undefined, 5.6, gazeLeft);
  if (id === "floor-double-leg-pike-lift") return dynamic("Lift both straight heels together without leaning back", [seatedPike, change(seatedPike, { lk: p(220, 286), la: p(88, 258), rk: p(238, 296), ra: p(106, 268) }), seatedPike], 420, undefined, 4.8, gazeLeft);
  if (id === "straddle-pike-pulses") {
    const straddle = change(seatedPike, { lk: p(214, 330), la: p(82, 380), rk: p(250, 338), ra: p(142, 416) });
    return dynamic("Keep both knees locked; pulse the wide heels clear of the floor", [straddle, change(straddle, { la: p(78, 354), ra: p(136, 390) }), straddle], 420, undefined, 4.6, gazeLeft);
  }
  if (id === "seated-pike-hold-lift-off") return dynamic("Press down, float both straight heels briefly, then return without leaning back", [
    seatedPike,
    change(seatedPike, { lk: p(220, 286), la: p(88, 258), rk: p(238, 296), ra: p(106, 268) }),
  ], 420, undefined, 4.8, gazeLeft);
  if (id === "floor-tuck-v-sit-balance") return hold("Balance on the sitting bones; hands reach forward and do not support the floor", floorTuckVSit, 420, undefined, gazeLeft);
  if (id.includes("push-up")) {
    const base = id.includes("pike") ? pike : id.includes("knee") ? change(plank, { lk: p(210, 400), la: p(150, 412), rk: p(228, 404), ra: p(168, 416) }) : plank;
    const lowered = id.includes("pike")
      ? change(base, { head: p(510, 326), neck: p(478, 310), ls: p(446, 302), rs: p(464, 308), le: p(478, 350), re: p(496, 356) })
      : change(base, { head: p(base.head.x, base.head.y + 62), neck: p(base.neck.x, base.neck.y + 52), ls: p(base.ls.x, base.ls.y + 46), rs: p(base.rs.x, base.rs.y + 46), le: p(base.le.x + 34, base.le.y + 16), re: p(base.re.x + 34, base.re.y + 16), lh: p(base.lh.x, base.lh.y + 38), rh: p(base.rh.x, base.rh.y + 38) });
    return dynamic(id.includes("pike") ? "Hips stay high as the head travels forward between the hands" : "Lower and press as one controlled unit", [base, lowered], 420, undefined, id.includes("tempo") ? 6 : 4.5, gazeFloorForward);
  }
  if (id === "floor-planche-lean") return hold("Protract and lean with elbows locked", plancheLean, 420, undefined, p(10, 7));
  if (id.includes("spinal-twist")) return hold("Let bent knees rest to one side and breathe; repeat the other side", change(supine, { lk: p(330, 370), la: p(390, 408), rk: p(344, 384), ra: p(404, 416) }), 426, undefined, p(0, -12));
  if (id.includes("sphinx")) return hold("Elbows stay under shoulders; forearms reach forward as the chest lifts gently", change(prone, {
    head: p(500, 302), neck: p(462, 322), ls: p(430, 344), rs: p(444, 356),
    le: p(438, 400), lw: p(520, 400), re: p(454, 406), rw: p(536, 406),
  }), 426, undefined, p(10, -6));
  if (id.includes("hip-flexor")) return hold("Back knee grounded; glute engaged; pelvis controlled; repeat the other leg", halfKneeling, 486, undefined, p(13, 0));
  if (id.includes("straddle-fold")) return hold("Hinge forward gently with long breaths", { head: p(320, 260), neck: p(320, 292), ls: p(292, 310), le: p(280, 346), lw: p(252, 382), rs: p(348, 310), re: p(360, 346), rw: p(388, 382), lh: p(306, 350), lk: p(206, 366), la: p(72, 404), rh: p(334, 350), rk: p(434, 366), ra: p(568, 404) }, 426, undefined, p(0, 10));
  if (id.includes("wall-lat")) return hold("Hands on wall; hips travel back; ribs stay controlled", { head: p(430, 300), neck: p(402, 318), ls: p(372, 330), le: p(474, 286), lw: p(558, 244), rs: p(388, 338), re: p(486, 300), rw: p(558, 258), lh: p(306, 310), lk: p(230, 374), la: p(150, 420), rh: p(324, 320), rk: p(250, 384), ra: p(170, 426) }, 426, "wall", p(10, 4));
  if (id === "reverse-crunch") {
    const tabletop = change(supine, { lk: p(304, 310), la: p(326, 236), rk: p(322, 320), ra: p(344, 246) });
    const curled = change(tabletop, { lh: p(280, 354), rh: p(298, 364), lk: p(354, 276), la: p(330, 210), rk: p(372, 286), ra: p(348, 220) });
    return dynamic("Curl the pelvis; bring knees toward the chest without swinging", [tabletop, curled, tabletop], 426, undefined, 4.8, p(0, -12));
  }
  if (id === "bent-knee-leg-lower") {
    const tabletop = change(supine, { lk: p(304, 304), la: p(328, 226), rk: p(322, 314), ra: p(346, 236) });
    const lowered = change(supine, { lk: p(246, 350), la: p(176, 374), rk: p(264, 360), ra: p(194, 384) });
    return dynamic("Lower bent legs only while the lower back stays heavy", [tabletop, lowered, tabletop], 426, undefined, 5.2, p(0, -12));
  }
  if (id === "straight-leg-raise") {
    const low = change(supine, { lk: p(218, 374), la: p(92, 370), rk: p(232, 388), ra: p(106, 384) });
    const raised = change(supine, { lk: p(270, 264), la: p(266, 128), rk: p(288, 274), ra: p(284, 138) });
    return dynamic("Keep knees straight; raise and lower without arching", [low, raised, low], 426, undefined, 5.2, p(0, -12));
  }
  if (id === "tuck-up") {
    const long = change(supine, { le: p(462, 366), lw: p(542, 352), re: p(474, 380), rw: p(554, 366), lk: p(220, 374), la: p(92, 370), rk: p(234, 388), ra: p(106, 384) });
    const tuck = change(long, { head: p(410, 286), neck: p(382, 318), ls: p(356, 340), rs: p(372, 352), le: p(340, 314), lw: p(316, 276), re: p(354, 326), rw: p(330, 288), lh: p(302, 340), lk: p(330, 292), la: p(300, 236), rh: p(320, 350), rk: p(348, 302), ra: p(318, 246) });
    return dynamic("Close ribs and knees together; return to a long hollow", [long, tuck, long], 426, undefined, 5, [gazeCeiling, gazeTowardKnees, gazeCeiling]);
  }
  if (id === "controlled-v-up") {
    const long = change(supine, { le: p(462, 366), lw: p(542, 352), re: p(474, 380), rw: p(554, 366), lk: p(220, 374), la: p(92, 370), rk: p(234, 388), ra: p(106, 384) });
    const vee = change(long, { head: p(404, 226), neck: p(380, 258), ls: p(356, 278), rs: p(372, 290), le: p(326, 244), lw: p(282, 190), re: p(340, 256), rw: p(296, 202), lh: p(320, 340), lk: p(288, 250), la: p(270, 136), rh: p(338, 350), rk: p(306, 260), ra: p(288, 146) });
    return dynamic("Lift trunk and straight legs together; look toward the toes", [long, vee, long], 426, undefined, 5.4, [gazeCeiling, p(-10, -8), gazeCeiling]);
  }
  if (id === "alternating-jackknife") {
    const long = change(supine, { le: p(462, 366), lw: p(542, 352), re: p(474, 380), rw: p(554, 366), lk: p(220, 374), la: p(92, 370), rk: p(234, 388), ra: p(106, 384) });
    const left = change(long, { head: p(410, 284), neck: p(384, 314), lw: p(286, 190), le: p(334, 252), lk: p(282, 260), la: p(270, 136) });
    const right = change(long, { head: p(410, 284), neck: p(384, 314), rw: p(302, 202), re: p(348, 264), rk: p(300, 270), ra: p(288, 146) });
    return dynamic("Reach opposite hand toward the rising straight leg", [long, left, long, right], 426, undefined, 5.8, [gazeCeiling, p(-10, -8), gazeCeiling, p(-10, -8)]);
  }
  if (id === "supine-toe-reach") {
    const legsUp = change(supine, { lk: p(270, 264), la: p(266, 128), rk: p(288, 274), ra: p(284, 138) });
    const reach = change(legsUp, { head: p(414, 290), neck: p(388, 318), ls: p(362, 338), rs: p(378, 350), le: p(330, 276), lw: p(286, 206), re: p(344, 288), rw: p(300, 218) });
    return dynamic("Keep legs vertical; lift shoulder blades and look toward the toes", [legsUp, reach, legsUp], 426, undefined, 4.6, [gazeCeiling, p(-8, -10), gazeCeiling]);
  }
  if (id === "heel-touches") {
    const curled = change(supine, { head: p(416, 300), neck: p(390, 326), ls: p(362, 346), rs: p(378, 358), lk: p(270, 354), la: p(222, 400), rk: p(288, 364), ra: p(240, 410) });
    return dynamic("Keep shoulders lifted; reach side to side toward each heel", [change(curled, { lw: p(250, 388) }), change(curled, { rw: p(230, 402) })], 426, undefined, 3.8, p(-10, 5));
  }
  if (id === "bicycle-crunch-slow") {
    const left = change(supine, { head: p(410, 286), neck: p(382, 316), ls: p(350, 334), rs: p(372, 350), le: p(326, 276), lw: p(360, 240), re: p(344, 288), rw: p(386, 260), lk: p(330, 292), la: p(298, 238), rk: p(224, 360), ra: p(108, 374) });
    const right = change(left, { le: p(342, 288), lw: p(386, 260), re: p(324, 276), rw: p(360, 240), lk: p(222, 358), la: p(106, 372), rk: p(348, 302), ra: p(316, 248) });
    return dynamic("Rotate slowly as the opposite knee comes in", [left, right], 426, undefined, 4.8, p(-9, -8));
  }
  throw new Error(`Missing dedicated motion guide for ${id}`);
};

const v2ExpansionGuides = Object.fromEntries(
  v2ExpansionGuideIds.map((id) => [id, expansionGuide(id)]),
) as Record<(typeof v2ExpansionGuideIds)[number], Guide>;

const researchExpansionGuides = {
  "palm-lift-wrist-conditioning": dynamic("Finger pads stay grounded as the palms lift", [
    quadruped,
    change(quadruped, { lw: p(426, 390), rw: p(448, 390), head: p(500, 203), neck: p(460, 222) }),
    quadruped,
  ], 420, undefined, 4, p(10, 7)),
  "forearm-turn-finger-spread": dynamic("Turn the forearms and open the fingers", [
    change(standing, { le: p(282, 214), lw: p(340, 220), re: p(358, 214), rw: p(300, 220) }),
    change(standing, { le: p(282, 214), lw: p(340, 198), re: p(358, 214), rw: p(300, 242) }),
    change(standing, { le: p(282, 214), lw: p(340, 242), re: p(358, 214), rw: p(300, 198) }),
  ], 486, undefined, 4.8, p(13, 0)),
  "alternating-straight-leg-hamstring-sweep": dynamic("Heel forward; hinge from the hips", [
    standing,
    change(standing, {
      head: p(402, 184), neck: p(372, 214), ls: p(344, 236), rs: p(368, 240),
      le: p(402, 292), lw: p(438, 354), re: p(420, 300), rw: p(454, 364),
      lh: p(310, 286), rh: p(332, 294), lk: p(262, 374), la: p(214, 470), rk: p(366, 386), ra: p(438, 470),
    }),
    standing,
    change(standing, {
      head: p(238, 184), neck: p(268, 214), ls: p(272, 240), rs: p(296, 236),
      le: p(220, 300), lw: p(186, 364), re: p(238, 292), rw: p(202, 354),
      lh: p(308, 294), rh: p(330, 286), lk: p(274, 386), la: p(202, 470), rk: p(378, 374), ra: p(426, 470),
    }),
  ], 486, undefined, 6, [gazeRight, gazeRight, gazeLeft, gazeLeft]),
  "dynamic-half-kneeling-hip-flexor-reach": dynamic("Tuck the pelvis, shift gently and reach overhead; repeat the other leg", [
    halfKneeling,
    change(halfKneeling, {
      head: p(340, 116), neck: p(334, 158), ls: p(308, 178), rs: p(360, 178),
      le: p(306, 106), lw: p(318, 42), re: p(364, 106), rw: p(350, 42),
      lh: p(318, 304), rh: p(350, 306), lk: p(404, 372), la: p(442, 470),
    }),
  ], 486, undefined, 4.8, p(13, 0)),
  "cossack-weight-shift": dynamic("Shift side to side with both feet grounded", [
    change(standing, { lh: p(302, 286), rh: p(338, 286), lk: p(224, 382), la: p(116, 470), rk: p(416, 382), ra: p(524, 470) }),
    change(standing, { head: p(238, 156), neck: p(248, 198), ls: p(224, 216), rs: p(274, 220), lh: p(232, 314), rh: p(268, 318), lk: p(164, 364), la: p(116, 470), rk: p(390, 386), ra: p(524, 470), le: p(180, 272), lw: p(142, 322), re: p(300, 272), rw: p(342, 320) }),
    change(standing, { lh: p(302, 286), rh: p(338, 286), lk: p(224, 382), la: p(116, 470), rk: p(416, 382), ra: p(524, 470) }),
    change(standing, { head: p(402, 156), neck: p(392, 198), ls: p(366, 220), rs: p(416, 216), lh: p(372, 318), rh: p(408, 314), lk: p(250, 386), la: p(116, 470), rk: p(476, 364), ra: p(524, 470), le: p(340, 272), lw: p(298, 320), re: p(460, 272), rw: p(498, 322) }),
  ], 486, undefined, 6, [gazeRight, gazeLeft, gazeRight, gazeRight]),

  "parallette-wall-grip-pressure-shift": dynamic("Hands stay planted; shift body pressure between the bars", [
    wallHandstand,
    wallBodyShift(-8),
    wallBodyShift(8),
  ], 420, ["wall", "parallettes"], 5, gazeFloor),
  "chest-wall-micro-shoulder-tap": dynamic("Shift first; make only a tiny controlled tap", [
    wallHandstand,
    change(wallHandstand, { ls: p(456, 286), le: p(390, 326), lw: p(454, 286), rs: p(478, 286), re: p(470, 343), rw: p(456, 400), lh: p(486, 188), rh: p(502, 190) }),
    wallHandstand,
    change(wallHandstand, { rs: p(465, 286), re: p(520, 326), rw: p(466, 286), ls: p(447, 286), le: p(442, 342), lw: p(438, 400), lh: p(478, 188), rh: p(494, 190) }),
  ], 420, ["wall", "parallettes"], 6, p(0, 12)),
  "entry-balance-side-exit-chain": dynamic("Enter calmly, balance briefly, then use the trained side exit; alternate exit sides between attempts", [
    kickupStart,
    kickupSplit,
    freeHandstandBalance,
    change(kickupSplit, { lh: p(480, 190), lk: p(540, 160), la: p(558, 132), rh: p(496, 198), rk: p(402, 242), ra: p(306, 294) }),
    change(kickupStart, { rh: p(326, 264), rk: p(390, 330), ra: p(470, 400) }),
  ], 420, "parallettes", 7, [gazeFloorForward, gazeFloor, gazeFloor, gazeFloor, gazeFloorForward]),

  "prone-arch-body-hold": hold("Reach long in a shallow arch; face stays toward the mat", change(prone, {
    head: p(500, 366), neck: p(458, 362), ls: p(426, 354), rs: p(434, 368),
    le: p(476, 338), lw: p(552, 320), re: p(484, 352), rw: p(558, 336),
    lk: p(202, 370), la: p(82, 354), rk: p(216, 384), ra: p(94, 370),
  }), 426, undefined, p(0, 11)),
  "hollow-to-arch-log-roll": dynamic("Roll as one unit between hollow and shallow arch", [
    longHollow,
    change(longHollow, { head: p(500, 350), neck: p(462, 350), ls: p(426, 350), rs: p(432, 374), lh: p(300, 350), rh: p(308, 382), le: p(492, 324), lw: p(568, 304), re: p(496, 360), rw: p(572, 346), lk: p(204, 354), la: p(82, 344), rk: p(214, 390), ra: p(92, 386) }),
    change(prone, { head: p(500, 366), neck: p(458, 362), ls: p(426, 354), rs: p(434, 368), le: p(476, 338), lw: p(552, 320), re: p(484, 352), rw: p(558, 336), lk: p(202, 370), la: p(82, 354), rk: p(216, 384), ra: p(94, 370) }),
  ], 426, undefined, 6, [gazeCeiling, p(0, 12), p(0, 11)]),
  "bridge-walkout": dynamic("Take small heel steps while the pelvis stays level", [
    bridge,
    change(bridge, { lk: p(224, 342), la: p(146, 410), rk: p(242, 354), ra: p(164, 414) }),
    change(bridge, { lk: p(206, 350), la: p(112, 410), rk: p(224, 362), ra: p(130, 414), lh: p(304, 318), rh: p(320, 330) }),
  ], 426, undefined, 5.6, p(0, -12)),
  "high-plank-bird-dog": dynamic("Reach opposite arm and leg; keep the pelvis square", [
    plank,
    change(plank, { le: p(500, 226), lw: p(574, 198), rk: p(168, 318), ra: p(54, 286) }),
    plank,
    change(plank, { re: p(512, 232), rw: p(582, 206), lk: p(154, 308), la: p(44, 274) }),
  ], 420, undefined, 6, p(10, 7)),
  "lateral-bear-crawl": dynamic("Knees hover low; step sideways without crossing", [
    shifted(bearHover, -28, 0),
    change(shifted(bearHover, -8, 0), { lw: p(454, 400), la: p(214, 394), rw: p(468, 400), ra: p(236, 396) }),
    shifted(bearHover, 20, 0),
  ], 420, undefined, 5, p(10, 6)),

  "eccentric-lsit-to-tuck-lower": dynamic("Lower slowly from long legs to a compact tuck", [
    lSit,
    change(lSit, { lk: p(280, 312), la: p(172, 314), rk: p(294, 322), ra: p(184, 324) }),
    tuckSupport,
  ], 420, "parallettes", 6, gazeLeft),
  "assisted-straddle-lsit-hold": hold("Press tall; wide straight heels provide light floor assistance", change(support, {
    lh: p(354, 304), rh: p(370, 312), lk: p(234, 330), la: p(86, 398), rk: p(286, 334), ra: p(218, 414),
  }), 420, "parallettes", gazeLeft),
  "alternating-one-leg-lsit-switch": dynamic("Switch the long leg without dropping the support", [
    change(lSit, { rk: p(380, 352), ra: p(340, 386) }),
    tuckSupport,
    change(lSit, { lk: p(382, 344), la: p(342, 380), rk: p(250, 310), ra: p(110, 308) }),
  ], 420, "parallettes", 5.2, gazeLeft),

  "parallette-push-up-plus": dynamic("Finish with straight elbows and spread the shoulder blades", [
    change(plank, { head: p(500, 282), neck: p(466, 296), ls: p(432, 308), le: p(470, 350), lw: p(434, 400), rs: p(448, 312), re: p(486, 354), rw: p(456, 400), lh: p(294, 330), rh: p(308, 338) }),
    plank,
    change(plank, { head: p(508, 220), neck: p(472, 242), ls: p(438, 262), rs: p(454, 266), lh: p(294, 296), rh: p(308, 304) }),
  ], 420, "parallettes", 5.4, p(10, 7)),
  "planche-lean-scapular-pulse": dynamic("Keep the lean and elbows locked as the shoulder blades pulse", [
    plancheLean,
    change(plancheLean, { head: p(538, 216), neck: p(502, 236), ls: p(474, 250), rs: p(492, 254), lh: p(320, 292), rh: p(334, 300) }),
  ], 420, "parallettes", 4.2, p(10, 7)),
  "staggered-parallette-push-up": dynamic("Keep hips square while pressing on the slightly staggered bars", [
    change(plank, { lw: p(420, 400), rw: p(470, 372), le: p(420, 324), re: p(468, 310) }),
    change(plank, { head: p(500, 282), neck: p(466, 296), ls: p(432, 308), rs: p(448, 312), le: p(458, 350), lw: p(420, 400), re: p(496, 338), rw: p(470, 372), lh: p(294, 330), rh: p(308, 338) }),
  ], 420, "parallettes", 4.8, p(10, 7)),

  "supine-hamstring-stretch": hold("Support behind the thigh; lengthen the knee gently; repeat the other leg", change(supine, {
    le: p(350, 318), lw: p(310, 270), re: p(370, 330), rw: p(330, 282),
    lh: p(310, 372), lk: p(322, 248), la: p(330, 104), rh: p(320, 386), rk: p(250, 354), ra: p(190, 414),
  }), 426, undefined, p(0, -12)),
  "figure-four-glute-stretch": hold("Ankle rests across the opposite thigh; shoulders stay relaxed; repeat the other side", change(supine, {
    le: p(366, 328), lw: p(304, 310), re: p(388, 344), rw: p(326, 326),
    lh: p(314, 370), lk: p(350, 318), la: p(302, 278), rh: p(328, 384), rk: p(256, 344), ra: p(222, 414),
  }), 426, undefined, p(0, -12)),
  "gentle-frog-adductor-hold": hold("Wide padded knees; ease the hips back and breathe", change(quadruped, {
    head: p(490, 286), neck: p(450, 278), ls: p(420, 284), rs: p(438, 292),
    le: p(438, 338), lw: p(470, 400), re: p(454, 344), rw: p(486, 406),
    lh: p(294, 274), rh: p(312, 284), lk: p(188, 340), la: p(120, 400), rk: p(396, 348), ra: p(474, 408),
  }), 420, undefined, p(10, 6)),
  "no-rope-penguin-taps": dynamic("Low jumps; tap the outer thighs once per turn", [
    change(standing, { le: p(286, 232), lw: p(296, 300), re: p(354, 232), rw: p(344, 300) }),
    change(standing, { head: p(320, 68), neck: p(320, 110), ls: p(284, 128), rs: p(356, 128), le: p(286, 230), lw: p(300, 286), re: p(354, 230), rw: p(340, 286), lh: p(302, 275), rh: p(338, 275), lk: p(292, 372), rk: p(348, 372), la: p(282, 452), ra: p(358, 452) }),
    change(standing, { le: p(286, 232), lw: p(296, 300), re: p(354, 232), rw: p(344, 300) }),
  ], 486, undefined, 3.6, p(13, 0)),
} as const satisfies Record<string, Guide>;

export const guides = {
  ...legacyGuides,
  ...newGuides,
  ...existingTechniqueGuides,
  ...v2ExpansionGuides,
  ...researchExpansionGuides,
} satisfies Record<string, Guide>;

export type MotionPreset = keyof typeof guides;
export const motionPresetIds = Object.keys(guides) as MotionPreset[];
export const isMotionPreset = (value: string): value is MotionPreset => value in guides;

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

const hasEquipment = (guide: Guide, item: Equipment) =>
  Array.isArray(guide.equipment)
    ? guide.equipment.includes(item)
    : guide.equipment === item;

/**
 * Draw the hair on the back half of the head, opposite the face/gaze vector.
 * This keeps the avatar readable when upright, horizontal or inverted instead
 * of making the hair look permanently attached to the top of the screen.
 */
const hairPath = (pose: Pose, gaze: Point) => {
  const magnitude = Math.hypot(gaze.x, gaze.y) || 1;
  const face = p(gaze.x / magnitude, gaze.y / magnitude);
  const back = p(-face.x, -face.y);
  const tangent = p(-face.y, face.x);
  const start = p(
    pose.head.x + back.x * 5 + tangent.x * 20,
    pose.head.y + back.y * 5 + tangent.y * 20,
  );
  const control = p(
    pose.head.x + back.x * 32,
    pose.head.y + back.y * 32,
  );
  const end = p(
    pose.head.x + back.x * 5 - tangent.x * 20,
    pose.head.y + back.y * 5 - tangent.y * 20,
  );
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
};

function EquipmentLayer({ guide, preset }: { guide: Guide; preset: string }) {
  return (
    <>
      {hasEquipment(guide, "wall") && (
        <g aria-label="wall">
          <rect x="558" y="28" width="18" height={guide.floor - 20} rx="7" fill="#e3e9e6" stroke="#bbc9c4" strokeWidth="3" />
          {[94, 164, 234, 304, 374].map((y) => (
            <line key={y} x1="560" x2="574" y1={y} y2={y} stroke="#c5d1cd" strokeWidth="2" />
          ))}
        </g>
      )}

      {hasEquipment(guide, "parallettes") && (
        <g
          aria-label="two equal-height medium wooden parallettes"
          fill="none"
          stroke="#9b633d"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#motion-shadow-${preset})`}
        >
          <path d={`M390 ${guide.floor - 20} L478 ${guide.floor - 20} M404 ${guide.floor - 20} L398 ${guide.floor + 4} M464 ${guide.floor - 20} L470 ${guide.floor + 4}`} />
          <path d={`M414 ${guide.floor - 20} L502 ${guide.floor - 20} M428 ${guide.floor - 20} L422 ${guide.floor + 4} M488 ${guide.floor - 20} L494 ${guide.floor + 4}`} opacity=".72" />
        </g>
      )}

      {hasEquipment(guide, "rope") && (
        <g aria-label="skipping rope" fill="none" stroke="#f06b4f" strokeWidth="5" strokeLinecap="round">
          <path d="M242 280 C120 190 120 475 282 462" />
          <path d="M398 280 C520 190 520 475 358 462" />
        </g>
      )}
    </>
  );
}

type AuditFrame = "start" | "middle" | "end";

export function MotionGuide({
  preset,
  compact = false,
  auditFrame,
}: {
  preset: MotionPreset;
  compact?: boolean;
  /** Freezes a deterministic keyframe for visual QA and screenshot comparison. */
  auditFrame?: AuditFrame;
}) {
  const reduceMotion = useReducedMotion();
  const guide = guides[preset];
  const queryFrame = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("media-audit-frame");
  const selectedAuditFrame = auditFrame ?? (
    queryFrame === "start" || queryFrame === "middle" || queryFrame === "end"
      ? queryFrame
      : undefined
  );
  const turnaroundIndex = Math.floor(guide.poses.length / 2);
  const stillIndex = selectedAuditFrame === "start"
    ? 0
    : selectedAuditFrame === "end"
      ? turnaroundIndex
      : selectedAuditFrame === "middle"
        ? Math.ceil(turnaroundIndex / 2)
        : turnaroundIndex;
  const freeze = Boolean(selectedAuditFrame) || reduceMotion;
  const poses = freeze ? [guide.poses[stillIndex]] : guide.poses;
  const gazes = freeze ? [guide.gaze[stillIndex]] : guide.gaze;
  const times = poses.map((_, index) => index / Math.max(1, poses.length - 1));
  const transition = freeze || guide.static
    ? { duration: 0 }
    : { duration: guide.duration ?? 4.2, repeat: Infinity, ease: "easeInOut" as const, times };

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
        <EquipmentLayer guide={guide} preset={preset} />

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
            d={hairPath(poses[0], gazes[0])}
            animate={{
              d: poses.map((pose, index) => hairPath(pose, gazes[index])),
            }}
            transition={transition}
            fill="none"
            stroke="#233432"
            strokeWidth="9"
            strokeLinecap="round"
            opacity=".9"
          />
          <motion.circle
            cx={poses[0].head.x + gazes[0].x}
            cy={poses[0].head.y + gazes[0].y}
            r="3.8"
            fill="#263b39"
            animate={{
              cx: joints(poses, "head", "x").map((value, index) => value + gazes[index].x),
              cy: joints(poses, "head", "y").map((value, index) => value + gazes[index].y),
            }}
            transition={transition}
          />
          <motion.line
            x1={poses[0].head.x + gazes[0].x * 0.7}
            y1={poses[0].head.y + gazes[0].y * 0.7 + 7}
            x2={poses[0].head.x + gazes[0].x * 1.25}
            y2={poses[0].head.y + gazes[0].y * 1.25 + 7}
            animate={{
              x1: joints(poses, "head", "x").map((value, index) => value + gazes[index].x * 0.7),
              y1: joints(poses, "head", "y").map((value, index) => value + gazes[index].y * 0.7 + 7),
              x2: joints(poses, "head", "x").map((value, index) => value + gazes[index].x * 1.25),
              y2: joints(poses, "head", "y").map((value, index) => value + gazes[index].y * 1.25 + 7),
            }}
            transition={transition}
            stroke="#9c6549"
            strokeWidth="3"
            strokeLinecap="round"
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

        {!compact && (
          <g>
            <rect x="28" y="26" width="238" height="35" rx="17.5" fill="#12352e" opacity=".9" />
            <text x="147" y="49" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800" letterSpacing="1.1">
              {guide.static ? "POSITION GUIDE" : "SMOOTH MOTION GUIDE"}
            </text>
            <rect x="28" y="462" width="510" height="36" rx="18" fill="#fff" opacity=".94" />
            <text x="46" y="485" fill="#31504a" fontSize="14" fontWeight="700">{guide.label}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
