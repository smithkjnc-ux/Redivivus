// [SCOPE] Chat Panel Message Router — Live Preview message handlers + embedded Visual Editor + rearrange
// Extracted from chatPanelMessageRouterEarlyExits.ts (Rule 9 split).

import * as vscode from 'vscode';
import { extractVisualContract } from '../../vault/logic/propertyExtractor.js';
import { applyBatchPatches } from '../../vault/logic/visualContractPatcher.js';
import type { VisualProperty } from '../../vault/logic/visualContractTypes.js';
import { BuildHistoryService } from '../../build/services/buildHistoryService.js';
import { handleRearrangeStart, handleRearrangeMove, handleRearrangeFinish, handleRearrangeUndo, stripRearrangeMarkers } from './chatPanelMessageRouterRearrange.js';
import * as fs from 'fs';
import * as path from 'path';
import { getActiveProjectRoot } from '../../project/logic/activeProjectRoot.js';

export async function handlePreviewMessages(panel: any, msg: any): Promise<boolean> {
  if (msg.type === 'preview-errors-captured') {
    const { recordPreviewErrors } = await import('../../workspace/data/previewErrorService.js');
    recordPreviewErrors(msg.errors || []);
    return true;
  }
  const _panel = (panel as any)._panel;

  if (msg.type === 'start-preview') {
    const root = getActiveProjectRoot(panel);
    if (!root) {
      _panel.webview.postMessage({ type: 'preview-error', message: 'No project folder open.' });
      return true;
    }
    stripRearrangeMarkers(root);
    const { detectDevServer, detectProjectKind, getNoPreviewMessage, startPreviewServer, waitForPort } = await import('../ui/chatPanelPreview.js');
    const kind = detectProjectKind(root);
    if (kind === 'python' || kind === 'node-cli' || kind === 'shell') {
      _panel.webview.postMessage({ type: 'preview-error', message: getNoPreviewMessage(kind) });
      return true;
    }
    const info = detectDevServer(root);
    if (!info) {
      _panel.webview.postMessage({ type: 'preview-error', message: getNoPreviewMessage(kind) });
      return true;
    }
    _panel.webview.postMessage({ type: 'preview-loading', message: info.loadingMsg });
    const { port, alreadyRunning, needsInstall } = await startPreviewServer(root, info);
    // [FIX] npm install on a fresh AI-generated project takes 30-120s; the old 30s timeout expired before
    // the dev server even started. Give install+boot a full 180s; normal boots still get 30s.
    if (needsInstall) {
      _panel.webview.postMessage({ type: 'preview-loading', message: 'Installing dependencies — this may take a minute...' });
    }
    const timeout = (info.type === 'static' || alreadyRunning) ? 2_000 : (needsInstall ? 180_000 : 30_000);
    const ready = await waitForPort(port, timeout);
    if (ready) {
      _panel.webview.postMessage({ type: 'preview-ready', port });
    } else {
      _panel.webview.postMessage({ type: 'preview-error', message: `Server didn't start on port ${port}. Check the Redivivus Preview terminal for errors.` });
    }
    return true;
  }

  if (msg.type === 'popout-preview') {
    vscode.commands.executeCommand('simpleBrowser.show', `http://localhost:${msg.port}`);
    return true;
  }

  if (msg.type === 'open-in-browser') {
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${msg.port}`));
    return true;
  }

  if (msg.type === 'rearrange-start') return handleRearrangeStart(panel);
  if (msg.type === 'redivivus-drag-drop') return handleRearrangeMove(panel, msg);
  if (msg.type === 'rearrange-finish') return handleRearrangeFinish(panel, msg);
  if (msg.type === 'rearrange-undo') return handleRearrangeUndo(panel, msg);

  if (msg.type === 've-open-request') {
    const root = getActiveProjectRoot(panel);
    if (!root) { return true; }
    let builtFiles: string[] = [];
    try { const h = new BuildHistoryService(root); const last = h.list()[0]; builtFiles = last?.files ?? []; } catch {}
    if (!builtFiles.length) {
      try { for (const f of fs.readdirSync(root)) { if (/\.(html|css)$/i.test(f)) { builtFiles.push(f); } } } catch {}
    }
    const contract = extractVisualContract(root, builtFiles);
    _panel.webview.postMessage({ type: 'show-visual-editor', contract });
    return true;
  }

  if (msg.type === 'visual-apply-all') {
    const root = msg.projectRoot || getActiveProjectRoot(panel);
    if (!root || !msg.pending) { return true; }
    let builtFiles: string[] = [];
    try { const h = new BuildHistoryService(root); const last = h.list()[0]; builtFiles = last?.files ?? []; } catch {}
    const contract = extractVisualContract(root, builtFiles);
    const patches: Array<{ prop: VisualProperty; newValue: string }> = [];
    for (const [id, newValue] of Object.entries(msg.pending as Record<string, string>)) {
      const prop = contract.properties.find(p => p.id === id);
      if (prop) { patches.push({ prop, newValue }); }
    }
    const results = applyBatchPatches(patches, root);
    const failed = results.filter(r => !r.success);
    const refreshed = failed.length === 0 ? extractVisualContract(root, builtFiles) : null;
    _panel.webview.postMessage({ type: 'visual-patch-ack', ok: failed.length === 0, message: failed.map(r => r.message).join('; '), contract: refreshed });
    if (failed.length === 0) { _panel.webview.postMessage({ type: 'preview-refresh' }); }
    return true;
  }

  return false;
}
