// [SCOPE] OpenAI provider implementation

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { getOpenAIKey } from '../../../services/ai/routingKeys.js';
import { classifyError } from './providerUtils.js';

export async function executeOpenAI(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra'
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getOpenAIKey()!;
  const { bestModelForRole, tierToRole } = await import('../../../services/ai/modelRegistry.js');
  const model = bestModelForRole('openai', tierToRole(tier))?.modelId ?? 'gpt-4o-mini';
  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      // [FIX] max_tokens set to GPT-4o maximum (16384) — Worker needs full output for large files
      const body = JSON.stringify({ model, messages: _msgs, max_tokens: 16384 });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model, success: false, error: `OpenAI API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model, success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model, success: false, error: classifyError(err, 'OpenAI') }; }
}
