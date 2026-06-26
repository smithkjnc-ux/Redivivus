// [SCOPE] DeepSeek provider implementation. OpenAI-compatible Chat Completions API at api.deepseek.com.
// Models: deepseek-chat (V3, fast/cheap) and deepseek-reasoner (R1, chain-of-thought). Low cost.

import type { AIResponse } from '../../data/routingTypes.js';
import { getDeepseekKey } from '../../data/routingKeys.js';
import { classifyError } from './providerUtils.js';

export async function executeDeepseek(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra'
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getDeepseekKey()!;
  const { bestModelForRole, tierToRole } = await import('../../data/modelRegistry.js');
  const model = bestModelForRole('deepseek', tierToRole(tier))?.modelId ?? 'deepseek-chat';
  try {
    const url = 'https://api.deepseek.com/v1/chat/completions';
    const _msgs: any[] = systemMessage
      ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
      : [{ role: 'user', content: text }];
    const body = JSON.stringify({ model, messages: _msgs, max_tokens: 8000 });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) { return { text: '', model: 'deepseek', success: false, error: `DeepSeek API error ${res.status}: ${data.error?.message || res.statusText}` }; }
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'deepseek', success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: 'deepseek', success: false, error: classifyError(err, 'DeepSeek') }; }
}
