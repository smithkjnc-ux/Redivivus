// [SCOPE] xAI provider implementation

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { getXAIKey } from '../../../services/ai/routingKeys.js';
import { classifyError } from './providerUtils.js';

export async function executeXAI(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra'
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getXAIKey()!;
  const { bestModelForRole, tierToRole } = await import('../../../services/ai/modelRegistry.js');
  const model = bestModelForRole('xai', tierToRole(tier))?.modelId ?? 'grok-3-mini';
  try {
    const url = 'https://api.x.ai/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      // [FIX] max_tokens set to xAI maximum (32000) — Worker needs full output for large files
      const body = JSON.stringify({ model, messages: _msgs, max_tokens: 32000 });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model, success: false, error: `xAI API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model, success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model, success: false, error: classifyError(err, 'xAI') }; }
}
