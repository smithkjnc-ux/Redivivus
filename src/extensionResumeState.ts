// [SCOPE] Extension resume-state helpers — runs at activation to resume flows interrupted by a folder close/reload.
// Handles: pendingBuildTask, pendingVaultBuild, pendingNewProjectMode.

import * as vscode from 'vscode';
import { ChassisService } from './services/chassisService.js';
import { RoutingService } from './services/ai/routingService.js';
import { UsageTracker } from './services/usageTracker.js';
import { VaultService } from './services/vault/vaultService.js';
import { ChatPanel } from './ui/chat/chatPanel.js';

type ShowArgs = [ChassisService, RoutingService, UsageTracker | undefined, VaultService];

async function openPanel(args: ShowArgs, delayMs = 800): Promise<void> {
  await new Promise(r => setTimeout(r, delayMs));
  ChatPanel.show(...args);
  await new Promise(r => setTimeout(r, 400));
}

export function resumePendingState(
  context: vscode.ExtensionContext,
  showArgs: ShowArgs,
): void {
  // ── resume build task after extension reload (updateWorkspaceFolders 0→1 folder causes restart) ──
  // [FIX] Saved by onNewProject BEFORE updateWorkspaceFolders so the task survives the reload.
  const pendingResumeRaw = context.globalState.get<string>('chassis.pendingResumeTask');
  if (pendingResumeRaw) {
    context.globalState.update('chassis.pendingResumeTask', undefined);
    try {
      const { task, projectRoot } = JSON.parse(pendingResumeRaw);
      (async () => {
        await openPanel(showArgs, 1200);
        if (ChatPanel.currentPanel) { ChatPanel.currentPanel.resumeBuildTask(task, projectRoot); }
      })();
    } catch { /* ignore parse errors from stale entries */ }
    return; // skip other resume paths — this takes priority
  }

  // ── resume build task (wizard path — shows new-project panel) ──
  const pendingBuildTask = context.globalState.get<string>('chassis.pendingBuildTask');
  if (pendingBuildTask) {
    context.globalState.update('chassis.pendingBuildTask', undefined);
    (async () => {
      await openPanel(showArgs);
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.showNewProject('', pendingBuildTask, /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingBuildTask));
      }
    })();
  }

  // ── resume vault build ──
  const pendingVaultBuild = context.globalState.get<boolean>('chassis.pendingVaultBuild');
  if (pendingVaultBuild) {
    context.globalState.update('chassis.pendingVaultBuild', undefined);
    setTimeout(() => { vscode.commands.executeCommand('chassis.buildFromVault'); }, 800);
  }

  // ── show vault build summary after folder reload ──
  const pendingVaultSummary = context.globalState.get<string>('chassis.pendingVaultSummary');
  if (pendingVaultSummary) {
    context.globalState.update('chassis.pendingVaultSummary', undefined);
    (async () => {
      await openPanel(showArgs);
      const cp = ChatPanel.currentPanel;
      if (cp) {
        cp.getConversation().push({ role: 'assistant', content: pendingVaultSummary, timestamp: Date.now() });
        (cp as any).refresh();
      }
    })();
  }

  // ── clear stale flags from old code paths ──
  context.globalState.update('chassis.pendingNewProjectMode', undefined);
  context.globalState.update('chassis.pendingNewProjectTask', undefined);
}
