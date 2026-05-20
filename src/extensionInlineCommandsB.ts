// [SCOPE] Extension Inline Commands B — fix/resolve, map, chat, profiler, expanded interview.
// chassis.runProject + chassis.inspectElement + chassis.injectTerminalError extracted to extensionInlineCommandsC.ts.

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
import { showBuildHistoryPanel } from './ui/views/buildHistoryPanel.js';
import { registerInlineCommandsC } from './extensionInlineCommandsC.js';

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

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resolveFix', (task: string, builtFiles?: string[]) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFinished', task, builtFiles });
      }
      if (ChatPanel.currentPanel) {
        const fileList = builtFiles && builtFiles.length > 0 ? '\n\nFiles updated: ' + builtFiles.map(f => `\`${f}\``).join(', ') : '';
        const summary = `Fix complete! The task is done and your project has been updated.${fileList}\n\nYou can re-run **Scan Project** from the Recommendations panel to see your updated progress.`;
        ChatPanel.currentPanel.handleMessage({ type: 'assistant-message', text: summary });
      }
      vscode.commands.executeCommand('chassis.refreshAll');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildFailed', (task: string, reason: string) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFailed', task, reason });
      }
    })
  );

  // [WARN] Defer close+open to next tick — disposing panel mid-handler can swallow MapPanel.show()
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showMap', () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('CHASSIS: No workspace folder open.'); return; }
      const projectName = chassisService.loadConfig()?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'Project';
      debugLog(root, 'showMap', `fired -- root: ${root}, project: ${projectName}`);
      setTimeout(() => {
        debugLog(root, 'showMap', 'setTimeout fired -- closing chat, opening MapPanel');
        ChatPanel.close();
        MapPanel.show(root, guardianService, projectName);
        debugLog(root, 'showMap', 'MapPanel.show() returned');
      }, 0);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openChat', () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
    })
  );



  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.refreshAll', () => { refreshAll(); })
  );

  try {
    registerProfileRuntimeCommand(context, chassisService, routingService, usageTracker, vaultService);
  } catch (e) {
    console.error('[CHASSIS] Failed to register chassis.profileRuntime', e);
    vscode.window.showErrorMessage(`CHASSIS: profileRuntime registration failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    registerStartRuntimeAnalysisCommand(context, chassisService, routingService, usageTracker, vaultService);
  } catch (e) { console.error('[CHASSIS] Failed to register chassis.startRuntimeAnalysis', e); }

  // [DONE] chassis.startExpandedInterview — opens ChatPanel and triggers 5W interview form.
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.startExpandedInterview', async () => {
      const panel = ChatPanel.currentPanel || await vscode.commands.executeCommand<any>('chassis.openChat');
      if (ChatPanel.currentPanel) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const config = root && chassisService?.isInitialized?.() ? chassisService.loadConfig?.() : null;
        const prefillTask = config?.blueprint?.what || '';
        (ChatPanel.currentPanel as any)._panel?.webview?.postMessage({ type: 'show-panel', panelType: 'expanded-interview', prefillTask, complexity: null });
        (ChatPanel.currentPanel as any)._panel?.reveal?.();
      }
    })
  );

  // [DONE] User Profile panel -- shows global user memory, editable preferences
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openProfile', async () => {
      if (!ChatPanel.currentPanel) {
        ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      const { getMemoryForDisplay } = await import('./services/userMemoryService.js');
      const memory = getMemoryForDisplay();
      const topLangs = Object.entries(memory.stack.languages).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, c]) => `${l} (${c})`).join(', ') || 'none yet';
      const content = [
        `**User Profile**\n`,
        `**Style:** indent=${memory.style.indent}, quotes=${memory.style.quotes}, semicolons=${memory.style.semicolons}`,
        `**Languages:** ${topLangs}`,
        `**Frameworks:** ${memory.stack.frameworks.join(', ') || 'none detected'}`,
        `**CSS:** ${memory.stack.css || 'not detected'}`,
        `**Preferences:** ${memory.explicit.length > 0 ? memory.explicit.join('; ') : 'none set'}`,
        `**Stats:** ${memory.stats.totalBuilds} builds, ${memory.stats.totalFixes} fixes`,
        `\n_Say "remember that [preference]" in chat to add preferences._`,
      ].join('\n');
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.handleMessage({ type: 'assistant-message', text: content });
      }
    })
  );


  // [DONE] Web Search -- opens chat and prompts for a search query
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.webSearch', async () => {
      const query = await vscode.window.showInputBox({ prompt: 'Search the web', placeHolder: 'e.g. react hooks documentation' });
      if (query) {
        if (!ChatPanel.currentPanel) { ChatPanel.show(chassisService, routingService, usageTracker, vaultService); }
        setTimeout(() => { ChatPanel.currentPanel?.handleMessage({ type: 'send-message', text: `search for ${query}` }); }, 500);
      }
    })
  );

  registerInlineCommandsC(context, chassisService, routingService, usageTracker, vaultService);
}
