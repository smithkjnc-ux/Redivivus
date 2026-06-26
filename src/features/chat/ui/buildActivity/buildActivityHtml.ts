// [SCOPE] Build Activity panel webview HTML — renders the live pipeline timeline.
// [WARN] ASCII ONLY (Rule 13). No emoji/Unicode literals in this injected script — use text markers.
// The controller (buildActivityPanel.ts) posts {type:'reset'|'step'|'finish'} messages; the script
// below appends timeline rows. Status markers are plain ASCII so the WebView never silently fails.

export function buildActivityHtml(task: string, expandByDefault = true): string {
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
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
    line-height: 1.4; }
  #timeline { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; flex-direction: column; border-radius: 6px; overflow: hidden;
    border-left: 3px solid transparent; background: var(--vscode-editorWidget-background); }
  .row-head { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; }
  .row-head.clickable { cursor: pointer; }
  .row-head.clickable:hover { background: rgba(255,255,255,0.04); }
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
  .hint { font-size: 9px; color: var(--vscode-textLink-foreground); font-weight: 400; opacity: 0.85; margin-left: 4px; }
  .detail { display: none; padding: 2px 12px 12px 48px; }
  .row.open .detail { display: block; }
  .detail .text { white-space: pre-wrap; font-size: 11px; color: var(--vscode-foreground);
    line-height: 1.5; max-height: 320px; overflow: auto; }
  .detail pre.code { margin: 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 10px;
    line-height: 1.4; background: rgba(0,0,0,0.28); padding: 8px; border-radius: 4px;
    max-height: 380px; overflow: auto; white-space: pre; }
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
    var EXPAND_DEFAULT = ${expandByDefault ? 'true' : 'false'};  // user setting: expand step details by default
    var liveCodeEl = null;  // the <pre> the worker's code streams into live (Phase 2)

    // ASCII status markers — phase/status -> short text badge (no emoji, Rule 13).
    function markFor(phase, status) {
      if (status === 'running') return '<span class="spin">[~]</span>';
      if (status === 'continue') return '[++]';
      if (status === 'failover') return '[>>]';
      if (status === 'fix') return '[!]';
      if (status === 'pass' || status === 'done' || status === 'success') return '[OK]';
      return '[*]';
    }
    function cls(status) {
      if (status === 'pass' || status === 'done' || status === 'success') return 'done';
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
      // First flip any running markers to done
      var live = timeline.querySelectorAll('.row.running, .row.continue');
      for (var i = 0; i < live.length; i++) {
        live[i].className = 'row done';
        var mk = live[i].querySelector('.mark');
        if (mk) { mk.className = 'mark done'; mk.innerHTML = '[OK]'; }
      }
      // Then collapse all previously opened rows to act as an accordion
      var allOpen = timeline.querySelectorAll('.row.open');
      for (var j = 0; j < allOpen.length; j++) {
        allOpen[j].classList.remove('open');
        var hint = allOpen[j].querySelector('.hint');
        if (hint) hint.textContent = '[+] view';
      }
    }

    // Render one step. If the step carries detail (the Supervisor prescription, or the Worker code),
    // the row becomes expandable so the user can SEE the actual work behind each line.
    function addRow(step) {
      var empty = document.getElementById('empty');
      if (empty) empty.remove();
      var isUpdate = step.updateLatest && timeline.lastElementChild;
      if (!isUpdate) settlePrior();
      
      var status = step.status || 'running';
      // step.live = the Worker's code will STREAM into this row (Phase 2). Give it an empty code block
      // and remember it so incoming code chunks append here.
      var hasDetail = (step.detail != null && String(step.detail).length > 0) || step.live === true;
      var row = isUpdate ? timeline.lastElementChild : document.createElement('div');
      
      var isOpen = isUpdate ? row.classList.contains('open') : (hasDetail && EXPAND_DEFAULT);
      if (isUpdate && hasDetail && !row.classList.contains('open') && EXPAND_DEFAULT && !row.dataset.opened) {
        isOpen = true;
      }
      row.className = 'row ' + cls(status) + (isOpen ? ' open' : '');
      if (isOpen) row.dataset.opened = 'true';
      
      var meta = metaLine(step);
      var hintTxt = isOpen ? '[-] hide' : '[+] view';
      var head =
        '<div class="row-head' + (hasDetail ? ' clickable' : '') + '">' +
          '<div class="mark ' + cls(status) + '">' + markFor(step.phase, status) + '</div>' +
          '<div class="body"><div class="label">' + esc(step.label || step.phase || 'Working') +
            (hasDetail ? '<span class="hint">' + hintTxt + '</span>' : '') + '</div>' +
            (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>' +
        '</div>';
      var detailHtml = '';
      if (step.live === true) {
        detailHtml = '<div class="detail"><pre class="code"></pre></div>';
      } else if (hasDetail) {
        detailHtml = step.kind === 'code'
          ? '<div class="detail"><pre class="code">' + esc(step.detail) + '</pre></div>'
          : '<div class="detail"><div class="text">' + esc(step.detail) + '</div></div>';
      }
      row.innerHTML = head + detailHtml;
      if (step.live === true) { liveCodeEl = row.querySelector('pre.code'); }
      if (hasDetail) {
        var headEl = row.querySelector('.row-head');
        headEl.addEventListener('click', function () {
          var open = row.classList.toggle('open');
          var hint = row.querySelector('.hint');
          if (hint) hint.textContent = open ? '[-] hide' : '[+] view';
        });
      }
      if (!isUpdate) timeline.appendChild(row);
      row.scrollIntoView({ block: 'end' });
    }

    // Append a streamed chunk of the Worker's code to the live code block (Phase 2 — watch it type).
    function appendCode(text) {
      if (!liveCodeEl || !text) return;
      liveCodeEl.appendChild(document.createTextNode(text));  // textNode = safe, no escaping needed
      var row = liveCodeEl.closest('.row');
      if (row && row.classList.contains('open')) { liveCodeEl.scrollTop = liveCodeEl.scrollHeight; }
    }

    function reset(task) {
      timeline.innerHTML = '<div class="empty" id="empty">Waiting for the pipeline to start...</div>';
      liveCodeEl = null;
      var t = document.getElementById('task');
      if (t && task) t.textContent = task;
    }

    window.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'reset') reset(m.task);
      else if (m.type === 'code') appendCode(m.text);
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
