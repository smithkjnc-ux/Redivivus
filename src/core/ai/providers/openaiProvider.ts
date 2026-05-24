// [SCOPE] OpenAI provider implementation

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { getOpenAIKey } from '../../../services/ai/routingKeys.js';
import { classifyError } from './providerUtils.js';

export async function executeOpenAI(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getOpenAIKey()!;
  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      const body = JSON.stringify({ model: 'gpt-4o-mini', messages: _msgs });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model: 'gpt-4o-mini', success: false, error: `OpenAI API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'gpt-4o-mini', success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: 'gpt-4o-mini', success: false, error: classifyError(err, 'OpenAI') }; }
}
