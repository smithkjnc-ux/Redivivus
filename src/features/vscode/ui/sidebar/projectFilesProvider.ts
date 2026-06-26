// [SCOPE] Project Files tree — shows the active build's project folder read straight from disk.
// No workspace folder is required, so there is NO window reload — the tree populates live as the
// build writes files. This is the no-reload alternative to opening the folder in the native Explorer.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FileNode { uri: vscode.Uri; name: string; isDir: boolean; }

export class ProjectFilesProvider implements vscode.TreeDataProvider<FileNode> {
  // [WARN] Static singleton so the build pipeline can set the active root without DI plumbing.
  public static instance: ProjectFilesProvider | undefined;

  private _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private _root: string | undefined;
  private _pollTimer: ReturnType<typeof setInterval> | undefined;

  /** Point the tree at a project folder (the active build root). Pass undefined to clear. */
  setRoot(dir: string | undefined): void {
    this._root = dir;
    this.refresh();
  }
  getRoot(): string | undefined { return this._root; }

  refresh(): void { this._onDidChangeTreeData.fire(undefined); }

  // Live updates while a build runs. Linux fs.watch recursive is unreliable, so a light poll is the
  // robust choice for a small project tree — re-reads the dir every second for the build's duration.
  startLiveRefresh(durationMs = 120_000): void {
    this.stopLiveRefresh();
    const deadline = Date.now() + durationMs;
    this._pollTimer = setInterval(() => {
      this.refresh();
      if (Date.now() > deadline) { this.stopLiveRefresh(); }
    }, 1000);
  }
  stopLiveRefresh(): void {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = undefined; }
    this.refresh(); // final render so the completed file set shows
  }

  getTreeItem(el: FileNode): vscode.TreeItem {
    const isRoot = !!this._root && path.resolve(el.uri.fsPath) === path.resolve(this._root);
    const collapsible = el.isDir
      ? (isRoot ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(el.uri, collapsible);
    item.label = el.name; // resourceUri drives the file-type icon; label keeps the plain name
    item.contextValue = el.isDir ? 'folder' : 'file';
    if (!el.isDir) {
      item.command = { command: 'vscode.open', title: 'Open File', arguments: [el.uri] };
    }
    return item;
  }

  getChildren(element?: FileNode): FileNode[] {
    // Top level: the project folder itself as a single expanded node.
    if (!element) {
      if (!this._root || !fs.existsSync(this._root)) { return []; }
      return [{ uri: vscode.Uri.file(this._root), name: path.basename(this._root), isDir: true }];
    }
    if (!element.isDir) { return []; }
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(element.uri.fsPath, { withFileTypes: true }); } catch { return []; }
    return entries
      .filter(e => e.name !== '.git' && e.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) { return a.isDirectory() ? -1 : 1; }
        return a.name.localeCompare(b.name);
      })
      .map(e => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, e.name)), name: e.name, isDir: e.isDirectory() }));
  }
}
