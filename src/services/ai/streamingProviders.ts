// [SCOPE] Redivivus Streaming AI Providers — SSE/streaming implementations for all providers.
// Used by chatPanelBuildWorker.ts to show code appearing in real-time as the AI generates it.
// Falls back to a single onChunk call with the full response when streaming is unsupported.

import type { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';

type KeyGetter = () => string | null;
type ChunkFn = (text: string) => void;

/** Read SSE stream, extract text with the given extractor, call onChunk per chunk. Returns full text + truncated flag. */
async function readSSE(
  body: ReadableStream<Uint8Array>,
  onChunk: ChunkFn,
  extract: (json: any) => string | null,
  truncCheck: (json: any) => boolean,
): Promise<{ full: string; truncated: boolean }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {break;}
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) {continue;}
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') {continue;}
      try {
        const parsed = JSON.parse(raw);
        const chunk = extract(parsed);
        if (chunk) { full += chunk; onChunk(chunk); }
        if (truncCheck(parsed)) { truncated = true; }
      } catch { }
    }
  }
  return { full, truncated };
}

/** Stream a build from the given AI provider. Falls back to non-streaming on error. Never throws.
 *  tier drives model selection via modelRegistry: ultra=most capable, pro=guardian, flash=worker. */
export async function streamProvider(
  ai: string,
  text: string,
  onChunk: ChunkFn,
  timeoutMs = 300_000,
  systemMessage?: string,
  tier: 'flash' | 'pro' | 'ultra' = 'flash',
): Promise<AIResponse> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = ctrl.signal;
  try {
    if (ai === 'gemini') {
      const key = getGeminiKey(); if (!key) {throw new Error('No Gemini key');}
      const { bestModelForRole, tierToRole } = await import('./modelRegistry.js');
      const model = bestModelForRole('gemini', tierToRole(tier))?.modelId ?? 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${key}&alt=sse`;
      const _sysInstruction = systemMessage ? { system_instruction: { parts: [{ text: systemMessage }] } } : {};
        const body = JSON.stringify({ ..._sysInstruction, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { maxOutputTokens: 65536 } });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
      if (!res.ok || !res.body) {throw new Error(`Gemini ${res.status}`);}
      const { full, truncated } = await readSSE(res.body, onChunk,
        j => j.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
        j => j.candidates?.[0]?.finishReason === 'MAX_TOKENS',
      );
      return { text: full, model, success: !!full, error: full ? undefined : 'Empty Gemini stream', truncated };
    }

    if (ai === 'claude') {
      const key = getClaudeKey(); if (!key) {throw new Error('No Claude key');}
      const { bestModelForRole, tierToRole } = await import('./modelRegistry.js');
      const model = bestModelForRole('claude', tierToRole(tier))?.modelId ?? 'claude-haiku-4-5-20251001';
      const url = 'https://api.anthropic.com/v1/messages';
      const body = JSON.stringify({ model, max_tokens: 64000, stream: true, ...(systemMessage ? { system: systemMessage } : {}), messages: [{ role: 'user', content: text }] });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body, signal });
      if (!res.ok || !res.body) {throw new Error(`Claude ${res.status}`);}
      const { full, truncated } = await readSSE(res.body, onChunk,
        j => (j.type === 'content_block_delta' ? j.delta?.text : null) ?? null,
        j => j.type === 'message_delta' && j.delta?.stop_reason === 'max_tokens',
      );
      return { text: full, model, success: !!full, error: full ? undefined : 'Empty Claude stream', truncated };
    }

    // OpenAI-compatible: openai, groq, xai, kimi
    const { bestModelForRole, tierToRole } = await import('./modelRegistry.js');
    const role = tierToRole(tier);
    const providerMap: Record<string, { url: string; model: string; key: KeyGetter }> = {
      openai: { url: 'https://api.openai.com/v1/chat/completions',      model: bestModelForRole('openai', role)?.modelId ?? 'gpt-4o-mini',              key: getOpenAIKey },
      groq:   { url: 'https://api.groq.com/openai/v1/chat/completions', model: bestModelForRole('groq',   role)?.modelId ?? 'llama-3.3-70b-versatile',  key: getGroqKey   },
      xai:    { url: 'https://api.x.ai/v1/chat/completions',            model: bestModelForRole('xai',    role)?.modelId ?? 'grok-3-mini',               key: getXAIKey    },
      kimi:   { url: 'https://api.moonshot.ai/v1/chat/completions',     model: bestModelForRole('kimi',   role)?.modelId ?? 'moonshot-v1-32k',           key: getKimiKey   },
    };
    const p = providerMap[ai];
    if (!p) {throw new Error(`Unknown AI: ${ai}`);}
    const key = p.key(); if (!key) {throw new Error(`No key for ${ai}`);}
    const _msgs: any[] = systemMessage ? [{ role: 'system', content: systemMessage }, { role: 'user', content: text }] : [{ role: 'user', content: text }]; const body = JSON.stringify({ model: p.model, stream: true, messages: _msgs });
    const res = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body, signal });
    if (!res.ok || !res.body) {throw new Error(`${ai} ${res.status}`);}
    const { full, truncated } = await readSSE(res.body, onChunk,
      j => j.choices?.[0]?.delta?.content ?? null,
      j => j.choices?.[0]?.finish_reason === 'length',
    );
    return { text: full, model: p.model, success: !!full, error: full ? undefined : `Empty ${ai} stream`, truncated };

  } catch (err: any) {
    return { text: '', model: ai, success: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(tid);
  }
}
