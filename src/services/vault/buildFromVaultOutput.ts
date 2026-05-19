// [SCOPE] Build From Vault output handler — save logic and post-build summary for buildFromVaultService.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { VaultItem } from './vaultService.js';

export interface OutputArgs {
  task: string;
  targetFile: string | undefined;
  code: string;
  selectedItems: VaultItem[];
  gaps: string[];
}

export async function handleBuildOutput(args: OutputArgs): Promise<void> {
  const { task, targetFile, code, selectedItems, gaps } = args;
  const fsSync = require('fs');
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const saveTarget = targetFile?.trim();
  const summary = `**Build from Vault complete**\n\nTask: ${task}\n\nUsed from vault (${selectedItems.length}): ${selectedItems.map(i => i.name).join(', ') || 'none'}\nWritten fresh (${gaps.length}): ${gaps.join(', ') || 'none'}`;

  if (root && saveTarget) {
    const fullPath = path.join(root, saveTarget);
    const dirPath = path.dirname(fullPath);
    if (!fsSync.existsSync(dirPath)) { fsSync.mkdirSync(dirPath, { recursive: true }); }
    fsSync.writeFileSync(fullPath, code);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
    await vscode.window.showTextDocument(doc, { preview: false });
    postChatSummary(summary + `\n\nSaved to: \`${fullPath}\``);
    return;
  }

  // No workspace or no target: save dialog → new project folder
  const projectName = task.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'vault-build';
  const fileName = (saveTarget || (projectName + '.ts')).replace(/^\//, '');
  const picked = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(require('os').homedir(), 'projects', projectName, fileName)),
    saveLabel: 'Save Project File',
    filters: { 'Source Files': ['ts', 'js', 'py', 'html', 'css'] },
  });
  if (!picked) {
    // Cancelled — show code in untitled tab
    const lang = saveTarget?.endsWith('.py') ? 'python' : saveTarget?.endsWith('.js') ? 'javascript' : 'typescript';
    const doc = await vscode.workspace.openTextDocument({ content: code, language: lang });
    await vscode.window.showTextDocument(doc, { preview: false });
    postChatSummary(summary + '\n\n*Code is in the editor tab — use Save As to keep it.*');
    return;
  }

  const dirPath = path.dirname(picked.fsPath);
  if (!fsSync.existsSync(dirPath)) { fsSync.mkdirSync(dirPath, { recursive: true }); }
  fsSync.writeFileSync(picked.fsPath, code);

  // Pre-init CHASSIS so plan interview does NOT trigger on folder open
  const chassisDir = path.join(dirPath, '.chassis');
  if (!fsSync.existsSync(chassisDir)) {
    fsSync.mkdirSync(chassisDir, { recursive: true });
    const cfg = { projectName, createdAt: new Date().toISOString(), version: '0.3.6', blueprint: { who: '', what: task, where: '', when: 'vault build', why: 'built from vault', health: { confirmed: 1, assumed: 3, unknown: 1, confidence: 'medium' }, locked: false, version: '1.0' }, sessions: [] };
    fsSync.writeFileSync(path.join(chassisDir, 'config.json'), JSON.stringify(cfg, null, 2));
  }

  // Persist summary through window reload
  try {
    const { ChatPanel } = require('../../ui/chat/chatPanel.js');
    const ctx = ChatPanel.extensionContext;
    if (ctx) {
      await ctx.globalState.update('chassis.pendingVaultSummary', summary + `\n\nSaved to: \`${picked.fsPath}\``);
      await ctx.globalState.update('chassis.suppressAutoOpen', dirPath);
    }
  } catch { /* not available */ }
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dirPath), false);
}

function postChatSummary(text: string): void {
  try {
    const { ChatPanel } = require('../../ui/chat/chatPanel.js');
    const cp = ChatPanel.currentPanel;
    if (cp) { cp.getConversation().push({ role: 'assistant', content: text, timestamp: Date.now() }); cp.refresh(); }
  } catch { /* not available */ }
}
