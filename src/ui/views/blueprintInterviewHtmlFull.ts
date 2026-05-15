// [SCOPE] Blueprint Interview Full HTML — complete webview page with embedded JS
// Extracted from blueprintInterviewPanel.ts
// [WARN] Template/data file — contains large HTML/JS string literal

export function buildInterviewHtmlFull(layersJson: string, nonce: string): string {
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

  if (allLayers.length > 0) renderLayer(allLayers[0]);
})();
<\/script>
</body></html>`;
}
