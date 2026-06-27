// [SCOPE] Pure parsers — extract rate-limit and quota info from provider HTTP responses and error bodies.
// No side effects. All functions return structured data; callers decide what to store.

export interface QuotaHit {
  tpmLimit?: number;
  tpdLimit?: number;
  tpmUsed?: number;
  tpdUsed?: number;
  skipUntilMs?: number;
  skipReason?: string;
}

/** Format ms as human-readable: "45s", "12m", "2h 15m". Clamps to 0 to avoid negative values. */
export function fmtMs(ms: number): string {
  const s = Math.round(Math.max(0, ms) / 1_000);
  if (s < 120) { return `${s}s`; }
  const m = Math.floor(s / 60); const rs = s % 60;
  if (m < 120) { return rs > 0 ? `${m}m ${rs}s` : `${m}m`; }
  const h = Math.floor(m / 60); const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/** Parse "try again in 1h19m22.368s" or "23.04s" → ms. Returns 0 if not found. */
function parseRetryInMs(msg: string): number {
  const m = msg.match(/try again in\s+((?:\d+h\s*)?(?:\d+m\s*)?(?:[\d.]+s)?)/i);
  if (!m) { return 0; }
  const part = m[1].trim();
  let ms = 0;
  const h  = part.match(/(\d+)h/);         if (h)  { ms += parseInt(h[1])    * 3_600_000; }
  const mn = part.match(/(\d+)m/);         if (mn) { ms += parseInt(mn[1])   *    60_000; }
  const sc = part.match(/([\d.]+)s/);      if (sc) { ms += parseFloat(sc[1]) *     1_000; }
  return ms;
}

/** Parse "Limit X, Used Y" (with optional commas in numbers) from a string. */
function parseLimitUsed(msg: string): { limit: number; used: number } | undefined {
  const m = msg.match(/Limit\s+([\d,]+),\s*Used\s+([\d,]+)/i);
  if (!m) { return undefined; }
  return { limit: parseInt(m[1].replace(/,/g, '')), used: parseInt(m[2].replace(/,/g, '')) };
}

/**
 * Groq 429 body messages:
 *   "tokens per minute (TPM): Limit 12000, Used 7949 ... try again in 23.04s"
 *   "tokens per day (TPD): Limit 100000, Used 98581 ... try again in 1h19m22s"
 */
export function parseGroqRateLimit(errorMsg: string): QuotaHit {
  const result: QuotaHit = {};
  const isTPM = /tokens per minute/i.test(errorMsg);
  const isTPD = /tokens per day/i.test(errorMsg);
  const lu = parseLimitUsed(errorMsg);
  if (lu) {
    if (isTPM) { result.tpmLimit = lu.limit; result.tpmUsed = lu.used; }
    if (isTPD) { result.tpdLimit = lu.limit; result.tpdUsed = lu.used; }
  }
  const retryMs = parseRetryInMs(errorMsg);
  if (retryMs > 0) {
    result.skipUntilMs = Date.now() + retryMs + 2_000;
    result.skipReason = isTPD
      ? `daily quota — resumes in ${fmtMs(retryMs)}`
      : `rate limited — resumes in ${fmtMs(retryMs)}`;
  }
  return result;
}

/**
 * Anthropic headers (present on every response, not just 429s):
 *   anthropic-ratelimit-tokens-limit, anthropic-ratelimit-tokens-reset (ISO 8601 timestamp)
 */
export function parseAnthropicHeaders(headers: { get(k: string): string | null }): QuotaHit {
  const result: QuotaHit = {};
  const limit = headers.get('anthropic-ratelimit-tokens-limit') ?? headers.get('anthropic-ratelimit-input-tokens-limit');
  const reset = headers.get('anthropic-ratelimit-tokens-reset') ?? headers.get('anthropic-ratelimit-input-tokens-reset');
  if (limit) { result.tpmLimit = parseInt(limit); }
  if (reset) {
    const resetMs = new Date(reset).getTime();
    if (!isNaN(resetMs) && resetMs > Date.now()) {
      result.skipUntilMs = resetMs + 1_000;
      result.skipReason = `rate limited — resumes at ${new Date(resetMs).toLocaleTimeString()}`;
    }
  }
  return _withRetryAfterFallback(result, headers);
}

/**
 * OpenAI / xAI / Kimi headers:
 *   x-ratelimit-limit-tokens, x-ratelimit-reset-tokens (relative: "30s" or "1m30s")
 * Also handles OpenAI insufficient_quota (billing issue — different from rate limit).
 */
export function parseOpenAIHeaders(headers: { get(k: string): string | null }): QuotaHit {
  const result: QuotaHit = {};
  const limit    = headers.get('x-ratelimit-limit-tokens');
  const resetStr = headers.get('x-ratelimit-reset-tokens');
  if (limit) { result.tpmLimit = parseInt(limit); }
  if (resetStr) {
    let ms = 0;
    const mn = resetStr.match(/(\d+)m/);              if (mn) { ms += parseInt(mn[1]) * 60_000; }
    const sc = resetStr.match(/(\d+(?:\.\d+)?)s/);   if (sc) { ms += parseFloat(sc[1]) * 1_000; }
    if (ms > 0) {
      result.skipUntilMs = Date.now() + ms + 1_000;
      result.skipReason = `rate limited — resumes in ${fmtMs(ms)}`;
    }
  }
  return _withRetryAfterFallback(result, headers);
}

/**
 * Generic fallback — Retry-After header (seconds or date), then Groq-style body parse.
 * Covers Gemini, Deepseek, and any provider without structured quota headers.
 */
export function parseGenericRateLimit(headers: { get(k: string): string | null }, bodyMsg: string): QuotaHit {
  const result = _withRetryAfterFallback({}, headers);
  if (result.skipUntilMs) { return result; }
  return parseGroqRateLimit(bodyMsg); // try Groq-style "Limit X, Used Y" in body
}

function _withRetryAfterFallback(result: QuotaHit, headers: { get(k: string): string | null }): QuotaHit {
  if (result.skipUntilMs) { return result; }
  const ra = headers.get('retry-after') ?? headers.get('Retry-After');
  if (!ra) { return result; }
  const secs = parseInt(ra);
  if (!isNaN(secs) && secs > 0) {
    result.skipUntilMs = Date.now() + secs * 1_000 + 1_000;
    result.skipReason = `rate limited — resumes in ${fmtMs(secs * 1_000)}`;
    return result;
  }
  const ts = new Date(ra).getTime();
  if (!isNaN(ts) && ts > Date.now()) {
    result.skipUntilMs = ts + 1_000;
    result.skipReason = `rate limited — resumes at ${new Date(ts).toLocaleTimeString()}`;
  }
  return result;
}
