// [SCOPE] Blueprint inference — infers 5 W fields from a build request using a fast AI call.
// Returns each field with confidence: confident | assumed | unknown.
// Falls back to all-unknown on any failure — never blocks the build path.

import type { RoutingService } from '../ai/routingService.js';

export type WConfidence = 'confident' | 'assumed' | 'unknown';

export interface InferredW {
  field: 'who' | 'what' | 'where' | 'when' | 'why';
  label: string;
  value: string;
  confidence: WConfidence;
}

export interface BlueprintInferenceResult {
  title: string;
  fields: InferredW[];
  unknownCount: number;
  sessionId: string;
}

const LABELS: Record<string, string> = { who: 'WHO', what: 'WHAT', where: 'WHERE', when: 'WHEN', why: 'WHY' };

const FIELD_HINTS: Record<string, string> = {
  who: 'who uses this? (e.g. "myself" or "small business owners")',
  what: 'what should it do? one sentence minimum.',
  where: 'where does it run? (browser, desktop, mobile, CLI…)',
  when: 'any deadline or timeline?',
  why: 'what problem does this solve?',
};

const INFERENCE_PROMPT = `You fill in a 5-W project blueprint from a build request. Be generous with "confident" and "assumed" — only use "unknown" when you truly cannot guess.

REQUEST: "{REQUEST}"

Confidence rules:
- "confident": explicitly stated OR universally obvious for this type of project
- "assumed": reasonable default even if not stated (e.g. "no deadline" when none mentioned)
- "unknown": genuinely cannot determine — reserve for cases with no reasonable default

Specific rules (apply these always):
- ANY game/app/tool with no stated deadline → when = "No hard deadline", confidence = "assumed"
- ANY game/app/tool with no stated audience → who = "Anyone / general public", confidence = "assumed"
- ANY game/app/tool with no stated reason → why = "Personal use / fun", confidence = "assumed"
- ANY game (arcade, browser, mobile) → where = "Browser", confidence = "confident"
- The WHAT field is usually "confident" — the user told you what they want, describe it concisely
- Only "unknown" when you have NO reasonable default and the request gives NO clue

Example for "build an asteroids arcade game":
{
  "title": "Asteroids Arcade Game",
  "who": { "value": "Anyone / single player", "confidence": "assumed" },
  "what": { "value": "Classic Atari Asteroids — ship, splitting rocks, lives system", "confidence": "confident" },
  "where": { "value": "Browser — single HTML file", "confidence": "confident" },
  "when": { "value": "No hard deadline", "confidence": "assumed" },
  "why": { "value": "Fun / personal use", "confidence": "assumed" }
}

Now fill in the blueprint for the actual request above. Respond with ONLY valid JSON, no markdown:
{
  "title": "3-5 word project name",
  "who": { "value": "...", "confidence": "confident|assumed|unknown" },
  "what": { "value": "...", "confidence": "confident|assumed|unknown" },
  "where": { "value": "...", "confidence": "confident|assumed|unknown" },
  "when": { "value": "...", "confidence": "confident|assumed|unknown" },
  "why": { "value": "...", "confidence": "confident|assumed|unknown" }
}`;

export async function inferBlueprintFields(
  request: string,
  routing: RoutingService,
): Promise<BlueprintInferenceResult> {
  const sessionId = Date.now().toString(36);
  try {
    const prompt = INFERENCE_PROMPT.replace('{REQUEST}', request.slice(0, 400));
    const res = await (routing as any).prompt(prompt, 15_000);
    if (!res?.text) { return makeFallback(request, sessionId); }
    const clean = res.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    const fields: InferredW[] = (['who', 'what', 'where', 'when', 'why'] as const).map(f => {
      const raw = parsed[f] || {};
      const value = String(raw.value || '').trim();
      let conf: WConfidence = (['confident', 'assumed', 'unknown'] as const).includes(raw.confidence)
        ? raw.confidence : 'unknown';
      // [FIX] Non-empty value must be at least "assumed" — "unknown" with a value is contradictory
      if (conf === 'unknown' && value) { conf = 'assumed'; }
      return { field: f, label: LABELS[f], value, confidence: conf };
    });
    const unknownCount = fields.filter(f => f.confidence === 'unknown').length;
    return { title: String(parsed.title || request.slice(0, 40)), fields, unknownCount, sessionId };
  } catch {
    return makeFallback(request, sessionId);
  }
}

function makeFallback(request: string, sessionId: string): BlueprintInferenceResult {
  return {
    title: request.slice(0, 40),
    sessionId,
    unknownCount: 5,
    fields: (['who', 'what', 'where', 'when', 'why'] as const).map(f => ({
      field: f, label: LABELS[f], value: '', confidence: 'unknown' as WConfidence,
    })),
  };
}

/** Serialize the inference result into the task-enriched prompt that gets sent to the build pipeline. */
export function enrichTaskWithBlueprint(originalTask: string, answers: Record<string, string>): string {
  const lines = (['who', 'what', 'where', 'when', 'why'] as const)
    .filter(f => answers[f]?.trim())
    .map(f => `${LABELS[f]}: ${answers[f].trim()}`);
  if (lines.length === 0) { return originalTask; }
  return `${originalTask}\n\nProject Blueprint:\n${lines.join('\n')}`;
}

/** Build the chat message token that the renderer turns into a blueprint card. */
export function buildBlueprintCardToken(result: BlueprintInferenceResult): string {
  const payload = Buffer.from(JSON.stringify({ title: result.title, fields: result.fields })).toString('base64');
  return `__BLUEPRINT_CARD__${result.sessionId}|||${payload}|||END_BLUEPRINT_CARD__`;
}

export { FIELD_HINTS };
