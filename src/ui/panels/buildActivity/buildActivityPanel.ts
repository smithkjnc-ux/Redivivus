// [SCOPE] Build Activity webview panel — shows the live build pipeline (supervisor -> worker ->
// continuations -> failover -> guardian -> done) beside the chat, so the user can WATCH the work
// instead of staring at a waiting bubble. Lifecycle + message bridge only; HTML is in buildActivityHtml.ts.
// Steps arrive from cloudBuildClient via the build runner's onStep callback (backend @@RDV_STEP@@ frames).

import * as vscode from 'vscode';
import { buildActivityHtml } from './buildActivityHtml.js';

export class BuildActivityPanel {
  private static _instance: BuildActivityPanel | undefined;
  // Full message log (step/code/finish) for the CURRENT or LAST build. Kept STATIC so it survives the
  // panel being closed — letting `reveal()` recreate the panel and replay the last build on demand.
  private static _history: any[] = [];
  private static _lastTask = '';
  private _panel: vscode.WebviewPanel;
  private _ready = false;
  // Messages that arrived before the webview finished loading — flushed on 'ready'.
  private _queue: any[] = [];

  public static get current(): BuildActivityPanel | undefined { return BuildActivityPanel._instance; }

  // User setting (Setup / Settings): show each step's work expanded by default, or collapsed.
  private static _expandDefault(): boolean {
    return vscode.workspace.getConfiguration('redivivus').get<boolean>('buildActivity.expandSteps', true);
  }

  private static _createPanel(): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
      'redivivusBuildActivity', 'Build Activity',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
  }

  // Open (or reveal) the panel and reset its timeline for a NEW build. Beside the editor so the chat
  // bubble stays visible in the sidebar — the panel complements the bubble, it does not replace it.
  public static start(task: string): BuildActivityPanel {
    BuildActivityPanel._history = []; // new build — clear the replay log
    BuildActivityPanel._lastTask = task;
    if (BuildActivityPanel._instance) {
      BuildActivityPanel._instance._reset(task);
      BuildActivityPanel._instance._panel.reveal(vscode.ViewColumn.Beside, true);
      return BuildActivityPanel._instance;
    }
    BuildActivityPanel._instance = new BuildActivityPanel(BuildActivityPanel._createPanel(), task);
    return BuildActivityPanel._instance;
  }

  // Reopen the panel ON DEMAND (command / button) WITHOUT starting a new build. If a build is running,
  // just bring its panel to the front. Otherwise recreate the panel and replay the LAST build's timeline
  // so the user can review it after closing the tab or reopening the project. Empty state if nothing yet.
  public static reveal(): BuildActivityPanel {
    if (BuildActivityPanel._instance) {
      BuildActivityPanel._instance._panel.reveal(vscode.ViewColumn.Beside, false);
      return BuildActivityPanel._instance;
    }
    const inst = new BuildActivityPanel(BuildActivityPanel._createPanel(), BuildActivityPanel._lastTask || 'Build Activity');
    // Replay the last build: seed the queue with the recorded log so it flushes once the webview is ready.
    inst._queue = [...BuildActivityPanel._history];
    BuildActivityPanel._instance = inst;
    return inst;
  }

  private constructor(panel: vscode.WebviewPanel, task: string) {
    this._panel = panel;
    this._panel.onDidDispose(() => { BuildActivityPanel._instance = undefined; });
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg?.type === 'ready') {
        this._ready = true;
        for (const m of this._queue) { this._post(m); }
        this._queue = [];
      }
    });
    this._panel.webview.html = buildActivityHtml(task, BuildActivityPanel._expandDefault());
  }

  // Record a message to the replay log, then send it (or queue it until the webview is ready).
  private _send(msg: any): void {
    BuildActivityPanel._history.push(msg);
    if (!this._ready) { this._queue.push(msg); return; }
    this._post(msg);
  }

  // Append one pipeline step. Safe to call before the webview is ready (queued, then flushed).
  public step(step: any): void {
    this._send({ type: 'step', step });
  }

  // Stream a chunk of the Worker's code into the live code block (Phase 2).
  public code(text: string): void {
    if (!text) { return; }
    this._send({ type: 'code', text });
  }

  // Mark the build finished (adds a final row). ok=false renders a failed marker.
  public finish(ok: boolean, label?: string): void {
    this._send({ type: 'finish', ok, label });
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
