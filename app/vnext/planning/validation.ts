import type {
  DemandDomain,
  MilestoneRef,
  SessionPlanItem,
} from "../contracts";
import { validateSessionPlan } from "../validation";
import type { PlanValidationInput, PlanningIssue } from "./contracts";
import { planningReasonCodes } from "./policy";
import { milestoneKey } from "./utils";

const sameDemand = (
  left: SessionPlanItem["demand"],
  right: SessionPlanItem["demand"],
): boolean => {
  const domains = new Set<DemandDomain>([
    ...Object.keys(left) as DemandDomain[],
    ...Object.keys(right) as DemandDomain[],
  ]);
  return [...domains].every((domain) => left[domain] === right[domain]);
};

const evaluationKey = (item: Pick<SessionPlanItem,
  "exerciseId" | "exerciseDefinitionVersion" | "prescriptionVariantId">): string =>
  `${item.exerciseId}@${item.exerciseDefinitionVersion}:${item.prescriptionVariantId}`;

const targetAllowed = (
  milestone: MilestoneRef,
  input: PlanValidationInput,
): boolean => {
  const key = milestoneKey(milestone);
  if ([
    ...input.state.workingNodes,
    ...input.state.eligibleTargets,
    ...input.state.maintenanceNeeds,
  ].some((item) => milestoneKey(item.milestone) === key)) return true;
  const nodeState = input.state.nodeStates.find((state) => milestoneKey(state.milestone) === key);
  return nodeState?.lifecycle === "established" && nodeState.confidence === "current";
};

const highUpperDomains = (
  item: SessionPlanItem,
  input: PlanValidationInput,
): readonly DemandDomain[] => input.policy.highUpperLimbDomains
  .filter((domain) => item.demand[domain] === "high");

export const validateGeneratedSession = (input: PlanValidationInput): readonly PlanningIssue[] => {
  const issues: PlanningIssue[] = [];
  const add = (code: PlanningIssue["code"], message: string) => {
    issues.push({ severity: "error", code, message });
  };
  const { generated } = input;
  if (!generated.plan) {
    if (generated.ok) add(planningReasonCodes.invalidInput, "A successful generated result must include a Session Plan.");
    return issues;
  }
  const plan = generated.plan;
  const domain = validateSessionPlan(plan);
  if (!domain.valid) {
    add(planningReasonCodes.referenceInvalid, `Session Plan contract failed: ${domain.issues
      .map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
  }
  if (plan.generatorPolicyId !== input.policy.id
    || plan.generatorPolicyVersion !== input.policy.version) {
    add(planningReasonCodes.referenceInvalid, "Session Plan references a different generator policy.");
  }
  if (plan.athleteId !== input.intent.athleteId || plan.athleteId !== input.state.athleteId) {
    add(planningReasonCodes.invalidInput, "Session Plan athlete identity is inconsistent.");
  }
  if (plan.catalogueVersion !== input.bundle.catalogueVersion) {
    add(planningReasonCodes.referenceInvalid, "Session Plan uses a different definition bundle version.");
  }
  const evaluationByKey = new Map(generated.trainabilityUsed.map((evaluation) => [
    evaluationKey(evaluation), evaluation,
  ] as const));
  const explanationById = new Map(generated.itemExplanations.map((explanation) => [
    explanation.planItemId, explanation,
  ] as const));
  const equipment = new Set(input.intent.equipment);
  for (const item of plan.items) {
    const exercise = input.bundle.exercises.find((candidate) =>
      candidate.id === item.exerciseId
      && candidate.definitionVersion === item.exerciseDefinitionVersion);
    const variant = exercise?.prescriptionVariants.find((candidate) =>
      candidate.id === item.prescriptionVariantId);
    if (!exercise || !variant) {
      add(planningReasonCodes.referenceInvalid, `Plan item ${item.id} references an unknown exercise or prescription version.`);
      continue;
    }
    if (!sameDemand(item.demand, variant.demand)) {
      add(planningReasonCodes.referenceInvalid, `Plan item ${item.id} changed the authored prescription demand.`);
    }
    if (exercise.equipment.some((required) => !equipment.has(required))) {
      add(planningReasonCodes.equipmentMissing, `Plan item ${item.id} requires unavailable equipment.`);
    }
    const evaluation = evaluationByKey.get(evaluationKey(item));
    if (!evaluation || evaluation.decision === "block") {
      add(planningReasonCodes.trainabilityBlocked, `Plan item ${item.id} has no non-blocking Phase 3 trainability decision.`);
    }
    const explanation = explanationById.get(item.id);
    if (!explanation || !explanation.whySkill || !explanation.whyExercise || !explanation.whyIntensity) {
      add(planningReasonCodes.referenceInvalid, `Plan item ${item.id} is missing explainability.`);
    }
    for (const restriction of input.state.activeRestrictions) {
      const materialOverlap = restriction.demandDomains.some((domain) =>
        item.demand[domain] === "moderate" || item.demand[domain] === "high");
      if (materialOverlap && restriction.decision === "block") {
        add(planningReasonCodes.trainabilityBlocked, `Plan item ${item.id} bypasses an active block restriction.`);
      }
    }
    if (item.targetMilestone) {
      const graph = input.bundle.graphs.find((candidate) => candidate.id === item.targetMilestone?.graphId);
      const node = graph?.nodes.find((candidate) => candidate.id === item.targetMilestone?.nodeId);
      if (!node || node.implementationStatus !== "available" || !targetAllowed(item.targetMilestone, input)) {
        add(planningReasonCodes.prerequisiteBypass, `Plan item ${item.id} targets an unavailable or non-frontier milestone.`);
      }
      if (node?.programmingBoundary === "specialist"
        && (!input.intent.preferences.specialistOptIn
          || !input.intent.goals.some((goal) => goal.graphId === item.targetMilestone?.graphId
            && goal.targetNodeId === item.targetMilestone?.nodeId))) {
        add(planningReasonCodes.specialistBypass, `Plan item ${item.id} contains surprise specialist work.`);
      }
      const exactTargetPrescription = node?.benchmarkProtocolIds
        .map((id) => input.bundle.benchmarkProtocols.find((candidate) =>
          candidate.id === id
          && candidate.subject.kind === "milestone"
          && milestoneKey(candidate.subject.milestone) === milestoneKey(item.targetMilestone!)))
        .some((protocol) => protocol?.exerciseId === item.exerciseId
          && protocol.prescriptionVariantId === item.prescriptionVariantId);
      const explicitlyNodeScopedDevelopment = exercise.graphLinks.some((link) =>
        link.graphId === item.targetMilestone?.graphId
        && link.nodeId === item.targetMilestone?.nodeId);
      if (!exactTargetPrescription && !explicitlyNodeScopedDevelopment) {
        add(
          planningReasonCodes.prerequisiteBypass,
          `Plan item ${item.id} claims a milestone target without its exact versioned exercise prescription.`,
        );
      }
    }
    if (item.benchmarkProtocolId) {
      const protocol = input.bundle.benchmarkProtocols.find((candidate) =>
        candidate.id === item.benchmarkProtocolId
        && candidate.definitionVersion === item.benchmarkProtocolVersion);
      if (!protocol || protocol.exerciseId !== item.exerciseId
        || protocol.prescriptionVariantId !== item.prescriptionVariantId
        || !item.targetMilestone
        || protocol.subject.kind !== "milestone"
        || milestoneKey(protocol.subject.milestone) !== milestoneKey(item.targetMilestone)) {
        add(planningReasonCodes.referenceInvalid, `Guided item ${item.id} does not match its exact protocol.`);
      }
    }
    if (
      highUpperDomains(item, input).length
      && !item.targetMilestone
      && explanation?.block !== "supporting-capacity"
      && explanation?.block !== "supplemental"
    ) {
      add(planningReasonCodes.prerequisiteBypass, `Unscoped high-demand drill ${item.exerciseId} was selected.`);
    }
  }
  if (explanationById.size !== plan.items.length) {
    add(planningReasonCodes.referenceInvalid, "Item explanations are not one-to-one with Session Plan items.");
  }
  if (evaluationByKey.size !== plan.items.length) {
    add(planningReasonCodes.referenceInvalid, "Trainability decisions are not one-to-one with Session Plan items.");
  }
  const highItems = plan.items.filter((item) => highUpperDomains(item, input).length);
  if (highItems.length > 1) {
    add(planningReasonCodes.incompatibleHighLoad, "Session contains more than one major high upper-limb prescription.");
  }
  const firstFatiguing = plan.items.findIndex((item) => {
    const explanation = explanationById.get(item.id);
    return explanation?.block !== "technical" && highUpperDomains(item, input).length > 0;
  });
  if (firstFatiguing >= 0 && plan.items.some((item, index) =>
    explanationById.get(item.id)?.block === "technical" && index > firstFatiguing)) {
    add(planningReasonCodes.technicalOrdering, "Technical work appears after fatiguing high-load work.");
  }
  if (plan.items[0] && explanationById.get(plan.items[0].id)?.block !== "preparation") {
    add(planningReasonCodes.technicalOrdering, "Session does not begin with targeted preparation.");
  }
  if (plan.items.at(-1) && explanationById.get(plan.items.at(-1)!.id)?.block !== "recovery") {
    add(planningReasonCodes.technicalOrdering, "Session does not finish with recovery/reset work.");
  }
  const seconds = plan.items.reduce((total, item) => total + item.plannedSeconds, 0);
  if (seconds !== plan.intendedDurationSeconds) {
    add(planningReasonCodes.durationInvalid, "Session block timing does not equal intended duration.");
  }
  if (seconds !== input.policy.exactDurationSeconds) {
    if (!generated.durationException
      || generated.durationException.actualSeconds !== seconds
      || generated.durationException.targetSeconds !== input.policy.exactDurationSeconds
      || seconds >= input.policy.exactDurationSeconds) {
      add(planningReasonCodes.durationInvalid, "Non-25-minute plan lacks a valid shorter safety exception.");
    }
  } else if (generated.durationException) {
    add(planningReasonCodes.durationInvalid, "Exact-25 plan must not carry a shorter safety exception.");
  }
  return issues;
};
