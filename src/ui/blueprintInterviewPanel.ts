// [SCOPE] Blueprint Interview Panel — renders the adaptive interview UI in the chat webview
// Handles message routing between the webview interview form and the extension host.
// [WARN] Keep under 200 lines — split if interview logic grows.

import * as vscode from 'vscode';
import {
  detectProjectType, getLayersForType, scoreBlueprint,
  buildBlueprintSummary, BlueprintSpec, ProjectType
} from '../services/blueprintInterview.js';

export function buildInterviewHtml(nonce: string): string {
  return `
<div id="blueprint-interview" style="
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,0.7);display:flex;align-items:center;
  justify-content:center;z-index:9999;font-family:inherit;">
  <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);
    border-radius:12px;width:90%;max-width:520px;max-height:85vh;display:flex;
    flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
    <div style="padding:18px 20px 12px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;">
      <div style="font-size:15px;font-weight:700;color:var(--vscode-foreground);">🏗️ Blueprint Interview</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px;" id="bi-subtitle">
        Let's build a real blueprint before writing a single line of code.
      </div>
      <div style="margin-top:10px;height:4px;background:var(--vscode-editorGroup-border);border-radius:2px;">
        <div id="bi-progress" style="height:100%;background:#4a9eff;border-radius:2px;width:0%;transition:width 0.3s;"></div>
      </div>
      <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:4px;" id="bi-progress-label">Layer 0 of 0</div>
    </div>
    <div id="bi-body" style="flex:1;overflow-y:auto;padding:20px;"></div>
    <div id="bi-footer" style="padding:12px 20px;border-top:1px solid var(--vscode-editorGroup-border);
      display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
      <button id="bi-skip" style="background:none;border:1px solid var(--vscode-input-border);
        color:var(--vscode-descriptionForeground);padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;">
        Skip this layer
      </button>
      <button id="bi-next" style="background:#4a9eff;border:none;color:#0f0f1a;
        padding:7px 18px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">
        Next →
      </button>
    </div>
  </div>
</div>`;
}

export function buildInterviewScript(): string {
  return `
(function() {
  const vscode = acquireVsCodeApi();
  let spec = { projectType: 'unknown', layers: {}, completionScore: 0 };
  let allLayers = [];
  let currentLayerIdx = 0;

  function postMsg(type, data) { vscode.postMessage({ type, ...data }); }

  function renderLayer(layer) {
    const body = document.getElementById('bi-body');
    const progress = document.getElementById('bi-progress');
    const label = document.getElementById('bi-progress-label');
    const subtitle = document.getElementById('bi-subtitle');
    if (!body) return;

    const pct = allLayers.length ? Math.round((currentLayerIdx / allLayers.length) * 100) : 0;
    if (progress) progress.style.width = pct + '%';
    if (label) label.textContent = 'Layer ' + (currentLayerIdx + 1) + ' of ' + allLayers.length + ' — ' + layer.emoji + ' ' + layer.name;
    if (subtitle) subtitle.textContent = layer.emoji + ' ' + layer.name + ' layer';

    let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
    (layer.questions || []).forEach(q => {
      html += '<div>';
      html += '<div style="font-size:13px;font-weight:600;color:var(--vscode-foreground);margin-bottom:3px;">';
      html += (q.required ? '' : '<span style="font-size:10px;color:var(--vscode-descriptionForeground);margin-right:6px;">(optional)</span>');
      html += q.text + '</div>';
      html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:6px;">' + q.hint + '</div>';
      if (q.type === 'choice' && q.choices) {
        html += '<div style="display:flex;flex-direction:column;gap:4px;" id="q-' + q.id + '">';
        q.choices.forEach((c, i) => {
          html += '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;' +
            'border:1px solid var(--vscode-input-border);cursor:pointer;font-size:12px;" ' +
            'onmouseover="this.style.borderColor=\'#4a9eff\'" onmouseout="this.style.borderColor=\'\'"><input type="radio" ' +
            'name="q-' + q.id + '" value="' + c.replace(/"/g,'&quot;') + '" style="accent-color:#4a9eff;"> ' + c + '</label>';
        });
        html += '</div>';
      } else {
        html += '<textarea id="q-' + q.id + '" rows="5" style="display:block;width:100%;box-sizing:border-box;' +
          'background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);' +
          'color:var(--vscode-foreground);border-radius:8px;padding:10px 12px;font-size:14px;line-height:1.6;resize:vertical;' +
          'font-family:inherit;min-height:120px;" placeholder="' + q.hint + '"></textarea>';
      }
      html += '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
    body.scrollTop = 0;
  }

  function collectAnswers(layer) {
    if (!spec.layers[layer.id]) spec.layers[layer.id] = {};
    (layer.questions || []).forEach(q => {
      if (q.type === 'choice') {
        const sel = document.querySelector('input[name="q-' + q.id + '"]:checked');
        if (sel) spec.layers[layer.id][q.id] = sel.value;
      } else {
        const el = document.getElementById('q-' + q.id);
        if (el && el.value.trim()) spec.layers[layer.id][q.id] = el.value.trim();
      }
    });
    // Detect project type from foundation answers
    if (layer.id === 'foundation') {
      const what = spec.layers.foundation?.what || '';
      const where = spec.layers.foundation?.where || '';
      postMsg('bi-detect-type', { what, where });
    }
  }

  window.addEventListener('message', e => {
    if (e.data.type === 'bi-layers') {
      allLayers = e.data.layers;
      spec.projectType = e.data.projectType;
      currentLayerIdx = 0;
      if (allLayers.length > 0) renderLayer(allLayers[0]);
    }
    if (e.data.type === 'bi-done') {
      const body = document.getElementById('bi-body');
      if (body) body.innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="font-size:48px;margin-bottom:16px;">✅</div><div style="font-size:20px;font-weight:700;margin-bottom:8px;">Blueprint Complete!</div><div style="font-size:14px;color:var(--vscode-descriptionForeground);">Your blueprint has been saved. Switch back to CHASSIS Chat to start building.</div></div>';
      const footer = document.getElementById('bi-footer');
      if (footer) footer.style.display = 'none';
    }
  });

  document.getElementById('bi-next').onclick = () => {
    collectAnswers(allLayers[currentLayerIdx]);
    currentLayerIdx++;
    if (currentLayerIdx < allLayers.length) {
      renderLayer(allLayers[currentLayerIdx]);
    } else {
      // All layers done — submit
      const progress = document.getElementById('bi-progress');
      if (progress) progress.style.width = '100%';
      postMsg('bi-submit', { spec });
    }
  };

  document.getElementById('bi-skip').onclick = () => {
    currentLayerIdx++;
    if (currentLayerIdx < allLayers.length) {
      renderLayer(allLayers[currentLayerIdx]);
    } else {
      postMsg('bi-submit', { spec });
    }
  };

  // Delay bi-start so extension onDidReceiveMessage is registered before message fires
  setTimeout(() => postMsg('bi-start', {}), 100);
})();`;
}

let _blueprintPanel: vscode.WebviewPanel | undefined;

/** Opens the Blueprint Interview as a standalone full-width panel in the main editor column */
export function openBlueprintPanel(
  context: vscode.ExtensionContext,
  chassis: any,
  routingService: any
): void {
  // Singleton — reveal existing panel if open
  if (_blueprintPanel) {
    _blueprintPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'chassisBlueprint',
    '🏗️ Blueprint Interview',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  _blueprintPanel = panel;
  panel.onDidDispose(() => { _blueprintPanel = undefined; }, null, context.subscriptions);

  panel.webview.onDidReceiveMessage(
    async (msg) => {
      if (msg.type === 'bi-redo') {
        // User clicked Redo Interview — replace HTML with fresh form
        const layers = getLayersForType('unknown');
        const lj = JSON.stringify(layers);
        const n2 = Math.random().toString(36).slice(2);
        panel.webview.html = buildInterviewHtmlFull(lj, n2);
        return;
      }
      await handleInterviewMessage(msg, panel.webview, chassis, routingService);
    },
    undefined,
    context.subscriptions
  );

  // Check if blueprint.md already exists — show it instead of blank form
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const existingBlueprint = root ? (() => {
    try { return require('fs').readFileSync(require('path').join(root, '.chassis', 'blueprint.md'), 'utf8'); } catch { return null; }
  })() : null;

  const nonce = Math.random().toString(36).slice(2);

  if (existingBlueprint) {
    panel.webview.html = buildBlueprintViewHtml(existingBlueprint, nonce);
    return;
  }

  // Embed layers as JSON directly — no bi-start/bi-layers roundtrip needed
  const initialLayers = getLayersForType('unknown');
  const layersJson = JSON.stringify(initialLayers);
  panel.webview.html = buildInterviewHtmlFull(layersJson, nonce);
}

function buildInterviewHtmlFull(layersJson: string, nonce: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blueprint Interview</title>
<style>
  body { margin:0; padding:0; background:var(--vscode-editor-background); color:var(--vscode-foreground); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
  #bi-header { padding:16px 32px 12px; border-bottom:1px solid var(--vscode-editorGroup-border); flex-shrink:0; }
  #bi-scroll { flex:1; overflow-y:auto; padding:24px 32px; }
  #bi-footer { padding:14px 32px; border-top:1px solid var(--vscode-editorGroup-border); display:flex; gap:12px; justify-content:flex-end; flex-shrink:0; }
  textarea { display:block; width:100%; box-sizing:border-box; background:var(--vscode-input-background); border:1px solid var(--vscode-input-border); color:var(--vscode-foreground); border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.6; resize:vertical; font-family:inherit; min-height:120px; }
  .choice-label { display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:8px; border:1px solid var(--vscode-input-border); cursor:pointer; font-size:14px; margin-bottom:6px; }
  .choice-label:hover { border-color:#a855f7; }
  input[type=radio] { accent-color:#a855f7; width:18px; height:18px; flex-shrink:0; }
  #bi-skip { background:none; border:1px solid var(--vscode-input-border); color:var(--vscode-descriptionForeground); padding:10px 20px; border-radius:6px; cursor:pointer; font-size:14px; }
  #bi-next { background:#a855f7; border:none; color:#fff; padding:10px 28px; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700; }
  #bi-progress-bar { height:6px; background:var(--vscode-editorGroup-border); border-radius:3px; overflow:hidden; margin-top:10px; }
  #bi-progress { height:100%; background:#a855f7; border-radius:3px; width:5%; transition:width 0.4s; }
</style>
</head><body>
<div id="bi-header">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="font-size:24px;">🏗️</span>
    <div>
      <div style="font-size:18px;font-weight:700;">Blueprint Interview</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);" id="bi-subtitle">Building your project blueprint.</div>
    </div>
  </div>
  <div id="bi-progress-bar"><div id="bi-progress"></div></div>
  <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;" id="bi-progress-label">Layer 1...</div>
</div>
<div id="bi-scroll"><div id="bi-body"></div></div>
<div id="bi-footer">
  <button id="bi-skip">Skip layer</button>
  <button id="bi-next">Next &rarr;</button>
</div>
<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();
  let allLayers = ${layersJson};
  let currentLayerIdx = 0;
  let spec = { projectType: 'unknown', layers: {} };

  function postMsg(type, data) { vscode.postMessage({ type, ...data }); }

  function renderLayer(layer) {
    const body = document.getElementById('bi-body');
    const progress = document.getElementById('bi-progress');
    const label = document.getElementById('bi-progress-label');
    const subtitle = document.getElementById('bi-subtitle');
    if (!body) return;
    const pct = allLayers.length ? Math.round((currentLayerIdx / allLayers.length) * 100) : 0;
    if (progress) progress.style.width = pct + '%';
    if (label) label.textContent = 'Layer ' + (currentLayerIdx + 1) + ' of ' + allLayers.length + ' \u2014 ' + (layer.emoji||'') + ' ' + layer.name;
    if (subtitle) subtitle.textContent = (layer.emoji||'') + ' ' + layer.name;
    let html = '<div style="display:flex;flex-direction:column;gap:20px;">';
    (layer.questions || []).forEach(q => {
      html += '<div style="border-bottom:1px solid var(--vscode-editorGroup-border);padding-bottom:20px;">';
      html += '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">' + (q.required ? '' : '<span style="font-size:11px;color:var(--vscode-descriptionForeground);margin-right:6px;">(optional)</span>') + q.text + '</div>';
      html += '<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:10px;line-height:1.5;">' + q.hint + '</div>';
      if (q.type === 'choice' && q.choices) {
        html += '<div style="display:flex;flex-direction:column;gap:6px;" id="q-' + q.id + '">';
        q.choices.forEach(c => {
          const safe = c.replace(/"/g, '&quot;');
          html += '<label class="choice-label"><input type="radio" name="q-' + q.id + '" value="' + safe + '"> ' + c + '</label>';
        });
        html += '</div>';
      } else {
        html += '<textarea id="q-' + q.id + '" rows="5" placeholder="' + q.hint.replace(/"/g,'&quot;') + '"></textarea>';
      }
      html += '</div>';
    });
    body.innerHTML = html + '</div>';
    body.scrollTop = 0;
  }

  function collectAnswers(layer) {
    if (!spec.layers[layer.id]) spec.layers[layer.id] = {};
    (layer.questions || []).forEach(q => {
      if (q.type === 'choice') {
        const sel = document.querySelector('input[name="q-' + q.id + '"]:checked');
        if (sel) spec.layers[layer.id][q.id] = sel.value;
      } else {
        const el = document.getElementById('q-' + q.id);
        if (el && el.value.trim()) spec.layers[layer.id][q.id] = el.value.trim();
      }
    });
    if (layer.id === 'foundation') {
      const what = spec.layers.foundation && spec.layers.foundation.what || '';
      const where = spec.layers.foundation && spec.layers.foundation.where || '';
      postMsg('bi-detect-type', { what, where });
    }
  }

  // Update layers when extension sends refined set after type detection
  window.addEventListener('message', e => {
    if (e.data.type === 'bi-layers') {
      allLayers = e.data.layers;
      spec.projectType = e.data.projectType;
      if (allLayers.length > currentLayerIdx) renderLayer(allLayers[currentLayerIdx]);
    }
    if (e.data.type === 'bi-done') {
      const body = document.getElementById('bi-body');
      if (body) body.innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="font-size:48px;margin-bottom:16px;">&#x2705;</div><div style="font-size:20px;font-weight:700;margin-bottom:8px;">Blueprint Complete!</div><div style="font-size:14px;color:var(--vscode-descriptionForeground);">Your blueprint has been saved. Switch back to CHASSIS Chat to start building.</div></div>';
      const footer = document.getElementById('bi-footer');
      if (footer) footer.style.display = 'none';
    }
  });

  document.getElementById('bi-next').onclick = () => {
    collectAnswers(allLayers[currentLayerIdx]);
    currentLayerIdx++;
    if (currentLayerIdx < allLayers.length) {
      renderLayer(allLayers[currentLayerIdx]);
    } else {
      const progress = document.getElementById('bi-progress');
      if (progress) progress.style.width = '100%';
      postMsg('bi-submit', { spec });
    }
  };

  document.getElementById('bi-skip').onclick = () => {
    currentLayerIdx++;
    if (currentLayerIdx < allLayers.length) {
      renderLayer(allLayers[currentLayerIdx]);
    } else {
      postMsg('bi-submit', { spec });
    }
  };

  // Render first layer immediately — no roundtrip needed
  if (allLayers.length > 0) renderLayer(allLayers[0]);
})();
<\/script>
</body></html>`;
}

function buildBlueprintViewHtml(content: string, nonce: string): string {
  const safe = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blueprint</title>
<style>
  body { margin:0; padding:0; background:var(--vscode-editor-background); color:var(--vscode-foreground); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
  #bp-header { padding:16px 32px 12px; border-bottom:1px solid var(--vscode-editorGroup-border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
  #bp-scroll { flex:1; overflow-y:auto; padding:24px 32px; }
  pre { white-space:pre-wrap; word-break:break-word; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; line-height:1.7; margin:0; }
  #redo-btn { background:#a855f7; border:none; color:#fff; padding:10px 24px; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700; }
</style>
</head><body>
<div id="bp-header">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="font-size:24px;">🏗️</span>
    <div>
      <div style="font-size:18px;font-weight:700;">Your Blueprint</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);">Saved to .chassis/blueprint.md</div>
    </div>
  </div>
  <button id="redo-btn">Redo Interview &rarr;</button>
</div>
<div id="bp-scroll"><pre>${safe}</pre></div>
<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();
  document.getElementById('redo-btn').onclick = () => vscode.postMessage({ type: 'bi-redo' });
})();
<\/script>
</body></html>`;
}

// --- Extension-side message handler ---

export async function handleInterviewMessage(
  msg: any,
  webview: vscode.Webview,
  chassis: any,
  routingService: any
): Promise<boolean> {
  if (msg.type === 'bi-start') {
    // Send foundation layer first — type detection happens after
    const layers = getLayersForType('unknown');
    webview.postMessage({ type: 'bi-layers', layers, projectType: 'unknown' });
    return true;
  }

  if (msg.type === 'bi-detect-type') {
    const type: ProjectType = detectProjectType(msg.what || '', msg.where || '');
    const layers = getLayersForType(type);
    // Preserve foundation answers already collected
    webview.postMessage({ type: 'bi-layers', layers, projectType: type });
    return true;
  }

  if (msg.type === 'bi-submit') {
    const spec: BlueprintSpec = msg.spec;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const projectName = vscode.workspace.workspaceFolders?.[0]?.name || 'Project';

    spec.completionScore = scoreBlueprint(spec);
    spec.summary = buildBlueprintSummary(spec, projectName);

    // Always write blueprint.md if we have a workspace root
    if (root) {
      const fs = require('fs');
      const path = require('path');
      const chassisDir = path.join(root, '.chassis');
      fs.mkdirSync(chassisDir, { recursive: true });
      fs.writeFileSync(path.join(chassisDir, 'blueprint.md'), spec.summary, 'utf8');
      // Also save to config if available
      try {
        const config = chassis.loadConfig?.() || {};
        config.blueprintSpec = spec;
        chassis.saveConfig?.(config);
      } catch (_) {}
    }

    webview.postMessage({ type: 'bi-done' });

    // Post a summary to chat
    const summaryMsg = `✅ **Blueprint complete** — ${spec.completionScore}% coverage.\n\n` +
      `**Project type detected:** ${spec.projectType}\n\n` +
      spec.summary +
      `\n\nI'll use this blueprint as a constraint for everything I build. ` +
      `Ask me to start building, or say "review my blueprint" to discuss it.`;
    webview.postMessage({ type: 'append-message', role: 'assistant', content: summaryMsg });
    return true;
  }

  return false;
}
