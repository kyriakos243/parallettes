export const VNEXT_PRODUCTION_RELEASE_ID = "parallette25-vnext.1" as const;
export const VNEXT_PRODUCTION_BASE = "/parallettes/" as const;

export type ProductionApplicationAuthority = "vnext-production" | "inert";

/**
 * A production artifact has one coherent vNext authority. It never falls back
 * to legacy startup: a crossed build ID/base/path fails closed before any
 * profile, observation or application hook is mounted.
 */
export const selectProductionApplicationAuthority = (input: Readonly<{
  enabled: boolean;
  configuredReleaseId?: string;
  baseUrl: string;
  pathname: string;
}>): ProductionApplicationAuthority => input.enabled
  && input.configuredReleaseId === VNEXT_PRODUCTION_RELEASE_ID
  && input.baseUrl === VNEXT_PRODUCTION_BASE
  && input.pathname.startsWith(VNEXT_PRODUCTION_BASE)
  && !input.pathname.startsWith(`${VNEXT_PRODUCTION_BASE}vnext-rc/`)
  ? "vnext-production"
  : "inert";
