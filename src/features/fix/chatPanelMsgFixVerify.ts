// [SCOPE] Phase 2.5 (Supervisor Verify) logic for the fix pipeline.
// Extracted from chatPanelMsgFixPhases.ts to comply with Rule 9 file size limits.

import type { MessageHandlerDeps } from './chatPanelMessages.js';

export interface SupervisorVerifyResult {
  passed: boolean;
  issues: string[];
  suggestion?: string;
}

export async function runSupervisorVerify(
  diagnosis: string,
  workerResponse: string,
  userText: string,
  deps: MessageHandlerDeps,
  root: string
): Promise<SupervisorVerifyResult> {
  const verifySystem = `You are the Supervisor AI verifying your Worker's output. You wrote the diagnosis. Now check: did the Worker LOGICALLY achieve what you asked for?

ENVIRONMENT / EXECUTION PASS-THROUGH — CHECK THIS FIRST, IT OVERRIDES THE RULES BELOW:
If fulfilling the task REQUIRES running or verifying something in the environment — executing a command, building/compiling an artifact (a PDF, a binary, a bundle), installing a tool, starting a server, rendering, or running tests — then a code-only Worker physically CANNOT complete OR verify it, and neither can you from here. Do NOT FAIL the Worker for imperfect build/execution code, and do NOT loop retrying it. Respond with ONLY the word PASS so the final reviewer can route this to the Agent that can actually run it. (Your verification is for IN-FILE logic fixes only; environment execution is handled downstream by the Agent.)

VERIFICATION RULES:
- You are checking LOGIC, not syntax. The code may compile fine but still be wrong.
- Compare each bug in your diagnosis to the Worker's edit. Did it actually fix the root cause, or just paper over the symptom?
- Check: Are the variable names, function calls, and logic paths correct for what you intended?
- Check: Did the Worker misunderstand your diagnosis and fix the wrong thing?
- CRITICAL: Your diagnosis may describe what existing code DOES as part of the analysis (e.g. "the current value is X" or "this currently works by doing Y"). Do NOT treat a description of existing behavior as a directive to preserve it. Only the explicit prescription — what you told the Worker TO DO — is what you check against. If the Worker changed code that your diagnosis described but did NOT explicitly say to keep, that is NOT a failure.
- If the Worker got it right: respond with ONLY the word PASS
- If the Worker got it wrong: respond with FAIL followed by a brief explanation of what is logically wrong and what the correct fix should be.`;

  const verifyPrompt = `ORIGINAL USER REPORT: "${userText}"

YOUR DIAGNOSIS (what you asked the Worker to fix):
${diagnosis}

WORKER'S PROPOSED FIX:
${workerResponse}

Does this fix LOGICALLY achieve what you diagnosed? Does the code change actually address the root cause you identified?`;

  try {
    const res = await deps.routing.prompt(verifyPrompt, 45_000, undefined, undefined, verifySystem);
    if (!res.success || !res.text?.trim()) {
      // Verification failed to run — pass through (don't block the pipeline)
      return { passed: true, issues: [] };
    }
    deps.usageTracker?.recordUsage(Math.ceil((verifyPrompt.length + (res.text?.length || 0)) / 4), 0, (res.model && res.model !== 'none') ? res.model : 'claude', res.inputTokens, res.outputTokens, 'supervisor', require('path').basename(root));

    const answer = res.text.trim();
    if (answer.startsWith('PASS') || answer.toLowerCase().startsWith('pass')) {
      return { passed: true, issues: [] };
    }
    // Extract the explanation after FAIL
    const explanation = answer.replace(/^FAIL\s*/i, '').trim();
    return { passed: false, issues: [explanation], suggestion: explanation };
  } catch {
    // Non-blocking — if verification errors out, let the pipeline continue
    return { passed: true, issues: [] };
  }
}
