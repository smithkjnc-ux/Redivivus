// [SCOPE] AI Route Classifier client — sizes a request (flash/pro/ultra) by UNDERSTANDING it, not regex.
// Rule 18: AI for understanding, code for execution. Replaces the keyword/regex assessTier as the binding
// source of the Supervisor tier. One tiny call on the Supervisor provider's cheap FLASH model; on any failure
// returns null so the caller keeps its offline fallback (the legacy heuristic) and nothing breaks.

import type { MessageHandlerDeps } from '../../../features/chat/logic/chatPanelMessageDeps.js';

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

    const fetchFn = deps.routing.fetchWithTimeout || ((...a: any[]) => (globalThis as any).fetch(...a));
    const res = await fetchFn(`${base}/classify-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt, hasProject, classifier: supervisor, classifierModel: model, keys: keysPayload }),
    }, 15_000);

    if (!res.ok) { return null; }
    // [FIX] AI-audit: `any` restored locally — dropping the `(deps.routing as any)` cast propagated
    // real types so res.json() is no longer implicitly any. Behavior unchanged (this is a JSON blob).
    const data: any = await res.json().catch(() => null);
    // [COST] Count this classifier call too — small (flash, ~50 tokens) but real; it was uncounted.
    if (data && (data.inputTokens || data.outputTokens)) {
      // [FIX] Record as 'qa' not 'supervisor' — this is a 50-token pre-classification, not the Supervisor.
      // Using 'supervisor' caused it to appear as a second "Supervisor (deepseek-chat)" in the pipeline label.
      try { deps.usageTracker?.recordUsage((data.inputTokens || 0) + (data.outputTokens || 0), 0, model, data.inputTokens, data.outputTokens, 'qa', undefined); } catch { /* best-effort */ }
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
