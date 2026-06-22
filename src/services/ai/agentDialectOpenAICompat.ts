// [SCOPE] OpenAI-compatible message dialect — covers openai, xai (Grok), groq, kimi, deepseek-chat.
// [WARN] o-series models (o3, o4-mini, o1) reject standard chat params: must use `developer` role
//   instead of `system`, `max_completion_tokens` instead of `max_tokens`, and no `parallel_tool_calls`.
// [WARN] kimi and deepseek-chat do not document `parallel_tool_calls` — omit it to avoid 422 errors.

import type { AgentMessage, ToolSchema, NativeCallResult } from './agentNativeCall.js';

// o-series reasoning models require different request shape than standard chat models
const O_SERIES_RE = /^o\d/;
// Only providers that document parallel_tool_calls support get the flag
const PROVIDERS_WITH_PARALLEL_FLAG = new Set(['openai', 'xai', 'groq']);

export const OPENAI_COMPAT_URLS: Record<string, string> = {
  openai:   'https://api.openai.com/v1/chat/completions',
  xai:      'https://api.x.ai/v1/chat/completions',
  groq:     'https://api.groq.com/openai/v1/chat/completions',
  kimi:     'https://api.moonshot.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
};

export function toOpenAIMessages(system: string, msgs: AgentMessage[], systemRole: 'system' | 'developer' = 'system'): any[] {
  const out: any[] = [{ role: systemRole, content: system }];
  for (const m of msgs) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const entry: any = { role: 'assistant', content: m.content ?? null };
      if (m.toolCall) {
        entry.tool_calls = [{ id: m.toolCall.id, type: 'function', function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.args) } }];
      }
      out.push(entry);
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

export async function callOpenAICompat(
  url: string, key: string, model: string, provider: string,
  system: string, messages: AgentMessage[], tools: ToolSchema[],
): Promise<NativeCallResult> {
  const isOSeries = O_SERIES_RE.test(model);
  const body: any = {
    model,
    messages: toOpenAIMessages(system, messages, isOSeries ? 'developer' : 'system'),
    tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
  };
  if (isOSeries) { body.max_completion_tokens = 8192; } else { body.max_tokens = 8192; }
  if (!isOSeries && PROVIDERS_WITH_PARALLEL_FLAG.has(provider)) { body.parallel_tool_calls = false; }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!res.ok) { throw new Error(data?.error?.message || `${model} ${res.status}: ${JSON.stringify(data?.error)}`); }
  const usage = data.usage ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 } : undefined;
  const msg = data.choices?.[0]?.message;
  if (!msg) { throw new Error('Empty response from provider'); }
  if (msg.tool_calls?.length) {
    const tc = msg.tool_calls[0];
    let args: any = {};
    try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch { /* malformed args — pass empty */ }
    return { type: 'tool_call', id: tc.id, name: tc.function.name, args, thinkingText: msg.content || undefined, model, usage };
  }
  return { type: 'text', content: msg.content ?? '', model, usage };
}
