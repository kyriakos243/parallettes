export type AccountAccess = "checking" | "allowed" | "locked";

/** Keeps an already authorised screen mounted during foreground revalidation. */
export const createAccountAccessController = (input: Readonly<{
  hasSession: () => Promise<boolean>;
  validateSession: () => Promise<"active" | "offline" | "invalid">;
  onAccessChange: (access: AccountAccess) => void;
}>) => {
  let generation = 0;
  let disposed = false;
  const current = (selected: number) => !disposed && selected === generation;
  const publish = (next: AccountAccess) => {
    if (disposed) return;
    input.onAccessChange(next);
  };
  const lock = () => {
    generation += 1;
    publish("locked");
  };
  const validate = async ({ preserveMounted = false } = {}): Promise<void> => {
    if (disposed) return;
    const selected = ++generation;
    // Initial access and changed credentials must pass validation before mount.
    // A previously accepted, unexpired bearer already permits offline access.
    if (!preserveMounted) publish("checking");
    try {
      const localSessionPresent = await input.hasSession();
      if (!current(selected)) return;
      if (!localSessionPresent) { lock(); return; }
      const status = await input.validateSession();
      if (!current(selected)) return;
      const localSessionStillPresent = status !== "invalid" && await input.hasSession();
      if (current(selected)) publish(localSessionStillPresent ? "allowed" : "locked");
    } catch {
      if (current(selected)) publish("locked");
    }
  };
  const ensureLocalSession = async (): Promise<void> => {
    const selected = generation;
    try {
      const present = await input.hasSession();
      if (current(selected) && !present) lock();
    } catch {
      if (current(selected)) lock();
    }
  };
  return {
    validate,
    ensureLocalSession,
    lock,
    dispose: () => { disposed = true; generation += 1; },
  };
};
