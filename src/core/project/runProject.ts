// [SCOPE] The ONE type-aware "run the project like a standalone program" implementation. Every run entry
// point (green Run button, redivivus.runProject command, typed "run") routes here, so there is a single
// place to fix/extend — this replaced 6 forked copies, each of which had its own file:// bug.
// Type-aware: web/HTML → http + the real browser (openWebInBrowser); everything else → detectPostBuildInfo's
// run command in a terminal, with terminal-error monitoring that auto-injects a failure into the fix pipeline.

import * as vscode from 'vscode';
import { openWebInBrowser } from './openWebInBrowser.js';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';
import { detectPostBuildInfo, createHtmlWrapperIfNeeded } from '../build/chatPanelPostBuild.js';
import { getLastTerminalError } from '../../services/workspace/terminalErrorService.js';

export async function runProject(root: string): Promise<void> {
  const recentFiles = new BuildHistoryService(root).list().filter(e => !e.undone).slice(0, 1).flatMap(e => e.files);
  const info = detectPostBuildInfo(root, recentFiles);
  if (!info.runCmd && info.type === 'unknown') {
    vscode.window.showInformationMessage('No runnable entry point detected. Build something first!');
    return;
  }

  // web/HTML → serve over http + open the REAL browser (NEVER file:// — modular apps are CORS-blocked there).
  if (info.type === 'html') {
    const htmlFile = info.entryFile || (info.detectedJsEntry ? createHtmlWrapperIfNeeded(root, info.detectedJsEntry) : null);
    if (!htmlFile) { vscode.window.showInformationMessage('Ask Redivivus: "create an index.html for this project"'); return; }
    await openWebInBrowser(root, htmlFile);
    return;
  }

  // Everything else → run command in a terminal.
  const term = vscode.window.createTerminal({ name: 'Redivivus: Run', cwd: root });
  term.show();
  if (info.needsDeps && info.depsCmd) { term.sendText(info.depsCmd + ' && ' + (info.runCmd || '')); }
  else if (info.runCmd) { term.sendText(info.runCmd); }

  // Terminal-error monitoring → auto-inject a failure into the fix pipeline (was duplicated across callers).
  const monitorDelay = info.needsDeps ? 8000 : 3000;
  setTimeout(() => {
    const err = getLastTerminalError();
    if (err && err.errorBlock) {
      const { ChatPanel } = require('../../ui/panels/chat/chatPanel.js');
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.handleMessage({ type: 'inject-terminal-error', error: err });
        ChatPanel.currentPanel['_panel']?.reveal(undefined, false);
      } else {
        vscode.commands.executeCommand('redivivus.openChat');
        setTimeout(() => ChatPanel.currentPanel?.handleMessage({ type: 'inject-terminal-error', error: err }), 600);
      }
    }
  }, monitorDelay);
}
