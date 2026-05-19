// [SCOPE] CHASSIS Streaming AI Providers — SSE/streaming implementations for all providers.
// Used by chatPanelBuildWorker.ts to show code appearing in real-time as the AI generates it.
// Falls back to a single onChunk call with the full response when streaming is unsupported.

import { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';

type KeyGetter = () => string | null;
type ChunkFn = (text: string) => void;

/** Read SSE stream, extract text with the given extractor, call onChunk per chunk. Returns full text. */
async function readSSE(body: ReadableStream<Uint8Array>, onChunk: ChunkFn, extract: (json: any) => string | null): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const chunk = extract(JSON.parse(raw));
        if (chunk) { full += chunk; onChunk(chunk); }
      } catch { }
    }
  }
  return full;
}

/** Stream a build from the given AI provider. Falls back to non-streaming on error. Never throws. */
export async function streamProvider(
  ai: string,
  text: string,
  onChunk: ChunkFn,
  timeoutMs = 300_000,
): Promise<AIResponse> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = ctrl.signal;
  try {
    if (ai === 'gemini') {
      const key = getGeminiKey(); if (!key) throw new Error('No Gemini key');
      const model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${key}&alt=sse`;
      const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { maxOutputTokens: 65536 } });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
      if (!res.ok || !res.body) throw new Error(`Gemini ${res.status}`);
      const full = await readSSE(res.body, onChunk, j => j.candidates?.[0]?.content?.parts?.[0]?.text ?? null);
      return { text: full, model, success: !!full, error: full ? undefined : 'Empty Gemini stream' };
    }

    if (ai === 'claude') {
      const key = getClaudeKey(); if (!key) throw new Error('No Claude key');
      const model = 'claude-haiku-4-5-20251001';
      const url = 'https://api.anthropic.com/v1/messages';
      const body = JSON.stringify({ model, max_tokens: 8192, stream: true, messages: [{ role: 'user', content: text }] });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body, signal });
      if (!res.ok || !res.body) throw new Error(`Claude ${res.status}`);
      const full = await readSSE(res.body, onChunk, j => (j.type === 'content_block_delta' ? j.delta?.text : null) ?? null);
      return { text: full, model, success: !!full, error: full ? undefined : 'Empty Claude stream' };
    }

    // OpenAI-compatible: openai, groq, xai, kimi
    const providerMap: Record<string, { url: string; model: string; key: KeyGetter }> = {
      openai: { url: 'https://api.openai.com/v1/chat/completions',         model: 'gpt-4o-mini',              key: getOpenAIKey },
      groq:   { url: 'https://api.groq.com/openai/v1/chat/completions',    model: 'llama-3.3-70b-versatile',  key: getGroqKey   },
      xai:    { url: 'https://api.x.ai/v1/chat/completions',               model: 'grok-3-mini',              key: getXAIKey    },
      kimi:   { url: 'https://api.moonshot.ai/v1/chat/completions',        model: 'moonshot-v1-32k',          key: getKimiKey   },
    };
    const p = providerMap[ai];
    if (!p) throw new Error(`Unknown AI: ${ai}`);
    const key = p.key(); if (!key) throw new Error(`No key for ${ai}`);
    const body = JSON.stringify({ model: p.model, stream: true, messages: [{ role: 'user', content: text }] });
    const res = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body, signal });
    if (!res.ok || !res.body) throw new Error(`${ai} ${res.status}`);
    const full = await readSSE(res.body, onChunk, j => j.choices?.[0]?.delta?.content ?? null);
    return { text: full, model: p.model, success: !!full, error: full ? undefined : `Empty ${ai} stream` };

  } catch (err: any) {
    return { text: '', model: ai, success: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(tid);
  }
}
