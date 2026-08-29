import type {
  SyncDeltaRequest,
  SyncDeltaResponse,
  SyncUploadItem,
  VNextShadowStore,
} from "./contracts";

export type ShadowSyncTransport = (
  request: SyncDeltaRequest,
) => Promise<SyncDeltaResponse>;

export type ShadowSyncSummary = Readonly<{
  pages: number;
  uploaded: number;
  downloaded: number;
  duplicatesAcknowledged: number;
  cursor: number;
}>;

const encodedSize = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const MAX_UPLOAD_ITEMS_PER_REQUEST = 8;

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
      cursor,
      upload: candidate,
      limit,
    };
    if (encodedSize(request) > maximumRequestBytes) {
      if (!selected.length) throw new Error(`shadow-sync-upload-too-large:${item.kind}:${item.id}`);
      break;
    }
    selected.push(item);
  }
  return selected;
};

/**
 * Exchanges immutable observation deltas without granting transport metadata
 * any authority over replay. The store applies every page transactionally and
 * acknowledges its outbox only after the response is accepted.
 */
export const syncObservationDeltas = async (
  store: VNextShadowStore,
  athleteId: Parameters<VNextShadowStore["readSyncUpload"]>[0],
  transport: ShadowSyncTransport,
  options: Readonly<{
    pageSize?: number;
    maximumRequestBytes?: number;
    maximumPages?: number;
  }> = {},
): Promise<ShadowSyncSummary> => {
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 100));
  // The shadow endpoint has a dedicated 1.5 MB inbound ceiling. Keeping the
  // client below it lets an exact snapshot of any profile accepted by the
  // unchanged 750 KB v1.2 profile API travel as one immutable sync item.
  const maximumRequestBytes = options.maximumRequestBytes ?? 1_400_000;
  const maximumPages = options.maximumPages ?? 1_000;
  let cursor = await store.getSyncCursor(athleteId);
  let pages = 0;
  let uploaded = 0;
  let downloaded = 0;
  let duplicatesAcknowledged = 0;
  let complete = false;

  while (pages < maximumPages) {
    const pending = await store.readSyncUpload(athleteId, Math.min(pageSize, MAX_UPLOAD_ITEMS_PER_REQUEST));
    const upload = boundedUpload(cursor, pending, pageSize, maximumRequestBytes);
    const request: SyncDeltaRequest = {
      schemaVersion: 1,
      cursor,
      upload,
      limit: pageSize,
    };
    const response = await transport(request);
    if (response.schemaVersion !== 1 || !Number.isSafeInteger(response.cursor) || response.cursor < cursor) {
      throw new Error("shadow-sync-invalid-cursor");
    }
    if (response.conflicts.length) {
      // A live-profile reset is an authoritative lower bound even when an
      // unrelated immutable upload conflicts. Apply only that safety boundary;
      // do not acknowledge uploads or advance the cursor before surfacing the
      // conflict for explicit resolution.
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
      const summary = response.conflicts
        .map((conflict) => `${conflict.kind}:${conflict.id}:${conflict.reason}`)
        .sort()
        .join(",");
      throw new Error(`shadow-sync-conflict:${summary}`);
    }

    await store.applySyncDelta(athleteId, response);
    const uploadedHashes = new Map(upload.map((item) => [`${item.kind}:${item.id}`, item.hash]));
    await store.acknowledgeSync(
      athleteId,
      response.acknowledged.map(({ kind, id }) => {
        const hash = uploadedHashes.get(`${kind}:${id}`);
        if (!hash) throw new Error(`shadow-sync-unexpected-ack:${kind}:${id}`);
        return { kind, id, hash };
      }),
      response.cursor,
    );

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
  return { pages, uploaded, downloaded, duplicatesAcknowledged, cursor };
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
  if (response.status === 409) {
    const detail = await response.json() as { code?: unknown };
    throw new Error(detail.code === "vnext-cursor-ahead"
      ? "shadow-sync-cursor-ahead"
      : "shadow-sync-http-409");
  }
  if (!response.ok) throw new Error(`shadow-sync-http-${response.status}`);
  return response.json() as Promise<SyncDeltaResponse>;
};
