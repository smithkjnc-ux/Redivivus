// [SCOPE] CHASSIS Setup Progress Panel — webview panel showing 10-step setup checklist
// HTML builder -> setupProgressPanelHtml.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { SetupProgress } from './setupProgressService.js';
import { buildSetupProgressHtml } from './setupProgressPanelHtml.js';

let _activePanel: vscode.WebviewPanel | undefined;
let _activeOnRefresh: (() => Promise<SetupProgress>) | undefined;

export async function refreshSetupProgressIfOpen(): Promise<void> {
  if (_activePanel && _activeOnRefresh) {
    try {
      const fresh = await _activeOnRefresh();
      _activePanel.webview.html = buildSetupProgressHtml(fresh);
    } catch { /* non-fatal */ }
  }
}

export function showSetupProgressPanel(progress: SetupProgress, onRefresh?: () => Promise<SetupProgress>): void {
  const panel = vscode.window.createWebviewPanel(
    'chassisSetupProgress',
    'CHASSIS Setup Progress',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  _activePanel = panel;
  _activeOnRefresh = onRefresh;
  panel.onDidDispose(() => { _activePanel = undefined; _activeOnRefresh = undefined; });

  panel.webview.html = buildSetupProgressHtml(progress);

  panel.webview.onDidReceiveMessage(async (msg: any) => {
    if (msg.type === 'runAction') {
      await handleAction(parseInt(msg.actionId), panel);
    } else if (msg.type === 'markStepDone') {
      persistManualStepDone(parseInt(msg.stepId));
      if (onRefresh) { const fresh = await onRefresh(); panel.webview.html = buildSetupProgressHtml(fresh); }
    } else if (msg.type === 'reloadProgress') {
      if (onRefresh) {
        const fresh = await onRefresh();
        panel.webview.html = buildSetupProgressHtml(fresh);
      }
    }
  });
}

function persistManualStepDone(stepId: number): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }
  const cfgPath = path.join(root, '.chassis', 'config.json');
  try {
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {};
    cfg.manualCompletedSteps = Array.from(new Set([...(cfg.manualCompletedSteps || []), stepId]));
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch { /* never crash */ }
}

async function handleAction(actionId: number, panel: vscode.WebviewPanel): Promise<void> {
  try {
    panel.webview.postMessage({ type: 'actionStarted', actionId });

    switch (actionId) {
      case 1: await vscode.commands.executeCommand('chassis.wizardRetrofit'); break;
      case 2: await vscode.commands.executeCommand('chassis.blueprint'); break;
      case 3:
        await vscode.commands.executeCommand('chassis.lockBlueprint');
        setTimeout(() => panel.webview.postMessage({ type: 'refreshProgress' }), 600);
        break;
      case 4:
        try {
          await vscode.commands.executeCommand('chassis.generateRules');
        } catch (e) {
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
      case 6:
      case 7:
      case 8:
        await vscode.commands.executeCommand(actionId === 6 ? 'chassis.splitFiles' : 'chassis.analyze');
        setTimeout(() => panel.webview.postMessage({ type: 'refreshProgress' }), 2000);
        break;
      case 9: await vscode.commands.executeCommand('chassis.startSession'); break;
      case 10: await vscode.commands.executeCommand('chassis.savePoint'); break;
    }

    panel.webview.postMessage({ type: 'actionComplete', actionId });
  } catch (err) {
    console.error(`Action ${actionId} failed:`, err);
    panel.webview.postMessage({ type: 'actionFailed', actionId });
  }
}
