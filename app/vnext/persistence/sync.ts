import type {
  EntityConflict,
  SyncDeltaRequest,
  SyncDeltaResponse,
  SyncEntityKind,
  SyncHoldRequest,
  SyncUploadItem,
  VNextShadowStore,
} from "./contracts";
import type { IsoTimestamp } from "../contracts";

export type ShadowSyncTransport = (
  request: SyncDeltaRequest,
) => Promise<SyncDeltaResponse>;

/** An uploaded fact the account accepted but did not keep because of a reset or newer version. */
export type SuppressedUpload = Readonly<{
  kind: SyncEntityKind;
  id: string;
  status: "ignored-reset" | "ignored-older";
  payload: SyncUploadItem["payload"];
}>;

export type ShadowSyncSummary = Readonly<{
  pages: number;
  uploaded: number;
  downloaded: number;
  duplicatesAcknowledged: number;
  cursor: number;
  /** Rows set aside after this run (including earlier runs). */
  held: number;
  /** Rows newly set aside during this run. */
  newlyHeld: readonly Readonly<{ kind: SyncEntityKind; id: string; reason: SyncHoldRequest["reason"]; detail: string }>[];
  suppressed: readonly SuppressedUpload[];
}>;

/**
 * The run finished every upload it could, but newly set aside at least one
 * row. The message keeps the historical conflict format; status must use the
 * summary and the store's holds, never this throw.
 */
export class ShadowSyncHeldError extends Error {
  constructor(message: string, readonly summary: ShadowSyncSummary) {
    super(message);
    this.name = "ShadowSyncHeldError";
  }
}

/** HTTP failure from the sync endpoint with the account's machine-readable code. */
export class ShadowSyncHttpError extends Error {
  constructor(readonly status: number, readonly code: string | undefined) {
    super(`shadow-sync-http-${status}`);
    this.name = "ShadowSyncHttpError";
  }
}

const encodedSize = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const MAX_UPLOAD_ITEMS_PER_REQUEST = 8;
/** More new holds than this in one run means something systemic, not one bad item. */
const MAX_NEW_HOLDS_PER_RUN = 5;
// Includes linked symptoms and native generator 1–6 useful-dose/practice/recovery readers.
export const VNEXT_SYNC_READER_VERSION = 4;

class UploadTooLarge extends Error {
  constructor(readonly item: SyncUploadItem) {
    super(`shadow-sync-upload-too-large:${item.kind}:${item.id}`);
  }
}

const boundedUpload = (
  cursor: number,
  items: readonly SyncUploadItem[],
  limit: number,
  maximumRequestBytes: number,
): readonly SyncUploadItem[] => {
  const selected: SyncUploadItem[] = [];
  for (const item of items) {
    const candidate = [...selected, item];
    const request: SyncDeltaRequest = {
      schemaVersion: 1,
      readerVersion: VNEXT_SYNC_READER_VERSION,
      cursor,
      upload: candidate,
      limit,
    };
    if (encodedSize(request) > maximumRequestBytes) {
      if (!selected.length) throw new UploadTooLarge(item);
      break;
    }
    selected.push(item);
  }
  return selected;
};

/**
 * Only a rejection the account attributes to submitted content may be pinned
 * on one item. Request-level, authorization, size-of-download, cursor and
 * service errors never set anything aside.
 */
const isItemScopedRejection = (error: unknown): error is ShadowSyncHttpError => error instanceof ShadowSyncHttpError
  && typeof error.code === "string"
  && ((error.status === 400 && error.code.startsWith("vnext-") && error.code !== "vnext-delta-limit")
    || (error.status === 413 && error.code === "vnext-item-too-large"));

const identityConflict = (conflict: EntityConflict): boolean => conflict.reason !== "invalid-reference";

/**
 * Exchanges immutable observation deltas without granting transport metadata
 * any authority over replay. The store applies every page transactionally and
 * acknowledges its outbox only after the response is accepted. A row the
 * account will not accept is set aside (with anything depending on it) so all
 * independent rows still upload; nothing saved is changed or discarded.
 */
export const syncObservationDeltas = async (
  store: VNextShadowStore,
  athleteId: Parameters<VNextShadowStore["readSyncUpload"]>[0],
  transport: ShadowSyncTransport,
  options: Readonly<{
    pageSize?: number;
    maximumRequestBytes?: number;
    maximumPages?: number;
    /** Client build identity; rejected/too-large holds from another build are retried. */
    build?: string;
    clock?: () => IsoTimestamp;
  }> = {},
): Promise<ShadowSyncSummary> => {
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 100));
  // The shadow endpoint has a dedicated 1.5 MB inbound ceiling. Keeping the
  // client below it lets an exact snapshot of any profile accepted by the
  // unchanged 750 KB v1.2 profile API travel as one immutable sync item.
  const maximumRequestBytes = options.maximumRequestBytes ?? 1_400_000;
  const maximumPages = options.maximumPages ?? 1_000;
  const clock = options.clock ?? (() => new Date().toISOString() as IsoTimestamp);
  if (options.build) await store.releaseBuildHolds(athleteId, options.build);
  let cursor = await store.getSyncCursor(athleteId);
  let pages = 0;
  let uploaded = 0;
  let downloaded = 0;
  let duplicatesAcknowledged = 0;
  let complete = false;
  let isolate = false;
  let lastSingleRejection: string | undefined;
  const newlyHeld: ShadowSyncSummary["newlyHeld"][number][] = [];
  const suppressed: SuppressedUpload[] = [];
  // Every non-progress iteration sets aside at least one row or switches to
  // single-item isolation once, so this bound is never reached normally.
  const maximumIterations = maximumPages + 2 * MAX_NEW_HOLDS_PER_RUN + 2 * MAX_UPLOAD_ITEMS_PER_REQUEST + 4;

  const hold = async (
    item: SyncUploadItem,
    reason: SyncHoldRequest["reason"],
    detail: string,
    remoteHash?: string,
  ): Promise<void> => {
    const count = await store.holdSyncItems(athleteId, [{
      kind: item.kind, id: item.id, hash: item.hash, reason, detail, heldAt: clock(),
      ...(remoteHash ? { remoteHash } : {}),
      ...(reason !== "conflict" && options.build ? { heldBuild: options.build } : {}),
    }]);
    if (count) newlyHeld.push({ kind: item.kind, id: item.id, reason, detail });
    if (newlyHeld.length > MAX_NEW_HOLDS_PER_RUN) throw new Error("shadow-sync-too-many-holds");
  };

  for (let iteration = 0; pages < maximumPages; iteration += 1) {
    if (iteration >= maximumIterations) throw new Error("shadow-sync-iteration-limit");
    const pending = await store.readSyncUpload(athleteId, isolate ? 1 : Math.min(pageSize, MAX_UPLOAD_ITEMS_PER_REQUEST));
    let upload: readonly SyncUploadItem[];
    try {
      upload = boundedUpload(cursor, pending, pageSize, maximumRequestBytes);
    } catch (error) {
      if (!(error instanceof UploadTooLarge)) throw error;
      await hold(error.item, "too-large", "client-request-limit");
      continue;
    }
    const request: SyncDeltaRequest = {
      schemaVersion: 1,
      readerVersion: VNEXT_SYNC_READER_VERSION,
      cursor,
      upload,
      limit: pageSize,
    };
    let response: SyncDeltaResponse;
    try {
      response = await transport(request);
    } catch (error) {
      if (!isItemScopedRejection(error) || !upload.length) throw error;
      if (upload.length > 1) {
        // Prove the request itself is acceptable before blaming any item.
        await transport({ ...request, upload: [] });
        isolate = true;
        continue;
      }
      const signature = `${error.status}:${error.code}`;
      // The same content rejection twice in a row is systemic, not one bad item.
      if (lastSingleRejection === signature) throw error;
      lastSingleRejection = signature;
      await hold(upload[0]!, error.status === 413 ? "too-large" : "rejected", error.code ?? signature);
      continue;
    }
    if (response.minimumReaderVersion !== undefined
      && (!Number.isSafeInteger(response.minimumReaderVersion) || response.minimumReaderVersion > VNEXT_SYNC_READER_VERSION)) {
      // No local page writes, cursor advance or outbox acknowledgement.
      throw new Error("shadow-sync-update-required");
    }
    if (response.schemaVersion !== 1 || !Number.isSafeInteger(response.cursor) || response.cursor < cursor) {
      throw new Error("shadow-sync-invalid-cursor");
    }
    if (response.conflicts.length) {
      // A live-profile reset is an authoritative lower bound even when an
      // unrelated immutable upload conflicts. Apply only that safety boundary;
      // do not acknowledge uploads or advance the cursor for this page.
      if (response.resetTombstone) {
        await store.applySyncDelta(athleteId, {
          schemaVersion: 1,
          cursor,
          hasMore: false,
          resetTombstone: response.resetTombstone,
          changes: response.changes.filter(({ kind }) => kind === "reset-tombstone"),
          acknowledged: [],
          conflicts: [],
        });
      }
      const conflictSummary = response.conflicts
        .map((conflict) => `${conflict.kind}:${conflict.id}:${conflict.reason}`)
        .sort()
        .join(",");
      const uploadedByKey = new Map(upload.map((item) => [`${item.kind}:${item.id}`, item] as const));
      const named = response.conflicts
        .map((conflict) => ({ conflict, item: uploadedByKey.get(`${conflict.kind}:${conflict.id}`) }))
        .filter((entry): entry is { conflict: EntityConflict; item: SyncUploadItem } => entry.item !== undefined);
      if (!named.length) throw new Error(`shadow-sync-conflict:${conflictSummary}`);
      const identity = named.filter(({ conflict }) => identityConflict(conflict));
      if (identity.length) {
        // Same-ID and equal-time goal conflicts belong to exactly that row.
        for (const { conflict, item } of identity) await hold(item, "conflict", conflict.reason, conflict.localHash);
        continue;
      }
      if (upload.length > 1) {
        // A reference failure may involve the page as a whole; find the row alone.
        isolate = true;
        continue;
      }
      const signature = `conflict:${named[0]!.conflict.reason}`;
      if (lastSingleRejection === signature) throw new Error(`shadow-sync-conflict:${conflictSummary}`);
      lastSingleRejection = signature;
      await hold(named[0]!.item, "conflict", named[0]!.conflict.reason, named[0]!.conflict.localHash);
      continue;
    }

    await store.applySyncDelta(athleteId, response);
    const uploadedItems = new Map(upload.map((item) => [`${item.kind}:${item.id}`, item] as const));
    await store.acknowledgeSync(
      athleteId,
      response.acknowledged.map(({ kind, id }) => {
        const item = uploadedItems.get(`${kind}:${id}`);
        if (!item) throw new Error(`shadow-sync-unexpected-ack:${kind}:${id}`);
        return { kind, id, hash: item.hash };
      }),
      response.cursor,
    );
    for (const { kind, id, status } of response.acknowledged) {
      if (status !== "ignored-reset" && status !== "ignored-older") continue;
      suppressed.push({ kind, id, status, payload: uploadedItems.get(`${kind}:${id}`)!.payload });
    }
    lastSingleRejection = undefined;

    pages += 1;
    uploaded += response.acknowledged.length;
    downloaded += response.changes.length;
    duplicatesAcknowledged += response.acknowledged.filter(({ status }) => status === "duplicate").length;
    const previousCursor = cursor;
    cursor = response.cursor;

    const stillPending = (await store.readSyncUpload(athleteId, 1)).length > 0;
    if (!response.hasMore && !stillPending) {
      complete = true;
      break;
    }
    if (response.hasMore && cursor === previousCursor && !response.changes.length) {
      throw new Error("shadow-sync-stalled-cursor");
    }
  }

  if (!complete) throw new Error("shadow-sync-page-limit");
  const summary: ShadowSyncSummary = {
    pages, uploaded, downloaded, duplicatesAcknowledged, cursor,
    held: (await store.readSyncHolds(athleteId)).length,
    newlyHeld,
    suppressed,
  };
  if (newlyHeld.length) {
    const conflicts = newlyHeld.filter(({ reason }) => reason === "conflict");
    const listed = (conflicts.length ? conflicts : newlyHeld)
      .map(({ kind, id, detail }) => `${kind}:${id}:${detail}`)
      .sort()
      .join(",");
    throw new ShadowSyncHeldError(`${conflicts.length ? "shadow-sync-conflict" : "shadow-sync-held"}:${listed}`, summary);
  }
  return summary;
};

/**
 * Creates a transport from the app's existing authenticated fetch boundary.
 * It never reads, stores, or refreshes bearer credentials itself.
 */
export const createAuthenticatedShadowTransport = (
  authenticatedFetch: typeof fetch,
  endpoint: string,
): ShadowSyncTransport => async (request) => {
  const response = await authenticatedFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.status === 426) throw new Error("shadow-sync-update-required");
  if (!response.ok) {
    let code: string | undefined;
    try {
      const detail = await response.json() as { code?: unknown };
      if (typeof detail.code === "string") code = detail.code;
    } catch { /* A body without a code is never treated as item-specific. */ }
    if (response.status === 409) {
      throw new Error(code === "vnext-cursor-ahead" ? "shadow-sync-cursor-ahead" : "shadow-sync-http-409");
    }
    throw new ShadowSyncHttpError(response.status, code);
  }
  return response.json() as Promise<SyncDeltaResponse>;
};
