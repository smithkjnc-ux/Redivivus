// [SCOPE] Extension Inline Commands B — fix/resolve, map, chat, profiler, terminal error
// Extracted from extensionInlineCommands.ts

import * as vscode from 'vscode';
import { debugLog } from './services/workspace/diagnosticLogger.js';
import { ChassisService } from './services/chassisService.js';
import { RoutingService } from './services/ai/routingService.js';
import { UsageTracker } from './services/usageTracker.js';
import { VaultService } from './services/vault/vaultService.js';
import { StatusBar } from './ui/views/statusBar.js';
import { GuardianService } from './services/ai/guardianService.js';
import { RecommendationsPanel } from './services/analyzerPanel.js';
import { MapPanel } from './ui/map/mapPanel.js';
import { GitHubBackupService } from './services/githubBackupService.js';
import { ChatPanel } from './ui/chat/chatPanel.js';
import { openBlueprintPanel } from './ui/views/blueprintInterviewPanel.js';
import { registerProfileRuntimeCommand } from './commands/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './commands/startRuntimeAnalysis.js';
import { registerTerminalErrorService, getLastTerminalError } from './services/workspace/terminalErrorService.js';

export function registerInlineCommandsB(
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

  // [CHASSIS] Global command to notify the recommendations panel that a fix is complete
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resolveFix', (task: string, builtFiles?: string[]) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFinished', task, builtFiles });
      }
      // [CHASSIS] Post a plain English completion message to the chat panel
      if (ChatPanel.currentPanel) {
        const fileList = builtFiles && builtFiles.length > 0
          ? '\n\nFiles updated: ' + builtFiles.map(f => `\`${f}\``).join(', ')
          : '';
        const summary = `✅ **Fix complete!** The task is done and your project has been updated.${fileList}\n\nYou can re-run **Scan Project** from the Recommendations panel to see your updated progress.`;
        ChatPanel.currentPanel.handleMessage({ type: 'assistant-message', text: summary });
      }
      // Trigger a project-wide refresh to re-scan files and update the list
      vscode.commands.executeCommand('chassis.refreshAll');
    })
  );

  // [CHASSIS] Notify recommendations panel when a build fails/times out — lets Fix All advance past stuck items
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildFailed', (task: string, reason: string) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFailed', task, reason });
      }
    })
  );

  // [CHASSIS] Phase 4 — Architecture Map: close Chat first so Map gets the full editor width
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showMap', () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('CHASSIS: No workspace folder open.'); return; }
      const projectName = chassisService.loadConfig()?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'Project';
      debugLog(root, 'showMap', `fired — root: ${root}, project: ${projectName}`);
      // [WARN] Defer close+open to next tick — disposing panel mid-handler can swallow MapPanel.show()
      setTimeout(() => {
        debugLog(root, 'showMap', 'setTimeout fired — closing chat, opening MapPanel');
        ChatPanel.close();
        MapPanel.show(root, guardianService, projectName);
        debugLog(root, 'showMap', 'MapPanel.show() returned');
      }, 0);
    })
  );

  // [CHASSIS] Opens or reveals the chat panel — used by MapPanel back-to-chat button
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openChat', () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
    })
  );

  // [CHASSIS] Blueprint Interview — opens as a dedicated full-width panel in ViewColumn.One
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.blueprintInterview', () => {
      openBlueprintPanel(context, chassisService, routingService);
    })
  );

  // [CHASSIS] Register the refreshAll command formally
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.refreshAll', () => {
      refreshAll();
    })
  );

  // [CHASSIS] Register chassis.profileRuntime — Project Runtime Profiler
  try {
    registerProfileRuntimeCommand(context, chassisService, routingService, usageTracker, vaultService);
  } catch (e) { console.error('[CHASSIS] Failed to register chassis.profileRuntime', e); }

  // [CHASSIS] Register chassis.startRuntimeAnalysis — Runtime Analysis Engine
  try {
    registerStartRuntimeAnalysisCommand(context, chassisService, routingService, usageTracker, vaultService);
  } catch (e) { console.error('[CHASSIS] Failed to register chassis.startRuntimeAnalysis', e); }

  // [TODO] chassis.startExpandedInterview — full expanded interview not yet built.
  //        Wired to chassis.wizardRetrofit as a temporary fallback so the action
  //        card in handleDeepBuild doesn't silently fail.
  //        Replace with the real expanded interview flow when implemented.
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.startExpandedInterview', async () => {
      await vscode.commands.executeCommand('chassis.wizardRetrofit');
    })
  );

  // [CHASSIS] Terminal Error Awareness — capture terminal output for "Fix this error" injection
  registerTerminalErrorService(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.injectTerminalError', () => {
      const err = getLastTerminalError();
      if (!err) {
        vscode.window.showInformationMessage('CHASSIS: No terminal error detected. Run your project first.');
        return;
      }
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.handleMessage({ type: 'inject-terminal-error', error: err });
        ChatPanel.currentPanel['_panel']?.reveal(undefined, false);
      } else {
        ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
        // Brief delay for panel init, then inject
        setTimeout(() => {
          ChatPanel.currentPanel?.handleMessage({ type: 'inject-terminal-error', error: err });
        }, 600);
      }
    })
  );

}
