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
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.runProject', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showWarningMessage('No project folder open.'); return; }
      const recentFiles = new BuildHistoryService(root).list().filter(e => !e.undone).slice(0, 1).flatMap(e => e.files);
      const info = detectPostBuildInfo(root, recentFiles);
      if (!info.runCmd && info.type === 'unknown') { vscode.window.showInformationMessage('No runnable entry point detected. Build something first!'); return; }

      if (info.type === 'html' && info.entryFile) {
        vscode.env.openExternal(vscode.Uri.file(require('path').join(root, info.entryFile)));
        return;
      }

      const term = vscode.window.createTerminal({ name: 'Redivivus: Run', cwd: root });
      term.show();
      if (info.needsDeps && info.depsCmd) {
        term.sendText(info.depsCmd + ' && ' + (info.runCmd || ''));
      } else if (info.runCmd) {
        term.sendText(info.runCmd);
      }

      // [FIX] inject-terminal-error auto-triggers fix pipeline in chatPanelMessages.ts
      // No stale "Want me to fix it?" prompt needed — fix starts immediately on injection
      const monitorDelay = info.needsDeps ? 8000 : 3000;
      setTimeout(() => {
        const err = getLastTerminalError();
        if (err && err.errorBlock) {
          if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.handleMessage({ type: 'inject-terminal-error', error: err });
            ChatPanel.currentPanel['_panel']?.reveal(undefined, false);
          } else {
            vscode.commands.executeCommand('redivivus.openChat');
            setTimeout(() => {
              ChatPanel.currentPanel?.handleMessage({ type: 'inject-terminal-error', error: err });
            }, 600);
          }
        }
      }, monitorDelay);
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
