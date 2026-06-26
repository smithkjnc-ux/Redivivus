// [SCOPE] AI Route Classifier client — sizes a request (flash/pro/ultra) by UNDERSTANDING it, not regex.
// Rule 18: AI for understanding, code for execution. Replaces the keyword/regex assessTier as the binding
// source of the Supervisor tier. One tiny call on the Supervisor provider's cheap FLASH model; on any failure
// returns null so the caller keeps its offline fallback (the legacy heuristic) and nothing breaks.

import type { MessageHandlerDeps } from '../../../features/chat/routing/chatPanelMessageDeps.js';

export interface RouteClass { tier: 'flash' | 'pro' | 'ultra'; reason: string; }

// Classify a user request into a Supervisor tier. Returns null when no key is configured or the call fails.
export async function classifyRoute(
  prompt: string,
  hasProject: boolean,
  deps: MessageHandlerDeps,
): Promise<RouteClass | null> {
  try {
    const api = require('../api/apiClient.js');
    const base: string = api.getApiBase();
    const token: string = await api.getAccountToken();
    const keysPayload = api.collectKeys();
    if (!keysPayload || Object.keys(keysPayload).length === 0) { return null; }

    // Run on the Supervisor provider's cheapest FLASH model — guaranteed configured, costs ~nothing.
    const { supervisor } = deps.routing.selectSupervisorAndWorker();
    if (!supervisor || supervisor === 'none') { return null; }
    const { bestModelForRole } = require('./modelRegistry.js');
    const model = bestModelForRole(supervisor, 'flash')?.modelId || supervisor;

    const fetchFn = (deps.routing as any).fetchWithTimeout || ((...a: any[]) => (globalThis as any).fetch(...a));
    const res = await fetchFn(`${base}/classify-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt, hasProject, classifier: supervisor, classifierModel: model, keys: keysPayload }),
    }, 15_000);

    if (!res.ok) { return null; }
    const data = await res.json().catch(() => null);
    // [COST] Count this classifier call too — small (flash, ~50 tokens) but real; it was uncounted.
    if (data && (data.inputTokens || data.outputTokens)) {
      try { deps.usageTracker?.recordUsage((data.inputTokens || 0) + (data.outputTokens || 0), 0, model, data.inputTokens, data.outputTokens, 'supervisor', undefined); } catch { /* best-effort */ }
    }
    const t = data && String(data.tier || '').toLowerCase();
    if (t === 'flash' || t === 'pro' || t === 'ultra') {
      return { tier: t, reason: String(data.reason || '') };
    }
    return null;
  } catch {
    return null;
  }
}

// Convenience wrapper for the fix/build entry: classify and, if successful, set the binding Supervisor tier.
// Self-contained (logs + swallows errors) so the call site stays one line and never grows a large file.
export async function applyRouteTier(userText: string, hasProject: boolean, deps: MessageHandlerDeps): Promise<void> {
  try {
    const cls = await classifyRoute(userText, hasProject, deps);
    if (cls) {
      deps.supervisorTierHint = cls.tier;
      try { require('../logging/fixPipelineLogger.js').fixLog?.('Route classifier (AI tier)', { tier: cls.tier, reason: cls.reason }); } catch { /* logging is best-effort */ }
    }
  } catch { /* keep whatever hint was already set (offline-safe) */ }
}
