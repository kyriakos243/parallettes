import type { LocalAthleteSummary } from "../persistence/contracts";
import type { VNextLocalIdentityChoice } from "../releaseCandidate/VNextAccountGate";

/** Device-only athletes are minted locally with this prefix (see VNextAccountGate localIdentity). */
export const DEVICE_ONLY_ATHLETE_PREFIX = "vnext-rc-";

const shortDate = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Choices for device-only training already saved in this database. Only
 * locally minted athletes are offered: an account athlete's leftover data is
 * never opened without signing in to that account.
 */
export const deviceOnlyAthleteChoices = (
  athletes: readonly LocalAthleteSummary[],
  alreadyListed: ReadonlySet<string>,
): readonly VNextLocalIdentityChoice[] => athletes
  .filter(({ athleteId }) => athleteId.startsWith(DEVICE_ONLY_ATHLETE_PREFIX) && !alreadyListed.has(athleteId))
  .sort((left, right) => (right.lastActivityAt ?? "").localeCompare(left.lastActivityAt ?? ""))
  .map((athlete) => ({
    identity: { version: 1, athleteId: athlete.athleteId, mode: "local" },
    label: "Continue device-only training",
    detail: [
      "Saved on this device",
      athlete.sessionCount === 1 ? "1 workout" : `${athlete.sessionCount} workouts`,
      ...(athlete.lastActivityAt ? [`last on ${shortDate(athlete.lastActivityAt)}`] : []),
    ].join(" · "),
  }));
