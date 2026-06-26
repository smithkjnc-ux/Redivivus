// [SCOPE] Blueprint Gap Detector — identifies missing/weak W fields in an existing blueprint
// and returns targeted inline chat questions to fill them before a build.
// Zero AI cost — pure heuristics. Called before handleBuildRequest when blueprint health is low.

import type { Blueprint } from '../../../types/index.js';

// Min characters for a field to be considered "answered" (not just a one-word placeholder)
const MIN_FIELD_LENGTH = 12;

export interface BlueprintGap {
  field: 'who' | 'what' | 'where' | 'when' | 'why';
  question: string;
  hint: string;
  currentValue: string; // empty string if missing
}

export interface GapCheckResult {
  hasGaps: boolean;
  gaps: BlueprintGap[];
  // The sessionId to correlate pending answers when the user responds
  sessionId: string;
}

const GAP_QUESTIONS: Record<string, { question: string; hint: string }> = {
  who: {
    question: 'WHO is going to use this?',
    hint: 'e.g. "myself — hobby project" or "non-technical customers on mobile"',
  },
  what: {
    question: 'WHAT does it need to do?',
    hint: 'One sentence. The minimum thing that makes this useful.',
  },
  where: {
    question: 'WHERE does it run?',
    hint: 'Web browser, desktop app, mobile, CLI, server?',
  },
  when: {
    question: 'WHEN does this need to work?',
    hint: 'Timeline and urgency — e.g. "MVP this week" or "no deadline"',
  },
  why: {
    question: 'WHY does this need to exist?',
    hint: 'What problem is not already solved? If you can name 3 apps that do this, reconsider.',
  },
};

/**
 * Inspects the blueprint and returns a GapCheckResult.
 * Only gaps from the REQUIRED fields (who, what, where) are blocking.
 * why/when gaps are surfaced but non-blocking (asked but skippable).
 */
export function detectBlueprintGaps(blueprint: Partial<Blueprint> | null | undefined): GapCheckResult {
  const sessionId = Date.now().toString(36);

  if (!blueprint) {
    // No blueprint at all — ask the 3 core required fields
    return {
      hasGaps: true,
      sessionId,
      gaps: (['who', 'what', 'where'] as const).map(f => ({
        field: f,
        question: GAP_QUESTIONS[f].question,
        hint: GAP_QUESTIONS[f].hint,
        currentValue: '',
      })),
    };
  }

  const gaps: BlueprintGap[] = [];
  for (const field of ['who', 'what', 'where', 'when', 'why'] as const) {
    const val = (blueprint[field] || '').trim();
    if (val.length < MIN_FIELD_LENGTH) {
      gaps.push({
        field,
        question: GAP_QUESTIONS[field].question,
        hint: GAP_QUESTIONS[field].hint,
        currentValue: val,
      });
    }
  }

  return { hasGaps: gaps.length > 0, gaps, sessionId };
}

/**
 * Builds the inline chat question block text for insertion into the conversation.
 * Uses a custom token the renderer turns into an interactive form.
 */
export function buildGapPromptMessage(result: GapCheckResult, buildTask: string): string {
  const fieldList = result.gaps.map(g => g.field.toUpperCase()).join(', ');
  const lines = [
    `Before I build **"${buildTask.slice(0, 80)}"**, I need a few quick answers to write better code.`,
    `Your blueprint is missing: **${fieldList}**`,
    '',
    `__BLUEPRINT_GAPS__${result.sessionId}|||${JSON.stringify(result.gaps)}|||${encodeURIComponent(buildTask)}|||END_BLUEPRINT_GAPS__`,
  ];
  return lines.join('\n');
}

/**
 * Merge answers back into an existing (possibly partial) blueprint.
 * Returns the updated blueprint object — caller must persist it.
 */
export function applyGapAnswers(
  blueprint: Partial<Blueprint>,
  answers: Record<string, string>
): Partial<Blueprint> {
  const updated = { ...blueprint };
  for (const [field, value] of Object.entries(answers)) {
    if (value && value.trim()) {
      (updated as Record<string, string>)[field] = value.trim();
    }
  }
  return updated;
}
