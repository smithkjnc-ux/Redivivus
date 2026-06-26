// [SCOPE] Fix-mode Plan Gate. When a fix is high-stakes, show the Supervisor's plan in PLAIN ENGLISH plus
// the EDITABLE steps, and pause for the user to approve / edit / cancel BEFORE the Worker or Agent runs.
// Reuses the build plan-gate bridge (approve/cancel + the edited-text side channel). Returns whether to
// proceed, the (possibly edited) diagnosis for the Worker path, and an approvedPlan for the Agent path so
// the user's edits actually reach the agent. Fail-open: a gate error never blocks a fix.

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { generatePlanId, awaitPlanApproval, takePlanEditedText } from '../build/chatPanelBuildPlanGate.js';

const TRIVIAL = /\[TRIVIAL/i;
const HANDOFF = /\[AGENT_HANDOFF\]/i;

/** Smart-trigger: gate only high-stakes fixes (environment handoff or multi-step) unless Plan-First forces
 *  it on everything. Trivial fixes never gate. */
export function shouldGateFix(diagnosis: string, subtasks: string[], planFirst: boolean): boolean {
  if (TRIVIAL.test(diagnosis)) { return false; }
  if (planFirst) { return true; }
  return HANDOFF.test(diagnosis) || (subtasks?.length || 0) > 1;
}

/** Plain-English summary for novices. Prefer the Supervisor's explicit PLAIN: line; for an agent handoff
 *  (which has none) derive it from the reason, dropping the marker and the technical justification tail. */
function derivePlain(diagnosis: string, isAgent: boolean): string {
  const explicit = diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim();
  if (explicit) { return explicit; }
  if (isAgent) {
    let r = diagnosis.replace(/\[AGENT_HANDOFF\]/i, '').trim();
    r = r.split(/\s*[—–-]+\s*this requires|,?\s*which a write-only/i)[0].trim();
    r = r.replace(/^The user (?:wants|needs)\b.*?\bto\s+/i, 'I’ll ').replace(/^The user wants to\s+/i, 'I’ll ');
    if (r) { return r.charAt(0).toUpperCase() + r.slice(1); }
  }
  return 'I’ll make the change you asked for and check that it works.';
}

function extractPrescription(diagnosis: string): string {
  return (diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL|\[AGENT_HANDOFF|$)/i)?.[1] ?? diagnosis).trim();
}
/** Swap the user's edited steps back into the diagnosis (Worker path), preserving PLAIN: and any [MARKERS]. */
function applyEditedPrescription(diagnosis: string, edited: string): string {
  if (/PRESCRIPTION:/i.test(diagnosis)) {
    return diagnosis.replace(/PRESCRIPTION:[\s\S]*?(?=\[TRIVIAL|\[AGENT_HANDOFF|$)/i, `PRESCRIPTION:\n${edited}\n`);
  }
  return `${diagnosis}\n\nPRESCRIPTION:\n${edited}`;
}

/** Show the plan card and wait. Returns proceed + (Worker) edited diagnosis + (Agent) approvedPlan. */
export async function runFixPlanGate(
  deps: MessageHandlerDeps, diagnosis: string, subtasks: string[], targetFiles: string, userText: string,
): Promise<{ proceed: boolean; diagnosis: string; approvedPlan?: string }> {
  try {
    const isAgent = HANDOFF.test(diagnosis);
    const planId = generatePlanId();
    const plain = derivePlain(diagnosis, isAgent);
    // Agent decides files as it goes; only the Worker path has a known target up front.
    const seed = (isAgent ? userText : extractPrescription(diagnosis)).trim();
    const filesLine = isAgent
      ? `**Files:** I’ll create or edit whatever the task needs (decided as I work).`
      : `**Files I’ll touch:** \`${targetFiles}\``;
    const route = isAgent
      ? 'I’ll write the files **and run the commands myself** to verify it works (some tasks can’t be checked just by editing code).'
      : 'I’ll edit the files directly.';
    const editLabel = isAgent
      ? 'What I’ll do — edit this if you want, then Approve:'
      : 'The exact steps — edit any of this if you want, then Approve:';
    const card =
      `🗺️ **Plan — please review before I start**\n\n` +
      `**In plain English:** ${plain}\n\n${filesLine}\n\n**How I’ll do it:** ${route}\n\n**${editLabel}**\n` +
      `__PLAN_GATE__${planId}|||EDIT::${Buffer.from(seed, 'utf8').toString('base64')}|||END_PLAN_GATE__`;
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
    if (edited && edited.trim() !== seed) {
      deps.conversation.push({ role: 'assistant', content: '✏️ Got it — running your edited plan.', timestamp: Date.now() });
      deps.refresh();
      return isAgent
        ? { proceed: true, diagnosis, approvedPlan: edited.trim() }
        : { proceed: true, diagnosis: applyEditedPrescription(diagnosis, edited.trim()) };
    }
    // No edit: on the agent path still pass the user-blessed seed so the agent runs what was shown.
    return { proceed: true, diagnosis, approvedPlan: isAgent ? seed : undefined };
  } catch {
    return { proceed: true, diagnosis }; // fail-open: a gate hiccup must never block a fix
  }
}
