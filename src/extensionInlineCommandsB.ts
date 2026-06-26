// [SCOPE] Extension Inline Commands B — fix/resolve, map, chat, profiler, expanded interview.
// redivivus.runProject + redivivus.inspectElement + redivivus.injectTerminalError extracted to extensionInlineCommandsC.ts.

import * as vscode from 'vscode';
import { debugLog } from './services/workspace/diagnosticLogger.js';
import type { RedivivusService } from './services/redivivusService.js';
import type { RoutingService } from './shared/ai/infrastructure/routingService.js';
import type { UsageTracker } from './services/usageTracker.js';
import type { VaultService } from './features/vault/infrastructure/vaultService.js';
import type { StatusBar } from './ui/views/statusBar.js';
import type { GuardianService } from './shared/ai/infrastructure/guardianService.js';
import { RecommendationsPanel } from './ui/panels/analyzer/analyzerPanel.js';
import { MapPanel } from './ui/map/mapPanel.js';
import type { GitHubBackupService } from './features/workspace/infrastructure/githubBackupService.js';
import { ChatPanel } from './features/chat/ui/chatPanel.js';
import { getActiveProjectRoot } from './features/project/application/activeProjectRoot.js';
import { openBlueprintPanel } from './ui/views/blueprintInterviewPanel.js';
import { registerProfileRuntimeCommand } from './features/runtime/application/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './features/runtime/application/startRuntimeAnalysis.js';
import { showBuildHistoryPanel } from './ui/views/buildHistoryPanel.js';
import { MemoryPanel } from './features/chat/ui/memoryPanel.js';
import { registerInlineCommandsC } from './extensionInlineCommandsC.js';

export function registerInlineCommandsB(
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

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.resolveFix', (task: string, builtFiles?: string[]) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFinished', task, builtFiles });
      }
      if (ChatPanel.currentPanel) {
        const fileList = builtFiles && builtFiles.length > 0 ? '\n\nFiles updated: ' + builtFiles.map(f => `\`${f}\``).join(', ') : '';
        const summary = `Fix complete! The task is done and your project has been updated.${fileList}\n\nYou can re-run **Scan Project** from the Recommendations panel to see your updated progress.`;
        ChatPanel.currentPanel.handleMessage({ type: 'assistant-message', text: summary });
      }
      vscode.commands.executeCommand('redivivus.refreshAll');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.buildFailed', (task: string, reason: string) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFailed', task, reason });
      }
    })
  );

  // [WARN] Defer close+open to next tick — disposing panel mid-handler can swallow MapPanel.show()
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showMap', () => {
      const root = getActiveProjectRoot();
      if (!root) { vscode.window.showErrorMessage('Redivivus: No workspace folder open.'); return; }
      const projectName = redivivusService.loadConfig()?.projectName || require('path').basename(root) || 'Project';
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
    vscode.commands.registerCommand('redivivus.openChat', () => {
      ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
    })
  );



  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.refreshAll', () => { refreshAll(); })
  );

  try {
    registerProfileRuntimeCommand(context, redivivusService, routingService, usageTracker, vaultService);
  } catch (e) {
    console.error('[Redivivus] Failed to register redivivus.profileRuntime', e);
    vscode.window.showErrorMessage(`Redivivus: profileRuntime registration failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    registerStartRuntimeAnalysisCommand(context, redivivusService, routingService, usageTracker, vaultService);
  } catch (e) { console.error('[Redivivus] Failed to register redivivus.startRuntimeAnalysis', e); }

  // [DONE] redivivus.startExpandedInterview — opens ChatPanel and triggers 5W interview form.
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.startExpandedInterview', async () => {
      const panel = ChatPanel.currentPanel || await vscode.commands.executeCommand<any>('redivivus.openChat');
      if (ChatPanel.currentPanel) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const config = root && redivivusService?.isInitialized?.() ? redivivusService.loadConfig?.() : null;
        const prefillTask = config?.blueprint?.what || '';
        (ChatPanel.currentPanel as any)._panel?.webview?.postMessage({ type: 'show-panel', panelType: 'expanded-interview', prefillTask, complexity: null });
        (ChatPanel.currentPanel as any)._panel?.reveal?.();
      }
    })
  );

  // [DONE] User Profile panel -- shows global user memory, editable preferences
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openProfile', async () => {
      if (!ChatPanel.currentPanel) {
        ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
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
    vscode.commands.registerCommand('redivivus.webSearch', async () => {
      const query = await vscode.window.showInputBox({ prompt: 'Search the web', placeHolder: 'e.g. react hooks documentation' });
      if (query) {
        if (!ChatPanel.currentPanel) { ChatPanel.show(redivivusService, routingService, usageTracker, vaultService); }
        setTimeout(() => { ChatPanel.currentPanel?.handleMessage({ type: 'send-message', text: `search for ${query}` }); }, 500);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showMemory', () => MemoryPanel.createOrShow())
  );

  registerInlineCommandsC(context, redivivusService, routingService, usageTracker, vaultService);
}
