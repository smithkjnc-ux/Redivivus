// [SCOPE] Redivivus Logging Commands — work log, dead ends, blueprint viewer

import * as vscode from 'vscode';
import * as fs from 'fs';
import type { RedivivusService } from '../services/redivivusService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';

export function registerLoggingCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
): void {
  // Open Work Log — show inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.log', async () => {
      if (!redivivus.isInitialized()) { return; }
      const raw = fs.existsSync(redivivus.worklogPath)
        ? fs.readFileSync(redivivus.worklogPath, 'utf-8')
        : '*(No work log entries yet.)*';
      const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">📋 Work Log</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${escaped}</pre></div>`;
      if (!ChatPanel.currentPanel) {
        vscode.window.showInformationMessage('Open the chat panel first (Ctrl+L).');
        return;
      }
      (ChatPanel.currentPanel as any).showPanel('work-log', 'Work Log', html);
    })
  );

  // Open Dead End Log — show inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.deadends', async () => {
      if (!redivivus.isInitialized()) { return; }
      const deadendPath = redivivus.worklogPath.replace('work_log.md', 'dead_ends.md');
      const raw = fs.existsSync(deadendPath)
        ? fs.readFileSync(deadendPath, 'utf-8')
        : '*(No dead end entries yet.)*';
      const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">🚫 Dead Ends</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${escaped}</pre></div>`;
      if (!ChatPanel.currentPanel) {
        vscode.window.showInformationMessage('Open the chat panel first (Ctrl+L).');
        return;
      }
      (ChatPanel.currentPanel as any).showPanel('dead-ends', 'Dead Ends', html);
    })
  );
}
