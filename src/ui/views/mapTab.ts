// [SCOPE] Architecture Map tab renderer for the CHASSIS dashboard
// Logic moved from mapPanel.ts to support dashboard integration while keeping file sizes small.

import { ProjectMap } from '../../services/mapBuilderService.js';
import { MAP_SCRIPT } from '../mapScript.js';
import { MAP_STYLES } from '../mapStyles.js';

export function renderMapTab(map: ProjectMap, projectName: string, active: boolean): string {
  if (!active) return '<div id="tab-map" class="tab-content"></div>';
  
  const title = projectName + ' — Architecture Map';
  const data = JSON.stringify(map);

  return `
    <div id="tab-map" class="tab-content ${active ? 'active' : ''}">
      <style>${MAP_STYLES}</style>
      <div id="map-header" style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:10px;">
        <span style="font-size:12px; font-weight:600; color:#cba6f7;">🗺 ${map.nodes.length} files, ${map.edges.length} connections</span>
        <div id="layout-toggles">
          <button class="layout-btn active" data-layout="network">🕸️ Network</button>
          <button class="layout-btn" data-layout="clustered">🏝️ Clustered</button>
          <button class="layout-btn" data-layout="hierarchy">🗂️ Hierarchy</button>
        </div>
      </div>
      <div id="root" style="height: 600px; position: relative; border-radius: 12px; overflow: hidden; background: #181825;">
        <canvas id="canvas" style="width:100%; height:100%;"></canvas>
        <div id="side-panel" class="hidden"></div>
        <div id="lens-preview" class="hidden"></div>
      </div>
      <script>
        (function() {
          const GRAPH_DATA = ${data};
          // Ensure vscode is available to the injected script
          if (typeof vscode === 'undefined') {
             try { window.vscode = acquireVsCodeApi(); } catch(e) { }
          }
          ${MAP_SCRIPT}
        })();
      </script>
    </div>
  `;
}
