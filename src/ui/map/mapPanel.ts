// [SCOPE] CHASSIS Architecture Map panel — singleton WebviewPanel that renders the project as an interactive graph
// Nodes = files (colored by health), edges = import relationships. Click a node to inspect and fix.
// [WARN] Singleton — use MapPanel.show(), never call constructor directly.
// [DEAD] DO NOT inline large JS strings (>~400 lines) into webview HTML via template literals.
//        VS Code webview uses document.write() internally with a hard size limit. Exceeding it
//        causes: SyntaxError: Failed to execute 'write' on 'Document': Unexpected string
//        at index.html:1058:23 — regardless of content (no bad chars, no </script, no surrogates).
//        The fix is: write the script to disk, serve via webview.asWebviewUri(), load with <script src>.
//        See _buildHtml() for the correct pattern. See CHASSIS_ROADMAP.md May 8 2026 for full history.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { buildProjectMap, ProjectMap } from '../../services/mapBuilderService.js';
import { GuardianService } from '../../services/ai/guardianService.js';
import { MAP_SCRIPT } from './mapScript.js';
import { MAP_STYLES } from './mapStyles.js';
import { MAP_TIMELINE_SCRIPT } from './mapTimelineScript.js';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';
import { SavePointService } from '../../services/savePointService.js';
import { SnapshotService } from '../../services/snapshotService.js';

export class MapPanel {
  private static _instance: MapPanel | undefined;
  public static get currentPanel(): MapPanel | undefined { return MapPanel._instance; }

  private readonly _panel: vscode.WebviewPanel;
  private _map: ProjectMap = { nodes: [], edges: [] };
  private _root: string;
  private _projectName: string;
  private _guardian: GuardianService;

  /** Builds the map HTML for embedding as srcdoc in the chat panel tab iframe. */
  public static buildMapHtml(root: string, projectName: string): string {
    let map: ProjectMap = { nodes: [], edges: [] };
    try { map = buildProjectMap(root); } catch { /* return empty map */ }
    const title = projectName + ' — Architecture Map';
    const data = JSON.stringify(map);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>html,body{height:100%;margin:0;overflow:hidden;}${MAP_STYLES}</style></head><body style="height:100%;margin:0;"><div id="header"><span id="map-title">\u{1F5FA} ${title} \u2014 ${map.nodes.length} files</span><span id="legend"><span class="dot good"></span>Healthy <span class="dot warn"></span>Needs work <span class="dot bad"></span>Problem</span><div id="layout-toggles"><button class="layout-btn active" data-layout="network">\u{1F578}\uFE0F Network</button><button class="layout-btn" data-layout="clustered">\u{1F3DD}\uFE0F Clustered</button><button class="layout-btn" data-layout="hierarchy">\u{1F5C2}\uFE0F Hierarchy</button></div><button id="refresh-btn">\u{1F504} Refresh</button></div><div id="root"><canvas id="canvas"></canvas><div id="side-panel" class="hidden"></div></div><div id="lens-preview" class="hidden"></div><div id="toast"></div><script>const GRAPH_DATA = ${data};${MAP_SCRIPT}<\/script></body></html>`;
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
      'chassisMap', title,
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
      console.log('[CHASSIS] Map built:', this._map.nodes.length, 'nodes,', this._map.edges.length, 'edges');
      console.log('[CHASSIS] Sample node:', this._map.nodes[0]);
      console.log('[CHASSIS] Sample edge:', this._map.edges[0]);
    } catch (e) {
      console.error('[CHASSIS] mapBuilderService failed:', e);
      this._map = { nodes: [], edges: [] };
    }
    this._panel.webview.html = this._buildHtml();
  }

  // [SCOPE] Reads build history, save points and orphan snapshots for the timeline view
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
          const f = path.join(this._root, '.chassis', 'timeline_state.json');
          if (fs.existsSync(f)) { return JSON.parse(fs.readFileSync(f, 'utf8')).branchFromId || null; }
        } catch { /* ignore */ }
        return null;
      })();
      return { history: [...history, ...orphans], savePoints, branchFromId };
    } catch {
      return { history: [], savePoints: [], branchFromId: null };
    }
  }

  // [SCOPE] Assembles the full webview HTML — injects graph data as a JSON blob before the script runs
  private _buildHtml(): string {
    const title = this._projectName + ' - Architecture Map';
    const data = JSON.stringify(this._map);
    const tlData = JSON.stringify(this._buildTimelineData());
    // [WARN] MAP_TIMELINE_SCRIPT must be served as an external file via <script src>.
    //        DO NOT inline it into the HTML template. VS Code webview's document.write() has a
    //        hard size limit (~45KB of HTML). Inlining MAP_TIMELINE_SCRIPT (~21KB) pushes the
    //        total over the limit and causes: SyntaxError: Unexpected string (index.html:1058).
    //        Pattern: write to out/ui/tlScript.js, serve via webview.asWebviewUri().
    const tlScriptPath = path.join(__dirname, 'tlScript.js');
    fs.writeFileSync(tlScriptPath, MAP_TIMELINE_SCRIPT, 'utf8');
    const tlScriptUri = this._panel.webview.asWebviewUri(vscode.Uri.file(tlScriptPath));
    console.log('[CHASSIS] Map data size:', data.length, 'bytes');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${MAP_STYLES}
  #tl-layer{display:none;flex:1;position:relative;overflow:hidden;background:#1e1e2e;}
  #tl-layer.active{display:flex;}
  #tl-canvas{flex:1;display:block;cursor:grab;min-width:0;background:#1e1e2e;}
  #tl-canvas:active{cursor:grabbing;}
  #tl-side{width:280px;min-width:280px;background:#181825;border-left:1px solid rgba(255,255,255,0.08);overflow-y:auto;flex-shrink:0;font-size:13px;color:#cdd6f4;}
  #tl-side.hidden{display:none!important;}
  #tl-controls{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:#181825;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:6px 14px;z-index:10;}
  #tl-controls button{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#cdd6f4;padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;}
  #tl-tooltip{position:absolute;pointer-events:none;display:none;background:#181825;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;z-index:20;max-width:240px;}
  #tl-empty{display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#6c7086;font-size:14px;text-align:center;pointer-events:none;}
  .tl-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;vertical-align:middle;}
  </style>
</head>
<body>
  <div id="header">
    <span id="map-title">&#x1F5FA; ${title} &#x2014; ${this._map.nodes.length} files, ${this._map.edges.length} connections</span>
    <div id="layout-toggles">
      <button class="layout-btn active" data-layout="network">&#x1F578;&#xFE0F; Network</button>
      <button class="layout-btn" data-layout="clustered">&#x1F3DD;&#xFE0F; Clustered</button>
      <button class="layout-btn" data-layout="hierarchy">&#x1F5C2;&#xFE0F; Hierarchy</button>
      <button class="layout-btn" data-layout="timeline">&#x23F1;&#xFE0F; Timeline</button>
    </div>
    <button id="refresh-btn">&#x1F504; Refresh</button>
    <button id="architect-btn" style="margin-left:8px;background:#4a9eff;border:none;color:#0f0f1a;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;">&#x1F3D7;&#xFE0F; Architect Review</button>
    <button id="back-btn" style="margin-left:8px;background:none;border:1px solid rgba(255,255,255,0.15);color:#cdd6f4;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">&#x2190; Chat</button>
  </div>
  <div id="root">
    <canvas id="canvas"></canvas>
    <div id="side-panel" class="hidden"></div>
  </div>
  <div id="tl-layer">
    <canvas id="tl-canvas"></canvas>
    <div id="tl-side" class="hidden"></div>
    <div id="tl-controls">
      <button id="tl-oldest-btn">&#x2190; Oldest</button>
      <span style="font-size:10px;color:#6c7086;">Zoom</span>
      <input id="tl-zoom" type="range" min="0.3" max="5" step="0.1" value="1">
      <button id="tl-fit-btn">Fit All</button>
      <button id="tl-newest-btn">Newest &#x2192;</button>
    </div>
    <div id="tl-tooltip"></div>
    <div id="tl-empty">No build history yet.<br><small>Start building to see your timeline here.</small></div>
  </div>
  <div id="map-legend">
    <div id="legend-tab">Legend</div>
    <div id="legend-panel">
      <div id="legend-inner">
        <div class="lg-section">Health</div>
        <div class="lg-row"><span class="lg-dot" style="background:#4ec959"></span>Healthy</div>
        <div class="lg-row"><span class="lg-dot" style="background:#f0a500"></span>Needs work</div>
        <div class="lg-row"><span class="lg-dot" style="background:#e05555"></span>Problem</div>
        <div class="lg-section">Node type</div>
        <div class="lg-row"><span class="lg-sym" style="color:#4a9eff">&#x25B2;</span>Entry</div>
        <div class="lg-row"><span class="lg-sym" style="color:#f5c400">&#x25C6;</span>Config</div>
        <div class="lg-row"><span class="lg-sym" style="color:#a855f7">&#x2B21;</span>UI</div>
        <div class="lg-row"><span class="lg-sym" style="color:#00c9a7">&#x25AD;</span>Service</div>
        <div class="lg-row"><span class="lg-sym" style="color:#6b7280">&#x25CF;</span>Utility</div>
      </div>
    </div>
  </div>
  <div id="lens-preview" class="hidden"></div>
  <div id="toast"></div>
  <script>
    const GRAPH_DATA = ${data};
    window.TIMELINE_DATA = ${tlData};
    ${MAP_SCRIPT}
    // [WARN] Do NOT use orig.call(btn,e) - e.currentTarget is null on re-dispatch.
    (function() {
      var root = document.getElementById('root');
      var tlLayer = document.getElementById('tl-layer');
      var legendInner = document.getElementById('legend-inner');
      var MAP_LEGEND_HTML = legendInner ? legendInner.innerHTML : '';
      var TL_LEGEND_HTML = '<div class="lg-section">Build type</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#4a9eff"></span>AI build</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#a855f7"></span>Supervisor</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#4ec959"></span>Vault</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#f5c400"></span>Save point</div>' +
        '<div class="lg-row"><span class="lg-dot" style="border:2px solid #e05555;background:transparent"></span>Undone</div>';
      document.querySelectorAll('.layout-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var layout = btn.dataset.layout;
          document.querySelectorAll('.layout-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          if (layout === 'timeline') {
            if (root)    root.style.display = 'none';
            if (tlLayer) tlLayer.classList.add('active');
            if (legendInner) legendInner.innerHTML = TL_LEGEND_HTML;
          } else {
            if (root)    root.style.display = '';
            if (tlLayer) tlLayer.classList.remove('active');
            if (legendInner) legendInner.innerHTML = MAP_LEGEND_HTML;
            if (window.setLayoutMode) window.setLayoutMode(layout);
          }
        });
      });
      // Legend toggle
      var legendTab = document.getElementById('legend-tab');
      var legendPanel = document.getElementById('legend-panel');
      if (legendTab && legendPanel) {
        legendTab.addEventListener('click', function() {
          legendPanel.classList.toggle('open');
        });
      }
    })();
  </script>
  <script src="${tlScriptUri}"></script>
</body>
</html>`;
  }

  // [SCOPE] Routes messages from the webview to VS Code commands
  private async _handleMessage(msg: any): Promise<void> {
    if (msg.type === 'openFileAtSymbol' && msg.nodeId) {
      try {
        const uri = vscode.Uri.file(path.join(this._root, msg.nodeId));
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
        // Try to find and jump to the best-matching symbol using the node label
        if (msg.label) {
          const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider', uri
          );
          if (symbols && symbols.length > 0) {
            const labelWords = msg.label.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
            // Flatten nested symbols
            const flat: vscode.DocumentSymbol[] = [];
            const flatten = (syms: vscode.DocumentSymbol[]) => { syms.forEach(s => { flat.push(s); if (s.children) flatten(s.children); }); };
            flatten(symbols);
            // Score each symbol by how many label words appear in its name
            const scored = flat.map(s => {
              const name = s.name.toLowerCase();
              const score = labelWords.filter((w: string) => name.includes(w)).length;
              return { s, score };
            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
            if (scored.length > 0) {
              const target = scored[0].s.selectionRange.start;
              editor.revealRange(scored[0].s.range, vscode.TextEditorRevealType.InCenter);
              editor.selection = new vscode.Selection(target, target);
            }
          }
        }
      } catch { vscode.window.showErrorMessage(`CHASSIS Map: Could not open ${msg.nodeId}`); }

    } else if (msg.type === 'openFile' && msg.nodeId) {
      try {
        const uri = vscode.Uri.file(path.join(this._root, msg.nodeId));
        await vscode.window.showTextDocument(uri, { preserveFocus: false });
      } catch { vscode.window.showErrorMessage(`CHASSIS Map: Could not open ${msg.nodeId}`); }

    } else if (msg.type === 'mapChat' && msg.nodeId) {
      const node = this._map.nodes.find(n => n.id === msg.nodeId);
      await vscode.commands.executeCommand('chassis.mapContextChat', {
        nodeId: msg.nodeId,
        label: node?.label || msg.label || '',
        lines: node?.lines ?? msg.lines ?? 0,
        health: node?.health ?? msg.health ?? 'neutral',
        todos: node?.todos ?? msg.todos ?? 0,
      });

    } else if (msg.type === 'explainFile' && msg.nodeId) {
      const node = this._map.nodes.find(n => n.id === msg.nodeId);
      const filePath = path.join(this._root, msg.nodeId);
      let codeSnippet = '';
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw.split('\n');
        // First 80 lines is enough context for an explanation
        codeSnippet = lines.slice(0, 80).join('\n');
      } catch { /* file may not be readable */ }
      const prompt = codeSnippet
        ? `You are explaining code to a non-technical user. Read this file and explain it clearly.\n\nFile: ${msg.nodeId}\n\n\`\`\`\n${codeSnippet}\n\`\`\`\n\nAnswer these questions in plain English:\n1. What does this file do?\n2. Why does it exist — what problem does it solve?\n3. How does it fit into the project?\n4. What should a developer know before touching it?\n\nKeep the total response under 200 words. No jargon.`
        : `Explain \`${msg.nodeId}\` (${msg.lines || node?.lines || '?'} lines, ${msg.health || node?.health || 'unknown'} health). What does it do, why does it exist, how does it fit into the project? Under 150 words.`;
      await vscode.commands.executeCommand('chassis.mapContextChat', {
        nodeId: msg.nodeId,
        label: msg.label || node?.label || '',
        lines: msg.lines || node?.lines || 0,
        health: msg.health || node?.health || 'neutral',
        todos: msg.todos || node?.todos || 0,
        _explainPrompt: prompt,
      });

    } else if (msg.type === 'analyzeFile' && msg.nodeId) {
      const node = this._map.nodes.find(n => n.id === msg.nodeId);
      const filePath = path.join(this._root, msg.nodeId);
      let code = '';
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        code = raw.split('\n').slice(0, 120).join('\n');
      } catch { /* ignore */ }
      const modePrompts: Record<string, string> = {
        trace: code
          ? `You are a code analyst. Read this file and trace the complete logic flow in plain English.\n\nFile: ${msg.nodeId}\n\`\`\`\n${code}\n\`\`\`\n\nFor every function or logical section:\n- What triggers it?\n- What does it do step by step?\n- What does it return or produce?\n\nNumber each step. Plain English only — no jargon. If there are branching paths, explain each branch.`
          : `Trace the complete logic flow for \`${msg.nodeId}\`. Follow every function call and explain each step in plain English as a numbered list.`,
        test: code
          ? `You are a test engineer. Read this file and write a complete test plan in plain English.\n\nFile: ${msg.nodeId}\n\`\`\`\n${code}\n\`\`\`\n\nList:\n1. Every function/feature that needs a test\n2. The normal cases to test\n3. The edge cases and error conditions\n4. What a passing test looks like for each\n\nDo NOT write code — just describe what to test and why.`
          : `Describe a complete test plan for \`${msg.nodeId}\`. List every function to test, normal cases, edge cases, and error conditions in plain English.`,
        improve: code
          ? `You are a code reviewer. Read this file and identify improvements.\n\nFile: ${msg.nodeId}\n\`\`\`\n${code}\n\`\`\`\n\nIdentify:\n1. The biggest structural problem\n2. Any missing error handling\n3. Performance concerns\n4. A simpler way to achieve the same result\n\nBe specific and direct. Reference actual line numbers or function names.`
          : `Critically review \`${msg.nodeId}\` and suggest concrete improvements. Look for simpler architecture, missing error handling, performance issues. Be specific.`,
      };
      const prompt = modePrompts[msg.mode] || modePrompts['trace'];
      const displayLabels: Record<string, string> = { trace: 'Trace logic of', test: 'Test plan for', improve: 'Improve' };
      await vscode.commands.executeCommand('chassis.mapContextChat', {
        nodeId: msg.nodeId,
        label: msg.label || node?.label || '',
        lines: msg.lines || node?.lines || 0,
        health: msg.health || node?.health || 'neutral',
        todos: msg.todos || node?.todos || 0,
        _explainPrompt: prompt,
        _displayLabel: displayLabels[msg.mode] || 'Analyze',
      });

    } else if (msg.type === 'chatAbout' && msg.nodeId) {
      const node = this._map.nodes.find(n => n.id === msg.nodeId);
      const ctx = msg.prompt
        ? msg.prompt
        : node
          ? `Tell me about \`${msg.nodeId}\`. It's described as: "${node.label}". Stats: ${node.lines} lines, ${node.todos} TODOs, ${node.warns} WARNs.`
          : `Tell me about \`${msg.nodeId}\`.`;
      await vscode.commands.executeCommand('chassis.postToChat', ctx);

    } else if (msg.type === 'runCommand' && msg.nodeId && msg.command) {
      try {
        const uri = vscode.Uri.file(path.join(this._root, msg.nodeId));
        await vscode.window.showTextDocument(uri, { preserveFocus: false });
        await vscode.commands.executeCommand(msg.command);
      } catch { vscode.window.showErrorMessage(`CHASSIS Map: Could not open ${msg.nodeId}`); }

    } else if (msg.type === 'fixFile' && msg.nodeId) {
      const node = this._map.nodes.find(n => n.id === msg.nodeId);
      const issueType = msg.issueType || (node && node.lines > 200 ? 'largeFile' : node && node.todos > 0 ? 'todo' : 'uncommented');
      const task = issueType === 'largeFile'
        ? `Split ${msg.nodeId} (${node?.lines} lines) into smaller files under 200 lines each.`
        : issueType === 'todo'
        ? `Review and implement the TODO markers in ${msg.nodeId}.`
        : issueType === 'refactor'
        ? `Refactor ${msg.nodeId} for clarity, simplicity, and best practices. Reduce complexity, improve naming, and remove dead code.`
        : `Add a [SCOPE] comment at the top of ${msg.nodeId} explaining what this file does.`;
      await vscode.commands.executeCommand('chassis.runEditFix', task, msg.nodeId, issueType);

    } else if (msg.type === 'architectReview' && msg.prompt) {
      // [WARN] Must NOT use chassis.postToChat here — that routes through fix-request → build pipeline → vault modal.
      //        Use chassis.mapContextChat which routes through map-context → direct AI call, no build pipeline.
      await vscode.commands.executeCommand('chassis.mapContextChat', {
        nodeId: '',
        label: '',
        lines: 0,
        health: 'neutral',
        todos: 0,
        _explainPrompt: msg.prompt,
        _displayLabel: 'Architect Review',
      });

    } else if (msg.type === 'back-to-chat') {
      this._panel.dispose();
      await vscode.commands.executeCommand('chassis.openChat');

    } else if (msg.type === 'refresh') {
      this.refresh(this._root);
    } else if (msg.type === 'getELI5' && msg.nodeId) {
      const node = this._map.nodes.find(n => n.id === msg.nodeId);
      if (node) {
        const technical = `File health is ${node.health}. Issues: ${node.todos} TODOs, ${node.warns} WARNs. Lines: ${node.lines}. matchesBlueprint: ${node.matchesBlueprint}`;
        const eli5 = this._guardian.translateToELI5(technical, 'map-hover');
        this._panel.webview.postMessage({ type: 'eli5-response', nodeId: msg.nodeId, text: eli5.plainEnglish });
      }

    // ── Timeline messages ──────────────────────────────────────────────────
    } else if (msg.type === 'tl-undo-build' && msg.snapshotId) {
      try {
        const snap = new SnapshotService(this._root);
        const { restored, deleted, error } = snap.restore(msg.snapshotId);
        if (error) {
          this._panel.webview.postMessage({ type: 'tl-undo-result', snapshotId: msg.snapshotId, success: false, error });
        } else {
          const hist = new BuildHistoryService(this._root);
          hist.markUndone(msg.snapshotId);
          this._panel.webview.postMessage({ type: 'tl-undo-result', snapshotId: msg.snapshotId, success: true, restored, deleted });
          vscode.window.showInformationMessage(`↩ Undone. Restored ${restored} file(s), deleted ${deleted} new file(s).`);
        }
      } catch (err) {
        this._panel.webview.postMessage({ type: 'tl-undo-result', snapshotId: msg.snapshotId, success: false, error: String(err) });
      }

    } else if (msg.type === 'tl-promote-save-point' && msg.snapshotId) {
      try {
        const hist = new BuildHistoryService(this._root);
        const entry = hist.list().find(e => e.id === msg.snapshotId);
        const desc = entry ? entry.task.slice(0, 72) : `Build ${msg.snapshotId}`;
        const spSvc = new SavePointService(this._root);
        const result = await spSvc.create(desc);
        if (result.success) {
          vscode.window.showInformationMessage(`📍 Save point created: ${desc.slice(0, 40)}`);
          this._panel.webview.postMessage({ type: 'tl-promote-result', snapshotId: msg.snapshotId, success: true });
        } else {
          vscode.window.showErrorMessage(result.message);
          this._panel.webview.postMessage({ type: 'tl-promote-result', snapshotId: msg.snapshotId, success: false });
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create save point: ${String(err)}`);
      }

    } else if (msg.type === 'tl-branch-from' && msg.snapshotId) {
      try {
        const stateFile = path.join(this._root, '.chassis', 'timeline_state.json');
        const dir = path.dirname(stateFile);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(stateFile, JSON.stringify({ branchFromId: msg.snapshotId }), 'utf8');
        this._panel.webview.postMessage({ type: 'tl-branch-result', snapshotId: msg.snapshotId });
        vscode.window.showInformationMessage(`🌿 Branching from build ${new Date(parseInt(msg.snapshotId, 10)).toLocaleString()}. Your next build creates a new timeline branch.`);
      } catch { /* ignore */ }
    }
  }
}
