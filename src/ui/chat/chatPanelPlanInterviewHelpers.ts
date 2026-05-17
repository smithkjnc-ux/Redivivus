// [SCOPE] Plan Mode Interview helpers — follow-up generation, summary, task building, blueprint save
// Imported by chatPanelPlanInterview.ts. Not exported directly by the extension.

/** Generates follow-up questions when 5W answers are too vague. */
export function generateFollowups(answers: Record<string, string>): string[] {
  const followups: string[] = [];
  const what = answers.what?.toLowerCase() || '';

  if (/\b(game|gaming)\b/.test(what) && what.length < 50) {
    followups.push("You mentioned a game -- what kind? Puzzle, RPG, action, strategy, platformer, idle?");
    followups.push("Single player or multiplayer?");
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
    }
  } catch { /* never crash the interview */ }
}
