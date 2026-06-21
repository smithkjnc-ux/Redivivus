// [SCOPE] Synthesizes the agent's final completion bubble from FACTS we actually logged — files truly
// edited, commands truly run, the migration truly executed, test counts truly parsed from output — instead
// of trusting the model's free-text summary. Weaker failover models (Gemini Flash, etc.) CONFABULATE that
// summary: they auto-complete a generic tutorial narrative ("edited src/routes/todos.ts, added a notes test,
// 7 tests passed") that cites files and tests that don't exist in THIS project. The model's words and its
// actions are two unrelated text streams; on weak models they drift apart. The cure is structural — report
// what the harness observed, not what the model claims. See the cross-ai-reliability memory.

// What the run actually did, gathered from the agent loop's own logs (not the model's narration).
export interface AgentActivity {
  filesModified: string[];                       // ctx.modifiedFiles — files write_file/edit_file truly touched
  commands: { command: string; ok: boolean }[];  // run_command invocations + whether they exited 0
  migrationRan: boolean;                          // a real migrate command executed (ctx.migrationRan)
  testSummary?: string;                           // e.g. "16 passed" — parsed from a test runner's output
}

// Pull a test-runner summary out of captured stdout/stderr. Handles vitest/jest ("N passed"/"N failed"),
// pytest ("N passed, N failed"), and Go ("ok"/"FAIL"). Returns undefined if nothing test-like is found.
export function parseTestSummary(output: string): string | undefined {
  if (!output) { return undefined; }
  const passed = /(\d+)\s+passed/i.exec(output);
  const failed = /(\d+)\s+failed/i.exec(output);
  if (passed || failed) {
    const parts: string[] = [];
    if (passed) { parts.push(`${passed[1]} passed`); }
    if (failed && failed[1] !== '0') { parts.push(`${failed[1]} failed`); }
    return parts.join(', ');
  }
  if (/\bFAIL\b/.test(output) && !/\bok\b/.test(output)) { return 'tests failed'; }
  return undefined;
}

// Find file paths the model NAMED in its summary that it never actually touched AND that don't exist on disk —
// i.e. confabulated references. We only flag path-like tokens (contain a "/" and an extension) so we don't
// trip on prose; a token is fabricated only if it's neither in filesModified nor present under root.
export function fabricatedFileClaims(modelAnswer: string, filesModified: string[], existsOnDisk: (rel: string) => boolean): string[] {
  const norm = (p: string) => p.replace(/^\.\//, '').replace(/^\/+/, '');
  const touched = new Set(filesModified.map(norm));
  const claimed = new Set<string>();
  // path-like: at least one slash, ends in a 1-5 char extension; strip surrounding backticks/quotes
  const re = /[`'"(]?([A-Za-z0-9_.-]*\/[A-Za-z0-9_./-]*\.[A-Za-z0-9]{1,5})[`'")]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(modelAnswer)) !== null) { claimed.add(norm(m[1])); }
  const fabricated: string[] = [];
  for (const c of claimed) {
    if (touched.has(c)) { continue; }       // it really did edit this
    if (existsOnDisk(c)) { continue; }      // file genuinely exists (e.g. one it read but didn't change)
    fabricated.push(c);
  }
  return fabricated;
}

// Build the completion bubble. Leads with the VERIFIED ledger always. If the model's prose cited files that
// don't exist (confabulation), suppress the prose and warn; otherwise include the prose as the human summary.
export function synthesizeCompletion(activity: AgentActivity, modelAnswer: string, existsOnDisk: (rel: string) => boolean): string {
  const lines: string[] = ['✅ **Done.** Verified from the run itself (not self-reported):', ''];

  if (activity.filesModified.length) {
    lines.push('**Files changed**');
    for (const f of activity.filesModified) { lines.push(`- \`${f.replace(/^\.\//, '')}\``); }
    lines.push('');
  }

  if (activity.commands.length) {
    lines.push('**Commands run**');
    for (const c of activity.commands) {
      const mark = c.ok ? '✅' : '❌';
      const suffix = c.ok && activity.testSummary && /test|vitest|jest|pytest|go test/i.test(c.command) ? ` → ${activity.testSummary}` : '';
      lines.push(`- ${mark} \`${c.command}\`${suffix}`);
    }
    lines.push('');
  }

  if (activity.migrationRan) { lines.push('**Database** — migration actually executed ✅', ''); }

  const fabricated = fabricatedFileClaims(modelAnswer, activity.filesModified, existsOnDisk);
  if (fabricated.length) {
    // [WARN] The model narrated work on files that were neither touched nor exist — surface the discrepancy
    // instead of the fiction. This is the whole point of the synthesizer.
    const list = fabricated.map(f => `\`${f}\``).join(', ');
    lines.push(`⚠️ _The agent's own summary referenced ${list}, which ${fabricated.length > 1 ? "weren't" : "wasn't"} part of this run — showing the verified actions above instead of that description._`);
  } else if (modelAnswer.trim()) {
    // Prose checks out — include it as the readable summary beneath the facts.
    lines.push('---', '', modelAnswer.trim());
  }

  // If we somehow logged nothing concrete, don't show an empty shell — fall back to the model's words.
  const hasFacts = activity.filesModified.length || activity.commands.length || activity.migrationRan;
  if (!hasFacts) { return modelAnswer.trim() || '✅ Done.'; }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
