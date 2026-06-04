// [SCOPE] Kimi provider implementation

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { getKimiKey } from '../../../services/ai/routingKeys.js';
import { classifyError } from './providerUtils.js';

export async function executeKimi(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra'
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getKimiKey()!;
  const { bestModelForRole, tierToRole } = await import('../../../services/ai/modelRegistry.js');
  const model = bestModelForRole('kimi', tierToRole(tier))?.modelId ?? 'moonshot-v1-32k';
  try {
    const url = 'https://api.moonshot.ai/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      const body = JSON.stringify({ model, messages: _msgs });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model: 'kimi', success: false, error: `Kimi API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'kimi', success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: 'kimi', success: false, error: classifyError(err, 'Kimi') }; }
}
