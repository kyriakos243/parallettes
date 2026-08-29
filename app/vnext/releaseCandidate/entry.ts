export const VNEXT_RELEASE_CANDIDATE_ID = "parallette25-vnext-rc.3" as const;
export const VNEXT_RELEASE_CANDIDATE_BASE = "/parallettes/vnext-rc/" as const;

export type ApplicationAuthority = "v1.2" | "vnext-rc";

/**
 * The release-candidate branch needs both a build-time cohort grant and an
 * exact request. A URL alone can never activate vNext in an ordinary build.
 */
export const selectApplicationAuthority = (input: Readonly<{
  enabled: boolean;
  configuredReleaseCandidateId?: string;
  baseUrl: string;
  pathname: string;
  search: string;
}>): ApplicationAuthority => {
  if (!input.enabled
    || input.configuredReleaseCandidateId !== VNEXT_RELEASE_CANDIDATE_ID
    || input.baseUrl !== VNEXT_RELEASE_CANDIDATE_BASE
    || !input.pathname.startsWith(VNEXT_RELEASE_CANDIDATE_BASE)) {
    return "v1.2";
  }
  const requested = new URLSearchParams(input.search).get("experience");
  return requested === VNEXT_RELEASE_CANDIDATE_ID ? "vnext-rc" : "v1.2";
};
