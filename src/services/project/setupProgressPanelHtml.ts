// [SCOPE] Setup Progress Panel HTML builder — extracted from setupProgressPanel.ts
// Rule 13: emoji in script blocks use String.fromCodePoint(); HTML uses &#x; entities.

import type { SetupProgress } from './setupProgressService.js';

export function buildSetupProgressHtml(progress: SetupProgress): string {
  const stepsHtml = progress.steps.map(step => {
    const icon = step.completed ? '&#x2705;' : (step.inProgress ? '&#x1F504;' : '&#x25A1;');
    const statusClass = step.completed ? 'done' : (step.inProgress ? 'working' : 'pending');
    const subItemsHtml = step.subItems
      ? step.subItems.map(item => `<div class="sub-item">${item}</div>`).join('')
      : '';
    const actionHtml = step.action
      ? `<div class="action-row"><button class="action-btn" data-action="${step.id}">${step.action}</button><button class="mark-done-btn" data-step="${step.id}" title="Mark as manually completed">&#x2713; Mark Done</button></div>`
      : '';
    return `<div class="step-row ${statusClass}"><div class="step-icon">${icon}</div><div class="step-content"><div class="step-title">${step.id}. ${step.title}</div>${subItemsHtml}${actionHtml}</div></div>`;
  }).join('');

  const pct = progress.percentage;
  const blocks = '&#x2588;'.repeat(Math.floor(pct / 10)) + '&#x2591;'.repeat(10 - Math.floor(pct / 10));
  const celebration = pct === 100
    ? `<div class="celebration">&#x1F389; Your project is fully set up with Redivivus! Start building.</div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 24px; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 300; letter-spacing: 4px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 28px; }
  .progress-section { margin-bottom: 32px; padding: 20px; background: rgba(59,157,255,0.05); border: 1px solid rgba(59,157,255,0.2); border-radius: 8px; }
  .progress-text { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
  .progress-bar { height: 24px; background: var(--vscode-input-border, #334455); border-radius: 4px; overflow: hidden; position: relative; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #3b9dff, #4ec959); transition: width 0.3s ease; }
  .progress-blocks { font-family: monospace; font-size: 12px; letter-spacing: 2px; color: rgba(255,255,255,0.9); text-align: center; line-height: 24px; }
  .step-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--vscode-input-border, #334455); transition: background 0.15s; }
  .step-row:last-child { border-bottom: none; }
  .step-row:hover { background: rgba(100,100,100,0.05); }
  .step-row.done { background: rgba(78,201,89,0.05); }
  .step-row.working { background: rgba(245,166,35,0.05); }
  .step-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
  .step-content { flex: 1; }
  .step-title { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
  .sub-item { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 2px 0 2px 16px; }
  .action-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
  .action-btn { cursor: pointer; border: 1px solid rgba(59,157,255,0.4); background: rgba(59,157,255,0.08); color: var(--vscode-textLink-foreground); border-radius: 4px; padding: 4px 12px; font-size: 11px; font-family: inherit; transition: background 0.15s; }
  .action-btn:hover { background: rgba(59,157,255,0.18); }
  .mark-done-btn { cursor: pointer; border: 1px solid rgba(78,201,89,0.4); background: rgba(78,201,89,0.08); color: #4ec959; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-family: inherit; transition: background 0.15s; }
  .mark-done-btn:hover { background: rgba(78,201,89,0.2); }
  .celebration { text-align: center; font-size: 16px; font-weight: 600; color: #4ec959; padding: 20px; background: rgba(78,201,89,0.1); border: 1px solid rgba(78,201,89,0.3); border-radius: 8px; margin-top: 24px; }
</style></head><body>
<h1>${progress.projectName}</h1>
<div class="subtitle">Setup Progress</div>
<div class="progress-section">
  <div class="progress-text">Progress: ${progress.completedCount} of ${progress.totalCount} complete (${pct}%)</div>
  <div class="progress-bar">
    <div class="progress-fill" style="width: ${pct}%"></div>
    <div class="progress-blocks">${blocks} ${pct}%</div>
  </div>
</div>
<div class="steps-list">${stepsHtml}</div>
${celebration}
<script>
  const vscode = acquireVsCodeApi();
  window.__vscode_api = vscode;
  var SPIN = String.fromCodePoint(0x1F504);
  var CHECK = String.fromCodePoint(0x2705);
  var CROSS = String.fromCodePoint(0x274C);
  document.querySelectorAll('.action-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var actionId = btn.getAttribute('data-action');
      btn.classList.add('working');
      btn.textContent = SPIN + ' Running...';
      try { vscode.postMessage({ type: 'runAction', actionId: actionId }); }
      catch(e) { btn.classList.remove('working'); btn.textContent = CROSS + ' Failed'; }
    });
  });
  document.querySelectorAll('.mark-done-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var stepId = btn.getAttribute('data-step');
      btn.textContent = CHECK + ' Saving...';
      btn.disabled = true;
      try { vscode.postMessage({ type: 'markStepDone', stepId: stepId }); }
      catch(e) { btn.disabled = false; btn.textContent = CROSS + ' Failed'; }
    });
  });
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.type === 'actionComplete') {
      var btn = document.querySelector('.action-btn[data-action="' + msg.actionId + '"]');
      if (btn) { btn.classList.remove('working'); btn.textContent = CHECK + ' Done'; btn.disabled = true; }
    } else if (msg.type === 'actionFailed') {
      var btn = document.querySelector('.action-btn[data-action="' + msg.actionId + '"]');
      if (btn) { btn.classList.remove('working'); btn.textContent = CROSS + ' Failed'; }
    } else if (msg.type === 'refreshProgress') {
      window.__vscode_api.postMessage({ type: 'reloadProgress' });
    }
  });
</script>
</body></html>`;
}
