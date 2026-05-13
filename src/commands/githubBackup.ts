// [SCOPE] Registers GitHub backup commands — configure, setup repo, manual backup, toggle auto-backup.

import * as vscode from 'vscode';
import { GitHubBackupService } from '../services/githubBackupService.js';

export function registerGitHubBackupCommands(context: vscode.ExtensionContext, backupService: GitHubBackupService): void {

  // chassis.configureGitHubBackup — interactive setup wizard
  context.subscriptions.push(vscode.commands.registerCommand('chassis.configureGitHubBackup', async () => {
    const cfg = backupService.getConfig();

    const token = await vscode.window.showInputBox({
      prompt: 'GitHub Personal Access Token (needs repo scope)',
      value: cfg.token,
      password: true,
      placeHolder: 'ghp_...',
      ignoreFocusOut: true,
    });
    if (token === undefined) { return; }

    const username = await vscode.window.showInputBox({
      prompt: 'Your GitHub username',
      value: cfg.username,
      ignoreFocusOut: true,
    });
    if (username === undefined) { return; }

    const repoName = await vscode.window.showInputBox({
      prompt: 'Repository name (leave blank to use project folder name)',
      value: cfg.repoName,
      ignoreFocusOut: true,
    });
    if (repoName === undefined) { return; }

    const privacy = await vscode.window.showQuickPick(['Private (recommended)', 'Public'], {
      placeHolder: 'Repository visibility',
    });
    if (!privacy) { return; }

    const interval = await vscode.window.showQuickPick(
      ['Off', 'Every 15 minutes', 'Every 30 minutes', 'Every hour', 'Every build only'],
      { placeHolder: 'Auto-backup frequency' }
    );
    if (!interval) { return; }

    const intervalMap: Record<string, number> = {
      'Off': 0, 'Every 15 minutes': 15, 'Every 30 minutes': 30,
      'Every hour': 60, 'Every build only': 0,
    };

    await backupService.saveConfig({
      enabled: true,
      token,
      username,
      repoName: repoName || '',
      autoBackupOnBuild: interval === 'Every build only' || intervalMap[interval] > 0,
      autoBackupInterval: intervalMap[interval] || 0,
      private: privacy.startsWith('Private'),
    });

    const setup = await vscode.window.showInformationMessage(
      'GitHub backup configured. Set up the remote repository now?',
      { modal: true }, 'Yes, set it up', 'Later'
    );
    if (setup === 'Yes, set it up') {
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Setting up GitHub backup...', cancellable: false }, async () => {
        const result = await backupService.setupRepo();
        vscode.window.showInformationMessage(result.message);
        if (result.success) { backupService.startTimer(); }
      });
    }
  }));

  // chassis.backupNow — manual backup
  context.subscriptions.push(vscode.commands.registerCommand('chassis.backupNow', async () => {
    const cfg = backupService.getConfig();
    if (!cfg.enabled || !cfg.token) {
      const go = await vscode.window.showInformationMessage('GitHub backup not configured.', 'Configure now');
      if (go) { vscode.commands.executeCommand('chassis.configureGitHubBackup'); }
      return;
    }
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Backing up to GitHub...', cancellable: false }, async () => {
      const result = await backupService.backup();
      vscode.window.showInformationMessage(result.message);
    });
  }));

  // chassis.toggleGitHubBackup — quick on/off toggle
  context.subscriptions.push(vscode.commands.registerCommand('chassis.toggleGitHubBackup', async () => {
    const cfg = backupService.getConfig();
    const newEnabled = !cfg.enabled;
    await backupService.saveConfig({ ...cfg, enabled: newEnabled });
    if (newEnabled) { backupService.startTimer(); } else { backupService.stopTimer(); }
    vscode.window.showInformationMessage(`GitHub backup ${newEnabled ? 'enabled ✅' : 'disabled ⏸️'}`);
  }));
}
