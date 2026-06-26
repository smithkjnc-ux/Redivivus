// [SCOPE] Architecture Map panel — HTML assembly for the webview
// Extracted from mapPanel.ts _buildHtml(). Called by MapPanel._buildHtml().

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ProjectMap } from '../logic/mapBuilderService.js';
import { MAP_SCRIPT } from './mapScript.js';
import { MAP_STYLES } from './mapStyles.js';
import { MAP_TIMELINE_SCRIPT } from './mapTimelineScript.js';

export function buildMapHtml(
  projectName: string,
  map: ProjectMap,
  webview: vscode.Webview,
  timelineData: object,
): string {
  const title = projectName + ' - Architecture Map';
  const data = JSON.stringify(map);
  const tlData = JSON.stringify(timelineData);
  // [WARN] MAP_TIMELINE_SCRIPT must be served as an external file via <script src>.
  //        DO NOT inline — VS Code webview has a ~45KB document.write() size limit.
  const tlScriptPath = path.join(__dirname, 'tlScript.js');
  fs.writeFileSync(tlScriptPath, MAP_TIMELINE_SCRIPT, 'utf8');
  const tlScriptUri = webview.asWebviewUri(vscode.Uri.file(tlScriptPath));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${MAP_STYLES}
  #tl-layer{display:none;flex:1;flex-direction:column;overflow:hidden;background:#1e1e2e;}
  #tl-layer.active{display:flex;}
  #tl-feed{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;}
  #tl-empty{display:none;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#6c7086;font-size:13px;text-align:center;}
  #tl-empty small{font-size:11px;color:#45475a;}
  .tl-card{background:#181825;border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px 14px;transition:border-color 0.15s;}
  .tl-card:hover{border-color:rgba(255,255,255,0.15);}
  .tl-card-undone{opacity:0.4;}
  .tl-card-head{display:flex;align-items:center;gap:7px;margin-bottom:5px;}
  .tl-badge{font-size:9px;font-weight:700;letter-spacing:0.6px;padding:2px 6px;border-radius:3px;text-transform:uppercase;}
  .tl-ts{font-size:10px;color:#6c7086;margin-left:auto;}
  .tl-task{font-size:12px;color:#cdd6f4;line-height:1.4;margin-bottom:5px;}
  .tl-files{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:3px;}
  .tl-file{font-size:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.07);border-radius:3px;padding:1px 5px;color:#a6adc8;font-family:monospace;}
  .tl-more{font-size:10px;color:#45475a;padding:1px 4px;}
  .tl-meta{font-size:10px;color:#45475a;margin-top:2px;}
  </style>
</head>
<body>
  <div id="header">
    <span id="map-title">&#x1F5FA; ${title} &#x2014; ${map.nodes.length} files, ${map.edges.length} connections</span>
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
  <div id="root"><canvas id="canvas"></canvas><div id="side-panel" class="hidden"></div></div>
  <div id="tl-layer">
    <div id="tl-feed"></div>
    <div id="tl-empty"><span>No history yet</span><small>Build, fix, or save a project to see events here.</small></div>
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
    (function() {
      var root = document.getElementById('root');
      var tlLayer = document.getElementById('tl-layer');
      var legendInner = document.getElementById('legend-inner');
      var MAP_LEGEND_HTML = legendInner ? legendInner.innerHTML : '';
      var TL_LEGEND_HTML = '<div class="lg-section">Event type</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#4a9eff"></span>Build</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#fb923c"></span>Fix</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#4ec959"></span>Vault Build</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#f5c400"></span>Save Point</div>' +
        '<div class="lg-row"><span class="lg-dot" style="background:#6c7086"></span>Undone</div>';
      document.querySelectorAll('.layout-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var layout = btn.dataset.layout;
          document.querySelectorAll('.layout-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          if (layout === 'timeline') {
            if (root) root.style.display = 'none';
            if (tlLayer) tlLayer.classList.add('active');
            if (legendInner) legendInner.innerHTML = TL_LEGEND_HTML;
          } else {
            if (root) root.style.display = '';
            if (tlLayer) tlLayer.classList.remove('active');
            if (legendInner) legendInner.innerHTML = MAP_LEGEND_HTML;
            if (window.setLayoutMode) window.setLayoutMode(layout);
          }
        });
      });
      var legendTab = document.getElementById('legend-tab');
      var legendPanel = document.getElementById('legend-panel');
      if (legendTab && legendPanel) { legendTab.addEventListener('click', function() { legendPanel.classList.toggle('open'); }); }
    })();
  </script>
  <script src="${tlScriptUri}"></script>
</body>
</html>`;
}
