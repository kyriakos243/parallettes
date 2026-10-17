import { registerMotionGuides } from "../../MotionGuide";
import { batchAMotionGuides } from "../progression/batchAMotion";
import { validateBatchAReleaseAcceptance } from "./batchARelease";

// Production-only registration; the accepted renderer/guide data are unchanged.
if (validateBatchAReleaseAcceptance().length) throw new Error("Batch A motion acceptance does not match this content release");
registerMotionGuides(batchAMotionGuides);
