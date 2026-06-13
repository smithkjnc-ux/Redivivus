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
}

export async function cloudChat(
  message: string,
  context?: ChatContext,
  tier?: 'flash' | 'pro' | 'ultra',
): Promise<ChatResult> {
  const token = await getAccountToken();
  const keyHeaders = collectKeyHeaders();

  const res = await fetch(`${getApiBase()}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...keyHeaders,
    },
    body: JSON.stringify({ message, context, tier }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    throw new Error(err.error || `Chat API ${res.status}`);
  }

  return res.json() as Promise<ChatResult>;
}
