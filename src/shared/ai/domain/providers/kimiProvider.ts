// [SCOPE] Kimi provider implementation

import type { AIResponse } from '../../infrastructure/routingTypes.js';
import { getKimiKey } from '../../infrastructure/routingKeys.js';
import { detectKimiBase } from '../../infrastructure/kimiEndpoint.js';
import { classifyError } from './providerUtils.js';

export async function executeKimi(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra'
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getKimiKey()!;
  const { bestModelForRole, tierToRole } = await import('../../infrastructure/modelRegistry.js');
  const model = bestModelForRole('kimi', tierToRole(tier))?.modelId ?? 'moonshot-v1-32k';
  try {
    const url = (await detectKimiBase(key)) + '/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      // [FIX] max_tokens set to Kimi maximum (16000) — Worker needs full output for large files
      const body = JSON.stringify({ model, messages: _msgs, max_tokens: 16000 });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model: 'kimi', success: false, error: `Kimi API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'kimi', success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: 'kimi', success: false, error: classifyError(err, 'Kimi') }; }
}
