import type { LegacyV12ProfileSource } from "../legacyV12";

const DEFAULT_EQUIPMENT = new Set(["floor", "parallettes", "wall"]);

/**
 * The profile API creates an empty v1.2 shell for every new cloud account.
 * Treating that shell as migrated training state would create an intent and
 * incorrectly skip new-placement. Existing v1.2 use is meaningful when it
 * contains training evidence, a reset, a changed programme position or a
 * user-authored training/context preference.
 */
export const hasMeaningfulLegacyTrainingState = (
  legacy: LegacyV12ProfileSource,
): boolean => {
  const equipment = new Set(legacy.equipment);
  const equipmentChanged = equipment.size !== DEFAULT_EQUIPMENT.size
    || [...DEFAULT_EQUIPMENT].some((id) => !equipment.has(id));
  const meaningfulPreference = Object.keys(legacy.preferences)
    .some((key) => key !== "soundOn");

  return legacy.revision > 1
    || legacy.nextProgramDay !== 1
    || legacy.history.length > 0
    || Object.keys(legacy.readiness).length > 0
    || Object.keys(legacy.readinessUpdatedAt).length > 0
    || Object.keys(legacy.progression).length > 0
    || legacy.progressResetAt !== undefined
    || equipmentChanged
    || meaningfulPreference;
};

/** Native or previously migrated vNext authority permanently wins. */
export const shouldApplyProductionLegacyConversion = (
  legacy: LegacyV12ProfileSource | undefined,
  vNextAuthorityPresent: boolean,
  reconcilePendingV1Handoff = false,
): legacy is LegacyV12ProfileSource => (!vNextAuthorityPresent || reconcilePendingV1Handoff)
  && legacy !== undefined
  && hasMeaningfulLegacyTrainingState(legacy);
