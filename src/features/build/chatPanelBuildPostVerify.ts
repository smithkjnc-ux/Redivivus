// [SCOPE] Post-write verification helpers for the orchestrated build pipeline.
// Gap 2 fix: run compile check + visual check after files are written.
// Extracted from chatPanelBuildOrchestrated.ts (Rule 9 — was 229 lines after both fixes landed).

import type { OrchestratorDeps } from './chatPanelOrchestrator.js';

/**
 * Re-runs the project's build/compile command after files are written.
 * Non-blocking: warns on failure but never prevents file delivery.
 */
export async function runBuildCompileCheck(deps: OrchestratorDeps, root: string, writtenFiles: string[]): Promise<void> {
  if (writtenFiles.length === 0) { return; }
  try {
    const { inferVerificationCommand, runPostFixVerification } = await import('../workspace/data/postFixVerification.js');
    const _verifyCmd = inferVerificationCommand(root);
    if (!_verifyCmd) { return; }
    deps.conversation.push({ role: 'assistant', content: `🔍 Running \`${_verifyCmd}\` to verify...`, timestamp: Date.now() });
    deps.refresh();
    const vr = await runPostFixVerification(_verifyCmd, root);
    deps.conversation.push({
      role: 'assistant',
      content: vr.passed
        ? `✅ **Build verified** — \`${_verifyCmd}\` passed`
        : `⚠️ **Build verification failed** — \`${_verifyCmd}\` exited ${vr.exitCode}:\n\`\`\`\n${(vr.stderr || vr.stdout).slice(0, 500)}\n\`\`\`\n_Files were written. Fix the error above to complete the build._`,
      timestamp: Date.now(),
    });
    deps.refresh();
  } catch { /* non-blocking */ }
}

/**
 * Renders the built app in a headless preview, captures a screenshot via the existing
 * html2canvas beacon, then asks a vision AI whether the output looks correct for the task.
 * Non-blocking: if the preview can't start or the AI call fails, skips silently.
 */
export async function runBuildVisualCheck(deps: OrchestratorDeps, root: string, task: string, writtenFiles: string[]): Promise<void> {
  if (writtenFiles.length === 0) { return; }
  try {
    const { runVisualVerification } = await import('../chat/ui/chatPanelVisualVerify.js');
    deps.conversation.push({ role: 'assistant', content: '👁️ Running visual check...', timestamp: Date.now() });
    deps.refresh();
    const vv = await runVisualVerification(root, task, deps.routing, 3500);
    if (!vv.applicable) { return; }
    const icon = vv.passed === true ? '✅' : vv.passed === false ? '⚠️' : '🔍';
    const label = vv.passed === true ? 'Visual check passed' : vv.passed === false ? 'Visual issue detected' : 'Visual check inconclusive';
    deps.conversation.push({
      role: 'assistant',
      content: `${icon} **${label}**${vv.snapshot ? ' _(screenshot taken)_' : ''}\n\n${vv.aiVerdict}`,
      timestamp: Date.now(),
    });
    deps.refresh();
  } catch { /* non-blocking */ }
}
