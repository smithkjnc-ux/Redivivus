// [SCOPE] run-command message handler — extracted from chatPanelMsgProjectOps.ts (Rule 9 split)

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { MessageHandlerDeps } from '../routing/chatPanelMessages';
import { debugLog } from '../../services/workspace/diagnosticLogger';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { BuildHistoryService } from '../../services/build/buildHistoryService';
import { detectPostBuildInfo, createHtmlWrapperIfNeeded } from '../build/chatPanelPostBuild';
import { getLastTerminalError } from '../../services/workspace/terminalErrorService';

export async function handleRunCommand(msg: any, deps: MessageHandlerDeps, panel: vscode.WebviewPanel): Promise<void> {
  const command = msg.command;
  const _root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  debugLog(_root, 'run-command', `received: ${command}`);
  if (!command) { return; }
  try {
    if (command === 'redivivus.buildFromVault') {
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
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        await vscode.workspace.updateWorkspaceFolders(0, folders.length);
      } else {
        await vscode.commands.executeCommand(command);
      }
      debugLog(_root, 'run-command', `executed OK: ${command}`);
    } else if (command === 'redivivus.runProject') {
      // [FIX] Run directly — VS Code command dispatch unreliable for this command
      const runRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
      const info = detectPostBuildInfo(runRoot, recentFiles);
      if (!info.runCmd && info.type === 'unknown') { vscode.window.showInformationMessage('No runnable entry point detected. Build something first!'); return; }
      if (info.type === 'html') {
        const htmlFile = info.entryFile || (info.detectedJsEntry ? createHtmlWrapperIfNeeded(runRoot, info.detectedJsEntry) : null);
        if (!htmlFile) { vscode.window.showInformationMessage('Ask Redivivus: "create an index.html for this project"'); return; }
        if (!info.entryFile) {
          deps.conversation.push({ role: 'assistant', content: `This is browser code — it needs an HTML page to run. I created \`index.html\` for you automatically.`, timestamp: Date.now() });
          deps.refresh();
        }
        // Open in the user's default browser outside of VS Code
        vscode.env.openExternal(vscode.Uri.file(path.join(runRoot, htmlFile)));
        debugLog(runRoot, 'run-command', `runProject: opened externally: ${htmlFile}`);
        return;
      }
      const term = vscode.window.createTerminal({ name: 'Redivivus: Run', cwd: runRoot });
      term.show();
      if (info.needsDeps && info.depsCmd) { term.sendText(info.depsCmd + ' && ' + (info.runCmd || '')); }
      else if (info.runCmd) { term.sendText(info.runCmd); }
      debugLog(runRoot, 'run-command', `runProject: terminal type=${info.type} cmd=${info.runCmd}`);
      const _monitorDelay = info.needsDeps ? 10000 : 4000;
      setTimeout(() => {
        const _err = getLastTerminalError();
        if (_err?.errorBlock && ChatPanel.currentPanel) {
          ChatPanel.currentPanel.handleMessage({ type: 'inject-terminal-error', error: _err });
          (ChatPanel.currentPanel as any)._panel?.reveal(undefined, false);
        }
      }, _monitorDelay);
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
