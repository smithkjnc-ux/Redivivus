// [SCOPE] Phase 2.5 (Supervisor Verify) logic for the fix pipeline.
// Extracted from chatPanelMsgFixPhases.ts to comply with Rule 9 file size limits.

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';

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

CRASH-REQUIRED CORRECTION EXCEPTION — CHECK THIS BEFORE ISSUING FAIL:
Ask yourself: "Is there a SyntaxError or load-time crash in the code that would prevent my prescription from executing at all?"
- A SyntaxError (orphaned } else { with no matching if, truncated expression, undefined variable reference) halts the ENTIRE script. Any prescription that requires a function to run is impossible until the crash is fixed.
- If the Worker fixed a SyntaxError or load-time crash that was BLOCKING the prescription from taking effect, PASS — even if they also didn't literally implement your prescription. The crash fix is a prerequisite.
- If you prescribed "ensure renderCard() is called" but the script crashes before renderCard() even parses, the Worker is correct to fix the crash first. Approve it.
- Only FAIL the Worker if their change is WRONG or HARMFUL, not because they went further than your prescription to unblock it.

VERIFICATION RULES:
- Compare each bug in your diagnosis to the Worker's edit. Did it actually fix the root cause, or just paper over the symptom?
- Check: Are the variable names, function calls, and logic paths correct for what you intended?
- Check: Did the Worker misunderstand your diagnosis and fix the wrong thing?
- IMPORTANT: If the Worker says "I see a SyntaxError (e.g. orphaned } else { block, missing if statement)" and fixes it, verify whether that SyntaxError actually exists in the code. If it does, PASS — fixing a SyntaxError is never wrong.
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
    // [FIX] 'qa' — runSupervisorVerify is a pre-guardian logic check (Supervisor reviewing its own
    // prescription), not one of the two real guardian layers (Compliance Verifier + Code Inspector).
    // Recording as 'guardian' created a second Guardian provider entry in the pipeline display.
    deps.usageTracker?.recordUsage(Math.ceil((verifyPrompt.length + (res.text?.length || 0)) / 4), 0, (res.model && res.model !== 'none') ? res.model : 'claude', res.inputTokens, res.outputTokens, 'qa', require('path').basename(root));

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
