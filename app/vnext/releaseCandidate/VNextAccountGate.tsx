import { useEffect, useState, type FormEvent } from "react";
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  ACCOUNT_SESSION_STORAGE_KEY,
  type AccountSessionChangedDetail,
} from "../../accountSessionSignals";
import { isStableId, parseStableId, type AthleteId } from "../index";

export {
  ACCOUNT_SESSION_CHANGED_EVENT,
  ACCOUNT_SESSION_STORAGE_KEY,
  type AccountSessionChangedDetail,
};

export const VNEXT_RC_STORAGE_NAMESPACE = "vnext-rc";
const identityKey = (namespace: string) => `parallette25-${namespace}-identity-v1`;
const legacyAthleteKey = (namespace: string) => `parallette25-${namespace}-athlete-v1`;
const workflowPrefixes = (namespace: string) => [
  `parallette25-${namespace}-emphasis-v1:`,
  `parallette25-${namespace}-workout-recovery-v1:`,
  `parallette25-${namespace}-guided-recovery-v1:`,
  `parallette25-${namespace}-active-workout-v1:`,
] as const;

export type VNextRcIdentity = Readonly<{
  version: 1;
  athleteId: AthleteId;
  mode: "local" | "account";
  username?: string;
}>;

const accountBoundary = () => import("../../profileStore");

export const vNextCloudAccountAvailable = Boolean(
  (import.meta.env.VITE_PROFILE_API_URL as string | undefined)?.trim(),
);

const localIdentity = (athleteId = `vnext-rc-${crypto.randomUUID()}`): VNextRcIdentity => ({
  version: 1,
  athleteId: parseStableId("athlete", athleteId),
  mode: "local",
});

export const readVNextRcIdentity = (namespace = VNEXT_RC_STORAGE_NAMESPACE): VNextRcIdentity | undefined => {
  const identityStorageKey = identityKey(namespace);
  const legacyStorageKey = legacyAthleteKey(namespace);
  try {
    const parsed = JSON.parse(localStorage.getItem(identityStorageKey) ?? "null") as Partial<VNextRcIdentity> | null;
    if (parsed?.version === 1 && isStableId(parsed.athleteId)
      && (parsed.mode === "local" || parsed.mode === "account")
      && (parsed.mode !== "account" || typeof parsed.username === "string")) {
      if (parsed.mode === "account") localStorage.removeItem(legacyStorageKey);
      return parsed as VNextRcIdentity;
    }
  } catch { /* Fall through to the Phase 9 local identity. */ }
  const legacyLocal = localStorage.getItem(legacyStorageKey);
  return legacyLocal?.startsWith("vnext-rc-") && isStableId(legacyLocal)
    ? localIdentity(legacyLocal)
    : undefined;
};

export const persistVNextRcIdentity = (identity: VNextRcIdentity, namespace = VNEXT_RC_STORAGE_NAMESPACE): void => {
  const identityStorageKey = identityKey(namespace);
  const legacyStorageKey = legacyAthleteKey(namespace);
  localStorage.setItem(identityStorageKey, JSON.stringify(identity));
  // Retain the Phase 9 key only for its generated device-only athletes. An
  // account ID must never be recoverable through the legacy local fallback.
  if (identity.mode === "local") localStorage.setItem(legacyStorageKey, identity.athleteId);
  else localStorage.removeItem(legacyStorageKey);
};

export const validateVNextRcAccountIdentity = async (
  identity: VNextRcIdentity,
): Promise<"active" | "offline" | "invalid"> => identity.mode === "local"
  ? "active"
  : (await accountBoundary()).validateVNextAccountSession(identity.athleteId);

export const hasVNextRcAccountSession = async (
  identity: VNextRcIdentity,
): Promise<boolean> => identity.mode === "local"
  || (await accountBoundary()).hasVNextAccountSession(identity.athleteId);

export const clearVNextRcIdentity = (
  athleteId: AthleteId,
  namespace = VNEXT_RC_STORAGE_NAMESPACE,
): void => {
  for (const prefix of workflowPrefixes(namespace)) localStorage.removeItem(`${prefix}${athleteId}`);
  localStorage.removeItem(identityKey(namespace));
  localStorage.removeItem(legacyAthleteKey(namespace));
};

export type VNextLocalIdentityChoice = Readonly<{
  identity: VNextRcIdentity;
  label: string;
  detail: string;
}>;

export type VNextAccountGatePresentation = Readonly<{
  kicker: string;
  localHeading: string;
  localDetail: string;
  accountDetail: string;
  accountUnavailableDetail: string;
}>;

export type AccountGateProps = Readonly<{
  current?: VNextRcIdentity;
  onSelected: (identity: VNextRcIdentity) => void;
  onClose?: () => void;
  onSignedOut?: () => void;
  onResetProgress?: () => Promise<void>;
  localChoices?: readonly VNextLocalIdentityChoice[];
  presentation?: VNextAccountGatePresentation;
  storageNamespace?: string;
  shadowDatabaseName?: string;
}>;

const DEFAULT_PRESENTATION: VNextAccountGatePresentation = {
  kicker: "Parallette25 vNext RC.3",
  localHeading: "Use on this device",
  localDetail: "Works offline now. You can open a separate cloud athlete later.",
  accountDetail: "Use this device offline, or sign in for encrypted account access and observation sync.",
  accountUnavailableDetail: "Cloud accounts are not configured in this release-candidate build. Device-only training remains available offline.",
};

export const VNextAccountGate = ({
  current,
  onSelected,
  onClose,
  onSignedOut,
  onResetProgress,
  localChoices = [],
  presentation = DEFAULT_PRESENTATION,
  storageNamespace = VNEXT_RC_STORAGE_NAMESPACE,
  shadowDatabaseName,
}: AccountGateProps) => {
  const [mode, setMode] = useState<"sign-in" | "create" | "recover">("sign-in");
  const [username, setUsername] = useState(current?.username ?? "");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sessionActive, setSessionActive] = useState<boolean>();
  const [pendingRecovery, setPendingRecovery] = useState<Readonly<{
    identity: VNextRcIdentity;
    recoveryCode: string;
  }>>();
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    let active = true;
    if (current?.mode !== "account") {
      setSessionActive(false);
      return () => { active = false; };
    }
    void accountBoundary().then(({ hasVNextAccountSession }) => {
      if (active) setSessionActive(hasVNextAccountSession(current.athleteId));
    }).catch(() => {
      if (active) setSessionActive(false);
    });
    return () => { active = false; };
  }, [current]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const boundary = await accountBoundary();
      const result = mode === "recover"
        ? await boundary.recoverVNextAccount(username, recoveryCode, password)
        : mode === "create" && current?.mode === "local"
          ? await boundary.secureVNextLocalAthlete(current.athleteId, username, password)
          : mode === "create"
            ? await boundary.registerVNextAccount(username, password)
            : await boundary.signInVNextAccount(username, password);
      if (!isStableId(result.profileId)) throw new Error("The account returned an invalid athlete identity.");
      const identity: VNextRcIdentity = {
        version: 1,
        athleteId: parseStableId("athlete", result.profileId),
        mode: "account",
        username: result.username,
      };
      if (result.recoveryCode) {
        setPendingRecovery({ identity, recoveryCode: result.recoveryCode });
      } else {
        onSelected(identity);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    if (!current || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { signOutVNextAccount } = await accountBoundary();
      await signOutVNextAccount(current.athleteId, shadowDatabaseName);
      clearVNextRcIdentity(current.athleteId, storageNamespace);
      onSignedOut?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-out could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (!current?.username || !deletePassword || busy
      || !window.confirm("Permanently delete this cloud account and its synced observations? This cannot be undone.")) return;
    setBusy(true);
    setError(undefined);
    try {
      const { deleteVNextAccount } = await accountBoundary();
      await deleteVNextAccount(current.athleteId, current.username, deletePassword, shadowDatabaseName);
      clearVNextRcIdentity(current.athleteId, storageNamespace);
      onSignedOut?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account deletion could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  if (pendingRecovery) {
    return (
      <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-account-title">
        <section className="vnext-rc-modal vnext-account-card">
          <div>
            <p className="vnext-kicker">Cloud account created</p>
            <h1 id="vnext-account-title">Save your recovery code</h1>
            <p>This is the only way to recover the account if the password is lost. It is not included in observation exports.</p>
          </div>
          <output className="vnext-recovery-code" aria-label="Account recovery code">{pendingRecovery.recoveryCode}</output>
          <button type="button" className="vnext-submit" onClick={() => onSelected(pendingRecovery.identity)}>I saved it — open vNext</button>
        </section>
      </main>
    );
  }

  const signedInHere = current?.mode === "account" && sessionActive === true;
  if (signedInHere) {
    return (
      <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-account-title">
        <section className="vnext-rc-modal vnext-account-card">
          <div>
            <p className="vnext-kicker">Cloud sync</p>
            <h1 id="vnext-account-title">Signed in as {current.username}</h1>
            <p>Your account supplies identity and secure sync only. vNext observations remain separate from the v1.2 training profile.</p>
          </div>
          <div className="vnext-account-actions">
            {onClose && <button type="button" className="vnext-action" data-kind="secondary" onClick={onClose}>Done</button>}
            <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => void signOut()}>Sign out on this device</button>
          </div>
          {onResetProgress && <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={() => {
            if (!window.confirm("Reset training progress on every synced device? Account access and historical recovery safeguards remain.")) return;
            setBusy(true);
            setError(undefined);
            void onResetProgress().catch((reason) => {
              setError(reason instanceof Error ? reason.message : "Progress reset could not be completed.");
            }).finally(() => setBusy(false));
          }}>Reset training progress</button>}
          <details className="vnext-account-separation">
            <summary>Delete cloud account</summary>
            <label>Password<input type="password" minLength={10} maxLength={128} autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>
            <button type="button" className="vnext-action" data-kind="secondary" disabled={busy || deletePassword.length < 10} onClick={() => void deleteAccount()}>Permanently delete account</button>
          </details>
          {error && <p className="vnext-authority" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-account-title">
      <section className="vnext-rc-modal vnext-account-card">
        <div className="vnext-rc-modal-header">
          <div>
            <p className="vnext-kicker">{presentation.kicker}</p>
            <h1 id="vnext-account-title">Choose where to keep your progress</h1>
            <p>{presentation.accountDetail}</p>
          </div>
          {onClose && <button type="button" className="vnext-action" data-kind="secondary" onClick={onClose}>Close</button>}
        </div>

        {!current && localChoices.map((choice) => (
          <button
            key={`${choice.identity.mode}:${choice.identity.athleteId}`}
            type="button"
            className="vnext-account-local"
            onClick={() => onSelected(choice.identity)}
          >
            <strong>{choice.label}</strong>
            <span>{choice.detail}</span>
          </button>
        ))}

        {!current && (
          <button type="button" className="vnext-account-local" onClick={() => onSelected(localIdentity())}>
            <strong>{presentation.localHeading}</strong>
            <span>{presentation.localDetail}</span>
          </button>
        )}

        {current?.mode === "local" && (
          <p className="vnext-account-separation">Set up sync to keep this same athlete ID and its observations. Signing in to a different account still opens that account separately.</p>
        )}

        {vNextCloudAccountAvailable ? (
          <form className="vnext-account-form" onSubmit={(event) => void submit(event)}>
            <div className="vnext-account-tabs" role="group" aria-label="Account action">
              <button type="button" aria-pressed={mode === "sign-in"} onClick={() => setMode("sign-in")}>Sign in</button>
              <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>{current?.mode === "local" ? "Set up sync" : "Create account"}</button>
              <button type="button" aria-pressed={mode === "recover"} onClick={() => setMode("recover")}>Recover</button>
            </div>
            <label>Username<input required minLength={2} maxLength={32} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            {mode === "recover" && <label>Recovery code<input required autoComplete="off" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} /></label>}
            <label>{mode === "recover" ? "New password" : "Password"}<input required minLength={10} maxLength={128} type="password" autoComplete={mode === "create" || mode === "recover" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button type="submit" className="vnext-submit" disabled={busy}>{busy ? "Please wait…" : mode === "recover" ? "Recover account" : mode === "create" ? current?.mode === "local" ? "Secure this athlete" : "Create secure account" : "Sign in"}</button>
            {error && <p className="vnext-authority" role="alert">{error}</p>}
          </form>
        ) : (
          <p className="vnext-account-separation">{presentation.accountUnavailableDetail}</p>
        )}
      </section>
    </main>
  );
};
