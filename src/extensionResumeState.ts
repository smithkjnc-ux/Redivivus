// [SCOPE] Extension resume-state helpers — runs at activation to resume flows interrupted by a folder close/reload.
// Handles: pendingBuildTask, pendingVaultBuild, pendingNewProjectMode.

import * as vscode from 'vscode';
import type { RedivivusService } from './services/redivivusService.js';
import type { RoutingService } from './services/ai/routingService.js';
import type { UsageTracker } from './services/usageTracker.js';
import type { VaultService } from './services/vault/vaultService.js';
import { ChatPanel } from './ui/panels/chat/chatPanel';

type ShowArgs = [RedivivusService, RoutingService, UsageTracker | undefined, VaultService];

async function openPanel(args: ShowArgs, delayMs = 800, innerDelayMs = 400): Promise<void> {
  await new Promise(r => setTimeout(r, delayMs));
  ChatPanel.show(...args);
  await new Promise(r => setTimeout(r, innerDelayMs));
}

export function resumePendingState(
  context: vscode.ExtensionContext,
  showArgs: ShowArgs,
): void {
  // ── resume build task after extension reload (updateWorkspaceFolders 0→1 folder causes restart) ──
  // [FIX] Saved by onNewProject BEFORE updateWorkspaceFolders so the task survives the reload.
  const pendingResumeRaw = context.globalState.get<string>('redivivus.pendingResumeTask');
  if (pendingResumeRaw) {
    context.globalState.update('redivivus.pendingResumeTask', undefined);
    try {
      const { task, projectRoot } = JSON.parse(pendingResumeRaw);
      (async () => {
        await openPanel(showArgs, 100, 400);
        if (ChatPanel.currentPanel) {
          // [FIX] Restore chat history wiped by the window reload
          const rescuedConv = context.globalState.get<any[]>('redivivus.pendingRescueConversation');
          if (rescuedConv && rescuedConv.length > 0) {
             context.globalState.update('redivivus.pendingRescueConversation', undefined);
             const conv = ChatPanel.currentPanel.getConversation();
             conv.splice(0, conv.length, ...rescuedConv);
             (ChatPanel.currentPanel as any).refresh();
          }
          ChatPanel.currentPanel.resumeBuildTask(task, projectRoot);
        }
      })();
    } catch { /* ignore parse errors from stale entries */ }
    return; // skip other resume paths — this takes priority
  }

  // [DEAD] Removed conversation restore after intentional workspace open.
  // User wants a fresh project chat screen, not the old conversation history.
  // Build-result cards are shown via pendingBuildResult, not rescued conversation.

  // ── resume build task (wizard path — shows new-project panel) ──
  const pendingBuildTask = context.globalState.get<string>('redivivus.pendingBuildTask');
  if (pendingBuildTask) {
    context.globalState.update('redivivus.pendingBuildTask', undefined);
    (async () => {
      await openPanel(showArgs);
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.showNewProject('', pendingBuildTask, /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingBuildTask));
      }
    })();
  }

  // ── resume vault build ──
  const pendingVaultBuild = context.globalState.get<boolean>('redivivus.pendingVaultBuild');
  if (pendingVaultBuild) {
    context.globalState.update('redivivus.pendingVaultBuild', undefined);
    setTimeout(() => { vscode.commands.executeCommand('redivivus.buildFromVault'); }, 800);
  }

  // ── show vault build summary after folder reload ──
  const pendingVaultSummary = context.globalState.get<string>('redivivus.pendingVaultSummary');
  if (pendingVaultSummary) {
    context.globalState.update('redivivus.pendingVaultSummary', undefined);
    (async () => {
      await openPanel(showArgs);
      const cp = ChatPanel.currentPanel;
      if (cp) {
        cp.getConversation().push({ role: 'assistant', content: pendingVaultSummary, timestamp: Date.now() });
        (cp as any).refresh();
      }
    })();
  }

  // ── show build result card after auto-save triggered vscode.openFolder ──
  const pendingBuildResult = context.globalState.get<{
    filename: string; root: string; model?: string; tokens?: number; absPath: string; timestamp: number;
  }>('redivivus.pendingBuildResult');
  if (pendingBuildResult) {
    context.globalState.update('redivivus.pendingBuildResult', undefined);
    const { filename, model, tokens, absPath } = pendingBuildResult;
    const modelLabel = model ?? 'AI';
    const tokenStr = tokens ? ` (~${tokens.toLocaleString()} tokens)` : '';
    const previewToken = filename.endsWith('.html')
      ? `\n__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__`
      : '';
    const resultMsg = `__RESULT_CARD__\n✅ Done! Built 1 file\n\n- \`${filename}\`\n\n*Built with ${modelLabel}${tokenStr}*\n__END_RESULT_CARD__${previewToken}`;
    (async () => {
      await openPanel(showArgs, 100, 250);
      const cp = ChatPanel.currentPanel;
      if (cp) {
        cp.getConversation().push({ role: 'assistant', content: resultMsg, timestamp: Date.now() });
        (cp as any).refresh();
        // Also open the built file in the editor
        try {
          const vscodeUri = (await import('vscode')).Uri.file(absPath);
          const doc = await (await import('vscode')).workspace.openTextDocument(vscodeUri);
          await (await import('vscode')).window.showTextDocument(doc, { preview: false });
        } catch { /* best-effort */ }
      }
    })();
    return;
  }

  // ── clear stale flags from old code paths ──
  context.globalState.update('redivivus.pendingNewProjectMode', undefined);
  context.globalState.update('redivivus.pendingNewProjectTask', undefined);
}
