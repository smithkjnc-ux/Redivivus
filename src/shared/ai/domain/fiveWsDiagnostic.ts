// [SCOPE] Five W's pre-commit diagnostic -- confirms AI is solving the RIGHT problem before build fires.
// Runs after job-sizing and triage, before any build logic. Single lightweight AI call.
// Returns aligned=true to proceed, or aligned=false with mismatch details to surface to user.
// [RULE 18] AI does the alignment check; skip logic uses fast-path heuristics only.

import type { RoutingService } from '../infrastructure/routingService.js';
import type { ChatMessage } from '../../../features/chat/ui/chatPanelHtml.js';

export interface DiagnosticResult {
  aligned: boolean;
  confidence: number;
  detectedGoal: string;
  requestedAction: string;
  mismatch?: string;
  suggestedReframe?: string;
  skipReason?: string;
  who: number; // 0-1 experience scale: 0=non-technical, 0.5=intermediate, 1=technical
}

// Fast-path skip: always skip for trivial or purely-factual requests
const SKIP_INTENTS = new Set(['question', 'command', 'offtopic', 'run', 'convert']);
const FIX_SIGNALS = /\b(not working|broken|fix|wrong|issue|bug|error|crash|doesn't|isn't|won't|can't|slow|hang|freeze|missing|fail)\b/i;

function shouldSkip(text: string, tier: string, intentType: string): string | null {
  if (SKIP_INTENTS.has(intentType)) { return `intent '${intentType}' -- no alignment check needed`; }
  if (tier === 'tell-them')   { return 'tell-them tier -- goal obvious from request'; }
  if (tier === 'look-it-up')  { return 'look-it-up tier -- factual gap only, no misalignment possible'; }
  // offer-choices with no fix signals: likely a clean new feature, skip
  if (tier === 'offer-choices' && !FIX_SIGNALS.test(text)) { return 'offer-choices, no problem signals -- additive request'; }
  return null; // run diagnostic
}

function buildDiagnosticPrompt(text: string, isFixRequest: boolean): string {
  const fixChecks = isFixRequest ? `
WHEN: Is this problem intermittent/conditional or always-broken? (fix strategy differs)
WHERE: Is the user pointing at the right place, or is the real cause somewhere upstream?
  - e.g. "fix the button in dashboard.tsx" when the behavior comes from a shared hook` : '';

  return `You are the Supervisor doing a pre-commit alignment check. Your job: confirm we're solving the RIGHT problem.
Direct, warm voice. Short sentences. Plain English.

REQUEST: "${text.slice(0, 400)}"

Checks to run:
WHAT: Does the literal request achieve what the user actually wants?
WHY: Is there a clearly better approach they haven't considered?${fixChecks}
WHO: From HOW they wrote this, infer their technical experience level.
  - 0.0-0.3: describes symptoms only, no file/function names, vague
  - 0.3-0.7: names some files or terms, knows roughly where the problem is
  - 0.7-1.0: names functions, knows what they want, specific and technical

Return ONLY valid JSON, no markdown:
{
  "aligned": true,
  "confidence": 0.0-1.0,
  "detectedGoal": "what they actually want to achieve",
  "requestedAction": "what they literally asked for",
  "mismatch": null,
  "suggestedReframe": null,
  "who": 0.0-1.0
}

IMPORTANT: Only set aligned=false for SIGNIFICANT misalignments that would waste real effort.
When in doubt, return aligned=true. Never flag cosmetic differences or minor approach variations.
If aligned=false, write mismatch in 2-3 plain English sentences (Guardian voice -- no jargon).`;
}

export async function runFiveWsDiagnostic(
  text: string,
  tier: string,
  intentType: string,
  routing: RoutingService,
): Promise<DiagnosticResult> {
  const skip = shouldSkip(text, tier, intentType);
  if (skip) {
    return { aligned: true, confidence: 1, detectedGoal: text, requestedAction: text, skipReason: skip, who: 0.5 };
  }

  const isFixRequest = intentType === 'fix' || FIX_SIGNALS.test(text);

  try {
    const res = await routing.promptCheap(buildDiagnosticPrompt(text, isFixRequest), 15_000);
    if (!res.success || !res.text) {
      return { aligned: true, confidence: 0.5, detectedGoal: text, requestedAction: text, skipReason: 'AI call failed -- proceeding', who: 0.5 };
    }
    const raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/gi, '').replace(/\n?```$/gi, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { aligned: true, confidence: 0.5, detectedGoal: text, requestedAction: text, skipReason: 'JSON parse failed', who: 0.5 };
    }
    const parsed = JSON.parse(match[0]);
    return {
      aligned: parsed.aligned !== false,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
      detectedGoal: String(parsed.detectedGoal || text),
      requestedAction: String(parsed.requestedAction || text),
      mismatch: parsed.mismatch ? String(parsed.mismatch) : undefined,
      suggestedReframe: parsed.suggestedReframe ? String(parsed.suggestedReframe) : undefined,
      who: typeof parsed.who === 'number' ? Math.max(0, Math.min(1, parsed.who)) : 0.5,
    };
  } catch {
    return { aligned: true, confidence: 0.5, detectedGoal: text, requestedAction: text, skipReason: 'diagnostic error -- proceeding', who: 0.5 };
  }
}

/** Surfaces mismatch to user as a 3-option clarify question. Returns resolved task text or null (cancelled/re-intake). */
export async function handleMismatch(
  diagnostic: DiagnosticResult,
  originalText: string,
  _routing: RoutingService,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<string | null> {
  const { encodeClarifyToken } = await import('../../../features/chat/ui/chatPanelClarify.js');
  const { setPendingClarifyResolve } = await import('../../../features/chat/ui/chatPanelClarifyBridge.js');

  const mismatchQ = {
    id: 'diagnostic_mismatch',
    question: diagnostic.mismatch || `I want to make sure I build the right thing.\n\nYou asked for: ${diagnostic.requestedAction}\nUnderlying goal: ${diagnostic.detectedGoal}`,
    options: [
      { label: 'Yes, do what I said' },
      { label: diagnostic.suggestedReframe ? `Yes -- ${diagnostic.suggestedReframe.slice(0, 60)}` : 'Yes, do what you suggested' },
      { label: "Neither -- let me explain" },
    ],
  };

  conversation.push({ role: 'assistant', content: encodeClarifyToken([mismatchQ]), timestamp: Date.now() });
  refresh();

  const answers = await new Promise<Record<string, string>>((resolve) => {
    setPendingClarifyResolve(resolve);
    setTimeout(() => resolve({ _cancelled: 'true' } as any), 300_000);
  });

  if ((answers as any)._cancelled === 'true') {
    conversation[conversation.length - 1].content = 'Build cancelled.';
    refresh();
    return null;
  }

  const choice = answers['diagnostic_mismatch'] || '';
  if (choice.startsWith('Yes, do what I said')) { return originalText; }
  if (choice.startsWith('Neither')) { return null; } // caller should trigger explore-with-them
  // "Yes -- do what you suggested"
  return diagnostic.suggestedReframe || originalText;
}
