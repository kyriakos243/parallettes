import { parseProjectionVersion } from "../contracts";
import { placementEntryRules } from "../placementEntry";
import { combinedProgressionCatalogue } from "./combinedProgressionRelease";
import type { VNextRuntimeCatalogue } from "../releaseCandidate/runtime";

/** Definitions/media v1–v8 are unchanged; v9 changes measured own-practice selection only. */
export const experiencedPlacementCatalogue: VNextRuntimeCatalogue = {
  ...combinedProgressionCatalogue,
  placementVersion: 2,
  projectionPolicy: {
    ...combinedProgressionCatalogue.projectionPolicy,
    version: parseProjectionVersion(9),
    measuredPlacementEntries: placementEntryRules,
  },
};
