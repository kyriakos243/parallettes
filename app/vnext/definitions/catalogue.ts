import { exerciseList, type Exercise as LegacyExercise } from "../../program";
import {
  DEMAND_DOMAINS,
  DOMAIN_SCHEMA_VERSION,
  parseStableId,
  type CapacityFacetId,
  type CapacityId,
  type DemandDomain,
  type DemandLevel,
  type DemandProfile,
  type ExerciseDefinition,
  type ExerciseId,
  type ExerciseRelation,
  type ExerciseRole,
  type GraphId,
  type PrescriptionTarget,
} from "../contracts";
import { benchmarkProtocols } from "./benchmarks";
import {
  VNEXT_BASE_DEFINITION_VERSION,
  capacityFacetIds,
  capacityIds,
  exerciseId,
  graphIds,
  prescriptionId,
  regressionPrescriptionId,
} from "./ids";

const set = (...values: readonly string[]) => new Set(values);

const plancheContributors = set(
  "parallette-forward-lean-hold",
  "floor-planche-lean",
  "planche-lean-hold",
  "planche-lean-scapular-pulse",
  "planche-lean-toe-lightener",
  "foot-assisted-tuck-planche",
  "floor-tuck-planche-attempt",
  "straddle-planche-lean",
  "pseudo-planche-parallette-pushup",
);

const lSitContributors = set(
  "tuck-support",
  "foot-assisted-lsit",
  "one-foot-assisted-lsit",
  "tuck-support-knee-extensions",
  "alternating-lsit-extension",
  "assisted-straddle-lsit-hold",
  "eccentric-lsit-to-tuck-lower",
  "one-leg-lsit-hold",
  "alternating-one-leg-lsit-switch",
  "full-lsit-attempt",
  "straddle-lsit-compression-prep",
);

const verticalPushContributors = set(
  "bear-to-pike-shoulder-load",
  "pike-elevation",
  "pike-scapular-shrugs",
  "box-pike-scapular-shrugs",
  "wall-elevation",
  "shallow-range-pike-pushup",
  "floor-pike-push-up",
  "parallette-pike-pushup",
  "eccentric-pike-pushup",
);

const pushingContributors = set(
  "knee-push-up",
  "floor-push-up",
  "parallette-push-up-plus",
  "controlled-parallette-pushup",
  "staggered-parallette-push-up",
  "tempo-floor-push-up",
  "pseudo-planche-parallette-pushup",
);

const transitionContributors = set(
  "support-to-tuck-transition",
  "tuck-to-one-leg-lsit-transition",
  "tuck-to-lsit-transition",
  "entry-balance-side-exit-chain",
);

const frogCraneTechnique = set(
  "frog-stand-hold",
  "floor-frog-stand-setup",
  "floor-frog-stand",
  "floor-crane-one-knee-float",
);

const handstandFocus = set("line", "entry", "exit", "balance", "grip", "overhead-load");
const groundedHandstandTechnique = set(
  "grounded-side-exit-rehearsal",
  "standing-kickup-line-rehearsal",
  "prone-handstand-line-hold",
  "wall-shoulder-flexion-line-drill",
  "pike-shift",
  "bear-to-pike-shoulder-load",
  "pike-elevation",
  "pike-scapular-shrugs",
  "pike-alternating-toe-float",
);

const preparationOnly = set("shoulder-wall-lat-stretch");

const lowSupportedInversion = set(
  "box-pike",
  "wall-l",
  "box-toe-light",
  "partial-wall-walk",
  "box-pike-scapular-shrugs",
  "box-pike-shoulder-shift",
  "box-pike-one-leg-line-lift",
  "floor-side-exit-practice",
);

const fullInversion = set(
  "wall-kickup",
  "chest-wall-line",
  "wall-elevation",
  "heel-pullaway",
  "wall-facing-handstand-weight-shift",
  "chest-wall-alternating-toe-peel",
  "kickup-stop-short-drill",
  "parallette-kickup-to-wall",
  "split-leg-wall-pullaway",
  "wall-handstand-side-exit",
  "freestanding-parallette-kickup",
  "full-wall-walk",
  "parallette-wall-grip-pressure-shift",
  "chest-wall-micro-shoulder-tap",
  "entry-balance-side-exit-chain",
  "floor-chest-wall-handstand-hold",
  "floor-back-wall-heel-pull",
  "floor-chest-wall-toe-pull",
  "floor-wall-weight-shift",
  "floor-controlled-kick-up-to-wall",
  "floor-freestanding-kick-up",
  "floor-freestanding-balance-attempt",
);

const compressionOverrides = set(
  "floor-seated-knee-lift",
  "straddle-pike-pulses",
  "seated-pike-hold-lift-off",
  "floor-tuck-v-sit-balance",
);

const straightArmScapularContributors = set(
  "scap-pushup",
  "support-shrugs",
  "parallette-push-up-plus",
  "parallette-forward-lean-hold",
  "planche-lean-scapular-pulse",
);

const tallSupportContributors = set(
  "support-hold",
  "support-shrugs",
  "supported-knee-raise",
  "tuck-support",
  "foot-assisted-lsit",
  "one-foot-assisted-lsit",
  "tuck-support-knee-extensions",
  "alternating-lsit-extension",
  "assisted-straddle-lsit-hold",
  "eccentric-lsit-to-tuck-lower",
  "one-leg-lsit-hold",
  "alternating-one-leg-lsit-switch",
  "full-lsit-attempt",
  "support-to-tuck-transition",
  "tuck-to-one-leg-lsit-transition",
  "tuck-to-lsit-transition",
);

const shoulderFlexionAccessContributors = set(
  "shoulder-sweep",
  "wall-slides",
  "child-reach",
  "lat-parallette",
  "puppy-rock",
  "wall-yw-sweep",
  "forearms-parallette-prayer-rock",
  "wall-shoulder-flexion-line-drill",
  "shoulder-wall-lat-stretch",
  "rope-step-through-mobility",
  "dynamic-half-kneeling-hip-flexor-reach",
);

const activeElevationContributors = set(
  "down-dog-scapular-shrugs",
  "pike-elevation",
  "pike-scapular-shrugs",
  "box-pike-scapular-shrugs",
  "wall-elevation",
);

const overheadStackedContributors = set(
  "box-pike",
  "wall-l",
  "chest-wall-line",
  "floor-chest-wall-handstand-hold",
  "wall-elevation",
  "box-pike-one-leg-line-lift",
  "wall-facing-handstand-weight-shift",
  "floor-wall-weight-shift",
  "parallette-wall-grip-pressure-shift",
  "chest-wall-micro-shoulder-tap",
  "floor-chest-wall-toe-pull",
);

const pikeAccessContributors = set(
  "alternating-straight-leg-hamstring-sweep",
  "supine-hamstring-stretch",
  "seated-pike-breathing-reset",
  "seated-pike-hold-lift-off",
  "seated-pike-compression-pulses",
  "floor-single-leg-pike-lift",
  "floor-double-leg-pike-lift",
  "single-leg-compression",
  "straight-compression",
  "alternating-pike-leg-lift",
);

const activeSingleLegPikeContributors = set(
  "single-leg-compression",
  "floor-single-leg-pike-lift",
  "alternating-pike-leg-lift",
);

const activeDoubleLegPikeContributors = set(
  "straight-compression",
  "floor-double-leg-pike-lift",
  "seated-pike-compression-pulses",
  "seated-pike-hold-lift-off",
);

const straddleAccessContributors = set(
  "cossack-weight-shift",
  "seated-straddle-fold-gentle",
  "gentle-frog-adductor-hold",
  "straddle-pike-pulses",
  "straddle-compression-lift",
  "straddle-lsit-compression-prep",
  "assisted-straddle-lsit-hold",
);

const activeStraddleContributors = set(
  "straddle-pike-pulses",
  "straddle-compression-lift",
  "straddle-lsit-compression-prep",
);

const hollowControlContributors = set(
  "hollow-tuck",
  "dead-bug",
  "mountain-climber",
  "hollow-rocks",
  "plank-saw",
  "hollow-reach",
  "hollow-one-leg",
  "deadbug-heel-tap",
  "long-lever-parallette-plank",
  "long-lever-hollow-hold",
  "hollow-flutter-kicks",
  "hollow-to-tuck-rock",
  "deadbug-double-leg-lower",
  "plank-knee-drive-isometric",
  "parallette-plank-leg-lift",
  "hollow-scissor-kicks",
  "bear-shoulder-circles",
  "bear-shoulder-tap",
  "forearm-plank",
  "rkc-plank",
  "forearm-plank-body-saw",
  "bird-dog",
  "bird-dog-knee-to-elbow",
  "bear-crawl-step",
  "reverse-crunch",
  "bent-knee-leg-lower",
  "straight-leg-raise",
  "tuck-up",
  "controlled-v-up",
  "alternating-jackknife",
  "supine-toe-reach",
  "hollow-to-arch-log-roll",
);

const moderateForwardStraightArmContributors = set(
  "scap-pushup",
  "plank-pike",
  "down-dog-plank-wave",
  "long-lever-parallette-plank",
  "parallette-push-up-plus",
);

const moderateOverheadStraightArmContributors = set(
  "plank-pike",
  "pike-shift",
  "kneeling-lean",
  "pike-elevation",
  "down-dog-plank-wave",
  "bear-to-pike-shoulder-load",
  "pike-scapular-shrugs",
  "pike-alternating-toe-float",
  "down-dog-scapular-shrugs",
);

const auditedHandSupported = set(
  "pike-shift",
  "pike-elevation",
  "pike-scapular-shrugs",
  "pike-alternating-toe-float",
  "down-dog-scapular-shrugs",
);

const conditioningPreparation = set("easy-rope-bounce", "recovery-bounce");

const staticTargetOverrides: Readonly<Record<string, Readonly<{ minimum: number; maximum: number }>>> = {
  "prone-handstand-line-hold": { minimum: 20, maximum: 30 },
  "forearm-plank": { minimum: 20, maximum: 30 },
  "rkc-plank": { minimum: 10, maximum: 20 },
  "side-plank-star-hold": { minimum: 8, maximum: 15 },
  "forearm-side-plank": { minimum: 15, maximum: 25 },
  "floor-tuck-v-sit-balance": { minimum: 10, maximum: 20 },
  "floor-chest-wall-handstand-hold": { minimum: 20, maximum: 30 },
  "floor-planche-lean": { minimum: 15, maximum: 25 },
  "reverse-plank-hold": { minimum: 20, maximum: 30 },
  "sphinx-breathing-hold": { minimum: 20, maximum: 30 },
  "supine-spinal-twist": { minimum: 20, maximum: 30 },
  "kneeling-hip-flexor-stretch": { minimum: 20, maximum: 30 },
  "seated-straddle-fold-gentle": { minimum: 20, maximum: 30 },
  "shoulder-wall-lat-stretch": { minimum: 20, maximum: 30 },
};

const explicitRegressionTargets: Readonly<Record<string, string>> = {
  "plank-tap": "kneeling-plank-tap",
  "straight-compression": "single-leg-compression",
  "bridge-walkout": "glute-bridge-march",
  "high-plank-bird-dog": "bird-dog",
  "lateral-bear-crawl": "bear-crawl-step",
  "floor-frog-stand": "floor-frog-stand-setup",
  "floor-crane-one-knee-float": "floor-frog-stand",
  "floor-controlled-kick-up-to-wall": "wall-split-kick-entry-rehearsal",
  "floor-freestanding-kick-up": "floor-controlled-kick-up-to-wall",
  "floor-freestanding-balance-attempt": "floor-back-wall-heel-pull",
  "wall-split-kick-entry-rehearsal": "standing-kickup-line-rehearsal",
  "tempo-floor-push-up": "floor-push-up",
  "floor-side-exit-practice": "grounded-side-exit-rehearsal",
  "floor-tuck-planche-attempt": "foot-assisted-tuck-planche",
  "alternate-foot-step": "basic-two-foot-bounce",
  "boxer-step": "alternate-foot-step",
  "side-to-side-ski-hop": "basic-two-foot-bounce",
  "forward-back-hop": "basic-two-foot-bounce",
  "high-knee-rope": "alternate-foot-step",
  "fast-single-under-cadence": "basic-two-foot-bounce",
};

type GraphContribution = ExerciseDefinition["graphLinks"][number]["contribution"];
type MutableGraphLink = {
  graphId: GraphId;
  nodeId?: ExerciseDefinition["graphLinks"][number]["nodeId"];
  contribution: GraphContribution;
};

const milestoneLinksByExercise = new Map<string, MutableGraphLink[]>();
const benchmarkIdsByExercise = new Map<string, ExerciseDefinition["benchmarkProtocolIds"]>();
for (const protocol of benchmarkProtocols) {
  const ids = benchmarkIdsByExercise.get(protocol.exerciseId) ?? [];
  benchmarkIdsByExercise.set(protocol.exerciseId, [...ids, protocol.id]);
  if (protocol.subject.kind !== "milestone") continue;
  const links = milestoneLinksByExercise.get(protocol.exerciseId) ?? [];
  links.push({
    graphId: protocol.subject.milestone.graphId,
    nodeId: protocol.subject.milestone.nodeId,
    contribution: "milestone",
  });
  milestoneLinksByExercise.set(protocol.exerciseId, links);
}

const isHandstandContributor = (exercise: LegacyExercise): boolean =>
  !preparationOnly.has(exercise.id) && (
    exercise.category === "Handstand"
    || handstandFocus.has(exercise.primaryFocus)
    || frogCraneTechnique.has(exercise.id)
    || groundedHandstandTechnique.has(exercise.id)
  );

const graphLinksFor = (exercise: LegacyExercise): ExerciseDefinition["graphLinks"] => {
  const links: MutableGraphLink[] = [...(milestoneLinksByExercise.get(exercise.id) ?? [])];
  const add = (graphId: GraphId, contribution: GraphContribution) => {
    if (links.some((link) => link.graphId === graphId)) return;
    links.push({ graphId, contribution });
  };

  if (plancheContributors.has(exercise.id)) add(graphIds.planche, "development");
  if (lSitContributors.has(exercise.id)) add(graphIds.lSitVSit, "development");
  if (isHandstandContributor(exercise)) {
    add(
      graphIds.handstandBalance,
      frogCraneTechnique.has(exercise.id) || handstandFocus.has(exercise.primaryFocus)
        ? "technique"
        : "development",
    );
  }
  if (verticalPushContributors.has(exercise.id)) add(graphIds.verticalPushHspu, "development");
  if (pushingContributors.has(exercise.id)) add(graphIds.parallettePushing, "development");
  if (transitionContributors.has(exercise.id)) add(graphIds.transitions, "transition");
  if (exercise.id === "entry-balance-side-exit-chain") add(graphIds.handstandBalance, "transition");
  return links;
};

type CapacityLinkAccumulator = Map<CapacityId, Set<CapacityFacetId>>;

const addFacet = (
  links: CapacityLinkAccumulator,
  capacityId: CapacityId,
  ...facetIds: readonly CapacityFacetId[]
) => {
  const existing = links.get(capacityId) ?? new Set<CapacityFacetId>();
  facetIds.forEach((facetId) => existing.add(facetId));
  links.set(capacityId, existing);
};

const capacityLinksFor = (exercise: LegacyExercise): ExerciseDefinition["capacityLinks"] => {
  const links: CapacityLinkAccumulator = new Map();
  const focuses = new Set([exercise.primaryFocus, ...exercise.secondaryFocus]);
  const id = exercise.id;

  if (tallSupportContributors.has(id)) {
    addFacet(links, capacityIds.straightArmSupport, capacityFacetIds.tallSupport);
  }
  if (straightArmScapularContributors.has(id)) {
    addFacet(links, capacityIds.straightArmSupport, capacityFacetIds.scapularControl);
  }
  if (plancheContributors.has(id) || id === "parallette-push-up-plus") {
    addFacet(links, capacityIds.straightArmSupport, capacityFacetIds.protractedForwardLoading);
  }

  if (shoulderFlexionAccessContributors.has(id)) {
    addFacet(links, capacityIds.overheadSupport, capacityFacetIds.shoulderFlexionAccess);
  }
  if (activeElevationContributors.has(id)) {
    addFacet(links, capacityIds.overheadSupport, capacityFacetIds.activeElevation);
  }
  if (overheadStackedContributors.has(id)) {
    addFacet(links, capacityIds.overheadSupport, capacityFacetIds.stackedSupport);
  }

  if (focuses.has("horizontal-push")) {
    addFacet(links, capacityIds.horizontalBentArmPush, capacityFacetIds.horizontalRange);
    if (id.includes("parallette") || id.includes("planche")) {
      addFacet(links, capacityIds.horizontalBentArmPush, capacityFacetIds.paralletteRangeControl);
    }
    if (id.includes("tempo") || id.includes("staggered") || id.includes("pseudo")) {
      addFacet(links, capacityIds.horizontalBentArmPush, capacityFacetIds.horizontalRepeatableStrength);
    }
  }

  if (focuses.has("vertical-push")) {
    addFacet(links, capacityIds.verticalBentArmPush, capacityFacetIds.pikeRange);
    if (id.includes("parallette") || id.includes("eccentric")) {
      addFacet(links, capacityIds.verticalBentArmPush, capacityFacetIds.deepPikeControl);
    }
    if (id.includes("floor") || id.includes("parallette")) {
      addFacet(links, capacityIds.verticalBentArmPush, capacityFacetIds.verticalRepeatableStrength);
    }
  }

  if (pikeAccessContributors.has(id)) {
    addFacet(links, capacityIds.pikeCompression, capacityFacetIds.usablePikeAccess);
  }
  if (activeSingleLegPikeContributors.has(id)) {
    addFacet(links, capacityIds.pikeCompression, capacityFacetIds.activeSingleLegLift);
  }
  if (activeDoubleLegPikeContributors.has(id)) {
    addFacet(links, capacityIds.pikeCompression, capacityFacetIds.activeDoubleLegLift);
  }
  if (straddleAccessContributors.has(id)) {
    addFacet(links, capacityIds.straddleCompression, capacityFacetIds.usableStraddleAccess);
  }
  if (activeStraddleContributors.has(id)) {
    addFacet(links, capacityIds.straddleCompression, capacityFacetIds.activeStraddleLift);
  }

  if (hollowControlContributors.has(id)) {
    addFacet(links, capacityIds.bodyLineControl, capacityFacetIds.hollowControl);
  }
  if (focuses.has("posterior-chain")) {
    addFacet(links, capacityIds.bodyLineControl, capacityFacetIds.archControl);
  }
  if (id === "hollow-to-arch-log-roll" || id === "prone-swimmer") {
    addFacet(links, capacityIds.bodyLineControl, capacityFacetIds.integratedLine);
  }
  if (focuses.has("anti-rotation")) {
    addFacet(links, capacityIds.bodyLineControl, capacityFacetIds.antiRotationControl);
  }

  return [...links].map(([capacityId, facetIds]) => ({
    capacityId,
    facetIds: [...facetIds],
  }));
};

const demandRank: Record<DemandLevel, number> = { low: 0, moderate: 1, high: 2 };
const demandLevel = (rank: number): DemandLevel => rank >= 2 ? "high" : rank >= 1 ? "moderate" : "low";

const demandFor = (exercise: LegacyExercise): DemandProfile => {
  const ranks = Object.fromEntries(DEMAND_DOMAINS.map((domain) => [domain, 0])) as Record<DemandDomain, number>;
  const raise = (domain: DemandDomain, level: DemandLevel) => {
    ranks[domain] = Math.max(ranks[domain], demandRank[level]);
  };
  const focuses = new Set([exercise.primaryFocus, ...exercise.secondaryFocus]);
  const id = exercise.id;
  const handSupported = focuses.has("support")
    || focuses.has("planche")
    || focuses.has("horizontal-push")
    || focuses.has("vertical-push")
    || id.includes("plank")
    || id.includes("bear")
    || tallSupportContributors.has(id)
    || auditedHandSupported.has(id);
  if (handSupported) raise("hand-wrist-bearing", "moderate");
  if ((exercise.fatigueCost?.wrist ?? 0) >= 1) raise("hand-wrist-bearing", "moderate");
  if ((exercise.fatigueCost?.wrist ?? 0) >= 3) raise("hand-wrist-bearing", "high");

  if (moderateForwardStraightArmContributors.has(id)) {
    raise("forward-straight-arm-upper-limb", "moderate");
  }
  if (plancheContributors.has(id)) raise("forward-straight-arm-upper-limb", "high");

  if (moderateOverheadStraightArmContributors.has(id)) {
    raise("overhead-straight-arm-upper-limb", "moderate");
  }

  if (focuses.has("horizontal-push")) {
    raise("horizontal-bent-arm-push", id.includes("knee") ? "moderate" : "high");
  }
  if (focuses.has("vertical-push")) {
    raise("vertical-bent-arm-push", id.includes("shallow") ? "moderate" : "high");
    raise("overhead-straight-arm-upper-limb", "moderate");
  }

  if (fullInversion.has(id)) {
    raise("inversion-technical", "high");
    if (!frogCraneTechnique.has(id)) {
      raise("hand-wrist-bearing", "high");
      raise("overhead-straight-arm-upper-limb", "high");
    }
  } else if (lowSupportedInversion.has(id)) {
    raise("inversion-technical", "moderate");
    raise("hand-wrist-bearing", "moderate");
    raise("overhead-straight-arm-upper-limb", "moderate");
  } else if (isHandstandContributor(exercise)
    && !frogCraneTechnique.has(id)
    && !groundedHandstandTechnique.has(id)
    && !preparationOnly.has(id)) {
    raise("inversion-technical", "moderate");
  }

  if (
    focuses.has("hollow")
    || focuses.has("compression")
    || focuses.has("anti-extension")
    || focuses.has("anti-rotation")
    || focuses.has("posterior-chain")
    || focuses.has("lsit")
    || focuses.has("horizontal-push")
    || focuses.has("vertical-push")
    || fullInversion.has(id)
    || lowSupportedInversion.has(id)
    || (focuses.has("planche") && !frogCraneTechnique.has(id))
    || compressionOverrides.has(id)
  ) {
    raise(
      "compression-trunk",
      focuses.has("lsit") || (focuses.has("planche") && !frogCraneTechnique.has(id)) ? "high" : "moderate",
    );
  }
  if (frogCraneTechnique.has(id)) raise("compression-trunk", "moderate");
  if ((exercise.fatigueCost?.core ?? 0) >= 3) raise("compression-trunk", "high");

  return Object.fromEntries(
    DEMAND_DOMAINS.map((domain) => [domain, demandLevel(ranks[domain])]),
  );
};

const targetFor = (exercise: LegacyExercise): PrescriptionTarget => {
  if (exercise.id === "eccentric-pike-pushup") {
    return { kind: "repetitions", minimum: 3, maximum: 6 };
  }
  const staticOverride = staticTargetOverrides[exercise.id];
  if (staticOverride) {
    return {
      kind: "duration-seconds",
      minimum: staticOverride.minimum,
      maximum: staticOverride.maximum,
    };
  }
  const minimum = exercise.targetMin ?? 1;
  const maximum = exercise.targetMax;
  if (exercise.targetType === "attempts") {
    return { kind: "attempts", minimum, ...(maximum === undefined ? {} : { maximum }) };
  }
  if (exercise.targetType === "hold") {
    if (/breath/iu.test(exercise.target)) return { kind: "quality", description: exercise.target };
    return { kind: "duration-seconds", minimum, ...(maximum === undefined ? {} : { maximum }) };
  }
  return { kind: "repetitions", minimum, ...(maximum === undefined ? {} : { maximum }) };
};

const rolesFor = (
  exercise: LegacyExercise,
  graphLinks: ExerciseDefinition["graphLinks"],
  capacityLinks: ExerciseDefinition["capacityLinks"],
): readonly ExerciseRole[] => {
  const roles = new Set<ExerciseRole>();
  const benchmarkIds = benchmarkIdsByExercise.get(exercise.id) ?? [];
  if (graphLinks.some((link) => link.contribution === "milestone")) roles.add("outcome-milestone");
  if (benchmarkIds.length > 0) roles.add("benchmark-test");
  if (graphLinks.some((link) => link.contribution === "development" || link.contribution === "transition")) {
    roles.add("development-drill");
  }
  if (capacityLinks.length > 0) roles.add("capacity-accessory");
  if (isHandstandContributor(exercise) || frogCraneTechnique.has(exercise.id)) roles.add("technique-safety");
  if (exercise.category === "Warm-up" || exercise.category === "Cooldown" || conditioningPreparation.has(exercise.id)) {
    roles.add("preparation-recovery");
  }
  if (exercise.category === "Conditioning" || conditioningPreparation.has(exercise.id)) roles.add("conditioning");
  if (roles.size === 0) {
    if (capacityLinks.length > 0) roles.add("capacity-accessory");
    else if (exercise.category === "Calisthenics") roles.add("development-drill");
    else roles.add("preparation-recovery");
  }
  return [...roles];
};

const equipmentFor = (exercise: LegacyExercise): ExerciseDefinition["equipment"] => {
  const auditedOverrides: Readonly<Record<string, readonly string[]>> = {
    "wall-l": ["parallettes", "wall", "floor"],
    "standing-kickup-line-rehearsal": ["floor"],
  };
  const equipment = new Set(auditedOverrides[exercise.id] ?? exercise.requiredEquipment ?? ["floor"]);
  if (exercise.id.includes("wall") || exercise.name.toLowerCase().includes("wall")) equipment.add("wall");
  return [...equipment].map((id) => parseStableId("equipment", id));
};

const relationsFor = (exercise: LegacyExercise): readonly ExerciseRelation[] => {
  const relations: ExerciseRelation[] = [];
  if (exercise.fallbackId) {
    relations.push({
      kind: "substitution",
      targetExerciseId: exerciseId(exercise.fallbackId),
      fromPrescriptionVariantId: prescriptionId(exercise.id),
      targetPrescriptionVariantId: prescriptionId(exercise.fallbackId),
    });
  }
  const explicit = explicitRegressionTargets[exercise.id];
  if (explicit && explicit !== exercise.fallbackId) {
    relations.push({
      kind: "regression",
      targetExerciseId: exerciseId(explicit),
      fromPrescriptionVariantId: prescriptionId(exercise.id),
      targetPrescriptionVariantId: prescriptionId(explicit),
    });
  }
  return relations;
};

const convertExercise = (exercise: LegacyExercise): ExerciseDefinition => {
  const graphLinks = graphLinksFor(exercise);
  const capacityLinks = capacityLinksFor(exercise);
  const roles = rolesFor(exercise, graphLinks, capacityLinks);
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    id: exerciseId(exercise.id),
    definitionVersion: VNEXT_BASE_DEFINITION_VERSION,
    lifecycle: "active",
    name: exercise.name,
    description: exercise.focus ?? exercise.name,
    instructions: {
      how: exercise.how ?? exercise.media.specification,
      cues: exercise.cues,
      avoid: [exercise.avoid ?? "Stop before control or comfort is lost."],
    },
    media: [{
      kind: "motion",
      reference: exercise.media.motion ?? exercise.media.src ?? exercise.id,
      description: exercise.media.specification,
    }],
    equipment: equipmentFor(exercise),
    roles,
    graphLinks,
    capacityLinks,
    prescriptionVariants: [
      {
        id: prescriptionId(exercise.id),
        label: exercise.target,
        target: targetFor(exercise),
        demand: demandFor(exercise),
      },
      ...(exercise.regression.trim() ? [{
        id: regressionPrescriptionId(exercise.id),
        label: `Regressed — ${exercise.regression}`,
        target: targetFor(exercise),
        assistance: exercise.regression,
        // Retaining the standard demand is deliberately conservative until a
        // later authored variant can prove a lower load profile.
        demand: demandFor(exercise),
      }] : []),
    ],
    benchmarkProtocolIds: benchmarkIdsByExercise.get(exercise.id) ?? [],
    relations: relationsFor(exercise),
    safetyNotes: [exercise.safety ?? "Stop for sharp or escalating pain."],
  };
};

export const exerciseDefinitions = exerciseList.map(convertExercise) as readonly ExerciseDefinition[];

export const exerciseDefinitionById = new Map(
  exerciseDefinitions.map((definition) => [definition.id, definition] as const),
);

/**
 * Phase 2 identity policy: all v1.2 IDs remain active; aliases and tombstones
 * are reserved for future explicit deprecations and are never inferred from
 * display names or the legacy linear-path metadata.
 */
export const catalogueIdentityPolicy = {
  sourceVersion: "1.2",
  stableIdsRetained: exerciseDefinitions.map((definition) => definition.id),
  aliases: [] as readonly Readonly<{ alias: ExerciseId; canonicalId: ExerciseId }>[],
  tombstones: [] as readonly Readonly<{ id: ExerciseId; reason: string }>[],
  ignoredCompatibilityFields: ["easierId", "harderId", "progressionFamily", "prerequisites"],
} as const;
