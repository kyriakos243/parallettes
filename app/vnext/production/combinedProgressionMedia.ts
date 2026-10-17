import "./batchAMedia";
import "../media/candidateMotionFrame.css";
import { registerMotionGuides } from "../../MotionGuide";
import { batchBMotionGuides } from "../progression/batchBMotion";
import { batchCMotionGuides } from "../progression/batchCMotion";
import { batchDMotionGuides } from "../progression/batchDMotion";
import { batchEMotionGuides } from "../progression/batchEMotion";
import { batchFMotionGuides } from "../progression/batchFMotion";
import { validateCombinedProgressionAcceptance } from "./combinedProgressionRelease";

if (validateCombinedProgressionAcceptance().length) throw new Error("Combined progression acceptance does not match this release");
registerMotionGuides(batchBMotionGuides);
registerMotionGuides(batchCMotionGuides);
registerMotionGuides(batchDMotionGuides);
registerMotionGuides(batchEMotionGuides);
registerMotionGuides(batchFMotionGuides);
