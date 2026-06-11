// [SCOPE] Build Activity panel webview HTML — renders the live pipeline timeline.
// [WARN] ASCII ONLY (Rule 13). No emoji/Unicode literals in this injected script — use text markers.
// The controller (buildActivityPanel.ts) posts {type:'reset'|'step'|'finish'} messages; the script
// below appends timeline rows. Status markers are plain ASCII so the WebView never silently fails.

export function buildActivityHtml(task: string): string {
  const safeTask = String(task || 'your build').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    background: var(--vscode-editor-background); margin: 0; padding: 16px; font-size: 13px; }
  h2 { font-size: 14px; margin: 0 0 4px 0; }
  .task { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 16px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #timeline { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 6px;
    border-left: 3px solid transparent; background: var(--vscode-editorWidget-background); }
  .row.running { border-left-color: var(--vscode-progressBar-background); }
  .row.done, .row.pass { border-left-color: #3fb950; }
  .row.fix, .row.failover { border-left-color: #d29922; }
  .row.continue { border-left-color: #58a6ff; }
  .mark { font-weight: 700; min-width: 28px; font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px; padding-top: 1px; }
  .mark.running { color: var(--vscode-progressBar-background); }
  .mark.done, .mark.pass { color: #3fb950; }
  .mark.fix, .mark.failover { color: #d29922; }
  .mark.continue { color: #58a6ff; }
  .body { flex: 1; min-width: 0; }
  .label { font-weight: 500; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; }
  .spin { display: inline-block; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0.25; } }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 12px 4px; }
</style>
</head>
<body>
  <h2>Build Activity</h2>
  <div class="task" id="task">${safeTask}</div>
  <div id="timeline"><div class="empty" id="empty">Waiting for the pipeline to start...</div></div>
<script>
  (function () {
    var vscode = acquireVsCodeApi();
    var timeline = document.getElementById('timeline');

    // ASCII status markers — phase/status -> short text badge (no emoji, Rule 13).
    function markFor(phase, status) {
      if (status === 'running') return '<span class="spin">[~]</span>';
      if (status === 'continue') return '[++]';
      if (status === 'failover') return '[>>]';
      if (status === 'fix') return '[!]';
      if (status === 'pass' || status === 'done') return '[OK]';
      return '[*]';
    }
    function cls(status) {
      if (status === 'pass' || status === 'done') return 'done';
      return status || 'running';
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[<>&]/g, function (c) {
        return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;';
      });
    }
    function metaLine(step) {
      var parts = [];
      if (step.model) parts.push(esc(step.model));
      if (step.provider && !step.model) parts.push(esc(step.provider));
      var tok = (step.inputTokens || 0) + (step.outputTokens || 0);
      if (tok > 0) parts.push(tok.toLocaleString() + ' tokens');
      if (typeof step.pass === 'number') parts.push('pass ' + step.pass);
      return parts.join('  --  ');
    }

    // The pipeline is sequential, so any row still showing a spinner ([~] running/continue) is finished
    // the moment a later step arrives. Flip those lingering rows to done so nothing stays "running"
    // after the build completes.
    function settlePrior() {
      var live = timeline.querySelectorAll('.row.running, .row.continue');
      for (var i = 0; i < live.length; i++) {
        live[i].className = 'row done';
        var mk = live[i].querySelector('.mark');
        if (mk) { mk.className = 'mark done'; mk.innerHTML = '[OK]'; }
      }
    }

    function addRow(step) {
      var empty = document.getElementById('empty');
      if (empty) empty.remove();
      settlePrior();
      var status = step.status || 'running';
      var row = document.createElement('div');
      row.className = 'row ' + cls(status);
      var meta = metaLine(step);
      row.innerHTML =
        '<div class="mark ' + cls(status) + '">' + markFor(step.phase, status) + '</div>' +
        '<div class="body"><div class="label">' + esc(step.label || step.phase || 'Working') + '</div>' +
        (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>';
      timeline.appendChild(row);
      row.scrollIntoView({ block: 'end' });
    }

    function reset(task) {
      timeline.innerHTML = '<div class="empty" id="empty">Waiting for the pipeline to start...</div>';
      var t = document.getElementById('task');
      if (t && task) t.textContent = task;
    }

    window.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'reset') reset(m.task);
      else if (m.type === 'step') addRow(m.step || {});
      else if (m.type === 'finish') {
        var status = m.ok === false ? 'fix' : 'done';
        addRow({ phase: 'done', status: status, label: m.label || (m.ok === false ? 'Build failed' : 'Build complete') });
      }
    });

    vscode.postMessage({ type: 'ready' });
  })();
</script>
</body>
</html>`;
}
