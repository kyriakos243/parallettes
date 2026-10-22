export type TrainingSyncStatus = Readonly<{
  phase: "idle" | "syncing" | "synced" | "waiting" | "error" | "update-required" | "attention";
  fingerprint?: string;
  confirmedAt?: string;
  /** Rows set aside because the account would not accept them (attention phase). */
  held?: number;
}>;

const heldPhrase = (held: number | undefined): string => held === undefined || held <= 1
  ? "1 change couldn't sync"
  : `${held} changes couldn't sync`;

export const trainingSyncMessage = (input: {
  account: boolean;
  online: boolean;
  fingerprint?: string;
  status: TrainingSyncStatus;
}): string => {
  if (!input.account) return "Saved on this device. Set up an account to sync across devices.";
  if (input.status.phase === "update-required") return "Saved on this device. Update the app to resume sync. Until then, this device may not show your latest training from other devices.";
  // Never "Synced" while anything is set aside; everything else keeps syncing.
  if (input.status.phase === "attention") return `Saved on this device · ${heldPhrase(input.status.held)}. Everything else keeps syncing.`;
  if (input.status.phase === "error") return "Saved on this device. Sync needs attention — open account or try Sync now.";
  if (!input.online) return "Saved on this device · Offline. Sync will retry when you reconnect.";
  if (input.status.phase === "syncing") return "Saved on this device · Syncing…";
  if (input.status.phase === "synced" && input.status.fingerprint === input.fingerprint && input.status.confirmedAt) {
    return `Synced · Last checked ${new Date(input.status.confirmedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return "Saved on this device · Waiting to sync.";
};

/**
 * Screen-reader announcement for the sync line. Only a change of state is
 * spoken: a background "Syncing…" pass keeps the previous announcement and
 * the "Last checked" time is left out, so periodic sync stays silent.
 */
export const trainingSyncAnnouncement = (input: Parameters<typeof trainingSyncMessage>[0] & Readonly<{ previous?: string }>): string => {
  if (!input.account) return "Saved on this device.";
  if (input.status.phase === "update-required") return "Saved on this device. Update the app to resume sync.";
  if (input.status.phase === "attention") return `Saved on this device. ${heldPhrase(input.status.held)}.`;
  if (input.status.phase === "error") return "Saved on this device. Sync needs attention.";
  if (!input.online) return "Saved on this device. Offline.";
  if (input.status.phase === "syncing") return input.previous ?? "Saved on this device.";
  if (input.status.phase === "synced" && input.status.fingerprint === input.fingerprint && input.status.confirmedAt) return "Synced.";
  return "Saved on this device. Waiting to sync.";
};

type DescribableItem = Readonly<{
  kind: string;
  state?: "pending" | "held" | "blocked";
  payload: unknown;
  hold?: Readonly<{ reason: string; detail: string }>;
}>;

const shortDate = (iso: unknown): string | undefined => typeof iso === "string" && !Number.isNaN(Date.parse(iso))
  ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
  : undefined;

/** Plain name for one unsynced item, e.g. "Workout on 22 Oct". */
export const describeSyncItem = (item: DescribableItem): string => {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  if (item.kind === "session-record") {
    const date = shortDate(payload.completedAt);
    return payload.supersedesRecordId ? `Workout correction${date ? ` for ${date}` : ""}` : `Workout${date ? ` on ${date}` : ""}`;
  }
  if (item.kind === "session-plan") return "Workout plan";
  if (item.kind === "evidence-event") {
    const date = shortDate(payload.occurredAt);
    return `Check or comfort update${date ? ` on ${date}` : ""}`;
  }
  if (item.kind === "athlete-intent") return "Goal and equipment changes";
  if (item.kind === "reset-tombstone") return "Progress reset";
  return "Progress from the previous app version";
};

/** Why a set-aside item could not sync, in everyday words. */
export const describeHoldReason = (item: DescribableItem): string => {
  if (!item.hold) return "";
  if (item.hold.detail === "intent-timestamp-conflict") return "Another device saved different goals at the same moment.";
  if (item.hold.reason === "conflict") return "Your account already has a different version from another device.";
  if (item.hold.reason === "too-large") return "It is too large to upload in one request.";
  return "Your account did not accept it. Updating the app will try it again.";
};

/** Short sign-out lines naming every unsynced item: set-aside items one by one, the rest counted. */
export const describeUnsyncedItems = (items: readonly DescribableItem[]): readonly string[] => {
  const lines: string[] = [];
  for (const item of items.filter(({ state }) => state === "held")) {
    lines.push(`${describeSyncItem(item)} — set aside: ${describeHoldReason(item).replace(/\.$/u, "").toLowerCase()}`);
  }
  const rest = items.filter(({ state, kind }) => state !== "held" && kind !== "session-plan");
  const workouts = rest.filter(({ kind }) => kind === "session-record").length;
  const checks = rest.filter(({ kind }) => kind === "evidence-event").length;
  if (workouts) lines.push(workouts === 1 ? "1 workout not yet synced" : `${workouts} workouts not yet synced`);
  if (checks) lines.push(checks === 1 ? "1 check or comfort update not yet synced" : `${checks} checks or comfort updates not yet synced`);
  if (rest.some(({ kind }) => kind === "athlete-intent")) lines.push("goal and equipment changes not yet synced");
  if (rest.some(({ kind }) => kind === "reset-tombstone")) lines.push("a progress reset not yet synced");
  if (rest.some(({ kind }) => kind === "legacy-snapshot" || kind === "migration-run")) lines.push("progress from the previous app version not yet synced");
  if (!lines.length && items.length) lines.push("a workout plan not yet synced");
  return lines;
};

/** What a workout save actually did. A reset-suppressed append is never reported as saved. */
export const workoutSaveOutcomeMessage = (
  status: "inserted" | "duplicate" | "ignored-older",
  options: Readonly<{ retry: boolean; restrictionFollowUp?: boolean }>,
): string => {
  if (status === "ignored-older") return "Not saved: a training reset on your account covers this workout’s date, so it was not added to History.";
  if (status === "duplicate" && options.retry) return "Workout already saved. No duplicate was added.";
  if (options.restrictionFollowUp) return "Workout saved. Your reported discomfort will be considered in future workouts; your achievements are kept.";
  return options.retry ? "Workout saved." : "";
};

/** One notice when the account dropped an uploaded workout because a reset covers it. */
export const suppressedWorkoutNotice = (
  suppressed: readonly Readonly<{ kind: string; status: string; payload: unknown }>[],
): string | undefined => {
  const workouts = suppressed.filter(({ kind, status, payload }) => kind === "session-record" && status === "ignored-reset"
    && !(payload as { supersedesRecordId?: unknown } | null)?.supersedesRecordId);
  if (!workouts.length) return undefined;
  if (workouts.length > 1) return `${workouts.length} workouts were removed because a training reset from another device covers them.`;
  const date = shortDate((workouts[0]!.payload as { completedAt?: unknown } | null)?.completedAt);
  return `A workout${date ? ` from ${date}` : ""} was removed because a training reset from another device covers it.`;
};

/** A completed sync plus stable sources and an empty outbox are required for a confirmation. */
export const confirmedSyncFingerprint = async (input: {
  fingerprint: string;
  readFingerprint: () => Promise<string>;
  hasPending: () => Promise<boolean>;
}): Promise<string | undefined> => {
  if (await input.hasPending()) return undefined;
  if (await input.readFingerprint() !== input.fingerprint) return undefined;
  if (await input.hasPending()) return undefined;
  return input.fingerprint;
};
