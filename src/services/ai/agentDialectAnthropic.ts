// [SCOPE] Anthropic message dialect — converts AgentMessage[] to Anthropic tool_use format and calls the Claude API.
// [WARN] Anthropic requires strict user/assistant alternation — consecutive user messages are merged into one.
// Tool results from the agent loop are batched into a single user message using an array of tool_result blocks.

import type { AgentMessage, ToolSchema, NativeCallResult } from './agentNativeCall.js';

export function toAnthropicMessages(msgs: AgentMessage[]): any[] {
  const out: any[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      const prev = out[out.length - 1];
      if (prev?.role === 'user') {
        // Merge consecutive user messages (nudges appended after tool results)
        const arr = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
        arr.push({ type: 'text', text: m.content });
        prev.content = arr;
      } else {
        out.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) { parts.push({ type: 'text', text: m.content }); }
      if (m.toolCall) { parts.push({ type: 'tool_use', id: m.toolCall.id, name: m.toolCall.name, input: m.toolCall.args }); }
      out.push({ role: 'assistant', content: parts.length === 1 && !m.toolCall ? m.content : parts });
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
): Promise<NativeCallResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 8192, system,
      tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: toAnthropicMessages(messages),
    }),
  });
  const data: any = await res.json();
  if (!res.ok) { throw new Error(data?.error?.message || `Anthropic ${res.status}: ${JSON.stringify(data?.error)}`); }
  const usage = data.usage ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 } : undefined;
  const textBlock = data.content?.find((b: any) => b.type === 'text');
  const toolBlock = data.content?.find((b: any) => b.type === 'tool_use');
  if (toolBlock) {
    return { type: 'tool_call', id: toolBlock.id, name: toolBlock.name, args: toolBlock.input ?? {}, thinkingText: textBlock?.text, model, usage };
  }
  return { type: 'text', content: data.content?.map((b: any) => b.text ?? '').join('') || '', model, usage };
}
