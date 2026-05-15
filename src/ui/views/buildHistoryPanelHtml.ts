// [SCOPE] CHASSIS Build History Panel — HTML template string
// Extracted from buildHistoryPanel.ts to keep source file under 200 lines.

export function buildHistoryHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Save Points & Build History</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-size:13px;}
  .tabs{display:flex;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-tab-inactiveBackground);}
  .tab{padding:10px 20px;cursor:pointer;font-size:13px;border:none;background:none;color:var(--vscode-foreground);opacity:0.6;border-bottom:2px solid transparent;}
  .tab.active{opacity:1;border-bottom-color:var(--vscode-focusBorder);background:var(--vscode-tab-activeBackground);}
  .pane{display:none;padding:16px;}
  .pane.active{display:block;}
  .entry{padding:12px 14px;border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:8px;background:var(--vscode-input-background);}
  .entry.undone{opacity:0.5;}
  .entry-header{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;}
  .entry-task{flex:1;font-weight:600;font-size:13px;word-break:break-word;}
  .entry-time{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;}
  .entry-meta{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;}
  .badge{padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;}
  .badge-ai{background:rgba(0,120,212,0.15);color:#3b9dff;}
  .badge-vault{background:rgba(40,167,69,0.15);color:#4ec959;}
  .badge-undone{background:rgba(100,100,100,0.15);color:#888;}
  .entry-files{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px;font-family:monospace;}
  .btn-row{display:flex;gap:6px;flex-wrap:wrap;}
  .btn{padding:5px 12px;border-radius:4px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-foreground);cursor:pointer;font-size:11px;}
  .btn:hover{background:var(--vscode-list-hoverBackground);}
  .btn-danger{border-color:rgba(224,85,85,0.4);color:#e05555;}
  .btn-danger.armed{background:rgba(224,85,85,0.2);border-color:rgba(224,85,85,0.8);}
  .btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);}
  .empty{text-align:center;padding:40px 20px;color:var(--vscode-descriptionForeground);}
  .create-row{display:flex;gap:8px;margin-bottom:16px;}
  .create-row input{flex:1;padding:7px 10px;border:1px solid var(--vscode-input-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-foreground);font-size:12px;}
  .sp-entry{padding:10px 14px;border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:8px;background:var(--vscode-input-background);}
  .sp-header{display:flex;justify-content:space-between;align-items:center;}
  .sp-label{font-weight:600;font-size:13px;}
  .sp-time{font-size:11px;color:var(--vscode-descriptionForeground);}
</style>
</head>
<body>
<div class="tabs">
  <button class="tab active" id="tab-sp" onclick="switchTab('sp')">[MAP] Save Points</button>
  <button class="tab" id="tab-bh" onclick="switchTab('bh')">[BUILD] Build History</button>
</div>
<div class="pane active" id="pane-sp">
  <div class="create-row">
    <input id="sp-input" type="text" placeholder="Save point description (optional)">
    <button class="btn btn-primary" onclick="createSavePoint()">[DISK] Create Save Point</button>
  </div>
  <div id="sp-list"><div class="empty">Loading...</div></div>
</div>
<div class="pane" id="pane-bh">
  <div id="bh-list"><div class="empty">Loading...</div></div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  let _data = { savePoints: [], history: [] };
  const _undoTimers = {};

  function switchTab(t) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + t).classList.add('active');
    document.getElementById('pane-' + t).classList.add('active');
  }

  function timeAgo(iso) {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (d < 60) return d + 's ago';
    if (d < 3600) return Math.floor(d/60) + 'm ago';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    return Math.floor(d/86400) + 'd ago';
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderSavePoints(sps) {
    const el = document.getElementById('sp-list');
    if (!sps.length) { el.innerHTML = '<div class="empty">No save points yet.<br><small>Save points are git commits -- create one after finishing a working milestone.</small></div>'; return; }
    el.innerHTML = sps.map(sp => {
      const label = sp.message.replace('\\ud83d\\udcbe Save Point: ','').replace('\\uD83D\\uDCBE Save Point: ','').replace(/^\ud83d\udcbe Save Point: /,'').replace(/^\uD83D\uDCBE Save Point: /,'');
      return \`<div class="sp-entry">
        <div class="sp-header">
          <span class="sp-label">\${escHtml(label)}</span>
          <span class="sp-time">\${timeAgo(sp.timestamp)}</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button class="btn btn-danger" id="restore-\${escHtml(sp.hash)}" onclick="restoreSavePoint('\${escHtml(sp.hash)}', this)">[BACK] Restore</button>
        </div>
      </div>\`;
    }).join('');
  }

  function renderHistory(history) {
    const el = document.getElementById('bh-list');
    if (!history.length) { el.innerHTML = '<div class="empty">No builds yet -- start building to see history here.</div>'; return; }
    el.innerHTML = history.map(e => {
      const badge = e.source === 'vault' ? '<span class="badge badge-vault">Vault</span>' : '<span class="badge badge-ai">AI</span>';
      const undoneBadge = e.undone ? ' <span class="badge badge-undone">Undone</span>' : '';
      const costStr = e.costUSD > 0 ? \` · $\${e.costUSD.toFixed(4)}\` : '';
      const tokStr = e.tokensUsed > 0 ? \`\${e.tokensUsed.toLocaleString()} tokens\${costStr}\` : (e.source === 'vault' ? 'No AI tokens' : '');
      const filesStr = e.files.length ? e.files.map(f => escHtml(f)).join(', ') : '—';
      const disabledUndo = e.undone ? 'disabled style="opacity:0.4;cursor:default;"' : '';
      return \`<div class="entry\${e.undone?' undone':''}" id="entry-\${escHtml(e.id)}">
        <div class="entry-header">
          <span class="entry-task">\${escHtml(e.task.slice(0,90))}\${e.task.length>90?'...':''}</span>
          <span class="entry-time">\${timeAgo(e.timestamp)}</span>
        </div>
        <div class="entry-meta">\${badge}\${undoneBadge}\${tokStr?'<span>'+escHtml(tokStr)+'</span>':''}\${e.supervisor?'<span>'+escHtml(e.supervisor+(e.worker?' + '+e.worker:''))+'</span>':''}</div>
        <div class="entry-files">\${filesStr}</div>
        <div class="btn-row">
          <button class="btn btn-danger" id="undo-\${escHtml(e.id)}" \${disabledUndo} onclick="undoBuild('\${escHtml(e.id)}', this)">[BACK] Undo</button>
          <button class="btn" onclick="promoteSavePoint('\${escHtml(e.id)}')">[PIN] Save as Checkpoint</button>
        </div>
      </div>\`;
    }).join('');
  }

  function createSavePoint() {
    const desc = document.getElementById('sp-input').value.trim();
    vscode.postMessage({ type: 'create-save-point', description: desc });
    document.getElementById('sp-input').value = '';
  }

  function restoreSavePoint(hash, btn) {
    if (btn.getAttribute('data-armed') === '1') {
      clearTimeout(_undoTimers['sp-' + hash]);
      btn.textContent = 'Restoring...';
      btn.disabled = true;
      vscode.postMessage({ type: 'restore-save-point', hash });
    } else {
      const orig = btn.textContent;
      btn.setAttribute('data-armed','1');
      btn.textContent = '[!] Click again to confirm';
      btn.classList.add('armed');
      _undoTimers['sp-' + hash] = setTimeout(() => {
        btn.textContent = orig; btn.classList.remove('armed'); btn.removeAttribute('data-armed');
      }, 5000);
    }
  }

  function undoBuild(id, btn) {
    if (btn.getAttribute('data-armed') === '1') {
      clearTimeout(_undoTimers[id]);
      btn.textContent = 'Undoing...';
      btn.disabled = true;
      vscode.postMessage({ type: 'undo-build', snapshotId: id });
    } else {
      const orig = btn.textContent;
      btn.setAttribute('data-armed','1');
      btn.textContent = '[!] Click again to confirm';
      btn.classList.add('armed');
      _undoTimers[id] = setTimeout(() => {
        btn.textContent = orig; btn.classList.remove('armed'); btn.removeAttribute('data-armed');
      }, 5000);
    }
  }

  function promoteSavePoint(id) {
    vscode.postMessage({ type: 'promote-to-save-point', snapshotId: id });
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'data') {
      _data = msg;
      renderSavePoints(msg.savePoints || []);
      renderHistory(msg.history || []);
    } else if (msg.type === 'refresh') {
      vscode.postMessage({ type: 'get-data' });
    } else if (msg.type === 'undo-result') {
      const entry = document.getElementById('entry-' + msg.snapshotId);
      const btn = document.getElementById('undo-' + msg.snapshotId);
      if (!msg.success) { if (btn) { btn.textContent = '[X] Failed'; } }
      else { if (entry) { entry.classList.add('undone'); } if (btn) { btn.textContent = 'Undone'; btn.disabled = true; } }
    }
  });

  vscode.postMessage({ type: 'get-data' });
</script>
</body></html>`;
}
