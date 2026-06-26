// [SCOPE] run-command message handler — extracted from chatPanelMsgProjectOps.ts (Rule 9 split)

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { MessageHandlerDeps } from '../../chat/logic/chatPanelMessages.js';
import { debugLog } from '../../workspace/data/diagnosticLogger.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';
import { BuildHistoryService } from '../../build/services/buildHistoryService.js';
import { detectPostBuildInfo, createHtmlWrapperIfNeeded } from '../../build/chatPanelPostBuild.js';
import { getLastTerminalError } from '../../workspace/data/terminalErrorService.js';
import { getActiveProjectRoot } from './activeProjectRoot.js';

export async function handleRunCommand(msg: any, deps: MessageHandlerDeps, panel: vscode.WebviewPanel): Promise<void> {
  const command = msg.command;
  const _root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  debugLog(_root, 'run-command', `received: ${command}`);
  if (!command) { return; }
  try {
    if (command === 'redivivus.showSystemHealth') {
      const { collectHealthData, buildHealthHtml, getHealthStatus } = await import('../../chat/ui/chatPanelHealthCheck.js');
      panel.webview.postMessage({ type: 'set-status', status: 'working' });
      const data = await collectHealthData(ChatPanel.extensionContext);
      const status = getHealthStatus(data);
      const colorMap: Record<string, string> = { green: '#4caf50', yellow: '#ff9800', red: '#f44336' };
      panel.webview.postMessage({ type: 'update-health-btn', status, color: colorMap[status] });
      ChatPanel.extensionContext?.globalState.update('redivivus.healthStatus', status);
      panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      panel.webview.postMessage({ type: 'show-panel', title: 'System Health', content: buildHealthHtml(data) });
      return;
    } else if (command === 'redivivus.buildFromVault') {
      await vscode.commands.executeCommand(command, deps.buildFromVaultPrefill());
    } else if (command === 'redivivus.openVault' && msg.vaultItem) {
      await vscode.commands.executeCommand(command, msg.vaultItem);
      debugLog(_root, 'run-command', `executed OK: ${command} -> ${msg.vaultItem}`);
    } else if (command === 'redivivus.listProjects') {
      const homeDir = os.homedir();
      const projects: { name: string; fullPath: string }[] = [];
      for (const dir of [path.join(homeDir, 'projects'), path.join(homeDir, 'Projects'), path.join(homeDir, 'dev'), path.join(homeDir, 'workspace'), path.join(homeDir, 'code'), path.join(homeDir, 'src')]) {
        if (fs.existsSync(dir)) {
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                const pp = path.join(dir, entry.name);
                if (fs.existsSync(path.join(pp, '.redivivus'))) { projects.push({ name: entry.name, fullPath: pp }); }
              }
            }
          } catch { /* ignore permission errors */ }
        }
      }
      panel.webview.postMessage({ type: 'show-projects-modal', projects });
      debugLog(_root, 'run-command', `listed ${projects.length} Redivivus projects`);
    } else if (command === 'workbench.action.closeFolder') {
      // [Model A][LOOP FIX] NEVER close the projects home — it IS the workspace. Removing it drops to 0
      // folders, which under Model A is invalid and was driving a tight reopen<->close reload loop (the
      // "Activating Extensions…" hang). At home, "close" means "deactivate the active project" (back to the
      // launcher), NOT remove the folder. Only a genuine standalone-folder workspace still closes the folder.
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const { isProjectsContainer } = require('../../services/project/redivivusPaths.js');
      if (wsRoot && isProjectsContainer(wsRoot)) {
        // At home: deactivate the active project ONLY if one is active (idempotent — repeated closeFolder
        // can't thrash). Never remove the home folder.
        try {
          const PFP = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider;
          const activeRoot = PFP.instance?.getRoot();
          if (activeRoot && !isProjectsContainer(activeRoot)) {
            await vscode.commands.executeCommand('redivivus.closeProject');
          }
        } catch {}
        debugLog(_root, 'run-command', 'closeFolder at home -> kept workspace (no folder removal)');
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
          const cfg = vscode.workspace.getConfiguration();
          await cfg.update('window.confirmSaveUntitledWorkspace', false, vscode.ConfigurationTarget.Global);
          await vscode.workspace.updateWorkspaceFolders(0, folders.length);
        } else {
          await vscode.commands.executeCommand(command);
        }
        debugLog(_root, 'run-command', `executed OK: ${command}`);
      }
    } else if (command === 'redivivus.runProject') {
      // [FIX] Run directly — VS Code command dispatch unreliable for this command
      // [FIX] Use the active project root (Project Files tree) so Run works in the no-reload flow.
      const runRoot = getActiveProjectRoot();
      if (!runRoot) { vscode.window.showWarningMessage('No project folder open.'); return; }
      const recentFiles = new BuildHistoryService(runRoot).list().filter(e => !e.undone).slice(0, 1).flatMap(e => e.files);
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(runRoot, 'package.json'), 'utf-8'));
        const startCmd: string = pkg.scripts?.start || '';
        const jsMatch = startCmd.match(/\bnode\s+([\w./\\-]+\.js\b)/);
        if (jsMatch) {
          const absJs = path.join(runRoot, jsMatch[1]);
          if (fs.existsSync(absJs)) {
            const sample = fs.readFileSync(absJs, 'utf-8').slice(0, 600);
            const body = sample.startsWith('"use strict"') ? sample.slice(sample.indexOf('\n') + 1) : sample;
            const isCode = /\b(const|let|var|function|class|require|exports|module|Object)\b/.test(body);
            if (!isCode) {
              deps.conversation.push({ role: 'assistant', content: `The build output in \`${jsMatch[1]}\` looks corrupted. Rebuilding the project now...`, timestamp: Date.now() });
              deps.refresh();
              await deps.handleBuildRequest('The previous build was corrupted. Rebuild the entire project from scratch.', true, false);
              return;
            }
          }
        }
      } catch { /* no package.json or unreadable — continue */ }
      // [CONSOLIDATE] Delegate to the ONE shared type-aware runProject (web→http, .js→node, else→terminal +
      // terminal-error monitoring). This was a forked copy of the same logic. See core/project/runProject.ts.
      const { runProject } = await import('./runProject.js');
      await runProject(runRoot);
    } else if (command === 'redivivus.openVisualEditor') {
      const root = _root;
      if (!root) { vscode.window.showWarningMessage('Redivivus: Open a project folder first.'); return; }
      let builtFiles: string[] = [];
      try { const h = new BuildHistoryService(root); const last = h.list()[0]; builtFiles = last?.files ?? []; } catch {}
      if (!builtFiles.length) {
        const scan = (dir: string, depth: number) => { try { for (const f of fs.readdirSync(dir)) { const abs = path.join(dir, f); if (fs.statSync(abs).isDirectory() && depth > 0) { scan(abs, depth - 1); } else if (/\.(html|css)$/i.test(f)) { builtFiles.push(path.relative(root, abs)); } } } catch {} };
        scan(root, 2);
      }
      const { openVisualContractPanel } = require('../../ui/panels/visualContract/visualContractPanel.js');
      const { ChatPanel: _CP } = require('../../ui/panels/chat/chatPanel.js');
      openVisualContractPanel(_CP.extensionContext, root, builtFiles, deps.routing);
      debugLog(root, 'run-command', `openVisualEditor: opened for ${root}`);
    } else {
      await vscode.commands.executeCommand(command);
      debugLog(_root, 'run-command', `executed OK: ${command}`);
    }
  } catch (err) {
    debugLog(_root, 'run-command', `ERROR executing ${command}: ${err instanceof Error ? err.message : String(err)}`);
    vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
