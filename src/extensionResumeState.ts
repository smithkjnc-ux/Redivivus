// [SCOPE] Extension resume-state helpers — runs at activation to resume flows interrupted by a folder close/reload.
// Handles: pendingBuildTask, pendingVaultBuild, pendingNewProjectMode.

import * as vscode from 'vscode';
import type { ChassisService } from './services/chassisService.js';
import type { RoutingService } from './services/ai/routingService.js';
import type { UsageTracker } from './services/usageTracker.js';
import type { VaultService } from './services/vault/vaultService.js';
import { ChatPanel } from './ui/panels/chat/chatPanel';

type ShowArgs = [ChassisService, RoutingService, UsageTracker | undefined, VaultService];

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
  const pendingResumeRaw = context.globalState.get<string>('chassis.pendingResumeTask');
  if (pendingResumeRaw) {
    context.globalState.update('chassis.pendingResumeTask', undefined);
    try {
      const { task, projectRoot } = JSON.parse(pendingResumeRaw);
      (async () => {
        await openPanel(showArgs, 100, 400);
        if (ChatPanel.currentPanel) {
          // [FIX] Restore chat history wiped by the window reload
          const rescuedConv = context.globalState.get<any[]>('chassis.pendingRescueConversation');
          if (rescuedConv && rescuedConv.length > 0) {
             context.globalState.update('chassis.pendingRescueConversation', undefined);
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

  // ── conversation restore after intentional __OPEN_WORKSPACE__ reload (no rebuild) ──
  // [FIX] pendingRescueConversation without pendingResumeTask = user clicked Open Workspace button.
  // Restore the chat history and stop — do NOT call resumeBuildTask / handleBuildRequest.
  // [FIX] Use short delay (100ms) so rescue fires BEFORE the 500ms auto-open timer, preventing
  // a window where the timer creates an empty panel that the user sees before conversation is restored.
  const rescueOnly = context.globalState.get<any[]>('chassis.pendingRescueConversation');
  if (rescueOnly && rescueOnly.length > 0) {
    context.globalState.update('chassis.pendingRescueConversation', undefined);
    (async () => {
      await openPanel(showArgs, 100, 250);
      if (ChatPanel.currentPanel) {
        const conv = ChatPanel.currentPanel.getConversation();
        conv.splice(0, conv.length, ...rescueOnly);
        (ChatPanel.currentPanel as any).refresh();
      }
    })();
    return;
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
