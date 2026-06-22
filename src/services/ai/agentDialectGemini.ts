// [SCOPE] Gemini message dialect — converts AgentMessage[] to Gemini functionCall format and calls the Gemini API.
// [WARN] finishReason MUST be checked before reading parts — SAFETY/MALFORMED_FUNCTION_CALL refusals
//   produce no content block; accessing parts returns [] → empty text → guard loop burns all nudges silently.
// [WARN] gemini-2.5-pro uses dynamic thinking by default (up to 24K thinking tokens/turn) — capped to 1024
//   for agent tool-calling turns where deep reasoning adds latency/cost with no benefit.

import type { AgentMessage, ToolSchema, NativeCallResult } from './agentNativeCall.js';

export function toGeminiContents(msgs: AgentMessage[]): any[] {
  const out: any[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      const prev = out[out.length - 1];
      if (prev?.role === 'user') {
        prev.parts.push({ text: m.content });
      } else {
        out.push({ role: 'user', parts: [{ text: m.content }] });
      }
    } else if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) { parts.push({ text: m.content }); }
      if (m.toolCall) { parts.push({ functionCall: { name: m.toolCall.name, args: m.toolCall.args } }); }
      out.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const block = { functionResponse: { name: m.name, response: { result: m.content } } };
      const prev = out[out.length - 1];
      if (prev?.role === 'user') {
        prev.parts.push(block);
      } else {
        out.push({ role: 'user', parts: [block] });
      }
    }
  }
  return out;
}

export async function callGemini(
  key: string, model: string, system: string,
  messages: AgentMessage[], tools: ToolSchema[],
): Promise<NativeCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const isProThinking = model.startsWith('gemini-2.5-pro');
  const generationConfig: Record<string, any> = {
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingBudget: isProThinking ? 1024 : 0 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: toGeminiContents(messages),
      tools: [{ function_declarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
      generationConfig,
      tool_config: { function_calling_config: { mode: 'AUTO' } },
    }),
  });
  const data: any = await res.json();
  if (!res.ok) { throw new Error(data?.error?.message || `Gemini ${res.status}: ${JSON.stringify(data?.error)}`); }
  const finishReason: string = data.candidates?.[0]?.finishReason ?? '';
  if (finishReason === 'SAFETY') {
    throw new Error('Gemini safety filter triggered — task was refused. Try rephrasing or use a different model.');
  }
  if (finishReason === 'MALFORMED_FUNCTION_CALL') {
    const rawText = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('') || '';
    return { type: 'text', content: rawText || '(Gemini could not form a valid tool call — retrying)', model };
  }
  // [USAGE] Include thoughtsTokenCount so thinking costs appear in the ledger, not just output tokens.
  const meta = data.usageMetadata;
  const usage = meta ? { inputTokens: meta.promptTokenCount ?? 0, outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) } : undefined;
  const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
  const callPart = parts.find((p: any) => p.functionCall);
  const textContent = parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
  if (callPart) {
    return { type: 'tool_call', id: `gemini-${Date.now()}`, name: callPart.functionCall.name, args: callPart.functionCall.args ?? {}, thinkingText: textContent || undefined, model, usage };
  }
  return { type: 'text', content: textContent, model, usage };
}
