// [SCOPE] CHASSIS Setup Hub — single entry point showing all global setup status.
// Shown on first install and accessible via command. HTML -> setupHubHtml.ts.

import * as vscode from 'vscode';
import { GitHubBackupService } from '../services/githubBackupService.js';
import { getHubHtml } from './setupHubHtml.js';

let _panel: vscode.WebviewPanel | undefined;

export function registerSetupHubCommand(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openSetupHub', () => {
      showSetupHub(context, githubBackupService);
    })
  );
  const shown = context.globalState.get<boolean>('chassis.setupHubShown');
  if (!shown) {
    context.globalState.update('chassis.setupHubShown', true);
    setTimeout(() => showSetupHub(context, githubBackupService), 1500);
  }
}

async function showSetupHub(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): Promise<void> {
  if (_panel) { _panel.reveal(); return; }

  _panel = vscode.window.createWebviewPanel(
    'chassisSetupHub', 'CHASSIS Setup', vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  _panel.onDidDispose(() => { _panel = undefined; });

  const cfg = vscode.workspace.getConfiguration('chassis');
  const geminiKey    = cfg.get<string>('geminiApiKey') || '';
  const openaiKey    = cfg.get<string>('openaiApiKey') || '';
  const anthropicKey = cfg.get<string>('anthropicApiKey') || '';
  const kimiKey      = cfg.get<string>('kimiApiKey') || '';
  const githubCfg    = githubBackupService.getConfig();
  const hasAI        = !!(geminiKey || openaiKey || anthropicKey || kimiKey);
  const hasGitHub    = !!(githubCfg.enabled && githubCfg.token);

  const { RoutingService } = await import('../services/ai/routingService.js');
  const tmpRouting = new RoutingService();
  const guardianActive = tmpRouting.isGuardianActive();
  const workerAI = tmpRouting.getAvailableAI().ai;
  const guardianAI = guardianActive ? (tmpRouting.getGuardianFor(workerAI) || 'none') : 'none';
  const guardianCfg = cfg.get<boolean>('guardianEnabled') !== false;

  _panel.webview.html = getHubHtml(hasAI, geminiKey, openaiKey, anthropicKey, kimiKey, hasGitHub, githubCfg.username, githubCfg.repoName, guardianActive, guardianAI, workerAI, guardianCfg);

  _panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'open-api-setup') {
      vscode.commands.executeCommand('chassis.openSettings');
    } else if (msg.type === 'save-github') {
      const { token, username, repoName, isPrivate, interval } = msg;
      const intervalMap: Record<string, number> = { '0': 0, '15': 15, '30': 30, '60': 60 };
      await githubBackupService.saveConfig({
        enabled: !!(token && username), token: token || '', username: username || '',
        repoName: repoName || '', autoBackupOnBuild: true,
        autoBackupInterval: intervalMap[String(interval)] ?? 0, private: isPrivate !== false,
      });
      if (token && username) {
        githubBackupService.startTimer();
        const setup = await vscode.window.showInformationMessage(
          `GitHub backup saved for ${username}. Set up the remote repository now?`,
          { modal: true }, 'Yes, create & push', 'Later'
        );
        if (setup === 'Yes, create & push') {
          vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Setting up GitHub backup...', cancellable: false }, async () => {
            const result = await githubBackupService.setupRepo();
            vscode.window.showInformationMessage(result.message);
          });
        }
      }
      const updatedCfg = githubBackupService.getConfig();
      const cfg2 = vscode.workspace.getConfiguration('chassis');
      const g = cfg2.get<string>('geminiApiKey') || '';
      const o = cfg2.get<string>('openaiApiKey') || '';
      const a = cfg2.get<string>('anthropicApiKey') || '';
      const k = cfg2.get<string>('kimiApiKey') || '';
      if (_panel) {
        _panel.webview.html = getHubHtml(!!(g||o||a||k), g, o, a, k, !!(updatedCfg.enabled && updatedCfg.token), updatedCfg.username, updatedCfg.repoName);
      }
    } else if (msg.type === 'toggle-guardian') {
      await vscode.workspace.getConfiguration('chassis').update('guardianEnabled', !!msg.enabled, true);
    } else if (msg.type === 'open-project-setup') {
      vscode.commands.executeCommand('chassis.showSetupProgress');
    } else if (msg.type === 'open-chat') {
      vscode.commands.executeCommand('chassis.openChatPanel');
    } else if (msg.type === 'open-blueprint') {
      vscode.commands.executeCommand('chassis.wizardRetrofit');
    }
  });
}
