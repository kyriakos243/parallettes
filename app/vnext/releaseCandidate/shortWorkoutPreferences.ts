import type { VNextCustomSessionMinutes } from "../planning/custom";

export type ShortWorkoutPreferences = Readonly<{
  minutes: VNextCustomSessionMinutes;
  focusToken: string;
}>;

type FocusIdentity =
  | Readonly<{ kind: "general" }>
  | Readonly<{ kind: "graph"; graphId: string }>
  | Readonly<{ kind: "capacity"; plannerGraphId: string; capacityIds: readonly string[] }>;

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const shortWorkoutPreferenceKey = (athleteId: string, storageNamespace: string): string =>
  `parallette25-${storageNamespace}-short-workout-v1:${athleteId}`;

// Labels and option order can change without changing the saved choice.
export const shortWorkoutFocusToken = (focus: FocusIdentity): string => {
  if (focus.kind === "general") return "general";
  if (focus.kind === "graph") return `graph:${focus.graphId}`;
  return `capacity:${focus.plannerGraphId}:${[...focus.capacityIds].sort().join(",")}`;
};

const validMinutes = (value: unknown): value is VNextCustomSessionMinutes =>
  value === 5 || value === 10 || value === 15 || value === 20;

const browserStorage = (): PreferenceStorage | undefined => {
  try { return globalThis.localStorage; } catch { return undefined; }
};

export const readShortWorkoutPreferences = (
  key: string | undefined,
  fallback: ShortWorkoutPreferences,
  availableFocusTokens: readonly string[],
  storage = browserStorage(),
): ShortWorkoutPreferences => {
  if (!key || !storage) return fallback;
  try {
    const stored: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return fallback;
    const value = stored as Record<string, unknown>;
    if (value.version !== 1) return fallback;
    return {
      minutes: validMinutes(value.minutes) ? value.minutes : fallback.minutes,
      focusToken: typeof value.focusToken === "string" && availableFocusTokens.includes(value.focusToken)
        ? value.focusToken : fallback.focusToken,
    };
  } catch { return fallback; }
};

export const rememberShortWorkoutPreferences = (
  key: string | undefined,
  preferences: ShortWorkoutPreferences,
  storage = browserStorage(),
): void => {
  if (!key || !storage) return;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, minutes: preferences.minutes, focusToken: preferences.focusToken }));
  } catch { /* Convenience memory must never block building a fresh workout. */ }
};

export const clearShortWorkoutPreferences = (key: string, storage = browserStorage()): void => {
  try { storage?.removeItem(key); } catch { /* The account lifecycle owns authoritative data clearing. */ }
};
