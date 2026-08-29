import { useEffect, useMemo, useState } from "react";
import { isStableId, parseStableId, type VNextShadowStore } from "../index";
import {
  VNextAccountGate,
  type AccountGateProps,
  type VNextLocalIdentityChoice,
  type VNextRcIdentity,
} from "../releaseCandidate/VNextAccountGate";
import {
  VNextReleaseCandidateApp,
  type VNextApplicationDeployment,
} from "../releaseCandidate/VNextReleaseCandidateApp";
import type { VNextRuntime } from "../releaseCandidate/runtime";
import { shouldApplyProductionLegacyConversion } from "./migrationPolicy";

const PRODUCTION_PRESENTATION = {
  kicker: "Parallette25",
  localHeading: "Start fresh on this device",
  localDetail: "Creates a new offline athlete. Existing Parallette25 profiles are offered above when available.",
  accountDetail: "Continue an existing athlete on this device, or sign in for secure observation sync.",
  accountUnavailableDetail: "Cloud accounts are unavailable in this deployment. Device-only training remains available offline.",
} as const;
const PRODUCTION_STORAGE_NAMESPACE = "vnext-production1";
const PRODUCTION_SHADOW_DATABASE = "parallette25-vnext-production1";

const VNextProductionAccountGate = (props: AccountGateProps) => {
  const [choices, setChoices] = useState<readonly VNextLocalIdentityChoice[]>([]);
  const [loaded, setLoaded] = useState(Boolean(props.current));

  useEffect(() => {
    let active = true;
    if (props.current) {
      setLoaded(true);
      return () => { active = false; };
    }
    void import("../../profileStore").then(async ({
      hasProfileSession,
      isSecuredProfile,
      listProfiles,
    }) => {
      const lastProfileId = localStorage.getItem("parallette25-last-profile");
      const profiles = (await listProfiles()).sort((left, right) => {
        if (left.profileId === lastProfileId) return -1;
        if (right.profileId === lastProfileId) return 1;
        return left.username.localeCompare(right.username);
      });
      const available = profiles.flatMap((profile): VNextLocalIdentityChoice[] => {
        if (!isStableId(profile.profileId)) return [];
        const accountSession = hasProfileSession(profile.profileId);
        if (isSecuredProfile(profile) && !accountSession) return [];
        const identity: VNextRcIdentity = {
          version: 1,
          athleteId: parseStableId("athlete", profile.profileId),
          mode: accountSession ? "account" : "local",
          username: profile.username,
        };
        return [{
          identity,
          label: `Continue as ${profile.username}`,
          detail: accountSession
            ? "Your signed-in v1.2 profile will be snapshotted, converted once and securely reconciled."
            : "Your on-device v1.2 profile will be snapshotted and converted once before vNext opens.",
        }];
      });
      if (active) {
        setChoices(available);
        setLoaded(true);
      }
    }).catch(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [props.current]);

  if (!loaded) {
    return (
      <main className="vnext-experience vnext-rc-loading" aria-live="polite">
        <div><p className="vnext-kicker">Parallette25</p><h1>Finding your saved progress…</h1></div>
      </main>
    );
  }
  return <VNextAccountGate {...props} localChoices={choices} presentation={PRODUCTION_PRESENTATION} />;
};

const hasLocalAuthority = async (store: VNextShadowStore, athleteId: VNextRcIdentity["athleteId"]): Promise<boolean> => {
  const sources = await store.readProjectionSources(athleteId);
  return Boolean(sources.intent || sources.resetTombstone || sources.evidenceEvents.length || sources.sessionRecords.length);
};

const prepareProductionAthlete = async ({
  identity,
  store,
  runtime,
}: Readonly<{
  identity: VNextRcIdentity;
  store: VNextShadowStore;
  runtime: VNextRuntime;
}>): Promise<Readonly<{ message?: string }>> => {
  const boundary = await import("../../profileStore");
  const legacyRead = await boundary.readLegacyProfileForVNextMigration(identity.athleteId, identity.mode);
  const legacy = legacyRead?.profile;
  let migrationStatus: "inserted" | "duplicate" | "not-applicable" = "not-applicable";
  let syncUnavailable = false;

  // Pull remote vNext truth before considering legacy conversion. On a new
  // device this prevents a newer v1.2 blob from replacing goals already owned
  // by native vNext or by the first completed migration.
  if (identity.mode === "account") {
    try {
      await boundary.syncVNextShadowObservations(store, identity.athleteId);
    } catch (error) {
      if (!boundary.isTransientVNextSyncError(error)) throw error;
      syncUnavailable = true;
    }
  }

  const authorityBeforeConversion = await hasLocalAuthority(store, identity.athleteId);
  if (identity.mode === "account" && !authorityBeforeConversion
    && legacyRead?.provenance === "device-local") {
    throw new Error("Connect once to reconcile the current account reset boundary before its first vNext placement.");
  }

  const reconcilePendingV1Handoff = legacyRead?.provenance === "device-local-pending-vnext-handoff"
    && !syncUnavailable;
  if (shouldApplyProductionLegacyConversion(legacy, authorityBeforeConversion, reconcilePendingV1Handoff)) {
    const conversion = await runtime.prepareCopiedLegacyConversion({ copiedProfile: legacy });
    const applied = await runtime.applyCopiedLegacyConversion({
      athleteId: identity.athleteId,
      conversion,
    });
    migrationStatus = applied.applyStatus;
  }

  if (identity.mode === "account") {
    try {
      await boundary.syncVNextShadowObservations(store, identity.athleteId);
      syncUnavailable = false;
    } catch (error) {
      if (!boundary.isTransientVNextSyncError(error)) throw error;
      syncUnavailable = true;
      const hasSafeLocalStart = legacy !== undefined || authorityBeforeConversion
        || await hasLocalAuthority(store, identity.athleteId);
      if (!hasSafeLocalStart) {
        throw new Error("Connect once to reconcile this existing account before starting vNext on this device.", { cause: error });
      }
      return {
        message: migrationStatus === "inserted"
          ? "Your v1.2 progress was converted from a recoverable snapshot. Cloud reconciliation will retry when the connection returns."
          : "Your saved vNext observations are available offline. Cloud reconciliation will retry automatically when requested.",
      };
    }
  }

  return {
    message: migrationStatus === "inserted"
      ? "Your v1.2 progress was converted once from a recoverable snapshot and reconciled with vNext."
      : migrationStatus === "duplicate"
        ? "Your existing conversion receipt was verified; no progress was duplicated."
        : syncUnavailable
          ? "Your saved vNext observations are available offline. Cloud reconciliation will retry automatically."
          : "Your vNext observations were reconciled successfully.",
  };
};

const PRODUCTION_DEPLOYMENT: VNextApplicationDeployment = {
  kind: "production",
  productKicker: "Parallette25",
  openingMessage: "Opening your evidence-led training…",
  bannerTitle: "Parallette25",
  bannerDetail: "evidence-led training · offline ready",
  accountPresentation: PRODUCTION_PRESENTATION,
  AccountGate: VNextProductionAccountGate,
  prepareAthlete: prepareProductionAthlete,
  storageNamespace: PRODUCTION_STORAGE_NAMESPACE,
  shadowDatabaseName: PRODUCTION_SHADOW_DATABASE,
};

export const VNextProductionApp = () => {
  const deployment = useMemo(() => PRODUCTION_DEPLOYMENT, []);
  return <VNextReleaseCandidateApp deployment={deployment} />;
};
