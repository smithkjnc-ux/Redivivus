// [SCOPE] Build Activity webview panel — shows the live build pipeline (supervisor -> worker ->
// continuations -> failover -> guardian -> done) beside the chat, so the user can WATCH the work
// instead of staring at a waiting bubble. Lifecycle + message bridge only; HTML is in buildActivityHtml.ts.
// Steps arrive from cloudBuildClient via the build runner's onStep callback (backend @@RDV_STEP@@ frames).

import * as vscode from 'vscode';
import { buildActivityHtml } from './buildActivityHtml';

export class BuildActivityPanel {
  private static _instance: BuildActivityPanel | undefined;
  private _panel: vscode.WebviewPanel;
  private _ready = false;
  // Steps that arrived before the webview finished loading — flushed on 'ready'.
  private _queue: any[] = [];

  public static get current(): BuildActivityPanel | undefined { return BuildActivityPanel._instance; }

  // User setting (Setup / Settings): show each step's work expanded by default, or collapsed.
  private static _expandDefault(): boolean {
    return vscode.workspace.getConfiguration('redivivus').get<boolean>('buildActivity.expandSteps', true);
  }

  // Open (or reveal) the panel and reset its timeline for a new build. Beside the editor so the chat
  // bubble stays visible in the sidebar — the panel complements the bubble, it does not replace it.
  public static start(task: string): BuildActivityPanel {
    if (BuildActivityPanel._instance) {
      BuildActivityPanel._instance._reset(task);
      BuildActivityPanel._instance._panel.reveal(vscode.ViewColumn.Beside, true);
      return BuildActivityPanel._instance;
    }
    const panel = vscode.window.createWebviewPanel(
      'redivivusBuildActivity', 'Build Activity',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    BuildActivityPanel._instance = new BuildActivityPanel(panel, task);
    return BuildActivityPanel._instance;
  }

  private constructor(panel: vscode.WebviewPanel, task: string) {
    this._panel = panel;
    this._panel.onDidDispose(() => { BuildActivityPanel._instance = undefined; });
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg?.type === 'ready') {
        this._ready = true;
        for (const s of this._queue) { this._post({ type: 'step', step: s }); }
        this._queue = [];
      }
    });
    this._panel.webview.html = buildActivityHtml(task, BuildActivityPanel._expandDefault());
  }

  // Append one pipeline step. Safe to call before the webview is ready (queued, then flushed).
  public step(step: any): void {
    if (!this._ready) { this._queue.push(step); return; }
    this._post({ type: 'step', step });
  }

  // Stream a chunk of the Worker's code into the live code block (Phase 2). Best-effort — only matters
  // once the worker:running row exists, which is well after the panel is ready, so no queueing needed.
  public code(text: string): void {
    if (!this._ready || !text) { return; }
    this._post({ type: 'code', text });
  }

  // Mark the build finished (adds a final row). ok=false renders a failed marker.
  public finish(ok: boolean, label?: string): void {
    this._post({ type: 'finish', ok, label });
  }

  private _reset(task: string): void {
    this._ready = false;
    this._queue = [];
    this._panel.webview.html = buildActivityHtml(task, BuildActivityPanel._expandDefault());
  }

  private _post(msg: any): void {
    try { this._panel.webview.postMessage(msg); } catch { /* panel disposed mid-build — non-fatal */ }
  }
}
