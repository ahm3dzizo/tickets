/**
 * server/classifier/ml-client.ts
 * ────────────────────────────────
 * HTTP client for the Python ML classifier microservice (port 5050).
 * Falls back gracefully if the service is unavailable.
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:5050";
const TIMEOUT_MS     = 3_000;

export interface MLResult {
  primaryType:  string;
  subType?:     string | null;
  subTypeConf?: number;
  allTypes:     string[];
  confidence:   number;
  source:       "ml";
}

export interface MLBatchItem {
  id:          string;
  description: string;
}

export interface MLBatchResult extends MLResult {
  id: string;
}

function normalizeMLResult<T extends Partial<MLResult>>(raw: T): T & MLResult {
  const primaryType = typeof raw.primaryType === "string" && raw.primaryType.trim()
    ? raw.primaryType.trim()
    : "unclassified";
  const allTypes = [...new Set([
    primaryType,
    ...(Array.isArray(raw.allTypes) ? raw.allTypes : []),
  ].filter((type): type is string => typeof type === "string" && !!type.trim())
    .map(type => type.trim()))];

  return {
    ...raw,
    primaryType,
    allTypes: primaryType === "unclassified"
      ? allTypes.filter(type => type !== "unclassified")
      : allTypes.filter(type => type !== "unclassified"),
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0,
    source: "ml",
  } as T & MLResult;
}

// ── Single classification ───────────────────────────────────────────────────
export async function classifyWithML(description: string): Promise<MLResult | null> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/classify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ description }),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return normalizeMLResult(await res.json() as MLResult);
  } catch {
    return null;
  }
}

// ── Batch classification ────────────────────────────────────────────────────
export async function classifyBatchWithML(items: MLBatchItem[]): Promise<MLBatchResult[]> {
  if (items.length === 0) return [];
  try {
    const res = await fetch(`${ML_SERVICE_URL}/classify/batch`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ items }),
      signal:  AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!res.ok) return [];
    const results = await res.json() as MLBatchResult[];
    return Array.isArray(results)
      ? results.filter(result => typeof result?.id === "string").map(normalizeMLResult)
      : [];
  } catch {
    return [];
  }
}

// ── Health check ────────────────────────────────────────────────────────────
export async function mlServiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
