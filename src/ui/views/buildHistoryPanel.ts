// [SCOPE] CHASSIS Build History Panel — two-tab webview panel:
//   📍 Save Points — user-created git checkpoints
//   🏗️ Build History — automatic log of every successful CHASSIS build
// [WARN] Panel posts messages to ChatPanel for undo (routes through chassis.undoBuild command).

import * as vscode from 'vscode';
import { SavePointService } from '../../services/savePointService.js';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';
import { SnapshotService } from '../../services/snapshotService.js';
import { buildHistoryHtml } from './buildHistoryPanelHtml.js';

let _panel: vscode.WebviewPanel | undefined;

export function showBuildHistoryPanel(context: vscode.ExtensionContext): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { vscode.window.showWarningMessage('No project folder open.'); return; }

  if (_panel) {
    _panel.reveal(vscode.ViewColumn.Beside);
    _panel.webview.postMessage({ type: 'refresh' });
    return;
  }

  _panel = vscode.window.createWebviewPanel(
    'chassisBuildHistory', '💾 Save Points & Build History',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  _panel.onDidDispose(() => { _panel = undefined; });

  _panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'get-data') {
      _sendData(root);
    } else if (msg.type === 'create-save-point') {
      const svc = new SavePointService(root);
      const desc = msg.description || `CHASSIS save point — ${new Date().toISOString().slice(0, 19)}`;
      const result = await svc.create(desc);
      if (result.success) { vscode.window.showInformationMessage(`💾 ${result.message}`); _sendData(root); }
      else { vscode.window.showErrorMessage(result.message); }
    } else if (msg.type === 'restore-save-point') {
      const svc = new SavePointService(root);
      const result = await svc.restore(msg.hash);
      if (result.success) { vscode.window.showInformationMessage(`↩ Restored to save point`); _sendData(root); }
      else { vscode.window.showErrorMessage(result.message); }
    } else if (msg.type === 'undo-build') {
      const snap = new SnapshotService(root);
      const { restored, deleted, error } = snap.restore(msg.snapshotId);
      if (error) {
        _panel?.webview.postMessage({ type: 'undo-result', snapshotId: msg.snapshotId, success: false, error });
      } else {
        const hist = new BuildHistoryService(root);
        hist.markUndone(msg.snapshotId);
        _panel?.webview.postMessage({ type: 'undo-result', snapshotId: msg.snapshotId, success: true, restored, deleted });
        vscode.window.showInformationMessage(`↩ Undone. Restored ${restored} file(s), deleted ${deleted} new file(s).`);
      }
    } else if (msg.type === 'promote-to-save-point') {
      const hist = new BuildHistoryService(root);
      const entries = hist.list();
      const entry = entries.find(e => e.id === msg.snapshotId);
      const desc = entry ? entry.task.slice(0, 72) : `Build ${msg.snapshotId}`;
      const svc = new SavePointService(root);
      const result = await svc.create(desc);
      if (result.success) { vscode.window.showInformationMessage(`💾 Promoted to save point: ${desc.slice(0, 40)}`); _sendData(root); }
      else { vscode.window.showErrorMessage(result.message); }
    }
  });

  _panel.webview.html = buildHistoryHtml();
}

function _sendData(root: string): void {
  if (!_panel) { return; }
  const spSvc = new SavePointService(root);
  const histSvc = new BuildHistoryService(root);
  const snapSvc = new SnapshotService(root);

  const savePoints = spSvc.list();
  const history = histSvc.list();

  const allSnapshots = snapSvc.listSnapshots();
  const historyIds = new Set(history.map(h => h.id));
  const orphans = allSnapshots
    .filter(s => !historyIds.has(s.id))
    .map(s => ({
      id: s.id,
      timestamp: new Date(s.timestamp).toISOString(),
      task: '(Unknown build)',
      files: s.files,
      tokensUsed: 0,
      costUSD: 0,
      source: 'ai' as const,
      supervisor: '',
      worker: null,
      resultCardToken: '',
      undone: false,
    }));

  const combined = [...history, ...orphans].sort((a, b) => b.id.localeCompare(a.id));
  _panel.webview.postMessage({ type: 'data', savePoints, history: combined });
}
