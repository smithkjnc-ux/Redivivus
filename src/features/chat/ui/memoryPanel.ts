// [SCOPE] Memory Panel webview — shows global user profile + per-project knowledge in one view.
// Read-only with delete. Add-preference via input field. Mirrors ApiSetupPanel pattern.

import * as vscode from 'vscode';
import { getMemoryPanelHtml } from './memoryPanelHtml.js';

export class MemoryPanel {
  public static currentPanel: MemoryPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._render();
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'delete-explicit') {
        const { removeExplicit } = await import('../logic/userMemoryService.js');
        removeExplicit(msg.index);
        this._render();
      } else if (msg.type === 'add-explicit') {
        const { rememberExplicit } = await import('../logic/userMemoryService.js');
        if (msg.text?.trim()) { rememberExplicit(msg.text.trim()); }
        this._render();
      } else if (msg.type === 'delete-knowledge') {
        try {
          const root = msg.root;
          if (!root) { return; }
          const { readKnowledge, writeKnowledge } = await import('../logic/learnedMemoryServiceIO.js');
          const store = readKnowledge(root);
          store.entries = store.entries.filter((_: any, i: number) => i !== msg.index);
          writeKnowledge(root, store);
        } catch {}
        this._render();
      } else if (msg.type === 'clear-recent') {
        try {
          const root = msg.root;
          if (!root) { return; }
          const { readKnowledge, writeKnowledge } = await import('../logic/learnedMemoryServiceIO.js');
          const store = readKnowledge(root);
          store.entries = store.entries.filter((e: any) => e.permanent);
          writeKnowledge(root, store);
        } catch {}
        this._render();
      } else if (msg.type === 'open-rules-file') {
        try {
          const uri = vscode.Uri.file(msg.path);
          await vscode.window.showTextDocument(uri);
        } catch {}
      }
    }, null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _render(): void {
    this._panel.webview.html = getMemoryPanelHtml();
  }

  public static createOrShow(): void {
    if (MemoryPanel.currentPanel) {
      MemoryPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'redivivusMemory', '🧠 Redivivus Memory', vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    MemoryPanel.currentPanel = new MemoryPanel(panel);
  }

  public dispose(): void {
    MemoryPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }
}
