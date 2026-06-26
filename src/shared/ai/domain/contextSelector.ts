// [SCOPE] Context selector — AI-driven conversation turn selection for prompt injection
// Replaces fixed slice(-N).content.slice(0, 300) with relevance-based turn selection.
// [RULE 18] AI judges which turns are relevant; code handles slicing and formatting.

import type { RoutingService } from '../infrastructure/routingService.js';

export interface ConversationTurn { role: string; content: string; }

// Short conversations skip the AI call — all turns included at full length.
// Long conversations: cheap AI call selects the most relevant turns (max 6).
// Fallback on AI failure: last 6 turns, full content (no 300-char cap).
export async function selectRelevantTurns(
  conversation: ConversationTurn[],
  task: string,
  routing: RoutingService,
  maxInput = 20,
): Promise<string> {
  if (conversation.length === 0) { return ''; }
  if (conversation.length <= 6) {
    return conversation.map(m => `${m.role}: ${m.content}`).join('\n');
  }

  const recent = conversation.slice(-maxInput);
  const numbered = recent.map((m, i) => `${i + 1}. [${m.role}]: ${m.content.slice(0, 200)}`).join('\n');
  const prompt =
    `Given this task, which conversation turns provide the most useful context?\n\n` +
    `Task: "${task.slice(0, 200)}"\n\n` +
    `Turns:\n${numbered}\n\n` +
    `Reply with ONLY the turn numbers, comma-separated. Maximum 6.\n` +
    `If the last few turns are all relevant, reply: ALL`;

  try {
    const result = await routing.promptCheap(prompt, 6_000);
    const raw = result.text.trim().toUpperCase();
    if (raw === 'ALL') { return recent.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n'); }
    const indices = raw.split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= recent.length);
    if (indices.length === 0) { return recent.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n'); }
    return indices.map(i => recent[i - 1]).filter(Boolean).map(m => `${m.role}: ${m.content}`).join('\n');
  } catch {
    return recent.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
  }
}
