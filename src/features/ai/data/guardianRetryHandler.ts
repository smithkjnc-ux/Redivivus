// [SCOPE] Guardian Retry Handler -- 2-retry loop with user escalation on max retries.
// Extracted per Rule 9. Guardian reviews, Worker fixes targeted issues, Guardian re-reviews.
// After MAX_GUARDIAN_RETRIES failures: escalate to user in plain English, never loop indefinitely.

import type { BuildContext } from '../../../features/build/chatPanelBuild.js';

export const MAX_GUARDIAN_RETRIES = 2;

export interface RetryResult {
  code: string;
  qualityScore: number;
  escalated: boolean;
  finalIssues: string[]; // last Guardian issues, for NeverDo persistence by caller
}

export async function runGuardianWithRetry(
  ctx: BuildContext,
  initialCode: string,
  relPath: string,
  _spec: string | null,
  guardianContext: string,
): Promise<RetryResult> {
  const { routing, task, conversation, refresh } = ctx;
  let code = initialCode;
  let lastIssues: string[] = [];

  for (let attempt = 0; attempt <= MAX_GUARDIAN_RETRIES; attempt++) {
    let review: Awaited<ReturnType<typeof routing.guardianReview>> | undefined;
    try {
      review = await routing.guardianReview(task, code, 'worker', guardianContext);
    } catch {
      break; // guardian unavailable -- return current code
    }

    // Compute quality score from review signals
    let score = review?.passed ? 2 : 0;
    if (code.split('\n').length > 50) { score++; }
    if (!/TODO|FIXME|XXX/i.test(code)) { score++; }
    if (guardianContext.includes('SPEC:') && review?.passed) { score++; }
    const qualityScore = Math.min(5, score);

    if (!review || review.passed) {
      return { code, qualityScore, escalated: false, finalIssues: [] };
    }

    lastIssues = review.issues || [];

    // Max retries exhausted -- escalate to user in plain English
    if (attempt >= MAX_GUARDIAN_RETRIES) {
      const issueLines = lastIssues.length > 0
        ? lastIssues.map((iss, n) => `  ${n + 1}. ${iss}`).join('\n')
        : '  - Could not verify the code meets the requirements';
      conversation.push({
        role: 'assistant',
        content: `I tried to fix this ${MAX_GUARDIAN_RETRIES} times and it still isn't right.\n\nHere's what's wrong:\n${issueLines}\n\nWant me to try a completely different approach? Or would you like to see what was built so far?`,
        timestamp: Date.now(),
      });
      refresh();
      return { code, qualityScore, escalated: true, finalIssues: lastIssues };
    }

    // Send specific issues to Worker for targeted fix (clean frame -- no prior attempt context)
    const issues = lastIssues.length > 0
      ? lastIssues
      : (review.correctedText ? ['Code has quality issues -- see below'] : ['Code did not pass review']);
    const fixPrompt = `Fix these specific issues. Return ONLY the complete fixed code, no explanation or markdown.\n\nISSUES TO FIX:\n${issues.map((iss, n) => `${n + 1}. ${iss}`).join('\n')}\n\nORIGINAL REQUEST: "${task.slice(0, 300)}"\n\nCODE:\n${code}`;

    try {
      const fixRes = await routing.routeByComplexity(task, fixPrompt);
      if (fixRes.success && fixRes.text?.trim()) {
        const { extractCodeFromResponse } = await import('../../../features/build/chatPanelBuildInference.js');
        code = extractCodeFromResponse(fixRes.text.trim());
      }
    } catch { /* fix call failed -- Guardian will review original code again */ }
  }

  return { code, qualityScore: 2, escalated: false, finalIssues: lastIssues };
}
