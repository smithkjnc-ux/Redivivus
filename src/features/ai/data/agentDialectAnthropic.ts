// [SCOPE] Anthropic message dialect — converts AgentMessage[] to Anthropic tool_use format and calls the Claude API.
// [WARN] Anthropic requires strict user/assistant alternation — consecutive user messages are merged into one.
// [WARN] Extended thinking: when thinkingBudget > 0, the response includes `type: 'thinking'` blocks.
//   These MUST be round-tripped verbatim in subsequent messages via _anthropicBlocks — the API rejects
//   any turn where thinking blocks were present but are now absent in the reconstructed history.
//   Never strip or rebuild assistant content when _anthropicBlocks is set. Use it as-is.

import type { AgentMessage, ToolSchema, NativeCallResult } from './agentNativeCall.js';

export function toAnthropicMessages(msgs: AgentMessage[]): any[] {
  const out: any[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      const prev = out[out.length - 1];
      if (prev?.role === 'user') {
        const arr = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
        arr.push({ type: 'text', text: m.content });
        prev.content = arr;
      } else {
        out.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant') {
      if (m._anthropicBlocks) {
        // Round-trip raw blocks (thinking + text/tool_use) exactly as the API returned them.
        out.push({ role: 'assistant', content: m._anthropicBlocks });
      } else {
        const parts: any[] = [];
        if (m.content) { parts.push({ type: 'text', text: m.content }); }
        if (m.toolCall) { parts.push({ type: 'tool_use', id: m.toolCall.id, name: m.toolCall.name, input: m.toolCall.args }); }
        out.push({ role: 'assistant', content: parts.length === 1 && !m.toolCall ? m.content : parts });
      }
    } else if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const prev = out[out.length - 1];
      if (prev?.role === 'user' && Array.isArray(prev.content)) {
        prev.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

export async function callAnthropic(
  key: string, model: string, system: string,
  messages: AgentMessage[], tools: ToolSchema[],
  thinkingBudget = 0,
): Promise<NativeCallResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  };
  if (thinkingBudget > 0) {
    headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
  }

  const body: Record<string, any> = {
    model, max_tokens: 16000, system,
    tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: toAnthropicMessages(messages),
  };
  if (thinkingBudget > 0) {
    body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  const data: any = await res.json();
  if (!res.ok) { throw new Error(data?.error?.message || `Anthropic ${res.status}: ${JSON.stringify(data?.error)}`); }

  const rawBlocks: any[] = data.content ?? [];
  const usage = data.usage ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 } : undefined;
  const thinkingBlock = rawBlocks.find((b: any) => b.type === 'thinking');
  const textBlock     = rawBlocks.find((b: any) => b.type === 'text');
  const toolBlock     = rawBlocks.find((b: any) => b.type === 'tool_use');

  if (toolBlock) {
    return {
      type: 'tool_call', id: toolBlock.id, name: toolBlock.name, args: toolBlock.input ?? {},
      thinkingText: thinkingBlock?.thinking || textBlock?.text,
      model, usage, rawBlocks,
    };
  }
  return {
    type: 'text',
    content: rawBlocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || '',
    model, usage, rawBlocks,
  };
}
