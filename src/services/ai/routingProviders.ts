// [SCOPE] Routing AI provider calls — callProvider handles all AI backends (gemini, claude, openai, groq, xai, kimi)
// Called by routingService. No vault context or comment style logic here.

import { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';

/** Classify raw caught errors into a human-readable message */
function classifyError(err: any, model: string): string {
  const msg: string = err?.message || String(err);
  if (err?.name === 'AbortError' || msg.includes('aborted') || msg.includes('abort')) {
    return `Request timed out. The ${model} API did not respond in time. Try a shorter prompt or check your network.`;
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return `Network error: ${msg}. Check your internet connection.`;
  }
  if (msg.includes('JSON') || msg.includes('Unexpected token') || msg.includes('SyntaxError')) {
    return `Failed to parse ${model} response as JSON. The API may be down or returning HTML. Raw: ${msg}`;
  }
  return msg;
}

// [WARN] gemini-pro is used for Supervisor and Guardian calls — higher reasoning quality.
// gemini-flash is used for Worker calls — faster and cheaper for code generation.
export async function callProvider(ai: string, text: string, fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>, geminiModel?: 'flash' | 'pro', imageBase64?: string, imageType?: string): Promise<AIResponse & { usingFallback?: string }> {
  if (ai === 'gemini') {
    const key = getGeminiKey()!;
    const model = geminiModel === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      // [WARN] Without maxOutputTokens, Gemini defaults to a low limit that truncates code generation.
      // 65536 is the max for Gemini Flash. This is critical for generating complete game files.
      const _parts = imageBase64 ? [{ inline_data: { mime_type: imageType || 'image/png', data: imageBase64 } }, { text }] : [{ text }];
      const body = JSON.stringify({ contents: [{ role: 'user', parts: _parts }], generationConfig: { maxOutputTokens: 65536 } });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model, success: false, error: `Gemini API error ${res.status}: ${data.error?.message || res.statusText}` };
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

  if (ai === 'claude') {
    const key = getClaudeKey()!;
    // 'pro' tier = Sonnet 4 (supervisor planning, guardian review — needs reasoning)
    // default = Haiku 4.5 (worker code generation — fast, cheap, still excellent for code)
    const model = geminiModel === 'pro' ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
    const modelLabel = geminiModel === 'pro' ? 'claude-sonnet-4' : 'claude-haiku-4-5'; // [FIX] was 'claude-haiku-4' — mismatched calcCost, used wrong pricing tier
    try {
      const url = 'https://api.anthropic.com/v1/messages';
      const _content = imageBase64 ? [{ type: 'image', source: { type: 'base64', media_type: imageType || 'image/png', data: imageBase64 } }, { type: 'text', text }] : text;
      const body = JSON.stringify({ model, max_tokens: 8192, messages: [{ role: 'user', content: _content }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: modelLabel, success: false, error: `Claude API error ${res.status}: ${data.error?.message || res.statusText}` };
      const inputTokens  = data.usage?.input_tokens  ?? undefined;
      const outputTokens = data.usage?.output_tokens ?? undefined;
      return { text: (data.content?.[0]?.text || '').trim(), model: modelLabel, success: true, usingFallback: undefined, inputTokens, outputTokens };
    } catch (err: any) { return { text: '', model: modelLabel, success: false, error: classifyError(err, 'Claude') }; }
  }

  if (ai === 'openai') {
    const key = getOpenAIKey()!;
    try {
      const url = 'https://api.openai.com/v1/chat/completions';
      const body = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'gpt-4o-mini', success: false, error: `OpenAI API error ${res.status}: ${data.error?.message || res.statusText}` };
      const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
      const outputTokens = data.usage?.completion_tokens ?? undefined;
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'gpt-4o-mini', success: true, usingFallback: undefined, inputTokens, outputTokens };
    } catch (err: any) { return { text: '', model: 'gpt-4o-mini', success: false, error: classifyError(err, 'OpenAI') }; }
  }

  if (ai === 'groq') {
    const key = getGroqKey()!;
    try {
      const url = 'https://api.groq.com/openai/v1/chat/completions';
      const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'llama-3.3-70b', success: false, error: `Groq API error ${res.status}: ${data.error?.message || res.statusText}` };
      const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
      const outputTokens = data.usage?.completion_tokens ?? undefined;
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'llama-3.3-70b', success: true, usingFallback: undefined, inputTokens, outputTokens };
    } catch (err: any) { return { text: '', model: 'llama-3.3-70b', success: false, error: classifyError(err, 'Groq') }; }
  }

  if (ai === 'xai') {
    const key = getXAIKey()!;
    try {
      const url = 'https://api.x.ai/v1/chat/completions';
      const body = JSON.stringify({ model: 'grok-3-mini', messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'grok-3-mini', success: false, error: `xAI API error ${res.status}: ${data.error?.message || res.statusText}` };
      const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
      const outputTokens = data.usage?.completion_tokens ?? undefined;
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'grok-3-mini', success: true, usingFallback: undefined, inputTokens, outputTokens };
    } catch (err: any) { return { text: '', model: 'grok-3-mini', success: false, error: classifyError(err, 'xAI') }; }
  }

  if (ai === 'kimi') {
    const key = getKimiKey()!;
    try {
      const url = 'https://api.moonshot.ai/v1/chat/completions';
      const body = JSON.stringify({ model: 'moonshot-v1-32k', messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'kimi', success: false, error: `Kimi API error ${res.status}: ${data.error?.message || res.statusText}` };
      const inputTokens  = data.usage?.prompt_tokens     ?? undefined;
      const outputTokens = data.usage?.completion_tokens ?? undefined;
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'kimi', success: true, usingFallback: undefined, inputTokens, outputTokens };
    } catch (err: any) { return { text: '', model: 'kimi', success: false, error: classifyError(err, 'Kimi') }; }
  }

  return { text: '', model: 'none', success: false, error: 'Unknown AI provider: ' + ai };
}
