// [SCOPE] Chat message handlers: file operations — undo-build, build-feedback, open-file, open-in-browser, create-file, clear-chat
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';

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
    await vscode.window.showTextDocument(doc, { preview: false });
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

export async function handleCreateFile(msg: any): Promise<void> {
  const { code, filename } = msg;
  if (!code || !filename) { return; }
  try {
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!rootPath) { vscode.window.showErrorMessage('No workspace open'); return; }
    const filePath = vscode.Uri.file(`${rootPath}/${filename}`);
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
    await vscode.window.showTextDocument(filePath);
    vscode.window.showInformationMessage(`Created ${filename}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to create file: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
