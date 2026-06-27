// [SCOPE] Kimi provider implementation

import type { AIResponse } from '../../data/routingTypes.js';
import { getKimiKey } from '../../data/routingKeys.js';
import { detectKimiBase } from '../../data/kimiEndpoint.js';
import { classifyError } from './providerUtils.js';
import { clampTemp } from '../../data/roleTemperature.js';
import { recordSuccess, recordRateLimit, recordUnavailable } from '../../data/providerQuotaTracker.js';
import { parseOpenAIHeaders } from '../../data/parseRateLimitInfo.js';

export async function executeKimi(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra',
  temperature?: number,
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getKimiKey()!;
  const { bestModelForRole, tierToRole } = await import('../../data/modelRegistry.js');
  const model = bestModelForRole('kimi', tierToRole(tier))?.modelId ?? 'moonshot-v1-32k';
  try {
    const url = (await detectKimiBase(key)) + '/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      // [FIX] max_tokens set to Kimi maximum (16000) — Worker needs full output for large files
      const body = JSON.stringify({ model, messages: _msgs, max_tokens: 16000, temperature: clampTemp('kimi', temperature ?? 0.2) });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {
      const errMsg = `Kimi API error ${res.status}: ${data.error?.message || res.statusText}`;
      if (res.status === 429) { recordRateLimit('kimi', parseOpenAIHeaders(res.headers)); }
      else if (res.status === 402 || /credit|balance/i.test(data.error?.message || '')) { recordUnavailable('kimi', 'out of API credits'); }
      return { text: '', model: 'kimi', success: false, error: errMsg };
    }
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    recordSuccess('kimi', inputTokens ?? 0, outputTokens ?? 0);
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'kimi', success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: 'kimi', success: false, error: classifyError(err, 'Kimi') }; }
}
