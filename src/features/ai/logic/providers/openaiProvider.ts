// [SCOPE] OpenAI provider implementation

import type { AIResponse } from '../../data/routingTypes.js';
import { getOpenAIKey } from '../../data/routingKeys.js';
import { classifyError } from './providerUtils.js';
import { clampTemp } from '../../data/roleTemperature.js';
import { recordSuccess, recordRateLimit, recordUnavailable } from '../../data/providerQuotaTracker.js';
import { parseOpenAIHeaders } from '../../data/parseRateLimitInfo.js';

export async function executeOpenAI(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra',
  imageBase64?: string,
  imageType?: string,
  temperature?: number,
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getOpenAIKey()!;
  const { bestModelForRole, tierToRole } = await import('../../data/modelRegistry.js');
  const model = bestModelForRole('openai', tierToRole(tier))?.modelId ?? 'gpt-4o-mini';
  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    // [VISION] Build multi-part content when an image is attached — matches OpenAI image_url format.
    // o-series reasoning models don't support vision; fall back to text-only for those.
    const isOSeries = /^o[1-9]/i.test(model);
    const userContent = (imageBase64 && !isOSeries)
      ? [{ type: 'image_url', image_url: { url: `data:${imageType || 'image/png'};base64,${imageBase64}`, detail: 'auto' } }, { type: 'text', text }]
      : text;
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: userContent }]
        : [{ role: 'user', content: userContent }];
      // [FIX] max_tokens set to GPT-4o maximum (16384) — Worker needs full output for large files
      // [NOTE] o-series reasoning models don't support temperature; omit for those.
      const bodyObj: any = { model, messages: _msgs, max_tokens: 16384 };
      if (!isOSeries) { bodyObj.temperature = clampTemp('openai', temperature ?? 0.2); }
      const body = JSON.stringify(bodyObj);
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {
      const errMsg = `OpenAI API error ${res.status}: ${data.error?.message || res.statusText}`;
      if (res.status === 429) {
        // insufficient_quota = out of credits (not a rate limit that will auto-recover)
        if (data.error?.code === 'insufficient_quota') { recordUnavailable('openai', 'out of API credits'); }
        else { recordRateLimit('openai', parseOpenAIHeaders(res.headers)); }
      } else if (res.status === 402 || /credit|balance|insufficient/i.test(data.error?.message || '')) { recordUnavailable('openai', 'out of API credits'); }
      return { text: '', model, success: false, error: errMsg };
    }
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    recordSuccess('openai', inputTokens ?? 0, outputTokens ?? 0);
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model, success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model, success: false, error: classifyError(err, 'OpenAI') }; }
}
