import type { ExerciseId, ExerciseMedia } from "../contracts";
import { exerciseId } from "./ids";

export type Phase7MediaRequirement = Readonly<{
  id: string;
  reference: string;
  status: "existing-owned" | "new-owned-required";
  exerciseIds: readonly ExerciseId[];
  movementPhases: readonly string[];
  cameraView: string;
  technicalPoints: readonly string[];
  commonMistakes: readonly string[];
  regressionRelationship: string;
  progressionRelationship: string;
  playback: "loop" | "one-way-reset";
  requiredVisuals?: readonly string[];
}>;

const ex = exerciseId;

const newOwned = (
  reference: string,
  exerciseIds: readonly string[],
  movementPhases: readonly string[],
  cameraView: string,
  technicalPoints: readonly string[],
  commonMistakes: readonly string[],
  regressionRelationship: string,
  progressionRelationship: string,
  playback: Phase7MediaRequirement["playback"],
  requiredVisuals?: readonly string[],
): Phase7MediaRequirement => ({
  id: `phase7-media-${reference}`,
  reference,
  status: "new-owned-required",
  exerciseIds: exerciseIds.map(ex),
  movementPhases,
  cameraView,
  technicalPoints,
  commonMistakes,
  regressionRelationship,
  progressionRelationship,
  playback,
  ...(requiredVisuals ? { requiredVisuals } : {}),
});

/**
 * Owned-media gate for the first Phase 7 automatic-content release. New
 * references are production briefs, not claims that a renderable asset already
 * exists. The v1.2 balance guides ping-pong their exit sequences and therefore
 * remain historical references rather than Phase 7 assets. The two exact
 * Press/transition pairs share one physical demonstration without sharing
 * exercise, graph-node or benchmark authority.
 */
export const phase7MediaRequirements = [
  newOwned(
    "parallette-tuck-planche-hold",
    ["parallette-tuck-planche-hold"],
    ["Establish tall support", "Protract and lean", "Draw into a compact feet-clear tuck", "Hold", "Return both toes under control"],
    "Full-body side view with both parallettes and both feet continuously visible.",
    ["Keep both elbows locked", "Maintain active protraction", "Keep the knees free of the arms"],
    ["Hopping the feet clear", "Bending the elbows", "Using crane-style knee support", "Collapsing between the shoulders"],
    "Regresses to Foot-Assisted Tuck Planche.",
    "Prepares the Advanced Tuck Planche Hold.",
    "loop",
    ["Both equal-height parallettes", "Clear space beneath both feet", "Visible shoulder position beyond the hands"],
  ),
  newOwned(
    "advanced-tuck-planche-hold",
    ["advanced-tuck-planche-hold"],
    ["Establish a stable tuck Planche", "Open the hip and knee lever behind the hands", "Hold the longer feet-clear shape", "Return to tuck"],
    "Full-body side view that makes the longer lever and shoulder landmark unambiguous.",
    ["Preserve locked elbows and protraction", "Open the tuck without dropping the hips", "Keep both feet clear"],
    ["Returning to a compact tuck", "Sagging or over-arching", "Bending the elbows as the lever opens"],
    "Regresses to Parallette Tuck Planche Hold.",
    "Prepares assisted one-leg and assisted straddle Planche work.",
    "loop",
    ["Both parallettes", "Feet-clear advanced-tuck silhouette", "Shoulders visibly forward of the bars"],
  ),
  newOwned(
    "assisted-one-leg-planche-hold",
    ["assisted-one-leg-planche-hold"],
    ["Set the reviewed bar-to-wall distance", "Establish advanced tuck", "Fix the prescribed assistance point", "Lengthen one leg", "Hold", "Return and demonstrate the other side"],
    "Side-to-front-oblique view with the assistance contact and both leg positions visible.",
    ["Keep the pelvis square", "Keep shoulder position constant", "Make the assistance light and reproducible"],
    ["Launching from the supported toe", "Rotating the pelvis", "Hiding or changing the assistance", "Bending the elbows"],
    "Regresses to Advanced Tuck Planche Hold.",
    "Prepares a stronger-gated one-leg outcome and assisted straddle development.",
    "loop",
    ["Visible bar-to-wall distance marks", "Exact assistance contact", "Both sides", "Both bars and the extended foot"],
  ),
  newOwned(
    "assisted-straddle-planche-hold",
    ["assisted-straddle-planche-hold"],
    ["Set the reviewed bar-to-wall distance", "Establish the approved assisted setup", "Protract and lean", "Open both legs into a symmetric straddle", "Hold", "Return under control"],
    "Full-body front-oblique view with a secondary side-readable body line.",
    ["Keep both knees long and the straddle symmetric", "Show the exact assistance continuously", "Maintain locked elbows and protraction"],
    ["Recreating a grounded straddle lean", "Forcing width", "Sagging the hips", "Using invisible or changing assistance"],
    "Regresses to Advanced Tuck or Assisted One-Leg Planche Hold.",
    "Prepares the stronger-gated stable straddle Planche outcome.",
    "loop",
    ["Visible bar-to-wall distance marks", "Reviewed assistance modality", "Both feet and bars", "Feet-clear or explicitly assisted target shape"],
  ),
  newOwned(
    "straddle-l-sit-hold",
    ["straddle-l-sit-hold"],
    ["Establish tall support", "Open both straight legs into straddle", "Lift both feet clear", "Hold", "Land softly"],
    "Full-body front-oblique view showing both knees, heels, bars and the floor gap.",
    ["Keep shoulders tall and elbows locked", "Keep knees facing up", "Hold the hips between the bars"],
    ["Skimming the heels", "Bending the knees", "Leaning behind the hands", "Forcing an excessive straddle"],
    "Regresses to Assisted Straddle L-Sit Hold.",
    "Supports assisted V-sit and straddle Press preparation.",
    "loop",
    ["Visible clearance beneath both heels", "Symmetric straddle", "Both parallettes"],
  ),
  newOwned(
    "high-l-sit-hold",
    ["high-l-sit-hold"],
    ["Establish a full L-sit", "Compress both straight legs above horizontal", "Hold", "Return to the full-L landmark"],
    "Full-body side view with bar-top and horizontal reference clearly readable.",
    ["Press tall through locked arms", "Keep both knees straight", "Raise the legs through compression rather than torso recoil"],
    ["Leaning backward", "Bending the knees", "Swinging the legs", "Dropping the hips or shoulders"],
    "Regresses to Full L-Sit Attempt.",
    "Prepares Assisted V-Sit Hold.",
    "loop",
    ["Horizontal and above-horizontal leg landmarks", "Both bars", "Full feet-clear silhouette"],
  ),
  newOwned(
    "assisted-v-sit-hold",
    ["assisted-v-sit-hold"],
    ["Set the marked bar-to-wall start distance", "Establish tall support", "Engage the reviewed assistance", "Raise both straight legs to the prescribed V height", "Hold", "Return"],
    "Full-body side view with the assistance point and target angle visible throughout.",
    ["Use one reproducible assistance condition", "Keep elbows locked and shoulders tall", "Preserve straight knees and active compression"],
    ["Bouncing into height", "Hiding or changing assistance", "Collapsing the shoulders", "Substituting a bent-knee shape"],
    "Regresses to High L-Sit or Stable Straddle L-Sit.",
    "Prepares the feet-clear Partial V-Sit Hold.",
    "loop",
    ["Visible start-distance marks", "Reviewed assistance modality", "Target leg-height marker", "Both bars and both feet"],
  ),
  newOwned(
    "partial-v-sit-hold",
    ["partial-v-sit-hold"],
    ["Establish tall support", "Lift both feet clear into the prescribed partial-V angle", "Stabilise", "Return under control"],
    "Full-body side view with a fixed leg-height reference.",
    ["Keep knees straight and feet clear", "Own the target angle without assistance", "Maintain tall shoulders"],
    ["Kicking briefly through the target", "Bending the knees", "Shrugging or dropping the hips", "Touching the assistance point"],
    "Regresses to Assisted V-Sit Hold.",
    "Prepares the stronger-gated Stable V-Sit outcome.",
    "loop",
    ["Feet-clear target angle", "Both parallettes", "Unassisted hands-and-feet view"],
  ),
  newOwned(
    "floor-balance-repeatable-variant",
    ["floor-balance-repeatable-variant"],
    ["Enter calmly", "Establish a controlled floor balance", "Make small corrections", "Use a planned side exit"],
    "Full-body floor-handstand view with the complete entry and landing visible.",
    ["Keep corrections small", "Separate balance from entry", "Exit before control is lost"],
    ["Counting a lucky kick-up", "Chasing an uncontrolled hold", "Falling instead of exiting"],
    "Regresses to Controlled Short Floor Balance.",
    "The new protocol demonstrates repeatability across separated sessions; the movement geometry is unchanged.",
    "one-way-reset",
    ["Clear landing area", "Both hands and feet", "Unassisted balance interval"],
  ),
  newOwned(
    "parallette-balance-repeatable-variant",
    ["parallette-balance-repeatable-variant"],
    ["Enter calmly", "Separate a controlled balance from the entry", "Use small bar-pressure corrections", "Exit sideways under control", "Reset and show the opposite exit side"],
    "Full-body front-oblique parallette view with both bars, both exit paths and each landing visible.",
    ["Keep shoulders elevated", "Make the balance independently observable", "Preserve both exit options"],
    ["Counting entry momentum as balance", "Waiting for an uncontrolled fall", "Losing the exit path"],
    "Regresses to Controlled Short Parallette Balance.",
    "The new protocol demonstrates repeatability across separated sessions and supports shape-change work.",
    "one-way-reset",
    ["Both equal-height bars", "Both exit sides", "Clear freestanding interval"],
  ),
  newOwned(
    "freestanding-parallette-tuck-shape-change",
    ["freestanding-parallette-tuck-shape-change"],
    ["Enter a stable straight handstand", "Settle the balance", "Change to a symmetric tuck", "Return to straight", "Use the planned side exit"],
    "Full-body front-oblique view showing both bars, hip shape and landing area.",
    ["Keep shoulders stacked and elevated", "Move both legs symmetrically", "Recover the straight line before exiting"],
    ["Piking instead of tucking", "Dropping the shoulders", "Bending the support arms", "Using wall contact or an uncontrolled exit"],
    "Regresses to Repeatable Parallette Balance.",
    "Prepares later stronger-gated shape and weight-transfer control.",
    "one-way-reset",
    ["Straight and tuck silhouettes", "Both bars", "Planned side-exit landing"],
  ),
  newOwned(
    "elevated-parallette-pike-push-up",
    ["elevated-parallette-pike-push-up"],
    ["Establish the approved wall-elevated pike", "Press tall", "Lower the crown forward and down between the bars", "Press to the same top position"],
    "Full-body side view with wall contact, both bars and the head path visible.",
    ["Keep hips high and shoulders active", "Track elbows back", "Make the press more vertical than the grounded pike version"],
    ["Dropping the head straight down", "Flaring the elbows", "Collapsing the shoulders", "Letting the feet slip"],
    "Regresses to Controlled Pike Eccentric or Parallette Pike Push-Up.",
    "Prepares the standard wall-HSPU bottom-position exit.",
    "loop",
    ["Wall-supported feet", "Both parallettes", "Padded head-path target"],
  ),
  newOwned(
    "wall-hspu-bottom-position-exit",
    ["wall-hspu-bottom-position-exit"],
    ["Begin in a low feet-supported setup", "Walk the feet up to stage the standard bent-arm bottom without descending from lockout", "Slide both feet down to inverted-L", "Lower one knee then the other outside the bars", "Finish safely kneeling"],
    "Full-body side view with the wall, pad, bars and complete landing path visible.",
    ["Use foot support to stage load gradually", "Keep the crown unloaded", "Maintain grip until both knees are safely down", "Use the exact standard-depth exit"],
    ["Descending from full lockout before the exit is established", "Loading the head or neck", "Dropping the feet between the bars", "Cropping the two-knee landing"],
    "Regresses to an elevated-pike exit rehearsal.",
    "Must be demonstrated before Wall HSPU Eccentric.",
    "one-way-reset",
    ["Pad at the bar-top bottom landmark", "Wall contact", "Both bars", "Complete bailout and landing"],
  ),
  newOwned(
    "wall-hspu-eccentric",
    ["wall-hspu-eccentric"],
    ["Establish the wall-handstand top", "Lower for at least four seconds", "Reach the standard padded bottom", "Use the trained exit without pressing up"],
    "Full-body side view with a readable descent tempo and safe reset.",
    ["Control the entire descent", "Keep the elbows symmetric", "End with the approved bailout rather than a concentric"],
    ["Dropping through the final range", "Touching or loading the crown", "Reversing the clip as if concentric strength were demonstrated"],
    "Regresses to Wall HSPU Bottom-Position Exit and Elevated Pike Push-Up.",
    "Prepares Assisted Wall HSPU Concentric.",
    "one-way-reset",
    ["Standard-depth pad", "Readable four-second-or-longer descent", "Non-concentric reset"],
  ),
  newOwned(
    "assisted-wall-hspu-concentric",
    ["assisted-wall-hspu-concentric"],
    ["Set the exact standard bottom position", "Engage the prescribed assistance", "Press smoothly to locked support", "Reset separately"],
    "Full-body side view with the assistance contact, wall, pad and lockout visible.",
    ["Keep assistance visible and reproducible", "Press without kipping", "Finish in active overhead elevation"],
    ["Using hidden or changing assistance", "Pushing from the head", "Asymmetric elbow tracking", "Using an uncontrolled leg drive"],
    "Regresses to Wall HSPU Eccentric.",
    "Prepares Partial Wall HSPU.",
    "one-way-reset",
    ["Exact assistance modality", "Standard bottom pad", "Locked top position"],
  ),
  newOwned(
    "partial-wall-hspu",
    ["partial-wall-hspu"],
    ["Establish the wall-handstand top", "Lower to the marked partial depth", "Press to full lockout", "Exit under control"],
    "Full-body side view with a fixed partial-range landmark.",
    ["Repeat the same unassisted depth", "Keep the wall support passive", "Reach active lockout on every repetition"],
    ["Drifting shallower with fatigue", "Driving through the feet", "Flaring the elbows", "Stopping short of lockout"],
    "Regresses to Assisted Wall HSPU Concentric.",
    "Prepares the full standard-depth Parallette Wall HSPU.",
    "loop",
    ["Partial-depth marker", "Wall and both bars", "Full top lockout"],
  ),
  newOwned(
    "parallette-wall-hspu",
    ["parallette-wall-hspu"],
    ["Establish the wall-handstand top", "Lower to the standard bar-top padded depth", "Press through the full approved range", "Lock out", "Exit safely"],
    "Full-body side view with the complete standard range and landing visible.",
    ["Keep the crown unloaded", "Track elbows consistently", "Maintain active elevation at lockout"],
    ["Bouncing from the pad", "Arching or flaring", "Using wall leg drive", "Finishing in a passive top"],
    "Regresses to Partial Wall HSPU.",
    "Prepares the deficit-depth exit prerequisite.",
    "loop",
    ["Pad level with the bar tops", "Wall contact", "Both bars", "Safe exit"],
  ),
  newOwned(
    "deficit-wall-hspu-bottom-position-exit",
    ["deficit-wall-hspu-bottom-position-exit"],
    ["Begin in a low feet-supported setup", "Walk the feet up to stage the reviewed below-bar bottom without a deficit eccentric", "Slide both feet down to inverted-L", "Lower one knee then the other outside the bars"],
    "Full-body side view that visibly distinguishes deficit depth from the standard exit.",
    ["Use foot support to enter the deeper bottom gradually", "Use the exact deeper bailout", "Keep head and neck unloaded", "Maintain grip until both knees are down"],
    ["Testing an unproved deficit eccentric", "Reusing the standard-depth exit", "Loading the crown", "Obscuring the two-knee landing"],
    "Regresses to Full Parallette Wall HSPU plus the standard bottom-position exit.",
    "Must be demonstrated before Deficit Wall HSPU.",
    "one-way-reset",
    ["Pad visibly below bar-top height", "Both bars", "Wall", "Complete deeper bailout"],
  ),
  newOwned(
    "deficit-wall-hspu",
    ["deficit-wall-hspu"],
    ["Establish the wall-handstand top", "Lower below the bar tops to the exact deficit target", "Press to active lockout", "Use the approved exit"],
    "Full-body side view with standard and deficit landmarks visually distinguishable.",
    ["Own the extra range without head contact", "Keep shoulder and elbow control", "Finish at the same locked top"],
    ["Calling standard depth a deficit", "Bouncing from the pad", "Forcing painful shoulder extension", "Losing wall or bar stability"],
    "Regresses to Full Parallette Wall HSPU and Deficit Bottom-Position Exit.",
    "Completes the automatic wall-HSPU range before stronger-gated freestanding work.",
    "loop",
    ["Below-bar padded target", "Both bars and wall", "Full lockout and safe exit"],
  ),
  newOwned(
    "feet-assisted-tuck-press-load",
    ["feet-assisted-tuck-press-load"],
    ["Set a compact feet-assisted start", "Shift forward through locked arms", "Raise the hips with active overhead intent", "Return both feet under control"],
    "Full-body side view with hands, feet, bars and shoulder-to-hip path visible.",
    ["Keep the arms straight", "Let the hips lead", "Retain explicit foot assistance", "Elevate rather than collapse the shoulders"],
    ["Jumping from the feet", "Bending the elbows", "Turning it into a static Planche lean", "Losing the compact trunk"],
    "Regresses to Pike Weight Shift, Tuck Support and compression capacity work.",
    "Introduces the assisted bent-arm, straddle and pike Press branches.",
    "loop",
    ["Both feet visibly assisted", "Both parallettes", "Forward-to-overhead shoulder path"],
  ),
  newOwned(
    "assisted-bent-arm-tuck-press",
    ["assisted-bent-arm-tuck-press"],
    ["Set the compact toe-assisted start", "Use the prescribed bent-arm path", "Bring the tucked hips over the shoulders", "Reach the wall-caught top", "Exit safely"],
    "Full-body side view with elbow bend, assistance and wall endpoint visible.",
    ["Keep this branch visibly bent-arm", "Use assistance without kicking", "Control the head and shoulder path"],
    ["Presenting a straight-arm Press", "Loading the head", "Kicking to the wall", "Losing the tuck"],
    "Regresses to Feet-Assisted Tuck Press Load and pike-push capacity.",
    "Prepares the stronger-gated full bent-arm tuck Press outcome.",
    "one-way-reset",
    ["Explicit toe assistance", "Bent-elbow path", "Wall-caught top", "Planned exit"],
  ),
  newOwned(
    "assisted-straddle-press-wall-handstand",
    ["assisted-straddle-press-to-handstand", "feet-assisted-straddle-press-to-wall-handstand"],
    ["Set a wide grounded straddle", "Shift forward through locked arms", "Use minimal explicit toe assistance", "Stack the hips", "Close the legs into a two-second wall-handstand catch", "Demonstrate the planned exit as a separately identifiable final phase"],
    "Full-body front-oblique view that preserves a side-readable shoulder and hip path.",
    ["Keep elbows straight", "Keep the straddle until the hips rise", "Make assistance visible and reproducible", "For the Press milestone, scoring ends at the settled wall catch", "For the transition milestone, continue into the planned exit without a reset"],
    ["Kicking up", "Closing the legs early", "Bending the elbows", "Hitting the wall hard", "Resetting before handstand"],
    "Regresses to Feet-Assisted Tuck Press Load plus straddle-compression work.",
    "The Press milestone prepares Straddle Press Negative; the separate transition protocol additionally requires the uninterrupted catch-to-exit chain.",
    "one-way-reset",
    ["Both straight straddled legs", "Toe-assistance contact", "Both bars", "Soft wall-handstand endpoint and side exit"],
  ),
  newOwned(
    "wall-handstand-straddle-lower",
    ["straddle-press-negative", "wall-handstand-to-straddle-stand-lower"],
    ["Establish a wall handstand", "Open into straddle", "Fold and shift through locked arms", "Lower both straight legs for at least four seconds", "Land both heels in a stable straddle stand"],
    "Full-body front-oblique view with wall, bars and both landing feet visible.",
    ["Keep elbows locked", "Lower hips before dropping the feet", "Use a readable four-second-or-longer descent for the Press-negative protocol", "Maintain symmetric straight legs", "Own the standing endpoint"],
    ["Dropping the feet", "Bending the elbows", "Twisting into an asymmetric landing", "Losing the wall or exit path"],
    "Regresses to a shorter wall-assisted straddle lower and the assisted straddle Press.",
    "Prepares the stronger-gated full straddle Press and later continuous transitions.",
    "one-way-reset",
    ["Wall-supported start", "Readable four-second-or-longer descent", "Straight-arm straddle path", "Both bars", "Complete two-foot landing"],
  ),
  newOwned(
    "assisted-pike-press-to-handstand",
    ["assisted-pike-press-to-handstand"],
    ["Set a feet-together pike start", "Shift forward through locked arms", "Use minimal explicit toe assistance", "Raise hips then straight legs", "Reach the wall-handstand top", "Exit"],
    "Full-body side view with the together-leg path and assistance contact visible.",
    ["Keep knees straight and legs together", "Let the hips lead", "Maintain active shoulders", "Avoid a kick-up"],
    ["Jumping", "Bending or straddling the legs", "Bending the elbows", "Arching into the wall"],
    "Regresses to Feet-Assisted Tuck Press Load plus pike-compression work.",
    "Prepares Pike Press Negative and the stronger-gated full pike Press.",
    "one-way-reset",
    ["Together straight legs", "Toe-assistance contact", "Both bars", "Wall-handstand endpoint"],
  ),
  newOwned(
    "pike-press-negative",
    ["pike-press-negative"],
    ["Establish a wall handstand", "Fold at the hips with legs together", "Lower both straight legs together for at least four seconds", "Place both feet softly on the floor"],
    "Full-body side view with the complete handstand-to-pike path visible.",
    ["Keep arms and knees straight", "Use a readable four-second-or-longer descent", "Control the whole path", "Keep the legs together"],
    ["Dropping the feet", "Opening into straddle", "Bending the knees or elbows", "Losing active shoulders"],
    "Regresses to a shorter wall-supported pike lower and assisted pike Press.",
    "Prepares the stronger-gated full pike Press outcome.",
    "one-way-reset",
    ["Wall-handstand start", "Readable four-second-or-longer descent", "Together-leg pike fold", "Both bars", "Controlled two-foot landing"],
  ),
  newOwned(
    "deficit-parallette-push-up",
    ["deficit-parallette-push-up"],
    ["Establish a rigid top plank", "Lower below the bar tops to the approved shoulder-depth landmark", "Pause without bouncing", "Press to the same locked top"],
    "Full-body side view with bar-top and shoulder-depth references readable.",
    ["Keep a connected trunk", "Use stable equal-height bars", "Control the approved extra range"],
    ["Chasing uncontrolled depth", "Flaring the elbows", "Sagging the trunk", "Bouncing or shifting unstable bars"],
    "Regresses to Controlled Parallette Push-Up.",
    "Completes the automatic general-pushing range before stronger forward-loaded work.",
    "loop",
    ["Bar-top depth landmark", "Both bars", "Full body and floor contact"],
  ),
  newOwned(
    "l-sit-to-tuck-planche-transition",
    ["l-sit-to-tuck-planche-transition"],
    ["Establish a full L-sit", "Compress and retract the legs as the shoulders lean", "Pass through support without foot contact", "Reach a feet-clear tuck Planche", "Stabilise and exit safely"],
    "Full-body side-to-front-oblique view with both endpoints, bars and feet visible.",
    ["Keep elbows locked", "Make the transition continuous", "Show stable L-sit and tuck-Planche endpoints", "Avoid momentum"],
    ["Swinging the legs", "Touching the feet down", "Bending the elbows", "Resting knees on the arms", "Skipping either endpoint"],
    "Regresses to the two endpoints plus Support-to-Tuck and Tuck-to-L-Sit transitions practised separately.",
    "Prepares the reverse Tuck-Planche-to-L-Sit transition.",
    "one-way-reset",
    ["Clear full-L endpoint", "Clear tuck-Planche endpoint", "Both bars", "Continuous feet-clear path"],
  ),
  newOwned(
    "tuck-planche-to-l-sit-transition",
    ["tuck-planche-to-l-sit-transition"],
    ["Establish a feet-clear tuck Planche", "Shift hips and shoulders under control", "Extend both legs through the transition", "Reach and hold a full L-sit", "Land softly"],
    "Full-body side-to-front-oblique view with both endpoints and the complete direction visible.",
    ["Keep elbows locked", "Control the direction without a gravity drop", "Finish in a stable full L-sit"],
    ["Kicking the legs forward", "Dropping through support", "Bending the elbows", "Showing only a brief or low L-sit"],
    "Regresses to the two endpoints and the L-Sit-to-Tuck-Planche direction practised separately.",
    "Completes the automatic two-way L-sit/tuck-Planche transition bridge.",
    "one-way-reset",
    ["Clear tuck-Planche start", "Clear full-L endpoint", "Both bars", "Continuous feet-clear path"],
  ),
] as const satisfies readonly Phase7MediaRequirement[];

const mediaRequirementByExerciseId = new Map<ExerciseId, Phase7MediaRequirement>();

for (const requirement of phase7MediaRequirements) {
  for (const id of requirement.exerciseIds) {
    if (mediaRequirementByExerciseId.has(id)) {
      throw new Error(`Duplicate Phase 7 media requirement for exercise ${id}`);
    }
    mediaRequirementByExerciseId.set(id, requirement);
  }
}

export const phase7MediaForExercise = (id: ExerciseId): readonly ExerciseMedia[] => {
  const requirement = mediaRequirementByExerciseId.get(id);
  if (!requirement) {
    throw new Error(`No Phase 7 media requirement resolves exercise ${id}`);
  }

  return [{
    kind: "motion",
    reference: requirement.reference,
    description: [
      requirement.movementPhases.join(" → "),
      `View: ${requirement.cameraView}`,
      `Technique: ${requirement.technicalPoints.join("; ")}.`,
    ].join(" "),
  }];
};
