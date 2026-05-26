// [SCOPE] Chat message handlers: file operations — undo-build, build-feedback, open-file, open-in-browser, create-file, clear-chat
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from '../routing/chatPanelMessages';

export async function handleUndoBuild(msg: any, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const { snapshotId } = msg;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root || !snapshotId) {
    conversation.push({ role: 'assistant', content: '⚠️ Can\'t undo — no project is open or nothing to undo.', timestamp: Date.now() });
    refresh(); return;
  }
  try {
    const { SnapshotService } = await import('../../services/snapshotService.js');
    const snap = new SnapshotService(root);
    const { restored, deleted, error } = snap.restore(snapshotId);
    if (error) {
      conversation.push({ role: 'assistant', content: `❌ Could not undo — ${error}`, timestamp: Date.now() });
    } else {
      conversation.push({ role: 'assistant', content: `✅ Undone! Restored ${restored} file${restored !== 1 ? 's' : ''} to the previous version.`, timestamp: Date.now() });
      try { const { BuildHistoryService } = await import('../../services/build/buildHistoryService.js'); new BuildHistoryService(root).markUndone(snapshotId); } catch { /* best-effort */ }
      deps.panel.webview.postMessage({ type: 'preview-reverted' });
      deps.panel.webview.postMessage({ type: 'preview-refresh' });
    }
  } catch (err) {
    conversation.push({ role: 'assistant', content: `❌ Something went wrong while undoing — please try again.`, timestamp: Date.now() });
  }
  refresh();
}

export async function handleBuildFeedback(msg: any, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (root && msg.rating === 'bad') {
    try {
      const { LearnedMemoryService } = await import('../../services/learnedMemoryService.js');
      const learned = new LearnedMemoryService(root);
      const note = msg.note?.trim();
      if (note && note.length > 5) {
        learned.addNeverDo(note, 'user-reported');
      } else {
        learned.addNeverDo(`User reported build failure for task: ${msg.feedbackId || 'unknown'}`, 'user-reported');
      }
    } catch { /* best-effort */ }

    if (msg.retry && msg.feedbackId) {
      const fbNote = msg.note?.trim();
      const retryTask = fbNote && fbNote.length > 3
        ? `Fix the issue with the last build: ${fbNote}`
        : `The last build had a problem. Review the current file and fix it.`;
      conversation.push({ role: 'user', content: retryTask, timestamp: Date.now() });
      conversation.push({ role: 'assistant', content: 'Got it -- retrying with your notes...', timestamp: Date.now() });
      refresh();
      // [WARN] skipComplex=true: retry builds MUST bypass vault/placement/cost gates
      await deps.handleBuildRequest(retryTask, true, true);
    }
  }
}

function decodePath(b64: string | undefined): string | undefined {
  if (!b64) { return undefined; }
  try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return undefined; }
}

export async function handleOpenFile(msg: any): Promise<void> {
  const filePath = decodePath(msg.path) || msg.filePath;
  if (filePath && fs.existsSync(filePath)) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
  }
}

export async function handleOpenInBrowser(msg: any): Promise<void> {
  const filePath = decodePath(msg.path) || msg.filePath;
  if (filePath && fs.existsSync(filePath)) {
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', uri.toString());
    } catch {
      await vscode.env.openExternal(uri);
    }
  }
}

export async function handlePreviewBrowser(msg: any): Promise<void> {
  const filePath = decodePath(msg.path);
  if (filePath && fs.existsSync(filePath)) {
    const uri = vscode.Uri.file(filePath);
    await vscode.env.openExternal(uri);
  }
}

export async function handleOpenHtmlByName(msg: any): Promise<void> {
  const { filename } = msg;
  if (!filename) { return; }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showInformationMessage(`Can't open ${filename} — no workspace folder is open. Use File → Open Folder first.`);
    return;
  }
  const filePath = require('path').join(root, filename);
  if (fs.existsSync(filePath)) {
    await vscode.env.openExternal(vscode.Uri.file(filePath));
  } else {
    vscode.window.showErrorMessage(`File not found: ${filePath}`);
  }
}

function isProjectsContainer(root: string): boolean {
  const cfg = vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!
    .replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

export async function handleCreateFile(msg: any): Promise<void> {
  const { code, filename } = msg;
  if (!code || !filename) { return; }
  try {
    let rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

    // If workspace is the projects container (~/projects), save to the last auto-created
    // project folder so the file lands inside a proper project rather than as a loose file.
    if (!rootPath || isProjectsContainer(rootPath)) {
      const { lastAutoCreatedDir } = await import('../build/chatPanelBuildAutoCreate.js');
      if (lastAutoCreatedDir && fs.existsSync(lastAutoCreatedDir)) {
        rootPath = lastAutoCreatedDir;
      } else if (!rootPath) {
        vscode.window.showErrorMessage('No workspace open');
        return;
      } else {
        // Projects container but no auto-created dir — create a subfolder from the filename stem
        const stem = path.basename(filename, path.extname(filename)).replace(/[^a-z0-9_-]/gi, '_') || 'project';
        rootPath = path.join(rootPath, stem);
        fs.mkdirSync(rootPath, { recursive: true });
      }
    }

    const filePath = vscode.Uri.file(path.join(rootPath, filename));
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
    await vscode.window.showTextDocument(filePath);
    vscode.window.showInformationMessage(`Created ${filename} in ${path.basename(rootPath)}/`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to create file: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
