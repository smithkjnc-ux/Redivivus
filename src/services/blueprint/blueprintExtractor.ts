// [SCOPE] Blueprint Extractor — uses AI to infer 5W answers from a user's original build prompt.
// Called before showing the New Project wizard so only genuinely unknown answers get asked.

import type { RoutingService } from '../../shared/ai/infrastructure/routingService.js';

export interface ExtractedBlueprint {
  who: string;    // empty string means unknown — ask the user
  what: string;
  where: string;
  when: string;
  why: string;
  suggestedName: string;  // derived project name slug, e.g. "snake-pong-animation"
}

const PROMPT = (task: string) => `You are analyzing a user's build request to fill in a project blueprint.
Extract the most likely answer for each of the 5 blueprint fields below.
If context is omitted, use common sense to fill in likely defaults (e.g. 'Web browser' for where, 'General public' for who, 'Personal use' for why).
Keep answers concise (under 80 chars each). Return ONLY valid JSON, no markdown, no explanation.

User request: "${task}"

Return JSON in this exact shape:
{
  "name": "<2-4 word kebab-case project name slug, e.g. snake-pong-game or task-manager-app>",
  "who": "<who will use this, or empty string>",
  "what": "<one sentence describing what it does, or empty string>",
  "where": "<platform: Web browser / Desktop app / Mobile app / CLI / Server / or empty string>",
  "when": "<timeline or urgency, or empty string>",
  "why": "<why it needs to exist, or empty string>"
}`;

/** Makes a small AI call to extract 5W blueprint answers from the user's prompt.
 *  Falls back to static heuristics if the AI call fails or returns malformed JSON. */
export async function extractBlueprintFromPrompt(
  task: string,
  routing: RoutingService
): Promise<ExtractedBlueprint> {
  try {
    const res = await routing.prompt(PROMPT(task), 10_000);
    if (res.success && res.text) {
      const cleaned = res.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        suggestedName: (typeof parsed.name === 'string' ? parsed.name : deriveNameSlug(task)).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40),
        who:   (typeof parsed.who   === 'string' ? parsed.who   : '').trim().slice(0, 120),
        what:  (typeof parsed.what  === 'string' ? parsed.what  : '').trim().slice(0, 120),
        where: (typeof parsed.where === 'string' ? parsed.where : '').trim().slice(0, 80),
        when:  (typeof parsed.when  === 'string' ? parsed.when  : '').trim().slice(0, 80),
        why:   (typeof parsed.why   === 'string' ? parsed.why   : '').trim().slice(0, 120),
      };
    }
  } catch {
    // [DEAD] JSON.parse failure or AI error — fall through to heuristic fallback
  }
  // Heuristic fallback — same logic as before, no AI cost
  return heuristicExtract(task);
}

/** Derive a readable kebab-case slug from the first few nouns/verbs of the task */
function deriveNameSlug(task: string): string {
  const STOP = new Set(['a','an','the','and','or','but','to','of','for','in','on','at','with','that','this','it','be','is','are','was','were','will','make','build','create','write','generate','i','me','my','your','single','file']);
  return task.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .slice(0, 3)
    .join('-') || 'my-project';
}

function heuristicExtract(task: string): ExtractedBlueprint {
  const t = task.toLowerCase();
  const firstSentence = task.split(/[.!?]\s+/)[0].trim();
  return {
    suggestedName: deriveNameSlug(task),
    who:   /myself|personal|just me|solo/i.test(task) ? 'myself — personal use' : 'myself',
    what:  firstSentence.length <= 120 ? firstSentence : task.slice(0, 120),
    where: /\bweb\b|browser|website|html/i.test(task) ? 'Web browser'
         : /\bdesktop\b|pc\b|mac\b|laptop\b/i.test(task) ? 'Desktop app'
         : /\bmobile\b|phone\b|android\b|ios\b/i.test(task) ? 'Mobile app'
         : /\bcli\b|command.line\b|terminal\b/i.test(task) ? 'CLI'
         : '',
    when:  'now',
    why:   '',
  };
}
