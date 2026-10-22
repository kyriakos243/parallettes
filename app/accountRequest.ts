export const ACCOUNT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Training sync may upload up to ~1.4 MB in one request (an exact previous-
 * version snapshot). Give it 1 s per 50 KB on top of the normal deadline, up to
 * 45 s, so a slow link is not reported as offline forever.
 */
export const syncRequestTimeoutMs = (requestBytes: number): number => Math.min(
  45_000,
  ACCOUNT_REQUEST_TIMEOUT_MS + Math.ceil(Math.max(0, requestBytes) / 50_000) * 1_000,
);

/** Bound both connection and body download; a stalled connection is an offline retry. */
export const fetchAccountResponse = async (
  url: string,
  init: RequestInit,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<Response> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await (options.fetcher ?? fetch)(url, { ...init, signal: controller.signal });
        // Account endpoints return bounded JSON, not streaming media. Keep the
        // deadline active until the entire response has arrived.
        const body = response.body === null ? null : await response.arrayBuffer();
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Network unavailable. Your changes remain saved on this device."));
        }, options.timeoutMs ?? ACCOUNT_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
};
