// [SCOPE] Pure helper: turn a raw provider /execute error (an HTTP status + JSON blob, or a bare string) into
// a SHORT human reason for the failover notice. The agent loop was surfacing truncated raw JSON
// ("claude unavailable (400 {\"type\":\"error\"...)") which told the user nothing about WHY a provider dropped
// out. This classifies the common failure modes so the message reads "out of API credits" / "rate limited" /
// etc. NOTE: Anthropic returns a 400 invalid_request_error (NOT a 429) with a "credit balance is too low"
// message when a key is out of funds — so out-of-credits is detected by message text, not status code.
// No deps → unit-testable.

/** Map a raw provider error string to a short, human reason. Falls back to the API's own message, then a
 *  trimmed slice of the raw text. Never returns an empty string. */
export function describeProviderError(raw: string | undefined | null): string {
  const s = (raw || '').toString();
  const low = s.toLowerCase();

  // Out of funds — Anthropic: 400 "credit balance is too low"; OpenAI: "insufficient_quota" / "billing".
  if (low.includes('credit balance') || low.includes('insufficient_quota') || low.includes('insufficient funds') ||
      low.includes('billing') || low.includes('exceeded your current quota')) {
    return 'out of API credits';
  }
  if (low.includes('rate_limit') || low.includes('rate limit') || low.includes('too many requests') || low.includes('429')) {
    return 'rate limited';
  }
  if (low.includes('overloaded') || low.includes('529') || low.includes('503') || low.includes('temporarily unavailable')) {
    return 'provider overloaded';
  }
  if (low.includes('invalid x-api-key') || low.includes('invalid api key') || low.includes('authentication') ||
      low.includes('unauthorized') || low.includes('401') || low.includes('permission_error')) {
    return 'invalid or missing API key';
  }
  if (low.includes('context_length_exceeded') || low.includes('prompt is too long') ||
      ((low.includes('context') || low.includes('prompt') || low.includes('token')) &&
       (low.includes('too long') || low.includes('maximum') || low.includes('exceeds')))) {
    return 'context too long';
  }

  // Otherwise surface the API's own human message rather than the JSON envelope.
  const msg = s.match(/"message"\s*:\s*"([^"]+)"/);
  if (msg && msg[1]) { return msg[1].slice(0, 120); }

  return (s.trim().slice(0, 80)) || 'unavailable';
}

/** True when `raw` indicates a SUSTAINED outage that won't recover within a session — out of credits, or a
 *  bad/missing key. The caller uses this to STICKILY skip the provider for the rest of the session. Transient
 *  conditions (rate limited, overloaded, context too long) return false: those should be retried, not skipped. */
export function isSustainedFailure(raw: string | undefined | null): boolean {
  const r = describeProviderError(raw);
  return r === 'out of API credits' || r === 'invalid or missing API key';
}
