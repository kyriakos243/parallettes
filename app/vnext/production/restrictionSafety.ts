import { parseDefinitionVersion, parseProjectionVersion, parseStableId, type DemandDomain } from "../contracts";
import type { RestrictionExposureRule } from "../projection/contracts";
import type { VNextRuntimeCatalogue } from "../releaseCandidate/runtime";
import { experiencedPlacementCatalogue } from "./experiencedPlacement";

const wrist = "hand-wrist-bearing" as const;

/**
 * Physical-contact audit of the existing v1 definitions and owned guides.
 * These are restriction exposures, not new fatigue ratings. Both native
 * standard and reduced-range/assisted variants retain the listed contact.
 * No name/focus heuristic is used: future versions require a fresh audit.
 */
export const restrictionExposureAudit: readonly Readonly<{
  exerciseIds: readonly string[];
  demandDomains: readonly DemandDomain[];
  basis: string;
}>[] = [
  {
    exerciseIds: ["scap-pushup"],
    demandDomains: [wrist],
    basis: "program.ts prescribes pushing the floor away; MotionGuide uses a straight-arm plank. The knee regression still bears through the palms.",
  },
  {
    exerciseIds: ["cat-cow-flow", "kneeling-thoracic-rotation", "bird-dog", "bird-dog-knee-to-elbow", "thread-needle"],
    demandDomains: [wrist],
    basis: "program.ts and MotionGuide use quadruped, with one or both hands supporting the torso. Reduced movement or reach does not remove the supporting hand.",
  },
  {
    exerciseIds: ["bent-compression", "straight-compression", "single-leg-compression", "seated-pike-compression-pulses", "alternating-pike-leg-lift", "straddle-compression-lift", "straddle-lsit-compression-prep", "floor-seated-knee-lift", "floor-single-leg-pike-lift", "floor-double-leg-pike-lift", "straddle-pike-pulses", "seated-pike-hold-lift-off"],
    demandDomains: [wrist],
    basis: "The owned seatedPike/straddle guides keep hands pressed into the floor or bars; authored cues explicitly press down. Bent-knee, single-leg and shorter lifts retain that support. Floor tuck V-sit is excluded: its guide explicitly keeps hands off the floor.",
  },
  {
    exerciseIds: ["wrist-flexor-rock", "wrist-extensor-rock"],
    demandDomains: [wrist],
    basis: "MotionGuide uses quadruped with palms pressed into the floor; program.ts says palms flat/light pressure. Gentler pressure still loads the affected wrist.",
  },
  {
    exerciseIds: ["child-reach", "lat-parallette", "puppy-rock", "shoulder-wall-lat-stretch"],
    demandDomains: [wrist],
    basis: "Owned child/lat-reach guides use supported forward reaching on the floor or bars; the wall stretch explicitly permits hand support. A shorter reach does not guarantee unloaded wrists or shoulders.",
  },
  {
    exerciseIds: ["grounded-side-exit-rehearsal", "down-dog-to-pike-weight-shift", "wall-split-kick-entry-rehearsal"],
    demandDomains: [wrist],
    basis: "MotionGuide uses pike/low-inversion side exits, a pike shoulder shift, and a hands-down kick toward the wall. Low pike and smaller kicks still load hands and overhead arms; standing hands-off rehearsal is a separate excluded exercise.",
  },
];

export const restrictionExposureRules: readonly RestrictionExposureRule[] = restrictionExposureAudit.flatMap((group) =>
  group.exerciseIds.map((id) => ({
    exerciseId: parseStableId("exercise", id),
    exerciseDefinitionVersion: parseDefinitionVersion(1),
    prescriptionVariantIds: [parseStableId("prescription", `${id}-standard`), parseStableId("prescription", `${id}-regressed`)],
    demandDomains: group.demandDomains,
  })));

/** Catalogue/media/native readers remain byte-identical; only current safety policy changes. */
export const restrictionSafetyCatalogue: VNextRuntimeCatalogue = {
  ...experiencedPlacementCatalogue,
  projectionPolicy: {
    ...experiencedPlacementCatalogue.projectionPolicy,
    version: parseProjectionVersion(10),
    restrictionExposureRules,
    // program.ts prescribes supported feet; the exact owned guide (including
    // the regressed variant's shared media) visibly uses a wall. The text-only
    // feet-on-floor alternative has no separate exact guide to advertise.
    additionalEquipmentRules: [{
      exerciseId: parseStableId("exercise", "supine-90-90-breathing-reset"),
      exerciseDefinitionVersion: parseDefinitionVersion(1),
      prescriptionVariantIds: [
        parseStableId("prescription", "supine-90-90-breathing-reset-standard"),
        parseStableId("prescription", "supine-90-90-breathing-reset-regressed"),
      ],
      equipment: [parseStableId("equipment", "wall")],
    }],
  },
};
