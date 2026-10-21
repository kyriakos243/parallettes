import type { VNextShadowStore } from "../persistence/contracts";

export type SerialOperation = <T>(operation: () => Promise<T>) => Promise<T>;

/** Network waits stay outside the command queue; typed writes stay inside it. */
export const serialSyncStore = (store: VNextShadowStore, serial: SerialOperation): VNextShadowStore => new Proxy(store, {
  get(target, key) {
    if (key === "applySyncDelta") return (...args: Parameters<VNextShadowStore["applySyncDelta"]>) =>
      serial(() => target.applySyncDelta(...args));
    if (key === "acknowledgeSync") return (...args: Parameters<VNextShadowStore["acknowledgeSync"]>) =>
      serial(() => target.acknowledgeSync(...args));
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

/** Focus, timer and source-change requests collapse into one active exchange. */
export const createBackgroundSync = (run: () => Promise<void>) => {
  let active: Promise<void> | undefined;
  let requested = false;
  let disposed = false;
  const request = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (active) { requested = true; return active; }
    active = (async () => {
      do {
        requested = false;
        await run();
      } while (requested && !disposed);
    })().finally(() => { active = undefined; });
    return active;
  };
  return { request, dispose: () => { disposed = true; requested = false; } };
};
