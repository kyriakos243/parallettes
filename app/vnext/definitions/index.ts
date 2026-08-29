import { DOMAIN_SCHEMA_VERSION, type DefinitionBundle } from "../contracts";
import { benchmarkProtocols } from "./benchmarks";
import { capacityDefinitions } from "./capacities";
import { exerciseDefinitions } from "./catalogue";
import { developmentGraphs } from "./graphs";
import {
  VNEXT_CATALOGUE_VERSION,
  VNEXT_PHASE2_CATALOGUE_VERSION,
} from "./ids";
import {
  currentBenchmarkProtocols,
  currentDevelopmentGraphs,
  currentExerciseDefinitions,
} from "./phase7Content";

export * from "./benchmarks";
export * from "./capacities";
export * from "./catalogue";
export * from "./graphs";
export * from "./ids";
export * from "./missingBridges";
export * from "./phase7Content";
export * from "./phase7Media";

/** Exact immutable definition bundle used by completed Phases 2–6. */
export const vNextDefinitionBundleV1 = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  catalogueVersion: VNEXT_PHASE2_CATALOGUE_VERSION,
  exercises: exerciseDefinitions,
  graphs: developmentGraphs,
  capacities: capacityDefinitions,
  benchmarkProtocols,
} as const satisfies DefinitionBundle;

/** Current additive catalogue; no live v1.2 application path imports it. */
export const vNextDefinitionBundle = {
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  catalogueVersion: VNEXT_CATALOGUE_VERSION,
  exercises: currentExerciseDefinitions,
  graphs: currentDevelopmentGraphs,
  capacities: capacityDefinitions,
  benchmarkProtocols: currentBenchmarkProtocols,
} as const satisfies DefinitionBundle;

/** Oldest-to-newest immutable history required for deterministic replay. */
export const vNextDefinitionBundles = [
  vNextDefinitionBundleV1,
  vNextDefinitionBundle,
] as const satisfies readonly DefinitionBundle[];
