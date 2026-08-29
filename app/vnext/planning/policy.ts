import {
  parseDefinitionVersion,
  parseStableId,
  type DemandDomain,
  type ExerciseId,
  type GraphId,
  type ReasonCode,
} from "../contracts";
import { graphIds } from "../definitions";
import type { GeneratorPolicy } from "./contracts";

const reason = (value: string): ReasonCode => parseStableId("reason", value);

export const planningReasonCodes = {
  goalPrimary: reason("planning-goal-primary"),
  goalSecondary: reason("planning-goal-secondary"),
  userOverride: reason("planning-user-override"),
  previousEmphasisRetained: reason("planning-emphasis-retained"),
  emphasisReviewDue: reason("planning-emphasis-review-due"),
  eligibleTarget: reason("planning-eligible-target"),
  workingTarget: reason("planning-working-target"),
  reconfirmation: reason("planning-reconfirmation"),
  prerequisiteDevelopment: reason("planning-prerequisite-development"),
  maintenance: reason("planning-maintenance"),
  compatibleSecondary: reason("planning-compatible-secondary"),
  deferredRestriction: reason("planning-deferred-restriction"),
  deferredRecentLoad: reason("planning-deferred-recent-load"),
  secondaryLoadConflict: reason("planning-secondary-load-conflict"),
  specialistExplicitTargetRequired: reason("planning-specialist-explicit-target-required"),
  missingContent: reason("planning-missing-content"),
  selectedPreparation: reason("planning-preparation-selected"),
  selectedTechnical: reason("planning-technical-selected"),
  selectedPrimary: reason("planning-primary-selected"),
  selectedCapacity: reason("planning-capacity-selected"),
  selectedSecondary: reason("planning-secondary-selected"),
  selectedMaintenance: reason("planning-maintenance-selected"),
  selectedRecovery: reason("planning-recovery-selected"),
  intensityTechnique: reason("planning-intensity-technique"),
  intensityStandard: reason("planning-intensity-standard"),
  intensityChallenge: reason("planning-intensity-challenge"),
  doseModified: reason("planning-dose-modified"),
  safeSubstitution: reason("planning-safe-substitution"),
  exactDuration: reason("planning-exact-duration"),
  shorterSafetyException: reason("planning-shorter-safety-exception"),
  noSafeRelevantCandidate: reason("planning-no-safe-relevant-candidate"),
  invalidInput: reason("planning-invalid-input"),
  projectionTooOld: reason("planning-projection-too-old"),
  referenceInvalid: reason("planning-reference-invalid"),
  prerequisiteBypass: reason("planning-prerequisite-bypass"),
  specialistBypass: reason("planning-specialist-bypass"),
  equipmentMissing: reason("planning-equipment-missing"),
  trainabilityBlocked: reason("planning-trainability-blocked"),
  incompatibleHighLoad: reason("planning-incompatible-high-load"),
  technicalOrdering: reason("planning-technical-ordering"),
  durationInvalid: reason("planning-duration-invalid"),
} as const;

export const highUpperLimbDomains = [
  "forward-straight-arm-upper-limb",
  "overhead-straight-arm-upper-limb",
  "horizontal-bent-arm-push",
  "vertical-bent-arm-push",
] as const satisfies readonly DemandDomain[];

const pair = (left: GraphId, right: GraphId): readonly [GraphId, GraphId] => [left, right];
const exercise = (value: string): ExerciseId => parseStableId("exercise", value);

export const VNEXT_GENERATOR_POLICY_VERSION = parseDefinitionVersion(1);

export const vNextGeneratorPolicy = {
  id: parseStableId("policy", "vnext-goal-directed-generator"),
  version: VNEXT_GENERATOR_POLICY_VERSION,
  exactDurationSeconds: 25 * 60,
  maximumProjectionAgeSeconds: 5 * 60,
  emphasisReviewMinimumSessions: 8,
  emphasisReviewMaximumSessions: 12,
  highUpperLimbDomains,
  incompatibleGraphPairs: [
    pair(graphIds.planche, graphIds.verticalPushHspu),
    pair(graphIds.planche, graphIds.pressToHandstand),
    pair(graphIds.verticalPushHspu, graphIds.pressToHandstand),
  ],
  preparationExerciseIds: [
    exercise("wrist-circles"),
    exercise("forearm-turn-finger-spread"),
    exercise("shoulder-sweep"),
    exercise("wall-slides"),
    exercise("alternating-straight-leg-hamstring-sweep"),
    exercise("dynamic-half-kneeling-hip-flexor-reach"),
    exercise("scap-pushup"),
    exercise("down-dog-scapular-shrugs"),
    exercise("cossack-weight-shift"),
  ],
  recoveryExerciseIds: [
    exercise("upper-back-reach"),
    exercise("supine-90-90-breathing-reset"),
    exercise("seated-pike-breathing-reset"),
    exercise("supine-hamstring-stretch"),
    exercise("child-reach"),
    exercise("crossbody-shoulder-stretch"),
    exercise("figure-four-glute-stretch"),
    exercise("gentle-frog-adductor-hold"),
    exercise("seated-wrist-extension-stretch"),
  ],
  blockSeconds: {
    technique: {
      preparation: 180,
      technical: 360,
      primary: 360,
      supporting: 360,
      supplemental: 180,
      recovery: 60,
    },
    standard: {
      preparation: 180,
      technical: 300,
      primary: 420,
      supporting: 420,
      supplemental: 120,
      recovery: 60,
    },
    challenge: {
      preparation: 180,
      technical: 240,
      primary: 480,
      supporting: 420,
      supplemental: 120,
      recovery: 60,
    },
  },
} as const satisfies GeneratorPolicy;

export const demandReasonCode = (demand: "technique" | "standard" | "challenge"): ReasonCode =>
  demand === "technique"
    ? planningReasonCodes.intensityTechnique
    : demand === "challenge"
      ? planningReasonCodes.intensityChallenge
      : planningReasonCodes.intensityStandard;
