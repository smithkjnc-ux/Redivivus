// [SCOPE] Kimi/Moonshot endpoint auto-detection. Moonshot runs two independent platforms with
// non-interchangeable keys: api.moonshot.ai (international) and api.moonshot.cn (China). A key valid
// on one returns 401 on the other. This helper probes both once, caches the working base, and lets
// every Kimi caller (chat, streaming, balance, diagnostics) use the correct domain automatically.

const INTL = 'https://api.moonshot.ai';
const CN = 'https://api.moonshot.cn';

// Cached base URL, keyed by the API key it was detected for (so a key change re-detects).
let _cachedBase: string | null = null;
let _cachedForKey: string | null = null;
let _inflight: Promise<string> | null = null;

/** Synchronous best-guess base URL. Returns the detected base if available, else international default. */
export function getKimiBaseCached(): string {
  return _cachedBase || INTL;
}

/** Build a full Kimi API URL from a path (e.g. '/v1/chat/completions') using the cached base. */
export function kimiUrl(path: string): string {
  return getKimiBaseCached() + path;
}

/**
 * Detect which Moonshot platform a key belongs to by probing /v1/models on both domains.
 * Result is cached per-key. Falls back to the international base if neither responds 200
 * (e.g. offline) so behaviour matches the previous hardcoded default.
 */
export async function detectKimiBase(key: string): Promise<string> {
  if (!key) { return getKimiBaseCached(); }
  if (_cachedBase && _cachedForKey === key) { return _cachedBase; }
  // Key changed — invalidate stale cache.
  if (_cachedForKey !== key) { _cachedBase = null; }
  if (_inflight) { return _inflight; }

  _inflight = (async () => {
    const headers = { Authorization: `Bearer ${key}` };
    for (const base of [INTL, CN]) {
      try {
        const res = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          _cachedBase = base;
          _cachedForKey = key;
          return base;
        }
      } catch { /* try next domain */ }
    }
    // Neither responded 200 (bad key or offline) — default to international without caching,
    // so a later successful probe can still detect the correct domain.
    return INTL;
  })();

  try {
    return await _inflight;
  } finally {
    _inflight = null;
  }
}

/** Clear the cached endpoint (call when the Kimi key is changed/removed). */
export function invalidateKimiEndpointCache(): void {
  _cachedBase = null;
  _cachedForKey = null;
}
