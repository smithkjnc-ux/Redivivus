// [SCOPE] Extension Inline Commands — inline command registrations for Redivivus
// Extracted from extensionCommands.ts

import * as vscode from 'vscode';
import type { RedivivusService } from './services/redivivusService.js';
import type { RoutingService } from './shared/ai/infrastructure/routingService.js';
import type { UsageTracker } from './services/usageTracker.js';
import type { VaultService } from './features/vault/infrastructure/vaultService.js';
import type { StatusBar } from './ui/views/statusBar.js';
import type { GuardianService } from './shared/ai/infrastructure/guardianService.js';
import { RecommendationsPanel } from './ui/panels/analyzer/analyzerPanel.js';
import { MapPanel } from './ui/map/mapPanel.js';
import type { GitHubBackupService } from './features/workspace/infrastructure/githubBackupService.js';
import { registerGitHubBackupCommands } from './features/workspace/application/githubBackup.js';
import { registerSetupHubCommand } from './features/onboarding/application/setupHub.js';
import { ChatPanel } from './features/chat/ui/chatPanel.js';
import { openBlueprintPanel } from './ui/views/blueprintInterviewPanel.js';
import { seedVault } from './features/vault/infrastructure/vaultSeeder.js';
import { registerProfileRuntimeCommand } from './commands/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './commands/startRuntimeAnalysis.js';
import { registerInlineCommandsB } from './extensionInlineCommandsB.js';

export function registerInlineCommands(
  context: vscode.ExtensionContext,
  redivivusService: RedivivusService,
  routingService: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
  statusBar: StatusBar,
  refreshAll: () => void,
  githubBackupService: GitHubBackupService,
  guardianService: GuardianService,
  _suppressNextFolderAdd: { value: boolean },
): void {
// ── Redivivus: Refresh Knowledge Base — pull GitHub patterns into vault ──
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.refreshKnowledgeBase', async () => {
    const token = vscode.workspace.getConfiguration('redivivus').get<string>('githubToken') || undefined;
    const useGitHub = true;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Redivivus: Refreshing Knowledge Base...', cancellable: false },
      async (progress) => {
        try {
          const result = await seedVault(vaultService, {
            useGitHub,
            githubToken: token,
            onProgress: (msg) => progress.report({ message: msg }),
          });
          vscode.window.showInformationMessage(
            `Redivivus: Knowledge Base refreshed — ${result.added} new patterns added (${result.fromGitHub} from GitHub, ${result.fromStarter} starter), ${result.skipped} already present.`
          );
          context.globalState.update('redivivus.vaultSeeded.v1', true);
        } catch (e) {
          vscode.window.showErrorMessage(`Redivivus: Knowledge Base refresh failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    );
  }));

  // ── GitHub commands ──
  try { registerGitHubBackupCommands(context, githubBackupService); } catch (e) { console.error('[Redivivus] GitHub backup registration failed', e); }

  // ── Setup hub — aggregates all global setup, shows on first install ──
  try { registerSetupHubCommand(context, githubBackupService); } catch (e) { console.error('[Redivivus] Setup hub registration failed', e); }
  // [FIX] Removed ChatPanel.onBuildFinished chaining — migrated to buildEvents in session.ts.
  // buildEvents.on() means each listener is independent; no chaining needed here.
  // This file has no additional build:finished work to do.

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.helpMeRefine', async () => {
      vscode.commands.executeCommand('redivivus.postToChat', "I need help refining my idea. Can you ask me some clarifying questions?");
    })
  );

  // [Redivivus] Global command for Recommendations panel Fix buttons — always goes directly to build
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.postToChat', async (text: string) => {
      ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
      // Small delay to allow panel creation before posting
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text });
      }
    })
  );

  // [Redivivus] Map "Chat About This" — sends structured node context to chat as Q&A, never triggers build
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.mapContextChat', async (nodeInfo: any) => {
      ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'map-context', ...nodeInfo });
      }
    })
  );

  // [Redivivus] Edit-in-place fix: reads existing file, patches it, saves new vault blocks.
  // Used for TODO and scope (uncommented) fixes — avoids vault search and new file creation.
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.runEditFix', async (task: string, filePath: string | null, issueType: string) => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('Redivivus: No workspace folder open.'); return; }
      // If filePath not passed (Fix All batch), parse from the task prompt
      let resolved = filePath;
      // [WARN] Strip "# Redivivus Review — " or similar heading prefixes from file paths
      if (resolved) { resolved = resolved.replace(/^#[^:]+[—\-]\s*/, '').trim(); }
      if (!resolved || resolved.startsWith('#')) {
        // Try to extract from the first line of the prompt — handles both direct and batch cases
        // Look for the first occurrence of a filename with extension on the very first line
        const firstLine = task.split('\n')[0];
        const m = firstLine.match(/([a-zA-Z0-9_\-./]+\.(?:ts|js|py|md|json|sh|go|rs|rb|html|css|tsx|jsx|yaml|yml|vue|cfg|txt|svelte|c|cpp|h))\b/i);
        resolved = m ? m[1] : null;
      }
      if (!resolved) {
        // Cannot determine target file — fall back to new-file pipeline
        ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
        await new Promise(r => setTimeout(r, 300));
        if (ChatPanel.currentPanel) { await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text: task }); }
        return;
      }
      ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'edit-request', filePath: resolved, task, issueType });
      }
    })
  );

  // [Redivivus] Open the inline 5W new-project form inside the Chat panel (triggered by "Set it up properly" card)
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.newProjectChat', async () => {
      ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        const pendingTask = ChatPanel.currentPanel.getPendingTask();
        const isSimple = /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingTask);
        ChatPanel.currentPanel.showNewProject('', pendingTask, isSimple);
      }
    })
  );

  // [Redivivus] "Just build it" — resumes the task stored in _pendingTask without re-asking
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.buildSimple', async () => {
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'build-simple' });
      }
    })
  );
  registerInlineCommandsB(context, redivivusService, routingService, usageTracker, vaultService, statusBar, refreshAll, githubBackupService, guardianService, _suppressNextFolderAdd);
}
