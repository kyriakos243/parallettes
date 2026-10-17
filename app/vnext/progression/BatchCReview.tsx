import { useState } from "react";
import { registerMotionGuides } from "../../MotionGuide";
import { VNextMotionGuide } from "../media/VNextMotionGuide";
import { WorkoutRunner, clearActiveWorkoutDraft } from "../releaseCandidate/WorkoutRunner";
import { parseStableId, type SessionPlan } from "../contracts";
import { vNextGeneratorPolicy } from "../planning/policy";
import { batchCExercises, batchCProtocols, batchCSpecs, batchCDefinitionBundle } from "./batchC";
import { batchCMotionGuides } from "./batchCMotion";

// This entry is built separately, never imported by production or frozen RC.3.
registerMotionGuides(batchCMotionGuides);
const reviewAthlete = parseStableId("athlete", "batch-c-isolated-review");
export const batchCReviewPlan = (index: number): SessionPlan => {
  const exercise = batchCExercises[index]!;
  const variant = exercise.prescriptionVariants[0]!;
  const protocol = batchCProtocols[index]!;
  return {
    schemaVersion: 1, id: parseStableId("session-plan", `batch-c-review-${exercise.id}`), athleteId: reviewAthlete,
    createdAt: "2026-10-17T09:00:00.000Z", catalogueVersion: batchCDefinitionBundle.catalogueVersion,
    generatorPolicyId: vNextGeneratorPolicy.id, generatorPolicyVersion: vNextGeneratorPolicy.version,
    definitionReferences: [{ kind: "exercise", id: exercise.id, version: exercise.definitionVersion }],
    intendedDurationSeconds: 600,
    items: [{ id: parseStableId("plan-item", `batch-c-review-item-${index}`), exerciseId: exercise.id,
      exerciseDefinitionVersion: exercise.definitionVersion, prescriptionVariantId: variant.id,
      benchmarkProtocolId: protocol.id, benchmarkProtocolVersion: protocol.definitionVersion,
      purpose: "primary-development", plannedSeconds: 600, demand: variant.demand,
      targetMilestone: { graphId: batchCSpecs[index]!.graphId, nodeId: parseStableId("node", batchCSpecs[index]!.node) } }],
    rationale: [{ code: parseStableId("reason", "isolated-content-review"), message: "Synthetic player preview for motion and phone layout review, not an athlete prescription." }],
  };
};
export const BatchCReview = () => {
  const [index, setIndex] = useState(0);
  const [player, setPlayer] = useState(false);
  const [frame, setFrame] = useState<"motion" | "start" | "middle" | "end">("motion");
  const spec = batchCSpecs[index]!;
  const protocol = batchCProtocols[index]!;
  const guide = batchCMotionGuides[spec.exercise];
  const close = () => { clearActiveWorkoutDraft(reviewAthlete); setPlayer(false); };
  if (player) return <WorkoutRunner key={index} plan={batchCReviewPlan(index)} bundle={batchCDefinitionBundle}
    origin="custom" onStart={() => true} onFinish={() => { close(); return true; }} onClose={close} />;
  return <main className="batch-c-review vnext-experience">
    <header>
      <p className="vnext-kicker">Parallette25 · Batch C review</p>
      <h1>Freestanding control and handstand push-ups</h1>
      <p>Review these six moving guides and their workout-player layouts. Deployment stays on hold until all batches are finished. No account or training history is opened.</p>
    </header>
    <nav aria-label="Batch C movements">
      {batchCSpecs.map((item, i) => <button key={item.node} type="button" className="vnext-action" aria-pressed={i === index}
        onClick={() => { setIndex(i); setFrame("motion"); }}>{i + 1}. {item.name}</button>)}
    </nav>
    <article key={spec.node} aria-labelledby="batch-c-movement-title">
      <h2 id="batch-c-movement-title">{spec.name}</h2>
      <p>{spec.description}</p>
      <div className="batch-c-preview"><VNextMotionGuide preset={spec.exercise} auditFrame={frame} /></div>
      <nav aria-label="Animation review mode">
        {(["motion", "start", "middle", "end"] as const).map((mode) => <button key={mode} type="button" className="vnext-action" aria-pressed={frame === mode} onClick={() => setFrame(mode)}>{mode === "motion" ? "Moving guide" : mode === "start" ? "Entry frame" : mode === "middle" ? "Target frame" : "Exit frame"}</button>)}
      </nav>
      <p>{spec.how}</p>
      <ul>{spec.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
      <button type="button" className="vnext-action" onClick={() => setPlayer(true)}>Open in workout player</button>
      <p className="vnext-help">The animation shows entry, hold or repetitions, then exit. Between-attempt recovery is shortened in the demonstration; follow the workout timer for rest. You only need to review the guide, not attempt an advanced skill.</p>
      <details open>
        <summary>What counts for this milestone</summary>
        <p>{protocol.conditions.range}</p>
        <ul>{protocol.qualityCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
        <p>Confirm on {protocol.confirmation.minimumDistinctSessions} separate training or guided-test occasions. Recheck after {protocol.confirmation.freshnessDays} days without fresh confirmation.</p>
        <p>Prerequisites remain required. Symptoms, recent load and equipment can still make today’s exercise unavailable.</p>
        <p>Regression: {batchCDefinitionBundle.exercises.find((e) => e.id === spec.regression)?.name}. Reduced practice doses do not confirm this milestone.</p>
      </details>
      <details>
        <summary>Motion review checklist</summary>
        <p>{guide.camera}</p>
        <ol>{guide.phases.map((phase, i) => <li key={`${phase}-${i}`}>{phase}</li>)}</ol>
        <p>Watch the full moving sequence and both sides where shown. Check the face direction, locked elbows and knees, feet or toes, apparatus and landing. Then inspect the same movement in the workout player in portrait and landscape.</p>
      </details>
    </article>
  </main>;
};
