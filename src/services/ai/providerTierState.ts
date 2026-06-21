// [SCOPE] Auto-detects when a provider is running on a constrained/free tier, from repeated quota
// errors, so the Supervisor plans for the REAL ceiling (e.g. Gemini free = Flash, not Pro). Purely
// in-memory: a sliding error window + a sticky cooldown. Resets on extension host restart — same
// semantics as model failover. Soft by design: a wrong guess only makes a build plan more carefully,
// it never blocks one.

const WINDOW_MS = 15 * 60 * 1000;        // look-back window for counting quota errors
const THRESHOLD = 3;                      // this many quota errors in the window => constrained
const COOLDOWN_MS = 6 * 60 * 60 * 1000;   // stay constrained this long after detection (no oscillation)

interface TierState { errors: number[]; constrainedUntil: number; }
const _state = new Map<string, TierState>();

// Providers with a meaningful free tier worth downshifting to. Paid-only providers
// (claude/openai/xai/deepseek/kimi) are intentionally excluded — a quota error there means
// "out of credits", which failover handles, not a capability change.
export const FREE_TIER_MODEL: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
};

/** Shared quota/capacity error classifier — used by both the routing and orchestration call paths. */
export function looksLikeQuotaError(err: string): boolean {
  const e = (err || '').toLowerCase();
  return e.includes('quota') || e.includes('429') || e.includes('402')
    || e.includes('rate limit') || e.includes('rate_limit') || e.includes('insufficient')
    || e.includes('resource has been exhausted') || e.includes('billing')
    || e.includes('credit') || e.includes('balance');
}

/** Record a quota error for a provider. Returns true only if it JUST crossed into constrained. */
export function recordQuotaError(provider: string): boolean {
  if (!FREE_TIER_MODEL[provider]) { return false; } // only free-capable providers downshift
  const now = Date.now();
  const st = _state.get(provider) ?? { errors: [], constrainedUntil: 0 };
  st.errors = st.errors.filter(t => now - t < WINDOW_MS);
  st.errors.push(now);
  const wasConstrained = now < st.constrainedUntil;
  if (st.errors.length >= THRESHOLD) { st.constrainedUntil = now + COOLDOWN_MS; }
  _state.set(provider, st);
  return !wasConstrained && now < st.constrainedUntil;
}

/** True if this provider is currently treated as constrained (free tier) for planning. */
export function isProviderConstrained(provider: string): boolean {
  if (!FREE_TIER_MODEL[provider]) { return false; }
  const st = _state.get(provider);
  return !!st && Date.now() < st.constrainedUntil;
}

// ── Sticky "unavailable" cooldown for SUSTAINED outages ──────────────────────────────────────────────────
// Distinct from the free-tier downshift above: a 400 "credit balance too low" or an auth failure will NOT
// fix itself within a session. Without this, every fix/edit/build leads with the dead provider, fails, and
// burns a failover hop each time. Once a provider hits a sustained failure we skip it for the rest of the
// session (or until the cooldown lapses). In-memory only — clears on extension host restart, same as tiers.
const UNAVAIL_COOLDOWN_MS = 2 * 60 * 60 * 1000;   // 2h; long enough to stop re-trying, short enough to recover
const _unavailable = new Map<string, { until: number; reason: string }>();

/** Flag a provider as unavailable for the session (out of credits / bad key). `reason` is the human summary. */
export function markProviderUnavailable(provider: string, reason: string): void {
  if (!provider) { return; }
  _unavailable.set(provider, { until: Date.now() + UNAVAIL_COOLDOWN_MS, reason });
}

/** True if this provider is currently flagged unavailable (so callers skip it before spending a request). */
export function isProviderUnavailable(provider: string): boolean {
  const st = _unavailable.get(provider);
  return !!st && Date.now() < st.until;
}

/** The human reason a provider is flagged unavailable, or undefined if it isn't. */
export function unavailableReason(provider: string): string | undefined {
  const st = _unavailable.get(provider);
  return st && Date.now() < st.until ? st.reason : undefined;
}

/** Clear the unavailable flag (one provider, or all). Use when a key is re-entered or credits topped up. */
export function clearProviderUnavailable(provider?: string): void {
  if (provider) { _unavailable.delete(provider); } else { _unavailable.clear(); }
}
