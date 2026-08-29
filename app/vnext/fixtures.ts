/**
 * Small representative fixtures for the Phase 1 domain contract.
 *
 * These are contract examples, not the Phase 2 skill catalogue. They stay
 * intentionally small while exercising cross-family references, capacities,
 * benchmarks, both prerequisite operators, observations, and plan/record
 * ownership.
 */

import {
  DOMAIN_SCHEMA_VERSION,
  parseDefinitionVersion,
  parseProjectionVersion,
  parseStableId,
  type AthleteEvidenceEvent,
  type AthleteIntent,
  type BenchmarkProtocol,
  type CapacityDefinition,
  type DefinitionBundle,
  type DerivedAthleteState,
  type DevelopmentGraph,
  type ExerciseDefinition,
  type SessionPlan,
  type SessionRecord,
} from "./contracts";
import {
  captureLegacyV12CompatibilitySnapshot,
  type LegacyV12ProfileSource,
} from "./legacyV12";

const definitionVersion = parseDefinitionVersion(1);
const projectionVersion = parseProjectionVersion(1);

export const fixtureIds = {
  athlete: parseStableId("athlete", "athlete-fixture"),
  equipment: {
    floor: parseStableId("equipment", "floor"),
    parallettes: parseStableId("equipment", "parallettes"),
  },
  graphs: {
    support: parseStableId("graph", "support-foundation"),
    compression: parseStableId("graph", "l-sit-compression"),
  },
  nodes: {
    stableSupport: parseStableId("node", "stable-support"),
    tuckSupport: parseStableId("node", "tuck-support"),
    lSit: parseStableId("node", "l-sit"),
  },
  capacity: parseStableId("capacity", "active-compression"),
  facet: parseStableId("capacity-facet", "straight-leg-access"),
  exercises: {
    supportHold: parseStableId("exercise", "support-hold"),
    tuckSupport: parseStableId("exercise", "tuck-support"),
    compressionPulse: parseStableId("exercise", "seated-pike-compression-pulses"),
    fullLSit: parseStableId("exercise", "full-lsit-attempt"),
  },
  prescriptions: {
    supportHold: parseStableId("prescription", "support-hold-standard"),
    tuckSupport: parseStableId("prescription", "tuck-support-standard"),
    compressionPulse: parseStableId("prescription", "compression-pulse-standard"),
    fullLSit: parseStableId("prescription", "full-l-sit-attempts"),
  },
  benchmarks: {
    stableSupport: parseStableId("benchmark", "stable-support-hold"),
    tuckSupport: parseStableId("benchmark", "tuck-support-hold"),
    compression: parseStableId("benchmark", "straight-leg-compression"),
    lSit: parseStableId("benchmark", "full-l-sit-quality"),
  },
  plan: parseStableId("session-plan", "plan-fixture-001"),
  record: parseStableId("session-record", "record-fixture-001"),
  observationSession: parseStableId("observation-session", "test-fixture-001"),
  planItems: {
    preparation: parseStableId("plan-item", "item-preparation"),
    primary: parseStableId("plan-item", "item-primary"),
  },
  policy: parseStableId("policy", "vnext-generator"),
  events: {
    performance: parseStableId("event", "event-performance-001"),
    restriction: parseStableId("event", "event-restriction-001"),
    clearance: parseStableId("event", "event-clearance-001"),
    legacy: parseStableId("event", "event-legacy-001"),
    correction: parseStableId("event", "event-correction-001"),
    assessment: parseStableId("event", "event-assessment-import-001"),
  },
} as const;

const supportHoldExercise = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.exercises.supportHold,
  definitionVersion,
  lifecycle: "active",
  name: "Support Hold",
  description: "A tall, controlled parallette support.",
  instructions: {
    how: "Press the bars down and hold a stable support with long elbows.",
    cues: ["Push tall", "Keep the ribs controlled"],
    avoid: ["Collapsing into the shoulders"],
  },
  media: [],
  equipment: [fixtureIds.equipment.parallettes, fixtureIds.equipment.floor],
  roles: ["outcome-milestone", "benchmark-test"],
  graphLinks: [{
    graphId: fixtureIds.graphs.support,
    nodeId: fixtureIds.nodes.stableSupport,
    contribution: "milestone",
  }],
  capacityLinks: [],
  prescriptionVariants: [{
    id: fixtureIds.prescriptions.supportHold,
    label: "Controlled hold",
    target: { kind: "duration-seconds", minimum: 15, maximum: 30 },
    demand: {
      "hand-wrist-bearing": "moderate",
      "forward-straight-arm-upper-limb": "moderate",
      "compression-trunk": "low",
    },
  }],
  benchmarkProtocolIds: [fixtureIds.benchmarks.stableSupport],
  relations: [],
  safetyNotes: ["Stop if hand, wrist, elbow, or shoulder symptoms appear."],
} as const satisfies ExerciseDefinition;

const tuckSupportExercise = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.exercises.tuckSupport,
  definitionVersion,
  lifecycle: "active",
  name: "Tuck Support",
  description: "A compact supported tuck with the feet clear.",
  instructions: {
    how: "Press tall, draw the knees toward the chest, and float the feet.",
    cues: ["Stay tall through the shoulders", "Keep the knees compact"],
  },
  media: [],
  equipment: [fixtureIds.equipment.parallettes, fixtureIds.equipment.floor],
  roles: ["outcome-milestone", "development-drill", "benchmark-test"],
  graphLinks: [{
    graphId: fixtureIds.graphs.compression,
    nodeId: fixtureIds.nodes.tuckSupport,
    contribution: "milestone",
  }],
  capacityLinks: [{
    capacityId: fixtureIds.capacity,
    facetIds: [fixtureIds.facet],
  }],
  prescriptionVariants: [{
    id: fixtureIds.prescriptions.tuckSupport,
    label: "Controlled tuck hold",
    target: { kind: "duration-seconds", minimum: 8, maximum: 20 },
    demand: {
      "hand-wrist-bearing": "moderate",
      "forward-straight-arm-upper-limb": "moderate",
      "compression-trunk": "moderate",
    },
  }],
  benchmarkProtocolIds: [fixtureIds.benchmarks.tuckSupport],
  relations: [{
    kind: "regression",
    targetExerciseId: fixtureIds.exercises.supportHold,
    fromPrescriptionVariantId: fixtureIds.prescriptions.tuckSupport,
    targetPrescriptionVariantId: fixtureIds.prescriptions.supportHold,
  }],
  safetyNotes: ["Use foot assistance if the support position loses control."],
} as const satisfies ExerciseDefinition;

const compressionPulseExercise = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.exercises.compressionPulse,
  definitionVersion,
  lifecycle: "active",
  name: "Seated Pike Compression Pulses",
  description: "Straight-leg compression practice from a seated pike.",
  instructions: {
    how: "Sit tall and lift the heels without forcing spinal range.",
    cues: ["Keep the knees straight", "Lift from the hips"],
  },
  media: [],
  equipment: [fixtureIds.equipment.floor],
  roles: ["capacity-accessory", "benchmark-test"],
  graphLinks: [{
    graphId: fixtureIds.graphs.compression,
    contribution: "development",
  }],
  capacityLinks: [{
    capacityId: fixtureIds.capacity,
    facetIds: [fixtureIds.facet],
  }],
  prescriptionVariants: [{
    id: fixtureIds.prescriptions.compressionPulse,
    label: "Straight-leg pulses",
    target: { kind: "repetitions", minimum: 8, maximum: 12 },
    demand: { "compression-trunk": "moderate" },
  }],
  benchmarkProtocolIds: [fixtureIds.benchmarks.compression],
  relations: [],
  safetyNotes: ["Shorten the range if the back or hamstrings feel strained."],
} as const satisfies ExerciseDefinition;

const fullLSitExercise = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.exercises.fullLSit,
  definitionVersion,
  lifecycle: "active",
  name: "Full L-Sit Attempt",
  description: "A controlled straight-leg L-sit attempt on parallettes.",
  instructions: {
    how: "Press tall and extend both legs only while the support stays stable.",
    cues: ["Keep the elbows long", "Own the available range"],
  },
  media: [],
  equipment: [fixtureIds.equipment.parallettes, fixtureIds.equipment.floor],
  roles: ["outcome-milestone", "benchmark-test"],
  graphLinks: [{
    graphId: fixtureIds.graphs.compression,
    nodeId: fixtureIds.nodes.lSit,
    contribution: "milestone",
  }],
  capacityLinks: [{
    capacityId: fixtureIds.capacity,
    facetIds: [fixtureIds.facet],
  }],
  prescriptionVariants: [{
    id: fixtureIds.prescriptions.fullLSit,
    label: "Quality attempts",
    target: { kind: "attempts", minimum: 3, maximum: 5 },
    demand: {
      "hand-wrist-bearing": "high",
      "forward-straight-arm-upper-limb": "high",
      "compression-trunk": "high",
    },
  }],
  benchmarkProtocolIds: [fixtureIds.benchmarks.lSit],
  relations: [{
    kind: "regression",
    targetExerciseId: fixtureIds.exercises.tuckSupport,
    fromPrescriptionVariantId: fixtureIds.prescriptions.fullLSit,
    targetPrescriptionVariantId: fixtureIds.prescriptions.tuckSupport,
  }],
  safetyNotes: ["Return to a supported tuck before shoulder position degrades."],
} as const satisfies ExerciseDefinition;

const supportGraph = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.graphs.support,
  definitionVersion,
  kind: "foundation-track",
  label: "Support Foundation",
  description: "Shared support control used by several outcome families.",
  branches: [{
    id: parseStableId("branch", "support"),
    label: "Support",
    description: "Tall straight-arm support control.",
  }],
  nodes: [{
    id: fixtureIds.nodes.stableSupport,
    branchId: parseStableId("branch", "support"),
    label: "Stable support",
    description: "Sustains an organised parallette support.",
    progressionTier: "foundation",
    programmingBoundary: "automatic",
    implementationStatus: "available",
    benchmarkProtocolIds: [fixtureIds.benchmarks.stableSupport],
  }],
} as const satisfies DevelopmentGraph;

const compressionGraph = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.graphs.compression,
  definitionVersion,
  kind: "outcome-family",
  label: "L-Sit Compression",
  description: "Support-and-compression development toward a full L-sit.",
  branches: [{
    id: parseStableId("branch", "support"),
    label: "Support",
    description: "Compact support foundations.",
  }, {
    id: parseStableId("branch", "long-leg"),
    label: "Long-leg",
    description: "Straight-leg L-sit outcomes.",
  }],
  nodes: [{
    id: fixtureIds.nodes.tuckSupport,
    branchId: parseStableId("branch", "support"),
    label: "Tuck support",
    description: "Floats both feet in a compact support.",
    progressionTier: "foundation",
    programmingBoundary: "automatic",
    implementationStatus: "available",
    prerequisiteRule: {
      allOf: [{
        kind: "milestone",
        milestone: {
          graphId: fixtureIds.graphs.support,
          nodeId: fixtureIds.nodes.stableSupport,
        },
      }],
    },
    benchmarkProtocolIds: [fixtureIds.benchmarks.tuckSupport],
  }, {
    id: fixtureIds.nodes.lSit,
    branchId: parseStableId("branch", "long-leg"),
    label: "Full L-sit",
    description: "Sustains a straight-leg L-sit with controlled support.",
    progressionTier: "advanced",
    programmingBoundary: "stronger-gated",
    implementationStatus: "available",
    prerequisiteRule: {
      allOf: [{
        kind: "milestone",
        milestone: {
          graphId: fixtureIds.graphs.compression,
          nodeId: fixtureIds.nodes.tuckSupport,
        },
      }],
      anyOf: [{
        kind: "capacity-facet",
        capacity: {
          capacityId: fixtureIds.capacity,
          facetId: fixtureIds.facet,
        },
      }, {
        kind: "benchmark",
        benchmarkProtocolId: fixtureIds.benchmarks.compression,
      }],
    },
    benchmarkProtocolIds: [fixtureIds.benchmarks.lSit],
  }],
} as const satisfies DevelopmentGraph;

const compressionCapacity = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.capacity,
  definitionVersion,
  label: "Active compression",
  description: "Shared active hip-flexion and trunk-control capacity.",
  facets: [{
    id: fixtureIds.facet,
    label: "Straight-leg access",
    description: "Actively lifts straight legs through the available range.",
    benchmarkProtocolIds: [fixtureIds.benchmarks.compression],
  }],
  sharedGraphIds: [fixtureIds.graphs.compression, fixtureIds.graphs.support],
} as const satisfies CapacityDefinition;

const benchmarkProtocols = [{
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.benchmarks.stableSupport,
  definitionVersion,
  label: "Stable support hold",
  subject: {
    kind: "milestone",
    milestone: {
      graphId: fixtureIds.graphs.support,
      nodeId: fixtureIds.nodes.stableSupport,
    },
  },
  exerciseId: fixtureIds.exercises.supportHold,
  prescriptionVariantId: fixtureIds.prescriptions.supportHold,
  conditions: {
    equipment: [parseStableId("equipment", "parallettes")],
    assistance: "No assistance beyond the named supported setup.",
    range: "Tall support with both feet clear of the floor.",
  },
  metric: { kind: "duration-seconds", minimum: 15 },
  qualityCriteria: ["Elbows remain long", "Shoulders remain actively supported"],
  safetyCriteria: ["No pain or uncontrolled collapse"],
  confirmation: {
    qualifyingObservations: 2,
    minimumDistinctSessions: 2,
    allowedSources: ["guided-test", "session-record"],
    freshnessDays: 90,
  },
}, {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.benchmarks.tuckSupport,
  definitionVersion,
  label: "Tuck support hold",
  subject: {
    kind: "milestone",
    milestone: {
      graphId: fixtureIds.graphs.compression,
      nodeId: fixtureIds.nodes.tuckSupport,
    },
  },
  exerciseId: fixtureIds.exercises.tuckSupport,
  prescriptionVariantId: fixtureIds.prescriptions.tuckSupport,
  conditions: {
    equipment: [parseStableId("equipment", "parallettes")],
    assistance: "No external assistance.",
    range: "Both feet clear in the authored tuck-support position.",
  },
  metric: { kind: "duration-seconds", minimum: 8 },
  qualityCriteria: ["Both feet remain clear", "Support position remains organised"],
  safetyCriteria: ["No symptom or uncontrolled exit"],
  confirmation: {
    qualifyingObservations: 2,
    minimumDistinctSessions: 2,
    allowedSources: ["guided-test", "session-record"],
  },
}, {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.benchmarks.compression,
  definitionVersion,
  label: "Straight-leg compression access",
  subject: {
    kind: "capacity-facet",
    capacity: {
      capacityId: fixtureIds.capacity,
      facetId: fixtureIds.facet,
    },
  },
  exerciseId: fixtureIds.exercises.compressionPulse,
  prescriptionVariantId: fixtureIds.prescriptions.compressionPulse,
  conditions: {
    equipment: [parseStableId("equipment", "floor")],
    assistance: "No external assistance.",
    range: "Straight legs lift from and return to the floor under control.",
  },
  metric: { kind: "repetitions", minimum: 8 },
  qualityCriteria: ["Knees remain straight", "Repetitions use active control"],
  safetyCriteria: ["Range remains symptom-free"],
  confirmation: {
    qualifyingObservations: 1,
    minimumDistinctSessions: 1,
    allowedSources: ["guided-test", "session-record"],
  },
}, {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.benchmarks.lSit,
  definitionVersion,
  label: "Full L-sit quality",
  subject: {
    kind: "milestone",
    milestone: {
      graphId: fixtureIds.graphs.compression,
      nodeId: fixtureIds.nodes.lSit,
    },
  },
  exerciseId: fixtureIds.exercises.fullLSit,
  prescriptionVariantId: fixtureIds.prescriptions.fullLSit,
  conditions: {
    equipment: [parseStableId("equipment", "parallettes")],
    assistance: "No foot, band or spotter assistance.",
    range: "Both heels remain clear at or above bar height in a full L shape.",
  },
  metric: { kind: "quality", description: "Controlled straight-leg position" },
  qualityCriteria: ["Both knees remain straight", "Shoulder support remains stable"],
  safetyCriteria: ["Exit is controlled and symptom-free"],
  confirmation: {
    qualifyingObservations: 2,
    minimumDistinctSessions: 2,
    allowedSources: ["guided-test", "session-record"],
  },
}] as const satisfies readonly BenchmarkProtocol[];

export const representativeDefinitionBundle = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  catalogueVersion: definitionVersion,
  exercises: [
    supportHoldExercise,
    tuckSupportExercise,
    compressionPulseExercise,
    fullLSitExercise,
  ],
  graphs: [supportGraph, compressionGraph],
  capacities: [compressionCapacity],
  benchmarkProtocols,
} as const satisfies DefinitionBundle;

const evidenceBase = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  athleteId: fixtureIds.athlete,
  occurredAt: "2026-08-18T08:00:00.000Z",
  recordedAt: "2026-08-18T08:00:01.000Z",
  catalogueVersion: definitionVersion,
} as const;

export const representativeEvidenceEvents = [{
  ...evidenceBase,
  id: fixtureIds.events.performance,
  type: "performance_observed",
  source: "guided-test",
  subject: {
    kind: "milestone",
    milestone: {
      graphId: fixtureIds.graphs.support,
      nodeId: fixtureIds.nodes.stableSupport,
    },
  },
  outcome: "clean",
  benchmarkProtocolId: fixtureIds.benchmarks.stableSupport,
  benchmarkProtocolVersion: definitionVersion,
  observationSessionId: fixtureIds.observationSession,
  measurement: { value: 20, unit: "seconds" },
  perceivedExertion: 6,
}, {
  ...evidenceBase,
  id: fixtureIds.events.restriction,
  type: "restriction_reported",
  source: "athlete-report",
  severity: "modify",
  demandDomains: ["hand-wrist-bearing"],
  bodyRegions: ["right wrist"],
}, {
  ...evidenceBase,
  id: fixtureIds.events.clearance,
  type: "restriction_cleared",
  source: "athlete-report",
  restrictionEventId: fixtureIds.events.restriction,
}, {
  ...evidenceBase,
  id: fixtureIds.events.legacy,
  type: "legacy_claim_imported",
  source: "migration",
  sourceVersion: "1.2",
  claim: {
    kind: "readiness-gate",
    legacyGateId: "G1",
    claimed: true,
  },
}, {
  ...evidenceBase,
  id: fixtureIds.events.correction,
  type: "evidence_corrected",
  source: "correction",
  supersedesEventId: fixtureIds.events.performance,
  reason: "The observation was assigned to the wrong athlete session.",
}, {
  ...evidenceBase,
  id: fixtureIds.events.assessment,
  type: "performance_observed",
  source: "migration",
  subject: {
    kind: "milestone",
    milestone: {
      graphId: fixtureIds.graphs.compression,
      nodeId: fixtureIds.nodes.tuckSupport,
    },
  },
  outcome: "partial",
  legacySourceVersion: "1.2",
  legacySourceReference: "preferences.startingAssessment",
  notes: "Provisional placement only; not confirmation evidence.",
}] as const satisfies readonly AthleteEvidenceEvent[];

export const representativeAthleteIntent = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  athleteId: fixtureIds.athlete,
  updatedAt: "2026-08-18T08:05:00.000Z",
  goals: [{
    graphId: fixtureIds.graphs.compression,
    targetNodeId: fixtureIds.nodes.lSit,
    priority: "primary",
  }],
  emphasisOverride: {
    primaryGraphId: fixtureIds.graphs.compression,
    secondaryGraphId: fixtureIds.graphs.support,
  },
  equipment: [fixtureIds.equipment.parallettes, fixtureIds.equipment.floor],
  defaultSessionDemand: "standard",
  preferences: {
    preferredDurationMinutes: 25,
    specialistOptIn: false,
  },
} as const satisfies AthleteIntent;

export const representativeSessionPlan = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.plan,
  athleteId: fixtureIds.athlete,
  createdAt: "2026-08-18T08:10:00.000Z",
  catalogueVersion: definitionVersion,
  generatorPolicyId: fixtureIds.policy,
  generatorPolicyVersion: definitionVersion,
  definitionReferences: [{
    kind: "exercise",
    id: fixtureIds.exercises.supportHold,
    version: definitionVersion,
  }, {
    kind: "exercise",
    id: fixtureIds.exercises.tuckSupport,
    version: definitionVersion,
  }, {
    kind: "graph",
    id: fixtureIds.graphs.compression,
    version: definitionVersion,
  }, {
    kind: "benchmark",
    id: fixtureIds.benchmarks.stableSupport,
    version: definitionVersion,
  }, {
    kind: "policy",
    id: fixtureIds.policy,
    version: definitionVersion,
  }],
  intendedDurationSeconds: 600,
  items: [{
    id: fixtureIds.planItems.preparation,
    exerciseId: fixtureIds.exercises.supportHold,
    exerciseDefinitionVersion: definitionVersion,
    prescriptionVariantId: fixtureIds.prescriptions.supportHold,
    benchmarkProtocolId: fixtureIds.benchmarks.stableSupport,
    benchmarkProtocolVersion: definitionVersion,
    purpose: "preparation",
    plannedSeconds: 240,
    demand: {
      "hand-wrist-bearing": "moderate",
      "forward-straight-arm-upper-limb": "moderate",
    },
  }, {
    id: fixtureIds.planItems.primary,
    exerciseId: fixtureIds.exercises.tuckSupport,
    exerciseDefinitionVersion: definitionVersion,
    prescriptionVariantId: fixtureIds.prescriptions.tuckSupport,
    purpose: "primary-development",
    plannedSeconds: 360,
    targetMilestone: {
      graphId: fixtureIds.graphs.compression,
      nodeId: fixtureIds.nodes.tuckSupport,
    },
    demand: {
      "hand-wrist-bearing": "moderate",
      "forward-straight-arm-upper-limb": "moderate",
      "compression-trunk": "moderate",
    },
  }],
  rationale: [{
    code: parseStableId("reason", "primary-goal-development"),
    message: "Develop the athlete-selected L-sit goal from the current working node.",
    relatedGraphId: fixtureIds.graphs.compression,
  }],
} as const satisfies SessionPlan;

export const representativeSessionRecord = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  id: fixtureIds.record,
  athleteId: fixtureIds.athlete,
  planId: fixtureIds.plan,
  startedAt: "2026-08-18T08:15:00.000Z",
  completedAt: "2026-08-18T08:25:00.000Z",
  recordedAt: "2026-08-18T08:25:00.000Z",
  status: "modified",
  itemOutcomes: [{
    planItemId: fixtureIds.planItems.preparation,
    status: "completed",
    participationSeconds: 240,
    benchmarkObservation: {
      subject: {
        kind: "milestone",
        milestone: {
          graphId: fixtureIds.graphs.support,
          nodeId: fixtureIds.nodes.stableSupport,
        },
      },
      benchmarkProtocolId: fixtureIds.benchmarks.stableSupport,
      benchmarkProtocolVersion: definitionVersion,
      outcome: "clean",
      measurement: { value: 20, unit: "seconds" },
      perceivedExertion: 6,
    },
    review: { outcome: "clean", difficulty: "right" },
  }, {
    planItemId: fixtureIds.planItems.primary,
    status: "modified",
    participationSeconds: 300,
    performedExerciseId: fixtureIds.exercises.supportHold,
    performedExerciseDefinitionVersion: definitionVersion,
    performedPrescriptionVariantId: fixtureIds.prescriptions.supportHold,
    review: { outcome: "partial", difficulty: "hard" },
  }],
} as const satisfies SessionRecord;

export const representativeDerivedAthleteState = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  athleteId: fixtureIds.athlete,
  projectionVersion,
  asOf: "2026-08-18T08:30:00.000Z",
  observationCursors: {
    evidenceEvents: fixtureIds.events.correction,
    sessionRecords: fixtureIds.record,
  },
  nodeStates: [{
    milestone: {
      graphId: fixtureIds.graphs.support,
      nodeId: fixtureIds.nodes.stableSupport,
    },
    lifecycle: "demonstrated",
    confidence: "current",
    satisfiedForEligibilityBy: [],
    supportingObservationRefs: [{
      kind: "session-item",
      sessionRecordId: fixtureIds.record,
      planItemId: fixtureIds.planItems.preparation,
    }],
    reasonCodes: [parseStableId("reason", "evidence-demonstrated")],
  }],
  capacityFindings: [{
    capacity: {
      capacityId: fixtureIds.capacity,
      facetId: fixtureIds.facet,
    },
    finding: "estimated",
    confirmationSatisfied: false,
    confidence: "unknown",
    supportingObservationRefs: [{
      kind: "session-item",
      sessionRecordId: fixtureIds.record,
      planItemId: fixtureIds.planItems.primary,
    }],
    reasonCodes: [parseStableId("reason", "evidence-estimated")],
  }],
  activeRestrictions: [],
  reconfirmationRequirements: [{
    source: { kind: "evidence-event", eventId: fixtureIds.events.restriction },
    triggeredBy: { kind: "evidence-event", eventId: fixtureIds.events.clearance },
    requiredSince: "2026-08-17T10:00:00.000Z",
    demandDomains: ["hand-wrist-bearing"],
    reasonCodes: [parseStableId("reason", "post-clearance-reconfirmation")],
  }],
  recentLoad: {
    from: "2026-08-11T08:30:00.000Z",
    to: "2026-08-18T08:30:00.000Z",
    demand: {
      "hand-wrist-bearing": "moderate",
      "forward-straight-arm-upper-limb": "moderate",
      "compression-trunk": "low",
    },
    exposures: [{
      source: {
        kind: "session-item",
        sessionRecordId: fixtureIds.record,
        planItemId: fixtureIds.planItems.preparation,
      },
      occurredAt: "2026-08-18T08:25:00.000Z",
      participationSeconds: 240,
      demand: {
        "hand-wrist-bearing": "moderate",
        "forward-straight-arm-upper-limb": "moderate",
        "compression-trunk": "low",
      },
    }],
  },
  workingNodes: [{
    milestone: {
      graphId: fixtureIds.graphs.compression,
      nodeId: fixtureIds.nodes.tuckSupport,
    },
    reasonCodes: [parseStableId("reason", "eligible-frontier")],
  }],
  maintenanceNeeds: [{
    milestone: {
      graphId: fixtureIds.graphs.support,
      nodeId: fixtureIds.nodes.stableSupport,
    },
    reasonCodes: [parseStableId("reason", "maintenance-due")],
  }],
  eligibleTargets: [{
    milestone: {
      graphId: fixtureIds.graphs.compression,
      nodeId: fixtureIds.nodes.tuckSupport,
    },
    reasonCodes: [parseStableId("reason", "eligible-frontier")],
  }],
  trainabilityEvaluations: [{
    exerciseId: fixtureIds.exercises.tuckSupport,
    exerciseDefinitionVersion: definitionVersion,
    prescriptionVariantId: fixtureIds.prescriptions.tuckSupport,
    decision: "modify",
    reasonCodes: [parseStableId("reason", "active-wrist-restriction")],
    safeAlternative: {
      exerciseId: fixtureIds.exercises.supportHold,
      exerciseDefinitionVersion: definitionVersion,
      prescriptionVariantId: fixtureIds.prescriptions.supportHold,
    },
  }],
  recommendedEmphasis: {
    primaryGraphId: fixtureIds.graphs.compression,
    secondaryGraphId: fixtureIds.graphs.support,
    reasonCodes: [parseStableId("reason", "goal-priority")],
  },
} as const satisfies DerivedAthleteState;

export const representativeLegacyV12Profile = {
  profileId: "legacy-profile-001",
  username: "fixture-athlete",
  schemaVersion: 1,
  revision: 4,
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-08-18T08:00:00.000Z",
  progressResetAt: "2026-08-01T08:00:00.000Z",
  nextProgramDay: 3,
  history: [{
    id: "legacy-session-001",
    completedAt: "2026-08-10T08:25:00.000Z",
    day: 2,
    status: "complete",
    seconds: 1500,
    completedExerciseIds: ["support-hold", "tuck-support"],
  }],
  readiness: { G1: true, G6: true },
  readinessUpdatedAt: {
    G1: "2026-08-02T08:00:00.000Z",
    G6: "2026-08-02T08:00:00.000Z",
  },
  progression: {
    "support-hold": { cleanSessions: 2, lastFeedback: "right" },
  },
  equipment: ["parallettes", "floor"],
  preferences: {
    startingAssessment: { suggestedLevel: "L2" },
    soundEnabled: true,
  },
} as const satisfies LegacyV12ProfileSource;

export const representativeLegacyV12Snapshot =
  captureLegacyV12CompatibilitySnapshot(representativeLegacyV12Profile);
