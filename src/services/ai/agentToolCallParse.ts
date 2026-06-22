// [SCOPE] Tolerant extraction of ONE tool-call from a model turn. The agent protocol asks for
// <tool_call>{json}</tool_call>, but other/weaker models emit their OWN native wrappers and we must accept
// them or their calls are SILENTLY DROPPED — the tool never runs, the loop stalls, and the model confabulates
// success for a call the harness ignored. Observed 2026-06-21: Gemini/Gemma emit <tool_code>{json}</tool_code>
// (and ```tool_code fences); the loop only matched <tool_call>, so EVERY Gemini tool call became inert text —
// the true root cause of the "claims it ran tests but nothing happened" saga. Returns a [full, jsonString]
// match (shape-compatible with the old inline regex) or null. Raw <write_file> blocks are handled separately
// and take priority — not here.

// Try, in order: XML-style <tool_call>/<tool_code> tags, then a fenced ```tool_code/```tool_call/```json block
// that contains a "name" field. The trailing close-token anchors the non-greedy body so nested JSON (args
// objects) is captured whole (it extends to the `}` right before the closing tag/fence).
export function matchToolCall(text: string): RegExpMatchArray | null {
  // 1) XML tags — tolerant of attributes/whitespace and of mismatched call/code open/close.
  const xml = text.match(/<tool_(?:call|code)\b[^>]*>\s*(\{[\s\S]*\})\s*<\/tool_(?:call|code)>/);
  if (xml) { return xml; }
  // 2) Fenced code block used AS a tool call. Require a "name" key so a plain ```json data block isn't grabbed.
  const fenced = text.match(/```(?:tool_code|tool_call|json)\s*\n?\s*(\{[\s\S]*"name"[\s\S]*\})\s*\n?\s*```/);
  if (fenced) { return fenced; }
  return null;
}
