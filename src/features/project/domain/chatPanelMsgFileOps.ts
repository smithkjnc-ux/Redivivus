// [SCOPE] Chat message handlers: file operations — undo-build, build-feedback, open-file, open-in-browser, create-file, clear-chat
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ChatMessage } from '../../chat/ui/chatPanelHtml.js';
import type { MessageHandlerDeps } from '../../chat/routing/chatPanelMessages.js';
import { getActiveProjectRoot } from '../application/activeProjectRoot.js';

export async function handleUndoBuild(msg: any, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const { snapshotId } = msg;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root || !snapshotId) {
    conversation.push({ role: 'assistant', content: '⚠️ Can\'t undo — no project is open or nothing to undo.', timestamp: Date.now() });
    refresh(); return;
  }
  try {
    const { SnapshotService } = await import('../../../services/snapshotService.js');
    const snap = new SnapshotService(root);
    const { restored, deleted, error } = snap.restore(snapshotId);
    if (error) {
      conversation.push({ role: 'assistant', content: `❌ Could not undo — ${error}`, timestamp: Date.now() });
    } else {
      conversation.push({ role: 'assistant', content: `✅ Undone! Restored ${restored} file${restored !== 1 ? 's' : ''} to the previous version.`, timestamp: Date.now() });
      try { const { BuildHistoryService } = await import('../../chat/build/services/buildHistoryService.js'); new BuildHistoryService(root).markUndone(snapshotId); } catch { /* best-effort */ }
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
      const { LearnedMemoryService } = await import('../../../services/learnedMemoryService.js');
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

// [SCOPE] RUN a web build like a standalone program — serve it over http (a local server) and open the
// REAL browser, NOT file://. Preview = in-editor iteration; RUN = the actual program as it would normally
// run. ES-module apps (<script type="module">) are CORS-blocked on file://, so file:// renders the page
// but the JS never runs (the "works in Preview, dead in the browser" bug). http://localhost runs it for real.
export async function handlePreviewBrowser(msg: any): Promise<void> {
  const filePath = decodePath(msg.path);
  if (!filePath || !fs.existsSync(filePath)) { return; }
  try {
    const root = path.dirname(filePath);
    const { detectDevServer, startPreviewServer, waitForPort } = await import('../../chat/ui/chatPanelPreview.js');
    const info = detectDevServer(root);
    if (info) {
      const { port } = await startPreviewServer(root, info);
      const ready = await waitForPort(port, info.type === 'static' ? 2_000 : 30_000);
      if (ready) {
        const file = path.basename(filePath);
        const urlPath = file.toLowerCase() === 'index.html' ? '' : file;
        await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}/${urlPath}`));
        return;
      }
    }
  } catch { /* fall through to file:// for single-file pages that don't need a server */ }
  // Fallback: a self-contained single-file page (no module imports) still runs fine from file://.
  try { await vscode.env.openExternal(vscode.Uri.file(filePath)); } catch {}
}

export async function handleOpenHtmlByName(msg: any): Promise<void> {
  const { filename } = msg;
  if (!filename) { return; }
  const root = getActiveProjectRoot();
  if (!root) {
    vscode.window.showInformationMessage(`Can't open ${filename} — no project is active.`);
    return;
  }
  const filePath = require('path').join(root, filename);
  if (fs.existsSync(filePath)) {
    // [FIX][RUN-WEB-HTTP] HTML over http (NOT file:// — modular apps break there); other files open as-is.
    if (/\.html?$/i.test(filename)) {
      const { openWebInBrowser } = await import('./openWebInBrowser.js');
      await openWebInBrowser(root, filename);
    } else {
      await vscode.env.openExternal(vscode.Uri.file(filePath));
    }
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

    // If workspace is the projects container (~/projects) or nothing open,
    // create a proper project folder with full Redivivus scaffold.
    if (!rootPath || isProjectsContainer(rootPath)) {
      const { lastAutoCreatedDir } = await import('../../chat/build/chatPanelBuildAutoCreate.js');
      if (lastAutoCreatedDir && fs.existsSync(lastAutoCreatedDir)) {
        rootPath = lastAutoCreatedDir;
      } else {
        const stem = path.basename(filename, path.extname(filename)).replace(/[^a-z0-9_-]/gi, '_') || 'project';
        const projectsDir = vscode.workspace.getConfiguration('redivivus')
          .get<string>('projectsDirectory', '~/projects')!
          .replace('~', require('os').homedir());
        rootPath = path.join(projectsDir, stem);
        fs.mkdirSync(rootPath, { recursive: true });
        const { scaffoldAt } = await import('../application/redivivusInit.js');
        await scaffoldAt(rootPath, stem);
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
