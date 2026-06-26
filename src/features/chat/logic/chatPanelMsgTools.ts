// [SCOPE] Tool-gap and readiness message handlers — extracted from chatPanelMessages.ts (Rule 9 split).
// Covers: toolgap-copy, toolgap-terminal, check-readiness, github-commit, plan-approve/revise/cancel.

import type { MessageHandlerDeps } from './chatPanelMessageDeps.js';

export async function handleToolGapCopy(msg: any): Promise<void> {
  try {
    const cmd = Buffer.from(msg.cmd || '', 'base64').toString('utf-8');
    const vs = require('vscode') as typeof import('vscode');
    await vs.env.clipboard.writeText(cmd);
    vs.window.showInformationMessage(`Copied: ${cmd}`);
  } catch { /* best-effort */ }
}

export async function handleToolGapTerminal(msg: any): Promise<void> {
  try {
    const cmd = Buffer.from(msg.cmd || '', 'base64').toString('utf-8');
    const vs = require('vscode') as typeof import('vscode');
    const term = vs.window.createTerminal('Redivivus: Install');
    term.show();
    term.sendText(cmd, false);
  } catch { /* best-effort */ }
}

export async function handleCheckReadiness(msg: any, deps: MessageHandlerDeps): Promise<void> {
  try {
    const { getActiveProjectRoot } = await import('../../project/application/activeProjectRoot.js');
    const root = (msg.root ? Buffer.from(msg.root, 'base64').toString('utf-8') : '') || getActiveProjectRoot();
    if (root) {
      const { runReadinessReport, formatReadinessReport } = await import('../build/services/productionReadiness.js');
      const report = runReadinessReport(root);
      deps.conversation.push({ role: 'assistant', content: formatReadinessReport(report, require('path').basename(root)), timestamp: Date.now() });
      deps.refresh();
    }
  } catch { /* best-effort */ }
}

export async function handleGithubCommit(msg: any, deps: MessageHandlerDeps): Promise<void> {
  let files: string[] = [], commitMsg = '';
  try { const d = JSON.parse(Buffer.from(msg.payload || '', 'base64').toString('utf-8')); files = d.files || []; commitMsg = d.message || ''; } catch {}
  (require('vscode') as typeof import('vscode')).commands.executeCommand('redivivus.githubCommitFiles', files, commitMsg, deps.panel.webview);
}

export async function handleFileSizeGateChoice(msg: any): Promise<void> {
  const { handleFileSizeGateResponse } = await import('./fileSizeGate.js');
  handleFileSizeGateResponse({ gateId: msg.gateId, choice: msg.choice });
}

export async function handleScopeSubmit(msg: any): Promise<void> {
  const { resolveScopeQuestion } = await import('../../project/application/templateScopeService.js');
  resolveScopeQuestion(msg.answer || '');
}

export async function handleScopeCancel(): Promise<void> {
  const { clearPendingScopeQuestion } = await import('../../project/application/templateScopeService.js');
  clearPendingScopeQuestion();
}

export async function handleTemplateWizard(msg: any): Promise<void> {
  try {
    const { resolveTemplateWizard } = await import('../../project/application/templateWizard.js');
    resolveTemplateWizard(msg);
  } catch { /* wizard may have already timed out */ }
}

export async function handlePlanApproval(msg: any): Promise<void> {
  const { resolvePlanApproval, setPlanEditedText } = await import('../build/chatPanelBuildPlanGate.js');
  const outcome = msg.type === 'plan-approve' ? 'approve' : msg.type === 'plan-revise' ? 'revise' : 'cancel';
  if (msg.planId) {
    if (msg.editedPlan) { setPlanEditedText(msg.planId, msg.editedPlan); }
    resolvePlanApproval(msg.planId, outcome as 'approve' | 'revise' | 'cancel');
  }
}
