// [SCOPE] Per-provider AI quota tracker — persisted to extensionContext.globalState so state survives
// extension host reloads. Tracks daily token usage, revealed rate limits (from 429 errors), skip-until
// timestamps (rate-limit cooldowns), and sustained outages (out of credits, bad key).
// initQuotaTracker(context) MUST be called at extension activation before any AI calls.

import * as vscode from 'vscode';

export interface ProviderQuotaState {
  tpmLimit?: number;            // tokens/minute limit (revealed by first 429)
  tpdLimit?: number;            // tokens/day limit   (revealed by first 429)
  tpmUsed?: number;             // last known TPM used (from error msg)
  tpdUsed?: number;             // last known TPD used (from error msg)
  limitsRevealedAt?: number;
  skipUntilMs?: number;         // rate-limit cooldown: skip until this epoch ms
  skipReason?: string;
  unavailableUntilMs?: number;  // sustained outage: out of credits / bad key
  unavailableReason?: string;
  dailyUsage?: Record<string, number>; // "YYYY-MM-DD" → cumulative tokens used that day
  tier?: 'free' | 'paid' | 'unknown'; // inferred from revealed tpdLimit
}

type Store = Record<string, ProviderQuotaState>;
const STORE_KEY = 'redivivus.quotaStore';
let _ctx: vscode.ExtensionContext | undefined;

/** Must be called at extension activation so quota state survives host reloads. */
export function initQuotaTracker(context: vscode.ExtensionContext): void { _ctx = context; }

function load(): Store { return _ctx?.globalState.get<Store>(STORE_KEY) ?? {}; }
function save(s: Store): void { _ctx?.globalState.update(STORE_KEY, s); }
function todayKey(): string { return new Date().toISOString().slice(0, 10); }

/** Record a successful AI call — grows the daily token counter for gauges. */
export function recordSuccess(provider: string, inputTokens: number, outputTokens: number): void {
  if (!provider) { return; }
  const total = (inputTokens || 0) + (outputTokens || 0);
  if (!total) { return; }
  const store = load();
  const st = store[provider] ?? {};
  const day = todayKey();
  st.dailyUsage = st.dailyUsage ?? {};
  // Prune entries older than 3 days to prevent unbounded growth
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  for (const k of Object.keys(st.dailyUsage)) { if (k < cutoff) { delete st.dailyUsage[k]; } }
  st.dailyUsage[day] = (st.dailyUsage[day] ?? 0) + total;
  store[provider] = st;
  save(store);
  // Warn once when crossing 80% of daily limit
  if (st.tpdLimit) {
    const used = st.dailyUsage[day];
    const prev = used - total;
    const threshold = st.tpdLimit * 0.8;
    if (used >= threshold && prev < threshold) {
      vscode.window.showWarningMessage(
        `⚠️ ${provider} daily quota at ${Math.round(used / st.tpdLimit * 100)}% — ${used.toLocaleString()} / ${st.tpdLimit.toLocaleString()} tokens used today`
      );
    }
  }
}

/** Record a 429 — stores revealed limits and how long to pause calling this provider. */
export function recordRateLimit(provider: string, hit: {
  tpmLimit?: number; tpdLimit?: number; tpmUsed?: number; tpdUsed?: number;
  skipUntilMs?: number; skipReason?: string;
}): void {
  if (!provider) { return; }
  const store = load();
  const st = store[provider] ?? {};
  if (hit.tpmLimit) { st.tpmLimit = hit.tpmLimit; }
  if (hit.tpdLimit) { st.tpdLimit = hit.tpdLimit; st.tier = _inferTier(provider, hit.tpdLimit); }
  if (hit.tpmUsed !== undefined) { st.tpmUsed = hit.tpmUsed; }
  if (hit.tpdUsed !== undefined) {
    st.tpdUsed = hit.tpdUsed;
    // Sync daily counter to server-authoritative value — fills gaps from calls before tracker existed
    const day = todayKey();
    st.dailyUsage = st.dailyUsage ?? {};
    st.dailyUsage[day] = Math.max(st.dailyUsage[day] ?? 0, hit.tpdUsed);
  }
  st.limitsRevealedAt = Date.now();
  if (hit.skipUntilMs && hit.skipUntilMs > Date.now()) {
    st.skipUntilMs = hit.skipUntilMs;
    st.skipReason = hit.skipReason ?? 'rate limited';
    vscode.window.showWarningMessage(`🚫 ${provider} ${st.skipReason} — auto-skipping until reset`);
  }
  store[provider] = st;
  save(store);
}

/** Record a sustained outage (out of credits, bad key) — persists across extension reloads. */
export function recordUnavailable(provider: string, reason: string, durationMs = 8 * 60 * 60 * 1_000): void {
  if (!provider) { return; }
  const store = load();
  const st = store[provider] ?? {};
  st.unavailableUntilMs = Date.now() + durationMs;
  st.unavailableReason = reason;
  store[provider] = st;
  save(store);
}

/** Clear rate-limit / outage flags for a provider (e.g. user re-entered key or topped up credits). */
export function clearProviderQuota(provider?: string): void {
  const store = load();
  const clear = (st: ProviderQuotaState) => { delete st.skipUntilMs; delete st.skipReason; delete st.unavailableUntilMs; delete st.unavailableReason; };
  if (provider) { if (store[provider]) { clear(store[provider]); } }
  else { Object.values(store).forEach(clear); }
  save(store);
}

/** True if the provider should be skipped right now (rate limited or sustained outage). */
export function shouldSkipProvider(provider: string): boolean {
  const st = load()[provider];
  if (!st) { return false; }
  const now = Date.now();
  return (!!st.skipUntilMs && now < st.skipUntilMs) || (!!st.unavailableUntilMs && now < st.unavailableUntilMs);
}

/** Returns skip info for UI/log display — reason + when the provider resumes. */
export function getSkipInfo(provider: string): { reason: string; resumesAt: number } | undefined {
  const st = load()[provider];
  if (!st) { return undefined; }
  const now = Date.now();
  if (st.skipUntilMs && now < st.skipUntilMs)               { return { reason: st.skipReason ?? 'rate limited', resumesAt: st.skipUntilMs }; }
  if (st.unavailableUntilMs && now < st.unavailableUntilMs) { return { reason: st.unavailableReason ?? 'unavailable', resumesAt: st.unavailableUntilMs }; }
  return undefined;
}

/** Today's cumulative token usage for a provider. */
export function todayUsage(provider: string): number {
  return load()[provider]?.dailyUsage?.[todayKey()] ?? 0;
}

/** All provider quota states — for the Settings / Health panel gauge grid. */
export function getAllQuotaStates(): Store { return load(); }

/** Formatted usage summary for a provider: "45,231 / 100,000 tokens today (45%)" */
export function formatUsageSummary(provider: string): string | undefined {
  const st = load()[provider];
  if (!st) { return undefined; }
  const used = st.dailyUsage?.[todayKey()] ?? 0;
  if (!used && !st.tpdLimit) { return undefined; }
  const tierLabel = st.tier && st.tier !== 'unknown' ? ` · ${st.tier} tier` : '';
  if (st.tpdLimit) {
    const pct = Math.round(used / st.tpdLimit * 100);
    return `${used.toLocaleString()} / ${st.tpdLimit.toLocaleString()} tokens today (${pct}%)${tierLabel}`;
  }
  return used > 0 ? `${used.toLocaleString()} tokens today${tierLabel}` : undefined;
}

// Known free-tier daily limits for tier inference (learned from first 429 error)
const FREE_TIER_TPD: Record<string, number> = { groq: 100_000, gemini: 500_000 };

function _inferTier(provider: string, tpdLimit: number): 'free' | 'paid' | 'unknown' {
  const free = FREE_TIER_TPD[provider];
  if (!free) { return 'unknown'; }
  return tpdLimit <= free * 1.1 ? 'free' : 'paid'; // 10% tolerance for plan rounding
}
