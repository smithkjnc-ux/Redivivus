// [SCOPE] Claude AI provider implementation

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { getClaudeKey } from '../../../services/ai/routingKeys.js';
import { classifyError } from './providerUtils.js';

export async function executeClaude(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  geminiModel?: 'flash' | 'pro',
  imageBase64?: string,
  imageType?: string,
  systemMessage?: string
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getClaudeKey()!;
  // 'pro' tier = Sonnet 4 (supervisor planning, guardian review — needs reasoning)
  // default = Haiku 4.5 (worker code generation — fast, cheap, still excellent for code)
  const model = geminiModel === 'pro' ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
  const modelLabel = geminiModel === 'pro' ? 'claude-sonnet-4' : 'claude-haiku-4-5'; // [FIX] was 'claude-haiku-4' — mismatched calcCost, used wrong pricing tier
  try {
    const url = 'https://api.anthropic.com/v1/messages';
    const _content = imageBase64 ? [{ type: 'image', source: { type: 'base64', media_type: imageType || 'image/png', data: imageBase64 } }, { type: 'text', text }] : text;
    const body = JSON.stringify({ model, max_tokens: 32768, ...(systemMessage ? { system: systemMessage } : {}), messages: [{ role: 'user', content: _content }] });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model: modelLabel, success: false, error: `Claude API error ${res.status}: ${data.error?.message || res.statusText}` };}
    const inputTokens  = data.usage?.input_tokens  ?? undefined;
    const outputTokens = data.usage?.output_tokens ?? undefined;
    return { text: (data.content?.[0]?.text || '').trim(), model: modelLabel, success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model: modelLabel, success: false, error: classifyError(err, 'Claude') }; }
}
