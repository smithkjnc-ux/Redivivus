// [SCOPE] CHASSIS Selection Commands — explain/improve selected code

import * as vscode from 'vscode';
import * as path from 'path';
import { ChatPanel } from '../ui/chat/chatPanel.js';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/ai/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vault/vaultService.js';

export function registerSelectionCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
): void {
  // Save Selection to Vault — saves selected code as a vault item
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.saveSelectionToVault', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.selection;
      if (selection.isEmpty) { return; }

      const selectedText = editor.document.getText(selection);
      const filePath = editor.document.uri.fsPath;

      // Auto-categorize based on content
      let category = 'misc';
      if (selectedText.includes('function') || selectedText.includes('const ') || selectedText.includes('let ')) {
        category = 'function';
      } else if (selectedText.includes('class ')) {
        category = 'class';
      } else if (selectedText.includes('interface ') || selectedText.includes('type ')) {
        category = 'type';
      }

      // Save to vault
      await vaultService.saveItem({
        id: Date.now().toString(),
        name: `Selection from ${path.basename(filePath)}`,
        code: selectedText,
        language: path.extname(filePath).slice(1),
        category,
        description: `Selection from ${path.basename(filePath)}`,
        sourceProject: path.basename(path.dirname(filePath)),
        sourceFile: filePath,
        tags: [],
        lineCount: selectedText.split('\n').length,
        importCount: 0,
        createdAt: new Date().toISOString(),
        contentHash: Date.now().toString(),
      });

      vscode.window.showInformationMessage('Selection saved to vault');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.explainSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.document.getText(editor.selection).trim();
      if (!selection) { vscode.window.showWarningMessage('No text selected.'); return; }
      const prompt = `Explain this code in plain English:\n\n\`\`\`\n${selection}\n\`\`\``;
      await sendToChat(chassis, routing, usageTracker, vaultService, prompt);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.improveSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.document.getText(editor.selection).trim();
      if (!selection) { vscode.window.showWarningMessage('No text selected.'); return; }
      const prompt = `Improve this code — keep the same behavior but make it cleaner, more efficient, and better documented:\n\n\`\`\`\n${selection}\n\`\`\``;
      await sendToChat(chassis, routing, usageTracker, vaultService, prompt);
    })
  );
}

async function sendToChat(
  chassis: ChassisService,
  routing: RoutingService,
  usageTracker: UsageTracker,
  vault: VaultService,
  text: string,
): Promise<void> {
  ChatPanel.show(chassis, routing, usageTracker, vault);
  // Give the panel a moment to initialize, then inject the message
  setTimeout(() => {
    const panel = ChatPanel.currentPanel;
    if (panel) {
      (panel as any)._panel.webview.postMessage({ type: 'inject-text', text });
    }
  }, 300);
}
