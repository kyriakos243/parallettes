import type { PrescriptionVariant, SessionDemand } from "../contracts";
import { projectionReasonCodes, type evaluateTrainability } from "../projection";

/** The same load/restriction gate for focus selection and actual composition. */
export const usableDevelopmentVariant = (
  variant: PrescriptionVariant,
  evaluation: ReturnType<typeof evaluateTrainability>,
  demand: SessionDemand,
): boolean => {
  if (evaluation.decision === "block") return false;
  const high = Object.values(variant.demand).includes("high");
  if (evaluation.decision !== "modify") return true;
  if (high && (demand === "challenge"
    || evaluation.reasonCodes.includes(projectionReasonCodes.recentHighLoad)
    || evaluation.reasonCodes.includes(projectionReasonCodes.postClearance))) return false;
  return !evaluation.reasonCodes.includes(projectionReasonCodes.activeRestriction)
    || variant.id.endsWith("-regressed");
};
