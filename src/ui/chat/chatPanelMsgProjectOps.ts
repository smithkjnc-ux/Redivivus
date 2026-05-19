// [SCOPE] Chat message handlers: project operations — run-command, session, project picker, launcher ops
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';
import { debugLog } from '../../services/workspace/diagnosticLogger.js';
import { ChatPanel } from './chatPanel.js';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';
import { detectPostBuildInfo } from './chatPanelPostBuild.js';

export async function handleRunCommand(msg: any, deps: MessageHandlerDeps, panel: vscode.WebviewPanel): Promise<void> {
  const command = msg.command;
  const _root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  debugLog(_root, 'run-command', `received: ${command}`);
  if (!command) { return; }
  try {
    if (command === 'chassis.buildFromVault') {
      // Run vault build directly — save dialog handles new-folder creation and opens it.
      await vscode.commands.executeCommand(command, deps.buildFromVaultPrefill());
    } else if (command === 'chassis.openVault' && msg.vaultItem) {
      await vscode.commands.executeCommand(command, msg.vaultItem);
      debugLog(_root, 'run-command', `executed OK: ${command} -> ${msg.vaultItem}`);
    } else if (command === 'chassis.listProjects') {
      const homeDir = os.homedir();
      const projects: { name: string; fullPath: string }[] = [];
      for (const dir of [path.join(homeDir, 'projects'), path.join(homeDir, 'Projects'), path.join(homeDir, 'dev'), path.join(homeDir, 'workspace'), path.join(homeDir, 'code'), path.join(homeDir, 'src')]) {
        if (fs.existsSync(dir)) {
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                const pp = path.join(dir, entry.name);
                if (fs.existsSync(path.join(pp, '.chassis'))) { projects.push({ name: entry.name, fullPath: pp }); }
              }
            }
          } catch { /* ignore permission errors */ }
        }
      }
      panel.webview.postMessage({ type: 'show-projects-modal', projects });
      debugLog(_root, 'run-command', `listed ${projects.length} CHASSIS projects`);
    } else if (command === 'workbench.action.closeFolder') {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        await vscode.workspace.updateWorkspaceFolders(0, folders.length);
      } else {
        await vscode.commands.executeCommand(command);
      }
      debugLog(_root, 'run-command', `executed OK: ${command}`);
    } else if (command === 'chassis.runProject') {
      // [FIX] Run directly — VS Code command dispatch unreliable for this command
      const runRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!runRoot) { vscode.window.showWarningMessage('No project folder open.'); return; }
      const recentFiles = new BuildHistoryService(runRoot).list().filter(e => !e.undone).slice(0, 1).flatMap(e => e.files);
      const info = detectPostBuildInfo(runRoot, recentFiles);
      if (!info.runCmd && info.type === 'unknown') { vscode.window.showInformationMessage('No runnable entry point detected. Build something first!'); return; }
      if (info.type === 'html' && info.entryFile) {
        vscode.env.openExternal(vscode.Uri.file(path.join(runRoot, info.entryFile)));
        debugLog(runRoot, 'run-command', `runProject: opened ${info.entryFile} in browser`);
        return;
      }
      const term = vscode.window.createTerminal({ name: 'CHASSIS: Run', cwd: runRoot });
      term.show();
      if (info.needsDeps && info.depsCmd) { term.sendText(info.depsCmd + ' && ' + (info.runCmd || '')); }
      else if (info.runCmd) { term.sendText(info.runCmd); }
      debugLog(runRoot, 'run-command', `runProject: terminal type=${info.type} cmd=${info.runCmd}`);
    } else {
      await vscode.commands.executeCommand(command);
      debugLog(_root, 'run-command', `executed OK: ${command}`);
    }
  } catch (err) {
    debugLog(_root, 'run-command', `ERROR executing ${command}: ${err instanceof Error ? err.message : String(err)}`);
    vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

export async function handleOpenProject(msg: any): Promise<void> {
  if (!msg.folderPath) { return; }
  const folderPath = msg.folderPath;
  const folderName = path.basename(folderPath);
  const ctx = ChatPanel.extensionContext;
  if (ctx) {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
    const existing = recent.findIndex((p: { path: string }) => p.path === folderPath);
    if (existing >= 0) { recent.splice(existing, 1); }
    recent.unshift({ path: folderPath, name: folderName, timestamp: Date.now() });
    ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
  }
  // Open the folder directly; CHASSIS auto-initializes via onDidChangeWorkspaceFolders
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), false);
}

export async function handleOpenExistingProject(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', '[open-existing-project] handler entered\n');
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false, canSelectFolders: true, canSelectFiles: false,
    openLabel: 'Open Project Folder', defaultUri: vscode.Uri.file(os.homedir()),
  });
  require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[open-existing-project] picked=${JSON.stringify(picked?.map(u => u.fsPath))}\n`);
  if (!picked || picked.length === 0) { return; }
  const folderPath = picked[0].fsPath;
  const folderName = path.basename(folderPath);
  const chassisDir = path.join(folderPath, '.chassis');
  if (!fs.existsSync(chassisDir)) {
    const choice = await vscode.window.showInformationMessage(
      `"${folderName}" doesn't have CHASSIS initialized. Initialize it now?`,
      'Yes, Initialize', 'Open Anyway'
    );
    require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[open-existing-project] non-chassis choice=${choice}\n`);
    if (choice === 'Yes, Initialize') {
      conversation.push({ role: 'assistant', content: `Opening "${folderName}" and initializing CHASSIS...`, timestamp: Date.now() });
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
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
    const existing = recent.findIndex((p: { path: string }) => p.path === folderPath);
    if (existing >= 0) { recent.splice(existing, 1); }
    recent.unshift({ path: folderPath, name: folderName, timestamp: Date.now() });
    ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
  }
  const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
  if (!fs.existsSync(wsFile)) {
    try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
  }
  require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[open-existing-project] opening wsFile=${wsFile}\n`);
  vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
}

export async function handleOpenRecentProject(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  if (!msg.folderPath || !fs.existsSync(msg.folderPath)) {
    conversation.push({ role: 'assistant', content: 'That project folder no longer exists. It has been removed from recent projects.', timestamp: Date.now() });
    refresh();
    const ctx = ChatPanel.extensionContext;
    if (ctx && msg.folderPath) {
      const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
      ctx.globalState.update('chassis.recentProjects', recent.filter((p: { path: string }) => p.path !== msg.folderPath));
    }
    return;
  }
  const folderPath = msg.folderPath;
  const folderName = path.basename(folderPath);
  const ctx = ChatPanel.extensionContext;
  if (ctx) {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
    const existing = recent.findIndex((p: { path: string }) => p.path === folderPath);
    if (existing >= 0) { const item = recent.splice(existing, 1)[0]; item.timestamp = Date.now(); recent.unshift(item); }
    ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
  }
  const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
  if (!fs.existsSync(wsFile)) {
    try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
  }
  vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
}

export async function handleToggleSetting(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  if (msg.setting === 'startupBehavior' && msg.value) {
    await vscode.workspace.getConfiguration('chassis').update('startupBehavior', msg.value, true);
    const behaviorText = msg.value === 'lastProject' ? 'always open your last project' : 'show the launcher screen';
    conversation.push({ role: 'assistant', content: `Setting saved: CHASSIS will ${behaviorText} on startup.`, timestamp: Date.now() });
    refresh();
  }
}

export async function handleStartNewProject(msg: any, deps: MessageHandlerDeps): Promise<void> {
  // Always start new project flow in-place regardless of open folder.
  // The project wizard will create the folder and add it to the workspace.
  deps.buildMode = msg.mode === 'plan' ? 'plan' : 'direct';
  deps.planInterview = undefined;
  if (msg.mode === 'plan') {
    const { startPlanInterview } = await import('./chatPanelPlanInterview.js');
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
