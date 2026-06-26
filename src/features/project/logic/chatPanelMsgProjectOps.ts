// [SCOPE] Chat message handlers: project operations — project picker, launcher, session ops
// Extracted from chatPanelMessages.ts. handleRunCommand extracted to chatPanelMsgRunCommand.ts.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChatMessage } from '../../chat/ui/chatPanelHtml.js';
import type { MessageHandlerDeps } from '../../chat/routing/chatPanelMessages.js';
import { debugLog } from '../../workspace/infrastructure/diagnosticLogger.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';
import { logProjectContextSwitch } from '../../../shared/logging/infrastructure/projectContextLogger.js';
import { BuildHistoryService } from '../../chat/build/services/buildHistoryService.js';

export { handleRunCommand } from './chatPanelMsgRunCommand.js';

export async function handleOpenProject(msg: any): Promise<void> {
  if (!msg.folderPath) { return; }
  const folderPath = msg.folderPath;
  const folderName = path.basename(folderPath);
  const ctx = ChatPanel.extensionContext;
  if (ctx) {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('redivivus.recentProjects', []);
    const existing = recent.findIndex((p: { path: string }) => p.path === folderPath);
    if (existing >= 0) { recent.splice(existing, 1); }
    recent.unshift({ path: folderPath, name: folderName, timestamp: Date.now() });
    ctx.globalState.update('redivivus.recentProjects', recent.slice(0, 10));
  }
  // Open the folder directly; Redivivus auto-initializes via onDidChangeWorkspaceFolders
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), { forceNewWindow: false });
}

export async function handleOpenExistingProject(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  require('fs').appendFileSync(require('os').homedir() + '/redivivus_debug.log', '[open-existing-project] handler entered\n');
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false, canSelectFolders: true, canSelectFiles: false,
    openLabel: 'Open Project Folder', defaultUri: vscode.Uri.file(os.homedir()),
  });
  require('fs').appendFileSync(require('os').homedir() + '/redivivus_debug.log', `[open-existing-project] picked=${JSON.stringify(picked?.map(u => u.fsPath))}\n`);
  if (!picked || picked.length === 0) { return; }
  const folderPath = picked[0].fsPath;
  const folderName = path.basename(folderPath);
  const redivivusDir = path.join(folderPath, '.redivivus');
  if (!fs.existsSync(redivivusDir)) {
    const choice = await vscode.window.showInformationMessage(
      `"${folderName}" doesn't have Redivivus initialized. Initialize it now?`,
      'Yes, Initialize', 'Open Anyway'
    );
    require('fs').appendFileSync(require('os').homedir() + '/redivivus_debug.log', `[open-existing-project] non-redivivus choice=${choice}\n`);
    if (choice === 'Yes, Initialize') {
      conversation.push({ role: 'assistant', content: `Opening "${folderName}" and initializing Redivivus...`, timestamp: Date.now() });
      refresh();
    } else if (choice === 'Open Anyway') {
      conversation.push({ role: 'assistant', content: `Opening "${folderName}"...`, timestamp: Date.now() });
      refresh();
    } else {
      return;
    }
  } else {
    conversation.push({ role: 'assistant', content: `Opening "${folderName}"...`, timestamp: Date.now() });
    refresh();
  }
  const ctx = ChatPanel.extensionContext;
  if (ctx) {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('redivivus.recentProjects', []);
    const existing = recent.findIndex((p: { path: string }) => p.path === folderPath);
    if (existing >= 0) { recent.splice(existing, 1); }
    recent.unshift({ path: folderPath, name: folderName, timestamp: Date.now() });
    ctx.globalState.update('redivivus.recentProjects', recent.slice(0, 10));
  }
  require('fs').appendFileSync(require('os').homedir() + '/redivivus_debug.log', `[open-existing-project] opening folderPath=${folderPath}\n`);
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), { forceNewWindow: true });
  setTimeout(() => vscode.commands.executeCommand('workbench.action.closeWindow'), 1000);
}

export async function handleOpenRecentProject(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  if (!msg.folderPath || !fs.existsSync(msg.folderPath)) {
    conversation.push({ role: 'assistant', content: 'That project folder no longer exists. It has been removed from recent projects.', timestamp: Date.now() });
    refresh();
    const ctx = ChatPanel.extensionContext;
    if (ctx && msg.folderPath) {
      const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('redivivus.recentProjects', []);
      ctx.globalState.update('redivivus.recentProjects', recent.filter((p: { path: string }) => p.path !== msg.folderPath));
    }
    return;
  }
  const folderPath = msg.folderPath;
  fs.appendFileSync(require('os').homedir() + '/redivivus_debug.log', `[open-recent] folderPath=${folderPath} exists=${fs.existsSync(folderPath)}\n`);
  const ctx = ChatPanel.extensionContext;
  if (ctx) {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('redivivus.recentProjects', []);
    const existing = recent.findIndex((p: { path: string }) => p.path === folderPath);
    if (existing >= 0) { const item = recent.splice(existing, 1)[0]; item.timestamp = Date.now(); recent.unshift(item); }
    ctx.globalState.update('redivivus.recentProjects', recent.slice(0, 10));
  }
  // [FIX] Always use forceNewWindow: true to bypass VSCodium silent failures and "Untitled (Workspace)" duplicate chat bugs
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), { forceNewWindow: true });
  setTimeout(() => vscode.commands.executeCommand('workbench.action.closeWindow'), 1000);
}

export async function handleToggleSetting(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  if (msg.setting === 'startupBehavior' && msg.value) {
    await vscode.workspace.getConfiguration('redivivus').update('startupBehavior', msg.value, true);
    const behaviorText = msg.value === 'lastProject' ? 'always open your last project' : 'show the launcher screen';
    conversation.push({ role: 'assistant', content: `Setting saved: Redivivus will ${behaviorText} on startup.`, timestamp: Date.now() });
    refresh();
  } else if (msg.setting === 'progressStyle' && (msg.value === 'plain' || msg.value === 'technical')) {
    await vscode.workspace.getConfiguration('redivivus').update('progressStyle', msg.value, true);
  }
}

export async function handleStartNewProject(msg: any, deps: MessageHandlerDeps): Promise<void> {
  // [WARN] CRITICAL: Validate we're not unexpectedly switching projects
  const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const pendingTask = deps.conversation.length > 0 ? deps.conversation[deps.conversation.length - 1].content : '';
  
  // If this was triggered during an active conversation (fix/build request), 
  // we should NOT be creating a new project - we should be editing the current one
  if (pendingTask && pendingTask.length > 10 && !pendingTask.toLowerCase().includes('new project') && !pendingTask.toLowerCase().includes('create')) {
    const validation = logProjectContextSwitch(currentRoot || '', 'handleStartNewProject', pendingTask);
    if (!validation.allowed) {
      vscode.window.showErrorMessage(
        `Redivivus Bug Detected: Tried to start new project "${msg.name || 'unknown'}" while working on "${currentRoot}". ` +
        `This happened because Redivivus misinterpreted your request as "create new project" instead of "edit current project". ` +
        `Please try again with more specific language like "add speed control to the flappy bird game".`,
        'OK'
      );
      return;
    }
  }
  
  // Always start new project flow in-place regardless of open folder.
  // The project wizard will create the folder and add it to the workspace.
  deps.buildMode = msg.mode === 'plan' ? 'plan' : 'direct';
  deps.planInterview = undefined;
  if (msg.mode === 'plan') {
    const { startPlanInterview } = await import('../../chat/ui/chatPanelPlanInterview.js');
    await startPlanInterview(deps);
  } else {
    deps.conversation.push({ role: 'assistant', content: "What would you like to build? Describe it in plain English and I'll get started.", timestamp: Date.now() });
  }
  deps.refresh();
}

export async function handleBrowseFolder(msg: any, panel: vscode.WebviewPanel): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false, canSelectFolders: true, canSelectFiles: false,
    openLabel: 'Select Project Parent Folder',
    defaultUri: msg.currentPath ? vscode.Uri.file(msg.currentPath) : undefined,
  });
  if (picked && picked.length > 0) {
    panel.webview.postMessage({ type: 'browse-result', folderPath: picked[0].fsPath });
  }
}
