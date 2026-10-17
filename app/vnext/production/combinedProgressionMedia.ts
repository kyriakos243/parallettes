import "./batchAMedia";
import "../media/candidateMotionFrame.css";
import { registerMotionGuides, type MotionGuideDefinition } from "../../MotionGuide";
import acceptedBatchBMotion from "./acceptedBatchBMotion.json";
const batchBMotionGuides = acceptedBatchBMotion as unknown as Readonly<Record<string, MotionGuideDefinition>>;
import acceptedBatchCMotion from "./acceptedBatchCMotion.json";
const batchCMotionGuides = acceptedBatchCMotion as unknown as Readonly<Record<string, MotionGuideDefinition>>;
import acceptedBatchDMotion from "./acceptedBatchDMotion.json";
const batchDMotionGuides = acceptedBatchDMotion as unknown as Readonly<Record<string, MotionGuideDefinition>>;
import acceptedBatchEMotion from "./acceptedBatchEMotion.json";
const batchEMotionGuides = acceptedBatchEMotion as unknown as Readonly<Record<string, MotionGuideDefinition>>;
import acceptedBatchFMotion from "./acceptedBatchFMotion.json";
const batchFMotionGuides = acceptedBatchFMotion as unknown as Readonly<Record<string, MotionGuideDefinition>>;
import { validateCombinedProgressionAcceptance } from "./combinedProgressionRelease";

// Literal coordinates retain exact owner-reviewed data across CPU/math implementations.
// No generated fallback: release validation hashes every snapshot to its original approval.
if (validateCombinedProgressionAcceptance().length) throw new Error("Combined progression acceptance does not match this release");
registerMotionGuides(batchBMotionGuides);
registerMotionGuides(batchCMotionGuides);
registerMotionGuides(batchDMotionGuides);
registerMotionGuides(batchEMotionGuides);
registerMotionGuides(batchFMotionGuides);
