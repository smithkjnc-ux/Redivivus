// [SCOPE] Fix-mode Plan Gate. When a fix is high-stakes, show the Supervisor's plan in PLAIN ENGLISH plus
// the EDITABLE technical steps, and pause for the user to approve / edit / cancel BEFORE the Worker or Agent
// runs. Reuses the build plan-gate bridge (approve/cancel + the edited-text side channel). Returns whether
// to proceed and the (possibly user-edited) diagnosis. Fail-open: a gate error never blocks a fix.

import type { MessageHandlerDeps } from './chatPanelMessages';
import { generatePlanId, awaitPlanApproval, takePlanEditedText } from '../build/chatPanelBuildPlanGate.js';

const TRIVIAL = /\[TRIVIAL/i;
const HANDOFF = /\[AGENT_HANDOFF\]/i;

/** Smart-trigger: gate only high-stakes fixes — an environment handoff or a multi-step change — unless the
 *  user turned Plan-First on (force the gate on everything). Trivial fixes never gate. */
export function shouldGateFix(diagnosis: string, subtasks: string[], planFirst: boolean): boolean {
  if (TRIVIAL.test(diagnosis)) { return false; }
  if (planFirst) { return true; }
  return HANDOFF.test(diagnosis) || (subtasks?.length || 0) > 1;
}

function extractPlain(diagnosis: string): string {
  return diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim() ?? '';
}
function extractPrescription(diagnosis: string): string {
  return (diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL|\[AGENT_HANDOFF|$)/i)?.[1] ?? diagnosis).trim();
}
/** Swap the user's edited steps back into the diagnosis, preserving PLAIN: and any [MARKERS] (route/trivia)
 *  so editing the steps never accidentally changes how the fix is routed. */
function applyEditedPrescription(diagnosis: string, edited: string): string {
  if (/PRESCRIPTION:/i.test(diagnosis)) {
    return diagnosis.replace(/PRESCRIPTION:[\s\S]*?(?=\[TRIVIAL|\[AGENT_HANDOFF|$)/i, `PRESCRIPTION:\n${edited}\n`);
  }
  return `${diagnosis}\n\nPRESCRIPTION:\n${edited}`;
}

/** Show the plan card and wait. Returns { proceed, diagnosis } — diagnosis carries the user's edits if any. */
export async function runFixPlanGate(
  deps: MessageHandlerDeps, diagnosis: string, subtasks: string[], targetFiles: string,
): Promise<{ proceed: boolean; diagnosis: string }> {
  try {
    const planId = generatePlanId();
    const plain = extractPlain(diagnosis) || 'I’ll make the change you asked for and check that it works.';
    const steps = extractPrescription(diagnosis);
    const route = HANDOFF.test(diagnosis)
      ? 'I’ll write the files **and run the commands myself** to verify it works (some tasks can’t be checked just by editing code).'
      : 'I’ll edit the files directly.';
    const card =
      `🗺️ **Plan — please review before I start**\n\n` +
      `**In plain English:** ${plain}\n\n` +
      `**Files I’ll touch:** \`${targetFiles}\`\n\n` +
      `**How I’ll do it:** ${route}\n\n` +
      `**The exact steps — edit any of this if you want, then Approve:**\n` +
      `__PLAN_GATE__${planId}|||EDIT::${Buffer.from(steps, 'utf8').toString('base64')}|||END_PLAN_GATE__`;
    deps.conversation.push({ role: 'assistant', content: card, timestamp: Date.now() });
    deps.refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

    const decision = await awaitPlanApproval(planId, deps.conversation, deps.refresh);
    if (decision === 'cancel') {
      deps.conversation.push({ role: 'assistant', content: '✋ Plan cancelled — nothing was changed. Tweak your request and send again whenever you’re ready.', timestamp: Date.now() });
      deps.refresh();
      return { proceed: false, diagnosis };
    }
    const edited = takePlanEditedText(planId);
    if (edited && edited !== steps) {
      deps.conversation.push({ role: 'assistant', content: '✏️ Got it — running your edited plan.', timestamp: Date.now() });
      deps.refresh();
      return { proceed: true, diagnosis: applyEditedPrescription(diagnosis, edited) };
    }
    return { proceed: true, diagnosis };
  } catch {
    return { proceed: true, diagnosis }; // fail-open: a gate hiccup must never block a fix
  }
}
