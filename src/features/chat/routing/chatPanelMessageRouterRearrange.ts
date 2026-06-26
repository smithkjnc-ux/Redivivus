// [SCOPE] Chat Panel rearrange-mode message handlers — inject drag script, apply moves, snapshot/restore

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SnapshotService } from '../../../services/snapshotService.js';
import { BuildHistoryService } from '../build/services/buildHistoryService.js';
import { moveChildElement, reparentElement, transplantElement } from '../../../services/html/htmlElementMover.js';
import { getRearrangeScript } from '../ui/chatPanelRearrangeScript.js';

const MARK_S = '<!-- Redivivus:REARRANGE -->';
const MARK_E = '<!-- /Redivivus:REARRANGE -->';
const MARK_RE = /<!-- Redivivus:REARRANGE -->[\s\S]*?<!-- \/Redivivus:REARRANGE -->\n?/g;

function findHtmlFile(root: string): string | null {
  try { const h = new BuildHistoryService(root); const last = h.list()[0]; return (last?.files ?? []).find(f => /\.html$/i.test(f)) ?? null; }
  catch { return null; }
}

function post(panel: any, msg: unknown): void { panel._panel.webview.postMessage(msg); }
function root(): string | undefined { return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; }

export function stripRearrangeMarkers(r: string): void {
  const rel = findHtmlFile(r); if (!rel) return;
  const abs = path.join(r, rel);
  try { const html = fs.readFileSync(abs, 'utf-8'); const clean = html.replace(MARK_RE, ''); if (clean !== html) fs.writeFileSync(abs, clean, 'utf-8'); } catch {}
}

export async function handleRearrangeStart(panel: any): Promise<boolean> {
  const r = root(); if (!r) return true;
  const rel = findHtmlFile(r);
  if (!rel) { post(panel, { type: 'rearrange-error', message: 'No HTML file found.' }); return true; }
  const abs = path.join(r, rel);
  try {
    const snapId = new SnapshotService(r).prepare('rearrange', [rel]);
    let html = fs.readFileSync(abs, 'utf-8').replace(MARK_RE, '');
    html = html.replace(/<\/body>/i, `\n${MARK_S}\n<script>\n${getRearrangeScript()}\n</script>\n${MARK_E}\n</body>`);
    fs.writeFileSync(abs, html, 'utf-8');
    (panel as any)._rearrangeMoves = [];
    post(panel, { type: 'preview-refresh' });
    post(panel, { type: 'rearrange-active', snapId, file: rel });
  } catch (e) { post(panel, { type: 'rearrange-error', message: String(e) }); }
  return true;
}

export function handleRearrangeMove(panel: any, msg: any): boolean {
  // No file I/O during the session — writing would trigger the dev server's file watcher
  // and reload the page, wiping the DOM state and killing arrow-key continuity.
  // Moves are accumulated here and applied to disk as a batch on Done.
  const moves: any[] = (panel as any)._rearrangeMoves ?? [];
  if (msg.inside) {
    moves.push({ inside: true, fromParentPath: msg.fromParentPath, fromIndex: msg.fromIndex, toPath: msg.toPath });
  } else if (msg.transplant) {
    moves.push({ transplant: true, fromParentPath: msg.fromParentPath, fromIndex: msg.fromIndex, refPath: msg.refPath, after: msg.after });
  } else {
    moves.push({ parentPath: msg.parentPath, fromIndex: msg.fromIndex, toIndex: msg.toIndex });
  }
  (panel as any)._rearrangeMoves = moves;
  post(panel, { type: 'rearrange-moved', snapId: msg.snapId });
  return true;
}

export function handleRearrangeFinish(panel: any, msg: any): boolean {
  const r = root(); if (!r) return true;
  const rel = findHtmlFile(r); if (!rel) return true;
  const abs = path.join(r, rel);
  try {
    let html = fs.readFileSync(abs, 'utf-8');
    const moves: any[] = (panel as any)._rearrangeMoves ?? [];
    for (const m of moves) {
      if (m.inside) { html = reparentElement(html, m.fromParentPath, m.fromIndex, m.toPath); }
      else if (m.transplant) { html = transplantElement(html, m.fromParentPath, m.fromIndex, m.refPath, m.after); }
      else { html = moveChildElement(html, m.parentPath, m.fromIndex, m.toIndex); }
    }
    (panel as any)._rearrangeMoves = [];
    fs.writeFileSync(abs, html.replace(MARK_RE, ''), 'utf-8');
    post(panel, { type: 'preview-refresh' });
    post(panel, { type: 'rearrange-done' });
  } catch {}
  return true;
}

export function handleRearrangeUndo(panel: any, msg: any): boolean {
  const r = root(); if (!r) return true;
  if (!msg.snapId) return true;
  (panel as any)._rearrangeMoves = [];
  try { new SnapshotService(r).restore(msg.snapId); } catch {}
  post(panel, { type: 'preview-refresh' });
  post(panel, { type: 'rearrange-done' });
  return true;
}
