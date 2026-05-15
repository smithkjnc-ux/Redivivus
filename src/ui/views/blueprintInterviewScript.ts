// [SCOPE] Blueprint Interview Script Template — JS string for chat-embedded interview
// Extracted from blueprintInterviewPanel.ts
// [WARN] Template/data file — contains large JavaScript string literal

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
            'onmouseover="this.style.borderColor=\'\\#4a9eff\'" onmouseout="this.style.borderColor=\'\'"><input type="radio" ' +
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

  setTimeout(() => postMsg('bi-start', {}), 100);
})();`;
}
