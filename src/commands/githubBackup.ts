// [SCOPE] Registers GitHub commands — connect account, set up per-project repo, manual commit.
// All operations are user-initiated. No timers, no auto-backup, no silent commits.

import * as vscode from 'vscode';
import type { GitHubBackupService } from '../services/githubBackupService.js';

export function registerGitHubBackupCommands(context: vscode.ExtensionContext, backupService: GitHubBackupService): void {

  // redivivus.configureGitHubBackup — token entry + validation
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.configureGitHubBackup', async () => {
    const token = await vscode.window.showInputBox({
      prompt: 'GitHub Personal Access Token (needs repo scope)',
      password: true,
      placeHolder: 'ghp_...',
      ignoreFocusOut: true,
    });
    if (token === undefined) { return; }
    if (!token.trim()) { vscode.window.showWarningMessage('No token entered.'); return; }

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Validating GitHub token...', cancellable: false }, async () => {
      const validation = await backupService.validateToken(token.trim());
      if (!validation.valid) {
        vscode.window.showErrorMessage(`GitHub token invalid: ${validation.error}`);
        return;
      }

      const cfg = backupService.getConfig();
      const repoName = await vscode.window.showInputBox({
        prompt: 'Default repository name (leave blank to use project folder name)',
        value: cfg.repoName,
        ignoreFocusOut: true,
      });
      if (repoName === undefined) { return; }

      const privacy = await vscode.window.showQuickPick(['Private (recommended)', 'Public'], {
        placeHolder: 'Repository visibility',
      });
      if (!privacy) { return; }

      await backupService.storeToken(token.trim());
      await backupService.saveConfig({
        username: validation.login || cfg.username,
        repoName: repoName || '',
        private: privacy.startsWith('Private'),
      });

      const setup = await vscode.window.showInformationMessage(
        `Connected as ${validation.login}. Set up a GitHub repo for this project now?`,
        { modal: true }, 'Yes, set it up', 'Later'
      );
      if (setup === 'Yes, set it up') {
        const result = await backupService.setupRepo();
        vscode.window.showInformationMessage(result.message);
      }
    });
  }));

  // redivivus.backupNow — manual commit + push of all project changes
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.backupNow', async () => {
    const connected = await backupService.isConnected();
    if (!connected) {
      const go = await vscode.window.showInformationMessage('GitHub not connected.', 'Connect now');
      if (go) { vscode.commands.executeCommand('redivivus.configureGitHubBackup'); }
      return;
    }
    const msg = await vscode.window.showInputBox({
      prompt: 'Commit message',
      value: `Manual backup — ${new Date().toISOString().slice(0, 10)}`,
      ignoreFocusOut: true,
    });
    if (msg === undefined) { return; }
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Committing to GitHub...', cancellable: false }, async () => {
      const result = await backupService.commitFiles(msg, []);
      vscode.window.showInformationMessage(result.message);
    });
  }));

  // redivivus.setupGitHubRepo — per-project repo creation
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.setupGitHubRepo', async () => {
    const connected = await backupService.isConnected();
    if (!connected) {
      const go = await vscode.window.showInformationMessage('Connect GitHub first.', 'Connect');
      if (go) { vscode.commands.executeCommand('redivivus.configureGitHubBackup'); }
      return;
    }
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Creating GitHub repo...', cancellable: false }, async () => {
      const result = await backupService.setupRepo();
      vscode.window.showInformationMessage(result.message);
    });
  }));

  // redivivus.githubCommitFiles — called by commit button in fix/build result cards
  // files: string[] of relative paths written by Redivivus; message: commit summary; webview: to post result back
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.githubCommitFiles', async (files: string[], message: string, webview?: vscode.Webview) => {
    const connected = await backupService.isConnected();
    if (!connected) {
      const go = await vscode.window.showInformationMessage('GitHub not connected. Connect now?', 'Connect');
      if (go) { vscode.commands.executeCommand('redivivus.configureGitHubBackup'); }
      webview?.postMessage({ type: 'github-commit-result', success: false, message: 'GitHub not connected.' });
      return;
    }
    const result = await backupService.commitFiles(message || 'Redivivus fix', files || []);
    webview?.postMessage({ type: 'github-commit-result', success: result.success, message: result.message });
    if (!webview) { vscode.window.showInformationMessage(result.message); }
  }));
}
