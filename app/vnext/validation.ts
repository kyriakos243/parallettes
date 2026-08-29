import {
  DEMAND_DOMAINS,
  DOMAIN_SCHEMA_VERSION,
  EXERCISE_ROLES,
  MAX_ANY_OF_OPTIONS,
  isStableId,
  type AthleteEvidenceEvent,
  type AthleteIntent,
  type BenchmarkProtocol,
  type CapacityDefinition,
  type DefinitionBundle,
  type DerivedAthleteState,
  type DevelopmentGraph,
  type ExerciseDefinition,
  type PrerequisiteRule,
  type SessionPlan,
  type SessionRecord,
} from "./contracts";
import type { LegacyV12CompatibilitySnapshot } from "./legacyV12";

export type ValidationIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type ValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ValidationIssue[];
}>;

type UnknownRecord = Record<string, unknown>;
type IssueList = ValidationIssue[];

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const addIssue = (
  issues: IssueList,
  path: string,
  code: string,
  message: string,
) => issues.push({ path, code, message });

const finish = (issues: IssueList): ValidationResult => ({
  valid: issues.length === 0,
  issues,
});

const requireRecord = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is UnknownRecord => {
  if (!isRecord(value)) {
    addIssue(issues, path, "type.record", "Expected an object");
    return false;
  }
  return true;
};

const requireArray = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is unknown[] => {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "type.array", "Expected an array");
    return false;
  }
  return true;
};

const requireNonEmptyString = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is string => {
  if (typeof value !== "string" || !value.trim()) {
    addIssue(issues, path, "type.non-empty-string", "Expected a non-empty string");
    return false;
  }
  return true;
};

const requireStableId = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is string => {
  if (!isStableId(value)) {
    addIssue(
      issues,
      path,
      "id.stable",
      "Expected a lowercase stable ID using letters, digits, dots, underscores, or hyphens",
    );
    return false;
  }
  return true;
};

const requirePositiveInteger = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    addIssue(issues, path, "number.positive-integer", "Expected a positive safe integer");
    return false;
  }
  return true;
};

const requireNonNegativeNumber = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    addIssue(issues, path, "number.non-negative", "Expected a finite non-negative number");
    return false;
  }
  return true;
};

const requireNonNegativeInteger = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    addIssue(issues, path, "number.non-negative-integer", "Expected a non-negative safe integer");
    return false;
  }
  return true;
};

const requireIsoTimestamp = (
  value: unknown,
  path: string,
  issues: IssueList,
): value is string => {
  const parsed = typeof value === "string" ? new Date(value) : null;
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !parsed
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString() !== value
  ) {
    addIssue(issues, path, "timestamp.iso-utc", "Expected an ISO-8601 UTC timestamp");
    return false;
  }
  return true;
};

const rejectUnknownKeys = (
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
  issues: IssueList,
) => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      addIssue(issues, `${path}.${key}`, "object.unknown-key", `Unknown property ${key}`);
    }
  }
};

const requireEnum = <Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
  issues: IssueList,
): value is Value => {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    addIssue(issues, path, "enum.value", `Expected one of: ${allowed.join(", ")}`);
    return false;
  }
  return true;
};

const validateSchemaVersion = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (value !== DOMAIN_SCHEMA_VERSION) {
    addIssue(
      issues,
      path,
      "version.schema",
      `Expected domain schema version ${DOMAIN_SCHEMA_VERSION}`,
    );
  }
};

const validateNonEmptyStringArray = (
  value: unknown,
  path: string,
  issues: IssueList,
  allowEmpty = true,
) => {
  if (!requireArray(value, path, issues)) return;
  if (!allowEmpty && value.length === 0) {
    addIssue(issues, path, "array.non-empty", "Expected at least one item");
  }
  value.forEach((item, index) => requireNonEmptyString(item, `${path}[${index}]`, issues));
};

const validateStableIdArray = (
  value: unknown,
  path: string,
  issues: IssueList,
  allowEmpty = true,
) => {
  if (!requireArray(value, path, issues)) return;
  if (!allowEmpty && value.length === 0) {
    addIssue(issues, path, "array.non-empty", "Expected at least one item");
  }
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!requireStableId(item, `${path}[${index}]`, issues)) return;
    if (seen.has(item)) {
      addIssue(issues, `${path}[${index}]`, "id.duplicate", `Duplicate ID ${item}`);
    }
    seen.add(item);
  });
};

const validateUniqueIds = (
  values: readonly unknown[],
  path: string,
  issues: IssueList,
) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string") return;
    if (seen.has(value.id)) {
      addIssue(issues, `${path}[${index}].id`, "id.duplicate", `Duplicate ID ${value.id}`);
    }
    seen.add(value.id);
  });
};

const prerequisiteRefKey = (value: UnknownRecord): string => {
  if (value.kind === "milestone" && isRecord(value.milestone)) {
    return `milestone:${String(value.milestone.graphId)}:${String(value.milestone.nodeId)}`;
  }
  if (value.kind === "capacity-facet" && isRecord(value.capacity)) {
    return `capacity:${String(value.capacity.capacityId)}:${String(value.capacity.facetId)}`;
  }
  return `benchmark:${String(value.benchmarkProtocolId)}`;
};

const validateMilestoneRef = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, ["graphId", "nodeId"], path, issues);
  requireStableId(value.graphId, `${path}.graphId`, issues);
  requireStableId(value.nodeId, `${path}.nodeId`, issues);
};

const validateCapacityFacetRef = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, ["capacityId", "facetId"], path, issues);
  requireStableId(value.capacityId, `${path}.capacityId`, issues);
  requireStableId(value.facetId, `${path}.facetId`, issues);
};

const observationSourceRefKey = (value: UnknownRecord): string | undefined => {
  if (value.kind === "evidence-event" && typeof value.eventId === "string") {
    return `evidence-event:${value.eventId}`;
  }
  if (
    value.kind === "session-item"
    && typeof value.sessionRecordId === "string"
    && typeof value.planItemId === "string"
  ) {
    return `session-item:${value.sessionRecordId}:${value.planItemId}`;
  }
  return undefined;
};

const validateObservationSourceRef = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  if (value.kind === "evidence-event") {
    rejectUnknownKeys(value, ["kind", "eventId"], path, issues);
    requireStableId(value.eventId, `${path}.eventId`, issues);
    return;
  }
  if (value.kind === "session-item") {
    rejectUnknownKeys(value, ["kind", "sessionRecordId", "planItemId"], path, issues);
    requireStableId(value.sessionRecordId, `${path}.sessionRecordId`, issues);
    requireStableId(value.planItemId, `${path}.planItemId`, issues);
    return;
  }
  addIssue(
    issues,
    `${path}.kind`,
    "observation-source.kind",
    "Expected evidence-event or session-item observation provenance",
  );
};

const validateObservationSourceRefArray = (
  value: unknown,
  path: string,
  issues: IssueList,
  allowEmpty = true,
) => {
  if (!requireArray(value, path, issues)) return;
  if (!allowEmpty && value.length === 0) {
    addIssue(issues, path, "array.non-empty", "Expected at least one observation source");
  }
  const seen = new Set<string>();
  value.forEach((source, index) => {
    const sourcePath = `${path}[${index}]`;
    validateObservationSourceRef(source, sourcePath, issues);
    if (!isRecord(source)) return;
    const key = observationSourceRefKey(source);
    if (!key) return;
    if (seen.has(key)) {
      addIssue(issues, sourcePath, "reference.duplicate", `Duplicate observation source ${key}`);
    }
    seen.add(key);
  });
};

const validateObservationMeasurement = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, ["value", "unit", "attemptsTotal"], path, issues);
  const measurementValue = value.value;
  const attemptsTotal = value.attemptsTotal;
  const hasValue = requireNonNegativeNumber(measurementValue, `${path}.value`, issues);
  const hasUnit = requireEnum(
    value.unit,
    ["seconds", "repetitions", "attempts", "degrees"] as const,
    `${path}.unit`,
    issues,
  );

  if (hasUnit && value.unit === "attempts") {
    if (hasValue && !Number.isSafeInteger(measurementValue)) {
      addIssue(
        issues,
        `${path}.value`,
        "measurement.attempt-count",
        "Successful attempts must be a non-negative safe integer",
      );
    }
    const hasAttemptsTotal = requirePositiveInteger(
      attemptsTotal,
      `${path}.attemptsTotal`,
      issues,
    );
    if (
      hasValue
      && hasAttemptsTotal
      && Number.isSafeInteger(measurementValue)
      && measurementValue > attemptsTotal
    ) {
      addIssue(
        issues,
        `${path}.attemptsTotal`,
        "measurement.attempt-total",
        "Total attempts cannot be lower than successful attempts",
      );
    }
    return;
  }

  if (value.attemptsTotal !== undefined) {
    addIssue(
      issues,
      `${path}.attemptsTotal`,
      "measurement.attempt-total-unit",
      "attemptsTotal is only valid when the measurement unit is attempts",
    );
  }
};

const validateMilestoneRefArray = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireArray(value, path, issues)) return;
  const seen = new Set<string>();
  value.forEach((node, index) => {
    const itemPath = `${path}[${index}]`;
    validateMilestoneRef(node, itemPath, issues);
    if (!isRecord(node) || typeof node.graphId !== "string" || typeof node.nodeId !== "string") return;
    const key = `${node.graphId}:${node.nodeId}`;
    if (seen.has(key)) addIssue(issues, itemPath, "reference.duplicate", `Duplicate milestone ${key}`);
    seen.add(key);
  });
};

const validatePrerequisiteRef = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  if (value.kind === "milestone") {
    rejectUnknownKeys(value, ["kind", "milestone"], path, issues);
    validateMilestoneRef(value.milestone, `${path}.milestone`, issues);
    return;
  }
  if (value.kind === "capacity-facet") {
    rejectUnknownKeys(value, ["kind", "capacity"], path, issues);
    validateCapacityFacetRef(value.capacity, `${path}.capacity`, issues);
    return;
  }
  if (value.kind === "benchmark") {
    rejectUnknownKeys(value, ["kind", "benchmarkProtocolId"], path, issues);
    requireStableId(value.benchmarkProtocolId, `${path}.benchmarkProtocolId`, issues);
    return;
  }
  addIssue(
    issues,
    `${path}.kind`,
    "prerequisite.kind",
    "Expected milestone, capacity-facet, or benchmark",
  );
};

const validatePrerequisiteRuleInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  const allOf = value.allOf;
  const anyOf = value.anyOf;
  if (allOf === undefined && anyOf === undefined) {
    addIssue(issues, path, "prerequisite.empty", "A prerequisite rule must contain allOf or anyOf");
    return;
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (key !== "allOf" && key !== "anyOf") {
      addIssue(
        issues,
        `${path}.${key}`,
        "prerequisite.nested-logic",
        "Only the non-recursive allOf and anyOf keys are allowed",
      );
    }
  }
  const seen = new Set<string>();
  if (allOf !== undefined && requireArray(allOf, `${path}.allOf`, issues)) {
    allOf.forEach((item, index) => {
      validatePrerequisiteRef(item, `${path}.allOf[${index}]`, issues);
      if (isRecord(item)) {
        const key = prerequisiteRefKey(item);
        if (seen.has(key)) {
          addIssue(issues, `${path}.allOf[${index}]`, "prerequisite.duplicate", `Duplicate ${key}`);
        }
        seen.add(key);
      }
    });
  }
  if (anyOf !== undefined && requireArray(anyOf, `${path}.anyOf`, issues)) {
    if (anyOf.length < 2 || anyOf.length > MAX_ANY_OF_OPTIONS) {
      addIssue(
        issues,
        `${path}.anyOf`,
        "prerequisite.any-of-size",
        `anyOf must contain between 2 and ${MAX_ANY_OF_OPTIONS} alternatives`,
      );
    }
    anyOf.forEach((item, index) => {
      validatePrerequisiteRef(item, `${path}.anyOf[${index}]`, issues);
      if (isRecord(item)) {
        const key = prerequisiteRefKey(item);
        if (seen.has(key)) {
          addIssue(issues, `${path}.anyOf[${index}]`, "prerequisite.duplicate", `Duplicate ${key}`);
        }
        seen.add(key);
      }
    });
  }
  if (
    Array.isArray(allOf)
    && allOf.length === 0
    && (!Array.isArray(anyOf) || anyOf.length === 0)
  ) {
    addIssue(issues, path, "prerequisite.empty", "A prerequisite rule cannot be empty");
  }
};

export const validatePrerequisiteRule = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validatePrerequisiteRuleInto(value, "$", issues);
  return finish(issues);
};

const validateDemandProfile = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  for (const [domain, level] of Object.entries(value)) {
    requireEnum(domain, DEMAND_DOMAINS, `${path}.${domain}`, issues);
    requireEnum(level, ["low", "moderate", "high"] as const, `${path}.${domain}`, issues);
  }
};

const validatePrescriptionTarget = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  if (value.kind === "quality") {
    rejectUnknownKeys(value, ["kind", "description"], path, issues);
    requireNonEmptyString(value.description, `${path}.description`, issues);
    return;
  }
  if (value.kind === "interval") {
    rejectUnknownKeys(value, ["kind", "workSeconds", "restSeconds", "rounds"], path, issues);
    requirePositiveInteger(value.workSeconds, `${path}.workSeconds`, issues);
    requireNonNegativeNumber(value.restSeconds, `${path}.restSeconds`, issues);
    requirePositiveInteger(value.rounds, `${path}.rounds`, issues);
    return;
  }
  if (["repetitions", "duration-seconds", "attempts"].includes(String(value.kind))) {
    rejectUnknownKeys(value, ["kind", "minimum", "maximum"], path, issues);
    if (requirePositiveInteger(value.minimum, `${path}.minimum`, issues)
      && value.maximum !== undefined
      && requirePositiveInteger(value.maximum, `${path}.maximum`, issues)
      && value.maximum < value.minimum) {
      addIssue(issues, `${path}.maximum`, "target.range", "Maximum cannot be lower than minimum");
    }
    return;
  }
  addIssue(issues, `${path}.kind`, "target.kind", "Unknown prescription target kind");
};

const validatePrescriptionVariant = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, ["id", "label", "target", "assistance", "range", "demand"], path, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requireNonEmptyString(value.label, `${path}.label`, issues);
  validatePrescriptionTarget(value.target, `${path}.target`, issues);
  if (value.assistance !== undefined) requireNonEmptyString(value.assistance, `${path}.assistance`, issues);
  if (value.range !== undefined) requireNonEmptyString(value.range, `${path}.range`, issues);
  validateDemandProfile(value.demand, `${path}.demand`, issues);
};

const validateExerciseDefinitionInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "id", "definitionVersion", "lifecycle", "name", "description",
    "instructions", "media", "equipment", "roles", "graphLinks", "capacityLinks",
    "prescriptionVariants", "benchmarkProtocolIds", "relations", "safetyNotes",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requirePositiveInteger(value.definitionVersion, `${path}.definitionVersion`, issues);
  requireEnum(value.lifecycle, ["active", "deprecated"] as const, `${path}.lifecycle`, issues);
  requireNonEmptyString(value.name, `${path}.name`, issues);
  requireNonEmptyString(value.description, `${path}.description`, issues);

  if (requireRecord(value.instructions, `${path}.instructions`, issues)) {
    rejectUnknownKeys(value.instructions, ["how", "cues", "avoid"], `${path}.instructions`, issues);
    requireNonEmptyString(value.instructions.how, `${path}.instructions.how`, issues);
    validateNonEmptyStringArray(value.instructions.cues, `${path}.instructions.cues`, issues, false);
    if (value.instructions.avoid !== undefined) {
      validateNonEmptyStringArray(value.instructions.avoid, `${path}.instructions.avoid`, issues);
    }
  }

  if (requireArray(value.media, `${path}.media`, issues)) {
    value.media.forEach((item, index) => {
      const itemPath = `${path}.media[${index}]`;
      if (!requireRecord(item, itemPath, issues)) return;
      rejectUnknownKeys(item, ["kind", "reference", "description"], itemPath, issues);
      requireEnum(item.kind, ["motion", "image", "video"] as const, `${itemPath}.kind`, issues);
      requireNonEmptyString(item.reference, `${itemPath}.reference`, issues);
      requireNonEmptyString(item.description, `${itemPath}.description`, issues);
    });
  }

  validateStableIdArray(value.equipment, `${path}.equipment`, issues, false);

  if (requireArray(value.roles, `${path}.roles`, issues)) {
    if (value.roles.length === 0) addIssue(issues, `${path}.roles`, "array.non-empty", "Expected a role");
    const seen = new Set<string>();
    value.roles.forEach((role, index) => {
      if (!requireEnum(role, EXERCISE_ROLES, `${path}.roles[${index}]`, issues)) return;
      if (seen.has(role)) addIssue(issues, `${path}.roles[${index}]`, "value.duplicate", `Duplicate role ${role}`);
      seen.add(role);
    });
  }

  if (requireArray(value.graphLinks, `${path}.graphLinks`, issues)) {
    value.graphLinks.forEach((item, index) => {
      const itemPath = `${path}.graphLinks[${index}]`;
      if (!requireRecord(item, itemPath, issues)) return;
      rejectUnknownKeys(item, ["graphId", "nodeId", "contribution"], itemPath, issues);
      requireStableId(item.graphId, `${itemPath}.graphId`, issues);
      if (item.nodeId !== undefined) requireStableId(item.nodeId, `${itemPath}.nodeId`, issues);
      requireEnum(
        item.contribution,
        ["milestone", "development", "technique", "transition"] as const,
        `${itemPath}.contribution`,
        issues,
      );
      if (item.contribution === "milestone" && item.nodeId === undefined) {
        addIssue(issues, `${itemPath}.nodeId`, "graph-link.node-required", "Milestone links require a node ID");
      }
    });
  }

  if (requireArray(value.capacityLinks, `${path}.capacityLinks`, issues)) {
    value.capacityLinks.forEach((item, index) => {
      const itemPath = `${path}.capacityLinks[${index}]`;
      if (!requireRecord(item, itemPath, issues)) return;
      rejectUnknownKeys(item, ["capacityId", "facetIds"], itemPath, issues);
      requireStableId(item.capacityId, `${itemPath}.capacityId`, issues);
      validateStableIdArray(item.facetIds, `${itemPath}.facetIds`, issues, false);
    });
  }

  if (requireArray(value.prescriptionVariants, `${path}.prescriptionVariants`, issues)) {
    if (value.prescriptionVariants.length === 0) {
      addIssue(issues, `${path}.prescriptionVariants`, "array.non-empty", "Expected a prescription variant");
    }
    validateUniqueIds(value.prescriptionVariants, `${path}.prescriptionVariants`, issues);
    value.prescriptionVariants.forEach((item, index) =>
      validatePrescriptionVariant(item, `${path}.prescriptionVariants[${index}]`, issues));
  }

  validateStableIdArray(value.benchmarkProtocolIds, `${path}.benchmarkProtocolIds`, issues);

  if (requireArray(value.relations, `${path}.relations`, issues)) {
    value.relations.forEach((item, index) => {
      const itemPath = `${path}.relations[${index}]`;
      if (!requireRecord(item, itemPath, issues)) return;
      rejectUnknownKeys(item, [
        "kind", "targetExerciseId", "fromPrescriptionVariantId", "targetPrescriptionVariantId",
      ], itemPath, issues);
      requireEnum(item.kind, ["regression", "assistance", "substitution"] as const, `${itemPath}.kind`, issues);
      requireStableId(item.targetExerciseId, `${itemPath}.targetExerciseId`, issues);
      if (item.fromPrescriptionVariantId !== undefined) {
        requireStableId(item.fromPrescriptionVariantId, `${itemPath}.fromPrescriptionVariantId`, issues);
      }
      if (item.targetPrescriptionVariantId !== undefined) {
        requireStableId(item.targetPrescriptionVariantId, `${itemPath}.targetPrescriptionVariantId`, issues);
      }
    });
  }
  validateNonEmptyStringArray(value.safetyNotes, `${path}.safetyNotes`, issues);
};

export const validateExerciseDefinition = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateExerciseDefinitionInto(value, "$", issues);
  return finish(issues);
};

const validateDevelopmentGraphInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "id", "definitionVersion", "kind", "label", "description", "branches", "nodes",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requirePositiveInteger(value.definitionVersion, `${path}.definitionVersion`, issues);
  requireEnum(value.kind, ["outcome-family", "foundation-track", "composite"] as const, `${path}.kind`, issues);
  requireNonEmptyString(value.label, `${path}.label`, issues);
  requireNonEmptyString(value.description, `${path}.description`, issues);
  const branchIds = new Set<string>();
  if (requireArray(value.branches, `${path}.branches`, issues)) {
    if (value.branches.length === 0) addIssue(issues, `${path}.branches`, "array.non-empty", "Expected a graph branch");
    validateUniqueIds(value.branches, `${path}.branches`, issues);
    value.branches.forEach((branch, index) => {
      const branchPath = `${path}.branches[${index}]`;
      if (!requireRecord(branch, branchPath, issues)) return;
      rejectUnknownKeys(branch, ["id", "label", "description"], branchPath, issues);
      if (requireStableId(branch.id, `${branchPath}.id`, issues)) branchIds.add(branch.id);
      requireNonEmptyString(branch.label, `${branchPath}.label`, issues);
      requireNonEmptyString(branch.description, `${branchPath}.description`, issues);
    });
  }
  if (!requireArray(value.nodes, `${path}.nodes`, issues)) return;
  if (value.nodes.length === 0) addIssue(issues, `${path}.nodes`, "array.non-empty", "Expected a graph node");
  validateUniqueIds(value.nodes, `${path}.nodes`, issues);
  value.nodes.forEach((node, index) => {
    const nodePath = `${path}.nodes[${index}]`;
    if (!requireRecord(node, nodePath, issues)) return;
    rejectUnknownKeys(node, [
      "id", "branchId", "label", "description", "progressionTier", "programmingBoundary",
      "implementationStatus", "prerequisiteRule", "benchmarkProtocolIds",
    ], nodePath, issues);
    requireStableId(node.id, `${nodePath}.id`, issues);
    if (requireStableId(node.branchId, `${nodePath}.branchId`, issues) && !branchIds.has(node.branchId)) {
      addIssue(issues, `${nodePath}.branchId`, "reference.branch", `Unknown graph branch ${node.branchId}`);
    }
    requireNonEmptyString(node.label, `${nodePath}.label`, issues);
    requireNonEmptyString(node.description, `${nodePath}.description`, issues);
    requireEnum(
      node.progressionTier,
      ["foundation", "intermediate", "advanced", "specialist"] as const,
      `${nodePath}.progressionTier`,
      issues,
    );
    requireEnum(
      node.programmingBoundary,
      ["automatic", "stronger-gated", "specialist"] as const,
      `${nodePath}.programmingBoundary`,
      issues,
    );
    requireEnum(
      node.implementationStatus,
      ["available", "missing-content"] as const,
      `${nodePath}.implementationStatus`,
      issues,
    );
    if (node.prerequisiteRule !== undefined) {
      validatePrerequisiteRuleInto(node.prerequisiteRule, `${nodePath}.prerequisiteRule`, issues);
    }
    validateStableIdArray(
      node.benchmarkProtocolIds,
      `${nodePath}.benchmarkProtocolIds`,
      issues,
      node.implementationStatus === "missing-content",
    );
    if (node.implementationStatus === "missing-content" && Array.isArray(node.benchmarkProtocolIds) && node.benchmarkProtocolIds.length > 0) {
      addIssue(issues, `${nodePath}.benchmarkProtocolIds`, "node.placeholder-benchmark", "Missing-content nodes cannot claim an implemented benchmark");
    }
  });
};

export const validateDevelopmentGraph = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateDevelopmentGraphInto(value, "$", issues);
  return finish(issues);
};

const validateCapacityDefinitionInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "id", "definitionVersion", "label", "description", "facets", "sharedGraphIds",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requirePositiveInteger(value.definitionVersion, `${path}.definitionVersion`, issues);
  requireNonEmptyString(value.label, `${path}.label`, issues);
  requireNonEmptyString(value.description, `${path}.description`, issues);
  if (requireArray(value.facets, `${path}.facets`, issues)) {
    if (value.facets.length === 0) addIssue(issues, `${path}.facets`, "array.non-empty", "Expected a capacity facet");
    validateUniqueIds(value.facets, `${path}.facets`, issues);
    value.facets.forEach((facet, index) => {
      const facetPath = `${path}.facets[${index}]`;
      if (!requireRecord(facet, facetPath, issues)) return;
      rejectUnknownKeys(facet, ["id", "label", "description", "benchmarkProtocolIds"], facetPath, issues);
      requireStableId(facet.id, `${facetPath}.id`, issues);
      requireNonEmptyString(facet.label, `${facetPath}.label`, issues);
      requireNonEmptyString(facet.description, `${facetPath}.description`, issues);
      validateStableIdArray(facet.benchmarkProtocolIds, `${facetPath}.benchmarkProtocolIds`, issues, false);
    });
  }
  validateStableIdArray(value.sharedGraphIds, `${path}.sharedGraphIds`, issues, false);
};

export const validateCapacityDefinition = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateCapacityDefinitionInto(value, "$", issues);
  return finish(issues);
};

const validateBenchmarkSubject = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  if (value.kind === "milestone") {
    rejectUnknownKeys(value, ["kind", "milestone"], path, issues);
    validateMilestoneRef(value.milestone, `${path}.milestone`, issues);
  } else if (value.kind === "capacity-facet") {
    rejectUnknownKeys(value, ["kind", "capacity"], path, issues);
    validateCapacityFacetRef(value.capacity, `${path}.capacity`, issues);
  } else {
    addIssue(issues, `${path}.kind`, "benchmark.subject", "Expected milestone or capacity-facet");
  }
};

const validateBenchmarkMetric = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  if (value.kind === "range" || value.kind === "quality") {
    rejectUnknownKeys(value, ["kind", "description"], path, issues);
    requireNonEmptyString(value.description, `${path}.description`, issues);
    return;
  }
  if (value.kind === "successful-attempts") {
    rejectUnknownKeys(value, ["kind", "minimumSuccessful", "maximumAttempts"], path, issues);
    if (requirePositiveInteger(value.minimumSuccessful, `${path}.minimumSuccessful`, issues)
      && requirePositiveInteger(value.maximumAttempts, `${path}.maximumAttempts`, issues)
      && value.minimumSuccessful > value.maximumAttempts) {
      addIssue(issues, path, "benchmark.attempt-range", "Successful attempts cannot exceed maximum attempts");
    }
    return;
  }
  if (value.kind === "duration-seconds" || value.kind === "repetitions") {
    rejectUnknownKeys(value, ["kind", "minimum", "maximum"], path, issues);
    if (requirePositiveInteger(value.minimum, `${path}.minimum`, issues)
      && value.maximum !== undefined
      && requirePositiveInteger(value.maximum, `${path}.maximum`, issues)
      && value.maximum < value.minimum) {
      addIssue(issues, `${path}.maximum`, "benchmark.range", "Maximum cannot be lower than minimum");
    }
    return;
  }
  addIssue(issues, `${path}.kind`, "benchmark.metric", "Unknown benchmark metric kind");
};

const validateBenchmarkProtocolInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "id", "definitionVersion", "label", "subject", "exerciseId",
    "prescriptionVariantId", "conditions", "metric", "qualityCriteria", "safetyCriteria", "confirmation",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requirePositiveInteger(value.definitionVersion, `${path}.definitionVersion`, issues);
  requireNonEmptyString(value.label, `${path}.label`, issues);
  validateBenchmarkSubject(value.subject, `${path}.subject`, issues);
  requireStableId(value.exerciseId, `${path}.exerciseId`, issues);
  if (value.prescriptionVariantId !== undefined) {
    requireStableId(value.prescriptionVariantId, `${path}.prescriptionVariantId`, issues);
  }
  if (requireRecord(value.conditions, `${path}.conditions`, issues)) {
    rejectUnknownKeys(value.conditions, ["equipment", "assistance", "range"], `${path}.conditions`, issues);
    validateStableIdArray(value.conditions.equipment, `${path}.conditions.equipment`, issues, false);
    requireNonEmptyString(value.conditions.assistance, `${path}.conditions.assistance`, issues);
    requireNonEmptyString(value.conditions.range, `${path}.conditions.range`, issues);
  }
  validateBenchmarkMetric(value.metric, `${path}.metric`, issues);
  validateNonEmptyStringArray(value.qualityCriteria, `${path}.qualityCriteria`, issues, false);
  validateNonEmptyStringArray(value.safetyCriteria, `${path}.safetyCriteria`, issues, false);
  if (requireRecord(value.confirmation, `${path}.confirmation`, issues)) {
    rejectUnknownKeys(value.confirmation, [
      "qualifyingObservations", "minimumDistinctSessions", "allowedSources", "freshnessDays",
    ], `${path}.confirmation`, issues);
    requirePositiveInteger(
      value.confirmation.qualifyingObservations,
      `${path}.confirmation.qualifyingObservations`,
      issues,
    );
    requirePositiveInteger(
      value.confirmation.minimumDistinctSessions,
      `${path}.confirmation.minimumDistinctSessions`,
      issues,
    );
    if (requireArray(value.confirmation.allowedSources, `${path}.confirmation.allowedSources`, issues)) {
      if (value.confirmation.allowedSources.length === 0) {
        addIssue(issues, `${path}.confirmation.allowedSources`, "array.non-empty", "Expected a source");
      }
      value.confirmation.allowedSources.forEach((source, index) =>
        requireEnum(
          source,
          ["guided-test", "session-record"] as const,
          `${path}.confirmation.allowedSources[${index}]`,
          issues,
        ));
    }
    if (value.confirmation.freshnessDays !== undefined) {
      requirePositiveInteger(value.confirmation.freshnessDays, `${path}.confirmation.freshnessDays`, issues);
    }
    if (
      typeof value.confirmation.qualifyingObservations === "number"
      && typeof value.confirmation.minimumDistinctSessions === "number"
      && value.confirmation.minimumDistinctSessions > value.confirmation.qualifyingObservations
    ) {
      addIssue(
        issues,
        `${path}.confirmation.minimumDistinctSessions`,
        "benchmark.confirmation-count",
        "Distinct sessions cannot exceed qualifying observations",
      );
    }
  }
};

export const validateBenchmarkProtocol = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateBenchmarkProtocolInto(value, "$", issues);
  return finish(issues);
};

const getNode = (
  graphById: ReadonlyMap<string, DevelopmentGraph>,
  graphId: string,
  nodeId: string,
) => graphById.get(graphId)?.nodes.some((node) => node.id === nodeId) ?? false;

const getFacet = (
  capacityById: ReadonlyMap<string, CapacityDefinition>,
  capacityId: string,
  facetId: string,
) => capacityById.get(capacityId)?.facets.some((facet) => facet.id === facetId) ?? false;

const validatePrerequisiteReferences = (
  rule: PrerequisiteRule | undefined,
  path: string,
  graphById: ReadonlyMap<string, DevelopmentGraph>,
  capacityById: ReadonlyMap<string, CapacityDefinition>,
  benchmarkIds: ReadonlySet<string>,
  issues: IssueList,
) => {
  for (const [group, refs] of [["allOf", rule?.allOf], ["anyOf", rule?.anyOf]] as const) {
    refs?.forEach((ref, index) => {
      const refPath = `${path}.${group}[${index}]`;
      if (ref.kind === "milestone" && !getNode(graphById, ref.milestone.graphId, ref.milestone.nodeId)) {
        addIssue(issues, refPath, "reference.milestone", "Unknown milestone prerequisite");
      }
      if (ref.kind === "capacity-facet" && !getFacet(capacityById, ref.capacity.capacityId, ref.capacity.facetId)) {
        addIssue(issues, refPath, "reference.capacity-facet", "Unknown capacity facet prerequisite");
      }
      if (ref.kind === "benchmark" && !benchmarkIds.has(ref.benchmarkProtocolId)) {
        addIssue(issues, refPath, "reference.benchmark", "Unknown benchmark prerequisite");
      }
    });
  }
};

const validateDefinitionBundleInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "catalogueVersion", "exercises", "graphs", "capacities", "benchmarkProtocols",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requirePositiveInteger(value.catalogueVersion, `${path}.catalogueVersion`, issues);

  const exerciseValues = value.exercises;
  const graphValues = value.graphs;
  const capacityValues = value.capacities;
  const benchmarkValues = value.benchmarkProtocols;
  if (!requireArray(exerciseValues, `${path}.exercises`, issues)) return;
  if (!requireArray(graphValues, `${path}.graphs`, issues)) return;
  if (!requireArray(capacityValues, `${path}.capacities`, issues)) return;
  if (!requireArray(benchmarkValues, `${path}.benchmarkProtocols`, issues)) return;
  validateUniqueIds(exerciseValues, `${path}.exercises`, issues);
  validateUniqueIds(graphValues, `${path}.graphs`, issues);
  validateUniqueIds(capacityValues, `${path}.capacities`, issues);
  validateUniqueIds(benchmarkValues, `${path}.benchmarkProtocols`, issues);

  const structuralIssueStart = issues.length;
  exerciseValues.forEach((item, index) =>
    validateExerciseDefinitionInto(item, `${path}.exercises[${index}]`, issues));
  graphValues.forEach((item, index) =>
    validateDevelopmentGraphInto(item, `${path}.graphs[${index}]`, issues));
  capacityValues.forEach((item, index) =>
    validateCapacityDefinitionInto(item, `${path}.capacities[${index}]`, issues));
  benchmarkValues.forEach((item, index) =>
    validateBenchmarkProtocolInto(item, `${path}.benchmarkProtocols[${index}]`, issues));

  // Cross-reference checks below intentionally assume structurally valid
  // entities. Unknown input must return issues rather than throw.
  if (issues.length > structuralIssueStart) return;

  const exercises = exerciseValues.filter(isRecord) as unknown as ExerciseDefinition[];
  const graphs = graphValues.filter(isRecord) as unknown as DevelopmentGraph[];
  const capacities = capacityValues.filter(isRecord) as unknown as CapacityDefinition[];
  const benchmarks = benchmarkValues.filter(isRecord) as unknown as BenchmarkProtocol[];
  const exerciseById = new Map(exercises.map((item) => [item.id, item]));
  const graphById = new Map(graphs.map((item) => [item.id, item]));
  const capacityById = new Map(capacities.map((item) => [item.id, item]));
  const benchmarkById = new Map(benchmarks.map((item) => [item.id, item]));
  const benchmarkIds = new Set(benchmarkById.keys());

  graphs.forEach((graph, graphIndex) => graph.nodes?.forEach((node, nodeIndex) => {
    const nodePath = `${path}.graphs[${graphIndex}].nodes[${nodeIndex}]`;
    node.benchmarkProtocolIds?.forEach((id, index) => {
      const protocol = benchmarkById.get(id);
      if (!protocol) {
        addIssue(issues, `${nodePath}.benchmarkProtocolIds[${index}]`, "reference.benchmark", `Unknown benchmark ${id}`);
      } else if (
        protocol.subject.kind !== "milestone"
        || protocol.subject.milestone.graphId !== graph.id
        || protocol.subject.milestone.nodeId !== node.id
      ) {
        addIssue(issues, `${nodePath}.benchmarkProtocolIds[${index}]`, "reference.benchmark-subject", "Benchmark subject does not match this graph node");
      }
    });
    validatePrerequisiteReferences(
      node.prerequisiteRule,
      `${nodePath}.prerequisiteRule`,
      graphById,
      capacityById,
      benchmarkIds,
      issues,
    );
  }));

  capacities.forEach((capacity, capacityIndex) => {
    capacity.sharedGraphIds?.forEach((id, index) => {
      if (!graphById.has(id)) addIssue(issues, `${path}.capacities[${capacityIndex}].sharedGraphIds[${index}]`, "reference.graph", `Unknown graph ${id}`);
    });
    capacity.facets?.forEach((facet, facetIndex) => facet.benchmarkProtocolIds?.forEach((id, index) => {
      const protocol = benchmarkById.get(id);
      const benchmarkPath = `${path}.capacities[${capacityIndex}].facets[${facetIndex}].benchmarkProtocolIds[${index}]`;
      if (!protocol) {
        addIssue(issues, benchmarkPath, "reference.benchmark", `Unknown benchmark ${id}`);
      } else if (
        protocol.subject.kind !== "capacity-facet"
        || protocol.subject.capacity.capacityId !== capacity.id
        || protocol.subject.capacity.facetId !== facet.id
      ) {
        addIssue(issues, benchmarkPath, "reference.benchmark-subject", "Benchmark subject does not match this capacity facet");
      }
    }));
  });

  exercises.forEach((exercise, exerciseIndex) => {
    const variantIds = new Set(exercise.prescriptionVariants?.map((item) => item.id));
    exercise.benchmarkProtocolIds?.forEach((id, index) => {
      const protocol = benchmarkById.get(id);
      const benchmarkPath = `${path}.exercises[${exerciseIndex}].benchmarkProtocolIds[${index}]`;
      if (!protocol) {
        addIssue(issues, benchmarkPath, "reference.benchmark", `Unknown benchmark ${id}`);
      } else if (protocol.exerciseId !== exercise.id) {
        addIssue(issues, benchmarkPath, "reference.benchmark-exercise", "Benchmark exercise does not match this exercise");
      }
    });
    exercise.graphLinks?.forEach((link, index) => {
      if (!graphById.has(link.graphId)) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].graphLinks[${index}].graphId`, "reference.graph", `Unknown graph ${link.graphId}`);
      } else if (link.nodeId && !getNode(graphById, link.graphId, link.nodeId)) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].graphLinks[${index}].nodeId`, "reference.node", `Unknown node ${link.nodeId}`);
      }
    });
    exercise.capacityLinks?.forEach((link, index) => link.facetIds.forEach((facetId, facetIndex) => {
      if (!getFacet(capacityById, link.capacityId, facetId)) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].capacityLinks[${index}].facetIds[${facetIndex}]`, "reference.capacity-facet", `Unknown capacity facet ${facetId}`);
      }
    }));
    exercise.relations?.forEach((relation, index) => {
      const target = exerciseById.get(relation.targetExerciseId);
      if (relation.targetExerciseId === exercise.id) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].relations[${index}].targetExerciseId`, "reference.self", "An exercise relation cannot target itself");
      }
      if (!target) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].relations[${index}].targetExerciseId`, "reference.exercise", `Unknown exercise ${relation.targetExerciseId}`);
      }
      if (relation.fromPrescriptionVariantId && !variantIds.has(relation.fromPrescriptionVariantId)) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].relations[${index}].fromPrescriptionVariantId`, "reference.prescription", "Unknown source prescription variant");
      }
      if (relation.targetPrescriptionVariantId && target && !target.prescriptionVariants.some((item) => item.id === relation.targetPrescriptionVariantId)) {
        addIssue(issues, `${path}.exercises[${exerciseIndex}].relations[${index}].targetPrescriptionVariantId`, "reference.prescription", "Unknown target prescription variant");
      }
    });
  });

  benchmarks.forEach((protocol, index) => {
    const subject = protocol.subject;
    const exercise = exerciseById.get(protocol.exerciseId);
    if (!exercise) {
      addIssue(issues, `${path}.benchmarkProtocols[${index}].exerciseId`, "reference.exercise", `Unknown exercise ${protocol.exerciseId}`);
    } else if (protocol.prescriptionVariantId && !exercise.prescriptionVariants.some((item) => item.id === protocol.prescriptionVariantId)) {
      addIssue(issues, `${path}.benchmarkProtocols[${index}].prescriptionVariantId`, "reference.prescription", "Unknown benchmark prescription variant");
    }
    if (exercise && !exercise.benchmarkProtocolIds.includes(protocol.id)) {
      addIssue(issues, `${path}.benchmarkProtocols[${index}].exerciseId`, "reference.benchmark-reverse", "Exercise is missing this benchmark reference");
    }
    if (subject.kind === "milestone" && !getNode(graphById, subject.milestone.graphId, subject.milestone.nodeId)) {
      addIssue(issues, `${path}.benchmarkProtocols[${index}].subject`, "reference.milestone", "Unknown benchmark milestone subject");
    }
    if (subject.kind === "milestone") {
      const graph = graphById.get(subject.milestone.graphId);
      const nodeId = subject.milestone.nodeId;
      const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
      if (node && !node.benchmarkProtocolIds.includes(protocol.id)) {
        addIssue(issues, `${path}.benchmarkProtocols[${index}].subject`, "reference.benchmark-reverse", "Graph node is missing this benchmark reference");
      }
    }
    if (subject.kind === "capacity-facet" && !getFacet(capacityById, subject.capacity.capacityId, subject.capacity.facetId)) {
      addIssue(issues, `${path}.benchmarkProtocols[${index}].subject`, "reference.capacity-facet", "Unknown benchmark capacity subject");
    }
    if (subject.kind === "capacity-facet") {
      const capacity = capacityById.get(subject.capacity.capacityId);
      const facetId = subject.capacity.facetId;
      const facet = capacity?.facets.find((candidate) => candidate.id === facetId);
      if (facet && !facet.benchmarkProtocolIds.includes(protocol.id)) {
        addIssue(issues, `${path}.benchmarkProtocols[${index}].subject`, "reference.benchmark-reverse", "Capacity facet is missing this benchmark reference");
      }
    }
  });
};

export const validateDefinitionBundle = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateDefinitionBundleInto(value, "$", issues);
  return finish(issues);
};

const validateEvidenceBase = (
  value: UnknownRecord,
  path: string,
  issues: IssueList,
) => {
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requireStableId(value.athleteId, `${path}.athleteId`, issues);
  requireIsoTimestamp(value.occurredAt, `${path}.occurredAt`, issues);
  requireIsoTimestamp(value.recordedAt, `${path}.recordedAt`, issues);
  requireEnum(
    value.source,
    ["self-assessment", "guided-test", "athlete-report", "migration", "correction"] as const,
    `${path}.source`,
    issues,
  );
  requirePositiveInteger(value.catalogueVersion, `${path}.catalogueVersion`, issues);
};

const validateEvidenceEventInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  validateEvidenceBase(value, path, issues);
  const baseKeys = [
    "schemaVersion", "id", "athleteId", "occurredAt", "recordedAt", "source",
    "catalogueVersion", "type",
  ];
  if (value.type === "performance_observed") {
    rejectUnknownKeys(value, [
      ...baseKeys, "subject", "outcome", "benchmarkProtocolId", "benchmarkProtocolVersion",
      "observationSessionId", "measurement", "assistance", "range", "perceivedExertion", "notes",
      "legacySourceVersion", "legacySourceReference",
    ], path, issues);
    requireEnum(value.source, ["self-assessment", "guided-test", "athlete-report", "migration"] as const, `${path}.source`, issues);
    if (value.source === "migration") {
      if (value.legacySourceVersion !== "1.2") {
        addIssue(issues, `${path}.legacySourceVersion`, "evidence.legacy-version", "Migrated assessment evidence must retain source version 1.2");
      }
      requireNonEmptyString(value.legacySourceReference, `${path}.legacySourceReference`, issues);
    } else if (value.legacySourceVersion !== undefined || value.legacySourceReference !== undefined) {
      addIssue(issues, path, "evidence.legacy-provenance", "Legacy provenance is only valid for migrated observations");
    }
    validateBenchmarkSubject(value.subject, `${path}.subject`, issues);
    requireEnum(value.outcome, ["clean", "partial", "not-yet", "symptom"] as const, `${path}.outcome`, issues);
    if (value.benchmarkProtocolId !== undefined) requireStableId(value.benchmarkProtocolId, `${path}.benchmarkProtocolId`, issues);
    if (value.benchmarkProtocolVersion !== undefined) requirePositiveInteger(value.benchmarkProtocolVersion, `${path}.benchmarkProtocolVersion`, issues);
    if ((value.benchmarkProtocolId === undefined) !== (value.benchmarkProtocolVersion === undefined)) {
      addIssue(issues, path, "evidence.protocol-pair", "Protocol ID and version must be present together");
    }
    if (value.observationSessionId !== undefined) {
      requireStableId(value.observationSessionId, `${path}.observationSessionId`, issues);
    }
    if (value.source === "guided-test" && value.benchmarkProtocolId !== undefined
      && value.observationSessionId === undefined) {
      addIssue(
        issues,
        `${path}.observationSessionId`,
        "evidence.test-occasion",
        "A guided benchmark must identify its real test occasion",
      );
    }
    if (value.source !== "guided-test" && value.observationSessionId !== undefined) {
      addIssue(
        issues,
        `${path}.observationSessionId`,
        "evidence.test-occasion-source",
        "Only guided tests use standalone test occasion IDs",
      );
    }
    if (value.measurement !== undefined) {
      validateObservationMeasurement(value.measurement, `${path}.measurement`, issues);
    }
    if (value.assistance !== undefined) requireNonEmptyString(value.assistance, `${path}.assistance`, issues);
    if (value.range !== undefined) requireNonEmptyString(value.range, `${path}.range`, issues);
    if (value.notes !== undefined) requireNonEmptyString(value.notes, `${path}.notes`, issues);
    if (value.perceivedExertion !== undefined && (
      typeof value.perceivedExertion !== "number"
      || !Number.isFinite(value.perceivedExertion)
      || value.perceivedExertion < 1
      || value.perceivedExertion > 10
    )) {
      addIssue(issues, `${path}.perceivedExertion`, "evidence.rpe", "RPE must be from 1 to 10");
    }
    return;
  }
  if (value.type === "restriction_reported") {
    rejectUnknownKeys(value, [
      ...baseKeys, "severity", "demandDomains", "bodyRegions", "notes",
    ], path, issues);
    requireEnum(value.source, ["self-assessment", "guided-test", "athlete-report"] as const, `${path}.source`, issues);
    requireEnum(value.severity, ["modify", "block"] as const, `${path}.severity`, issues);
    if (requireArray(value.demandDomains, `${path}.demandDomains`, issues)) {
      if (!value.demandDomains.length) addIssue(issues, `${path}.demandDomains`, "array.non-empty", "Expected an affected demand");
      value.demandDomains.forEach((domain, index) =>
        requireEnum(domain, DEMAND_DOMAINS, `${path}.demandDomains[${index}]`, issues));
    }
    validateNonEmptyStringArray(value.bodyRegions, `${path}.bodyRegions`, issues, false);
    if (value.notes !== undefined) requireNonEmptyString(value.notes, `${path}.notes`, issues);
    return;
  }
  if (value.type === "restriction_cleared") {
    rejectUnknownKeys(value, [...baseKeys, "restrictionEventId", "notes"], path, issues);
    requireEnum(value.source, ["guided-test", "athlete-report"] as const, `${path}.source`, issues);
    requireStableId(value.restrictionEventId, `${path}.restrictionEventId`, issues);
    if (value.restrictionEventId === value.id) {
      addIssue(issues, `${path}.restrictionEventId`, "reference.self", "A clearance cannot reference itself");
    }
    if (value.notes !== undefined) requireNonEmptyString(value.notes, `${path}.notes`, issues);
    return;
  }
  if (value.type === "legacy_claim_imported") {
    rejectUnknownKeys(value, [
      ...baseKeys, "sourceVersion", "claim",
    ], path, issues);
    if (value.source !== "migration") addIssue(issues, `${path}.source`, "evidence.legacy-source", "Legacy claims must use migration source");
    if (value.sourceVersion !== "1.2") addIssue(issues, `${path}.sourceVersion`, "evidence.legacy-version", "Expected source version 1.2");
    if (requireRecord(value.claim, `${path}.claim`, issues)) {
      if (value.claim.kind === "readiness-gate") {
        rejectUnknownKeys(value.claim, ["kind", "legacyGateId", "claimed"], `${path}.claim`, issues);
        requireNonEmptyString(value.claim.legacyGateId, `${path}.claim.legacyGateId`, issues);
        if (value.claim.claimed !== true) addIssue(issues, `${path}.claim.claimed`, "evidence.legacy-claim", "Only true legacy claims are imported; false remains unknown");
      } else if (value.claim.kind === "progression-hint") {
        rejectUnknownKeys(value.claim, ["kind", "legacyExerciseId", "cleanSessions", "lastFeedback"], `${path}.claim`, issues);
        requireNonEmptyString(value.claim.legacyExerciseId, `${path}.claim.legacyExerciseId`, issues);
        if (!Number.isInteger(value.claim.cleanSessions) || Number(value.claim.cleanSessions) < 0) {
          addIssue(issues, `${path}.claim.cleanSessions`, "number.non-negative-integer", "Legacy clean-session hints must be non-negative integers");
        }
        if (value.claim.lastFeedback !== undefined) {
          requireEnum(value.claim.lastFeedback, ["easy", "right", "hard"] as const, `${path}.claim.lastFeedback`, issues);
        }
      } else if (value.claim.kind === "assessment-answer") {
        rejectUnknownKeys(value.claim, ["kind", "legacyTrackId", "legacyAnchorExerciseId", "answer"], `${path}.claim`, issues);
        requireNonEmptyString(value.claim.legacyTrackId, `${path}.claim.legacyTrackId`, issues);
        requireNonEmptyString(value.claim.legacyAnchorExerciseId, `${path}.claim.legacyAnchorExerciseId`, issues);
        requireEnum(value.claim.answer, ["clean", "almost", "not-yet"] as const, `${path}.claim.answer`, issues);
      } else {
        addIssue(issues, `${path}.claim.kind`, "evidence.legacy-claim-kind", "Unknown legacy claim kind");
      }
    }
    return;
  }
  if (value.type === "evidence_corrected") {
    rejectUnknownKeys(value, [...baseKeys, "supersedesEventId", "reason"], path, issues);
    if (value.source !== "correction") addIssue(issues, `${path}.source`, "evidence.correction-source", "Corrections must use correction source");
    requireStableId(value.supersedesEventId, `${path}.supersedesEventId`, issues);
    if (value.supersedesEventId === value.id) {
      addIssue(issues, `${path}.supersedesEventId`, "reference.self", "A correction cannot supersede itself");
    }
    requireNonEmptyString(value.reason, `${path}.reason`, issues);
    return;
  }
  addIssue(issues, `${path}.type`, "evidence.type", "Unknown evidence event type");
};

export const validateAthleteEvidenceEvent = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateEvidenceEventInto(value, "$", issues);
  return finish(issues);
};

const validateAthleteIntentInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "athleteId", "updatedAt", "goals", "emphasisOverride", "equipment",
    "defaultSessionDemand", "preferences",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.athleteId, `${path}.athleteId`, issues);
  requireIsoTimestamp(value.updatedAt, `${path}.updatedAt`, issues);
  if (requireArray(value.goals, `${path}.goals`, issues)) {
    value.goals.forEach((goal, index) => {
      const goalPath = `${path}.goals[${index}]`;
      if (!requireRecord(goal, goalPath, issues)) return;
      rejectUnknownKeys(goal, ["graphId", "targetNodeId", "priority"], goalPath, issues);
      requireStableId(goal.graphId, `${goalPath}.graphId`, issues);
      if (goal.targetNodeId !== undefined) requireStableId(goal.targetNodeId, `${goalPath}.targetNodeId`, issues);
      requireEnum(goal.priority, ["primary", "secondary", "interest"] as const, `${goalPath}.priority`, issues);
    });
  }
  if (value.emphasisOverride !== undefined && requireRecord(value.emphasisOverride, `${path}.emphasisOverride`, issues)) {
    rejectUnknownKeys(value.emphasisOverride, ["primaryGraphId", "secondaryGraphId"], `${path}.emphasisOverride`, issues);
    requireStableId(value.emphasisOverride.primaryGraphId, `${path}.emphasisOverride.primaryGraphId`, issues);
    if (value.emphasisOverride.secondaryGraphId !== undefined) requireStableId(value.emphasisOverride.secondaryGraphId, `${path}.emphasisOverride.secondaryGraphId`, issues);
  }
  validateStableIdArray(value.equipment, `${path}.equipment`, issues, false);
  requireEnum(value.defaultSessionDemand, ["technique", "standard", "challenge"] as const, `${path}.defaultSessionDemand`, issues);
  if (requireRecord(value.preferences, `${path}.preferences`, issues)) {
    rejectUnknownKeys(value.preferences, ["preferredDurationMinutes", "specialistOptIn"], `${path}.preferences`, issues);
    if (value.preferences.preferredDurationMinutes !== undefined) {
      requirePositiveInteger(value.preferences.preferredDurationMinutes, `${path}.preferences.preferredDurationMinutes`, issues);
    }
    if (typeof value.preferences.specialistOptIn !== "boolean") {
      addIssue(issues, `${path}.preferences.specialistOptIn`, "type.boolean", "Expected a boolean");
    }
  }
  if ("recommendedEmphasis" in value) {
    addIssue(issues, `${path}.recommendedEmphasis`, "authority.intent", "App recommendation must not be stored in Athlete Intent");
  }
};

export const validateAthleteIntent = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateAthleteIntentInto(value, "$", issues);
  return finish(issues);
};

const validateLegacySparseSessionSource = (
  value: unknown,
  path: string,
  issues: IssueList,
): boolean => {
  if (!requireRecord(value, path, issues)) return false;
  rejectUnknownKeys(value, [
    "kind", "sourceVersion", "sourceSessionId", "timingPrecision",
    "prescriptionPrecision", "sourceTotalSeconds", "sourceDay", "sourceLevel", "sourceMode",
  ], path, issues);
  requireEnum(value.kind, ["legacy-v1.2-sparse"] as const, `${path}.kind`, issues);
  requireEnum(value.sourceVersion, ["1.2"] as const, `${path}.sourceVersion`, issues);
  requireNonEmptyString(value.sourceSessionId, `${path}.sourceSessionId`, issues);
  requireEnum(value.timingPrecision, ["session-total-only"] as const, `${path}.timingPrecision`, issues);
  requireEnum(
    value.prescriptionPrecision,
    ["catalogue-default-reconstruction"] as const,
    `${path}.prescriptionPrecision`,
    issues,
  );
  if (value.sourceTotalSeconds !== undefined) {
    requireNonNegativeNumber(value.sourceTotalSeconds, `${path}.sourceTotalSeconds`, issues);
  }
  if (value.sourceDay !== undefined && (!Number.isInteger(value.sourceDay) || Number(value.sourceDay) < 0)) {
    addIssue(issues, `${path}.sourceDay`, "number.non-negative-integer", "Legacy source day must be a non-negative integer");
  }
  if (value.sourceLevel !== undefined) requireNonEmptyString(value.sourceLevel, `${path}.sourceLevel`, issues);
  if (value.sourceMode !== undefined) requireNonEmptyString(value.sourceMode, `${path}.sourceMode`, issues);
  return value.kind === "legacy-v1.2-sparse";
};

const validateSessionPlanInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "id", "athleteId", "createdAt", "catalogueVersion",
    "generatorPolicyId", "generatorPolicyVersion",
    "definitionReferences", "intendedDurationSeconds", "items", "rationale", "legacySource",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requireStableId(value.athleteId, `${path}.athleteId`, issues);
  requireIsoTimestamp(value.createdAt, `${path}.createdAt`, issues);
  requirePositiveInteger(value.catalogueVersion, `${path}.catalogueVersion`, issues);
  requireStableId(value.generatorPolicyId, `${path}.generatorPolicyId`, issues);
  requirePositiveInteger(value.generatorPolicyVersion, `${path}.generatorPolicyVersion`, issues);
  const legacySparse = value.legacySource === undefined
    ? false
    : validateLegacySparseSessionSource(value.legacySource, `${path}.legacySource`, issues);
  if (legacySparse) requireNonNegativeNumber(value.intendedDurationSeconds, `${path}.intendedDurationSeconds`, issues);
  else requirePositiveInteger(value.intendedDurationSeconds, `${path}.intendedDurationSeconds`, issues);
  const definitionVersions = new Map<string, number>();
  if (requireArray(value.definitionReferences, `${path}.definitionReferences`, issues)) {
    const seen = new Set<string>();
    value.definitionReferences.forEach((reference, index) => {
      const referencePath = `${path}.definitionReferences[${index}]`;
      if (!requireRecord(reference, referencePath, issues)) return;
      rejectUnknownKeys(reference, ["kind", "id", "version"], referencePath, issues);
      requireEnum(reference.kind, ["exercise", "graph", "capacity", "benchmark", "policy"] as const, `${referencePath}.kind`, issues);
      requireStableId(reference.id, `${referencePath}.id`, issues);
      requirePositiveInteger(reference.version, `${referencePath}.version`, issues);
      const key = `${String(reference.kind)}:${String(reference.id)}`;
      if (seen.has(key)) addIssue(issues, referencePath, "reference.duplicate", `Duplicate definition reference ${key}`);
      seen.add(key);
      if (typeof reference.version === "number") definitionVersions.set(key, reference.version);
    });
  }
  if (
    typeof value.generatorPolicyId === "string"
    && typeof value.generatorPolicyVersion === "number"
    && definitionVersions.get(`policy:${value.generatorPolicyId}`) !== value.generatorPolicyVersion
  ) {
    addIssue(issues, `${path}.generatorPolicyId`, "reference.policy", "Generator policy ID/version must appear in definitionReferences");
  }
  if (requireArray(value.items, `${path}.items`, issues)) {
    if (!value.items.length) addIssue(issues, `${path}.items`, "array.non-empty", "Expected a plan item");
    validateUniqueIds(value.items, `${path}.items`, issues);
    let plannedSeconds = 0;
    value.items.forEach((item, index) => {
      const itemPath = `${path}.items[${index}]`;
      if (!requireRecord(item, itemPath, issues)) return;
      rejectUnknownKeys(item, [
        "id", "exerciseId", "exerciseDefinitionVersion", "prescriptionVariantId",
        "benchmarkProtocolId", "benchmarkProtocolVersion", "purpose", "plannedSeconds",
        "targetMilestone", "demand",
      ], itemPath, issues);
      requireStableId(item.id, `${itemPath}.id`, issues);
      requireStableId(item.exerciseId, `${itemPath}.exerciseId`, issues);
      requirePositiveInteger(item.exerciseDefinitionVersion, `${itemPath}.exerciseDefinitionVersion`, issues);
      requireStableId(item.prescriptionVariantId, `${itemPath}.prescriptionVariantId`, issues);
      if (
        typeof item.exerciseId === "string"
        && typeof item.exerciseDefinitionVersion === "number"
        && definitionVersions.get(`exercise:${item.exerciseId}`) !== item.exerciseDefinitionVersion
      ) {
        addIssue(issues, `${itemPath}.exerciseId`, "reference.exercise-version", "Exercise ID/version must appear in definitionReferences");
      }
      if (item.benchmarkProtocolId !== undefined) requireStableId(item.benchmarkProtocolId, `${itemPath}.benchmarkProtocolId`, issues);
      if (item.benchmarkProtocolVersion !== undefined) requirePositiveInteger(item.benchmarkProtocolVersion, `${itemPath}.benchmarkProtocolVersion`, issues);
      if ((item.benchmarkProtocolId === undefined) !== (item.benchmarkProtocolVersion === undefined)) {
        addIssue(issues, itemPath, "session-plan.protocol-pair", "Benchmark protocol ID and version must be present together");
      }
      if (
        typeof item.benchmarkProtocolId === "string"
        && typeof item.benchmarkProtocolVersion === "number"
        && definitionVersions.get(`benchmark:${item.benchmarkProtocolId}`) !== item.benchmarkProtocolVersion
      ) {
        addIssue(issues, `${itemPath}.benchmarkProtocolId`, "reference.benchmark-version", "Benchmark ID/version must appear in definitionReferences");
      }
      requireEnum(item.purpose, ["preparation", "primary-development", "secondary-development", "maintenance", "guided-test", "recovery"] as const, `${itemPath}.purpose`, issues);
      if (item.purpose === "guided-test" && item.benchmarkProtocolId === undefined) {
        addIssue(issues, `${itemPath}.benchmarkProtocolId`, "session-plan.guided-test-protocol", "Guided-test items require a versioned benchmark protocol");
      }
      const validPlannedSeconds = legacySparse
        ? requireNonNegativeNumber(item.plannedSeconds, `${itemPath}.plannedSeconds`, issues)
        : requirePositiveInteger(item.plannedSeconds, `${itemPath}.plannedSeconds`, issues);
      if (validPlannedSeconds && typeof item.plannedSeconds === "number") plannedSeconds += item.plannedSeconds;
      if (item.targetMilestone !== undefined) {
        validateMilestoneRef(item.targetMilestone, `${itemPath}.targetMilestone`, issues);
        if (
          isRecord(item.targetMilestone)
          && typeof item.targetMilestone.graphId === "string"
          && !definitionVersions.has(`graph:${item.targetMilestone.graphId}`)
        ) {
          addIssue(issues, `${itemPath}.targetMilestone.graphId`, "reference.graph", "Target graph must appear in definitionReferences");
        }
      }
      validateDemandProfile(item.demand, `${itemPath}.demand`, issues);
    });
    if (!legacySparse && typeof value.intendedDurationSeconds === "number" && plannedSeconds !== value.intendedDurationSeconds) {
      addIssue(issues, `${path}.intendedDurationSeconds`, "session-plan.duration", `Expected item duration total ${plannedSeconds}`);
    }
  }
  if (requireArray(value.rationale, `${path}.rationale`, issues)) {
    value.rationale.forEach((reason, index) => {
      const reasonPath = `${path}.rationale[${index}]`;
      if (!requireRecord(reason, reasonPath, issues)) return;
      rejectUnknownKeys(reason, ["code", "message", "relatedGraphId"], reasonPath, issues);
      requireStableId(reason.code, `${reasonPath}.code`, issues);
      requireNonEmptyString(reason.message, `${reasonPath}.message`, issues);
      if (reason.relatedGraphId !== undefined) requireStableId(reason.relatedGraphId, `${reasonPath}.relatedGraphId`, issues);
    });
  }
  if ("completedAt" in value || "itemOutcomes" in value || "status" in value) {
    addIssue(issues, path, "authority.session-plan", "Session Plan must not contain actual outcome fields");
  }
};

export const validateSessionPlan = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateSessionPlanInto(value, "$", issues);
  return finish(issues);
};

const validateSessionRecordInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "id", "athleteId", "planId", "startedAt", "completedAt",
    "recordedAt", "status", "itemOutcomes", "supersedesRecordId", "legacySource",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.id, `${path}.id`, issues);
  requireStableId(value.athleteId, `${path}.athleteId`, issues);
  requireStableId(value.planId, `${path}.planId`, issues);
  const startedAt = value.startedAt;
  const completedAt = value.completedAt;
  const recordedAt = value.recordedAt;
  const hasStart = requireIsoTimestamp(startedAt, `${path}.startedAt`, issues);
  const hasEnd = requireIsoTimestamp(completedAt, `${path}.completedAt`, issues);
  const hasRecordedAt = requireIsoTimestamp(recordedAt, `${path}.recordedAt`, issues);
  if (hasStart && hasEnd && Date.parse(completedAt) < Date.parse(startedAt)) {
    addIssue(issues, `${path}.completedAt`, "session-record.time-order", "Completion cannot precede start");
  }
  if (hasEnd && hasRecordedAt && Date.parse(recordedAt) < Date.parse(completedAt)) {
    addIssue(
      issues,
      `${path}.recordedAt`,
      "session-record.recorded-time-order",
      "Record ingestion cannot precede session completion",
    );
  }
  requireEnum(value.status, ["complete", "modified", "partial", "abandoned"] as const, `${path}.status`, issues);
  const legacySparse = value.legacySource === undefined
    ? false
    : validateLegacySparseSessionSource(value.legacySource, `${path}.legacySource`, issues);
  if (value.supersedesRecordId !== undefined) requireStableId(value.supersedesRecordId, `${path}.supersedesRecordId`, issues);
  if (value.supersedesRecordId === value.id) {
    addIssue(issues, `${path}.supersedesRecordId`, "reference.self", "A Session Record cannot supersede itself");
  }
  if (!requireArray(value.itemOutcomes, `${path}.itemOutcomes`, issues)) return;
  const seen = new Set<string>();
  value.itemOutcomes.forEach((item, index) => {
    const itemPath = `${path}.itemOutcomes[${index}]`;
    if (!requireRecord(item, itemPath, issues)) return;
    rejectUnknownKeys(item, [
      "planItemId", "status", "participationSeconds", "performedExerciseId",
      "performedExerciseDefinitionVersion", "performedPrescriptionVariantId",
      "modificationReason", "benchmarkObservation", "review", "participationBasis",
    ], itemPath, issues);
    if (requireStableId(item.planItemId, `${itemPath}.planItemId`, issues)) {
      if (seen.has(item.planItemId)) addIssue(issues, `${itemPath}.planItemId`, "id.duplicate", `Duplicate plan item outcome ${item.planItemId}`);
      seen.add(item.planItemId);
    }
    requireEnum(item.status, ["completed", "modified", "skipped"] as const, `${itemPath}.status`, issues);
    if (item.participationBasis !== undefined) {
      requireEnum(item.participationBasis, ["measured", "legacy-unknown"] as const, `${itemPath}.participationBasis`, issues);
    }
    if (item.participationBasis === "legacy-unknown" && !legacySparse) {
      addIssue(issues, `${itemPath}.participationBasis`, "session-record.legacy-participation", "Unknown item timing is valid only on an explicitly legacy-sparse record");
    }
    const hasParticipation = requireNonNegativeNumber(item.participationSeconds, `${itemPath}.participationSeconds`, issues);
    if (hasParticipation && item.status === "skipped" && item.participationSeconds !== 0) {
      addIssue(issues, `${itemPath}.participationSeconds`, "session-record.skipped-participation", "Skipped work must have zero participation");
    }
    if (hasParticipation && (item.status === "completed" || item.status === "modified") && item.participationSeconds === 0
      && item.participationBasis !== "legacy-unknown") {
      addIssue(issues, `${itemPath}.participationSeconds`, "session-record.missing-participation", "Completed or modified work requires positive participation");
    }
    if (item.performedExerciseId !== undefined) requireStableId(item.performedExerciseId, `${itemPath}.performedExerciseId`, issues);
    if (item.performedExerciseDefinitionVersion !== undefined) {
      requirePositiveInteger(item.performedExerciseDefinitionVersion, `${itemPath}.performedExerciseDefinitionVersion`, issues);
    }
    if ((item.performedExerciseId === undefined) !== (item.performedExerciseDefinitionVersion === undefined)) {
      addIssue(issues, itemPath, "session-record.exercise-version", "Performed exercise ID and definition version must be present together");
    }
    if (item.performedPrescriptionVariantId !== undefined) requireStableId(item.performedPrescriptionVariantId, `${itemPath}.performedPrescriptionVariantId`, issues);
    if (item.modificationReason !== undefined) requireNonEmptyString(item.modificationReason, `${itemPath}.modificationReason`, issues);
    if (
      item.status === "modified"
      && item.performedExerciseId === undefined
      && item.performedPrescriptionVariantId === undefined
      && item.modificationReason === undefined
    ) {
      addIssue(issues, itemPath, "session-record.modification", "Modified work must identify the changed exercise, prescription, or reason");
    }
    if (item.benchmarkObservation !== undefined && requireRecord(item.benchmarkObservation, `${itemPath}.benchmarkObservation`, issues)) {
      const observationPath = `${itemPath}.benchmarkObservation`;
      if (item.status === "skipped" || (typeof item.participationSeconds === "number" && item.participationSeconds <= 0)) {
        addIssue(issues, observationPath, "session-record.benchmark-participation", "Skipped or zero-participation work cannot contain a benchmark observation");
      }
      if (legacySparse) {
        addIssue(issues, observationPath, "session-record.legacy-benchmark", "Sparse legacy sessions cannot claim an exact benchmark observation");
      }
      rejectUnknownKeys(item.benchmarkObservation, [
        "subject", "benchmarkProtocolId", "benchmarkProtocolVersion", "outcome", "measurement",
        "assistance", "range", "perceivedExertion",
      ], observationPath, issues);
      validateBenchmarkSubject(item.benchmarkObservation.subject, `${observationPath}.subject`, issues);
      requireStableId(item.benchmarkObservation.benchmarkProtocolId, `${observationPath}.benchmarkProtocolId`, issues);
      requirePositiveInteger(item.benchmarkObservation.benchmarkProtocolVersion, `${observationPath}.benchmarkProtocolVersion`, issues);
      requireEnum(item.benchmarkObservation.outcome, ["clean", "partial", "not-yet", "symptom"] as const, `${observationPath}.outcome`, issues);
      if (item.benchmarkObservation.measurement !== undefined) {
        validateObservationMeasurement(
          item.benchmarkObservation.measurement,
          `${observationPath}.measurement`,
          issues,
        );
      }
      if (item.benchmarkObservation.assistance !== undefined) requireNonEmptyString(item.benchmarkObservation.assistance, `${observationPath}.assistance`, issues);
      if (item.benchmarkObservation.range !== undefined) requireNonEmptyString(item.benchmarkObservation.range, `${observationPath}.range`, issues);
      if (item.benchmarkObservation.perceivedExertion !== undefined && (
        typeof item.benchmarkObservation.perceivedExertion !== "number"
        || !Number.isFinite(item.benchmarkObservation.perceivedExertion)
        || item.benchmarkObservation.perceivedExertion < 1
        || item.benchmarkObservation.perceivedExertion > 10
      )) {
        addIssue(issues, `${observationPath}.perceivedExertion`, "evidence.rpe", "RPE must be from 1 to 10");
      }
    }
    if (item.review !== undefined && requireRecord(item.review, `${itemPath}.review`, issues)) {
      rejectUnknownKeys(item.review, ["outcome", "difficulty", "symptomOrInstability"], `${itemPath}.review`, issues);
      requireEnum(item.review.outcome, ["clean", "partial", "not-today"] as const, `${itemPath}.review.outcome`, issues);
      if (item.status === "skipped" && item.review.outcome !== "not-today") {
        addIssue(issues, `${itemPath}.review.outcome`, "session-record.skipped-review", "Skipped work cannot claim clean or partial performance");
      }
      if (item.review.difficulty !== undefined) requireEnum(item.review.difficulty, ["easy", "right", "hard"] as const, `${itemPath}.review.difficulty`, issues);
      if (item.review.symptomOrInstability !== undefined && typeof item.review.symptomOrInstability !== "boolean") {
        addIssue(issues, `${itemPath}.review.symptomOrInstability`, "type.boolean", "Expected a boolean");
      }
    }
  });
  if ("items" in value || "rationale" in value || "intendedDurationSeconds" in value) {
    addIssue(issues, path, "authority.session-record", "Session Record must reference, not duplicate, Session Plan facts");
  }
};

export const validateSessionRecord = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateSessionRecordInto(value, "$", issues);
  return finish(issues);
};

const validateDemandDomainArray = (
  value: unknown,
  path: string,
  issues: IssueList,
  allowEmpty = true,
) => {
  if (!requireArray(value, path, issues)) return;
  if (!allowEmpty && value.length === 0) {
    addIssue(issues, path, "array.non-empty", "Expected at least one affected demand domain");
  }
  const seen = new Set<string>();
  value.forEach((domain, index) => {
    const domainPath = `${path}[${index}]`;
    if (!requireEnum(domain, DEMAND_DOMAINS, domainPath, issues)) return;
    if (seen.has(domain)) {
      addIssue(issues, domainPath, "enum.duplicate", `Duplicate demand domain ${domain}`);
    }
    seen.add(domain);
  });
};

const validateReasonedMilestoneArray = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireArray(value, path, issues)) return;
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!requireRecord(item, itemPath, issues)) return;
    rejectUnknownKeys(item, ["milestone", "reasonCodes"], itemPath, issues);
    validateMilestoneRef(item.milestone, `${itemPath}.milestone`, issues);
    validateStableIdArray(item.reasonCodes, `${itemPath}.reasonCodes`, issues, false);
    if (
      !isRecord(item.milestone)
      || typeof item.milestone.graphId !== "string"
      || typeof item.milestone.nodeId !== "string"
    ) return;
    const key = `${item.milestone.graphId}:${item.milestone.nodeId}`;
    if (seen.has(key)) {
      addIssue(issues, `${itemPath}.milestone`, "reference.duplicate", `Duplicate milestone ${key}`);
    }
    seen.add(key);
  });
};

const validateDerivedAthleteStateInto = (
  value: unknown,
  path: string,
  issues: IssueList,
) => {
  if (!requireRecord(value, path, issues)) return;
  rejectUnknownKeys(value, [
    "schemaVersion", "athleteId", "projectionVersion", "asOf", "observationCursors",
    "nodeStates", "capacityFindings", "activeRestrictions", "reconfirmationRequirements",
    "recentLoad", "workingNodes", "maintenanceNeeds", "eligibleTargets",
    "trainabilityEvaluations", "recommendedEmphasis",
  ], path, issues);
  validateSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireStableId(value.athleteId, `${path}.athleteId`, issues);
  requirePositiveInteger(value.projectionVersion, `${path}.projectionVersion`, issues);
  const asOf = value.asOf;
  const hasAsOf = requireIsoTimestamp(asOf, `${path}.asOf`, issues);
  if (requireRecord(value.observationCursors, `${path}.observationCursors`, issues)) {
    rejectUnknownKeys(value.observationCursors, ["evidenceEvents", "sessionRecords"], `${path}.observationCursors`, issues);
    if (value.observationCursors.evidenceEvents !== undefined) requireNonEmptyString(value.observationCursors.evidenceEvents, `${path}.observationCursors.evidenceEvents`, issues);
    if (value.observationCursors.sessionRecords !== undefined) requireNonEmptyString(value.observationCursors.sessionRecords, `${path}.observationCursors.sessionRecords`, issues);
  }
  if (requireArray(value.nodeStates, `${path}.nodeStates`, issues)) {
    const seen = new Set<string>();
    value.nodeStates.forEach((state, index) => {
      const statePath = `${path}.nodeStates[${index}]`;
      if (!requireRecord(state, statePath, issues)) return;
      rejectUnknownKeys(state, [
        "milestone", "lifecycle", "confidence", "satisfiedForEligibilityBy",
        "supportingObservationRefs", "reasonCodes",
      ], statePath, issues);
      validateMilestoneRef(state.milestone, `${statePath}.milestone`, issues);
      if (isRecord(state.milestone) && typeof state.milestone.graphId === "string" && typeof state.milestone.nodeId === "string") {
        const key = `${state.milestone.graphId}:${state.milestone.nodeId}`;
        if (seen.has(key)) addIssue(issues, `${statePath}.milestone`, "reference.duplicate", `Duplicate node state ${key}`);
        seen.add(key);
      }
      requireEnum(state.lifecycle, ["unknown", "estimated", "developing", "demonstrated", "established"] as const, `${statePath}.lifecycle`, issues);
      requireEnum(state.confidence, ["unknown", "current", "stale", "contradicted"] as const, `${statePath}.confidence`, issues);
      if (requireArray(state.satisfiedForEligibilityBy, `${statePath}.satisfiedForEligibilityBy`, issues)) {
        const seenImplications = new Set<string>();
        state.satisfiedForEligibilityBy.forEach((implication, implicationIndex) => {
          const implicationPath = `${statePath}.satisfiedForEligibilityBy[${implicationIndex}]`;
          if (!requireRecord(implication, implicationPath, issues)) return;
          rejectUnknownKeys(
            implication,
            ["milestone", "supportingObservationRefs"],
            implicationPath,
            issues,
          );
          validateMilestoneRef(implication.milestone, `${implicationPath}.milestone`, issues);
          validateObservationSourceRefArray(
            implication.supportingObservationRefs,
            `${implicationPath}.supportingObservationRefs`,
            issues,
            false,
          );
          if (
            !isRecord(implication.milestone)
            || typeof implication.milestone.graphId !== "string"
            || typeof implication.milestone.nodeId !== "string"
          ) return;
          const key = `${implication.milestone.graphId}:${implication.milestone.nodeId}`;
          if (seenImplications.has(key)) {
            addIssue(
              issues,
              `${implicationPath}.milestone`,
              "reference.duplicate",
              `Duplicate eligibility implication ${key}`,
            );
          }
          seenImplications.add(key);
        });
      }
      validateObservationSourceRefArray(
        state.supportingObservationRefs,
        `${statePath}.supportingObservationRefs`,
        issues,
      );
      validateStableIdArray(state.reasonCodes, `${statePath}.reasonCodes`, issues, false);
    });
  }
  if (requireArray(value.capacityFindings, `${path}.capacityFindings`, issues)) {
    const seen = new Set<string>();
    value.capacityFindings.forEach((finding, index) => {
      const findingPath = `${path}.capacityFindings[${index}]`;
      if (!requireRecord(finding, findingPath, issues)) return;
      rejectUnknownKeys(finding, [
        "capacity", "finding", "confirmationSatisfied", "confidence",
        "supportingObservationRefs", "reasonCodes",
      ], findingPath, issues);
      validateCapacityFacetRef(finding.capacity, `${findingPath}.capacity`, issues);
      if (isRecord(finding.capacity) && typeof finding.capacity.capacityId === "string" && typeof finding.capacity.facetId === "string") {
        const key = `${finding.capacity.capacityId}:${finding.capacity.facetId}`;
        if (seen.has(key)) addIssue(issues, `${findingPath}.capacity`, "reference.duplicate", `Duplicate capacity finding ${key}`);
        seen.add(key);
      }
      requireEnum(finding.finding, ["unknown", "estimated", "demonstrated"] as const, `${findingPath}.finding`, issues);
      if (typeof finding.confirmationSatisfied !== "boolean") {
        addIssue(
          issues,
          `${findingPath}.confirmationSatisfied`,
          "type.boolean",
          "Expected a boolean",
        );
      } else if (finding.confirmationSatisfied && finding.finding !== "demonstrated") {
        addIssue(
          issues,
          `${findingPath}.confirmationSatisfied`,
          "capacity.confirmation-without-demonstration",
          "Only a demonstrated capacity finding can satisfy confirmation",
        );
      }
      requireEnum(finding.confidence, ["unknown", "current", "stale", "contradicted"] as const, `${findingPath}.confidence`, issues);
      validateObservationSourceRefArray(
        finding.supportingObservationRefs,
        `${findingPath}.supportingObservationRefs`,
        issues,
      );
      validateStableIdArray(finding.reasonCodes, `${findingPath}.reasonCodes`, issues, false);
    });
  }
  if (requireArray(value.activeRestrictions, `${path}.activeRestrictions`, issues)) {
    const seenSources = new Set<string>();
    value.activeRestrictions.forEach((restriction, index) => {
      const restrictionPath = `${path}.activeRestrictions[${index}]`;
      if (!requireRecord(restriction, restrictionPath, issues)) return;
      rejectUnknownKeys(restriction, [
        "source", "decision", "demandDomains", "bodyRegions", "occurredAt", "reasonCodes",
      ], restrictionPath, issues);
      validateObservationSourceRef(restriction.source, `${restrictionPath}.source`, issues);
      requireEnum(restriction.decision, ["modify", "block"] as const, `${restrictionPath}.decision`, issues);
      validateDemandDomainArray(
        restriction.demandDomains,
        `${restrictionPath}.demandDomains`,
        issues,
        false,
      );
      validateNonEmptyStringArray(restriction.bodyRegions, `${restrictionPath}.bodyRegions`, issues);
      const occurredAt = restriction.occurredAt;
      const hasOccurredAt = requireIsoTimestamp(
        occurredAt,
        `${restrictionPath}.occurredAt`,
        issues,
      );
      if (hasAsOf && hasOccurredAt && Date.parse(occurredAt) > Date.parse(asOf)) {
        addIssue(
          issues,
          `${restrictionPath}.occurredAt`,
          "derived.after-cutoff",
          "An active restriction cannot occur after the projection cutoff",
        );
      }
      validateStableIdArray(restriction.reasonCodes, `${restrictionPath}.reasonCodes`, issues, false);
      if (isRecord(restriction.source)) {
        const key = observationSourceRefKey(restriction.source);
        if (key && seenSources.has(key)) {
          addIssue(
            issues,
            `${restrictionPath}.source`,
            "reference.duplicate",
            `Duplicate active restriction source ${key}`,
          );
        }
        if (key) seenSources.add(key);
      }
    });
  }
  if (requireArray(value.reconfirmationRequirements, `${path}.reconfirmationRequirements`, issues)) {
    const seenSources = new Set<string>();
    value.reconfirmationRequirements.forEach((requirement, index) => {
      const requirementPath = `${path}.reconfirmationRequirements[${index}]`;
      if (!requireRecord(requirement, requirementPath, issues)) return;
      rejectUnknownKeys(requirement, [
        "source", "triggeredBy", "requiredSince", "demandDomains", "reasonCodes",
      ], requirementPath, issues);
      validateObservationSourceRef(requirement.source, `${requirementPath}.source`, issues);
      if (requirement.triggeredBy !== undefined) {
        validateObservationSourceRef(
          requirement.triggeredBy,
          `${requirementPath}.triggeredBy`,
          issues,
        );
      }
      const requiredSince = requirement.requiredSince;
      const hasRequiredSince = requireIsoTimestamp(
        requiredSince,
        `${requirementPath}.requiredSince`,
        issues,
      );
      if (hasAsOf && hasRequiredSince && Date.parse(requiredSince) > Date.parse(asOf)) {
        addIssue(
          issues,
          `${requirementPath}.requiredSince`,
          "derived.after-cutoff",
          "A reconfirmation requirement cannot be created after the projection cutoff",
        );
      }
      validateDemandDomainArray(
        requirement.demandDomains,
        `${requirementPath}.demandDomains`,
        issues,
        false,
      );
      validateStableIdArray(requirement.reasonCodes, `${requirementPath}.reasonCodes`, issues, false);
      if (isRecord(requirement.source)) {
        const sourceKey = observationSourceRefKey(requirement.source);
        if (sourceKey && seenSources.has(sourceKey)) {
          addIssue(
            issues,
            `${requirementPath}.source`,
            "reference.duplicate",
            `Duplicate reconfirmation requirement for ${sourceKey}`,
          );
        }
        if (sourceKey) seenSources.add(sourceKey);
      }
    });
  }
  if (requireRecord(value.recentLoad, `${path}.recentLoad`, issues)) {
    rejectUnknownKeys(value.recentLoad, ["from", "to", "demand", "exposures"], `${path}.recentLoad`, issues);
    const loadFrom = value.recentLoad.from;
    const loadTo = value.recentLoad.to;
    const hasFrom = requireIsoTimestamp(loadFrom, `${path}.recentLoad.from`, issues);
    const hasTo = requireIsoTimestamp(loadTo, `${path}.recentLoad.to`, issues);
    if (hasFrom && hasTo && Date.parse(loadTo) < Date.parse(loadFrom)) {
      addIssue(issues, `${path}.recentLoad.to`, "load.time-order", "Load window end cannot precede start");
    }
    if (hasAsOf && hasTo && Date.parse(loadTo) > Date.parse(asOf)) {
      addIssue(
        issues,
        `${path}.recentLoad.to`,
        "derived.after-cutoff",
        "The recent-load window cannot extend beyond the projection cutoff",
      );
    }
    validateDemandProfile(value.recentLoad.demand, `${path}.recentLoad.demand`, issues);
    if (requireArray(value.recentLoad.exposures, `${path}.recentLoad.exposures`, issues)) {
      const seenSources = new Set<string>();
      value.recentLoad.exposures.forEach((exposure, index) => {
        const exposurePath = `${path}.recentLoad.exposures[${index}]`;
        if (!requireRecord(exposure, exposurePath, issues)) return;
        rejectUnknownKeys(
          exposure,
          [
            "source", "occurredAt", "participationSeconds", "demand",
            "exerciseId", "exerciseDefinitionVersion", "prescriptionVariantId",
            "reviewOutcome", "reviewDifficulty",
          ],
          exposurePath,
          issues,
        );
        validateObservationSourceRef(exposure.source, `${exposurePath}.source`, issues);
        const occurredAt = exposure.occurredAt;
        const hasOccurredAt = requireIsoTimestamp(
          occurredAt,
          `${exposurePath}.occurredAt`,
          issues,
        );
        if (
          hasFrom
          && hasTo
          && hasOccurredAt
          && (
            Date.parse(occurredAt) < Date.parse(loadFrom)
            || Date.parse(occurredAt) > Date.parse(loadTo)
          )
        ) {
          addIssue(
            issues,
            `${exposurePath}.occurredAt`,
            "load.outside-window",
            "A load exposure must occur inside the recent-load window",
          );
        }
        requireNonNegativeNumber(
          exposure.participationSeconds,
          `${exposurePath}.participationSeconds`,
          issues,
        );
        validateDemandProfile(exposure.demand, `${exposurePath}.demand`, issues);
        if (exposure.exerciseId !== undefined) {
          requireStableId(exposure.exerciseId, `${exposurePath}.exerciseId`, issues);
        }
        if (exposure.exerciseDefinitionVersion !== undefined) {
          requirePositiveInteger(
            exposure.exerciseDefinitionVersion,
            `${exposurePath}.exerciseDefinitionVersion`,
            issues,
          );
        }
        if (exposure.prescriptionVariantId !== undefined) {
          requireStableId(
            exposure.prescriptionVariantId,
            `${exposurePath}.prescriptionVariantId`,
            issues,
          );
        }
        if (exposure.reviewOutcome !== undefined) {
          requireEnum(
            exposure.reviewOutcome,
            ["clean", "partial", "not-today"] as const,
            `${exposurePath}.reviewOutcome`,
            issues,
          );
        }
        if (exposure.reviewDifficulty !== undefined) {
          requireEnum(
            exposure.reviewDifficulty,
            ["easy", "right", "hard"] as const,
            `${exposurePath}.reviewDifficulty`,
            issues,
          );
        }
        if (isRecord(exposure.source)) {
          const key = observationSourceRefKey(exposure.source);
          if (key && seenSources.has(key)) {
            addIssue(
              issues,
              `${exposurePath}.source`,
              "load.duplicate-source",
              `Load source ${key} must be represented only once`,
            );
          }
          if (key) seenSources.add(key);
        }
      });
    }
  }
  validateReasonedMilestoneArray(value.workingNodes, `${path}.workingNodes`, issues);
  validateReasonedMilestoneArray(value.maintenanceNeeds, `${path}.maintenanceNeeds`, issues);
  validateReasonedMilestoneArray(value.eligibleTargets, `${path}.eligibleTargets`, issues);
  if (requireArray(value.trainabilityEvaluations, `${path}.trainabilityEvaluations`, issues)) {
    const seen = new Set<string>();
    value.trainabilityEvaluations.forEach((evaluation, index) => {
      const evaluationPath = `${path}.trainabilityEvaluations[${index}]`;
      if (!requireRecord(evaluation, evaluationPath, issues)) return;
      rejectUnknownKeys(evaluation, [
        "exerciseId", "exerciseDefinitionVersion", "prescriptionVariantId", "decision",
        "reasonCodes", "safeAlternative",
      ], evaluationPath, issues);
      const hasExercise = requireStableId(evaluation.exerciseId, `${evaluationPath}.exerciseId`, issues);
      requirePositiveInteger(evaluation.exerciseDefinitionVersion, `${evaluationPath}.exerciseDefinitionVersion`, issues);
      const hasPrescription = requireStableId(evaluation.prescriptionVariantId, `${evaluationPath}.prescriptionVariantId`, issues);
      requireEnum(evaluation.decision, ["allow", "modify", "block"] as const, `${evaluationPath}.decision`, issues);
      validateStableIdArray(evaluation.reasonCodes, `${evaluationPath}.reasonCodes`, issues, false);
      if (hasExercise && hasPrescription) {
        const key = `${evaluation.exerciseId}:${evaluation.prescriptionVariantId}`;
        if (seen.has(key)) addIssue(issues, evaluationPath, "reference.duplicate", `Duplicate trainability evaluation ${key}`);
        seen.add(key);
      }
      if (evaluation.safeAlternative !== undefined && requireRecord(evaluation.safeAlternative, `${evaluationPath}.safeAlternative`, issues)) {
        rejectUnknownKeys(evaluation.safeAlternative, [
          "exerciseId", "exerciseDefinitionVersion", "prescriptionVariantId",
        ], `${evaluationPath}.safeAlternative`, issues);
        requireStableId(evaluation.safeAlternative.exerciseId, `${evaluationPath}.safeAlternative.exerciseId`, issues);
        requirePositiveInteger(evaluation.safeAlternative.exerciseDefinitionVersion, `${evaluationPath}.safeAlternative.exerciseDefinitionVersion`, issues);
        requireStableId(evaluation.safeAlternative.prescriptionVariantId, `${evaluationPath}.safeAlternative.prescriptionVariantId`, issues);
      }
    });
  }
  if (value.recommendedEmphasis !== undefined && requireRecord(value.recommendedEmphasis, `${path}.recommendedEmphasis`, issues)) {
    rejectUnknownKeys(value.recommendedEmphasis, [
      "primaryGraphId", "secondaryGraphId", "reasonCodes",
    ], `${path}.recommendedEmphasis`, issues);
    requireStableId(value.recommendedEmphasis.primaryGraphId, `${path}.recommendedEmphasis.primaryGraphId`, issues);
    if (value.recommendedEmphasis.secondaryGraphId !== undefined) requireStableId(value.recommendedEmphasis.secondaryGraphId, `${path}.recommendedEmphasis.secondaryGraphId`, issues);
    validateStableIdArray(value.recommendedEmphasis.reasonCodes, `${path}.recommendedEmphasis.reasonCodes`, issues, false);
  }
};

export const validateDerivedAthleteState = (value: unknown): ValidationResult => {
  const issues: IssueList = [];
  validateDerivedAthleteStateInto(value, "$", issues);
  return finish(issues);
};

export const validateLegacyV12CompatibilitySnapshot = (
  value: unknown,
): ValidationResult => {
  const issues: IssueList = [];
  const path = "$";
  if (!requireRecord(value, path, issues)) return finish(issues);
  rejectUnknownKeys(value, [
    "sourceVersion", "sourceSchemaVersion", "sourceRevision", "sourceCreatedAt", "sourceUpdatedAt",
    "profileId", "username", "progressResetAt",
    "nextProgramDay", "history", "readinessClaims", "readinessClaimUpdatedAt",
    "progressionHints", "equipment", "preferences",
  ], path, issues);
  if (value.sourceVersion !== "1.2") addIssue(issues, `${path}.sourceVersion`, "legacy.version", "Expected v1.2 source");
  if (value.sourceSchemaVersion !== 1) addIssue(issues, `${path}.sourceSchemaVersion`, "legacy.schema", "Expected legacy profile schema 1");
  requireNonNegativeInteger(value.sourceRevision, `${path}.sourceRevision`, issues);
  requireIsoTimestamp(value.sourceCreatedAt, `${path}.sourceCreatedAt`, issues);
  requireIsoTimestamp(value.sourceUpdatedAt, `${path}.sourceUpdatedAt`, issues);
  requireNonEmptyString(value.profileId, `${path}.profileId`, issues);
  requireNonEmptyString(value.username, `${path}.username`, issues);
  if (value.progressResetAt !== undefined) requireIsoTimestamp(value.progressResetAt, `${path}.progressResetAt`, issues);
  if (requirePositiveInteger(value.nextProgramDay, `${path}.nextProgramDay`, issues)
    && value.nextProgramDay > 5) {
    addIssue(issues, `${path}.nextProgramDay`, "legacy.program-day", "Expected a programme day from 1 to 5");
  }
  if (requireArray(value.history, `${path}.history`, issues)) {
    value.history.forEach((session, index) => {
      const sessionPath = `${path}.history[${index}]`;
      if (!requireRecord(session, sessionPath, issues)) return;
      rejectUnknownKeys(session, [
        "id", "completedAt", "day", "mode", "status", "seconds", "exerciseIds",
        "completedExerciseIds", "skippedExerciseIds", "skippedBlockIds", "level", "title",
        "lab", "advancesProgram", "exerciseReviews",
      ], sessionPath, issues);
      requireNonEmptyString(session.id, `${sessionPath}.id`, issues);
      requireIsoTimestamp(session.completedAt, `${sessionPath}.completedAt`, issues);
      if (session.day !== undefined) {
        const day = session.day;
        if (!Number.isSafeInteger(day) || (day as number) < 0 || (day as number) > 5) {
          addIssue(issues, `${sessionPath}.day`, "legacy.program-day", "Expected custom day 0 or a programme day from 1 to 5");
        }
      }
      if (session.mode !== undefined) requireNonEmptyString(session.mode, `${sessionPath}.mode`, issues);
      if (session.status !== undefined) requireEnum(session.status, ["complete", "modified", "partial"] as const, `${sessionPath}.status`, issues);
      if (session.seconds !== undefined) requireNonNegativeInteger(session.seconds, `${sessionPath}.seconds`, issues);
      for (const key of ["exerciseIds", "completedExerciseIds", "skippedExerciseIds", "skippedBlockIds"] as const) {
        if (session[key] !== undefined) validateNonEmptyStringArray(session[key], `${sessionPath}.${key}`, issues);
      }
      if (session.level !== undefined) requireNonEmptyString(session.level, `${sessionPath}.level`, issues);
      if (session.title !== undefined) requireNonEmptyString(session.title, `${sessionPath}.title`, issues);
      if (session.lab !== undefined && typeof session.lab !== "boolean") addIssue(issues, `${sessionPath}.lab`, "type.boolean", "Expected a boolean");
      if (session.advancesProgram !== undefined && typeof session.advancesProgram !== "boolean") addIssue(issues, `${sessionPath}.advancesProgram`, "type.boolean", "Expected a boolean");
      if (session.exerciseReviews !== undefined && requireRecord(session.exerciseReviews, `${sessionPath}.exerciseReviews`, issues)) {
        for (const [exerciseId, review] of Object.entries(session.exerciseReviews)) {
          const reviewPath = `${sessionPath}.exerciseReviews.${exerciseId}`;
          if (!requireRecord(review, reviewPath, issues)) continue;
          rejectUnknownKeys(review, ["feedback", "achieved"], reviewPath, issues);
          requireEnum(review.feedback, ["easy", "right", "hard"] as const, `${reviewPath}.feedback`, issues);
          if (typeof review.achieved !== "boolean") addIssue(issues, `${reviewPath}.achieved`, "type.boolean", "Expected a boolean");
        }
      }
    });
  }
  if (requireRecord(value.readinessClaims, `${path}.readinessClaims`, issues)) {
    for (const [gate, claimed] of Object.entries(value.readinessClaims)) {
      if (typeof claimed !== "boolean") addIssue(issues, `${path}.readinessClaims.${gate}`, "type.boolean", "Expected a Boolean legacy claim");
    }
  }
  if (requireRecord(value.readinessClaimUpdatedAt, `${path}.readinessClaimUpdatedAt`, issues)) {
    for (const [gate, timestamp] of Object.entries(value.readinessClaimUpdatedAt)) {
      requireIsoTimestamp(timestamp, `${path}.readinessClaimUpdatedAt.${gate}`, issues);
    }
  }
  if (requireRecord(value.progressionHints, `${path}.progressionHints`, issues)) {
    for (const [exerciseId, hint] of Object.entries(value.progressionHints)) {
      const hintPath = `${path}.progressionHints.${exerciseId}`;
      if (!requireRecord(hint, hintPath, issues)) continue;
      rejectUnknownKeys(hint, ["cleanSessions", "lastFeedback"], hintPath, issues);
      requireNonNegativeInteger(hint.cleanSessions, `${hintPath}.cleanSessions`, issues);
      if (hint.lastFeedback !== undefined) requireEnum(hint.lastFeedback, ["easy", "right", "hard"] as const, `${hintPath}.lastFeedback`, issues);
    }
  }
  validateNonEmptyStringArray(value.equipment, `${path}.equipment`, issues, false);
  requireRecord(value.preferences, `${path}.preferences`, issues);
  return finish(issues);
};

export const assertValid = (
  label: string,
  result: ValidationResult,
): void => {
  if (result.valid) return;
  const details = result.issues
    .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`)
    .join("\n");
  throw new Error(`${label} failed validation:\n${details}`);
};

// Compile-time checks that public validator targets remain aligned with the contracts.
void (undefined as unknown as AthleteEvidenceEvent);
void (undefined as unknown as AthleteIntent);
void (undefined as unknown as DefinitionBundle);
void (undefined as unknown as DerivedAthleteState);
void (undefined as unknown as SessionPlan);
void (undefined as unknown as SessionRecord);
void (undefined as unknown as LegacyV12CompatibilitySnapshot);
