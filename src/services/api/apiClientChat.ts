// [SCOPE] cloudChat — single supervisor call that classifies intent and answers in one round-trip.
// Extracted from apiClient.ts (Rule 9: keep files under 200 lines).
// Replaces separate cloudClassify() + handleAIChat(promptCheap) with one Claude call.

import { getApiBase, getAccountToken, collectKeyHeaders } from './apiClient.js';

export interface ChatResult {
  action: 'answer' | 'build' | 'fix' | 'clarify' | 'command' | 'offtopic' | 'run' | 'convert' | 'scaffold' | 'service' | 'personality-picker';
  text: string;
  task?: string;       // extracted build/fix task (populated for build and fix actions)
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  confidence?: number; // [PHASE 1] 0..1 — classifier's certainty about `action`. undefined = treat as confident.
  // [SUPERVISOR_TIER] The complexity tier the chat pre-pass already classified for this request. Reused to size
  // the fix Supervisor (diagnosis) model — no extra AI call. ultra -> strongest reasoning model for hard requests.
  resolvedTier?: 'flash' | 'pro' | 'ultra';
}

export interface ChatContext {
  blueprint?: any;
  projectName?: string;
  recentMessages?: Array<{ role: string; content: string }>;
  currentTime?: string;
  timezone?: string;
  personality?: string;
  fileList?: string[];
  // [ADAPTIVE-PILL] When user locks a provider manually, pass it here so the backend respects it.
  preferred?: string;
  // [CONTEXT-GUARD] Whether a Redivivus project is currently open in the editor.
  // When true: fix/edit/add are valid; new standalone builds are not.
  // When false: new builds are valid; fix/edit have nothing to target.
  projectOpen?: boolean;
}

const CLOUD_CHAT_TIMEOUT_MS = 30_000;

export async function cloudChat(
  message: string,
  context?: ChatContext,
  tier?: 'flash' | 'pro' | 'ultra',
): Promise<ChatResult> {
  const token = await getAccountToken();
  const keyHeaders = collectKeyHeaders();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUD_CHAT_TIMEOUT_MS);

  // [FIX] Promise.race hard deadline — AbortController aborts the connection but Electron's fetch
  // may not reliably abort body reads. The race guarantees we always throw within CLOUD_CHAT_TIMEOUT_MS
  // so the input is never locked indefinitely. Matches the pattern in routingService.prompt().
  const fetchPromise = fetch(`${getApiBase()}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...keyHeaders,
    },
    body: JSON.stringify({ message, context, tier }),
    signal: controller.signal,
  });

  let res: Response;
  try {
    res = await Promise.race([
      fetchPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`cloudChat timed out after ${CLOUD_CHAT_TIMEOUT_MS}ms`)), CLOUD_CHAT_TIMEOUT_MS + 3_000)
      ),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    throw new Error(err.error || `Chat API ${res.status}`);
  }

  return res.json() as Promise<ChatResult>;
}
