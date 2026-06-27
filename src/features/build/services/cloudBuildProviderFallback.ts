// [SCOPE] Handles provider fallbacks and API key header filtering for multi-file cloud builds.
import { shouldSkipProvider } from '../../../features/ai/data/providerQuotaTracker.js';
import { AI_RANK } from '../../../features/ai/data/guardianAI.js';

/** Pick the next available provider from AI_RANK, skipping quota-blocked ones and the current one. */
export function nextAvailableProvider(current: string, keyHeaders: Record<string, string>): string | null {
  let availableProviders: Set<string>;
  try {
    const parsed = JSON.parse(keyHeaders['X-Provider-Keys'] || '{}') as Record<string, string>;
    availableProviders = new Set(Object.keys(parsed).filter(p => !!parsed[p]));
  } catch { availableProviders = new Set(); }
  return Object.entries(AI_RANK)
    .sort(([, a], [, b]) => b - a)
    .map(([p]) => p)
    .find(p => p !== current && availableProviders.has(p) && !shouldSkipProvider(p)) ?? null;
}

/** Return a copy of keyHeaders with quota-blocked providers removed from X-Provider-Keys. */
export function filterKeyHeaders(keyHeaders: Record<string, string>): Record<string, string> {
  const raw = keyHeaders['X-Provider-Keys'];
  if (!raw) { return keyHeaders; }
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    const filtered = Object.fromEntries(Object.entries(keys).filter(([p]) => !shouldSkipProvider(p)));
    if (Object.keys(filtered).length === Object.keys(keys).length) { return keyHeaders; }
    return { ...keyHeaders, 'X-Provider-Keys': JSON.stringify(filtered) };
  } catch { return keyHeaders; }
}
