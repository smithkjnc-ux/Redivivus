// [SCOPE] Architecture Map panel — timeline message handlers (undo build, save point, branch)
// Imported by mapPanelMessages.ts. Uses MapMsgCtx from mapPanelMessages.ts.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BuildHistoryService } from '../../features/chat/build/services/buildHistoryService.js';
import { SavePointService } from '../../services/savePointService.js';
import { SnapshotService } from '../../services/snapshotService.js';
import type { MapMsgCtx } from './mapMessageDispatcher.js';

export async function handleMapTimelineMessage(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root, panel } = ctx;
  const webview = panel.webview;

  if (msg.type === 'tl-undo-build' && msg.snapshotId) {
    try {
      const snap = new SnapshotService(root);
      const { restored, deleted, error } = snap.restore(msg.snapshotId);
      if (error) {
        webview.postMessage({ type: 'tl-undo-result', snapshotId: msg.snapshotId, success: false, error });
      } else {
        const hist = new BuildHistoryService(root);
        hist.markUndone(msg.snapshotId);
        webview.postMessage({ type: 'tl-undo-result', snapshotId: msg.snapshotId, success: true, restored, deleted });
        vscode.window.showInformationMessage(`↩ Undone. Restored ${restored} file(s), deleted ${deleted} new file(s).`);
      }
    } catch (err) {
      webview.postMessage({ type: 'tl-undo-result', snapshotId: msg.snapshotId, success: false, error: String(err) });
    }

  } else if (msg.type === 'tl-promote-save-point' && msg.snapshotId) {
    try {
      const hist = new BuildHistoryService(root);
      const entry = hist.list().find(e => e.id === msg.snapshotId);
      const desc = entry ? entry.task.slice(0, 72) : `Build ${msg.snapshotId}`;
      const spSvc = new SavePointService(root);
      const result = await spSvc.create(desc);
      if (result.success) {
        vscode.window.showInformationMessage(`📍 Save point created: ${desc.slice(0, 40)}`);
        webview.postMessage({ type: 'tl-promote-result', snapshotId: msg.snapshotId, success: true });
      } else {
        vscode.window.showErrorMessage(result.message);
        webview.postMessage({ type: 'tl-promote-result', snapshotId: msg.snapshotId, success: false });
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create save point: ${String(err)}`);
    }

  } else if (msg.type === 'tl-branch-from' && msg.snapshotId) {
    try {
      const stateFile = path.join(root, '.redivivus', 'timeline_state.json');
      const dir = path.dirname(stateFile);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(stateFile, JSON.stringify({ branchFromId: msg.snapshotId }), 'utf8');
      webview.postMessage({ type: 'tl-branch-result', snapshotId: msg.snapshotId });
      vscode.window.showInformationMessage(`🌿 Branching from build ${new Date(parseInt(msg.snapshotId, 10)).toLocaleString()}. Your next build creates a new timeline branch.`);
    } catch { /* ignore */ }
  }
}
