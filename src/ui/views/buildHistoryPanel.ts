// [SCOPE] CHASSIS Build History Panel — every build snapshotted; user can revert to any point.
// [FIX] Removed Save Points tab — snapshots ARE the save points. Git handles major milestones.
// [WARN] Panel posts undo-build message which calls SnapshotService.restore(), falling through to archive if needed.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';
import { SnapshotService } from '../../services/snapshotService.js';
import { buildHistoryHtml } from './buildHistoryPanelHtml.js';

let _panel: vscode.WebviewPanel | undefined;

export function showBuildHistoryPanel(context: vscode.ExtensionContext): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { vscode.window.showWarningMessage('No project folder open.'); return; }

  if (_panel) { _panel.reveal(vscode.ViewColumn.Beside); _panel.webview.postMessage({ type: 'refresh' }); return; }

  _panel = vscode.window.createWebviewPanel(
    'chassisBuildHistory', 'Build History',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  _panel.onDidDispose(() => { _panel = undefined; });

  _panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'get-data') {
      _sendData(root);
    } else if (msg.type === 'view-diff') {
      const snap = new SnapshotService(root);
      const meta = snap.listSnapshots().find(s => s.id === msg.snapshotId);
      if (!meta || !meta.preExisting.length) { vscode.window.showInformationMessage('No previous file state in this snapshot to diff.'); return; }
      let relPath = meta.preExisting[0];
      if (meta.preExisting.length > 1) {
        const pick = await vscode.window.showQuickPick(meta.preExisting, { placeHolder: 'Which file do you want to diff?' });
        if (!pick) {return;}
        relPath = pick;
      }
      const content = snap.getSnapshotFileContent(msg.snapshotId, relPath);
      if (content === null) { vscode.window.showWarningMessage('Snapshot file content not found.'); return; }
      const currentPath = path.join(root, relPath);
      const tempPath = path.join(os.tmpdir(), `chassis_snap_${msg.snapshotId.slice(-8)}_${path.basename(relPath)}`);
      fs.writeFileSync(tempPath, content, 'utf8');
      const label = meta.task.slice(0, 50);
      vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(tempPath), vscode.Uri.file(currentPath), `${path.basename(relPath)}: "${label}" vs Current`);
    } else if (msg.type === 'undo-build') {
      const snap = new SnapshotService(root);
      // restore() automatically falls through to archive if snapshot directory is gone
      const { restored, deleted, error } = snap.restore(msg.snapshotId);
      if (error) {
        _panel?.webview.postMessage({ type: 'undo-result', snapshotId: msg.snapshotId, success: false, error });
        vscode.window.showErrorMessage(`Could not revert: ${error}`);
      } else {
        const hist = new BuildHistoryService(root);
        hist.markUndone(msg.snapshotId);
        _panel?.webview.postMessage({ type: 'undo-result', snapshotId: msg.snapshotId, success: true, restored, deleted });
        const src = msg.snapshotId.startsWith('init_') ? 'first build baseline' : (restored > 0 ? `${restored} file(s) restored` : `${deleted} new file(s) removed`);
        vscode.window.showInformationMessage(`Reverted — ${src}.`);
      }
    }
  });

  _panel.webview.html = buildHistoryHtml();
}

function _sendData(root: string): void {
  if (!_panel) { return; }
  const histSvc = new BuildHistoryService(root);
  const snapSvc = new SnapshotService(root);

  const history = histSvc.list();
  const archivedIds = new Set(snapSvc.listArchivedSnapshots().map(s => s.id));
  const allSnapshots = snapSvc.listSnapshots();
  const historyIds = new Set(history.map(h => h.id));

  const snapMetaMap = new Map(allSnapshots.map(s => [s.id, s]));
  const annotated = history.map(h => ({
    ...h,
    isArchived: archivedIds.has(h.id),
    isInitial: false,
    preExisting: snapMetaMap.get(h.id)?.preExisting || [],
  }));

  const orphans = allSnapshots
    .filter(s => !historyIds.has(s.id))
    .map(s => ({
      id: s.id,
      timestamp: new Date(s.timestamp).toISOString(),
      task: (s as any).isInitial ? s.task : (s.task || '(Unknown build)'),
      files: s.files,
      tokensUsed: 0, costUSD: 0, source: 'ai' as const,
      supervisor: '', worker: null, resultCardToken: '', undone: false,
      isArchived: (s as any).isArchived || false,
      isInitial: (s as any).isInitial || false,
      preExisting: s.preExisting || [],
    }));

  const combined = [...annotated, ...orphans].sort((a, b) => b.id.localeCompare(a.id));
  _panel.webview.postMessage({ type: 'data', history: combined });
}
