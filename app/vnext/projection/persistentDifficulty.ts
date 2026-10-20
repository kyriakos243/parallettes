import type {
  BenchmarkProtocol,
  DefinitionBundle,
  ObservationSourceRef,
  RetainedDoseAdjustment,
  SessionPlan,
  SessionRecord,
} from "../contracts";
import { meaningfulWorkoutParticipationSeconds } from "../workoutTiming";
import type { NormalizedObservation } from "./contracts";
import { projectionReasonCodes } from "./policy";

type Identity = Pick<RetainedDoseAdjustment, "exerciseId" | "exerciseDefinitionVersion" | "prescriptionVariantId">;
export type DifficultyProtocolEvaluation = Readonly<{
  observation: NormalizedObservation;
  protocol: BenchmarkProtocol;
  passed: boolean;
  validFailure: boolean;
  reused: boolean;
  credit: "benchmark" | "development";
}>;
type Practice = Readonly<{
  observation: NormalizedObservation;
  kind: "difficult" | "manageable" | "other" | "symptom";
}>;
type Occasion = {
  identity: Identity;
  sessionKey: string;
  occurredAt: NormalizedObservation["occurredAt"];
  practice: Practice[];
  checks: DifficultyProtocolEvaluation[];
};

const identityKey = (identity: Identity): string =>
  `${identity.exerciseId}@${identity.exerciseDefinitionVersion}:${identity.prescriptionVariantId}`;
const identityFor = (observation: NormalizedObservation): Identity | undefined =>
  observation.exerciseId && observation.exerciseDefinitionVersion && observation.prescriptionVariantId
    ? { exerciseId: observation.exerciseId, exerciseDefinitionVersion: observation.exerciseDefinitionVersion,
      prescriptionVariantId: observation.prescriptionVariantId } : undefined;
const sourceKey = (source: ObservationSourceRef): string => source.kind === "evidence-event"
  ? `event:${source.eventId}` : `session:${source.sessionRecordId}:item:${source.planItemId}`;
const uniqueSources = (sources: readonly ObservationSourceRef[]): readonly ObservationSourceRef[] =>
  [...new Map(sources.map((source) => [sourceKey(source), source])).values()]
    .sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));

/**
 * Transparent programming heuristic: two distinct difficult practice occasions
 * retain the existing reduced dose. Two completed Easy/Right occasions, or a
 * fully confirmed exact reassessment, release it. This is not a capability or
 * fatigue score and has no calendar expiry.
 *
 * Inputs must be the projector's cutoff-filtered, corrected active sources.
 * Native protocol passes are supplied by its existing exact adjudicator.
 */
export const deriveRetainedDoseAdjustments = (input: Readonly<{
  observations: readonly NormalizedObservation[];
  sessionRecords: readonly SessionRecord[];
  sessionPlans: readonly SessionPlan[];
  definitionBundles: readonly DefinitionBundle[];
  protocolEvaluations: readonly DifficultyProtocolEvaluation[];
  isReassessmentConfirmed: (
    evaluations: readonly DifficultyProtocolEvaluation[],
    protocol: BenchmarkProtocol,
    at: NormalizedObservation["occurredAt"],
  ) => boolean;
}>): readonly RetainedDoseAdjustment[] => {
  const records = new Map(input.sessionRecords.map((record) => [record.id, record]));
  const plans = new Map(input.sessionPlans.map((plan) => [plan.id, plan]));
  const bundles = new Map(input.definitionBundles.map((bundle) => [bundle.catalogueVersion, bundle]));
  const occasions = new Map<string, Occasion>();
  const occasionFor = (observation: NormalizedObservation, identity: Identity): Occasion => {
    const key = `${identityKey(identity)}:${observation.sessionKey}`;
    const existing = occasions.get(key);
    if (existing) {
      if (observation.occurredAt > existing.occurredAt) existing.occurredAt = observation.occurredAt;
      return existing;
    }
    const occasion: Occasion = { identity, sessionKey: observation.sessionKey,
      occurredAt: observation.occurredAt, practice: [], checks: [] };
    occasions.set(key, occasion);
    return occasion;
  };
  const nativeItem = (observation: NormalizedObservation) => {
    if (observation.source.kind !== "session-item" || observation.legacySparse) return undefined;
    const source = observation.source;
    const record = records.get(source.sessionRecordId);
    const outcome = record?.itemOutcomes.find((item) => item.planItemId === source.planItemId);
    const plan = record && plans.get(record.planId);
    const item = plan?.items.find((candidate) => candidate.id === source.planItemId);
    const bundle = plan && bundles.get(plan.catalogueVersion);
    const exercise = bundle?.exercises.find((candidate) => candidate.id === observation.exerciseId
      && candidate.definitionVersion === observation.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) => candidate.id === observation.prescriptionVariantId);
    if (!outcome || !item || !exercise || !variant || record?.legacySource || plan?.legacySource
      || outcome.status === "skipped" || outcome.participationBasis === "legacy-unknown"
      || outcome.participationSeconds < meaningfulWorkoutParticipationSeconds(item, exercise, variant)) return undefined;
    return { outcome, item };
  };

  const seenPractice = new Set<string>();
  for (const observation of input.observations) {
    const identity = identityFor(observation);
    if (!identity || observation.evidenceSource !== "session-record" || observation.strength !== "development"
      || seenPractice.has(observation.sourceKey)) continue;
    seenPractice.add(observation.sourceKey);
    const native = nativeItem(observation);
    if (!native || native.item.purpose === "preparation" || native.item.purpose === "recovery") continue;
    const performedAsPlanned = native.item.exerciseId === identity.exerciseId
      && native.item.exerciseDefinitionVersion === identity.exerciseDefinitionVersion
      && native.item.prescriptionVariantId === identity.prescriptionVariantId;
    // A completed approved swap is stored as modified too. Its partial review
    // alone cannot establish that the selected movement or dose was too hard.
    const incompletePlannedWork = performedAsPlanned
      && (observation.reviewOutcome === "partial" || observation.reviewOutcome === "not-today");
    const kind: Practice["kind"] = observation.symptomOrInstability ? "symptom"
      : observation.reviewDifficulty === "hard" || incompletePlannedWork ? "difficult"
        : native.outcome.status === "completed" && observation.reviewOutcome === "clean"
          && (observation.reviewDifficulty === "easy" || observation.reviewDifficulty === "right")
          ? "manageable" : "other";
    occasionFor(observation, identity).practice.push({ observation, kind });
  }
  const seenChecks = new Set<string>();
  for (const evaluation of input.protocolEvaluations) {
    const observation = evaluation.observation;
    const identity = identityFor(observation);
    const key = `${observation.sourceKey}:${evaluation.protocol.id}@${evaluation.protocol.definitionVersion}`;
    if (!identity || evaluation.reused || evaluation.credit !== "benchmark" || observation.legacySparse
      || !["guided-test", "session-record"].includes(observation.evidenceSource)
      || evaluation.protocol.exerciseId !== identity.exerciseId
      || evaluation.protocol.prescriptionVariantId !== identity.prescriptionVariantId
      || seenChecks.has(key) || (observation.source.kind === "session-item" && !nativeItem(observation))) continue;
    seenChecks.add(key);
    occasionFor(observation, identity).checks.push(evaluation);
  }

  const byIdentity = new Map<string, Occasion[]>();
  for (const occasion of occasions.values()) {
    const key = identityKey(occasion.identity);
    byIdentity.set(key, [...byIdentity.get(key) ?? [], occasion]);
  }
  const adjustments: RetainedDoseAdjustment[] = [];
  for (const entries of byIdentity.values()) {
    entries.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)
      || left.sessionKey.localeCompare(right.sessionKey));
    let difficult: readonly (readonly ObservationSourceRef[])[] = [];
    let manageable: readonly (readonly ObservationSourceRef[])[] = [];
    let difficultObservationRefs: readonly ObservationSourceRef[] = [];
    let since: RetainedDoseAdjustment["since"] | undefined;
    const checkEvaluations = new Map<string, DifficultyProtocolEvaluation[]>();
    for (const entry of entries) {
      const symptomatic = entry.practice.some((item) => item.kind === "symptom")
        || entry.checks.some((item) => item.observation.symptomOrInstability);
      const hard = entry.practice.filter((item) => item.kind === "difficult");
      if (symptomatic) {
        // Symptoms never prove manageable recovery or contribute a second
        // ordinary difficult day. Existing safety projection owns the response.
        difficult = [];
        manageable = [];
        checkEvaluations.clear();
        continue;
      }
      if (hard.length) {
        difficult = [...difficult, uniqueSources(hard.map((item) => item.observation.source))].slice(-2);
        manageable = [];
        checkEvaluations.clear();
        if (difficult.length === 2 && since === undefined) {
          since = entry.occurredAt;
          difficultObservationRefs = uniqueSources(difficult.flat());
        }
        continue;
      }
      if (entry.practice.length) {
        difficult = [];
        if (since !== undefined && entry.practice.every((item) => item.kind === "manageable")) {
          manageable = [...manageable, uniqueSources(entry.practice.map((item) => item.observation.source))];
          if (manageable.length >= 2) { since = undefined; manageable = []; }
        } else {
          manageable = [];
        }
      }
      if (!entry.checks.length) continue;
      if (entry.checks.some((item) => !item.passed)) manageable = [];
      else difficult = [];
      if (since === undefined) continue;
      for (const evaluation of entry.checks) {
        const key = `${evaluation.protocol.id}@${evaluation.protocol.definitionVersion}`;
        const evaluations = [...checkEvaluations.get(key) ?? [], evaluation];
        checkEvaluations.set(key, evaluations);
        if (input.isReassessmentConfirmed(evaluations, evaluation.protocol, entry.occurredAt)) {
          since = undefined;
          manageable = [];
          checkEvaluations.clear();
          break;
        }
      }
    }
    if (since !== undefined) {
      adjustments.push({ ...entries[0]!.identity, since,
        difficultObservationRefs,
        manageableObservationRefs: uniqueSources(manageable.flat()),
        reasonCodes: [projectionReasonCodes.repeatedDifficultPerformance] });
    }
  }
  return adjustments.sort((left, right) => identityKey(left).localeCompare(identityKey(right)));
};
