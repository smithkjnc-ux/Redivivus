// [SCOPE] CHASSIS Setup Progress Panel — webview panel showing 10-step setup checklist
import * as vscode from 'vscode';
import { SetupProgressService, SetupProgress } from './setupProgressService.js';

export function showSetupProgressPanel(progress: SetupProgress, onRefresh?: () => Promise<SetupProgress>): void {
  const panel = vscode.window.createWebviewPanel(
    'chassisSetupProgress',
    'CHASSIS Setup Progress',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = buildSetupProgressHtml(progress);

  panel.webview.onDidReceiveMessage(async (msg: any) => {
    if (msg.type === 'runAction') {
      const actionId = parseInt(msg.actionId);
      await handleAction(actionId, panel);
    } else if (msg.type === 'reloadProgress') {
      // [CHASSIS] Re-fetch progress and re-render the panel HTML in-place
      if (onRefresh) {
        const fresh = await onRefresh();
        panel.webview.html = buildSetupProgressHtml(fresh);
      }
    }
  });
}

function buildSetupProgressHtml(progress: SetupProgress): string {
  const stepsHtml = progress.steps.map(step => {
    const icon = step.completed ? '✅' : (step.inProgress ? '🔄' : '⬜');
    const statusClass = step.completed ? 'done' : (step.inProgress ? 'working' : 'pending');
    const subItemsHtml = step.subItems
      ? step.subItems.map(item => `<div class="sub-item">${item}</div>`).join('')
      : '';
    const actionHtml = step.action
      ? `<button class="action-btn" data-action="${step.id}">${step.action}</button>`
      : '';
    return `
      <div class="step-row ${statusClass}">
        <div class="step-icon">${icon}</div>
        <div class="step-content">
          <div class="step-title">${step.id}. ${step.title}</div>
          ${subItemsHtml}
          ${actionHtml}
        </div>
      </div>
    `;
  }).join('');

  const completedSteps = progress.completedCount;
  const totalSteps = progress.totalCount;
  const percentage = progress.percentage;
  const progressWidth = percentage + '%';
  const progressBlocks = '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));

  const celebrationHtml = percentage === 100
    ? `<div class="celebration">🎉 Your project is fully set up with CHASSIS! Start building.</div>`
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
  .action-btn { margin-top: 8px; cursor: pointer; border: 1px solid rgba(59,157,255,0.4); background: rgba(59,157,255,0.08); color: var(--vscode-textLink-foreground); border-radius: 4px; padding: 4px 12px; font-size: 11px; font-family: inherit; transition: background 0.15s; }
  .action-btn:hover { background: rgba(59,157,255,0.18); }
  .celebration { text-align: center; font-size: 16px; font-weight: 600; color: #4ec959; padding: 20px; background: rgba(78,201,89,0.1); border: 1px solid rgba(78,201,89,0.3); border-radius: 8px; margin-top: 24px; }
</style></head><body>
<h1>${progress.projectName}</h1>
<div class="subtitle">Setup Progress</div>

<div class="progress-section">
  <div class="progress-text">Progress: ${completedSteps} of ${totalSteps} complete (${percentage}%)</div>
  <div class="progress-bar">
    <div class="progress-fill" style="width: ${progressWidth}"></div>
    <div class="progress-blocks">${progressBlocks} ${percentage}%</div>
  </div>
</div>

<div class="steps-list">
  ${stepsHtml}
</div>

${celebrationHtml}

<script>
  // [CHASSIS] Standard way to get the VS Code API — store on window for message re-use
  const vscode = acquireVsCodeApi();
  window.__vscode_api = vscode;
  
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const actionId = btn.getAttribute('data-action');
      btn.classList.add('working');
      btn.textContent = '🔄 Running...';
      try {
        vscode.postMessage({ type: 'runAction', actionId });
      } catch (e) {
        console.error('Failed to post message:', e);
        btn.classList.remove('working');
        btn.textContent = '❌ Failed';
      }
    });
  });
  
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'actionStarted') {
      // Action started, button already shows working state
      console.log('Action started:', msg.actionId);
    } else if (msg.type === 'actionComplete') {
      const btn = document.querySelector('.action-btn[data-action="' + msg.actionId + '"]');
      if (btn) {
        btn.classList.remove('working');
        btn.textContent = '✅ Done';
        btn.disabled = true;
      }
    } else if (msg.type === 'actionFailed') {
      const btn = document.querySelector('.action-btn[data-action="' + msg.actionId + '"]');
      if (btn) {
        btn.classList.remove('working');
        btn.textContent = '❌ Failed';
      }
    } else if (msg.type === 'refreshProgress') {
      // [CHASSIS] Request the extension host to re-render the panel with fresh data
      // [WARN] Do NOT call location.reload() — webviews have no URL, it blanks the panel
      window.__vscode_api.postMessage({ type: 'reloadProgress' });
    }
  });
</script>
</body></html>`;
}

async function handleAction(actionId: number, panel: vscode.WebviewPanel): Promise<void> {
  try {
    // Notify webview that action is starting
    panel.webview.postMessage({ type: 'actionStarted', actionId });
    
    switch (actionId) {
      case 1:
        await vscode.commands.executeCommand('chassis.wizardRetrofit');
        break;
      case 2:
        await vscode.commands.executeCommand('chassis.blueprint');
        break;
      case 3:
        await vscode.commands.executeCommand('chassis.lockBlueprint');
        break;
      case 4:
        try {
          await vscode.commands.executeCommand('chassis.generateRules');
        } catch (e) {
          console.error('Generate rules command failed:', e);
          const fs = require('fs');
          fs.appendFileSync('/tmp/chassis_error.log', `Action 4 command failed: ${e}, trying direct fallback...\n`);
          const { RulesService } = require('../rulesService.js');
          const { ChassisService } = require('../chassisService.js');
          const chassisService = new ChassisService();
          const rulesService = new RulesService(chassisService);
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (root) {
            const config = chassisService.loadConfig();
            rulesService.generateAll(root, config?.projectName || 'Project');
          }
        }
        break;
      case 5:
        await vscode.commands.executeCommand('chassis.analyze');
        // After analyze, refresh the panel to show updated progress
        setTimeout(() => {
          panel.webview.postMessage({ type: 'refreshProgress' });
        }, 2000);
        break;
      case 6:
        await vscode.commands.executeCommand('chassis.splitFiles');
        // After split, refresh the panel to show updated progress
        setTimeout(() => {
          panel.webview.postMessage({ type: 'refreshProgress' });
        }, 2000);
        break;
      case 7:
        await vscode.commands.executeCommand('chassis.analyze');
        // After analyze, refresh the panel to show updated progress
        setTimeout(() => {
          panel.webview.postMessage({ type: 'refreshProgress' });
        }, 2000);
        break;
      case 8:
        await vscode.commands.executeCommand('chassis.analyze');
        // After analyze, refresh the panel to show updated progress
        setTimeout(() => {
          panel.webview.postMessage({ type: 'refreshProgress' });
        }, 2000);
        break;
      case 9:
        await vscode.commands.executeCommand('chassis.startSession');
        break;
      case 10:
        await vscode.commands.executeCommand('chassis.savePoint');
        break;
    }
    
    // Notify webview that action completed successfully
    panel.webview.postMessage({ type: 'actionComplete', actionId });
  } catch (err) {
    console.error(`Action ${actionId} failed:`, err);
    const fs = require('fs');
    fs.appendFileSync('/tmp/chassis_error.log', `Action ${actionId} failed: ${err instanceof Error ? err.stack : String(err)}\n`);
    panel.webview.postMessage({ type: 'actionFailed', actionId });
  }
}
