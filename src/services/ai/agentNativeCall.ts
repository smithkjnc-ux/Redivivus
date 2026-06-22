// [SCOPE] Native function-calling adapter for the agent loop.
// Three dialects: Anthropic (tool_use blocks), Gemini (functionCall parts), and OpenAI-compatible
// (tool_calls — covers openai/xai/groq/kimi/deepseek). Sending tool schemas via the API `tools:`
// parameter — the protocol each model was TRAINED on — eliminates the text-based <tool_call> XML
// workaround that caused cross-AI divergence (Gemini emitting <tool_code>, silent drops, etc.).
// Each provider family has its own message converter + non-streaming caller.
// [WARN] Always request single tool calls per turn (disable_parallel / parallel_tool_calls: false) —
// executing all tools in a multi-call batch requires returning ALL results before continuing, which
// would break the existing per-turn guard checks (migration, failing-tests, proactive-test, etc.).
//
// Model-specific quirks handled here:
//   openai o3/o4-mini  — `developer` role (not `system`), `max_completion_tokens` (not `max_tokens`)
//   deepseek-reasoner  — R1 has no function-calling support; fail fast so failover uses deepseek-chat
//   gemini SAFETY      — finishReason SAFETY/MALFORMED_FUNCTION_CALL must be detected before parts
//   kimi/deepseek-chat — `parallel_tool_calls` not documented; omitted to avoid 422 errors

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

/** Append a note to the last user message to avoid back-to-back user messages (Anthropic requires
 *  strict alternation). Guards and budget nudges should use this instead of pushing a new user msg. */
export function appendUserNote(messages: AgentMessage[], note: string): void {
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    (last as { role: 'user'; content: string }).content += '\n\n' + note;
  } else {
    messages.push({ role: 'user', content: note });
  }
}

// ── Anthropic ───────────────────────────────────────────────────────────────────────

function toAnthropicMessages(msgs: AgentMessage[]): any[] {
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
      // Tool results merge into the same user message when adjacent (Anthropic batches them)
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

async function callAnthropic(key: string, model: string, system: string, messages: AgentMessage[], tools: ToolSchema[]): Promise<NativeCallResult> {
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

// ── Google Gemini ────────────────────────────────────────────────────────────────────

function toGeminiContents(msgs: AgentMessage[]): any[] {
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

async function callGemini(key: string, model: string, system: string, messages: AgentMessage[], tools: ToolSchema[]): Promise<NativeCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  // [THINKING-BUDGET] gemini-2.5-pro uses dynamic thinking by default — up to 24K thinking tokens PER
  // TURN, invisible in the output but very real on the bill. Cap it for agent tool-calling turns where
  // deep reasoning isn't needed (the model is executing a plan, not solving a math olympiad).
  // For Flash, keep thinking off (budget 0) — it's not in the default behaviour and adds latency/cost.
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
  // [SAFETY] finishReason must be checked BEFORE reading parts — a SAFETY refusal has no content block
  // and accessing parts would return [] → empty text response → the guard loop burns all nudges silently.
  const finishReason: string = data.candidates?.[0]?.finishReason ?? '';
  if (finishReason === 'SAFETY') {
    throw new Error('Gemini safety filter triggered — task was refused. Try rephrasing or use a different model.');
  }
  if (finishReason === 'MALFORMED_FUNCTION_CALL') {
    // Model tried to call a tool but the JSON was invalid — surface as a text response so the loop
    // can nudge it to retry rather than hanging. Include the raw text if present.
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

// ── OpenAI-compatible (openai / xai / groq / kimi / deepseek) ────────────────────────

// [OSERIES] OpenAI reasoning models (o3, o4-mini, o1, …) reject the standard chat parameters:
//   • `system` role → must be `developer`
//   • `max_tokens` → must be `max_completion_tokens`
//   • `parallel_tool_calls` is unsupported — omit it
// Non-o-series models (gpt-4o, grok, llama, kimi, deepseek-chat) use the standard form.
const O_SERIES_RE = /^o\d/;
// [PARALLEL] `parallel_tool_calls: false` is only safe for providers that document it.
// Kimi and DeepSeek-chat don't list it — omitting it avoids 422 errors on those providers.
const PROVIDERS_WITH_PARALLEL_FLAG = new Set(['openai', 'xai', 'groq']);

function toOpenAIMessages(system: string, msgs: AgentMessage[], systemRole: 'system' | 'developer' = 'system'): any[] {
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

async function callOpenAICompat(url: string, key: string, model: string, provider: string, system: string, messages: AgentMessage[], tools: ToolSchema[]): Promise<NativeCallResult> {
  const isOSeries = O_SERIES_RE.test(model);
  const body: any = {
    model,
    messages: toOpenAIMessages(system, messages, isOSeries ? 'developer' : 'system'),
    tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
  };
  // o-series uses max_completion_tokens; all others use max_tokens
  if (isOSeries) { body.max_completion_tokens = 8192; } else { body.max_tokens = 8192; }
  // Only add parallel_tool_calls for providers that support it; skip on o-series (unsupported)
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

// ── Public entry point ────────────────────────────────────────────────────────────────

const OPENAI_COMPAT_URLS: Record<string, string> = {
  openai:   'https://api.openai.com/v1/chat/completions',
  xai:      'https://api.x.ai/v1/chat/completions',
  groq:     'https://api.groq.com/openai/v1/chat/completions',
  kimi:     'https://api.moonshot.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
};

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
    // [R1] DeepSeek R1 (deepseek-reasoner) is a chain-of-thought reasoning model — it emits <think>
    // blocks and was not trained for function calling. Sending `tools:` either errors or is ignored,
    // causing the agent loop to stall (every turn returns text, burning all nudges until the ceiling).
    // Fail fast here so the failover chain moves to deepseek-chat or another capable provider.
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
