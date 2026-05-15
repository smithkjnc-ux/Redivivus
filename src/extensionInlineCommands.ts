// [SCOPE] Extension Inline Commands — inline command registrations for CHASSIS
// Extracted from extensionCommands.ts

import * as vscode from 'vscode';
import { ChassisService } from './services/chassisService.js';
import { RoutingService } from './services/ai/routingService.js';
import { UsageTracker } from './services/usageTracker.js';
import { VaultService } from './services/vault/vaultService.js';
import { StatusBar } from './ui/views/statusBar.js';
import { GuardianService } from './services/ai/guardianService.js';
import { RecommendationsPanel } from './services/analyzerPanel.js';
import { MapPanel } from './ui/map/mapPanel.js';
import { GitHubBackupService } from './services/githubBackupService.js';
import { registerGitHubBackupCommands } from './commands/githubBackup.js';
import { registerSetupHubCommand } from './commands/setupHub.js';
import { ChatPanel } from './ui/chat/chatPanel.js';
import { openBlueprintPanel } from './ui/views/blueprintInterviewPanel.js';
import { seedVault } from './services/vault/vaultSeeder.js';
import { registerProfileRuntimeCommand } from './commands/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './commands/startRuntimeAnalysis.js';
import { registerTerminalErrorService, getLastTerminalError } from './services/workspace/terminalErrorService.js';
import { registerInlineCommandsB } from './extensionInlineCommandsB.js';

export function registerInlineCommands(
  context: vscode.ExtensionContext,
  chassisService: ChassisService,
  routingService: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
  statusBar: StatusBar,
  refreshAll: () => void,
  githubBackupService: GitHubBackupService,
  guardianService: GuardianService,
  _suppressNextFolderAdd: { value: boolean },
): void {
// ── CHASSIS: Refresh Knowledge Base — pull GitHub patterns into vault ──
  context.subscriptions.push(vscode.commands.registerCommand('chassis.refreshKnowledgeBase', async () => {
    const token = vscode.workspace.getConfiguration('chassis').get<string>('githubToken') || undefined;
    const useGitHub = true;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'CHASSIS: Refreshing Knowledge Base...', cancellable: false },
      async (progress) => {
        try {
          const result = await seedVault(vaultService, {
            useGitHub,
            githubToken: token,
            onProgress: (msg) => progress.report({ message: msg }),
          });
          vscode.window.showInformationMessage(
            `CHASSIS: Knowledge Base refreshed — ${result.added} new patterns added (${result.fromGitHub} from GitHub, ${result.fromStarter} starter), ${result.skipped} already present.`
          );
          context.globalState.update('chassis.vaultSeeded.v1', true);
        } catch (e) {
          vscode.window.showErrorMessage(`CHASSIS: Knowledge Base refresh failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    );
  }));

  // ── GitHub auto-backup ──
    try { registerGitHubBackupCommands(context, githubBackupService); } catch (e) { console.error('[CHASSIS] GitHub backup registration failed', e); }
  githubBackupService.startTimer();

  // ── Setup hub — aggregates all global setup, shows on first install ──
  try { registerSetupHubCommand(context, githubBackupService); } catch (e) { console.error('[CHASSIS] Setup hub registration failed', e); }
  // Hook auto-backup to build finish — fires after every successful build if enabled
  ChatPanel.onBuildFinished = async (_task: string, _files: string[]) => {
    const cfg = githubBackupService.getConfig();
    if (cfg.enabled && cfg.autoBackupOnBuild) {
      await githubBackupService.backup();
    }
    // If the built project isn't in the workspace Explorer yet, add it automatically
    const builtRoot = ChatPanel.currentPanel ? (ChatPanel.currentPanel.getChassisRoot?.() || '') : '';
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const alreadyInWs = vscode.workspace.workspaceFolders?.some(f => f.uri.fsPath === builtRoot);
    if (builtRoot && !alreadyInWs) {
      // Build is done — safe to add to workspace now. Set synchronous flag BEFORE updateWorkspaceFolders
      // fires onDidChangeWorkspaceFolders (globalState.update is async and loses the race).
      _suppressNextFolderAdd.value = true;
      await context.globalState.update('chassis.suppressAutoOpen', builtRoot);
      vscode.workspace.updateWorkspaceFolders(
        vscode.workspace.workspaceFolders?.length ?? 0, 0,
        { uri: vscode.Uri.file(builtRoot) }
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.helpMeRefine', async () => {
      vscode.commands.executeCommand('chassis.postToChat', "I need help refining my idea. Can you ask me some clarifying questions?");
    })
  );

  // [CHASSIS] Global command for Recommendations panel Fix buttons — always goes directly to build
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.postToChat', async (text: string) => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      // Small delay to allow panel creation before posting
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text });
      }
    })
  );

  // [CHASSIS] Map "Chat About This" — sends structured node context to chat as Q&A, never triggers build
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.mapContextChat', async (nodeInfo: any) => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'map-context', ...nodeInfo });
      }
    })
  );

  // [CHASSIS] Edit-in-place fix: reads existing file, patches it, saves new vault blocks.
  // Used for TODO and scope (uncommented) fixes — avoids vault search and new file creation.
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.runEditFix', async (task: string, filePath: string | null, issueType: string) => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('CHASSIS: No workspace folder open.'); return; }
      // If filePath not passed (Fix All batch), parse from the task prompt
      let resolved = filePath;
      // [WARN] Strip "# CHASSIS Review — " or similar heading prefixes from file paths
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
        ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
        await new Promise(r => setTimeout(r, 300));
        if (ChatPanel.currentPanel) { await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text: task }); }
        return;
      }
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'edit-request', filePath: resolved, task, issueType });
      }
    })
  );

  // [CHASSIS] Open the inline 5W new-project form inside the Chat panel (triggered by "Set it up properly" card)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.newProjectChat', async () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        const pendingTask = ChatPanel.currentPanel.getPendingTask();
        const isSimple = /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingTask);
        ChatPanel.currentPanel.showNewProject('', pendingTask, isSimple);
      }
    })
  );

  // [CHASSIS] "Just build it" — resumes the task stored in _pendingTask without re-asking
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildSimple', async () => {
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'build-simple' });
      }
    })
  );
  registerInlineCommandsB(context, chassisService, routingService, usageTracker, vaultService, statusBar, refreshAll, githubBackupService, guardianService, _suppressNextFolderAdd);
}
