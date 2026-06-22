// [SCOPE] Tolerant extraction of ONE tool-call from a model turn. The agent protocol asks for
// <tool_call>{json}</tool_call>, but other/weaker models emit their OWN native wrappers and we must accept
// them or their calls are SILENTLY DROPPED — the tool never runs, the loop stalls, and the model confabulates
// success for a call the harness ignored. Observed 2026-06-21: Gemini/Gemma emit <tool_code>{json}</tool_code>
// (and ```tool_code fences); the loop only matched <tool_call>, so EVERY Gemini tool call became inert text —
// the true root cause of the "claims it ran tests but nothing happened" saga. Returns a [full, jsonString]
// match (shape-compatible with the old inline regex) or null. Raw <write_file> blocks are handled separately
// and take priority — not here.

// Try, in order: XML-style <tool_call>/<tool_code> tags, then a fenced ```tool_code/```tool_call/```json block
// that contains a "name" field. The body is NON-GREEDY and the trailing close-token anchors it, so it captures
// exactly ONE tool call — the FIRST — and stops at the matching close tag. Two properties this guarantees:
//   • nested JSON (an "args" object) is captured whole — lazy `}` backtracks to the `}` before the close tag.
//   • when a model emits SEVERAL calls in one turn (and even fabricates the <tool_result>s between them, as
//     Gemini does), we take only the first real call and let the loop run it; greedy matching here would span
//     all of them into invalid JSON and the call would be silently dropped (the step-7 "formatting hiccup").
// How many tool calls did this turn contain? Models like Gemini batch SEVERAL per turn (and fabricate the
// <tool_result>s between them), but the loop runs ONE per turn — so the rest silently don't execute and the
// model finalizes believing they ran (observed 2026-06-22: 6 edit_file + npm test in one turn → only the first
// edit ran → app.js half-done). The loop uses this to tell the model the others did NOT run. Counts wrapper
// openings (XML tags or fenced blocks) that contain a JSON object.
export function countToolCalls(text: string): number {
  const xml = (text.match(/<tool_(?:call|code)\b[^>]*>\s*\{/g) || []).length;
  const fenced = (text.match(/```(?:tool_code|tool_call)\s*\n?\s*\{/g) || []).length;
  return xml + fenced;
}

export function matchToolCall(text: string): RegExpMatchArray | null {
  // 1) XML tags — tolerant of attributes/whitespace and of mismatched call/code open/close.
  const xml = text.match(/<tool_(?:call|code)\b[^>]*>\s*(\{[\s\S]*?\})\s*<\/tool_(?:call|code)>/);
  if (xml) { return xml; }
  // 2) Fenced code block used AS a tool call. Require a "name" key so a plain ```json data block isn't grabbed.
  const fenced = text.match(/```(?:tool_code|tool_call|json)\s*\n?\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*\n?\s*```/);
  if (fenced) { return fenced; }
  return null;
}
