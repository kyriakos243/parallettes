import "./batchAMedia";
import "../media/candidateMotionFrame.css";
import { registerMotionGuides, type MotionGuideDefinition } from "../../MotionGuide";
import { ensureMotion, hasDeferredMotion, registerDeferredMotion } from "../media/deferredMotion";
import { combinedProgressionBatches, validateCombinedProgressionAcceptance } from "./combinedProgressionRelease";

type AcceptedGuides = Readonly<Record<string, MotionGuideDefinition>>;

// Literal coordinates retain exact owner-reviewed data across CPU/math implementations.
// No generated fallback: release validation hashes every snapshot to its original approval.
// Each accepted batch is its own lazily fetched chunk, registered unchanged on first use.
// The service worker still precaches every chunk, so offline use keeps a complete shell.
const acceptedMotionLoaders = {
  B: async () => {
    const batchBMotionGuides = (await import("./acceptedBatchBMotion.json")).default as unknown as AcceptedGuides;
    registerMotionGuides(batchBMotionGuides);
  },
  C: async () => {
    const batchCMotionGuides = (await import("./acceptedBatchCMotion.json")).default as unknown as AcceptedGuides;
    registerMotionGuides(batchCMotionGuides);
  },
  D: async () => {
    const batchDMotionGuides = (await import("./acceptedBatchDMotion.json")).default as unknown as AcceptedGuides;
    registerMotionGuides(batchDMotionGuides);
  },
  E: async () => {
    const batchEMotionGuides = (await import("./acceptedBatchEMotion.json")).default as unknown as AcceptedGuides;
    registerMotionGuides(batchEMotionGuides);
  },
  F: async () => {
    const batchFMotionGuides = (await import("./acceptedBatchFMotion.json")).default as unknown as AcceptedGuides;
    registerMotionGuides(batchFMotionGuides);
  },
} as const;

if (validateCombinedProgressionAcceptance().length) throw new Error("Combined progression acceptance does not match this release");
for (const batch of combinedProgressionBatches) {
  registerDeferredMotion(batch.specs.map((spec) => spec.exercise), acceptedMotionLoaders[batch.letter]);
}

/**
 * Loads every accepted batch a workout may show (planned movements and their
 * offered swaps) before its player opens. Rejects when a batch cannot load, so
 * the workout is refused instead of showing a missing or substituted guide.
 */
export const prepareCombinedProgressionPlanMedia = async (
  references: readonly string[],
): Promise<void> => {
  const deferred = [...new Set(references)].filter(hasDeferredMotion);
  try {
    await Promise.all(deferred.map(ensureMotion));
  } catch (cause) {
    throw new Error("This workout’s movement guides aren’t on this device yet. Connect to the internet, close and reopen the app, then try again.", { cause });
  }
};
