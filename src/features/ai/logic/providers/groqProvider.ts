// [SCOPE] Groq provider implementation

import type { AIResponse } from '../../data/routingTypes.js';
import { getGroqKey } from '../../data/routingKeys.js';
import { classifyError } from './providerUtils.js';
import { clampTemp } from '../../data/roleTemperature.js';

export async function executeGroq(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  systemMessage?: string,
  tier?: 'flash' | 'pro' | 'ultra',
  temperature?: number,
  maxOutputTokens?: number,
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getGroqKey()!;
  const { bestModelForRole, tierToRole } = await import('../../data/modelRegistry.js');
  const model = bestModelForRole('groq', tierToRole(tier))?.modelId ?? 'llama-3.3-70b-versatile';
  try {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const _msgs: any[] = systemMessage
        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }]
        : [{ role: 'user', content: text }];
      // [FIX] max_tokens set to Groq maximum (8000) — Worker needs full output for large files.
      // Callers that only need short outputs (e.g. blueprint inference JSON) pass maxOutputTokens to avoid
      // burning 8000 reserved tokens against the TPM budget (12000 TPM / 8000 reserved = only 1 call/min).
      const body = JSON.stringify({ model, messages: _msgs, max_tokens: maxOutputTokens ?? 8000, temperature: clampTemp('groq', temperature ?? 0.2) });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model: 'llama-3.3-70b', success: false, error: `Groq API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
    const outputTokens = data.usage?.completion_tokens ?? undefined;
    return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'llama-3.3-70b', success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: 'llama-3.3-70b', success: false, error: classifyError(err, 'Groq') }; }
}
