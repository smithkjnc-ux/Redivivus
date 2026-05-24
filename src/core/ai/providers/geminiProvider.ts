// [SCOPE] Gemini AI provider implementation

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { getGeminiKey } from '../../../services/ai/routingKeys.js';
import { classifyError } from './providerUtils.js';

// [WARN] gemini-pro is used for Supervisor and Guardian calls — higher reasoning quality.
// gemini-flash is used for Worker calls — faster and cheaper for code generation.
export async function executeGemini(
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  geminiModel?: 'flash' | 'pro',
  imageBase64?: string,
  imageType?: string,
  systemMessage?: string
): Promise<AIResponse & { usingFallback?: string }> {
  const key = getGeminiKey()!;
  const model = geminiModel === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    // [WARN] Without maxOutputTokens, Gemini defaults to a low limit that truncates code generation.
    // 65536 is the max for Gemini Flash. This is critical for generating complete game files.
    const _parts = imageBase64 ? [{ inline_data: { mime_type: imageType || 'image/png', data: imageBase64 } }, { text }] : [{ text }];
    const _sysInstruction = systemMessage ? { system_instruction: { parts: [{ text: systemMessage }] } } : {};
    const body = JSON.stringify({ ..._sysInstruction, contents: [{ role: 'user', parts: _parts }], generationConfig: { maxOutputTokens: 65536 } });
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json() as any;
    if (!res.ok) {return { text: '', model, success: false, error: `Gemini API error ${res.status}: ${data.error?.message || res.statusText}` };}
    // [WARN] Check finishReason — MAX_TOKENS means the response was truncated
    const finishReason = data.candidates?.[0]?.finishReason;
    const responseText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const inputTokens  = data.usageMetadata?.promptTokenCount    ?? undefined;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? undefined;
    if (finishReason === 'MAX_TOKENS') {
      return { text: responseText, model, success: false, error: `Gemini response was truncated (hit output token limit). Response may be incomplete.`, inputTokens, outputTokens };
    }
    return { text: responseText, model, success: true, usingFallback: undefined, inputTokens, outputTokens };
  } catch (err: any) { return { text: '', model, success: false, error: classifyError(err, 'Gemini') }; }
}
