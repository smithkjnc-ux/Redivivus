// [SCOPE] Completion-guard decision for the agent loop. On an environment/verify task, decide whether to
// REFUSE a premature "final answer" and nudge the agent to actually run + verify (or report the gap) rather
// than stopping after just thinking or after writing a script it never ran. Capped at 2 nudges so a
// genuinely-impossible task (all tools missing) still gets to finish with its gap report. Extracted from
// agentService.ts to keep that loop under the 200-line limit. Pure — returns the nudge text or null.

// [BUDGET] Soft "wrap up" nudge once the loop enters its final stretch, so the agent converges (finishes +
// verifies) instead of getting cut off mid-task at the step ceiling.
export function budgetNudge(iterations: number, max: number): string {
  return `You are on step ${iterations} of ${max} (your step budget). Start wrapping up: finish the core `
    + `task, run your verification now, and give your final answer. Do not begin new sub-tasks.`;
}

// [BUDGET] Closing message when the loop hits its ceiling without a final answer — carries a Retry token so
// the user can continue from where it stopped, rather than seeing a bare error.
export function ceilingMessage(task: string, max: number): string {
  const b64 = Buffer.from(task, 'utf8').toString('base64');
  return `⏸️ I hit my step limit (${max}) on this one. Any file changes I made are saved, but I didn't get to `
    + `fully verify the result. Click below to let me continue from here.\n\n__RETRY_FIX__:${b64}__END_RETRY__`;
}

// [PROACTIVE-TEST] A code change in a project that CAN run tests should leave a test behind, so coverage
// accretes instead of every fix being verified once and forgotten. Fires at most ONCE, only when real logic
// changed and no test was written, and always offers an out so a genuinely test-less change can still finish.
function isCodeFile(p: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|php|vue|svelte)$/.test(p) && !/\.d\.ts$/.test(p);
}
export function proactiveTestNudge(
  modifiedFiles: string[],
  fw: { label: string; runCmd: string; isTestFile: (p: string) => boolean } | null,
  nudgesSoFar: number,
): string | null {
  if (nudgesSoFar >= 1 || !fw) { return null; }
  const modifiedCode = modifiedFiles.some(isCodeFile);
  const wroteTest = modifiedFiles.some((p) => fw.isTestFile(p));
  if (!modifiedCode || wroteTest) { return null; }
  return `You changed code but didn't add or update an automated test. Add a small, focused ${fw.label} test for `
    + `the behavior you just changed and run it (\`${fw.runCmd}\`) to confirm it passes — tests stay in the project `
    + `and protect this behavior on future changes. If a test genuinely doesn't apply to this change, say so in one `
    + `line and finish.`;
}

export function executionNudge(
  requiresExecution: boolean, ranCommands: number, wroteUnrunScript: boolean, nudgesSoFar: number,
  filesModified = 1,
): string | null {
  if (!requiresExecution || nudgesSoFar >= 2) { return null; }
  if (ranCommands === 0) {
    // [WEAK-MODEL] When the model has touched NOTHING (no files, no commands) and is trying to finish, a vague
    // "go verify" is useless — its real gap is step 1. Weak models (e.g. Gemini Flash) bail to a confabulated
    // success report when the work feels unbounded, so spell out the literal next actions and demand step 1 NOW.
    if (filesModified === 0) {
      return 'STOP — you are claiming this is done but you have NOT read, edited, or run ANYTHING. You only listed '
        + 'the directory. You cannot know the file contents you need to change without reading them, and nothing '
        + 'has been verified. Do the work now, one tool call at a time, in THIS order:\n'
        + '1. read_file the file that defines the data model/schema (e.g. the Prisma schema or model file).\n'
        + '2. edit_file to make the change (a small SEARCH/REPLACE — do NOT rewrite the whole file).\n'
        + '3. read_file then edit_file the endpoint/handler that must accept the new value.\n'
        + '4. run_command to apply the migration (the real migrate command for this toolchain).\n'
        + '5. run_command to run the tests and confirm they pass.\n'
        + 'Output your VERY NEXT tool call now: step 1, a read_file. Do NOT write a final answer until you have '
        + 'actually run the migration and the tests and seen their real output.';
    }
    return 'You have NOT run or verified anything yet, and this task REQUIRES running it. Use run_command to '
      + 'run the build/verification DIRECTLY — invoke the real tool itself (e.g. `pandoc ...`), not only inside '
      + 'a wrapper script.';
  }
  if (wroteUnrunScript) {
    return 'You created a script/program but never ran it. Do NOT finish: run it now (e.g. `bash your_script.sh`), '
      + 'confirm the output artifact actually exists, and state the result. If a tool or module is missing, '
      + 'run_command will surface it — then tell the user PLAINLY (in your answer, not just in a file) which ones '
      + 'are missing and how to install them.';
  }
  return null;
}
