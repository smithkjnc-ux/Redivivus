// [SCOPE] AI-powered plain English failure explanation for the fix pipeline.
// Called when a fix exhausts all retries or throws an unrecoverable error.
// Gated by redivivus.eli5Explanations setting (default: true) so techies can disable it.
// Cost: ~100 tokens per failure — justified since 3+ expensive AI attempts already ran.

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from '../../core/routing/chatPanelMessages.js';

export interface ELI5FailureResult {
  explanation: string;  // plain English paragraph for the user
  suggestions: string[]; // 2-3 concrete next steps
}

/** Returns true when the eli5Explanations setting is enabled (default: true). */
export function eli5Enabled(): boolean {
  return vscode.workspace.getConfiguration('redivivus').get<boolean>('eli5Explanations', true);
}

/** Calls promptCheap with a tight prompt to produce a plain English failure summary.
 *  Returns null if the setting is off, routing is unavailable, or the AI call fails. */
export async function explainFixFailure(params: {
  userText: string;
  accumulatedCritiques: string[];
  guardianNote: string;
  errorMessage?: string;
  deps: MessageHandlerDeps;
}): Promise<ELI5FailureResult | null> {
  if (!eli5Enabled()) { return null; }

  const { userText, accumulatedCritiques, guardianNote, errorMessage, deps } = params;

  const critiquesSummary = accumulatedCritiques.length > 0
    ? accumulatedCritiques.slice(0, 3).map((c, i) => `Attempt ${i + 1}: ${c.slice(0, 150)}`).join('\n')
    : errorMessage?.slice(0, 300) ?? guardianNote.slice(0, 300);

  const prompt =
`The user asked: "${userText.slice(0, 200)}"

The AI tried to fix it ${accumulatedCritiques.length || 1} time(s) but failed each time.
Here is a summary of what went wrong:
${critiquesSummary}

Write a response for a non-technical user. Use plain English, no jargon.
Format your response as JSON with exactly these two fields:
{
  "explanation": "One or two sentences explaining what went wrong in plain English.",
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}
The suggestions should be concrete things the user can try next (e.g. describe the problem differently, try a simpler first step, open the file and point to the exact line).
Reply with ONLY the JSON object, nothing else.`;

  try {
    const result = await deps.routing.promptCheap(prompt, 12_000);
    if (!result.success || !result.text) { return null; }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { return null; }

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.explanation !== 'string' || !Array.isArray(parsed.suggestions)) { return null; }

    return {
      explanation: parsed.explanation.trim(),
      suggestions: (parsed.suggestions as string[]).slice(0, 3).map((s: string) => s.trim()).filter(Boolean),
    };
  } catch {
    return null;
  }
}

/** Formats the ELI5 result into a markdown block to prepend to the failure message. */
export function formatELI5Block(eli5: ELI5FailureResult): string {
  const sugLines = eli5.suggestions.map(s => `- ${s}`).join('\n');
  return `> 💡 **What happened:** ${eli5.explanation}\n>\n> **Things to try:**\n${eli5.suggestions.map(s => `> - ${s}`).join('\n')}\n\n`;
}
