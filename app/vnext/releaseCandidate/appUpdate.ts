export type AppUpdateState = Readonly<{
  phase: "idle" | "checking" | "available" | "applying" | "error";
  runningBuild?: string;
  availableBuild?: string;
  message?: string;
}>;

type WorkerReply = { buildId?: string; status?: string };
const validBuild = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{20}$/u.test(value);

/** Some native end-from-Today flows retain the timer after the immutable save. */
export const hasUnfinishedUpdateWork = (input: {
  athleteId: string;
  workout: string | null;
  guided: string | null;
  timer: string | null;
  savedPlanIds: readonly string[];
}): boolean => {
  if (input.workout || input.guided) return true;
  if (!input.timer) return false;
  try {
    const timer = JSON.parse(input.timer) as { athleteId?: string; planId?: string } | null;
    return !timer || timer.athleteId !== input.athleteId || typeof timer.planId !== "string"
      || !input.savedPlanIds.includes(timer.planId);
  } catch { return true; }
};

/** No credentials or athlete data cross this channel. */
export const askUpdateWorker = (worker: ServiceWorker, type: string, buildId?: string): Promise<WorkerReply> =>
  new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("The update is not ready yet. Try checking again when online."));
    }, 4_000);
    channel.port1.onmessage = (event: MessageEvent<WorkerReply>) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    };
    try { worker.postMessage({ type, buildId }, [channel.port2]); }
    catch (reason) { clearTimeout(timer); channel.port1.close(); reject(reason); }
  });

/** Explicit, single-window update. Saved outbox entries never need to be removed or acknowledged. */
export const createAppUpdateController = (input: {
  workers: ServiceWorkerContainer;
  base: string;
  runningBuild?: string;
  canApply: () => boolean;
  onState: (state: AppUpdateState) => void;
  reload: () => void;
  request?: typeof askUpdateWorker;
}) => {
  const request = input.request ?? askUpdateWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let disposed = false;
  let target: { worker: ServiceWorker; buildId: string; waiting: boolean } | undefined;
  let applyingBuild: string | undefined;
  let reloading = false;
  let checking = false;
  let activationTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];
  const emit = (state: Omit<AppUpdateState, "runningBuild">) => {
    if (!disposed) input.onState({ ...state, runningBuild: input.runningBuild });
  };
  const inspect = async () => {
    if (!registration || disposed || applyingBuild) return;
    const worker = registration.waiting ?? input.workers.controller ?? registration.active;
    if (!worker) return;
    const reply = await request(worker, "P25_UPDATE_VERSION");
    if (disposed || applyingBuild || !validBuild(reply.buildId)) return;
    // The legacy network-first worker can serve a new HTML shell before its
    // matching worker activates. That waiting worker still needs this action.
    if (input.runningBuild && (worker === registration.waiting || reply.buildId !== input.runningBuild)) {
      target = { worker, buildId: reply.buildId, waiting: worker === registration.waiting };
      emit({ phase: "available", availableBuild: reply.buildId });
    } else {
      target = undefined;
      emit({ phase: "idle", message: "You’re using the latest downloaded version." });
      // Cleanup only after the new shell is running, and only when the worker
      // independently verifies no other app window still needs old assets.
      if (reply.buildId === input.runningBuild && worker === input.workers.controller) {
        void request(worker, "P25_RELEASE_OLD_CACHES", reply.buildId).catch(() => undefined);
      }
    }
  };
  const controllerChanged = () => {
    if (!applyingBuild) { void inspect().catch(() => undefined); return; }
    const worker = input.workers.controller;
    if (!worker) return;
    void request(worker, "P25_UPDATE_VERSION").then((reply) => {
      if (disposed || reloading || reply.buildId !== applyingBuild) return;
      // Applying locks the app before activation. Never reload on an unrelated claim.
      clearTimeout(activationTimer);
      reloading = true;
      input.reload();
    }).catch(() => undefined);
  };
  input.workers.addEventListener("controllerchange", controllerChanged);
  cleanups.push(() => input.workers.removeEventListener("controllerchange", controllerChanged));

  const check = async () => {
    if (checking || applyingBuild || disposed) return;
    checking = true;
    emit({ phase: "checking" });
    try {
      registration ??= await input.workers.register(`${input.base}sw.js`, { scope: input.base, updateViaCache: "none" });
      if (!cleanups.some((cleanup) => cleanup === removeUpdateListener)) {
        registration.addEventListener("updatefound", updateFound);
        cleanups.push(removeUpdateListener);
      }
      updateFound();
      await registration.update();
      await inspect();
      if (!target) emit({ phase: "idle", message: "You’re using the latest downloaded version." });
    } catch {
      // An already downloaded update remains usable while offline.
      try { await inspect(); } catch { /* Legacy workers do not support messages. */ }
      if (!target) emit({ phase: "error", message: "Couldn’t check for an update. Your saved work is kept; try again when online." });
    } finally { checking = false; }
  };
  const updateFound = () => {
    const installing = registration?.installing;
    if (!installing) return;
    const changed = () => {
      if (installing.state === "installed") void inspect().catch(() => undefined);
    };
    installing.addEventListener("statechange", changed);
    cleanups.push(() => installing.removeEventListener("statechange", changed));
  };
  const removeUpdateListener = () => registration?.removeEventListener("updatefound", updateFound);
  const apply = async () => {
    if (!target || applyingBuild || disposed) return;
    if (!input.canApply()) {
      emit({ phase: "available", availableBuild: target.buildId,
        message: "Finish saving your workout or check, then return here to update." });
      return;
    }
    const selected = target;
    applyingBuild = selected.buildId;
    emit({ phase: "applying", availableBuild: selected.buildId });
    try {
      if (!selected.waiting) { reloading = true; input.reload(); return; }
      const reply = await request(selected.worker, "P25_APPLY_UPDATE", selected.buildId);
      if (reply.status !== "accepted") throw new Error(reply.status === "other-windows"
        ? "Close other Parallette25 tabs or windows on this device, then tap Update now."
        : "The downloaded update changed. Check for updates and try again.");
      if (disposed || reloading) return;
      activationTimer = setTimeout(() => {
        applyingBuild = undefined;
        emit({ phase: "available", availableBuild: selected.buildId, message: "The update is still waiting. Try Update now again." });
      }, 10_000);
      controllerChanged();
    } catch (reason) {
      applyingBuild = undefined;
      emit({ phase: "available", availableBuild: selected.buildId,
        message: reason instanceof Error ? reason.message : "The update could not start. Your saved work is kept." });
    }
  };
  return {
    check, apply,
    dispose: () => { disposed = true; clearTimeout(activationTimer); cleanups.forEach((cleanup) => cleanup()); },
  };
};
