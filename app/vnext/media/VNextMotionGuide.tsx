import {
  MotionGuide,
  isMotionPreset,
  registerMotionGuides,
} from "../../MotionGuide";
import {
  phase10OwnedMotionGuides,
  type OwnedMotionReference,
} from "./phase10OwnedMotion";

registerMotionGuides(phase10OwnedMotionGuides);

/** RC-only renderer: legacy owned guides plus the 28 Phase 10 additions. */
export const VNextMotionGuide = ({
  preset,
  compact = false,
  auditFrame,
}: Readonly<{
  preset: string | OwnedMotionReference;
  compact?: boolean;
  auditFrame?: "motion" | "start" | "middle" | "end";
}>) => {
  if (!isMotionPreset(preset)) {
    return <p role="alert">This exact movement has no registered owned guide.</p>;
  }
  return <MotionGuide preset={preset} compact={compact} auditFrame={auditFrame} />;
};
