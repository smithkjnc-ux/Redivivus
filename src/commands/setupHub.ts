// [SCOPE] Redivivus Setup Hub — single entry point showing all global setup status.
// Shown on first install and accessible via command. HTML -> setupHubHtml.ts.
// GitHub token validated against GitHub API before storing in VS Code SecretStorage.

import * as vscode from 'vscode';
import type { GitHubBackupService } from '../services/githubBackupService.js';
import { getHubHtml } from './setupHubHtml.js';

let _panel: vscode.WebviewPanel | undefined;

export function registerSetupHubCommand(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openSetupHub', () => {
      showSetupHub(context, githubBackupService);
    })
  );
  const shown = context.globalState.get<boolean>('redivivus.setupHubShown');
  if (!shown) {
    context.globalState.update('redivivus.setupHubShown', true);
    setTimeout(() => showSetupHub(context, githubBackupService), 1500);
  }
}

async function refreshPanel(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): Promise<void> {
  if (!_panel) { return; }
  const cfg2 = vscode.workspace.getConfiguration('redivivus');
  const g = cfg2.get<string>('geminiApiKey') || '';
  const o = cfg2.get<string>('openaiApiKey') || '';
  const a = cfg2.get<string>('anthropicApiKey') || '';
  const k = cfg2.get<string>('kimiApiKey') || '';
  const ghCfg = githubBackupService.getConfig();
  const ghConnected = await githubBackupService.isConnected();
  const vaultEnabled = context.globalState.get<boolean>('redivivus.vaultEnabled', true) !== false;
  _panel.webview.html = getHubHtml(!!(g||o||a||k), g, o, a, k, ghConnected, ghCfg.username, ghCfg.repoName, false, 'none', 'none', true, vaultEnabled);
}

async function showSetupHub(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): Promise<void> {
  if (_panel) { _panel.reveal(); return; }

  _panel = vscode.window.createWebviewPanel(
    'redivivusSetupHub', 'Redivivus Setup', vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  _panel.onDidDispose(() => { _panel = undefined; });

  const cfg = vscode.workspace.getConfiguration('redivivus');
  const geminiKey    = cfg.get<string>('geminiApiKey') || '';
  const openaiKey    = cfg.get<string>('openaiApiKey') || '';
  const anthropicKey = cfg.get<string>('anthropicApiKey') || '';
  const kimiKey      = cfg.get<string>('kimiApiKey') || '';
  const githubCfg    = githubBackupService.getConfig();
  const hasGitHub    = await githubBackupService.isConnected();
  const hasAI        = !!(geminiKey || openaiKey || anthropicKey || kimiKey);

  const { RoutingService } = await import('../services/ai/routingService.js');
  const tmpRouting = new RoutingService();
  const guardianActive = tmpRouting.isGuardianActive();
  const workerAI = tmpRouting.getAvailableAI().ai;
  const guardianAI = guardianActive ? (tmpRouting.getGuardianFor(workerAI) || 'none') : 'none';
  const guardianCfg = cfg.get<boolean>('guardianEnabled') !== false;
  const vaultEnabled = context.globalState.get<boolean>('redivivus.vaultEnabled', true) !== false;

  _panel.webview.html = getHubHtml(hasAI, geminiKey, openaiKey, anthropicKey, kimiKey, hasGitHub, githubCfg.username, githubCfg.repoName, guardianActive, guardianAI, workerAI, guardianCfg, vaultEnabled);

  _panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'open-api-setup') {
      vscode.commands.executeCommand('redivivus.openSettings');
    } else if (msg.type === 'openExternal') {
      vscode.env.openExternal(vscode.Uri.parse(msg.url));
    } else if (msg.type === 'save-github') {
      const { token, username, repoName, isPrivate } = msg;
      // Token unchanged (placeholder shown) — only update non-sensitive config
      if (!token || token.includes('•')) {
        await githubBackupService.saveConfig({ username: username || '', repoName: repoName || '', private: isPrivate !== false });
        _panel?.webview.postMessage({ type: 'github-saved' });
        await refreshPanel(context, githubBackupService);
        return;
      }
      // Validate the new token against GitHub API before storing
      const validation = await githubBackupService.validateToken(token);
      if (!validation.valid) {
        _panel?.webview.postMessage({ type: 'github-error', message: validation.error || 'Token validation failed' });
        return;
      }
      await githubBackupService.storeToken(token);
      await githubBackupService.saveConfig({ username: validation.login || username || '', repoName: repoName || '', private: isPrivate !== false });
      _panel?.webview.postMessage({ type: 'github-saved' });
      await refreshPanel(context, githubBackupService);
      const setup = await vscode.window.showInformationMessage(
        `GitHub connected as ${validation.login}. Set up a repo for this project now?`,
        { modal: true }, 'Yes, create & push', 'Later'
      );
      if (setup === 'Yes, create & push') {
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Creating GitHub repo...', cancellable: false }, async () => {
          const result = await githubBackupService.setupRepo();
          vscode.window.showInformationMessage(result.message);
        });
      }
    } else if (msg.type === 'toggle-guardian') {
      await vscode.workspace.getConfiguration('redivivus').update('guardianEnabled', !!msg.enabled, true);
    } else if (msg.type === 'toggle-vault') {
      await context.globalState.update('redivivus.vaultEnabled', msg.enabled !== false);
      await refreshPanel(context, githubBackupService);
    } else if (msg.type === 'open-project-setup') {
      vscode.commands.executeCommand('redivivus.showSetupProgress');
    } else if (msg.type === 'open-chat') {
      vscode.commands.executeCommand('redivivus.openChatPanel');
    } else if (msg.type === 'open-blueprint') {
      vscode.commands.executeCommand('redivivus.wizardRetrofit');
    }
  });
}
