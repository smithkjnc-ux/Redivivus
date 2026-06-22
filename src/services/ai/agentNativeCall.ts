// [SCOPE] Native function-calling entry point for the agent loop.
// Dispatches to dialect-specific callers: Anthropic (tool_use), Gemini (functionCall),
// OpenAI-compatible (tool_calls — covers openai/xai/groq/kimi/deepseek).
// Sending tool schemas via the API `tools:` parameter eliminates text-based XML workarounds.
// Dialect implementations: agentDialectAnthropic.ts, agentDialectGemini.ts, agentDialectOpenAICompat.ts
// [WARN] Always request single tool calls per turn (disable_parallel) — multi-call batches require ALL
//   results before continuing, which breaks the per-turn guard checks in the agent loop.
//
// Model-specific quirks (handled in dialect files):
//   openai o3/o4-mini  — `developer` role, `max_completion_tokens`, no parallel_tool_calls
//   deepseek-reasoner  — no function calling; fail fast so failover uses deepseek-chat
//   gemini SAFETY      — finishReason checked before reading parts
//   kimi/deepseek-chat — parallel_tool_calls omitted (not documented, causes 422)

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCall?: { id: string; name: string; args: any } }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

/** Provider-agnostic JSON Schema subset — each dialect converter maps it to the native format. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export type NativeCallResult =
  | { type: 'tool_call'; id: string; name: string; args: any; thinkingText?: string; model?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'text'; content: string; model?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; error: string };

/** Append a note to the last user message to avoid back-to-back user messages (Anthropic strict alternation). */
export function appendUserNote(messages: AgentMessage[], note: string): void {
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    (last as { role: 'user'; content: string }).content += '\n\n' + note;
  } else {
    messages.push({ role: 'user', content: note });
  }
}

// ── Context pruning ──────────────────────────────────────────────────────────────────
// [WARN] Only call for providers with contextK ≤ 32 (currently Groq llama-3.3-70b and Kimi 32k).
// Always pass the live `messages` array — pruning returns a trimmed copy, never mutates.

function estimateTokens(msgs: AgentMessage[], systemPrompt: string): number {
  const chars = systemPrompt.length + msgs.reduce((sum, m) => {
    if (m.role === 'user') return sum + m.content.length;
    if (m.role === 'assistant') return sum + (m.content?.length ?? 0) + (m.toolCall ? JSON.stringify(m.toolCall).length : 0);
    return sum + (m as { role: 'tool'; content: string }).content.length;
  }, 0);
  return Math.ceil(chars / 4);
}

/**
 * Drop oldest middle turns to fit within a provider's context limit.
 * Preserves messages[0] (task + project context) and the most recent keepTurns turn pairs.
 */
export function pruneMessages(messages: AgentMessage[], systemPrompt: string, maxTokens: number, keepTurns = 5): AgentMessage[] {
  if (estimateTokens(messages, systemPrompt) <= maxTokens) return messages;
  let tail = keepTurns * 2;
  while (tail >= 4) {
    if (messages.length > tail + 1) {
      const pruned = [messages[0], ...messages.slice(-tail)];
      if (estimateTokens(pruned, systemPrompt) <= maxTokens) return pruned;
    }
    tail -= 2;
  }
  return [messages[0], ...messages.slice(-4)];
}

// ── Public entry point ────────────────────────────────────────────────────────────────

import { callAnthropic } from './agentDialectAnthropic.js';
import { callGemini } from './agentDialectGemini.js';
import { callOpenAICompat, OPENAI_COMPAT_URLS } from './agentDialectOpenAICompat.js';

/** Call the given provider with native function calling. Returns tool_call, text, or error. */
export async function nativeAgentCall(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolSchema[],
  keys: Record<string, string>,
): Promise<NativeCallResult> {
  try {
    if (provider === 'claude') {
      if (!keys.claude) { throw new Error('No Claude API key configured'); }
      return await callAnthropic(keys.claude, model, systemPrompt, messages, tools);
    }
    if (provider === 'gemini') {
      if (!keys.gemini) { throw new Error('No Gemini API key configured'); }
      return await callGemini(keys.gemini, model, systemPrompt, messages, tools);
    }
    // [R1] deepseek-reasoner was not trained for function calling — fail fast so failover moves to deepseek-chat.
    if (provider === 'deepseek' && model === 'deepseek-reasoner') {
      throw new Error('deepseek-reasoner (R1) does not support function calling — failing over to deepseek-chat or another provider');
    }
    const baseUrl = OPENAI_COMPAT_URLS[provider];
    if (!baseUrl) { throw new Error(`Unknown provider: ${provider}`); }
    const key = keys[provider];
    if (!key) { throw new Error(`No API key configured for ${provider}`); }
    let url = baseUrl;
    if (provider === 'kimi') {
      try { const { detectKimiBase } = await import('./kimiEndpoint.js'); url = (await detectKimiBase(key)) + '/v1/chat/completions'; } catch { /* use default */ }
    }
    return await callOpenAICompat(url, key, model, provider, systemPrompt, messages, tools);
  } catch (e: any) {
    return { type: 'error', error: e?.message ?? String(e) };
  }
}
