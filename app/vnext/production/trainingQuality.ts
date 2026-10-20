import { parseProjectionVersion } from "../contracts";
import type { VNextRuntimeCatalogue } from "../releaseCandidate/runtime";
import { restrictionSafetyCatalogue } from "./restrictionSafety";

/** New derived policy only; native definitions and observations remain unchanged. */
export const trainingQualityCatalogue: VNextRuntimeCatalogue = {
  ...restrictionSafetyCatalogue,
  projectionPolicy: {
    ...restrictionSafetyCatalogue.projectionPolicy,
    version: parseProjectionVersion(11),
    requireCurrentSafetyPrerequisites: true,
    longTermAllocation: true,
    persistentDifficulty: true,
    scopedSymptomRecovery: true,
  },
};
