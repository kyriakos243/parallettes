import { useEffect, useState, type ComponentProps } from "react";
import { isMotionPreset } from "../../MotionGuide";
import { VNextMotionGuide } from "./VNextMotionGuide";

/**
 * Production delivery of owner-accepted guides whose literal data is fetched on
 * first use instead of with the application shell. The accepted renderer
 * (`VNextMotionGuide`), registry and data stay byte-identical; only the moment
 * of registration moves.
 */
export type DeferredMotionLoader = () => Promise<void>;

const deferredMotion = new Map<string, DeferredMotionLoader>();
const pendingLoads = new Map<DeferredMotionLoader, Promise<void>>();

export const registerDeferredMotion = (references: readonly string[], load: DeferredMotionLoader): void => {
  for (const reference of references) {
    if (!isMotionPreset(reference)) deferredMotion.set(reference, load);
  }
};

export const hasDeferredMotion = (reference: string): boolean => deferredMotion.has(reference);

/**
 * True once `reference` is registered (fetching its batch first when needed);
 * false for an unknown reference. Rejects when deferred data cannot load, so a
 * caller refuses to start rather than substitute another guide. Concurrent
 * requests for one batch share one fetch. A failed fetch is not cached here,
 * but browsers keep a failed module import for the life of the page, so real
 * recovery needs an app reload (normally the worker has precached every batch).
 */
export const ensureMotion = async (reference: string): Promise<boolean> => {
  if (isMotionPreset(reference)) return true;
  const load = deferredMotion.get(reference);
  if (!load) return false;
  let pending = pendingLoads.get(load);
  if (!pending) {
    pending = load();
    pendingLoads.set(load, pending);
    pending.catch(() => pendingLoads.delete(load));
  }
  await pending;
  if (!isMotionPreset(reference)) throw new Error(`Owned guide ${reference} was not registered by its batch`);
  return true;
};

const placeholderStyle = {
  minHeight: 160,
  display: "grid",
  placeItems: "center",
  padding: 12,
  textAlign: "center",
} as const;

/** Renders the accepted guide; shows a stable placeholder while its batch loads. */
export const DeferredMotionGuide = (props: ComponentProps<typeof VNextMotionGuide>) => {
  const { preset } = props;
  const [, setRegistered] = useState(0);
  const [failedPreset, setFailedPreset] = useState<string>();
  const waiting = !isMotionPreset(preset) && hasDeferredMotion(preset);

  useEffect(() => {
    if (!waiting) return;
    let active = true;
    ensureMotion(preset).then(
      () => { if (active) setRegistered((value) => value + 1); },
      () => { if (active) setFailedPreset(preset); },
    );
    return () => { active = false; };
  }, [waiting, preset]);

  if (waiting) {
    return (
      <div className="vnext-motion-loading" role="status" style={placeholderStyle}>
        {failedPreset === preset
          ? "This guide isn’t on this device yet. Connect to the internet, then close and reopen the app."
          : "Loading guide…"}
      </div>
    );
  }
  return <VNextMotionGuide {...props} />;
};
