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

export async function callProvider(ai: string, text: string, fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>): Promise<AIResponse & { usingFallback?: string }> {
  if (ai === 'gemini') {
    const key = getGeminiKey()!;
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key;
      const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'gemini-2.5-flash', success: false, error: `Gemini API error ${res.status}: ${data.error?.message || res.statusText}` };
      return { text: (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim(), model: 'gemini-2.5-flash', success: true, usingFallback: undefined };
    } catch (err: any) { return { text: '', model: 'gemini-2.5-flash', success: false, error: classifyError(err, 'Gemini') }; }
  }

  if (ai === 'claude') {
    const key = getClaudeKey()!;
    try {
      const url = 'https://api.anthropic.com/v1/messages';
      const body = JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1024, messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'claude-3-5-haiku', success: false, error: `Claude API error ${res.status}: ${data.error?.message || res.statusText}` };
      return { text: (data.content?.[0]?.text || '').trim(), model: 'claude-3-5-haiku', success: true, usingFallback: undefined };
    } catch (err: any) { return { text: '', model: 'claude-3-5-haiku', success: false, error: classifyError(err, 'Claude') }; }
  }

  if (ai === 'openai') {
    const key = getOpenAIKey()!;
    try {
      const url = 'https://api.openai.com/v1/chat/completions';
      const body = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'gpt-4o-mini', success: false, error: `OpenAI API error ${res.status}: ${data.error?.message || res.statusText}` };
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'gpt-4o-mini', success: true, usingFallback: undefined };
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
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'llama-3.3-70b', success: true, usingFallback: undefined };
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
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'grok-3-mini', success: true, usingFallback: undefined };
    } catch (err: any) { return { text: '', model: 'grok-3-mini', success: false, error: classifyError(err, 'xAI') }; }
  }

  if (ai === 'kimi') {
    const key = getKimiKey()!;
    try {
      const url = 'https://api.moonshot.cn/v1/chat/completions';
      const body = JSON.stringify({ model: 'moonshot-v1-8k', messages: [{ role: 'user', content: text }] });
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
      const data = await res.json() as any;
      if (!res.ok) return { text: '', model: 'kimi', success: false, error: `Kimi API error ${res.status}: ${data.error?.message || res.statusText}` };
      return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'kimi', success: true, usingFallback: undefined };
    } catch (err: any) { return { text: '', model: 'kimi', success: false, error: classifyError(err, 'Kimi') }; }
  }

  return { text: '', model: 'none', success: false, error: 'Unknown AI provider: ' + ai };
}
