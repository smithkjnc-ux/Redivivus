// [SCOPE] Extension Inline Commands C — chassis.runProject, chassis.inspectElement, chassis.injectTerminalError.
// Extracted from extensionInlineCommandsB.ts to keep it under 200 lines.

import * as vscode from 'vscode';
import { ChassisService } from './services/chassisService.js';
import { RoutingService } from './services/ai/routingService.js';
import { UsageTracker } from './services/usageTracker.js';
import { VaultService } from './services/vault/vaultService.js';
import { ChatPanel } from './ui/chat/chatPanel.js';
import { registerTerminalErrorService, getLastTerminalError } from './services/workspace/terminalErrorService.js';
import { detectPostBuildInfo } from './ui/chat/chatPanelPostBuild.js';
import { BuildHistoryService } from './services/build/buildHistoryService.js';

export function registerInlineCommandsC(
  context: vscode.ExtensionContext,
  chassisService: ChassisService,
  routingService: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
): void {

  // [CHASSIS] Run Project — detects runnable entry point from build history and opens a terminal
  // [FIX] Auto-captures terminal errors and offers to fix them in chat
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.runProject', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showWarningMessage('No project folder open.'); return; }
      const recentFiles = new BuildHistoryService(root).list().filter(e => !e.undone).slice(0, 1).flatMap(e => e.files);
      const info = detectPostBuildInfo(root, recentFiles);
      if (!info.runCmd && info.type === 'unknown') { vscode.window.showInformationMessage('No runnable entry point detected. Build something first!'); return; }

      if (info.type === 'html' && info.entryFile) {
        vscode.env.openExternal(vscode.Uri.file(require('path').join(root, info.entryFile)));
        return;
      }

      const term = vscode.window.createTerminal({ name: 'CHASSIS: Run', cwd: root });
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
            vscode.commands.executeCommand('chassis.openChat');
            setTimeout(() => {
              ChatPanel.currentPanel?.handleMessage({ type: 'inject-terminal-error', error: err });
            }, 600);
          }
        }
      }, monitorDelay);
    })
  );

  // [CHASSIS] UI Inspector — describe a UI element to find its source code and inject into chat
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.inspectElement', async () => {
      const input = await vscode.window.showInputBox({ prompt: 'Describe the UI element (class name, id, or description)', placeHolder: 'e.g., .submit-button, #navbar, the login form' });
      if (!input) { return; }
      const { LensService } = await import('./services/lensService.js');
      const lens = new LensService(null as any, null as any);
      await lens.inspectAndInject({ description: input, className: input.startsWith('.') ? input.slice(1) : undefined, id: input.startsWith('#') ? input.slice(1) : undefined });
    })
  );

  registerTerminalErrorService(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.injectTerminalError', () => {
      const err = getLastTerminalError();
      if (!err) { vscode.window.showInformationMessage('CHASSIS: No terminal error detected. Run your project first.'); return; }
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.handleMessage({ type: 'inject-terminal-error', error: err });
        ChatPanel.currentPanel['_panel']?.reveal(undefined, false);
      } else {
        ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
        setTimeout(() => { ChatPanel.currentPanel?.handleMessage({ type: 'inject-terminal-error', error: err }); }, 600);
      }
    })
  );
}
