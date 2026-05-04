// [SCOPE] CHASSIS Recommendations webview panel — creates the panel and wires up message handling
// Section HTML is built in analyzerSections.ts. This file is panel lifecycle only.
import * as vscode from 'vscode';
import * as path from 'path';
import { AnalysisResult } from './analyzerTypes.js';
import {
  buildOverviewSection, buildLargeFilesSection, buildTodosSection,
  buildUncommentedSection, buildNextStepsSection
} from './analyzerSections.js';

export function showRecommendationsPanel(result: AnalysisResult): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const projectName = path.basename(root) || 'this project';

  const panel = vscode.window.createWebviewPanel(
    'chassisRecommendations',
    'CHASSIS Recommendations',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const sections = [
    buildOverviewSection(result),
    buildLargeFilesSection(result),
    buildTodosSection(result, projectName),
    buildUncommentedSection(result, projectName),
    buildNextStepsSection(result, projectName),
  ].join('\n');

  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 24px; max-width: 820px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 300; letter-spacing: 4px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 28px; }
  .section { margin-bottom: 24px; border: 1px solid var(--vscode-input-border, #334455); border-radius: 8px; overflow: hidden; }
  .section-header { padding: 12px 16px; font-size: 14px; font-weight: 600; }
  .overview { background: rgba(59,157,255,0.1); border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .warn-header { background: rgba(245,166,35,0.1); border-bottom: 1px solid rgba(245,166,35,0.25); color: #f5a623; }
  .neutral-header { background: rgba(100,100,100,0.1); border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .next-header { background: rgba(78,201,89,0.1); border-bottom: 1px solid rgba(78,201,89,0.25); color: #4ec959; }
  .section-why { padding: 12px 16px; font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.6; border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--vscode-input-border, #334455); }
  .stat { background: var(--vscode-editor-background); padding: 16px 12px; text-align: center; }
  .stat.warn .stat-num { color: #f5a623; }
  .stat.ok .stat-num { color: #4ec959; }
  .stat-num { font-size: 26px; font-weight: 600; line-height: 1; margin-bottom: 4px; }
  .stat-label { font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.5px; }
  .item-list { padding: 8px 0; }
  .item-row { display: flex; align-items: center; gap: 10px; padding: 7px 16px; font-size: 12px; border-bottom: 1px solid var(--vscode-input-border, #334455); flex-wrap: wrap; }
  .item-row:last-child { border-bottom: none; }
  .item-row.col { flex-direction: column; align-items: flex-start; gap: 4px; }
  .item-file { font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground); flex: 1; }
  .item-badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; flex-shrink: 0; }
  .warn-badge { background: rgba(245,166,35,0.15); color: #f5a623; }
  .neutral-badge { background: rgba(100,100,100,0.15); color: var(--vscode-descriptionForeground); }
  .todo-line-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 2px 0; }
  .todo-line { font-family: monospace; font-size: 11px; color: var(--vscode-descriptionForeground); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-more { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 4px 16px; font-style: italic; }
  .fix-btn { flex-shrink: 0; cursor: pointer; border: 1px solid rgba(59,157,255,0.4); background: rgba(59,157,255,0.08); color: var(--vscode-textLink-foreground); border-radius: 4px; padding: 3px 10px; font-size: 11px; font-family: inherit; transition: background 0.15s; white-space: nowrap; }
  .fix-btn:hover { background: rgba(59,157,255,0.18); }
  .fix-btn.copied { border-color: rgba(78,201,89,0.5); background: rgba(78,201,89,0.1); color: #4ec959; }
  .fix-btn.pending { border-color: rgba(245,166,35,0.5); background: rgba(245,166,35,0.15); color: #f5a623; }
  .done-btn { flex-shrink: 0; cursor: pointer; border: 1px solid rgba(78,201,89,0.3); background: transparent; color: var(--vscode-descriptionForeground); border-radius: 4px; padding: 3px 10px; font-size: 11px; font-family: inherit; transition: all 0.15s; white-space: nowrap; margin-left: 2px; }
  .done-btn:hover { border-color: rgba(78,201,89,0.7); color: #4ec959; background: rgba(78,201,89,0.08); }
  .item-row.resolved { background: rgba(78,201,89,0.06); border-left: 3px solid #4ec959; opacity: 0.75; }
  .item-row.resolved .item-file { text-decoration: line-through; color: var(--vscode-descriptionForeground); }
  .resolved-badge { color: #4ec959; font-size: 12px; font-weight: 600; margin-left: 6px; flex-shrink: 0; }
  .next-list { padding: 10px 16px; list-style: none; }
  .next-list li { display: flex; align-items: center; gap: 10px; font-size: 13px; line-height: 1.7; padding: 6px 0; border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .next-list li:last-child { border-bottom: none; }
  .next-list li span { flex: 1; }
  code { font-family: monospace; font-size: 11px; background: rgba(100,100,100,0.2); padding: 1px 5px; border-radius: 3px; }
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(78,201,89,0.15); border: 1px solid rgba(78,201,89,0.4); color: #4ec959; padding: 10px 20px; border-radius: 6px; font-size: 13px; display: none; z-index: 999; }
</style></head><body>
<h1>C H A S S I S</h1>
<div class="subtitle">Project Recommendations</div>
${sections}
<div class="toast" id="toast">📋 Copied! Now click in the Cascade chat and press Ctrl+V → Enter</div>
<script>
  const vscode = acquireVsCodeApi();
  const toast = document.getElementById('toast');
  let toastTimer;

  // Handle verification results from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'verifyFixResult' && msg.result) {
      const rowId = msg.rowId;
      const rows = document.querySelectorAll('.item-row, li');
      const row = rows[parseInt(rowId || '0')];
      if (!row) return;

      if (msg.result.fixed) {
        row.classList.add('resolved');
        const badge = document.createElement('span');
        badge.className = 'resolved-badge';
        badge.textContent = '✅ Fixed';
        row.appendChild(badge);
        const doneBtn = row.querySelector('.done-btn');
        if (doneBtn) doneBtn.remove();
        const fixBtn = row.querySelector('.fix-btn');
        if (fixBtn) fixBtn.remove();
        updateDoneCount();
      } else {
        const reason = msg.result.reason || 'Verification failed';
        const retryPrompt = msg.result.retryPrompt || '';
        const fixBtn = row.querySelector('.fix-btn');
        if (fixBtn) {
          fixBtn.classList.remove('pending');
          fixBtn.textContent = fixBtn.getAttribute('data-label') || 'Fix This';
        }
        if (retryPrompt) {
          vscode.postMessage({ type: 'copyToClipboard', text: retryPrompt });
          toast.textContent = '❌ Not fixed yet: ' + reason + '. Retry prompt copied to clipboard — paste in chat.';
        } else {
          toast.textContent = '❌ Not fixed yet: ' + reason;
        }
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.style.display = 'none';
          toast.textContent = '📋 Copied! Now click in the Cascade chat and press Ctrl+V → Enter';
        }, 6000);
      }
    } else if (msg.type === 'clipboardCopied') {
      toast.style.display = 'block';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.style.display = 'none';
        toast.textContent = '📋 Copied! Now click in the Cascade chat and press Ctrl+V → Enter';
      }, 4000);
    }
  });

  document.addEventListener('click', e => {
    const doneBtn = e.target.closest('.done-btn');
    if (doneBtn) {
      const filePath = doneBtn.getAttribute('data-file');
      const issueType = doneBtn.getAttribute('data-issue');
      const row = doneBtn.closest('.item-row, li');
      if (!filePath || !issueType || !row || row.classList.contains('resolved')) {
        return;
      }
      doneBtn.dataset.rowId = Array.from(row.parentElement?.children || []).indexOf(row).toString();
      vscode.postMessage({ type: 'verifyFix', filePath, issueType, rowId: doneBtn.dataset.rowId });
      return;
    }
    const btn = e.target.closest('.fix-btn');
    if (!btn) { return; }
    const prompt = btn.getAttribute('data-prompt');
    vscode.postMessage({ type: 'sendToChat', prompt });
    btn.classList.add('pending');
    btn.classList.remove('copied');
    btn.textContent = '⏳ Pending';
    clearTimeout(toastTimer);
    toast.style.display = 'block';
    toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  });
  function updateDoneCount() {
    const total = document.querySelectorAll('.item-row').length;
    const done = document.querySelectorAll('.item-row.resolved').length;
    if (done === 0) { return; }
    let counter = document.getElementById('done-counter');
    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'done-counter';
      counter.style.cssText = 'position:fixed;top:12px;right:16px;background:rgba(78,201,89,0.15);border:1px solid rgba(78,201,89,0.4);color:#4ec959;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;z-index:999;';
      document.body.appendChild(counter);
    }
    counter.textContent = '✅ ' + done + ' of ' + total + ' fixed';
  }
  document.querySelectorAll('.fix-btn').forEach(btn => { btn.setAttribute('data-label', btn.textContent); });
</script>
</body></html>`;

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'sendToChat' && typeof msg.prompt === 'string') {
      await vscode.env.clipboard.writeText(msg.prompt);
    } else if (msg.type === 'verifyFix' && msg.filePath && msg.issueType) {
      const result = await vscode.commands.executeCommand('chassis.verifyFix', msg.filePath, msg.issueType);
      panel.webview.postMessage({ type: 'verifyFixResult', result, rowId: msg.rowId });
    } else if (msg.type === 'copyToClipboard' && msg.text) {
      await vscode.env.clipboard.writeText(msg.text);
      panel.webview.postMessage({ type: 'clipboardCopied' });
    }
  });
}
