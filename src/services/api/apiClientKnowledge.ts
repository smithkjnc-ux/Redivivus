// [SCOPE] API Client Knowledge Fetching — handles dynamic rule and gotcha fetching from backend

import { getApiBase } from './apiClient.js';

// Community gotchas -- lazy-fetched once per session, injected into every build prompt.
let _communityCache: string | null = null, _communityFetching = false;

export function getCommunityGotchas(): string {
  if (_communityCache === null && !_communityFetching) {
    _communityFetching = true;
    fetchCommunityGotchas().catch(() => {});
  }
  return _communityCache ?? '';
}

export async function fetchCommunityGotchas(): Promise<string> {
  if (_communityCache !== null) { return _communityCache; }
  try {
    const res = await fetch(`${getApiBase()}/knowledge/community-gotchas/`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) { _communityCache = ''; return ''; }
    const data = await res.json() as { gotchas: Array<{ promptLine: string }> };
    const lines = (data.gotchas ?? []).map(g => g.promptLine).filter(Boolean);
    _communityCache = lines.length > 0
      ? '\n--- COMMUNITY KNOWLEDGE (patterns caught across all Redivivus users) ---\n' + lines.join('\n') + '\n---\n'
      : '';
    return _communityCache;
  } catch { _communityCache = ''; return ''; }
}

// Worker rules -- fetched dynamically from backend so secret sauce stays off client
let _workerRulesCache: string | null = null, _workerRulesFetching = false;

export function getWorkerRules(): string {
  if (_workerRulesCache === null && !_workerRulesFetching) {
    _workerRulesFetching = true;
    fetchWorkerRules().catch(() => {});
  }
  return _workerRulesCache ?? '';
}

export async function fetchWorkerRules(): Promise<string> {
  if (_workerRulesCache !== null) { return _workerRulesCache; }
  try {
    const res = await fetch(`${getApiBase()}/knowledge/worker-rules`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) { _workerRulesCache = ''; return ''; }
    const data = await res.json() as { rules: string };
    _workerRulesCache = data.rules || '';
    return _workerRulesCache;
  } catch { _workerRulesCache = ''; return ''; }
}
