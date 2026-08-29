export const ACCOUNT_SESSION_STORAGE_KEY = "parallette25-account-sessions-v1";
export const ACCOUNT_SESSION_CHANGED_EVENT = "parallette25:account-session-changed";

export type AccountSessionChangedDetail = Readonly<{
  profileId: string;
  active: boolean;
}>;

export const announceAccountSessionChange = (
  detail: AccountSessionChangedDetail,
): void => {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent<AccountSessionChangedDetail>(
    ACCOUNT_SESSION_CHANGED_EVENT,
    { detail },
  ));
};
