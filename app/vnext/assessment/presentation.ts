import type { DefinitionBundle } from "../contracts";
import type { AssessmentStep, GuidedTestOffer, PlacementResponse } from "./contracts";

export const placementResponseOptions = [
  { value: "clean", label: "Cleanly at the shown target" },
  { value: "partial", label: "Partial or inconsistent" },
  { value: "not-yet", label: "Not yet" },
  { value: "not-sure", label: "Not sure" },
  { value: "symptom", label: "Caused symptoms — stop this branch" },
] as const satisfies readonly Readonly<{ value: PlacementResponse; label: string }>[];

export const assessmentAnchorPresentation = (
  step: Extract<AssessmentStep, { kind: "anchor" }>,
  bundle: DefinitionBundle,
) => {
  const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === step.anchor.protocolId);
  if (!protocol) throw new TypeError(`Unknown assessment protocol ${step.anchor.protocolId}`);
  const exercise = bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  if (!exercise) throw new TypeError(`Unknown assessment exercise ${protocol.exerciseId}`);
  return {
    title: step.title,
    prompt: step.prompt,
    exercise: {
      id: exercise.id,
      name: exercise.name,
      instructions: exercise.instructions,
      media: exercise.media,
      safetyNotes: exercise.safetyNotes,
    },
    protocol: {
      id: protocol.id,
      metric: protocol.metric,
      conditions: protocol.conditions,
      qualityCriteria: protocol.qualityCriteria,
      safetyCriteria: protocol.safetyCriteria,
    },
    responses: placementResponseOptions,
  } as const;
};
export const guidedTestPresentation = (
  offer: GuidedTestOffer,
  bundle: DefinitionBundle,
) => {
  const protocol = bundle.benchmarkProtocols.find((candidate) => candidate.id === offer.protocolId);
  if (!protocol) throw new TypeError(`Unknown guided protocol ${offer.protocolId}`);
  const exercise = bundle.exercises.find((candidate) => candidate.id === protocol.exerciseId);
  if (!exercise) throw new TypeError(`Unknown guided exercise ${protocol.exerciseId}`);
  return {
    offer,
    exercise: {
      id: exercise.id,
      name: exercise.name,
      instructions: exercise.instructions,
      media: exercise.media,
      safetyNotes: exercise.safetyNotes,
    },
    metric: protocol.metric,
    conditions: protocol.conditions,
    qualityCriteria: protocol.qualityCriteria,
    safetyCriteria: protocol.safetyCriteria,
    confirmation: protocol.confirmation,
  } as const;
};
