const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value));

const bytesToHex = (value: ArrayBuffer): string => [...new Uint8Array(value)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

export const sha256 = async (value: unknown): Promise<string> => bytesToHex(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value))),
);

/** Lossless stable key material for legacy IDs; not used as a secret or proof hash. */
export const encodeLegacyKey = (value: string): string => [...new TextEncoder().encode(value)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
