// [SCOPE] Redivivus Architecture Map panel — singleton WebviewPanel shell
// Nodes = files (colored by health), edges = import relationships. Click a node to inspect and fix.
// [WARN] Singleton — use MapPanel.show(), never call constructor directly.
// [DEAD] DO NOT inline large JS strings (>~400 lines) into webview HTML via template literals.
//        VS Code webview uses document.write() internally with a hard size limit. Exceeding it
//        causes: SyntaxError: Failed to execute 'write' on 'Document': Unexpected string
//        at index.html:1058:23 — regardless of content (no bad chars, no </script, no surrogates).
//        Fix: write script to disk, serve via webview.asWebviewUri(), load with <script src>.
//        See mapPanelHtml.ts for the correct pattern. See REDIVIVUS_ROADMAP.md May 8 2026 for full history.
// HTML assembly -> mapPanelHtml.ts | Message handlers -> mapPanelMessages.ts + mapPanelTimelineMessages.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ProjectMap } from '../../services/mapBuilderService.js';
import { buildProjectMap } from '../../services/mapBuilderService.js';
import type { GuardianService } from '../../services/ai/guardianService.js';
import { MAP_SCRIPT } from './mapScript.js';
import { MAP_STYLES } from './mapStyles.js';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';
import { SavePointService } from '../../services/savePointService.js';
import { SnapshotService } from '../../services/snapshotService.js';
import { buildMapHtml as buildFullMapHtml } from './mapPanelHtml.js';
import { handleMapMessage } from './mapMessageDispatcher.js';

export class MapPanel {
  private static _instance: MapPanel | undefined;
  public static get currentPanel(): MapPanel | undefined { return MapPanel._instance; }

  private readonly _panel: vscode.WebviewPanel;
  private _map: ProjectMap = { nodes: [], edges: [] };
  private _root: string;
  private _projectName: string;
  private _guardian: GuardianService;

  /** Builds simplified map HTML for embedding as srcdoc in the chat panel tab iframe (no timeline). */
  public static buildMapHtml(root: string, projectName: string): string {
    let map: ProjectMap = { nodes: [], edges: [] };
    try { map = buildProjectMap(root); } catch { /* return empty map */ }
    const title = projectName + ' — Architecture Map';
    const data = JSON.stringify(map);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>html,body{height:100%;margin:0;overflow:hidden;}${MAP_STYLES}</style></head><body style="height:100%;margin:0;"><div id="header"><span id="map-title">\u{1F5FA} ${title} — ${map.nodes.length} files</span><span id="legend"><span class="dot good"></span>Healthy <span class="dot warn"></span>Needs work <span class="dot bad"></span>Problem</span><div id="layout-toggles"><button class="layout-btn active" data-layout="network">\u{1F578}️ Network</button><button class="layout-btn" data-layout="clustered">\u{1F3DD}️ Clustered</button><button class="layout-btn" data-layout="hierarchy">\u{1F5C2}️ Hierarchy</button></div><button id="refresh-btn">\u{1F504} Refresh</button></div><div id="root"><canvas id="canvas"></canvas><div id="side-panel" class="hidden"></div></div><div id="lens-preview" class="hidden"></div><div id="toast"></div><script>const GRAPH_DATA = ${data};${MAP_SCRIPT}<\/script></body></html>`;
  }

  public static show(root: string, guardian: GuardianService, projectName?: string): void {
    const title = (projectName || 'Project') + ' — Architecture Map';
    if (MapPanel._instance) {
      MapPanel._instance._panel.reveal(vscode.ViewColumn.One, false);
      MapPanel._instance._projectName = projectName || MapPanel._instance._projectName;
      MapPanel._instance.refresh(root);
      return;
    }
    const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
    const panel = vscode.window.createWebviewPanel(
      'redivivusMap', title,
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );
    MapPanel._instance = new MapPanel(panel, root, guardian, projectName || 'Project');
  }

  private constructor(panel: vscode.WebviewPanel, root: string, guardian: GuardianService, projectName: string) {
    this._panel = panel;
    this._root = root;
    this._projectName = projectName;
    this._guardian = guardian;
    this._panel.onDidDispose(() => { MapPanel._instance = undefined; });
    this._panel.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
    this.refresh(root);
  }

  public refresh(root: string): void {
    this._root = root;
    try {
      this._map = buildProjectMap(root);
    } catch (e) {
      console.error('[Redivivus] mapBuilderService failed:', e);
      this._map = { nodes: [], edges: [] };
    }
    this._panel.webview.html = buildFullMapHtml(
      this._projectName, this._map, this._panel.webview, this._buildTimelineData()
    );
  }

  // [SCOPE] Reads build history, save points, and orphan snapshots for the timeline view
  private _buildTimelineData(): object {
    try {
      const histSvc = new BuildHistoryService(this._root);
      const spSvc   = new SavePointService(this._root);
      const snapSvc = new SnapshotService(this._root);
      const history = histSvc.list();
      const savePoints = spSvc.list().map(sp => ({ id: sp.hash, timestamp: sp.timestamp, message: sp.message }));
      const histIds = new Set(history.map(h => h.id));
      const orphans = snapSvc.listSnapshots()
        .filter(s => !histIds.has(s.id))
        .map(s => ({
          id: s.id, timestamp: new Date(s.timestamp).toISOString(),
          task: '(Unknown build)', files: s.files,
          tokensUsed: 0, costUSD: 0, source: 'ai' as const,
          supervisor: '', worker: null, undone: false,
        }));
      const branchFromId = (() => {
        try {
          const f = path.join(this._root, '.redivivus', 'timeline_state.json');
          if (fs.existsSync(f)) { return JSON.parse(fs.readFileSync(f, 'utf8')).branchFromId || null; }
        } catch { /* ignore */ }
        return null;
      })();
      return { history: [...history, ...orphans], savePoints, branchFromId };
    } catch {
      return { history: [], savePoints: [], branchFromId: null };
    }
  }

  private async _handleMessage(msg: any): Promise<void> {
    await handleMapMessage(msg, {
      root: this._root,
      map: this._map,
      webview: this._panel.webview,
      guardian: this._guardian,
      panel: this._panel,
      refresh: () => this.refresh(this._root),
    });
  }
}
