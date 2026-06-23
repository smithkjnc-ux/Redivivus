// [SCOPE] Redivivus Project History Panel — HTML template string
// Extracted from buildHistoryPanel.ts to keep source file under 200 lines.
// [FIX] Removed Save Points tab — snapshots ARE the save points now. Git handles major milestones.

export function buildHistoryHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Project History</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:16px;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-size:13px;}
  .panel-title{font-size:14px;font-weight:700;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-foreground);}
  .entry{padding:12px 14px;border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:8px;background:var(--vscode-input-background);}
  .entry.undone{opacity:0.5;}
  .entry-header{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;}
  .entry-task{flex:1;font-weight:600;font-size:13px;word-break:break-word;}
  .entry-time{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;}
  .entry-meta{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
  .entry-files{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px;font-family:monospace;}
  .badge{padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;}
  .badge-ai{background:rgba(0,120,212,0.15);color:#3b9dff;}
  .badge-vault{background:rgba(40,167,69,0.15);color:#4ec959;}
  .badge-undone{background:rgba(100,100,100,0.15);color:#888;}
  .badge-archived{background:rgba(180,100,0,0.15);color:#c98a00;}
  .badge-initial{background:rgba(80,180,80,0.2);color:#4ec959;border:1px solid rgba(80,180,80,0.4);}
  .badge-fix{background:rgba(200,140,0,0.15);color:#d4940a;}
  .btn-row{display:flex;gap:6px;flex-wrap:wrap;}
  .btn{padding:5px 12px;border-radius:4px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-foreground);cursor:pointer;font-size:11px;}
  .btn:hover{background:var(--vscode-list-hoverBackground);}
  .btn-danger{border-color:rgba(224,85,85,0.4);color:#e05555;}
  .btn-danger.armed{background:rgba(224,85,85,0.2);border-color:rgba(224,85,85,0.8);}
  .empty{text-align:center;padding:40px 20px;color:var(--vscode-descriptionForeground);}
  .legend{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px;padding:8px 10px;background:var(--vscode-input-background);border-radius:4px;line-height:1.8;}
</style>
</head>
<body>
<div class="panel-title">Project History</div>
<div class="legend">
  Every code change (builds, edits, architect fixes) is snapshotted automatically. <strong>Undo</strong> reverts that specific change.
  <strong style="color:#c98a00">Archived</strong> = compressed, still fully restorable.
  <strong style="color:#4ec959">First Build</strong> = original version, never removed.
</div>
<div id="bh-list"><div class="empty">Loading...</div></div>
<script>
  const vscode = acquireVsCodeApi();
  const _undoTimers = {};

  function timeAgo(ts) {
    const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (d < 60) return d + 's ago';
    if (d < 3600) return Math.floor(d/60) + 'm ago';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    return Math.floor(d/86400) + 'd ago';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderHistory(history) {
    const el = document.getElementById('bh-list');
    if (!history || !history.length) {
      el.innerHTML = '<div class="empty">No builds yet.<br><small>Every time Redivivus builds or modifies a file, it appears here.</small></div>';
      return;
    }
    el.innerHTML = history.map(e => {
      const isFix = e.task && e.task.startsWith('[FIX]');
      const srcBadge = e.source === 'vault' ? '<span class="badge badge-vault">Vault</span>' : isFix ? '<span class="badge badge-fix">Fix</span>' : '<span class="badge badge-ai">AI</span>';
      const undoneBadge = e.undone ? ' <span class="badge badge-undone">Undone</span>' : '';
      const archivedBadge = e.isArchived ? ' <span class="badge badge-archived">Archived</span>' : '';
      const initialBadge = e.isInitial ? ' <span class="badge badge-initial">First Build</span>' : '';
      const costStr = e.costUSD > 0 ? \` · $\${e.costUSD.toFixed(4)}\` : '';
      const tokStr = e.tokensUsed > 0 ? \`\${e.tokensUsed.toLocaleString()} tokens\${costStr}\` : '';
      const aiStr = e.supervisor ? esc(e.supervisor + (e.worker ? ' + ' + e.worker : '')) : '';
      const fileCount = (e.files || []).length;
      const firstName = fileCount > 0 ? esc(e.files[0]) : '--';
      const fileNote = fileCount === 0 ? '--' : fileCount === 1 ? firstName : \`\${firstName} + \${fileCount - 1} more\`;
      const disabledUndo = (e.undone || e.isInitial) ? 'disabled style="opacity:0.4;cursor:default;"' : '';
      const undoLabel = e.isArchived ? 'Restore from Archive' : e.isInitial ? 'First Build (permanent)' : isFix ? 'Undo this fix' : 'Undo this build';
      const displayTask = isFix ? e.task.replace(/^\[FIX\]\s*/, '') : e.task;
      return \`<div class="entry\${e.undone ? ' undone' : ''}" id="entry-\${esc(e.id)}">
        <div class="entry-header">
          <span class="entry-task">\${esc(displayTask.slice(0, 100))}\${displayTask.length > 100 ? '...' : ''}</span>
          <span class="entry-time">\${timeAgo(e.timestamp)}</span>
        </div>
        <div class="entry-meta">\${srcBadge}\${undoneBadge}\${archivedBadge}\${initialBadge}\${tokStr ? '<span>' + esc(tokStr) + '</span>' : ''}\${aiStr ? '<span>' + aiStr + '</span>' : ''}</div>
        <div class="entry-files">\${fileNote}</div>
        <div class="btn-row">
          <button class="btn btn-danger" id="undo-\${esc(e.id)}" \${disabledUndo} onclick="undoBuild('\${esc(e.id)}', this)">\${undoLabel}</button>
          \${(e.preExisting && e.preExisting.length > 0) ? '<button class="btn" data-id="' + esc(e.id) + '" onclick="viewDiff(this.dataset.id)">View Diff</button>' : ''}
        </div>
      </div>\`;
    }).join('');
  }

  function viewDiff(id) {
    vscode.postMessage({ type: 'view-diff', snapshotId: id });
  }

  function undoBuild(id, btn) {
    if (btn.getAttribute('data-armed') === '1') {
      clearTimeout(_undoTimers[id]);
      btn.textContent = 'Reverting...';
      btn.disabled = true;
      vscode.postMessage({ type: 'undo-build', snapshotId: id });
    } else {
      const orig = btn.textContent;
      btn.setAttribute('data-armed', '1');
      btn.textContent = 'Click again to confirm';
      btn.classList.add('armed');
      _undoTimers[id] = setTimeout(() => {
        btn.textContent = orig; btn.classList.remove('armed'); btn.removeAttribute('data-armed');
      }, 5000);
    }
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'data') {
      renderHistory(msg.history || []);
    } else if (msg.type === 'refresh') {
      vscode.postMessage({ type: 'get-data' });
    } else if (msg.type === 'undo-result') {
      const entry = document.getElementById('entry-' + msg.snapshotId);
      const btn = document.getElementById('undo-' + msg.snapshotId);
      if (!msg.success) { if (btn) { btn.textContent = 'Failed'; } }
      else { if (entry) { entry.classList.add('undone'); } if (btn) { btn.textContent = 'Reverted'; btn.disabled = true; } }
    }
  });

  vscode.postMessage({ type: 'get-data' });
</script>
</body></html>`;
}
