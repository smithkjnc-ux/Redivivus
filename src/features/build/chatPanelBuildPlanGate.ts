// [SCOPE] Build Plan Approval Gate — formats Supervisor plan for user review, pauses until approved
// Bridges webview plan-approve/plan-revise/plan-cancel messages back to the build pipeline Promise.

import type { ChatMessage } from '../chat/ui/chatPanelHtml.js';

export type PlanDecision = 'approve' | 'revise' | 'cancel';

// [WARN] Pending resolvers must be cleaned up on timeout — stale resolvers block future builds
const _pendingPlanApprovals = new Map<string, (decision: PlanDecision) => void>();
let _planIdCounter = 0;

// [PLAN-EDIT] Side channel for an EDITED plan (fix-mode inline edit). Kept separate from the decision so
// awaitPlanApproval's signature stays unchanged → build mode is untouched. The webview posts the textarea
// value with the approve message; the fix gate reads it once after approval.
const _planEdits = new Map<string, string>();
export function setPlanEditedText(planId: string, text: string): void {
  if (typeof text === 'string' && text.trim()) { _planEdits.set(planId, text.trim()); }
}
export function takePlanEditedText(planId: string): string | undefined {
  const t = _planEdits.get(planId); _planEdits.delete(planId); return t;
}

/** Resolve a pending plan approval from a webview message */
export function resolvePlanApproval(planId: string, decision: PlanDecision): void {
  const resolve = _pendingPlanApprovals.get(planId);
  if (resolve) { _pendingPlanApprovals.delete(planId); resolve(decision); }
}

/** Format a Supervisor spec into a user-friendly plan card and inject into conversation */
export function formatPlanForApproval(
  spec: string,
  relPath: string,
  tier: 'nano' | 'standard' | 'deep',
  planId: string,
): string {
  const tierBadge = tier === 'nano' ? '🟢' : tier === 'standard' ? '🟡' : '🔴';
  const lines = [
    `${tierBadge} **Build Plan** — Review before I start`,
    ``,
    `**Target:** \`${relPath}\``,
    ``,
    `**Supervisor's Plan:**`,
  ];
  // Format spec into readable bullet points
  const specLines = spec.split('\n').filter(l => l.trim().length > 0);
  for (const line of specLines) {
    lines.push(`> ${line}`);
  }
  lines.push(``);
  lines.push(`__PLAN_GATE__${planId}|||END_PLAN_GATE__`);
  return lines.join('\n');
}

/** Format a multi-step orchestrated plan for user approval */
export function formatOrchestratedPlanForApproval(
  steps: Array<{ stepNumber: number; description: string; assignedLabel: string }>,
  phaseName: string,
  planId: string,
): string {
  const lines = [
    `🔴 **Build Plan** — Review before I start`,
    ``,
    `**Phase:** ${phaseName}`,
    ``,
    `**Step-by-step breakdown:**`,
  ];
  for (const step of steps) {
    lines.push(`  **Step ${step.stepNumber}** — ${step.assignedLabel}: ${step.description}`);
  }
  lines.push(``);
  lines.push(`__PLAN_GATE__${planId}|||END_PLAN_GATE__`);
  return lines.join('\n');
}

/**
 * Pauses the build pipeline and waits for user approval via webview button click.
 * Returns the user's decision. Times out after 5 minutes → cancel.
 * [WARN] Caller MUST check the return value — 'cancel' means abort the build.
 */
export async function awaitPlanApproval(
  planId: string,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<PlanDecision> {
  return new Promise<PlanDecision>((resolve) => {
    _pendingPlanApprovals.set(planId, resolve);
    // [WARN] 5 minute timeout — stale resolvers are a known dead end (see dead_ends.md)
    setTimeout(() => {
      if (_pendingPlanApprovals.has(planId)) {
        _pendingPlanApprovals.delete(planId);
        conversation.push({ role: 'assistant', content: '⏱️ Plan approval timed out — build cancelled.', timestamp: Date.now() });
        refresh();
        resolve('cancel');
      }
    }, 300_000);
  });
}

/** Generate a unique plan ID */
export function generatePlanId(): string {
  _planIdCounter++;
  return `plan-${Date.now()}-${_planIdCounter}`;
}
