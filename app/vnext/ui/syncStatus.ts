export type TrainingSyncStatus = Readonly<{
  phase: "idle" | "syncing" | "synced" | "waiting" | "error";
  fingerprint?: string;
  confirmedAt?: string;
}>;

export const trainingSyncMessage = (input: {
  account: boolean;
  online: boolean;
  fingerprint?: string;
  status: TrainingSyncStatus;
}): string => {
  if (!input.account) return "Saved on this device. Set up an account to sync across devices.";
  if (input.status.phase === "error") return "Saved on this device. Sync needs attention — open account or try Sync now.";
  if (!input.online) return "Saved on this device · Offline. Sync will retry when you reconnect.";
  if (input.status.phase === "syncing") return "Saved on this device · Syncing…";
  if (input.status.phase === "synced" && input.status.fingerprint === input.fingerprint && input.status.confirmedAt) {
    return `Synced · Last checked ${new Date(input.status.confirmedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return "Saved on this device · Waiting to sync.";
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
