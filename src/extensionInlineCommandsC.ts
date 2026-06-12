// [SCOPE] Extension Inline Commands C — redivivus.runProject, redivivus.inspectElement, redivivus.injectTerminalError, redivivus.openVisualEditor.
// Extracted from extensionInlineCommandsB.ts to keep it under 200 lines.

import * as vscode from 'vscode';
import type { RedivivusService } from './services/redivivusService.js';
import type { RoutingService } from './services/ai/routingService.js';
import type { UsageTracker } from './services/usageTracker.js';
import type { VaultService } from './services/vault/vaultService.js';
import { ChatPanel } from './ui/panels/chat/chatPanel';
import { registerTerminalErrorService, getLastTerminalError } from './services/workspace/terminalErrorService.js';
import { detectPostBuildInfo } from './core/build/chatPanelPostBuild';
import { BuildHistoryService } from './services/build/buildHistoryService.js';
export function registerInlineCommandsC(
  context: vscode.ExtensionContext,
  redivivusService: RedivivusService,
  routingService: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
): void {

  // [Redivivus] Run Project — detects runnable entry point from build history and opens a terminal
  // [FIX] Auto-captures terminal errors and offers to fix them in chat
  // rootOverride is passed by the result card ▶ Run Project button via vscode.commands.executeCommand
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.runProject', async (rootOverride?: string) => {
      // [Model A] Prefer the ACTIVE project subfolder over workspaceFolders[0] (which is ~/projects home).
      let root = rootOverride || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      try { if (!rootOverride) { const _a = require('./ui/sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.getRoot(); if (_a) { root = _a; } } } catch {}
      if (!root) { vscode.window.showWarningMessage('No project folder open.'); return; }
      // [CONSOLIDATE] One shared, type-aware runProject (web→http, .js→node, else→terminal + error monitor).
      const { runProject } = await import('./core/project/runProject.js');
      await runProject(root);
    })
  );

  // [Redivivus] UI Inspector — describe a UI element to find its source code and inject into chat
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.inspectElement', async () => {
      const input = await vscode.window.showInputBox({ prompt: 'Describe the UI element (class name, id, or description)', placeHolder: 'e.g., .submit-button, #navbar, the login form' });
      if (!input) { return; }
      const { LensService } = await import('./services/lensService.js');
      const lens = new LensService(null as any, null as any);
      await lens.inspectAndInject({ description: input, className: input.startsWith('.') ? input.slice(1) : undefined, id: input.startsWith('#') ? input.slice(1) : undefined });
    })
  );

  registerTerminalErrorService(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.injectTerminalError', () => {
      const err = getLastTerminalError();
      if (!err) { vscode.window.showInformationMessage('Redivivus: No terminal error detected. Run your project first.'); return; }
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.handleMessage({ type: 'inject-terminal-error', error: err });
        ChatPanel.currentPanel['_panel']?.reveal(undefined, false);
      } else {
        ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
        setTimeout(() => { ChatPanel.currentPanel?.handleMessage({ type: 'inject-terminal-error', error: err }); }, 600);
      }
    })
  );

  // redivivus.openVisualEditor — opens the Visual Contract Editor panel for a project root
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openVisualEditor', async (projectRoot?: string) => {
      const root = projectRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showWarningMessage('Redivivus: Open a project folder first.'); return; }
      // Collect built files from the build history; fall back to scanning for HTML/CSS
      let builtFiles: string[] = [];
      try {
        const history = new BuildHistoryService(root);
        const last = history.list()[0];
        builtFiles = last?.files ?? [];
      } catch { /* ignore */ }
      if (!builtFiles.length) {
        // Fallback: scan for HTML/CSS files in the project root (non-recursive, top two levels)
        const { readdirSync, statSync } = require('fs');
        const scan = (dir: string, depth: number) => {
          try { for (const f of readdirSync(dir)) {
            const abs = require('path').join(dir, f);
            if (statSync(abs).isDirectory() && depth > 0) { scan(abs, depth - 1); }
            else if (/\.(html|css)$/i.test(f)) { builtFiles.push(require('path').relative(root, abs)); }
          }} catch { /* ignore */ }
        };
        scan(root, 2);
      }
      const { openVisualContractPanel } = require('./ui/panels/visualContract/visualContractPanel.js');
      openVisualContractPanel(context, root, builtFiles, routingService);
    })
  );
}
