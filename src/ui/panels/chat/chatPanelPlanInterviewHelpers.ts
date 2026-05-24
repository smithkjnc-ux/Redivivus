// [SCOPE] Plan Mode Interview helpers — follow-up generation, summary, task building, blueprint save
// Imported by chatPanelPlanInterview.ts. Not exported directly by the extension.

/** Generates follow-up questions when 5W answers are too vague.
 * [RULE 18] Uses AI to check if game type / project specifics are already clear — no regex guessing. */
import { syncBlueprintMd } from '../../../services/blueprint/blueprintWriter';
export async function generateFollowups(answers: Record<string, string>, routing?: any): Promise<string[]> {
  const followups: string[] = [];
  const what = answers.what?.toLowerCase() || '';

  // [RULE 18] AI decides if the game type is already implicit in the description.
  // Regex cannot reliably tell "flappy bird game" (type=known) from "a game" (type=vague).
  if (/\b(game|gaming)\b/.test(what) && what.length < 60) {
    let gameTypeNeeded = true;
    if (routing) {
      try {
        const r = await routing.prompt(
          `The user wants to build: "${answers.what?.slice(0, 120)}"\nIs the specific game type (genre, mechanics, or well-known game name) already clear from this description? Reply with one word: yes or no`,
          8_000
        );
        if (r.success && r.text?.trim().toLowerCase().startsWith('yes')) { gameTypeNeeded = false; }
      } catch { /* keep default */ }
    }
    if (gameTypeNeeded) {
      followups.push("You mentioned a game -- what kind? Puzzle, RPG, action, strategy, platformer, idle?");
      followups.push("Single player or multiplayer?");
    }
  }

  if ((/\b(app|application|website|site|tool|program)\b/.test(what) && what.length < 50) || what.length < 25) {
    followups.push("What are the 2-3 most important features it absolutely needs to have?");
  }

  if (answers.why && answers.why.length < 30) {
    followups.push("Can you tell me a bit more about the problem this solves? Even one more sentence helps a lot.");
  }

  if (answers.who && answers.who.length < 15) {
    followups.push("Any idea how many people might use this, or what they're like? Tech-savvy or beginners?");
  }

  return followups;
}

/** Builds a human-readable summary from all interview answers. */
export function buildSummary(
  answers: Record<string, string>,
  followupAnswers: string[],
  followupQuestions: string[]
): string {
  const lines: string[] = [];
  if (answers.what)  { lines.push(`**What:** ${answers.what}`); }
  if (answers.who)   { lines.push(`**Who:** ${answers.who}`); }
  if (answers.where) { lines.push(`**Where:** ${answers.where}`); }
  if (answers.when)  { lines.push(`**When:** ${answers.when}`); }
  if (answers.why)   { lines.push(`**Why:** ${answers.why}`); }
  for (let i = 0; i < followupAnswers.length; i++) {
    if (followupAnswers[i]) {
      const q = followupQuestions[i].replace(/\?\s*$/, '');
      lines.push(`**Detail:** ${q} -> ${followupAnswers[i]}`);
    }
  }
  return lines.join('\n');
}

/** Builds a task string for the build pipeline from interview answers. */
export function buildTaskFromAnswers(
  answers: Record<string, string>,
  followupAnswers: string[],
  followupQuestions: string[]
): string {
  let task = `Build ${answers.what || 'a project'}`;
  if (answers.where) { task += ` for ${answers.where}`; }
  if (answers.who)   { task += ` used by ${answers.who}`; }
  const followupContext = followupAnswers
    .filter((a, i) => a && followupQuestions[i])
    .map((a, i) => `${followupQuestions[i].replace(/\?\s*$/, '')}: ${a}`)
    .join('. ');
  if (followupContext) { task += `. Details: ${followupContext}`; }
  if (answers.when) { task += `. Timeline: ${answers.when}`; }
  if (answers.why)  { task += `. Purpose: ${answers.why}`; }
  return task;
}

/**
 * [RULE 18] Uses AI to infer obvious W answers from the "what" description.
 * Returns only fields the AI is confident about — empty string fields are omitted.
 * Caller pre-fills interview.answers and skips those questions.
 */
export async function inferRemainingWs(what: string, routing: any): Promise<Record<string, string>> {
  const prompt = `The user wants to build: "${what.slice(0, 200)}"

Based on this description, fill in what you can CONFIDENTLY infer. Reply with JSON only:
{
  "who": "who will use it (e.g. 'myself', 'a team', 'customers') — or empty string if genuinely unclear",
  "where": "where it runs (e.g. 'web browser', 'desktop app', 'mobile', 'command line') — or empty string if unclear",
  "when": "timeline — almost always empty string unless the user explicitly stated a deadline",
  "why": "purpose or goal (e.g. 'for fun and learning', 'to automate a task') — or empty string if unclear"
}
Only fill fields that are OBVIOUS from context. Leave empty string for anything that requires the user to clarify.`;
  try {
    const result = await routing.prompt(prompt, 10_000);
    if (!result?.success || !result.text) { return {}; }
    const clean = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);
    const out: Record<string, string> = {};
    for (const key of ['who', 'where', 'when', 'why']) {
      if (parsed[key] && typeof parsed[key] === 'string' && parsed[key].trim()) {
        out[key] = parsed[key].trim();
      }
    }
    return out;
  } catch { return {}; }
}

/** Saves the 5W answers into the project config blueprint. */
export function saveBlueprint(deps: any, answers: Record<string, string>): void {
  try {
    const config = deps.chassis?.isInitialized?.() ? deps.chassis.loadConfig() : null;
    if (config) {
      config.blueprint = {
        ...config.blueprint,
        what: answers.what  || config.blueprint?.what  || '',
        who:  answers.who   || config.blueprint?.who   || '',
        where: answers.where || config.blueprint?.where || '',
        when: answers.when  || config.blueprint?.when  || '',
        why:  answers.why   || config.blueprint?.why   || '',
      };
      deps.chassis.saveConfig(config);
      syncBlueprintMd(deps.chassis, config);
    }
  } catch { /* never crash the interview */ }
}
